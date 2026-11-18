/* =====================================================================================
 * Page d'accueil — vue « Patrouille » : préparer une vacation d'équipage (src/gameplay/patrols/model.ts).
 *
 * Une colonne défilante, en tête « ← Accueil » (accueil-retour ; Échap fait de même) :
 *   (1) Équipage      : BAC (en civil, voiture banalisée) ou Police secours (en tenue, voiture sérigraphiée) —
 *                       crew-bac, crew-police_secours ;
 *   (2) Votre place   : Conducteur / Chef de bord (patrouille-place), grade (patrouille-grade) ;
 *   (3) Départ        : secteurs BAC ou commissariats de l'équipage, « Au hasard » (patrouille-depart-<id>), mini-plan ;
 *   (4) Ambiance      : rythme des appels (patrouille-rythme), heure (patrouille-heure), météo (patrouille-meteo-<id>),
 *                       durée de la vacation (patrouille-duree).
 * « Prendre la vacation » (patrouille-lancer) reste collé en bas : la configuration est vacationSessionConfig(réglages),
 * avec une graine neuve, le niveau de violence des paramètres et, pour les essais, le délai du premier appel lu dans
 * le paramètre d'URL &premier= (service 'launch').
 * Les réglages sont repris de la dernière vacation lancée (store.last()), sinon les valeurs par défaut.
 * ===================================================================================== */

import type { DurationPreset, PoliceRank, WeatherKind } from '@/core/contracts';
import type { LaunchParams } from '@/core/launch';
import { LAUNCH_SERVICE } from '@/core/launch';
import {
  CREWS, crewInfo, defaultPatrolSetup, patrolSetupFromConfig, sanitizePatrolSetup, vacationSessionConfig,
} from '@/gameplay/patrols/model';
import type { PatrolCrew, PatrolDepart, PatrolRythme, PatrolSeat, PatrolSetup } from '@/gameplay/patrols/model';
import { clear, el, h } from '../core/dom';
import { hourLabel } from '../core/format';
import { weatherIconName } from '../core/icons';
import { DURATIONS, WEATHERS, rankLabel, weatherLabel } from './catalog';
import type { HomeShell, HomeViewInstance } from './home';
import { viewHead } from './home-hub';
import { drawMiniPlan, nearestPlace } from './miniplan';
import type { MiniPlanView } from './miniplan';

/** Rythmes de la vacation : libellé et ce qu'il promet (cadence et nature des appels, voir D10 du plan). */
export const RYTHMES: readonly { id: PatrolRythme; label: string; tip: string }[] = [
  { id: 'calme', label: 'Calme', tip: 'Un appel toutes les cinq à huit minutes, un seul à la fois : feux de poubelle et rassemblements, rien de violent au premier quart d’heure.' },
  { id: 'normal', label: 'Normal', tip: 'Un appel toutes les trois à six minutes, deux au plus en même temps : il peut y avoir des casseurs ou une manifestation sauvage.' },
  { id: 'agite', label: 'Agité', tip: 'Les appels s’enchaînent, un toutes les 90 secondes à trois minutes, jusqu’à trois à la fois : casseurs, blocages, cortèges sauvages.' },
];

/** Libellé d'un départ dans la liste : indicatif et lieu (« BAC 75N — secteur gare Saint-Lazare »). */
export function departLabel(d: PatrolDepart): string {
  return `${d.callsign} — ${d.name}`;
}

/** Rappel des réglages au-dessus de « Prendre la vacation ». */
export function patrolRecap(s: PatrolSetup): string {
  const crew = crewInfo(s.crew);
  const depart = s.departId === 'hasard' ? 'départ au hasard' : (crew.departs().find((d) => d.id === s.departId) ?? crew.departs()[0]!).callsign;
  const seat = s.seat === 'chef_bord' ? 'chef de bord' : 'au volant';
  const dur = DURATIONS.find((d) => d.id === s.duration)!;
  const rythme = RYTHMES.find((r) => r.id === s.rythme)!;
  return `${crew.label} · ${depart} · ${seat} · ${hourLabel(s.timeOfDay)}, ${weatherLabel(s.weather).toLowerCase()} · ${dur.label} · ${rythme.label.toLowerCase()}`;
}

