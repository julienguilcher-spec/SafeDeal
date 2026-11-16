// Carte « Ma mission » de l'exécutant : ordre de groupe en mots simples, une seule consigne (incident / journée /
// rappel / ordre), radio filtrée par appartenance à l'unité, réseau propre aux secours et aux civils.
import { describe, expect, it } from 'vitest';
import type { RadioMessage } from '@/core/contracts';
import {
  chainLabel, chiefLabel, isExecutantRole, plainOrder, resolveInstruction, strayed, surname,
} from '@/gameplay/session/executant';
import {
  ExecutantRadioFilter, canonicalCallsign, classifyRadio, listenForRole, parseRadioHeader, radioBody,
} from '@/gameplay/radio/relevance';
import type { RadioScope } from '@/gameplay/radio/relevance';
import { arrowAngle, chiefText } from '@/ui/hud/mission';

const msg = (from: string, text: string, extra: Partial<RadioMessage> = {}): RadioMessage => ({ channel: 'commandement', from, text, priority: 1, ...extra });

const SCOPE: RadioScope = { group: 'Mistral 1 Alfa', section: 'Mistral 1', company: 'MISTRAL', people: new Set([11, 12, 13]), self: 10 };

describe('exécutant : qui reçoit les ordres', () => {
  it('le CRS, les équipiers d’engin, la BRAV-M et le télépilote ; pas le commandant, le commissaire ni le chef de groupe', () => {
    for (const r of ['crs', 'bravm', 'gendarme_centaure', 'operateur_canon_eau', 'telepilote']) expect(isExecutantRole(r)).toBe(true);
    for (const r of ['commandant', 'commissaire', 'chef_groupe', 'manifestant', 'journaliste', 'secouriste', 'street_medic']) expect(isExecutantRole(r)).toBe(false);
  });

  it('libellés : chef, unité', () => {
    expect(surname('Jean Martin')).toBe('Martin');
    expect(chiefLabel('brigadier_chef', 'Jean Martin')).toBe('Brigadier-chef Martin');
    expect(chiefLabel(null, '')).toBe('votre chef');
    expect(chainLabel({ group: 'MISTRAL 1 ALFA', section: 'MISTRAL 1', company: 'MISTRAL' })).toBe('Groupe MISTRAL 1 ALFA — Section MISTRAL 1 — Cie MISTRAL');
    expect(chainLabel({ group: 'NEPTUNE 1', unitKind: 'Équipage' })).toBe('Équipage NEPTUNE 1');
  });
});

describe('ordre de groupe → consigne en mots simples', () => {
  it('tenir la ligne : rester à sa place, bouclier levé ; le GPS vise la place dans la formation', () => {
    const p = plainOrder('ligne', { place: 'rue de Turbigo', poste: 'bouclier', hasPost: true });
    expect(p.title).toBe('Tenir la ligne, rue de Turbigo');
    expect(p.detail).toMatch(/bouclier levé/);
    expect(p.target).toBe('post');
    expect(p.radio).toMatch(/en ligne, rue de Turbigo/);
    // sans place réservée : on suit le chef
    expect(plainOrder('ligne', { place: '', poste: 'bouclier', hasPost: false }).target).toBe('chef');
    // porteur de lanceur : second rideau, tir sur ordre
    expect(plainOrder('tenir', { place: '', poste: 'lanceur', hasPost: true }).detail).toMatch(/second rideau.*sur ordre/);
  });

  it('colonne : suivre le groupe ; embarquement : le fourgon du groupe', () => {
    const c = plainOrder('colonne', { place: 'place de la République', poste: 'bouclier', hasPost: true });
    expect(c.title).toBe('Colonne vers place de la République');
    expect(c.detail).toMatch(/Suivez le groupe/);
    expect(c.target).toBe('chef');
    const e = plainOrder('embarquer', { place: '', poste: null, hasPost: false, vehicle: 'fourgon de CRS MISTRAL 1 ALFA' });
    expect(e.title).toBe('Embarquez dans le fourgon de CRS MISTRAL 1 ALFA');
    expect(e.target).toBe('vehicle');
  });

  it('ordres sans contenu pour l’exécutant : rester avec son groupe, pas de radio', () => {
    for (const t of ['libre', 'suivre', 'cesser', 'inconnu']) {
      const p = plainOrder(t, { place: 'x', poste: null, hasPost: false });
      expect(p.title).toBe('Restez avec votre groupe');
      expect(p.radio).toBe('');
    }
  });
});

