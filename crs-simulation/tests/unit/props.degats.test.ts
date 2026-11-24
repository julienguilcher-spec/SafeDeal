// Décor dynamique — dégâts selon l'objet et le coup, états, vitrages, renversement, souffle, infractions.
import { describe, expect, it } from 'vitest';
import type { Prop } from '@/core/contracts';
import { materialFactor, propDef, PROP_DEFS } from '@/sim/props';
import { startProps } from '@/sim/props/testkit';

/** Dégâts des objets du jeu (src/sim/items/specs.ts) : marteau sur un objet, pavé lancé. */
const MARTEAU = 18;
const PAVE = 14;

describe('gabarits', () => {
  it('chaque type d\'objet du contrat a un gabarit cohérent', () => {
    const kinds = [
      'poubelle', 'conteneur', 'barriere_vauban', 'barriere_chantier', 'banc', 'abribus', 'kiosque', 'colonne_morris',
      'panneau_pub', 'potelet', 'velo', 'trottinette', 'palette', 'pile_paves', 'table_terrasse', 'chaise', 'candelabre',
      'feu_tricolore', 'distributeur', 'fontaine_wallace', 'barricade', 'debris', 'cone', 'jardiniere', 'echafaudage',
      'sanisette', 'station_velo',
    ];
    for (const kind of kinds) expect(propDef(kind).kind, kind).toBe(kind);
    for (const d of PROP_DEFS) {
      expect(d.halfX, d.kind).toBeGreaterThan(0);
      expect(d.halfZ, d.kind).toBeGreaterThan(0);
      expect(d.height, d.kind).toBeGreaterThan(0);
      expect(d.hp, d.kind).toBeGreaterThan(0);
      expect(d.label.length, d.kind).toBeGreaterThan(3);
      if (d.fuel > 0) expect(d.igniteSeconds, d.kind).toBeGreaterThanOrEqual(5);
      if (d.glassHp > 0) expect(d.panes, d.kind).toBeGreaterThan(0);
      if (d.carry !== 'non') expect(d.movable, d.kind).toBe(true);
      if (d.bulk > 0 && d.kind !== 'barricade') expect(d.movable, d.kind).toBe(true);
    }
    // un type inconnu reçoit un gabarit générique utilisable
    expect(propDef('objet_inconnu').hp).toBeGreaterThan(0);
    // le marteau entame le plastique, presque pas l'acier, pas du tout la pierre ; le gaz et l'eau n'abîment rien
    expect(materialFactor('plastique', 'blunt')).toBeGreaterThan(materialFactor('metal', 'blunt'));
    expect(materialFactor('pierre', 'blunt')).toBeLessThan(0.1);
    expect(materialFactor('metal', 'gas')).toBe(0);
    expect(materialFactor('bois', 'water')).toBe(0);
  });
});

