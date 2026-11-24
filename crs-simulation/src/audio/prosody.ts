/* =====================================================================================
 * Prosodie — découpage approximatif d'un texte français en syllabes (logique pure).
 *
 * Sert à donner aux slogans scandés et à la voix de mégaphone un RYTHME qui suit le texte :
 * une syllabe par groupe de voyelles, « e » muet final ignoré, dernière syllabe de chaque mot
 * accentuée (l'accent tonique français tombe sur la finale). Ce n'est pas un phonétiseur :
 * seuls le nombre de syllabes, la couleur de la voyelle et les accents comptent.
 * ===================================================================================== */

/** Couleur de voyelle : a, o, e (é/è/eu), i (i/u), u (« ou »). */
export type Vowel = 'a' | 'o' | 'e' | 'i' | 'u';

export interface Syllable {
  vowel: Vowel;
  /** Syllabe accentuée (fin de mot plein). */
  stress: boolean;
  /** Dernière syllabe d'un groupe terminé par une ponctuation : suivie d'une respiration. */
  pause: boolean;
}

const VOWELS = 'aàâäeéèêëiîïoôöuùûüyœ';
const MAX_SYLLABLES = 28;

function isVowel(ch: string): boolean {
  return VOWELS.indexOf(ch) >= 0;
}

/** Classe un groupe de voyelles (« eau », « ou », « ai »…) suivi éventuellement d'une nasale. */
function classify(group: string, nasal: boolean): Vowel {
  if (group.indexOf('ou') >= 0 || group.indexOf('oû') >= 0 || group.indexOf('où') >= 0) return 'u';
  if (group.indexOf('oi') >= 0) return 'a';
  if (group.indexOf('eau') >= 0 || group.indexOf('au') >= 0) return 'o';
  if (group.indexOf('ai') >= 0 || group.indexOf('ei') >= 0) return 'e';
  if (group.indexOf('eu') >= 0 || group.indexOf('œ') >= 0) return 'e';
  const last = group[group.length - 1]!;
  if (nasal) {
    if (last === 'o' || last === 'ô') return 'o';
    if (last === 'a' || last === 'e') return 'a'; // « an », « en »
    return 'e';                                    // « in », « un »
  }
  if (last === 'a' || last === 'à' || last === 'â' || last === 'ä') return 'a';
  if (last === 'o' || last === 'ô' || last === 'ö') return 'o';
  if (last === 'i' || last === 'î' || last === 'ï' || last === 'y') return 'i';
  if (last === 'u' || last === 'ù' || last === 'û' || last === 'ü') return 'i';
  return 'e';
}

/**
 * Découpe `text` en syllabes. Écrit dans `out` (vidé) et le retourne.
 * Au plus 28 syllabes : au-delà le texte est tronqué (un slogan ou une annonce n'est jamais plus long).
 */
