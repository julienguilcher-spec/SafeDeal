// Rendu du décor — correspondance type d'objet → modèle, gabarits, signatures d'état.
import { describe, expect, it } from 'vitest';
import { PROP_DEFAULTS } from '@/core/store-props';
import {
  FALL_NONE, FALL_X, FALL_Z, MODEL_KEYS, fallAxis, kindInfo, modelFor, propSignature, shopSignature, stockBucket,
} from '@/render/props/mapping';
import { hasModel } from '@/render/props/models';

/** Tous les PropKind du contrat (src/core/contracts.ts § 7), types propres à la carte compris. */
const CONTRACT_KINDS = [
  'poubelle', 'conteneur', 'barriere_vauban', 'barriere_chantier', 'banc', 'abribus', 'kiosque', 'colonne_morris', 'panneau_pub',
  'potelet', 'velo', 'trottinette', 'palette', 'pile_paves', 'table_terrasse', 'chaise', 'candelabre', 'feu_tricolore',
  'distributeur', 'fontaine_wallace', 'barricade', 'debris', 'cone', 'jardiniere', 'echafaudage', 'sanisette', 'station_velo',
  'boite_aux_lettres', 'arceau_velo', 'panneau', 'statue', 'mat_drapeau', 'bouche_incendie', 'horodateur', 'armoire_technique',
  'colonne_verre', 'horloge', 'camera', 'autre',
];

describe('rendu du décor — type → modèle', () => {
  it('chaque PropKind du contrat a son propre modèle', () => {
    for (const kind of CONTRACT_KINDS) {
      expect(modelFor(kind), kind).toBe(kind);
      expect(MODEL_KEYS, kind).toContain(kind);
      // la barricade est un assemblage de modèles, pas un modèle
      if (kind !== 'barricade') expect(hasModel(kind), kind).toBe(true);
    }
    expect(new Set(MODEL_KEYS).size).toBe(MODEL_KEYS.length);
    expect(MODEL_KEYS.length).toBe(CONTRACT_KINDS.length);
  });

  it('un type inconnu prend le modèle générique, sans exception', () => {
    expect(modelFor('truc_jamais_vu')).toBe('autre');
    expect(modelFor('')).toBe('autre');
    expect(kindInfo('truc_jamais_vu').model).toBe('autre');
    for (const k of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) expect(kindInfo(k).model, k).toBe('autre');
  });

  it('les autres orthographes de la carte et des missions sont reconnues', () => {
    expect(modelFor('corbeille')).toBe('poubelle');
    expect(modelFor('lampadaire')).toBe('candelabre');
    expect(modelFor('bus_shelter')).toBe('abribus');
    expect(modelFor('morris_column')).toBe('colonne_morris');
    expect(modelFor('velib')).toBe('station_velo');
    expect(modelFor('toilet')).toBe('sanisette');
    expect(modelFor('wallace_fountain')).toBe('fontaine_wallace');
  });

  it('les gabarits debout sont ceux du magasin du cœur', () => {
    for (const kind of Object.keys(PROP_DEFAULTS)) {
      const d = PROP_DEFAULTS[kind]!;
      const info = kindInfo(kind);
      expect(info.model, kind).toBe(kind);
      expect(info.hx, kind).toBeCloseTo(d.halfX, 5);
      expect(info.hz, kind).toBeCloseTo(d.halfZ, 5);
      expect(info.h, kind).toBeCloseTo(d.height, 5);
    }
  });

  it('les gabarits debout sont ceux de la simulation du décor (si elle est présente)', async () => {
    const sim = await import('@/sim/props/defs').catch(() => null);
    if (!sim) return;
    for (const d of sim.PROP_DEFS) {
      const info = kindInfo(d.kind);
      expect(info.model, d.kind).toBe(d.kind);
      expect(info.hx, d.kind).toBeCloseTo(d.halfX, 5);
      expect(info.hz, d.kind).toBeCloseTo(d.halfZ, 5);
      expect(info.h, d.kind).toBeCloseTo(d.height, 5);
      if (d.kind === 'barricade') continue;
      expect(info.topple, d.kind).toBe(d.topple);
      expect(info.carry, d.kind).toBe(d.carry);
      expect(info.panes, d.kind).toBe(d.panes);
      // ce qui brûle dans la simulation a une façon de brûler dans le rendu
      if (d.fuel > 0) expect(info.burn, d.kind).not.toBe('aucune');
    }
  });
});

