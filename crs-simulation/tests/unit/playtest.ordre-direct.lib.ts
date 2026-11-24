// Recette des ordres directs (plan ordres-directs, paquet P16) : LE ROBOT QUI JOUE COMME LE JOUEUR, de bout en bout.
// Retour du joueur, commandant en « Missions spéciales » : « Je suis arrivé sur une manifestation, c'était n'importe
// quoi. Je pouvais donner zéro ordre, ils ne suivaient pas. La BRAV-M, j'arrivais pas à leur donner d'ordre […]
// J'interpelle des gens, mais je sais même pas où les mettre […] Il faut que je puisse donner directement des ordres et
// ils y vont direct. »
//
// Le robot ne fait que ce que fait le joueur sur son Mac sans souris :
//   - il TOURNE LA TÊTE (cap de la caméra, tangage à l'horizontale : les flèches du clavier) — le point visé et la
//     personne sous le réticule sont ceux que le jeu calcule (sim/people/player-aim.ts) ; la désignation est celle du
//     jeu (ui/command/direct/designate.ts, relue à chaque image comme fieldKeys.ts) ; Page préc. passe au lieu suivant ;
//   - il LIT la ligne « Entrée  … » (service 'command.direct' ready()) et n'appuie que si elle dit ce qu'il veut ;
//   - il APPUIE : Entrée, Maj+Entrée, A, U, ⌫ (give / avecMoi / cycle / undo du moteur du terrain) et E (l'invite du
//     moment de la touche Interagir). Jamais squads.issue, jamais un service de commandement.
// Il MESURE en secondes de jeu : l'accusé à la radio, le premier agent qui bouge, l'ordre que tient vraiment l'unité
// (Squad.order.type), le résultat dans le monde (ligne en travers de la rue, personne interpellée, à bord d'un fourgon
// cellulaire, fourgon parti au commissariat), ce que le joueur lit (puce d'état, bloc d'ordres, tickets) ; et relève,
// à chaque seconde, toute lecture « SANS ORDRE », « MONTE », « DESCEND » ou « EN FILE » d'une unité sous ses ordres,
// tout refus (phrase du tableau §4.3 ou forme « X ne peut pas : … U : une autre unité. »), toute attente sans raison.
import { expect } from 'vitest';

import type { GameContext, GameSystem, InteractionOption, ModuleFactory, OrderType, Person, SessionConfig, Squad, Vehicle } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { ObjectivesApi } from '@/core/extensions';
import { createTestContext } from '@/core/testing';
import { createSystems as env } from '@/env';
import { createWorldQuerySystems } from '@/world/query';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as traffic } from '@/sim/traffic';
import { createSystems as crowd } from '@/sim/crowd';
import { createSystems as police } from '@/sim/police';
import { createSystems as items } from '@/sim/items';
import { createSystems as props } from '@/sim/props';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import type { LawCustody, LawRecords } from '@/gameplay/law/api';
import { LAW_CUSTODY_SERVICE, LAW_RECORDS_SERVICE } from '@/gameplay/law/api';
import { createSystems as radio } from '@/gameplay/radio';
import { DEFAULT_QUEUE_CONFIG } from '@/gameplay/radio/queue';
import { estimateDuration } from '@/gameplay/radio/text';
import { createSystems as incidents } from '@/gameplay/incidents';
import { createSystems as rescue } from '@/sim/roles/rescue';
import { createSystems as medics } from '@/sim/roles/medics';
import { createSystems as session, JOURNEE_SERVICE } from '@/gameplay/session';
import type { JourneeApi } from '@/gameplay/session';
import { REMISE_SERVICE } from '@/gameplay/session/remise';
import type { RemiseApi } from '@/gameplay/session/remise';
import { createSystems as patrols } from '@/gameplay/patrols';
import { createSystems as commissariats } from '@/gameplay/commissariats';
import { createSystems as transfer, TRANSFER_SERVICE } from '@/gameplay/transfer';
import type { TransferApi } from '@/gameplay/transfer';
import { createSystems as missions } from '@/gameplay/missions';
import type { MissionsApi } from '@/gameplay/missions';
import { createObjectives } from '@/ui/core/objectives';
import { createSystems as maps } from '@/ui/maps';
import { createSystems as command, DIRECT_SERVICE } from '@/ui/command';
import type { CommandCore, DirectApi, DirectRuntime } from '@/ui/command';
import { CAP_REFUSALS, DIRECT_MORE_RING, DIRECT_WHEEL, REFUS, isKnownSimReason, refusForce, ticketText } from '@/ui/command/direct';
import { SECTOR_REFUS, sectorOrder } from '@/ui/command/direct/sector';
import type { DirectUnit, NaturalOrder, Ticket } from '@/ui/command/direct';
import { Designator, viewOfPlayer } from '@/ui/command/direct/designate';
import type { GiveResult } from '@/ui/command/direct/runtime';
import { NOTHING_LINE } from '@/ui/command/direct/words';
import { sharedFieldHud } from '@/ui/command/fieldHud';
import type { FieldHudModel } from '@/ui/command/fieldHud';
import { detaineesLine } from '@/ui/screens/debrief';
import { buildSessionConfig, defaultDraft, sanitizeDraft } from '@/ui/screens/scenario';
import type { ScenarioDraft } from '@/ui/screens/scenario';
import { launchFromSheet, walk } from './playtest.commandant-mission.lib';

const objectives: ModuleFactory = () => [{ id: 'test.objectives', order: 0, provide(ctx: GameContext) { ctx.provide(EXT.objectives, createObjectives()); } } as GameSystem];
const world: ModuleFactory = () => createWorldQuerySystems({ source: 'paris' });
/** La partie du joueur : les modules de simulation de main.ts, dans le même ordre (commissariats et transfert compris). */
export const PARTIE: ModuleFactory[] = [
  env, world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, incidents, rescue, medics,
  session, patrols, commissariats, transfer, missions, objectives, maps, command,
];

/** Pas de la partie (s) : quatre « images » par seconde suffisent aux mesures (accusé ≤ 1 s, mouvement ≤ 2 s). */
export const IMAGE = 0.25;
/** Ce qu'une unité sous ses ordres ne doit jamais montrer (acceptation 5). */
export const INTERDITS = /SANS ORDRE|\bMONTE\b|\bDESCEND\b|EN FILE/;
/** Forme des refus de la simulation (§4.3, dernière ligne). */
export const FORME_REFUS = /^.+ ne peut pas : .+\. U : une autre unité\.$/;

interface CommandLike {
  convoyOf(id: number): { stage: string; awaitingPlayer?: boolean; remaining?: number } | null;
  special(id: number): { kind?: string; stage: string; order?: string } | null;
}

/** Un appui du joueur sur une touche d'ordre. */
export interface Appui {
  /** « Entrée », « Maj+Entrée », « A », « ⌫ », ou la roue : « F 4 », « F 8 5 ». */
  touche: string;
  /** Instant de l'appui (temps de la partie). */
  at: number;
  /** Ligne lue à l'écran au moment de l'appui (sans la touche). */
  ligne: string;
  ordre: NaturalOrder | null;
  res: GiveResult;
}

/** Ce que le robot relève après un ordre. */
export interface Suivi {
  /** Accusé de réception de l'unité à la radio : secondes après l'appui (−1 : aucun) et sa phrase. */
  accuse: number;
  phrase: string;
  /** Premier agent (ou véhicule) de l'unité déplacé de plus d'un mètre : secondes après l'appui (−1 : aucun). */
  mouvement: number;
  /** Agents assis dans les véhicules de l'unité au moment de l'appui. */
  assisAuDepart: number;
  /** Agents qui se sont rapprochés du point de 2 m au moins (ou sont à moins de 15 m), 10 s après l'appui. */
  enMarcheA10: number;
  /** Secondes jusqu'au ticket « en place ✓ » (−1 : jamais dans la fenêtre). */
  enPlace: number;
  /** Échantillons où l'unité ne tenait pas l'ordre donné (« t+3,0 s : debarquer »). */
  autresOrdres: string[];
  /** Les lignes du ticket lues, dans l'ordre, sans répétition. */
  tickets: string[];
}

/** Arguments d'une partie libre ou d'une journée de service (les mêmes que la fiche de l'accueil). */
export type Reglages = Partial<SessionConfig>;

