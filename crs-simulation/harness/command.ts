// Banc d'essai des cartes et du commandement : contexte réel du cœur (Game), monde de Paris, module
// des entrées, petite interface locale conforme à UiKit, services étendus et scène factices.
//
// Paramètres d'URL :
//   role=commandant|commissaire|chef_groupe|crs|operateur_canon_eau|gendarme_centaure|bravm|telepilote|
//        secouriste|street_medic|journaliste|manifestant            (défaut : commandant)
//   map=paris|test|none        monde de Paris, quartier d'essai, ou aucun module de monde (plan neutre)
//   place=…                    lieu de départ (défaut : place de la République)
//   open=carte|carte_tactique|radio|roue_ordres    écran ouvert d'emblée
//   absent=incidents,traffic,metro,rescue,hazards  services étendus NON fournis (dégradation propre)
//   crowd=300  vehicle=1 (joueur en voiture)  touch=1 (commandes tactiles forcées)  freeze=1 (cortège figé)
//   ai=0 (les unités n'exécutent pas les ordres)  seed=…
//   kit=core   utilise le VRAI socle de l'interface (src/ui) au lieu de la petite implémentation locale
// Le test de bout en bout (tests/e2e/command.mjs) pilote la page par window.__cmd.
import type { GameContext, PlayableRole, PoliceRank } from '@/core/contracts';
import { Game } from '@/core/game';
import { defaultSessionConfig } from '@/core/session';
import { createSystems as inputModule } from '@/input';
import type { InputScriptApi, InputTouchApi } from '@/input';
import { CommandSystem } from '@/ui/command';
import type { CommandCore, TacticalScreen } from '@/ui/command';
import { FakeScenario } from '@/ui/command/dev/fakeScenario';
import { createLocalUi } from '@/ui/command/dev/localKit';
import type { LocalUi } from '@/ui/command/dev/localKit';
import { MapsSystem } from '@/ui/maps';
import type { MapsRuntime, PlanScreen } from '@/ui/maps';
import { createWorldQuerySystems } from '@/world/query';

const params = new URLSearchParams(location.search);
const role = (params.get('role') ?? 'commandant') as PlayableRole;
const mapName = params.get('map') ?? 'paris';
const absent = new Set((params.get('absent') ?? '').split(',').filter((s) => s !== ''));
const bootEl = document.getElementById('boot') as HTMLDivElement;

const RANKS: Partial<Record<PlayableRole, PoliceRank>> = {
  commandant: 'commandant', commissaire: 'commissaire', chef_groupe: 'brigadier_chef', crs: 'gardien', bravm: 'brigadier_chef',
  gendarme_centaure: 'brigadier_chef', operateur_canon_eau: 'gardien', telepilote: 'brigadier_chef',
};

// ───────────────────────────── fond : une vue de jeu factice ─────────────────────────────

const gameEl = document.getElementById('game') as HTMLDivElement;
const bg = document.createElement('canvas');
gameEl.appendChild(bg);
function paintBackground(ctx: GameContext | null): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = gameEl.clientWidth, h = gameEl.clientHeight;
  bg.width = Math.round(w * dpr);
  bg.height = Math.round(h * dpr);
  const g = bg.getContext('2d');
  if (!g) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const horizon = h * 0.46;
  const sky = g.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#5f7fa6');
  sky.addColorStop(1, '#c3ccd3');
  g.fillStyle = sky;
  g.fillRect(0, 0, w, horizon);
  const ground = g.createLinearGradient(0, horizon, 0, h);
  ground.addColorStop(0, '#77797a');
  ground.addColorStop(1, '#3d4043');
  g.fillStyle = ground;
  g.fillRect(0, horizon, w, h - horizon);
  // façades haussmanniennes stylisées, pour juger la lisibilité du HUD sur un fond clair et chargé
  const yaw = ctx ? ctx.player.state.camYaw : 0;
  const shift = ((yaw * 220) % 90 + 90) % 90;
  for (let i = -1; i < w / 90 + 1; i++) {
    const x = i * 90 - shift;
    const bh = 110 + ((i * 37) % 3) * 22;
    g.fillStyle = i % 2 === 0 ? '#b9ab92' : '#a99c86';
    g.fillRect(x, horizon - bh, 88, bh);
    g.fillStyle = '#5c6470';
    g.fillRect(x, horizon - bh - 14, 88, 14);
    g.fillStyle = 'rgba(40,48,60,.55)';
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) g.fillRect(x + 9 + c * 20, horizon - bh + 12 + r * 24, 10, 15);
  }
  g.strokeStyle = 'rgba(255,255,255,.7)';
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(w / 2 - 9, h / 2);
  g.lineTo(w / 2 - 3, h / 2);
  g.moveTo(w / 2 + 3, h / 2);
  g.lineTo(w / 2 + 9, h / 2);
  g.moveTo(w / 2, h / 2 - 9);
  g.lineTo(w / 2, h / 2 - 3);
  g.moveTo(w / 2, h / 2 + 3);
  g.lineTo(w / 2, h / 2 + 9);
  g.stroke();
}

