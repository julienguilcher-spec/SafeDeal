/* =====================================================================================
 * Droit — dossier de la session (service 'law.records') : ce que relira l'inspection.
 *
 * Tout y est horodaté : sommations, autorisations, chaque emploi de la force avec son verdict,
 * interpellations (motif, preuves, régularité), contrôles, plaintes probables. Le score de
 * régularité (0..100) et la suite disciplinaire encourue (échelle de l'article L. 533-1 du code
 * général de la fonction publique) s'en déduisent ; summary() produit le texte du compte rendu.
 * ===================================================================================== */

import type { EntityId, ForceMeans, ForceVerdictKind, Person } from '@/core/contracts';
import type {
  ArrestRecord, AuthorizationRecord, ComplaintKind, ComplaintRecord, ControlRecord, ForceRecord, LawRecords,
  LawStats, SanctionLevel, SommationRecord,
} from './api';
import { MEANS_SHORT, STAGE_NAMES, VERDICT_LABELS, clockText, offenseLabel } from './texts';

/** Points retirés au score de régularité pour une faute d'emploi de la force, selon sa gravité (0..5). */
const FORCE_PENALTY: readonly number[] = [0, 3, 6, 12, 20, 32];
const PENALTY_UNFOUNDED_ARREST = 12;
const PENALTY_PROTECTED_ARREST = 18;
const PENALTY_UNJUSTIFIED_CUFFS = 3;
const PENALTY_UNJUSTIFIED_CONTROL = 2;
const PENALTY_CONTROLS_MAX = 10;
const PENALTY_UNJUSTIFIED_SOMMATION = 10;
const PENALTY_INAUDIBLE_SOMMATION = 4;

const SANCTIONS: readonly SanctionLevel[] = ['aucune', 'avertissement', 'blame', 'exclusion', 'retrogradation', 'revocation'];

const SANCTION_TEXT: Readonly<Record<SanctionLevel, string>> = {
  aucune: 'aucune suite disciplinaire à prévoir',
  avertissement: 'avertissement encouru (sanction du premier groupe)',
  blame: 'blâme encouru (sanction du premier groupe)',
  exclusion: 'exclusion temporaire de fonctions encourue, après avis du conseil de discipline',
  retrogradation: 'rétrogradation au grade inférieur encourue (sanction du troisième groupe)',
  revocation: 'révocation encourue (sanction du quatrième groupe)',
};

const VERDICT_KINDS: readonly ForceVerdictKind[] = [
  'licite', 'disproportionne', 'sans_sommation', 'non_autorise', 'cible_illegitime', 'interdit',
];
const MEANS: readonly ForceMeans[] = [
  'presence', 'contact', 'baton', 'gazeuse', 'lacrymo', 'canon_eau', 'gm2l', 'desencerclement', 'lbd', 'arme_feu', 'vehicule',
];

/** Nombre maximal de lignes de détail par rubrique du résumé. */
const SUMMARY_LINES = 8;

function plural(n: number, one: string, many: string): string {
  return n + ' ' + (n > 1 ? many : one);
}

export class Records implements LawRecords {
  readonly sommations: SommationRecord[] = [];
  readonly autorisations: AuthorizationRecord[] = [];
  readonly forces: ForceRecord[] = [];
  readonly interpellations: ArrestRecord[] = [];
  readonly controles: ControlRecord[] = [];
  readonly plaintes: ComplaintRecord[] = [];
  lastRefusal = '';

  /** Dossiers d'interpellation en cours, par personne retenue. */
  readonly open = new Map<EntityId, ArrestRecord>();

  reset(): void {
    this.sommations.length = 0;
    this.autorisations.length = 0;
    this.forces.length = 0;
    this.interpellations.length = 0;
    this.controles.length = 0;
    this.plaintes.length = 0;
    this.open.clear();
    this.lastRefusal = '';
  }

  get score(): number {
    return this.stats().score;
  }

  arrestOf(personId: EntityId): ArrestRecord | null {
    return this.open.get(personId) ?? null;
  }

  /** Dernière interpellation (close ou non) d'une personne. */
  lastArrestOf(personId: EntityId): ArrestRecord | null {
    const list = this.interpellations;
    for (let i = list.length - 1; i >= 0; i--) if (list[i]!.targetId === personId) return list[i]!;
    return null;
  }

