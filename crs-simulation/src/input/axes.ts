/* =====================================================================================
 * Entrées — mathématiques des axes analogiques : zones mortes, courbes de réponse, gâchettes.
 * Fonctions pures, sans allocation (les résultats à deux composantes sont écrits dans `out`).
 * ===================================================================================== */

export interface Axis2 { x: number; y: number }

/** Réglages d'un stick analogique. */
export interface StickTuning {
  /** Rayon de la zone morte (0..1) : en dessous, le stick est considéré au repos. */
  inner: number;
  /** Rayon à partir duquel la sortie vaut 1 (les sticks n'atteignent pas toujours 1 en diagonale). */
  outer: number;
  /** Exposant de la courbe de réponse (1 = linéaire ; > 1 = plus fin près du centre). */
  gamma: number;
}

/** Valeurs par défaut : stick gauche (déplacement) et stick droit (regard). */
export const MOVE_STICK: Readonly<StickTuning> = { inner: 0.16, outer: 0.94, gamma: 1.15 };
export const LOOK_STICK: Readonly<StickTuning> = { inner: 0.14, outer: 0.96, gamma: 1.9 };

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Une valeur non finie (manette défaillante) vaut 0. */
export function finite(v: number): number {
  return v === v && v !== Infinity && v !== -Infinity ? v : 0;
}

/**
 * Zone morte sur un axe seul, remise à l'échelle : la sortie repart de 0 au bord de la zone
 * morte (pas de saut) et atteint ±1 à `outer`.
 */
export function deadzone1(v: number, inner: number, outer = 1): number {
  v = finite(v);
  const a = v < 0 ? -v : v;
  if (a <= inner) return 0;
  if (a >= outer) return v < 0 ? -1 : 1;
  const m = (a - inner) / (outer - inner);
  return v < 0 ? -m : m;
}

/** Courbe de réponse : conserve le signe, élève la norme à la puissance `gamma`. */
export function curve(v: number, gamma: number): number {
  if (gamma === 1 || v === 0) return v;
  return v < 0 ? -Math.pow(-v, gamma) : Math.pow(v, gamma);
}

/**
 * Stick à deux axes : zone morte RADIALE (la direction est conservée, pas d'effet « croix »),
 * remise à l'échelle entre `inner` et `outer`, puis courbe de réponse sur la norme.
 * Écrit dans `out` un vecteur de norme 0..1 et retourne cette norme.
 */
export function shapeStick(x: number, y: number, t: StickTuning, out: Axis2): number {
  x = finite(x);
  y = finite(y);
  const m = Math.sqrt(x * x + y * y);
  if (m <= t.inner || m === 0) {
    out.x = 0;
    out.y = 0;
    return 0;
  }
  let n = (m - t.inner) / (t.outer - t.inner);
  if (n > 1) n = 1;
  if (t.gamma !== 1) n = Math.pow(n, t.gamma);
  const k = n / m;
  out.x = x * k;
  out.y = y * k;
  return n;
}

/** Gâchette analogique 0..1 : petite zone morte en bas, saturation avant la butée. */
export function shapeTrigger(v: number, inner = 0.06, outer = 0.94): number {
  v = finite(v);
  if (v <= inner) return 0;
  if (v >= outer) return 1;
  return (v - inner) / (outer - inner);
}

/**
 * Bouton tiré d'une valeur analogique avec hystérésis : s'enfonce au-dessus de `on`, ne se
 * relâche qu'en dessous de `off` (évite le bégaiement autour du seuil).
 */
export function analogButton(value: number, wasDown: boolean, on = 0.4, off = 0.25): boolean {
  return wasDown ? value > off : value >= on;
}

/** Ramène un vecteur dans le disque unité (norme ≤ 1) ; retourne la norme finale. */
export function clampUnit(x: number, y: number, out: Axis2): number {
  const m2 = x * x + y * y;
  if (m2 > 1) {
    const k = 1 / Math.sqrt(m2);
    out.x = x * k;
    out.y = y * k;
    return 1;
  }
  out.x = x;
  out.y = y;
  return Math.sqrt(m2);
}

