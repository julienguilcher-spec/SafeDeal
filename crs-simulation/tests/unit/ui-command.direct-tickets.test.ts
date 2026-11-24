// Ordres directs — les TICKETS (tickets.ts) et la LIGNE D'UNITÉ (state.ts) : chaque état d'un ordre du joueur et son
// texte exact, depuis des instantanés de la simulation écrits à la main (le moteur P8 les lira dans la partie).
import { describe, expect, it } from 'vitest';

import {
  emptySnapshot, expired, newTicket, next, readiness, ticketText, type Ticket, type TicketSnapshot,
} from '@/ui/command/direct/tickets';
import { groupSummary, unitLine, type UnitLineSnapshot } from '@/ui/command/direct/state';
import { durationText, distText } from '@/ui/command/direct/words';

const snap = (over: Partial<TicketSnapshot> = {}): TicketSnapshot => ({ ...emptySnapshot(), agents: 19, distance: 40, ...over });

/** Avance un ticket sur une suite d'instantanés (t, instantané). */
function run(t: Ticket, steps: readonly [number, Partial<TicketSnapshot>][]): Ticket {
  let cur = t;
  for (const [now, s] of steps) cur = next(cur, snap(s), now);
  return cur;
}

const bloquer = (): Ticket => newTicket(1, 31, 'MISTRAL 2', 'bloquer', 'couper_circulation', 'Rue de Rivoli', 100);

