/* =====================================================================================
 * Écran « menu_principal » — page d'accueil en quatre modes.
 *
 * Un seul écran, des vues internes EXCLUSIVES (une seule est montée à la fois : jamais de data-id en double) :
 *   hub        quatre grandes entrées : Patrouille, Carrière, Missions spéciales, Mode libre (home-hub.ts) ;
 *   patrouille préparer une vacation d'équipage (home-patrol.ts) ;
 *   missions   le catalogue rangé par poste et sa fiche (home-missions.ts) ;
 *   briefing   la fiche d'une mission seule (« Jouer la mission » de la carrière) ;
 *   libre      l'éditeur complet : onglets, réglages de la section, résumé du scénario avec « Lancer ».
 * La barre du haut (marque, Carrière, Historique, Plein écran, Paramètres, Crédits) reste commune.
 *
 * Éditeur : le brouillon (ScenarioDraft) vit dans le modèle ; chaque réglage appelle model.update(), qui assainit le
 * brouillon puis rafraîchit le résumé. « Lancer » construit le SessionConfig (buildSessionConfig) et appelle
 * ctx.session.start. Sur écran bas (téléphone), les onglets passent en bandeau horizontal et le résumé se resserre.
 * En mode carrière, le brouillon suit la progression (home-career.ts) : grade de carrière, rôles ouverts, missions
 * déverrouillées.
 *
 * Donnée d'ouverture : { view?, section?, mode?, missionId? } (normalizeHomeRequest) ; une section sans vue ouvre
 * l'éditeur. Retour arrière (Échap, bouton B) : d'une sous-vue au hub. Manette : Start ouvre la tuile focalisée du
 * hub, amène le focus sur « Lancer » ailleurs. Tout lancement passe par migrateLegacyPatrol : une ancienne
 * configuration « Monde ouvert » (Continuer, scénario enregistré) devient la vacation annoncée.
 * ===================================================================================== */

import { embedded, fullscreenAvailable, openStandalone, toggleFullscreen } from '../core/fullscreen';
import type { InputState, PlaceInfo, SessionConfig } from '@/core/contracts';
import { createRng } from '@/core/rng';
import type { ScreenInstance } from '@/core/extensions';
import { migrateLegacyPatrol, readVacation } from '@/gameplay/patrols/model';
import type { PatrolSetup } from '@/gameplay/patrols/model';
import type { CauseLike, MissionLike } from '../core/api';
import type { TabsHandle } from '../core/components';
import { Txt, clear, el, h } from '../core/dom';
import { hourLabel, int, percent } from '../core/format';
import { icon, roleIconName } from '../core/icons';
import type { UiEnv } from '../core/kit';
import { DEFAULT_CAUSES, DEFAULT_PLACES, DURATIONS, FAMILIES, MODES, fold, roleInfo, weatherLabel } from './catalog';
import type { PlaceChoice } from './catalog';
import { buildFoule, buildMoyens, buildOptions, buildScenarios, buildTension } from './home-panes-b';
import { fitDraftToCareer, readCareer } from './home-career';
import { buildHub, normalizeHomeRequest } from './home-hub';
import type { SectionId } from './home-hub';
import { buildBriefingView, buildMissionsView, missionsByPoste } from './home-missions';
import { buildPatrolView } from './home-patrol';
import { buildLieu, buildMeteo, buildMode, buildRole, pickMission } from './home-panes-a';
import {
  buildSessionConfig, compositionShares, defaultDraft, draftFromConfig, identityLabel, imprevuLabel, meansSummary, organisateursLabel,
  sanitizeDraft, suggestName,
  summarize, surpriseDraft, tensionLabel, volatilityLabelMasc, windLabel,
} from './scenario';
import type { ScenarioDraft, ScenarioMode } from './scenario';
import type { CareerApi } from '@/gameplay/career/api';
import { ScenarioStore } from './scenarios-store';
import { readCauses, readMissions } from './services';

export type { SectionId } from './home-hub';

/** Vues internes de l'accueil. */
export type HomeView = 'hub' | 'patrouille' | 'missions' | 'briefing' | 'libre';

