// Vérification permanente — INTERFACE DE CHAQUE RÔLE, sur ordinateur (1280×720, clavier) et sur téléphone (844×390, doigts).
// Pour chaque rôle / poste du catalogue : partie lancée par l'URL (une fois depuis l'accueil par appareil), puis HUD (rien hors
// écran, rien sous une commande tactile, aucun texte anglais ou de remplissage), boutons tactiles du rôle (pertinents et qui
// reçoivent le doigt), bloc « ORDRES » des chefs, carte « Ma mission » de l'exécutant (l'ordre d'abord), roue d'ordres (7
// secteurs pour un chef, 2 pour un exécutant), carte de commandement (disposition et nombre de commandes par rôle : chef ou
// lecture seule ; ouverture, fermeture), pause (tous les boutons atteignables), zéro erreur console.
// Code de sortie : 0 seulement si toutes les vérifications passent. Résumé par rôle à la fin.
// Usage : node tests/e2e/verif-roles-interface.mjs [--device=tel|pc|tous] [--roles=crs:bouclier,manifestant:pacifique] [--accueil=0]
import { startServer, openPage, waitFor, ouvrirEditeur, frames, step, snap, fingers, rects, overlap, args, J } from './verif-fin-lib.mjs';
import { makeChecker } from './verif-fin-lib.mjs';

const tag = 'verif-roles-interface';
const C = makeChecker(tag);

/** Rôles et postes du catalogue (src/ui/screens/catalog.ts) : [rôle, poste, variante, lieu]. */
const ALL = [
  ['crs', 'bouclier', '', 'place de la République'],
  ['crs', 'lanceur', '', 'place de la Concorde'],
  ['crs', 'conducteur', '', 'place de la Bastille'],
  ['chef_groupe', 'chef_groupe', '', 'place de la République'],
  ['chef_groupe', 'chef_section', '', 'place de la Nation'],
  ['commandant', 'commandant_unite', 'terrain', 'place de la Concorde'],
  ['commandant', 'commandant_unite', 'salle', 'place de la Concorde'],
  ['commissaire', 'autorite_civile', '', 'place de la Bastille'],
  ['bravm', 'pilote_moto', '', 'place de la République'],
  ['bravm', 'passager_moto', '', 'place de la République'],
  ['gendarme_centaure', 'conducteur', '', 'place de la Nation'],
  ['operateur_canon_eau', 'conducteur', '', 'place de la Concorde'],
  ['telepilote', 'telepilote', '', 'place de la République'],
  ['patrouille', 'conducteur', 'bac', 'place de l’Opéra'],
  ['patrouille', 'interpellation', 'police_secours', 'place de la République'],
  ['street_medic', '', '', 'place de la Bastille'],
  ['secouriste', '', 'pompier', 'place de la République'],
  ['secouriste', '', 'samu', 'place de la République'],
  ['journaliste', '', '', 'place de la Concorde'],
  ['manifestant', '', 'pacifique', 'place de la Bastille'],
  ['manifestant', '', 'radical', 'place de la Bastille'],
];
const wanted = args.roles ? args.roles.split(',') : null;
const ROLES = ALL.filter(([r, p, v]) => !wanted || wanted.some((w) => w === r || w === `${r}:${p || v}` || w === `${r}:${v}` || w === `${r}:${p}:${v}`));
const DEVICES = (args.device ?? 'tous') === 'tous' ? ['tel', 'pc'] : [args.device];
const SIZES = { tel: [844, 390], pc: [1280, 720] };

