/* =====================================================================================
 * FORCES DE L'ORDRE — exécution des ordres de formation et de mouvement.
 *
 *   startOrder()  prise en compte immédiate d'un ordre : nouvelle formation, objectif du repère ;
 *   progress()    à chaque pas : marche du repère, suivi d'une cible, enchaînement des étapes
 *                 (mise en place → en place → mouvement → arrêt et réalignement → compte rendu).
 *
 * Allures et distances : docs/research/00-bible-realisme.md §E.8 (ligne au pas cadencé au contact,
 * bond offensif au trot sur 15 à 25 m puis arrêt net et réalignement, charge à la course sur 30 à
 * 60 m, sifflet, repli au pas sur la ligne de départ, vague de refoulement par tronçons de 50 m).
 * L'allure suit l'urgence (tuning.ts, mcore.ts : columnSpeed, lineSpeed) : pas soutenu en routine hors
 * contact, trot vers un point éloigné, course sur un mouvement urgent ou une charge, repli plus vif sous
 * la pression ; le souffle de l'unité ramène une course trop longue au trot.
 * Les ordres particuliers (encerclement, relève, barrages de rue, véhicules) sont dans special.ts.
 * ===================================================================================== */

import type { Person, SquadOrder, Vehicle } from '@/core/contracts';
import { angleDiff, cardinalFr } from '@/core/math';
import type { FormGroup, Unit } from './brain';
import { F_BOX, F_COLUMN, F_HOLD, F_LINE, F_NONE, F_SCREEN, F_TORTUE } from './brain';
import type { Kernel } from './kernel';
import { isAble } from './kernel';
import {
  allSettled, clearSlots, columnSpeed, commonRunSpeed, commonTrotSpeed, copyOrder, done, filesFor, followRunSpeed, formBox, formColumn, formHold, formLine, formScreen,
  formTortue, formLate, gather, hasFormation, inPlace, isAligned, leaderOf, lineSpeed, mainGroup, moveTo, personById, react, reform,
  report, setPhase, setStep, staminaCap, stepColumn, stepFrame, stopGroup, takingPart, underPressure, unitCenter, vehicleById,
} from './mcore';
import { seatedToDismount } from './tree';
import { POLICE_COMMAND_SERVICE } from './command/api';
import { appendPath, measure, placeGroup, settleSlots } from './place';
import { ackBody, acknowledge, onPointBody, spell } from './radio';
import { leavePost, progressEncircle, startEncircle } from './encircle';
import { B_EN_ROUTE, formStreetBarrage, letsPassersby, streetAt } from './barrages';
import { BARRAGE_LET_PASSERSBY } from './api';
import {
  progressBarrage, progressBoarding, progressCrew, progressRelief, startBarrage, startCrewOrder, startDisembark, startEmbark, startRelief,
} from './special';
import * as T from './tuning';

/** Ordres qui finissent en barrage de rue (option « passants », SquadOrder.targetId). */
const BARRAGE_ORDERS: ReadonlySet<string> = new Set(['couper_circulation', 'tenir', 'ligne', 'avancer']);

/**
 * Le même barrage redonné à l'unité qui le tient déjà (même rue, à quelques mètres) avec l'autre option « passants » :
 * seule l'option change — ni la rue rouverte puis refermée, ni la ligne refaite. true si l'ordre a été pris ainsi.
 */
function retuneBarrage(k: Kernel, u: Unit, o: SquadOrder): boolean {
  const m = u.man;
  const cur = u.order;
  if (!m.barrage || !m.bWalls || m.bState === B_EN_ROUTE || !cur || !BARRAGE_ORDERS.has(o.type) || !BARRAGE_ORDERS.has(cur.type)) return false;
  const want = o.targetId === BARRAGE_LET_PASSERSBY;
  if (want === letsPassersby(u)) return false;
  if (o.targetId !== 0 && !want) return false;
  // le point désigné est sur ce barrage : dans la rue, à moins de 8 m de la ligne
  const fx = Math.sin(m.bh);
  const fz = Math.cos(m.bh);
  const along = (o.x - m.bx) * fx + (o.z - m.bz) * fz;
  const lat = (o.x - m.bx) * -fz + (o.z - m.bz) * fx;
  if (Math.abs(along) > 8 || Math.abs(lat) > m.bWidth / 2 + 2) return false;
  // l'ordre en cours garde son type, son point et son cap : seule l'option change
  cur.targetId = want ? BARRAGE_LET_PASSERSBY : 0;
  cur.issuedAt = o.issuedAt;
  cur.issuedBy = o.issuedBy;
  cur.maxForce = o.maxForce;
  if (o.byPlayer) cur.byPlayer = true;
  else delete cur.byPlayer;
  u.ackAt = k.now + ackDelay(u, o);
  u.ackText = acknowledge(u.squad.name, want
    ? 'les passants passent' + (m.bStreet !== '' ? ', ' + m.bStreet : '') + ', les manifestants restent bloqués'
    : 'plus personne ne passe' + (m.bStreet !== '' ? ', ' + m.bStreet : '') + ', passants compris');
  return true;
}

