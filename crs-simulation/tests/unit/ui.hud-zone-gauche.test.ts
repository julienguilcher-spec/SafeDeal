import { describe, expect, it } from 'vitest';
import { leftZoneCenter, subtitlePlacement, SUBTITLE_MIN_WIDTH, SUBTITLE_NARROW_WIDTH } from '@/ui/hud/layout';
import type { ScreenBox } from '@/ui/hud/layout';

/**
 * Téléphone 844 × 390, commandant sur le terrain : la proposition de l'adjoint (zone de gauche, sous « Secours »)
 * descendait jusque sur l'état physique et la barre d'objets tactile, dont elle masquait cinq cases
 * (tests/e2e/out/verif-roles-interface-tel-commandant-commandant_unite-terrain-jeu.png).
 */
const box = (left: number, top: number, w: number, hgt: number): ScreenBox => ({ left, right: left + w, top, bottom: top + hgt, height: hgt });

describe('HUD — zone de gauche', () => {
  const H = 390;
  const above = box(12, 8, 250, 152);          // état + mini-carte, jusqu'à y = 160
  const floor = 268;                            // haut de l'état physique (zone du bas)

  it('petite zone : juste sous la mini-carte', () => {
    const c = leftZoneCenter(box(210, 180, 90, 30), above, floor, H) ?? H / 2;
    expect(c - 15).toBeGreaterThanOrEqual(160 + 8);
    expect(c + 15).toBeLessThanOrEqual(floor);
  });

  it('proposition de l’adjoint (zone haute) : jamais sur la zone du bas ni sur la barre d’objets', () => {
    const zone = box(210, 140, 230, 140);
    const c = leftZoneCenter(zone, above, floor, H)!;
    expect(c).not.toBeNull();
    expect(c + 70).toBeLessThanOrEqual(floor - 8 + 0.5);
    expect(c - 70).toBeGreaterThanOrEqual(0);
  });

  it('grand écran, zone loin de tout : laissée au milieu', () => {
    expect(leftZoneCenter(box(16, 300, 160, 40), box(16, 16, 280, 120), 720, 720)).toBeNull();
  });
});

/**
 * Téléphone 844 × 390, en véhicule : les boutons « À pied » / « En colonne » (ou la proposition de l'adjoint) vont
 * jusqu'à x ≈ 400–440 et les commandes de droite commencent à x = 554. Resserré dans la bande restante, le sous-titre
 * radio recouvrait « En colonne » et « Plus tard »
 * (tests/e2e/out/verif-roles-interface-tel-crs-conducteur-jeu.png, …-tel-commandant-commandant_unite-salle-jeu.png).
 */
describe('HUD — sous-titres et zone de gauche', () => {
  const W = 844;
  const H = 390;
  const baseLeft = 210;                         // volant tactile
  const baseRight = 554;                        // pédales et avertisseurs
  const bottomTop = 290;                        // haut de la zone du bas (état physique, tableau de bord)
  const above = box(12, 8, 250, 188);           // état + mini-carte + « Radio » / « Ordres », jusqu'à y = 196

  it('zone de gauche absente ou plus haute que les sous-titres : bande normale au-dessus de la zone du bas', () => {
    expect(subtitlePlacement(W, H, baseLeft, baseRight, bottomTop, null, above)).toEqual({ bottom: H - bottomTop + 8, edge: -1 });
    const high = box(210, 120, 90, 40);
    expect(subtitlePlacement(W, H, baseLeft, baseRight, bottomTop, high, above)).toEqual({ bottom: H - bottomTop + 8, edge: -1 });
  });

  it('zone étroite à leur hauteur : les sous-titres passent à sa droite, avec la place d’être lus', () => {
    const zone = box(210, 205, 90, 66);
    const p = subtitlePlacement(W, H, baseLeft, baseRight, bottomTop, zone, above);
    expect(p).toEqual({ bottom: H - bottomTop + 8, edge: 308 });
    expect(baseRight - p.edge).toBeGreaterThanOrEqual(SUBTITLE_MIN_WIDTH);
  });

  it('« À pied » / « En colonne » jusqu’à x = 402 : plus la place à droite, les sous-titres passent au-dessus de la zone', () => {
    const zone = box(210, 205, 192, 66);
    const p = subtitlePlacement(W, H, baseLeft, baseRight, bottomTop, zone, above);
    // au-dessus du haut de la zone (y = 205), et à droite de la mini-carte qui est à cette hauteur
    expect(H - p.bottom).toBeLessThanOrEqual(zone.top - 8);
    expect(p.edge).toBe(above.right + 8);
    expect(baseRight - p.edge).toBeGreaterThanOrEqual(SUBTITLE_MIN_WIDTH);
  });

  it('proposition de l’adjoint (zone large et haute) : même règle', () => {
    const zone = box(210, 205, 228, 175);
    const p = subtitlePlacement(W, H, baseLeft, baseRight, bottomTop, zone, above);
    expect(H - p.bottom).toBeLessThanOrEqual(zone.top - 8);
    expect(baseRight - Math.max(baseLeft, p.edge)).toBeGreaterThanOrEqual(SUBTITLE_MIN_WIDTH);
  });

  it('zone qui monte presque en haut de l’écran : on ne remonte pas les sous-titres dans la barre du haut', () => {
    const zone = box(210, 60, 228, 300);
    const p = subtitlePlacement(W, H, baseLeft, baseRight, bottomTop, zone, above);
    expect(p.bottom).toBe(H - bottomTop + 8);
    expect(p.edge).toBe(446);
  });
});