/** Mots anglais ou de remplissage qui ne doivent jamais apparaître dans l'interface. */
const BAD_TEXT = /\b(undefined|null|NaN|TODO|lorem|placeholder|Loading|Settings|Resume|Quit|Pause menu|Press|Click)\b|\[object/;

const summary = {};
const sumOf = (key) => (summary[key] ??= { checks: 0, fails: [] });
let current = '';
const check = (ok, msg, detail = '') => {
  const s = sumOf(current);
  s.checks++;
  if (!ok) s.fails.push(msg);
  return C.check(ok, `[${current}] ${msg}`, detail);
};

const server = await startServer();
let exitCode = 0;
try {
  for (const device of DEVICES) {
    const [W, H] = SIZES[device];
    const mobile = device === 'tel';
    const { browser, page, errors } = await openPage(`${server.url}?quality=bas`, { width: W, height: H, mobile, pointerLock: false });
    const F = mobile ? await fingers(page) : null;
    const center = (r) => [r.x + r.w / 2, r.y + r.h / 2];
    const ctl = async (key) => (await rects(page, `.crs-touch .ct-k-${key}`)).find((r) => !/ct-off/.test(r.cls));
    const tapCtl = async (key) => { const r = await ctl(key); if (!r) return false; await F.tap(...center(r)); await frames(page, 3); return true; };
    const screenNow = () => page.evaluate(() => ({ screen: window.__CRS.ctx.ui.current, phase: window.__CRS.ctx.session.phase }));
    const press = async (code) => { await page.keyboard.down(code); await frames(page, 2); await page.keyboard.up(code); await frames(page, 2); };
    /** Ferme l'écran ouvert : au doigt (bouton de fermeture) sur téléphone, Échap sur ordinateur. */
    const closeScreen = async () => {
      for (let i = 0; i < 3; i++) {
        const s = await screenNow();
        if (s.screen === null) return true;
        const b = mobile ? (await rects(page, '[data-id="tac-close"], [data-id="plan-close"], [data-id="pause-reprendre"], .ui-screen [data-id="fermer"], [aria-label="Fermer"]'))[0] : null;
        if (b) await F.tap(...center(b)); else await press('Escape');
        await page.waitForTimeout(300); await frames(page, 2);
      }
      return (await screenNow()).screen === null;
    };

    // ── une fois par appareil : lancement depuis l'accueil (tuile, onglet, « Lancer ») ──
    if (args.accueil !== '0') {
      current = `${device}/accueil`;
      await waitFor(page, 'window.__CRS && window.__CRS.ready === true', 300000);
      await waitFor(page, 'window.__CRS.ctx.ui.current === "menu_principal"', 60000);
      await ouvrirEditeur(page);
      await frames(page, 3);
      await snap(page, `${tag}-${device}-accueil`);
      const dims = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight }));
      check(dims.w <= W + 1, 'accueil : aucune largeur qui déborde', J(dims));
      const head = await page.evaluate(() => {
        const name = document.querySelector('.ui-brand__name');
        const nav = document.querySelector('.ui-home__nav');
        if (!name || !nav) return null;
        const a = name.getBoundingClientRect();
        const b = nav.getBoundingClientRect();
        return { nameRight: Math.round(Math.min(a.right, a.left + name.scrollWidth)), navLeft: Math.round(b.left), cut: name.scrollWidth > name.clientWidth + 1 };
      });
      check(!!head && head.nameRight <= head.navLeft + 1 && !head.cut, 'accueil : le nom du jeu entier, sans passer sous les boutons du bandeau', J(head));
      const click = async (sel) => {
        await page.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: 'center' }), sel);
        await frames(page, 2);
        const r = (await rects(page, sel))[0];
        if (!r) return false;
        if (F) await F.tap(...center(r)); else await page.mouse.click(...center(r));
        await frames(page, 3);
        return true;
      };
      check(await click('[data-id="role-manifestant"]'), 'tuile « Manifestant »');
      check(await click('[data-id="lancer"]'), 'bouton « Lancer »');
      await waitFor(page, 'window.__CRS.ctx.session.phase === "playing"', 400000);
      await step(page, 1);
      check((await page.evaluate(() => window.__CRS.ctx.player.state.role)) === 'manifestant', 'la partie lancée depuis l’accueil est celle choisie');
    }

    for (const [role, poste, variante, place] of ROLES) {
      current = `${device}/${role}${poste ? ':' + poste : ''}${variante ? ':' + variante : ''}`;
      const q = new URLSearchParams({ autostart: 'paris', nomenu: '1', mode: 'libre', role, place, crowd: '60', quality: 'bas', seed: '7', time: '12', weather: 'clair' });
      if (poste) q.set('poste', poste);
      if (variante) q.set('variante', variante);
      errors.length = 0;
      try {
        await page.goto(`${server.url}?${q}`, { waitUntil: 'load', timeout: 120000 });
        await waitFor(page, 'window.__CRS && window.__CRS.ready === true && window.__CRS.ctx.session.phase === "playing"', 400000);
        // (premier toucher hors de tout bouton : le centre de l'écran porte les pastilles d'ordres depuis la version 23)
        if (mobile) { const r = await rects(page, 'body'); if (r[0]) await F.tap(Math.round(W * 0.71), Math.round(H * 0.77)); }
        await step(page, 2);
        await frames(page, 3);
        const name = `${tag}-${current.replace(/[/:]/g, '-')}`;
        await snap(page, name + '-jeu');

        // HUD : rien hors écran, aucun texte anglais / de remplissage
        const hud = await rects(page, '.ui-hud > :not(.hud-slot), .ui-hud .hud-slot > :not(.hud-w), .ui-hud .hud-w > *, .ui-hud [data-id]');
        const off = hud.filter((r) => r.w > 4 && r.h > 4 && (r.x < -2 || r.y < -2 || r.x + r.w > W + 2 || r.y + r.h > H + 2));
        check(off.length === 0, 'aucun élément du HUD hors de l’écran', off.map((r) => `${r.cls.split(' ')[0]}@${r.x},${r.y} ${r.w}×${r.h}`).join(' ; '));
        const text = await page.evaluate(() => (document.querySelector('#ui')?.innerText || ''));
        const bad = text.match(BAD_TEXT);
        check(!bad, 'aucun texte anglais ni de remplissage à l’écran', bad ? `« ${bad[0]} » dans « ${text.slice(Math.max(0, bad.index - 40), bad.index + 40).replace(/\s+/g, ' ')} »` : '');

        // sous-titres : jamais sur un bouton du HUD (« Accepter » / « Plus tard » de la proposition, « Secours »…)
        const subs = await rects(page, '.ui-subs > *');
        const btns = await rects(page, '.ui-hud button');
        const subOver = [];
        for (const a of subs) for (const b of btns) if (overlap(a, b) > 40) subOver.push(`« ${a.text.slice(0, 24)} » × ${b.id || b.text}`);
        check(subOver.length === 0, 'aucun sous-titre sur un bouton du HUD', subOver.slice(0, 4).join(' ; '));

        if (mobile) {
          const controls = (await rects(page, '.crs-touch .ct-c')).filter((r) => !/ct-off/.test(r.cls));
          const items = await rects(page, '.crs-touch .ct-item');
          const blocks = hud.filter((r) => !/hud-prompt|hud-slot/.test(r.cls) && r.w * r.h < W * H * 0.5);
          const over = [];
          const nm = (r) => r.id || (r.cls.match(/ct-k-(\w+)/)?.[0]) || r.cls.split(' ')[0];
          for (const a of blocks) for (const b of [...controls, ...items]) { const o = overlap(a, b); if (o > 40) over.push(`${nm(a)}×${nm(b)} (${o} px²)`); }
          check(over.length === 0, 'aucun élément du HUD sous une commande tactile', over.slice(0, 6).join(' ; '));
          // commandes qui se chevauchent entre elles
          const cc = [];
          for (let i = 0; i < controls.length; i++) for (let j = i + 1; j < controls.length; j++) if (overlap(controls[i], controls[j]) > 20) cc.push(`${nm(controls[i])}×${nm(controls[j])}`);
          check(cc.length === 0, 'aucune commande tactile sur une autre', cc.join(' ; '));
          // chaque commande reçoit le doigt sur toute sa surface (centre et coins intérieurs)
          const miss = await page.evaluate(() => {
            const out = [];
            for (const el of document.querySelectorAll('.crs-touch .ct-c:not(.ct-off)')) {
              const b = el.getBoundingClientRect();
              if (b.width < 2 || getComputedStyle(el).display === 'none') continue;
              for (const [fx, fy] of [[0.5, 0.5], [0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]]) {
                const hit = document.elementFromPoint(b.left + b.width * fx, b.top + b.height * fy);
                if (!hit || !(hit === el || el.contains(hit))) { out.push(`${(el.className.match(/ct-k-\w+/) || [''])[0]} (${fx},${fy}) ← ${hit ? hit.className || hit.tagName : 'rien'}`); break; }
              }
            }
            return out;
          });
          check(miss.length === 0, 'chaque bouton tactile reçoit le doigt sur toute sa surface', miss.slice(0, 5).join(' ; '));
          // boutons qui ne servent à rien pour la personne incarnée
          const useless = await page.evaluate(() => {
            const c = window.__CRS.ctx;
            const p = c.player.person();
            if (!p || p.vehicleId) return [];
            const out = [];
            const shown = (k) => { const e = document.querySelector('.crs-touch .ct-l-pied.ct-k-' + k); return !!e && !e.classList.contains('ct-off') && e.getBoundingClientRect().width > 0; };
            const h = p.look.headgear;
            const visor = h === 'casque_crs' || h === 'casque_gendarme' || h === 'casque_moto' || h === 'casque_pompier';
            if (shown('visor') && !visor) out.push('Visière sans visière (' + h + ')');
            if (shown('mask') && !p.look.gasMask && !c.actions.has(p, 'masque_gaz')) out.push('Masque sans masque à gaz');
            if (shown('lamp') && !c.actions.has(p, 'lampe')) out.push('Lampe sans lampe torche');
            return out;
          });
          check(useless.length === 0, 'seuls les boutons utiles au rôle sont affichés', useless.join(' ; '));
          // à bord sans être au volant : ni volant, ni pédales, ni avertisseurs
          const seated = await page.evaluate(() => {
            const c = window.__CRS.ctx;
            const p = c.player.person();
            const v = p ? c.player.vehicle() : null;
            if (!p || !v) return null;
            const role = v.def.seats[p.seat]?.role ?? '?';
            const shown = [...document.querySelectorAll('.crs-touch .ct-drv')].filter((e) => e.getBoundingClientRect().width > 0 && getComputedStyle(e).display !== 'none').map((e) => e.getAttribute('aria-label'));
            const stick = getComputedStyle(document.querySelector('.crs-touch .ct-stick')).display !== 'none';
            return { role, vehicle: v.def.name, shown, stick };
          });
          if (seated) {
            const driver = seated.role === 'driver';
            check(driver ? seated.shown.length > 0 && seated.stick : seated.shown.length === 0 && !seated.stick,
              driver ? 'au volant : volant, pédales et avertisseurs affichés' : 'passager : ni volant, ni pédales, ni avertisseurs', J(seated));
          }
        }

        // qui commande ? (« lecture » : exécutant ; autre : chef) — police seulement
        const who = await page.evaluate(() => {
          const c = window.__CRS.ctx;
          const cmd = c.service('ui.command');
          const p = c.player.person();
          return { police: !!p && p.faction === 'police', level: cmd && cmd.scope ? cmd.scope().level : '' };
        });
        const chief = who.police && who.level !== '' && who.level !== 'lecture';
        // bloc d'ordres (chefs, ordres directs §1.6) : ligne d'état, ordre prêt, touches « A avec moi · … », « Secours ici »
        // (ordinateur) ; pastille « Avec moi » sous la mini-carte (téléphone)
        if (chief) {
          const orders = await page.evaluate(() => {
            const shown = (q) => { const e = document.querySelector(q); return !!e && !e.classList.contains('is-off') && e.getBoundingClientRect().width > 0; };
            const b = document.querySelector('[data-id="hud-orders"]');
            return {
              block: !!b && b.getBoundingClientRect().width > 0, text: b ? b.innerText.replace(/\s+/g, ' ') : '', withMe: shown('[data-id="quick-with-me"]'),
              state: shown('[data-id="hud-state"]'), ready: shown('[data-id="hud-ready"]'), rescue: shown('[data-id="quick-rescue"]'),
            };
          });
          if (mobile) check(orders.withMe, 'chef (téléphone) : la pastille « Avec moi » sous la mini-carte', J(orders));
          else check(orders.block && orders.state && orders.ready && orders.rescue && /avec moi/.test(orders.text) && !/SANS ORDRE/.test(orders.text), 'chef : bloc d’ordres (ligne d’état, ordre prêt, « A avec moi », Secours ici)', orders.text.slice(0, 160));
        }
        // exécutant CRS : la carte « Ma mission » commence par l'ordre (« ORDRE DU … » ou « MA MISSION », puis l'ordre)
        if (role === 'crs') {
          const mis = await page.evaluate(() => {
            const card = document.querySelector('.hud-mis');
            const vis = (q) => { const e = card && card.querySelector(q); return e && e.getBoundingClientRect().height > 0 ? e.innerText.replace(/\s+/g, ' ').trim() : ''; };
            return { cap: vis('.hud-mis__head .hud-cap'), order: vis('.hud-mis__order'), l1: vis('.hud-mis__l1') };
          });
          if (mobile) check(mis.l1 !== '', 'CRS (téléphone) : « Ma mission » en deux lignes, l’ordre d’abord', J(mis));
          else check(/^(ORDRE (DU|DE) |ORDRE REÇU|MA MISSION)/.test(mis.cap) && mis.order !== '', 'CRS : « Ma mission » commence par l’ordre (« ORDRE DU … »)', J(mis));
        }
        // roue d'ordres (ordres directs, direct/words.ts) : 7 secteurs pour un chef (1, 3 à 8 ; le 2 est un alias du 1, non
        // dessiné), 2 pour un exécutant (« Avec moi » 1 et « Secours ici » 7, mêmes numéros)
        if (who.police) {
          if (mobile) { if (!(await tapCtl('orders'))) C.note(`[${current}] bouton « Ordres » absent`); } else await press('KeyF');
          await page.waitForTimeout(400); await frames(page, 3);
          const wheel = await page.evaluate(() => ({
            screen: window.__CRS.ctx.ui.current,
            wedges: document.querySelectorAll('[data-id="order-wheel"] .cw-wedge').length,
            keys: [...document.querySelectorAll('[data-id="order-wheel"] .cw-key')].map((e) => e.textContent).join(','),
          }));
          if (wheel.screen === 'roue_ordres') {
            check(chief ? wheel.wedges === 7 && wheel.keys === '1,3,4,5,6,7,8' : wheel.wedges === 2 && wheel.keys === '1,7', `roue d’ordres : ${chief ? 'sept secteurs 1, 3 à 8 (chef)' : 'deux secteurs 1 et 7 (exécutant)'}`, J(wheel));
            await page.evaluate(() => window.__CRS.ctx.ui.close('roue_ordres'));
            await frames(page, 3);
          } else C.note(`[${current}] roue d’ordres non ouverte (${wheel.screen})`);
        }

        // carte tactique : ouverture et fermeture
        if (mobile) await tapCtl('tactical'); else await press('Tab');
        await page.waitForTimeout(500); await frames(page, 3);
        let s = await screenNow();
        check(s.screen === 'carte_tactique', 'la carte de commandement s’ouvre', String(s.screen));
        if (s.screen === 'carte_tactique') {
          await snap(page, name + '-tactique');
          // disposition par rôle : chef = six intentions et « Plus… », au plus 14 commandes fixes (13 au téléphone) ;
          // lecture seule = ni intentions ni ordres, Fermer / + / − / Moi seulement (✕ et ◎ au téléphone)
          const lay = await page.evaluate(() => {
            const root = document.querySelector('[data-id="tactical"]');
            const btns = [...document.querySelectorAll('[data-id="tactical"] button')].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(b).visibility !== 'hidden'; }).map((b) => b.dataset.id || b.textContent.trim().slice(0, 16));
            return { readonly: !!root && root.classList.contains('is-readonly'), btns };
          });
          const fixed = lay.btns.filter((id) => id !== 'tac-model-ok' && !/^todo-|^follow-/.test(id));
          if (chief) {
            check(!lay.readonly && fixed.filter((id) => /^intent-/.test(id)).length === 6 && fixed.includes('tac-more') && fixed.length <= (mobile ? 13 : 14) + (fixed.includes('tac-drone') ? 1 : 0), `carte (chef) : six intentions, « Plus… », au plus ${mobile ? 13 : 14} commandes fixes (+ « Vue drone » quand un drone est engagé)`, `${fixed.length} : ${fixed.join(' · ')}`);
          } else if (who.police || who.level === 'lecture') {
            // (« Vue drone » en plus quand un drone est engagé : le télépilote, par exemple)
            check(lay.readonly && !fixed.some((id) => /^intent-|^tac-more$/.test(id)) && fixed.length <= (mobile ? 3 : 4) + (fixed.includes('tac-drone') ? 1 : 0), 'carte (lecture seule) : ni intention ni ordre, au plus Fermer, +, −, Moi (+ « Vue drone » quand un drone est engagé)', `${fixed.length} : ${fixed.join(' · ')}`);
          }
          const offT = (await rects(page, '.ui-screen button, .ui-screen [role="button"]')).filter((r) => r.x + r.w > W + 2 || r.x < -2);
          check(offT.length === 0, 'carte de commandement : aucun bouton hors de l’écran en largeur', offT.slice(0, 4).map((r) => r.text || r.cls).join(' ; '));
        }
        check(await closeScreen(), 'la carte de commandement se referme (Échap, ✕ au doigt)');

        // pause : chaque bouton atteignable (au besoin en faisant défiler)
        if (mobile) await tapCtl('pause'); else await press('Escape');
        await page.waitForTimeout(400); await frames(page, 3);
        s = await screenNow();
        check(s.screen === 'pause' && s.phase === 'paused', 'la pause s’ouvre', `${s.screen}/${s.phase}`);
        if (s.screen === 'pause') {
          await snap(page, name + '-pause');
          const unreachable = await page.evaluate(([w, h]) => {
            const out = [];
            for (const b of document.querySelectorAll('[data-id^="pause-"]')) {
              b.scrollIntoView({ block: 'center' });
              const r = b.getBoundingClientRect();
              if (r.width === 0) continue;
              const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
              if (r.bottom > h + 1 || r.right > w + 1 || r.top < -1 || !hit || !(hit === b || b.contains(hit))) out.push(b.getAttribute('data-id'));
            }
            return out;
          }, [W, H]);
          check(unreachable.length === 0, 'pause : chaque bouton atteignable', unreachable.join(', '));
        }
        check(await closeScreen(), 'la pause se referme (Échap)');
        s = await screenNow();
        check(s.phase === 'playing', 'la partie reprend', s.phase);
        check(errors.length === 0, 'zéro erreur console', errors.slice(0, 3).join(' | ').slice(0, 400));
      } catch (err) {
        check(false, 'exception pendant le parcours', String(err && err.stack ? err.stack : err).slice(0, 400));
        try { await snap(page, `${tag}-${current.replace(/[/:]/g, '-')}-echec`); } catch { /* page fermée */ }
      }
    }
    await browser.close().catch(() => {});
  }
} finally {
  await server.close().catch(() => {});
}
console.log('\n── Résumé par rôle ──');
for (const [k, v] of Object.entries(summary)) console.log(`  ${v.fails.length ? '✗' : '✓'} ${k} : ${v.checks - v.fails.length}/${v.checks}${v.fails.length ? ' — ' + v.fails.join(' ; ') : ''}`);
C.done({ summary });
if (C.failures.length) exitCode = 1;
process.exit(exitCode);
