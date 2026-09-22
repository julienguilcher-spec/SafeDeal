/* Maison Bosoni — le décor du composeur : tout ce qui entoure la boîte.
 *
 * La boîte, les flacons et le papier de soie vivent dans mb-coffret.app.js.
 * Ici : la lumière, la table de marbre blanc avec son reflet, et le paysage
 * autour, une oliveraie construite en volume. Les distances sont en
 * millimètres, l'origine est au centre du fond de la boîte, y vers le haut,
 * la caméra par défaut regarde depuis +z (devant) et un peu depuis -x. */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /*  La lumière : un soleil de fin d'après-midi venant de l'arrière     */
  /*  gauche, un ciel clair, et les petites lampes qui dessinent les     */
  /*  arêtes de la boîte.                                                 */
  /* ------------------------------------------------------------------ */
  function lumieres(moi, o) {
    const T = o.T, s = moi.s;
    s.add(new T.HemisphereLight(0xdfe8f2, 0xcfc4b0, 0.3));
    const soleil = new T.DirectionalLight(0xfff0d8, 1.35);
    soleil.position.set(-380, 500, -430); soleil.castShadow = true;
    soleil.shadow.mapSize.set(2048, 2048);
    soleil.shadow.camera.near = 200; soleil.shadow.camera.far = 1600;
    soleil.shadow.camera.left = -620; soleil.shadow.camera.right = 620; soleil.shadow.camera.top = 620; soleil.shadow.camera.bottom = -620;
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
  /*  À construire ici : le sol, les oliviers, le ciel, la brume.        */
  /* ------------------------------------------------------------------ */
  function paysage(moi, o, TABLE) {
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
