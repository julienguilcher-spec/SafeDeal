/* Palais de Chaillot, aile de Passy : la barre courbe sud-ouest, miroir de l'aile de Paris par rapport à l'axe du
 * parvis (voir defs/palais_chaillot.ts). Quatre autres statues dorées au bord du parvis ; Apollon musagète sur son
 * pylône, face aux jardins. Origine = point d'ancrage de la carte ; le parvis est vers +x. */
import type { MonumentDef } from '../types';
import { CHAILLOT } from '../x-ponts-chaillot';
import { buildWing, buildWingFar } from './palais_chaillot';

export const def: MonumentDef = {
  key: 'palais_chaillot_passy',
  name: 'Palais de Chaillot — aile de Passy',
  radius: 112,
  height: CHAILLOT.parvisY + CHAILLOT.headH,
  build(site, quality) { return buildWing(site, quality, 'passy', 'palais_chaillot_passy'); },
  buildFar(site) { return buildWingFar(site, 'passy', 'palais_chaillot_passy'); },
};
