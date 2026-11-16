// Tests ADVERSES du cœur du moteur (3/4) : magasins d'entités et services neutres malmenés —
// 5 000 personnes, retraits pendant une itération, entités corrompues, événements du contrat.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  GameContext, InteractionHandler, InteractionOption, Person, Prop, RayHit, Vec2, Vehicle,
} from '@/core/contracts';
import { createContext, getCore } from '@/core/context';
import { makeRayHit } from '@/core/null-services';
import { createRng } from '@/core/rng';
import { DESKTOP_HINTS } from '@/core/settings';
import { createTestContext } from '@/core/testing';

function makeCtx(seed = 1): GameContext {
  return createContext({ headless: true, storage: null, device: DESKTOP_HINTS, seed });
}

function bruteIds(ctx: GameContext, x: number, z: number, r: number, filter?: (p: Person) => boolean): number[] {
  const ids: number[] = [];
  for (const p of ctx.people.list) {
    if (p.dormant) continue;
    const dx = p.x - x;
    const dz = p.z - z;
    if (dx * dx + dz * dz <= r * r && (!filter || filter(p))) ids.push(p.id);
  }
  return ids.sort((a, b) => a - b);
}

const sortedIds = (out: readonly { id: number }[]): number[] => out.map((p) => p.id).sort((a, b) => a - b);

afterEach(() => {
  vi.restoreAllMocks();
});

// ───────────────────────────── personnes ─────────────────────────────

