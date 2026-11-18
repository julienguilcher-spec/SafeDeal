/* =====================================================================================
 * Carte de commandement — COMMISSARIATS, branchement sur la partie (service 'police.commissariats').
 *
 * La station est une source d'unités (Qui) qu'on désigne comme n'importe quel repère (design-commande.md, §7.3) :
 *   installCommissariats()     une fois, quand le module des commissariats est branché (CommandSystem.init) :
 *                              « Rentrer au commissariat » au catalogue, environnement des fiches (stations, commissariat
 *                              d'attache des unités), fiche du commissariat retouchée, « Plus… › Commissariats »,
 *                              couche « Commissariats » de « Affichage de la carte » ;
 *   fillStations(env, core)    CardEnv.stations et l'état des unités venues d'un poste (« rentre au commissariat du 9e ») ;
 *   stationCandidates(core, …) les unités prêtes de tous les postes pour la liste Qui (« Renforts des commissariats ») ;
 *   stationWhoAt(core, qui, …) Qui « depuis le commissariat » recalculé pour le lieu visé (« OÙ L'ENVOYER ? ») ;
 *   travelTimes(ctx)           trajets estimés par les rues (deux-tons), mis en cache 5 s par site et par case de 50 m.
 * Sans le service (module absent, mode éditeur ou essai, extra.commissariats = false), rien n'est ajouté.
 * ===================================================================================== */

import type { GameContext } from '@/core/contracts';
import type { CommissariatView } from '@/gameplay/commissariats/api';
import type { PatrolsApi } from '@/gameplay/patrols/api';
import { commissariatById } from '@/world/commissariats';
import { isPoliceRole } from '../maps/visibility';
import type { CardEnv, CardUnit, WhoCandidate } from './cardTypes';
import {
  cardStation, dispatchable, entryKey, restText, stationAt, stationCandidate, stationCard, stationHome,
} from './commissariatsModel';
import type { CommandCore } from './core';
import { DRIVE_SPEED, defaultCardBuilder, registerCardBuilder } from './intents';
import { ensureStationVerb } from './orders';
import { mountCommissariatsPanel } from './panelCommissariats';
import { registerMapLayer, registerMoreSection } from './panelMore';
import { registerCardEnvHook } from './reperes';

// ───────────────────────────── trajets ─────────────────────────────

/** Sortie des places (embarquement fait, départ échelonné) avant de rouler (s). */
const DEPART_DELAY = 20;
/** Case du cache (m), durée de vie d'un trajet (s de partie), taille maximale du cache. */
const CELL = 50;
const TTL = 5;
const CACHE_MAX = 256;
/** En deçà (m), la distance à vol d'oiseau suffit. */
const NEAR = 40;
/** Itinéraire introuvable : détour moyen des rues de Paris. */
const DETOUR = 1.4;

/** Trajets en véhicule d'un site à un point : distance par les rues et délai deux-tons, mis en cache. */
export class TravelTimes {
  private readonly cache = new Map<string, { t: number; distance: number; eta: number }>();
  private readonly path: number[] = [];

  constructor(private readonly ctx: GameContext) {}

  get(view: Pick<CommissariatView, 'id' | 'returnX' | 'returnZ'>, x: number, z: number): { distance: number; eta: number } {
    const key = `${view.id}|${Math.round(x / CELL)}|${Math.round(z / CELL)}`;
    const now = this.ctx.clock.now;
    const hit = this.cache.get(key);
    if (hit && now >= hit.t && now - hit.t < TTL) return hit;
    const straight = Math.hypot(x - view.returnX, z - view.returnZ);
    let distance = straight;
    if (straight > NEAR) {
      distance = straight * DETOUR;
      const world = this.ctx.world;
      try {
        if (world.edgeCount > 0 && world.findPath(view.returnX, view.returnZ, x, z, 'vehicle', this.path)) {
          let len = 0;
          for (let i = 2; i + 1 < this.path.length; i += 2) {
            len += Math.hypot(this.path[i]! - this.path[i - 2]!, this.path[i + 1]! - this.path[i - 1]!);
          }
          if (len > 0) distance = Math.max(straight, len);
        }
      } catch {
        /* graphe indisponible : détour moyen */
      }
    }
    const r = { t: now, distance, eta: DEPART_DELAY + distance / DRIVE_SPEED };
    if (this.cache.size >= CACHE_MAX) this.cache.clear();
    this.cache.set(key, r);
    return r;
  }
}

const TRAVEL = new WeakMap<GameContext, TravelTimes>();

export function travelTimes(ctx: GameContext): TravelTimes {
  let t = TRAVEL.get(ctx);
  if (!t) {
    t = new TravelTimes(ctx);
    TRAVEL.set(ctx, t);
  }
  return t;
}

// ───────────────────────────── environnement des fiches ─────────────────────────────

/** Le joueur voit les commissariats (policier) et le module est actif. */
function stationsVisible(core: CommandCore): boolean {
  return !!core.commissariats && isPoliceRole(core.ctx.player.state.role);
}

/** Point de référence des distances : le joueur, sinon la foule principale, sinon aucun. */
function referenceOf(env: CardEnv): { x: number; z: number } | null {
  if (env.player) return { x: env.player.x, z: env.player.z };
  const main = env.crowds.find((c) => c.main) ?? env.crowds[0];
  return main ? { x: main.x, z: main.z } : null;
}

