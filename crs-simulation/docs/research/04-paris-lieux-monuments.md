# 04 — Paris : lieux de manifestation, sites sensibles, monuments, Seine, relief, quartiers, bases

> Dossier documentaire pour le monde ouvert (emprise du BRIEF : longitude 2.2850 → 2.3725, latitude 48.8500 → 48.8780).
> Recherche effectuée le 15 novembre 2026 : 23 recherches web, une centaine de pages exploitées (Wikipédia en texte brut, arrêtés préfectoraux en PDF),
> et **trois jeux de données primaires interrogés directement** : open data de la Ville de Paris (largeur et longueur officielles de chaque voie),
> altimétrie IGN (RGE ALTI, altitudes mesurées point par point) et OpenStreetMap (emprises au sol, dont l'orientation et les dimensions ont été calculées par rectangle englobant minimal).
> Niveau gameplay uniquement. Aucune personne réelle n'est proposée comme personnage ; les événements réels cités ne servent qu'à localiser les points de friction.

## 0. Mode d'emploi

### 0.1 Légende de fiabilité

| Marque | Signification |
|---|---|
| **[V Sx]** | **Vérifié** : valeur lue dans la source numéro `Sx` (section 8). Les sources S1 (Ville de Paris), S2 (IGN), S3 (OpenStreetMap), S4 et S5 (arrêtés de la Préfecture de police) sont primaires. |
| **[P Sx]** | **Partiel** : source secondaire (presse, annuaire, Wikipédia non recoupée, résumé de moteur de recherche) ou sources qui se contredisent. Utilisable, à recouper. |
| **[E]** | **Estimation de modélisation** du documentaliste, non sourcée, cohérente avec les photos publiques et les emprises OSM. À ajuster à l'œil. |
| **[NT]** | **Non trouvé**. Une valeur [E] est proposée à côté quand le jeu a besoin d'un nombre. |

**Toutes les couleurs hexadécimales sont des [E]** (aucune source ne publie de code couleur). Dimensions en mètres, altitudes en mètres NGF (IGN69).

### 0.2 Conventions géométriques (rappel du BRIEF, plus une formule utile)

| Donnée | Valeur |
|---|---|
| Origine du monde | obélisque de la Concorde, lat0 = 48.865633, lon0 = 2.321236 |
| Projection | `x = (lon − lon0) × 73305` (est) ; `z = −(lat − lat0) × 111214` (sud) |
| Emprise en coordonnées jeu | x de **−2656** à **+3758** ; z de **−1375** (nord) à **+1739** (sud) → 6 414 m × 3 114 m |
| Azimut (colonne des tableaux) | angle en degrés depuis le nord géographique, sens horaire (0 = nord, 90 = est, 180 = sud, 270 = ouest) |
| Conversion azimut → cap jeu | **`h = π − azimut`** (en radians), car `h = 0` regarde le sud (+z). Exemples : façade tournée vers le sud → h = 0 ; vers l'est → h = +π/2 ; vers l'ouest → h = −π/2 ; vers le nord → h = π |
| Axe historique (Louvre → Concorde → Étoile → La Défense) | azimut **295,3°** vers l'ouest / **115,3°** vers l'est (calculé entre l'obélisque et l'Arc de Triomphe [V S3]) ; soit h = −2,01 rad en montant les Champs-Élysées |
| Emprise au sol « L × l » | plus petit rectangle orienté contenant le polygone OSM du bâtiment [V S3] ; il inclut parfois des emmarchements ou des annexes (signalé) |

Attention : l'axe du **Louvre** (Cour Carrée, cour Napoléon, pyramide) est décalé de **6,3°** par rapport à l'axe Tuileries–Champs-Élysées [V S15] : azimut ≈ 109–111° au lieu de 115–116°. L'arc du Carrousel, lui, est aligné sur l'axe des Tuileries.

### 0.3 Rappels de contenu

- Les noms de rues, places, monuments et institutions sont réels (autorisé par le BRIEF). Les enseignes commerciales, hôtels et marques cités dans les sources **ne doivent pas apparaître** : les bâtiments restent (« grand hôtel de la place », « brasserie des Champs »…), les noms sont fictifs.
- Les mouvements réels cités (dates de 2016, 2018, 2019, 2023, 2026) ne servent qu'à documenter **où** et **comment** la situation dégénère. Dans le jeu : mouvements fictifs.

---

## 1. Lieux et parcours de manifestation

### 1.1 Places de rassemblement dans l'emprise

Le parcours syndical historique relie les places de la République, de la Bastille et de la Nation, « toujours le même depuis les années 1930 » selon la presse locale [P S7] ; la place de la Nation (lon 2.3959) est **hors emprise**, à 1,7 km à l'est de la limite.

| Lieu | lat ; lon | x ; z (jeu, m) | Dimensions (m) | Alt. sol IGN (m) [V S2] | Débouchés (largeur officielle en m [V S1]) | État / remarque |
|---|---|---|---|---|---|---|
| Place de la République | 48.86750 ; 2.36384 | 3123 ; -208 | 283 × 119 [V S1] ; 3,4 ha [V S31] | 37,0 | bd Saint-Martin (33), bd de Magenta (30), rue du Fbg-du-Temple (20), av. de la République (30), bd Voltaire (30), bd du Temple (36,5), rue du Temple (20) | Réaménagée (avant 2011, 60 % de la place était routière) : esplanade piétonne majoritaire, bassin au pied du monument depuis 2013 [V S31][V S30] |
| Place de la Bastille | 48.85309 ; 2.36956 | 3542 ; 1395 | 215 × 150 [V S1] | ≈ 36–39 | rue Saint-Antoine (21,5), bd Beaumarchais (35), bd Richard-Lenoir (60), rue de la Roquette, rue du Fbg-Saint-Antoine (17), rue de Lyon (30), bd de la Bastille (31), bd Bourdon (30,75), bd Henri-IV (30) | Réaménagée (piétonnisation partielle, visible en 2021) : la colonne est reliée au sud au port de l'Arsenal [V S32] |
| Place de la Concorde | 48.86550 ; 2.32110 | -10 ; 15 | 360 × 210 [V S1] ; 7,56 ha [V S12] (8,64 ha selon paris.fr cité par [S11]) | 32,8 | rue Royale (22), rue de Rivoli (20,8), av. des Champs-Élysées (70), cours la Reine (74), pont de la Concorde (36), quai des Tuileries (26), av. Gabriel (15) | Projet de « place-jardin » attribué le 27 mars 2025 (pelouses, réouverture des fossés) ; avancement en 2026 : [NT] [V S12] |
| Place Charles-de-Gaulle (Étoile) | 48.87378 ; 2.29504 | -1920 ; -906 | cercle Ø 241 m ; ≈ 4,55 ha [V S11] | 58,6 | 12 avenues : Champs-Élysées (70), Friedland (40), Hoche (36), Wagram (36), Mac-Mahon (36), Carnot (40), Grande-Armée (70), Foch (120), Victor-Hugo (36), Kléber (36), Iéna (36), Marceau (40) | Anneau routier pavé ; accès piéton à l'Arc par souterrain (passage du Souvenir) |
| Place de l'Opéra | 48.87070 ; 2.33230 | 811 ; -564 | 140 × 60 [V S1] | 36,0 | bd des Capucines (35,4), av. de l'Opéra (30), rue Auber (22), rue Halévy, rue de la Paix (22,5), rue du Quatre-Septembre (20) | Carrefour à forte circulation, îlots et bouches de métro au centre |
| Place de la Madeleine | 48.87010 ; 2.32450 | 239 ; -497 | 218 × 128 [V S1] | 35,3 | rue Royale (22), bd de la Madeleine (43,3), bd Malesherbes (46), rue Tronchet (28,6) | Anneau autour de l'église |
| Esplanade des Invalides | 48.86000 ; 2.31310 | -596 ; 626 | 487 × 275 [V S19] | 33,0 | pont Alexandre-III (40), quai d'Orsay (29), rue de l'Université, rue Saint-Dominique (10), rue de Grenelle (10), av. du Maréchal-Gallieni (axe central) | Pelouses + allées ; lieu de dispersion et de rassemblement statique fréquent [P S44] |
| Place Vauban (dôme des Invalides) | 48.85340 ; 2.31230 | -655 ; 1360 | demi-lune ≈ 130 × 70 [E] | 39,1 | av. de Breteuil (70), av. de Ségur (42), av. de Villars, av. de Tourville (34,5) | Arrivée d'un cortège place d'Italie → place Vauban le 2 octobre 2025 [P S43] |
| Place du Trocadéro-et-du-11-Novembre | 48.86300 ; 2.28720 | -2495 ; 293 | cercle Ø ≈ 180 m [E] | 61,3 | av. Kléber (36), av. du Président-Wilson (40), av. Raymond-Poincaré, av. Georges-Mandel, av. Paul-Doumer | Rond-point + statue équestre au centre |
| Parvis des Droits-de-l'Homme (Chaillot) | 48.86215 ; 2.28835 | -2411 ; 387 | ≈ 120 × 60 [E d'après S3] | 60,2 | place du Trocadéro au nord-ouest ; escaliers vers les jardins au sud-est | Esplanade piétonne dallée entre les deux ailes ; rassemblements statiques |
| Champ-de-Mars | 48.85584 ; 2.29823 | -1686 ; 1089 | emprise du parc 964 × 442 [V S3] ; 24,3 ha [V S25] ; pelouses centrales ≈ 780 × 110 [E] | 35,3 | quai Jacques-Chirac (37), av. de La Bourdonnais (25), av. de Suffren (25), place Joffre (450 × 70), av. Joseph-Bouvard (transversale) | Pelouses ; grands rassemblements statiques [V S25] |
| Place de l'Hôtel-de-Ville – esplanade de la Libération | 48.85670 ; 2.35140 | 2211 ; 993 | 155 × 82 [V S1] | 34,7 | rue de Rivoli (20,8), av. Victoria (30), quai de l'Hôtel-de-Ville (32), pont d'Arcole (20), rue du Renard (20) | Parvis piéton dallé |
| Place du Châtelet | 48.85740 ; 2.34720 | 1903 ; 916 | 79 × 40 [V S1] (entre les deux théâtres ≈ 100 × 70 [E]) | 36,2 | bd de Sébastopol (30), av. Victoria (30), quai de la Mégisserie (23,2), pont au Change (30), rue de Rivoli, rue Saint-Denis | Fontaine du Palmier au centre ; nœud RER/métro |
| Place Vendôme | 48.86747 ; 2.32944 | 601 ; -204 | 213 × 124 [V S13] | 33,3 | rue de la Paix (22,5), rue de Castiglione (22,5) | Place fermée, 2 accès seulement : nasse naturelle |
| Parvis Notre-Dame – place Jean-Paul-II | 48.85350 ; 2.34820 | 1977 ; 1349 | 135 × 100 [V S1] | 35,0 | rue de la Cité (20), Petit-Pont (20), pont au Double (20), rue d'Arcole | Parvis piéton ; réaménagement des abords en cours [P S40] |
| Place Saint-Michel | 48.85350 ; 2.34390 | 1661 ; 1349 | ≈ 70 × 50 [E] | 34,8 | bd Saint-Michel (30), pont Saint-Michel (30), quai des Grands-Augustins (16), rue Saint-André-des-Arts (15) | Fontaine Saint-Michel (14 × 9 m au sol [V S3]) |
| Rond-point des Champs-Élysées | 48.86900 ; 2.31010 | -816 ; -374 | cercle Ø ≈ 165 m [E] | 33,8 | Champs-Élysées (70), av. Montaigne (33), av. Matignon (40,6), av. Franklin-D.-Roosevelt (16,5) | Limite basse du tronçon commerçant ; 6 bassins-fontaines |
| Place de l'Alma | 48.86460 ; 2.30160 | -1439 ; 115 | 109 × 106 [V S1] | 33,0 | av. George-V (40), av. Montaigne (33), av. Marceau (40), av. du Président-Wilson (40), av. de New-York (27), pont de l'Alma (42) | Carrefour routier ; tunnel sous la place |
| Place Georges-Pompidou (piazza) | 48.86080 ; 2.35180 | 2240 ; 537 | 170 × 65 [V S1] | 36,0 | rue Saint-Martin (14,4), rue Rambuteau, rue Saint-Merri | Pente douce vers le Centre ; piétonne |
| Place des Vosges | 48.85560 ; 2.36550 | 3245 ; 1116 | 140 × 140 [V S1] | 36,0 | rue de Birague, rue des Francs-Bourgeois (9), rue du Pas-de-la-Mule | Square clos de grilles, arcades sur 4 côtés |

Capacité indicative [E] : compter 1,5 personne/m² pour une foule dense immobile et 0,5 personne/m² pour un cortège en marche. Exemples : République (≈ 20 000 m² piétons) ≈ 30 000 personnes serrées ; un boulevard de 35 m de large rempli sur 400 m (14 000 m²) ≈ 7 000 marcheurs ; les Champs-Élysées pleins sur toute la largeur (70 m × 1 910 m = 133 700 m²) ≈ 65 000 marcheurs ou 200 000 personnes serrées.

### 1.2 Parcours classiques, rue par rue (largeurs officielles [V S1])

**Parcours A — République → Bastille (→ Nation, hors emprise).** Itinéraire publié pour une manifestation de juin 2024 : boulevard du Temple, boulevard des Filles-du-Calvaire, boulevard Beaumarchais, place de la Bastille, puis rue de Lyon, avenue Daumesnil, boulevard Diderot, place de la Nation [V S6].

| Tronçon | Longueur (m) | Largeur façade à façade (m) | Azimut de marche | Remarques pour le jeu |
|---|---|---|---|---|
| Place de la République (départ, statue au centre) | 283 × 119 | — | — | formation du cortège sur l'esplanade ; carré de tête côté boulevard du Temple |
| Boulevard du Temple | 405 | 36,5 | ≈ 157° (sud-sud-est) | théâtres et cafés côté pair ; contre-allées plantées |
| Boulevard des Filles-du-Calvaire | 210 | 36,2 | ≈ 170° | débouché de la rue Oberkampf (est) et de la rue des Filles-du-Calvaire (ouest) |
| Boulevard Beaumarchais | 750 | 35,0 | ≈ 171° | nombreuses rues latérales étroites côté Marais (9 à 14 m) = échappatoires et points d'entrée de groupes mobiles |
| Place de la Bastille (arrivée ou passage) | 215 × 150 | — | — | colonne de Juillet ; opéra au sud-est ; **limite est de l'emprise à ≈ 250 m à l'est de la colonne** |
| **Total République → Bastille** | **≈ 1 365 + traversées ≈ 1 500** | 35–36,5 | | durée à 2 km/h (cortège dense) ≈ 45 min ; à 3 km/h ≈ 30 min [E] |
| Variante : boulevard Voltaire (République → Nation) | 2 850 dont ≈ 700 dans l'emprise | 30,0 | ≈ 130° | variante fréquente en 2023, sans passer par Bastille [P S8] |

**Parcours B — Opéra (ou Madeleine) → République par les Grands Boulevards.** Itinéraire de février 2023 : place de l'Opéra, boulevard des Capucines, boulevards Montmartre, Poissonnière, de Bonne-Nouvelle, Saint-Denis, Saint-Martin, place de la République, puis boulevard du Temple jusqu'à la Bastille [P S8].

