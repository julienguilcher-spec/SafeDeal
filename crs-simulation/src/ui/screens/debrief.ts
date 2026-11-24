/* =====================================================================================
 * Écran « debrief » — compte rendu d'opération.
 * Lit, s'ils existent, le dossier juridique ('law.records' : score de régularité, emplois de la
 * force, interpellations, suites encourues) et le résultat de mission ('missions'). À défaut, un
 * résumé minimal de la session : durée, foule (ctx.director.stats), journal de la force
 * (ctx.law.forceLog), objectifs (EXT.objectives).
 * Après une mission jouée en mode carrière, un encart reprend le bilan de carrière ('career' :
 * promotion, chapitre terminé, missions restant à réussir, sanction inscrite).
 * Une ligne rappelle que la partie est inscrite dans l'historique ('history'), avec un accès à l'écran.
 * Fin d'une vacation (mode Patrouille, service 'patrol.mode') : titre « Fin de vacation — <indicatif> », puis le
 * bilan de la vacation (durée, appels reçus, pris, réglés, confiés, interpellations, blessés) et la liste des appels,
 * avant les sections habituelles. « Rejouer » relance la même vacation (même configuration, même graine).
 * ===================================================================================== */

import type { ForceVerdictKind, GameContext } from '@/core/contracts';
import type { ScreenInstance } from '@/core/extensions';
import type { ArrestRecord, LawRecords, LawStats, SanctionLevel } from '@/gameplay/law/api';
import { vanWords } from '../command/direct/words';
import { PATROL_MODE_SERVICE, readVacation } from '@/gameplay/patrols/model';
import type { PatrolModeApi } from '@/gameplay/patrols/model';
import type { MissionResultLike } from '../core/api';
import { el, h } from '../core/dom';
import { capitalize, durationLabel, hourLabel, int } from '../core/format';
import type { UiEnv } from '../core/kit';
import { sortObjectives } from '../hud/objectives';
import { callOutcome, callRecap, debriefTitle, summaryLines } from '../patrol/format';
import { isPoliceRole } from '../hud/model';
import { rankLabel } from './catalog';
import { readHistory } from './history';
import { readCareer } from './home-career';
import { draftFromConfig, identityLabel } from './scenario';
import { readMissionResult } from './services';

const VERDICT_LABELS: Readonly<Record<ForceVerdictKind, string>> = {
  licite: 'Licites',
  disproportionne: 'Disproportionnés',
  sans_sommation: 'Sans sommation',
  non_autorise: 'Non autorisés',
  cible_illegitime: 'Cible illégitime',
  interdit: 'Interdits',
};

const SANCTION_LABELS: Readonly<Record<SanctionLevel, string>> = {
  aucune: 'Aucune suite',
  avertissement: 'Avertissement',
  blame: 'Blâme',
  exclusion: 'Exclusion temporaire',
  retrogradation: 'Rétrogradation',
  revocation: 'Révocation',
};

export function scoreTone(score: number): 'ok' | 'warn' | 'alert' {
  return score >= 70 ? 'ok' : score >= 40 ? 'warn' : 'alert';
}

export function scoreMention(score: number): string {
  if (score >= 90) return 'Exemplaire';
  if (score >= 70) return 'Satisfaisant';
  if (score >= 40) return 'Insuffisant';
  return 'Fautif';
}

/** Décompte des emplois de la force du journal du contrat, par verdict. */
export function countVerdicts(ctx: GameContext, byId: number): { total: number; faults: number; byKind: Partial<Record<ForceVerdictKind, number>> } {
  const byKind: Partial<Record<ForceVerdictKind, number>> = {};
  let total = 0;
  let faults = 0;
  for (const r of ctx.law.forceLog) {
    if (byId !== 0 && r.byId !== byId) continue;
    total++;
    byKind[r.verdict.kind] = (byKind[r.verdict.kind] ?? 0) + 1;
    if (r.verdict.kind !== 'licite') faults++;
  }
  return { total, faults, byKind };
}

