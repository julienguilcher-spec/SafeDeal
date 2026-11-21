import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodePlaces } from '@/world/mapdata';
import type { RawPlaces } from '@/world/mapdata';
import { MISSIONS } from '@/gameplay/missions/catalog';

/** Normalisation : minuscules, sans accents, apostrophes et ponctuation ramenées à des espaces. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’‘`]/g, '\'')
    .replace(/œ/g, 'oe')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const brut = JSON.parse(readFileSync(resolve(__dirname, '../../public/data/paris/places.json'), 'utf8')) as RawPlaces;
const lieux = decodePlaces(brut);
const noms = lieux.map((p) => norm(p.name));

/** Correspondance partielle admise : le nom de la mission est contenu dans un nom de la carte. */
function existe(nom: string): boolean {
  const n = norm(nom);
  return n.length >= 3 && noms.some((x) => x.includes(n));
}

function nomsDeLieux(): Array<{ id: string; champ: string; nom: string }> {
  const out: Array<{ id: string; champ: string; nom: string }> = [];
  for (const m of MISSIONS) {
    out.push({ id: m.id, champ: 'place', nom: m.place });
    for (const r of m.crowd.route) out.push({ id: m.id, champ: 'parcours', nom: r });
    for (const h of m.intel.hotspots) out.push({ id: m.id, champ: 'point chaud', nom: h });
    for (const o of m.objectives) if (o.place !== undefined) out.push({ id: m.id, champ: `objectif ${o.id}`, nom: o.place });
  }
  return out;
}

describe('catalogue de missions : lieux de la vraie carte', () => {
  it('la carte est chargée et décodée', () => {
    expect(lieux.length).toBeGreaterThan(2000);
  });

  it('chaque lieu cité (place, parcours, points chauds, objectifs) existe dans places.json', () => {
    const absents = nomsDeLieux().filter((l) => !existe(l.nom)).map((l) => `${l.id} · ${l.champ} : « ${l.nom} »`);
    expect(absents).toEqual([]);
  });

  it('la plupart des lieux correspondent exactement à un nom de la carte', () => {
    const exact = new Set(noms);
    const tous = nomsDeLieux();
    const exacts = tous.filter((l) => exact.has(norm(l.nom))).length;
    expect(exacts / tous.length).toBeGreaterThan(0.9);
  });

  it('le lieu de départ de chaque mission est un lieu de la carte', () => {
    for (const m of MISSIONS) expect(existe(m.place), m.id).toBe(true);
  });
});
