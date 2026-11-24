/* =====================================================================================
 * Surcouche tactile — description des dispositions (données pures, aucun accès au DOM).
 *
 * Toutes les cotes sont en pixels CSS à l'échelle 1, c'est-à-dire sur un téléphone en paysage
 * de 844 × 390 ; la surcouche les multiplie par un facteur d'échelle (jusqu'à 1,45 sur tablette).
 * Chaque commande est ancrée à un coin de l'écran (zones sûres des encoches ajoutées en CSS) :
 * les pouces trouvent les boutons au même endroit quelle que soit la taille de l'écran.
 * ===================================================================================== */

import type { Button } from '@/core/contracts';

export type GameLayout = 'pied' | 'vehicule' | 'drone';
export const GAME_LAYOUTS: readonly GameLayout[] = ['pied', 'vehicule', 'drone'];

/** Dimensions de référence (téléphone en paysage). */
export const REF_WIDTH = 844;
export const REF_HEIGHT = 390;
export const MIN_SCALE = 0.82;
export const MAX_SCALE = 1.45;

/** Facteur d'échelle de la surcouche pour une taille d'écran donnée. */
export function overlayScale(width: number, height: number): number {
  const s = Math.min(width / REF_WIDTH, height / REF_HEIGHT);
  return s < MIN_SCALE ? MIN_SCALE : s > MAX_SCALE ? MAX_SCALE : s;
}

export type IconId =
  | 'action' | 'aim' | 'hand' | 'jump' | 'crouch' | 'radio' | 'orders' | 'map' | 'tactical' | 'camera'
  | 'pause' | 'forward' | 'mask' | 'visor' | 'lamp' | 'siren' | 'beacons' | 'horn' | 'handbrake' | 'exit'
  | 'gas' | 'brake' | 'up' | 'down' | 'zoomin' | 'zoomout' | 'headlights';

