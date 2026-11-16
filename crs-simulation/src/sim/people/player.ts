/* =====================================================================================
 * Contrôleur du joueur (ordre CONTROL) — publie ctx.player et le service « player.control ».
 *
 * À chaque pas : regard (camYaw / camPitch), puis selon la situation :
 *   - à pied : déplacement relatif à la caméra, allures, accroupi, saut, objets (molette, 1 à 9,
 *     action principale avec charge du lancer, action secondaire maintenue), masque et visière ;
 *   - à bord : conduite, ou tourelle depuis une place de tireur (player-vehicle.ts) ;
 *   - engin télépiloté : les commandes pilotent l'engin, le personnage reste immobile ;
 * puis visée (personne sous le réticule, point visé au sol) et invite d'interaction.
 * Rien n'est commandé quand un écran modal est ouvert ou que controlEnabled est faux.
 *
 * Convention de cap : avant = (sin h, cos h), droite = (−cos h, sin h). Regarder vers la droite
 * (lookX > 0) DIMINUE donc le cap : face au sud (h = 0), tourner à droite mène vers l'ouest.
 * Les touches d'interface (carte, carte tactique, ordres, radio, pause) ne sont pas lues ici.
 * ===================================================================================== */

import type {
  CameraMode, EntityId, GameContext, GameSystem, InteractionOption, Person, PlayableRole, PlayerApi,
  PlayerState, Vehicle,
} from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import { wrapAngle } from '@/core/math';
import { PEOPLE_INTERACTIONS_SERVICE, PLAYER_CONTROL_SERVICE } from './api';
import type { PeopleInteractionsApi, PlayerControlApi } from './api';
import { fovScaleOf } from './gear';
import { AimProbe } from './player-aim';
import { GearControl } from './player-gear';
import { ItemControl } from './player-items';
import { VehicleControl } from './player-vehicle';
import type { PeopleShared } from './shared';
import { HOLD_DRAG, HOLD_OTHER } from './shared';
import * as T from './tuning';

function defaultState(): PlayerState {
  return {
    personId: 0, role: 'crs', cameraMode: 'tps', camYaw: 0, camPitch: 0, zoom: 1, controlEnabled: true,
    charge: 0, prompt: null, aimedPersonId: 0, aimX: 0, aimZ: 0,
  };
}

export class PlayerController implements GameSystem {
  readonly id = 'people.player';
  readonly order = SystemOrder.CONTROL;

  ctx!: GameContext;
  readonly state: PlayerState = defaultState();
  readonly api: PlayerApi;
  readonly control: PlayerControlApi;

  private aim!: AimProbe;
  private gear!: GearControl;
  private vehicles!: VehicleControl;
  private items!: ItemControl;
  private interactionsExt: PeopleInteractionsApi | undefined;

  private remoteId: EntityId = 0;
  private turret = -1;
  private crouch = false;
  /** Allure au clavier : false = marche (par défaut), true = petite foulée (bascule par le bouton « jog »). */
  private jog = false;
  private promptT = 0;
  private aimT = 0;
  private footCamera: CameraMode = 'tps';
  private seatVehicle: EntityId = 0;
  private seatIndex = -1;
  private readonly promptBuf: InteractionOption = {
    verb: 'parler', targetKind: 'person', targetId: 0, label: '', priority: 0, duration: 0, x: 0, z: 0,
  };
  private readonly opts: InteractionOption[] = [];

  constructor(readonly shared: PeopleShared) {
    const self = this;
    this.api = {
      state: this.state,
      person: () => this.person(),
      vehicle: () => this.vehicle(),
      possess: (personId, role) => this.possess(personId, role),
      setCameraMode: (mode) => this.setCameraMode(mode),
      toggleCamera: () => this.toggleCamera(),
    };
    this.control = {
      get remoteVehicleId(): EntityId {
        return self.remoteId;
      },
      setRemoteVehicle: (id) => this.setRemoteVehicle(id),
      get maskProgress(): number {
        return self.gear ? self.gear.progress : 0;
      },
      get fovScale(): number {
        const p = self.person();
        return p ? fovScaleOf(p) : 1;
      },
      get crouching(): boolean {
        return self.crouch;
      },
      get turretIndex(): number {
        return self.turret;
      },
    };
  }

