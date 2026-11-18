/* =====================================================================================
 * MISSIONS — aléas imposés par les phases.
 *
 * Chaque phase d'une mission porte des aléas en texte libre (« Retour de gaz par vent tournant », « Averse de deux
 * minutes », « Une trottinette électrique prend feu », « Jets de bouteilles sur la ligne », « Un manifestant glisse
 * sur le pavé mouillé »…), 785 libellés différents au catalogue, jusqu'ici ignorés. Ils sont désormais joués : étalés
 * dans la phase, annoncés par la salle (radio et bandeau), et traduits selon leur famille en effets réels :
 *   météo        averse : la pluie tombe deux minutes ;
 *   vent, gaz    le vent tourne vers la ligne de police et ramène du gaz sur elle ;
 *   lacrymogène  une salve de grenades tombe au point de contact et gaze vraiment la foule (pas une « bouteille de gaz ») ;
 *   feu          un départ de feu (poubelle) au bord de la foule ;
 *   violences    tension localisée là où la foule touche les forces (le module de foule en tire les jets) ;
 *   blessé       une vraie personne de la foule tombe, blessée, et l'incident « blessé » lui est rattaché ;
 *   ambulance    un SAMU arrive et demande le passage ;
 *   le reste     annoncé (panne radio, curieux, rumeur…) : au joueur d'y répondre.
 * Simulation pure (aucun DOM).
 * ===================================================================================== */

import type { EntityId, GameContext, Person } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { IncidentsApi, RescueApi } from '@/core/extensions';

/** Délai avant le premier aléa d'une phase, et intervalle entre deux (s). */
const FIRST_DELAY = 20;
const SPACING = 35;
/** Durée d'une averse imposée (s). */
const SHOWER = 120;
/** Salve lacrymogène : grenades, écart autour du point de chute (m), débit de chacune (/s), durée d'émission (s), rayon. */
const SALVO = 5;
const SALVO_SPREAD = 6;
const SALVO_RATE = 0.25;
const SALVO_TIME = 25;
const SALVO_RADIUS = 3;
/** Nuage initial d'une grenade à l'éclatement (quantité, rayon en m), comme une GM2L. */
const BURST_AMOUNT = 1.2;
const BURST_RADIUS = 6;
/** Recherche du cœur du groupe visé autour du point de contact (m). */
const SALVO_SEARCH = 40;
/** Blessure d'une victime d'aléa (blessé léger à soigner) et durée maximale à terre sans soins (s). */
const VICTIM_HURT = 40;
const VICTIM_DOWN = 900;
/** Distance maximale entre le point de l'aléa et la victime choisie dans la foule (m). */
const VICTIM_RANGE = 60;

interface Pending {
  at: number;
  text: string;
}

/** Grenade lacrymogène au sol qui se vide (comme un palet). */
interface Canister {
  x: number;
  z: number;
  until: number;
}

export class PhaseAleas {
  private readonly queue: Pending[] = [];
  private weatherBackAt = 0;
  private weatherBack: string | null = null;
  private readonly canisters: Canister[] = [];
  /** Victime réelle d'un aléa « blessé » (le cadre de mission ne la reproche pas au joueur dans les blessés). */
  onVictim: ((id: EntityId) => void) | null = null;
  private lastEmit = -1;

