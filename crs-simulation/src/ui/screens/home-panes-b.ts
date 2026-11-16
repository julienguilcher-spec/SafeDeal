/* =====================================================================================
 * Page d'accueil — panneaux de réglages (2/2) : manifestation (affluence, cause, composition),
 * tension et durée, moyens engagés, options, scénarios enregistrés.
 * ===================================================================================== */

import type { DurationPreset, ViolenceLevel } from '@/core/contracts';
import type { CrowdFamily, Derapage, SavedScenario, ScenarioMeans } from '../core/api';
import { Txt, clear, el, h } from '../core/dom';
import { dateLabel, decimal, hourLabel, int, percent, times } from '../core/format';
import { icon } from '../core/icons';
import {
  BLACK_BLOC_MAX, CROWD_STOPS, DERAPAGES, DURATIONS, FAMILIES, MEANS_LABELS, MEANS_LIMITS,
} from './catalog';
import type { HomeModel } from './home';
import {
  buildSessionConfig, compositionShares, defaultDraft, draftFromConfig, forceRatio, identityLabel, simulatedCrowd, suggestName,
  tensionLabel, volatilityLabel,
} from './scenario';
import { MAX_NAME_LENGTH } from './scenarios-store';

function note(text: string, warn = false): HTMLElement {
  return el('div', 'ui-note' + (warn ? ' ui-note--warn' : ''), icon(warn ? 'warning' : 'info'), h('span', undefined, text));
}

// ───────────────────────────── manifestation ─────────────────────────────

export function buildFoule(model: HomeModel): HTMLElement {
  const { widgets, ctx } = model.env;
  const root = h('div');
  const d = model.draft;
  if (d.mode === 'monde_ouvert') {
    root.append(note('En monde ouvert, aucune manifestation n’est déclarée au départ : ces réglages servent si un rassemblement se forme en cours de patrouille.'));
    (root.lastElementChild as HTMLElement).style.marginBottom = '12px';
  }

  // affluence
  const crowdHint = (): string => {
    const scale = ctx.settings.values.crowdScale;
    const simulated = simulatedCrowd(model.draft.crowdSize, scale);
    return scale === 1
      ? `Effectif réellement simulé : ${int(simulated)} personnes (densité de foule ${times(scale)}, réglable dans les paramètres).`
      : `Effectif réellement simulé : ${int(simulated)} personnes — densité de foule ${times(scale)} dans les paramètres graphiques.`;
  };
  const crowdField = widgets.field('Affluence', null, { value: `${int(d.crowdSize)} manifestants`, hint: crowdHint() });
  const crowdSlider = widgets.slider({
    label: 'Affluence',
    min: CROWD_STOPS[0]!, max: CROWD_STOPS[CROWD_STOPS.length - 1]!, step: 1, value: d.crowdSize, stops: CROWD_STOPS,
    format: (v: number) => `${int(v)} manifestants`,
    onInput: (crowdSize: number) => {
      model.update({ crowdSize });
      crowdField.setValue(`${int(crowdSize)} manifestants`);
      crowdField.setHint(crowdHint());
    },
  });
  crowdSlider.el.dataset.id = 'affluence';
  crowdField.el.insertBefore(crowdSlider.el, crowdField.el.lastElementChild);
  root.append(crowdField.el);

  // cause
  const chips = h('div', 'ui-chips');
  chips.setAttribute('role', 'group');
  chips.setAttribute('aria-label', 'Cause de la manifestation');
  const chipButtons = new Map<string, HTMLButtonElement>();
  for (const c of model.causes) {
    const b = widgets.chip({
      label: c.label,
      selected: c.id === d.cause,
      onClick: () => {
        model.update({ cause: c.id, causeLabel: c.label });
        for (const [id, btn] of chipButtons) btn.setAttribute('aria-pressed', String(id === c.id));
      },
    });
    b.dataset.id = 'cause-' + c.id;
    chipButtons.set(c.id, b);
    chips.append(b);
  }
  root.append(widgets.sectionTitle('Cause défendue'), chips);
  const causeHint = h('p', 'ui-field__hint', 'Elle se lit sur les pancartes, les banderoles et dans les slogans. Les organisations représentées sont fictives.');
  causeHint.style.marginTop = '8px';
  root.append(causeHint);

  // composition
  root.append(widgets.sectionTitle('Composition du cortège'));
  const bar = h('div', 'ui-compo-bar');
  bar.style.marginBottom = '6px';
  const rows = h('div', 'ui-compo');
  const pcts = new Map<CrowdFamily, Txt>();
  const paint = (): void => {
    const shares = compositionShares(model.draft.composition);
    clear(bar);
    for (const f of FAMILIES) {
      const share = shares[f.id];
      pcts.get(f.id)?.set(percent(share));
      if (share <= 0) continue;
      const seg = h('i');
      seg.dataset.f = f.id;
      seg.style.flex = `${share} 0 0`;
      seg.style.backgroundColor = f.color;
      bar.append(seg);
    }
  };
  for (const f of FAMILIES) {
    const isBloc = f.id === 'black_bloc';
    const dot = h('span', 'ui-compo__dot');
    dot.style.backgroundColor = f.color;
    const pct = h('span', 'ui-compo__pct');
    pcts.set(f.id, new Txt(pct));
    const slider = widgets.slider({
      label: isBloc ? 'Part de black bloc' : `Poids : ${f.label}`,
      min: 0, max: isBloc ? BLACK_BLOC_MAX : 100, step: isBloc ? 1 : 5, value: d.composition[f.id],
      onInput: (v: number) => {
        model.update({ composition: { ...model.draft.composition, [f.id]: v } });
        paint();
      },
    });
    slider.el.dataset.id = 'compo-' + f.id;
    rows.append(el('div', 'ui-compo__row', dot, h('span', 'ui-compo__label', f.label), slider.el, pct));
  }
  paint();
  root.append(bar, rows);
  const compoHint = h('p', 'ui-field__hint', `Le black bloc se règle en part réelle du cortège (${BLACK_BLOC_MAX} % au plus) ; les autres familles se partagent le reste selon leur poids.`);
  compoHint.style.marginTop = '6px';
  root.append(compoHint);
  return root;
}

