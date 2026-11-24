// Ordres directs — LA DÉSIGNATION (direct/designate.ts) sur la vraie carte de Paris : ce que le joueur montre du regard
// pour l'ordre prêt (Entrée) et la roue (F), au clavier seul (Mac sans souris, caméra droite).
//   - balayage des cinq places de manifestation (République, Bastille, Concorde, Étoile, Opéra), 16 directions : la
//     nature de chaque désignation et l'ordre prêt qu'elle donne sont relevés, rien n'est jamais incohérent ;
//   - caméra droite le long d'une rue, sur ces cinq places : le premier débouché de rue entre 15 et 60 m est désigné
//     (jamais le point du réticule à 80 m, ni le bout du regard à 400 m), et « Bloquer » nomme cette rue ;
//   - un cran de tangage (2° au pavé tactile, ou un appui sur Page préc. quelle que soit sa durée) passe au candidat
//     suivant, Page suiv. revient ;
//   - le rayon lointain se recale sur le boulevard Beaumarchais (Bastille) ;
//   - un policier dans le cône de 4° ne devient jamais la désignation ; sous le réticule même, seulement si son unité peut
//     être rappelée ; un auteur de fait constaté dans le cône l'est, et le reste tant que le regard ne s'en écarte pas de
//     plus de 8° pendant 0,3 s.
import { beforeAll, describe, expect, it } from 'vitest';

import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as traffic } from '@/sim/traffic';
import { createSystems as crowd } from '@/sim/crowd';
import { createSystems as police } from '@/sim/police';
import { createSystems as items } from '@/sim/items';
import { createSystems as props } from '@/sim/props';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as radio } from '@/gameplay/radio';
import { createSystems as session } from '@/gameplay/session';
import { createSystems as maps } from '@/ui/maps';
import { createSystems as command } from '@/ui/command';
import type { CommandCore } from '@/ui/command';
import type { GameContext, Person, RoadSample } from '@/core/contracts';
import { DEFAULT_PLACES } from '@/ui/screens/catalog';
import { Designator, SKY_DEG, pitchBand, scanRay } from '@/ui/command/direct/designate';
import type { DesignateView } from '@/ui/command/direct/designate';
import { addressableUnitOf, directEnvFromCore, naturalOrder, placeBare, placeWithArticle } from '@/ui/command/direct';

const MODULES = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, session, maps, command];
const MEANS = { sections: 3, fourgons: 9, centaure: 1, canon_eau: 1, bravm: 1, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };
const DEG = Math.PI / 180;
const FIVE = ['Place de la République', 'Place de la Bastille', 'Place de la Concorde', 'Champs-Élysées – Étoile', 'Place de l’Opéra'];

let ctx: GameContext;
let core: CommandCore;
let me: Person;
let clock = 1000;

beforeAll(async () => {
  const t = createTestContext({ seed: 21, strict: false, modules: MODULES });
  await t.start({
    mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place de la Concorde', x: -10, z: 15,
    crowdSize: 300, tension: 0.4, volatility: 0.3, duration: 'standard', extra: { moyens: MEANS, variante: 'terrain' },
  } as never);
  t.step(3);
  ctx = t.ctx;
  core = ctx.service<CommandCore>('ui.command')!;
  me = core.player()!;
}, 300000);

/** Regard depuis (x, z), cap `yaw`, tangage `pitch` ; le réticule à 80 m devant (caméra droite), personne visée. */
function view(x: number, z: number, yaw: number, pitch = 0, aimed = 0): DesignateView {
  return { x, z, yaw, pitch, aimX: x + Math.sin(yaw) * 80, aimZ: z + Math.cos(yaw) * 80, aimedPersonId: aimed, selfId: me.id };
}

/** Le point libre le plus proche du centre d'une place (le centre est souvent un monument : obélisque, statue). */
function freeSpot(x: number, z: number): { x: number; z: number } {
  // à 25 m au moins du centre, dégagé sur 3 m (pas collé au socle d'une statue)
  for (let r = 25; r <= 100; r += 5) {
    for (let k = 0; k < 16; k++) {
      const a = (k * Math.PI) / 8;
      const px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r;
      if (ctx.world.isFree(px, pz, 3) && ctx.world.buildingHeightAt(px, pz) <= 0) return { x: px, z: pz };
    }
  }
  return { x, z };
}

/** Un instant plus tard (le rayon lointain est relancé 4 fois par seconde). */
function later(): number {
  clock += 1;
  return clock;
}