  /** Ajoute une plainte probable (une seule par plaignant et par nature ; la plus grave est conservée). */
  addComplaint(
    t: number, kind: ComplaintKind, person: Person, againstId: EntityId, text: string, severity: number, filmed: boolean,
  ): void {
    const list = this.plaintes;
    for (let i = 0; i < list.length; i++) {
      const c = list[i]!;
      if (c.personId !== person.id || c.kind !== kind) continue;
      if (severity > c.severity) {
        c.severity = severity;
        c.text = text;
        c.againstId = againstId;
        c.t = t;
      }
      if (filmed) c.filmed = true;
      return;
    }
    list.push({ t, kind, personId: person.id, personName: person.name, againstId, text, severity, filmed });
  }

  stats(byId: EntityId = 0): LawStats {
    const all = byId === 0;
    const byVerdict = { licite: 0, disproportionne: 0, sans_sommation: 0, non_autorise: 0, cible_illegitime: 0, interdit: 0 };
    const byMeans = {
      presence: 0, contact: 0, baton: 0, gazeuse: 0, lacrymo: 0, canon_eau: 0, gm2l: 0, desencerclement: 0, lbd: 0, arme_feu: 0, vehicule: 0,
    };
    let penalty = 0;
    let forces = 0;
    let faults = 0;
    let filmedFaults = 0;
    let worst = 0;
    let worstFilmed = false;
    let heavy = 0;
    let firearm = false;

    const fl = this.forces;
    for (let i = 0; i < fl.length; i++) {
      const r = fl[i]!;
      if (!all && r.byId !== byId) continue;
      byMeans[r.means]++;
      if (r.means === 'presence') continue;
      forces++;
      byVerdict[r.verdict.kind]++;
      if (r.means === 'arme_feu') firearm = true;
      if (r.verdict.kind === 'licite') continue;
      faults++;
      const sev = r.verdict.severity < 0 ? 0 : r.verdict.severity > 5 ? 5 : Math.round(r.verdict.severity);
      penalty += FORCE_PENALTY[sev]!;
      if (r.filmed) filmedFaults++;
      if (sev > worst || (sev === worst && r.filmed && !worstFilmed)) {
        worst = sev;
        worstFilmed = r.filmed;
      }
      if (sev >= 5) heavy++;
    }

    let sommations = 0;
    const sl = this.sommations;
    for (let i = 0; i < sl.length; i++) {
      const s = sl[i]!;
      if (!all && s.byId !== byId) continue;
      sommations++;
      // le constat de l'attroupement se juge une fois, à l'annonce
      if (!s.justified && s.stage === 1) penalty += PENALTY_UNJUSTIFIED_SOMMATION;
      if (s.note !== '') penalty += PENALTY_INAUDIBLE_SOMMATION;
    }

    let arrests = 0;
    let founded = 0;
    let handedOver = 0;
    let released = 0;
    let escaped = 0;
    const al = this.interpellations;
    for (let i = 0; i < al.length; i++) {
      const a = al[i]!;
      if (!all && a.byId !== byId) continue;
      arrests++;
      if (a.founded) {
        founded++;
      } else {
        let p = a.protectedTarget !== '' ? PENALTY_PROTECTED_ARREST : PENALTY_UNFOUNDED_ARREST;
        // une remise en liberté rapide limite le préjudice
        if (a.status === 'relache') p *= 0.5;
        penalty += p;
      }
      if (a.cuffed && !a.cuffJustified) penalty += PENALTY_UNJUSTIFIED_CUFFS;
      if (a.status === 'remis') handedOver++;
      else if (a.status === 'relache') released++;
      else if (a.status === 'evade') escaped++;
    }

    let controls = 0;
    let unjustified = 0;
    const cl = this.controles;
    for (let i = 0; i < cl.length; i++) {
      const c = cl[i]!;
      if (!all && c.byId !== byId) continue;
      controls++;
      if (!c.justified) unjustified++;
    }
    penalty += Math.min(PENALTY_CONTROLS_MAX, unjustified * PENALTY_UNJUSTIFIED_CONTROL);

    let complaints = 0;
    const pl = this.plaintes;
    for (let i = 0; i < pl.length; i++) if (all || pl[i]!.againstId === byId) complaints++;

    let score = Math.round(100 - penalty);
    if (score < 0) score = 0;

    // suite disciplinaire : la plus lourde entre la gravité de la pire faute et l'accumulation
    let sevLevel = worst >= 5 ? 4 : worst === 4 ? 3 : worst === 3 ? 2 : worst >= 1 ? 1 : 0;
    if (worst >= 5 && (worstFilmed || heavy >= 2)) sevLevel = 5;
    const scoreLevel = score >= 90 ? 0 : score >= 80 ? 1 : score >= 65 ? 2 : score >= 45 ? 3 : score >= 25 ? 4 : 5;
    const sanction = SANCTIONS[sevLevel > scoreLevel ? sevLevel : scoreLevel]!;
    const inquiry = firearm || worst >= 5 || (worst >= 4 && worstFilmed);

    return {
      sommations, forces, faults, filmedFaults, worstSeverity: worst, byVerdict, byMeans,
      arrests, founded, unfounded: arrests - founded, handedOver, released, escaped,
      controls, unjustifiedControls: unjustified, complaints, score, sanction, inquiry,
    };
  }

