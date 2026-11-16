// Lot « palais » : chaque définition se construit sur son emprise RÉELLE (public/data/paris/landmarks.json) dans le
// budget, tient sur cette emprise et à la bonne hauteur ; obstacles valides et antihoraires ; guichets, porches et
// cours praticables là où ils doivent l'être, sites sensibles clos ; indépendance vis-à-vis de l'ancrage et du cap.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { decodeLandmarks, type Landmark, type RawLandmarks } from '@/world/mapdata';
import { getMonument } from '@/world/monuments/registry';
import { getColliders, getWorldColliders, listColliderKeys, siteOfLandmark } from '@/world/monuments/colliders';
import { statsOf } from '@/world/monuments/kit';
import { isSimpleRing, pointInRing, ringBounds, signedArea, transformRing, worldRingToLocal } from '@/world/monuments/shape2d';
import { PASS_UNDER_Y, type MonumentCollider, type MonumentSite } from '@/world/monuments/types';
import { passageArches, planOf, planToLocal, type Passage, type Plan } from '@/world/monuments/x-palais-plan';
import type { QualityLevel } from '@/core/contracts';
import * as louvre from '@/world/monuments/collide/louvre';
import * as invalides from '@/world/monuments/collide/invalides';
import * as prefecture from '@/world/monuments/collide/prefecture_police';
import * as palaisRoyal from '@/world/monuments/collide/palais_royal';
import * as arc from '@/world/monuments/collide/arc_carrousel';
import * as marine from '@/world/monuments/collide/hotel_marine';
import * as elysee from '@/world/monuments/collide/palais_elysee';
import * as matignon from '@/world/monuments/collide/hotel_matignon';
import * as bourbon from '@/world/monuments/collide/palais_bourbon';
import * as justice from '@/world/monuments/collide/palais_justice';
import * as pyramide from '@/world/monuments/collide/pyramide_louvre';
import * as conciergerie from '@/world/monuments/collide/conciergerie';

const KEYS = [
  'louvre', 'pyramide_louvre', 'arc_carrousel', 'invalides', 'hotel_de_ville', 'palais_bourbon', 'palais_elysee', 'hotel_marine', 'hotel_crillon',
  'palais_royal', 'ecole_militaire', 'institut_de_france', 'palais_justice', 'conciergerie', 'prefecture_police', 'hotel_matignon', 'musee_orsay',
  'gare_saint_lazare',
];
/** Hauteur réelle attendue (m) et tolérance relative ; débord toléré du modèle hors du rectangle de l'emprise (m). */
const REAL: Record<string, { h: number; tol?: number; over?: number; under?: number }> = {
  louvre: { h: 44, tol: 0.2 },                         // pavillons 38 à 44 m, drapeau compris
  pyramide_louvre: { h: 21.64, tol: 0.02, over: 34 },  // pyramidions et bassins autour du carré de l'emprise
  arc_carrousel: { h: 19, tol: 0.08 },
  invalides: { h: 107, tol: 0.02, over: 12 },          // l'église du Dôme dépasse au sud
  hotel_de_ville: { h: 50, tol: 0.1, over: 12 },       // statues du parvis
  palais_bourbon: { h: 30, tol: 0.2, over: 14 },       // statues assises du parvis, drapeau
  palais_elysee: { h: 16, tol: 0.45, over: 170 },      // jardin clos jusqu'à la grille du Coq ; drapeau à 23 m
  hotel_marine: { h: 22.8, tol: 0.25 },                // drapeau compris
  hotel_crillon: { h: 22.8, tol: 0.25, over: 64 },     // façade de Gabriel prolongée jusqu'à la rue Royale
  palais_royal: { h: 22, tol: 0.3 },
  ecole_militaire: { h: 45, tol: 0.15, over: 8 },
  institut_de_france: { h: 46, tol: 0.1 },
  palais_justice: { h: 33, tol: 0.2, over: 6, under: 66 },   // la Conciergerie (repère distinct) occupe le nord de l'emprise
  conciergerie: { h: 47, tol: 0.06 },
  prefecture_police: { h: 30, tol: 0.25 },
  hotel_matignon: { h: 15, tol: 0.45 },                // drapeau à 21 m
  musee_orsay: { h: 34, tol: 0.15 },
  gare_saint_lazare: { h: 35.4, tol: 0.15 },
};

