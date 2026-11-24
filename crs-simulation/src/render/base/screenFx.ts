/* =====================================================================================
 * Effets d'écran de ViewApi.setScreenEffect : gaz dans les yeux, flash, gouttes, douleur, visière.
 *
 * Réalisés en surcouches DOM/CSS au-dessus du canevas : le navigateur les compose sur le GPU,
 * sans passe de rendu supplémentaire. Les textures (larmes, gouttes, rayures de visière) sont
 * dessinées une fois sur des canevas 2D. Deux parties :
 *   - ScreenFxState : niveaux et lissages (logique pure, testable sous Node) ;
 *   - ScreenFxOverlay : les éléments DOM, mis à jour seulement quand une valeur change.
 * ===================================================================================== */

import { clamp01, damp } from './util';

export type ScreenEffect = 'gas' | 'flash' | 'wet' | 'pain' | 'visor';

export const SCREEN_EFFECTS: readonly ScreenEffect[] = ['gas', 'flash', 'wet', 'pain', 'visor'];

/**
 * Niveaux des effets. « gas », « wet », « visor » et « pain » sont des NIVEAUX : la valeur affichée
 * rejoint la dernière valeur demandée et y reste (c'est ainsi que le HUD les pilote, image après
 * image). La douleur monte d'un coup et s'estompe en douceur. « flash » est une IMPULSION : la valeur
 * monte aussitôt puis retombe toute seule ; rappeler setScreenEffect l'entretient — un appel isolé ne
 * peut donc pas laisser l'écran blanc.
 */
export class ScreenFxState {
  /** Valeurs affichées 0..1, dans l'ordre de SCREEN_EFFECTS. */
  readonly value = new Float32Array(5);
  private readonly target = new Float32Array(5);
  /** Temps écoulé (s) : clignements, pulsations, ruissellement. */
  time = 0;
  /** Fermeture des paupières 0..1 (clignements réflexes sous le gaz). */
  blink = 0;
  private nextBlink = 1.5;
  private blinkAge = 9;

  set(effect: ScreenEffect, amount: number): void {
    const i = SCREEN_EFFECTS.indexOf(effect);
    if (i < 0 || !Number.isFinite(amount)) return;
    const a = clamp01(amount);
    if (effect === 'flash') {
      if (a > this.value[i]!) this.value[i] = a;
      this.target[i] = 0;
    } else {
      this.target[i] = a;
      // la douleur frappe d'un coup
      if (effect === 'pain' && a > this.value[i]!) this.value[i] = a;
    }
  }

  get(effect: ScreenEffect): number {
    return this.value[SCREEN_EFFECTS.indexOf(effect)]!;
  }

  /** Tout est-il éteint (rien à afficher) ? */
  get idle(): boolean {
    const v = this.value;
    return v[0]! < 0.002 && v[1]! < 0.002 && v[2]! < 0.002 && v[3]! < 0.002 && v[4]! < 0.002;
  }

  reset(): void {
    this.value.fill(0);
    this.target.fill(0);
    this.blink = 0;
    this.blinkAge = 9;
  }

  update(dt: number): void {
    if (!(dt > 0)) return;
    this.time = (this.time + dt) % 3600;
    const v = this.value;
    const t = this.target;
    // gaz : monte vite, se dissipe lentement (les yeux pleurent encore après le nuage)
    v[0] = v[0]! + (t[0]! - v[0]!) * damp(t[0]! > v[0]! ? 5 : 1.4, dt);
    // flash : plateau d'aveuglement puis retour progressif de la vue
    v[1] = v[1]! > 0.6 ? v[1]! - dt * 0.55 : v[1]! * Math.exp(-dt * 1.9);
    // gouttes : arrivent vite, sèchent lentement
    v[2] = v[2]! + (t[2]! - v[2]!) * damp(t[2]! > v[2]! ? 6 : 0.8, dt);
    // douleur : tenue au niveau demandé ; au-delà, elle s'estompe en une seconde environ
    v[3] = Math.max(t[3]!, v[3]! * Math.exp(-dt * 1.6));
    // visière : bascule en un quart de seconde
    v[4] = v[4]! + (t[4]! - v[4]!) * damp(11, dt);
    for (let i = 0; i < 5; i++) {
      if (v[i]! < 0.002 && t[i]! === 0) v[i] = 0;
      else if (Math.abs(v[i]! - t[i]!) < 0.002 && i !== 1) v[i] = t[i]!;
    }
    // clignements réflexes : d'autant plus fréquents que le gaz est fort
    const gas = v[0]!;
    this.blinkAge += dt;
    if (gas > 0.12) {
      this.nextBlink -= dt;
      if (this.nextBlink <= 0) {
        this.blinkAge = 0;
        // période pseudo-aléatoire déterministe : de 3,2 s (gaz léger) à 0,9 s (gaz fort)
        const jitter = 0.7 + 0.6 * Math.abs(Math.sin(this.time * 12.9898));
        this.nextBlink = (3.4 - 2.5 * gas) * jitter;
      }
    }
    const b = this.blinkAge;
    const dur = 0.16 + 0.14 * gas;
    this.blink = b < dur ? Math.sin((b / dur) * Math.PI) * Math.min(1, 0.55 + gas) : 0;
  }
}

