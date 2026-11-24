/* =====================================================================================
 * Éléments de HUD du commandement :
 *   « mon unité »        état résumé du groupe ou de la section du joueur et ordre en cours, avec les mots de la carte
 *                        (« MISTRAL 1 ALFA · EN LIGNE », « SANS ORDRE » — jamais un type brut ni « INITIATIVE ») ;
 *   « incident confié »  pour un joueur exécutant : libellé, distance et direction de l'incident.
 * Chacun n'écrit dans le DOM que si une valeur a changé ; la flèche tourne par transformation CSS.
 * ===================================================================================== */

import type { HudWidget } from '@/core/extensions';
import { el, setClass, setText } from '../maps/icons';
import { INCIDENT_COLORS } from '../maps/overlay';
import { formatDistance } from '../maps/transform';
import { isPoliceRole } from '../maps/visibility';
import type { CommandCore } from './core';
import { unitIconUrl } from './panelUnits';
import type { SquadOrder } from '@/core/contracts';
import { tagOf, verbOf } from './orders';
import { ensureCommandStyle } from './style';

const PERIOD = 0.25;

/** Étiquette d'unité quand elle n'a pas d'ordre (ordre « libre », ou aucun). */
export const NO_ORDER_TAG = 'SANS ORDRE';

/**
 * Étiquette de l'ordre en cours d'une unité, en majuscules, comme sur la carte (« EN LIGNE », « BARRE (PASSANTS) »,
 * « SANS ORDRE ») : `tag` des ordres (orders.ts). L'unité qui suit le joueur (« Suivez-moi à pied » devient l'ordre
 * « suivre » sur lui) : « ME SUIT À PIED ». Ordre inconnu : « ORDRE EN COURS » (jamais le type brut).
 */
export function unitOrderTag(o: Pick<SquadOrder, 'type' | 'targetId'> | null | undefined, playerId: number): string {
  if (!o || o.type === 'libre') return NO_ORDER_TAG;
  if (o.type === 'suivre' && playerId !== 0 && o.targetId === playerId) return tagOf('suivre_pied');
  const tag = tagOf(o.type, o.targetId);
  return tag !== '' ? tag : 'ORDRE EN COURS';
}

/** Texte complet de la pastille d'unité : « MISTRAL 1 ALFA · EN LIGNE ». */
export function unitChipText(name: string, o: Pick<SquadOrder, 'type' | 'targetId'> | null | undefined, playerId: number): string {
  return `${name} · ${unitOrderTag(o, playerId)}`;
}

export class UnitHud implements HudWidget {
  readonly root: HTMLDivElement;
  private readonly img: HTMLImageElement;
  private readonly name: HTMLElement;
  private readonly num: HTMLElement;
  private readonly ord: HTMLElement;
  private last = -1;
  private iconKey = '';
  private orderKey = '';
  private flashUntil = 0;

  constructor(private readonly core: CommandCore, host: HTMLElement) {
    ensureCommandStyle();
    this.root = el('div', 'cm-root ch is-off');
    this.root.dataset.id = 'hud-unit';
    this.img = document.createElement('img');
    this.img.alt = '';
    this.name = el('b');
    this.num = el('span', 'ch-num');
    this.ord = el('span', 'ch-ord');
    this.root.append(this.img, this.name, this.num, this.ord);
    host.appendChild(this.root);
  }

