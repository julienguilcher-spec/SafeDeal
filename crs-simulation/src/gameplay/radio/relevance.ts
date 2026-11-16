/* =====================================================================================
 * Radio — écoute d'un EXÉCUTANT (CRS de base, stagiaire, équipier d'engin) : ce qui le concerne.
 *
 * Demande du commanditaire : « quand je suis un simple CRS, un stagiaire, j'ai juste besoin des ordres que je dois
 * recevoir, de qui je dois suivre ; là, tous les ordres arrivent d'un coup, on ne comprend pas grand-chose ».
 *
 * Un message est :
 *   - 'mine'     adressé à mon groupe ou à ma section, dit par mon groupe (ou l'un de ses membres), ou par moi ;
 *   - 'general'  diffusion de la salle (CENTRAL) à tous ou à ma compagnie, message « à tous » ;
 *   - 'other'    trafic des autres unités, comptes rendus d'un échelon de commandement à un autre.
 * Le filtre (ExecutantRadioFilter) laisse passer 'mine' et 'general', écarte les accusés de réception (« ICI X.
 * REÇU… »), les redites d'un même message et les diffusions générales trop rapprochées. Le journal radio garde tout
 * (compte rendu, commandant) : seuls le sous-titre, la voix et l'affichage du journal de l'exécutant sont concernés.
 * Logique pure (ni DOM ni contexte de jeu).
 * ===================================================================================== */

import type { EntityId, RadioChannel, RadioMessage } from '@/core/contracts';

export type RadioRelevance = 'mine' | 'general' | 'other';

/** Unités et personnes qui font qu'un message concerne le joueur. */
export interface RadioScope {
  /** Indicatif (Squad.name, quelle que soit sa graphie) du groupe du joueur, '' s'il n'en a pas. */
  group: string;
  /** Indicatif de la section au-dessus de son groupe ('' si aucune). */
  section: string;
  /** Indicatif de la compagnie ('' si aucune). */
  company: string;
  /** Membres de son groupe et son chef (leurs paroles le concernent). */
  people: ReadonlySet<EntityId>;
  /** Le joueur lui-même. */
  self: EntityId;
}

const DIGITS = ['ZERO', 'UN', 'DEUX', 'TROIS', 'QUATRE', 'CINQ', 'SIX', 'SEPT', 'HUIT', 'NEUF'] as const;
export const CENTRAL_CALLSIGN = 'CENTRAL';

/**
 * Forme canonique d'un indicatif, pour comparer la forme écrite (« Mistral 1 Alfa ») et la forme dite
 * (« MISTRAL UN ALFA ») : capitales sans accents, chiffres épelés un par un, ponctuation retirée.
 */
export function canonicalCallsign(text: string): string {
  return text
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\d/g, (d) => ` ${DIGITS[d.charCodeAt(0) - 48]!} `)
    .replace(/[^A-Z]+/g, ' ')
    .replace(/\bALPHA\b/g, 'ALFA')
    .trim();
}

export interface RadioHeader {
  /** Destinataire (forme canonique), '' s'il n'est pas nommé (réponse « ICI X. … »). */
  to: string;
  /** Émetteur (forme canonique). */
  from: string;
  /** Réponse ou accusé de réception (« ICI X. REÇU… »). */
  reply: boolean;
  /**
   * Formule libre (« MISTRAL de CENTRAL. », « MISTRAL 1 ALFA, rendez-vous… ») : à n'accepter que si l'un des deux
   * noms est connu (« Feu de poubelles, rue… » n'est pas une formule d'appel).
   */
  loose: boolean;
  /** Longueur de la formule d'appel dans le texte (pour isoler le corps du message). */
  length: number;
}

/**
 * Formule d'appel d'un message radio : « APPELÉ ICI APPELANT. », « ICI APPELANT. » (réponse), « APPELÉ de APPELANT. »,
 * « À tous de CENTRAL : », ou « APPELÉ, … ». null si le message n'en a pas.
 */
export function parseRadioHeader(text: string): RadioHeader | null {
  const t = text.trimStart();
  let m = /^ICI\s+([^.,:;!?]{1,40}?)\s*[.,:;!?]/i.exec(t);
  if (m) return { to: '', from: canonicalCallsign(m[1]!), reply: true, loose: false, length: m[0].length };
  m = /^([^.:;!?]{1,48}?)\s+ICI\s+([^.,:;!?]{1,40}?)\s*[.,:;!?]/.exec(t);
  if (m) return { to: canonicalCallsign(m[1]!), from: canonicalCallsign(m[2]!), reply: false, loose: false, length: m[0].length };
  m = /^([^.,:;!?]{1,40}?)\s+de\s+([^.,:;!?]{1,40}?)\s*[.,:;!?]/.exec(t);
  if (m) return { to: canonicalCallsign(m[1]!), from: canonicalCallsign(m[2]!), reply: false, loose: true, length: m[0].length };
  m = /^([^.,:;!?]{2,40}?),\s/.exec(t);
  if (m) return { to: canonicalCallsign(m[1]!), from: '', reply: false, loose: true, length: m[0].length };
  return null;
}