/** Pictogrammes au trait (zone 24 × 24), dessinés par le code : aucun fichier d'image. */
export const ICONS: Readonly<Record<IconId, string>> = {
  action: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>',
  aim: '<circle cx="12" cy="12" r="6.500"/><path d="M12 2v6M12 16v6M2 12h6M16 12h6"/>',
  hand: '<path d="M8.500 12.500V6.200a1.500 1.500 0 0 1 3 0V11"/><path d="M11.500 10.500V4.500a1.500 1.500 0 0 1 3 0V11"/><path d="M14.500 11V6.500a1.500 1.500 0 0 1 3 0v8c0 3.800-2.500 6.500-6.200 6.500-2.300 0-3.900-.9-5.100-2.700l-2.400-3.600c-.9-1.400.9-2.800 2.100-1.600l2.600 2.400"/>',
  jump: '<path d="M6 12.500l6-6 6 6"/><path d="M6 18.500l6-6 6 6"/>',
  crouch: '<path d="M6 5.500l6 6 6-6"/><path d="M6 11.500l6 6 6-6"/>',
  radio: '<rect x="7.500" y="8" width="9.500" height="13" rx="2"/><path d="M10 8V2.500"/><path d="M10.500 12h3.500"/><circle cx="12.250" cy="16.500" r="1.300" fill="currentColor" stroke="none"/>',
  orders: '<path d="M5 21.500V3.500"/><path d="M5 4.500h13l-3 4.250 3 4.250H5"/>',
  map: '<path d="M3 6.500l6-2 6 2 6-2v13l-6 2-6-2-6 2z"/><path d="M9 4.500v13M15 6.500v13"/>',
  tactical: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16"/><circle cx="15.500" cy="15" r="2" fill="currentColor" stroke="none"/>',
  camera: '<rect x="3" y="7.500" width="18" height="12" rx="2"/><circle cx="12" cy="13.500" r="3.200"/><path d="M8 7.500L9.500 5h5L16 7.500"/>',
  pause: '<path d="M8.500 5.500v13M15.500 5.500v13" stroke-width="3"/>',
  forward: '<path d="M4 6.500l7 5.500-7 5.500zM13 6.500l7 5.500-7 5.500z"/>',
  mask: '<path d="M6 10a6 6 0 0 1 12 0v2.500a6 6 0 0 1-12 0z"/><circle cx="9.500" cy="10.500" r="1.700"/><circle cx="14.500" cy="10.500" r="1.700"/><rect x="10" y="15.500" width="4" height="5" rx="1"/>',
  visor: '<path d="M4 15a8 8 0 0 1 16 0v2H4z"/><path d="M9.500 17v-3.500H20"/>',
  lamp: '<path d="M7 3h10l-2 6v11.500H9V9z"/><path d="M12 13v2.500"/>',
  siren: '<path d="M4 10v4h3l4.500 3.500v-11L7 10z"/><path d="M15 9a4.200 4.200 0 0 1 0 6M17.800 6.500a8 8 0 0 1 0 11"/>',
  beacons: '<path d="M7 17.500V13a5 5 0 0 1 10 0v4.500"/><path d="M4 17.500h16v3H4z"/><path d="M12 2.500v2.500M4.500 5.500l1.800 1.800M19.500 5.500l-1.800 1.800"/>',
  horn: '<path d="M3 10v4l3 .800 9 4.200V5L6 9.200z"/><path d="M18 9.200a4 4 0 0 1 0 5.600"/>',
  handbrake: '<circle cx="12" cy="12" r="6"/><path d="M10.500 15.500v-7h2.100a2 2 0 0 1 0 4h-2.100"/><path d="M3.800 6.500a9.500 9.500 0 0 0 0 11M20.200 6.500a9.500 9.500 0 0 1 0 11"/>',
  exit: '<path d="M13 4H5.500v16H13"/><path d="M10 12h10.500M17 8.500l3.500 3.500-3.500 3.500"/>',
  gas: '<path d="M12 20.500V4.500M5.500 11l6.500-6.500 6.500 6.500"/>',
  brake: '<circle cx="12" cy="12" r="8.500"/><path d="M7.500 12h9" stroke-width="2.600"/>',
  up: '<path d="M12 19.500V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 4.500V19M6 13l6 6 6-6"/>',
  zoomin: '<circle cx="10.500" cy="10.500" r="6.500"/><path d="M15.300 15.300l5.200 5.200M7.500 10.500h6M10.500 7.500v6"/>',
  zoomout: '<circle cx="10.500" cy="10.500" r="6.500"/><path d="M15.300 15.300l5.200 5.200M7.500 10.500h6"/>',
  headlights: '<path d="M10.500 5a7 7 0 0 0 0 14c1.400 0 2-3.100 2-7s-.6-7-2-7z"/><path d="M15.500 7.500H21M15.500 12H21M15.500 16.500H21"/>',
};

export type ControlShape = 'round' | 'pill' | 'chip' | 'pedal';

export interface ControlSpec {
  /** Identifiant unique dans sa disposition (classe CSS « ct-k-<key> »). */
  key: string;
  layout: GameLayout;
  /** Bouton du contrat tenu tant que le doigt est posé (null : pédale, qui n'alimente que throttle / brake). */
  button: Button | null;
  label: string;
  icon: IconId;
  shape: ControlShape;
  /** Bord d'ancrage horizontal et distance à ce bord. */
  side: 'left' | 'right';
  x: number;
  /** Bord d'ancrage vertical et distance à ce bord. */
  anchor: 'top' | 'bottom';
  y: number;
  w: number;
  h: number;
  /** À bascule par défaut (un appui enfonce, le suivant relâche). */
  toggle?: boolean;
  /** Glisser le doigt posé sur ce bouton fait aussi tourner la vue (viser en tirant). */
  lookDrag?: boolean;
  /** Pédale analogique : alimente InputState.throttle ou brake. */
  pedal?: 'throttle' | 'brake';
  /** Bouton contextuel « Interagir » : libellé modifiable, largeur adaptée au texte. */
  contextual?: boolean;
  /** Mis en avant (action principale). */
  accent?: boolean;
  /**
   * Disposition véhicule : commande réservée à la place qui la sert — 'conduite' (pédales, frein à main, klaxon,
   * avertisseurs, phares : conducteur seulement) ou 'arme' (tir : conducteur d'un engin armé, tireur). Un passager
   * n'a que « Sortir », la radio et les boutons système ; ses autres boutons ne feraient rien.
   */
  seat?: 'conduite' | 'arme';
}

