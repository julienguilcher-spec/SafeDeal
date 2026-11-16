/* Centre Georges-Pompidou (Piano, Rogers, Franchini, 1977).
 * Cotes réelles : 166 m de long, 45 m de large (60 m avec l'ossature et l'escalier mécanique), 42 m de haut ;
 * six plateaux espacés de 7 m ; 14 portiques (13 travées de 12,80 m) ; gerberettes, tirants et croix de
 * Saint-André en façade. Côté piazza (ouest, +z) : « chenille » de l'escalier mécanique, tube vitré à dessous
 * rouge montant en diagonale du pied nord au dernier niveau, puis galerie tubulaire haute. Côté rue du Renard
 * (est, −z) : gaines apparentes au code couleur — bleu (air), vert (eau), jaune (électricité), rouge (ascenseurs).
 * Toute la tuyauterie et l'ossature partagent UN matériau à nuancier (un appel de dessin). */
import * as THREE from 'three';
import type { QualityLevel } from '@/core/contracts';
import type { MonumentDef, MonumentSite } from '../types';
import { Builder, Geo, beam, box, boxAt, canvas2d, css, cyl, defineMaterial, farMaterial, finishFar, litMaterial, texFrom, tube } from '../kit';
import { glazingMaterial, siteAlign } from '../kit/x-edifices';
import { BOX, CP, EMPRISE } from '../collide/centre_pompidou';

const PALETTE = [0xe9e9e4, 0x2d6cb5, 0x2f9e5b, 0xf2c230, 0xd2342b, 0x6a7176, 0xb9cdd6, 0x2a2e33];
const WHITE = 0, BLUE = 1, GREEN = 2, YELLOW = 3, RED = 4, GREY = 5, TUBE = 6, DARK = 7;

defineMaterial('pompidou_nuancier', () => {
  const cv = canvas2d(PALETTE.length * 8, 8);
  if (!cv) return litMaterial('pompidou_nuancier', { color: PALETTE[WHITE], roughness: 0.55, night: 0.9 });
  PALETTE.forEach((c, i) => { cv.g.fillStyle = css(c); cv.g.fillRect(i * 8, 0, 8, 8); });
  const t = texFrom(cv, { clamp: true });
  t.generateMipmaps = false; t.minFilter = THREE.NearestFilter; t.magFilter = THREE.NearestFilter;
  return litMaterial('pompidou_nuancier', { color: 0xffffff, roughness: 0.5, metalness: 0.1, night: 1.0, nightColor: 0xfff0d8 }, { map: t, bump: null });
});
const PAINT = 'pompidou_nuancier';
const GLASS = glazingMaterial('pompidou_verre', {
  frame: 0xe9e9e4, glass: 0x607a88, tile: [6.4, 7], panes: [4, 2], bar: 0.05, minor: 0.014, night: 1.5, solid: 0.14, solidColor: 0x8d979c,
});

/** Affecte à toute une géométrie la teinte n° i du nuancier. */
function tint(g: Geo, i: number): Geo {
  const u = (i + 0.5) / PALETTE.length;
  for (let k = 0; k < g.uv.length; k += 2) { g.uv[k] = u; g.uv[k + 1] = 0.5; }
  return g;
}