const SECTIONS: readonly { id: SectionId; label: string; icon: Parameters<typeof icon>[0]; title: string; sub: string }[] = [
  { id: 'role', label: 'Rôle', icon: 'shield', title: 'Votre rôle', sub: 'Tous les rôles sont jouables. Pour les forces de l’ordre, choisissez aussi grade et poste.' },
  { id: 'mode', label: 'Mission (facultative)', icon: 'list', title: 'Mission (facultative)', sub: 'Scénario libre : tout se règle ici. Une mission apporte ses objectifs, son lieu et son heure.' },
  { id: 'lieu', label: 'Lieu', icon: 'pin', title: 'Lieu de la manifestation', sub: 'Places et carrefours réels du cœur de Paris.' },
  { id: 'meteo', label: 'Heure et météo', icon: 'clock', title: 'Heure, météo et vent', sub: 'La nuit, la pluie et le vent changent la visibilité, le gaz et la foule.' },
  { id: 'foule', label: 'Manifestation', icon: 'crowd', title: 'La manifestation', sub: 'Nom, organisateurs, affluence, cause, composition et imprévus.' },
  { id: 'tension', label: 'Tension et durée', icon: 'pulse', title: 'Tension et durée', sub: 'Le climat de départ, et la facilité avec laquelle il se dégrade.' },
  { id: 'moyens', label: 'Moyens engagés', icon: 'siren', title: 'Moyens engagés', sub: 'Unités, véhicules et appuis disponibles, et le point de départ des colonnes.' },
  { id: 'options', label: 'Options', icon: 'sliders', title: 'Options de règles', sub: 'Journée de service, sanctions, violence affichée, circulation et métro au départ.' },
  { id: 'scenarios', label: 'Mes scénarios', icon: 'bookmark', title: 'Scénarios enregistrés', sub: 'Enregistrez vos réglages pour les rejouer d’un geste.' },
];

/** Ce que les panneaux de réglages reçoivent. */
export interface HomeModel {
  readonly env: UiEnv;
  readonly host: HTMLElement;
  readonly draft: ScenarioDraft;
  readonly places: readonly PlaceChoice[];
  readonly otherPlaces: readonly PlaceChoice[];
  readonly causes: readonly CauseLike[];
  readonly missions: readonly MissionLike[];
  readonly store: ScenarioStore;
  /** Service de carrière (null s'il n'est pas branché) : en mode carrière, grade, rôles et missions en dépendent. */
  readonly career: CareerApi | null;
  /** Modifie le brouillon (assaini) et rafraîchit le résumé ; le panneau courant n'est pas reconstruit. */
  update(patch: Partial<ScenarioDraft>): void;
  /** Remplace tout le brouillon et reconstruit le panneau courant. */
  replace(draft: ScenarioDraft): void;
  /** Reconstruit le panneau courant (liste modifiée). */
  rebuild(): void;
  launch(config?: SessionConfig): void;
  goto(section: SectionId): void;
}

/** Ce qui survit d'une ouverture de l'accueil à l'autre (dans la séance de jeu). */
export interface HomeMemory {
  /** Poste et mission affichés dans les Missions spéciales. */
  poste: string;
  missionId: string;
  /** Réglages de la vue Patrouille (null : pas encore ouverte). */
  patrol: PatrolSetup | null;
}

/** Ce qu'une vue reçoit de l'accueil. */
export interface HomeShell {
  readonly env: UiEnv;
  readonly model: HomeModel;
  readonly missions: readonly MissionLike[];
  readonly career: CareerApi | null;
  readonly memory: HomeMemory;
  /** Dernière configuration lancée (« Continuer »), null s'il n'y en a pas. */
  readonly lastConfig: SessionConfig | null;
  /** Monte une autre vue (la vue courante est détruite). */
  open(view: HomeView, opts?: { section?: SectionId; mode?: ScenarioMode; missionId?: string }): void;
  /** Lance une configuration (migrée si c'est une ancienne « Monde ouvert »), ou le brouillon de l'éditeur. */
  launch(config?: SessionConfig): void;
  /** Lance une mission du catalogue en Mode libre (Missions spéciales) ou en carrière (fiche de carrière). */
  launchMission(m: MissionLike, mode: 'libre' | 'carriere'): void;
  /** Ouvre l'éditeur sur l'onglet Mission avec cette mission choisie. */
  adjustMission(m: MissionLike, mode: 'libre' | 'carriere'): void;
  /** Rôle et grade tenus si la mission est jouée dans ce mode (« Gardien de la paix, porte-bouclier »). */
  identityFor(m: MissionLike, mode: 'libre' | 'carriere'): string;
  /** Graine neuve tirée par l'interface (nouvelle partie). */
  newSeed(): number;
}

