/* =====================================================================================
 * FORCES DE L'ORDRE — exécution des ordres de formation et de mouvement.
 *
 *   startOrder()  prise en compte immédiate d'un ordre : nouvelle formation, objectif du repère ;
 *   progress()    à chaque pas : marche du repère, suivi d'une cible, enchaînement des étapes
 *                 (mise en place → en place → mouvement → arrêt et réalignement → compte rendu).
 *
 * Allures et distances : docs/research/00-bible-realisme.md §E.8 (ligne au pas 1,2 m/s, bond
 * offensif au trot 2,3 m/s sur 15 à 25 m puis arrêt net et réalignement, charge à 4 m/s sur 30 à
 * 60 m, sifflet, repli au pas sur la ligne de départ, vague de refoulement par tronçons de 50 m).
 * Les ordres particuliers (encerclement, relève, barrages de rue, véhicules) sont dans special.ts.
 * ===================================================================================== */

import type { SquadOrder } from '@/core/contracts';
import { angleDiff, cardinalFr } from '@/core/math';
import type { FormGroup, Unit } from './brain';
import { F_BOX, F_COLUMN, F_HOLD, F_LINE, F_NONE, F_SCREEN, F_TORTUE } from './brain';
import type { Kernel } from './kernel';
import {
  allSettled, commonRunSpeed, copyOrder, done, filesFor, formBox, formColumn, formHold, formLine, formScreen, formTortue,
  formLate, gather, hasFormation, inPlace, isAligned, leaderOf, mainGroup, moveTo, personById, react, reform, report, setPhase,
  setStep, stepColumn, stepFrame, stopGroup, unitCenter, vehicleById,
} from './mcore';
import { appendPath, measure, placeGroup, settleSlots } from './place';
import { ackBody, acknowledge, spell } from './radio';
import { leavePost, progressEncircle, startEncircle } from './encircle';
import {
  progressBarrage, progressBoarding, progressCrew, progressRelief, startBarrage, startCrewOrder, startDisembark, startEmbark, startRelief,
} from './special';
import * as T from './tuning';