describe('adverse — magasin des personnes', () => {
  it('5 000 personnes : requêtes spatiales exactes (force brute) et mesurées', () => {
    const ctx = makeCtx(11);
    const rng = createRng(11);
    const t0 = performance.now();
    for (let i = 0; i < 5000; i++) {
      // un cortège dense (≈ 2 pers./m²) et des abords clairsemés
      const dense = i < 3500;
      ctx.people.spawn({
        kind: i % 8 === 0 ? 'crs' : 'manifestant',
        x: dense ? rng.range(-15, 15) : rng.range(-300, 300),
        z: dense ? rng.range(-30, 30) : rng.range(-300, 300),
      });
    }
    const spawnMs = performance.now() - t0;
    expect(ctx.people.list.length).toBe(5000);

    // tout le monde bouge, puis l'index est reconstruit comme le fait le moteur à chaque pas
    for (const p of ctx.people.list) {
      p.x += rng.range(-4, 4);
      p.z += rng.range(-4, 4);
    }
    for (let i = 0; i < 5000; i += 50) ctx.people.list[i]!.dormant = true;
    for (let i = 0; i < 200; i++) ctx.people.rebuildIndex(); // échauffement du compilateur
    const t1 = performance.now();
    for (let i = 0; i < 200; i++) ctx.people.rebuildIndex();
    const rebuildMs = (performance.now() - t1) / 200;

    const out: Person[] = [];
    const isPolice = (p: Person): boolean => p.faction === 'police';
    for (let i = 0; i < 150; i++) {
      const x = rng.range(-40, 40);
      const z = rng.range(-60, 60);
      const r = i % 10 === 0 ? rng.range(50, 400) : rng.range(0.5, 12);
      const n = ctx.people.queryRadius(x, z, r, out);
      expect(n).toBe(out.length);
      expect(sortedIds(out)).toEqual(bruteIds(ctx, x, z, r));
      expect(ctx.people.countIn(x, z, r, isPolice)).toBe(bruteIds(ctx, x, z, r, isPolice).length);
      const near = ctx.people.nearest(x, z, r, isPolice);
      const candidates = bruteIds(ctx, x, z, r, isPolice);
      if (candidates.length === 0) expect(near).toBeNull();
      else {
        const best = Math.min(...candidates.map((id) => Math.hypot(ctx.people.get(id)!.x - x, ctx.people.get(id)!.z - z)));
        expect(Math.hypot(near!.x - x, near!.z - z)).toBeCloseTo(best, 9);
      }
    }

    // coût d'une image : chaque personne interroge son voisinage (évitement) puis cherche un policier (perception)
    const list = ctx.people.list;
    let found = 0;
    const t2 = performance.now();
    for (let i = 0; i < list.length; i++) found += ctx.people.queryRadius(list[i]!.x, list[i]!.z, 1.5, out);
    const neighMs = performance.now() - t2;
    const t3 = performance.now();
    let seen = 0;
    for (let i = 0; i < list.length; i++) if (ctx.people.nearest(list[i]!.x, list[i]!.z, 15, isPolice)) seen++;
    const nearMs = performance.now() - t3;
    console.log(
      `[adverse] 5 000 personnes : création ${spawnMs.toFixed(1)} ms | rebuildIndex ${rebuildMs.toFixed(3)} ms | ` +
        `5 000 × queryRadius(1,5 m) ${neighMs.toFixed(2)} ms (${(found / 5000).toFixed(1)} voisins en moyenne) | ` +
        `5 000 × nearest(police, 15 m) ${nearMs.toFixed(2)} ms`,
    );
    expect(found).toBeGreaterThan(5000);
    expect(seen).toBeGreaterThan(1000);
    // seuils très larges : la machine de test est partagée, ces mesures servent surtout à être lues
    expect(rebuildMs).toBeLessThan(10);
    expect(neighMs).toBeLessThan(1500);
    expect(nearMs).toBeLessThan(4000);
  });

  it('une personne retirée disparaît aussitôt des requêtes, sans attendre rebuildIndex', () => {
    const ctx = makeCtx();
    const people: Person[] = [];
    for (let i = 0; i < 400; i++) people.push(ctx.people.spawn({ kind: 'manifestant', x: (i % 20) * 0.6, z: Math.floor(i / 20) * 0.6 }));
    ctx.people.rebuildIndex();
    // elles se déplacent (index pas encore reconstruit), puis une sur trois est retirée
    for (const p of people) p.x += 1.7;
    const out: Person[] = [];
    for (let i = 0; i < people.length; i += 3) ctx.people.remove(people[i]!.id);
    ctx.people.queryRadius(8, 6, 1e6, out);
    expect(out.length).toBe(ctx.people.list.length);
    for (const p of out) expect(ctx.people.get(p.id)).toBe(p);
    // petite requête (parcours des cellules) sur un index pas encore reconstruit : aucune personne retirée
    expect(ctx.people.queryRadius(8, 6, 4, out)).toBeGreaterThan(20);
    for (const p of out) expect(ctx.people.get(p.id)).toBe(p);
    expect(ctx.people.nearest(people[0]!.x, people[0]!.z, 0.01)).toBeNull();
    expect(ctx.people.countIn(people[3]!.x, people[3]!.z, 0.01)).toBe(0);
    // une fois l'index reconstruit, la requête est exacte
    ctx.people.rebuildIndex();
    ctx.people.queryRadius(8, 6, 4, out);
    expect(sortedIds(out)).toEqual(bruteIds(ctx, 8, 6, 4));
    // les nouvelles venues réutilisent les emplacements libérés sans se mélanger aux anciennes
    const fresh = ctx.people.spawn({ kind: 'crs', x: 500, z: 500 });
    expect(ctx.people.nearest(500, 500, 1)).toBe(fresh);
    expect(ctx.people.countIn(500, 500, 1)).toBe(1);
  });

  it('retirer pendant l\'itération de la liste, depuis person:removed, et depuis le filtre d\'une requête', () => {
    const ctx = makeCtx();
    const removedEvents: number[] = [];
    ctx.events.on('person:removed', (e) => removedEvents.push(e.id));
    const all: Person[] = [];
    for (let i = 0; i < 200; i++) all.push(ctx.people.spawn({ kind: 'manifestant', x: i % 20, z: Math.floor(i / 20) }));

    // 1. boucle à rebours avec retrait d'un sur deux (idiome recommandé pour un tableau dense)
    const list = ctx.people.list;
    for (let i = list.length - 1; i >= 0; i--) if (list[i]!.id % 2 === 0) ctx.people.remove(list[i]!.id);
    expect(list.length).toBe(100);
    expect(list.every((p) => p.id % 2 === 1)).toBe(true);
    expect(new Set(list).size).toBe(100);
    for (const p of list) expect(ctx.people.get(p.id)).toBe(p);

    // 2. cascade : le retrait d'une personne en retire une autre et en crée une troisième, depuis l'événement
    const a = list[0]!;
    const b = list[50]!;
    let cascade = true;
    let spawned: Person | null = null;
    const off = ctx.events.on('person:removed', (e) => {
      if (e.id === a.id && cascade) {
        cascade = false;
        expect(ctx.people.get(a.id)).toBe(a); // encore lisible le temps de l'événement
        ctx.people.remove(a.id); // réentrant sur la même : sans effet
        ctx.people.remove(b.id);
        spawned = ctx.people.spawn({ kind: 'samu', x: a.x, z: a.z });
      }
    });
    removedEvents.length = 0;
    ctx.people.remove(a.id);
    off();
    expect(removedEvents.sort((x, y) => x - y)).toEqual([a.id, b.id].sort((x, y) => x - y)); // une fois chacun
    expect(ctx.people.get(a.id)).toBeUndefined();
    expect(ctx.people.get(b.id)).toBeUndefined();
    expect(spawned).not.toBeNull();
    expect(list.length).toBe(99);
    expect(new Set(list.map((p) => p.id)).size).toBe(99);
    for (const p of list) expect(ctx.people.get(p.id)).toBe(p);
    expect(list).toContain(spawned);

    // 3. retrait depuis le filtre d'une requête spatiale : ni exception, ni fantôme, ni oubli
    const out: Person[] = [];
    const seen: Person[] = [];
    expect(() =>
      ctx.people.queryRadius(10, 5, 6, out, (p) => {
        seen.push(p);
        expect(ctx.people.get(p.id)).toBe(p); // jamais une personne déjà retirée
        if (p.id % 3 === 0) {
          ctx.people.remove(p.id);
          return false;
        }
        return true;
      }),
    ).not.toThrow();
    expect(new Set(seen).size).toBe(seen.length);
    for (const p of out) expect(ctx.people.get(p.id)).toBe(p);
    expect(sortedIds(out)).toEqual(bruteIds(ctx, 10, 5, 6)); // tous les survivants du disque, et eux seuls
    ctx.people.queryRadius(0, 0, 1e6, out);
    expect(out.length).toBe(list.length);
  });

  it('retraits en masse : 5 000 retraits un à un, et clear() de milliers de membres d\'une même unité, à coût linéaire', () => {
    const rng = createRng(4);
    /** Meilleure de deux mesures (machine de test partagée). */
    const best = (run: () => number): number => Math.min(run(), run());

    // 1. retraits un à un, après un pas de déplacement
    const removeAll = (n: number): number => {
      const ctx = makeCtx();
      for (let i = 0; i < n; i++) ctx.people.spawn({ kind: 'manifestant', x: rng.range(-80, 80), z: rng.range(-80, 80) });
      ctx.people.rebuildIndex();
      for (const p of ctx.people.list) p.x += rng.range(-2, 2);
      const ids = ctx.people.list.map((p) => p.id);
      const t0 = performance.now();
      for (let i = 0; i < ids.length; i++) ctx.people.remove(ids[i]!);
      const ms = performance.now() - t0;
      expect(ctx.people.list.length).toBe(0);
      expect(ctx.people.countIn(0, 0, 1e6)).toBe(0);
      return ms;
    };
    removeAll(1000); // échauffement
    const remove5k = best(() => removeAll(5000));
    const remove20k = removeAll(20000);

    // 2. vidage d'un cortège entier rattaché à une seule unité (redémarrage de session)
    const clearSquad = (n: number): number => {
      const ctx = makeCtx();
      const cortege = ctx.squads.create('cortege', 'protest', 'Cortège');
      for (let i = 0; i < n; i++) ctx.people.spawn({ kind: 'manifestant', x: rng.range(-80, 80), z: rng.range(-80, 80), squadId: cortege.id });
      expect(cortege.members.length).toBe(n);
      let events = 0;
      ctx.events.on('person:removed', () => void events++);
      const t0 = performance.now();
      ctx.people.clear();
      const ms = performance.now() - t0;
      expect(events).toBe(n);
      expect(cortege.members.length).toBe(0);
      expect(cortege.leaderId).toBe(0);
      return ms;
    };
    clearSquad(800); // échauffement
    const clear5k = best(() => clearSquad(5000));
    const clear15k = clearSquad(15000);
    console.log(
      `[adverse] people.remove un à un : 5 000 → ${remove5k.toFixed(2)} ms | 20 000 → ${remove20k.toFixed(2)} ms || ` +
        `people.clear() d'une unité : 5 000 membres → ${clear5k.toFixed(2)} ms | 15 000 membres → ${clear15k.toFixed(2)} ms`,
    );
    // Coût linéaire attendu (quelques dizaines de ms). Avec un retrait en temps linéaire, 20 000 retraits
    // dépassent 600 ms et le vidage de 15 000 membres 2 s : les seuils séparent nettement les deux cas,
    // même sur une machine chargée.
    expect(remove20k).toBeLessThan(300);
    expect(clear15k).toBeLessThan(800);
  });

  it('identifiants : uniques toutes catégories confondues et jamais réutilisés pendant une session', () => {
    const ctx = makeCtx();
    const seen = new Set<number>();
    const take = (id: number): void => {
      expect(id).toBeGreaterThan(0);
      expect(seen.has(id)).toBe(false);
      seen.add(id);
    };
    for (let round = 0; round < 30; round++) {
      const p = ctx.people.spawn({ kind: 'crs', x: round, z: 0 });
      const v = ctx.vehicles.spawn('fourgon_crs', round, 5, 0);
      const o = ctx.props.spawn('poubelle', round, 9, 0);
      const s = ctx.props.addShop({ category: 'banque', x: round, z: 20, heading: 0, width: 6 });
      const j = ctx.projectiles.spawn('pave', p.id, round, 1, 0, 0, 0, 0);
      for (const id of [p.id, v.id, o.id, s.id, j.id, ctx.newId()]) take(id);
      // tout est retiré : les identifiants suivants ne doivent pas reprendre ceux-là
      ctx.people.remove(p.id);
      ctx.vehicles.remove(v.id);
      ctx.props.remove(o.id);
      ctx.props.removeShop(s.id);
      ctx.projectiles.remove(j.id);
    }
    expect(seen.size).toBe(180);
  });

  it('spawn avec une position ou un cap invalide : signalé, et la personne reste saine', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ctx = makeCtx();
    const ok = ctx.people.spawn({ kind: 'crs', x: 1, z: 1 });
    const bad = ctx.people.spawn({ kind: 'manifestant', x: Number.NaN, z: Number.POSITIVE_INFINITY, heading: Number.NaN });
    expect(error).toHaveBeenCalled();
    expect(String(error.mock.calls[0]![0])).toMatch(/position/);
    for (const v of [bad.x, bad.z, bad.y, bad.heading, bad.aimYaw, bad.cmd.aimYaw]) expect(Number.isFinite(v)).toBe(true);
    const out: Person[] = [];
    expect(ctx.people.queryRadius(1, 1, 0.5, out)).toBe(1);
    expect(out[0]).toBe(ok);
    expect(ctx.people.queryRadius(0, 0, 1e9, out)).toBe(2);
  });

  it('une apparence partielle avec des champs « undefined » ne détruit pas l\'apparence par défaut', () => {
    const ctx = makeCtx();
    const p = ctx.people.spawn({
      kind: 'crs', x: 0, z: 0,
      look: { top: undefined, headgear: undefined, sash: undefined, height: 1.9, backText: 'POLICE' },
    });
    expect(p.look.height).toBe(1.9);
    expect(p.look.backText).toBe('POLICE');
    expect(typeof p.look.top).toBe('number');
    expect(p.look.headgear).toBe('casque_crs');
    expect(p.look.sash).toBe(false);
    for (const [k, v] of Object.entries(p.look)) expect(v, `look.${k}`).not.toBeUndefined();
    // l'inventaire fourni est copié, pas partagé
    const stack = { id: 'bouclier', count: 1, state: 1, cooldown: 0 };
    const q = ctx.people.spawn({ kind: 'crs', x: 0, z: 0, inventory: [stack] });
    q.inventory[0]!.count = 0;
    expect(stack.count).toBe(1);
  });

  it('commandant unique (BRIEF) : le poste de commandement porte l\'écharpe et prononce les sommations', () => {
    const ctx = makeCtx();
    const gardien = ctx.people.spawn({ kind: 'crs', x: 0, z: 0 });
    const commandant = ctx.people.spawn({ kind: 'crs', x: 1, z: 0, rank: 'commandant', poste: 'commandant_unite' });
    const autorite = ctx.people.spawn({ kind: 'crs', x: 2, z: 0, poste: 'autorite_civile' });
    const faux = ctx.people.spawn({ kind: 'manifestant', x: 3, z: 0, look: { sash: true } });
    expect(gardien.look.sash).toBe(false);
    expect(commandant.look.sash).toBe(true); // écharpe tricolore par défaut pour l'autorité habilitée
    expect(autorite.look.sash).toBe(true);
    expect(commandant.look.rankBars).toBe(4);
    expect(ctx.law.sommation(gardien)).toBe(0); // un simple gardien n'est pas habilité
    expect(ctx.law.sommation(faux)).toBe(0); // une écharpe ne suffit pas hors des forces de l'ordre
    expect(ctx.law.sommation(commandant)).toBe(1);
    commandant.look.sash = false; // même sans l'écharpe au rendu, le poste fait foi
    expect(ctx.law.sommation(commandant)).toBe(2);
    expect(ctx.law.sommation(autorite)).toBe(3);
    expect(ctx.law.sommation(commandant)).toBe(3); // plafonné
    expect(ctx.law.roe.lawfulForce).toBe(3);
    // l'ordre du commandant s'applique immédiatement
    ctx.law.authorize(4, commandant.id);
    expect(ctx.law.roe.authorizedForce).toBe(4);
    const s = ctx.squads.create('section', 'police', 'Alpha');
    ctx.squads.issue(s.id, { type: 'charge', issuedBy: commandant.id });
    expect(s.order.maxForce).toBe(4);
    // un niveau hors domaine est borné, pas enregistré tel quel
    ctx.law.authorize(9 as 5, commandant.id);
    expect(ctx.law.roe.authorizedForce).toBe(5);
    ctx.law.authorize(Number.NaN as 0, commandant.id);
    expect(ctx.law.roe.authorizedForce).toBe(5);
  });
});

