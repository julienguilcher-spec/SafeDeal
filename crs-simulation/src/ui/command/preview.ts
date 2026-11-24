/* =====================================================================================
 * Carte de commandement — APERÇU d'une ligne avant l'ordre (logique pure, sans dessin).
 *
 *   previewOf(ligne, qui, lieu, env)   la géométrie que la carte dessine (tacticalPreview.drawCard) : la rue barrée
 *                                      (rouge, rouge-vert pour « passants admis »), les flèches de chaque unité de Qui
 *                                      (« à pied · 2 min », « en véhicules · 6 min »), la ligne automatique, chaque
 *                                      unité → sa rue pour la nasse, le cercle, le nuage de gaz et le vent, le point
 *                                      des secours, le trajet d'un renfort de commissariat, les étapes légales ①②③ ;
 *   sentenceOf(ligne, qui, lieu)       la phrase « Ce qui va se passer : … » et la règle du verbe (en orange).
 * ===================================================================================== */

import { exitOpen, pickFilterExit } from '../maps/barrages';
import { autoLine } from './autoLine';
import { travel } from './bestUnit';
import type { CardCrowd, CardEnv, CardLine, CardPreview, CardUnit, Repere, WhoCandidate } from './cardTypes';
import { minutesText } from './intents';
import { assignExits } from './nasse';
import { BARRAGE_LET_PASSERSBY, plainOf, pointHeading, withArticle } from './orders';
import { capFirst } from './reperes';

export type { CardPreview } from './cardTypes';

/** Début de la phrase de la fiche (sentenceOf la donne entière). */
export const SENTENCE_PREFIX = 'Ce qui va se passer\u00a0: ';
/** Rayon (m) de l'encerclement en cercle serré (toucher simple, comme la carte d'aujourd'hui). */
export const CIRCLE_RADIUS = 18;
/** Rayon (m) du nuage de gaz dessiné. */
export const GAS_RADIUS = 14;

// ───────────────────────────── mots ─────────────────────────────

/** Sujet d'une phrase d'après le libellé de Qui : « Section MISTRAL 2 » → « la section MISTRAL 2 ». */
export function subjectOf(label: string): { text: string; plural: boolean } {
  const l = label.trim();
  const rules: readonly [RegExp, string, boolean][] = [
    [/^Sections\s/, 'les sections ', true],
    [/^Section\s/, 'la section ', false],
    [/^Groupe\s/, 'le groupe ', false],
    [/^Binôme\s/, 'le binôme ', false],
    [/^BRAV-M\s/, 'la BRAV-M ', false],
    [/^Blindé\s/, 'le blindé ', false],
    [/^Canon à eau\s/, 'le canon à eau ', false],
    [/^Patrouille\s/, 'la patrouille ', false],
    [/^Engin\s/, 'l’engin ', false],
    [/^Compagnie\s/, 'la compagnie ', false],
    [/^Drone\s/, 'le drone ', false],
  ];
  for (const [re, art, plural] of rules) if (re.test(l)) return { text: art + l.replace(re, ''), plural };
  if (/^(Toute la|Tout le)\s/.test(l)) return { text: l.charAt(0).toLocaleLowerCase('fr-FR') + l.slice(1), plural: false };
  const n = /^(\d+)\s+unités?\b(.*)$/.exec(l);
  if (n) return { text: `les ${n[1]} unités${n[2]!.replace(/\s—.*$/, '')}`, plural: Number(n[1]) > 1 };
  return { text: l, plural: false };
}

/** Lieu dans une phrase : « la rue de Rivoli », « la foule », « ce point, près de la rue Saint-Honoré ». */
export function placePhrase(where: Repere): string {
  switch (where.kind) {
    case 'rue':
      return withArticle(where.name.charAt(0).toLocaleLowerCase('fr-FR') + where.name.slice(1));
    case 'foule':
    case 'nasse':
      return 'la foule';
    case 'point': {
      const m = /^Ici\u00a0?:\s*(.*)$/.exec(where.name);
      return m && m[1] !== '' ? `ce point, ${m[1]}` : 'ce point';
    }
    case 'incident':
      return 'l’incident';
    default:
      return where.name.split(' — ')[0]!;
  }
}

