/* =====================================================================================
 * Retour vidéo du drone — logique sans DOM ni WebGL (testée en Node) :
 *   choix des appareils  drones de police en vol, ordre stable pour passer de l'un à l'autre ;
 *   point visé           zone la plus dense de la foule autour du point survolé (grille de cellules) ;
 *   pose de la caméra    nacelle sous l'appareil, inclinée vers le point visé (35° à 90° sous l'horizon) ;
 *   habillage            estimation arrondie de l'effectif dans le champ, taille de la fenêtre selon l'écran.
 * Conventions du jeu : cap `heading` en radians, avant = (sin cap, cos cap) ; +X à l'est, −Z au nord.
 * ===================================================================================== */

import type { Vehicle } from '@/core/contracts';

/**
 * Inclinaison minimale de la caméra sous l'horizon (rad). Plus rasant, on ne voit plus que des toits et des façades :
 * les rues de Paris (15 à 30 m de large, immeubles de 20 m) ne se voient d'un drone à 60 m qu'en plongée franche.
 * Au-delà, le centre de l'image se rapproche de l'appareil ; les repères de détection montrent la foule cachée.
 */
export const MIN_PITCH = (40 * Math.PI) / 180;
/** Inclinaison sans point visé (rad) : regard oblique vers l'avant de l'appareil, comme un drone en patrouille. */
export const DEFAULT_PITCH = (65 * Math.PI) / 180;
/** La caméra pend sous le corps de l'appareil (m). */
export const GIMBAL_DROP = 0.35;

/** Drone de police utilisable pour le retour vidéo : appareil volant de police, en état, pas endormi. */
export function isFeedDrone(v: Vehicle): boolean {
  return v.kind === 'drone' && v.def.flying && v.faction === 'police' && !v.dormant && v.state !== 'wrecked' && v.state !== 'burnt';
}

/** Identifiants des drones utilisables, triés (ordre stable pour le passage de l'un à l'autre). */
export function feedDroneIds(list: readonly Vehicle[], out: number[] = []): number[] {
  out.length = 0;
  for (let i = 0; i < list.length; i++) if (isFeedDrone(list[i]!)) out.push(list[i]!.id);
  out.sort((a, b) => a - b);
  return out;
}

/**
 * Drone à montrer : `wanted` s'il est dans la liste, sinon `current` s'il y est encore (l'appareil suivi reste le
 * même tant qu'il vole), sinon le premier. 0 si aucun.
 */
export function chooseDrone(ids: readonly number[], current: number, wanted = 0): number {
  if (wanted !== 0 && ids.indexOf(wanted) >= 0) return wanted;
  if (current !== 0 && ids.indexOf(current) >= 0) return current;
  return ids.length > 0 ? ids[0]! : 0;
}

/** Drone suivant (step = 1) ou précédent (step = −1) dans la liste, en boucle. */
export function cycleDrone(ids: readonly number[], current: number, step = 1): number {
  if (ids.length === 0) return 0;
  const i = ids.indexOf(current);
  if (i < 0) return ids[0]!;
  const n = ids.length;
  return ids[(((i + step) % n) + n) % n]!;
}

// ───────────────────────────── point visé : zone la plus dense ─────────────────────────────

export interface Spot {
  x: number;
  z: number;
  /** Personnes dans le bloc de 3 × 3 cellules retenu. */
  count: number;
}

/**
 * Zone la plus dense d'un nuage de points (coordonnées entrelacées x0, z0, x1, z1…, `n` points) : les points sont
 * rangés dans des cellules de `cell` mètres ; le bloc de 3 × 3 cellules le plus peuplé l'emporte, et le point
 * retourné est le barycentre des points de ce bloc. À égalité, le bloc le plus proche de (refX, refZ). `falloff` (m)
 * favorise les blocs proches du point de référence (poids 1 / (1 + (d / falloff)²)) : la caméra regarde la foule
 * sous l'appareil plutôt qu'un attroupement un peu plus gros mais lointain, caché par les immeubles. false si aucun point.
 */
