/* =====================================================================================
 * Interface — feuille de style des écrans : accueil, paramètres, pause, chargement, compte rendu,
 * crédits. Écran bas (téléphone en paysage, hauteur < 520 px) : onglets en bandeau horizontal,
 * résumé resserré, marges réduites.
 * ===================================================================================== */

export const CSS_SCREENS = `
.ui-full { position: absolute; inset: 0; display: grid; overflow: hidden;
  padding: var(--ui-safe-t) var(--ui-safe-r) var(--ui-safe-b) var(--ui-safe-l);
  background: radial-gradient(1100px 640px at 20% -14%, #182a49 0%, rgba(11, 18, 32, 0) 62%), linear-gradient(#0b1220, #070c16); }
.ui-full::before { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 3px; background: var(--ui-tricolor); z-index: 2; }

/* ── marque ── */
.ui-brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
.ui-brand__mark { width: 30px; height: 30px; flex: none; }
.ui-brand__name { font-size: 15px; font-weight: 750; letter-spacing: .3em; color: #fff; white-space: nowrap; }
.ui-brand__tag { font-size: 12px; color: var(--ui-text-mute); letter-spacing: .03em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* ── accueil ── */
.ui-home { grid-template-rows: auto minmax(0, 1fr); }
.ui-home__top { display: flex; align-items: center; gap: 16px; padding: 14px 22px 8px; min-width: 0; }
.ui-home__nav { margin-left: auto; display: flex; gap: 4px; flex: none; }
.ui-home__body { display: grid; grid-template-columns: 236px minmax(0, 1fr) 306px; gap: 14px; padding: 6px 22px 20px; min-height: 0; }
.ui-home__rail { padding: 8px; min-height: 0; align-self: start; max-height: 100%; }
.ui-home__content { display: grid; grid-template-rows: auto minmax(0, 1fr); min-height: 0; min-width: 0; }
.ui-home__head { padding: 16px 20px 6px; display: grid; gap: 2px; }
.ui-home__pane { padding: 8px 20px 18px; min-height: 0; }
.ui-home__pane > * > .ui-section-title:first-child, .ui-window__pane > * > .ui-section-title:first-child { margin-top: 0; }
.ui-home__summary { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; min-height: 0; min-width: 0; }
.ui-sum__head { padding: 18px 18px 10px; display: grid; gap: 8px; }
.ui-sum__who { display: flex; align-items: center; gap: 11px; min-width: 0; }
.ui-sum__badge { width: 42px; height: 42px; border-radius: 10px; background: var(--ui-blue); display: grid; place-items: center; flex: none; color: #fff; }
.ui-sum__badge .ui-ic { width: 25px; height: 25px; }
.ui-sum__role { font-size: 15.5px; font-weight: 700; color: #fff; line-height: 1.2; }
.ui-sum__mode { font-size: 12.5px; color: var(--ui-text-dim); }
.ui-sum__body { padding: 0 18px 6px; min-height: 0; }
.ui-sum__row { display: grid; grid-template-columns: 20px minmax(0, 1fr); column-gap: 10px; align-items: start; padding: 7px 0; border-top: 1px solid var(--ui-line); font-size: 13.5px; line-height: 1.35; }
.ui-sum__row .ui-ic { width: 17px; height: 17px; margin-top: 1px; color: var(--ui-text-mute); }
.ui-sum__row b { font-weight: 650; color: #fff; }
.ui-sum__row span { color: var(--ui-text-dim); }
.ui-sum__actions { padding: 10px 18px 16px; display: grid; gap: 8px; border-top: 1px solid var(--ui-line); }
.ui-sum__pair { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
.ui-sum__hint { font-size: 12px; color: var(--ui-text-mute); text-align: center; line-height: 1.5; }
.ui-sum__hint .ui-key { height: 20px; min-width: 22px; font-size: 11px; padding: 0 5px; margin: 0 2px; }

.ui-compo-bar { display: flex; height: 12px; border-radius: 6px; overflow: hidden; background: rgba(160, 180, 215, .16); }
.ui-compo-bar i { display: block; height: 100%; min-width: 0; box-shadow: inset -1px 0 0 rgba(6, 11, 21, .55); }
.ui-compo-bar i[data-f="black_bloc"] { background-image: repeating-linear-gradient(45deg, #1c1f26 0 4px, #3a3f4b 4px 6px); }
.ui-compo { display: grid; gap: 0; }
.ui-compo__row { display: grid; grid-template-columns: 12px 148px minmax(0, 1fr) 46px; align-items: center; column-gap: 10px; }
.ui-compo__dot { width: 12px; height: 12px; border-radius: 3px; box-shadow: 0 0 0 1px rgba(255, 255, 255, .25); }
.ui-compo__label { font-size: 14px; font-weight: 550; }
.ui-compo__pct { font-size: 14px; font-weight: 700; text-align: right; color: #fff; }

.ui-place { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 320px); gap: 16px; align-items: start; }
.ui-miniplan { position: relative; border-radius: 8px; border: 1px solid var(--ui-line-strong); background: #0a111f; overflow: hidden; }
.ui-miniplan canvas { display: block; width: 100%; height: auto; }
.ui-miniplan__cap { position: absolute; left: 8px; bottom: 6px; right: 8px; font-size: 11px; color: var(--ui-text-mute); text-shadow: 0 1px 2px #000; pointer-events: none; }
.ui-place__side { display: grid; gap: 8px; position: sticky; top: 0; }

.ui-sky { position: relative; height: 66px; border-radius: 8px; overflow: hidden; border: 1px solid var(--ui-line-strong); --t: .5; --y: .5;
  background: linear-gradient(#5d97d4, #b9d4ea 78%, #d9d2bb); transition: background-color .2s; }
.ui-sky[data-phase="crepuscule"] { background: linear-gradient(#2c3f6b, #c8785a 72%, #f0b36a); }
.ui-sky[data-phase="nuit"] { background: linear-gradient(#060b18, #101c36 80%, #1a2748); }
.ui-sky__disc { position: absolute; left: calc(6% + var(--t) * 88%); top: calc(8px + var(--y) * 40px); width: 22px; height: 22px; margin-left: -11px; border-radius: 50%; background: #fff3c4; box-shadow: 0 0 18px 6px rgba(255, 240, 180, .55); }
.ui-sky[data-phase="nuit"] .ui-sky__disc { background: #e8edf6; box-shadow: 0 0 12px 3px rgba(220, 230, 250, .35); }
.ui-sky__roofs { position: absolute; left: 0; right: 0; bottom: 0; height: 16px; background:
  linear-gradient(to right, #0b1220 0 6%, transparent 6% 7%, #0b1220 7% 19%, transparent 19% 20.500%, #0b1220 20.500% 34%, transparent 34% 35%, #0b1220 35% 52%, transparent 52% 53.500%, #0b1220 53.500% 71%, transparent 71% 72%, #0b1220 72% 88%, transparent 88% 89%, #0b1220 89% 100%) 0 6px / 100% 10px no-repeat,
  linear-gradient(to right, transparent 10%, #0b1220 10% 14%, transparent 14% 42%, #0b1220 42% 47%, transparent 47% 76%, #0b1220 76% 82%, transparent 82%) 0 0 / 100% 6px no-repeat; opacity: .92; }
.ui-sky__label { position: absolute; left: 10px; top: 7px; font-size: 12px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: #fff; text-shadow: 0 1px 3px rgba(0, 0, 0, .6); }

.ui-means { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 22px; }
.ui-mean { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 9px 0; border-top: 1px solid var(--ui-line); }
.ui-mean:nth-child(-n+2) { border-top: 0; }
.ui-mean__label { font-size: 14.5px; font-weight: 600; }
.ui-mean__hint { font-size: 12px; color: var(--ui-text-mute); line-height: 1.3; }
.ui-note { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border-radius: 8px; background: rgba(59, 139, 235, .1); border: 1px solid rgba(59, 139, 235, .3); font-size: 13px; color: #cfdcf2; line-height: 1.4; }
.ui-note .ui-ic { width: 17px; height: 17px; color: var(--ui-blue-hi); margin-top: 1px; }
.ui-note--warn { background: rgba(255, 214, 10, .08); border-color: rgba(255, 214, 10, .35); color: #f3e7b0; }
.ui-note--warn .ui-ic { color: var(--ui-yellow); }
.ui-inline { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ui-inline > .ui-input { flex: 1 1 180px; width: auto; }
.ui-stars { letter-spacing: 1px; color: var(--ui-yellow); font-size: 12px; }

.ui-saved { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 4px 10px; padding: 9px 10px 9px 12px; border: 1px solid var(--ui-line); border-radius: 8px; background: rgba(18, 28, 48, .6); }
.ui-saved + .ui-saved { margin-top: 6px; }
.ui-saved__name { font-size: 14.5px; font-weight: 650; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ui-saved__sub { font-size: 12.5px; color: var(--ui-text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ui-saved__actions { grid-row: 1 / span 2; grid-column: 2; display: flex; gap: 4px; align-items: center; }
.ui-empty { padding: 22px 12px; text-align: center; color: var(--ui-text-mute); font-size: 13.5px; }

/* ── fenêtre centrée (paramètres, crédits, compte rendu) ── */
.ui-window-wrap { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  padding: calc(16px + var(--ui-safe-t)) calc(16px + var(--ui-safe-r)) calc(16px + var(--ui-safe-b)) calc(16px + var(--ui-safe-l)); }
.ui-window { width: min(980px, 100%); height: min(660px, 100%); display: grid; grid-template-rows: auto minmax(0, 1fr); background: #0e1728; animation: ui-rise .18s ease-out; }
.ui-window--narrow { width: min(680px, 100%); height: auto; max-height: 100%; }
.ui-window__head { display: flex; align-items: center; gap: 14px; padding: 16px 16px 12px 22px; border-bottom: 1px solid var(--ui-line); }
.ui-window__head .ui-title { font-size: 19px; }
.ui-window__head .ui-btn { margin-left: auto; }
.ui-window__body { display: grid; grid-template-columns: 210px minmax(0, 1fr); min-height: 0; }
.ui-window__rail { padding: 10px 8px; border-right: 1px solid var(--ui-line); min-height: 0; }
.ui-window__pane { padding: 14px 22px 20px; min-height: 0; }
.ui-window__pane--solo { grid-column: 1 / -1; }
.ui-window__foot { display: flex; gap: 10px; justify-content: flex-end; padding: 12px 18px 16px; border-top: 1px solid var(--ui-line); flex-wrap: wrap; }

.ui-binds { display: grid; gap: 2px; }
.ui-bind { display: grid; grid-template-columns: minmax(0, 1fr) 116px 116px 96px; gap: 6px; align-items: center; padding: 2px 0; }
.ui-bind--head { font-size: 11px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--ui-text-mute); padding: 4px 0 6px; position: sticky; top: -14px; background: #0e1728; z-index: 1; }
.ui-bind--head span:not(:first-child) { text-align: center; }
.ui-bind__name { font-size: 14px; font-weight: 550; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ui-bind .ui-btn { padding: 0 8px; font-size: 13px; }
.ui-bind .ui-btn.is-listening { border-color: var(--ui-yellow); color: var(--ui-yellow); }
.ui-bind .ui-btn.is-empty { color: var(--ui-text-mute); font-weight: 500; }

/* ── pause ── */
.ui-pause { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  padding: calc(14px + var(--ui-safe-t)) calc(16px + var(--ui-safe-r)) calc(14px + var(--ui-safe-b)) calc(16px + var(--ui-safe-l)); }
.ui-pause__inner { display: flex; align-items: stretch; justify-content: center; gap: 18px; max-width: 100%; max-height: 100%; animation: ui-rise .18s ease-out; }
.ui-pause__menu { width: min(380px, 100%); max-height: 100%; padding: 22px 20px 18px; display: grid; gap: 14px; align-content: start; background: #0e1728; }
.ui-pause__head { display: grid; gap: 4px; }
.ui-pause__list { display: grid; gap: 7px; }
.ui-pause__list .ui-btn { justify-content: flex-start; padding: 0 16px; }
.ui-pause__side { width: 320px; flex: 0 1 320px; min-width: 0; padding: 22px 18px 16px; display: grid; gap: 10px; align-content: start; background: rgba(14, 23, 40, .92); }
.ui-keys { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px 12px; align-items: center; font-size: 13.5px; color: var(--ui-text-dim); }
.ui-objlist { display: grid; gap: 6px; font-size: 13.5px; }
.ui-objlist__row { display: grid; grid-template-columns: 14px minmax(0, 1fr); gap: 8px; align-items: start; }
.ui-objlist__dot { width: 11px; height: 11px; margin-top: 4px; border-radius: 50%; border: 1.5px solid #fff; }
.ui-objlist__row.is-done .ui-objlist__dot { background: var(--ui-green); border-color: var(--ui-green); }
.ui-objlist__row.is-failed .ui-objlist__dot { background: var(--ui-red); border-color: var(--ui-red); }
.ui-objlist__row.is-secondary { color: var(--ui-text-dim); }

/* ── chargement ── */
.ui-load { place-items: center; text-align: center; }
.ui-load__box { width: min(560px, 100% - 40px); display: grid; justify-items: center; gap: 12px; }
.ui-load__place { font-size: 26px; font-weight: 700; color: #fff; line-height: 1.2; }
.ui-load__who { font-size: 14.5px; color: var(--ui-text-dim); }
.ui-load__bar { width: min(400px, 100%); height: 6px; border-radius: 3px; background: rgba(160, 180, 215, .2); overflow: hidden; margin-top: 10px; position: relative; }
.ui-load__fill { position: absolute; inset: 0; background: #fff; transform-origin: left center; transform: scaleX(0); transition: transform .25s ease-out; }
.ui-load__bar.is-wait .ui-load__fill { width: 34%; transform: none; animation: ui-load-slide 1.3s ease-in-out infinite; }
@keyframes ui-load-slide { 0% { left: -34%; } 100% { left: 100%; } }
.ui-load__label { font-size: 13px; color: var(--ui-text-mute); min-height: 18px; }
.ui-load__tip { margin-top: 18px; padding: 14px 18px; max-width: 520px; display: grid; gap: 6px; background: rgba(14, 23, 40, .8); }
.ui-load__tip p { font-size: 14.5px; line-height: 1.5; color: #dfe6f2; }

/* ── compte rendu ── */
.ui-debrief { width: min(1000px, 100%); height: min(680px, 100%); grid-template-rows: auto minmax(0, 1fr) auto; }
.ui-debrief__head { display: flex; align-items: center; gap: 18px; padding: 18px 22px 14px; border-bottom: 1px solid var(--ui-line); }
.ui-debrief__titles { display: grid; gap: 3px; min-width: 0; flex: 1; }
.ui-score { display: grid; justify-items: center; padding: 6px 16px; border-radius: 10px; border: 1px solid var(--ui-line-strong); background: rgba(6, 11, 21, .5); flex: none; }
.ui-score b { font-size: 26px; font-weight: 750; line-height: 1.1; color: #fff; }
.ui-score span { font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--ui-text-dim); }
.ui-score[data-tone="ok"] { border-color: var(--ui-green); } .ui-score[data-tone="ok"] b { color: var(--ui-green); }
.ui-score[data-tone="warn"] { border-color: var(--ui-yellow); } .ui-score[data-tone="warn"] b { color: var(--ui-yellow); }
.ui-score[data-tone="alert"] { border-color: var(--ui-red); } .ui-score[data-tone="alert"] b { color: #ff8177; }
.ui-debrief__body { padding: 14px 22px 16px; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 4px 26px; align-content: start; }
.ui-debrief__col { min-width: 0; }
.ui-tiles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.ui-tile { padding: 9px 11px; border-radius: 8px; border: 1px solid var(--ui-line); background: rgba(6, 11, 21, .45); min-width: 0; }
.ui-tile b { display: block; font-size: 10.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--ui-text-mute); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ui-tile span { display: block; margin-top: 3px; font-size: 19px; font-weight: 700; color: #fff; white-space: nowrap; }
.ui-lines { display: grid; gap: 0; font-size: 13.5px; }
.ui-line { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 12px; padding: 6px 0; border-top: 1px solid var(--ui-line); }
.ui-line:first-child { border-top: 0; }
.ui-line__value { font-weight: 700; color: #fff; white-space: nowrap; text-align: right; }
.ui-line__value.is-plus { color: var(--ui-green); } .ui-line__value.is-minus { color: #ff8177; }
.ui-line__note { grid-column: 1 / -1; font-size: 12.5px; color: var(--ui-text-mute); }
.ui-para { font-size: 13.5px; line-height: 1.5; color: var(--ui-text-dim); }

/* ── crédits ── */
.ui-credits { padding: 16px 24px 8px; display: grid; gap: 14px; }
.ui-credits h3 { font-size: 12px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--ui-text-mute); margin-bottom: 4px; }
.ui-credits p { font-size: 14px; line-height: 1.5; color: var(--ui-text-dim); }
.ui-credits p b { color: #fff; font-weight: 600; }

/* ── écran étroit ── */
@media (max-width: 1100px) {
  .ui-home__body { grid-template-columns: 206px minmax(0, 1fr) 290px; gap: 12px; padding: 6px 16px 16px; }
  .ui-home__top { padding: 12px 16px 6px; }
  .ui-tab__note { display: none; }
  .ui-brand__tag { display: none; }
}
/* ── écran bas : téléphone en paysage ── */
@media (max-height: 520px) {
  .ui-home__top { padding: 8px 12px 2px; gap: 10px; }
  .ui-brand__mark { width: 24px; height: 24px; }
  .ui-brand__name { font-size: 13px; letter-spacing: .24em; }
  .ui-brand__tag { display: none; }
  .ui-home__nav .ui-btn { padding: 0 10px; font-size: 13.5px; }
  .ui-home__body { grid-template-columns: minmax(0, 1fr) 244px; grid-template-rows: auto minmax(0, 1fr); gap: 6px 10px; padding: 2px 12px 10px; }
  .ui-home__rail { grid-column: 1; grid-row: 1; padding: 2px; align-self: stretch; border-radius: 8px; }
  .ui-home__rail .ui-tabs--rail { flex-direction: row; gap: 2px; }
  .ui-home__rail .ui-tab { padding: 0 11px; font-size: 13.5px; flex: none; }
  .ui-home__rail .ui-tab[aria-selected="true"]::before { left: 10px; right: 10px; top: auto; bottom: 3px; width: auto; height: 3px; }
  .ui-tab__note { display: none; }
  .ui-home__content { grid-column: 1; grid-row: 2; grid-template-rows: minmax(0, 1fr); }
  .ui-home__head { display: none; }
  .ui-home__pane { padding: 10px 14px 12px; }
  .ui-home__summary { grid-column: 2; grid-row: 1 / span 2; }
  .ui-sum__head { padding: 12px 12px 6px; gap: 6px; }
  .ui-sum__badge { width: 34px; height: 34px; border-radius: 8px; }
  .ui-sum__badge .ui-ic { width: 20px; height: 20px; }
  .ui-sum__role { font-size: 14.5px; }
  .ui-sum__body { padding: 0 12px 4px; }
  .ui-sum__row { padding: 4px 0; font-size: 12.5px; column-gap: 8px; grid-template-columns: 16px minmax(0, 1fr); }
  .ui-sum__row .ui-ic { width: 15px; height: 15px; }
  .ui-sum__actions { padding: 8px 12px 10px; gap: 6px; }
  .ui-btn--lg { min-height: 48px; font-size: 15.5px; }
  .ui-sum__pair .ui-btn { padding: 0 10px; font-size: 14px; }
  .ui-cards { grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)); gap: 6px; }
  .ui-card { min-height: 60px; padding: 7px 10px; column-gap: 10px; }
  .ui-card__icon { width: 34px; height: 34px; }
  .ui-card__desc { font-size: 12px; }
  .ui-place { grid-template-columns: minmax(0, 1fr) minmax(0, 220px); gap: 10px; }
  .ui-compo__row { grid-template-columns: 12px 116px minmax(0, 1fr) 42px; column-gap: 8px; }
  .ui-window-wrap { padding: calc(8px + var(--ui-safe-t)) calc(10px + var(--ui-safe-r)) calc(8px + var(--ui-safe-b)) calc(10px + var(--ui-safe-l)); }
  .ui-window__head { padding: 8px 10px 8px 16px; }
  .ui-window__head .ui-title { font-size: 17px; }
  .ui-window__body { grid-template-columns: 172px minmax(0, 1fr); }
  .ui-window__rail { padding: 6px; }
  .ui-window__pane { padding: 8px 16px 14px; }
  .ui-bind { grid-template-columns: minmax(0, 1fr) 100px 100px 84px; }
  .ui-bind--head { top: -8px; }
  .ui-pause__inner { gap: 12px; }
  .ui-pause__menu { padding: 14px 14px 12px; gap: 10px; width: min(330px, 100%); }
  .ui-pause__list { gap: 5px; }
  .ui-pause__side { padding: 12px 14px; }
  .ui-load__place { font-size: 21px; }
  .ui-load__box { gap: 8px; }
  .ui-load__tip { margin-top: 8px; padding: 10px 14px; }
  .ui-load__tip p { font-size: 13.5px; }
  .ui-debrief__head { padding: 10px 16px 8px; }
  .ui-debrief__body { padding: 10px 16px 10px; gap: 4px 18px; }
  .ui-window__foot { padding: 8px 14px 10px; }
  .ui-tile span { font-size: 16px; }
  .ui-tile { padding: 6px 9px; }
  .ui-title { font-size: 19px; }
}
`;
