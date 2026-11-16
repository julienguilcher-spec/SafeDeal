/* =====================================================================================
 * Interface — mise en forme française des nombres, heures, durées et distances.
 * Fonctions pures (aucun DOM), déterministes (pas d'Intl : même résultat sous Node et navigateur).
 *
 * Typographie : espace insécable avant « % », « h », « m », « km » ; espace fine insécable
 * comme séparateur de milliers et avant « : ; ! ? » ; guillemets français.
 * ===================================================================================== */

/** Espace insécable. */
export const NBSP = ' ';
/** Espace fine insécable. */
export const NNBSP = ' ';

/** Entier avec séparateur de milliers : 12500 → « 12 500 ». */
export function int(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const neg = n < 0;
  const digits = String(Math.round(Math.abs(n)));
  let out = '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += NNBSP;
    out += digits[i];
  }
  return neg ? '−' + out : out;
}

/** Nombre décimal à virgule : decimal(0.75, 2) → « 0,75 ». */
export function decimal(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return '—';
  const neg = n < 0;
  const fixed = Math.abs(n).toFixed(digits);
  const dot = fixed.indexOf('.');
  const whole = dot < 0 ? fixed : fixed.slice(0, dot);
  const frac = dot < 0 ? '' : fixed.slice(dot + 1);
  return (neg ? '−' : '') + int(Number(whole)) + (frac ? ',' + frac : '');
}

/** Pourcentage d'une valeur 0..1 : « 45 % ». */
export function percent(v: number): string {
  return `${Math.round(clamp01(v) * 100)}${NBSP}%`;
}

/** Heure de la journée (0..24, décimale) : 14.5 → « 14 h 30 », 9 → « 9 h 00 ». */
export function hourLabel(hour: number): string {
  const { h, m } = splitHour(hour);
  return `${h}${NBSP}h${NBSP}${m < 10 ? '0' : ''}${m}`;
}

/** Heure au format d'horloge : 14.5 → « 14:30 ». */
export function hourClock(hour: number): string {
  const { h, m } = splitHour(hour);
  return `${h < 10 ? '0' : ''}${h}:${m < 10 ? '0' : ''}${m}`;
}

function splitHour(hour: number): { h: number; m: number } {
  let total = Math.round((((hour % 24) + 24) % 24) * 60);
  if (total >= 1440) total -= 1440;
  return { h: Math.floor(total / 60), m: total % 60 };
}

/** Durée écoulée : 75 → « 1:15 », 3725 → « 1:02:05 ». */
export function stopwatch(seconds: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = h > 0 && m < 10 ? '0' + m : String(m);
  return (h > 0 ? h + ':' : '') + mm + ':' + (r < 10 ? '0' : '') + r;
}

/** Durée en toutes lettres : 1500 → « 25 min », 3725 → « 1 h 02 », 40 → « 40 s ». */
export function durationLabel(seconds: number): string {
  if (!Number.isFinite(seconds)) return 'temps réel';
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}${NBSP}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}${NBSP}min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `${h}${NBSP}h${NBSP}${r < 10 ? '0' : ''}${r}`;
}

/** Distance : 120 → « 120 m », 1250 → « 1,3 km ». Arrondie à 5 m au-delà de 50 m. */
export function distanceLabel(meters: number): string {
  if (!Number.isFinite(meters)) return '—';
  const d = Math.abs(meters);
  if (d >= 1000) return `${decimal(d / 1000, 1)}${NBSP}km`;
  const r = d > 50 ? Math.round(d / 5) * 5 : Math.round(d);
  return `${r}${NBSP}m`;
}

/** Vitesse en km/h à partir de m/s : « 32 km/h ». */
export function speedLabel(metersPerSecond: number): string {
  return `${Math.round(Math.abs(metersPerSecond) * 3.6)}${NBSP}km/h`;
}

/** Accord en nombre : plural(1, 'section', 'sections') → « 1 section ». */
export function plural(n: number, singular: string, pluralForm: string): string {
  return `${int(n)}${NBSP}${Math.abs(n) >= 2 ? pluralForm : singular}`;
}

/** Guillemets français avec espaces insécables. */
export function quote(text: string): string {
  return `«${NBSP}${text}${NBSP}»`;
}

/** Multiplicateur : 0.75 → « ×0,75 ». */
export function times(v: number, digits = 2): string {
  return '×' + decimal(v, digits);
}

/** Première lettre en capitale (« place de la Concorde » → « Place de la Concorde »). */
export function capitalize(text: string): string {
  return text.length ? text.charAt(0).toLocaleUpperCase('fr-FR') + text.slice(1) : text;
}

/** Rose des vents à 8 secteurs pour un azimut en degrés (0 = nord, sens horaire). */
export function cardinal8(degrees: number): string {
  const names = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  const d = ((degrees % 360) + 360) % 360;
  return names[Math.round(d / 45) % 8]!;
}

/** Nom complet du secteur de vent : 315 → « nord-ouest ». */
export function cardinalName(degrees: number): string {
  const names = ['nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-ouest', 'ouest', 'nord-ouest'];
  const d = ((degrees % 360) + 360) % 360;
  return names[Math.round(d / 45) % 8]!;
}

/** Date courte : « 16 nov. 2026, 14 h 05 » (fuseau local de l'appareil). */
export function dateLabel(ms: number): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '—';
  const months = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juill.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const day = d.getDate();
  return `${day === 1 ? '1er' : day}${NBSP}${months[d.getMonth()]}${NBSP}${d.getFullYear()}, ${hourLabel(d.getHours() + d.getMinutes() / 60)}`;
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
