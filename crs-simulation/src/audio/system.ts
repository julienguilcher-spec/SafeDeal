/* =====================================================================================
 * Système audio (GameSystem, ordre SystemOrder.AUDIO).
 *
 *   provide : publie ctx.audio (AudioApi), 'audio.engine' (moteurs pilotés), 'audio.debug' ;
 *   init    : abonnements aux événements, déverrouillage au premier geste, suspension quand la
 *             page est masquée ;
 *   frame   : position de l'auditeur (caméra ctx.view, cap ctx.player.state.camYaw), volumes,
 *             étouffement (étourdissement, habitacle), sons attachés aux véhicules, pas, foule,
 *             météo, voix, réserve de voix.
 * En mode headless (tests Node) le système reste inerte : l'API est publiée mais ne fait rien.
 * ===================================================================================== */

import {
  SystemOrder, type AudioApi, type GameContext, type GameSystem, type SoundId, type SoundOptions, type Unsubscribe,
} from '@/core/contracts';
import { AmbienceDirector } from './ambienceDirector';
import { AUDIO_DEBUG_SERVICE, AUDIO_ENGINE_SERVICE, type AudioDebug, type SpeakExtra } from './api';
import { AudioEngine } from './engine';
import { FireLoops } from './fireLoops';
import { Footsteps } from './footsteps';
import { SpeechQueue } from './speech';
import { VehicleAudio } from './vehicleSounds';
import { wireEvents } from './wiring';

type SpeakOpts = Parameters<AudioApi['speak']>[1] & SpeakExtra;

const SILENT_MIX = { presence: 0, murmur: 0, chant: 0, boo: 0, whistle: 0, panic: 0, drums: 0 };
const UNLOCK_EVENTS = ['pointerdown', 'pointerup', 'touchend', 'mousedown', 'keydown', 'click'] as const;

export class AudioSystem implements GameSystem, AudioApi {
  readonly id = 'audio';
  readonly order = SystemOrder.AUDIO;

  readonly engine = new AudioEngine();
  private ctx: GameContext | null = null;
  private ambience: AmbienceDirector | null = null;
  private vehicles: VehicleAudio | null = null;
  private fires: FireLoops | null = null;
  private footsteps: Footsteps | null = null;
  private speech: SpeechQueue | null = null;
  private offs: Unsubscribe[] = [];
  private time = 0;
  private listenerSet = false;
  private muffle = 0;
  private bound = false;

  private readonly onGesture = (): void => {
    if (this.engine.unlock() && this.engine.running) this.unbindGestures();
  };
  private readonly onVisibility = (): void => {
    const visible = typeof document === 'undefined' || document.visibilityState !== 'hidden';
    this.engine.setPageVisible(visible);
    if (this.speech && this.ctx) this.speech.setPaused(!visible || this.ctx.session.phase === 'paused');
  };

  // ───────────────────────────── GameSystem ─────────────────────────────

  provide(ctx: GameContext): void {
    this.ctx = ctx;
    this.engine.disabled = ctx.headless || typeof window === 'undefined';
    this.vehicles = new VehicleAudio(ctx, this.engine);
    ctx.audio = this;
    ctx.provide(AUDIO_ENGINE_SERVICE, this.vehicles);
    const debug: AudioDebug = {
      stats: () => this.engine.stats(),
      voices: () => this.engine.describeVoices(),
      crowdMix: () => (this.ambience ? this.ambience.mix : SILENT_MIX),
      unlock: () => this.engine.unlock(),
      analyser: () => this.engine.getAnalyser(),
      speech: () => (this.speech ? this.speech.info() : { supported: false, frenchVoices: 0, queued: 0, speaking: false }),
    };
    ctx.provide(AUDIO_DEBUG_SERVICE, debug);
  }

  init(ctx: GameContext): void {
    this.ctx = ctx;
    const engine = this.engine;
    if (!this.vehicles) this.vehicles = new VehicleAudio(ctx, engine);
    this.ambience = new AmbienceDirector(ctx, engine);
    this.fires = new FireLoops(ctx, engine);
    this.footsteps = new Footsteps(ctx, engine);
    this.speech = new SpeechQueue(engine, () => ctx.settings.values);
    engine.lineOfSight = (ax, az, bx, bz) => ctx.world.lineOfSight(ax, az, bx, bz);
    this.applySettings();
    this.offs = wireEvents(ctx, {
      engine,
      ambience: this.ambience,
      vehicles: this.vehicles,
      fires: this.fires,
      speech: this.speech,
      now: () => this.time,
      applySettings: () => this.applySettings(),
      resetWorld: () => this.reset(),
    });
    if (!engine.disabled) this.bindGestures();
  }