/** Prise en compte d'un ordre de formation par l'unité racine `u`. */
export function startOrder(k: Kernel, u: Unit, o: SquadOrder): void {
  leavePost(k, u);
  const order = copyOrder(o);
  u.order = order;
  u.reported = false;
  u.needsRelief = u.needsRelief && order.type !== 'repli';
  const m = u.man;
  m.step = 0;
  m.stepT = k.now;
  m.deploy = false;
  m.targetId = order.targetId;
  m.otherId = 0;
  m.pauseUntil = 0;
  m.volleys = 0;
  react(k, u);
  gather(k, u);
  unitCenter(k, u);
  const cx = k.v2.x;
  const cz = k.v2.z;
  const dist = Math.sqrt((order.x - cx) * (order.x - cx) + (order.z - cz) * (order.z - cz));
  u.ackAt = k.now + 0.35 + ((u.id * 0.173) % 0.4);
  u.ackText = acknowledge(u.squad.name, ackBody(k, order, dist));

  if (u.squad.kind === 'equipage' && startCrewOrder(k, u, order)) return;

  const g = mainGroup(u);
  const type = order.type;
  switch (type) {
    case 'ligne':
      formLine(k, u, order.x, order.z, order.heading, order.width);
      setPhase(k, u, 'mise_en_place');
      break;

    case 'tenir': {
      const near = (order.x - g.ax) * (order.x - g.ax) + (order.z - g.az) * (order.z - g.az) <= (12 + g.width * 0.6) * (12 + g.width * 0.6);
      if ((isAligned(g) || g.kind === F_COLUMN) && near && u.groups.length === 1) {
        // déjà en formation ici : halte sur place et réalignement
        stopGroup(g);
        placeGroup(k, g);
        settleSlots(k, g);
      } else if (u.groups.length > 1 && near) {
        for (let i = 0; i < u.groups.length; i++) stopGroup(u.groups[i]);
      } else {
        formLine(k, u, order.x, order.z, order.heading, order.width);
      }
      setPhase(k, u, 'mise_en_place');
      break;
    }

    case 'tortue': {
      let x = order.x;
      let z = order.z;
      let h = order.heading;
      if (isAligned(g) && dist < 14 + g.width) {
        x = g.ax;
        z = g.az;
        if (Math.abs(angleDiff(g.ah, h)) < 1.1) h = g.ah;
      }
      formTortue(k, u, x, z, h);
      setPhase(k, u, 'mise_en_place');
      break;
    }

    case 'colonne': {
      startColumn(k, u, order.x, order.z, filesFor(order.width, u.formed));
      break;
    }

    case 'avancer':
      startAdvance(k, u, order);
      break;

    case 'bond_offensif':
    case 'charge':
    case 'refoulement':
      startRush(k, u, order);
      break;

    case 'repli': {
      if (!hasFormation(u)) {
        formLine(k, u, order.x, order.z, order.heading, order.width);
        setPhase(k, u, 'mise_en_place');
        break;
      }
      if (g.kind === F_COLUMN) {
        startColumn(k, u, order.x, order.z, g.files);
        break;
      }
      const h = Math.abs(angleDiff(g.ah, order.heading)) < 1.2 ? order.heading : g.ah;
      const d = Math.sqrt((order.x - g.ax) * (order.x - g.ax) + (order.z - g.az) * (order.z - g.az));
      if (d <= 140 && k.sight(g.ax, g.az, order.x, order.z)) {
        // recul ordonné : le repère recule, les agents gardent la face tournée vers la foule
        moveTo(g, order.x, order.z, h, k.tuning.repli);
        setStep(k, u, 1);
        setPhase(k, u, 'mouvement');
      } else {
        m.deploy = true;
        m.gx = order.x;
        m.gz = order.z;
        m.gh = h;
        m.deployWidth = order.width > 0 ? order.width : g.kind === F_LINE ? g.width : 0;
        startColumn(k, u, order.x, order.z, filesFor(0, u.formed));
      }
      break;
    }

    case 'suivre': {
      let id = order.targetId > 0 ? order.targetId : order.issuedBy;
      const leader = leaderOf(k, u);
      if (id === 0 || (leader && id === leader.id)) id = k.ctx.player.state.personId;
      const tp = personById(k, id);
      const tv = tp ? null : vehicleById(k, id);
      if (!tp && !tv) {
        formHold(k, u);
        inPlace(k, u, '');
        done(k, u, type, false, 'Personne à suivre.');
        break;
      }
      const tx = tp ? tp.x : tv!.x;
      const tz = tp ? tp.z : tv!.z;
      const hx = leader ? leader.x : cx;
      const hz = leader ? leader.z : cz;
      const col = formColumn(k, u, hx, hz, tx, tz, filesFor(order.width, u.formed));
      col.followId = id;
      col.radius = tv ? tv.def.length * 0.5 + 4 : 2.6;
      col.moving = true;
      col.speed = k.tuning.pace;
      m.targetId = id;
      setStep(k, u, 1);
      setPhase(k, u, 'mouvement');
      break;
    }

    case 'proteger': {
      const tp = personById(k, order.targetId);
      const tv = tp ? null : vehicleById(k, order.targetId);
      const x = tp ? tp.x : tv ? tv.x : order.x;
      const z = tp ? tp.z : tv ? tv.z : order.z;
      const radius = tv ? Math.hypot(tv.def.length, tv.def.width) * 0.5 + 2.2 : order.width > 0 ? order.width * 0.5 : T.SCREEN_RADIUS_MIN;
      const sg = formScreen(k, u, x, z, order.heading, radius);
      sg.followId = tp || tv ? order.targetId : 0;
      setPhase(k, u, 'mise_en_place');
      break;
    }

    case 'escorter': {
      const tp = personById(k, order.targetId);
      const tv = tp ? null : vehicleById(k, order.targetId);
      if (!tp && !tv) {
        formLine(k, u, order.x, order.z, order.heading, order.width);
        setPhase(k, u, 'mise_en_place');
        break;
      }
      const bg = formBox(k, u, tp ? tp.x : tv!.x, tp ? tp.z : tv!.z, tp ? tp.heading : tv!.heading, tv ? tv.def.length * 0.5 : 0.5, tv ? tv.def.width * 0.5 : 0.4);
      bg.followId = order.targetId;
      setStep(k, u, 1);
      setPhase(k, u, 'mise_en_place');
      break;
    }

    case 'encercler':
      startEncircle(k, u, order);
      break;

    case 'releve':
      startRelief(k, u, order);
      break;

    case 'couper_circulation':
    case 'filtrer':
      startBarrage(k, u, order);
      break;

    case 'embarquer':
      startEmbark(k, u, order);
      break;

    case 'debarquer':
      startDisembark(k, u, order);
      break;

    case 'cesser':
      for (let i = 0; i < u.groups.length; i++) {
        const gi = u.groups[i];
        const follow = gi.kind === F_COLUMN && gi.followId !== 0;
        stopGroup(gi);
        if (follow) gi.followId = 0;
        if (gi.kind === F_SCREEN || gi.kind === F_BOX) gi.followId = 0;
        placeGroup(k, gi);
        settleSlots(k, gi);
      }
      if (u.groups.length === 0 || g.kind === F_NONE) formHold(k, u);
      setPhase(k, u, 'mise_en_place');
      break;

    case 'libre':
    default:
      if (!hasFormation(u) && g.kind !== F_HOLD) formHold(k, u);
      for (let i = 0; i < u.groups.length; i++) stopGroup(u.groups[i]);
      setPhase(k, u, 'repos');
      u.reported = true;
      break;
  }
}

