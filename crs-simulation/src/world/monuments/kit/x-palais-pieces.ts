/* Lot « palais » — pièces propres aux palais : pavillons à haut comble, portiques et colonnades, tours rondes,
 * verrières, horloges, drapeaux, et les matériaux qui vont avec (textures sur canvas, comme le reste du kit). */
import * as THREE from 'three';
import { Builder } from './builder';
import { Geo, pose } from './geo';
import { box, cyl, lathe, polygon, sphere, sweep } from './shapes';
import { bandProfile, corniceProfile, loft, pediment, plinthProfile, stairs } from './classical';
import { column, type Order } from './column';
import { archBlock } from './arch';
import { canvas2d, css, texFrom } from './canvas';
import { defineMaterial, litMaterial, type MatRef } from './materials';
import { facadeMaterial, type PalaceStyle } from './facade';
import { insetRing, rectRing } from '../shape2d';
import { simplifyRing } from '../x-palais-plan';

// ───────────────────────────── matériaux ─────────────────────────────

function clockTexture(face: number, ink: number, rim: number): THREE.Texture | null {
  const cv = canvas2d(256, 256);
  if (!cv) return null;
  const g = cv.g, c = 128;
  g.clearRect(0, 0, 256, 256);
  g.fillStyle = css(rim); g.beginPath(); g.arc(c, c, 126, 0, Math.PI * 2); g.fill();
  g.fillStyle = css(face); g.beginPath(); g.arc(c, c, 110, 0, Math.PI * 2); g.fill();
  g.strokeStyle = css(ink); g.lineWidth = 3; g.beginPath(); g.arc(c, c, 100, 0, Math.PI * 2); g.stroke();
  g.fillStyle = css(ink);
  for (let i = 0; i < 12; i++) {
    g.save(); g.translate(c, c); g.rotate((i / 12) * Math.PI * 2);
    g.fillRect(-(i % 3 === 0 ? 5 : 3), -96, i % 3 === 0 ? 10 : 6, 26);
    g.restore();
  }
  // aiguilles : dix heures dix
  const hand = (angle: number, len: number, w: number): void => { g.save(); g.translate(c, c); g.rotate(angle); g.fillRect(-w / 2, -len, w, len + 10); g.restore(); };
  hand((10.17 / 12) * Math.PI * 2, 56, 9);
  hand((10 / 60) * Math.PI * 2, 84, 6);
  g.beginPath(); g.arc(c, c, 9, 0, Math.PI * 2); g.fill();
  return texFrom(cv, { clamp: true });
}

function clockMat(key: string, face: number, ink: number, rim: number): void {
  defineMaterial(key, () => {
    const t = clockTexture(face, ink, rim);
    const m = litMaterial(key, { color: t ? 0xffffff : face, roughness: 0.55, alphaTest: t ? 0.5 : 0, night: 1.5, nightColor: 0xfff0c8 }, t ? { map: t, bump: null } : null);
    m.userData.shadow = false;
    return m;
  });
}
/** Cadran clair à chiffres sombres (gares, hôtels de ville). */
clockMat('x_horloge', 0xf2ecd8, 0x1d1d1f, 0x3a3a3c);
/** Cadran d'azur à chiffres d'or (tour de l'Horloge du Palais). */
clockMat('x_horloge_azur', 0x22408c, 0xe3bb4a, 0xd0a53a);

defineMaterial('x_drapeau', () => {
  const cv = canvas2d(96, 64);
  if (!cv) return litMaterial('x_drapeau', { color: 0xdfe3ee, roughness: 0.9, side: THREE.DoubleSide });
  cv.g.fillStyle = '#21409a'; cv.g.fillRect(0, 0, 32, 64);
  cv.g.fillStyle = '#f4f4f0'; cv.g.fillRect(32, 0, 32, 64);
  cv.g.fillStyle = '#d02433'; cv.g.fillRect(64, 0, 32, 64);
  const m = litMaterial('x_drapeau', { color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide, night: 0.5 }, { map: texFrom(cv, { clamp: true }), bump: null });
  m.userData.shadow = false;
  return m;
});

