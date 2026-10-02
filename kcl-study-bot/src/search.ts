import type { StoredChunk } from "./corpus.js";

/** Mots trop fréquents pour discriminer, en français et en anglais. */
const STOPWORDS = new Set(
  ("le la les un une des de du au aux et ou est sont ce cet cette ces en dans sur pour par avec sans que qui quoi " +
    "dont ou mais donc or ni car il elle ils elles on nous vous je tu se sa son ses leur leurs plus moins tres " +
    "the a an of to in on for and or is are was were be been it its this that these those with without as at by " +
    "from we you they he she i not no but so if then than there here what which who whom how why when where")
    .split(" "),
);

export function tokenize(s: string): string[] {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && t.length < 30 && !STOPWORDS.has(t));
}

export interface SearchHit {
  chunk: StoredChunk;
  score: number;
}

interface Posting {
  tokens: string[];
  counts: Map<string, number>;
  length: number;
}

export class SearchIndex {
  private readonly postings: Posting[];
  private readonly df = new Map<string, number>();
  private readonly avgLength: number;

  constructor(readonly chunks: StoredChunk[]) {
    this.postings = chunks.map((c) => {
      // Le titre et le repère comptent dans l'index : « semaine 3 » doit matcher.
      const tokens = tokenize(`${c.course} ${c.title} ${c.anchor ?? ""} ${c.text}`);
      const counts = new Map<string, number>();
      for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
      for (const t of counts.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
      return { tokens, counts, length: tokens.length };
    });
    const total = this.postings.reduce((s, p) => s + p.length, 0);
    this.avgLength = this.postings.length ? total / this.postings.length : 1;
  }

  /** BM25 classique (k1 = 1.5, b = 0.75). */
  private scoreOne(i: number, queryTokens: string[]): number {
    const p = this.postings[i];
    if (!p.length) return 0;
    const k1 = 1.5;
    const b = 0.75;
    const n = this.postings.length;
    let score = 0;
    for (const t of queryTokens) {
      const tf = p.counts.get(t);
      if (!tf) continue;
      const df = this.df.get(t) ?? 0;
      const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
      score += (idf * (tf * (k1 + 1))) / (tf + k1 * (1 - b + (b * p.length) / this.avgLength));
    }
    return score;
  }

  search(query: string, { k = 12, courseId }: { k?: number; courseId?: number } = {}): SearchHit[] {
    const queryTokens = tokenize(query);
    if (!queryTokens.length) return [];
    const hits: SearchHit[] = [];
    for (let i = 0; i < this.postings.length; i++) {
      if (courseId !== undefined && this.chunks[i].courseId !== courseId) continue;
      const score = this.scoreOne(i, queryTokens);
      if (score > 0) hits.push({ chunk: this.chunks[i], score });
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, k);
  }

  /**
   * Cherche avec plusieurs reformulations et fusionne : un passage trouvé par
   * deux formulations différentes remonte, sans compter deux fois le doublon.
   */
  searchMany(queries: string[], { k = 12, courseId }: { k?: number; courseId?: number } = {}): SearchHit[] {
    const best = new Map<string, SearchHit>();
    for (const q of queries) {
      for (const hit of this.search(q, { k: k * 2, courseId })) {
        const seen = best.get(hit.chunk.id);
        if (!seen) best.set(hit.chunk.id, { ...hit });
        else seen.score = Math.max(seen.score, hit.score) + Math.min(seen.score, hit.score) * 0.25;
      }
    }
    return [...best.values()].sort((a, b) => b.score - a.score).slice(0, k);
  }
}
