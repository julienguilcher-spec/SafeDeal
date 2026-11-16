// Rendu du décor — mise en page du texte d'enseigne, habillage des devantures, cellules d'atlas.
import { describe, expect, it } from 'vitest';
import { ATLAS_SIZE, REGIONS, SIGN_CELLS, SIGN_H, SIGN_W, SignAllocator, displayRegion, region, signRegion } from '@/render/props/atlas-layout';
import { estimateWidth, layoutSign, shopStyle, signKey } from '@/render/props/signtext';

const NAMES = [
  'Café des Tilleuls', 'Maison Valcourt', 'Joaillerie Belrive', 'Épicerie du Parvis', 'Pharmacie de la Fontaine', 'Tabac des Arcades',
  'Allô Garance Mobiles', 'Banque du Méridien', 'Le Vestiaire du Passage', 'Hôtel de la Rotonde', 'Le Comptoir du Mobile de la Passerelle',
  'Vermeilhac & Fils, maroquinier', 'Comptoir Financier des Deux Rives', 'Ondes & Réseaux du Petit Square', 'Bar', 'Prêt-à-porter Apolline',
];

describe('rendu du décor — mise en page d\'une enseigne', () => {
  it('un nom court tient sur une ligne, au plus grand corps', () => {
    const l = layoutSign('Bar', SIGN_W, SIGN_H);
    expect(l.lines).toEqual(['Bar']);
    expect(l.fontPx).toBe(Math.floor(SIGN_H * 0.62));
    expect(l.truncated).toBe(false);
    expect(l.baselines).toHaveLength(1);
    expect(l.baselines[0]).toBeGreaterThan(SIGN_H * 0.5);
    expect(l.baselines[0]).toBeLessThan(SIGN_H);
  });

  it('aucune ligne ne dépasse de la cellule, quel que soit le nom', () => {
    for (const name of NAMES) {
      for (const upper of [false, true]) {
        const l = layoutSign(name, SIGN_W, SIGN_H, estimateWidth, upper);
        expect(l.lines.length, name).toBeGreaterThanOrEqual(1);
        expect(l.lines.length, name).toBeLessThanOrEqual(2);
        for (const line of l.lines) expect(estimateWidth(line, l.fontPx), `${name} → « ${line} »`).toBeLessThanOrEqual(SIGN_W * 0.92 + 0.5);
        expect(l.baselines).toHaveLength(l.lines.length);
        // les lignes tiennent en hauteur
        expect(l.baselines[0]! - l.fontPx * 0.9).toBeGreaterThanOrEqual(-1);
        expect(l.baselines[l.baselines.length - 1]!).toBeLessThanOrEqual(SIGN_H);
        expect(l.truncated, name).toBe(false);
      }
    }
  });

  it('un nom long passe sur deux lignes équilibrées, coupées à une espace', () => {
    const name = 'Le Comptoir du Mobile de la Passerelle';
    const l = layoutSign(name, SIGN_W, SIGN_H, estimateWidth, true);
    expect(l.lines).toHaveLength(2);
    expect(l.lines.join(' ')).toBe(name.toLocaleUpperCase('fr-FR'));
    const a = estimateWidth(l.lines[0]!, l.fontPx), b = estimateWidth(l.lines[1]!, l.fontPx);
    expect(Math.abs(a - b) / Math.max(a, b)).toBeLessThan(0.4);
    expect(l.fontPx).toBeLessThan(SIGN_H * 0.45);
    expect(l.baselines[1]! - l.baselines[0]!).toBeGreaterThanOrEqual(l.fontPx);
  });

  it('un nom moyen est réduit plutôt que coupé', () => {
    const l = layoutSign('Pharmacie de la Fontaine Bis', SIGN_W, SIGN_H, (t, px) => t.length * px * 0.5);
    expect(l.lines).toHaveLength(1);
    expect(l.fontPx).toBeLessThan(Math.floor(SIGN_H * 0.62));
    expect(l.fontPx).toBeGreaterThanOrEqual(SIGN_H * 0.44);
  });

  it('en dernier recours le nom est tronqué par « … » et signalé', () => {
    const long = 'Société Parisienne des Comptoirs Réunis de la Maroquinerie Fine et des Articles de Voyage du Vieux Pont et de la Rotonde';
    const l = layoutSign(long, SIGN_W, SIGN_H);
    expect(l.truncated).toBe(true);
    expect(l.lines).toHaveLength(2);
    expect(l.lines[1]!.endsWith('…')).toBe(true);
    for (const line of l.lines) expect(estimateWidth(line, l.fontPx)).toBeLessThanOrEqual(SIGN_W * 0.92 + 0.5);
    const word = layoutSign('Anticonstitutionnellementissimementextraordinairementlong', 200, 40);
    expect(word.lines).toHaveLength(1);
    expect(word.truncated).toBe(true);
    expect(estimateWidth(word.lines[0]!, word.fontPx)).toBeLessThanOrEqual(200 * 0.92 + 0.5);
  });

  it('espaces superflus, majuscules accentuées, nom vide', () => {
    expect(layoutSign('  Café   des  Tilleuls ', SIGN_W, SIGN_H).lines).toEqual(['Café des Tilleuls']);
    expect(layoutSign('épicerie à l\'écluse', SIGN_W, SIGN_H, estimateWidth, true).lines.join(' ')).toBe('ÉPICERIE À L\'ÉCLUSE');
    const empty = layoutSign('   ', SIGN_W, SIGN_H);
    expect(empty.lines).toEqual([]);
    expect(empty.fontPx).toBe(0);
  });

  it('la mise en page suit la mesure fournie (police plus large → corps plus petit)', () => {
    const narrow = layoutSign('Boulangerie des Marronniers', SIGN_W, SIGN_H, (t, px) => t.length * px * 0.4);
    const wide = layoutSign('Boulangerie des Marronniers', SIGN_W, SIGN_H, (t, px) => t.length * px * 0.75);
    expect(wide.fontPx).toBeLessThanOrEqual(narrow.fontPx);
  });
});

