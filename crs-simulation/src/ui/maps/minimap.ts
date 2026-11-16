/* =====================================================================================
 * Mini-carte du HUD : disque orienté selon le regard, zoom selon le mode de déplacement (à pied,
 * en véhicule lent, en véhicule rapide), tracé GPS vers la cible suivie.
 *
 * Performance : le canevas (fond en cache + couches) n'est redessiné que ~8 fois par seconde, nord
 * en haut. À chaque image, seule une transformation CSS fait tourner et glisser ce canevas sous le
 * masque circulaire : aucune mise en page, aucun dessin.
 * ===================================================================================== */

import type { GameContext } from '@/core/contracts';
import type { HudWidget } from '@/core/extensions';
import { damp } from '@/core/math';
import { BaseLayer } from './basecache';
import { el, setClass, setText } from './icons';
import { ALL_LAYERS, drawOverlay } from './overlay';
import type { OverlayOptions } from './overlay';
import type { MapsRuntime } from './runtime';
import { ensureMapsStyle } from './style';
import { MapTransform, NORTH_UP, formatDistance } from './transform';

/** Échelles (m/px, pour un disque de 168 px) : à pied, véhicule lent, véhicule rapide. */
const MPP_FOOT = 1.15;
const MPP_VEHICLE = 2.1;
const MPP_FAST = 3.0;
const FAST_ON = 9;
const FAST_OFF = 6;
const REDRAW = 0.125;

export class Minimap implements HudWidget {
  readonly root: HTMLDivElement;
  /** Nombre de dessins du canevas et d'écritures de transformation (diagnostic, tests). */
  draws = 0;
  transforms = 0;

  private readonly disc: HTMLDivElement;
  private readonly rotor: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D | null;
  private readonly north: HTMLDivElement;
  private readonly gpsArrow: HTMLDivElement;
  private readonly info: HTMLDivElement;
  private readonly street: HTMLDivElement;
  private readonly dist: HTMLDivElement;
  private readonly base: BaseLayer;
  private readonly view = new MapTransform();
  private readonly overlay: OverlayOptions;
  private size = 168;
  private side = 0;
  private dpr = 1;
  private mpp = MPP_FOOT;
  private fast = false;
  private anchorX = 0;
  private anchorZ = 0;
  private lastDraw = -1;
  private lastInfo = -1;
  private rotorT = '';
  private northT = '';
  private gpsT = '';
  private needLayout = true;
  private shown = true;
  private touchOn = false;
  private lastTouchCheck = -1;
  private lastDodge = -1;
  private readonly onResize = (): void => { this.needLayout = true; };

  constructor(private readonly ctx: GameContext, private readonly runtime: MapsRuntime, host: HTMLElement) {
    ensureMapsStyle();
    this.root = el('div', 'cm-root cm-mini');
    this.root.dataset.id = 'minimap';
    this.disc = el('div', 'cm-mini-disc');
    this.disc.title = 'Ouvrir le plan';
    const clip = el('div', 'cm-mini-clip');
    this.rotor = el('div', 'cm-mini-rotor');
    this.canvas = document.createElement('canvas');
    this.g = this.canvas.getContext('2d', { alpha: false });
    this.rotor.appendChild(this.canvas);
    const me = el('div', 'cm-mini-me');
    me.innerHTML = '<svg width="16" height="18" viewBox="0 0 16 18"><path d="M8 1.200L14.300 16 8 12.600 1.700 16z" fill="#fff" stroke="#1f66e0" stroke-width="1.800" stroke-linejoin="round"/></svg>';
    clip.append(this.rotor, me);
    this.north = el('div', 'cm-mini-n');
    this.north.appendChild(el('b', undefined, 'N'));
    this.gpsArrow = el('div', 'cm-mini-gps');
    this.gpsArrow.appendChild(el('i'));
    this.disc.append(clip, this.gpsArrow, this.north);
    const info = (this.info = el('div', 'cm-mini-info is-off'));
    this.dist = el('div', 'cm-mini-dist');
    this.street = el('div', 'cm-mini-street');
    info.append(this.dist, this.street);
    this.root.append(this.disc, info);
    host.appendChild(this.root);
    this.disc.addEventListener('click', () => ctx.ui.open('carte'));

    this.view.up = NORTH_UP;
    this.base = new BaseLayer(runtime.basemap, { margin: 0.55, labels: false, detail: 'mini', settle: 0.25 });
    this.overlay = {
      layers: { ...ALL_LAYERS, player: false }, compact: true, selection: null, hoverKey: 0, commandable: null, size: 9,
      time: 0, gpsRoute: runtime.gps.route, gpsTarget: null, focusIncident: 0, focusStation: 0, focusClosure: 0, edge: null,
    };
    window.addEventListener('resize', this.onResize);
  }

  private layout(): void {
    this.needLayout = false;
    const small = window.innerHeight < 520 || window.innerWidth < 700;
    this.size = small ? 112 : 168;
    // petit écran : l'étiquette passe à droite du disque (sous lui se trouvent les commandes tactiles)
    setClass(this.root, 'is-small', small);
    this.root.style.setProperty('--cm-mini', this.size + 'px');
    // le canevas couvre le disque quelle que soit la rotation, plus une petite marge de glissement
    this.side = Math.ceil(this.size * Math.SQRT2) + 24;
    this.dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    this.canvas.width = Math.round(this.side * this.dpr);
    this.canvas.height = Math.round(this.side * this.dpr);
    const s = this.canvas.style;
    s.width = this.side + 'px';
    s.height = this.side + 'px';
    s.left = -this.side / 2 + 'px';
    s.top = -this.side / 2 + 'px';
    this.view.setSize(this.side, this.side);
    this.lastDraw = -1;
    this.dodgeTouchControls();
  }

