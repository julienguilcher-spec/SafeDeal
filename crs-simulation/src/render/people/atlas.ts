/* Atlas de textes généré sur canvas : marquages dorsaux (POLICE, CRS, GENDARMERIE, PRESSE, SAMU…),
 * galons, slogans des pancartes et banderoles. Une cellule par texte, allouée à la demande. */

import * as THREE from 'three';

export const ATLAS_COLS = 4;
export const ATLAS_ROWS = 16;
const CELL_W = 256;
const CELL_H = 64;

/** Slogans génériques et fictifs (neutralité : aucun mouvement, parti ou syndicat réel). */
export const SLOGANS: readonly string[] = [
  'JUSTICE SOCIALE', 'ON LÂCHE RIEN', 'SOLIDARITÉ', 'TOUS ENSEMBLE', 'ÉGALITÉ', 'DIGNITÉ',
  'NOS VIES COMPTENT', 'ÉCOUTEZ-NOUS', 'ASSEZ !', 'RÉSISTANCE', 'DE L’AIR !', 'UNIS ET DEBOUT',
  'UN AUTRE AVENIR', 'RESPECT', 'LA RUE EST À NOUS', 'PAIX',
];

export class TextAtlas {
  readonly texture: THREE.CanvasTexture;
  private readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private readonly cells = new Map<string, number>();
  private next = 1;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = CELL_W * ATLAS_COLS;
    this.canvas.height = CELL_H * ATLAS_ROWS;
    const g = this.canvas.getContext('2d');
    if (!g) throw new Error('[people] contexte 2D indisponible pour l’atlas de textes');
    this.g = g;
    g.fillStyle = '#000';
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.NoColorSpace;
    this.texture.generateMipmaps = true;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.anisotropy = 4;
    // textes courants préparés d'avance
    for (const t of ['POLICE', 'CRS', 'GENDARMERIE', 'PRESSE', 'SAMU', 'SECOURS', 'OBSERVATEUR', 'SAPEURS-POMPIERS']) this.cellOf(t);
    for (let i = 1; i <= 6; i++) this.cellOf('#' + i);
    for (const s of SLOGANS) this.cellOf(s);
  }

  /** Première cellule des slogans et nombre de slogans (cellules consécutives). */
  get sloganBase(): number {
    return this.cells.get(SLOGANS[0]) ?? 0;
  }

  /** Cellule d'atlas d'un texte (0 si l'atlas est plein). '#n' dessine n galons. */
  readonly cellOf = (text: string): number => {
    const known = this.cells.get(text);
    if (known !== undefined) return known;
    if (this.next >= ATLAS_COLS * ATLAS_ROWS) return 0;
    const cell = this.next++;
    this.cells.set(text, cell);
    const x0 = (cell % ATLAS_COLS) * CELL_W, y0 = Math.floor(cell / ATLAS_COLS) * CELL_H;
    const g = this.g;
    g.save();
    g.beginPath();
    g.rect(x0, y0, CELL_W, CELL_H);
    g.clip();
    g.fillStyle = '#000';
    g.fillRect(x0, y0, CELL_W, CELL_H);
    g.fillStyle = '#fff';
    if (text.charCodeAt(0) === 35 && text.length === 2) {
      // galons : barres horizontales empilées
      const n = text.charCodeAt(1) - 48;
      const bh = Math.min(9, 44 / n - 3);
      const total = n * bh + (n - 1) * 3;
      for (let i = 0; i < n; i++) g.fillRect(x0 + 58, y0 + (CELL_H - total) / 2 + i * (bh + 3), 140, bh);
    } else {
      let size = 50;
      g.font = `900 ${size}px "Arial Black", "Helvetica Neue", Arial, Helvetica, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const w = g.measureText(text).width;
      const maxW = CELL_W - 18;
      let sx = 1;
      if (w > maxW) {
        // d'abord réduire le corps, puis condenser horizontalement
        size = Math.max(30, Math.floor((size * maxW) / w));
        g.font = `900 ${size}px "Arial Black", "Helvetica Neue", Arial, Helvetica, sans-serif`;
        const w2 = g.measureText(text).width;
        if (w2 > maxW) sx = maxW / w2;
      }
      g.translate(x0 + CELL_W / 2, y0 + CELL_H / 2 + 2);
      g.scale(sx, 1);
      g.fillText(text, 0, 0);
    }
    g.restore();
    this.texture.needsUpdate = true;
    return cell;
  };

  dispose(): void {
    this.texture.dispose();
  }
}

/** Texture d'ombre de contact : disque à bord doux. */
export function createBlobTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.75)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}
