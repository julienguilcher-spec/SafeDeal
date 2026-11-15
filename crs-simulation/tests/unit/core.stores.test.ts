import { describe, expect, it } from 'vitest';
import type { GameContext, Person, PersonKind } from '@/core/contracts';
import { createContext, getCore } from '@/core/context';
import { DESKTOP_HINTS } from '@/core/settings';
import { PERSON_RADIUS, defaultFactionOf, rankLevel } from '@/core/stores';

function makeCtx(seed = 1): GameContext {
  return createContext({ headless: true, storage: null, device: DESKTOP_HINTS, seed });
}

const ALL_KINDS: PersonKind[] = [
  'crs', 'commissaire', 'bravm', 'gendarme', 'policier_civil', 'telepilote', 'pompier', 'samu',
  'manifestant', 'street_medic', 'journaliste', 'observateur', 'passant', 'touriste', 'commercant',
  'conducteur', 'vip',
];

/** Toutes les clés de l'interface Person : une personne créée doit toutes les définir. */
const PERSON_KEYS = [
  'id', 'kind', 'faction', 'name', 'x', 'z', 'y', 'vx', 'vz', 'heading', 'aimYaw', 'aimPitch', 'radius',
  'speedWalk', 'speedRun', 'speedSprint', 'health', 'injury', 'stamina', 'gas', 'stun', 'burning', 'wet',
  'posture', 'upper', 'upperT', 'armorHead', 'armorBody', 'gasProtection', 'fear', 'anger', 'profile', 'rank',
  'poste', 'rio', 'inventory', 'active', 'alt', 'look', 'squadId', 'vehicleId', 'seat', 'carrying', 'heldBy',
  'offenses', 'custody', 'isPlayer', 'cmd', 'brain', 'dormant',
];
const LOOK_KEYS = [
  'height', 'build', 'skin', 'hair', 'hairStyle', 'top', 'bottom', 'shoes', 'outfit', 'headgear', 'visorDown',
  'gasMask', 'faceCover', 'backText', 'sash', 'armband', 'vest', 'rankBars', 'backpack',
];
const CMD_KEYS = ['moveX', 'moveZ', 'gait', 'aimYaw', 'aimPitch', 'faceMove', 'crouch', 'jump'];

