/* =====================================================================================
 * RENDU DU DÉCOR — assemblage : écrit dans un tampon la géométrie d'un objet, d'une barricade ou
 * d'une devanture dans son état courant, au niveau de détail demandé, relative à une origine.
 * Aucune allocation par appel (matrices et tableaux de travail réutilisés).
 * ===================================================================================== */

import type { PropAtlas } from './atlas';
import { region } from './atlas-layout';
import type { Region } from './atlas-layout';
import { FX_TL_R, GeoBuilder } from './geo';
import { stateCode } from './mapping';
import { emitBuf, emitQuad, hash01, matIdentity, matNew, matRotY, matScale, matTranslate } from './meshbuf';
import type { MeshBuf } from './meshbuf';
import { ModelLibrary, V_BURNING, V_BURNT } from './models';
import { partMatrix, propMatrix } from './placement';
import type { PropRec, ShopRec } from './records';
import { buildShopSoot, buildShopfront } from './shopfront';

const TAG_REGIONS: Region[] = [];
for (let i = 0; i < 8; i++) TAG_REGIONS.push(region('tag_' + i));

/** Donne aux sommets à effet « phasé » (feux tricolores, feu, clignotants) la phase de l'objet. */
function stampPhase(buf: MeshBuf, v0: number, v1: number, phase: number): void {
  const fx = buf.fx;
  for (let i = v0; i < v1; i++) if (fx[i * 4]! >= FX_TL_R) fx[i * 4 + 2] = phase;
}

export class Assembler {
  private readonly m1 = matNew();
  private readonly m2 = matNew();
  private readonly base = matNew();
  private readonly pen = new GeoBuilder(0, 0);

  /**
   * Surélévation du sol dessiné (trottoirs, terre-pleins) au-dessus du relief de la simulation (service 'world.view',
   * liftAt) : sans elle, les objets posés sur un trottoir s'enfoncent de quelques centimètres dans la bordure.
   */
  lift: (x: number, z: number) => number = () => 0;

  constructor(readonly lib: ModelLibrary, private atlas: PropAtlas) {}

  setAtlas(atlas: PropAtlas): void {
    this.atlas = atlas;
  }

  /**
   * Objet dans son état courant. (ox, oz) : origine du tampon de destination. `glass` : reçoit la partie
   * transparente en coordonnées monde (null = ignorée).
   */
  prop(dst: MeshBuf, rec: PropRec, lod: number, ox: number, oz: number, glass: MeshBuf | null): void {
    const p = rec.prop;
    const variant = stateCode(p.state);
    if (rec.barricade) {
      this.barricade(dst, rec, lod, variant, ox, oz);
      return;
    }
    const melted = variant === V_BURNT && rec.info.burn === 'fond';
    const m = propMatrix(this.m1, rec.kind, rec.id, p.x, p.y + this.lift(p.x, p.z), p.z, p.heading, p.halfX, p.halfZ, p.height, p.toppled, p.carriedBy !== 0, melted);
    if (rec.scaled) matScale(m, p.halfX / rec.info.hx, p.height / rec.info.h, p.halfZ / rec.info.hz);
    const tpl = this.lib.get(rec.kind, lod, variant, rec.skin, rec.panes);
    if (glass && tpl.g && lod <= 1) emitBuf(glass, tpl.g, m);
    m[3]! -= ox;
    m[11]! -= oz;
    const v0 = dst.nv;
    emitBuf(dst, tpl.o, m);
    if (variant === V_BURNING || rec.info.model === 'feu_tricolore') stampPhase(dst, v0, dst.nv, rec.phase);
    const nt = Math.min(p.tags | 0, tpl.tags.length, 3);
    for (let k = 0; k < nt; k++) emitQuad(dst, m, tpl.tags[k]!, TAG_REGIONS[(rec.seed + k * 3) & 7]!, 0xffffff);
  }

