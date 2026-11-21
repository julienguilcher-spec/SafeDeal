/* =====================================================================================
 * Carte de commandement — « Plus… › Tous les ordres » : tous les ordres du catalogue sur une seule colonne, par
 * famille (« Se placer », « Se déplacer », « Face à la foule », « Intervenir », « Fin d'action »), chacun avec son nom
 * en clair et son explication ; un champ « Chercher un ordre » filtre la liste pendant la frappe (accents et
 * majuscules ignorés). Choisir un ordre, c'est l'ordre d'abord : l'écran ouvre la fiche à la visée avec cette seule
 * ligne surlignée et Qui proposé (onVerbFirst). Les boutons gardent data-id="verb-<type>".
 * Le cadre légal est dans « Cadre légal » (panelLegal.ts) ; la nasse et les secours sont des lignes des fiches.
 * La liste filtrée (ordersList) est pure et testée sans DOM.
 * ===================================================================================== */

import type { OrderType } from '@/core/contracts';
import { el, setText } from '../maps/icons';
import type { CommandCore } from './core';
import { allOrdersGrouped } from './intents';
import { authorizeWord } from './orders';
import type { OrderGroup, OrderVerb } from './orders';

// ───────────────────────────── liste (pure) ─────────────────────────────

export interface OrderRow {
  type: OrderType;
  /** Nom en clair (« Barrer la rue ») et explication en une ligne. */
  label: string;
  explain: string;
  /** Emploi collectif de la force (sommations exigées, sauf riposte). */
  coercive: boolean;
  /** Ce qu'il faut autoriser d'abord (« autoriser le gaz »), '' si l'ordre est permis. */
  locked: string;
}

export interface OrderFamilyRows {
  group: OrderGroup;
  label: string;
  rows: OrderRow[];
}

/** Texte sans accents ni majuscules, pour la recherche. */
export function foldText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('fr-FR').replace(/[’']/g, ' ');
}

/** L'ordre répond-il à la recherche (chaque mot tapé figure dans son nom, son explication ou son ancien nom) ? */
export function matchOrder(v: Pick<OrderVerb, 'plain' | 'explain' | 'label' | 'short'>, query: string): boolean {
  const words = foldText(query).split(/\s+/).filter((w) => w !== '');
  if (words.length === 0) return true;
  const hay = foldText(`${v.plain} ${v.explain} ${v.label} ${v.short}`);
  return words.every((w) => hay.includes(w));
}

/**
 * « Tous les ordres », filtrés par la recherche : familles non vides seulement, ordres dans l'ordre du catalogue.
 * `law` : la force autorisée (et la riposte) pour marquer ce qu'il faudrait autoriser d'abord.
 */
export function ordersList(query: string, law: { authorised: number; underAttack: boolean }): OrderFamilyRows[] {
  const out: OrderFamilyRows[] = [];
  for (const f of allOrdersGrouped()) {
    const rows: OrderRow[] = [];
    for (const v of f.verbs) {
      if (!matchOrder(v, query)) continue;
      rows.push({
        type: v.type, label: v.plain, explain: v.explain, coercive: v.coercive,
        locked: v.force > law.authorised && !law.underAttack ? authorizeWord(v.force) : '',
      });
    }
    if (rows.length > 0) out.push({ group: f.group, label: f.label, rows });
  }
  return out;
}

/** Nombre d'ordres du catalogue (« les 27 ordres, expliqués, par famille »). */
export function ordersCount(): number {
  let n = 0;
  for (const f of allOrdersGrouped()) n += f.verbs.length;
  return n;
}

// ───────────────────────────── panneau (DOM) ─────────────────────────────

export interface OrdersPanelOptions {
  /** Ordre choisi : l'écran ouvre la fiche à la visée sur cet ordre (TacticalScreen.verbFirst). */
  onVerbFirst(type: OrderType): void;
}

export class OrdersPanel {
  readonly root: HTMLDivElement;
  readonly input: HTMLInputElement;
  private readonly list: HTMLDivElement;
  private readonly empty: HTMLElement;
  private sig = '';
  private first: OrderType | null = null;

  constructor(private readonly core: CommandCore, host: HTMLElement, private readonly opts: OrdersPanelOptions) {
    this.root = el('div', 'cp-orders');
    this.root.dataset.id = 'tac-orders';
    const search = el('label', 'cp-search');
    this.input = document.createElement('input');
    this.input.type = 'search';
    this.input.placeholder = 'Chercher un ordre';
    this.input.setAttribute('aria-label', 'Chercher un ordre');
    this.input.autocomplete = 'off';
    this.input.spellcheck = false;
    this.input.dataset.id = 'orders-search';
    this.input.addEventListener('input', () => this.refresh(true));
    this.input.addEventListener('keydown', (e) => {
      // le champ garde lettres et chiffres ; Entrée choisit le premier ordre trouvé, Échap vide puis rend la main
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        const t = this.first;
        this.input.blur();
        if (t) this.opts.onVerbFirst(t);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (this.input.value !== '') {
          this.input.value = '';
          this.refresh(true);
        } else this.input.blur();
      }
    });
    search.appendChild(this.input);
    this.list = el('div', 'cp-list');
    this.empty = el('div', 'cp-empty', 'Aucun ordre ne correspond.');
    this.root.append(search, this.empty, this.list);
    host.appendChild(this.root);
  }

  /** Vide la recherche (à chaque ouverture de la section). */
  reset(): void {
    if (this.input.value !== '') this.input.value = '';
    this.refresh(true);
  }

  refresh(force: boolean): void {
    const roe = this.core.ctx.law.roe;
    const fams = ordersList(this.input.value, { authorised: roe.authorizedForce, underAttack: roe.underAttack });
    this.first = fams[0]?.rows[0]?.type ?? null;
    const sig = this.input.value + '|' + fams.map((f) => f.rows.map((r) => r.type + r.locked).join(',')).join('/');
    this.empty.style.display = fams.length === 0 ? '' : 'none';
    if (sig === this.sig && !force) return;
    this.sig = sig;
    this.list.textContent = '';
    for (const f of fams) {
      this.list.appendChild(el('div', 'cp-cap', f.label));
      for (const r of f.rows) {
        const b = document.createElement('button');
        b.type = 'button';
        b.tabIndex = -1;
        b.className = 'cp-row cp-verb' + (r.coercive ? ' is-coercive' : '') + (r.locked !== '' ? ' is-locked' : '');
        b.dataset.type = r.type;
        b.dataset.id = 'verb-' + r.type;
        const main = el('span', 'cp-main');
        main.appendChild(el('b', 'cp-t', r.label));
        const sub = el('small', 'cp-s');
        setText(sub, r.locked !== '' ? `${r.explain} 🔒 ${r.locked}` : r.explain);
        main.appendChild(sub);
        b.appendChild(main);
        if (r.coercive && r.locked === '') b.appendChild(el('span', 'cp-mark', '⚖'));
        b.title = r.coercive ? `${r.label} — emploi de la force\u00a0: les sommations sont exigées, sauf riposte` : r.label;
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          this.opts.onVerbFirst(r.type);
        });
        this.list.appendChild(b);
      }
    }
  }

  dispose(): void {
    this.root.remove();
  }
}