/**
 * Délai de l'accusé de réception (s) : aussitôt pour un ordre du joueur, un léger décalage propre à l'unité pour l'IA
 * (les accusés de plusieurs unités ne tombent pas tous au même instant).
 */
function ackDelay(u: Unit, o: SquadOrder): number {
  return o.byPlayer ? T.ACK_PLAYER : 0.35 + ((u.id * 0.173) % 0.4);
}

/** Personne (ou véhicule) que suit un ordre « suivre » : la cible, ou à défaut celui qui l'a donné, ou le joueur. */
function followedId(k: Kernel, u: Unit, o: SquadOrder): number {
  let id = o.targetId > 0 ? o.targetId : o.issuedBy;
  const leader = leaderOf(k, u);
  if (id === 0 || (leader && id === leader.id)) id = k.ctx.player.state.personId;
  return id;
}

/**
 * L'ordre s'exécute-t-il à pied (les agents assis descendent d'abord) ? Tous les ordres de formation, sauf
 * l'embarquement et le débarquement (ils règlent eux-mêmes les places), la colonne du convoi ou de l'IA (seule celle
 * du joueur fait descendre) et « suivre » quelqu'un qui est à bord, ou un véhicule (l'unité le suit dans ses fourgons).
 */
function footOrder(k: Kernel, u: Unit, o: SquadOrder): boolean {
  const type = o.type;
  if (type === 'embarquer' || type === 'debarquer') return false;
  if (type === 'colonne' && !o.byPlayer) return false;
  if (type === 'suivre') {
    const id = followedId(k, u, o);
    const tp = personById(k, id);
    return !!tp && tp.vehicleId === 0;
  }
  return true;
}

/**
 * Débarquement préalable d'un ordre à pied : les agents de l'unité assis dans un véhicule en descendent (dismountStep)
 * et gardent dès maintenant leur place dans la nouvelle formation (tree.ts : refreshFormable). Les agents en chemin
 * vers un véhicule ou déjà assis (embarquement précédent) y renoncent. Pas d'ordre « débarquer » visible.
 */
function beginDismount(k: Kernel, u: Unit, o: SquadOrder): void {
  u.dismount = false;
  const agents = u.agents;
  // (assis compris : sorti du fourgon, il n'y remonterait pas pour l'embarquement abandonné)
  if (o.type !== 'embarquer') for (let i = 0; i < agents.length; i++) agents[i].boardId = 0;
  if (u.squad.kind === 'equipage' || !footOrder(k, u, o)) return;
  u.dismount = true;
  let seated = false;
  for (let i = 0; i < agents.length && !seated; i++) seated = seatedToDismount(k, u, agents[i]);
  u.dismount = seated;
  // première sortie après le délai de réaction (portes ouvertes en moins d'une demi-seconde)
  u.dismountAt = k.now + 0.2;
}

/** Le véhicule `v` laisse-t-il descendre ses passagers pour cet ordre ? À l'arrêt, et pas en route sous le pilote automatique. */
function canLeave(k: Kernel, v: Vehicle, o: SquadOrder): boolean {
  if (Math.abs(v.speed) > T.EXIT_SPEED) return false;
  // ordre du joueur : on descend de tout véhicule arrêté — sauf d'un fourgon que sa colonne emporte encore vers le point
  // (ordre pour un point éloigné, command/convoy.ts takeOver : il s'exécute à l'arrêt, personne ne saute au feu rouge)
  if (o.byPlayer) {
    const cmd = k.ctx.service<{ carrying?(vehicleId: number): boolean }>(POLICE_COMMAND_SERVICE);
    return !cmd || !cmd.carrying || !cmd.carrying(v.id);
  }
  // ordre de l'IA : pas d'un véhicule de colonne arrêté au feu
  const ap = k.autopilot;
  if (!ap) return true;
  const st = ap.status(v);
  return st.mode === 'idle' || st.mode === 'stop' || st.mode === 'park' || st.state === 'arrive';
}

