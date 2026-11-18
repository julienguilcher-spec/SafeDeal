/* =====================================================================================
 * Page d'accueil — panneaux de réglages (1/2) : rôle, mission, lieu, heure et météo.
 * Chaque fonction construit le contenu d'une section à partir du brouillon et appelle
 * model.update() à chaque réglage.
 * En mode carrière (service 'career' branché) : rôles verrouillés au-delà du grade de carrière, grade
 * imposé, missions verrouillées grisées avec leur raison, rôles hors carrière (équipage de patrouille) masqués ;
 * dans les autres modes, rien ne change. Le mode de jeu se choisit sur l'accueil (Patrouille, Carrière, Missions
 * spéciales, Mode libre) : l'éditeur ne propose plus que la mission.
 * ===================================================================================== */

import type { PolicePoste, PoliceRank, WeatherKind } from '@/core/contracts';
import { rankOpeningRole } from '@/gameplay/career/api';
import type { CareerApi } from '@/gameplay/career/api';
import type { MissionLike } from '../core/api';
import { clear, el, h } from '../core/dom';
import { cardinal8, hourLabel } from '../core/format';
import { icon, roleIconName, weatherIconName } from '../core/icons';
import { RANK_NOTES, ROLES, WEATHERS, fold, posteLabel, posteNote, rankLabel, roleInfo, weatherLabel } from './catalog';
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
    const inCareer = careerOf(model);
    if (inCareer && info.ranks.length > 0) {
      // carrière : le grade suit la progression, il ne se choisit pas
      const hint = `En carrière, le grade suit votre progression (${rankLabel(inCareer.progress.rank)}).` + (d.rank && RANK_NOTES[d.rank] ? ' ' + RANK_NOTES[d.rank] : '');
      sub.append(widgets.sectionTitle('Grade et poste'), widgets.field('Grade', null, { value: rankLabel(d.rank, d.role), hint }).el);
    } else if (info.ranks.length > 1) {
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
      const role = d.role;
      const label = role === 'patrouille' ? 'Votre place' : 'Poste';
      const field = widgets.field(label, null, { value: d.poste ? posteLabel(role, d.poste) : '', hint: d.poste ? posteNote(role, d.poste) : '' });
      const seg = widgets.segmented<PolicePoste>({
        label,
        options: info.postes.map((p) => ({ value: p, label: posteLabel(role, p) })),
        value: d.poste ?? info.postes[0]!,
        wrap: true,
        onChange: (poste: PolicePoste) => {
          model.update({ poste });
          field.setValue(posteLabel(role, poste));
          field.setHint(posteNote(role, poste));
        },
      });
      seg.el.dataset.id = 'poste';
      field.el.insertBefore(seg.el, field.el.lastElementChild);
      sub.append(field.el);
    }
    if (info.variantes.length > 0) {
      const current = info.variantes.find((v) => v.id === d.variante) ?? info.variantes[0]!;
      const label = d.role === 'secouriste' ? 'Service' : d.role === 'patrouille' ? 'Équipage' : 'Façon de jouer';
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
    if (d.role === 'patrouille') {
      const p = note('En Mode libre, l’équipage part en voiture à l’écart de la manifestation, sans journée de service. Pour être envoyé par la radio sur ce qui se déclare dans Paris, choisissez « Patrouille » sur l’accueil.');
      p.style.marginTop = '10px';
      sub.append(p);
    }
  }

  const career = careerOf(model);
  const openRoles = career ? career.availableRoles() : null;
  for (const r of ROLES) {
    // commandant unique : « commissaire » est un alias du commandant, sans tuile propre (docs/BRIEF.md §1)
    if (r.id === 'commissaire') continue;
    // carrière : un rôle hors carrière (équipage de patrouille) n'a aucune mission de carrière, sa tuile est masquée
    if (career && r.horsCarriere) continue;
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
    if (openRoles && openRoles.indexOf(r.id) < 0) {
      // carrière : rôle pas encore ouvert par le grade
      const from = rankOpeningRole(r.id);
      const reason = from ? `Ouvert en carrière au grade de ${rankLabel(from).toLowerCase()}.` : 'Non ouvert en carrière.';
      b.disabled = true;
      b.classList.add('is-locked');
      b.style.opacity = '.5';
      b.setAttribute('aria-label', `${r.name} — verrouillé : ${reason}`);
      const box = b.querySelector('.ui-card__icon');
      if (box) {
        clear(box);
        box.append(icon('lock'));
      }
      const desc = b.querySelector('.ui-card__desc');
      if (desc) desc.textContent = reason;
    }
    buttons.set(r.id, b);
    cards.append(b);
  }
  if (career) {
    const p = note(`Carrière : vous êtes ${rankLabel(career.progress.rank).toLowerCase()}. Les rôles grisés s’ouvrent avec les promotions ; les rôles civils sont toujours ouverts.`);
    p.style.marginBottom = '10px';
    root.append(p);
  }
  buildSub();
  root.append(cards, sub);
  return root;
}

