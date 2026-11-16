/* =====================================================================================
 * Services étendus du module « rendu de base ». Les autres modules les importent en
 * `import type` et les obtiennent par ctx.service<…>(clé) — après provide().
 *
 *   ctx.service<RenderLightsApi>('render.lights')     réserve de lumières dynamiques
 *   ctx.service<RenderUniformsApi>('render.uniforms') uniformes partagés (temps, sol mouillé, vent…)
 *   ctx.service<RenderCameraApi>('render.camera')     rig de caméra (vue tactique, vol libre, options)
 *   ctx.service<RenderBaseApi>('render.base')         mesures, ciel, réglages de rendu
 * ===================================================================================== */

import type * as THREE from 'three';
import type { CameraMode, QualityLevel } from '@/core/contracts';

export const RENDER_LIGHTS_SERVICE = 'render.lights';
export const RENDER_UNIFORMS_SERVICE = 'render.uniforms';
export const RENDER_CAMERA_SERVICE = 'render.camera';
export const RENDER_BASE_SERVICE = 'render.base';
/** ctx.service<RenderClearAirApi>('render.clearAir') : voile d'air clair des grands repères (voir clearAir.ts). */
export const RENDER_CLEAR_AIR_SERVICE = 'render.clearAir';
export type { RenderClearAirApi } from './clearAir';

// ───────────────────────────── lumières dynamiques ─────────────────────────────

/**
 * Lumière dynamique « virtuelle » : le module qui la demande en règle les champs quand il veut
 * (position, couleur, intensité…). À chaque image, la réserve attribue ses quelques vraies
 * lumières aux plus importantes pour la caméra, avec un fondu : on peut donc en créer beaucoup
 * plus que le budget (un feu par poubelle, un gyrophare par véhicule).
 * Une lumière vit jusqu'à son release() : la réserve ne la reprend jamais d'elle-même, pas même
 * entre deux sessions — à son propriétaire de la rendre (dans son reset() ou quand l'objet disparaît).
 */
export interface DynamicLight {
  /** Position (repère monde, m). */
  x: number;
  y: number;
  z: number;
  /** Couleur 0xRRGGBB. */
  color: number;
  /**
   * Intensité en candelas (convention Three.js : éclairement = intensité / distance²). Ordres de
   * grandeur accordés à l'exposition du jeu : gyrophare 15, feu de poubelle 45, candélabre 80,
   * véhicule en feu 150, flash d'explosion 500, lampe torche ou phare (projecteur) 150.
   */
  intensity: number;
  /** Portée utile (m) : au-delà, la lumière n'éclaire plus. */
  range: number;
  /** Bonus d'importance (0 = normal ; 1 = à garder allumée en priorité). */
  priority: number;
  /** false : éteinte sans être rendue à la réserve. */
  enabled: boolean;
  /** Vacillement 0..1 (feu). 0 = lumière stable. */
  flicker: number;
  /** Projecteurs seulement : direction du faisceau (pas forcément unitaire), demi-angle (rad) et pénombre 0..1. */
  dirX: number;
  dirY: number;
  dirZ: number;
  angle: number;
  penumbra: number;
  readonly kind: 'point' | 'spot';
  /** Part de l'intensité réellement rendue en ce moment (0 = non retenue, 1 = pleinement allumée). */
  readonly shown: number;
  /** Rend la lumière à la réserve. L'objet ne doit plus être utilisé ensuite. */
  release(): void;
}

export type DynamicLightInit = Partial<Pick<DynamicLight,
  'x' | 'y' | 'z' | 'color' | 'intensity' | 'range' | 'priority' | 'enabled' | 'flicker' | 'dirX' | 'dirY' | 'dirZ' | 'angle' | 'penumbra'>>;

