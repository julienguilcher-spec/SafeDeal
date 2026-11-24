// Chaîne légale (« Faire les étapes dans l'ordre ») : horloge et droit factices. Les 3 sommations espacées par le délai
// légal, puis l'autorisation, puis UN seul ordre ; arrêt sur refus avec le motif ; annulation ; officier sur place
// (salle de commandement, ou joueur sans insigne) ; personne pour sommer ; chef de groupe au-dessus de son plafond.
import { describe, expect, it } from 'vitest';

import type { ForceLevel } from '@/core/contracts';
import type { CardLine, LegalPlan, Repere } from '@/ui/command/cardTypes';
import { ABOVE_CEILING, BEFORE_LAST_WARNING, LegalChain, legalPlan, legalSteps, plainRefusal } from '@/ui/command/legalChain';
import type { LegalDeps, LegalScope } from '@/ui/command/legalChain';
import { verbOf } from '@/ui/command/orders';

const INSIGNE = 'Insigne non porté : ceignez l’écharpe ou le brassard tricolore avant de sommer (art. R. 211-12 du code de la sécurité intérieure). Sans insigne, les sommations sont nulles.';

/** Droit factice : délais entre étapes, délai après la dernière sommation, insigne, autorisation. */
class FakeLaw {
  now = 0;
  done = 0;
  at = -1e9;
  delay = 20;
  forceDelay = 10;
  authorised: ForceLevel = 1;
  insignia = true;
  canAuthorize = true;
  officer = true;
  officerLag = 6;
  officerAsked = -1;
  readonly log: string[] = [];

  wait(): number {
    return this.done === 0 || this.done >= 3 ? 0 : Math.max(0, this.delay - (this.now - this.at));
  }

  refusal(): string {
    if (!this.insignia) return INSIGNE;
    const w = this.wait();
    return w > 0 ? `Délai insuffisant : la foule doit avoir le temps de se disperser. La sommation sera possible dans ${Math.ceil(w)} s.` : '';
  }

  pronounce(): void {
    this.done++;
    this.at = this.now;
  }

  /** Pas de temps : l'officier envoyé prononce l'étape après son trajet. */
  advance(dt: number): void {
    this.now += dt;
    if (this.officerAsked >= 0 && this.now - this.officerAsked >= this.officerLag && this.wait() === 0) {
      this.officerAsked = -1;
      this.pronounce();
      this.log.push(`officier:${this.done}@${Math.round(this.now)}`);
    }
  }

  deps(): LegalDeps {
    return {
      sommation: () => {
        if (this.refusal() !== '') return false;
        this.pronounce();
        this.log.push(`sommation:${this.done}@${Math.round(this.now)}`);
        return true;
      },
      requestSommation: () => {
        if (!this.officer) return false;
        this.officerAsked = this.now;
        this.log.push(`demande:${this.done + 1}@${Math.round(this.now)}`);
        return true;
      },
      sommationWait: () => this.wait(),
      sommationsDone: () => this.done,
      sommationRefusal: () => this.refusal(),
      authorize: (level) => {
        if (!this.canAuthorize) return false;
        this.authorised = level;
        this.log.push(`autorise:${level}@${Math.round(this.now)}`);
        return true;
      },
      authorised: () => this.authorised,
      requestForce: (level) => this.log.push(`demande-force:${level}`),
      forceWait: () => (this.done < 3 ? Infinity : Math.max(0, this.forceDelay - (this.now - this.at))),
      issue: (plan) => {
        this.log.push(`ordre:${plan.line.label}@${Math.round(this.now)}`);
        return { ok: true, reason: '' };
      },
    };
  }
}

const CROWD: Repere = { kind: 'foule', key: 'foule:c', x: 0, z: 0, crowdKey: 'c', name: 'Tête de cortège — ~300 personnes' };

function gasLine(): CardLine {
  return {
    label: 'Disperser au gaz lacrymogène', explain: '', icon: 'wind', action: { kind: 'verb', type: 'disperser_gaz', geom: 'point' },
    coercive: false, lock: { sommations: 3, force: 3, text: 'sommations 0/3 + autoriser le gaz' }, needsWho: true, rule: '',
  };
}

