/* API publique du rendu des véhicules. Les autres modules n'importent que des TYPES depuis ce fichier et
 * obtiennent le service par ctx.service<VehiclesRenderApi>('vehiclesRender').
 *
 * AIDE-MÉMOIRE POUR LES AUTRES MODULES
 *
 * Champs de Vehicle lus à chaque image : x, y, z, heading, pitch, roll, speed, steerAngle, rpm, gear, health,
 * state, burning, beacons, siren, headlights, indicator, braking, turretYaw, turretPitch, turretAmmo, color,
 * plate, engineOn, cmd.handbrake, dormant, def (dimensions, empattement, sièges, tourelles), kind.
 *
 * Conventions retenues (à garder cohérentes côté simulation) :
 *   - Vehicle.y = altitude du SOL sous le véhicule (roues posées à y) ; pour un engin volant, altitude des patins.
 *   - pitch > 0 = nez levé ; roll > 0 = penché vers la droite (mêmes conventions que le rendu des personnages).
 *   - steerAngle > 0 = roues braquées à droite ; turretYaw > 0 = tourelle tournée vers la droite ;
 *     turretPitch > 0 = canon levé.
 *   - speed > 0 en marche avant : les roues tournent de speed / rayon.
 *   - SeatDef.y = hauteur de l'assise ; l'œil d'un occupant est 0,72 m au-dessus (seatEye()).
 *   - Le modèle est bâti aux cotes de Vehicle.def (longueur, largeur hors rétroviseurs, hauteur) ; la caisse est
 *     centrée sur (x, z), essieu avant à environ 43 % du porte-à-faux total derrière le pare-chocs.
 *
 * Portes : le contrat ne décrit pas l'état des portes. Le rendu ouvre brièvement la porte la plus proche du
 * siège sur 'vehicle:entered' et 'vehicle:exited' ; setDoor() permet de tenir une porte ouverte (débarquement).
 */

import type { EntityId, Vec3, Vehicle } from '@/core/contracts';

/** Clé du service publié par le module. */
export const VEHICLES_RENDER_KEY = 'vehiclesRender';

/** Clé du service FACULTATIF d'éclairage dynamique consommé par le module (voir RenderLightsApi). */
export const RENDER_LIGHTS_KEY = 'render.lights';

/**
 * Service facultatif attendu sous la clé 'render.lights' (fourni par le rendu de base s'il le souhaite) :
 * lumières ponctuelles éphémères, redemandées à chaque image. Le module y envoie les éclairs bleus des
 * gyrophares les plus proches et la lueur des véhicules en feu, dans la limite d'un budget par qualité.
 * S'il est absent, les feux restent de simples surfaces émissives accompagnées de halos.
 */
export interface RenderLightsApi {
  /** Lumière ponctuelle valable pour l'image courante. Couleur 0xRRGGBB, intensité en candelas, portée en mètres. */
  pulse(x: number, y: number, z: number, color: number, intensity: number, radius: number): void;
}

export interface VehiclesRenderStats {
  /** Véhicules affichés en détail, en lointain, et non affichés (trop loin ou hors champ). */
  near: number;
  far: number;
  hidden: number;
  /** Appels de dessin du module pour l'image (modèles + effets + habitacle), hors passe d'ombres. */
  drawCalls: number;
  triangles: number;
  /** Quads lumineux (éclats, halos, flammes). */
  fx: number;
  /** Temps CPU de frame() (ms) et moyenne glissante. */
  cpuMs: number;
  cpuMsAvg: number;
  /** Modèles construits (types × niveaux de détail). */
  models: number;
}

export interface VehiclesRenderApi {
  readonly stats: VehiclesRenderStats;
  /** Tient une porte ouverte (true) ou la relâche (false). Indices : 0 avant gauche, 1 avant droite, 2 arrière, 3 latérale droite. */
  setDoor(vehicleId: EntityId, door: number, open: boolean): void;
  /** Ouvre une porte pendant `seconds` puis la referme. */
  pulseDoor(vehicleId: EntityId, door: number, seconds?: number): void;
  /** Point de vue d'un occupant (monde) : à utiliser pour la caméra intérieure. Retourne false si le siège n'existe pas. */
  seatEye(v: Vehicle, seat: number, out: Vec3): boolean;
  /** Position monde de la bouche du canon d'une tourelle et direction de tir (unitaire). */
  turretMuzzle(v: Vehicle, turret: number, outPos: Vec3, outDir: Vec3): boolean;
  /** Le module dessine lui-même flammes et fumée des véhicules en feu (vrai par défaut) ; à couper si le module d'effets s'en charge. */
  ownFire: boolean;
  /** Force la reconstruction des modèles (changement de définitions). */
  invalidate(): void;
}
