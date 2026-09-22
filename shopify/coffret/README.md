# Le composeur de coffret — Maison Bosoni

Section Shopify `mb-coffret` : la boîte du coffret en 3D (Three.js r128), le papier de soie,
et les flacons du catalogue qui viennent se coucher dedans à leur vraie taille. Le rangement
refuse ce qui ne rentre plus (plancher utile 244 × 244 mm, hauteur utile 118 mm).

- `theme/assets/mb-coffret.js` — fichier livré au thème (formes + décor + moteur concaténés, dans cet ordre)
- `theme/assets/mb-coffret.css`, `theme/sections/mb-coffret.liquid`, `theme/templates/page.coffret.json`
- `mb-coffret-formes.js` — silhouettes relevées au pixel sur les photos des producteurs, dimensions en mm
- `mb-coffret-decor.js` — tout ce qui entoure la boîte : lumière, table de marbre et son reflet, l'oliveraie en volume (sol, dallage, oliviers, ciel, brume), entièrement procédural
- `mb-coffret.app.js` — le moteur (scène, boîte, soie, rangement, interface)
- `harnais.html` — page d'essai locale (`?ajoute=P-500,B-A100&vue=dessus`)

Le mot personnalisé (« Un mot pour l'accompagner », 160 caractères) se dessine en direct sur la carte
crème au fond de la boîte et part dans le panier comme propriété `Mot personnalisé` de chaque article.

Le thème charge `assets/three.min.js` (r128, depuis cdnjs) avant `mb-coffret.js`.