describe('tickets : un état par ordre du joueur, texte exact', () => {
  it('reçu au moment même de l’ordre, une seconde', () => {
    const t = bloquer();
    expect(t.state).toBe('recu');
    expect(t.place).toBe('rue de Rivoli');
    expect(ticketText(t)).toBe('MISTRAL 2 · Bloquer rue de Rivoli · reçu');
    // même avec des agents assis, « reçu » d'abord
    const r = next(t, snap({ seated: 6, seatedPerVehicle: [6] }), 100.5);
    expect(r.state).toBe('recu');
  });

  it('attente : assis dans les fourgons, prêt dans (assis du véhicule le plus chargé × 0,35 s + 1 s)', () => {
    const t = next(bloquer(), snap({ seated: 12, seatedPerVehicle: [8, 4] }), 101.2);
    expect(t.state).toBe('attente');
    expect(t.eta).toBeCloseTo(8 * 0.35 + 1, 5);
    expect(ticketText(t)).toBe('MISTRAL 2 · Bloquer · descend des fourgons — prêt dans 4\u00a0s');
    // au débarquement d'une colonne : le compte des agents déjà dehors
    const c = next(bloquer(), snap({ seated: 13, seatedPerVehicle: [7, 6], convoy: { stage: 'debarquement', remaining: 0, waitLeft: 0 } }), 101.2);
    expect(ticketText(c)).toBe('MISTRAL 2 · Bloquer · descend des fourgons (6/19) — prêt dans 4\u00a0s');
    // stationnement : « se garent », au plus 10 s
    const p = next(bloquer(), snap({ seated: 19, seatedPerVehicle: [7, 6, 6], convoy: { stage: 'stationnement', remaining: 0, waitLeft: 45 } }), 101.2);
    expect(ticketText(p)).toBe('MISTRAL 2 · Bloquer · se garent — prêt dans 10\u00a0s');
    // BRAV-M qui remonte sur ses motos
    const b = next(newTicket(2, 39, 'FAUCON 1', 'envoyer', 'colonne', 'carrefour Voltaire', 0), snap({ bravm: { stage: 'remontee', eta: -1 } }), 1.5);
    expect(ticketText(b)).toBe('FAUCON 1 · Envoyer · remonte sur les motos — prêt dans 6\u00a0s');
  });

  it('BRAV-M qui roule vers le point : « en selle », jamais « descend des motos — prêt dans … »', () => {
    const t = newTicket(2, 39, 'FAUCON 1', 'envoyer', 'colonne', 'carrefour Voltaire', 0);
    // en selle, colonne en route : elle est assise parce qu'elle y va à moto
    const r = next(t, snap({ agents: 11, seated: 5, seatedOnMotos: 5, seatedPerVehicle: [1, 1, 1, 1, 1], distance: 320, bravm: { stage: 'route', eta: -1 } }), 1.5);
    expect(r.state).toBe('route');
    expect(ticketText(r)).toBe('FAUCON 1 · Envoyer\u00a0: carrefour Voltaire · en selle — 320\u00a0m');
    // pied à terre ordonné (une autre étape) : là, elle descend des motos
    const d = next(t, snap({ agents: 11, seated: 5, seatedOnMotos: 5, seatedPerVehicle: [1, 1, 1, 1, 1], bravm: { stage: 'pied_a_terre', eta: -1 } }), 1.5);
    expect(ticketText(d)).toMatch(/^FAUCON 1 · Envoyer · descend des motos — prêt dans /);
  });

  it('retour après une interpellation : « revient avec vous », puis « avec vous ✓ » (§3.2)', () => {
    const back: Ticket = { ...newTicket(5, 39, 'FAUCON 1 1', 'avec_moi', 'suivre', '', 200), back: true };
    expect(ticketText(back)).toBe('FAUCON 1 1 · revient avec vous');
    const walking = next(back, snap({ agents: 6, moving: 5, distance: 40 }), 201.5);
    expect(walking.state).toBe('route');
    expect(ticketText(walking)).toBe('FAUCON 1 1 · revient avec vous');
    const done = next(walking, snap({ done: { ok: true, reason: '' } }), 204);
    expect(ticketText(done)).toBe('FAUCON 1 1 · avec vous ✓');
    // « Avec moi » donné par le joueur : la ligne ordinaire
    expect(ticketText(newTicket(6, 39, 'FAUCON 1 1', 'avec_moi', 'suivre', '', 200))).toBe('FAUCON 1 1 · Avec moi · reçu');
  });

  it('chaque attente a une raison et un délai de 10 s au plus (hors trajet en véhicules)', () => {
    const cases: Partial<TicketSnapshot>[] = [
      { seated: 19, seatedPerVehicle: [7, 6, 6] },
      { seated: 19, seatedPerVehicle: [7, 6, 6], convoy: { stage: 'stationnement', remaining: 0, waitLeft: 300 } },
      { bravm: { stage: 'remontee', eta: -1 } },
    ];
    for (const c of cases) {
      const r = readiness(snap(c))!;
      expect(r.state).toBe('attente');
      expect(r.reason.length).toBeGreaterThan(3);
      expect(r.eta).toBeGreaterThan(0);
      expect(r.eta).toBeLessThanOrEqual(10);
    }
  });

  it('route : 20 % des agents en marche, distance restante ; en colonne, le trajet ; à l’arrivée d’une colonne', () => {
    const t = run(bloquer(), [[101.1, { moving: 3 }], [101.5, { moving: 5, distance: 38 }]]);
    expect(t.state).toBe('route');
    expect(ticketText(t)).toBe('MISTRAL 2 · Bloquer rue de Rivoli · en route — 40\u00a0m');
    const c = next(bloquer(), snap({ seated: 19, seatedPerVehicle: [7, 6, 6], convoy: { stage: 'route', remaining: 630, waitLeft: 0 } }), 102);
    expect(ticketText(c)).toBe('MISTRAL 2 · Bloquer rue de Rivoli · en fourgons — 1\u00a0min\u00a010');
    const q = next(bloquer(), snap({ queued: { eta: 80 } }), 102);
    expect(ticketText(q)).toBe('MISTRAL 2 · Bloquer rue de Rivoli · à l’arrivée — 1\u00a0min\u00a020');
    // personne ne bouge encore après la seconde de « reçu » : « en route » (formation sur place), jamais « sans ordre »
    const idle = next(bloquer(), snap({ moving: 0 }), 101.5);
    expect(idle.state).toBe('route');
  });

  it('action : poursuite d’une interpellation', () => {
    const t = next(newTicket(3, 39, 'BRAV-M', 'interpeller', 'interpeller', '', 0), snap({ action: { kind: 'poursuite', distance: 12 } }), 3);
    expect(t.state).toBe('action');
    expect(ticketText(t)).toBe('BRAV-M · Interpeller · poursuite — 12\u00a0m');
  });

  it('en place ✓ pendant 6 s, puis retiré', () => {
    const t = next(bloquer(), snap({ done: { ok: true, reason: '' } }), 130);
    expect(t.state).toBe('en_place');
    expect(ticketText(t)).toBe('MISTRAL 2 · rue de Rivoli barrée ✓');
    expect(expired(t, 135.9)).toBe(false);
    expect(expired(t, 136)).toBe(true);
    const go = next(newTicket(4, 39, 'FAUCON 1', 'envoyer', 'colonne', 'Carrefour Voltaire', 0), snap({ done: { ok: true, reason: '' } }), 50);
    expect(ticketText(go)).toBe('FAUCON 1 · au carrefour Voltaire ✓');
    // un ticket fini ne revient pas en arrière
    expect(next(t, snap({ moving: 19 }), 131).state).toBe('en_place');
  });

  it('bloqué (surveillance) : la raison et « ils finissent à pied »', () => {
    const t = next(bloquer(), snap({ blocked: 'la route est barrée' }), 120);
    expect(t.state).toBe('bloque');
    expect(ticketText(t)).toBe('MISTRAL 2 · bloqué\u00a0: la route est barrée — ils finissent à pied');
  });

  it('refusé : la phrase « X ne peut pas : … U : une autre unité. », 6 s', () => {
    const t = next(bloquer(), snap({ refused: 'Aucun itinéraire.' }), 100.2);
    expect(t.state).toBe('refuse');
    expect(ticketText(t)).toBe('MISTRAL 2 ne peut pas\u00a0: aucun chemin pour y aller. U\u00a0: une autre unité.');
    const f = next(bloquer(), snap({ done: { ok: false, reason: 'Individu hors d’atteinte.' } }), 110);
    expect(ticketText(f)).toBe('MISTRAL 2 ne peut pas\u00a0: l’individu est hors d’atteinte. U\u00a0: une autre unité.');
    expect(expired(f, 116)).toBe(true);
  });

  it('remplacé par un nouvel ordre : retiré tout de suite', () => {
    const t = next(bloquer(), snap({ replaced: true }), 104);
    expect(t.state).toBe('remplace');
    expect(ticketText(t)).toBe('');
    expect(expired(t, 104)).toBe(true);
  });

  it('distances et durées en clair', () => {
    expect(distText(7.4)).toBe('7\u00a0m');
    expect(distText(37)).toBe('35\u00a0m');
    expect(distText(404)).toBe('400\u00a0m');
    expect(distText(1240)).toBe('1,2\u00a0km');
    expect(durationText(4.2)).toBe('5\u00a0s');
    expect(durationText(70)).toBe('1\u00a0min\u00a010');
    expect(durationText(120)).toBe('2\u00a0min');
  });
});