/** « de la rue », « du boulevard », « de l’avenue ». */
function deOf(p: string): string {
  if (p.startsWith('le ')) return 'du ' + p.slice(3);
  if (p.startsWith('les ')) return 'des ' + p.slice(4);
  return 'de ' + p;
}

/** « jusqu’à la rue », « jusqu’au boulevard », « jusqu’à ce point ». */
function untilOf(p: string): string {
  if (p.startsWith('le ')) return 'jusqu’au ' + p.slice(3);
  if (p.startsWith('les ')) return 'jusqu’aux ' + p.slice(4);
  return 'jusqu’à ' + p;
}

function modeText(who: WhoCandidate): string {
  return `${who.mode === 'vehicules' ? 'en véhicules' : 'à pied'} (~${minutesText(who.eta)})`;
}

/** Deux formes (singulier, pluriel) d'un verbe conjugué. */
type Forms = readonly [string, string];

/** Ce que fait Qui pour chaque ordre ; {lieu} : le lieu, {de} : « de la rue… », {jusque} : « jusqu’à la rue… ». */
const ACTIONS: Readonly<Record<string, Forms>> = {
  couper_circulation: ['barre {lieu} d’une façade à l’autre. Personne ne passe.', 'barrent {lieu} d’une façade à l’autre. Personne ne passe.'],
  filtrer: ['filtre {lieu}\u00a0: les gens sortent un par un.', 'filtrent {lieu}\u00a0: les gens sortent un par un.'],
  ligne: ['tient une ligne en travers {de}, boucliers levés.', 'tiennent une ligne en travers {de}, boucliers levés.'],
  avancer: ['avance en formation {jusque}, boucliers levés.', 'avancent en formation {jusque}, boucliers levés.'],
  repli: ['se replie {jusque}, face à la foule.', 'se replient {jusque}, face à la foule.'],
  refoulement: ['repousse la foule par bonds de 50\u00a0m, en lui laissant une sortie devant elle.', 'repoussent la foule par bonds de 50\u00a0m, en lui laissant une sortie devant elle.'],
  charge: ['charge {jusque}, puis s’arrête au sifflet.', 'chargent {jusque}, puis s’arrêtent au sifflet.'],
  bond_offensif: ['fait un bond en avant de 20 à 40\u00a0m vers {lieu}, sans chercher le contact.', 'font un bond en avant de 20 à 40\u00a0m vers {lieu}, sans chercher le contact.'],
  disperser_gaz: ['lance le gaz lacrymogène sur {lieu}\u00a0; le nuage suit le vent.', 'lancent le gaz lacrymogène sur {lieu}\u00a0; le nuage suit le vent.'],
  encercler: ['encercle {lieu} en cercle serré\u00a0; une sortie reste ouverte à l’opposé.', 'encerclent {lieu} en cercle serré\u00a0; une sortie reste ouverte à l’opposé.'],
  // l'auteur peut fuir pendant l'approche (il court plus vite qu'un policier équipé) : l'unité y renonce et le dit
  interpeller: ['interpelle l’auteur des faits constatés près {de}\u00a0; s’il prend la fuite, l’interpellation est abandonnée et l’unité rend compte.',
    'interpellent l’auteur des faits constatés près {de}\u00a0; s’il prend la fuite, l’interpellation est abandonnée et les unités rendent compte.'],
  degager_barricade: ['dégage la barricade.', 'dégagent la barricade.'],
  degager_obstacle: ['pousse le véhicule hors de la chaussée.', 'poussent le véhicule hors de la chaussée.'],
  proteger: ['se place pour couvrir {lieu}.', 'se placent pour couvrir {lieu}.'],
  escorter: ['accompagne {lieu} pendant son trajet.', 'accompagnent {lieu} pendant son trajet.'],
  suivre: ['marche derrière {lieu}.', 'marchent derrière {lieu}.'],
  tenir: ['tient sa position, face à la menace.', 'tiennent leur position, face à la menace.'],
  tortue: ['se met en tortue\u00a0: boucliers devant et au-dessus, aucun tir possible.', 'se mettent en tortue\u00a0: boucliers devant et au-dessus, aucun tir possible.'],
  embarquer: ['remonte dans ses véhicules.', 'remontent dans leurs véhicules.'],
  debarquer: ['descend de ses véhicules.', 'descendent de leurs véhicules.'],
  cesser: ['s’arrête et attend.', 's’arrêtent et attendent.'],
  libre: ['n’a plus d’ordre et agit à son initiative.', 'n’ont plus d’ordre et agissent à leur initiative.'],
  retour_poste: ['rentre au commissariat, sans deux-tons.', 'rentrent au commissariat, sans deux-tons.'],
  suivre_pied: ['vous suit à pied.', 'vous suivent à pied.'],
  avec_moi: ['remonte et suit votre véhicule.', 'remontent et suivent votre véhicule.'],
};

