/* =====================================================================================
 * Page d'accueil — « Missions spéciales » : le catalogue rangé par poste, et la fiche de briefing.
 *
 * Partie pure (sans DOM, testée sous Node) :
 *   missionsByPoste(missions)  missions groupées par poste (rôle principal de la mission ; chapitre 0 → École ;
 *                              « commissaire » → Commandant), chaque mission une seule fois, dans l'ordre des rôles ;
 *   briefingOf(mission)        ce que la fiche affiche : accroche, objectifs principaux puis secondaires, lieu, heure,
 *                              météo, durée, difficulté, rôle et grade tenus.
 * Partie interface :
 *   buildMissionsView  rail des postes (poste-<id>), liste des missions du poste (spec-<id>), fiche à droite ; au
 *                      téléphone, postes en bandeau, fiche en plein panneau avec « ← Missions » ;
 *   buildBriefingView  fiche seule (« Jouer la mission » de la carrière) : Lancer, Ajuster, Retour.
 * Les boutons de la fiche portent les data-id briefing-lancer et briefing-ajuster (une seule vue de l'accueil est
 * montée à la fois : jamais de doublon).
 * ===================================================================================== */

import type { PlayableRole } from '@/core/contracts';
import type { MissionDef } from '@/core/missions-schema';
import { missionById } from '@/gameplay/missions/catalog';
import type { MissionLike } from '../core/api';
import { clear, el, h } from '../core/dom';
import { hourLabel, int } from '../core/format';
import { icon, roleIconName } from '../core/icons';
import { DURATIONS, ROLES, roleInfo, weatherLabel } from './catalog';
import type { HomeShell, HomeViewInstance } from './home';
import { viewHead } from './home-hub';
import { identityLabel } from './scenario';

// ─────────────────────────────────────────────────────────────────────────────────────
// Partie pure
// ─────────────────────────────────────────────────────────────────────────────────────

/** Identifiant du poste des missions d'école (chapitre 0 de la carrière). */
export const ECOLE_POSTE = 'ecole';

export interface PosteGroup {
  /** 'ecole', ou l'identifiant du rôle principal (« crs », « bravm »…). */
  id: string;
  label: string;
  missions: MissionLike[];
}

/** Définition complète d'une mission du catalogue (undefined pour une mission fournie par un autre module). */
export type MissionDefLookup = (id: string) => MissionDef | undefined;

/** Poste d'une mission : École pour le chapitre 0, sinon son rôle principal (le commissaire est le commandant). */
export function posteOf(m: MissionLike, defOf: MissionDefLookup = missionById): string {
  const def = defOf(m.id);
  if (def && def.chapter === 0) return ECOLE_POSTE;
  const role: string = def ? def.role : m.roles[0] ?? 'crs';
  return role === 'commissaire' ? 'commandant' : role;
}

/** Libellé affiché d'un poste. */
export function posteGroupLabel(id: string): string {
  if (id === ECOLE_POSTE) return 'École de police';
  const known = ROLES.find((r) => r.id === id);
  if (!known) return id.charAt(0).toUpperCase() + id.slice(1).replace(/_/g, ' ');
  return id === 'secouriste' ? 'Pompiers et SAMU' : known.name;
}

/** Missions groupées par poste : École d'abord, puis les postes dans l'ordre des rôles, puis les autres. */
export function missionsByPoste(missions: readonly MissionLike[], defOf: MissionDefLookup = missionById): PosteGroup[] {
  const groups = new Map<string, PosteGroup>();
  const seen = new Set<string>();
  for (const m of missions) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    const id = posteOf(m, defOf);
    let g = groups.get(id);
    if (!g) {
      g = { id, label: posteGroupLabel(id), missions: [] };
      groups.set(id, g);
    }
    g.missions.push(m);
  }
  const order: string[] = [ECOLE_POSTE, ...ROLES.map((r) => r.id)];
  const rank = (id: string): number => {
    const i = order.indexOf(id);
    return i < 0 ? order.length : i;
  };
  return [...groups.values()].sort((a, b) => rank(a.id) - rank(b.id) || a.label.localeCompare(b.label, 'fr'));
}

export interface BriefingFact {
  label: string;
  value: string;
}

export interface Briefing {
  id: string;
  title: string;
  /** Accroche (une ou deux phrases). */
  pitch: string;
  /** Nature de la mission (« Manifestation déclarée »…), '' si inconnue. */
  type: string;
  /** Objectifs : principaux d'abord, puis secondaires. */
  objectives: { text: string; secondary: boolean }[];
  /** Difficulté 0..5 (0 : non renseignée). */
  difficulty: number;
  /** Lieu, heure, météo, durée, difficulté, rôle tenu. */
  facts: BriefingFact[];
}