const line = (over: Partial<UnitLineSnapshot>): UnitLineSnapshot => ({
  name: 'MISTRAL 2', commanded: true, playerVerb: null, place: '', done: false, ticket: null, followsPlayer: false, vehicles: null,
  playerMoving: false, playerStoppedFor: 0, crowdNear: false, returning: false, simTag: '', ...over,
});

describe('ligne d’unité : jamais « sans ordre » pour une unité sous ses ordres', () => {
  it('avec vous : vous suivent / en ligne face à la foule / en garde / montée / colonne', () => {
    expect(unitLine(line({ followsPlayer: true, playerMoving: true }))).toBe('AVEC VOUS · vous suivent');
    expect(unitLine(line({ followsPlayer: true, playerStoppedFor: 4, crowdNear: true }))).toBe('AVEC VOUS · en ligne face à la foule');
    expect(unitLine(line({ followsPlayer: true, playerStoppedFor: 4 }))).toBe('AVEC VOUS · en garde autour de vous');
    expect(unitLine(line({ followsPlayer: true, playerStoppedFor: 1 }))).toBe('AVEC VOUS · vous suivent');
    expect(unitLine(line({ followsPlayer: true, vehicles: { boarded: 14, total: 19, driving: false } }))).toBe('AVEC VOUS · montent dans les fourgons (14/19)');
    expect(unitLine(line({ followsPlayer: true, vehicles: { boarded: 19, total: 19, driving: true } }))).toBe('AVEC VOUS · en colonne derrière vous');
  });

  it('un ordre du joueur : le ticket vivant, puis l’étiquette', () => {
    const t = newTicket(1, 31, 'MISTRAL 2', 'bloquer', 'couper_circulation', 'rue de Rivoli', 0);
    expect(unitLine(line({ playerVerb: 'bloquer', place: 'rue de Rivoli', ticket: t }))).toBe('MISTRAL 2 · Bloquer rue de Rivoli · reçu');
    expect(unitLine(line({ playerVerb: 'bloquer', place: 'rue de Rivoli', done: true }))).toBe('MISTRAL 2 · barre rue de Rivoli');
    expect(unitLine(line({ name: 'FAUCON 1', playerVerb: 'envoyer', place: 'carrefour Voltaire', done: true }))).toBe('FAUCON 1 · au carrefour Voltaire · attend vos ordres');
    expect(unitLine(line({ playerVerb: 'libre' }))).toBe('MISTRAL 2 · agissent seuls');
    expect(unitLine(line({ name: 'BRAV-M', returning: true }))).toBe('BRAV-M · revient avec vous');
    expect(unitLine(line({}))).toBe('MISTRAL 2 · attend vos ordres');
    // « SANS ORDRE » seulement pour une unité qu'il ne commande pas
    expect(unitLine(line({ commanded: false }))).toBe('MISTRAL 2 · SANS ORDRE');
    for (const s of [line({}), line({ followsPlayer: true }), line({ playerVerb: 'tenir', done: true })]) expect(unitLine(s)).not.toMatch(/SANS ORDRE|MONTE|DESCEND|EN FILE/);
  });

  it('résumé du groupe : « AVEC VOUS · 3 sections + BRAV-M · en ligne face à la foule »', () => {
    const units = [
      { symbol: 'section', avecVous: true }, { symbol: 'section', avecVous: true }, { symbol: 'section', avecVous: true },
      { symbol: 'bravm', avecVous: true }, { symbol: 'centaure', avecVous: false },
    ];
    expect(groupSummary(units, 'face_foule')).toBe('AVEC VOUS · 3 sections + BRAV-M · en ligne face à la foule');
    expect(groupSummary([{ symbol: 'section', avecVous: true }], 'suivent')).toBe('AVEC VOUS · 1 section · vous suivent');
    expect(groupSummary([{ symbol: 'section', avecVous: false }], 'suivent')).toBe('');
  });
});

