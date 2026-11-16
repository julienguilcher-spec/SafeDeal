import { it } from 'vitest';
import { appendFileSync } from 'node:fs';
const OUT = '/tmp/claude-0/-home-user-SafeDeal/f854eafd-7c66-528c-834c-30dfeec78944/scratchpad/alloc.txt';
import { InputSystem } from '@/input';
import type { InputScriptApi } from '@/input';
import { BUTTONS } from '@/input/buttons';
import { createFakeContext } from '@/input/dev/fakeContext';
import type { PadLike } from '@/input/gamepad';

function slope(label: string, body: (f: number) => void): void {
  for (let f = 0; f < 30000; f++) body(f);
  let best = Infinity;
  for (let trial = 0; trial < 6; trial++) {
    const h0 = process.memoryUsage().heapUsed;
    const n = 20000;
    for (let f = 0; f < n; f++) body(f);
    const d = (process.memoryUsage().heapUsed - h0) / n;
    if (d >= 0 && d < best) best = d;
  }
  appendFileSync(OUT, `${label} : ${best.toFixed(1)} octets par image\n`);
}

it('bissection des allocations', () => {
  const fake = createFakeContext({ headless: true });
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
  const axes = [0.5, 0.5, 0.5, 0.5];
  const pad = { id: 'Manette', index: 0, connected: true, mapping: 'standard', axes, buttons } as PadLike;
  const pads: (PadLike | null)[] = [pad];
  const clock = new Float64Array(1);
  const sys = new InputSystem({ now: () => clock[0]!, getPads: () => pads });
  sys.provide(fake.ctx);
  sys.init(fake.ctx);
  const input = fake.ctx.input;
  const script = fake.ctx.require<InputScriptApi>('input.script');
  let hits = 0;
  slope('vide', () => { clock[0] += 16.6; });
  slope('core.beginStep', () => { sys.core.beginStep(); });
  slope('core.beginFrame', () => { sys.core.beginFrame(true); });
  slope('pad.sample au repos', () => { axes[0] = 0; axes[1] = 0; axes[2] = 0; axes[3] = 0; sys.pad!.sample(0.016); });
  slope('pad.sample sticks actifs', () => { axes[0] = 0.7; axes[2] = 0.7; sys.pad!.sample(0.016); });
  slope('touch.sample', () => { sys.touch.sample(); });
  slope('touch.update', () => { sys.touch.update(0.016, 'kbm'); });
  slope('player.vehicle()', () => { if (fake.ctx.player.vehicle() !== null) hits++; });
  slope('session.phase', () => { if (fake.ctx.session.phase === 'playing') hits++; });
  slope('now()', () => { clock[0] += 16.6; if (clock[0]! > 1e300) hits++; });
  slope('update seul (manette au repos)', () => { clock[0] += 16.6; axes[0] = 0; axes[1] = 0; axes[2] = 0; sys.update(1 / 60); });
  slope('frame seul', () => { clock[0] += 16.6; sys.frame(1 / 60); });
  console.info(hits);
});
