/* =====================================================================================
 * FORCES DE L'ORDRE — moteur de formations : calcul des emplacements et affectation.
 *
 * Une formation vit dans un repère (ancre = milieu du premier rang, cap) ; chaque agent y a un
 * emplacement local (lx vers la droite, lf vers l'avant, lh cap relatif). Le repère peut bouger :
 * les emplacements suivent d'un bloc, et chaque agent rejoint le sien (steer.ts).
 *
 *   ligne    premier rang de boucliers jointifs, rectiligne, perpendiculaire au cap, sur toute la
 *            largeur demandée ou la largeur réelle de la rue (rayons vers les façades) ; second
 *            rang à 2 m (lanceurs, LBD, extincteur, chefs de groupe, interpellateurs) ; chefs de
 *            section à 5 m ; commandement à 8 m ;
 *   colonne  par deux ou par trois, files à 0,8 m, rangs tous les 1,2 m, le long d'un itinéraire :
 *            chaque rang est placé sur la trace de la tête (la colonne tourne sans se disloquer) ;
 *   tortue   deux rangs serrés de boucliers, les autres accroupis derrière ;
 *   écran    arc (ou anneau) de boucliers tournés vers l'extérieur autour d'une cible ;
 *   escorte  cadre autour d'un élément en marche.
 *
 * Affectation sans croisement : dans chaque classe, les agents triés par unité (unités sœurs
 * rangées d'après leur position) puis par position latérale prennent les emplacements dans le même
 * ordre. Deux agents n'échangent donc jamais leurs côtés.
 * ===================================================================================== */


import { wrapAngle } from '@/core/math';
import type { Agent, FormGroup, Unit } from './brain';
import {
  CLS_FRONT, CLS_OUT, CLS_REAR, CLS_SECOND, CLS_THIRD, F_BOX, F_COLUMN, F_HOLD, F_LINE, F_SCREEN, F_TORTUE,
} from './brain';
import type { Kernel } from './kernel';
import * as T from './tuning';

// ───────────────────────────── classes de rôle ─────────────────────────────

/** Classe d'un agent d'après son poste et son équipement. */
export function classify(k: Kernel, a: Agent): void {
  const p = a.p;
  a.shield = k.count(p, 'bouclier') > 0;
  const poste = p.poste;
  let cls = CLS_SECOND;
  if (a.crew) cls = CLS_OUT;
  else if (poste === 'commandant_unite' || poste === 'autorite_civile' || p.kind === 'commissaire') cls = CLS_REAR;
  else if (poste === 'chef_section') cls = a.home && a.home.squad.kind === 'compagnie' ? CLS_REAR : CLS_THIRD;
  else if (poste === 'operateur' || poste === 'telepilote') cls = a.home && a.home.squad.kind === 'compagnie' ? CLS_REAR : CLS_THIRD;
  else if (a.shield && poste !== 'chef_groupe') cls = CLS_FRONT;
  a.baseCls = cls;
}

/** Ordre de montée au premier rang quand les boucliers ne suffisent pas à barrer le front. */
function promoteRank(a: Agent): number {
  switch (a.p.poste) {
    case 'interpellation': return 0;
    case 'passager_moto': return 1;
    case 'pilote_moto': return 2;
    case null: return 3;
    case 'bouclier': return 3;
    case 'extincteur': return 4;
    case 'lbd': return 5;
    case 'lanceur': return 6;
    case 'chef_groupe': return 8;
    default: return 7;
  }
}

function byKeyLat(a: Agent, b: Agent): number {
  return a.key - b.key || a.lat - b.lat || a.p.id - b.p.id;
}

function byLat(a: Agent, b: Agent): number {
  return a.lat - b.lat || a.p.id - b.p.id;
}

function byPromote(a: Agent, b: Agent): number {
  return promoteRank(a) - promoteRank(b) || a.p.id - b.p.id;
}