export function densestSpot(
  xz: ArrayLike<number>, n: number, cell: number, refX: number, refZ: number, out: Spot, falloff = Infinity,
): boolean {
  if (n <= 0) return false;
  const size = cell > 0.5 ? cell : 0.5;
  // emprise de la grille
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = xz[i * 2]!;
    const z = xz[i * 2 + 1]!;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  const cols = Math.min(256, Math.floor((maxX - minX) / size) + 1);
  const rows = Math.min(256, Math.floor((maxZ - minZ) / size) + 1);
  const grid = new Int32Array(cols * rows);
  const cellOf = (x: number, z: number): number => {
    let c = Math.floor((x - minX) / size);
    let r = Math.floor((z - minZ) / size);
    if (c >= cols) c = cols - 1;
    if (r >= rows) r = rows - 1;
    return r * cols + c;
  };
  for (let i = 0; i < n; i++) grid[cellOf(xz[i * 2]!, xz[i * 2 + 1]!)]!++;
  let best = -1;
  let bestC = 0;
  let bestR = 0;
  let bestD = Infinity;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r * cols + c] === 0) continue;
      let sum = 0;
      for (let dr = -1; dr <= 1; dr++) {
        const rr = r + dr;
        if (rr < 0 || rr >= rows) continue;
        for (let dc = -1; dc <= 1; dc++) {
          const cc = c + dc;
          if (cc >= 0 && cc < cols) sum += grid[rr * cols + cc]!;
        }
      }
      const cx = minX + (c + 0.5) * size;
      const cz = minZ + (r + 0.5) * size;
      const d = (cx - refX) * (cx - refX) + (cz - refZ) * (cz - refZ);
      const score = falloff < Infinity ? sum / (1 + d / (falloff * falloff)) : sum;
      if (score > best || (score === best && d < bestD)) {
        best = score;
        bestC = c;
        bestR = r;
        bestD = d;
      }
    }
  }
  // barycentre des points du bloc retenu
  let sx = 0;
  let sz = 0;
  let m = 0;
  for (let i = 0; i < n; i++) {
    const x = xz[i * 2]!;
    const z = xz[i * 2 + 1]!;
    const k = cellOf(x, z);
    const c = k % cols;
    const r = (k - c) / cols;
    if (Math.abs(c - bestC) <= 1 && Math.abs(r - bestR) <= 1) {
      sx += x;
      sz += z;
      m++;
    }
  }
  out.x = sx / m;
  out.z = sz / m;
  out.count = m;
  return true;
}

// ───────────────────────────── pose de la caméra ─────────────────────────────

export interface PoseInput {
  /** Position de l'appareil et hauteur du sol sous lui. */
  x: number;
  y: number;
  z: number;
  ground: number;
  /** Cap de l'appareil (rad). */
  heading: number;
  /** Point visé au sol (hasTarget false : regard oblique vers l'avant). */
  hasTarget: boolean;
  tx: number;
  tz: number;
  tGround: number;
}

export interface Pose {
  /** Position de la caméra. */
  x: number;
  y: number;
  z: number;
  /** Cap du regard (rad, convention du jeu) et inclinaison sous l'horizon (rad, MIN_PITCH … π/2). */
  yaw: number;
  pitch: number;
  /** Point du sol au centre de l'image et distance de la caméra à ce point (m). */
  lookX: number;
  lookY: number;
  lookZ: number;
  distance: number;
  /** Hauteur de la caméra au-dessus du sol visé (m). */
  height: number;
}

export function createPose(): Pose {
  return { x: 0, y: 0, z: 0, yaw: 0, pitch: DEFAULT_PITCH, lookX: 0, lookY: 0, lookZ: 0, distance: 0, height: 0 };
}

/**
 * Pose de la nacelle : sous l'appareil, tournée vers le point visé. Trop loin, le point visé ferait regarder presque
 * à l'horizontale : l'inclinaison est bornée à MIN_PITCH (le centre de l'image se rapproche alors de l'appareil).
 * Juste à la verticale du point visé : vue zénithale, cap de l'appareil.
 */
