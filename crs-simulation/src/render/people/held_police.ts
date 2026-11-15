/* Modèles tenus — matériel des forces de l'ordre et de secours. Repère de la main droite (voir api.ts) :
 * prise en (GX, GY, 0), manche le long de Z (pouce vers +Z), canon vers -Y, dessus de l'arme vers +Z. */

import { TEXT_BACK } from './geo';
import { registerHeldModel, aliasHeldModel } from './held';

const GX = 0.012;
const GY = -0.085;
const BLACK = 0x121316;

export function registerPoliceModels(): void {
  // Bouclier rectangulaire transparent (main gauche : paume vers -X, bouclier côté dos de la main).
  registerHeldModel('bouclier', (g) => {
    const b = g as unknown as import('./geo').GeoBuilder;
    // repère local : y = vertical (pouce), z = face avant du bouclier, x = le long de l'avant-bras
    b.push().frame(0, 1, 0, 0, 0, 1, 1, 0, 0).translate(0.10, -0.08, 0);
    const R = 0.95, a = 0.305, oz = 0.07 - R;
    b.fixed(0xbfd3df, 0.26);
    b.arc([[-0.50, R, R, oz], [0.0, R, R, oz], [0.50, R, R, oz]], 6, Math.PI / 2 + a, Math.PI / 2 - a);
    // bandeau de marquage (POLICE, CRS, GENDARMERIE)
    b.fixed(0x16233f, 0.82).text(TEXT_BACK);
    b.arc([[0.24, R + 0.002, R + 0.002, oz], [0.37, R + 0.002, R + 0.002, oz]], 6, Math.PI / 2 + a * 0.93, Math.PI / 2 - a * 0.93);
    b.text(0);
    // chants renforcés
    b.fixed(0x9fb2bd, 0.6);
    b.arc([[0.487, R + 0.001, R + 0.001, oz], [0.50, R + 0.001, R + 0.001, oz]], 6, Math.PI / 2 + a, Math.PI / 2 - a);
    b.arc([[-0.50, R + 0.001, R + 0.001, oz], [-0.487, R + 0.001, R + 0.001, oz]], 6, Math.PI / 2 + a, Math.PI / 2 - a);
    b.pop();
    // poignée et sangle d'avant-bras (opaques)
    b.fixed(BLACK, 1);
    b.cyl(-0.012, GY, -0.07, -0.012, GY, 0.07, 0.014, 0.014, 6);
    b.box(0.022, GY, 0.075, 0.07, 0.03, 0.012);
    b.box(0.022, GY, -0.075, 0.07, 0.03, 0.012);
    b.box(0.03, 0.16, 0, 0.012, 0.05, 0.13);
    b.box(-0.02, 0.16, 0.06, 0.09, 0.05, 0.008);
    b.box(-0.02, 0.16, -0.06, 0.09, 0.05, 0.008);
  }, { bone: 'handL', hold: 'shield', big: true, transparent: true, text: 'unit' });

  // Bâton de défense droit (60 cm)
  registerHeldModel('baton', (g) => {
    g.fixed(BLACK, 0.5);
    g.cyl(GX, GY, -0.11, GX, GY, 0.49, 0.0155, 0.0145, 8);
    g.fixed(0x1d1f24, 0.9);
    g.cyl(GX, GY, -0.115, GX, GY, 0.06, 0.018, 0.018, 8);
  }, { hold: 'stick' });

  // Tonfa (bâton de défense à poignée latérale)
  registerHeldModel('tonfa', (g) => {
    g.fixed(BLACK, 0.5);
    g.cyl(GX, GY, -0.115, GX, GY, 0.48, 0.0155, 0.0155, 8);
    g.cyl(GX, GY, 0.058, GX + 0.125, GY, 0.058, 0.015, 0.015, 8);
    g.cyl(GX + 0.125, GY, 0.058, GX + 0.135, GY, 0.058, 0.021, 0.021, 8);
  }, { hold: 'stick' });

  // Gazeuse (aérosol lacrymogène de grande capacité) : corps vertical, buse vers l'avant (-Y)
  registerHeldModel('gazeuse', (g) => {
    g.fixed(0x1a1b1e, 0.45);
    g.cyl(GX + 0.008, GY, -0.125, GX + 0.008, GY, 0.085, 0.032, 0.032, 10);
    g.fixed(0xc8361e, 0.5);
    g.cyl(GX + 0.008, GY, -0.06, GX + 0.008, GY, 0.0, 0.0328, 0.0328, 10, false);
    g.fixed(0x101113, 0.5);
    g.box(GX + 0.008, GY - 0.012, 0.105, 0.04, 0.085, 0.04);
    g.cyl(GX + 0.008, GY - 0.05, 0.105, GX + 0.008, GY - 0.075, 0.105, 0.007, 0.007, 6);
  }, { hold: 'spray' });

  // Grenade lacrymogène à main
  registerHeldModel('grenade', (g) => {
    g.fixed(0xa8adb3, 0.35);
    g.cyl(GX + 0.014, GY - 0.004, -0.065, GX + 0.014, GY - 0.004, 0.065, 0.028, 0.028, 10);
    g.fixed(0x2c5fb0, 0.5);
    g.cyl(GX + 0.014, GY - 0.004, -0.02, GX + 0.014, GY - 0.004, 0.02, 0.0287, 0.0287, 10, false);
    g.fixed(0x2a2b2e, 0.5);
    g.cyl(GX + 0.014, GY - 0.004, 0.065, GX + 0.014, GY - 0.004, 0.092, 0.013, 0.011, 8);
    g.box(GX + 0.038, GY - 0.004, 0.045, 0.006, 0.014, 0.085);
  }, { hold: 'small' });
  aliasHeldModel('grenade_lacrymo', 'grenade');
  aliasHeldModel('grenade_gm2l', 'grenade');

  // Grenade de désencerclement (corps caoutchouc noir, plus trapu)
  registerHeldModel('grenade_desencerclement', (g) => {
    g.fixed(0x18191b, 0.8);
    g.cyl(GX + 0.016, GY - 0.004, -0.05, GX + 0.016, GY - 0.004, 0.05, 0.033, 0.033, 10);
    g.fixed(0x8f9499, 0.35);
    g.cyl(GX + 0.016, GY - 0.004, 0.05, GX + 0.016, GY - 0.004, 0.078, 0.013, 0.011, 8);
    g.box(GX + 0.045, GY - 0.004, 0.035, 0.006, 0.014, 0.075);
  }, { hold: 'small' });

  // Lanceur de grenades 56 mm (type Cougar) : gros tube court, crosse, poignée
  registerHeldModel('lanceur_cougar', (g) => {
    const z = 0.078;
    g.fixed(0x17181b, 0.5);
    g.cyl(GX, GY + 0.01, z, GX, GY - 0.40, z, 0.036, 0.036, 12);        // tube
    g.fixed(0x101113, 0.35);
    g.cyl(GX, GY - 0.40, z, GX, GY - 0.415, z, 0.040, 0.040, 12);
    g.fixed(0x1c1d21, 0.6);
    g.box(GX, GY + 0.035, z, 0.05, 0.11, 0.075);                          // bascule
    g.box(GX, GY + 0.165, z - 0.012, 0.036, 0.21, 0.055);                 // crosse
    g.box(GX, GY + 0.275, z - 0.02, 0.042, 0.02, 0.105);                  // plaque de couche
    g.push().translate(GX, GY, 0).rotX(0.22);
    g.box(0, 0.008, -0.005, 0.032, 0.042, 0.125);                         // poignée pistolet
    g.pop();
    g.box(GX, GY - 0.19, z - 0.062, 0.03, 0.04, 0.085);                   // poignée avant
  }, { hold: 'long', twoHanded: true });

  // LBD 40 : canon de 40 mm, crosse squelette, viseur électronique, poignée avant
  registerHeldModel('lbd40', (g) => {
    const z = 0.076;
    g.fixed(0x15161a, 0.5);
    g.cyl(GX, GY - 0.02, z, GX, GY - 0.33, z, 0.026, 0.026, 10);         // canon
    g.fixed(0x202227, 0.55);
    g.box(GX, GY + 0.015, z, 0.046, 0.15, 0.064);                         // carcasse
    g.box(GX, GY - 0.02, z + 0.058, 0.03, 0.07, 0.04);                    // viseur
    g.fixed(0x2c3a44, 0.15);
    g.box(GX, GY - 0.056, z + 0.06, 0.024, 0.004, 0.03);
    g.fixed(0x1a1b1f, 0.6);
    g.box(GX, GY + 0.17, z + 0.012, 0.022, 0.18, 0.02);                   // crosse (tube haut)
    g.box(GX, GY + 0.17, z - 0.04, 0.022, 0.16, 0.016);
    g.box(GX, GY + 0.255, z - 0.014, 0.036, 0.022, 0.10);                 // plaque de couche
    g.push().translate(GX, GY, 0).rotX(0.22);
    g.box(0, 0.008, -0.005, 0.032, 0.042, 0.125);
    g.pop();
    g.box(GX, GY - 0.19, z - 0.07, 0.03, 0.036, 0.10);                    // poignée avant verticale
  }, { hold: 'long', twoHanded: true });

  // Arme de service (pistolet semi-automatique générique)
  registerHeldModel('pistolet', (g) => {
    g.fixed(0x16171a, 0.4);
    g.box(GX, GY - 0.055, 0.062, 0.027, 0.19, 0.034);                     // culasse
    g.fixed(0x1f2024, 0.7);
    g.push().translate(GX, GY, 0).rotX(0.2);
    g.box(0, 0.012, 0.0, 0.03, 0.045, 0.115);                             // poignée
    g.pop();
    g.box(GX, GY - 0.05, 0.035, 0.022, 0.09, 0.022);                      // pontet
  }, { hold: 'pistol' });

  // Mégaphone : poignée pistolet, pavillon vers l'avant
  registerHeldModel('megaphone', (g) => {
    const z = 0.095;
    g.fixed(0x2a2b2f, 0.6);
    g.box(GX, GY + 0.004, 0.02, 0.03, 0.04, 0.115);                       // poignée
    g.fixed(0xdfe2e6, 0.4);
    g.cyl(GX, GY + 0.10, z, GX, GY + 0.02, z, 0.034, 0.048, 12);          // corps arrière
    g.cyl(GX, GY + 0.02, z, GX, GY - 0.20, z, 0.048, 0.115, 14, false);   // pavillon
    g.fixed(0xb0251e, 0.4);
    g.cyl(GX, GY - 0.20, z, GX, GY - 0.215, z, 0.115, 0.118, 14, false);
    g.fixed(0x3a3c40, 0.7);
    g.cyl(GX, GY - 0.03, z, GX, GY - 0.195, z, 0.012, 0.085, 10, false);  // intérieur sombre
    g.fixed(0x1c1d20, 0.5);
    g.cyl(GX, GY + 0.10, z, GX, GY + 0.125, z, 0.026, 0.02, 10);          // embouchure
  }, { hold: 'megaphone' });

  // Poste radio portatif
  registerHeldModel('radio', (g) => {
    g.fixed(0x17181b, 0.55);
    g.box(GX + 0.006, GY, 0.02, 0.036, 0.06, 0.135);
    g.cyl(GX + 0.006, GY + 0.018, 0.085, GX + 0.006, GY + 0.018, 0.22, 0.006, 0.004, 6);
    g.fixed(0x3d4b3a, 0.3);
    g.box(GX + 0.025, GY, 0.05, 0.002, 0.036, 0.03);
  }, { hold: 'small' });

  // Extincteur à poudre : corps rouge suspendu sous la poignée, tromblon vers l'avant
  registerHeldModel('extincteur', (g) => {
    g.fixed(0xc01e1a, 0.35);
    g.cyl(GX, GY - 0.075, 0, GX, GY - 0.44, 0, 0.062, 0.062, 14);
    g.ellipsoid(GX, GY - 0.075, 0, 0.062, 0.035, 0.062, 12, 4);
    g.fixed(0x1a1a1c, 0.5);
    g.cyl(GX, GY - 0.02, 0, GX, GY - 0.05, 0, 0.022, 0.03, 8);
    g.box(GX, GY + 0.004, 0.02, 0.022, 0.016, 0.12);
    g.cyl(GX, GY - 0.03, 0.03, GX, GY - 0.18, 0.13, 0.012, 0.012, 6);
    g.cyl(GX, GY - 0.18, 0.13, GX, GY - 0.20, 0.30, 0.018, 0.04, 8);
    g.fixed(0xe8e8e2, 0.6);
    g.cyl(GX, GY - 0.20, 0, GX, GY - 0.31, 0, 0.0626, 0.0626, 14, false);
  }, { hold: 'extinguisher', twoHanded: true });

  // Lampe torche
  registerHeldModel('lampe', (g) => {
    g.fixed(0x1b1c1f, 0.4);
    g.cyl(GX, GY, -0.09, GX, GY, 0.11, 0.015, 0.015, 8);
    g.cyl(GX, GY, 0.11, GX, GY, 0.17, 0.016, 0.026, 8);
    g.fixed(0xf4f1d8, 0.2);
    g.cyl(GX, GY, 0.17, GX, GY, 0.172, 0.023, 0.023, 8);
  }, { hold: 'stick' });

  // Menottes
  registerHeldModel('menottes', (g) => {
    g.fixed(0xaeb3ba, 0.25);
    for (const s of [-1, 1]) {
      g.push().translate(GX + 0.012, GY - 0.05, s * 0.047);
      for (let i = 0; i < 8; i++) {
        const a0 = (i / 8) * Math.PI * 2, a1 = ((i + 1) / 8) * Math.PI * 2;
        g.cyl(0, Math.cos(a0) * 0.036, Math.sin(a0) * 0.036, 0, Math.cos(a1) * 0.036, Math.sin(a1) * 0.036, 0.0055, 0.0055, 4, false);
      }
      g.pop();
    }
    g.box(GX + 0.012, GY - 0.05, 0, 0.008, 0.012, 0.03);
  }, { hold: 'small' });

  // Télécommande de drone : boîtier tenu à deux mains, manches, support d'écran
  registerHeldModel('telecommande_drone', (g) => {
    g.fixed(0x2b2d31, 0.6);
    g.box(GX + 0.075, GY + 0.005, 0.03, 0.18, 0.10, 0.04);
    g.fixed(0x101113, 0.5);
    g.cyl(GX + 0.03, GY + 0.005, 0.05, GX + 0.03, GY + 0.005, 0.075, 0.006, 0.008, 6);
    g.cyl(GX + 0.12, GY + 0.005, 0.05, GX + 0.12, GY + 0.005, 0.075, 0.006, 0.008, 6);
    g.push().translate(GX + 0.075, GY - 0.06, 0.065).rotX(-0.55);
    g.box(0, 0, 0, 0.15, 0.008, 0.085);
    g.fixed(0x6f93b8, 0.15);
    g.box(0, 0.005, 0, 0.135, 0.002, 0.07);
    g.pop();
    g.fixed(0x101113, 0.5);
    g.cyl(GX + 0.0, GY - 0.045, 0.03, GX - 0.01, GY - 0.13, 0.06, 0.004, 0.003, 5);
    g.cyl(GX + 0.15, GY - 0.045, 0.03, GX + 0.16, GY - 0.13, 0.06, 0.004, 0.003, 5);
  }, { hold: 'remote', twoHanded: true });

  // Masque à gaz tenu à la main, fusée de sommation, lance d'incendie
  registerHeldModel('masque_gaz', (g) => {
    g.fixed(0x1b1d1f, 0.6);
    g.ellipsoid(GX + 0.03, GY - 0.02, 0, 0.06, 0.09, 0.075, 10, 6);
    g.fixed(0x26292c, 0.5);
    g.cyl(GX + 0.07, GY - 0.04, 0.03, GX + 0.13, GY - 0.05, 0.05, 0.04, 0.04, 10);
  }, { hold: 'small' });
  registerHeldModel('fusee_sommation', (g) => {
    g.fixed(0xb5231c, 0.5);
    g.cyl(GX + 0.006, GY, -0.07, GX + 0.006, GY, 0.20, 0.019, 0.019, 8);
    g.fixed(0x2a2a2c, 0.5);
    g.cyl(GX + 0.006, GY, -0.09, GX + 0.006, GY, -0.07, 0.021, 0.021, 8);
  }, { hold: 'small' });
  registerHeldModel('lance_incendie', (g) => {
    g.fixed(0x9aa0a6, 0.3);
    g.cyl(GX, GY + 0.05, 0.06, GX, GY - 0.24, 0.06, 0.024, 0.032, 10);
    g.fixed(0xc01e1a, 0.5);
    g.cyl(GX, GY - 0.24, 0.06, GX, GY - 0.30, 0.06, 0.034, 0.03, 10);
    g.fixed(0x8a1c18, 0.9);
    g.cyl(GX, GY + 0.05, 0.06, GX, GY + 0.45, 0.02, 0.03, 0.03, 8);
  }, { hold: 'long', twoHanded: true });
}
