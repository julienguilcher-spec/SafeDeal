// Rendu des commissariats — budget et logique d'affichage (Node : géométries réelles, sans carte graphique).
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createTestContext } from '@/core/testing';
import type { QualityLevel } from '@/core/contracts';
import { COMMISSARIATS } from '@/world/commissariats';
import { createSystems, CommissariatsRenderer, COMMISSARIATS_RENDER_KEY, farRadius, nearRadius } from '@/render/commissariats';
import type { CommissariatsRenderApi, RenderHost, ViewLike } from '@/render/commissariats';
import { ATLAS_H, ATLAS_W, PLATE_CAPACITY, REGIONS, createCommissariatAtlas, plateRegion, uvOf } from '@/render/commissariats/atlas';
import type { AtlasRegion } from '@/render/commissariats/atlas';
import { BAY_LIFT, NIGHT_EMISSION, buildFar, buildSite } from '@/render/commissariats/build';

const flat = (): number => 0;

function tris(g: THREE.BufferGeometry | null): number {
  if (!g) return 0;
  return g.index ? g.index.count / 3 : g.getAttribute('position').count / 3;
}

/** Vue factice : la caméra se déplace à la main. */
class FakeView implements ViewLike {
  readonly world = new THREE.Group();
  camX = 0;
  camZ = 0;
  drawDistance = 1200;
  constructor(public quality: QualityLevel = 'haut') {}
}

function host(over: Partial<RenderHost> = {}): RenderHost & { on: boolean; n: number } {
  const h = {
    on: true,
    n: 0,
    groundAt: flat as RenderHost['groundAt'],
    night(): number { return h.n; },
    active(): boolean { return h.on; },
    ...over,
  };
  return h;
}

const site = (id: string) => COMMISSARIATS.find((c) => c.id === id)!;