// ───────────────────────────── événements du contrat ─────────────────────────────

describe('adverse — événements de cycle de vie prévus par le contrat', () => {
  it('projectile:removed, prop:spawned, prop:removed et vehicle:removed sont émis, y compris par clear()', () => {
    const ctx = makeCtx();
    const log: string[] = [];
    ctx.events.on('projectile:spawned', (e) => log.push(`proj+${e.id}`));
    ctx.events.on('projectile:removed', (e) => log.push(`proj-${e.id}`));
    ctx.events.on('prop:spawned', (e) => {
      expect(ctx.props.get(e.id)).toBeDefined(); // déjà consultable pendant l'événement
      log.push(`prop+${e.id}`);
    });
    ctx.events.on('prop:removed', (e) => log.push(`prop-${e.id}`));
    ctx.events.on('vehicle:spawned', (e) => log.push(`veh+${e.id}`));
    ctx.events.on('vehicle:removed', (e) => log.push(`veh-${e.id}`));

    const j1 = ctx.projectiles.spawn('pave', 0, 0, 1, 0, 0, 0, 0);
    const j2 = ctx.projectiles.spawn('molotov', 0, 0, 1, 0, 0, 0, 0);
    const o1 = ctx.props.spawn('poubelle', 0, 0, 0);
    const o2 = ctx.props.spawn('barricade', 5, 0, 0);
    const v1 = ctx.vehicles.spawn('voiture', 20, 0, 0);
    ctx.projectiles.remove(j1.id);
    ctx.projectiles.remove(j1.id); // second retrait : aucun événement
    ctx.props.remove(o1.id);
    ctx.props.remove(o1.id);
    ctx.projectiles.clear();
    ctx.props.clear();
    ctx.vehicles.clear();
    expect(log).toEqual([
      `proj+${j1.id}`, `proj+${j2.id}`, `prop+${o1.id}`, `prop+${o2.id}`, `veh+${v1.id}`,
      `proj-${j1.id}`, `prop-${o1.id}`, `proj-${j2.id}`, `prop-${o2.id}`, `veh-${v1.id}`,
    ]);
  });

  it('un rendu qui suit les événements reste synchronisé avec les listes, même à travers un redémarrage de session', async () => {
    const t = createTestContext();
    const ctx = t.ctx;
    const mirror = { people: new Set<number>(), props: new Set<number>(), vehicles: new Set<number>(), projectiles: new Set<number>() };
    ctx.events.on('person:spawned', (e) => mirror.people.add(e.id));
    ctx.events.on('person:removed', (e) => mirror.people.delete(e.id));
    ctx.events.on('prop:spawned', (e) => mirror.props.add(e.id));
    ctx.events.on('prop:removed', (e) => mirror.props.delete(e.id));
    ctx.events.on('vehicle:spawned', (e) => mirror.vehicles.add(e.id));
    ctx.events.on('vehicle:removed', (e) => mirror.vehicles.delete(e.id));
    ctx.events.on('projectile:spawned', (e) => mirror.projectiles.add(e.id));
    ctx.events.on('projectile:removed', (e) => mirror.projectiles.delete(e.id));
    const check = (): void => {
      expect([...mirror.people].sort()).toEqual(ctx.people.list.map((p) => p.id).sort());
      expect([...mirror.props].sort()).toEqual(ctx.props.list.map((p) => p.id).sort());
      expect([...mirror.vehicles].sort()).toEqual(ctx.vehicles.list.map((p) => p.id).sort());
      expect([...mirror.projectiles].sort()).toEqual(ctx.projectiles.list.map((p) => p.id).sort());
    };
    const rng = createRng(8);
    for (let session = 0; session < 3; session++) {
      await t.start({ seed: session + 1 });
      check(); // le redémarrage a tout vidé, et le rendu l'a su
      for (let i = 0; i < 300; i++) {
        const roll = rng.int(0, 12); // deux créations pour un retrait
        if (roll < 2) ctx.people.spawn({ kind: 'manifestant', x: i, z: 0 });
        else if (roll < 4) ctx.props.spawn('poubelle', i, 2, 0);
        else if (roll < 6) ctx.vehicles.spawn('voiture', i * 6, 9, 0);
        else if (roll < 8) ctx.projectiles.spawn('pave', 0, i, 1, 0, 0, 0, 0);
        else if (roll === 8 && ctx.people.list.length) ctx.people.remove(rng.pick(ctx.people.list).id);
        else if (roll === 9 && ctx.props.list.length) ctx.props.remove(rng.pick(ctx.props.list).id);
        else if (roll === 10 && ctx.vehicles.list.length) ctx.vehicles.remove(rng.pick(ctx.vehicles.list).id);
        else if (roll === 11 && ctx.projectiles.list.length) ctx.projectiles.remove(rng.pick(ctx.projectiles.list).id);
      }
      check();
      expect(mirror.people.size + mirror.props.size + mirror.vehicles.size + mirror.projectiles.size).toBeGreaterThan(20);
    }
  });
});