  /**
   * Tactile : si un autre élément du HUD pousse la mini-carte sur les boutons « Radio » et « Ordres » du
   * module d'entrées (à gauche, au-dessus du joystick), elle se décale à leur droite. Une seule mesure de
   * mise en page, faite ici (redimensionnement, changement de périphérique, contrôle toutes les 2 s).
   */
  private dodgeTouchControls(): void {
    const root = this.root;
    if (root.style.marginLeft !== '') root.style.marginLeft = '';
    if (!this.touchOn) return;
    // cotes de docs/modules/entrees.md : 844 × 390 à l'échelle 1, échelle bornée entre 0,82 et 1,45
    const W = window.innerWidth, H = window.innerHeight;
    const scale = Math.min(1.45, Math.max(0.82, Math.min(W / 844, H / 390)));
    const r = this.disc.getBoundingClientRect();
    if (r.width === 0) return;
    const buttonsTop = H - 250 * scale;
    const buttonsRight = 136 * scale;
    if (r.bottom > buttonsTop - 4 && r.left < buttonsRight + 4) {
      root.style.marginLeft = Math.round(buttonsRight + 10 - r.left) + 'px';
    }
  }

  update(dt: number): void {
    const rt = this.runtime;
    const scene = rt.scene;
    scene.refreshPlayer();
    const visible = scene.hasPlayer;
    if (visible !== this.shown) {
      this.shown = visible;
      setClass(this.root, 'is-off', !visible);
    }
    if (!visible) return;
    rt.use();
    const time = rt.time;
    if (time - this.lastTouchCheck > 0.5) {
      this.lastTouchCheck = time;
      const touch = this.ctx.service<{ visible: boolean }>('input.touch');
      const on = touch !== undefined && touch.visible === true;
      if (on !== this.touchOn) {
        this.touchOn = on;
        this.needLayout = true;
      } else if (on && time - this.lastDodge > 2) {
        this.lastDodge = time;
        this.dodgeTouchControls();
      }
    }
    if (this.needLayout) this.layout();

    // échelle selon le déplacement : trois paliers, transition douce
    if (scene.inVehicle) {
      if (!this.fast && scene.speed > FAST_ON) this.fast = true;
      else if (this.fast && scene.speed < FAST_OFF) this.fast = false;
    } else this.fast = false;
    const target = (scene.inVehicle ? (this.fast ? MPP_FAST : MPP_VEHICLE) : MPP_FOOT) * (168 / this.size);
    let zooming = false;
    if (Math.abs(this.mpp - target) > 0.004) {
      this.mpp = damp(this.mpp, target, 3.5, Math.min(dt, 0.1));
      zooming = true;
    } else this.mpp = target;

    if (zooming || this.lastDraw < 0 || time - this.lastDraw >= REDRAW) this.draw(time);

    // rotation selon le regard + glissement depuis le dernier dessin : une seule écriture de style
    const rot = scene.pYaw - Math.PI;
    const ox = (scene.px - this.anchorX) / this.mpp;
    const oy = (scene.pz - this.anchorZ) / this.mpp;
    const deg = Math.round(((rot * 180) / Math.PI) * 5) / 5;
    const tr = `rotate(${deg}deg) translate(${(-ox).toFixed(1)}px,${(-oy).toFixed(1)}px)`;
    if (tr !== this.rotorT) {
      this.rotorT = tr;
      this.rotor.style.transform = tr;
      this.transforms++;
    }
    const r = this.size / 2;
    const nt = `rotate(${deg}deg) translate(0,${-r}px) rotate(${-deg}deg)`;
    if (nt !== this.northT) {
      this.northT = nt;
      this.north.style.transform = nt;
    }

    // flèche vers la cible GPS quand elle est hors du disque
    const gt = rt.gps.target;
    let gpsOn = false;
    if (gt) {
      const dx = gt.x - scene.px;
      const dz = gt.z - scene.pz;
      if (Math.hypot(dx, dz) / this.mpp > r - 6) {
        gpsOn = true;
        const a = Math.round((((scene.pYaw - Math.atan2(dx, dz)) * 180) / Math.PI) * 2) / 2;
        const t = `rotate(${a}deg) translate(0,${-(r - 9)}px)`;
        if (t !== this.gpsT) {
          this.gpsT = t;
          this.gpsArrow.style.transform = t;
        }
      }
    }
    setClass(this.gpsArrow, 'is-on', gpsOn);

    // étiquette : seulement pour un repère posé par le joueur (la rue courante est donnée par la boussole,
    // la distance d'un objectif ou d'un incident par leurs propres éléments)
    if (time - this.lastInfo > 0.5) {
      this.lastInfo = time;
      const on = gt !== null && gt.source === 'repere' && rt.gps.distance >= 0;
      setClass(this.info, 'is-off', !on);
      if (on) {
        setText(this.street, gt.label);
        setText(this.dist, `➤ ${formatDistance(rt.gps.distance)}`);
      }
    }
  }

  private draw(time: number): void {
    const g = this.g;
    if (!g) return;
    this.lastDraw = time;
    this.draws++;
    const scene = this.runtime.scene;
    this.anchorX = scene.px;
    this.anchorZ = scene.pz;
    const v = this.view;
    v.mpp = this.mpp;
    v.cx = scene.px;
    v.cz = scene.pz;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.base.draw(g, v, this.dpr, time);
    const o = this.overlay;
    o.time = time;
    o.gpsRoute = this.runtime.gps.route;
    o.gpsTarget = this.runtime.gps.target;
    try {
      drawOverlay(g, v, scene, o);
    } catch (err) {
      console.error('[cartes] erreur de dessin de la mini-carte', err);
    }
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.root.remove();
  }
}