describe('magasin des personnes — spawn', () => {
  it('toutes les valeurs par défaut d\'une Person sont définies et cohérentes, pour chaque type', () => {
    const ctx = makeCtx();
    for (const kind of ALL_KINDS) {
      const p = ctx.people.spawn({ kind, x: 10, z: -5, heading: 1.2 });
      const rec = p as unknown as Record<string, unknown>;
      for (const key of PERSON_KEYS) expect(rec[key], `${kind}.${key}`).not.toBeUndefined();
      for (const key of LOOK_KEYS) expect((p.look as unknown as Record<string, unknown>)[key], `${kind}.look.${key}`).not.toBeUndefined();
      for (const key of CMD_KEYS) expect((p.cmd as unknown as Record<string, unknown>)[key], `${kind}.cmd.${key}`).not.toBeUndefined();

      expect(p.id).toBeGreaterThan(0);
      expect(p.kind).toBe(kind);
      expect(p.faction).toBe(defaultFactionOf(kind));
      expect(p.name.length).toBeGreaterThan(0);
      expect([p.x, p.z, p.y]).toEqual([10, -5, 0]);
      expect([p.vx, p.vz]).toEqual([0, 0]);
      expect([p.heading, p.aimYaw, p.cmd.aimYaw]).toEqual([1.2, 1.2, 1.2]);
      expect(p.radius).toBe(PERSON_RADIUS);
      expect([p.speedWalk, p.speedRun, p.speedSprint]).toEqual([1.4, 3.2, 5.5]);
      expect([p.health, p.stamina]).toEqual([100, 100]);
      expect(p.injury).toBe('none');
      expect([p.gas, p.stun, p.burning, p.wet, p.fear, p.anger, p.upperT]).toEqual([0, 0, 0, 0, 0, 0, 0]);
      expect(p.posture).toBe('stand');
      expect(p.upper).toBe('none');
      expect(p.inventory).toEqual([]);
      expect(p.active).toBe(-1);
      expect(p.alt).toBe(false);
      expect([p.squadId, p.vehicleId, p.seat, p.carrying, p.heldBy]).toEqual([0, 0, -1, 0, 0]);
      expect(p.offenses).toEqual([]);
      expect(p.custody).toBe('free');
      expect(p.isPlayer).toBe(false);
      expect(p.dormant).toBe(false);
      expect(p.brain).toBeNull();
      expect(p.cmd).toEqual({ moveX: 0, moveZ: 0, gait: 0, aimYaw: 1.2, aimPitch: 0, faceMove: true, crouch: false, jump: false });

      // apparence dans les bornes du contrat
      expect(p.look.height).toBeGreaterThanOrEqual(1.5);
      expect(p.look.height).toBeLessThanOrEqual(1.98);
      expect(p.look.build).toBeGreaterThanOrEqual(0.85);
      expect(p.look.build).toBeLessThanOrEqual(1.25);
      for (const c of [p.look.skin, p.look.hair, p.look.top, p.look.bottom, p.look.shoes]) {
        expect(Number.isInteger(c)).toBe(true);
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(0xffffff);
      }
      expect(p.look.gasMask).toBe(false);
      expect(p.gasProtection).toBe(0);
      expect(p.armorHead).toBeGreaterThanOrEqual(0);
      expect(p.armorHead).toBeLessThanOrEqual(1);

      // cohérence police / hors police
      if (p.faction === 'police') {
        expect(p.rank).not.toBeNull();
        expect(p.rio).toMatch(/^\d{7}$/);
        expect(p.look.backpack).toBe(false);
      } else {
        expect(p.rank).toBeNull();
        expect(p.rio).toBe('');
        expect(p.look.rankBars).toBe(0);
      }
    }
  });

  it('tenues cohérentes avec le type', () => {
    const ctx = makeCtx();
    const crs = ctx.people.spawn({ kind: 'crs', x: 0, z: 0 });
    expect([crs.look.outfit, crs.look.headgear, crs.look.backText]).toEqual(['crs_mo', 'casque_crs', 'CRS']);
    expect(crs.armorHead).toBeGreaterThan(0.5);
    const com = ctx.people.spawn({ kind: 'commissaire', x: 0, z: 0 });
    expect(com.look.sash).toBe(true); // écharpe tricolore
    expect([com.rank, com.poste]).toEqual(['commissaire', 'autorite_civile']);
    const gm = ctx.people.spawn({ kind: 'gendarme', x: 0, z: 0 });
    expect([gm.look.outfit, gm.look.backText]).toEqual(['gendarme_mo', 'GENDARMERIE']);
    const jr = ctx.people.spawn({ kind: 'journaliste', x: 0, z: 0 });
    expect([jr.faction, jr.look.backText]).toEqual(['press', 'PRESSE']);
    const man = ctx.people.spawn({ kind: 'manifestant', x: 0, z: 0 });
    expect([man.faction, man.look.outfit, man.look.sash]).toEqual(['protest', 'civil', false]);
    expect(man.profile).toBeNull();
  });

  it('les options de PersonInit sont respectées', () => {
    const ctx = makeCtx();
    const stack = { id: 'pave', count: 3, state: 1, cooldown: 0 };
    const p = ctx.people.spawn({
      kind: 'manifestant', x: 1, z: 2, faction: 'civil', name: 'Camille', profile: 'radical',
      look: { top: 0x112233, faceCover: true, headgear: 'cagoule' }, inventory: [stack], seed: 77,
    });
    expect(p.faction).toBe('civil');
    expect(p.name).toBe('Camille');
    expect(p.profile).toBe('radical');
    expect(p.look.top).toBe(0x112233);
    expect(p.look.faceCover).toBe(true);
    expect(p.look.headgear).toBe('cagoule');
    expect(p.look.outfit).toBe('civil'); // le reste de l'apparence est conservé
    expect(p.inventory).toEqual([stack]);
    expect(p.inventory[0]).not.toBe(stack); // copie : l'inventaire n'est pas partagé
    const cop = ctx.people.spawn({ kind: 'crs', x: 0, z: 0, rank: 'brigadier_chef', poste: 'lanceur' });
    expect([cop.rank, cop.poste, cop.look.rankBars]).toEqual(['brigadier_chef', 'lanceur', 3]);
    const noRank = ctx.people.spawn({ kind: 'crs', x: 0, z: 0, rank: null });
    expect(noRank.rank).toBeNull();
  });

  it('apparence déterministe : même graine → même apparence ; variété entre personnes', () => {
    const a = makeCtx(5);
    const b = makeCtx(5);
    const c = makeCtx(6);
    const pa = a.people.spawn({ kind: 'manifestant', x: 0, z: 0 });
    const pb = b.people.spawn({ kind: 'manifestant', x: 0, z: 0 });
    const pc = c.people.spawn({ kind: 'manifestant', x: 0, z: 0 });
    expect(pa.look).toEqual(pb.look);
    expect(pa.look).not.toEqual(pc.look); // autre graine de session
    // graine explicite : indépendante de la session et de l'identifiant
    const s1 = a.people.spawn({ kind: 'passant', x: 0, z: 0, seed: 1234 });
    const s2 = c.people.spawn({ kind: 'passant', x: 9, z: 9, seed: 1234 });
    expect(s1.look).toEqual(s2.look);
    // variété
    const heights = new Set<number>();
    const tops = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const p = a.people.spawn({ kind: 'manifestant', x: i, z: 0 });
      heights.add(p.look.height);
      tops.add(p.look.top);
    }
    expect(heights.size).toBeGreaterThan(150);
    expect(tops.size).toBeGreaterThan(10);
    // créer des personnes ne consomme pas le générateur principal
    const fresh = makeCtx(5);
    expect(a.rng.next()).toBe(fresh.rng.next());
  });

  it('l\'altitude vient du monde', () => {
    const ctx = makeCtx();
    ctx.world = { ...ctx.world, heightAt: (x: number, z: number) => x * 0.1 + z };
    const p = ctx.people.spawn({ kind: 'passant', x: 20, z: 3 });
    expect(p.y).toBeCloseTo(5, 12);
  });
});