/** « À tous », « Toutes unités », « Tous » : diffusion générale. */
function isAll(name: string): boolean {
  return /^(A )?TOUS\b/.test(name) || /^TOUTES? (LES )?UNITES\b/.test(name);
}

/** Destinataire et émetteur reconnus d'un message (formes canoniques). */
function addressOf(msg: RadioMessage, known: (name: string) => boolean): { to: string; from: string; header: RadioHeader | null } {
  const h = parseRadioHeader(msg.text);
  if (h && (!h.loose || known(h.to) || known(h.from))) return { to: h.to, from: h.from || canonicalCallsign(msg.from), header: h };
  return { to: '', from: canonicalCallsign(msg.from), header: h && !h.loose ? h : null };
}

/** Le message concerne-t-il le joueur exécutant ? */
export function classifyRadio(msg: RadioMessage, scope: RadioScope): RadioRelevance {
  if (msg.personId !== undefined && msg.personId !== 0 && (msg.personId === scope.self || scope.people.has(msg.personId))) return 'mine';
  const g = canonicalCallsign(scope.group);
  const s = canonicalCallsign(scope.section);
  const c = canonicalCallsign(scope.company);
  const known = (x: string): boolean => x !== '' && (x === CENTRAL_CALLSIGN || x === g || x === s || x === c || isAll(x));
  const { to, from } = addressOf(msg, known);
  const sender = canonicalCallsign(msg.from);
  // à mon groupe, à ma section ; ou dit par mon groupe
  if (g !== '' && (to === g || from === g || (to === '' && sender === g))) return 'mine';
  if (s !== '' && to === s) return 'mine';
  if (to !== '' && isAll(to)) return 'general';
  // la salle à ma compagnie (prise de service, changement de mission) ; les comptes rendus d'une autre section au
  // commandant de compagnie restent du trafic de commandement
  const fromCentral = from === CENTRAL_CALLSIGN || sender === CENTRAL_CALLSIGN;
  if (c !== '' && to === c) return fromCentral ? 'general' : 'other';
  // diffusion de la salle sans destinataire nommé
  if (to === '' && fromCentral) return 'general';
  return 'other';
}

/** Corps d'un message sans sa formule d'appel ni sa formule de fin (clé de comparaison des redites). */
export function radioBody(text: string): string {
  const h = parseRadioHeader(text);
  const body = h && !h.loose ? text.slice(h.length) : text;
  return canonicalCallsign(body).replace(/\b(PARLEZ|TERMINE)\s*$/, '').trim();
}

/**
 * Réseau entendu par un joueur qui n'est pas policier : les secours (pompiers, SAMU) ont leur réseau de régulation,
 * les street medics leur propre canal d'équipe, la presse et les manifestants n'ont pas la radio officielle (seul le
 * canal « public » : mégaphones, annonces). Jamais la radio de police.
 */
export interface ChannelListen {
  channels: ReadonlySet<RadioChannel>;
  /** Émetteurs entendus quel que soit le canal (formes canoniques, préfixes). */
  senders: readonly string[];
  /**
   * Sur les canaux écoutés, seuls ces émetteurs sont entendus (formes canoniques, préfixes) ; absent = tous. Le réseau
   * des secours est partagé avec les demandes des unités de police : le pompier n'entend que les siens.
   */
  onlyFrom?: readonly string[];
  /** Libellé pour la carte (« Radio : réseau des secours »). */
  label: string;
}

/** Indicatifs du réseau des secours (formes canoniques, préfixes) : salles, engins, équipes. */
export const RESCUE_NETWORK: readonly string[] = ['PARIS', 'SAMU', 'FOURGON', 'SMUR', 'SAPEUR', 'SANTE', 'POMPIERS', 'PS', 'VSAV', 'UMH'];

