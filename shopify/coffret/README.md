# Le composeur de coffret — Maison Bosoni

Section Shopify `mb-coffret` : la boîte du coffret en 3D (Three.js r128), le papier de soie,
et les flacons du catalogue qui viennent se coucher dedans à leur vraie taille. Le rangement
refuse ce qui ne rentre plus (plancher utile 244 × 244 mm, hauteur utile 118 mm).

- `theme/assets/mb-coffret.js` — fichier livré au thème (formes + moteur concaténés)
- `theme/assets/mb-coffret.css`, `theme/sections/mb-coffret.liquid`, `theme/templates/page.coffret.json`
- `mb-coffret-formes.js` — silhouettes relevées au pixel sur les photos des producteurs, dimensions en mm
- `mb-coffret.app.js` — le moteur (scène, boîte, soie, rangement, interface)
- `harnais.html` — page d'essai locale (`?ajoute=P-500,B-A100&vue=dessus`)

Le thème charge `assets/three.min.js` (r128, depuis cdnjs) avant `mb-coffret.js`.
