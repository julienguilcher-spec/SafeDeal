# Chantiers en cours — sauvegarde de travail NON intégré

Ce dossier ne fait pas partie du jeu : c'est une sauvegarde du travail des agents en cours, prise pour qu'un
redémarrage ou une perte de la machine de travail ne le fasse pas disparaître. Il sera supprimé quand chaque
chantier aura été intégré dans `crs-simulation/`, testé et publié.

État au 24 novembre, 4 h 15 UTC (5 h 15 à Paris) : paquets P1–P23 écrits, recette de bout en bout (P16) rendue : le cas du joueur (commandant en mission cdt-01, arrivée en colonne, ordre direct) est corrigé ; suite complète verte (4190 verts, 0 rouge, 117 ignorés, dont 12 étapes de recette marquées « échec attendu »). Non publié : avec une grosse compagnie (missions cdt-02, 05, 14, 08) la colonne arrive étirée et « Suivez-moi » ne ramène pas tout le monde — pas mieux que la version 22 (comparaison dans `ordres-directs/missions/`). Dernière passe en cours : P24 (grande compagnie, colonne groupée) et P25 (fourgon cellulaire qui vient, BRAV-M qui vient). Le jeu publié est encore la **version 22** (commit `0e488cd`).

## Correctifs et chantiers

| Fichier | Chantier | Base | État à la sauvegarde |
|---|---|---|---|
| `ordres-directs.patch` | Réalisation des ordres directs (instantané de l'arbre de travail au 21 novembre ; il contient aussi les lots de la version 21 et les commissariats de la version 22) | `d24fffd` | faits : P1–P10, P12–P15 ; P17 partiel ; report des commissariats résolu et contre-vérifié. INTERROMPUS le 18 novembre à 21 h 30 UTC par la limite de dépense du compte, brouillons dans l'instantané : P11 (téléphone), P18 (colonnes : zéro régression + garantie d'arrivée), P19 (BRAV-M, fourgons cellulaires, tests périmés). Restent ensuite P16 (recette), l'intégration et le joueur critique. Livraison : le correctif final se calcule contre la branche principale, pas contre `d24fffd` |
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

## Ce que le joueur a demandé le 18 novembre (à livrer)

> « Je suis arrivé sur une manifestation, c'était n'importe quoi. Je pouvais donner zéro ordre, ils ne suivaient pas.
> La BRAV-M, j'arrivais pas à leur donner d'ordre aussi, ils bougeaient pas. […] Pour l'escorte aussi, c'est encore un
> peu flou. J'interpelle des gens, mais je sais même pas où les mettre. Il n'y a même pas de wagon pénitentiaire. Il
> faut toujours qu'il y ait quelques wagons pour pouvoir mettre les interpellés qui les emmènent au commissariat. Mais
> surtout, c'était pas du tout assez réactif, on comprenait rien. Les CRS, ils me suivent, mais ils n'ont pas d'ordre.
> Il faut vraiment que tu simplifies ce process où je peux donner directement des ordres et ils y vont direct. »

Il jouait **commandant, en mode Missions spéciales**.

Déjà intégrés et retirés d'ici : les commissariats dessinés (version 22), les trois lots de la version 21, l'accueil en quatre modes, les véhicules garés en bloc, les fins de trajet de colonne,
la refonte de la carte de commandement, la lisibilité de la carte, le premier tour de la campagne du commandant.