/** Unités rangées par échelon supérieur (barycentre, puis identité : deux sections ne s'entremêlent jamais), puis par barycentre propre. */
function bySortLat(a: Unit, b: Unit): number {
  return a.accLat - b.accLat || (a.parent ? a.parent.id : a.id) - (b.parent ? b.parent.id : b.id) || a.sortLat - b.sortLat || a.id - b.id;
}

const homes: Unit[] = [];
const ownLat: number[] = [];
const parLat: number[] = [];

/**
 * Clés de tri des agents : `lat` = projection sur l'axe donné, `key` = rang de leur unité (unités d'une même
 * section contiguës, sections rangées d'après leur barycentre) : les unités ne se mélangent pas.
 */
export function sortKeys(agents: readonly Agent[], n: number, ox: number, oz: number, axX: number, axZ: number): void {
  homes.length = 0;
  for (let i = 0; i < n; i++) {
    const a = agents[i];
    const h = a.home;
    if (h) {
      h.accN = 0;
      h.accLat = 0;
      const par = h.parent;
      if (par) {
        par.accN = 0;
        par.accLat = 0;
      }
    }
  }
  for (let i = 0; i < n; i++) {
    const a = agents[i];
    a.lat = (a.p.x - ox) * axX + (a.p.z - oz) * axZ;
    const h = a.home;
    if (!h) continue;
    if (h.accN === 0) homes.push(h);
    h.accN++;
    h.accLat += a.lat;
    const par = h.parent;
    if (par) {
      par.accN++;
      par.accLat += a.lat;
    }
  }
  // barycentre de l'unité et de son échelon supérieur : toutes les lectures avant la première écriture
  // (une unité peut être à la fois membre direct et échelon supérieur d'une autre)
  for (let i = 0; i < homes.length; i++) {
    const h = homes[i];
    const par = h.parent;
    const own = h.accLat / h.accN;
    ownLat[i] = own;
    // l'échelon supérieur ne compte que s'il regroupe plusieurs unités de cette formation
    parLat[i] = par && par.accN > h.accN ? par.accLat / par.accN : own;
  }
  for (let i = 0; i < homes.length; i++) {
    homes[i].sortLat = ownLat[i];
    homes[i].accLat = parLat[i];
  }
  // tri par échelon supérieur, puis par unité
  homes.sort(bySortLat);
  for (let i = 0; i < homes.length; i++) homes[i].seq = i;
  for (let i = 0; i < n; i++) {
    const a = agents[i];
    a.key = a.home ? a.home.seq : 0;
  }
}

// ───────────────────────────── largeur réelle d'une rue ─────────────────────────────

export const probe = { left: 0, right: 0 };

/** Distance aux façades à gauche et à droite du point, perpendiculairement au cap (Infinity si dégagé). */
export function probeStreet(k: Kernel, x: number, z: number, h: number, reach: number): void {
  const rx = -Math.cos(h);
  const rz = Math.sin(h);
  const hit = k.hit;
  const w = k.ctx.world;
  probe.left = w.raycast(x, z, x - rx * reach, z - rz * reach, hit) && hit.hit ? hit.t * reach : Infinity;
  probe.right = w.raycast(x, z, x + rx * reach, z + rz * reach, hit) && hit.hit ? hit.t * reach : Infinity;
}

// ───────────────────────────── construction ─────────────────────────────

const cFront: Agent[] = [];
const cSecond: Agent[] = [];
const cThird: Agent[] = [];
const cRear: Agent[] = [];

function resetGroup(g: FormGroup, kind: number, x: number, z: number, h: number): void {
  g.kind = kind;
  g.ax = x;
  g.az = z;
  g.ah = h;
  g.avx = 0;
  g.avz = 0;
  g.aw = 0;
  g.moving = false;
  g.v = 0;
  g.tx = x;
  g.tz = z;
  g.th = h;
  g.dirty = true;
  g.settled = false;
  g.doorW = 0;
  g.front.length = 0;
  g.followId = 0;
}