// ───────────────────────────── surcouches DOM ─────────────────────────────

const CSS = `
.crs-fx{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:1;contain:strict}
.crs-fx>div{position:absolute;inset:0;opacity:0;will-change:opacity,transform}
.crs-fx .gas-veil{background:radial-gradient(ellipse at 50% 55%,rgba(236,238,214,.10) 0%,rgba(226,230,200,.42) 58%,rgba(206,212,184,.82) 100%)}
.crs-fx .gas-tears{background-size:100% 100%;inset:-6% 0 -6% 0}
.crs-fx .lid{background:#060403;opacity:1;height:52%;inset:auto}
.crs-fx .lid.top{top:0;left:0;right:0;transform:translateY(-101%);border-radius:0 0 50% 50%/0 0 22% 22%}
.crs-fx .lid.bottom{bottom:0;left:0;right:0;transform:translateY(101%);border-radius:50% 50% 0 0/22% 22% 0 0}
.crs-fx .flash{background:#fff}
.crs-fx .wet{background-size:420px 420px}
.crs-fx .wet.b{background-size:660px 660px}
.crs-fx .pain{background:radial-gradient(ellipse at center,rgba(120,0,0,0) 24%,rgba(150,6,0,.26) 52%,rgba(150,6,0,.62) 76%,rgba(84,0,0,.95) 100%)}
.crs-fx .visor{opacity:1;transform:translateY(-101%)}
.crs-fx .visor>i{position:absolute;inset:0;display:block}
.crs-fx .visor .tint{background:linear-gradient(180deg,rgba(120,140,160,.20) 0%,rgba(140,160,178,.075) 22%,rgba(150,168,184,.055) 100%)}
.crs-fx .visor .glare{background:linear-gradient(112deg,rgba(255,255,255,0) 30%,rgba(255,255,255,.075) 41%,rgba(255,255,255,.02) 47%,rgba(255,255,255,0) 58%),linear-gradient(104deg,rgba(255,255,255,0) 70%,rgba(255,255,255,.05) 76%,rgba(255,255,255,0) 82%)}
.crs-fx .visor .scratch{background-size:100% 100%;opacity:.55}
.crs-fx .visor .rim{background:radial-gradient(ellipse 78% 92% at 50% 62%,rgba(0,0,0,0) 62%,rgba(6,8,12,.42) 86%,rgba(4,5,8,.9) 100%),linear-gradient(180deg,rgba(5,6,9,.96) 0%,rgba(5,6,9,.9) 5%,rgba(8,10,14,.35) 9.5%,rgba(0,0,0,0) 14%)}
`;

function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement; g: CanvasRenderingContext2D } | null {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  return g ? { canvas, g } : null;
}

/** Générateur déterministe pour les textures. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Larmes : traînées verticales floues, plus denses sur les bords du champ de vision. */
function tearsTexture(): string {
  const c = makeCanvas(256, 256);
  if (!c) return '';
  const { canvas, g } = c;
  const r = rng(11);
  g.filter = 'blur(5px)';
  for (let i = 0; i < 70; i++) {
    const edge = r() < 0.7;
    const x = edge ? (r() < 0.5 ? r() * 70 : 256 - r() * 70) : r() * 256;
    const y = r() * 256;
    const len = 40 + r() * 150;
    const w = 5 + r() * 16;
    const grad = g.createLinearGradient(0, y, 0, y + len);
    grad.addColorStop(0, 'rgba(240,244,236,0)');
    grad.addColorStop(0.3, `rgba(240,244,236,${0.2 + r() * 0.3})`);
    grad.addColorStop(1, 'rgba(240,244,236,0)');
    g.fillStyle = grad;
    g.fillRect(x - w / 2, y, w, len);
  }
  return canvas.toDataURL();
}

