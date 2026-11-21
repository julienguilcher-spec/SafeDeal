// Ce que voit l'exécutant (CRS, BRAV-M, chef de groupe qui reçoit un ordre) : la carte « Ma mission » commence par
// l'ordre reçu — « ORDRE DU COMMANDANT » / « Tenir la ligne » / « Avenue de la République · 235 m » / « Vous : … » —
// et tient en deux lignes sur le téléphone, sans jamais couper l'ordre (la rue s'abrège d'abord). La pastille d'unité
// dit l'ordre avec les mots de la carte (« MISTRAL 1 ALFA · EN LIGNE », « SANS ORDRE »), jamais un type brut.
// Cas tirés des captures de l'inventaire (tel-crs-hud : « Ordre de MISTRAL (Command… 235 m / Tenir la ligne, Avenue de
// la Républi… »), puis une vraie partie : le commandant (IA) donne un ordre à la compagnie du CRS joueur.
import { describe, expect, it } from 'vitest';

import type { GameContext, Squad } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as traffic } from '@/sim/traffic';
import { createSystems as crowd } from '@/sim/crowd';
import { createSystems as police } from '@/sim/police';
import { createSystems as items } from '@/sim/items';
import { createSystems as props } from '@/sim/props';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as radio } from '@/gameplay/radio';
import { createSystems as session, MISSION_SERVICE } from '@/gameplay/session';
import type { MissionBrief } from '@/gameplay/session';
import type { MissionChief, MissionCommand } from '@/gameplay/session/mission-api';
import type { Instruction } from '@/gameplay/session/executant';
import { NO_ORDER_TAG, unitChipText, unitOrderTag } from '@/ui/command/hud';
import { ORDER_VERBS } from '@/ui/command/orders';
import { COMPACT_LINE_CHARS, chiefName, issuerTitle, orderHeadline, shortStreet } from '@/ui/hud/mission';
import type { HeadlineBrief } from '@/ui/hud/mission';

const NB = ' ';

function command(over: Partial<MissionCommand> = {}): MissionCommand {
  return {
    from: 'MISTRAL', by: 'Commandant Carlier', text: 'Tenir la ligne', to: 'Section MISTRAL 1', place: 'Avenue de la République',
    x: 200, z: 100, distance: 235, at: 12, ...over,
  };
}
const LINE: Instruction = {
  source: 'ordre', title: 'Tenir la ligne, Avenue de la République', detail: 'Restez à votre place dans la ligne, bouclier levé.', target: 'post', x: 200, z: 100,
};
const CAMARA: MissionChief = { id: 7, label: 'Brigadier-chef Camara', role: 'chef de groupe', x: 3, z: 4, distance: 5 };

function brief(over: Partial<HeadlineBrief> = {}): HeadlineBrief {
  return { command: command(), instruction: LINE, chief: CAMARA, status: '', regroup: false, ...over };
}