describe('rendu des commissariats : budget par site', () => {
  for (const def of COMMISSARIATS) {
    it(`${def.id} : au plus 2 maillages et 1 800 triangles, tout près de la porte ou des places`, () => {
      const geo = buildSite(def, flat, true);
      const meshes = [geo.facade, geo.ground].filter((g) => g !== null);
      expect(meshes.length).toBeLessThanOrEqual(2);
      expect(geo.facade).not.toBeNull();
      expect(geo.ground).not.toBeNull();
      expect(tris(geo.facade) + tris(geo.ground)).toBeLessThanOrEqual(1800);

      // façade : chaque sommet à moins de 30 m de la porte (et entre 0,5 m sous le sol et 6 m au-dessus)
      const fp = geo.facade!.getAttribute('position');
      for (let i = 0; i < fp.count; i++) {
        expect(Math.hypot(fp.getX(i) - def.door.x, fp.getZ(i) - def.door.z)).toBeLessThan(30);
        expect(fp.getY(i)).toBeGreaterThan(-0.5);
        expect(fp.getY(i)).toBeLessThan(6);
      }

      // places : un quadrilatère par place, chacun sur sa place, posé au-dessus du sol
      const gp = geo.ground!.getAttribute('position');
      expect(gp.count).toBe(def.slots.length * 4);
      expect(tris(geo.ground)).toBe(def.slots.length * 2);
      def.slots.forEach((s, k) => {
        const reach = Math.hypot(s.len + 0.3, s.width + 0.35) / 2 + 0.01;
        for (let v = k * 4; v < k * 4 + 4; v++) {
          expect(Math.hypot(gp.getX(v) - s.x, gp.getZ(v) - s.z)).toBeLessThanOrEqual(reach);
          expect(gp.getY(v)).toBeCloseTo(BAY_LIFT, 5);
        }
      });
      // les places regardent vers le ciel
      const gn = geo.ground!.getAttribute('normal');
      for (let i = 0; i < gn.count; i++) expect(gn.getY(i)).toBeCloseTo(1, 5);
    });
  }

  it('enseigne, lanterne et vitrage prennent leur région de l\'atlas ; la préfecture n\'a ni enseigne ni porte', () => {
    const inRegion = (g: THREE.BufferGeometry, r: AtlasRegion): number => {
      const uv = g.getAttribute('uv');
      const q = uvOf(r);
      let n = 0;
      for (let i = 0; i < uv.count; i++) {
        if (uv.getX(i) >= q.u0 - 1e-6 && uv.getX(i) <= q.u1 + 1e-6 && uv.getY(i) >= q.v0 - 1e-6 && uv.getY(i) <= q.v1 + 1e-6) n++;
      }
      return n;
    };
    for (const def of COMMISSARIATS) {
      const g = buildSite(def, flat, true).facade!;
      const plate = plateRegion(def.id);
      const lantern = def.sign === 'gendarmerie' ? REGIONS.lanterne_gendarmerie : REGIONS.lanterne_police;
      expect(inRegion(g, lantern), def.id).toBe(16); // quatre faces vitrées
      if (def.sign === 'none') {
        expect(plate).toBeNull();
        expect(buildSite(def, flat, true).anchors.sign).toBeNull();
        expect(inRegion(g, REGIONS.vitre_police)).toBe(0);
      } else {
        expect(plate, def.id).not.toBeNull();
        expect(inRegion(g, plate!), def.id).toBe(4);
        expect(inRegion(g, def.sign === 'gendarmerie' ? REGIONS.vitre_gendarmerie : REGIONS.vitre_police), def.id).toBe(4);
        expect(inRegion(g, REGIONS.plaque_rf), def.id).toBe(4);
      }
    }
  });

  it('la lanterne est devant la façade, côté rue, à hauteur d\'étage', () => {
    for (const def of COMMISSARIATS) {
      const a = buildSite(def, flat, true).anchors;
      const nx = Math.sin(def.facade.heading), nz = Math.cos(def.facade.heading);
      const ahead = (a.lantern[0] - def.facade.x) * nx + (a.lantern[2] - def.facade.z) * nz;
      expect(ahead, def.id).toBeGreaterThan(0.5);
      expect(ahead, def.id).toBeLessThan(1.2);
      expect(a.lantern[1], def.id).toBeGreaterThan(2.5);
      expect(a.lantern[1], def.id).toBeLessThan(3.6);
    }
  });

  it('sans atlas, les faces texturées gardent leur couleur ; avec, elles sont blanches (la texture porte la couleur)', () => {
    const def = site('9e');
    const plain = buildSite(def, flat, false).ground!.getAttribute('color');
    const tex = buildSite(def, flat, true).ground!.getAttribute('color');
    expect(plain.getX(0)).toBeGreaterThan(0.8);
    expect(plain.getZ(0)).toBeLessThan(0.1); // jaune
    expect(tex.getX(0)).toBeCloseTo(1, 5);
    expect(tex.getZ(0)).toBeCloseTo(1, 5);
  });

  it('le maillage lointain : une géométrie, moins de 150 triangles, moins de 20 par site', () => {
    const far = buildFar(COMMISSARIATS, flat);
    expect(tris(far.geometry)).toBeLessThan(150);
    expect(far.ranges).toHaveLength(COMMISSARIATS.length);
    let next = 0;
    for (const r of far.ranges) {
      expect(r.start).toBe(next);
      expect(r.count / 2).toBeLessThan(20); // quatre sommets et deux triangles par quadrilatère
      next = r.start + r.count;
    }
    expect(next).toBe(far.geometry.getAttribute('position').count);
    expect(far.geometry.getAttribute('aShow').count).toBe(next);
  });
});

describe('rendu des commissariats : atlas', () => {
  it('régions dans la texture et sans recouvrement ; une enseigne par site qui en porte une', () => {
    const regions: [string, AtlasRegion][] = Object.entries(REGIONS);
    for (const def of COMMISSARIATS) {
      const r = plateRegion(def.id);
      if (r) regions.push([`enseigne ${def.id}`, r]);
    }
    expect(COMMISSARIATS.filter((c) => c.sign !== 'none').length).toBeLessThanOrEqual(PLATE_CAPACITY);
    for (const [name, r] of regions) {
      expect(r.x, name).toBeGreaterThanOrEqual(0);
      expect(r.y, name).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w, name).toBeLessThanOrEqual(ATLAS_W);
      expect(r.y + r.h, name).toBeLessThanOrEqual(ATLAS_H);
    }
    for (let i = 0; i < regions.length; i++) {
      for (let j = i + 1; j < regions.length; j++) {
        const [na, a] = regions[i]!, [nb, b] = regions[j]!;
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap, `${na} / ${nb}`).toBe(false);
      }
    }
  });

  it('sous Node, pas de canevas : pas d\'atlas (couleurs par sommet)', () => {
    expect(createCommissariatAtlas()).toBeNull();
  });
});