/**
 * Téléphone 844 × 390 (refonte du commandement, §6.2) : la zone de gauche n'a plus que deux pastilles sur UNE rangée
 * — « Suivez-moi à pied » (ou « … en véhicules ») et « Secours ici » ; « Secours ici » déplié, la pastille « Suivez-moi »
 * s'efface devant « Pompiers ici » / « SAMU ici » sur la même rangée — ; la proposition de l'adjoint et le véhicule qui
 * bloque sont passés en bandeaux en haut au centre. La rangée tient SOUS la mini-carte, jamais dessus, et les
 * sous-titres ne passent jamais sur elle.
 */
describe('HUD — pastilles du téléphone sous la mini-carte', () => {
  const W = 844;
  const H = 390;
  const above = box(12, 8, 250, 188);           // état + mini-carte (+ « Radio » / « Ordres »), jusqu'à y = 196
  const floor = 268;                            // haut de l'état physique (zone du bas)
  const ROW = 44;                               // pastilles au doigt (pointeur grossier : 44 px)

  /** Rectangle des sous-titres placés par subtitlePlacement (bande de deux lignes). */
  function band(p: { bottom: number; edge: number }, baseLeft: number, baseRight: number): ScreenBox {
    const bottom = H - p.bottom;
    const left = p.edge >= 0 ? Math.max(baseLeft, p.edge) : baseLeft;
    return { left, right: baseRight, top: bottom - 64, bottom, height: 64 };
  }
  const overlaps = (a: ScreenBox, b: ScreenBox): boolean => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

  for (const [what, width] of [['« Suivez-moi à pied » + « Secours ici »', 262], ['« Secours ici » déplié (Pompiers, SAMU)', 318]] as const) {
    it(`${what} : sous la mini-carte, au-dessus de la zone du bas`, () => {
      const zone = box(210, 140, width, ROW);
      const c = leftZoneCenter(zone, above, floor, H)!;
      expect(c).not.toBeNull();
      expect(c - ROW / 2).toBeGreaterThanOrEqual(above.bottom);          // jamais sur la mini-carte
      expect(c + ROW / 2).toBeLessThanOrEqual(floor - 8 + 0.5);          // jamais sur l'état physique
      // à pied (pastilles de 210 à 472, joystick 176, boutons d'action à droite) et en véhicule : sous-titres hors de la rangée
      const placed = box(210, c - ROW / 2, width, ROW);
      for (const [baseLeft, baseRight, bottomTop] of [[176, W - 214, floor], [210, W - 290, 290]] as const) {
        const p = subtitlePlacement(W, H, baseLeft, baseRight, bottomTop, placed, above);
        expect(overlaps(band(p, baseLeft, baseRight), placed), `sous-titres ${JSON.stringify(p)}`).toBe(false);
      }
    });
  }
});

/**
 * Téléphone, commandant : la proposition de l'adjoint est un bandeau en haut au centre (x 293…551, y 103…191). Quand la
 * rangée de pastilles ne laisse pas 200 px à sa droite, les sous-titres montaient au-dessus d'elle — sur les boutons
 * « Oui » / « Plus tard » du bandeau (tests/e2e/out/verif-hud-ordres-tel-commandant.png). Ils restent maintenant à
 * droite de la rangée, plus étroits ; sans bandeau (boussole et pastille d'unité seulement), la règle ne change pas.
 */
