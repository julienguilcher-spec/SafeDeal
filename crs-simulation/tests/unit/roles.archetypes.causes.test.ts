// Archétypes — causes, organisations fictives, pancartes, slogans et banderoles : contenu complet,
// textes de longueur adaptée, neutralité (aucune organisation ni personne réelle).
import { describe, expect, it } from 'vitest';
import { createRng } from '@/core/rng';
import { FAMILY_IDS, PROFILE_IDS } from '@/sim/roles';
import type { CausesApi } from '@/sim/roles';
import { BANNER_MAX_CHARS, BLOC_BANNERS, CAUSES, SIGN_MAX_CHARS, wrapSign } from '@/sim/roles/archetypes/causes';
import { isColor } from '@/sim/roles/archetypes/palette';
import { FAMILY_DEFS, PROFILE_LABELS } from '@/sim/roles/archetypes/protest';
import { FIRST_NAME_POOLS, SURNAMES } from '@/sim/roles/archetypes/names';
import { forbiddenIn, FORBIDDEN_ACRONYMS, startRoles } from '@/sim/roles/archetypes/testkit';

const causes: CausesApi = CAUSES;

describe('table des causes', () => {
  it('au moins dix causes, dont celles que propose la page d’accueil', () => {
    expect(causes.list.length).toBeGreaterThanOrEqual(10);
    const ids = causes.list.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ['pouvoir_achat', 'retraites', 'climat', 'logement', 'hopital', 'education', 'agriculture', 'carburants', 'libertes', 'culture']) {
      expect(ids, id).toContain(id);
    }
    causes.list.forEach((c, i) => {
      expect(c.index).toBe(i);
      expect(causes.get(c.id)).toBe(c);
      expect(causes.get(i)).toBe(c);
    });
    expect(causes.get('inconnue')).toBeUndefined();
    expect(causes.get(-1)).toBeUndefined();
  });

  it('chaque cause est complète : libellé, organisations, 25 pancartes, 10 slogans, banderoles, couleurs, composition', () => {
    for (const c of causes.list) {
      expect(c.label.length, c.id).toBeGreaterThan(3);
      expect(c.summary.length, c.id).toBeGreaterThan(20);
      expect(c.orgs.length, c.id).toBeGreaterThanOrEqual(2);
      // au moins une organisation syndicale ou un collectif pour les chasubles et les drapeaux
      for (const o of c.orgs) {
        expect(o.name.length, c.id).toBeGreaterThan(5);
        expect(o.sigle, `${c.id} ${o.name}`).toMatch(/^[A-Z]{2,5}$/);
        expect(isColor(o.color), o.name).toBe(true);
        expect(o.color, o.name).toBeGreaterThan(0);
      }
      expect(c.signs.length, c.id).toBeGreaterThanOrEqual(25);
      expect(c.chants.length, c.id).toBe(10);
      expect(c.banners.length, c.id).toBeGreaterThanOrEqual(2);
      expect(c.colors.length, c.id).toBeGreaterThanOrEqual(2);
      for (const col of c.colors) expect(isColor(col) && col > 0, c.id).toBe(true);
    }
    const names = causes.list.flatMap((c) => c.orgs.map((o) => o.name));
    const sigles = causes.list.flatMap((c) => c.orgs.map((o) => o.sigle));
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(sigles).size).toBe(sigles.length);
  });

  it('pancartes : non vides, courtes, en capitales, sans doublon dans une cause', () => {
    let total = 0;
    let chars = 0;
    for (const c of causes.list) {
      expect(new Set(c.signs).size, c.id).toBe(c.signs.length);
      for (const s of c.signs) {
        expect(s.trim(), c.id).toBe(s);
        expect(s.length, `« ${s} »`).toBeGreaterThanOrEqual(6);
        expect(s.length, `« ${s} »`).toBeLessThanOrEqual(SIGN_MAX_CHARS);
        // écrites au feutre, en capitales (le « x » de « x2 » excepté)
        expect(s.replace(/x(?=\d)/g, 'X'), `« ${s} »`).toBe(s.replace(/x(?=\d)/g, 'X').toUpperCase());
        expect(s, `« ${s} »`).toMatch(/\p{L}{2,}/u);
        expect(s, `« ${s} »`).not.toMatch(/ {2}|\n|\t/);
        total++;
        chars += s.length;
      }
    }
    expect(causes.signCount).toBe(total);
    expect(total).toBeGreaterThanOrEqual(250);
    // en moyenne une vingtaine de caractères : lisible sur un carton de 60 cm
    expect(chars / total).toBeGreaterThan(14);
    expect(chars / total).toBeLessThan(27);
  });

  it('slogans scandés : un appel et une réponse, courts et rythmés', () => {
    for (const c of causes.list) {
      const calls = new Set<string>();
      for (const ch of c.chants) {
        expect(ch.call.length, c.id).toBeGreaterThanOrEqual(5);
        expect(ch.response.length, c.id).toBeGreaterThanOrEqual(5);
        expect(ch.call.length, `« ${ch.call} »`).toBeLessThanOrEqual(40);
        expect(ch.response.length, `« ${ch.response} »`).toBeLessThanOrEqual(40);
        expect(ch.call, c.id).toMatch(/[!?]$/);
        expect(ch.response, c.id).toMatch(/!$/);
        // scandable : huit mots au plus de chaque côté
        expect(ch.call.split(' ').length, ch.call).toBeLessThanOrEqual(9);
        expect(ch.response.split(' ').length, ch.response).toBeLessThanOrEqual(9);
        calls.add(ch.call);
      }
      expect(calls.size, c.id).toBe(10);
    }
  });

  it('banderoles : de tête pour chaque cause, sans signature pour le bloc', () => {
    let total = 0;
    for (const c of causes.list) {
      for (const b of c.banners) {
        expect(b.length, `« ${b} »`).toBeGreaterThanOrEqual(8);
        expect(b.length, `« ${b} »`).toBeLessThanOrEqual(BANNER_MAX_CHARS);
        expect(b, b).toBe(b.toUpperCase());
        total++;
      }
      for (let i = 0; i < c.bannerCount; i++) expect(causes.bannerText(c.bannerBase + i)).toBe(c.banners[i]);
    }
    expect(causes.bannerCount).toBe(total + BLOC_BANNERS.length);
    for (let i = 0; i < BLOC_BANNERS.length; i++) expect(causes.bannerText(total + i)).toBe(BLOC_BANNERS[i]);
    expect(causes.bannerText(-1)).toBe('');
    expect(causes.bannerText(causes.bannerCount)).toBe('');
  });

  it('composition type : parts des familles et des profils qui somment à 1', () => {
    for (const c of causes.list) {
      let fam = 0;
      for (const [k, v] of Object.entries(c.mix.families)) {
        expect(FAMILY_IDS, `${c.id} ${k}`).toContain(k);
        expect(v, `${c.id} ${k}`).toBeGreaterThan(0);
        fam += v!;
      }
      expect(fam, c.id).toBeCloseTo(1, 6);
      let prof = 0;
      for (const p of PROFILE_IDS) {
        expect(c.mix.profiles[p], `${c.id} ${p}`).toBeGreaterThanOrEqual(0);
        prof += c.mix.profiles[p];
      }
      expect(prof, c.id).toBeCloseTo(1, 6);
      // toujours une large majorité pacifique (0,5 à 1 % de manifestants « à risque » en moyenne réelle)
      expect(c.mix.profiles.pacifique + c.mix.profiles.famille + c.mix.profiles.militant, c.id).toBeGreaterThan(0.65);
    }
  });
});

