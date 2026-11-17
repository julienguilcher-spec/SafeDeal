import { describe, expect, it } from 'vitest';
import { MapTransform } from '@/ui/maps/transform';
import { tacticalFrame } from '@/ui/command/tacticalState';

/**
 * Carte tactique d'un équipier (CRS porte-bouclier, place de la République) : à l'ouverture, la vue cadrait le
 * rectangle de TOUTES les unités visibles — patrouilles et foyers dans tout Paris — puis plafonnait l'échelle à
 * 2,2 m/px autour du MILIEU de ce rectangle (vers le Palais-Royal) : le joueur n'était pas sur la carte
 * (tests/e2e/out/verif-roles-interface-tel-crs-bouclier-tactique.png).
 */
function view(): MapTransform {
  const v = new MapTransform();
  v.setSize(844 - 190, 390 - 46);
  return v;
}

describe('carte tactique — cadrage à l’ouverture', () => {
  it('unités éparpillées dans Paris : le joueur reste sur la carte', () => {
    const v = view();
    const player = { x: 1500, z: -600 };
    // patrouilles aux quatre coins de Paris, le joueur avec son groupe à l'est
    tacticalFrame(v, -3200, -2100, 2600, 1900, player, 0.55, 2.2);
    expect(v.mpp).toBeCloseTo(2.2, 5);
    const b = v.visibleBounds({ minX: 0, minZ: 0, maxX: 0, maxZ: 0 });
    expect(player.x).toBeGreaterThan(b.minX);
    expect(player.x).toBeLessThan(b.maxX);
    expect(player.z).toBeGreaterThan(b.minZ);
    expect(player.z).toBeLessThan(b.maxZ);
  });

  it('unités groupées : cadrage sur leur rectangle, échelle bornée', () => {
    const v = view();
    tacticalFrame(v, 100, 100, 300, 200, { x: 120, z: 110 }, 0.55, 2.2);
    expect(v.cx).toBeCloseTo(200, 5);
    expect(v.cz).toBeCloseTo(150, 5);
    expect(v.mpp).toBeGreaterThanOrEqual(0.55);
    expect(v.mpp).toBeLessThanOrEqual(2.2);
  });
});
