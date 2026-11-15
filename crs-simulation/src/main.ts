/* =====================================================================================
 * CRS SIMULATION FRANCE — racine de composition.
 *
 * C'est ici, et seulement ici, que les modules sont assemblés. Chaque module exporte depuis son
 * index.ts une fabrique `createSystems: ModuleFactory` ; l'intégrateur l'importe et l'ajoute au
 * tableau MODULES ci-dessous. L'ordre du tableau est indifférent : les systèmes sont triés par
 * leur champ `order` (voir SystemOrder dans src/core/contracts.ts), puis le moteur appelle tous
 * les provide(), puis tous les init().
 * ===================================================================================== */

import { version } from '../package.json';
import type { ModuleFactory, QualityLevel, SessionPhase } from '@/core/contracts';
import { getCore } from '@/core/context';
import { installDebugApi } from '@/core/debug';
import type { DebugApi } from '@/core/debug';
import { Game } from '@/core/game';
import { LAUNCH_SERVICE, launchSessionConfig, parseLaunchParams } from '@/core/launch';
import { applyQualityPreset } from '@/core/settings';

// ─────────────────────────────────────────────────────────────────────────────────────
// MODULES — à compléter par l'intégrateur.
//
// Pour brancher un module : 1) décommenter (ou ajouter) son import ; 2) l'ajouter au tableau.
// Un module absent est remplacé par son service neutre : le jeu tourne avec n'importe quel
// sous-ensemble. Dès qu'un module de rendu fournit ctx.view, le panneau de diagnostic disparaît.
//
//   import { createSystems as input } from '@/input';                    // clavier, souris, manette, tactile
//   import { createSystems as env } from '@/env';                        // heure, météo, vent
//   import { createSystems as worldQuery } from '@/world/query';         // relief, collisions, rues, lieux
//   import { createSystems as simPeople } from '@/sim/people';           // locomotion, santé, joueur
//   import { createSystems as simItems } from '@/sim/items';             // objets, projectiles
//   import { createSystems as simHazards } from '@/sim/hazards';         // gaz, fumée, feu, eau
//   import { createSystems as simProps } from '@/sim/props';             // mobilier, vitrines, barricades
//   import { createSystems as simVehicles } from '@/sim/vehicles';       // véhicules
//   import { createSystems as simTraffic } from '@/sim/traffic';         // circulation, piétons civils
//   import { createSystems as simCrowd } from '@/sim/crowd';             // manifestants, tension
//   import { createSystems as simPolice } from '@/sim/police';           // forces de l'ordre, unités, ordres
//   import { createSystems as simRoles } from '@/sim/roles';             // archétypes, médecins, presse, drone
//   import { createSystems as law } from '@/gameplay/law';               // sommations, emploi de la force
//   import { createSystems as radio } from '@/gameplay/radio';           // messages radio
//   import { createSystems as missions } from '@/gameplay/missions';     // missions, objectifs
//   import { createSystems as career } from '@/gameplay/career';         // carrière, mode libre
//   import { createSystems as media } from '@/gameplay/media';           // journalistes, image publique
//   import { createSystems as renderBase } from '@/render/base';         // renderer, ciel, caméra (fournit ctx.view)
//   import { createSystems as worldView } from '@/world/view';           // maillages de la ville
//   import { createSystems as monuments } from '@/world/monuments';      // monuments
//   import { createSystems as renderPeople } from '@/render/people';     // personnages
//   import { createSystems as renderVehicles } from '@/render/vehicles'; // véhicules
//   import { createSystems as renderProps } from '@/render/props';       // mobilier urbain
//   import { createSystems as renderFx } from '@/render/fx';             // particules, décals
//   import { createSystems as ui } from '@/ui';                          // HUD, menus, cartes
//   import { createSystems as audio } from '@/audio';                    // sons, ambiances, voix
// ─────────────────────────────────────────────────────────────────────────────────────
const MODULES: ModuleFactory[] = [
  // input, env, worldQuery, simPeople, simItems, simHazards, simProps, simVehicles, simTraffic,
  // simCrowd, simPolice, simRoles, law, radio, missions, career, media,
  // renderBase, worldView, monuments, renderPeople, renderVehicles, renderProps, renderFx, ui, audio,
];

// ───────────────────────────── démarrage ─────────────────────────────