function split(agents: readonly Agent[], n: number): void {
  cFront.length = 0;
  cSecond.length = 0;
  cThird.length = 0;
  cRear.length = 0;
  for (let i = 0; i < n; i++) {
    const a = agents[i];
    a.cls = a.baseCls;
    if (a.cls === CLS_FRONT) cFront.push(a);
    else if (a.cls === CLS_SECOND) cSecond.push(a);
    else if (a.cls === CLS_THIRD) cThird.push(a);
    else if (a.cls === CLS_REAR) cRear.push(a);
  }
}

function setSlot(a: Agent, g: FormGroup, lx: number, lf: number, lh: number, rank: number): void {
  a.group = g;
  a.lx = lx;
  a.lf = lf;
  a.lh = lh;
  a.rank = rank;
  a.hasSlot = true;
}

/** Répartit `list` sur un rang de largeur w, à la profondeur lf (dédoublé si l'intervalle est trop serré). */
function spreadRank(list: Agent[], g: FormGroup, w: number, lf: number, rank: number, minSpacing: number, depthStep: number): void {
  const n = list.length;
  if (n === 0) return;
  list.sort(byKeyLat);
  const perRank = Math.max(1, Math.min(n, Math.floor(w / minSpacing + 1e-6) || 1));
  const rows = Math.ceil(n / perRank);
  let i = 0;
  for (let r = 0; r < rows; r++) {
    const m = Math.min(perRank, n - i);
    const s = w / m;
    for (let j = 0; j < m; j++, i++) setSlot(list[i], g, -w / 2 + s * (j + 0.5), lf - r * depthStep, 0, rank);
  }
}

/**
 * Ligne de barrage. `width` ≤ 0 : largeur réelle de la rue (façade à façade) si le point est dans une rue,
 * sinon le front que l'effectif tient coude à coude. Retourne l'intervalle du premier rang.
 */
