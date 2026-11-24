// Planificateur des appels de CENTRAL pendant une vacation (logique pure) : rythmes, natures, lieux, effectifs et
// phrases radio. Même graine, même suite d'appels.
import { describe, expect, it } from 'vitest';
import { createRng } from '@/core/rng';
import {
  CALL_KINDS, CALL_PLACES, RYTHMES, SPOT_MAX, SPOT_MIN, SPOT_SPACING, callLabel, callSize, callText, nextCallAt, pickKind, pickSpot,
} from '@/gameplay/patrols/calls';
import type { SpotCandidate } from '@/gameplay/patrols/calls';
import type { CallKind, PatrolCallTypes, PatrolRythme } from '@/gameplay/patrols/model';
import { BAC_SITES } from '@/gameplay/patrols';

const ALL: PatrolCallTypes = { feux: true, rassemblements: true, blocages: true, casseurs: true, manifs: true };
const HOME = BAC_SITES[0]!;

/** Points de rue fictifs en couronne autour du départ (le vrai répartiteur les prend sur la carte). */
function streets(): SpotCandidate[] {
  const out: SpotCandidate[] = [];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const d = 300 + (i % 8) * 280;
    out.push({ x: HOME.x + Math.sin(a) * d, z: HOME.z + Math.cos(a) * d, name: i % 3 === 0 ? '' : `rue n° ${i}`, named: false });
  }
  return out;
}

interface Planned { t: number; kind: CallKind; x: number; z: number; size: number }

/** Suite d'appels d'une vacation simulée sans monde : instants, natures, lieux, effectifs. */
function plan(seed: number, rythme: PatrolRythme, until: number): Planned[] {
  const rng = createRng(seed).fork('patrouille:appels');
  const out: Planned[] = [];
  let t = nextCallAt(rythme, 0, rng, true);
  const busy: { x: number; z: number; end: number }[] = [];
  while (t < until) {
    for (let i = busy.length - 1; i >= 0; i--) if (busy[i]!.end < t) busy.splice(i, 1);
    if (busy.length < RYTHMES[rythme].max) {
      const kind = pickKind(rythme, ALL, rng, { elapsed: t, sauvageActive: false });
      if (kind) {
        const spot = pickSpot(kind, HOME, busy, CALL_PLACES, streets(), rng);
        if (spot) {
          const size = callSize(kind, rng);
          out.push({ t, kind, x: spot.x, z: spot.z, size });
          busy.push({ x: spot.x, z: spot.z, end: t + 400 });
        }
      }
    }
    t = nextCallAt(rythme, t, rng, false);
  }
  return out;
}

