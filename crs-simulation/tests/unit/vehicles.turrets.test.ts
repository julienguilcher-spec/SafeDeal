// Tourelles : salve du Centaure (projectiles, point d'impact), canon à eau (réservoir, recul, extinction), services.
import { describe, expect, it } from 'vitest';
import type { GameEvents, Person, Projectile, Vec3, Vehicle } from '@/core/contracts';
import { SERVICE_EVENT } from '@/sim/vehicles';
import type { ServiceEvent } from '@/sim/vehicles';
import { createFakeHazards, createFakeWorld, createVehicleBench } from '@/sim/vehicles/testkit';
import type { VehicleBench } from '@/sim/vehicles/testkit';

const G = 9.81;
const DT = 1 / 30;

/** Point de chute d'un projectile en vol libre (sans traînée : aucun module d'objets branché), sur sol plat à y = 0. */
function landing(p: Projectile): { x: number; z: number; t: number; pitch: number } {
  const t = (p.vy + Math.sqrt(p.vy * p.vy + 2 * G * p.y)) / G;
  return { x: p.x + p.vx * t, z: p.z + p.vz * t, t, pitch: Math.atan2(p.vy, Math.hypot(p.vx, p.vz)) };
}

async function centaure(): Promise<{ b: VehicleBench; v: Vehicle; gunner: Person }> {
  const b = await createVehicleBench({ world: createFakeWorld() });
  const v = b.spawn('centaure', 0, 0, 0);
  b.driver(v, 'gendarme');
  const gunner = b.person('gendarme', 0, 0);
  expect(b.ctx.vehicles.enter(gunner, v, 'gunner')).toBe(true);
  return { b, v, gunner };
}

/** Tient la détente du canon pendant `seconds`. */
function spray(b: VehicleBench, v: Vehicle, turret: number, byId: number, seconds: number): void {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    b.ctx.vehicles.fireTurret(v, turret, byId);
    b.step(DT);
  }
}

