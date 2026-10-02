export interface Args {
  /** Arguments positionnels, dans l'ordre. */
  positional: string[];
  flags: Map<string, string[]>;
  booleans: Set<string>;
}

/**
 * Analyseur minimal : `--clé valeur` (répétable), `--drapeau`, et le reste en
 * positionnel. `--` arrête l'analyse et verse tout dans les positionnels.
 */
export function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  const flags = new Map<string, string[]>();
  const booleans = new Set<string>();

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--") {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const [name, inline] = splitOnce(token.slice(2), "=");
    const next = argv[i + 1];
    if (inline !== undefined) {
      push(flags, name, inline);
    } else if (next !== undefined && !next.startsWith("--")) {
      push(flags, name, next);
      i++;
    } else {
      booleans.add(name);
    }
  }
  return { positional, flags, booleans };
}

function splitOnce(s: string, sep: string): [string, string | undefined] {
  const at = s.indexOf(sep);
  return at === -1 ? [s, undefined] : [s.slice(0, at), s.slice(at + 1)];
}

function push(map: Map<string, string[]>, key: string, value: string): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

export function one(args: Args, name: string): string | undefined {
  return args.flags.get(name)?.[0];
}

export function many(args: Args, name: string): string[] {
  return args.flags.get(name) ?? [];
}

export function has(args: Args, name: string): boolean {
  return args.booleans.has(name) || args.flags.has(name);
}

export function int(args: Args, name: string, fallback: number): number {
  const v = one(args, name);
  if (v === undefined) return fallback;
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n) || n <= 0) throw new Error(`--${name} attend un entier positif, reçu « ${v} »`);
  return n;
}
