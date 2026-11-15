/* =====================================================================================
 * Catalogue des sons : une recette de synthèse et un profil de diffusion par SoundId.
 *
 * POUR AJOUTER UN SON :
 *   1. écrire une recette `(k: Kit) => durée` dans src/audio/recipes/ (voir kit.ts) ;
 *   2. l'inscrire ici avec `def(...)` : bus, priorité, niveau, distances ;
 *   3. s'il figure au contrat (SoundId), l'ajouter à CONTRACT_SOUND_IDS ;
 *   4. lancer `node tests/e2e/audio.mjs` : le son est rendu hors ligne, contrôlé et ajouté à la
 *      planche de spectrogrammes ; il apparaît aussi dans le banc d'essai harness/audio.html.
 * ===================================================================================== */

import type { SoundId } from '@/core/contracts';
import type { Recipe } from './kit';
import { PRIORITY_AMBIENT, PRIORITY_HIGH, PRIORITY_NORMAL, PRIORITY_VITAL } from './voicePool';
import * as A from './recipes/ambience';
import * as C from './recipes/crowd';
import * as H from './recipes/human';
import * as I from './recipes/impacts';
import * as O from './recipes/objects';
import * as R from './recipes/radio';
import * as U from './recipes/ui';
import * as V from './recipes/vehicles';
import * as W from './recipes/weapons';

/** Bus de mixage : effets du monde, interface, voix (radio, mégaphone), ambiances. */
export type BusId = 'sfx' | 'ui' | 'voice' | 'ambience';

export interface SoundDef {
  id: string;
  /** Libellé français (banc d'essai, débogage). */
  label: string;
  group: string;
  recipe: Recipe;
  bus: BusId;
  /** Priorité par défaut dans la réserve de voix (0..3). */
  priority: number;
  /** Niveau relatif (gain linéaire) appliqué à la sortie de la recette. */
  level: number;
  /** Atténuation avec la distance (m). */
  refDistance: number;
  maxDistance: number;
  rolloff: number;
  /** Son entretenu : tourne indéfiniment quand il est demandé en boucle. */
  sustained: boolean;
  /** Détonation : le son arrive après l'éclair (retard de propagation). */
  delayed: boolean;
  /** Nombre maximal d'exemplaires simultanés (anti-empilement). */
  maxInstances: number;
}

interface DefOpts {
  bus?: BusId;
  priority?: number;
  level?: number;
  /** [distance de référence, portée] en mètres. */
  dist?: readonly [number, number];
  rolloff?: number;
  sustained?: boolean;
  delayed?: boolean;
  max?: number;
}

const defs = new Map<string, SoundDef>();

function def(id: string, group: string, label: string, recipe: Recipe, o: DefOpts = {}): void {
  const dist = o.dist ?? [3, 60];
  defs.set(id, {
    id, label, group, recipe,
    bus: o.bus ?? 'sfx',
    priority: o.priority ?? PRIORITY_NORMAL,
    level: o.level ?? 1,
    refDistance: dist[0],
    maxDistance: dist[1],
    rolloff: o.rolloff ?? 1,
    sustained: o.sustained ?? false,
    delayed: o.delayed ?? false,
    maxInstances: o.max ?? 6,
  });
}