/** Mise en colonne puis marche vers (x, z). */
function startColumn(k: Kernel, u: Unit, x: number, z: number, files: number): void {
  const g = mainGroup(u);
  const leader = leaderOf(k, u);
  let hx: number;
  let hz: number;
  if (g.kind === F_COLUMN && g.agents.length > 0) {
    hx = g.ax;
    hz = g.az;
  } else if (leader && leader.vehicleId === 0 && leader.posture !== 'down') {
    hx = leader.x;
    hz = leader.z;
  } else {
    unitCenter(k, u);
    hx = k.v2.x;
    hz = k.v2.z;
  }
  const col = formColumn(k, u, hx, hz, x, z, files);
  col.speed = k.now < u.trotUntil ? k.tuning.trot : k.tuning.pace;
  setStep(k, u, 0);
  setPhase(k, u, 'mise_en_place');
}

/** « Avancer » : la formation en cours rejoint le point d'un bloc ; en colonne par les rues si le trajet n'est pas direct. */
function startAdvance(k: Kernel, u: Unit, o: SquadOrder): void {
  const g = mainGroup(u);
  const m = u.man;
  if (g.kind === F_COLUMN) {
    startColumn(k, u, o.x, o.z, g.files);
    return;
  }
  if (!isAligned(g)) {
    // hors formation : ligne sur place, face au but, puis marche
    unitCenter(k, u);
    const cx = k.v2.x;
    const cz = k.v2.z;
    const d = Math.sqrt((o.x - cx) * (o.x - cx) + (o.z - cz) * (o.z - cz));
    formLine(k, u, cx, cz, d > 2 ? Math.atan2(o.x - cx, o.z - cz) : o.heading, o.width);
  }
  const d = Math.sqrt((o.x - g.ax) * (o.x - g.ax) + (o.z - g.az) * (o.z - g.az));
  if (d <= 160 && k.sight(g.ax, g.az, o.x, o.z)) {
    if (Math.abs(angleDiff(g.ah, o.heading)) > 0.9) refit(k, u, g, o.heading);
    moveTo(g, o.x, o.z, o.heading, g.kind === F_TORTUE ? k.tuning.tortue : k.tuning.pace);
    setStep(k, u, 1);
    setPhase(k, u, 'mouvement');
  } else {
    m.deploy = true;
    m.gx = o.x;
    m.gz = o.z;
    m.gh = o.heading;
    m.deployWidth = o.width > 0 ? o.width : g.kind === F_LINE ? g.width : 0;
    startColumn(k, u, o.x, o.z, filesFor(0, u.formed));
  }
}

/** Refait la formation sur place face à un nouveau cap (volte-face, conversion franche) : réaffectation sans croisement. */
function refit(k: Kernel, u: Unit, g: FormGroup, heading: number): void {
  const x = g.ax;
  const z = g.az;
  if (g.kind === F_TORTUE) formTortue(k, u, x, z, heading);
  else if (g.kind === F_LINE) formLine(k, u, x, z, heading, g.width);
}