function roadAt(x: number, z: number, max: number): RoadSample | null {
  const r: RoadSample = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };
  return ctx.world.nearestRoad(x, z, r, max) ? r : null;
}

/** Point à `d` m dans l'arête `edgeId` depuis son nœud `node`. */
function along(edgeId: number, node: number, d: number): { x: number; z: number } | null {
  const e = ctx.world.edge(edgeId);
  const n = e.points.length / 2;
  const pts: { x: number; z: number }[] = [];
  for (let i = 0; i < n; i++) pts.push({ x: e.points[i * 2]!, z: e.points[i * 2 + 1]! });
  if (e.a !== node) pts.reverse();
  let left = d;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]!, b = pts[i + 1]!;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len >= left) return { x: a.x + ((b.x - a.x) * left) / len, z: a.z + ((b.z - a.z) * left) / len };
    left -= len;
  }
  return null;
}

/** Nœuds du réseau à moins de `r` m d'un point. */
function nodesNear(x: number, z: number, r: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < ctx.world.nodeCount; i++) {
    const n = ctx.world.node(i);
    if (Math.hypot(n.x - x, n.z - z) <= r) out.push(i);
  }
  return out;
}

/** Manifestants à moins de 15 m d'un point du regard (aucune foule ne doit gêner le cas du débouché de rue). */
function demonstratorsNear(x: number, z: number, r: number): number {
  const list: Person[] = [];
  return ctx.people.queryRadius(x, z, r, list, (p) => p.faction === 'protest');
}

/**
 * Sur une place : un point P sur une rue nommée E, à 20–50 m d'un carrefour N où part une rue d'un autre nom, P → N en
 * vue directe, sans autre carrefour de ce genre ni foule entre les deux ; le regard de P vers N (le long de E).
 */
function streetSetup(px: number, pz: number): { x: number; z: number; yaw: number; node: { x: number; z: number }; street: string; side: string[] } | null {
  for (const nid of nodesNear(px, pz, 320).sort((a, b) => {
    const na = ctx.world.node(a), nb = ctx.world.node(b);
    return Math.hypot(na.x - px, na.z - pz) - Math.hypot(nb.x - px, nb.z - pz) || a - b;
  })) {
    const n = ctx.world.node(nid);
    if (n.edges.length < 3) continue;
    for (const eid of n.edges) {
      const e = ctx.world.edge(eid);
      const name = e.name.trim();
      if (name === '' || e.length < 60) continue;
      const side = n.edges.map((x) => ctx.world.edge(x).name.trim()).filter((s) => s !== '' && s !== name);
      if (side.length === 0) continue;
      for (const d of [30, 40, 25, 50]) {
        const p = along(eid, nid, d);
        if (!p) continue;
        const r0 = roadAt(p.x, p.z, 3);
        if (!r0 || r0.name.trim() !== name) continue;
        if (!ctx.world.lineOfSight(p.x, p.z, n.x, n.z)) continue;
        const yaw = Math.atan2(n.x - p.x, n.z - p.z);
        const fx = Math.sin(yaw), fz = Math.cos(yaw);
        // aucun autre carrefour vers une autre rue entre P et N
        let other = false;
        for (const mid of nodesNear(p.x, p.z, d + 2)) {
          if (mid === nid) continue;
          const m = ctx.world.node(mid);
          const t = (m.x - p.x) * fx + (m.z - p.z) * fz;
          const perp = Math.abs((m.x - p.x) * fz - (m.z - p.z) * fx);
          if (t > 0 && t < d - 1 && perp < 12 && m.edges.some((x) => { const nm = ctx.world.edge(x).name.trim(); return nm !== '' && nm !== name; })) other = true;
        }
        if (other) continue;
        let crowded = false;
        for (let k = 0; k <= 60; k += 5) if (demonstratorsNear(p.x + fx * k, p.z + fz * k, 18) > 0) crowded = true;
        if (crowded) continue;
        return { x: p.x, z: p.z, yaw, node: { x: n.x, z: n.z }, street: name, side };
      }
    }
  }
  return null;
}

