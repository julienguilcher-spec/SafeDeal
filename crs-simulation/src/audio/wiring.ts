/* =====================================================================================
 * Câblage par événements : ce que le moteur sonore joue quand la simulation raconte quelque
 * chose. La simulation ne connaît pas l'audio ; elle émet 'sfx' pour un son précis, et le reste
 * se déduit ici des événements de jeu.
 *
 * Deux protections contre les doublons : le moteur fusionne deux sons identiques déclenchés au
 * même endroit à moins de 60 ms d'intervalle (un module qui émet à la fois l'événement de jeu et
 * le 'sfx' correspondant ne sera donc entendu qu'une fois), et les boucles attachées (sirène,
 * feu, canon à eau) ne démarrent pas si une boucle du même son tourne déjà au même endroit.
 * ===================================================================================== */

import type { GameContext, Unsubscribe } from '@/core/contracts';
import type { AmbienceDirector } from './ambienceDirector';
import type { AudioEngine } from './engine';
import type { FireLoops } from './fireLoops';
import { explosionSound, hurtSound, impactSound, voicePitchFor, windowSound, type SoundChoice } from './mapping';
import { hashString } from './prng';
import type { SpeechQueue } from './speech';
import type { VehicleAudio } from './vehicleSounds';

export interface WiringParts {
  engine: AudioEngine;
  ambience: AmbienceDirector;
  vehicles: VehicleAudio;
  fires: FireLoops;
  speech: SpeechQueue;
  /** Temps réel écoulé (s) — pour les limitations de cadence. */
  now(): number;
  applySettings(): void;
  resetWorld(): void;
}

/** Sons d'un mobilier urbain qui casse, selon sa matière. */
function propBreakSound(kind: string): string {
  switch (kind) {
    case 'abribus': case 'panneau_pub': case 'kiosque': case 'sanisette': case 'distributeur':
      return 'verre_brise';
    case 'poubelle': case 'cone': case 'chaise': case 'table_terrasse': case 'palette': case 'jardiniere':
    case 'pile_paves': case 'banc': case 'debris':
      return 'impact_sol';
    default:
      return 'tole';
  }
}

