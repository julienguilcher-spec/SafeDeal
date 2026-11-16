/* =====================================================================================
 * Page d'accueil — panneaux de réglages (1/2) : rôle, mode et mission, lieu, heure et météo.
 * Chaque fonction construit le contenu d'une section à partir du brouillon et appelle
 * model.update() à chaque réglage.
 * ===================================================================================== */

import type { PolicePoste, PoliceRank, WeatherKind } from '@/core/contracts';
import { clear, el, h } from '../core/dom';
import { cardinal8, hourLabel } from '../core/format';
import { icon, roleIconName, weatherIconName } from '../core/icons';
import { MODES, POSTE_LABELS, POSTE_NOTES, RANK_NOTES, ROLES, WEATHERS, fold, rankLabel, roleInfo, weatherLabel } from './catalog';
import type { PlaceChoice } from './catalog';
import type { HomeModel } from './home';
import { drawMiniPlan, nearestPlace } from './miniplan';
import type { MiniPlanView } from './miniplan';
import { DAY_PHASE_LABELS, buildSessionConfig, dayPhase, draftFromConfig, windLabel } from './scenario';

function note(text: string, warn = false): HTMLElement {
  return el('div', 'ui-note' + (warn ? ' ui-note--warn' : ''), icon(warn ? 'warning' : 'info'), h('span', undefined, text));
}

// ───────────────────────────── rôle ─────────────────────────────

export function buildRole(model: HomeModel): HTMLElement {
  const { widgets } = model.env;
  const root = h('div');
  const cards = h('div', 'ui-cards ui-cards--roles');
  cards.setAttribute('role', 'group');
  cards.setAttribute('aria-label', 'Rôle');
  const sub = h('div');
  const buttons = new Map<string, HTMLButtonElement>();

  function paintCards(): void {
    for (const [id, b] of buttons) b.setAttribute('aria-pressed', String(id === model.draft.role));
  }

  function buildSub(): void {
    clear(sub);
    const d = model.draft;
    const info = roleInfo(d.role);
    if (info.ranks.length > 1) {
      const field = widgets.field('Grade', null, { value: rankLabel(d.rank, d.role), hint: d.rank ? RANK_NOTES[d.rank] ?? '' : '' });
      const seg = widgets.segmented<PoliceRank>({
        label: 'Grade',
        options: info.ranks.map((r) => ({ value: r, label: rankLabel(r, d.role) })),
        value: d.rank ?? info.ranks[0]!,
        wrap: true,
        onChange: (rank: PoliceRank) => {
          model.update({ rank });
          field.setValue(rankLabel(rank, model.draft.role));
          field.setHint(RANK_NOTES[rank] ?? '');
        },
      });
      field.el.insertBefore(seg.el, field.el.lastElementChild);
      sub.append(widgets.sectionTitle('Grade et poste'), field.el);
    } else if (info.ranks.length === 1) {
      sub.append(widgets.sectionTitle('Grade et poste'));
      sub.append(widgets.field('Grade', null, { value: rankLabel(info.ranks[0]!, d.role), hint: RANK_NOTES[info.ranks[0]!] ?? '' }).el);
    }
    if (info.postes.length > 1) {
      const field = widgets.field('Poste', null, { value: d.poste ? POSTE_LABELS[d.poste] : '', hint: d.poste ? POSTE_NOTES[d.poste] ?? '' : '' });
      const seg = widgets.segmented<PolicePoste>({
        label: 'Poste',
        options: info.postes.map((p) => ({ value: p, label: POSTE_LABELS[p] })),
        value: d.poste ?? info.postes[0]!,
        wrap: true,
        onChange: (poste: PolicePoste) => {
          model.update({ poste });
          field.setValue(POSTE_LABELS[poste]);
          field.setHint(POSTE_NOTES[poste] ?? '');
        },
      });
      field.el.insertBefore(seg.el, field.el.lastElementChild);
      sub.append(field.el);
    }
    if (info.variantes.length > 0) {
      const current = info.variantes.find((v) => v.id === d.variante) ?? info.variantes[0]!;
      const label = d.role === 'secouriste' ? 'Service' : 'Façon de jouer';
      const field = widgets.field(label, null, { value: current.label, hint: current.desc });
      const seg = widgets.segmented<string>({
        label,
        options: info.variantes.map((v) => ({ value: v.id, label: v.label })),
        value: current.id,
        wrap: true,
        onChange: (variante: string) => {
          model.update({ variante });
          const v = info.variantes.find((x) => x.id === variante)!;
          field.setValue(v.label);
          field.setHint(v.desc);
        },
      });
      field.el.insertBefore(seg.el, field.el.lastElementChild);
      sub.append(widgets.sectionTitle(label), field.el);
    }
    if (d.role === 'manifestant' && d.variante === 'radical') {
      sub.append(note('Ce profil se joue au niveau des gestes de jeu ; la partie se termine par un bilan humain et judiciaire.', true));
    }
  }

  for (const r of ROLES) {
    const b = widgets.card({
      icon: roleIconName(r.id),
      title: r.name,
      desc: r.desc,
      selected: r.id === model.draft.role,
      onClick: () => {
        if (model.draft.role === r.id) return;
        // grade, poste et variante reviennent aux valeurs par défaut du nouveau rôle
        model.update({ role: r.id, rank: r.defaultRank, poste: r.defaultPoste, variante: r.variantes[0]?.id ?? '' });
        paintCards();
        buildSub();
      },
    });
    b.dataset.id = 'role-' + r.id;
    buttons.set(r.id, b);
    cards.append(b);
  }
  buildSub();
  root.append(cards, sub);
  return root;
}

