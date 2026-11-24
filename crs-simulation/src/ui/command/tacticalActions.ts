/* =====================================================================================
 * Carte tactique — actions de terrain hors ordres aux unités : couper et rouvrir la circulation,
 * appeler les secours, déléguer un incident à une unité. Chaque action passe par le service étendu
 * correspondant (absent : sans effet), prévient le joueur et laisse une trace à la radio.
 * ===================================================================================== */

import type { RescueKind, RoadClosure } from '@/core/extensions';
import type { MapUnit } from '../maps/units';
import type { CommandCore } from './core';
import { INCIDENT_KIND_LABELS, meansOfSymbol } from './incidents';
import { radioFrame, rescueRequest } from './phrases';
import { IDLE } from './tacticalState';
import type { TacticalState } from './tacticalState';

export class FieldActions {
  /**
   * @param selected  unités sélectionnées que le joueur commande (celle qui tiendra un barrage, par exemple)
   */
  constructor(
    private readonly core: CommandCore, private readonly state: TacticalState, private readonly selected: () => MapUnit[],
  ) {}

  closeRoad(x: number, z: number): void {
    const core = this.core;
    const traffic = core.traffic;
    if (!traffic || !core.scope().canTraffic) return;
    const units = this.selected();
    const holder = units.length === 1 ? units[0]! : null;
    const c = traffic.closeRoad(x, z, core.ctx.player.state.personId, holder ? holder.squadId : 0);
    if (!c) {
      core.ctx.ui.notify('Aucune rue à fermer à cet endroit.', 'warn', 3);
      return;
    }
    const name = this.closureName(c);
    core.ctx.ui.notify(`Circulation coupée\u00a0: ${name}${holder ? ` — barrage tenu par ${holder.name}` : ''}`, 'ok', 3.5);
    core.ctx.radio.say({
      channel: 'commandement', from: core.callsign(), priority: 1, personId: core.ctx.player.state.personId,
      text: radioFrame('CENTRAL', core.callsign(), `Circulation coupée, ${name}${holder ? `, barrage tenu par ${holder.name}` : ''}`, false),
    });
    this.state.focusClosure = c.id;
    this.state.touch();
  }

  closeArea(x: number, z: number, radius: number): void {
    const core = this.core;
    const traffic = core.traffic;
    if (!traffic || !core.scope().canTraffic) return;
    const list = traffic.closeArea(x, z, radius, core.ctx.player.state.personId);
    const sector = core.ctx.world.sectorName(x, z);
    if (list.length === 0) core.ctx.ui.notify('Aucune rue n’entre dans ce périmètre.', 'warn', 3);
    else {
      core.ctx.ui.notify(`Périmètre fermé\u00a0: ${list.length} accès coupés autour de ${sector || 'ce point'}`, 'ok', 3.5);
      core.ctx.radio.say({
        channel: 'commandement', from: core.callsign(), priority: 1, personId: core.ctx.player.state.personId,
        text: radioFrame('CENTRAL', core.callsign(), `Périmètre de circulation fermé${sector ? `, ${sector}` : ''}, rayon ${Math.round(radius)} mètres`, false),
      });
    }
    this.state.setMode(IDLE);
  }

  closureName(c: RoadClosure): string {
    const e = this.core.ctx.world.edge(c.edgeId);
    if (e && e.name) return e.name;
    return this.core.ctx.world.sectorName(c.x, c.z) || 'voie sans nom';
  }

  callRescue(kind: RescueKind, x: number, z: number, incidentId: number): void {
    const core = this.core;
    const rescue = core.rescue;
    if (!rescue || !core.scope().canDelegate) return;
    const ctx = core.ctx;
    const call = rescue.request(kind, x, z, ctx.player.state.personId, incidentId !== 0 ? incidentId : undefined);
    const eta = Math.max(0, Math.round(call.eta));
    const label = kind === 'pompiers' ? 'Pompiers' : 'SAMU';
    ctx.ui.notify(`${label} demandés — arrivée estimée dans ${Math.floor(eta / 60)}\u00a0min\u00a0${eta % 60 < 10 ? '0' : ''}${eta % 60}`, 'ok', 4);
    ctx.radio.say({
      channel: 'secours', from: core.callsign(), priority: 2, personId: ctx.player.state.personId,
      text: rescueRequest(core.callsign(), ctx.world.sectorName(x, z), kind),
    });
    this.state.setTab('incidents');
  }

  /** L'unité peut-elle recevoir un incident de la part du joueur ? */
  canReceive(u: MapUnit): boolean {
    const sc = this.core.scope();
    if (!sc.canDelegate) return false;
    if (u.squadId === 0) return false;
    if (u.faction === 'rescue') return sc.level === 'tout';
    return this.core.canCommand(u.squadId);
  }

  /** Délègue un incident à une unité (glisser-déposer, bouton « Confier à la sélection »). */
  assignToUnit(incidentId: number, u: MapUnit): boolean {
    const core = this.core;
    const api = core.incidents;
    const inc = api?.get(incidentId);
    if (!api || !inc) return false;
    const means = meansOfSymbol(u.symbol);
    const ok = api.assign(incidentId, means, u.squadId);
    const ctx = core.ctx;
    if (!ok) {
      ctx.ui.notify(`${u.name} ne peut pas traiter «\u00a0${INCIDENT_KIND_LABELS[inc.kind] ?? inc.label}\u00a0».`, 'warn', 4);
      ctx.audio.play('ui_alerte');
      return false;
    }
    ctx.ui.notify(`${inc.label} — confié à ${u.name}`, 'ok', 3);
    ctx.radio.say({
      channel: 'commandement', from: core.callsign(), priority: inc.urgency >= 3 ? 2 : 1, personId: ctx.player.state.personId,
      text: radioFrame(u.name, core.callsign(), `${inc.label}. Vous en êtes chargé, rendez compte`, true),
    });
    this.state.touch();
    return true;
  }
}