describe('rendu du décor — habillage des devantures', () => {
  const CATEGORIES = ['banque', 'luxe', 'mode', 'bijouterie', 'alimentation', 'supermarche', 'cafe_restaurant', 'restauration_rapide',
    'pharmacie', 'tabac_presse', 'telephonie', 'agence', 'hotel', 'autre', 'categorie_inconnue'];

  it('déterministe, lisible, et varié d\'une boutique à l\'autre', () => {
    for (const cat of CATEGORIES) {
      const seen = new Set<string>();
      for (let seed = 1; seed < 40; seed++) {
        const a = shopStyle(cat, seed), b = shopStyle(cat, seed);
        expect(a).toEqual(b);
        // lettres lisibles sur le bandeau : écart de luminance net
        const lum = (c: number): number => 0.3 * ((c >> 16) & 255) + 0.59 * ((c >> 8) & 255) + 0.11 * (c & 255);
        expect(Math.abs(lum(a.band) - lum(a.ink)), `${cat} ${seed}`).toBeGreaterThan(70);
        expect(a.sill).toBeGreaterThan(0.2);
        expect(a.sill).toBeLessThan(1.0);
        seen.add(signKey('X', a) + a.frame + a.awning + a.doorSide);
      }
      expect(seen.size, cat).toBeGreaterThan(1);
    }
  });

  it('marqueurs de catégorie : croix de pharmacie, carotte du tabac, enseigne d\'hôtel, store du café', () => {
    expect(shopStyle('pharmacie', 3).blade).toBe('croix_pharma');
    expect(shopStyle('tabac_presse', 3).blade).toBe('carotte');
    expect(shopStyle('hotel', 3).blade).toBe('hotel');
    expect(shopStyle('mode', 3).blade).toBe('');
    expect(shopStyle('cafe_restaurant', 3).awning).not.toBe(0);
    expect(shopStyle('banque', 3).awning).toBe(0);
    expect(shopStyle('bijouterie', 3).sill).toBeGreaterThan(shopStyle('luxe', 3).sill);
  });
});

describe('rendu du décor — plan de l\'atlas', () => {
  it('toutes les régions tiennent dans l\'atlas et ne se chevauchent pas', () => {
    const rects: { name: string; x: number; y: number; w: number; h: number }[] = [];
    for (const name of Object.keys(REGIONS)) rects.push({ name, ...REGIONS[name]! });
    for (let i = 0; i < SIGN_CELLS; i++) rects.push({ name: 'enseigne_' + i, ...signRegion(i) });
    for (const r of rects) {
      expect(r.x, r.name).toBeGreaterThanOrEqual(0);
      expect(r.y, r.name).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w, r.name).toBeLessThanOrEqual(ATLAS_SIZE);
      expect(r.y + r.h, r.name).toBeLessThanOrEqual(ATLAS_SIZE);
    }
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i]!, b = rects[j]!;
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap, `${a.name} / ${b.name}`).toBe(false);
      }
    }
  });

  it('coordonnées de texture : v0 en bas, à l\'intérieur de la région', () => {
    const r = region('rideau');
    expect(r.u0).toBeLessThan(r.u1);
    expect(r.v0).toBeLessThan(r.v1);
    expect(r.u0).toBeGreaterThan(r.x / ATLAS_SIZE);
    expect(r.v1).toBeLessThan(1 - r.y / ATLAS_SIZE);
    expect(region('inconnue')).toBe(region('blanc'));
    expect(displayRegion('mode')).toBe(REGIONS.etal_mode);
    expect(displayRegion('categorie_inconnue')).toBe(REGIONS.etal_autre);
  });

  it('cellules d\'enseigne : partage, cache, reprise de la plus ancienne, saturation', () => {
    const a = new SignAllocator(3);
    const c1 = a.acquire('un');
    expect(a.lastWasFresh).toBe(true);
    expect(a.acquire('un')).toBe(c1);
    expect(a.lastWasFresh).toBe(false);
    const c2 = a.acquire('deux'), c3 = a.acquire('trois');
    expect(new Set([c1, c2, c3]).size).toBe(3);
    expect(a.inUse).toBe(3);
    expect(a.acquire('quatre')).toBe(-1);
    // « un » est référencé deux fois : une libération ne suffit pas
    a.release('un');
    expect(a.acquire('quatre')).toBe(-1);
    a.release('un');
    a.release('deux');
    expect(a.inUse).toBe(1);
    // encore en cache : reprise sans repeindre
    expect(a.acquire('deux')).toBe(c2);
    expect(a.lastWasFresh).toBe(false);
    a.release('deux');
    // « un » a été libéré avant « deux » : c'est sa cellule qui est reprise
    expect(a.acquire('cinq')).toBe(c1);
    expect(a.lastWasFresh).toBe(true);
    expect(a.acquire('un')).toBe(c2);
    expect(a.lastWasFresh).toBe(true);
    a.release('inconnue');
    a.clear();
    expect(a.inUse).toBe(0);
    expect(a.acquire('six')).toBeGreaterThanOrEqual(0);
  });
});