const exiting: number[] = [];

/** Une sortie par véhicule toutes les EXIT_INTERVAL secondes ; fin du débarquement quand plus personne n'est assis. */
function dismountStep(k: Kernel, u: Unit): void {
  if (k.now < u.dismountAt) return;
  u.dismountAt = k.now + T.EXIT_INTERVAL;
  const ctx = k.ctx;
  const o = u.order;
  exiting.length = 0;
  let seated = 0;
  const agents = u.agents;
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    if (!seatedToDismount(k, u, a)) continue;
    const p = a.p;
    seated++;
    if (!o || exiting.indexOf(p.vehicleId) >= 0) continue;
    const v = ctx.vehicles.get(p.vehicleId);
    exiting.push(p.vehicleId);
    if (!v || !canLeave(k, v, o) || !ctx.vehicles.exit(p)) continue;
    seated--;
    a.lastX = p.x;
    a.lastZ = p.z;
    a.pathN = 0;
    a.stuckT = 0;
    a.able = isAble(ctx, p);
    if (a.reactAt > k.now + 0.2) a.reactAt = k.now + 0.2;
  }
  if (seated === 0) u.dismount = false;
}

/** Prise en compte d'un ordre de formation par l'unité racine `u`. */
export function startOrder(k: Kernel, u: Unit, o: SquadOrder): void {
  if (retuneBarrage(k, u, o)) return;
  leavePost(k, u);
  const order = copyOrder(o);
  u.order = order;
  u.reported = false;
  u.guard = false;
  beginDismount(k, u, order);
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
  u.ackAt = k.now + ackDelay(u, order);
  u.ackText = acknowledge(u.squad.name, ackBody(k, order, dist));

  if (u.squad.kind === 'equipage' && startCrewOrder(k, u, order)) return;

  // agents encore assis : la formation est refaite avec eux (une halte « sur place » garderait l'ancienne, sans eux)
  if (u.dismount) {
    clearSlots(u);
    u.groups.length = 0;
  }
  const g = mainGroup(u);
  const type = order.type;
  switch (type) {
    case 'ligne':
      // sur une rue : la ligne la barre de façade à façade (barrages.ts)
      if (!formStreetBarrage(k, u, order.x, order.z, order.heading)) formLine(k, u, order.x, order.z, order.heading, order.width);
      setPhase(k, u, 'mise_en_place');
      break;

    case 'tenir': {
      if (formStreetBarrage(k, u, order.x, order.z, order.heading)) {
        setPhase(k, u, 'mise_en_place');
        break;
      }
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
      const pressed = underPressure(k, u);
      if (d <= 140 && k.sight(g.ax, g.az, order.x, order.z)) {
        // recul ordonné : le repère recule, les agents gardent la face tournée vers la foule (plus vivement sous la pression)
        moveTo(g, order.x, order.z, h, pressed ? T.SPEED_REPLI_PRESSED : k.tuning.repli);
        setStep(k, u, 1);
        setPhase(k, u, 'mouvement');
      } else {
        m.deploy = true;
        m.gx = order.x;
        m.gz = order.z;
        m.gh = h;
        m.deployWidth = order.width > 0 ? order.width : g.kind === F_LINE ? g.width : 0;
        // repli lointain sous la pression : décrochage à la course
        if (pressed) u.trotUntil = Math.max(u.trotUntil, k.now + d / T.SPEED_RUN + 15);
        startColumn(k, u, order.x, order.z, filesFor(0, u.formed));
      }
      break;
    }

    case 'suivre': {
      const id = followedId(k, u, order);
      if (!startFollow(k, u, id, cx, cz)) {
        formHold(k, u);
        inPlace(k, u, '');
        done(k, u, type, false, 'Personne à suivre.');
        break;
      }
      const tp = personById(k, id);
      // posture en garde : le joueur est à cet endroit depuis maintenant
      u.guardX = tp ? tp.x : 0;
      u.guardZ = tp ? tp.z : 0;
      u.guardAt = k.now;
      u.guardCheckAt = k.now;
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

/**
 * Colonne qui suit la personne ou le véhicule `id` : la tête part du chef de l'unité (à défaut du point (cx, cz)) et
 * marche sur la trace de la cible. false si la cible n'existe pas.
 */
function startFollow(k: Kernel, u: Unit, id: number, cx: number, cz: number): boolean {
  const tp = personById(k, id);
  const tv = tp ? null : vehicleById(k, id);
  if (!tp && !tv) return false;
  const leader = leaderOf(k, u);
  const tx = tp ? tp.x : tv!.x;
  const tz = tp ? tp.z : tv!.z;
  const hx = leader ? leader.x : cx;
  const hz = leader ? leader.z : cz;
  const col = formColumn(k, u, hx, hz, tx, tz, filesFor(u.order ? u.order.width : 0, u.formed));
  col.followId = id;
  col.radius = tv ? tv.def.length * 0.5 + 4 : 2.6;
  col.moving = true;
  // la tête règle elle-même son allure sur la cible (followColumn) ; g.speed borne le rattrapage des agents
  col.speed = commonTrotSpeed(u, k.tuning.trot);
  u.man.targetId = id;
  setStep(k, u, 1);
  setPhase(k, u, 'mouvement');
  return true;
}

/** Mise en colonne puis marche vers (x, z). */
/** Distance maximale (m) d'un « avancer » exécuté en ligne ; au-delà : colonne puis déploiement. */
const ADVANCE_IN_LINE = 45;

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
  col.speed = columnSpeed(k, u, col);
  setStep(k, u, 0);
  setPhase(k, u, 'mise_en_place');
}

/** « Avancer » : la formation en cours rejoint le point d'un bloc ; en colonne par les rues si le trajet n'est pas direct. */
function startAdvance(k: Kernel, u: Unit, o: SquadOrder): void {
  const g = mainGroup(u);
  const m = u.man;
  if (g.kind === F_COLUMN) {
    // en colonne vers un point d'une rue : à l'arrivée, l'unité barre la rue
    if (streetAt(k, o.x, o.z)) {
      m.deploy = true;
      m.gx = o.x;
      m.gz = o.z;
      m.gh = o.heading;
      m.deployWidth = 0;
    }
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
  // une ligne ne marche en ligne que sur un bond court, face à son objectif ; au-delà, l'unité se porte en colonne
  // (plus vite, par les rues) et se redéploie en ligne à l'arrivée — comme une compagnie qui change de position
  if (d <= ADVANCE_IN_LINE && k.sight(g.ax, g.az, o.x, o.z)) {
    if (Math.abs(angleDiff(g.ah, o.heading)) > 0.9) refit(k, u, g, o.heading);
    moveTo(g, o.x, o.z, o.heading, g.kind === F_TORTUE ? k.tuning.tortue : lineSpeed(k, u));
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
  if (type === 'bond_offensif') speed = commonTrotSpeed(u, k.tuning.trot);
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
  const behind = goal - g.s;
  // allure de la cible : la colonne trotte quand elle trotte, court quand elle court (ou pour combler un retard)
  const pace = tp ? Math.sqrt(tp.vx * tp.vx + tp.vz * tp.vz) : Math.abs(tv!.speed);
  const trot = commonTrotSpeed(u, k.tuning.trot);
  let cap = pace > trot * 0.9 || behind > T.FOLLOW_CATCH_UP ? followRunSpeed(u, Math.max(k.tuning.run, pace + 0.5)) : trot;
  // à bout de souffle, l'unité ralentit — sans descendre sous l'allure de la cible, qui s'essouffle elle aussi
  const breath = staminaCap(k, u);
  const gain = behind > 6 ? 0.8 : 0.3;
  if (cap > breath) cap = Math.max(breath, Math.min(cap, pace + gain));
  // allure de ralliement des agents (reflex.ts : vcap) : le retardataire court pour recoller
  g.speed = cap;
  let cohesion = 1 - (g.errAll - 0.6) / 1.6;
  if (cohesion > 1) cohesion = 1;
  else if (cohesion < 0.2) cohesion = 0.2;
  let want = behind * 1.4;
  let max = cap * cohesion;
  // un retardataire ne fait pas perdre la cible de vue : la tête garde au moins l'allure de la cible (un peu plus
  // quand elle est distancée) et la colonne s'étire — elle tombait à 0,5 m/s et restait à 75 m du joueur qui marchait
  let keep = pace + (behind > 6 ? gain : 0);
  if (keep > cap) keep = cap;
  if (max < keep) max = keep;
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
  return 'Barrage en place' + (u.man.barrage && u.man.bStreet !== '' ? ', ' + u.man.bStreet : '') + ', face ' + cardinalFr(g.ah) + (w >= 2 ? ', front ' + spell(w) + ' mètres' : '') + ', ' + spell(u.formed) + ' à pied';
}

/** Avancement de la manœuvre de l'unité racine `u` (appelé à chaque pas). */
export function progress(k: Kernel, u: Unit, dt: number): void {
  const o = u.order;
  const groups = u.groups;
  // débarquement préalable d'un ordre à pied
  if (u.dismount) dismountStep(k, u);
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
      // souffle : une colonne lancée à la course ou au trot ralentit quand l'unité s'épuise (deux fois par seconde)
      if (g.kind === F_COLUMN && ((k.ctx.clock.tick + u.id) % 15) === 0) {
        const cap = staminaCap(k, u);
        if (g.speed > cap) g.speed = cap;
      }
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
          // la colonne se forme, puis s'ébranle ; sur un mouvement urgent, elle part dès que le gros est en place
          // (les derniers recollent en marchant, la tête modère son allure tant qu'ils sont loin)
          const urgent = k.now < u.trotUntil;
          const formed = urgent ? 2.0 : 0.9;
          const wait = urgent ? 3 : 8;
          if (g.errAll <= formed || k.now - m.stepT > wait) {
            measure(g);
            if (g.errAll <= formed || k.now - m.stepT > wait) {
              g.moving = true;
              g.speed = columnSpeed(k, u, g);
              setStep(k, u, 1);
              setPhase(k, u, 'mouvement');
            }
          }
        } else if (m.step === 1 && arrived) {
          if (m.deploy) {
            m.deploy = false;
            if (type !== 'avancer' || !formStreetBarrage(k, u, m.gx, m.gz, m.gh)) formLine(k, u, m.gx, m.gz, m.gh, m.deployWidth);
            setStep(k, u, 2);
            setPhase(k, u, 'mise_en_place');
          } else {
            setStep(k, u, 3);
            inPlace(k, u, type === 'avancer' ? onPointBody(o.place ?? '', false, g.ah, u.formed, g.files) : 'Arrivé au point, en colonne par ' + (g.files === 3 ? 'trois' : 'deux'));
            done(k, u, type, true, '');
          }
        }
      } else if (m.step === 1 && arrived) {
        // ligne arrivée sur un point d'une rue : elle s'y déploie de façade à façade (une tortue reste une tortue)
        if (type === 'avancer' && g.kind === F_LINE) formStreetBarrage(k, u, o.x, o.z, o.heading);
        setStep(k, u, 2);
        setPhase(k, u, 'mise_en_place');
      } else if ((m.step === 2 || u.phase === 'mise_en_place') && (allSettled(u, T.IN_PLACE_TOLERANCE) || formLate(k, u))) {
        setStep(k, u, 3);
        // « Avancer » rend compte « sur le point » (pas « Barrage en place » : ce n'était pas l'ordre)
        inPlace(k, u, type === 'repli' ? 'Repli effectué, en position face ' + cardinalFr(g.ah)
          : type === 'avancer' ? onPointBody(m.barrage && m.bStreet !== '' ? m.bStreet : o.place ?? '', g.kind === F_LINE, g.ah, u.formed, g.files)
            : g.kind === F_LINE ? lineReport(u, g) : 'En position');
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
      progressFollow(k, u, g);
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
      if (k.now - m.stepT >= (u.order!.byPlayer ? T.REALIGN_TIME_PLAYER : T.REALIGN_TIME) && (allSettled(u, T.IN_PLACE_TOLERANCE) || k.now - m.stepT > 12)) {
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
        // le compte rendu de fin de charge est fait après réalignement (par une unité qui a vraiment chargé)
        if (takingPart(k, u) >= T.REPORT_SHARE) report(k, u, 'Charge terminée, retour sur la ligne de départ');
        u.reported = true;
        done(k, u, type, true, '');
      }
      break;
    default:
      break;
  }
}

// ───────────────────────────── « avec moi » : en garde quand le joueur s'arrête ─────────────────────────────

const crowdTmp: Person[] = [];

const protester = (p: Person): boolean => p.faction === 'protest' && p.vehicleId === 0 && p.custody === 'free' && p.health > 0;

/**
 * Cap de la ligne en garde autour de (x, z) : vers la foule la plus proche à moins de GUARD_CROWD mètres — le premier
 * manifestant (du plus proche au plus loin) qui en a au moins GUARD_CROWD_MIN autour de lui à moins de 15 m, et le
 * barycentre des manifestants à moins de 25 m de lui (quelques isolés plus près ne détournent pas la ligne) —, sinon
 * dans le regard du joueur.
 */
function guardHeading(k: Kernel, x: number, z: number): number {
  const ctx = k.ctx;
  const n = ctx.people.queryRadius(x, z, T.GUARD_CROWD, crowdTmp, protester);
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < n; i++) {
    const p = crowdTmp[i];
    const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
    if (d >= bestD) continue;
    let around = 0;
    for (let j = 0; j < n && around < T.GUARD_CROWD_MIN; j++) {
      const q = crowdTmp[j];
      if (q !== p && (q.x - p.x) * (q.x - p.x) + (q.z - p.z) * (q.z - p.z) <= 225) around++;
    }
    if (around < T.GUARD_CROWD_MIN) continue;
    best = i;
    bestD = d;
  }
  if (best >= 0) {
    const c = crowdTmp[best];
    let sx = 0;
    let sz = 0;
    let m = 0;
    for (let i = 0; i < n; i++) {
      const p = crowdTmp[i];
      if ((p.x - c.x) * (p.x - c.x) + (p.z - c.z) * (p.z - c.z) > 625) continue;
      sx += p.x;
      sz += p.z;
      m++;
    }
    crowdTmp.length = 0;
    sx /= m;
    sz /= m;
    if ((sx - x) * (sx - x) + (sz - z) * (sz - z) > 1) return Math.atan2(sx - x, sz - z);
  }
  crowdTmp.length = 0;
  return ctx.player.state.camYaw;
}

/** Rang de l'unité parmi les unités qui suivent le joueur à pied (par identifiant) : sa place autour de lui. */
function guardIndex(k: Kernel, u: Unit, pid: number): number {
  let idx = 0;
  const roots = k.roots;
  for (let i = 0; i < roots.length; i++) {
    const r = roots[i];
    if (r === u || r.id > u.id || !r.order || r.order.type !== 'suivre' || r.man.targetId !== pid || r.squad.kind === 'equipage') continue;
    idx++;
  }
  return idx;
}

/** Point le plus loin possible de (x, z) vers (x + dx·len, z + dz·len) sans traverser de mur (1,5 m avant lui). */
function reach(k: Kernel, x: number, z: number, dx: number, dz: number, len: number): number {
  const hit = k.hit;
  if (k.ctx.world.raycast(x, z, x + dx * (len + 1.5), z + dz * (len + 1.5), hit) && hit.hit) {
    const free = hit.t * (len + 1.5) - 1.5;
    return free < len ? (free > 0 ? free : 0) : len;
  }
  return len;
}

/**
 * Ligne en garde derrière le joueur arrêté en (px, pz), face au cap h : la première unité juste derrière lui, la
 * suivante à sa gauche, la troisième à sa droite ; sans place sur le côté (rue étroite), derrière la précédente.
 */
function formGuard(k: Kernel, u: Unit, px: number, pz: number, h: number, pid: number): void {
  const fx = Math.sin(h);
  const fz = Math.cos(h);
  // droite de la ligne (même repère que formation.ts : buildLine)
  const rx = -Math.cos(h);
  const rz = Math.sin(h);
  const idx = guardIndex(k, u, pid);
  const est = Math.max(6, Math.ceil(Math.max(1, u.formed) / 2) * k.tuning.shieldSpacing);
  let back = T.GUARD_BACK;
  let side = 0;
  if (idx === 1) side = 1;
  else if (idx === 2) side = -1;
  else if (idx > 2) back += T.GUARD_STACK * (idx - 2);
  let d = reach(k, px, pz, -fx, -fz, back);
  if (d < 3) d = Math.min(3, back);
  let x = px - fx * d;
  let z = pz - fz * d;
  let width = 0;
  if (side !== 0) {
    const off = est / 2 + 2;
    const free = reach(k, x, z, rx * side, rz * side, off + est / 2);
    if (free >= off + est / 2 - 0.5) {
      x += rx * side * off;
      z += rz * side * off;
      width = est;
    } else {
      // pas la place sur le côté : derrière la ligne précédente
      const d2 = reach(k, px, pz, -fx, -fz, back + T.GUARD_STACK * idx);
      x = px - fx * Math.max(d, d2);
      z = pz - fz * Math.max(d, d2);
    }
  }
  const g = formLine(k, u, x, z, h, width);
  g.followId = 0;
  u.guard = true;
  u.guardOx = px;
  u.guardOz = pz;
  u.guardH = h;
  u.guardTurnAt = k.now + 2;
  setPhase(k, u, 'mise_en_place');
}

/**
 * « Suivre » le joueur à pied : la colonne le suit tant qu'il marche ; arrêté (moins de GUARD_STILL mètres en
 * GUARD_STOP_TIME secondes sans chercher à avancer), l'unité se met en ligne derrière lui face à la foule ; il repart de plus de GUARD_LEAVE
 * mètres, elle reprend la colonne. Pas d'ordre, pas de radio, pas de compte rendu : l'ordre reste « suivre ».
 */
function progressFollow(k: Kernel, u: Unit, g: FormGroup): void {
  if (k.now < u.guardCheckAt) return;
  u.guardCheckAt = k.now + 0.25;
  const pid = k.ctx.player.state.personId;
  const me = pid !== 0 && u.man.targetId === pid ? personById(k, pid) : null;
  if (!me || me.vehicleId !== 0 || u.squad.kind === 'equipage') {
    if (u.guard && me) {
      u.guard = false;
      unitCenter(k, u);
      startFollow(k, u, pid, k.v2.x, k.v2.z);
    }
    return;
  }
  // il marche (ou pousse pour avancer, buté contre un obstacle) : il ne s'est pas arrêté
  const walks = me.cmd.moveX * me.cmd.moveX + me.cmd.moveZ * me.cmd.moveZ > 0.01;
  if (walks || (me.x - u.guardX) * (me.x - u.guardX) + (me.z - u.guardZ) * (me.z - u.guardZ) > T.GUARD_STILL * T.GUARD_STILL) {
    u.guardX = me.x;
    u.guardZ = me.z;
    u.guardAt = k.now;
  }
  if (u.guard) {
    const dx = me.x - u.guardOx;
    const dz = me.z - u.guardOz;
    if (dx * dx + dz * dz > T.GUARD_LEAVE * T.GUARD_LEAVE) {
      // il repart : la colonne reprend derrière lui
      u.guard = false;
      u.guardX = me.x;
      u.guardZ = me.z;
      u.guardAt = k.now;
      unitCenter(k, u);
      startFollow(k, u, pid, k.v2.x, k.v2.z);
      return;
    }
    if (g.kind === F_LINE && u.phase === 'mise_en_place' && allSettled(u, T.IN_PLACE_TOLERANCE * 3)) setPhase(k, u, 'en_place');
    // la foule s'est déplacée autour de lui : la ligne lui refait face (examen toutes les deux secondes)
    if (k.now >= u.guardTurnAt) {
      u.guardTurnAt = k.now + 2;
      const h = guardHeading(k, me.x, me.z);
      if (Math.abs(angleDiff(u.guardH, h)) > T.GUARD_TURN) formGuard(k, u, u.guardOx, u.guardOz, h, pid);
    }
    return;
  }
  if (k.now - u.guardAt >= T.GUARD_STOP_TIME) formGuard(k, u, me.x, me.z, guardHeading(k, me.x, me.z), pid);
}
