/* Palais de Chaillot, aile de Paris (Carlu, Boileau et Azéma, 1937) : la barre courbe nord-est, son pavillon de
 * tête au bord du parvis des Droits-de-l'Homme et son pavillon de queue. Pierre claire, hautes baies entre pilastres
 * plats, toits-terrasses, attique à inscriptions en lettres d'or ; au bord du parvis, quatre des huit statues de
 * bronze doré ; devant le pavillon, face aux jardins, Hercule et le taureau sur son pylône.
 * Le modèle habille l'EMPRISE RÉELLE de l'aile (volumes découpés dans l'anneau de la carte) et suit le relief : le
 * niveau du parvis et le pied des murs sont lus dans site.groundAt. L'aile de Passy (palais_chaillot_passy) en est
 * le miroir ; la fontaine de Varsovie, en contrebas, est le repère supplémentaire « fontaine_varsovie ».
 * Origine = point d'ancrage de la carte ; +z vers les jardins et la Seine ; le parvis est vers −x. */
import type { QualityLevel } from '@/core/contracts';
import type { MonumentDef, MonumentSite } from '../types';
import { Builder, farMaterial, finishFar } from '../kit';
import { chaillotWing, chaillotWingFar, wingMatrix } from '../kit/x-ponts-chaillot';
import { CHAILLOT, wingPlan, wingPoint, type WingKey, type WingPlan } from '../x-ponts-chaillot';

/** Altitude du sol au point canonique (x, z) : relief du site, sinon pente moyenne du parvis vers les jardins. */
export function wingGround(site: MonumentSite, plan: WingPlan): (x: number, z: number) => number {
  return (x, z) => {
    if (site.groundAt) { const q = wingPoint(plan, x, z); const y = site.groundAt(q[0], q[1]); if (Number.isFinite(y)) return y; }
    return plan.parvisY - Math.max(0, z + 12) * 0.12;
  };
}

export function buildWing(site: MonumentSite, quality: QualityLevel, wing: WingKey, name: string) {
  const b = new Builder();
  const plan = wingPlan(site, wing);
  b.with(wingMatrix(plan), () => chaillotWing(b, plan, quality, wingGround(site, plan), wing === 'paris' ? 0 : 1));
  return b.build(name);
}

export function buildWingFar(site: MonumentSite, wing: WingKey, name: string) {
  const b = new Builder();
  const plan = wingPlan(site, wing);
  b.with(wingMatrix(plan), () => chaillotWingFar(b, plan, farMaterial(0xe2dac6), farMaterial(0xa9aaa4, 0.3)));
  return finishFar(b, name);
}

export const def: MonumentDef = {
  key: 'palais_chaillot',
  name: 'Palais de Chaillot — aile de Paris',
  radius: 112,
  height: CHAILLOT.parvisY + CHAILLOT.headH,
  build(site, quality) { return buildWing(site, quality, 'paris', 'palais_chaillot'); },
  buildFar(site) { return buildWingFar(site, 'paris', 'palais_chaillot'); },
};
