/* =====================================================================================
 * Interface — feuille de style : variables, couches, composants.
 * Direction artistique « salle de commandement » : bleu nuit, blanc, rouge et jaune signalétique,
 * liseré tricolore discret, panneaux semi-opaques, chiffres tabulaires, animations courtes.
 * Aucun flou d'arrière-plan (trop coûteux au-dessus du canevas 3D sur téléphone).
 * ===================================================================================== */

export const CSS_BASE = `
.crs-ui {
  --ui-night-950: #060b15;
  --ui-night-900: #0b1220;
  --ui-night-850: #0e1728;
  --ui-night-800: #121c30;
  --ui-night-700: #1a2740;
  --ui-night-600: #24344f;
  --ui-line: rgba(160, 180, 215, .16);
  --ui-line-strong: rgba(160, 180, 215, .34);
  --ui-text: #eef2f8;
  --ui-text-dim: #aeb9cd;
  --ui-text-mute: #7f8da8;
  --ui-blue: #0055a4;
  --ui-blue-hi: #3b8beb;
  --ui-blue-soft: rgba(59, 139, 235, .16);
  --ui-red: #ef4135;
  --ui-red-soft: rgba(239, 65, 53, .16);
  --ui-yellow: #ffd60a;
  --ui-orange: #ff9500;
  --ui-green: #3ecf8e;
  --ui-panel: rgba(11, 18, 32, .86);
  --ui-radius: 10px;
  --ui-radius-s: 7px;
  --ui-hit: 44px;
  --ui-tricolor: linear-gradient(to right, #0055a4 0 33.34%, #ffffff 33.34% 66.67%, #ef4135 66.67% 100%);
  --ui-safe-t: var(--safe-top, env(safe-area-inset-top, 0px));
  --ui-safe-r: var(--safe-right, env(safe-area-inset-right, 0px));
  --ui-safe-b: var(--safe-bottom, env(safe-area-inset-bottom, 0px));
  --ui-safe-l: var(--safe-left, env(safe-area-inset-left, 0px));
  position: absolute; inset: 0; overflow: hidden; pointer-events: none;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 15px; line-height: 1.4; color: var(--ui-text);
  font-variant-numeric: tabular-nums; -webkit-font-smoothing: antialiased;
  -webkit-user-select: none; user-select: none; -webkit-tap-highlight-color: transparent;
}
#ui > .crs-ui { pointer-events: none; }
.crs-ui *, .crs-ui *::before, .crs-ui *::after { box-sizing: border-box; }
.crs-ui [hidden] { display: none !important; }
.crs-ui :focus { outline: none; }
.crs-ui[data-nav="keys"] :focus { outline: 2px solid var(--ui-yellow); outline-offset: 2px; }
/* remises à zéro sans poids (:where) : les classes des composants gardent toujours la priorité */
:where(.crs-ui) button { font: inherit; color: inherit; margin: 0; }
:where(.crs-ui) h1, :where(.crs-ui) h2, :where(.crs-ui) h3, :where(.crs-ui) p { margin: 0; }
:where(.crs-ui) input, :where(.crs-ui) textarea { font: inherit; }

.ui-layer { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.ui-layer--screens { z-index: 40; }
.ui-layer--hud { z-index: 20; }
.ui-layer--notices { z-index: 60; }

.ui-ic { width: 20px; height: 20px; flex: none; display: block; }

/* ── écrans ── */
.ui-screen { position: absolute; inset: 0; display: flex; pointer-events: none; }
.ui-screen > * { pointer-events: auto; }
.ui-screen--modal { pointer-events: auto; background: rgba(6, 11, 21, .74); animation: ui-fade .16s ease-out; }
@keyframes ui-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes ui-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

/* ── panneau ── */
.ui-panel { background: var(--ui-panel); border: 1px solid var(--ui-line); border-radius: var(--ui-radius);
  box-shadow: 0 14px 44px rgba(0, 0, 0, .38); }
.ui-panel--flag { position: relative; overflow: hidden; }
.ui-panel--flag::before { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 3px; background: var(--ui-tricolor); }
.ui-kicker { font-size: 11px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: var(--ui-text-mute); }
.ui-title { font-size: 22px; font-weight: 650; letter-spacing: .005em; line-height: 1.2; color: #fff; }
.ui-sub { font-size: 13.5px; color: var(--ui-text-dim); }
.ui-flagline { display: block; width: 46px; height: 4px; border-radius: 2px; background: var(--ui-tricolor); }

/* ── bouton ── */
.ui-btn { appearance: none; -webkit-appearance: none; display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  min-height: var(--ui-hit); min-width: var(--ui-hit); padding: 0 18px; border-radius: 8px; cursor: pointer; touch-action: manipulation;
  border: 1px solid var(--ui-line-strong); background: var(--ui-night-700); color: var(--ui-text);
  font-size: 14.5px; font-weight: 600; letter-spacing: .01em; line-height: 1.15; text-align: center; white-space: nowrap;
  transition: background-color .12s, border-color .12s, transform .08s, opacity .12s; }
.ui-btn:hover:not(:disabled) { background: var(--ui-night-600); border-color: rgba(190, 208, 240, .5); }
.ui-btn:active:not(:disabled) { transform: scale(.975); }
.ui-btn:disabled { opacity: .42; cursor: default; }
.ui-btn--primary { background: var(--ui-blue); border-color: #2d7fdc; color: #fff; }
.ui-btn--primary:hover:not(:disabled) { background: #0a66bf; border-color: #6aa9f2; }
.ui-btn--danger { background: rgba(239, 65, 53, .14); border-color: rgba(239, 65, 53, .6); color: #ffd9d5; }
.ui-btn--danger:hover:not(:disabled) { background: rgba(239, 65, 53, .26); border-color: #ff8177; }
.ui-btn--ghost { background: transparent; border-color: transparent; color: var(--ui-text-dim); }
.ui-btn--ghost:hover:not(:disabled) { background: rgba(160, 180, 215, .12); border-color: transparent; color: var(--ui-text); }
.ui-btn--lg { min-height: 56px; padding: 0 26px; font-size: 17px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; border-radius: 10px; }
.ui-btn--lg .ui-ic { width: 22px; height: 22px; }
.ui-btn--block { display: flex; width: 100%; }
.ui-btn--icon { padding: 0; width: var(--ui-hit); }
.ui-btn .ui-lbl { overflow: hidden; text-overflow: ellipsis; }

/* ── onglets ── */
.ui-tabs { display: flex; gap: 4px; }
.ui-tabs--rail { flex-direction: column; }
.ui-tab { appearance: none; -webkit-appearance: none; display: flex; align-items: center; gap: 10px; min-height: var(--ui-hit); padding: 0 14px;
  border: 0; border-radius: 8px; background: transparent; color: var(--ui-text-dim); cursor: pointer; touch-action: manipulation;
  font-size: 14px; font-weight: 550; text-align: left; white-space: nowrap; position: relative; transition: background-color .12s, color .12s; }
.ui-tab:hover { background: rgba(160, 180, 215, .1); color: var(--ui-text); }
.ui-tab[aria-selected="true"] { background: var(--ui-blue-soft); color: #fff; }
.ui-tab[aria-selected="true"]::before { content: ''; position: absolute; left: 0; top: 9px; bottom: 9px; width: 3px; border-radius: 2px; background: var(--ui-blue-hi); }
.ui-tabs:not(.ui-tabs--rail) .ui-tab[aria-selected="true"]::before { left: 12px; right: 12px; top: auto; bottom: 3px; width: auto; height: 3px; }
.ui-tab .ui-ic { width: 19px; height: 19px; opacity: .9; }
.ui-tab__label { flex: none; }
.ui-tab__note { margin-left: auto; font-size: 12px; color: var(--ui-text-mute); font-weight: 500; overflow: hidden; text-overflow: ellipsis; min-width: 0; }

/* ── zone défilante ── */
.ui-scroll { overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; touch-action: pan-y; -webkit-overflow-scrolling: touch;
  scrollbar-width: thin; scrollbar-color: rgba(160, 180, 215, .34) transparent; }
.ui-scroll::-webkit-scrollbar { width: 8px; }
.ui-scroll::-webkit-scrollbar-thumb { background: rgba(160, 180, 215, .3); border-radius: 4px; }
.ui-scroll--x { overflow-x: auto; overflow-y: hidden; touch-action: pan-x; scrollbar-width: none; }
.ui-scroll--x::-webkit-scrollbar { display: none; }

/* ── champ : libellé, valeur, commande, aide ── */
.ui-field { display: grid; gap: 6px; padding: 10px 0; }
.ui-field + .ui-field { border-top: 1px solid var(--ui-line); }
.ui-field__head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.ui-field__label { font-size: 14.5px; font-weight: 600; color: var(--ui-text); }
.ui-field__value { font-size: 14.5px; font-weight: 600; color: #fff; white-space: nowrap; }
.ui-field__hint { font-size: 12.5px; color: var(--ui-text-mute); line-height: 1.35; }
.ui-section-title { display: flex; align-items: center; gap: 10px; font-size: 12px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase;
  color: var(--ui-text-mute); margin: 18px 0 8px; }
.ui-section-title::after { content: ''; flex: 1; height: 1px; background: var(--ui-line); }

/* ── curseur ── */
.ui-slider { position: relative; height: var(--ui-hit); display: flex; align-items: center; cursor: pointer; touch-action: none; border-radius: 8px; --v: 0; }
.ui-slider__track { position: relative; flex: 1; height: 6px; border-radius: 3px; background: rgba(160, 180, 215, .2); margin: 0 11px; }
.ui-slider__fill { position: absolute; inset: 0; border-radius: 3px; background: var(--ui-blue-hi); transform-origin: left center; transform: scaleX(var(--v)); }
.ui-slider__thumb { position: absolute; top: 50%; left: calc(var(--v) * 100%); width: 22px; height: 22px; margin: -11px 0 0 -11px; border-radius: 50%;
  background: #fff; border: 2px solid var(--ui-blue-hi); box-shadow: 0 2px 6px rgba(0, 0, 0, .45); transition: transform .08s; }
.ui-slider:active .ui-slider__thumb, .ui-slider.is-drag .ui-slider__thumb { transform: scale(1.14); }
.ui-slider--heat .ui-slider__track { background: linear-gradient(to right, #3ecf8e, #ffd60a 50%, #ef4135); }
.ui-slider--heat .ui-slider__fill { display: none; }
.ui-slider--heat .ui-slider__thumb { border-color: #0b1220; }
.ui-slider--plain .ui-slider__fill { display: none; }

/* ── sélecteur segmenté ── */
.ui-seg { display: flex; border: 1px solid var(--ui-line-strong); border-radius: 8px; background: rgba(6, 11, 21, .5); padding: 2px; gap: 2px; }
.ui-seg--wrap { flex-wrap: wrap; }
.ui-seg__opt { appearance: none; -webkit-appearance: none; flex: 1 1 0; min-width: var(--ui-hit); min-height: var(--ui-hit); padding: 0 10px; border: 0; border-radius: 6px;
  background: transparent; color: var(--ui-text-dim); cursor: pointer; touch-action: manipulation; font-size: 13.5px; font-weight: 600; line-height: 1.15;
  display: flex; align-items: center; justify-content: center; gap: 6px; text-align: center; transition: background-color .12s, color .12s; }
.ui-seg--wrap .ui-seg__opt { flex: 1 1 auto; }
.ui-seg__opt:hover { background: rgba(160, 180, 215, .12); color: var(--ui-text); }
.ui-seg__opt[aria-checked="true"] { background: var(--ui-blue); color: #fff; }
.ui-seg__opt .ui-ic { width: 18px; height: 18px; }

/* ── interrupteur ── */
.ui-toggle { appearance: none; -webkit-appearance: none; display: flex; align-items: center; justify-content: space-between; gap: 14px; width: 100%; min-height: var(--ui-hit);
  padding: 6px 2px; border: 0; background: transparent; cursor: pointer; touch-action: manipulation; text-align: left; border-radius: 8px; }
.ui-toggle + .ui-toggle, .ui-field + .ui-toggle, .ui-toggle + .ui-field { border-top: 1px solid var(--ui-line); }
.ui-toggle__text { display: grid; gap: 2px; min-width: 0; }
.ui-toggle__label { font-size: 14.5px; font-weight: 600; }
.ui-toggle__hint { font-size: 12.5px; color: var(--ui-text-mute); line-height: 1.35; }
.ui-switch { position: relative; flex: none; width: 46px; height: 26px; border-radius: 13px; background: rgba(160, 180, 215, .26); transition: background-color .14s; }
.ui-switch::after { content: ''; position: absolute; left: 3px; top: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, .5); transition: transform .14s; }
.ui-toggle[aria-checked="true"] .ui-switch { background: var(--ui-blue-hi); }
.ui-toggle[aria-checked="true"] .ui-switch::after { transform: translateX(20px); }

/* ── carte de choix ── */
.ui-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(188px, 1fr)); gap: 8px; }
.ui-card { appearance: none; -webkit-appearance: none; position: relative; display: grid; grid-template-columns: auto 1fr; align-items: center; column-gap: 12px; row-gap: 2px;
  min-height: 72px; padding: 10px 12px; border-radius: var(--ui-radius-s); border: 1px solid var(--ui-line); background: rgba(18, 28, 48, .72);
  cursor: pointer; touch-action: manipulation; text-align: left; transition: background-color .12s, border-color .12s; }
.ui-card:hover { background: rgba(26, 39, 64, .9); border-color: var(--ui-line-strong); }
.ui-card[aria-pressed="true"] { background: var(--ui-blue-soft); border-color: var(--ui-blue-hi); box-shadow: inset 0 0 0 1px var(--ui-blue-hi); }
.ui-card__icon { grid-row: 1 / span 2; width: 40px; height: 40px; border-radius: 9px; display: grid; place-items: center; background: rgba(160, 180, 215, .1); color: #dbe6f8; }
.ui-card[aria-pressed="true"] .ui-card__icon { background: var(--ui-blue); color: #fff; }
.ui-card__icon .ui-ic { width: 24px; height: 24px; }
.ui-card__title { font-size: 14.5px; font-weight: 650; color: #fff; align-self: end; line-height: 1.2; }
.ui-card__desc { font-size: 12.5px; color: var(--ui-text-dim); align-self: start; line-height: 1.3; }
.ui-card--solo .ui-card__title { grid-row: 1 / span 2; align-self: center; }
.ui-cards--roles { grid-template-columns: repeat(auto-fill, minmax(146px, 1fr)); }
.ui-cards--roles .ui-card { align-items: center; align-content: start; row-gap: 6px; column-gap: 9px; padding: 9px 10px 10px; min-height: 90px; }
.ui-cards--roles .ui-card__icon { grid-row: 1; width: 32px; height: 32px; border-radius: 8px; }
.ui-cards--roles .ui-card__icon .ui-ic { width: 20px; height: 20px; }
.ui-cards--roles .ui-card__title { align-self: center; font-size: 14px; }
.ui-cards--roles .ui-card__desc { grid-column: 1 / -1; font-size: 12.5px; }

/* ── pastille de choix ── */
.ui-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.ui-chip { appearance: none; -webkit-appearance: none; display: inline-flex; align-items: center; gap: 7px; min-height: var(--ui-hit); padding: 0 14px; border-radius: 22px;
  border: 1px solid var(--ui-line-strong); background: rgba(18, 28, 48, .7); color: var(--ui-text-dim); cursor: pointer; touch-action: manipulation;
  font-size: 13.5px; font-weight: 600; white-space: nowrap; transition: background-color .12s, border-color .12s, color .12s; }
.ui-chip:hover { color: var(--ui-text); border-color: rgba(190, 208, 240, .55); }
.ui-chip[aria-pressed="true"] { background: var(--ui-blue); border-color: #6aa9f2; color: #fff; }
.ui-chip .ui-ic { width: 18px; height: 18px; }

/* ── compteur − valeur + ── */
.ui-stepper { display: inline-flex; align-items: center; border: 1px solid var(--ui-line-strong); border-radius: 8px; background: rgba(6, 11, 21, .5); }
.ui-stepper__btn { appearance: none; -webkit-appearance: none; width: var(--ui-hit); height: var(--ui-hit); border: 0; background: transparent; cursor: pointer;
  touch-action: manipulation; display: grid; place-items: center; color: var(--ui-text); border-radius: 7px; }
.ui-stepper__btn:hover:not(:disabled) { background: rgba(160, 180, 215, .14); }
.ui-stepper__btn:disabled { opacity: .3; cursor: default; }
.ui-stepper__value { min-width: 40px; text-align: center; font-size: 16px; font-weight: 700; color: #fff; }

/* ── liste ── */
.ui-list { display: grid; gap: 4px; }
.ui-list__item { appearance: none; -webkit-appearance: none; display: grid; grid-template-columns: 1fr auto; align-items: center; column-gap: 12px; row-gap: 1px; width: 100%;
  min-height: var(--ui-hit); padding: 7px 12px; border-radius: var(--ui-radius-s); border: 1px solid transparent; background: transparent; cursor: pointer;
  touch-action: manipulation; text-align: left; transition: background-color .12s, border-color .12s; }
.ui-list__item:hover { background: rgba(160, 180, 215, .1); }
.ui-list__item[aria-pressed="true"], .ui-list__item[aria-selected="true"] { background: var(--ui-blue-soft); border-color: var(--ui-blue-hi); }
.ui-list__title { font-size: 14.5px; font-weight: 600; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ui-list__sub { grid-column: 1; font-size: 12.5px; color: var(--ui-text-dim); line-height: 1.3; }
.ui-list__trail { grid-column: 2; grid-row: 1 / span 2; font-size: 12.5px; color: var(--ui-text-mute); white-space: nowrap; }

/* ── jauge ── */
.ui-gauge { position: relative; height: 8px; border-radius: 4px; background: rgba(160, 180, 215, .2); overflow: hidden; --v: 0; }
.ui-gauge__fill { position: absolute; inset: 0; border-radius: inherit; background: var(--ui-blue-hi); transform-origin: left center; transform: scaleX(var(--v)); transition: transform .2s linear; }
.ui-gauge--ok .ui-gauge__fill { background: var(--ui-green); }
.ui-gauge--warn .ui-gauge__fill { background: var(--ui-yellow); }
.ui-gauge--alert .ui-gauge__fill { background: var(--ui-red); }

/* ── champ de texte ── */
.ui-input { appearance: none; -webkit-appearance: none; width: 100%; min-height: var(--ui-hit); padding: 0 12px; border-radius: 8px; border: 1px solid var(--ui-line-strong);
  background: rgba(6, 11, 21, .6); color: var(--ui-text); font-size: 14.5px; -webkit-user-select: text; user-select: text; }
.ui-input::placeholder { color: var(--ui-text-mute); }
.ui-input:focus { border-color: var(--ui-blue-hi); }
.ui-textarea { min-height: 120px; padding: 10px 12px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; line-height: 1.45; resize: none; }

/* ── touche ── */
.ui-key { display: inline-flex; align-items: center; justify-content: center; min-width: 26px; height: 24px; padding: 0 7px; border-radius: 5px;
  border: 1px solid rgba(255, 255, 255, .5); background: rgba(255, 255, 255, .1); color: #fff; font-size: 12.5px; font-weight: 700; line-height: 1; white-space: nowrap; }

/* ── infobulle ── */
.ui-tip { position: absolute; left: 0; top: 0; z-index: 80; max-width: 280px; padding: 7px 10px; border-radius: 7px; pointer-events: none;
  background: #f3f6fb; color: #0b1220; font-size: 12.5px; font-weight: 500; line-height: 1.35; box-shadow: 0 6px 20px rgba(0, 0, 0, .45);
  opacity: 0; transition: opacity .12s; will-change: transform; }
.ui-tip.is-on { opacity: 1; }

/* ── boîte de confirmation ── */
.ui-dialog-back { position: absolute; inset: 0; z-index: 5; display: flex; align-items: center; justify-content: center; padding: 16px;
  background: rgba(6, 11, 21, .78); animation: ui-fade .14s ease-out; pointer-events: auto; }
.ui-dialog { width: min(440px, 100%); padding: 22px 22px 18px; display: grid; gap: 12px; animation: ui-rise .16s ease-out; }
.ui-dialog__title { font-size: 18px; font-weight: 650; color: #fff; }
.ui-dialog__text { font-size: 14px; color: var(--ui-text-dim); }
.ui-dialog__actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 6px; flex-wrap: wrap; }

@media (prefers-reduced-motion: reduce) {
  .crs-ui *, .crs-ui *::before, .crs-ui *::after { animation-duration: .01s !important; transition-duration: .01s !important; }
}
`;