// ───────────────────────────── assemblage ─────────────────────────────

/** Ce que les tests lisent de l'interface, quel que soit le socle (local ou réel). */
export interface BenchUi {
  stack(): string[];
  readonly notices: string[];
}

export interface CommandBench {
  game: Game;
  ctx: GameContext;
  ui: BenchUi;
  scenario: FakeScenario;
  maps: MapsRuntime;
  mapsSystem: MapsSystem;
  command: CommandCore;
  tactical(): TacticalScreen | null;
  plan(): PlanScreen | null;
  script: InputScriptApi | undefined;
  /** Mesures : temps moyen (ms) des systèmes d'interface par image. */
  perf(): Record<string, number>;
}

declare global {
  interface Window {
    __ready?: boolean;
    __error?: string;
    __cmd?: CommandBench;
  }
}

async function main(): Promise<void> {
  const game = new Game({ seed: Number(params.get('seed') ?? 7) });
  const ctx = game.ctx;
  if (mapName !== 'none') game.addModule(() => createWorldQuerySystems({ source: mapName === 'test' ? 'test' : 'paris', baseUrl: params.get('base') ?? '../data/paris/' }));
  game.addModule(inputModule);
  const useCore = params.get('kit') === 'core';
  let ui: BenchUi;
  let local: LocalUi | null = null;
  const scenario = new FakeScenario({
    role, crowd: Number(params.get('crowd') ?? 300), vehicle: params.get('vehicle') === '1',
    incidents: !absent.has('incidents'), traffic: !absent.has('traffic'), metro: !absent.has('metro'),
    rescue: !absent.has('rescue'), hazards: !absent.has('hazards'),
  });
  if (params.get('freeze') === '1') scenario.marchSpeed = 0;
  if (params.get('ai') === '0') scenario.aiEnabled = false;
  game.addSystem(scenario.system);
  let mapsSystem: MapsSystem;
  let commandSystem: CommandSystem;
  if (useCore) {
    // le vrai module d'interface agrège lui-même les cartes et le commandement
    ctx.provide('launch', { nomenu: true, autostart: 'paris', raw: {} });
    const real = await import('@/ui');
    const systems = real.createSystems();
    for (const sys of systems) game.addSystem(sys);
    mapsSystem = systems.find((x) => x.id === 'ui:maps') as MapsSystem;
    commandSystem = systems.find((x) => x.id === 'ui:command') as CommandSystem;
    const seen: string[] = [];
    ui = {
      stack: () => [...(ctx.service<{ stack: readonly string[] }>('ui.debug')?.stack ?? [])],
      get notices(): string[] {
        for (const t of ctx.service<{ notices(): string[] }>('ui.debug')?.notices() ?? []) if (seen[seen.length - 1] !== t && seen.indexOf(t) < 0) seen.push(t);
        return seen;
      },
    };
  } else {
    local = createLocalUi();
    ui = local;
    game.addSystem(local.system);
    mapsSystem = new MapsSystem();
    commandSystem = new CommandSystem();
    game.addSystem(mapsSystem);
    game.addSystem(commandSystem);
  }
  await game.boot();

  const place = params.get('place') ?? (mapName === 'paris' ? 'Place de la République' : '');
  await ctx.session.start(defaultSessionConfig({
    mode: mapName === 'paris' ? 'monde_ouvert' : 'test', place, role, rank: RANKS[role] ?? null, crowdSize: scenario.options.crowd,
    seed: Number(params.get('seed') ?? 7), timeOfDay: 15.5,
  }));
  const touch = ctx.service<InputTouchApi>('input.touch');
  if (touch && params.get('touch') === '1') touch.setForced(true);
  paintBackground(ctx);
  window.addEventListener('resize', () => paintBackground(ctx));
  let lastYaw = NaN;
  ctx.events.on('player:possessed', () => paintBackground(ctx));
  window.setInterval(() => {
    const yaw = ctx.player.state.camYaw;
    if (yaw !== lastYaw && !ctx.ui.modal) {
      lastYaw = yaw;
      paintBackground(ctx);
    }
  }, 120);
  game.run();

  const bench: CommandBench = {
    game, ctx, ui, scenario, maps: mapsSystem.runtime!, mapsSystem, command: commandSystem.core!,
    tactical: () => commandSystem.tactical,
    plan: () => mapsSystem.plan,
    script: ctx.service<InputScriptApi>('input.script'),
    perf(): Record<string, number> {
      const out: Record<string, number> = {};
      for (const p of game.perf) if (p.id.startsWith('ui:')) out[p.id] = p.avgFrameMs;
      return out;
    },
  };
  window.__cmd = bench;
  const open = params.get('open');
  if (open) ctx.ui.open(open);
  bootEl.classList.add('is-off');
  window.__ready = true;
}

main().catch((err) => {
  window.__error = err instanceof Error ? err.stack ?? err.message : String(err);
  console.error('[banc commandement]', err);
  bootEl.textContent = 'Erreur du banc d’essai :\n' + window.__error;
});
