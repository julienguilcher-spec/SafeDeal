/* Colonne de Juillet, place de la Bastille (1840) : 50,5 m du sol au flambeau du Génie.
 * Soubassement circulaire de marbre rouge puis de marbre blanc (3 m, 24 têtes de lion), base carrée de marbre
 * blanc à 24 médaillons, piédestal de bronze au lion de Barye et aux quatre coqs, fût de bronze de 23 m divisé
 * en trois par quatre colliers et couvert de noms en lettres d'or, chapiteau composite, lanterne, globe, et le
 * Génie de la Liberté doré : ailé, un pied sur le globe, flambeau levé, chaîne brisée. */
import type { QualityLevel } from '@/core/contracts';
import type { MonumentDef } from '../types';
import {
  Builder, Geo, birdGeo, box, cyl, defineMaterial, farMaterial, figure, finishFar, hemisphere, inscriptionTex, ironFence, lathe, litMaterial,
  pedestal, pedestalRound, pose, ribbon, sphere,
} from '../kit';
import { ngonRing, rectRing } from '../shape2d';

const RED_H = 0.85, WHITE_H = 3.0, SQUARE_H = 2.6, PED_H = 4.95, BASE_H = 1.0, SHAFT_H = 23, CAP_H = 2.9;
const R0 = 1.95, R1 = 1.7;

defineMaterial('juillet_fut', () => litMaterial('juillet_fut', { color: 0xffffff, roughness: 0.5, metalness: 0.35, night: 0.9 }, inscriptionTex(0x3f4a3a, 0xd9b04a, 22, 91, [3.2, 6], 0.85))
  ?? litMaterial('juillet_fut', { color: 0x3f4a3a }));

function build(quality: QualityLevel) {
  const b = new Builder();
  const lod = quality === 'bas' ? 0 : 1, seg = quality === 'bas' ? 16 : 28;
  // soubassements
  let y = pedestalRound(b, 6.5, RED_H, 'marbre_rouge', seg + 8, 0.18, RED_H * 0.3, RED_H * 0.3);
  b.push(pose(0, y, 0));
  pedestalRound(b, 5.6, WHITE_H, 'marbre_blanc', seg + 8, 0.4, 0.7, 0.6);
  b.pop();
  const lions = new Geo();
  for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; lions.append(sphere(0.2, 5, 3).translate(Math.sin(a) * 6.02, y + WHITE_H - 0.3, Math.cos(a) * 6.02)); }
  y += WHITE_H;
  b.push(pose(0, y, 0));
  pedestal(b, { width: 6.5, depth: 6.5, height: SQUARE_H, mat: 'marbre_blanc', projection: 0.3, baseH: 0.5, capH: 0.45 });
  b.pop();
  for (let k = 0; k < 4; k++) for (let i = 0; i < 6; i++) {
    lions.append(cyl(0.36, 0.36, 0.1, 8).rotateX(Math.PI / 2).translate(-2.5 + i, y + SQUARE_H * 0.52, 3.26).rotateY((k * Math.PI) / 2));
  }
  y += SQUARE_H;
  // piédestal de bronze : lion de Barye (face), inscriptions, coqs aux angles
  b.push(pose(0, y, 0));
  pedestal(b, { width: 4.5, depth: 4.5, height: PED_H, mat: 'bronze', matDie: 'relief_bronze', projection: 0.35, baseH: 0.8, capH: 0.7 });
  b.pop();
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    lions.append(birdGeo('coq', 1.5), pose(Math.sin(a) * 2.85, y + PED_H, Math.cos(a) * 2.85, a));
  }
  b.add('bronze', lions);
  y += PED_H;
  // fût : tore de base, trois tambours couverts de noms dorés, quatre colliers
  b.add('bronze', lathe([2.5, y, 2.5, y + 0.35, 2.25, y + 0.45, 2.35, y + 0.7, 2.1, y + 0.85, R0, y + BASE_H], seg));
  y += BASE_H;
  b.add('juillet_fut', cyl(R0, R1, SHAFT_H, seg, { top: false }).translate(0, y, 0));
  const collars = new Geo();
  for (let k = 0; k < 4; k++) {
    const t = k / 3, r = R0 + (R1 - R0) * t + 0.02, yy = y + t * (SHAFT_H - 0.55);
    collars.append(lathe([r, yy, r + 0.13, yy + 0.06, r + 0.13, yy + 0.49, r, yy + 0.55], seg));
  }
  b.add('bronze', collars);
  y += SHAFT_H;
  // chapiteau composite, tailloir, balustrade de la plateforme
  const cap = new Geo();
  cap.append(lathe([R1, y, R1 + 0.14, y + 0.08, R1 + 0.14, y + 0.3, R1, y + 0.4, R1 + 0.4, y + 1.1, R1 + 0.2, y + 1.2, R1 + 0.75, y + 2.0, R1 + 0.75, y + 2.15], seg));
  for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + (k * Math.PI) / 2; cap.append(sphere(0.42, 6, 4).translate(Math.sin(a) * (R1 + 0.95), y + 1.95, Math.cos(a) * (R1 + 0.95))); }
  cap.append(box(5.3, CAP_H - 2.15, 5.3, { bottom: true }).translate(0, y + 2.15, 0));
  b.add('bronze', cap);
  y += CAP_H;
  b.add('grille', ribbon(rectRing(0, 0, 5.1, 5.1), y, y + 1.1, true, 1));
  // lanterne, calotte, globe
  const lan = new Geo();
  lan.append(cyl(1.45, 1.35, 0.5, 12, { top: false }).translate(0, y, 0));
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; lan.append(cyl(0.14, 0.14, 2.6, 5, { top: false }).translate(Math.sin(a) * 1.15, y + 0.5, Math.cos(a) * 1.15)); }
  lan.append(cyl(0.8, 0.8, 2.6, 8, { top: false }).translate(0, y + 0.5, 0));
  lan.append(lathe([1.3, y + 3.1, 1.48, y + 3.2, 1.48, y + 3.45, 1.3, y + 3.5], 12));
  lan.append(hemisphere(1.3, 12, 4, 0.8).translate(0, y + 3.5, 0));
  lan.append(cyl(0.5, 0.42, 0.5, 8, { top: false }).translate(0, y + 4.45, 0));
  b.add('bronze', lan);
  y += 4.95;
  b.add('or', sphere(0.78, 12, 8).translate(0, y + 0.7, 0));
  // Génie de la Liberté : en équilibre sur le pied gauche, jambe droite levée en arrière, ailes déployées
  b.with(pose(0, y + 1.42, 0), () => figure(b, 'or', {
    height: 3.9, lod, wings: 1.15, lean: 0.14,
    legL: { e: 0.05, a: 0 }, legR: { e: 0.75, a: Math.PI, e2: 1.35, a2: Math.PI },
    armR: { e: 2.75, a: 0.35 }, armL: { e: 0.75, a: 0.9, e2: 1.0, a2: 0.3 }, itemR: 'torche', itemL: 'chaine',
  }));
  ironFence(b, ngonRing(0, 0, 8.4, quality === 'bas' ? 16 : 32), { height: 1.6, closed: true, mat: 'grille_doree' });
  return b.build('colonne_juillet');
}

