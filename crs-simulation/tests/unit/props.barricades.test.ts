// Décor dynamique — barricades : formation par regroupement d'objets déplacés, extension, feu, démontage, lame.
import { describe, expect, it } from 'vitest';
import type { Person, Prop, RayHit } from '@/core/contracts';
import { getCore } from '@/core/context';
import { makeRayHit } from '@/core/null-services';
import { genericVehicleDef } from '@/core/stores';
import { startProps } from '@/sim/props/testkit';
import type { PropsRig } from '@/sim/props/testkit';

const hit: RayHit = makeRayHit();

/** Une personne porte l'objet et le pose en (x, z) — elle se place juste au sud du point de dépôt, face au nord… */
function carryTo(rig: PropsRig, by: Person, prop: Prop, x: number, z: number): void {
  by.x = prop.x;
  by.z = prop.z - 1;
  expect(rig.ext.carry(prop, by)).toBe(true);
  by.heading = 0; // face à +z
  by.x = x;
  by.z = z - by.radius - Math.min(prop.halfX, prop.halfZ) - 0.25;
  rig.step(0.1);
  expect(rig.ext.drop(by)).toBe(true);
}

/** Cinq conteneurs alignés d'est en ouest, poussés d'un même élan vers le nord : ils roulent 1,3 m et s'arrêtent en rang. */
function pushRow(rig: PropsRig, byIds: number[], z0 = -2): Prop[] {
  const row: Prop[] = [];
  for (let i = 0; i < 5; i++) row.push(rig.ctx.props.spawn('conteneur', -3.2 + i * 1.6, z0, 0));
  for (let i = 0; i < 5; i++) rig.ctx.props.push(row[i]!, 0, 1, 3.5, byIds[i % byIds.length]!);
  return row;
}

