/* Obstacles de la fontaine de Varsovie (jardins du Trocadéro) : margelles des bassins, cascade, socles des groupes sculptés. */
import type { MonumentCollider, MonumentSite } from '../types';
import { varsovieColliders } from '../x-ponts-chaillot';

export function colliders(_site: MonumentSite): MonumentCollider[] {
  return varsovieColliders();
}