  provide(ctx: GameContext): void {
    this.ctx = ctx;
    this.shared.bind(ctx);
    this.aim = new AimProbe(ctx);
    this.gear = new GearControl(ctx, this.shared);
    this.vehicles = new VehicleControl(ctx);
    this.items = new ItemControl(ctx, this.state);
    ctx.player = this.api;
    ctx.provide(PLAYER_CONTROL_SERVICE, this.control);
  }

  init(ctx: GameContext): void {
    this.interactionsExt = ctx.service<PeopleInteractionsApi>(PEOPLE_INTERACTIONS_SERVICE);
    // un coup reçu : vibration, et le geste en cours (masque, lancer) est perdu
    ctx.events.on('person:hurt', (ev) => {
      if (ev.id !== this.state.personId || this.state.personId === 0) return;
      const p = ctx.people.get(ev.id);
      const amount = ev.info.amount > 0 ? ev.info.amount : 0;
      if (ctx.settings.values.vibration) ctx.input.rumble(0.3 + (amount < 40 ? amount / 60 : 0.7), 0.25);
      if (p) this.gear.abort(p);
    });
    ctx.events.on('person:removed', (ev) => {
      if (ev.id === this.state.personId) this.forgetPerson();
    });
    ctx.events.on('vehicle:removed', (ev) => {
      if (ev.id === this.remoteId) this.setRemoteVehicle(0);
    });
  }

  reset(): void {
    const prev = this.person();
    if (prev) prev.isPlayer = false;
    Object.assign(this.state, defaultState());
    this.remoteId = 0;
    this.turret = -1;
    this.crouch = false;
    this.jog = false;
    this.promptT = 0;
    this.aimT = 0;
    this.items.reset();
    this.footCamera = 'tps';
    this.seatVehicle = 0;
    this.seatIndex = -1;
    this.gear.reset();
    this.vehicles.reset();
    this.shared.clear();
  }

  // ───────────────────────────── PlayerApi ─────────────────────────────

  person(): Person | null {
    const id = this.state.personId;
    return id !== 0 ? this.ctx.people.get(id) ?? null : null;
  }

  vehicle(): Vehicle | null {
    const p = this.person();
    return p && p.vehicleId !== 0 ? this.ctx.vehicles.get(p.vehicleId) ?? null : null;
  }

  possess(personId: EntityId, role?: PlayableRole): void {
    const ctx = this.ctx;
    const st = this.state;
    const prev = this.person();
    if (prev && prev.id !== personId) this.leave(prev);
    const p = personId !== 0 ? ctx.people.get(personId) : undefined;
    if (!p) {
      this.forgetPerson();
      return;
    }
    p.isPlayer = true;
    st.personId = p.id;
    if (role) st.role = role;
    st.camYaw = p.aimYaw;
    st.camPitch = p.aimPitch;
    st.zoom = 1;
    st.charge = 0;
    st.prompt = null;
    st.aimedPersonId = 0;
    st.aimX = p.x;
    st.aimZ = p.z;
    this.crouch = p.posture === 'crouch';
    this.items.adopt(p);
    this.promptT = 0;
    this.aimT = 0;
    this.seatVehicle = p.vehicleId;
    this.seatIndex = p.seat;
    this.turret = -1;
    const v = p.vehicleId !== 0 ? ctx.vehicles.get(p.vehicleId) : undefined;
    if (v) {
      this.turret = this.vehicles.turretOf(v, p.seat);
      if (this.turret >= 0) this.setCameraMode('turret');
      else if (st.cameraMode !== 'vehicle_int' && st.cameraMode !== 'vehicle_ext') this.setCameraMode('vehicle_ext');
    } else if (st.cameraMode !== 'fps' && st.cameraMode !== 'tps') {
      this.setCameraMode(this.footCamera);
    }
    this.shared.focusOn = true;
    this.shared.focusX = p.x;
    this.shared.focusZ = p.z;
    ctx.events.emit('player:possessed', { personId: p.id, role: st.role });
  }

