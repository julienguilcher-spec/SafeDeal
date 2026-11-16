// Interactions : registre, options triées, actions à durée (progression, fin, annulation quand on bouge ou
// qu'on est frappé), startVerb pour les IA ; verbes fournis : porter, trainer, deposer, pousser.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameContext, InteractionHandler, InteractionOption, Person } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import type { TestContext } from '@/core/testing';
import { createSystems } from '@/sim/people';
import type { PeopleInteractionsApi, PeopleLocomotionApi } from '@/sim/people';

async function setup(): Promise<TestContext> {
  const t = createTestContext({ modules: [createSystems] });
  await t.start();
  return t;
}

afterEach(() => {
  vi.restoreAllMocks();
});

interface Probe {
  handler: InteractionHandler;
  log: string[];
  /** Cible proposée (0 = aucune option). */
  targetId: number;
}

/** Gestionnaire d'essai : propose `verb` sur la cible fixée, journalise son cycle de vie. */
function probe(verb: string, duration: number, priority: number): Probe {
  const opt: InteractionOption = { verb, targetKind: 'person', targetId: 0, label: verb, priority, duration, x: 0, z: 0 };
  const pr: Probe = {
    log: [],
    targetId: 0,
    handler: {
      verb,
      find(_actor, targetId) {
        if (pr.targetId === 0) return null;
        if (targetId !== undefined && targetId !== pr.targetId) return null;
        opt.targetId = pr.targetId;
        return opt;
      },
      begin(actor) {
        pr.log.push(`begin:${actor.id}`);
        return true;
      },
      tick(_actor, _opt, elapsed) {
        pr.log.push(`tick:${elapsed.toFixed(1)}`);
        return true;
      },
      complete(actor, o) {
        pr.log.push(`complete:${actor.id}>${o.targetId}`);
      },
      cancel(actor) {
        pr.log.push(`cancel:${actor.id}`);
      },
    },
  };
  return pr;
}

function events(ctx: GameContext): string[] {
  const out: string[] = [];
  for (const name of ['interaction:started', 'interaction:completed', 'interaction:cancelled']) {
    ctx.events.onAny(name, (e) => out.push(`${name.split(':')[1]}:${(e as { verb: string }).verb}`));
  }
  return out;
}

/** Met une personne à terre pour de bon (état critique : ne se relèvera pas seule), quelles que soient ses protections. */
function wound(ctx: GameContext, p: Person): void {
  ctx.health.hurt(p, { amount: 400, kind: 'blunt', sourceId: 0, x: p.x, z: p.z });
}