export function syllabify(text: string, out: Syllable[] = []): Syllable[] {
  out.length = 0;
  const s = text.toLowerCase();
  const n = s.length;
  let i = 0;
  while (i < n && out.length < MAX_SYLLABLES) {
    // saute les séparateurs
    while (i < n && !isLetter(s[i]!)) i++;
    if (i >= n) break;
    const wordStart = i;
    while (i < n && isLetter(s[i]!)) i++;
    const wordEnd = i;
    // ponctuation qui suit le mot ?
    let j = wordEnd;
    let pause = false;
    while (j < n && !isLetter(s[j]!)) {
      const c = s[j]!;
      if (c === ',' || c === '.' || c === '!' || c === '?' || c === ';' || c === ':' || c === '—' || c === '–') pause = true;
      j++;
    }
    if (j >= n) pause = true;
    const first = out.length;
    let k = wordStart;
    while (k < wordEnd && out.length < MAX_SYLLABLES) {
      if (!isVowel(s[k]!)) { k++; continue; }
      const g0 = k;
      while (k < wordEnd && isVowel(s[k]!)) k++;
      const group = s.slice(g0, k);
      const next = k < wordEnd ? s[k]! : '';
      const after = k + 1 < wordEnd ? s[k + 1]! : '';
      const nasal = (next === 'n' || next === 'm') && !isVowel(after) && after !== 'n' && after !== 'm';
      // « e » muet en fin de mot (« -e », « -es », « -ent ») quand le mot a déjà une autre syllabe
      const rest = s.slice(k, wordEnd);
      const mute = group === 'e' && out.length > first && (rest === '' || rest === 's' || rest === 'nt');
      if (!mute) out.push({ vowel: classify(group, nasal), stress: false, pause: false });
    }
    const count = out.length - first;
    if (count > 0) {
      const lastSyl = out[out.length - 1]!;
      // Les mots outils d'une syllabe (« le », « à », « la »…) ne portent pas d'accent, sauf en fin de groupe.
      lastSyl.stress = count >= 2 || pause || wordEnd - wordStart >= 4;
      lastSyl.pause = pause;
    }
    i = wordEnd;
  }
  if (out.length > 0) {
    const last = out[out.length - 1]!;
    last.stress = true;
    last.pause = true;
  }
  return out;
}

function isLetter(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || VOWELS.indexOf(ch) >= 0 || ch === 'ç' || ch === 'ñ';
}

export interface Beat {
  /** Instant de l'attaque, en secondes depuis le début de la phrase. */
  t: number;
  /** Durée tenue de la syllabe (s). */
  len: number;
  vowel: Vowel;
  stress: boolean;
}

/**
 * Rythme scandé : une syllabe par temps (`beat` secondes), les syllabes accentuées tenues plus
 * longtemps, un silence d'un temps après chaque respiration. La phrase est complétée jusqu'à un
 * nombre pair de temps pour que la reprise tombe en mesure. Retourne la durée totale d'une phrase.
 */
export function chantBeats(syl: readonly Syllable[], beat: number, out: Beat[]): number {
  out.length = 0;
  let t = 0;
  let beats = 0;
  for (let i = 0; i < syl.length; i++) {
    const s = syl[i]!;
    out.push({ t, len: beat * (s.stress ? 0.82 : 0.6), vowel: s.vowel, stress: s.stress });
    t += beat;
    beats++;
    if (s.pause) {
      t += beat;
      beats++;
    }
  }
  if (beats % 2 === 1) t += beat;
  return t;
}

/**
 * Débit de parole (mégaphone, radio) : syllabes plus brèves, irrégulières, respiration aux
 * ponctuations. `rnd` apporte une légère irrégularité. Retourne la durée totale.
 */
export function speechBeats(syl: readonly Syllable[], rate: number, rnd: () => number, out: Beat[]): number {
  out.length = 0;
  let t = 0;
  for (let i = 0; i < syl.length; i++) {
    const s = syl[i]!;
    const len = (s.stress ? 0.25 : 0.16) * (0.9 + 0.2 * rnd()) / rate;
    out.push({ t, len: len * 0.9, vowel: s.vowel, stress: s.stress });
    t += len;
    if (s.pause) t += (0.28 + 0.12 * rnd()) / rate;
  }
  return t;
}

/** Estimation de la durée (s) d'un texte lu à voix haute — sert à caler le souffle radio sans synthèse vocale. */
export function estimateSpeechSeconds(text: string, rate = 1): number {
  const syl = syllabify(text);
  let t = 0;
  for (let i = 0; i < syl.length; i++) t += (syl[i]!.stress ? 0.25 : 0.16) + (syl[i]!.pause ? 0.3 : 0);
  // Un texte tronqué par la limite de syllabes dure plus longtemps : extrapolation sur la longueur.
  if (syl.length >= MAX_SYLLABLES) t = Math.max(t, text.length * 0.065);
  return t / rate;
}
