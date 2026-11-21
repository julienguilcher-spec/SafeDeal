/* =====================================================================================
 * Module des entrées — clavier/souris, manette, tactile, unifiés dans InputState.
 *
 * Branchement (racine de composition) :
 *     import { createSystems as input } from '@/input';
 *     game.addModule(input);
 * Le système (ordre INPUT) publie ctx.input et les services décrits dans api.ts :
 *     'input.touch', 'input.labels', 'input.bindings', 'input.script', 'input.pointer'.
 *
 * Lecture des fronts : pressed(b) / released(b) sont vrais pendant exactement UN pas de
 * simulation pour qui les lit dans update(), et pendant exactement UNE image pour qui les lit
 * dans frame() — voir edges.ts. lookX / lookY / wheel suivent la même règle (tout le mouvement
 * accumulé est rendu au premier pas de l'image, puis 0).
 * ===================================================================================== */

import type { ModuleFactory } from '@/core/contracts';
import { InputSystem } from './system';

export const createSystems: ModuleFactory = () => [new InputSystem()];

export { InputSystem } from './system';
export type { InputSystemOptions } from './system';
export {
  INPUT_BINDINGS_SERVICE, INPUT_LABELS_SERVICE, INPUT_POINTER_SERVICE, INPUT_SCRIPT_SERVICE, INPUT_TOUCH_SERVICE,
} from './api';
export type {
  InputBindingsApi, InputLabelsApi, InputPointerApi, InputScriptApi, InputTouchApi, KeyboardLayout, PadStyle,
  TouchItem, TouchLayout, TouchLayoutMode,
} from './api';
export type { BindDevice } from './bindings';
export type { AxisAction, BindAction } from './buttons';
