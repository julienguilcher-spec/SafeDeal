/* =====================================================================================
 * MISSIONS — objectifs « personnalisés » mesurables.
 *
 * Les 163 objectifs « personnalise » du catalogue étaient jugés sur l'issue de la mission. Ceux dont le texte décrit
 * une grandeur que le jeu connaît sont désormais mesurés (reconnaissance du texte, nombres écrits en toutes lettres) :
 *   cuve du canon à eau        « garder plus de quatre mille litres », « consommer moins de… », « jamais à sec
 *                              pendant un feu » ;
 *   véhicules                  « ramener le blindé intact », « ne perdre aucune moto » ;
 *   distance                   « rester à plus de dix mètres des lignes de police » ;
 *   cohésion                   « ne laisser aucun agent isolé (plus de quinze secondes) » ;
 *   drone                      « rester sous le plafond de cent mètres », « ne pas voler à moins de cinquante
 *                              mètres de la foule » ;
 *   retenue                    « rester calme sous les insultes » (aucun emploi de la force), « ne porter aucun
 *                              coup », « ne pas tirer plus de six grenades » ;
 *   discipline                 « ne pas quitter le rang plus de dix secondes d'affilée ».
 * Les autres restent jugés sur l'issue (le compte rendu le dit).
 * ===================================================================================== */

import type { Person, Vehicle } from '@/core/contracts';
import type { EvalEnv, ObjectiveRun } from './objectives';

export type CustomKind =
  | 'water_keep' | 'water_use' | 'water_dry' | 'vehicle_intact' | 'no_vehicle_loss' | 'keep_distance_police'
  | 'no_isolated' | 'drone_ceiling' | 'drone_crowd' | 'no_force' | 'no_blow' | 'grenade_limit' | 'stay_in_rank';

export interface CustomRule {
  kind: CustomKind;
  /** Seuil (litres, mètres) ; durée tolérée (s) pour les règles de temps. */
  n: number;
  t: number;
}

/** État de mesure attaché au déroulé d'un objectif. */
export interface CustomState {
  rule: CustomRule | null;
  parsed: boolean;
  /** Cuve au départ (l). */
  water0: number;
  /** Cumul de temps en défaut (s) et minuterie de mesure. */
  over: number;
  tick: number;
  /** Agents isolés : temps cumulé par personne. */
  isolated: Map<number, number>;
  /** Grenades au départ dans l'équipement du joueur. */
  grenades0: number;
}

const UNITS: Record<string, number> = {
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11,
  douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16, vingt: 20, trente: 30, quarante: 40, cinquante: 50,
  soixante: 60, cent: 100, mille: 1000,
};

/** « quatre mille » → 4000, « cent » → 100, « 25 » → 25. 0 si illisible. */
export function frenchNumber(text: string): number {
  const digits = text.replace(/\s/g, '').match(/^\d+/);
  if (digits) return Number(digits[0]);
  let total = 0;
  let cur = 0;
  for (const raw of text.toLowerCase().split(/[\s-]+/)) {
    const w = raw.replace(/[^a-zàâçéèêëîïôûùüÿ]/g, '');
    if (!w || w === 'et') continue;
    const v = UNITS[w];
    if (v === undefined) break;
    if (v === 1000) { total += (cur || 1) * 1000; cur = 0; }
    else if (v === 100) cur = (cur || 1) * 100;
    else cur += v;
  }
  return total + cur;
}

const N = '([\\wàâçéèêëîïôûùüÿ\\s-]+?)';