// ───────────────────────────── mode et mission ─────────────────────────────

export function buildMode(model: HomeModel): HTMLElement {
  const { widgets, kit, ctx } = model.env;
  const root = h('div');
  const cards = h('div', 'ui-cards');
  const body = h('div');
  const modeButtons = new Map<string, HTMLButtonElement>();

  function buildBody(): void {
    clear(body);
    const d = model.draft;
    if (d.mode === 'monde_ouvert') {
      body.append(widgets.sectionTitle('Mission'), note('Monde ouvert : patrouille libre dans Paris. Aucune mission ni manifestation n’est imposée ; l’heure, la météo, le lieu et les moyens restent réglables.'));
      return;
    }
    if (d.mode === 'carriere') {
      if (kit.hasScreen('carriere')) {
        const open = widgets.button('Ouvrir la carrière', () => ctx.ui.open('carriere'), 'secondary', 'chevrons');
        body.append(widgets.sectionTitle('Carrière'), note('En carrière, votre grade et les missions proposées dépendent de votre progression.'), el('div', 'ui-inline', open));
        (body.lastElementChild as HTMLElement).style.marginTop = '10px';
      } else {
        body.append(widgets.sectionTitle('Carrière'), note('Le suivi de carrière (grades, évaluations, sanctions) n’est pas installé dans cette version : la partie se joue avec les réglages de cette page, sans progression enregistrée.', true));
      }
    }
    body.append(widgets.sectionTitle('Mission'));
    const list = h('div', 'ui-list');
    const items = new Map<string, HTMLButtonElement>();
    const paint = (): void => {
      for (const [id, b] of items) b.setAttribute('aria-pressed', String(id === model.draft.missionId));
    };
    const add = (id: string, title: string, sub: string, trail: string, onPick: () => void): void => {
      const b = h('button', 'ui-list__item');
      b.type = 'button';
      b.dataset.id = 'mission-' + (id || 'libre');
      b.append(h('span', 'ui-list__title', title), h('span', 'ui-list__trail', trail), h('span', 'ui-list__sub', sub));
      b.addEventListener('click', onPick);
      items.set(id, b);
      list.append(b);
    };
    add('', 'Scénario libre', 'La manifestation se déroule selon vos réglages, sans objectifs imposés.', '', () => {
      model.update({ missionId: '' });
      paint();
    });
    const role = d.role;
    const usable = model.missions.filter((m) => m.roles.length === 0 || m.roles.indexOf(role) >= 0);
    for (const m of usable) {
      const stars = m.difficulty > 0 ? '★'.repeat(m.difficulty) + '☆'.repeat(5 - m.difficulty) : '';
      const sub = [m.type, m.place, m.summary].filter((x) => x).join(' — ');
      add(m.id, m.title, sub, stars, () => {
        // la mission apporte ses préréglages (lieu, heure, foule…) ; le reste du brouillon est conservé
        const base = buildSessionConfig(model.draft);
        const merged = { ...base, ...m.config, missionId: m.id, extra: { ...(base.extra ?? {}), ...((m.config.extra as Record<string, unknown> | undefined) ?? {}) } };
        if (m.config.place && m.config.x === undefined) {
          delete merged.x;
          delete merged.z;
        }
        model.replace(draftFromConfig(merged, model.draft));
      });
    }
    paint();
    body.append(list);
    if (model.missions.length === 0) {
      const p = note('Le catalogue des missions apparaîtra ici dès que le module des missions sera installé. En attendant, tout se règle librement dans les autres sections.');
      p.style.marginTop = '10px';
      body.append(p);
    } else if (usable.length === 0) {
      const p = note('Aucune mission du catalogue n’est prévue pour ce rôle : jouez en scénario libre, ou changez de rôle.');
      p.style.marginTop = '10px';
      body.append(p);
    }
  }

  for (const m of MODES) {
    const b = widgets.card({
      title: m.label,
      desc: m.desc,
      selected: m.id === model.draft.mode,
      onClick: () => {
        if (model.draft.mode === m.id) return;
        model.update({ mode: m.id, missionId: m.id === 'monde_ouvert' ? '' : model.draft.missionId });
        for (const [id, btn] of modeButtons) btn.setAttribute('aria-pressed', String(id === model.draft.mode));
        buildBody();
      },
    });
    b.dataset.id = 'mode-' + m.id;
    modeButtons.set(m.id, b);
    cards.append(b);
  }
  buildBody();
  root.append(cards, body);
  return root;
}

