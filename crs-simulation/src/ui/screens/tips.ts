/* =====================================================================================
 * Écran de chargement — conseils tirés de la doctrine (docs/research/00-bible-realisme.md et
 * 06-roles-jouables.md). Textes courts, exacts, sans parti pris.
 * ===================================================================================== */

import type { PlayableRole } from '@/core/contracts';

export interface Tip {
  text: string;
  /** Rôles concernés ; absent = tous. */
  roles?: readonly PlayableRole[];
}

const POLICE: readonly PlayableRole[] = ['crs', 'chef_groupe', 'commandant', 'commissaire', 'bravm', 'gendarme_centaure', 'operateur_canon_eau', 'telepilote', 'patrouille'];

export const TIPS: readonly Tip[] = [
  { text: 'Une manifestation est déclarée, jamais « autorisée » : un cortège calme n’est pas une cible.' },
  { text: 'Les sommations sont prononcées par l’autorité civile, porteuse de l’écharpe tricolore — jamais par le commandant de compagnie.', roles: POLICE },
  { text: 'Trois phrases, dans l’ordre : l’annonce, la première sommation, la dernière sommation. Aucune ne se saute.', roles: POLICE },
  { text: 'Le lanceur de balles de défense n’est pas un moyen de dispersion : il répond à des violences constatées, sur désignation.', roles: POLICE },
  { text: 'Le tir tendu de grenades est strictement interdit : le lanceur tire en cloche, et seulement sur ordre.', roles: POLICE },
  { text: 'La force doit être proportionnée au trouble, et cesser dès qu’il a cessé.', roles: POLICE },
  { text: 'Laissez toujours une issue libre : sommer une foule enfermée ne produit que des procédures nulles et de la colère.', roles: ['commissaire', 'commandant', 'chef_groupe'] },
  { text: 'Une grenade accompagne une manœuvre — un repli, une progression, une mise à distance. Lancée sans manœuvre, elle ne sert à rien.', roles: ['crs', 'chef_groupe', 'commandant'] },
  { text: 'La fin d’une charge se signale au sifflet. Continuer après le sifflet est une faute.', roles: ['crs', 'chef_groupe', 'commandant'] },
  { text: 'Une unité n’est jamais engagée à moins de deux sections. Tenir une ligne, c’est d’abord rester aligné avec ses voisins.', roles: ['crs', 'chef_groupe', 'commandant'] },
  { text: 'C’est le canon à eau qui éteint un feu de barricade, pas le Centaure. Un extincteur suffit pour une poubelle, pas pour un véhicule.', roles: POLICE },
  { text: 'Pompiers et SAMU n’entrent en zone dangereuse que sous protection : ouvrez-leur un itinéraire dégagé avant de les appeler.' },
  { text: 'Couper la circulation à temps protège les automobilistes : une rue ouverte où arrive un cortège devient vite un piège.', roles: ['commissaire', 'commandant', 'chef_groupe'] },
  { text: 'Fermer une station de métro tarit l’arrivée des manifestants à cet endroit… et la reporte sur les stations voisines.', roles: ['commissaire', 'commandant'] },
  { text: 'Le vent décide où va le gaz. Vérifiez la flèche du vent avant de lancer : un nuage rabattu aveugle vos propres lignes.', roles: POLICE },
  { text: 'Journalistes et observateurs circulent dans le dispositif. Toute entrave à la prise d’images est une faute lourde.', roles: POLICE },
  { text: 'Le Centaure dégage et pousse à la lame ; il ne charge jamais des personnes. La bonne salve est la plus petite.', roles: ['gendarme_centaure'] },
  { text: 'Canon à eau : jamais avant la dernière sommation, jamais à la tête, jamais à bout portant. Éteindre un feu est toujours permis.', roles: ['operateur_canon_eau'] },
  { text: 'Le drone voit, ne juge pas : pas de son, pas de reconnaissance des visages, pas d’intérieur des logements. Désignez sans erreur.', roles: ['telepilote'] },
  { text: 'BRAV-M : la moto amène, le passager intervient à pied. La moto n’est jamais une arme.', roles: ['bravm'] },
  { text: 'En patrouille, CENTRAL ne voit que ce que vous lui dites : arrivé sur place, évaluez, rendez compte, puis demandez les renforts dont vous avez besoin.', roles: ['patrouille'] },
  { text: 'BAC : en civil, on enfile le brassard « POLICE » avant d’intervenir. Deux-tons et gyrophare seulement en urgence.', roles: ['patrouille'] },
  { text: 'Triez avant de soigner : l’urgence absolue d’abord. Passez la main aux secours dès que cela dépasse le premier geste.', roles: ['street_medic', 'secouriste'] },
  { text: 'Une bonne image montre les deux camps. Au viseur, vous voyez mieux — et beaucoup moins autour de vous.', roles: ['journaliste'] },
  { text: 'Manifester est un droit. Après la dernière sommation, rester sur place devient un délit.', roles: ['manifestant'] },
  { text: 'Le service d’ordre protège le carré de tête et canalise le cortège : il n’attaque personne.', roles: ['manifestant'] },
  { text: 'Chaque interpellation vaut par sa fiche : le fait, l’heure, le lieu, la preuve. Sans fait constaté, elle sera classée.', roles: ['crs', 'chef_groupe', 'bravm'] },
  { text: 'Vos gestes sont filmés. Un usage aveugle de la force radicalise la foule pacifique et pèse sur le compte rendu.', roles: POLICE },
];

/** Conseils valables pour un rôle (ceux du rôle d'abord, puis les conseils généraux). */
export function tipsFor(role: PlayableRole | null): Tip[] {
  const own: Tip[] = [];
  const general: Tip[] = [];
  for (const t of TIPS) {
    if (!t.roles) general.push(t);
    else if (role && t.roles.indexOf(role) >= 0) (t.roles.length <= 3 ? own : general).push(t);
  }
  return own.concat(general);
}
