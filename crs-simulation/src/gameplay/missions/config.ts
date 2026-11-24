/* =====================================================================================
 * MISSIONS — passage d'une fiche du catalogue (MissionDef) à une configuration de session.
 *
 * La page d'accueil lit le service 'missions' (catalogue) et applique `config` quand le joueur choisit
 * une mission ; ce fichier traduit la fiche dans le vocabulaire des modules : lieu et parcours résolus sur
 * la carte, familles de la foule ramenées à celles du module de foule, cause, moyens engagés, vent.
 * Simulation pure : aucun DOM.
 * ===================================================================================== */

import type { SessionConfig, WorldQuery } from '@/core/contracts';
import type { MissionDef } from '@/core/missions-schema';

/** Familles du catalogue → familles connues du module de foule (src/sim/crowd/api.ts, FAMILIES). */
const FAMILY_MAP: Readonly<Record<string, string>> = {
  divers: 'divers', curieux: 'divers', supporters: 'divers', fetards: 'divers', riverains: 'divers', militants: 'divers',
  gilets_jaunes: 'gilets_jaunes', syndical: 'syndical', etudiants: 'etudiants', lyceens: 'etudiants',
  climat: 'climat', soignants: 'soignants', agriculteurs: 'agriculteurs', retraites: 'retraites',
  familles: 'familles', black_bloc: 'black_bloc',
};

/** Causes du catalogue → causes du module des archétypes (src/sim/roles/archetypes/causes-data-*.ts). */
const CAUSE_MAP: Readonly<Record<string, string>> = { agricole: 'agriculture' };

/** Familles de la foule pour le module de foule ; la part de black bloc couvre au moins la part de radicaux. */
export function missionComposition(def: MissionDef): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(def.crowd.families)) {
    const f = FAMILY_MAP[k] ?? 'divers';
    if (Number.isFinite(v) && v > 0) out[f] = (out[f] ?? 0) + v;
  }
  const bloc = out['black_bloc'] ?? 0;
  if (def.crowd.radicalShare > bloc) out['black_bloc'] = def.crowd.radicalShare;
  return out;
}

export function missionCause(def: MissionDef): string {
  const c = def.crowd.cause;
  return CAUSE_MAP[c] ?? c;
}

/** Parcours déclaré en coordonnées (tableau plat) quand tous ses lieux sont connus de la carte ; sinon vide. */
export function resolveRoute(def: MissionDef, world: WorldQuery | null): number[] {
  if (!world || def.crowd.route.length < 2) return [];
  const pts: number[] = [];
  for (const name of def.crowd.route) {
    const p = world.placeByName(name);
    if (!p) return [];
    const n = pts.length;
    // deux lieux confondus (rue et place homonymes) : un seul point
    if (n >= 2 && Math.hypot(pts[n - 2]! - p.x, pts[n - 1]! - p.z) < 15) continue;
    pts.push(p.x, p.z);
  }
  return pts.length >= 4 ? pts : [];
}

/**
 * Configuration de session pour une mission. `world` sert à résoudre le lieu et le parcours ; sans carte prête,
 * le nom du lieu suffit (la session le résoudra au lancement) et le module de foule choisit son parcours.
 */
export function missionConfig(def: MissionDef, world: WorldQuery | null): Partial<SessionConfig> {
  const f = def.forces;
  const extra: Record<string, unknown> = {
    composition: missionComposition(def),
    moyens: {
      sections: f.sections, fourgons: f.fourgons, centaure: f.centaure, canon_eau: f.canonEau, bravm: f.bravm,
      drone: f.drone ? 1 : 0, pompiers: f.pompiers, samu: f.samu, secours_sur_appel: true,
    },
    // vent en km/h, venant de `windFrom` degrés (0 = nord)
    vent: { direction: def.windFrom, vitesse: def.windSpeed * 3.6 },
    'mission.metroShare': def.crowd.metroShare,
  };
  const cause = missionCause(def);
  if (cause) extra['cause'] = cause;
  if (def.poste) extra['poste'] = def.poste;
  if (def.crowd.size <= 0) extra['crowd.none'] = true;
  const route = resolveRoute(def, world);
  if (route.length >= 4) extra['crowd.route'] = route;
  const cfg: Partial<SessionConfig> = {
    mode: 'libre',
    missionId: def.id,
    role: def.role,
    rank: def.rank,
    place: def.place,
    timeOfDay: def.timeOfDay,
    weather: def.weather,
    crowdSize: Math.max(0, def.crowd.size),
    tension: def.crowd.tension,
    volatility: def.crowd.volatility,
    duration: def.duration,
    extra,
  };
  const at = world ? world.placeByName(def.place) : null;
  if (at) {
    cfg.x = at.x;
    cfg.z = at.z;
  }
  return cfg;
}