/** Vue montée dans l'accueil. */
export interface HomeViewInstance {
  readonly el: HTMLElement;
  /** Retour arrière propre à la vue (true : traité) ; sinon l'accueil revient au hub. */
  back?(): boolean;
  /** Bouton Start de la manette. */
  start?(): void;
  update?(dt: number, input: InputState): void;
  dispose?(): void;
}

/** Lieux proposés : les dix lieux par défaut, rattachés aux vraies places du monde quand elles existent. */
export function resolvePlaces(world: readonly PlaceInfo[]): { featured: PlaceChoice[]; others: PlaceChoice[] } {
  const squares = world.filter((p) => p.kind === 'square');
  const used = new Set<number>();
  const featured: PlaceChoice[] = DEFAULT_PLACES.map((d) => {
    let best: PlaceInfo | null = null;
    for (const p of squares) {
      const name = fold(p.name);
      if (!d.keys.some((k) => name.indexOf(k) >= 0)) continue;
      // à nom équivalent, le lieu le plus proche des coordonnées de référence
      if (!best || Math.hypot(p.x - d.x, p.z - d.z) < Math.hypot(best.x - d.x, best.z - d.z)) best = p;
    }
    if (best && Math.hypot(best.x - d.x, best.z - d.z) < 600) {
      used.add(best.id);
      return { ...d, name: d.name, x: best.x, z: best.z };
    }
    return { ...d };
  });
  // autres places du monde, les plus vastes d'abord, en nombre raisonnable
  const others: PlaceChoice[] = squares
    .filter((p) => !used.has(p.id) && p.radius >= 35)
    .sort((a, b) => b.radius - a.radius)
    .slice(0, 24)
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
    .map((p) => ({ name: p.name, x: p.x, z: p.z, note: '', keys: [] }));
  return { featured, others };
}

/**
 * Commandant unique (docs/BRIEF.md §1) : le rôle « commissaire » du contrat est un alias du commandant et n'est
 * pas proposé séparément. Un brouillon qui le porte (scénario enregistré, tirage « Surprends-moi ») devient
 * le commandant : chef d'unité et autorité habilitée à la fois.
 */
export function unifyCommander(d: ScenarioDraft): ScenarioDraft {
  if (d.role === 'commissaire') {
    d.role = 'commandant';
    d.rank = 'commandant';
    d.poste = 'commandant_unite';
    d.variante = '';
  }
  return d;
}

/** Partie de l'éditeur montée dans la vue « libre ». */
interface EditorHandle {
  refresh(): void;
  show(id: SectionId): void;
  goto(id: SectionId): void;
}