  /** Partie transparente seule (reconstruction du lot de verre), en coordonnées monde. */
  glassOnly(glass: MeshBuf, rec: PropRec, lod: number): void {
    const p = rec.prop;
    const variant = stateCode(p.state);
    const tpl = this.lib.get(rec.kind, lod, variant, rec.skin, rec.panes);
    if (!tpl.g) return;
    const melted = variant === V_BURNT && rec.info.burn === 'fond';
    const m = propMatrix(this.m1, rec.kind, rec.id, p.x, p.y + this.lift(p.x, p.z), p.z, p.heading, p.halfX, p.halfZ, p.height, p.toppled, p.carriedBy !== 0, melted);
    emitBuf(glass, tpl.g, m);
  }

  /**
   * Barricade : chaque élément de sa composition à sa place, renversé comme dans la simulation,
   * légèrement de travers ; débris de remplissage ; sol noirci quand elle brûle ou a brûlé.
   */
  private barricade(dst: MeshBuf, rec: PropRec, lod: number, variant: number, ox: number, oz: number): void {
    const p = rec.prop;
    const parts = rec.parts;
    const base = matIdentity(this.base);
    matTranslate(base, p.x - ox, p.y + this.lift(p.x, p.z), p.z - oz);
    matRotY(base, p.heading);
    const v0 = dst.nv;
    if (parts) {
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]!;
        const tpl = this.lib.get(part.kind, lod, variant, rec.id + i, 9);
        if (tpl.o.nv === 0) continue;
        emitBuf(dst, tpl.o, partMatrix(this.m2, base, part, i, rec.id, parts, p.height, variant === V_BURNT));
      }
    }
    if (lod <= 1) {
      // gravats et planches entre les éléments
      const n = Math.max(1, Math.round(p.halfX * 0.8));
      for (let k = 0; k < n; k++) {
        const m = this.m2;
        m.set(base);
        matTranslate(m, (n === 1 ? 0 : -p.halfX + ((k + 0.5) * 2 * p.halfX) / n) + (hash01(rec.id + k * 9) - 0.5) * 0.6, 0, (hash01(rec.id * 5 + k) - 0.5) * p.halfZ * 1.6);
        matRotY(m, hash01(rec.id + k * 31) * 6.28);
        emitBuf(dst, this.lib.get('debris', lod, variant === V_BURNT ? V_BURNT : 0, rec.id + k, 0).o, m);
      }
    }
    if (variant === V_BURNING) stampPhase(dst, v0, dst.nv, rec.phase);
    if (variant === V_BURNING || variant === V_BURNT) {
      const b = this.pen.begin(dst, base);
      b.c(0xffffff).tex('suie').quadY(0, 0.016, 0, p.halfX * 2 + 2.2, p.halfZ * 2 + 2.4).tex('');
    }
  }

  /** Devanture d'un commerce dans son état courant. Gère la cellule d'enseigne (prise de près, rendue au loin). */
  shop(dst: MeshBuf, rec: ShopRec, lod: number, ox: number, oz: number): void {
    const s = rec.shop;
    // (devanture sur la façade habillée d'un commissariat : la façade montre l'habillage du site)
    if (rec.masked) {
      this.releaseSign(rec);
      return;
    }
    const m = matIdentity(this.m1);
    matTranslate(m, s.x - ox, s.y + this.lift(s.x, s.z), s.z - oz);
    matRotY(m, s.heading);
    let sign: Region | null = null;
    if (lod <= 1 && !rec.state.burnt) {
      if (!rec.signHeld) {
        rec.sign = this.atlas.acquireSign(s.name, rec.style);
        rec.signHeld = rec.sign !== null;
      }
      sign = rec.sign;
    } else {
      this.releaseSign(rec);
    }
    buildShopfront(dst, m, s.width, s.category, rec.style, rec.state, lod, sign, rec.seed);
  }

  /** Traînées de suie d'une boutique (lot fondu), en coordonnées monde. */
  shopSoot(blend: MeshBuf, rec: ShopRec): void {
    if (rec.masked) return;
    const s = rec.shop;
    const m = matIdentity(this.m1);
    matTranslate(m, s.x, s.y + this.lift(s.x, s.z), s.z);
    matRotY(m, s.heading);
    buildShopSoot(blend, m, s.width, rec.state);
  }

  releaseSign(rec: ShopRec): void {
    if (!rec.signHeld) return;
    this.atlas.releaseSign(rec.shop.name, rec.style);
    rec.signHeld = false;
    rec.sign = null;
  }
}