/** Ordres qui sont eux-mêmes un déplacement (la phrase dit le mode et le délai). */
const MOVES: ReadonlySet<string> = new Set(['colonne', 'faire_mouvement']);
/** Ordres sur place (aucun trajet à dire). */
const IMMEDIATE: ReadonlySet<string> = new Set(['tenir', 'tortue', 'embarquer', 'debarquer', 'cesser', 'libre', 'retour_poste', 'suivre_pied', 'avec_moi']);
/** En deçà de cette distance (m), le trajet n'est pas dit. */
const NEAR = 30;

function fill(t: string, where: Repere): string {
  const p = placePhrase(where);
  return t.replace('{lieu}', p).replace('{de}', deOf(p)).replace('{jusque}', untilOf(p));
}

/**
 * « Interpeller » sans fait constaté près du point (LineAction.noFact) — « Aller constater » : l'unité (BRAV-M ou troupe,
 * ops.ts startTask) se porte près du point, observe, et n'interpelle qu'au premier fait constaté.
 */
const NO_FACT: Forms = ['va constater près {de}\u00a0; sans fait constaté, personne n’est interpellé.', 'vont constater près {de}\u00a0; sans fait constaté, personne n’est interpellé.'];

/**
 * Colonne dont le joueur à pied fait partie (T, toute la compagnie) : elle ne démarre qu'avec lui à bord — la phrase
 * annonçait « part en véhicules (~1 min) » et la colonne restait embarquée jusqu'à 5 min à l'attendre.
 */
function waitText(who: WhoCandidate | null, type: string): string {
  if (!who || who.waitsForYou !== true || who.mode !== 'vehicules' || IMMEDIATE.has(type)) return '';
  return ' La colonne vous attend pour partir\u00a0: montez à bord (elle part sans vous au bout de 5\u00a0min).';
}

/**
 * Ordres dont une voiture de patrouille fait un trajet en urgence, et ceux où elle s'arrête sur place (gameplay/patrols :
 * MOVE_ORDERS, HOLD_ORDERS) : ni ligne, ni formation, ni boucliers pour trois policiers en voiture.
 */
const PATROL_DRIVES: ReadonlySet<string> = new Set([
  'avancer', 'colonne', 'faire_mouvement', 'repli', 'bond_offensif', 'charge', 'refoulement', 'ligne', 'couper_circulation', 'filtrer',
]);
const PATROL_HOLDS: ReadonlySet<string> = new Set(['tenir', 'cesser', 'tortue']);