/** Verrière : carreaux clairs dans une résille de fers sombres (motif de 2,4 m). Éclairée de l'intérieur la nuit. */
defineMaterial('x_verriere', () => {
  const cv = canvas2d(256, 256);
  if (!cv) return litMaterial('x_verriere', { color: 0x9fb2ba, roughness: 0.25, metalness: 0.35, night: 0.9 });
  const g = cv.g;
  const gr = g.createLinearGradient(0, 0, 256, 256);
  gr.addColorStop(0, '#b4c6cc'); gr.addColorStop(0.5, '#9db1b9'); gr.addColorStop(1, '#aebfc6');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  g.fillStyle = 'rgba(255,255,255,0.14)';
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if ((i * 3 + j * 5) % 4 === 0) g.fillRect(i * 64 + 4, j * 64 + 4, 56, 56);
  g.fillStyle = '#3f4649';
  for (let i = 0; i < 4; i++) { g.fillRect(i * 64 - 2, 0, 4, 256); g.fillRect(0, i * 64 - 1, 256, 2); }
  g.fillRect(0, 0, 6, 256); g.fillRect(250, 0, 6, 256);
  return litMaterial('x_verriere', { color: 0xffffff, roughness: 0.22, metalness: 0.35, night: 0.9, nightColor: 0xffe2b0 }, { map: texFrom(cv, { tile: 2.4 }), bump: null });
});

/** Verre de la pyramide : résille en losanges (une maille par unité d'UV), translucide. */
defineMaterial('x_verre_pyramide', () => {
  const cv = canvas2d(128, 128);
  const p: THREE.MeshStandardMaterialParameters = { roughness: 0.08, metalness: 0.55, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false };
  if (!cv) return litMaterial('x_verre_pyramide', { ...p, color: 0xa8c0c8, night: 1.2, nightColor: 0xffe0a8 });
  const g = cv.g;
  g.fillStyle = '#a9c3cc'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#55636a'; g.lineWidth = 5;
  g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 128); g.moveTo(128, 0); g.lineTo(128, 128);
  g.moveTo(-4, -4); g.lineTo(132, 132);          // u + v = 1 (la texture est retournée : v = 1 − y)
  g.stroke();
  const m = litMaterial('x_verre_pyramide', { ...p, color: 0xffffff, night: 1.2, nightColor: 0xffe0a8 }, { map: texFrom(cv), bump: null });
  m.userData.shadow = false;
  return m;
});

/** Rayures noires et blanches de 8,7 cm (colonnes de la cour d'honneur du Palais-Royal). */
defineMaterial('x_rayures', () => {
  const cv = canvas2d(64, 8);
  if (!cv) return litMaterial('x_rayures', { color: 0x8a8a88, roughness: 0.5, night: 0.8 });
  cv.g.fillStyle = '#f1efe8'; cv.g.fillRect(0, 0, 64, 8);
  cv.g.fillStyle = '#17181a'; cv.g.fillRect(0, 0, 32, 8);
  return litMaterial('x_rayures', { color: 0xffffff, roughness: 0.45, night: 0.8 }, { map: texFrom(cv, { tile: [0.174, 1] }), bump: null });
});

// ───────────────────────────── murs peints et toits simples ─────────────────────────────

/** Murs à façade peinte d'un anneau antihoraire, entre y0 et y1 (v0..v1 dans l'atlas du style). */
export function paintWalls(g: Geo, ring: ArrayLike<number>, y0: number, y1: number, v0: number, v1: number, bay: number): void {
  const n = ring.length >> 1;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = ring[2 * i], az = ring[2 * i + 1], bx = ring[2 * j], bz = ring[2 * j + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.05) continue;
    if (len < bay * 0.6) {
      const hu = Math.min(0.04, (len / bay) * 0.25);
      g.face(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az, -hu, v0, { u1: hu, v1 });
    } else g.face(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az, 0, v0, { u1: Math.max(1, Math.round(len / bay)) / 2, v1 });
  }
}

/** Toit à quatre versants (croupes) sur un rectangle w × d centré, égout à y = 0, faîte à y = h. */
export function hipRoof(w: number, d: number, h: number, ridge = 0.0): Geo {
  const run = Math.min(w, d) / 2 - 0.02;
  const lo = rectRing(0, 0, w, d), hi = insetRing(lo, -run * (1 - ridge));
  const g = loft(lo, 0, hi, h);
  if (ridge > 0) g.append(polygon(hi, h));
  return g;
}

