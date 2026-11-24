// Compte rendu d'une section à qui son propre chef (membre de son groupe de commandement) a donné l'ordre : elle rend
// compte à l'échelon au-dessus d'elle, jamais à l'un de ses propres groupes (« FILTRE CHARLIE ICI FILTRE »).
import { describe, expect, it } from 'vitest';

import type { SquadOrder } from '@/core/contracts';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as law } from '@/gameplay/law';
import { unitOf } from '@/sim/police/brain';
import { ackBody, isAckText, onPointBody, replyFlag, REPLY_WINDOW, roundSpoken, superior } from '@/sim/police/radio';
import { startPolice } from '@/sim/police/testkit';

describe('destinataire du compte rendu', () => {
  it('ordre donné par le chef de section (membre d’un groupe de la section) : compte rendu au-dessus de la section', async () => {
    const pt = await startPolice([world, people, law], { mode: 'test', x: 0, z: -100 });
    const { ctx } = pt;
    const cie = pt.units.createCompany({ x: 0, z: -95, heading: Math.PI, vehicles: false, callsign: 'MISTRAL' });
    const sec = cie.sections[0]!;
    pt.step(1);
    const chief = ctx.people.get(sec.leaderId)!;
    // le chef de section est rangé dans un groupe de sa section
    expect(chief.squadId).not.toBe(sec.id);
    expect(ctx.squads.get(chief.squadId)!.parentId).toBe(sec.id);
    const order = { ...sec.order, type: 'interpeller', issuedBy: chief.id } as SquadOrder;
    const to = superior(pt.system.k, unitOf(sec)!, order);
    console.log('compte rendu de', sec.name, 'à', to);
    expect(to).toBe('MISTRAL');
    // un groupe dont le chef a donné l'ordre rend compte à sa section
    const grp = ctx.squads.get(chief.squadId)!;
    expect(superior(pt.system.k, unitOf(grp)!, order)).toBe(sec.name);
  });

  it('ordre du JOUEUR (byPlayer) : le compte rendu lui revient — sa fonction s’il a donné l’ordre à sa propre unité', async () => {
    const pt = await startPolice([world, people, law], { mode: 'test', x: 0, z: -100 });
    const { ctx } = pt;
    const cie = pt.units.createCompany({ x: 0, z: -95, heading: Math.PI, vehicles: false, callsign: 'MISTRAL' });
    const sec = cie.sections[0]!;
    pt.step(1);
    const chief = ctx.people.get(sec.leaderId)!;
    ctx.player.possess(chief.id, 'chef_groupe');
    const grp = ctx.squads.get(chief.squadId)!;
    const mine = (s: typeof sec) => ({ ...s.order, type: 'tenir', issuedBy: chief.id, byPlayer: true } as SquadOrder);
    // le chef de section joueur ordonne à sa section : « CHEF MISTRAL 1 ICI MISTRAL 1 », pas « MISTRAL ICI … »
    expect(superior(pt.system.k, unitOf(sec)!, mine(sec))).toBe('CHEF ' + sec.name);
    // à l'un de ses groupes : le groupe rend compte à la section qu'il commande
    const other = ctx.squads.childrenOf(sec.id).find((g) => g.id !== grp.id)!;
    expect(superior(pt.system.k, unitOf(other)!, mine(other))).toBe(sec.name);
    // le même ordre sans byPlayer (colonne, adjoint) garde l'ancienne règle
    expect(superior(pt.system.k, unitOf(sec)!, { ...mine(sec), byPlayer: undefined })).toBe('MISTRAL');
  });

  it('commandant joueur : sa compagnie lui rend compte en « AUTORITÉ », jamais à CENTRAL', async () => {
    const pt = await startPolice([world, people, law], { mode: 'test', x: 0, z: -100 });
    const { ctx } = pt;
    const cie = pt.units.createCompany({ x: 0, z: -95, heading: Math.PI, vehicles: false, callsign: 'MISTRAL' });
    pt.step(1);
    const company = ctx.squads.get(cie.squad.id)!;
    const cdt = ctx.people.get(company.leaderId)!;
    ctx.player.possess(cdt.id, 'commandant');
    const o = { ...company.order, type: 'tenir', issuedBy: cdt.id, byPlayer: true } as SquadOrder;
    expect(superior(pt.system.k, unitOf(company)!, o)).toBe('AUTORITÉ');
    const sec = cie.sections[1]!;
    expect(superior(pt.system.k, unitOf(sec)!, { ...o })).toBe(company.name);
  });
});

describe('accusé de réception d’un ordre du joueur', () => {
  it('replyFlag : seulement un accusé ou un refus, d’un ordre du joueur, dans les secondes qui suivent', () => {
    const o = { type: 'tenir', x: 0, z: 0, heading: 0, width: 0, targetId: 0, maxForce: 1, issuedAt: 10, issuedBy: 3, byPlayer: true } as SquadOrder;
    const ack = 'ICI MISTRAL UN. REÇU, je tiens la position. TERMINÉ.';
    const neg = 'ICI MISTRAL UN. NÉGATIF. Aucun binôme d’interpellation disponible. TERMINÉ.';
    expect(isAckText(ack)).toBe(true);
    expect(isAckText(neg)).toBe(true);
    expect(isAckText('ICI FAUCON UN-DEUX. REÇU, en colonne vers le point. TERMINÉ.')).toBe(true);
    expect(isAckText('MISTRAL ICI MISTRAL UN. Barrage en place. PARLEZ.')).toBe(false);
    expect(isAckText('ICI MISTRAL UN. REÇUS cinq renforts.')).toBe(false);
    expect(replyFlag(o, 10.3, ack)).toBe(true);
    expect(replyFlag(o, 10.3, neg)).toBe(true);
    expect(replyFlag(o, 10 + REPLY_WINDOW + 0.1, ack)).toBe(false);
    expect(replyFlag(o, 10.3, 'MISTRAL ICI MISTRAL UN. Barrage en place. PARLEZ.')).toBe(false);
    expect(replyFlag({ ...o, byPlayer: undefined }, 10.3, ack)).toBe(false);
    expect(replyFlag(null, 10.3, ack)).toBe(false);
  });

  it('la distance de l’accusé est celle de l’ordre (même arrondi que la phrase d’ordre), « sur le point » pour Avancer', async () => {
    expect([4, 12, 41, 44, 46, 140, 260, 430].map(roundSpoken)).toEqual([4, 10, 40, 40, 50, 150, 250, 400]);
    expect(onPointBody('rue de Rivoli', true, 0, 12)).toBe('Sur le point, rue de Rivoli, en ligne face sud, UN-DEUX à pied');
    expect(onPointBody('', false, 0, 12, 3)).toBe('Sur le point, en colonne par trois');
    const pt = await startPolice([world, people, law], { mode: 'test', x: 0, z: -100 });
    const { ctx } = pt;
    const cie = pt.units.createCompany({ x: 0, z: -95, heading: Math.PI, vehicles: false, callsign: 'MISTRAL' });
    const sec = cie.sections[0]!;
    pt.step(1);
    const lead = ctx.people.get(sec.leaderId)!;
    // point à 41 m du chef : la phrase d'ordre dit « QUATRE-ZÉRO » ; l'accusé aussi, même mesuré d'ailleurs (centre)
    ctx.squads.issue(sec.id, { type: 'avancer', x: lead.x + 41, z: lead.z, heading: Math.PI / 2, width: 0 });
    expect(ackBody(pt.system.k, sec.order, 47)).toBe('en avant, QUATRE-ZÉRO mètres');
  });
});
