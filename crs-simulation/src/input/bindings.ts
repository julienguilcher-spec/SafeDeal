/* =====================================================================================
 * Entrées — table de correspondance touches/boutons → actions, réaffectation et persistance.
 *
 * Codes physiques :
 *   clavier/souris : KeyboardEvent.code (« KeyW », « Space »…) — touches PHYSIQUES, donc ZQSD
 *                    sur un clavier AZERTY sans rien changer — plus « Mouse0 »…« Mouse4 »,
 *                    « WheelUp » et « WheelDown » ;
 *   manette        : « B0 »…« B16 » (indices du mapping standard de la Gamepad API).
 * Chaque action accepte au plus MAX_SLOTS codes. Seuls les ÉCARTS aux valeurs par défaut sont
 * enregistrés (section « bindings » de la sauvegarde) : une future modification des valeurs par
 * défaut profite aux joueurs qui n'ont pas touché à l'action concernée.
 * Aucun accès au DOM.
 * ===================================================================================== */

import type { SaveApi } from '@/core/contracts';
import { ACTIONS, ACTION_COUNT, actionContext, actionIndex, contextsOverlap } from './buttons';
import type { BindAction } from './buttons';

export type BindDevice = 'kbm' | 'gamepad';

/** Section de la sauvegarde. */
export const BINDINGS_SECTION = 'bindings';
export const BINDINGS_VERSION = 1;
/** Nombre de codes par action (affectation principale + secondaire). */
export const MAX_SLOTS = 2;

type Table = Partial<Record<BindAction, readonly string[]>>;

/** Clavier/souris — conforme au tableau « Commandes par défaut » de docs/ARCHITECTURE.md §5. */
export const DEFAULT_KBM: Readonly<Table> = {
  move_forward: ['KeyW'], move_back: ['KeyS'], move_left: ['KeyA'], move_right: ['KeyD'],
  look_left: ['ArrowLeft'], look_right: ['ArrowRight'], look_up: ['ArrowUp'], look_down: ['ArrowDown'],
  primary: ['Mouse0'], secondary: ['Mouse2'],
  interact: ['KeyE'],
  sprint: ['ShiftLeft'], crouch: ['KeyC'], jump: ['Space'],
  // bascule marche ↔ petite foulée (touche physique à gauche de X : « W » sur un clavier AZERTY)
  jog: ['KeyZ'],
  item_next: ['WheelDown'], item_prev: ['WheelUp'],
  slot1: ['Digit1'], slot2: ['Digit2'], slot3: ['Digit3'], slot4: ['Digit4'], slot5: ['Digit5'],
  slot6: ['Digit6'], slot7: ['Digit7'], slot8: ['Digit8'], slot9: ['Digit9'],
  radio: ['KeyT'], orders: ['KeyF'], map: ['KeyM'], tactical: ['Tab'], camera: ['KeyV'],
  mask: ['KeyG'], visor: ['KeyH'],
  siren: ['KeyR'], beacons: ['KeyB'], horn: ['KeyN'], handbrake: ['Space'],
  fast_forward: ['Period'], pause: ['Escape'],
  // P est réservé à l'acceptation des propositions de l'adjoint (ui/command/quickActions.ts)
  // actions absentes du tableau : choix du module
  reload: ['KeyR'], flashlight: ['KeyL'], headlights: ['KeyL'], megaphone: ['KeyX'],
  zoom_in: ['Equal', 'NumpadAdd'], zoom_out: ['Minus', 'NumpadSubtract'],
  ui_accept: ['Enter', 'NumpadEnter'], ui_back: ['Escape', 'Backspace'],
  ui_up: ['ArrowUp'], ui_down: ['ArrowDown'], ui_left: ['ArrowLeft'], ui_right: ['ArrowRight'],
};

/**
 * Manette (mapping standard) — conforme au même tableau. Les sticks et les gâchettes analogiques
 * ne passent pas par cette table (stick gauche = déplacement, stick droit = regard,
 * gâchettes = InputState.throttle / brake en plus des boutons primary / secondary).
 * Ajouts hors tableau (le tableau indique « — ») : Y = recharger à pied et sirène en véhicule,
 * B = gyrophares en véhicule, clic du stick gauche = klaxon en véhicule — pour qu'aucune action
 * de conduite ne soit réservée au clavier. Ces boutons étaient libres dans ces contextes.
 */
export const DEFAULT_GAMEPAD: Readonly<Table> = {
  primary: ['B7'], secondary: ['B6'],
  interact: ['B2'],
  sprint: ['B10'], crouch: ['B1'], jump: ['B0'],
  item_prev: ['B4'], item_next: ['B5'],
  radio: ['B12'], orders: ['B15'], map: ['B8'], camera: ['B11'],
  mask: ['B13'], visor: ['B14'],
  handbrake: ['B0'], pause: ['B9'],
  reload: ['B3'], siren: ['B3'], beacons: ['B1'], horn: ['B10'],
  ui_accept: ['B0'], ui_back: ['B1'],
  ui_up: ['B12'], ui_down: ['B13'], ui_left: ['B14'], ui_right: ['B15'],
};

