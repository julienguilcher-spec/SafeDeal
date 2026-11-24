// Carte « Ma mission » de l'exécutant : ordre de groupe en mots simples, une seule consigne (incident / journée /
// rappel / ordre), radio filtrée par appartenance à l'unité, réseau propre aux secours et aux civils.
import { describe, expect, it } from 'vitest';
import type { RadioMessage } from '@/core/contracts';
import {
  chainLabel, chiefLabel, custodyInstruction, isExecutantRole, patrolCustodyInstruction, plainOrder, resolveInstruction, strayed, surname,
} from '@/gameplay/session/executant';
import type { CustodyFacts } from '@/gameplay/session/executant';
import type { MissionBrief } from '@/gameplay/session/mission-api';
import { vanLabel } from '@/gameplay/transfer/labels';
import { readiness, emptySnapshot } from '@/ui/command/direct/tickets';
import { layoutOrderLabels, verbTag } from '@/ui/maps/overlay-units';
import { detaineesLine } from '@/ui/screens/debrief';
import { custodyLine } from '@/ui/command/fieldHud';
import {
  ExecutantRadioFilter, canonicalCallsign, classifyRadio, listenForRole, parseRadioHeader, radioBody,
} from '@/gameplay/radio/relevance';
import type { RadioScope } from '@/gameplay/radio/relevance';
import { arrowAngle, chiefText, orderHeadline } from '@/ui/hud/mission';

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
    // sur le réseau des secours, seuls les secours parlent : salle des pompiers, régulation, engins ; pas CENTRAL ni la police
    expect(f.acceptChannel(msg('PARIS', 'FOURGON SÉVIGNÉ de PARIS : départ pour feu de poubelles, 12 rue de Rivoli. Rendez compte.', { channel: 'secours' }), rescue, 1, 1)).toBe(true);
    expect(f.acceptChannel(msg('SMUR NECKER', 'SAMU 75 de SMUR NECKER : l’UMH est sur les lieux.', { channel: 'secours' }), rescue, 1, 1.5)).toBe(true);
    expect(f.acceptChannel(msg('MISTRAL 2 ALFA', 'URGENT. Demande sapeurs-pompiers, secteur rue X.', { channel: 'secours' }), rescue, 1, 1.6)).toBe(false);
    expect(f.acceptChannel(msg('CENTRAL', 'ICI CENTRAL. Sapeurs-pompiers en route vers rue X. Préparez l’accès. TERMINÉ.', { channel: 'secours' }), rescue, 1, 1.7)).toBe(false);
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

// ───────────────────────────── interpellés (plan ordres-directs §5.2, §5.3, §5.6, §5.7, §4.1.6) ─────────────────────────────

const NB = '\u00a0';
const facts = (kind: string, extra: Partial<CustodyFacts> = {}): CustodyFacts => ({
  way: { kind, name: kind === 'confier' ? 'MISTRAL 2 ALFA' : kind === 'remettre' ? 'Fourgon de CRS' : 'CELLULAIRE 1', guidance: '', x: 10, z: 20, distance: 15 },
  coming: null, drop: null, key: 'E', ...extra,
});

