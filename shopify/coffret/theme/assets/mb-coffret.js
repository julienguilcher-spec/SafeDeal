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

/* Maison Bosoni — le décor du composeur : tout ce qui entoure la boîte.
 *
 * La boîte, les flacons et le papier de soie vivent dans mb-coffret.app.js.
 * Ici : la lumière, la table de marbre blanc avec son reflet, et le paysage
 * autour, une oliveraie construite en volume. Les distances sont en
 * millimètres, l'origine est au centre du fond de la boîte, y vers le haut,
 * la caméra par défaut regarde depuis +z (devant) et un peu depuis -x.
 *
 * Le paysage : « la clairière du verger ». La table est posée sur un petit
 * promontoire fauché ; le terrain descend derrière et sur les côtés vers
 * une terrasse bordée d'un vieux mur de pierres sèches, puis le verger
 * d'oliviers dévale la pente jusqu'à un vallon dans la brume, dont la crête
 * d'en face porte une ligne de cyprès. Deux oliviers proches encadrent la
 * table ; celui de gauche, entre le soleil et la boîte, pose l'ombre de ses
 * feuilles sur le marbre. Tout est procédural : géométries Three.js et
 * textures dessinées dans des canvas. */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /*  La lumière : un soleil de fin d'après-midi venant de l'arrière     */
  /*  gauche, un ciel clair, et les petites lampes qui dessinent les     */
  /*  arêtes de la boîte.                                                 */
  /* ------------------------------------------------------------------ */
  function lumieres(moi, o) {
    const T = o.T, s = moi.s;
    s.add(new T.HemisphereLight(0xdfe6ee, 0xcbbf9e, 0.32));
    const soleil = new T.DirectionalLight(0xffefd4, 1.45);
    /* même direction qu'avant (arrière gauche, 41° de hauteur), mais placé
       plus loin pour que la couronne de l'olivier proche entre dans la
       caméra d'ombre et projette ses feuilles sur le marbre */
    soleil.position.set(-380 * 7, 500 * 7, -430 * 7); soleil.castShadow = true;
    soleil.shadow.mapSize.set(2048, 2048);
    soleil.shadow.camera.near = 100; soleil.shadow.camera.far = 9000;
    soleil.shadow.camera.left = -1700; soleil.shadow.camera.right = 1700; soleil.shadow.camera.top = 1900; soleil.shadow.camera.bottom = -2400;
    soleil.shadow.camera.updateProjectionMatrix();
    soleil.shadow.bias = -0.0004; soleil.shadow.normalBias = 1.5; soleil.shadow.radius = 2;
    s.add(soleil);
    moi.soleil = soleil;
    const rimG = new T.DirectionalLight(0xfff8ec, 0.5); rimG.position.set(-620, 300, -300); s.add(rimG);
    const rimD = new T.DirectionalLight(0xf6eedd, 0.45); rimD.position.set(600, 240, -320); s.add(rimD);
    const face = new T.DirectionalLight(0xfff6ea, 0.35); face.position.set(180, 520, 760); s.add(face);
  }

  /* ------------------------------------------------------------------ */
  /*  La table : un plateau de marbre blanc poli, 1,80 m sur 0,53 m,     */
  /*  30 mm d'épais. Le bord arrière est à 200 mm derrière la boîte.      */
  /* ------------------------------------------------------------------ */
  function table(moi, o, TABLE) {
    const T = o.T, BOITE = o.BOITE, s = moi.s, d = moi.donnees.decor || {};
    const marbre = new T.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.14, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 0.45 });
    const chant = new T.MeshPhysicalMaterial({ color: 0xf1ede5, roughness: 0.28, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.2, envMapIntensity: 0.5 });
    const plateau = new T.Mesh(new T.BoxGeometry(TABLE.L, TABLE.E, TABLE.P), [chant, chant, marbre, chant, chant, chant]);
    plateau.position.set(0, -BOITE.paroi - TABLE.E / 2, TABLE.z);
    plateau.receiveShadow = true; plateau.castShadow = true;
    s.add(plateau);
    if (d.marbre) plateauMarbre(moi, o, d.marbre, TABLE, marbre);
    return plateau;
  }

  /* le marbre est dessiné dans une toile à l'échelle de la table, une dalle
     d'un mètre pour chaque tuile de la texture */
  function plateauMarbre(moi, o, url, TABLE, materiau) {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = function () {
      const W = 2048, H = Math.round(W * TABLE.P / TABLE.L), pxParMm = W / TABLE.L, tuile = Math.round(1000 * pxParMm);
      const t = o.toile(W, H, function (g) {
        for (let x = 0; x < W; x += tuile) for (let y = 0; y < H; y += tuile) g.drawImage(img, x, y, tuile, tuile);
      });
      t.anisotropy = 16;
      materiau.map = t; materiau.needsUpdate = true;
      moi.redessine();
    };
    img.src = url;
  }

  /* ------------------------------------------------------------------ */
  /*  Le reflet : la scène est rendue une seconde fois depuis la caméra  */
  /*  symétrique par rapport au plateau, et ce rendu est posé sur le     */
  /*  marbre avec une transparence qui suit l'angle de vue, comme un     */
  /*  vrai poli.                                                          */
  /* ------------------------------------------------------------------ */
  function miroir(moi, o, TABLE) {
    const T = o.T, BOITE = o.BOITE, y0 = -BOITE.paroi + 0.25;
    const rt = new T.WebGLRenderTarget(1024, 1024);
    rt.texture.encoding = T.sRGBEncoding;
    const mat = new T.ShaderMaterial({
      uniforms: { tReflet: { value: rt.texture }, matriceTexture: { value: new T.Matrix4() }, force: { value: 0.62 } },
      vertexShader: 'uniform mat4 matriceTexture; varying vec4 vUvR; varying vec3 vN; varying vec3 vV;' +
        'void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vUvR = matriceTexture * wp;' +
        ' vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz);' +
        ' gl_Position = projectionMatrix * viewMatrix * wp; }',
      fragmentShader: 'uniform sampler2D tReflet; uniform float force; varying vec4 vUvR; varying vec3 vN; varying vec3 vV;' +
        'void main(){ vec3 c = texture2DProj(tReflet, vUvR).rgb; float f = pow(1.0 - max(dot(vN, vV), 0.0), 3.0);' +
        ' gl_FragColor = vec4(c, force * (0.3 + 0.7 * f)); }',
      transparent: true, depthWrite: false
    });
    mat.toneMapped = false;
    const plan = new T.Mesh(new T.PlaneGeometry(TABLE.L, TABLE.P), mat);
    plan.rotation.x = -Math.PI / 2; plan.position.set(0, y0, TABLE.z); plan.renderOrder = 2;
    moi.s.add(plan);

    const camV = new T.PerspectiveCamera(), normale = new T.Vector3(0, 1, 0), origine = new T.Vector3(0, y0, TABLE.z);
    const posCam = new T.Vector3(), vue = new T.Vector3(), cible = new T.Vector3(), rot = new T.Matrix4(), regard = new T.Vector3();
    const planClip = new T.Plane(), clip = new T.Vector4(), q = new T.Vector4();
    return {
      rendre: function (cam) {
        posCam.setFromMatrixPosition(cam.matrixWorld);
        vue.subVectors(origine, posCam);
        if (vue.dot(normale) > 0) return;                  // caméra sous la table
        vue.reflect(normale).negate().add(origine);
        rot.extractRotation(cam.matrixWorld);
        regard.set(0, 0, -1).applyMatrix4(rot).add(posCam);
        cible.subVectors(origine, regard).reflect(normale).negate().add(origine);
        camV.position.copy(vue);
        camV.up.set(0, 1, 0).applyMatrix4(rot).reflect(normale);
        camV.lookAt(cible);
        camV.near = cam.near; camV.far = cam.far;
        camV.updateMatrixWorld();
        camV.projectionMatrix.copy(cam.projectionMatrix);
        mat.uniforms.matriceTexture.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
          .multiply(camV.projectionMatrix).multiply(camV.matrixWorldInverse);
        /* plan de coupe oblique : rien de ce qui est sous le plateau n'entre dans le reflet */
        planClip.setFromNormalAndCoplanarPoint(normale, origine).applyMatrix4(camV.matrixWorldInverse);
        clip.set(planClip.normal.x, planClip.normal.y, planClip.normal.z, planClip.constant);
        const pm = camV.projectionMatrix;
        q.x = (Math.sign(clip.x) + pm.elements[8]) / pm.elements[0];
        q.y = (Math.sign(clip.y) + pm.elements[9]) / pm.elements[5];
        q.z = -1; q.w = (1 + pm.elements[10]) / pm.elements[14];
        clip.multiplyScalar(2 / clip.dot(q));
        pm.elements[2] = clip.x; pm.elements[6] = clip.y; pm.elements[10] = clip.z + 1 - 0.003; pm.elements[14] = clip.w;
        plan.visible = false;
        const r = moi.r;
        r.setRenderTarget(rt); r.setClearColor(0xe6dfd0, 1); r.clear(); r.render(moi.s, camV);
        r.setRenderTarget(null); r.setClearColor(0x000000, 0);
        plan.visible = true;
      }
    };
  }

  /* ------------------------------------------------------------------ */
  /*  Le paysage : l'oliveraie en volume autour de la table.             */
  /* ------------------------------------------------------------------ */
  function paysage(moi, o, TABLE) {
    const T = o.T, s = moi.s, RAD = o.RAD;

    /* ---- un hasard reproductible, pour que le paysage soit le même à chaque visite */
    let graine = 20240917;
    function alea() { graine |= 0; graine = graine + 0x6D2B79F5 | 0; let t = Math.imul(graine ^ graine >>> 15, 1 | graine); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
    function entre(a, b) { return a + (b - a) * alea(); }
    function Alea(g0) { let g = g0 | 0; return function () { g = g + 0x6D2B79F5 | 0; let t = Math.imul(g ^ g >>> 15, 1 | g); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
    function lisse(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
    function melange(a, b, k) { return a + (b - a) * k; }
    function borne(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

    /* ---- le soleil : d'où vient la lumière, où tombent les ombres */
    const SOL_DIR = new T.Vector3(-380, 500, -430).normalize();          // vers le soleil
    const OMBRE_DX = 380 / 500, OMBRE_DZ = 430 / 500;                     // déport de l'ombre par mm de hauteur
    const BRUME = '#e8e0cf', BRUME_HEX = 0xe8e0cf;                        // la couleur de l'air à l'horizon

    /* ================================================================== */
    /*  1. Le relief                                                       */
    /*  Un belvédère plat (ellipse 3,6 × 3,3 m) autour de la table, un     */
    /*  rebord arrondi, une pente à 38°, une terrasse avec son mur, puis   */
    /*  le verger qui descend vers un vallon ; la pente d'en face remonte  */
    /*  au loin, sous la ligne d'horizon, dans la brume.                   */
    /* ================================================================== */
    /* le plateau s'étend plus loin derrière la table (à -2150) que devant
       (+1590) : depuis la caméra, le sol visible derrière la boîte est ainsi
       du sol plat, vu de haut, et non une pente vue dans son plan */
    const AX = 1800, AZ = 1870, ZC = -280, K_SM = 2131;
    /* les arbres et le mur sont placés dans le repère elliptique d'origine
       (1640, -50), pour que la composition retenue ne bouge pas */
    const AZ_ARB = 1640, ZC_ARB = -50;
    const monticules = [];                                                // petites buttes au pied des arbres
    function ellipse(x, z) { const dx = x / AX, dz = (z - ZC) / AZ; return Math.sqrt(dx * dx + dz * dz); }
    function bruit(x, z) {
      return Math.sin(x / 1300 + 0.4) * Math.sin(z / 1700 - 0.2) * 0.5 + Math.sin(x / 430 + z / 510) * 0.3 + Math.sin(x / 210 - z / 260 + 1.3) * 0.2;
    }
    const S_PENTE = 4420, S_TERRASSE = 5270, S_MUR = 5525, CHUTE_PENTE = 3114, CHUTE_TERRASSE = 3267, CHUTE_MUR = 4517;
    function chute(sm) {
      if (sm <= 0) return 0;
      if (sm < S_PENTE) return 0.8 * sm * sm / (sm + 600);                                   // rebord arrondi puis 38°
      if (sm < S_TERRASSE) return CHUTE_PENTE + (sm - S_PENTE) * 0.18;                        // la terrasse, presque plate
      if (sm < S_MUR) { const k = (sm - S_TERRASSE) / (S_MUR - S_TERRASSE); return CHUTE_TERRASSE + (CHUTE_MUR - CHUTE_TERRASSE) * k * k * (3 - 2 * k); } // le mur
      const d = CHUTE_MUR + 0.8 * (sm - S_MUR);
      return CHUTE_MUR + 2600 * Math.tanh((d - CHUTE_MUR) / 2600);                            // le verger descend, puis le fond du vallon
    }
    function hauteurBrute(x, z) {
      const u = ellipse(x, z), sm = Math.max(0, u - 1) * K_SM;
      const r = Math.sqrt(x * x + z * z);
      const montee = 3200 * lisse(15000, 34000, r);
      const b = bruit(x, z) * 170 * lisse(250, 1400, sm);
      return -750 - chute(sm) + montee + b;
    }
    function hauteur(x, z) {
      let h = hauteurBrute(x, z);
      for (let i = 0; i < monticules.length; i++) {
        const m = monticules[i], dx = x - m.x, dz = z - m.z, q = (dx * dx + dz * dz) / (m.r * m.r);
        if (q < 6) h += m.h * Math.exp(-q);
      }
      return h;
    }

    /* ================================================================== */
    /*  2. Les textures, toutes dessinées                                  */
    /* ================================================================== */
    function corrigeFrange(canvas, r, g, b) {
      /* les pixels transparents prennent la couleur des feuilles, pour que le
         filtrage ne fasse pas de liseré sombre sur les bords */
      const ctx = canvas.getContext('2d'), im = ctx.getImageData(0, 0, canvas.width, canvas.height), d = im.data;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] < 6) { d[i] = r; d[i + 1] = g; d[i + 2] = b; }
      ctx.putImageData(im, 0, 0);
    }
    function toileCorrigee(w, h, dessin, r, g, b) {
      const t = o.toile(w, h, dessin);
      corrigeFrange(t.image, r, g, b); t.needsUpdate = true;
      return t;
    }
    function repete(t) { t.wrapS = t.wrapT = T.RepeatWrapping; return t; }
    /* une carte de normales calculée depuis une toile de hauteurs (canal rouge) */
    function normaleDepuis(src, force, repeter) {
      const W = src.width, H = src.height, d = src.getContext('2d').getImageData(0, 0, W, H).data;
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const g2 = c.getContext('2d'), out = g2.createImageData(W, H), od = out.data;
      function h(x, y) { return d[(((y + H) % H) * W + ((x + W) % W)) * 4]; }
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const dx = (h(x + 1, y) - h(x - 1, y)) * force, dy = (h(x, y + 1) - h(x, y - 1)) * force;
        const l = Math.sqrt(dx * dx + dy * dy + 1), k = (y * W + x) * 4;
        od[k] = 128 - dx / l * 127; od[k + 1] = 128 + dy / l * 127; od[k + 2] = 128 + 127 / l; od[k + 3] = 255;
      }
      g2.putImageData(out, 0, 0);
      const t = new T.CanvasTexture(c); t.anisotropy = 8;
      if (repeter) t.wrapS = t.wrapT = T.RepeatWrapping;
      return t;
    }

    /* -- le ciel : fin d'après-midi, bleu-gris doux au zénith, brume claire
          à l'horizon, soleil voilé à l'arrière gauche, crêtes lointaines */
    const texCiel = o.toile(1024, 512, function (g, W, H) {
      const R = Alea(7);
      const grad = g.createLinearGradient(0, 0, 0, H / 2);
      grad.addColorStop(0, '#9db3c8'); grad.addColorStop(0.35, '#bfcfda'); grad.addColorStop(0.7, '#dcdfd9'); grad.addColorStop(0.9, '#e9e2d2'); grad.addColorStop(1, BRUME);
      g.fillStyle = grad; g.fillRect(0, 0, W, H / 2);
      g.fillStyle = BRUME; g.fillRect(0, H / 2, W, H / 2);
      /* le soleil, voilé, à l'arrière gauche */
      const sx = 886, sy = 138;
      const halo = g.createRadialGradient(sx, sy, 4, sx, sy, 260);
      halo.addColorStop(0, 'rgba(255,248,226,0.98)'); halo.addColorStop(0.2, 'rgba(255,240,208,0.6)'); halo.addColorStop(1, 'rgba(255,236,200,0)');
      g.fillStyle = halo; g.fillRect(sx - 270, sy - 270, 540, 540);
      /* quelques voiles de nuages étirés */
      for (let i = 0; i < 30; i++) {
        const y = 30 + R() * 160, x = R() * W, w = 60 + R() * 240, h = 4 + R() * 10;
        const c = g.createRadialGradient(x, y, 1, x, y, w);
        c.addColorStop(0, 'rgba(250,246,238,0.38)'); c.addColorStop(1, 'rgba(250,246,238,0)');
        g.save(); g.translate(x, y); g.scale(1, h / w); g.translate(-x, -y); g.fillStyle = c; g.fillRect(x - w, y - w, 2 * w, 2 * w); g.restore();
      }
      /* les crêtes lointaines, en couches de plus en plus pâles */
      const couches = [{ y: 20, c: 'rgba(168,178,180,0.5)', amp: 8 }, { y: 12, c: 'rgba(192,196,192,0.55)', amp: 6 }, { y: 6, c: 'rgba(214,212,202,0.6)', amp: 4 }];
      couches.forEach(function (cc, ci) {
        g.fillStyle = cc.c; g.beginPath(); g.moveTo(0, H / 2 + 1);
        for (let x = 0; x <= W; x += 4) {
          const y = H / 2 - cc.y + cc.amp * Math.sin(x / (37 + ci * 11) + ci) + cc.amp * 0.6 * Math.sin(x / 13 + ci * 3) + 2 * Math.sin(x / 5);
          g.lineTo(x, y);
        }
        g.lineTo(W, H / 2 + 1); g.closePath(); g.fill();
      });
    });
    texCiel.mapping = T.UVMapping;

    /* -- l'écorce de l'olivier : gris brun, fibreuse, fendillée verticalement,
          quelques nœuds ; carte de couleur + carte de normales */
    const texEcorce = (function () {
      const R = Alea(31), W = 512, H = 1024;
      const hc = document.createElement('canvas'); hc.width = W; hc.height = H;
      const hg = hc.getContext('2d');
      hg.fillStyle = 'rgb(150,150,150)'; hg.fillRect(0, 0, W, H);
      const map = o.toile(W, H, function (g) {
        g.fillStyle = '#7a6f62'; g.fillRect(0, 0, W, H);
        for (let k = 0; k < 140; k++) {
          const x = R() * W, w = 4 + R() * 16, lum = R() < 0.5, pente = (R() - 0.5) * 0.25;
          g.fillStyle = lum ? 'rgba(168,156,140,' + (0.1 + R() * 0.2) + ')' : 'rgba(52,44,38,' + (0.1 + R() * 0.2) + ')';
          hg.fillStyle = lum ? 'rgba(200,200,200,0.35)' : 'rgba(100,100,100,0.35)';
          [x, x - W, x + W].forEach(function (xx) {
            g.beginPath(); g.moveTo(xx, 0); g.lineTo(xx + w, 0); g.lineTo(xx + w + pente * H, H); g.lineTo(xx + pente * H, H); g.closePath(); g.fill();
            hg.beginPath(); hg.moveTo(xx, 0); hg.lineTo(xx + w, 0); hg.lineTo(xx + w + pente * H, H); hg.lineTo(xx + pente * H, H); hg.closePath(); hg.fill();
          });
        }
        g.lineCap = 'round'; hg.lineCap = 'round';
        for (let k = 0; k < 60; k++) {
          const x0 = R() * W, amp = 5 + R() * 12, f = 0.004 + R() * 0.008, ph = R() * 6.28, w = 2 + R() * 3.5, a = 0.4 + R() * 0.4, pente = (R() - 0.5) * 0.2;
          const yA = R() < 0.5 ? -10 : R() * H * 0.5, yB = R() < 0.5 ? H + 10 : H * 0.5 + R() * H * 0.5;
          [0, -W, W].forEach(function (off) {
            g.strokeStyle = 'rgba(38,32,27,' + a + ')'; g.lineWidth = w; g.beginPath();
            for (let y = yA; y <= yB; y += 10) { const x = x0 + off + pente * y + Math.sin(y * f + ph) * amp; if (y === yA) g.moveTo(x, y); else g.lineTo(x, y); }
            g.stroke();
            g.strokeStyle = 'rgba(178,166,150,' + (a * 0.6) + ')'; g.lineWidth = w * 0.9; g.beginPath();
            for (let y = yA; y <= yB; y += 10) { const x = x0 + off + w + 1.5 + pente * y + Math.sin(y * f + ph) * amp; if (y === yA) g.moveTo(x, y); else g.lineTo(x, y); }
            g.stroke();
            hg.strokeStyle = 'rgba(40,40,40,0.9)'; hg.lineWidth = w + 3; hg.beginPath();
            for (let y = yA; y <= yB; y += 10) { const x = x0 + off + pente * y + Math.sin(y * f + ph) * amp; if (y === yA) hg.moveTo(x, y); else hg.lineTo(x, y); }
            hg.stroke();
          });
        }
        for (let k = 0; k < 160; k++) {
          const x = R() * W, y = R() * H, l = 4 + R() * 14;
          g.strokeStyle = 'rgba(50,44,38,' + (0.3 + R() * 0.4) + ')'; g.lineWidth = 1 + R() * 1.5;
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y + (R() - 0.5) * 6); g.stroke();
        }
        for (let k = 0; k < 7; k++) {
          const x = R() * W, y = R() * H, rx = 14 + R() * 22, ry = 20 + R() * 34;
          for (let r = 1; r >= 0.15; r -= 0.17) {
            g.strokeStyle = r > 0.5 ? 'rgba(60,52,44,0.5)' : 'rgba(140,128,114,0.4)'; g.lineWidth = 2;
            g.beginPath(); g.ellipse(x, y, rx * r, ry * r, 0.3, 0, 6.29); g.stroke();
          }
          hg.fillStyle = 'rgba(210,210,210,0.8)'; hg.beginPath(); hg.ellipse(x, y, rx, ry, 0.3, 0, 6.29); hg.fill();
        }
        /* un peu de lichen clair et de mousse dans les creux */
        for (let k = 0; k < 60; k++) {
          const x = R() * W, y = R() * H, r = 6 + R() * 18, vert = R() < 0.4;
          const c = g.createRadialGradient(x, y, 1, x, y, r);
          c.addColorStop(0, vert ? 'rgba(112,124,78,0.3)' : 'rgba(196,196,176,0.3)'); c.addColorStop(1, 'rgba(196,196,176,0)');
          g.fillStyle = c; g.fillRect(x - r, y - r, 2 * r, 2 * r);
        }
        for (let k = 0; k < 5000; k++) {
          g.fillStyle = R() < 0.5 ? 'rgba(40,34,28,' + (0.05 + R() * 0.1) + ')' : 'rgba(190,180,168,' + (0.05 + R() * 0.12) + ')';
          g.fillRect(R() * W, R() * H, 1 + R() * 2, 1 + R() * 5);
        }
      });
      return { map: repete(map), normale: normaleDepuis(hc, 0.02, true) };
    })();

    /* -- les feuilles : un bouquet de rameaux, feuilles lancéolées, dessus
          vert-gris olive, dessous argenté. Quatre bouquets différents dans
          un atlas 2 × 2 : chaque touffe en tire deux, croisés. */
    function dessineFeuilles(g, W, H, densite, R, rot) {
      const cx = W / 2, cy = H / 2, k = W / 1024;
      function feuille(x, y, ang, L, l, argent) {
        g.save(); g.translate(x, y); g.rotate(ang);
        const gr = g.createLinearGradient(0, -l / 2, 0, l / 2);
        if (argent) { gr.addColorStop(0, '#b8c0a6'); gr.addColorStop(0.5, '#9aa389'); gr.addColorStop(1, '#7e886e'); }
        else { gr.addColorStop(0, '#8d9a78'); gr.addColorStop(0.5, '#6b7a5c'); gr.addColorStop(1, '#4f5c44'); }
        g.fillStyle = gr;
        g.beginPath(); g.moveTo(-L / 2, 0); g.quadraticCurveTo(-L * 0.08, -l * 0.9, L / 2, 0); g.quadraticCurveTo(-L * 0.08, l * 0.9, -L / 2, 0); g.closePath(); g.fill();
        g.strokeStyle = argent ? 'rgba(236,240,226,0.5)' : 'rgba(170,184,146,0.5)'; g.lineWidth = 1.6 * k;
        g.beginPath(); g.moveTo(-L / 2 + 5 * k, 0); g.lineTo(L / 2 - 6 * k, 0); g.stroke();
        g.restore();
      }
      const nR = 10;
      for (let i = 0; i < nR; i++) {
        const a = rot + i / nR * Math.PI * 2 + R() * 0.5, d0 = 30 * k + R() * 60 * k, Lr = (300 + R() * 170) * k * densite;
        const x0 = cx + Math.cos(a) * d0, y0 = cy + Math.sin(a) * d0, courbe = (R() - 0.5) * 140 * k;
        const x1 = x0 + Math.cos(a) * Lr, y1 = y0 + Math.sin(a) * Lr, mx = (x0 + x1) / 2 - Math.sin(a) * courbe, my = (y0 + y1) / 2 + Math.cos(a) * courbe;
        g.strokeStyle = '#5a5044'; g.lineWidth = 5 * k; g.lineCap = 'round';
        g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(mx, my, x1, y1); g.stroke();
        const n = Math.round(Lr / (21 * k));
        for (let j = 0; j <= n; j++) {
          const t = j / n, ix = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * mx + t * t * x1, iy = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * my + t * t * y1;
          const tang = Math.atan2(2 * (1 - t) * (my - y0) + 2 * t * (y1 - my), 2 * (1 - t) * (mx - x0) + 2 * t * (x1 - mx));
          const cote = j % 2 ? 1 : -1, ang = tang + cote * (0.55 + R() * 0.45);
          const L = (92 + R() * 40) * k, l = (22 + R() * 9) * k;
          feuille(ix + Math.cos(ang) * L * 0.45, iy + Math.sin(ang) * L * 0.45, ang, L, l, R() < 0.3);
        }
        feuille(x1 + Math.cos(a) * 40 * k, y1 + Math.sin(a) * 40 * k, a, 110 * k, 26 * k, R() < 0.5);
      }
    }
    const FR = [140, 150, 122];                                           // couleur des franges
    const texFeuilles = toileCorrigee(2048, 2048, function (g, W, H) {
      g.clearRect(0, 0, W, H);
      [[0, 0, 0.92, 0], [1, 0, 1.05, 0.7], [0, 1, 1.0, 1.9], [1, 1, 1.12, 3.1]].forEach(function (q, i) {
        g.save(); g.translate(q[0] * W / 2, q[1] * H / 2);
        dessineFeuilles(g, W / 2, H / 2, q[2], Alea(101 + i * 17), q[3]);
        g.restore();
      });
    }, FR[0], FR[1], FR[2]);
    const texFeuillesLoin = toileCorrigee(512, 512, function (g, W, H) { g.clearRect(0, 0, W, H); dessineFeuilles(g, W, H, 1.1, Alea(211), 0); }, FR[0], FR[1], FR[2]);
    /* des quads vus sous tous les angles : le filtrage anisotrope n'apporte rien et coûte cher */
    texFeuilles.anisotropy = 1; texFeuillesLoin.anisotropy = 1;

    /* -- les pierres sèches du mur : assises irrégulières, joints en creux,
          une tuile de 1,6 m × 0,4 m, avec sa carte de normales */
    const texPierre = (function () {
      const R = Alea(47), W = 1024, H = 256;
      const hc = document.createElement('canvas'); hc.width = W; hc.height = H;
      const hg = hc.getContext('2d');
      hg.fillStyle = 'rgb(20,20,20)'; hg.fillRect(0, 0, W, H);
      const pierres = [], rangs = [0, 66, 118, 190, 256];
      for (let r = 0; r < 4; r++) {
        let x = -R() * 140;
        while (x < W) {
          const haute = R() < 0.12 && r < 3, y0 = rangs[r] + (R() - 0.5) * 8, y1 = (haute ? rangs[r + 2] : rangs[r + 1]) + (R() - 0.5) * 8;
          const l = 60 + R() * 150 + (haute ? 40 : 0);
          pierres.push({ x: x, l: l, y0: y0, y1: y1, hue: 30 + R() * 18, sat: 8 + R() * 16, lum: 54 + R() * 22, d: [R(), R(), R(), R(), R(), R(), R(), R()] });
          x += l + 2 + R() * 6;
          if (haute) x += 20;
        }
      }
      const map = o.toile(W, H, function (g) {
        g.fillStyle = '#6f675b'; g.fillRect(0, 0, W, H);
        for (let k = 0; k < 2500; k++) { g.fillStyle = 'rgba(' + (R() < 0.5 ? '40,34,28' : '150,140,125') + ',' + (0.1 + R() * 0.2) + ')'; g.fillRect(R() * W, R() * H, 1 + R() * 3, 1 + R() * 3); }
        pierres.forEach(function (p) {
          [p.x, p.x + W, p.x - W].forEach(function (xx) {
            if (xx + p.l < 0 || xx > W) return;
            const j = 1.5, x0 = xx + j, x1 = xx + p.l - j, y0 = p.y0 + j, y1 = p.y1 - j, d = p.d;
            const poly = [[x0 + d[0] * 10, y0 + d[1] * 5], [x1 - d[2] * 12, y0 + d[3] * 6], [x1 - d[4] * 4, y1 - d[5] * 7], [x0 + d[6] * 8, y1 - d[7] * 4]];
            function trace(c) { c.beginPath(); c.moveTo(poly[0][0], poly[0][1]); for (let i = 1; i < 4; i++) c.lineTo(poly[i][0], poly[i][1]); c.closePath(); }
            const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, ll = x1 - x0, hh = y1 - y0;
            trace(g); g.fillStyle = 'hsl(' + p.hue + ',' + p.sat + '%,' + p.lum + '%)'; g.fill();
            const rg = g.createRadialGradient(cx - ll * 0.2, cy - hh * 0.25, 2, cx, cy, ll * 0.62);
            rg.addColorStop(0, 'rgba(255,250,240,0.26)'); rg.addColorStop(0.75, 'rgba(120,105,85,0)'); rg.addColorStop(1, 'rgba(50,42,34,0.38)');
            g.save(); trace(g); g.clip(); g.fillStyle = rg; g.fillRect(x0 - 5, y0 - 5, ll + 10, hh + 10);
            for (let k = 0; k < 120; k++) {
              g.fillStyle = R() < 0.5 ? 'rgba(60,50,40,' + (0.08 + R() * 0.16) + ')' : 'rgba(255,250,240,' + (0.08 + R() * 0.18) + ')';
              g.beginPath(); g.arc(x0 + R() * ll, y0 + R() * hh, 0.6 + R() * 1.8, 0, 6.29); g.fill();
            }
            g.restore();
            trace(g); g.strokeStyle = 'rgba(50,42,34,0.35)'; g.lineWidth = 1; g.stroke();
            const hr = hg.createRadialGradient(cx, cy, 2, cx, cy, Math.max(ll, hh) * 0.62);
            hr.addColorStop(0, 'rgb(225,225,225)'); hr.addColorStop(0.65, 'rgb(200,200,200)'); hr.addColorStop(1, 'rgb(90,90,90)');
            trace(hg); hg.fillStyle = hr; hg.fill();
          });
        });
      });
      return { map: repete(map), normale: normaleDepuis(hc, 0.035, true) };
    })();

    /* -- le travertin du chaperon : une pierre beige clair finement piquée */
    const texTravertin = (function () {
      const R = Alea(5);
      return repete(o.toile(512, 512, function (g, W, H) {
        g.fillStyle = '#d3c9b6'; g.fillRect(0, 0, W, H);
        for (let k = 0; k < 40; k++) {
          const y = R() * H;
          g.strokeStyle = 'rgba(' + (R() < 0.5 ? '160,145,120' : '235,228,215') + ',' + (0.12 + R() * 0.2) + ')'; g.lineWidth = 2 + R() * 10;
          g.beginPath(); g.moveTo(-20, y);
          for (let x = 0; x <= W + 20; x += 40) g.lineTo(x, y + Math.sin(x / 60 + k) * 6 + (R() - 0.5) * 6);
          g.stroke();
        }
        for (let k = 0; k < 2600; k++) {
          const r = 0.5 + R() * 1.8;
          g.fillStyle = R() < 0.6 ? 'rgba(120,105,85,' + (0.06 + R() * 0.16) + ')' : 'rgba(255,250,242,' + (0.1 + R() * 0.2) + ')';
          g.beginPath(); g.arc(R() * W, R() * H, r, 0, 6.29); g.fill();
        }
      }));
    })();

    /* -- le dallage du belvédère : des dalles de pierre pâle en appareil
          irrégulier, à joints de terre, dont les dernières se perdent dans
          l'herbe ; l'ellipse suit le plat du terrain. */
    const DAL = { a: 1700, b: 1770, span: 4300 };
    const dalles = (function () {
      const R = Alea(11), out = [];
      let z = -DAL.b - 150 + R() * 200;
      while (z < DAL.b + 150) {
        const h = 300 + R() * 160; let x = -DAL.a - 250 - R() * 300;
        while (x < DAL.a + 250) {
          const l = 300 + R() * 240;
          const coins = [[x, z], [x + l, z], [x, z + h], [x + l, z + h]];
          let dedans = true;
          coins.forEach(function (c) { if (Math.hypot(c[0] / DAL.a, c[1] / DAL.b) > 1.02) dedans = false; });
          const rc = Math.hypot((x + l / 2) / DAL.a, (z + h / 2) / DAL.b), tirage = R();
          if (dedans && (rc < 0.72 || tirage < 0.45)) out.push({ x: x, z: z, l: l, h: h, lum: 54 + R() * 18, sat: 3 + R() * 6, hue: 36 + R() * 8, g: R(), v: [R(), R(), R(), R(), R(), R()] });
          x += l + 22;
        }
        z += h + 22;
      }
      return out;
    })();
    function dessineDalles(g, S, hauteurs, R) {
      const px = function (x) { return (x + DAL.span / 2) * S; }, py = function (z) { return (z + DAL.span / 2) * S; };
      /* les joints de terre d'abord, en léger débord, puis chaque dalle */
      if (!hauteurs) {
        g.fillStyle = 'rgba(86,76,60,0.95)';
        dalles.forEach(function (d) { g.fillRect(px(d.x - 14), py(d.z - 14), (d.l + 28) * S, (d.h + 28) * S); });
      }
      dalles.forEach(function (d) {
        const x0 = px(d.x), y0 = py(d.z), l = d.l * S, h = d.h * S, v = d.v;
        /* la dalle est un quadrilatère à peine irrégulier */
        const poly = [[x0 + v[0] * 6 * S, y0 + v[1] * 5 * S], [x0 + l - v[2] * 7 * S, y0 + v[3] * 4 * S], [x0 + l - v[4] * 4 * S, y0 + h - v[5] * 6 * S], [x0 + v[1] * 5 * S, y0 + h - v[0] * 5 * S]];
        function trace(c) { c.beginPath(); c.moveTo(poly[0][0], poly[0][1]); for (let i = 1; i < 4; i++) c.lineTo(poly[i][0], poly[i][1]); c.closePath(); }
        if (hauteurs) {
          const hr = g.createRadialGradient(x0 + l / 2, y0 + h / 2, 2, x0 + l / 2, y0 + h / 2, Math.max(l, h) * 0.6);
          hr.addColorStop(0, 'rgb(215,215,215)'); hr.addColorStop(0.7, 'rgb(205,205,205)'); hr.addColorStop(1, 'rgb(150,150,150)');
          trace(g); g.fillStyle = hr; g.fill();
          return;
        }
        trace(g); g.fillStyle = 'hsl(' + d.hue + ',' + d.sat + '%,' + d.lum + '%)'; g.fill();
        g.save(); trace(g); g.clip();
        const rg = g.createRadialGradient(x0 + l * (0.3 + d.g * 0.4), y0 + h * 0.5, 4, x0 + l * 0.5, y0 + h * 0.5, Math.max(l, h) * 0.7);
        rg.addColorStop(0, 'rgba(255,250,240,0.18)'); rg.addColorStop(1, 'rgba(90,80,65,0.16)');
        g.fillStyle = rg; g.fillRect(x0, y0, l, h);
        for (let k = 0; k < 420; k++) {
          const qx = x0 + R() * l, qy = y0 + R() * h, r = (0.6 + R() * 1.6) * S * 2;
          g.fillStyle = R() < 0.5 ? 'rgba(80,70,55,' + (0.05 + R() * 0.12) + ')' : 'rgba(255,252,245,' + (0.08 + R() * 0.16) + ')';
          g.beginPath(); g.arc(qx, qy, r, 0, 6.29); g.fill();
        }
        for (let k = 0; k < 3; k++) {
          g.strokeStyle = 'rgba(120,105,85,' + (0.06 + R() * 0.08) + ')'; g.lineWidth = (1 + R() * 2) * S * 2;
          g.beginPath(); g.moveTo(x0 + R() * l, y0 + R() * h); g.bezierCurveTo(x0 + R() * l, y0 + R() * h, x0 + R() * l, y0 + R() * h, x0 + R() * l, y0 + R() * h); g.stroke();
        }
        /* le bord de la dalle : une ombre douce vers les joints */
        g.strokeStyle = 'rgba(50,42,34,0.3)'; g.lineWidth = 9 * S; trace(g); g.stroke();
        g.restore();
        trace(g); g.strokeStyle = 'rgba(60,50,40,0.5)'; g.lineWidth = 1.2; g.stroke();
      });
    }
    const texDallage = (function () {
      const W = 2048, S = W / DAL.span, R = Alea(13);
      const map = o.toile(W, W, function (g) { g.clearRect(0, 0, W, W); dessineDalles(g, S, false, R); });
      const hc = document.createElement('canvas'); hc.width = hc.height = 1024;
      const hg = hc.getContext('2d'); hg.fillStyle = 'rgb(40,40,40)'; hg.fillRect(0, 0, 1024, 1024);
      dessineDalles(hg, 1024 / DAL.span, true, R);
      corrigeFrange(map.image, 86, 76, 60); map.needsUpdate = true; map.anisotropy = 8;
      return { map: map, normale: normaleDepuis(hc, 0.018, false) };
    })();

    /* -- l'herbe : les outils de dessin d'une prairie sèche fauchée */
    function grainHerbe(g, W, H, n, longueur, alpha, R) {
      const cols = ['#b7a67a', '#a89a6c', '#c2b388', '#98936a', '#af9f74', '#8f8c62', '#c9ba90', '#a39668', '#b9ab7e'];
      g.lineCap = 'round';
      for (let i = 0; i < n; i++) {
        const x = R() * W, y = R() * H, l = longueur * (0.6 + R() * 0.8), a = -Math.PI / 2 + (R() - 0.5) * 1.6;
        g.strokeStyle = cols[Math.floor(R() * cols.length)]; g.globalAlpha = alpha * (0.6 + R() * 0.4); g.lineWidth = 0.8 + R() * 1.2;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
      }
      g.globalAlpha = 1;
    }
    function taches(g, W, H, n, rMin, rMax, cols, alpha, R) {
      for (let i = 0; i < n; i++) {
        const x = R() * W, y = R() * H, r = rMin + R() * (rMax - rMin);
        const c = g.createRadialGradient(x, y, 1, x, y, r);
        const col = cols[Math.floor(R() * cols.length)];
        c.addColorStop(0, col.replace('A', String(alpha * (0.6 + R() * 0.6)))); c.addColorStop(1, col.replace('A', '0'));
        g.fillStyle = c; g.fillRect(x - r, y - r, 2 * r, 2 * r);
      }
    }
    function fleurs(g, W, H, nColonies, rayon, R) {
      for (let c = 0; c < nColonies; c++) {
        const cx = R() * W, cy = R() * H, n = 3 + Math.floor(R() * 9), blanc = R() < 0.25;
        for (let i = 0; i < n; i++) {
          const x = cx + (R() - 0.5) * rayon, y = cy + (R() - 0.5) * rayon, r = 1.0 + R() * 0.9;
          g.fillStyle = blanc ? '#f3efe0' : '#e2bd2c'; g.beginPath(); g.arc(x, y, r, 0, 6.3); g.fill();
          g.fillStyle = blanc ? '#e8d86a' : '#f6da5c'; g.beginPath(); g.arc(x - 0.4, y - 0.4, r * 0.45, 0, 6.3); g.fill();
        }
      }
    }

    /* ================================================================== */
    /*  3. Les arbres : où ils sont, puis comment ils sont faits           */
    /* ================================================================== */
    /* position dans le repère elliptique du relief : u = 1 sur le rebord */
    function posUT(u, thetaDeg) { const a = thetaDeg * RAD; return { x: u * AX * Math.cos(a), z: ZC_ARB + u * AZ_ARB * Math.sin(a) }; }
    function posRelief(u, thetaDeg) { const a = thetaDeg * RAD; return { x: u * AX * Math.cos(a), z: ZC + u * AZ * Math.sin(a) }; }
    const arbres = [];
    function ajouteArbre(p, extra) {
      const a = { x: p.x, z: p.z, echelle: 1, etal: 0.3, niveau: 'anneau', ombreReelle: false, butte: true, teinte: entre(0.86, 1.08), chaud: entre(0.96, 1.04) };
      for (const k in extra) a[k] = extra[k];
      arbres.push(a); return a;
    }
    /* les deux oliviers proches : celui de gauche est entre le soleil et la
       boîte, son ombre tombe sur le marbre ; celui de droite se reflète */
    ajouteArbre({ x: -2250, z: -2850 }, { niveau: 'proche', echelle: 1.18, etal: 0.15, ombreReelle: true, butte: false });
    ajouteArbre({ x: 3050, z: 650 }, { niveau: 'proche', echelle: 0.96, etal: 0.7, butte: false });
    /* les côtés, à mi-pente, pour les vues basses */
    [[2.6, 10], [3.1, 34], [2.5, 166], [3.0, 190], [2.7, 52], [2.9, 128]].forEach(function (ut) { ajouteArbre(posUT(ut[0] + entre(-0.1, 0.1), ut[1] + entre(-4, 4)), { echelle: entre(0.9, 1.1), etal: entre(0.2, 0.6) }); });
    /* la terrasse : deux arbres à ses extrémités, le centre reste dégagé */
    [[3.8, 204], [3.75, 336]].forEach(function (ut) { ajouteArbre(posUT(ut[0], ut[1] + entre(-3, 3)), { echelle: entre(0.9, 1.05), etal: entre(0.3, 0.6) }); });
    /* la rangée sous le mur, dont on voit les cimes depuis la table */
    [[4.6, 222], [4.75, 258], [4.6, 293], [4.7, 326]].forEach(function (ut) { ajouteArbre(posUT(ut[0] + entre(-0.1, 0.1), ut[1] + entre(-4, 4)), { echelle: entre(0.95, 1.15), etal: entre(0.2, 0.5) }); });
    /* plus bas encore, et sur les flancs */
    [[5.9, 206], [6.1, 240], [5.9, 275], [6.2, 309], [5.9, 343], [6.4, 188], [5.2, 8], [5.4, 172], [4.6, 40], [4.8, 140]].forEach(function (ut) { ajouteArbre(posUT(ut[0] + entre(-0.15, 0.15), ut[1] + entre(-4, 4)), { echelle: entre(0.9, 1.2), etal: entre(0.2, 0.5) }); });
    /* les rangées lointaines, dans la brume, tout autour */
    [[8.2, 200], [8.6, 222], [8.0, 244], [8.8, 266], [8.3, 288], [8.9, 312], [8.1, 334], [10.5, 215], [11, 250], [10.7, 285], [11.2, 320], [9.6, 190], [9.9, 350], [12.6, 205], [13.2, 228], [12.4, 252], [13.5, 270], [12.8, 296], [13.3, 318], [12.5, 342], [14.5, 240], [14.8, 300],
      [7.4, 6], [8.8, 24], [10.4, 12], [12.2, 30], [9.4, 44], [11.8, 55], [7.6, 174], [8.9, 156], [10.6, 168], [12.3, 150], [9.6, 136], [11.7, 124], [10.2, 100], [12.6, 72], [12.8, 108], [9.2, 78], [14.2, 90], [14.6, 160], [14.4, 20]].forEach(function (ut) { ajouteArbre(posUT(ut[0] + entre(-0.2, 0.2), ut[1] + entre(-5, 5)), { niveau: 'loin', echelle: entre(1.0, 1.3), etal: entre(0.2, 0.5), chaud: entre(0.9, 0.96) }); });
    arbres.forEach(function (a) { if (a.butte) monticules.push({ x: a.x, z: a.z, r: 700 * a.echelle, h: 230 * a.echelle }); });
    arbres.forEach(function (a) { a.y = hauteur(a.x, a.z); });

    /* -- géométrie d'un tube noueux le long d'une colonne d'anneaux */
    function balayer(dest, anneaux, segs, uEch, vEch, lob) {
      const base = dest.pos.length / 3, n = anneaux.length;
      const Tg = new T.Vector3(), N = new T.Vector3(), B = new T.Vector3(), tmp = new T.Vector3();
      for (let k = 0; k < n; k++) {
        const a = anneaux[k], p = a.p, prev = anneaux[Math.max(0, k - 1)].p, next = anneaux[Math.min(n - 1, k + 1)].p;
        Tg.set(next.x - prev.x, next.y - prev.y, next.z - prev.z).normalize();
        if (k === 0) { N.set(1, 0, 0.3).cross(Tg).normalize(); if (N.lengthSq() < 0.01) N.set(0, 0, 1).cross(Tg).normalize(); }
        else N.sub(tmp.copy(Tg).multiplyScalar(N.dot(Tg))).normalize();
        B.crossVectors(Tg, N);
        const t = k / (n - 1);
        for (let j = 0; j <= segs; j++) {
          const th = j / segs * Math.PI * 2;
          let rr = a.r;
          if (lob) rr *= 1 + lob.a3 * Math.sin(3 * th + lob.p3 + t * lob.tw) + lob.a5 * Math.sin(5 * th + lob.p5 - t * lob.tw * 0.6) + (lob.a2 || 0) * Math.sin(2 * th + lob.p5 * 0.5 + t * lob.tw * 0.4) + 0.05 * Math.sin(11 * th + lob.p3 * 2);
          const c = Math.cos(th) * rr, sn = Math.sin(th) * rr;
          dest.pos.push(p.x + N.x * c + B.x * sn, p.y + N.y * c + B.y * sn, p.z + N.z * c + B.z * sn);
          dest.uv.push(j / segs * uEch, t * vEch);
        }
      }
      for (let k = 0; k < n - 1; k++) for (let j = 0; j < segs; j++) {
        const a = base + k * (segs + 1) + j, b = a + 1, c = a + segs + 1, d = c + 1;
        dest.idx.push(a, b, c, b, d, c);
      }
      return base;
    }
    function bouchon(dest, premier, segs, p) {
      const c = dest.pos.length / 3;
      dest.pos.push(p.x, p.y, p.z); dest.uv.push(0.5, 0.5);
      for (let j = 0; j < segs; j++) dest.idx.push(c, premier + j, premier + j + 1);
    }

    /* -- un olivier : tronc noueux, lobé et vrillé, évasé au pied sur des
          racines, trois à cinq charpentières, des rameaux, et des lobes de
          feuillage au bout de chaque branche */
    function olivier(sp, tronc, touffes) {
      const e = sp.echelle, loin = sp.niveau === 'loin', proche = sp.niveau === 'proche';
      const base = new T.Vector3(sp.x, sp.y - 230 * e, sp.z);
      const Ht = (1400 + 450 * alea()) * e * (1 - 0.3 * sp.etal);
      const lean = new T.Vector3(entre(-1, 1), 0, entre(-1, 1)).normalize().multiplyScalar(entre(120, 320) * e);
      const rBase = entre(185, 250) * e, phi = alea() * 6.28;
      const lob = { a3: entre(0.22, 0.34), p3: alea() * 6.28, a5: entre(0.08, 0.16), p5: alea() * 6.28, a2: entre(0.06, 0.14), tw: entre(2.5, 4.5) };
      const anneaux = [], nR = loin ? 8 : 16, segs = loin ? 8 : (proche ? 24 : 16);
      for (let k = 0; k < nR; k++) {
        const t = k / (nR - 1), w = Math.sin(Math.PI * t);
        const p = new T.Vector3(base.x + lean.x * t + 110 * e * w * Math.sin(t * 4.2 + phi), base.y + Ht * t, base.z + lean.z * t + 110 * e * w * Math.cos(t * 3.1 + phi * 1.7));
        const r = rBase * (1 - 0.42 * t) + rBase * 1.1 * Math.pow(Math.max(0, 1 - t / 0.24), 2);
        anneaux.push({ p: p, r: r });
      }
      const b0 = balayer(tronc, anneaux, segs, 2, Ht / (2 * Math.PI * rBase), lob);
      const top = anneaux[nR - 1].p, rTop = anneaux[nR - 1].r;
      bouchon(tronc, b0 + (nR - 1) * (segs + 1), segs, top);
      /* les racines, qui partent de l'empattement et plongent dans le sol */
      if (!loin) {
        const nRac = 4 + Math.floor(alea() * 3), a0 = alea() * 6.28;
        for (let k = 0; k < nRac; k++) {
          const a = a0 + k / nRac * 6.28 + entre(-0.4, 0.4), ux = Math.cos(a), uz = Math.sin(a), lr = entre(1.9, 2.7);
          const rp = [
            { p: new T.Vector3(sp.x + ux * rBase * 0.55, sp.y + 210 * e, sp.z + uz * rBase * 0.55), r: rBase * 0.5 },
            { p: new T.Vector3(sp.x + ux * rBase * 1.35, sp.y + 50 * e, sp.z + uz * rBase * 1.35), r: rBase * 0.3 },
            { p: new T.Vector3(sp.x + ux * rBase * lr, sp.y - 90 * e, sp.z + uz * rBase * lr), r: rBase * 0.17 },
            { p: new T.Vector3(sp.x + ux * rBase * (lr + 0.5), sp.y - 260 * e, sp.z + uz * rBase * (lr + 0.5)), r: rBase * 0.08 }];
          balayer(tronc, rp, proche ? 9 : 7, 0.6, 0.5, { a3: 0.12, p3: a, a5: 0.05, p5: 0, tw: 1 });
        }
      }
      const lobes = [];
      const nB = loin ? 3 : 3 + Math.floor(alea() * 3), az0 = alea() * 6.28;
      for (let i = 0; i < nB; i++) {
        const az = az0 + i * 6.28 / nB + entre(-0.35, 0.35);
        const pol = (38 + 38 * sp.etal + entre(-10, 10)) * RAD;
        const dir = new T.Vector3(Math.sin(pol) * Math.cos(az), Math.cos(pol), Math.sin(pol) * Math.sin(az));
        const Lb = entre(1050, 1550) * e;
        const perp = new T.Vector3().crossVectors(dir, new T.Vector3(0, 1, 0)).normalize();
        const nb = loin ? 5 : 9, ann = [], ph = alea() * 6.28, r0 = rTop * 0.62;
        for (let k = 0; k < nb; k++) {
          const t = k / (nb - 1);
          const p = new T.Vector3().copy(top).addScaledVector(dir, Lb * t).addScaledVector(perp, 90 * e * Math.sin(t * 5 + ph) * Math.sin(Math.PI * t));
          p.y += Lb * 0.28 * t * t * (1 - 0.5 * sp.etal);
          ann.push({ p: p, r: r0 * (1 - 0.78 * t) + 9 * e });
        }
        balayer(tronc, ann, loin ? 6 : 10, 1, 2, { a3: 0.14, p3: ph, a5: 0.06, p5: ph * 2, tw: 3 });
        const tip = ann[nb - 1].p, tipDir = new T.Vector3().subVectors(tip, ann[nb - 2].p).normalize();
        lobes.push({ c: new T.Vector3().copy(tip).addScaledVector(tipDir, 160 * e).add(new T.Vector3(0, 140 * e, 0)), R: entre(600, 780) * e });
        if (!loin) {
          const nS = 1 + Math.floor(alea() * 2);
          for (let q = 0; q < nS; q++) {
            const t0 = entre(0.5, 0.72), k0 = Math.round(t0 * (nb - 1));
            const start = ann[k0].p, rs = ann[k0].r * 0.75;
            const axe = new T.Vector3(entre(-1, 1), entre(-0.3, 0.6), entre(-1, 1)).normalize();
            const sdir = new T.Vector3().copy(dir).applyAxisAngle(axe, entre(0.6, 1.0));
            if (sdir.y < -0.1) sdir.y = -0.1;
            sdir.normalize();
            const Ls = Lb * entre(0.45, 0.65), anS = [];
            for (let k = 0; k < 6; k++) { const t = k / 5; anS.push({ p: new T.Vector3().copy(start).addScaledVector(sdir, Ls * t).add(new T.Vector3(0, Ls * 0.2 * t * t, 0)), r: rs * (1 - 0.8 * t) + 6 * e }); }
            balayer(tronc, anS, 7, 1, 1.2, { a3: 0.08, p3: 0, a5: 0.04, p5: 1, tw: 1 });
            lobes.push({ c: anS[5].p.clone().addScaledVector(sdir, 100 * e).add(new T.Vector3(0, 80 * e, 0)), R: entre(430, 560) * e });
          }
        }
      }
      lobes.push({ c: new T.Vector3(top.x, top.y + 950 * e * (1 - 0.4 * sp.etal), top.z), R: 720 * e });
      /* les touffes de feuilles : plus nombreuses à la surface des lobes,
         tournées vers l'extérieur ; la lumière est portée par la couleur de
         chaque touffe : chaud et clair au sommet face au soleil, sombre et
         froid au cœur de la couronne */
      /* des bouquets denses et assez grands : moins de quads superposés
         à l'écran pour la même masse de feuilles (le rendu du reflet et
         du feuillage est ce qui coûte le plus sur un téléphone) */
      const kDens = proche ? 38 : (loin ? 12 : 26);
      const taille = proche ? 800 : (loin ? 1500 : 860);
      let yMin = Infinity, yMax = -Infinity;
      lobes.forEach(function (L) { yMin = Math.min(yMin, L.c.y - L.R); yMax = Math.max(yMax, L.c.y + L.R); });
      const cime = { x: 0, y: 0, z: 0, n: 0 };
      lobes.forEach(function (L) {
        const n = Math.round(kDens * Math.pow(L.R / 700, 2.2));
        for (let i = 0; i < n; i++) {
          const th = alea() * 6.28, cph = entre(-1, 1), sph = Math.sqrt(1 - cph * cph);
          const d = new T.Vector3(sph * Math.cos(th), cph * 1.15, sph * Math.sin(th)).normalize();
          const rr = L.R * (0.5 + 0.5 * Math.sqrt(alea()));
          const p = new T.Vector3().copy(L.c).addScaledVector(d, rr);
          const nrm = new T.Vector3().copy(d).multiplyScalar(0.7).add(new T.Vector3(entre(-1, 1), entre(-1, 1), entre(-1, 1)).multiplyScalar(0.5)).normalize();
          const k = (p.y - yMin) / (yMax - yMin);
          const soleilK = 0.5 + 0.5 * d.dot(SOL_DIR), prof = Math.pow(borne((rr / L.R - 0.5) / 0.5), 1.3);
          const w = borne(melange(0.18, 1.0, prof) * melange(0.55, 1.0, k) * melange(0.5, 1.12, soleilK) * sp.teinte + entre(-0.05, 0.05));
          const c = [melange(0.24, 0.92, w) * sp.chaud, melange(0.30, 0.9, w), melange(0.24, 0.76, w) * (2 - sp.chaud)];
          touffes.push({ p: p, n: nrm, s: taille * e * entre(0.8, 1.3), c: c });
          cime.x += p.x; cime.y += p.y; cime.z += p.z; cime.n++;
        }
      });
      return { cime: { x: cime.x / cime.n, y: cime.y / cime.n, z: cime.z / cime.n }, rayon: (yMax - yMin) / 2 };
    }

    /* l'olivier qui projette l'ombre réelle a son propre tronc et son propre
       feuillage, pour porter castShadow sans entraîner tous les autres */
    const troncOmbre = { pos: [], uv: [], idx: [] }, troncProche = { pos: [], uv: [], idx: [] }, troncAnneau = { pos: [], uv: [], idx: [] }, troncLoin = { pos: [], uv: [], idx: [] };
    const touffesOmbre = [], touffesProche = [], touffesAnneau = [], touffesLoin = [];
    arbres.forEach(function (a) {
      const tronc = a.ombreReelle ? troncOmbre : (a.niveau === 'proche' ? troncProche : (a.niveau === 'loin' ? troncLoin : troncAnneau));
      const touffes = a.ombreReelle ? touffesOmbre : (a.niveau === 'proche' ? touffesProche : (a.niveau === 'loin' ? touffesLoin : touffesAnneau));
      const res = olivier(a, tronc, touffes);
      a.cime = res.cime; a.rayon = res.rayon;
    });

    /* ================================================================== */
    /*  4. Le sol : le grand terrain (texture à 23 mm par pixel, avec les  */
    /*  ombres longues des arbres), la prairie fine autour du belvédère,   */
    /*  et le dallage sous la table                                        */
    /* ================================================================== */
    /* les ombres portées des arbres et l'ombre au pied, dans l'axe du soleil */
    function peindreOmbres(g, px, kPx, force) {
      const ang = Math.atan2(-OMBRE_DZ, OMBRE_DX), etire = 1 / Math.sin(41 * RAD);
      arbres.forEach(function (a) {
        const p0 = px(a.x, a.z);
        if (!a.ombreReelle) {
          const hc = a.cime.y - a.y, cx = a.cime.x + OMBRE_DX * hc, cz = a.cime.z + OMBRE_DZ * hc, r = a.rayon * 1.05;
          const p = px(cx, cz), rp = r * kPx;
          g.strokeStyle = 'rgba(44,40,26,' + 0.42 * force + ')'; g.lineWidth = 240 * a.echelle * kPx; g.lineCap = 'round';
          g.beginPath(); g.moveTo(p0.x, p0.y); g.lineTo(p.x, p.y); g.stroke();
          g.save(); g.translate(p.x, p.y); g.rotate(ang); g.scale(etire, 1);
          const grd = g.createRadialGradient(0, 0, rp * 0.2, 0, 0, rp);
          grd.addColorStop(0, 'rgba(44,40,26,' + 0.5 * force + ')'); grd.addColorStop(0.7, 'rgba(44,40,26,' + 0.42 * force + ')'); grd.addColorStop(1, 'rgba(44,40,26,0)');
          g.fillStyle = grd; g.fillRect(-rp, -rp, 2 * rp, 2 * rp); g.restore();
        }
        const ra = 640 * a.echelle * kPx;
        const gp = g.createRadialGradient(p0.x, p0.y, 1, p0.x, p0.y, ra);
        gp.addColorStop(0, 'rgba(46,40,28,0.5)'); gp.addColorStop(0.35, 'rgba(46,40,28,0.3)'); gp.addColorStop(1, 'rgba(46,40,28,0)');
        g.fillStyle = gp; g.fillRect(p0.x - ra, p0.y - ra, 2 * ra, 2 * ra);
      });
    }
    const SOL_W = 48000, kSol = 2048 / SOL_W;
    function solPx(x, z) { return { x: (x + SOL_W / 2) * kSol, y: (SOL_W / 2 - z) * kSol }; }
    const texSol = o.toile(2048, 2048, function (g, W, H) {
      const R = Alea(61);
      g.fillStyle = '#a99e7b'; g.fillRect(0, 0, W, H);
      taches(g, W, H, 600, 20, 120, ['rgba(140,135,88,A)', 'rgba(190,178,132,A)', 'rgba(150,146,98,A)', 'rgba(112,118,80,A)', 'rgba(178,164,116,A)', 'rgba(128,122,86,A)'], 0.32, R);
      taches(g, W, H, 160, 120, 420, ['rgba(128,132,84,A)', 'rgba(198,184,128,A)', 'rgba(150,140,92,A)', 'rgba(160,140,100,A)'], 0.22, R);
      grainHerbe(g, W, H, 28000, 4, 0.45, R);
      /* la terrasse et le pied du belvédère, un peu plus verts (l'herbe y garde l'eau) */
      g.save(); g.translate(W / 2, H / 2); g.scale(1, AZ / AX);
      const anneau = g.createRadialGradient(0, 0, 2.9 * AX * kSol, 0, 0, 3.7 * AX * kSol);
      anneau.addColorStop(0, 'rgba(140,146,92,0)'); anneau.addColorStop(0.5, 'rgba(140,146,92,0.28)'); anneau.addColorStop(1, 'rgba(140,146,92,0)');
      g.fillStyle = anneau; g.fillRect(-W, -H, 2 * W, 2 * H); g.restore();
      peindreOmbres(g, solPx, kSol, 1);
    });
    texSol.anisotropy = 8;

    /* -- le maillage du terrain : polaire, fin près de la table, large au loin */
    const NA = 96, NR = 84, R_MAX = 36500;
    const terrainPos = [], terrainUv = [], terrainIdx = [];
    terrainPos.push(0, hauteur(0, ZC), ZC); terrainUv.push(0.5, 0.5);
    for (let i = 1; i <= NR; i++) {
      const r = R_MAX * Math.pow(i / NR, 1.8);
      for (let j = 0; j < NA; j++) {
        const a = j / NA * Math.PI * 2, x = r * Math.cos(a), z = ZC + r * Math.sin(a) * (AZ / AX);
        terrainPos.push(x, hauteur(x, z), z);
        terrainUv.push((x + SOL_W / 2) / SOL_W, (z + SOL_W / 2) / SOL_W);
      }
    }
    for (let j = 0; j < NA; j++) terrainIdx.push(0, 1 + (j + 1) % NA, 1 + j);
    for (let i = 1; i < NR; i++) for (let j = 0; j < NA; j++) {
      const a = 1 + (i - 1) * NA + j, b = 1 + (i - 1) * NA + (j + 1) % NA, c = a + NA, d = b + NA;
      terrainIdx.push(a, d, c, a, b, d);
    }
    const geoTerrain = new T.BufferGeometry();
    geoTerrain.setAttribute('position', new T.Float32BufferAttribute(terrainPos, 3));
    geoTerrain.setAttribute('uv', new T.Float32BufferAttribute(terrainUv, 2));
    geoTerrain.setIndex(terrainIdx); geoTerrain.computeVertexNormals();
    const matSol = new T.MeshStandardMaterial({ map: texSol, color: 0xe6e0d2, roughness: 0.95, metalness: 0, envMapIntensity: 0.15 });
    const terrain = new T.Mesh(geoTerrain, matSol);
    terrain.receiveShadow = true; terrain.name = 'terrain';
    s.add(terrain);

    /* -- la prairie fine : mêmes sommets que le terrain jusqu'à 3,5 m, une
          texture à 3,5 mm par pixel qui s'efface sur les bords */
    const PR_SPAN = 10400, NR_PR = 28, kPr = 2048 / PR_SPAN;
    function prPx(x, z) { return { x: (x + PR_SPAN / 2) * kPr, y: (PR_SPAN / 2 - (z - ZC)) * kPr }; }
    const texPrairie = o.toile(2048, 2048, function (g, W, H) {
      const R = Alea(71);
      g.fillStyle = '#a89c6e'; g.fillRect(0, 0, W, H);
      taches(g, W, H, 60, 160, 420, ['rgba(120,124,78,A)', 'rgba(150,132,90,A)', 'rgba(132,136,86,A)'], 0.4, R);
      taches(g, W, H, 260, 50, 260, ['rgba(140,135,88,A)', 'rgba(196,182,134,A)', 'rgba(156,150,98,A)', 'rgba(118,122,84,A)', 'rgba(160,138,98,A)', 'rgba(184,168,120,A)'], 0.34, R);
      /* des plages de terre nue, avec quelques cailloux */
      for (let i = 0; i < 14; i++) {
        const x = R() * W, y = R() * H, r = 40 + R() * 90;
        const c = g.createRadialGradient(x, y, 2, x, y, r);
        c.addColorStop(0, 'rgba(150,130,96,0.75)'); c.addColorStop(0.6, 'rgba(150,130,96,0.45)'); c.addColorStop(1, 'rgba(150,130,96,0)');
        g.fillStyle = c; g.fillRect(x - r, y - r, 2 * r, 2 * r);
        for (let k = 0; k < 10; k++) {
          const qx = x + (R() - 0.5) * r * 1.2, qy = y + (R() - 0.5) * r * 1.2, rq = 1 + R() * 2.2;
          g.fillStyle = 'hsl(' + (34 + R() * 12) + ',' + (8 + R() * 10) + '%,' + (56 + R() * 26) + '%)'; g.beginPath(); g.ellipse(qx, qy, rq, rq * 0.7, R() * 3, 0, 6.29); g.fill();
          g.fillStyle = 'rgba(40,35,28,0.35)'; g.beginPath(); g.ellipse(qx + 0.8, qy + 1, rq, rq * 0.45, 0, 0, 6.29); g.fill();
        }
      }
      grainHerbe(g, W, H, 60000, 7, 0.55, R);
      grainHerbe(g, W, H, 20000, 4, 0.4, R);
      g.lineCap = 'round';
      for (let i = 0; i < 12000; i++) {
        const x = R() * W, y = R() * H, l = 3 + R() * 6, a = -Math.PI / 2 + (R() - 0.5) * 1.4;
        g.strokeStyle = R() < 0.5 ? 'rgba(126,138,84,0.5)' : 'rgba(150,158,96,0.45)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
      }
      fleurs(g, W, H, 36, 60, R);
      peindreOmbres(g, prPx, kPr, 0.9);
      /* le bord s'efface, en ellipse comme le maillage */
      const fondu = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2);
      fondu.addColorStop(0, 'rgba(0,0,0,1)'); fondu.addColorStop(0.74, 'rgba(0,0,0,1)'); fondu.addColorStop(0.95, 'rgba(0,0,0,0)'); fondu.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalCompositeOperation = 'destination-in';
      g.save(); g.translate(W / 2, H / 2); g.scale(1, AZ / AX); g.translate(-W / 2, -H / 2); g.fillStyle = fondu; g.fillRect(0, 0, W, H); g.restore();
      g.globalCompositeOperation = 'source-over';
    });
    texPrairie.anisotropy = 8;
    {
      const pos = [], uv = [], idx = [];
      pos.push(0, hauteur(0, ZC) + 2, ZC); uv.push(0.5, 0.5);
      for (let i = 1; i <= NR_PR; i++) {
        const r = R_MAX * Math.pow(i / NR, 1.8);
        for (let j = 0; j < NA; j++) {
          const a = j / NA * Math.PI * 2, x = r * Math.cos(a), z = ZC + r * Math.sin(a) * (AZ / AX);
          pos.push(x, hauteur(x, z) + 2, z);
          uv.push((x + PR_SPAN / 2) / PR_SPAN, ((z - ZC) + PR_SPAN / 2) / PR_SPAN);
        }
      }
      for (let j = 0; j < NA; j++) idx.push(0, 1 + (j + 1) % NA, 1 + j);
      for (let i = 1; i < NR_PR; i++) for (let j = 0; j < NA; j++) {
        const a = 1 + (i - 1) * NA + j, b = 1 + (i - 1) * NA + (j + 1) % NA, c = a + NA, d = b + NA;
        idx.push(a, d, c, a, b, d);
      }
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeVertexNormals();
      const m = new T.Mesh(g, new T.MeshStandardMaterial({ map: texPrairie, color: 0xe6e0d2, roughness: 0.95, metalness: 0, envMapIntensity: 0.15, transparent: true, depthWrite: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
      m.receiveShadow = true; m.renderOrder = 1; m.name = 'prairie';
      s.add(m);
    }

    /* -- le dallage, à plat sur le belvédère */
    {
      const geo = new T.PlaneGeometry(DAL.span, DAL.span);
      const mat = new T.MeshStandardMaterial({ map: texDallage.map, color: 0xd6d2ca, normalMap: texDallage.normale, normalScale: new T.Vector2(0.8, 0.8), roughness: 0.82, metalness: 0, envMapIntensity: 0.18, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
      const m = new T.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2; m.position.set(0, -750 + 4, ZC);
      m.receiveShadow = true; m.renderOrder = 1; m.name = 'dallage';
      s.add(m);
    }

    /* ================================================================== */
    /*  5. Le ciel : un dôme vu de l'intérieur, non brumé, non tonemappé,  */
    /*  pour que la brume de la scène se raccorde exactement à l'horizon   */
    /* ================================================================== */
    const ciel = new T.Mesh(new T.SphereGeometry(37000, 48, 24), new T.MeshBasicMaterial({ map: texCiel, side: T.BackSide, fog: false }));
    ciel.material.toneMapped = false; ciel.position.set(0, 0, 0); ciel.name = 'ciel';
    s.add(ciel);
    /* la brume : rien à 3 m, un quart à 12 m, moitié à 20 m, l'horizon fondu */
    s.fog = new T.FogExp2(BRUME_HEX, 4.2e-5);

    /* ================================================================== */
    /*  6. Les troncs et les feuillages                                    */
    /* ================================================================== */
    function geoDepuis(t) {
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(t.pos, 3));
      g.setAttribute('uv', new T.Float32BufferAttribute(t.uv, 2));
      g.setIndex(t.idx); g.computeVertexNormals();
      return g;
    }
    const matEcorce = new T.MeshStandardMaterial({ map: texEcorce.map, normalMap: texEcorce.normale, normalScale: new T.Vector2(1.1, 1.1), roughness: 0.94, metalness: 0, envMapIntensity: 0.1 });
    const matEcorceLoin = new T.MeshStandardMaterial({ color: 0x776f64, roughness: 1, metalness: 0, envMapIntensity: 0 });
    [[troncOmbre, matEcorce, true, 'troncOmbre'], [troncProche, matEcorce, false, 'troncProche'], [troncAnneau, matEcorce, false, 'troncAnneau'], [troncLoin, matEcorceLoin, false, 'troncLoin']].forEach(function (d) {
      if (!d[0].pos.length) return;
      const m = new T.Mesh(geoDepuis(d[0]), d[1]); m.castShadow = d[2]; m.receiveShadow = d[2]; m.name = d[3]; s.add(m);
    });

    /* la carte de feuilles : deux quads croisés, centrés ; la variante k
       prend deux bouquets différents de l'atlas 2 × 2 */
    function geoCarte(k, atlas) {
      const pos = [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0, 0, -0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0, 0.5, -0.5];
      const nrm = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0];
      const uv = [];
      [k, (k + 1) % 4].forEach(function (q) {
        const qx = atlas ? (q % 2) * 0.5 : 0, qy = atlas ? Math.floor(q / 2) * 0.5 : 0, w = atlas ? 0.5 : 1;
        uv.push(qx, qy, qx + w, qy, qx + w, qy + w, qx, qy + w);
      });
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
      g.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3));
      g.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
      return g;
    }
    const cartes = [0, 1, 2, 3].map(function (k) { return geoCarte(k, true); }), carteLoin = geoCarte(0, false);
    function feuillage(liste, tex, nom, ombre, alphaTest, variantes) {
      if (!liste.length) return;
      /* Lambert : sur un quad à normale constante, l'éclairage par sommet
         vaut l'éclairage par pixel, pour une fraction du coût */
      const mat = new T.MeshLambertMaterial({ map: tex, alphaTest: alphaTest, side: T.DoubleSide, emissive: 0x1c2416, emissiveIntensity: 0.12 });
      mat.name = 'feuilles';
      const nV = variantes ? 4 : 1, groupes = [];
      for (let v = 0; v < nV; v++) groupes.push([]);
      liste.forEach(function (f, i) { groupes[i % nV].push(f); });
      const M = new T.Matrix4(), X = new T.Vector3(), Y = new T.Vector3(), Z = new T.Vector3(), up = new T.Vector3(), col = new T.Color();
      groupes.forEach(function (gr, v) {
        if (!gr.length) return;
        const im = new T.InstancedMesh(variantes ? cartes[v] : carteLoin, mat, gr.length);
        gr.forEach(function (f, i) {
          Z.copy(f.n);
          const roll = alea() * 6.28;
          up.set(Math.cos(roll), Math.sin(roll) * 0.6 + 0.4, Math.sin(roll) * 0.7);
          X.crossVectors(up, Z).normalize(); if (X.lengthSq() < 0.01) X.set(1, 0, 0);
          Y.crossVectors(Z, X);
          M.makeBasis(X.multiplyScalar(f.s), Y.multiplyScalar(f.s), Z.multiplyScalar(f.s)); M.setPosition(f.p);
          im.setMatrixAt(i, M);
          col.setRGB(f.c[0], f.c[1], f.c[2]); im.setColorAt(i, col);
        });
        im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
        im.frustumCulled = false; im.name = nom + v;
        im.castShadow = ombre; im.receiveShadow = false;
        if (ombre) im.customDepthMaterial = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking, map: tex, alphaTest: alphaTest, side: T.DoubleSide });
        s.add(im);
      });
    }
    feuillage(touffesOmbre, texFeuilles, 'feuillageOmbre', true, 0.5, true);
    feuillage(touffesProche, texFeuilles, 'feuillageProche', false, 0.5, true);
    feuillage(touffesAnneau, texFeuilles, 'feuillageAnneau', false, 0.45, true);
    feuillage(touffesLoin, texFeuillesLoin, 'feuillageLoin', false, 0.4, false);

    /* ================================================================== */
    /*  7. Le mur de pierres sèches, au bord de la terrasse, avec son      */
    /*  chaperon de travertin qui déborde                                  */
    /* ================================================================== */
    {
      /* le mur occupe la zone S_TERRASSE..S_MUR du profil, soit u = 1 + sm / K_SM */
      const uA = 1 + 5200 / K_SM, uB = 1 + 5560 / K_SM, th0 = 186, th1 = 354, n = 84;
      const hauts = [];
      for (let i = 0; i <= n; i++) { const th = th0 + (th1 - th0) * i / n, p = posRelief(1 + 5100 / K_SM, th); hauts.push(hauteurBrute(p.x, p.z) + 60); }
      const lissesH = hauts.map(function (h, i) { let sum = 0, c = 0; for (let k = -3; k <= 3; k++) { const j = i + k; if (j >= 0 && j <= n) { sum += hauts[j]; c++; } } return sum / c; });
      /* une bande le long du mur : faces avant / dessus / arrière entre les
         courbes uA et uB, de yBas(i) à yHaut(i) ; retourne la géométrie */
      function bande(ua, ub, yBas, yHaut, vEch, uEch, dessusV) {
        const pos = [], uv = [], idx = [];
        let longueur = 0, prev = null;
        for (let i = 0; i <= n; i++) {
          const th = th0 + (th1 - th0) * i / n, pA = posRelief(ua, th), pB = posRelief(ub, th), yH = yHaut(i), yB = yBas(i);
          if (prev) longueur += Math.hypot(pB.x - prev.x, pB.z - prev.z); prev = pB;
          const u = longueur / uEch;
          pos.push(pB.x, yB, pB.z, pB.x, yH, pB.z, pB.x, yH, pB.z, pA.x, yH, pA.z, pA.x, yH, pA.z, pA.x, yB, pA.z);
          uv.push(u, 0, u, (yH - yB) / vEch, u, 0, u, dessusV, u, (yH - yB) / vEch, u, 0);
        }
        for (let i = 0; i < n; i++) {
          const a = i * 6, b = (i + 1) * 6;
          idx.push(a, b, a + 1, b, b + 1, a + 1);
          idx.push(a + 2, b + 2, a + 3, b + 2, b + 3, a + 3);
          idx.push(a + 4, b + 4, a + 5, b + 4, b + 5, a + 5);
        }
        const g = new T.BufferGeometry();
        g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
        g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
        g.setIndex(idx); g.computeVertexNormals();
        return g;
      }
      const mur = new T.Mesh(bande(uA, uB, function (i) { return lissesH[i] - 1750; }, function (i) { return lissesH[i]; }, 400, 1600, 0.2),
        new T.MeshStandardMaterial({ map: texPierre.map, normalMap: texPierre.normale, normalScale: new T.Vector2(1, 1), roughness: 0.92, metalness: 0, envMapIntensity: 0.1, side: T.DoubleSide }));
      mur.name = 'mur'; s.add(mur);
      const chaperon = new T.Mesh(bande(uA - 0.04, uB + 0.04, function (i) { return lissesH[i] - 4; }, function (i) { return lissesH[i] + 100; }, 500, 1000, 0.7),
        new T.MeshStandardMaterial({ map: texTravertin, roughness: 0.6, metalness: 0, envMapIntensity: 0.2, side: T.DoubleSide }));
      chaperon.name = 'chaperon'; s.add(chaperon);
    }

    /* ================================================================== */
    /*  8. Les cyprès de la crête d'en face                                */
    /* ================================================================== */
    {
      const pts = [];
      for (let i = 0; i <= 14; i++) {
        const t = i / 14;
        let r = 0.16 + 0.84 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 1.1);
        if (i === 14) r = 0.01;
        pts.push(new T.Vector2(r + 0.04 * Math.sin(t * 40), t));
      }
      const geo = new T.LatheGeometry(pts, 10);
      const mat = new T.MeshStandardMaterial({ color: 0x3f4b38, roughness: 1, metalness: 0, envMapIntensity: 0 });
      const spots = [];
      for (let th = 192; th <= 348; th += entre(6, 9)) spots.push({ r: entre(29500, 33500), th: th });
      for (let th = 120; th <= 170; th += entre(8, 12)) spots.push({ r: entre(27000, 31000), th: th });
      for (let th = 10; th <= 60; th += entre(8, 12)) spots.push({ r: entre(27000, 31000), th: th });
      const im = new T.InstancedMesh(geo, mat, spots.length), M = new T.Matrix4(), q = new T.Quaternion(), p = new T.Vector3(), sc = new T.Vector3();
      spots.forEach(function (sp, i) {
        const a = sp.th * RAD, x = sp.r * Math.cos(a), z = ZC + sp.r * Math.sin(a) * (AZ / AX), H = entre(6500, 9500), R = entre(900, 1300);
        p.set(x, hauteur(x, z) - 200, z); q.setFromAxisAngle(new T.Vector3(0, 1, 0), alea() * 6.28); sc.set(R, H, R);
        M.compose(p, q, sc); im.setMatrixAt(i, M);
      });
      im.instanceMatrix.needsUpdate = true; im.frustumCulled = false; im.name = 'cypres';
      s.add(im);
    }

    /* ================================================================== */
    /*  9. Les pieds de la table : deux lames de marbre                     */
    /* ================================================================== */
    {
      const mat = new T.MeshPhysicalMaterial({ color: 0xf3efe6, roughness: 0.3, metalness: 0, clearcoat: 0.4, clearcoatRoughness: 0.25, envMapIntensity: 0.35 });
      [-640, 640].forEach(function (x) {
        const pied = new T.Mesh(new T.BoxGeometry(70, 730, 400), mat);
        pied.position.set(x, -o.BOITE.paroi - TABLE.E - 365 + 4, TABLE.z);
        pied.castShadow = true; pied.receiveShadow = true; pied.name = 'pied';
        s.add(pied);
      });
    }

    moi.redessine();
  }

  function construire(moi, o) {
    const TABLE = { L: 1800, P: 530, E: 30, z: 65 };
    moi.table = TABLE;
    lumieres(moi, o);
    table(moi, o, TABLE);
    moi.miroir = miroir(moi, o, TABLE);
    paysage(moi, o, TABLE);
  }

  window.MB_DECOR = { construire: construire };
})();

