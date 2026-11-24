import { describe, expect, it } from 'vitest';
import { CAREER_CHAPTERS, CAMPAIGN_SEMAINE } from '@/gameplay/missions/catalog/career';
import { MISSIONS } from '@/gameplay/missions/catalog';

/**
 * Liste de contrôle de neutralité (BRIEF §4) : aucun parti, syndicat ni personnalité réels, aucune marque.
 * Les organisations de la manifestation sont fictives. Recherche insensible à la casse (mots entiers).
 */
const INSENSIBLE_A_LA_CASSE = [
  // partis, mouvements politiques réels
  'rassemblement national', 'front national', 'france insoumise', 'insoumis', 'les républicains',
  'parti socialiste', 'parti communiste', 'europe écologie', 'modem', 'reconquête',
  'nouveau front populaire', 'lutte ouvrière', 'npa', 'generation.s', 'ump', 'udi',
  // syndicats réels
  'cgt', 'cfdt', 'cftc', 'cfe-cgc', 'unsa', 'solidaires', 'force ouvrière', 'fsu', 'sud-rail', 'unef', 'fnsea', 'confédération paysanne',
  'alliance police', 'unité sgp', 'syndicat de la magistrature',
  // personnalités
  'macron', 'le pen', 'mélenchon', 'sarkozy', 'hollande', 'darmanin', 'retailleau', 'lallement', 'nuñez', 'castaner',
  'attal', 'bardella', 'zemmour', 'hidalgo', 'ruffin', 'tondelier', 'villepin',
  'philippe poutou', 'trump', 'poutine', 'biden', 'zelensky',
  // marques
  'peugeot', 'renault', 'citroën', 'mercedes', 'toyota', 'tesla', 'nike', 'adidas', 'zara', 'starbucks', 'mcdonald',
  'monoprix', 'vélib', 'velib', 'lime', 'uber', 'bolt', 'apple', 'iphone', 'samsung', 'google', 'facebook',
  'twitter', 'instagram', 'tiktok', 'youtube', 'whatsapp', 'telegram', 'bfm', 'cnews', 'tf1', 'le figaro',
  'le parisien', 'cartier', 'chanel', 'louis vuitton', 'dior', 'hermès', 'rolex', 'lacoste', 'decathlon',
  'fnac', 'bnp', 'société générale', 'crédit agricole', 'hsbc', 'bouygues', 'sfr', 'taser', 'glock', 'flash-ball',
  'cougar', 'canon eos', 'nikon', 'sony', 'gopro', 'dji', 'yamaha', 'honda', 'harley',
];

const SENSIBLE_A_LA_CASSE = ['PS', 'PCF', 'EELV', 'LFI', 'RN', 'LR', 'FO', 'SUD', 'CGT', 'CFDT'];

function echapper(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function corpus(): Array<{ id: string; texte: string }> {
  return MISSIONS.map((m) => ({ id: m.id, texte: JSON.stringify(m).replace(/ /g, ' ') }));
}

describe('catalogue de missions : neutralité et absence de marques', () => {
  it('aucun mot de la liste de contrôle (partis, syndicats, personnalités, marques réels)', () => {
    const trouves: string[] = [];
    for (const { id, texte } of corpus()) {
      for (const mot of INSENSIBLE_A_LA_CASSE) {
        const re = new RegExp(`(?<![\\p{L}\\p{N}])${echapper(mot)}(?![\\p{L}\\p{N}])`, 'iu');
        if (re.test(texte)) trouves.push(`${id} : « ${mot} »`);
      }
      for (const sigle of SENSIBLE_A_LA_CASSE) {
        const re = new RegExp(`(?<![\\p{L}\\p{N}])${sigle}(?![\\p{L}\\p{N}])`, 'u');
        if (re.test(texte)) trouves.push(`${id} : sigle « ${sigle} »`);
      }
    }
    expect(trouves).toEqual([]);
  });

  it('les organisations citées pour les cortèges sont les entités fictives du dossier', () => {
    const fictives = [
      'Front commun des Ateliers', 'Collectif Lumière Pour Tous', 'Bonnets Blancs', 'Coordination Étudiante Rive Gauche',
      'Blouses Claires', 'Convoi des Champs', 'Veilleurs de Minuit', 'Racing Lutèce', 'Olympique des Ponts',
      'République de Valdoria', 'Comité Valdoria Libre', 'Routiers de Lutèce',
    ];
    const tout = corpus().map((c) => c.texte).join(' ');
    for (const f of fictives.slice(0, 6)) expect(tout, f).toContain(f);
  });

  it('les textes ne contiennent ni adresse, ni lien, ni numéro de téléphone', () => {
    for (const { id, texte } of corpus()) {
      expect(texte, id).not.toMatch(/https?:|www\.|@[a-z]|\b0[1-9]( ?\d{2}){4}\b/i);
    }
  });

  it('la carrière et la campagne ne citent aucun nom réel non plus', () => {
    const t = JSON.stringify([CAREER_CHAPTERS, CAMPAIGN_SEMAINE]).toLowerCase();
    for (const mot of ['cgt', 'cfdt', 'macron', 'le pen', 'mélenchon']) {
      expect(t, mot).not.toContain(mot);
    }
  });
});