describe('registre et actions à durée', () => {
  it('options triées par priorité ; une action immédiate se termine aussitôt', async () => {
    const t = await setup();
    const ctx = t.ctx;
    const low = probe('parler', 0, 10);
    const high = probe('controler', 0, 80);
    ctx.interactions.register(low.handler);
    ctx.interactions.register(high.handler);
    ctx.interactions.register(high.handler); // enregistré une seule fois
    const actor = ctx.people.spawn({ kind: 'crs', x: 0, z: 0 });
    const target = ctx.people.spawn({ kind: 'manifestant', x: 50, z: 0 });
    const out: InteractionOption[] = [];
    expect(ctx.interactions.options(actor, out)).toBe(0);
    low.targetId = target.id;
    high.targetId = target.id;
    expect(ctx.interactions.options(actor, out)).toBe(2);
    expect(out.map((o) => o.verb)).toEqual(['controler', 'parler']);
    expect(ctx.interactions.start(actor, out[0]!)).toBe(true);
    expect(high.log).toEqual([`begin:${actor.id}`, `complete:${actor.id}>${target.id}`]);
    expect(ctx.interactions.current(actor)).toBeNull();
  });

  it('une action à durée progresse puis se termine, avec ses événements', async () => {
    const t = await setup();
    const ctx = t.ctx;
    const ext = ctx.require<PeopleInteractionsApi>('people.interactions');
    const ev = events(ctx);
    const pr = probe('palper', 2, 50);
    ctx.interactions.register(pr.handler);
    const actor = ctx.people.spawn({ kind: 'crs', x: 0, z: 0 });
    const target = ctx.people.spawn({ kind: 'manifestant', x: 30, z: 0 });
    pr.targetId = target.id;
    expect(ctx.interactions.startVerb(actor, 'palper', target.id)).toBe(true);
    expect(ext.activeCount).toBe(1);
    t.step(1);
    const cur = ctx.interactions.current(actor);
    expect(cur?.opt.verb).toBe('palper');
    expect(cur?.elapsed).toBeCloseTo(1, 5);
    expect(ext.progress(actor)).toBeCloseTo(0.5, 5);
    t.step(1.1);
    expect(ctx.interactions.current(actor)).toBeNull();
    expect(pr.log[0]).toBe(`begin:${actor.id}`);
    expect(pr.log[pr.log.length - 1]).toBe(`complete:${actor.id}>${target.id}`);
    expect(pr.log.filter((l) => l.startsWith('cancel')).length).toBe(0);
    expect(ev).toEqual(['started:palper', 'completed:palper']);
  });

  it('startVerb ne lance le verbe que sur la cible demandée', async () => {
    const t = await setup();
    const ctx = t.ctx;
    const pr = probe('menotter', 3, 50);
    ctx.interactions.register(pr.handler);
    const actor = ctx.people.spawn({ kind: 'crs', x: 0, z: 0 });
    const a = ctx.people.spawn({ kind: 'manifestant', x: 30, z: 0 });
    const b = ctx.people.spawn({ kind: 'manifestant', x: 40, z: 0 });
    pr.targetId = a.id;
    expect(ctx.interactions.startVerb(actor, 'menotter', b.id)).toBe(false);
    expect(ctx.interactions.startVerb(actor, 'inconnu', a.id)).toBe(false);
    expect(ctx.interactions.startVerb(actor, 'menotter', a.id)).toBe(true);
    expect(ctx.interactions.current(actor)?.opt.targetId).toBe(a.id);
  });

  it('bouger, être déplacé, être frappé, être étourdi ou annuler interrompt', async () => {
    const t = await setup();
    const ctx = t.ctx;
    const ev = events(ctx);
    const pr = probe('soigner', 5, 50);
    ctx.interactions.register(pr.handler);
    const target = ctx.people.spawn({ kind: 'manifestant', x: 60, z: 0 });
    pr.targetId = target.id;
    const fresh = (x: number): Person => {
      const a = ctx.people.spawn({ kind: 'street_medic', x, z: 0 });
      expect(ctx.interactions.startVerb(a, 'soigner', target.id)).toBe(true);
      return a;
    };
    const cancelled = (a: Person): boolean => ctx.interactions.current(a) === null && pr.log.includes(`cancel:${a.id}`);

    const mover = fresh(0);
    t.step(0.5);
    expect(cancelled(mover)).toBe(false);
    mover.cmd.moveX = 1; // intention de marcher
    t.step(0.1);
    expect(cancelled(mover)).toBe(true);

    const shoved = fresh(10);
    t.step(0.5);
    shoved.x += 1; // bousculé d'un mètre
    t.step(0.1);
    expect(cancelled(shoved)).toBe(true);

    const struck = fresh(20);
    t.step(0.5);
    ctx.health.hurt(struck, { amount: 5, kind: 'impact', sourceId: 0, x: 20, z: 0 });
    expect(cancelled(struck)).toBe(true); // immédiatement

    const dazed = fresh(30);
    dazed.stun = 2;
    t.step(0.1);
    expect(cancelled(dazed)).toBe(true);

    const quitter = fresh(40);
    ctx.interactions.cancel(quitter);
    expect(cancelled(quitter)).toBe(true);

    // lancer une autre action remplace la précédente
    const busy = fresh(50);
    const other = probe('parler', 4, 10);
    other.targetId = target.id;
    ctx.interactions.register(other.handler);
    expect(ctx.interactions.startVerb(busy, 'parler', target.id)).toBe(true);
    expect(pr.log.includes(`cancel:${busy.id}`)).toBe(true);
    expect(ctx.interactions.current(busy)?.opt.verb).toBe('parler');

    expect(pr.log.filter((l) => l.startsWith('complete')).length).toBe(0);
    expect(ev.filter((e) => e === 'cancelled:soigner').length).toBe(6);
  });

  it("la disparition de la cible ou une exception d'un gestionnaire abandonne l'action sans arrêter le jeu", async () => {
    const t = await setup();
    const ctx = t.ctx;
    const pr = probe('escorter', 5, 50);
    ctx.interactions.register(pr.handler);
    const actor = ctx.people.spawn({ kind: 'crs', x: 0, z: 0 });
    const target = ctx.people.spawn({ kind: 'manifestant', x: 30, z: 0 });
    pr.targetId = target.id;
    ctx.interactions.startVerb(actor, 'escorter', target.id);
    t.step(0.2);
    ctx.people.remove(target.id);
    t.step(0.1);
    expect(ctx.interactions.current(actor)).toBeNull();

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const boom: InteractionHandler = {
      verb: 'ouvrir',
      find: () => ({ verb: 'ouvrir', targetKind: 'prop', targetId: 9, label: 'Ouvrir', priority: 1, duration: 2, x: 0, z: 0 }),
      begin: () => true,
      tick: () => {
        throw new Error('panne');
      },
      complete: () => {},
    };
    ctx.interactions.register(boom);
    expect(ctx.interactions.startVerb(actor, 'ouvrir', 9)).toBe(true);
    t.step(0.2);
    expect(ctx.interactions.current(actor)).toBeNull();
    expect(spy).toHaveBeenCalled();
  });
});

