/* =====================================================================================
 * Feuille de style du commandement : carte de commandement (« ct- » : bandeau et pastille légale, barre des
 * intentions, colonne et feuilles du téléphone, bandeau de la lecture seule), roue d'ordres (« cw- »), panneau radio
 * (« cr- »), éléments de HUD (« ch- »). S'appuie sur les jetons de .cm-root (cartes). La fiche (styleCard.ts, « cc- »)
 * et les panneaux de côté (stylePanels.ts) ont leurs propres feuilles, ajoutées à la suite dans la même balise.
 * ===================================================================================== */

import { ensureMapsStyle } from '../maps/style';
import { CARD_CSS } from './styleCard';
import { PANELS_CSS } from './stylePanels';

const CSS = `
/* ── carte de commandement : structure (bandeau 44 px, carte + barre des intentions, colonne de 340 px) ── */
.ct{position:absolute;inset:0;display:flex;flex-direction:column;background:var(--cm-solid);overflow:hidden}
.ct-top{position:relative;flex:none;display:flex;align-items:center;gap:12px;height:44px;padding:0 calc(10px + var(--safe-right,0px)) 0 calc(14px + var(--safe-left,0px));
background:#0a1322;border-bottom:1px solid var(--cm-line);z-index:8}
.ct-top::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:2px;background:linear-gradient(90deg,#2b5fd9 0 33.3%,#f4f6fb 33.3% 66.6%,var(--cm-fr) 66.6%);opacity:.85}
.ct-brand{display:flex;flex-direction:column;justify-content:center;min-width:0;flex:none}
.ct-brand .cm-title{font-size:12px;white-space:nowrap}
.ct-scope{font-size:11px;color:var(--cm-orange);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ct-scope:empty{display:none}
.ct-status{flex:1;min-width:0;display:flex;align-items:center;font-size:12px;color:var(--cm-dim);white-space:nowrap;overflow:hidden}
.ct-st:empty{display:none}
.ct-st+.ct-st:not(:empty)::before{content:"·";margin:0 7px;color:var(--cm-faint)}
.ct-gauge{display:inline-flex;align-items:center;gap:6px}
.ct-gauge i{position:relative;display:block;width:60px;height:6px;border-radius:3px;background:rgba(148,168,208,.2);overflow:hidden}
.ct-gauge i::after{content:"";position:absolute;inset:0;border-radius:3px;background:linear-gradient(90deg,#34c759,#ffd60a 50%,#ff3b30);transform-origin:left center;transform:scaleX(var(--v,0));transition:transform .3s}
.ct-chip{flex:none;max-width:44%;gap:8px;border-color:var(--cm-line2);font-weight:700}
.ct-chip .ct-chip-t{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ct-chip[data-tone="warn"]{border-color:#ff9f43;color:#ffcf8a;background:rgba(255,159,67,.12)}
.ct-chip[data-tone="ok"]{border-color:var(--cm-green);color:#8ae6a2}
.ct-chip[data-tone="chain"]{border-color:var(--cm-sky);color:#a9d0ff;background:rgba(88,166,255,.14)}
.ct-chip.is-on{box-shadow:inset 0 -3px 0 var(--cm-yellow)}
.ct-chip.is-readout{cursor:default;pointer-events:none}
.ct-actions{display:flex;align-items:center;gap:8px;flex:none}
.ct-suivi{display:none}
.ct-badge{min-width:16px;height:16px;padding:0 4px;border-radius:8px;background:var(--cm-red);color:#fff;font-style:normal;font-size:10px;font-weight:800;line-height:16px;text-align:center}
.ct-badge:empty{display:none}
.ct-body{position:relative;flex:1;min-height:0;display:flex}
.ct-left2{position:relative;flex:1;min-width:0;display:flex;flex-direction:column}
.ct-mapwrap{position:relative;flex:1;min-height:0}
.ct-right2{position:relative;flex:none;width:340px;display:flex;flex-direction:column;background:var(--cm-panel);border-left:1px solid var(--cm-line);z-index:6}
.ct-mount{display:none;flex:1;min-height:0;flex-direction:column;overflow:hidden}
.ct-mount.is-on{display:flex}
.ct-mount-sheet>*{display:none}
.ct-mount-sheet>.is-on{display:flex;flex:1;min-height:0;flex-direction:column}

/* ── barre des intentions (64 px, sous la carte) ── */
.ct-intents{flex:none;display:flex;gap:5px;height:64px;padding:7px 8px 5px;background:#0a1322;border-top:1px solid var(--cm-line)}
.ct-intent{appearance:none;position:relative;flex:1 1 0;min-width:0;display:flex;align-items:center;gap:8px;padding:3px 7px;border:1px solid var(--cm-line);border-radius:8px;
background:var(--cm-panel);color:var(--cm-text);font:inherit;text-align:left;cursor:pointer}
.ct:not(.is-compact) .ct-intent .ct-ic{display:none}
.ct-intent:hover{background:rgba(148,168,208,.12)}
.ct-intent:focus{outline:none}
.ct-intent.is-on{border-color:var(--cm-yellow);box-shadow:inset 0 -3px 0 var(--cm-yellow)}
.ct-intent .ct-ic{flex:none;width:22px;height:22px}
.ct-intent-t{display:flex;flex-direction:column;min-width:0;line-height:1.15}
.ct-intent-t b{font-size:12px;font-weight:700;white-space:nowrap;letter-spacing:-.01em}
.ct-intent-t small{font-size:11px;color:var(--cm-dim);white-space:normal;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
.ct-intent-w{display:none;font-style:normal}
.ct-intent .cm-kbd{position:absolute;right:-4px;top:-8px;background:#0a1322}
.ct.is-narrow .ct-intent-t small{display:none}
/* fenêtre étroite (980 à 1200 px) : le libellé passe sur deux lignes plutôt que d'être coupé (« Encercler (nasse) ») */
.ct.is-narrow .ct-intent-t b{white-space:normal;overflow-wrap:normal;line-height:1.12}
.ct.has-card .ct-intents{display:none}

/* ── carte : recherche, aide, modèle, commandes ── */
.ct-search{position:absolute;left:calc(10px + var(--safe-left,0px));top:10px;z-index:6;display:flex;flex-direction:column;gap:4px;max-width:min(340px,calc(100% - 20px))}
.ct-search .cm-btn{background:var(--cm-panel);box-shadow:0 4px 14px rgba(0,0,0,.35);align-self:flex-start}
.ct-search input{display:none;width:280px;max-width:100%;height:38px;padding:0 12px;border-radius:8px;border:1px solid var(--cm-yellow);background:#0c1526;color:var(--cm-text);font:inherit;font-size:14px}
.ct-search.is-open input{display:block}
.ct-search.is-open>.cm-btn{display:none}
.ct-search-res{display:flex;flex-direction:column;gap:2px}
.ct-search-res .cm-btn{justify-content:flex-start;background:var(--cm-panel);min-height:40px}
.ct-model{position:absolute;left:50%;bottom:96px;transform:translateX(-50%);z-index:6;display:none;align-items:center;gap:12px;width:min(600px,calc(100% - 140px));padding:10px 12px 10px 14px;border-radius:10px;
background:rgba(12,21,39,.95);border:1px solid var(--cm-yellow);font-size:13px;line-height:1.4;box-shadow:0 8px 22px rgba(0,0,0,.45)}
.ct-model.is-on{display:flex}
.ct-model .cm-btn{flex:none}
.ct-help{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:9;display:none;flex-direction:column;gap:8px;width:min(560px,calc(100% - 24px));max-height:calc(100% - 24px);overflow:auto;padding:14px 16px}
.ct-help.is-on{display:flex}
.ct-help-model{margin:0;font-size:13.5px;line-height:1.45;color:var(--cm-text)}
.ct-help ul{margin:0;padding-left:18px;display:flex;flex-direction:column;gap:3px;font-size:12.5px;color:var(--cm-dim);line-height:1.35}
.ct-help .cm-btn{align-self:flex-end}
.ct-mapctl{flex-direction:column}
.ct-me{background:var(--cm-panel);gap:6px}
.ct-wind{left:10px;bottom:46px}

/* ── lecture seule (§2.9) : bandeau de l'ordre reçu ── */
.ct-order{display:none;flex:none;flex-direction:column;gap:2px;padding:7px 14px 8px calc(14px + var(--safe-left,0px));background:#101b30;border-bottom:1px solid var(--cm-line);font-size:12.5px;line-height:1.35}
.ct-order b{font-size:13.5px;font-weight:800;color:var(--cm-yellow)}
.ct-order span{color:var(--cm-dim)}
.ct.is-readonly .ct-order{display:flex}
.ct.is-readonly .ct-intents,.ct.is-readonly .ct-search,.ct.is-readonly [data-id="tac-slow"],.ct.is-readonly .ct-suivi,.ct.is-readonly .ct-chip .cm-kbd{display:none}
.ct.is-readonly .ct-right2{display:none}
.ct.is-readonly.has-card .ct-right2{display:flex}

/* ── messages de l'interface pendant la carte : sous-titres radio en haut à gauche de la carte (à droite de
   « Rechercher un lieu »), messages en bas à gauche, deux au plus, jamais sur le bandeau ── */
.ct-open .ui-subs{left:var(--ct-sub-left,50%);top:var(--ct-sub-top,auto);bottom:auto;transform:none;align-items:flex-start;max-width:var(--ct-sub-max,50vw)}
/* le bas de la ligne coupée ne dépasse pas dans la marge intérieure : la marge du bas est une bordure transparente
   (le texte est coupé au bord de la marge intérieure, pas de la bordure) */
.ct-open .ui-sub-line{text-align:left;-webkit-line-clamp:2;padding-bottom:0;border-bottom:4px solid transparent}
.ct-open .ui-sub-line:nth-last-child(n+3){display:none}
.ct-open .ui-toasts{left:var(--ct-toast-left,12px);top:auto;bottom:var(--ct-toast-bottom,80px);transform:none;align-items:flex-start;max-width:var(--ct-toast-max,60vw)}
.ct-open .ui-toast:nth-last-child(n+3){display:none}

/* ── téléphone (< 980 × 520) : bandeau 40 px (ses boutons font 40 px pour le doigt : à 36 px ils sortaient de l'écran
   par le haut), barre 52 px, une feuille de 380 px à la fois ── */
.ct.is-compact .ct-top{height:40px;gap:8px;padding-left:calc(6px + var(--safe-left,0px))}
.ct.is-compact .ct-brand .cm-title,.ct.is-compact .ct-scope{display:none}
.ct.is-compact .ct-actions{display:contents}
.ct.is-compact .ct-close{order:-1}
.ct.is-compact [data-id="tac-slow"]{order:5}
.ct.is-compact .ct-st-crowd,.ct.is-compact .ct-gauge{display:none}
.ct.is-compact .ct-actions .cm-btn-t{display:none}
.ct.is-compact .ct-suivi{display:inline-flex}
/* lecture seule (exécutant) au téléphone : ni « Suivi » ni panneau (§2.9 : ✕ et ◎ seulement) */
.ct.is-compact.is-readonly .ct-suivi{display:none}
.ct.is-compact .ct-suivi .cm-btn-t{display:inline}
.ct.is-compact .ct-status{font-size:11.5px}
.ct.is-compact .ct-chip{max-width:none}
.ct.is-compact .ct-right2{position:absolute;right:0;top:0;bottom:0;width:min(380px,58vw);padding-right:var(--safe-right,0px);display:none;box-shadow:-8px 0 24px rgba(0,0,0,.45)}
.ct.is-compact.has-sheet .ct-right2{display:flex}
.ct.is-compact.has-sheet .ct-left2{margin-right:min(380px,58vw)}
/* la feuille monte jusqu'en haut de l'écran (§2.2 : 30 + 7 × 40 + 18 + 44 px tiennent dans les 390 px) ; le bandeau
   garde ses boutons à gauche de la feuille */
.ct.is-compact.has-sheet .ct-right2{top:-40px;z-index:9}
.ct.is-compact.has-sheet .ct-top{padding-right:calc(min(380px,58vw) + 6px)}
.ct.is-compact.has-sheet .ct-intents,.ct.is-compact.has-sheet .ct-model{display:none}
.ct.is-compact .ct-intents{height:calc(53px + var(--safe-bottom,0px));gap:2px;padding:0 calc(2px + var(--safe-right,0px)) var(--safe-bottom,0px) calc(2px + var(--safe-left,0px))}
.ct.is-compact .ct-intent{min-width:96px;height:52px;flex-direction:column;justify-content:center;gap:1px;padding:2px 4px;text-align:center;border-radius:6px}
.ct.is-compact .ct-intent .ct-ic{width:20px;height:20px}
.ct.is-compact .ct-intent-t b,.ct.is-compact .ct-intent-t small{display:none}
.ct.is-compact .ct-intent-w{display:block;font-size:13px;font-weight:700}
.ct.is-compact .ct-intent .cm-kbd{display:none}
.ct.is-compact .ct-mapctl [data-id="zoom-in"],.ct.is-compact .ct-mapctl [data-id="zoom-out"]{display:none}
.ct.is-compact .ct-me .cm-btn-t{display:none}
.ct.is-compact .ct-search .cm-btn-t{display:none}
.ct.is-compact .ct-actions .cm-btn,.ct.is-compact .ct-search .cm-btn,.ct.is-compact .ct-me{min-width:40px}
.ct.is-compact .ct-wind{display:none}
.ct.is-compact .ct-model{width:calc(100% - 24px);bottom:8px;font-size:12px}
.ct.is-compact .ct-order{padding:4px 10px;font-size:11.5px}
.ct.is-compact .ct-order b{font-size:12px}

/* ── panneaux : en-tête, zone défilante, rangée surlignée au clavier ── */
.ct-left{display:flex;flex-direction:column;flex:1;min-height:0}
.ct-head{flex:none;display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:38px;padding:6px 10px 6px 12px;border-bottom:1px solid var(--cm-line)}
.ct-scroll{flex:1;min-height:0;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;touch-action:pan-y;scrollbar-width:thin;scrollbar-color:rgba(148,168,208,.35) transparent}
.ct-scroll::-webkit-scrollbar{width:7px}
.ct-scroll::-webkit-scrollbar-thumb{background:rgba(148,168,208,.3);border-radius:4px}
.ct-mount .is-hl{outline:2px solid var(--cm-yellow);outline-offset:-2px}

/* ── arborescence des unités ── */
.ct-unit{appearance:none;position:relative;display:flex;align-items:center;gap:7px;width:100%;min-height:var(--cm-tap);padding:2px 9px 2px calc(8px + var(--d,0) * 13px);
border:0;border-bottom:1px solid rgba(148,168,208,.08);background:transparent;color:var(--cm-text);font:inherit;text-align:left;cursor:pointer}
.ct-unit:hover{background:rgba(148,168,208,.09)}
.ct-unit:focus{outline:none}
.ct-unit:focus-visible{outline:2px solid var(--cm-yellow);outline-offset:-2px}
.ct-unit.is-sel{background:rgba(31,102,224,.3);box-shadow:inset 3px 0 0 var(--cm-yellow)}
.ct-unit.is-ro{color:var(--cm-dim)}
.ct-unit.is-drop{background:rgba(52,199,89,.26);box-shadow:inset 0 0 0 2px var(--cm-green)}
.ct-unit img{flex:none;width:27px;height:24px;display:block}
.ct-unit.is-ro img{opacity:.6}
.ct-unit-name{flex:1;min-width:0;font-weight:600;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ct-unit.d0 .ct-unit-name{font-weight:800;letter-spacing:.04em}
.ct-unit-me{flex:none;font-size:9px;font-weight:800;letter-spacing:.08em;color:#0b1424;background:var(--cm-yellow);border-radius:3px;padding:1px 4px}
.ct-unit-num{flex:none;font-size:12px;font-weight:700;color:var(--cm-text);min-width:36px;text-align:right}
.ct-unit-num.is-low{color:var(--cm-orange)}
.ct-unit-ord{flex:none;min-width:50px;text-align:center;font-size:9.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;padding:2px 5px;border-radius:3px;background:rgba(88,166,255,.16);color:#a9d0ff;white-space:nowrap}
.ct-unit-ord.is-free{background:transparent;color:var(--cm-faint)}
.ct-unit-ord.is-force{background:rgba(255,107,74,.18);color:#ffb3a1}
.ct-card{flex:none;border-top:1px solid var(--cm-line);padding:10px 12px 12px;display:flex;flex-direction:column;gap:7px;background:rgba(8,14,26,.5)}
.ct-card-t{font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ct-card-empty{font-size:12px;color:var(--cm-dim);line-height:1.4}
.ct-kv{display:grid;grid-template-columns:auto 1fr;gap:3px 12px;font-size:12px}
.ct-kv span{color:var(--cm-dim)}
.ct-kv b{font-weight:600;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ct-bar{position:relative;display:block;height:5px;border-radius:3px;background:rgba(148,168,208,.2);overflow:hidden;align-self:center}
.ct-bar::after{content:"";position:absolute;inset:0;background:var(--c,var(--cm-sky));transform-origin:left center;transform:scaleX(var(--v,0))}

/* ── contenus des panneaux (« Plus… », « Cadre légal ») ── */
.ct-pane{display:none;flex-direction:column;flex:1;min-height:0}
.ct-pane.is-on{display:flex}
.ct-sec{padding:10px 12px 12px;border-bottom:1px solid var(--cm-line);display:flex;flex-direction:column;gap:8px}
.ct-sec:last-child{border-bottom:0}
.ct-sec-h{display:flex;align-items:center;justify-content:space-between;gap:8px}
.ct-note{font-size:11.5px;line-height:1.4;color:var(--cm-dim)}
.ct-note.is-warn{color:#ffcf8a}
.ct-note.is-alert{color:#ff9f97}
.ct-legal{display:flex;align-items:center;gap:9px;font-size:12.5px;font-weight:600}
.ct-dot{flex:none;width:12px;height:12px;border-radius:50%;background:#8e8e93;box-shadow:0 0 0 2px rgba(255,255,255,.12)}
.ct-dot.s1{background:var(--cm-orange)}.ct-dot.s2{background:#ff6a00}.ct-dot.s3{background:var(--cm-red)}.ct-dot.atk{background:var(--cm-yellow)}
.ct-force{display:grid;grid-template-columns:repeat(5,1fr);gap:4px}
.ct-force .cm-btn{padding:0;font-size:14px;font-weight:800}
.ct-force .cm-btn.is-cap{box-shadow:inset 0 -3px 0 var(--cm-yellow)}
.ct-force .cm-btn.is-over{border-color:#ff9f43;color:#ffcf8a}
.ct-verbs{display:grid;grid-template-columns:1fr 1fr;gap:5px}
.ct-verbs .cm-sub{grid-column:1/-1;margin-top:4px}
.ct-verbs .cm-sub:first-child{margin-top:0}
.ct-verb{justify-content:flex-start;padding:0 9px;gap:7px;font-size:12px;overflow:hidden}
.ct-verb i{flex:none;width:7px;height:7px;border-radius:50%;background:var(--cm-sky)}
.ct-verb.is-coercive i{background:#ff9f43}
.ct-verb.is-locked{opacity:.5}
.ct-verb.is-locked i{background:var(--cm-red)}
.ct-verb span{overflow:hidden;text-overflow:ellipsis}
.ct-verb:focus-visible{outline:2px solid var(--cm-yellow);outline-offset:-2px}

/* ── incidents ── */
.ct-inc{position:relative;display:flex;flex-direction:column;border-bottom:1px solid rgba(148,168,208,.1)}
.ct-inc-row{appearance:none;display:flex;align-items:center;gap:9px;width:100%;min-height:calc(var(--cm-tap) + 8px);padding:6px 10px 6px 12px;border:0;background:transparent;color:var(--cm-text);font:inherit;text-align:left;cursor:grab;touch-action:pan-y}
.ct-inc-row:hover{background:rgba(148,168,208,.08)}
.ct-inc-row:focus{outline:none}
.ct-inc-row:focus-visible{outline:2px solid var(--cm-yellow);outline-offset:-2px}
.ct-inc.is-sel{background:rgba(31,102,224,.16);box-shadow:inset 3px 0 0 var(--cm-yellow)}
.ct-inc-ico{flex:none;width:26px;height:26px;border-radius:50%;border:2px solid var(--u,var(--cm-yellow));color:var(--u,var(--cm-yellow));display:flex;align-items:center;justify-content:center;background:#111a2e}
.ct-inc-main{flex:1;min-width:0}
.ct-inc-main b{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;font-size:12.5px;font-weight:600;line-height:1.25;overflow:hidden}
.ct-inc-main small{display:block;font-size:11px;color:var(--cm-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ct-inc-urg{flex:none;font-size:9.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;padding:2px 6px;border-radius:3px;color:#0b1424;background:var(--u,var(--cm-yellow))}
.ct-inc-sev{position:absolute;left:0;right:0;bottom:0;height:2px;background:var(--u,var(--cm-yellow));transform-origin:left center;transform:scaleX(var(--v,0));opacity:.8}
.ct-inc-more{display:none;flex-direction:column;gap:7px;padding:2px 12px 11px}
.ct-inc.is-sel .ct-inc-more{display:flex}
.ct-means{display:flex;flex-wrap:wrap;gap:5px}
.ct-call{display:flex;align-items:center;gap:8px;padding:6px 0;border-top:1px solid rgba(148,168,208,.1);font-size:12px}
.ct-call:first-child{border-top:0}
.ct-call b{font-weight:700}
.ct-call span{flex:1;min-width:0;color:var(--cm-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ct-call strong{font-weight:800;color:var(--cm-cyan);min-width:38px;text-align:right}
.ct-row{display:flex;align-items:center;gap:8px;min-height:var(--cm-tap);padding:3px 0;border-top:1px solid rgba(148,168,208,.1);font-size:12px}
.ct-row:first-child{border-top:0}
.ct-row-main{flex:1;min-width:0}
.ct-row-main b{display:block;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ct-row-main small{display:block;font-size:11px;color:var(--cm-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ct-row.is-sel{background:rgba(31,102,224,.16);margin:0 -12px;padding-left:12px;padding-right:12px;box-shadow:inset 3px 0 0 var(--cm-yellow)}
.ct-state{flex:none;font-size:9.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;padding:2px 6px;border-radius:3px;background:rgba(52,199,89,.18);color:#8ae6a2}
.ct-state.is-closed{background:rgba(255,59,48,.2);color:#ffaaa3}
.ct-state.is-filter{background:rgba(255,214,10,.2);color:#ffe680}
.ct-btnrow{display:flex;flex-wrap:wrap;gap:6px}
.ct-btnrow .cm-btn{flex:1}

/* ── journal ── */
.ct-log{display:flex;flex-direction:column;padding:6px 0}
.ct-msg{padding:5px 12px 6px;border-bottom:1px solid rgba(148,168,208,.08);font-size:12px;line-height:1.38}
.ct-msg.p2{box-shadow:inset 3px 0 0 var(--cm-red)}
.ct-msg.is-me{background:rgba(31,102,224,.12)}
.ct-msg-h{display:flex;align-items:center;gap:7px;margin-bottom:1px;font-size:10.5px;color:var(--cm-dim)}
.ct-msg-h b{color:var(--cm-text);font-weight:700;letter-spacing:.03em}
.ct-msg-h i{font-style:normal;font-size:9px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;padding:0 5px;border-radius:3px;background:rgba(148,168,208,.18);color:var(--cm-dim)}
.ct-msg-h i.c-secours{background:rgba(255,59,48,.2);color:#ffaaa3}
.ct-msg-h i.c-unite{background:rgba(88,166,255,.18);color:#a9d0ff}
.ct-msg p{margin:0;-webkit-user-select:text;user-select:text}
.ct-empty{padding:18px 14px;font-size:12px;color:var(--cm-dim);line-height:1.45;text-align:center}

/* ── couches et légende de la carte (« Plus… › Affichage de la carte ») ── */
.ct-layers{position:absolute;right:54px;bottom:10px;z-index:6;display:none;flex-direction:column;gap:2px;padding:8px;min-width:170px}
.ct-layers.is-on{display:flex}
.ct-layers{max-height:calc(100% - 20px);overflow-y:auto}
.ct-legend{display:flex;flex-direction:column;gap:3px;margin-top:6px;padding-top:6px;border-top:1px solid var(--cm-line);max-width:250px}
.ct-legend-r{display:flex;align-items:center;gap:8px;font-size:11px;line-height:1.3;color:var(--cm-dim)}
.ct-legend-r i{flex:none;display:inline-flex}
.ct-issues{color:var(--cm-text)}
.ct-layers .cm-btn{justify-content:flex-start;border-color:transparent;background:transparent}
.ct-layers .cm-btn::before{content:"";flex:none;width:14px;height:14px;border-radius:3px;border:1.5px solid var(--cm-line2)}
.ct-layers .cm-btn.is-on{background:transparent;color:var(--cm-text)}
.ct-layers .cm-btn.is-on::before{background:var(--cm-sky);border-color:var(--cm-sky);box-shadow:inset 0 0 0 2px #0c1526}
.ct-ghost{position:fixed;left:0;top:0;z-index:99;pointer-events:none;display:none;align-items:center;gap:7px;padding:5px 10px 5px 6px;border-radius:16px;background:#f1f5fd;color:#0b1424;font-size:12px;font-weight:700;
box-shadow:0 8px 22px rgba(0,0,0,.5);will-change:transform;white-space:nowrap}
.ct-ghost.is-on{display:flex}

/* ── roue d'ordres ── */
.cw-screen{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px}
.cw-wheel{position:relative;width:min(336px,calc(100vh - 86px));height:min(336px,calc(100vh - 86px));touch-action:none}
.cw-svg{display:block;width:100%;height:100%;overflow:visible;filter:drop-shadow(0 10px 26px rgba(0,0,0,.5))}
.cw-wedge{fill:rgba(12,21,39,.93);stroke:rgba(148,168,208,.34);stroke-width:1.2;cursor:pointer;transition:fill .08s}
.cw-wedge.is-hot{fill:#1f66e0;stroke:#9cc4ff}
.cw-wedge.is-force.is-hot{fill:#a8231b;stroke:#ff9f97}
.cw-wedge.is-off{fill:rgba(12,21,39,.6);cursor:default}
.cw-wedge.is-off.is-hot{fill:rgba(60,70,92,.85);stroke:rgba(148,168,208,.5)}
.cw-label{fill:#f1f5fd;font:700 12.5px system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;text-anchor:middle;pointer-events:none;letter-spacing:.01em}
.cw-sublabel{fill:#a9b9d6;font:600 9px system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;text-anchor:middle;pointer-events:none}
.cw-label.is-off,.cw-sublabel.is-off{fill:#6f80a0}
.cw-key{fill:#ffd166;font:800 10px ui-monospace,SFMono-Regular,Menlo,monospace;text-anchor:middle;pointer-events:none}
.cw-key.is-off{fill:#6f80a0}
.cm-coarse .cw-key{display:none}
.cw-legend{font-size:11.5px;color:var(--cm-dim);background:var(--cm-panel);border:1px solid var(--cm-line);border-radius:14px;padding:4px 12px}
.cm-coarse .cw-legend{display:none}
.cw-hub{fill:rgba(8,14,26,.96);stroke:rgba(148,168,208,.4);stroke-width:1.2;cursor:pointer}
.cw-title{fill:#fff;font:800 12px system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;text-anchor:middle;pointer-events:none;letter-spacing:.03em;text-transform:uppercase}
.cw-sub{fill:#a9b9d6;font:600 9.5px system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;text-anchor:middle;pointer-events:none}
.cw-cap{display:flex;align-items:center;gap:10px;padding:6px 14px;border-radius:18px;background:var(--cm-panel);border:1px solid var(--cm-line);font-size:12px;color:var(--cm-dim);white-space:nowrap;max-width:94vw;overflow:hidden;text-overflow:ellipsis}
.cw-cap b{color:var(--cm-text)}

/* ── panneau radio ── */
.cr{position:absolute;left:calc(14px + var(--safe-left,0px));top:calc(14px + var(--safe-top,0px));bottom:calc(14px + var(--safe-bottom,0px));width:min(430px,calc(100% - 28px));display:flex;flex-direction:column;overflow:hidden}
.cr-head{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 8px 8px 14px;border-bottom:1px solid var(--cm-line)}
.cr-quick{flex:none;display:flex;flex-direction:column;gap:8px;padding:10px 12px 12px;border-top:1px solid var(--cm-line);background:rgba(8,14,26,.5)}
.cr-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.cr-grid .cm-btn{justify-content:flex-start;white-space:normal;text-align:left;line-height:1.2;padding:5px 9px;min-height:calc(var(--cm-tap) + 6px)}
.cr-chans{display:flex;gap:4px}
.cr-chans .cm-btn{flex:1}
@media (max-height:480px){.cr{top:calc(6px + var(--safe-top,0px));bottom:calc(6px + var(--safe-bottom,0px));width:min(520px,calc(100% - 20px))}.cr-grid{grid-template-columns:1fr 1fr 1fr 1fr}.cr-grid .cm-btn{font-size:11px}}

/* ── éléments de HUD ── */
.ch{display:flex;align-items:center;gap:9px;height:30px;padding:0 11px 0 7px;border-radius:15px;background:rgba(9,16,31,.8);border:1px solid var(--cm-line);font-size:12px;white-space:nowrap;pointer-events:none;max-width:min(430px,56vw)}
.ch.is-off{display:none}
.ch img{flex:none;width:25px;height:22px;display:block}
.ch b{font-weight:800;letter-spacing:.04em;overflow:hidden;text-overflow:ellipsis}
.ch-num{font-weight:700}
.ch-num.is-low{color:var(--cm-orange)}
.ch-ord{font-size:10px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;padding:2px 7px;border-radius:3px;background:rgba(88,166,255,.2);color:#b6d6ff}
.ch-ord.is-force{background:rgba(255,107,74,.22);color:#ffb3a1}
.ch-ord.is-new{animation:ch-flash 1.2s ease-out}
@keyframes ch-flash{0%{background:var(--cm-yellow);color:#0b1424}100%{}}
.ch-inc{border-color:var(--u,var(--cm-yellow))}
.ch-arrow{flex:none;width:18px;height:18px;color:var(--u,var(--cm-yellow));will-change:transform}
.ch-inc span{overflow:hidden;text-overflow:ellipsis}
.ch-inc strong{font-weight:800;color:var(--u,var(--cm-yellow))}

/* ── « Plus… › Commissariats » (panelCommissariats.ts) : rangées de 44 px (48 au doigt, .cp-row), cadre jaune au clavier ── */
.cpc{flex:1;min-height:0;display:flex;flex-direction:column}
.cpc-note{flex:none;color:#ffcf8a}
.cpc-list{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain}
.cpc-glyph{background:transparent}
.cpc-glyph img{display:block;width:22px;height:22px}
.cpc-chev{flex:none;color:var(--cm-dim)}
.cpc-site[aria-expanded="true"]{background:rgba(88,166,255,.1);border-color:rgba(88,166,255,.35)}
.cpc-units{display:flex;flex-direction:column;gap:2px;padding:0 0 6px 22px}
.cm-coarse .cpc-units{padding-left:10px}
.cpc-act{flex:none;font-size:11.5px;font-weight:700;color:var(--cm-yellow);white-space:nowrap}
.cpc-unit.is-pret .cpc-state{color:#8ae6a2}
.cpc-unit.is-alerte .cpc-state{color:#ffcf8a}
.cpc-unit.is-repos .cpc-state,.cpc-unit.is-retour .cpc-state{color:#a9d0ff}
.cpc-unit.is-indisponible .cpc-state{color:var(--cm-orange)}
.cpc-unit[disabled] .cpc-act{display:none}
`;

let injected = false;

export function ensureCommandStyle(): void {
  ensureMapsStyle();
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const style = document.createElement('style');
  style.id = 'crs-command-style';
  // la fiche (styleCard.ts) et les panneaux de côté (stylePanels.ts) après la structure de l'écran
  style.textContent = CSS + CARD_CSS + PANELS_CSS;
  document.head.appendChild(style);
}
