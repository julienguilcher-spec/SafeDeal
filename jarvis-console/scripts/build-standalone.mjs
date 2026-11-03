// Génère standalone/index.html : un seul fichier, sans build, three.js et le SDK Anthropic chargés depuis des CDN.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const THREE_VERSION = JSON.parse(read('package.json')).dependencies.three;
const SDK_VERSION = JSON.parse(read('package.json')).dependencies['@anthropic-ai/sdk'];
const ORDER = ['data', 'engine', 'core', 'agents', 'links', 'camera', 'hud', 'sim', 'brain', 'main'];

const tslNames = new Set(); const addonImports = new Set(); const bodies = [];
for (const name of ORDER) {
  let src = read(`src/${name}.js`);
  src = src.replace(/^import\s+'\.\/styles\.css';\s*$/m, '');
  src = src.replace(/^import \* as THREE from 'three\/webgpu';\s*$/m, '');
  src = src.replace(/^import \{([^}]*)\} from 'three\/tsl';\s*$/m, (_, names) => { names.split(',').map((s) => s.trim()).filter(Boolean).forEach((n) => tslNames.add(n)); return ''; });
  src = src.replace(/^import (\{[^}]*\}|\w+) from 'three\/addons\/[^']+';\s*$/gm, (line) => { addonImports.add(line.trim()); return ''; });
  src = src.replace(/^import \{[^}]*\} from '\.\/[\w-]+\.js';\s*$/gm, '');
  src = src.replace(/^export \{[^}]*\};\s*$/gm, '');
  if (/^(import|export) /m.test(src)) throw new Error(`Import ou export résiduel dans ${name}.js`);
  bodies.push(`/* ===== ${name}.js ===== */\n${src.trim()}\n`);
}
const header = [
  "import * as THREE from 'three/webgpu';",
  `import { ${[...tslNames].sort().join(', ')} } from 'three/tsl';`,
  ...addonImports,
].join('\n');
const script = `<script type="module">\n${header}\n\n${bodies.join('\n')}\n</script>`;

const importMap = `<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/build/three.webgpu.js",
    "three/webgpu": "https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/build/three.webgpu.js",
    "three/tsl": "https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/build/three.tsl.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/examples/jsm/",
    "@anthropic-ai/sdk": "https://esm.sh/@anthropic-ai/sdk@${SDK_VERSION}"
  }
}
</script>`;
let html = read('index.html');
html = html.replace('<link href="https://fonts.googleapis.com', `${importMap}\n<style>\n${read('src/styles.css').trim()}\n</style>\n<link href="https://fonts.googleapis.com`);
html = html.replace('<script type="module" src="/src/main.js"></script>', script);
fs.mkdirSync(path.join(root, 'standalone'), { recursive: true });
fs.writeFileSync(path.join(root, 'standalone/index.html'), html);
console.log(`standalone/index.html : ${(html.length / 1024).toFixed(0)} ko`);