describe('neutralité', () => {
  it('aucune organisation, aucun parti, aucune personne réels dans les tables', () => {
    const texts: string[] = [];
    for (const c of causes.list) {
      texts.push(c.id, c.label, c.summary, ...c.signs, ...c.banners);
      for (const o of c.orgs) texts.push(o.name);
      for (const ch of c.chants) texts.push(ch.call, ch.response);
    }
    texts.push(...BLOC_BANNERS);
    for (const f of FAMILY_IDS) texts.push(FAMILY_DEFS[f].label);
    for (const p of PROFILE_IDS) texts.push(PROFILE_LABELS[p]);
    expect(texts.length).toBeGreaterThan(600);
    for (const t of texts) expect(forbiddenIn(t), `« ${t} »`).toBe('');
    // les sigles des organisations fictives ne reprennent aucun sigle réel
    for (const c of causes.list) for (const o of c.orgs) expect(FORBIDDEN_ACRONYMS, o.sigle).not.toContain(o.sigle);
    // la liste de contrôle fonctionne
    expect(forbiddenIn('Avec la CGT dans la rue')).toBe('cgt');
    expect(forbiddenIn('SOUTENU PAR FO ET LE PS')).toBe('FO');
    expect(forbiddenIn('FORMIDABLE EFFORT')).toBe('');
    expect(forbiddenIn('MACRON DÉMISSION')).toBe('macron');
    expect(forbiddenIn('Soutien à la France insoumise')).toBe('france insoumise');
    expect(forbiddenIn('TOUS SOLIDAIRES')).toBe('solidaires');
    expect(forbiddenIn('FORCE OUVRIÈRE')).toBe('force ouvriere');
  });

  it('aucun texte injurieux ni appel à la violence', () => {
    const banned = /\b(mort|tuer|tuez|crève|crever|brûlez|cassez|pendez|salaud|salope|connard|pourri|fdp|acab|nique|flic|poulet|keuf|suicid)/i;
    for (const c of causes.list) {
      for (const s of [...c.signs, ...c.banners]) expect(s, `« ${s} »`).not.toMatch(banned);
      for (const ch of c.chants) expect(ch.call + ' ' + ch.response).not.toMatch(banned);
    }
    for (const b of BLOC_BANNERS) expect(b).not.toMatch(banned);
  });

  it('les prénoms et les noms de la table ne contiennent aucun mot interdit', () => {
    for (const s of SURNAMES) expect(forbiddenIn(s), s).toBe('');
    for (const pool of FIRST_NAME_POOLS) for (const n of pool) expect(forbiddenIn(n), n).toBe('');
  });
});

