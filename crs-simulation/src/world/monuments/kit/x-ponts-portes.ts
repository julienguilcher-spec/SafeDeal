/* Kit monuments — lot « ponts » : pièces communes aux deux portes des Grands Boulevards (arcs de triomphe de
 * Louis XIV) : cartouche à inscription en lettres dorées peinte sur canvas (vrai texte), obélisque en applique.
 * Fichier ajouté par le lot « ponts » : les fichiers d'origine du kit ne sont pas modifiés. */
import { Geo } from './geo';
import { box, frustum, sphere } from './shapes';
import { canvas2d, css, mixHex, paintMatter, texFrom } from './canvas';
import { defineMaterial, litMaterial } from './materials';

/**
 * Déclare un matériau « plaque à inscription » : texte capital doré (ou gravé) centré sur un fond de pierre ou de
 * marbre. La plaque se pose avec des UV 0..1 (quadFit). `aspect` = largeur / hauteur de la plaque.
 */
export function inscriptionPlate(key: string, text: string, aspect: number, ground = 0xe0cfa8, ink = 0xd9b23a): void {
  defineMaterial(key, () => {
    const h = 128, w = Math.min(2048, Math.max(256, Math.round((h * aspect) / 64) * 64));
    const cv = canvas2d(w, h);
    if (!cv) return litMaterial(key, { color: ground, roughness: 0.9, night: 0.9 });
    paintMatter(cv, ground, 0.04, 6, 91, 0.03);
    const g = cv.g;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    let size = h * 0.62;
    g.font = `700 ${size}px Georgia, 'Times New Roman', serif`;
    const tw = g.measureText(text).width;
    if (tw > w * 0.9) { size *= (w * 0.9) / tw; g.font = `700 ${size}px Georgia, 'Times New Roman', serif`; }
    g.fillStyle = css(mixHex(ink, 0x000000, 0.55)); g.fillText(text, w / 2 + 2, h / 2 + 3);
    g.fillStyle = css(ink); g.fillText(text, w / 2, h / 2);
    return litMaterial(key, { color: 0xffffff, roughness: 0.75, night: 0.95 }, { map: texFrom(cv, { clamp: true }), bump: null });
  });
}

/** Obélisque (pyramide) en applique contre une façade : dos dans le plan z = 0, saillie vers +z, base sur y = 0. */
export function appliedObelisk(width: number, height: number, depth: number): Geo {
  const g = new Geo();
  g.append(box(width * 1.15, height * 0.06, depth * 1.3).translate(0, 0, depth * 0.65));
  g.append(frustum(width, depth, width * 0.3, depth * 0.45, height * 0.88, { top: true }).translate(0, height * 0.06, depth * 0.5));
  g.append(frustum(width * 0.3, depth * 0.45, 0.02, 0.02, height * 0.04, { top: false }).translate(0, height * 0.94, depth * 0.5));
  g.append(sphere(width * 0.11, 6, 4).translate(0, height * 0.985, depth * 0.5));
  return g;
}