export function buildLine(
  k: Kernel, g: FormGroup, agents: readonly Agent[], n: number, x: number, z: number, h: number, width: number, doorW = 0,
): number {
  const rx = -Math.cos(h);
  const rz = Math.sin(h);
  sortKeys(agents, n, x, z, rx, rz);
  split(agents, n);
  if (cFront.length === 0) {
    // unité sans bouclier : tout le monde au premier rang, chefs exceptés
    for (let i = cSecond.length - 1; i >= 0; i--) {
      const a = cSecond[i];
      if (a.p.poste === 'chef_groupe' && cSecond.length > 2) continue;
      a.cls = CLS_FRONT;
      cFront.push(a);
      cSecond.splice(i, 1);
    }
  }
  // ── front à tenir ──
  probeStreet(k, x, z, h, T.STREET_PROBE);
  let w: number;
  let shift = 0;
  const target = k.tuning.shieldSpacing;
  if (width <= 0) {
    if (probe.left < T.STREET_PROBE && probe.right < T.STREET_PROBE) {
      const l = probe.left - T.WALL_MARGIN;
      const r = probe.right - T.WALL_MARGIN;
      w = l + r;
      shift = (r - l) / 2;
    } else {
      w = Math.max(1, cFront.length) * target;
      // adossée à une façade : la ligne part du mur
      if (probe.left < w / 2 + T.WALL_MARGIN) shift = w / 2 + T.WALL_MARGIN - probe.left;
      else if (probe.right < w / 2 + T.WALL_MARGIN) shift = -(w / 2 + T.WALL_MARGIN - probe.right);
    }
  } else {
    const l = Math.min(width / 2, probe.left - T.WALL_MARGIN);
    const r = Math.min(width / 2, probe.right - T.WALL_MARGIN);
    w = l + r;
    shift = (r - l) / 2;
  }
  if (!(w > T.SPACING_MIN)) w = T.SPACING_MIN;
  x += rx * shift;
  z += rz * shift;
  if (shift !== 0) for (let i = 0; i < n; i++) agents[i].lat -= shift;

  // ── effectif du premier rang : des agents du second rang montent si le front est trop large ──
  if (cFront.length > 0 && w / cFront.length > T.SPACING_PROMOTE && cSecond.length > 0) {
    cSecond.sort(byPromote);
    while (cSecond.length > 0 && w / cFront.length > T.SPACING_PROMOTE) {
      const a = cSecond[0];
      // les chefs de groupe ne montent en ligne qu'en dernier recours
      if (promoteRank(a) >= 8 && w / cFront.length <= T.SPACING_MAX) break;
      a.cls = CLS_FRONT;
      cFront.push(a);
      cSecond.shift();
    }
  }
  resetGroup(g, F_LINE, x, z, h);
  const nf = cFront.length;
  let s = nf > 0 ? w / nf : target;
  let fw = w;
  if (s > T.SPACING_MAX) {
    s = T.SPACING_MAX;
    fw = s * nf;
  }
  let second = T.RANK2_BACK;
  let perRank = nf;
  if (s < T.SPACING_MIN) {
    // trop de boucliers pour la largeur : rang de doublure 1 m derrière
    perRank = Math.max(1, Math.floor(fw / T.SPACING_MIN + 1e-6));
    s = fw / perRank;
    second += Math.ceil(nf / perRank) - 1;
  }
  cFront.sort(byKeyLat);
  // porte au milieu (barrage filtrant) : le premier rang se répartit de part et d'autre
  const door = doorW > 0 && fw > doorW + 2 * s ? doorW : 0;
  let i = 0;
  const rows = Math.ceil(nf / perRank);
  for (let r = 0; r < rows; r++) {
    const m = Math.min(perRank, nf - i);
    const rowS = r === 0 ? s : fw / m;
    for (let j = 0; j < m; j++, i++) {
      let lx = -fw / 2 + rowS * (j + 0.5);
      if (door > 0 && r === 0) {
        // même nombre d'agents sur un front amputé de la porte
        const side = j < m / 2 ? -1 : 1;
        const half = (fw - door) / 2;
        const cnt = side < 0 ? Math.ceil(m / 2) : m - Math.ceil(m / 2);
        const idx = side < 0 ? j : j - Math.ceil(m / 2);
        const ss = cnt > 0 ? half / cnt : half;
        lx = side < 0 ? -fw / 2 + ss * (idx + 0.5) : door / 2 + ss * (idx + 0.5);
      }
      const a = cFront[i];
      setSlot(a, g, lx, -r, 0, r);
      if (r === 0) g.front.push(a);
    }
  }
  g.front.sort(byLx);
  spreadRank(cSecond, g, Math.max(fw - s, 1.2), -second, 2, 0.8, 1.0);
  spreadRank(cThird, g, Math.max(Math.min(fw - 2, cThird.length * 2.5), 1.2), -(second + T.RANK3_BACK - T.RANK2_BACK), 3, 0.9, 1.0);
  spreadRank(cRear, g, Math.max(Math.min(fw - 2, cRear.length * 1.3), 1.2), -(second + T.RANK4_BACK - T.RANK2_BACK), 4, 0.9, 1.0);
  g.width = fw;
  g.spacing = s;
  return s;
}

function byLx(a: Agent, b: Agent): number {
  return a.lx - b.lx || a.p.id - b.p.id;
}