/** « au commissariat du 3e », « à la préfecture de police » (nom du lieu de dépôt du dossier). */
function atStation(station: string): string {
  return /^(préfecture|caserne)/i.test(station) ? `à la ${station}` : `au ${station}`;
}

/** « dans le fourgon cellulaire 2 », « dans le fourgon de CRS » (véhicule de la remise). */
function inVehicle(name: string): string {
  if (/cellulaire/i.test(name)) return `dans le ${vanWords(name)}`;
  const t = name.trim();
  const low = t.length > 1 && t[1] === t[1]!.toLocaleLowerCase('fr-FR') ? t.charAt(0).toLocaleLowerCase('fr-FR') + t.slice(1) : t;
  if (/^[aeéiouh]/i.test(low)) return `dans l’${low}`;
  return /^(voiture|moto|camionnette|fourgonnette)/i.test(low) ? `dans la ${low}` : `dans le ${low}`;
}

/**
 * Où sont les interpellés de l'opération, toutes unités comprises (plan ordres-directs §5.6) : « 9 — 8 déposés au
 * commissariat du 3e, 1 dans le fourgon cellulaire 2 ». Les comptes sont ceux du dossier (law.records), un par
 * interpellation. Chaîne vide sans interpellation. Fonction pure.
 */
export function detaineesLine(list: readonly Pick<ArrestRecord, 'status' | 'station' | 'vehicleName'>[]): string {
  if (list.length === 0) return '';
  const where = new Map<string, number>();
  const add = (k: string): void => { where.set(k, (where.get(k) ?? 0) + 1); };
  const plural = (n: number, one: string, many: string): string => `${n} ${n > 1 ? many : one}`;
  for (const r of list) {
    switch (r.status) {
      case 'depose': add(`d|${r.station !== '' ? r.station : 'commissariat'}`); break;
      case 'remis_vehicule': add(`v|${r.vehicleName !== '' ? r.vehicleName : 'véhicule de police'}`); break;
      case 'remis': add('p|'); break;
      case 'en_cours': add('c|'); break;
      case 'relache': add('r|'); break;
      case 'evade': add('e|'); break;
      default: add('i|'); break;
    }
  }
  // déposés d'abord, puis à bord des véhicules, puis le reste (ordre fixe)
  const parts: string[] = [];
  const keys = [...where.keys()];
  const rank = (k: string): number => 'dvpcrei'.indexOf(k.charAt(0));
  keys.sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
  for (const k of keys) {
    const n = where.get(k)!;
    const what = k.slice(2);
    switch (k.charAt(0)) {
      case 'd': parts.push(`${plural(n, 'déposé', 'déposés')} ${atStation(what)}`); break;
      case 'v': parts.push(`${n} ${inVehicle(what)}`); break;
      case 'p': parts.push(`${plural(n, 'remis', 'remis')} à un point de regroupement`); break;
      case 'c': parts.push(`${plural(n, 'en cours', 'en cours')} d’interpellation`); break;
      case 'r': parts.push(plural(n, 'relâché', 'relâchés')); break;
      case 'e': parts.push(plural(n, 'évadé', 'évadés')); break;
      default: parts.push(plural(n, 'interpellation interrompue', 'interpellations interrompues')); break;
    }
  }
  return `${list.length} — ${parts.join(', ')}`;
}

function tile(label: string, value: string): HTMLElement {
  return el('div', 'ui-tile', h('b', undefined, label), h('span', undefined, value));
}

function line(label: string, value: string, note?: string, delta?: number): HTMLElement {
  const v = h('span', 'ui-line__value', value);
  if (delta !== undefined && delta > 0) v.classList.add('is-plus');
  if (delta !== undefined && delta < 0) v.classList.add('is-minus');
  const row = el('div', 'ui-line', h('span', undefined, label), v);
  if (note) row.append(h('span', 'ui-line__note', note));
  return row;
}