describe('dégâts aux objets', () => {
  it('une corbeille passe d\'intacte à endommagée puis cassée sous les coups de marteau ; l\'auteur est poursuivi', async () => {
    const rig = await startProps();
    const { ctx } = rig;
    const casseur = rig.person(0, -1.2);
    const bin = ctx.props.spawn('poubelle', 0, 0, 0);
    expect(rig.events('prop:spawned').map((e) => e.id)).toContain(bin.id);
    expect(bin.state).toBe('intact');
    ctx.props.damage(bin, MARTEAU, 'blunt', casseur.id);
    expect(bin.state).toBe('damaged');
    expect(bin.hp).toBeCloseTo(20 - MARTEAU * 0.6, 6);
    expect(rig.events('prop:damaged')).toEqual([{ name: 'prop:damaged', id: bin.id, state: 'damaged', byId: casseur.id }]);
    rig.step(1.5);
    ctx.props.damage(bin, MARTEAU, 'blunt', casseur.id);
    expect(bin.state).toBe('broken');
    expect(bin.hp).toBe(0);
    expect(bin.toppled).toBe(true);
    expect(bin.blocksMove).toBe(false); // une corbeille écrasée ne gêne plus le passage
    expect(rig.events('prop:damaged').map((e) => e.state)).toEqual(['damaged', 'broken']);
    // infractions et tension
    expect(casseur.offenses.map((o) => o.type)).toEqual(['degradation', 'degradation']);
    expect(casseur.offenses[0]!.x).toBe(0);
    expect(rig.director.added.map((a) => a.amount)).toEqual([0.01, 0.02]);
    // un coup de plus sur l'épave ne change rien
    ctx.props.damage(bin, MARTEAU, 'blunt', casseur.id);
    expect(rig.events('prop:damaged').length).toBe(2);
  });

  it('les forces de l\'ordre et les causes inconnues ne sont pas poursuivies ; le gaz et l\'eau n\'abîment rien', async () => {
    const rig = await startProps();
    const { ctx } = rig;
    const crs = rig.person(0, -1, { kind: 'crs' });
    expect(crs.faction).toBe('police');
    const bin = ctx.props.spawn('poubelle', 0, 0, 0);
    ctx.props.damage(bin, 100, 'gas', crs.id);
    ctx.props.damage(bin, 100, 'water', crs.id);
    expect(bin.hp).toBe(20);
    ctx.props.damage(bin, 60, 'blunt', crs.id);
    expect(bin.state).toBe('broken');
    expect(crs.offenses.length).toBe(0);
    const other = ctx.props.spawn('poubelle', 5, 0, 0);
    ctx.props.damage(other, 60, 'vehicle', 0);
    expect(other.state).toBe('broken');
    expect(rig.director.added.length).toBe(0);
    // valeurs absurdes ignorées
    const third = ctx.props.spawn('poubelle', 9, 0, 0);
    ctx.props.damage(third, NaN, 'blunt', 0);
    ctx.props.damage(third, -5, 'blunt', 0);
    ctx.props.damage(third, Infinity, 'blunt', 0);
    expect(third.hp).toBe(20);
  });

  it('un abribus se saccage panneau après panneau : éclats de verre, bruit de verre, structure debout', async () => {
    const rig = await startProps();
    const { ctx } = rig;
    const casseur = rig.person(0, -2);
    const bus = ctx.props.spawn('abribus', 0, 0, 0);
    const glass: { id: number; panesLeft: number; byId: number }[] = [];
    ctx.events.onAny('props:glass', (e) => glass.push({ ...(e as { id: number; panesLeft: number; byId: number }) }));
    let hits = 0;
    while (rig.ext.propView(bus)!.panesLeft > 0 && hits < 30) {
      ctx.props.damage(bus, MARTEAU, 'blunt', casseur.id);
      hits++;
      rig.step(1.2); // un coup toutes les 1,2 s
    }
    // « abribus 15 à 30 s » à plusieurs ; seul, 7 coups de marteau
    expect(hits).toBe(7);
    expect(glass.map((g) => g.panesLeft)).toEqual([3, 2, 1, 0]);
    expect(glass.every((g) => g.id === bus.id && g.byId === casseur.id)).toBe(true);
    expect(rig.events('fx').filter((e) => e.id === 'eclats_verre').length).toBe(4);
    expect(rig.events('sfx').filter((e) => e.id === 'verre_brise').length).toBe(4);
    expect(bus.state).toBe('damaged');
    expect(bus.blocksMove).toBe(true);
    expect(bus.hp).toBeGreaterThan(150); // l'acier n'a presque rien senti
    expect(casseur.offenses.length).toBeGreaterThanOrEqual(4);
    expect(casseur.offenses.every((o) => o.type === 'degradation')).toBe(true);
    // la structure ne cède qu'à un choc de véhicule
    ctx.props.damage(bus, 400, 'vehicle', 0);
    expect(bus.state).toBe('broken');
    expect(bus.blocksMove).toBe(true); // une structure tordue reste en travers
    expect(ctx.props.list.filter((p) => p.kind === 'debris').length).toBe(1);
  });

  it('panneau publicitaire, distributeur de billets et caméra : le verre d\'abord, selon ce qui peut l\'atteindre', async () => {
    const rig = await startProps();
    const { ctx } = rig;
    const pub = ctx.props.spawn('panneau_pub', 0, 0, 0);
    ctx.props.damage(pub, PAVE, 'impact', 0); // un pavé : 35 points sur le verre, une face éclate
    expect(rig.ext.propView(pub)!.panesLeft).toBe(1);
    ctx.props.damage(pub, PAVE, 'impact', 0);
    expect(rig.ext.propView(pub)!.panesLeft).toBe(0);
    expect(pub.state).toBe('damaged');
    expect(pub.blocksSight).toBe(true); // l'affiche est toujours là

    const dab = ctx.props.spawn('distributeur', 5, 0, 0);
    ctx.props.damage(dab, MARTEAU, 'blunt', 0);
    expect(rig.ext.propView(dab)!.panesLeft).toBe(0); // l'écran n'y résiste pas
    expect(dab.state).toBe('damaged');
    for (let i = 0; i < 40; i++) ctx.props.damage(dab, MARTEAU, 'blunt', 0);
    expect(dab.state).toBe('damaged'); // le coffre, lui, tient (400 points d'acier)
    expect(dab.hp).toBeGreaterThan(200);

    const cam = ctx.props.spawn('camera', 10, 0, 0);
    ctx.props.damage(cam, 60, 'blunt', 0); // à 5 m de haut : hors de portée d'un coup
    expect(rig.ext.propView(cam)!.panesLeft).toBe(1);
    ctx.props.damage(cam, PAVE, 'impact', 0);
    expect(rig.ext.propView(cam)!.panesLeft).toBe(0);
  });

  it('tag : compté sur l\'objet, infraction « tag », tension légère', async () => {
    const rig = await startProps();
    const tagueur = rig.person(0, -1);
    const col = rig.ctx.props.spawn('colonne_morris', 0, 0, 0);
    rig.ctx.props.tag(col, tagueur.id);
    rig.step(2);
    rig.ctx.props.tag(col, tagueur.id);
    expect(col.tags).toBe(2);
    expect(col.state).toBe('intact');
    expect(tagueur.offenses.map((o) => o.type)).toEqual(['tag', 'tag']);
    expect(rig.director.totalAdded()).toBeCloseTo(0.02, 6);
  });
});

