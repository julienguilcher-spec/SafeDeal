/* =====================================================================================
 * Écrans du module d'interface : enregistrement auprès du gestionnaire d'écrans.
 *   menu_principal  page d'accueil (réglage complet du scénario)
 *   parametres      graphismes, commandes, touches, son, jeu, sauvegarde
 *   pause           menu de pause en jeu
 *   chargement      progression et conseils
 *   debrief         compte rendu d'opération
 *   credits         crédits et attribution cartographique
 *   carriere        progression de carrière — seulement si le service 'career' est branché
 * ===================================================================================== */

import type { UiEnv } from '../core/kit';
import { createCareerScreen } from './career';
import { createCredits } from './credits';
import { createDebrief } from './debrief';
import { createHome } from './home';
import { readCareer } from './home-career';
import { createLoading } from './loading';
import { createPause } from './pause';
import { createSettingsScreen } from './settings';

export function registerScreens(env: UiEnv): void {
  const { kit } = env;
  kit.registerScreen('menu_principal', createHome(env), { modal: true, pauses: false, hidesHud: true });
  kit.registerScreen('parametres', createSettingsScreen(env), { modal: true, pauses: true, hidesHud: false });
  kit.registerScreen('pause', createPause(env), { modal: true, pauses: true, hidesHud: false });
  kit.registerScreen('chargement', createLoading(env), { modal: true, pauses: false, hidesHud: true });
  kit.registerScreen('debrief', createDebrief(env), { modal: true, pauses: false, hidesHud: true });
  kit.registerScreen('credits', createCredits(env), { modal: true, pauses: true, hidesHud: false });
  // le module de carrière publie son service avant l'interface (ordre RULES < UI) : sans lui, pas d'écran,
  // et la page d'accueil annonce que le suivi de carrière n'est pas installé
  if (readCareer(env.ctx)) kit.registerScreen('carriere', createCareerScreen(env), { modal: true, pauses: true, hidesHud: false });
}