export class Joueur {
  readonly ctx: GameContext;
  readonly core: CommandCore;
  readonly direct: DirectApi & DirectRuntime;
  readonly cmd: CommandLike;
  readonly designator: Designator;
  /** Tous les appuis, dans l'ordre. */
  readonly appuis: Appui[] = [];
  /** Tout refus rencontré (phrase montrée au joueur). */
  readonly refus: string[] = [];
  /** Motifs de refus de la simulation sans mots pour le joueur (acceptation 10). */
  readonly motifsInconnus: string[] = [];
  /** Lectures interdites relevées (« t=412 s puce : MISTRAL 2 · DESCEND »). */
  readonly lectures: string[] = [];
  /** Tickets en attente sans raison, ou d'une attente de plus de 10 s hors trajet (acceptation 3). */
  readonly attentes: string[] = [];
  /** Messages montrés (toasts). */
  readonly messages: { t: number; text: string }[] = [];
  private sampleAt = -1e9;
  private readonly refusedTickets = new Set<number>();

  constructor(readonly t: ReturnType<typeof createTestContext>) {
    const ctx = t.ctx;
    this.ctx = ctx;
    this.core = ctx.require<CommandCore>('ui.command');
    this.direct = ctx.require<DirectApi & DirectRuntime>(DIRECT_SERVICE);
    this.cmd = ctx.require<CommandLike>('police.command');
    this.designator = new Designator(this.core);
    const ui = ctx.ui;
    const notify = ui.notify.bind(ui);
    ui.notify = (text, kind, seconds) => {
      this.messages.push({ t: ctx.clock.now, text });
      notify(text, kind, seconds);
    };
    ctx.events.onAny('police:order_refused', (e) => {
      const reason = String((e as { reason?: unknown }).reason ?? '');
      if (!isKnownSimReason(reason)) this.motifsInconnus.push(reason);
    });
  }

  /** Mission lancée depuis sa fiche de l'accueil (« Missions spéciales »), foule allégée à `crowd` personnes au plus. */
  static async mission(id: string, seed = 7, crowdMax = 300): Promise<Joueur> {
    const t = createTestContext({ seed, strict: false, modules: PARTIE });
    await t.ready;
    const cfg = launchFromSheet(t.ctx, id);
    cfg.crowdSize = Math.min(cfg.crowdSize ?? crowdMax, crowdMax);
    await t.start(cfg);
    return new Joueur(t);
  }

  /** Partie lancée depuis l'écran « Mode libre » avec ce brouillon (journée de service par défaut, comme le joueur). */
  static async libre(patch: Partial<ScenarioDraft>, seed: number): Promise<Joueur> {
    return Joueur.partie(buildSessionConfig(sanitizeDraft({ ...defaultDraft(), mode: 'libre', seed, ...patch })), seed);
  }

  /** Partie lancée avec ces réglages (mode libre, journée de service, patrouille). */
  static async partie(cfg: Reglages, seed: number): Promise<Joueur> {
    const t = createTestContext({ seed, strict: false, modules: PARTIE });
    await t.ready;
    await t.start(cfg);
    return new Joueur(t);
  }

  get moi(): Person {
    return this.ctx.player.person()!;
  }

  get now(): number {
    return this.ctx.clock.now;
  }

  // ───────────────────────────── le temps qui passe, ce qu'il lit ─────────────────────────────

  /** Laisse passer `seconds` de jeu, image par image : la désignation suit le regard, l'écran est relu. */
  pas(seconds: number): void {
    const n = Math.max(1, Math.round(seconds / IMAGE));
    for (let i = 0; i < n; i++) {
      this.t.step(IMAGE);
      this.image();
    }
  }

  /** Une image : comme fieldKeys.ts frame() (désignation), puis l'écran (bloc d'ordres, puce d'état). */
  image(): void {
    const ctx = this.ctx;
    if (ctx.session.phase !== 'playing' || !this.core.player()) return;
    if (ctx.ui.current === null) {
      const d = this.designator.update(viewOfPlayer(ctx), ctx.clock.now);
      if (d) this.direct.setDesignation(d);
    }
    this.direct.ready();
    if (ctx.clock.now - this.sampleAt < 1 - 1e-6) return;
    this.sampleAt = ctx.clock.now;
    const hud = this.ecran();
    if (!hud) return;
    const at = `t=${ctx.clock.now.toFixed(0)} s`;
    const read: [string, string][] = [['puce', hud.chip], ['état', hud.state], ...hud.detached.map((l): [string, string] => ['détachée', l])];
    for (const [where, text] of read) if (INTERDITS.test(text)) this.lectures.push(`${at} ${where} : ${text}`);
    for (const tk of this.direct.tickets) {
      if (tk.state === 'refuse' && !this.refusedTickets.has(tk.id)) {
        this.refusedTickets.add(tk.id);
        if (tk.why !== '') this.refus.push(tk.why);
      }
      // une attente dit pourquoi et pour combien de temps : 10 s au plus, trajet excepté (§2.2, acceptation 3)
      if (tk.state === 'attente' && (tk.reason === '' || tk.eta > 10 || tk.eta < 0)) this.attentes.push(`${at} ${ticketText(tk)} (raison « ${tk.reason} », ${tk.eta.toFixed(0)} s)`);
    }
  }

  /** Ce que montrent le bloc d'ordres et la puce d'état à cet instant. */
  ecran(): FieldHudModel | null {
    return sharedFieldHud(this.core, this.direct);
  }

  /** La ligne « Entrée  … » telle qu'elle est écrite (sans la touche). */
  ligne(): string {
    const o = this.direct.ready();
    if (!o) return '';
    return o.rule === 'i' ? NOTHING_LINE : o.text;
  }

  // ───────────────────────────── le regard (flèches du clavier, caméra à l'horizontale) ─────────────────────────────

  /** Il tourne la tête vers ce cap (rad), caméra à l'horizontale, et lit la ligne (0,75 s). */
  cap(yaw: number, pitch = 0): NaturalOrder | null {
    const st = this.ctx.player.state;
    st.camYaw = yaw;
    st.camPitch = pitch;
    const me = this.moi;
    if (me.vehicleId === 0) me.heading = yaw;
    this.pas(0.75);
    return this.direct.ready();
  }

  /** Il se tourne vers ce point. */
  regarder(x: number, z: number): NaturalOrder | null {
    const me = this.moi;
    return this.cap(Math.atan2(x - me.x, z - me.z));
  }

  /** Page préc. (fn + ↑) : le lieu suivant le long du regard. */
  plusLoin(): NaturalOrder | null {
    this.designator.keyStep(1);
    this.designator.keyRelease();
    this.pas(0.75);
    return this.direct.ready();
  }

  /**
   * Il tourne sur lui-même par crans de 15° (à gauche, à droite, de plus en plus loin du cap de départ) jusqu'à lire une
   * ligne qui lui convient ; à chaque cap, il peut passer aux lieux suivants (`pages` appuis de Page préc. au plus).
   */
  chercher(veut: (o: NaturalOrder) => boolean, pages = 0, depuis = this.ctx.player.state.camYaw): NaturalOrder | null {
    for (let k = 0; k < 24; k++) {
      const turn = ((k + 1) >> 1) * (k % 2 === 0 ? 1 : -1) * (Math.PI / 12);
      let o = this.cap(depuis + turn);
      if (o && veut(o)) return o;
      for (let p = 0; p < pages; p++) {
        o = this.plusLoin();
        if (o && veut(o)) return o;
      }
      if (pages > 0) this.designator.reset();
    }
    return null;
  }

  /**
   * §7.3 — il cherche un lieu lointain : il tourne sur lui-même par crans de 15° et, à chaque cap où le regard porte loin,
   * appuie sur Page préc. (fn + ↑) autant de fois qu'il faut pour que la ligne nomme un lieu entre `min` et `max` mètres
   * (« Envoyer : … »). Rend la ligne lue, ou null si aucun cap ne porte aussi loin.
   */
  chercherLoin(min: number, max: number, depuis = this.ctx.player.state.camYaw): NaturalOrder | null {
    const bon = (o: NaturalOrder | null): boolean => !!o && o.rule === 'h' && o.verb === 'envoyer' && o.enabled && o.distance >= min && o.distance <= max;
    for (let k = 0; k < 24; k++) {
      const turn = ((k + 1) >> 1) * (k % 2 === 0 ? 1 : -1) * (Math.PI / 12);
      this.designator.reset();
      let o = this.cap(depuis + turn);
      if (bon(o)) return o;
      // (une personne désignée — auteur, blessé — passe avant le sol : ce cap ne convient pas)
      const d = this.designator.current();
      if (!d || d.person) continue;
      const cands = this.designator.candidates();
      const want = cands.findIndex((c) => c.distance >= min && c.distance <= max);
      if (want < 0) continue;
      for (let n = Math.max(0, this.designator.index()); n < want; n++) {
        o = this.plusLoin();
        if (bon(o)) return o;
      }
      if (bon(o)) return o;
    }
    return null;
  }

  // ───────────────────────────── les touches ─────────────────────────────