const raw = Object.values(import.meta.glob('../../public/data/paris/landmarks.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[0];
const landmarks: Landmark[] = raw ? decodeLandmarks(JSON.parse(raw) as RawLandmarks) : [];
const landmarkOf = (key: string): Landmark | undefined => landmarks.find((l) => l.key === key);
const EMPTY: MonumentSite = { footprint: [], height: 0 };

function freeAtGround(cols: MonumentCollider[], x: number, z: number, r = 0.35): boolean {
  for (const c of cols) {
    if (c.baseY > PASS_UNDER_Y) continue;
    if (pointInRing(x, z, c.ring)) return false;
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; if (pointInRing(x + Math.cos(a) * r, z + Math.sin(a) * r, c.ring)) return false; }
  }
  return true;
}
const overhead = (cols: MonumentCollider[], x: number, z: number): boolean => cols.some((c) => c.baseY > PASS_UNDER_Y && pointInRing(x, z, c.ring));

/** Contexte d'essai d'un monument : obstacles sur l'emprise réelle, et passage du repère du monument au repère local. */
function setup(key: string, emprise: readonly number[]): { cols: MonumentCollider[]; at: (x: number, z: number) => [number, number]; plan: Plan } {
  const lm = landmarkOf(key);
  const site = lm ? siteOfLandmark(lm) : EMPTY;
  const plan = planOf(site, emprise);
  const at = (x: number, z: number): [number, number] => { const q = planToLocal(plan, [x, z]); return [q[0], q[1]]; };
  return { cols: getColliders(key, site), at, plan };
}

/** Vérifie qu'on traverse un passage par chacune de ses arches, sous une voûte, et que ses piles sont pleines. */
function expectPassable(cols: MonumentCollider[], at: (x: number, z: number) => [number, number], g: Passage): void {
  const arches = passageArches(g), rot = g.rot ?? 0;
  for (const a of arches) {
    for (const t of [-g.length / 2 - 1.6, -g.length / 4, 0, g.length / 4, g.length / 2 + 1.6]) {
      const c = transformRing([a.x, t], g.x, g.z, rot);
      const q = at(c[0], c[1]);
      expect(freeAtGround(cols, q[0], q[1]), `passage (${g.x}, ${g.z}), arche x=${a.x}, t=${t}`).toBe(true);
    }
    const c = transformRing([a.x, 0], g.x, g.z, rot), q = at(c[0], c[1]);
    expect(overhead(cols, q[0], q[1])).toBe(true);
    // la pile voisine est pleine
    const s = transformRing([a.x + a.width / 2 + 0.5, 0], g.x, g.z, rot), sq = at(s[0], s[1]);
    expect(freeAtGround(cols, sq[0], sq[1]), `pile du passage (${g.x}, ${g.z})`).toBe(false);
  }
}

describe('lot palais : registre et carte', () => {
  it('les dix-huit monuments sont enregistrés, avec leur fichier collide/', () => {
    const cols = listColliderKeys();
    for (const k of KEYS) {
      expect(getMonument(k)?.key, k).toBe(k);
      expect(cols, k).toContain(k);
    }
  });

  it('landmarks.json est lisible ; chaque monument du lot y figure (sinon l\'emprise de référence sert)', () => {
    expect(landmarks.length).toBeGreaterThan(10);
    const missing = KEYS.filter((k) => !landmarkOf(k));
    expect(missing, `absents de landmarks.json : ${missing.join(', ')}`).toEqual([]);
  });
});

describe.each(KEYS)('palais %s', (key) => {
  const def = getMonument(key)!;
  const lm = landmarkOf(key);
  const site: MonumentSite = lm ? siteOfLandmark(lm) : EMPTY;
  const budget = key === 'louvre' ? 120000 : 60000;

  it.each(['bas', 'haut'] as QualityLevel[])('se construit sur son emprise réelle (%s), dans le budget', (quality) => {
    const obj = def.build(site, quality);
    const st = statsOf(obj);
    expect(st.triangles).toBeGreaterThan(100);
    expect(st.triangles).toBeLessThanOrEqual(budget);
    expect(st.drawCalls).toBeLessThanOrEqual(12);
    obj.traverse((c) => {
      const m = c as THREE.Mesh;
      if (!m.geometry) return;
      const pos = m.geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i++) if (!Number.isFinite(pos.getX(i)) || !Number.isFinite(pos.getY(i)) || !Number.isFinite(pos.getZ(i))) throw new Error(`sommet invalide dans ${c.name}`);
    });
  });

  it('tient sur son emprise réelle, à la bonne hauteur, dans son rayon englobant', () => {
    const obj = def.build(site, 'haut');
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    const real = REAL[key];
    expect(box.min.y).toBeGreaterThan(-0.6);
    expect(Math.abs(box.max.y - real.h) / real.h, `hauteur ${box.max.y.toFixed(1)} m pour ${real.h} m`).toBeLessThan(real.tol ?? 0.1);
    expect(def.height).toBeGreaterThan(real.h * 0.6);
    const fp = ringBounds(site.footprint.length >= 6 ? site.footprint : planOf(EMPTY, getReference(key)).ring);
    const over = real.over ?? 3.5;
    // le modèle couvre l'emprise…
    const under = real.under ?? 2.5;
    expect(box.min.x).toBeLessThan(fp.minX + under); expect(box.max.x).toBeGreaterThan(fp.maxX - under);
    expect(box.min.z).toBeLessThan(fp.minZ + under); expect(box.max.z).toBeGreaterThan(fp.maxZ - under);
    // … et n'en déborde pas au-delà de ce qui est annoncé
    expect(box.min.x).toBeGreaterThan(fp.minX - over); expect(box.max.x).toBeLessThan(fp.maxX + over);
    expect(box.min.z).toBeGreaterThan(fp.minZ - over); expect(box.max.z).toBeLessThan(fp.maxZ + over);
    const reach = Math.max(Math.hypot(box.min.x, box.min.z), Math.hypot(box.max.x, box.max.z), Math.hypot(box.min.x, box.max.z), Math.hypot(box.max.x, box.min.z));
    expect(def.radius, `rayon ${def.radius} m pour une étendue de ${reach.toFixed(0)} m`).toBeGreaterThan(reach * 0.97);
  });

  it('se construit aussi sans emprise (emprise de référence) ; silhouette ≤ 400 triangles', () => {
    const st = statsOf(def.build(EMPTY, 'moyen'));
    expect(st.triangles).toBeGreaterThan(100);
    expect(st.triangles).toBeLessThanOrEqual(budget);
    for (const s of [EMPTY, site]) {
      const far = statsOf(def.buildFar(s));
      expect(far.triangles).toBeGreaterThan(4);
      expect(far.triangles).toBeLessThanOrEqual(400);
      expect(far.drawCalls).toBeLessThanOrEqual(4);
    }
  });

  it('obstacles valides, antihoraires, au moins un plein au sol', () => {
    for (const s of [EMPTY, site]) {
      const cols = getColliders(key, s);
      expect(cols.length).toBeGreaterThan(0);
      for (const c of cols) {
        expect(c.ring.length % 2).toBe(0);
        expect(c.ring.length).toBeGreaterThanOrEqual(6);
        expect(isSimpleRing(c.ring), `${key} : anneau non simple (${c.ring.length / 2} sommets)`).toBe(true);
        expect(signedArea(c.ring)).toBeGreaterThan(0.2);
        expect(c.height).toBeGreaterThan(0);
        expect(c.baseY).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(c.height) && Number.isFinite(c.baseY)).toBe(true);
        for (const v of c.ring) expect(Number.isFinite(v)).toBe(true);
      }
      expect(cols.some((c) => c.baseY <= PASS_UNDER_Y)).toBe(true);
    }
  });

  it('les obstacles ne dépendent ni de l\'ancrage ni du cap annoncés par la carte', () => {
    if (!lm) return;
    const a = getWorldColliders(lm);
    // même emprise monde, autre point d'ancrage et autre cap (décalé de 7°)
    const b = getWorldColliders({ key, x: lm.x + 13, z: lm.z - 8, heading: lm.heading + 0.122, height: lm.height, footprint: lm.footprint });
    expect(b.length).toBe(a.length);
    const total = (cs: MonumentCollider[]): number => cs.reduce((s, c) => s + signedArea(c.ring), 0);
    expect(Math.abs(total(a) - total(b)) / total(a)).toBeLessThan(1e-3);
    const ca = a.map((c) => ringBounds(c.ring)), cb = b.map((c) => ringBounds(c.ring));
    let worst = 0;
    for (const p of ca) { let best = Infinity; for (const q of cb) best = Math.min(best, Math.hypot(p.cx - q.cx, p.cz - q.cz) + Math.abs(p.w - q.w) + Math.abs(p.d - q.d)); worst = Math.max(worst, best); }
    expect(worst, 'écart entre obstacles homologues (m)').toBeLessThan(0.3);
    // les obstacles restent sur l'emprise monde
    const fp = ringBounds(lm.footprint), over = (REAL[key].over ?? 3.5) + 2;
    for (const c of a) { const q = ringBounds(c.ring); expect(q.minX).toBeGreaterThan(fp.minX - over); expect(q.maxX).toBeLessThan(fp.maxX + over); expect(q.minZ).toBeGreaterThan(fp.minZ - over); expect(q.maxZ).toBeLessThan(fp.maxZ + over); }
    expect(worldRingToLocal(lm.footprint, lm.x, lm.z, lm.heading).length).toBe(lm.footprint.length);
  });
});

