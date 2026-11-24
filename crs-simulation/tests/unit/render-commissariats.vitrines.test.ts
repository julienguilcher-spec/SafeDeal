// Rendu des commissariats — devantures de la carte posées sur la façade habillée d'un site (9e, Célestins, 3e) :
// cachées au rendu seulement (la boutique reste dans la simulation, mêmes identifiants, mêmes tirages).
import { describe, expect, it } from 'vitest';
import type { Shop } from '@/core/contracts';
import { COMMISSARIATS, commissariatById } from '@/world/commissariats';
import type { CommissariatDef } from '@/world/commissariats';
import { DRESS_CLEARANCE, dressSpan, shopOverlapsDress, sideOffsets, stationOverShop } from '@/render/commissariats/dress';
import { Assembler } from '@/render/props/assemble';
import type { PropAtlas } from '@/render/props/atlas';
import { MeshBuf } from '@/render/props/meshbuf';
import { ModelLibrary } from '@/render/props/models';
import { ShopRec } from '@/render/props/records';
import { shopStyle } from '@/render/props/signtext';
import { createWorldQuery } from '@/world/query';
import { FsMapSource, defaultParisDir } from '@/world/query/source-fs';

/**
 * Devantures relevées sur la vraie carte (world.shopsInTile) à moins de 15 m des portes : x, z, cap, largeur tels que
 * la carte les donne. Les quatre premières sont sur la façade habillée ; les autres, plus loin le long de la rue.
 */
const ON_FACADE = [
  { site: '9e', category: 'banque', x: 1348, z: -837.3, heading: 4.553564018453206, width: 6 },
  { site: 'celestins', category: 'agence', x: 3148.2, z: 1537, heading: 0.43633231299858233, width: 6.7 },
  { site: '3e', category: 'autre', x: 2229.4, z: 280.5, heading: 2.7262042916151428, width: 5 },
  { site: '3e', category: 'autre', x: 2237.2, z: 283.9, heading: 2.7314402793711254, width: 3.3 },
] as const;
const ALONG_STREET = [
  { site: 'celestins', x: 3160.6, z: 1531.3, heading: 0.4310963252425994, width: 5.9 },
  { site: '1er', x: 768, z: -221.9, heading: 5.9655353833166185, width: 6.7 },
  { site: '3e', x: 2223.2, z: 289.9, heading: 4.377285764001779, width: 5.2 },
  { site: '3e', x: 2242.1, z: 286, heading: 2.7314402793711254, width: 4.5 },
  { site: '3e', x: 2220, z: 283.3, heading: 1.1746065865921838, width: 6.3 },
  { site: '7e', x: -738.2, z: 721.8, heading: 1.4870205226991688, width: 7.1 },
] as const;

function site(id: string): CommissariatDef {
  const def = commissariatById(id);
  if (!def) throw new Error('site inconnu : ' + id);
  return def;
}

/** Devanture le long de la façade du site : abscisse u (m depuis le point de façade), écart n au plan, cap relatif. */
function along(def: CommissariatDef, u: number, width: number, n = 0, turn = 0): { x: number; z: number; heading: number; width: number } {
  const h = def.facade.heading;
  return {
    x: def.facade.x + Math.cos(h) * u + Math.sin(h) * n,
    z: def.facade.z - Math.sin(h) * u + Math.cos(h) * n,
    heading: h + turn, width,
  };
}

