// Partie robot du commandant, côté radio : chaque ordre qu'il donne (par la fiche de la carte, comme « Donner l'ordre »,
// ou directement) est écrit tout de suite au journal et en sous-titre (sa phrase n'est pas dite), et l'unité qui le
// reçoit répond « REÇU » — ou « NÉGATIF » avec la raison — moins d'une seconde après, jamais avant la phrase d'ordre,
// BRAV-M comprise (17 s avant : son accusé attendait sur le réseau des unités). Le compte rendu de l'ordre lui revient
// (jamais à CENTRAL), et la distance dite par l'accusé est celle de l'ordre.
import { describe, expect, it } from 'vitest';

import type { GameContext, RadioMessage, Squad } from '@/core/contracts';
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
import type { CardEnv, SendEnv } from '@/ui/command/cardTypes';
import { buildCard, intentCandidates } from '@/ui/command/intents';
import { cardEnvFromCore } from '@/ui/command/reperes';
import { sendCardLine } from '@/ui/command/sendLine';
import { TacticalMap } from '@/ui/command/tacticalMap';
import { TacticalState } from '@/ui/command/tacticalState';
import { isAckText } from '@/sim/police/radio';

const MODULES = [env, world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, incidents, rescue, session, maps, command];
const MEANS = { sections: 3, fourgons: 9, centaure: 1, canon_eau: 1, bravm: 1, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };
type Logged = RadioMessage & { t: number };

async function start(place: string, seed: number, x: number, z: number) {
  const t = createTestContext({ seed, strict: false, modules: MODULES });
  await t.start({
    mode: 'libre', role: 'commandant', rank: 'commandant', place, x, z, crowdSize: 300, tension: 0.4, volatility: 0.3, duration: 'standard',
    extra: { moyens: MEANS, variante: 'terrain' },
  } as never);
  t.step(3);
  const core = t.ctx.service<CommandCore>('ui.command')!;
  const state = new TacticalState();
  const tmap = new TacticalMap(core, { handlers: null } as unknown as MapCanvas, state);
  const sendEnv = (card: CardEnv): SendEnv => ({ core, map: tmap, setSelection: (ids) => state.setSelection(ids), card, trace: null });
  return { t, ctx: t.ctx, core, sendEnv };
}

/** Noms de l'unité et de ses subordonnées (l'accusé vient de l'unité qui reçoit l'ordre). */
function namesOf(ctx: GameContext, squadId: number): Set<string> {
  const out = new Set<string>();
  const walk = (id: number, depth: number): void => {
    const s = ctx.squads.get(id);
    if (!s) return;
    out.add(s.name);
    if (depth < 4) for (const c of ctx.squads.childrenOf(id)) walk(c.id, depth + 1);
  };
  walk(squadId, 0);
  return out;
}

/**
 * Donne l'ordre (`give`), puis avance par pas de 1/30 s jusqu'à l'accusé de l'unité : renvoie le délai, l'accusé et la
 * phrase d'ordre du joueur écrite au journal.
 */
function measure(t: { step(s: number, dt?: number): void }, ctx: GameContext, squadId: number, give: () => void) {
  const names = namesOf(ctx, squadId);
  const from = ctx.radio.log.length;
  const t0 = ctx.clock.now;
  give();
  let ack: Logged | undefined;
  for (let i = 0; i < 90 && !ack; i++) {
    t.step(1 / 30);
    for (let j = from; j < ctx.radio.log.length && !ack; j++) {
      const m = ctx.radio.log[j] as Logged;
      if (names.has(m.from) && isAckText(m.text)) ack = m;
    }
  }
  const me = ctx.player.state.personId;
  const phrase = (ctx.radio.log.slice(from) as Logged[]).find((m) => m.personId === me && m.channel === 'commandement');
  return { delay: ack ? ack.t - t0 : Infinity, ack, phrase, t0 };
}