describe('rendu des commissariats : affichage selon la distance', () => {
  it('deux matériaux partagés par tous les sites proches, un troisième pour le lointain', () => {
    const view = new FakeView();
    const r = new CommissariatsRenderer(view, host(), null);
    const used = new Set<THREE.Material>();
    // la caméra visite chaque site : tous construits
    for (const def of COMMISSARIATS) {
      view.camX = def.door.x; view.camZ = def.door.z;
      r.frame(0.016);
    }
    expect(r.stats.built).toBe(COMMISSARIATS.length);
    let meshes = 0;
    r.root.traverse((o) => {
      if (o instanceof THREE.Mesh && o !== r.farMesh) { used.add(o.material as THREE.Material); meshes++; }
    });
    expect(meshes).toBe(COMMISSARIATS.length * 2);
    expect(used.size).toBe(2);
    expect(used.has(r.materials.far)).toBe(false);
    r.dispose();
  });

  it('près de la porte du 9e : façade et places affichées, les autres sites de loin ou pas du tout', () => {
    const view = new FakeView();
    const h = host();
    const r = new CommissariatsRenderer(view, h, null);
    const d9 = site('9e');
    view.camX = d9.door.x + 5; view.camZ = d9.door.z;
    r.frame(0.016);
    expect(r.stats.built).toBe(1); // un site par image au plus
    expect(r.stats.visible).toBe(1);
    const facade = r.root.getObjectByName('commissariat:9e:facade') as THREE.Mesh;
    const ground = r.root.getObjectByName('commissariat:9e:places') as THREE.Mesh;
    expect(facade.visible).toBe(true);
    expect(ground.visible).toBe(true); // places boulevard Haussmann, à 120 m environ
    // sites à moins de 900 m : dans le lointain (le 1er est à ~800 m du 9e)
    const shown = r.farMesh!.geometry.getAttribute('aShow');
    const far = buildFar(COMMISSARIATS, flat);
    let expectedFar = 0;
    COMMISSARIATS.forEach((def, i) => {
      const d = Math.hypot(def.door.x - view.camX, def.door.z - view.camZ);
      const on = def.id !== '9e' && d < 900;
      if (on) expectedFar++;
      const rg = far.ranges[i]!;
      for (let v = rg.start; v < rg.start + rg.count; v++) expect(shown.getX(v), def.id).toBe(on ? 1 : 0);
    });
    expect(r.stats.farVisible).toBe(expectedFar);
    expect(r.stats.drawCalls).toBe(2 + (expectedFar > 0 ? 1 : 0));
    expect(r.stats.triangles).toBeGreaterThan(0);
    r.dispose();
  });

  it('à 500 m : version lointaine seule ; au-delà de 900 m : rien ; qualité « bas » : 160 m et 600 m', () => {
    const view = new FakeView();
    const r = new CommissariatsRenderer(view, host(), null);
    const d = site('celestins');
    // à 300 m au sud-est : construit (< 450 m) mais masqué (> 260 m) → lointain
    view.camX = d.door.x + 212; view.camZ = d.door.z + 212;
    r.frame(0.016);
    expect(r.stats.built).toBe(1);
    expect(r.stats.visible).toBe(0);
    expect(r.stats.farVisible).toBeGreaterThanOrEqual(1);
    expect(r.stats.drawCalls).toBe(1);
    // loin de tout site (bord est de la carte, 1 km au moins de chaque porte)
    view.camX = 3700; view.camZ = -1300;
    for (const c of COMMISSARIATS) expect(Math.hypot(c.door.x - view.camX, c.door.z - view.camZ)).toBeGreaterThan(900);
    r.frame(0.016);
    expect(r.stats.farVisible).toBe(0);
    expect(r.stats.drawCalls).toBe(0);
    expect(r.farMesh!.visible).toBe(false);
    // qualité basse : à 200 m de la porte, plus de façade proche
    expect(nearRadius('bas')).toBe(160);
    expect(farRadius('bas')).toBe(600);
    view.quality = 'bas';
    view.camX = d.door.x + 200; view.camZ = d.door.z;
    r.frame(0.016);
    const facade = r.root.getObjectByName('commissariat:celestins:facade') as THREE.Mesh;
    expect(facade.visible).toBe(false);
    expect(facade.material).toBe(r.materials.facade);
    expect(r.materials.facade).toBeInstanceOf(THREE.MeshLambertMaterial);
    r.dispose();
  });

  it('la distance d\'affichage borne le lointain', () => {
    const view = new FakeView();
    view.drawDistance = 400;
    const r = new CommissariatsRenderer(view, host(), null);
    const d = site('7e');
    view.camX = d.door.x + 600; view.camZ = d.door.z;
    r.frame(0.016);
    const idx = COMMISSARIATS.indexOf(d);
    const rg = buildFar(COMMISSARIATS, flat).ranges[idx]!;
    expect(r.farMesh!.geometry.getAttribute('aShow').getX(rg.start)).toBe(0);
    r.dispose();
  });

  it('émission réglée sur la nuit ; inactif (carte d\'essai, commissariats désactivés) : rien d\'affiché', () => {
    const view = new FakeView();
    const h = host();
    const r = new CommissariatsRenderer(view, h, null);
    const d = site('3e');
    view.camX = d.door.x; view.camZ = d.door.z;
    h.n = 0;
    r.frame(0.016);
    expect(r.materials.uNight.value).toBe(0);
    h.n = 1;
    r.frame(0.016);
    expect(r.materials.uNight.value).toBeCloseTo(NIGHT_EMISSION, 6);
    expect(r.stats.drawCalls).toBeGreaterThan(0);
    h.on = false;
    r.frame(0.016);
    expect(r.stats.drawCalls).toBe(0);
    let visible = 0;
    r.root.traverse((o) => { if (o instanceof THREE.Mesh && o.visible) visible++; });
    expect(visible).toBe(0);
    r.dispose();
  });

  it('le sol dessiné qui bouge sous la porte reconstruit la façade ; fin de session : habillage proche libéré', () => {
    const view = new FakeView();
    let lift = 0;
    const r = new CommissariatsRenderer(view, host({ groundAt: () => lift }), null);
    const d = site('1er');
    view.camX = d.door.x; view.camZ = d.door.z;
    r.frame(0.016);
    expect(r.anchors('1er')!.lantern[1]).toBeCloseTo(3.045, 3);
    lift = 0.15; // la tuile de la ville vient d'être construite : bordure de trottoir
    r.frame(1.1);
    expect(r.anchors('1er')!.lantern[1]).toBeCloseTo(3.195, 3);
    r.disposeNear();
    expect(r.stats.built).toBe(0);
    expect(r.anchors('1er')).toBeNull();
    expect(r.root.children.length).toBe(0);
    r.frame(0.016);
    expect(r.stats.built).toBe(1);
    r.dispose();
  });
});

describe('rendu des commissariats : système sans rendu', () => {
  it('headless : service publié, aucun effet, aucune erreur', async () => {
    const t = createTestContext({ modules: [createSystems] });
    await t.start({});
    t.step(1);
    const api = t.ctx.service<CommissariatsRenderApi>(COMMISSARIATS_RENDER_KEY);
    expect(api).toBeDefined();
    expect(api!.stats.sites).toBe(COMMISSARIATS.length);
    expect(api!.stats.drawCalls).toBe(0);
    expect(api!.stats.built).toBe(0);
    t.ctx.session.end(false);
  });
});
