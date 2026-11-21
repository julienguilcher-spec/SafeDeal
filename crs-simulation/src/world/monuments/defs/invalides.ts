/* Hôtel des Invalides (Libéral Bruant, 1671-1676) et église du Dôme (Jules Hardouin-Mansart, 1677-1706).
 * Emprise réelle de 274 × 256 m : façade nord de 196 m sur l'esplanade (+z), portail central sous un grand arc à
 * relief équestre, pavillons d'extrémité, quinze cours dont la cour d'honneur à deux étages d'arcades, combles
 * d'ardoise à lucarnes. Au sud (−z), dans l'échancrure de l'emprise : l'église Saint-Louis puis l'église du Dôme —
 * plan carré de 54 m, portail à deux ordres, tambour à colonnes jumelées, attique, DÔME de plomb à douze côtes et
 * trophées dorés, lanternon et flèche dorés culminant à 107 m. */
import type { QualityLevel } from '@/core/contracts';
import type { MonumentDef, MonumentSite } from '../types';
import {
  Builder, Geo, archivolt, box, column, cyl, dome, domeProfile, facadeMaterial, farMaterial, figureGeo, finishFar, horseGeo, lathe, polygon, pose,
  prism, spire, sweep, bandProfile, corniceProfile, type PalaceStyle,
} from '../kit';
import { addBody } from '../kit/x-palais-corps';
import { gableRoof, paintWalls, pavilion, portico } from '../kit/x-palais-pieces';
import { planOf, simplifyRing } from '../x-palais-plan';
import { insetRing, rectRing } from '../shape2d';
import { COURS, DOME, EMPRISE, H_MUR, NEF, PORTAIL } from '../collide/invalides';

const STYLE: PalaceStyle = {
  id: 'x_invalides', bay: 4.2, stone: 0xd8ccb0,
  floors: [{ height: 5.2, kind: 'bossages' }, { height: 4.6, kind: 'etage' }, { height: 4.4, kind: 'etage' }, { height: 3, kind: 'attique' }],
  roof: { kind: 'comble', height: 6.2, mat: 'ardoise', top: 'ardoise', lucarnes: true },
  cornice: 0.7, balustrade: false, pavilions: null, pilasters: false, plinth: 0.8,
};
/** Cours : deux étages de galeries à arcades. */
const COUR: PalaceStyle = {
  id: 'x_invalides_cour', bay: 4.4, stone: 0xd8ccb0,
  floors: [{ height: 6.2, kind: 'arcades' }, { height: 6.2, kind: 'arcades' }, { height: 4.8, kind: 'attique' }],
  roof: STYLE.roof, cornice: 0.7, balustrade: false, pavilions: null, pilasters: false, plinth: 0.6,
};
/** Massif carré de l'église du Dôme : deux ordres superposés. */
const EGLISE: PalaceStyle = {
  id: 'x_invalides_dome', bay: 6.0, stone: 0xdcd0b4,
  floors: [{ height: 14, kind: 'noble' }, { height: 14, kind: 'noble' }],
  roof: { kind: 'terrasse', height: 0.4, top: 'plomb' }, cornice: 1.0, balustrade: true, pavilions: null, pilasters: true, plinth: 1.4,
};

/** Demi-disque vertical (tympan), base sur y = 0, dans le plan z = 0, face vers +z ; UV calées sur un bas-relief. */
function halfDisc(r: number, seg: number, uw: number, vh: number): Geo {
  const g = new Geo();
  for (let i = 0; i < seg; i++) {
    const a0 = Math.PI - (i / seg) * Math.PI, a1 = Math.PI - ((i + 1) / seg) * Math.PI;
    const x0 = r * Math.cos(a0), y0 = r * Math.sin(a0), x1 = r * Math.cos(a1), y1 = r * Math.sin(a1);
    g.face3(0, 0, 0, x1, y1, 0, x0, y0, 0, 0.5 * uw, 0, (0.5 + x1 / (2 * r)) * uw, (y1 / r) * vh, (0.5 + x0 / (2 * r)) * uw, (y0 / r) * vh);
  }
  return g;
}