export function createHome(env: UiEnv): (host: HTMLElement, data: unknown) => ScreenInstance {
  const { ctx, widgets } = env;
  const store = new ScenarioStore(ctx.save);
  // aléa de l'interface (graines neuves, « Surprends-moi ») : jamais celui de la simulation
  const rng = createRng((Date.now() ^ 0x5f3759df) >>> 0);
  /** Brouillon conservé d'une ouverture à l'autre de l'écran. */
  let saved: ScenarioDraft | null = null;
  let lastSection: SectionId = 'role';
  const memory: HomeMemory = { poste: '', missionId: '', patrol: null };

  return (host: HTMLElement, data: unknown): ScreenInstance => {
    const violence = ctx.settings.values.violence;
    const { featured, others } = resolvePlaces(ctx.world.places);
    const serviceCauses = readCauses(ctx.service('roles.causes'));
    const causes = serviceCauses.length ? serviceCauses : DEFAULT_CAUSES;
    const missions = readMissions(ctx.service('missions'));
    const groups = missionsByPoste(missions);
    // mode carrière : grade, rôles et missions suivent la progression enregistrée (service 'career', s'il est branché)
    const career = readCareer(ctx);
    const lastConfig = store.last();

    if (!saved) {
      // l'éditeur du Mode libre reprend la dernière partie, sauf une vacation de patrouille (réglée dans sa propre vue) :
      // son « lieu » est un secteur ou un commissariat, pas le lieu d'une manifestation
      const fromLast = lastConfig && !readVacation(lastConfig) ? lastConfig : null;
      saved = fromLast ? draftFromConfig(fromLast, defaultDraft(violence)) : { ...defaultDraft(violence), seed: rng.int(1, 1000000) };
      // le lieu par défaut prend les coordonnées de la vraie place quand le monde la connaît
      const match = featured.find((p) => fold(p.name) === fold(saved!.place));
      if (match && !fromLast) {
        saved.x = match.x;
        saved.z = match.z;
      }
    }
    const draft: ScenarioDraft = fitDraftToCareer(unifyCommander(saved), career);
    draft.options.violence = violence;
    const request = normalizeHomeRequest(data);
    let launching = false;

    // ── structure commune : barre du haut, puis la vue courante ──
    const root = h('div', 'ui-full ui-home');
    root.setAttribute('aria-label', 'Page d’accueil');
    const top = h('header', 'ui-home__top');
    const brand = h('div', 'ui-brand');
    brand.innerHTML = '<svg class="ui-brand__mark" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2l11 4v9c0 7-4.600 12.400-11 15C9.600 27.400 5 22 5 15V6z" fill="#0b1220" stroke="rgba(255,255,255,.5)"/><path d="M8 8.100l4-1.450V25.500C9.500 22.900 8 19.300 8 15z" fill="#0055a4"/><path d="M12 6.650l4-1.450 4 1.450V25.500c-1.200 1.100-2.500 2-4 2.700-1.500-.700-2.800-1.600-4-2.700z" fill="#fff"/><path d="M20 6.650l4 1.450V15c0 4.300-1.500 7.900-4 10.500z" fill="#ef4135"/></svg>';
    brand.append(el('div', undefined, h('div', 'ui-brand__name', 'CRS SIMULATION FRANCE'), h('div', 'ui-brand__tag', 'Maintien de l’ordre à Paris')));
    const nav = h('nav', 'ui-home__nav');
    nav.setAttribute('aria-label', 'Autres écrans');
    const navButton = (label: string, iconName: Parameters<typeof icon>[0], screen: string): void => {
      const b = widgets.button(label, () => ctx.ui.open(screen), 'ghost', iconName);
      b.dataset.id = 'nav-' + screen;
      // au téléphone, la barre est réduite aux pictogrammes : le libellé reste lu et affiché en infobulle
      b.setAttribute('aria-label', label);
      b.setAttribute('data-tip', label);
      nav.append(b);
    };
    // entrées vers les écrans des autres modules, seulement s'ils sont enregistrés
    if (env.kit.hasScreen('carriere')) navButton('Carrière', 'chevrons', 'carriere');
    if (env.kit.hasScreen('historique')) navButton('Historique', 'clock', 'historique');
    if (env.kit.hasScreen('missions')) navButton('Missions', 'list', 'missions');
    if (env.kit.hasScreen('personnalisation')) navButton('Personnalisation', 'edit', 'personnalisation');
    if (env.kit.hasScreen('garage')) navButton('Garage', 'car', 'garage');
    const fs = widgets.button('Plein écran', () => { void goFullscreen(ctx); }, 'ghost', 'fullscreen');
    fs.dataset.id = 'nav-plein-ecran';
    fs.setAttribute('aria-label', 'Plein écran');
    fs.setAttribute('data-tip', 'Plein écran');
    nav.append(fs);
    navButton('Paramètres', 'gear', 'parametres');
    navButton('Crédits', 'info', 'credits');
    top.append(brand, nav);
    const stage = h('div', 'ui-home__stage');
    root.append(top, stage);
    host.append(root);

    let view: HomeView = 'hub';
    let current: HomeViewInstance | null = null;
    let editor: EditorHandle | null = null;

    // ─────────────────────────── vue « libre » : l'éditeur ───────────────────────────
    function buildEditor(initial: SectionId): HomeViewInstance {
      const body = h('div', 'ui-view ui-home__body');
      const rail = h('div', 'ui-panel ui-home__rail ui-scroll ui-scroll--x');
      const content = h('section', 'ui-panel ui-home__content');
      const backBtn = widgets.button('Accueil', () => shell.open('hub'), 'ghost', 'back');
      backBtn.dataset.id = 'accueil-retour';
      backBtn.classList.add('ui-home__back');
      backBtn.setAttribute('aria-label', 'Retour : Accueil');
      const headTitle = h('h2', 'ui-title');
      const headSub = h('p', 'ui-sub');
      const head = el('div', 'ui-home__head', headTitle, headSub);
      const pane = h('div', 'ui-home__pane ui-scroll');
      content.append(head, pane);

      // ── résumé ──
      const summary = h('aside', 'ui-panel ui-panel--flag ui-home__summary');
      summary.setAttribute('aria-label', 'Résumé du scénario');
      const badge = h('span', 'ui-sum__badge');
      const roleEl = h('div', 'ui-sum__role');
      const modeEl = h('div', 'ui-sum__mode');
      const sumHead = el('div', 'ui-sum__head', h('div', 'ui-kicker', 'Votre scénario'), el('div', 'ui-sum__who', badge, el('div', undefined, roleEl, modeEl)));
      const sumBody = h('div', 'ui-sum__body ui-scroll');
      const row = (iconName: Parameters<typeof icon>[0]): { root: HTMLElement; strong: Txt; rest: Txt } => {
        const strong = h('b');
        const rest = h('span');
        const r = el('div', 'ui-sum__row', icon(iconName), el('div', undefined, strong, rest));
        return { root: r, strong: new Txt(strong), rest: new Txt(rest) };
      };
      const rowPlace = row('pin');
      const rowTime = row('clock');
      const rowCrowd = row('crowd');
      const compoBar = h('div', 'ui-compo-bar');
      compoBar.style.marginTop = '6px';
      compoBar.setAttribute('role', 'img');
      rowCrowd.root.lastElementChild!.append(compoBar);
      const rowMood = row('pulse');
      const rowMeans = row('shield');
      const rowOptions = row('sliders');
      sumBody.append(rowPlace.root, rowTime.root, rowCrowd.root, rowMood.root, rowMeans.root, rowOptions.root);
      const launchBtn = widgets.button('Lancer', () => model.launch(), 'primary', 'play');
      launchBtn.classList.add('ui-btn--lg', 'ui-btn--block');
      launchBtn.dataset.id = 'lancer';
      const surpriseBtn = widgets.button('Surprends-moi', () => {
        model.replace(surpriseDraft(rng, { places: featured, causes, violence: ctx.settings.values.violence }));
      }, 'secondary', 'dice');
      surpriseBtn.dataset.id = 'surprise';
      surpriseBtn.setAttribute('data-tip', 'Tire au hasard un scénario cohérent');
      const saveBtn = widgets.iconButton('save', 'Enregistrer ce scénario', () => {
        const entry = store.add(suggestName(draft), buildSessionConfig(draft));
        ctx.ui.notify(`Scénario enregistré : ${entry.name}`, 'ok');
        if (section === 'scenarios') model.rebuild();
      }, 'secondary');
      saveBtn.dataset.id = 'enregistrer';
      const actions = el('div', 'ui-sum__actions', launchBtn, el('div', 'ui-sum__pair', surpriseBtn, saveBtn));
      // aide de navigation, affichée seulement quand une manette est utilisée
      const hint = h('div', 'ui-sum__hint');
      hint.hidden = true;
      actions.append(hint);
      let hintKey = '';
      const paintHint = (): void => {
        const pad = ctx.input.device === 'gamepad';
        const start = pad ? env.keyLabel('pause', 'gamepad') : '';
        const prev = pad ? env.keyLabel('item_prev', 'gamepad') : '';
        const next = pad ? env.keyLabel('item_next', 'gamepad') : '';
        const key = pad ? `${start}|${prev}|${next}` : '';
        if (key === hintKey) return;
        hintKey = key;
        clear(hint);
        hint.hidden = !pad;
        if (!pad) return;
        if (start) hint.append(h('span', 'ui-key', start), ' Lancer');
        if (start && prev && next) hint.append(' · ');
        if (prev && next) hint.append(h('span', 'ui-key', prev), h('span', 'ui-key', next), ' Sections');
      };
      summary.append(sumHead, sumBody, actions);

      const roleTxt = new Txt(roleEl);
      const modeTxt = new Txt(modeEl);
      let badgeRole = '';
      let lastSentence = '';
      let compoKey = '';

      // ── onglets ──
      const tabs: TabsHandle<SectionId> = widgets.tabs<SectionId>({
        label: 'Sections du scénario',
        tabs: SECTIONS.map((s) => ({ id: s.id, label: s.label, icon: s.icon })),
        value: initial,
        rail: true,
        onChange: (id: SectionId) => show(id),
      });
      for (const s of SECTIONS) {
        const b = tabs.button(s.id);
        if (b) b.dataset.id = 'tab-' + s.id;
      }
      rail.append(backBtn, tabs.el);
      body.append(rail, content, summary);

      function refreshSummary(): void {
        const d = draft;
        if (d.role !== badgeRole) {
          badgeRole = d.role;
          clear(badge);
          badge.append(icon(roleIconName(d.role)));
        }
        roleTxt.set(identityLabel(d));
        const mode = MODES.find((m) => m.id === d.mode) ?? MODES[0]!;
        const mission = d.missionId ? missions.find((m) => m.id === d.missionId) : undefined;
        modeTxt.set(mission ? `${mode.label} — ${mission.title}` : d.mode === 'monde_ouvert' ? mode.label : `${mode.label} — scénario libre`);
        // le résumé en clair sert de description au panneau (lecteurs d'écran) et d'infobulle à l'insigne
        const sentence = summarize(d);
        if (sentence !== lastSentence) {
          lastSentence = sentence;
          summary.setAttribute('aria-description', sentence);
          badge.setAttribute('data-tip', sentence);
        }
        // lieu tiré au hasard au lancement (Mode libre, sans mission) : il n'est pas encore connu
        const hasard = d.lieuHasard && d.missionId === '' && d.mode !== 'monde_ouvert';
        rowPlace.strong.set(hasard ? 'Lieu tiré au hasard' : d.place);
        rowPlace.rest.set('');
        rowTime.strong.set(hourLabel(d.timeOfDay));
        rowTime.rest.set(` · ${weatherLabel(d.weather).toLowerCase()} · ${windLabel(d.windDir, d.windSpeed)}`);
        const open = d.mode === 'monde_ouvert';
        rowCrowd.strong.set(open ? 'Patrouille libre' : `${int(d.crowdSize)} manifestants`);
        // scénario libre : nom et organisateurs de la manifestation quand ils sont réglés
        const free = d.missionId === '';
        const named = free && d.manifNom !== '' ? ` · « ${d.manifNom} »` : '';
        const org = free && d.organisateurs !== 'intersyndicale' ? ` · ${organisateursLabel(d.organisateurs).toLowerCase()}` : '';
        rowCrowd.rest.set(open ? ' · pas de manifestation déclarée' : ` · ${d.causeLabel.toLowerCase()}${named}${org}`);
        compoBar.hidden = open;
        const shares = compositionShares(d.composition);
        const key = FAMILIES.map((f) => shares[f.id].toFixed(3)).join('|');
        if (key !== compoKey) {
          compoKey = key;
          clear(compoBar);
          const parts: string[] = [];
          for (const f of FAMILIES) {
            const share = shares[f.id];
            if (share <= 0) continue;
            const seg = h('i');
            seg.dataset.f = f.id;
            seg.style.flex = `${share} 0 0`;
            seg.style.backgroundColor = f.color;
            compoBar.append(seg);
            parts.push(`${f.label} ${percent(share)}`);
          }
          compoBar.setAttribute('aria-label', 'Composition : ' + parts.join(', '));
          compoBar.setAttribute('data-tip', parts.join(' · '));
        }
        const duration = DURATIONS.find((x) => x.id === d.duration)!;
        rowMood.strong.set(`Tension ${tensionLabel(d.tension)}`);
        rowMood.rest.set(` · risque de débordement ${volatilityLabelMasc(d.volatility)} · ${duration.long}${free && !open ? ` · imprévu : ${imprevuLabel(d.imprevu).toLowerCase()}` : ''}`);
        rowMeans.strong.set('Moyens');
        rowMeans.rest.set(' · ' + meansSummary(d.moyens));
        rowOptions.strong.set(d.options.sanctions ? 'Sanctions actives' : 'Sans sanctions');
        rowOptions.rest.set(` · circulation ${d.options.circulation === 'coupee' ? 'coupée' : 'ouverte'} · métro ${d.options.metro === 'ferme' ? 'fermé' : 'ouvert'}`);

        // rappel de la valeur courante à droite de chaque onglet (écran large)
        tabs.setNote('role', roleInfo(d.role).name);
        tabs.setNote('lieu', hasard ? 'Au hasard' : d.place.replace(/^(Place|Esplanade) (de la |de l’|des |du |de )?/i, ''));
        tabs.setNote('foule', open ? '—' : int(d.crowdSize));
        tabs.setNote('tension', percent(d.tension));
      }

      function show(id: SectionId): void {
        section = id;
        lastSection = id;
        const def = SECTIONS.find((s) => s.id === id)!;
        headTitle.textContent = def.title;
        headSub.textContent = def.sub;
        const hadFocus = pane.contains(document.activeElement);
        clear(pane);
        pane.scrollTop = 0;
        let built: HTMLElement;
        switch (id) {
          case 'role': built = buildRole(model); break;
          case 'mode': built = buildMode(model); break;
          case 'lieu': built = buildLieu(model); break;
          case 'meteo': built = buildMeteo(model); break;
          case 'foule': built = buildFoule(model); break;
          case 'tension': built = buildTension(model); break;
          case 'moyens': built = buildMoyens(model); break;
          case 'options': built = buildOptions(model); break;
          default: built = buildScenarios(model); break;
        }
        pane.append(built);
        if (hadFocus) tabs.button(id)?.focus({ preventScroll: true });
      }

      const onTab = (e: Event): void => {
        tabs.step((e as CustomEvent<{ step: -1 | 1 }>).detail.step);
      };
      host.addEventListener('ui:tab', onTab);
      const unlink = env.nav.linkTabsToPane(tabs.el, pane);

      editor = {
        refresh: refreshSummary,
        show,
        goto(id: SectionId): void {
          tabs.set(id);
          show(id);
        },
      };
      refreshSummary();
      show(initial);
      tabs.button(initial)?.setAttribute('data-autofocus', '');

      return {
        el: body,
        update(): void {
          paintHint();
        },
        back(): boolean {
          // premier retour : le focus revient à l'onglet de la section (B puis LB / RB à la manette) ; depuis l'onglet,
          // le retour suivant ramène au hub
          const tab = tabs.button(section);
          const active = document.activeElement;
          if (tab && active !== tab && active instanceof HTMLElement && body.contains(active) && !rail.contains(active)) {
            tab.focus({ preventScroll: true });
            return true;
          }
          return false;
        },
        start(): void {
          // à la manette, Start amène le focus sur « Lancer » (les curseurs retiennent gauche et droite)
          launchBtn.focus({ preventScroll: true });
        },
        dispose(): void {
          host.removeEventListener('ui:tab', onTab);
          unlink();
          editor = null;
        },
      };
    }
    let section: SectionId = request.section ?? lastSection;

    // ─────────────────────────── modèle partagé par les vues ───────────────────────────
    const model: HomeModel = {
      env,
      host,
      draft,
      places: featured,
      otherPlaces: others,
      causes,
      missions,
      store,
      career,
      update(patch: Partial<ScenarioDraft>): void {
        Object.assign(draft, sanitizeDraft({ ...draft, ...patch }, draft));
        fitDraftToCareer(unifyCommander(draft), career);
        editor?.refresh();
      },
      replace(next: ScenarioDraft): void {
        Object.assign(draft, sanitizeDraft(next, draft));
        fitDraftToCareer(unifyCommander(draft), career);
        draft.options.violence = ctx.settings.values.violence;
        if (editor) {
          editor.refresh();
          editor.show(section);
        }
      },
      rebuild(): void {
        editor?.show(section);
      },
      launch(config?: SessionConfig): void {
        if (launching) return;
        launching = true;
        // « Lieu tiré au hasard » (scénario libre) : un nouveau tirage à chaque lancement depuis l'éditeur (la graine
        // le décide) ; « Continuer » relance ensuite la configuration enregistrée, au même lieu
        if (!config && draft.lieuHasard && draft.missionId === '' && draft.mode !== 'monde_ouvert') model.update({ seed: rng.int(1, 1000000) });
        // une ancienne configuration « Monde ouvert » de l'accueil devient la vacation annoncée (D1, D20)
        const cfg = migrateLegacyPatrol(config ?? buildSessionConfig(draft));
        store.setLast(cfg);
        ctx.session.start(cfg).catch((err: unknown) => {
          console.error('[ui] démarrage du scénario impossible', err);
          ctx.ui.notify('Le scénario n’a pas pu démarrer. Vérifiez le lieu choisi, puis réessayez.', 'alert', 7);
        }).finally(() => {
          launching = false;
        });
      },
      goto(id: SectionId): void {
        if (editor) editor.goto(id);
        else shell.open('libre', { section: id });
      },
    };

    /** Choisit la mission dans le brouillon, dans le mode demandé (Missions spéciales : Mode libre). */
    const pickFor = (m: MissionLike, mode: 'libre' | 'carriere'): void => {
      if (draft.mode !== mode) model.update({ mode });
      pickMission(model, m);
    };

    const shell: HomeShell = {
      env,
      model,
      missions,
      career,
      memory,
      lastConfig,
      open(next: HomeView, opts: { section?: SectionId; mode?: ScenarioMode; missionId?: string } = {}): void {
        mount(next, opts, view);
      },
      launch: (config?: SessionConfig) => model.launch(config),
      launchMission(m: MissionLike, mode: 'libre' | 'carriere'): void {
        if (mode === 'carriere' && career && !career.isMissionAvailable(m.id)) return;
        pickFor(m, mode);
        model.launch();
      },
      adjustMission(m: MissionLike, mode: 'libre' | 'carriere'): void {
        pickFor(m, mode);
        mount('libre', { section: 'mode' }, view);
      },
      identityFor(m: MissionLike, mode: 'libre' | 'carriere'): string {
        // brouillon d'essai : la mission choisie dans ce mode, ajustée à la carrière (grade imposé)
        const trial = draftFromConfig({ ...m.config, missionId: m.id, mode }, draft);
        return identityLabel(fitDraftToCareer(unifyCommander(trial), mode === 'carriere' ? career : null));
      },
      newSeed: () => rng.int(1, 1000000),
    };

    /** Monte une vue (la précédente est détruite) et place le focus. */
    function mount(next: HomeView, opts: { section?: SectionId; mode?: ScenarioMode; missionId?: string }, from: HomeView | null): void {
      if (current) {
        current.dispose?.();
        current.el.remove();
        current = null;
      }
      if (opts.mode && draft.mode !== opts.mode) model.update({ mode: opts.mode });
      view = next;
      root.dataset.view = next;
      switch (next) {
        case 'patrouille': current = buildPatrolView(shell); break;
        case 'missions': current = buildMissionsView(shell); break;
        case 'briefing': current = buildBriefingView(shell, opts.missionId ?? memory.missionId, draft.mode === 'carriere' ? 'carriere' : 'libre'); break;
        case 'libre':
          if (opts.section) section = opts.section;
          current = buildEditor(section);
          break;
        default:
          // le focus revient sur la tuile de la vue quittée
          current = buildHub(shell, groups, from === 'briefing' ? (draft.mode === 'carriere' ? 'carriere' : 'missions') : from === 'hub' ? null : from);
          break;
      }
      stage.append(current.el);
      // focus : élément par défaut de la nouvelle vue (sauf si un autre écran recouvre l'accueil)
      if (from !== null && !host.inert) {
        queueMicrotask(() => {
          if (current && current.el.isConnected && !current.el.contains(document.activeElement)) env.nav.focusDefault(current.el);
        });
      }
    }

    // ouverture demandée par un autre écran (fiche de carrière, éditeur sur une section, mission choisie)
    if (request.missionId && request.view === 'briefing') memory.missionId = request.missionId;
    if (request.view === 'libre' && request.missionId) {
      // ancienne forme (« Jouer la mission » vers l'onglet Mission) : la mission est choisie dans l'éditeur
      if (request.mode) model.update({ mode: request.mode });
      const m = missions.find((x) => x.id === request.missionId);
      if (m && (!career || draft.mode !== 'carriere' || career.isMissionAvailable(m.id))) pickMission(model, m);
      mount('libre', { section: request.section ?? 'mode' }, null);
    } else {
      mount(request.view, { section: request.section ?? undefined, mode: request.mode ?? undefined, missionId: request.missionId || undefined }, null);
    }

    return {
      update(dt: number, input: InputState): void {
        // la violence affichée a pu changer dans les paramètres ouverts par-dessus
        if (draft.options.violence !== ctx.settings.values.violence) {
          draft.options.violence = ctx.settings.values.violence;
          editor?.refresh();
        }
        current?.update?.(dt, input);
        // à la manette, Start : la tuile focalisée du hub s'ouvre ; ailleurs, le focus va au bouton de lancement
        if (input.device === 'gamepad' && input.pressed('pause') && ctx.ui.current === 'menu_principal') current?.start?.();
      },
      back(): boolean {
        // d'une sous-vue (ou de son détail) au hub ; le hub est la racine : rien à fermer
        if (current?.back?.()) return true;
        if (view !== 'hub') mount('hub', {}, view);
        return true;
      },
      dispose(): void {
        current?.dispose?.();
        current = null;
        root.remove();
      },
    };
  };
}

/** Plein écran ; si l'hôte l'interdit (page intégrée), ouvre le jeu dans un onglet à part. */
async function goFullscreen(ctx: import('@/core/contracts').GameContext): Promise<void> {
  if (fullscreenAvailable() && (await toggleFullscreen())) return;
  if (embedded() && openStandalone()) {
    ctx.ui.notify('Le jeu s’ouvre dans un nouvel onglet : appuyez de nouveau sur « Plein écran » (ou F11).', 'info', 7);
    return;
  }
  ctx.ui.notify('Plein écran indisponible ici : utilisez F11 (PC) ou « Ajouter à l’écran d’accueil » (téléphone).', 'warn', 7);
}