/** Gouttes sur l'objectif ou la visière : petites lentilles claires au bord sombre, avec un reflet. */
function dropsTexture(seed: number, count: number, maxR: number): string {
  const size = 512;
  const c = makeCanvas(size, size);
  if (!c) return '';
  const { canvas, g } = c;
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    const x = r() * size;
    const y = r() * size;
    const rad = 2 + Math.pow(r(), 2.2) * maxR;
    const sy = 1 + r() * 0.5;
    // la texture se répète : on dessine aussi les copies qui débordent
    for (let ox = -size; ox <= size; ox += size) {
      for (let oy = -size; oy <= size; oy += size) {
        const cx = x + ox;
        const cy = y + oy;
        if (cx < -rad * 2 || cx > size + rad * 2 || cy < -rad * 3 || cy > size + rad * 3) continue;
        g.save();
        g.translate(cx, cy);
        g.scale(1, sy);
        const body = g.createRadialGradient(0, 0, rad * 0.1, 0, 0, rad);
        body.addColorStop(0, 'rgba(255,255,255,0.015)');
        body.addColorStop(0.72, 'rgba(210,225,240,0.06)');
        body.addColorStop(0.92, 'rgba(20,30,40,0.3)');
        body.addColorStop(1, 'rgba(20,30,40,0)');
        g.fillStyle = body;
        g.beginPath();
        g.arc(0, 0, rad, 0, Math.PI * 2);
        g.fill();
        const hl = g.createRadialGradient(-rad * 0.35, -rad * 0.4, 0, -rad * 0.35, -rad * 0.4, rad * 0.45);
        hl.addColorStop(0, 'rgba(255,255,255,0.5)');
        hl.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = hl;
        g.beginPath();
        g.arc(-rad * 0.35, -rad * 0.4, rad * 0.45, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
    }
  }
  return canvas.toDataURL();
}

/** Rayures fines d'une visière en polycarbonate. */
function scratchTexture(): string {
  const c = makeCanvas(512, 288);
  if (!c) return '';
  const { canvas, g } = c;
  const r = rng(29);
  g.lineCap = 'round';
  for (let i = 0; i < 60; i++) {
    const x = r() * 512;
    const y = r() * 288;
    const a = (r() - 0.5) * 1.2 + (r() < 0.5 ? 0.3 : -0.2);
    const len = 8 + r() * 70;
    g.strokeStyle = `rgba(255,255,255,${0.03 + r() * 0.09})`;
    g.lineWidth = 0.4 + r() * 0.7;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + (r() - 0.5) * 6, y + Math.sin(a) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  return canvas.toDataURL();
}

export class ScreenFxOverlay {
  private readonly root: HTMLDivElement;
  private readonly style: HTMLStyleElement;
  private readonly veil: HTMLDivElement;
  private readonly tears: HTMLDivElement;
  private readonly lidTop: HTMLDivElement;
  private readonly lidBottom: HTMLDivElement;
  private readonly flash: HTMLDivElement;
  private readonly wetA: HTMLDivElement;
  private readonly wetB: HTMLDivElement;
  private readonly pain: HTMLDivElement;
  private readonly visor: HTMLDivElement;
  /** Dernières valeurs écrites dans le DOM (on ne touche aux styles que si elles changent). */
  private readonly last = new Float32Array(12).fill(-1);
  private canvasFilter = '';
  private shown = true;
  /** Flou CSS du canevas autorisé (préréglage). */
  blur = true;

  constructor(private readonly container: HTMLElement, private readonly canvas: HTMLCanvasElement) {
    const doc = container.ownerDocument;
    this.style = doc.createElement('style');
    this.style.textContent = CSS;
    doc.head.appendChild(this.style);
    this.root = doc.createElement('div');
    this.root.className = 'crs-fx';
    this.root.setAttribute('aria-hidden', 'true');
    const add = (cls: string, parent: HTMLElement = this.root): HTMLDivElement => {
      const el = doc.createElement('div');
      el.className = cls;
      parent.appendChild(el);
      return el;
    };
    this.wetA = add('wet a');
    this.wetB = add('wet b');
    this.visor = add('visor');
    for (const part of ['tint', 'glare', 'scratch', 'rim']) {
      const i = doc.createElement('i');
      i.className = part;
      this.visor.appendChild(i);
    }
    this.veil = add('gas-veil');
    this.tears = add('gas-tears');
    this.pain = add('pain');
    this.flash = add('flash');
    this.lidTop = add('lid top');
    this.lidBottom = add('lid bottom');
    // textures procédurales
    this.tears.style.backgroundImage = `url(${tearsTexture()})`;
    this.wetA.style.backgroundImage = `url(${dropsTexture(5, 90, 13)})`;
    this.wetB.style.backgroundImage = `url(${dropsTexture(17, 26, 30)})`;
    (this.visor.querySelector('.scratch') as HTMLElement).style.backgroundImage = `url(${scratchTexture()})`;
    container.appendChild(this.root);
    this.setShown(false);
  }

  private setShown(on: boolean): void {
    if (on === this.shown) return;
    this.shown = on;
    this.root.style.display = on ? '' : 'none';
  }

  private write(slot: number, value: number, quantum: number): boolean {
    const q = Math.round(value / quantum) * quantum;
    if (this.last[slot] === q) return false;
    this.last[slot] = q;
    return true;
  }

  /** Reporte l'état à l'écran. */
  apply(state: ScreenFxState): void {
    if (state.idle) {
      if (this.shown) {
        this.setShown(false);
        this.setCanvasFilter('');
        this.last.fill(-1);
      }
      return;
    }
    this.setShown(true);
    const v = state.value;
    const gas = v[0]!;
    const flash = v[1]!;
    const wet = v[2]!;
    const pain = v[3]!;
    const visor = v[4]!;
    const t = state.time;

    // ── gaz : vue brouillée (flou du canevas), voile, larmes qui coulent, paupières ──
    if (this.write(0, gas, 0.01)) {
      this.veil.style.opacity = (Math.min(1, gas * 1.15)).toFixed(3);
      this.tears.style.opacity = (Math.min(1, gas * 1.3)).toFixed(3);
    }
    if (gas > 0.01 && this.write(1, (t * 0.035) % 0.06, 0.0005)) {
      // les larmes glissent lentement vers le bas
      this.tears.style.transform = `translateY(${(((t * 0.035) % 0.06) * 100).toFixed(2)}%)`;
    }
    const blurPx = this.blur ? gas * gas * 7 + flash * 2.5 : 0;
    if (this.write(2, blurPx, 0.25) || this.write(3, gas, 0.02)) {
      this.setCanvasFilter(blurPx > 0.2 || gas > 0.02
        ? `${blurPx > 0.2 ? `blur(${blurPx.toFixed(1)}px) ` : ''}saturate(${(1 - 0.4 * gas).toFixed(2)}) brightness(${(1 + 0.1 * gas).toFixed(2)})`
        : '');
    }
    if (this.write(4, state.blink, 0.01)) {
      const c = state.blink;
      this.lidTop.style.transform = `translateY(${(-101 + 99 * c).toFixed(1)}%)`;
      this.lidBottom.style.transform = `translateY(${(101 - 99 * c).toFixed(1)}%)`;
    }

    // ── flash : blanc total puis retour ──
    if (this.write(5, flash, 0.005)) this.flash.style.opacity = Math.pow(flash, 0.8).toFixed(3);

    // ── gouttes : deux couches qui ruissellent à des vitesses différentes ──
    if (this.write(6, wet, 0.01)) {
      this.wetA.style.opacity = Math.min(1, wet * 1.2).toFixed(3);
      this.wetB.style.opacity = Math.min(1, wet * wet * 1.2).toFixed(3);
    }
    if (wet > 0.01 && this.write(7, (t * 9) % 660, 0.5)) {
      this.wetA.style.backgroundPosition = `0px ${((t * 9) % 420).toFixed(1)}px`;
      this.wetB.style.backgroundPosition = `130px ${((t * 26) % 660).toFixed(1)}px`;
    }

    // ── douleur : vignette rouge qui bat ──
    const beat = pain * (0.82 + 0.18 * Math.sin(t * 9));
    if (this.write(8, beat, 0.01)) this.pain.style.opacity = Math.min(1, beat * 1.1).toFixed(3);

    // ── visière : elle descend du haut du champ de vision ──
    if (this.write(9, visor, 0.004)) this.visor.style.transform = `translateY(${(-101 * (1 - visor)).toFixed(2)}%)`;
  }

  private setCanvasFilter(filter: string): void {
    if (filter === this.canvasFilter) return;
    this.canvasFilter = filter;
    this.canvas.style.filter = filter;
  }

  dispose(): void {
    this.setCanvasFilter('');
    this.root.remove();
    this.style.remove();
  }
}