/** Toit à deux versants, faîte le long de x, pignons en z ±d/2 non fermés. Égout à y = 0. */
export function gableRoof(w: number, d: number, h: number): Geo {
  const g = new Geo(), hw = w / 2, hd = d / 2;
  g.face(-hw, 0, hd, hw, 0, hd, hw, h, 0, -hw, h, 0);
  g.face(hw, 0, -hd, -hw, 0, -hd, -hw, h, 0, hw, h, 0);
  return g;
}

/** Voûte en berceau (verrière de nef) le long de x : longueur L, portée S (selon z), flèche R, naissance à y = 0. */
export function barrelVault(L: number, S: number, R: number, seg = 12, ends = true): Geo {
  const g = new Geo(), hl = L / 2, hs = S / 2;
  let v = 0;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI, a1 = ((i + 1) / seg) * Math.PI;
    const z0 = hs * Math.cos(a0), y0 = R * Math.sin(a0), z1 = hs * Math.cos(a1), y1 = R * Math.sin(a1);
    const dl = Math.hypot(z1 - z0, y1 - y0);
    g.faceUv(-hl, y0, z0, hl, y0, z0, hl, y1, z1, -hl, y1, z1, 0, v, L, v, L, v + dl, 0, v + dl);
    if (ends) {
      g.face3(hl, 0, 0, hl, y1, z1, hl, y0, z0, 0, 0, z1, y1, z0, y0);
      g.face3(-hl, 0, 0, -hl, y0, z0, -hl, y1, z1, 0, 0, z0, y0, z1, y1);
    }
    v += dl;
  }
  return g;
}

// ───────────────────────────── pavillon ─────────────────────────────

export interface PavilionOpts {
  x: number; z: number; w: number; d: number; rot?: number;
  style: PalaceStyle;
  /** Étage d'attique ajouté au-dessus des murs du style (m). */
  extra?: number;
  /** 'imperiale' : dôme carré bombé ; 'pavillon' : tronc de pyramide ; 'comble' : croupes jusqu'au faîte. */
  roof: 'imperiale' | 'pavillon' | 'comble' | 'terrasse';
  roofH: number;
  /** Part du petit côté conservée au sommet (terrasson). */
  topScale?: number;
  roofMat?: MatRef; topMat?: MatRef; trim?: MatRef;
  /** Crête de faîtage (matériau) ; grande lucarne sur les faces ; souches de cheminée. */
  crest?: MatRef; lucarnes?: boolean; chimneys?: boolean;
  /** Altitude où commencent les murs (0 par défaut). Au-dessus d'un guichet, donner la hauteur du corps voisin : seuls l'attique et le comble sont posés. */
  base?: number;
}

