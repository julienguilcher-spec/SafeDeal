// Ordres directs — LE MOTEUR DU TERRAIN (direct/runtime.ts, service 'command.direct') sur la vraie carte (place de la
// Concorde, graine 21, commandant) : le ticket existe à l'appui même, l'ordre donné est celui qui était affiché (jamais
// un ordre recalculé à l'appui), le choix « À qui » vaut pour un seul ordre, ⌫ rend l'ordre d'avant, la garde de
// 0,6 s (écran fermé, double appui), la surveillance (unité qui n'avance plus → « bloqué … ils finissent à pied »),
// les refus de la simulation dits en clair, l'indicatif du joueur à sa propre unité, « Avec moi » (A).
import { beforeAll, describe, expect, it } from 'vitest';

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
import { createSystems as session } from '@/gameplay/session';
import { createSystems as maps } from '@/ui/maps';
import { createSystems as command, DIRECT_SERVICE } from '@/ui/command';
import type { CommandCore, DirectApi, DirectRuntime } from '@/ui/command';
import type { Person, Squad } from '@/core/contracts';
import { GUARD_TIME, UNDO_WINDOW, WATCH_WINDOW } from '@/ui/command/direct/runtime';
import { designationAt, distText, placeWithArticle, simRefusal, ticketText, type Designation } from '@/ui/command/direct';

const MODULES = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, session, maps, command];
const MEANS = { sections: 3, fourgons: 9, centaure: 1, canon_eau: 1, bravm: 1, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };

interface Game { t: ReturnType<typeof createTestContext>; core: CommandCore; direct: DirectApi & DirectRuntime; me: Person; notes: string[] }

let game: Game;

async function concorde(): Promise<Game> {
  const t = createTestContext({ seed: 21, strict: false, modules: MODULES });
  await t.start({
    mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place de la Concorde', x: -10, z: 15,
    crowdSize: 300, tension: 0.4, volatility: 0.3, duration: 'standard', extra: { moyens: MEANS, variante: 'terrain' },
  } as never);
  t.step(3);
  const core = t.ctx.service<CommandCore>('ui.command')!;
  const direct = t.ctx.service<DirectApi & DirectRuntime>(DIRECT_SERVICE)!;
  const notes: string[] = [];
  const notify = t.ctx.ui.notify.bind(t.ctx.ui);
  t.ctx.ui.notify = (text, kind, s) => {
    notes.push(text);
    notify(text, kind, s);
  };
  return { t, core, direct, me: core.player()!, notes };
}

/** Point du sol à `d` m du joueur dans la direction `a` (rad). */
function ground(a: number, d: number): Designation {
  return designationAt(game.core, game.me.x + Math.sin(a) * d, game.me.z + Math.cos(a) * d);
}

/** Une rue sans foule entre 40 et 120 m du joueur (règle g), en écartant les directions `skip`. */
function street(skip: readonly number[] = []): { des: Designation; name: string; a: number } {
  const env = game.direct.env();
  for (const d of [40, 60, 80, 100, 120]) {
    for (let k = 0; k < 16; k++) {
      const a = (k * Math.PI) / 8;
      if (skip.some((s) => Math.abs(s - a) < 0.5)) continue;
      const des = ground(a, d);
      const road = env.roadAt(des.x, des.z, 25);
      if (road && env.demonstratorsAt(des.x, des.z, 15).count < 8 && !env.rescueAt(des.x, des.z, 10)) return { des, name: road.name, a };
    }
  }
  throw new Error('aucune rue proche');
}

function squad(id: number): Squad {
  return game.t.ctx.squads.get(id)!;
}

/** Laisse passer la garde de 0,6 s entre deux ordres. */
function pause(): void {
  game.t.step(GUARD_TIME + 0.1);
}

beforeAll(async () => {
  game = await concorde();
}, 300000);

