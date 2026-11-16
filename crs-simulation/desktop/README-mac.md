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

## Si macOS dit « endommagé » ou « développeur non identifié »

Refaites l'étape 3 (la commande du Terminal). Autre solution : clic droit sur l'application > Ouvrir > Ouvrir.

## Pour les développeurs

```
cd crs-simulation && npm run build          # construit le jeu (dist/)
cd desktop && npm install && npm run dist:mac   # fabrique release/CRS-Simulation-mac-{arm64,x64}.zip
CRS_SMOKE=1 npx electron .                  # vérification automatique : lance une partie, capture, compte rendu
```