describe('une seule consigne', () => {
  const order = { ...plainOrder('ligne', { place: 'rue de Turbigo', poste: 'bouclier', hasPost: true }), x: 1, z: 2 };
  const chief = { label: 'Brigadier Martin', x: 5, z: 5 };
  const journeeRoute = { title: 'En route vers quai de la Mégisserie', detail: 'Restez à bord.', travelling: true, x: 100, z: 100 };

  it('la tâche d’incident confiée au joueur passe avant tout', () => {
    const i = resolveInstruction({ incident: { label: 'Feu de poubelles, rue X', x: 9, z: 9 }, journee: journeeRoute, order, chief });
    expect(i.source).toBe('incident');
    expect(i.title).toMatch(/Feu de poubelles/);
  });

  it('pendant le trajet de la journée, le déplacement est LA consigne (pas d’ordre concurrent)', () => {
    const i = resolveInstruction({ journee: journeeRoute, order, chief, regroup: { chief: 'Brigadier Martin', x: 5, z: 5, distance: 80 } });
    expect(i.source).toBe('journee');
    expect(i.title).toBe('En route vers quai de la Mégisserie');
  });

  it('éloigné du groupe : « Rejoignez votre groupe », GPS sur le chef ; sinon l’ordre du groupe ; sinon suivre le chef', () => {
    const r = resolveInstruction({ order, chief, regroup: { chief: 'Brigadier Martin', x: 5, z: 5, distance: 52 } });
    expect(r.source).toBe('regroup');
    expect(r.title).toBe('Rejoignez votre groupe');
    expect(r.detail).toMatch(/52 m/);
    expect([r.x, r.z]).toEqual([5, 5]);
    const o = resolveInstruction({ order, chief });
    expect(o.source).toBe('ordre');
    expect(o.title).toBe('Tenir la ligne, rue de Turbigo');
    const a = resolveInstruction({ chief });
    expect(a.source).toBe('attente');
    expect(a.detail).toMatch(/Brigadier Martin/);
  });

  it('consigne sur place de la journée et objectif de mission passent avant l’ordre ; tâche de rôle avant l’attente', () => {
    expect(resolveInstruction({ journee: { ...journeeRoute, travelling: false, title: 'Sécurisez le périmètre' }, order }).source).toBe('journee');
    expect(resolveInstruction({ mission: { text: 'Tenir 5 minutes' }, order }).source).toBe('mission');
    expect(resolveInstruction({ task: { title: 'Couvrez la tête de cortège', detail: '', target: 'place' }, chief: null }).source).toBe('tache');
  });

  it('rappel avec hystérésis : au-delà de 40 m, et jusqu’au retour sous 20 m', () => {
    expect(strayed(35, false)).toBe(false);
    expect(strayed(45, false)).toBe(true);
    expect(strayed(30, true)).toBe(true);
    expect(strayed(15, true)).toBe(false);
  });
});