describe('carte « Ma mission » : son interpellé d’abord', () => {
  it('la consigne « interpellé » passe avant la tâche d’incident, la journée, le rappel et l’ordre du groupe', () => {
    const custody = custodyInstruction(facts('confier', { way: { ...facts('confier').way!, guidance: `Interpellé. E${NB}: le confier à MISTRAL 2 ALFA (15${NB}m)` } }))!;
    const i = resolveInstruction({
      custody, incident: { label: 'Feu de poubelle', x: 5, z: 5 }, journee: { title: 'En route', detail: '', travelling: true },
      regroup: { chief: 'Brigadier Martin', x: 0, z: 0, distance: 80 }, order: { ...plainOrder('ligne', { place: '', poste: null, hasPost: false }) },
    });
    expect(i.source).toBe('custody');
    expect(i.lead).toBe(true);
    expect(i.title).toBe('Confiez l’interpellé à MISTRAL 2 ALFA');
    expect(i.detail).toBe(`E${NB}: le confier à MISTRAL 2 ALFA (15${NB}m) — il l’emmène au fourgon, vous avez les mains libres.`);
    // sans interpellé, rien ne change
    expect(resolveInstruction({ custody: null, incident: { label: 'Feu', x: 1, z: 1 } }).source).toBe('incident');
  });

  it('une consigne par issue, la même que la 4e invite ; repère sur le fourgon ; jamais « CELLULAIRE » seul', () => {
    expect(custodyInstruction({ ...facts('remettre_fourgon'), way: { ...facts('remettre_fourgon').way!, guidance: `Interpellé. E${NB}: le remettre au fourgon cellulaire 1 (8${NB}m)` } }))
      .toEqual({ title: 'Remettez l’interpellé au fourgon cellulaire 1', detail: `E${NB}: le remettre au fourgon cellulaire 1 (8${NB}m).`, target: 'vehicle', x: 10, z: 20 });
    expect(custodyInstruction(facts('remettre'))!.title).toBe('Remettez l’interpellé au fourgon de CRS');
    expect(custodyInstruction(facts('faire_venir'))).toMatchObject({ title: 'Faites venir le fourgon cellulaire 1', target: 'vehicle', x: 10, z: 20 });
    // l'emmener : au fourgon cellulaire le plus proche (repère dessus) — la carte écrit la distance à côté
    const drop = { name: 'CELLULAIRE 2', cellular: true, x: 140, z: 0 };
    expect(custodyInstruction(facts('emmener', { drop }))).toMatchObject({ title: 'Emmenez l’interpellé au fourgon cellulaire 2', target: 'vehicle', x: 140, z: 0 });
    expect(custodyInstruction(facts('emmener', { drop: { ...drop, name: 'Voiture de police', cellular: false } }))!.title).toBe('Emmenez l’interpellé à la voiture de police');
    // le fourgon appelé vient : le repère le suit
    expect(custodyInstruction(facts('emmener', { coming: { name: 'CELLULAIRE 1', x: 60, z: 7 } }))).toMatchObject({ title: 'Le fourgon cellulaire 1 vient vous chercher', x: 60, z: 7 });
    expect(custodyInstruction(facts('emmener'))).toMatchObject({ title: 'Emmenez l’interpellé', target: 'none' });
    expect(custodyInstruction({ ...facts('confier'), way: null })).toBeNull();
    for (const k of ['remettre_fourgon', 'faire_venir', 'emmener']) {
      const c = custodyInstruction(facts(k, { drop }))!;
      expect(c.title + c.detail).not.toMatch(/CELLULAIRE/);
    }
  });

  it('en tête de carte : « VOTRE INTERPELLÉ », la consigne et sa distance, pas l’ordre d’en haut', () => {
    const ins = resolveInstruction({ custody: custodyInstruction(facts('emmener', { drop: { name: 'CELLULAIRE 1', cellular: true, x: 0, z: 140 } })) });
    const b = {
      instruction: ins, chief: null, status: '', regroup: false,
      command: { from: 'MISTRAL', by: 'Commandant Carlier', text: 'Tenir la ligne', to: 'Cie MISTRAL', place: 'rue de Rivoli', x: 0, z: -300, at: 0, distance: 300 },
    } as Pick<MissionBrief, 'command' | 'instruction' | 'chief' | 'status' | 'regroup'>;
    const h = orderHeadline(b, false, { x: 0, z: 0 });
    expect(h.head).toBe('VOTRE INTERPELLÉ');
    expect(h.order).toBe('Emmenez l’interpellé au fourgon cellulaire 1');
    expect(h.distance).toBe(`140${NB}m`);
    expect(orderHeadline(b, true, { x: 0, z: 0 }).line1).toBe(`Emmenez l’interpellé au fourgon cellulaire 1 · 140${NB}m`);
    // sans interpellé : l'ordre d'en haut reprend la tête
    const back = orderHeadline({ ...b, instruction: resolveInstruction({ chief: { label: 'Brigadier Martin', x: 0, z: 0 } }) }, false, { x: 0, z: 0 });
    expect(back.head).toBe('ORDRE DU COMMANDANT');
  });

  it('chef de la BRAV-M : « Montez sur votre moto (E) — la BRAV-M part avec vous » passe avant l’ordre de mouvement', () => {
    const ins = resolveInstruction({
      journee: { title: 'Montez sur votre moto (E) — la BRAV-M part avec vous', detail: 'x', travelling: false, x: 4, z: 5, target: 'vehicle', lead: true },
      regroup: { chief: 'Commandant Carlier', x: 0, z: 0, distance: 90 },
    });
    expect(ins).toMatchObject({ source: 'journee', title: 'Montez sur votre moto (E) — la BRAV-M part avec vous', lead: true, x: 4, z: 5 });
  });

  it('patrouille : « Conduisez l’interpellé au commissariat du 3e » (repère sur la porte) ; fourgon demandé', () => {
    const station = { at: 'au commissariat du 3e', x: 100, z: 200 };
    expect(patrolCustodyInstruction({ inCar: 1, station, request: null })).toMatchObject({ title: 'Conduisez l’interpellé au commissariat du 3e', target: 'place', x: 100, z: 200 });
    expect(patrolCustodyInstruction({ inCar: 2, station, request: null })!.title).toBe('Conduisez les interpellés au commissariat du 3e');
    const req = { text: `Fourgon cellulaire demandé — 3${NB}min${NB}10${NB}; ou ramenez-le à la voiture (540${NB}m)`, x: 9, z: 8 };
    expect(patrolCustodyInstruction({ inCar: 0, station: null, request: req }))
      .toEqual({ title: 'Fourgon cellulaire demandé', detail: `Arrivée dans 3${NB}min${NB}10${NB}; ou ramenez-le à la voiture (540${NB}m).`, target: 'vehicle', x: 9, z: 8 });
    expect(patrolCustodyInstruction({ inCar: 0, station, request: null })).toBeNull();
  });
});

