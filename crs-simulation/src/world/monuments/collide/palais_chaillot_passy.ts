/* Obstacles du palais de Chaillot, aile de Passy : miroir de l'aile de Paris (voir collide/palais_chaillot.ts). */
import type { MonumentCollider, MonumentSite } from '../types';
import { wingColliders } from '../x-ponts-chaillot';

export function colliders(site: MonumentSite): MonumentCollider[] {
  return wingColliders(site, 'passy');
}
