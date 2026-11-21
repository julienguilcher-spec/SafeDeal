/* =====================================================================================
 * COMMANDEMENT — point d'entrée de src/sim/police/command.
 *
 * Le système est déjà inclus dans la fabrique du module de police :
 *   import { createSystems as simPolice } from '@/sim/police';   // IA des unités + commandement
 * Pour composer soi-même (essais) : `new PoliceSystem()` puis `new CommandSystem()`, ou la fabrique
 * `createSystems` de ce fichier (commandement seul : il fonctionne sans le module de police, mais n'a
 * alors aucune unité à commander).
 *
 * Services publiés : 'police.command' (CommandApi), 'command.post' (CommandPost).
 * Types publics, événements, clés de configuration et conventions des ordres : './api'.
 * ===================================================================================== */

import type { GameSystem, ModuleFactory } from '@/core/contracts';
import { CommandSystem } from './system';

export * from './api';
export { CommandSystem } from './system';

/** Fabrique du commandement seul. */
export const createSystems: ModuleFactory = (): GameSystem[] => [new CommandSystem()];
