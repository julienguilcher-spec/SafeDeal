/* Radio — contrôle, mise en place, comptes rendus de situation, signes avant-coureurs. */

import { group } from './define';
import type { PhraseDef } from './define';

const prep = group('Contrôle et mise en place');
const sit = group('Compte rendu de situation');
const sig = group('Signes avant-coureurs');

export const PHRASES_MISE_EN_PLACE: readonly PhraseDef[] = [
  // ── contrôle et mise en place ──
  prep('radio_controle', {}, [
    'Contrôle radio.',
    'Essai radio, comment me recevez-vous ?',
    'Contrôle de la liaison avant mise en place, répondez.',
    'Vérification radio, je me présente sur le réseau.',
  ]),
  prep('radio_controle_reponse', { de: 'central', a: 'unite', canal: 'commandement', fin: 'termine' }, [
    'Fort et clair.',
    'Je vous reçois cinq sur cinq, liaison établie.',
    'Reçu fort et clair, vous êtes sur le réseau.',
    'Liaison correcte, je vous reçois bien.',
  ]),
  prep('stationnement', {}, [
    'Compagnie en zone de stationnement, secteur {lieu}. Effectif à pied : {effectif}, fourgons : {nombre}. Prêt.',
    'En place sur la zone de stationnement, secteur {lieu}. Effectif : {effectif}, véhicules : {nombre}. Disponible.',
    'Zone de stationnement atteinte, secteur {lieu}. Fourgons alignés, effectif : {effectif}. Dans l\'attente de la mission.',
    'Compagnie arrivée en zone d\'attente, secteur {lieu}. Véhicules : {nombre}. Prête à recevoir la mission.',
  ]),
  prep('mission_donnee', { de: 'central', a: 'unite', canal: 'commandement', fin: 'aucun' }, [
    'Mission : {mission}. Secteur {lieu}. Faites l\'aperçu.',
    'Je vous confie la mission suivante : {mission}, secteur {lieu}. Faites l\'aperçu.',
    'Pour vous : {mission}. Cadre : manifestation encadrée, secteur {lieu}. Faites l\'aperçu.',
    'Mission du commandement : {mission}, secteur {lieu}. Faites l\'aperçu.',
  ]),
  prep('mission_apercu', { a: 'central', canal: 'commandement', fin: 'termine' }, [
    'Aperçu.',
    'Aperçu, mission prise en compte : {mission}.',
    'Reçu et aperçu, j\'exécute : {mission}.',
  ]),
  prep('dispositif_en_place', {}, [
    'Dispositif en place, secteur {lieu}, face {direction}. Sections en ligne : {nombre}, véhicules en travers. Prêt.',
    'Barrage d\'interdiction en place, face {direction}, secteur {lieu}. Sections en ligne : {nombre}, le reste en réserve.',
    'Mise en place terminée, secteur {lieu}. Ligne tenue face {direction}, réserve derrière les véhicules.',
    'Dispositif installé face {direction}, secteur {lieu}. Boucliers en ligne, issues latérales gardées.',
  ]),
  prep('prise_position', {}, [
    'En position, secteur {lieu}, face {direction}.',
    'Position prise, secteur {lieu}. Je tiens face {direction}.',
    'En place secteur {lieu}, face {direction}. Prêt à recevoir.',
    'Position atteinte, secteur {lieu}. Ligne formée face {direction}.',
  ]),
  prep('mouvement', {}, [
    'En mouvement vers le secteur {lieu}. Déplacement {moyen}.',
    'Je quitte ma position et me porte sur le secteur {lieu}, {moyen}.',
    'Départ pour le secteur {lieu}. Déplacement {moyen}, arrivée dans quelques minutes.',
    'En route vers le secteur {lieu}, {moyen}.',
  ]),
  prep('arrivee_zone', {}, [
    'Arrivé sur le secteur {lieu}. Mise en place en cours.',
    'Sur zone, secteur {lieu}. Je reconnais les abords avant de me déployer.',
    'Arrivée effectuée, secteur {lieu}. Prise de dispositif en cours.',
  ]),
  prep('embarquement', {}, [
    'Embarquement en cours, destination : secteur {lieu}.',
    'Les groupes embarquent dans les véhicules, direction le secteur {lieu}.',
    'Embarquement terminé, nous partons vers le secteur {lieu}.',
  ]),
  prep('debarquement', {}, [
    'Débarquement en cours, secteur {lieu}, à {distance} mètres de la foule.',
    'Groupes à pied, secteur {lieu}. Mise en ordre avant le mouvement.',
    'Débarquement effectué, secteur {lieu}. Reformation de la ligne.',
    'Sections à terre, secteur {lieu}, à {distance} mètres de la foule. Formation en colonne.',
  ]),
  prep('ordre_tenir', { de: 'commandant', a: 'cible', canal: 'unite' }, [
    'Tenez le secteur {lieu}, face {direction}. Riposte directe seulement.',
    'Maintenez votre position, secteur {lieu}, face {direction}. Pas d\'initiative sans mon ordre.',
    'Vous tenez l\'angle, secteur {lieu}. Face {direction}, distance conservée avec la foule.',
    'Restez en place, secteur {lieu}. Ligne tenue face {direction}, attente de mes instructions.',
  ]),

  // ── compte rendu de situation : nature, volume, attitude ──
  sit('cortege_approche', {}, [
    'Tête de cortège à {distance} mètres, secteur {lieu}. Nature : {nature}. Volume : {nombre}. Attitude : {attitude}.',
    'Le cortège arrive, tête à {distance} mètres, secteur {lieu}. Nature : {nature}, volume : {nombre}, attitude : {attitude}.',
    'Contact visuel avec la tête de cortège, secteur {lieu}. Volume : {nombre}, nature : {nature}, attitude : {attitude}.',
    'Tête de cortège en vue à {distance} mètres. Volume : {nombre}. Attitude : {attitude}. Nature : {nature}.',
  ]),
  sit('foule_calme', {}, [
    'Foule calme, secteur {lieu}. Volume : {nombre}, service d\'ordre du cortège présent.',
    'Ambiance calme, secteur {lieu}. Volume : {nombre}, slogans et musique, aucun incident.',
    'Cortège paisible, secteur {lieu}. Volume : {nombre}, familles et poussettes dans les rangs.',
    'Attitude calme, secteur {lieu}. Volume : {nombre}, aucune dégradation constatée.',
  ]),
  sit('foule_croissante', {}, [
    'L\'affluence grossit, secteur {lieu}. Volume estimé : {nombre}.',
    'Arrivées continues par les rues adjacentes, secteur {lieu}. Volume : {nombre} et en hausse.',
    'La foule s\'épaissit, secteur {lieu}. Volume estimé : {nombre}, nouveaux groupes à chaque minute.',
    'Montée en puissance du rassemblement, secteur {lieu}. Volume : {nombre}.',
  ]),
  sit('foule_tendue', {}, [
    'Attitude tendue en tête, secteur {lieu}. Volume : {nombre}, premières invectives vers la ligne.',
    'La tension monte, secteur {lieu}. Volume : {nombre}, groupes compacts qui se rapprochent du barrage.',
    'Foule nerveuse, secteur {lieu}. Volume : {nombre}, poussées contre les barrières.',
    'Climat tendu, secteur {lieu}. Volume : {nombre}, slogans hostiles et pression sur la ligne.',
  ]),
  sit('foule_hostile', { prio: 2 }, [
    'Foule hostile, secteur {lieu}. Volume : {nombre}, groupes déterminés au contact de la ligne.',
    'Attitude hostile, secteur {lieu}. Volume : {nombre}, objets lancés depuis les rangs.',
    'Violence en tête de cortège, secteur {lieu}. Volume : {nombre}, la ligne est prise à partie.',
    'Situation hostile, secteur {lieu}. Volume : {nombre}, refus de reculer et jets sur les unités.',
  ]),
  sit('situation_ras', {}, [
    'Rien à signaler, secteur {lieu}. Situation calme.',
    'Néant, secteur {lieu}. Aucun incident, effectif au complet.',
    'Situation stable, secteur {lieu}. Rien de particulier à signaler.',
  ]),
  sit('situation_tendue', {}, [
    'Situation tendue, secteur {lieu}. Je reste en vigilance et je garde la réserve proche.',
    'Les esprits s\'échauffent, secteur {lieu}. Je maintiens la distance et je surveille la tête.',
    'Tension en hausse, secteur {lieu}. Ligne serrée, j\'attends vos instructions.',
  ]),
  sit('situation_degradee', { prio: 2 }, [
    'URGENT. Situation dégradée, secteur {lieu}. Violences en cours, je demande votre appui.',
    'URGENT. Ça dégénère, secteur {lieu}. Affrontements au contact, je tiens la ligne.',
    'URGENT. Perte de contrôle de la foule, secteur {lieu}. Je demande des instructions immédiates.',
  ]),
  sit('situation_apaisee', {}, [
    'Retour au calme, secteur {lieu}. Plus aucun jet, la foule s\'éloigne.',
    'La situation s\'apaise, secteur {lieu}. Les groupes violents se sont dispersés.',
    'Calme revenu, secteur {lieu}. Je maintiens le dispositif en attendant vos ordres.',
  ]),
  sit('cortege_arrete', {}, [
    'Cortège à l\'arrêt, secteur {lieu}. Tête immobilisée, volume : {nombre}.',
    'La tête de cortège marque l\'arrêt, secteur {lieu}. Prises de parole en cours, volume : {nombre}.',
    'Cortège stoppé face à la ligne, secteur {lieu}. Volume : {nombre}, négociation avec le service d\'ordre.',
  ]),

  // ── signes avant-coureurs ──
  sig('signe_changement_tenue', {}, [
    'Individus qui se changent à couvert, secteur {lieu}. Tenues sombres et sacs ouverts, groupe de {nombre} personnes.',
    'Changements de tenue repérés, secteur {lieu}. Une dizaine de personnes passent en noir, capuches relevées.',
    'Des personnes se vêtent de noir derrière un camion, secteur {lieu}. Effectif : {nombre}.',
    'Habillage en noir en cours, secteur {lieu}. Visages qui se couvrent, groupe de {nombre} personnes.',
  ]),
  sig('signe_bloc', { prio: 2 }, [
    'Un bloc se forme, secteur {lieu}. Banderole renforcée en tête, effectif : {nombre}.',
    'Groupe compact tout en noir en tête de cortège, secteur {lieu}. Effectif : {nombre}, parapluies fermés.',
    'Regroupement de tenues sombres, secteur {lieu}. Ils se serrent derrière la banderole, effectif : {nombre}.',
    'Formation d\'un bloc compact, secteur {lieu}. Effectif : {nombre}, ils s\'équipent de lunettes et de gants.',
  ]),
  sig('signe_depavage', { prio: 2 }, [
    'Chaussée dépavée, secteur {lieu}. Des projectiles sont constitués au sol.',
    'Des personnes arrachent des pavés, secteur {lieu}. Tas de projectiles en formation.',
    'Dépavage en cours, secteur {lieu}. Les débris sont ramassés dans des sacs.',
  ]),
  sig('signe_parapluies', {}, [
    'Parapluies ouverts en tête, secteur {lieu}. Ils masquent une action : bloc compact de {nombre} personnes.',
    'Mur de parapluies noirs déployé, secteur {lieu}. Impossible de voir ce qui se passe derrière.',
    'Parapluies déployés d\'un seul geste, secteur {lieu}. Une action se prépare à l\'abri des regards.',
  ]),
  sig('signe_visages_couverts', {}, [
    'Visages qui se couvrent, secteur {lieu}. Personnes masquées devant la banderole : {nombre}.',
    'Cagoules et masques enfilés, secteur {lieu}. Effectif concerné : {nombre}.',
    'Foulards remontés et lunettes posées, secteur {lieu}. Une partie de la tête de cortège se prépare.',
  ]),
  sig('signe_projectiles_reunis', { prio: 2 }, [
    'Réserve de projectiles constituée, secteur {lieu}. Bouteilles et pierres rassemblées derrière le premier rang.',
    'Stock de projectiles repéré, secteur {lieu}. Plusieurs sacs lourds posés à l\'arrière du bloc.',
    'Des projectiles sont passés de main en main, secteur {lieu}. Ils s\'apprêtent à lancer.',
  ]),
  sig('signe_fumigenes', {}, [
    'Fumigènes allumés en tête, secteur {lieu}. Fumée dense, visibilité réduite.',
    'Fumée colorée devant la banderole, secteur {lieu}. Je perds la vue sur la tête de cortège.',
    'Fumigènes en nombre, secteur {lieu}. Écran de fumée qui peut masquer une action.',
  ]),
  sig('signe_materiel_voie', {}, [
    'Mobilier tiré en travers de la voie, secteur {lieu}. Poubelles et barrières ramenées au milieu de la chaussée.',
    'Début de barricade, secteur {lieu}. Conteneurs renversés et barrières de chantier traînées en travers.',
    'Barrière de mobilier urbain en formation, secteur {lieu}. Matériaux : {objet}.',
  ]),
];
