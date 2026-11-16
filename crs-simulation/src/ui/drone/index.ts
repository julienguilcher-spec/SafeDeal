/* =====================================================================================
 * RETOUR VIDÉO DU DRONE — sous-module d'interface (agrégé par src/ui/index.ts).
 *
 * Demande du commanditaire : « quand je clique sur le drone, je veux voir d'en haut où sont les manifestants,
 * pour réagir le plus efficacement possible ; une petite fenêtre à gauche avec l'écran du drone, comme si
 * j'avais le retour caméra ».
 *
 * Le système (ordre VIEW − 1 : la pose de la caméra est posée AVANT que personnages et véhicules ne choisissent
 * ce qu'ils dessinent) publie ctx.service<DroneFeedApi>('ui.drone') et tient une fenêtre incrustée à gauche :
 *   - image de la nacelle du drone de police choisi (vue annexe du rendu de base, 'render.aux', 8 à 15 images/s) :
 *     sous l'appareil, inclinée vers la zone la plus dense de la foule autour du point survolé (35° à 90° sous
 *     l'horizon), lissée ; sans foule, regard oblique vers l'avant de l'appareil ;
 *   - habillage : REC, indicatif de l'équipe, altitude, cap, zoom, heure, effectif estimé dans le champ ;
 *   - détection (activée par défaut) : un repère sur chaque manifestant dans le champ, posé à chaque nouvelle image
 *     avec la pose de caméra qui l'a produite — à 60 m une personne ne fait qu'un ou deux pixels ;
 *   - ouverture : bouton « Drone » des actions rapides, bouton « Vue drone » de la carte tactique, sélection de
 *     l'équipe drone sur la carte tactique, touche O ; fermeture : bouton ✕ ou touche O ;
 *   - sans souris : Maj + O passe de la petite fenêtre à l'agrandie puis au plein écran, Alt + O change le zoom
 *     optique (×1, ×2, ×4, ×8 : le champ se resserre, l'image garde sa définition) ;
 *   - netteté : le canevas a la définition de l'écran (taille CSS × devicePixelRatio, plafonnée par un budget de
 *     pixels qui baisse avec la cadence quand l'image principale ralentit).
 * Le placement de l'appareil reste l'affaire du commandement (src/sim/police/command/drone.ts : au-dessus du point
 * chaud, de la tête du cortège ou du point ordonné) : ce module ne pilote rien, il oriente la caméra.
 * Sans WebGL, sans DOM (tests Node) : le service répond, rien n'est affiché.
 * ===================================================================================== */

import * as THREE from 'three';
import type { GameContext, GameSystem, ModuleFactory, Person, ScreenId, Vehicle } from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { UiKit } from '@/core/extensions';
import { compassBearing } from '@/core/math';
import type { RenderAuxApi } from '@/render/base/api';
import { cardinal8 } from '../core/format';
import { isPoliceRole } from '../maps/visibility';
import { DRONE_FEED_SERVICE } from './api';
import type { DroneFeedApi } from './api';
import {
  GIMBAL_DROP, chooseDrone, compactScreen, createPose, crowdLabel, cycleDrone, damp, dampAngle, densestSpot, dronePose, feedBudget, feedBufferSize,
  feedDroneIds, feedSize, feedSlowLevel, nextFeedMode, nextZoom, videoClock, zoomFov,
} from './logic';
import type { FeedMode, PoseInput, Spot } from './logic';
import { FeedPanel } from './panel';

export type { DroneFeedApi } from './api';
export { DRONE_FEED_SERVICE } from './api';
export * from './logic';

export const DRONE_FEED_SYSTEM_ID = 'ui:drone';
/** Touche d'ouverture (code physique : même place en AZERTY). */
export const DRONE_FEED_KEY = 'KeyO';

/** Écrans par-dessus lesquels la fenêtre reste visible (null : HUD seul). */
const OVER_SCREENS: ReadonlySet<ScreenId | null> = new Set<ScreenId | null>([null, 'carte_tactique', 'roue_ordres', 'radio']);
/** Champ vertical de la caméra au zoom ×1 (degrés). */
const BASE_FOV = 50;
/** Rayon de recherche de la foule autour du point survolé (m). */
const SEARCH_MIN = 60;
const SEARCH_MAX = 150;
/** Durée (s) pendant laquelle la visée est gardée quand la foule visée passe derrière un immeuble. */
const TARGET_HOLD = 6;
/** Plafond de densité de pixels du canevas vidéo (devicePixelRatio) selon la qualité. */
const PIXEL_RATIO_CAP: Readonly<Record<string, number>> = { bas: 1, moyen: 2, haut: 2, ultra: 2 };