/**
 * Déplacement tiré de quatre touches : chaque axe vaut -1, 0 ou 1 (deux touches opposées
 * s'annulent) et la diagonale est normalisée (on ne va pas plus vite en biais).
 */
export function digitalMove(forward: boolean, back: boolean, left: boolean, right: boolean, out: Axis2): void {
  let x = (right ? 1 : 0) - (left ? 1 : 0);
  let y = (forward ? 1 : 0) - (back ? 1 : 0);
  if (x !== 0 && y !== 0) {
    x *= Math.SQRT1_2;
    y *= Math.SQRT1_2;
  }
  out.x = x;
  out.y = y;
}

/** État d'un joystick virtuel tactile. */
export interface VirtualStick {
  /** Vecteur de sortie, norme 0..1 (x = droite, y = HAUT de l'écran, donc « avant »). */
  x: number;
  y: number;
  /** Position du pommeau par rapport au centre, en pixels (bornée au rayon) — pour l'affichage. */
  knobX: number;
  knobY: number;
  /** Poussé à fond : course demandée. */
  full: boolean;
}

/** Réglages du joystick virtuel. */
export interface VirtualStickTuning {
  /** Rayon de course en pixels. */
  radius: number;
  /** Zone morte (fraction du rayon). */
  inner: number;
  /** Seuils de la position « à fond » (fraction du rayon du doigt, non bornée) avec hystérésis. */
  fullOn: number;
  fullOff: number;
  /** Exposant de la courbe de réponse. */
  gamma: number;
}

export const TOUCH_STICK: Readonly<Omit<VirtualStickTuning, 'radius'>> = { inner: 0.14, fullOn: 0.94, fullOff: 0.8, gamma: 1.1 };

/**
 * Joystick virtuel : `dx`, `dy` = écart du doigt au centre en pixels écran (y vers le bas).
 * Le pommeau est borné au rayon ; « à fond » se déclenche quand le doigt atteint le bord.
 */
export function shapeVirtualStick(dx: number, dy: number, t: VirtualStickTuning, s: VirtualStick): void {
  const r = t.radius > 1 ? t.radius : 1;
  const d = Math.sqrt(dx * dx + dy * dy);
  const raw = d / r;                         // peut dépasser 1 : le doigt sort du socle
  let kx = dx;
  let ky = dy;
  if (d > r) {
    kx = (dx / d) * r;
    ky = (dy / d) * r;
  }
  s.knobX = kx;
  s.knobY = ky;
  s.full = s.full ? raw >= t.fullOff : raw >= t.fullOn;
  const m = raw > 1 ? 1 : raw;
  if (m <= t.inner || d === 0) {
    s.x = 0;
    s.y = 0;
    return;
  }
  let n = (m - t.inner) / (1 - t.inner);
  if (t.gamma !== 1) n = Math.pow(n, t.gamma);
  // poussé à fond : la sortie vaut exactement 1, quelle que soit la courbe
  if (s.full && raw >= 1) n = 1;
  s.x = (dx / d) * n;
  s.y = -(dy / d) * n;
}

export function resetVirtualStick(s: VirtualStick): void {
  s.x = 0;
  s.y = 0;
  s.knobX = 0;
  s.knobY = 0;
  s.full = false;
}

/**
 * Pédale tactile analogique : `t` = position du doigt du bas (0) vers le haut (1) de la pédale.
 * Le bas de la pédale donne un filet de gaz (roulage au pas près de la foule), le haut la pleine charge.
 */
export function shapePedal(t: number, floor = 0.3, fullAt = 0.72): number {
  if (t !== t) return 1;
  if (t <= 0) return floor;
  if (t >= fullAt) return 1;
  return floor + (1 - floor) * (t / fullAt);
}
