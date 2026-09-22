/* Maison Bosoni — le composeur de coffret : les formes.
 *
 * Chaque référence est décrite par sa vraie silhouette, relevée au pixel sur
 * les photos des producteurs (61 rayons de haut en bas, en fraction du rayon
 * maximal), et par ses dimensions en millimètres. Les hauteurs Piro et Bonini
 * sont déduites du volume et des proportions : à confirmer au pied à coulisse.
 * La clé est la référence (SKU) de la variante Shopify. */
window.MB_FORMES = (function () {
  function lin(a, b, n) { const r = []; for (let i = 0; i < n; i++) r.push(+(a + (b - a) * i / (n - 1)).toFixed(3)); return r; }

  const piro100 = [0.01,0.688,0.739,0.742,0.742,0.746,0.746,0.753,0.729,0.719,0.722,0.725,0.725,0.722,0.725,0.729,0.742,0.712,0.729,0.732,0.732,0.739,0.688,0.959,0.959,0.963,0.966,0.963,0.963,0.963,0.963,0.963,0.963,0.963,0.963,0.963,0.963,0.963,0.963,0.963,0.966,0.966,0.966,0.966,0.966,0.966,0.969,0.969,0.969,0.969,0.969,0.969,0.973,0.973,0.976,0.976,0.983,0.986,0.983,0.949,0.22];
  const piro250 = [0.01,0.463,0.466,0.466,0.466,0.466,0.466,0.463,0.459,0.429,0.422,0.422,0.426,0.436,0.436,0.443,0.449,0.459,0.433,0.476,0.483,0.497,0.473,0.429,0.99,0.997,1.0,0.997,0.993,0.993,0.99,0.99,0.99,0.99,0.99,0.99,0.99,0.99,0.99,0.99,0.99,0.99,0.99,0.99,0.99,0.99,0.99,0.99,0.99,0.99,0.99,0.987,0.983,0.976,0.963,0.929,0.889,0.822,0.73,0.703,0.18];
  const piro500 = [0.02,0.39,0.39,0.39,0.39,0.39,0.38,0.34,0.33,0.33,0.34,0.34,0.34,0.34,0.34,0.37,0.40,0.41,0.39,0.66,0.98,0.99,0.99,0.99,0.99,0.99,0.99,0.99,0.99,0.99,0.99,0.99,0.99,0.99,0.99,0.99,0.99,0.99,0.99,0.99,0.99,0.99,0.99,0.99,0.99,0.99,1.0,1.0,1.0,1.0,1.0,0.99,0.99,0.98,0.97,0.94,0.90,0.83,0.74,0.73,0.20];
  const cucino750 = [0.04,0.47,0.47,0.46,0.47,0.52,0.82,0.70,0.97,0.97,0.97,0.97,0.97,0.97,0.97,0.97,0.97,0.97,0.97,0.97,0.97,0.97,0.97,0.97,0.97,0.97,0.97,0.97,0.97,0.97,0.97,0.97,0.97,0.97,0.97,0.97,0.97,0.97,0.97,0.97,0.97,0.97,0.97,0.97,0.97,0.97,0.97,0.97,0.97,0.96,0.96,0.96,0.97,0.97,0.97,0.99,0.99,0.96,0.88,0.68,0.01];
  // Bordelaise Bonini 250 ml : relevé nettoyé (le reflet du verre trouait la mesure sur l'épaule)
  const bordelaise = [0.10,0.53,0.53,0.53,0.53,0.53,0.47,0.47,0.47,0.47,0.47,0.47,0.47,0.47,0.47,0.47,0.47,0.47,0.47,0.48,0.50,0.55,0.72,0.84,0.90,0.93,0.95,0.96].concat(lin(0.97, 1.0, 30)).concat([0.98,0.92,0.12]);
  // Flacon Giugiaro : silhouette de face ; le volume est aplati en profondeur (rapport T/W)
  const flacon = [0.0,0.21,0.22,0.22,0.22,0.22,0.22,0.23,0.23,0.19,0.19,0.19,0.20,0.20,0.20,0.22,0.27,0.45,0.56,0.66,0.72,0.75,0.79,0.82,0.85,0.88,0.90,0.92,0.93,0.95,0.95,0.97,0.97,0.98,0.99,0.99,1.0,1.0,1.0,1.0,1.0,0.99,0.99,0.98,0.97,0.97,0.96,0.94,0.93,0.91,0.89,0.87,0.84,0.82,0.79,0.76,0.72,0.65,0.56,0.49,0.10];

  const PIRO = function (H, D, coupes, etiq, contenance) {
    return { type: 'lathe', matiere: 'verre', H: H, D: D, coupes: coupes, etiq: etiq,
             profil: H === 156 ? piro100 : (H === 148 ? piro250 : piro500),
             texte: { haut1: 'HIGH ANTIOXIDANT*', haut2: 'EXTRA VIRGIN OLIVE OIL', nom: 'Piro.', bas1: 'PRODUCT OF ITALY', bas2: contenance + '  *Vitamin E' },
             fond: '#FBFAF7', encre: '#1b1a18', or: '#8c7534' };
  };
  const BORD = function (numero, nom) {
    return { type: 'lathe', matiere: 'verre-noir', H: 189, D: 54, coupes: [5, 18], etiq: [0.60, 0.90, 62], profil: bordelaise,
             texte: { haut1: '', haut2: 'BONINI', nom: numero, bas1: nom, bas2: 'CONDIMENTO · MODENA' },
             fond: '#100d0b', encre: '#c9a45a', or: '#c9a45a', direct: true };
  };
  const FLAC = function (W, H, T, numero, nom, dop) {
    return { type: 'flacon', matiere: 'verre-noir', W: W, H: H, T: T, coupes: [16], profil: flacon,
             texte: dop ? { haut1: 'ACETO BALSAMICO', haut2: 'TRADIZIONALE DI MODENA D.O.P.', nom: numero, bas1: nom, bas2: 'BONINI' }
                        : { haut1: '', haut2: 'BONINI', nom: numero, bas1: nom, bas2: '' },
             fond: dop ? '#F3EADB' : '#100d0b', encre: dop ? '#6b1f2a' : '#c9a45a', or: '#c9a45a', direct: !dop };
  };

  return {
    'P-100':  PIRO(156, 37.5, [7, 17], [0.435, 0.935, 50], '3.4 fl oz (100 mL)'),
    'P-250':  PIRO(148, 62.1, [8, 18], [0.461, 0.861, 60], '8.45 fl oz (250 mL)'),
    'P-500':  PIRO(184, 75.8, [7, 15], [0.418, 0.814, 55], '16.9 fl oz (500 mL)'),
    'P-750':  { type: 'lathe', matiere: 'etain', H: 202, D: 71.2, coupes: [2, 8], etiq: [0.46, 0.86, 60], profil: cucino750,
                texte: { haut1: 'HEAT FRIENDLY*', haut2: 'EXTRA VIRGIN OLIVE OIL', nom: 'Cucino.', bas1: 'PRODUCT OF ITALY', bas2: '25.3 fl oz (750 mL)  *up to 380 F' },
                fond: '#FBFAF7', encre: '#1b1a18', or: '#8c7534' },
    'B-V250': BORD('03', 'VIVACE'),
    'B-G250': BORD('08', 'GUSTOSO'),
    'B-A250': BORD('12', 'AFFINATO'),
    'B-S250': BORD('25', 'STRAVECCHIO'),
    'B-A100': FLAC(85, 108, 42, '12', 'AFFINATO'),
    'B-S100': FLAC(85, 108, 42, '25', 'STRAVECCHIO'),
    'B-R100': FLAC(85, 108, 42, '50', 'RISERVA'),
    'B-A40':  FLAC(62, 79, 30, '12', 'AFFINATO'),
    'B-S40':  FLAC(62, 79, 30, '25', 'STRAVECCHIO'),
    'B-R40':  FLAC(62, 79, 30, '50', 'RISERVA'),
    'B-PDO12': FLAC(85, 108, 42, '12', 'ANNI', true),
    'B-PDO25': FLAC(85, 108, 42, '25', 'ANNI', true),
    'B-COLL': { type: 'boite', L: 175, W: 45, H: 40,
                texte: { haut1: '', haut2: 'BONINI', nom: 'Collection', bas1: '03 · 08 · 12 · 25 · 50', bas2: '' },
                fond: '#100d0b', encre: '#c9a45a', or: '#c9a45a' }
  };
})();