export function createDebrief(env: UiEnv): (host: HTMLElement) => ScreenInstance {
  const { ctx, widgets } = env;
  return (host: HTMLElement): ScreenInstance => {
    const config = ctx.session.config;
    const playerId = ctx.player.state.personId;
    const role = config ? config.role : ctx.player.state.role;
    const police = isPoliceRole(role);
    const records = ctx.service<LawRecords>('law.records');
    const mission: MissionResultLike | null = readMissionResult(ctx.service('missions'));
    // vacation (mode Patrouille) : compte rendu du répartiteur de CENTRAL
    const patrol = config && readVacation(config) ? ctx.service<PatrolModeApi>(PATROL_MODE_SERVICE) : undefined;
    const vacation = patrol && typeof patrol.summary === 'function' && patrol.active ? patrol : null;

    const wrap = h('div', 'ui-window-wrap');
    const win = h('div', 'ui-panel ui-panel--flag ui-window ui-debrief');
    win.setAttribute('aria-label', 'Compte rendu d’opération');

    // ── en-tête ──
    const place = config ? capitalize(config.place || 'Paris') : 'Paris';
    const who = config ? identityLabel(draftFromConfig(config)) : '';
    const title = vacation ? debriefTitle(vacation.callsign) : mission && mission.title ? mission.title : place;
    const subParts = [who, mission && mission.title ? place : vacation ? `départ : ${place}` : '', config ? `début à ${hourLabel(config.timeOfDay)}` : '', `${durationLabel(ctx.clock.now)} de jeu`];
    const kicker = vacation ? 'Compte rendu de vacation' : 'Compte rendu d’opération';
    const titles = el('div', 'ui-debrief__titles', h('div', 'ui-kicker', kicker), h('h2', 'ui-title', title), h('p', 'ui-sub', subParts.filter((x) => x).join(' · ')));
    const head = el('div', 'ui-debrief__head', titles);

    let stats: LawStats | null = null;
    let lawSummary = '';
    // interpellés de toute l'opération (toutes unités) : où ils sont à la fin (commissariat, fourgon cellulaire)
    let arrests: readonly ArrestRecord[] = [];
    if (records) {
      try {
        stats = records.stats(police && playerId !== 0 ? playerId : undefined);
        lawSummary = records.summary(police && playerId !== 0 ? playerId : undefined);
        arrests = Array.isArray(records.interpellations) ? records.interpellations : [];
      } catch (err) {
        console.error('[ui] lecture du dossier juridique impossible', err);
      }
    }
    // note affichée : celle de la mission si elle existe, sinon la régularité juridique (forces de l'ordre)
    const score = mission && mission.score !== undefined ? mission.score : stats && police ? stats.score : undefined;
    if (score !== undefined) {
      const badge = el('div', 'ui-score', h('b', undefined, String(Math.round(score))), h('span', undefined, mission && mission.grade ? mission.grade : scoreMention(score)));
      badge.dataset.tone = scoreTone(score);
      badge.setAttribute('aria-label', `Note : ${Math.round(score)} sur 100`);
      head.append(badge);
    } else if (mission && mission.success !== undefined) {
      const badge = el('div', 'ui-score', h('b', undefined, mission.success ? 'Réussie' : 'Échouée'), h('span', undefined, 'Mission'));
      badge.dataset.tone = mission.success ? 'ok' : 'alert';
      head.append(badge);
    }

    // ── corps ──
    const body = h('div', 'ui-debrief__body ui-scroll');
    body.tabIndex = -1;
    const left = h('div', 'ui-debrief__col');
    const right = h('div', 'ui-debrief__col');

    // bilan de la vacation (mode Patrouille) : avant les sections habituelles
    if (vacation) {
      left.append(widgets.sectionTitle('Bilan de la vacation'));
      const recap = h('div', 'ui-lines');
      recap.dataset.id = 'debrief-vacation';
      for (const l of summaryLines(vacation.summary())) recap.append(line(l.label, l.value, l.note || undefined));
      left.append(recap);
      const calls = vacation.calls;
      if (calls.length > 0) {
        left.append(widgets.sectionTitle('Appels de la vacation'));
        const list = h('div', 'ui-lines');
        list.dataset.id = 'debrief-appels';
        for (const call of calls) list.append(line(callRecap(call), '', callOutcome(call, vacation.callsign)));
        left.append(list);
      }
    }

    // bilan de la manifestation principale ; pas en vacation : sans cortège principal (foule en veille), ses compteurs
    // resteraient à zéro, et le bilan de la vacation donne déjà durée, interpellations et blessés
    const c = ctx.director.stats;
    if (!vacation) {
      const tiles = h('div', 'ui-tiles');
      tiles.append(
        tile('Durée', durationLabel(ctx.clock.now)),
        tile('Manifestants', int(c.total)),
        tile('Dispersés', int(c.dispersed)),
        tile('Blessés', int(c.injured)),
        tile('Interpellés', int(records ? arrests.length : c.arrested)),
        tile('Radicaux', int(c.radicals)),
      );
      left.append(widgets.sectionTitle('Bilan de la manifestation'), tiles);
    }
    // les interpellés : combien au commissariat, combien encore dans un fourgon (mêmes comptes que le dossier)
    const where = detaineesLine(arrests);
    if (where !== '') {
      const p = h('p', 'ui-para', `Interpellés : ${where}.`);
      p.dataset.id = 'debrief-interpelles';
      p.style.marginTop = '10px';
      left.append(p);
    }
    if (mission && mission.summary) {
      const p = h('p', 'ui-para', mission.summary);
      p.style.marginTop = '10px';
      left.append(p);
    }

    // carrière : bilan du résultat qui vient d'être enregistré (mode carrière seulement)
    const career = config && config.mode === 'carriere' ? readCareer(ctx) : null;
    const outcome = career ? career.last : null;
    if (career && outcome && outcome.missionId === config!.missionId) {
      left.append(widgets.sectionTitle('Carrière'));
      const lines = h('div', 'ui-lines');
      lines.append(line('Grade', rankLabel(career.progress.rank), outcome.promoted ? 'Promotion' : undefined, outcome.promoted ? 1 : undefined));
      lines.append(line('Note retenue', outcome.grade, outcome.success ? 'Mission réussie' : 'Mission non réussie', outcome.success ? 1 : -1));
      left.append(lines);
      const p = h('p', 'ui-para', outcome.message);
      p.dataset.id = 'debrief-carriere';
      p.style.marginTop = '8px';
      left.append(p);
      if (env.kit.hasScreen('carriere')) {
        const open = widgets.button('Voir la carrière', () => ctx.ui.open('carriere'), 'ghost', 'chevrons');
        open.dataset.id = 'debrief-carriere-ouvrir';
        open.style.marginTop = '6px';
        left.append(open);
      }
    }

    // historique : la partie y est inscrite à sa fin (session:ended suit de près l'ouverture du compte rendu)
    const history = readHistory(ctx);
    if (history && history.willRecord()) {
      const note = h('p', 'ui-para', 'Partie enregistrée dans l’historique.');
      note.dataset.id = 'debrief-historique';
      note.style.marginTop = '10px';
      note.style.opacity = '.8';
      left.append(note);
      if (env.kit.hasScreen('historique')) {
        const open = widgets.button('Voir l’historique', () => ctx.ui.open('historique'), 'ghost', 'clock');
        open.dataset.id = 'debrief-historique-ouvrir';
        open.style.marginTop = '4px';
        left.append(open);
      }
    }

    // objectifs
    const objectives = sortObjectives(env.objectives.list);
    if (objectives.length > 0) {
      left.append(widgets.sectionTitle('Objectifs'));
      const ol = h('div', 'ui-objlist');
      for (const o of objectives) {
        const state = o.state === 'reussi' ? 'atteint' : o.state === 'echoue' ? 'manqué' : 'non terminé';
        const row = el('div', 'ui-objlist__row', h('span', 'ui-objlist__dot'), h('span', undefined, `${o.text} — ${state}`));
        if (o.state === 'reussi') row.classList.add('is-done');
        if (o.state === 'echoue') row.classList.add('is-failed');
        if (o.secondary) row.classList.add('is-secondary');
        ol.append(row);
      }
      left.append(ol);
    }

    // détail de la mission
    if (mission && mission.lines && mission.lines.length > 0) {
      left.append(widgets.sectionTitle('Évaluation'));
      const lines = h('div', 'ui-lines');
      for (const l of mission.lines) lines.append(line(l.label, typeof l.value === 'number' ? int(l.value) : l.value, l.note, l.delta));
      left.append(lines);
    }

    // emploi de la force et suites
    right.append(widgets.sectionTitle(police ? 'Emploi de la force' : 'Emploi de la force par les unités'));
    const lines = h('div', 'ui-lines');
    if (stats) {
      lines.append(
        line('Sommations prononcées', int(stats.sommations)),
        line('Actes de force', int(stats.forces), stats.faults > 0 ? `dont ${int(stats.faults)} hors cadre${stats.filmedFaults > 0 ? `, ${int(stats.filmedFaults)} ${stats.filmedFaults > 1 ? 'filmés' : 'filmé'} par des tiers` : ''}` : 'tous dans le cadre légal', stats.faults > 0 ? -1 : 1),
        line('Interpellations', int(stats.arrests), stats.arrests > 0 ? `${int(stats.founded)} ${stats.founded > 1 ? 'fondées' : 'fondée'}, ${int(stats.unfounded)} sans fait établi` : undefined, stats.unfounded > 0 ? -1 : undefined),
        line('Plaintes probables', int(stats.complaints), undefined, stats.complaints > 0 ? -1 : undefined),
      );
      if (police) {
        lines.append(
          line('Régularité', `${Math.round(stats.score)}/100`, undefined, stats.score >= 70 ? 1 : -1),
          line('Suites encourues', SANCTION_LABELS[stats.sanction] ?? stats.sanction, stats.inquiry ? 'Une enquête de l’inspection est probable.' : undefined, stats.sanction === 'aucune' ? 1 : -1),
        );
      }
    } else {
      const v = countVerdicts(ctx, police ? playerId : 0);
      const roe = ctx.law.roe;
      lines.append(line('Sommations prononcées', `${roe.sommation}/3`));
      lines.append(line('Actes de force déclarés', int(v.total), v.total === 0 ? 'Aucun emploi de la force n’a été enregistré.' : v.faults === 0 ? 'tous dans le cadre légal' : `dont ${int(v.faults)} hors cadre`, v.faults > 0 ? -1 : 1));
      for (const kind of Object.keys(VERDICT_LABELS) as ForceVerdictKind[]) {
        const n = v.byKind[kind];
        if (!n || kind === 'licite') continue;
        lines.append(line(VERDICT_LABELS[kind], int(n), undefined, -1));
      }
    }
    right.append(lines);
    if (lawSummary) {
      const p = h('p', 'ui-para', lawSummary);
      p.style.marginTop = '10px';
      p.style.whiteSpace = 'pre-line';
      right.append(p);
    } else if (!records) {
      const p = h('p', 'ui-para', 'Résumé établi sur les seules données de la session : le dossier juridique détaillé (verdicts, procédures, suites disciplinaires) n’est pas disponible dans cette version.');
      p.style.marginTop = '10px';
      right.append(p);
    }
    body.append(left, right);

    // ── pied ──
    const again = widgets.button(vacation ? 'Reprendre la même vacation' : 'Rejouer ce scénario', () => {
      const cfg = ctx.session.config;
      if (!cfg) return;
      ctx.session.start({ ...cfg }).catch((err: unknown) => {
        console.error('[ui] redémarrage impossible', err);
        ctx.ui.notify('Le scénario n’a pas pu être relancé.', 'alert');
      });
    }, 'secondary', 'restart');
    again.dataset.id = 'debrief-rejouer';
    again.disabled = !config;
    const home = widgets.button('Retour à l’accueil', () => ctx.session.end(false), 'primary', 'exit');
    home.dataset.id = 'debrief-accueil';
    home.setAttribute('data-autofocus', '');
    const foot = el('div', 'ui-window__foot', again, home);
    win.append(head, body, foot);
    wrap.append(win);
    host.append(wrap);

    return {
      back(): boolean {
        return true; // on quitte le compte rendu par l'un de ses deux boutons
      },
      dispose(): void {
        wrap.remove();
      },
    };
  };
}
