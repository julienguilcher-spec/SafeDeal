/* =====================================================================================
 * Écran « menu_principal » — page d'accueil : on y règle tout le scénario avant de jouer.
 *
 * Trois colonnes : sections (onglets), réglages de la section, résumé du scénario avec « Lancer ».
 * Le brouillon (ScenarioDraft) vit dans le modèle ; chaque réglage appelle model.update(), qui
 * assainit le brouillon puis rafraîchit le résumé. « Lancer » construit le SessionConfig
 * (buildSessionConfig) et appelle ctx.session.start.
 * Sur écran bas (téléphone), les onglets passent en bandeau horizontal et le résumé se resserre.
 * ===================================================================================== */

import type { InputState, PlaceInfo, SessionConfig } from '@/core/contracts';
import { createRng } from '@/core/rng';
import type { ScreenInstance } from '@/core/extensions';
import type { CauseLike, MissionLike } from '../core/api';
import type { TabsHandle } from '../core/components';
import { Txt, clear, el, h } from '../core/dom';
import { hourLabel, int, percent } from '../core/format';
import { icon, roleIconName } from '../core/icons';
import type { UiEnv } from '../core/kit';
import { DEFAULT_CAUSES, DEFAULT_PLACES, DURATIONS, FAMILIES, MODES, fold, roleInfo, weatherLabel } from './catalog';
import type { PlaceChoice } from './catalog';
import { buildFoule, buildMoyens, buildOptions, buildScenarios, buildTension } from './home-panes-b';
import { buildLieu, buildMeteo, buildMode, buildRole } from './home-panes-a';
import {
  buildSessionConfig, compositionShares, defaultDraft, draftFromConfig, identityLabel, meansSummary, sanitizeDraft, suggestName,
  summarize, surpriseDraft, tensionLabel, volatilityLabel, windLabel,
} from './scenario';
import type { ScenarioDraft } from './scenario';
import { ScenarioStore } from './scenarios-store';
import { readCauses, readMissions } from './services';

export type SectionId = 'role' | 'mode' | 'lieu' | 'meteo' | 'foule' | 'tension' | 'moyens' | 'options' | 'scenarios';

