/* Module « environnement » : heure, soleil et lune, météo, sol mouillé, vent.
 *
 * Branchement : ajouter `createSystems` à la racine de composition. Le système publie ctx.env
 * (EnvApi du contrat) et le service étendu ctx.service<EnvExtApi>('env.ext') dès provide(). */

import type { ModuleFactory } from '@/core/contracts';
import { EnvSystem } from './system';

export type { EnvExtApi, EnvSkyState, LightningStrike } from './api';
export { ENV_EXT_SERVICE, ENV_LIGHTNING_EVENT } from './api';
export { EnvSystem, ENV_ORDER, CLOCK_SCALE_BY_DURATION } from './system';
export { WEATHER_KINDS, WEATHER_PROFILES } from './weather';
export { SPRING_DATE, PARIS_LATITUDE_DEG, PARIS_LONGITUDE_DEG, computeSkyBodies, computeSunTimes } from './astro';

export const createSystems: ModuleFactory = () => [new EnvSystem()];
