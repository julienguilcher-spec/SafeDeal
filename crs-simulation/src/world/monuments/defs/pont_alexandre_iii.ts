/* Pont Alexandre III (1896-1900, Résal et Alby ; décor de Cassien-Bernard et Cousin).
 * Arche métallique unique de 107,5 m, très surbaissée, à trois articulations ; tablier de 40 m ; quatre pylônes de
 * pierre de 17 m aux angles, à colonnes corinthiennes engagées, surmontés des Renommées de bronze doré retenant
 * Pégase ; au pied de chaque pylône une France assise ; lions conduits par des enfants aux entrées ; 32 candélabres de
 * bronze (28 à trois lanternes, 4 grands à ronde d'amours) ; guirlandes de la rive ; nymphes de la Seine et de la Neva
 * à la clef, autour des armes dorées.
 * La chaussée, les trottoirs et le bandeau du tablier sont dessinés par le module de la ville (arête « pont » du
 * graphe) : ce modèle fournit l'arche et les culées sous le tablier, les rives, les balustrades et tout le décor,
 * ajustés sur l'axe réel du tablier (x-ponts-plan.ts) et sur sa pente (site.groundAt). Origine = point d'ancrage de
 * la carte, au milieu du pont, au niveau de la chaussée ; +z local vers les Invalides. */
import type { QualityLevel } from '@/core/contracts';
import type { MonumentDef, MonumentSite } from '../types';
import {
  Builder, Geo, box, boxAt, columnGeo, cyl, entablature, farMaterial, figureGeo, finishFar, horseGeo, lionGeo, plinth, pose,
} from '../kit';
import { DECK_SLAB, PROUD, deckMatrix } from '../kit/x-ponts-pierre';
import { archY, candelabre, deckBalustrade, steelArch, swag } from '../kit/x-ponts-decor';
import { PA3, PA3_PYLONS, bridgeFrame, deckY, designPoint, type BridgeFrame } from '../x-ponts-plan';
import { PA3_DIM } from '../collide/pont_alexandre_iii';
import { rectRing } from '../shape2d';

const STONE = 'pierre_claire', SMOOTH = 'pierre_lisse_claire', STEEL = 'pont_acier', GOLD = 'or', GREEN = 'bronze_vert';
/** Extrados de l'arche à la clef (sous la dalle du tablier), hauteur de l'arc à la clef et aux naissances. */
const Y_CROWN = -DECK_SLAB - 0.1, D_CROWN = 0.85, D_SPRING = 1.5;
/** Seize candélabres par rive. */
const LAMPS = 16, LAMP_FROM = -52, LAMP_TO = 52;

function waterUnder(f: BridgeFrame): { w0: number; w1: number } {
  return { w0: f.waterY - deckY(f, f.s0), w1: f.waterY - deckY(f, f.s1) };
}

/** Flèche de l'extrados : les pieds de l'arc affleurent l'eau. */
function riseOf(f: BridgeFrame): number {
  const { w0, w1 } = waterUnder(f);
  return Math.max(1.6, Math.min(6.3, Y_CROWN - D_SPRING - Math.max(w0, w1) - 0.15));
}