/** Socle du joystick virtuel : centre par défaut et rayon de course. */
export interface StickSpec {
  layout: GameLayout;
  /** Centre par défaut : distance au bord gauche et au bord bas. */
  cx: number;
  cy: number;
  /** Rayon du socle (course du pommeau). */
  radius: number;
  knob: number;
  /** Volant : seul l'axe horizontal compte (le pommeau glisse sur une piste). */
  horizontal: boolean;
  label: string;
}

export const STICKS: readonly StickSpec[] = [
  { layout: 'pied', cx: 104, cy: 96, radius: 62, knob: 54, horizontal: false, label: '' },
  { layout: 'drone', cx: 104, cy: 96, radius: 62, knob: 54, horizontal: false, label: '' },
  { layout: 'vehicule', cx: 118, cy: 84, radius: 82, knob: 62, horizontal: true, label: 'Volant' },
];

/** Zone de pose du joystick : fraction gauche de l'écran, sous la bande haute. */
export const MOVE_ZONE = { width: 0.4, top: 0.3 } as const;

/** Rangée de boutons système en haut à droite, commune aux trois dispositions. */
function systemRow(layout: GameLayout): ControlSpec[] {
  const chip = (key: string, button: Button, label: string, icon: IconId, slot: number, row = 0): ControlSpec => ({
    key, layout, button, label, icon, shape: 'chip', side: 'right', x: 12 + slot * 55, anchor: 'top', y: 10 + row * 52, w: 51, h: 46,
  });
  return [
    chip('pause', 'pause', 'Pause', 'pause', 0),
    chip('map', 'map', 'Carte', 'map', 1),
    chip('tactical', 'tactical', 'Tactique', 'tactical', 2),
    chip('camera', 'camera', 'Caméra', 'camera', 3),
    chip('forward', 'fast_forward', 'Avance', 'forward', 4),
  ];
}

/** Radio et Ordres : à gauche, au-dessus du joystick, sous le pouce gauche. */
function commsRow(layout: GameLayout): ControlSpec[] {
  return [
    { key: 'radio', layout, button: 'radio', label: 'Radio', icon: 'radio', shape: 'round', side: 'left', x: 18, anchor: 'bottom', y: 196, w: 54, h: 54 },
    { key: 'orders', layout, button: 'orders', label: 'Ordres', icon: 'orders', shape: 'round', side: 'left', x: 82, anchor: 'bottom', y: 196, w: 54, h: 54 },
  ];
}

const PIED: ControlSpec[] = [
  ...systemRow('pied'),
  { key: 'mask', layout: 'pied', button: 'mask', label: 'Masque', icon: 'mask', shape: 'chip', side: 'right', x: 12, anchor: 'top', y: 62, w: 51, h: 46 },
  { key: 'visor', layout: 'pied', button: 'visor', label: 'Visière', icon: 'visor', shape: 'chip', side: 'right', x: 67, anchor: 'top', y: 62, w: 51, h: 46 },
  { key: 'lamp', layout: 'pied', button: 'flashlight', label: 'Lampe', icon: 'lamp', shape: 'chip', side: 'right', x: 122, anchor: 'top', y: 62, w: 51, h: 46 },
  ...commsRow('pied'),
  { key: 'primary', layout: 'pied', button: 'primary', label: 'Action', icon: 'action', shape: 'round', side: 'right', x: 24, anchor: 'bottom', y: 30, w: 88, h: 88, lookDrag: true, accent: true },
  { key: 'crouch', layout: 'pied', button: 'crouch', label: 'Accroupi', icon: 'crouch', shape: 'round', side: 'right', x: 122, anchor: 'bottom', y: 16, w: 58, h: 58 },
  { key: 'secondary', layout: 'pied', button: 'secondary', label: 'Viser', icon: 'aim', shape: 'round', side: 'right', x: 124, anchor: 'bottom', y: 84, w: 66, h: 66, toggle: true, lookDrag: true },
  { key: 'jump', layout: 'pied', button: 'jump', label: 'Saut', icon: 'jump', shape: 'round', side: 'right', x: 38, anchor: 'bottom', y: 128, w: 58, h: 58 },
  { key: 'interact', layout: 'pied', button: 'interact', label: 'Interagir', icon: 'hand', shape: 'pill', side: 'right', x: 24, anchor: 'bottom', y: 198, w: 132, h: 46, contextual: true },
];

