// « Avec moi » : le commandant au volant désigne sur la carte tactique une unité engagée ailleurs ; elle embarque dans
// son fourgon et prend place dans sa colonne, derrière lui ; une unité lointaine vient d'abord en véhicules. À pied (A),
// une section à plus de 450 m vient dans ses fourgons, débarque près de lui et le suit (elle faisait tout le chemin à
// pied : 960 m) ; la section proche et l'état-major de la compagnie viennent à pied.
import { describe, expect, it } from 'vitest';

import type { Person } from '@/core/contracts';
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
import { createSystems as command } from '@/ui/command';
import type { CommandCore } from '@/ui/command';

const SIM = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, session, command];
const MEANS = { sections: 2, fourgons: 6, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };

describe('ordre « avec moi »', () => {
  it('une unité tenue en dispositif rejoint la colonne du commandant quand il l’appelle', async () => {
    const t = createTestContext({ seed: 12, strict: false, modules: SIM });
    await t.start({ mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place de la Concorde', x: -10, z: 15, crowdSize: 0, tension: 0.1, volatility: 0.1, duration: 'standard', extra: { moyens: MEANS, variante: 'terrain' } });
    const { ctx } = t;
    t.step(5);
    const core = ctx.service<CommandCore>('ui.command')!;
    const me = ctx.player.person()!;
    const groups = ctx.squads.list.filter((s) => s.faction === 'police' && s.kind === 'groupe' && s.vehicleId !== 0 && ctx.vehicles.get(s.vehicleId)?.kind === 'fourgon_crs');
    // un groupe tient sa position (engagé : il ne part pas d'office avec le commandant)
    const held = groups[groups.length - 1]!;
    const lead = ctx.people.get(held.leaderId)!;
    ctx.squads.issue(held.id, { type: 'tenir', x: lead.x, z: lead.z, heading: 0, width: 0, issuedBy: me.id });
    t.step(2);
    // le commandant prend le volant du VL
    const vl = ctx.vehicles.list.filter((v) => v.kind === 'vl_commandement').sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0]!;
    if (vl.seats[0] !== 0) ctx.vehicles.exit(ctx.people.get(vl.seats[0])!);
    me.x = vl.x + 3; me.z = vl.z;
    expect(ctx.vehicles.enter(me, vl, 'driver')).toBe(true);
    t.step(20);
    expect(held.order.type).toBe('tenir');
    // « avec moi »
    const res = core.issue('avec_moi', [held], null);
    expect(res.ok).toBe(true);
    for (let i = 0; i < 12; i++) t.step(5);
    const van = ctx.vehicles.get(held.vehicleId)!;
    const aboard = held.members.filter((id) => ctx.people.get(id)!.vehicleId === van.id).length;
    const ap = ctx.service<{ status(v: unknown): { mode: string; leaderId: number } }>('vehicles.autopilot')!;
    // tant que le commandant reste à l'arrêt, le fourgon embarqué reste garé ; il démarre : le fourgon le suit
    for (let i = 0; i < 20 && ap.status(van).mode !== 'follow'; i++) {
      vl.x += Math.sin(vl.heading) * 3; vl.z += Math.cos(vl.heading) * 3; vl.speed = 3;
      me.x = vl.x; me.z = vl.z;
      t.step(2);
    }
    const st = ap.status(van);
    console.log(`avec moi : ordre ${held.order.type} ; ${aboard}/${held.members.length} à bord ; fourgon ${st.mode} derrière ${st.leaderId}`);
    expect(aboard).toBeGreaterThanOrEqual(held.members.length - 1);
    expect(st.mode).toBe('follow');
  }, 600000);

  it('« Avec moi » à pied (A) : une section à 700 m vient en fourgons et le suit ; l’état-major et la section proche viennent à pied', async () => {
    const t = createTestContext({ seed: 14, strict: false, modules: SIM });
    await t.start({ mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place de la Concorde', x: -10, z: 15, crowdSize: 0, tension: 0.1, volatility: 0.1, duration: 'standard', extra: { moyens: MEANS, variante: 'terrain', 'crowd.none': true } });
    const { ctx } = t;
    t.step(5);
    const core = ctx.service<CommandCore>('ui.command')!;
    const me = ctx.player.person()!;
    const company = ctx.squads.list.find((s) => s.kind === 'compagnie')!;
    const far = ctx.squads.list.find((s) => s.kind === 'section' && s.name === 'MISTRAL 2')!;
    const near = ctx.squads.list.find((s) => s.kind === 'section' && s.name === 'MISTRAL 1')!;
    const cmd = ctx.service<{ convoyOf(id: number): { stage: string } | null }>('police.command')!;
    const agentsOf = (root: { id: number }): Person[] => ctx.squads.list.filter((q) => q.id === root.id || isUnder(ctx, q, root.id))
      .flatMap((q) => q.members.map((id) => ctx.people.get(id)!)).filter((p) => p && !p.isPlayer && p.poste !== 'conducteur' && p.custody === 'free' && p.posture !== 'down');
    const centre = (ps: Person[]): { x: number; z: number } => ({ x: ps.reduce((a, p) => a + p.x, 0) / ps.length, z: ps.reduce((a, p) => a + p.z, 0) / ps.length });
    // MISTRAL 2 part en véhicules à 700 m (« Y aller »), et y débarque
    const path: number[] = [];
    let goal: { x: number; z: number } | null = null;
    for (let k = 0; k < 16 && !goal; k++) {
      const a = (k / 16) * Math.PI * 2;
      const gx = me.x + Math.sin(a) * 700, gz = me.z + Math.cos(a) * 700;
      path.length = 0;
      if (ctx.world.findPath(me.x, me.z, gx, gz, 'vehicle', path) && path.length >= 4) goal = { x: path[path.length - 2]!, z: path[path.length - 1]! };
    }
    expect(goal).toBeTruthy();
    expect(core.issue('colonne', [far], [{ x: goal!.x, z: goal!.z, heading: 0, width: 0 }]).ok).toBe(true);
    for (let i = 0; i < 120; i++) {
      t.step(5);
      const st = cmd.convoyOf(far.id);
      const c = centre(agentsOf(far));
      if ((!st || st.stage === 'en_place') && Math.hypot(c.x - me.x, c.z - me.z) > 450 && agentsOf(far).every((p) => p.vehicleId === 0)) break;
    }
    const c0 = centre(agentsOf(far));
    const d0 = Math.hypot(c0.x - me.x, c0.z - me.z);
    console.log(`MISTRAL 2 à ${d0.toFixed(0)} m du commandant, à pied`);
    expect(d0).toBeGreaterThan(450);
    // A : tout le monde avec lui
    const direct = ctx.service<{ avecMoi(o?: { fromScreen?: boolean }): { ok: boolean } }>('command.direct')!;
    expect(direct.avecMoi({ fromScreen: true }).ok).toBe(true);
    t.step(2);
    // (l'accusé de la section lointaine passe après celui de la compagnie, « REÇU, je suis votre mouvement », dit dans la
    // seconde et long de cinq secondes : mesuré à 5,8 s — on l'attend dix secondes au plus)
    for (let k = 0; k < 16 && !ctx.radio.log.some((m) => /on vient en fourgons/.test(m.text)); k++) t.step(0.5);
    // la section lointaine vient en véhicules, la proche et l'état-major à pied (ordre du joueur : byPlayer)
    expect(cmd.convoyOf(far.id)?.stage).toBe('route');
    expect(cmd.convoyOf(near.id)?.stage ?? '-').not.toBe('route');
    expect(company.order.type).toBe('suivre');
    expect(company.order.byPlayer).toBe(true);
    expect(near.order.type).toBe('suivre');
    expect(ctx.radio.log.some((m) => /on vient en fourgons/.test(m.text))).toBe(true);
    // les fourgons cellulaires restent au point de remise des interpellés : « Avec moi » à la compagnie ne les emmène pas
    const cells = ctx.squads.list.filter((q) => q.kind === 'equipage' && ctx.vehicles.get(q.vehicleId)?.kind === 'fourgon_cellulaire');
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.filter((q) => q.order.byPlayer === true).map((q) => `${q.name}=${q.order.type}`)).toEqual([]);
    let t90 = -1;
    for (let i = 0; i < 80 && t90 < 0; i++) {
      t.step(5);
      const ps = agentsOf(far);
      if (far.order.type === 'suivre' && ps.filter((p) => Math.hypot(p.x - me.x, p.z - me.z) < 80).length >= Math.ceil(ps.length * 0.9)) t90 = (i + 1) * 5;
    }
    const ps = agentsOf(far);
    const close = ps.filter((p) => Math.hypot(p.x - me.x, p.z - me.z) < 80).length;
    const staff = company.members.map((id) => ctx.people.get(id)!).filter((p) => p && !p.isPlayer && p.vehicleId === 0 && p.poste !== 'conducteur');
    const staffNear = staff.filter((p) => Math.hypot(p.x - me.x, p.z - me.z) < 40).length;
    console.log(`MISTRAL 2 : ${close}/${ps.length} agents à moins de 80 m après ${t90 < 0 ? '> 400' : t90} s (ordre ${far.order.type}, colonne ${cmd.convoyOf(far.id)?.stage ?? '—'}, ${ps.filter((p) => p.vehicleId !== 0).length} à bord) ; état-major ${staffNear}/${staff.length} à moins de 40 m`);
    expect(t90).toBeGreaterThan(0);
    // (mesuré : 375 s — 130 s pour revenir aux fourgons, garés à 230 m de la ligne tenue à 700 m, puis 245 s pour un
    // itinéraire de 1 180 m ; la limite était de 300 s quand la section débarquait au pied de ses fourgons)
    expect(t90).toBeLessThanOrEqual(420);
    expect(far.order.type).toBe('suivre');
    expect(staffNear).toBe(staff.length);
  }, 900000);
});

function isUnder(ctx: { squads: { get(id: number): { id: number; parentId: number } | undefined } }, q: { parentId: number }, rootId: number): boolean {
  let p = q.parentId;
  for (let g = 0; p !== 0 && g < 9; g++) {
    if (p === rootId) return true;
    p = ctx.squads.get(p)?.parentId ?? 0;
  }
  return false;
}
