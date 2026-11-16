/* =====================================================================================
 * COMMANDEMENT — durée et fin de mission : relève d'une unité épuisée par la réserve, ravitaillement
 * aux fourgons, fermeture d'une station de métro quand des renforts hostiles affluent (et réouverture
 * à la dispersion), barrages filtrants à l'annonce de la dispersion, puis regroupement, rembarquement
 * et « Fin de mission, retour à la base ». Fonctions sur un Command (command.ts).
 * ===================================================================================== */

import { COMMAND_MISSION_END_EVENT } from './api';
import type { Command } from './command';
import * as TX from './texts';

// ───────────────────────────── logistique ─────────────────────────────

export function logistics(cmd: Command): void {
  const core = cmd.core;
  const status = core.status;
  if (!status) return;
  const now = core.now;
  for (let i = 0; i < cmd.elements.length; i++) {
    const el = cmd.elements[i];
    const st = status.of(el.squadId);
    if (!st) continue;
    // relève d'une unité épuisée ou entamée, par la réserve
    if (el.role === 'poste' && st.needsRelief && now - el.reliefAt > 120) {
      const res = cmd.available(st.x, st.z);
      const delay = 60 * (1 - cmd.state.aptitude);
      if (res && res !== el && now - el.lastAt > delay && cmd.ready('releve:' + el.squadId, 90)) {
        const post = el.post;
        cmd.act('releve:' + el.squadId, 2, st.x, st.z, TX.propose(el.name + ' demande la relève', 'de la relever par ' + res.name), () => {
          el.reliefAt = now;
          const lead = core.leader(core.ctx.squads.get(el.squadId));
          cmd.order(res, 'releve', { type: 'releve', x: st.x, z: st.z, heading: st.heading, targetId: lead ? lead.id : el.squadId }, TX.orderForce(res.name, cmd.squad.name, 'releve', '', 0, 0));
          res.role = 'poste';
          res.post = post;
          if (post) post.squadId = res.squadId;
          el.role = 'reserve';
          el.post = null;
          if (cmd.state.reserveId === res.squadId) cmd.state.reserveId = el.squadId;
        });
      }
    }
    // ravitaillement aux fourgons quand la dotation de grenades est entamée de moitié
    if (el.ammo0 > 0 && el.task === '' && !st.underAttack && st.phase !== 'mouvement') {
      const left = st.ammo.lacrymoMain + st.ammo.lacrymoLanceur;
      const stock = st.reserve.lacrymoMain + st.reserve.lacrymoLanceur;
      const limit = el.role === 'poste' ? 0.3 : 0.5;
      if (left < el.ammo0 * limit && stock > 0 && cmd.ready('ravit:' + el.squadId, 240)) {
        cmd.act('ravit:' + el.squadId, 1, st.x, st.z, TX.propose(el.name + ' est à court de grenades', 'un ravitaillement aux fourgons'), () => {
          cmd.task(el, 'ravitaillement', { type: 'ravitailler' }, TX.orderForce(el.name, cmd.squad.name, 'ravitailler', '', 0, 0));
        });
      }
    }
  }
}

/** Vague sortie d'une station pendant une phase tendue : renforts hostiles. */
export function onMetroWave(cmd: Command, stationId: number, count: number): void {
  if (cmd.pic.tension < 0.45 && cmd.pic.phase !== 'tension' && cmd.pic.phase !== 'affrontement') return;
  cmd.inflow.set(stationId, (cmd.inflow.get(stationId) ?? 0) + count);
}

