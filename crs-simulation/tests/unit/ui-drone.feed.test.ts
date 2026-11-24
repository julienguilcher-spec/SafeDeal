import { describe, expect, it, vi } from 'vitest';
import type { Vehicle } from '@/core/contracts';
import { AuxView } from '@/render/base/auxView';
import {
  DEFAULT_PITCH, GIMBAL_DROP, MIN_PITCH, chooseDrone, createPose, crowdLabel, cycleDrone, dampAngle, densestSpot, dronePose,
  feedDroneIds, feedSize, roughCount, videoClock,
} from '@/ui/drone/logic';
import type { PoseInput, Spot } from '@/ui/drone/logic';

const DEG = Math.PI / 180;

function veh(id: number, kind: string, extra: Partial<Vehicle> = {}): Vehicle {
  return {
    id, kind, faction: 'police', dormant: false, state: 'ok',
    def: { flying: kind === 'drone' || kind === 'helicoptere' },
    ...extra,
  } as unknown as Vehicle;
}

function input(over: Partial<PoseInput> = {}): PoseInput {
  return { x: 0, y: 60, z: 0, ground: 0, heading: 0, hasTarget: false, tx: 0, tz: 0, tGround: 0, ...over };
}

describe('retour vidéo du drone — choix des appareils', () => {
  it('ne retient que les drones de police en état, triés par identifiant', () => {
    const list = [
      veh(9, 'drone'), veh(3, 'drone'), veh(4, 'fourgon_crs'), veh(5, 'helicoptere'),
      veh(6, 'drone', { faction: 'protest' } as Partial<Vehicle>), veh(7, 'drone', { dormant: true }), veh(8, 'drone', { state: 'wrecked' }),
    ];
    expect(feedDroneIds(list)).toEqual([3, 9]);
  });

  it('garde l’appareil suivi, préfère celui demandé, sinon le premier ; passe au suivant en boucle', () => {
    const ids = [3, 9, 12];
    expect(chooseDrone(ids, 0)).toBe(3);
    expect(chooseDrone(ids, 9)).toBe(9);
    expect(chooseDrone(ids, 9, 12)).toBe(12);
    expect(chooseDrone(ids, 44)).toBe(3);        // l'appareil suivi s'est posé
    expect(chooseDrone([], 9)).toBe(0);
    expect(cycleDrone(ids, 3)).toBe(9);
    expect(cycleDrone(ids, 12)).toBe(3);
    expect(cycleDrone(ids, 3, -1)).toBe(12);
    expect(cycleDrone([], 3)).toBe(0);
  });
});

describe('retour vidéo du drone — zone la plus dense', () => {
  it('trouve le gros de la foule plutôt qu’un groupe isolé', () => {
    const pts: number[] = [];
    // 60 personnes serrées autour de (100, -40), 8 éparses autour de (0, 0)
    for (let i = 0; i < 60; i++) pts.push(100 + ((i * 7) % 11) - 5, -40 + ((i * 5) % 9) - 4);
    for (let i = 0; i < 8; i++) pts.push((i % 3) * 9 - 9, Math.floor(i / 3) * 9 - 9);
    const out: Spot = { x: 0, z: 0, count: 0 };
    expect(densestSpot(pts, pts.length / 2, 12, 0, 0, out)).toBe(true);
    expect(Math.hypot(out.x - 100, out.z + 40)).toBeLessThan(4);
    expect(out.count).toBeGreaterThanOrEqual(55);
  });

  it('avec atténuation : la foule sous l’appareil plutôt qu’un attroupement un peu plus gros mais lointain', () => {
    const pts: number[] = [];
    for (let i = 0; i < 30; i++) pts.push(((i * 7) % 11) - 5, ((i * 5) % 9) - 4);            // 30 sous le drone
    for (let i = 0; i < 40; i++) pts.push(140 + ((i * 7) % 11) - 5, ((i * 5) % 9) - 4);      // 40 à 140 m
    const out: Spot = { x: 0, z: 0, count: 0 };
    densestSpot(pts, pts.length / 2, 12, 0, 0, out);
    expect(out.x).toBeGreaterThan(100);                    // sans atténuation : le plus gros
    densestSpot(pts, pts.length / 2, 12, 0, 0, out, 70);
    expect(Math.hypot(out.x, out.z)).toBeLessThan(5);      // avec : le plus proche
  });

  it('sans personne : pas de point visé', () => {
    const out: Spot = { x: 0, z: 0, count: 0 };
    expect(densestSpot([], 0, 12, 0, 0, out)).toBe(false);
  });
});

