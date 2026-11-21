// Construction du sol d'une tuile (logique pure) : quartier d'essai, puis vraie carte de Paris si elle est là.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeMapData, decodeRoadGraph, decodeTerrain, decodeTile, parseManifest, ringSignedArea, sampleTerrain, tilePath } from '../../src/world/mapdata';
import type { RoadGraph, Terrain, Tile } from '../../src/world/mapdata';
import { generateTestDistrict } from '../../src/world/testDistrict';
import { buildBarriers } from '../../src/world/view/barriers';
import { archRise, buildBridges, spanCount } from '../../src/world/view/bridges';
import { CL_CURB, CL_PAINT, CL_SIDEWALK, CODE_DECK, CODE_NOT_FLUSH, CODE_WATER, CURB_HEIGHT } from '../../src/world/view/classes';
import { BridgeProfile } from '../../src/world/view/decks';
import { EdgeIndex } from '../../src/world/view/edgeindex';
import { GroundBuilder } from '../../src/world/view/ground';
import type { GroundMeshes, GroundStats } from '../../src/world/view/ground';
import { MODE_DECAL, MODE_FLUSH, MODE_SURFACE, MeshBuf } from '../../src/world/view/meshbuf';
import { codeAt, createRaster, liftOfCode, rasterizeTile } from '../../src/world/view/raster';
import type { TileSite } from '../../src/world/view/site';
import { TIN_N, TileTin } from '../../src/world/view/tin';

interface Built { site: TileSite; meshes: GroundMeshes; stats: GroundStats; steps: number }

function build(tile: Tile, graph: RoadGraph, terrain: Terrain, waterLevel: number, index: EdgeIndex, profile: BridgeProfile, n = 512): Built {
  const ox = tile.tx * 512, oz = tile.tz * 512;
  const edgeIds = index.query(ox - 48, oz - 48, ox + 560, oz + 560);
  const raster = rasterizeTile(createRaster(tile.tx, tile.tz, n), tile, graph, edgeIds);
  const tin = new TileTin(tile.tx, tile.tz, (x, z) => sampleTerrain(terrain, x, z));
  profile.focus(ox, oz, ox + 512, oz + 512);
  const site: TileSite = { tile, graph, edgeIds, raster, tin, profile, waterLevel, ox, oz };
  const meshes: GroundMeshes = { ground: new MeshBuf(4096), volumes: new MeshBuf(1024), cutout: new MeshBuf(1024, true), water: new MeshBuf(256) };
  const builder = new GroundBuilder(site, meshes, { curbs: true, gutters: true, markings: true, grates: true, copingLand: 0.6 });
  let steps = 0;
  for (const _ of builder.steps()) {
    void _;
    steps++;
  }
  return { site, meshes, stats: builder.stats, steps };
}

/** Contrôles communs : pas de valeur aberrante, faces horizontales tournées vers le haut, trottoirs posés sur le sol en facettes. */
function checkGround(b: Built): { surfaceArea: number; flushTriangles: number } {
  const g = b.meshes.ground;
  const { tin, profile, ox, oz } = b.site;
  let bad = 0;
  for (let i = 0; i < g.nv * 3; i++) if (!Number.isFinite(g.pos[i])) bad++;
  expect(bad).toBe(0);
  let outOfRange = 0;
  for (let i = 0; i < g.ni; i++) if (g.idx[i] >= g.nv) outOfRange++;
  expect(outOfRange).toBe(0);
  let surfaceArea = 0, flushTriangles = 0, checked = 0, down = 0, minLift = Infinity, maxLift = -Infinity;
  for (let t = 0; t < g.ni; t += 3) {
    const a = g.idx[t], bb = g.idx[t + 1], c = g.idx[t + 2];
    const mode = g.dat[a * 4 + 1];
    if (g.nor[a * 3 + 1] < 100) continue; // faces verticales : pas de sens « haut »
    const ax = g.pos[a * 3], az = g.pos[a * 3 + 2], bx = g.pos[bb * 3], bz = g.pos[bb * 3 + 2], cx = g.pos[c * 3], cz = g.pos[c * 3 + 2];
    const cross = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    // (les éclats de moins d'un centimètre carré, à la précision des flottants, ne comptent pas)
    if (cross < -2e-4) down++;
    if (mode === MODE_FLUSH) flushTriangles++;
    if (mode !== MODE_SURFACE) continue;
    surfaceArea += cross / 2;
    // trottoirs loin de tout pont : exactement une hauteur de bordure au-dessus du sol en facettes
    if (g.dat[a * 4] !== CL_SIDEWALK) continue;
    const wx = ax + ox, wz = az + oz;
    if (profile.nearest(wx, wz)) continue;
    const lift = g.pos[a * 3 + 1] - tin.y(wx, wz);
    if (lift < minLift) minLift = lift;
    if (lift > maxLift) maxLift = lift;
    checked++;
  }
  expect(down).toBe(0);
  expect(checked).toBeGreaterThan(10);
  expect(minLift).toBeGreaterThan(CURB_HEIGHT - 2e-3);
  expect(maxLift).toBeLessThan(CURB_HEIGHT + 2e-3);
  return { surfaceArea, flushTriangles };
}