describe('fourgons cellulaires : étiquettes, cartes, compte rendu', () => {
  const view = { name: 'CELLULAIRE 1', stage: 'sur_place' as const, detainees: 3, seats: 8, eta: 0, station: '' };
  it('étiquette : présentation, charge, plein, en route', () => {
    expect(vanLabel(view, true)).toBe('Fourgon cellulaire 1 — pour les interpellés');
    expect(vanLabel(view, false)).toBe('CELLULAIRE 1 · 3/8');
    expect(vanLabel({ ...view, detainees: 8 }, false)).toBe('CELLULAIRE 1 · COMPLET — part au commissariat');
    expect(vanLabel({ ...view, stage: 'aller', station: 'commissariat du 3e' }, false)).toBe('CELLULAIRE 1 · vers le commissariat du 3e');
    expect(vanLabel({ ...view, stage: 'aller', station: 'préfecture de police' }, false)).toBe('CELLULAIRE 1 · vers la préfecture de police');
    expect(vanLabel({ ...view, stage: 'releve', eta: 75 }, false)).toBe(`CELLULAIRE 1 · arrive — 1${NB}min${NB}20`);
  });

  it('compte rendu : combien au commissariat, combien dans le fourgon (comptes du dossier)', () => {
    const r = (status: string, station = '', vehicleName = '') => ({ status, station, vehicleName }) as never;
    expect(detaineesLine([])).toBe('');
    expect(detaineesLine([...Array(8)].map(() => r('depose', 'commissariat du 3e')).concat([r('remis_vehicule', '', 'CELLULAIRE 2')])))
      .toBe('9 — 8 déposés au commissariat du 3e, 1 dans le fourgon cellulaire 2');
    expect(detaineesLine([r('depose', 'préfecture de police'), r('remis_vehicule', '', 'Fourgon de CRS'), r('relache'), r('en_cours')]))
      .toBe('4 — 1 déposé à la préfecture de police, 1 dans le fourgon de CRS, 1 en cours d’interpellation, 1 relâché');
  });

  it('étiquettes d’ordre de la carte : le verbe du ticket (ce que le joueur a ordonné), pas l’ordre interne', () => {
    expect(verbTag('bloquer')).toBe('BARRE');
    expect(verbTag('bloquer', true)).toBe('BARRENT');
    expect(verbTag('rien')).toBe('');
    const base = { code: '1A', targetId: 0, x: 100, y: 100, arrived: false, dist: 120, eta: 60, color: '#fff' };
    // l'unité roule encore en colonne (ordre interne « colonne ») pour barrer une rue : la carte dit « BARRE »
    const placed = layoutOrderLabels([{ ...base, type: 'colonne', verb: 'bloquer' }], (t) => t.length * 6);
    expect(placed[0]!.text).toMatch(/^1A · BARRE · /);
    expect(layoutOrderLabels([{ ...base, type: 'colonne' }], (t) => t.length * 6)[0]!.text).toMatch(/^1A · VA À PIED · /);
  });

  it('bloc du commandant : « Interpellés 5 · CELLULAIRE 1 3/8 · 2 au commissariat », dès la première interpellation', () => {
    const st = (n: number, status: string) => [...Array(n)].map(() => ({ status }));
    const vansNow = [
      { name: 'CELLULAIRE 1', stage: 'aller', detainees: 8, seats: 8 },
      { name: 'CELLULAIRE 2', stage: 'sur_place', detainees: 3, seats: 8 },
    ];
    expect(custodyLine([], vansNow)).toBe('');
    expect(custodyLine([...st(2, 'depose'), ...st(3, 'remis_vehicule')], vansNow)).toBe('Interpellés 5 · CELLULAIRE 2 3/8 · 2 au commissariat');
    expect(custodyLine(st(1, 'en_cours'), [])).toBe('Interpellés 1 · 0 au commissariat');
  });

  it('BRAV-M en selle : « descend des motos », pas « des fourgons »', () => {
    const s = { ...emptySnapshot(), agents: 12, seated: 6, seatedPerVehicle: [1, 1, 1, 1, 1, 1], seatedOnMotos: 6 };
    expect(readiness(s)!.reason).toBe('descend des motos');
    expect(readiness({ ...s, seatedOnMotos: 0 })!.reason).toBe('descend des fourgons');
  });
});
