/* Uniformes partagés avec les autres modules de rendu, et aspect mouillé des matériaux standard. */

import * as THREE from 'three';
import type { RenderUniformsApi, SharedUniforms, WetOptions } from './api';

type Shader = { uniforms: Record<string, THREE.IUniform>; vertexShader: string; fragmentShader: string };

export class SharedUniformsHub implements RenderUniformsApi {
  readonly uniforms: SharedUniforms = {
    uTime: { value: 0 },
    uWetness: { value: 0 },
    uRain: { value: 0 },
    uWind: { value: new THREE.Vector3() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color(1, 1, 1) },
    uDaylight: { value: 1 },
    uNight: { value: 0 },
    uStreetLights: { value: 0 },
    uFogColor: { value: new THREE.Color(0.7, 0.75, 0.8) },
    uLightning: { value: 0 },
    uSkyColor: { value: new THREE.Color(0.5, 0.6, 0.75) },
  };

  get wetness(): number {
    return this.uniforms.uWetness.value;
  }

  get night(): number {
    return this.uniforms.uNight.value;
  }

  get streetLights(): number {
    return this.uniforms.uStreetLights.value;
  }

  applyWetness(material: THREE.MeshStandardMaterial, options: WetOptions = {}): void {
    const darken = options.darken ?? 0.4;
    const rough = options.roughness ?? 0.18;
    const upOnly = options.upOnly !== false;
    const sheen = options.sheen ?? 0.45;
    const uWetness = this.uniforms.uWetness;
    const uSkyColor = this.uniforms.uSkyColor;
    const previous = material.onBeforeCompile;
    const previousKey = material.customProgramCacheKey;
    material.onBeforeCompile = function (this: THREE.Material, shader, renderer): void {
      previous.call(this, shader, renderer);
      const sh = shader as unknown as Shader;
      sh.uniforms['uWetness'] = uWetness;
      sh.uniforms['uSkyColor'] = uSkyColor;
      // surfaces tournées vers le ciel seulement : un mur ne retient pas l'eau comme une chaussée
      const up = upOnly
        ? `#ifdef FLAT_SHADED
  float crsWetUp = 1.0;
#else
  float crsWetUp = smoothstep( 0.35, 0.8, inverseTransformDirection( normalize( vNormal ), viewMatrix ).y );
#endif`
        : 'float crsWetUp = 1.0;';
      let f = sh.fragmentShader;
      f = f.replace('#include <common>', '#include <common>\nuniform float uWetness;\nuniform vec3 uSkyColor;\nfloat crsWet;');
      f = f.replace('#include <color_fragment>', `#include <color_fragment>
  ${up}
  crsWet = uWetness * crsWetUp;
  diffuseColor.rgb *= 1.0 - ${darken.toFixed(3)} * crsWet;`);
      f = f.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = mix( roughnessFactor, ${rough.toFixed(3)}, crsWet * 0.9 );`);
      if (sheen > 0) {
        // film d'eau : à incidence rasante la chaussée renvoie le ciel (faux reflet, sans carte d'environnement)
        f = f.replace('#include <opaque_fragment>', `{
    float crsFresnel = pow( 1.0 - saturate( dot( normal, normalize( vViewPosition ) ) ), 5.0 );
    outgoingLight += uSkyColor * ( crsFresnel * crsWet * ${sheen.toFixed(3)} );
  }
  #include <opaque_fragment>`);
      }
      sh.fragmentShader = f;
    };
    material.customProgramCacheKey = function (this: THREE.Material): string {
      return `${previousKey.call(this)}|mouille-${darken}-${rough}-${upOnly ? 1 : 0}-${sheen}`;
    };
    material.needsUpdate = true;
  }
}