/** Tortue : deux rangs serrés de boucliers, le reste accroupi derrière. */
export function buildTortue(k: Kernel, g: FormGroup, agents: readonly Agent[], n: number, x: number, z: number, h: number): void {
  const rx = -Math.cos(h);
  const rz = Math.sin(h);
  sortKeys(agents, n, x, z, rx, rz);
  split(agents, n);
  resetGroup(g, F_TORTUE, x, z, h);
  const nf = cFront.length;
  const others = cSecond.length + cThird.length + cRear.length;
  // premier rang : assez large pour que le bloc soit à peu près carré (tout le monde abrité derrière)
  let first = Math.round(Math.sqrt((n * T.TORTUE_RANK) / T.TORTUE_SPACING));
  if (first < 2) first = 2;
  if (first > nf) first = nf;
  probeStreet(k, x, z, h, T.STREET_PROBE);
  const room = Math.min(probe.left, probe.right) * 2 - 2 * T.WALL_MARGIN;
  if (first * T.TORTUE_SPACING > room) first = Math.max(1, Math.floor(room / T.TORTUE_SPACING));
  const w = Math.max(first, 1) * T.TORTUE_SPACING;
  cFront.sort(byKeyLat);
  // les boucliers du second rang sont pris alternativement pour garder l'ordre latéral
  let i = 0;
  let row = 0;
  while (i < nf) {
    const m = Math.min(first, nf - i);
    const s = w / m;
    for (let j = 0; j < m; j++, i++) {
      const a = cFront[i];
      setSlot(a, g, -w / 2 + s * (j + 0.5), -row * T.TORTUE_RANK, 0, row);
      if (row === 0) g.front.push(a);
    }
    row++;
  }
  for (let j = 0; j < cThird.length; j++) cSecond.push(cThird[j]);
  for (let j = 0; j < cRear.length; j++) cSecond.push(cRear[j]);
  if (others > 0) spreadRank(cSecond, g, Math.max(w - 0.3, 0.7), -row * T.TORTUE_RANK - 0.2, row, T.TORTUE_SPACING, T.TORTUE_RANK);
  g.front.sort(byLx);
  g.width = w;
  g.spacing = first > 0 ? w / first : T.TORTUE_SPACING;
}

/**
 * Colonne par `files` : le chef en tête, les rangs derrière lui tous les 1,2 m. Les agents déjà les plus
 * proches de la tête prennent les premiers rangs. `dx, dz` : direction de marche au départ.
 */
export function buildColumn(
  g: FormGroup, agents: readonly Agent[], n: number, x: number, z: number, dx: number, dz: number, files: number, leaderId: number,
): void {
  const h = Math.atan2(dx, dz);
  // tri du plus avancé au moins avancé
  sortKeys(agents, n, x, z, -dx, -dz);
  resetGroup(g, F_COLUMN, x, z, h);
  g.files = files;
  cSecond.length = 0;
  let leader: Agent | null = null;
  for (let i = 0; i < n; i++) {
    const a = agents[i];
    a.cls = a.baseCls;
    if (a.cls === CLS_OUT) continue;
    if (a.p.id === leaderId) leader = a;
    else cSecond.push(a);
  }
  cSecond.sort(byKeyLat);
  if (!leader && cSecond.length > 0) {
    // sans chef valide : le plus gradé prend la tête
    let best = 0;
    for (let i = 1; i < cSecond.length; i++) if (cSecond[i].baseCls > cSecond[best].baseCls) best = i;
    leader = cSecond[best];
    cSecond.splice(best, 1);
  }
  if (leader) {
    setSlot(leader, g, 0, 0, 0, 0);
    g.front.push(leader);
  }
  const rx = -Math.cos(h);
  const rz = Math.sin(h);
  const m = cSecond.length;
  for (let i = 0; i < m; i += files) {
    const cnt = Math.min(files, m - i);
    // dans chaque rang, ceux qui sont déjà à gauche prennent la file de gauche
    for (let j = 0; j < cnt; j++) cRear[j] = cSecond[i + j];
    cRear.length = cnt;
    for (let j = 0; j < cnt; j++) cRear[j].lat = (cRear[j].p.x - x) * rx + (cRear[j].p.z - z) * rz;
    cRear.sort(byLat);
    const rank = i / files + 1;
    for (let j = 0; j < cnt; j++) setSlot(cRear[j], g, (j - (cnt - 1) / 2) * T.COLUMN_FILE, -rank * T.COLUMN_RANK, 0, rank);
  }
  cRear.length = 0;
  g.width = (files - 1) * T.COLUMN_FILE;
  g.spacing = T.COLUMN_FILE;
}

/** Longueur d'une colonne de n agents (m). */
export function columnLength(n: number, files: number): number {
  return Math.ceil(Math.max(0, n - 1) / files) * T.COLUMN_RANK;
}