const COMMANDANT: LegalScope = { level: 'tout', canSommation: true, canAuthorize: true, salle: false, officer: true };

function gasPlan(law: FakeLaw, scope: LegalScope, refusal = ''): LegalPlan {
  const v = verbOf('disperser_gaz')!;
  const r = legalSteps(v, { sommations: law.done, authorised: law.authorised, underAttack: false, riposte: false }, scope, refusal, 'la section MISTRAL 2 lance le gaz lacrymogène sur la foule');
  expect(r.chain).toBe(true);
  return legalPlan(gasLine(), { squadIds: [7], label: 'Section MISTRAL 2', mode: 'pied', eta: 60, distance: 80, busy: 'sans ordre' }, CROWD, r);
}

/** Fait tourner la chaîne par pas de 0,25 s jusqu'à la fin (ou `max` secondes). */
function run(chain: LegalChain, law: FakeLaw, max = 400): void {
  for (let i = 0; i < max * 4 && (chain.active() || i === 0); i++) {
    law.advance(0.25);
    chain.tick(law.now);
  }
}

describe('chaîne légale : étapes de S3 (legalSteps)', () => {
  it('commandant : sommations par lui, autoriser le gaz, puis l’ordre', () => {
    const r = legalSteps(verbOf('disperser_gaz')!, { sommations: 0, authorised: 1, underAttack: false, riposte: false }, COMMANDANT, '', 'la section MISTRAL 2 lance le gaz lacrymogène sur la foule');
    expect(r.chain).toBe(true);
    expect(r.viaOfficer).toBe(false);
    expect(r.level).toBe(3);
    expect(r.steps.map((s) => s.kind)).toEqual(['sommations', 'authorize', 'issue']);
    expect(r.steps[0]!.label).toBe('les 3 sommations, par vous au mégaphone (~1 min 30)');
    expect(r.steps[1]!.label).toBe('autoriser le gaz lacrymogène et le canon à eau');
    expect(r.steps[2]!.label).toBe('puis la section MISTRAL 2 lance le gaz lacrymogène sur la foule');
    for (const s of r.steps) expect(s.label).not.toMatch(/\d\s*$|niveau/);
  });

  it('ligne ⚖ (permise avant la dernière sommation) : avertissement, sommations puis ordre, sans autorisation', () => {
    const r = legalSteps(verbOf('refoulement')!, { sommations: 1, authorised: 3, underAttack: false, riposte: false }, COMMANDANT, '');
    expect(r.warning).toBe(BEFORE_LAST_WARNING);
    expect(r.steps.map((s) => s.kind)).toEqual(['sommations', 'issue']);
    expect(r.steps[0]!.label.startsWith('les 2 sommations restantes')).toBe(true);
    // riposte permise au lieu : ni sommation ni avertissement
    const rip = legalSteps(verbOf('refoulement')!, { sommations: 0, authorised: 3, underAttack: false, riposte: true }, COMMANDANT, '');
    expect(rip.warning).toBe('');
    expect(rip.steps.map((s) => s.kind)).toEqual(['issue']);
  });

  it('salle de commandement, ou joueur sans insigne avec un officier sur place : les sommations par l’officier', () => {
    const salle = legalSteps(verbOf('disperser_gaz')!, { sommations: 0, authorised: 1, underAttack: false, riposte: false }, { ...COMMANDANT, salle: true }, '');
    expect(salle.chain).toBe(true);
    expect(salle.viaOfficer).toBe(true);
    expect(salle.steps[0]!.label).toBe('les 3 sommations, par l’officier de la compagnie sur place');
    const noSash = legalSteps(verbOf('disperser_gaz')!, { sommations: 0, authorised: 1, underAttack: false, riposte: false }, COMMANDANT, INSIGNE);
    expect(noSash.chain).toBe(true);
    expect(noSash.viaOfficer).toBe(true);
    // un simple délai n'est pas un refus : c'est le joueur qui somme, la chaîne attendra
    const delay = legalSteps(verbOf('disperser_gaz')!, { sommations: 1, authorised: 1, underAttack: false, riposte: false }, COMMANDANT, 'Délai insuffisant : la foule doit avoir le temps de se disperser. La première sommation sera possible dans 12 s.');
    expect(delay.viaOfficer).toBe(false);
    expect(delay.chain).toBe(true);
  });

  it('ni autorité ni officier : pas de chaîne, le motif en une ligne claire', () => {
    const r = legalSteps(verbOf('disperser_gaz')!, { sommations: 0, authorised: 1, underAttack: false, riposte: false }, { ...COMMANDANT, officer: false }, INSIGNE);
    expect(r.chain).toBe(false);
    expect(r.reason).toBe('Vous devez porter l’écharpe tricolore pour faire les sommations.');
    const notAuthority = legalSteps(verbOf('charge')!, { sommations: 0, authorised: 3, underAttack: false, riposte: false },
      { level: 'tout', canSommation: false, canAuthorize: true, salle: false, officer: false },
      'Seul le commandant, autorité habilitée à décider de l\'emploi de la force et porteur de l\'écharpe tricolore, peut prononcer les sommations.');
    expect(notAuthority.chain).toBe(false);
    expect(notAuthority.reason).toBe('Seul le commissaire ou l’officier ceint peut faire les sommations.');
    expect(plainRefusal('')).toBe('');
  });

  it('chef de groupe au-dessus de son plafond : « Demander plus de force », jamais « autoriser », pas de chaîne', () => {
    const r = legalSteps(verbOf('disperser_gaz')!, { sommations: 3, authorised: 1, underAttack: false, riposte: false },
      { level: 'unite', canSommation: false, canAuthorize: false, salle: false, officer: true }, '');
    expect(r.chain).toBe(false);
    expect(r.reason).toBe(ABOVE_CEILING);
    expect(r.steps.some((s) => s.kind === 'authorize')).toBe(false);
    expect(r.steps.map((s) => s.label)).toContain('Demander plus de force');
    expect(r.steps[r.steps.length - 2]!.label).toBe('Demander plus de force');
  });
});

