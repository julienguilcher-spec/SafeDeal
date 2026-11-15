/* Arc de triomphe de l'Étoile.
 * Dimensions réelles : hauteur 49,54 m, largeur 44,82 m, profondeur 22,21 m ; grande voûte 29,19 m de haut
 * sur 14,62 m de large ; petites voûtes latérales (traversantes) 18,68 m sur 8,44 m ; 30 boucliers à l'attique.
 * Repère local : grandes faces vers ±z (façade principale +z), petites faces vers ±x. */
import type { QualityLevel } from '@/core/contracts';
import type { MonumentDef } from '../types';
import {
  Builder, Geo, archBlock, archivolt, band, box, cyl, defineMaterial, entablature, farMaterial, finishFar, frustum, inscriptionTex,
  litMaterial, plinth, polygon, pose, quadFit, sculptedGroup, sweep, corniceProfile, tileOf,
} from '../kit';
import { rectRing } from '../shape2d';

export const ARC = {
  W: 44.82, D: 22.21, H: 49.54,
  /** Grande arche : largeur, hauteur sous clef. */
  bigW: 14.62, bigH: 29.19,
  /** Arches latérales. */
  smallW: 8.44, smallH: 18.68,
  /** Niveaux : naissance de la grande voûte, dessous et dessus de l'entablement, dessus de la corniche d'attique. */
  spring: 29.19 - 14.62 / 2, entabY: 31.4, entabTop: 37.5, atticTop: 46.5,
} as const;

defineMaterial('arc_inscriptions', () => litMaterial('arc_inscriptions', { color: 0xffffff, roughness: 0.9, night: 0.85 }, inscriptionTex(0xe2ca98, 0x6f5a3c, 16, 81, [6, 6], 0.55))
  ?? litMaterial('arc_inscriptions', { color: 0xe2ca98 }));

const WALL = 'pierre_doree', TRIM = 'pierre_lisse';