describe('moteur des ordres directs (Concorde, graine 21, commandant)', () => {
  it('le service est publié et lit le poste : commandant, ordre prêt sur une rue', () => {
    expect(game.direct).toBeTruthy();
    const s = street();
    game.direct.setDesignation(s.des);
    const n = game.direct.ready()!;
    expect(n.rule).toBe('g');
    expect(n.text.startsWith(`Bloquer ${placeWithArticle(s.name)} · `)).toBe(true);
    expect(n.enabled).toBe(true);
  });

  it('Entrée : l’ordre part tout de suite (ticket « reçu » à l’appui même, byPlayer), puis « en route »', () => {
    const s = street();
    game.direct.setDesignation(s.des);
    const n = game.direct.ready()!;
    const id = n.who!.squadIds[0]!;
    const t0 = game.t.ctx.clock.now;
    const r = game.direct.give();
    expect(r.ok, r.text).toBe(true);
    expect(r.squads).toEqual([id]);
    // synchrone : le ticket existe avant tout pas de simulation
    const tk = game.direct.ticketOf(id)!;
    expect(tk).toBeTruthy();
    expect(tk.state).toBe('recu');
    expect(tk.issuedAt).toBe(t0);
    expect(tk.verb).toBe('bloquer');
    expect(ticketText(tk)).toBe(`${squad(id).name} · Bloquer ${tk.place} · reçu`);
    const o = squad(id).order;
    expect(o.byPlayer).toBe(true);
    expect(o.type).toBe('couper_circulation');
    // l'ordre du joueur est retenu tel quel (ligne d'état, À qui, annulation)
    const po = game.core.playerOrder(id)!;
    expect(po.verb).toBe('bloquer');
    expect(po.type).toBe('couper_circulation');
    expect(po.place).not.toBe('');
    // une seconde plus tard, l'unité y va : le ticket le dit (ou elle est déjà en place)
    game.t.step(2);
    const later = game.direct.ticketOf(id)!;
    expect(['route', 'attente', 'en_place']).toContain(later.state);
    if (later.state === 'route') expect(ticketText(later)).toMatch(new RegExp(`^${squad(id).name} · Bloquer .+ · en route — \\d+\u00a0m$`));
  });

  it('l’ordre donné est l’ordre AFFICHÉ : la ligne change au plus toutes les 0,5 s, Entrée donne celle qui est lue', () => {
    pause();
    const a = street();
    // un point hors des rues, à 30 m dans une autre direction (règle h)
    let other: Designation | null = null;
    const env = game.direct.env();
    for (let k = 0; k < 16 && !other; k++) {
      const d = ground((k * Math.PI) / 8, 30);
      if (!env.roadAt(d.x, d.z, 25) && env.demonstratorsAt(d.x, d.z, 15).count < 8 && !env.rescueAt(d.x, d.z, 10)) other = d;
    }
    expect(other, 'un point hors des rues').toBeTruthy();
    game.direct.setDesignation(a.des);
    game.t.step(0.6);
    expect(game.direct.ready()!.rule).toBe('g');
    game.t.step(0.6);
    // le joueur tourne la tête : la nouvelle ligne s'affiche (l'ancienne était là depuis plus de 0,5 s) et clignote
    game.direct.setDesignation(other!);
    const shown = game.direct.ready()!;
    expect(shown.rule).toBe('h');
    expect(game.direct.flashing()).toBe(true);
    // il revient aussitôt sur la rue : la ligne ne bascule pas avant 0,5 s, et Entrée donne celle qui est affichée
    game.direct.setDesignation(a.des);
    game.t.step(0.2);
    const still = game.direct.ready()!;
    expect(still.key).toBe(shown.key);
    const id = still.who!.squadIds[0]!;
    const r = game.direct.give();
    expect(r.ok, r.text).toBe(true);
    expect(r.squads).toEqual([id]);
    const o = squad(id).order;
    expect(o.type).toBe(still.orderType);
    expect(Math.hypot(o.x - other!.x, o.z - other!.z)).toBeLessThan(12);
    expect(game.direct.ticketOf(id)!.verb).toBe('envoyer');
    // après l'ordre, la ligne suit la désignation du moment (la rue)
    expect(game.direct.ready()!.rule).toBe('g');
  });

  it('« À qui » : U choisit la BRAV-M pour UN ordre ; ensuite l’automatique ; le U suivant y revient', () => {
    pause();
    const s = street();
    game.direct.setDesignation(s.des);
    const env = game.direct.env();
    const bravm = env.units.find((u) => u.kind === 'bravm' && !(u.parentId !== 0 && env.units.find((q) => q.squadId === u.parentId)?.kind === 'bravm'))!;
    expect(bravm).toBeTruthy();
    const key = game.direct.cycle(1);
    expect(key).toBe(`u${bravm.squadId}`);
    const n = game.direct.ready()!;
    expect(n.who!.squadIds).toEqual([bravm.squadId]);
    expect(n.who!.manual).toBe(true);
    // la BRAV-M ne tient pas de barrage quand une section existe : la ligne le dit, l'appui ne donne rien
    expect(n.enabled).toBe(false);
    expect(game.direct.give().ok).toBe(false);
    expect(game.notes[game.notes.length - 1]).toBe('La BRAV-M ne tient pas de barrage\u00a0: envoyez une section.');
    // Envoyer (Maj+Entrée sur une rue) lui va
    const other = game.direct.ready()!.autre!;
    expect(other.verb).toBe('envoyer');
    expect(other.who!.squadIds).toEqual([bravm.squadId]);
    pause();
    const r = game.direct.give('autre');
    expect(r.ok, r.text).toBe(true);
    expect(r.squads).toEqual([bravm.squadId]);
    expect(squad(bravm.squadId).order.byPlayer).toBe(true);
    // le choix manuel est consommé : l'ordre suivant revient à l'automatique (jamais la BRAV-M qui vient de partir)
    expect(game.direct.whoKey()).toBe('auto');
    const after = game.direct.ready()!;
    expect(after.who!.squadIds).not.toEqual([bravm.squadId]);
    // le premier U après l'ordre revient à la BRAV-M (« la BRAV-M encore » = U, Entrée)
    expect(game.direct.cycle(1)).toBe(`u${bravm.squadId}`);
    expect(game.direct.cycle(1)).not.toBe(`u${bravm.squadId}`);
    game.direct.setWho('auto');
  });

  it('garde de 0,6 s : double appui, écran ouvert, écran qui vient de se fermer', () => {
    pause();
    const s = street();
    game.direct.setDesignation(s.des);
    expect(game.direct.give().ok).toBe(true);
    // second appui aussitôt : ignoré (répétition, double toucher)
    const again = game.direct.give();
    expect(again.ok).toBe(false);
    expect(again.ignored).toBe(true);
    pause();
    // un écran ouvert (la carte, la roue, la pause) : Entrée, A, ⌫ ne font rien sur le terrain
    game.t.ctx.ui.open('carte_tactique');
    game.t.step(0.2);
    expect(game.direct.give().ignored).toBe(true);
    expect(game.direct.avecMoi().ignored).toBe(true);
    expect(game.direct.undo().ignored).toBe(true);
    // l'Entrée qui ferme la carte ne donne pas d'ordre sur le terrain, ni sa répétition dans les 0,6 s
    game.t.ctx.ui.close();
    game.t.step(0.1);
    expect(game.direct.give().ignored).toBe(true);
    game.t.step(0.3);
    expect(game.direct.give().ignored).toBe(true);
    game.t.step(0.4);
    expect(game.direct.give().ok).toBe(true);
    // noteScreenClosed (le clavier le signale lui-même)
    pause();
    game.direct.noteScreenClosed();
    expect(game.direct.give().ignored).toBe(true);
  });

  it('rien de désigné (le ciel) : aucun ordre, pas de message — la ligne grise suffit', () => {
    pause();
    const before = game.notes.length;
    const orders = game.t.ctx.squads.list.map((q) => q.order.issuedAt);
    game.direct.setDesignation({ kind: 'none', x: 0, z: 0, distance: 0, person: null, place: '', far: false });
    const r = game.direct.give();
    expect(r.ok).toBe(false);
    expect(r.ignored).toBe(false);
    expect(game.notes.length).toBe(before);
    expect(game.t.ctx.squads.list.map((q) => q.order.issuedAt)).toEqual(orders);
  });

  it('⌫ : la section reprend son barrage après A (« Avec moi » par erreur) ; sans ordre avant, elle revient avec vous', () => {
    pause();
    const s = street();
    game.direct.setDesignation(s.des);
    const n = game.direct.ready()!;
    const id = n.who!.squadIds[0]!;
    expect(game.direct.give().ok).toBe(true);
    const barrage = { ...squad(id).order };
    expect(barrage.type).toBe('couper_circulation');
    pause();
    // A effleuré en marchant : tout le monde revient
    const a = game.direct.avecMoi();
    expect(a.ok, a.text).toBe(true);
    // la compagnie entière en moins d'une seconde (sa racine reprend toutes ses sections)
    game.t.step(0.5);
    expect(squad(id).order.type).toBe('suivre');
    const u = game.direct.undoable()!;
    expect(u).toBeTruthy();
    expect(u.verb).toBe('Avec moi');
    // ⌫ dans les 5 s : la section est remise sur sa rue (même ordre, même point)
    game.t.step(0.5);
    const r = game.direct.undo();
    expect(r.ok, r.text).toBe(true);
    const o = squad(id).order;
    expect(o.type).toBe('couper_circulation');
    expect(o.x).toBeCloseTo(barrage.x, 3);
    expect(o.z).toBeCloseTo(barrage.z, 3);
    expect(o.byPlayer).toBe(true);
    // rien à annuler une seconde fois
    expect(game.direct.undo().ignored).toBe(true);
    // un Envoyer à une unité qui n'avait aucun ordre du joueur : ⌫ la ramène avec vous
    pause();
    // (comme en début de partie : aucun ordre du joueur retenu)
    game.core.playerOrders.clear();
    const env = game.direct.env();
    const fresh = env.units.find((q) => q.symbol === 'section' && q.squadId !== id && !game.core.playerOrderRecord(q.squadId))!;
    expect(fresh, 'une section sans ordre du joueur').toBeTruthy();
    game.direct.setWho(`u${fresh.squadId}`);
    game.direct.setDesignation(ground(s.a + Math.PI, 30));
    const go = game.direct.give();
    expect(go.ok, go.text).toBe(true);
    expect(go.squads).toEqual([fresh.squadId]);
    game.t.step(0.5);
    expect(game.direct.undo().ok).toBe(true);
    expect(squad(fresh.squadId).order.type).toBe('suivre');
    expect(squad(fresh.squadId).order.targetId).toBe(game.me.id);
    // au-delà de 5 s, plus d'annulation
    pause();
    game.direct.setDesignation(s.des);
    expect(game.direct.give().ok).toBe(true);
    game.t.step(UNDO_WINDOW + 0.5);
    expect(game.direct.undoable()).toBeNull();
    expect(game.direct.undo().ignored).toBe(true);
  });

  it('refus de la simulation : le ticket dit « X ne peut pas : … U : une autre unité. », le message aussi', () => {
    pause();
    const s = street();
    game.direct.setDesignation(s.des);
    const r = game.direct.give();
    expect(r.ok).toBe(true);
    const id = r.squads[0]!;
    game.t.step(1.2);
    // réponse simulée de la simulation : aucun itinéraire
    game.t.ctx.events.emitAny('police:order_refused', { squadId: id, type: 'couper_circulation', reason: 'Aucun itinéraire.' });
    game.t.step(0.3);
    const tk = game.direct.ticketOf(id)!;
    const sentence = simRefusal(squad(id).name, 'Aucun itinéraire.');
    expect(sentence).toBe(`${squad(id).name} ne peut pas\u00a0: aucun chemin pour y aller. U\u00a0: une autre unité.`);
    expect(tk.state).toBe('refuse');
    expect(ticketText(tk)).toBe(sentence);
    expect(game.notes).toContain(sentence);
    // retiré après 6 s
    game.t.step(6.5);
    expect(game.direct.ticketOf(id)).toBeNull();
  });

  it('surveillance : une unité en route qui n’avance plus de 5 m en 15 s est « bloquée … ils finissent à pied » (une fois)', () => {
    pause();
    // un point à 150–300 m, sans rue barrable : Envoyer
    const env = game.direct.env();
    let des: Designation | null = null;
    for (const d of [200, 250, 170]) {
      for (let k = 0; k < 16 && !des; k++) {
        const g = ground((k * Math.PI) / 8, d);
        if (!env.roadAt(g.x, g.z, 25) && env.demonstratorsAt(g.x, g.z, 60).count < 8 && !env.rescueAt(g.x, g.z, 10)) des = g;
      }
      if (des) break;
    }
    expect(des, 'un point à 150–300 m').toBeTruthy();
    game.direct.setDesignation(des!);
    const n = game.direct.ready()!;
    expect(n.verb).toBe('envoyer');
    const r = game.direct.give();
    expect(r.ok, r.text).toBe(true);
    const id = r.squads[0]!;
    const ctx = game.t.ctx;
    // l'unité est retenue sur place (réponse simulée : elle piétine), sans qu'on touche à son ordre
    const members: Person[] = [];
    const collect = (q: Squad): void => {
      for (const m of q.members) if (m !== game.me.id) members.push(ctx.people.get(m)!);
      for (const c of ctx.squads.childrenOf(q.id)) collect(c);
    };
    collect(squad(id));
    const home = members.map((p) => ({ x: p.x, z: p.z }));
    const issued = squad(id).order.issuedAt;
    let blockedAt = -1;
    let text = '';
    for (let i = 0; i < Math.ceil((WATCH_WINDOW + 6) / 0.5) && blockedAt < 0; i++) {
      game.t.step(0.5);
      members.forEach((p, j) => {
        p.x = home[j]!.x;
        p.z = home[j]!.z;
      });
      ctx.people.rebuildIndex();
      const tk = game.direct.ticketOf(id);
      if (tk && tk.state === 'bloque') {
        blockedAt = ctx.clock.now;
        text = ticketText(tk);
      }
    }
    expect(blockedAt, 'le ticket passe à « bloqué »').toBeGreaterThan(0);
    expect(text).toMatch(new RegExp(`^${squad(id).name} · bloqué\u00a0: .+ — ils finissent à pied$`));
    // l'ordre est redonné à pied (même type, même point, byPlayer)
    const o = squad(id).order;
    expect(o.issuedAt).toBeGreaterThan(issued);
    expect(o.byPlayer).toBe(true);
    expect(o.type).toBe(n.orderType);
    expect(Math.hypot(o.x - n.x, o.z - n.z)).toBeLessThan(15);
    // une fois par ticket : le blocage s'efface, et ne revient pas
    let again = false;
    for (let i = 0; i < 40; i++) {
      game.t.step(0.5);
      members.forEach((p, j) => {
        p.x = home[j]!.x;
        p.z = home[j]!.z;
      });
      ctx.people.rebuildIndex();
      const tk = game.direct.ticketOf(id);
      if (tk && tk.state === 'bloque' && ctx.clock.now - blockedAt > 10) again = true;
    }
    expect(again).toBe(false);
    expect(squad(id).order.issuedAt).toBe(o.issuedAt);
  });

  it('A : tout le monde (la compagnie, sa racine comprise) revient avec le joueur ; ticket « Avec moi » puis « avec vous ✓ »', () => {
    pause();
    const ctx = game.t.ctx;
    const r = game.direct.avecMoi();
    expect(r.ok, r.text).toBe(true);
    const root = game.core.followUnit()!;
    expect(r.squads).toContain(root.id);
    expect(game.direct.ticketOf(root.id)!.state).toBe('recu');
    game.t.step(0.5);
    for (const q of ctx.squads.list) {
      if (q.faction !== 'police' || !game.core.canCommand(q.id)) continue;
      const v = q.vehicleId !== 0 ? ctx.vehicles.get(q.vehicleId) : undefined;
      if (v && v.kind === 'fourgon_cellulaire') continue;
      if (q.parentId === root.id || q.id === root.id) expect(q.order.type, q.name).toBe('suivre');
    }
    game.t.step(1);
    const tk = game.direct.ticketOf(root.id)!;
    expect(tk.state).toBe('en_place');
    expect(ticketText(tk)).toBe(`${root.name} · avec vous ✓`);
  });

  it('indicatif : le commandant qui parle à sa compagnie dit « AUTORITÉ », jamais « MISTRAL ICI MISTRAL »', () => {
    pause();
    const ctx = game.t.ctx;
    const root = game.core.followUnit()!;
    const before = ctx.radio.log.length;
    const s = street();
    const r = game.core.issue('tenir', [root], [{ x: s.des.x, z: s.des.z, heading: 0, width: 0 }]);
    expect(r.ok).toBe(true);
    const said = ctx.radio.log.slice(before).filter((m) => m.personId === game.me.id);
    expect(said.length).toBeGreaterThan(0);
    for (const m of said) {
      expect(m.text).not.toContain(`${root.name} ICI ${root.name}`);
      expect(m.from).toBe('AUTORITÉ');
    }
    // à une section, il reste « MISTRAL » (l'indicatif de sa compagnie)
    const sec = ctx.squads.childrenOf(root.id).find((q) => q.kind === 'section')!;
    const b2 = ctx.radio.log.length;
    game.core.issue('tenir', [sec], null);
    const m2 = ctx.radio.log.slice(b2).find((m) => m.personId === game.me.id)!;
    expect(m2.from).toBe(root.name);
    expect(m2.text.startsWith(`${sec.name} ICI ${root.name.toUpperCase()}`) || m2.text.includes(`ICI ${root.name}`)).toBe(true);
  });

  it('ligne de l’unité : l’ordre du joueur, sa phase (colonne, agents assis)', () => {
    const env = game.direct.env();
    const sec = env.units.find((u) => u.symbol === 'section')!;
    const ph = game.core.phaseOf(sec.squadId);
    expect(ph.agents).toBeGreaterThan(0);
    expect(ph.seated).toBeGreaterThanOrEqual(0);
    expect(ph.convoy).toBeNull();
    const po = game.core.playerOrder(sec.squadId);
    expect(po).toBeTruthy();
    // les distances des lignes : celles des mots du terrain
    expect(distText(90)).toBe('90\u00a0m');
  });
});

