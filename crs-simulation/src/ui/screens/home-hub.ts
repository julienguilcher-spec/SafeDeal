/* =====================================================================================
 * Page d'accueil — le hub : quatre grandes entrées, chacune expliquée en une ligne.
 *
 *   PATROUILLE        (accueil-patrouille)  vue Patrouille : équipage, place, départ, ambiance ;
 *   CARRIÈRE          (accueil-carriere)    écran 'carriere' (ou l'éditeur en mode carrière s'il n'existe pas) ;
 *   MISSIONS SPÉCIALES(accueil-missions)    catalogue rangé par poste, fiche de briefing ;
 *   MODE LIBRE        (accueil-libre)       l'éditeur complet (onglets, résumé, « Lancer »).
 * Sous les tuiles : « Continuer — <dernière partie> » (continuer) quand une partie a déjà été lancée.
 * Clavier : flèches ou Tab d'une tuile à l'autre, Entrée pour ouvrir ; focus initial sur la première tuile.
 * Manette : croix pour choisir, A pour ouvrir, Start ouvre la tuile focalisée.
 *
 * Parties pures (testées sous Node) : normalizeHomeRequest, careerTileLine, missionsTileLine, continueLabel.
 * ===================================================================================== */

import type { SessionConfig } from '@/core/contracts';
import type { CareerApi } from '@/gameplay/career/api';
import { migrateLegacyPatrol, readVacation } from '@/gameplay/patrols/model';
import type { MissionLike } from '../core/api';
import { el, h } from '../core/dom';
import { int } from '../core/format';
import type { IconName } from '../core/icons';
import { rankLabel, roleInfo } from './catalog';
import type { HomeShell, HomeView, HomeViewInstance } from './home';
import type { PosteGroup } from './home-missions';

// ─────────────────────────────────────────────────────────────────────────────────────
// Partie pure
// ─────────────────────────────────────────────────────────────────────────────────────

/** Sections de l'éditeur du Mode libre (onglets tab-<id>). */
export const SECTION_IDS = ['role', 'mode', 'lieu', 'meteo', 'foule', 'tension', 'moyens', 'options', 'scenarios'] as const;
export type SectionId = typeof SECTION_IDS[number];

export const HOME_VIEWS: readonly HomeView[] = ['hub', 'patrouille', 'missions', 'briefing', 'libre'];

/** Donnée d'ouverture de 'menu_principal', normalisée. */
export interface HomeRequest {
  view: HomeView;
  /** Section de l'éditeur demandée (vue « libre »), null : la dernière ouverte. */
  section: SectionId | null;
  /** Mode imposé au brouillon (carrière depuis l'écran de carrière), null : inchangé. */
  mode: 'carriere' | 'libre' | 'monde_ouvert' | null;
  /** Mission demandée ('' : aucune). */
  missionId: string;
}

/**
 * { view?, section?, mode?, missionId? } → requête complète. Une section sans vue ouvre l'éditeur (« libre ») ; une
 * mission sans vue ni section ouvre sa fiche de briefing ; une fiche sans mission ouvre les Missions spéciales ;
 * toute valeur inconnue est ignorée (le hub par défaut).
 */
export function normalizeHomeRequest(data: unknown): HomeRequest {
  const out: HomeRequest = { view: 'hub', section: null, mode: null, missionId: '' };
  if (!data || typeof data !== 'object' || Array.isArray(data)) return out;
  const r = data as Record<string, unknown>;
  if (typeof r.section === 'string' && (SECTION_IDS as readonly string[]).indexOf(r.section) >= 0) out.section = r.section as SectionId;
  if (r.mode === 'carriere' || r.mode === 'libre' || r.mode === 'monde_ouvert') out.mode = r.mode;
  if (typeof r.missionId === 'string') out.missionId = r.missionId.trim();
  const view = typeof r.view === 'string' && (HOME_VIEWS as readonly string[]).indexOf(r.view) >= 0 ? (r.view as HomeView) : null;
  if (view) out.view = view;
  else if (out.section) out.view = 'libre';
  else if (out.missionId) out.view = 'briefing';
  if (out.view === 'briefing' && !out.missionId) out.view = 'missions';
  return out;
}

/** Ligne de la tuile Carrière : grade et chapitre en cours, ou le parcours complet sans carrière. */
export function careerTileLine(career: Pick<CareerApi, 'progress' | 'chapters'> | null): string {
  if (!career) return 'De gardien stagiaire à commandant';
  const p = career.progress;
  const c = career.chapters[p.chapter];
  const where = !c ? '' : c.index === 0 ? ' — école de police' : ` — chapitre ${c.index}`;
  return `${rankLabel(p.rank)}${where}`;
}

/** Ligne de la tuile Missions spéciales : nombre calculé depuis le catalogue, quelques postes en exemple. */
export function missionsTileLine(groups: readonly PosteGroup[]): string {
  const total = groups.reduce((n, g) => n + g.missions.length, 0);
  if (total === 0) return 'Le catalogue des missions n’est pas installé dans cette version.';
  const prefer = ['crs', 'bravm', 'operateur_canon_eau', 'journaliste'];
  const names: string[] = [];
  for (const id of prefer) {
    const g = groups.find((x) => x.id === id);
    if (g) names.push(shortPoste(g.label));
  }
  for (const g of groups) {
    if (names.length >= 4) break;
    const n = shortPoste(g.label);
    if (prefer.indexOf(g.id) < 0 && names.indexOf(n) < 0) names.push(n);
  }
  const more = groups.length > names.length ? '…' : '';
  return `${int(total)} mission${total > 1 ? 's' : ''} rangée${total > 1 ? 's' : ''} par poste : ${names.join(', ')}${more}`;
}

