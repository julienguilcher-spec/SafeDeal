import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "./config.js";

export interface SeenEntry {
  name: string;
  firstSeen: string;
  score?: number;
  shortlistedOn?: string;
}

export interface State {
  version: 1;
  /** Next recipe index to start from (rotation cursor). */
  recipeCursor: number;
  /** Per-recipe page cursor so repeated recipes dig deeper each time. */
  recipePages: Record<string, number>;
  /** Every candidate key ever surfaced, so a person is never emailed twice. */
  seen: Record<string, SeenEntry>;
  runs: Array<{ date: string; recipes: string[]; fetched: number; scored: number; shortlisted: number }>;
}

const EMPTY: State = { version: 1, recipeCursor: 0, recipePages: {}, seen: {}, runs: [] };

export function loadState(file = CONFIG.stateFile): State {
  if (!fs.existsSync(file)) return structuredClone(EMPTY);
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<State>;
  return { ...structuredClone(EMPTY), ...parsed };
}

export function saveState(state: State, file = CONFIG.stateFile): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, file);
}
