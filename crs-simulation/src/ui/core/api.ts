/* =====================================================================================
 * Interface — types publics du module (à importer en `import type` depuis les autres modules).
 *
 * Services publiés par le module d'interface :
 *   ctx.ui                                         UiApi du contrat (notify, subtitle, banner, open, close…)
 *   ctx.service<UiKit>(EXT.uiKit)                  boîte à outils (extensions.ts) : écrans, HUD, boutons, focus
 *   ctx.service<ObjectivesApi>(EXT.objectives)     objectifs affichés (extensions.ts)
 *   ctx.service<Widgets>('ui.widgets')             composants du jeu (curseur, sélecteur segmenté, interrupteur,
 *                                                  carte de choix, pastille, compteur, onglets, champ, confirmation)
 *   ctx.service<UiDebugApi>('ui.debug')            état de l'interface, pour les tests et les bancs d'essai
 *
 * Événements libres écoutés (ctx.events.emitAny) :
 *   'ui:loading'   UiLoadingEvent   progression réelle du chargement (écran « chargement »)
 *
 * Services facultatifs LUS par l'interface (aucun n'est requis ; formes tolérées décrites plus bas) :
 *   'missions'      catalogue et résultat des missions (MissionsLike)
 *   'roles.causes'  causes de manifestation (liste de CauseLike ou de chaînes)
 *   'world.map2d'   fond de carte 2D (Map2dLike ; fourni par le monde ou, à défaut, par src/ui/maps)
 *   'law.records'   dossier juridique de la session (src/gameplay/law/api.ts)
 *   'input.touch', 'input.labels', 'input.bindings', 'input.pointer' (src/input/api.ts)
 *   'launch'        paramètres d'URL (src/core/launch.ts), 'perf' (src/core/game.ts)
 *
 * Écrans enregistrés par ce module : 'menu_principal', 'parametres', 'pause', 'chargement',
 * 'debrief', 'credits'. Les touches d'interface ouvrent, s'ils sont enregistrés par leur module,
 * les écrans de la table HOTKEY_SCREENS.
 * ===================================================================================== */

import type {
  Button, DurationPreset, GameMode, PlayableRole, PolicePoste, PoliceRank, ScreenId, SessionConfig,
  ViolenceLevel, WeatherKind,
} from '@/core/contracts';

/** Événement libre de progression du chargement. */
export const UI_LOADING_EVENT = 'ui:loading';
export interface UiLoadingEvent {
  /** Avancement 0..1. */
  progress: number;
  /** Étape en cours, en français (« Chargement des rues… »). */
  label?: string;
}

/** Clé du service de diagnostic de l'interface. */
export const UI_DEBUG_SERVICE = 'ui.debug';
/** Clé du service des composants (classe Widgets), pour les écrans des autres modules. */
export const UI_WIDGETS_SERVICE = 'ui.widgets';
export type { Choice, DialogOptions, FieldHandle, SliderHandle, SliderOptions, TabDef, TabsHandle, ValueHandle, Widgets } from './components';

/**
 * Touches d'interface lues dans ctx.input (à chaque image) et écrans qu'elles ouvrent ou ferment.
 * Le premier identifiant ENREGISTRÉ de chaque liste est retenu ; si aucun ne l'est, la touche est sans effet.
 */
export const HOTKEY_SCREENS: Readonly<Record<'pause' | 'map' | 'tactical' | 'orders' | 'radio', readonly ScreenId[]>> = {
  pause: ['pause'],
  map: ['carte'],
  tactical: ['carte_tactique'],
  orders: ['ordres', 'roue_ordres'],
  radio: ['radio'],
};
export type HotkeyButton = keyof typeof HOTKEY_SCREENS & Button;

// ─────────────────────────────────────────────────────────────────────────────────────
// Scénario : ce que la page d'accueil écrit dans SessionConfig.extra
// ─────────────────────────────────────────────────────────────────────────────────────

/** Familles visuelles de la foule réglables sur la page d'accueil (BRIEF §1). */
export type CrowdFamily =
  | 'familles' | 'gilets_jaunes' | 'syndical' | 'etudiants' | 'climat' | 'soignants' | 'agriculteurs'
  | 'retraites' | 'black_bloc';

/** « Qui dérape » (docs/research/00-bible-realisme.md, F.1). */
export type Derapage = 'personne' | 'foule' | 'forces' | 'les_deux' | 'hasard';

export interface ScenarioMeans {
  /** Sections de 16 agents à pied. */
  sections: number;
  /** Fourgons (un par groupe de 6 en dotation normale). */
  fourgons: number;
  /** Blindés Centaure de la gendarmerie. */
  centaure: number;
  /** Engins lanceurs d'eau. */
  canon_eau: number;
  /** Groupes de BRAV-M (6 motos, 12 agents). */
  bravm: number;
  /** Drones de la préfecture (deux au plus par arrêté). */
  drone: number;
  /** Engins de sapeurs-pompiers et équipes du SAMU. */
  pompiers: number;
  samu: number;
  /** true : les secours ne sont pas sur place, on les demande par radio. */
  secours_sur_appel: boolean;
}

export interface ScenarioOptions {
  /** Sanctions actives : une bavure entraîne enquête et suites disciplinaires. */
  sanctions: boolean;
  /** Niveau de violence affiché (recopié de Settings.violence au lancement). */
  violence: ViolenceLevel;
  /** Circulation au départ autour du lieu. */
  circulation: 'ouverte' | 'coupee';
  /** Stations de métro au départ autour du lieu. */
  metro: 'ouvert' | 'ferme';
  /**
   * Journée de service (rôles de police) : prise de service à la caserne de la Cité, trajet en colonne vers la
   * manifestation, retour. false : les forces sont déjà en place près du rassemblement.
   */
  journee: boolean;
}

