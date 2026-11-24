// Système d'affichage des monuments, sans WebGL : niveaux de détail selon la distance, pose (relief, cap),
// libération hors de portée, illumination nocturne, scintillement de début d'heure, changement de qualité.
import { beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createSystems, getMonument } from '@/world/monuments';
import type { MonumentsApi } from '@/world/monuments/api';
import { getNightLevel } from '@/world/monuments/kit';
import { SystemOrder, type GameContext, type GameSystem, type LandmarkInfo } from '@/core/contracts';

interface Fake {
  ctx: GameContext;
  system: GameSystem;
  api: MonumentsApi;
  world: THREE.Group;
  cam: { x: number; y: number; z: number };
  env: { timeOfDay: number; daylight: number; isNight: boolean };
  landmarks: LandmarkInfo[];
  view: { quality: string; drawDistance: number };
  emit(name: string, payload: unknown): void;
  /** Avance de n images de 0,25 s (une passe de niveau de détail par image). */
  run(n?: number): void;
  group(key: string, index?: number): THREE.Object3D | undefined;
}

function lm(key: string, x: number, z: number, heading = 0): LandmarkInfo {
  return { key, name: key, x, z, y: 0, heading, height: getMonument(key)?.height ?? 10, footprint: [] };
}

function makeFake(landmarks: LandmarkInfo[], headless = false): Fake {
  const world = new THREE.Group();
  const cam = { x: 0, y: 1.7, z: 0 };
  const env = { timeOfDay: 14, daylight: 1, isNight: false };
  const handlers = new Map<string, ((p: unknown) => void)[]>();
  const services = new Map<string, unknown>();
  const view = {
    world, quality: 'haut', drawDistance: 600,
    get camX() { return cam.x; }, get camY() { return cam.y; }, get camZ() { return cam.z; },
  };
  const ctx = {
    headless,
    view: headless ? null : view,
    world: { ready: true, landmarks, heightAt: (x: number, z: number) => 2 + x * 0.001 + z * 0.002 },
    env: { state: env },
    events: {
      on: (name: string, h: (p: unknown) => void) => { const l = handlers.get(name) ?? []; l.push(h); handlers.set(name, l); return () => { const i = l.indexOf(h); if (i >= 0) l.splice(i, 1); }; },
    },
    provide: (k: string, s: unknown) => { services.set(k, s); },
    service: (k: string) => services.get(k),
  } as unknown as GameContext;
  const systems = createSystems();
  const system = systems[0];
  system.provide?.(ctx);
  void system.init?.(ctx);
  const fake: Fake = {
    ctx, system, world, cam, env, landmarks, view,
    api: services.get('monuments') as MonumentsApi,
    emit: (name, payload) => { for (const h of handlers.get(name) ?? []) h(payload); },
    run: (n = 1) => { for (let i = 0; i < n; i++) system.frame?.(0.25); },
    group: (key, index = 0) => {
      const root = world.children.find((c) => c.name === 'monuments');
      return root?.children.filter((c) => c.name === `monument:${key}`)[index];
    },
  };
  return fake;
}

