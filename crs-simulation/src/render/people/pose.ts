/* Calcul complet d'une pose : préparation, pose de base (posture + locomotion), animation du haut du
 * corps, regard. Fonction pure : mêmes entrées → même sortie, aucune allocation. */

import { basePose, postureAllowsUpper } from './gait';
import { applyLook, upperPose, upperPrepare } from './upper';
import { P_SIZE, U_CARRIED, type PoseInput } from './poseparams';

export function createPoseParams(): Float64Array {
  return new Float64Array(P_SIZE);
}

/** Remplit P (P_SIZE paramètres) pour l'entrée donnée. */
export function computePose(inp: PoseInput, P: Float64Array): void {
  upperPrepare(inp);
  basePose(inp, P);
  if (inp.upper === U_CARRIED) return;
  if (postureAllowsUpper(inp.posture)) {
    upperPose(inp, P);
    applyLook(inp, P);
  }
}