describe('radio : ce qui concerne l’exécutant', () => {
  it('indicatifs : forme écrite et forme dite se comparent', () => {
    expect(canonicalCallsign('Mistral 1 Alfa')).toBe('MISTRAL UN ALFA');
    expect(canonicalCallsign('MISTRAL UN ALPHA')).toBe('MISTRAL UN ALFA');
    expect(canonicalCallsign('ZÉPHYR 12')).toBe('ZEPHYR UN DEUX');
  });

  it('formules d’appel', () => {
    expect(parseRadioHeader('MISTRAL UN ALFA ICI MISTRAL UN. En ligne. PARLEZ.')).toMatchObject({ to: 'MISTRAL UN ALFA', from: 'MISTRAL UN', reply: false });
    expect(parseRadioHeader('ICI MISTRAL UN BRAVO. REÇU, en ligne. TERMINÉ.')).toMatchObject({ to: '', from: 'MISTRAL UN BRAVO', reply: true });
    expect(parseRadioHeader('À tous de CENTRAL : feu de poubelles, rue X.')).toMatchObject({ to: 'A TOUS', from: 'CENTRAL', loose: true });
    expect(radioBody('MISTRAL ICI CENTRAL. Feu signalé. PARLEZ.')).toBe('FEU SIGNALE');
  });

  it('mon groupe, ma section, la salle à tous : oui ; les autres unités et le commandement entre eux : non', () => {
    expect(classifyRadio(msg('MISTRAL 1', 'MISTRAL UN ALFA ICI MISTRAL UN. En ligne rue X. PARLEZ.'), SCOPE)).toBe('mine');
    expect(classifyRadio(msg('MISTRAL', 'MISTRAL UN ICI MISTRAL. Section en barrage. PARLEZ.'), SCOPE)).toBe('mine');
    expect(classifyRadio(msg('Mistral 1 Alfa', 'ICI MISTRAL UN ALFA. REÇU. TERMINÉ.', { channel: 'unite' }), SCOPE)).toBe('mine');
    expect(classifyRadio(msg('X', 'Groupe ! En ligne.', { personId: 12, channel: 'unite' }), SCOPE)).toBe('mine');
    expect(classifyRadio(msg('MISTRAL 1', 'MISTRAL UN ALFA, rendez-vous rue X.'), SCOPE)).toBe('mine');
    expect(classifyRadio(msg('CENTRAL', 'À tous de CENTRAL : feu de poubelles, rue X. Pompiers engagés.'), SCOPE)).toBe('general');
    expect(classifyRadio(msg('CENTRAL', 'MISTRAL de CENTRAL. Prise de service à la caserne.'), SCOPE)).toBe('general');
    expect(classifyRadio(msg('CENTRAL', 'ICI CENTRAL. Sapeurs-pompiers en route. TERMINÉ.'), SCOPE)).toBe('general');
    // autres unités
    expect(classifyRadio(msg('MISTRAL 2', 'MISTRAL DEUX BRAVO ICI MISTRAL DEUX. En ligne. PARLEZ.'), SCOPE)).toBe('other');
    expect(classifyRadio(msg('Mistral 1 Bravo', 'ICI MISTRAL UN BRAVO. REÇU. TERMINÉ.', { channel: 'unite' }), SCOPE)).toBe('other');
    expect(classifyRadio(msg('TRAMONTANE', 'TRAMONTANE de CENTRAL. Faites mouvement.'), SCOPE)).toBe('other');
    // compte rendu d'une section au commandant, ma section à la salle : trafic de commandement
    expect(classifyRadio(msg('MISTRAL 2', 'MISTRAL ICI MISTRAL DEUX. Barrage tenu. PARLEZ.'), SCOPE)).toBe('other');
    expect(classifyRadio(msg('MISTRAL', 'CENTRAL ICI MISTRAL. Dispositif en place. TERMINÉ.'), SCOPE)).toBe('other');
    // « Feu de poubelles, … » n'est pas une formule d'appel
    expect(classifyRadio(msg('SAPEUR 1', 'Feu de poubelles, rue X. On attaque.', { channel: 'secours' }), SCOPE)).toBe('other');
  });

  it('filtre : accusés de réception, redites et diffusions générales rapprochées masqués et comptés', () => {
    const f = new ExecutantRadioFilter();
    const order = msg('MISTRAL 1', 'MISTRAL UN ALFA ICI MISTRAL UN. En ligne rue X. PARLEZ.');
    expect(f.accept(order, SCOPE, 0)).toBe(true);
    // même ordre redit 10 s plus tard : une fois suffit
    expect(f.accept({ ...order }, SCOPE, 10)).toBe(false);
    // accusé de réception de mon groupe : l'ordre suffit
    expect(f.accept(msg('Mistral 1 Alfa', 'ICI MISTRAL UN ALFA. REÇU, en ligne. TERMINÉ.', { channel: 'unite' }), SCOPE, 11)).toBe(false);
    // trafic d'une autre unité
    expect(f.accept(msg('MISTRAL 2', 'MISTRAL DEUX BRAVO ICI MISTRAL DEUX. Repli. PARLEZ.'), SCOPE, 12)).toBe(false);
    // diffusions générales : une toutes les 20 s, sauf urgence
    expect(f.accept(msg('CENTRAL', 'À tous de CENTRAL : feu de poubelles, rue X.'), SCOPE, 13)).toBe(true);
    expect(f.accept(msg('CENTRAL', 'À tous de CENTRAL : feu de conteneur, rue Y.'), SCOPE, 20)).toBe(false);
    expect(f.accept(msg('CENTRAL', 'À tous de CENTRAL : agent à terre, rue Z.', { priority: 2 }), SCOPE, 21)).toBe(true);
    // mes propres paroles passent toujours
    expect(f.accept(msg('Mistral 1 Alfa', 'ICI MISTRAL UN ALFA. REÇU. TERMINÉ.', { personId: 10 }), SCOPE, 22)).toBe(true);
    expect(f.hiddenRecent(22)).toBe(4);
    expect(f.hiddenRecent(500)).toBe(0);
    expect(f.hiddenTotal).toBe(4);
  });
});