describe('HUD — sous-titres et bandeaux du haut', () => {
  const W = 844;
  const H = 390;
  const above = box(12, 8, 250, 188);
  const zone = box(210, 204, 262, 30);          // « Suivez-moi à pied » + « Secours ici », sous la mini-carte
  const baseLeft = 176, baseRight = W - 214, bottomTop = 268;

  it('bandeau de l’adjoint en haut au centre : les sous-titres ne le couvrent pas', () => {
    const banner = box(293, 8, 258, 183);
    const p = subtitlePlacement(W, H, baseLeft, baseRight, bottomTop, zone, above, banner);
    const bandBottom = H - p.bottom;
    expect(p.edge).toBe(zone.right + 8);
    expect(baseRight - p.edge).toBeGreaterThanOrEqual(SUBTITLE_NARROW_WIDTH);
    expect(bandBottom - 64).toBeGreaterThanOrEqual(banner.bottom - 1);
  });

  it('sans bandeau (boussole, pastille d’unité) : ils passent au-dessus de la rangée, comme avant', () => {
    const top = box(293, 8, 258, 132);
    const p = subtitlePlacement(W, H, baseLeft, baseRight, bottomTop, zone, above, top);
    expect(H - p.bottom).toBeLessThanOrEqual(zone.top - 8);
    expect(subtitlePlacement(W, H, baseLeft, baseRight, bottomTop, zone, above)).toEqual(p);
  });
});

/**
 * Téléphone : tout ce qui se touche dans le HUD fait au moins 44 px (bloqueur B14 : les pastilles « Suivez-moi » /
 * « Secours ici » faisaient 30 px, les boutons des bandeaux 36 px). Vérifié sur les feuilles de style elles-mêmes : chaque
 * règle du toucher (surcouche tactile, bandeaux du haut, pointeur grossier) qui fixe une hauteur minimale la fixe à 44 px
 * au moins ; « ↶ Annuler » de la puce d'état aussi.
 */
describe('HUD — 44 px au toucher', () => {
  /** Règles « sélecteur{déclarations} » d'une feuille (les blocs @media sont aplatis, leur condition gardée). */
  function rules(css: string): { sel: string; body: string }[] {
    const out: { sel: string; body: string }[] = [];
    const flat = css.replace(/@media\s*\(([^)]*)\)\s*\{([\s\S]*?\})\s*\}/g, (_m, cond: string, inner: string) =>
      inner.replace(/([^{}]+)\{([^}]*)\}/g, (_x, sel: string, body: string) => `@${cond} ${sel}{${body}}`));
    flat.replace(/([^{}]+)\{([^}]*)\}/g, (_x, sel: string, body: string) => {
      out.push({ sel: sel.trim(), body });
      return '';
    });
    return out;
  }
  const touchRule = (sel: string): boolean => /:not\(\[data-touch="none"\]\)|\.cq-banner|pointer:coarse|\.is-undo/.test(sel);

  it('bloc d’ordres et bandeaux : hauteur minimale ≥ 44 px dans toute règle du toucher', async () => {
    const { QUICK_CSS } = await import('@/ui/command/quickActions');
    const { CHIP_CSS } = await import('@/ui/command/hud');
    const checked: string[] = [];
    for (const r of [...rules(QUICK_CSS), ...rules(CHIP_CSS)]) {
      if (!touchRule(r.sel)) continue;
      const m = /min-height:\s*(\d+(?:\.\d+)?)px/.exec(r.body);
      if (!m) continue;
      checked.push(`${r.sel} → ${m[1]} px`);
      expect(Number(m[1]), r.sel).toBeGreaterThanOrEqual(44);
    }
    // les pastilles du téléphone, les boutons des bandeaux et « ↶ Annuler » sont bien couverts
    expect(checked.some((c) => c.includes('.cq .cm-btn'))).toBe(true);
    expect(checked.some((c) => c.includes('.cq-banner .cm-btn'))).toBe(true);
    expect(checked.some((c) => c.includes('.ch-undo'))).toBe(true);
    expect(checked.length).toBeGreaterThanOrEqual(5);
  });
});
