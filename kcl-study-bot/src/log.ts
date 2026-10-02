const QUIET = process.argv.includes("--quiet");

export function log(msg: string): void {
  if (!QUIET) console.log(msg);
}

export function step(msg: string): void {
  if (!QUIET) console.log(`\u001b[36m→\u001b[0m ${msg}`);
}

export function ok(msg: string): void {
  if (!QUIET) console.log(`\u001b[32m✓\u001b[0m ${msg}`);
}

export function warn(msg: string): void {
  console.warn(`\u001b[33m!\u001b[0m ${msg}`);
}

export function fail(msg: string): void {
  console.error(`\u001b[31m✗\u001b[0m ${msg}`);
}

/** Exécute `jobs` avec au plus `limit` en parallèle, dans l'ordre d'arrivée. */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
}