  private note(touche: Appui['touche'], ordre: NaturalOrder | null, ligne: string, res: GiveResult): Appui {
    const a: Appui = { touche, at: this.now, ligne, ordre, res };
    this.appuis.push(a);
    if (!res.ok && !res.ignored && res.text !== '') this.refus.push(res.text);
    return a;
  }

  /** Entrée : l'ordre affiché. */
  entree(): Appui {
    const o = this.direct.ready();
    const ligne = this.ligne();
    return this.note('Entrée', o, ligne, this.direct.give('go'));
  }

  /** Maj+Entrée : la ligne « autre ». */
  majEntree(): Appui {
    const o = this.direct.ready();
    const autre = o ? o.autre : null;
    return this.note('Maj+Entrée', autre, autre ? autre.text : '', this.direct.give('autre'));
  }

  /** A : avec moi. */
  a(): Appui {
    return this.note('A', null, 'Avec moi', this.direct.avecMoi());
  }

  /** ⌫ : annuler. */
  retour(): Appui {
    return this.note('⌫', null, 'annuler', this.direct.undo());
  }

  /**
   * F puis un chiffre — et, pour la couronne « Plus… », F, 8, puis un chiffre : le secteur de la roue d'ordres, calculé et
   * donné comme la roue le fait (ui/command/orderWheel.ts : sectorOrder, puis giveSector), sur ce qu'il désigne.
   */
  roue(chiffre: number, plus = 0): Appui {
    const des = this.designator.current() ?? this.direct.designation();
    const roe = this.ctx.law.roe;
    const touche = `F ${chiffre}${plus > 0 ? ` ${plus}` : ''}`;
    const sector = (plus > 0 ? DIRECT_MORE_RING : DIRECT_WHEEL).find((w) => w.key === (plus > 0 ? plus : chiffre));
    const order = sector && des ? sectorOrder(sector, {
      env: this.direct.env(), des, whoKey: this.direct.whoKey(), yaw: this.ctx.player.state.camYaw,
      law: { authorizedForce: roe.authorizedForce, underAttack: roe.underAttack, authority: this.core.scope().canAuthorize },
    }) : null;
    if (!order) return this.note(touche, null, '', { ok: false, text: '', squads: [], ignored: true });
    return this.note(touche, order, order.text, this.direct.giveSector(order));
  }

  /** U : unité suivante ; rend la ligne relue. */
  u(step: 1 | -1 = 1): NaturalOrder | null {
    this.direct.cycle(step);
    return this.direct.ready();
  }

  /** U jusqu'à ce que la ligne nomme une unité qui convient (un tour de cycle au plus) ; null si aucune. */
  uJusqua(veut: (u: DirectUnit) => boolean): NaturalOrder | null {
    for (let i = 0; i < 16; i++) {
      const o = this.u();
      const who = o && o.who && o.who.manual ? o.who.squadIds : [];
      const unit = who.length === 1 ? this.unite(who[0]!) : null;
      if (o && unit && veut(unit)) return o;
    }
    return null;
  }

  // ───────────────────────────── les unités ─────────────────────────────

  /** Unités sous ses ordres, vues par les ordres directs. */
  unites(): readonly DirectUnit[] {
    return this.direct.env().units;
  }

  unite(squadId: number): DirectUnit | null {
    return this.unites().find((u) => u.squadId === squadId) ?? null;
  }

  squad(id: number): Squad {
    return this.ctx.squads.get(id)!;
  }

  /** L'unité et toutes ses subordonnées. */
  lignee(ids: readonly number[]): number[] {
    const out = new Set<number>();
    const add = (id: number): void => {
      if (out.has(id)) return;
      out.add(id);
      for (const c of this.ctx.squads.childrenOf(id)) add(c.id);
    };
    ids.forEach(add);
    return [...out];
  }

  /** Agents (hors joueur) de ces unités et de leurs subordonnées ; `pied` : sans les conducteurs ni les pilotes. */
  agents(ids: readonly number[], pied = false): Person[] {
    const out: Person[] = [];
    for (const id of this.lignee(ids)) {
      for (const pid of this.ctx.squads.get(id)?.members ?? []) {
        const p = this.ctx.people.get(pid);
        if (!p || p.isPlayer || p.custody !== 'free' || p.posture === 'down') continue;
        if (pied && (p.poste === 'conducteur' || p.poste === 'pilote_moto')) continue;
        out.push(p);
      }
    }
    return out;
  }

  /** Où est cet agent (son véhicule s'il est à bord). */
  lieu(p: Person): { x: number; z: number } {
    const v = p.vehicleId !== 0 ? this.ctx.vehicles.get(p.vehicleId) : undefined;
    return v ? { x: v.x, z: v.z } : { x: p.x, z: p.z };
  }

  /** Les BRAV-M sous ses ordres (l'unité entière, pas ses binômes). */
  bravm(): DirectUnit[] {
    const us = this.unites();
    return us.filter((u) => u.kind === 'bravm' && !(u.parentId !== 0 && us.find((q) => q.squadId === u.parentId)?.kind === 'bravm'));
  }

  /** Fourgons cellulaires du dispositif (équipage et véhicule). */
  cellulaires(): { s: Squad; v: Vehicle }[] {
    const out: { s: Squad; v: Vehicle }[] = [];
    const remise = this.ctx.service<RemiseApi>(REMISE_SERVICE);
    const ids = remise ? remise.vans() : [];
    for (const id of ids) {
      const s = this.ctx.squads.get(id);
      const v = s && s.vehicleId !== 0 ? this.ctx.vehicles.get(s.vehicleId) : undefined;
      if (s && v) out.push({ s, v });
    }
    return out;
  }

  /** Interpellés à bord d'un véhicule. */
  aBord(v: Vehicle): Person[] {
    const out: Person[] = [];
    for (const id of v.seats) {
      const p = id !== 0 ? this.ctx.people.get(id) : undefined;
      if (p && p.custody === 'in_vehicle') out.push(p);
    }
    return out;
  }

  // ───────────────────────────── mesures ─────────────────────────────

  /**
   * Après un ordre aux unités `ids` : joue `secondes` (ou jusqu'à `fini`) et relève l'accusé, le premier mouvement,
   * l'ordre tenu (`type` : le type attendu, vérifié à chaque image jusqu'à « en place »), le ticket lu.
   */
  suivre(appui: Appui, ids: readonly number[], secondes: number, opts: { type?: OrderType | readonly OrderType[]; point?: { x: number; z: number }; fini?: () => boolean; arretEnPlace?: boolean } = {}): Suivi {
    const ctx = this.ctx;
    const at = appui.at;
    const types = opts.type === undefined ? null : typeof opts.type === 'string' ? [opts.type] : opts.type;
    const names = new Set(this.lignee(ids).map((id) => ctx.squads.get(id)?.name ?? '').filter((n) => n !== ''));
    const all = this.agents(ids);
    const start = new Map<number, { x: number; z: number }>();
    for (const p of all) start.set(p.id, this.lieu(p));
    const s: Suivi = { accuse: -1, phrase: '', mouvement: -1, assisAuDepart: this.agents(ids, true).filter((p) => p.vehicleId !== 0).length, enMarcheA10: -1, enPlace: -1, autresOrdres: [], tickets: [] };
    const point = opts.point;
    const d0 = new Map<number, number>();
    if (point) for (const p of this.agents(ids, true)) { const q = this.lieu(p); d0.set(p.id, Math.hypot(q.x - point.x, q.z - point.z)); }
    const read = (): void => {
      const el = ctx.clock.now - at;
      if (s.accuse < 0) {
        const m = ctx.radio.log.find((l) => l.t >= at - 1e-6 && names.has(l.from) && (l.reply === true || /re[çc]u/i.test(l.text)));
        if (m) { s.accuse = delaiAccuse(this, at, m.t); s.phrase = m.text; }
      }
      if (s.mouvement < 0) {
        for (const p of all) {
          const p0 = start.get(p.id)!;
          const q = this.lieu(p);
          if (Math.hypot(q.x - p0.x, q.z - p0.z) > 1) { s.mouvement = el; break; }
        }
      }
      if (point && s.enMarcheA10 < 0 && el >= 10 - 1e-6) {
        let n = 0;
        for (const p of this.agents(ids, true)) {
          const q = this.lieu(p);
          const d = Math.hypot(q.x - point.x, q.z - point.z);
          if (d < 15 || (d0.get(p.id) ?? d) - d >= 2) n++;
        }
        s.enMarcheA10 = n;
      }
      const tk = ids.length > 0 ? this.direct.ticketOf(ids[0]!) : null;
      if (tk) {
        const text = ticketText(tk);
        if (text !== '' && s.tickets[s.tickets.length - 1] !== text) s.tickets.push(text);
        if (s.enPlace < 0 && tk.state === 'en_place' && tk.issuedAt >= at - 1e-6) s.enPlace = el;
      }
      if (types && s.enPlace < 0) {
        for (const id of ids) {
          const ty = ctx.squads.get(id)?.order.type ?? '';
          if (!types.includes(ty as OrderType)) s.autresOrdres.push(`t+${el.toFixed(1)} s ${ctx.squads.get(id)?.name} : ${ty}`);
        }
      }
    };
    read();
    const n = Math.round(secondes / IMAGE);
    for (let i = 0; i < n; i++) {
      this.pas(IMAGE);
      read();
      if (opts.fini && opts.fini()) break;
      if (opts.arretEnPlace && s.enPlace >= 0 && ctx.clock.now - at >= 10) break;
    }
    return s;
  }