describe('porter, traîner, déposer un blessé', () => {
  it('charger un blessé sur l\'épaule prend 2,5 s ; il suit ensuite son porteur, qui marche à 1,2 m/s au plus', async () => {
    const t = await setup();
    const ctx = t.ctx;
    const loco = ctx.require<PeopleLocomotionApi>('people.locomotion');
    const medic = ctx.people.spawn({ kind: 'street_medic', x: 0, z: 0 });
    const victim = ctx.people.spawn({ kind: 'crs', x: 0.9, z: 0.3 }); // n'importe quel camp
    const out: InteractionOption[] = [];
    expect(ctx.interactions.options(medic, out)).toBe(0); // personne à secourir
    wound(ctx, victim);
    expect(victim.posture).toBe('down');
    expect(ctx.interactions.options(medic, out)).toBe(2);
    expect(out.map((o) => o.verb)).toEqual(['porter', 'trainer']);
    expect(out[0]!.label).toBe('Porter le blessé');
    expect(out[0]!.duration).toBe(2.5);
    expect(ctx.interactions.start(medic, out[0]!)).toBe(true);
    expect(medic.upper).toBe('pickup');
    t.step(2);
    expect(medic.carrying).toBe(0);
    t.step(0.6);
    expect(medic.carrying).toBe(victim.id);
    expect(victim.heldBy).toBe(medic.id);
    expect(medic.upper).toBe('carry_person');

    // en route : le blessé reste sur l'épaule
    medic.cmd.moveX = 1;
    medic.cmd.gait = 2;
    const s0 = medic.stamina;
    t.step(5);
    expect(Math.hypot(medic.vx, medic.vz)).toBeCloseTo(1.2, 2);
    expect(loco.speedLimit(medic, 2)).toBe(1.2);
    expect(victim.x).toBe(medic.x);
    expect(victim.z).toBe(medic.z);
    expect(medic.x).toBeGreaterThan(5);
    expect(medic.stamina).toBeLessThan(s0 - 5); // porter épuise

    // déposer : 1,2 s à l'arrêt, le blessé est posé devant
    medic.cmd.moveX = 0;
    t.step(0.5);
    expect(ctx.interactions.options(medic, out)).toBe(1);
    expect(out[0]!.verb).toBe('deposer');
    ctx.interactions.start(medic, out[0]!);
    t.step(1.3);
    expect(medic.carrying).toBe(0);
    expect(victim.heldBy).toBe(0);
    expect(medic.upper).toBe('none');
    expect(victim.posture).toBe('down');
    const gap = Math.hypot(victim.x - medic.x, victim.z - medic.z);
    expect(gap).toBeGreaterThan(0.5);
    expect(gap).toBeLessThan(1);
  });

  it('accroupi ou à bout de souffle on traîne : le corps suit à bout de bras, à 0,6 m/s', async () => {
    const t = await setup();
    const ctx = t.ctx;
    const helper = ctx.people.spawn({ kind: 'manifestant', x: 0, z: 0 });
    const victim = ctx.people.spawn({ kind: 'manifestant', x: 1, z: 0 });
    wound(ctx, victim);
    helper.cmd.crouch = true;
    t.step(0.2);
    const out: InteractionOption[] = [];
    ctx.interactions.options(helper, out);
    expect(out[0]!.verb).toBe('trainer');
    helper.cmd.crouch = false;
    helper.stamina = 5; // trop fatigué pour porter
    t.step(0.1);
    helper.stamina = 5;
    expect(ctx.interactions.options(helper, out)).toBe(1);
    expect(ctx.interactions.startVerb(helper, 'trainer', victim.id)).toBe(true);
    t.step(1);
    expect(helper.carrying).toBe(victim.id);
    expect(helper.upper).toBe('drag');
    // il recule vers l'ouest en tirant le blessé
    helper.cmd.moveX = -1;
    helper.cmd.faceMove = false;
    helper.cmd.aimYaw = Math.PI / 2;
    t.step(6);
    expect(Math.hypot(helper.vx, helper.vz)).toBeLessThanOrEqual(0.6 + 1e-6);
    expect(helper.x).toBeLessThan(-2.5);
    expect(Math.hypot(victim.x - helper.x, victim.z - helper.z)).toBeCloseTo(0.95, 2);
    expect(victim.x).toBeGreaterThan(helper.x); // derrière lui, côté d'où il vient
    // lâcher est immédiat
    ctx.interactions.options(helper, out);
    expect(out[0]!.verb).toBe('deposer');
    expect(out[0]!.duration).toBe(0);
    ctx.interactions.start(helper, out[0]!);
    expect(helper.carrying).toBe(0);
    expect(victim.heldBy).toBe(0);
  });

  it('un porteur mis à terre lâche le blessé ; un blessé soigné se relève une fois déposé', async () => {
    const t = await setup();
    const ctx = t.ctx;
    const a = ctx.people.spawn({ kind: 'pompier', x: 0, z: 0 });
    const victim = ctx.people.spawn({ kind: 'manifestant', x: 1, z: 0 });
    wound(ctx, victim);
    ctx.interactions.startVerb(a, 'porter', victim.id);
    t.step(2.6);
    expect(a.carrying).toBe(victim.id);
    ctx.health.setDown(a, true);
    expect(a.carrying).toBe(0);
    expect(victim.heldBy).toBe(0);
    expect(a.upper).toBe('none');

    // on le reprend, on le soigne en route, puis on le dépose
    const b = ctx.people.spawn({ kind: 'samu', x: victim.x + 1, z: victim.z });
    expect(ctx.interactions.startVerb(b, 'porter', victim.id)).toBe(true);
    t.step(2.6);
    ctx.health.heal(victim, 40, b.id);
    t.step(4);
    expect(victim.posture).toBe('down'); // toujours porté
    ctx.interactions.startVerb(b, 'deposer', victim.id);
    t.step(1.3);
    expect(victim.heldBy).toBe(0);
    t.step(3);
    expect(victim.posture).toBe('stand');
  });

  it("on ne porte ni quelqu'un qui va se relever seul, ni quelqu'un de déjà tenu, ni avec les mains prises", async () => {
    const t = await setup();
    const ctx = t.ctx;
    const actor = ctx.people.spawn({ kind: 'crs', x: 0, z: 0 });
    const tripped = ctx.people.spawn({ kind: 'manifestant', x: 1, z: 0 });
    ctx.health.setDown(tripped, true); // simple chute
    const out: InteractionOption[] = [];
    expect(ctx.interactions.options(actor, out)).toBe(0);
    const victim = ctx.people.spawn({ kind: 'manifestant', x: -1, z: 0 });
    wound(ctx, victim);
    const other = ctx.people.spawn({ kind: 'crs', x: -1.5, z: 0.8 });
    ctx.interactions.startVerb(other, 'trainer', victim.id);
    t.step(1);
    expect(victim.heldBy).toBe(other.id);
    expect(ctx.interactions.startVerb(actor, 'porter', victim.id)).toBe(false);
    expect(ctx.interactions.startVerb(other, 'porter', victim.id)).toBe(false); // mains prises
  });
});