describe('magasin des personnes — liste, retrait, événements', () => {
  it('identifiants uniques, get, liste dense, événements spawned/removed', () => {
    const ctx = makeCtx();
    const log: string[] = [];
    ctx.events.on('person:spawned', (e) => log.push('+' + e.id));
    ctx.events.on('person:removed', (e) => log.push('-' + e.id));
    const a = ctx.people.spawn({ kind: 'crs', x: 0, z: 0 });
    const b = ctx.people.spawn({ kind: 'crs', x: 1, z: 0 });
    const c = ctx.people.spawn({ kind: 'crs', x: 2, z: 0 });
    expect(new Set([a.id, b.id, c.id]).size).toBe(3);
    expect(ctx.people.list.length).toBe(3);
    expect(ctx.people.get(b.id)).toBe(b);
    expect(ctx.people.get(9999)).toBeUndefined();

    ctx.people.remove(a.id);
    expect(ctx.people.list.length).toBe(2);
    expect(ctx.people.get(a.id)).toBeUndefined();
    expect(ctx.people.list.includes(a)).toBe(false);
    expect(new Set(ctx.people.list)).toEqual(new Set([b, c]));
    ctx.people.remove(a.id); // déjà retiré : sans effet
    ctx.people.remove(424242);
    expect(log).toEqual(['+' + a.id, '+' + b.id, '+' + c.id, '-' + a.id]);

    ctx.people.remove(c.id); // dernier de la liste
    ctx.people.remove(b.id);
    expect(ctx.people.list.length).toBe(0);
    expect(log.slice(4)).toEqual(['-' + c.id, '-' + b.id]);
  });

  it('pendant person:removed, get(id) renvoie encore la personne, déjà sortie de la liste', () => {
    const ctx = makeCtx();
    const p = ctx.people.spawn({ kind: 'manifestant', x: 4, z: 4 });
    let seen: Person | undefined;
    let inList = true;
    let inIndex = 1;
    ctx.events.on('person:removed', (e) => {
      seen = ctx.people.get(e.id);
      inList = ctx.people.list.includes(p);
      inIndex = ctx.people.countIn(4, 4, 1);
      ctx.people.remove(e.id); // appel ré-entrant : sans effet, pas de boucle
    });
    ctx.people.remove(p.id);
    expect(seen).toBe(p);
    expect(inList).toBe(false);
    expect(inIndex).toBe(0);
    expect(ctx.people.get(p.id)).toBeUndefined();
  });

  it('clear vide tout et émet person:removed pour chacun', () => {
    const ctx = makeCtx();
    for (let i = 0; i < 20; i++) ctx.people.spawn({ kind: 'passant', x: i, z: 0 });
    let removed = 0;
    ctx.events.on('person:removed', () => removed++);
    ctx.people.clear();
    expect(removed).toBe(20);
    expect(ctx.people.list.length).toBe(0);
    expect(ctx.people.countIn(0, 0, 1000)).toBe(0);
    expect(ctx.people.nearest(0, 0, 1000)).toBeNull();
  });

  it('le retrait défait les liens (siège, portage)', () => {
    const ctx = makeCtx();
    const cop = ctx.people.spawn({ kind: 'crs', x: 0, z: 0 });
    const held = ctx.people.spawn({ kind: 'manifestant', x: 0.5, z: 0 });
    cop.carrying = held.id;
    held.heldBy = cop.id;
    ctx.people.remove(held.id);
    expect(cop.carrying).toBe(0);

    const a = ctx.people.spawn({ kind: 'crs', x: 0, z: 0 });
    const b = ctx.people.spawn({ kind: 'manifestant', x: 0, z: 0 });
    a.carrying = b.id;
    b.heldBy = a.id;
    ctx.people.remove(a.id);
    expect(b.heldBy).toBe(0);

    const prop = ctx.props.spawn('barriere_vauban', 0, 0, 0);
    const carrier = ctx.people.spawn({ kind: 'manifestant', x: 0, z: 0 });
    carrier.carrying = prop.id;
    prop.carriedBy = carrier.id;
    ctx.people.remove(carrier.id);
    expect(prop.carriedBy).toBe(0);

    const v = ctx.vehicles.spawn('voiture', 10, 10, 0);
    const driver = ctx.people.spawn({ kind: 'conducteur', x: 10, z: 10 });
    expect(ctx.vehicles.enter(driver, v, 'driver')).toBe(true);
    ctx.people.remove(driver.id);
    expect(v.seats[0]).toBe(0);
  });
});

