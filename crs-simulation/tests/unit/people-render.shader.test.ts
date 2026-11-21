// Marquages des objets transparents (bouclier) : le texte de l'atlas ne doit être plaqué que sur la face avant.
// Le bouclier est dessiné des deux côtés ; sans garde, l'envers montrait « POLICE » en miroir (vu de dos, vue subjective).
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createPeopleMaterial, createUniforms } from '@/render/people/shader';

function compiledFragment(item: boolean, transparent: boolean): string {
  const mat = createPeopleMaterial(createUniforms(), item, transparent);
  const shader = {
    vertexShader: THREE.ShaderLib.physical.vertexShader,
    fragmentShader: THREE.ShaderLib.physical.fragmentShader,
    uniforms: {} as Record<string, { value: unknown }>,
  };
  mat.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as unknown as THREE.WebGLRenderer);
  return shader.fragmentShader;
}

describe('rendu des personnages — marquages recto seulement', () => {
  it('le matériau des objets transparents est double face (le bouclier se voit de dos)', () => {
    expect(createPeopleMaterial(createUniforms(), true, true).side).toBe(THREE.DoubleSide);
  });

  it('le texte de l’atlas n’est appliqué que sur la face avant, jamais dans la passe de l’envers', () => {
    for (const [item, transparent] of [[true, true], [true, false], [false, false]] as const) {
      const f = compiledFragment(item, transparent);
      const at = f.indexOf('texture2D( uAtlas');
      expect(at).toBeGreaterThan(0);
      const head = f.slice(0, at);
      // la condition qui précède la lecture de l'atlas exige la face avant…
      expect(head).toMatch(/crsRecto = gl_FrontFacing/);
      expect(head).toMatch(/vCrsText\.z > 0\.5 && crsRecto/);
      // …et la passe de l'envers (FLIP_SIDED, où Three.js inverse gl.frontFace) n'en reçoit jamais
      expect(head).toMatch(/#ifdef FLIP_SIDED\s+bool crsRecto = false;/);
    }
  });
});