/** Bond offensif, charge, vague de refoulement : la ligne se porte en avant d'un bloc. */
function startRush(k: Kernel, u: Unit, o: SquadOrder): void {
  let g = mainGroup(u);
  const m = u.man;
  const type = o.type;
  if (g.kind !== F_LINE && g.kind !== F_TORTUE) {
    unitCenter(k, u);
    g = formLine(k, u, k.v2.x, k.v2.z, o.heading, o.width);
  } else if (g.moving) {
    stopGroup(g);
  }
  // direction : vers le point désigné s'il est devant la ligne, sinon droit devant
  let dx = o.x - g.ax;
  let dz = o.z - g.az;
  let d = Math.sqrt(dx * dx + dz * dz);
  const fx = Math.sin(g.ah);
  const fz = Math.cos(g.ah);
  let pointed = d > 6;
  if (pointed && (dx * fx + dz * fz) / d < 0.25 && Math.abs(angleDiff(g.ah, o.heading)) < 0.6) pointed = false;
  if (!pointed) {
    dx = fx;
    dz = fz;
    d = 0;
  } else {
    dx /= d;
    dz /= d;
  }
  const dirH = Math.atan2(dx, dz);
  if (Math.abs(angleDiff(g.ah, dirH)) > 0.9) {
    refit(k, u, g, dirH);
    g = mainGroup(u);
  }
  let len: number;
  if (type === 'bond_offensif') len = d > 0 ? Math.min(T.BOND_MAX, Math.max(T.BOND_MIN, d)) : T.BOND_DEFAULT;
  else if (type === 'charge') len = d > 0 ? Math.min(T.CHARGE_MAX, Math.max(T.CHARGE_MIN, d)) : T.CHARGE_DEFAULT;
  else len = d > 0 ? d : T.WAVE_LEG;
  // la manœuvre s'arrête avant un mur
  const hit = k.hit;
  if (k.ctx.world.raycast(g.ax, g.az, g.ax + dx * (len + 2), g.az + dz * (len + 2), hit) && hit.hit) {
    const free = hit.t * (len + 2) - 2;
    if (free < len) len = free > 1 ? free : 1;
  }
  m.x0 = g.ax;
  m.z0 = g.az;
  m.h0 = g.ah;
  m.gx = dx;
  m.gz = dz;
  m.gh = dirH;
  m.left = len;
  setStep(k, u, 0);
  setPhase(k, u, 'mise_en_place');
}

function launchLeg(k: Kernel, u: Unit, g: FormGroup): void {
  const m = u.man;
  const type = u.order!.type;
  let leg = m.left;
  let speed: number;
  if (type === 'bond_offensif') speed = Math.min(k.tuning.trot, commonRunSpeed(u, k.tuning.trot));
  else if (type === 'charge') speed = commonRunSpeed(u, k.tuning.charge);
  else {
    speed = k.tuning.pace;
    if (leg > T.WAVE_LEG) leg = T.WAVE_LEG;
  }
  m.left -= leg;
  moveTo(g, g.ax + m.gx * leg, g.az + m.gz * leg, m.gh, speed);
  setStep(k, u, 1);
  setPhase(k, u, 'mouvement');
}

/** Suivi d'une cible par une colonne : la tête marche sur la trace de la cible, à distance. */
function followColumn(k: Kernel, u: Unit, g: FormGroup, dt: number): void {
  const tp = personById(k, g.followId);
  const tv = tp ? null : vehicleById(k, g.followId);
  if (!tp && !tv) {
    stopGroup(g);
    g.followId = 0;
    inPlace(k, u, '');
    return;
  }
  appendPath(g, tp ? tp.x : tv!.x, tp ? tp.z : tv!.z);
  const goal = g.total - g.radius;
  let cohesion = 1 - (g.errAll - 0.6) / 1.6;
  if (cohesion > 1) cohesion = 1;
  else if (cohesion < 0.2) cohesion = 0.2;
  let want = (goal - g.s) * 1.4;
  const max = k.tuning.trot * cohesion;
  if (want > max) want = max;
  if (want < 0) want = 0;
  const dv = (want > g.v ? T.FRAME_ACCEL : T.FRAME_DECEL * 2) * dt;
  g.v = want > g.v ? Math.min(want, g.v + dv) : Math.max(want, g.v - dv);
  g.s += g.v * dt;
  g.moving = g.v > 0.01;
  g.dirty = true;
}

