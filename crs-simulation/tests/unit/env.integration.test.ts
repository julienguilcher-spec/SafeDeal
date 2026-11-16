// Intégration avec le vrai moteur (src/core) : le module se branche par sa fabrique, se règle sur la
// configuration de session, avance avec la boucle de simulation et parle sur le bus d'événements.
// Le rendu de base, lui, doit rester inerte en mode headless (ctx.view === null).
import { describe, expect, it } from 'vitest';
import { createSystems as createEnv } from '@/env';
import type { EnvExtApi } from '@/env';
import { createSystems as createRenderBase } from '@/render/base';
import { createTestContext } from '@/core/testing';

describe('env + rendu de base — intégration au moteur', () => {
  it('remplace le service neutre et suit la configuration de session', async () => {
    const t = createTestContext({ seed: 11, modules: [createEnv] });
    await t.ready;
    const ext = t.ctx.service<EnvExtApi>('env.ext');
    expect(ext).toBeDefined();
    expect(t.ctx.env).toBe(ext);
    await t.start({ timeOfDay: 17.5, weather: 'pluie', duration: 'standard' });
    const st = t.ctx.env.state;
    expect(st.timeOfDay).toBeCloseTo(17.5, 3);
    expect(st.weather).toBe('pluie');
    expect(st.rain).toBeGreaterThan(0.3);
    expect(st.wetness).toBe(1);
    expect(st.clockScale).toBe(8);
    // 60 s de jeu à ×8 : 8 minutes d'horloge
    t.step(60);
    expect(st.timeOfDay).toBeCloseTo(17.5 + (60 * 8) / 3600, 2);
    expect(Math.hypot(st.windX, st.windZ)).toBeGreaterThan(1);
    expect(Math.hypot(st.sunX, st.sunY, st.sunZ)).toBeCloseTo(1, 5);
  });

  it('émet env:hour et env:weather sur le bus du jeu', async () => {
    const t = createTestContext({ seed: 3, modules: [createEnv] });
    await t.start({ timeOfDay: 20.98, weather: 'clair', duration: 'temps_reel' });
    const hours: number[] = [];
    const weathers: string[] = [];
    let strikes = 0;
    t.ctx.events.on('env:hour', (e) => hours.push(e.hour));
    t.ctx.events.on('env:weather', (e) => weathers.push(e.weather));
    t.ctx.events.onAny('env:lightning', () => strikes++);
    t.ctx.env.setClockScale(120);
    t.step(60);     // 2 h d'horloge
    expect(hours).toEqual([21, 22]);
    expect(t.ctx.env.state.streetLights).toBe(true);
    t.ctx.env.setWeather('orage');
    expect(weathers).toEqual(['orage']);
    t.step(240);
    expect(t.ctx.env.state.rain).toBeGreaterThan(0.5);
    expect(strikes).toBeGreaterThan(2);
  });

  it('deux sessions de même graine donnent le même vent ; une nouvelle session repart de zéro', async () => {
    const run = async (seed: number): Promise<number[]> => {
      const t = createTestContext({ seed, modules: [createEnv] });
      await t.start({ timeOfDay: 15, weather: 'averse', seed });
      const out: number[] = [];
      for (let i = 0; i < 20; i++) {
        t.step(3);
        out.push(t.ctx.env.state.windX, t.ctx.env.state.windZ);
      }
      return out;
    };
    expect(await run(5)).toEqual(await run(5));
    expect(await run(5)).not.toEqual(await run(6));
    const t = createTestContext({ seed: 2, modules: [createEnv] });
    await t.start({ timeOfDay: 15, weather: 'averse' });
    t.step(30);
    t.ctx.session.end(false);
    await t.start({ timeOfDay: 9, weather: 'clair' });
    expect(t.ctx.env.state.timeOfDay).toBeCloseTo(9, 3);
    expect(t.ctx.env.state.wetness).toBe(0);
    expect(t.ctx.env.state.rain).toBe(0);
  });

  it('le rendu de base reste inerte sans navigateur : ctx.view nul, aucun service publié, aucune erreur', async () => {
    const t = createTestContext({ seed: 1, modules: [createEnv, createRenderBase] });
    await t.ready;
    expect(t.ctx.view).toBeNull();
    expect(t.ctx.service('render.lights')).toBeUndefined();
    await t.start({ timeOfDay: 12, weather: 'clair' });
    t.step(2);
    expect(t.ctx.view).toBeNull();
    const ids = createRenderBase().map((s) => `${s.id}:${s.order}`);
    expect(ids).toEqual(['render.base:1000', 'render.present:1090']);
  });
});