// ───────────────────────────── tension et durée ─────────────────────────────

export function buildTension(model: HomeModel): HTMLElement {
  const { widgets } = model.env;
  const root = h('div');
  const d = model.draft;

  const tensionField = widgets.field('Tension de départ', null, {
    value: `${percent(d.tension)} — ${tensionLabel(d.tension)}`,
    hint: 'Le climat à l’arrivée des premiers manifestants. Une foule calme peut le rester toute la journée.',
  });
  const tensionSlider = widgets.slider({
    label: 'Tension de départ', min: 0, max: 100, step: 5, value: Math.round(d.tension * 100), variant: 'heat',
    format: (v: number) => `${v} %`,
    onInput: (v: number) => {
      model.update({ tension: v / 100 });
      tensionField.setValue(`${percent(v / 100)} — ${tensionLabel(v / 100)}`);
    },
  });
  tensionSlider.el.dataset.id = 'tension';
  tensionField.el.insertBefore(tensionSlider.el, tensionField.el.lastElementChild);

  const volField = widgets.field('Propension à dégénérer', null, {
    value: `${percent(d.volatility)} — ${volatilityLabel(d.volatility)}`,
    hint: 'À quelle vitesse la tension monte après un incident. Un usage aveugle de la force radicalise aussi la foule pacifique.',
  });
  const volSlider = widgets.slider({
    label: 'Propension à dégénérer', min: 0, max: 100, step: 5, value: Math.round(d.volatility * 100), variant: 'heat',
    format: (v: number) => `${v} %`,
    onInput: (v: number) => {
      model.update({ volatility: v / 100 });
      volField.setValue(`${percent(v / 100)} — ${volatilityLabel(v / 100)}`);
    },
  });
  volSlider.el.dataset.id = 'volatilite';
  volField.el.insertBefore(volSlider.el, volField.el.lastElementChild);

  const current = DERAPAGES.find((x) => x.id === d.derapage) ?? DERAPAGES[0]!;
  const derField = widgets.field('Qui dérape', null, { value: current.label, hint: current.tip });
  const derSeg = widgets.segmented<Derapage>({
    label: 'Qui dérape',
    options: DERAPAGES.map((x) => ({ value: x.id, label: x.label })),
    value: d.derapage,
    wrap: true,
    onChange: (derapage: Derapage) => {
      model.update({ derapage });
      const x = DERAPAGES.find((y) => y.id === derapage)!;
      derField.setValue(x.label);
      derField.setHint(x.tip);
    },
  });
  derField.el.insertBefore(derSeg.el, derField.el.lastElementChild);

  const durField = widgets.field('Durée de la manifestation', null, {
    value: DURATIONS.find((x) => x.id === d.duration)!.long,
    hint: 'La mission dure tant que la manifestation n’est pas terminée. En temps réel, elle suit son rythme propre.',
  });
  const durSeg = widgets.segmented<DurationPreset>({
    label: 'Durée',
    options: DURATIONS.map((x) => ({ value: x.id, label: x.label })),
    value: d.duration,
    onChange: (duration: DurationPreset) => {
      model.update({ duration });
      durField.setValue(DURATIONS.find((x) => x.id === duration)!.long);
    },
  });
  durSeg.el.dataset.id = 'duree';
  durField.el.insertBefore(durSeg.el, durField.el.lastElementChild);

  root.append(tensionField.el, volField.el, derField.el, durField.el);
  return root;
}

