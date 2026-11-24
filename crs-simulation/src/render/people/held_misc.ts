/* Modèles tenus — secours et presse. Repère de la main droite (voir api.ts) ; la caméra d'épaule est
 * attachée au thorax (x = gauche, y = haut, z = avant). */

import { registerHeldModel, aliasHeldModel } from './held';

const GX = 0.012;
const GY = -0.085;

export function registerMiscModels(): void {
  // Trousse de secours : sac rouge à croix blanche, porté à bout de bras
  registerHeldModel('trousse_secours', (g) => {
    g.fixed(0xb81e1a, 0.85);
    g.box(GX, GY - 0.17, 0, 0.15, 0.21, 0.33);
    g.fixed(0x1a1a1c, 0.8);
    g.box(GX, GY - 0.045, 0, 0.02, 0.05, 0.16);
    g.fixed(0xf2f2ee, 0.7);
    for (const s of [-1, 1]) {
      g.box(GX + s * 0.0765, GY - 0.17, 0, 0.003, 0.035, 0.115);
      g.box(GX + s * 0.0765, GY - 0.17, 0, 0.003, 0.115, 0.035);
    }
  }, { hold: 'bag' });

  // Flacon de sérum physiologique
  registerHeldModel('serum_physiologique', (g) => {
    g.fixed(0xeef2f4, 0.35);
    g.cyl(GX + 0.008, GY, -0.05, GX + 0.008, GY, 0.07, 0.02, 0.02, 8);
    g.fixed(0x2a61b8, 0.5);
    g.cyl(GX + 0.008, GY, 0.07, GX + 0.008, GY, 0.095, 0.012, 0.008, 6);
  }, { hold: 'small' });

  // Brancard replié porté d'une main
  registerHeldModel('brancard', (g) => {
    g.fixed(0x9aa0a6, 0.4);
    g.cyl(GX, GY - 0.03, -0.9, GX, GY - 0.03, 0.9, 0.016, 0.016, 6);
    g.cyl(GX, GY - 0.11, -0.9, GX, GY - 0.11, 0.9, 0.016, 0.016, 6);
    g.fixed(0xd0611c, 0.9);
    g.box(GX, GY - 0.07, 0, 0.03, 0.10, 1.5);
  }, { hold: 'bag', big: true });

  // Appareil photo reflex : boîtier vers la paume, objectif vers -Z, dessus vers -Y
  registerHeldModel('appareil_photo', (g) => {
    g.fixed(0x17181b, 0.6);
    g.box(GX + 0.062, GY - 0.004, 0.0, 0.135, 0.095, 0.066);
    g.box(GX + 0.006, GY + 0.004, -0.012, 0.036, 0.10, 0.075);            // poignée
    g.box(GX + 0.066, GY - 0.064, 0.004, 0.055, 0.03, 0.05);              // prisme
    g.fixed(0x101113, 0.45);
    g.cyl(GX + 0.072, GY - 0.002, -0.033, GX + 0.072, GY - 0.002, -0.135, 0.037, 0.039, 12);
    g.fixed(0x2d3f52, 0.08);
    g.cyl(GX + 0.072, GY - 0.002, -0.135, GX + 0.072, GY - 0.002, -0.137, 0.032, 0.032, 12);
    g.fixed(0x2a2b2e, 0.3);
    g.box(GX + 0.062, GY - 0.004, 0.034, 0.075, 0.055, 0.003);            // écran arrière
  }, { hold: 'camera', twoHanded: true });

  // Caméra d'épaule (sur l'épaule droite)
  registerHeldModel('camera_tv', (g) => {
    const x = -0.215, y = 0.325;
    g.fixed(0x202226, 0.6);
    g.box(x, y, 0.07, 0.135, 0.19, 0.40);
    g.fixed(0x15161a, 0.5);
    g.cyl(x, y - 0.01, 0.27, x, y - 0.01, 0.43, 0.052, 0.058, 12);
    g.fixed(0x2d3f52, 0.08);
    g.cyl(x, y - 0.01, 0.43, x, y - 0.01, 0.433, 0.048, 0.048, 12);
    g.fixed(0x15161a, 0.6);
    g.box(x + 0.10, y + 0.06, 0.16, 0.07, 0.05, 0.11);                    // viseur
    g.box(x, y + 0.125, 0.06, 0.03, 0.03, 0.26);                          // poignée de portage
    g.cyl(x - 0.04, y + 0.12, 0.20, x - 0.04, y + 0.12, 0.42, 0.016, 0.02, 8);  // micro canon
    g.fixed(0xb5231c, 0.4);
    g.box(x, y + 0.02, 0.272, 0.02, 0.02, 0.004);
  }, { bone: 'chest', hold: 'camera_tv', twoHanded: true });
  aliasHeldModel('camera', 'camera_tv');

  // Micro à main avec bonnette et cube de chaîne (fictive)
  registerHeldModel('micro', (g) => {
    g.fixed(0x1a1b1e, 0.5);
    g.cyl(GX + 0.004, GY, -0.05, GX + 0.004, GY, 0.14, 0.013, 0.015, 8);
    g.variant(1, 1);
    g.ellipsoid(GX + 0.004, GY, 0.175, 0.033, 0.033, 0.042, 10, 6);
    g.fixed(0xf2f2ee, 0.6);
    g.box(GX + 0.004, GY, 0.115, 0.045, 0.045, 0.04);
  }, { hold: 'small', colors: [0x2a2a2c, 0xb5231c, 0x2a61b8, 0x7a7d82] });
}
