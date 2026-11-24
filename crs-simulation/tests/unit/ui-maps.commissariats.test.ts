/* =====================================================================================
 * Cartes — commissariats : données de la scène (service 'police.commissariats'), symbole et nom sur la carte,
 * véhicules garés en réserve retirés de la liste des unités, voiture banalisée de la BAC.
 *
 * Le service du module de jeu est remplacé par une forme minimale publiée par ctx.provide (même contrat que
 * CommissariatsApi) bâtie sur les VRAIES données des sept sites : c'est la carte que l'on éprouve ici.
 * ===================================================================================== */

import { describe, expect, it } from 'vitest';
import type { EntityId, GameContext, PlayableRole } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import type { CommissariatView, CommissariatsApi, StockEntryView } from '@/gameplay/commissariats/api';
import { ALL_LAYERS, commissariatAt, commissariatLabel, drawOverlay } from '@/ui/maps/overlay';
import type { OverlayOptions } from '@/ui/maps/overlay';
import { MapScene } from '@/ui/maps/scene';
import { commissariatIconUrl, commissariatLetters } from '@/ui/maps/symbols';
import { MapTransform } from '@/ui/maps/transform';
import { symbolOfVehicle } from '@/ui/maps/units';
import { COMMISSARIATS, commissariatById } from '@/world/commissariats';

/** Service minimal : les vrais sites, un nombre d'unités disponibles réglable, les véhicules tenus. */
function stubService(held: Set<EntityId>): { api: CommissariatsApi; views: CommissariatView[] } {
  const views: CommissariatView[] = COMMISSARIATS.map((d) => {
    const entries: StockEntryView[] = d.stock.map((s) => ({
      id: d.id + ':' + s.id, commissariatId: d.id, kind: s.kind, callsign: s.callsign, label: s.label, vehicle: s.vehicle,
      vehicles: s.vehicles, crew: s.crew, state: 'au_poste', squadId: 0, restUntil: 0, vehicleIds: [], engageable: s.engageable, where: '',
    }));
    return {
      id: d.id, name: d.name, short: d.short, kind: d.kind, x: d.door.x, z: d.door.z,
      returnX: d.door.x, returnZ: d.door.z, returnHeading: 0, entries,
      available: entries.filter((e) => e.engageable).length, engaged: 0, resting: 0, patrols: [],
    };
  });
  const api: CommissariatsApi = {
    enabled: true,
    canDispatch: true,
    list: views,
    get: (id) => views.find((v) => v.id === id),
    entry: () => undefined,
    engage: () => ({ ok: false, reason: 'essai', squadId: 0, defaultVerb: 'faire_mouvement' }),
    recall: () => null,
    holds: (id) => held.has(id),
    isStationUnit: () => false,
    entryOf: () => undefined,
    atPost: () => false,
  };
  return { api, views };
}

async function context(role: PlayableRole = 'commandant'): Promise<GameContext> {
  const t = createTestContext();
  await t.start();
  const ctx = t.ctx;
  const p = role === 'manifestant'
    ? ctx.people.spawn({ kind: 'manifestant', faction: 'protest', x: 0, z: 0 })
    : ctx.people.spawn({ kind: 'commissaire', faction: 'police', x: 0, z: 0, rank: 'commissaire', poste: 'autorite_civile' });
  ctx.player.possess(p.id, role);
  return ctx;
}