export function metro(cmd: Command): void {
  const core = cmd.core;
  const metro = core.metro;
  if (!metro) return;
  const pic = cmd.pic;
  const cmd = cmd.commander();
  const tense = pic.tension >= 0.45 || pic.phase === 'tension' || pic.phase === 'affrontement';
  if (pic.basePhase === 'dispersion' || pic.basePhase === 'apres_manif' || pic.basePhase === 'terminee') {
    // la foule doit pouvoir partir : un bon chef fait rouvrir les stations qu'il a fermées
    if (cmd.closedStations.length > 0 && cmd.state.aptitude >= 0.3 && cmd.ready('metro:rouvre', 30)) {
      const id = cmd.closedStations[0];
      const st = metro.get(id);
      cmd.act('metro:rouvre', 1, st ? st.x : 0, st ? st.z : 0, TX.propose('la dispersion est annoncée, la station ' + (st ? st.name : '') + ' est fermée', 'de la rouvrir'), () => {
        cmd.closedStations.shift();
        if (!st) return;
        metro.setOpen(id, true, cmd ? cmd.id : 0);
        const text = TX.stationReopened(cmd.squad.name, st.name);
        cmd.say(text);
        core.decide(cmd.squad.id, 'metro', text, 0, '', st.x, st.z);
      });
    }
    return;
  }
  if (!tense) return;
  const stations = metro.stations;
  for (let i = 0; i < stations.length; i++) {
    const st = stations[i];
    if (!st.open) continue;
    const arrived = cmd.inflow.get(st.id) ?? 0;
    // renforts constatés (deux vagues), ou affluence encore forte à moins de 300 m d'un point chaud
    const hot = pic.near(st.x, st.z, 300);
    const feeding = arrived >= 30 || (st.inflow >= 20 && hot !== null && hot.heat >= core.tuning.reactHeat);
    if (!feeding || !hot) continue;
    const key = 'metro:' + st.id;
    if (!cmd.ready(key, 120)) continue;
    cmd.act(key, 2, st.x, st.z, TX.propose('des renforts hostiles arrivent par la station ' + st.name, 'de demander sa fermeture'), () => {
      metro.setOpen(st.id, false, cmd ? cmd.id : 0);
      cmd.closedStations.push(st.id);
      cmd.inflow.set(st.id, 0);
      cmd.state.stationsClosed++;
      const text = TX.stationClosed(cmd.squad.name, st.name);
      cmd.say(text, 2);
      core.decide(cmd.squad.id, 'metro', text, 0, '', st.x, st.z);
    });
  }
}

// ───────────────────────────── dispersion, fin de mission ─────────────────────────────

/** À l'annonce de la dispersion : barrages filtrants, la foule doit pouvoir sortir. */
export function dispersion(cmd: Command): void {
  const core = cmd.core;
  if (!cmd.ready('dispersion', 100000)) return;
  cmd.act('dispersion', 2, cmd.gx, cmd.gz, TX.propose('les organisateurs annoncent la dispersion', 'de passer les barrages en filtrage pour laisser sortir la foule'), () => {
    const text = TX.dispersion(cmd.squad.name);
    cmd.say(text);
    core.decide(cmd.squad.id, 'dispersion', text, 0, '', cmd.gx, cmd.gz);
    for (let i = 0; i < cmd.elements.length; i++) {
      const el = cmd.elements[i];
      const p = el.post;
      if (el.role !== 'poste' || !p || p.kind !== 'barrage' || el.task !== '') continue;
      cmd.order(el, 'dispersion', { type: 'filtrer', x: p.x, z: p.z, heading: p.heading, width: 0 }, '');
    }
  });
}

export function checkEnd(cmd: Command): void {
  const pic = cmd.pic;
  const now = cmd.core.now;
  let over = cmd.endRequested || pic.basePhase === 'terminee';
  if (!over && pic.active && (pic.basePhase === 'dispersion' || pic.basePhase === 'apres_manif') && pic.total > 0) {
    const few = pic.present <= Math.max(3, pic.total * 0.05);
    over = few && now - cmd.phaseSince > 60 && cmd.pic.hottest(0.5) === null;
  }
  if (!over || !cmd.ready('fin', 100000)) return;
  cmd.act('fin', 2, cmd.pcX, cmd.pcZ, TX.propose('dispersion effective, chaussée libre', 'le regroupement et le rembarquement'), () => startEnd(cmd));
}

