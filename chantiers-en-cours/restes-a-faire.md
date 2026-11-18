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