/** Écran ou escorte : le repère suit la cible. */
function followFrame(k: Kernel, g: FormGroup): void {
  const tp = personById(k, g.followId);
  const tv = tp ? null : vehicleById(k, g.followId);
  if (!tp && !tv) {
    g.followId = 0;
    return;
  }
  const x = tp ? tp.x : tv!.x;
  const z = tp ? tp.z : tv!.z;
  const dx = x - g.ax;
  const dz = z - g.az;
  const d2 = dx * dx + dz * dz;
  if (g.kind === F_BOX) {
    const sp = tp ? Math.sqrt(tp.vx * tp.vx + tp.vz * tp.vz) : Math.abs(tv!.speed);
    let h = g.th;
    if (tv) h = tv.heading;
    else if (sp > 0.4) h = Math.atan2(tp!.vx, tp!.vz);
    if (d2 > 0.04 || Math.abs(angleDiff(g.ah, h)) > 0.05) {
      let speed = sp + 0.9;
      if (speed < 1.2) speed = 1.2;
      else if (speed > 2.8) speed = 2.8;
      moveTo(g, x, z, h, speed);
    }
  } else if (d2 > 0.16) {
    moveTo(g, x, z, g.ah, 1.6);
  }
}

function lineReport(u: Unit, g: FormGroup): string {
  const w = Math.round(g.width);
  return 'Barrage en place, face ' + cardinalFr(g.ah) + (w >= 2 ? ', front ' + spell(w) + ' mètres' : '') + ', ' + spell(u.formed) + ' à pied';
}

/** Avancement de la manœuvre de l'unité racine `u` (appelé à chaque pas). */
export function progress(k: Kernel, u: Unit, dt: number): void {
  const o = u.order;
  const groups = u.groups;
  // reformation différée (pertes, retours d'agents)
  if (u.reformAt !== 0 && k.now >= u.reformAt) {
    u.reformAt = 0;
    if (groups.length === 1) reform(k, u);
    else if (o && o.type === 'encercler') progressEncircle(k, u, true);
  }
  // marche des repères
  let arrived = false;
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    if (g.followId !== 0) {
      if (g.kind === F_COLUMN) followColumn(k, u, g, dt);
      else followFrame(k, g);
    }
    if (g.moving && !(g.kind === F_COLUMN && g.followId !== 0)) {
      if (g.kind === F_COLUMN ? stepColumn(g, dt) : stepFrame(g, dt)) {
        arrived = true;
        placeGroup(k, g);
        settleSlots(k, g);
      }
    }
    // la porte ouverte pour un binôme se referme : le rang reprend ses intervalles
    if (g.doorW > 0 && k.now >= g.doorUntil) {
      g.doorW = 0;
      g.dirty = true;
      placeGroup(k, g);
      if (!g.moving) settleSlots(k, g);
    }
    if (g.dirty) placeGroup(k, g);
    // mesure de l'alignement : à chaque pas en marche, cinq fois par seconde à l'arrêt
    if (g.moving || ((k.ctx.clock.tick + u.id) % 6) === 0) measure(g);
  }
  if (!o) return;
  if (u.squad.kind === 'equipage' && progressCrew(k, u)) return;
  const g = groups.length > 0 ? groups[0] : null;
  if (!g) return;
  const m = u.man;
  const type = o.type;
  switch (type) {
    case 'ligne':
    case 'tenir':
    case 'tortue':
    case 'cesser':
    case 'proteger':
      if (u.phase === 'mise_en_place' && (allSettled(u, T.IN_PLACE_TOLERANCE) || formLate(k, u))) {
        const body = type === 'tortue' ? 'Tortue formée, boucliers hauts'
          : type === 'cesser' ? 'Halte. Action interrompue, je tiens sur place'
            : type === 'proteger' ? 'Dispositif de protection en place'
              : g.kind === F_LINE ? lineReport(u, g) : 'En position';
        inPlace(k, u, body);
        done(k, u, type, true, '');
      }
      break;

    case 'colonne':
    case 'avancer':
    case 'repli':
      if (g.kind === F_COLUMN) {
        if (m.step === 0) {
          // la colonne se forme, puis s'ébranle
          if (g.errAll <= 0.9 || k.now - m.stepT > 10) {
            measure(g);
            if (g.errAll <= 0.9 || k.now - m.stepT > 10) {
              g.moving = true;
              g.speed = k.now < u.trotUntil ? k.tuning.trot : k.tuning.pace;
              setStep(k, u, 1);
              setPhase(k, u, 'mouvement');
            }
          }
        } else if (m.step === 1 && arrived) {
          if (m.deploy) {
            m.deploy = false;
            formLine(k, u, m.gx, m.gz, m.gh, m.deployWidth);
            setStep(k, u, 2);
            setPhase(k, u, 'mise_en_place');
          } else {
            setStep(k, u, 3);
            inPlace(k, u, 'Arrivé au point, en colonne par ' + (g.files === 3 ? 'trois' : 'deux'));
            done(k, u, type, true, '');
          }
        }
      } else if (m.step === 1 && arrived) {
        setStep(k, u, 2);
        setPhase(k, u, 'mise_en_place');
      } else if ((m.step === 2 || u.phase === 'mise_en_place') && (allSettled(u, T.IN_PLACE_TOLERANCE) || formLate(k, u))) {
        setStep(k, u, 3);
        inPlace(k, u, type === 'repli' ? 'Repli effectué, en position face ' + cardinalFr(g.ah) : g.kind === F_LINE ? lineReport(u, g) : 'En position');
        done(k, u, type, true, '');
      }
      break;

    case 'bond_offensif':
    case 'charge':
    case 'refoulement':
      progressRush(k, u, g, arrived);
      break;

    case 'escorter':
      if (u.phase === 'mise_en_place' && (allSettled(u, 0.6) || formLate(k, u))) inPlace(k, u, 'Escorte en place');
      break;

    case 'suivre':
      break;

    case 'encercler':
      progressEncircle(k, u, false);
      break;

    case 'releve':
      progressRelief(k, u, arrived);
      break;

    case 'couper_circulation':
    case 'filtrer':
      progressBarrage(k, u);
      break;

    case 'embarquer':
    case 'debarquer':
      progressBoarding(k, u);
      break;

    default:
      break;
  }
}