function verbSentence(type: string, targetId: number, who: WhoCandidate | null, where: Repere, noFact = false): string {
  if (type === 'degager_obstacle' && (!who || who.squadIds.length === 0)) {
    return 'Le blindé Centaure libre le plus proche pousse le véhicule hors de la chaussée.';
  }
  const s = who ? subjectOf(who.label) : { text: 'l’unité', plural: false };
  const i = s.plural ? 1 : 0;
  const p = placePhrase(where);
  if (who && /^Patrouille\s/.test(who.label)) {
    if (PATROL_DRIVES.has(type)) {
      return capFirst(`${s.text} s’y rend en voiture, deux-tons, vers ${p} (~${minutesText(who.eta)}), et s’arrête juste avant.`);
    }
    if (PATROL_HOLDS.has(type)) return capFirst(`${s.text} s’arrête et reste sur place, à bord de sa voiture.`);
  }
  if (type === 'colonne') {
    return capFirst(`${s.text} ${s.plural ? 'partent' : 'part'} ${who ? modeText(who) : 'à pied'}, en file, vers ${p}.`) + waitText(who, type);
  }
  if (type === 'faire_mouvement') {
    const eta = who ? ` (~${minutesText(who.eta)})` : '';
    return capFirst(`${s.text} ${s.plural ? 'embarquent et partent' : 'embarque et part'} en véhicules, deux-tons, vers ${p}${eta}, puis ${s.plural ? 'débarquent' : 'débarque'}.`) + waitText(who, type);
  }
  let action = type === 'interpeller' && noFact ? NO_FACT[i] : ACTIONS[type]?.[i];
  if (type === 'couper_circulation' && targetId === BARRAGE_LET_PASSERSBY) {
    action = s.plural ? 'barrent {lieu}\u00a0: les manifestants ne passent pas, les passants oui.' : 'barre {lieu}\u00a0: les manifestants ne passent pas, les passants oui.';
  }
  if (!action) {
    const w = plainOf(type as never);
    action = w ? `${w.doing}.` : 'exécute l’ordre.';
  }
  const move = who && !IMMEDIATE.has(type) && !MOVES.has(type) && who.distance > NEAR
    ? `${s.plural ? 'partent' : 'part'} ${modeText(who)} et `
    : '';
  return capFirst(`${s.text} ${move}${fill(action, where)}`) + waitText(who, type);
}

/**
 * Phrase « Ce qui va se passer : … » (préfixe compris) et règle du verbe ('' si aucune). La phrase dit qui, quoi, où,
 * comment (à pied, en véhicules) et en combien de temps.
 */
export function sentenceOf(line: CardLine, who: WhoCandidate | null, where: Repere): { what: string; rule: string } {
  const a = line.action;
  const subj = who && who.squadIds.length > 0 ? subjectOf(who.label) : null;
  const p = placePhrase(where);
  let what: string;
  switch (a.kind) {
    case 'verb':
      what = verbSentence(String(a.type), a.targetId ?? 0, who, where, a.noFact === true);
      break;
    case 'nasse': {
      // pas assez d'unités pour toutes les rues (Qui le dit : « — 4 rues resteront ouvertes ») : la nasse ne se ferme
      // pas, la phrase ne le promet pas
      const open = who ? /(\d+) rues? rest/.exec(who.label) : null;
      const end = open
        ? `\u00a0; ${open[1]} rue${Number(open[1]) > 1 ? 's restent ouvertes' : ' reste ouverte'} faute d’unités\u00a0: la nasse ne sera pas fermée.`
        : '\u00a0: la nasse se ferme.';
      what = who && who.squadIds.length > 1
        ? capFirst(`${subjectOf(who.label).text} tiennent chacune une rue autour de la foule${end}`)
        : `Chaque rue autour de la foule est tenue par une unité${end}`;
      break;
    }
    case 'filteredExit':
      what = 'L’unité qui tient la plus large sortie la passe en barrage filtrant\u00a0: les gens sortent un par un.';
      break;
    case 'closeRoad':
      what = `Des barrières ferment ${p} aux voitures\u00a0; les piétons passent.${subj ? ` ${capFirst(subj.text)} ${subj.plural ? 'tiennent' : 'tient'} la fermeture.` : ''}`;
      break;
    case 'closeArea':
      what = `Toutes les rues à ${a.radius}\u00a0m autour sont fermées aux voitures par des barrières.`;
      break;
    case 'rescue':
      what = a.service === 'pompiers'
        ? `Les pompiers sont appelés ${a.incidentId !== 0 ? 'sur l’incident' : `sur ${p}`}\u00a0: ils viennent éteindre ou secourir.`
        : `Le SAMU est appelé ${a.incidentId !== 0 ? 'sur l’incident' : `sur ${p}`}\u00a0: il vient soigner et évacuer.`;
      break;
    case 'means':
    case 'assignOther':
      what = subj && who
        ? capFirst(`${subj.text} ${subj.plural ? 'prennent' : 'prend'} l’incident en charge et s’y ${subj.plural ? 'rendent' : 'rend'} ${modeText(who)}.`)
        : 'Choisissez l’unité qui prendra l’incident en charge.';
      break;
    case 'unassign':
      what = 'Plus personne n’est chargé de l’incident.';
      break;
    case 'cancelCall':
      what = 'Les secours appelés font demi-tour.';
      break;
    case 'metro':
      what = a.op === 'close' ? 'La station est fermée\u00a0: les voyageurs arrivent par les stations voisines.'
        : a.op === 'open' ? 'La station rouvre\u00a0: les voyageurs arrivent de nouveau par elle.'
          : a.op === 'filter' ? (subj ? capFirst(`${subj.text} ${subj.plural ? 'contrôlent' : 'contrôle'} la sortie de la station\u00a0: les arrivées ralentissent.`) : 'Choisissez l’unité qui filtrera la sortie.')
            : 'L’unité quitte la sortie de la station.';
      break;
    case 'reopen':
      what = 'Les barrières sont levées\u00a0: les voitures circulent de nouveau.';
      break;
    case 'reopenAll':
      what = 'Toutes les rues fermées sont rouvertes à la circulation.';
      break;
    case 'centre':
      what = 'La carte se centre ici.';
      break;
    case 'transfer':
      what = 'Le fourgon cellulaire part au commissariat avec ses interpellés\u00a0; un autre fourgon prend la remise.';
      break;
    case 'liaison':
      what = 'L’équipe de liaison rejoint les organisateurs et négocie le parcours avec eux ; aucune unité ne bouge.';
      break;
    case 'proposal':
      what = a.accept ? 'L’ordre proposé par l’adjoint part en votre nom.' : 'La proposition est écartée.';
      break;
    case 'sommation':
      what = a.all ? 'Les sommations sont faites l’une après l’autre, au mégaphone (~1\u00a0min\u00a030).' : 'Une seule annonce est faite au mégaphone.';
      break;
    default:
      what = line.explain;
  }
  return { what: SENTENCE_PREFIX + what, rule: line.rule };
}