function build(site: MonumentSite, quality: QualityLevel): Builder {
  const b = new Builder();
  const lod: 0 | 1 = quality === 'bas' ? 0 : 1;
  const { HX, ZB0, ZB1, ZE, ZW, H, BAY, FLOOR, ZTUBE, XFOOT } = CP;
  b.push(siteAlign(site, EMPRISE, BOX));
  const p = new Geo();                        // tout ce qui est peint au nuancier
  const xs: number[] = [];
  for (let i = 0; i <= 13; i++) xs.push(-HX + i * BAY);
  // ── volume vitré et toiture ──
  b.add(GLASS, boxAt(-HX, 0, ZB0, HX, H, ZB1, { top: false }));
  p.append(tint(boxAt(-HX - 0.3, H, ZB0 - 0.3, HX + 0.3, H + 0.5, ZB1 + 0.3), GREY));
  // ── ossature : poteaux, gerberettes, tirants, lisses, croix de Saint-André, sur les deux longs pans ──
  const frame = new Geo();
  for (const side of [1, -1]) {
    const zc = side > 0 ? ZB1 + 1.6 : ZB0 - 1.6, zo = side > 0 ? ZW : ZE, zi = side > 0 ? ZB1 - 0.4 : ZB0 + 0.4;
    for (const x of xs) {
      frame.append(cyl(0.43, 0.43, H + 0.8, lod > 0 ? 10 : 6).translate(x, 0, zc));
      frame.append(cyl(0.11, 0.11, H, 5, { top: false }).translate(x, 0, zo));
      for (let k = 1; k <= 6; k++) frame.append(beam(x, k * FLOOR + 0.1, zi, x, k * FLOOR - 0.75, zo, 0.42, 0.85, true));
    }
    for (let k = 1; k <= 6; k++) frame.append(beam(-HX, k * FLOOR - 0.75, zo, HX, k * FLOOR - 0.75, zo, 0.3, 0.3));
    for (let i = 0; i < 13; i++) for (let k = 0; k < 6; k++) {
      if (lod === 0 && (i + k) % 2 === 1) continue;
      const y0 = k === 0 ? 0.2 : k * FLOOR - 0.75, y1 = (k + 1) * FLOOR - 0.75;
      frame.append(tube(xs[i], y0, zo, xs[i + 1], y1, zo, 0.075, 0.075, 4));
      frame.append(tube(xs[i + 1], y0, zo, xs[i], y1, zo, 0.075, 0.075, 4));
    }
  }
  // pignons nord et sud : grands contreventements
  for (const sx of [-1, 1]) for (let k = 0; k < 6; k++) {
    frame.append(tube(sx * (HX + 0.5), k * FLOOR, ZB0, sx * (HX + 0.5), (k + 1) * FLOOR, ZB1, 0.12, 0.12, 5));
    frame.append(tube(sx * (HX + 0.5), k * FLOOR, ZB1, sx * (HX + 0.5), (k + 1) * FLOOR, ZB0, 0.12, 0.12, 5));
  }
  p.append(tint(frame, WHITE));
  // ── côté piazza : coursives, puis la « chenille » ──
  const walk = new Geo();
  for (let k = 1; k <= 6; k++) walk.append(boxAt(-HX, k * FLOOR - 0.3, ZB1 + 2.2, HX, k * FLOOR - 0.05, ZW - 0.3, { bottom: true }));
  p.append(tint(walk, GREY));
  const glassTube = new Geo(), red = new Geo(), hoops = new Geo();
  const R = 1.85, seg = lod > 0 ? 12 : 8;
  const run = (ax: number, ay: number, bx: number, by: number): void => {
    glassTube.append(tube(ax, ay, ZTUBE, bx, by, ZTUBE, R, R, seg));
    red.append(beam(ax, ay - R - 0.12, ZTUBE, bx, by - R - 0.12, ZTUBE, 0.3, 2.6, true));
    const len = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.round(len / (lod > 0 ? 3.2 : 6.4)));
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = ax + (bx - ax) * t, y = ay + (by - ay) * t, dx = ((bx - ax) / len) * 0.09, dy = ((by - ay) / len) * 0.09;
      hoops.append(tube(x - dx, y - dy, ZTUBE, x + dx, y + dy, ZTUBE, R + 0.1, R + 0.1, seg));
    }
  };
  let x = XFOOT, y = 2.6;
  glassTube.append(boxAt(XFOOT - 6, 0, ZTUBE - 2.2, XFOOT, 3.4, ZTUBE + 2.2));
  for (let k = 0; k < 5; k++) {
    run(x, y, x + 19, y + FLOOR);
    run(x + 19, y + FLOOR, x + 24.8, y + FLOOR);
    // suspentes vers l'ossature
    hoops.append(beam(x + 21.9, y + FLOOR + R, ZTUBE, x + 21.9, y + FLOOR + R + 2.2, ZW, 0.14, 0.14));
    x += 24.8; y += FLOOR;
  }
  run(-HX + 2, y, HX - 2, y);
  p.append(tint(glassTube, TUBE)).append(tint(red, RED)).append(tint(hoops, WHITE));
  // ── côté rue du Renard : gaines bleues (air), vertes (eau), jaunes (électricité), rouges (ascenseurs) ──
  const blue = new Geo(), green = new Geo(), yellow = new Geo(), lifts = new Geo();
  for (let i = 0; i < 13; i++) {
    const xc = xs[i] + BAY / 2;
    for (const d of [-2.7, 2.7]) {
      blue.append(cyl(0.72, 0.72, H + 2.6, lod > 0 ? 10 : 6).translate(xc + d, 0.4, -29.6));
      blue.append(tube(xc + d, H + 2.6, -29.6, xc + d, H + 2.6, -24, 0.72, 0.72, lod > 0 ? 10 : 6, true));
      blue.append(cyl(1.0, 0.72, 1.2, lod > 0 ? 10 : 6).translate(xc + d, 0.4, -29.6));
    }
    for (const d of [-4.9, 4.9]) green.append(cyl(0.27, 0.27, H, 6).translate(xc + d, 0, -31.2));
    yellow.append(box(0.8, H - 3, 0.45).translate(xc, 1.5, -31.5));
    if (i % 3 === 1) {
      lifts.append(box(4.2, 3.6, 3.4).translate(xc, H + 0.5, -29.4));
      for (const d of [-1.7, 1.7]) lifts.append(box(0.3, H, 0.3, { top: false }).translate(xc + d, 0, -32.2));
      lifts.append(box(3.0, 3.2, 1.6).translate(xc, 9 + (i % 4) * 6, -31.4));
      yellow.append(box(3.4, 2.6, 1.6).translate(xc + 4.6, 0, -31.2));
    }
  }
  // sur le toit : tours de refroidissement bleues, prises d'air blanches
  for (let i = 0; i < 5; i++) blue.append(box(11, 4.4, 9).translate(-58 + i * 29, H + 0.5, -9));
  const vents = new Geo();
  for (let i = 0; i < 6; i++) vents.append(cyl(1.3, 1.9, 3.2, 8).translate(-70 + i * 28, H + 0.5, 9));
  p.append(tint(blue, BLUE)).append(tint(green, GREEN)).append(tint(yellow, YELLOW)).append(tint(lifts, RED));
  // ── piazza : dallage en pente douce (ici à plat) et manches à air blanches ──
  b.add('granit_gris', boxAt(-HX - 0.8, 0, ZW + 4.9, HX + 0.8, 0.05, ZW + 60));
  for (const [vx, vz, rot] of [[-74, 84, 0.4], [-80, 70, 1.2], [70, 86, -0.5]] as const) {
    const g = new Geo();
    g.append(cyl(1.5, 1.5, 4.6, 10, { top: false }));
    g.append(tube(0, 4.6, 0, 0, 6.2, 1.4, 1.5, 1.5, 10)).append(tube(0, 6.2, 1.4, 0, 6.6, 3.4, 1.5, 2.2, 10));
    vents.append(g.rotateY(rot).translate(vx, 0, vz));
  }
  p.append(tint(vents, WHITE));
  p.append(tint(boxAt(-HX, 0, ZB1 + 0.05, HX, 6.4, ZB1 + 0.25), DARK));
  b.add(PAINT, p);
  b.pop();
  return b;
}