/**
 * Écran de protection autour d'un point : boucliers en arc tournés vers l'extérieur, centré sur le cap h
 * (anneau complet s'ils sont assez nombreux) ; les autres à l'intérieur.
 */
export function buildScreen(k: Kernel, g: FormGroup, agents: readonly Agent[], n: number, x: number, z: number, h: number, radius: number): void {
  split(agents, n);
  if (cFront.length === 0) {
    for (let i = cSecond.length - 1; i >= 0; i--) {
      cSecond[i].cls = CLS_FRONT;
      cFront.push(cSecond[i]);
    }
    cSecond.length = 0;
  }
  resetGroup(g, F_SCREEN, x, z, h);
  const nf = cFront.length;
  const target = k.tuning.shieldSpacing;
  let r = Math.max(radius, T.SCREEN_RADIUS_MIN);
  // anneau complet si les boucliers tiennent le tour à moins de 1,3 fois l'intervalle visé
  let arc = nf > 0 ? (nf * target) / r : 0;
  let full = arc >= Math.PI * 2 / 1.3;
  if (full) {
    // l'anneau doit pouvoir abriter tous les autres agents derrière la cible
    const need = 1.5 + Math.ceil((cSecond.length + cThird.length + cRear.length) / 4) * 0.9 + 1.4;
    if (r < need && (nf * target) / need >= Math.PI * 2 / 1.3) r = need;
    else if (r < need) full = false;
  }
  if (full) arc = Math.PI * 2;
  else if (arc > Math.PI * 1.2) {
    // presque un tour : on resserre le rayon pour fermer l'écran sur le côté menacé
    arc = Math.PI * 1.2;
    r = Math.max(T.SCREEN_RADIUS_MIN, (nf * target) / arc);
  }
  // tri angulaire autour du centre (sans croisement sur un cercle)
  for (let i = 0; i < n; i++) {
    const a = agents[i];
    a.key = 0;
    a.lat = wrapAngle(Math.atan2(a.p.x - x, a.p.z - z) - h);
  }
  cFront.sort(byLat);
  for (let i = 0; i < nf; i++) {
    const phi = -arc / 2 + (arc * (i + 0.5)) / nf;
    const a = cFront[i];
    setSlot(a, g, -r * Math.sin(phi), r * Math.cos(phi), phi, 0);
    g.front.push(a);
  }
  // les autres : en bloc du côté abrité de la cible (à l'opposé de la menace), par rangs de quatre
  const n2 = cSecond.length;
  const rx = -Math.cos(h);
  const rz = Math.sin(h);
  for (let i = 0; i < n2; i++) cSecond[i].lat = (cSecond[i].p.x - x) * rx + (cSecond[i].p.z - z) * rz;
  cSecond.sort(byLat);
  const perRow = 4;
  const rows = Math.ceil(n2 / perRow);
  for (let i = 0; i < n2; i++) {
    const row = Math.floor(i / perRow);
    const m = Math.min(perRow, n2 - row * perRow);
    setSlot(cSecond[i], g, (i - row * perRow - (m - 1) / 2) * 0.85, -(1.5 + row * 0.9), 0, 2);
  }
  // chefs : derrière le bloc
  const back = 1.5 + rows * 0.9 + 0.2;
  const chiefs = cThird.length + cRear.length;
  let j = 0;
  for (let i = 0; i < cThird.length; i++, j++) setSlot(cThird[i], g, (j - (chiefs - 1) / 2) * 1.1, -back, 0, 3);
  for (let i = 0; i < cRear.length; i++, j++) setSlot(cRear[i], g, (j - (chiefs - 1) / 2) * 1.1, -back, 0, 4);
  g.width = 2 * r;
  g.radius = r;
  g.spacing = nf > 0 ? (arc * r) / nf : target;
}

/**
 * Escorte : cadre autour d'un élément de demi-longueur hl et de demi-largeur hw qui regarde vers h :
 * rang de boucliers devant, deux files sur les flancs, les autres derrière.
 */