describe('désignation par candidats le long du regard (vraie carte, graine 21)', () => {
  it('balayage des cinq places, 16 directions : nature de la désignation et ordre prêt relevés, toujours cohérents', () => {
    const env = directEnvFromCore(core);
    const des = new Designator(core);
    for (const name of FIVE) {
      const place = freeSpot(DEFAULT_PLACES.find((p) => p.name === name)!.x, DEFAULT_PLACES.find((p) => p.name === name)!.z);
      const kinds: Record<string, number> = {};
      const lines: string[] = [];
      for (let k = 0; k < 16; k++) {
        const yaw = (k * Math.PI) / 8;
        const d = des.update(view(place.x, place.z, yaw), later())!;
        expect(d, `${name} ${k}`).toBeTruthy();
        kinds[d.kind] = (kinds[d.kind] ?? 0) + 1;
        expect(['ground', 'person', 'none']).toContain(d.kind);
        if (d.kind === 'ground') {
          // caméra droite : jamais plus près que 6 m ni plus loin que le rayon lointain
          expect(d.distance).toBeGreaterThanOrEqual(6);
          expect(d.distance).toBeLessThanOrEqual(410);
          expect(d.far).toBe(d.distance > 80);
        }
        if (d.kind === 'person') expect(d.person!.kind).not.toBe('police');
        const n = naturalOrder(env, d);
        lines.push(`${k}: ${d.kind} ${d.place || '—'} ${Math.round(d.distance)} m → ${n.rule} « ${n.text} »`);
      }
      console.log(`${name} : ${JSON.stringify(kinds)}\n  ${lines.join('\n  ')}`);
      // une place ouverte : la plupart des directions désignent un endroit, pas le vide
      expect(kinds.ground ?? 0, name).toBeGreaterThanOrEqual(10);
    }
  });

  it('caméra droite le long d’une rue, sur les cinq places : le premier débouché de rue entre 15 et 60 m, nommé', () => {
    const env = directEnvFromCore(core);
    for (const name of FIVE) {
      const place = DEFAULT_PLACES.find((p) => p.name === name)!;
      const s = streetSetup(place.x, place.z);
      expect(s, `${name} : une rue avec un carrefour devant`).toBeTruthy();
      const des = new Designator(core);
      const d = des.update(view(s!.x, s!.z, s!.yaw, 0), later())!;
      const nodeDist = Math.hypot(s!.node.x - s!.x, s!.node.z - s!.z);
      console.log(`${name} : ${s!.street} → carrefour à ${Math.round(nodeDist)} m (${s!.side.join(', ')}) ; désigné « ${d.place} » à ${Math.round(d.distance)} m ; candidats ${des.candidates().map((c) => `${c.kind} ${c.place || '—'} ${Math.round(c.distance)}`).join(' | ')}`);
      expect(d.kind).toBe('ground');
      expect(d.distance).toBeGreaterThanOrEqual(15);
      expect(d.distance).toBeLessThanOrEqual(60);
      // au débouché même (pas au réticule à 80 m, pas au bout du regard), et c'est l'autre rue qui est nommée
      expect(Math.hypot(d.x - s!.node.x, d.z - s!.node.z)).toBeLessThan(15);
      expect(d.far).toBe(false);
      expect(s!.side.map((x) => placeBare(x))).toContain(d.place);
      const n = naturalOrder(env, d);
      expect(n.rule, n.text).toBe('g');
      expect(n.text.startsWith(`Bloquer ${placeWithArticle(d.place)}`), n.text).toBe(true);
    }
  });

  it('un cran de tangage passe au candidat suivant : 2° au pavé tactile, ou un appui de Page préc. quelle que soit sa durée', () => {
    const place = DEFAULT_PLACES.find((p) => p.name === 'Place de la République')!;
    const s = streetSetup(place.x, place.z)!;
    const des = new Designator(core);
    const level = des.update(view(s.x, s.z, s.yaw, 0), later())!;
    const cands = des.candidates();
    expect(cands.length).toBeGreaterThanOrEqual(2);
    expect(des.index()).toBe(0);
    // pavé tactile : 2° plus haut → le candidat suivant ; 4° → encore le suivant (ou le dernier)
    expect(pitchBand(0)).toBe(0);
    expect(pitchBand(-2.9 * DEG)).toBe(0);
    expect(pitchBand(-3.1 * DEG)).toBe(-1);
    expect(pitchBand(1.2 * DEG)).toBe(1);
    expect(pitchBand(3.2 * DEG)).toBe(2);
    const up = des.update(view(s.x, s.z, s.yaw, 1.5 * DEG), later())!;
    expect(des.index()).toBe(1);
    expect(up.x).toBeCloseTo(cands[1]!.x, 5);
    expect(up.distance).toBeGreaterThan(level.distance);
    des.update(view(s.x, s.z, s.yaw, 0), later());
    expect(des.index()).toBe(0);
    // clavier : Page préc. tenue pendant que la caméra monte de 8° → un seul candidat de plus, même au relâchement
    des.keyStep(1);
    des.update(view(s.x, s.z, s.yaw, 8 * DEG), later());
    expect(des.index()).toBe(1);
    des.keyRelease();
    const kb = des.update(view(s.x, s.z, s.yaw, 8 * DEG), later())!;
    expect(des.index()).toBe(1);
    expect(kb.x).toBeCloseTo(cands[1]!.x, 5);
    // Page suiv. : retour au plus proche (la caméra redescend de 8°)
    des.keyStep(-1);
    des.update(view(s.x, s.z, s.yaw, 0), later());
    des.keyRelease();
    des.update(view(s.x, s.z, s.yaw, 0), later());
    expect(des.index()).toBe(0);
    // regard vers le sol : le point du réticule ; vers le ciel : rien (aucun ordre)
    const down = des.update({ ...view(s.x, s.z, s.yaw, -20 * DEG), aimX: s.x + Math.sin(s.yaw) * 5, aimZ: s.z + Math.cos(s.yaw) * 5 }, later())!;
    expect(des.index()).toBe(-1);
    expect(down.kind).toBe('none');
    const ground = des.update({ ...view(s.x, s.z, s.yaw, -10 * DEG), aimX: s.x + Math.sin(s.yaw) * 9, aimZ: s.z + Math.cos(s.yaw) * 9 }, later())!;
    expect(ground.kind).toBe('ground');
    expect(ground.distance).toBeCloseTo(9, 3);
    expect(des.update(view(s.x, s.z, s.yaw, (SKY_DEG + 5) * DEG), later())!.kind).toBe('none');
  });

  it('rayon lointain : il se recale sur le boulevard Beaumarchais, au-delà de 80 m (Bastille)', () => {
    const place = DEFAULT_PLACES.find((p) => p.name === 'Place de la Bastille')!;
    // le bout du boulevard Beaumarchais le plus proche de la place, regard le long du boulevard
    let best: { x: number; z: number; yaw: number } | null = null;
    let bd = Infinity;
    for (let i = 0; i < ctx.world.edgeCount; i++) {
      const e = ctx.world.edge(i);
      if (!/^boulevard beaumarchais$/i.test(e.name.trim()) || e.points.length < 4) continue;
      for (const node of [e.a, e.b]) {
        const n = ctx.world.node(node);
        const dd = Math.hypot(n.x - place.x, n.z - place.z);
        if (dd >= bd) continue;
        const p = along(i, node, 8);
        const q = along(i, node, 30);
        if (!p || !q) continue;
        bd = dd;
        best = { x: p.x, z: p.z, yaw: Math.atan2(q.x - p.x, q.z - p.z) };
      }
    }
    expect(best, 'boulevard Beaumarchais').toBeTruthy();
    const cands = scanRay(ctx, best!.x, best!.z, best!.yaw, me.id);
    const last = cands[cands.length - 1]!;
    console.log(`Beaumarchais : ${cands.map((c) => `${c.kind} ${c.place || '—'} ${Math.round(c.distance)}`).join(' | ')}`);
    expect(last.kind).toBe('bout');
    expect(last.distance).toBeGreaterThan(80);
    expect(last.place).toBe('boulevard Beaumarchais');
    // le point est SUR le boulevard (recalé sur son axe)
    const r = roadAt(last.x, last.z, 2);
    expect(r && r.name.trim()).toBe('Boulevard Beaumarchais');
    // désigné en levant la vue jusqu'au dernier candidat : désignation lointaine, nommée
    const des = new Designator(core);
    des.update(view(best!.x, best!.z, best!.yaw, 0), later());
    for (let i = 0; i < cands.length; i++) des.keyStep(1);
    const d = des.update(view(best!.x, best!.z, best!.yaw, 0), later())!;
    des.keyRelease();
    expect(d.far).toBe(true);
    expect(d.place).toBe('boulevard Beaumarchais');
    const n = naturalOrder(directEnvFromCore(core), d);
    if (d.distance > 150) expect(n.text.startsWith('Envoyer : boulevard Beaumarchais'), n.text).toBe(true);
  });

  it('un policier dans le cône de 4° n’est jamais désigné ; sous le réticule, seulement si son unité peut être rappelée', () => {
    // un agent de la compagnie, regardé de 30 m avec 2° d'écart : la désignation reste le lieu
    const env = directEnvFromCore(core);
    const cop = ctx.people.nearest(me.x, me.z, 200, (p) => p.faction === 'police' && !p.isPlayer && p.squadId !== 0 && p.vehicleId === 0)!;
    expect(cop).toBeTruthy();
    const des = new Designator(core);
    const at = (deg: number, aimed: number) => {
      const a = Math.atan2(1, 0);
      const ox = cop.x - Math.sin(a) * 30, oz = cop.z - Math.cos(a) * 30;
      return des.update(view(ox, oz, a + deg * DEG, 0, aimed), later())!;
    };
    for (const deg of [-3.5, -2, -1, 0, 1, 2, 3.5]) {
      const d = at(deg, 0);
      expect(d.person === null || d.person.kind !== 'police', `${deg}°`).toBe(true);
    }
    // sous le réticule même, son unité suit déjà le commandant (« avec vous ») : rien à rappeler, pas de désignation
    const s = ctx.squads.get(cop.squadId)!;
    const following = (q: typeof s): boolean => q.order.type === 'suivre' && q.order.targetId === me.id;
    if (following(s)) expect(at(0, cop.id).person).toBeNull();
    // son unité (au niveau des ordres) tient sa position, ordre du joueur : sous le réticule, l'agent est désigné (règle
    // e : « avec moi »)
    const du = addressableUnitOf(env, s.id);
    expect(du, 'unité de l’agent sous les ordres du commandant').toBeTruthy();
    const unit = ctx.squads.get(du!.squadId)!;
    const r = core.issue('tenir', [unit], null);
    expect(r.ok, r.reason).toBe(true);
    const exact = at(0, cop.id);
    expect(exact.kind).toBe('person');
    expect(exact.person!.kind).toBe('police');
    expect(exact.person!.exact).toBe(true);
    // … mais jamais par le cône, même à 1°
    expect(at(1, 0).person).toBeNull();
    const n = naturalOrder(directEnvFromCore(core), exact);
    expect(n.rule, n.text).toBe('e');
    // remise en ordre : tout le monde avec le commandant
    expect(core.callFollow(false).ok).toBe(true);
  });

  it('un auteur de fait constaté dans le cône est désigné, et le reste tant que le regard ne s’écarte pas de plus de 8° pendant 0,3 s', () => {
    const demo = ctx.people.nearest(me.x, me.z, 400, (p) => p.faction === 'protest' && p.custody === 'free' && p.vehicleId === 0 && !ctx.health.isIncapacitated(p))!;
    expect(demo).toBeTruthy();
    demo.offenses.push({ type: 'jet_projectile', t: ctx.clock.now, x: demo.x, z: demo.z, severity: 3, witnessed: true, filmed: false } as never);
    expect(ctx.law.canArrest(demo)).toBe(true);
    // regardé depuis un point dégagé à 25 m de lui, 3° à côté
    let ox = 0, oz = 0, a = 0;
    for (let k = 0; k < 16; k++) {
      a = (k * Math.PI) / 8;
      ox = demo.x - Math.sin(a) * 25;
      oz = demo.z - Math.cos(a) * 25;
      if (ctx.world.lineOfSight(ox, oz, demo.x, demo.z) && ctx.world.isFree(ox, oz, 0.4)) break;
    }
    const des = new Designator(core);
    const t0 = later();
    const d = des.update(view(ox, oz, a + 3 * DEG), t0)!;
    expect(d.kind).toBe('person');
    expect(d.person!.id).toBe(demo.id);
    expect(d.person!.kind).toBe('offender');
    expect(d.person!.label).toBe('le lanceur de projectile');
    // 6° : hors du cône, mais encore collant
    expect(des.update(view(ox, oz, a + 6 * DEG), t0 + 0.05)!.person?.id).toBe(demo.id);
    // 12° : encore désigné pendant 0,3 s, puis lâché
    expect(des.update(view(ox, oz, a + 12 * DEG), t0 + 0.1)!.person?.id).toBe(demo.id);
    expect(des.update(view(ox, oz, a + 12 * DEG), t0 + 0.25)!.person?.id).toBe(demo.id);
    const gone = des.update(view(ox, oz, a + 12 * DEG), t0 + 0.45)!;
    expect(gone.person === null || gone.person.id !== demo.id).toBe(true);
    const n = naturalOrder(directEnvFromCore(core), d);
    expect(n.rule, n.text).toBe('c');
    expect(n.text.startsWith('Interpeller le lanceur de projectile')).toBe(true);
    demo.offenses.length = 0;
  });
});