describe('carte de l’exécutant : l’ordre d’abord', () => {
  it('le titre nomme celui qui a donné l’ordre, par son grade', () => {
    expect(issuerTitle({ by: 'Commandant Carlier', from: 'MISTRAL' })).toBe('ORDRE DU COMMANDANT');
    expect(issuerTitle({ by: 'Capitaine Durand', from: 'MISTRAL' })).toBe('ORDRE DU CAPITAINE');
    expect(issuerTitle({ by: 'Commissaire Marchal', from: 'MISTRAL' })).toBe('ORDRE DU COMMISSAIRE');
    expect(issuerTitle({ by: 'Brigadier-chef Martin', from: 'MISTRAL 1 ALFA' })).toBe('ORDRE DU BRIGADIER-CHEF');
    // grade inconnu : l'indicatif de l'unité qui commande
    expect(issuerTitle({ by: '', from: 'MISTRAL' })).toBe('ORDRE DE MISTRAL');
    expect(issuerTitle({ by: 'Martin', from: 'CENTRAL' })).toBe('ORDRE DE CENTRAL');
    expect(issuerTitle({ by: '', from: '' })).toBe('ORDRE REÇU');
    expect(chiefName('Brigadier-chef Camara')).toBe('Camara');
    expect(chiefName('Gardien stagiaire Le Roux')).toBe('Le Roux');
    expect(chiefName('Camara')).toBe('Camara');
  });

  it('ordinateur : ordre, lieu et distance, puis ce que fait le joueur', () => {
    const h = orderHeadline(brief(), false);
    expect(h.head).toBe('ORDRE DU COMMANDANT');
    expect(h.order).toBe('Tenir la ligne');
    expect(h.place).toBe('Avenue de la République');
    expect(h.distance).toBe(`235${NB}m`);
    expect(h.you).toBe('Vous : restez à votre place dans la ligne, bouclier levé.');
    // consigne qui n'est pas l'ordre du groupe (embarquer, tâche) : elle-même, sans « Tâche : »
    const board = orderHeadline(brief({ instruction: { source: 'journee', title: 'Embarquez dans le fourgon MISTRAL 1 ALFA', detail: 'Montez à bord.', target: 'vehicle' } }), false);
    expect(board.you).toBe('Vous : embarquez dans le fourgon MISTRAL 1 ALFA');
    const task = orderHeadline(brief({ instruction: { source: 'incident', title: 'Tâche : Feu de poubelle', detail: 'Le repère vous y conduit.', target: 'incident', x: 1, z: 1 } }), false);
    expect(task.you).toBe('Vous : feu de poubelle');
  });

  it('téléphone : deux lignes, l’ordre jamais coupé, la rue abrégée d’abord', () => {
    const h = orderHeadline(brief(), true);
    expect(h.line1.startsWith('Tenir la ligne · ')).toBe(true);
    expect(h.line1).toBe(`Tenir la ligne · Av. de la République · 235${NB}m`);
    // une ligne courte garde la rue en entier
    expect(orderHeadline(brief({ command: command({ place: 'rue Royale' }) }), true).line1).toBe(`Tenir la ligne · rue Royale · 235${NB}m`);
    expect(`Tenir la ligne · rue Royale · 235${NB}m`.length).toBeLessThanOrEqual(COMPACT_LINE_CHARS);
    expect(h.line2).toBe(`Suivez Camara · 5${NB}m`);
    // rue très longue : l'ordre et la distance restent entiers, la rue s'abrège (l'écran ne coupe qu'elle)
    const long = orderHeadline(brief({ command: command({ text: 'Barrage filtrant', place: 'Rue du Faubourg Saint-Antoine', distance: 1240 }) }), true);
    expect(long.line1).toBe(`Barrage filtrant · Rue du Fg Saint-Antoine · 1,2${NB}km`);
    expect(long.order).toBe('Barrage filtrant');
    expect(long.place).toBe('Rue du Fg Saint-Antoine');
    // ordre long : jamais coupé, même sans place pour la rue
    const verb = 'Protéger l’extinction du véhicule en feu';
    const big = orderHeadline(brief({ command: command({ text: verb }) }), true);
    expect(big.line1.startsWith(verb)).toBe(true);
    expect(big.order).toBe(verb);
    // l'état du départ de la colonne passe avant le chef (il est pressé), et il est marqué comme tel
    const leaving = orderHeadline(brief({ status: 'Embarquement : 5 / 7 à bord — départ dès que tout le monde est à bord' }), true);
    expect(leaving.line2Status).toBe(true);
    expect(leaving.line2).toMatch(/^Embarquement : 5 \/ 7 à bord/);
    // éloigné de son groupe : « Rejoignez »
    expect(orderHeadline(brief({ regroup: true, chief: { ...CAMARA, distance: 46 } }), true).line2).toBe(`Rejoignez Camara · 46${NB}m`);
    expect(shortStreet('Boulevard Voltaire')).toBe('Bd Voltaire');
    expect(shortStreet('rue de Rivoli')).toBe('rue de Rivoli');
  });

  it('sans ordre d’en haut : la consigne prend la place de l’ordre', () => {
    const h = orderHeadline(brief({ command: null }), false, { x: 0, z: 0 });
    expect(h.head).toBe('ORDRE DU CHEF DE GROUPE');
    expect(h.order).toBe(LINE.title);
    expect(h.distance).toBe(`225${NB}m`);
    const wait = orderHeadline(brief({ command: null, chief: null, instruction: { source: 'attente', title: 'Attendez les ordres', detail: 'Restez près de vos collègues.', target: 'none' } }), true);
    expect(wait.head).toBe('MA MISSION');
    expect(wait.line1).toBe('Attendez les ordres');
    expect(wait.line2).toBe('Restez près de vos collègues.');
  });
});

