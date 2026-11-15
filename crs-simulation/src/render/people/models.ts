/* Enregistrement unique des modèles d'objets tenus fournis par le module. */

import { ensureBuiltinModels } from './held';
import { registerPoliceModels } from './held_police';
import { registerProtestModels } from './held_protest';
import { registerMiscModels } from './held_misc';

export function ensureModels(): void {
  ensureBuiltinModels(() => {
    registerPoliceModels();
    registerProtestModels();
    registerMiscModels();
  });
}