export interface RenderLightsApi {
  /** Nombre de vraies lumières allumables en même temps selon la qualité. */
  readonly pointBudget: number;
  readonly spotBudget: number;
  /** Lumières virtuelles actuellement enregistrées. */
  readonly count: number;
  /** Crée une lumière ponctuelle (incendie, gyrophare, candélabre proche). */
  point(init?: DynamicLightInit): DynamicLight;
  /** Crée un projecteur (phares, lampe torche, projecteur de drone). */
  spot(init?: DynamicLightInit): DynamicLight;
  /** Éclat bref qui s'éteint tout seul (explosion, flash de grenade, tir). */
  flash(x: number, y: number, z: number, color: number, intensity: number, range: number, seconds: number): void;
  /**
   * Lumière ponctuelle « à l'image » : valable pour l'image en cours seulement, à redemander à chaque
   * frame() tant qu'elle doit rester allumée (éclat de gyrophare, lueur d'un véhicule en feu). Pas de
   * fondu ; elle concourt pour le budget comme les autres. À appeler depuis frame(), avant le rendu.
   */
  pulse(x: number, y: number, z: number, color: number, intensity: number, radius: number): void;
}

// ───────────────────────────── uniformes partagés ─────────────────────────────

/**
 * Uniformes mis à jour à chaque image par le rendu de base. Un matériau d'un autre module peut les
 * référencer tels quels dans onBeforeCompile : `shader.uniforms.uWetness = api.uniforms.uWetness`.
 */
export interface SharedUniforms {
  /** Temps écoulé (s), remis à zéro toutes les heures pour garder de la précision. */
  uTime: { value: number };
  /** Sol mouillé 0..1 (EnvState.wetness, lissé). */
  uWetness: { value: number };
  /** Intensité de la pluie 0..1. */
  uRain: { value: number };
  /** Vent au sol (m/s) : x, z dans les composantes x et z ; y = vitesse. */
  uWind: { value: THREE.Vector3 };
  /** Direction vers l'astre qui éclaire (soleil ou lune), unitaire. */
  uSunDir: { value: THREE.Vector3 };
  /** Couleur × intensité de la lumière directionnelle. */
  uSunColor: { value: THREE.Color };
  /** Lumière du jour 0..1 (EnvState.daylight). */
  uDaylight: { value: number };
  /** Niveau de nuit 0..1 lissé (0 = jour, 1 = nuit installée) : pour les fenêtres, enseignes, phares. */
  uNight: { value: number };
  /** Éclairage public 0..1 (allumage progressif des candélabres). */
  uStreetLights: { value: number };
  /** Couleur du brouillard atmosphérique (celle de scene.fog). */
  uFogColor: { value: THREE.Color };
  /** Éclat des éclairs 0..1. */
  uLightning: { value: number };
  /** Couleur moyenne du ciel, linéaire et avant tone mapping : faux reflets du ciel sur les surfaces mouillées, les vitres. */
  uSkyColor: { value: THREE.Color };
}

export interface WetOptions {
  /** Assombrissement maximal de la couleur quand le sol est détrempé (0..1, défaut 0,4). */
  darken?: number;
  /** Rugosité visée sur sol détrempé (défaut 0,18). */
  roughness?: number;
  /** Ne mouiller que les surfaces tournées vers le ciel (défaut true). */
  upOnly?: boolean;
  /** Force du reflet du ciel à incidence rasante (défaut 0,45 ; 0 = aucun). */
  sheen?: number;
}

export interface RenderUniformsApi {
  readonly uniforms: SharedUniforms;
  /** Valeurs lisibles sans passer par les uniformes. */
  readonly wetness: number;
  readonly night: number;
  readonly streetLights: number;
  /**
   * Donne l'aspect mouillé à un matériau standard : plus sombre et plus brillant à mesure que
   * EnvState.wetness monte. Greffe onBeforeCompile (en préservant un éventuel greffon existant).
   */
  applyWetness(material: THREE.MeshStandardMaterial, options?: WetOptions): void;
}

// ───────────────────────────── caméra ─────────────────────────────