/** Pylône d'angle, repère propre : origine au sol, +z vers l'accès du pont (l'extérieur), `road` = côté de la chaussée (±1 sur x). */
function pylon(b: Builder, quality: QualityLevel, road: number, seed: number): void {
  const lod = quality === 'bas' ? 0 : 1;
  const B = PA3_DIM.base, H = PA3_DIM.stoneH;
  // socle à bossages, dé des colonnes
  b.add('bossage_gris', box(B, 1.7, B));
  plinth(b, rectRing(0, 0, B, B), 0, 0.5, 0.14, { mat: STONE, closed: true });
  b.add(STONE, box(B - 0.5, 2.0, B - 0.5).translate(0, 1.7, 0));
  // fût et quatre colonnes corinthiennes d'angle
  const yCol = 3.7, hCol = 9.3;
  b.add(STONE, box(4.1, hCol, 4.1, { top: false }).translate(0, yCol, 0));
  const col = columnGeo({ order: 'corinthien', height: hCol, diameter: 0.92, mat: SMOOTH, flutes: lod === 0 ? 0 : 12, seg: lod === 0 ? 6 : 10 });
  const shafts = new Geo(), caps = new Geo();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { shafts.append(col.shaft.clone().translate(sx * 2.22, yCol, sz * 2.22)); caps.append(col.trim.clone().translate(sx * 2.22, yCol, sz * 2.22)); }
  b.add(SMOOTH, shafts); b.add(SMOOTH, caps);
  // entablement, attique portant le groupe
  const yEnt = yCol + hCol;
  b.add(STONE, box(5.3, 2.3, 5.3, { top: true, bottom: true }).translate(0, yEnt, 0));
  entablature(b, rectRing(0, 0, 5.3, 5.3), yEnt, 2.3, 0.6, { mat: SMOOTH, closed: true });
  b.add(STONE, box(4.3, H - yEnt - 2.3, 4.3).translate(0, yEnt + 2.3, 0));
  // cartouches dorés sur les quatre faces du fût (armes et trophées)
  const gold = new Geo();
  for (let k = 0; k < 4; k++) gold.append(cyl(0.72, 0.72, 0.16, 10).rotateX(Math.PI / 2).translate(0, yCol + hCol * 0.62, 2.06).rotateY((k * Math.PI) / 2));
  // Renommée retenant Pégase : cheval ailé cabré, figure debout à la trompette
  const peg = horseGeo({ rear: 0.52, scale: 1.42, lod });
  for (const s of [-1, 1]) {
    // ailes : deux pans relevés de part et d'autre du garrot
    const w = new Geo();
    w.face(s * 0.3, 2.9, 0.2, s * 0.5, 4.6, -0.5, s * 2.3, 5.0, -1.3, s * 1.5, 3.0, -0.9).face(s * 0.5, 4.6, -0.5, s * 0.3, 2.9, 0.2, s * 1.5, 3.0, -0.9, s * 2.3, 5.0, -1.3);
    peg.append(w);
  }
  gold.append(peg.translate(-0.25, H, -0.2));
  const fame = figureGeo({ height: 3.3, lod, robe: true, armR: { e: 2.5, a: 0.5, e2: 2.7, a2: 0.2 }, armL: { e: 1.3, a: 1.2, e2: 1.6, a2: 0.4 }, itemR: 'trompette', lean: -0.08, twist: -0.4 });
  gold.append(fame.body.translate(1.2, H, 0.9)).append(fame.items.translate(1.2, H, 0.9));
  b.add(GOLD, gold);
  // France assise au pied du pylône, vers l'accès
  const stone = new Geo();
  stone.append(box(3.0, 1.9, 2.4).translate(0, 0, B / 2 + 1.2));
  const seated = figureGeo({ height: 4.4, lod, seated: true, robe: true, hat: seed % 2 === 0 ? 'couronne' : 'casque', armL: { e: 0.9, a: 0.9, e2: 1.4, a2: 0.2 }, armR: { e: 1.4, a: 0.7, e2: 2.2, a2: 0.4 }, itemR: seed % 2 === 0 ? 'epee' : 'lance' });
  stone.append(seated.body.translate(0, 1.9, B / 2 + 0.75)).append(seated.items.translate(0, 1.9, B / 2 + 0.75));
  // lion conduit par un enfant, sur son socle, du côté de la chaussée
  const lx = road * 1.2, lz = PA3_DIM.lionOut;
  stone.append(box(2.0, 2.3, 4.2).translate(lx, 0, lz));
  stone.append(lionGeo('debout', 1.55, lod).translate(lx, 2.3, lz));
  const child = figureGeo({ height: 1.5, lod: 0, armL: { e: 1.9, a: 0.6 }, armR: { e: 0.4, a: 1.2 } });
  stone.append(child.body.translate(lx + road * 0.62, 2.3, lz + 0.9));
  b.add(SMOOTH, stone);
}