| Tronçon (d'ouest en est) | Longueur (m) | Largeur (m) | Repères |
|---|---|---|---|
| (option) Boulevard de la Madeleine | 220 | 43,3 | part de la place de la Madeleine |
| Boulevard des Capucines | 440 | 35,4 | traverse la place de l'Opéra (140 × 60) |
| Boulevard des Italiens | 390 | 35,0 | carrefour Richelieu-Drouot à l'est (départ du boulevard Haussmann, 30 m) |
| Boulevard Montmartre | 215 | 35,0 | passages couverts de part et d'autre (galeries piétonnes de 3–4 m de large) |
| Boulevard Poissonnière | 351 | 35,0 | grand cinéma à façade Art déco |
| Boulevard de Bonne-Nouvelle | 347 | 35,0 | dénivelé entre chaussée et trottoir sur une partie du boulevard (ancien rempart) [E] |
| Boulevard Saint-Denis | 210 | 37,0 | **porte Saint-Denis** (arc de 24 × 7 m au sol [V S3]) ; carrefour Strasbourg–Sébastopol (30 m) |
| Boulevard Saint-Martin | 470 | 33,0 | **porte Saint-Martin** (18 × 5 m au sol [V S3]) ; trottoirs surélevés de 1 à 3 m, chaussée en tranchée [E] |
| **Total Opéra → République** | **≈ 2 200** | 33–37 | ≈ 1 h de marche en cortège [E] |
| **Total Madeleine → République → Bastille** | **≈ 4 150** | | parcours long, ≈ 2 h [E] |

**Parcours C — Bastille → République → Opéra → Madeleine → Concorde** (≈ 4,4 km, rue Royale : 282 m × 22 m). C'est le parcours central demandé par des organisateurs à l'automne 2026 et refusé par la Préfecture de police, qui a imposé des itinéraires en bordure de Paris ; le différend est allé jusqu'au Conseil d'État [P S62]. Utile comme mission « parcours contesté ».

**Parcours D — Invalides → place d'Italie (ou l'inverse).** Un cortège est allé de la place d'Italie à la **place Vauban** le 2 octobre 2025 [P S43] ; un défilé de 2023 est parti des Invalides vers la place d'Italie [P S43]. Le détail rue par rue n'a pas été retrouvé [NT]. **Seul le début est dans l'emprise** : esplanade des Invalides ou place Vauban → boulevard des Invalides (39 m de large, 1 245 m dont ≈ 780 m dans l'emprise, jusqu'à la latitude 48.8500, vers la rue Oudinot). Tout le reste (Montparnasse, Port-Royal, Gobelins, place d'Italie) est hors carte : le cortège « sort » par le bord sud.

**Parcours E — Rassemblements non déclarés du secteur Étoile / Champs-Élysées / Concorde.** Pas de parcours : convergence par les 12 avenues de l'Étoile, puis descente de l'avenue (1 910 m × 70 m [V S1] ; chaussée ≈ 30 m + deux trottoirs ≈ 20 m [P S67]). Secteur interdit aux cortèges revendicatifs depuis le 23 mars 2019 [V S4].

**Parcours F — Statiques.** Trocadéro (parvis), Champ-de-Mars, esplanade des Invalides, parvis de l'Hôtel de Ville, place du Châtelet, place Saint-Michel : rassemblements sans défilé, encadrés par un dispositif fixe.

### 1.3 Largeur officielle des voies utiles (open data Ville de Paris [V S1])

Sur les 1 503 voies renseignées dont le centre est dans l'emprise (1 674 voies au total), la largeur médiane est **12,0 m** (quart inférieur 9,7 m ; quart supérieur 15,0 m) : en dehors des grands axes, le jeu se passe dans des rues de 10 à 15 m.

| Catégorie | Voies (largeur en m, longueur en m) |
|---|---|
| Très grands axes (≥ 60 m) | av. Foch 120 (1 300) ; av. Winston-Churchill 90 (220) ; cours la Reine 74 (540) ; av. des Champs-Élysées 70 (1 910) ; av. de la Grande-Armée 70 (775) ; av. de Breteuil 70 (840) ; quai Branly 61 (270) ; bd Richard-Lenoir 60 (1 500, terre-plein central au-dessus du canal couvert) |
| Avenues de l'Étoile | Friedland 40 ; Marceau 40 ; Carnot 40 ; George-V 40 (730) ; Hoche 36 ; Wagram 36 ; Mac-Mahon 36 ; Kléber 36 (1 135) ; Iéna 36 (1 140) ; Victor-Hugo 36 |
| Grands Boulevards | Madeleine 43,3 ; Capucines 35,4 ; Italiens 35 ; Montmartre 35 ; Poissonnière 35 ; Bonne-Nouvelle 35 ; Saint-Denis 37 ; Saint-Martin 33 ; Temple 36,5 ; Filles-du-Calvaire 36,2 ; Beaumarchais 35 |
| Percées haussmanniennes (30 m) | bd de Sébastopol (1 332) ; bd Saint-Germain (3 150) ; bd Saint-Michel ; bd Voltaire ; av. de l'Opéra (698) ; bd Haussmann (2 530) ; bd de Magenta ; bd de Strasbourg ; av. de la République ; bd Henri-IV (714) ; rue de Lyon ; bd du Palais (220) ; av. Victoria ; bd Raspail ; rue Saint-Denis (partie large) |
| Autres axes | bd Malesherbes 46 ; av. de Ségur 42 ; av. Matignon 40,6 ; av. du Président-Wilson 40 ; bd des Invalides 39 ; quai Jacques-Chirac 37 ; av. Bosquet 36 ; av. Rapp 36 ; av. Duquesne 36 ; av. de Tourville 34,5 ; av. de La Motte-Picquet 34 ; av. Montaigne 33 (615) ; rue de la Roquette 33,4 ; av. de Marigny 32 ; bd de la Bastille 31 ; bd Bourdon 30,75 ; quai d'Orsay 29 ; rue Tronchet 28,6 ; av. de New-York 27 ; bd de La Tour-Maubourg 26 ; quai des Tuileries 26 ; av. de La Bourdonnais 25 ; av. de Suffren 25 |
| Rues de 20–24 m | rue de Sèvres 24 ; quai de la Mégisserie 23,2 ; rue Royale 22 (282) ; rue de la Paix 22,5 ; rue de Castiglione 22,5 ; rue de Rennes 22 ; rue Réaumur 22 ; rue Auber 22 ; rue Saint-Antoine 21,5 ; rue de Rivoli 20,8 (3 070) ; rue de Turbigo 20 ; rue La Fayette 20 ; rue du Quatre-Septembre 20 ; rue Étienne-Marcel 20 ; rue du Louvre 20 ; rue Beaubourg 20 ; rue du Renard 20 ; rue du Temple 20 ; rue du Faubourg-du-Temple 20 ; rue de Bretagne 20 ; rue du Bac 20 ; rue La Boétie 20 ; rue de la Cité 20 |
| Rues de 14–18 m | rue de Miromesnil 18 ; rue du Fbg-Saint-Antoine 17 ; av. Franklin-D.-Roosevelt 16,5 ; rue Montorgueil 16 ; av. Gabriel 15 ; rue des Archives 15 ; rue de Babylone 15 ; rue Saint-Honoré 14,6 ; rue du Faubourg-Saint-Honoré 14,5 ; rue Saint-Martin 14,4 ; rue Vieille-du-Temple 14 ; quai des Orfèvres 14 |
| Rues étroites (≤ 13 m) | rue de Turenne 13 ; rue Cler 13 ; rue de l'Élysée 12 ; rue du Cirque 12 ; rue de Seine 11,7 ; rue de Buci 11,5 ; rue Bonaparte 11 ; rue des Rosiers 11 ; rue Saint-Lazare 11 ; rue de l'Université 10,5 ; rue de Varenne 10,3 ; rue de Grenelle 10 ; rue Saint-Dominique 10 ; rue des Saussaies 10 ; rue de Ponthieu 9,75 ; rue des Francs-Bourgeois 9 |

Répartition type d'un boulevard de 35 m [E] : trottoir 7–8 m (arbres d'alignement à 2 m de la bordure, kiosques, bancs, bouches de métro) + chaussée 19–21 m (4 files, dont couloir bus et piste cyclable) + trottoir 7–8 m. Rue de 12 m [E] : trottoirs 1,8–2,5 m + chaussée 7–8 m (1 file + stationnement).

### 1.4 Points de friction documentés

| Lieu | Ce qui s'y est produit (source) | Mécanique de jeu suggérée |
|---|---|---|
| Place de l'Étoile et Arc de Triomphe | 1er décembre 2018 : vers 12 h 30, le dispositif recule et le monument est envahi, salles intérieures saccagées, monument tagué [P S60] ; coût de remise en état annoncé à 1,2 million d'euros [V S10]. Foule massée derrière chaque barrage des avenues (Friedland, Wagram…) [P S60] | 12 barrages radiaux à tenir avec un effectif limité ; si un barrage cède, l'Arc devient un objectif à reprendre ; pavés de la place = projectiles |
| Avenue Kléber, avenue Foch | 1er décembre 2018 : véhicules incendiés, banque et boutique de luxe caillassées, engin de chantier détourné [P S60] | carcasses en feu barrant la chaussée ; chantiers = source de projectiles et de barricades |
| Boulevard Haussmann | 1er décembre 2018 : agence bancaire incendiée [P S60] | incendie de rez-de-chaussée menaçant les étages : priorité pompiers, périmètre à tenir |
| Champs-Élysées (Étoile → Rond-point) | 16 mars 2019 : vitrines détruites, boutiques pillées, kiosques incendiés, brasserie de prestige saccagée, banque incendiée avec propagation aux étages avenue Franklin-D.-Roosevelt ; plus de 200 interpellations [P S61]. Interdiction du secteur dès le 23 mars 2019 [V S4] | pillage = bascule d'une partie de la foule en « opportunistes » ; kiosques (≈ 3 × 2 m [E]) inflammables |
| Pied de la tour Eiffel | 16 mars 2019 : un véhicule incendié [P S61] | incident isolé loin du dispositif principal |
| Place de la Concorde | 16 mars 2023 : rassemblement spontané de plus de 6 000 personnes, dégradations du chantier de la place, feux de poubelles, 292 interpellations ; 17 mars : 57 blessés parmi les forces de l'ordre, 61 interpellations [V S5] | place immense (7,5 ha) ouverte de tous côtés : dispersion longue ; le chantier fournit palissades et matériaux |
| Pont de la Concorde | Verrou classique vers l'Assemblée : fourgons en travers, manifestants tenus à ≈ 200 m (2016, 2019, 2023) [P S44] | barrage de pont : 36 m de large à tenir, eau des deux côtés, pas de contournement |
| Esplanade des Invalides | 16 juin 2020 : violences et dégradations de mobilier urbain à l'issue d'une manifestation [V S4] | fin de manifestation = moment critique ; grande pelouse où la foule s'étale |
| Châtelet-Les Halles | 19 mars 2023 : rassemblement « sauvage », 32 interpellations [V S5] | petits groupes très mobiles dans des rues de 10–20 m, pôle de transport sous la dalle |
| Cibles récurrentes | « mobilier urbain, véhicules et commerces, notamment de luxe ou symbolisant le capitalisme » ; agences bancaires et immobilières ; « lieux de pouvoir » (présidence, Intérieur, Assemblée) [V S5] | pondérer la probabilité de dégradation par type de façade : banque > luxe > immobilier > grande enseigne > petit commerce |

### 1.5 État réel des lieux en 2026 (à trancher : « Paris d'aujourd'hui » ou « Paris classique »)

| Lieu | État constaté | Source |
|---|---|---|
| Place de la République | Jusqu'au réaménagement, 60 % de la place était routière ; depuis 2013 grande esplanade piétonne, bassin circulaire d'environ 1 m de large au pied du monument | [V S31][V S30] |
| Place de la Bastille | Réaménagement avec piétonnisation partielle (photographié en avril 2021) : accès piéton à la colonne et au bassin de l'Arsenal | [V S32] |
| Place de la Concorde | Enceinte olympique temporaire en 2024 ; projet de « place-jardin » confié le 27 mars 2025 ; messe papale en plein air le 26 septembre 2026 ; état du chantier fin 2026 non trouvé | [V S12] |
| Pont d'Iéna | Indiqué « piétons et cyclistes » dans la fiche Wikipédia (2026) ; projet de piétonnisation évoqué | [P S35] |
| Centre Pompidou | **Fermé pour rénovation de 2025 à 2030** : bâtiment en chantier (palissades, échafaudages) | [V S33] |
| Grand Palais | Fermé en mars 2021, nef rouverte pour 2024, réouverture complète en 2025 | [V S23] |
| Notre-Dame | Rouverte les 7–8 décembre 2024 ; programme complémentaire 2026-2033 (sacristie, façade nord, rose ouest à partir de 2027) : échafaudages partiels probables | [V S18][P S40] |
| Tour Eiffel | Enceinte de sécurité (verre + grilles) depuis 2018 ; nouvelle campagne de peinture prévue vers 2030 | [P S49][V S9] |

> **Ce que le jeu doit reproduire — lieux et parcours**
> - Quatre missions de cortège « signature », aux distances réelles : **A** République → Bastille (1,5 km, boulevards de 35–36,5 m) ; **B** Opéra → République (2,2 km) ; **C** Bastille → Concorde (4,4 km, parcours long ou « contesté ») ; **D** Invalides → sortie sud par le boulevard des Invalides (0,8 km jouable).
> - Des missions statiques : Trocadéro, Champ-de-Mars, Invalides, Hôtel de Ville, Châtelet, Concorde (rassemblement spontané de soirée), Étoile (12 barrages).
> - Les largeurs officielles du tableau 1.3 pilotent le nombre d'agents nécessaires pour barrer une voie : compter 1 agent par 0,8–1 m en ligne serrée [E] → 36 à 45 agents pour un boulevard de 36 m, 12 pour une rue de 10 m, 70 à 90 pour les Champs-Élysées.
> - Les rues latérales étroites du Marais et du faubourg Saint-Honoré sont les entrées et sorties des groupes mobiles : le générateur de cortège doit les traiter comme des « portes ».
> - Durée : à l'allure d'un cortège (2–3 km/h), République → Bastille prend 30 à 45 min de temps réel ; la durée standard de 25 min du BRIEF correspond donc à un cortège légèrement accéléré (≈ 3,5 km/h) ou à un départ déjà engagé sur le boulevard du Temple.
> - Types de cibles par priorité (banque, luxe, immobilier, kiosque, abribus, chantier) conformes aux arrêtés cités.

---

## 2. Sites sensibles et périmètres protégés

### 2.1 Sites sensibles dans l'emprise

Le **Sénat (palais du Luxembourg)** est **hors emprise** : centre à lat 48.84856, lon 2.33711 (x = 1164 ; z = 1899), soit 160 m au sud de la limite ; emprise 150 × 119 m [V S3]. Il peut exister comme décor de bord de carte, pas comme objectif. L'ambassade de Russie et l'ambassade de Turquie (16e) sont également hors emprise [V S3], de même que le tribunal judiciaire (17e) [P].

