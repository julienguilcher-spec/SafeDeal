// Air clair (src/render/base/clearAir.ts) : les monuments ne prennent pas le brouillard de distance d'affichage.
// Défaut de la recette du premier jeu assemblé : en qualité « bas », la tour Eiffel était effacée à 750 m et l'Arc de
// Triomphe délavé à 120 m.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CLEAR_AIR_VISIBILITY, ClearAir } from '@/render/base/clearAir';
import { fogDensityFor, visibilityFor } from '@/render/base/atmosphere';

/** Part masquée par un brouillard exponentiel au carré (THREE.FogExp2) à la distance d. */
const hidden = (density: number, d: number): number => 1 - Math.exp(-Math.pow(density * d, 2));

function call(o: THREE.Object3D, hook: 'onBeforeRender' | 'onAfterRender', scene: THREE.Scene): void {
  (o[hook] as unknown as (r: unknown, s: THREE.Scene) => void).call(o, null, scene);
}

describe('rendu de base : air clair', () => {
  it('abaisse le brouillard de scène le temps du dessin d’un maillage confié, puis le rétablit', () => {
    const air = new ClearAir();
    const scene = new THREE.Scene();
    const low = fogDensityFor(220); // qualité « bas » : 92 % masqués à 220 m
    scene.fog = new THREE.FogExp2(0xb8c8d8, low);
    const fog = scene.fog as THREE.FogExp2;
    const root = new THREE.Group();
    const a = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    const sub = new THREE.Group();
    const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    sub.add(b);
    root.add(a, sub);
    expect(air.exempt(root)).toBe(2);
    // rappel : rien de nouveau ; un maillage ajouté ensuite est pris au passage suivant
    expect(air.exempt(root)).toBe(0);
    const c = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    sub.add(c);
    expect(air.exempt(root)).toBe(1);

    for (const m of [a, b, c]) {
      call(m, 'onBeforeRender', scene);
      expect(fog.density).toBeCloseTo(fogDensityFor(CLEAR_AIR_VISIBILITY), 10);
      call(m, 'onAfterRender', scene);
      expect(fog.density).toBe(low);
    }
    // un maillage non confié ne touche à rien
    const other = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    call(other, 'onBeforeRender', scene);
    expect(fog.density).toBe(low);
    // deux « avant » de suite (objet dessiné deux fois sans « après ») ne perdent pas la valeur de la scène
    call(a, 'onBeforeRender', scene);
    call(b, 'onBeforeRender', scene);
    call(b, 'onAfterRender', scene);
    expect(fog.density).toBe(low);
    // sans brouillard de scène : rien à faire, rien ne casse
    scene.fog = null;
    call(a, 'onBeforeRender', scene);
    call(a, 'onAfterRender', scene);
  });

  it('par temps clair la tour Eiffel reste lisible à plusieurs kilomètres ; par brouillard le voile rejoint celui de la scène', () => {
    const air = new ClearAir();
    air.update(0, 0);
    // tour Eiffel vue de la Concorde (2 125 m) et du Trocadéro (750 m), Arc de Triomphe à 120 m
    expect(hidden(air.density, 2125)).toBeLessThan(0.45);
    expect(hidden(air.density, 750)).toBeLessThan(0.08);
    expect(hidden(air.density, 120)).toBeLessThan(0.01);
    // … alors que le brouillard de distance d'affichage de la qualité basse les effaçait
    expect(hidden(fogDensityFor(220), 750)).toBeGreaterThan(0.99);
    expect(hidden(fogDensityFor(220), 120)).toBeGreaterThan(0.5);
    // brouillard épais : même visibilité que la scène (à 10 % près), le monument ne perce pas la brume
    air.update(1, 0);
    const sceneFog = fogDensityFor(visibilityFor(220, 1, 0));
    expect(air.density).toBeGreaterThan(sceneFog * 0.9);
    // et il ne rend jamais la scène PLUS brumeuse qu'elle n'est (vue tactique : brouillard de scène allégé)
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0xb8c8d8, air.density * 0.5);
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    air.exempt(m);
    call(m, 'onBeforeRender', scene);
    expect((scene.fog as THREE.FogExp2).density).toBe(air.density * 0.5);
    call(m, 'onAfterRender', scene);
    // pluie : la visibilité baisse
    const clear = new ClearAir();
    clear.update(0, 1);
    expect(clear.density).toBeGreaterThan(fogDensityFor(CLEAR_AIR_VISIBILITY) * 5);
  });
});