export function dronePose(inp: PoseInput, out: Pose): Pose {
  const cx = inp.x;
  const cy = inp.y - GIMBAL_DROP;
  const cz = inp.z;
  const groundY = inp.hasTarget ? inp.tGround : inp.ground;
  const h = Math.max(1, cy - groundY);
  let yaw = inp.heading;
  let pitch = DEFAULT_PITCH;
  if (inp.hasTarget) {
    const dx = inp.tx - cx;
    const dz = inp.tz - cz;
    const d = Math.hypot(dx, dz);
    if (d < 0.5) pitch = Math.PI / 2;
    else {
      yaw = Math.atan2(dx, dz);
      pitch = Math.atan2(h, d);
    }
  }
  if (pitch < MIN_PITCH) pitch = MIN_PITCH;
  if (pitch > Math.PI / 2) pitch = Math.PI / 2;
  const ground = h / Math.tan(pitch);
  const reach = ground < 1e-6 ? 0 : ground;
  out.x = cx;
  out.y = cy;
  out.z = cz;
  out.yaw = yaw;
  out.pitch = pitch;
  out.lookX = cx + Math.sin(yaw) * reach;
  out.lookY = groundY;
  out.lookZ = cz + Math.cos(yaw) * reach;
  out.distance = Math.hypot(reach, h);
  out.height = h;
  return out;
}

/** Rapproche un angle d'un autre par le plus court chemin (lissage exponentiel, constante de temps tau en s). */
export function dampAngle(current: number, target: number, dt: number, tau: number): number {
  let d = target - current;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  const k = tau > 0 ? 1 - Math.exp(-dt / tau) : 1;
  return current + d * k;
}

/** Lissage exponentiel d'une grandeur (constante de temps tau en s). */
export function damp(current: number, target: number, dt: number, tau: number): number {
  const k = tau > 0 ? 1 - Math.exp(-dt / tau) : 1;
  return current + (target - current) * k;
}

// ───────────────────────────── habillage ─────────────────────────────

/** Estimation arrondie d'un effectif, comme un opérateur la donne : 7, 40, 850, 1 200. */
export function roughCount(n: number): number {
  if (!(n > 0)) return 0;
  if (n < 20) return Math.round(n);
  if (n < 200) return Math.round(n / 10) * 10;
  if (n < 2000) return Math.round(n / 50) * 50;
  return Math.round(n / 100) * 100;
}

/** Libellé de l'effectif dans le champ : « ≈ 850 pers. », « personne » s'il n'y a personne. */
export function crowdLabel(n: number): string {
  const r = roughCount(n);
  if (r === 0) return 'personne';
  const txt = r >= 1000 ? `${Math.floor(r / 1000)} ${String(r % 1000).padStart(3, '0')}` : String(r);
  return `≈ ${txt} pers.`;
}

/** Heure de la journée (heures décimales) au format de l'horodatage vidéo : « 14:01:23 ». */
export function videoClock(hours: number): string {
  let s = Math.floor((((hours % 24) + 24) % 24) * 3600);
  const hh = Math.floor(s / 3600);
  s -= hh * 3600;
  const mm = Math.floor(s / 60);
  const ss = s - mm * 60;
  const two = (v: number): string => (v < 10 ? '0' : '') + v;
  return `${two(hh)}:${two(mm)}:${two(ss)}`;
}

export interface FeedSize {
  width: number;
  height: number;
}

/** Disposition compacte (téléphone, petite fenêtre) : mêmes seuils que le HUD. */
export function compactScreen(width: number, height: number): boolean {
  return height < 520 || width < 1100;
}

/**
 * Taille de la fenêtre vidéo (pixels CSS, format 16:9) : 320 × 180 sur grand écran, 224 × 126 en disposition
 * compacte ; agrandie : 560 × 315 (360 × 203 en compact). Jamais plus de 46 % de la largeur ni 52 % de la hauteur.
 */
export function feedSize(screenW: number, screenH: number, large: boolean): FeedSize {
  const compact = compactScreen(screenW, screenH);
  let w = compact ? (large ? 360 : 224) : (large ? 560 : 320);
  const maxW = Math.max(160, Math.floor(screenW * 0.46));
  const maxH = Math.max(90, Math.floor(screenH * 0.52));
  if (w > maxW) w = maxW;
  if (w * 9 / 16 > maxH) w = Math.floor(maxH * 16 / 9);
  return { width: w, height: Math.round(w * 9 / 16) };
}