export const def: MonumentDef = {
  key: 'colonne_juillet',
  name: 'Colonne de Juillet',
  radius: 8.8,
  height: 50.5,
  build(_site, quality) { return build(quality); },
  buildFar() {
    const b = new Builder();
    const bronze = farMaterial(0x45503e, 0.9), marble = farMaterial(0xe6e2d8);
    b.add(farMaterial(0x8e4a3c), cyl(6.6, 6.6, RED_H, 12, { flat: true }));
    b.add(marble, cyl(5.8, 5.8, WHITE_H, 12, { flat: true }).translate(0, RED_H, 0));
    b.add(marble, box(6.7, SQUARE_H, 6.7).translate(0, RED_H + WHITE_H, 0));
    const y1 = RED_H + WHITE_H + SQUARE_H, y2 = y1 + PED_H, y3 = y2 + BASE_H + SHAFT_H;
    b.add(bronze, box(4.7, PED_H, 4.7).translate(0, y1, 0));
    b.add(bronze, cyl(R0, R1, SHAFT_H + BASE_H, 8, { top: false }).translate(0, y2, 0));
    b.add(bronze, box(5.3, 1.6, 5.3, { bottom: true }).translate(0, y3 + CAP_H - 1.6, 0));
    b.add(bronze, cyl(1.4, 0.9, 5, 6, { top: false }).translate(0, y3 + CAP_H, 0));
    const gold = farMaterial(0xd8ab33, 1.2, 0xffd27a);
    b.add(gold, cyl(0.8, 0.8, 1.5, 5).translate(0, y3 + CAP_H + 4.95, 0));
    b.add(gold, cyl(0.7, 0.35, 5.2, 4).translate(0, y3 + CAP_H + 6.4, 0));
    b.add(gold, box(3.6, 2.4, 0.2, { bottom: true }).translate(0, y3 + CAP_H + 8.7, -0.5));
    return finishFar(b, 'colonne_juillet');
  },
};