/** Reconnaît une règle mesurable dans le texte d'un objectif, ou null. */
export function parseCustom(text: string): CustomRule | null {
  const t = text.toLowerCase().replace(/[’']/g, "'");
  let m: RegExpMatchArray | null;
  if ((m = t.match(new RegExp(`garder (?:plus de|au moins) ${N} litres`)))) return { kind: 'water_keep', n: frenchNumber(m[1]!), t: 0 };
  if ((m = t.match(new RegExp(`consommer moins de ${N} litres`)))) return { kind: 'water_use', n: frenchNumber(m[1]!), t: 0 };
  if (/jamais rester à sec/.test(t)) return { kind: 'water_dry', n: 0, t: 0 };
  if (/ramener le blindé intact|ramener l'engin intact/.test(t)) return { kind: 'vehicle_intact', n: 0, t: 0 };
  if (/ne perdre aucune moto/.test(t)) return { kind: 'no_vehicle_loss', n: 0, t: 0 };
  if ((m = t.match(new RegExp(`rester à plus de ${N} mètres des lignes de police`)))) return { kind: 'keep_distance_police', n: frenchNumber(m[1]!), t: 10 };
  if ((m = t.match(new RegExp(`aucun agent isolé(?: plus de ${N} secondes)?`)))) return { kind: 'no_isolated', n: 25, t: m[1] ? frenchNumber(m[1]) : 20 };
  if ((m = t.match(new RegExp(`plafond de ${N} mètres`)))) return { kind: 'drone_ceiling', n: frenchNumber(m[1]!), t: 5 };
  if ((m = t.match(new RegExp(`moins de ${N} mètres de la foule`)))) return { kind: 'drone_crowd', n: frenchNumber(m[1]!), t: 5 };
  if (/rester calme sous les insultes/.test(t)) return { kind: 'no_force', n: 0, t: 0 };
  if (/ne porter aucun coup/.test(t)) return { kind: 'no_blow', n: 0, t: 0 };
  if ((m = t.match(new RegExp(`ne pas tirer plus de ${N} grenades`)))) return { kind: 'grenade_limit', n: frenchNumber(m[1]!), t: 0 };
  if ((m = t.match(new RegExp(`ne pas quitter le rang plus de ${N} secondes`)))) return { kind: 'stay_in_rank', n: 3, t: frenchNumber(m[1]!) };
  return null;
}

function stateOf(o: ObjectiveRun): CustomState {
  const r = o as ObjectiveRun & { custom?: CustomState };
  if (!r.custom) r.custom = { rule: null, parsed: false, water0: -1, over: 0, tick: 0, isolated: new Map(), grenades0: -1 };
  if (!r.custom.parsed) {
    r.custom.parsed = true;
    r.custom.rule = parseCustom(o.def.text);
  }
  return r.custom;
}

/** La règle reconnue pour cet objectif (null : jugé sur l'issue). */
export function customRuleOf(o: ObjectiveRun): CustomRule | null {
  return stateOf(o).rule;
}

// ───────────────────────────── grandeurs ─────────────────────────────

function playerVehicles(env: EvalEnv, kinds: readonly string[]): Vehicle[] {
  const ctx = env.ctx;
  const me = ctx.player.person();
  const out: Vehicle[] = [];
  if (!me) return out;
  const squads = new Set<number>();
  if (me.squadId !== 0) squads.add(me.squadId);
  for (const s of ctx.squads.list) if (s.leaderId === me.id || (s.parentId !== 0 && squads.has(s.parentId))) squads.add(s.id);
  for (const s of ctx.squads.list) {
    if (!squads.has(s.id) || s.vehicleId === 0) continue;
    const v = ctx.vehicles.get(s.vehicleId);
    if (v && kinds.indexOf(v.kind) >= 0 && out.indexOf(v) < 0) out.push(v);
  }
  if (me.vehicleId !== 0) {
    const v = ctx.vehicles.get(me.vehicleId);
    if (v && kinds.indexOf(v.kind) >= 0 && out.indexOf(v) < 0) out.push(v);
  }
  return out;
}

/** Eau restante dans la cuve des canons à eau du joueur (l), −1 s'il n'en a pas. */
function water(env: EvalEnv): number {
  const list = playerVehicles(env, ['canon_eau']);
  if (list.length === 0) return -1;
  let sum = 0;
  for (const v of list) {
    for (let i = 0; i < v.def.turrets.length; i++) if (v.def.turrets[i]!.kind === 'canon_eau') sum += v.turretAmmo[i] ?? 0;
  }
  return sum;
}

function drone(env: EvalEnv): Vehicle | null {
  const ctx = env.ctx;
  const me = ctx.player.person();
  if (!me) return null;
  let best: Vehicle | null = null;
  let bd = Infinity;
  for (const v of ctx.vehicles.list) {
    if (!v.def.flying || v.state === 'wrecked' || v.state === 'burnt') continue;
    const d = Math.hypot(v.x - me.x, v.z - me.z);
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}

/** Grenades (lacrymogènes, GM2L) dans l'équipement du joueur. */
function grenades(env: EvalEnv): number {
  const me = env.ctx.player.person();
  if (!me) return 0;
  let n = 0;
  for (const s of me.inventory) if (s.id === 'grenade_lacrymo' || s.id === 'grenade_gm2l') n += s.count;
  return n;
}

// ───────────────────────────── mesure ─────────────────────────────

/** Mesure en cours de mission (violations). Retourne false si l'objectif n'a pas de règle mesurable. */
export function watchCustom(o: ObjectiveRun, env: EvalEnv, fail: (note: string) => void): boolean {
  const st = stateOf(o);
  const rule = st.rule;
  if (!rule) return false;
  const ctx = env.ctx;
  const dt = env.dt;
  st.tick -= dt;
  if (st.tick > 0) return true;
  const step = 0.5 - st.tick;
  st.tick = 0.5;
  switch (rule.kind) {
    case 'water_keep':
    case 'water_use': {
      const w = water(env);
      if (w >= 0 && st.water0 < 0) st.water0 = w;
      if (w < 0) break;
      if (rule.kind === 'water_keep' && w < rule.n) fail(`Cuve descendue à ${Math.round(w)} l (plus de ${rule.n} l demandés).`);
      if (rule.kind === 'water_use' && st.water0 - w > rule.n) fail(`${Math.round(st.water0 - w)} l consommés (moins de ${rule.n} l demandés).`);
      break;
    }
    case 'water_dry': {
      const w = water(env);
      if (w === 0 && env.tracker.fires > env.tracker.firesOut) fail('Cuve vide alors qu’un feu brûlait encore.');
      break;
    }
    case 'vehicle_intact':
    case 'no_vehicle_loss': {
      const list = playerVehicles(env, rule.kind === 'vehicle_intact' ? ['centaure', 'canon_eau'] : ['moto_bravm']);
      for (const v of list) {
        if (v.state === 'wrecked' || v.state === 'burnt') {
          fail(rule.kind === 'vehicle_intact' ? 'L’engin est hors d’usage.' : 'Une moto a été perdue.');
          break;
        }
      }
      break;
    }
    case 'keep_distance_police': {
      const me = ctx.player.person();
      if (!me) break;
      const near = ctx.people.countIn(me.x, me.z, rule.n, (q: Person) => q.faction === 'police' && q.posture !== 'down');
      st.over = near > 0 ? st.over + step : 0;
      if (st.over > rule.t) fail(`Resté à moins de ${rule.n} m des lignes de police plus de ${rule.t} s.`);
      break;
    }
    case 'no_isolated': {
      const me = ctx.player.person();
      if (!me) break;
      for (const s of ctx.squads.list) {
        if (s.faction !== 'police' || (s.leaderId !== me.id && s.id !== me.squadId)) continue;
        for (const id of s.members) {
          const p = ctx.people.get(id);
          if (!p || p.vehicleId !== 0 || p.posture === 'down' || p.custody !== 'free') { st.isolated.delete(id); continue; }
          const mates = ctx.people.countIn(p.x, p.z, rule.n, (q: Person) => q !== p && q.faction === 'police' && q.posture !== 'down');
          const t = mates === 0 ? (st.isolated.get(id) ?? 0) + step : 0;
          st.isolated.set(id, t);
          if (t > rule.t) {
            fail(`${p.name} est resté isolé plus de ${rule.t} s.`);
            return true;
          }
        }
      }
      break;
    }
    case 'drone_ceiling': {
      const d = drone(env);
      if (!d) break;
      const h = d.y - ctx.world.heightAt(d.x, d.z);
      st.over = h > rule.n ? st.over + step : 0;
      if (st.over > rule.t) fail(`Drone à ${Math.round(h)} m, au-dessus du plafond de ${rule.n} m.`);
      break;
    }
    case 'drone_crowd': {
      const d = drone(env);
      if (!d) break;
      const h = d.y - ctx.world.heightAt(d.x, d.z);
      const r = Math.sqrt(Math.max(0, rule.n * rule.n - h * h));
      const near = r > 0 ? ctx.people.countIn(d.x, d.z, r, (q: Person) => q.faction === 'protest') : 0;
      st.over = near > 0 ? st.over + step : 0;
      if (st.over > rule.t) fail(`Drone à moins de ${rule.n} m de la foule.`);
      break;
    }
    case 'no_force':
      if (env.tracker.playerForceUses > 0) fail('Vous avez employé la force.');
      break;
    case 'no_blow':
      if (env.tracker.playerBlows > 0) fail(`${env.tracker.playerBlows} coup(s) porté(s).`);
      break;
    case 'grenade_limit': {
      const g = grenades(env);
      if (st.grenades0 < 0) st.grenades0 = g;
      const used = st.grenades0 - g;
      if (used > rule.n) fail(`${used} grenades tirées (${rule.n} au plus).`);
      break;
    }
    case 'stay_in_rank': {
      const me = ctx.player.person();
      const slots = ctx.service<{ distanceToSlot(id: number): number }>('police.slot');
      if (!me || !slots) break;
      const d = slots.distanceToSlot(me.id);
      st.over = d > rule.n ? st.over + step : 0;
      if (st.over > rule.t) fail(`Sorti du rang plus de ${rule.t} s d’affilée.`);
      break;
    }
    default:
      break;
  }
  return true;
}

/** Jugement de fin d'un objectif mesurable resté sans violation. false : pas de règle (jugé sur l'issue). */
export function concludeCustom(o: ObjectiveRun, env: EvalEnv, succeed: (note: string) => void, fail: (note: string) => void): boolean {
  const st = stateOf(o);
  const rule = st.rule;
  if (!rule) return false;
  switch (rule.kind) {
    case 'water_keep': {
      const w = water(env);
      if (w < 0) return false;
      if (w >= rule.n) succeed(`${Math.round(w)} l restants dans la cuve.`);
      else fail(`${Math.round(w)} l restants (plus de ${rule.n} l demandés).`);
      return true;
    }
    case 'water_use': {
      const w = water(env);
      if (w < 0 || st.water0 < 0) return false;
      const used = st.water0 - w;
      if (used <= rule.n) succeed(`${Math.round(used)} l consommés.`);
      else fail(`${Math.round(used)} l consommés (moins de ${rule.n} l demandés).`);
      return true;
    }
    case 'water_dry': succeed('Jamais à sec pendant un feu.'); return true;
    case 'vehicle_intact': succeed('Engin ramené en état.'); return true;
    case 'no_vehicle_loss': succeed('Aucune moto perdue.'); return true;
    case 'keep_distance_police': succeed(`Toujours à plus de ${rule.n} m des lignes de police.`); return true;
    case 'no_isolated': succeed('Aucun agent laissé isolé.'); return true;
    case 'drone_ceiling': succeed(`Drone resté sous ${rule.n} m.`); return true;
    case 'drone_crowd': succeed(`Drone toujours à plus de ${rule.n} m de la foule.`); return true;
    case 'no_force': succeed('Aucun emploi de la force.'); return true;
    case 'no_blow': succeed('Aucun coup porté.'); return true;
    case 'grenade_limit': succeed(`${Math.max(0, st.grenades0 - grenades(env))} grenades tirées.`); return true;
    case 'stay_in_rank': succeed('Toujours à sa place dans le rang.'); return true;
    default: return false;
  }
}