describe('pastille d’unité : les mots de la carte', () => {
  it('« MISTRAL 1 ALFA · EN LIGNE », « SANS ORDRE », jamais le type brut', () => {
    expect(unitChipText('MISTRAL 1 ALFA', { type: 'ligne', targetId: 0 }, 9)).toBe('MISTRAL 1 ALFA · EN LIGNE');
    expect(unitOrderTag({ type: 'libre', targetId: 0 }, 9)).toBe(NO_ORDER_TAG);
    expect(unitOrderTag(null, 9)).toBe('SANS ORDRE');
    expect(unitOrderTag({ type: 'couper_circulation', targetId: -2 }, 9)).toBe('BARRE (PASSANTS)');
    expect(unitOrderTag({ type: 'couper_circulation', targetId: 0 }, 9)).toBe('BARRE');
    // « Suivez-moi à pied » devient l'ordre « suivre » sur le joueur : la pastille dit ce que fait l'unité
    expect(unitOrderTag({ type: 'suivre', targetId: 9 }, 9)).toBe('ME SUIT À PIED');
    expect(unitOrderTag({ type: 'suivre', targetId: 4 }, 9)).toBe('SUIT');
    expect(unitOrderTag({ type: 'ordre_inconnu', targetId: 0 }, 9)).toBe('ORDRE EN COURS');
    for (const v of ORDER_VERBS) {
      const tag = unitOrderTag({ type: v.type, targetId: 0 }, 9);
      expect(tag, v.type).toBe(v.type === 'libre' ? NO_ORDER_TAG : v.tag);
      expect(tag, v.type).not.toMatch(/_|INITIATIVE/);
    }
  });
});

describe('vraie partie : le commandant (IA) donne un ordre à la compagnie du CRS joueur', () => {
  const SIM = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, session];
  const MEANS = { sections: 2, fourgons: 6, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };

  function rootOf(ctx: GameContext, s: Squad | undefined): Squad | undefined {
    let c = s;
    for (let g = 0; c && c.parentId !== 0 && g < 8; g++) c = ctx.squads.get(c.parentId);
    return c;
  }

  it('« ORDRE DU … » (grade de l’IA), l’ordre, le lieu, la distance ; deux lignes au téléphone', async () => {
    const t = createTestContext({ seed: 31, strict: false, modules: SIM });
    await t.start({ mode: 'libre', role: 'crs', rank: 'gardien_stagiaire', place: 'Place de la Concorde', x: -10, z: 15, crowdSize: 300, tension: 0.3, volatility: 0.3, duration: 'standard', extra: { moyens: MEANS } } as never);
    const { ctx } = t;
    t.step(10);
    const b = ctx.service<MissionBrief>(MISSION_SERVICE)!;
    const me = ctx.player.person()!;
    const company = rootOf(ctx, ctx.squads.get(me.squadId))!;
    const leader = ctx.people.get(company.leaderId)!;
    expect(leader).toBeDefined();
    // ligne de barrage 230 m plus loin, donnée par le chef de la compagnie
    ctx.squads.issue(company.id, { type: 'ligne', x: me.x + 230, z: me.z, heading: 0, width: 0, issuedBy: company.leaderId });
    t.step(1);
    const c = b.command!;
    expect(c).toBeTruthy();
    const full = orderHeadline(b, false, me);
    const small = orderHeadline(b, true, me);
    console.log(`${full.head} | ${full.order} | ${full.place} · ${full.distance} | ${full.you} || téléphone : « ${small.line1} » / « ${small.line2} » (by « ${c.by} »)`);
    expect(full.head).toBe(issuerTitle(c));
    expect(full.head).toMatch(/^ORDRE D(U|E) [A-ZÀ-Ü' -]+$/u);
    if (c.by !== '') expect(full.head).toBe(`ORDRE DU ${c.by.split(' ')[0]!.toUpperCase()}`);
    expect(full.order).toBe('Tenir la ligne');
    expect(full.place).toBe(c.place);
    expect(full.distance).toMatch(/^2\d\d m$/);
    expect(small.line1.startsWith('Tenir la ligne')).toBe(true);
    expect(small.line2).not.toBe('');
  }, 300000);
});