export function buildBox(k: Kernel, g: FormGroup, agents: readonly Agent[], n: number, x: number, z: number, h: number, hl: number, hw: number): void {
  const rx = -Math.cos(h);
  const rz = Math.sin(h);
  sortKeys(agents, n, x, z, rx, rz);
  split(agents, n);
  resetGroup(g, F_BOX, x, z, h);
  const side = hw + T.ESCORT_SIDE;
  const target = k.tuning.shieldSpacing;
  // rang de tête : jusqu'à couvrir la largeur du cadre
  const nf = cFront.length;
  const head = Math.min(nf, Math.max(2, Math.round((2 * side) / target) + 1));
  cFront.sort(byKeyLat);
  // les boucliers restants se partagent les flancs ; puis les autres
  const rest: Agent[] = cRear;
  const chiefs = cRear.length;
  // ordre latéral conservé : les plus à gauche d'abord
  const flank: Agent[] = cSecond;
  const w = head > 1 ? 2 * side : target;
  // prélève le rang de tête au centre du tri latéral pour limiter les déplacements
  const start = Math.floor((nf - head) / 2);
  for (let i = 0; i < head; i++) {
    const a = cFront[start + i];
    setSlot(a, g, head > 1 ? -w / 2 + (w * i) / (head - 1) : 0, hl + 2.4, 0, 0);
    g.front.push(a);
  }
  // flancs : boucliers non retenus (gauche puis droite), suivis du second rang
  let li = 0;
  let ri = 0;
  for (let i = 0; i < start; i++) setSlot(cFront[i], g, -side, hl + 0.9 - 1.5 * li++, 0, 1);
  for (let i = start + head; i < nf; i++) setSlot(cFront[i], g, side, hl + 0.9 - 1.5 * ri++, 0, 1);
  flank.sort(byKeyLat);
  const half = Math.ceil(flank.length / 2);
  for (let i = 0; i < flank.length; i++) {
    if (i < half) setSlot(flank[i], g, -side, hl + 0.9 - 1.5 * li++, 0, 2);
    else setSlot(flank[i], g, side, hl + 0.9 - 1.5 * ri++, 0, 2);
  }
  // chefs et commandement : derrière l'élément escorté
  let j = 0;
  for (let i = 0; i < cThird.length; i++, j++) setSlot(cThird[i], g, (j - (cThird.length + chiefs - 1) / 2) * 1.2, -hl - 2.4, 0, 3);
  for (let i = 0; i < rest.length; i++, j++) setSlot(rest[i], g, (j - (cThird.length + chiefs - 1) / 2) * 1.2, -hl - 2.4, 0, 4);
  g.width = 2 * side;
  g.radius = hl;
  g.spacing = head > 1 ? w / (head - 1) : target;
}

/** Chacun tient l'endroit où il se trouve (initiative laissée, arrêt sur place). */
export function buildHold(g: FormGroup, agents: readonly Agent[], n: number): void {
  let x = 0;
  let z = 0;
  let sx = 0;
  let sz = 0;
  for (let i = 0; i < n; i++) {
    const p = agents[i].p;
    x += p.x;
    z += p.z;
    sx += Math.sin(p.heading);
    sz += Math.cos(p.heading);
  }
  if (n > 0) {
    x /= n;
    z /= n;
  }
  const h = n > 0 ? Math.atan2(sx, sz) : 0;
  resetGroup(g, F_HOLD, x, z, h);
  const fx = Math.sin(h);
  const fz = Math.cos(h);
  for (let i = 0; i < n; i++) {
    const a = agents[i];
    const p = a.p;
    a.cls = a.baseCls;
    const dx = p.x - x;
    const dz = p.z - z;
    setSlot(a, g, dx * -fz + dz * fx, dx * fx + dz * fz, wrapAngle(p.heading - h), a.baseCls);
    if (a.baseCls === CLS_FRONT) g.front.push(a);
  }
  g.width = 0;
  g.spacing = 0;
}