/**
 * Clés de SessionConfig.extra écrites par la page d'accueil. Tous les champs sont des valeurs JSON.
 * L'interface applique ELLE-MÊME, à la première image jouée, le vent (EnvApi.setWind), la coupure de
 * circulation (TrafficControlApi.closeArea, rayon SCENARIO_AREA_RADIUS) et la fermeture des stations
 * (MetroApi.setOpen, même rayon) quand ces services existent : les modules n'ont pas à relire ces clés.
 */
export interface ScenarioExtra {
  /** Marqueur : configuration produite par la page d'accueil (version du format). */
  scenario: 1;
  /** Poste tenu (forces de l'ordre) ; null pour les rôles civils. */
  poste: PolicePoste | null;
  /** Variante du rôle : profil du manifestant ('pacifique' | 'service_ordre' | 'radical'), service du secouriste ('pompier' | 'samu') ; '' sinon. */
  variante: string;
  /** Cause de la manifestation : identifiant et libellé français. */
  cause: string;
  causeLabel: string;
  /** Composition de la foule : part de chaque famille, somme = 1. */
  composition: Record<CrowdFamily, number>;
  /** Vent : direction d'où il vient (degrés, 0 = nord, 90 = est) et vitesse en km/h. */
  vent: { direction: number; vitesse: number };
  derapage: Derapage;
  moyens: ScenarioMeans;
  options: ScenarioOptions;
  /** Journée de service effective (option cochée, rôle et mode qui s'y prêtent) : lue par src/gameplay/session. */
  journee: boolean;
}

/** Rayon (m) autour du lieu pour « circulation coupée » et « stations fermées » au départ. */
export const SCENARIO_AREA_RADIUS = 350;

/** Section de la sauvegarde des scénarios enregistrés. */
export const SCENARIOS_SECTION = 'scenarios';

export interface SavedScenario {
  id: string;
  name: string;
  /** Date d'enregistrement (ms depuis l'époque Unix). */
  savedAt: number;
  config: SessionConfig;
}

/** Contenu de la section « scenarios » de ctx.save. */
export interface ScenariosFile {
  v: 1;
  /** Dernière configuration lancée (bouton « Continuer »). */
  last: SessionConfig | null;
  items: SavedScenario[];
}

// ─────────────────────────────────────────────────────────────────────────────────────
// Services facultatifs lus par l'interface (formes tolérées)
// ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Mission du catalogue telle que la page d'accueil sait la lire. Le service 'missions' peut être un
 * tableau, ou un objet dont `catalog`, `missions`, `all` ou `list` est un tableau (ou une fonction
 * qui en rend un). Synonymes acceptés : titre/name pour title, description/brief/resume pour summary,
 * lieu pour place, roles pour role, difficulte/stars pour difficulty, kind/categorie pour type.
 */
export interface MissionLike {
  id: string;
  title: string;
  /** Rôle(s) pour lesquels la mission est proposée ; vide = tous. */
  roles: PlayableRole[];
  type: string;
  /** Difficulté de 1 à 5 (0 = non renseignée). */
  difficulty: number;
  summary: string;
  place: string;
  /** Préréglages appliqués au scénario quand la mission est choisie. */
  config: Partial<SessionConfig>;
}

/**
 * Compte rendu de mission lu par l'écran « debrief » : valeur de `result`, `lastResult`, `report`
 * ou de `debrief()` du service 'missions'. Tous les champs sont facultatifs.
 */
export interface MissionResultLike {
  title?: string;
  success?: boolean;
  /** Note sur 100. */
  score?: number;
  /** Mention (« Très bien », « Insuffisant »…). */
  grade?: string;
  summary?: string;
  lines?: { label: string; value: string | number; delta?: number; note?: string }[];
}

/** Cause de manifestation fournie par 'roles.causes' (tableau, ou objet avec `list` / `causes`). */
export interface CauseLike {
  id: string;
  label: string;
}

/**
 * Fond de carte 2D lu dans le service 'world.map2d' pour le mini-plan de situation de la page
 * d'accueil — même contrat que Map2dService de src/ui/maps/api.ts : le point (centerX, centerZ) est
 * dessiné au centre de la zone, `metersPerPixel` mètres du monde par pixel du canevas, rotation 0 =
 * nord en haut. S'il est absent, l'interface dessine son propre plan d'après ctx.world.
 */
export interface Map2dLike {
  draw(
    g: CanvasRenderingContext2D, centerX: number, centerZ: number, metersPerPixel: number, rotation: number,
    options?: { width?: number; height?: number; pixelRatio?: number; labels?: boolean; detail?: 'plan' | 'mini' },
  ): void;
}

/** État de l'interface exposé aux tests ('ui.debug'). */
export interface UiDebugApi {
  /** Identifiants des écrans ouverts, du plus ancien au plus récent. */
  readonly stack: readonly ScreenId[];
  readonly hudVisible: boolean;
  /** Identifiants des éléments de HUD actuellement affichés. */
  hudWidgets(): string[];
  /** Notifications visibles (texte). */
  notices(): string[];
  /** Identifiant (data-id) ou texte de l'élément qui a le focus. */
  focused(): string;
}

/** Types repris tels quels pour la commodité des écrans. */
export type { DurationPreset, GameMode, PlayableRole, PolicePoste, PoliceRank, WeatherKind };