  setCameraMode(mode: CameraMode): void {
    const st = this.state;
    if (st.cameraMode === mode) return;
    st.cameraMode = mode;
    if (mode === 'fps' || mode === 'tps') this.footCamera = mode;
    this.ctx.events.emit('player:camera', { mode });
  }

  /** Bascule FPS ↔ TPS à pied ; intérieur ↔ extérieur en véhicule ; tourelle ↔ extérieur pour un tireur. */
  toggleCamera(): void {
    const st = this.state;
    if (this.remoteId !== 0) return; // la caméra de l'engin télépiloté est imposée
    const p = this.person();
    if (p && p.vehicleId !== 0) {
      if (this.turret >= 0) this.setCameraMode(st.cameraMode === 'turret' ? 'vehicle_ext' : 'turret');
      else this.setCameraMode(st.cameraMode === 'vehicle_ext' ? 'vehicle_int' : 'vehicle_ext');
    } else {
      this.setCameraMode(st.cameraMode === 'tps' ? 'fps' : 'tps');
    }
  }

  setRemoteVehicle(id: EntityId): void {
    const ctx = this.ctx;
    const next = id !== 0 && ctx.vehicles.get(id) ? id : 0;
    if (next === this.remoteId) return;
    const old = this.remoteId !== 0 ? ctx.vehicles.get(this.remoteId) : undefined;
    if (old) this.vehicles.release(old);
    this.remoteId = next;
    const p = this.person();
    if (next !== 0) {
      const v = ctx.vehicles.get(next)!;
      if (p) {
        this.stopPerson(p);
        this.state.camYaw = v.heading;
        this.state.camPitch = -0.5;
      }
      this.setCameraMode(v.def.flying ? 'drone' : 'vehicle_ext');
    } else {
      if (p) {
        this.state.camYaw = p.aimYaw;
        this.state.camPitch = p.aimPitch;
      }
      if (p && p.vehicleId !== 0) this.setCameraMode(this.turret >= 0 ? 'turret' : 'vehicle_ext');
      else this.setCameraMode(this.footCamera);
      this.state.zoom = 1;
    }
    ctx.events.emitAny('player:remote', { vehicleId: next });
  }

  // ───────────────────────────── pas de simulation ─────────────────────────────

  update(dt: number): void {
    const ctx = this.ctx;
    const st = this.state;
    const shared = this.shared;
    const p = this.person();
    if (!p) {
      if (st.personId !== 0) this.forgetPerson();
      shared.focusOn = false;
      return;
    }
    const input = ctx.input;

    // véhicule occupé, engin télépiloté
    const v = p.vehicleId !== 0 ? ctx.vehicles.get(p.vehicleId) ?? null : null;
    this.trackSeat(p, v);
    let remote: Vehicle | null = null;
    if (this.remoteId !== 0) {
      remote = ctx.vehicles.get(this.remoteId) ?? null;
      if (!remote || ctx.health.isIncapacitated(p)) {
        this.setRemoteVehicle(0);
        remote = null;
      }
    }
    // centre d'intérêt de la simulation : là où regarde le joueur
    shared.focusOn = true;
    shared.focusX = remote ? remote.x : p.x;
    shared.focusZ = remote ? remote.z : p.z;

    if (!st.controlEnabled || ctx.ui.modal) {
      this.idle(p, v, remote);
      return;
    }

    // ── regard ──
    if (input.pressed('camera')) this.toggleCamera();
    const lx = input.lookX;
    const ly = input.lookY;
    if (lx !== 0 && lx === lx) st.camYaw = wrapAngle(st.camYaw - lx);
    if (ly !== 0 && ly === ly) {
      const pitch = st.camPitch + ly;
      st.camPitch = pitch > T.LOOK_PITCH_MAX ? T.LOOK_PITCH_MAX : pitch < -T.LOOK_PITCH_MAX ? -T.LOOK_PITCH_MAX : pitch;
    }
    this.zoom(dt, remote !== null);

    // ── commandes ──
    if (remote) {
      this.stopPerson(p);
      p.cmd.aimYaw = p.aimYaw;
      if (p.upper === 'none') p.upper = 'remote';
      this.vehicles.remote(remote, st);
      st.prompt = null;
      this.updateAim(p, dt, remote);
      return;
    }
    if (p.upper === 'remote') p.upper = 'none';
    if (v) this.aboard(p, v, dt);
    else this.onFoot(p, dt);
    this.updateAim(p, dt, null);
    this.interact(p, dt);
  }