describe('pousser', () => {
  it('repousse la personne visée : recul, déséquilibre ; un policier déclare l\'emploi de la force', async () => {
    const t = await setup();
    const ctx = t.ctx;
    const pushed: unknown[] = [];
    ctx.events.onAny('people:pushed', (e) => pushed.push(e));
    const crs = ctx.people.spawn({ kind: 'crs', x: 0, z: 0, heading: 0 });
    const target = ctx.people.spawn({ kind: 'manifestant', x: 0, z: 0.8 });
    const out: InteractionOption[] = [];
    expect(ctx.interactions.options(crs, out)).toBe(1);
    expect(out[0]!.verb).toBe('pousser');
    expect(out[0]!.label).toBe('Repousser');
    const s0 = crs.stamina;
    expect(ctx.interactions.start(crs, out[0]!)).toBe(true);
    expect(target.vz).toBeGreaterThan(2);
    expect(target.stun).toBeGreaterThan(0);
    expect(target.anger).toBeGreaterThan(0);
    expect(crs.upper).toBe('push');
    expect(crs.stamina).toBeLessThan(s0);
    expect(pushed.length).toBe(1);
    expect(ctx.law.forceLog.length).toBe(1);
    expect(ctx.law.forceLog[0]).toMatchObject({ byId: crs.id, means: 'contact', targetId: target.id });
    // délai avant de pouvoir recommencer
    expect(ctx.interactions.startVerb(crs, 'pousser', target.id)).toBe(false);
    t.step(1);
    expect(target.z).toBeGreaterThan(1.2); // il a reculé
    expect(crs.upper).toBe('none'); // le geste est terminé
  });

  it('repousser un policier est une violence sur agent ; son bouclier levé encaisse', async () => {
    const t = await setup();
    const ctx = t.ctx;
    const rioter = ctx.people.spawn({ kind: 'manifestant', x: 0, z: 0 });
    const cop = ctx.people.spawn({ kind: 'crs', x: 0, z: 0.8, heading: Math.PI });
    const shielded = ctx.people.spawn({ kind: 'crs', x: 20, z: 0.8, heading: Math.PI });
    ctx.actions.give(shielded, 'bouclier', 1);
    ctx.actions.select(shielded, 0);
    shielded.alt = true;
    const rioter2 = ctx.people.spawn({ kind: 'manifestant', x: 20, z: 0 });
    t.step(1); // la résistance du porteur de bouclier est prise en compte
    expect(ctx.interactions.startVerb(rioter, 'pousser', cop.id)).toBe(true);
    expect(ctx.interactions.startVerb(rioter2, 'pousser', shielded.id)).toBe(true);
    expect(rioter.offenses.map((o) => o.type)).toEqual(['violence_agent']);
    expect(ctx.law.forceLog.length).toBe(0);
    expect(shielded.vz).toBeLessThan(cop.vz * 0.4);
    expect(shielded.stun).toBe(0);
    expect(shielded.posture).toBe('stand');
  });

  it('sans cible désignée, on ne repousse ni un collègue ni quelqu\'un dans son dos ; pousser interrompt la cible', async () => {
    const t = await setup();
    const ctx = t.ctx;
    const crs = ctx.people.spawn({ kind: 'crs', x: 0, z: 0, heading: 0 });
    const colleague = ctx.people.spawn({ kind: 'crs', x: 0.7, z: 0.3 });
    const behind = ctx.people.spawn({ kind: 'manifestant', x: 0, z: -0.8 });
    const out: InteractionOption[] = [];
    expect(ctx.interactions.options(crs, out)).toBe(0);
    // une IA peut désigner explicitement n'importe qui à portée
    const pr = probe('parler', 5, 10);
    pr.targetId = crs.id;
    ctx.interactions.register(pr.handler);
    ctx.interactions.startVerb(behind, 'parler', crs.id);
    expect(ctx.interactions.current(behind)).not.toBeNull();
    expect(ctx.interactions.startVerb(crs, 'pousser', behind.id)).toBe(true);
    expect(ctx.interactions.current(behind)).toBeNull();
    expect(colleague.vx).toBe(0);
  });

  it('collègue DÉSIGNÉ (visé par le joueur) : « Repousser » n’est ni proposé ni lancé, rien n’est déclaré au droit', async () => {
    const t = await setup();
    const ctx = t.ctx;
    const crs = ctx.people.spawn({ kind: 'crs', x: 0, z: 0, heading: 0 });
    const colleague = ctx.people.spawn({ kind: 'crs', x: 0, z: 0.95 });
    let reports = 0;
    ctx.events.on('law:force', () => { reports++; });
    const out: InteractionOption[] = [];
    expect(ctx.interactions.options(crs, out)).toBe(0);
    expect(ctx.interactions.startVerb(crs, 'pousser', colleague.id)).toBe(false);
    t.step(1);
    expect(colleague.vx).toBe(0);
    expect(colleague.z).toBeCloseTo(0.95, 2);
    expect(reports).toBe(0);
    // un manifestant à la même place, lui, peut être repoussé
    const other = ctx.people.spawn({ kind: 'manifestant', x: 0.2, z: 0.9 });
    ctx.people.rebuildIndex();
    expect(ctx.interactions.startVerb(crs, 'pousser', other.id)).toBe(true);
  });
});
