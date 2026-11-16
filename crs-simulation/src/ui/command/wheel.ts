/* =====================================================================================
 * Menu radial (roue) en SVG : secteurs en couronne, libellé au centre. Sélection par direction
 * (stick, glissement relatif de la souris), par survol direct ou par toucher. Sert à la roue
 * d'ordres en vue de jeu et à l'ordre rapide de la carte tactique.
 * ===================================================================================== */

export interface WheelItem {
  id: string;
  label: string;
  /** Deuxième ligne, plus petite (facultative). */
  sub?: string;
  disabled?: boolean;
  /** Ordre de force : secteur surligné en rouge. */
  force?: boolean;
}

export interface WheelOptions {
  onChoose(index: number, item: WheelItem): void;
  onCancel(): void;
}

const R_OUT = 152;
const R_IN = 58;
const R_TEXT = 106;
const NS = 'http://www.w3.org/2000/svg';

function polar(r: number, a: number): string {
  return `${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`;
}

export class RadialMenu {
  readonly root: HTMLDivElement;
  highlighted = -1;
  private readonly svg: SVGSVGElement;
  private readonly wedges: SVGPathElement[] = [];
  private readonly title: SVGTextElement;
  private readonly sub: SVGTextElement;
  private idleTitle = '';
  private idleSub = '';
  private readonly step: number;

  constructor(host: HTMLElement, readonly items: readonly WheelItem[], private readonly options: WheelOptions) {
    this.step = (Math.PI * 2) / items.length;
    this.root = document.createElement('div');
    this.root.className = 'cw-wheel';
    const svg = (this.svg = document.createElementNS(NS, 'svg'));
    svg.setAttribute('viewBox', '-160 -160 320 320');
    svg.setAttribute('class', 'cw-svg');
    const gap = 0.022;
    for (let i = 0; i < items.length; i++) {
      const it = items[i]!;
      const a0 = i * this.step - this.step / 2 - Math.PI / 2 + gap;
      const a1 = (i + 1) * this.step - this.step / 2 - Math.PI / 2 - gap;
      const path = document.createElementNS(NS, 'path');
      path.setAttribute(
        'd',
        `M ${polar(R_IN, a0)} L ${polar(R_OUT, a0)} A ${R_OUT} ${R_OUT} 0 0 1 ${polar(R_OUT, a1)} L ${polar(R_IN, a1)} A ${R_IN} ${R_IN} 0 0 0 ${polar(R_IN, a0)} Z`,
      );
      path.setAttribute('class', 'cw-wedge' + (it.disabled ? ' is-off' : '') + (it.force ? ' is-force' : ''));
      path.dataset.index = String(i);
      svg.appendChild(path);
      this.wedges.push(path);
      const mid = i * this.step - Math.PI / 2;
      const tx = Math.cos(mid) * R_TEXT;
      const ty = Math.sin(mid) * R_TEXT;
      const text = document.createElementNS(NS, 'text');
      text.setAttribute('class', 'cw-label' + (it.disabled ? ' is-off' : ''));
      text.setAttribute('x', tx.toFixed(1));
      text.setAttribute('y', (ty + (it.sub ? -3 : 4)).toFixed(1));
      text.textContent = it.label;
      svg.appendChild(text);
      if (it.sub) {
        const s = document.createElementNS(NS, 'text');
        s.setAttribute('class', 'cw-sublabel' + (it.disabled ? ' is-off' : ''));
        s.setAttribute('x', tx.toFixed(1));
        s.setAttribute('y', (ty + 11).toFixed(1));
        s.textContent = it.sub;
        svg.appendChild(s);
      }
    }
    const hub = document.createElementNS(NS, 'circle');
    hub.setAttribute('r', String(R_IN - 6));
    hub.setAttribute('class', 'cw-hub');
    svg.appendChild(hub);
    this.title = document.createElementNS(NS, 'text');
    this.title.setAttribute('class', 'cw-title');
    this.title.setAttribute('y', '-2');
    this.sub = document.createElementNS(NS, 'text');
    this.sub.setAttribute('class', 'cw-sub');
    this.sub.setAttribute('y', '15');
    svg.append(this.title, this.sub);
    this.root.appendChild(svg);
    host.appendChild(this.root);

    svg.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      this.pointerAt(e.clientX, e.clientY);
    });
    svg.addEventListener('pointerleave', () => this.setHighlight(-1));
    svg.addEventListener('click', (e) => {
      const i = this.indexAtClient(e.clientX, e.clientY);
      e.stopPropagation();
      if (i === -2) this.options.onCancel();
      else if (i >= 0) {
        this.setHighlight(i);
        this.choose();
      }
    });
  }

  /** Texte du centre quand aucun secteur n'est surligné. */
  setCenter(title: string, sub: string): void {
    this.idleTitle = title;
    this.idleSub = sub;
    if (this.highlighted < 0) this.renderCenter();
  }

  private renderCenter(): void {
    const it = this.highlighted >= 0 ? this.items[this.highlighted]! : null;
    const title = it ? it.label : this.idleTitle;
    const sub = it ? (it.disabled ? 'Indisponible' : it.sub ?? this.idleSub) : this.idleSub;
    if (this.title.textContent !== title) this.title.textContent = title;
    if (this.sub.textContent !== sub) this.sub.textContent = sub;
  }

  setHighlight(index: number): void {
    if (index === this.highlighted) return;
    if (this.highlighted >= 0) this.wedges[this.highlighted]!.classList.remove('is-hot');
    this.highlighted = index;
    if (index >= 0) this.wedges[index]!.classList.add('is-hot');
    this.renderCenter();
  }

  /** Secteur dans la direction (dx, dy) — écran, y vers le bas ; −1 si le vecteur est trop court. */
  indexOfVector(dx: number, dy: number, minLen: number): number {
    if (Math.hypot(dx, dy) < minLen) return -1;
    let a = Math.atan2(dy, dx) + Math.PI / 2 + this.step / 2;
    a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    return Math.min(this.items.length - 1, Math.floor(a / this.step));
  }

  /** Surligne le secteur dans la direction donnée ; un vecteur court ne change rien. */
  pointAt(dx: number, dy: number, minLen: number): void {
    const i = this.indexOfVector(dx, dy, minLen);
    if (i >= 0) this.setHighlight(i);
  }

  /** −1 : hors de la roue ; −2 : au centre ; sinon l'indice du secteur sous le point. */
  indexAtClient(clientX: number, clientY: number): number {
    const r = this.svg.getBoundingClientRect();
    const k = 320 / Math.max(1, r.width);
    const dx = (clientX - (r.left + r.width / 2)) * k;
    const dy = (clientY - (r.top + r.height / 2)) * k;
    const d = Math.hypot(dx, dy);
    if (d < R_IN - 4) return -2;
    if (d > R_OUT + 6) return -1;
    return this.indexOfVector(dx, dy, 0);
  }

  pointerAt(clientX: number, clientY: number): void {
    const i = this.indexAtClient(clientX, clientY);
    this.setHighlight(i >= 0 ? i : -1);
  }

  /** Valide le secteur surligné. false s'il n'y en a pas ou s'il est indisponible. */
  choose(): boolean {
    const i = this.highlighted;
    if (i < 0) return false;
    const it = this.items[i]!;
    if (it.disabled) return false;
    this.options.onChoose(i, it);
    return true;
  }

  dispose(): void {
    this.root.remove();
  }
}