// ───────────────────────────── aperçu ─────────────────────────────

function emptyPreview(): CardPreview {
  return {
    kind: 'none', x: 0, z: 0, heading: 0, width: 0, radius: 0, label: '', passersby: false, filter: false, arrows: [], segments: [],
    wind: null, steps: [], service: '',
  };
}

function unitById(env: CardEnv, id: number): CardUnit | undefined {
  return env.units.find((u) => u.squadId === id);
}

function whoUnits(env: CardEnv, who: WhoCandidate | null): CardUnit[] {
  if (!who) return [];
  return who.squadIds.map((id) => unitById(env, id)).filter((u): u is CardUnit => u !== undefined);
}

/** Flèches des unités de Qui vers le point, avec le mode et le délai (« à pied · 2 min »). */
function arrowsTo(env: CardEnv, who: WhoCandidate | null, x: number, z: number): CardPreview['arrows'] {
  const out: CardPreview['arrows'] = [];
  const units = whoUnits(env, who);
  const stationFrom = who && who.fromStation !== undefined ? stationOf(env, who.fromStation) : null;
  if (stationFrom) {
    out.push({ squadId: 0, fromX: stationFrom.x, fromZ: stationFrom.z, toX: x, toZ: z, text: `deux-tons · ${minutesText(who!.eta)}`, vehicles: true });
    return out;
  }
  for (const u of units) {
    const t = travel(u, x, z);
    const vehicles = t.mode === 'vehicules';
    out.push({ squadId: u.squadId, fromX: u.x, fromZ: u.z, toX: x, toZ: z, text: `${vehicles ? 'en véhicules' : 'à pied'} · ${minutesText(t.eta)}`, vehicles });
  }
  return out;
}

function stationOf(env: CardEnv, entryId: number): { x: number; z: number } | null {
  for (const s of env.stations) if (s.entries.some((e) => e.entryId === entryId)) return { x: s.x, z: s.z };
  return null;
}