  /**
   * Le barrage dans le monde : agents à pied de l'unité dans la bande de la rue barrée (à 8 m au plus du point de l'ordre
   * le long de la rue), et largeur qu'ils couvrent en travers, comparée à celle de la chaussée.
   */
  barrage(squadId: number): { dansLaBande: number; agents: number; couvert: number; chaussee: number } {
    const ctx = this.ctx;
    const o = this.squad(squadId).order;
    const road = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };
    if (!ctx.world.nearestRoad(o.x, o.z, road as never, 25)) return { dansLaBande: 0, agents: 0, couvert: 0, chaussee: 0 };
    // (le long de la rue : son cap ; en travers : la perpendiculaire)
    const fx = Math.sin(road.heading), fz = Math.cos(road.heading);
    let on = 0, min = Infinity, max = -Infinity;
    const list = this.agents([squadId], true);
    for (const p of list) {
      if (p.vehicleId !== 0) continue;
      const lon = (p.x - o.x) * fx + (p.z - o.z) * fz;
      const lat = (p.x - o.x) * fz - (p.z - o.z) * fx;
      if (Math.abs(lon) > 8 || Math.abs(lat) > road.width * 0.5 + 15) continue;
      on++;
      if (lat < min) min = lat;
      if (lat > max) max = lat;
    }
    return { dansLaBande: on, agents: list.length, couvert: on > 1 ? max - min : 0, chaussee: road.width };
  }

  /**
   * Il marche vers les manifestants les plus proches jusqu'à en avoir un en vue entre `min` et `max` mètres (au plus
   * `secondes`) ; rend ce manifestant, ou null.
   */
  approcher(min: number, max: number, secondes: number): Person | null {
    for (let s = 0; s < secondes; s++) {
      const vu = manifestantEnVue(this, min, max);
      if (vu) return vu;
      const me = this.moi;
      let best: Person | null = null;
      let bd = Infinity;
      for (const p of this.ctx.people.list) {
        if (p.faction !== 'protest' || p.custody !== 'free' || p.vehicleId !== 0 || p.dormant) continue;
        const d = Math.hypot(p.x - me.x, p.z - me.z);
        if (d < bd) { bd = d; best = p; }
      }
      if (!best) return null;
      if (bd > max) this.marcher(best.x, best.z, 1); else this.pas(1);
    }
    return manifestantEnVue(this, min, max);
  }

  // ───────────────────────────── le trajet d'une mission ou d'une journée ─────────────────────────────

  /**
   * Trajet en passager de son véhicule (le défaut du robot des missions) : il rejoint le véhicule que montre l'objectif
   * « Embarquez », monte à la place du passager, et laisse rouler jusqu'à `arrive()` (au plus `limite` s). À chaque
   * seconde, `enRoute` peut jouer (ordres donnés pendant le trajet). Rend les secondes passées (−1 : jamais arrivé).
   */
  trajet(arrive: () => boolean, limite = 1300, enRoute?: (s: number) => void): number {
    const ctx = this.ctx;
    const obj = ctx.require<ObjectivesApi>(EXT.objectives);
    const path: number[] = [];
    for (let s = 0; s < limite; s++) {
      if (arrive()) return s;
      this.pas(1);
      if (enRoute) enRoute(s);
      const me = this.moi;
      if (me.vehicleId !== 0) continue;
      const e = obj.list.find((o) => o.state === 'actif' && /^(Embarquez|Montez)/.test(o.text) && o.x !== undefined);
      if (!e) continue;
      walk(ctx, me, e.x!, e.z!, 4, path);
      const v = ctx.vehicles.list.find((x) => Math.hypot(x.x - e.x!, x.z - e.z!) < 6 && Math.hypot(x.x - me.x, x.z - me.z) < 6);
      if (v) ctx.vehicles.enter(me, v, 'passenger');
    }
    return arrive() ? limite : -1;
  }

  /** E « Descendre » : il sort de son véhicule. */
  descendre(): void {
    const me = this.moi;
    if (me.vehicleId !== 0) this.ctx.vehicles.exit(me);
    this.pas(1);
  }

  /** Il marche (4 m/s au plus, par le chemin piéton) vers ce point pendant `secondes`. */
  marcher(x: number, z: number, secondes: number): void {
    const path: number[] = [];
    for (let s = 0; s < secondes; s++) {
      walk(this.ctx, this.moi, x, z, 4, path);
      this.ctx.people.rebuildIndex();
      this.pas(1);
    }
  }

  // ───────────────────────────── la touche Interagir (E) ─────────────────────────────

  /** Invites de la touche Interagir, la première d'abord (copies). */
  invites(): InteractionOption[] {
    const out: InteractionOption[] = [];
    this.ctx.interactions.options(this.moi, out);
    return out.map((o) => ({ ...o }));
  }

  /** Un appui sur E : l'invite du moment, jusqu'au bout de son action. Rend l'invite (null : aucune). */
  e(): InteractionOption | null {
    const opts: InteractionOption[] = [];
    this.ctx.interactions.options(this.moi, opts);
    const top = opts[0];
    if (!top) return null;
    const copy = { ...top };
    if (!this.ctx.interactions.start(this.moi, top)) return null;
    const cur = this.ctx.interactions.current(this.moi);
    this.pas((cur ? cur.opt.duration : 0) + 0.25);
    return copy;
  }

  // ───────────────────────────── refus, registres ─────────────────────────────

  /** Refus rencontrés qui ne sont ni une phrase du tableau §4.3 ni de la forme « X ne peut pas : … U : une autre unité. ». */
  refusHorsTableau(): string[] {
    return this.refus.filter((r) => !phraseDuTableau(r) && !FORME_REFUS.test(r));
  }

  get custody(): LawCustody {
    return this.ctx.require<LawCustody>(LAW_CUSTODY_SERVICE);
  }

  get records(): LawRecords {
    return this.ctx.require<LawRecords>(LAW_RECORDS_SERVICE);
  }

  get transfert(): TransferApi {
    return this.ctx.require<TransferApi>(TRANSFER_SERVICE);
  }

  get remise(): RemiseApi {
    return this.ctx.require<RemiseApi>(REMISE_SERVICE);
  }

  get journee(): JourneeApi {
    return this.ctx.require<JourneeApi>(JOURNEE_SERVICE);
  }

  get missions(): MissionsApi {
    return this.ctx.require<MissionsApi>('missions');
  }

  /** La ligne « Interpellés : … » du compte rendu de fin (ui/screens/debrief.ts), d'après les registres. */
  compteRendu(): string {
    return detaineesLine(this.records.interpellations);
  }

  /** Résumé d'un suivi pour le journal de la recette. */
  dire(titre: string, a: Appui, s: Suivi): string {
    return `${titre} — « ${a.ligne} » : ${a.res.ok ? 'accepté' : a.res.ignored ? 'IGNORÉ' : `REFUSÉ (${a.res.text})`} ; accusé ${s.accuse < 0 ? 'AUCUN' : `${s.accuse.toFixed(2)} s « ${s.phrase} »`} ; `
      + `mouvement ${s.mouvement < 0 ? 'AUCUN' : `${s.mouvement.toFixed(2)} s`} ; assis au départ ${s.assisAuDepart} ; en marche à 10 s ${s.enMarcheA10} ; en place ${s.enPlace < 0 ? 'NON' : `${s.enPlace.toFixed(1)} s`}`
      + `${s.autresOrdres.length > 0 ? ` ; AUTRE ORDRE : ${s.autresOrdres.slice(0, 3).join(' | ')}` : ''}\n      tickets : ${s.tickets.join(' → ')}`;
  }
}

// ───────────────────────────── étapes rejouées dans plusieurs scénarios ─────────────────────────────

/** §7.1 : ce qu'on relève quand il fait barrer une rue. */
export interface EtapeBarrage {
  ligne: string;
  appui: Appui;
  unite: string;
  squadId: number;
  suivi: Suivi;
  barrage: ReturnType<Joueur['barrage']>;
}

