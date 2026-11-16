/* API publique du rendu des personnages. Les autres modules n'importent que des TYPES depuis ce fichier
 * et obtiennent le service par ctx.service<PeopleRenderApi>('peopleRender'). */

import type { EntityId, Vec3 } from '@/core/contracts';

/*
 * AIDE-MÉMOIRE POUR LES AUTRES MODULES
 *
 * Champs de Person lus à chaque image : x, y, z, heading, posture, upper, upperT, aimYaw, aimPitch, alt,
 * inventory[active].id, gas, gasProtection, stun, burning, wet, injury, custody, vehicleId, seat, carrying,
 * heldBy, dormant, look. (vx et vz ne servent qu'à la première image : la foulée suit le déplacement réel.)
 *
 * Champs de PersonLook pris en compte : height, build, skin, hair, hairStyle (0 rasé, 1 court, 2 mi-long,
 * 3 long, 4 queue de cheval, 5 chignon, 6 volumineux, ≥ 7 chauve), top, bottom, shoes, outfit, headgear,
 * visorDown, gasMask, faceCover, backText, sash, armband, vest, rankBars, backpack, extras.
 * Les tenues officielles (crs_mo, crs_service, gendarme_mo, bravm, pompier, samu) imposent leurs couleurs
 * réglementaires : top / bottom / shoes y sont ignorés.
 *
 * Clés reconnues dans PersonLook.extras (toutes facultatives) :
 *   helmetColor, bandColor, packColor, coverColor, gloves : couleurs 0xRRGGBB (casque ou couvre-chef,
 *     bandes du casque, sac à dos, foulard, gants) ;
 *   jacket : 0 aucun, 1 blouson, 2 manteau ; sleeves : 0 = manches courtes ; shorts : 1 ; skirt : 1 ;
 *   beard : 1 ; scarf : 0 / 1 ; goggles : 1 ; hoodDown : 0 / 1 (capuche rabattue dans le dos).
 * Le rendu détecte un changement de look par ses champs ; pour un changement à l'intérieur de `extras`,
 * remplacer l'objet extras ou appeler invalidate(id).
 *
 * Repères de temps des animations (Person.upperT, secondes) : voir l'en-tête de upper.ts
 * (lancer : l'objet quitte la main vers 0,42 s ; coup de bâton : impact vers 0,28 s ; coup de pied : 0,26 s).
 */

/** Os auquel un modèle tenu est attaché. */
export type HeldBone = 'handR' | 'handL' | 'chest' | 'head';

/** Style de prise : détermine le maintien par défaut quand Person.upper vaut 'none'. */
export type HoldStyle =
  | 'none' | 'small' | 'stick' | 'shield' | 'long' | 'pistol' | 'pole' | 'banner' | 'loot' | 'camera'
  | 'camera_tv' | 'phone' | 'megaphone' | 'extinguisher' | 'bag' | 'remote' | 'spray';

export interface HeldModelOptions {
  /** Os d'attache (défaut : main droite). */
  bone?: HeldBone;
  /** Style de prise (défaut : 'small'). */
  hold?: HoldStyle;
  /** Visible aussi de loin (bouclier, banderole, pancarte, drapeau, parapluie). */
  big?: boolean;
  /** Dessiné dans la passe transparente ; le 4e canal des couleurs vaut alors l'opacité. */
  transparent?: boolean;
  /** Couleurs possibles de la partie « variable » (une par porteur, tirée de son identifiant). */
  colors?: readonly number[];
  /** Texte plaqué : slogan fictif (pancartes, banderoles) ou marquage d'unité (bouclier). */
  text?: 'none' | 'slogan' | 'unit';
  /** L'objet occupe aussi la main gauche (poing fermé). */
  twoHanded?: boolean;
}

/**
 * Outil de dessin passé aux fabriques de modèles. Repère de la main DROITE : origine au poignet, doigts
 * vers -Y, côté du pouce vers +Z, paume vers +X ; le centre de la prise est en (0,012 ; -0,085 ; 0).
 * Un manche tenu dans le poing s'étend le long de Z ; un canon pointe vers -Y, le dessus de l'arme vers +Z.
 * Unités : mètres (les objets ne sont pas mis à l'échelle du porteur).
 */
export interface HeldBuilder {
  /** Couleur fixe 0xRRGGBB ; a = rugosité (0,06–1) ou opacité si le modèle est transparent. */
  fixed(hex: number, a?: number): this;
  /** Couleur variable selon le porteur (options.colors), ombrée par k. */
  variant(k?: number, a?: number): this;
  /** Les faces suivantes portent le texte du porteur (3 = slogan, 1 = marquage d'unité) ; 0 pour arrêter. */
  text(kind: number): this;
  push(): this;
  pop(): this;
  translate(x: number, y: number, z: number): this;
  rotX(a: number): this;
  rotY(a: number): this;
  rotZ(a: number): this;
  scale(x: number, y: number, z: number): this;
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number): void;
  cyl(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r0: number, r1: number, radial: number, capped?: boolean): void;
  ellipsoid(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, segU: number, segV: number): void;
  /** Quadrilatère (a, b, c, d en sens direct vu de face ; uv 0..1, a = bas gauche) ; double = recto verso. */
  quad(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, dx: number, dy: number, dz: number, double?: boolean): void;
}

export type HeldModelFactory = (g: HeldBuilder) => void;

export interface PeopleRenderStats {
  /** Personnes affichées par niveau de détail (proche, moyen, lointain) et objets tenus. */
  near: number;
  mid: number;
  far: number;
  items: number;
  /** Poses recalculées pendant la dernière image. */
  posed: number;
  /** Coût CPU de la dernière image (ms) et moyenne glissante. */
  cpuMs: number;
  cpuMsAvg: number;
  /** Nombre maximal d'appels de dessin du module (hors passes d'ombre). */
  drawCalls: number;
}

export interface PeopleRenderApi {
  /** Enregistre (ou remplace) un modèle d'objet tenu en main. */
  registerHeldModel(key: string, factory: HeldModelFactory, options?: HeldModelOptions): void;
  /** Fait pointer une clé supplémentaire vers un modèle existant. */
  aliasHeldModel(alias: string, key: string): void;
  /** Clés de modèles reconnues (alias compris). */
  heldModelKeys(): string[];
  /** Force la relecture de l'apparence d'une personne (ou de toutes) à la prochaine image. */
  invalidate(personId?: EntityId): void;
  /** Position monde d'un os de la personne ('head', 'chest', 'handR', 'handL') ; false si non affichée. */
  bonePosition(personId: EntityId, bone: HeldBone, out: Vec3): boolean;
  readonly stats: PeopleRenderStats;
}