function build(quality: QualityLevel): Builder {
  const b = new Builder();
  const { W, D, H, bigW, bigH, smallW, smallH, spring, entabY, entabTop, atticTop } = ARC;
  const hw = W / 2, hd = D / 2, lod = quality === 'bas' ? 0 : 1;
  const pierW = (W - bigW) / 2, pierX = bigW / 2 + pierW / 2;          // 15,10 m ; axe à 14,86 m
  const seg = quality === 'bas' ? 10 : 18;

  // ── massif : deux blocs latéraux percés des petites arches (extrudés selon x), bloc haut percé de la grande arche ──
  for (const s of [-1, 1]) {
    b.with(pose(s * pierX, 0, 0, Math.PI / 2), () => archBlock(b, {
      width: D, height: spring, depth: pierW, top: false, seg,
      openings: [{ x: 0, width: smallW, height: smallH }],
      mat: WALL, matVault: 'caissons', coffers: { around: 9, across: 10 },
    }));
  }
  b.with(pose(0, spring, 0), () => archBlock(b, {
    width: W, height: entabTop - spring, depth: D, seg, top: false,
    openings: [{ x: 0, width: bigW, height: bigH - spring }],
    mat: WALL, matVault: 'caissons', coffers: { around: 15, across: 14 },
  }));

  // ── moulures ──
  const outer = rectRing(0, 0, W, D);
  for (const s of [-1, 1]) {
    const blockRing = rectRing(s * pierX, 0, pierW, D);
    // socle de chaque pile (de part et d'autre de la petite arche) et imposte à la naissance de la grande voûte
    for (const t of [-1, 1]) plinth(b, rectRing(s * pierX, t * (smallW / 2 + (D - smallW) / 4), pierW, (D - smallW) / 2), 0, 1.5, 0.4, { mat: TRIM, closed: true });
    band(b, blockRing, spring - 1.15, 1.15, 0.38, { mat: TRIM, closed: true });
    band(b, blockRing, spring - 1.6, 0.3, 0.2, { mat: TRIM, closed: true });
  }
  entablature(b, outer, entabY, entabTop - entabY, 1.55, { mat: TRIM, closed: true });

  // frise sculptée de l'entablement (départ et retour des armées)
  const [rw, rh] = tileOf('relief_pierre');
  const frieze = new Geo();
  const fy0 = entabY + (entabTop - entabY) * 0.31, fy1 = entabY + (entabTop - entabY) * 0.61, fo = 1.55 * 0.05 + 0.03;
  const fr = rectRing(0, 0, W + 2 * fo, D + 2 * fo);
  let u = 0;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4, len = Math.hypot(fr[2 * j] - fr[2 * i], fr[2 * j + 1] - fr[2 * i + 1]);
    const du = (len / (4 * (fy1 - fy0))) * rw;
    frieze.face(fr[2 * i], fy0, fr[2 * i + 1], fr[2 * j], fy0, fr[2 * j + 1], fr[2 * j], fy1, fr[2 * j + 1], fr[2 * i], fy1, fr[2 * i + 1], u, 0, { u1: u + du, v1: rh });
    u += du;
  }
  b.add('relief_pierre', frieze);

  // ── attique : mur en retrait, pilastres, 30 boucliers, corniche, couronnement à palmettes, terrasse ──
  const aIn = 0.55, aW = W - 2 * aIn, aD = D - 2 * aIn;
  const attic = rectRing(0, 0, aW, aD);
  b.add(WALL, new Geo().append(box(aW, atticTop - entabTop, aD, { top: false })).translate(0, entabTop, 0));
  band(b, attic, entabTop, 1.0, 0.28, { mat: TRIM, closed: true });
  b.add(TRIM, sweep(corniceProfile(atticTop - 1.3, 1.3, 0.95), attic, { closed: true }));
  const shields = new Geo(), pil = new Geo();
  const shieldY = entabTop + 1.0 + (atticTop - 1.3 - entabTop - 1.0) / 2;
  const addFace = (len: number, count: number, place: (t: number, g: Geo) => void): void => {
    const pitch = len / count;
    for (let i = 0; i <= count; i++) place(-len / 2 + i * pitch, box(0.7, atticTop - 1.3 - entabTop - 1.0, 0.3).translate(0, entabTop + 1.0, 0.15));
    for (let i = 0; i < count; i++) {
      const disc = cyl(1.32, 1.32, 0.24, quality === 'bas' ? 8 : 16, { bottom: false }).rotateX(Math.PI / 2);
      disc.append(cyl(1.0, 0.9, 0.12, quality === 'bas' ? 8 : 16).rotateX(Math.PI / 2).translate(0, 0, 0.22));
      disc.append(cyl(0.4, 0.26, 0.2, 8).rotateX(Math.PI / 2).translate(0, 0, 0.32));
      place(-len / 2 + (i + 0.5) * pitch, disc.translate(0, shieldY, 0));
    }
  };
  const target = (g: Geo): Geo => (g.triangleCount > 60 ? shields : pil);
  addFace(aW - 0.7, 10, (t, g) => { const k = target(g); k.append(g.clone().translate(t, 0, aD / 2)); k.append(g.clone().rotateY(Math.PI).translate(-t, 0, -aD / 2)); });
  addFace(aD - 0.7, 5, (t, g) => { const k = target(g); k.append(g.clone().rotateY(Math.PI / 2).translate(aW / 2, 0, -t)); k.append(g.clone().rotateY(-Math.PI / 2).translate(-aW / 2, 0, t)); });
  b.add(TRIM, pil);
  b.add(TRIM, shields);
  // couronnement : acrotère plein, rang de palmettes (antéfixes), terrasse
  const crown = rectRing(0, 0, aW + 0.5, aD + 0.5);
  const acroTop = atticTop + 2.0;
  b.add(TRIM, sweep([0, atticTop, 0, acroTop, -0.6, acroTop, -0.6, atticTop + 0.6], crown, { closed: true }));
  b.add(WALL, polygon(rectRing(0, 0, aW - 0.4, aD - 0.4), atticTop + 0.6));
  if (quality !== 'bas') {
    const palm = new Geo();
    const row = (len: number, n: number, place: (t: number) => void): void => { for (let i = 0; i < n; i++) place(-len / 2 + ((i + 0.5) / n) * len); };
    const tooth = (): Geo => frustum(0.5, 0.3, 0.36, 0.22, H - acroTop).translate(0, acroTop, 0);
    row(aW + 0.2, 46, (t) => { palm.append(tooth().translate(t, 0, aD / 2 + 0.1)); palm.append(tooth().translate(t, 0, -aD / 2 - 0.1)); });
    row(aD + 0.2, 23, (t) => { palm.append(tooth().rotateY(Math.PI / 2).translate(aW / 2 + 0.1, 0, t)); palm.append(tooth().rotateY(Math.PI / 2).translate(-aW / 2 - 0.1, 0, t)); });
    b.add(TRIM, palm);
  } else b.add(TRIM, sweep([0, acroTop, 0, H, -0.4, H, -0.4, acroTop], crown, { closed: true }));

  // ── archivoltes et clefs ──
  const arch = new Geo();
  const big = archivolt({ x: 0, width: bigW, height: bigH }, 1.15, 0.32, seg);
  arch.append(big.clone().translate(0, 0, hd)).append(big.clone().rotateY(Math.PI).translate(0, 0, -hd));
  arch.append(box(1.5, 2.3, 0.7).translate(0, bigH - 0.2, hd + 0.2)).append(box(1.5, 2.3, 0.7).translate(0, bigH - 0.2, -hd - 0.2));
  const small = archivolt({ x: 0, width: smallW, height: smallH }, 0.8, 0.25, seg);
  arch.append(small.clone().rotateY(Math.PI / 2).translate(hw, 0, 0)).append(small.clone().rotateY(-Math.PI / 2).translate(-hw, 0, 0));
  b.add(TRIM, arch);

  // ── Renommées des écoinçons : bas-reliefs épousant l'archivolte ──
  const spandrel = new Geo();
  {
    const rOut = bigW / 2 + 1.15 + 0.12, xMax = bigW / 2 + 2.45, top = entabY - 0.35, x0 = 1.3;
    const a0 = 0.2, a1 = Math.acos(x0 / rOut), yb = spring + rOut * Math.sin(a0), hgt = top - yb, z = hd + 0.06;
    const uv = (x: number, y: number): [number, number] => [((x - x0) / (4 * hgt)) * rw, ((y - yb) / hgt) * rh];
    const pts: [number, number][] = [[xMax, yb]];
    for (let k = 0; k <= 10; k++) { const a = a0 + ((a1 - a0) * k) / 10; pts.push([rOut * Math.cos(a), spring + rOut * Math.sin(a)]); }
    pts.push([x0, top]);
    const c = uv(xMax, top);
    for (let k = 0; k < pts.length - 1; k++) {
      const p = pts[k + 1], q = pts[k], pu = uv(p[0], p[1]), qu = uv(q[0], q[1]);
      spandrel.face3(xMax, top, z, p[0], p[1], z, q[0], q[1], z, c[0], c[1], pu[0], pu[1], qu[0], qu[1]);
    }
  }
  const spandrels = new Geo().append(spandrel).append(spandrel.clone().scale(-1, 1, 1));
  spandrels.append(spandrels.clone().rotateY(Math.PI));
  b.add('relief_pierre', spandrels);

  // ── bas-reliefs : quatre au-dessus des groupes, deux sur les petites faces ; cadres ──
  const panelW = 8.4, panelY0 = spring + 0.9, panelY1 = entabY - 1.2;
  const pu = (panelW / (4 * (panelY1 - panelY0))) * rw;
  const panels = new Geo(), frames = new Geo();
  const panel = (w: number): Geo => quadFit(-w / 2, panelY0, 0.12, w / 2, panelY0, 0.12, w / 2, panelY1, 0.12, -w / 2, panelY1, 0.12, 0, 0, pu * (w / panelW), rh);
  for (const s of [-1, 1]) for (const t of [-1, 1]) {
    panels.append(panel(panelW).rotateY(t > 0 ? 0 : Math.PI).translate(s * pierX, 0, t * hd));
  }
  for (const s of [-1, 1]) panels.append(panel(13).rotateY(s * Math.PI / 2).translate(s * hw, 0, 0));
  b.add('relief_pierre', panels);
  // cadres : quatre baguettes par panneau
  const rod = (w: number): Geo => {
    const g = new Geo(), t = 0.3, d = 0.26, h = panelY1 - panelY0;
    g.append(box(w + 2 * t, t, d).translate(0, panelY0 - t, d / 2)).append(box(w + 2 * t, t, d).translate(0, panelY1, d / 2));
    g.append(box(t, h, d).translate(-w / 2 - t / 2, panelY0, d / 2)).append(box(t, h, d).translate(w / 2 + t / 2, panelY0, d / 2));
    return g;
  };
  for (const s of [-1, 1]) for (const t of [-1, 1]) frames.append(rod(panelW).rotateY(t > 0 ? 0 : Math.PI).translate(s * pierX, 0, t * hd));
  for (const s of [-1, 1]) frames.append(rod(13).rotateY(s * Math.PI / 2).translate(s * hw, 0, 0));
  b.add(TRIM, frames);

  // ── groupes sculptés des piédroits, sur leurs piédestaux (Départ, Triomphe, Résistance, Paix) ──
  const pedW = 8.6, pedH = 5.7, pedD = 2.3, groupH = 12.8;
  let seed = 7;
  for (const s of [-1, 1]) for (const t of [-1, 1]) {
    b.with(pose(s * pierX, 0, t * hd, t > 0 ? 0 : Math.PI), () => {
      const ped = new Geo();
      ped.append(box(pedW, pedH, pedD).translate(0, 0, pedD / 2));
      b.add(WALL, ped);
      b.add(TRIM, sweep(corniceProfile(pedH - 0.75, 0.75, 0.42), [-pedW / 2, 0, -pedW / 2, pedD, pedW / 2, pedD, pedW / 2, 0]));
      b.add(TRIM, sweep([0.35, 0, 0.35, 1.1, 0, 1.5], [-pedW / 2, 0, -pedW / 2, pedD, pedW / 2, pedD, pedW / 2, 0]));
      b.with(pose(0, pedH, 0.1), () => sculptedGroup(b, TRIM, { width: 7.4, height: groupH, depth: 2.1, seed: seed++, count: lod === 0 ? 3 : 5 }));
    });
  }

  // ── inscriptions des parois intérieures (noms de batailles et de généraux) ──
  const ins = new Geo();
  const pd = (D - smallW) / 2;
  for (const s of [-1, 1]) for (const t of [-1, 1]) {
    const x = s * (bigW / 2 - 0.04), z0 = t * (smallW / 2 + 0.8), z1 = t * (hd - 0.8);
    const g = s * t > 0 ? quadFit(x, 5, z1, x, 5, z0, x, spring - 2.2, z0, x, spring - 2.2, z1, 0, 0, pd - 1.6, spring - 7.2)
      : quadFit(x, 5, z0, x, 5, z1, x, spring - 2.2, z1, x, spring - 2.2, z0, 0, 0, pd - 1.6, spring - 7.2);
    ins.append(g);
  }
  b.add('arc_inscriptions', ins);

  // ── tombe du Soldat inconnu : dalle de granit, bouclier de bronze et flamme du souvenir ──
  b.add('granit_gris', box(2.2, 0.14, 4.4).translate(0, 0, 1.6));
  b.add('bronze', cyl(0.75, 0.85, 0.16, 14).translate(0, 0.02, 4.9));
  b.add('flamme', cyl(0.16, 0.0, 0.5, 6).translate(0, 0.18, 4.9));
  return b;
}

