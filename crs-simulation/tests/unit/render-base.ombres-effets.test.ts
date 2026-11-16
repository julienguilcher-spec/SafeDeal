import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SunLight } from 'three/addons/lights/SunLight.js';
import { LIGHT_DIRECTION_STEP, directionChanged } from '@/render/base/lighting';
import { SCREEN_EFFECTS, ScreenFxState } from '@/render/base/screenFx';
import { SharedUniformsHub } from '@/render/base/uniforms';

const DEG = Math.PI / 180;

/** Caméra de jeu posée en (x, 1,7, z), regard vers +z légèrement plongeant. */
function gameCamera(x: number, z: number, yaw = 0): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 8000);
  cam.rotation.order = 'YXZ';
  cam.position.set(x, 1.7, z);
  cam.rotation.set(-0.1, yaw + Math.PI, 0);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  return cam;
}

function sunLight(mapSize: number, far: number): SunLight {
  const sun = new SunLight(0xffffff, 3);
  sun.position.set(0.35, 0.82, 0.45).normalize();
  sun.castShadow = true;
  sun.shadow.mapSize.set(mapSize, mapSize);
  sun.shadow.radius = 2;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = far;
  sun.updateMatrixWorld(true);
  return sun;
}

describe('rendu de base — ombre directionnelle qui suit la caméra', () => {
  it('les cascades se déplacent par pas entiers de texel quand la caméra avance (pas de scintillement)', () => {
    const sun = sunLight(2048, 140);
    const shadow = sun.shadow;
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    const centers: THREE.Vector3[][] = [[], []];
    const texel: number[] = [0, 0];
    // la caméra avance par tout petits pas (3 mm), bien moins qu'un texel
    for (let i = 0; i < 400; i++) {
      shadow.updateMatrices(sun, gameCamera(10 + i * 0.003, 5 + i * 0.002));
      for (let c = 0; c < 2; c++) {
        const cam = shadow.getCamera(c);
        centers[c]!.push(cam.position.clone());
        // côté d'un texel dans le monde = largeur du volume / résolution utile de la cascade
        texel[c] = (cam.right - cam.left) / (2048 * (1 - 2 * Math.min(0.25, 3 / 2048)));
        if (i === 0 && c === 0) {
          right.setFromMatrixColumn(cam.matrixWorld, 0);
          up.setFromMatrixColumn(cam.matrixWorld, 1);
        }
      }
    }
    for (let c = 0; c < 2; c++) {
      let moves = 0;
      for (let i = 1; i < centers[c]!.length; i++) {
        const d = centers[c]![i]!.clone().sub(centers[c]![i - 1]!);
        const dx = d.dot(right) / texel[c]!;
        const dy = d.dot(up) / texel[c]!;
        // déplacement dans le plan de l'ombre : un nombre ENTIER de texels (0 le plus souvent)
        expect(Math.abs(dx - Math.round(dx))).toBeLessThan(1e-3);
        expect(Math.abs(dy - Math.round(dy))).toBeLessThan(1e-3);
        if (Math.round(dx) !== 0 || Math.round(dy) !== 0) moves++;
      }
      // la cascade a bien suivi la caméra (1,2 m parcourus), mais par sauts rares
      expect(moves).toBeGreaterThan(0);
      expect(moves).toBeLessThan(120);
    }
    // finesse : moins de 6 cm par texel près de la caméra en qualité haute, la seconde cascade plus large
    expect(texel[0]!).toBeLessThan(0.06);
    expect(texel[1]!).toBeGreaterThan(texel[0]! * 2);
    expect(texel[1]!).toBeLessThan(0.3);
  });

  it('la taille des cascades ne change pas quand la caméra tourne (projection stable)', () => {
    const sun = sunLight(2048, 140);
    const shadow = sun.shadow;
    shadow.updateMatrices(sun, gameCamera(0, 0, 0));
    const w0 = shadow.getCamera(0).right - shadow.getCamera(0).left;
    const w1 = shadow.getCamera(1).right - shadow.getCamera(1).left;
    for (let yaw = 0.1; yaw < 6.2; yaw += 0.37) {
      shadow.updateMatrices(sun, gameCamera(3, -2, yaw));
      expect(shadow.getCamera(0).right - shadow.getCamera(0).left).toBeCloseTo(w0, 4);
      expect(shadow.getCamera(1).right - shadow.getCamera(1).left).toBeCloseTo(w1, 4);
    }
  });

  it('la direction du soleil n’est transmise à l’ombre que par pas d’un quart de degré', () => {
    const dir = (elevDeg: number): [number, number, number] => [0, Math.sin(elevDeg * DEG), Math.cos(elevDeg * DEG)];
    const a = dir(40);
    expect(directionChanged(...a, ...dir(40.1))).toBe(false);
    expect(directionChanged(...a, ...dir(40.2))).toBe(false);
    expect(directionChanged(...a, ...dir(40.3))).toBe(true);
    expect(LIGHT_DIRECTION_STEP).toBeCloseTo(0.25 * DEG, 9);
    // à l'horloge standard d'une mission (×8), le soleil met plus de 7 s réelles à parcourir un pas
    const degPerRealSecond = (15 / 3600) * 8;
    expect(0.25 / degPerRealSecond).toBeGreaterThan(7);
  });
});