/** Difficulté en étoiles (« ★★★☆☆ ») ; '' si non renseignée. */
export function stars(difficulty: number): string {
  const d = Math.max(0, Math.min(5, Math.round(difficulty)));
  return d > 0 ? '★'.repeat(d) + '☆'.repeat(5 - d) : '';
}

const DIFFICULTY_WORDS = ['', 'facile', 'abordable', 'exigeante', 'difficile', 'très difficile'];

/** Fiche de briefing d'une mission. `identity` remplace le rôle tenu calculé (grade imposé par la carrière). */
export function briefingOf(m: MissionLike, defOf: MissionDefLookup = missionById, identity = ''): Briefing {
  const def = defOf(m.id);
  const cfg = m.config ?? {};
  const objectives = def
    ? [...def.objectives.filter((o) => !o.secondary), ...def.objectives.filter((o) => o.secondary)].map((o) => ({ text: o.text, secondary: o.secondary }))
    : [];
  const place = (def && def.place) || m.place || (typeof cfg.place === 'string' ? cfg.place : '');
  const hour = def ? def.timeOfDay : typeof cfg.timeOfDay === 'number' ? cfg.timeOfDay : null;
  const weather = def ? def.weather : cfg.weather ?? null;
  const duration = def ? def.duration : cfg.duration ?? null;
  const difficulty = def ? def.difficulty : m.difficulty;
  const role: PlayableRole | null = def ? def.role : m.roles[0] ?? null;
  let who = identity;
  if (!who && role) {
    who = def
      ? identityLabel({ role: def.role === 'commissaire' ? 'commandant' : def.role, rank: def.rank, poste: def.poste, variante: def.profile ?? '' })
      : roleInfo(role).name;
  }
  const facts: BriefingFact[] = [];
  if (place) facts.push({ label: 'Lieu', value: place });
  if (hour !== null) facts.push({ label: 'Heure', value: hourLabel(hour) });
  if (weather) facts.push({ label: 'Météo', value: weatherLabel(weather) });
  const dur = DURATIONS.find((x) => x.id === duration);
  if (dur) facts.push({ label: 'Durée', value: dur.label });
  if (difficulty > 0) facts.push({ label: 'Difficulté', value: `${stars(difficulty)} ${DIFFICULTY_WORDS[Math.round(difficulty)] ?? ''}`.trim() });
  if (who) facts.push({ label: 'Vous êtes', value: who });
  return {
    id: m.id,
    title: m.title,
    pitch: (def && def.pitch) || m.summary,
    type: (def && def.type) || m.type,
    objectives,
    difficulty,
    facts,
  };
}

/** Ligne d'une mission dans la liste : lieu et heure. */
export function missionLine(m: MissionLike, defOf: MissionDefLookup = missionById): string {
  const b = briefingOf(m, defOf);
  return b.facts.filter((f) => f.label === 'Lieu' || f.label === 'Heure').map((f) => f.value).join(' · ');
}

// ─────────────────────────────────────────────────────────────────────────────────────
// Fiche
// ─────────────────────────────────────────────────────────────────────────────────────

export interface CardOptions {
  /** Mode de lancement : Missions spéciales = 'libre' ; fiche de carrière = 'carriere'. */
  mode: 'libre' | 'carriere';
  /** Raison du verrou de carrière ('' : jouable). */
  locked: string;
  /** Rôle tenu imposé (carrière) ; '' : celui de la mission. */
  identity: string;
}