/** Pavillon : corps rectangulaire à façade peinte, attique, corniches, haut comble. Retourne l'altitude du sommet. */
export function pavilion(b: Builder, o: PavilionOpts): number {
  const { material, layout } = facadeMaterial(o.style);
  const H = layout.wallH, vTop = layout.floorV[layout.floorV.length - 1], lastV0 = layout.floorV[layout.floorV.length - 2];
  const extra = o.extra ?? 0, yTop = H + extra;
  const trim = o.trim ?? 'pierre_lisse';
  const ring = rectRing(0, 0, o.w, o.d);
  let top = yTop;
  b.with(pose(o.x, 0, o.z, o.rot ?? 0), () => {
    const cor = (o.style.cornice ?? 0.7) * 1.1;
    const base = Math.min(o.base ?? 0, H);
    const fac = new Geo();
    if (base < H - 0.2) paintWalls(fac, ring, base, H, (base / H) * vTop, vTop, o.style.bay);
    if (extra > 0) paintWalls(fac, ring, H, yTop, lastV0, vTop, o.style.bay);
    b.add(material, fac);
    if (base <= 0) b.add(trim, sweep(plinthProfile(0, o.style.plinth ?? 0.8, 0.16), ring, { closed: true }));
    if (extra > 0) b.add(trim, sweep(corniceProfile(H - cor, cor, cor), ring, { closed: true }));
    b.add(trim, sweep(corniceProfile(yTop - cor, cor, cor), ring, { closed: true }));
    const roofMat = o.roofMat ?? 'ardoise', topMat = o.topMat ?? 'zinc';
    if (o.roof === 'terrasse') { b.add(topMat, polygon(ring, yTop + 0.05)); return; }
    const half = Math.min(o.w, o.d) / 2;
    const ts = o.roof === 'comble' ? 0.0 : (o.topScale ?? 0.3);
    const I = half * (1 - ts) - 0.02;
    const r0 = insetRing(ring, -0.25);
    const steps = o.roof === 'imperiale' ? 6 : 1;
    let prev = r0, py = yTop, last = r0;
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      const ins = o.roof === 'imperiale' ? I * (1 - Math.cos((t * Math.PI) / 2)) : I * t;
      const y = yTop + (o.roof === 'imperiale' ? o.roofH * Math.sin((t * Math.PI) / 2) : o.roofH * t);
      const r = insetRing(r0, -ins);
      b.add(roofMat, loft(prev, py, r, y));
      prev = r; py = y; last = r;
    }
    top = yTop + o.roofH;
    if (ts > 0) {
      b.add(topMat, polygon(last, top));
      if (o.crest) b.add(o.crest, sweep([0, top - 0.15, 0.14, top - 0.15, 0.14, top + 0.55, 0, top + 0.55, -0.1, top + 0.55, -0.1, top], last, { closed: true }));
      if (o.crest) top += 0.55;
    }
    if (o.lucarnes) {
      const g = new Geo();
      const lw = Math.min(2.4, o.w * 0.16), lh = Math.min(3.4, o.roofH * 0.34);
      const one = (): Geo => new Geo().append(box(lw, lh, 1.6)).append(box(lw + 0.5, 0.3, 1.9, { bottom: true }).translate(0, lh, 0)).append(sphere(lw * 0.42, 8, 4).scale(1, 0.8, 0.6).translate(0, lh + 0.3, 0.3));
      g.append(one().translate(0, yTop + 0.2, o.d / 2 - 1.1)).append(one().rotateY(Math.PI).translate(0, yTop + 0.2, -o.d / 2 + 1.1));
      if (o.w < o.d * 1.8) g.append(one().rotateY(Math.PI / 2).translate(o.w / 2 - 1.1, yTop + 0.2, 0)).append(one().rotateY(-Math.PI / 2).translate(-o.w / 2 + 1.1, yTop + 0.2, 0));
      b.add(trim, g);
    }
    if (o.chimneys) {
      const g = new Geo();
      const ch = o.roofH * 0.8;
      for (const s of [-1, 1]) {
        g.append(box(1.3, ch, 2.6).translate(s * (o.w / 2 - 1.4), yTop, 0));
        g.append(box(1.6, 0.4, 2.9, { bottom: true }).translate(s * (o.w / 2 - 1.4), yTop + ch, 0));
      }
      b.add(trim, g);
    }
  });
  return top;
}

// ───────────────────────────── portique ─────────────────────────────

export interface PorticoOpts {
  /** Largeur hors tout de la colonnade. */
  width: number;
  /** Nombre de colonnes (ou de paires si `pairs`). */
  columns: number;
  colH: number; colD?: number; order?: Order; flutes?: number;
  /** Distance du mur (plan z = 0) au nu extérieur des colonnes. */
  depth: number;
  /** Altitude du sol du portique (0 par défaut) ; avec `steps`, emmarchement de toute la largeur devant. */
  baseY?: number; steps?: number; tread?: number;
  entabH?: number;
  /** Flèche du fronton ; 0 ou absent = entablement seul. */
  pediment?: number;
  mat?: MatRef; matCol?: MatRef; matCap?: MatRef; matTympan?: MatRef; matRoof?: MatRef; matSteps?: MatRef;
  pairs?: boolean;
  /** Colonnes en retour sur les côtés (nombre par côté, hors colonne d'angle). */
  returns?: number;
  /** Pas de dalle ni de plafond (colonnade plaquée devant un mur). */
  bare?: boolean;
}