describe('chaîne légale : le séquenceur (horloge et droit factices)', () => {
  it('3 sommations espacées du délai légal, puis l’autorisation, le délai laissé à la foule, et un seul ordre', () => {
    const law = new FakeLaw();
    const chain = new LegalChain(law.deps());
    chain.start(gasPlan(law, COMMANDANT));
    law.advance(0);
    chain.tick(law.now);
    expect(chain.status()!.text).toBe('Dispersion au gaz — sommation 2 sur 3 dans 20 s');
    run(chain, law);
    expect(chain.active()).toBe(false);
    expect(chain.succeeded()).toBe(true);
    const som = law.log.filter((l) => l.startsWith('sommation:'));
    expect(som.length).toBe(3);
    const times = som.map((l) => Number(l.split('@')[1]));
    expect(times[1]! - times[0]!).toBeGreaterThanOrEqual(law.delay);
    expect(times[2]! - times[1]!).toBeGreaterThanOrEqual(law.delay);
    const auth = law.log.findIndex((l) => l.startsWith('autorise:3'));
    const order = law.log.filter((l) => l.startsWith('ordre:'));
    expect(auth).toBeGreaterThan(law.log.indexOf(som[2]!));
    expect(order.length).toBe(1);
    expect(law.log.indexOf(order[0]!)).toBeGreaterThan(auth);
    // l'ordre attend le délai laissé à la foule après la dernière sommation
    expect(Number(order[0]!.split('@')[1]) - times[2]!).toBeGreaterThanOrEqual(law.forceDelay);
    expect(chain.status()!.text).toBe('Dispersion au gaz — ordre donné');
    // d'autres pas ne redonnent pas l'ordre
    for (let i = 0; i < 40; i++) {
      law.advance(0.25);
      chain.tick(law.now);
    }
    expect(law.log.filter((l) => l.startsWith('ordre:')).length).toBe(1);
    // l'état final disparaît au bout de quelques secondes
    expect(chain.status()).toBeNull();
  });

  it('un refus arrête la chaîne avec le motif ; rien d’autre ne part', () => {
    const law = new FakeLaw();
    const chain = new LegalChain(law.deps());
    chain.start(gasPlan(law, COMMANDANT));
    law.advance(0.25);
    chain.tick(law.now);
    expect(law.done).toBe(1);
    // le joueur retire son écharpe pendant la série
    law.insignia = false;
    run(chain, law);
    const st = chain.status()!;
    expect(st.stage).toBe('refus');
    expect(st.reason).toBe('Vous devez porter l’écharpe tricolore pour faire les sommations.');
    expect(st.text).toContain('arrêté');
    expect(law.log.some((l) => l.startsWith('autorise') || l.startsWith('ordre'))).toBe(false);
  });

  it('cancel() arrête tout', () => {
    const law = new FakeLaw();
    const chain = new LegalChain(law.deps());
    chain.start(gasPlan(law, COMMANDANT));
    for (let i = 0; i < 40; i++) {
      law.advance(0.25);
      chain.tick(law.now);
    }
    expect(law.done).toBe(1);
    chain.cancel();
    expect(chain.status()!.stage).toBe('annule');
    expect(chain.status()!.text).toBe('Dispersion au gaz — annulé');
    run(chain, law, 200);
    expect(law.done).toBe(1);
    expect(law.log.some((l) => l.startsWith('ordre'))).toBe(false);
  });

  it('salle de commandement : chaque sommation est demandée à l’officier (requestSommation), une à la fois', () => {
    const law = new FakeLaw();
    const chain = new LegalChain(law.deps());
    chain.start(gasPlan(law, { ...COMMANDANT, salle: true }));
    run(chain, law);
    expect(chain.succeeded()).toBe(true);
    expect(law.log.filter((l) => l.startsWith('sommation:')).length).toBe(0);
    expect(law.log.filter((l) => l.startsWith('demande:')).length).toBe(3);
    expect(law.log.filter((l) => l.startsWith('officier:')).length).toBe(3);
    // jamais deux demandes avant que l'officier ait prononcé la précédente
    let pending = 0;
    for (const l of law.log) {
      if (l.startsWith('demande:')) pending++;
      if (l.startsWith('officier:')) pending--;
      expect(pending).toBeLessThanOrEqual(1);
    }
    expect(law.log.filter((l) => l.startsWith('ordre:')).length).toBe(1);
  });

  it('joueur sans insigne mais officier disponible : la chaîne passe par l’officier', () => {
    const law = new FakeLaw();
    law.insignia = false;
    const chain = new LegalChain(law.deps());
    chain.start(gasPlan(law, COMMANDANT, INSIGNE));
    run(chain, law);
    expect(chain.succeeded()).toBe(true);
    expect(law.log.filter((l) => l.startsWith('demande:')).length).toBe(3);
  });

  it('sans le droit d’autoriser : la demande part par radio et la chaîne s’arrête en attente', () => {
    const law = new FakeLaw();
    law.done = 3;
    law.at = -100;
    const v = verbOf('disperser_gaz')!;
    const r = legalSteps(v, { sommations: 3, authorised: 1, underAttack: false, riposte: false }, { level: 'tout', canSommation: true, canAuthorize: false, salle: false, officer: true }, '');
    expect(r.chain).toBe(true);
    expect(r.steps.map((s) => s.label)).toContain('demander l’autorisation du gaz (radio)');
    const chain = new LegalChain(law.deps());
    chain.start(legalPlan(gasLine(), null, CROWD, r));
    run(chain, law);
    expect(law.log).toContain('demande-force:3');
    expect(law.log.some((l) => l.startsWith('ordre'))).toBe(false);
    expect(chain.status()!.text).toBe('Dispersion au gaz — en attente de l’autorisation du gaz');
  });

  it('« Faire les sommations » seules : trois étapes, aucun ordre', () => {
    const law = new FakeLaw();
    const line: CardLine = { label: 'Faire les sommations', explain: '', icon: 'megaphone', action: { kind: 'sommation', all: true }, coercive: false, lock: null, needsWho: false, rule: '' };
    const r = legalSteps(null, { sommations: 0, authorised: 1, underAttack: false, riposte: false }, COMMANDANT, '');
    expect(r.steps.map((s) => s.kind)).toEqual(['sommations']);
    const chain = new LegalChain(law.deps());
    chain.start(legalPlan(line, null, CROWD, r));
    run(chain, law);
    expect(law.done).toBe(3);
    expect(law.log.some((l) => l.startsWith('ordre') || l.startsWith('autorise'))).toBe(false);
    expect(chain.status()!.text).toBe('Sommations faites');
  });
});
