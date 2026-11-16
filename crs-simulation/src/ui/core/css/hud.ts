/* =====================================================================================
 * Interface — feuille de style du HUD et des messages transitoires.
 *
 * Zones : neuf conteneurs « hud-slot ». En tactile (data-touch = pied | vehicule | drone), ils se
 * décalent pour ne jamais recouvrir la surcouche du module d'entrées ; les cotes ci-dessous sont
 * celles de docs/modules/entrees.md (pixels sur 844 × 390, multipliés par l'échelle --ts) :
 * rangée système en haut à droite (290 × 110), Radio / Ordres et joystick à gauche, barre
 * d'objets en bas au centre (60 de haut), groupe d'actions en bas à droite.
 * data-compact = 1 : écran bas (téléphone en paysage) — objectifs sur une ligne sous la boussole.
 * ===================================================================================== */

export const CSS_HUD = `
.ui-hud { --hp: 16px; --ts: 1; --hud-bg: rgba(8, 13, 24, .66); --hud-line: rgba(255, 255, 255, .13);
  font-size: 13px; line-height: 1.25; color: #f2f5fa; text-shadow: 0 1px 2px rgba(0, 0, 0, .75); }
.ui-hud[data-compact="1"] { --hp: 10px; font-size: 12px; }
.hud-slot { position: absolute; display: flex; flex-direction: column; gap: 8px; pointer-events: none; max-width: 46%; }
.ui-hud[data-compact="1"] .hud-slot { gap: 5px; }
.hud-slot > * { order: 50; max-width: 100%; min-width: 0; }
.hud-slot--top-left { left: calc(var(--hp) + var(--ui-safe-l)); top: calc(var(--hp) + var(--ui-safe-t)); align-items: flex-start; }
.hud-slot--top { left: 50%; top: calc(var(--hp) + var(--ui-safe-t)); transform: translateX(-50%); align-items: center; }
.hud-slot--top-right { right: calc(var(--hp) + var(--ui-safe-r)); top: calc(var(--hp) + var(--ui-safe-t)); align-items: flex-end; }
.hud-slot--left { left: calc(var(--hp) + var(--ui-safe-l)); top: 50%; transform: translateY(-50%); align-items: flex-start; }
.hud-slot--right { right: calc(var(--hp) + var(--ui-safe-r)); top: 50%; transform: translateY(-50%); align-items: flex-end; }
.hud-slot--bottom-left { left: calc(var(--hp) + var(--ui-safe-l)); bottom: calc(var(--hp) + var(--ui-safe-b)); align-items: flex-start; }
.hud-slot--bottom { left: 50%; bottom: calc(var(--hp) + var(--ui-safe-b)); transform: translateX(-50%); align-items: center; max-width: 70%; }
.hud-slot--bottom-right { right: calc(var(--hp) + var(--ui-safe-r)); bottom: calc(var(--hp) + var(--ui-safe-b)); align-items: flex-end; }
.hud-slot--center { left: 50%; top: 50%; transform: translate(-50%, -50%); align-items: center; }

/* ── tactile : les zones s'écartent des commandes à l'écran ── */
.ui-hud[data-touch="pied"] .hud-slot--top-left, .ui-hud[data-touch="vehicule"] .hud-slot--top-left, .ui-hud[data-touch="drone"] .hud-slot--top-left {
  left: calc(12px * var(--ts) + var(--ui-safe-l)); top: calc(8px * var(--ts) + var(--ui-safe-t)); }
.ui-hud[data-touch="pied"] .hud-slot--top, .ui-hud[data-touch="vehicule"] .hud-slot--top, .ui-hud[data-touch="drone"] .hud-slot--top {
  top: calc(8px * var(--ts) + var(--ui-safe-t)); max-width: calc(100vw - 586px * var(--ts)); }
.ui-hud[data-touch="pied"] .hud-slot--top-right, .ui-hud[data-touch="vehicule"] .hud-slot--top-right {
  right: calc(12px * var(--ts) + var(--ui-safe-r)); top: calc(116px * var(--ts) + var(--ui-safe-t)); }
.ui-hud[data-touch="drone"] .hud-slot--top-right { right: calc(12px * var(--ts) + var(--ui-safe-r)); top: calc(64px * var(--ts) + var(--ui-safe-t)); }
.ui-hud[data-touch="pied"] .hud-slot--left, .ui-hud[data-touch="vehicule"] .hud-slot--left, .ui-hud[data-touch="drone"] .hud-slot--left {
  left: calc(210px * var(--ts) + var(--ui-safe-l)); }
.ui-hud[data-touch="pied"] .hud-slot--right, .ui-hud[data-touch="vehicule"] .hud-slot--right, .ui-hud[data-touch="drone"] .hud-slot--right {
  right: calc(288px * var(--ts) + var(--ui-safe-r)); }
.ui-hud[data-touch="pied"] .hud-slot--bottom, .ui-hud[data-touch="vehicule"] .hud-slot--bottom, .ui-hud[data-touch="drone"] .hud-slot--bottom { transform: none; max-width: none; }
.ui-hud[data-touch="pied"] .hud-slot--bottom { left: calc(176px * var(--ts) + var(--ui-safe-l)); right: calc(214px * var(--ts) + var(--ui-safe-r)); bottom: calc(68px * var(--ts) + var(--ui-safe-b)); }
.ui-hud[data-touch="vehicule"] .hud-slot--bottom { left: calc(210px * var(--ts) + var(--ui-safe-l)); right: calc(290px * var(--ts) + var(--ui-safe-r)); bottom: calc(10px * var(--ts) + var(--ui-safe-b)); }
.ui-hud[data-touch="drone"] .hud-slot--bottom { left: calc(176px * var(--ts) + var(--ui-safe-l)); right: calc(240px * var(--ts) + var(--ui-safe-r)); bottom: calc(10px * var(--ts) + var(--ui-safe-b)); }
.ui-hud[data-touch="pied"] .hud-slot--bottom-left { left: calc(190px * var(--ts) + var(--ui-safe-l)); bottom: calc(68px * var(--ts) + var(--ui-safe-b)); }
.ui-hud[data-touch="vehicule"] .hud-slot--bottom-left, .ui-hud[data-touch="drone"] .hud-slot--bottom-left {
  left: calc(214px * var(--ts) + var(--ui-safe-l)); bottom: calc(10px * var(--ts) + var(--ui-safe-b)); }
.ui-hud[data-touch="pied"] .hud-slot--bottom-right { right: calc(204px * var(--ts) + var(--ui-safe-r)); bottom: calc(68px * var(--ts) + var(--ui-safe-b)); }
.ui-hud[data-touch="vehicule"] .hud-slot--bottom-right { right: calc(288px * var(--ts) + var(--ui-safe-r)); bottom: calc(10px * var(--ts) + var(--ui-safe-b)); }
.ui-hud[data-touch="drone"] .hud-slot--bottom-right { right: calc(240px * var(--ts) + var(--ui-safe-r)); bottom: calc(10px * var(--ts) + var(--ui-safe-b)); }

.hud-box { background: var(--hud-bg); border: 1px solid var(--hud-line); border-radius: 8px; }
.hud-ic { width: 15px; height: 15px; flex: none; }
.hud-cap { font-size: 10.5px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: #b9c5d9; }

/* ── situation : horloge, météo, phase, tension, cadre légal ── */
.hud-sit { display: grid; gap: 4px; padding: 7px 10px; min-width: 212px; max-width: 420px; position: relative; overflow: hidden; }
.hud-sit::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px;
  background: linear-gradient(to bottom, #0055a4 0 33.34%, #fff 33.34% 66.67%, #ef4135 66.67% 100%); opacity: .9; }
.hud-sit__row { display: flex; align-items: center; gap: 8px; min-height: 20px; white-space: nowrap; }
.hud-sit__clock { font-size: 16px; font-weight: 700; letter-spacing: .02em; }
.hud-sit__sep { width: 1px; height: 14px; background: rgba(255, 255, 255, .28); }
.hud-sit__phase { font-size: 11.5px; font-weight: 700; letter-spacing: .09em; text-transform: uppercase; }
.hud-sit__phase.is-new { animation: hud-flash 1.2s ease-out; }
@keyframes hud-flash { 0%, 40% { color: var(--ui-yellow); } 100% { color: inherit; } }
.hud-tension { display: flex; gap: 2px; margin-left: auto; }
.hud-tension i { width: 9px; height: 10px; border-radius: 1.5px; background: rgba(255, 255, 255, .2); }
.hud-tension[data-tone="ok"] i.is-on { background: var(--ui-green); }
.hud-tension[data-tone="warn"] i.is-on { background: var(--ui-yellow); }
.hud-tension[data-tone="hot"] i.is-on { background: var(--ui-orange); }
.hud-tension[data-tone="alert"] i.is-on { background: var(--ui-red); }
.hud-legal__dot { width: 10px; height: 10px; border-radius: 50%; flex: none; background: #8e8e93; box-shadow: 0 0 0 1px rgba(0, 0, 0, .4); }
.hud-legal[data-tone="orange"] .hud-legal__dot { background: var(--ui-orange); }
.hud-legal[data-tone="red"] .hud-legal__dot { background: var(--ui-red); }
.hud-legal[data-tone="ring"] .hud-legal__dot { background: var(--ui-red); box-shadow: 0 0 0 2px #0b1220, 0 0 0 3.5px var(--ui-red); }
.hud-legal[data-tone="yellow"] .hud-legal__dot { background: var(--ui-yellow); border-radius: 2px; transform: rotate(45deg) scale(.9); }
.hud-legal__label { font-weight: 650; }
.hud-somm { display: flex; gap: 3px; margin-left: auto; }
.hud-somm i { width: 14px; height: 5px; border-radius: 2px; background: rgba(255, 255, 255, .22); }
.hud-somm i.is-on { background: var(--ui-orange); }
.hud-force__pips { display: flex; gap: 2px; }
.hud-force__pips i { width: 12px; height: 8px; border-radius: 1.5px; background: rgba(255, 255, 255, .16); border: 1px solid transparent; }
.hud-force__pips i.is-lawful { border-color: rgba(255, 255, 255, .7); }
.hud-force__pips i.is-usable { background: #fff; border-color: #fff; }
.hud-force__label { font-weight: 600; overflow: hidden; text-overflow: ellipsis; }
.hud-force__nums { margin-left: auto; font-size: 11px; color: #b9c5d9; padding-left: 4px; }
.hud-remind { font-weight: 600; color: #ffe08a; white-space: normal; max-width: 250px; line-height: 1.25; }
.hud-fps { padding: 2px 7px; font-size: 11px; font-weight: 600; color: #cfd8ea; }
.ui-hud[data-compact="1"] .hud-sit { min-width: 0; max-width: 252px; padding: 5px 8px 5px 10px; gap: 2px; }
.ui-hud[data-compact="1"] .hud-sit__row { min-height: 18px; gap: 5px; }
.ui-hud[data-compact="1"] .hud-sit__clock { font-size: 13.5px; }
.ui-hud[data-compact="1"] .hud-sit__phase { font-size: 10.5px; letter-spacing: .04em; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.ui-hud[data-compact="1"] .hud-tension i { width: 7px; }
.ui-hud[data-compact="1"] .hud-legal__label { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.ui-hud[data-compact="1"] .hud-somm i { width: 11px; }
.ui-hud[data-compact="1"] .hud-force__label { display: none; }
.ui-hud[data-compact="1"] .hud-force__nums { margin-left: 0; }
.ui-hud[data-compact="1"] .hud-remind { max-width: 232px; font-size: 11.5px; }

/* ── boussole ── */
.hud-compass { display: grid; justify-items: center; gap: 3px; --cw: 360px; }
.ui-hud[data-compact="1"] .hud-compass { --cw: 240px; gap: 2px; }
.hud-compass__win { position: relative; width: var(--cw); height: 30px; overflow: hidden; border-radius: 6px;
  background: linear-gradient(to right, rgba(8, 13, 24, 0), rgba(8, 13, 24, .6) 22%, rgba(8, 13, 24, .6) 78%, rgba(8, 13, 24, 0));
  -webkit-mask-image: linear-gradient(to right, transparent, #000 14%, #000 86%, transparent); mask-image: linear-gradient(to right, transparent, #000 14%, #000 86%, transparent); }
.hud-compass__strip { position: absolute; left: 0; top: 0; height: 100%; will-change: transform;
  background-image: repeating-linear-gradient(to right, rgba(255, 255, 255, .6) 0 1px, transparent 1px 100%); background-size: 45px 7px; background-repeat: repeat-x; background-position: 0 bottom; }
.hud-compass__strip span { position: absolute; top: 3px; width: 40px; margin-left: -20px; text-align: center; font-size: 12px; font-weight: 700; letter-spacing: .04em; color: #dfe6f2; }
.hud-compass__strip span.is-n { color: var(--ui-red); font-size: 13px; }
.hud-compass__strip span.is-minor { font-size: 10.5px; font-weight: 600; color: #b3bfd4; top: 4px; }
.hud-compass__caret { position: absolute; left: 50%; top: 0; width: 0; height: 0; margin-left: -5px; border: 5px solid transparent; border-top: 6px solid var(--ui-yellow); }
.hud-compass__mark { position: absolute; left: 0; bottom: 1px; width: 10px; height: 10px; margin-left: -5px; will-change: transform; }
.hud-compass__mark::before { content: ''; position: absolute; inset: 1px; background: #fff; transform: rotate(45deg); border-radius: 1.5px; box-shadow: 0 0 0 1px rgba(0, 0, 0, .55); }
.hud-compass__mark.is-tracked::before { background: var(--ui-yellow); }
.hud-compass__mark.is-alert::before { background: var(--ui-red); }
.hud-compass__mark.is-edge::before { transform: rotate(45deg) scale(.7); opacity: .85; }
.hud-compass__info { display: flex; align-items: center; gap: 8px; font-size: 12.5px; white-space: nowrap; max-width: calc(var(--cw) + 80px);
  padding: 2px 10px; border-radius: 10px; background: rgba(8, 13, 24, .5); }
.hud-compass__head { font-weight: 700; min-width: 62px; text-align: right; }
.hud-compass__sector { font-weight: 600; overflow: hidden; text-overflow: ellipsis; }
.hud-compass__wind { display: inline-flex; align-items: center; gap: 4px; color: #c9d4e6; }
.hud-compass__wind svg { width: 12px; height: 12px; will-change: transform; }
.ui-hud[data-compact="1"] .hud-compass__info { font-size: 11.5px; gap: 6px; max-width: calc(var(--cw) + 16px); }
.ui-hud[data-compact="1"] .hud-compass__wind { display: none; }
.ui-hud[data-compact="1"] .hud-compass__head { min-width: 0; }

/* ── objectifs ── */
.hud-obj { width: 284px; padding: 8px 10px 9px; display: grid; gap: 5px; }
.hud-obj__title { display: flex; justify-content: space-between; align-items: baseline; }
.hud-obj__row { display: grid; grid-template-columns: 14px 1fr auto; column-gap: 7px; align-items: start; }
.hud-obj__state { width: 12px; height: 12px; margin-top: 2px; border-radius: 50%; border: 1.5px solid #fff; position: relative; }
.hud-obj__row.is-tracked .hud-obj__state { border-color: var(--ui-yellow); background: rgba(255, 214, 10, .35); }
.hud-obj__row.is-done .hud-obj__state { border-color: var(--ui-green); background: var(--ui-green); }
.hud-obj__row.is-failed .hud-obj__state { border-color: var(--ui-red); background: var(--ui-red); }
.hud-obj__row.is-done .hud-obj__text, .hud-obj__row.is-failed .hud-obj__text { color: #aab6cb; text-decoration: line-through; text-decoration-color: rgba(255, 255, 255, .4); }
.hud-obj__row.is-secondary .hud-obj__text { color: #c5cfdf; font-weight: 500; }
.hud-obj__row.is-secondary .hud-obj__state { transform: scale(.8); }
.hud-obj__text { font-weight: 600; line-height: 1.3; }
.hud-obj__dist { font-size: 12px; font-weight: 700; color: var(--ui-yellow); white-space: nowrap; }
.hud-obj__bar { grid-column: 2 / span 2; height: 3px; border-radius: 2px; background: rgba(255, 255, 255, .2); overflow: hidden; margin-top: 3px; }
.hud-obj__bar i { display: block; height: 100%; background: #fff; transform-origin: left center; }
.hud-obj__more { font-size: 11.5px; color: #b9c5d9; padding-left: 21px; }
.hud-objw { display: flex; justify-content: center; }
.hud-obj1 { display: flex; align-items: center; gap: 7px; max-width: min(420px, 100%); min-width: 0; padding: 3px 10px; border-radius: 12px; }
.hud-obj1__dot { width: 8px; height: 8px; border-radius: 50%; background: var(--ui-yellow); flex: none; }
.hud-obj1__text { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hud-obj1__meta { font-size: 11px; font-weight: 700; color: var(--ui-yellow); white-space: nowrap; }

/* ── état physique ── */
.hud-status { display: grid; gap: 5px; padding: 8px 10px; width: 236px; }
.hud-status__row { display: grid; grid-template-columns: 16px 1fr 30px; align-items: center; column-gap: 7px; }
.hud-bar { position: relative; height: 9px; border-radius: 3px; background: rgba(255, 255, 255, .17); overflow: hidden; }
.hud-bar i { position: absolute; inset: 0; background: #fff; transform-origin: left center; will-change: transform; }
.hud-bar--thin { height: 5px; }
.hud-bar[data-tone="ok"] i { background: #f2f5fa; }
.hud-bar[data-tone="warn"] i { background: var(--ui-yellow); }
.hud-bar[data-tone="alert"] i { background: var(--ui-red); }
.hud-bar--stamina i { background: #7fc4ff; }
.hud-bar--gas i { background: #d8e36a; }
.hud-status__num { font-size: 13px; font-weight: 700; text-align: right; }
.hud-status__chips { display: flex; flex-wrap: wrap; gap: 5px; }
.hud-chip { display: inline-flex; align-items: center; gap: 4px; padding: 1px 7px; border-radius: 9px; font-size: 11px; font-weight: 700; letter-spacing: .02em;
  background: rgba(255, 255, 255, .14); text-shadow: none; }
.hud-chip--alert { background: var(--ui-red); color: #fff; }
.hud-chip--warn { background: var(--ui-yellow); color: #1a1500; }
.hud-status__row--bare { grid-template-columns: 16px 1fr; padding-right: 37px; }
.ui-hud[data-compact="1"] .hud-status { width: 214px; padding: 5px 8px; gap: 3px; }
/* téléphone tactile : une seule ligne au-dessus de la barre d'objets */
.ui-hud[data-compact="1"]:not([data-touch="none"]) .hud-status { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; width: auto; max-width: 330px; gap: 3px 12px; padding: 4px 10px; }
.ui-hud[data-compact="1"]:not([data-touch="none"]) .hud-status__row { grid-template-columns: 14px 74px auto; column-gap: 5px; }
.ui-hud[data-compact="1"]:not([data-touch="none"]) .hud-status__row--bare { grid-template-columns: 14px 58px; padding-right: 0; }
.ui-hud[data-compact="1"]:not([data-touch="none"]) .hud-chip--gear { display: none; }
.ui-hud[data-compact="1"]:not([data-touch="none"]) .hud-obj1 { max-width: 100%; }

/* ── barre d'objets ── */
.hud-items { display: grid; justify-items: center; gap: 5px; }
.hud-items__name { font-size: 13px; font-weight: 650; padding: 2px 10px; border-radius: 10px; background: var(--hud-bg); transition: opacity .3s; }
.hud-items__name.is-off { opacity: 0; }
.hud-items__row { display: flex; gap: 5px; }
.hud-item { position: relative; width: 50px; height: 50px; border-radius: 8px; background: var(--hud-bg); border: 1.5px solid rgba(255, 255, 255, .22);
  display: grid; place-items: center; color: #e4eaf4; }
.hud-item svg { width: 26px; height: 26px; filter: drop-shadow(0 1px 1.5px rgba(0, 0, 0, .7)); }
.hud-item.is-active { background: rgba(0, 85, 164, .88); border-color: #fff; color: #fff; }
.hud-item.is-empty { opacity: .45; }
.hud-item__key { position: absolute; left: 4px; top: 2px; font-size: 10px; font-weight: 700; color: #b9c5d9; }
.hud-item.is-active .hud-item__key { color: #dbe8ff; }
.hud-item__n { position: absolute; right: 4px; bottom: 1px; font-size: 11.5px; font-weight: 800; }
.hud-item__cd { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: var(--ui-yellow); transform-origin: left center; border-radius: 0 0 6px 6px; }
.hud-item__txt { font-size: 10px; font-weight: 800; letter-spacing: .02em; }

/* ── invite d'interaction ── */
.hud-prompt { display: grid; gap: 4px; justify-items: center; }
.hud-prompt__pill { display: flex; align-items: center; gap: 9px; padding: 6px 14px 6px 8px; border-radius: 20px; background: rgba(8, 13, 24, .8); border: 1px solid rgba(255, 255, 255, .3);
  font-size: 14.5px; font-weight: 650; white-space: nowrap; }
.hud-prompt__pill.is-nokey { padding-left: 14px; }
.hud-prompt__bar { width: 100%; min-width: 140px; height: 4px; border-radius: 2px; background: rgba(255, 255, 255, .22); overflow: hidden; }
.hud-prompt__bar i { display: block; height: 100%; background: var(--ui-yellow); transform-origin: left center; will-change: transform; }

/* ── réticule, charge, coups reçus ── */
.hud-center { position: absolute; left: 50%; top: 50%; width: 0; height: 0; }
.hud-reticle { position: absolute; left: -40px; top: -40px; width: 80px; height: 80px; overflow: visible; }
.hud-reticle .r-main { stroke: #fff; stroke-width: 1.6; fill: none; filter: drop-shadow(0 0 1.5px rgba(0, 0, 0, .9)); }
.hud-reticle .r-dot { fill: #fff; filter: drop-shadow(0 0 1.5px rgba(0, 0, 0, .9)); }
.hud-reticle.is-target .r-main { stroke: var(--ui-yellow); }
.hud-reticle.is-target .r-dot { fill: var(--ui-yellow); }
.hud-reticle .r-track { stroke: rgba(255, 255, 255, .25); stroke-width: 3; fill: none; }
.hud-reticle .r-charge { stroke: var(--ui-yellow); stroke-width: 3; fill: none; stroke-linecap: round; transform: rotate(-90deg); transform-origin: 40px 40px; }
.hud-dmg { position: absolute; left: -130px; top: -130px; width: 260px; height: 260px; overflow: visible; will-change: transform, opacity; opacity: 0; }
.hud-dmg path { fill: none; stroke: var(--ui-red); stroke-width: 9; stroke-linecap: round; filter: drop-shadow(0 0 5px rgba(239, 65, 53, .8)); }

/* ── effets d'écran de repli (sans module de rendu) ── */
.hud-fx { position: absolute; inset: 0; opacity: 0; will-change: opacity; }
.hud-fx--gas { background: radial-gradient(ellipse at 50% 55%, rgba(222, 226, 196, .28) 0, rgba(214, 218, 186, .78) 100%); }
.hud-fx--flash { background: #fff; }
.hud-fx--pain { background: radial-gradient(ellipse at 50% 50%, rgba(160, 10, 0, 0) 45%, rgba(160, 10, 0, .7) 100%); }
.hud-fx--visor { background: linear-gradient(to bottom, rgba(10, 16, 28, .5) 0, rgba(10, 16, 28, .1) 16%, rgba(120, 160, 200, .06) 60%, rgba(10, 16, 28, .3) 100%);
  box-shadow: inset 0 0 90px rgba(4, 8, 16, .65); }
.hud-fx--wet { background: radial-gradient(circle at 30% 30%, rgba(190, 215, 240, .22) 0, rgba(190, 215, 240, 0) 22%), radial-gradient(circle at 72% 62%, rgba(190, 215, 240, .2) 0, rgba(190, 215, 240, 0) 18%); }

/* ── véhicule ── */
.hud-veh { display: grid; gap: 5px; padding: 8px 12px; min-width: 230px; }
.hud-veh__top { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.hud-veh__main { display: flex; align-items: center; gap: 12px; }
.hud-veh__speed { font-size: 30px; font-weight: 750; line-height: 1; min-width: 56px; text-align: right; }
.hud-veh__unit { font-size: 11px; font-weight: 600; color: #b9c5d9; margin-left: -6px; align-self: flex-end; padding-bottom: 3px; }
.hud-veh__gear { width: 24px; height: 24px; display: grid; place-items: center; border-radius: 5px; border: 1.5px solid rgba(255, 255, 255, .6); font-size: 13px; font-weight: 800; }
.hud-veh__lamps { display: flex; gap: 6px; margin-left: auto; }
.hud-lamp { width: 26px; height: 26px; display: grid; place-items: center; border-radius: 6px; background: rgba(255, 255, 255, .1); color: #7f8da8; }
.hud-lamp svg { width: 17px; height: 17px; }
.hud-lamp.is-on { color: #0b1220; background: var(--ui-yellow); }
.hud-lamp--blue.is-on { background: #57a6ff; }
.hud-veh__ammo { display: grid; grid-template-columns: auto 1fr auto; align-items: center; column-gap: 8px; }
.hud-veh__state { font-weight: 700; color: var(--ui-yellow); }
.hud-veh__state.is-alert { color: #ff8177; }
.ui-hud[data-compact="1"] .hud-veh { padding: 5px 10px; gap: 3px; min-width: 210px; }
.ui-hud[data-compact="1"] .hud-veh__speed { font-size: 24px; min-width: 44px; }

/* ── habillages de caméra ── */
.hud-overlay { position: absolute; inset: 0; }
.hud-corner { position: absolute; width: 34px; height: 34px; border: 2px solid rgba(255, 255, 255, .85); filter: drop-shadow(0 0 2px rgba(0, 0, 0, .7)); }
.hud-corner--tl { left: 24%; top: 26%; border-right: 0; border-bottom: 0; }
.hud-corner--tr { right: 24%; top: 26%; border-left: 0; border-bottom: 0; }
.hud-corner--bl { left: 24%; bottom: 24%; border-right: 0; border-top: 0; }
.hud-corner--br { right: 24%; bottom: 24%; border-left: 0; border-top: 0; }
.hud-cross { position: absolute; left: 50%; top: 50%; width: 46px; height: 46px; margin: -23px 0 0 -23px; }
.hud-cross::before, .hud-cross::after { content: ''; position: absolute; background: rgba(255, 255, 255, .9); box-shadow: 0 0 2px rgba(0, 0, 0, .8); }
.hud-cross::before { left: 0; right: 0; top: 50%; height: 1.5px; margin-top: -.75px; -webkit-mask-image: linear-gradient(to right, #000 0 36%, transparent 36% 64%, #000 64%); mask-image: linear-gradient(to right, #000 0 36%, transparent 36% 64%, #000 64%); }
.hud-cross::after { top: 0; bottom: 0; left: 50%; width: 1.5px; margin-left: -.75px; -webkit-mask-image: linear-gradient(to bottom, #000 0 36%, transparent 36% 64%, #000 64%); mask-image: linear-gradient(to bottom, #000 0 36%, transparent 36% 64%, #000 64%); }
.hud-band { display: flex; align-items: center; gap: 16px; padding: 5px 14px; white-space: nowrap; }
.hud-band b { font-weight: 750; font-size: 14px; margin-left: 5px; }
.hud-band span { display: inline-flex; align-items: baseline; }
.hud-band .is-low b { color: #ff8177; }
.hud-rec { display: inline-flex; align-items: center; gap: 6px; font-weight: 700; }
.hud-rec::before { content: ''; width: 9px; height: 9px; border-radius: 50%; background: var(--ui-red); }
.ui-hud[data-compact="1"] .hud-band { gap: 9px; padding: 4px 9px; }
.ui-hud[data-compact="1"] .hud-band b { font-size: 12.5px; margin-left: 4px; }
.ui-hud[data-compact="1"] .hud-band__extra { display: none; }
.hud-vf__frame { position: absolute; left: 7%; right: 7%; top: 14%; bottom: 11%; border: 1.5px solid rgba(255, 255, 255, .8); box-shadow: 0 0 0 100vmax rgba(0, 0, 0, .28); border-radius: 2px; }
.hud-vf__third { position: absolute; background: rgba(255, 255, 255, .22); }
.hud-vf__third--v1 { left: 33.33%; top: 0; bottom: 0; width: 1px; }
.hud-vf__third--v2 { left: 66.66%; top: 0; bottom: 0; width: 1px; }
.hud-vf__third--h1 { top: 33.33%; left: 0; right: 0; height: 1px; }
.hud-vf__third--h2 { top: 66.66%; left: 0; right: 0; height: 1px; }
.hud-vf__af { position: absolute; left: 50%; top: 50%; width: 56px; height: 40px; margin: -20px 0 0 -28px; border: 1.5px solid rgba(255, 255, 255, .9); border-radius: 3px; filter: drop-shadow(0 0 2px rgba(0, 0, 0, .7)); }
.hud-vf__gain { color: var(--ui-yellow); font-weight: 800; }

/* ── marqueurs 3D ── */
.hud-markers { position: absolute; inset: 0; overflow: hidden; }
.hud-marker { position: absolute; left: 0; top: 0; will-change: transform; display: grid; justify-items: center; gap: 2px; width: 120px; margin-left: -60px; margin-top: -30px; }
.hud-marker__pin { width: 16px; height: 16px; position: relative; }
.hud-marker__pin::before { content: ''; position: absolute; inset: 2px; background: var(--ui-yellow); transform: rotate(45deg); border-radius: 2px; box-shadow: 0 0 0 1.5px rgba(0, 0, 0, .6); }
.hud-marker[data-kind="incident"] .hud-marker__pin::before { background: var(--ui-red); }
.hud-marker[data-kind="suspect"] .hud-marker__pin::before { background: #fff; border-radius: 50%; box-shadow: 0 0 0 2px var(--ui-red), 0 0 0 3.5px rgba(0, 0, 0, .5); }
.hud-marker[data-kind="objectif2"] .hud-marker__pin::before { background: #fff; }
.hud-marker__label { font-size: 11.5px; font-weight: 700; padding: 1px 6px; border-radius: 8px; background: rgba(8, 13, 24, .7); white-space: nowrap; max-width: 120px; overflow: hidden; text-overflow: ellipsis; }
.hud-marker.is-edge .hud-marker__label { display: none; }
.hud-marker.is-edge .hud-marker__pin::before { transform: rotate(45deg) scale(.8); opacity: .9; }

/* ── messages transitoires ── */
.ui-toasts { position: absolute; left: 50%; top: calc(var(--ui-notice-top, 14px) + var(--ui-safe-t)); transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 6px;
  width: max-content; max-width: var(--ui-toast-max, min(460px, 62vw)); pointer-events: none; }
.ui-toast { display: flex; align-items: center; gap: 9px; padding: 7px 14px 7px 10px; border-radius: 8px; background: rgba(8, 13, 24, .9); border: 1px solid rgba(255, 255, 255, .14);
  border-left: 3px solid var(--ui-blue-hi); font-size: 13.5px; font-weight: 550; line-height: 1.3; box-shadow: 0 6px 18px rgba(0, 0, 0, .35); animation: ui-rise .18s ease-out;
  transition: opacity .2s, transform .2s; }
.ui-toast .ui-ic { width: 17px; height: 17px; color: var(--ui-blue-hi); }
.ui-toast--ok { border-left-color: var(--ui-green); } .ui-toast--ok .ui-ic { color: var(--ui-green); }
.ui-toast--warn { border-left-color: var(--ui-yellow); } .ui-toast--warn .ui-ic { color: var(--ui-yellow); }
.ui-toast--alert { border-left-color: var(--ui-red); } .ui-toast--alert .ui-ic { color: #ff8177; }
.ui-toast.is-out { opacity: 0; transform: translateY(-6px); }
.ui-toast__count { font-size: 12px; font-weight: 800; color: var(--ui-text-dim); }
.ui-subs { position: absolute; left: calc(50% + var(--ui-sub-shift, 0px)); bottom: calc(var(--ui-sub-bottom, 28px) + var(--ui-safe-b)); transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 4px;
  width: max-content; max-width: var(--ui-sub-max, min(720px, 74vw)); pointer-events: none; }
.ui-sub-line { padding: 5px 12px; border-radius: 6px; background: rgba(4, 8, 16, .78); font-size: 15.5px; font-weight: 500; line-height: 1.35; text-align: center; text-shadow: 0 1px 2px #000; animation: ui-fade .15s ease-out; }
.ui-sub-line__who { font-size: 11.5px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--ui-yellow); margin-right: 9px; }
.ui-banner { position: absolute; left: 50%; top: 19%; transform: translateX(-50%); display: grid; justify-items: center; gap: 7px; text-align: center; padding: 12px 34px 14px;
  background: linear-gradient(to right, rgba(6, 11, 21, 0), rgba(6, 11, 21, .82) 18%, rgba(6, 11, 21, .82) 82%, rgba(6, 11, 21, 0)); animation: ui-rise .3s ease-out; transition: opacity .4s;
  width: max-content; max-width: 86vw; pointer-events: none; }
.ui-banner.is-out { opacity: 0; }
.ui-banner__title { font-size: 26px; font-weight: 750; letter-spacing: .14em; text-transform: uppercase; color: #fff; text-shadow: 0 2px 8px rgba(0, 0, 0, .8); }
.ui-banner__sub { font-size: 15px; color: #dfe6f2; text-shadow: 0 1px 3px #000; }
@media (max-height: 520px) {
  .ui-sub-line { font-size: 13px; padding: 3px 10px; }
  .ui-banner { top: 24%; padding: 8px 26px 10px; gap: 5px; }
  .ui-banner__title { font-size: 19px; }
  .ui-banner__sub { font-size: 13px; }
  .ui-toast { font-size: 12.5px; padding: 5px 12px 5px 8px; }
  /* écran bas : une seule notification visible, la plus récente */
  .ui-toast:nth-last-child(n+2) { display: none; }
}
`;
