/* =====================================================================================
 * Services neutres côté joueur et présentation : joueur, interface, audio, entrées.
 * Aucun accès au DOM : l'interface neutre se contente de journaliser en console (mode debug).
 * ===================================================================================== */

import type {
  AudioApi, Button, CameraMode, EntityId, GameContext, InputState, NoticeKind, Person, PlayableRole,
  PlayerApi, PlayerState, ScreenId, UiApi, Vehicle,
} from './contracts';

// ───────────────────────────── joueur ─────────────────────────────

export interface NullPlayer extends PlayerApi {
  /** Remet l'état du joueur à ses valeurs par défaut (entre deux sessions). */
  reset(): void;
}

function defaultPlayerState(): PlayerState {
  return {
    personId: 0,
    role: 'crs',
    cameraMode: 'tps',
    camYaw: 0,
    camPitch: 0,
    zoom: 1,
    controlEnabled: true,
    charge: 0,
    prompt: null,
    aimedPersonId: 0,
    aimX: 0,
    aimZ: 0,
  };
}

/**
 * Joueur neutre : tient l'état (PlayerState), permet d'incarner une personne (possess) et de
 * changer de caméra. Il ne lit pas les entrées et ne pilote personne : c'est le rôle du
 * contrôleur du joueur (src/sim/people).
 */
export function createNullPlayer(ctx: GameContext): NullPlayer {
  const state = defaultPlayerState();

  function person(): Person | null {
    return state.personId !== 0 ? ctx.people.get(state.personId) ?? null : null;
  }

  function setCameraMode(mode: CameraMode): void {
    if (state.cameraMode === mode) return;
    state.cameraMode = mode;
    ctx.events.emit('player:camera', { mode });
  }

  return {
    state,
    person,
    vehicle(): Vehicle | null {
      const p = person();
      return p && p.vehicleId !== 0 ? ctx.vehicles.get(p.vehicleId) ?? null : null;
    },
    possess(personId: EntityId, role?: PlayableRole): void {
      const previous = person();
      if (previous) previous.isPlayer = false;
      const p = personId !== 0 ? ctx.people.get(personId) : undefined;
      if (!p) {
        state.personId = 0;
        state.prompt = null;
        state.aimedPersonId = 0;
        return;
      }
      p.isPlayer = true;
      state.personId = p.id;
      if (role) state.role = role;
      state.camYaw = p.aimYaw;
      state.camPitch = p.aimPitch;
      state.charge = 0;
      state.prompt = null;
      state.aimedPersonId = 0;
      state.aimX = p.x;
      state.aimZ = p.z;
      const inVehicle = p.vehicleId !== 0;
      if (inVehicle && state.cameraMode !== 'vehicle_int' && state.cameraMode !== 'vehicle_ext') {
        setCameraMode('vehicle_ext');
      } else if (!inVehicle && state.cameraMode !== 'fps' && state.cameraMode !== 'tps') {
        setCameraMode('tps');
      }
      ctx.events.emit('player:possessed', { personId: p.id, role: state.role });
    },
    setCameraMode,
    toggleCamera(): void {
      const p = person();
      if (p && p.vehicleId !== 0) {
        setCameraMode(state.cameraMode === 'vehicle_ext' ? 'vehicle_int' : 'vehicle_ext');
      } else {
        setCameraMode(state.cameraMode === 'tps' ? 'fps' : 'tps');
      }
    },
    reset(): void {
      const previous = person();
      if (previous) previous.isPlayer = false;
      Object.assign(state, defaultPlayerState());
    },
  };
}

// ───────────────────────────── interface ─────────────────────────────

export interface NullUi extends UiApi {
  reset(): void;
}

/**
 * Interface neutre : n'affiche rien. En mode debug, chaque demande est journalisée en console.
 * `current` mémorise le dernier écran ouvert ; `modal` reste false (rien ne bloque le jeu).
 */
export function createNullUi(debug: boolean): NullUi {
  let current: ScreenId | null = null;
  return {
    notify(text: string, kind: NoticeKind = 'info'): void {
      if (debug) console.info(`[ui] notification (${kind}) : ${text}`);
    },
    subtitle(speaker: string, text: string): void {
      if (debug) console.info(`[ui] sous-titre — ${speaker} : ${text}`);
    },
    banner(title: string, subtitle?: string): void {
      if (debug) console.info(`[ui] bandeau : ${title}${subtitle ? ' — ' + subtitle : ''}`);
    },
    open(screen: ScreenId): void {
      current = screen;
      if (debug) console.info(`[ui] ouverture de l'écran « ${screen} »`);
    },
    close(screen?: ScreenId): void {
      if (screen === undefined || screen === current) {
        if (debug && current) console.info(`[ui] fermeture de l'écran « ${current} »`);
        current = null;
      }
    },
    get modal(): boolean {
      return false;
    },
    get current(): ScreenId | null {
      return current;
    },
    reset(): void {
      current = null;
    },
  };
}

// ───────────────────────────── audio ─────────────────────────────

/** Audio neutre : aucun son ; play() renvoie tout de même un identifiant unique. */
export function createNullAudio(): AudioApi {
  let handle = 0;
  return {
    play(): number {
      return ++handle;
    },
    stop(): void {},
    speak(): void {},
    setListener(): void {},
  };
}

// ───────────────────────────── entrées ─────────────────────────────

/** Entrées neutres : aucun appareil actif, tout à zéro. */
export function createNullInput(): InputState {
  return {
    device: 'kbm',
    moveX: 0,
    moveY: 0,
    lookX: 0,
    lookY: 0,
    throttle: 0,
    brake: 0,
    wheel: 0,
    pointerLocked: false,
    down(_b: Button): boolean {
      return false;
    },
    pressed(_b: Button): boolean {
      return false;
    },
    released(_b: Button): boolean {
      return false;
    },
    rumble(): void {},
  };
}