describe('ville 3D — sol du quartier d\'essai', () => {
  const data = decodeMapData(generateTestDistrict({ seed: 1 }));
  const index = new EdgeIndex(data.roadGraph);
  const profile = new BridgeProfile(data.roadGraph, (x, z) => sampleTerrain(data.terrain, x, z));
  const level = data.manifest.waterLevel;

  it('chaque tuile : nappe complète hors de l\'eau, trottoirs surélevés, bordures, marquages', () => {
    let curbs = 0, markings = 0, grates = 0, water = 0, parapets = 0;
    for (const tile of data.tiles) {
      const b = build(tile, data.roadGraph, data.terrain, level, index, profile);
      const { flushTriangles } = checkGround(b);
      const hasWater = tile.surfaces.some((s) => s.kind === 'water');
      if (hasWater) {
        expect(flushTriangles).toBeLessThan(TIN_N * TIN_N * 2);
        expect(flushTriangles).toBeGreaterThan(TIN_N * TIN_N);
        expect(b.meshes.water.triangles).toBeGreaterThan(0);
      } else {
        expect(flushTriangles).toBe(TIN_N * TIN_N * 2);
        expect(b.meshes.water.triangles).toBe(0);
      }
      expect(b.stats.raisedPolygons).toBeGreaterThan(0);
      expect(b.steps).toBeGreaterThan(3);
      curbs += b.stats.curbQuads;
      markings += b.stats.markingQuads;
      grates += b.stats.grates;
      water += b.meshes.water.triangles;
      parapets += b.stats.parapetSteps;
    }
    expect(curbs).toBeGreaterThan(500);
    expect(markings).toBeGreaterThan(200);
    expect(grates).toBeGreaterThan(50);
    expect(water).toBeGreaterThan(0);
    // les deux moitiés du pont (il est posé sur une limite de tuile) portent leurs parapets
    expect(parapets).toBeGreaterThan(60);
  });

  it('une bordure de granit longe chaque trottoir du côté de la chaussée, à la hauteur du trottoir', () => {
    const tile = data.tiles[0];
    const b = build(tile, data.roadGraph, data.terrain, level, index, profile);
    const g = b.meshes.ground;
    let strips = 0, minLift = Infinity, maxLift = -Infinity;
    for (let v = 0; v < g.nv; v++) {
      if (g.dat[v * 4] !== CL_CURB || g.dat[v * 4 + 1] !== MODE_DECAL) continue;
      const x = g.pos[v * 3] + b.site.ox, z = g.pos[v * 3 + 2] + b.site.oz;
      if (b.site.profile.nearest(x, z)) continue;
      strips++;
      const lift = g.pos[v * 3 + 1] - b.site.tin.y(x, z);
      minLift = Math.min(minLift, lift);
      maxLift = Math.max(maxLift, lift);
    }
    expect(strips).toBeGreaterThan(100);
    // posée sur un trottoir (8 cm) ou une pelouse (13 cm), quelques millimètres au-dessus
    expect(minLift).toBeGreaterThan(CURB_HEIGHT);
    expect(maxLift).toBeLessThan(0.15);
  });

  it('les marquages sont peints au niveau de la chaussée', () => {
    const tile = data.tiles[1];
    const b = build(tile, data.roadGraph, data.terrain, level, index, profile);
    const g = b.meshes.ground;
    let painted = 0, minLift = Infinity, maxLift = -Infinity;
    for (let v = 0; v < g.nv; v++) {
      if (g.dat[v * 4] !== CL_PAINT) continue;
      const x = g.pos[v * 3] + b.site.ox, z = g.pos[v * 3 + 2] + b.site.oz;
      if ((codeAt(b.site.raster, x, z) & CODE_DECK) !== 0) continue;
      painted++;
      const lift = g.pos[v * 3 + 1] - b.site.tin.y(x, z);
      minLift = Math.min(minLift, lift);
      maxLift = Math.max(maxLift, lift);
    }
    expect(painted).toBeGreaterThan(100);
    expect(minLift).toBeGreaterThan(0.005);
    expect(maxLift).toBeLessThan(0.03);
  });

  it('barrières : murs et haies en volume, grilles et garde-corps en panneaux', () => {
    const tile = data.tiles.find((t) => t.barriers.length >= 5);
    expect(tile).toBeDefined();
    if (!tile) return;
    const b = build(tile, data.roadGraph, data.terrain, level, index, profile);
    const volumes = new MeshBuf(1024), cutout = new MeshBuf(1024, true);
    const st = buildBarriers(b.site, volumes, cutout);
    expect(st.walls + st.hedges + st.quays + st.fences + st.railings + st.gates).toBe(tile.barriers.length);
    expect(st.panels).toBeGreaterThan(0);
    expect(volumes.triangles).toBeGreaterThan(0);
    expect(cutout.triangles).toBe(st.panels * 2);
    let bad = 0;
    for (let i = 0; i < volumes.nv * 3; i++) if (!Number.isFinite(volumes.pos[i])) bad++;
    expect(bad).toBe(0);
    // les coordonnées de texture des panneaux restent dans la bande de leur motif
    const uv = cutout.uv as Float32Array;
    let minV = Infinity, maxV = -Infinity;
    for (let v = 0; v < cutout.nv; v++) {
      minV = Math.min(minV, uv[2 * v + 1]);
      maxV = Math.max(maxV, uv[2 * v + 1]);
    }
    expect(minV).toBeGreaterThanOrEqual(0);
    expect(maxV).toBeLessThan(0.75);
  });

  it('ponts : travées d\'une trentaine de mètres, arches en anse de panier, piles dans l\'eau', () => {
    expect(spanCount(120)).toBe(4);
    expect(spanCount(20)).toBe(1);
    expect(archRise(0, 5)).toBe(0);
    expect(archRise(0.5, 5)).toBe(5);
    expect(archRise(1, 5)).toBe(0);
    expect(archRise(0.25, 5)).toBeCloseTo(5 * Math.sqrt(0.75), 9);
    let spans = 0, piers = 0, tris = 0;
    for (const tile of data.tiles) {
      const b = build(tile, data.roadGraph, data.terrain, level, index, profile);
      const volumes = new MeshBuf(1024);
      // le quartier d'essai n'a pas forcément assez de tirant d'air : on force un fleuve plus bas pour l'ouvrage
      const st = buildBridges(b.site, volumes, level - 6, () => false);
      spans += st.spans;
      piers += st.piers;
      tris += volumes.triangles;
      let bad = 0;
      for (let i = 0; i < volumes.nv * 3; i++) if (!Number.isFinite(volumes.pos[i])) bad++;
      expect(bad).toBe(0);
    }
    // 120 m de pont au-dessus du fleuve : quatre travées, trois piles — construites une seule fois malgré la limite de tuile
    expect(spans).toBe(4);
    expect(piers).toBe(3);
    expect(tris).toBeGreaterThan(100);
  });

  it('un ouvrage remplacé par un monument n\'est pas construit', () => {
    let spans = 0;
    for (const tile of data.tiles) {
      const b = build(tile, data.roadGraph, data.terrain, level, index, profile);
      spans += buildBridges(b.site, new MeshBuf(64), level - 6, () => true).spans;
    }
    expect(spans).toBe(0);
  });
});