/** Fiche d'une mission : accroche, objectifs, faits, « Lancer la mission », « Ajuster les réglages ». */
function buildCard(shell: HomeShell, m: MissionLike, opts: CardOptions): { el: HTMLElement; launch: HTMLButtonElement } {
  const { widgets } = shell.env;
  const b = briefingOf(m, missionById, opts.identity);
  const card = h('div', 'ui-brief');
  const head = el('div', 'ui-brief__head', h('div', 'ui-kicker', b.type || 'Mission'), h('h2', 'ui-title ui-brief__title', b.title));
  const body = h('div', 'ui-brief__body ui-scroll');
  if (b.pitch) body.append(h('p', 'ui-brief__pitch', b.pitch));
  if (opts.locked) {
    const lock = el('div', 'ui-note ui-note--warn', icon('lock'), h('span', undefined, `Verrouillée en carrière : ${opts.locked}`));
    lock.dataset.id = 'briefing-verrou';
    body.append(lock);
  }
  body.append(widgets.sectionTitle('Ce qu’on attend de vous'));
  const list = h('ul', 'ui-brief__objs');
  if (b.objectives.length === 0) list.append(h('li', undefined, 'Les objectifs vous seront donnés au début de la mission.'));
  for (const o of b.objectives) {
    const li = h('li', o.secondary ? 'is-secondary' : undefined, o.text);
    if (o.secondary) li.setAttribute('aria-label', `Objectif secondaire : ${o.text}`);
    list.append(li);
  }
  body.append(list);
  const facts = h('div', 'ui-lines ui-brief__facts');
  for (const f of b.facts) facts.append(el('div', 'ui-line', h('span', undefined, f.label), h('span', 'ui-line__value', f.value)));
  body.append(facts);

  const launch = widgets.button('Lancer la mission', () => shell.launchMission(m, opts.mode), 'primary', 'play');
  launch.dataset.id = 'briefing-lancer';
  launch.classList.add('ui-btn--block');
  if (opts.locked || shell.env.ctx.session.phase !== 'menu') launch.disabled = true;
  const adjust = widgets.button('Ajuster les réglages', () => shell.adjustMission(m, opts.mode), 'secondary', 'sliders');
  adjust.dataset.id = 'briefing-ajuster';
  adjust.classList.add('ui-btn--block');
  if (opts.locked) adjust.disabled = true;
  const foot = el('div', 'ui-brief__foot', launch, adjust);
  card.append(head, body, foot);
  return { el: card, launch };
}

// ─────────────────────────────────────────────────────────────────────────────────────
// Vue « Missions spéciales »
// ─────────────────────────────────────────────────────────────────────────────────────

/** Le téléphone (ou un écran étroit) n'affiche qu'une colonne : la fiche s'ouvre en plein panneau. */
function narrowLayout(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(max-width: 900px), (max-height: 520px)').matches;
}