  summary(byId: EntityId = 0): string {
    const all = byId === 0;
    const st = this.stats(byId);
    const out: string[] = [];
    out.push("CADRE LÉGAL ET EMPLOI DE LA FORCE — COMPTE RENDU");

    // sommations
    const sl = this.sommations;
    if (st.sommations === 0) {
      out.push('Sommations : aucune sommation prononcée.');
    } else {
      out.push('Sommations :');
      for (let i = 0; i < sl.length; i++) {
        const s = sl[i]!;
        if (!all && s.byId !== byId) continue;
        const name = s.reiteration ? 'dernière sommation réitérée' : STAGE_NAMES[s.stage]!;
        const how = s.means === 'megaphone' ? 'au mégaphone' : s.means === 'vehicule' ? 'par la sonorisation du véhicule' : 'à la voix';
        let line = '  ' + clockText(s.t) + ' — ' + name + ' par ' + s.byName + ', ' + how + (s.flare ? ' avec fusée rouge' : '') + ' (' + s.sector + ')';
        if (!s.justified && s.stage === 1) line += ' — attroupement non caractérisé (cortège calme)';
        if (s.note !== '') line += ' — ' + s.note;
        out.push(line + '.');
      }
    }

    // autorisations
    const au = this.autorisations;
    if (au.length > 0 && all) {
      const last = au[au.length - 1]!;
      out.push('Autorisations : ' + plural(au.length, 'ordre tracé', 'ordres tracés') + ' ; dernier niveau autorisé : ' + last.level + ' à ' + clockText(last.t) + '.');
    }

    // emploi de la force
    if (st.forces === 0) {
      out.push('Emploi de la force : aucun acte de force enregistré.');
    } else {
      let line = 'Emploi de la force : ' + plural(st.forces, 'acte enregistré', 'actes enregistrés') + ', dont ' + plural(st.byVerdict.licite, 'licite', 'licites');
      if (st.faults > 0) {
        line += ' et ' + plural(st.faults, 'faute', 'fautes');
        if (st.filmedFaults > 0) line += ' (' + plural(st.filmedFaults, 'filmée', 'filmées') + ' par des tiers)';
      }
      out.push(line + '.');
      let means = '';
      for (let i = 0; i < MEANS.length; i++) {
        const m = MEANS[i]!;
        if (m === 'presence' || st.byMeans[m] === 0) continue;
        means += (means === '' ? '' : ', ') + MEANS_SHORT[m] + ' × ' + st.byMeans[m];
      }
      if (means !== '') out.push('  Moyens employés : ' + means + '.');
      if (st.faults > 0) {
        let kinds = '';
        for (let i = 1; i < VERDICT_KINDS.length; i++) {
          const kind = VERDICT_KINDS[i]!;
          if (st.byVerdict[kind] === 0) continue;
          kinds += (kinds === '' ? '' : ', ') + VERDICT_LABELS[kind] + ' × ' + st.byVerdict[kind];
        }
        out.push('  Fautes par nature : ' + kinds + '.');
        // les plus graves d'abord
        const faults: ForceRecord[] = [];
        const fl = this.forces;
        for (let i = 0; i < fl.length; i++) {
          const r = fl[i]!;
          if ((all || r.byId === byId) && r.means !== 'presence' && r.verdict.kind !== 'licite') faults.push(r);
        }
        faults.sort((a, b) => b.verdict.severity - a.verdict.severity || a.t - b.t);
        const shown = Math.min(SUMMARY_LINES, faults.length);
        for (let i = 0; i < shown; i++) {
          const r = faults[i]!;
          out.push(
            '  ' + clockText(r.t) + ' — ' + MEANS_SHORT[r.means] + ' : ' + VERDICT_LABELS[r.verdict.kind] + ' (gravité ' + r.verdict.severity +
            (r.filmed ? ', filmé' : (r.cameras !== 0 ? ', enregistré par les forces' : ', non filmé')) + '). ' + r.verdict.reason,
          );
        }
        if (faults.length > shown) out.push('  … et ' + plural(faults.length - shown, 'autre faute', 'autres fautes') + '.');
      }
    }

    // interpellations
    if (st.arrests === 0) {
      out.push('Interpellations : aucune.');
    } else {
      out.push(
        'Interpellations : ' + st.arrests + ' — ' + plural(st.founded, 'fondée', 'fondées') + ', ' + plural(st.unfounded, 'infondée', 'infondées') +
        ' ; ' + plural(st.handedOver, 'remise', 'remises') + " à l'officier de police judiciaire, " + plural(st.released, 'remise en liberté', 'remises en liberté') +
        (st.escaped > 0 ? ', ' + plural(st.escaped, 'évasion', 'évasions') : '') + '.',
      );
      const al = this.interpellations;
      let shown = 0;
      for (let i = 0; i < al.length && shown < SUMMARY_LINES; i++) {
        const a = al[i]!;
        if (!all && a.byId !== byId) continue;
        shown++;
        const proof = a.filmed && a.witnessed ? 'constaté et filmé' : a.filmed ? 'filmé' : a.witnessed ? 'constaté par un agent, sans image' : 'aucune preuve';
        const status = a.status === 'remis' ? 'remis' : a.status === 'relache' ? 'remis en liberté' : a.status === 'evade' ? 'évadé'
          : a.status === 'interrompu' ? 'procédure interrompue' : 'procédure en cours';
        let line = '  ' + clockText(a.t) + ' — ' + a.targetName + ' par ' + a.byName + ' : ';
        line += a.motif ? offenseLabel(a.motif) + ' (' + proof + ')' : 'aucun fait rattaché';
        line += ' — ' + status + ', procédure ' + a.strength;
        if (a.notes.length > 0) line += ' ; ' + a.notes.join(' ; ');
        out.push(line + '.');
      }
    }

    // contrôles
    if (st.controls > 0) {
      out.push(
        "Contrôles d'identité : " + st.controls + (st.unjustifiedControls > 0 ? ', dont ' + st.unjustifiedControls + ' sans motif légal' : ', tous motivés') + '.',
      );
    }

    // plaintes
    if (st.complaints === 0) {
      out.push('Plaintes ou signalements probables : aucun.');
    } else {
      out.push('Plaintes ou signalements probables : ' + st.complaints + '.');
      const pl = this.plaintes;
      let shown = 0;
      for (let i = 0; i < pl.length && shown < SUMMARY_LINES; i++) {
        const c = pl[i]!;
        if (!all && c.againstId !== byId) continue;
        shown++;
        out.push('  ' + clockText(c.t) + ' — ' + c.personName + ' : ' + c.text + (c.filmed ? ' (images à l\'appui)' : ' (sans image)') + '.');
      }
    }

    // appréciation
    const verdict = st.score >= 90 ? 'conduite conforme au droit' : st.score >= 75 ? 'conduite globalement régulière, des écarts à corriger'
      : st.score >= 55 ? 'manquements sérieux' : st.score >= 35 ? 'manquements graves et répétés' : 'conduite incompatible avec les fonctions';
    out.push('Score de régularité : ' + st.score + ' / 100 — ' + verdict + ' ; ' + SANCTION_TEXT[st.sanction] + '.');
    if (st.inquiry) out.push("Une enquête de l'inspection générale est à prévoir.");
    return out.join('\n');
  }
}