/** Portique : mur dans le plan z = 0, colonnade vers +z, centré en x. Retourne les altitudes utiles. */
export function portico(b: Builder, o: PorticoOpts): { entabTop: number; top: number } {
  const mat = o.mat ?? 'pierre_lisse', matCol = o.matCol ?? mat;
  const D = o.colD ?? o.colH / 10, y0 = o.baseY ?? 0, eh = o.entabH ?? o.colH * 0.22;
  const hw = o.width / 2, zc = o.depth - D * 0.68, zf = o.depth - D * 0.1;
  if (!o.bare && y0 > 0) {
    b.add(o.matSteps ?? mat, box(o.width + 0.5, y0, o.depth).translate(0, 0, o.depth / 2));
    const n = o.steps ?? Math.max(1, Math.round(y0 / 0.17));
    b.with(pose(0, 0, o.depth), () => stairs(b, o.width + 0.5, y0, n * (o.tread ?? 0.36), n, o.matSteps ?? mat));
  }
  const n = Math.max(2, o.columns);
  const pitch = (o.width - D * 1.3) / (n - 1);
  const col = { order: o.order ?? 'corinthien', height: o.colH, diameter: D, mat: matCol, matCapital: o.matCap ?? matCol, flutes: o.flutes, seg: 10 } as const;
  for (let i = 0; i < n; i++) {
    const x = -hw + D * 0.65 + i * pitch;
    if (o.pairs) for (const s of [-1, 1]) b.with(pose(x + s * D * 0.72, y0, zc), () => column(b, col));
    else b.with(pose(x, y0, zc), () => column(b, col));
  }
  const rt = o.returns ?? 0;
  for (let k = 1; k <= rt; k++) {
    const z = zc - (k * (zc - D * 0.7)) / rt;
    for (const s of [-1, 1]) b.with(pose(s * (hw - D * 0.65), y0, z), () => column(b, col));
  }
  // entablement : poutres, puis corniche extrudée sur les trois côtés
  const ya = y0 + o.colH, bh = eh * 0.62;
  const beams = new Geo();
  beams.append(box(o.width, bh, D * 1.16, { bottom: true }).translate(0, ya, zc));
  for (const s of [-1, 1]) beams.append(box(D * 1.16, bh, zc, { bottom: true }).translate(s * (hw - D * 0.58), ya, zc / 2));
  b.add(mat, beams);
  const U = [-hw, 0, -hw, zf, hw, zf, hw, 0];
  b.add(mat, sweep(bandProfile(ya + bh * 0.42, bh * 0.08, 0.06), U));
  b.add(mat, sweep(corniceProfile(ya + bh, eh - bh, eh * 0.42), U));
  const entabTop = ya + eh;
  let top = entabTop;
  if (!o.bare) b.add(mat, new Geo().face(-hw, ya + 0.02, 0, hw, ya + 0.02, 0, hw, ya + 0.02, zf, -hw, ya + 0.02, zf));
  const rise = o.pediment ?? 0, roof = o.matRoof ?? 'zinc';
  if (rise > 0) {
    const pw = o.width + eh * 0.5;
    b.with(pose(0, entabTop, zf), () => pediment(b, { width: pw, rise, depth: eh * 0.42, mat, matTympan: o.matTympan }));
    const g = new Geo(), e = pw / 2;
    g.face(-e, entabTop, zf, 0, entabTop + rise, zf, 0, entabTop + rise, 0, -e, entabTop, 0);
    g.face(0, entabTop + rise, zf, e, entabTop, zf, e, entabTop, 0, 0, entabTop + rise, 0);
    b.add(roof, g);
    top = entabTop + rise + Math.max(0.25, rise * 0.14);
  } else b.add(roof, new Geo().face(-hw, entabTop, zf, hw, entabTop, zf, hw, entabTop, 0, -hw, entabTop, 0));
  return { entabTop, top };
}

// ───────────────────────────── tours, horloges, drapeaux ─────────────────────────────

export interface TowerOpts {
  r: number; h: number;
  /** Hauteur du toit conique (poivrière). */
  roofH: number;
  mat?: MatRef; roofMat?: MatRef; seg?: number;
  /** Couronnement en encorbellement (mâchicoulis). */
  corbel?: boolean;
}