// ───────────────────────────── moyens engagés ─────────────────────────────

export function buildMoyens(model: HomeModel): HTMLElement {
  const { widgets } = model.env;
  const root = h('div');
  const ratioEl = h('div');
  const paintRatio = (): void => {
    clear(ratioEl);
    const d = model.draft;
    const { agents, per100 } = forceRatio(d);
    if (d.mode === 'monde_ouvert') {
      ratioEl.append(note(`${int(agents)} agents à pied engagés pour la patrouille.`));
      return;
    }
    const text = `${int(agents)} agents à pied pour ${int(d.crowdSize)} manifestants, soit ${decimal(per100, 1)} pour 100. À Paris, on compte d’ordinaire 3 à 10 policiers et gendarmes pour 100 manifestants.`;
    const low = agents > 0 && (d.moyens.sections < 2 || per100 < 2);
    ratioEl.append(note(low ? text + ' Dispositif léger : une unité n’est jamais engagée à moins de deux sections.' : text, low));
  };
  const grid = h('div', 'ui-means');
  for (const key of Object.keys(MEANS_LIMITS) as (keyof typeof MEANS_LIMITS)[]) {
    const info = MEANS_LABELS[key];
    const [min, max] = MEANS_LIMITS[key];
    const stepper = widgets.stepper({
      label: info.label, min, max, value: model.draft.moyens[key],
      onChange: (value: number) => {
        const moyens: ScenarioMeans = { ...model.draft.moyens, [key]: value };
        model.update({ moyens });
        paintRatio();
      },
    });
    stepper.el.dataset.id = 'moyen-' + key;
    grid.append(el('div', 'ui-mean', el('div', undefined, h('div', 'ui-mean__label', info.label), h('div', 'ui-mean__hint', info.hint)), stepper.el));
  }
  const onCall = widgets.toggle({
    label: 'Secours sur appel',
    hint: 'Pompiers et SAMU ne sont pas sur place : on les demande par radio, ils arrivent après un délai réaliste.',
    value: model.draft.moyens.secours_sur_appel,
    onChange: (value: boolean) => model.update({ moyens: { ...model.draft.moyens, secours_sur_appel: value } }),
  });
  paintRatio();
  ratioEl.style.margin = '12px 0 4px';
  root.append(grid, ratioEl, onCall.el);
  return root;
}

// ───────────────────────────── options ─────────────────────────────

