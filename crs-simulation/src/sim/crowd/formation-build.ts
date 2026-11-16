/* =====================================================================================
 * FOULE — dessin du cortège (suite de formation.ts) : répartition des personnes du plan en tronçons et
 * en rangs. Ordre, de l'avant vers l'arrière : cortège de tête, tampon, carré de tête (service d'ordre,
 * banderole, responsables), blocs par famille avec leur service d'ordre aux flancs et le camion sono en
 * tête du plus gros, queue de cortège.
 * ===================================================================================== */

import type { Rng } from '@/core/contracts';
import type { CrowdCause, CrowdFamily, SectionKind } from './api';
import type { Formation } from './formation';
import type { Plan } from './population';
import { sectionLabel } from './population';
import type { Corridor } from './route';
import * as T from './tuning';

const ORGANISED: readonly CrowdFamily[] = ['syndical', 'soignants', 'agriculteurs', 'etudiants', 'climat', 'retraites'];
const BLOC_ORDER: readonly CrowdFamily[] = ['etudiants', 'syndical', 'soignants', 'agriculteurs', 'climat', 'gilets_jaunes', 'divers', 'retraites'];

/**
 * Dessine le cortège pour les personnes du plan. Les postes fixes (service d'ordre, porteurs de
 * banderole, guide du camion) reçoivent leur emplacement tout de suite : c'est le tableau retourné
 * (−1 pour les autres). Les marcheurs ordinaires reçoivent seulement un tronçon (entrySection) : ils
 * prendront à leur arrivée la première place libre de ce tronçon, de l'avant vers l'arrière — une
 * place est ainsi toujours accessible par l'arrière du bloc, sans traverser les rangs déjà formés.
 */