/** Emprise de référence d'un monument : celle que rend planOf sans site, lue à travers ses obstacles de repli. */
function getReference(key: string): number[] {
  const refs: Record<string, readonly number[]> = {
    louvre: louvre.EMPRISE, invalides: invalides.EMPRISE, prefecture_police: prefecture.EMPRISE, palais_royal: palaisRoyal.EMPRISE, arc_carrousel: arc.EMPRISE,
    hotel_marine: marine.EMPRISE, palais_elysee: elysee.EMPRISE, hotel_matignon: matignon.EMPRISE, palais_bourbon: bourbon.EMPRISE, palais_justice: justice.EMPRISE,
    pyramide_louvre: pyramide.EMPRISE, conciergerie: conciergerie.EMPRISE,
  };
  return Array.from(refs[key] ?? [-10, -10, -10, 10, 10, 10, 10, -10]);
}

describe('passages praticables', () => {
  it('Louvre : on traverse chaque guichet sous sa voûte ; la cour Carrée est ouverte, ses ailes sont pleines', () => {
    const { cols, at } = setup('louvre', louvre.EMPRISE);
    for (const g of louvre.PASSAGES) expectPassable(cols, at, g);
    expect(louvre.PASSAGES.filter((g) => (g.arches ?? 1) === 3).length).toBe(2);     // grands guichets du Carrousel, guichets de Rohan
    for (const [x, z] of [[0.5, -249], [-40, -290], [45, -200], [0, -190]]) { const q = at(x, z); expect(freeAtGround(cols, q[0], q[1]), `cour Carrée (${x}, ${z})`).toBe(true); }
    for (const [x, z] of [[-72, -280], [78, -210], [40, -324], [-40, -174], [-100, 0], [100, 0], [-140, 250], [140, 250], [147, 322]]) { const q = at(x, z); expect(freeAtGround(cols, q[0], q[1]), `mur (${x}, ${z})`).toBe(false); }
    // cour Napoléon et Carrousel : dehors
    for (const [x, z] of [[5, -40], [0, 100], [10, 191]]) { const q = at(x, z); expect(freeAtGround(cols, q[0], q[1])).toBe(true); expect(overhead(cols, q[0], q[1])).toBe(false); }
    // les voûtes commencent au-dessus des têtes et des fourgons
    for (const c of cols) if (c.baseY > 0) expect(c.baseY).toBeGreaterThan(2.6);
  });

  it('Invalides : portail nord, cour d\'honneur ; l\'église du Dôme est pleine', () => {
    const { cols, at } = setup('invalides', invalides.EMPRISE);
    expectPassable(cols, at, invalides.PORTAIL);
    const C = invalides.COUR_HONNEUR;
    for (const [x, z] of [[(C.x0 + C.x1) / 2, (C.z0 + C.z1) / 2], [C.x0 + 3, C.z0 + 3], [C.x1 - 3, C.z1 - 3]]) { const q = at(x, z); expect(freeAtGround(cols, q[0], q[1])).toBe(true); }
    for (const [x, z] of [[invalides.DOME.x, invalides.DOME.z], [-2, -40], [-80, 120], [60, 30]]) { const q = at(x, z); expect(freeAtGround(cols, q[0], q[1])).toBe(false); }
  });

  it('Arc du Carrousel : on passe sous les trois baies, entre quatre piles', () => {
    const { cols, at } = setup('arc_carrousel', arc.EMPRISE);
    const A = arc.ARC;
    for (const x of [0, -A.smallX, A.smallX]) for (const z of [-6, -2, 0, 2, 6]) { const q = at(x, z); expect(freeAtGround(cols, q[0], q[1], 0.3), `baie x=${x}, z=${z}`).toBe(true); }
    for (const x of [0, -A.smallX, A.smallX]) { const q = at(x, 0); expect(overhead(cols, q[0], q[1])).toBe(true); }
    for (const x of [3.2, -3.2, 8, -8]) { const q = at(x, 0); expect(freeAtGround(cols, q[0], q[1])).toBe(false); }
  });

  it('Hôtel de la Marine : la galerie à arcades est praticable sous la loggia', () => {
    const { cols, at } = setup('hotel_marine', marine.EMPRISE);
    const F = marine.FACADE, xa = F.x0 + F.pavW, pitch = (F.x1 - F.pavW - xa) / 11;
    for (let i = 0; i < 11; i++) {
      const x = xa + (i + 0.5) * pitch;
      for (const z of [F.z + 1.5, F.z - 0.45, F.z - 2]) { const q = at(x, z); expect(freeAtGround(cols, q[0], q[1], 0.3), `arcade ${i}, z=${z}`).toBe(true); }
      const q = at(x, F.z - 2);
      expect(overhead(cols, q[0], q[1])).toBe(true);
    }
    for (let i = 1; i < 11; i++) { const q = at(xa + i * pitch, F.z - 0.45); expect(freeAtGround(cols, q[0], q[1])).toBe(false); }
    const q = at(0, F.z - F.loggia - 3);
    expect(freeAtGround(cols, q[0], q[1])).toBe(false);
  });

  it('Préfecture de police : le porche mène à la cour', () => {
    const { cols, at } = setup('prefecture_police', prefecture.EMPRISE);
    expectPassable(cols, at, prefecture.PORCHE);
    const q = at(0, 0);
    expect(freeAtGround(cols, q[0], q[1])).toBe(true);
    for (const [x, z] of [[0, 52], [38, 0], [0, -50]]) { const s = at(x, z); expect(freeAtGround(cols, s[0], s[1])).toBe(false); }
  });

  it('Palais-Royal : passages des ailes, colonnades ouvertes sur le jardin, colonnes rayées', () => {
    const { cols, at } = setup('palais_royal', palaisRoyal.EMPRISE);
    for (const g of palaisRoyal.PASSAGES) expectPassable(cols, at, g);
    const K = palaisRoyal.COLONNES, C = palaisRoyal.COURS_OUVERTES, L = palaisRoyal.COLONNADES;
    // entre quatre colonnes de la cour d'honneur
    for (const [i, j] of [[0, 0], [7, 5], [18, 11]]) { const q = at(K.x0 + (i + 0.5) * K.pitch, K.z0 + (j + 0.5) * K.pitch); expect(freeAtGround(cols, q[0], q[1], 0.3)).toBe(true); }
    let tall = 0;
    for (let i = 0; i < K.nx; i++) for (let j = 0; j < K.nz; j++) if (palaisRoyal.hauteurColonne(i, j) >= 0.9) { const q = at(K.x0 + i * K.pitch, K.z0 + j * K.pitch); expect(freeAtGround(cols, q[0], q[1], 0.1)).toBe(false); tall++; }
    expect(tall).toBeGreaterThan(60);
    // du jardin à la cour d'honneur, en passant entre les colonnes des deux colonnades
    const x = C.x0 + 1.2 + L.pitch * 6.5;
    for (const z of [-70, L.z[1], -47, L.z[0], -20]) { const q = at(x, z); expect(freeAtGround(cols, q[0], q[1], 0.3), `axe du jardin, z=${z}`).toBe(true); }
    for (const [px, pz] of [[-50, 20], [60, -40], [-30, -30], [30, 28]]) { const q = at(px, pz); expect(freeAtGround(cols, q[0], q[1])).toBe(false); }
  });
});