/**
 * §7.1 — il tourne sur lui-même jusqu'à lire « Bloquer la rue … · UNITÉ · N m » (une rue à 15–150 m, une seule unité,
 * pas l'une de `sauf`), Entrée, puis 60 s au plus jusqu'à « barrée ✓ » (et 5 s de plus pour la mesure dans le monde).
 */
export function etapeBarrage(j: Joueur, sauf: readonly number[] = []): EtapeBarrage | null {
  const o = j.chercher((n) => n.rule === 'g' && n.enabled && n.who !== null && n.who.squadIds.length === 1 && !sauf.includes(n.who.squadIds[0]!) && n.distance >= 15 && n.distance <= 150);
  if (!o) return null;
  const ligne = j.ligne();
  const appui = j.entree();
  const id = appui.res.squads[0] ?? o.who!.squadIds[0]!;
  const suivi = j.suivre(appui, [id], 60, { type: 'couper_circulation', point: { x: o.x, z: o.z }, arretEnPlace: true });
  j.pas(5);
  return { ligne, appui, unite: j.squad(id).name, squadId: id, suivi, barrage: j.barrage(id) };
}

/** Vérifie §7.1 (acceptation 1) : accusé ≤ 1 s, premier mouvement ≤ 2 s, en place ≤ 45 s, la rue barrée sur sa largeur. */
export function verifierBarrage(a: EtapeBarrage | null): void {
  expect(a, 'une ligne « Bloquer la rue … » en tournant sur lui-même').not.toBeNull();
  if (!a) return;
  expect(a.ligne).toMatch(/^Bloquer .+ · .+ · \d+\u00a0m$/);
  expect(a.appui.res.ok, a.appui.res.text).toBe(true);
  expect(a.appui.res.squads.length).toBe(1);
  // le ticket existe à l'appui même : « reçu »
  expect(a.suivi.tickets[0]).toMatch(/ · Bloquer .+ · reçu$/);
  expect(a.suivi.accuse, 'accusé à la radio').toBeGreaterThanOrEqual(0);
  expect(a.suivi.accuse).toBeLessThanOrEqual(1);
  expect(a.suivi.mouvement, 'premier agent en mouvement').toBeGreaterThanOrEqual(0);
  expect(a.suivi.mouvement).toBeLessThanOrEqual(2);
  // des agents encore assis : ils descendent d'abord, et c'est dit
  if (a.suivi.assisAuDepart > 0) expect(a.suivi.tickets.some((t) => /descend des fourgons|en fourgons/.test(t)), a.suivi.tickets.join(' → ')).toBe(true);
  expect(a.suivi.autresOrdres, 'l’unité tient l’ordre donné').toEqual([]);
  expect(a.suivi.enPlace, `ticket « barrée ✓ » : ${a.suivi.tickets.slice(-2).join(' → ')}`).toBeGreaterThanOrEqual(0);
  expect(a.suivi.enPlace).toBeLessThanOrEqual(45);
  expect(a.suivi.tickets[a.suivi.tickets.length - 1]).toMatch(/barrée? ✓$/);
  // dans le monde : la ligne est en travers de la rue, sur toute la largeur de la chaussée
  expect(a.barrage.dansLaBande / Math.max(1, a.barrage.agents), JSON.stringify(a.barrage)).toBeGreaterThanOrEqual(0.7);
  expect(a.barrage.couvert, JSON.stringify(a.barrage)).toBeGreaterThanOrEqual(a.barrage.chaussee * 0.9);
}

/** A puis ⌫ : ce qu'on relève. */
export interface EtapeAvecMoi {
  appui: Appui;
  accuse: number;
  /** Unités qui ne tiennent pas « suivre » le joueur une seconde après A. */
  pasAvecMoi: string[];
  ordres: string[];
  etat: string;
  retour: Appui;
  /** Ordre de l'unité qui barrait, une seconde et cinq secondes après ⌫. */
  rendu: string;
  renduApres: string;
  /** Autres unités qui ne suivent plus le joueur après ⌫. */
  autres: string[];
  /** Ce qui s'est dit à la radio dans les deux secondes après A. */
  radio: string[];
}

/**
 * A : tout le monde avec lui (acceptation 6), l'écran le dit ; une seconde plus tard ⌫ : l'unité `barrait` reprend son
 * barrage, les autres restent avec lui (acceptation 19). Les fourgons cellulaires gardent la remise : ils ne comptent pas.
 */
export function etapeAvecMoi(j: Joueur, barrait: number): EtapeAvecMoi {
  const appui = j.a();
  j.pas(1);
  const me = j.moi;
  const pasAvecMoi: string[] = [];
  const ordres: string[] = [];
  for (const u of j.unites()) {
    if (u.kind === 'cellulaire') continue;
    const o = j.squad(u.squadId).order;
    ordres.push(`${u.name}:${o.type}`);
    if (!(o.type === 'suivre' && o.targetId === me.id)) pasAvecMoi.push(`${u.name} (${o.type})`);
  }
  const names = new Set(j.unites().map((u) => u.name));
  const ack = j.ctx.radio.log.find((l) => l.t >= appui.at - 1e-6 && names.has(l.from) && (l.reply === true || /re[çc]u/i.test(l.text)));
  const etat = j.ecran()?.state ?? '';
  j.pas(1);
  const radio = j.ctx.radio.log.filter((l) => l.t >= appui.at - 1e-6).map((l) => `${(l.t - appui.at).toFixed(2)} s ${l.from}${l.silent ? ' (écrit)' : ''} : ${l.text}`);
  const retour = j.retour();
  j.pas(1);
  const rendu = barrait ? j.squad(barrait).order.type : '';
  j.pas(4);
  const autres: string[] = [];
  for (const u of j.unites()) {
    if (u.kind === 'cellulaire' || j.lignee([barrait]).includes(u.squadId) || j.lignee([u.squadId]).includes(barrait)) continue;
    const o = j.squad(u.squadId).order;
    if (!(o.type === 'suivre' && o.targetId === me.id)) autres.push(`${u.name} (${o.type})`);
  }
  return { appui, accuse: ack ? delaiAccuse(j, appui.at, ack.t) : -1, pasAvecMoi, ordres, etat, retour, rendu, renduApres: barrait ? j.squad(barrait).order.type : '', autres, radio };
}

/** Résumé de A puis ⌫ pour le journal de la recette. */
export function direAvecMoi(c: EtapeAvecMoi, barrait: string): string {
  return `A : ${c.appui.res.ok ? 'accepté' : c.appui.res.text} ; accusé ${c.accuse.toFixed(2)} s ; pas « suivre » à +1 s : ${c.pasAvecMoi.join(', ') || 'aucune'} ; état « ${c.etat} »\n      radio : ${c.radio.join(' | ')}`
    + `\n      ⌫ : ${c.retour.res.ok ? `« ${c.retour.res.text} »` : c.retour.res.ignored ? 'IGNORÉ' : c.retour.res.text} ; ${barrait} tient « ${c.rendu} » à +1 s, « ${c.renduApres} » à +5 s ; autres hors « suivre » : ${c.autres.join(', ') || 'aucune'}`;
}

/** §7.2 : ce qu'on relève quand il fait interpeller un auteur désigné. */
export interface EtapeInterpeller {
  ligne: string;
  appui: Appui;
  unite: string;
  squadId: number;
  accuse: number;
  /** Secondes après l'appui : interpellé, à bord d'un fourgon cellulaire (−1 : jamais dans la fenêtre). */
  interpelle: number;
  aBord: number;
  fourgon: string;
  /** Secondes après la mise à bord : l'unité est de nouveau « avec vous » (ou son ordre d'avant), −1 : jamais. */
  revient: number;
  /** Ordres tenus par l'unité pendant l'interpellation, dans l'ordre, sans répétition. */
  types: string[];
  /** Ce que l'écran a dit de l'unité (ticket), sans les nombres. */
  ecran: string[];
  /** Distance du fourgon cellulaire le plus proche à l'interpellé, au moment où il est pris (m). */
  fourgonA: number;
  /** Ce qui se disait à la radio autour de l'appui (de −8 s à +8 s). */
  radio: string[];
  /** Secondes après l'appui où l'écran a dit « interpellé ✓ » (−1 : jamais), et ce qu'était alors l'auteur (custody). */
  fait: number;
  etatAuFait: string;
  /** Interpellation refusée ou abandonnée : secondes après l'appui (−1 : non), la phrase, et le retour « avec vous » (s après). */
  refuse: number;
  refus: string;
  revientApresRefus: number;
  /**
   * Secondes après l'appui pendant lesquelles un message URGENT (priorité 2) déjà en cours tenait le réseau du
   * commandement (0 : aucun) — l'accusé ne coupe pas un urgent, il passe juste après lui (plan §2.4, radio/queue.ts).
   */
  urgentEnCours: number;
}

