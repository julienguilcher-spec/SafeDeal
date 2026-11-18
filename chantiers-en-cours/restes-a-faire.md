# Restes à traiter dans un dernier lot de finitions (noté le 18/11 à 11 h 45)

Carte de commandement (après carte-lisible, v19) :
- Téléphone (844x390), fiche « Bloquer une rue » : la carte reste chargée — phrase d'aperçu longue sur la carte (« Avenue … — personne ne passe, dans les deux sens ») alors que la ligne 1 de la fiche le dit déjà ; noms de lieux du fond de carte sous les étiquettes (ils sont peints dans l'image du fond : src/world/view/map2d.ts devrait exporter leurs boîtes pour pouvoir les masquer).
- Les sous-titres radio (DOM, en haut à gauche de la carte) peuvent recouvrir l'étiquette d'ordre d'une unité pendant quelques secondes.
- Unités spéciales : special.ts copy() perd SquadOrder.place → leur accusé de réception nomme le secteur et non le lieu de la fiche.
- « Y aller » en véhicules : la ligne de suivi nomme la fin du trajet de la colonne, pas le nom de la fiche.

Terrain (lot B, fichiers partagés avec le chantier des commissariats : à faire après sa fusion) :
- Personne debout et immobile devant un suivant de colonne de l'IA : jamais contournée, convoy.thinkRoute ne détache pas le véhicule (reason 'personne').
- Carte « Ma mission » du joueur au volant : « En route — 10 m » lit la distance restante d'un itinéraire périmé du pilote automatique.
- Mission démarrée à l'arrivée du joueur avant que la grande colonne ait fini de se garer : il reste assis jusqu'au débarquement de la journée.
- Ordre de colonne / BRAV-M vers un point au-delà du bord de la carte (non reproduit).
- ecole-02 dure 600 s : vérifier qu'il n'y a pas de temps mort.
- Compte rendu : vérifier qu'aucun autre texte ne donne un niveau de force en chiffre.

## Ajouts du 18/11 à 13 h 15 (joueur critique des commissariats, campagne du commandant tour 2)
- Préfecture (Cité), joueur sur place : quatre engins qui rentrent en même temps se gênent sur le boulevard du Palais (manœuvre de stationnement du pilote automatique + arrivée « en file » de la colonne) ; rangés dès que le joueur est à plus de 160 m.
- 9e, joueur sur place : une moto BRAV-M peut rester 3 m derrière la dernière place.
- engins.ts : un véhicule de police gêné par des piétons allume sa sirène et la garde pour tout le trajet, même au retour « sans deux-tons ».
- Point inaccessible près du bord de la carte (ex. rue Biscornet depuis les Célestins) : le peloton débarque à ses places et reste « En alerte », sans aucun message au joueur.
- Voiture de Police secours envoyée depuis un commissariat : « OÙ L'ENVOYER ? » parle de « boucliers levés » et propose « Tenir une ligne » (texte générique, faux pour trois policiers en voiture).
- Rôles en lecture seule : pas d'accès à « Plus… › Commissariats » depuis la fiche (C fait défiler les postes).
- Réseau de commandement saturé : CENTRAL répète « URGENT. Automobiliste bloqué… » toutes les 10 s ; les comptes rendus de priorité 1 attendent plus de 90 s et sont écartés.
- BLOQUANT : « Toute la compagnie » en véhicules à la Concorde (graine 21) : le canon à eau en tête de file reste « bloqué mur », toute la colonne attend derrière lui indéfiniment (convoy.thinkRoute ne décroche que les véhicules i ≥ 1).