  /** Commandes neutralisées (écran modal, cinématique) : tout est relâché, rien n'est lancé. */
  private idle(p: Person, v: Vehicle | null, remote: Vehicle | null): void {
    this.stopPerson(p);
    if (remote) this.vehicles.release(remote);
    if (v && v.def.seats[p.seat]?.role === 'driver') this.vehicles.release(v);
  }

  /** Immobilise le personnage et relâche ce qu'il tenait enfoncé. */
  private stopPerson(p: Person): void {
    const cmd = p.cmd;
    cmd.moveX = 0;
    cmd.moveZ = 0;
    cmd.jump = false;
    this.items.release(p);
  }

  /** Le joueur quitte ce personnage : il redevient un pion ordinaire. */
  private leave(p: Person): void {
    p.isPlayer = false;
    this.stopPerson(p);
    this.gear.abort(p);
    if (p.upper === 'remote') p.upper = 'none';
    if (this.remoteId !== 0) this.setRemoteVehicle(0);
    const v = p.vehicleId !== 0 ? this.ctx.vehicles.get(p.vehicleId) : undefined;
    if (v && v.def.seats[p.seat]?.role === 'driver') this.vehicles.release(v);
  }

  private forgetPerson(): void {
    const st = this.state;
    st.personId = 0;
    st.prompt = null;
    st.aimedPersonId = 0;
    this.items.reset();
    this.turret = -1;
    this.seatVehicle = 0;
    this.seatIndex = -1;
    this.gear.reset();
    this.shared.focusOn = false;
  }

  /** Montée, descente, changement de place : caméra adaptée, commandes de l'ancien véhicule relâchées. */
  private trackSeat(p: Person, v: Vehicle | null): void {
    const vid = v ? v.id : 0;
    if (vid === this.seatVehicle && p.seat === this.seatIndex) return;
    const ctx = this.ctx;
    if (this.seatVehicle !== 0 && this.seatVehicle !== vid) {
      const old = ctx.vehicles.get(this.seatVehicle);
      if (old && old.seats[this.seatIndex] === 0) this.vehicles.release(old);
    }
    this.seatVehicle = vid;
    this.seatIndex = p.seat;
    this.turret = v ? this.vehicles.turretOf(v, p.seat) : -1;
    if (this.remoteId !== 0) return;
    if (v) {
      this.stopPerson(p);
      this.crouch = false;
      this.setCameraMode(this.turret >= 0 ? 'turret' : 'vehicle_ext');
    } else {
      this.setCameraMode(this.footCamera);
    }
  }

  private zoom(dt: number, optics: boolean): void {
    const input = this.ctx.input;
    const st = this.state;
    const mode = st.cameraMode;
    const max = optics || mode === 'drone' || mode === 'viewfinder' || mode === 'turret' ? T.ZOOM_MAX_OPTICS : T.ZOOM_MAX_FOOT;
    let z = st.zoom;
    if (input.down('zoom_in')) z *= Math.exp(T.ZOOM_RATE * dt);
    if (input.down('zoom_out')) z *= Math.exp(-T.ZOOM_RATE * dt);
    st.zoom = z < 1 ? 1 : z > max ? max : z;
  }

  // ───────────────────────────── à bord ─────────────────────────────