// ───────────────────────────── décor ─────────────────────────────

describe('adverse — magasin du décor', () => {
  it('raycast : le mode « sight » traverse ce qui ne bloque que le passage, le mode « move » ce qui ne bloque que la vue', () => {
    const ctx = makeCtx();
    const hit: RayHit = makeRayHit();
    const poubelle = ctx.props.spawn('poubelle', 5, 0, 0); // bloque le passage, pas la vue
    const kiosque = ctx.props.spawn('kiosque', 12, 0, 0); // bloque les deux
    expect(poubelle.blocksMove && !poubelle.blocksSight).toBe(true);
    expect(kiosque.blocksMove && kiosque.blocksSight).toBe(true);
    // défaut : les deux comptent → la poubelle d'abord
    expect(ctx.props.raycast(0, 0, 20, 0, hit)).toBe(true);
    expect(hit.id).toBe(poubelle.id);
    expect(ctx.props.raycast(0, 0, 20, 0, hit, 'move')).toBe(true);
    expect(hit.id).toBe(poubelle.id);
    // vue : on voit par-dessus la poubelle, le kiosque arrête le regard
    expect(ctx.props.raycast(0, 0, 20, 0, hit, 'sight')).toBe(true);
    expect(hit.id).toBe(kiosque.id);
    expect(hit.kind).toBe('prop');
    expect(hit.x).toBeCloseTo(12 - kiosque.halfX, 6);
    expect(hit.height).toBe(kiosque.height);
    // un écran de fumée artificiel : bloque la vue sans gêner le passage
    kiosque.blocksMove = false;
    ctx.props.remove(poubelle.id);
    expect(ctx.props.raycast(0, 0, 20, 0, hit, 'move')).toBe(false);
    expect(hit.hit).toBe(false);
    expect(hit.t).toBe(1);
    expect(ctx.props.raycast(0, 0, 20, 0, hit, 'sight')).toBe(true);
    expect(ctx.props.raycast(0, 0, 20, 0, hit)).toBe(true);
    // segment de longueur nulle, dans et hors d'un objet : pas d'exception, réponse cohérente
    expect(ctx.props.raycast(12, 0, 12, 0, hit)).toBe(true);
    expect(ctx.props.raycast(30, 30, 30, 30, hit)).toBe(false);
  });

  it('un objet qui grossit après sa création (barricade) reste trouvé par les requêtes et les collisions', () => {
    const t = createTestContext();
    const ctx = t.ctx;
    const b = ctx.props.spawn('poubelle', 0, 0, 0);
    // la barricade s'étend : 10 m de large, bien plus que le gabarit d'origine (0,22 m)
    b.halfX = 5;
    b.halfZ = 0.6;
    b.kind = 'barricade';
    const out: Prop[] = [];
    const pos: Vec2 = { x: 4.5, z: 0.7 };
    const hit = makeRayHit();
    expect(ctx.props.queryRadius(4.5, 1, 0.5, out)).toBe(1);
    expect(ctx.props.resolveCircle(pos, 0.3)).toBe(true);
    expect(pos.z).toBeCloseTo(0.9, 6);
    expect(ctx.props.raycast(4.5, 5, 4.5, -5, hit, 'move')).toBe(true);
    expect(hit.z).toBeCloseTo(0.6, 6);
    // et après un redémarrage de session, rien ne subsiste de l'ancienne emprise
    return t.start().then(() => {
      expect(ctx.props.list.length).toBe(0);
      const p2: Vec2 = { x: 4.5, z: 0.7 };
      expect(ctx.props.resolveCircle(p2, 0.3)).toBe(false);
      expect(ctx.props.queryRadius(0, 0, 100, out)).toBe(0);
    });
  });

  it('un objet corrompu (NaN) ne contamine pas les personnes qui passent à côté', () => {
    const ctx = makeCtx();
    const sain = ctx.props.spawn('conteneur', 3, 0, 0);
    const corrompu = ctx.props.spawn('conteneur', 0.5, 0.5, 0);
    corrompu.x = Number.NaN;
    corrompu.heading = Number.NaN;
    const autre = ctx.props.spawn('conteneur', -1, 0, 0);
    autre.halfX = Number.NaN;
    getCore(ctx).stores.props.rebuildIndex();
    const pos: Vec2 = { x: 0.4, z: 0.4 };
    ctx.props.resolveCircle(pos, 0.3);
    expect(Number.isFinite(pos.x) && Number.isFinite(pos.z)).toBe(true);
    const hit = makeRayHit();
    expect(ctx.props.raycast(0, -3, 0, 3, hit)).toBe(false); // ni l'un ni l'autre ne fait obstacle
    expect(ctx.props.raycast(0, 0, 10, 0, hit)).toBe(true); // l'objet sain, lui, arrête toujours le rayon
    expect(hit.id).toBe(sain.id);
    const out: Prop[] = [];
    ctx.props.queryRadius(0, 0, 1.5, out);
    expect(out).not.toContain(corrompu);
    expect(out).not.toContain(autre);
  });

  it('push : vitesse bornée, direction ou force invalides ignorées, glissade qui s\'arrête', () => {
    const t = createTestContext();
    const ctx = t.ctx;
    return t.start().then(() => {
      const p = ctx.props.spawn('poubelle', 0, 0, 0);
      for (let i = 0; i < 1000; i++) ctx.props.push(p, 1, 0, 50, 0); // 1 000 poussées dans la même image
      expect(Math.hypot(p.vx, p.vz)).toBeLessThanOrEqual(15);
      ctx.props.push(p, Number.NaN, 0, 5, 0);
      ctx.props.push(p, 0, 0, 5, 0);
      ctx.props.push(p, 1, 0, Number.NaN, 0);
      ctx.props.push(p, 1, 0, Number.POSITIVE_INFINITY, 0);
      expect(Number.isFinite(p.vx) && Number.isFinite(p.vz)).toBe(true);
      t.step(10);
      expect(p.vx === 0 && p.vz === 0).toBe(true);
      expect(Number.isFinite(p.x) && p.x > 0 && p.x < 40).toBe(true);
      // un objet devenu fou (vitesse NaN) est immobilisé au lieu de se perdre
      p.vx = Number.NaN;
      const x = p.x;
      t.step(0.2);
      expect(p.x).toBe(x);
      expect(p.vx).toBe(0);
      // l'objet déplacé est retrouvé là où il est maintenant
      const out: Prop[] = [];
      expect(ctx.props.queryRadius(p.x, p.z, 0.1, out)).toBe(1);
      expect(ctx.props.queryRadius(0, 0, 0.1, out)).toBe(0);
    });
  });
});

