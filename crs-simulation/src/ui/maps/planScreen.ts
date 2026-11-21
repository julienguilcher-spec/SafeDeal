/* =====================================================================================
 * Écran « carte » : plan de Paris plein écran. Déplacement (glisser, stick), zoom (molette,
 * pincement, gâchettes, boutons), recherche de lieu, pose d'un repère GPS.
 * ===================================================================================== */

import type { GameContext, InputState, PlaceInfo } from '@/core/contracts';
import type { ScreenInstance, UiKit } from '@/core/extensions';
import type { PlanOpenData } from './api';
import { button, el, icon, setClass, setText } from './icons';
import { MapCanvas } from './mapCanvas';
import type { MapsRuntime } from './runtime';
import { PLACE_KIND_LABELS, searchPlaces } from './search';
import { coarsePointer, ensureMapsStyle } from './style';
import { formatDistance } from './transform';
import { ScaleBar, WindRose, mapControls } from './widgets';
import { shortPlaceName } from './basemap-labels';

interface Pick { x: number; z: number; label: string }

export class PlanScreen implements ScreenInstance {
  readonly root: HTMLDivElement;
  readonly map: MapCanvas;
  private readonly scale: ScaleBar;
  private readonly rose: WindRose;
  private readonly input: HTMLInputElement;
  private readonly results: HTMLDivElement;
  private readonly card: HTMLDivElement;
  private readonly cardTitle: HTMLElement;
  private readonly cardSub: HTMLElement;
  private readonly cardSet: HTMLButtonElement;
  private readonly cardClear: HTMLButtonElement;
  private readonly focus: { dispose(): void };
  private pick: Pick | null = null;
  private lastCard = -1;
  private readonly w = { x: 0, z: 0 };