/** Libellé de poste en milieu de phrase : minuscule, sauf les sigles (CRS, BRAV-M). */
function shortPoste(label: string): string {
  const first = label.split(/\s/)[0] ?? '';
  return first.length > 1 && first === first.toUpperCase() ? label : label.charAt(0).toLowerCase() + label.slice(1);
}

/** « Continuer — … » : la dernière partie en quelques mots. */
export function continueLabel(cfg: SessionConfig, missions: readonly Pick<MissionLike, 'id' | 'title'>[]): string {
  // (une ancienne « Monde ouvert » est relancée en vacation : le libellé nomme la vacation qui sera jouée)
  const v = readVacation(migrateLegacyPatrol(cfg));
  if (v) return `${v.depart.callsign}, ${v.depart.name}`;
  if (cfg.missionId) {
    const m = missions.find((x) => x.id === cfg.missionId);
    if (m) return m.title;
  }
  const place = cfg.place || 'Paris';
  return `${roleInfo(cfg.role).name}, ${place}`;
}

// ─────────────────────────────────────────────────────────────────────────────────────
// En-tête commun des sous-vues
// ─────────────────────────────────────────────────────────────────────────────────────

/** En-tête d'une sous-vue : « ← Accueil » (accueil-retour ; Échap fait de même), titre, phrase d'aide. */
export function viewHead(shell: HomeShell, title: string, sub: string, backLabel = 'Accueil', onBack?: () => void): HTMLElement {
  const back = shell.env.widgets.button(backLabel, () => (onBack ? onBack() : shell.open('hub')), 'ghost', 'back');
  back.dataset.id = 'accueil-retour';
  back.setAttribute('aria-label', `Retour : ${backLabel}`);
  const titles = el('div', 'ui-view__titles', h('h2', 'ui-title', title));
  if (sub) titles.append(h('p', 'ui-sub', sub));
  return el('div', 'ui-view__head', back, titles);
}

// ─────────────────────────────────────────────────────────────────────────────────────
// Vue « hub »
// ─────────────────────────────────────────────────────────────────────────────────────

interface TileDef {
  id: 'patrouille' | 'carriere' | 'missions' | 'libre';
  icon: IconName;
  title: string;
  line: string;
  open(): void;
}

export function buildHub(shell: HomeShell, groups: readonly PosteGroup[], focusOn: HomeView | 'carriere' | null): HomeViewInstance {
  const { env, career } = shell;
  const root = h('div', 'ui-view ui-hub');
  const grid = h('div', 'ui-hub__grid');
  grid.setAttribute('role', 'group');
  grid.setAttribute('aria-label', 'Modes de jeu');
  const tiles: TileDef[] = [
    {
      id: 'patrouille', icon: 'mode_patrouille', title: 'Patrouille',
      line: 'En BAC ou en Police secours dans Paris : la radio vous envoie sur ce qui se déclare.',
      open: () => shell.open('patrouille'),
    },
    {
      id: 'carriere', icon: 'mode_carriere', title: 'Carrière', line: careerTileLine(career),
      open: () => {
        if (env.kit.hasScreen('carriere')) env.ctx.ui.open('carriere');
        else shell.open('libre', { section: 'mode', mode: 'carriere' });
      },
    },
    { id: 'missions', icon: 'mode_missions', title: 'Missions spéciales', line: missionsTileLine(groups), open: () => shell.open('missions') },
    {
      id: 'libre', icon: 'mode_libre', title: 'Mode libre', line: 'Vous réglez tout : rôle, manifestation, lieu, colonnes, imprévu.',
      open: () => shell.open('libre', { mode: 'libre' }),
    },
  ];
  const buttons: HTMLButtonElement[] = [];
  for (const t of tiles) {
    // carte de choix du kit (son d'interface au clic), mise en forme de grande tuile ; ce n'est pas un interrupteur
    const b = env.widgets.card({ icon: t.icon, title: t.title, desc: t.line, onClick: () => t.open() });
    b.removeAttribute('aria-pressed');
    b.classList.add('ui-hub__tile');
    b.dataset.id = 'accueil-' + t.id;
    b.setAttribute('aria-label', `${t.title} — ${t.line}`);
    buttons.push(b);
    grid.append(b);
  }
  const focused = buttons.find((b) => b.dataset.id === 'accueil-' + focusOn) ?? buttons[0]!;
  focused.setAttribute('data-autofocus', '');
  root.append(grid);

  const last = shell.lastConfig;
  if (last) {
    const label = continueLabel(last, shell.missions);
    const cont = env.widgets.button(`Continuer — ${label}`, () => shell.launch(last), 'secondary', 'restart');
    cont.dataset.id = 'continuer';
    cont.classList.add('ui-hub__continue');
    cont.setAttribute('data-tip', `Relance la dernière partie à l’identique : ${label}`);
    root.append(el('div', 'ui-hub__foot', cont));
  }
  return {
    el: root,
    start(): void {
      // Start : ouvre la tuile focalisée (sinon donne le focus à la première)
      const active = document.activeElement;
      const tile = buttons.find((b) => b === active);
      if (tile) tile.click();
      else buttons[0]!.focus({ preventScroll: true });
    },
  };
}