// ───────────────────────────── lieu ─────────────────────────────

export function buildLieu(model: HomeModel): HTMLElement {
  const { ctx } = model.env;
  const root = h('div', 'ui-place');
  const listCol = h('div');
  const side = h('div', 'ui-place__side');
  const plan = h('div', 'ui-miniplan');
  const canvas = h('canvas');
  canvas.setAttribute('role', 'img');
  const cap = h('div', 'ui-miniplan__cap');
  plan.append(canvas, cap);
  const noteEl = h('p', 'ui-sub');
  side.append(plan, noteEl);

  const all: PlaceChoice[] = [...model.places, ...model.otherPlaces];
  const buttons: HTMLButtonElement[] = [];
  let view: MiniPlanView | null = null;

  function selectedIndex(): number {
    const name = fold(model.draft.place);
    return all.findIndex((p) => fold(p.name) === name);
  }

  function paint(): void {
    const sel = selectedIndex();
    for (let i = 0; i < buttons.length; i++) buttons[i]!.setAttribute('aria-pressed', String(i === sel));
    view = drawMiniPlan(canvas, ctx, all, sel);
    const place = sel >= 0 ? all[sel]! : null;
    canvas.setAttribute('aria-label', place ? `Plan de situation : ${place.name}` : 'Plan de situation');
    cap.textContent = view.real ? 'Grands axes du cœur de Paris' : 'Plan schématique du cœur de Paris';
    noteEl.textContent = (place && place.note ? place.note + '. ' : '') + 'Touchez le plan pour choisir le lieu le plus proche.';
  }

  const addList = (title: string, places: readonly PlaceChoice[], offset: number): void => {
    if (places.length === 0) return;
    listCol.append(model.env.widgets.sectionTitle(title));
    const list = h('div', 'ui-list');
    places.forEach((p, i) => {
      const b = h('button', 'ui-list__item');
      b.type = 'button';
      b.dataset.id = 'lieu-' + (offset + i);
      b.append(h('span', 'ui-list__title', p.name));
      if (p.note) b.append(h('span', 'ui-list__sub', p.note));
      b.addEventListener('click', () => {
        model.update({ place: p.name, x: p.x, z: p.z });
        paint();
      });
      buttons[offset + i] = b;
      list.append(b);
    });
    listCol.append(list);
  };
  // choisir sur le plan : le lieu proposé le plus proche du point touché
  canvas.style.cursor = 'pointer';
  canvas.addEventListener('click', (e) => {
    if (!view) return;
    const r = canvas.getBoundingClientRect();
    const w = view.toWorld(e.clientX - r.left, e.clientY - r.top);
    const i = nearestPlace(all, w.x, w.z);
    if (i < 0) return;
    const p = all[i]!;
    model.update({ place: p.name, x: p.x, z: p.z });
    paint();
    buttons[i]?.scrollIntoView({ block: 'nearest' });
  });
  addList('Lieux de manifestation', model.places, 0);
  addList('Autres places', model.otherPlaces, model.places.length);
  root.append(listCol, side);
  // le canevas n'a de largeur qu'une fois inséré dans la page
  requestAnimationFrame(() => {
    if (canvas.isConnected) paint();
  });
  paint();
  return root;
}

