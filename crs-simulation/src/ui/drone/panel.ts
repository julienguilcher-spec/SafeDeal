/* =====================================================================================
 * Retour vidéo du drone — fenêtre incrustée (DOM seulement, aucune logique de jeu).
 *   image          canevas 2D rempli par la vue annexe du rendu de base ('render.aux') ;
 *   habillage      coins et réticule fins (même trait que le cadre du drone du HUD), pastille REC,
 *                  indicatif de l'appareil, altitude, cap, zoom, horodatage, effectif estimé dans le champ ;
 *   détection      calque de repères sur les manifestants dans le champ (comme l'aide à l'analyse des drones de
 *                  surveillance) : à 60 m, une personne ne fait qu'un ou deux pixels dans une petite fenêtre ;
 *   commandes      appareil suivant, détection, zoom, format, fermer ; un clic sur l'image change de format ;
 *                  touches rappelées sur l'image : O fermer, Maj + O format, Alt + O zoom.
 * Netteté : le canevas occupe exactement la taille CSS de la fenêtre (cadre dessiné par une ombre, pas une bordure
 * qui le réduirait de 2 px et le ferait rééchantillonner) ; pas de trame ni de filtre qui brouillerait l'image.
 * La fenêtre vit dans son propre calque (au-dessus des écrans, sous les notifications) : elle reste visible
 * par-dessus la carte tactique.
 * ===================================================================================== */

import { button, el, setClass, setText } from '../maps/icons';
import { ensureMapsStyle } from '../maps/style';
import type { FeedMode, FeedSize } from './logic';

const STYLE_ID = 'dv-feed-style';