const VEHICULE: ControlSpec[] = [
  ...systemRow('vehicule'),
  { key: 'headlights', layout: 'vehicule', button: 'headlights', label: 'Phares', icon: 'headlights', shape: 'chip', side: 'right', x: 12, anchor: 'top', y: 62, w: 51, h: 46, seat: 'conduite' },
  ...commsRow('vehicule'),
  // « Sortir » à droite, au-dessus des avertisseurs, comme « Interagir » à pied : à gauche, le libellé contextuel
  // élargi (« Descendre — Fourgon de CRS ») passait sous la mini-carte et ne recevait plus le doigt
  { key: 'exit', layout: 'vehicule', button: 'interact', label: 'Sortir', icon: 'exit', shape: 'pill', side: 'right', x: 24, anchor: 'top', y: 113, w: 118, h: 46, contextual: true },
  { key: 'gas', layout: 'vehicule', button: null, label: 'Accélérer', icon: 'gas', shape: 'pedal', side: 'right', x: 24, anchor: 'bottom', y: 24, w: 86, h: 136, pedal: 'throttle', accent: true, seat: 'conduite' },
  { key: 'brake', layout: 'vehicule', button: null, label: 'Frein', icon: 'brake', shape: 'pedal', side: 'right', x: 122, anchor: 'bottom', y: 24, w: 78, h: 108, pedal: 'brake', seat: 'conduite' },
  { key: 'handbrake', layout: 'vehicule', button: 'handbrake', label: 'Frein à main', icon: 'handbrake', shape: 'round', side: 'right', x: 212, anchor: 'bottom', y: 20, w: 58, h: 58, seat: 'conduite' },
  { key: 'fire', layout: 'vehicule', button: 'primary', label: 'Action', icon: 'action', shape: 'round', side: 'right', x: 212, anchor: 'bottom', y: 88, w: 62, h: 62, lookDrag: true, seat: 'arme' },
  { key: 'horn', layout: 'vehicule', button: 'horn', label: 'Klaxon', icon: 'horn', shape: 'round', side: 'right', x: 24, anchor: 'bottom', y: 168, w: 58, h: 58, seat: 'conduite' },
  { key: 'siren', layout: 'vehicule', button: 'siren', label: 'Sirène', icon: 'siren', shape: 'round', side: 'right', x: 90, anchor: 'bottom', y: 168, w: 58, h: 58, seat: 'conduite' },
  { key: 'beacons', layout: 'vehicule', button: 'beacons', label: 'Gyro', icon: 'beacons', shape: 'round', side: 'right', x: 156, anchor: 'bottom', y: 168, w: 58, h: 58, seat: 'conduite' },
];

const DRONE: ControlSpec[] = [
  ...systemRow('drone'),
  ...commsRow('drone'),
  { key: 'up', layout: 'drone', button: 'jump', label: 'Monter', icon: 'up', shape: 'round', side: 'right', x: 24, anchor: 'bottom', y: 112, w: 68, h: 68 },
  { key: 'down', layout: 'drone', button: 'crouch', label: 'Descendre', icon: 'down', shape: 'round', side: 'right', x: 24, anchor: 'bottom', y: 34, w: 68, h: 68 },
  { key: 'primary', layout: 'drone', button: 'primary', label: 'Action', icon: 'action', shape: 'round', side: 'right', x: 104, anchor: 'bottom', y: 34, w: 78, h: 78, lookDrag: true, accent: true },
  { key: 'zoomin', layout: 'drone', button: 'zoom_in', label: 'Zoom +', icon: 'zoomin', shape: 'round', side: 'right', x: 104, anchor: 'bottom', y: 124, w: 56, h: 56 },
  { key: 'zoomout', layout: 'drone', button: 'zoom_out', label: 'Zoom −', icon: 'zoomout', shape: 'round', side: 'right', x: 170, anchor: 'bottom', y: 124, w: 56, h: 56 },
  { key: 'quit', layout: 'drone', button: 'interact', label: 'Quitter le drone', icon: 'exit', shape: 'pill', side: 'right', x: 24, anchor: 'bottom', y: 198, w: 150, h: 46, contextual: true },
];