describe('mots des interpellés et des fourgons cellulaires (§5)', () => {
  it('l’écran dit « fourgon cellulaire », la radio garde l’indicatif', async () => {
    const { CUSTODY_TEXTS, DETAINEE_GUIDANCE, vanLabelText, vanWords, ownUnitAboardText } = await import('@/ui/command/direct/words');
    expect(vanWords('CELLULAIRE 1')).toBe('fourgon cellulaire 1');
    expect(vanLabelText('CELLULAIRE 1', 3, 8, true)).toBe('Fourgon cellulaire 1 — pour les interpellés');
    expect(vanLabelText('CELLULAIRE 1', 3, 8, false)).toBe('CELLULAIRE 1 · 3/8');
    expect(vanLabelText('CELLULAIRE 1', 8, 8, false)).toBe('COMPLET — part au commissariat');
    expect(DETAINEE_GUIDANCE.confier('MISTRAL 2 ALFA', 15)).toBe('Interpellé. E : le confier à MISTRAL 2 ALFA (15 m)');
    expect(DETAINEE_GUIDANCE.emmener('CELLULAIRE 1', 70)).toBe('Interpellé. E : l’emmener au fourgon cellulaire 1 (70 m, flèche)');
    expect(DETAINEE_GUIDANCE.faireVenir('CELLULAIRE 1', 300)).toBe('Interpellé. E : faire venir le fourgon cellulaire 1 (300 m)');
    expect(CUSTODY_TEXTS.vanComing('CELLULAIRE 1', 40)).toBe('Fourgon cellulaire 1 vient vous chercher — 40 s');
    expect(CUSTODY_TEXTS.takeToVan('CELLULAIRE 1', 140)).toBe('Emmenez l’interpellé au fourgon cellulaire 1 — 140 m');
    expect(CUSTODY_TEXTS.departs('CELLULAIRE 1', 'commissariat du 3e', 8, 'CELLULAIRE 2', 120))
      .toBe('CELLULAIRE 1 part au commissariat du 3e avec 8 interpellés. CELLULAIRE 2 prend la remise dans 2 min.');
    expect(CUSTODY_TEXTS.stateLine(5, 'CELLULAIRE 1', 3, 8, 2)).toBe('Interpellés 5 · CELLULAIRE 1 3/8 · 2 au commissariat');
    expect(ownUnitAboardText('MISTRAL 1')).toBe('MISTRAL 1 descend — vous êtes à bord : E pour descendre');
  });
});