  /** Le contexte audio ne peut démarrer que pendant un geste de l'utilisateur (règle des navigateurs, surtout mobiles). */
  private bindGestures(): void {
    if (this.bound || typeof window === 'undefined') return;
    this.bound = true;
    for (const name of UNLOCK_EVENTS) window.addEventListener(name, this.onGesture, { capture: true, passive: true });
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisibility);
  }

  private unbindGestures(): void {
    if (typeof window === 'undefined') return;
    for (const name of UNLOCK_EVENTS) window.removeEventListener(name, this.onGesture, { capture: true });
  }

  private applySettings(): void {
    if (!this.ctx) return;
    const s = this.ctx.settings.values;
    this.engine.setVolumes(s.volumeMaster, s.volumeEffects, s.volumeVoices, s.volumeAmbience);
  }

  frame(dt: number): void {
    const ctx = this.ctx;
    if (!ctx || this.engine.disabled) return;
    try {
      this.time += dt;
      const engine = this.engine;
      const playing = ctx.session.phase === 'playing';

      // auditeur : la caméra, orientée selon le cap de la caméra du joueur
      const view = ctx.view;
      const me = ctx.player.person();
      if (view) {
        engine.setListener(view.camX, view.camY, view.camZ, ctx.player.state.camYaw);
      } else if (me && !this.listenerSet) {
        engine.setListener(me.x, me.y + 1.65, me.z, ctx.player.state.camYaw);
      }

      // le monde se tait hors du jeu (menus, pause, compte rendu) ; l'interface reste audible
      engine.setWorldLevel(playing ? 1 : 0);

      // étouffement : étourdi par une détonation, ou enfermé dans un habitacle
      let target = 0;
      if (me && me.stun > 0) target = Math.min(1, me.stun / 3) * 0.85;
      if (ctx.player.state.cameraMode === 'vehicle_int' || ctx.player.state.cameraMode === 'turret') target = Math.max(target, 0.35);
      this.muffle += (target - this.muffle) * (1 - Math.exp(-dt * (target > this.muffle ? 20 : 1.2)));
      engine.setMuffle(this.muffle);

      if (engine.ac) engine.warmUp();
      if (playing) {
        this.vehicles!.frame(dt);
        this.footsteps!.frame(dt);
        this.fires!.frame(dt);
        this.ambience!.frame(dt);
      }
      this.speech!.frame(dt);
      engine.update(dt);
    } catch (err) {
      console.error('[audio] erreur pendant la mise à jour', err);
    }
  }

  reset(): void {
    if (!this.ambience) return;
    this.ambience.reset();
    this.vehicles!.reset();
    this.fires!.reset();
    this.footsteps!.reset();
    this.speech!.cancel();
    this.engine.stopAll(0.15);
    this.muffle = 0;
  }

  dispose(): void {
    for (let i = 0; i < this.offs.length; i++) this.offs[i]!();
    this.offs.length = 0;
    this.unbindGestures();
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibility);
    this.bound = false;
    if (this.speech) this.speech.dispose();
    this.engine.dispose();
  }

  // ───────────────────────────── AudioApi ─────────────────────────────

  play(id: SoundId, opts?: SoundOptions): number {
    try {
      return this.engine.play(id, opts);
    } catch (err) {
      console.error(`[audio] lecture de « ${id} » impossible`, err);
      return 0;
    }
  }

  stop(handle: number, fadeSeconds?: number): void {
    this.engine.stop(handle, fadeSeconds);
  }

  /**
   * Synthèse vocale française. `radio` : habillage radio (bips, souffle). Hors contrat, le module
   * accepte aussi `megaphone`, `priority` et `y` (voir SpeakExtra dans api.ts).
   */
  speak(text: string, opts?: SpeakOpts): void {
    if (!this.speech || this.engine.disabled) return;
    const o = opts ?? {};
    const spatial = o.x !== undefined && o.z !== undefined;
    this.speech.enqueue({
      text,
      mode: o.megaphone ? 'megaphone' : o.radio ? 'radio' : 'plain',
      voice: o.voice ?? 0,
      volume: o.volume ?? 1,
      spatial,
      x: o.x ?? 0,
      y: o.y ?? this.engine.ly,
      z: o.z ?? 0,
      priority: o.priority ?? 1,
    });
  }

  setListener(x: number, y: number, z: number, yaw: number): void {
    this.listenerSet = true;
    this.engine.setListener(x, y, z, yaw);
  }
}