describe('magasin des personnes — index spatial', () => {
  it('une personne est trouvée dès sa création ; rebuildIndex suit les déplacements', () => {
    const ctx = makeCtx();
    const out: Person[] = [];
    const people: Person[] = [];
    for (let i = 0; i < 300; i++) people.push(ctx.people.spawn({ kind: 'manifestant', x: (i % 20) * 2, z: Math.floor(i / 20) * 2 }));
    expect(ctx.people.queryRadius(0, 0, 2.1, out)).toBe(3);
    expect(ctx.people.countIn(19, 14, 100)).toBe(300);
    expect(ctx.people.nearest(4.4, 0.3, 5)).toBe(people[2]);
    expect(ctx.people.nearest(-50, -50, 5)).toBeNull();

    // déplacement de tout le monde
    for (const p of people) p.x += 500;
    ctx.people.rebuildIndex();
    expect(ctx.people.countIn(0, 0, 50)).toBe(0);
    expect(ctx.people.queryRadius(500, 0, 2.1, out)).toBe(3);
    for (const p of out) expect(Math.hypot(p.x - 500, p.z)).toBeLessThanOrEqual(2.1);
  });

  it('filtre des requêtes', () => {
    const ctx = makeCtx();
    for (let i = 0; i < 10; i++) ctx.people.spawn({ kind: i % 2 ? 'crs' : 'manifestant', x: i, z: 0 });
    const police = (p: Person): boolean => p.faction === 'police';
    const out: Person[] = [];
    expect(ctx.people.queryRadius(0, 0, 100, out, police)).toBe(5);
    expect(out.every(police)).toBe(true);
    expect(ctx.people.countIn(0, 0, 100, police)).toBe(5);
    expect(ctx.people.nearest(0, 0, 100, police)!.x).toBe(1);
    expect(ctx.people.nearest(0, 0, 100)!.x).toBe(0);
  });

  it('les personnes endormies (dormant) sortent de l\'index au prochain rebuildIndex', () => {
    const ctx = makeCtx();
    const a = ctx.people.spawn({ kind: 'passant', x: 0, z: 0 });
    const b = ctx.people.spawn({ kind: 'passant', x: 1, z: 0 });
    a.dormant = true;
    ctx.people.rebuildIndex();
    const out: Person[] = [];
    expect(ctx.people.queryRadius(0, 0, 5, out)).toBe(1);
    expect(out[0]).toBe(b);
    expect(ctx.people.list.length).toBe(2); // toujours dans la liste
    a.dormant = false;
    ctx.people.rebuildIndex();
    expect(ctx.people.countIn(0, 0, 5)).toBe(2);
  });
});