/**
 * Complète l'environnement des fiches : les sites (CardEnv.stations), et pour chaque unité venue d'un poste son
 * commissariat d'attache et son état (« rentre au commissariat du 9e », « au repos … — encore 1:20 »).
 */
export function fillStations(env: CardEnv, core: CommandCore): void {
  const api = core.commissariats;
  if (!api || !stationsVisible(core)) return;
  const ctx = core.ctx;
  const tt = travelTimes(ctx);
  const ref = referenceOf(env);
  const cfg = ctx.session.config;
  const renforts = !(cfg && cfg.extra && cfg.extra['renforts'] === false);
  const patrols = ctx.service<PatrolsApi>('police.patrols');
  const isPatrol = (id: number): boolean => !!patrols && typeof patrols.isPatrol === 'function' && patrols.isPatrol(id);
  const now = ctx.clock.now;
  env.stations = api.list.map((v) => cardStation(v, {
    now, ref, travel: (_id, x, z) => tt.get(v, x, z), renforts, isPatrol, streetOf: (id) => commissariatById(id)?.street ?? '',
  }));
  let changed = false;
  const units: CardUnit[] = env.units.map((u) => {
    if (u.squadId <= 0) return u;
    const e = api.entryOf(u.squadId);
    const view = e ? api.get(e.commissariatId) : undefined;
    if (!e || !view) return u;
    changed = true;
    const at = stationAt(view);
    switch (e.state) {
      case 'retour':
        return {
          ...u, homeStation: stationHome(view), orderPlace: at,
          order: { type: 'retour_poste', x: view.returnX, z: view.returnZ, targetId: 0, issuedAt: u.order ? u.order.issuedAt : now },
        };
      case 'repos':
        // déjà rentrée : « Rentrer au commissariat » passe dans « Autres ordres ici… »
        return { ...u, homeStation: '', order: null, status: `au repos ${at} — encore ${restText(e.restUntil - now)}` };
      case 'au_poste':
        return { ...u, homeStation: '', order: null, status: `au poste ${at} — prête` };
      case 'alerte':
        return { ...u, homeStation: stationHome(view), status: u.order ? u.status : `en alerte ${at}, équipage à bord` };
      default:
        return { ...u, homeStation: stationHome(view) };
    }
  });
  if (changed) env.units = units;
}

// ───────────────────────────── Qui ─────────────────────────────

/** Unités prêtes (ou en alerte) de tous les postes, la plus rapide au lieu visé d'abord ; [] si le joueur ne peut pas engager. */
export function stationCandidates(core: CommandCore, where?: { x: number; z: number }): WhoCandidate[] {
  const api = core.commissariats;
  if (!api || !api.canDispatch) return [];
  const tt = travelTimes(core.ctx);
  const out: { c: WhoCandidate; i: number }[] = [];
  for (const v of api.list) {
    for (const e of v.entries) {
      if (!dispatchable(e)) continue;
      const tr = where ? tt.get(v, where.x, where.z) : { distance: 0, eta: 0 };
      out.push({ c: stationCandidate(v, e, tr), i: out.length });
    }
  }
  out.sort((a, b) => a.c.eta - b.c.eta || a.i - b.i);
  return out.map((o) => o.c);
}

/** Qui « depuis le commissariat » (OÙ L'ENVOYER ?) : délai et distance recalculés pour le lieu visé. */
export function stationWhoAt(core: CommandCore, who: WhoCandidate, where: { x: number; z: number }): WhoCandidate {
  if (who.fromStation === undefined) return who;
  const api = core.commissariats;
  const key = entryKey(who.fromStation);
  const e = api && key ? api.entry(key) : undefined;
  const view = e && api ? api.get(e.commissariatId) : undefined;
  if (!view) return who;
  const tr = travelTimes(core.ctx).get(view, where.x, where.z);
  return { ...who, eta: tr.eta, distance: tr.distance };
}

/**
 * Ce que l'environnement de Qui (bestUnit.whoEnvFromCore) reçoit des commissariats : les unités au poste, en alerte ou
 * au repos écartées des propositions, de « Toute la compagnie » et de la nasse ; les unités prêtes des postes en
 * « Renforts des commissariats ».
 */
export function stationWhoExt(core: CommandCore): { exclude: (squadId: number) => boolean; stationCandidates: (where?: { x: number; z: number }) => WhoCandidate[] } {
  return { exclude: (id) => core.atPost(id), stationCandidates: (where) => stationCandidates(core, where) };
}

// ───────────────────────────── installation ─────────────────────────────

let installed = false;

/** Branche les commissariats dans la carte de commandement (une seule fois ; sans effet sans le module). */
export function installCommissariats(): void {
  if (installed) return;
  installed = true;
  ensureStationVerb();
  registerCardEnvHook(fillStations);
  registerCardBuilder('commissariat', (r, env, intent) => stationCard(defaultCardBuilder(r, env, intent), r, env));
  registerMoreSection({
    id: 'commissariats', label: 'Commissariats', key: 'KeyC', icon: 'flag', sub: 'les unités de chaque poste et leur état',
    available: (core) => stationsVisible(core),
    mount: (host, core, api) => mountCommissariatsPanel(host, core, api, (id, x, z) => {
      const v = core.commissariats?.get(id);
      return v ? travelTimes(core.ctx).get(v, x, z) : { distance: 0, eta: 0 };
    }),
  });
  registerMapLayer('commissariats', 'Commissariats');
}
