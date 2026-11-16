/* =====================================================================================
 * Retour vidéo du drone — service publié par le sous-module d'interface src/ui/drone :
 *     ctx.service<DroneFeedApi>('ui.drone')
 * Les autres modules (actions rapides du HUD, carte tactique) l'importent en `import type` et
 * doivent fonctionner s'il est absent.
 * ===================================================================================== */

export const DRONE_FEED_SERVICE = 'ui.drone';

export interface DroneFeedApi {
  /** La fenêtre vidéo est demandée (elle peut être momentanément masquée par un écran). */
  readonly open: boolean;
  /** Fenêtre agrandie. */
  readonly large: boolean;
  /** Drone montré (identifiant de véhicule, 0 si aucun). */
  readonly droneId: number;
  /** Nombre de drones de police en état de transmettre en ce moment. */
  available(): number;
  /** Un drone est engagé dans la session (en vol, ou au sol avec son télépilote : relève de batterie). */
  engaged(): boolean;
  /** Ouvre le retour vidéo (d'un drone donné, sinon le dernier suivi ou le premier). Retourne false s'il n'y a aucun drone. */
  show(vehicleId?: number): boolean;
  /** Ouvre le retour vidéo du drone d'une unité (équipe du télépilote). */
  showSquad(squadId: number): boolean;
  hide(): void;
  /** Ouvre ou ferme. */
  toggle(): boolean;
  /** Drone suivant. */
  cycle(): void;
  /** Agrandit ou réduit la fenêtre. */
  setLarge(large: boolean): void;
}