describe('radio des autres rôles : jamais la radio de police', () => {
  it('pompier ou SAMU : le réseau des secours ; presse et manifestants : pas de radio officielle', () => {
    const f = new ExecutantRadioFilter();
    const rescue = listenForRole('secouriste')!;
    expect(f.acceptChannel(msg('MISTRAL 1', 'MISTRAL UN ALFA ICI MISTRAL UN. En ligne. PARLEZ.'), rescue, 1, 0)).toBe(false);
    expect(f.acceptChannel(msg('CENTRAL', 'ICI CENTRAL. Sapeurs-pompiers en route vers rue X. TERMINÉ.', { channel: 'secours' }), rescue, 1, 1)).toBe(true);
    const medic = listenForRole('street_medic')!;
    expect(f.acceptChannel(msg('Secouriste de rue', 'Blessé à la tête, on le prend.', { channel: 'secours' }), medic, 1, 2)).toBe(true);
    expect(f.acceptChannel(msg('SAPEUR 1', 'CENTRAL ICI SAPEUR UN. Feu éteint. PARLEZ.', { channel: 'secours' }), medic, 1, 3)).toBe(false);
    const press = listenForRole('journaliste')!;
    expect(f.acceptChannel(msg('CENTRAL', 'À tous de CENTRAL : feu.', { channel: 'commandement' }), press, 1, 4)).toBe(false);
    expect(f.acceptChannel(msg('Rédaction', 'On a besoin d’images de la tête.', { channel: 'presse' }), press, 1, 5)).toBe(true);
    expect(listenForRole('manifestant')!.channels.has('commandement')).toBe(false);
    // les rôles de police n'ont pas de réseau par canal (écoute par unité)
    expect(listenForRole('crs')).toBeNull();
    expect(listenForRole('commandant')).toBeNull();
  });
});

describe('carte : libellés', () => {
  it('chef à suivre, ou à rejoindre', () => {
    const chief = { id: 3, label: 'Brigadier Martin', role: 'chef de groupe', x: 0, z: 0, distance: 12 };
    expect(chiefText({ chief, regroup: false })).toBe('Suivez votre chef de groupe : Brigadier Martin');
    expect(chiefText({ chief, regroup: true })).toBe('Rejoignez votre chef de groupe : Brigadier Martin');
    expect(chiefText({ chief: null, regroup: false })).toBe('');
  });

  it('flèche vers le chef : devant = 0°, à droite = +90°', () => {
    // regard vers +z (cap 0) : un point devant donne 0°
    expect(Math.round(arrowAngle(0, 0, 0, 0, 10))).toBe(0);
    // cap croissant = rotation vers la gauche (boussole : 180 − cap) ; le point en −x est donc à droite
    expect(Math.round(arrowAngle(0, 0, 0, -10, 0))).toBe(90);
    expect(Math.round(arrowAngle(0, 0, 0, 10, 0))).toBe(-90);
  });
});
