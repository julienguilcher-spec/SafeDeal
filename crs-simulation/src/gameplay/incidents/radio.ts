/* =====================================================================================
 * INCIDENTS — annonces et comptes rendus radio.
 *
 * Les incidents urgents sont annoncés (par l'unité la plus proche si elle voit la scène, sinon par
 * la salle), une aggravation faute de moyen est signalée une fois, la clôture donne lieu à un compte
 * rendu. Si la bibliothèque de phrases du module radio est branchée (service « radio.phrases »),
 * elle fournit le texte et la phraséologie ; sinon des textes de repli équivalents sont dits par
 * ctx.radio.say. Une annonce au plus toutes les 3,5 s : les autres attendent dans une petite file.
 * ===================================================================================== */

import type { GameContext, RadioChannel, Squad } from '@/core/contracts';
import type { RadioPhrases } from '@/gameplay/radio/api';
import type { Entry } from './entry';
import { spokenGravity, spokenType } from './labels';
import { FAM_FIRE, FAM_MOTORIST, FAM_OFFICER, FAM_VICTIM, RADIO_GAP } from './tuning';

const MSG_OPEN = 0;
const MSG_WORSE = 1;
const MSG_DONE = 2;
const MSG_LAPSED = 3;

interface Pending {
  type: number;
  entry: Entry;
  squadId: number;
}

const QUEUE_MAX = 12;
/**
 * Même nature d'incident annoncée (ou portée au compte rendu) par la salle dans le même secteur : on ne la redit pas
 * avant tant de secondes, à moins de tant de mètres de la précédente (le réseau du commandement était saturé de
 * « URGENT. Automobiliste bloqué… », un par voiture prise dans la circulation autour de la colonne et de la foule, et
 * les comptes rendus des unités attendaient derrière jusqu'à être abandonnés). Seulement pour les messages de
 * quietable.
 */
const KIND_QUIET = 120;
const KIND_QUIET_DIST = 500;

/**
 * Messages que la salle peut taire s'ils redisent ce qui vient d'être dit (voir KIND_QUIET) : les automobilistes bloqués
 * (un par voiture prise dans la circulation) et les clôtures sans traitement. Un feu, un agent isolé ou à terre, un
 * blessé, des secours bloqués restent toujours annoncés : chacun demande son moyen.
 */
function quietable(type: number, family: number): boolean {
  if (family === FAM_OFFICER || family === FAM_VICTIM) return false;
  return type === MSG_LAPSED || family === FAM_MOTORIST;
}

export class RadioDesk {
  enabled = true;
  private readonly queue: Pending[] = [];
  private nextAt = 0;
  private phrases: RadioPhrases | undefined;
  /** Dernière annonce de la salle par type de message et nature d'incident (voir KIND_QUIET). */
  private readonly lastKind = new Map<string, { t: number; x: number; z: number }>();

  constructor(private readonly ctx: GameContext) {}

  reset(): void {
    this.queue.length = 0;
    this.nextAt = 0;
    this.lastKind.clear();
    this.phrases = this.ctx.service<RadioPhrases>('radio.phrases');
  }

  announce(e: Entry): void {
    this.push(MSG_OPEN, e, 0);
  }

  worse(e: Entry): void {
    this.push(MSG_WORSE, e, 0);
  }

  /** Compte rendu de clôture par l'unité qui a traité (squadId), ou constat de la salle (0). */
  closed(e: Entry, squadId: number, treated: boolean): void {
    this.push(treated ? MSG_DONE : MSG_LAPSED, e, squadId);
  }

  private push(type: number, entry: Entry, squadId: number): void {
    if (!this.enabled) return;
    const q = this.queue;
    for (let i = 0; i < q.length; i++) if (q[i].type === type && q[i].entry === entry) return;
    if (q.length >= QUEUE_MAX) q.shift();
    q.push({ type, entry, squadId });
  }

  update(now: number): void {
    if (this.queue.length === 0 || now < this.nextAt) return;
    const m = this.queue.shift()!;
    const e = m.entry;
    // une annonce d'ouverture ou d'aggravation n'a plus d'objet si l'incident est clos entre-temps
    if ((m.type === MSG_OPEN || m.type === MSG_WORSE) && !e.active) return;
    // (même nature, même secteur, il y a peu : déjà dit — voir KIND_QUIET ; un compte rendu d'unité passe toujours)
    if (m.type !== MSG_DONE && quietable(m.type, e.family)) {
      const key = `${m.type}:${e.kind}`;
      const last = this.lastKind.get(key);
      if (last && now - last.t < KIND_QUIET && Math.hypot(e.x - last.x, e.z - last.z) < KIND_QUIET_DIST) return;
      this.lastKind.set(key, { t: now, x: e.x, z: e.z });
    }
    this.nextAt = now + RADIO_GAP;
    if (!this.phrases) this.phrases = this.ctx.service<RadioPhrases>('radio.phrases');
    switch (m.type) {
      case MSG_OPEN: this.sayOpen(e); break;
      case MSG_WORSE: this.sayWorse(e); break;
      case MSG_DONE: this.sayDone(e, m.squadId); break;
      default: this.sayLapsed(e); break;
    }
  }

  // ───────────────────────────── qui parle ─────────────────────────────