function crowdNear(env: CardEnv, where: Repere, max: number): CardCrowd | null {
  if (where.crowdKey !== undefined) {
    const c = env.crowds.find((q) => q.key === where.crowdKey);
    if (c) return c;
  }
  let best: CardCrowd | null = null;
  let bd = max;
  for (const c of env.crowds) {
    const d = Math.hypot(c.x - where.x, c.z - where.z);
    if (c.people > 0 && d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}

/** Point et géométrie de la rue visée (issue de foule, sinon voie nommée la plus proche, sinon le point). */
export function streetAt(where: Repere, env: CardEnv): { x: number; z: number; heading: number; width: number; name: string } {
  if (where.kind === 'rue' && where.crowdKey !== undefined) {
    const c = env.crowds.find((q) => q.key === where.crowdKey);
    const e = c?.exits.find((q) => (where.roadEdge !== undefined && where.roadEdge >= 0 ? q.edgeId === where.roadEdge : Math.hypot(q.x - where.x, q.z - where.z) < 5));
    if (e) return { x: e.x, z: e.z, heading: e.heading, width: e.width, name: where.name };
  }
  const r = env.roadAt(where.x, where.z, 40);
  if (r) return { x: r.x, z: r.z, heading: r.heading, width: r.width, name: capFirst(r.name) };
  return { x: where.x, z: where.z, heading: 0, width: 0, name: where.name };
}

/** Ligne automatique de la ligne `ligne` (autoLine) pour Qui au lieu (rue, point, ou face à une foule). */
export function autoLineFor(where: Repere, env: CardEnv, units: readonly CardUnit[]): ReturnType<typeof autoLine> {
  const crowd = crowdNear(env, where, 250);
  let agents = 0, fx = 0, fz = 0;
  for (const u of units) {
    agents += u.valid;
    fx += u.x;
    fz += u.z;
  }
  const from = units.length > 0 ? { x: fx / units.length, z: fz / units.length } : null;
  const contain = where.kind === 'foule' || where.kind === 'nasse';
  const road = where.kind === 'rue' ? streetAt(where, env) : null;
  return autoLine({
    x: where.x, z: where.z, road: road && road.width > 0 ? road : null, crowd: crowd ? { x: crowd.x, z: crowd.z, radius: Math.min(crowd.radius, 60) } : null,
    agents, from, contain,
  });
}

/** Étapes légales ①②③ dessinées près de la foule pour une ligne 🔒. */
function legalMarks(line: CardLine): string[] {
  const lock = line.lock;
  if (!lock) return [];
  const out: string[] = [];
  const n = ['①', '②', '③'];
  if (lock.sommations > 0) out.push(`${n[out.length]} sommations`);
  out.push(`${n[out.length]} ${lock.text.split(' + ').pop() ?? 'autoriser'}`);
  out.push(`${n[out.length]} ${line.label.toLocaleLowerCase('fr-FR')}`);
  return out;
}

/**
 * Ce que la carte dessine pour la ligne surlignée : genre d'aperçu, point, cap, largeur, rayon, texte, flèches de
 * Qui, segments de la nasse, vent, étapes légales.
 */
export function previewOf(line: CardLine, who: WhoCandidate | null, where: Repere, env: CardEnv): CardPreview {
  const p = emptyPreview();
  p.x = where.x;
  p.z = where.z;
  p.steps = legalMarks(line);
  const a = line.action;
  switch (a.kind) {
    case 'verb': {
      const type = String(a.type);
      if (a.geom === 'street') {
        const st = streetAt(where, env);
        p.kind = 'street';
        p.x = st.x;
        p.z = st.z;
        p.heading = st.heading;
        p.width = st.width;
        p.passersby = type === 'couper_circulation' && a.targetId === BARRAGE_LET_PASSERSBY;
        p.filter = type === 'filtrer';
        p.label = `${st.name} — ${p.filter ? 'barrage filtrant, les gens sortent un par un' : p.passersby ? 'les manifestants ne passent pas, les passants oui' : 'personne ne passe, dans les deux sens'}`;
        p.arrows = arrowsTo(env, who, st.x, st.z);
      } else if (a.geom === 'autoLine') {
        const l = autoLineFor(where, env, whoUnits(env, who));
        p.kind = 'line';
        p.x = l.x;
        p.z = l.z;
        p.heading = l.heading;
        p.width = l.width;
        p.label = `Ligne de ${Math.round(l.width)}\u00a0m, face à la foule`;
        p.arrows = arrowsTo(env, who, l.x, l.z);
      } else if (a.geom === 'circle') {
        const units = whoUnits(env, who);
        let fx = where.x, fz = where.z - 1;
        if (units.length > 0) {
          fx = units.reduce((s, u) => s + u.x, 0) / units.length;
          fz = units.reduce((s, u) => s + u.z, 0) / units.length;
        }
        p.kind = 'circle';
        p.radius = CIRCLE_RADIUS;
        // sortie laissée à l'opposé des unités
        p.heading = pointHeading('avancer', fx, fz, where.x, where.z);
        p.label = 'Sortie laissée ouverte';
        p.arrows = arrowsTo(env, who, where.x, where.z);
      } else if (type === 'disperser_gaz') {
        p.kind = 'gas';
        p.radius = GAS_RADIUS;
        p.wind = env.wind ? { x: env.wind.x, z: env.wind.z } : null;
        p.label = 'Gaz lacrymogène';
        p.arrows = arrowsTo(env, who, where.x, where.z);
      } else if (a.geom === 'immediate' || a.geom === 'trace') {
        // ordre sur place ; ligne tracée en deux clics : la carte dessine elle-même le tracé en cours (traceEnds)
        p.kind = 'none';
        p.arrows = [];
      } else {
        p.kind = who && who.fromStation !== undefined ? 'route' : 'arrows';
        p.arrows = arrowsTo(env, who, where.x, where.z);
        if (type === 'degager_obstacle' && (!who || who.squadIds.length === 0)) {
          const c = env.units.filter((u) => u.mine && u.symbol === 'centaure')
            .sort((u, v) => Math.hypot(u.x - where.x, u.z - where.z) - Math.hypot(v.x - where.x, v.z - where.z))[0];
          if (c) p.arrows = arrowsTo(env, { squadIds: [c.squadId], label: '', mode: 'vehicules', eta: 0, distance: 0, busy: '' }, where.x, where.z);
        }
      }
      return p;
    }
    case 'nasse': {
      const crowd = crowdNear(env, where, 250);
      p.kind = 'nasse';
      if (!crowd) return p;
      p.x = crowd.x;
      p.z = crowd.z;
      p.radius = crowd.radius;
      const exits = crowd.exits.filter((e) => exitOpen(e));
      const units = whoUnits(env, who);
      const pairs = assignExits(exits, units);
      for (const q of pairs) {
        const e = exits[q.exit]!;
        const u = units[q.unit]!;
        p.segments.push({ squadId: u.squadId, ax: u.x, az: u.z, bx: e.x, bz: e.z, label: `${u.name} → ${e.street.trim() || 'passage piéton'}` });
      }
      const left = exits.length - pairs.length;
      p.label = left > 0 ? `${left} rue${left > 1 ? 's resteront ouvertes' : ' restera ouverte'}` : 'Toutes les rues seront tenues';
      return p;
    }
    case 'filteredExit': {
      const crowd = crowdNear(env, where, 250);
      const e = crowd ? pickFilterExit(crowd.exits, (id) => !!unitById(env, id)?.mine) : null;
      if (!e) return p;
      p.kind = 'street';
      p.x = e.x;
      p.z = e.z;
      p.heading = e.heading;
      p.width = e.width;
      p.filter = true;
      p.label = `${capFirst(e.street.trim() || 'passage piéton')} — sortie filtrée`;
      return p;
    }
    case 'closeRoad': {
      const st = streetAt(where, env);
      p.kind = 'street';
      p.x = st.x;
      p.z = st.z;
      p.heading = st.heading;
      p.width = st.width;
      p.passersby = true;
      p.label = `${st.name} — fermée aux voitures (barrières)`;
      p.arrows = arrowsTo(env, who, st.x, st.z);
      return p;
    }
    case 'closeArea':
      p.kind = 'circle';
      p.radius = a.radius;
      p.label = `Fermé aux voitures sur ${a.radius}\u00a0m`;
      return p;
    case 'rescue': {
      const inc = a.incidentId !== 0 ? env.incidents.find((i) => i.id === a.incidentId) : undefined;
      p.kind = 'rescue';
      p.service = a.service;
      if (inc) {
        p.x = inc.x;
        p.z = inc.z;
      }
      p.label = a.service === 'pompiers' ? 'POMPIERS ICI' : 'SAMU ICI';
      return p;
    }
    case 'means':
    case 'assignOther':
    case 'metro':
      p.kind = who && who.squadIds.length > 0 ? 'arrows' : 'none';
      p.arrows = arrowsTo(env, who, where.x, where.z);
      return p;
    default:
      return p;
  }
}
