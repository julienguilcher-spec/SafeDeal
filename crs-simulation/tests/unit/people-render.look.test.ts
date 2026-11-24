// Tests de l'apparence (palette, masque de pièces, marquages), du registre des modèles tenus et des
// géométries (budgets de sommets par niveau de détail, attributs valides).
import { describe, expect, it } from 'vitest';
import type { PersonLook } from '@/core/contracts';
import { LOOK_OPT, LOOK_TEXT, LOOK_W, lookSignature, resolveLook } from '@/render/people/look';
import {
  MASK_BITS, PART_ARMBAND, PART_BACK_TEXT, PART_BACK_TEXT_VEST, PART_CHASUBLE, PART_COUNT, PART_FACE_COVER,
  PART_GAS_MASK, PART_HAIR_SHORT, PART_HAND_R_FIST, PART_HAND_R_OPEN, PART_HELMET_MO, PART_HELMET_STRIPES,
  PART_HOOD_UP, PART_SASH, PART_VEST_TACTICAL,
} from '@/render/people/parts';
import { PALETTE_SIZE, SLOT_GEAR, SLOT_TOP, SLOT_VEST } from '@/render/people/geo';
import { aliasHeldModel, findHeldModel, heldModelKeys, registerHeldModel } from '@/render/people/held';
import { ensureModels } from '@/render/people/models';
import { buildBodyGeometry } from '@/render/people/meshes';
import { BONE_COUNT } from '@/render/people/skeleton';

const BASE: PersonLook = {
  height: 1.75, build: 1, skin: 0xd9a47c, hair: 0x2a1c12, hairStyle: 1, top: 0x4a5a6a, bottom: 0x2b3340, shoes: 0x1a1a1c,
  outfit: 'civil', headgear: 'none', visorDown: false, gasMask: false, faceCover: false, backText: '', sash: false,
  armband: 0, vest: 0, rankBars: 0, backpack: false,
};

const cells = new Map<string, number>();
const cellOf = (t: string): number => { if (!cells.has(t)) cells.set(t, cells.size + 1); return cells.get(t)!; };

function resolve(look: Partial<PersonLook>, variant = 5, fistR = false): { has: (part: number) => boolean; row: Float32Array; visor: number } {
  const row = new Float32Array(LOOK_W * 4);
  const info = resolveLook({ ...BASE, ...look }, variant, false, fistR, 0, 0, cellOf, row, 0);
  const has = (part: number): boolean => ((row[LOOK_OPT * 4 + Math.floor(part / MASK_BITS)] >> (part % MASK_BITS)) & 1) === 1;
  return { has, row, visor: info.visor };
}

describe('rendu des personnages — apparence', () => {
  it('CRS en tenue de maintien de l’ordre : casque à bandes, gilet, marquage dorsal, visière', () => {
    const r = resolve({ outfit: 'crs_mo', headgear: 'casque_crs', visorDown: true });
    expect(r.has(PART_HELMET_MO)).toBe(true);
    expect(r.has(PART_HELMET_STRIPES)).toBe(true);
    expect(r.has(PART_VEST_TACTICAL)).toBe(true);
    expect(r.has(PART_BACK_TEXT_VEST)).toBe(true);
    expect(r.has(PART_HAIR_SHORT)).toBe(false);
    expect(r.visor).toBe(2);
    expect(r.row[LOOK_TEXT * 4]).toBe(cellOf('POLICE'));
    expect(resolve({ outfit: 'crs_mo', headgear: 'casque_crs' }).visor).toBe(1);
  });

  it('gendarme mobile : casque bleu sans bandes, marquage GENDARMERIE', () => {
    const r = resolve({ outfit: 'gendarme_mo', headgear: 'casque_gendarme' });
    expect(r.has(PART_HELMET_MO)).toBe(true);
    expect(r.has(PART_HELMET_STRIPES)).toBe(false);
    expect(r.row[LOOK_TEXT * 4]).toBe(cellOf('GENDARMERIE'));
    // casque nettement bleu (composante bleue dominante en linéaire)
    const g = SLOT_GEAR * 4;
    expect(r.row[g + 2]).toBeGreaterThan(r.row[g] * 3);
  });

  it('écharpe tricolore, brassard, masque à gaz, foulard, capuche, chasuble', () => {
    expect(resolve({ outfit: 'commissaire', sash: true }).has(PART_SASH)).toBe(true);
    expect(resolve({ outfit: 'commissaire' }).has(PART_SASH)).toBe(false);
    expect(resolve({ outfit: 'police_civil' }).has(PART_ARMBAND)).toBe(true);
    const gm = resolve({ gasMask: true, faceCover: true });
    expect(gm.has(PART_GAS_MASK)).toBe(true);
    expect(gm.has(PART_FACE_COVER)).toBe(false);
    const bb = resolve({ outfit: 'black_bloc', headgear: 'capuche', faceCover: true });
    expect(bb.has(PART_HOOD_UP)).toBe(true);
    expect(bb.has(PART_FACE_COVER)).toBe(true);
    expect(bb.has(PART_HAIR_SHORT)).toBe(false);
    const fl = resolve({ outfit: 'gilet_fluo' });
    expect(fl.has(PART_CHASUBLE)).toBe(true);
    // jaune fluo : rouge et vert forts, bleu faible
    expect(fl.row[SLOT_VEST * 4 + 1]).toBeGreaterThan(0.6);
    expect(fl.row[SLOT_VEST * 4 + 2]).toBeLessThan(0.05);
    expect(resolve({ outfit: 'presse', backText: 'PRESSE' }).has(PART_BACK_TEXT)).toBe(true);
  });

  it('poing fermé quand un objet est en main ; palette toujours finie', () => {
    const open = resolve({}, 9, false), fist = resolve({}, 9, true);
    expect(open.has(PART_HAND_R_OPEN)).toBe(true);
    expect(fist.has(PART_HAND_R_FIST)).toBe(true);
    expect(fist.has(PART_HAND_R_OPEN)).toBe(false);
    for (const outfit of ['civil', 'crs_mo', 'crs_service', 'gendarme_mo', 'bravm', 'police_civil', 'commissaire', 'pompier', 'samu', 'black_bloc', 'gilet_fluo', 'syndical', 'street_medic', 'presse', 'observateur', 'costume', 'sport', 'tenue_inconnue']) {
      for (let v = 0; v < 40; v++) {
        const r = resolve({ outfit, headgear: ['none', 'casque_crs', 'capuche', 'casquette', 'bonnet', 'cagoule', 'casque_moto', 'inconnu'][v % 8] }, v * 977);
        for (let i = 0; i < PALETTE_SIZE * 4; i++) expect(Number.isFinite(r.row[i])).toBe(true);
        expect(r.row[SLOT_TOP * 4]).toBeGreaterThanOrEqual(0);
      }
    }
    expect(PART_COUNT).toBeLessThanOrEqual(MASK_BITS * 3);
  });

  it('la signature change avec chaque champ pris en compte', () => {
    const s0 = lookSignature(BASE);
    const changes: Partial<PersonLook>[] = [
      { height: 1.8 }, { build: 1.1 }, { skin: 0x7d5234 }, { hair: 0x8a6a3c }, { hairStyle: 3 }, { top: 0x6a2c2c }, { bottom: 0x1e2a3c },
      { shoes: 0xe8e8e4 }, { visorDown: true }, { gasMask: true }, { faceCover: true }, { sash: true }, { armband: 0xff5a1f },
      { vest: 0xd9f000 }, { rankBars: 2 }, { backpack: true },
    ];
    for (const c of changes) expect(lookSignature({ ...BASE, ...c })).not.toBe(s0);
  });
});

