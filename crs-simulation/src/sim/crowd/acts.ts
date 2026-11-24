/* =====================================================================================
 * FOULE — la voix du cortège : slogans de la cause (appel puis réponse), prises de parole, annonces des
 * organisateurs, huées, appels (« Médic ! », « Laissez-nous sortir ! », « Ne poussez pas ! »).
 * Tout passe par l'événement crowd:chant du contrat (texte, lieu, intensité) ; les annonces sont doublées
 * de l'événement libre 'crowd:announce'. Textes génériques (docs/research/03 §1.6), sans personne réelle.
 * ===================================================================================== */

import { ANNOUNCE_EVENT } from './api';
import type { AnnounceEvent } from './api';
import type { CrowdCore } from './core';

const HOSTILE: readonly string[] = ['Laissez-nous passer !', 'Honte à vous !', 'Libérez nos camarades !', 'On est là ! On est là !'];
const BOO: readonly string[] = ['Hou ! Hou !', 'Honte à vous !', 'Libérez nos camarades !'];
const SPEECH_OPEN: readonly string[] = [
  'Merci d’être venus si nombreux. On est là pour se faire entendre, dans le calme.',
  'Regardez autour de vous : on n’est pas seuls. On avance ensemble, on reste groupés.',
  'On ira jusqu’au bout du parcours. On ne répond pas aux provocations.',
];

export class Voices {
  /** Slogan en cours : lieu, fin, intensité. */
  chantX = 0;
  chantZ = 0;
  chantUntil = -1;
  /** Applaudissements (fin d'une prise de parole) : lieu et fin. */
  clapX = 0;
  clapZ = 0;
  clapUntil = -1;
  private nextChant = 0;
  private nextSpeech = 0;
  private response = '';
  private responseAt = -1;
  private nextBoo = 0;
  private nextCall = 0;
  private readonly pos = { x: 0, z: 0 };
  private readonly ev: AnnounceEvent = { kind: 'consigne', text: '', x: 0, z: 0 };

  constructor(private readonly core: CrowdCore) {}

  reset(): void {
    this.chantUntil = -1;
    this.clapUntil = -1;
    this.nextChant = 0;
    this.nextSpeech = 0;
    this.responseAt = -1;
    this.nextBoo = 0;
    this.nextCall = 0;
  }

  update(): void {
    const core = this.core;
    const now = core.now;
    const dir = core.director;
    if (this.responseAt >= 0 && now >= this.responseAt) {
      this.responseAt = -1;
      core.ctx.events.emit('crowd:chant', { x: this.chantX, z: this.chantZ, text: this.response, intensity: Math.min(1, 0.5 + dir.present / 800) });
    }
    const base = dir.base;
    if (dir.present < 6 || base === 'terminee' || base === 'aucune') return;
    if (base === 'rassemblement' && now >= this.nextSpeech) {
      // prise de parole au micro, puis applaudissements
      this.nextSpeech = now + core.rngEmo.range(35, 60) * Math.min(1.5, core.timeScale);
      core.sono.position(this.pos);
      const text = core.rngEmo.chance(0.5) && core.cause.summary !== '' ? core.cause.summary : core.rngEmo.pick(SPEECH_OPEN);
      this.announce('prise_de_parole', text, this.pos.x, this.pos.z);
      this.clapX = this.pos.x;
      this.clapZ = this.pos.z;
      this.clapUntil = now + 9;
      this.nextChant = Math.max(this.nextChant, now + 10);
      return;
    }
    if (now < this.nextChant || core.cause.chants.length === 0 || dir.silentUntil > now) return;
    // slogans : plus fréquents et plus forts quand la foule est remontée ; rares à la dispersion
    const mood = Math.min(1, dir.tension * 1.2 + dir.meanAnger);
    const calm = base === 'dispersion' || base === 'apres_manif' ? 2.2 : 1;
    this.nextChant = now + core.rngEmo.range(11, 24) * calm * (1.2 - 0.5 * mood);
    const f = core.formation;
    // l'animateur : le camion sono, la tête, ou le milieu du cortège
    const pick = core.rngEmo.next();
    if (pick < 0.45) core.sono.position(this.pos);
    else {
      core.corridor.at(pick < 0.75 ? f.headS - 3 : (f.headS + f.tailS) * 0.5, core.rp);
      this.pos.x = core.rp.x;
      this.pos.z = core.rp.z;
    }
    const hostile = mood > 0.55 && core.sense.policeNear(this.pos.x, this.pos.z, 4) < 60;
    if (hostile) {
      this.chant(core.rngEmo.pick(HOSTILE), '', this.pos.x, this.pos.z, 0.6 + 0.4 * mood);
    } else {
      const c = core.rngEmo.pick(core.cause.chants);
      this.chant(c.call, c.response, this.pos.x, this.pos.z, 0.45 + 0.4 * mood);
    }
  }

  /** Lance un slogan (appel, puis réponse de la foule 2 s plus tard). */
  chant(call: string, response: string, x: number, z: number, intensity: number): void {
    const core = this.core;
    this.chantX = x;
    this.chantZ = z;
    this.chantUntil = core.now + 6.5;
    core.ctx.events.emit('crowd:chant', { x, z, text: call, intensity });
    if (response !== '') {
      this.response = response;
      this.responseAt = core.now + 2.2;
    }
  }

  announce(kind: AnnounceEvent['kind'], text: string, x: number, z: number): void {
    const ev = this.ev;
    ev.kind = kind;
    ev.text = text;
    ev.x = x;
    ev.z = z;
    this.core.ctx.events.emitAny(ANNOUNCE_EVENT, ev);
    this.core.ctx.events.emit('crowd:chant', { x, z, text, intensity: 0.9 });
    this.core.ctx.events.emit('sfx', { id: 'megaphone', x, y: 2.2, z, volume: 0.8 });
  }

  /** Huées (une salve toutes les quelques secondes au plus, toutes sources confondues). */
  boo(x: number, z: number, strength: number): void {
    const core = this.core;
    if (core.now < this.nextBoo) return;
    this.nextBoo = core.now + 5 + core.rngEmo.next() * 5;
    core.ctx.events.emit('crowd:chant', { x, z, text: core.rngEmo.pick(BOO), intensity: Math.min(1, 0.5 + strength * 0.5) });
    core.ctx.events.emit('sfx', { id: 'foule_huees', x, y: 1.6, z, volume: Math.min(1, 0.4 + strength * 0.6) });
  }

  /** Appel isolé (blessé, nasse, bousculade), espacé de quelques secondes. */
  call(text: string, x: number, z: number, gap = 6): boolean {
    const core = this.core;
    if (core.now < this.nextCall) return false;
    this.nextCall = core.now + gap;
    core.ctx.events.emit('crowd:chant', { x, z, text, intensity: 0.7 });
    core.ctx.events.emit('sfx', { id: 'cri', x, y: 1.6, z, volume: 0.6 });
    return true;
  }
}
