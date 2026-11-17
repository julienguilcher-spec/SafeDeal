import { describe, expect, it } from 'vitest';
import { leftZoneCenter } from '@/ui/hud/layout';
import type { ScreenBox } from '@/ui/hud/layout';

/**
 * Téléphone 844 × 390, commandant sur le terrain : la proposition de l'adjoint (zone de gauche, sous « Secours »)
 * descendait jusque sur l'état physique et la barre d'objets tactile, dont elle masquait cinq cases
 * (tests/e2e/out/verif-roles-interface-tel-commandant-commandant_unite-terrain-jeu.png).
 */
const box = (left: number, top: number, w: number, hgt: number): ScreenBox => ({ left, right: left + w, top, bottom: top + hgt, height: hgt });

describe('HUD — zone de gauche', () => {
  const H = 390;
  const above = box(12, 8, 250, 152);          // état + mini-carte, jusqu'à y = 160
  const floor = 268;                            // haut de l'état physique (zone du bas)

  it('petite zone : juste sous la mini-carte', () => {
    const c = leftZoneCenter(box(210, 180, 90, 30), above, floor, H) ?? H / 2;
    expect(c - 15).toBeGreaterThanOrEqual(160 + 8);
    expect(c + 15).toBeLessThanOrEqual(floor);
  });

  it('proposition de l’adjoint (zone haute) : jamais sur la zone du bas ni sur la barre d’objets', () => {
    const zone = box(210, 140, 230, 140);
    const c = leftZoneCenter(zone, above, floor, H)!;
    expect(c).not.toBeNull();
    expect(c + 70).toBeLessThanOrEqual(floor - 8 + 0.5);
    expect(c - 70).toBeGreaterThanOrEqual(0);
  });

  it('grand écran, zone loin de tout : laissée au milieu', () => {
    expect(leftZoneCenter(box(16, 300, 160, 40), box(16, 16, 280, 120), 720, 720)).toBeNull();
  });
});