export function buildOptions(model: HomeModel): HTMLElement {
  const { widgets, ctx } = model.env;
  const root = h('div');
  const d = model.draft;

  const sanctions = widgets.toggle({
    label: 'Sanctions actives',
    hint: 'Une bavure entraîne enquête de l’inspection, blâme, rétrogradation, voire révocation.',
    value: d.options.sanctions,
    onChange: (value: boolean) => model.update({ options: { ...model.draft.options, sanctions: value } }),
  });
  sanctions.el.dataset.id = 'opt-sanctions';

  const journee = widgets.toggle({
    label: 'Journée de service (départ de la caserne)',
    hint: 'Prise de service à la caserne de la Cité, puis trajet en colonne de fourgons, sirènes, jusqu’à la manifestation ; retour à la fin. Désactivé : vous commencez déjà sur place.',
    value: d.options.journee,
    onChange: (value: boolean) => model.update({ options: { ...model.draft.options, journee: value } }),
  });
  journee.el.dataset.id = 'opt-journee';

  const violenceHint = (v: ViolenceLevel): string => (v === 'sobre' ? 'Le sang est masqué ; les blessures restent signalées.' : 'Blessures représentées de façon réaliste, sans complaisance.');
  const violenceField = widgets.field('Violence affichée', null, { hint: violenceHint(ctx.settings.values.violence) });
  const violenceSeg = widgets.segmented<ViolenceLevel>({
    label: 'Violence affichée',
    options: [{ value: 'realiste', label: 'Réaliste' }, { value: 'sobre', label: 'Sobre' }],
    value: ctx.settings.values.violence,
    onChange: (violence: ViolenceLevel) => {
      // même réglage que dans les paramètres : il est enregistré et recopié dans le scénario
      ctx.settings.set('violence', violence);
      model.update({ options: { ...model.draft.options, violence } });
      violenceField.setHint(violenceHint(violence));
    },
  });
  violenceField.el.insertBefore(violenceSeg.el, violenceField.el.lastElementChild);

  const trafficField = widgets.field('Circulation au départ', null, {
    hint: 'Ouverte : des automobilistes peuvent se retrouver pris dans le cortège ; couper à temps fait partie du travail.',
  });
  const trafficSeg = widgets.segmented<'ouverte' | 'coupee'>({
    label: 'Circulation au départ',
    options: [{ value: 'ouverte', label: 'Ouverte' }, { value: 'coupee', label: 'Coupée autour du lieu' }],
    value: d.options.circulation,
    onChange: (circulation: 'ouverte' | 'coupee') => model.update({ options: { ...model.draft.options, circulation } }),
  });
  trafficSeg.el.dataset.id = 'opt-circulation';
  trafficField.el.insertBefore(trafficSeg.el, trafficField.el.lastElementChild);

  const metroField = widgets.field('Stations de métro', null, {
    hint: 'Les manifestants arrivent par les bouches de métro. Fermer les stations proches tarit ce flux et le reporte sur les voisines.',
  });
  const metroSeg = widgets.segmented<'ouvert' | 'ferme'>({
    label: 'Stations de métro',
    options: [{ value: 'ouvert', label: 'Ouvertes' }, { value: 'ferme', label: 'Fermées autour du lieu' }],
    value: d.options.metro,
    onChange: (metro: 'ouvert' | 'ferme') => model.update({ options: { ...model.draft.options, metro } }),
  });
  metroSeg.el.dataset.id = 'opt-metro';
  metroField.el.insertBefore(metroSeg.el, metroField.el.lastElementChild);

  const seedField = widgets.field('Graine du hasard', null, {
    value: String(d.seed),
    hint: 'Deux parties lancées avec la même graine et les mêmes réglages commencent de la même façon.',
  });
  const reseed = widgets.button('Nouvelle graine', () => {
    const seed = 1 + Math.floor(((Date.now() % 1000003) * 7919 + model.draft.seed * 31) % 999999);
    model.update({ seed });
    seedField.setValue(String(model.draft.seed));
  }, 'secondary', 'dice');
  seedField.el.insertBefore(el('div', 'ui-inline', reseed), seedField.el.lastElementChild);

  root.append(journee.el, sanctions.el, violenceField.el, trafficField.el, metroField.el, seedField.el);
  return root;
}

// ───────────────────────────── scénarios enregistrés ─────────────────────────────

