/* Modèles tenus — objets des manifestants. Repère de la main droite (voir api.ts), sauf la banderole et
 * le butin, attachés au thorax (x = gauche, y = haut, z = avant). */

import { TEXT_SLOGAN } from './geo';
import { registerHeldModel, aliasHeldModel } from './held';

const GX = 0.012;
const GY = -0.085;
const BOARD = [0xf2efe6, 0xf2d027, 0xd9382e, 0xbcd6ec, 0xc9a877, 0xf2efe6, 0x8fd18a, 0xf0a13c];
const CLOTH = [0xf4f1e8, 0xc8231e, 0x16181c, 0xf2d027, 0x2a61b8, 0xf4f1e8, 0x3c8f4a, 0xe07a1f];
const FLAGS = [0xc8231e, 0x15161a, 0x2f7d3e, 0xe9b521, 0x7a2f8f, 0xd9d9d4, 0x1f55ad, 0xe0641f];
const UMBRELLAS = [0x15161a, 0x23324f, 0x7a1f24, 0x2f5a3a, 0x4a4d55, 0x8a8f96, 0x15161a, 0xb8482a];

export function registerProtestModels(): void {
  // Pavé (granit gris)
  registerHeldModel('pave', (g) => {
    g.variant(1, 0.95);
    g.push().translate(GX + 0.036, GY - 0.012, 0.0).rotY(0.3);
    g.box(0, 0, 0, 0.098, 0.090, 0.104);
    g.pop();
  }, { hold: 'small', colors: [0x86857f, 0x77766f, 0x93918a, 0x6d6b66] });

  // Bouteille en verre
  registerHeldModel('bouteille', (g) => {
    g.variant(1, 0.12);
    g.cyl(GX + 0.016, GY - 0.004, -0.115, GX + 0.016, GY - 0.004, 0.045, 0.033, 0.033, 10);
    g.cyl(GX + 0.016, GY - 0.004, 0.045, GX + 0.016, GY - 0.004, 0.10, 0.033, 0.014, 10, false);
    g.cyl(GX + 0.016, GY - 0.004, 0.10, GX + 0.016, GY - 0.004, 0.165, 0.014, 0.013, 8);
  }, { hold: 'small', colors: [0x2f5d3a, 0x5a3a1c, 0x3c6f5a, 0x71502a] });

  // Cocktail Molotov : bouteille munie d'une mèche de tissu enflammée (aspect seulement)
  registerHeldModel('molotov', (g) => {
    g.variant(1, 0.12);
    g.cyl(GX + 0.016, GY - 0.004, -0.115, GX + 0.016, GY - 0.004, 0.045, 0.033, 0.033, 10);
    g.cyl(GX + 0.016, GY - 0.004, 0.045, GX + 0.016, GY - 0.004, 0.10, 0.033, 0.014, 10, false);
    g.cyl(GX + 0.016, GY - 0.004, 0.10, GX + 0.016, GY - 0.004, 0.155, 0.014, 0.013, 8);
    g.fixed(0xd8d2c0, 1);
    g.cyl(GX + 0.016, GY - 0.004, 0.15, GX + 0.022, GY - 0.012, 0.215, 0.012, 0.016, 6);
    g.fixed(0xff8a1e, 0.3);
    g.ellipsoid(GX + 0.024, GY - 0.014, 0.245, 0.02, 0.02, 0.04, 6, 4);
    g.fixed(0xffe07a, 0.3);
    g.ellipsoid(GX + 0.024, GY - 0.014, 0.238, 0.011, 0.011, 0.024, 6, 4);
  }, { hold: 'small', colors: [0x5a3a1c, 0x2f5d3a, 0x71502a] });

  // Mortier d'artifice : tube de carton coloré
  registerHeldModel('mortier', (g) => {
    g.variant(1, 0.8);
    g.cyl(GX + 0.008, GY, -0.10, GX + 0.008, GY, 0.38, 0.028, 0.028, 10);
    g.fixed(0xe6c23a, 0.6);
    g.cyl(GX + 0.008, GY, 0.10, GX + 0.008, GY, 0.14, 0.0286, 0.0286, 10, false);
    g.cyl(GX + 0.008, GY, 0.26, GX + 0.008, GY, 0.30, 0.0286, 0.0286, 10, false);
    g.fixed(0x1a1a1c, 0.9);
    g.cyl(GX + 0.008, GY, 0.378, GX + 0.008, GY, 0.382, 0.024, 0.024, 10);
  }, { hold: 'stick', colors: [0xb8231e, 0x1f4fa8, 0x2f7d3e, 0x7a2f8f] });

  // Fumigène à main
  registerHeldModel('fumigene', (g) => {
    g.variant(1, 0.7);
    g.cyl(GX + 0.006, GY, -0.07, GX + 0.006, GY, 0.17, 0.02, 0.02, 8);
    g.fixed(0x2a2a2c, 0.6);
    g.cyl(GX + 0.006, GY, -0.085, GX + 0.006, GY, -0.07, 0.022, 0.022, 8);
    g.fixed(0xf2f2ee, 0.6);
    g.cyl(GX + 0.006, GY, 0.17, GX + 0.006, GY, 0.185, 0.016, 0.012, 8);
  }, { hold: 'small', colors: [0xd9382e, 0xe07a1f, 0x7a2f8f, 0x2a61b8] });

  // Pancarte : manche en bois, panneau portant un slogan (recto verso)
  registerHeldModel('pancarte', (g) => {
    g.fixed(0x9c7a4f, 0.9);
    g.cyl(GX, GY, -0.26, GX, GY, 0.80, 0.012, 0.012, 6);
    const w = 0.31, z0 = 0.74, z1 = 1.20, yf = GY - 0.016, yb = GY + 0.016;
    g.variant(1, 0.85);
    g.box(GX, GY, (z0 + z1) / 2, w * 2, 0.012, z1 - z0);
    g.variant(1, 0.85).text(TEXT_SLOGAN);
    const m = 0.02, tz0 = 0.895, tz1 = 1.045;
    g.quad(GX - w + m, yf + 0.009, tz0, GX + w - m, yf + 0.009, tz0, GX + w - m, yf + 0.009, tz1, GX - w + m, yf + 0.009, tz1);
    g.quad(GX + w - m, yb - 0.009, tz0, GX - w + m, yb - 0.009, tz0, GX - w + m, yb - 0.009, tz1, GX + w - m, yb - 0.009, tz1);
    g.text(0);
  }, { hold: 'pole', big: true, colors: BOARD, text: 'slogan', twoHanded: true });

  // Banderole (attachée au thorax, tenue à deux mains devant soi)
  registerHeldModel('banderole', (g) => {
    const w = 0.92, y1 = 0.20, y0 = -0.62, z = 0.445;
    g.fixed(0x8a6a42, 0.9);
    g.cyl(-w, y1 + 0.012, z, w, y1 + 0.012, z, 0.013, 0.013, 6);
    g.variant(1, 0.9);
    g.quad(-w, y0, z + 0.004, w, y0, z + 0.004, w, y1, z + 0.004, -w, y1, z + 0.004, true);
    g.variant(1, 0.9).text(TEXT_SLOGAN);
    g.quad(-w + 0.06, -0.42, z + 0.007, w - 0.06, -0.42, z + 0.007, w - 0.06, 0.02, z + 0.007, -w + 0.06, 0.02, z + 0.007);
    g.text(0);
  }, { bone: 'chest', hold: 'banner', big: true, colors: CLOTH, text: 'slogan', twoHanded: true });

  // Drapeau : hampe et étoffe unie
  registerHeldModel('drapeau', (g) => {
    g.fixed(0x9c7a4f, 0.85);
    g.cyl(GX, GY, -0.30, GX, GY, 1.85, 0.0135, 0.0125, 6);
    g.variant(1, 0.85);
    const zt = 1.82, zb = 1.24;
    let px = GX, py = GY + 0.014;
    for (let i = 0; i < 4; i++) {
      const nx = GX + (i % 2 === 0 ? 0.05 : -0.04), ny = GY + 0.014 + (i + 1) * 0.225;
      const dz = (i + 1) * 0.03;
      g.quad(px, py, zb - dz + 0.03, nx, ny, zb - dz, nx, ny, zt - dz, px, py, zt - dz + 0.03, true);
      px = nx; py = ny;
    }
  }, { hold: 'pole', big: true, colors: FLAGS, twoHanded: true });

  // Parapluie ouvert
  registerHeldModel('parapluie', (g) => {
    g.fixed(0x2a2a2c, 0.4);
    g.cyl(GX, GY, -0.06, GX, GY, 0.78, 0.006, 0.006, 6);
    g.cyl(GX, GY, -0.06, GX + 0.035, GY, -0.085, 0.009, 0.009, 6);
    g.variant(1, 0.8);
    const n = 8, R = 0.53, zr = 0.62, zc = 0.80;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      const x0 = GX + Math.cos(a0) * R, y0 = GY + Math.sin(a0) * R, x1 = GX + Math.cos(a1) * R, y1 = GY + Math.sin(a1) * R;
      const mx0 = GX + Math.cos(a0) * R * 0.55, my0 = GY + Math.sin(a0) * R * 0.55, mx1 = GX + Math.cos(a1) * R * 0.55, my1 = GY + Math.sin(a1) * R * 0.55;
      g.variant(i % 2 === 0 ? 1 : 0.9, 0.8);
      g.quad(x0, y0, zr, x1, y1, zr, mx1, my1, zc - 0.07, mx0, my0, zc - 0.07, true);
      g.quad(mx0, my0, zc - 0.07, mx1, my1, zc - 0.07, GX, GY, zc, GX, GY, zc, true);
    }
  }, { hold: 'pole', big: true, colors: UMBRELLAS });

  // Bombe de peinture
  registerHeldModel('bombe_peinture', (g) => {
    g.fixed(0xd6d8da, 0.3);
    g.cyl(GX + 0.008, GY, -0.10, GX + 0.008, GY, 0.07, 0.03, 0.03, 10);
    g.variant(1, 0.5);
    g.cyl(GX + 0.008, GY, 0.07, GX + 0.008, GY, 0.10, 0.03, 0.022, 10);
    g.cyl(GX + 0.008, GY, -0.06, GX + 0.008, GY, -0.01, 0.0306, 0.0306, 10, false);
  }, { hold: 'spray', colors: [0xd9382e, 0x16181c, 0x2a61b8, 0xf2d027, 0x2f7d3e] });

  // Marteau
  registerHeldModel('marteau', (g) => {
    g.fixed(0x9c7a4f, 0.85);
    g.cyl(GX, GY, -0.10, GX, GY, 0.27, 0.0135, 0.0125, 6);
    g.fixed(0x5c6066, 0.3);
    g.box(GX, GY - 0.012, 0.275, 0.032, 0.115, 0.034);
  }, { hold: 'stick' });

  // Barre de fer
  registerHeldModel('barre', (g) => {
    g.fixed(0x4a4d52, 0.35);
    g.cyl(GX, GY, -0.26, GX, GY, 0.76, 0.0135, 0.0135, 6);
  }, { hold: 'stick' });

  // Raquette (pour renvoyer les grenades)
  registerHeldModel('raquette', (g) => {
    g.fixed(0x1c1c1f, 0.6);
    g.cyl(GX, GY, -0.08, GX, GY, 0.20, 0.014, 0.012, 6);
    g.variant(1, 0.4);
    const n = 12, ra = 0.125, rb = 0.16, zc = 0.37;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      g.cyl(GX, GY + Math.cos(a0) * ra, zc + Math.sin(a0) * rb, GX, GY + Math.cos(a1) * ra, zc + Math.sin(a1) * rb, 0.007, 0.007, 4, false);
    }
    g.fixed(0xe8e6da, 0.6);
    for (let i = -2; i <= 2; i++) {
      g.box(GX, GY + i * 0.042, zc, 0.002, 0.002, 0.29 - Math.abs(i) * 0.04);
      g.box(GX, GY, zc + i * 0.055, 0.002, 0.23 - Math.abs(i) * 0.035, 0.002);
    }
  }, { hold: 'stick', colors: [0xd9382e, 0x2a61b8, 0xf2d027] });

  // Téléphone (écran vers la paume)
  registerHeldModel('telephone', (g) => {
    g.fixed(0x141518, 0.3);
    g.box(GX + 0.014, GY, 0.025, 0.009, 0.074, 0.152);
    g.fixed(0x7fa2c8, 0.12);
    g.box(GX + 0.019, GY, 0.025, 0.001, 0.066, 0.138);
  }, { hold: 'phone' });

  // Butin : carton et sac serrés contre la poitrine (attaché au thorax)
  registerHeldModel('butin', (g) => {
    g.variant(1, 0.9);
    g.box(0, -0.115, 0.275, 0.36, 0.24, 0.25);
    g.variant(0.8, 0.9);
    g.box(0, 0.006, 0.275, 0.365, 0.006, 0.255);
    g.fixed(0xe6e2d6, 0.7);
    g.box(-0.06, 0.06, 0.26, 0.16, 0.10, 0.12);
    g.fixed(0x23252a, 0.5);
    g.box(0.09, 0.05, 0.28, 0.11, 0.08, 0.16);
  }, { bone: 'chest', hold: 'loot', colors: [0xa9865c, 0x8f7350, 0xb89a72, 0x7d6a55], twoHanded: true });
  aliasHeldModel('sac_butin', 'butin');
}