interface VehiclesExtLike {
  droneOf(personId: number): Vehicle | null;
  flightStatus(v: Vehicle): Readonly<{ mode: string; altitude: number; battery: number; pilotId: number }> | null;
}

const isProtester = (p: Person): boolean => p.faction === 'protest' && !p.dormant && p.health > 0;

export class DroneFeedSystem implements GameSystem, DroneFeedApi {
  readonly id = DRONE_FEED_SYSTEM_ID;
  readonly order = SystemOrder.VIEW - 1;

  open = false;
  /** Format de la fenêtre : petite, agrandie, plein écran. */
  mode: FeedMode = 'small';
  droneId = 0;
  /** Effectif de manifestants estimé dans le champ (dernier compte). */
  inView = 0;
  zoom = 1;
  /** Repères de détection sur les manifestants (éteints par défaut : ils se voyaient à travers les toits). */
  detect = false;

  private ctx: GameContext | null = null;
  private panel: FeedPanel | null = null;
  private ids: number[] = [];
  private idsAt = -1;
  private wanted = 0;
  private readonly pose = createPose();
  private readonly inp: PoseInput = { x: 0, y: 0, z: 0, ground: 0, heading: 0, hasTarget: false, tx: 0, tz: 0, tGround: 0 };
  private readonly spot: Spot = { x: 0, z: 0, count: 0 };
  private readonly people: Person[] = [];
  private xz = new Float64Array(512);
  private hasTarget = false;
  private tx = 0;
  private tz = 0;
  private rawX = 0;
  private rawZ = 0;
  private yaw = 0;
  private pitch = 0;
  private snap = true;
  private targetAt = 0;
  private foundAt = -1e9;
  private countAt = 0;
  private infoAt = 0;
  private layoutAt = 0;
  private time = 0;
  private lostSince = -1;
  private seenFrames = -1;
  private lastScreen: ScreenId | null | undefined = undefined;
  /** Durée moyenne d'une image du jeu (ms, lissée) et palier de ralentissement (0 à 2) : budget du retour vidéo. */
  frameMs = 0;
  private slow = 0;
  private readonly frustum = new THREE.Frustum();
  private readonly m4 = new THREE.Matrix4();
  private readonly v3 = new THREE.Vector3();
  private readonly unsub: (() => void)[] = [];
  private onKey: ((e: KeyboardEvent) => void) | null = null;

  provide(ctx: GameContext): void {
    this.ctx = ctx;
    ctx.provide<DroneFeedApi>(DRONE_FEED_SERVICE, this);
  }