export const def: MonumentDef = {
  key: 'centre_pompidou',
  name: 'Centre Georges-Pompidou',
  radius: 122,
  height: 46,
  build(site, quality) { return build(site, quality).build('centre_pompidou'); },
  buildFar(site) {
    const b = new Builder();
    const { HX, ZB0, ZB1, ZE, ZW, H, ZTUBE, XFOOT } = CP;
    const glass = farMaterial(0x7d8f99, 1.2, 0xffe2b0), white = farMaterial(0xe9e9e4), blue = farMaterial(0x2d6cb5), red = farMaterial(0xd2342b);
    b.push(siteAlign(site, EMPRISE, BOX));
    b.add(glass, boxAt(-HX, 0, ZB0, HX, H, ZB1));
    for (let i = 0; i <= 13; i += 1) for (const z of [ZW, ZE]) b.add(white, box(0.5, H, 0.5, { top: false }).translate(-HX + i * 12.8, 0, z));
    for (const z of [ZW, ZE]) b.add(white, boxAt(-HX, H - 0.6, Math.min(z, z > 0 ? ZB1 : ZB0), HX, H, Math.max(z, z > 0 ? ZB1 : ZB0)));
    b.add(blue, boxAt(-HX + 2, 0, -31, HX - 2, H + 2.5, -28.4));
    b.add(blue, boxAt(-64, H, -14, 64, H + 4.5, -4));
    b.add(red, beam(XFOOT, 2.6, ZTUBE, XFOOT + 124, 37.6, ZTUBE, 3.6, 3.6));
    b.add(red, boxAt(-HX + 2, 35.8, ZTUBE - 1.8, HX - 2, 39.4, ZTUBE + 1.8));
    b.pop();
    return finishFar(b, 'centre_pompidou');
  },
};