describe('rendu de base — effets d’écran', () => {
  const run = (s: ScreenFxState, seconds: number, each?: () => void): void => {
    const n = Math.round(seconds * 60);
    for (let i = 0; i < n; i++) {
      s.update(1 / 60);
      if (each) each();
    }
  };

  it('connaît les cinq effets du contrat', () => {
    expect([...SCREEN_EFFECTS]).toEqual(['gas', 'flash', 'wet', 'pain', 'visor']);
    const s = new ScreenFxState();
    expect(s.idle).toBe(true);
    s.set('inconnu' as 'gas', 1);
    s.set('gas', NaN);
    expect(s.idle).toBe(true);
  });

  it('gaz : monte vite, redescend lentement, avec des clignements réflexes', () => {
    const s = new ScreenFxState();
    s.set('gas', 0.8);
    run(s, 0.5);
    expect(s.get('gas')).toBeGreaterThan(0.6);
    run(s, 1.5);
    expect(s.get('gas')).toBeCloseTo(0.8, 2);
    let blinks = 0;
    let closed = false;
    let closedFrames = 0;
    let frames = 0;
    run(s, 20, () => {
      frames++;
      if (s.blink > 0.5) {
        closedFrames++;
        if (!closed) blinks++;
        closed = true;
      } else {
        closed = false;
      }
    });
    expect(blinks).toBeGreaterThan(6);       // les yeux piquent : on cligne souvent
    expect(blinks).toBeLessThan(40);
    expect(closedFrames / frames).toBeLessThan(0.25);   // mais on voit la plupart du temps
    // sorti du nuage : les yeux pleurent encore deux bonnes secondes
    s.set('gas', 0);
    run(s, 1);
    expect(s.get('gas')).toBeGreaterThan(0.15);
    run(s, 6);
    expect(s.get('gas')).toBe(0);
    expect(s.blink).toBe(0);
    // valeurs bornées à [0, 1]
    s.set('gas', 7);
    run(s, 3);
    expect(s.get('gas')).toBeLessThanOrEqual(1);
  });

  it('flash : aveuglement immédiat puis retour progressif de la vue, sans rappel', () => {
    const s = new ScreenFxState();
    s.set('flash', 1);
    expect(s.get('flash')).toBe(1);          // immédiat
    run(s, 0.3);
    expect(s.get('flash')).toBeGreaterThan(0.75);
    let prev = s.get('flash');
    run(s, 3, () => {
      expect(s.get('flash')).toBeLessThanOrEqual(prev);
      prev = s.get('flash');
    });
    expect(s.get('flash')).toBeLessThan(0.02);
    run(s, 3);
    expect(s.get('flash')).toBe(0);
    expect(s.idle).toBe(true);
    // un flash plus faible n'abaisse pas un flash en cours
    s.set('flash', 0.9);
    s.set('flash', 0.2);
    expect(s.get('flash')).toBeCloseTo(0.9, 6);
  });

  it('douleur : impulsion qui s’estompe ; entretenue si on la rappelle à chaque image', () => {
    const s = new ScreenFxState();
    s.set('pain', 0.8);
    run(s, 0.2);
    expect(s.get('pain')).toBeGreaterThan(0.5);
    run(s, 4);
    expect(s.get('pain')).toBe(0);
    for (let i = 0; i < 120; i++) {
      s.set('pain', 0.6);
      s.update(1 / 60);
    }
    expect(s.get('pain')).toBeGreaterThan(0.55);
  });

  it('gouttes et visière : niveaux tenus tant qu’on ne les change pas', () => {
    const s = new ScreenFxState();
    s.set('wet', 0.7);
    s.set('visor', 1);
    run(s, 0.1);
    expect(s.get('visor')).toBeGreaterThan(0.4);
    expect(s.get('visor')).toBeLessThan(1);      // la visière bascule, elle ne claque pas
    run(s, 1);
    expect(s.get('visor')).toBe(1);
    expect(s.get('wet')).toBeCloseTo(0.7, 2);
    run(s, 30);
    expect(s.get('wet')).toBeCloseTo(0.7, 3);
    expect(s.get('visor')).toBe(1);
    s.set('visor', 0);
    s.set('wet', 0);
    run(s, 0.5);
    expect(s.get('visor')).toBeLessThan(0.02);
    expect(s.get('wet')).toBeGreaterThan(0.3);   // les gouttes sèchent lentement
    run(s, 12);
    expect(s.idle).toBe(true);
    // remise à zéro de session
    s.set('gas', 1);
    s.set('flash', 1);
    run(s, 1);
    s.reset();
    expect(s.idle).toBe(true);
  });
});

