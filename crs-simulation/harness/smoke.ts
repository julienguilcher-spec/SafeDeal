// Banc d'essai minimal : vérifie la chaîne Vite + Three.js + WebGL logiciel.
import * as THREE from 'three';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fb8d0);
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(6, 5, 9);
camera.lookAt(0, 1, 0);
const sun = new THREE.DirectionalLight(0xffffff, 2.5);
sun.position.set(8, 12, 4);
sun.castShadow = true;
scene.add(sun, new THREE.HemisphereLight(0xcfe0ff, 0x555044, 0.9));
const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x6b6b68 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 1.8, 0.4), new THREE.MeshStandardMaterial({ color: 0x1b2a4a }), 100);
inst.castShadow = true;
const m = new THREE.Matrix4();
for (let i = 0; i < 100; i++) { m.makeTranslation((i % 10) - 4.5, 0.9, Math.floor(i / 10) - 4.5); inst.setMatrixAt(i, m); }
scene.add(inst);
let frames = 0;
renderer.setAnimationLoop(() => { renderer.render(scene, camera); frames++; (window as any).__frames = frames; });
