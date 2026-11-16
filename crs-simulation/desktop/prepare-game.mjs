// Copie le jeu construit (../dist) dans ./game avant l'empaquetage.
import { cpSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, '..', 'dist');
if (!existsSync(path.join(dist, 'index.html'))) {
  console.error('dist/index.html introuvable : lancez d’abord « npm run build » dans crs-simulation.');
  process.exit(1);
}
const game = path.join(here, 'game');
rmSync(game, { recursive: true, force: true });
cpSync(dist, game, { recursive: true });
console.log('jeu copié dans', game);
