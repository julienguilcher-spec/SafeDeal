/* Logique du tableau de bord — pure (testée sous Node) : conversion des grandeurs du véhicule en positions
 * d'aiguilles, libellés et voyants. Le dessin sur canvas est dans dashboard.ts. */

/** Vitesse affichée (km/h, valeur absolue arrondie). */
export function speedKmh(speed: number): number {
  return Math.round(Math.abs(speed) * 3.6);
}

/** Graduation maximale du compteur : vitesse maximale du véhicule arrondie aux 20 km/h supérieurs, bornée à [60, 260]. */
export function speedoMax(maxSpeed: number): number {
  const top = Math.ceil((maxSpeed * 3.6 * 1.15) / 20) * 20;
  return top < 60 ? 60 : top > 260 ? 260 : top;
}

/**
 * Régime normalisé 0..1 pour le compte-tours. Le contrat ne fixe pas l'unité de Vehicle.rpm : une valeur ≤ 1,5
 * est prise comme déjà normalisée (0 = ralenti, 1 = régime maxi), une valeur plus grande comme des tr/min
 * (zone rouge à `redline`). À rpm nul, moteur en marche, le régime est estimé d'après la vitesse.
 */
export function rpmFraction(rpm: number, speed: number, maxSpeed: number, engineOn: boolean, redline = 6000): number {
  if (!engineOn) return 0;
  let f: number;
  if (rpm > 1.5) f = rpm / redline;
  else if (rpm > 0) f = 0.14 + rpm * 0.86;
  else {
    // estimation : quatre rapports qui se partagent la plage de vitesse
    const u = maxSpeed > 0 ? Math.min(1, Math.abs(speed) / maxSpeed) : 0;
    const g = Math.min(3, Math.floor(u * 4));
    const inGear = u * 4 - g;
    f = 0.14 + (g === 0 ? inGear * 0.7 : 0.3 + inGear * 0.45);
  }
  return f < 0 ? 0 : f > 1 ? 1 : f;
}

/** Angle d'aiguille (rad, sens horaire depuis la butée basse à −225°… jusqu'à +45°) pour une fraction 0..1. */
export function needleAngle(fraction: number): number {
  const f = fraction < 0 ? 0 : fraction > 1 ? 1 : fraction;
  return (-225 + 270 * f) * (Math.PI / 180);
}

/** Libellé du rapport engagé : « R » en marche arrière, « N » à l'arrêt moteur ou au point mort, sinon le numéro. */
export function gearLabel(gear: number, speed: number, engineOn: boolean): string {
  if (!engineOn) return 'N';
  if (gear < 0 || speed < -0.25) return 'R';
  if (gear === 0) return Math.abs(speed) < 0.3 ? 'N' : 'D';
  return String(Math.min(9, Math.round(gear)));
}

/** Voyants du tableau de bord. */
export interface DashFlags {
  headlights: boolean;
  beacons: boolean;
  siren: boolean;
  handbrake: boolean;
  left: boolean;
  right: boolean;
  engineWarning: boolean;
  engineOn: boolean;
}

/**
 * Signature de l'affichage : deux affichages de même signature sont identiques, ce qui évite de redessiner le
 * canvas quand rien n'a bougé. Vitesse au km/h, régime par pas de 2 %.
 */
export function dashSignature(kmh: number, rpmF: number, gear: string, f: DashFlags, night: boolean): number {
  let bits = 0;
  if (f.headlights) bits |= 1;
  if (f.beacons) bits |= 2;
  if (f.siren) bits |= 4;
  if (f.handbrake) bits |= 8;
  if (f.left) bits |= 16;
  if (f.right) bits |= 32;
  if (f.engineWarning) bits |= 64;
  if (f.engineOn) bits |= 128;
  if (night) bits |= 256;
  const g = gear.charCodeAt(0) & 63;
  return kmh + 512 * Math.round(rpmF * 50) + 512 * 64 * g + 512 * 64 * 64 * bits;
}