describe('rendu de base — uniformes partagés et aspect mouillé', () => {
  it('expose les uniformes attendus avec des valeurs initiales saines', () => {
    const hub = new SharedUniformsHub();
    const u = hub.uniforms;
    expect(Object.keys(u).sort()).toEqual([
      'uDaylight', 'uFogColor', 'uLightning', 'uNight', 'uRain', 'uSkyColor', 'uStreetLights', 'uSunColor', 'uSunDir',
      'uTime', 'uWetness', 'uWind',
    ]);
    expect(hub.wetness).toBe(0);
    u.uWetness.value = 0.6;
    u.uNight.value = 0.3;
    u.uStreetLights.value = 1;
    expect(hub.wetness).toBe(0.6);
    expect(hub.night).toBe(0.3);
    expect(hub.streetLights).toBe(1);
  });

  it('applyWetness greffe le shader standard en conservant le greffon existant', () => {
    const hub = new SharedUniformsHub();
    const mat = new THREE.MeshStandardMaterial({ color: 0x777777 });
    let previousCalled = 0;
    mat.onBeforeCompile = (shader) => {
      previousCalled++;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n// greffon précédent');
    };
    mat.customProgramCacheKey = () => 'cle-precedente';
    const version = mat.version;
    hub.applyWetness(mat, { darken: 0.3, roughness: 0.2 });
    expect(mat.version).toBeGreaterThan(version);       // recompilation demandée
    const shader = {
      uniforms: {} as Record<string, THREE.IUniform>,
      vertexShader: '',
      fragmentShader: THREE.ShaderLib.standard.fragmentShader,
    };
    mat.onBeforeCompile(shader as never, null as never);
    expect(previousCalled).toBe(1);
    const f = shader.fragmentShader;
    expect(f).toContain('// greffon précédent');
    expect(f).toContain('uniform float uWetness;');
    expect(f).toContain('diffuseColor.rgb *= 1.0 - 0.300 * crsWet;');
    expect(f).toContain('roughnessFactor = mix( roughnessFactor, 0.200, crsWet * 0.9 );');
    expect(f).toContain('outgoingLight += uSkyColor');
    // le même objet uniforme que celui mis à jour à chaque image
    expect(shader.uniforms['uWetness']).toBe(hub.uniforms.uWetness);
    expect(shader.uniforms['uSkyColor']).toBe(hub.uniforms.uSkyColor);
    expect(mat.customProgramCacheKey()).toContain('cle-precedente');
    expect(mat.customProgramCacheKey()).toContain('mouille');
    // sans reflet ni restriction aux surfaces horizontales
    const plain = new THREE.MeshStandardMaterial();
    hub.applyWetness(plain, { sheen: 0, upOnly: false });
    const s2 = { uniforms: {}, vertexShader: '', fragmentShader: THREE.ShaderLib.standard.fragmentShader };
    plain.onBeforeCompile(s2 as never, null as never);
    expect(s2.fragmentShader).not.toContain('outgoingLight += uSkyColor');
    expect(s2.fragmentShader).toContain('float crsWetUp = 1.0;');
  });
});