/** Réseau d'un rôle non policier ; null pour un rôle de police (écoute par unité ou complète). */
export function listenForRole(role: string): ChannelListen | null {
  switch (role) {
    case 'secouriste':
      // salle des pompiers (PARIS), régulation (SAMU 75), engins (FOURGON …, SMUR …) ; pas les unités de police ni CENTRAL
      return { channels: new Set<RadioChannel>(['secours']), senders: [], onlyFrom: RESCUE_NETWORK, label: 'Radio : réseau des secours (PARIS, SAMU 75)' };
    case 'street_medic':
      return { channels: new Set<RadioChannel>(['public']), senders: ['SECOURISTE DE RUE', 'STREET MEDIC'], label: 'Canal de votre équipe de street medics' };
    case 'journaliste':
      return { channels: new Set<RadioChannel>(['presse', 'public']), senders: [], label: 'Pas de radio officielle : rédaction et annonces publiques' };
    case 'manifestant':
      return { channels: new Set<RadioChannel>(['public']), senders: [], label: 'Pas de radio : annonces publiques seulement' };
    default:
      return null;
  }
}

export interface ExecutantFilterConfig {
  /** Un même message n'est pas répété avant ce délai (s). */
  repeat: number;
  /** Intervalle minimal entre deux diffusions générales non urgentes (s). */
  generalGap: number;
  /** Fenêtre du compteur de trafic masqué (s). */
  hiddenWindow: number;
}

export const DEFAULT_EXECUTANT_FILTER: ExecutantFilterConfig = { repeat: 90, generalGap: 20, hiddenWindow: 90 };

/**
 * Filtre d'écoute du joueur exécutant (état : redites et rythme des diffusions générales). `accept` est appelé UNE
 * fois par message diffusé, au moment où il passe sur les ondes.
 */
export class ExecutantRadioFilter {
  /** Messages masqués depuis le début de la session. */
  hiddenTotal = 0;
  private readonly hiddenAt: number[] = [];
  private readonly seen = new Map<string, number>();
  private lastGeneral = -Infinity;

  constructor(private readonly cfg: ExecutantFilterConfig = DEFAULT_EXECUTANT_FILTER) {}

  accept(msg: RadioMessage, scope: RadioScope, now: number): boolean {
    if (msg.personId !== undefined && msg.personId !== 0 && msg.personId === scope.self) return true;
    const rel = classifyRadio(msg, scope);
    if (rel === 'other') return this.hide(now);
    const h = parseRadioHeader(msg.text);
    // accusé de réception d'un ordre (« ICI MISTRAL 1 ALFA. REÇU, … ») : l'ordre lui-même suffit
    if (h && h.reply && msg.priority < 2 && /^\s*(REÇU|RECU)\b/i.test(msg.text.slice(h.length))) return this.hide(now);
    const key = radioBody(msg.text);
    const last = this.seen.get(key);
    if (key !== '' && last !== undefined && now >= last && now - last < this.cfg.repeat) return this.hide(now);
    if (rel === 'general' && msg.priority < 2) {
      if (now - this.lastGeneral < this.cfg.generalGap) return this.hide(now);
      this.lastGeneral = now;
    }
    if (key !== '') this.seen.set(key, now);
    if (this.seen.size > 256) for (const [k, t] of this.seen) if (now - t > this.cfg.repeat) this.seen.delete(k);
    return true;
  }

  /** Écoute d'un rôle non policier : son réseau seulement, sans redites. */
  acceptChannel(msg: RadioMessage, listen: ChannelListen, self: EntityId, now: number): boolean {
    if (msg.personId !== undefined && msg.personId !== 0 && msg.personId === self) return true;
    const sender = canonicalCallsign(msg.from);
    const only = listen.onlyFrom;
    const onChannel = listen.channels.has(msg.channel) && (!only || only.some((p) => sender === p || sender.startsWith(`${p} `)));
    const ok = onChannel || listen.senders.some((p) => sender.startsWith(p));
    if (!ok) return this.hide(now);
    const key = `${msg.channel}|${radioBody(msg.text)}`;
    const last = this.seen.get(key);
    if (last !== undefined && now >= last && now - last < this.cfg.repeat) return this.hide(now);
    this.seen.set(key, now);
    return true;
  }

  /** Messages masqués pendant la dernière fenêtre (compteur « trafic radio »). */
  hiddenRecent(now: number): number {
    const from = now - this.cfg.hiddenWindow;
    while (this.hiddenAt.length > 0 && this.hiddenAt[0]! < from) this.hiddenAt.shift();
    return this.hiddenAt.length;
  }

  reset(): void {
    this.hiddenTotal = 0;
    this.hiddenAt.length = 0;
    this.seen.clear();
    this.lastGeneral = -Infinity;
  }

  private hide(now: number): false {
    this.hiddenTotal++;
    this.hiddenAt.push(now);
    if (this.hiddenAt.length > 400) this.hiddenAt.splice(0, 200);
    return false;
  }
}
