import { startServer, openPage, waitFor, shot, finish } from './lib.mjs';
const server = await startServer();
const { browser, page, errors } = await openPage(server.url + 'harness/command.html?role=chef_groupe&freeze=1&ai=0');
await waitFor(page, 'window.__ready === true');
await page.waitForTimeout(800);
page.on('console', (m) => { if (m.text().startsWith('DBG')) console.log(m.text()); });
const log = () => page.evaluate(() => {
  const b = window.__cmd; let n = 0;
  const f = () => {
    const st = b.ui.stack(); const inp = b.ctx.input;
    if (st.length || inp.down('orders') || inp.pressed('orders') || inp.released('orders')) {
      const inst = b.ui.instance('roue_ordres');
      console.log('DBG', n, JSON.stringify(st), 'down', inp.down('orders'), 'pressed', inp.pressed('orders'), inst ? `held ${inst.held} age ${inst.age.toFixed(3)} ticks ${inst.ticks} hl ${inst.wheel && inst.wheel.highlighted} hover ${inst.wheel && inst.wheel.hoverEnabled}` : '');
    }
    if (++n < 50) requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
});
await page.keyboard.down('KeyF');
await page.waitForTimeout(400);
await page.mouse.move(640, 360);
await page.mouse.move(640, 250, { steps: 4 });
await page.waitForTimeout(200);
await page.keyboard.up('KeyF');
await page.waitForTimeout(400);
await log();
await page.keyboard.press('KeyF');
await page.waitForTimeout(900);
await finish({ browser, server, errors, label: 'dbg' });
