import { describe, expect, it } from 'vitest';
import type { PlayableRole } from '@/core/contracts';
import type { MissionDef, MissionType, ObjectiveKind } from '@/core/missions-schema';
import { CAREER_CHAPTERS, CAMPAIGN_SEMAINE } from '@/gameplay/missions/catalog/career';
import { CAUSES, FAMILIES } from '@/gameplay/missions/catalog/dsl';
import { MISSIONS, mirrorsOf, missionById, missionsFor } from '@/gameplay/missions/catalog';

const ROLES_JOUABLES: PlayableRole[] = [
  'crs', 'chef_groupe', 'commandant', 'bravm', 'gendarme_centaure', 'operateur_canon_eau', 'telepilote',
  'street_medic', 'secouriste', 'journaliste', 'manifestant',
];

const TYPES: MissionType[] = [
  'manifestation_declaree', 'manifestation_interdite', 'emeute_nocturne', 'soir_de_match', 'securisation', 'escorte',
  'evacuation', 'pillage', 'protection_secours', 'barrage', 'interpellation_ciblee', 'evenement_festif',
  'visite_officielle', 'catastrophe', 'patrouille', 'formation',
];

const KINDS: ObjectiveKind[] = [
  'tenir_position', 'proteger_site', 'disperser', 'interpeller', 'zero_bavure', 'sommations_regulieres',
  'limiter_blesses', 'limiter_degats', 'couper_circulation', 'degager_barricade', 'escorter', 'evacuer',
  'reperer_signaux', 'guider_unite', 'traiter_incidents', 'releve', 'prevention', 'eteindre', 'secourir', 'soigner',
  'photographier', 'filmer', 'publier', 'rester_dans_cortege', 'atteindre', 'ne_pas_etre_interpelle',
  'proteger_les_siens', 'survivre', 'duree', 'personnalise',
];

const PHASES_FOULE = ['aucune', 'rassemblement', 'depart', 'cortege', 'tension', 'affrontement', 'dispersion'];

function textes(m: MissionDef): string[] {
  return [
    m.title, m.pitch, m.briefing, m.unique, m.intel.expected, m.intel.radicals, ...m.intel.advice, ...m.randomEvents,
    ...m.phases.flatMap((p) => [p.title, p.text, ...p.events, ...p.radio.map((r) => r.text)]),
    ...m.objectives.map((o) => o.text), ...m.failures.map((f) => f.text),
  ];
}

describe('catalogue de missions : volumétrie et identifiants', () => {
  it('compte au moins 110 missions', () => {
    expect(MISSIONS.length).toBeGreaterThanOrEqual(110);
  });

  it('identifiants uniques, en minuscules, sans espace', () => {
    const vus = new Set<string>();
    for (const m of MISSIONS) {
      expect(m.id, m.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)+$/);
      expect(m.id).toBe(m.id.toLowerCase());
      expect(vus.has(m.id), `doublon ${m.id}`).toBe(false);
      vus.add(m.id);
    }
    expect(vus.size).toBe(MISSIONS.length);
  });

  it('au moins 8 missions par rôle jouable ; aucun rôle « commissaire »', () => {
    for (const r of ROLES_JOUABLES) {
      expect(missionsFor(r).length, r).toBeGreaterThanOrEqual(8);
    }
    expect(MISSIONS.filter((m) => (m.role as string) === 'commissaire')).toHaveLength(0);
    expect(MISSIONS.filter((m) => m.altRoles.includes('commissaire'))).toHaveLength(0);
    expect(MISSIONS.filter((m) => m.rank === 'commissaire')).toHaveLength(0);
    expect(missionsFor('commissaire').map((m) => m.id)).toEqual(missionsFor('commandant').map((m) => m.id));
  });

  it('le manifestant couvre le profil pacifique ET radical', () => {
    const profils = new Set(missionsFor('manifestant').map((m) => m.profile));
    expect(profils.has('radical')).toBe(true);
    expect([...profils].some((p) => p === 'pacifique' || p === 'famille' || p === 'militant' || p === 'service_ordre')).toBe(true);
    expect(missionsFor('manifestant').filter((m) => m.profile === 'radical').length).toBeGreaterThanOrEqual(4);
    expect(missionsFor('manifestant').filter((m) => m.profile === 'pacifique' || m.profile === 'famille' || m.profile === 'militant').length).toBeGreaterThanOrEqual(4);
  });

  it('tous les types de mission sont représentés', () => {
    const vus = new Set(MISSIONS.map((m) => m.type));
    for (const t of TYPES) expect(vus.has(t), t).toBe(true);
  });

  it('les lieux de départ sont variés', () => {
    const lieux = new Set(MISSIONS.map((m) => m.place));
    expect(lieux.size).toBeGreaterThanOrEqual(40);
  });

  it('le profil de manifestant n\'est renseigné que pour ce rôle ; le grade et le poste que pour la police', () => {
    for (const m of MISSIONS) {
      if (m.role === 'manifestant') expect(m.profile, m.id).not.toBeNull();
      else expect(m.profile, m.id).toBeNull();
      if (['journaliste', 'manifestant', 'street_medic', 'secouriste'].includes(m.role)) {
        expect(m.rank, m.id).toBeNull();
        expect(m.poste, m.id).toBeNull();
      }
    }
  });
});

