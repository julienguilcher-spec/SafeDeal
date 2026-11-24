/* Obstacles du palais de Chaillot, aile de Paris : pavillon de tête, barre courbe et pavillon de queue (volumes
 * pleins sur l'emprise réelle), socles des quatre statues dorées et pylône du groupe de bronze. Le parvis, entre les
 * deux ailes, reste entièrement libre. */
import type { MonumentCollider, MonumentSite } from '../types';
import { wingColliders } from '../x-ponts-chaillot';

export function colliders(site: MonumentSite): MonumentCollider[] {
  return wingColliders(site, 'paris');
}
