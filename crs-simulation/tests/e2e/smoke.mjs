import { startServer, openPage, waitFor, shot, finish } from './lib.mjs';
const server = await startServer();
const t0 = Date.now();
const { browser, page, errors } = await openPage(server.url + 'harness/smoke.html');
await waitFor(page, 'window.__frames > 5');
const file = await shot(page, 'smoke');
const frames = await page.evaluate(() => window.__frames);
console.log('capture :', file, '| images rendues :', frames, '| ms :', Date.now() - t0);
await finish({ browser, server, errors, label: 'smoke' });