export function buildMissionsView(shell: HomeShell): HomeViewInstance {
  const groups = missionsByPoste(shell.missions);
  const root = h('div', 'ui-view ui-spec');
  const total = groups.reduce((n, g) => n + g.missions.length, 0);
  const sub = total > 0
    ? `${int(total)} mission${total > 1 ? 's' : ''} rangée${total > 1 ? 's' : ''} par poste. Hors carrière : jouez-les dans l’ordre que vous voulez.`
    : 'Aucune mission n’est installée dans cette version.';
  root.append(viewHead(shell, 'Missions spéciales', sub, 'Accueil'));
  const body = h('div', 'ui-spec__body');
  root.append(body);
  if (groups.length === 0) {
    const empty = h('div', 'ui-panel ui-empty', 'Le catalogue des missions apparaîtra ici dès que le module des missions sera installé. Le Mode libre reste disponible.');
    body.append(empty);
    return { el: root };
  }

  const memory = shell.memory;
  let poste = groups.find((g) => g.id === memory.poste) ?? groups.find((g) => g.missions.some((m) => m.id === memory.missionId)) ?? groups[0]!;
  let picked: MissionLike = poste.missions.find((m) => m.id === memory.missionId) ?? poste.missions[0]!;

  const rail = h('nav', 'ui-panel ui-spec__postes ui-scroll ui-scroll--x');
  rail.setAttribute('aria-label', 'Postes');
  const listBox = h('div', 'ui-panel ui-spec__list ui-scroll');
  const list = h('div', 'ui-list');
  list.setAttribute('aria-label', 'Missions du poste');
  listBox.append(list);
  const side = h('section', 'ui-panel ui-spec__card');
  side.setAttribute('aria-label', 'Fiche de la mission');
  body.append(rail, listBox, side);

  const posteButtons = new Map<string, HTMLButtonElement>();
  for (const g of groups) {
    const b = h('button', 'ui-spec__poste');
    b.type = 'button';
    b.dataset.id = 'poste-' + g.id;
    const ic = g.id === ECOLE_POSTE ? icon('bookmark') : icon(roleIconName(g.id));
    b.append(ic, h('span', 'ui-spec__poste-name', g.label), h('span', 'ui-spec__count', int(g.missions.length)));
    b.setAttribute('aria-label', `${g.label} : ${g.missions.length} mission${g.missions.length > 1 ? 's' : ''}`);
    b.addEventListener('click', () => {
      if (poste === g) return;
      poste = g;
      memory.poste = g.id;
      picked = g.missions[0]!;
      memory.missionId = picked.id;
      paintPostes();
      buildList();
      buildSide();
    });
    posteButtons.set(g.id, b);
    rail.append(b);
  }

  const items = new Map<string, HTMLButtonElement>();
  function paintPostes(): void {
    for (const [id, b] of posteButtons) b.setAttribute('aria-pressed', String(id === poste.id));
  }
  function paintItems(): void {
    for (const [id, b] of items) b.setAttribute('aria-pressed', String(id === picked.id));
  }
  function buildList(): void {
    clear(list);
    items.clear();
    for (const m of poste.missions) {
      const b = h('button', 'ui-list__item');
      b.type = 'button';
      b.dataset.id = 'spec-' + m.id;
      const s = stars(m.difficulty);
      const trail = h('span', 'ui-list__trail ui-stars', s);
      if (s) trail.setAttribute('aria-label', `difficulté ${m.difficulty} sur 5`);
      b.append(h('span', 'ui-list__title', m.title), trail, h('span', 'ui-list__sub', missionLine(m)));
      b.addEventListener('click', () => {
        picked = m;
        memory.missionId = m.id;
        paintItems();
        buildSide();
        // une seule colonne : la fiche s'ouvre en plein panneau, le focus va à « Lancer »
        if (narrowLayout()) {
          root.classList.add('is-detail');
          launchBtn?.focus({ preventScroll: true });
        }
      });
      items.set(m.id, b);
      list.append(b);
    }
    paintItems();
  }

  let launchBtn: HTMLButtonElement | null = null;
  function buildSide(): void {
    clear(side);
    const close = shell.env.widgets.button('Missions', () => closeDetail(), 'ghost', 'back');
    close.dataset.id = 'spec-retour';
    close.classList.add('ui-spec__close');
    const card = buildCard(shell, picked, { mode: 'libre', locked: '', identity: '' });
    launchBtn = card.launch;
    side.append(close, card.el);
  }
  function closeDetail(): void {
    root.classList.remove('is-detail');
    const item = items.get(picked.id);
    item?.focus({ preventScroll: true });
    item?.scrollIntoView({ block: 'nearest' });
  }

  paintPostes();
  buildList();
  buildSide();
  items.get(picked.id)?.setAttribute('data-autofocus', '');
  requestAnimationFrame(() => items.get(picked.id)?.scrollIntoView({ block: 'nearest' }));

  return {
    el: root,
    back(): boolean {
      if (root.classList.contains('is-detail')) {
        closeDetail();
        return true;
      }
      return false;
    },
    start(): void {
      if (launchBtn && !launchBtn.disabled) launchBtn.focus({ preventScroll: true });
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────────────
// Vue « fiche de briefing » (carrière)
// ─────────────────────────────────────────────────────────────────────────────────────

export function buildBriefingView(shell: HomeShell, missionId: string, mode: 'libre' | 'carriere'): HomeViewInstance {
  const root = h('div', 'ui-view ui-briefview');
  const m = shell.missions.find((x) => x.id === missionId);
  const career = mode === 'carriere' ? shell.career : null;
  const fromCareer = !!career && shell.env.kit.hasScreen('carriere');
  // « ← Retour » : vers l'écran de carrière d'où vient la fiche, sinon vers les Missions spéciales
  const goBack = (): void => {
    if (fromCareer) {
      shell.open('hub');
      shell.env.ctx.ui.open('carriere');
    } else {
      shell.open('missions');
    }
  };
  root.append(viewHead(shell, mode === 'carriere' ? 'Carrière — briefing' : 'Briefing', '', fromCareer ? 'Carrière' : 'Missions', goBack));
  const box = h('div', 'ui-panel ui-briefview__box');
  root.append(box);
  if (!m) {
    box.append(h('div', 'ui-empty', 'Cette mission n’existe pas dans le catalogue installé.'));
    return { el: root };
  }
  let locked = '';
  let identity = '';
  if (career) {
    const st = career.missionStatus(m.id);
    if (!st.available) locked = st.reason || 'mission pas encore ouverte.';
    identity = shell.identityFor(m, 'carriere');
  }
  const card = buildCard(shell, m, { mode, locked, identity });
  if (!card.launch.disabled) card.launch.setAttribute('data-autofocus', '');
  box.append(card.el);
  return {
    el: root,
    back(): boolean {
      goBack();
      return true;
    },
    start(): void {
      if (!card.launch.disabled) card.launch.focus({ preventScroll: true });
    },
  };
}
