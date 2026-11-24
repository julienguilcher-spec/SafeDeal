/* =====================================================================================
 * RENDU DES COMMISSARIATS — API publique.
 *
 * Service publié : ctx.service<CommissariatsRenderApi>('render.commissariats') (dès provide()).
 *
 * Le module habille le VRAI bâtiment de chaque site de src/world/commissariats (aucune géométrie de bâtiment
 * ajoutée, aucun obstacle) :
 *   - sur la façade, un seul maillage fusionné par site : encadrement de porte 2,6 × 3,0 m au vitrage marqué
 *     « POLICE » (« GENDARMERIE » aux Célestins), deux potelets, enseigne 4,2 × 0,7 m, lanterne bleue allumée la
 *     nuit, drapeau tricolore sur sa hampe et plaque « RÉPUBLIQUE FRANÇAISE » (à la préfecture, dont le monument
 *     porte déjà son nom : lanterne et drapeau seulement) ;
 *   - au sol, un seul maillage fusionné par site : les places réservées peintes en jaune « POLICE » ;
 *   - de loin, UN maillage pour tous les sites (lanternes et drapeaux), un seul appel de dessin.
 * Deux matériaux sont partagés par tous les sites proches (façade, sol), un troisième par le maillage lointain.
 *
 * Ce que le module LIT (jamais écrit) : COMMISSARIATS ('@/world/commissariats'), ctx.world (relief, emprise),
 * le service facultatif 'world.view' (surélévation du sol dessiné), le service facultatif 'render.uniforms'
 * (niveau de nuit lissé ; à défaut ctx.env.state.daylight), ctx.session.config (mode, extra.commissariats), ctx.view.
 * Sans ctx.view (mode headless) il ne fait rien.
 * ===================================================================================== */

/** Clé du service. */
export const COMMISSARIATS_RENDER_KEY = 'render.commissariats';

export interface CommissariatsRenderStats {
  /** Sites connus. */
  sites: number;
  /** Sites dont l'habillage proche est construit (construction paresseuse à moins de 450 m). */
  built: number;
  /** Sites dont l'habillage proche (façade ou places) est affiché. */
  visible: number;
  /** Sites affichés par le maillage lointain. */
  farVisible: number;
  /** Appels de dessin du module à la dernière image (maillages affichés) et leurs triangles. */
  drawCalls: number;
  triangles: number;
}

export interface CommissariatsRenderApi {
  readonly stats: CommissariatsRenderStats;
  /**
   * Niveau de nuit imposé 0..1 (bancs d'essai) ; null (défaut) : celui du rendu de base, ou la lumière du jour
   * de l'environnement.
   */
  nightOverride: number | null;
}