describe('rendu du décor — renversement', () => {
  it('objet à emprise carrée : couché vers l\'avant, comme le fait la simulation', () => {
    const p = kindInfo('poubelle');
    expect(fallAxis(p, p.hx, p.hz, p.h)).toBe(FALL_NONE);
    // la simulation pose halfZ = hauteur / 2 et height = 2 × petit côté
    expect(fallAxis(p, 0.22, 0.5, 0.44)).toBe(FALL_Z);
  });

  it('bac roulant : bascule autour de son grand ou de son petit côté', () => {
    const c = kindInfo('conteneur');
    expect(fallAxis(c, 0.63, 0.6, 0.78)).toBe(FALL_Z);
    expect(fallAxis(c, 0.6, 0.39, 1.26)).toBe(FALL_X);
  });

  it('barrière et vélo : à plat sur leur petit côté', () => {
    const b = kindInfo('barriere_vauban');
    expect(fallAxis(b, 1.25, 0.55, 0.4)).toBe(FALL_Z);
    const v = kindInfo('velo');
    expect(fallAxis(v, 0.525, 0.9, 0.56)).toBe(FALL_X);
  });

  it('mobilier fixe « cassé » : garde son emprise, pas de couchage', () => {
    const k = kindInfo('candelabre');
    expect(fallAxis(k, k.hx, k.hz, k.h)).toBe(FALL_NONE);
    expect(fallAxis(k, 4.5, 0.12, 0.24)).toBe(FALL_NONE);
  });
});

describe('rendu du décor — signatures d\'état', () => {
  it('la signature d\'un objet change avec chaque aspect visible', () => {
    const base = propSignature('intact', false, 0, false, false, 4);
    const variants = [
      propSignature('damaged', false, 0, false, false, 4), propSignature('broken', false, 0, false, false, 4),
      propSignature('burning', false, 0, false, false, 4), propSignature('burnt', false, 0, false, false, 4),
      propSignature('intact', true, 0, false, false, 4), propSignature('intact', false, 1, false, false, 4),
      propSignature('intact', false, 2, false, false, 4), propSignature('intact', false, 0, true, false, 4),
      propSignature('intact', false, 0, false, true, 4), propSignature('intact', false, 0, false, false, 3),
    ];
    expect(new Set([base, ...variants]).size).toBe(variants.length + 1);
    // au-delà de trois graffitis l'aspect ne change plus
    expect(propSignature('intact', false, 3, false, false, 0)).toBe(propSignature('intact', false, 9, false, false, 0));
  });

  it('la signature d\'une vitrine suit le rideau par pas fins, et tous les états', () => {
    const s = (shutter: number): number => shopSignature('intact', shutter, 1, 0, false, false, false, false, 0);
    expect(s(0)).not.toBe(s(0.02));
    expect(s(0.5)).toBe(s(0.5004));
    expect(s(1)).toBe(s(1.7));
    const base = shopSignature('intact', 0, 1, 0, false, false, false, false, 0);
    const all = [
      shopSignature('tagged', 0, 1, 0, false, false, false, false, 0), shopSignature('cracked', 0, 1, 0, false, false, false, false, 0),
      shopSignature('broken', 0, 1, 0, false, false, false, false, 0), shopSignature('boarded', 0, 1, 0, false, false, false, true, 0),
      shopSignature('intact', 0, 0, 0, false, false, false, false, 0), shopSignature('intact', 0, 1, 0.5, false, false, false, false, 0),
      shopSignature('intact', 0, 1, 0, true, false, false, false, 0), shopSignature('intact', 0, 1, 0, false, true, false, false, 0),
      shopSignature('intact', 0, 1, 0, false, false, true, false, 0), shopSignature('intact', 0, 1, 0, false, false, false, false, 2),
    ];
    expect(new Set([base, ...all]).size).toBe(all.length + 1);
    expect(stockBucket(0)).toBe(0);
    expect(stockBucket(0.3)).toBe(1);
    expect(stockBucket(1)).toBe(2);
  });
});