/** Faux contexte 2D qui enregistre les textes écrits (fillText) et accepte tous les autres appels. */
function recorder(): { g: CanvasRenderingContext2D; texts: string[]; calls: number } {
  const texts: string[] = [];
  const state = { calls: 0 };
  const gradient = { addColorStop: (): void => undefined };
  const target: Record<string, unknown> = {};
  const g = new Proxy(target, {
    get(obj, key) {
      if (typeof key !== 'string') return undefined;
      if (key in obj) return obj[key];
      return (...args: unknown[]): unknown => {
        state.calls++;
        if (key === 'fillText') texts.push(String(args[0]));
        if (key === 'createRadialGradient' || key === 'createLinearGradient') return gradient;
        if (key === 'measureText') return { width: String(args[0]).length * 6 };
        return undefined;
      };
    },
    set(obj, key, value) {
      if (typeof key === 'string') obj[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { g, texts, get calls() { return state.calls; } };
}

function transform(x: number, z: number, mpp: number): MapTransform {
  const t = new MapTransform();
  t.setSize(1200, 800);
  t.minMpp = 0.05;
  t.setMpp(mpp);
  t.setCenter(x, z);
  return t;
}

function options(over: Partial<OverlayOptions> = {}): OverlayOptions {
  return {
    layers: { ...ALL_LAYERS }, compact: false, selection: null, hoverKey: 0, commandable: null, size: 15,
    time: 0, gpsRoute: [], gpsTarget: null, focusIncident: 0, focusStation: 0, focusClosure: 0, edge: null,
    ...over,
  };
}

describe('cartes — commissariats', () => {
  it('le service publié remplit scene.commissariats (porte, stock, rue des places)', async () => {
    const ctx = await context();
    const { api } = stubService(new Set());
    ctx.provide('police.commissariats', api);
    const scene = new MapScene(ctx);
    scene.ensureFresh();
    expect(scene.commissariats.map((c) => c.id)).toEqual(COMMISSARIATS.map((d) => d.id));
    const neuf = scene.commissariats.find((c) => c.id === '9e')!;
    const def = commissariatById('9e')!;
    expect(neuf.x).toBe(def.door.x);
    expect(neuf.z).toBe(def.door.z);
    expect(neuf.kind).toBe('commissariat_central');
    expect(neuf.available).toBe(def.stock.filter((s) => s.engageable).length);
    expect(neuf.total).toBe(neuf.available);
    expect(neuf.bayStreet).toBe('Boulevard Haussmann');
    // la Cité : car et PC mobile hors dispositif, non comptés
    const cite = scene.commissariats.find((c) => c.id === 'cite')!;
    expect(cite.total).toBe(commissariatById('cite')!.stock.filter((s) => s.engageable).length);
    expect(cite.total).toBeLessThan(commissariatById('cite')!.stock.length);
    expect(cite.bayStreet).toBe('');
  });

  it('rafraîchie au plus deux fois par seconde (invalidate() force la relecture)', async () => {
    const ctx = await context();
    const { api, views } = stubService(new Set());
    ctx.provide('police.commissariats', api);
    const scene = new MapScene(ctx);
    scene.ensureFresh();
    const before = scene.commissariats.find((c) => c.id === '9e')!.available;
    views.find((v) => v.id === '9e')!.available = 0;
    scene.ensureFresh();
    expect(scene.commissariats.find((c) => c.id === '9e')!.available).toBe(before);
    scene.invalidate();
    scene.ensureFresh();
    expect(scene.commissariats.find((c) => c.id === '9e')!.available).toBe(0);
  });

  it('rien pour un rôle hors police, ni sans le service, ni quand le module est inactif', async () => {
    const civil = await context('manifestant');
    civil.provide('police.commissariats', stubService(new Set()).api);
    const s1 = new MapScene(civil);
    s1.ensureFresh();
    expect(s1.commissariats.length).toBe(0);

    const sans = await context();
    const s2 = new MapScene(sans);
    expect(() => s2.ensureFresh()).not.toThrow();
    expect(s2.commissariats.length).toBe(0);

    const inactif = await context();
    inactif.provide('police.commissariats', { ...stubService(new Set()).api, enabled: false });
    const s3 = new MapScene(inactif);
    s3.ensureFresh();
    expect(s3.commissariats.length).toBe(0);
  });

  it('un véhicule garé en réserve n\'apparaît pas dans les unités ; un véhicule de police libre, si', async () => {
    const ctx = await context();
    const held = new Set<EntityId>();
    const parked = ctx.vehicles.spawn('fourgon_crs', 40, 0, 0, { faction: 'police' });
    const free = ctx.vehicles.spawn('fourgon_crs', 60, 0, 0, { faction: 'police' });
    held.add(parked.id);

    const sans = new MapScene(ctx);
    sans.ensureFresh();
    expect(sans.units.some((u) => u.vehicleId === parked.id)).toBe(true);

    ctx.provide('police.commissariats', stubService(held).api);
    const scene = new MapScene(ctx);
    scene.ensureFresh();
    expect(scene.units.some((u) => u.vehicleId === parked.id)).toBe(false);
    expect(scene.units.some((u) => u.vehicleId === free.id && u.key === -free.id)).toBe(true);
  });

  it('voiture banalisée de la BAC : symbole « patrouille », comme la voiture de police', () => {
    expect(symbolOfVehicle('voiture_bac')).toBe('patrouille');
    expect(symbolOfVehicle('voiture_police')).toBe('patrouille');
    expect(symbolOfVehicle('fourgon_crs')).toBe('vehicule');
  });

  it('lettres du symbole : PP préfecture, G gendarmerie, P commissariat', () => {
    expect(commissariatLetters(commissariatById('cite')!.kind)).toBe('PP');
    expect(commissariatLetters(commissariatById('celestins')!.kind)).toBe('G');
    expect(commissariatLetters(commissariatById('9e')!.kind)).toBe('P');
    expect(commissariatLabel({ name: 'Commissariat du 9e — rue Chauchat', short: '9e' })).toBe('Commissariat du 9e');
    // hors navigateur : pas d'image, et pas d'exception
    expect(commissariatIconUrl('prefecture')).toBe('');
  });

  it('dessin : nom affiché de près (mpp < 2,5), symbole seul de loin, rien quand la couche est masquée', async () => {
    const ctx = await context();
    ctx.provide('police.commissariats', stubService(new Set()).api);
    const scene = new MapScene(ctx);
    scene.ensureFresh();
    const def = commissariatById('9e')!;
    const available = String(scene.commissariats.find((c) => c.id === '9e')!.available);

    const near = recorder();
    drawOverlay(near.g, transform(def.door.x, def.door.z, 1), scene, options());
    expect(near.texts).toContain('P');
    expect(near.texts).toContain(available);
    expect(near.texts).toContain('Commissariat du 9e');
    expect(near.texts).toContain('véhicules : Boulevard Haussmann');

    const far = recorder();
    drawOverlay(far.g, transform(def.door.x, def.door.z, 4), scene, options());
    expect(far.texts).toContain('P');
    expect(far.texts).not.toContain('Commissariat du 9e');

    // site mis en avant : nommé même de loin
    const focus = recorder();
    drawOverlay(focus.g, transform(def.door.x, def.door.z, 4), scene, options({ focusCommissariat: '9e' }));
    expect(focus.texts).toContain('Commissariat du 9e');

    const hidden = recorder();
    drawOverlay(hidden.g, transform(def.door.x, def.door.z, 1), scene, options({ layers: { ...ALL_LAYERS, commissariats: false } }));
    expect(hidden.texts).not.toContain('P');
    expect(hidden.texts).not.toContain('Commissariat du 9e');
  });

  it('sans le service : rien n\'est dessiné et rien ne lève', async () => {
    const ctx = await context();
    const scene = new MapScene(ctx);
    scene.ensureFresh();
    const def = commissariatById('9e')!;
    const rec = recorder();
    expect(() => drawOverlay(rec.g, transform(def.door.x, def.door.z, 1), scene, options())).not.toThrow();
    expect(rec.texts).not.toContain('P');
    expect(rec.texts).not.toContain('Commissariat du 9e');
  });

  it('désignation : le symbole sous le pointeur est trouvé, à la tolérance près', async () => {
    const ctx = await context();
    ctx.provide('police.commissariats', stubService(new Set()).api);
    const scene = new MapScene(ctx);
    scene.ensureFresh();
    const def = commissariatById('7e')!;
    const t = transform(def.door.x, def.door.z, 1);
    // le centre de la vue est la porte du 7e
    expect(commissariatAt(scene, t, 600, 400, 14)?.id).toBe('7e');
    expect(commissariatAt(scene, t, 610, 400, 14)?.id).toBe('7e');
    expect(commissariatAt(scene, t, 640, 400, 14)).toBeNull();
    expect(commissariatAt(scene, t, 618, 400, 22)?.id).toBe('7e');
  });
});