  private aboard(p: Person, v: Vehicle, dt: number): void {
    const st = this.state;
    const cmd = p.cmd;
    cmd.moveX = 0;
    cmd.moveZ = 0;
    cmd.jump = false;
    cmd.aimYaw = st.camYaw;
    cmd.aimPitch = st.camPitch;
    p.aimYaw = st.camYaw;
    p.aimPitch = st.camPitch;
    this.items.cancelCharge();
    const role = v.def.seats[p.seat]?.role;
    if (role === 'driver') this.vehicles.drive(v);
    else if (this.turret >= 0) this.vehicles.gunner(p, v, this.turret, st, dt);
    this.gear.update(p, dt, !this.ctx.health.isIncapacitated(p) && p.custody === 'free');
  }

  // ───────────────────────────── à pied ─────────────────────────────

  private onFoot(p: Person, dt: number): void {
    const ctx = this.ctx;
    const st = this.state;
    const input = ctx.input;
    const cmd = p.cmd;
    cmd.aimYaw = st.camYaw;
    cmd.aimPitch = st.camPitch;

    if (ctx.health.isIncapacitated(p) || p.heldBy !== 0) {
      // à terre ou tenu : plus aucune commande
      this.stopPerson(p);
      this.gear.abort(p);
      return;
    }

    // ── déplacement relatif à la caméra ──
    let ix = input.moveX;
    let iy = input.moveY;
    if (!(ix === ix && iy === iy)) {
      ix = 0;
      iy = 0;
    }
    let mag = Math.sqrt(ix * ix + iy * iy);
    if (mag > 1) {
      ix /= mag;
      iy /= mag;
      mag = 1;
    }
    if (input.pressed('crouch')) this.crouch = !this.crouch;
    if (input.pressed('jump')) {
      if (this.crouch) this.crouch = false; // on se relève d'abord
      else cmd.jump = true;
    }
    const sprint = input.down('sprint') || (input.device === 'touch' && mag >= T.TOUCH_SPRINT);
    // Au clavier la touche d'avance est tout ou rien : on MARCHE par défaut (le souffle se refait) et une touche
    // bascule vers la petite foulée. À la manette et au doigt, c'est l'inclinaison du manche qui choisit.
    if (input.pressed('jog')) {
      this.jog = !this.jog;
      ctx.ui.notify(this.jog ? 'Allure : petite foulée' : 'Allure : marche', 'info', 2);
    }
    const dragging = this.dragging(p);
    if (mag < 0.02) {
      cmd.moveX = 0;
      cmd.moveZ = 0;
      cmd.gait = 0;
    } else {
      let gait: 0 | 1 | 2;
      let scale: number;
      if (sprint && mag > 0.5 && iy > -0.3) {
        gait = 2;
        scale = 1;
      } else if (mag < T.STICK_WALK) {
        gait = 0;
        scale = mag / T.STICK_WALK;
      } else if (this.items.altSent || this.crouch) {
        // bouclier levé, visée épaulée, accroupi : on avance au pas
        gait = 0;
        scale = 1;
      } else if (input.device === 'kbm' && !this.jog) {
        // clavier : marche tant que la petite foulée n'est pas demandée (Maj tenu = sprint, traité plus haut)
        gait = 0;
        scale = 1;
      } else {
        gait = 1;
        scale = 0.6 + 0.4 * (mag - T.STICK_WALK) / (1 - T.STICK_WALK);
      }
      const sy = Math.sin(st.camYaw);
      const cy = Math.cos(st.camYaw);
      const k = scale / mag;
      // avant = (sin, cos), droite = (−cos, sin)
      cmd.moveX = (sy * iy - cy * ix) * k;
      cmd.moveZ = (cy * iy + sy * ix) * k;
      cmd.gait = gait;
    }
    cmd.crouch = this.crouch;

    // ── objets, masque, visière ──
    const mine = this.carryingCasualty(p);
    const busy = mine || p.custody !== 'free' || p.stun > 0.5 || ctx.interactions.current(p) !== null;
    this.gear.update(p, dt, !busy);
    this.items.update(p, dt, busy || this.gear.busy);

    // le corps suit le déplacement, sauf en vue subjective, en visant, en lançant, ou en tirant un blessé
    cmd.faceMove = st.cameraMode !== 'fps' && !this.items.facingAim && !dragging;
  }