describe('commandant : l’accusé de réception de chaque ordre s’entend dans la seconde, après l’ordre', () => {
  it('Concorde : section (Bloquer, Tenir, Avancer), BRAV-M (Interpeller) et un refus — accusé ≤ 1 s, jamais avant l’ordre', async () => {
    const { t, ctx, core, sendEnv } = await start('Place de la Concorde', 21, -10, 15);
    const me = ctx.player.state.personId;
    // le réseau du commandement est occupé : la salle parle sans arrêt (avant, l'accusé attendait derrière elle)
    let n = 0;
    const chatter = (): void => {
      ctx.radio.say({ channel: 'commandement', from: 'CENTRAL', priority: 1, text: `MISTRAL ICI CENTRAL. Point de situation numéro ${n++}, circulation dense autour de la place, sans incident. PARLEZ.` });
      ctx.radio.say({ channel: 'unite', from: 'MISTRAL 3', priority: 1, text: `MISTRAL ICI MISTRAL TROIS. Rien à signaler, compte rendu numéro ${n}. PARLEZ.` });
    };
    const results: { what: string; delay: number; text: string }[] = [];
    const check = (what: string, r: ReturnType<typeof measure>, negative = false): void => {
      results.push({ what, delay: r.delay, text: r.ack?.text ?? '(aucun accusé)' });
      expect(r.ack, `${what} : aucun accusé\n${ctx.radio.log.slice(-12).map((m) => `${(m as Logged).t.toFixed(2)} ${m.from}: ${m.text}`).join('\n')}`).toBeDefined();
      expect(r.delay, `${what} : ${r.ack!.text}\n${(ctx.radio.log as Logged[]).filter((m) => m.t >= r.t0 - 25 && m.channel === "commandement").map((m) => `${m.t.toFixed(2)} [${m.channel}${m.reply ? " reply" : ""}${m.silent ? " silent" : ""} p${m.priority}] ${m.from}: ${m.text}`).join("\n")}`).toBeLessThanOrEqual(1.0);
      expect(r.ack!.reply, what).toBe(true);
      expect(r.ack!.channel, what).toBe('commandement');
      expect(/NÉGATIF/.test(r.ack!.text), `${what} : ${r.ack!.text}`).toBe(negative);
      // la phrase d'ordre du joueur est écrite à l'instant de l'ordre, avant l'accusé, sans être dite
      if (r.phrase) {
        expect(r.phrase.t, what).toBeLessThanOrEqual(r.ack!.t);
        expect(r.phrase.silent, what).toBe(true);
      }
    };

    const e0 = cardEnvFromCore(core);
    const secs = e0.units.filter((u) => u.symbol === 'section' && u.mine);
    expect(secs.length).toBeGreaterThanOrEqual(2);
    const sec1 = ctx.squads.get(secs[0]!.squadId)!;
    const sec2 = ctx.squads.get(secs[1]!.squadId)!;
    const lead1 = ctx.people.get(sec1.leaderId)!;

    // 1. « Tenir sa position » à une section (ordre direct, comme la roue)
    chatter();
    t.step(1.2);
    check('Tenir', measure(t, ctx, sec1.id, () => {
      expect(core.issue('tenir', [sec1], null).ok).toBe(true);
    }));
    t.step(8);

    // 2. « Avancer » de 40 m : l'accusé redit la distance de l'ordre (« QUATRE-ZÉRO »)
    chatter();
    t.step(1.7);
    const h = lead1.heading;
    const ax = lead1.x + Math.sin(h) * 40;
    const az = lead1.z + Math.cos(h) * 40;
    const rAv = measure(t, ctx, sec1.id, () => {
      expect(core.issue('avancer', [sec1], [{ x: ax, z: az, heading: h, width: 0 }]).ok).toBe(true);
    });
    check('Avancer 40 m', rAv);
    expect(rAv.phrase?.text ?? '').toMatch(/QUATRE-ZÉRO mètres/);
    expect(rAv.ack!.text).toMatch(/QUATRE-ZÉRO mètres/);
    t.step(8);

    // 3. « Bloquer » une rue par la fiche de la carte (même chemin que « Donner l'ordre »)
    chatter();
    t.step(0.9);
    const e1 = cardEnvFromCore(core);
    const rStreet = intentCandidates('bloquer', e1, e1.player!).find((c) => c.kind === 'rue') ?? intentCandidates('bloquer', e1, e1.player!)[0]!;
    const card = buildCard(rStreet, e1, 'bloquer');
    const line = card.lines[card.defaultLine]!;
    const who = defaultWho(proposeWho(line, rStreet, whoEnvFromCore(core, e1, [])))!;
    const rBl = measure(t, ctx, who.squadIds[0]!, () => {
      const res = sendCardLine(sendEnv(e1), line, who, rStreet);
      expect(res.ok, res.text).toBe(true);
    });
    check(`Bloquer (${who.label})`, rBl);
    t.step(8);

    // 4. BRAV-M : « Interpeller » un lanceur de projectile, par la fiche (son accusé venait 17 s après)
    chatter();
    t.step(1.1);
    const e2 = cardEnvFromCore(core);
    const r = intentCandidates('interpeller', e2, e2.player!)[0]!;
    const offender = ctx.people.nearest(r.x, r.z, 40, (q) => q.faction === 'protest' && q.custody === 'free' && q.vehicleId === 0)!;
    const off = ctx.law.recordOffense(offender, 'jet_projectile', offender.x, offender.z, 3);
    off.witnessed = true;
    const e3 = cardEnvFromCore(core);
    const cardI = buildCard(r, e3, 'interpeller');
    const lineI = cardI.lines[cardI.defaultLine]!;
    const bravm = e3.units.find((u) => u.symbol === 'bravm' && u.mine && ctx.squads.get(u.squadId)?.kind === 'groupe')!;
    const whoI = proposeWho(lineI, r, whoEnvFromCore(core, e3, [])).find((c) => c.squadIds.length === 1 && c.squadIds[0] === bravm.squadId)!;
    expect(whoI, 'la BRAV-M est proposée pour interpeller').toBeDefined();
    check('BRAV-M Interpeller', measure(t, ctx, bravm.squadId, () => {
      const res = sendCardLine(sendEnv(e3), lineI, whoI, r);
      expect(res.ok, res.text).toBe(true);
    }));
    t.step(6);

    // 5. « Interpeller » sans personne qui ait commis un fait : plus un refus (« NÉGATIF ») — l'unité va constater sur
    // place et interpelle au premier fait (spécification « ordres directs » §4.3, « Aller constater ») ; elle le dit,
    // dans la seconde
    chatter();
    t.step(1.4);
    const rNo = measure(t, ctx, sec2.id, () => {
      expect(core.issue('interpeller', [sec2], null, 0).ok).toBe(true);
    });
    check('Interpeller sans fait constaté (aller constater)', rNo);
    expect(rNo.ack!.text).toMatch(/REÇU, je vais constater sur place/);

    console.log(results.map((x) => `${x.what.padEnd(48)} ${x.delay.toFixed(2)} s  ${x.text}`).join('\n'));
    // aucune phrase d'ordre du joueur n'est partie à la voix
    expect((ctx.radio.log as Logged[]).filter((m) => m.personId === me && /ICI/.test(m.text) && m.silent !== true && m.channel === 'commandement'
      && /(Tenez|En avant|Barrez|Interpellez|Interpellation)/.test(m.text))).toEqual([]);
  }, 400000);

  it('Concorde : le compte rendu d’un ordre du commandant lui est adressé (jamais à CENTRAL)', async () => {
    const { t, ctx, core } = await start('Place de la Concorde', 21, -10, 15);
    const company = ctx.squads.list.find((s) => s.leaderId === ctx.player.state.personId && s.parentId === 0) as Squad | undefined;
    expect(company, 'le commandant commande sa compagnie').toBeDefined();
    const sec = ctx.squads.childrenOf(company!.id).find((s) => s.kind === 'section')!;
    const from = ctx.radio.log.length;
    expect(core.issue('tenir', [sec], null).ok).toBe(true);
    let report: Logged | undefined;
    for (let i = 0; i < 90 && !report; i++) {
      t.step(1);
      report = (ctx.radio.log.slice(from) as Logged[]).find((m) => m.from === sec.name && / ICI /.test(m.text) && !isAckText(m.text));
    }
    expect(report, ctx.radio.log.slice(from).map((m) => `${m.from}: ${m.text}`).join('\n')).toBeDefined();
    console.log('compte rendu :', report!.text);
    expect(report!.text.startsWith('CENTRAL ICI')).toBe(false);
    expect(report!.text.startsWith(company!.name.toUpperCase() + ' ICI')).toBe(true);
    // ordre à sa propre compagnie : elle lui rend compte (« AUTORITÉ ICI MISTRAL »), pas à CENTRAL, pas à elle-même
    t.step(5);
    const from2 = ctx.radio.log.length;
    expect(core.issue('tenir', [company!], null).ok).toBe(true);
    let report2: Logged | undefined;
    for (let i = 0; i < 90 && !report2; i++) {
      t.step(1);
      // (la phrase d'ordre du joueur, écrite sans être dite, porte aussi le nom de la compagnie : elle est écartée)
      report2 = (ctx.radio.log.slice(from2) as Logged[]).find((m) => m.from === company!.name && m.silent !== true
        && / ICI /.test(m.text) && !isAckText(m.text));
    }
    expect(report2, ctx.radio.log.slice(from2).map((m) => `${m.from}: ${m.text}`).join('\n')).toBeDefined();
    console.log('compte rendu de la compagnie :', report2!.text);
    expect(report2!.text.startsWith('AUTORITÉ ICI ')).toBe(true);
  }, 400000);
});
