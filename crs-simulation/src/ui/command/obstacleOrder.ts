/* =====================================================================================
 * Ordre « Dégager l'obstacle » (carte tactique, roue d'ordres) : un Centaure pousse hors de la voie le véhicule qui la
 * barre (service 'police.obstacle', src/sim/police/command/obstacle.ts). L'ordre va au Centaure de la sélection ; si
 * aucune unité choisie n'en est un, au Centaure libre le plus proche parmi ceux que le joueur commande.
 * ===================================================================================== */

import type { Squad } from '@/core/contracts';
import type { CommandCore, IssueResult } from './core';
import type { OrderGeom } from './orders';

/** Vue minimale du service 'police.obstacle'. */
interface ObstacleLike {
  request(x: number, z: number, options?: { byId?: number; squadId?: number; allow?: (squadId: number) => boolean }): { ok: boolean; squadId: number; name: string; reason: string };
}

/** Vue minimale du service 'police.command' : nature des unités spéciales. */
interface SpecialLike {
  special(squadId: number): { kind: string } | null;
}

export function issueObstacle(core: CommandCore, squads: readonly Squad[], geoms: readonly OrderGeom[] | null): IssueResult {
  const ctx = core.ctx;
  const g = geoms && geoms.length > 0 ? geoms[0]! : null;
  if (!g) return { ok: false, reason: 'Désignez le véhicule qui barre la voie.', count: 0 };
  const desk = ctx.service<ObstacleLike>('police.obstacle');
  if (!desk) return { ok: false, reason: 'Aucun Centaure joignable pour cette mission.', count: 0 };
  const cmd = ctx.service<SpecialLike>('police.command');
  const playerId = ctx.player.state.personId;
  let answer: { ok: boolean; squadId: number; name: string; reason: string } | null = null;
  // un Centaure désigné dans la sélection
  for (let i = 0; i < squads.length && !answer; i++) {
    const s = squads[i]!;
    if (!core.canCommand(s.id) || !cmd || cmd.special(s.id)?.kind !== 'centaure') continue;
    answer = desk.request(g.x, g.z, { byId: playerId, squadId: s.id });
  }
  // sinon le plus proche, libre, sous les ordres du joueur
  if (!answer) answer = desk.request(g.x, g.z, { byId: playerId, allow: (id) => core.canCommand(id) });
  if (!answer.ok) return { ok: false, reason: answer.reason === 'Aucun Centaure disponible.' ? 'Aucun Centaure disponible sous vos ordres.' : answer.reason, count: 0 };
  const from = core.callsign();
  const sector = ctx.world.sectorName(g.x, g.z);
  ctx.radio.say({
    channel: 'commandement', from, priority: 1, personId: playerId,
    text: `${answer.name.toUpperCase()} ICI ${from.toUpperCase()}. Dégagez l’obstacle${sector ? ', ' + sector : ''} : véhicule à pousser hors de la voie. PARLEZ.`,
  });
  ctx.audio.play('radio_bip');
  return { ok: true, reason: '', count: 1 };
}