export function startEnd(cmd: Command): void {
  const core = cmd.core;
  const ctx = core.ctx;
  const cmd = cmd.commander();
  cmd.setPhase('fin');
  ctx.law.authorize(1, cmd ? cmd.id : 0);
  cmd.state.authorized = 1;
  for (let i = 0; i < cmd.posts.length; i++) {
    const p = cmd.posts[i];
    if (p.closureId !== 0 && core.traffic) core.traffic.open(p.closureId);
    p.closureId = 0;
    if (p.state !== 'leve') p.state = 'leve';
    p.squadId = 0;
  }
  if (core.metro) for (let i = 0; i < cmd.closedStations.length; i++) core.metro.setOpen(cmd.closedStations[i], true, cmd ? cmd.id : 0);
  cmd.closedStations.length = 0;
  const text = TX.regroup(cmd.squad.name, core.sector(cmd.pcX, cmd.pcZ));
  cmd.say(text);
  core.decide(cmd.squad.id, 'fin', text, 0, '', cmd.pcX, cmd.pcZ);
  // chaque section se regroupe en colonne au poste de commandement
  cmd.rallied.length = 0;
  const done: number[] = [];
  for (let i = 0; i < cmd.elements.length; i++) {
    const el = cmd.elements[i];
    el.role = 'libre';
    el.post = null;
    el.task = '';
    el.pending = null;
    if (done.indexOf(el.sectionId) >= 0) continue;
    done.push(el.sectionId);
    core.issue(el.sectionId, { type: 'colonne', x: cmd.pcX, z: cmd.pcZ, width: 0, issuedBy: cmd.issuer() });
    cmd.rallied.push(el.sectionId);
  }
  // moyens spéciaux : retour à leur base
  for (let i = 0; i < cmd.attached.length; i++) {
    const sp = cmd.specials.of(cmd.attached[i]);
    if (sp) core.issue(sp.squad.id, { type: 'repli', x: sp.homeX, z: sp.homeZ, issuedBy: cmd.issuer() });
  }
  cmd.endStep = 1;
  cmd.endT = core.now;
}

export function thinkEnd(cmd: Command): void {
  const core = cmd.core;
  const now = core.now;
  if (cmd.endStep === 1) {
    // on attend les sections au point de regroupement ; une seule retardataire n'immobilise pas la compagnie
    if (cmd.rallied.length > 0 && now - cmd.endT < (cmd.rallied.length === 1 ? 130 : 240)) return;
    const fleet = core.vehicles;
    core.fleet(cmd.squad.id, fleet);
    let usable = 0;
    for (let i = 0; i < fleet.length; i++) if (core.usable(fleet[i]) && !fleet[i].def.flying && fleet[i].kind !== 'moto_bravm') usable++;
    const exit = cmd.base ?? cmd.convoy.originOf(cmd.squad.id);
    if (usable > 0 && cmd.convoy.depart(cmd.squad.id, exit ?? undefined)) {
      cmd.endStep = 2;
      cmd.endT = now;
    } else {
      announceEnd(cmd, 0);
    }
  } else if (cmd.endStep === 2) {
    const st = cmd.convoy.statusOf(cmd.squad.id);
    if (st && st.stage === 'rembarquement' && now - cmd.endT < 260) return;
    const status = core.status ? core.status.of(cmd.squad.id) : null;
    // des retardataires sont restés à pied : on les attend, une fois
    if (status && cmd.embarkTries === 0 && status.embarked < status.valid && status.valid - status.embarked <= status.total * 0.4) {
      cmd.embarkTries = 1;
      cmd.endT = now;
      core.issue(cmd.squad.id, { type: 'embarquer', issuedBy: cmd.issuer() });
      cmd.endStep = 4;
      return;
    }
    announceEnd(cmd, status ? status.embarked : 0);
  } else if (cmd.endStep === 4) {
    const status = core.status ? core.status.of(cmd.squad.id) : null;
    if (!cmd.embarkDone && now - cmd.endT < 110) return;
    announceEnd(cmd, status ? status.embarked : 0);
  }
}

export function announceEnd(cmd: Command, embarked: number): void {
  const core = cmd.core;
  const status = core.status ? core.status.of(cmd.squad.id) : null;
  let arrests = status ? status.arrests : 0;
  for (let i = 0; i < cmd.elements.length; i++) {
    const st = core.status ? core.status.of(cmd.elements[i].squadId) : null;
    if (st && st.arrests > arrests) arrests = st.arrests;
  }
  const text = TX.missionEnd(cmd.squad.name, embarked, arrests);
  cmd.say(text);
  core.decide(cmd.squad.id, 'fin', text, 0, '', cmd.pcX, cmd.pcZ);
  cmd.state.missionEnded = true;
  core.ctx.events.emitAny(COMMAND_MISSION_END_EVENT, { squadId: cmd.squad.id, t: core.now });
  cmd.endStep = 3;
  cmd.setPhase('termine');
}
