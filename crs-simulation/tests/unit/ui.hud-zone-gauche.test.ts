import { describe, expect, it } from 'vitest';
import { leftZoneCenter, subtitlePlacement, SUBTITLE_MIN_WIDTH } from '@/ui/hud/layout';
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

/**
 * Téléphone 844 × 390, en véhicule : les boutons « À pied » / « En colonne » (ou la proposition de l'adjoint) vont
 * jusqu'à x ≈ 400–440 et les commandes de droite commencent à x = 554. Resserré dans la bande restante, le sous-titre
 * radio recouvrait « En colonne » et « Plus tard »
 * (tests/e2e/out/verif-roles-interface-tel-crs-conducteur-jeu.png, …-tel-commandant-commandant_unite-salle-jeu.png).
 */
describe('HUD — sous-titres et zone de gauche', () => {
  const W = 844;
  const H = 390;
  const baseLeft = 210;                         // volant tactile
  const baseRight = 554;                        // pédales et avertisseurs
  const bottomTop = 290;                        // haut de la zone du bas (état physique, tableau de bord)
  const above = box(12, 8, 250, 188);           // état + mini-carte + « Radio » / « Ordres », jusqu'à y = 196

  it('zone de gauche absente ou plus haute que les sous-titres : bande normale au-dessus de la zone du bas', () => {
    expect(subtitlePlacement(W, H, baseLeft, baseRight, bottomTop, null, above)).toEqual({ bottom: H - bottomTop + 8, edge: -1 });
    const high = box(210, 120, 90, 40);
    expect(subtitlePlacement(W, H, baseLeft, baseRight, bottomTop, high, above)).toEqual({ bottom: H - bottomTop + 8, edge: -1 });
  });

  it('zone étroite à leur hauteur : les sous-titres passent à sa droite, avec la place d’être lus', () => {
    const zone = box(210, 205, 90, 66);
    const p = subtitlePlacement(W, H, baseLeft, baseRight, bottomTop, zone, above);
    expect(p).toEqual({ bottom: H - bottomTop + 8, edge: 308 });
    expect(baseRight - p.edge).toBeGreaterThanOrEqual(SUBTITLE_MIN_WIDTH);
  });

  it('« À pied » / « En colonne » jusqu’à x = 402 : plus la place à droite, les sous-titres passent au-dessus de la zone', () => {
    const zone = box(210, 205, 192, 66);
    const p = subtitlePlacement(W, H, baseLeft, baseRight, bottomTop, zone, above);
    // au-dessus du haut de la zone (y = 205), et à droite de la mini-carte qui est à cette hauteur
    expect(H - p.bottom).toBeLessThanOrEqual(zone.top - 8);
    expect(p.edge).toBe(above.right + 8);
    expect(baseRight - p.edge).toBeGreaterThanOrEqual(SUBTITLE_MIN_WIDTH);
  });

  it('proposition de l’adjoint (zone large et haute) : même règle', () => {
    const zone = box(210, 205, 228, 175);
    const p = subtitlePlacement(W, H, baseLeft, baseRight, bottomTop, zone, above);
    expect(H - p.bottom).toBeLessThanOrEqual(zone.top - 8);
    expect(baseRight - Math.max(baseLeft, p.edge)).toBeGreaterThanOrEqual(SUBTITLE_MIN_WIDTH);
  });

  it('zone qui monte presque en haut de l’écran : on ne remonte pas les sous-titres dans la barre du haut', () => {
    const zone = box(210, 60, 228, 300);
    const p = subtitlePlacement(W, H, baseLeft, baseRight, bottomTop, zone, above);
    expect(p.bottom).toBe(H - bottomTop + 8);
    expect(p.edge).toBe(446);
  });
});