export function wireEvents(ctx: GameContext, parts: WiringParts): Unsubscribe[] {
  const { engine, ambience, vehicles, fires, speech } = parts;
  const ev = ctx.events;
  const choice: SoundChoice = { id: '', volume: 1, pitch: 1 };
  const lastHurt = new Map<number, number>();
  let hurtBudgetAt = 0;
  let hurtBudget = 0;
  let lastMolotovAt = -10;
  let lastMolotovX = 0;
  let lastMolotovZ = 0;
  const offs: Unsubscribe[] = [];

  const noteMolotov = (x: number, z: number): void => {
    lastMolotovAt = parts.now();
    lastMolotovX = x;
    lastMolotovZ = z;
  };

  // ── lecture directe ──
  offs.push(ev.on('sfx', (p) => {
    if (p.x !== undefined && p.z !== undefined) engine.play(p.id, { x: p.x, y: p.y, z: p.z, volume: p.volume, pitch: p.pitch });
    else engine.play(p.id, { volume: p.volume, pitch: p.pitch });
    if (p.id === 'molotov' && p.x !== undefined && p.z !== undefined) noteMolotov(p.x, p.z);
  }));

  // ── voix ──
  offs.push(ev.on('radio:message', (p) => {
    const m = p.msg;
    // écoute filtrée du joueur exécutant (module radio) : le trafic des autres unités n'est pas dit
    const listen = ctx.service<{ muted?(msg: typeof m): boolean }>('radio.control');
    if (listen && listen.muted && listen.muted(m)) return;
    speech.enqueue({
      text: m.text, mode: 'radio', voice: m.voice !== undefined ? m.voice : hashString(m.from) % 6,
      volume: 1, spatial: false, x: 0, y: 0, z: 0, priority: m.priority,
    });
  }));
  offs.push(ev.on('law:sommation', (p) => {
    speech.enqueue({
      text: p.text, mode: 'megaphone', voice: p.byId % 6, volume: 1,
      spatial: true, x: p.x, y: ctx.world.heightAt(p.x, p.z) + 1.7, z: p.z, priority: 2,
    });
  }));

  // ── explosions, impacts ──
  offs.push(ev.on('explosion', (p) => {
    const c = explosionSound(p.kind, p.radius, choice);
    engine.play(c.id, { x: p.x, y: p.y, z: p.z, volume: c.volume, pitch: c.pitch });
    if (c.id === 'molotov') noteMolotov(p.x, p.z);
    // détonation toute proche : sifflement d'oreille (l'étouffement vient de Person.stun, voir system.ts)
    if (c.id === 'detonation' || c.id === 'desencerclement' || c.id === 'explosion_vehicule') {
      const dx = p.x - engine.lx;
      const dz = p.z - engine.lz;
      const d2 = dx * dx + dz * dz;
      if (d2 < 12 * 12) engine.play('acouphene', { volume: d2 < 25 ? 1 : 0.6 });
    }
  }));
  offs.push(ev.on('projectile:impact', (p) => {
    let shielded = false;
    if (p.hitKind === 'person') {
      const target = ctx.people.get(p.hitId);
      if (target && target.alt) {
        const item = target.active >= 0 ? target.inventory[target.active] : undefined;
        shielded = !!item && item.id === 'bouclier';
      }
    }
    const c = impactSound(p.kind, p.hitKind, shielded, choice);
    if (!c) return;
    engine.play(c.id, { x: p.x, y: p.y, z: p.z, volume: c.volume, pitch: c.pitch });
    if (c.id === 'molotov') noteMolotov(p.x, p.z);
  }));

  // ── décor ──
  offs.push(ev.on('shop:window', (p) => {
    const c = windowSound(p.state, choice);
    const s = ctx.props.shop(p.id);
    if (c && s) engine.play(c.id, { x: s.x, y: s.y + 1.2, z: s.z, volume: c.volume, pitch: c.pitch });
  }));
  offs.push(ev.on('shop:shutter', (p) => {
    const s = ctx.props.shop(p.id);
    if (s) engine.play('rideau_fer', { x: s.x, y: s.y + 1.5, z: s.z, pitch: p.closed ? 1 : 1.12 });
  }));
  offs.push(ev.on('prop:damaged', (p) => {
    const prop = ctx.props.get(p.id);
    if (!prop) return;
    if (p.state === 'broken') engine.play(propBreakSound(prop.kind), { x: prop.x, y: prop.y + 0.6, z: prop.z });
    else if (p.state === 'damaged') engine.play(propBreakSound(prop.kind) === 'tole' ? 'tole' : 'impact_sol', { x: prop.x, y: prop.y + 0.6, z: prop.z, volume: 0.55, pitch: 1.2 });
  }));
  offs.push(ev.on('barricade:built', (p) => {
    engine.play('tole', { x: p.x, y: engine.ly, z: p.z, volume: 0.8, pitch: 0.85 });
  }));

  // ── feu ──
  offs.push(ev.on('fire:started', (p) => {
    // un cocktail Molotov vient de s'écraser ici : son embrasement est déjà dans sa recette
    const dx = p.x - lastMolotovX;
    const dz = p.z - lastMolotovZ;
    const afterMolotov = parts.now() - lastMolotovAt < 1.5 && dx * dx + dz * dz < 36;
    if (!afterMolotov) engine.play('embrasement', { x: p.x, y: engine.ly, z: p.z });
    fires.add(p.x, p.z, p.targetKind, p.targetId);
  }));
  offs.push(ev.on('fire:out', (p) => fires.remove(p.x, p.z, p.targetId)));

  // ── véhicules ──
  offs.push(ev.on('vehicle:siren', (p) => vehicles.onSiren(p)));
  offs.push(ev.on('vehicle:collision', (p) => vehicles.onCollision(p)));
  offs.push(ev.on('vehicle:removed', (p) => vehicles.onRemoved(p.id)));
  offs.push(ev.on('vehicle:turret_fired', (p) => vehicles.onTurret(p)));
  offs.push(ev.on('vehicle:state', (p) => {
    if (p.state !== 'burning') return;
    const v = ctx.vehicles.get(p.id);
    if (v) fires.add(v.x, v.z, 'vehicle', v.id);
  }));

  // ── personnes ──
  offs.push(ev.on('person:hurt', (p) => {
    const c = hurtSound(p.info.kind, p.info.amount, choice);
    if (!c) return;
    const person = ctx.people.get(p.id);
    if (!person) return;
    const now = parts.now();
    // au plus une réaction par personne toutes les 1,2 s, et six par seconde en tout
    const last = lastHurt.get(p.id);
    if (last !== undefined && now - last < 1.2) return;
    if (now - hurtBudgetAt > 1) {
      hurtBudgetAt = now;
      hurtBudget = 0;
    }
    if (++hurtBudget > 6) return;
    if (lastHurt.size > 512) lastHurt.clear();
    lastHurt.set(p.id, now);
    const sober = ctx.settings.values.violence === 'sobre' ? 0.6 : 1;
    const pitch = c.pitch * voicePitchFor(p.id);
    if (person.isPlayer) engine.play(c.id, { volume: c.volume * sober * 0.8, pitch });
    else engine.play(c.id, { x: person.x, y: person.y + 1.6, z: person.z, volume: c.volume * sober, pitch });
  }));

  // ── foule ──
  offs.push(ev.on('crowd:chant', (p) => ambience.onChant(p.x, p.z, p.text, p.intensity)));

  // ── session, réglages ──
  offs.push(ev.on('session:paused', (p) => speech.setPaused(p.paused)));
  offs.push(ev.on('session:ended', () => parts.resetWorld()));
  offs.push(ev.on('settings:changed', (p) => {
    parts.applySettings();
    if (p.key === 'voiceSynthesis' && !ctx.settings.values.voiceSynthesis) speech.cancel();
  }));
  offs.push(ev.on('session:started', () => {
    lastHurt.clear();
    lastMolotovAt = -10;
  }));

  return offs;
}
