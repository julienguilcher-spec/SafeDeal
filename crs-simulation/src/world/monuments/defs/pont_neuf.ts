/* Pont Neuf, grand bras (1578-1607) : le plus vieux pont de Paris, entre la rive droite et l'île de la Cité.
 * Sept arches de pierre en plein cintre ; piles à avant-becs portant des demi-lunes en encorbellement (alcôves
 * semi-circulaires à banc de pierre) ; corniche portée par des consoles à mascarons (381 masques sur tout le pont) ;
 * parapets pleins. Sur le terre-plein de l'île, côté aval : statue équestre d'Henri IV (bronze, 1818) sur un piédestal
 * à bas-reliefs de bronze, tournée vers la place Dauphine.
 * La chaussée et les trottoirs sont dessinés par le module de la ville ; ce modèle s'ajuste sur l'axe réel du tablier,
 * sa pente et le biais des rives (x-ponts-plan.ts). Origine = point d'ancrage, au niveau de la chaussée ; +z vers l'île. */
import type { QualityLevel } from '@/core/contracts';
import type { MonumentDef, MonumentSite } from '../types';
import { Builder, Geo, box, farMaterial, figureGeo, finishFar, horseGeo, pedestal, pose } from '../kit';
import { deckMatrix, stoneBridge, stoneBridgeFar, type StoneBridgeOpts } from '../kit/x-ponts-pierre';
import { HENRI_IV, PONT_NEUF, PONT_NEUF_ARCHES, bridgeFrame, deckY, designHeading, designPoint, type BridgeFrame } from '../x-ponts-plan';
import { HENRI_IV_DIM } from '../collide/pont_neuf';

function bridgeOpts(f: BridgeFrame, quality: QualityLevel): StoneBridgeOpts {
  return {
    z0: f.s0, z1: f.s1, half: f.half, arches: PONT_NEUF_ARCHES.arches, pier: PONT_NEUF_ARCHES.pier,
    water0: f.waterY - deckY(f, f.s0), water1: f.waterY - deckY(f, f.s1), quality, demiLunes: true,
  };
}

/** Pose de la statue : point du terre-plein, altitude du sol, cap. */
function statuePose(site: MonumentSite, f: BridgeFrame): { x: number; y: number; z: number; heading: number } {
  const p = designPoint(f, HENRI_IV.x, HENRI_IV.z);
  const y = site.groundAt ? site.groundAt(p[0], p[1]) : deckY(f, f.s1) - 0.5;
  return { x: p[0], y, z: p[1], heading: designHeading(f, HENRI_IV.heading) };
}

/** Statue équestre d'Henri IV, repère propre : origine au sol, le cheval marche vers +z. */
function henriIV(b: Builder, quality: QualityLevel): void {
  const lod = quality === 'bas' ? 0 : 1;
  const D = HENRI_IV_DIM;
  b.add('pierre_grise', box(D.stepW, D.stepH, D.stepL));
  b.with(pose(0, D.stepH, 0), () => pedestal(b, { width: D.pedW, depth: D.pedL, height: D.pedH, mat: 'pierre_lisse_claire', matDie: 'relief_bronze', projection: 0.22, baseH: 0.8, capH: 0.6 }));
  const y = D.stepH + D.pedH;
  const bronze = new Geo();
  bronze.append(box(1.5, 0.16, 3.7).translate(0, y, 0));
  const s = 1.55;
  bronze.append(horseGeo({ scale: s, gait: 0.18, lod }).translate(0, y + 0.16, -0.1));
  // le roi : en armure, tête laurée, bâton de commandement dans la main droite, rênes dans la gauche
  const H = 3.35;
  const king = figureGeo({
    height: H, lod, fly: true, hat: 'couronne', lean: -0.04,
    legL: { e: 0.95, a: 0.55, e2: 0.12, a2: 0.2 }, legR: { e: 0.95, a: 0.55, e2: 0.12, a2: 0.2 },
    armL: { e: 0.7, a: 0.3, e2: 1.45, a2: 0.1 }, armR: { e: 0.6, a: 0.9, e2: 1.5, a2: 0.5 }, itemR: 'epee', itemScale: 0.55,
  });
  const ry = y + 0.16 + 1.6 * s - 0.525 * H + 0.1;
  bronze.append(king.body.translate(0, ry, -0.12 * s)).append(king.items.translate(0, ry, -0.12 * s));
  b.add('bronze', bronze);
}

function build(site: MonumentSite, quality: QualityLevel) {
  const b = new Builder();
  const f = bridgeFrame(site, PONT_NEUF);
  b.with(deckMatrix(f, true), () => { stoneBridge(b, bridgeOpts(f, quality)); });
  const sp = statuePose(site, f);
  b.with(pose(sp.x, sp.y, sp.z, sp.heading), () => henriIV(b, quality));
  return b.build('pont_neuf');
}

export const def: MonumentDef = {
  key: 'pont_neuf',
  name: 'Pont Neuf (grand bras) et statue d\'Henri IV',
  radius: 113,
  height: 10,
  build,
  buildFar(site) {
    const b = new Builder();
    const f = bridgeFrame(site, PONT_NEUF);
    const stone = farMaterial(0xd8cbae), dark = farMaterial(0xa39a84, 0.5), bronze = farMaterial(0x4c4030, 0.9);
    b.with(deckMatrix(f, true), () => stoneBridgeFar(b, bridgeOpts(f, 'bas'), stone, dark));
    const sp = statuePose(site, f);
    b.with(pose(sp.x, sp.y, sp.z, sp.heading), () => {
      b.add(stone, box(HENRI_IV_DIM.pedW, HENRI_IV_DIM.pedH + HENRI_IV_DIM.stepH, HENRI_IV_DIM.pedL));
      b.add(bronze, box(1.1, 2.6, 3.6).translate(0, HENRI_IV_DIM.pedH + HENRI_IV_DIM.stepH, 0));
      b.add(bronze, box(0.9, 1.9, 0.9).translate(0, HENRI_IV_DIM.pedH + HENRI_IV_DIM.stepH + 2.6, -0.2));
    });
    return finishFar(b, 'pont_neuf');
  },
};
