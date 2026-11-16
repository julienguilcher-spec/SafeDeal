// Socle de l'interface — navigation au focus : choix du voisin dans une direction (logique géométrique pure).
import { describe, expect, it } from 'vitest';
import { NAV_REPEAT_DELAY, NAV_REPEAT_PERIOD, pickNeighbor } from '@/ui/core/focus';
import type { NavRect } from '@/ui/core/focus';

const r = (x: number, y: number, w: number, h: number): NavRect => ({ x, y, w, h });

describe('ui/focus — pickNeighbor', () => {
  it('grille régulière : chaque direction mène à la case voisine', () => {
    // 3 colonnes × 3 lignes de cartes 100 × 60, espacées de 8
    const cells: NavRect[] = [];
    for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) cells.push(r(col * 108, row * 68, 100, 60));
    const center = cells[4]!;
    const others = cells.map((c, i) => (i === 4 ? r(0, 0, 0, 0) : c));
    expect(pickNeighbor(center, others, 'left')).toBe(3);
    expect(pickNeighbor(center, others, 'right')).toBe(5);
    expect(pickNeighbor(center, others, 'up')).toBe(1);
    expect(pickNeighbor(center, others, 'down')).toBe(7);
  });

  it('aux bords, rien dans la direction : -1', () => {
    const cells = [r(0, 0, 100, 40), r(0, 48, 100, 40)];
    expect(pickNeighbor(cells[0]!, [r(0, 0, 0, 0), cells[1]!], 'up')).toBe(-1);
    expect(pickNeighbor(cells[0]!, [r(0, 0, 0, 0), cells[1]!], 'left')).toBe(-1);
    expect(pickNeighbor(cells[1]!, [cells[0]!, r(0, 0, 0, 0)], 'down')).toBe(-1);
    expect(pickNeighbor(cells[0]!, [], 'right')).toBe(-1);
  });

  it('liste verticale : descend ligne par ligne, sans sauter', () => {
    const rows = [0, 1, 2, 3].map((i) => r(20, 100 + i * 48, 200, 44));
    expect(pickNeighbor(rows[0]!, rows.map((x, i) => (i === 0 ? r(0, 0, 0, 0) : x)), 'down')).toBe(1);
    expect(pickNeighbor(rows[2]!, rows.map((x, i) => (i === 2 ? r(0, 0, 0, 0) : x)), 'up')).toBe(1);
  });

  it('colonne d’onglets à gauche, contenu à droite : « droite » entre dans le contenu à la bonne hauteur', () => {
    const tab = r(20, 200, 200, 44);
    const content = [r(260, 100, 180, 60), r(260, 190, 180, 60), r(260, 400, 180, 60), r(460, 190, 180, 60)];
    expect(pickNeighbor(tab, content, 'right')).toBe(1);
    // et « gauche » depuis le contenu revient à l'onglet
    expect(pickNeighbor(content[1]!, [tab], 'left')).toBe(0);
  });

  it('préfère un élément aligné, même un peu plus loin, à un élément décalé', () => {
    const cur = r(100, 100, 100, 40);
    const aligned = r(110, 220, 100, 40);       // sous l'élément, à 80 px
    const offside = r(260, 150, 100, 40);       // plus près verticalement, mais à côté
    expect(pickNeighbor(cur, [offside, aligned], 'down')).toBe(1);
  });

  it('écarte les éléments trop de côté (plus de 60° environ)', () => {
    const cur = r(0, 0, 100, 40);
    const farSide = r(600, 60, 100, 40);
    expect(pickNeighbor(cur, [farSide], 'down')).toBe(-1);
    // … mais on les atteint par la direction qui va vers eux
    expect(pickNeighbor(cur, [farSide], 'right')).toBe(0);
  });

  it('curseur large au-dessus de deux boutons : descend vers le plus centré', () => {
    const slider = r(0, 0, 400, 44);
    const left = r(0, 60, 120, 44);
    const middle = r(140, 60, 120, 44);
    const right = r(280, 60, 120, 44);
    expect(pickNeighbor(slider, [left, middle, right], 'down')).toBe(1);
  });

  it('boutons jointifs ou qui se recouvrent d’un pixel (sélecteur segmenté)', () => {
    const a = r(0, 0, 80, 40);
    const b = r(79, 0, 80, 40);
    const c = r(158, 0, 80, 40);
    expect(pickNeighbor(a, [r(0, 0, 0, 0), b, c], 'right')).toBe(1);
    expect(pickNeighbor(c, [a, b, r(0, 0, 0, 0)], 'left')).toBe(1);
  });

  it('ignore les rectangles vides et l’élément lui-même remis à zéro', () => {
    const cur = r(0, 0, 50, 50);
    expect(pickNeighbor(cur, [r(100, 0, 0, 50), r(100, 0, 50, 0)], 'right')).toBe(-1);
  });

  it('un élément englobant (conteneur focalisable) n’est pas un voisin', () => {
    const cur = r(100, 100, 50, 30);
    const container = r(0, 0, 400, 400);
    expect(pickNeighbor(cur, [container], 'right')).toBe(-1);
    expect(pickNeighbor(cur, [container], 'down')).toBe(-1);
  });

  it('à égalité, le premier dans l’ordre du document', () => {
    const cur = r(100, 0, 100, 40);
    const a = r(100, 60, 100, 40);
    const b = r(100, 60, 100, 40);
    expect(pickNeighbor(cur, [a, b], 'down')).toBe(0);
  });

  it('répétition : un délai franc, puis une cadence soutenue', () => {
    expect(NAV_REPEAT_DELAY).toBeGreaterThan(0.25);
    expect(NAV_REPEAT_PERIOD).toBeLessThan(NAV_REPEAT_DELAY);
    expect(NAV_REPEAT_PERIOD).toBeGreaterThan(0.05);
  });
});