describe('magasin des unités', () => {
  it('création, membres, chef, hiérarchie', () => {
    const ctx = makeCtx();
    const cie = ctx.squads.create('compagnie', 'police', 'CRS 12');
    const s1 = ctx.squads.create('section', 'police', 'Alpha', cie.id);
    const s2 = ctx.squads.create('section', 'police', 'Bravo', cie.id);
    const orphan = ctx.squads.create('groupe', 'police', 'Solo', 999); // parent inconnu
    expect(orphan.parentId).toBe(0);
    expect([cie.id, s1.id, s2.id].every((id) => id > 0)).toBe(true);
    expect(new Set([cie.id, s1.id, s2.id, orphan.id]).size).toBe(4);
    expect(ctx.squads.get(s1.id)).toBe(s1);
    expect(ctx.squads.childrenOf(cie.id)).toEqual([s1, s2]);
    expect(ctx.squads.childrenOf(s1.id)).toEqual([]);
    expect(s1.order.type).toBe('libre');
    expect(s1.leaderId).toBe(0);

    const a = ctx.people.spawn({ kind: 'crs', x: 0, z: 0 });
    const b = ctx.people.spawn({ kind: 'crs', x: 1, z: 0, rank: 'brigadier' });
    const c = ctx.people.spawn({ kind: 'crs', x: 2, z: 0, rank: 'major' });
    ctx.squads.addMember(s1.id, a.id);
    ctx.squads.addMember(s1.id, b.id);
    ctx.squads.addMember(s1.id, b.id); // doublon ignoré
    ctx.squads.addMember(s1.id, c.id);
    expect(s1.members).toEqual([a.id, b.id, c.id]);
    expect([a.squadId, b.squadId, c.squadId]).toEqual([s1.id, s1.id, s1.id]);
    expect(s1.leaderId).toBe(a.id); // premier membre, faute de désignation

    ctx.squads.setLeader(s1.id, b.id);
    expect(s1.leaderId).toBe(b.id);

    // changement d'unité : la personne quitte l'ancienne
    ctx.squads.addMember(s2.id, a.id);
    expect(s1.members).toEqual([b.id, c.id]);
    expect(s2.members).toEqual([a.id]);
    expect(a.squadId).toBe(s2.id);

    // le chef part : le plus gradé lui succède
    ctx.squads.removeMember(b.id);
    expect(b.squadId).toBe(0);
    expect(s1.leaderId).toBe(c.id);
    ctx.squads.removeMember(c.id);
    expect(s1.leaderId).toBe(0);
    expect(s1.members).toEqual([]);

    // setLeader ajoute au besoin
    ctx.squads.setLeader(s1.id, c.id);
    expect(s1.members).toEqual([c.id]);
    expect(c.squadId).toBe(s1.id);
    expect(rankLevel('commandant')).toBeGreaterThan(rankLevel('capitaine'));
    expect(rankLevel(null)).toBe(-1);
  });

  it('une personne retirée du jeu quitte son unité ; PersonInit.squadId rattache à la création', () => {
    const ctx = makeCtx();
    const g = ctx.squads.create('groupe', 'police', 'Alpha 1');
    const a = ctx.people.spawn({ kind: 'crs', x: 0, z: 0, squadId: g.id });
    const b = ctx.people.spawn({ kind: 'crs', x: 1, z: 0, squadId: g.id, rank: 'brigadier' });
    const lost = ctx.people.spawn({ kind: 'crs', x: 2, z: 0, squadId: 555 }); // unité inexistante
    expect(g.members).toEqual([a.id, b.id]);
    expect(lost.squadId).toBe(0);
    ctx.people.remove(a.id);
    expect(g.members).toEqual([b.id]);
    expect(g.leaderId).toBe(b.id);
  });

  it('issue complète l\'ordre, l\'horodate et émet order:issued', async () => {
    const ctx = makeCtx();
    const core = getCore(ctx);
    const g = ctx.squads.create('groupe', 'police', 'Alpha 1');
    const chef = ctx.people.spawn({ kind: 'crs', x: 12, z: -7, heading: 0.9, rank: 'brigadier_chef' });
    ctx.squads.addMember(g.id, chef.id);
    const events: { squadId: number; type: string }[] = [];
    ctx.events.on('order:issued', (e) => events.push({ squadId: e.squadId, type: e.order.type }));

    core.clock.advance(3.5);
    ctx.law.authorize(2, chef.id);
    ctx.squads.issue(g.id, { type: 'ligne' });
    expect(g.order).toEqual({
      type: 'ligne', x: 12, z: -7, heading: 0.9, width: 0, targetId: 0, maxForce: 2, issuedAt: 3.5, issuedBy: 0,
    });
    expect(events).toEqual([{ squadId: g.id, type: 'ligne' }]);

    core.clock.advance(1);
    const before = g.order;
    ctx.squads.issue(g.id, { type: 'charge', x: 40, z: 41, heading: -1, width: 18, targetId: 9, maxForce: 3, issuedBy: chef.id });
    expect(g.order).toEqual({
      type: 'charge', x: 40, z: 41, heading: -1, width: 18, targetId: 9, maxForce: 3, issuedAt: 4.5, issuedBy: chef.id,
    });
    expect(g.order).not.toBe(before); // nouvel objet : les abonnés peuvent garder l'ancien
    expect(before.type).toBe('ligne');

    // sans chef : le point et le cap de l'ordre précédent sont conservés
    ctx.squads.removeMember(chef.id);
    ctx.squads.issue(g.id, { type: 'tenir' });
    expect([g.order.x, g.order.z, g.order.heading]).toEqual([40, 41, -1]);
    ctx.squads.issue(999, { type: 'repli' }); // unité inconnue : sans effet
    expect(events.length).toBe(3);
  });

  it('remove rattache les subordonnées à l\'échelon supérieur ; clear remet tout à zéro', () => {
    const ctx = makeCtx();
    const cie = ctx.squads.create('compagnie', 'police', 'CRS 12');
    const sec = ctx.squads.create('section', 'police', 'Alpha', cie.id);
    const grp = ctx.squads.create('groupe', 'police', 'Alpha 1', sec.id);
    const p = ctx.people.spawn({ kind: 'crs', x: 0, z: 0, squadId: sec.id });
    ctx.squads.remove(sec.id);
    expect(ctx.squads.get(sec.id)).toBeUndefined();
    expect(grp.parentId).toBe(cie.id);
    expect(p.squadId).toBe(0);
    expect(ctx.squads.list).toEqual([cie, grp]);
    const q = ctx.people.spawn({ kind: 'crs', x: 0, z: 0, squadId: grp.id });
    ctx.squads.clear();
    expect(ctx.squads.list.length).toBe(0);
    expect(q.squadId).toBe(0);
    expect(ctx.squads.create('groupe', 'police', 'Neuf').id).toBe(1);
  });
});