async function main(): Promise<void> {
  // Paramètres d'URL : ?autostart=test|paris &place=… &quality=bas &seed=… &nomenu=1 &debug=1 (voir core/launch.ts)
  const launch = parseLaunchParams(window.location.search);

  const game = new Game({ seed: launch.seed ?? undefined, debug: launch.debug });
  const ctx = game.ctx;
  const debug = installDebugApi(game);

  // Les modules lisent les paramètres de lancement par ctx.service<LaunchParams>('launch').
  ctx.provide(LAUNCH_SERVICE, launch);
  if (launch.quality) applyQualityPreset(ctx.settings, launch.quality);

  for (const factory of MODULES) game.addModule(factory);

  await game.boot();
  game.run();

  // Tant qu'aucun module de rendu n'est branché, la page affiche l'état du moteur.
  removeSplash();
  if (!ctx.view) mountDiagnosticPanel(game, debug);

  // ?autostart= : session lancée d'office, sans passer par le menu.
  if (launch.autostart) {
    try {
      await ctx.session.start(launchSessionConfig(launch));
    } catch (err) {
      debug.error = err instanceof Error ? err.message : String(err);
      console.error('[main] démarrage automatique de la session impossible', err);
    }
  }
  debug.ready = true;
}

function removeSplash(): void {
  document.getElementById('boot-splash')?.remove();
}

function showFatal(err: unknown): void {
  const splash = document.getElementById('boot-splash');
  const state = splash?.querySelector('.state');
  if (!splash || !state) return;
  splash.classList.add('failed');
  state.textContent = `Le jeu n'a pas pu démarrer : ${err instanceof Error ? err.message : String(err)}`;
}

main().catch((err: unknown) => {
  console.error('[main] démarrage impossible', err);
  showFatal(err);
});

// ───────────────────────────── panneau de diagnostic ─────────────────────────────
// Affiché uniquement quand ctx.view est nul (aucun module de rendu). Il lit l'état du moteur
// quatre fois par seconde et permet de démarrer, mettre en pause et terminer une session d'essai.

const PHASE_LABELS: Record<SessionPhase, string> = {
  boot: 'Démarrage',
  menu: 'Menu',
  loading: 'Chargement',
  playing: 'En jeu',
  paused: 'En pause',
  debrief: 'Compte rendu',
};

const QUALITY_LABELS: Record<QualityLevel, string> = { bas: 'basse', moyen: 'moyenne', haut: 'haute', ultra: 'ultra' };

const DIAG_CSS = `
.diag { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  padding: calc(16px + var(--safe-top)) calc(16px + var(--safe-right)) calc(16px + var(--safe-bottom)) calc(16px + var(--safe-left));
  box-sizing: border-box; overflow: auto; touch-action: pan-y;
  background: radial-gradient(1200px 700px at 50% -10%, #16233d 0%, #0b1220 60%); }
.diag * { box-sizing: border-box; }
.diag-card { width: min(820px, 100%); margin: auto; background: #111a2c; border: 1px solid #22304c; border-radius: 14px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, .45); overflow: hidden; }
.diag-flag { display: block; height: 4px; background: linear-gradient(to right, #0055a4 0 33.333%, #fff 33.333% 66.666%, #ef4135 66.666% 100%); }
.diag-head { display: flex; align-items: center; gap: 16px; padding: 20px 24px 18px; border-bottom: 1px solid #1c2740; }
.diag-titles { flex: 1; min-width: 0; }
.diag-brand { font-size: 11px; font-weight: 700; letter-spacing: .3em; color: #93a0b8; }
.diag-title { margin: 4px 0 0; font-size: 22px; font-weight: 650; line-height: 1.2; color: #f3f6fb; }
.diag-version { flex: none; align-self: flex-start; font-size: 12px; color: #6f7d97; font-variant-numeric: tabular-nums; }
.diag-body { padding: 18px 24px 22px; display: grid; gap: 18px; }
.diag-note { margin: 0; font-size: 14px; color: #a9b4c9; }
.diag-note code, .diag-foot code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .92em;
  color: #cfd8ea; background: #18233a; border-radius: 4px; padding: 1px 5px; }
.diag-tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.diag-tile { background: #0d1525; border: 1px solid #1c2740; border-radius: 10px; padding: 10px 12px; min-width: 0; }
.diag-tile b { display: block; font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: #7f8ca6; }
.diag-tile span { display: block; margin-top: 4px; font-size: 19px; font-weight: 600; color: #f3f6fb;
  font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.diag-phase::before { content: ''; display: inline-block; width: 9px; height: 9px; margin: 0 9px 0 4px; border-radius: 50%;
  background: #6f7d97; vertical-align: 1px; }
.diag-phase[data-phase="playing"]::before { background: #3ecf8e; box-shadow: 0 0 0 4px rgba(62, 207, 142, .16); }
.diag-phase[data-phase="paused"]::before { background: #f0b429; }
.diag-phase[data-phase="loading"]::before { background: #4c8dff; }
.diag-cols { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); gap: 18px; }
.diag-sec h2 { margin: 0 0 8px; font-size: 11px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: #7f8ca6; }
.diag-table { width: 100%; border-collapse: collapse; font-size: 14px; font-variant-numeric: tabular-nums; }
.diag-table th { font-weight: 500; color: #7f8ca6; font-size: 12px; text-align: right; padding: 0 0 6px 10px; }
.diag-table th:first-child { text-align: left; padding-left: 0; }
.diag-table td { padding: 6px 0 6px 10px; border-top: 1px solid #1a2438; text-align: right; color: #dfe5f0; white-space: nowrap; }
.diag-table td:first-child { text-align: left; padding-left: 0; color: #b9c3d6; overflow: hidden; text-overflow: ellipsis; max-width: 0; width: 60%; }
.diag-table td.off { color: #ff8f85; }
.diag-empty { font-size: 13px; color: #7f8ca6; margin: 8px 0 0; }
.diag-actions { display: flex; flex-wrap: wrap; gap: 10px; }
.diag-btn { appearance: none; border: 1px solid #2a3a5c; background: #18233a; color: #e8ecf3; font: inherit; font-size: 14px; font-weight: 550;
  padding: 10px 16px; border-radius: 9px; cursor: pointer; touch-action: manipulation; }
.diag-btn:hover:not(:disabled) { background: #1f2d4a; border-color: #3a4d78; }
.diag-btn:focus-visible { outline: 2px solid #8fb6ff; outline-offset: 2px; }
.diag-btn:disabled { opacity: .42; cursor: default; }
.diag-btn.primary { background: #0055a4; border-color: #0a66bf; color: #fff; }
.diag-btn.primary:hover:not(:disabled) { background: #0a66bf; border-color: #2f83d6; }
.diag-btn[aria-pressed="true"] { background: #23365c; border-color: #4c8dff; }
.diag-foot { margin: 0; padding: 14px 24px 18px; border-top: 1px solid #1c2740; font-size: 12.5px; color: #7f8ca6; line-height: 1.7; }
@media (max-width: 640px) {
  .diag-head { padding: 18px 18px 14px; } .diag-body { padding: 16px 18px 18px; } .diag-foot { padding: 12px 18px 16px; }
  .diag-title { font-size: 19px; }
  .diag-tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .diag-cols { grid-template-columns: minmax(0, 1fr); }
  .diag-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .diag-btn { padding: 12px 10px; }
  .diag-btn.wide { grid-column: 1 / -1; }
}
`;