describe('lance-grenades du Centaure', () => {
  it('un coup : une grenade de 56 mm part en cloche et tombe sur le point désigné', async () => {
    const { b, v, gunner } = await centaure();
    b.ext.tuning.dispersion = 0;
    const fired: GameEvents['vehicle:turret_fired'][] = [];
    b.ctx.events.on('vehicle:turret_fired', (e) => fired.push({ ...e }));
    expect(b.ext.aimTurretAt(v, 0, 30, 0, 90)).toBe(true);
    b.step(3); // le tourelleau se pointe
    expect(b.ext.turretStatus(v, 0).inRange).toBe(true);
    expect(b.ctx.vehicles.fireTurret(v, 0, gunner.id)).toBe(true);
    expect(b.ctx.projectiles.list.length).toBe(1);
    const p = b.ctx.projectiles.list[0]!;
    expect(p.kind).toBe('grenade_lacrymo_56');
    expect(p.ownerId).toBe(gunner.id);
    expect(p.y).toBeGreaterThan(3); // part du toit
    const hit = landing(p);
    expect(Math.hypot(hit.x - 30, hit.z - 90)).toBeLessThan(0.6);
    expect(hit.pitch).toBeGreaterThan(Math.PI / 4); // tir en cloche, jamais tendu
    expect(hit.t).toBeGreaterThan(3);
    expect(v.turretAmmo[0]).toBe(29);
    expect(fired).toEqual([{ id: v.id, turret: 0, byId: gunner.id }]);
    // prévision du point de chute par le service : même endroit
    const out: Vec3 = { x: 0, y: 0, z: 0 };
    expect(b.ext.predictImpact(v, 0, out)).toBe(true);
    expect(Math.hypot(out.x - 30, out.z - 90)).toBeLessThan(0.6);
  });

  it('une salve de 6 : six projectiles à 0,3 s d\'intervalle, en éventail autour du point visé', async () => {
    const { b, v, gunner } = await centaure();
    const spawnedAt: number[] = [];
    b.ctx.events.on('projectile:spawned', () => spawnedAt.push(b.ctx.clock.now));
    b.ext.aimTurretAt(v, 0, 0, 0, 120);
    expect(b.ext.setSalvo(v, 0, 6)).toBe(6);
    b.step(3);
    expect(b.ctx.vehicles.fireTurret(v, 0, gunner.id)).toBe(true);
    expect(b.ctx.projectiles.list.length).toBe(1); // le premier part tout de suite
    expect(b.ext.turretStatus(v, 0).firing).toBe(true);
    expect(b.ctx.vehicles.fireTurret(v, 0, gunner.id)).toBe(false); // salve en cours
    b.step(2.5);
    const list = b.ctx.projectiles.list;
    expect(list.length).toBe(6);
    expect(v.turretAmmo[0]).toBe(24);
    expect(b.ext.turretStatus(v, 0).firing).toBe(false);
    for (let i = 1; i < spawnedAt.length; i++) {
      expect(spawnedAt[i]! - spawnedAt[i - 1]!).toBeGreaterThan(0.25);
      expect(spawnedAt[i]! - spawnedAt[i - 1]!).toBeLessThan(0.4);
    }
    const hits = list.map(landing);
    const cx = hits.reduce((s, h) => s + h.x, 0) / hits.length;
    const cz = hits.reduce((s, h) => s + h.z, 0) / hits.length;
    console.log(`salve de 6 à 120 m : centre (${cx.toFixed(1)}, ${cz.toFixed(1)}), largeur ${(Math.max(...hits.map((h) => h.x)) - Math.min(...hits.map((h) => h.x))).toFixed(1)} m`);
    expect(Math.hypot(cx, cz - 120)).toBeLessThan(3); // la nappe est centrée sur le point désigné
    for (const h of hits) {
      expect(Math.abs(h.z - 120)).toBeLessThan(6);
      expect(h.pitch).toBeGreaterThan(Math.PI / 4);
    }
    const width = Math.max(...hits.map((h) => h.x)) - Math.min(...hits.map((h) => h.x));
    expect(width).toBeGreaterThan(5); // éventail
    expect(width).toBeLessThan(16);
    // emploi de la force déclaré une fois pour la salve, au point visé
    const log = b.ctx.law.forceLog;
    expect(log.length).toBe(1);
    expect(log[0]!.means).toBe('lacrymo');
    expect(log[0]!.byId).toBe(gunner.id);
    expect(log[0]!.z).toBeCloseTo(120, 3);
  });

  it('une salve complète de 30 couvre une nappe large et vide le tourelleau', async () => {
    const { b, v, gunner } = await centaure();
    b.ext.aimTurretAt(v, 0, 0, 0, 150);
    b.ext.setSalvo(v, 0, 99); // borné à la capacité
    expect(b.ext.turretStatus(v, 0).salvo).toBe(30);
    b.step(3);
    b.ctx.vehicles.fireTurret(v, 0, gunner.id);
    b.step(10);
    expect(b.ctx.projectiles.list.length).toBe(30);
    expect(v.turretAmmo[0]).toBe(0);
    const xs = b.ctx.projectiles.list.map((p) => landing(p).x);
    const width = Math.max(...xs) - Math.min(...xs);
    expect(width).toBeGreaterThan(40); // 20 à 60 m selon le nombre de coups
    expect(width).toBeLessThan(70);
    expect(b.ctx.vehicles.fireTurret(v, 0, gunner.id)).toBe(false); // vide
  });

  it('choisit la charge selon la distance (50 / 100 / 200 m) et refuse ce qui est hors d\'atteinte', async () => {
    const { b, v, gunner } = await centaure();
    b.ext.tuning.dispersion = 0;
    const speeds: number[] = [];
    for (const d of [35, 80, 180]) {
      expect(b.ext.aimTurretAt(v, 0, 0, 0, d), `${d} m`).toBe(true);
      b.step(3);
      const before = b.ctx.projectiles.list.length;
      expect(b.ctx.vehicles.fireTurret(v, 0, gunner.id)).toBe(true);
      const p = b.ctx.projectiles.list[before]!;
      speeds.push(Math.hypot(p.vx, p.vy, p.vz));
      expect(Math.abs(landing(p).z - d), `${d} m`).toBeLessThan(0.8);
      b.step(1);
    }
    expect(speeds[0]!).toBeCloseTo(Math.sqrt(G * 50), 1);
    expect(speeds[1]!).toBeCloseTo(Math.sqrt(G * 100), 1);
    expect(speeds[2]!).toBeCloseTo(Math.sqrt(G * 200), 1);
    expect(b.ext.aimTurretAt(v, 0, 0, 0, 260)).toBe(false); // au-delà de 200 m
    expect(b.ext.aimTurretAt(v, 0, 0, 0, 6)).toBe(false); // trop près pour un tir en cloche
    expect(b.ext.turretStatus(v, 0).inRange).toBe(false);
  });

  it('borne l\'orientation par TurretDef, limite la vitesse de pointage et suit le point quand l\'engin tourne', async () => {
    const { b, v } = await centaure();
    const def = v.def.turrets[0]!;
    expect(v.turretPitch[0]).toBe(def.pitchMin); // au repos : dans le débattement
    // écriture directe par un contrôleur : bornée, et limitée à la vitesse de pointage (1,2 rad/s en lacet)
    v.turretPitch[0] = -1;
    v.turretYaw[0] = 2;
    b.step(DT);
    expect(v.turretPitch[0]).toBe(def.pitchMin);
    expect(v.turretYaw[0]!).toBeGreaterThan(0);
    expect(v.turretYaw[0]!).toBeLessThan(0.1);
    // orientation demandée au service : rejointe progressivement, puis tenue
    b.ext.aimTurret(v, 0, 2, 3);
    b.step(0.5);
    expect(v.turretYaw[0]!).toBeGreaterThan(0.4);
    expect(v.turretYaw[0]!).toBeLessThan(0.75);
    b.step(4);
    expect(v.turretYaw[0]).toBeCloseTo(2, 6);
    expect(v.turretPitch[0]).toBeCloseTo(def.pitchMax, 6); // 3 rad demandés : butée haute
    b.ext.aimTurret(v, 0, 0, -1);
    b.step(4);
    expect(v.turretPitch[0]).toBeCloseTo(def.pitchMin, 6); // butée basse
    // canon à eau : lacet borné
    const ele = b.spawn('canon_eau', 100, 0, 0);
    b.ext.aimTurret(ele, 0, 3.1, 0);
    b.step(5);
    expect(ele.turretYaw[0]).toBeCloseTo(ele.def.turrets[0]!.yawMax, 6);
    // point désigné : la tourelle reste dessus pendant que le véhicule pivote
    b.ext.aimTurretAt(v, 0, 60, 0, 60);
    b.step(4);
    const world1 = v.heading - v.turretYaw[0]!; // gisement positif = vers la droite
    expect(Math.sin(world1)).toBeCloseTo(Math.SQRT1_2, 1);
    v.cmd.throttle = 0.5;
    v.cmd.steer = 1;
    b.step(4);
    expect(Math.abs(v.heading)).toBeGreaterThan(0.3);
    const dx = 60 - v.x;
    const dz = 60 - v.z;
    const want = Math.atan2(dx, dz);
    const got = v.heading - v.turretYaw[0]!;
    expect(Math.abs(Math.atan2(Math.sin(got - want), Math.cos(got - want)))).toBeLessThan(0.08);
  });

  it('se recharge à l\'arrêt seulement : 120 s pour 30 tubes, une seule recharge emportée', async () => {
    const { b, v, gunner } = await centaure();
    const service: ServiceEvent[] = [];
    b.ctx.events.onAny(SERVICE_EVENT, (e) => service.push({ ...(e as ServiceEvent) }));
    b.ext.aimTurretAt(v, 0, 0, 0, 100);
    b.ext.setSalvo(v, 0, 30);
    b.step(2);
    b.ctx.vehicles.fireTurret(v, 0, gunner.id);
    b.step(10);
    expect(v.turretAmmo[0]).toBe(0);
    expect(b.ext.turretStatus(v, 0).reserve).toBe(30);
    // en roulant : impossible
    v.cmd.throttle = 1;
    b.step(3);
    expect(b.ext.reloadTurret(v, 0)).toBe(false);
    v.cmd.throttle = 0;
    v.cmd.brake = 1;
    b.step(6);
    // à l'arrêt, l'équipage recharge de lui-même au bout de quelques secondes
    expect(b.ext.turretStatus(v, 0).service).toBeGreaterThanOrEqual(0);
    expect(b.ctx.vehicles.fireTurret(v, 0, gunner.id)).toBe(false);
    b.step(60);
    expect(v.turretAmmo[0]).toBe(0);
    expect(b.ext.turretStatus(v, 0).service).toBeGreaterThan(0.3);
    expect(b.ext.turretStatus(v, 0).service).toBeLessThan(0.7);
    b.step(62);
    expect(v.turretAmmo[0]).toBe(30);
    expect(b.ext.turretStatus(v, 0).reserve).toBe(0);
    expect(service.map((e) => `${e.type}:${e.state}`)).toEqual(['rechargement:debut', 'rechargement:fin']);
    // deuxième salve possible, mais plus de rechargement ensuite
    b.ctx.vehicles.fireTurret(v, 0, gunner.id);
    b.step(10);
    expect(v.turretAmmo[0]).toBe(0);
    b.step(20);
    expect(b.ext.reloadTurret(v, 0)).toBe(false);
    expect(b.ext.turretStatus(v, 0).service).toBe(-1);
  });

  it('un rechargement est interrompu si l\'engin repart ; une épave ne tire plus', async () => {
    const { b, v, gunner } = await centaure();
    b.ext.setSalvo(v, 0, 10);
    b.ctx.vehicles.fireTurret(v, 0, gunner.id);
    b.step(4);
    expect(v.turretAmmo[0]).toBe(20);
    expect(b.ext.reloadTurret(v, 0)).toBe(true);
    b.step(5);
    v.cmd.throttle = 1;
    b.step(3);
    expect(b.ext.turretStatus(v, 0).service).toBe(-1);
    expect(v.turretAmmo[0]).toBe(20);
    b.ctx.vehicles.damage(v, { amount: 5000, kind: 'blast', sourceId: 0, x: 0, z: 0 });
    expect(v.state).toBe('wrecked');
    expect(b.ctx.vehicles.fireTurret(v, 0, gunner.id)).toBe(false);
  });

  it('la caméra sur mât s\'oriente et se déploie, mais ne tire pas', async () => {
    const { b, v, gunner } = await centaure();
    expect(v.def.turrets[1]!.kind).toBe('camera');
    expect(b.ctx.vehicles.fireTurret(v, 1, gunner.id)).toBe(false);
    expect(b.ctx.vehicles.fireTurret(v, 7, gunner.id)).toBe(false);
    b.ext.setMast(v, true);
    b.step(1);
    expect(b.ext.turretStatus(v, 1).mast).toBeGreaterThan(0.3);
    expect(b.ext.turretStatus(v, 1).mast).toBeLessThan(0.7);
    b.step(2);
    expect(b.ext.turretStatus(v, 1).mast).toBe(1);
    expect(b.ext.aimTurretAt(v, 1, -50, 0, 20)).toBe(true);
    b.step(3);
    expect(Math.sin(v.heading - v.turretYaw[1]!)).toBeLessThan(-0.9);
    expect(v.turretYaw[1]!).toBeGreaterThan(1); // cible à l'ouest, cap au sud : à DROITE du véhicule
    // en roulant, le mât se rentre de lui-même
    v.cmd.throttle = 1;
    b.step(12);
    expect(v.speed).toBeGreaterThan(6);
    expect(b.ext.turretStatus(v, 1).mast).toBe(0);
  });
});

