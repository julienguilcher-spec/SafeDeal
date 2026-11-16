/* =====================================================================================
 * MISSIONS — aléas imposés par les phases.
 *
 * Chaque phase d'une mission porte des aléas en texte libre (« Retour de gaz par vent tournant », « Averse de deux
 * minutes », « Une trottinette électrique prend feu », « Jets de bouteilles sur la ligne », « Un manifestant glisse
 * sur le pavé mouillé »…), 785 libellés différents au catalogue, jusqu'ici ignorés. Ils sont désormais joués : étalés
 * dans la phase, annoncés par la salle (radio et bandeau), et traduits selon leur famille en effets réels :
 *   météo        averse : la pluie tombe deux minutes ;
 *   vent, gaz    le vent tourne vers la ligne de police et ramène du gaz sur elle ;
 *   feu          un départ de feu (poubelle) au bord de la foule ;
 *   violences    tension localisée là où la foule touche les forces (le module de foule en tire les jets) ;
 *   blessé       un incident « blessé » à traiter ;
 *   ambulance    un SAMU arrive et demande le passage ;
 *   le reste     annoncé (panne radio, curieux, rumeur…) : au joueur d'y répondre.
 * Simulation pure (aucun DOM).
 * ===================================================================================== */

import type { GameContext, Person } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { IncidentsApi, RescueApi } from '@/core/extensions';

/** Délai avant le premier aléa d'une phase, et intervalle entre deux (s). */
const FIRST_DELAY = 20;
const SPACING = 35;
/** Durée d'une averse imposée (s). */
const SHOWER = 120;

interface Pending {
  at: number;
  text: string;
}

export class PhaseAleas {
  private readonly queue: Pending[] = [];
  private weatherBackAt = 0;
  private weatherBack: string | null = null;

  reset(): void {
    this.queue.length = 0;
    this.weatherBackAt = 0;
    this.weatherBack = null;
  }

  /** Programme les aléas d'une phase qui commence (étalés dans le temps). */
  schedule(events: readonly string[], now: number): void {
    for (let i = 0; i < events.length; i++) {
      const text = events[i]!.trim();
      if (text) this.queue.push({ at: now + FIRST_DELAY + i * SPACING, text });
    }
  }

  update(ctx: GameContext): void {
    const now = ctx.clock.now;
    if (this.weatherBack && now >= this.weatherBackAt) {
      ctx.env.setWeather(this.weatherBack as never);
      this.weatherBack = null;
    }
    for (let i = 0; i < this.queue.length; i++) {
      if (this.queue[i]!.at > now) continue;
      const e = this.queue.splice(i, 1)[0]!;
      i--;
      this.play(ctx, e.text);
    }
  }

  /** Joue un aléa : annonce, puis effet selon sa famille. */
  play(ctx: GameContext, text: string): void {
    const t = text.toLowerCase();
    ctx.radio.say({ channel: 'commandement', from: 'SALLE', priority: 2, text: `Attention, ${text.charAt(0).toLowerCase()}${text.slice(1)}.` });
    ctx.ui.notify(text, 'warn', 6);
    const spot = this.contactPoint(ctx);
    if (/averse|pluie|orage|grêle/.test(t)) {
      if (!this.weatherBack) this.weatherBack = ctx.env.state.weather;
      ctx.env.setWeather('averse');
      this.weatherBackAt = ctx.clock.now + SHOWER;
    }
    if (/vent|retour de gaz|nuage|ramène/.test(t)) {
      const me = ctx.player.person();
      if (me && spot) {
        // le vent souffle de la foule vers la ligne
        const dx = me.x - spot.x, dz = me.z - spot.z;
        const l = Math.hypot(dx, dz) || 1;
        ctx.env.setWind((dx / l) * 4, (dz / l) * 4);
        if (/gaz/.test(t)) ctx.hazards.emitGas(me.x - (dx / l) * 6, me.z - (dz / l) * 6, 0.35, 7);
      }
    }
    if (spot && /feu|flamme|incendi|brûl|embrase/.test(t)) {
      if (ctx.world.isFree(spot.x, spot.z, 0.8)) {
        const prop = ctx.props.spawn('poubelle', spot.x, spot.z, 0);
        ctx.props.damage(prop, 1000, 'burn', 0);
      }
      ctx.hazards.ignite(spot.x, spot.z, 1.2, 0.8, 0);
    }
    if (spot && /jet|bouteille|pavé|projectile|attaqu|marteau|casse|charge|pousse|renvoyé|mortier|bris/.test(t)) {
      ctx.director.addTension(0.25, spot.x, spot.z, text);
    }
    if (spot && /blessé|glisse|tombe|malaise|bloqué|aggrave|inconscient|chute/.test(t)) {
      const incidents = ctx.service<IncidentsApi>(EXT.incidents);
      if (incidents) incidents.open('blesse', spot.x, spot.z, 'place', 0, 2);
    }
    if (spot && /ambulance/.test(t)) {
      const rescue = ctx.service<RescueApi>(EXT.rescue);
      if (rescue) rescue.request('samu', spot.x, spot.z, 0);
    }
  }

  /** Point de contact : le manifestant le plus proche du joueur (au bord de la foule), à défaut devant lui. */
  private contactPoint(ctx: GameContext): { x: number; z: number } | null {
    const me = ctx.player.person();
    if (!me) return null;
    let best: Person | null = null;
    let bd = 300;
    const list = ctx.people.list;
    for (let i = 0; i < list.length; i++) {
      const p = list[i]!;
      if (p.faction !== 'protest' || p.custody !== 'free') continue;
      const d = Math.hypot(p.x - me.x, p.z - me.z);
      if (d < bd) { bd = d; best = p; }
    }
    if (best) return { x: best.x, z: best.z };
    return { x: me.x + Math.sin(me.heading) * 20, z: me.z + Math.cos(me.heading) * 20 };
  }
}