describe('retour vidéo du drone — pose de la nacelle', () => {
  it('drone à 60 m en orbite de 25 m : regard vers le centre, incliné d’environ 67° (réaliste)', () => {
    // drone au sud (+Z) du point visé : il regarde vers le nord
    const pose = dronePose(input({ z: 25, hasTarget: true, tx: 0, tz: 0 }), createPose());
    expect(pose.pitch / DEG).toBeGreaterThan(60);
    expect(pose.pitch / DEG).toBeLessThan(70);
    expect(Math.abs(Math.abs(pose.yaw) - Math.PI)).toBeLessThan(1e-9);
    expect(pose.lookX).toBeCloseTo(0, 6);
    expect(pose.lookZ).toBeCloseTo(0, 6);
    expect(pose.y).toBeCloseTo(60 - GIMBAL_DROP, 9);
    expect(pose.height).toBeCloseTo(60 - GIMBAL_DROP, 9);
  });

  it('point visé lointain : inclinaison bornée, le centre de l’image se rapproche de l’appareil', () => {
    const pose = dronePose(input({ hasTarget: true, tx: 400, tz: 0 }), createPose());
    expect(pose.pitch).toBeCloseTo(MIN_PITCH, 9);
    expect(pose.yaw).toBeCloseTo(Math.PI / 2, 9);   // vers l'est
    expect(pose.lookX).toBeGreaterThan(50);
    expect(pose.lookX).toBeLessThan(400);
    expect(pose.lookZ).toBeCloseTo(0, 6);
  });

  it('à la verticale du point visé : vue zénithale, cap de l’appareil', () => {
    const pose = dronePose(input({ heading: 1.2, hasTarget: true, tx: 0.1, tz: 0.1 }), createPose());
    expect(pose.pitch).toBeCloseTo(Math.PI / 2, 9);
    expect(pose.yaw).toBeCloseTo(1.2, 9);
    expect(Math.hypot(pose.lookX, pose.lookZ)).toBeLessThan(1e-6);
  });

  it('sans point visé : regard oblique vers l’avant de l’appareil', () => {
    const pose = dronePose(input({ heading: 0, ground: 2, y: 82 }), createPose());
    expect(pose.pitch).toBeCloseTo(DEFAULT_PITCH, 9);
    expect(pose.yaw).toBe(0);
    expect(pose.lookZ).toBeGreaterThan(0);          // devant (+Z pour un cap nul)
    expect(pose.lookY).toBe(2);
  });

  it('lissage d’angle par le plus court chemin', () => {
    const a = dampAngle(3.1, -3.1, 1, 0.5);
    expect(a).toBeGreaterThan(3.1);                  // passe par π, pas par 0
  });
});