describe('canon à eau', () => {
  async function ele(hazards = createFakeHazards(), boxes: Parameters<typeof createFakeWorld>[0] = {}): Promise<{ b: VehicleBench; v: Vehicle; op: Person }> {
    const b = await createVehicleBench({ world: createFakeWorld(boxes), hazards });
    const v = b.spawn('canon_eau', 0, 0, 0);
    b.driver(v, 'crs');
    const op = b.person('crs', 0, 0);
    op.poste = 'operateur';
    expect(b.ctx.vehicles.enter(op, v, 'gunner')).toBe(true);
    expect(b.ext.turretOfSeat(v, op.seat)).toBe(0);
    return { b, v, op };
  }

  it('la cuve se vide au débit du mode tant que la détente est tenue, et seulement alors', async () => {
    const { b, v, op } = await ele();
    expect(v.turretAmmo).toEqual([10000, 10000]);
    spray(b, v, 0, op.id, 10);
    const used = 10000 - v.turretAmmo[0]!;
    expect(used).toBeGreaterThan(145); // 15 l/s en jet droit
    expect(used).toBeLessThan(156);
    expect(v.turretAmmo[1]).toBe(v.turretAmmo[0]); // une seule cuve pour les deux canons
    expect(b.ext.turretStatus(v, 0).firing).toBe(true);
    b.step(1); // détente relâchée
    const level = v.turretAmmo[0]!;
    expect(b.ext.turretStatus(v, 0).firing).toBe(false);
    b.step(5);
    expect(v.turretAmmo[0]).toBe(level);
    b.ext.setJetMode(v, 0, 'diffus');
    spray(b, v, 0, op.id, 10);
    expect(level - v.turretAmmo[0]!).toBeGreaterThan(115); // 12 l/s
    expect(level - v.turretAmmo[0]!).toBeLessThan(126);
    const level2 = v.turretAmmo[0]!;
    b.step(1);
    b.ext.setJetMode(v, 0, 'pluie');
    spray(b, v, 0, op.id, 10);
    expect(level2 - v.turretAmmo[0]!).toBeGreaterThan(76); // 8 l/s
    expect(level2 - v.turretAmmo[0]!).toBeLessThan(86);
    // autonomie : 10 000 l à 15 l/s ≈ 11 min de jet droit
    expect(10000 / 15 / 60).toBeGreaterThan(10);
  });

  it('demande les effets : fx « jet_eau », sfx « canon_eau », vehicle:turret_fired répété pendant le jet', async () => {
    const { b, v, op } = await ele();
    const fx: GameEvents['fx'][] = [];
    const sfx: GameEvents['sfx'][] = [];
    const fired: number[] = [];
    b.ctx.events.on('fx', (e) => fx.push({ ...e }));
    b.ctx.events.on('sfx', (e) => sfx.push({ ...e }));
    b.ctx.events.on('vehicle:turret_fired', () => fired.push(b.ctx.clock.now));
    b.ext.aimTurretAt(v, 0, 0, 0, 30);
    b.step(2);
    spray(b, v, 0, op.id, 3);
    const jets = fx.filter((e) => e.id === 'jet_eau');
    expect(jets.length).toBeGreaterThan(20); // dix fois par seconde
    expect(jets[5]!.y).toBeGreaterThan(3); // part de la buse, sur le toit
    expect(jets[5]!.dirZ!).toBeGreaterThan(0.9);
    expect(jets[5]!.size!).toBeGreaterThan(25); // longueur du jet
    expect(jets[5]!.size!).toBeLessThan(33);
    expect(fx.some((e) => e.id === 'eclaboussure' && Math.abs(e.z - 30) < 2)).toBe(true);
    expect(sfx.filter((e) => e.id === 'canon_eau').length).toBe(1); // une demande par jet
    expect(fired.length).toBeGreaterThanOrEqual(5);
    for (let i = 1; i < fired.length; i++) expect(fired[i]! - fired[i - 1]!).toBeLessThan(0.7); // tient la boucle sonore
  });

  it('repousse et mouille les personnes prises dans le jet ; le tireur policier déclare l\'emploi de la force', async () => {
    const { b, v, op } = await ele();
    const hurts: GameEvents['person:hurt'][] = [];
    b.ctx.events.on('person:hurt', (e) => hurts.push(e));
    const target = b.person('manifestant', 0, 30);
    const beside = b.person('manifestant', 0.8, 30.5);
    const aside = b.person('passant', 9, 30); // hors du jet
    const beyond = b.person('passant', 0, 75); // au-delà de la portée
    b.ext.aimTurretAt(v, 0, 0, 0.3, 30); // on vise les jambes
    b.step(2);
    spray(b, v, 0, op.id, 3);
    const mine = hurts.filter((h) => h.id === target.id);
    expect(mine.length).toBeGreaterThan(5); // cinq fois par seconde tant qu'il reste dans le jet
    expect(mine.length).toBeLessThan(20);
    const first = mine[0]!.info;
    expect(first.kind).toBe('water');
    expect(first.means).toBe('canon_eau');
    expect(first.sourceId).toBe(op.id);
    expect(first.knockback).toBeGreaterThan(1.8); // 2 à 3 m/s en jet droit
    expect(first.knockback).toBeLessThan(3.2);
    expect(first.dirZ!).toBeGreaterThan(0.9); // dans l'axe du jet
    expect(first.zone!).toBeLessThan(0.6); // visé bas
    expect(first.amount).toBeLessThan(1);
    expect(target.z).toBeGreaterThan(32); // repoussé
    expect(target.wet).toBeGreaterThan(0.3);
    expect(target.health).toBeGreaterThan(95); // le jet ne blesse presque pas à cette distance
    expect(hurts.some((h) => h.id === beside.id)).toBe(true);
    expect(hurts.some((h) => h.id === aside.id)).toBe(false);
    expect(hurts.some((h) => h.id === beyond.id)).toBe(false);
    expect(aside.wet).toBe(0);
    const log = b.ctx.law.forceLog.filter((r) => r.means === 'canon_eau');
    expect(log.length).toBeGreaterThanOrEqual(1);
    expect(log.length).toBeLessThanOrEqual(3); // pas une déclaration par goutte
    expect(log[0]!.byId).toBe(op.id);
    expect([target.id, beside.id]).toContain(log[0]!.targetId);
  });

  it('en jet droit à moins de 15 m le recul jette à terre ; diffusé il repousse doucement ; en pluie il trempe sans pousser', async () => {
    const { b, v, op } = await ele();
    const hurts: GameEvents['person:hurt'][] = [];
    b.ctx.events.on('person:hurt', (e) => hurts.push(e));
    const close = b.person('manifestant', 0, 16); // 13 m devant la buse
    b.ext.aimTurretAt(v, 0, 0, 0.5, 16);
    b.step(2);
    spray(b, v, 0, op.id, 0.6);
    const hit = hurts.find((h) => h.id === close.id)!;
    expect(hit).toBeDefined();
    expect(hit.info.knockback).toBeGreaterThan(4.2);
    expect(hit.info.amount).toBeGreaterThan(1);
    b.step(1);
    hurts.length = 0;
    const p2 = b.person('manifestant', 0, 18);
    b.ext.setJetMode(v, 0, 'diffus');
    b.ext.aimTurretAt(v, 0, 0, 0.5, 18);
    b.step(2);
    spray(b, v, 0, op.id, 1);
    const soft = hurts.find((h) => h.id === p2.id)!;
    expect(soft).toBeDefined();
    expect(soft.info.knockback).toBeCloseTo(1, 5);
    b.step(1);
    hurts.length = 0;
    const p3 = b.person('manifestant', 0, 38);
    b.ext.setJetMode(v, 0, 'pluie');
    b.ext.aimTurretAt(v, 0, 0, 0, 38);
    b.step(2);
    const z = p3.z;
    spray(b, v, 0, op.id, 2);
    const rain = hurts.find((h) => h.id === p3.id)!;
    expect(rain).toBeDefined();
    expect(rain.info.knockback).toBe(0);
    expect(rain.info.amount).toBe(0);
    expect(p3.wet).toBeGreaterThan(0.2);
    expect(p3.z).toBe(z);
  });

  it('éteint un feu au sol (ctx.hazards.douse) et un véhicule en flammes', async () => {
    const hz = createFakeHazards();
    const { b, v, op } = await ele(hz);
    b.ext.tuning.explosionChance = 0;
    hz.fires.push({ x: 2, z: 28, radius: 1.5, intensity: 1, sourceId: 0 });
    expect(hz.fireAt(2, 28)).toBe(1);
    b.ext.aimTurretAt(v, 0, 2, 0, 28);
    b.step(2);
    let t = 0;
    while (hz.fires.length > 0 && t < 20) {
      spray(b, v, 0, op.id, 0.5);
      t += 0.5;
    }
    console.log(`feu au sol éteint au canon à eau en ${t.toFixed(1)} s (${hz.doused.toFixed(1)} unités d'agent)`);
    expect(hz.fires.length).toBe(0);
    expect(t).toBeGreaterThan(1);
    expect(t).toBeLessThan(8);
    expect(hz.douses.length).toBeGreaterThan(5);
    for (const d of hz.douses) expect(Math.hypot(d.x - 2, d.z - 28)).toBeLessThan(2.5);
    // véhicule embrasé à 25 m : éteint en une vingtaine de secondes de jet
    const out: GameEvents['fire:out'][] = [];
    b.ctx.events.on('fire:out', (e) => out.push({ ...e }));
    b.step(1);
    const car = b.spawn('voiture', -3, 26, Math.PI / 2);
    b.ext.ignite(car, 0, 1);
    b.ext.aimTurretAt(v, 0, -3, 0.5, 26);
    b.step(2);
    t = 0;
    while (car.state === 'burning' && t < 60) {
      spray(b, v, 0, op.id, 1);
      t += 1;
    }
    console.log(`voiture embrasée éteinte au canon à eau en ${t.toFixed(0)} s`);
    expect(car.state).toBe('burnt');
    expect(t).toBeGreaterThan(12);
    expect(t).toBeLessThan(35);
    expect(out.length).toBe(1);
    expect(out[0]!.byId).toBe(op.id);
    // éteindre n'est pas un emploi de la force
    expect(b.ctx.law.forceLog.length).toBe(0);
  });

  it('le jet s\'arrête contre un mur plus haut que lui : personne n\'est touché derrière', async () => {
    const { b, v, op } = await ele(createFakeHazards(), { boxes: [{ minX: -10, maxX: 10, minZ: 20, maxZ: 21, height: 12 }] });
    const hurts: GameEvents['person:hurt'][] = [];
    b.ctx.events.on('person:hurt', (e) => hurts.push(e));
    const hidden = b.person('manifestant', 0, 26);
    const exposed = b.person('manifestant', 0, 19.3); // au pied du mur, côté canon
    b.ext.aimTurretAt(v, 0, 0, 0.5, 26);
    b.step(2);
    spray(b, v, 0, op.id, 2);
    expect(hurts.some((h) => h.id === hidden.id)).toBe(false);
    expect(b.ext.turretStatus(v, 0).firing).toBe(true);
    // celui qui est devant le mur, dans l'axe, reçoit le jet
    expect(hurts.some((h) => h.id === exposed.id)).toBe(true);
  });

  it('renverse les objets légers au point d\'impact', async () => {
    const { b, v, op } = await ele();
    const bin = b.ctx.props.spawn('poubelle', 0, 30, 0);
    const bench = b.ctx.props.spawn('banc', 1.5, 30, 0);
    b.ext.aimTurretAt(v, 0, 0, 0, 30);
    b.step(2);
    spray(b, v, 0, op.id, 2);
    expect(bin.toppled).toBe(true);
    expect(bin.z).toBeGreaterThan(30.3); // chassée par le jet
    expect(bench.toppled).toBe(false);
    expect(bench.z).toBe(30);
  });

  it('se ravitaille à l\'arrêt en 90 s pour une cuve vide ; rouler interrompt le plein', async () => {
    const { b, v, op } = await ele();
    const service: ServiceEvent[] = [];
    b.ctx.events.onAny(SERVICE_EVENT, (e) => service.push({ ...(e as ServiceEvent) }));
    expect(b.ext.refill(v)).toBe(false); // déjà pleine
    v.turretAmmo[0] = 0;
    v.turretAmmo[1] = 0;
    expect(b.ctx.vehicles.fireTurret(v, 0, op.id)).toBe(false); // cuve vide
    expect(b.ext.refill(v)).toBe(true);
    b.step(45);
    expect(v.turretAmmo[0]!).toBeGreaterThan(4800);
    expect(v.turretAmmo[0]!).toBeLessThan(5200);
    expect(v.turretAmmo[1]).toBe(v.turretAmmo[0]);
    v.cmd.throttle = 1;
    b.step(4);
    const level = v.turretAmmo[0]!;
    b.step(5);
    expect(v.turretAmmo[0]).toBe(level); // interrompu
    v.cmd.throttle = 0;
    v.cmd.brake = 1;
    b.step(8);
    expect(b.ext.refill(v)).toBe(true);
    b.step(50);
    expect(v.turretAmmo[0]).toBe(10000);
    expect(service.map((e) => `${e.type}:${e.state}`)).toEqual([
      'ravitaillement:debut', 'ravitaillement:interrompu', 'ravitaillement:debut', 'ravitaillement:fin',
    ]);
  });

  it('la lance du fourgon-pompe porte à 25 m, éteint, et n\'est jamais un emploi de la force', async () => {
    const hz = createFakeHazards();
    const b = await createVehicleBench({ world: createFakeWorld(), hazards: hz });
    const truck = b.spawn('camion_pompiers', 0, 0, 0);
    b.driver(truck, 'pompier');
    const chief = b.person('pompier', 0, 0);
    b.ctx.vehicles.enter(chief, truck, 'gunner');
    expect(truck.turretAmmo[0]).toBe(3000);
    hz.fires.push({ x: 0, z: 20, radius: 1.2, intensity: 1, sourceId: 0 });
    const bystander = b.person('passant', 0, 19);
    expect(b.ext.aimTurretAt(truck, 0, 0, 0, 20)).toBe(true);
    expect(b.ext.aimTurretAt(truck, 0, 0, 0, 45)).toBe(false); // hors de portée
    b.ext.aimTurretAt(truck, 0, 0, 0, 20);
    b.step(3);
    spray(b, truck, 0, chief.id, 6);
    expect(hz.fires.length).toBe(0);
    expect(3000 - truck.turretAmmo[0]!).toBeGreaterThan(45); // 8 l/s
    expect(3000 - truck.turretAmmo[0]!).toBeLessThan(51);
    expect(b.ctx.law.forceLog.length).toBe(0);
    expect(bystander.wet).toBeGreaterThan(0);
    expect(bystander.health).toBe(100);
  });
});