/** Réglages de départ de la vue : ceux déjà en mémoire, sinon ceux de la dernière vacation lancée, sinon le défaut. */
export function initialPatrolSetup(shell: Pick<HomeShell, 'memory' | 'lastConfig' | 'newSeed'>): PatrolSetup {
  if (shell.memory.patrol) return sanitizePatrolSetup(shell.memory.patrol);
  const fromLast = patrolSetupFromConfig(shell.lastConfig);
  const setup = fromLast ?? { ...defaultPatrolSetup(), seed: shell.newSeed() };
  // le délai d'essai d'une vacation précédente ne se reporte pas : seul le paramètre d'URL l'impose
  delete setup.premier;
  return sanitizePatrolSetup(setup);
}

export function buildPatrolView(shell: HomeShell): HomeViewInstance {
  const { env } = shell;
  const { widgets, ctx } = env;
  const setup: PatrolSetup = initialPatrolSetup(shell);
  shell.memory.patrol = setup;
  const set = (patch: Partial<PatrolSetup>): void => {
    Object.assign(setup, sanitizePatrolSetup({ ...setup, ...patch }));
    shell.memory.patrol = setup;
    recap.textContent = patrolRecap(setup);
  };

  const root = h('div', 'ui-view ui-pat');
  root.append(viewHead(shell, 'Patrouille', 'Une vacation d’équipage dans Paris : CENTRAL vous envoie sur ce qui se déclare.'));
  const scroll = h('div', 'ui-panel ui-pat__scroll ui-scroll');
  const col = h('div', 'ui-pat__col');
  scroll.append(col);

  // ── (1) équipage ──
  col.append(widgets.sectionTitle('Équipage'));
  const crews = h('div', 'ui-cards ui-pat__crews');
  crews.setAttribute('role', 'group');
  crews.setAttribute('aria-label', 'Équipage');
  const crewButtons = new Map<PatrolCrew, HTMLButtonElement>();
  for (const c of CREWS) {
    const b = widgets.card({
      icon: c.id === 'bac' ? 'role_patrouille' : 'car',
      title: c.label,
      desc: c.desc,
      selected: c.id === setup.crew,
      onClick: () => {
        if (setup.crew === c.id) return;
        // un départ propre à l'autre équipage revient au premier de la nouvelle liste (« Au hasard » est gardé)
        set({ crew: c.id, departId: setup.departId === 'hasard' ? 'hasard' : '' });
        for (const [id, btn] of crewButtons) btn.setAttribute('aria-pressed', String(id === c.id));
        buildDeparts();
      },
    });
    b.dataset.id = 'crew-' + c.id;
    crewButtons.set(c.id, b);
    crews.append(b);
  }
  col.append(crews);

  // ── (2) votre place ──
  col.append(widgets.sectionTitle('Votre place'));
  const seatNote = (seat: PatrolSeat): string => {
    if (seat === 'chef_bord') return 'Un collègue conduit. Vous prenez les appels, dirigez l’équipage et décidez des renforts.';
    const beacons = env.keyLabel('beacons');
    const siren = env.keyLabel('siren');
    const keys = beacons && siren ? ` (${beacons} et ${siren})` : '';
    return `Vous conduisez : gyrophare et deux-tons${keys}, c’est vous qui les allumez quand l’appel est urgent.`;
  };
  const placeField = widgets.field('Place', null, { value: setup.seat === 'chef_bord' ? 'Chef de bord' : 'Conducteur', hint: seatNote(setup.seat) });
  const placeSeg = widgets.segmented<PatrolSeat>({
    label: 'Votre place dans la voiture',
    options: crewInfo(setup.crew).seats.map((s) => ({ value: s.id, label: s.label })),
    value: setup.seat,
    onChange: (seat: PatrolSeat) => {
      set({ seat });
      placeField.setValue(seat === 'chef_bord' ? 'Chef de bord' : 'Conducteur');
      placeField.setHint(seatNote(seat));
    },
  });
  placeSeg.el.dataset.id = 'patrouille-place';
  placeField.el.insertBefore(placeSeg.el, placeField.el.lastElementChild);
  const rankField = widgets.field('Grade', null, { value: rankLabel(setup.rank) });
  const rankSeg = widgets.segmented<PoliceRank>({
    label: 'Grade',
    options: crewInfo(setup.crew).ranks.map((r) => ({ value: r, label: rankLabel(r) })),
    value: setup.rank,
    wrap: true,
    onChange: (rank: PoliceRank) => {
      set({ rank });
      rankField.setValue(rankLabel(rank));
    },
  });
  rankSeg.el.dataset.id = 'patrouille-grade';
  rankField.el.insertBefore(rankSeg.el, rankField.el.lastElementChild);
  col.append(placeField.el, rankField.el);

  // ── (3) départ ──
  const departTitle = widgets.sectionTitle('Départ');
  const departBox = h('div', 'ui-place ui-pat__depart');
  const departList = h('div', 'ui-list');
  departList.setAttribute('aria-label', 'Point de départ');
  const side = h('div', 'ui-place__side');
  const plan = h('div', 'ui-miniplan');
  const canvas = h('canvas');
  canvas.setAttribute('role', 'img');
  canvas.style.cursor = 'pointer';
  const cap = h('div', 'ui-miniplan__cap');
  plan.append(canvas, cap);
  const departNote = h('p', 'ui-sub');
  side.append(plan, departNote);
  departBox.append(departList, side);
  col.append(departTitle, departBox);
  let departs: readonly PatrolDepart[] = [];
  const departButtons = new Map<string, HTMLButtonElement>();
  let view: MiniPlanView | null = null;

  function paintDeparts(): void {
    for (const [id, b] of departButtons) b.setAttribute('aria-pressed', String(id === setup.departId));
    const sel = departs.findIndex((d) => d.id === setup.departId);
    view = drawMiniPlan(canvas, ctx, departs.map((d) => ({ name: d.callsign, x: d.x, z: d.z })), sel);
    const crew = crewInfo(setup.crew);
    canvas.setAttribute('aria-label', sel >= 0 ? `Plan de situation : ${departLabel(departs[sel]!)}` : 'Plan de situation des départs');
    cap.textContent = crew.id === 'bac' ? 'Secteurs de la BAC' : 'Commissariats d’arrondissement';
    departNote.textContent = setup.departId === 'hasard'
      ? 'Le départ sera tiré au hasard parmi ceux de l’équipage. Touchez le plan pour choisir le plus proche.'
      : 'La voiture est garée au bord du trottoir, dans le sens de la circulation. Touchez le plan pour choisir le départ le plus proche.';
  }
  function buildDeparts(): void {
    clear(departList);
    departButtons.clear();
    const crew = crewInfo(setup.crew);
    departs = crew.departs();
    departTitle.textContent = crew.id === 'bac' ? 'Départ : secteur de la BAC' : 'Départ : commissariat';
    const add = (id: string, title: string, sub: string): void => {
      const b = h('button', 'ui-list__item');
      b.type = 'button';
      b.dataset.id = 'patrouille-depart-' + id;
      b.append(h('span', 'ui-list__title', title));
      if (sub) b.append(h('span', 'ui-list__sub', sub));
      b.addEventListener('click', () => {
        set({ departId: id });
        paintDeparts();
      });
      departButtons.set(id, b);
      departList.append(b);
    };
    for (const d of departs) add(d.id, d.callsign, d.name.charAt(0).toUpperCase() + d.name.slice(1));
    add('hasard', 'Au hasard', crew.id === 'bac' ? 'L’un des quatre secteurs, tiré au sort' : 'L’un des commissariats, tiré au sort');
    paintDeparts();
  }
  canvas.addEventListener('click', (e) => {
    if (!view) return;
    const r = canvas.getBoundingClientRect();
    const w = view.toWorld(e.clientX - r.left, e.clientY - r.top);
    const i = nearestPlace(departs.map((d) => ({ name: d.callsign, x: d.x, z: d.z })), w.x, w.z);
    if (i < 0) return;
    set({ departId: departs[i]!.id });
    paintDeparts();
  });
  buildDeparts();

  // ── (4) ambiance ──
  col.append(widgets.sectionTitle('Ambiance'));
  const rythmeOf = (id: PatrolRythme): typeof RYTHMES[number] => RYTHMES.find((r) => r.id === id) ?? RYTHMES[1]!;
  const rythmeField = widgets.field('Rythme des appels', null, { value: rythmeOf(setup.rythme).label, hint: rythmeOf(setup.rythme).tip });
  const rythmeSeg = widgets.segmented<PatrolRythme>({
    label: 'Rythme des appels',
    options: RYTHMES.map((r) => ({ value: r.id, label: r.label })),
    value: setup.rythme,
    onChange: (rythme: PatrolRythme) => {
      set({ rythme });
      rythmeField.setValue(rythmeOf(rythme).label);
      rythmeField.setHint(rythmeOf(rythme).tip);
    },
  });
  rythmeSeg.el.dataset.id = 'patrouille-rythme';
  rythmeField.el.insertBefore(rythmeSeg.el, rythmeField.el.lastElementChild);

  const hourField = widgets.field('Heure de prise de service', null, { value: hourLabel(setup.timeOfDay) });
  const hourSlider = widgets.slider({
    label: 'Heure de prise de service',
    min: 0, max: 23.75, step: 0.25, value: setup.timeOfDay,
    variant: 'plain',
    format: hourLabel,
    onInput: (hour: number) => {
      set({ timeOfDay: hour });
      hourField.setValue(hourLabel(hour));
    },
  });
  hourSlider.el.dataset.id = 'patrouille-heure';
  hourField.el.insertBefore(hourSlider.el, hourField.el.lastElementChild);

  const weatherField = widgets.field('Météo', null, { value: weatherLabel(setup.weather) });
  const chips = h('div', 'ui-chips');
  chips.setAttribute('role', 'group');
  chips.setAttribute('aria-label', 'Météo');
  const chipButtons = new Map<WeatherKind, HTMLButtonElement>();
  for (const w of WEATHERS) {
    const b = widgets.chip({
      label: w.label,
      icon: weatherIconName(w.id),
      selected: w.id === setup.weather,
      onClick: () => {
        set({ weather: w.id });
        weatherField.setValue(w.label);
        for (const [id, btn] of chipButtons) btn.setAttribute('aria-pressed', String(id === w.id));
      },
    });
    b.dataset.id = 'patrouille-meteo-' + w.id;
    chipButtons.set(w.id, b);
    chips.append(b);
  }
  weatherField.el.insertBefore(chips, weatherField.el.lastElementChild);

  const durationHint = (id: DurationPreset): string => (id === 'temps_reel'
    ? 'Pas de fin automatique : vous terminez la vacation depuis la pause.'
    : 'À la fin, CENTRAL vous rappelle au service, puis le compte rendu de vacation s’affiche.');
  const durationField = widgets.field('Durée de la vacation', null, { value: DURATIONS.find((d) => d.id === setup.duration)!.long, hint: durationHint(setup.duration) });
  const durationSeg = widgets.segmented<DurationPreset>({
    label: 'Durée de la vacation',
    options: DURATIONS.map((d) => ({ value: d.id, label: d.label })),
    value: setup.duration,
    wrap: true,
    onChange: (duration: DurationPreset) => {
      set({ duration });
      durationField.setValue(DURATIONS.find((d) => d.id === duration)!.long);
      durationField.setHint(durationHint(duration));
    },
  });
  durationSeg.el.dataset.id = 'patrouille-duree';
  durationField.el.insertBefore(durationSeg.el, durationField.el.lastElementChild);
  col.append(rythmeField.el, hourField.el, weatherField.el, durationField.el);

  // ── pied collé en bas : rappel et « Prendre la vacation » ──
  const recap = h('div', 'ui-pat__recap');
  recap.textContent = patrolRecap(setup);
  const launch = widgets.button('Prendre la vacation', () => {
    const launchParams = ctx.service<LaunchParams>(LAUNCH_SERVICE);
    const premier = launchParams && typeof launchParams.premier === 'number' ? launchParams.premier : undefined;
    const final: PatrolSetup = { ...setup, seed: shell.newSeed(), violence: ctx.settings.values.violence };
    if (premier !== undefined) final.premier = premier;
    else delete final.premier;
    shell.launch(vacationSessionConfig(sanitizePatrolSetup(final)));
  }, 'primary', 'play');
  launch.dataset.id = 'patrouille-lancer';
  launch.classList.add('ui-btn--lg');
  if (ctx.session.phase !== 'menu') launch.disabled = true;
  const foot = el('div', 'ui-panel ui-pat__foot', recap, launch);
  root.append(scroll, foot);

  crewButtons.get(setup.crew)?.setAttribute('data-autofocus', '');
  // le canevas n'a de largeur qu'une fois inséré dans la page
  requestAnimationFrame(() => {
    if (canvas.isConnected) paintDeparts();
  });

  return {
    el: root,
    start(): void {
      if (!launch.disabled) launch.focus({ preventScroll: true });
    },
  };
}