function build(site: MonumentSite, quality: QualityLevel) {
  const b = new Builder();
  const f = bridgeFrame(site, PA3);
  const low = quality === 'bas', lod = low ? 0 : 1;
  const HW = f.half + PROUD;
  const { w0, w1 } = waterUnder(f);
  const rise = riseOf(f);
  const yBase = Math.min(w0, w1) - 2.6;

  // ── sous le tablier (biais des rives) : arche métallique, culées de pierre ──
  b.with(deckMatrix(f, true), () => {
    steelArch(b, {
      z0: f.s0, z1: f.s1, half: HW, yCrown: Y_CROWN, rise, depthCrown: D_CROWN, depthSpring: D_SPRING,
      seg: low ? 14 : 28, ribs: low ? 0 : 5, struts: 3.45, yDeck: -DECK_SLAB + 0.05,
    });
    for (const [za, zb] of [[f.s0 - 9, f.s0 + 0.9], [f.s1 - 0.9, f.s1 + 9]]) {
      b.add('bossage_gris', boxAt(-HW - 0.7, yBase, za, HW + 0.7, -DECK_SLAB + 0.04, zb, { top: false }));
      b.add(STONE, boxAt(-HW - 0.95, -DECK_SLAB - 0.75, za - 0.25, HW + 0.95, -DECK_SLAB + 0.05, zb + 0.25, { top: false, bottom: true }));
    }
  });

  // ── rives du tablier et décor (sans biais) ──
  b.with(deckMatrix(f), () => {
    const steel = new Geo(), green = new Geo(), gold = new Geo();
    const zMid = (f.s0 + f.s1) / 2;
    for (const sx of [-1, 1]) {
      // poutre de rive couvrant le bandeau du tablier, cordon haut
      steel.append(boxAt(sx * HW, -DECK_SLAB - 0.14, f.s0 - 3, sx * (HW + 0.07), 0.02, f.s1 + 3, { bottom: true }));
      steel.append(boxAt(sx * HW, -0.16, f.s0 - 3, sx * (HW + 0.3), 0.03, f.s1 + 3, { bottom: true }));
      // guirlandes suspendues à la rive
      const n = Math.round((f.s1 - f.s0 - 8) / 3.45);
      for (let i = 0; i < n; i++) {
        const za = f.s0 + 4 + (i / n) * (f.s1 - f.s0 - 8), zb = f.s0 + 4 + ((i + 1) / n) * (f.s1 - f.s0 - 8);
        if (Math.abs((za + zb) / 2 - zMid) < 4.2) continue;
        green.append(swag(sx * (HW + 0.08), -0.22, za, zb, 0.52, sx, low ? 3 : 5));
      }
      // groupe de clef : nymphes adossées aux armes dorées (Seine en aval, Neva en amont)
      const x = sx * (HW + 0.1);
      steel.append(boxAt(sx * HW, -2.75, zMid - 3.6, sx * (HW + 1.15), -2.35, zMid + 3.6, { bottom: true }));
      gold.append(cyl(1.15, 1.15, 0.3, 14).rotateZ((-sx * Math.PI) / 2).translate(x + sx * 0.25, -1.05, zMid));
      gold.append(cyl(0.75, 0.6, 0.22, 10).rotateZ((-sx * Math.PI) / 2).translate(x + sx * 0.5, -1.05, zMid));
      gold.append(box(0.5, 0.55, 1.3).translate(x + sx * 0.3, 0.1, zMid));
      for (const side of [-1, 1]) {
        const nymph = figureGeo({ height: 3.0, lod, seated: true, robe: true, lean: 0.25, twist: side * 0.5, armL: { e: 1.5, a: 1.3 }, armR: { e: 0.8, a: 0.6, e2: 1.4, a2: 0.2 } });
        green.append(nymph.body.rotateY((sx * Math.PI) / 2).translate(x + sx * 0.45, -2.35, zMid + side * 2.3));
      }
      // balustrade de fonte, dés de pierre, candélabres
      const posts: number[] = [];
      for (let i = 0; i < LAMPS; i++) posts.push(LAMP_FROM + ((LAMP_TO - LAMP_FROM) * i) / (LAMPS - 1));
      deckBalustrade(b, f.half, sx, PA3_DIM.railFrom, PA3_DIM.railTo, posts);
      posts.forEach((z, i) => {
        b.with(pose(sx * (f.half - 0.2), 1.4, z), () => candelabre(b, { kind: i === 0 || i === LAMPS - 1 ? 'grand' : 'petit', lod }));
      });
    }
    b.add(STEEL, steel); b.add(GREEN, green); b.add(GOLD, gold);
  });

  // ── quatre pylônes, posés sur les rives ──
  PA3_PYLONS.forEach(([x, z], i) => {
    const p = designPoint(f, x, z);
    const s = (p[0] - f.ox) * f.ux + (p[1] - f.oz) * f.uz;
    const y = site.groundAt ? site.groundAt(p[0], p[1]) : deckY(f, s);
    const out = z > 0 ? 0 : Math.PI;
    const road = -Math.sign(x) * (z > 0 ? 1 : -1);
    b.with(pose(p[0], y, p[1], f.heading + out), () => pylon(b, quality, road, i));
  });
  return b.build('pont_alexandre_iii');
}

export const def: MonumentDef = {
  key: 'pont_alexandre_iii',
  name: 'Pont Alexandre III',
  radius: 90,
  height: 22,
  build,
  buildFar(site) {
    const b = new Builder();
    const f = bridgeFrame(site, PA3);
    const HW = f.half + PROUD, rise = riseOf(f);
    const steel = farMaterial(0xc2c7c9), stone = farMaterial(0xe2d9c3), gold = farMaterial(0xd9b23a, 1.0, 0xffd27a), dark = farMaterial(0x7f888c, 0.4);
    b.with(deckMatrix(f, true), () => {
      const n = 8, L = f.s1 - f.s0;
      const g = new Geo(), under = new Geo();
      for (let i = 0; i < n; i++) {
        const za = f.s0 + (i / n) * L, zb = f.s0 + ((i + 1) / n) * L;
        const ta = archY(za, f.s0, f.s1, Y_CROWN, rise) - 1.2, tb = archY(zb, f.s0, f.s1, Y_CROWN, rise) - 1.2;
        g.face(HW, tb, zb, HW, ta, za, HW, 1.1, za, HW, 1.1, zb).face(-HW, ta, za, -HW, tb, zb, -HW, 1.1, zb, -HW, 1.1, za);
        under.face(-HW, ta, za, HW, ta, za, HW, tb, zb, -HW, tb, zb);
      }
      b.add(steel, g); b.add(dark, under);
    });
    PA3_PYLONS.forEach(([x, z]) => {
      const p = designPoint(f, x, z);
      const y = site.groundAt ? site.groundAt(p[0], p[1]) : deckY(f, (p[0] - f.ox) * f.ux + (p[1] - f.oz) * f.uz);
      b.with(pose(p[0], y, p[1], f.heading), () => {
        b.add(stone, box(5.4, PA3_DIM.stoneH, 5.4));
        b.add(gold, box(2.4, 4.4, 3.6).translate(0, PA3_DIM.stoneH, 0));
      });
    });
    return finishFar(b, 'pont_alexandre_iii');
  },
};