describe('planificateur des appels de la vacation', () => {
  it('même graine, même suite d’appels ; une autre graine en donne une autre', () => {
    const a = plan(11, 'agite', 3600);
    const b = plan(11, 'agite', 3600);
    const c = plan(12, 'agite', 3600);
    expect(a.length).toBeGreaterThan(5);
    expect(b).toEqual(a);
    expect(c).not.toEqual(a);
  });

  it('premier appel et écarts dans les bornes du rythme ; valeurs imposées respectées', () => {
    for (const r of ['calme', 'normal', 'agite'] as const) {
      const rng = createRng(4).fork('x');
      for (let i = 0; i < 50; i++) {
        const f = nextCallAt(r, 100, rng, true) - 100;
        expect(f).toBeGreaterThanOrEqual(RYTHMES[r].first[0]);
        expect(f).toBeLessThanOrEqual(RYTHMES[r].first[1]);
        const g = nextCallAt(r, 100, rng, false) - 100;
        expect(g).toBeGreaterThanOrEqual(RYTHMES[r].gap[0]);
        expect(g).toBeLessThanOrEqual(RYTHMES[r].gap[1]);
      }
    }
    const rng = createRng(4).fork('x');
    expect(nextCallAt('calme', 10, rng, true, { premier: 5 })).toBe(15);
    expect(nextCallAt('calme', 10, rng, false, { ecart: 42 })).toBe(52);
    // le paramètre d'essai ne décale pas la suite des tirages
    const r1 = createRng(9).fork('y');
    const r2 = createRng(9).fork('y');
    nextCallAt('normal', 0, r1, true, { premier: 5 });
    nextCallAt('normal', 0, r2, true);
    expect(r1.next()).toBe(r2.next());
  });

  it('en calme, ni casseurs ni manifestation sauvage avant 900 s (ni après) ; agité : toutes les natures', () => {
    const rng = createRng(3).fork('k');
    for (let i = 0; i < 400; i++) {
      const k = pickKind('calme', ALL, rng, { elapsed: i * 2, sauvageActive: false });
      expect(k === 'casseurs' || k === 'manif_sauvage').toBe(false);
    }
    for (const call of plan(5, 'calme', 5400)) expect(['casseurs', 'manif_sauvage']).not.toContain(call.kind);
    const seen = new Set<CallKind>();
    for (let i = 0; i < 400; i++) seen.add(pickKind('agite', ALL, rng, { elapsed: 100, sauvageActive: false })!);
    expect([...seen].sort()).toEqual([...CALL_KINDS].sort());
    // une seule manifestation sauvage à la fois, natures décochées jamais tirées
    for (let i = 0; i < 300; i++) {
      expect(pickKind('agite', ALL, rng, { elapsed: 2000, sauvageActive: true })).not.toBe('manif_sauvage');
      expect(pickKind('agite', { ...ALL, feux: false }, rng, { elapsed: 2000, sauvageActive: false })).not.toBe('feu');
    }
    expect(pickKind('normal', { feux: false, rassemblements: false, blocages: false, casseurs: false, manifs: false }, rng, { elapsed: 0, sauvageActive: false })).toBeNull();
  });

  it('distances respectées : 500 à 2 000 m du joueur, plus de 300 m d’un appel en cours ; un feu dans une rue', () => {
    const rng = createRng(21).fork('s');
    const busy = [{ x: HOME.x + 900, z: HOME.z }, { x: HOME.x - 700, z: HOME.z + 300 }];
    let named = 0;
    for (let i = 0; i < 300; i++) {
      const kind = CALL_KINDS[i % CALL_KINDS.length]!;
      const s = pickSpot(kind, HOME, busy, CALL_PLACES, streets(), rng);
      expect(s).not.toBeNull();
      const d = Math.hypot(s!.x - HOME.x, s!.z - HOME.z);
      expect(d).toBeGreaterThanOrEqual(SPOT_MIN);
      expect(d).toBeLessThanOrEqual(SPOT_MAX);
      for (const b of busy) expect(Math.hypot(s!.x - b.x, s!.z - b.z)).toBeGreaterThanOrEqual(SPOT_SPACING);
      if (kind === 'feu') expect(s!.named).toBe(false);
      if (s!.named) named++;
    }
    expect(named).toBeGreaterThan(30);
    // rien dans l'anneau : null
    expect(pickSpot('rassemblement', { x: 1e6, z: 1e6 }, [], CALL_PLACES, [], rng)).toBeNull();
  });

  it('effectifs par nature', () => {
    const rng = createRng(2).fork('n');
    for (let i = 0; i < 100; i++) {
      expect(callSize('feu', rng)).toBe(0);
      const r = callSize('rassemblement', rng);
      expect(r).toBeGreaterThanOrEqual(40);
      expect(r).toBeLessThanOrEqual(160);
      const m = callSize('manif_sauvage', rng);
      expect(m).toBeGreaterThanOrEqual(150);
      expect(m).toBeLessThanOrEqual(450);
    }
  });

  it('phrases radio en français, sans « undefined » ni « NaN »', () => {
    const texts: string[] = [];
    for (const kind of CALL_KINDS) {
      for (const fire of ['', 'poubelle', 'conteneur', 'vehicule'] as const) {
        for (const people of [0, 4, 47, 130, 420]) {
          for (const place of ["Place de l'Opéra", 'rue de Rivoli', '']) {
            const call = { kind, label: callLabel(kind, fire), place, people };
            texts.push(callText.annonce('BAC 75N', call, 1430), callText.annonce('TV 75-09', call, 320), callText.direct('TV 75-03', call),
              callText.terminee('BAC 75N', call), callText.notification(call, 1430), callText.notification(call, 640));
          }
        }
      }
    }
    const call = { kind: 'rassemblement' as const, label: 'Rassemblement non déclaré', place: "Place de l'Opéra", people: 120 };
    for (const k of ['patrouille', 'compagnie', 'pompiers', 'samu'] as const) texts.push(callText.renfort('BAC 75N', call, k), callText.renfortReponse(k, 'TV 75-09'), callText.renfortReponse(k));
    texts.push(callText.acceptee('BAC 75N', call), callText.confiee('TV 75-09'), callText.declinee(call), callText.surPlace('BAC 75N', call),
      callText.finIntervention('BAC 75N', call), callText.finVacation('BAC 75N'), callText.relais('BAC 75N', call));
    for (const t of texts) {
      expect(t).not.toMatch(/undefined|NaN|null|\[object/);
      expect(t.trim().length).toBeGreaterThan(8);
    }
    expect(callText.annonce('BAC 75N', call, 1400)).toBe(
      'BAC 75N de CENTRAL : rassemblement non déclaré, place de l\'Opéra, une centaine de personnes, la tension monte. Vous êtes à un kilomètre quatre. Pouvez-vous prendre ?');
    expect(callText.confiee('TV 75-09')).toBe('Reçu, TV 75-09 prend.');
    expect(callText.finVacation('BAC 75N')).toBe('BAC 75N, fin de vacation, regagnez le service.');
    expect(callText.notification(call, 1400)).toBe('Rassemblement non déclaré — Place de l\'Opéra · ~120 pers. · 1,4 km');
    expect(callText.annonce('BAC 75N', { kind: 'casseurs', label: 'Groupe de casseurs', place: 'rue de Rivoli', people: 22 }, 800))
      .toContain('groupe d’une vingtaine d’individus cagoulés, rue de Rivoli');
  });
});