describe('poussée et renversement', () => {
  it('une bourrade fait rouler un bac ; un choc plus fort le renverse et change son gabarit', async () => {
    const rig = await startProps();
    const { ctx } = rig;
    const bac = ctx.props.spawn('conteneur', 0, 0, 0);
    ctx.props.push(bac, 1, 0, 2, 7); // 2 m/s × 0,75 (bac lourd) = 1,5 m/s : il roule sans tomber
    expect(bac.vx).toBeCloseTo(1.5, 6);
    expect(bac.toppled).toBe(false);
    rig.step(3);
    // distance d'arrêt v² / 2a = 1,5² / (2 × 2,6)
    expect(bac.x).toBeCloseTo((1.5 * 1.5) / (2 * 2.6), 2);
    expect(bac.vx).toBe(0);
    expect(rig.events('prop:moved').some((e) => e.id === bac.id && e.byId === 7)).toBe(true);

    const x0 = bac.x;
    ctx.props.push(bac, 0, 1, 8, 7); // véhicule ou explosion : 6 m/s, il bascule sur le flanc
    expect(bac.toppled).toBe(true);
    expect(bac.height).toBeCloseTo(0.78, 6); // couché : sa profondeur devient sa hauteur
    expect(bac.halfZ).toBeCloseTo(0.6, 6); // et sa hauteur de 1,2 m s'allonge au sol
    expect(bac.blocksMove).toBe(true);
    rig.step(4);
    expect(bac.z).toBeGreaterThan(1.5);
    expect(bac.x).toBeCloseTo(x0, 6);
    // une barrière renversée est à plat : elle ne barre plus le passage
    const barriere = ctx.props.spawn('barriere_vauban', 10, 0, 0);
    expect(rig.ext.topple(barriere, 0, 1, 0)).toBe(true);
    expect(barriere.toppled).toBe(true);
    expect(barriere.blocksMove).toBe(false);
    expect(barriere.halfZ).toBeCloseTo(0.55, 6);
    expect(rig.ext.topple(barriere, 0, 1, 0)).toBe(false);
    // le mobilier fixe ne bouge pas
    const banc = ctx.props.spawn('banc', 20, 0, 0);
    ctx.props.push(banc, 1, 0, 10, 0);
    rig.step(1);
    expect(banc.x).toBe(20);
    expect(rig.ext.topple(banc, 1, 0, 0)).toBe(false);
  });

  it('un objet lancé s\'arrête contre un mur, bouscule un objet mobile et bute sur le mobilier fixe', async () => {
    const rig = await startProps();
    const { ctx } = rig;
    rig.world.walls.push({ minX: 4, minZ: -10, maxX: 5, maxZ: 10 });
    const a = ctx.props.spawn('poubelle', 0, 0, 0);
    ctx.props.push(a, 1, 0, 9, 0);
    rig.step(3);
    expect(a.x).toBeLessThan(4);
    expect(a.x).toBeGreaterThan(3.2);
    expect(a.vx).toBe(0);

    // choc entre objets mobiles : le second part, le premier ralentit
    const b = ctx.props.spawn('poubelle', 0, 20, 0);
    const c = ctx.props.spawn('poubelle', 0.6, 20, 0);
    ctx.props.push(b, 1, 0, 1.7, 0); // sous le seuil de renversement (1,8 m/s)
    rig.step(3);
    expect(c.x).toBeGreaterThan(0.65);
    expect(c.toppled).toBe(false);
    expect(b.x).toBeLessThan(c.x - 0.43);
    expect(b.x).toBeGreaterThan(0.1);

    // contre un kiosque (3 m de large) : la corbeille lancée et couchée ne passe pas au travers
    ctx.props.spawn('kiosque', 3, 40, 0);
    const d = ctx.props.spawn('poubelle', 0, 40, 0);
    ctx.props.push(d, 1, 0, 9, 0);
    rig.step(3);
    expect(d.toppled).toBe(true);
    // couchée dans le sens de la marche : son bout avant (demi-longueur 0,5 m) s'arrête au pied du kiosque
    expect(d.x + 0.5).toBeLessThanOrEqual(1.5 + 0.06);
    expect(d.x + 0.5).toBeGreaterThan(1.3);
  });

  it('un autre module qui écrit prop.toppled ou déplace l\'objet à la main est rattrapé', async () => {
    const rig = await startProps();
    const { ctx } = rig;
    const bin = ctx.props.spawn('poubelle', 0, 0, 0);
    bin.toppled = true; // comme le fait le module des véhicules
    bin.x = 30; // déplacé directement
    rig.step(1.5);
    expect(bin.height).toBeCloseTo(0.44, 6);
    const out: Prop[] = [];
    expect(ctx.props.queryRadius(30, 0, 1, out)).toBe(1);
    expect(ctx.props.queryRadius(0, 0, 1, out)).toBe(0);
    // ou tout de suite, dès l'événement prop:moved
    bin.x = 60;
    ctx.events.emit('prop:moved', { id: bin.id, byId: 0 });
    expect(ctx.props.queryRadius(60, 0, 1, out)).toBe(1);
  });

  it('porté par une personne, l\'objet la suit, puis est reposé devant elle ; lâché si elle tombe', async () => {
    const rig = await startProps();
    const { ctx } = rig;
    const p = rig.person(0, 0);
    const chair = ctx.props.spawn('chaise', 0.6, 0, 0);
    expect(rig.ext.carry(chair, p)).toBe(true);
    expect(p.carrying).toBe(chair.id);
    expect(rig.ext.carry(ctx.props.spawn('chaise', 0, 0.6, 0), p)).toBe(false); // déjà chargé
    p.x = 10;
    p.z = 5;
    p.heading = Math.PI / 2; // regarde vers +x
    rig.step(0.1);
    expect(chair.x).toBeGreaterThan(10.4);
    expect(chair.z).toBeCloseTo(5, 6);
    expect(rig.ext.stats.carried).toBe(1);
    expect(rig.ext.drop(p)).toBe(true);
    expect(p.carrying).toBe(0);
    expect(chair.carriedBy).toBe(0);
    expect(rig.ext.propView(chair)!.movedBy).toBe(p.id);
    // lâché quand le porteur est mis à terre
    expect(rig.ext.carry(chair, p)).toBe(true);
    ctx.health.setDown(p, true);
    rig.step(0.1);
    expect(chair.carriedBy).toBe(0);
    expect(rig.ext.stats.carried).toBe(0);
    // les objets fixes et les barricades ne se portent pas
    expect(rig.ext.carry(ctx.props.spawn('banc', 30, 0, 0), rig.person(30, 1))).toBe(false);
  });
});

