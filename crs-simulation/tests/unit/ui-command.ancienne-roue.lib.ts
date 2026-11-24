// La roue d'ordres d'AVANT les ordres directs (version publiée 21, ui/command/orderWheel.ts), figée ici comme
// référence : chaque ancien réflexe « F puis N » / « F puis 8 puis N » doit garder son sens (ou donner « Avec moi »), et
// aucun ordre de l'ancienne roue ne doit devenir inatteignable (ui-command.wheel-numeros, ui-command.direct-logique).
import type { OrderType } from '@/core/contracts';

export interface OldSector {
  type: OrderType | 'secours' | 'plus' | 'pompiers' | 'samu';
  label: string;
  key: number;
}

/** Couronne « Plus… » d'avant. */
export const MORE_RING: readonly OldSector[] = [
  { type: 'repli', label: 'Se replier', key: 1 },
  { type: 'bond_offensif', label: 'Bond en avant', key: 2 },
  { type: 'charge', label: 'Charger', key: 3 },
  { type: 'disperser_gaz', label: 'Disperser au gaz', key: 4 },
  { type: 'tenir', label: 'Tenir sa position', key: 5 },
  { type: 'cesser', label: 'Arrêter l’action', key: 6 },
  { type: 'libre', label: 'Laisser agir seuls', key: 7 },
  { type: 'tortue', label: 'Se protéger (tortue)', key: 8 },
];

/** Couronne « Secours ici » d'avant (inchangée). */
export const RESCUE_RING: readonly OldSector[] = [
  { type: 'pompiers', label: 'Pompiers ici', key: 1 },
  { type: 'samu', label: 'SAMU ici', key: 2 },
];

/** Roue de ceux qui commandent, d'avant : huit secteurs. */
export const WHEEL: readonly OldSector[] = [
  { type: 'suivre_pied', label: 'Suivez-moi à pied', key: 1 },
  { type: 'avec_moi', label: 'Suivez-moi en véhicules', key: 2 },
  { type: 'avancer', label: 'Avancer jusqu’ici', key: 3 },
  { type: 'ligne', label: 'Tenir une ligne ici', key: 4 },
  { type: 'interpeller', label: 'Interpeller', key: 5 },
  { type: 'degager_obstacle', label: 'Pousser un véhicule', key: 6 },
  { type: 'secours', label: 'Secours ici', key: 7 },
  { type: 'plus', label: 'Plus…', key: 8 },
];

/** Roue d'un policier sans autorité, d'avant : 1, 2 et 7. */
export const FOLLOW_WHEEL: readonly OldSector[] = WHEEL.filter((w) => w.key === 1 || w.key === 2 || w.key === 7);