describe('catalogue de missions : champs remplis et dans leurs bornes', () => {
  it.each(MISSIONS.map((m) => [m.id, m] as const))('%s', (_id, m) => {
    // textes
    expect(m.title.trim().length).toBeGreaterThanOrEqual(3);
    expect(m.title.length).toBeLessThanOrEqual(80);
    expect(m.pitch.length).toBeGreaterThanOrEqual(50);
    expect(m.pitch.length).toBeLessThanOrEqual(400);
    expect(m.unique.length).toBeGreaterThanOrEqual(25);
    // briefing : quatre paragraphes dans l'ordre situation, mission, exécution, consignes
    const paragraphes = m.briefing.split('\n\n');
    expect(paragraphes).toHaveLength(4);
    expect(paragraphes[0].startsWith('Situation.')).toBe(true);
    expect(paragraphes[1].startsWith('Mission.')).toBe(true);
    expect(paragraphes[2].startsWith('Exécution.')).toBe(true);
    expect(paragraphes[3].startsWith('Consignes particulières.')).toBe(true);
    for (const p of paragraphes) expect(p.length, 'paragraphe trop court').toBeGreaterThanOrEqual(150);
    // scène
    expect(m.place.trim().length).toBeGreaterThan(2);
    expect(m.timeOfDay).toBeGreaterThanOrEqual(0);
    expect(m.timeOfDay).toBeLessThan(24);
    expect(['clair', 'nuageux', 'couvert', 'pluie', 'averse', 'brouillard', 'orage']).toContain(m.weather);
    expect(m.windFrom).toBeGreaterThanOrEqual(0);
    expect(m.windFrom).toBeLessThanOrEqual(360);
    expect(m.windSpeed).toBeGreaterThanOrEqual(0);
    expect(m.windSpeed).toBeLessThanOrEqual(25);
    expect(['courte', 'standard', 'longue', 'temps_reel']).toContain(m.duration);
    expect([1, 2, 3, 4, 5]).toContain(m.difficulty);
    expect(TYPES).toContain(m.type);
    expect(m.tags.length).toBeGreaterThanOrEqual(1);
    for (const t of m.tags) expect(t).toMatch(/^[a-z0-9-]+$/);
    // foule
    const c = m.crowd;
    expect(Number.isInteger(c.size)).toBe(true);
    expect(c.size).toBeGreaterThanOrEqual(0);
    expect(c.size).toBeLessThanOrEqual(5000);
    expect(CAUSES as readonly string[]).toContain(c.cause);
    for (const v of [c.tension, c.volatility, c.radicalShare, c.metroShare]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    let somme = 0;
    for (const [k, v] of Object.entries(c.families)) {
      expect(FAMILIES as readonly string[], `famille ${k}`).toContain(k);
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThanOrEqual(1);
      somme += v;
    }
    if (c.size > 0) {
      expect(Object.keys(c.families).length).toBeGreaterThanOrEqual(1);
      expect(somme).toBeGreaterThan(0.95);
      expect(somme).toBeLessThanOrEqual(1.0001);
    }
    // moyens
    const f = m.forces;
    for (const k of ['sections', 'fourgons', 'pelotons', 'centaure', 'canonEau', 'bravm', 'pompiers', 'samu'] as const) {
      expect(Number.isInteger(f[k]), k).toBe(true);
      expect(f[k], k).toBeGreaterThanOrEqual(0);
    }
    expect(typeof f.drone).toBe('boolean');
    if (m.role === 'bravm') expect(f.bravm).toBeGreaterThanOrEqual(1);
    if (m.role === 'gendarme_centaure') expect(f.centaure).toBeGreaterThanOrEqual(1);
    if (m.role === 'operateur_canon_eau') expect(f.canonEau).toBeGreaterThanOrEqual(1);
    if (m.role === 'telepilote') expect(f.drone).toBe(true);
    // renseignement
    expect(m.intel.expected.length).toBeGreaterThan(15);
    expect(m.intel.radicals.length).toBeGreaterThan(10);
    expect(m.intel.hotspots.length).toBeGreaterThanOrEqual(1);
    expect(m.intel.advice.length).toBeGreaterThanOrEqual(2);
    // aléas
    expect(m.randomEvents.length).toBeGreaterThanOrEqual(2);
    for (const e of m.randomEvents) expect(e.length).toBeGreaterThan(8);
    // phases
    expect(m.phases.length).toBeGreaterThanOrEqual(3);
    const idsPhases = new Set<string>();
    const idsObj = new Set(m.objectives.map((o) => o.id));
    m.phases.forEach((p, i) => {
      expect(idsPhases.has(p.id), `phase en double ${p.id}`).toBe(false);
      idsPhases.add(p.id);
      expect(p.title.length).toBeGreaterThan(2);
      expect(p.text.length).toBeGreaterThan(14);
      expect(p.radio.length, `radio de ${p.id}`).toBeGreaterThanOrEqual(1);
      for (const r of p.radio) {
        expect(r.from.length).toBeGreaterThan(1);
        expect(r.text, `radio « ${r.text} »`).toMatch(/\bICI\b/);
        expect(r.text, `radio « ${r.text} »`).toMatch(/(PARLEZ|TERMINÉ|APERÇU|COLLATIONNEZ)\.$/);
      }
      if (i < m.phases.length - 1) {
        expect(p.until.kind).not.toBe('fin');
        if (p.until.kind === 'temps') expect(p.until.seconds).toBeGreaterThan(0);
        if (p.until.kind === 'tension') {
          expect(p.until.above).toBeGreaterThan(0);
          expect(p.until.above).toBeLessThanOrEqual(1);
        }
        if (p.until.kind === 'phase_foule') expect(PHASES_FOULE).toContain(p.until.phase);
        if (p.until.kind === 'objectif') expect(idsObj.has(p.until.id)).toBe(true);
      } else {
        expect(p.until.kind).toBe('fin');
      }
    });
    // objectifs
    const principaux = m.objectives.filter((o) => !o.secondary);
    const secondaires = m.objectives.filter((o) => o.secondary);
    expect(principaux.length).toBeGreaterThanOrEqual(2);
    expect(secondaires.length).toBeGreaterThanOrEqual(1);
    expect(idsObj.size).toBe(m.objectives.length);
    for (const o of m.objectives) {
      expect(KINDS).toContain(o.kind);
      expect(o.text.length).toBeGreaterThan(10);
      if (o.count !== undefined) expect(o.count).toBeGreaterThan(0);
      if (o.seconds !== undefined) expect(o.seconds).toBeGreaterThan(0);
      if (o.max !== undefined) expect(o.max).toBeGreaterThanOrEqual(0);
    }
    // échecs
    expect(m.failures.length).toBeGreaterThanOrEqual(1);
    for (const e of m.failures) {
      expect(e.text.length).toBeGreaterThan(10);
      if (e.value !== undefined) expect(e.value).toBeGreaterThan(0);
    }
    // cohérence des familles de rôle
    if (m.type === 'formation') expect(m.crowd.tension).toBeLessThan(0.5);
  });
});

describe('catalogue de missions : typographie française', () => {
  it('espaces insécables avant ; : ! ? et dans les guillemets, apostrophes courbes', () => {
    for (const m of MISSIONS) {
      for (const t of textes(m)) {
        expect(t, `${m.id} : espace ordinaire avant ponctuation haute`).not.toMatch(/[^ ] [;:!?»]/);
        expect(t, `${m.id} : guillemet ouvrant sans espace insécable`).not.toMatch(/« [^ ]|«[^ ]/);
        expect(t, `${m.id} : apostrophe droite`).not.toMatch(/'/);
        expect(t, `${m.id} : guillemets anglais`).not.toMatch(/["“”]/);
      }
    }
  });
});

describe('catalogue de missions : missions miroirs', () => {
  const miroirs = MISSIONS.filter((m) => m.mirrorOf !== '');

  it('mirrorOf désigne une mission existante, d\'un autre rôle, sur le même lieu', () => {
    for (const m of miroirs) {
      const base = missionById(m.mirrorOf);
      expect(base, `${m.id} → ${m.mirrorOf}`).toBeDefined();
      if (!base) continue;
      expect(base.role, m.id).not.toBe(m.role);
      expect(base.place, m.id).toBe(m.place);
      expect(base.mirrorOf, 'la base d\'un miroir n\'est pas elle-même un miroir').toBe('');
      expect(base.altRoles, `${base.id} doit lister ${m.role}`).toContain(m.role);
      expect(m.altRoles, `${m.id} doit lister ${base.role}`).toContain(base.role);
    }
  });

  it('au moins dix situations jouables sous plusieurs rôles', () => {
    const bases = new Set(miroirs.map((m) => m.mirrorOf));
    expect(bases.size).toBeGreaterThanOrEqual(10);
  });

  it('toute mission qui annonce des rôles alternatifs a un miroir pour chacun', () => {
    for (const m of MISSIONS.filter((x) => x.mirrorOf === '' && x.altRoles.length > 0)) {
      const roles = mirrorsOf(m.id).map((x) => x.role);
      for (const r of m.altRoles) expect(roles, `${m.id} : miroir ${r}`).toContain(r);
    }
  });

  it('au moins une scène commandant / journaliste / manifestant', () => {
    const trio = miroirs.filter((m) => m.role === 'journaliste').map((m) => m.mirrorOf).filter((id) => {
      const roles = mirrorsOf(id).map((x) => x.role);
      return roles.includes('manifestant') && missionById(id)?.role === 'commandant';
    });
    expect(trio.length).toBeGreaterThanOrEqual(2);
  });
});

describe('carrière et campagne', () => {
  it('chapitres contigus de 0 à 13, avec le chapitre 0 « L\'école » de quatre ateliers de formation', () => {
    expect(CAREER_CHAPTERS.map((c) => c.index)).toEqual(CAREER_CHAPTERS.map((_, i) => i));
    expect(CAREER_CHAPTERS.length).toBeGreaterThanOrEqual(9);
    const ecole = CAREER_CHAPTERS[0];
    expect(ecole.title.replace(/’/g, '\'')).toContain('école');
    expect(ecole.missions).toHaveLength(4);
    for (const id of ecole.missions) {
      const m = missionById(id);
      expect(m?.type).toBe('formation');
      expect(m?.chapter).toBe(0);
    }
    const sujets = ecole.missions.map((id) => missionById(id)?.title ?? '').join(' ').toLowerCase();
    for (const mot of ['ligne', 'bouclier', 'sommations', 'secours']) expect(sujets).toContain(mot);
  });

  it('chaque chapitre référence des missions existantes, et réciproquement', () => {
    const vues = new Map<string, number>();
    for (const c of CAREER_CHAPTERS) {
      expect(c.missions.length).toBeGreaterThanOrEqual(1);
      expect(c.title.length).toBeGreaterThan(3);
      expect(c.description.length).toBeGreaterThan(40);
      expect(c.requirement.length).toBeGreaterThan(10);
      expect(c.requiredMissions).toBeGreaterThanOrEqual(1);
      expect(c.requiredMissions).toBeLessThanOrEqual(c.missions.length);
      expect(c.requiredAverage).toBeGreaterThanOrEqual(0);
      expect(c.requiredAverage).toBeLessThanOrEqual(4);
      expect(c.unlocks.length).toBeGreaterThanOrEqual(1);
      for (const id of c.missions) {
        const m = missionById(id);
        expect(m, `chapitre ${c.index} : ${id}`).toBeDefined();
        expect(m?.chapter, id).toBe(c.index);
        expect(vues.has(id), `${id} dans deux chapitres`).toBe(false);
        vues.set(id, c.index);
      }
    }
    for (const m of MISSIONS) {
      if (m.chapter >= 0) expect(vues.get(m.id), `${m.id} absente des chapitres`).toBe(m.chapter);
      else expect(vues.has(m.id)).toBe(false);
    }
  });

  it('la montée en grade va du gardien stagiaire au commandant', () => {
    const grades = CAREER_CHAPTERS.slice(0, 9).map((c) => c.rank);
    expect(grades[0]).toBe('gardien_stagiaire');
    expect(grades).toContain('brigadier_chef');
    expect(grades).toContain('major');
    expect(grades).toContain('capitaine');
    expect(grades[grades.length - 1]).toBe('commandant');
    expect(CAREER_CHAPTERS.some((c) => (c.rank as string) === 'commissaire')).toBe(false);
  });

  it('la campagne « semaine de mobilisation » compte 5 à 7 missions du commandant qui s\'aggravent', () => {
    const actes = MISSIONS.filter((m) => m.tags.includes('semaine'));
    expect(actes.length).toBeGreaterThanOrEqual(5);
    expect(actes.length).toBeLessThanOrEqual(7);
    expect(CAMPAIGN_SEMAINE.acts).toHaveLength(actes.length);
    let tensionPrecedente = -1;
    let taillePrecedente = 0;
    CAMPAIGN_SEMAINE.acts.forEach((a, i) => {
      const m = missionById(a.missionId);
      expect(m, a.missionId).toBeDefined();
      if (!m) return;
      expect(m.role).toBe('commandant');
      expect(m.tags).toContain('semaine');
      expect(m.tags).toContain(`acte-${i + 1}`);
      expect(m.chapter).toBe(8);
      expect(m.crowd.tension).toBeGreaterThanOrEqual(tensionPrecedente);
      tensionPrecedente = m.crowd.tension;
      if (i < 5) {
        expect(m.crowd.size).toBeGreaterThanOrEqual(taillePrecedente);
        taillePrecedente = m.crowd.size;
      }
      expect(a.carryOver.length).toBeGreaterThanOrEqual(1);
    });
    const premier = missionById(CAMPAIGN_SEMAINE.acts[0].missionId);
    const dernier = missionById(CAMPAIGN_SEMAINE.acts[CAMPAIGN_SEMAINE.acts.length - 1].missionId);
    expect((dernier?.crowd.tension ?? 0) - (premier?.crowd.tension ?? 1)).toBeGreaterThanOrEqual(0.4);
    expect(CAREER_CHAPTERS[8].missions).toEqual(CAMPAIGN_SEMAINE.acts.map((a) => a.missionId));
  });
});