// ───────────────────────────── véhicules ─────────────────────────────

describe('adverse — magasin des véhicules', () => {
  it('un véhicule corrompu (NaN) ne pousse personne, ne bouche aucune ligne de vue, n\'apparaît dans aucune requête', () => {
    const ctx = makeCtx();
    const sain = ctx.vehicles.spawn('fourgon_crs', 10, 0, Math.PI / 2);
    const fou = ctx.vehicles.spawn('voiture', 0, 0, 0);
    fou.x = Number.NaN;
    const fou2 = ctx.vehicles.spawn('voiture', 50, 50, 0);
    fou2.heading = Number.NaN;
    // n'importe où sur la carte : aucune poussée parasite
    for (const [x, z] of [[100, 100], [0, 0], [50, 50], [-400, 30]] as const) {
      const pos: Vec2 = { x, z };
      ctx.vehicles.resolveCircle(pos, 0.3);
      expect(pos.x).toBe(x);
      expect(pos.z).toBe(z);
    }
    const hit = makeRayHit();
    expect(ctx.vehicles.raycast(200, 200, 210, 205, hit)).toBe(false);
    expect(hit.hit).toBe(false);
    expect(ctx.vehicles.raycast(0, 0, 20, 0, hit, 'sight')).toBe(true);
    expect(hit.id).toBe(sain.id);
    expect(hit.kind).toBe('vehicle');
    const out: Vehicle[] = [];
    expect(ctx.vehicles.queryRadius(300, 300, 5, out)).toBe(0);
    expect(ctx.vehicles.queryRadius(10, 0, 5, out)).toBe(1);
    // le véhicule sain, cap à l'est : sa longueur est le long de x
    const front: Vec2 = { x: 10 + sain.def.length / 2 + 0.1, z: 0 };
    expect(ctx.vehicles.resolveCircle(front, 0.3)).toBe(true);
    expect(front.x).toBeCloseTo(10 + sain.def.length / 2 + 0.3, 6);
    const side: Vec2 = { x: 10, z: sain.def.width / 2 + 0.1 };
    expect(ctx.vehicles.resolveCircle(side, 0.3)).toBe(true);
    expect(side.z).toBeCloseTo(sain.def.width / 2 + 0.3, 6);
  });

  it('retraits croisés : véhicule retiré avec des occupants que leurs abonnés retirent à leur tour', () => {
    const ctx = makeCtx();
    const v = ctx.vehicles.spawn('fourgon_crs', 0, 0, 0);
    const crew: Person[] = [];
    for (let i = 0; i < 4; i++) {
      const p = ctx.people.spawn({ kind: 'crs', x: 0, z: 0 });
      expect(ctx.vehicles.enter(p, v)).toBe(true);
      crew.push(p);
    }
    // à chaque descente forcée, l'occupant est retiré du jeu (ex. : fin de mission)
    ctx.events.on('vehicle:exited', (e) => ctx.people.remove(e.personId));
    expect(() => ctx.vehicles.remove(v.id)).not.toThrow();
    expect(ctx.vehicles.list.length).toBe(0);
    expect(ctx.people.list.length).toBe(0);
    for (const p of crew) {
      expect(p.vehicleId).toBe(0);
      expect(p.seat).toBe(-1);
    }
    // monter dans un véhicule disparu, ou sortir deux fois : refusé proprement
    const p = ctx.people.spawn({ kind: 'crs', x: 0, z: 0 });
    expect(ctx.vehicles.enter(p, v)).toBe(false);
    expect(ctx.vehicles.exit(p)).toBe(false);
    // une personne retirée libère son siège ; le siège est réattribuable
    const w = ctx.vehicles.spawn('voiture', 30, 0, 0);
    expect(ctx.vehicles.enter(p, w, 'driver')).toBe(true);
    const seat = p.seat;
    ctx.people.remove(p.id);
    expect(w.seats[seat]).toBe(0);
    const q = ctx.people.spawn({ kind: 'crs', x: 0, z: 0 });
    expect(ctx.vehicles.enter(q, w, 'driver')).toBe(true);
    expect(q.seat).toBe(seat);
    // siège hors bornes, rôle inexistant, véhicule plein
    expect(ctx.vehicles.enter(ctx.people.spawn({ kind: 'crs', x: 0, z: 0 }), w, 99)).toBe(false);
    expect(ctx.vehicles.enter(ctx.people.spawn({ kind: 'crs', x: 0, z: 0 }), w, -1)).toBe(false);
    expect(ctx.vehicles.enter(ctx.people.spawn({ kind: 'crs', x: 0, z: 0 }), w, 'gunner')).toBe(false);
    expect(ctx.vehicles.enter(ctx.people.spawn({ kind: 'crs', x: 0, z: 0 }), w, 1.5)).toBe(false);
  });
});

