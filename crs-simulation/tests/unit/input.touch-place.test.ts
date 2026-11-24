import { describe, expect, it } from 'vitest';
import type { ItemStack, Vehicle } from '@/core/contracts';
import { InputSystem } from '@/input';
import { createFakeContext } from '@/input/dev/fakeContext';
import { TouchController } from '@/input/touch/controller';
import { CONTROLS, controlRect, overlayScale, touchSeatInfo } from '@/input/touch/layouts';
import { TOUCH_CSS } from '@/input/touch/style';

/**
 * Surcouche tactile : seules les commandes utiles à la PLACE occupée et à l'ÉQUIPEMENT porté sont affichées.
 * Défauts constatés sur téléphone (tests/e2e/verif-roles-interface.mjs) : un CRS transporté en passager dans la
 * colonne voyait volant, pédales, frein à main, klaxon, sirène et gyrophares, qui ne font rien pour un passager
 * (sim/people/player.ts aboard() : seul le conducteur conduit) ; à pied, « Lampe » s'affichait pour tous les rôles
 * (sans lampe torche) et « Visière » pour un manifestant en casquette.
 */
function setup() {
  const fake = createFakeContext({ headless: true });
  const clock = { t: 1000 };
  const sys = new InputSystem({ now: () => clock.t });
  sys.provide(fake.ctx);
  sys.init(fake.ctx);
  const touch = fake.ctx.require<TouchController>('input.touch');
  touch.setForced(true);
  const tick = (): void => {
    clock.t += 16;
    sys.update(1 / 60);
    sys.frame(0.016);
  };
  const person = fake.ctx.player.person() as unknown as { look?: { headgear: string; gasMask: boolean }; seat?: number };
  fake.controls.inVehicle = true;
  const vehicle = fake.ctx.player.vehicle() as Vehicle;
  fake.controls.inVehicle = false;
  return { ...fake, touch, tick, person, vehicle };
}

const VAN = { def: { seats: [{ role: 'driver' }, { role: 'passenger' }, { role: 'passenger' }], turrets: [], hasSiren: true, hasBeacons: true } };

describe('surcouche tactile — place à bord et équipement', () => {
  it('place : conducteur, passager, tireur ; arme, sirène, gyrophares', () => {
    expect(touchSeatInfo(VAN, 0)).toEqual({ seat: 'conducteur', armed: false, siren: true, beacons: true });
    expect(touchSeatInfo(VAN, 2).seat).toBe('passager');
    const centaure = { def: { seats: [{ role: 'driver' }, { role: 'gunner' }], turrets: [{ kind: 'lance_grenades' }], hasSiren: true, hasBeacons: true } };
    expect(touchSeatInfo(centaure, 0)).toMatchObject({ seat: 'conducteur', armed: true });
    expect(touchSeatInfo(centaure, 1)).toMatchObject({ seat: 'tireur', armed: true });
    const civile = { def: { seats: [{ role: 'driver' }, { role: 'passenger' }], turrets: [], hasSiren: false, hasBeacons: false } };
    expect(touchSeatInfo(civile, 0)).toMatchObject({ siren: false, beacons: false });
  });

  it('le service suit la place du joueur à bord (passager de la colonne : pas de conduite)', () => {
    const t = setup();
    const def = t.vehicle.def as unknown as Record<string, unknown>;
    Object.assign(def, VAN.def);
    t.controls.inVehicle = true;
    t.person.seat = 1;
    t.tick();
    expect(t.touch.layout).toBe('vehicule');
    expect(t.touch.seat.seat).toBe('passager');
    t.person.seat = 0;
    t.tick();
    expect(t.touch.seat.seat).toBe('conducteur');
  });

  it('les commandes de conduite et de tir sont marquées pour être masquées hors de leur place', () => {
    const drive = CONTROLS.filter((c) => c.layout === 'vehicule' && c.seat === 'conduite').map((c) => c.key).sort();
    expect(drive).toEqual(['beacons', 'brake', 'gas', 'handbrake', 'headlights', 'horn', 'siren']);
    expect(CONTROLS.find((c) => c.layout === 'vehicule' && c.key === 'fire')!.seat).toBe('arme');
    // « Sortir », la radio et les boutons système restent pour tout le monde
    for (const k of ['exit', 'radio', 'pause', 'map', 'tactical', 'camera']) {
      expect(CONTROLS.find((c) => c.layout === 'vehicule' && c.key === k)!.seat, k).toBeUndefined();
    }
    expect(TOUCH_CSS).toContain('.crs-touch[data-seat="passager"] .ct-drv');
    expect(TOUCH_CSS).toContain('[data-seat="passager"] .ct-stick');
    expect(TOUCH_CSS).toContain('.crs-touch[data-arme="0"] .ct-gun');
    expect(TOUCH_CSS).toContain('.ct-na');
  });

  it('pastilles d’équipement : masque, visière, lampe seulement si on les a', () => {
    const t = setup();
    const inv: ItemStack[] = [{ id: 'bouclier', count: 1 } as ItemStack, { id: 'masque_gaz', count: 1 } as ItemStack];
    t.controls.inventory = inv;
    t.person.look = { headgear: 'casque_crs', gasMask: false };
    t.tick();
    expect(t.touch.layout).toBe('pied');
    expect({ ...t.touch.gear }).toEqual({ mask: true, visor: true, flashlight: false });
    // manifestant en casquette, sans masque
    t.controls.inventory = [{ id: 'pancarte', count: 1 } as ItemStack];
    t.person.look = { headgear: 'casquette', gasMask: false };
    t.tick();
    expect({ ...t.touch.gear }).toEqual({ mask: false, visor: false, flashlight: false });
    // masque déjà sur le visage, lampe dans la dotation
    t.controls.inventory = [{ id: 'lampe', count: 1 } as ItemStack];
    t.person.look = { headgear: 'casque_pompier', gasMask: true };
    t.tick();
    expect({ ...t.touch.gear }).toEqual({ mask: true, visor: true, flashlight: true });
  });

  it('« Sortir » ne passe pas sous la mini-carte (coin haut gauche réservé au HUD : état, mini-carte)', () => {
    // capture tests/e2e/out/verif-roles-interface-tel-crs-conducteur-jeu.png : « Descendre — Fourgon de CRS » sous la mini-carte
    for (const [w, h] of [[667, 375], [844, 390], [932, 430]] as const) {
      const s = overlayScale(w, h);
      for (const c of CONTROLS.filter((k) => k.layout === 'vehicule')) {
        const r = controlRect(c, w, h, s);
        const x1 = c.contextual && c.side === 'left' ? r.x0 + 250 * s : r.x1;
        const inHudCorner = r.x0 < 270 * s && x1 > 140 * s && r.y0 < 165 * s; // mini-carte : x ≈ 145…260, y < 165
        expect(inHudCorner, `${c.key} sur ${w}×${h}`).toBe(false);
      }
    }
  });
});