/**
 * Délai de l'accusé de réception dit à l'instant `t` pour un ordre donné à `at` (s). Le temps pendant lequel un message
 * URGENT déjà en cours tenait le réseau du commandement n'est pas compté : l'accusé d'un ordre du joueur coupe un
 * message de priorité 0 ou 1, jamais un urgent — il passe juste après lui (plan §2.4 : « pre-empts a playing message of
 * priority 0–1 » ; gameplay/radio/queue.ts ; radio.queue.test « reply : ne coupe ni un urgent ni le joueur »). Sans
 * cela, « accusé ≤ 1 s » tombait au hasard sur un message de CENTRAL (3 à 10 s) d'une partie à l'autre.
 */
export function delaiAccuse(j: Joueur, at: number, t: number): number {
  const raw = t - at;
  return Math.max(0, raw - Math.min(raw, urgentEnCours(j, at, t)));
}

/**
 * Jusqu'à quand (s après `at`) un message urgent commencé avant `until` occupe le réseau du commandement : la fin de sa
 * diffusion et le silence entre deux messages. 0 : le réseau n'était pas tenu par un urgent.
 */
export function urgentEnCours(j: Joueur, at: number, until: number): number {
  let busy = 0;
  for (const l of j.ctx.radio.log) {
    if (l.channel !== 'commandement' || l.priority < 2 || l.silent === true || l.t > until + 1e-6) continue;
    const end = l.t + estimateDuration(l.text) + DEFAULT_QUEUE_CONFIG.gap;
    if (end > at) busy = Math.max(busy, end - at);
  }
  return busy;
}

/**
 * §7.2 — un manifestant lance un projectile (fait constaté), il le regarde, lit « Interpeller le lanceur de projectile ·
 * UNITÉ · N m », UN appui ; puis il le garde sous les yeux. Joue `secondes` au plus.
 */
export function etapeInterpeller(j: Joueur, cible: Person, secondes = 200): EtapeInterpeller {
  const ctx = j.ctx;
  jetConstate(j, cible);
  const o = j.regarder(cible.x, cible.z);
  const ligne = j.ligne();
  const appui = j.entree();
  const id = appui.res.squads[0] ?? (o && o.who ? o.who.squadIds[0]! : 0);
  const r: EtapeInterpeller = { ligne, appui, unite: id ? j.squad(id).name : '', squadId: id, accuse: -1, interpelle: -1, aBord: -1, fourgon: '', revient: -1, types: [], ecran: [], fourgonA: -1, radio: [], fait: -1, etatAuFait: '', refuse: -1, refus: '', revientApresRefus: -1, urgentEnCours: 0 };
  if (!appui.res.ok || !id) return r;
  const names = new Set(j.lignee([id]).map((q) => j.squad(q).name));
  const vans = j.cellulaires();
  for (let k = 0; r.aBord < 0 || r.revient < 0; k++) {
    // (l'écran a dit « interpellé ✓ » et l'auteur est toujours libre vingt secondes plus tard : rien de plus à attendre)
    if (r.fait >= 0 && cible.custody === 'free' && j.now - appui.at - r.fait > 20) break;
    // (après un refus : vingt secondes de plus, le temps de voir l'unité revenir avec lui)
    if (r.refuse >= 0 ? r.revientApresRefus >= 0 || j.now - appui.at - r.refuse > 20 : k >= secondes * 4) break;
    // il garde l'auteur sous les yeux tant qu'il est libre
    if (cible.custody === 'free') ctx.player.state.camYaw = Math.atan2(cible.x - j.moi.x, cible.z - j.moi.z);
    j.pas(IMAGE);
    const el = j.now - appui.at;
    if (r.accuse < 0) {
      const m = ctx.radio.log.find((l) => l.t >= appui.at - 1e-6 && names.has(l.from) && (l.reply === true || /re[çc]u/i.test(l.text)));
      if (m) {
        r.accuse = delaiAccuse(j, appui.at, m.t);
        r.urgentEnCours = urgentEnCours(j, appui.at, m.t);
      }
    }
    if (r.interpelle < 0 && cible.custody !== 'free') {
      r.interpelle = el;
      r.fourgonA = Math.min(...vans.map(({ v }) => Math.hypot(v.x - cible.x, v.z - cible.z)), Infinity);
    }
    const v = cible.vehicleId !== 0 ? ctx.vehicles.get(cible.vehicleId) : undefined;
    if (r.aBord < 0 && cible.custody === 'in_vehicle' && v && v.kind === 'fourgon_cellulaire') {
      r.aBord = el;
      r.fourgon = vans.find((x) => x.v.id === v.id)?.s.name ?? `véhicule ${v.id}`;
    }
    const ty = j.squad(id).order.type;
    if (r.aBord < 0 && r.types[r.types.length - 1] !== ty) r.types.push(ty);
    const tk = j.direct.ticketOf(id);
    const shown = (tk ? ticketText(tk) : '').replace(/\d+(\u00a0| )?(m|s|min)\b/g, 'N');
    if (shown !== '' && r.ecran[r.ecran.length - 1] !== shown) r.ecran.push(shown);
    if (r.refuse < 0 && tk && tk.state === 'refuse' && tk.issuedAt >= appui.at - 1e-6) { r.refuse = el; r.refus = tk.why; }
    if (r.fait < 0 && tk && tk.state === 'en_place' && tk.verb === 'interpeller' && Math.abs(tk.issuedAt - appui.at) < 1e-6) { r.fait = el; r.etatAuFait = cible.custody; }
    if (r.refuse >= 0 && r.revientApresRefus < 0 && j.unite(id)?.avecVous) r.revientApresRefus = el - r.refuse;
    if (k === 32) r.radio = ctx.radio.log.filter((l) => l.t >= appui.at - 8 && l.t <= appui.at + 8).map((l) => `${(l.t - appui.at).toFixed(2)} s [${l.priority}${l.reply ? ', accusé' : ''}${l.silent ? ', écrit' : ''}] ${l.from} : ${l.text.slice(0, 70)}`);
    if (r.aBord >= 0 && r.revient < 0) {
      const u = j.unite(id);
      const prev = j.core.playerOrder(id);
      if ((u && u.avecVous) || (prev !== null && prev.verb !== 'interpeller' && prev.verb !== 'constater' && j.squad(id).order.type === prev.type)) r.revient = el - r.aBord;
    }
  }
  return r;
}

/** Résumé d'une interpellation pour le journal de la recette. */
export function direInterpeller(r: EtapeInterpeller): string {
  return `« ${r.ligne} » : ${r.appui.res.ok ? 'accepté' : r.appui.res.ignored ? 'IGNORÉ' : `REFUSÉ (${r.appui.res.text})`} → ${r.unite} ; accusé ${r.accuse.toFixed(2)} s${r.urgentEnCours > 0 ? ` (après un urgent qui tenait le réseau ${r.urgentEnCours.toFixed(1)} s)` : ''} ; interpellé à ${r.interpelle.toFixed(1)} s `
    + `(fourgon cellulaire le plus proche à ${r.fourgonA.toFixed(0)} m) ; à bord${r.fourgon ? ` du ${r.fourgon}` : ''} à ${r.aBord.toFixed(1)} s ; de nouveau avec lui ${r.revient.toFixed(1)} s après ; ordres tenus ${r.types.join(' → ')}${r.fait >= 0 ? ` ; « ✓ » à ${r.fait.toFixed(1)} s (auteur alors ${r.etatAuFait})` : ''}${r.refuse >= 0 ? ` ; REFUS à ${r.refuse.toFixed(1)} s « ${r.refus} », de nouveau avec lui ${r.revientApresRefus.toFixed(1)} s après` : ''}\n      écran : ${r.ecran.join(' → ')}\n      radio : ${r.radio.join(' | ')}`;
}

/** §7.3 : ce qu'on relève quand il envoie une unité (la BRAV-M) sur un point éloigné. */
export interface EtapeEnvoyer {
  ligne: string;
  /** Appuis sur U avant Entrée. */
  u: number;
  appui: Appui;
  unite: string;
  squadId: number;
  distance: number;
  accuse: number;
  phrase: string;
  mouvement: number;
  /** Opérateurs en selle au moment de l'appui. */
  enSelle: number;
  /** Secondes jusqu'à l'arrivée (la moitié des opérateurs à moins de 30 m du point), −1 : jamais dans la fenêtre. */
  arrive: number;
  /** L'écran a dit « ils finissent à pied ». */
  finitAPied: boolean;
  /** Distance médiane des opérateurs au point à la fin (m), et combien sont à pied. */
  reste: number;
  aPied: number;
  autresOrdres: string[];
  ecran: string[];
  etapes: string[];
}