// ───────────────────────────── heure, météo, vent ─────────────────────────────

const WIND_DIRS: readonly number[] = [0, 45, 90, 135, 180, 225, 270, 315];

export function buildMeteo(model: HomeModel): HTMLElement {
  const { widgets } = model.env;
  const root = h('div');
  const d = model.draft;

  // heure
  const sky = h('div', 'ui-sky');
  const skyLabel = h('span', 'ui-sky__label');
  sky.append(h('span', 'ui-sky__disc'), h('span', 'ui-sky__roofs'), skyLabel);
  const hourField = widgets.field('Heure de début', null, { value: hourLabel(d.timeOfDay) });
  const paintSky = (hour: number): void => {
    const phase = dayPhase(hour);
    sky.dataset.phase = phase;
    skyLabel.textContent = DAY_PHASE_LABELS[phase];
    // course du soleil de 7 h à 20 h, de la lune de 20 h à 7 h
    const day = hour >= 7 && hour < 20;
    const t = day ? (hour - 7) / 13 : ((hour - 20 + 24) % 24) / 11;
    sky.style.setProperty('--t', t.toFixed(3));
    sky.style.setProperty('--y', (1 - Math.sin(Math.PI * t)).toFixed(3));
  };
  const hourSlider = widgets.slider({
    label: 'Heure de début',
    min: 0, max: 23.75, step: 0.25, value: d.timeOfDay,
    variant: 'plain',
    format: hourLabel,
    onInput: (hour: number) => {
      model.update({ timeOfDay: hour });
      hourField.setValue(hourLabel(hour));
      paintSky(hour);
    },
  });
  hourSlider.el.dataset.id = 'heure';
  hourField.el.insertBefore(sky, hourField.el.lastElementChild);
  hourField.el.insertBefore(hourSlider.el, hourField.el.lastElementChild);
  paintSky(d.timeOfDay);

  // météo
  const chips = h('div', 'ui-chips');
  chips.setAttribute('role', 'group');
  chips.setAttribute('aria-label', 'Météo');
  const chipButtons = new Map<WeatherKind, HTMLButtonElement>();
  for (const w of WEATHERS) {
    const b = widgets.chip({
      label: w.label,
      icon: weatherIconName(w.id),
      selected: w.id === d.weather,
      onClick: () => {
        model.update({ weather: w.id });
        weatherField.setValue(w.label);
        for (const [id, btn] of chipButtons) btn.setAttribute('aria-pressed', String(id === w.id));
      },
    });
    b.dataset.id = 'meteo-' + w.id;
    chipButtons.set(w.id, b);
    chips.append(b);
  }

  // vent
  const windField = widgets.field('Vent', null, { value: windLabel(d.windDir, d.windSpeed), hint: 'Le vent pousse le gaz lacrymogène et la fumée : il peut les rabattre sur vos propres lignes.' });
  const paintWind = (): void => windField.setValue(windLabel(model.draft.windDir, model.draft.windSpeed));
  const dirSeg = widgets.segmented<string>({
    label: 'Direction d’où vient le vent',
    options: WIND_DIRS.map((deg) => ({ value: String(deg), label: cardinal8(deg) })),
    value: String(d.windDir),
    onChange: (value: string) => {
      model.update({ windDir: Number(value) });
      paintWind();
    },
  });
  const speedSlider = widgets.slider({
    label: 'Vitesse du vent',
    min: 0, max: 60, step: 5, value: Math.min(60, d.windSpeed),
    format: (v: number) => `${v} km/h`,
    onInput: (windSpeed: number) => {
      model.update({ windSpeed });
      paintWind();
    },
  });
  windField.el.insertBefore(dirSeg.el, windField.el.lastElementChild);
  windField.el.insertBefore(speedSlider.el, windField.el.lastElementChild);

  const weatherField = widgets.field('Météo', null, { value: weatherLabel(d.weather) });
  weatherField.el.insertBefore(chips, weatherField.el.lastElementChild);
  root.append(hourField.el, weatherField.el, windField.el);
  return root;
}
