// Banc d'essai du moteur sonore : un bouton par son, les ambiances, les sirènes, le moteur
// piloté au régime, et l'API de test hors ligne utilisée par tests/e2e/audio.mjs.
import { ALL_SOUND_IDS, CONTRACT_SOUND_IDS, EXTRA_SOUND_IDS, allSoundDefs } from '@/audio/catalog';
import { drawBoard, measureTone, renderAndMeasure, type BoardOpts } from '@/audio/dev/board';
import { mountHarness, type Harness } from '@/audio/dev/harnessUi';
import type { OfflineOpts } from '@/audio/dev/offline';
import { sceneDistance, sceneOcclusion, scenePassBy, sceneStress } from '@/audio/dev/scene';
import { brownNoise, crackle, drops, pinkNoise } from '@/audio/textures';
import { renderBabble, renderBoo, renderChoir, renderScream } from '@/audio/voiceTextures';

const board = document.getElementById('board') as HTMLCanvasElement;

// ── API de test hors ligne (OfflineAudioContext) ──
const api = {
  ids: ALL_SOUND_IDS,
  contractIds: CONTRACT_SOUND_IDS as readonly string[],
  extraIds: EXTRA_SOUND_IDS,
  defs: allSoundDefs().map((d) => ({ id: d.id, label: d.label, group: d.group, sustained: d.sustained, level: d.level })),
  render: (id: string, o?: OfflineOpts) => renderAndMeasure(id, o),
  tone: (id: string, t0: number, t1: number, fMin: number, fMax: number, o?: OfflineOpts) => measureTone(id, t0, t1, fMin, fMax, o),
  async board(ids: string[], o?: BoardOpts): Promise<string> {
    await drawBoard(board, ids, o);
    return board.toDataURL('image/png');
  },
  // scènes spatialisées : le moteur complet branché sur un OfflineAudioContext
  async passBy() {
    const report = await scenePassBy(board);
    return { report, image: board.toDataURL('image/png') };
  },
  occlusion: () => sceneOcclusion(),
  distance: () => sceneDistance(),
  stress: () => sceneStress(),
  /** Coût de calcul des textures procédurales (ms), mesuré à froid dans ce navigateur. */
  textureTimings(): Record<string, number> {
    const time = (fn: () => unknown): number => {
      const t0 = performance.now();
      fn();
      return Math.round((performance.now() - t0) * 10) / 10;
    };
    return {
      rose: time(() => pinkNoise(3, 44100, 1)),
      brun: time(() => brownNoise(4, 44100, 1)),
      crepitement: time(() => crackle(4, 44100, 1)),
      gouttes: time(() => drops(3, 44100, 1)),
      brouhaha: time(() => renderBabble(8, 22050, 1)),
      huees: time(() => renderBoo(5, 22050, 1)),
      cris: time(() => renderScream(5, 22050, 1)),
      choeur: time(() => renderChoir('a', 2.4, 22050, 1)),
    };
  },
  /** Coût JavaScript moyen et maximal d'un appel à frame() (ms) sur `frames` images de la scène courante. */
  frameCost(frames: number): { mean: number; max: number } {
    const h = window.__audioHarness;
    let sum = 0;
    let max = 0;
    for (let i = 0; i < frames; i++) {
      const t0 = performance.now();
      h.sys.frame(1 / 60);
      const d = performance.now() - t0;
      sum += d;
      if (d > max) max = d;
    }
    return { mean: sum / frames, max };
  },
};

declare global {
  interface Window {
    __audioTest: typeof api;
    __audioHarness: Harness;
    __ready: boolean;
  }
}
window.__audioTest = api;

// ── banc d'essai interactif (temps réel) ──
window.__audioHarness = mountHarness(
  document.getElementById('left')!,
  document.getElementById('right')!,
  document.getElementById('state')!,
);
window.__ready = true;