/** Tour ronde médiévale à toit en poivrière, posée sur y = 0. Retourne l'altitude de la pointe. */
export function roundTower(b: Builder, o: TowerOpts): number {
  const seg = o.seg ?? 16, r = o.r, c = o.corbel === false ? 0 : 0.5;
  b.add(o.mat ?? 'pierre_grise', lathe([r * 1.06, 0, r * 1.06, 1.4, r, 2.0, r, o.h - 2.4, r + c, o.h - 1.5, r + c, o.h, r - 0.3, o.h], seg));
  const roof = new Geo();
  roof.append(cyl(r + c + 0.35, r * 0.62, o.roofH * 0.28, seg, { top: false }));
  roof.append(cyl(r * 0.62, 0.06, o.roofH * 0.72, seg, { top: false }).translate(0, o.roofH * 0.28, 0));
  b.add(o.roofMat ?? 'ardoise', roof.translate(0, o.h, 0));
  b.add('plomb', new Geo().append(cyl(0.07, 0.03, 1.6, 5).translate(0, o.h + o.roofH - 0.1, 0)).append(sphere(0.22, 6, 4).translate(0, o.h + o.roofH + 0.4, 0)));
  return o.h + o.roofH + 1.5;
}

/** Cadran d'horloge de rayon r, dans le plan z = 0, face vers +z, centré à l'origine de la pose courante. */
export function clock(b: Builder, r: number, mat: MatRef = 'x_horloge', frame: MatRef | null = 'pierre_lisse'): void {
  b.add(mat, new Geo().face(-r, -r, 0.08, r, -r, 0.08, r, r, 0.08, -r, r, 0.08, 0, 0, { u1: 1, v1: 1 }));
  if (frame) b.add(frame, lathe([r * 0.98, 0, r * 1.14, 0, r * 1.14, 0.22, r * 0.98, 0.14], 20).rotateX(Math.PI / 2));
}

/** Drapeau tricolore sur sa hampe, pied de hampe à l'origine de la pose courante. Le pavillon flotte vers +x. */
export function flag(b: Builder, poleH: number, w = 2.4, tilt = 0): void {
  const g = cyl(0.05, 0.035, poleH, 5);
  if (tilt !== 0) g.rotateZ(-tilt);
  b.add('fer_noir', g);
  const tx = Math.sin(tilt) * poleH, ty = Math.cos(tilt) * poleH, h = w * 0.66;
  b.add('x_drapeau', new Geo().face(tx, ty - h, 0, tx + w, ty - h - 0.12, 0.18, tx + w, ty - 0.12, 0.18, tx, ty, 0, 0, 0, { u1: 1, v1: 1 }));
}

/** Rangée de souches de cheminée le long d'un segment (x0, z0) → (x1, z1), à l'altitude y. */
export function chimneyRow(x0: number, z0: number, x1: number, z1: number, y: number, count: number, h = 3.2): Geo {
  const g = new Geo(), a = Math.atan2(x1 - x0, z1 - z0);
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    g.append(new Geo().append(box(0.9, h, 2.0)).append(box(1.15, 0.3, 2.3, { bottom: true }).translate(0, h, 0)), pose(x0 + (x1 - x0) * t, y, z0 + (z1 - z0) * t, a));
  }
  return g;
}

/** Silhouette lointaine d'un corps de bâtiment : murs sur l'emprise simplifiée, comble en retrait. */
export function farBody(b: Builder, ring: ArrayLike<number>, wallH: number, roofH: number, stone: MatRef, roof: MatRef, tol = 4): void {
  const r = simplifyRing(ring, tol);
  b.add(stone, prismGeo(r, 0, wallH, false));
  if (roofH > 0) b.add(roof, prismGeo(insetRing(r, -Math.min(3, roofH * 0.6)), wallH, wallH + roofH, true));
}

function prismGeo(ring: number[], y0: number, y1: number, top: boolean): Geo {
  const g = new Geo(), n = ring.length >> 1;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    g.face(ring[2 * i], y0, ring[2 * i + 1], ring[2 * j], y0, ring[2 * j + 1], ring[2 * j], y1, ring[2 * j + 1], ring[2 * i], y1, ring[2 * i + 1]);
  }
  if (top) g.append(polygon(ring, y1));
  return g;
}