describe('service « roles.causes »', () => {
  it('est publié et donne les textes par index global', async () => {
    const { ctx } = await startRoles(81);
    const api = ctx.require<CausesApi>('roles.causes');
    expect(api.list.length).toBe(causes.list.length);
    let index = 0;
    for (const c of api.list) {
      expect(c.signBase).toBe(index);
      for (let i = 0; i < c.signCount; i++) {
        expect(api.signText(index)).toBe(c.signs[i]);
        expect(api.causeOfSign(index)).toBe(c);
        index++;
      }
    }
    expect(api.signCount).toBe(index);
    expect(api.signText(-1)).toBe('');
    expect(api.signText(index)).toBe('');
    expect(api.signText(1.5)).toBe('');
    expect(api.causeOfSign(index)).toBeUndefined();
  });

  it('pick() tire un texte de la cause demandée, de façon déterministe et variée', () => {
    for (const c of causes.list) {
      const a = createRng(9);
      const b = createRng(9);
      const seen = new Set<number>();
      for (let i = 0; i < 300; i++) {
        const k = causes.pick(c.id, a);
        expect(causes.pick(c.index, b)).toBe(k);
        expect(k).toBeGreaterThanOrEqual(c.signBase);
        expect(k).toBeLessThan(c.signBase + c.signCount);
        seen.add(k);
      }
      expect(seen.size, c.id).toBe(c.signCount);
      const banner = causes.pickBanner(c.id, a);
      expect(c.banners).toContain(causes.bannerText(banner));
      const chant = causes.pickChant(c.id, a);
      expect(c.chants).toContain(chant);
    }
    const rng = createRng(1);
    expect(causes.pick('inconnue', rng)).toBe(-1);
    expect(causes.pickBanner('inconnue', rng)).toBe(-1);
    expect(causes.pickChant('inconnue', rng)).toBeNull();
  });

  it('organisations par index global', () => {
    let n = 0;
    for (const c of causes.list) {
      for (let i = 0; i < c.orgCount; i++) expect(causes.org(c.orgBase + i)).toBe(c.orgs[i]);
      n += c.orgCount;
    }
    expect(causes.orgCount).toBe(n);
    expect(causes.org(n)).toBeUndefined();
    expect(causes.org(-1)).toBeUndefined();
  });

  it('signLines() coupe une pancarte en trois lignes équilibrées au plus, sans couper un mot', () => {
    for (let i = 0; i < causes.signCount; i++) {
      const text = causes.signText(i);
      const lines = causes.signLines(i);
      expect(lines.length, text).toBeGreaterThanOrEqual(1);
      expect(lines.length, text).toBeLessThanOrEqual(3);
      expect(lines.join(' '), text).toBe(text);
      for (const l of lines) expect(l.length, text).toBeLessThanOrEqual(20);
      expect(causes.signLines(i)).toBe(lines);
    }
    expect(wrapSign('ON VEUT VIVRE, PAS SURVIVRE')).toEqual(['ON VEUT VIVRE,', 'PAS SURVIVRE']);
    expect(wrapSign('JE BOSSE, JE COMPTE MES SOUS')).toEqual(['JE BOSSE,', 'JE COMPTE', 'MES SOUS']);
    expect(wrapSign('EMBAUCHEZ !')).toEqual(['EMBAUCHEZ !']);
    expect(wrapSign('')).toEqual([]);
    expect(causes.signLines(-1)).toEqual([]);
  });
});
