# CRS Simulation — application pour Mac

## Installer (5 minutes)

1. Prenez le fichier qui correspond à votre Mac :
   - **CRS-Simulation-mac-arm64.zip** : Mac récent (puce Apple M1, M2, M3, M4 — tous les Mac depuis fin 2020) ;
   - **CRS-Simulation-mac-x64.zip** : ancien Mac à processeur Intel.
   (Menu  > « À propos de ce Mac » : la ligne « Puce » ou « Processeur » vous le dit.)
2. Double-cliquez sur le fichier .zip : « CRS Simulation » apparaît. Glissez-le dans le dossier **Applications**.
3. L'application n'est pas signée par Apple : macOS la bloque la première fois. Ouvrez l'application **Terminal**
   (Applications > Utilitaires > Terminal), collez cette ligne puis appuyez sur Entrée :

   ```
   xattr -cr "/Applications/CRS Simulation.app" && codesign --force --deep --sign - "/Applications/CRS Simulation.app"
   ```

   (Rien ne s'affiche : c'est normal. La commande retire la « quarantaine » du téléchargement et signe
   l'application pour votre Mac seulement.)
4. Lancez **CRS Simulation** depuis le Launchpad ou le dossier Applications.

## Jouer

- Plein écran : **Ctrl + Cmd + F** (ou menu Présentation > Plein écran).
- Manette : branchez-la (ou appairez-la en Bluetooth) avant de lancer le jeu.
- Tout fonctionne hors connexion : la carte de Paris est incluse.

## Jouer au clavier, sans souris (clavier français)

| Pour… | Touche |
| --- | --- |
| Avancer / reculer | **Z** ou **↑** / **S** ou **↓** (tenir « avancer » : petite foulée puis course) |
| Aller à gauche / à droite | **Q** / **D** |
| Tourner la tête | **←** / **→** (ou le trackpad) ; au volant, **←** / **→** dirigent le véhicule |
| Agir (monter à bord, interpeller, se ravitailler…) | **E** |
| Utiliser l'objet en main / viser | clic du trackpad / clic à deux doigts |
| Choisir un objet | **1** à **9** |
| Carte tactique (toutes les unités, ordres) | **Tab** |
| Radio (secours, renforts, demande de ravitaillement, demande de Centaure) | **T** |
| Roue d'ordres à son unité | **F**, puis un **chiffre** (affiché sur chaque secteur), ou les **flèches** puis **Entrée** |
| Accepter la proposition de l'adjoint | **P** (**Maj + P** : plus tard) |
| Retour vidéo du drone | **O** ; **Maj + O** : taille (petite, agrandie, plein écran) ; **Alt + O** : zoom ×1 à ×8 |
| Sirène deux tons / gyrophares | **R** / **B** |
| Pause | **Échap** |

**Carte tactique au clavier.** Les **flèches** déplacent le curseur, **Entrée** valide le point ; les **chiffres**
choisissent une section (**Maj** pour en ajouter une), **U** passe à l'unité suivante, **E** ouvre l'ordre rapide,
**L** va à la palette d'ordres, **Échap** revient à la carte.

**Faire suivre une unité.** Deux ordres : « Me suivre à pied » (l'unité vous suit en formation, elle court quand vous
courez) et « Me suivre en colonne (véhicules) » (elle remonte dans ses fourgons et suit votre véhicule).

**Barrer une rue, nasser.** Envoyez une unité sur une rue (ordre « Barrer la rue », ou simplement « Avancer » ou
« Tenir » sur la rue) : elle se déploie d'un mur à l'autre et plus personne ne passe, dans aucun sens — sauf la police,
les secours et vous. Sur la carte tactique, la touche **B** choisit « Passants : bloqués » ou « Passants : laissés
passer » (les manifestants et les véhicules restent bloqués dans les deux cas). Quand toutes les issues autour d'une
foule sont tenues, la radio annonce « Nasse fermée » ; la carte montre les issues encore ouvertes, l'aide « Fermer la
nasse » propose d'y envoyer vos unités libres, et **F** ouvre une issue filtrée pour évacuer. Une rue fermée à la
circulation est vidée de ses voitures : elles s'arrêtent à la barrière.

**Un véhicule vous bloque.** En véhicule, le deux-tons (**R**) le fait dégager, autobus compris. À pied, approchez-vous
et appuyez sur **E** : « Faire circuler ce véhicule ». S'il n'a pas de conducteur, donnez l'ordre « Dégager l'obstacle
(Centaure) » — l'adjoint vous le propose (**P**) après dix secondes de blocage — ou demandez le Centaure par la radio
(**T**) : il pousse le véhicule hors de la voie.

**Se ravitailler.** Quand il vous manque des grenades ou des munitions, une indication apparaît avec un repère sur
le fourgon le plus proche qui en a encore : allez à l'**arrière du fourgon**, appuyez sur **E** et restez sur place quatre secondes. Si la
réserve des fourgons est vide, la même touche (ou le menu Radio, **T**) envoie une « Demande de ravitaillement » :
la logistique complète les fourgons de la compagnie — et la soute du Centaure — quelques minutes plus tard.
Centaure : tubes vides, arrêtez l'engin, l'équipage recharge. Canon à eau : arrêtez-vous à moins de 45 m d'une
bouche d'incendie (repère), le plein se fait.

## Vos parties sont conservées

Carrière, historique des parties, scénarios et paramètres sont enregistrés automatiquement et retrouvés à chaque
lancement, même après avoir quitté l'application ou redémarré le Mac. Ils sont rangés dans
`~/Library/Application Support/CRS Simulation/` (avec une copie de secours, `sauvegarde.json`). Pour les mettre à
l'abri ou les copier sur un autre Mac : page d'accueil > **Historique** > « Exporter ma sauvegarde », puis
« Importer… » sur l'autre Mac.

## Si macOS dit « endommagé » ou « développeur non identifié »

Refaites l'étape 3 (la commande du Terminal). Autre solution : clic droit sur l'application > Ouvrir > Ouvrir.

## Pour les développeurs

```
cd crs-simulation && npm run build          # construit le jeu (dist/)
cd desktop && npm install && npm run dist:mac   # fabrique release/CRS-Simulation-mac-{arm64,x64}.zip
CRS_SMOKE=1 npx electron .                  # vérification automatique : lance une partie, capture, compte rendu
CRS_USER_DATA=/tmp/profil CRS_SMOKE_SAVE=ecrire npx electron .   # sauvegarde : écrit, joue une partie, quitte
CRS_USER_DATA=/tmp/profil CRS_SMOKE_SAVE=lire npx electron .     # relance : tout doit être retrouvé
CRS_USER_DATA=/tmp/profil CRS_SMOKE_SAVE=lire-sans-stockage npx electron .  # idem, localStorage vidé (copie de secours)
```
