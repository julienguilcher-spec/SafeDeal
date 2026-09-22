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

    /* la carte, adossée à la paroi du fond */
    const carte = new T.Mesh(new T.PlaneGeometry(105, 74), new T.MeshStandardMaterial({ map: this.texteCarte(), roughness: 0.85, envMapIntensity: 0.4, side: T.DoubleSide }));
    carte.position.set(0, 42, -L / 2 + 9); carte.rotation.x = -12 * RAD; carte.castShadow = true; carte.receiveShadow = true;
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
  Composeur.prototype.texteCarte = function () {
    const t = toile(1050, 740, function (g, W, H) {
      g.fillStyle = '#F7EFE4'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#C3A059'; g.fillRect(W / 2 - 60, H * 0.36, 120, 3);
      g.textAlign = 'center'; g.fillStyle = '#8c7534';
      g.font = '400 100px ' + POLICES.serif; g.fillText('Maison Bosoni.', W / 2, H * 0.60);
      g.font = '500 30px ' + POLICES.mono; g.fillText('P A R I S', W / 2, H * 0.74);
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
      rythme: r.querySelectorAll('input[name="mb-rythme"]')
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

  Composeur.prototype.panier = function () {
    const mensuel = Array.prototype.some.call(this.ui.rythme, function (i) { return i.checked && i.value === 'mensuel'; });
    const items = this.choix.map(function (c) {
      return { id: +c.variant, quantity: 1, properties: { '_Coffret': 'Maison Bosoni', 'Rythme': mensuel ? 'Chaque mois' : 'Une fois' } };
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