describe('retour vidéo du drone — habillage', () => {
  it('estimation arrondie de l’effectif', () => {
    expect(roughCount(0)).toBe(0);
    expect(roughCount(7)).toBe(7);
    expect(roughCount(43)).toBe(40);
    expect(roughCount(847)).toBe(850);
    expect(roughCount(1234)).toBe(1250);
    expect(roughCount(4321)).toBe(4300);
    expect(crowdLabel(0)).toBe('personne');
    expect(crowdLabel(847)).toBe('≈ 850 pers.');
    expect(crowdLabel(4321)).toBe('≈ 4 300 pers.');
  });

  it('horodatage vidéo', () => {
    expect(videoClock(14 + 1 / 60 + 23 / 3600)).toBe('14:01:23');
    expect(videoClock(25.5)).toBe('01:30:00');
  });

  it('taille de la fenêtre : 320 × 180 sur grand écran, réduite en compact, jamais envahissante', () => {
    expect(feedSize(1920, 1080, false)).toEqual({ width: 320, height: 180 });
    expect(feedSize(1280, 720, true)).toEqual({ width: 560, height: 315 });
    const phone = feedSize(844, 390, false);
    expect(phone.width).toBe(224);
    const big = feedSize(844, 390, true);
    expect(big.height).toBeLessThanOrEqual(390 * 0.52);
    expect(big.width / big.height).toBeCloseTo(16 / 9, 1);
  });
});

describe('vue annexe du rendu de base (sans WebGL)', () => {
  function fakeRenderer() {
    const calls: string[] = [];
    const canvas = { width: 1280, height: 720 };
    const r = {
      domElement: canvas,
      shadowMap: { autoUpdate: true },
      autoClear: true,
      getPixelRatio: () => 1,
      getSize: (v: { x: number; y: number; set?: unknown }) => { v.x = 1280; v.y = 720; return v; },
      getRenderTarget: () => null,
      setRenderTarget: () => calls.push('target'),
      setViewport: (x: number, y: number, w: number, h: number) => calls.push(`viewport ${x} ${y} ${w} ${h}`),
      setScissor: (x: number, y: number, w: number, h: number) => calls.push(`scissor ${x} ${y} ${w} ${h}`),
      setScissorTest: (on: boolean) => calls.push(`test ${on}`),
      render: () => {
        calls.push(`render shadows=${r.shadowMap.autoUpdate}`);
      },
    };
    return { r, calls, canvas };
  }

  it('dessine dans le coin du tampon, recopie dans la cible, puis rend l’état du renderer', () => {
    const aux = new AuxView();
    const { r, calls, canvas } = fakeRenderer();
    const drawImage = vi.fn();
    aux.target = { isConnected: true, width: 320, height: 180, getContext: () => ({ drawImage }) } as unknown as HTMLCanvasElement;
    const order: string[] = [];
    aux.addPassHook(() => order.push(`avant ${aux.rendering}`), () => order.push('après'));
    expect(aux.draw(r as never, {} as never)).toBe(false);      // pas demandée
    aux.active = true;
    expect(aux.draw(r as never, {} as never)).toBe(true);
    expect(order).toEqual(['avant true', 'après']);
    expect(aux.rendering).toBe(false);
    expect(calls).toContain('viewport 0 0 320 180');
    expect(calls).toContain('render shadows=false');
    expect(calls.slice(-4)).toEqual(['test false', 'viewport 0 0 1280 720', 'scissor 0 0 1280 720', 'target']);
    expect(r.shadowMap.autoUpdate).toBe(true);
    expect(drawImage).toHaveBeenCalledWith(canvas, 0, 720 - 180, 320, 180, 0, 0, 320, 180);
    expect(aux.camera.aspect).toBeCloseTo(16 / 9, 6);
    expect(aux.frames).toBe(1);
    // cadence : pas de seconde image dans la foulée, sauf demande expresse
    expect(aux.draw(r as never, {} as never)).toBe(false);
    aux.requestFrame();
    expect(aux.draw(r as never, {} as never)).toBe(true);
  });

  it('une erreur de rendu ne laisse pas le renderer dans un état faux', () => {
    const aux = new AuxView();
    const { r } = fakeRenderer();
    r.render = () => { throw new Error('contexte perdu'); };
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    aux.active = true;
    aux.target = { isConnected: true, width: 320, height: 180, getContext: () => ({ drawImage: () => {} }) } as unknown as HTMLCanvasElement;
    expect(aux.draw(r as never, {} as never)).toBe(false);
    expect(r.shadowMap.autoUpdate).toBe(true);
    expect(aux.rendering).toBe(false);
    err.mockRestore();
  });
});