describe('rendu des personnages — modèles tenus', () => {
  it('modèles intégrés, alias et enregistrement d’un nouveau modèle', () => {
    ensureModels();
    const keys = heldModelKeys();
    for (const k of ['bouclier', 'baton', 'tonfa', 'gazeuse', 'grenade', 'lanceur_cougar', 'lbd40', 'pistolet', 'megaphone', 'radio',
      'extincteur', 'lampe', 'pave', 'bouteille', 'molotov', 'mortier', 'fumigene', 'pancarte', 'banderole', 'drapeau', 'parapluie',
      'bombe_peinture', 'marteau', 'barre', 'telephone', 'butin', 'trousse_secours', 'appareil_photo', 'camera_tv', 'micro',
      'telecommande_drone', 'menottes', 'grenade_lacrymo', 'grenade_desencerclement']) {
      expect(keys, 'clé ' + k).toContain(k);
      expect(findHeldModel(k)).toBeDefined();
    }
    expect(findHeldModel('grenade_lacrymo')).toBe(findHeldModel('grenade'));
    expect(findHeldModel('bouclier')!.transparent).toBe(true);
    expect(findHeldModel('objet_inconnu')).toBeUndefined();
    registerHeldModel('test_objet', (g) => { g.fixed(0xff0000).box(0, -0.085, 0, 0.1, 0.1, 0.1); }, { hold: 'small' });
    aliasHeldModel('test_alias', 'test_objet');
    expect(findHeldModel('test_alias')).toBe(findHeldModel('test_objet'));
    expect(heldModelKeys()).toContain('test_objet');
  });
});

describe('rendu des personnages — géométries', () => {
  it('trois niveaux de détail aux budgets décroissants, attributs valides', () => {
    const counts: number[] = [];
    for (let d = 0; d < 3; d++) {
      const b = buildBodyGeometry(d);
      counts.push(b.vertexCount);
      expect(b.idx.length % 3).toBe(0);
      for (const i of b.idx) expect(i).toBeLessThan(b.vertexCount);
      for (const v of b.pos) expect(Number.isFinite(v)).toBe(true);
      for (let i = 0; i < b.vertexCount; i++) {
        const n = Math.hypot(b.nrm[i * 3], b.nrm[i * 3 + 1], b.nrm[i * 3 + 2]);
        expect(n).toBeGreaterThan(0.98);
        expect(n).toBeLessThan(1.02);
        expect(b.seg[i * 4]).toBeLessThan(BONE_COUNT);
        expect(b.seg[i * 4 + 2]).toBeLessThan(PART_COUNT);
      }
    }
    expect(counts[0]).toBeLessThan(16000);
    expect(counts[1]).toBeLessThan(counts[0] * 0.45);
    expect(counts[2]).toBeLessThan(260);
    // la silhouette lointaine ne contient que le corps de base
    const far = buildBodyGeometry(2);
    for (let i = 0; i < far.vertexCount; i++) expect(far.seg[i * 4 + 2]).toBe(0);
  });
});