const numberFr = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const decimalFr = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const millisFr = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function mountDiagnosticPanel(game: Game, debug: DebugApi): void {
  const ctx = game.ctx;
  const host = document.getElementById('ui') ?? document.body;

  const style = el('style');
  style.textContent = DIAG_CSS;
  const root = el('div', 'diag');
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', 'État du moteur');
  const card = el('div', 'diag-card');
  root.append(style, card);

  // en-tête
  const head = el('div', 'diag-head');
  const titles = el('div', 'diag-titles');
  const n = game.systemCount;
  titles.append(
    el('div', 'diag-brand', 'CRS SIMULATION FRANCE'),
    el('h1', 'diag-title', `Moteur prêt — ${n} système${n > 1 ? 's' : ''}`),
  );
  head.append(titles, el('span', 'diag-version', `v${version}`));

  // corps
  const body = el('div', 'diag-body');
  const note = el('p', 'diag-note');
  note.append(
    'Aucun module de rendu n’est branché : cette page montre l’état du moteur. Elle laisse la place au jeu dès qu’un module de rendu est ajouté au tableau ',
    el('code', undefined, 'MODULES'),
    ' de ',
    el('code', undefined, 'src/main.ts'),
    '.',
  );

  const tiles = el('div', 'diag-tiles');
  const tile = (label: string): HTMLSpanElement => {
    const box = el('div', 'diag-tile');
    const value = el('span');
    box.append(el('b', undefined, label), value);
    tiles.append(box);
    return value;
  };
  const phaseValue = tile('Session');
  phaseValue.classList.add('diag-phase');
  const timeValue = tile('Temps simulé');
  const tickValue = tile('Pas de simulation');
  const fpsValue = tile('Cadence');

  const cols = el('div', 'diag-cols');
  const entities = el('section', 'diag-sec');
  entities.append(el('h2', undefined, 'Entités'));
  const entityTable = el('table', 'diag-table');
  const entityCells: HTMLTableCellElement[] = [];
  for (const label of ['Personnes', 'Véhicules', 'Objets du décor', 'Vitrines', 'Projectiles', 'Unités']) {
    const row = entityTable.insertRow();
    row.insertCell().textContent = label;
    entityCells.push(row.insertCell());
  }
  entities.append(entityTable);

  const systems = el('section', 'diag-sec');
  systems.append(el('h2', undefined, 'Systèmes (ms par image)'));
  const systemTable = el('table', 'diag-table');
  const headRow = systemTable.createTHead().insertRow();
  for (const label of ['Identifiant', 'Ordre', 'update', 'frame']) headRow.append(el('th', undefined, label));
  const systemBody = systemTable.createTBody();
  const systemCells: { update: HTMLTableCellElement; frame: HTMLTableCellElement }[] = [];
  for (const perf of game.perf) {
    const row = systemBody.insertRow();
    const id = row.insertCell();
    id.textContent = perf.id;
    id.title = perf.id;
    row.insertCell().textContent = String(perf.order);
    systemCells.push({ update: row.insertCell(), frame: row.insertCell() });
  }
  systems.append(systemTable);
  if (MODULES.length === 0) {
    systems.append(el('p', 'diag-empty', 'Aucun module branché : seul le système interne du moteur tourne.'));
  }
  cols.append(entities, systems);

  // actions
  const actions = el('div', 'diag-actions');
  const button = (label: string, extra = ''): HTMLButtonElement => {
    const b = el('button', extra ? `diag-btn ${extra}` : 'diag-btn', label);
    b.type = 'button';
    actions.append(b);
    return b;
  };
  const startBtn = button('Démarrer une session d’essai', 'primary wide');
  const pauseBtn = button('Mettre en pause');
  const fastBtn = button('Avance rapide ×8');
  const endBtn = button('Terminer la session', 'wide');
  startBtn.addEventListener('click', () => {
    debug.start({ seed: ctx.session.config?.seed ?? 1 }).catch((err: unknown) => {
      console.error('[main] démarrage de la session d’essai impossible', err);
    });
  });
  pauseBtn.addEventListener('click', () => ctx.session.pause(ctx.session.phase === 'playing'));
  fastBtn.addEventListener('click', () => {
    ctx.clock.timeScale = ctx.clock.timeScale > 1 ? 1 : 8;
    refresh();
  });
  endBtn.addEventListener('click', () => ctx.session.end(false));

  body.append(note, tiles, cols, actions);

  const foot = el('p', 'diag-foot');
  foot.append(
    'Paramètres d’URL : ',
    el('code', undefined, '?autostart=test'),
    ' ',
    el('code', undefined, '&place=…'),
    ' ',
    el('code', undefined, '&quality=bas'),
    ' ',
    el('code', undefined, '&seed=…'),
    ' ',
    el('code', undefined, '&nomenu=1'),
    ` · Qualité ${QUALITY_LABELS[ctx.settings.values.quality]} · Sauvegarde ${getCore(ctx).save.persistent ? 'sur cet appareil' : 'en mémoire (stockage indisponible)'} · Console : `,
    el('code', undefined, 'window.__CRS.summary()'),
  );

  card.append(el('span', 'diag-flag'), head, body, foot);
  host.append(root);

  function refresh(): void {
    if (ctx.view) {
      // un module de rendu est arrivé : le panneau n'a plus lieu d'être
      window.clearInterval(timer);
      root.remove();
      return;
    }
    const phase = ctx.session.phase;
    phaseValue.textContent = PHASE_LABELS[phase];
    phaseValue.dataset.phase = phase;
    timeValue.textContent = `${decimalFr.format(ctx.clock.now)} s`;
    tickValue.textContent = numberFr.format(ctx.clock.tick);
    fpsValue.textContent = game.stats.fps > 0 ? `${numberFr.format(game.stats.fps)} images/s` : '—';

    const counts = [
      ctx.people.list.length, ctx.vehicles.list.length, ctx.props.list.length,
      ctx.props.shops.length, ctx.projectiles.list.length, ctx.squads.list.length,
    ];
    for (let i = 0; i < counts.length; i++) entityCells[i]!.textContent = numberFr.format(counts[i]!);

    for (let i = 0; i < game.perf.length; i++) {
      const perf = game.perf[i]!;
      const cells = systemCells[i];
      if (!cells) continue;
      cells.update.textContent = perf.disabled ? 'désactivé' : millisFr.format(perf.avgUpdateMs);
      cells.update.classList.toggle('off', perf.disabled);
      cells.frame.textContent = perf.disabled ? '—' : millisFr.format(perf.avgFrameMs);
    }

    const active = phase === 'playing' || phase === 'paused';
    startBtn.textContent = active ? 'Redémarrer la session d’essai' : 'Démarrer une session d’essai';
    startBtn.disabled = phase === 'loading' || phase === 'boot';
    pauseBtn.textContent = phase === 'paused' ? 'Reprendre' : 'Mettre en pause';
    pauseBtn.disabled = !active;
    fastBtn.disabled = phase !== 'playing';
    fastBtn.setAttribute('aria-pressed', String(ctx.clock.timeScale > 1));
    endBtn.disabled = !active && phase !== 'debrief';
  }

  const timer = window.setInterval(refresh, 250);
  ctx.events.onAny('session:phase', refresh);
  refresh();
}