describe('barricades', () => {
  it('des conteneurs poussés en travers de la rue forment une barricade qui barre le passage et la vue', async () => {
    const rig = await startProps({ seed: 3 });
    const { ctx } = rig;
    rig.world.road = { x: 0, z: 0, heading: 0, width: 9 }; // rue nord-sud
    const a = rig.person(-2, -4);
    const b = rig.person(2, -4);
    const row = pushRow(rig, [a.id, b.id]);
    // avant : on passe entre les bacs, on voit au travers
    expect(ctx.props.raycast(0.8, -10, 0.8, 10, hit, 'move')).toBe(false);
    rig.step(0.5);
    expect(rig.events('barricade:built').length).toBe(0); // ils roulent encore
    rig.step(3);
    const built = rig.events('barricade:built');
    expect(built.length).toBe(1);
    const barricade = ctx.props.get(built[0]!.id)!;
    expect(barricade.kind).toBe('barricade');
    expect(built[0]!.x).toBeCloseTo(barricade.x, 6);
    // les cinq bacs ont été absorbés
    expect(rig.events('prop:removed').map((e) => e.id).sort()).toEqual(row.map((p) => p.id).sort());
    expect(ctx.props.list.length).toBe(1);
    expect(rig.ext.barricadeParts(barricade.id).length).toBe(5);
    expect(rig.ext.barricadeParts(barricade.id).every((p) => p.kind === 'conteneur')).toBe(true);
    // boîte orientée : 7,7 m d'est en ouest (4 intervalles de 1,6 m + un bac de 1,26 m), 1 à 1,5 m de haut
    expect(barricade.halfX).toBeCloseTo((4 * 1.6 + 1.26) / 2, 1);
    expect(barricade.halfZ).toBeGreaterThanOrEqual(0.39);
    expect(barricade.halfZ).toBeLessThan(0.7);
    expect(Math.abs(Math.cos(barricade.heading))).toBeGreaterThan(0.99); // grand axe le long de x
    expect(barricade.x).toBeCloseTo(0, 1);
    expect(barricade.z).toBeCloseTo(-2 + 1.3, 1);
    expect(barricade.height).toBeGreaterThanOrEqual(1);
    expect(barricade.height).toBeLessThanOrEqual(1.5);
    expect(barricade.movable).toBe(false);
    expect(barricade.blocksMove && barricade.blocksSight).toBe(true);
    // elle barre le passage et la vue sur toute sa largeur, y compris entre deux anciens bacs
    for (const x of [-3.5, -0.8, 0.8, 3.5]) {
      expect(ctx.props.raycast(x, -10, x, 10, hit, 'move'), `passage en x = ${x}`).toBe(true);
      expect(hit.id).toBe(barricade.id);
      expect(ctx.props.raycast(x, -10, x, 10, hit, 'sight'), `vue en x = ${x}`).toBe(true);
    }
    expect(ctx.props.raycast(5.5, -10, 5.5, 10, hit, 'move')).toBe(false); // on la contourne par le trottoir
    const pos = { x: 0.8, z: barricade.z - barricade.halfZ - 0.1 };
    expect(ctx.props.resolveCircle(pos, 0.28)).toBe(true);
    // infraction pour ceux qui ont apporté les objets, tension +0,06
    expect(a.offenses.map((o) => o.type)).toEqual(['barricade']);
    expect(b.offenses.map((o) => o.type)).toEqual(['barricade']);
    expect(rig.director.added).toEqual([{ amount: 0.06, x: barricade.x, z: barricade.z, reason: 'barricade' }]);
    expect(rig.ext.stats.barricades).toBe(1);
    expect(rig.ext.stats.barricadesBuilt).toBe(1);
    // résistance : le marteau n'y fait rien
    const hp = barricade.hp;
    expect(hp).toBeGreaterThanOrEqual(300);
    ctx.props.damage(barricade, 18, 'blunt', a.id);
    expect(barricade.hp).toBeGreaterThan(hp - 2);
  });

  it('objets portés et posés : barrières, corbeilles renversées et palettes de plusieurs mains font une barricade', async () => {
    const rig = await startProps({ seed: 4 });
    const { ctx } = rig;
    const people = [rig.person(0, -6), rig.person(1, -6), rig.person(2, -6)];
    const kinds = ['barriere_vauban', 'poubelle', 'palette', 'barriere_chantier', 'poubelle', 'table_terrasse', 'chaise', 'velo'];
    const xs = [-3.4, -1.9, -1.0, 0.9, 2.9, 3.6, 4.2, 5.1];
    const props = kinds.map((k, i) => ctx.props.spawn(k, 20 + i * 3, 30, 0));
    for (let i = 0; i < props.length; i++) {
      carryTo(rig, people[i % 3]!, props[i]!, xs[i]!, 0);
      rig.step(0.2);
    }
    rig.step(1);
    const built = rig.events('barricade:built');
    expect(built.length).toBe(1);
    const barricade = ctx.props.get(built[0]!.id)!;
    const parts = rig.ext.barricadeParts(barricade.id);
    // tout ce qui a été posé à moins d'un mètre du tas y est (formé dès le volume atteint, étendu ensuite)
    expect(parts.map((p) => p.kind).sort()).toEqual([...kinds].sort());
    expect(barricade.halfX * 2).toBeGreaterThan(8);
    for (const p of people) expect(p.offenses.some((o) => o.type === 'barricade')).toBe(true);
    // combustible : celui de ses éléments (corbeilles, palette, mobilier, vélo, grille de chantier)
    expect(barricade.fuel).toBeGreaterThan(1000);
  });

  it('ne se forme pas : mobilier en place jamais déplacé, tas trop petit, objets rangés le long de la rue', async () => {
    const rig = await startProps({ seed: 5 });
    const { ctx } = rig;
    rig.world.road = { x: 0, z: 0, heading: 0, width: 9 };
    // terrasse en place : tables et chaises serrées, que personne n'a touchées
    for (let i = 0; i < 5; i++) {
      ctx.props.spawn('table_terrasse', 30 + i * 1.2, 0, 0);
      ctx.props.spawn('chaise', 30 + i * 1.2, 0.6, 0);
      ctx.props.spawn('conteneur', 30 + i * 1.4, 2, 0);
    }
    // deux corbeilles poussées l'une contre l'autre : trop peu
    const p1 = ctx.props.spawn('poubelle', -20, 0, 0);
    const p2 = ctx.props.spawn('poubelle', -19.2, 0, 0);
    ctx.props.push(p1, 0, 1, 1.5, 1);
    ctx.props.push(p2, 0, 1, 1.5, 1);
    // cinq conteneurs poussés mais alignés le long de la chaussée (axe nord-sud) : un rangement, pas un barrage
    const line: Prop[] = [];
    for (let i = 0; i < 5; i++) line.push(ctx.props.spawn('conteneur', 2, -60 + i * 1.0, Math.PI / 2));
    for (const p of line) ctx.props.push(p, 1, 0, 3, 1);
    rig.step(5);
    expect(rig.events('barricade:built').length).toBe(0);
    expect(rig.ext.stats.barricades).toBe(0);
    // les mêmes, sur une place sans rue : c'est bien une barricade
    rig.world.road = null;
    for (const p of line) ctx.props.push(p, 1, 0, 3, 1);
    rig.step(5);
    expect(rig.events('barricade:built').length).toBe(1);
  });

  it('un objet poussé contre une barricade existante y est absorbé ; un bac en feu l\'embrase', async () => {
    const rig = await startProps({ seed: 6 });
    const { ctx, hazards } = rig;
    const a = rig.person(0, -5);
    pushRow(rig, [a.id]);
    rig.step(3);
    const barricade = ctx.props.get(rig.events('barricade:built')[0]!.id)!;
    const halfBefore = barricade.halfX;
    const hpBefore = barricade.hp;
    const extended: { id: number; parts: number }[] = [];
    ctx.events.onAny('props:barricade_extended', (e) => extended.push({ ...(e as { id: number; parts: number }) }));
    // une corbeille poussée contre son extrémité est
    const late = rig.person(6, -5);
    const bin = ctx.props.spawn('poubelle', barricade.x + halfBefore + 0.5, barricade.z - 1.2, 0);
    ctx.props.push(bin, 0, 1, 1.7, late.id);
    rig.step(2);
    expect(extended).toEqual([{ id: barricade.id, parts: 6, x: barricade.x, z: barricade.z, byId: late.id }]);
    expect(rig.events('barricade:built').length).toBe(1); // pas une nouvelle barricade
    expect(ctx.props.get(bin.id)).toBeUndefined();
    expect(barricade.halfX).toBeGreaterThan(halfBefore + 0.15);
    expect(barricade.hp).toBeGreaterThan(hpBefore);
    expect(late.offenses.map((o) => o.type)).toEqual(['barricade']);
    expect(ctx.props.raycast(bin.x, -10, bin.x, 10, hit, 'move')).toBe(true);
    expect(hit.id).toBe(barricade.id);

    // un conteneur enflammé roulé contre elle : la barricade prend feu avec le combustible de tous ses éléments
    const burning = ctx.props.spawn('conteneur', barricade.x - barricade.halfX - 0.9, barricade.z - 1.3, 0);
    rig.ext.ignite(burning, late.id);
    ctx.props.push(burning, 0, 1, 3.5, late.id);
    rig.step(3);
    expect(ctx.props.get(burning.id)).toBeUndefined();
    expect(barricade.state).toBe('burning');
    expect(barricade.fuel).toBeGreaterThan(2500); // six conteneurs et une corbeille
    rig.step(60, 0.05);
    expect(barricade.burning).toBeGreaterThan(0.8);
    // plusieurs foyers le long de la barricade : fumée et chaleur réparties
    const xs = new Set(hazards.smoke.filter((s) => s.t > 30).map((s) => Math.round(s.x)));
    expect(xs.size).toBeGreaterThanOrEqual(3);
    expect(hazards.fireAt(barricade.x + barricade.halfX * 0.6, barricade.z)).toBeGreaterThan(0.5);
    expect(hazards.fireAt(barricade.x - barricade.halfX * 0.6, barricade.z)).toBeGreaterThan(0.5);
    // un extincteur n'en vient pas à bout ; le canon à eau, qui la couvre en entier, si
    for (let t = 0; t < 18; t += 0.05) {
      hazards.douse(barricade.x, barricade.z, 1.2, 0.05);
      rig.step(0.05, 0.05);
    }
    expect(barricade.state).toBe('burning');
    let seconds = 0;
    while (barricade.state === 'burning' && seconds < 60) {
      hazards.douse(barricade.x, barricade.z, 4.5, 0.15);
      rig.step(0.05, 0.05);
      seconds += 0.05;
    }
    console.log(`[barricade] barricade en feu de 7 éléments éteinte au canon à eau en ${seconds.toFixed(1)} s`);
    expect(barricade.state).not.toBe('burning');
    expect(seconds).toBeLessThan(30);
  });

  it('démontage à la main : un élément toutes les 6 s, reposé hors du passage ; à la fin la rue est libre', async () => {
    const rig = await startProps({ seed: 7 });
    const { ctx } = rig;
    pushRow(rig, [0]);
    rig.step(3);
    const barricade = ctx.props.get(rig.events('barricade:built')[0]!.id)!;
    const cleared: unknown[] = [];
    ctx.events.onAny('props:barricade_cleared', (e) => cleared.push({ ...(e as object) }));
    const crs = rig.person(0, barricade.z - barricade.halfZ - 0.6, { kind: 'crs' });
    crs.aimYaw = 0;
    rig.clearLog();
    const t0 = ctx.clock.now;
    let gestures = 0;
    while (ctx.props.get(barricade.id) && gestures < 20) {
      expect(ctx.interactions.startVerb(crs, 'degager', barricade.id)).toBe(true);
      const cur = ctx.interactions.current(crs)!;
      expect(cur.opt.label).toBe('Dégager la barricade');
      expect(cur.opt.duration).toBe(6);
      rig.step(6.1);
      gestures++;
      expect(ctx.interactions.current(crs)).toBeNull();
    }
    // cinq éléments : quatre gestes, le dernier élément retombe seul quand la barricade se dissout
    expect(gestures).toBe(4);
    console.log(`[barricade] 5 conteneurs dégagés par un agent seul en ${(ctx.clock.now - t0).toFixed(0)} s`);
    expect(cleared.length).toBe(1);
    expect(rig.ext.stats.barricades).toBe(0);
    // les conteneurs sont de nouveau là, de côté, et ne reforment pas la barricade
    const back = ctx.props.list.filter((p) => p.kind === 'conteneur');
    expect(back.length).toBe(5);
    rig.step(3);
    expect(rig.events('barricade:built').length).toBe(0);
    // quatre ont été déposés du côté de l'agent, en retrait
    expect(back.filter((p) => p.z < barricade.z - 1.5).length).toBe(4);
    expect(crs.offenses.length).toBe(0);
  });

  it('enfoncée par la lame d\'un engin en 2 à 5 s : elle éclate en épaves chassées de côté, le passage est rouvert', async () => {
    const rig = await startProps({ seed: 8 });
    const { ctx } = rig;
    pushRow(rig, [0]);
    rig.step(3);
    const barricade = ctx.props.get(rig.events('barricade:built')[0]!.id)!;
    rig.ext.ignite(barricade, 0);
    rig.step(40, 0.05);
    const store = getCore(ctx).stores.vehicles;
    store.registerDef({ ...genericVehicleDef('centaure'), name: 'Engin à lame', length: 6, width: 2.5, canPush: true });
    store.registerDef({ ...genericVehicleDef('voiture'), canPush: false });
    const cleared: unknown[] = [];
    ctx.events.onAny('props:barricade_cleared', (e) => cleared.push({ ...(e as object) }));

    // une voiture sans lame ne l'entame pas (ce module ne gère que la lame ; les chocs relèvent du module des véhicules)
    const car = ctx.vehicles.spawn('voiture', 0, barricade.z - 3.2, 0);
    car.speed = 2;
    for (let i = 0; i < 30; i++) rig.step(0.05, 0.05);
    expect(ctx.props.get(barricade.id)).toBeDefined();
    ctx.vehicles.remove(car.id);

    const engin = ctx.vehicles.spawn('centaure', 0, barricade.z - 6, 0);
    rig.clearLog();
    let contact = -1;
    let through = -1;
    const hp0 = barricade.hp;
    for (let i = 0; i < 400 && through < 0; i++) {
      engin.speed = 1.5;
      engin.vz = 1.5;
      engin.z += 1.5 * 0.05;
      rig.step(0.05, 0.05);
      if (contact < 0 && barricade.hp < hp0 - 1) contact = ctx.clock.now;
      if (!ctx.props.get(barricade.id)) through = ctx.clock.now;
    }
    expect(contact).toBeGreaterThan(0);
    expect(through).toBeGreaterThan(0);
    console.log(`[barricade] lame à 1,5 m/s : barricade de 5 conteneurs en feu enfoncée en ${(through - contact).toFixed(1)} s`);
    expect(through - contact).toBeGreaterThan(1.5);
    expect(through - contact).toBeLessThan(5);
    expect(cleared.length).toBe(1);
    // elle a reculé devant la lame avant de céder
    expect(rig.events('prop:moved').some((e) => e.id === barricade.id)).toBe(true);
    // épaves : cinq conteneurs cassés, renversés, qui ne barrent plus ; quelques-uns brûlent encore
    rig.step(3, 0.05);
    const wrecks = ctx.props.list.filter((p) => p.kind === 'conteneur');
    expect(wrecks.length).toBe(5);
    expect(wrecks.every((p) => p.toppled && !p.blocksMove)).toBe(true);
    const stillBurning = wrecks.filter((p) => p.state === 'burning').length;
    expect(stillBurning).toBeGreaterThanOrEqual(2);
    expect(stillBurning).toBeLessThanOrEqual(4);
    expect(wrecks.filter((p) => p.state === 'broken').length).toBe(5 - stillBurning);
    expect(ctx.props.raycast(0, -10, 0, 10, hit, 'move')).toBe(false);
    // le feu de la barricade a été clos, ceux des épaves ouverts
    expect(rig.events('fire:out').some((e) => e.targetId === barricade.id)).toBe(true);
    expect(rig.events('fire:started').length).toBe(stillBurning);
    rig.step(5);
    expect(rig.events('barricade:built').length).toBe(0); // des épaves ne refont pas une barricade
  });

  it('une barricade créée d\'office (script de mission) est une vraie barricade : éléments, feu, démontage', async () => {
    const rig = await startProps({ seed: 9 });
    const { ctx } = rig;
    const b = ctx.props.spawn('barricade', 0, 0, 0.3);
    const parts = rig.ext.barricadeParts(b.id);
    expect(parts.length).toBe(9);
    expect(b.halfX).toBeCloseTo(2.5, 6);
    expect(b.blocksMove && b.blocksSight && !b.movable).toBe(true);
    expect(b.fuel).toBeGreaterThan(1500);
    expect(rig.ext.ignite(b, 0)).toBe(true);
    rig.ext.extinguish(b, 0);
    expect(rig.events('barricade:built').length).toBe(0); // posée, pas construite
    const crs = rig.person(0, -1.6, { kind: 'crs' });
    expect(ctx.interactions.startVerb(crs, 'degager', b.id)).toBe(true);
    rig.step(6.1);
    expect(rig.ext.barricadeParts(b.id).length).toBe(8);
    // elle brûle jusqu'au bout : carcasse basse qui ne masque plus la vue mais reste en travers
    rig.step(50, 0.05);
    expect(rig.ext.ignite(b, 0)).toBe(true);
    let guard = 0;
    while (b.state === 'burning' && guard++ < 400) rig.step(10, 0.05);
    expect(b.state).toBe('burnt');
    expect(b.blocksSight).toBe(false);
    expect(b.blocksMove).toBe(true);
    expect(b.height).toBeLessThan(0.8);
  });
});