export interface TacticalView {
  /** Point du sol au centre de la vue. */
  x: number;
  z: number;
  /** Hauteur de la caméra au-dessus du sol (m) : 150 m / (PlayerState.zoom × zoom), bornée de 30 à 700 m. */
  readonly height: number;
  /** Zoom propre à la vue tactique (0,2 – 5 ; 1 par défaut), multiplié par PlayerState.zoom. */
  zoom: number;
  /**
   * Le rig pilote lui-même la vue avec ctx.input (défaut true) : axes de déplacement pour la déplacer
   * (plus vite avec « sprint »), boutons zoom_in / zoom_out pour l'altitude. Inactif quand un écran
   * modal est ouvert. Le module qui passe en vue tactique doit couper les commandes du personnage
   * (PlayerState.controlEnabled = false), sinon celui-ci marche pendant qu'on déplace la vue.
   */
  inputPan: boolean;
  /** Recentre la vue sur un point. */
  setCenter(x: number, z: number): void;
  /** Déplace la vue (m, repère monde). */
  pan(dx: number, dz: number): void;
}

export interface RenderCameraApi {
  /** Mode effectivement appliqué à cette image. */
  readonly mode: CameraMode;
  readonly tactical: TacticalView;
  /** Position du vol libre (mode 'free'). */
  readonly free: { x: number; y: number; z: number };
  /** Place la caméra de vol libre (sinon elle part de la position courante de la caméra). */
  placeFree(x: number, y: number, z: number): void;
  /** En véhicule, le rig fait tourner PlayerState.camYaw avec le véhicule (défaut true). */
  vehicleYawFollow: boolean;
  /** En vue extérieure de véhicule, la caméra revient derrière le véhicule quand on ne regarde plus autour (défaut true). */
  vehicleAutoCenter: boolean;
  /** Balancement de la tête à la marche en vue subjective, 0..1 (défaut 1). */
  headBob: number;
  /** En vue subjective, appliquer la réduction de champ du masque / de la visière ('player.control'.fovScale ; défaut true). */
  gearFov: boolean;
  /** Distance réelle caméra–pivot en vue à la troisième personne (après collision). */
  readonly tpsDistance: number;
  /** Coupe franche : annule les lissages (téléportation, changement de personnage). */
  cut(): void;
  /**
   * Projette un point du monde à l'écran. Écrit dans `out` des coordonnées normalisées (-1..1) et
   * retourne false si le point est derrière la caméra.
   */
  project(x: number, y: number, z: number, out: { x: number; y: number }): boolean;
}

// ───────────────────────────── diagnostic ─────────────────────────────

export interface RenderStats {
  /** Appels de dessin et triangles de la dernière image (ombres comprises). */
  drawCalls: number;
  triangles: number;
  /** Temps CPU du module pour préparer l'image (caméra, ciel, lumières…) et pour renderer.render (ms, lissés). */
  prepareMs: number;
  renderMs: number;
  /** Taille du tampon de rendu (pixels) et densité de pixels effective. */
  width: number;
  height: number;
  pixelRatio: number;
  /** Lumières dynamiques : demandées / allumées. */
  lightsWanted: number;
  lightsLit: number;
  /** Traits de pluie dessinés. */
  rainStreaks: number;
}

export interface RenderBaseApi {
  readonly stats: RenderStats;
  readonly quality: QualityLevel;
  /** Les ombres portées sont actives. */
  readonly shadows: boolean;
  /** Visibilité météorologique courante (m) : distance où le brouillard masque presque tout. */
  readonly visibility: number;
  /** Exposition courante du tone mapping. */
  readonly exposure: number;
  /** Lumière directionnelle (soleil ou lune) et lumière d'hémisphère, pour qui veut s'y accorder. */
  readonly sun: THREE.Light;
  readonly hemisphere: THREE.HemisphereLight;
  /** Suspend le rendu (écran de chargement lourd, onglet masqué). */
  paused: boolean;
  /**
   * Recale d'un coup les grandeurs lissées (allumage des candélabres, sol mouillé, niveau de nuit) sur
   * l'environnement courant : à appeler après un saut d'heure ou de météo (éditeur, banc d'essai).
   */
  snap(): void;
  /** Efface d'un coup tous les effets d'écran (changement de personnage, retour au menu). */
  clearScreenEffects(): void;
  /** Force un rendu immédiat (capture d'écran, miniature). */
  renderNow(): void;
}