export const def: MonumentDef = {
  key: 'arc_triomphe',
  name: 'Arc de triomphe de l\'Étoile',
  radius: 27,
  height: ARC.H,
  build(_site, quality) {
    return build(quality).build('arc_triomphe');
  },
  buildFar() {
    const b = new Builder();
    const { W, D, H, bigW, bigH, smallW, smallH, spring, entabY, entabTop, atticTop } = ARC;
    const stone = farMaterial(0xdcc698), dark = farMaterial(0xc9b182);
    const pierW = (W - bigW) / 2, pierX = bigW / 2 + pierW / 2;
    for (const s of [-1, 1]) {
      b.with(pose(s * pierX, 0, 0, Math.PI / 2), () => archBlock(b, { width: D, height: spring, depth: pierW, top: false, seg: 4, openings: [{ x: 0, width: smallW, height: smallH }], mat: stone, matVault: dark }));
    }
    b.with(pose(0, spring, 0), () => archBlock(b, { width: W, height: entabY - spring, depth: D, top: false, seg: 6, openings: [{ x: 0, width: bigW, height: bigH - spring }], mat: stone, matVault: dark }));
    b.add(stone, box(W + 3, entabTop - entabY, D + 3, { bottom: true }).translate(0, entabY, 0));
    b.add(stone, box(W - 1.1, atticTop - entabTop, D - 1.1, { top: false }).translate(0, entabTop, 0));
    b.add(stone, box(W + 0.6, H - atticTop, D + 0.6, { bottom: true }).translate(0, atticTop, 0));
    return finishFar(b, 'arc_triomphe');
  },
};
