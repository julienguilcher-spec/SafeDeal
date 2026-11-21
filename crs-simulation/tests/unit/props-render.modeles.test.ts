// Rendu du décor — modèles procéduraux : validité, échelle, niveaux de détail, états dérivés, pose.
import { describe, expect, it } from 'vitest';
import { FX_FIRE, FX_LAMP, FX_TL_G, FX_TL_R } from '@/render/props/geo';
import { FALL_X, FALL_Z, MODEL_KEYS, kindInfo } from '@/render/props/mapping';
import { MeshBuf, emitBuf, matNew } from '@/render/props/meshbuf';
import { ModelLibrary, V_BROKEN, V_BURNING, V_BURNT, V_DAMAGED, V_INTACT, buildBase } from '@/render/props/models';
import { layDown, partMatrix, propMatrix, synthParts } from '@/render/props/placement';
import { buildShopfront, layoutOpenings, shopGlows } from '@/render/props/shopfront';
import type { ShopGlow, ShopState } from '@/render/props/shopfront';
import { shopStyle } from '@/render/props/signtext';

const KINDS = MODEL_KEYS.filter((k) => k !== 'barricade');

interface Box { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number }

function bounds(b: MeshBuf): Box {
  const r: Box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (let i = 0; i < b.nv; i++) {
    const x = b.pos[i * 3]!, y = b.pos[i * 3 + 1]!, z = b.pos[i * 3 + 2]!;
    r.minX = Math.min(r.minX, x); r.maxX = Math.max(r.maxX, x);
    r.minY = Math.min(r.minY, y); r.maxY = Math.max(r.maxY, y);
    r.minZ = Math.min(r.minZ, z); r.maxZ = Math.max(r.maxZ, z);
  }
  return r;
}

function checkMesh(b: MeshBuf, label: string): void {
  expect(b.ni % 3, label).toBe(0);
  for (let i = 0; i < b.nv * 3; i++) if (!Number.isFinite(b.pos[i]!)) throw new Error(label + ' : position non finie');
  for (let i = 0; i < b.ni; i++) if (b.idx[i]! >= b.nv) throw new Error(label + ' : indice hors du tampon');
  for (let i = 0; i < b.nv; i++) {
    const nx = b.nrm[i * 3]!, ny = b.nrm[i * 3 + 1]!, nz = b.nrm[i * 3 + 2]!;
    const l = Math.hypot(nx, ny, nz);
    if (l < 100 || l > 131) throw new Error(`${label} : normale non unitaire (${l.toFixed(0)})`);
    const u = b.uv[i * 2]!, v = b.uv[i * 2 + 1]!;
    if (!(u >= 0 && u <= 1 && v >= 0 && v <= 1)) throw new Error(label + ' : coordonnée de texture hors de l\'atlas');
  }
}