  constructor(
    private readonly ctx: GameContext, kit: UiKit, private readonly runtime: MapsRuntime, host: HTMLElement,
    data: unknown,
  ) {
    ensureMapsStyle();
    const open = (data && typeof data === 'object' ? data : {}) as PlanOpenData;
    this.root = el('div', 'cm-root cm-plan' + (coarsePointer() ? ' cm-coarse' : ''));
    this.root.dataset.id = 'plan';
    host.appendChild(this.root);

    this.map = new MapCanvas(runtime, this.root, { base: { margin: 0.3, labels: true, detail: 'plan' } });
    const vis = runtime.scene.vis;
    const layers = this.map.overlay.layers;
    layers.orders = false;
    layers.units = vis.police;
    this.map.overlay.dots = true;
    this.map.view.minMpp = 0.25;
    this.map.view.maxMpp = 9;
    // la carte prend le focus à l'ouverture (pas le champ de recherche : les touches du jeu restent actives,
    // le clavier virtuel ne s'ouvre pas) ; en mode carte, les directions pilotent le curseur
    this.map.canvas.tabIndex = 0;
    this.map.canvas.dataset.autofocus = '';
    this.map.canvas.dataset.id = 'plan-map';
    this.map.canvas.classList.add('cm-focusable');
    this.map.canvas.addEventListener('ui:nav', (e) => e.preventDefault());

    // bandeau : titre, recherche, résultats
    const top = el('div', 'cm-panel cm-plan-top');
    const head = el('div', 'cm-plan-head');
    head.appendChild(el('div', 'cm-title', 'Plan de Paris'));
    const hint = el('span', 'cm-sub');
    hint.textContent = this.sectorOfPlayer();
    head.appendChild(hint);
    const search = el('label', 'cm-search');
    search.innerHTML = icon('search', 16);
    this.input = document.createElement('input');
    this.input.type = 'search';
    this.input.placeholder = 'Rechercher une rue, une place…';
    this.input.autocomplete = 'off';
    this.input.spellcheck = false;
    this.input.setAttribute('aria-label', 'Rechercher un lieu');
    this.input.dataset.id = 'plan-search';
    search.appendChild(this.input);
    this.results = el('div', 'cm-results');
    top.append(head, search, this.results);
    this.root.appendChild(top);
    this.input.addEventListener('input', () => this.refreshResults());
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const first = this.results.querySelector('button');
        if (first) (first as HTMLButtonElement).click();
        e.preventDefault();
      } else if (e.key === 'Escape') {
        // Échap quitte le champ (et efface la recherche) sans fermer le plan
        this.input.value = '';
        this.refreshResults();
        this.map.canvas.focus({ preventScroll: true });
        e.preventDefault();
      }
      e.stopPropagation();
    });

    const close = button('Fermer', () => ctx.ui.close('carte'), { icon: 'close', className: 'cm-plan-close', id: 'plan-close' });
    const key = kit.keyLabel('map');
    if (key !== '' && !coarsePointer()) close.appendChild(el('span', 'cm-kbd', key));
    this.root.appendChild(close);

    // fiche du point désigné
    this.card = el('div', 'cm-panel cm-plan-card is-off');
    const text = el('div');
    this.cardTitle = el('b');
    this.cardSub = el('small');
    text.append(this.cardTitle, this.cardSub);
    this.cardSet = button('Poser le repère GPS', () => this.setWaypoint(), { icon: 'pin', className: 'is-primary', id: 'plan-set' });
    this.cardClear = button('Supprimer le repère', () => this.clearWaypoint(), { icon: 'close', id: 'plan-clear' });
    this.card.append(text, this.cardSet, this.cardClear);
    this.root.appendChild(this.card);

    this.scale = new ScaleBar(this.root);
    this.rose = new WindRose(this.root, 'cm-plan-compass');
    mapControls(this.root, this.map, runtime);
    const legend = el('div', 'cm-panel cm-plan-legend');
    legend.innerHTML =
      '<span><i style="background:#3ddcff"></i>Itinéraire GPS</span>' +
      '<span><i style="background:#ffe08a"></i>Foule</span>' +
      '<span><i style="background:#ff3b30"></i>Rue fermée</span>';
    this.root.appendChild(legend);
    const attribution = (ctx.world.attribution || '').split('\n')[0] ?? '';
    if (attribution !== '') this.root.appendChild(el('div', 'cm-attrib', attribution));

    this.map.handlers = {
      onTap: (x, y, info) => {
        this.map.worldAt(x, y, this.w);
        if (info.button === 2) {
          this.pickPoint(this.w.x, this.w.z);
          this.setWaypoint();
        } else this.pickPoint(this.w.x, this.w.z);
      },
      onLongPress: (x, y) => {
        this.map.worldAt(x, y, this.w);
        this.pickPoint(this.w.x, this.w.z);
        this.setWaypoint();
      },
      drawExtras: (g, view) => this.drawPick(g, view),
    };

    // vue initiale : point demandé, sinon le joueur, sinon le centre de l'emprise
    const s = runtime.scene;
    s.refreshPlayer();
    const b = ctx.world.bounds;
    const x0 = open.x ?? (s.hasPlayer ? s.px : (b.minX + b.maxX) * 0.5);
    const z0 = open.z ?? (s.hasPlayer ? s.pz : (b.minZ + b.maxZ) * 0.5);
    this.map.jumpTo(x0, z0, open.mpp ?? 1.6);
    if (open.search) {
      this.input.value = open.search;
      this.refreshResults();
    }
    if (runtime.gps.waypoint) this.showWaypointCard();
    this.focus = kit.focusGroup(this.root);
  }

  private sectorOfPlayer(): string {
    const s = this.runtime.scene;
    s.refreshPlayer();
    return s.hasPlayer ? this.ctx.world.sectorName(s.px, s.pz) : '';
  }

  // ───────────────────────────── recherche ─────────────────────────────

  private refreshResults(): void {
    const q = this.input.value;
    const world = this.ctx.world;
    const near = { x: this.map.view.cx, z: this.map.view.cz };
    const hits = searchPlaces(world.places, q, 7, near);
    this.results.textContent = '';
    const s = this.runtime.scene;
    for (let i = 0; i < hits.length; i++) {
      const p = hits[i]!.place;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cm-result';
      b.dataset.id = 'plan-result-' + i;
      const text = el('span');
      text.append(el('b', undefined, shortPlaceName(p.name)), el('small', undefined, PLACE_KIND_LABELS[p.kind] ?? 'Lieu'));
      b.appendChild(text);
      if (s.hasPlayer) b.appendChild(el('em', undefined, formatDistance(Math.hypot(p.x - s.px, p.z - s.pz))));
      b.addEventListener('click', () => this.goTo(p));
      this.results.appendChild(b);
    }
    if (hits.length === 0 && q.trim().length >= 2) {
      const none = el('div', 'cm-sub', 'Aucun lieu trouvé');
      none.style.padding = '6px 8px';
      this.results.appendChild(none);
    }
  }

  private goTo(p: PlaceInfo): void {
    const mpp = Math.min(2.4, Math.max(0.6, (p.radius * 2.6) / Math.max(200, Math.min(this.map.view.width, this.map.view.height))));
    this.map.flyTo(p.x, p.z, mpp, 0.45);
    this.pick = { x: p.x, z: p.z, label: shortPlaceName(p.name) };
    this.results.textContent = '';
    this.input.value = shortPlaceName(p.name);
    this.map.canvas.focus({ preventScroll: true });
    this.lastCard = -1;
    this.map.invalidate();
  }

  // ───────────────────────────── repère ─────────────────────────────

  private pickPoint(x: number, z: number): void {
    const b = this.ctx.world.bounds;
    if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return;
    this.pick = { x, z, label: this.ctx.world.sectorName(x, z) || 'Point désigné' };
    this.lastCard = -1;
    this.map.invalidate();
  }

  private setWaypoint(): void {
    if (!this.pick) return;
    this.runtime.setWaypoint(this.pick.x, this.pick.z, this.pick.label);
    this.ctx.audio.play('ui_valide');
    this.ctx.ui.notify(`Repère GPS posé\u00a0: ${this.pick.label}`, 'ok', 3);
    this.pick = null;
    this.lastCard = -1;
    this.map.invalidate();
  }

  private clearWaypoint(): void {
    this.runtime.clearWaypoint();
    this.pick = null;
    this.lastCard = -1;
    this.map.invalidate();
  }

  private showWaypointCard(): void {
    this.lastCard = -1;
  }

  private refreshCard(): void {
    const wp = this.runtime.gps.waypoint;
    const s = this.runtime.scene;
    const p = this.pick;
    if (!p && !wp) {
      setClass(this.card, 'is-off', true);
      return;
    }
    setClass(this.card, 'is-off', false);
    const x = p ? p.x : wp!.x;
    const z = p ? p.z : wp!.z;
    setText(this.cardTitle, p ? p.label : `Repère\u00a0: ${wp!.label}`);
    let sub = '';
    if (!p && this.runtime.gps.distance >= 0) sub = `${formatDistance(this.runtime.gps.distance)} par l’itinéraire`;
    else if (s.hasPlayer) sub = `${formatDistance(Math.hypot(x - s.px, z - s.pz))} à vol d’oiseau`;
    setText(this.cardSub, sub);
    this.cardSet.style.display = p ? '' : 'none';
    this.cardClear.style.display = wp && !p ? '' : 'none';
  }

  private drawPick(g: CanvasRenderingContext2D, view: MapCanvas['view']): void {
    const p = this.pick;
    if (!p) return;
    const sp = this.map.screenOf(p.x, p.z);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 2;
    g.setLineDash([4, 3]);
    g.beginPath();
    g.arc(sp.x, sp.y, 11, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(sp.x, sp.y, 2.5, 0, Math.PI * 2);
    g.fill();
    void view;
  }

  // ───────────────────────────── cycle de vie ─────────────────────────────

  update(dt: number, input: InputState): void {
    const typing = document.activeElement === this.input;
    if (!typing) {
      this.map.updatePad(dt, input);
      // manette : X pose directement le repère sous le curseur
      if (input.device === 'gamepad' && input.pressed('interact') && this.map.cursorOn) {
        this.map.worldAt(this.map.cursorX, this.map.cursorY, this.w);
        this.pickPoint(this.w.x, this.w.z);
        this.setWaypoint();
      }
    }
    this.map.frame(dt);
    this.scale.update(this.map.view.mpp);
    const t = this.runtime.time;
    if (this.lastCard < 0 || t - this.lastCard > 0.5) {
      this.lastCard = t;
      this.refreshCard();
      this.rose.update(this.ctx);
    }
  }

  back(): boolean {
    if (document.activeElement === this.input && this.input.value !== '') {
      this.input.value = '';
      this.refreshResults();
      this.input.blur();
      return true;
    }
    if (this.pick) {
      this.pick = null;
      this.lastCard = -1;
      this.map.invalidate();
      return true;
    }
    return false;
  }

  dispose(): void {
    this.focus.dispose();
    this.map.dispose();
    this.root.remove();
  }
}