  reset(): void {
    this.queue.length = 0;
    this.canisters.length = 0;
    this.lastEmit = -1;
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
    this.emitCanisters(ctx, now);
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
    const said = `Attention, ${text.charAt(0).toLowerCase()}${text.slice(1)}.`;
    // annonce sur le réseau du joueur : le pompier ou le soignant du SAMU n'écoute que le réseau des secours (salle
    // PARIS, régulation SAMU 75) ; la salle de police parle sur 'commandement' (les autres civils n'ont que la notification)
    if (ctx.player.state.role === 'secouriste') {
      ctx.radio.say({ channel: 'secours', from: ctx.player.person()?.kind === 'samu' ? 'SAMU 75' : 'PARIS', priority: 2, text: said });
    } else {
      ctx.radio.say({ channel: 'commandement', from: 'SALLE', priority: 2, text: said });
    }
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
        if (/gaz|nuage/.test(t) && !/bouteille/.test(t)) ctx.hazards.emitGas(me.x - (dx / l) * 6, me.z - (dz / l) * 6, 0.35, 7);
      }
    }
    // salve lacrymogène : de vraies personnes gazées (à rincer) ; une grenade « renvoyée vers la ligne » tombe sur la ligne
    if (spot && /lacrymo|grenade/.test(t)) {
      const me = ctx.player.person();
      const back = me && /renvoy/.test(t);
      if (back) this.salvo(ctx, me.x + (spot.x - me.x) * 0.15, me.z + (spot.z - me.z) * 0.15, 1);
      // « une grenade tombe près de vous » : une seule ; « des grenades », « une salve », « un lancer » : une salve
      else for (const c of this.targets(ctx, spot, /grenades|salve|lancer/.test(t) ? SALVO : 1)) this.salvo(ctx, c.x, c.z, 1);
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
    if (spot && /blessé|glisse|tombe|malaise|bloqué|aggrave|inconscient|chute/.test(t) && !/grenade|lacrymo/.test(t)) {
      // une vraie personne de la foule à terre, à soigner : un incident sur un lieu vide ne menait le street medic, le
      // pompier ou le SAMU vers personne, et leur objectif « soigner » restait inatteignable
      const incidents = ctx.service<IncidentsApi>(EXT.incidents);
      const v = this.victim(ctx, spot);
      if (incidents) incidents.open('blesse', v ? v.x : spot.x, v ? v.z : spot.z, v ? 'person' : 'place', v ? v.id : 0, 2);
    }
    if (spot && /ambulance/.test(t)) {
      const rescue = ctx.service<RescueApi>(EXT.rescue);
      if (rescue) rescue.request('samu', spot.x, spot.z, 0);
    }
  }

  /** Grenades lacrymogènes au sol autour de (x, z) : nuage à l'éclatement, puis elles se vident pendant SALVO_TIME. */
  private salvo(ctx: GameContext, x: number, z: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.4;
      const d = n > 1 ? SALVO_SPREAD : 0;
      const c = { x: x + Math.sin(a) * d, z: z + Math.cos(a) * d, until: ctx.clock.now + SALVO_TIME };
      ctx.hazards.emitGas(c.x, c.z, BURST_AMOUNT, BURST_RADIUS);
      this.canisters.push(c);
    }
  }

  /**
   * Points de chute d'une salve : les `n` manifestants les plus entourés à moins de SALVO_SEARCH m du point de contact,
   * à SALVO_SPREAD m au moins les uns des autres (une salve couvre le front du cortège, pas un seul mètre carré).
   */
  private targets(ctx: GameContext, spot: { x: number; z: number }, n: number): { x: number; z: number }[] {
    const cand: { x: number; z: number; k: number }[] = [];
    const list = ctx.people.list;
    for (let i = 0; i < list.length; i++) {
      const p = list[i]!;
      if (p.faction !== 'protest' || p.custody !== 'free' || Math.hypot(p.x - spot.x, p.z - spot.z) > SALVO_SEARCH) continue;
      cand.push({ x: p.x, z: p.z, k: ctx.people.countIn(p.x, p.z, BURST_RADIUS, (q) => q.faction === 'protest') });
    }
    cand.sort((a, b) => b.k - a.k);
    const out: { x: number; z: number }[] = [];
    for (const c of cand) {
      if (out.length >= n) break;
      if (out.every((o) => Math.hypot(o.x - c.x, o.z - c.z) >= SALVO_SPREAD)) out.push({ x: c.x, z: c.z });
    }
    if (out.length === 0) out.push({ x: spot.x, z: spot.z });
    return out;
  }

  private emitCanisters(ctx: GameContext, now: number): void {
    const dt = this.lastEmit < 0 ? 0 : Math.min(1, now - this.lastEmit);
    this.lastEmit = now;
    for (let i = this.canisters.length - 1; i >= 0; i--) {
      const c = this.canisters[i]!;
      if (now >= c.until) { this.canisters.splice(i, 1); continue; }
      if (dt > 0) ctx.hazards.emitGas(c.x, c.z, SALVO_RATE * dt, SALVO_RADIUS);
    }
  }

  /**
   * Victime d'un aléa « blessé » : le manifestant libre, debout et indemne le plus proche du point de l'aléa, blessé
   * (légèrement) et mis à terre jusqu'aux soins. null si personne n'est assez près (l'incident reste un signalement).
   */
  private victim(ctx: GameContext, spot: { x: number; z: number }): Person | null {
    let best: Person | null = null;
    let bd = VICTIM_RANGE;
    const list = ctx.people.list;
    for (let i = 0; i < list.length; i++) {
      const p = list[i]!;
      if (p.faction !== 'protest' || p.custody !== 'free' || p.posture === 'down' || p.injury !== 'none' || p.vehicleId !== 0 || p.dormant) continue;
      const d = Math.hypot(p.x - spot.x, p.z - spot.z);
      if (d < bd) { bd = d; best = p; }
    }
    if (!best) return null;
    if (this.onVictim) this.onVictim(best.id);
    ctx.health.hurt(best, { amount: VICTIM_HURT, kind: 'fall', sourceId: 0, x: best.x, z: best.z, zone: 0.3 });
    const h = ctx.service<{ knockDown(p: Person, seconds: number, sourceId: number): void }>('people.health');
    if (h) h.knockDown(best, VICTIM_DOWN, 0);
    else ctx.health.setDown(best, true, 0);
    return best;
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