function ensureFeedStyle(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  ensureMapsStyle();
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
.dv-layer{position:absolute;inset:0;z-index:45;pointer-events:none;overflow:hidden}
.dv{position:absolute;left:0;top:0;pointer-events:auto;border-radius:6px;overflow:hidden;background:#05080d;
box-shadow:0 0 0 1px rgba(255,255,255,.22),0 6px 22px rgba(0,0,0,.55);font:600 11px/1.2 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
color:#f2f5fa;font-variant-numeric:tabular-nums;letter-spacing:.04em;text-shadow:0 1px 2px rgba(0,0,0,.85);user-select:none;-webkit-user-select:none}
.dv.is-off{display:none}
.dv-video{position:absolute;inset:0;width:100%;height:100%;display:block;cursor:zoom-in;filter:contrast(1.08)}
.dv.is-full .dv-video{cursor:zoom-out}
.dv-marks{position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none}
.dv-hud{position:absolute;inset:0;pointer-events:none}
.dv-c{position:absolute;width:14px;height:14px;border:1.5px solid rgba(255,255,255,.85);filter:drop-shadow(0 0 1px rgba(0,0,0,.8))}
.dv-c--tl{left:10%;top:16%;border-right:0;border-bottom:0}.dv-c--tr{right:10%;top:16%;border-left:0;border-bottom:0}
.dv-c--bl{left:10%;bottom:16%;border-right:0;border-top:0}.dv-c--br{right:10%;bottom:16%;border-left:0;border-top:0}
.dv-x{position:absolute;left:50%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px}
.dv-x::before,.dv-x::after{content:"";position:absolute;background:rgba(255,255,255,.9);box-shadow:0 0 2px rgba(0,0,0,.8)}
.dv-x::before{left:0;right:0;top:50%;height:1px;-webkit-mask-image:linear-gradient(to right,#000 0 38%,transparent 38% 62%,#000 62%);mask-image:linear-gradient(to right,#000 0 38%,transparent 38% 62%,#000 62%)}
.dv-x::after{top:0;bottom:0;left:50%;width:1px;-webkit-mask-image:linear-gradient(to bottom,#000 0 38%,transparent 38% 62%,#000 62%);mask-image:linear-gradient(to bottom,#000 0 38%,transparent 38% 62%,#000 62%)}
.dv-top,.dv-bot{position:absolute;left:0;right:0;display:flex;align-items:center;gap:8px;padding:4px 6px;white-space:nowrap}
.dv-top{top:0;background:linear-gradient(to bottom,rgba(0,0,0,.55),transparent)}
.dv-bot{bottom:0;background:linear-gradient(to top,rgba(0,0,0,.6),transparent)}
.dv-rec{display:inline-flex;align-items:center;gap:4px;color:#ff5a4f}
.dv-rec i{width:7px;height:7px;border-radius:50%;background:#ff3b30;box-shadow:0 0 4px #ff3b30;animation:dv-blink 1.2s steps(1) infinite}
@keyframes dv-blink{50%{opacity:.15}}
.dv-name{overflow:hidden;text-overflow:ellipsis;min-width:0}
.dv-gap{flex:1}
.dv-count{padding:1px 6px;border-radius:4px;background:rgba(255,196,64,.18);border:1px solid rgba(255,196,64,.55);color:#ffd36a}
.dv-dim{color:#c5cfdf}
.dv-zoom{color:#fff}
.dv.is-large .dv-zoom::before,.dv.is-full .dv-zoom::before{content:"ZOOM ";color:#c5cfdf}
.dv-keys{position:absolute;right:6px;bottom:22px;padding:1px 5px;border-radius:3px;background:rgba(0,0,0,.45);color:#d5dcea;font-size:9.5px;font-weight:600;letter-spacing:.02em}
.dv.is-large .dv-keys,.dv.is-full .dv-keys{bottom:28px;font-size:11px}
.dv.is-small .dv-keys{display:none}
.dv-tools{position:absolute;top:3px;right:3px;display:flex;gap:3px;pointer-events:auto}
.dv-tools .cm-btn{min-height:24px;min-width:24px;height:24px;padding:0 5px;border-radius:5px;background:rgba(8,13,24,.72);border:1px solid rgba(255,255,255,.2);color:#e8ecf3;font-size:11px;font-weight:700;gap:3px;justify-content:center}
.dv-tools .cm-btn:hover{background:rgba(30,44,70,.92)}
.dv-tools .cm-ico{width:14px;height:14px}
.dv-tools .is-off{display:none}
.dv-tools .cm-btn.is-on{border-color:rgba(255,196,64,.75);color:#ffd36a}
.dv-lost{position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:4px;text-align:center;padding:0 12px;
background:repeating-linear-gradient(45deg,#0b0f16 0 6px,#0f141d 6px 12px);color:#c5cfdf;font-size:12px;letter-spacing:.08em}
.dv-lost b{color:#ff8a80;font-size:12.5px;letter-spacing:.12em}
.dv.is-lost .dv-lost{display:flex}
.dv.is-lost .dv-video{visibility:hidden}
.dv.is-large .dv-top,.dv.is-large .dv-bot{font-size:12.5px;padding:6px 9px}
.dv.is-full .dv-top,.dv.is-full .dv-bot{font-size:14px;padding:8px 12px}
.dv.is-full .dv-c{width:28px;height:28px}
.dv.is-small .dv-bot .dv-dim{display:none}
.dv.is-small .dv-top,.dv.is-small .dv-bot{gap:5px;padding:3px 5px;font-size:10.5px}
.dv.is-large .dv-c{width:20px;height:20px}
@media (pointer:coarse){.dv-tools .cm-btn{min-height:30px;min-width:30px;height:30px}}
`;
  document.head.appendChild(s);
}

export interface FeedPanelActions {
  next(): void;
  detect(): void;
  zoom(): void;
  enlarge(): void;
  close(): void;
}

export class FeedPanel {
  readonly layer: HTMLDivElement;
  readonly root: HTMLDivElement;
  readonly canvas: HTMLCanvasElement;
  /** Calque des repères de détection (même définition que l'image). */
  readonly marks: HTMLCanvasElement;
  private readonly name: HTMLElement;
  private readonly alt: HTMLElement;
  private readonly cap: HTMLElement;
  private readonly zoomTxt: HTMLElement;
  private readonly clock: HTMLElement;
  private readonly count: HTMLElement;
  private readonly lostTitle: HTMLElement;
  private readonly lostText: HTMLElement;
  private readonly nextBtn: HTMLButtonElement;
  private readonly zoomBtn: HTMLButtonElement;
  private readonly detectBtn: HTMLButtonElement;
  private shown = false;
  private x = -1;
  private y = -1;
  private w = 0;
  private h = 0;

  constructor(host: HTMLElement, actions: FeedPanelActions) {
    ensureFeedStyle();
    this.layer = el('div', 'dv-layer');
    // « #ui > * » rend les clics aux enfants directs de #ui : le calque, lui, doit les laisser passer
    this.layer.style.pointerEvents = 'none';
    this.root = el('div', 'cm-root dv is-off');
    this.root.dataset.id = 'drone-feed';
    this.root.setAttribute('role', 'img');
    this.root.setAttribute('aria-label', 'Retour vidéo du drone');
    this.canvas = el('canvas', 'dv-video');
    this.canvas.width = 2;
    this.canvas.height = 2;
    this.canvas.dataset.id = 'drone-feed-video';
    this.canvas.addEventListener('click', (e) => {
      e.stopPropagation();
      actions.enlarge();
    });
    // pas de clic qui traverse vers le jeu (tir, capture de la souris)
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.root.addEventListener('mousedown', (e) => e.stopPropagation());

    this.marks = el('canvas', 'dv-marks');
    this.marks.width = 2;
    this.marks.height = 2;
    const hud = el('div', 'dv-hud');
    hud.append(el('i', 'dv-c dv-c--tl'), el('i', 'dv-c dv-c--tr'), el('i', 'dv-c dv-c--bl'), el('i', 'dv-c dv-c--br'), el('i', 'dv-x'));
    const top = el('div', 'dv-top');
    const rec = el('span', 'dv-rec');
    rec.append(el('i'), el('span', undefined, 'REC'));
    this.name = el('span', 'dv-name', 'DRONE');
    top.append(rec, this.name);
    const bot = el('div', 'dv-bot');
    this.alt = el('span', undefined, 'ALT —');
    this.cap = el('span', 'dv-dim', 'CAP —');
    this.zoomTxt = el('span', 'dv-zoom', '×1');
    this.clock = el('span', 'dv-dim', '');
    this.count = el('b', 'dv-count', '');
    bot.append(this.alt, this.cap, this.zoomTxt, el('span', 'dv-gap'), this.clock, this.count);
    // touches, sans souris (Mac portable) : rappel discret sur l'image
    const keys = el('span', 'dv-keys', 'O fermer · Maj + O taille · Alt + O zoom');
    hud.append(top, bot, keys);

    const lost = el('div', 'dv-lost');
    this.lostTitle = el('b', undefined, 'PAS DE SIGNAL');
    this.lostText = el('span', undefined, '');
    lost.append(this.lostTitle, this.lostText);

    const tools = el('div', 'dv-tools');
    this.nextBtn = button('', () => actions.next(), { icon: 'chevron', id: 'drone-feed-next', title: 'Drone suivant' });
    this.detectBtn = button('', () => actions.detect(), { icon: 'eye', id: 'drone-feed-detect', title: 'Détection des personnes' });
    this.zoomBtn = button('×1', () => actions.zoom(), { id: 'drone-feed-zoom', title: 'Zoom optique de la caméra (Alt + O)' });
    const size = button('', () => actions.enlarge(), { icon: 'select', id: 'drone-feed-size', title: 'Taille : petite, agrandie, plein écran (Maj + O)' });
    const close = button('', () => actions.close(), { icon: 'close', id: 'drone-feed-close', title: 'Fermer le retour vidéo (O)' });
    tools.append(this.nextBtn, this.detectBtn, this.zoomBtn, size, close);

    this.root.append(this.canvas, this.marks, hud, lost, tools);
    this.layer.append(this.root);
    host.append(this.layer);
  }

  setShown(on: boolean): void {
    if (on === this.shown) return;
    this.shown = on;
    setClass(this.root, 'is-off', !on);
  }

  get visible(): boolean {
    return this.shown;
  }

  /** Taille (pixels CSS) et définition du canevas (pixels physiques). Retourne true si la définition a changé (image effacée). */
  setSize(size: FeedSize, mode: FeedMode, buffer: FeedSize): boolean {
    setClass(this.root, 'is-large', mode === 'large');
    setClass(this.root, 'is-full', mode === 'full');
    // petite fenêtre (téléphone) : altitude et effectif seulement en bas de l'image
    setClass(this.root, 'is-small', size.width < 300);
    if (size.width !== this.w || size.height !== this.h) {
      this.w = size.width;
      this.h = size.height;
      this.root.style.width = size.width + 'px';
      this.root.style.height = size.height + 'px';
    }
    const cw = Math.max(2, Math.round(buffer.width));
    const ch = Math.max(2, Math.round(buffer.height));
    if (this.canvas.width === cw && this.canvas.height === ch) return false;
    this.canvas.width = cw;
    this.canvas.height = ch;
    this.marks.width = cw;
    this.marks.height = ch;
    return true;
  }

  get width(): number {
    return this.w;
  }

  get height(): number {
    return this.h;
  }

  place(x: number, y: number): void {
    const px = Math.round(x);
    const py = Math.round(y);
    if (px === this.x && py === this.y) return;
    this.x = px;
    this.y = py;
    this.root.style.transform = `translate3d(${px}px,${py}px,0)`;
  }

  setInfo(name: string, alt: string, cap: string, zoom: string, clock: string, count: string): void {
    setText(this.name, name);
    setText(this.alt, alt);
    setText(this.cap, cap);
    setText(this.zoomTxt, zoom);
    setText(this.clock, clock);
    setText(this.count, count);
    this.count.style.display = count !== '' ? '' : 'none';
    const zl = this.zoomBtn.querySelector('.cm-btn-t');
    if (zl) setText(zl as HTMLElement, zoom);
  }

  /** Signal perdu (aucun appareil en vol) : motif à la place de l'image. */
  setLost(lost: boolean, title = 'PAS DE SIGNAL', text = ''): void {
    setClass(this.root, 'is-lost', lost);
    if (lost) this.clearMarks();
    if (lost) {
      setText(this.lostTitle, title);
      setText(this.lostText, text);
    }
  }

  setDetect(on: boolean): void {
    setClass(this.detectBtn, 'is-on', on);
    if (!on) this.clearMarks();
  }

  clearMarks(): void {
    const g = this.marks.getContext('2d');
    if (g) g.clearRect(0, 0, this.marks.width, this.marks.height);
  }

  setMulti(multi: boolean): void {
    setClass(this.nextBtn, 'is-off', !multi);
  }

  dispose(): void {
    this.layer.remove();
  }
}
