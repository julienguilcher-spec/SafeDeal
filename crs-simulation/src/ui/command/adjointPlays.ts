/* =====================================================================================
 * Titres en clair des propositions de l'adjoint (logique pure, sans DOM).
 *
 * L'adjoint parle à la radio (« Chef, QUATRE-ZÉRO débouchés à tenir autour du parcours, je propose la mise en place du
 * dispositif. ») ; l'écran montre un titre court qui dit ce que fera « Accepter » (« Tenir les 40 rues qui donnent sur
 * le parcours »). Le titre dépend de la nature de la proposition (`Proposal.key`, préfixe avant « : ») ; les noms
 * d'unités et de lieux sont repris de la phrase radio. Clé inconnue : la phrase radio nettoyée (chiffres en clair,
 * sans « PARLEZ », « TERMINÉ » ni indicatifs).
 * ===================================================================================== */

const DIGITS: Readonly<Record<string, string>> = {
  'ZÉRO': '0', 'ZERO': '0', 'UN': '1', 'DEUX': '2', 'TROIS': '3', 'QUATRE': '4', 'CINQ': '5', 'SIX': '6', 'SEPT': '7',
  'HUIT': '8', 'NEUF': '9',
};
const DIGIT_WORD = '(?:ZÉRO|ZERO|UN|DEUX|TROIS|QUATRE|CINQ|SIX|SEPT|HUIT|NEUF)';
// bornes de mot qui tiennent compte des lettres accentuées (\b ne les connaît pas)
const SPELLED = new RegExp(`(?<![\\p{L}\\p{N}])${DIGIT_WORD}(?:-${DIGIT_WORD})*(?: MILLE)?(?![\\p{L}\\p{N}])`, 'gu');

/** Nombres épelés à la radio remis en chiffres : « QUATRE-ZÉRO » → « 40 », « CINQ MILLE » → « 5000 ». */
export function unspell(text: string): string {
  return text.replace(SPELLED, (m) => {
    const thousand = m.endsWith(' MILLE');
    const core = thousand ? m.slice(0, -6) : m;
    const digits = core.split('-').map((d) => DIGITS[d] ?? '').join('');
    if (digits === '') return m;
    return thousand ? String(Number(digits) * 1000) : digits;
  });
}

/** Phrase radio sans les mots de procédure : « X ICI Y. », « PARLEZ », « TERMINÉ », « Chef, ». */
export function cleanRadio(text: string): string {
  let t = unspell(text.trim());
  // « MISTRAL ICI MISTRAL ADJOINT. » en tête
  t = t.replace(/^[A-ZÀ-ÖØ-Þ0-9 '’-]+ ICI [A-ZÀ-ÖØ-Þ0-9 '’-]+\.\s*/u, '');
  t = t.replace(/\s*(?<![\p{L}\p{N}])(PARLEZ|TERMINÉ)(?![\p{L}\p{N}])\.?/gu, '');
  t = t.replace(/^Chef,\s*/i, '');
  t = t.trim();
  if (t === '') return t;
  return t.charAt(0).toLocaleUpperCase('fr-FR') + t.slice(1);
}

/** « Chef, <constat>, je propose <proposition>. » → { obs, prop } (chiffres en clair). */
function split(text: string): { obs: string; prop: string } {
  const t = unspell(text.trim()).replace(/^Chef,\s*/i, '').replace(/[.?!]\s*$/, '');
  const i = t.lastIndexOf(', je propose ');
  if (i < 0) return { obs: t, prop: '' };
  return { obs: t.slice(0, i), prop: t.slice(i + ', je propose '.length) };
}

function cap(s: string): string {
  const t = s.trim();
  return t === '' ? t : t.charAt(0).toLocaleUpperCase('fr-FR') + t.slice(1);
}