const SECTIONS: readonly { id: SectionId; label: string; icon: Parameters<typeof icon>[0]; title: string; sub: string }[] = [
  { id: 'role', label: 'Rôle', icon: 'shield', title: 'Votre rôle', sub: 'Tous les rôles sont jouables. Pour les forces de l’ordre, choisissez aussi grade et poste.' },
  { id: 'mode', label: 'Mode et mission', icon: 'list', title: 'Mode de jeu et mission', sub: 'Mode libre : tout se règle ici. Les missions apportent leurs objectifs.' },
  { id: 'lieu', label: 'Lieu', icon: 'pin', title: 'Lieu de la manifestation', sub: 'Places et carrefours réels du cœur de Paris.' },
  { id: 'meteo', label: 'Heure et météo', icon: 'clock', title: 'Heure, météo et vent', sub: 'La nuit, la pluie et le vent changent la visibilité, le gaz et la foule.' },
  { id: 'foule', label: 'Manifestation', icon: 'crowd', title: 'La manifestation', sub: 'Affluence, cause défendue et composition du cortège.' },
  { id: 'tension', label: 'Tension et durée', icon: 'pulse', title: 'Tension et durée', sub: 'Le climat de départ, et la facilité avec laquelle il se dégrade.' },
  { id: 'moyens', label: 'Moyens engagés', icon: 'siren', title: 'Moyens engagés', sub: 'Unités, véhicules et appuis disponibles au début du scénario.' },
  { id: 'options', label: 'Options', icon: 'sliders', title: 'Options de règles', sub: 'Sanctions, violence affichée, circulation et métro au départ.' },
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
  /** Modifie le brouillon (assaini) et rafraîchit le résumé ; le panneau courant n'est pas reconstruit. */
  update(patch: Partial<ScenarioDraft>): void;
  /** Remplace tout le brouillon et reconstruit le panneau courant. */
  replace(draft: ScenarioDraft): void;
  /** Reconstruit le panneau courant (liste modifiée). */
  rebuild(): void;
  launch(config?: SessionConfig): void;
  goto(section: SectionId): void;
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

export function createHome(env: UiEnv): (host: HTMLElement, data: unknown) => ScreenInstance {
  const { ctx, widgets } = env;
  const store = new ScenarioStore(ctx.save);
  const rng = createRng((Date.now() ^ 0x5f3759df) >>> 0);
  /** Brouillon conservé d'une ouverture à l'autre de l'écran. */
  let saved: ScenarioDraft | null = null;
  let lastSection: SectionId = 'role';

  return (host: HTMLElement, data: unknown): ScreenInstance => {
    const violence = ctx.settings.values.violence;
    const { featured, others } = resolvePlaces(ctx.world.places);
    const serviceCauses = readCauses(ctx.service('roles.causes'));
    const causes = serviceCauses.length ? serviceCauses : DEFAULT_CAUSES;
    const missions = readMissions(ctx.service('missions'));

    if (!saved) {
      const last = store.last();
      saved = last ? draftFromConfig(last, defaultDraft(violence)) : { ...defaultDraft(violence), seed: rng.int(1, 1000000) };
      // le lieu par défaut prend les coordonnées de la vraie place quand le monde la connaît
      const match = featured.find((p) => fold(p.name) === fold(saved!.place));
      if (match && !last) {
        saved.x = match.x;
        saved.z = match.z;
      }
    }
    const draft: ScenarioDraft = unifyCommander(saved);
    draft.options.violence = violence;
    const requested = data && typeof data === 'object' ? (data as { section?: unknown }).section : undefined;
    let section: SectionId = SECTIONS.some((s) => s.id === requested) ? (requested as SectionId) : lastSection;

    // ── structure ──
    const root = h('div', 'ui-full ui-home');
    root.setAttribute('aria-label', 'Page d’accueil');
    const top = h('header', 'ui-home__top');
    const brand = h('div', 'ui-brand');
    brand.innerHTML = '<svg class="ui-brand__mark" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2l11 4v9c0 7-4.600 12.400-11 15C9.600 27.400 5 22 5 15V6z" fill="#0b1220" stroke="rgba(255,255,255,.5)"/><path d="M8 8.100l4-1.450V25.500C9.500 22.900 8 19.300 8 15z" fill="#0055a4"/><path d="M12 6.650l4-1.450 4 1.450V25.500c-1.200 1.100-2.500 2-4 2.700-1.500-.700-2.800-1.600-4-2.700z" fill="#fff"/><path d="M20 6.650l4 1.450V15c0 4.300-1.500 7.900-4 10.500z" fill="#ef4135"/></svg>';
    brand.append(el('div', undefined, h('div', 'ui-brand__name', 'CRS SIMULATION FRANCE'), h('div', 'ui-brand__tag', 'Maintien de l’ordre à Paris — préparez votre scénario')));
    const nav = h('nav', 'ui-home__nav');
    nav.setAttribute('aria-label', 'Autres écrans');
    const navButton = (label: string, iconName: Parameters<typeof icon>[0], screen: string): void => {
      const b = widgets.button(label, () => ctx.ui.open(screen), 'ghost', iconName);
      b.dataset.id = 'nav-' + screen;
      nav.append(b);
    };
    // entrées vers les écrans des autres modules, seulement s'ils sont enregistrés
    if (env.kit.hasScreen('carriere')) navButton('Carrière', 'chevrons', 'carriere');
    if (env.kit.hasScreen('missions')) navButton('Missions', 'list', 'missions');
    if (env.kit.hasScreen('personnalisation')) navButton('Personnalisation', 'edit', 'personnalisation');
    if (env.kit.hasScreen('garage')) navButton('Garage', 'car', 'garage');
    navButton('Paramètres', 'gear', 'parametres');
    navButton('Crédits', 'info', 'credits');
    top.append(brand, nav);

    const body = h('div', 'ui-home__body');
    const rail = h('div', 'ui-panel ui-home__rail ui-scroll ui-scroll--x');
    const content = h('section', 'ui-panel ui-home__content');
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
    const last = store.last();
    if (last) {
      const d = draftFromConfig(last, defaultDraft(violence));
      const cont = widgets.button('Continuer', () => model.launch(last), 'ghost', 'restart');
      cont.classList.add('ui-btn--block');
      cont.dataset.id = 'continuer';
      cont.setAttribute('data-tip', `Relance la dernière partie : ${identityLabel(d)}, ${d.place}, ${hourLabel(d.timeOfDay)}`);
      actions.append(cont);
    }
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
      if (start && prev && next) hint.append('\u2002·\u2002');
      if (prev && next) hint.append(h('span', 'ui-key', prev), h('span', 'ui-key', next), ' Sections');
    };
    summary.append(sumHead, sumBody, actions);

    const roleTxt = new Txt(roleEl);
    const modeTxt = new Txt(modeEl);
    let badgeRole = '';
    let lastSentence = '';
    let compoKey = '';
    let launching = false;

    // ── onglets ──
    const tabs: TabsHandle<SectionId> = widgets.tabs<SectionId>({
      label: 'Sections du scénario',
      tabs: SECTIONS.map((s) => ({ id: s.id, label: s.label, icon: s.icon })),
      value: section,
      rail: true,
      onChange: (id: SectionId) => show(id),
    });
    for (const s of SECTIONS) {
      const b = tabs.button(s.id);
      if (b) b.dataset.id = 'tab-' + s.id;
    }
    rail.append(tabs.el);
    body.append(rail, content, summary);
    root.append(top, body);
    host.append(root);

    function refreshSummary(): void {
      const d = draft;
      if (d.role !== badgeRole) {
        badgeRole = d.role;
        clear(badge);
        badge.append(icon(roleIconName(d.role)));
      }
      roleTxt.set(identityLabel(d));
      const mode = MODES.find((m) => m.id === d.mode)!;
      const mission = d.missionId ? missions.find((m) => m.id === d.missionId) : undefined;
      modeTxt.set(mission ? `${mode.label} — ${mission.title}` : d.mode === 'monde_ouvert' ? mode.label : `${mode.label} — scénario libre`);
      // le résumé en clair sert de description au panneau (lecteurs d'écran) et d'infobulle à l'insigne
      const sentence = summarize(d);
      if (sentence !== lastSentence) {
        lastSentence = sentence;
        summary.setAttribute('aria-description', sentence);
        badge.setAttribute('data-tip', sentence);
      }
      rowPlace.strong.set(d.place);
      rowPlace.rest.set('');
      rowTime.strong.set(hourLabel(d.timeOfDay));
      rowTime.rest.set(` · ${weatherLabel(d.weather).toLowerCase()} · ${windLabel(d.windDir, d.windSpeed)}`);
      const open = d.mode === 'monde_ouvert';
      rowCrowd.strong.set(open ? 'Patrouille libre' : `${int(d.crowdSize)} manifestants`);
      rowCrowd.rest.set(open ? ' · pas de manifestation déclarée' : ` · ${d.causeLabel.toLowerCase()}`);
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
      rowMood.rest.set(` · débordement ${volatilityLabel(d.volatility)} · ${duration.long}`);
      rowMeans.strong.set('Moyens');
      rowMeans.rest.set(' · ' + meansSummary(d.moyens));
      rowOptions.strong.set(d.options.sanctions ? 'Sanctions actives' : 'Sans sanctions');
      rowOptions.rest.set(` · circulation ${d.options.circulation === 'coupee' ? 'coupée' : 'ouverte'} · métro ${d.options.metro === 'ferme' ? 'fermé' : 'ouvert'}`);

      // rappel de la valeur courante à droite de chaque onglet (écran large)
      tabs.setNote('role', roleInfo(d.role).name);
      tabs.setNote('lieu', d.place.replace(/^(Place|Esplanade) (de la |de l’|des |du |de )?/i, ''));
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

    const model: HomeModel = {
      env,
      host,
      draft,
      places: featured,
      otherPlaces: others,
      causes,
      missions,
      store,
      update(patch: Partial<ScenarioDraft>): void {
        Object.assign(draft, sanitizeDraft({ ...draft, ...patch }, draft));
        unifyCommander(draft);
        refreshSummary();
      },
      replace(next: ScenarioDraft): void {
        Object.assign(draft, sanitizeDraft(next, draft));
        unifyCommander(draft);
        draft.options.violence = ctx.settings.values.violence;
        refreshSummary();
        show(section);
      },
      rebuild(): void {
        show(section);
      },
      launch(config?: SessionConfig): void {
        if (launching) return;
        launching = true;
        const cfg = config ?? buildSessionConfig(draft);
        store.setLast(cfg);
        ctx.session.start(cfg).catch((err: unknown) => {
          console.error('[ui] démarrage du scénario impossible', err);
          ctx.ui.notify('Le scénario n’a pas pu démarrer. Vérifiez le lieu choisi, puis réessayez.', 'alert', 7);
        }).finally(() => {
          launching = false;
        });
      },
      goto(id: SectionId): void {
        tabs.set(id);
        show(id);
      },
    };

    refreshSummary();
    show(section);
    tabs.button(section)?.setAttribute('data-autofocus', '');

    const onTab = (e: Event): void => {
      tabs.step((e as CustomEvent<{ step: -1 | 1 }>).detail.step);
    };
    host.addEventListener('ui:tab', onTab);
    const unlink = env.nav.linkTabsToPane(tabs.el, pane);

    return {
      update(_dt: number, input: InputState): void {
        // la violence affichée a pu changer dans les paramètres ouverts par-dessus
        if (draft.options.violence !== ctx.settings.values.violence) {
          draft.options.violence = ctx.settings.values.violence;
          refreshSummary();
        }
        paintHint();
        // à la manette, Start amène le focus sur « Lancer » (les curseurs retiennent gauche et droite)
        if (input.device === 'gamepad' && input.pressed('pause') && ctx.ui.current === 'menu_principal') {
          launchBtn.focus({ preventScroll: true });
        }
      },
      back(): boolean {
        // écran racine : le retour ramène le focus sur l'onglet de la section
        const b = tabs.button(section);
        if (b && document.activeElement !== b) b.focus({ preventScroll: true });
        return true;
      },
      dispose(): void {
        host.removeEventListener('ui:tab', onTab);
        unlink();
        root.remove();
      },
    };
  };
}