  private carryingCasualty(p: Person): boolean {
    if (p.carrying === 0) return false;
    const e = this.shared.peek(p.carrying);
    return e !== undefined && e.holdMode !== HOLD_OTHER;
  }

  private dragging(p: Person): boolean {
    if (p.carrying === 0) return false;
    const e = this.shared.peek(p.carrying);
    return e !== undefined && e.holdMode === HOLD_DRAG;
  }

  // ───────────────────────────── visée, interaction ─────────────────────────────

  private updateAim(p: Person, dt: number, remote: Vehicle | null): void {
    this.aimT -= dt;
    if (this.aimT > 0) return;
    this.aimT = T.AIM_INTERVAL;
    const st = this.state;
    if (remote) {
      // caméra de l'engin : le rayon part de l'engin
      this.aim.update(st, p, remote.x, remote.y, remote.z, st.camYaw, st.camPitch, false);
      return;
    }
    let yaw = st.camYaw;
    let pitch = st.camPitch;
    const v = this.turret >= 0 && p.vehicleId !== 0 ? this.ctx.vehicles.get(p.vehicleId) : undefined;
    if (v) {
      // tireur : c'est la tourelle qui vise
      yaw = v.heading + (v.turretYaw[this.turret] ?? 0);
      pitch = v.turretPitch[this.turret] ?? 0;
    }
    this.aim.update(st, p, p.x, p.y + this.aim.eyeHeight(p), p.z, yaw, pitch, st.cameraMode !== 'fps' && !v);
  }

  /** Invite = meilleure option ; la touche Interagir la lance, un nouvel appui annule l'action en cours. */
  private interact(p: Person, dt: number): void {
    const ctx = this.ctx;
    const st = this.state;
    const inter = ctx.interactions;
    const pressed = ctx.input.pressed('interact');
    const cur = inter.current(p);
    if (cur) {
      this.copyPrompt(cur.opt);
      if (pressed) {
        inter.cancel(p);
        this.promptT = 0;
      }
      return;
    }
    this.promptT -= dt;
    if (!pressed && this.promptT > 0) return;
    this.promptT = T.PROMPT_INTERVAL;
    if (p.heldBy !== 0 || ctx.health.isIncapacitated(p)) {
      st.prompt = null;
      return;
    }
    const best = this.bestOption(p);
    if (!best) {
      st.prompt = null;
      return;
    }
    this.copyPrompt(best);
    if (pressed && inter.start(p, best)) {
      this.items.cancelCharge();
      this.promptT = 0; // l'invite sera recalculée au prochain pas
    }
  }

  /** Option prioritaire : d'abord sur la personne visée si elle est à portée de main, sinon la meilleure alentour. */
  private bestOption(p: Person): InteractionOption | null {
    const ctx = this.ctx;
    const st = this.state;
    const opts = this.opts;
    let n = 0;
    const ext = this.interactionsExt;
    if (ext && st.aimedPersonId !== 0 && p.carrying === 0 && p.vehicleId === 0) {
      const t = ctx.people.get(st.aimedPersonId);
      if (t) {
        const dx = t.x - p.x;
        const dz = t.z - p.z;
        if (dx * dx + dz * dz < 9) n = ext.optionsFor(p, t.id, opts);
      }
    }
    if (n === 0) n = ctx.interactions.options(p, opts);
    return n > 0 ? opts[0]! : null;
  }

  private copyPrompt(o: InteractionOption): void {
    const b = this.promptBuf;
    b.verb = o.verb;
    b.targetKind = o.targetKind;
    b.targetId = o.targetId;
    b.label = o.label;
    b.priority = o.priority;
    b.duration = o.duration;
    b.x = o.x;
    b.z = o.z;
    this.state.prompt = b;
  }
}
