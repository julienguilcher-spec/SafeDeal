# Chantiers en cours — sauvegarde de travail NON intégré

Ce dossier ne fait pas partie du jeu : c'est une sauvegarde du travail des agents en cours, prise pour qu'un
redémarrage ou une perte de la machine de travail ne le fasse pas disparaître. Il sera supprimé quand chaque
chantier aura été intégré dans `crs-simulation/`, testé et publié.

État au 18 novembre, 14 h 55 (heure de Paris 15 h 55). Le jeu publié est la **version 20** (commit `66e72f6`).

## Correctifs et chantiers

| Fichier | Chantier | Base | État à la sauvegarde |
|---|---|---|---|
| `fusion-commissariats.patch` | Commissariats fusionnés avec la version actuelle (instantané de l'arbre de fusion) | `52e9d92` | conflits résolus, compile ; vérification croisée simulation + interface en cours, puis suite complète |
| `commissariats-delta-B.patch` | Dernières retouches du joueur critique des commissariats (3 fichiers) | à appliquer en `--3way` sur l'arbre de fusion, après la vérification croisée | à appliquer |
| `commissariats.patch`, `commissariats-delta-A.patch` | Le chantier des commissariats dans son espace d'origine (complet, base `2365d2b`) et ses seuls ajouts par rapport à « 2365d2b + refonte du commandement » | voir colonne 1 | TERMINÉ (paquets, intégration, test en joueur) ; sert de référence à la fusion |
| `colonne-tete-bloquee.patch` | Colonne arrêtée pour de bon derrière sa tête bloquée contre un mur ; réseau radio saturé ; point inaccessible sans message ; sirène | branche principale (`commandant-carte-2` y est intégré) | brouillon du chasseur, en cours |
| `commandant-mission.patch` | La partie du joueur : commandant en mode Missions spéciales, aucun ordre possible à l'arrivée, personne ne suit, BRAV-M immobile | branche principale (`commandant-carte-2` y est intégré) | brouillon du chasseur, en cours |
| `ordres-directs/` | Ordres directs sur le terrain, unités « avec moi », réactivité, fourgons cellulaires et circuit des interpellés | documents | diagnostic (3 rapports), 3 propositions, cahier des charges critiqué `design-ordres-directs.md` (16 paquets, 15 blocages), plan de réalisation `plan-ordres-directs.md` (avec l'addendum du coordinateur) ; réalisation lancée : paquet P1 en cours dans un arbre basé sur la branche principale |

## Reprendre

- Un correctif : `git worktree add --detach <dossier> <base>` puis, dans ce dossier,
  `git apply --3way chantiers-en-cours/<chantier>.patch`. 
- Les scripts d'orchestration (`workflow-*.js`) se relancent avec l'outil Workflow (`scriptPath`) et les mêmes
  arguments ; les chasseurs reprennent le brouillon trouvé dans leur arbre de travail.
- Ordre d'intégration prévu : `colonne-tete-bloquee` et `commandant-mission` (chacun : suite
  complète, scénarios navigateur, publication) → fusion des commissariats + `commissariats-delta-B` → réalisation des
  ordres directs et du circuit des interpellés sur la base fusionnée (cahier des charges
  `ordres-directs/design-ordres-directs.md` quand il sera écrit).

## Autres fichiers

- `restes-a-faire.md` : la liste des défauts connus à traiter dans un dernier lot.
- `design-commande.md` : cahier des charges de la carte de commandement (intégrée en version 18).
- `plan-commissariats.md`, `rapports-paquets-commissariats.json`, `rapport-integration-commissariats.json`,
  `critique-commissariats.json` : plan et comptes rendus du chantier des commissariats.

## Ce que le joueur a demandé le 18 novembre (à livrer)

> « Je suis arrivé sur une manifestation, c'était n'importe quoi. Je pouvais donner zéro ordre, ils ne suivaient pas.
> La BRAV-M, j'arrivais pas à leur donner d'ordre aussi, ils bougeaient pas. […] Pour l'escorte aussi, c'est encore un
> peu flou. J'interpelle des gens, mais je sais même pas où les mettre. Il n'y a même pas de wagon pénitentiaire. Il
> faut toujours qu'il y ait quelques wagons pour pouvoir mettre les interpellés qui les emmènent au commissariat. Mais
> surtout, c'était pas du tout assez réactif, on comprenait rien. Les CRS, ils me suivent, mais ils n'ont pas d'ordre.
> Il faut vraiment que tu simplifies ce process où je peux donner directement des ordres et ils y vont direct. »

Il jouait **commandant, en mode Missions spéciales**.

Déjà intégrés et retirés d'ici : l'accueil en quatre modes, les véhicules garés en bloc, les fins de trajet de colonne,
la refonte de la carte de commandement, la lisibilité de la carte, le premier tour de la campagne du commandant.