/* Maison Bosoni — le composeur de coffret.
 *
 * La boîte est celle du dossier de fabrication : un mailer de 254 × 254 × 127 mm
 * intérieur, noir mat, signature dorée sur le couvercle, phrase dorée à
 * l'intérieur, papier de soie noir. Les flacons sont couchés sur la soie, et
 * c'est le rangement qui décide s'il reste de la place : chaque article occupe
 * son empreinte réelle, en millimètres, sur le plancher de la boîte. */
(function () {
  'use strict';
  const T = window.THREE;
  const FORMES = window.MB_FORMES;
  if (!T || !FORMES) return;

  /* ------------------------------------------------------------------ */
  /*  La boîte                                                            */
  /* ------------------------------------------------------------------ */
  const BOITE = { L: 254, P: 127, paroi: 3, marge: 5, hauteurUtile: 118 };
  const UTILE = BOITE.L - 2 * BOITE.marge;   // 240 mm de côté pour ranger
  const RAD = Math.PI / 180;

  /* ------------------------------------------------------------------ */
  /*  Petits outils de géométrie                                          */
  /* ------------------------------------------------------------------ */
  function surface(fn, nu, nv) {
    const pos = [], uv = [], idx = [];
    for (let j = 0; j <= nv; j++) {
      for (let i = 0; i <= nu; i++) {
        const p = fn(i / nu, j / nv);
        pos.push(p[0], p[1], p[2]); uv.push(i / nu, j / nv);
      }
    }
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  function toile(w, h, dessin) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    dessin(g, w, h);
    const t = new T.CanvasTexture(c);
    t.encoding = T.sRGBEncoding;
    t.anisotropy = 8;
    t.redessine = function () { dessin(g, w, h); t.needsUpdate = true; };
    return t;
  }

  const POLICES = { serif: '"Bodoni Moda", "Cormorant", Georgia, serif', mono: '"IBM Plex Mono", Menlo, monospace' };
  const TOILES = [];

  function lathe(profil, a, b, R, H, mat, segs) {
    const pts = [];
    for (let i = b; i >= a; i--) pts.push(new T.Vector2(Math.max(profil[i] * R, 0.01), (1 - i / 60) * H));
    const m = new T.Mesh(new T.LatheGeometry(pts, segs || 72), mat);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  /* ------------------------------------------------------------------ */
  /*  Matières                                                            */
  /* ------------------------------------------------------------------ */
  const M = {
    verre: new T.MeshPhysicalMaterial({ color: 0x0b0803, roughness: 0.15, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 2.4 }),
    verreNoir: new T.MeshPhysicalMaterial({ color: 0x070605, roughness: 0.14, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 2.2 }),
    capsule: new T.MeshPhysicalMaterial({ color: 0x0b0b0a, roughness: 0.34, metalness: 0.2, clearcoat: 0.6, clearcoatRoughness: 0.25, envMapIntensity: 1.6 }),
    bouchon: new T.MeshStandardMaterial({ color: 0x3e3e3e, roughness: 0.46, metalness: 0.4, envMapIntensity: 1.6 }),
    etain: new T.MeshStandardMaterial({ color: 0x121212, roughness: 0.33, metalness: 0.35, envMapIntensity: 1.8 }),
    argent: new T.MeshStandardMaterial({ color: 0xcfd2d4, roughness: 0.24, metalness: 0.9, envMapIntensity: 2.0 }),
    carton: new T.MeshPhysicalMaterial({ color: 0x0c0b0a, roughness: 0.74, metalness: 0, clearcoat: 0.06, clearcoatRoughness: 0.6, envMapIntensity: 0.22 }),
    cartonInt: new T.MeshPhysicalMaterial({ color: 0x100e0c, roughness: 0.8, metalness: 0, envMapIntensity: 0.18 }),
    kraft: new T.MeshStandardMaterial({ color: 0x8a6743, roughness: 0.92, metalness: 0, envMapIntensity: 0.5 }),
    soie: new T.MeshPhysicalMaterial({ color: 0x0d0c0b, roughness: 0.66, metalness: 0, side: T.DoubleSide, sheen: new T.Color(0x3a3632), envMapIntensity: 0.3 }),
    papier: new T.MeshStandardMaterial({ color: 0xf7efe4, roughness: 0.85, metalness: 0, envMapIntensity: 0.4 })
  };

  /* ------------------------------------------------------------------ */
  /*  Étiquettes                                                          */
  /* ------------------------------------------------------------------ */
  function etiquette(f, w, h) {
    const tx = f.texte;
    const t = toile(w, h, function (g, W, H) {
      g.clearRect(0, 0, W, H);
      if (!f.direct) { g.fillStyle = f.fond; g.fillRect(0, 0, W, H); }
      g.textAlign = 'center';
      const k = W / 1400;
      g.fillStyle = f.or; g.font = '500 ' + Math.round(46 * k) + 'px ' + POLICES.mono;
      if (tx.haut1) g.fillText(tx.haut1, W / 2, H * 0.20);
      if (tx.haut2) g.fillText(tx.haut2, W / 2, H * 0.268);
      g.fillStyle = f.encre;
      const gros = tx.nom.length <= 3;
      g.font = '400 ' + Math.round((gros ? 300 : 210) * k) + 'px ' + POLICES.serif;
      g.fillText(tx.nom, W / 2, H * (gros ? 0.66 : 0.62));
      g.fillStyle = f.or; g.font = '500 ' + Math.round(40 * k) + 'px ' + POLICES.mono;
      if (tx.bas1) g.fillText(tx.bas1, W / 2, H * 0.79);
      g.font = '500 ' + Math.round(34 * k) + 'px ' + POLICES.mono;
      if (tx.bas2) g.fillText(tx.bas2, W / 2, H * 0.866);
    });
    TOILES.push(t);
    return t;
  }

  /* ------------------------------------------------------------------ */
  /*  Un article : construit debout, base en y = 0, face avant vers +z    */
  /* ------------------------------------------------------------------ */
  function construire(sku) {
    const f = FORMES[sku];
    const g = new T.Group();
    if (f.type === 'lathe') {
      const R = f.D / 2, H = f.H, p = f.profil, c1 = f.coupes[0], c2 = f.coupes[1];
      if (f.matiere === 'etain') {
        g.add(lathe(p, 0, c1, R, H, M.capsule));
        g.add(lathe(p, c1, c2, R, H, M.argent));
        g.add(lathe(p, c2, 60, R, H, M.etain));
        [c2, 57].forEach(function (i) {
          const r = p[i] * R + 0.3;
          const an = new T.Mesh(new T.CylinderGeometry(r, r, H * 0.012, 72, 1, true), M.argent);
          an.position.y = (1 - i / 60) * H; g.add(an);
        });
      } else {
        g.add(lathe(p, 0, c1, R, H, f.matiere === 'verre-noir' ? M.capsule : M.bouchon));
        g.add(lathe(p, c1, c2, R, H, M.capsule));
        g.add(lathe(p, c2, 60, R, H, f.matiere === 'verre-noir' ? M.verreNoir : M.verre));
      }
      const fond = new T.Mesh(new T.CircleGeometry(p[60] * R, 48), f.matiere === 'etain' ? M.etain : M.verreNoir);
      fond.rotation.x = Math.PI / 2; g.add(fond);
      const t0 = f.etiq[0], t1 = f.etiq[1], th = f.etiq[2] * RAD;
      const rEt = p[Math.round(((t0 + t1) / 2) * 60)] * R + (f.direct ? 0.15 : 0.35);
      const hEt = (t1 - t0) * H;
      const et = new T.Mesh(new T.CylinderGeometry(rEt, rEt, hEt, 96, 1, true, -th, 2 * th),
        new T.MeshStandardMaterial({ map: etiquette(f, 1400, 1000), roughness: f.direct ? 0.42 : 0.78, metalness: f.direct ? 0.35 : 0,
                                     emissive: f.direct ? 0x6a5222 : 0x000000, emissiveMap: f.direct ? null : null,
                                     transparent: !!f.direct, side: T.DoubleSide, envMapIntensity: f.direct ? 1.2 : 0.6 }));
      et.position.y = (1 - (t0 + t1) / 2) * H;
      g.add(et);
      g.userData.empreinte = { L: H, W: f.D, h: f.D, poser: function (o) { o.rotateZ(-Math.PI / 2); o.rotateY(-Math.PI / 2); o.position.set(-H / 2, f.D / 2, 0); } };
    } else if (f.type === 'flacon') {
      const R = f.W / 2, H = f.H, p = f.profil, c1 = f.coupes[0], k = f.T / f.W;
      const bouchon = lathe(p, 0, c1, R, H, M.capsule, 48);
      const corps = lathe(p, c1, 60, R, H, M.verreNoir, 96);
      corps.scale.z = k; bouchon.scale.z = Math.min(1, k * 1.6);
      g.add(bouchon); g.add(corps);
      const fond = new T.Mesh(new T.CircleGeometry(p[60] * R, 48), M.verreNoir);
      fond.rotation.x = Math.PI / 2; fond.scale.y = k; g.add(fond);
      // le décor épouse la face plate du flacon : un secteur du même tour, décollé d'un tiers de millimètre
      const iA = 52, iB = 24, ang = 34 * RAD;
      const pts = [];
      for (let i = iA; i >= iB; i--) pts.push(new T.Vector2(p[i] * R + 0.35 / k, (1 - i / 60) * H));
      const dec = new T.Mesh(new T.LatheGeometry(pts, 48, -ang, 2 * ang),
        new T.MeshStandardMaterial({ map: etiquette(f, 1000, 1100), transparent: true, roughness: f.direct ? 0.42 : 0.8, metalness: f.direct ? 0.35 : 0,
                                     emissive: f.direct ? 0x6a5222 : 0x000000, envMapIntensity: f.direct ? 1.2 : 0.5, side: T.DoubleSide }));
      dec.scale.z = k;
      g.add(dec);
      g.userData.empreinte = { L: f.W, W: H, h: f.T, poser: function (o) { o.rotateX(-Math.PI / 2); o.position.set(0, f.T / 2, H / 2); } };
    } else {
      const dessus = etiquette(f, 1400, Math.round(1400 * f.W / f.L));
      const mats = [M.carton, M.carton, new T.MeshStandardMaterial({ map: dessus, roughness: 0.5, metalness: 0.2, envMapIntensity: 0.9 }), M.carton, M.carton, M.carton];
      const b = new T.Mesh(new T.BoxGeometry(f.L, f.H, f.W), mats);
      b.castShadow = true; b.receiveShadow = true; g.add(b);
      g.userData.empreinte = { L: f.L, W: f.W, h: f.H, poser: function (o) { o.position.set(0, f.H / 2, 0); } };
    }
    g.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return g;
  }

  /* ------------------------------------------------------------------ */
  /*  Le rangement : des étagères en profondeur, les articles couchés      */
  /* ------------------------------------------------------------------ */
  function ranger(articles) {
    const items = articles.map(function (a) {
      const e = FORMES[a.sku], emp = empreinteDe(e);
      return { sku: a.sku, L: emp.L, W: emp.W, h: emp.h };
    });
    if (items.some(function (it) { return it.h > BOITE.hauteurUtile || Math.min(it.L, it.W) > UTILE; })) return null;
    // du plus encombrant au plus petit, chaque article dans son orientation la plus plate
    items.forEach(function (it) { if (it.L > UTILE && it.W <= UTILE) { const s = it.L; it.L = it.W; it.W = s; it.rot = 90; } else it.rot = 0; });
    items.sort(function (a, b) { return (b.W * b.L) - (a.W * a.L); });
    const etageres = [];
    for (const it of items) {
      let pose = false;
      for (const e of etageres) {
        if (it.W <= e.W && e.long + it.L <= UTILE) { e.items.push(it); e.long += it.L; pose = true; break; }
      }
      if (pose) continue;
      const total = etageres.reduce(function (s, e) { return s + e.W; }, 0);
      if (total + it.W <= UTILE) { etageres.push({ W: it.W, long: it.L, items: [it] }); continue; }
      // dernière chance : tourné de 90°
      const alt = { sku: it.sku, L: it.W, W: it.L, h: it.h, rot: it.rot ? 0 : 90 };
      let ok = false;
      if (alt.L <= UTILE) {
        for (const e of etageres) { if (alt.W <= e.W && e.long + alt.L <= UTILE) { e.items.push(alt); e.long += alt.L; ok = true; break; } }
        if (!ok && total + alt.W <= UTILE) { etageres.push({ W: alt.W, long: alt.L, items: [alt] }); ok = true; }
      }
      if (!ok) return null;
    }
    // on répartit : les étagères en profondeur, les articles en largeur, tout centré
    const places = [];
    const sommeW = etageres.reduce(function (s, e) { return s + e.W; }, 0);
    const gapZ = (UTILE - sommeW) / (etageres.length + 1);
    let z = -UTILE / 2 + gapZ;
    etageres.forEach(function (e, ie) {
      const gapX = (UTILE - e.long) / (e.items.length + 1);
      let x = -UTILE / 2 + gapX;
      // les bouchons alternent d'une étagère à l'autre, pour que l'œil circule
      const sens = ie % 2 === 0 ? 1 : -1;
      e.items.forEach(function (it) {
        places.push({ sku: it.sku, x: x + it.L / 2, z: z + e.W / 2, rot: it.rot, sens: sens, L: it.L, W: it.W });
        x += it.L + gapX;
      });
      z += e.W + gapZ;
    });
    const aire = items.reduce(function (s, it) { return s + it.L * it.W; }, 0) / (UTILE * UTILE);
    return { places: places, aire: aire, etageres: etageres.length };
  }
  function empreinteDe(f) {
    if (f.type === 'lathe') return { L: f.H, W: f.D, h: f.D };
    if (f.type === 'flacon') return { L: f.W, W: f.H, h: f.T };
    return { L: f.L, W: f.W, h: f.H };
  }

  /* ------------------------------------------------------------------ */
  /*  La scène                                                            */
  /* ------------------------------------------------------------------ */
  function Composeur(racine) {
    this.racine = racine;
    this.scene3d = racine.querySelector('.mb-coffret__scene');
    this.canvas = this.scene3d.querySelector('canvas');
    this.donnees = JSON.parse(racine.querySelector('[data-mb-coffret-donnees]').textContent);
    this.choix = [];          // [{sku, variant, prix, titre, format}]
    this.objets = {};         // sku -> Group
    this.anims = [];
    this.vue = { az: -30 * RAD, el: 38 * RAD, dist: 1120, cible: new T.Vector3(0, 92, -10) };
    this.construireScene();
    this.construireUI();
    this.observer();
    this.redessine();
  }

  Composeur.prototype.construireScene = function () {
    const r = new T.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.outputEncoding = T.sRGBEncoding;
    r.toneMapping = T.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.96;
    r.shadowMap.enabled = true;
    r.shadowMap.type = T.PCFSoftShadowMap;
    this.r = r;
    const s = new T.Scene(); this.s = s;

    /* le studio : sombre, avec trois boîtes à lumière — c'est lui qui fait les
       reflets du verre, et les longs reflets blancs sur le marbre */
    const env = toile(1024, 512, function (g) {
      const grad = g.createLinearGradient(0, 0, 0, 512);
      grad.addColorStop(0, '#2b2926'); grad.addColorStop(0.45, '#171614'); grad.addColorStop(0.62, '#0e0d0c'); grad.addColorStop(1, '#1b1917');
      g.fillStyle = grad; g.fillRect(0, 0, 1024, 512);
      function tache(x, y, rx, ry, force) {
        const b = g.createRadialGradient(x, y, 2, x, y, Math.max(rx, ry));
        b.addColorStop(0, 'rgba(255,252,244,' + force + ')'); b.addColorStop(0.5, 'rgba(255,250,238,' + (force * 0.45) + ')'); b.addColorStop(1, 'rgba(255,250,238,0)');
        g.save(); g.translate(x, y); g.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry)); g.translate(-x, -y);
        g.fillStyle = b; g.fillRect(x - rx * 2, y - ry * 2, rx * 4, ry * 4); g.restore();
      }
      tache(250, 200, 110, 210, 1.0); tache(760, 215, 42, 190, 0.95); tache(512, 40, 420, 70, 0.55);
    });
    env.mapping = T.EquirectangularReflectionMapping;
    const pm = new T.PMREMGenerator(r); pm.compileEquirectangularShader();
    s.environment = pm.fromEquirectangular(env).texture;

    /* tout ce qui entoure la boîte (lumière, table, paysage) est dans mb-coffret-decor.js */
    if (window.MB_DECOR) window.MB_DECOR.construire(this, { T: T, BOITE: BOITE, RAD: RAD, toile: toile });
    this.construireBoite();
    this.construireSoie();

    const cam = new T.PerspectiveCamera(24, 1, 50, 40000); this.cam = cam;
    this.placerCamera();
    this.redimensionner();
  };

  Composeur.prototype.construireBoite = function () {
    const s = this.s, L = BOITE.L, P = BOITE.P, e = BOITE.paroi, demi = L / 2 + e;
    const boite = new T.Group(); this.boite = boite; s.add(boite);
    function bloc(w, h, d, mats) {
      const m = new T.Mesh(new T.BoxGeometry(w, h, d), mats); m.castShadow = true; m.receiveShadow = true; return m;
    }
    // ordre des faces : +x, -x, +y, -y, +z, -z
    const K = M.kraft, C = M.carton, I = M.cartonInt;
    const plancher = bloc(2 * demi, e, 2 * demi, [C, C, I, C, C, C]); plancher.position.y = -e / 2; boite.add(plancher);
    const arriere = bloc(2 * demi, P, e, [K, K, K, C, I, C]); arriere.position.set(0, P / 2, -L / 2 - e / 2); boite.add(arriere);
    const avant = bloc(2 * demi, P, e, [K, K, K, C, C, I]); avant.position.set(0, P / 2, L / 2 + e / 2); boite.add(avant);
    const gauche = bloc(e, P, L, [I, C, K, C, K, K]); gauche.position.set(-L / 2 - e / 2, P / 2, 0); boite.add(gauche);
    const droite = bloc(e, P, L, [C, I, K, C, K, K]); droite.position.set(L / 2 + e / 2, P / 2, 0); boite.add(droite);

    /* le couvercle, articulé sur l'arête arrière, ouvert à 128° comme sur les planches */
    const charniere = new T.Group(); charniere.position.set(0, P, -demi); boite.add(charniere);
    const couvercle = bloc(2 * demi, e, 2 * demi, [K, K, C, C, K, K]); couvercle.position.set(0, e / 2, demi); charniere.add(couvercle);
    const dedans = new T.Mesh(new T.PlaneGeometry(2 * demi - 2, 2 * demi - 2),
      new T.MeshPhysicalMaterial({ map: this.texteCouvercleInterieur(), roughness: 0.7, metalness: 0.05, clearcoat: 0.15, clearcoatRoughness: 0.5, envMapIntensity: 0.6 }));
    dedans.rotation.x = Math.PI / 2; dedans.position.set(0, -0.15, demi); charniere.add(dedans);
    const dessus = new T.Mesh(new T.PlaneGeometry(2 * demi - 2, 2 * demi - 2),
      new T.MeshPhysicalMaterial({ map: this.texteCouvercleExterieur(), roughness: 0.7, metalness: 0.05, clearcoat: 0.18, clearcoatRoughness: 0.5, envMapIntensity: 0.6 }));
    dessus.rotation.x = -Math.PI / 2; dessus.position.set(0, e + 0.15, demi); charniere.add(dessus);
    charniere.rotation.x = -128 * RAD;
    this.charniere = charniere;

    /* la carte, le pied sur la soie, le haut appuyé contre la paroi du fond :
       inclinée de 24° pour qu'on la lise aussi bien de face que de dessus */
    this.toileCarte = this.texteCarte();
    const carte = new T.Mesh(new T.PlaneGeometry(105, 74), new T.MeshStandardMaterial({ map: this.toileCarte, roughness: 0.85, envMapIntensity: 0.4, side: T.DoubleSide }));
    const pente = 24 * RAD, demiCarte = 37;
    carte.position.set(0, 3.5 + demiCarte * Math.cos(pente), -L / 2 + 0.6 + demiCarte * Math.sin(pente));
    carte.rotation.x = -pente; carte.castShadow = true; carte.receiveShadow = true;
    boite.add(carte);
  };

  Composeur.prototype.texteCouvercleInterieur = function () {
    const t = toile(1024, 1024, function (g, W, H) {
      g.fillStyle = '#131110'; g.fillRect(0, 0, W, H);
      const v = g.createRadialGradient(W * 0.5, H * 0.42, 40, W * 0.5, H * 0.42, W * 0.8);
      v.addColorStop(0, 'rgba(58,52,46,0.55)'); v.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = v; g.fillRect(0, 0, W, H);
      const px = W / 260;               // millimètres → pixels de texture
      const or = '#C3A059';
      g.fillStyle = or; g.fillRect(W / 2 - 30 * px, H * 0.33, 60 * px, 1.2 * px);
      g.textAlign = 'center';
      g.fillStyle = or; g.font = 'italic 400 ' + Math.round(20 * px) + 'px ' + POLICES.serif;
      g.fillText('L’or liquide', W / 2, H * 0.455);
      g.fillText('s’invite à votre table', W / 2, H * 0.545);
      g.font = '500 ' + Math.round(4.5 * px) + 'px ' + POLICES.mono;
      g.fillStyle = 'rgba(195,160,89,0.88)';
      g.fillText('M A I S O N   B O S O N I   —   P A R I S', W / 2, H * 0.655);
    });
    TOILES.push(t); return t;
  };
  Composeur.prototype.texteCouvercleExterieur = function () {
    const t = toile(1024, 1024, function (g, W, H) {
      const grad = g.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, '#1c1917'); grad.addColorStop(0.55, '#131110'); grad.addColorStop(1, '#0e0d0c');
      g.fillStyle = grad; g.fillRect(0, 0, W, H);
      const px = W / 260;
      g.textAlign = 'right'; g.fillStyle = '#C3A059';
      g.font = '400 ' + Math.round(13 * px) + 'px ' + POLICES.serif;
      g.fillText('Maison Bosoni.', W - 28 * px, H - 28 * px);
    });
    TOILES.push(t); return t;
  };
  /* découpe un texte en lignes qui tiennent dans `large` pixels, avec la police
     courante du contexte ; un mot trop long pour une ligne est coupé lettre à lettre */
  function couperLignes(g, texte, large) {
    const lignes = [];
    let ligne = '';
    texte.split(/\s+/).filter(Boolean).forEach(function (mot) {
      const essai = ligne ? ligne + ' ' + mot : mot;
      if (g.measureText(essai).width <= large) { ligne = essai; return; }
      if (ligne) lignes.push(ligne);
      ligne = '';
      if (g.measureText(mot).width <= large) { ligne = mot; return; }
      for (let i = 0; i < mot.length; i++) {
        if (g.measureText(ligne + mot[i]).width > large && ligne) { lignes.push(ligne); ligne = ''; }
        ligne += mot[i];
      }
    });
    if (ligne) lignes.push(ligne);
    return lignes;
  }

  /* la carte crème posée au fond de la boîte : la signature seule, ou bien,
     quand le client a écrit un mot, la signature qui remonte, un filet doré,
     et le mot en italique, centré, sur une à trois lignes */
  Composeur.prototype.texteCarte = function () {
    const moi = this;
    const t = toile(1050, 740, function (g, W, H) {
      const mot = (moi.mot || '').replace(/\s+/g, ' ').trim();
      g.fillStyle = '#F7EFE4'; g.fillRect(0, 0, W, H);
      g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      if (!mot) {
        g.fillStyle = '#C3A059'; g.fillRect(W / 2 - 60, H * 0.36, 120, 3);
        g.fillStyle = '#8c7534';
        g.font = '400 100px ' + POLICES.serif; g.fillText('Maison Bosoni.', W / 2, H * 0.60);
        g.font = '500 30px ' + POLICES.mono; g.fillText('P A R I S', W / 2, H * 0.74);
        return;
      }
      g.fillStyle = '#8c7534';
      g.font = '400 52px ' + POLICES.serif; g.fillText('Maison Bosoni.', W / 2, H * 0.135);
      g.fillStyle = '#C3A059'; g.fillRect(W / 2 - 40, H * 0.19, 80, 3);
      // le mot : on part grand, on réduit tant qu'il ne tient pas sur trois lignes
      const large = W * 0.9;
      let taille = 100, lignes;
      for (;;) {
        g.font = 'italic 400 ' + taille + 'px ' + POLICES.serif;
        lignes = couperLignes(g, mot, large);
        if (lignes.length <= 3 || taille <= 44) break;
        taille -= 4;
      }
      // le bloc est centré un peu haut : de face, c'est le haut de la carte qui dépasse des flacons
      const interligne = taille * 1.18;
      const centre = H * 0.56;
      const y0 = centre - interligne * (lignes.length - 1) / 2 + taille * 0.35;
      g.fillStyle = '#211714';
      lignes.forEach(function (l, i) { g.fillText(l, W / 2, y0 + i * interligne); });
    });
    TOILES.push(t); return t;
  };

  /* le papier de soie : une feuille froissée au fond, quatre pans qui montent
     le long des parois et retombent par-dessus le bord */
  Composeur.prototype.construireSoie = function () {
    const L = BOITE.L, P = BOITE.P, e = BOITE.paroi;
    function ondes(x, z) {
      return 1.3 * Math.sin(x / 23 + 0.7) * Math.sin(z / 31) + 0.8 * Math.sin(x / 11 - z / 17 + 1.9) + 0.5 * Math.sin(z / 9 + x / 41) + 0.35 * Math.sin(x / 5.5 + z / 7);
    }
    const fond = new T.Mesh(surface(function (u, v) {
      const x = -L / 2 + 1.5 + u * (L - 3), z = -L / 2 + 1.5 + v * (L - 3);
      return [x, 1.4 + ondes(x, z) + 0.9, z];
    }, 72, 72), M.soie);
    fond.receiveShadow = true; fond.castShadow = false;
    this.boite.add(fond);

    const pan = new T.Mesh(surface(function (u, v) {
      const x = -L / 2 + 2 + u * (L - 4);
      const rip = 1.1 * Math.sin(x / 13 + 0.4) + 0.6 * Math.sin(x / 5 + 2.1);
      let y, z;
      if (v < 0.70) { const k = v / 0.70; y = 2 + k * (P - 2); z = -L / 2 + 1.6 + rip * Math.sin(k * Math.PI) * 0.9; }
      else if (v < 0.85) { const a = (v - 0.70) / 0.15 * Math.PI; y = P + 3.2 * Math.sin(a); z = -L / 2 - e / 2 - 3.2 * Math.cos(a) * -1; z = -L / 2 - e / 2 + 3.2 * Math.cos(a); }
      else { const k = (v - 0.85) / 0.15; const bas = 20 + 5 * Math.sin(x / 19 + 1) + 3 * Math.sin(x / 7); y = P - k * bas; z = -L / 2 - e - 0.4 - k * 2.5 + rip * 0.4 * k; }
      return [x, y, z];
    }, 96, 40), M.soie);
    pan.castShadow = true; pan.receiveShadow = true;
    for (let i = 0; i < 4; i++) {
      const p = i === 0 ? pan : pan.clone();
      p.rotation.y = i * Math.PI / 2;
      this.boite.add(p);
    }
  };

  Composeur.prototype.placerCamera = function () {
    const v = this.vue;
    const x = v.dist * Math.cos(v.el) * Math.sin(v.az), y = v.dist * Math.sin(v.el), z = v.dist * Math.cos(v.el) * Math.cos(v.az);
    this.cam.position.set(x, y, z).add(v.cible);
    this.cam.lookAt(v.cible);
  };

  Composeur.prototype.redimensionner = function () {
    const w = this.scene3d.clientWidth || 800, h = this.scene3d.clientHeight || 640;
    this.r.setSize(w, h, false);
    this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
    this.redessine();
  };

  Composeur.prototype.redessine = function () {
    const moi = this;
    if (this._demande) return;
    this._demande = requestAnimationFrame(function () {
      moi._demande = 0;
      const t = performance.now();
      let encore = false;
      moi.anims = moi.anims.filter(function (a) { const fini = a(t); return !fini; });
      if (moi.anims.length) encore = true;
      moi.placerCamera();
      moi.cam.updateMatrixWorld();
      if (moi.miroir) moi.miroir.rendre(moi.cam);
      moi.r.render(moi.s, moi.cam);
      if (encore) moi.redessine();
    });
  };

  function ease(k) { return 1 - Math.pow(1 - k, 3); }
  Composeur.prototype.animer = function (duree, fn) {
    const t0 = performance.now();
    this.anims.push(function (t) { const k = Math.min(1, (t - t0) / duree); fn(ease(k), k); return k >= 1; });
    this.redessine();
  };

  /* ------------------------------------------------------------------ */
  /*  Le contenu                                                          */
  /* ------------------------------------------------------------------ */
  Composeur.prototype.rangement = function () {
    const plan = ranger(this.choix);
    if (!plan) return;
    const moi = this;
    plan.places.forEach(function (p) {
      let g = moi.objets[p.sku];
      const neuf = !g;
      if (neuf) {
        g = new T.Group();
        const corps = construire(p.sku);
        corps.userData.empreinte.poser(corps);
        g.add(corps);
        g.userData.corps = corps;
        moi.objets[p.sku] = g;
        moi.boite.add(g);
      }
      const cibleRot = (p.rot === 90 ? Math.PI / 2 : 0) + (p.sens < 0 ? Math.PI : 0);
      const cible = new T.Vector3(p.x, 1.6 + 1.2, p.z);
      if (neuf) {
        g.position.set(p.x, cible.y + 150, p.z); g.rotation.y = cibleRot;
        g.userData.depart = g.position.clone();
        moi.animer(720, function (k) { g.position.y = cible.y + 150 * (1 - k); });
      } else {
        const d0 = g.position.clone(), r0 = g.rotation.y;
        let dr = cibleRot - r0; while (dr > Math.PI) dr -= 2 * Math.PI; while (dr < -Math.PI) dr += 2 * Math.PI;
        moi.animer(560, function (k) {
          g.position.set(d0.x + (cible.x - d0.x) * k, cible.y + 18 * Math.sin(Math.PI * k), d0.z + (cible.z - d0.z) * k);
          g.rotation.y = r0 + dr * k;
        });
      }
    });
    this.plan = plan;
  };

  Composeur.prototype.ajouter = function (article) {
    if (this.choix.some(function (c) { return c.sku === article.sku; })) return true;
    const essai = this.choix.concat([article]);
    if (!ranger(essai)) return false;
    this.choix = essai;
    this.rangement();
    this.majUI();
    return true;
  };
  Composeur.prototype.retirer = function (sku) {
    this.choix = this.choix.filter(function (c) { return c.sku !== sku; });
    const g = this.objets[sku];
    if (g) {
      const moi = this, y0 = g.position.y;
      this.animer(420, function (k, kk) { g.position.y = y0 + 160 * kk * kk; if (kk >= 1) { moi.boite.remove(g); } });
      delete this.objets[sku];
    }
    this.rangement();
    this.majUI();
  };

  /* ------------------------------------------------------------------ */
  /*  L'interface                                                         */
  /* ------------------------------------------------------------------ */
  function euros(cents) { return (cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }

  Composeur.prototype.construireUI = function () {
    const moi = this, r = this.racine;
    const vus = {};
    Array.prototype.slice.call(r.querySelectorAll('.mb-coffret__article')).forEach(function (li) {
      const sku = li.dataset.sku;
      if (!FORMES[sku] || vus[sku]) li.remove(); else vus[sku] = true;
    });
    this.ui = {
      boutons: Array.prototype.slice.call(r.querySelectorAll('.mb-coffret__ajout')),
      jauge: r.querySelector('.mb-coffret__jauge'),
      jaugeBarre: r.querySelector('.mb-coffret__jauge-barre i'),
      jaugeTexte: r.querySelector('.mb-coffret__jauge-texte'),
      contenu: r.querySelector('[data-contenu]'),
      total: r.querySelector('[data-total]'),
      etat: r.querySelector('.mb-coffret__etat'),
      cta: r.querySelector('[data-panier]'),
      rythme: r.querySelectorAll('input[name="mb-rythme"]'),
      mot: r.querySelector('[data-mot]'),
      motCompte: r.querySelector('[data-mot-compte]')
    };
    this.ui.boutons.forEach(function (b) {
      b.addEventListener('click', function () {
        const li = b.closest('.mb-coffret__article');
        const a = { sku: li.dataset.sku, variant: li.dataset.variant, prix: +li.dataset.prix, titre: li.dataset.titre, format: li.dataset.format };
        if (b.dataset.etat === 'dedans') { moi.retirer(a.sku); return; }
        if (!moi.ajouter(a)) {
          li.dataset.refus = 'true'; setTimeout(function () { delete li.dataset.refus; }, 400);
          moi.ui.etat.textContent = 'Plus de place pour ce format. Retirez un flacon pour l’accueillir.';
        } else moi.ui.etat.textContent = '';
      });
    });
    r.querySelectorAll('.mb-coffret__vue').forEach(function (b) {
      b.addEventListener('click', function () {
        r.querySelectorAll('.mb-coffret__vue').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        const dessus = b.dataset.vue === 'dessus';
        const v = moi.vue, az0 = v.az, el0 = v.el, az1 = dessus ? 0 : -30 * RAD, el1 = dessus ? 86 * RAD : 38 * RAD;
        moi.animer(700, function (k) { v.az = az0 + (az1 - az0) * k; v.el = el0 + (el1 - el0) * k; });
      });
    });
    if (this.ui.cta) this.ui.cta.addEventListener('click', function () { moi.panier(); });
    this.ui.rythme.forEach(function (i) { i.addEventListener('change', function () { moi.majUI(); }); });

    /* le mot personnalisé : le compteur suit chaque frappe, la carte se redessine
       un instant après, quand la main s'arrête */
    if (this.ui.mot) {
      let minuterie = 0;
      const compter = function () {
        const max = +moi.ui.mot.getAttribute('maxlength') || 160, n = moi.ui.mot.value.length;
        if (moi.ui.motCompte) moi.ui.motCompte.textContent = n + ' / ' + max;
        const champ = moi.ui.mot.parentNode;
        if (champ && champ.dataset) champ.dataset.plein = n >= max ? 'true' : 'false';
      };
      this.ui.mot.addEventListener('input', function () {
        compter();
        clearTimeout(minuterie);
        minuterie = setTimeout(function () { moi.ecrireCarte(moi.ui.mot.value); }, 150);
      });
      compter();
      if (this.ui.mot.value.trim()) this.ecrireCarte(this.ui.mot.value);
    }

    /* on attrape la scène pour la faire tourner */
    let saisie = null;
    this.scene3d.addEventListener('pointerdown', function (e) { saisie = { x: e.clientX, y: e.clientY, az: moi.vue.az, el: moi.vue.el }; moi.scene3d.setPointerCapture(e.pointerId); });
    this.scene3d.addEventListener('pointermove', function (e) {
      if (!saisie) return;
      moi.vue.az = Math.max(-75 * RAD, Math.min(75 * RAD, saisie.az - (e.clientX - saisie.x) * 0.006));
      moi.vue.el = Math.max(16 * RAD, Math.min(86 * RAD, saisie.el + (e.clientY - saisie.y) * 0.005));
      moi.redessine();
    });
    const lacher = function () { saisie = null; };
    this.scene3d.addEventListener('pointerup', lacher); this.scene3d.addEventListener('pointercancel', lacher);
    this.majUI();
  };

  Composeur.prototype.majUI = function () {
    const moi = this, ui = this.ui, dedans = {};
    this.choix.forEach(function (c) { dedans[c.sku] = c; });
    ui.boutons.forEach(function (b) {
      const li = b.closest('.mb-coffret__article'), sku = li.dataset.sku;
      if (dedans[sku]) { b.dataset.etat = 'dedans'; b.disabled = false; b.textContent = '−'; b.setAttribute('aria-label', 'Retirer du coffret'); return; }
      const ok = !!ranger(moi.choix.concat([{ sku: sku }]));
      b.dataset.etat = ok ? 'libre' : 'plein'; b.disabled = !ok; b.textContent = '+';
      b.setAttribute('aria-label', ok ? 'Ajouter au coffret' : 'Plus de place pour ce format');
    });
    const plan = this.choix.length ? ranger(this.choix) : { aire: 0 };
    const pct = Math.round(Math.min(1, plan.aire / 0.82) * 100);
    ui.jaugeBarre.style.width = pct + '%';
    const restant = ui.boutons.filter(function (b) { return b.dataset.etat === 'libre'; }).length;
    ui.jauge.dataset.plein = restant === 0 ? 'true' : 'false';
    ui.jaugeTexte.textContent = this.choix.length === 0 ? 'Le coffret attend vos flacons'
      : (restant === 0 ? this.choix.length + (this.choix.length > 1 ? ' flacons' : ' flacon') + ' · le coffret est plein'
        : this.choix.length + (this.choix.length > 1 ? ' flacons' : ' flacon') + ' · il reste de la place');
    this.scene3d.dataset.vide = this.choix.length ? 'false' : 'true';
    if (ui.contenu) {
      ui.contenu.innerHTML = '';
      this.choix.forEach(function (c) {
        const l = document.createElement('div'); l.className = 'mb-coffret__ligne';
        l.innerHTML = '<span>' + c.titre + ' <small>· ' + c.format + '</small></span><span>' + euros(c.prix) + '</span>';
        ui.contenu.appendChild(l);
      });
    }
    const total = this.choix.reduce(function (s, c) { return s + c.prix; }, 0);
    if (ui.total) ui.total.textContent = this.choix.length ? 'à partir de ' + euros(total) : '';
    const mensuel = Array.prototype.some.call(ui.rythme, function (i) { return i.checked && i.value === 'mensuel'; });
    if (ui.cta) { ui.cta.disabled = this.choix.length === 0; ui.cta.textContent = mensuel ? 'Recevoir ce coffret chaque mois' : 'Ajouter ce coffret au panier'; }
  };

  Composeur.prototype.ecrireCarte = function (texte) {
    const mot = (texte || '').replace(/\s+/g, ' ').trim();
    if (mot === (this.mot || '')) return;
    this.mot = mot;
    if (this.toileCarte) this.toileCarte.redessine();
    this.redessine();
  };

  Composeur.prototype.panier = function () {
    const mensuel = Array.prototype.some.call(this.ui.rythme, function (i) { return i.checked && i.value === 'mensuel'; });
    const mot = this.ui.mot ? this.ui.mot.value.trim() : '';
    const items = this.choix.map(function (c) {
      const props = { '_Coffret': 'Maison Bosoni', 'Rythme': mensuel ? 'Chaque mois' : 'Une fois' };
      if (mot) props['Mot personnalisé'] = mot;
      return { id: +c.variant, quantity: 1, properties: props };
    });
    if (window.MB_COFFRET_PANIER) return window.MB_COFFRET_PANIER(items);
    const moi = this;
    this.ui.cta.disabled = true; this.ui.etat.textContent = 'Un instant…';
    fetch('/cart/add.js', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify({ items: items }) })
      .then(function (rep) { if (!rep.ok) throw new Error(rep.status); window.location.href = '/cart'; })
      .catch(function () { moi.ui.cta.disabled = false; moi.ui.etat.textContent = 'Le panier n’a pas répondu. Réessayez, s’il vous plaît.'; });
  };

  Composeur.prototype.observer = function () {
    const moi = this;
    if (window.ResizeObserver) new ResizeObserver(function () { moi.redimensionner(); }).observe(this.scene3d);
    else window.addEventListener('resize', function () { moi.redimensionner(); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { TOILES.forEach(function (t) { t.redessine(); }); moi.redessine(); });
  };

  function demarrer() {
    document.querySelectorAll('[data-mb-coffret]').forEach(function (el) { if (!el.__composeur) el.__composeur = new Composeur(el); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer();
  window.MB_COFFRET = { ranger: ranger, FORMES: FORMES };
})();