  update(): void {
    const core = this.core;
    const t = core.maps.time;
    if (this.flashUntil !== 0 && t > this.flashUntil) {
      this.flashUntil = 0;
      this.ord.classList.remove('is-new');
    }
    if (t - this.last < PERIOD) return;
    this.last = t;
    const ctx = core.ctx;
    const p = core.player();
    const sc = core.scope();
    const squadId = sc.level !== 'lecture' && sc.ownSquadId !== 0 ? sc.ownSquadId : p ? p.squadId : 0;
    if (!p || squadId === 0 || !isPoliceRole(ctx.player.state.role)) {
      setClass(this.root, 'is-off', true);
      return;
    }
    core.maps.scene.ensureFresh();
    const u = core.maps.scene.unitModel.get(squadId);
    if (!u) {
      setClass(this.root, 'is-off', true);
      return;
    }
    setClass(this.root, 'is-off', false);
    const iconKey = u.symbol + u.faction;
    if (iconKey !== this.iconKey) {
      this.iconKey = iconKey;
      this.img.src = unitIconUrl(u.symbol, u.faction);
    }
    setText(this.name, u.name);
    setText(this.num, u.total > 0 ? `${u.valid}/${u.total}` : '');
    setClass(this.num, 'is-low', u.total > 0 && u.valid / u.total < 0.6);
    const o = u.order;
    const free = !o || o.type === 'libre';
    const verb = o ? verbOf(o.type) : undefined;
    const tag = unitOrderTag(o, ctx.player.state.personId);
    setText(this.ord, tag);
    const full = unitChipText(u.name, o, ctx.player.state.personId);
    if (this.root.title !== full) {
      this.root.title = full;
      this.root.setAttribute('aria-label', full);
    }
    setClass(this.ord, 'is-force', verb !== undefined && verb.coercive);
    // un nouvel ordre clignote brièvement
    const key = o ? o.type + '@' + o.issuedAt : '';
    if (key !== this.orderKey) {
      if (this.orderKey !== '' && !free) {
        this.ord.classList.add('is-new');
        this.flashUntil = t + 1.3;
      }
      this.orderKey = key;
    }
  }

  dispose(): void {
    this.root.remove();
  }
}

export class IncidentHud implements HudWidget {
  readonly root: HTMLDivElement;
  private readonly arrow: HTMLElement;
  private readonly label: HTMLElement;
  private readonly dist: HTMLElement;
  private last = -1;
  private shownId = 0;
  private arrowT = '';

  constructor(private readonly core: CommandCore, host: HTMLElement) {
    ensureCommandStyle();
    this.root = el('div', 'cm-root ch ch-inc is-off');
    this.root.dataset.id = 'hud-incident';
    this.arrow = el('span', 'ch-arrow');
    this.arrow.innerHTML = '<svg width="18" height="18" viewBox="0 0 18 18"><path d="M9 1.500L15 15.500 9 12 3 15.500z" fill="currentColor"/></svg>';
    this.label = el('span');
    this.dist = el('strong');
    this.root.append(this.arrow, this.label, this.dist);
    host.appendChild(this.root);
  }

  update(): void {
    const core = this.core;
    const api = core.incidents;
    const id = api ? api.playerIncidentId : 0;
    const inc = id !== 0 ? api!.get(id) : undefined;
    const p = core.player();
    if (!inc || !p || inc.state === 'resolu' || inc.state === 'echoue') {
      if (this.shownId !== 0) {
        this.shownId = 0;
        setClass(this.root, 'is-off', true);
      }
      return;
    }
    if (this.shownId !== inc.id) {
      this.shownId = inc.id;
      setClass(this.root, 'is-off', false);
      this.last = -1;
    }
    // direction relative au regard : une transformation, à chaque image si elle change
    const dx = inc.x - p.x;
    const dz = inc.z - p.z;
    const deg = Math.round((((core.ctx.player.state.camYaw - Math.atan2(dx, dz)) * 180) / Math.PI) / 3) * 3;
    const tr = `rotate(${deg}deg)`;
    if (tr !== this.arrowT) {
      this.arrowT = tr;
      this.arrow.style.transform = tr;
    }
    const t = core.maps.time;
    if (t - this.last < PERIOD) return;
    this.last = t;
    const color = INCIDENT_COLORS[inc.urgency] ?? INCIDENT_COLORS[1];
    if (this.root.style.getPropertyValue('--u') !== color) this.root.style.setProperty('--u', color);
    setText(this.label, inc.label);
    setText(this.dist, formatDistance(Math.hypot(dx, dz)));
  }

  dispose(): void {
    this.root.remove();
  }
}