  init(ctx: GameContext): void {
    this.ctx = ctx;
    this.unsub.push(ctx.events.on('session:started', () => this.resetState()));
    if (ctx.headless || typeof document === 'undefined') return;
    const kit = ctx.service<UiKit>(EXT.uiKit);
    // dans la racine de l'interface, à côté de ses calques (HUD 20, écrans 40, notifications 60)
    const base = kit && kit.root ? kit.root : document.body;
    const host = (base.querySelector(':scope > .crs-ui') as HTMLElement | null) ?? base;
    try {
      this.panel = new FeedPanel(host, {
        next: () => this.cycle(),
        detect: () => this.toggleDetect(),
        zoom: () => this.cycleZoom(),
        enlarge: () => this.cycleMode(),
        close: () => this.hide(),
      });
    } catch (err) {
      this.panel = null;
      console.error('[drone] fenêtre du retour vidéo : création impossible', err);
      return;
    }
    this.onKey = (e: KeyboardEvent): void => {
      if (e.code !== DRONE_FEED_KEY || e.repeat || e.ctrlKey || e.metaKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const phase = ctx.session.phase;
      if (phase !== 'playing' || !isPoliceRole(ctx.player.state.role)) return;
      if (!OVER_SCREENS.has(ctx.ui.current)) return;
      this.onFeedKey(e.shiftKey, e.altKey);
      // Alt + O tape « œ » sur Mac : pas de caractère parasite
      if (e.altKey || e.shiftKey) e.preventDefault();
    };
    window.addEventListener('keydown', this.onKey);
  }

  // ───────────────────────────── service ─────────────────────────────

  available(): number {
    return this.refreshIds(true).length;
  }

  engaged(): boolean {
    const ctx = this.ctx;
    if (!ctx) return false;
    if (this.refreshIds(true).length > 0) return true;
    // appareil posé (relève de batterie) : l'équipe du télépilote est toujours là
    const list = ctx.people.list;
    for (let i = 0; i < list.length; i++) {
      const p = list[i]!;
      if (p.kind === 'telepilote' && p.faction === 'police' && p.health > 0) return true;
    }
    return false;
  }

  show(vehicleId = 0): boolean {
    const ctx = this.ctx;
    if (!ctx) return false;
    const ids = this.refreshIds(true);
    if (ids.length === 0 && !this.engaged()) {
      ctx.ui?.notify?.('Aucun drone engagé dans ce dispositif.', 'info', 3);
      return false;
    }
    if (vehicleId !== 0) this.wanted = vehicleId;
    const id = chooseDrone(ids, this.droneId, vehicleId);
    if (id !== this.droneId) this.snap = true;
    this.droneId = id;
    if (!this.open) {
      this.open = true;
      this.snap = true;
      this.layoutAt = 0;
      this.infoAt = 0;
    }
    return true;
  }

  showSquad(squadId: number): boolean {
    const ctx = this.ctx;
    if (!ctx) return false;
    const s = ctx.squads.get(squadId);
    if (!s) return false;
    const ext = this.ext();
    let found = 0;
    if (s.vehicleId !== 0) {
      const v = ctx.vehicles.get(s.vehicleId);
      if (v && v.kind === 'drone') found = v.id;
    }
    if (found === 0 && ext) {
      for (let i = 0; i < s.members.length && found === 0; i++) {
        const v = ext.droneOf(s.members[i]!);
        if (v) found = v.id;
      }
    }
    return this.show(found);
  }

  hide(): void {
    this.open = false;
    this.wanted = 0;
    this.deactivate();
  }

  toggle(): boolean {
    if (this.open) {
      this.hide();
      return false;
    }
    return this.show();
  }

  cycle(): void {
    const ids = this.refreshIds(true);
    const next = cycleDrone(ids, this.droneId, 1);
    if (next !== this.droneId) {
      this.droneId = next;
      this.wanted = next;
      this.snap = true;
      this.infoAt = 0;
    }
  }

  /** Fenêtre agrandie ou plein écran. */
  get large(): boolean {
    return this.mode !== 'small';
  }

  setLarge(large: boolean): void {
    this.setMode(large ? 'large' : 'small');
  }

  setMode(mode: FeedMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.layoutAt = 0;
    this.aux()?.requestFrame();
  }

  /** Format suivant : petite → agrandie → plein écran → petite. */
  cycleMode(): void {
    this.setMode(nextFeedMode(this.mode));
  }

  /**
   * Touche O (sans souris) : O ouvre ou ferme ; Maj + O change le format (et ouvre la fenêtre, agrandie, si elle
   * était fermée) ; Alt + O passe au palier de zoom suivant (fenêtre ouverte).
   */
  onFeedKey(shift: boolean, alt: boolean): void {
    if (alt) {
      if (this.open) this.cycleZoom();
      else if (this.show()) this.cycleZoom();
      return;
    }
    if (shift) {
      if (this.open) this.cycleMode();
      else if (this.show()) this.setMode('large');
      return;
    }
    this.toggle();
  }

  toggleDetect(): void {
    this.detect = !this.detect;
    this.panel?.setDetect(this.detect);
    this.seenFrames = -1;
  }

  cycleZoom(): void {
    this.zoom = nextZoom(this.zoom);
    this.infoAt = 0;
    this.aux()?.requestFrame();
  }

  // ───────────────────────────── image ─────────────────────────────

  frame(dt: number): void {
    const ctx = this.ctx;
    const panel = this.panel;
    if (!ctx || !panel) return;
    this.time += dt;
    // coût de l'image : durée moyenne d'une image du jeu, palier de ralentissement avec hystérésis
    if (dt > 0 && dt < 0.5) this.frameMs += (dt * 1000 - this.frameMs) * (this.frameMs === 0 ? 1 : 0.05);
    const slow = feedSlowLevel(this.slow, this.frameMs);
    if (slow !== this.slow) {
      this.slow = slow;
      this.layoutAt = 0;
    }
    const phase = ctx.session.phase;
    const visible = this.open && (phase === 'playing' || phase === 'paused') && OVER_SCREENS.has(ctx.ui.current);
    panel.setShown(visible);
    if (!visible) {
      this.deactivate();
      return;
    }
    const ids = this.refreshIds(false);
    const id = chooseDrone(ids, this.droneId, this.wanted);
    if (id !== this.droneId) {
      this.droneId = id;
      this.snap = true;
      this.infoAt = 0;
    }
    panel.setMulti(ids.length > 1);
    // placement : deux fois par seconde, et tout de suite quand un écran s'ouvre ou se ferme (carte tactique)
    if (ctx.ui.current !== this.lastScreen) {
      this.lastScreen = ctx.ui.current;
      this.layoutAt = 0;
    }
    if (this.time >= this.layoutAt) this.layout();
    const v = id !== 0 ? ctx.vehicles.get(id) : undefined;
    const aux = this.aux();
    if (!v || !aux) {
      this.deactivate();
      if (this.lostSince < 0) this.lostSince = this.time;
      panel.setLost(true, 'PAS DE SIGNAL', aux ? 'Aucun drone en vol — relève de l’appareil en cours' : 'Affichage 3D indisponible');
      if (this.time >= this.infoAt) {
        this.infoAt = this.time + 0.5;
        panel.setInfo('DRONE', 'ALT —', 'CAP —', '×' + this.zoom, videoClock(ctx.env.state.timeOfDay), '');
      }
      return;
    }
    if (this.lostSince >= 0) {
      this.lostSince = -1;
      panel.setLost(false);
    }
    // nouvelle image depuis la dernière fois : repères posés avec la pose qui l'a produite (avant de la changer)
    if (aux.frames !== this.seenFrames) {
      this.seenFrames = aux.frames;
      if (this.detect && aux.active) this.drawMarks(ctx, aux);
    }
    this.aim(ctx, v, dt);
    this.applyCamera(aux, ctx);
    if (this.time >= this.countAt) {
      this.countAt = this.time + 0.5;
      this.inView = this.countInView(ctx, aux);
    }
    if (this.time >= this.infoAt) {
      this.infoAt = this.time + 0.25;
      this.refreshInfo(ctx, v, ids);
    }
  }

  /** Point visé (zone dense de la foule, lissée) et pose de la nacelle. */
  private aim(ctx: GameContext, v: Vehicle, dt: number): void {
    const world = ctx.world;
    // la zone dense est recherchée une fois par seconde autour du point survolé
    if (this.snap || this.time >= this.targetAt) {
      this.targetAt = this.time + 1;
      const alt = v.y - world.heightAt(v.x, v.z);
      let r = alt * 1.5;
      if (r < SEARCH_MIN) r = SEARCH_MIN;
      else if (r > SEARCH_MAX) r = SEARCH_MAX;
      const n = ctx.people.queryRadius(v.x, v.z, r, this.people, isProtester);
      if (this.xz.length < n * 2) this.xz = new Float64Array(n * 2 + 256);
      // seulement les personnes que la nacelle voit réellement : un attroupement derrière un immeuble de 20 m faisait
      // braquer la caméra sur un toit (constaté : foule à 81 m, masquée, centre de l'image sur la toiture)
      const cy = v.y - GIMBAL_DROP;
      let m = 0;
      for (let i = 0; i < n; i++) {
        const p = this.people[i]!;
        if (!this.visibleFrom(ctx, v.x, cy, v.z, p.x, p.y + 1.2, p.z)) continue;
        this.xz[m * 2] = p.x;
        this.xz[m * 2 + 1] = p.z;
        m++;
      }
      const found = m >= 3 && densestSpot(this.xz, m, 12, v.x, v.z, this.spot, 70);
      if (found) {
        // le barycentre d'un bloc de 36 m peut tomber entre deux groupes, sur une chaussée vide (au zoom ×4, le champ
        // ne fait qu'une vingtaine de mètres : « personne » à l'image) : la visée est ramenée sur le groupe visible le
        // plus proche de ce barycentre (barycentre des personnes à moins de 6 m de la plus proche). Le groupe déjà
        // filmé est gardé tant qu'il reste dans le bloc (pas de bascule d'un groupe à l'autre toutes les secondes)
        const keep = this.hasTarget && !this.snap && (this.rawX - this.spot.x) ** 2 + (this.rawZ - this.spot.z) ** 2 < 18 * 18;
        const ax = keep ? this.rawX : this.spot.x;
        const az = keep ? this.rawZ : this.spot.z;
        let best = -1;
        let bestD = Infinity;
        for (let i = 0; i < m; i++) {
          const d = (this.xz[i * 2]! - ax) ** 2 + (this.xz[i * 2 + 1]! - az) ** 2;
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
        const qx = this.xz[best * 2]!;
        const qz = this.xz[best * 2 + 1]!;
        let sx = 0;
        let sz = 0;
        let k = 0;
        for (let i = 0; i < m; i++) {
          const x = this.xz[i * 2]!;
          const z = this.xz[i * 2 + 1]!;
          if ((x - qx) * (x - qx) + (z - qz) * (z - qz) > 36) continue;
          sx += x;
          sz += z;
          k++;
        }
        this.spot.x = sx / k;
        this.spot.z = sz / k;
        this.rawX = this.spot.x;
        this.rawZ = this.spot.z;
        if (!this.hasTarget || this.snap) {
          this.tx = this.rawX;
          this.tz = this.rawZ;
        }
        this.foundAt = this.time;
      }
      // foule masquée un instant (l'appareil tourne en orbite, un immeuble passe devant) : la nacelle garde sa visée
      // quelques secondes au lieu de basculer vers l'avant de l'appareil — sur les toits
      this.hasTarget = found || (this.hasTarget && !this.snap && this.time - this.foundAt < TARGET_HOLD);
    }
    if (this.hasTarget) {
      this.tx = damp(this.tx, this.rawX, dt, 1.4);
      this.tz = damp(this.tz, this.rawZ, dt, 1.4);
    }
    const inp = this.inp;
    inp.x = v.x;
    inp.y = v.y;
    inp.z = v.z;
    inp.ground = world.heightAt(v.x, v.z);
    inp.heading = v.heading;
    inp.hasTarget = this.hasTarget;
    inp.tx = this.tx;
    inp.tz = this.tz;
    inp.tGround = this.hasTarget ? world.heightAt(this.tx, this.tz) : inp.ground;
    const pose = dronePose(inp, this.pose);
    if (this.snap) {
      this.yaw = pose.yaw;
      this.pitch = pose.pitch;
      this.snap = false;
    } else {
      // nacelle stabilisée : le regard suit sans à-coups (l'appareil tourne sur son orbite)
      this.yaw = dampAngle(this.yaw, pose.yaw, dt, 0.6);
      this.pitch = damp(this.pitch, pose.pitch, dt, 0.6);
    }
  }

  private applyCamera(aux: RenderAuxApi, ctx: GameContext): void {
    const cam = aux.camera;
    const pose = this.pose;
    cam.position.set(pose.x, pose.y, pose.z);
    // caméra Three.js : regard vers −Z ; cap du jeu : avant = (sin, cos) → rotation y = cap + π ; x négatif : vers le bas
    cam.rotation.order = 'YXZ';
    cam.rotation.set(-this.pitch, this.yaw + Math.PI, 0);
    const fov = zoomFov(BASE_FOV, this.zoom);
    if (Math.abs(cam.fov - fov) > 0.01 || cam.near !== 1.5) {
      cam.fov = fov;
      cam.near = 1.5;
      cam.far = 2000;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld(true);
    aux.target = this.panel ? this.panel.canvas : null;
    aux.range = 450;
    const q = ctx.view ? ctx.view.quality : 'moyen';
    aux.fps = feedBudget(q, this.slow).fps;
    aux.active = true;
  }

  /** Manifestants dans le champ de la caméra (cône de vue réel, pas un simple rayon) et en vue (pas derrière un immeuble). */
  private countInView(ctx: GameContext, aux: RenderAuxApi): number {
    const cam = aux.camera;
    const pose = this.pose;
    this.m4.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.m4);
    let r = (pose.distance * 1.3) / this.zoom + 25;
    if (r > 320) r = 320;
    const n = ctx.people.queryRadius(pose.lookX, pose.lookZ, r, this.people, isProtester);
    let c = 0;
    for (let i = 0; i < n; i++) {
      const p = this.people[i]!;
      if (!this.frustum.containsPoint(this.v3.set(p.x, p.y + 1, p.z))) continue;
      // comme les repères : une personne masquée par un immeuble n'est pas « dans le champ » de l'opérateur
      if (this.visibleFrom(ctx, cam.position.x, cam.position.y, cam.position.z, p.x, p.y + 1.2, p.z)) c++;
    }
    return c;
  }

  /** Repères de détection : manifestants dans le champ, projetés avec la caméra de la dernière image. */
  private drawMarks(ctx: GameContext, aux: RenderAuxApi): void {
    const panel = this.panel!;
    const canvas = panel.marks;
    const g = canvas.getContext('2d');
    if (!g) return;
    const w = canvas.width;
    const h = canvas.height;
    g.clearRect(0, 0, w, h);
    const cam = aux.camera;
    const pose = this.pose;
    let r = (pose.distance * 1.3) / this.zoom + 25;
    if (r > 320) r = 320;
    const n = ctx.people.queryRadius(pose.lookX, pose.lookZ, r, this.people, isProtester);
    // un petit carré par personne : lisible sans masquer l'image (une foule dense fait une tache, comme en thermique)
    const size = Math.max(1.5, Math.min(w, h) / 150);
    g.fillStyle = 'rgba(255,190,50,.88)';
    g.beginPath();
    let drawn = 0;
    for (let i = 0; i < n && drawn < 1500; i++) {
      const p = this.people[i]!;
      // la caméra ne voit pas à travers les toits : personne masquée par un immeuble entre elle et le drone, pas de repère
      if (!this.visibleFrom(ctx, cam.position.x, cam.position.y, cam.position.z, p.x, p.y + 1.2, p.z)) continue;
      const q = this.v3.set(p.x, p.y + 0.9, p.z).project(cam);
      if (q.z < -1 || q.z > 1 || q.x < -1 || q.x > 1 || q.y < -1 || q.y > 1) continue;
      const sx = (q.x * 0.5 + 0.5) * w;
      const sy = (0.5 - q.y * 0.5) * h;
      g.rect(sx - size, sy - size, size * 2, size * 2);
      drawn++;
    }
    g.fill();
  }

  /** Ligne de vue 3D du drone à un point : échantillons le long du segment, sous la hauteur du bâti = masqué. */
  private visibleFrom(ctx: GameContext, ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    const world = ctx.world;
    const d = Math.hypot(bx - ax, bz - az);
    const steps = Math.min(40, Math.max(2, Math.ceil(d / 4)));
    for (let k = 1; k < steps; k++) {
      const t = k / steps;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t, y = ay + (by - ay) * t;
      const roof = world.buildingHeightAt(x, z);
      if (roof > 0 && world.heightAt(x, z) + roof > y) return false;
    }
    return true;
  }

  private refreshInfo(ctx: GameContext, v: Vehicle, ids: readonly number[]): void {
    const panel = this.panel!;
    const ext = this.ext();
    const fs = ext ? ext.flightStatus(v) : null;
    const alt = fs ? fs.altitude : v.y - ctx.world.heightAt(v.x, v.z);
    let name = 'DRONE';
    if (fs && fs.pilotId !== 0) {
      const pilot = ctx.people.get(fs.pilotId);
      const squad = pilot && pilot.squadId !== 0 ? ctx.squads.get(pilot.squadId) : undefined;
      if (squad) name = squad.name.toUpperCase();
    }
    if (ids.length > 1) name += ` · ${ids.indexOf(v.id) + 1}/${ids.length}`;
    if (fs && (fs.mode === 'retour' || fs.mode === 'atterrissage')) name += ' · RETOUR';
    const bearing = compassBearing(this.yaw);
    const cap = `CAP ${String(Math.round(bearing) % 360).padStart(3, '0')}° ${cardinal8(bearing)}`;
    panel.setInfo(name, `ALT ${Math.max(0, Math.round(alt))} m`, cap, '×' + this.zoom, videoClock(ctx.env.state.timeOfDay), crowdLabel(this.inView));
  }

  /** Place la fenêtre : à droite de la mini-carte (HUD), ou dans le coin haut gauche de la carte tactique. */
  private layout(): void {
    const panel = this.panel;
    const ctx = this.ctx;
    if (!panel || !ctx) return;
    this.layoutAt = this.time + 0.5;
    const W = window.innerWidth || 1280;
    const H = window.innerHeight || 720;
    const size = feedSize(W, H, this.mode);
    const q = ctx.view ? ctx.view.quality : 'moyen';
    // définition : un pixel rendu par pixel affiché (taille CSS × densité de l'écran), dans le budget de pixels
    const dpr = typeof window.devicePixelRatio === 'number' ? window.devicePixelRatio : 1;
    const buf = feedBufferSize(size.width, size.height, dpr, PIXEL_RATIO_CAP[q] ?? 2, feedBudget(q, this.slow).pixels);
    if (panel.setSize(size, this.mode, buf)) this.aux()?.requestFrame();
    let x = 16;
    let y = (H - size.height) / 2;
    const rectOf = (sel: string): DOMRect | null => {
      const e = document.querySelector(sel);
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 ? r : null;
    };
    if (this.mode === 'full') {
      // plein écran : centré, par-dessus le HUD (Maj + O ou O pour revenir)
      x = (W - size.width) / 2;
      y = (H - size.height) / 2;
    } else if (ctx.ui.current === 'carte_tactique') {
      const m = rectOf('[data-id="tac-map"]');
      if (m) {
        x = m.left + 58;
        y = m.top + 10;
      }
    } else if (compactScreen(W, H) || this.touchHud()) {
      // téléphone, tablette, petite fenêtre : aucune place libre à gauche (joystick, Radio / Ordres) — la fenêtre
      // prend le coin haut gauche, par-dessus le tableau de situation et la mini-carte, le temps qu'elle est ouverte
      const tl = rectOf('.hud-slot--top-left');
      if (tl) {
        x = tl.left;
        y = tl.top;
      } else {
        x = 10;
        y = 8;
      }
    } else {
      const mini = rectOf('[data-w="maps.minimap"]');
      if (mini) {
        x = mini.right + 14;
        y = mini.top;
        // ne pas recouvrir les boutons de la colonne de gauche (actions rapides, proposition de l'adjoint) :
        // si la fenêtre (agrandie) les chevauche, elle passe à leur droite
        const items = document.querySelectorAll('.hud-slot--left .cm-btn, .hud-slot--left .cq-prop');
        let right = -1;
        for (let i = 0; i < items.length; i++) {
          const r = items[i]!.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) continue;
          if (r.right > x && r.left < x + size.width && r.bottom > y && r.top < y + size.height) right = Math.max(right, r.right);
        }
        if (right >= 0) x = right + 12;
      } else {
        const tl = rectOf('.hud-slot--top-left');
        if (tl) {
          x = tl.left;
          y = tl.bottom + 8;
        }
      }
    }
    x = Math.max(4, Math.min(W - size.width - 4, x));
    y = Math.max(4, Math.min(H - size.height - 4, y));
    panel.place(x, y);
  }

  // ───────────────────────────── interne ─────────────────────────────

  /** Le HUD est en disposition tactile (commandes à l'écran). */
  private touchHud(): boolean {
    const hud = document.querySelector('.ui-hud');
    const t = hud ? hud.getAttribute('data-touch') : null;
    return t !== null && t !== '' && t !== 'none';
  }

  private refreshIds(force: boolean): number[] {
    const ctx = this.ctx;
    if (!ctx) return this.ids;
    if (force || this.time - this.idsAt >= 0.5 || this.idsAt < 0) {
      this.idsAt = this.time;
      feedDroneIds(ctx.vehicles.list, this.ids);
    }
    return this.ids;
  }

  private aux(): RenderAuxApi | null {
    const a = this.ctx ? this.ctx.service<RenderAuxApi>('render.aux') : undefined;
    return a && a.camera ? a : null;
  }

  private ext(): VehiclesExtLike | null {
    const e = this.ctx ? this.ctx.service<VehiclesExtLike>('vehicles.ext') : undefined;
    return e && typeof e.flightStatus === 'function' && typeof e.droneOf === 'function' ? e : null;
  }

  private deactivate(): void {
    const aux = this.aux();
    if (aux && aux.target === (this.panel ? this.panel.canvas : null)) {
      aux.active = false;
      aux.target = null;
    }
  }

  private resetState(): void {
    this.hide();
    this.panel?.clearMarks();
    this.mode = 'small';
    this.zoom = 1;
    this.droneId = 0;
    this.hasTarget = false;
    this.snap = true;
    this.idsAt = -1;
  }

  reset(): void {
    this.resetState();
  }

  dispose(): void {
    for (const off of this.unsub) off();
    this.unsub.length = 0;
    if (this.onKey) window.removeEventListener('keydown', this.onKey);
    this.onKey = null;
    this.deactivate();
    this.panel?.dispose();
    this.panel = null;
  }
}

export const createSystems: ModuleFactory = () => [new DroneFeedSystem()];
