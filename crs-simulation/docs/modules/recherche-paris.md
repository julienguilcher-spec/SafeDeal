# Compte rendu — recherche:paris

> Généré automatiquement à partir du rapport de l'étape. Référence pour les développeurs suivants.


## Résumé

Le dossier est écrit (738 lignes, 7 encadrés « Ce que le jeu doit reproduire », sections Sources et Points incertains) ; aucun autre fichier du dépôt n'a été modifié. Il s'appuie sur 23 recherches web et sur trois jeux de données primaires interrogés directement : open data de la Ville de Paris (largeur et longueur officielles de chaque voie, place et pont), altimétrie IGN (altitudes et profils en travers de la Seine) et OpenStreetMap via Nominatim (emprises au sol, avec dimensions et azimuts calculés par rectangle englobant). Deux arrêtés du préfet de police (n° 2020-00649 et n° 2023-00274) donnent le texte exact des périmètres interdits, voie par voie. Chaque monument demandé a une ligne dans le tableau de synthèse (lat/lon, x/z jeu, emprise, azimut de façade, cap `h`, hauteur, altitude) et une fiche descriptive ; les repères hors emprise ont distance et azimut depuis cinq points de vue. Le Sénat est hors emprise (160 m au sud de la limite). Les hauteurs de plusieurs bâtiments, toutes les couleurs hexadécimales et l'ambiance des quartiers restent des estimations, marquées comme telles. Overpass a été bloqué par le proxy (remplacé par Nominatim) et les arrêtés scannés sans couche texte n'ont pas pu être lus.
