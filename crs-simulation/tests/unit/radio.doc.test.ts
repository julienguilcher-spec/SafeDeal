/* =====================================================================================
 * Radio — documentation générée : src/gameplay/radio/PHRASES.md est produit ici, à partir de la bibliothèque.
 *
 *   Vérifier qu'il est à jour :   npx vitest run tests/unit/radio.doc
 *   Le régénérer :                RADIO_DOC=write npx vitest run tests/unit/radio.doc
 *   Relire toutes les variantes : RADIO_DUMP=/chemin/vers/un/fichier.txt npx vitest run tests/unit/radio.doc
 *                                 (chaque variante rendue avec les valeurs d'exemple, puis avec les valeurs par défaut)
 * ===================================================================================== */

import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createTestContext } from '@/core/testing';
import { createSystems } from '@/gameplay/radio';
import type { PhraseParams, RadioControl, RadioPhrases } from '@/gameplay/radio';
import { RADIO_CONTROL_SERVICE, RADIO_PHRASES_SERVICE } from '@/gameplay/radio';
import { ALL_PHRASES, paramsOf } from '@/gameplay/radio/phrase-lib';
import { PARAM_SPECS } from '@/gameplay/radio/phrases/defaults';
import type { PhraseDef } from '@/gameplay/radio/phrases/define';

const DOC = new URL('../../src/gameplay/radio/PHRASES.md', import.meta.url);

/** Valeurs d'exemple : un barrage place de la Concorde, vers dix-sept heures. */
const SAMPLE: Readonly<Record<string, string | number>> = {
  unite: 'MISTRAL 2', cible: 'MISTRAL 3', renfort: 'ÉPERVIER 3', autre: 'MISTRAL 1', heure: 17 + 4 / 60,
  lieu: 'place de la Concorde', destination: 'place de la Madeleine', voie: 'rue Royale', issue: 'rue de Rivoli',
  acces: 'rue Saint-Florentin', station: 'Concorde', direction: 'nord', vers: 'rue Cambon', limite: 'rue de la Paix',
  effectif: 70, indisponibles: 1, interpelles: 2, lanceur: 6, lbd: 0,
  distance: 30, duree: 3, litres: 4000, eau: 500, pct: 25,
  moyen: 'à pied', mission: 'interdire le pont de la Concorde', cadre: 'manifestation déclarée', nature: 'cortège déclaré',
  attitude: 'calme', gravite: 'légère', type: 'feu de poubelles', objet: 'poubelles et barrières de chantier',
  motif: 'jet de projectile sur agents', signalement: 'veste verte, bonnet noir, sac rouge',
  raison: 'unité engagée sur un autre incident', demande: 'l\'arrêt de la tête de cortège',
  meteo: 'ciel couvert, vent d\'ouest',
};

/** {nombre} n'a pas le même ordre de grandeur selon ce qu'il compte : valeur d'exemple d'après le libellé qui le précède. */
function sampleCount(template: string): number {
  const label = /([^.:,]*)\s*:\s*\{nombre\}/.exec(template)?.[1]?.toLowerCase() ?? '';
  if (/volume/.test(label)) return /vague|devant|précortège/.test(label) ? 400 : 3000;
  if (/fourgons|grenades|lacrymogènes/.test(label)) return 12;
  if (/sections|journalistes|interpellés|^\s*nombre\s*$/.test(label)) return 2;
  if (/agents/.test(label)) return 14;
  if (/points|accès/.test(label)) return 4;
  if (/effectif demandé/.test(label)) return 16;
  if (/contrôlées/.test(label)) return 60;
  return 40;
}

function sampleFor(def: PhraseDef, variant: number): PhraseParams {
  return { ...SAMPLE, nombre: sampleCount(def.variants[variant]!) };
}

const END_LABEL = { parlez: 'PARLEZ', termine: 'TERMINÉ', aucun: '—' } as const;