function addDome(b: Builder, quality: QualityLevel): void {
  const D = DOME, low = quality === 'bas', seg = low ? 20 : 36, lod = low ? 0 : 1;
  const stone = 'pierre_lisse';
  // massif carré à deux ordres, terrasse
  const sq = rectRing(0, 0, D.side, D.side);
  const { material, layout } = facadeMaterial(EGLISE);
  const fac = new Geo();
  paintWalls(fac, sq, 0, D.baseH, 0, layout.floorV[layout.floorV.length - 1], EGLISE.bay);
  b.add(material, fac);
  b.add(stone, sweep([0.3, 0, 0.3, 1.0, 0, 1.4], sq, { closed: true }));
  b.add(stone, sweep(bandProfile(13.3, 0.9, 0.5), sq, { closed: true }));
  b.add(stone, sweep(corniceProfile(D.baseH - 1.4, 1.4, 1.1), sq, { closed: true }));
  b.add('plomb', polygon(sq, D.baseH));
  b.add(stone, sweep([0, D.baseH, 0, D.baseH + 1.2, -0.5, D.baseH + 1.2, -0.5, D.baseH], insetRing(sq, -0.3), { closed: true }));
  // portail sud à deux ordres : dorique en bas, corinthien sous fronton en haut
  b.with(pose(0, 0, -D.side / 2, Math.PI), () => {
    portico(b, { width: 21, columns: 6, colH: 11, colD: 1.25, order: 'dorique', depth: 3.4, baseY: 1.6, steps: 9, entabH: 1.4, flutes: lod ? 20 : 0 });
    portico(b, { width: 21, columns: 6, colH: 10.6, colD: 1.05, order: 'corinthien', depth: 3.2, baseY: 14, bare: true, entabH: 2, pediment: 4.4, matTympan: 'relief_pierre', flutes: lod ? 16 : 0 });
    b.add('ombre', box(4.2, 8.2, 0.2).translate(0, 1.6, 0.12));
    if (!low) for (const s of [-1, 1]) { const f = figureGeo({ height: 4.2, lod: 0, robe: true, armR: { e: 1.0, a: 0.6 }, hat: 'couronne' }); b.add(stone, f.body.translate(s * 13.4, 1.6, 2.2)); b.add(stone, box(2.4, 1.6, 2.4).translate(s * 13.4, 0, 2.2)); }
  });
  // tambour : socle, mur, seize paires de colonnes, entablement
  b.add(stone, lathe([D.drumR + 2.6, D.baseH, D.drumR + 2.6, D.drumY, D.drumR, D.drumY], seg));
  b.add('pierre_blonde', cyl(D.drumR, D.drumR, D.atticTop - D.drumY, seg, { top: false }).translate(0, D.drumY, 0));
  const pairs = 16, rc = D.drumR + 1.45;
  for (let i = 0; i < pairs; i++) {
    const a = ((i + 0.5) / pairs) * Math.PI * 2;
    for (const s of [-1, 1]) {
      const aa = a + s * 0.062;
      b.with(pose(Math.sin(aa) * rc, D.drumY, Math.cos(aa) * rc, aa), () => column(b, { order: 'corinthien', height: D.colH, diameter: 1.12, mat: stone, flutes: 0, seg: low ? 6 : 8 }));
    }
    // baie haute du tambour, entre deux paires
    const w = (i / pairs) * Math.PI * 2;
    b.add('ombre', box(2.3, 6.4, 0.2).translate(0, D.drumY + 3.2, D.drumR + 0.04), pose(0, 0, 0, w));
  }
  const ey = D.drumY + D.colH;
  b.add(stone, lathe([D.drumR, ey - 0.2, D.drumR + 2.2, ey, D.drumR + 2.2, ey + 1.1, D.drumR + 2.8, ey + 1.5, D.drumR + 2.8, ey + 2.1, D.drumR - 0.2, ey + 2.1], seg));
  // attique : douze fenêtres cintrées et consoles, corniche
  const ay = ey + 2.1;
  const consoles = new Geo();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    b.add('ombre', box(2.2, 4.6, 0.2).translate(0, ay + 1.6, D.drumR - 0.06), pose(0, 0, 0, a + Math.PI / 12));
    consoles.append(new Geo().append(box(1.0, D.atticTop - ay - 1.2, 1.5)).append(box(1.3, 1.4, 2.6).translate(0, 0, 0.5)), pose(Math.sin(a) * (D.drumR + 0.4), ay, Math.cos(a) * (D.drumR + 0.4), a));
  }
  b.add(stone, consoles);
  b.add(stone, lathe([D.drumR - 0.2, D.atticTop - 1.2, D.drumR + 0.9, D.atticTop - 0.5, D.drumR + 0.9, D.atticTop, D.domeR - 0.2, D.atticTop], seg));
  // dôme de plomb, douze côtes et trophées dorés, lanternon et flèche dorés
  b.push(pose(0, D.atticTop, 0));
  const lanternR = 3.3;
  const top = dome(b, { radius: D.domeR, height: D.domeH, mat: 'plomb', ribs: 12, matRibs: 'or', seg, rows: low ? 7 : 11, shape: 0.86, lantern: { radius: lanternR, height: 13, mat: 'or', matRoof: 'or', bays: 8, finial: 'pointe' } });
  const prof = domeProfile(D.domeR + 0.14, D.domeH + 0.1, 11, 0.86, lanternR * 1.05);
  const trophies = new Geo();
  for (let i = 0; i < 12; i++) {
    const a = ((i + 0.5) / 12) * Math.PI * 2;
    trophies.append(lathe(prof.slice(2, 12), 2, { smooth: true, start: a - 0.11, sweep: 0.22 }));
    trophies.append(lathe(prof.slice(12, 18), 2, { smooth: true, start: a - 0.07, sweep: 0.14 }));
  }
  b.add('or', trophies);
  b.with(pose(0, top - 1.2, 0), () => spire(b, { radius: 1.5, height: D.top - D.atticTop - top + 0.1, mat: 'or', finial: 'croix', matFinial: 'or' }));
  b.pop();
}

