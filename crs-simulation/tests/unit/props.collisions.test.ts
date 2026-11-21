// Décor dynamique — collisions et lancers de rayon exacts sur boîtes orientées, requêtes, index spatial.
import { describe, expect, it } from 'vitest';
import type { Prop, RayHit, Shop } from '@/core/contracts';
import { makeRayHit } from '@/core/null-services';
import { BoxGrid } from '@/sim/props/grid';
import type { GridItem } from '@/sim/props/grid';
import { startProps } from '@/sim/props/testkit';

const hit: RayHit = makeRayHit();

describe('collisions sur boîtes orientées', () => {
  it('un disque est repoussé exactement hors d\'un abribus tourné à 45°, par la face la plus proche', async () => {
    const rig = await startProps();
    const props = rig.ctx.props;
    const h = Math.PI / 4;
    const bus = props.spawn('abribus', 10, 20, h); // 4,2 × 1,6 m
    expect(bus.halfX).toBeCloseTo(2.1);
    expect(bus.halfZ).toBeCloseTo(0.8);
    // axe avant (petit côté) de l'abribus : (sin h, cos h)
    const fx = Math.sin(h);
    const fz = Math.cos(h);
    // un piéton de 0,28 m arrive face au grand côté, enfoncé de 0,1 m
    const pos = { x: 10 + fx * (0.8 + 0.28 - 0.1), z: 20 + fz * (0.8 + 0.28 - 0.1) };
    expect(props.resolveCircle(pos, 0.28)).toBe(true);
    expect((pos.x - 10) * fx + (pos.z - 20) * fz).toBeCloseTo(0.8 + 0.28, 6);
    // une fois sorti, plus de contact
    expect(props.resolveCircle(pos, 0.279)).toBe(false);
    // le long du grand côté, à 2 m du centre : toujours en contact ; au-delà du bout (2,1 m + rayon) : libre
    const ax = Math.cos(h);
    const az = -Math.sin(h);
    const side = { x: 10 + ax * 2.0 + fx * 0.9, z: 20 + az * 2.0 + fz * 0.9 };
    expect(props.resolveCircle(side, 0.28)).toBe(true);
    const beyond = { x: 10 + ax * 2.45 + fx * 0.3, z: 20 + az * 2.45 + fz * 0.3 };
    expect(props.resolveCircle(beyond, 0.28)).toBe(false);
    // boîte englobante alignée sur les axes ≠ boîte orientée : un point dans le coin de l'AABB reste libre
    const corner = { x: 10 + 1.9, z: 20 + 1.9 };
    expect(props.resolveCircle(corner, 0.28)).toBe(false);
    // centre du disque à l'intérieur : sortie par la face la plus proche
    const inside = { x: 10 + fx * 0.5, z: 20 + fz * 0.5 };
    expect(props.resolveCircle(inside, 0.28)).toBe(true);
    expect((inside.x - 10) * fx + (inside.z - 20) * fz).toBeCloseTo(0.8 + 0.28, 6);
  });

  it('les objets qui ne barrent pas le passage, portés ou endormis ne repoussent personne', async () => {
    const rig = await startProps();
    const props = rig.ctx.props;
    const palette = props.spawn('palette', 0, 0, 0); // on marche dessus
    expect(palette.blocksMove).toBe(false);
    expect(props.resolveCircle({ x: 0, z: 0.1 }, 0.28)).toBe(false);
    const bin = props.spawn('poubelle', 5, 0, 0);
    expect(props.resolveCircle({ x: 5.3, z: 0 }, 0.28)).toBe(true);
    bin.dormant = true;
    expect(props.resolveCircle({ x: 5.3, z: 0 }, 0.28)).toBe(false);
    bin.dormant = false;
    const carrier = rig.person(5, -1);
    expect(rig.ext.carry(bin, carrier)).toBe(true);
    expect(bin.carriedBy).toBe(carrier.id);
    expect(props.resolveCircle({ x: bin.x + 0.1, z: bin.z }, 0.28)).toBe(false);
  });

  it('lancer de rayon : point d\'entrée, normale, hauteur, premier obstacle, modes move / sight', async () => {
    const rig = await startProps();
    const props = rig.ctx.props;
    const bin = props.spawn('poubelle', 10, 0, 0); // barre le passage, ne masque pas
    const pub = props.spawn('panneau_pub', 20, 0, Math.PI / 2); // 1,3 × 0,24 m, masque la vue ; tourné : grand côté le long de z
    const palette = props.spawn('palette', 15, 0, 0); // ni l'un ni l'autre
    expect(bin.blocksSight).toBe(false);
    expect(pub.blocksSight).toBe(true);
    expect(palette.blocksMove || palette.blocksSight).toBe(false);

    // sans mode : la corbeille d'abord
    expect(props.raycast(0, 0, 40, 0, hit)).toBe(true);
    expect(hit.kind).toBe('prop');
    expect(hit.id).toBe(bin.id);
    expect(hit.x).toBeCloseTo(10 - 0.22, 6);
    expect(hit.t).toBeCloseTo((10 - 0.22) / 40, 6);
    expect(hit.nx).toBeCloseTo(-1, 6);
    expect(hit.nz).toBeCloseTo(0, 6);
    expect(hit.height).toBeCloseTo(1.0);
    // mode 'move' : pareil ; mode 'sight' : le regard passe la corbeille et bute sur le panneau
    expect(props.raycast(0, 0, 40, 0, hit, 'move')).toBe(true);
    expect(hit.id).toBe(bin.id);
    expect(props.raycast(0, 0, 40, 0, hit, 'sight')).toBe(true);
    expect(hit.id).toBe(pub.id);
    // le panneau tourné de 90° présente sa tranche : demi-épaisseur 0,12 m le long de x
    expect(hit.x).toBeCloseTo(20 - 0.12, 6);
    expect(hit.height).toBeCloseTo(2.7);
    // un rayon qui passe à côté : rien, et le point final est l'extrémité
    expect(props.raycast(0, 3, 40, 3, hit)).toBe(false);
    expect(hit.hit).toBe(false);
    expect(hit.t).toBe(1);
    expect(hit.x).toBe(40);
    expect(hit.kind).toBe('none');
    // en biais : touche le coin de la corbeille exactement
    expect(props.raycast(9, -1, 11, 1, hit, 'move')).toBe(true);
    expect(hit.id).toBe(bin.id);
    expect(hit.x).toBeCloseTo(10 - 0.22, 5);
    expect(hit.z).toBeCloseTo(-0.22, 5);
    // rayon très long à travers des dizaines de cellules, dans les deux sens
    expect(props.raycast(-300, 0.05, 300, 0.05, hit, 'sight')).toBe(true);
    expect(hit.id).toBe(pub.id);
    expect(props.raycast(300, 0.05, -300, 0.05, hit, 'move')).toBe(true);
    expect(hit.id).toBe(pub.id);
    expect(hit.nx).toBeCloseTo(1, 6);
    // départ à l'intérieur d'une boîte : t = 0
    expect(props.raycast(10, 0, 12, 0, hit, 'move')).toBe(true);
    expect(hit.t).toBe(0);
  });

  it('le lancer de rayon donne le même résultat qu\'une recherche exhaustive sur 400 objets et 300 rayons', async () => {
    const rig = await startProps({ seed: 5 });
    const props = rig.ctx.props;
    const rng = rig.ctx.rng.fork('essai');
    const kinds = ['poubelle', 'conteneur', 'barriere_vauban', 'abribus', 'kiosque', 'panneau_pub', 'banc', 'colonne_morris'];
    for (let i = 0; i < 400; i++) props.spawn(rng.pick(kinds), rng.range(-60, 60), rng.range(-60, 60), rng.range(-3.1, 3.1));
    const { segmentVsObb } = await import('@/core/math');
    const cast = { t: 0, nx: 0, nz: 0 };
    let hits = 0;
    for (let r = 0; r < 300; r++) {
      const ax = rng.range(-70, 70);
      const az = rng.range(-70, 70);
      const bx = rng.range(-70, 70);
      const bz = rng.range(-70, 70);
      const mode = r % 3 === 0 ? 'move' : r % 3 === 1 ? 'sight' : undefined;
      let bestT = 2;
      let bestId = 0;
      for (const p of props.list) {
        if (mode === 'move' ? !p.blocksMove : mode === 'sight' ? !p.blocksSight : !(p.blocksMove || p.blocksSight)) continue;
        if (segmentVsObb(ax, az, bx, bz, p.x, p.z, p.halfX, p.halfZ, p.heading, cast) && cast.t < bestT) {
          bestT = cast.t;
          bestId = p.id;
        }
      }
      const got = props.raycast(ax, az, bx, bz, hit, mode);
      expect(got).toBe(bestId !== 0);
      if (got) {
        hits++;
        expect(hit.t).toBeCloseTo(bestT, 9);
        if (bestT > 0) expect(hit.id).toBe(bestId);
      }
    }
    expect(hits).toBeGreaterThan(100);
  });

  it('queryRadius retient les boîtes qui touchent le disque (pas seulement les centres) et applique le filtre', async () => {
    const rig = await startProps();
    const props = rig.ctx.props;
    const bench = props.spawn('banc', 0, 0, 0); // 2 m de long le long de x
    const bin = props.spawn('poubelle', 0, 3, 0);
    const out: Prop[] = [];
    // à 1,5 m du centre du banc mais à 0,5 m de son extrémité
    expect(props.queryRadius(1.5, 0, 0.6, out)).toBe(1);
    expect(out[0]).toBe(bench);
    expect(props.queryRadius(1.7, 0, 0.6, out)).toBe(0);
    expect(out.length).toBe(0);
    expect(props.queryRadius(0, 1.5, 2, out)).toBe(2);
    expect(props.queryRadius(0, 1.5, 2, out, (p) => p.kind === 'poubelle')).toBe(1);
    expect(out[0]).toBe(bin);
    bin.dormant = true;
    expect(props.queryRadius(0, 3, 1, out)).toBe(0);
    // un objet retiré disparaît des requêtes ; un objet déplacé est retrouvé à sa nouvelle place
    props.remove(bench.id);
    expect(props.queryRadius(0, 0, 3, out)).toBe(0);
    expect(props.get(bench.id)).toBeUndefined();
    bin.dormant = false;
    props.push(bin, 1, 0, 6, 0);
    rig.step(3);
    expect(bin.x).toBeGreaterThan(2);
    expect(props.queryRadius(bin.x, bin.z, 0.5, out)).toBe(1);
    expect(props.queryRadius(0, 3, 0.5, out)).toBe(0);
  });

  it('shopsNear mesure la distance à la façade, pas au centre de la vitrine', async () => {
    const rig = await startProps();
    const props = rig.ctx.props;
    // façade de 10 m le long de x (normale vers +z)
    const shop = props.addShop({ category: 'mode', x: 0, z: 0, heading: 0, width: 10 });
    const out: Shop[] = [];
    expect(props.shopsNear(4.5, 1, 1.5, out)).toBe(1);
    expect(out[0]).toBe(shop);
    expect(props.shopsNear(6.8, 0, 1.5, out)).toBe(0);
    expect(props.shopsNear(0, 3, 1.5, out)).toBe(0);
    props.removeShop(shop.id);
    expect(props.shopsNear(0, 0, 5, out)).toBe(0);
    expect(props.shop(shop.id)).toBeUndefined();
  });
});