// ───────────────────────────── services neutres ─────────────────────────────

describe('adverse — services neutres', () => {
  it('santé : la source d\'une mise à terre est transmise ; des dégâts absurdes ne corrompent pas la santé', () => {
    const ctx = makeCtx();
    const downs: { id: number; sourceId: number }[] = [];
    ctx.events.on('person:down', (e) => downs.push({ id: e.id, sourceId: e.sourceId }));
    const a = ctx.people.spawn({ kind: 'manifestant', x: 0, z: 0 });
    const b = ctx.people.spawn({ kind: 'crs', x: 1, z: 0 });
    ctx.health.setDown(a, true, b.id);
    expect(downs).toEqual([{ id: a.id, sourceId: b.id }]);
    ctx.health.setDown(a, true, b.id); // déjà à terre : pas de second événement
    expect(downs.length).toBe(1);
    ctx.health.setDown(a, false);
    expect(a.posture).toBe('stand');
    const base = { kind: 'blunt' as const, sourceId: b.id, x: 0, z: 0 };
    for (const amount of [Number.NaN, -50, 0]) {
      ctx.health.hurt(a, { ...base, amount });
      expect(a.health).toBe(100);
    }
    ctx.health.hurt(a, { ...base, amount: Number.POSITIVE_INFINITY, stun: Number.NaN });
    expect(a.health).toBe(0);
    expect(Number.isFinite(a.stun)).toBe(true);
    expect(a.posture).toBe('down');
    expect(downs[1]).toEqual({ id: a.id, sourceId: b.id });
    ctx.health.heal(a, Number.POSITIVE_INFINITY, b.id);
    expect(a.health).toBe(100);
    ctx.health.heal(a, Number.NaN, b.id);
    expect(a.health).toBe(100);
    expect(ctx.health.isIncapacitated(a)).toBe(true); // toujours à terre tant qu'on ne la relève pas
    ctx.health.setDown(a, false);
    expect(ctx.health.isIncapacitated(a)).toBe(false);
  });

  it('interactions : startVerb transmet la cible au gestionnaire ; cascades et disparitions pendant la mise à jour', async () => {
    const t = createTestContext();
    const ctx = t.ctx;
    await t.start();
    const actor = ctx.people.spawn({ kind: 'crs', x: 0, z: 0 });
    const near = ctx.people.spawn({ kind: 'manifestant', x: 1, z: 0 });
    const far = ctx.people.spawn({ kind: 'manifestant', x: 1.8, z: 0 });
    const asked: (number | undefined)[] = [];
    const log: string[] = [];
    const option = (target: Person, duration: number): InteractionOption => ({
      verb: 'menotter', targetKind: 'person', targetId: target.id, label: 'Menotter', priority: 1, duration, x: target.x, z: target.z,
    });
    const handler: InteractionHandler = {
      verb: 'menotter',
      find(a: Person, targetId?: number): InteractionOption | null {
        asked.push(targetId);
        if (targetId !== undefined) {
          const target = ctx.people.get(targetId);
          return target && Math.hypot(target.x - a.x, target.z - a.z) < 2 ? option(target, 1) : null;
        }
        return option(near, 1); // sans cible imposée : la plus proche
      },
      begin: () => true,
      complete: (a, opt) => {
        log.push(`fait:${a.id}→${opt.targetId}`);
      },
      cancel: (a) => void log.push(`annulé:${a.id}`),
    };
    ctx.interactions.register(handler);
    // l'IA demande la cible ÉLOIGNÉE : le gestionnaire doit la recevoir, sinon il proposerait la plus proche
    expect(ctx.interactions.startVerb(actor, 'menotter', far.id)).toBe(true);
    expect(asked).toEqual([far.id]);
    expect(ctx.interactions.current(actor)!.opt.targetId).toBe(far.id);
    expect(ctx.interactions.startVerb(actor, 'menotter', 99999)).toBe(false);

    // pendant la mise à jour : l'achèvement de l'une annule une autre interaction, déjà traitée ou non
    const second = ctx.people.spawn({ kind: 'crs', x: 0.5, z: 0 });
    const third = ctx.people.spawn({ kind: 'crs', x: 0.5, z: 0.5 });
    const chain: InteractionHandler = {
      verb: 'soigner',
      find: () => null,
      begin: () => true,
      tick: (a) => {
        log.push(`tick:${a.id}`);
        return true;
      },
      complete: (a) => {
        log.push(`soigné:${a.id}`);
        ctx.interactions.cancel(actor); // annule une AUTRE interaction depuis un achèvement
      },
      cancel: (a) => void log.push(`annulé:${a.id}`),
    };
    ctx.interactions.register(chain);
    const soin = (target: Person, duration: number): InteractionOption => ({ ...option(target, duration), verb: 'soigner' });
    expect(ctx.interactions.start(second, soin(near, 0.1))).toBe(true);
    expect(ctx.interactions.start(third, soin(near, 5))).toBe(true);
    log.length = 0;
    expect(() => t.step(0.5, 0.05)).not.toThrow(); // 10 pas
    // chaque interaction n'avance qu'UNE fois par pas, même quand la liste est remaniée en cours de route
    expect(log.filter((l) => l === `tick:${third.id}`).length).toBe(10);
    expect(ctx.interactions.current(third)!.elapsed).toBeCloseTo(0.5, 9);
    expect(log.filter((l) => l === `tick:${second.id}`).length).toBe(2);
    expect(log.filter((l) => l === `soigné:${second.id}`).length).toBe(1);
    expect(log.filter((l) => l === `annulé:${actor.id}`).length).toBe(1);
    expect(ctx.interactions.current(actor)).toBeNull();
    expect(ctx.interactions.current(second)).toBeNull();
    // un acteur retiré du jeu en pleine interaction : annulée une seule fois, au pas suivant
    ctx.people.remove(third.id);
    t.step(0.2, 0.05);
    expect(log.filter((l) => l === `annulé:${third.id}`).length).toBe(1);
    expect(ctx.interactions.current(third)).toBeNull();
    // un gestionnaire qui plante dans tick() : l'interaction est abandonnée, signalée, et le jeu continue
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    ctx.interactions.register({
      verb: 'pousser',
      find: () => null,
      begin: () => true,
      tick: () => {
        throw new Error('gestionnaire défaillant');
      },
      complete: () => {},
    });
    expect(ctx.interactions.start(second, { ...option(near, 3), verb: 'pousser' })).toBe(true);
    expect(() => t.step(0.2, 0.05)).not.toThrow();
    expect(error).toHaveBeenCalledTimes(1);
    expect(ctx.interactions.current(second)).toBeNull();
  });

  it('droit : le journal des témoins ne retient personne ; environnement : rien ne survit au redémarrage', async () => {
    const t = createTestContext();
    const ctx = t.ctx;
    await t.start();
    const casseur = ctx.people.spawn({ kind: 'manifestant', x: 0, z: 0 });
    const agent = ctx.people.spawn({ kind: 'crs', x: 5, z: 0 });
    const o = ctx.law.recordOffense(casseur, 'degradation', 0, 0);
    expect(o.witnessed).toBe(true);
    expect(ctx.law.recordOffense(agent, 'violence', 5, 0).witnessed).toBe(false); // on n'est pas témoin de soi-même
    agent.posture = 'down';
    expect(ctx.law.recordOffense(casseur, 'tag', 0, 0).witnessed).toBe(false);
    expect(ctx.law.recordOffense(casseur, 'tag', Number.NaN, 0).witnessed).toBe(false);
    ctx.env.setWind(4, -2);
    ctx.env.setClockScale(60);
    ctx.env.setTime(23.5);
    ctx.env.setWeather('orage');
    ctx.radio.say({ channel: 'unite', from: 'Alpha', text: 'Reçu.', priority: 1 });
    ctx.law.reportForce(agent, 'baton', casseur, 0, 0);
    await t.start({ timeOfDay: 9, weather: 'pluie' });
    expect([ctx.env.state.windX, ctx.env.state.windZ, ctx.env.state.clockScale]).toEqual([0, 0, 1]);
    expect(ctx.env.state.timeOfDay).toBe(9);
    expect(ctx.env.state.weather).toBe('pluie');
    expect(ctx.radio.log.length).toBe(0);
    expect(ctx.law.forceLog.length).toBe(0);
    expect(ctx.law.roe.sommation).toBe(0);
  });
});
