# Chantiers en cours — sauvegarde de travail NON intégré

Ce dossier ne fait pas partie du jeu : c'est une sauvegarde du travail des agents en cours, prise pour qu'un
redémarrage ou une perte de la machine de travail ne le fasse pas disparaître. Il sera supprimé quand chaque
chantier aura été intégré dans `crs-simulation/`, testé et publié.

| Fichier | Chantier | Base (commit) | État à la sauvegarde |
|---|---|---|---|
| `commissariats.patch` | Commissariats dessinés, envoi des unités | `2365d2b` | les 8 paquets sont faits ; intégration en cours depuis 10 h 30, puis test en joueur |
| `commandant-carte.patch` | Campagne du commandant sur la nouvelle carte (BRAV-M à l'interpellation, phrase de la nasse) | `761c04e` | relu et validé ; à intégrer après la version 19 |

Reprendre un chantier : `git worktree add --detach <dossier> <base>` puis, dans ce dossier,
`git apply --3way chantiers-en-cours/<chantier>.patch`.

`restes-a-faire.md` : la liste des défauts connus à traiter dans un dernier lot.

Autres fichiers : les plans (`plan-commissariats.md`, `design-commande.md`), les comptes rendus des paquets terminés
(`rapports-paquets-*.json`) et les deux scripts d'orchestration (`workflow-*.js`).

Déjà intégrés et retirés d'ici : l'accueil en quatre modes, les véhicules garés en bloc, les fins de trajet de colonne,
la refonte de la carte de commandement (son cahier des charges `design-commande.md` reste ici : le chantier des
commissariats s'y réfère).