  /** Unité de police dont le chef est assez près pour voir la scène (60 m), la plus proche d'abord. */
  private witness(e: Entry): Squad | null {
    const ctx = this.ctx;
    const squads = ctx.squads.list;
    let best: Squad | null = null;
    let bestD = 60 * 60;
    for (let i = 0; i < squads.length; i++) {
      const s = squads[i];
      if (s.faction !== 'police' || s.leaderId === 0) continue;
      const lead = ctx.people.get(s.leaderId);
      if (!lead || lead.dormant) continue;
      const dx = lead.x - e.x;
      const dz = lead.z - e.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  }

  private commander(): string {
    const book = this.ctx.service<{ commandant: string }>('radio.callsigns');
    return book && book.commandant ? book.commandant : 'MISTRAL';
  }

  private say(channel: RadioChannel, from: string, text: string, priority: 0 | 1 | 2, personId = 0): void {
    this.ctx.radio.say(personId !== 0 ? { channel, from, text, priority, personId } : { channel, from, text, priority });
  }

  // ───────────────────────────── textes ─────────────────────────────

  private openKey(e: Entry): string {
    switch (e.kind) {
      case 'feu_poubelle':
      case 'feu_barricade':
      case 'feu_vehicule':
      case 'feu_boutique':
        return e.reignition ? 'incident_feu_reprise' : 'incident_feu';
      case 'blesse': return 'incident_blesse';
      case 'agent_a_terre': return 'agent_a_terre';
      case 'agent_isole': return 'agent_isole';
      case 'pillage': return 'incident_pillage';
      case 'barricade': return 'incident_barricade';
      case 'automobiliste_bloque': return 'incident_automobiliste';
      case 'secours_bloques': return 'incident_secours_bloques';
      case 'suspect': return 'incident_suspect';
      default: return '';
    }
  }

  private sayOpen(e: Entry): void {
    const ctx = this.ctx;
    const unit = this.witness(e);
    const urgent = e.urgency >= 2;
    const key = this.openKey(e);
    const phrases = this.phrases;
    if (unit && phrases && key !== '' && phrases.has(key)) {
      const ok = phrases.say(key, { type: spokenType(e), gravite: spokenGravity(e), lieu: e.sector || null }, {
        squad: unit, at: e, priority: urgent ? 2 : 1,
      });
      if (ok) return;
    }
    const where = e.sector !== '' ? `, ${e.sector}` : '';
    const what = `${e.labelBase}${where}`;
    if (unit) {
      const lead = ctx.people.get(unit.leaderId);
      this.say('commandement', unit.name, `CENTRAL ICI ${unit.name.toUpperCase()}. ${urgent ? 'URGENT. ' : ''}${what}. ${this.need(e)} PARLEZ.`,
        urgent ? 2 : 1, lead ? lead.id : 0);
    } else {
      this.say('commandement', 'CENTRAL', `${this.commander()} ICI CENTRAL. ${urgent ? 'URGENT. ' : ''}${what}. ${this.need(e)} PARLEZ.`, urgent ? 2 : 1);
    }
  }

  /** Ce que l'incident demande, en une phrase. */
  private need(e: Entry): string {
    if (e.family === FAM_FIRE) return 'Je demande un moyen d’extinction.';
    if (e.family === FAM_VICTIM) return 'Équipe à désigner pour le prendre en charge.';
    if (e.family === FAM_OFFICER) return 'Il faut le dégager sans délai.';
    switch (e.kind) {
      case 'agent_isole': return 'Il faut le rejoindre sans délai.';
      case 'pillage': return 'Unité à désigner.';
      case 'barricade': return 'Obstacle à dégager.';
      case 'automobiliste_bloque': return 'Je demande une unité pour le dégager.';
      case 'secours_bloques': return 'Il faut leur ouvrir un couloir et les protéger.';
      default: return 'Unité à désigner.';
    }
  }

  private sayWorse(e: Entry): void {
    const phrases = this.phrases;
    if (phrases && phrases.has('incident_aggrave')
      && phrases.say('incident_aggrave', { type: spokenType(e), lieu: e.sector || null }, { at: e, priority: 2 })) return;
    const where = e.sector !== '' ? ` du secteur ${e.sector}` : '';
    this.say('commandement', 'CENTRAL', `${this.commander()} ICI CENTRAL. URGENT. L’incident${where} s’aggrave. Nature : ${spokenType(e)}. `
      + `${e.means === '' ? 'Aucun moyen n’est encore engagé.' : 'Le moyen engagé ne suffit pas.'} PARLEZ.`, 2);
  }

  private sayDone(e: Entry, squadId: number): void {
    const ctx = this.ctx;
    const squad = squadId !== 0 ? ctx.squads.get(squadId) : undefined;
    const phrases = this.phrases;
    if (squad) {
      if (phrases && phrases.has('incident_traite')
        && phrases.say('incident_traite', { type: spokenType(e), lieu: e.sector || null }, { squad, at: e })) return;
      const where = e.sector !== '' ? `, ${e.sector}` : '';
      this.say('unite', squad.name, `${this.commander()} ICI ${squad.name.toUpperCase()}. Incident traité${where}. Nature : ${spokenType(e)}. `
        + 'Je reprends ma mission. PARLEZ.', 1, squad.leaderId);
      return;
    }
    const where = e.sector !== '' ? `, ${e.sector}` : '';
    this.say('commandement', 'CENTRAL', `${this.commander()} ICI CENTRAL. Incident clos${where}. Nature : ${spokenType(e)}. Traité. TERMINÉ.`, 1);
  }

  private sayLapsed(e: Entry): void {
    const phrases = this.phrases;
    if (phrases && phrases.has('incident_echec')
      && phrases.say('incident_echec', { type: spokenType(e), lieu: e.sector || null }, { at: e })) return;
    const where = e.sector !== '' ? `, ${e.sector}` : '';
    this.say('commandement', 'CENTRAL', `${this.commander()} ICI CENTRAL. Incident clos sans traitement${where}. Nature : ${spokenType(e)}. `
      + 'Je le porte au compte rendu. TERMINÉ.', 1);
  }
}