function progressRush(k: Kernel, u: Unit, g: FormGroup, arrived: boolean): void {
  const m = u.man;
  const type = u.order!.type;
  switch (m.step) {
    case 0:
      // ligne prête (ou délai court écoulé) : en avant
      if (k.now - m.stepT >= 0.6 && (allSettled(u, 0.5) || k.now - m.stepT > 6)) launchLeg(k, u, g);
      break;
    case 1:
      if (!arrived) break;
      if (type === 'charge') {
        // coup de sifflet : arrêt net, puis repli au pas sur la ligne de départ
        k.ctx.events.emit('sfx', { id: 'sifflet', x: g.ax, y: k.ctx.world.heightAt(g.ax, g.az) + 1.6, z: g.az, volume: 1 });
        setStep(k, u, 2);
        setPhase(k, u, 'action');
      } else if (type === 'refoulement' && m.left > 1) {
        m.pauseUntil = k.now + T.WAVE_PAUSE;
        setStep(k, u, 2);
        setPhase(k, u, 'action');
      } else {
        setStep(k, u, 3);
        setPhase(k, u, 'mise_en_place');
      }
      break;
    case 2:
      if (type === 'charge') {
        if (k.now - m.stepT >= 1.5) {
          moveTo(g, m.x0, m.z0, m.h0, k.tuning.pace);
          setStep(k, u, 4);
          setPhase(k, u, 'mouvement');
        }
      } else if (k.now >= m.pauseUntil) {
        launchLeg(k, u, g);
      }
      break;
    case 3:
      // halte : réalignement, puis compte rendu
      if (k.now - m.stepT >= T.REALIGN_TIME && (allSettled(u, T.IN_PLACE_TOLERANCE) || k.now - m.stepT > 12)) {
        const first = !u.reported;
        setStep(k, u, 5);
        inPlace(k, u, type === 'bond_offensif' ? 'Bond effectué, ligne réalignée' : 'Refoulement terminé, limite atteinte, je tiens');
        if (first) done(k, u, type, true, '');
      }
      break;
    case 4:
      if (arrived) {
        setStep(k, u, 3);
        setPhase(k, u, 'mise_en_place');
        // le compte rendu de fin de charge est fait après réalignement
        report(k, u, 'Charge terminée, retour sur la ligne de départ');
        u.reported = true;
        done(k, u, type, true, '');
      }
      break;
    default:
      break;
  }
}
