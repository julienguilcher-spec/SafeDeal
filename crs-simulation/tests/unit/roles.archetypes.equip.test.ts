// Archétypes — equip() : changement de poste d'un agent, radicalisation et changement de tenue d'un
// manifestant. Le corps ne change jamais ; tenue et dotation suivent le nouveau rôle.
import { describe, expect, it } from 'vitest';
import type { Person } from '@/core/contracts';
import { ROLES_EQUIPPED_EVENT } from '@/sim/roles';
import type { RolesEquippedEvent } from '@/sim/roles';
import { countOf, handOf, kitIds, startRoles } from '@/sim/roles/archetypes/testkit';

function body(p: Person): unknown {
  const l = p.look;
  return [p.id, p.name, p.rio, l.height, l.build, l.skin, l.hair, l.hairStyle, p.speedWalk, p.speedRun, p.speedSprint];
}

describe('changement de poste', () => {
  it('porteur de bouclier → lanceur : rend le bouclier, perçoit lanceur et grenades', async () => {
    const { ctx } = await startRoles(41);
    const p = ctx.archetypes.spawn('crs', 0, 0, { poste: 'bouclier', rank: 'gardien' });
    const before = body(p);
    const extras = p.look.extras;
    ctx.archetypes.equip(p, 'lanceur');
    expect(p.poste).toBe('lanceur');
    expect(body(p)).toEqual(before);
    expect(countOf(p, 'bouclier')).toBe(0);
    expect(countOf(p, 'lanceur_cougar')).toBe(8);
    expect(countOf(p, 'grenade_lacrymo')).toBe(4);
    expect(countOf(p, 'grenade_gm2l')).toBe(2);
    // ordre des emplacements : celui de la dotation du nouveau poste
    expect(kitIds(p)).toEqual(['lanceur_cougar', 'grenade_lacrymo', 'grenade_gm2l', 'tonfa', 'gazeuse', 'menottes', 'radio', 'masque_gaz', 'pistolet']);
    expect(handOf(p)).toBe('lanceur_cougar');
    expect(p.rank).toBe('gardien');
    expect(p.look.rankBars).toBe(2);
    expect(p.look.outfit).toBe('crs_mo');
    // l'objet extras est remplacé : le rendu détecte le changement par référence
    expect(p.look.extras).not.toBe(extras);
    expect(p.look.extras?.company).toBe(extras?.company);
  });

  it('prise de commandement : écharpe, mégaphone et fusées ; retour dans le rang : plus d’écharpe', async () => {
    const { ctx } = await startRoles(42);
    const p = ctx.archetypes.spawn('crs', 0, 0, { poste: 'chef_section', rank: 'commandant' });
    expect(p.look.sash).toBe(false);
    ctx.archetypes.equip(p, 'commandant_unite');
    expect(p.look.sash).toBe(true);
    expect(countOf(p, 'megaphone')).toBe(1);
    expect(countOf(p, 'fusee_sommation')).toBe(4);
    expect(p.look.rankBars).toBe(4);
    ctx.archetypes.equip(p, 'chef_section');
    expect(p.look.sash).toBe(false);
    expect(countOf(p, 'megaphone')).toBe(0);
    expect(countOf(p, 'fusee_sommation')).toBe(0);
  });

  it('réapprovisionnement : ré-équiper au même poste recomplète les munitions sans rien dupliquer', async () => {
    const { ctx } = await startRoles(43);
    const p = ctx.archetypes.spawn('crs', 0, 0, { poste: 'lanceur' });
    ctx.actions.remove(p, 'grenade_lacrymo', 3);
    ctx.actions.remove(p, 'lanceur_cougar', 5);
    expect(countOf(p, 'grenade_lacrymo')).toBe(1);
    const ids = kitIds(p);
    ctx.archetypes.equip(p, 'lanceur');
    expect(countOf(p, 'grenade_lacrymo')).toBe(4);
    expect(countOf(p, 'lanceur_cougar')).toBe(8);
    expect(kitIds(p)).toEqual(ids);
  });

  it('la dotation est celle du nouveau poste, ni plus ni moins : l’ancien lanceur rend ses grenades en trop', async () => {
    const { ctx } = await startRoles(49);
    const p = ctx.archetypes.spawn('crs', 0, 0, { poste: 'lanceur' });
    expect(countOf(p, 'grenade_lacrymo')).toBe(4);
    ctx.archetypes.equip(p, 'chef_groupe');
    expect(countOf(p, 'grenade_lacrymo')).toBe(2);
    expect(countOf(p, 'grenade_gm2l')).toBe(0);
    expect(countOf(p, 'lanceur_cougar')).toBe(0);
    expect(handOf(p)).toBe('');
  });

  it('le grade change avec la carrière : equip() remet les galons à jour', async () => {
    const { ctx } = await startRoles(44);
    const p = ctx.archetypes.spawn('crs', 0, 0, { poste: 'bouclier', rank: 'gardien' });
    p.rank = 'brigadier_chef';
    ctx.archetypes.equip(p, 'chef_groupe');
    expect(p.look.rankBars).toBe(1);
    expect(p.look.extras?.camera_pieton).toBe(1);
    expect(countOf(p, 'bouclier')).toBe(0);
  });

  it('visière baissée et masque porté sont conservés si la nouvelle tenue les permet', async () => {
    const { ctx } = await startRoles(45);
    const p = ctx.archetypes.spawn('crs', 0, 0, { poste: 'bouclier' });
    // ce que fait le module des personnes quand l'agent baisse sa visière et met son masque
    p.look.visorDown = true;
    p.armorHead += 0.12;
    p.look.gasMask = true;
    p.gasProtection = 0.97;
    ctx.archetypes.equip(p, 'extincteur');
    expect(p.look.visorDown).toBe(true);
    expect(p.armorHead).toBeCloseTo(0.97);
    expect(p.look.gasMask).toBe(true);
    expect(p.gasProtection).toBeCloseTo(0.97);
    // au volant : calot, plus de visière ; le masque reste dans la dotation
    ctx.archetypes.equip(p, 'conducteur');
    expect(p.look.headgear).toBe('calot');
    expect(p.look.visorDown).toBe(false);
    expect(p.armorHead).toBe(0);
    expect(p.look.gasMask).toBe(true);
  });

  it('poste retiré : ceinturon seul', async () => {
    const { ctx } = await startRoles(46);
    const p = ctx.archetypes.spawn('crs', 0, 0, { poste: 'lbd' });
    ctx.archetypes.equip(p, null);
    expect(p.poste).toBeNull();
    expect(kitIds(p)).toEqual(['tonfa', 'gazeuse', 'menottes', 'radio', 'masque_gaz', 'pistolet']);
    expect(handOf(p)).toBe('');
  });

  it('agent créé hors du module : equip() l’habille en gardant son corps', async () => {
    const { ctx } = await startRoles(47);
    const p = ctx.people.spawn({ kind: 'crs', x: 0, z: 0, seed: 9 });
    const height = p.look.height;
    const skin = p.look.skin;
    const walk = p.speedWalk;
    expect(p.inventory.length).toBe(0);
    ctx.archetypes.equip(p, 'bouclier');
    expect(p.poste).toBe('bouclier');
    expect(handOf(p)).toBe('bouclier');
    expect(p.look.outfit).toBe('crs_mo');
    expect(p.look.height).toBe(height);
    expect(p.look.skin).toBe(skin);
    expect(p.speedWalk).toBe(walk);
    expect(p.look.rankBars).toBe(2);
  });

  it('rôle sans rapport avec la personne : seulement enregistré', async () => {
    const { ctx } = await startRoles(48);
    const passant = ctx.archetypes.spawn('passant', 0, 0);
    const kit = kitIds(passant);
    ctx.archetypes.equip(passant, 'bouclier');
    expect(passant.poste).toBe('bouclier');
    expect(kitIds(passant)).toEqual(kit);
    const crs = ctx.archetypes.spawn('crs', 0, 0);
    ctx.archetypes.equip(crs, 'radical');
    expect(crs.profile).toBe('radical');
    expect(crs.look.outfit).toBe('crs_mo');
  });
});