describe('proposition de l’adjoint acceptée (P) : ses ordres sont ceux du joueur', () => {
  it('« mise en place du dispositif » acceptée : chaque ordre donné porte byPlayer, aucun ordre interne ne le remplace', async () => {
    const t = createTestContext({ seed: 21, strict: false, modules: MODULES });
    await t.start({
      mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place de la Concorde', x: -10, z: 15,
      crowdSize: 300, tension: 0.4, volatility: 0.3, duration: 'standard', extra: { moyens: MEANS, variante: 'terrain' },
    } as never);
    const cmd = t.ctx.service<{ proposals: readonly { id: number; key: string; executable: boolean }[]; accept(id: number): boolean }>('police.command')!;
    let p: { id: number; key: string } | undefined;
    for (let s = 0; s < 30 && !p; s++) {
      t.step(1);
      p = cmd.proposals.find((q) => q.executable && q.key === 'dispositif');
    }
    expect(p, 'la proposition « dispositif »').toBeTruthy();
    const at = t.ctx.clock.now;
    expect(cmd.accept(p!.id)).toBe(true);
    const given = t.ctx.squads.list.filter((q) => q.faction === 'police' && q.order.issuedAt >= at - 1e-6);
    expect(given.length).toBeGreaterThan(0);
    for (const q of given) expect(q.order.byPlayer, q.name).toBe(true);
    // un ordre interne de l'adjoint (sans le joueur) ne porte jamais la marque
    t.step(1);
    const later = t.ctx.squads.list.filter((q) => q.faction === 'police' && q.order.issuedAt > at + 0.5 && q.order.byPlayer === true);
    for (const q of later) expect(q.order.issuedBy, q.name).toBe(t.ctx.player.state.personId);
  }, 300000);
});