describe('rendu du décor — modèles', () => {
  it('chaque type se construit aux trois niveaux, sans défaut de maillage', () => {
    for (const kind of KINDS) {
      for (let lod = 0; lod < 3; lod++) {
        for (let skin = 0; skin < kindInfo(kind).skins; skin++) {
          const t = buildBase(kind, lod, skin);
          checkMesh(t.o, `${kind} niveau ${lod}`);
          if (t.g) checkMesh(t.g, `${kind} niveau ${lod} (verre)`);
          expect(t.o.nv, `${kind} niveau ${lod}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('les modèles sont à l\'échelle de leur gabarit de collision', () => {
    // dépassements voulus : crosse du candélabre, drapeau, borne de la station, auvent du kiosque, bras de la caméra
    // (ainsi que la plaque d'un panneau et le cadran d'une horloge, plus larges que leur mât)
    const reach: Record<string, number> = {
      candelabre: 1.7, mat_drapeau: 1.6, kiosque: 0.8, camera: 0.6, feu_tricolore: 0.35, statue: 0.3, panneau: 0.35, horloge: 0.25,
    };
    const lib = new ModelLibrary();
    for (const kind of KINDS) {
      const info = kindInfo(kind);
      // modèle intact : sans les pièces qui n'existent que cassé ou calciné (éclats au sol, amas fondu)
      const t = lib.get(kind, 0, V_INTACT, 0, info.panes);
      const b = bounds(t.o);
      if (t.g) {
        const g = bounds(t.g);
        b.minX = Math.min(b.minX, g.minX); b.maxX = Math.max(b.maxX, g.maxX);
        b.minZ = Math.min(b.minZ, g.minZ); b.maxZ = Math.max(b.maxZ, g.maxZ);
        b.maxY = Math.max(b.maxY, g.maxY);
      }
      const tol = 0.2 + (reach[kind] ?? 0);
      expect(b.minY, kind).toBeGreaterThanOrEqual(-0.02);
      expect(b.minY, kind).toBeLessThan(0.1);
      expect(b.maxX, kind).toBeLessThanOrEqual(info.hx + tol);
      expect(-b.minX, kind).toBeLessThanOrEqual(info.hx + tol);
      expect(b.maxZ, kind).toBeLessThanOrEqual(info.hz + tol);
      expect(-b.minZ, kind).toBeLessThanOrEqual(info.hz + tol);
      // hauteur : celle du gabarit (la borne de la station de vélos dépasse volontairement)
      if (kind !== 'station_velo') expect(b.maxY, kind).toBeLessThanOrEqual(info.h * 1.06 + 0.06);
      expect(b.maxY, kind).toBeGreaterThanOrEqual(info.h * 0.8);
      // emprise : au moins la moitié de la boîte, sinon l'objet flotterait dans sa collision
      expect(b.maxX - b.minX, kind).toBeGreaterThanOrEqual(info.hx * 0.9);
    }
  });

  it('chaque niveau de détail est plus léger que le précédent', () => {
    let t0 = 0, t1 = 0, t2 = 0;
    for (const kind of KINDS) {
      const a = buildBase(kind, 0, 0), b = buildBase(kind, 1, 0), c = buildBase(kind, 2, 0);
      const na = a.o.ni + (a.g ? a.g.ni : 0), nb = b.o.ni + (b.g ? b.g.ni : 0), nc = c.o.ni + (c.g ? c.g.ni : 0);
      expect(nb, kind).toBeLessThanOrEqual(na);
      expect(nc, kind).toBeLessThanOrEqual(nb);
      t0 += na / 3; t1 += nb / 3; t2 += nc / 3;
    }
    // budget moyen par objet : détaillé < 700 triangles, moyen < 300, lointain < 80
    expect(t0 / KINDS.length).toBeLessThan(700);
    expect(t1 / KINDS.length).toBeLessThan(300);
    expect(t2 / KINDS.length).toBeLessThan(80);
    expect(t1).toBeLessThan(t0 * 0.6);
    expect(t2).toBeLessThan(t1 * 0.5);
  });

  it('émissions : lanternes, feux tricolores', () => {
    const kinds = (b: MeshBuf): Set<number> => { const s = new Set<number>(); for (let i = 0; i < b.nv; i++) s.add(b.fx[i * 4]!); return s; };
    expect(kinds(buildBase('candelabre', 0, 0).o).has(FX_LAMP)).toBe(true);
    expect(kinds(buildBase('candelabre', 2, 0).o).has(FX_LAMP)).toBe(true);
    const feu = kinds(buildBase('feu_tricolore', 1, 0).o);
    expect(feu.has(FX_TL_R) && feu.has(FX_TL_G)).toBe(true);
    for (let lod = 0; lod < 3; lod++) {
      expect(buildBase('candelabre', lod, 0).halos.filter((h) => h.light > 0), `niveau ${lod}`).toHaveLength(1);
      expect(buildBase('feu_tricolore', lod, 0).halos).toHaveLength(3);
    }
  });
});

describe('rendu du décor — états dérivés', () => {
  const lib = new ModelLibrary();

  it('le cache rend le même modèle pour la même demande', () => {
    const a = lib.get('conteneur', 1, V_INTACT, 2, 0);
    expect(lib.get('conteneur', 1, V_INTACT, 2, 0)).toBe(a);
    expect(lib.get('conteneur', 1, V_INTACT, 6, 0)).toBe(a);
    expect(lib.get('conteneur', 1, V_INTACT, 3, 0)).not.toBe(a);
    expect(lib.get('type_inconnu', 1, V_INTACT, 0, 0)).toBe(lib.get('autre', 1, V_INTACT, 0, 0));
  });

  it('tous les types dans tous les états, aux trois niveaux : maillages valides', () => {
    for (const kind of KINDS) {
      for (const v of [V_INTACT, V_DAMAGED, V_BROKEN, V_BURNING, V_BURNT]) {
        for (let lod = 0; lod < 3; lod++) {
          const t = lib.get(kind, lod, v, 0, kindInfo(kind).panes);
          checkMesh(t.o, `${kind} état ${v} niveau ${lod}`);
        }
      }
    }
  });

  it('plastique fondu : le bac calciné s\'affaisse et s\'étale', () => {
    const info = kindInfo('conteneur');
    const intact = bounds(lib.get('conteneur', 0, V_INTACT, 0, 0).o);
    const burnt = bounds(lib.get('conteneur', 0, V_BURNT, 0, 0).o);
    expect(burnt.maxY).toBeLessThan(intact.maxY * 0.5);
    expect(burnt.maxY).toBeLessThan(info.h * info.burntHeight * 1.6);
    expect(burnt.maxX).toBeGreaterThan(intact.maxX);
  });

  it('cadre tordu : le vélo calciné perd pneus et selle, s\'affaisse et se vrille', () => {
    const intact = lib.get('velo', 0, V_INTACT, 0, 0), burnt = lib.get('velo', 0, V_BURNT, 0, 0);
    expect(burnt.o.nv).toBeLessThan(intact.o.nv);
    expect(bounds(burnt.o).maxY).toBeLessThan(bounds(intact.o).maxY * 0.85);
    // couleurs : presque noir
    let sum = 0;
    for (let i = 0; i < burnt.o.nv; i++) sum += burnt.o.col[i * 4]! + burnt.o.col[i * 4 + 1]! + burnt.o.col[i * 4 + 2]!;
    expect(sum / (burnt.o.nv * 3)).toBeLessThan(90);
  });

  it('en feu : lueur d\'incendie sur tout l\'objet, plus forte au pied', () => {
    const t = lib.get('poubelle', 1, V_BURNING, 0, 0);
    let low = 0, high = 0, n = 0;
    for (let i = 0; i < t.o.nv; i++) {
      if (t.o.fx[i * 4] !== FX_FIRE) continue;
      n++;
      if (t.o.pos[i * 3 + 1]! < 0.2) low = Math.max(low, t.o.fx[i * 4 + 1]!);
      if (t.o.pos[i * 3 + 1]! > 0.85) high = Math.max(high, t.o.fx[i * 4 + 1]!);
    }
    expect(n).toBe(t.o.nv);
    expect(low).toBeGreaterThan(high);
  });

  it('vitrages : les panneaux de l\'abribus éclatent un à un et laissent des éclats', () => {
    const full = lib.get('abribus', 0, V_INTACT, 0, 4);
    const three = lib.get('abribus', 0, V_DAMAGED, 0, 3);
    const none = lib.get('abribus', 0, V_BROKEN, 0, 0);
    expect(full.g).not.toBeNull();
    expect(three.g!.nv).toBeLessThan(full.g!.nv);
    expect(three.g!.nv).toBeGreaterThan(0);
    expect(none.g).toBeNull();
    // les éclats et restes de verre remplacent les vitres
    expect(none.o.nv).toBeGreaterThan(full.o.nv);
    expect(three.o.nv).toBeGreaterThan(full.o.nv);
  });

  it('cassé : lanterne éteinte, mobilier fixe élancé plié', () => {
    expect(lib.get('candelabre', 1, V_INTACT, 0, 0).halos.length).toBeGreaterThan(0);
    expect(lib.get('candelabre', 1, V_BROKEN, 0, 0).halos).toHaveLength(0);
    const up = bounds(lib.get('potelet', 0, V_INTACT, 0, 0).o), bent = bounds(lib.get('potelet', 0, V_BROKEN, 0, 0).o);
    expect(bent.maxY).toBeLessThan(up.maxY * 0.85);
    expect(bent.maxX).toBeGreaterThan(up.maxX + 0.3);
    // feu tricolore dont la lentille est brisée : plus de halo
    expect(lib.get('feu_tricolore', 1, V_DAMAGED, 0, 0).halos).toHaveLength(0);
    expect(lib.get('feu_tricolore', 1, V_INTACT, 0, 1).halos).toHaveLength(3);
  });
});

describe('rendu du décor — pose', () => {
  const lib = new ModelLibrary();
  function placed(kind: string, m: Float64Array): Box {
    const out = new MeshBuf(64, 64);
    emitBuf(out, lib.get(kind, 0, V_INTACT, 0, 0).o, m);
    return bounds(out);
  }

  it('un objet couché occupe la boîte de collision que lui donne la simulation', () => {
    // bac roulant basculé vers l'avant : halfZ = hauteur / 2, hauteur = 2 × demi-profondeur
    const c = kindInfo('conteneur');
    for (const positive of [true, false]) {
      const b = placed('conteneur', layDown(matNew(), c, FALL_Z, positive));
      expect(b.minY).toBeGreaterThanOrEqual(-0.03);
      expect(b.maxY).toBeLessThanOrEqual(2 * c.hz + 0.1);
      expect(b.maxZ).toBeLessThanOrEqual(c.h / 2 + 0.06);
      expect(b.minZ).toBeGreaterThanOrEqual(-c.h / 2 - 0.06);
      expect(b.maxX - b.minX).toBeLessThanOrEqual(2 * c.hx + 0.1);
    }
    // vélo à plat sur le flanc
    const v = kindInfo('velo');
    for (const positive of [true, false]) {
      const b = placed('velo', layDown(matNew(), v, FALL_X, positive));
      expect(b.minY).toBeGreaterThanOrEqual(-0.03);
      expect(b.maxY).toBeLessThanOrEqual(2 * v.hx + 0.1);
      expect(b.maxX).toBeLessThanOrEqual(v.h / 2 + 0.08);
      expect(b.minX).toBeGreaterThanOrEqual(-v.h / 2 - 0.08);
    }
  });

  it('propMatrix : position, cap (le +z du modèle part vers (sin h, cos h)), renversement, port', () => {
    const m = matNew();
    const h = Math.PI / 2;
    propMatrix(m, 'velo', 5, 10, 2, -4, h, 0.28, 0.9, 1.05, false, false, false);
    // la roue avant (z local +0,56) se retrouve à l'est (+x)
    const b = placed('velo', m);
    expect(b.maxX).toBeGreaterThan(10.7);
    expect(b.minX).toBeLessThan(9.3);
    expect(b.minY).toBeGreaterThanOrEqual(1.97);
    expect((b.minZ + b.maxZ) / 2).toBeCloseTo(-4, 0);
    // renversé : boîte de la simulation (halfX = hauteur / 2, hauteur = 2 × halfX d'origine)
    propMatrix(m, 'velo', 5, 0, 0, 0, 0, 0.525, 0.9, 0.56, true, false, false);
    expect(placed('velo', m).maxY).toBeLessThan(0.7);
    // porté : soulevé du sol
    propMatrix(m, 'palette', 5, 0, 0, 0, 0, 0.6, 0.4, 0.15, false, true, false);
    expect(placed('palette', m).minY).toBeGreaterThan(0.4);
    // roulé : reste au sol, basculé
    propMatrix(m, 'conteneur', 5, 0, 0, 0, 0, 0.63, 0.39, 1.2, false, true, false);
    const r = placed('conteneur', m);
    expect(r.minY).toBeLessThan(0.2);
    expect(r.minZ).toBeLessThan(-0.5);
  });

  it('barricade : composition déterministe qui couvre la longueur demandée', () => {
    const a = synthParts(42, 3, 0.9), b = synthParts(42, 3, 0.9);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(4);
    expect(synthParts(43, 3, 0.9)).not.toEqual(a);
    expect(new Set(a.map((p) => p.kind)).size).toBeGreaterThanOrEqual(3);
    let minX = Infinity, maxX = -Infinity;
    const base = matNew(), m = matNew();
    for (let i = 0; i < a.length; i++) {
      const p = a[i]!;
      expect(Math.abs(p.lz)).toBeLessThanOrEqual(0.9);
      minX = Math.min(minX, p.lx); maxX = Math.max(maxX, p.lx);
      partMatrix(m, base, p, i, 42, a, 1.3);
      for (let k = 0; k < 12; k++) expect(Number.isFinite(m[k]!)).toBe(true);
    }
    expect(minX).toBeLessThan(-1.5);
    expect(maxX).toBeGreaterThan(1.5);
    expect(maxX).toBeLessThan(3.6);
    expect(synthParts(1, 8, 1).length).toBeGreaterThan(a.length);
  });
});

describe('rendu du décor — devantures', () => {
  const state = (over: Partial<ShopState> = {}): ShopState => ({
    window: 'intact', shutter: 0, stock: 1, burning: 0, forced: false, burnt: false, boards: false, tags: 0, hasShutter: true, ...over,
  });

  it('les baies tiennent dans la largeur, sans se chevaucher, avec une porte dès que possible', () => {
    const out: { x0: number; x1: number; sill: number; door: boolean }[] = [];
    for (let i = 0; i < 12; i++) out.push({ x0: 0, x1: 0, sill: 0, door: false });
    for (const width of [1.2, 2, 2.6, 3.4, 5, 7.5, 12]) {
      for (let seed = 1; seed < 12; seed++) {
        const style = shopStyle('mode', seed);
        const n = layoutOpenings(width, style, out);
        expect(n, `largeur ${width}`).toBeGreaterThanOrEqual(1);
        const list = out.slice(0, n).sort((a, b) => a.x0 - b.x0);
        for (let i = 0; i < n; i++) {
          expect(list[i]!.x1).toBeGreaterThan(list[i]!.x0 + 0.3);
          expect(list[i]!.x0).toBeGreaterThanOrEqual(-width / 2 + 0.19);
          expect(list[i]!.x1).toBeLessThanOrEqual(width / 2 - 0.19);
          if (i > 0) expect(list[i]!.x0).toBeGreaterThanOrEqual(list[i - 1]!.x1 + 0.05);
          expect(list[i]!.x1 - list[i]!.x0).toBeLessThanOrEqual(2.6);
        }
        if (width >= 2.2) expect(list.filter((o) => o.door)).toHaveLength(1);
      }
    }
  });

  it('tous les états, à tous les niveaux : géométrie valide, plaquée sur la façade', () => {
    const states: ShopState[] = [
      state(), state({ window: 'tagged', tags: 2 }), state({ window: 'cracked' }), state({ window: 'broken' }),
      state({ window: 'boarded', boards: true, tags: 1 }), state({ shutter: 0.5 }), state({ shutter: 1, tags: 1 }),
      state({ shutter: 0.3, forced: true, window: 'broken' }), state({ window: 'broken', stock: 0 }),
      state({ window: 'broken', burning: 0.9 }), state({ burnt: true, window: 'broken', stock: 0 }),
    ];
    const cats = ['cafe_restaurant', 'pharmacie', 'banque', 'hotel', 'alimentation', 'luxe'];
    const m = matNew();
    for (const cat of cats) {
      for (let si = 0; si < states.length; si++) {
        let prev = Infinity;
        for (let lod = 0; lod < 4; lod++) {
          const buf = new MeshBuf(64, 64);
          buildShopfront(buf, m, 5, cat, shopStyle(cat, 7), states[si]!, lod, null, 99);
          checkMesh(buf, `${cat} état ${si} niveau ${lod}`);
          const b = bounds(buf);
          expect(b.minX).toBeGreaterThanOrEqual(-2.9);
          expect(b.maxX).toBeLessThanOrEqual(2.9);
          expect(b.minY).toBeGreaterThanOrEqual(-0.001);
          expect(b.maxY).toBeLessThanOrEqual(7);
          // jamais derrière le plan de la façade ; store banne et débris ne débordent pas de 2 m sur le trottoir
          expect(b.minZ).toBeGreaterThanOrEqual(0);
          expect(b.maxZ).toBeLessThanOrEqual(2.0);
          if (lod !== 1) expect(buf.nv, `${cat} état ${si} niveau ${lod}`).toBeLessThanOrEqual(prev);
          prev = buf.nv;
          if (lod >= 2) expect(buf.nv).toBeLessThanOrEqual(24);
        }
      }
    }
  });

  it('le rideau de fer descend progressivement', () => {
    const m = matNew();
    const style = shopStyle('mode', 4);
    const lowest = (shutter: number): number => {
      const before = new MeshBuf(64, 64), after = new MeshBuf(64, 64);
      buildShopfront(before, m, 4, 'mode', style, state({ shutter: 0 }), 1, null, 5);
      buildShopfront(after, m, 4, 'mode', style, state({ shutter }), 1, null, 5);
      // les sommets ajoutés par le rideau sont à z = 0,10 : on cherche leur point le plus bas
      let y = Infinity;
      for (let i = 0; i < after.nv; i++) if (Math.abs(after.pos[i * 3 + 2]! - 0.1) < 1e-4) y = Math.min(y, after.pos[i * 3 + 1]!);
      expect(after.nv).toBeGreaterThan(before.nv - 60);
      return y;
    };
    const y25 = lowest(0.25), y50 = lowest(0.5), y75 = lowest(0.75);
    expect(y25).toBeGreaterThan(y50);
    expect(y50).toBeGreaterThan(y75);
    expect(y25).toBeLessThan(2.52);
    expect(y75).toBeGreaterThan(0);
  });

  it('lumières : vitrine éclairée, rideau baissé, incendie, croix de pharmacie', () => {
    const glows: ShopGlow[] = [];
    const lit = { ...shopStyle('mode', 1), lightsOn: true };
    shopGlows(glows, 5, lit, state());
    expect(glows).toHaveLength(1);
    expect(glows[0]!.ground).toBe(true);
    shopGlows(glows, 5, lit, state({ shutter: 1 }));
    expect(glows).toHaveLength(0);
    shopGlows(glows, 5, lit, state({ window: 'boarded', boards: true }));
    expect(glows).toHaveLength(0);
    shopGlows(glows, 5, lit, state({ burning: 0.8 }));
    expect(glows).toHaveLength(2);
    expect(glows.every((g) => g.gate === FX_FIRE)).toBe(true);
    shopGlows(glows, 5, lit, state({ burnt: true, burning: 0.8 }));
    expect(glows).toHaveLength(0);
    shopGlows(glows, 5, shopStyle('pharmacie', 1), state({ shutter: 1 }));
    expect(glows).toHaveLength(1);
    expect(glows[0]!.ground).toBe(false);
  });
});