/**
 * §7.3 — la ligne « Envoyer : … » est affichée (point à 300–400 m) ; il appuie sur U jusqu'à lire l'unité voulue, puis
 * Entrée. Joue `secondes` au plus, s'arrête à l'arrivée. `type` : l'ordre que l'unité doit tenir.
 */
export function etapeEnvoyer(j: Joueur, veut: (u: DirectUnit) => boolean, secondes = 120, autre = false): EtapeEnvoyer | null {
  const ctx = j.ctx;
  let shown = j.direct.ready();
  let u = 0;
  for (; u < 16; u++) {
    const who = shown && shown.who ? shown.who.squadIds : [];
    const unit = who.length === 1 ? j.unite(who[0]!) : null;
    if (shown && unit && veut(unit)) break;
    shown = j.u();
  }
  // (`autre` : la ligne Maj+Entrée — « Envoyer » sans barrer, sur une rue)
  const o = shown && autre ? shown.autre : shown;
  if (!o || !o.who || u >= 16) return null;
  const ligne = autre ? o.text : j.ligne();
  const point = { x: o.x, z: o.z };
  const type = o.orderType;
  const appui = autre ? j.majEntree() : j.entree();
  const id = appui.res.squads[0] ?? o.who.squadIds[0]!;
  const ops = j.agents([id], true);
  const median = (): number => {
    const ds = j.agents([id], true).map((p) => { const q = j.lieu(p); return Math.hypot(q.x - point.x, q.z - point.z); }).sort((a, b) => a - b);
    return ds.length > 0 ? ds[ds.length >> 1]! : Infinity;
  };
  const r: EtapeEnvoyer = {
    ligne, u, appui, unite: j.squad(id).name, squadId: id, distance: o.distance, accuse: -1, phrase: '', mouvement: -1, enSelle: ops.filter((p) => p.vehicleId !== 0).length,
    arrive: -1, finitAPied: false, reste: median(), aPied: 0, autresOrdres: [], ecran: [], etapes: [],
  };
  if (!appui.res.ok) return r;
  const names = new Set(j.lignee([id]).map((q) => j.squad(q).name));
  const start = new Map(j.agents([id]).map((p) => [p.id, j.lieu(p)]));
  for (let k = 0; k < secondes * 4 && r.arrive < 0; k++) {
    j.pas(IMAGE);
    const el = j.now - appui.at;
    if (r.accuse < 0) {
      const m = ctx.radio.log.find((l) => l.t >= appui.at - 1e-6 && names.has(l.from) && (l.reply === true || /re[çc]u/i.test(l.text)));
      if (m) { r.accuse = delaiAccuse(j, appui.at, m.t); r.phrase = m.text; }
    }
    if (r.mouvement < 0) for (const p of j.agents([id])) { const q = j.lieu(p), p0 = start.get(p.id); if (p0 && Math.hypot(q.x - p0.x, q.z - p0.z) > 1) { r.mouvement = el; break; } }
    const ty = j.squad(id).order.type;
    if (type && ty !== type) r.autresOrdres.push(`t+${el.toFixed(1)} s : ${ty}`);
    const tk = j.direct.ticketOf(id);
    const text = tk ? ticketText(tk) : '';
    if (/finissent à pied/.test(text)) r.finitAPied = true;
    const shown = text.replace(/\d+(\u00a0| )?(m|s|min)\b( \d+)?/g, 'N');
    if (shown !== '' && r.ecran[r.ecran.length - 1] !== shown) r.ecran.push(shown);
    const sp = j.cmd.special(id);
    if (sp && r.etapes[r.etapes.length - 1] !== sp.stage) r.etapes.push(sp.stage);
    r.reste = median();
    if (r.reste <= 30) r.arrive = el;
  }
  r.aPied = j.agents([id], true).filter((p) => p.vehicleId === 0).length;
  return r;
}

/** Résumé d'un envoi pour le journal de la recette. */
export function direEnvoyer(r: EtapeEnvoyer): string {
  return `« ${r.ligne} » (${r.u} × U) : ${r.appui.res.ok ? 'accepté' : r.appui.res.ignored ? 'IGNORÉ' : `REFUSÉ (${r.appui.res.text})`} → ${r.unite}, ${r.enSelle} en selle ; accusé ${r.accuse.toFixed(2)} s « ${r.phrase} » ; `
    + `mouvement ${r.mouvement.toFixed(2)} s ; arrivée ${r.arrive < 0 ? `NON (médiane à ${r.reste.toFixed(0)} m, ${r.aPied} à pied)` : `${r.arrive.toFixed(0)} s`}${r.finitAPied ? ' ; « ils finissent à pied »' : ''}`
    + `${r.autresOrdres.length > 0 ? ` ; AUTRE ORDRE ${r.autresOrdres.slice(0, 3).join(' | ')}` : ''} ; étapes ${r.etapes.join(' → ')}\n      écran : ${r.ecran.join(' → ')}`;
}

/** §2.5 : un ordre donné pendant que l'unité est en colonne (caserne, route, stationnement, débarquement). */
export interface EtapeEnColonne {
  etape: string;
  ligne: string;
  appui: Appui;
  unite: string;
  squadId: number;
  /** Agents (hors conducteurs) assis au moment de l'appui. */
  assis: number;
  /** Agents déplacés de plus de 2 m dix secondes après l'appui, à pied ou dans leur fourgon (acceptation 2). */
  bougent: number;
  /** Secondes jusqu'au premier agent à pied en marche vers le point (−1 : aucun). */
  aPied: number;
  /** Secondes jusqu'à « barrée ✓ » (−1 : jamais dans la fenêtre). */
  enPlace: number;
  /** Ce que l'écran a dit de l'unité, sans les nombres, et les ordres qu'elle a tenus. */
  ecran: string[];
  types: string[];
}

/**
 * §2.5 — depuis son siège (ou à pied à la caserne), il tourne la tête jusqu'à lire « Bloquer … · UNITÉ · N m » (pas l'une
 * de `sauf`), Entrée ; puis `secondes` au plus, jusqu'à « barrée ✓ ». null : aucune rue à barrer en vue.
 */
export function etapeEnColonne(j: Joueur, etape: string, sauf: readonly number[] = [], secondes = 150): EtapeEnColonne | null {
  const o = j.chercher((n) => n.rule === 'g' && n.enabled && n.who !== null && n.who.squadIds.length === 1 && !sauf.includes(n.who.squadIds[0]!) && n.distance >= 15 && n.distance <= 150);
  if (!o) return null;
  const ligne = j.ligne();
  const appui = j.entree();
  const r: EtapeEnColonne = { etape, ligne, appui, unite: '', squadId: 0, assis: 0, bougent: -1, aPied: -1, enPlace: -1, ecran: [], types: [] };
  if (!appui.res.ok) return r;
  const id = appui.res.squads[0]!;
  r.squadId = id;
  r.unite = j.squad(id).name;
  const agents = j.agents([id], true);
  r.assis = agents.filter((p) => p.vehicleId !== 0).length;
  const start = new Map(agents.map((p) => [p.id, j.lieu(p)]));
  const d0 = new Map(agents.map((p) => [p.id, Math.hypot(p.x - o.x, p.z - o.z)]));
  for (let k = 0; k < secondes * 4 && (r.enPlace < 0 || k < 44); k++) {
    j.pas(IMAGE);
    const el = j.now - appui.at;
    if (r.bougent < 0 && el >= 10) r.bougent = agents.filter((p) => { const q = j.lieu(p), s0 = start.get(p.id)!; return Math.hypot(q.x - s0.x, q.z - s0.z) > 2; }).length;
    if (r.aPied < 0 && agents.some((p) => p.vehicleId === 0 && d0.get(p.id)! - Math.hypot(p.x - o.x, p.z - o.z) > 2)) r.aPied = el;
    const tk = j.direct.ticketOf(id);
    if (tk) {
      const shown = ticketText(tk).replace(/\d+(\u00a0| )?(m|s|min)\b( \d+)?/g, 'N');
      if (shown !== '' && r.ecran[r.ecran.length - 1] !== shown) r.ecran.push(shown);
      if (r.enPlace < 0 && tk.state === 'en_place' && tk.issuedAt >= appui.at - 1e-6) r.enPlace = el;
    }
    const ty = j.squad(id).order.type;
    if (r.types[r.types.length - 1] !== ty) r.types.push(ty);
  }
  return r;
}