describe('sites sensibles clos', () => {
  it('Élysée : portail fermé, hôtel plein, jardin ceint de murs jusqu\'à la grille du Coq', () => {
    const { cols, at } = setup('palais_elysee', elysee.EMPRISE);
    const g = elysee.PORTAIL;
    for (const t of [-2, 0, 2]) { const c = transformRing([0, t], g.x, g.z, g.rot ?? 0), q = at(c[0], c[1]); expect(freeAtGround(cols, q[0], q[1])).toBe(false); }
    const wall = (path: readonly number[]): void => {
      for (let i = 0; i + 3 < path.length; i += 2) for (const t of [0.15, 0.5, 0.85]) {
        const q = at(path[i] + (path[i + 2] - path[i]) * t, path[i + 1] + (path[i + 3] - path[i + 1]) * t);
        expect(freeAtGround(cols, q[0], q[1], 0.2)).toBe(false);
      }
    };
    wall(elysee.CLOTURE_OUEST); wall(elysee.CLOTURE_EST);
    const coq = at(elysee.GRILLE_COQ.x, elysee.GRILLE_COQ.z);
    expect(freeAtGround(cols, coq[0], coq[1])).toBe(false);
    // la cour d'honneur n'est pas accessible : l'emprise entière fait obstacle
    const q = at(2, 20);
    expect(freeAtGround(cols, q[0], q[1])).toBe(false);
  });

  it('Matignon et palais Bourbon : portail et emmarchement font obstacle', () => {
    const m = setup('hotel_matignon', matignon.EMPRISE);
    let q = m.at(matignon.PORTAIL.x, matignon.PORTAIL.z);
    expect(freeAtGround(m.cols, q[0], q[1])).toBe(false);
    q = m.at(-10, 5);
    expect(freeAtGround(m.cols, q[0], q[1])).toBe(false);
    const b = setup('palais_bourbon', bourbon.EMPRISE);
    for (const z of [-2, -6, -12]) { const c = bourbon.fromPortico(0, z); q = b.at(c[0], c[1]); expect(freeAtGround(b.cols, q[0], q[1])).toBe(false); }
    const out = bourbon.fromPortico(0, 6);
    q = b.at(out[0], out[1]);
    expect(freeAtGround(b.cols, q[0], q[1])).toBe(true);
  });

  it('Palais de Justice : la Conciergerie et la cour de la Sainte-Chapelle sont laissées à leurs monuments', () => {
    const { cols, at } = setup('palais_justice', justice.EMPRISE);
    const C = justice.COUR_SAINTE_CHAPELLE;
    let q = at((C.x0 + C.x1) / 2, (C.z0 + C.z1) / 2);
    expect(freeAtGround(cols, q[0], q[1])).toBe(true);
    q = at(85, 40);                                      // dans l'emprise de la Conciergerie
    expect(freeAtGround(cols, q[0], q[1])).toBe(true);
    q = at(0, 0);
    expect(freeAtGround(cols, q[0], q[1])).toBe(false);
    // grille de la cour du Mai : fermée
    q = at((justice.COUR_MAI.x0 + justice.COUR_MAI.x1) / 2, justice.COUR_MAI.grille);
    expect(freeAtGround(cols, q[0], q[1])).toBe(false);
  });
});