function render(phrases: RadioPhrases): string {
  const lines: string[] = [];
  const groups: string[] = [];
  for (const def of ALL_PHRASES) if (!groups.includes(def.group)) groups.push(def.group);
  const variants = ALL_PHRASES.reduce((n, d) => n + d.variants.length, 0);

  lines.push('# Radio — bibliothèque de phrases', '');
  lines.push(`${ALL_PHRASES.length} situations, ${variants} variantes (de 3 à 5 par situation), ${groups.length} familles.`);
  lines.push('Fichier généré par `tests/unit/radio.doc.test.ts` d\'après `phrases/*.ts` : ne pas le modifier à la main.');
  lines.push('Pour le régénérer : `RADIO_DOC=write npx vitest run tests/unit/radio.doc`.', '');

  lines.push('## Utilisation', '', '```ts');
  lines.push('const phrases = ctx.require<RadioPhrases>(\'radio.phrases\');   // import { RADIO_PHRASES_SERVICE } from \'@/gameplay/radio\'');
  lines.push('phrases.say(\'prise_position\', {}, { squad });                              // indicatif, secteur et face déduits de l\'unité');
  lines.push('phrases.say(\'bond_offensif\', { distance: 30 }, { to: squad, at: point });   // ordre du commandant à une unité');
  lines.push('phrases.say(\'secours_attente_securisation\', {}, { from: \'SAPEUR 1\', at });  // les pompiers disent une phrase du SAMU');
  lines.push('phrases.text(\'sommation_premiere\', { heure: 17.07, issue: \'rue de Rivoli\' }); // texte seul, variante 0');
  lines.push('```', '');
  lines.push('- Tous les paramètres sont facultatifs : une valeur par défaut donne une phrase correcte, sans accolade, qui n\'affirme rien que l\'appelant n\'a pas fourni (« non précisé », « à évaluer »).');
  lines.push('- Les variantes d\'une situation disent la même chose avec d\'autres mots : la variante est tirée au hasard, jamais deux fois de suite la même.');
  lines.push('- `say(clé, params, options)` retourne `false` si la clé est inconnue ou si le message est écarté (anti-répétition, file saturée).');
  lines.push('- Options : `squad` (unité qui parle : indicatif, secteur, direction de face ; pour un ordre du commandant ou un message de la salle, l\'unité à qui l\'on parle), `at` (position dont on parle : nomme le secteur), `to` (destinataire : unité ou indicatif), `from` (indicatif imposé à l\'émetteur), `personId`, `channel`, `priority`, `variant`.');
  lines.push('- Un nombre fourni en paramètre est dit à la radio, chiffre par chiffre (`45` → « QUATRE-CINQ », `5000` → « CINQ MILLE », `100` → « CENT »). Une chaîne est reprise telle quelle.');
  lines.push('- Forme du message : `APPELÉ ICI APPELANT. Corps. PARLEZ.` (réponse attendue) ou `TERMINÉ.` ; une réponse s\'écrit `ICI APPELANT. Corps. TERMINÉ.` ; pas de formule de fin quand le corps se termine par « FAITES L\'APERÇU », « COLLATIONNEZ » ou « ATTENDEZ ».');
  lines.push('- Canal : « commandement » dès que la salle (CENTRAL) est l\'un des correspondants, « unite » à l\'intérieur de la compagnie, « secours » pour les demandes et les comptes rendus de secours. Un appel et sa réponse passent par le même canal.');
  lines.push('- Le commandant est le chef unique (commandement et autorité habilitée) : il parle sous l\'indicatif de sa compagnie, somme et décide lui-même ; aucune phrase ne demande d\'autorisation à une autre autorité. Un ordre sans destinataire (`cible` absent) est adressé à « TOUTES UNITÉS ».');
  lines.push('- Les situations `ambiance_*` (priorité 0) sont émises par le générateur d\'ambiance, qui vérifie que le thème est vrai dans le monde ; les autres modules n\'ont pas à les employer.', '');

  lines.push('## Correspondants', '');
  lines.push('| Rôle | Indicatif | Remplacement |', '|---|---|---|');
  lines.push('| `unite` | celui de l\'unité (`options.squad`), sinon la compagnie | paramètre `unite`, `options.from` |');
  lines.push('| `cible` | unité désignée par le commandant, sinon « TOUTES UNITÉS » | paramètre `cible`, `options.to` |');
  lines.push('| `commandant` | la compagnie : « MISTRAL » (`session.config.extra.compagnie`) | — |');
  lines.push('| `central` | « CENTRAL » | — |');
  lines.push('| `tous` | « TOUTES UNITÉS » | — |');
  lines.push('| `drone`, `canon`, `centaure`, `bravm`, `liaison` | « ICARE », « NEPTUNE 1 », « CENTAURE 1 », « FAUCON 1 », « LIAISON », ou l\'unité réelle de ce type | paramètre du même nom, `options.from` / `options.to` |');
  lines.push('| `samu`, `pompiers` | « SANTÉ 1 », « SAPEUR 1 » | paramètre du même nom, `options.from` / `options.to` |', '');

  lines.push('## Paramètres', '');
  lines.push('| Paramètre | Sens | Valeur par défaut |', '|---|---|---|');
  lines.push('| `heure` | heure dite à la radio : nombre 0..24 (« UNE-SEPT heures ZÉRO-QUATRE ») ou texte | heure de la session |');
  for (const [name, spec] of Object.entries(PARAM_SPECS)) lines.push(`| \`${name}\` | ${spec.doc} | « ${spec.fallback} » |`);
  lines.push('');

  lines.push('## Situations', '');
  lines.push('L\'exemple est la première variante, rendue avec des valeurs d\'exemple.', '');
  for (const g of groups) {
    lines.push(`### ${g}`, '');
    lines.push('| Clé | De → à | Canal | Prio | Fin | Var. | Paramètres | Exemple |', '|---|---|---|---|---|---|---|---|');
    for (const def of ALL_PHRASES) {
      if (def.group !== g) continue;
      const params = paramsOf(def).map((p) => '`' + p + '`').join(' ');
      const way = def.reply ? `${def.from} → ${def.to} (réponse)` : `${def.from} → ${def.to}`;
      const example = phrases.text(def.key, sampleFor(def, 0), 0);
      lines.push(`| \`${def.key}\` | ${way} | ${def.channel} | ${def.priority} | ${END_LABEL[def.end]} | ${def.variants.length} | ${params} | ${example} |`);
    }
    lines.push('');
  }
  return frenchSpaces(lines).join('\n');
}