describe('système des monuments', () => {
  let f: Fake;
  beforeEach(() => {
    f = makeFake([
      lm('arc_triomphe', 0, 0, 0.5), lm('obelisque_concorde', 2000, 0), lm('fontaines_concorde', 2000, 60),
      lm('fontaines_concorde', 2000, -60, Math.PI), lm('tour_eiffel', 0, 3000), lm('batiment_sans_modele', 50, 50),
    ]);
  });

  it('se déclare comme un système de présentation du monde et publie son service', () => {
    const systems = createSystems();
    expect(systems.length).toBe(1);
    expect(systems[0].id).toBe('monuments');
    expect(systems[0].order).toBe(SystemOrder.WORLD_VIEW);
    expect(f.api.has('arc_triomphe')).toBe(true);
    expect(f.api.has('arc_de_triomphe')).toBe(true);
    expect(f.api.has('batiment_sans_modele')).toBe(false);
    expect(f.api.keys()).toContain('tour_eiffel');
    expect(f.api.collidersOf(f.landmarks[0]).length).toBeGreaterThan(4);
  });

  it('ne fait rien en mode headless (ctx.view === null)', () => {
    const h = makeFake([lm('arc_triomphe', 0, 0)], true);
    expect(() => h.run(3)).not.toThrow();
    expect(h.world.children.length).toBe(0);
    expect(h.api.stats().known).toBe(0);
  });

  it('modèle détaillé près de la caméra, silhouette au loin, rien hors de portée', () => {
    f.cam.x = 40; f.cam.z = 80;
    f.run(3);
    const s = f.api.stats();
    expect(s.known).toBe(5);                                   // le repère sans modèle est ignoré
    expect(s.detailed).toBe(1);                                // l'Arc
    expect(s.distant).toBeGreaterThanOrEqual(1);               // la Tour, à 3 km, visible de loin
    const arc = f.group('arc_triomphe')!;
    expect(arc.visible).toBe(true);
    expect(arc.children.some((c) => c.visible && c.name === 'arc_triomphe')).toBe(true);
    const tower = f.group('tour_eiffel')!;
    expect(tower.visible).toBe(true);
    expect(tower.children.some((c) => c.visible && c.name === 'tour_eiffel:loin')).toBe(true);
    // l'obélisque (33 m) à 2 km : hors de la distance d'affichage
    expect(f.group('obelisque_concorde')!.visible).toBe(false);
    expect(f.group('obelisque_concorde')!.children.length).toBe(0);
    expect(s.triangles).toBeGreaterThan(5000);
    expect(s.drawCalls).toBeLessThanOrEqual(12 + 4 * 4);
  });

  it('pose le groupe à heightAt et l\'oriente selon le cap du repère', () => {
    f.run(2);
    const arc = f.group('arc_triomphe')!;
    expect(arc.position.x).toBe(0);
    expect(arc.position.z).toBe(0);
    expect(arc.position.y).toBeCloseTo(2, 6);
    expect(arc.rotation.y).toBeCloseTo(0.5, 9);
    const fountain2 = f.group('fontaines_concorde', 1)!;
    expect(fountain2.position.z).toBe(-60);
    expect(fountain2.position.y).toBeCloseTo(2 + 2 - 0.12, 6);
    expect(fountain2.rotation.y).toBeCloseTo(Math.PI, 9);
  });

  it('la même définition est placée deux fois (les deux fontaines)', () => {
    f.cam.x = 2000; f.cam.z = 0;
    f.run(6);
    const s = f.api.stats();
    expect(s.detailed).toBe(3);                                // obélisque + deux fontaines
    expect(f.group('fontaines_concorde', 0)!.children.some((c) => c.visible)).toBe(true);
    expect(f.group('fontaines_concorde', 1)!.children.some((c) => c.visible)).toBe(true);
  });

  it('construit au plus un modèle détaillé par passe, la silhouette tenant lieu en attendant', () => {
    f.cam.x = 2000; f.cam.z = 0;
    f.run(1);
    expect(f.api.stats().detailed).toBe(1);
    expect(f.api.stats().distant).toBeGreaterThanOrEqual(2);
    f.run(1);
    expect(f.api.stats().detailed).toBe(2);
    f.run(1);
    expect(f.api.stats().detailed).toBe(3);
  });

  it('relâche le modèle détaillé quand on s\'éloigne, puis la silhouette hors de portée', () => {
    f.cam.x = 40; f.cam.z = 80;
    f.run(3);
    const arc = f.group('arc_triomphe')!;
    const detailed = arc.children.find((c) => c.name === 'arc_triomphe') as THREE.Object3D;
    let disposed = 0;
    detailed.traverse((c) => { const m = c as THREE.Mesh; if (m.geometry) m.geometry.addEventListener('dispose', () => { disposed++; }); });
    // à 1 300 m (au-delà de 2,4 × la distance de détail) : silhouette seule, le détaillé est libéré
    f.cam.x = 1300; f.cam.z = 0;
    f.run(2);
    expect(arc.children.some((c) => c.name === 'arc_triomphe')).toBe(false);
    expect(arc.children.some((c) => c.visible && c.name === 'arc_triomphe:loin')).toBe(true);
    expect(disposed).toBeGreaterThan(3);
    // à 5 km : plus rien
    f.cam.x = 5000;
    f.run(2);
    expect(arc.visible).toBe(false);
    expect(arc.children.length).toBe(0);
    // on revient : le modèle est reconstruit
    f.cam.x = 40; f.cam.z = 80;
    f.run(3);
    expect(arc.children.some((c) => c.visible && c.name === 'arc_triomphe')).toBe(true);
  });

  it('hystérésis : pas de va-et-vient à la limite de distance', () => {
    const near = 310 + 49.54 * 2.5;                            // qualité haute
    f.cam.x = 0; f.cam.z = 27 + near - 5;
    f.run(3);
    expect(f.api.stats().detailed).toBe(1);
    f.cam.z = 27 + near + 20;                                  // un peu au-delà : on garde le détail
    f.run(3);
    expect(f.api.stats().detailed).toBe(1);
    f.cam.z = 27 + near * 1.14 + 10;                           // franchement au-delà : silhouette
    f.run(3);
    expect(f.api.stats().detailed).toBe(0);
    f.cam.z = 27 + near + 20;                                  // on revient dans la zone grise : on reste en silhouette
    f.run(3);
    expect(f.api.stats().detailed).toBe(0);
  });

  it('illumination nocturne : suit la lumière du jour, progressivement', () => {
    f.run(4);
    expect(f.api.stats().night).toBe(0);
    expect(getNightLevel()).toBe(0);
    f.env.daylight = 0; f.env.isNight = true; f.env.timeOfDay = 23.5;
    f.run(1);
    const first = f.api.stats().night;
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(0.6);
    f.run(40);
    expect(f.api.stats().night).toBe(1);
    expect(getNightLevel()).toBe(1);
    f.env.daylight = 0.33;                                     // crépuscule : illumination partielle
    f.run(60);
    expect(f.api.stats().night).toBeGreaterThan(0.2);
    expect(f.api.stats().night).toBeLessThan(0.8);
    f.env.daylight = 1; f.env.isNight = false;
    f.run(60);
    expect(f.api.stats().night).toBe(0);
  });

  it('la Tour scintille pendant les cinq premières minutes de chaque heure, la nuit seulement', () => {
    f.cam.x = 0; f.cam.z = 2900;
    f.env.timeOfDay = 14.01;
    f.run(8);
    expect(f.api.stats().sparkle).toBe(0);                     // en plein jour : jamais
    const tower = f.group('tour_eiffel')!;
    const shown = tower.children.find((c) => c.visible)!;
    const points = shown.userData.sparkle as THREE.Points;
    expect(points).toBeTruthy();
    expect(points.visible).toBe(false);
    f.env.daylight = 0; f.env.isNight = true; f.env.timeOfDay = 22.5;
    f.run(40);
    expect(f.api.stats().sparkle).toBe(0);                     // nuit, mais hors du début d'heure
    f.env.timeOfDay = 23.02;
    f.run(30);
    expect(f.api.stats().sparkle).toBe(1);
    expect(points.visible).toBe(true);
    expect((points.material as THREE.ShaderMaterial).uniforms.uAmount.value).toBe(1);
    f.env.timeOfDay = 23 + 6 / 60;
    f.run(30);
    expect(f.api.stats().sparkle).toBe(0);
    expect(points.visible).toBe(false);
    // la silhouette lointaine scintille aussi
    f.cam.z = 600;
    f.env.timeOfDay = 0.03;
    f.run(30);
    const far = tower.children.find((c) => c.visible && c.name === 'tour_eiffel:loin')!;
    expect((far.userData.sparkle as THREE.Points).visible).toBe(true);
  });

  it('changement de qualité : les modèles détaillés sont reconstruits', () => {
    f.cam.x = 40; f.cam.z = 80;
    f.run(3);
    const before = f.api.stats().triangles;
    f.view.quality = 'bas';
    f.emit('settings:changed', { key: 'quality' });
    f.run(3);
    const after = f.api.stats();
    expect(after.detailed).toBe(1);
    expect(after.triangles).toBeLessThan(before);
    f.emit('settings:changed', { key: 'fov' });                // un autre réglage ne touche à rien
    f.run(1);
    expect(f.api.stats().triangles).toBe(after.triangles);
  });

  it('suit une liste de repères qui se complète après coup (chargement différé)', () => {
    f.run(2);
    expect(f.api.stats().known).toBe(5);
    f.landmarks.push(lm('colonne_vendome', 100, 100));
    f.run(3);
    expect(f.api.stats().known).toBe(6);
    expect(f.group('colonne_vendome')!.visible).toBe(true);
  });

  it('prewarm construit puis relâche les modèles demandés sans rien afficher', () => {
    expect(() => f.api.prewarm(['obelisque_concorde', 'cle_inconnue'])).not.toThrow();
    expect(f.world.children.length).toBe(0);
    const h = makeFake([lm('arc_triomphe', 0, 0)], true);
    expect(() => h.api.prewarm()).not.toThrow();
  });

  it('reset relâche tout ; dispose retire le groupe racine', () => {
    f.cam.x = 40; f.cam.z = 80;
    f.run(3);
    f.system.reset?.();
    expect(f.api.stats().known).toBe(0);
    expect(f.world.children.find((c) => c.name === 'monuments')!.children.length).toBe(0);
    f.run(3);
    expect(f.api.stats().detailed).toBe(1);                    // nouvelle session : tout revient
    f.system.dispose?.();
    expect(f.world.children.length).toBe(0);
    expect(() => f.system.frame?.(0.1)).not.toThrow();
  });
});
