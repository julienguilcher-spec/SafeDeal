/* Registre extensible des modèles d'objets tenus en main et accessoires transparents (visières). */

import { GeoBuilder, SCALE_HEAD, SCALE_NONE, SLOT_FIXED } from './geo';
import { BONE_CHEST, BONE_HAND_L, BONE_HAND_R, BONE_HEAD } from './skeleton';
import { HOLD_NAMES, HOLD_SMALL } from './poseparams';
import type { HeldBone, HeldModelFactory, HeldModelOptions } from './api';

export interface HeldModel {
  key: string;
  /** Identifiant de pièce dans la géométrie (1..255). */
  id: number;
  factory: (g: GeoBuilder) => void;
  bone: number;
  hold: number;
  big: boolean;
  transparent: boolean;
  colors: readonly number[] | null;
  text: 'none' | 'slogan' | 'unit';
  twoHanded: boolean;
  /** Famille (géométrie fusionnée) et nombre de sommets, calculés à la construction. */
  family: number;
  verts: number;
}

const models: HeldModel[] = [];
const byKey = new Map<string, HeldModel>();
const aliases = new Map<string, string>();
let version = 1;
let builtins = false;

const BONES: Record<HeldBone, number> = { handR: BONE_HAND_R, handL: BONE_HAND_L, chest: BONE_CHEST, head: BONE_HEAD };

/** Numéro de version du registre (augmente à chaque ajout : les géométries sont alors reconstruites). */
export function heldRegistryVersion(): number {
  return version;
}

export function heldModels(): readonly HeldModel[] {
  return models;
}

/**
 * Enregistre un modèle d'objet tenu. `key` est la clé ItemDef.heldModel (ou, à défaut, l'identifiant de
 * l'objet). Réenregistrer une clé remplace le modèle.
 */
export function registerHeldModel(key: string, factory: HeldModelFactory, options: HeldModelOptions = {}): void {
  const hold = options.hold ? HOLD_NAMES.indexOf(options.hold) : HOLD_SMALL;
  const existing = byKey.get(key);
  const id = existing ? existing.id : models.length + 1;
  if (id > 255) {
    console.error('[people] trop de modèles tenus (255 au plus) :', key);
    return;
  }
  const m: HeldModel = {
    key, id,
    factory: factory as (g: GeoBuilder) => void,
    bone: BONES[options.bone ?? 'handR'],
    hold: hold < 0 ? HOLD_SMALL : hold,
    big: options.big === true,
    transparent: options.transparent === true,
    colors: options.colors && options.colors.length ? options.colors : null,
    text: options.text ?? 'none',
    twoHanded: options.twoHanded === true,
    family: 0,
    verts: 0,
  };
  if (existing) models[models.indexOf(existing)] = m; else models.push(m);
  byKey.set(key, m);
  version++;
}

export function aliasHeldModel(alias: string, key: string): void {
  aliases.set(alias, key);
  version++;
}

/** Modèle pour une clé (alias résolus), ou undefined. */
export function findHeldModel(key: string): HeldModel | undefined {
  const m = byKey.get(key);
  if (m) return m;
  const a = aliases.get(key);
  return a !== undefined ? byKey.get(a) : undefined;
}

export function heldModelKeys(): string[] {
  return [...byKey.keys(), ...aliases.keys()].filter((k) => k.charCodeAt(0) !== 95).sort();
}

/** Dessine un modèle dans un constructeur (repère de son os, sans mise à l'échelle). */
export function emitHeldModel(m: HeldModel, b: GeoBuilder): void {
  const before = b.vertexCount;
  b.identity();
  b.ctx(m.bone, SLOT_FIXED, m.id, SCALE_NONE).fixed(0x808080, 0.6);
  m.factory(b);
  b.identity();
  m.verts = b.vertexCount - before;
}

// ── accessoires internes : visières transparentes (attachées à la tête, à l'échelle de la tête) ──

const HPI = Math.PI / 2;

function visorShape(b: GeoBuilder, hex: number, alpha: number, raise: number): void {
  b.mode = SCALE_HEAD;
  b.fixed(hex, alpha);
  b.push().translate(0, 0.112, 0.01).rotX(-raise).translate(0, -0.112, -0.01);
  b.arc([[-0.020, 0.094, 0.112, 0.006], [0.050, 0.102, 0.124, 0.002], [0.126, 0.105, 0.127, -0.004]], 8, HPI - 1.2, HPI + 1.2);
  b.fixed(0x16181c, 0.9);
  b.arc([[0.122, 0.1055, 0.1275, -0.004], [0.136, 0.1055, 0.1275, -0.004]], 8, HPI - 1.25, HPI + 1.25);
  b.pop();
}

/** Enregistre les modèles intégrés (une seule fois). Les modèles d'objets sont fournis par les fichiers held_*. */
export function ensureBuiltinModels(registerAll: () => void): void {
  if (builtins) return;
  builtins = true;
  registerHeldModel('_visor_up', (g) => visorShape(g as GeoBuilder, 0xcfdfe8, 0.22, 1.25), { bone: 'head', transparent: true, hold: 'none' });
  registerHeldModel('_visor_down', (g) => visorShape(g as GeoBuilder, 0xcfdfe8, 0.22, 0), { bone: 'head', transparent: true, hold: 'none' });
  registerHeldModel('_visor_gold', (g) => visorShape(g as GeoBuilder, 0xd9b44a, 0.5, 0), { bone: 'head', transparent: true, hold: 'none' });
  registerAll();
}