const PARIS = 'public/data/paris/';
const hasParis = existsSync(PARIS + 'manifest.json');

describe.skipIf(!hasParis)('ville 3D — sol de Paris (vraies données)', () => {
  const read = (file: string): unknown => JSON.parse(readFileSync(PARIS + file, 'utf8'));
  const manifest = hasParis ? parseManifest(read('manifest.json')) : null;
  const graph = hasParis && manifest ? decodeRoadGraph(read(manifest.files.roadGraph) as never) : null;
  const terrain = hasParis && manifest ? decodeTerrain(read(manifest.files.terrain) as never) : null;

  it('Concorde et Étoile : toute la surface des trottoirs et des tabliers est maillée, sans trou', () => {
    if (!manifest || !graph || !terrain) return;
    const index = new EdgeIndex(graph);
    const profile = new BridgeProfile(graph, (x, z) => sampleTerrain(terrain, x, z));
    for (const [tx, tz] of [[0, 0], [-4, -2], [-1, 0]] as const) {
      const tile = decodeTile(read(tilePath(tx, tz)) as never);
      const b = build(tile, graph, terrain, manifest.waterLevel, index, profile, 1024);
      const { surfaceArea } = checkGround(b);
      // aire attendue : celle des polygones surélevés et des tabliers (trous déduits)
      let expected = 0;
      tile.surfaces.forEach((s, i) => {
        const style = b.site.raster.styles[i];
        if (s.kind === 'water' || !(style.raised || b.site.raster.deck[i] === 1)) return;
        expected += Math.abs(ringSignedArea(s.outer));
        for (const h of s.holes) expected -= Math.abs(ringSignedArea(h));
      });
      expect(expected).toBeGreaterThan(10000);
      expect(Math.abs(surfaceArea - expected) / expected).toBeLessThan(0.002);
      expect(b.stats.curbQuads).toBeGreaterThan(300);
      expect(b.stats.markingQuads).toBeGreaterThan(100);
      // budget de géométrie : moins de 200 000 triangles de sol par tuile
      expect(b.meshes.ground.triangles).toBeLessThan(200000);
    }
  });

  it('pont de la Concorde : tablier au-dessus de l\'eau, parapets, arches et piles', () => {
    if (!manifest || !graph || !terrain) return;
    const index = new EdgeIndex(graph);
    const profile = new BridgeProfile(graph, (x, z) => sampleTerrain(terrain, x, z));
    const tile = decodeTile(read(tilePath(-1, 0)) as never);
    const b = build(tile, graph, terrain, manifest.waterLevel, index, profile, 1024);
    expect(b.stats.deckPolygons).toBeGreaterThan(0);
    expect(b.stats.parapetSteps).toBeGreaterThan(50);
    // sur l'axe du pont : un tablier (et non de l'eau), à plusieurs mètres au-dessus du fleuve
    const code = codeAt(b.site.raster, -127, 250);
    expect(code & CODE_DECK).toBe(CODE_DECK);
    expect(code).not.toBe(CODE_WATER);
    expect(code & CODE_NOT_FLUSH).toBe(CODE_NOT_FLUSH);
    const deck = profile.deckY(-127, 250, b.site.tin.y(-127, 250));
    expect(deck - manifest.waterLevel).toBeGreaterThan(4);
    // les trottoirs du pont sont surélevés comme les autres
    let sidewalkOnDeck = 0;
    for (let k = 0; k < b.site.raster.codes.length; k += 7) {
      const c = b.site.raster.codes[k];
      if ((c & CODE_DECK) !== 0 && (c & 31) === CL_SIDEWALK) {
        sidewalkOnDeck++;
        expect(liftOfCode(c)).toBe(CURB_HEIGHT);
      }
    }
    expect(sidewalkOnDeck).toBeGreaterThan(20);
    const volumes = new MeshBuf(1024);
    const st = buildBridges(b.site, volumes, manifest.waterLevel, () => false);
    expect(st.spans).toBeGreaterThanOrEqual(3);
    expect(st.piers).toBeGreaterThanOrEqual(2);
  });
});