export interface GateOpts {
  /** Largeur, hauteur et épaisseur du massif du portail ; baie : largeur et hauteur sous clef. */
  width: number; height: number; depth: number; archW: number; archH: number;
  order?: Order;
  mat?: MatRef;
  /** Vantaux fermés (matériau) ; absent = portail ouvert. */
  door?: MatRef;
  /** Couronnement : 'attique' (bloc plein) ou aucun. */
  crown?: 'attique' | 'aucun';
  /** Ne pas construire le massif percé (il est déjà fourni par un passage du corps de bâtiment). */
  noBlock?: boolean;
}

/**
 * Portail monumental d'hôtel particulier : massif percé d'une arche, deux paires de colonnes, entablement, attique.
 * Façade vers +z, centré, posé sur y = 0. Retourne l'altitude du sommet.
 */
export function gatePortal(b: Builder, o: GateOpts): number {
  const mat = o.mat ?? 'pierre_lisse', hd = o.depth / 2;
  if (!o.noBlock) archBlockLocal(b, o.width, o.height, o.depth, o.archW, o.archH, mat);
  if (o.door) {
    const sp = o.archH - o.archW / 2;
    const d = new Geo().append(box(o.archW, sp, 0.3));
    // imposte cintrée : éventail de trois panneaux
    for (let i = 0; i < 6; i++) {
      const a0 = (i / 6) * Math.PI, a1 = ((i + 1) / 6) * Math.PI, r = o.archW / 2;
      d.face3(0, sp, 0.15, r * Math.cos(a0), sp + r * Math.sin(a0), 0.15, r * Math.cos(a1), sp + r * Math.sin(a1), 0.15);
      d.face3(0, sp, -0.15, r * Math.cos(a1), sp + r * Math.sin(a1), -0.15, r * Math.cos(a0), sp + r * Math.sin(a0), -0.15);
    }
    b.add(o.door, d);
  }
  const colH = o.height - 1.3, D = Math.max(0.5, colH / 9.5);
  for (const s of [-1, 1]) for (const k of [0, 1]) {
    const x = s * (o.archW / 2 + D * 0.9 + k * D * 1.7);
    if (Math.abs(x) + D * 0.7 > o.width / 2) continue;
    for (const t of [-1, 1]) if (t > 0 || o.depth > 2.5) b.with(pose(x, 0.4, t * (hd + D * 0.45)), () => column(b, { order: o.order ?? 'ionique', height: colH - 0.4, diameter: D, mat, flutes: 0, seg: 8 }));
  }
  const ring = rectRing(0, 0, o.width + 0.2, o.depth + D * 1.9);
  b.add(mat, sweep(plinthProfile(0, 0.4, 0.1), ring, { closed: true }));
  b.add(mat, box(o.width + 0.2, 0.7, o.depth + D * 1.9, { bottom: true }).translate(0, colH, 0));
  b.add(mat, sweep(corniceProfile(colH + 0.7, 0.6, 0.45), ring, { closed: true }));
  let top = o.height;
  if (o.crown !== 'aucun') {
    b.add(mat, box(o.width - 0.6, 1.5, o.depth + 0.4).translate(0, o.height, 0));
    b.add(mat, box(o.width - 0.2, 0.3, o.depth + 0.8, { bottom: true }).translate(0, o.height + 1.5, 0));
    top = o.height + 1.8;
  }
  return top;
}

function archBlockLocal(b: Builder, width: number, height: number, depth: number, archW: number, archH: number, mat: MatRef): void {
  archBlock(b, { width, height, depth, openings: [{ x: 0, width: archW, height: archH }], mat, seg: 10 });
}

/** Mur de clôture le long d'une polyligne (hauteur h, épaisseur t), chaperon en saillie. */
export function gardenWall(path: ArrayLike<number>, h: number, t = 0.5): Geo {
  const w = t / 2;
  return sweep([-w, 0, w, 0, w, h - 0.25, w + 0.08, h - 0.25, w + 0.08, h, -w - 0.08, h, -w - 0.08, h - 0.25, -w, h - 0.25, -w, 0], path);
}