describe('souffle des explosions', () => {
  it('un mortier qui éclate au sol étoile la vitrine proche, bouscule le mobilier léger ; en l\'air il ne fait rien', async () => {
    const rig = await startProps();
    const { ctx } = rig;
    const shop = ctx.props.addShop({ category: 'mode', x: 0, z: 0, heading: 0, width: 6 });
    const bin = ctx.props.spawn('poubelle', 1, 2.5, 0);
    ctx.events.emit('explosion', { kind: 'mortier', x: 0, y: 12, z: 1.5, radius: 6, sourceId: 0 });
    expect(shop.window).toBe('intact');
    expect(bin.vx).toBe(0);
    ctx.events.emit('explosion', { kind: 'mortier', x: 0, y: 0.5, z: 1.5, radius: 6, sourceId: 0 });
    expect(shop.window).toBe('cracked');
    expect(Math.hypot(bin.vx, bin.vz)).toBeGreaterThan(1);
    expect(bin.hp).toBeLessThan(20);
    // une grenade lacrymogène qui s'ouvre n'est pas une explosion pour le décor
    const other = ctx.props.addShop({ category: 'mode', x: 50, z: 0, heading: 0, width: 6 });
    ctx.events.emit('explosion', { kind: 'grenade_lacrymo_56', x: 50, y: 0.2, z: 0.5, radius: 1, sourceId: 0 });
    expect(other.window).toBe('intact');
    // une épave de voiture qui explose souffle les vitrines alentour
    ctx.events.emit('explosion', { kind: 'vehicule', x: 50, y: 0.5, z: 1, radius: 12, sourceId: 0 });
    expect(other.window).toBe('broken');
  });
});