/** Résumé d'un ordre donné en colonne pour le journal de la recette. */
export function direEnColonne(r: EtapeEnColonne): string {
  return `${r.etape} — « ${r.ligne} » → ${r.appui.res.ok ? r.unite : `REFUSÉ (${r.appui.res.text})`} (${r.assis} assis) : bougent à 10 s ${r.bougent} ; premier à pied vers le point ${r.aPied.toFixed(1)} s ; en place ${r.enPlace.toFixed(1)} s ; `
    + `ordres tenus ${r.types.join(' → ')}\n      écran : ${r.ecran.join(' → ')}`;
}

/** Vérifie l'acceptation 2 pour un ordre donné en colonne : pris, dit à l'écran, des agents bougent, ils y vont à pied. */
export function verifierPrisEnColonne(o: EtapeEnColonne): void {
  expect(o.ligne, o.etape).toMatch(/^Bloquer .+ · .+ · \d+\u00a0m$/);
  expect(o.appui.res.ok, `${o.etape} : ${o.appui.res.text}`).toBe(true);
  // acceptation 2 : dix secondes après l'ordre, des agents bougent (jamais zéro), et ils vont au point à pied
  expect(o.bougent, `${o.etape} : agents en mouvement à 10 s`).toBeGreaterThan(0);
  expect(o.aPied, `${o.etape} : premier agent à pied vers le point`).toBeGreaterThanOrEqual(0);
  // §2.5 : l'écran dit ce que l'unité finit
  expect(o.ecran.some((t) => /descend des fourgons|à l’arrivée|en fourgons|en route|se garent|reçu/.test(t)), `${o.etape} : ${o.ecran.join(' → ')}`).toBe(true);
}

/** Vérifie que l'ordre donné en colonne va au bout : « barrée ✓ », l'ordre du joueur jamais remplacé. */
export function verifierFaitEnColonne(o: EtapeEnColonne): void {
  expect(o.enPlace, `${o.etape} : barrage en place (${o.ecran.slice(-2).join(' → ')})`).toBeGreaterThanOrEqual(0);
  expect(o.ecran[o.ecran.length - 1], o.etape).toMatch(/barrée? ✓$/);
  // l'ordre du joueur n'est pas remplacé par le « débarquez » de la colonne
  expect(o.types[o.types.length - 1], `${o.etape} : ${o.types.join(' → ')}`).toBe('couper_circulation');
}

/** Vérifie §2.5 et l'acceptation 2 pour un ordre donné en colonne. */
export function verifierEnColonne(o: EtapeEnColonne): void {
  verifierPrisEnColonne(o);
  verifierFaitEnColonne(o);
}

/** Acceptation 9 : ce qu'on relève d'un verbe donné à une unité (la BRAV-M). */
export interface EtapeVerbe {
  verbe: string;
  appui: Appui;
  /** Ordre attendu (Squad.order.type), accusé à la radio (s), premier mouvement (s), agents en selle à l'appui. */
  type: string;
  accuse: number;
  phrase: string;
  mouvement: number;
  enSelle: number;
  /** Échantillons où l'unité ne tenait pas l'ordre donné, pendant `secondes`. */
  autresOrdres: string[];
  /** Ce que l'unité a dit à la radio pendant ces secondes. */
  radio: string[];
}

/** Après un appui (Entrée, A, roue) adressé à `id` : `secondes` de jeu, l'accusé, le premier mouvement, l'ordre tenu. */
export function etapeVerbe(j: Joueur, verbe: string, appui: Appui, id: number, type: string | readonly string[], secondes = 8): EtapeVerbe {
  const ctx = j.ctx;
  const types = typeof type === 'string' ? [type] : type;
  const names = new Set(j.lignee([id]).map((q) => j.squad(q).name));
  const start = new Map(j.agents([id]).map((p) => [p.id, j.lieu(p)]));
  const r: EtapeVerbe = { verbe, appui, type: types.join('|'), accuse: -1, phrase: '', mouvement: -1, enSelle: j.agents([id], true).filter((p) => p.vehicleId !== 0).length, autresOrdres: [], radio: [] };
  if (!appui.res.ok) return r;
  for (let k = 0; k < secondes * 4; k++) {
    j.pas(IMAGE);
    const el = j.now - appui.at;
    if (r.accuse < 0) {
      const m = ctx.radio.log.find((l) => l.t >= appui.at - 1e-6 && names.has(l.from) && (l.reply === true || /re[çc]u/i.test(l.text)));
      if (m) { r.accuse = delaiAccuse(j, appui.at, m.t); r.phrase = m.text; }
    }
    if (r.mouvement < 0) for (const p of j.agents([id])) { const q = j.lieu(p), p0 = start.get(p.id); if (p0 && Math.hypot(q.x - p0.x, q.z - p0.z) > 1) { r.mouvement = el; break; } }
    const ty = j.squad(id).order.type;
    if (!types.includes(ty)) r.autresOrdres.push(`t+${el.toFixed(1)} s : ${ty}`);
  }
  r.radio = ctx.radio.log.filter((l) => l.t >= appui.at - 1e-6 && (names.has(l.from) || l.silent === true)).map((l) => `${(l.t - appui.at).toFixed(2)} s ${l.from}${l.silent ? ' (écrit)' : ''} : ${l.text.slice(0, 90)}`);
  return r;
}

/** Résumé d'un verbe pour le journal de la recette. */
export function direVerbe(r: EtapeVerbe): string {
  return `${r.verbe} (${r.appui.touche}) « ${r.appui.ligne} » : ${r.appui.res.ok ? 'accepté' : r.appui.res.ignored ? 'IGNORÉ' : `REFUSÉ (${r.appui.res.text})`} ; accusé ${r.accuse.toFixed(2)} s « ${r.phrase.slice(0, 80)} » ; `
    + `mouvement ${r.mouvement.toFixed(2)} s (${r.enSelle} en selle) ; ordre attendu ${r.type}${r.autresOrdres.length > 0 ? ` ; AUTRE ORDRE ${r.autresOrdres.slice(0, 3).join(' | ')}` : ''}\n      radio : ${r.radio.join(' | ')}`;
}

/** Phrases du tableau des refus (§4.2, §4.3), celles dont le texte varie comprises. */
export function phraseDuTableau(text: string): boolean {
  const fixed: string[] = [
    ...Object.values(CAP_REFUSALS), ...Object.values(SECTOR_REFUS), REFUS.encercler, REFUS.noCentaure, REFUS.tropLoin, REFUS.lecture, REFUS.equipage, REFUS.personne, REFUS.rien,
    REFUS.constater, REFUS.centaureAutre, REFUS.canonAutre, REFUS.autreEngin,
  ];
  if (fixed.includes(text)) return true;
  for (const verb of ['charge', 'gaz', 'bond', 'disperser'] as const) if (text === refusForce(verb, true) || text === refusForce(verb, false)) return true;
  if (/^Disperser : il faut d’abord les 3 sommations \(avertissements à la foule\)\. Appuyez encore : .+ se met en ligne et je les fais faire\.$/.test(text)) return true;
  if (/^Toute la BRAV-M est déjà sur des interpellations \(\d+ en cours\)\. Envoyez une section\.$/.test(text)) return true;
  return false;
}

/** Un manifestant libre, à pied, vu du joueur (ligne de vue), entre `min` et `max` mètres — le plus proche. */
export function manifestantEnVue(j: Joueur, min: number, max: number): Person | null {
  const me = j.moi;
  let best: Person | null = null;
  let bd = Infinity;
  for (const p of j.ctx.people.list) {
    if (p.faction !== 'protest' || p.custody !== 'free' || p.vehicleId !== 0 || p.posture === 'down' || p.dormant) continue;
    const d = Math.hypot(p.x - me.x, p.z - me.z);
    if (d < min || d > max || d >= bd) continue;
    if (!j.ctx.world.lineOfSight(me.x, me.z, p.x, p.z)) continue;
    bd = d;
    best = p;
  }
  return best;
}

/** Ce que le monde fait, pas le joueur : ce manifestant lance un projectile, des agents le voient (fait constaté). */
export function jetConstate(j: Joueur, p: Person): void {
  j.ctx.law.recordOffense(p, 'jet_projectile', p.x, p.z, 3).witnessed = true;
}

/** Vérifie les relevés permanents du robot (acceptations 3, 5, 10) ; à appeler à la fin d'un scénario. */
export function releves(j: Joueur): void {
  expect(j.lectures, 'jamais « SANS ORDRE », « MONTE », « DESCEND », « EN FILE » pour une unité sous ses ordres').toEqual([]);
  expect(j.refusHorsTableau(), 'refus hors du tableau §4.3').toEqual([]);
  expect(j.motifsInconnus, 'motif de refus de la simulation sans mots pour le joueur').toEqual([]);
}

export type { Ticket };
