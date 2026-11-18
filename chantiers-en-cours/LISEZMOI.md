# Chantiers en cours — sauvegarde de travail NON intégré

Ce dossier ne fait pas partie du jeu : c'est une sauvegarde du travail des agents en cours, prise pour qu'un
redémarrage ou une perte de la machine de travail ne le fasse pas disparaître. Il sera supprimé quand chaque
chantier aura été intégré dans `crs-simulation/`, testé et publié.

| Fichier | Chantier | Base (commit) | État à la sauvegarde |
|---|---|---|---|
| `modes.patch` | Accueil en quatre modes (Patrouille, Carrière, Missions spéciales, Mode libre) | `eeaec87` | 8 paquets faits, intégration en cours |
| `commande.patch` | Refonte de la carte de commandement et des ordres | `2365d2b` | 8 paquets sur 9 faits |
| `commissariats.patch` | Commissariats dessinés, envoi des unités | `2365d2b` | 5 paquets sur 8 faits (attend la refonte) |
| `bloc-gare.patch` | Véhicules garés en bloc qui doivent pouvoir sortir | `9087cc5` | brouillon de correction |
| `colonne-restes.patch` | Colonnes qui doivent arriver au point | `9087cc5` | brouillon de correction |

Reprendre un chantier : `git worktree add --detach <dossier> <base>` puis, dans ce dossier,
`git apply --3way chantiers-en-cours/<chantier>.patch`.

Autres fichiers : les plans (`plan-modes.md`, `plan-commissariats.md`, `design-commande.md`), les comptes rendus
des paquets terminés (`rapports-paquets-*.json`), les constats à corriger (`constats-*.md`) et les deux scripts
d'orchestration (`workflow-*.js`).