export function buildScenarios(model: HomeModel): HTMLElement {
  const { widgets, ctx } = model.env;
  const root = h('div');
  const d = model.draft;

  // enregistrer le scénario courant
  const input = h('input', 'ui-input');
  input.type = 'text';
  input.maxLength = MAX_NAME_LENGTH;
  input.value = suggestName(d);
  input.setAttribute('aria-label', 'Nom du scénario');
  input.dataset.id = 'scenario-nom';
  const save = (): void => {
    const entry = model.store.add(input.value || suggestName(model.draft), buildSessionConfig(model.draft));
    ctx.ui.notify(`Scénario enregistré : ${entry.name}`, 'ok');
    model.rebuild();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      save();
    }
  });
  const saveBtn = widgets.button('Enregistrer', save, 'primary', 'save');
  saveBtn.dataset.id = 'scenario-enregistrer';
  root.append(widgets.sectionTitle('Enregistrer le scénario actuel'), el('div', 'ui-inline', input, saveBtn));

  const items = model.store.list();
  root.append(widgets.sectionTitle(items.length > 0 ? `Scénarios enregistrés (${items.length})` : 'Scénarios enregistrés'));
  if (items.length === 0) {
    root.append(h('div', 'ui-empty', 'Aucun scénario enregistré pour l’instant. Réglez votre scénario, puis enregistrez-le ici pour le retrouver.'));
    return root;
  }
  const list = h('div');
  for (const item of items) list.append(savedRow(model, item));
  root.append(list);
  return root;
}

function savedRow(model: HomeModel, item: SavedScenario): HTMLElement {
  const { widgets, ctx } = model.env;
  const row = h('div', 'ui-saved');
  row.dataset.id = 'saved-' + item.id;
  const draft = draftFromConfig(item.config, defaultDraft(ctx.settings.values.violence));
  const describe = `${identityLabel(draft)} · ${draft.place} · ${hourLabel(draft.timeOfDay)} · ${dateLabel(item.savedAt)}`;

  const show = (): void => {
    clear(row);
    const actions = h('div', 'ui-saved__actions');
    const play = widgets.button('Relancer', () => model.launch(item.config), 'primary', 'play');
    play.dataset.id = 'saved-relancer';
    const load = widgets.button('Charger', () => {
      model.replace(draft);
      ctx.ui.notify(`Scénario chargé : ${item.name}`, 'info');
    }, 'secondary');
    load.dataset.id = 'saved-charger';
    load.setAttribute('data-tip', 'Reprend ces réglages pour les modifier');
    const rename = widgets.iconButton('edit', `Renommer « ${item.name} »`, edit);
    rename.dataset.id = 'saved-renommer';
    const remove = widgets.iconButton('trash', `Supprimer « ${item.name} »`, () => {
      widgets.confirm(model.host, {
        title: 'Supprimer ce scénario ?',
        text: `« ${item.name} » sera retiré de vos scénarios enregistrés.`,
        confirm: 'Supprimer',
        danger: true,
        onConfirm: () => {
          model.store.remove(item.id);
          ctx.ui.notify('Scénario supprimé.', 'info');
          model.rebuild();
        },
      });
    }, 'ghost');
    remove.dataset.id = 'saved-supprimer';
    actions.append(play, load, rename, remove);
    row.append(h('div', 'ui-saved__name', item.name), actions, h('div', 'ui-saved__sub', describe));
  };

  function edit(): void {
    clear(row);
    const input = h('input', 'ui-input');
    input.type = 'text';
    input.maxLength = MAX_NAME_LENGTH;
    input.value = item.name;
    input.setAttribute('aria-label', 'Nouveau nom du scénario');
    input.dataset.id = 'saved-nom';
    const apply = (): void => {
      if (model.store.rename(item.id, input.value)) {
        ctx.ui.notify('Scénario renommé.', 'ok');
        model.rebuild();
      } else {
        ctx.ui.notify('Le nom ne peut pas être vide.', 'warn');
        input.focus();
      }
    };
    const cancel = (): void => {
      show();
      row.querySelector<HTMLButtonElement>('[data-id="saved-renommer"]')?.focus({ preventScroll: true });
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        apply();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        cancel();
      }
    });
    input.addEventListener('ui:back', (e) => {
      e.preventDefault();
      cancel();
    });
    const ok = widgets.button('Valider', apply, 'primary', 'check');
    ok.dataset.id = 'saved-valider';
    const no = widgets.button('Annuler', cancel, 'ghost');
    const actions = el('div', 'ui-saved__actions', ok, no);
    actions.style.gridRow = 'auto';
    row.append(input, actions);
    input.focus();
    input.select();
  }

  show();
  return row;
}
