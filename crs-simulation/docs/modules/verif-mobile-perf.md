# Compte rendu — vérif:mobile-perf

> Généré automatiquement à partir du rapport de l'étape. Référence pour les développeurs suivants.


## Résumé

Recette indépendante, angle téléphone, manette et performances : le jeu assemblé se joue réellement au doigt et à la manette, et je n'ai trouvé aucun défaut bloquant. Trois défauts majeurs ressortent : la carte tactique est inaccessible à la manette, le chargement de la ville produit des gels de 0,1 à 1,6 s en déplacement, et le code branché a changé pendant la recette.

- **Téléphone 844×390 et tablette 1180×820** : accueil, lancement, joystick, zone de regard, boutons, carte tactique, compte rendu et retour à l'accueil fonctionnent au doigt, sans chevauchement. Le portrait est signalé. Sur tablette, le parcours s'arrête au menu de pause : le portrait et le compte rendu n'y ont pas été vérifiés.
- **Manette** : accueil, lancement, sticks, gâchettes, roue d'ordres et débranchement à chaud fonctionnent. Aucun bouton ni menu n'ouvre la carte tactique.
- **Performances en qualité « bas »** : environ 7 à 8 ms de JavaScript par image avec 280 personnes, 83 à 90 appels de dessin, 0,7 à 0,8 million de triangles. 30 images/s en moyenne sont plausibles sur un téléphone récent, mais pas une cadence régulière à cause des gels de chargement.
- **Mémoire** : pas de fuite du tas JavaScript ni des géométries. Les textures montent de 57 à 137 après dix quartiers et ne redescendent pas, mais restent stables aux revisites.
- **Explosion mémoire des tests** : elle vient de Chromium sans tête sous capture de la souris, pas du jeu. Une page vide sans code du jeu passe de 115 à 1 306 Mo en 30 s dans les mêmes conditions. C'est très probablement l'explication du Chromium tué à environ 6 Go que rapporte l'intégrateur.
- **Robustesse** : rechargement en cours de partie, sauvegarde corrompue (trois variantes), stockage indisponible, redimensionnement et perte du contexte WebGL passent. L'onglet masqué met bien en pause, mais la reprise après retour n'a pas pu être confirmée.

Je n'ai modifié aucun fichier du jeu ; seuls des scripts `tests/e2e/verif-tpm-*` et leurs captures ont été ajoutés.

## Mesures

Conditions : Chromium sans tête, WebGL logiciel (SwiftShader), machine partagée de 4 cœurs à charge 10 à 24. Étalon processeur : 2e7 racines carrées en 96 à 184 ms selon la charge. Qualité « bas », fenêtre 960×540, place de la Concorde, 600 manifestants demandés (défaut de l'accueil), soit 250 simulés et 273 à 298 personnes, 37 véhicules, après 3 minutes simulées.

**Temps JavaScript par image** (`game.frame(1/30)`, `gl.finish()` hors chronomètre)

| Situation | Médiane | Minimum | p90 | Maximum |
|---|---|---|---|---|
| Repos, 3e personne | 7,4 ms | 2,8 | 17,2 | 52 |
| Repos, 1re personne | 8,3 ms | 3,8 | 24,3 | 41 |
| En courant | 7,8 ms | 3,7 | 17,2 | 64 |
| Face à la foule (252 manifestants, 138 dessinés) | 7,1 ms | 2,5 | 17,6 | 43 |

- Au repos en 3e personne, la simulation prend 1,1 ms et la présentation 5,4 ms.
- En courant, 3 images sur 120 dépassent 33 ms.
- Pas de simulation seul : médiane 0,4 à 0,6 ms, p90 2,5 à 3,2 ms, pointes de 25 à 129 ms.

**Par système (médiane)** : `render.present` 3,7 à 4,3 ms ; `ui` 0,2 à 0,6 ; `people.locomotion` 0,2 à 0,3 ; `sim:crowd.control` 0,2 à 0,3 ; `render.people` 0,2 à 0,3 ; `sim:vehicles` 0,1 à 0,2 ; `render.base`, `render.vehicles`, `render.fx` 0,1. Pointes isolées : `sim:vehicles` 41 ms, `people.locomotion` 41 à 59 ms, `sim:crowd.control` 40 ms.

**Appels de dessin et triangles** (maximum sur quatre directions)

| Lieu | Appels | Triangles |
|---|---|---|
| Concorde | 90 | 706 000 à 741 000 |
| Concorde face à la foule | 83 | 790 000 |
| Palais de Justice | 85 | 469 000 |
| Trocadéro | 60 | 507 000 |
| République | 74 | 465 000 |
| Bastille | 59 | 337 000 |
| Arc de Triomphe | 43 | 451 000 |
| Opéra | 73 | 154 000 |

**Chargement**
- Session lancée par l'URL : 25,6 s en tout, dont 11,7 s de préparation (4 monuments en 2,1 s, ville en 7,5 s).
- Depuis « Lancer » : 13,4 s au téléphone, 14,4 s à la manette, 21 à 34 s quand la machine est saturée.
- Stabilisation après téléportation à froid : 41 à 99 images, 1,0 à 5,7 s de JavaScript cumulé.

**Gels** : détaillés dans le défaut « Gels de chargement ». Résumé : 15 images sur 360 au-dessus de 33 ms à 54 km/h, pire image 451 ms ; jusqu'à 1,6 s à l'arrivée près d'un monument.

**Mémoire** (dix lieux puis trois retours au même point)
- Géométries : 155 → 155 → 156 → 165.
- Textures : 57 → 137 → 137 → 137.
- Tas JavaScript après ramasse-miettes : 65,3 → 66,7 → 65,7 → 67,5 Mo.
- Chromium (rendu + graphique + navigateur) : 901 → 1 223 → 1 231 → 983 Mo, dont processus graphique 245 → 410 Mo.
- Ces chiffres de processus sont ceux du rendu logiciel et ne valent pas pour un vrai téléphone.

**Téléphone récent à 30 images/s en « bas » (estimation)**
- JavaScript : environ 7 à 8 ms par image ici, sur une machine que j'estime (hypothèse, non mesurée) deux à trois fois plus lente qu'un téléphone haut de gamme. Le budget de 33 ms est tenu avec une large marge.
- Rendu : moins de 100 appels de dessin, 0,7 à 0,8 million de triangles, tampon de 886×409 à densité 3. C'est à la portée d'un processeur graphique récent ; c'est plus tendu sur un appareil modeste.
- Conclusion : 30 images/s en moyenne sont plausibles sur un téléphone récent. La régularité ne l'est pas : il faut s'attendre à des gels de l'ordre de 0,1 à 0,5 s à chaque nouvelle tuile ou monument, estimés à partir des 0,1 à 1,6 s mesurés ici.
- Aucune mesure sur un vrai processeur graphique.

**Jeu construit** (ma construction de 05 h 45, hors du dépôt, en 3,2 s)
- 107 fichiers, 12,83 Mo.
- JavaScript : 3 316 021 octets, 1,07 Mo en gzip (3 230 117 octets dans le dist de l'intégrateur à 05 h 04).
- Données de carte : environ 9,5 Mo, 3,55 Mo en gzip, 98 tuiles, la plus grosse de 161 Ko.
- Total gzip : environ 4,6 Mo.

**Non mesuré ou non vérifié**
- Vrai processeur graphique, vrai téléphone, vraie manette, son.
- Onglet réellement masqué (boucle d'images arrêtée par le navigateur).
- Portrait et fin de partie sur tablette (passe interrompue par l'artefact de capture de la souris).
- « Recommencer » sans fuite : non rejoué.