// ── armes, grenades, explosions ──
def('grenade_lancer', 'Armes et grenades', 'Lancer de grenade', W.grenadeLancer, { level: 0.85, dist: [2, 30], max: 4 });
def('grenade_pop', 'Armes et grenades', '« Pop » de grenade lacrymogène', W.grenadePop, { level: 0.75, dist: [4, 130], delayed: true });
def('gaz_sifflement', 'Armes et grenades', 'Sifflement du gaz', W.gazSifflement, { level: 0.5, dist: [2, 45], sustained: true, priority: PRIORITY_AMBIENT });
def('lanceur_tir', 'Armes et grenades', 'Lanceur de 56 mm', W.lanceurTir, { level: 0.85, dist: [6, 230], delayed: true, priority: PRIORITY_HIGH });
def('lbd_tir', 'Armes et grenades', 'LBD 40', W.lbdTir, { level: 0.8, dist: [6, 230], delayed: true, priority: PRIORITY_HIGH });
def('detonation', 'Armes et grenades', 'Détonation assourdissante', W.detonation, { level: 1, dist: [15, 700], delayed: true, priority: PRIORITY_HIGH, max: 4 });
def('desencerclement', 'Armes et grenades', 'Grenade de désencerclement', W.desencerclement, { level: 1, dist: [12, 600], delayed: true, priority: PRIORITY_HIGH, max: 4 });
def('tir_arme', 'Armes et grenades', 'Coup de feu', W.tirArme, { level: 1, dist: [12, 600], delayed: true, priority: PRIORITY_HIGH });
def('petard', 'Armes et grenades', 'Pétard', W.petard, { level: 0.85, dist: [8, 350], delayed: true });
def('mortier_tir', 'Armes et grenades', "Tir de mortier d'artifice", W.mortierTir, { level: 0.8, dist: [6, 250], delayed: true });
def('mortier_explosion', 'Armes et grenades', "Explosion de mortier d'artifice", W.mortierExplosion, { level: 1, dist: [14, 650], delayed: true, priority: PRIORITY_HIGH });
def('molotov', 'Armes et grenades', 'Cocktail Molotov', W.molotov, { level: 0.85, dist: [5, 140] });
def('embrasement', 'Armes et grenades', 'Embrasement (départ de feu)', W.embrasement, { level: 0.8, dist: [5, 120] });
def('explosion_vehicule', 'Armes et grenades', 'Explosion de véhicule', W.explosionVehicule, { level: 1, dist: [20, 900], delayed: true, priority: PRIORITY_HIGH, max: 3 });

// ── chocs et bris ──
def('verre_brise', 'Chocs et bris', 'Verre brisé', I.verreBrise, { level: 0.6, dist: [4, 120] });
def('impact_bouclier', 'Chocs et bris', 'Impact sur bouclier', I.impactBouclier, { level: 0.6, dist: [2.5, 50] });
def('impact_sol', 'Chocs et bris', 'Impact au sol', I.impactSol, { level: 0.6, dist: [2.5, 50] });
def('coup_baton', 'Chocs et bris', 'Coup de bâton', I.coupBaton, { level: 0.6, dist: [2, 35] });
def('tole', 'Chocs et bris', 'Tôle', I.tole, { level: 0.45, dist: [4, 110] });
def('rideau_fer', 'Chocs et bris', 'Rideau de fer', I.rideauFer, { level: 0.5, dist: [4, 90], max: 3 });
def('collision', 'Chocs et bris', 'Collision de véhicule', I.collision, { level: 0.9, dist: [6, 160], priority: PRIORITY_HIGH });

// ── corps ──
def('pas', 'Corps', 'Pas (sol dur)', H.pas, { level: 0.4, dist: [1.5, 28], priority: PRIORITY_AMBIENT, max: 10 });
def('pas_pave', 'Corps', 'Pas (pavés)', H.pasPave, { level: 0.4, dist: [1.5, 28], priority: PRIORITY_AMBIENT, max: 10 });
def('pas_gravier', 'Corps', 'Pas (gravier)', H.pasGravier, { level: 0.75, dist: [1.5, 28], priority: PRIORITY_AMBIENT, max: 10 });
def('pas_herbe', 'Corps', 'Pas (herbe)', H.pasHerbe, { level: 0.65, dist: [1.5, 22], priority: PRIORITY_AMBIENT, max: 10 });
def('pas_eau', 'Corps', 'Pas (sol détrempé)', H.pasEau, { level: 0.5, dist: [1.5, 28], priority: PRIORITY_AMBIENT, max: 10 });
def('toux', 'Corps', 'Toux', H.toux, { level: 1, dist: [2, 30], priority: PRIORITY_AMBIENT, max: 4 });
def('cri', 'Corps', 'Cri', H.cri, { level: 0.6, dist: [4, 90], max: 5 });
def('sifflet', 'Corps', 'Sifflet', H.sifflet, { level: 0.7, dist: [6, 200], max: 4 });
def('tambour', 'Corps', 'Tambour', H.tambour, { level: 0.8, dist: [6, 200] });
def('batucada', 'Corps', 'Batterie de cortège (2 mesures)', H.batucada, { level: 0.75, bus: 'ambience', dist: [8, 220], max: 2 });
def('acouphene', 'Corps', 'Acouphène', H.acouphene, { level: 1, bus: 'ui', priority: PRIORITY_VITAL, max: 1 });