// ───────────────────────────── mode et mission ─────────────────────────────

/** Service de carrière quand le mode carrière est choisi (null sinon : les panneaux ne changent pas). */
function careerOf(model: HomeModel): CareerApi | null {
  return model.draft.mode === 'carriere' ? model.career : null;
}

/** Choisit une mission : elle apporte ses préréglages (lieu, heure, foule…) ; le reste du brouillon est conservé. */
export function pickMission(model: HomeModel, m: MissionLike): void {
  const base = buildSessionConfig(model.draft);
  const merged = { ...base, ...m.config, missionId: m.id, extra: { ...(base.extra ?? {}), ...((m.config.extra as Record<string, unknown> | undefined) ?? {}) } };
  if (m.config.place && m.config.x === undefined) {
    delete merged.x;
    delete merged.z;
  }
  // la fiche de mission se règle en mode libre : choisie en carrière, elle y reste (sinon rien ne serait enregistré)
  if (base.mode === 'carriere') merged.mode = 'carriere';
  model.replace(draftFromConfig(merged, model.draft));
}

export function buildMode(model: HomeModel): HTMLElement {
  const { widgets, kit, ctx } = model.env;
  const root = h('div');
  const body = h('div');

  function buildBody(): void {
    clear(body);
    const d = model.draft;
    if (d.mode === 'monde_ouvert') {
      // ancien scénario « Monde ouvert » rechargé : il se lance en Patrouille ; l'éditeur ramène au Mode libre
      body.append(widgets.sectionTitle('Patrouille'), note('Ce scénario est une patrouille : il se lance en vacation BAC au secteur le plus proche du lieu, sans manifestation déclarée. Pour régler une manifestation, passez en Mode libre.'));
      const back = widgets.button('Passer en Mode libre', () => {
        model.update({ mode: 'libre' });
        model.rebuild();
      }, 'secondary', 'chevrons');
      back.dataset.id = 'mode-libre';
      const row = el('div', 'ui-inline', back);
      row.style.marginTop = '10px';
      body.append(row);
      return;
    }
    const career = careerOf(model);
    if (d.mode === 'carriere') {
      if (kit.hasScreen('carriere')) {
        const open = widgets.button('Ouvrir la carrière', () => ctx.ui.open('carriere'), 'secondary', 'chevrons');
        body.append(widgets.sectionTitle('Carrière'));
        if (career) {
          const c = career.chapters[career.progress.chapter];
          const where = c ? ` — chapitre ${c.index} « ${c.title} » : ${c.progressLabel}` : '';
          const rank = h('div', 'ui-sub', `Grade : ${rankLabel(career.progress.rank)}${where}.`);
          rank.dataset.id = 'carriere-grade';
          rank.style.marginBottom = '8px';
          body.append(rank);
        }
        body.append(note('En carrière, votre grade et les missions proposées dépendent de votre progression. Seules les missions jouées en mode carrière comptent.'));
        const leave = widgets.button('Jouer hors carrière', () => {
          model.update({ mode: 'libre' });
          model.rebuild();
        }, 'ghost');
        leave.dataset.id = 'mode-libre';
        leave.setAttribute('data-tip', 'Mode libre : tous les rôles et tous les réglages, rien n’est enregistré dans la carrière');
        const row = el('div', 'ui-inline', open, leave);
        row.style.marginTop = '10px';
        body.append(row);
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
    const add = (id: string, title: string, sub: string, trail: string, onPick: (() => void) | null): HTMLButtonElement => {
      const b = h('button', 'ui-list__item');
      b.type = 'button';
      b.dataset.id = 'mission-' + (id || 'libre');
      b.append(h('span', 'ui-list__title', title), h('span', 'ui-list__trail', trail), h('span', 'ui-list__sub', sub));
      if (onPick) b.addEventListener('click', onPick);
      items.set(id, b);
      list.append(b);
      return b;
    };
    const inCareer = career;
    add('', 'Scénario libre', inCareer ? 'Selon vos réglages, sans objectifs imposés : rien n’est enregistré dans la carrière.' : 'La manifestation se déroule selon vos réglages, sans objectifs imposés.', '', () => {
      model.update({ missionId: '' });
      paint();
    });
    const role = d.role;
    const forRole = (m: MissionLike): boolean => m.roles.length === 0 || m.roles.indexOf(role) >= 0;
    const stars = (m: MissionLike): string => (m.difficulty > 0 ? '★'.repeat(m.difficulty) + '☆'.repeat(5 - m.difficulty) : '');
    const subOf = (m: MissionLike): string => [m.type, m.place, m.summary].filter((x) => x).join(' — ');
    let usable: MissionLike[];
    if (inCareer) {
      // carrière : toutes les missions ouvertes (le rôle suit la mission choisie), par chapitre, puis celles du rôle
      // courant encore verrouillées, grisées avec leur raison
      const ranked = model.missions.map((m) => ({ m, s: inCareer.missionStatus(m.id) })).filter((x) => x.s.chapter >= 0);
      const open = ranked.filter((x) => x.s.available).sort((a, b) => a.s.chapter - b.s.chapter);
      usable = open.map((x) => x.m);
      for (const { m, s } of open) {
        const r = inCareer.progress.results[m.id];
        const trail = `Ch. ${s.chapter}` + (r ? ` · ${r.success ? 'réussie' : 'jouée'}, ${r.best}` : ' · ' + stars(m));
        add(m.id, m.title, subOf(m), trail, () => pickMission(model, m));
      }
      for (const { m, s } of ranked) {
        if (s.available || !forRole(m)) continue;
        const b = add(m.id, m.title, s.reason, `Ch. ${s.chapter}`, null);
        b.disabled = true;
        b.classList.add('is-locked');
        b.style.opacity = '.5';
        b.setAttribute('aria-label', `${m.title} — verrouillée : ${s.reason}`);
        const lock = icon('lock');
        lock.style.cssText = 'display:inline-block;width:14px;height:14px;vertical-align:-2px;margin-right:6px';
        b.firstElementChild?.prepend(lock);
      }
    } else {
      usable = model.missions.filter(forRole);
      for (const m of usable) add(m.id, m.title, subOf(m), stars(m), () => pickMission(model, m));
    }
    paint();
    body.append(list);
    if (model.missions.length === 0) {
      const p = note('Le catalogue des missions apparaîtra ici dès que le module des missions sera installé. En attendant, tout se règle librement dans les autres sections.');
      p.style.marginTop = '10px';
      body.append(p);
    } else if (usable.length === 0) {
      const p = note(inCareer ? 'Aucune mission n’est encore ouverte dans votre carrière.' : 'Aucune mission du catalogue n’est prévue pour ce rôle : jouez en scénario libre, ou changez de rôle.');
      p.style.marginTop = '10px';
      body.append(p);
    }
  }

  buildBody();
  root.append(body);
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

  let hasardNote: HTMLElement | null = null;

  function paint(): void {
    if (hasardNote && !model.draft.lieuHasard) hasardNote.hidden = true;
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
        // choisir un lieu, c'est renoncer au tirage au hasard
        model.update({ place: p.name, x: p.x, z: p.z, lieuHasard: false });
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
    model.update({ place: p.name, x: p.x, z: p.z, lieuHasard: false });
    paint();
    buttons[i]?.scrollIntoView({ block: 'nearest' });
  });
  if (model.draft.lieuHasard && model.draft.missionId === '') {
    // case « Lieu tiré au hasard » cochée (rubrique « La manifestation ») : choisir ici la décoche
    hasardNote = note('Le lieu sera tiré au hasard au lancement. Choisissez un lieu ci-dessous pour le fixer vous-même.');
    hasardNote.style.marginBottom = '10px';
    listCol.append(hasardNote);
  }
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