describe('magasin des projectiles', () => {
  it('spawn, get, remove, nearestPickable, clear', () => {
    const ctx = makeCtx();
    const events: string[] = [];
    ctx.events.on('projectile:spawned', (e) => events.push(`${e.kind}:${e.ownerId}`));
    const a = ctx.projectiles.spawn('pave', 5, 1, 1.5, 2, 3, 4, 5);
    const b = ctx.projectiles.spawn('grenade_lacrymo_main', 6, 10, 0, 0, 0, 0, 0);
    const c = ctx.projectiles.spawn('grenade_lacrymo_main', 6, 3, 0, 0, 0, 0, 0);
    expect(events).toEqual(['pave:5', 'grenade_lacrymo_main:6', 'grenade_lacrymo_main:6']);
    expect([a.x, a.y, a.z, a.vx, a.vy, a.vz]).toEqual([1, 1.5, 2, 3, 4, 5]);
    expect([a.age, a.spin, a.resting, a.emitting, a.pickable, a.data]).toEqual([0, 0, false, false, false, null]);
    expect(a.fuse).toBeGreaterThan(1e9);
    expect(new Set([a.id, b.id, c.id]).size).toBe(3);
    expect(ctx.projectiles.get(b.id)).toBe(b);
    expect(ctx.projectiles.list.length).toBe(3);

    expect(ctx.projectiles.nearestPickable(0, 0, 100)).toBeNull(); // aucun n'est ramassable
    b.pickable = true;
    c.pickable = true;
    expect(ctx.projectiles.nearestPickable(0, 0, 100)).toBe(c);
    expect(ctx.projectiles.nearestPickable(9, 0, 100)).toBe(b);
    expect(ctx.projectiles.nearestPickable(0, 0, 2)).toBeNull();

    ctx.projectiles.remove(a.id);
    ctx.projectiles.remove(a.id);
    expect(ctx.projectiles.get(a.id)).toBeUndefined();
    expect(new Set(ctx.projectiles.list)).toEqual(new Set([b, c]));
    ctx.projectiles.clear();
    expect(ctx.projectiles.list.length).toBe(0);
    expect(ctx.projectiles.get(b.id)).toBeUndefined();
  });

  it('les identifiants sont uniques toutes catégories confondues', () => {
    const ctx = makeCtx();
    const ids = [
      ctx.people.spawn({ kind: 'crs', x: 0, z: 0 }).id,
      ctx.vehicles.spawn('voiture', 0, 0, 0).id,
      ctx.props.spawn('poubelle', 0, 0, 0).id,
      ctx.projectiles.spawn('pave', 0, 0, 0, 0, 0, 0, 0).id,
      ctx.newId(),
    ];
    expect(new Set(ids).size).toBe(5);
    expect(ids.every((id) => id > 0)).toBe(true);
  });
});
