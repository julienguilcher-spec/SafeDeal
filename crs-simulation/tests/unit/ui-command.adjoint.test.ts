// Propositions de l'adjoint : chaque nature que le commandement peut proposer (src/sim/police/command) a un titre en
// clair qui dit ce que fera « Accepter » ; une nature inconnue montre la phrase radio nettoyée.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { cleanRadio, hasPlainTitle, proposalNature, proposalTitle, unspell } from '@/ui/command/adjointPlays';

const DIR = join(__dirname, '../../src/sim/police/command');

/** Natures de proposition écrites dans le code du commandement : act('<clé>' / act('<préfixe>:' / offer(cmd, '<clé>' / key = '<préfixe>:'. */
function natures(): string[] {
  const out = new Set<string>();
  for (const f of readdirSync(DIR)) {
    if (!f.endsWith('.ts')) continue;
    const src = readFileSync(join(DIR, f), 'utf8');
    for (const re of [/\.act\(\s*'([^']+)'/g, /\.offer\(\s*cmd,\s*'([^']+)'/g, /const key = '([^']+)'/g]) {
      for (const m of src.matchAll(re)) out.add(m[1]!);
    }
  }
  return [...out].map((k) => proposalNature(k.endsWith(':') ? k + '1' : k));
}

describe('titres des propositions de l’adjoint', () => {
  it('chaque nature proposée par le commandement a un titre propre (pas la phrase radio)', () => {
    const list = natures();
    // le relevé trouve bien les natures connues (garde-fou contre un relevé vide)
    for (const k of ['dispositif', 'leve', 'regroupe', 'halte', 'riposte', 'appui', 'canon', 'centaure', 'bond', 'retour', 'bravm', 'sommation',
      'approche', 'releve', 'ravit', 'logistique', 'metro:rouvre', 'dispersion', 'renfort', 'incident', 'obstacle_voie']) {
      expect(list, k).toContain(k);
    }
    for (const k of list) {
      expect(hasPlainTitle(k), k).toBe(true);
      const title = proposalTitle({ key: k, text: 'Chef, quelque chose, je propose autre chose.' });
      expect(title, k).not.toBe('');
      expect(title, k).not.toMatch(/Chef|PARLEZ|TERMINÉ|je propose/);
    }
  });

  it('noms d’unités, de lieux et nombres repris de la phrase radio', () => {
    const t = (key: string, text: string): string => proposalTitle({ key, text });
    expect(t('dispositif', 'Chef, QUATRE-ZÉRO débouchés à tenir autour du parcours, je propose la mise en place du dispositif.'))
      .toBe('Tenir les 40 rues qui donnent sur le parcours');
    expect(t('leve:3', 'Chef, la queue du cortège a dépassé rue Royale, je propose de lever le barrage.'))
      .toBe('Lever le barrage de rue Royale\u00a0: le cortège est passé');
    expect(t('regroupe:12', 'Chef, MISTRAL 2 est disponible, je propose de le garder en réserve au poste de commandement.'))
      .toBe('Ramener MISTRAL 2 en réserve au poste de commandement');
    expect(t('appui:4', 'Chef, MISTRAL 1 est pris à partie, je propose d’envoyer MISTRAL 3 en appui.')).toBe('Envoyer MISTRAL 3 aider MISTRAL 1');
    expect(t('bond:4', 'Chef, groupe hostile en formation rue de Rivoli, je propose un bond offensif de MISTRAL 1.')).toBe('Bond en avant de MISTRAL 1');
    expect(t('retour:5', 'Chef, MISTRAL 2 ALFA est sorti de son emplacement, je propose de le replacer.')).toBe('Remettre MISTRAL 2 ALFA à sa place');
    expect(t('releve:5', 'Chef, MISTRAL 2 demande la relève, je propose de la relever par MISTRAL 4.')).toBe('Relever MISTRAL 2 par MISTRAL 4');
    expect(t('ravit:5', 'Chef, MISTRAL 2 est à court de grenades, je propose un ravitaillement aux fourgons.')).toBe('Ravitailler MISTRAL 2 en grenades aux fourgons');
    expect(t('metro:rouvre', 'Chef, la dispersion est annoncée, la station Concorde est fermée, je propose de la rouvrir.')).toBe('Rouvrir la station Concorde');
    expect(t('metro:4', 'Chef, des renforts hostiles arrivent par la station Tuileries, je propose de demander sa fermeture.'))
      .toBe('Fermer la station Tuileries\u00a0: des renforts hostiles arrivent');
    expect(t('renfort:7', 'Chef, MISTRAL 3 : largeur insuffisante, avenue Gabriel, je propose d’envoyer MISTRAL 4 en renfort sur le barrage.'))
      .toBe('Envoyer MISTRAL 4 en renfort sur le barrage de MISTRAL 3');
    expect(t('poste:7', 'Chef, débouché rue Boissy-d’Anglas non tenu, je propose d’y placer MISTRAL 4.')).toBe('Faire tenir rue Boissy-d’Anglas par MISTRAL 4');
    expect(t('fermeture:2', 'Chef, débouché rue Cambon ouvert à la circulation, je propose de le fermer par barrières.')).toBe('Fermer rue Cambon aux voitures (barrières)');
    expect(t('incident:9', 'Chef, Feu de poubelles, rue Royale, je propose d’y envoyer un porte-extincteur.'))
      .toBe('Feu de poubelles, rue Royale\u00a0: y envoyer un porte-extincteur');
    expect(t('obstacle_voie', 'Chef, un véhicule bloque la voie, rue de Rivoli. Faire venir le Centaure pour le dégager ?'))
      .toBe('Faire pousser par le blindé Centaure le véhicule qui bloque la voie, rue de Rivoli');
    expect(t('obstacle_voie', 'Chef, un véhicule bloque la voie. Le faire circuler par MISTRAL 2 ?')).toBe('Faire circuler par MISTRAL 2 le véhicule qui bloque la voie');
    expect(t('halte', 'Chef, les violences ont cessé, je propose la halte à l’emploi de la force.')).toBe('Arrêter l’emploi de la force\u00a0: le calme est revenu');
  });

  it('nature inconnue : la phrase radio sans procédure ni chiffres épelés', () => {
    const t = proposalTitle({ key: 'nouveau', text: 'MISTRAL ICI MISTRAL ADJOINT. Chef, QUATRE-ZÉRO personnes rue Royale, à surveiller. PARLEZ.' });
    expect(t).toBe('40 personnes rue Royale, à surveiller');
    expect(t).not.toMatch(/QUATRE|ZÉRO|PARLEZ|ICI/);
    expect(hasPlainTitle('nouveau')).toBe(false);
    expect(cleanRadio('Reçu. TERMINÉ.')).toBe('Reçu.');
    expect(unspell('CINQ MILLE manifestants, UN-DEUX blessés')).toBe('5000 manifestants, 12 blessés');
  });
});