describe('devantures sur la façade habillée d\'un commissariat', () => {
  it('largeur habillée : lanterne et drapeau, plus le dégagement', () => {
    const d9 = site('9e');
    const s = sideOffsets(d9);
    expect(dressSpan(d9)).toEqual({ u0: s.flag - DRESS_CLEARANCE, u1: s.lantern + DRESS_CLEARANCE });
    // la caserne de la Cité (sans enseigne) a un habillage plus étroit
    const cite = COMMISSARIATS.find((c) => c.sign === 'none')!;
    expect(dressSpan(cite).u1 - dressSpan(cite).u0).toBeLessThan(dressSpan(d9).u1 - dressSpan(d9).u0);
  });

  it('chevauchement pur : bornes, autre façade, autre cap', () => {
    const def = site('9e');
    const { u0, u1 } = dressSpan(def);
    // vitrine au milieu, à cheval sur un bord, juste avant et juste après le bord
    expect(shopOverlapsDress(along(def, 0, 2), def)).toBe(true);
    expect(shopOverlapsDress(along(def, u1 + 1, 2.4), def)).toBe(true);
    expect(shopOverlapsDress(along(def, u1 + 1.05, 2), def)).toBe(false);
    expect(shopOverlapsDress(along(def, u0 - 1.05, 2), def)).toBe(false);
    expect(shopOverlapsDress(along(def, u0 - 0.95, 2), def)).toBe(true);
    // même abscisse, mais de l'autre côté de la rue ou sur une façade en retour
    expect(shopOverlapsDress(along(def, 0, 4, 12), def)).toBe(false);
    expect(shopOverlapsDress(along(def, 0, 4, 0, Math.PI / 2), def)).toBe(false);
    // cap donné à un tour près
    expect(shopOverlapsDress(along(def, 0, 4, 0, Math.PI * 2 - 0.1), def)).toBe(true);
    expect(stationOverShop(along(def, 0, 4), COMMISSARIATS)).toBe(def);
    expect(stationOverShop({ x: 0, z: 0, heading: 0, width: 6 }, COMMISSARIATS)).toBeNull();
  });

  it('les trois cas de la vraie carte (9e banque, Célestins agence, 3e deux boutiques) sont cachés ; leurs voisins non', () => {
    for (const s of ON_FACADE) expect(stationOverShop(s, COMMISSARIATS)?.id, `${s.site} ${s.category}`).toBe(s.site);
    for (const s of ALONG_STREET) expect(stationOverShop(s, COMMISSARIATS), `${s.site} ${s.x},${s.z}`).toBeNull();
  });

  it('rendu du décor : une devanture cachée ne produit aucune géométrie ; la boutique n\'est pas modifiée', () => {
    const atlas = { acquireSign: () => null, releaseSign: () => undefined } as unknown as PropAtlas;
    const asm = new Assembler(new ModelLibrary(), atlas);
    const s9 = ON_FACADE[0];
    const shop = {
      id: 77, name: 'Banque', category: s9.category, x: s9.x, y: 0, z: s9.z, heading: s9.heading, width: s9.width,
      window: 'intact', shutter: 0, stock: 1, appeal: 0.5, burning: 0, occupants: 0, dormant: false,
    } as unknown as Shop;
    const before = JSON.stringify(shop);
    for (const lod of [0, 1, 2]) {
      const open = new ShopRec(shop, shop.id, shopStyle(shop.category, 1), 1);
      const buf = new MeshBuf();
      asm.shop(buf, open, lod, 0, 0);
      expect(buf.nv, `lod ${lod} visible`).toBeGreaterThan(0);
      const hidden = new ShopRec(shop, shop.id, shopStyle(shop.category, 1), 1);
      hidden.masked = stationOverShop(shop, COMMISSARIATS) !== null;
      expect(hidden.masked).toBe(true);
      const empty = new MeshBuf();
      asm.shop(empty, hidden, lod, 0, 0);
      expect(empty.nv, `lod ${lod} cachée`).toBe(0);
      expect(empty.ni).toBe(0);
    }
    expect(JSON.stringify(shop)).toBe(before);
  });
});

const available = await new FsMapSource(defaultParisDir()).exists();

describe.skipIf(!available)('devantures sur la vraie carte de Paris', () => {
  it('autour des sept portes, seules les quatre devantures de la façade habillée sont cachées', async () => {
    const world = createWorldQuery({ source: 'paris', parisSource: new FsMapSource(defaultParisDir()) });
    await world.boot();
    const T = world.tileSize;
    const masked: string[] = [];
    let seen = 0;
    for (const def of COMMISSARIATS) {
      await world.whenLoaded(def.door.x, def.door.z, 200);
      for (let tx = Math.floor((def.door.x - 40) / T); tx <= Math.floor((def.door.x + 40) / T); tx++) {
        for (let tz = Math.floor((def.door.z - 40) / T); tz <= Math.floor((def.door.z + 40) / T); tz++) {
          for (const s of world.shopsInTile(tx, tz)) {
            if (Math.hypot(s.x - def.door.x, s.z - def.door.z) > 40) continue;
            seen++;
            const by = stationOverShop(s, COMMISSARIATS);
            if (by) masked.push(`${by.id}:${s.category}:${Math.hypot(s.x - def.door.x, s.z - def.door.z).toFixed(1)}`);
          }
        }
      }
    }
    expect(seen).toBeGreaterThan(masked.length);
    expect(masked.sort()).toEqual(['3e:autre:3.7', '3e:autre:5.0', '9e:banque:3.5', 'celestins:agence:0.9']);
  }, 300_000);
});