/** Proposition à l'infinitif sans « de » / « d’ » en tête : « d’y envoyer X » → « Y envoyer X ». */
function infinitive(prop: string): string {
  return cap(prop.replace(/^(de |d’|d')/, ''));
}

function match(text: string, re: RegExp): string {
  const m = re.exec(text);
  return m && m[1] ? m[1].trim() : '';
}

type Titler = (obs: string, prop: string) => string;

/**
 * Titres par nature de proposition. Clé exacte (« halte ») ou préfixe suivi de « : » (« leve:3 » → « leve »).
 * Les natures sont celles de `cmd.act('<clé>'…)` et `adjoint.offer(cmd, '<clé>'…)` dans src/sim/police/command.
 */
const TITLES: Readonly<Record<string, Titler>> = {
  dispositif: (obs) => {
    const n = Number(match(obs, /^(\d+)\s/));
    if (n === 1) return 'Tenir la rue qui donne sur le parcours';
    return n > 1 ? `Tenir les ${n} rues qui donnent sur le parcours` : 'Tenir les rues qui donnent sur le parcours';
  },
  leve: (obs) => {
    const x = match(obs, /a dépassé (.+)$/);
    return x !== '' && x !== 'le barrage' ? `Lever le barrage de ${x}\u00a0: le cortège est passé` : 'Lever un barrage\u00a0: le cortège est passé';
  },
  regroupe: (obs) => {
    const x = match(obs, /^(.+?) (?:est disponible|n’est plus engagé|n'est plus engagé)/);
    return x !== '' ? `Ramener ${x} en réserve au poste de commandement` : 'Ramener une unité en réserve au poste de commandement';
  },
  halte: () => 'Arrêter l’emploi de la force\u00a0: le calme est revenu',
  riposte: () => 'Riposter au gaz à main\u00a0: vos unités sont attaquées',
  appui: (obs, prop) => {
    const hit = match(obs, /^(.+?) est pris à partie/);
    const res = match(prop, /^d’envoyer (.+?) en appui/) || match(prop, /^d'envoyer (.+?) en appui/);
    if (hit !== '' && res !== '') return `Envoyer ${res} aider ${hit}`;
    return hit !== '' ? `Envoyer une unité aider ${hit}` : 'Envoyer une unité en appui';
  },
  canon: () => 'Faire tirer le canon à eau',
  centaure: () => 'Engager le blindé Centaure',
  bond: (_obs, prop) => {
    const x = match(prop, /bond offensif de (.+)$/);
    return x !== '' ? `Bond en avant de ${x}` : 'Bond en avant';
  },
  retour: (obs) => {
    const x = match(obs, /^(.+?) est sorti de son emplacement/);
    return x !== '' ? `Remettre ${x} à sa place` : 'Remettre une unité à sa place';
  },
  bravm: () => 'Faire interpeller par la BRAV-M',
  sommation: () => 'Faire les sommations (attroupement)',
  approche: () => 'Rapprocher la réserve',
  releve: (obs, prop) => {
    const x = match(obs, /^(.+?) demande la relève/);
    const y = match(prop, /relever par (.+)$/);
    if (x !== '' && y !== '') return `Relever ${x} par ${y}`;
    return x !== '' ? `Relever ${x}` : 'Relever une unité';
  },
  ravit: (obs) => {
    const x = match(obs, /^(.+?) est à court de grenades/);
    return x !== '' ? `Ravitailler ${x} en grenades aux fourgons` : 'Ravitailler en grenades aux fourgons';
  },
  logistique: () => 'Demander un ravitaillement à la logistique',
  'metro:rouvre': (obs) => {
    const x = match(obs, /la station (.+?) est fermée/);
    return x !== '' ? `Rouvrir la station ${x}` : 'Rouvrir la station de métro';
  },
  metro: (obs) => {
    const x = match(obs, /par la station (.+)$/);
    return x !== '' ? `Fermer la station ${x}\u00a0: des renforts hostiles arrivent` : 'Fermer une station de métro\u00a0: des renforts hostiles arrivent';
  },
  dispersion: () => 'Passer les barrages en filtrage pour laisser sortir la foule',
  fin: () => 'Regrouper et rembarquer\u00a0: la dispersion est effective',
  renfort: (obs, prop) => {
    const x = match(obs, /^(.+?) : largeur insuffisante/) || match(obs, /^(.+?)\u00a0: largeur insuffisante/);
    const y = match(prop, /envoyer (.+?) en renfort/);
    if (x !== '' && y !== '') return `Envoyer ${y} en renfort sur le barrage de ${x}`;
    return 'Renforcer un barrage trop large';
  },
  fermeture: (obs) => {
    const x = match(obs, /^débouché (.+?) ouvert à la circulation/);
    return x !== '' && x !== 'latéral' ? `Fermer ${x} aux voitures (barrières)` : 'Fermer un débouché aux voitures (barrières)';
  },
  poste: (obs, prop) => {
    const x = match(obs, /^débouché (.+?) non tenu/);
    const y = match(prop, /y placer (.+)$/);
    if (x !== '' && y !== '' && x !== 'latéral') return `Faire tenir ${x} par ${y}`;
    return y !== '' ? `Placer ${y} sur un débouché non tenu` : 'Tenir un débouché non tenu';
  },
  incident: (obs, prop) => {
    if (prop === '') return cap(obs);
    const p = infinitive(prop);
    return `${cap(obs)}\u00a0: ${p.charAt(0).toLocaleLowerCase('fr-FR')}${p.slice(1)}`;
  },
  obstacle_voie: (obs) => {
    const x = match(obs, /bloque la voie, (.+?)\./);
    const at = x !== '' ? ', ' + x : '';
    const by = match(obs, /faire circuler par (.+?)\s*\??$/i);
    if (by !== '') return `Faire circuler par ${by} le véhicule qui bloque la voie${at}`;
    return `Faire pousser par le blindé Centaure le véhicule qui bloque la voie${at}`;
  },
};

/** Nature d'une proposition d'après sa clé (« leve:3 » → « leve » ; « metro:rouvre » est une nature à part). */
export function proposalNature(key: string): string {
  if (Object.prototype.hasOwnProperty.call(TITLES, key)) return key;
  const i = key.indexOf(':');
  return i > 0 ? key.slice(0, i) : key;
}

/** La proposition a un titre propre (sinon : phrase radio nettoyée). */
export function hasPlainTitle(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(TITLES, proposalNature(key));
}

/** Titre en clair d'une proposition de l'adjoint (« Tenir les 40 rues qui donnent sur le parcours »). */
export function proposalTitle(p: { key: string; text: string }): string {
  const fn = TITLES[proposalNature(p.key)];
  if (!fn) return cleanRadio(p.text).replace(/[.]\s*$/, '');
  const { obs, prop } = split(p.text);
  return fn(obs, prop);
}