export function buildFormation(f: Formation, plan: Plan, corridor: Corridor, cause: CrowdCause, wantSono: boolean, rng: Rng): Int32Array {
  f.reset();
  f.corridor = corridor;
  const entries = plan.entries;
  const n = entries.length;
  const slotOf = new Int32Array(n).fill(-1);
  const sectionOfEntry = new Int16Array(n).fill(-1);
  f.entrySection = sectionOfEntry;
  let current = -1;
  const W = corridor.refWidth;
  f.halfUse = W * 0.5 * 1.1;
  const cap = n * 3 + 160;
  f.slotBlock = new Int16Array(cap);
  f.slotBack = new Float32Array(cap);
  f.slotLat = new Float32Array(cap);
  f.slotJx = new Float32Array(cap);
  f.slotJz = new Float32Array(cap);
  f.slotStag = new Float32Array(cap);
  let column = 0;
  let pitch = 1;
  const B = new Float32Array(cap); // distance nominale derrière le front de tête

  // ── tri des personnes par tronçon ──
  let organised = false;
  let soCount = 0;
  for (const e of entries) {
    if (e.profile === 'service_ordre') soCount++;
    if (ORGANISED.indexOf(e.family) >= 0 && e.profile !== 'radical' && e.profile !== 'opportuniste') organised = true;
  }
  const pre: number[] = [];
  const banner: number[] = [];
  const leaders: number[] = [];
  const so: number[] = [];
  const queue: number[] = [];
  const byFamily = new Map<CrowdFamily, number[]>();
  for (let i = 0; i < n; i++) {
    const e = entries[i]!;
    if (e.profile === 'pilleur') continue;
    if (e.banner && e.family !== 'black_bloc') banner.push(i);
    else if (e.profile === 'service_ordre') so.push(i);
    else if (e.profile === 'meneur' && e.family !== 'black_bloc') leaders.push(i);
    else if (e.profile === 'radical' || e.profile === 'opportuniste' || e.family === 'black_bloc') pre.push(i);
    else if (organised && (e.family === 'gilets_jaunes' || e.family === 'divers') && e.profile !== 'famille') pre.push(i);
    else if (e.family === 'familles' || e.profile === 'famille') queue.push(i);
    else {
      let list = byFamily.get(e.family);
      if (!list) {
        list = [];
        byFamily.set(e.family, list);
      }
      list.push(i);
    }
  }
  // les groupes d'affinité restent côte à côte : tri stable par groupe à l'intérieur de chaque liste
  const byGroup = (a: number, b: number): number => {
    const ga = entries[a]!.group;
    const gb = entries[b]!.group;
    return ga === gb ? a - b : (ga < 0 ? a + 1e6 : ga * 1000) - (gb < 0 ? b + 1e6 : gb * 1000);
  };
  pre.sort(byGroup);
  queue.sort(byGroup);
  for (const list of byFamily.values()) list.sort(byGroup);

  let slot = 0;
  let back = 0;
  const jitter = (d: number): number => (rng.next() - 0.5) * d;
  const place = (entry: number, b: number, lat: number, spread: number): void => {
    const s = slot++;
    B[s] = b;
    f.slotLat[s] = lat;
    f.slotJx[s] = jitter(spread);
    f.slotJz[s] = jitter(spread);
    f.slotStag[s] = ((column++ * 0.618) % 1) * pitch;
    slotOf[entry] = s;
    sectionOfEntry[entry] = current;
  };
  /** Place libre du tronçon courant, attribuée plus tard au premier arrivant. */
  const free = (entry: number, b: number, lat: number, spread: number): void => {
    const s = slot++;
    B[s] = b;
    f.slotLat[s] = lat;
    f.slotJx[s] = jitter(spread);
    f.slotJz[s] = jitter(spread);
    f.slotStag[s] = ((column++ * 0.618) % 1) * pitch;
    sectionOfEntry[entry] = current;
    f.pools[current]!.push(s);
  };
  /** Rangs réguliers ; `flank` : service d'ordre posé sur les côtés tous les 3,5 m ; `clear` : couloir du camion. */
  const rows = (list: readonly number[], density: number, flank: number[] | null, clearFrom: number, clearTo: number): void => {
    const d = 1 / Math.sqrt(density);
    pitch = d;
    // les rangs n'occupent que 80 % de la largeur : il reste un passage le long de chaque flanc
    const edge = 0.8;
    let nextFlank = back;
    let i = 0;
    let row = 0;
    while (i < list.length) {
      const inClear = back >= clearFrom && back < clearTo;
      let perRow = Math.max(1, Math.floor((W * edge) / d));
      if (inClear) perRow = Math.max(2, perRow - Math.ceil((T.SONO_HALF_WIDTH * 2 + 1) / d));
      const count = Math.min(perRow, list.length - i);
      for (let jj = 0; jj < count; jj++) {
        // un rang de gauche à droite, le suivant de droite à gauche : deux places consécutives sont toujours
        // voisines, et les groupes d'affinité, qui les prennent à la suite, restent ensemble
        const j = row % 2 === 0 ? jj : count - 1 - jj;
        let lat: number;
        if (inClear) {
          // deux files de part et d'autre du camion
          const side = j % 2 === 0 ? -1 : 1;
          const k = j >> 1;
          const per = Math.max(1, Math.ceil(perRow / 2));
          const inner = (T.SONO_HALF_WIDTH + 0.7) / (W * 0.5);
          lat = side * (inner + ((k + 0.5) / per) * Math.max(0.05, edge - inner));
        } else {
          lat = (-1 + (2 * (j + 0.5)) / count) * edge * (count < perRow ? Math.max(0.35, count / perRow) : 1);
        }
        free(list[i + jj]!, back + jitter(d * 0.25), lat + jitter(0.3 * d) / (W * 0.5), 0.3);
      }
      i += count;
      row++;
      if (flank && flank.length > 0 && back >= nextFlank) {
        place(flank.pop()!, back, -0.9, 0.1);
        if (flank.length > 0) place(flank.pop()!, back, 0.9, 0.1);
        nextFlank = back + 3.5;
      }
      back += d;
    }
  };
  const sections: { kind: SectionKind; family: CrowdFamily; from: number; to: number; size: number }[] = [];
  const open = (kind: SectionKind, family: CrowdFamily): number => {
    current = sections.push({ kind, family, from: back, to: back, size: 0 }) - 1;
    f.pools.push([]);
    f.poolNext.push(0);
    return current;
  };
  const close = (index: number, size: number, gap: number): void => {
    sections[index]!.to = back;
    sections[index]!.size = size;
    back += gap;
  };

  // 1. cortège de tête
  let preEnd = -1;
  if (pre.length > 0) {
    const s = open('precortege', 'divers');
    rows(pre, T.DENSITY_PRECORTEGE, null, -1, -1);
    close(s, pre.length, 0);
    preEnd = back;
    // aligne le tronçon suivant sur un début de bloc : le tampon se règle par un écart entre deux blocs
    back = Math.ceil(back / T.BLOCK_LEN) * T.BLOCK_LEN;
  }
  // 2. carré de tête
  const frontSo: number[] = [];
  const flankSo: number[] = [];
  for (let i = 0; i < so.length; i++) (i % 2 === 0 ? frontSo : flankSo).push(so[i]!);
  if (banner.length + leaders.length + frontSo.length > 0) {
    const s = open('carre', banner.length > 0 ? entries[banner[0]!]!.family : 'syndical');
    const size = banner.length + leaders.length + frontSo.length;
    if (frontSo.length > 0) {
      // jusqu'à trois épaisseurs de service d'ordre devant la banderole
      const perRow = Math.max(2, Math.floor(W / 0.85));
      const lines = Math.min(3, Math.ceil(frontSo.length / perRow));
      const per = Math.ceil(frontSo.length / lines);
      for (let l = 0, i = 0; l < lines; l++) {
        const count = Math.min(per, frontSo.length - i);
        for (let j = 0; j < count; j++) place(frontSo[i + j]!, back, (-1 + (2 * (j + 0.5)) / count) * 0.85, 0.12);
        i += count;
        back += 0.9;
      }
      back += 0.6;
    }
    if (banner.length > 0) {
      // porteurs côte à côte, tous les 0,9 m, centrés ; une seconde banderole si la rue est trop étroite
      const perRow = Math.max(2, Math.floor((W - 1.5) / 0.9));
      for (let i = 0; i < banner.length;) {
        const count = Math.min(perRow, banner.length - i);
        for (let j = 0; j < count; j++) place(banner[i + j]!, back, ((j - (count - 1) * 0.5) * 0.9) / (W * 0.5), 0.05);
        i += count;
        back += 1.6;
      }
    }
    if (leaders.length > 0) rows(leaders, T.DENSITY_CARRE, null, -1, -1);
    close(s, size, 3);
  }
  // 3. blocs par famille ; le camion sono ouvre le plus gros bloc organisé
  let sonoFamily: CrowdFamily | null = null;
  if (wantSono) {
    let bestN = 0;
    for (const [family, list] of byFamily) {
      const bonus = family === 'syndical' ? 1.5 : ORGANISED.indexOf(family) >= 0 ? 1 : 0.6;
      if (list.length * bonus > bestN) {
        bestN = list.length * bonus;
        sonoFamily = family;
      }
    }
    if (bestN < 12) sonoFamily = null;
  }
  let sonoB = -1;
  for (const family of BLOC_ORDER) {
    const list = byFamily.get(family);
    if (!list || list.length === 0) continue;
    const organisedBloc = ORGANISED.indexOf(family) >= 0;
    const s = open(organisedBloc ? 'bloc' : 'divers', family);
    const flank: number[] = [];
    if (organisedBloc) {
      const share = Math.min(flankSo.length, Math.max(2, Math.round((flankSo.length * list.length) / Math.max(1, n - pre.length))));
      for (let k = 0; k < share && flankSo.length > 0; k++) flank.push(flankSo.pop()!);
    }
    let clearFrom = -1;
    let clearTo = -1;
    let members: readonly number[] = list;
    if (family === sonoFamily) {
      // un guide marche devant le camion, sur l'axe ; personne ne marche juste devant le pare-chocs
      const guide = flank.length > 0 ? flank.pop()! : list[0]!;
      if (guide === list[0]) members = list.slice(1);
      f.guideEntry = guide;
      place(guide, back, 0, 0.05);
      clearFrom = back + 0.5;
      sonoB = back + T.SONO_CLEAR_AHEAD + T.SONO_LENGTH * 0.5;
      clearTo = back + T.SONO_CLEAR_AHEAD + T.SONO_LENGTH + 1.5;
      if (members.length > 1) {
        f.driverEntry = members[members.length - 1]!;
        members = members.slice(0, members.length - 1);
      }
      back += 1;
    }
    rows(members, organisedBloc ? T.DENSITY_BLOC : T.DENSITY_DIVERS, flank, clearFrom, clearTo);
    if (clearTo > back) back = clearTo;
    // service d'ordre non placé : il ferme le bloc
    while (flank.length > 0) place(flank.pop()!, back, flank.length % 2 === 0 ? -0.86 : 0.86, 0.1);
    close(s, list.length, 4);
  }
  // service d'ordre restant (aucun bloc organisé) : derrière le carré
  if (flankSo.length > 0) {
    const s = open('bloc', 'syndical');
    rows(flankSo.splice(0), T.DENSITY_BLOC, null, -1, -1);
    close(s, 0, 3);
  }
  // 4. queue de cortège
  {
    const s = open('queue', 'familles');
    rows(queue, T.DENSITY_QUEUE, null, -1, -1);
    close(s, queue.length, 0);
    f.queueSection = s;
  }
  f.slotCount = slot;
  f.nextRowB = back + 1.2;

  // ── découpage en blocs ──
  const blocks = Math.max(1, Math.ceil((back + 0.01) / T.BLOCK_LEN)) + 12 + Math.ceil((n * 0.3) / 8);
  f.S = new Float64Array(blocks);
  f.V = new Float32Array(blocks);
  f.extra = new Float32Array(blocks);
  f.hold = new Float64Array(blocks).fill(-1);
  f.stretch = new Float32Array(blocks).fill(1);
  f.flankUsed = new Uint8Array(blocks * 2);
  f.blockCount = Math.max(1, Math.ceil((back + 0.01) / T.BLOCK_LEN));
  for (let s = 0; s < slot; s++) {
    const b = Math.min(f.blockCount - 1, Math.max(0, Math.floor(B[s]! / T.BLOCK_LEN)));
    f.slotBlock[s] = b;
    f.slotBack[s] = B[s]! - b * T.BLOCK_LEN;
  }
  if (preEnd >= 0 && sections.length > 1) {
    f.bufferBlock = Math.max(0, Math.ceil(preEnd / T.BLOCK_LEN) - 1);
    f.extra[f.bufferBlock] = T.BUFFER_CALM;
  }
  if (sonoB >= 0) {
    f.sonoBlock = Math.min(f.blockCount - 1, Math.floor(sonoB / T.BLOCK_LEN));
    f.sonoBack = sonoB - f.sonoBlock * T.BLOCK_LEN;
  }
  f.sections = sections.map((s, index) => ({
    index, kind: s.kind, label: sectionLabel(s.kind, s.family, cause, index), family: s.family, squadId: 0,
    firstBlock: Math.min(f.blockCount - 1, Math.floor(s.from / T.BLOCK_LEN)),
    lastBlock: Math.min(f.blockCount - 1, Math.max(Math.floor(s.from / T.BLOCK_LEN), Math.ceil(s.to / T.BLOCK_LEN) - 1)),
    size: s.size,
  }));

  // ── mise en place : la queue au début du parcours, la tête plus loin ──
  f.endS = Math.max(0, corridor.length - 2);
  let head = Math.min(Math.max(8, f.endS * 0.6), back + f.extra.reduce((a, b) => a + b, 0) + 6);
  for (let iter = 0; iter < 5; iter++) {
    f.layoutFrom(head);
    const tail = f.tailS;
    if (tail >= 2 || head >= f.endS * 0.6) break;
    head = Math.min(f.endS * 0.6, head + (2 - tail));
  }
  f.layoutFrom(head);
  return slotOf;
}