function build(site: MonumentSite, quality: QualityLevel) {
  const p = planOf(site, EMPRISE);
  const b = new Builder();
  const low = quality === 'bas';
  b.with(pose(p.ox, 0, p.oz, p.rot), () => {
    addBody(b, p.ring, STYLE, { holes: COURS as number[][], courtStyle: COUR, passages: [PORTAIL], roofTol: 1.4, light: low });
    // pavillons d'extrémité de la façade nord (combles surélevés)
    for (const x of [-94.9, 88.8]) pavilion(b, { x, z: 122.6, w: 17.4, d: 10.8, style: STYLE, roof: 'pavillon', roofH: 9, topScale: 0.4, base: H_MUR, crest: 'plomb' });
    // avant-corps central : grand arc au-dessus de la corniche, relief équestre de Louis XIV
    b.with(pose(PORTAIL.x, 0, 128.25), () => {
      const piers = new Geo();
      for (const s of [-1, 1]) piers.append(box(2.4, H_MUR + 0.6, 0.9).translate(s * 8.8, 0, 0.1));
      piers.append(box(20, 1.1, 1.0).translate(0, H_MUR - 0.5, 0.1));
      b.add('pierre_lisse', piers);
      b.add('relief_pierre', halfDisc(8.6, low ? 10 : 18, 3.2, 2).translate(0, H_MUR + 0.6, 0.12));
      b.add('pierre_blonde', halfDisc(8.6, low ? 10 : 18, 6, 6).rotateY(Math.PI).translate(0, H_MUR + 0.6, 0.1));
      b.add('pierre_lisse', archivolt({ x: 0, width: 17.2, height: 8.6 }, 1.2, 0.7, low ? 10 : 18).translate(0, H_MUR + 0.6, -0.1));
      if (!low) {
        const rider = figureGeo({ height: 3.4, lod: 0, seated: true, armR: { e: 1.4, a: 0.3 }, hat: 'couronne' });
        b.add('pierre_lisse', new Geo().append(horseGeo({ scale: 2.2, gait: 0.2, lod: 0 }).rotateY(Math.PI / 2)).append(rider.body.rotateY(Math.PI / 2).translate(0, 2.1, 0)).scale(1, 1, 0.5).translate(0, H_MUR + 0.9, 0.7));
      }
    });
    // église Saint-Louis : nef et comble d'ardoise
    const nw = NEF.x1 - NEF.x0, nl = NEF.z1 - NEF.z0, nx = (NEF.x0 + NEF.x1) / 2, nz = (NEF.z0 + NEF.z1) / 2;
    b.add('pierre_blonde', box(nw, NEF.wallH, nl, { top: false }).translate(nx, 0, nz));
    b.add('ardoise', gableRoof(nl + 0.6, nw + 0.8, NEF.ridge - NEF.wallH).rotateY(Math.PI / 2).translate(nx, NEF.wallH, nz));
    b.add('pierre_blonde', new Geo().face3(NEF.x0, NEF.wallH, NEF.z1, NEF.x1, NEF.wallH, NEF.z1, nx, NEF.ridge, NEF.z1));
    b.with(pose(DOME.x, 0, DOME.z), () => addDome(b, quality));
  });
  return b.build('invalides');
}

export const def: MonumentDef = {
  key: 'invalides',
  name: 'Hôtel des Invalides',
  radius: 195,
  height: DOME.top,
  build,
  buildFar(site) {
    const p = planOf(site, EMPRISE);
    const b = new Builder();
    const stone = farMaterial(0xd6cab0), roof = farMaterial(0x4a5059, 0.2), lead = farMaterial(0x6c767b, 0.5), gold = farMaterial(0xd9b23a, 1.0, 0xffd27a);
    const D = DOME;
    b.with(pose(p.ox, 0, p.oz, p.rot), () => {
      const ring = simplifyRing(p.ring, 5);
      b.add(stone, prism(ring, 0, H_MUR, { top: false }));
      b.add(roof, prism(insetRing(ring, -2), H_MUR, H_MUR + 4));
      b.add(stone, box(NEF.x1 - NEF.x0, NEF.ridge - 2, NEF.z1 - NEF.z0).translate((NEF.x0 + NEF.x1) / 2, 0, (NEF.z0 + NEF.z1) / 2));
      b.add(stone, box(D.side, D.baseH, D.side).translate(D.x, 0, D.z));
      b.add(stone, cyl(D.drumR + 1.6, D.drumR + 1.6, D.atticTop - D.baseH, 12, { top: false }).translate(D.x, D.baseH, D.z));
      b.add(lead, lathe(domeProfile(D.domeR, D.domeH, 5, 0.86, 3.3), 12, { smooth: true }).translate(D.x, D.atticTop, D.z));
      b.add(gold, new Geo().append(cyl(3.3, 2.6, 12, 8)).append(cyl(1.5, 0.05, D.top - D.atticTop - D.domeH - 12, 6).translate(0, 12, 0)).translate(D.x, D.atticTop + D.domeH - 0.5, D.z));
    });
    return finishFar(b, 'invalides');
  },
};