export const CONTROLS: readonly ControlSpec[] = [...PIED, ...VEHICULE, ...DRONE];

/** Place occupée à bord (disposition véhicule) : décide quelles commandes de la disposition sont utiles. */
export type TouchSeat = 'conducteur' | 'passager' | 'tireur';

export interface TouchSeatInfo {
  seat: TouchSeat;
  /** La place sert une arme (tourelle autre qu'une caméra) : bouton « Action ». */
  armed: boolean;
  /** Le véhicule a une sirène. */
  siren: boolean;
  /** Le véhicule a des gyrophares. */
  beacons: boolean;
}

/** Forme minimale d'un véhicule lue ici (aucune dépendance au reste du contrat). */
export interface SeatVehicleLike {
  def: {
    seats?: readonly { role: string }[];
    turrets?: readonly { kind: string }[];
    hasSiren?: boolean;
    hasBeacons?: boolean;
  };
}

/**
 * Place du joueur à bord, pour la surcouche : le conducteur a volant, pédales et avertisseurs ; le passager
 * (équipier transporté dans la colonne) ne conduit rien ; le tireur ne garde que le tir. Comme la simulation
 * (sim/people/player.ts), le conducteur d'un engin armé sert aussi l'arme. Sans description des places : conducteur.
 */
export function touchSeatInfo(v: SeatVehicleLike, seatIndex: number): TouchSeatInfo {
  const seats = v.def.seats;
  const role = seats && seatIndex >= 0 && seatIndex < seats.length ? seats[seatIndex]!.role : seats && seats.length > 0 ? 'passenger' : 'driver';
  const turrets = v.def.turrets ?? [];
  let armedTurret = false;
  for (let i = 0; i < turrets.length; i++) if (turrets[i]!.kind !== 'camera') armedTurret = true;
  const seat: TouchSeat = role === 'driver' ? 'conducteur' : role === 'gunner' ? 'tireur' : 'passager';
  const armed = seat === 'conducteur' ? armedTurret : seat === 'tireur' ? turrets.length > 0 : false;
  return { seat, armed, siren: v.def.hasSiren !== false, beacons: v.def.hasBeacons !== false };
}

/** Barre d'objets (à pied) : bande centrée en bas, entre le joystick et les boutons de droite. */
export const ITEM_BAR = { left: 186, right: 196, bottom: 8, height: 52, slot: 46, gap: 5, max: 9 } as const;

/** Libellé affiché par un bouton tactile dans une disposition donnée ('' s'il n'y figure pas). */
export function touchLabel(button: Button, layout: GameLayout): string {
  for (let i = 0; i < CONTROLS.length; i++) {
    const c = CONTROLS[i]!;
    if (c.layout === layout && c.button === button) return c.label;
  }
  if (button === 'sprint' && layout === 'pied') return 'Joystick à fond';
  if (/^slot[1-9]$/.test(button) && layout === 'pied') return 'Barre d’objets';
  // boutons absents de la disposition courante : on cherche dans les autres
  for (let i = 0; i < CONTROLS.length; i++) {
    const c = CONTROLS[i]!;
    if (c.button === button) return c.label;
  }
  return '';
}

/** Rectangle occupé par une commande (pixels, origine en haut à gauche) — sert à vérifier les chevauchements. */
export function controlRect(c: ControlSpec, width: number, height: number, scale: number): { x0: number; y0: number; x1: number; y1: number } {
  const w = c.w * scale;
  const h = c.h * scale;
  const x0 = c.side === 'left' ? c.x * scale : width - c.x * scale - w;
  const y0 = c.anchor === 'top' ? c.y * scale : height - c.y * scale - h;
  return { x0, y0, x1: x0 + w, y1: y0 + h };
}
