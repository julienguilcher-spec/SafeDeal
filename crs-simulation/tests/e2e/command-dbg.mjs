import { startServer, openPage, waitFor, shot, finish } from './lib.mjs';
const server = await startServer();
const { browser, page, errors } = await openPage(server.url + 'harness/command.html?role=chef_groupe&freeze=1&ai=0');
await waitFor(page, 'window.__ready === true');
await page.waitForTimeout(800);
page.on('console', (m) => { if (m.text().startsWith('DBG')) console.log(m.text()); });
await page.evaluate(() => {
  const b = window.__cmd;
  let n = 0;
  const f = () => {
    const st = b.ui.stack();
    const inp = b.ctx.input;
    if (st.length || inp.down('orders') || inp.pressed('orders') || inp.released('orders')) {
      const inst = b.ui.instance('roue_ordres');
      console.log('DBG', n, JSON.stringify(st), 'down', inp.down('orders'), 'pressed', inp.pressed('orders'), 'rel', inp.released('orders'), inst ? `held ${inst.held} age ${inst.age.toFixed(3)} hl ${inst.wheel && inst.wheel.highlighted}` : '');
    }
    if (++n < 120) requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
});
await page.mouse.move(640, 250);
await page.keyboard.press('KeyF');
await page.waitForTimeout(900);
await finish({ browser, server, errors, label: 'dbg' });