describe('radicalisation et changement de tenue', () => {
  it('un suiveur qui se radicalise enfile capuche et masque, et lâche sa pancarte', async () => {
    const { ctx, ext } = await startRoles(51, { extra: { cause: 'education' } });
    const p = ext.spawnEx('manifestant', 0, 0, { family: 'etudiants', profile: 'opportuniste', carry: 'pancarte' });
    expect(p.look.faceCover).toBe(false);
    expect(handOf(p)).toBe('pancarte');
    ctx.actions.give(p, 'pave', 2);
    const before = body(p);
    const top = p.look.top;
    const sign = p.look.extras?.signText;
    ctx.archetypes.equip(p, 'radical');
    expect(p.profile).toBe('radical');
    expect(body(p)).toEqual(before);
    expect(p.look.headgear).toBe('capuche');
    expect(p.look.faceCover).toBe(true);
    expect(p.look.backpack).toBe(true);
    expect(p.gasProtection).toBeGreaterThanOrEqual(0.3);
    // garde ses vêtements (ce n'est pas un membre du bloc) et ce qu'il a ramassé
    expect(p.look.top).toBe(top);
    expect(countOf(p, 'pancarte')).toBe(0);
    expect(countOf(p, 'pave')).toBe(2);
    expect(handOf(p)).toBe('');
    expect(p.look.extras?.signText).toBe(sign);
    expect(ext.familyOf(p)).toBe('etudiants');
  });

  it('dans la famille du bloc, se radicaliser c’est passer au noir', async () => {
    const { ctx, ext } = await startRoles(52);
    const p = ext.spawnEx('manifestant', 0, 0, { family: 'black_bloc', profile: 'opportuniste', bloc: false });
    expect(p.look.outfit).toBe('civil');
    ctx.archetypes.equip(p, 'radical');
    expect(p.look.outfit).toBe('black_bloc');
    expect(p.look.faceCover).toBe(true);
    expect(ext.inBlocAttire(p)).toBe(true);
  });

  it('le radical se change : noir, puis de nouveau en tenue de ville, exactement la même', async () => {
    const { ext } = await startRoles(53);
    const p = ext.spawnEx('manifestant', 0, 0, { family: 'black_bloc', profile: 'radical', bloc: false });
    const civil = { ...p.look, extras: { ...p.look.extras } };
    const kit = kitIds(p).sort();
    expect(ext.setBlocAttire(p, true)).toBe(true);
    expect(p.look.outfit).toBe('black_bloc');
    expect(p.look.top).toBe(0x0b0b0d);
    expect(p.look.faceCover).toBe(true);
    expect(p.profile).toBe('radical');
    // se changer ne donne ni ne retire aucun objet
    expect(kitIds(p).sort()).toEqual(kit);
    expect(ext.setBlocAttire(p, false)).toBe(true);
    expect({ ...p.look, extras: { ...p.look.extras } }).toEqual(civil);
    expect(kitIds(p).sort()).toEqual(kit);
    expect(p.gasProtection).toBe(0);
    expect(p.armorHead).toBe(0);
  });

  it('la dotation d’un radical ne dépend pas de sa tenue ; se changer ne recomplète rien', async () => {
    const { ctx, ext } = await startRoles(62);
    let withTools = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const civil = ext.spawnEx('manifestant', 0, 0, { family: 'black_bloc', profile: 'radical', bloc: false, seed });
      const noir = ext.spawnEx('manifestant', 0, 0, { family: 'black_bloc', profile: 'radical', bloc: true, seed });
      expect(kitIds(noir), `graine ${seed}`).toEqual(kitIds(civil));
      if (civil.inventory.length > 1) withTools++;
    }
    expect(withTools).toBeGreaterThan(15);
    // un fumigène utilisé ne revient pas parce qu'on a changé de tenue
    const p = ext.spawnEx('manifestant', 0, 0, { family: 'black_bloc', profile: 'radical', bloc: false });
    ctx.actions.give(p, 'fumigene', 1);
    ctx.actions.give(p, 'pave', 1);
    ext.setBlocAttire(p, true);
    expect(countOf(p, 'fumigene')).toBeGreaterThanOrEqual(1);
    ctx.actions.remove(p, 'fumigene');
    ext.setBlocAttire(p, false);
    expect(countOf(p, 'fumigene')).toBe(0);
    expect(countOf(p, 'pave')).toBe(1);
  });

  it('n’importe quel radical peut passer au noir sur ordre de l’IA de foule', async () => {
    const { ext } = await startRoles(54);
    const p = ext.spawnEx('manifestant', 0, 0, { family: 'gilets_jaunes', profile: 'radical' });
    expect(p.look.outfit).toBe('gilet_fluo');
    ext.setBlocAttire(p, true);
    expect(p.look.outfit).toBe('black_bloc');
    expect(p.look.vest).toBe(0);
    ext.setBlocAttire(p, false);
    expect(p.look.outfit).toBe('gilet_fluo');
    expect(p.look.vest).toBe(0xdfff00);
    // un policier n'est pas concerné
    expect(ext.setBlocAttire(ext.spawnEx('crs', 0, 0), true)).toBe(false);
  });

  it('quitter le cortège (profil null) : tenue de ville, plus aucun signe ni outil', async () => {
    const { ctx, ext } = await startRoles(55);
    const p = ext.spawnEx('manifestant', 0, 0, { family: 'syndical', profile: 'militant', carry: 'drapeau' });
    expect(p.look.vest).not.toBe(0);
    ctx.actions.give(p, 'telephone', 1);
    ctx.archetypes.equip(p, null);
    expect(p.profile).toBeNull();
    expect(p.look.outfit).toBe('civil');
    expect(p.look.vest).toBe(0);
    expect(p.look.armband).toBe(0);
    expect(p.look.faceCover).toBe(false);
    expect(kitIds(p)).toEqual(['telephone']);
  });

  it('militant qui devient service d’ordre : brassard, mains libres', async () => {
    const { ctx, ext } = await startRoles(56);
    const p = ext.spawnEx('manifestant', 0, 0, { family: 'syndical', profile: 'militant', carry: 'drapeau' });
    const vest = p.look.vest;
    ctx.archetypes.equip(p, 'service_ordre');
    expect(p.look.armband).toBe(0xc1121f);
    expect(p.look.vest).toBe(vest);
    expect(countOf(p, 'drapeau')).toBe(0);
    ctx.archetypes.equip(p, 'meneur');
    expect(handOf(p)).toBe('megaphone');
    expect(p.look.armband).toBe(0);
  });

  it('changement de famille visuelle : le gilet jaune s’enfile et s’enlève', async () => {
    const { ext } = await startRoles(57);
    const p = ext.spawnEx('manifestant', 0, 0, { family: 'divers', profile: 'pacifique' });
    expect(ext.setFamily(p, 'gilets_jaunes')).toBe(true);
    expect(p.look.outfit).toBe('gilet_fluo');
    expect(ext.familyOf(p)).toBe('gilets_jaunes');
    expect(ext.setFamily(p, 'divers')).toBe(true);
    expect(p.look.vest).toBe(0);
  });

  it('pilleur : capuche, sac, pas de signe d’appartenance', async () => {
    const { ctx, ext } = await startRoles(58);
    const p = ext.spawnEx('manifestant', 0, 0, { family: 'syndical', profile: 'opportuniste' });
    ctx.actions.give(p, 'butin', 3);
    ctx.archetypes.equip(p, 'pilleur');
    expect(p.look.headgear).toBe('capuche');
    expect(p.look.backpack).toBe(true);
    expect(p.look.vest).toBe(0);
    expect(countOf(p, 'butin')).toBe(3);
  });

  it('signale chaque habillage par l’événement libre « roles:equipped »', async () => {
    const { ctx } = await startRoles(59);
    const seen: RolesEquippedEvent[] = [];
    ctx.events.onAny(ROLES_EQUIPPED_EVENT, (e) => seen.push(e as RolesEquippedEvent));
    const p = ctx.archetypes.spawn('manifestant', 0, 0, { profile: 'pacifique' });
    ctx.archetypes.equip(p, 'opportuniste');
    expect(seen).toEqual([{ id: p.id, spawned: true }, { id: p.id, spawned: false }]);
  });

  it('transmet le texte de la pancarte au rendu des personnages quand il est branché', async () => {
    const { ctx, ext, causes } = await startRoles(60, { extra: { cause: 'logement' } });
    const texts = new Map<number, string | null>();
    ctx.provide('peopleRender', { setHeldText: (id: number, text: string | null) => void texts.set(id, text) });
    const p = ext.spawnEx('manifestant', 0, 0, { profile: 'pacifique', carry: 'pancarte' });
    expect(texts.get(p.id)).toBe(causes.signText(p.look.extras!.signText!));
    expect(causes.get('logement')!.signs).toContain(texts.get(p.id));
    ctx.archetypes.equip(p, 'radical');
    expect(texts.get(p.id)).toBeNull();
    // un agent ne déclenche rien
    const crs = ext.spawnEx('crs', 0, 0);
    expect(texts.has(crs.id)).toBe(false);
  });

  it('une personne retirée est oubliée ; une nouvelle session repart de zéro', async () => {
    const r = await startRoles(61);
    const p = r.ext.spawnEx('manifestant', 0, 0, { profile: 'pacifique' });
    expect(r.ext.traits(p.id)).not.toBeNull();
    r.ctx.people.remove(p.id);
    expect(r.ext.traits(p.id)).toBeNull();
    const q = r.ctx.archetypes.spawn('crs', 0, 0);
    await r.t.start({ extra: { cause: 'culture' } });
    expect(r.ext.traits(q.id)).toBeNull();
    expect(r.causes.list[r.ext.session.cause]!.id).toBe('culture');
  });
});