/** Codes reconnus pour une manette. */
const PAD_CODE = /^B(\d|1[0-6])$/;
/** Codes reconnus pour le clavier et la souris : tout KeyboardEvent.code plausible, boutons de souris, molette. */
const KBM_CODE = /^[A-Z][A-Za-z0-9]{1,24}$/;

export function isValidCode(device: BindDevice, code: unknown): code is string {
  if (typeof code !== 'string') return false;
  return device === 'gamepad' ? PAD_CODE.test(code) : KBM_CODE.test(code);
}

/** Format enregistré : uniquement les actions modifiées. */
export interface StoredBindings {
  v: number;
  kbm: Record<string, string[]>;
  gamepad: Record<string, string[]>;
}

type SaveLike = Pick<SaveApi, 'read' | 'write' | 'remove'>;

const EMPTY: readonly string[] = Object.freeze([]) as readonly string[];
const EMPTY_INDEXES: readonly number[] = Object.freeze([]) as readonly number[];

function sameCodes(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export class BindingStore {
  /** Incrémenté à chaque modification : les caches (libellés, tables inverses) s'y fient. */
  version = 1;
  private readonly tables: Record<BindDevice, string[][]>;
  private readonly defaults: Record<BindDevice, readonly (readonly string[])[]>;
  private readonly reverse: Record<BindDevice, Map<string, number[]>>;
  private readonly listeners: (() => void)[] = [];

  constructor(private readonly save: SaveLike | null = null) {
    this.defaults = { kbm: expand(DEFAULT_KBM), gamepad: expand(DEFAULT_GAMEPAD) };
    this.tables = {
      kbm: this.defaults.kbm.map((c) => c.slice()),
      gamepad: this.defaults.gamepad.map((c) => c.slice()),
    };
    this.reverse = { kbm: new Map(), gamepad: new Map() };
    this.load();
    this.rebuild('kbm');
    this.rebuild('gamepad');
  }

  /** Codes affectés à une action (0 à MAX_SLOTS). Ne pas modifier le tableau retourné. */
  get(device: BindDevice, action: BindAction): readonly string[] {
    const i = actionIndex(action);
    return i < 0 ? EMPTY : this.tables[device][i]!;
  }

  defaultsFor(device: BindDevice, action: BindAction): readonly string[] {
    const i = actionIndex(action);
    return i < 0 ? EMPTY : this.defaults[device][i]!;
  }

  /** Index des actions déclenchées par un code physique (tableau partagé : ne pas le modifier). */
  actionsFor(device: BindDevice, code: string): readonly number[] {
    return this.reverse[device].get(code) ?? EMPTY_INDEXES;
  }

  /** Ce code est-il affecté à au moins une action ? */
  isBound(device: BindDevice, code: string): boolean {
    return this.reverse[device].has(code);
  }

  /** Actions qui utilisent déjà ce code dans un contexte qui recouvre celui de `action`. */
  conflicts(device: BindDevice, action: BindAction, code: string): BindAction[] {
    const out: BindAction[] = [];
    const ctx = actionContext(action);
    const list = this.reverse[device].get(code);
    if (!list) return out;
    for (let k = 0; k < list.length; k++) {
      const other = ACTIONS[list[k]!]!;
      if (other !== action && contextsOverlap(ctx, actionContext(other))) out.push(other);
    }
    return out;
  }

  /**
   * Affecte `code` à l'emplacement `slot` (0 = principal, 1 = secondaire) d'une action ;
   * `code = null` vide l'emplacement. Par défaut (`steal`), le code est retiré des actions en
   * conflit (même contexte) : la liste de ces actions dépossédées est retournée.
   * Retourne null si la demande est invalide (action ou code inconnus).
   */
  set(device: BindDevice, action: BindAction, slot: number, code: string | null, steal = true): BindAction[] | null {
    const i = actionIndex(action);
    if (i < 0 || slot < 0 || slot >= MAX_SLOTS || (slot | 0) !== slot) return null;
    if (code !== null && !isValidCode(device, code)) return null;
    const table = this.tables[device];
    const codes = table[i]!;
    const stolen: BindAction[] = [];
    if (code === null) {
      if (slot < codes.length) codes.splice(slot, 1);
    } else {
      if (steal) {
        const losers = this.conflicts(device, action, code);
        for (let k = 0; k < losers.length; k++) {
          const li = actionIndex(losers[k]!);
          const lc = table[li]!;
          const at = lc.indexOf(code);
          if (at >= 0) lc.splice(at, 1);
          stolen.push(losers[k]!);
        }
      }
      const existing = codes.indexOf(code);
      if (existing >= 0) codes.splice(existing, 1);     // déjà présent ailleurs dans l'action : on le déplace
      if (slot < codes.length) codes[slot] = code;
      else codes.push(code);
    }
    this.changed(device);
    return stolen;
  }

  /** Revient aux valeurs par défaut (un périphérique, ou les deux) et efface la sauvegarde correspondante. */
  reset(device?: BindDevice): void {
    const devices: BindDevice[] = device ? [device] : ['kbm', 'gamepad'];
    for (const d of devices) {
      this.tables[d] = this.defaults[d].map((c) => c.slice());
      this.rebuild(d);
    }
    this.version++;
    this.persist();
    this.notify();
  }

  /** Remet une seule action à sa valeur par défaut. */
  resetAction(device: BindDevice, action: BindAction): void {
    const i = actionIndex(action);
    if (i < 0) return;
    this.tables[device][i] = this.defaults[device][i]!.slice();
    this.changed(device);
  }

  isDefault(device: BindDevice, action?: BindAction): boolean {
    const table = this.tables[device];
    const def = this.defaults[device];
    if (action !== undefined) {
      const i = actionIndex(action);
      return i < 0 || sameCodes(table[i]!, def[i]!);
    }
    for (let i = 0; i < ACTION_COUNT; i++) if (!sameCodes(table[i]!, def[i]!)) return false;
    return true;
  }

  /** Écart aux valeurs par défaut, au format enregistré. */
  serialize(): StoredBindings {
    const out: StoredBindings = { v: BINDINGS_VERSION, kbm: {}, gamepad: {} };
    for (const d of ['kbm', 'gamepad'] as const) {
      const table = this.tables[d];
      const def = this.defaults[d];
      for (let i = 0; i < ACTION_COUNT; i++) {
        if (!sameCodes(table[i]!, def[i]!)) out[d][ACTIONS[i]!] = table[i]!.slice();
      }
    }
    return out;
  }

  /** Prévenu après chaque modification (clavier : relâcher les touches tenues, libellés…). */
  onChange(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      const at = this.listeners.indexOf(listener);
      if (at >= 0) this.listeners.splice(at, 1);
    };
  }

  // ───────────────────────────── interne ─────────────────────────────

  private changed(device: BindDevice): void {
    this.rebuild(device);
    this.version++;
    this.persist();
    this.notify();
  }

  private notify(): void {
    for (let i = 0; i < this.listeners.length; i++) {
      try {
        this.listeners[i]!();
      } catch (err) {
        console.error('[input] erreur dans un écouteur de réaffectation', err);
      }
    }
  }

  private rebuild(device: BindDevice): void {
    const map = this.reverse[device];
    map.clear();
    const table = this.tables[device];
    for (let i = 0; i < ACTION_COUNT; i++) {
      const codes = table[i]!;
      for (let k = 0; k < codes.length; k++) {
        const code = codes[k]!;
        const list = map.get(code);
        if (list) {
          if (list.indexOf(i) < 0) list.push(i);
        } else {
          map.set(code, [i]);
        }
      }
    }
  }

  private persist(): void {
    if (!this.save) return;
    try {
      const data = this.serialize();
      if (Object.keys(data.kbm).length === 0 && Object.keys(data.gamepad).length === 0) this.save.remove(BINDINGS_SECTION);
      else this.save.write(BINDINGS_SECTION, data);
    } catch (err) {
      console.error('[input] enregistrement des touches impossible', err);
    }
  }

  /** Relit la sauvegarde ; tout ce qui est inconnu ou mal formé est ignoré sans bruit. */
  private load(): void {
    if (!this.save) return;
    let stored: unknown;
    try {
      stored = this.save.read<unknown>(BINDINGS_SECTION, null);
    } catch (err) {
      console.error('[input] lecture des touches enregistrées impossible', err);
      return;
    }
    if (!stored || typeof stored !== 'object') return;
    const data = stored as Partial<StoredBindings>;
    if (data.v !== BINDINGS_VERSION) return;
    for (const d of ['kbm', 'gamepad'] as const) {
      const section = data[d];
      if (!section || typeof section !== 'object') continue;
      for (const key of Object.keys(section)) {
        const i = actionIndex(key);
        const codes = (section as Record<string, unknown>)[key];
        if (i < 0 || !Array.isArray(codes)) continue;
        const clean: string[] = [];
        for (const c of codes) {
          if (clean.length < MAX_SLOTS && isValidCode(d, c) && clean.indexOf(c) < 0) clean.push(c);
        }
        this.tables[d][i] = clean;
      }
    }
  }
}

function expand(table: Readonly<Table>): readonly (readonly string[])[] {
  const out: (readonly string[])[] = [];
  for (let i = 0; i < ACTION_COUNT; i++) out.push(table[ACTIONS[i]!] ?? EMPTY);
  return out;
}
