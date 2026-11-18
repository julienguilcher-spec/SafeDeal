// Partie robot de la carte de commandement (refonte « commande ») : un commandant, dans de vraies parties à plusieurs
// endroits de Paris et avec plusieurs graines, parcourt chaque intention comme le ferait le joueur — il choisit
// l'intention, lit la fiche du premier lieu proposé, laisse le jeu choisir l'unité et donne l'ordre. On mesure :
//   - chaque fiche : au plus six lignes, la ligne par défaut visible, aucun libellé brut / abrégé / chiffré ;
//   - chaque ordre donné existe vraiment dans le monde (l'unité a l'ordre, ou le reprendra au débarquement) ;
//   - une seconde partie dans le même processus repart propre (aucun ordre, aucune chaîne légale, aucune nasse).
import { describe, expect, it } from 'vitest';

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
import { createSystems as env } from '@/env';
import { createSystems as incidents } from '@/gameplay/incidents';
import { createSystems as rescue } from '@/sim/roles/rescue';
import { createSystems as session } from '@/gameplay/session';
import { createSystems as maps } from '@/ui/maps';
import { createSystems as command } from '@/ui/command';
import type { CommandCore } from '@/ui/command';
import type { MapCanvas } from '@/ui/maps/mapCanvas';
import { defaultWho, proposeWho, whoEnvFromCore } from '@/ui/command/bestUnit';
import type { Card, CardEnv, CardLine, Repere, SendEnv } from '@/ui/command/cardTypes';
import { INTENTS, MAX_LINES, buildCard, intentCandidates } from '@/ui/command/intents';
import { sentenceOf } from '@/ui/command/preview';
import { cardEnvFromCore } from '@/ui/command/reperes';
import { legalCheck, lineSends, sendCardLine, windDrift } from '@/ui/command/sendLine';
import { TacticalMap } from '@/ui/command/tacticalMap';
import { TacticalState } from '@/ui/command/tacticalState';

const MODULES = [env, world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, incidents, rescue, session, maps, command];
const MEANS = { sections: 3, fourgons: 9, centaure: 1, canon_eau: 1, bravm: 1, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };

/** Libellés interdits à l'écran : type d'ordre brut, abréviation non expliquée, force en chiffre. */
function suspicious(s: string): string {
  if (/[A-Z]{3,}_[A-Z]/.test(s) || /\b[a-z]+_[a-z_]+\b/.test(s)) return 'type brut';
  if (/\b(VL|GM2L)\b/.test(s)) return 'abréviation';
  if (/\bLBD\b/.test(s) && !/lanceurs de balles/.test(s)) return 'LBD non expliqué';
  if (/\bTV\b/.test(s) && !/police secours/i.test(s)) return 'TV non expliqué';
  if (/(Force|force|[Nn]iveau|licite|autorisée)\s*:?\s*[0-4]\b/.test(s)) return 'force en chiffre';
  if (/undefined|NaN|\[object/.test(s)) return 'valeur cassée';
  return '';
}

function checkCard(card: Card, where: string): string[] {
  const bad: string[] = [];
  if (card.lines.length > MAX_LINES) bad.push(`${where} : ${card.lines.length} lignes`);
  if (card.lines.length > 0 && (card.defaultLine < 0 || card.defaultLine >= card.lines.length)) bad.push(`${where} : ligne par défaut ${card.defaultLine} hors des lignes`);
  for (const txt of [card.title, card.sub, ...card.notes, ...card.lines.flatMap((l) => [l.label, l.explain, l.rule]), ...card.others.flatMap((l) => [l.label, l.explain])]) {
    const why = suspicious(txt ?? '');
    if (why !== '') bad.push(`${where} : ${why} « ${txt} »`);
  }
  return bad;
}

async function start(place: string, seed: number, x: number, z: number, role = 'commandant', rank: string | undefined = 'commandant') {
  const t = createTestContext({ seed, strict: false, modules: MODULES });
  await t.start({
    mode: 'libre', role, rank, place, x, z, crowdSize: 300, tension: 0.4, volatility: 0.3, duration: 'standard',
    extra: { moyens: MEANS, variante: 'terrain' },
  } as never);
  t.step(3);
  const core = t.ctx.service<CommandCore>('ui.command')!;
  const state = new TacticalState();
  const tmap = new TacticalMap(core, { handlers: null } as unknown as MapCanvas, state);
  const sendEnv = (card: CardEnv): SendEnv => ({ core, map: tmap, setSelection: (ids) => state.setSelection(ids), card, trace: null });
  return { t, ctx: t.ctx, core, sendEnv };
}

/** L'ordre donné à une unité existe-t-il dans le monde (direct, ou repris au débarquement) ? */
function hasOrder(core: CommandCore, squadId: number, type: string): boolean {
  const s = core.ctx.squads.get(squadId);
  if (!s) return false;
  if (String(s.order.type) === type) return true;
  const later = core.afterConvoy.get(squadId);
  return !!later && String(later.type) === type;
}

const PLACES: [string, number, number, number][] = [
  ['Place de la Concorde', 21, -10, 15],
  ['Place de la Bastille', 5, 3542, 1395],
  ['Place de la République', 9, 3123, -208],
];

describe('partie robot : la carte de commandement, intention par intention', () => {
  for (const [place, seed, px, pz] of PLACES) {
    it(`${place} (graine ${seed}) : chaque intention ouvre une fiche lisible et son ordre par défaut part pour de vrai`, async () => {
      const { t, core, sendEnv } = await start(place, seed, px, pz);
      const problems: string[] = [];
      const log: string[] = [];
      for (const intent of INTENTS) {
        const env = cardEnvFromCore(core);
        const from = env.player ?? { x: 0, z: 0 };
        const cands = intentCandidates(intent.id, env, from);
        log.push(`${intent.label} : ${cands.length} lieu(x) — ${cands.slice(0, 3).map((r) => `${r.kind}:${r.name}`).join(', ')}`);
        if (intent.id === 'envoyer' || intent.id === 'bloquer' || intent.id === 'encercler' || intent.id === 'disperser') {
          if (cands.length === 0) problems.push(`${intent.label} : aucun lieu proposé alors qu'une foule est là`);
        }
        for (const r of cands.slice(0, 4)) problems.push(...checkCard(buildCard(r, env, intent.id), `${intent.label}/${r.kind} ${r.name}`));
        const r = cands[0];
        if (!r) continue;
        const card = buildCard(r, env, intent.id);
        const line: CardLine | undefined = card.lines[card.defaultLine];
        if (!line) { problems.push(`${intent.label} : fiche sans ligne`); continue; }
        if (!lineSends(line) || line.lock) { log.push(`  ${intent.label} : « ${line.label} » (ne part pas directement)`); continue; }
        const who = line.needsWho ? defaultWho(proposeWho(line, r, whoEnvFromCore(core, env, []))) : null;
        if (line.needsWho && !who) { log.push(`  ${intent.label} : « ${line.label} » — aucune unité proposée`); continue; }
        if (who) {
          const s = sentenceOf(line, who, r);
          const why = suspicious(s.what);
          if (why) problems.push(`${intent.label} : phrase ${why} « ${s.what} »`);
        }
        const before = core.issued.length;
        const res = sendCardLine(sendEnv(env), line, who, r);
        log.push(`  ${intent.label} : « ${line.label} » → ${res.ok ? 'OK' : 'REFUS'} ${res.text}`);
        if (suspicious(res.text)) problems.push(`${intent.label} : compte rendu ${suspicious(res.text)} « ${res.text} »`);
        if (!res.ok) { problems.push(`${intent.label} : l'ordre par défaut « ${line.label} » est refusé : ${res.text}`); continue; }
        const a = line.action;
        if (a.kind === 'verb') {
          for (const id of res.squads) if (!hasOrder(core, id, a.type)) problems.push(`${intent.label} : l'unité ${id} n'a pas l'ordre ${a.type} (${core.ctx.squads.get(id)?.order.type})`);
          if (core.issued.length <= before) problems.push(`${intent.label} : rien dans les ordres donnés`);
        }
        t.step(2);
      }
      // le monde avance sans erreur avec tous ces ordres
      t.step(20);
      console.log(`[${place}]\n` + log.join('\n'));
      expect(problems, problems.join('\n')).toEqual([]);
    }, 400000);
  }

  it('seconde partie dans le même processus : rien ne reste de la première', async () => {
    const a = await start('Place de la Concorde', 21, -10, 15);
    const env = cardEnvFromCore(a.core);
    const r = intentCandidates('bloquer', env, env.player!)[0]!;
    const line = buildCard(r, env, 'bloquer').lines[0]!;
    const who = defaultWho(proposeWho(line, r, whoEnvFromCore(a.core, env, [])))!;
    expect(sendCardLine(a.sendEnv(env), line, who, r).ok).toBe(true);
    // la chaîne légale démarre dans la première partie
    const crowdR = intentCandidates('disperser', env, env.player!)[0]!;
    const gas = buildCard(crowdR, env, 'disperser').lines.find((l) => l.action.kind === 'verb' && l.action.type === 'disperser_gaz');
    expect(gas).toBeTruthy();
    a.t.step(2);
    const b = await start('Place de la Concorde', 21, -10, 15);
    expect(b.core.issued.length).toBe(0);
    expect(b.core.legalChain.status()).toBeNull();
    expect(b.core.afterConvoy.size).toBe(0);
    const env2 = cardEnvFromCore(b.core);
    const units = env2.units.filter((u) => u.mine);
    expect(units.length).toBeGreaterThan(0);
  }, 400000);

  it('« Disperser au gaz » confirmé une fois : la chaîne fait les sommations, autorise, et l’unité lance VRAIMENT le gaz', async () => {
    const { t, ctx, core } = await start('Place de la Concorde', 21, -10, 15);
    const refused: string[] = [];
    ctx.events.onAny('police:order_refused', (e) => refused.push(JSON.stringify(e)));
    const said: string[] = [];
    const env = cardEnvFromCore(core);
    const crowdR = intentCandidates('disperser', env, env.player!)[0]!;
    const card = buildCard(crowdR, env, 'disperser');
    const gas = card.lines.find((l) => l.action.kind === 'verb' && l.action.type === 'disperser_gaz')!;
    const who = defaultWho(proposeWho(gas, crowdR, whoEnvFromCore(core, env, [])))!;
    const chk = legalCheck(core, env, gas, who, crowdR);
    expect(chk.plan, chk.reason).toBeTruthy();
    if (env.wind && Math.hypot(env.wind.x, env.wind.z) >= 0.3) expect(JSON.stringify(chk)).toMatch(/le nuage ira vers/);
    core.legalChain.start(chk.plan!);
    let issuedAt = -1;
    for (let i = 0; i < 400 && issuedAt < 0; i++) {
      t.step(1);
      if (core.issued.some((o) => String(o.type) === 'disperser_gaz')) issuedAt = ctx.clock.now;
    }
    expect(issuedAt, JSON.stringify(core.legalChain.status())).toBeGreaterThan(0);
    for (let i = 0; i < 30; i++) {
      t.step(1);
      for (const m of ctx.radio.log) if (/refus|objection|abandonn/i.test(m.text) && !said.includes(m.text)) said.push(m.text);
    }
    const gasRefused = refused.filter((r) => /disperser_gaz/.test(r));
    expect(gasRefused, gasRefused.join('\n') + '\n' + said.join('\n') + `\nroe ${JSON.stringify(ctx.law.roe)}`).toEqual([]);
  }, 400000);

  it('S3 du gaz : le vent et la dérive du nuage en toutes lettres', () => {
    expect(windDrift(1, 0)).toBe('vent d’ouest\u00a0: le nuage ira vers l’est');
    expect(windDrift(0, -1)).toBe('vent de sud\u00a0: le nuage ira vers le nord');
  });

  for (const [role, rank] of [['crs', 'gardien'], ['chef_groupe', 'brigadier_chef'], ['secouriste', 'gardien'], ['manifestant', 'gardien']] as const) {
    it(`rôle ${role} : la carte ne propose que ce que ce rôle peut commander, sans libellé brut`, async () => {
      const { core } = await start('Place de la Concorde', 21, -10, 15, role, rank);
      const env = cardEnvFromCore(core);
      const problems: string[] = [];
      for (const intent of INTENTS) {
        const cands = intentCandidates(intent.id, env, env.player ?? { x: -10, z: 15 });
        for (const r of cands.slice(0, 3)) {
          const card = buildCard(r, env, intent.id);
          problems.push(...checkCard(card, `${role}/${intent.label}/${r.kind}`));
          if (env.level === 'lecture' && (card.lines.length > 0 || card.others.length > 0)) problems.push(`${role} : lecture seule mais des lignes d'ordre`);
        }
      }
      console.log(`[${role}] niveau ${env.level}`);
      if (role === 'chef_groupe') expect(env.level).toBe('unite');
      else expect(env.level).toBe('lecture');
      expect(problems, problems.join('\n')).toEqual([]);
    }, 400000);
  }
});