| Site | Adresse / accès | lat ; lon | x ; z (jeu) | Emprise (m) | Dispositif habituel |
|---|---|---|---|---|---|
| Palais de l'Élysée (présidence de la République) | 55 rue du Faubourg-Saint-Honoré ; jardin et « grille du Coq » sur l'av. Gabriel | 48.87026 ; 2.31668 | -334 ; -515 | 121 × 106 (bâti) [V S3] | Rue du Fbg-Saint-Honoré (14,5 m) fermée à la circulation au droit du palais [P S47] ; barrières, guérites, gardes républicains ; rue de l'Élysée (12 m) et av. de Marigny (32 m) sous contrôle |
| Hôtel de Beauvau (ministère de l'Intérieur) | place Beauvau ; autres entrées 7 rue des Saussaies et rue Cambacérès [V S38] | 48.87192 ; 2.31721 | -295 ; -700 | îlot 152 × 139 [V S3] | Grilles gardées par un binôme garde républicain + policier [V S38] ; à 150 m de l'Élysée : même périmètre |
| Palais Bourbon (Assemblée nationale) | 126 rue de l'Université ; colonnade sur le quai d'Orsay | 48.86156 ; 2.31821 | -222 ; 453 | 192 × 132 [V S3] | Cortèges tenus à distance sur le pont de la Concorde (≈ 200 m), fourgons en travers [P S44] ; abords interdits lors des séances sensibles [V S5] |
| Hôtel de Lassay (présidence de l'Assemblée) | 128 rue de l'Université | 48.86216 ; 2.31730 | -289 ; 386 | 58 × 22 [V S3] | Inclus dans le périmètre du Palais Bourbon |
| Hôtel de Matignon (Premier ministre) | 57 rue de Varenne ; parc de 3 ha, entrée annexe 36 rue de Babylone [V S37] | 48.85442 ; 2.32069 | -40 ; 1247 | 74 × 62 (hôtel) [V S3] | Rue de Varenne très étroite (10,3 m [V S1]) : barrières et cars en bouchon aux deux extrémités ; portail monumental |
| Ministère de l'Europe et des Affaires étrangères | 37 quai d'Orsay | 48.86190 ; 2.31650 | -347 ; 415 | ≈ 110 × 60 [E] | Contigu au Palais Bourbon ; même bouclage |
| Hôtel de Brienne (ministre des Armées) | 14 rue Saint-Dominique | 48.85983 ; 2.31915 | -153 ; 645 | 108 × 56 [V S3] | Rue Saint-Dominique 10 m [V S1] |
| Ministère de l'Éducation nationale | 110 rue de Grenelle | 48.85709 ; 2.32115 | -6 ; 950 | 120 × 64 [V S3] | Rue de Grenelle 10 m [V S1] ; rassemblements catégoriels fréquents devant le porche [P] |
| Ministère de l'Agriculture | 78 rue de Varenne | 48.85475 ; 2.31847 | -203 ; 1210 | 113 × 46 [V S3] | Face à Matignon : même bouclage |
| Hôtel de Roquelaure (ministère de la Transition écologique) | 246 bd Saint-Germain | 48.85740 ; 2.32484 | 264 ; 915 | 77 × 58 [V S3] | Sur le boulevard (30 m) |
| Ministère de la Justice (hôtel de Bourvallais) | 13 place Vendôme | 48.86778 ; 2.32874 | 550 ; -239 | ≈ 60 × 40 [E] | Place fermée à 2 accès ; cité dans les secteurs interdits de janvier 2020 [P S48] |
| Ministère de la Culture | 3 rue de Valois (Palais-Royal) | 48.86360 ; 2.33770 | 1207 ; 226 | aile du Palais-Royal | — |
| Conseil d'État | place du Palais-Royal | 48.86319 ; 2.33703 | 1158 ; 272 | 91 × 72 [V S3] | Cité nommément dans l'arrêté de mars 2023 [V S5] |
| Conseil constitutionnel | 2 rue de Montpensier | 48.86396 ; 2.33658 | 1125 ; 186 | 63 × 24 [V S3] | Rassemblements lors des décisions sensibles : barriérage haut en avril 2023 [P] |
| Banque de France | 31 rue Croix-des-Petits-Champs | 48.86485 ; 2.33956 | 1343 ; 87 | 251 × 112 [V S3] | Îlot fermé, portes blindées |
| Préfecture de police | 1 bis rue de Lutèce / place Louis-Lépine (île de la Cité) | 48.85437 ; 2.34673 | 1869 ; 1253 | 128 × 96 [V S3] | Siège du commandement ; cour intérieure ; voir section 7 |
| Palais de Justice (cour d'appel, Cour de cassation) | 10 bd du Palais | 48.85575 ; 2.34436 | 1695 ; 1099 | 222 × 212 [V S3] | Grille dorée de la cour du Mai sur le bd du Palais (30 m) ; gendarmes en faction |
| Tribunal de commerce | 1 quai de la Corse | 48.85567 ; 2.34681 | 1875 ; 1108 | 72 × 59 [V S3] | — |
| Hôtel de Ville | place de l'Hôtel-de-Ville | 48.85643 ; 2.35253 | 2294 ; 1024 | 144 × 89 [V S3] | Parvis ouvert ; grilles aux portes |
| Ambassade des États-Unis | 2 av. Gabriel (angle Concorde / rue Boissy-d'Anglas) [V S39] | 48.86769 ; 2.32043 | -59 ; -229 | 83 × 81 [V S3] | Protection permanente renforcée citée par la Préfecture [V S4] ; barrières fixes, trottoir neutralisé, véhicules en faction |
| Ambassade du Royaume-Uni | 35 rue du Faubourg-Saint-Honoré | 48.86914 ; 2.31940 | -134 ; -390 | 52 × 35 [V S3] | Idem [V S4] |
| Ambassade d'Israël | 3 rue Rabelais | 48.87092 ; 2.31213 | -668 ; -589 | 37 × 29 [V S3] | Rue barrée en permanence [P] |
| Ambassade d'Allemagne | 13–15 av. Franklin-D.-Roosevelt | 48.86617 ; 2.30955 | -856 ; -60 | 65 × 31 [V S3] | — |
| Ambassade d'Espagne | 22 av. Marceau | 48.86655 ; 2.30042 | -1526 ; -102 | 91 × 58 [V S3] | — |
| Ambassade d'Iran | 4 av. d'Iéna | 48.86313 ; 2.29306 | -2066 ; 279 | 49 × 22 [V S3] | Rassemblements réguliers place d'Iéna [P] |
| Ambassade du Japon | 7 av. Hoche | 48.87733 ; 2.30412 | -1255 ; -1301 | point [V S3] | Bord nord de l'emprise |
| Ambassade d'Algérie | 50 rue de Lisbonne | 48.87771 ; 2.30973 | -844 ; -1344 | 37 × 34 [V S3] | Bord nord de l'emprise |
| Tour Eiffel (site clos) | Champ-de-Mars | 48.85830 ; 2.29448 | -1961 ; 816 | enceinte ≈ 300 × 200 [E] | Parois de verre pare-balles côté Seine et côté Champ-de-Mars, grilles métalliques sur les 2 autres côtés, entrées par points de contrôle (2018) ; hauteur 2,5 à 3 m selon les sources [P S49] |

### 2.2 Périmètres d'interdiction réels (textes exacts des arrêtés)

**Périmètre « Champs-Élysées – Élysée – Beauvau »** — arrêté n° 2020-00649 du préfet de police (21 août 2020) [V S4]. Sont interdits les cortèges, défilés et rassemblements visés, ainsi que « le port et le transport d'armes par nature et de tous objets susceptibles de constituer une arme », sur :

- l'« avenue des Champs-Elysées, dans sa partie comprise entre la place Charles-de-Gaulle incluse et le rond-point des Champs-Élysées-Marcel-Dassault, et sur les voies perpendiculaires sur une distance de 100 mètres à partir de cette portion de l'avenue » ;
- « un périmètre comprenant la présidence de la République et le ministère de l'intérieur et délimité par les voies suivantes, qui y sont incluses » : « Avenue Matignon » ; « Rue de Penthièvre, dans sa partie comprise entre l'avenue Matignon et la rue Roquépine » ; « Rue Roquépine » ; « Rue d'Anjou, à partir du boulevard Malesherbes, en direction de la rue du Faubourg Saint-Honoré » ; « Rue de la Ville l'Evêque, à partir du boulevard Malesherbes, en direction de la rue d'Anjou » ; « Rue Boissy d'Anglas » ; « Rue Royale » ; « Place de la Concorde, dans sa totalité » ; « Cours la Reine, dans sa partie comprise entre la place de la Concorde et l'avenue Franklin Delano Roosevelt » ; « Avenue Franklin Delano Roosevelt, dans sa partie comprise entre le Cours la Reine et le Rond-point des Champs-Elysées » ; « Rond-point des Champs-Elysées ».

Motifs écrits par la Préfecture (utilisables comme texte de briefing, reformulés) : le bas de l'avenue est proche de la présidence et des ambassades des États-Unis et du Royaume-Uni, dans un périmètre où « des mesures particulières et renforcées de sécurité sont assurées en permanence » ; ces voies « ne constituent pas […] des lieux appropriés pour accueillir des manifestations revendicatives » [V S4].

En coordonnées jeu, ce périmètre est approximativement le polygone x ∈ [−820 ; +140], z ∈ [−850 ; +160] (du Rond-point à la rue Royale, de la rue Roquépine au sud de la Concorde), plus le ruban des Champs-Élysées élargi de 100 m de chaque côté jusqu'à l'Étoile [E d'après S1 et S4].

**Grand périmètre « lieux de pouvoir »** — arrêté n° 2023-00274 (du lundi 20 mars 2023 18 h 00 au mercredi 22 mars 2023 06 h 00) [V S5]. Tous les rassemblements **non déclarés** y sont interdits, dans un secteur « comprenant notamment l'avenue de la Grande Armée, l'avenue des Champs-Elysées, la place de la Concorde, le jardin des Tuileries, la Présidence de la République, le ministère de l'Intérieur, le Conseil d'Etat, l'Assemblée nationale, le Premier ministère, le Champ-de-Mars, le Trocadéro, le secteur des Halles », délimité par les voies suivantes (incluses), dans l'ordre du texte :

Place Charles de Gaulle → Rue de Tilsitt → Avenue de Friedland → Boulevard Haussmann → Rue Halévy → Place de l'Opéra → Avenue de l'Opéra → Rue des Petits Champs → Rue la Feuillade → Place des Victoires → Rue Etienne Marcel → Rue aux Ours → Rue du Grenier Saint-Lazare → Rue Beaubourg → Rue du Renard → Rue de la Coutellerie → Avenue Victoria → Place du Châtelet → Quai de la Mégisserie → Pont Neuf → Quai de Conti → Quai Malaquais → Rue des Saints-Pères → Boulevard Saint-Germain → Rue de Rennes → Place du 18 Juin 1940 → Boulevard du Montparnasse → Boulevard des Invalides → Rue Eblé → Avenue Duquesne → Place de l'Ecole Militaire → Avenue Bosquet → Place de la Résistance → Pont de l'Alma → Place de l'Alma → Avenue du Président Wilson → Avenue Marceau → Rue de Presbourg.

Ce contour couvre presque toute la moitié ouest et centre de la carte du jeu (de l'Étoile à Beaubourg, de la rive droite au boulevard des Invalides) ; seule la portion rue de Rennes – place du 18-Juin-1940 – boulevard du Montparnasse sort de l'emprise au sud. Le Champ-de-Mars, cité dans le chapeau, reste à l'extérieur du contour tracé (qui passe par l'avenue Bosquet), et le Trocadéro n'est atteint que par l'extrémité de l'avenue du Président-Wilson : lecture du texte à arbitrer en conception.

**Objets interdits aux abords et au sein des cortèges** (mêmes arrêtés, liste observable lors des fouilles) : « artifices de divertissement et […] articles pyrotechniques » ; substances dangereuses, inflammables ou corrosives « dans des conteneurs individuels » ; « équipements de protection destiné[s] à mettre en échec tout ou partie des moyens utilisés par les représentants de la force publique » [V S4][V S5]. Les fouilles de bagages et visites de véhicules se font sur réquisition écrite du procureur, sur les lieux de la manifestation et à ses abords [V S5]. Sanctions rappelées par l'arrêté de 2023 : dissimulation volontaire du visage au sein ou aux abords d'une manifestation où des troubles sont commis ou risquent de l'être : un an d'emprisonnement et 15 000 € d'amende ; violation des interdictions d'artifices ou de transport de carburant : contravention de 4e classe avec amende forfaitaire [V S5]. (Le cadre juridique complet est traité dans le dossier 01.)

**Autres secteurs ponctuellement interdits** : jardins des Tuileries et du Carrousel, Opéra, ministère de la Justice (janvier 2020) [P S48] ; parvis de Notre-Dame, Trocadéro et Champ-de-Mars selon les jours [P S48]. À l'automne 2026, les parcours centraux déposés ont été interdits et remplacés par des itinéraires en bordure de Paris [P S62].

### 2.3 Dispositifs habituels observables

| Dispositif | Où | Description pour le jeu | Fiabilité |
|---|---|---|---|
| Fermeture permanente d'une rue | rue du Faubourg-Saint-Honoré devant l'Élysée | chaussée fermée aux véhicules, abords parfois fermés aux piétons ; barrières, plots, guérite | [P S47] |
| Point de filtrage | ex. rue du Faubourg-Saint-Honoré à hauteur de l'avenue Matignon | contrôle visuel des sacs, palpation, fouille possible ; file d'attente | [P S47] |
| Verrou de pont | pont de la Concorde (36 m), pont Alexandre-III (40 m), pont des Invalides (16 m), pont Royal (16 m) | fourgons garés en travers + ligne d'agents ; manifestants tenus à ≈ 200 m de l'Assemblée | [P S44] |
| Barrage d'avenue | les 12 avenues de l'Étoile, rue Royale, rue de Rivoli, avenue de Marigny | véhicules + grilles mobiles ; foule qui se masse derrière chaque barrage | [P S60] |
| Zone « 100 m de part et d'autre » | toutes les rues perpendiculaires aux Champs-Élysées | interdiction étendue sur 100 m dans chaque rue transversale | [V S4] |
| Enceinte fixe | tour Eiffel | parois de verre côté Seine et côté Champ-de-Mars, grilles métalliques sur les deux autres côtés, entrées par points de contrôle | [P S49] |
| Grilles et portails | Élysée (portail à 4 colonnes ioniques sur la rue, grille côté avenue Gabriel), Beauvau (grilles de 1856 gardées par un binôme), Matignon (portail), Palais de Justice (grille dorée de 1787) | éléments de décor infranchissables ; sentinelles | [V S38][V S68][V S20c] ; Matignon [V S37] |
| Protection des vitrines | commerces des Champs-Élysées, avenue Kléber | plaques de bois ou de métal posées avant les samedis à risque | [P S60] |

> **Ce que le jeu doit reproduire — sites sensibles**
> - Deux calques de « zones interdites » activables par scénario : le **petit périmètre** de 2020 (Champs-Élysées + Élysée/Beauvau/Concorde) et le **grand périmètre** de 2023 (contour en 38 voies ci-dessus). Un cortège ou un groupe qui y pénètre déclenche un événement « rassemblement interdit ».
> - Les sites du tableau 2.1 sont des **objectifs à protéger** avec une jauge : plus un groupe hostile s'approche (seuils à 200 m, 100 m, 50 m [E]), plus la pression hiérarchique monte.
> - Élysée et Beauvau forment un seul îlot de protection (150 m d'écart), bordé au sud par l'avenue Gabriel et les jardins des Champs-Élysées ; l'ambassade des États-Unis en occupe l'angle sud-est, côté Concorde.
> - Matignon, les ministères de la rue de Varenne et de la rue de Grenelle sont dans des rues de 10 m : deux bouchons suffisent, mais aucune manœuvre de véhicule n'y est possible.
> - Assemblée nationale : la bataille se joue sur le **pont de la Concorde** et le quai d'Orsay, jamais devant la colonnade.
> - Les textes entre guillemets ci-dessus peuvent être repris tels quels dans les écrans de briefing (« Arrêté du préfet de police »).

---

## 3. Fiches techniques des monuments

### 3.0 Tableau de synthèse

Les colonnes « lat ; lon » et « emprise » viennent d'OpenStreetMap [V S3] sauf mention ; « x ; z » applique la projection du BRIEF ; le cap `h` applique `h = π − azimut` à la façade principale (un modèle qui « regarde » vers +z doit avoir sa façade principale en +z).

| Monument | lat ; lon | x ; z (jeu) | Emprise au sol (m) | Azimut façade principale (° depuis le nord) | Cap jeu `h` (rad) | Hauteur (m) | Alt. sol (m) [V S2] |
|---|---|---|---|---|---|---|---|
| Arc de Triomphe | 48.873779 ; 2.295040 | -1920 ; -906 | 44,82 × 22,21 [V S10] (socle OSM 50,4 × 28,1 [V S3]) | 115 (face Champs-Élysées) / 295 | 1.13 | 49,54 [V S10] | 58,6 |
| Tour Eiffel | 48.858296 ; 2.294479 | -1961 ; 816 | 124,9 × 124,9 [V S9] (OSM 123,6 × 123,5 [V S3]) | 314 (face Seine/Trocadéro) / 134 (Champ-de-Mars) | -2.34 | 330 avec antennes [V S9] | 33,9 |
| Obélisque de Louxor (position OSM) | 48.865476 ; 2.321131 | -8 ; 17 | socle 4 × 4 [V S3] | arêtes alignées sur l'axe 116 | 1.12 | 23 fût ; sommet à 33,37 [V S14] | 32,8 |
| Fontaine des Fleuves (nord) | 48.865992 ; 2.321508 | 20 ; -40 | bassin Ø ≈ 15 [V S3] | — | — | ≈ 9 [E] | 32,8 |
| Fontaine des Mers (sud) | 48.864959 ; 2.320751 | -36 ; 75 | bassin Ø ≈ 15 [V S3] | — | — | ≈ 9 [E] | 32,8 |
| Hôtel de la Marine | 48.866931 ; 2.323080 | 135 ; -144 | 94 × 65 [V S3] (façade ≈ 94) | 206 (vers la place) | -0.45 | ≈ 22 à la balustrade [E] | 33 |
| Hôtel de Crillon (et 3 hôtels voisins) | 48.867250 ; 2.321500 | 19 ; -180 | façade Gabriel ≈ 94 [E, symétrique] ; Crillon seul 91 × 32 [V S3] | 206 | -0.45 | ≈ 22 [E] | 33 |
| Palais du Louvre (ensemble) | 48.860962 ; 2.335361 | 1035 ; 519 | 665 × 327 [V S3] ; 71 079 m² bâtis [V S3] | axe 110–116 (ouvert vers l'ouest, 291) | -1.94 | ≈ 25–30 aux combles, pavillons ≈ 40 [E] | 34 |
| Cour Carrée | 48.860369 ; 2.338551 | 1269 ; 585 | cour 125 × 125 [V S3] ; bâtiment ≈ 160 de côté [P S45] | axe 109 / 19 | 1.24 | ≈ 28 [E] | 35 |
| Pyramide du Louvre | 48.861012 ; 2.335852 | 1071 ; 514 | 35,42 × 35,42 [V S15] | arêtes 111 / 21 | -1.94 | 21,64 [V S15] | 34,1 |
| Arc du Carrousel | 48.861727 ; 2.332909 | 856 ; 434 | 19,5 × 6,7 [V S16] (OSM 18,4 × 10,3 [V S3]) | 116 (face Louvre) / 296 (face Tuileries) | -2.02 | 14,6 [V S16] (19 avec quadrige selon d'autres sources [P]) | 35,2 |
| Jardin des Tuileries | 48.863752 ; 2.326710 | 401 ; 209 | 691 × 326 [V S3] ; 25,5 ha [V S17] | axe 116 | -2.02 | terrasses +≈ 3–4 [E] | 32–35 |
| Notre-Dame de Paris | 48.852898 ; 2.349835 | 2096 ; 1416 | 127 × 48 [V S18] (OSM 135,6 × 79,3 avec sacristie [V S3]) | 296,5 (façade ouest) | -2.03 | tours 69 ; flèche 96 [V S18] | 35,0 |
| Sainte-Chapelle | 48.855385 ; 2.345027 | 1744 ; 1140 | 36 × 17 [V S20] (OSM 41,9 × 18,2) | 299 (façade ouest) | -2.08 | 42,5 + flèche 33,25 = ≈ 75,75 [V S20] | 35,5 |
| Palais de Justice / Conciergerie | 48.855754 ; 2.344359 | 1695 ; 1099 | 222 × 212 [V S3] | façade est 118 (bd du Palais) ; façade nord 28 (quai de l'Horloge) | 1.08 | tour de l'Horloge ≈ 47 [P] | 35,5 |
| Opéra Garnier | 48.872039 ; 2.331707 | 768 ; -712 | 155–173 × 101–125 [V S21] (OSM 148,7 × 100,9 [V S3]) | 164 (façade sud) | 0.28 | façade 32,12 ; comble de scène 55,97 ; lyre 73,6 depuis le fond de cuve [V S21] | 36,0 |
| Hôtel des Invalides (ensemble) | 48.855969 ; 2.312618 | -632 ; 1075 | 274 × 256 [V S3] ; façade nord 196 [V S22b] | 4 (façade nord) | 3.07 | dôme 107 [V S22] | 35 |
| Dôme des Invalides | 48.855000 ; 2.312500 | -640 ; 1183 | église ≈ 52 × 52 [E] ; cour du Dôme 87 × 80 [V S3] | 184 (portail sud, place Vauban) | -0.07 | 107 (dôme 90 + lanterne) [V S22] | 37–39 |
| Grand Palais | 48.866149 ; 2.312273 | -657 ; -57 | 240 × 159 [V S3] ; nef 200 × 50 [V S23] | 89 (façade av. Winston-Churchill) | 1.59 | 35 sous charpente ; 45 sous dôme ; 60 au campanile [V S23] | 32,5 |
| Petit Palais | 48.866022 ; 2.314957 | -460 ; -43 | 130 × 90 [V S3] ; façade ≈ 125 [V S24] | 275 (façade ouest) | -1.66 | dôme ≈ 30 [E] | 32,6 |
| Pont Alexandre-III | 48.863649 ; 2.313546 | -564 ; 221 | 160 × 40 [V S1] ; arche 107 [V S26] | axe 1 / 181 | -0.02 | pylônes 17 [P] | tablier ≈ 34 |
| Église de la Madeleine | 48.870028 ; 2.324466 | 237 ; -489 | 108 × 43 [P S27] (OSM 128,5 × 43,3 avec emmarchements [V S3]) | 206 (portique sud) | -0.45 | ≈ 30 ; colonnes 20 [P S27] | 35,3 |
| Palais Bourbon (Assemblée nationale) | 48.861564 ; 2.318210 | -222 ; 453 | 192 × 132 [V S3] ; colonnade ≈ 100 [E] | 23 (colonnade, vers la Seine) | 2.74 | ≈ 30 au fronton [E] | 34,6 |
| Hôtel de Ville | 48.856426 ; 2.352531 | 2294 ; 1024 | 144 × 89 [V S3] ; façade 143 [V S28] | 290 (façade ouest, parvis) | -1.92 | façade 18,8 ; pavillons 26,8 [V S28] ; campanile ≈ 50 [E] | 34,7 |
| Colonne Vendôme | 48.867470 ; 2.329440 | 601 ; -204 | socle ≈ 6,5 × 6,5 [V S3] ; fût Ø 3,6 [V S13] | statue : [NT] | — | 44,3 [V S13] | 33,3 |
| Colonne de Juillet | 48.853165 ; 2.369139 | 3512 ; 1387 | soubassement Ø ≈ 18 [V S3] | Génie : [NT] | — | 50,52 [V S29] | ≈ 36 |
| Opéra Bastille | 48.851580 ; 2.370894 | 3640 ; 1563 | 285 × 119 [V S3] ; 20 237 m² [V S3] | ≈ 320 (façade courbe vers la colonne) [E] | -2.44 | ≈ 50 hors sol (80 dont 30 sous la rue) [P S46] | 35,1 |
| Monument à la République | 48.867500 ; 2.363820 | 3122 ; -208 | socle Ø ≈ 13 [V S30] (OSM 14,8 × 13,4) | ≈ 225 (regard vers le sud-ouest) [E, à vérifier] | -0.79 | 25 = piédestal 15,5 + statue 9,5 [V S30] | 37,0 |
| Palais de Chaillot | 48.862139 ; 2.288446 | -2404 ; 389 | 427 × 132 (arc des deux ailes) [V S3] | 134 (vers la Seine) | 0.80 | pavillons ≈ 30 ; ailes ≈ 18 [E] | 60,2 |
| Fontaine de Varsovie | 48.861162 ; 2.289969 | -2292 ; 497 | grand bassin 121,5 × 59 [V S3] | axe 134 | 0.80 | jets ≈ 50 de portée [P] | 37,3 |
| École militaire | 48.851968 ; 2.304778 | -1206 ; 1520 | 469 × 269 (ensemble) [V S3] | 314 (façade sur le Champ-de-Mars) | -2.34 | dôme ≈ 45 [E] | 35,6 |
| Centre Pompidou | 48.860538 ; 2.352411 | 2285 ; 567 | 166 × 45 (60 avec escalators) [V S33] (OSM 168 × 66) | 290 (façade piazza) | -1.92 | 42 (52 côté piazza) [V S33] | 36,0 |
| Tour Saint-Jacques | 48.857998 ; 2.348916 | 2029 ; 849 | ≈ 10 × 10 (socle 13,3 × 12,2 [V S3]) | — | — | 54 [V S34] | 36 |
| Palais-Royal | 48.863556 ; 2.336849 | 1145 ; 231 | palais 143,5 × 137 [V S3] ; jardin ≈ 230 × 100 [E] | 200 (façade place du Palais-Royal) | -0.35 | ≈ 22 [E] | 33,9 |
| Bourse de commerce | 48.862819 ; 2.342831 | 1583 ; 313 | cercle Ø ≈ 67 [V S3] | — | — | coupole ≈ 40 [E] ; colonne Médicis ≈ 31 [P] | 36 |

**Écart d'origine à connaître** : l'origine du BRIEF (48.865633 ; 2.321236) est à **≈ 19 m** au nord-nord-est de l'obélisque tel qu'OpenStreetMap le place (48.865476 ; 2.321131, soit x = −8 ; z = +17) [V S3] ; Wikipédia donne 48°51′56″ N, 2°19′16″ E [V S14], valeur arrondie à la seconde d'arc (± 15 à 30 m) qui ne permet pas de trancher. Soit on pose l'obélisque à (−8 ; +17) avec les fontaines à (20 ; −40) et (−36 ; +75), soit on accepte un décalage de 19 m entre l'origine et le monument. Les deux fontaines sont à **64 m** de l'obélisque, sur l'axe rue Royale–pont de la Concorde (azimut 25,7° / 205,7°) [V S3].

### 3.0 bis Palette commune des matériaux (toutes valeurs [E])

| Matériau | Teinte éclairée | Teinte ombre / salissure | Où |
|---|---|---|---|
| Pierre de taille parisienne (calcaire blond) | `#DCD0B6` | `#B8AC92` | immeubles haussmanniens, Louvre, Madeleine, Invalides, Opéra, ponts de pierre |
| Pierre récemment nettoyée | `#E6DCC4` | `#C9BEA4` | Notre-Dame, Hôtel de la Marine, Grand Palais |
| Pierre blanche de Château-Landon | `#E4DDCB` | `#C2BBA8` | Arc de Triomphe (calcaire lacustre de Château-Landon [V S10]) ; Sacré-Cœur (même carrière, reste blanche [V S55]) |
| Pierre noircie par la pollution | `#8F8878` | `#5F5A50` | bas-reliefs de l'Arc (calcaire de Chérence qui noircit [V S10]), arrière-cours |
| Ardoise | `#4A5059` | `#33373E` | combles à la française (Louvre, Hôtel de Ville, Invalides, hôtels de Gabriel) |
| Zinc | `#8E969D` | `#6C747B` | toits haussmanniens (brisis en ardoise, terrasson en zinc) |
| Plomb patiné | `#70767B` | `#4E5357` | dôme des Invalides, toiture et flèche de Notre-Dame |
| Cuivre vert-de-gris | `#7FB09C` | `#4F7F6C` | coupole de l'Opéra, quadriges du Grand Palais |
| Bronze patiné sombre | `#3D4A42` | `#232B26` | colonnes Vendôme et de Juillet, statue de la République, fontaines |
| Dorure à la feuille | `#D9B23A` | `#9C7A1E` | dôme des Invalides, pyramidion, Renommées du pont Alexandre-III, Génie de la Bastille, grilles |
| Fer puddlé peint « brun tour Eiffel » | `#6E5A45` | `#4A3C2E` | tour Eiffel (brun depuis 1968 [V S9]) |
| Verre de verrière | `#C4D6D8` (opacité 0,35) | — | pyramide, Grand Palais, Bourse de commerce |
| Granit des bordures et pavés | `#8D8A84` | `#66635E` | bordures de trottoir, pavés de l'Étoile, des quais, de la Concorde |
| Enrobé de chaussée | `#3B3C40` | `#2A2B2E` | chaussées |
| Eau de la Seine | `#5F6B58` | `#3F4A3E` | fleuve (vert-brun opaque) |

### 3.1 Arc de Triomphe de l'Étoile

- **Volume** : tétrapyle (4 piles) de **49,54 m de haut, 44,82 m de large, 22,21 m de profondeur** [V S10]. Grande voûte dans l'axe des Champs-Élysées : **29,19 m de haut, 14,62 m de large** ; petite voûte transversale : **18,68 m de haut, 8,44 m de large** [V S10]. Par soustraction, chaque pile mesure ≈ 15,1 × 6,9 m en plan et l'entablement + attique occupe les 20,35 m au-dessus de la grande voûte.
- **Décor** : 4 hauts-reliefs de **18 m** sur socles élevés, adossés aux piles : côté Champs-Élysées, *Le Départ des volontaires de 1792* à droite et *Le Triomphe de 1810* à gauche ; côté Grande-Armée, *La Résistance de 1814* à droite et *La Paix de 1815* à gauche [V S10 pour les œuvres et le côté gauche/droite ; Wikipédia nomme ces faces « sud » et « nord », l'attribution à chaque avenue est [P]]. Frise historiée sur le grand entablement, frise de grecques sur le premier ; attique orné de **30 boucliers** séparés par des glaives [V S10]. Voûtes à caissons [P].
- **Au sol** : sous la grande voûte, dalle de la tombe du Soldat inconnu en granite de Vire, entourée de bornes de métal noir reliées par des chaînes ; flamme ravivée chaque soir à 18 h 30 [V S10]. Terrasse accessible au sommet, bordée de pics de sécurité [V S10].
- **Place** : cercle de **241 m** de diamètre, 12 avenues [V S11] ; anneau pavé ; accès par souterrain. Masse 50 000 t (100 000 t avec les fondations) [V S10].
- **Teintes** : pierre `#E4DDCB`, reliefs plus gris `#BDB5A2`, intrados `#CFC7B3`.

### 3.2 Tour Eiffel

| Élément | Valeur | Source |
|---|---|---|
| Hauteur totale (antennes) | **330 m** (2022) ; 324 m en 2000 ; 300 m sans drapeau en 1889 | [V S9] |
| Base | carré de **124,90 m** de côté extérieur ; écart intérieur entre piliers **74,24 m** → 4 pieds de ≈ 25,3 m ; soubassements carrés de 25 m de côté et 4 m de haut | [V S9] |
| Inclinaison des arêtes à la base | 54° par rapport au sol ; 16 arbalétriers (4 par pilier) | [V S9] |
| Arcs décoratifs entre piliers | sommet à 39 m, diamètre 74 m | [V S9] |
| 1er étage | plancher à **57,63 m**, plate-forme carrée de **70,69 m** de côté (≈ 4 200 m²) | [V S9], décimales concordantes avec [P S66] |
| 2e étage | plancher à **115,73 m**, **40,96 m** de côté (1 650 m²) | [V S9] |
| 3e étage | plancher à **276,13 m**, **18,65 m** de côté (350 m²) ; plate-forme haute à 279,11 m | [V S9] |
| Orientation | un pilier vers chaque point cardinal (nord, est, sud, ouest) ; faces à 44° / 134° ; axe du Champ-de-Mars 133,5° | [V S9][V S3] |
| Altitude du sol | 33,5 m (IGN : 33,9 m) | [V S9][V S2] |
| Structure | 18 038 pièces de fer, ≈ 2 500 000 rivets ; treillis en croix de Saint-André | [V S9] |
| Couleur | brun depuis 1968 ; repeinte en moyenne tous les 7 ans ; teinte plus dorée (« jaune-brun ») adoptée lors de la dernière campagne : **non recoupé** | [V S9] / [P] |
| Nuit | éclairage doré par projecteurs ; **scintillement de 20 000 ampoules pendant 5 minutes à chaque heure pleine**, de la tombée de la nuit à 1 h ; faisceau tournant de phare au sommet | [V S9] (dispositif installé pour l'an 2000) |

Profil procédural (demi-largeur de la tour en fonction de la hauteur, interpolation lisse) : 0 m → 62,5 ; 57,6 m → 35,3 ; 115,7 m → 20,5 ; 276 m → 9,3 ; 300 m → ≈ 5 [E au-dessus du 3e étage]. Trois « ceintures » pleines (les étages) plus sombres ; au 1er étage, bandeau portant 72 noms en lettres d'or [V S9]. Enceinte : voir tableau 2.1.

### 3.3 Place de la Concorde : obélisque, fontaines, statues

- **Obélisque** : monolithe de **23 m** en syénite rose d'Assouan (≈ 222–230 t), sommet à **33,37 m** du sol, donc piédestal ≈ 10 m (5 blocs de granite rose breton, 240 t) ; **pyramidion doré de 3,60 m** posé en 1998 ; grille de **323 piques dorées** ; au sol, lignes d'un cadran solaire (7 h à 17 h) en clous et bandes [V S14]. Section ≈ 2,4 m à la base, ≈ 1,5 m sous le pyramidion [E]. Hiéroglyphes gravés sur les 4 faces ; faces du piédestal ornées de schémas dorés du transport et de l'érection [P]. Teintes : fût `#B88F7C`, piédestal `#A98C82`.
- **Fontaines** (inaugurées le 1er mai 1840, en fonte, parties symboliques dorées) : **fontaine des Fleuves au nord**, **fontaine des Mers au sud** [V S14b]. Bassin circulaire de **≈ 15 m** de diamètre [V S3] ; au centre, pied entouré de 6 grandes figures assises, portant une vasque large puis une vasque haute plus petite ; autour, figures tenant des poissons qui crachent l'eau vers le centre [P]. Hauteur ≈ 9 m [E]. Teintes : fonte peinte vert bronze `#27392F`, rehauts `#D9B23A`.
- **Octogone de Gabriel** : 8 pavillons-guérites aux angles, chacun surmonté de la statue assise d'une ville (Bordeaux, Brest, Lille, Lyon, Marseille, Nantes, Rouen, Strasbourg) ; balustrades ; fossés de 20 m de large comblés en 1854 [V S12]. Colonnes rostrales de **9,60 m** portant des proues de navire et des lanternes ; lampadaires [V S14b]. L'ensemble (pavage, fontaines, statues, guérites, balustrades, colonnes, lampadaires) est classé [V S12].
- **Dimensions** : 360 × 210 m [V S1].

### 3.4 Hôtel de la Marine et hôtel de Crillon (façades de Gabriel)

- Deux palais jumeaux de part et d'autre de la rue Royale (22 m), façades élevées entre 1766 et 1775, inspirées de la colonnade du Louvre, sur soubassement à bossages [V S12]. Chaque façade : **portique de 12 colonnes corinthiennes** entre deux **pavillons d'angle** à fronton triangulaire (portique sur trois travées) [V S58] ; balustrade soulignant l'étage noble, guirlandes [V S58] ; loggia derrière la colonnade [V S58].
- Longueur de façade ≈ **94 m** chacune, profondeur 65 m (Marine) [V S3] ; hauteur ≈ 22 m à la balustrade [E] ; rez-de-chaussée à arcades en plein cintre (11 arcades entre les pavillons [E]) ; toits d'ardoise peu visibles derrière la balustrade (ardoises galloises posées lors de la restauration de la Marine [V S58]).
- À l'ouest, la façade abrite quatre hôtels (n° 4, 6, 8 et 10 place de la Concorde), le n° 10 étant l'hôtel de Crillon [V S58] : dans le jeu, « grand hôtel » au nom fictif. Teintes : pierre `#E2D7BE`, colonnes légèrement plus claires.

### 3.5 Palais du Louvre, pyramide, arc du Carrousel

- **Palais** : ensemble de **665 × 327 m**, 71 000 m² bâtis [V S3], en forme de U ouvert vers l'ouest : au fond, la **Cour Carrée** (cour intérieure de 125 × 125 m [V S3], bâtiment d'environ 160 m de côté [P S45]) ; deux longues ailes (nord le long de la rue de Rivoli, sud le long de la Seine) encadrant la **cour Napoléon** puis la place du Carrousel (256 × 95 m [V S1]) ; pavillons à hauts toits en dôme carré tous les ≈ 60–100 m [E]. Façades à 3 niveaux + combles, arcades au rez-de-chaussée côté cour ; l'aile sud est percée de 3 arches de passage (guichets) dans l'axe du pont du Carrousel [P].
- **Pyramide** : base carrée de **35,42 m**, hauteur **21,64 m** ; **603 losanges et 70 triangles** de verre de 21 mm ; structure de 95 t d'acier + 105 t d'aluminium ; trois répliques d'environ 5 m ; bassins triangulaires autour [V S15]. Pente calculée ≈ 50,7° (atan(21,64 / 17,71)). Statue équestre de Louis XIV dans la cour, au départ de l'axe historique [V S15].
- **Arc du Carrousel** : **14,6 m de haut, 19,5 m de large, 6,7 m d'épaisseur** [V S16] (d'autres sources donnent 19 × 23 × 7,3 m en comptant socle et quadrige [P]). Trois arches sur chaque grande face (centrale ≈ 9 m sous clé pour 4,45 m d'ouverture ; latérales 5,30 × 2,70 m) et une arche traversant chaque petit côté ; **8 colonnes corinthiennes à fût de marbre rouge** (4 par face), surmontées de 8 statues de soldats ; au sommet, quadrige encadré de deux figures dorées [V S16]. Teintes : pierre `#DDD2BA`, marbre `#9E4A3E`, bronze `#3D4A42`.

### 3.6 Jardin des Tuileries

- **25,5 ha** [V S17], rectangle de **691 × 326 m** orienté à 116° [V S3], entre la place du Carrousel et la Concorde. Altitude ≈ 32–33 m [V S2].
- Composition d'est en ouest [P, tracé à reprendre sur les données OSM] : parterres réguliers avec bassin rond ; partie centrale boisée (alignements d'arbres en quinconce, sol stabilisé clair `#CFC4A8`) ; grand bassin octogonal (≈ 60 m [E]) encadré de deux rampes en fer à cheval montant aux terrasses. Deux terrasses longitudinales surélevées de ≈ 3–4 m [E] : au nord le long de la rue de Rivoli, au sud le long du quai. À l'extrémité ouest, deux pavillons symétriques (≈ 80 × 13 m [E]) et une grille monumentale à pointes dorées vers la Concorde.
- Cité dans les secteurs interdits (2020, 2023) [P S48][V S5] : jardin clos de grilles, fermé la nuit, donc **obstacle infranchissable** pour les cortèges entre Rivoli et le quai.

### 3.7 Notre-Dame de Paris (état après restauration)

- **Dimensions** : longueur **127 m**, largeur **48 m**, **tours 69 m**, **flèche 96 m**, façade ouest **43,5 m de large et 45 m de haut** hors tours, voûtes à 33 m, toit de la nef à 43 m [V S18]. Emprise OSM avec la sacristie : 135,6 × 79,3 m [V S3]. Façade tournée vers 296,5°.
- **Façade ouest** de bas en haut : 3 portails ; galerie de statues ; étage de la rose centrale ; grande galerie ajourée ; deux tours carrées à sommet plat [V S18]. Flancs : arcs-boutants sur toute la longueur, grandes roses aux deux bras du transept ; chevet arrondi à l'est.
- **État 2024-2026** : incendie du 15 avril 2019 (flèche et toiture détruites) ; reconstruction à l'identique décidée en 2020 ; **réouverture les 7 et 8 décembre 2024** [V S18]. La charpente d'origine comptait 1 300 chênes ; l'ancienne flèche, environ 500 t de bois et 250 t de plomb [V S18]. Toiture et flèche neuves en plomb (gris clair mat, non encore patiné `#8C9297`), coq doré au sommet [P]. Programme complémentaire 2026-2033 : sacristie depuis le printemps 2026, façade nord, rose ouest à partir de 2027 → échafaudages localisés [P S40]. Pierre nettoyée très claire `#E8DFC8`.
- **Parvis** : 135 × 100 m [V S1], piéton.

### 3.8 Sainte-Chapelle, Conciergerie, Palais de Justice

- **Sainte-Chapelle** : **36 m de long, 17 m de large, 42,5 m de haut** sans la flèche ; **flèche de 33,25 m** (sommet ≈ 75,75 m) [V S20]. Nef unique très haute, contreforts fins séparant de hautes verrières, rose flamboyante à l'ouest, toit d'ardoise très pentu ; enclavée dans les cours du Palais : seule la partie haute dépasse des toits.
- **Façade nord (quai de l'Horloge)**, d'est en ouest : **tour de l'Horloge** carrée, la plus haute (≈ 47 m [P]), à l'angle du boulevard du Palais, avec cadran doré sur fond bleu ; **tours de César et d'Argent**, jumelles et rondes ; **tour Bonbec**, ronde, à mâchicoulis et toit conique d'ardoise [V S20b]. Entre les tours, façade de style médiéval.
- **Façade est (boulevard du Palais)** : cour d'honneur fermée par une **grille en fer forgé et doré de 1787**, grand perron [V S20c]. Emprise totale 222 × 212 m [V S3].

### 3.9 Opéra Garnier

- **Dimensions** : terrain 15 000 m², emprise 12 000 m² ; longueur 155 à 173 m, largeur 101 à 125 m ; **façade principale haute de 32,12 m** ; terrasse du comble de scène à **55,97 m** au-dessus de la place ; 73,60 m du fond de cuve à la lyre d'Apollon [V S21]. Façade tournée vers 164° (avenue de l'Opéra).
- **Composition** [P] : façade à 7 travées — rez-de-chaussée à 7 arcades sur perron ; étage noble en loggia rythmée par 16 grandes colonnes jumelées ; attique à décor doré ; aux deux extrémités du toit, deux groupes sculptés dorés. Derrière : coupole basse en cuivre vert de la salle, puis grand pignon triangulaire de la cage de scène, couronné d'un Apollon brandissant une lyre. Deux pavillons latéraux à dôme (est et ouest), celui de l'ouest desservi par une double rampe carrossable.
- Teintes : pierre `#DDD1B7`, marbres rosés `#C89C8C` et verts `#6E8F7A`, cuivre `#7FB09C`, or `#D9B23A`.

### 3.10 Hôtel des Invalides et dôme

- **Ensemble** : 274 × 256 m [V S3] ; **façade nord de 196 m** sur l'esplanade ; 15 cours dont la cour d'honneur centrale [V S22b]. Façade nord : 4 niveaux, lucarnes sculptées, grand portail central cintré avec relief équestre de Louis XIV [V S22]. Devant : fossé sec et alignement de canons-trophées face à l'esplanade [V S22]. Toits d'ardoise.
- **Dôme** (côté sud, place Vauban) : **107 m** au sommet (dôme à 90 m + lanterne) ; plan en croix grecque inscrite dans un carré ; couverture de plomb sur charpente de chêne ; **12 compartiments dorés** ornés de trophées où se cachent des lucarnes ; lanternon doré posé en diagonale par rapport à la façade ; 12 kg d'or pour la redorure de 1989 [V S22]. Portail sud à deux ordres superposés et fronton [V S22b]. Diamètre extérieur du tambour ≈ 27 m [E].
- **Esplanade** : 487 × 275 m [V S19], pelouses, axe 4° prolongé par le pont Alexandre-III.

### 3.11 Grand Palais, Petit Palais, pont Alexandre-III

- **Grand Palais** : emprise 240 × 159 m [V S3], plan en H ; **nef de 200 × 50 m** ; hauteur **35 m sous charpente, 45 m sous le dôme, 60 m au campanile** ; 13 500 m² de verrière sur la nef (17 500 m² au total) ; 6 000 t d'acier au-dessus de la nef ; charpente peinte en **vert réséda pâle** (`#A9BFA6`) [V S23]. Façade est sur l'avenue Winston-Churchill (90 m de large [V S1]) : longue colonnade ionique entre deux porches ; **deux quadriges de cuivre** aux angles nord-est et sud-est, à ≈ 40 m [V S23]. Drapeau tricolore au sommet du dôme.
- **Petit Palais** : façade de **≈ 125 m** centrée sur un porche monumental surmonté d'un dôme, colonnes d'ordre composite [V S24] ; emprise 130 × 90 m en trapèze autour d'un jardin intérieur [V S3][P].
- **Pont Alexandre-III** : **160 m de long, 40 m de large** [V S1] (l'infobox Wikipédia dit 152 × 30 et le texte 45 m de large : retenir la donnée Ville de Paris) ; **arche métallique unique de 107 m** à trois articulations [V S26] ; **4 pylônes** d'angle (≈ 17 m [P]) en pierre blanche portant chacun un groupe équestre en bronze doré (les Renommées) ; **32 candélabres de bronze** [V S26]. Axe 1° (aligné sur les Invalides). Teintes : arc gris perle `#C2C7C9`, pylônes `#E2D9C3`, or `#D9B23A`.

### 3.12 Église de la Madeleine

- Temple périptère sans clocher ni fenêtres : **52 colonnes corinthiennes de 20 m** entourant l'édifice, portique sud à 8 colonnes sous un fronton sculpté (*Le Jugement dernier*), inscription latine sur la frise [V S27][P S27]. Environ **108 × 43 m** [P] ; emprise OSM avec les emmarchements 128,5 × 43,3 m [V S3]. Haut soubassement (≈ 4 m [E]) avec grand escalier au sud et au nord. Façade tournée vers 206° (rue Royale, Concorde, Palais Bourbon en vis-à-vis à 1,05 km).
- Teintes : pierre `#D6CAAF`, toit à deux pentes `#7C8489`.

### 3.13 Palais Bourbon

- Façade nord plaquée entre 1806 et 1810 : **12 colonnes corinthiennes sous un fronton triangulaire** allégorique, en haut d'un large emmarchement ; elle est volontairement **désaxée** par rapport au bâtiment pour répondre à la Madeleine de l'autre côté de la Seine [V S69]. Statues assises au pied des marches [P]. Emprise totale 192 × 132 m avec l'hôtel de Lassay (58 × 22 m) [V S3]. Drapeaux tricolores entre les colonnes [P].
- Devant : quai d'Orsay (29 m [V S1]) puis pont de la Concorde.

### 3.14 Hôtel de Ville

- **Façade principale (ouest) de 143 m**, haute de **18,80 m** (26,80 m aux pavillons d'angle) ; fronton central à horloge ; derrière, **campanile octogonal** à dôme ; nombreuses statues dans des niches ; deux statues de bronze sur le parvis [V S28]. Emprise 144 × 89 m [V S3]. Style néo-Renaissance, toits d'ardoise très hauts (`#4A5059`), lucarnes, cheminées. Parvis 155 × 82 m [V S1].

### 3.15 Colonne Vendôme et place Vendôme

- Colonne de **44,3 m**, ≈ **3,60 m** de diamètre moyen, en pierre parée de bronze : frise en **spirale de 22 révolutions**, longue de 280 m, faite de 425 plaques ; piédestal carré orné de trophées ; plate-forme et statue au sommet [V S13]. Socle ≈ 6,5 m de côté [V S3]. Teinte `#3D4A42`.
- Place rectangulaire à pans coupés de **213 × 124 m** [V S13], deux accès seulement (rues de la Paix et de Castiglione, 22,5 m) ; façades uniformes : arcades au rez-de-chaussée, deux étages à pilastres, combles à lucarnes [P]. Sol minéral clair, sans arbres.

### 3.16 Colonne de Juillet et place de la Bastille

- Colonne de **50,52 m** ; fût en bronze divisé en trois parties portant des noms en lettres d'or ; au sommet, **Génie ailé doré** tenant un flambeau ; piédestal orné d'un lion et de coqs ; 179 500 kg de bronze [V S29]. Soubassement circulaire de ≈ 18 m de diamètre [V S3]. Teintes : bronze `#3D4A42`, or `#D9B23A`, soubassement en pierre et marbre clair.
- Place : 215 × 150 m [V S1] ; au sud, bassin du port de l'Arsenal (canal Saint-Martin, qui passe sous le boulevard Richard-Lenoir).

### 3.17 Opéra Bastille

- Emprise **285 × 119 m** (20 200 m²) [V S3], plan en « P » : volume elliptique vitré tourné vers la place, longue aile le long de la rue de Lyon [P S46]. Hauteur totale 80 m dont 30 m sous la rue, soit ≈ 50 m visibles [P S46]. Façades en verre et en dalles de pierre calcaire de 90 × 90 cm (36 000 dalles remplacées) [V S59]. Grand escalier extérieur et portique carré sombre vers la place [P]. Teintes : verre `#A7BAC2`, pierre `#D5D2C8`, métal `#5E6468`.

### 3.18 Monument à la République

- **Statue de bronze de 9,5 m** sur un **piédestal de pierre de 15,5 m** (≈ 13 m de diamètre au sol), soit ≈ 25 m ; piédestal en deux cylindres (partie basse d'environ 4 m, plus large) ; adossées à la colonne, **3 statues de pierre assises** (Liberté, Égalité, Fraternité) ; autour de la base, **12 hauts-reliefs de bronze** ; bassin circulaire d'environ 1 m de large ajouté en 2013 [V S30]. La figure est drapée, coiffée d'un bonnet phrygien et d'une couronne végétale, porte une épée au baudrier et lève un rameau de la main droite [V S30]. Devant le socle, grand lion de bronze [P].
- Usage en manifestation : le socle est escaladé, couvert d'affiches et de graffitis ; c'est le point de ralliement naturel [P]. Teintes : bronze `#44584D`, pierre `#D2C9B6`.

### 3.19 Palais de Chaillot et jardins du Trocadéro

- Deux **ailes courbes** formant un arc de **427 m** d'envergure sur 132 m de flèche [V S3], terminées côté parvis par deux pavillons massifs ; entre eux, l'esplanade (parvis des Droits-de-l'Homme) ouverte sur la tour Eiffel, bordée de **8 figures dorées** [V S42]. Style 1937 : façades de pierre claire à pilastres plats et hautes baies [P S42]. Pavillons ≈ 30 m, ailes ≈ 18 m [E].
- Jardins : **93 930 m²** [V S42], en pente du parvis (60,2 m) au bas des bassins (37,3 m) : **23 m de dénivelé** sur ≈ 250 m [V S2]. **Fontaine de Varsovie** : grand bassin de 121,5 × 59 m [V S3], bassins en cascade, batterie de canons à eau tirant vers la tour (portée ≈ 50 m [P S42]).

### 3.20 École militaire et Champ-de-Mars

- **École militaire** : ensemble de 469 × 269 m [V S3]. Façade nord-ouest sur le Champ-de-Mars : corps central (« le Château ») coiffé d'un **dôme quadrangulaire**, avant-corps à colonnes corinthiennes et fronton, longues ailes basses [V S70]. Devant : place Joffre (450 × 70 m [V S1]).
- **Champ-de-Mars** : 24,3 ha [V S25] ; à l'origine 916 × 394 m [V S25] ; parc actuel 964 × 442 m orienté à 133,5° [V S3] : longues pelouses centrales, allées latérales plantées, quelques buttes arborées. Le « Grand Palais éphémère » (2021) occupait l'extrémité sud-est [V S25] ; son démontage après 2024 n'a pas été vérifié [NT].

### 3.21 Centre Pompidou

- Parallélépipède de **166 m de long, 45 m de large (60 m avec l'escalier mécanique extérieur), 42 m de haut (52 m côté piazza)** ; plateaux espacés de 7 m [V S33]. Ossature métallique blanche apparente (poteaux, croix de contreventement). Façade ouest (piazza) : tube transparent de l'escalator montant en diagonale (« chenille »). Façade est (rue du Renard) : faisceaux de tuyaux colorés — bleu, vert, jaune, rouge [P].
- **Fermé pour rénovation de 2025 à 2030** [V S33] : en « Paris d'aujourd'hui », palissades et échafaudages ; piazza (170 × 65 m [V S1]) partiellement occupée par le chantier [E].
- Teintes : structure `#E9E9E4`, bleu `#2D6CB5`, vert `#2F9E5B`, jaune `#F2C230`, rouge `#D2342B`.

### 3.22 Tour Saint-Jacques, Palais-Royal, Bourse de commerce

- **Tour Saint-Jacques** : clocher gothique flamboyant isolé de **54 m** [V S34], plan carré ≈ 10 m [E] (socle 13,3 × 12,2 m [V S3]), au milieu d'un square ; base ouverte par des arcades, contreforts d'angle très ornés, statue et pinacles au sommet [P]. Pierre claire `#DDD3BB`.
- **Palais-Royal** : palais de 143,5 × 137 m [V S3] ; cour d'honneur occupée par **260 colonnes tronquées** (13 × 20) à section octogonale, rayées noir et blanc par bandes de **8,7 cm**, sur 3 000 m², trame de 3,19 m [V S52] ; au nord, jardin rectangulaire bordé de galeries à arcades régulières (boutiques) [V S52]. Abrite le Conseil d'État, le Conseil constitutionnel et le ministère de la Culture.
- **Bourse de commerce** : bâtiment **circulaire de ≈ 67 m de diamètre** [V S3] coiffé d'une coupole vitrée ; haute colonne cannelée adossée au sud-est [V S53]. Pierre `#DBD0B8`, coupole `#7E8A93`.

### 3.23 Repères lointains hors emprise (silhouettes d'horizon)

Distances et azimuts calculés avec la projection du jeu [V S3] ; altitudes du sol IGN [V S2].

| Repère | lat ; lon | x ; z (jeu) | Hauteur du bâtiment | Sol (m) | Sommet (m NGF) | Depuis la Concorde | Depuis République | Depuis la Bastille | Depuis l'Étoile | Depuis le Trocadéro |
|---|---|---|---|---|---|---|---|---|---|---|
| Panthéon | 48.84620 ; 2.34608 | 1821 ; 2161 | dôme **83 m** ; bâtiment 110 × 84 m [V S54] | 58,4 | ≈ 141 | 2 826 m / 140° | 2 703 m / 209° | 1 859 m / 245° | 4 838 m / 129° | 4 589 m / 113° |
| Sacré-Cœur | 48.88680 ; 2.34302 | 1597 ; −2354 | dôme **83 m**, campanile 91 m [V S55] | 119 (butte 130 [V S55]) | ≈ 202–213 | 2 844 m / 34° | 2 633 m / 325° | 4 202 m / 333° | 3 803 m / 68° | 4 855 m / 56° |
| Tour Montparnasse | 48.84211 ; 2.32198 | 54 ; 2616 | **209 m**, 59 étages [V S56] ; plan 62 × 39 m [V S3] | 52,7 | ≈ 262 | 2 616 m / 179° | 4 170 m / 227° | 3 669 m / 250° | 4 038 m / 151° | 3 323 m / 132° |
| Grande Arche de la Défense | 48.89256 ; 2.23588 | −6257 ; −2995 | cube évidé **110 m** de haut, 107–112 m de côté [V S57] | 64,6 | ≈ 175 | 6 937 m / 296° | 9 786 m / 287° | 10 707 m / 294° | 4 814 m / 296° | 5 122 m / 311° |
| Tours de la Défense | ≈ 48.8905 ; 2.2380 | ≈ −6100 ; −2770 | bouquet de tours ; 231 m pour la plus haute jusqu'en 2025, dépassée depuis par une tour livrée en 2025 [V S57] | 62,4 | ≈ 290–305 | ≈ 6 700 m / 294° | — | — | ≈ 4 600 m / 295° | — |
| (dans l'emprise) Tour Eiffel | 48.85830 ; 2.29448 | −1961 ; 816 | 330 m | 33,9 | ≈ 364 | 2 124 m / 247° | 5 187 m / 259° | 5 503 m / 276° | 1 723 m / 181° | 621 m / 134° |
| (dans l'emprise) Dôme des Invalides | 48.85500 ; 2.31250 | −640 ; 1183 | 107 m | ≈ 37 | ≈ 144 | 1 345 m / 208° | 4 012 m / 250° | 4 157 m / 273° | 2 450 m / 148° | 1 941 m / 114° |

Lecture : depuis la Concorde, la Grande Arche est exactement dans l'axe des Champs-Élysées (296°), derrière l'Arc de Triomphe ; la tour Montparnasse est plein sud (179°) ; le Sacré-Cœur au nord-nord-est (34°), blanc, sur sa butte ; le Panthéon au sud-est (140°). La tour Montparnasse : prisme sombre à plan en amande, teinte `#3A342F` ; Sacré-Cœur `#EDE9DD` ; dôme du Panthéon `#8E9498` sur tambour à colonnade `#D8CDB3`.

> **Ce que le jeu doit reproduire — monuments**
> - Chaque monument est un **volume de collision simple** (emprise L × l du tableau 3.0, pivotée de l'azimut indiqué) + une géométrie visuelle détaillée ; les hauteurs du tableau fixent la silhouette.
> - Priorité de fidélité (visibles pendant les missions de manifestation) : Arc de Triomphe, monument à la République, colonne de Juillet, Opéra Garnier, obélisque et fontaines, Madeleine, Palais Bourbon, Hôtel de Ville, tour Eiffel, dôme des Invalides.
> - Éléments qui comptent pour le gameplay et pas seulement pour le décor : voûtes traversables de l'Arc (14,62 m et 8,44 m), socle escaladable de la République, grilles des Tuileries (infranchissables), enceinte de la tour Eiffel, bassins de Varsovie et de la Concorde (obstacles), 260 colonnes du Palais-Royal (couvert bas), perrons et colonnades (points hauts pour la presse et les orateurs).
> - La tour Eiffel scintille 5 minutes à chaque heure pleine de nuit : repère temporel gratuit pour les missions nocturnes.
> - Silhouettes lointaines sur un cylindre d'horizon : Sacré-Cœur (34° depuis la Concorde), Montparnasse (179°), Panthéon (140°), Défense (296°, dans l'axe).
> - Décision à prendre une fois : « état 2026 » (Pompidou en chantier, échafaudages à Notre-Dame, Concorde en travaux) ou « état de référence » sans chantiers.

---

## 4. La Seine dans l'emprise

### 4.1 Gabarit du fleuve et des quais

| Donnée | Valeur | Source |
|---|---|---|
| Traversée de l'emprise | ≈ 6 km de cours, du pont de Sully (est) au pont de Bir-Hakeim (ouest), en arc de cercle : le fleuve coule d'est en ouest, puis vers le sud-ouest après le pont de l'Alma | [V S1][V S3] |
| Largeur à Paris | de 30 m (quai de Montebello) à 200 m (pont de Grenelle) | [V S41] |
| Largeur mesurée du grand bras | ≈ 105–115 m entre le pont Alexandre-III et le Pont Neuf (3 profils IGN) | [V S2] |
| Largeur mesurée du petit bras | ≈ 35 m devant Notre-Dame (pont au Double : 45 m de long) | [V S2][V S1] |
| Profondeur | 3,4 à 5,7 m | [V S41] |
| Niveau normal de l'eau | retenue normale 26,7 à 26,9 m NGF ; profils IGN : 26,5 m (Concorde) à 26,9 m (Cité) | [V S41][V S2] |
| Berges basses (ports, anciennes voies sur berge) | 28,3 à 29,9 m → **1,5 à 3 m au-dessus de l'eau** | [V S2] |
| Quais hauts (niveau de la ville) | 33 à 36 m → **6,5 à 9 m au-dessus de l'eau** (≈ 7 m à l'ouest, ≈ 9 m quai de la Mégisserie et île de la Cité) | [V S2] |
| Murs de quai | murs de pierre quasi verticaux de 4 à 6 m entre berge basse et quai haut ; parapet de pierre ≈ 1 m ; rampes pavées et escaliers tous les 150–300 m | [E] |
| Crues | zéro de l'échelle du pont d'Austerlitz à 25,90 m NGF ; vigilance à partir de 2,50 m à l'échelle ; les berges basses sont alors noyées | [V S41] |
| Îles | île de la Cité ≈ 930 × 280 m ; île Saint-Louis ≈ 550 × 250 m ; pointe nord de l'île aux Cygnes sous le pont de Bir-Hakeim | [E d'après S1 et S3] |
| Canal Saint-Martin | à ciel ouvert dans l'angle nord-est de la carte (passerelles piétonnes de 3,6 à 7 m de large, ponts de 31–37 m de long), puis couvert sous le boulevard Richard-Lenoir (60 m de large) jusqu'au port de l'Arsenal, au sud de la Bastille | [V S1] |

### 4.2 Ponts, d'ouest en est (24 franchissements)

Longueurs et largeurs : donnée Ville de Paris d'abord [V S1], valeur Wikipédia après la barre oblique quand elle diffère [V S35]. Nombre d'arches et matériaux : [V S35] ; décor (statues, médaillons, candélabres) : [P], à vérifier sur photos.

| # | Pont (d'ouest en est) | lat ; lon [V S1] | x ; z (jeu) | Longueur (m) | Largeur (m) | Structure / style | Mise en service [P S35] | Teinte [E] |
|---|---|---|---|---|---|---|---|---|
| 1 | Pont de Bir-Hakeim | 48.8556 ; 2.2877 | -2458 ; 1116 | 250 [S1] / 237 [S35] | 25 | pont métallique à 2 étages : chaussée en bas, viaduc du métro (ligne 6) porté par colonnettes en haut ; traverse l'île aux Cygnes | 1905 | acier vert-gris `#6F7F78`, pierre |
| 2 | Pont d'Iéna | 48.8598 ; 2.2921 | -2136 ; 649 | 157 / 155 | 35 | 5 arches en arc de cercle de 28 m, pierre ; 4 statues équestres aux angles ; axe Trocadéro–Tour Eiffel ; infobox Wikipédia : « piétons et cyclistes » [P S35] | 1814, élargi 1937 | pierre `#D5C9AE` |
| 3 | Passerelle Debilly | 48.8625 ; 2.2970 | -1777 ; 348 | 160 | 8 | passerelle piétonne en arc métallique, culées à décor de céramique | 1900 | acier vert sombre `#3F5A4C` |
| 4 | Pont de l'Alma | 48.8634 ; 2.3017 | -1432 ; 248 | 153 (142,5 selon Structurae [P]) | 42 | pont-poutre métallique moderne à pile unique ; statue du Zouave sur la pile (repère de crue) | 1974 | acier gris `#8C9296`, béton |
| 5 | Pont des Invalides | 48.8636 ; 2.3104 | -794 ; 226 | 155 / 152 | 16–18 | 4 arches en maçonnerie, le plus bas des ponts ; piles ornées de trophées | 1855 | pierre `#CFC3A8` |
| 6 | Pont Alexandre-III | 48.8637 ; 2.3135 | -567 ; 215 | 160 (152 infobox) | 40 (30 infobox ; 45 dans le texte) → retenir 40 [V S1] | arche métallique unique de 107 m très surbaissée ; 4 pylônes d'angle ; 32 candélabres ; voir fiche 3.14 | 1900 | acier gris perle `#C2C7C9`, bronze doré |
| 7 | Pont de la Concorde | 48.8634 ; 2.3196 | -120 ; 248 | 155 / 153 | 36 / 34 | 5 arches en pierre, parapet à balustres ; relie la Concorde au Palais Bourbon | 1791, élargi 1932 | pierre `#D2C6AB` |
| 8 | Passerelle Léopold-Sédar-Senghor | 48.8618 ; 2.3247 | 254 ; 426 | 145 / 106 (portée) | 15 | passerelle piétonne en arc unique acier + platelage bois, 2 niveaux (quai haut et berge basse) | 1999 | acier brun `#5A4A3C`, bois `#8B6B4A` |
| 9 | Pont Royal | 48.8601 ; 2.3299 | 635 ; 615 | 133 / 110 | 15,8–17 | 5 arches en plein cintre, pierre, dos d'âne léger | 1689 | pierre `#CDBFA2` |
| 10 | Pont du Carrousel | 48.8594 ; 2.3329 | 855 ; 693 | 168 | 33 | 3 arches en béton armé parementé de pierre ; 4 statues assises ; face aux guichets du Louvre | 1939 | pierre `#D4C8AD` |
| 11 | Pont des Arts | 48.8585 ; 2.3376 | 1200 ; 793 | 155 | 10–11 | passerelle piétonne, 7 arches métalliques, platelage bois ; garde-corps vitrés | 1984 (1804) | acier vert-noir `#2E3B35`, bois |
| 12 | Pont Neuf | 48.8573 ; 2.3415 | 1485 ; 927 | 233–238 (grand bras 154) | 20 (chaussée 11,5 + 2 trottoirs 4,5) | 12 arches (7 + 5) ; demi-lunes en encorbellement au droit de chaque pile ; mascarons ; traverse la pointe ouest de l'île de la Cité (statue équestre d'Henri IV) | 1607 | pierre blonde `#D8CBAE` |
| 13 | Pont Saint-Michel | 48.8541 ; 2.3446 | 1713 ; 1283 | 62 | 30 | 3 arches en plein cintre ; médaillons « N » couronnés sur les piles | 1857 | pierre |
| 14 | Pont au Change | 48.8567 ; 2.3468 | 1874 ; 993 | 103 | 30 | 3 arches ; médaillons « N » ; relie Châtelet au boulevard du Palais | 1860 | pierre |
| 15 | Petit-Pont – Cardinal-Lustiger | 48.8533 ; 2.3469 | 1881 ; 1372 | 32 | 20 | arche unique en pierre | 1853 | pierre |
| 16 | Pont Notre-Dame | 48.8562 ; 2.3486 | 2006 ; 1049 | 105–106 | 20 | arche centrale métallique de 59,5 m entre 2 petites arches de pierre | 1912–1919 | acier vert `#4E6B5A`, pierre |
| 17 | Pont au Double | 48.8526 ; 2.3484 | 1991 ; 1449 | 45 | 20 | arche unique en fonte, piéton vers le parvis | 1883 | fonte brun cuivré `#7A5A3C` |
| 18 | Pont d'Arcole | 48.8555 ; 2.3506 | 2153 ; 1127 | 80–90 | 20 | arche unique en fer de 80 m sans pile, très tendue | 1856 | fer gris-vert `#5F6F68` |
| 19 | Pont de l'Archevêché | 48.8515 ; 2.3515 | 2219 ; 1572 | 68 | 11 | 3 arches en maçonnerie (15, 17, 15 m), le plus étroit | 1828 | pierre |
| 20 | Pont Saint-Louis | 48.8528 ; 2.3528 | 2314 ; 1427 | 67 | 16 | poutre métallique unique, piéton, entre les deux îles | 1970 | acier gris `#7D8388` |
| 21 | Pont Louis-Philippe | 48.8539 ; 2.3544 | 2431 ; 1305 | 100 | 15–15,2 | 3 arches en pierre, couronnes de laurier sur les piles | 1862 | pierre |
| 22 | Pont Marie | 48.8529 ; 2.3574 | 2651 ; 1416 | 92–97 | 22 | 5 arches inégales en pierre, niches vides sur les piles, dos d'âne | 1635 | pierre patinée `#C9BC9F` |
| 23 | Pont de la Tournelle | 48.8506 ; 2.3554 | 2504 ; 1672 | 122–130 | 23 | grande arche centrale en béton + 2 petites ; pylône-statue de sainte Geneviève (≈ 15 m) rive gauche | 1928 | béton parementé pierre |
| 24 | Pont de Sully | 48.8501 ; 2.3590 | 2768 ; 1727 | 256 (2 ponts : 159 + 82 env.) | 20 | 2 ponts métalliques en biais (≈ 45°) de part et d'autre de la pointe est de l'île Saint-Louis ; 3 arches en fonte de 46-49-46 m au sud | 1876 | fonte gris-bleu `#6E7B85` |

Le pont de Sully est exactement sur la limite sud de l'emprise (lat 48.8500) ; le pont d'Austerlitz et les ponts en aval de Bir-Hakeim sont hors carte.

> **Ce que le jeu doit reproduire — Seine**
> - Un plan d'eau à **y ≈ 26,7 m**, des berges basses à **y ≈ 29 m** et la ville à **y ≈ 33–36 m** : la Seine est une tranchée de 7 à 9 m de profondeur, large de 105 à 115 m (35 m pour le petit bras). `heightAt` doit rendre ces trois paliers ; les murs de quai sont des collisions verticales.
> - Les ponts sont les **seuls points de passage** entre les deux rives : 24 goulots dont la largeur va de 8 m (Debilly) à 42 m (Alma). Un verrou de pont demande peu d'effectif et ne peut pas être contourné : c'est la manœuvre clef pour protéger l'Assemblée (pont de la Concorde, 36 m), les Invalides (Alexandre-III, 40 m) et la Préfecture (ponts Saint-Michel et au Change, 30 m).
> - Trois familles visuelles suffisent : ponts de pierre à arches (Neuf, Royal, Marie, Concorde, Iéna…), ponts métalliques à arche unique ou triple (Alexandre-III, Arcole, Notre-Dame, Sully), passerelles piétonnes (Arts, Senghor, Debilly).
> - Les berges basses sont piétonnes : zone de fuite et de regroupement hors de vue du quai haut ; accès par rampes.
> - Une chute dans la Seine est un événement de secours (mission pour le rôle « médecin » ou pompiers), jamais un moyen d'action.

---

## 5. Relief

### 5.1 Altitudes mesurées (IGN RGE ALTI, mètres NGF [V S2])

| Lieu | Altitude | Lieu | Altitude |
|---|---|---|---|
| Seine (plan d'eau) | 26,5–26,9 | Place de la République | 37,0 |
| Berges basses | 28,3–29,9 | Boulevard du Temple (milieu) | 37,0 |
| Place de la Concorde (obélisque) | 32,8 | Place de la Bastille | ≈ 36–39 |
| Jardin des Tuileries (bassin octogonal) | 32,2 | Place des Vosges | 36,0 |
| Place Clemenceau | 32,9 | Hôtel de Ville (parvis) | 34,7 |
| Rond-point des Champs-Élysées | 33,8 | Place du Châtelet | 36,2 |
| Champs-Élysées à George-V | 46,1–46,6 | Forum des Halles / Beaubourg | 36,0 |
| **Place de l'Étoile (pied de l'Arc)** | **58,6** | Parvis Notre-Dame | 35,0 |
| Avenue Kléber (milieu) | 58,8 | Préfecture de police | 35,1–35,5 |
| Place Victor-Hugo | 58,3 | Place Saint-Michel | 34,8 |
| **Place du Trocadéro** | **61,3** | Saint-Germain-des-Prés | 36,0 |
| Parvis de Chaillot | 60,2 | Carrefour de l'Odéon | 35,6 |
| Bas des jardins du Trocadéro | 37,3 | Place Saint-Sulpice | 35,7 |
| Place d'Iéna | 47,4 | Sèvres-Babylone | 36,4 |
| Place de l'Alma | 33,0 | Hôtel de Matignon | 36,2 |
| Tour Eiffel (sous la tour) | 33,9 | Boulevard Saint-Germain / Solférino | 32,1 |
| Champ-de-Mars (milieu) | 35,3 | Palais Bourbon (quai d'Orsay) | 34,6 |
| École militaire (place Joffre) | 35,6 | Esplanade des Invalides | 33,0 |
| Place Vauban | 39,1 | Élysée (rue du Fbg-Saint-Honoré) | 33,2 |
| Place de la Madeleine | 35,3 | Place Vendôme | 33,3 |
| Place de l'Opéra | 36,0 | Pyramide du Louvre | 34,1 |
| Gare Saint-Lazare (cour de Rome) | 32,4 | Place de la Bourse | 35,4 |
| Boulevard Haussmann / Chaussée-d'Antin | 33,1 | Boulevard Montmartre | 36,5 |
| Saint-Augustin | 34,5 | Porte Saint-Denis | 35,8 |
| Gare de l'Est (parvis) | 44,9–45,7 | Boulevard Henri-IV | 34,7 |

Lecture : **toute la carte est quasi plate (32 à 37 m)**, sauf deux reliefs — la **butte de Chaillot / Étoile** à l'ouest (58 à 61 m, soit +25 m) et la montée vers la gare de l'Est au nord-est (+8 m). Hors emprise, la montagne Sainte-Geneviève (Panthéon, 58 m) et Montmartre (119–130 m) ferment l'horizon.

### 5.2 Profil des Champs-Élysées (de l'obélisque à l'Arc, 2 124 m)

| Point | Distance cumulée (m) | x ; z (jeu) | Altitude (m) [V S2] | Pente du tronçon |
|---|---|---|---|---|
| Obélisque | 0 | 0 ; 0 | 32,8 | — |
| Entrée de l'avenue (chevaux de Marly) | 87 | −80 ; −35 | 32,4 | −0,5 % |
| Place Clemenceau | 471 | −428 ; −197 | 32,5 | 0,0 % |
| Avant le Rond-point | 822 | −743 ; −352 | 32,5 | 0,0 % |
| Rond-point | 990 | −897 ; −419 | 33,9 | +0,8 % |
| | 1 205 | −1088 ; −519 | 36,5 | +1,2 % |
| | 1 429 | −1293 ; −608 | 40,8 | +1,9 % |
| George-V | 1 639 | −1483 ; −697 | 46,1 | +2,5 % |
| | 1 850 | −1674 ; −786 | 51,9 | **+2,8 %** |
| Haut de l'avenue | 2 013 | −1821 ; −858 | 56,4 | +2,7 % |
| Arc de Triomphe | 2 124 | −1920 ; −906 | 58,6 | +2,0 % |

Bilan : **+25,7 m** au total ; la moitié basse (jardins, jusqu'au Rond-point) est plate, la moitié haute (partie commerçante, 1 135 m) monte régulièrement à **2,2 % en moyenne, 2,8 % au maximum**. Un site cycliste donne 1,8 % de moyenne et 3,2 % au plus raide sur un segment différent [P S65]. L'avenue Kléber relie l'Étoile (58,6 m) au Trocadéro (61,3 m) presque à plat ; l'avenue d'Iéna et l'avenue Marceau descendent de l'Étoile vers la Seine (≈ 33 m) à ≈ 2 à 2,8 % [V S2, calcul].

> **Ce que le jeu doit reproduire — relief**
> - `heightAt` peut rester plat à 34 m ± 2 m sur 85 % de la carte ; il faut modéliser trois choses seulement : la **rampe des Champs-Élysées** (plate puis 2–3 %), le **plateau Étoile–Kléber–Trocadéro** (58–61 m) avec la chute des jardins du Trocadéro (23 m sur 250 m, escaliers et rampes), et la **tranchée de la Seine**.
> - Conséquences de gameplay de la pente des Champs : les forces placées en haut voient toute l'avenue ; les projectiles roulent vers le bas ; un canon à eau tirant vers le bas gagne en portée, vers le haut il en perd [E] ; un cortège qui monte fatigue un peu plus vite [E].
> - Les eaux de ruissellement (canon à eau, pluie) coulent vers la Concorde et vers la Seine.

---

## 6. Ambiance par quartier

Repères chiffrés : Paris Centre (1er–4e) compte **82 commerces pour 1 000 habitants contre 28 en moyenne à Paris** ; les quartiers centraux ont **1 000 à 2 400 commerces au km²** ; 10,9 % des locaux en rez-de-chaussée sont vacants (rideaux baissés) [P S64]. Sur les Champs-Élysées : de l'ordre de **300 000 visiteurs par jour** selon un guide local de 2016, 6 cinémas (16 salles) en 2022 contre 27 dans les années 1970, mélange de magasins-phares du luxe et du sport, de cinémas, de showrooms automobiles et de terrasses [P S63]. Le reste du tableau est une description de terrain [E], à croiser avec les données OSM chargées par le jeu. **Aucune enseigne réelle** : types de commerces seulement.

| Quartier | Emprise approximative (jeu) | Voirie [V S1] | Bâti | Rez-de-chaussée (types génériques) | Rue : PNJ, mobilier, sons |
|---|---|---|---|---|---|
| **Champs-Élysées (partie haute)** | de l'Étoile au Rond-point ; x −1900 → −900 | avenue de 70 m (chaussée ≈ 30 m, trottoirs ≈ 20 m), double rangée d'arbres ; rues transversales de 10–20 m | immeubles de 7–8 niveaux, 25–30 m, pierre + grandes façades vitrées sur 2–3 niveaux | magasins-phares de mode et de sport, parfumeries, cinémas, galeries marchandes, brasseries à grandes terrasses, restauration rapide, banques, showrooms automobiles | foule dense de touristes (valises, sacs de boutique), vendeurs à la sauvette, files devant les boutiques ; kiosques à journaux, colonnes d'affichage, bancs ; bruit de circulation continu |
| **Champs-Élysées (partie basse, jardins)** | du Rond-point à la Concorde ; x −900 → 0 | avenue + contre-allées dans des jardins ; av. Gabriel 15 m, av. de Marigny 32 m, av. Winston-Churchill 90 m | pavillons isolés, théâtres, Grand et Petit Palais ; Élysée derrière les grilles au nord | restaurants-pavillons, théâtres, peu de vitrines | promeneurs, joggeurs ; forte présence policière fixe (guérites, barrières) près de l'Élysée |
| **Triangle d'or** | entre Champs-Élysées, av. Montaigne (33 m) et av. George-V (40 m) | avenues de 33–40 m, rues de 10–12 m | haussmannien cossu, hôtels particuliers, palaces ; 6–7 niveaux | maisons de couture, joaillerie, maroquinerie, galeries d'art, palaces avec voituriers et auvents ; vitrines sobres, agents de sécurité privés à l'entrée | clientèle aisée peu nombreuse, berlines et chauffeurs ; peu de mobilier ; calme |
| **Faubourg Saint-Honoré / Madeleine / Vendôme** | x −700 → +700 ; z −700 → −150 | rue du Fbg-Saint-Honoré 14,5 m, rue Saint-Honoré 14,6 m, rue Royale 22 m | hôtels particuliers XVIIIe, immeubles de rapport ; ambassades ; places ordonnancées | luxe, joaillerie (place Vendôme), épiceries fines (Madeleine), galeries, palaces | très nombreux policiers et gendarmes en faction ; barrières permanentes ; peu de stationnement |
| **Opéra / Haussmann / Saint-Lazare** | x +100 → +1000 ; z −1375 → −600 | bd Haussmann 30 m, av. de l'Opéra 30 m (sans arbres), rue Auber 22 m | haussmannien régulier, 6 niveaux + combles, ≈ 20 m à la corniche et ≈ 25–28 m au faîtage [E] ; grands magasins à coupoles (noms fictifs) | grands magasins, banques (sièges à façades monumentales), agences de voyage, bureaux de change, prêt-à-porter, brasseries | flux de piétons très dense aux heures de bureau et le samedi ; gare : valises, taxis ; bus nombreux |
| **Grands Boulevards / Sentier / Bourse** | x +900 → +2700 ; z −600 → −300 | boulevards de 33–37 m plantés ; rues du Sentier de 8–12 m | immeubles XIXe hétérogènes, 5–7 niveaux ; passages couverts ; théâtres et cinémas à marquises | théâtres, cinémas, brasseries, restauration rapide, téléphonie, grossistes en textile (Sentier), jeunes entreprises en étage | noctambules, spectateurs en file, livreurs à diable et à vélo ; colonnes d'affichage, kiosques ; enseignes lumineuses la nuit |
| **Châtelet – Les Halles – Beaubourg** | x +1400 → +2400 ; z +200 → +900 | bd de Sébastopol 30 m, rue de Rivoli 20,8 m, nombreuses rues piétonnes de 8–14 m | tissu ancien dense 4–6 niveaux ; centre commercial sous une grande toiture (172 × 111 m [V S3]) ; jardin ; église Saint-Eustache (109 × 49 m [V S3]) | prêt-à-porter grand public, chaussures de sport, restauration rapide, bars, sex-shops résiduels rue Saint-Denis, friperies | très forte fréquentation jeune, pôle RER souterrain (sorties multiples = apparitions et disparitions de groupes) ; artistes de rue sur la piazza |
| **Marais / Haut-Marais** | x +2300 → +3500 ; z +100 → +1300 | rues de 9–15 m (Francs-Bourgeois 9, Vieille-du-Temple 14, Archives 15, Turenne 13) ; rue de Bretagne 20 | hôtels particuliers XVIIe à portails cochers, immeubles de 4–5 niveaux, cours ; place des Vosges à arcades (140 × 140 m) | boutiques de créateurs, galeries d'art, falafels et pâtisseries, bars, concept-stores, marché couvert ; vitrines petites | promeneurs du week-end (rues piétonnes le dimanche), terrasses étroites ; peu de voitures ; rues en baïonnette = visibilité courte |
| **République / canal Saint-Martin / faubourg du Temple** | x +2900 → +3758 ; z −1375 → −100 | place 283 × 119 ; rue du Fbg-du-Temple 20 m ; quais du canal | immeubles XIXe 6–7 niveaux ; caserne monumentale sur la place | cafés-brasseries à grandes terrasses, bars, restauration du monde, magasins de sport et de téléphonie, supérettes | skateurs sur l'esplanade, militants tenant des stands, rassemblements quasi quotidiens ; passerelles en dos d'âne sur le canal |
| **Bastille / Arsenal** | x +3200 → +3758 ; z +1100 → +1739 | bd Henri-IV 30 m, rue Saint-Antoine 21,5 m, rue de la Roquette | opéra moderne, immeubles XIXe, port de plaisance en contrebas | bars et salles de concert (vers la Roquette), brasseries, cinémas, magasins de meubles (faubourg Saint-Antoine) | sorties de bars la nuit ; marché sur le terre-plein du boulevard Richard-Lenoir |
| **Île de la Cité / île Saint-Louis** | x +1400 → +2900 ; z +950 → +1600 | bd du Palais 30 m, rue de la Cité 20 m ; île Saint-Louis : rue axiale de 8 m, quais de 10 m | Cité : grands édifices publics (Palais, Préfecture, Hôtel-Dieu 170 × 136 m [V S3], cathédrale) ; Saint-Louis : hôtels XVIIe de 4–5 niveaux | Cité : marché aux fleurs, boutiques de souvenirs, cafés ; Saint-Louis : glaciers, épiceries fines, galeries | files de touristes, robes d'avocats, véhicules de police stationnés en nombre autour de la Préfecture ; bouquinistes sur les parapets des quais (boîtes vertes `#1F4D3A`) |
| **Saint-Germain-des-Prés / Odéon** | x +400 → +1500 ; z +900 → +1739 | bd Saint-Germain 30 m ; rues de 10–12 m (Bonaparte 11, Seine 11,7, Buci 11,5) | immeubles XVIIe–XVIIIe de 4–6 niveaux, façades enduites claires, église romane (104 × 36 m [V S3]) | cafés littéraires à grandes terrasses, librairies, galeries d'art, antiquaires, mode haut de gamme, marché de rue | étudiants, touristes, terrasses pleines ; rues étroites à sens unique |
| **Faubourg Saint-Germain (ministères)** | x −450 → +400 ; z +350 → +1400 | rues de 10 m (Varenne 10,3, Grenelle 10, Saint-Dominique 10, Université 10,5) | hôtels particuliers entre cour et jardin derrière de hauts murs et des portails ; très peu de vitrines | quasi aucun commerce ; quelques cafés, antiquaires rue du Bac (20 m) | rues presque vides, gendarmes en faction devant chaque portail, voitures officielles |
| **Invalides / Gros-Caillou** | x −1500 → −450 ; z +300 → +1500 | esplanade 487 × 275 ; avenues de 26–39 m ; rue Cler 13 m (marché piéton) | haussmannien et Art nouveau, 6–7 niveaux | commerces de bouche (rue Cler), brasseries, pharmacies | familles, militaires en tenue, cars de tourisme stationnés |
| **Champ-de-Mars / Trocadéro / Chaillot** | x −2656 → −1500 ; z −200 → +1739 | avenues de 25–40 m ; quais de 27–61 m | immeubles bourgeois de 7–8 niveaux en pierre, musées, ambassades | cafés à touristes, kiosques de souvenirs, glaciers ambulants ; très peu de commerces de proximité | touristes en groupes, vendeurs à la sauvette de tours Eiffel miniatures, photographes de mariage, patrouilles militaires à pied par groupes de 3–4 |

Typologie de façade pour le générateur de vitrines [E] : largeur de travée 3–5 m ; hauteur de rez-de-chaussée 3,5–4,5 m (5–6 m avec entresol sur les grands axes) ; vitrine vitrée sur 70–90 % de la travée sur les axes commerçants, 0–20 % dans le faubourg Saint-Germain ; rideau métallique baissé pour ≈ 10 % des locaux, et pour 60–90 % des locaux sur le parcours d'une manifestation annoncée à risque [E].

> **Ce que le jeu doit reproduire — quartiers**
> - Un paramètre de quartier par tuile : densité de vitrines, type dominant (luxe / grand public / bouche / culture / institutionnel / aucun), densité de PNJ, part de touristes, présence policière fixe.
> - Les cibles de dégradation suivent ce paramètre : banques et luxe (Champs-Élysées, Triangle d'or, Opéra), grandes enseignes (Halles, Rivoli), mobilier urbain partout.
> - Le contraste doit se sentir en marchant : 70 m de large et 300 000 passants aux Champs-Élysées, 10 m de large et personne rue de Varenne, 9 m et des terrasses rue des Francs-Bourgeois.
> - Avant une manifestation à risque, les commerces du parcours baissent leurs rideaux ou posent des panneaux de protection : c'est un indicateur visuel du niveau de tension annoncé.

---

## 7. Casernes et commissariats pouvant servir de base

Aucune compagnie républicaine de sécurité n'a son cantonnement dans l'emprise (non trouvé dans les sources consultées [NT]) : les unités arrivent en colonne de véhicules et stationnent sur la voie publique. Les casernes de l'emprise appartiennent à la **Garde républicaine** (gendarmerie) et à la **Préfecture de police**.

| Base | Adresse | lat ; lon | x ; z (jeu) | Emprise / bâti | Alt. (m) | Usage proposé dans le jeu |
|---|---|---|---|---|---|---|
| Préfecture de police (ancienne caserne de la Cité) | 1 bis rue de Lutèce, 4e — île de la Cité | 48.85437 ; 2.34673 | 1869 ; 1253 | 128 × 96, cour centrale [V S3] | 35,5 | **QG / salle de commandement** : départ des missions « commissaire », « télépilote de drone », briefings |
| Caserne Vérines (Garde républicaine) | 12 place de la République, 10e ; îlot place / rue du Fbg-du-Temple / rue Yves-Toudic / rue Léon-Jouhaux [V S36] | 48.86838 ; 2.36424 | 3152 ; -306 | 119 × 99 [V S3] ; construite en 1854 pour 3 200 hommes [V S36] | 35,4 | **Base est** : façade monumentale sur la place ; point d'appui pour République, Grands Boulevards, canal |
| Quartier des Célestins (état-major de la Garde républicaine, cavalerie) | 18 bd Henri-IV, 4e [P S50] | 48.85099 ; 2.36484 | 3197 ; 1628 | 204 × 201 [V S3] ; construit 1890-1895 [V S36b] | 33,5 | **Base sud-est** : cavalerie (patrouilles montées, écuries), à 400 m de la Bastille |
| Caserne de la Nouvelle-France (Garde républicaine) | 82 rue du Faubourg-Poissonnière, 10e [P] | 48.87667 ; 2.34999 | 2108 ; -1227 | 173 × 72 [V S3] | ≈ 40 | Base nord (bord de l'emprise) |
| Commissariat central du 8e | 1 av. du Général-Eisenhower (dans le Grand Palais) [P S51] | 48.86650 ; 2.31180 | -692 ; -96 | aile du Grand Palais | 32,5 | **Base Champs-Élysées** : au pied de l'avenue, entre Concorde et Rond-point |
| Commissariat central du 7e | 9 rue Fabert (esplanade des Invalides) [P S51] | 48.85970 ; 2.31200 | -677 ; 660 | immeuble d'angle [E] | 32,9 | Base Invalides / Assemblée |
| Commissariat central du 9e | 14 bis rue Chauchat [P S51] | 48.87360 ; 2.34040 | 1405 ; -886 | immeuble [E] | 33,5 | Base Opéra / Grands Boulevards |
| Commissariat de Paris Centre — site Bourdon (ex-4e) | 27 bd Bourdon, 4e [P S51] | 48.85150 ; 2.36660 | 3325 ; 1572 | immeuble [E] | 33,5 | Base Bastille |
| Commissariat de Paris Centre — site rue aux Ours (ex-3e) | 4 bis–6 rue aux Ours, 3e [P S51] | 48.86240 ; 2.35190 | 2248 ; 360 | immeuble [E] | ≈ 36 | Base Beaubourg / Sébastopol |
| Commissariat de Paris Centre — site Croissant (ex-2e) | 18 rue du Croissant, 2e [P S51] | 48.86880 ; 2.34330 | 1617 ; -352 | immeuble [E] | ≈ 36 | Base Bourse / Sentier |
| Commissariat du 6e | 78 rue Bonaparte [P] | 48.85120 ; 2.33300 | 862 ; 1605 | immeuble [E] | 35,0 | Base Saint-Germain / Saint-Sulpice |

Précisions sourcées : le quartier des Célestins est le siège de l'état-major de la Garde républicaine et de son régiment de cavalerie (écuries, escadron hors rang, fanfare) [V S36b] ; la caserne Vérines, bâtie en 1854 sous le nom de caserne du Prince-Eugène puis « du Château-d'Eau », a été renommée en 1947 ; son entrée principale donne sur la place de la République et une entrée secondaire au 2 rue Léon-Jouhaux [V S36] ; elle abrite notamment des ateliers d'artisans de la Garde [P S50]. La Préfecture de police occupe un quadrilatère de 128 × 96 m entre la rue de Lutèce (38 m de large), la rue de la Cité, le quai du Marché-Neuf et le boulevard du Palais [V S3][V S1] ; l'accueil du public se fait aussi place Louis-Lépine [P S51]. Un rapport du Contrôleur général des lieux de privation de liberté porte sur le « site Bourbon du commissariat de Paris centre 4e arrondissement » (vraisemblablement le site du boulevard Bourdon) [P S51] ; un site d'architecture signale l'installation d'un nouveau commissariat de Paris Centre au 14–16 rue Perrée (3e) entre 2020 et 2022, non recoupé [P S51].

**Zones de stationnement des colonnes** (proposition de gameplay [E], choisies pour leur largeur officielle [V S1]) : cours la Reine (74 m) et avenue Winston-Churchill (90 m) pour le secteur Élysée–Concorde ; esplanade des Invalides et quai d'Orsay (29 m) pour l'Assemblée ; avenue Foch (120 m, contre-allées) pour l'Étoile ; place Joffre (450 × 70 m) pour le Champ-de-Mars ; boulevard du Palais (30 m) et rue de Lutèce (38 m) pour la Cité ; boulevard Richard-Lenoir (60 m) pour Bastille ; rue du Faubourg-du-Temple et abords de la caserne Vérines pour République.

> **Ce que le jeu doit reproduire — bases**
> - Trois bases principales aux identités fortes : **Préfecture de police** (commandement, île de la Cité, centre de la carte), **caserne Vérines** (place de la République, extrémité est) et **quartier des Célestins** (cavalerie, Bastille). Pour l'ouest, le **commissariat du 8e** dans le Grand Palais sert de base Champs-Élysées.
> - Temps de ralliement indicatifs en véhicule à 30 km/h sans obstacle [E] : Préfecture → République 2,3 km ≈ 5 min ; Préfecture → Concorde 2,6 km ≈ 5 min ; Préfecture → Étoile 4,9 km ≈ 10 min ; Vérines → Bastille 1,8 km ≈ 4 min.
> - Les CRS, eux, partent d'une **zone de stationnement** sur voirie : alignement de fourgons et de cars le long d'une contre-allée, point de départ naturel de chaque mission.

---

## 8. Sources

Données primaires interrogées directement (le 15 novembre 2026) :

- **[S1]** Ville de Paris, open data, « Dénominations des emprises des voies actuelles » (champs longueur et largeur de chaque voie, pont et place ; 6 625 enregistrements, 1 674 dans l'emprise) — https://opendata.paris.fr/explore/dataset/denominations-emprises-voies-actuelles/information/
- **[S2]** IGN, Géoplateforme, service d'altimétrie, ressource `ign_rge_alti_wld` (altitudes ponctuelles et profils en travers) — https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json ; documentation : https://geoservices.ign.fr/documentation/services/services-geoplateforme/altimetrie
- **[S3]** OpenStreetMap, polygones des bâtiments obtenus par Nominatim (`polygon_geojson=1`), rectangles englobants et azimuts calculés par le documentaliste — https://nominatim.openstreetmap.org/ ; © contributeurs OpenStreetMap, licence ODbL : https://www.openstreetmap.org/copyright
- **[S4]** Préfecture de police, arrêté n° 2020-00649 du 21 août 2020, recueil des actes administratifs spécial n° 75-2020-271 — https://www.prefectures-regions.gouv.fr/ile-de-france/content/download/71876/466603/file/recueil-75-2020-271-recueil%20des%20actes%20administratifs%20special%20du%2021%2008%202020.pdf
- **[S5]** Préfecture de police, arrêté n° 2023-00274 du 20 mars 2023 (copie mise en ligne par la Ligue des droits de l'Homme) — https://www.ldh-france.org/wp-content/uploads/2023/04/3-arrete-du-20-mars-2023.pdf

Parcours et actualité :

- **[S6]** Sortir à Paris, parcours du 15 juin 2024 — https://www.sortiraparis.com/actualites/a-paris/articles/314775-paris-manifestation-contre-l-extreme-droite-ce-samedi-15-juin-le-parcours
- **[S7]** Sortir à Paris, « Concorde, Bastille, République : pourquoi les manifestations ont-elles lieu sur ces places ? » — https://www.sortiraparis.com/actualites/a-paris/articles/290845-concorde-bastille-republique-pourquoi-les-manifestations-ont-elles-lieu-sur-ces-places
- **[S8]** Evous, parcours des manifestations de 2023 — https://www.evous.fr/paris/Vivre-a-Paris/social-crise-chomage-et-conflits/Parcours-manifestation-Paris-reforme-retraites-1195275.html
- **[S43]** Parcours du 2 octobre 2025 — https://www.sortiraparis.com/actualites/a-paris/articles/333739-greve-du-2-octobre-le-parcours-de-la-manifestation-a-paris ; https://france3-regions.franceinfo.fr/paris-ile-de-france/paris/carte-greve-du-2-octobre-decouvrez-le-parcours-de-la-manifestation-a-paris-3225179.html
- **[S44]** Pont de la Concorde et Assemblée — https://www.politis.fr/articles/2016/05/contre-le-49-3-des-centaines-de-manifestants-devant-lassemblee-34687 ; https://www.lalibre.be/dernieres-depeches/2023/03/17/reforme-des-retraites-en-france-nouveau-rassemblement-a-paris-contre-la-reforme-des-retraites-5IVHQH6YLVFZPERPJ6KRBQRLHI/ ; https://questions.assemblee-nationale.fr/dyn/14/questions/QANR5L14QG786.pdf
- **[S47]** Paris Zigzag, abords de l'Élysée — https://www.pariszigzag.fr/?p=149095
- **[S48]** Public Sénat, interdictions de mars 2019 — https://www.publicsenat.fr/actualites/politique/violences-la-reponse-securitaire-du-gouvernement-139326 ; dispositif du 24 janvier 2020 — https://www.api-site.paris.fr/mairies/public/assets/2020%2F0%2FDispositif%20de%20s%C3%A9curisation%20manifestation%20du%20vendredi%2024%20%20janvier%202020.pdf
- **[S49]** Enceinte de la tour Eiffel — https://www.sudradio.fr/societe/le-conseil-de-paris-vote-le-mur-en-verre-autour-de-la-tour-eiffel ; https://world-architects.com/fr/projects/view/maximum-transparency-and-security-to-the-eiffel-tower ; https://www.lechotouristique.com/article/la-tour-eiffel-bientot-protegee-par-un-mur-de-verre-pare-balles,87647
- **[S60]** 1er décembre 2018 — https://www.universalis.fr/evenement/1er-22-decembre-2018-poursuite-du-mouvement-des-gilets-jaunes/ ; https://www.publicsenat.fr/actualites/politique/gilets-jaunes-journee-de-chaos-dans-les-rues-de-paris-macron-indigne-136026
- **[S61]** 16 mars 2019 — https://www.publicsenat.fr/actualites/politique/gilets-jaunes-un-acte-18-marque-par-un-fort-regain-de-violences-a-paris-139269 ; https://www.europe1.fr/societe/gilets-jaunes-saccages-pillages-incendies-volontaires-ce-quil-faut-retenir-de-lacte-18-3875288 ; https://www.lechotouristique.com/article/gilets-jaunes-la-brasserie-le-fouquets-et-les-champs-elysees-saccages
- **[S62]** Parcours imposés à l'automne 2026 — https://www.sortiraparis.com/en/news/in-paris/articles/355206-october-31-demonstration-in-paris-route-modified-by-the-council-of-state-what-areas-are-affected ; https://www.sortiraparis.com/en/news/in-paris/articles/353967-october-17-protest-in-paris-what-route-is-planned-for-the-march-this-saturday ; https://www.dhnet.be/dernieres-depeches/2026/10/30/manifestations-en-france-sept-syndicats-attaquent-en-justice-la-police-sur-le-parcours-a-paris-PAMHJ2YNLJA2LJLV7NKKVTSCDM/
- **[S40]** Notre-Dame, programme 2026-2033 — https://www.batiweb.com/actualites/patrimoine/notre-dame-de-paris-un-nouveau-programme-de-restauration-jusqu-en-2033-49042 ; https://www.rcf.fr/articles/actualite/les-chantiers-de-notredame-de-paris-nen-finissent-pas

Monuments et lieux (Wikipédia en français sauf mention ; texte brut consulté le 15 novembre 2026) :

- **[S9]** Tour Eiffel — https://fr.wikipedia.org/wiki/Tour_Eiffel ; **[S66]** Structurae (décimales des étages) — https://structurae.net/fr/ouvrages/tour-eiffel
- **[S10]** Arc de triomphe de l'Étoile — https://fr.wikipedia.org/wiki/Arc_de_triomphe_de_l%27%C3%89toile ; **[S11]** Place Charles-de-Gaulle — https://fr.wikipedia.org/wiki/Place_Charles-de-Gaulle
- **[S12]** Place de la Concorde — https://fr.wikipedia.org/wiki/Place_de_la_Concorde ; **[S14]** Obélisque de Louxor — https://fr.wikipedia.org/wiki/Ob%C3%A9lisque_de_Louxor ; **[S14b]** Fontaines de la Concorde — https://fr.wikipedia.org/wiki/Fontaines_de_la_Concorde
- **[S58]** Hôtel de Crillon — https://fr.wikipedia.org/wiki/H%C3%B4tel_de_Crillon ; Hôtel de la Marine — https://fr.wikipedia.org/wiki/H%C3%B4tel_de_la_Marine
- **[S13]** Colonne Vendôme — https://fr.wikipedia.org/wiki/Colonne_Vend%C3%B4me ; Place Vendôme — https://fr.wikipedia.org/wiki/Place_Vend%C3%B4me
- **[S15]** Pyramide du Louvre — https://fr.wikipedia.org/wiki/Pyramide_du_Louvre ; **[S16]** Arc de triomphe du Carrousel — https://fr.wikipedia.org/wiki/Arc_de_triomphe_du_Carrousel ; **[S17]** Jardin des Tuileries — https://fr.wikipedia.org/wiki/Jardin_des_Tuileries ; **[S45]** Cour Carrée (site touristique) — https://aroundus.com/p/10437113-cour-carree
- **[S18]** Notre-Dame de Paris — https://fr.wikipedia.org/wiki/Cath%C3%A9drale_Notre-Dame_de_Paris
- **[S20]** Sainte-Chapelle — https://fr.wikipedia.org/wiki/Sainte-Chapelle ; **[S20b]** Conciergerie de Paris — https://fr.wikipedia.org/wiki/Conciergerie_de_Paris ; **[S20c]** Palais de la Cité — https://fr.wikipedia.org/wiki/Palais_de_la_Cit%C3%A9
- **[S21]** Opéra Garnier — https://fr.wikipedia.org/wiki/Op%C3%A9ra_Garnier
- **[S22]** Hôtel des Invalides — https://fr.wikipedia.org/wiki/H%C3%B4tel_des_Invalides ; **[S22b]** Les Invalides (en) — https://en.wikipedia.org/wiki/Les_Invalides ; **[S19]** Esplanade des Invalides — https://fr.wikipedia.org/wiki/Esplanade_des_Invalides
- **[S23]** Grand Palais — https://fr.wikipedia.org/wiki/Grand_Palais_(Paris) ; **[S24]** Petit Palais — https://fr.wikipedia.org/wiki/Petit_Palais ; **[S26]** Pont Alexandre-III — https://fr.wikipedia.org/wiki/Pont_Alexandre-III
- **[S27]** Église de la Madeleine — https://fr.wikipedia.org/wiki/%C3%89glise_de_la_Madeleine ; La Madeleine (en) — https://en.wikipedia.org/wiki/La_Madeleine,_Paris
- **[S69]** Palais Bourbon — https://fr.wikipedia.org/wiki/Palais_Bourbon ; **[S28]** Hôtel de ville de Paris — https://fr.wikipedia.org/wiki/H%C3%B4tel_de_ville_de_Paris
- **[S29]** Colonne de Juillet — https://fr.wikipedia.org/wiki/Colonne_de_Juillet ; **[S32]** Place de la Bastille — https://fr.wikipedia.org/wiki/Place_de_la_Bastille ; **[S59]** Opéra Bastille — https://fr.wikipedia.org/wiki/Op%C3%A9ra_Bastille ; **[S46]** PSS-Archi, Opéra Bastille — https://www.pss-archi.eu/immeubles/FR-75056-520.html
- **[S30]** Monument à la République — https://fr.wikipedia.org/wiki/Monument_%C3%A0_la_R%C3%A9publique ; **[S31]** Place de la République — https://fr.wikipedia.org/wiki/Place_de_la_R%C3%A9publique_(Paris)
- **[S42]** Jardins du Trocadéro — https://fr.wikipedia.org/wiki/Jardins_du_Trocad%C3%A9ro ; Palais de Chaillot — https://fr.wikipedia.org/wiki/Palais_de_Chaillot ; https://en.wikipedia.org/wiki/Palais_de_Chaillot
- **[S70]** École militaire — https://fr.wikipedia.org/wiki/%C3%89cole_militaire_(France) ; **[S25]** Champ-de-Mars — https://fr.wikipedia.org/wiki/Champ-de-Mars_(Paris)
- **[S33]** Centre Pompidou — https://fr.wikipedia.org/wiki/Centre_national_d%27art_et_de_culture_Georges-Pompidou ; **[S34]** Tour Saint-Jacques — https://fr.wikipedia.org/wiki/Tour_Saint-Jacques
- **[S52]** Colonnes de Buren — https://fr.wikipedia.org/wiki/Colonnes_de_Buren ; Palais-Royal — https://fr.wikipedia.org/wiki/Palais-Royal ; **[S53]** Bourse de commerce — https://fr.wikipedia.org/wiki/Bourse_de_commerce_de_Paris
- **[S54]** Panthéon — https://fr.wikipedia.org/wiki/Panth%C3%A9on_(Paris) ; **[S55]** Sacré-Cœur — https://fr.wikipedia.org/wiki/Basilique_du_Sacr%C3%A9-C%C5%93ur_de_Montmartre ; **[S56]** Tour Montparnasse — https://fr.wikipedia.org/wiki/Tour_Montparnasse ; **[S57]** La Défense — https://fr.wikipedia.org/wiki/La_D%C3%A9fense ; Arche de la Défense — https://fr.wikipedia.org/wiki/Arche_de_la_D%C3%A9fense
- **[S35]** Liste des ponts de Paris et fiche de chaque pont — https://fr.wikipedia.org/wiki/Liste_des_ponts_de_Paris ; **[S41]** Seine à Paris — https://fr.wikipedia.org/wiki/Seine_%C3%A0_Paris
- **[S67]** Avenue des Champs-Élysées — https://fr.wikipedia.org/wiki/Avenue_des_Champs-%C3%89lys%C3%A9es ; https://fr.vikidia.org/wiki/Avenue_des_Champs-%C3%89lys%C3%A9es ; **[S65]** Climbfinder (pente) — https://climbfinder.com/us/climbs/avenue-des-champs-elysees
- **[S68]** Palais de l'Élysée — https://fr.wikipedia.org/wiki/Palais_de_l%27%C3%89lys%C3%A9e ; **[S37]** Hôtel de Matignon — https://fr.wikipedia.org/wiki/H%C3%B4tel_de_Matignon ; **[S38]** Hôtel de Beauvau — https://fr.wikipedia.org/wiki/H%C3%B4tel_de_Beauvau ; **[S39]** Ambassade des États-Unis en France — https://fr.wikipedia.org/wiki/Ambassade_des_%C3%89tats-Unis_en_France

Bases, commerces :

- **[S36]** Caserne Vérines — https://fr.wikipedia.org/wiki/Caserne_V%C3%A9rines ; **[S36b]** Caserne des Célestins — https://fr.wikipedia.org/wiki/Caserne_des_C%C3%A9lestins
- **[S50]** Gendarmerie nationale, Garde républicaine — https://www.gendarmerie.interieur.gouv.fr/garde-republicaine/organisation-et-presentations/regiment-de-cavalerie ; https://www.gendarmerie.interieur.gouv.fr/gendinfo/temoignages/adjudant-franck-le-casquier-de-la-garde-republicaine ; adresse des Célestins : https://aroundus.com/p/7431907-
- **[S51]** Commissariats (annuaires) — https://www.evous.fr/paris/Vivre-a-Paris/Droits-police-et-justice/Les-commissariats-de-police-a-Paris-adresses-horaires-services-telephone-1191850.html ; https://www.annuaire-administration.com/commissariat-police/commissariat-central-de-police-de-paris-8e-arrondissement-commissariat-police-75108-01.html ; rapport CGLPL — https://www.cglpl.fr/wp-content/uploads/2021/08/Rapport-de-la-deuxième-visite-du-site-Bourbon-du-commissariat-de-Paris-centre-4e-arrondissement-de-Paris.pdf ; PSS-Archi — https://www.pss-archi.eu/immeubles/FR-75056-78047.html
- **[S63]** Champs-Élysées, fréquentation et commerces — https://autour-de-paris.com/wp-content/uploads/2023/02/DOSSIER-sur-les-comites-de-commercants-Guide-du-8e-2016.pdf ; https://fr.geneawiki.com/wiki/Avenue_des_Champs-Élysées ; https://parisjetaime.com/decouvrir-paris/balades-a-paris/tout-savoir-sur-les-champs-elysees
- **[S64]** Commerces parisiens (Apur, BDCOM 2023, et analyses dérivées) — https://www.apur.org/en/open-data-maps/open-data/bdcom-parisian-retail-database ; https://www.galivel.com/media/files/knight_frank_commerces_paris_versionpresse_compressed.pdf ; https://pariscommerces.fr/fileadmin/Contributeurs/02-Actualites/Diverses_actualites/Actualite/plus-de-210-nouvelles-activites-de-proximite-installees-en-2023/GIE-Paris-Commerces-Rapport-dactivites-volet-territorial-2023.pdf

Sites qui ont bloqué ou n'ont pas répondu : Overpass API (connexion coupée par le proxy, remplacée par Nominatim) ; arrêtés scannés sans couche texte sur cdn.paris.fr et api-site.paris.fr (illisibles sans OCR).

## 9. Points incertains

1. **Origine du monde décalée de ≈ 19 m** par rapport à l'obélisque d'OpenStreetMap (x = −8 ; z = +17). À arbitrer avant de poser les fontaines et les statues de la Concorde (section 3.0).
2. **Pont Alexandre-III** : 160 × 40 m (Ville de Paris), 152 × 30 m (infobox Wikipédia), 45 m de large (texte Wikipédia). La donnée S1 a été retenue. De même **arc du Carrousel** : 14,6 × 19,5 × 6,7 m (Wikipédia fr) contre 19 × 23 × 7,3 m ailleurs ; et **place de la Concorde** : 7,56 ha ou 8,64 ha selon le périmètre compté.
3. **Hauteurs marquées [E]** : hôtels de Gabriel, combles et pavillons du Louvre, dôme du Petit Palais, fronton du Palais Bourbon, campanile de l'Hôtel de Ville, pavillons et ailes de Chaillot, dôme de l'École militaire, coupole de la Bourse de commerce, fontaines de la Concorde, terrasses des Tuileries, diamètre du dôme des Invalides. Aucune source chiffrée trouvée.
4. **Église de la Madeleine** : 108 × 43 m est une valeur courante non retrouvée dans les pages consultées ; seule la hauteur des 52 colonnes (20 m) est sourcée (Wikipédia en anglais).
5. **Composition intérieure des Tuileries**, détails de façade de l'Opéra Garnier (nombre de colonnes et d'arcades), statues au pied du Palais Bourbon, lion du monument à la République : décrits de mémoire documentaire [P], à vérifier sur photos avant modélisation fine.
6. **Orientation des statues sommitales** (République, Génie de la Bastille, statue de la colonne Vendôme) : non trouvée ; les caps du tableau 3.0 pour ces trois lignes sont provisoires.
7. **Tour Eiffel** : teinte actuelle (« jaune-brun » plus doré) non recoupée ; horaires exacts du scintillement en 2026 non vérifiés (le texte source décrit le dispositif de l'an 2000) ; hauteur des parois de verre 2,5 m ou 3 m selon les sources.
8. **Parcours** : le détail rue par rue Invalides → place d'Italie n'a pas été retrouvé ; le parcours Opéra → République vient d'un site agrégateur ; les interdictions de parcours de l'automne 2026 ne sont connues que par des résumés de presse.
9. **Périmètre permanent de l'Élysée** : une seule source de presse, sans arrêté ; conditions actuelles pour les piétons, avenue de Marigny et avenue Gabriel non trouvées.
10. **Commissariats** : adresses issues d'annuaires de 2017-2019 ; l'organisation du commissariat de Paris Centre (sites Bourdon, rue aux Ours, Croissant, éventuel site rue Perrée) n'est pas confirmée par une page officielle ; coordonnées des commissariats à ± 50 m [E].
11. **Cantonnements de CRS** : aucun trouvé dans l'emprise ; non vérifié auprès d'une source officielle.
12. **État 2026 des chantiers** : place de la Concorde (projet de place-jardin), démontage du Grand Palais éphémère, piétonnisation du pont d'Iéna, échafaudages de Notre-Dame : indications partielles.
13. **Altitudes ponctuelles douteuses** : place de la Bastille 39,0–39,2 m au pied de la colonne (probablement le terre-plein) contre ≈ 35–36 m attendus sur la chaussée ; Sacré-Cœur 119 m (IGN au droit du bâtiment) contre 130 m (Wikipédia, sommet de la butte).
14. **Murs de quai, parapets, largeur des îles** : estimations à partir des profils IGN, pas de cote officielle.
15. **Dates de mise en service des ponts** et nombre d'arches de quelques-uns : Wikipédia, non revérifiés un à un.
16. **Ambiance des quartiers** (section 6) : description de terrain non sourcée, hors les quelques chiffres cités ; les emprises en coordonnées jeu sont des rectangles approximatifs.
17. **Stations de métro et de RER** : non étudiées dans ce dossier (à tirer des données OpenStreetMap du jeu) ; leur fermeture préventive par arrêté est un élément de gameplay à documenter.
18. **Toutes les couleurs hexadécimales** sont des propositions.