/** Typographie française du document : espaces insécables avant ; : ! ? et dans les guillemets, hors blocs de code. */
function frenchSpaces(lines: readonly string[]): string[] {
  const NB = '\u00a0';
  let code = false;
  return lines.map((line) => {
    if (line.startsWith('```')) {
      code = !code;
      return line;
    }
    if (code) return line;
    return line.replace(/ ([;:!?»])/g, `${NB}$1`).replace(/« /g, `«${NB}`);
  });
}

describe('radio — documentation', () => {
  it('PHRASES.md est à jour avec la bibliothèque (le régénérer : RADIO_DOC=write)', async () => {
    const t = createTestContext({ seed: 1, modules: [createSystems] });
    await t.start({ seed: 1, timeOfDay: 17 });
    t.ctx.require<RadioControl>(RADIO_CONTROL_SERVICE).ambient = false;
    const phrases = t.ctx.require<RadioPhrases>(RADIO_PHRASES_SERVICE);
    const expected = render(phrases);

    if (process.env['RADIO_DUMP']) {
      const out: string[] = [];
      for (const def of ALL_PHRASES) {
        out.push(`## ${def.key}  [${def.group}]  ${def.from} → ${def.to}  ${def.channel}  prio ${def.priority}`);
        def.variants.forEach((_v, i) => out.push(`  ${i + 1}. ${phrases.text(def.key, sampleFor(def, i), i)}`));
        def.variants.forEach((_v, i) => out.push(`  ${i + 1}' ${phrases.text(def.key, {}, i)}`));
      }
      writeFileSync(process.env['RADIO_DUMP'], out.join('\n') + '\n');
    }
    if (process.env['RADIO_DOC'] === 'write') writeFileSync(DOC, expected);

    expect(readFileSync(DOC, 'utf8'), 'PHRASES.md est périmé : RADIO_DOC=write npx vitest run tests/unit/radio.doc').toBe(expected);
  });
});