// ── matériel ──
def('menottes', 'Matériel', 'Menottes', O.menottes, { level: 1, dist: [1.5, 15] });
def('spray', 'Matériel', 'Gazeuse', O.spray, { level: 0.5, dist: [1.5, 25], sustained: true });
def('extincteur', 'Matériel', 'Extincteur', O.extincteur, { level: 0.6, dist: [2.5, 45], sustained: true });
def('declencheur_photo', 'Matériel', 'Déclencheur photo', O.declencheurPhoto, { level: 0.75, dist: [1, 12], priority: PRIORITY_AMBIENT });
def('canon_eau', 'Matériel', 'Canon à eau', O.canonEau, { level: 0.8, dist: [6, 170], sustained: true, priority: PRIORITY_HIGH, max: 3 });

// ── véhicules ──
def('sirene_police', 'Véhicules', 'Sirène police (435/580 Hz)', V.sirenePolice, { level: 0.7, dist: [12, 450], sustained: true, priority: PRIORITY_HIGH });
def('sirene_pompiers', 'Véhicules', 'Sirène pompiers (435/488 Hz)', V.sirenePompiers, { level: 0.7, dist: [12, 450], sustained: true, priority: PRIORITY_HIGH });
def('sirene_samu', 'Véhicules', 'Sirène SAMU (435/651 Hz)', V.sireneSamu, { level: 0.7, dist: [12, 450], sustained: true, priority: PRIORITY_HIGH });
def('sirene_gendarmerie', 'Véhicules', 'Sirène gendarmerie (435/732 Hz)', V.sireneGendarmerie, { level: 0.7, dist: [12, 450], sustained: true, priority: PRIORITY_HIGH });
def('sirene_hurleur', 'Véhicules', 'Sirène, variante « hurleur »', V.sireneHurleur, { level: 0.65, dist: [12, 450], sustained: true, priority: PRIORITY_HIGH });
def('klaxon', 'Véhicules', 'Klaxon', V.klaxon, { level: 0.6, dist: [6, 220], sustained: true });
def('moteur', 'Véhicules', 'Moteur', V.moteur, { level: 0.55, dist: [4, 90], sustained: true });
def('drone', 'Véhicules', 'Drone', V.drone, { level: 0.5, dist: [4, 110], sustained: true });

// ── radio, mégaphone ──
def('radio_bip', 'Radio et mégaphone', 'Bip radio (ouverture)', R.radioBip, { level: 0.9, bus: 'voice', priority: PRIORITY_VITAL, dist: [2, 25] });
def('radio_fin', 'Radio et mégaphone', 'Bip radio (fin)', R.radioFin, { level: 0.9, bus: 'voice', priority: PRIORITY_VITAL, dist: [2, 25] });
def('radio_souffle', 'Radio et mégaphone', 'Souffle radio', R.radioSouffle, { level: 0.6, bus: 'voice', priority: PRIORITY_VITAL, sustained: true, dist: [2, 25], max: 2 });
def('megaphone', 'Radio et mégaphone', 'Voix de mégaphone', R.megaphone, { level: 0.9, bus: 'voice', priority: PRIORITY_HIGH, dist: [8, 260], max: 2 });
def('megaphone_clic', 'Radio et mégaphone', 'Mégaphone : mise en route', R.megaphoneClic, { level: 0.8, bus: 'voice', priority: PRIORITY_HIGH, dist: [8, 200] });
def('megaphone_fond', 'Radio et mégaphone', "Mégaphone : souffle d'ampli", R.megaphoneFond, { level: 0.7, bus: 'voice', priority: PRIORITY_HIGH, sustained: true, dist: [8, 200], max: 2 });