describe('index spatial des boîtes', () => {
  interface Box extends GridItem { id: number }
  const box = (id: number): Box => ({ id, gx0: 0, gx1: 0, gz0: 0, gz1: 0, gIn: false, gStamp: 0 });

  it('un objet long est trouvé depuis chacune des cellules qu\'il recouvre, une seule fois par requête', () => {
    const grid = new BoxGrid<Box>(4, 16);
    const long = box(1);
    grid.insert(long, 1, 1, 21, 2); // recouvre 6 cellules en x
    expect(grid.nodeCount).toBe(6);
    const out: Box[] = [];
    expect(grid.collectBox(18, 0, 19, 3, out)).toBe(1);
    expect(grid.collectBox(0, 0, 30, 3, out)).toBe(1); // six cellules, un seul résultat
    expect(grid.collectBox(0, 8, 30, 12, out)).toBe(0);
    // déplacement dans les mêmes cellules : pas de ré-inscription ; ailleurs : ré-inscription
    expect(grid.update(long, 1.5, 1.2, 21.5, 2.2)).toBe(false);
    expect(grid.update(long, 41, 1, 44.5, 2)).toBe(true);
    expect(grid.nodeCount).toBe(2);
    expect(grid.collectBox(0, 0, 30, 3, out)).toBe(0);
    expect(grid.collectBox(40, 0, 41.5, 3, out)).toBe(1);
    grid.remove(long);
    expect(grid.nodeCount).toBe(0);
    expect(grid.empty).toBe(true);
  });

  it('tient 5 000 inscriptions et retraits en restant cohérent (croissance, réemploi des emplacements)', () => {
    const grid = new BoxGrid<Box>(4, 16);
    const boxes: Box[] = [];
    let seed = 12345;
    const rand = (): number => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
    for (let i = 0; i < 5000; i++) {
      const b = box(i);
      const x = rand() * 400 - 200;
      const z = rand() * 400 - 200;
      grid.insert(b, x, z, x + rand() * 6, z + rand() * 2);
      boxes.push(b);
    }
    for (let i = 0; i < 5000; i += 2) grid.remove(boxes[i]!);
    const out: Box[] = [];
    const n = grid.collectBox(-250, -250, 250, 250, out);
    expect(n).toBe(2500);
    expect(new Set(out.slice(0, n).map((b) => b.id)).size).toBe(2500);
    for (let i = 0; i < n; i++) expect(out[i]!.id % 2).toBe(1);
    // parcours par cellule : mêmes objets
    grid.beginWalk();
    let m = 0;
    for (let cz = -70; cz <= 70; cz++) for (let cx = -70; cx <= 70; cx++) m = grid.collectCell(cx, cz, out, m);
    expect(m).toBe(2500);
  });
});
