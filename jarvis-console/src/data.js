// Données, utilitaires, constantes des écosystèmes et des agents.
import * as THREE from 'three/webgpu';

/* =====================================================================================
   JARVIS — CONSOLE ÉCOSYSTÈME — moteur 3D (WebGPU, repli WebGL2) + HUD
   ===================================================================================== */

const PARAMS = new URLSearchParams(location.search);
let storedBackend = null; try { storedBackend = sessionStorage.getItem('jarvis.backend'); } catch (_) {}
const DEBUG = {
  forceWebGL: PARAMS.get('backend') === 'webgl' || storedBackend === 'webgl',
  failInit: PARAMS.get('fail') === 'init',
  initTimeout: parseInt(PARAMS.get('initTimeout') || '15000', 10),
  startAt: parseFloat(PARAMS.get('t') || '0') || 0,
  fixedStep: PARAMS.has('fixed') ? (parseFloat(PARAMS.get('fixed')) || 1 / 60) : null,
  quality: PARAMS.has('quality') ? parseInt(PARAMS.get('quality'), 10) : null,
  noSim: PARAMS.get('sim') === '0',
  capture: PARAMS.get('capture') === '1',
};

/* ------------------------------------------------------------------ utilitaires */
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOutQuint = (t) => t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;
const easeOutQuint = (t) => 1 - Math.pow(1 - t, 5);
const easeInOutCubic = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOutExpo = (t) => t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
const damp = (current, target, lambda, dt) => lerp(current, target, 1 - Math.exp(-lambda * dt));
const seg = (t, a, b) => clamp01((t - a) / (b - a));
function mulberry32(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rng = mulberry32(20261103);
const fmtEUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });
const fmtInt = new Intl.NumberFormat('fr-FR');
const fmtPct = (x) => `${Math.round(x * 100)} %`;
const fmtDuration = (s) => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`; };
const fmtTokens = (n) => n >= 1e6 ? `${(n / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} M` : n >= 1e3 ? `${(n / 1e3).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} k` : fmtInt.format(n);
const $ = (id) => document.getElementById(id);

/* ------------------------------------------------------------------ données */
function desat(hex, amount) { const c = new THREE.Color(hex); const hsl = { h: 0, s: 0, l: 0 }; c.getHSL(hsl); c.setHSL(hsl.h, hsl.s * (1 - amount), hsl.l); return c; }
const ECOSYSTEMS = [
  { id: 'studio', name: 'Studio Shopify', hex: '#7FE3FF', color: desat('#7FE3FF', 0.22), center: new THREE.Vector3(-6.8, 1.8, 5.0), radius: 3.1, leader: 'ceo', focusDist: 9.0 },
  { id: 'kcl', name: 'KCL', hex: '#A678FF', color: desat('#A678FF', 0.28), center: new THREE.Vector3(5.0, 2.9, -16.5), radius: 3.6, leader: 'ceo-kcl', focusDist: 10.5 },
  { id: 'redacteur', name: 'Rédacteur', hex: '#3FE08F', color: desat('#3FE08F', 0.22), center: new THREE.Vector3(-2.4, 0.8, -9.5), radius: 0, leader: 'redacteur', focusDist: 4.2 },
];
const ECO = Object.fromEntries(ECOSYSTEMS.map((e) => [e.id, e]));

const AGENT_DEFS = [
  { id: 'ceo', eco: 'studio', name: 'CEO', role: 'Direction du studio', kind: 'crown', leader: true },
  { id: 'design', eco: 'studio', name: 'Design', role: 'Direction artistique', kind: 'lenses' },
  { id: 'constructeur', eco: 'studio', name: 'Constructeur', role: 'Intégration Shopify', kind: 'arm' },
  { id: 'qa', eco: 'studio', name: 'QA', role: 'Contrôle qualité', kind: 'shield' },
  { id: 'admin', eco: 'studio', name: 'Admin Shopify', role: 'Administration boutique', kind: 'bag' },
  { id: 'veille', eco: 'studio', name: 'Veille', role: 'Veille marché', kind: 'radar' },
  { id: 'business', eco: 'studio', name: 'Business', role: 'Analyse business', kind: 'bars' },
  { id: 'publicite', eco: 'studio', name: 'Publicité', role: 'Acquisition', kind: 'cone' },
  { id: 'commandes', eco: 'studio', name: 'Commandes', role: 'Logistique', kind: 'parcel' },
  { id: 'ceo-kcl', eco: 'kcl', name: 'CEO-KCL', role: 'Direction KCL', kind: 'crowncap', leader: true },
  { id: 'veilleur-keats', eco: 'kcl', name: 'Veilleur-KEATS', role: 'Surveillance KEATS', kind: 'radar2' },
  { id: 'planning', eco: 'kcl', name: 'Planning', role: 'Organisation', kind: 'calendar' },
  { id: 'readings', eco: 'kcl', name: 'Readings', role: 'Lectures', kind: 'book' },
  { id: 'controle-qualite', eco: 'kcl', name: 'Contrôle-Qualité', role: 'Relecture', kind: 'lenscheck' },
  { id: 'essais-coach', eco: 'kcl', name: 'Essais-Coach', role: 'Rédaction académique', kind: 'pen' },
  { id: 'revision', eco: 'kcl', name: 'Révision', role: 'Fiches de révision', kind: 'cards' },
  { id: 'videos', eco: 'kcl', name: 'Vidéos', role: 'Cours vidéo', kind: 'screen' },
  { id: 'exos-maths-stats', eco: 'kcl', name: 'Exos-Maths-Stats', role: 'Exercices', kind: 'chart' },
  { id: 'redacteur', eco: 'redacteur', name: 'Rédacteur', role: 'Rédaction', kind: 'quill', leader: true },
];
const HANDOVERS = [
  ['ceo', 'design'], ['design', 'constructeur'], ['constructeur', 'qa'], ['qa', 'admin'], ['admin', 'commandes'],
  ['veille', 'business'], ['business', 'publicite'], ['publicite', 'ceo'],
  ['ceo-kcl', 'planning'], ['veilleur-keats', 'planning'], ['planning', 'readings'], ['readings', 'revision'],
  ['revision', 'exos-maths-stats'], ['essais-coach', 'controle-qualite'], ['videos', 'revision'], ['controle-qualite', 'ceo-kcl'],
];
const INITIAL_STATES = {
  ceo: ['working', 0.55, 'Arbitre la direction artistique de la collection printemps', ['Lecture du brief', 'Réunion de direction', 'Validation du planning'], 1.84],
  design: ['working', 0.85, 'Maquette de la page produit, version 3', ['Moodboard', 'Grille typographique', 'Maquette mobile'], 2.31],
  constructeur: ['working', 0.9, 'Intègre la section héros dans le thème', ['Création des sections', 'Schéma JSON', 'Tests responsive'], 3.12],
  qa: ['idle', 0, 'En attente de la build', [], 0.42],
  admin: ['waiting', 0.3, 'Attend la validation des accès boutique', ['Demande d\'accès', 'Configuration des taxes'], 0.66],
  veille: ['working', 0.35, 'Surveille les lancements concurrents', ['Scan des nouveautés', 'Résumé hebdomadaire'], 0.58],
  business: ['idle', 0, 'Prêt pour l\'analyse des marges', [], 0.21],
  publicite: ['idle', 0, 'Campagne en pause', [], 0.95],
  commandes: ['idle', 0, 'Aucune commande à traiter', [], 0.12],
  'ceo-kcl': ['working', 0.5, 'Priorise la semaine de révision', ['Lecture des échéances', 'Répartition des tâches'], 1.05],
  'veilleur-keats': ['working', 0.4, 'Synchronise les nouveaux cours KEATS', ['Connexion KEATS', 'Détection des nouveautés'], 0.37],
  planning: ['idle', 0, 'Planning à jour', [], 0.18],
  readings: ['working', 0.7, 'Synthétise le chapitre 7 de microéconomie', ['Extraction du PDF', 'Fiche de lecture'], 0.88],
  'controle-qualite': ['idle', 0, 'Aucune relecture en attente', [], 0.26],
  'essais-coach': ['waiting', 0.4, 'Attend la consigne de l\'essai', ['Analyse du sujet'], 0.49],
  revision: ['idle', 0, 'Fiches prêtes', [], 0.33],
  videos: ['idle', 0, 'Aucune vidéo planifiée', [], 0.08],
  'exos-maths-stats': ['idle', 0, 'Série d\'exercices terminée', [], 0.41],
  redacteur: ['working', 0.5, 'Rédige l\'article « Lancer sa boutique en 2026 »', ['Plan', 'Rédaction', 'Relecture'], 0.73],
};

const data = {
  title: 'JARVIS', subtitle: 'Console écosystème', connection: 'online',
  agents: AGENT_DEFS.map((d) => { const s = INITIAL_STATES[d.id]; return { id: d.id, name: d.name, role: d.role, eco: d.eco, state: s[0], load: s[1], task: s[2], actions: s[3], cost: s[4], progress: s[0] === 'working' ? 0.2 + rng() * 0.6 : 0 }; }),
  mission: { project: 'Boutique Shopify — Maison Albane, collection printemps', progress: 0.42, elapsed: 2 * 3600 + 37 * 60, remaining: 3 * 3600 + 50 * 60, agent: 'constructeur', step: 'Construction' },
  pipeline: ['Brief', 'Cadrage', 'Réunion de direction', 'Design', 'Maquette', 'Construction', 'Contenus', 'Contrôle qualité', 'Corrections', 'Validation client', 'Livraison'],
  pipelineIndex: 5,
  costs: { total: 15.69, cap: 40, budget: 350, spent: 212.4 },
  usage: { input: 1843200, output: 318400, sessions: 27, tools: 412 },
  preview: { status: 'Prêt', url: 'maison-albane-preview.myshopify.com', updated: 'il y a 4 min' },
  delivery: { date: 'Vendredi 7 novembre', status: 'Dans les temps', items: ['Thème Shopify', '12 pages', 'Fiches produits', 'Guide d\'édition'] },
  validation: [{ id: 'v1', text: 'Valider la maquette de la page produit (v3)', agent: 'design' }, { id: 'v2', text: 'Autoriser l\'accès administrateur à la boutique', agent: 'admin' }],
  log: [],
  alerts: [{ level: 'warn', text: 'Admin Shopify attend une validation depuis 12 min' }, { level: 'info', text: 'Budget mensuel consommé à 61 %' }],
  memory: ['Client : Maison Albane, ton éditorial sobre', 'Palette validée : ivoire, graphite, vert sauge', 'Livraison attendue le 7 novembre', 'Préférence : pas de pop-up promotionnel'],
};
const agentById = (id) => data.agents.find((a) => a.id === id);


export { PARAMS, DEBUG, clamp01, lerp, easeInOutQuint, easeOutQuint, easeInOutCubic, easeOutExpo, damp, seg, rng, fmtEUR, fmtInt, fmtPct, fmtDuration, fmtTokens, $, desat, ECOSYSTEMS, ECO, AGENT_DEFS, HANDOVERS, INITIAL_STATES, data, agentById };