// ── foule ──
def('foule_calme', 'Foule', 'Foule calme (murmure)', C.fouleCalme, { level: 0.75, bus: 'ambience', priority: PRIORITY_HIGH, dist: [14, 190], rolloff: 0.7, sustained: true, max: 3 });
def('foule_slogans', 'Foule', 'Foule : slogans scandés', C.fouleSlogans, { level: 0.9, bus: 'ambience', priority: PRIORITY_HIGH, dist: [14, 230], rolloff: 0.7, max: 3 });
def('foule_huees', 'Foule', 'Foule : huées', C.fouleHuees, { level: 0.8, bus: 'ambience', priority: PRIORITY_HIGH, dist: [14, 210], rolloff: 0.7, sustained: true, max: 3 });
def('foule_panique', 'Foule', 'Foule : panique', C.foulePanique, { level: 0.8, bus: 'ambience', priority: PRIORITY_HIGH, dist: [14, 210], rolloff: 0.7, sustained: true, max: 3 });

// ── ambiances ──
def('feu', 'Ambiances', 'Feu qui crépite', A.feu, { level: 0.7, dist: [3, 75], sustained: true, max: 8 });
def('pluie', 'Ambiances', 'Pluie', A.pluie, { level: 0.6, bus: 'ambience', priority: PRIORITY_VITAL, sustained: true, max: 2 });
def('vent', 'Ambiances', 'Vent', A.vent, { level: 0.6, bus: 'ambience', priority: PRIORITY_VITAL, sustained: true, max: 2 });
def('ville', 'Ambiances', 'Ville (rumeur lointaine)', A.ville, { level: 0.55, bus: 'ambience', priority: PRIORITY_VITAL, sustained: true, max: 2 });
def('tonnerre', 'Ambiances', 'Tonnerre', A.tonnerre, { level: 0.8, bus: 'ambience', priority: PRIORITY_HIGH, dist: [50, 3000], max: 2 });

// ── interface ──
def('ui_clic', 'Interface', 'Clic', U.uiClic, { level: 0.7, bus: 'ui', priority: PRIORITY_VITAL });
def('ui_valide', 'Interface', 'Validation', U.uiValide, { level: 0.7, bus: 'ui', priority: PRIORITY_VITAL });
def('ui_alerte', 'Interface', 'Alerte', U.uiAlerte, { level: 0.7, bus: 'ui', priority: PRIORITY_VITAL });

/** Tous les SoundId nommés par le contrat (src/core/contracts.ts) — un test vérifie que la liste est à jour. */
export const CONTRACT_SOUND_IDS = [
  'pas', 'grenade_lancer', 'grenade_pop', 'gaz_sifflement', 'lanceur_tir', 'lbd_tir', 'detonation',
  'desencerclement', 'verre_brise', 'impact_bouclier', 'impact_sol', 'coup_baton', 'feu', 'explosion_vehicule',
  'mortier_tir', 'mortier_explosion', 'molotov', 'canon_eau', 'sirene_police', 'sirene_pompiers',
  'sirene_samu', 'klaxon', 'moteur', 'radio_bip', 'megaphone', 'foule_calme', 'foule_slogans',
  'foule_huees', 'foule_panique', 'toux', 'cri', 'menottes', 'spray', 'extincteur', 'tir_arme',
  'declencheur_photo', 'drone', 'pluie', 'vent', 'ville', 'sifflet', 'tambour', 'petard', 'tole',
  'rideau_fer', 'ui_clic', 'ui_valide', 'ui_alerte',
] as const satisfies readonly SoundId[];

/** Sons supplémentaires propres au module (variantes de pas, sirènes, habillages…). */
export const EXTRA_SOUND_IDS: readonly string[] = [...defs.keys()].filter(
  (id) => !(CONTRACT_SOUND_IDS as readonly string[]).includes(id),
);

/** Tous les identifiants connus, dans l'ordre du catalogue. */
export const ALL_SOUND_IDS: readonly string[] = [...defs.keys()];

export function soundDef(id: SoundId): SoundDef | undefined {
  return defs.get(id);
}

export function allSoundDefs(): readonly SoundDef[] {
  return [...defs.values()];
}
