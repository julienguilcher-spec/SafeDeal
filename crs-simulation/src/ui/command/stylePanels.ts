/* =====================================================================================
 * Feuille de style des PANNEAUX DE CÔTÉ de la carte de commandement (préfixe « cp- ») : « À traiter » et « Mes unités »
 * (panelFollow.ts), « Plus… » et ses sections (panelMore.ts, panelOrders.ts, panelTraffic.ts), « Cadre légal »
 * (panelLegal.ts). Rangées de 44 px au moins (48 px au doigt), pleine largeur ; la rangée surlignée au clavier se voit
 * par un cadre jaune (classe is-hl, style.ts), pas seulement par la couleur. S'appuie sur les jetons de .cm-root ;
 * ajoutée à la feuille du commandement par l'intégration (style.ts).
 * ===================================================================================== */

export const PANELS_CSS = `
/* ── commun ── */
.cp-follow,.cp-sheet{color:var(--cm-text);font-size:13px;line-height:1.35;user-select:none;-webkit-user-select:none}
/* pas de display ici : la feuille n'est montrée que par le point de montage (.ct-mount-sheet>.is-on, style.ts) */
.cp-sheet{flex:1;min-height:0;flex-direction:column;overflow:hidden}
.cp-top{flex:none;display:flex;align-items:center;gap:8px;min-height:44px;padding:4px 8px 4px 12px;border-bottom:1px solid var(--cm-line)}
.cp-title{flex:1;min-width:0;font-size:13.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cp-back{flex:none;min-height:36px}
.cp-x{flex:none;min-width:36px;min-height:36px}
.cp-svg{width:18px;height:18px;display:block}
.cp-list{display:flex;flex-direction:column;gap:2px;padding:4px 6px}
.cp-empty{padding:6px 12px 8px;font-size:12px;color:var(--cm-dim)}
.cp-cap{padding:8px 8px 2px;font-size:10.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--cm-dim)}
.cp-row{appearance:none;position:relative;display:flex;align-items:center;gap:9px;width:100%;min-height:44px;padding:5px 8px;border:1px solid transparent;border-radius:7px;
background:transparent;color:var(--cm-text);font:inherit;text-align:left;cursor:pointer;touch-action:manipulation}
.cp-row:hover{background:rgba(148,168,208,.1)}
.cp-row:focus{outline:none}
.cp-row[disabled]{opacity:.45;cursor:default}
.cp-row[disabled]:hover{background:transparent}
.cm-coarse .cp-row{min-height:48px}
.cp-n{flex:none;width:18px;font-size:12px;font-weight:800;color:var(--cm-yellow);text-align:center}
.cm-coarse .cp-n{display:none}
.cp-ic{flex:none;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(148,168,208,.14);color:var(--cm-sky)}
.cp-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.cp-t{font-weight:700;font-size:13px;line-height:1.25;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
.cp-s{font-size:11.5px;color:var(--cm-dim);line-height:1.3;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
.cp-row .cm-kbd{flex:none}
.cm-coarse .cp-follow .cm-kbd,.cm-coarse .cp-sheet .cm-kbd{display:none}

/* ── « À traiter » / « Mes unités » ── */
.cp-follow{flex:1;min-height:0;display:flex;flex-direction:column;padding-bottom:8px}
.cp-head{flex:none;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px 4px;font-size:11px;font-weight:800;letter-spacing:.1em;
text-transform:uppercase;color:var(--cm-dim)}
.cp-head+.cp-empty{padding-top:2px}
.cp-todo .cp-ic{color:var(--cm-orange);background:rgba(255,149,0,.16)}
.cp-todo.is-proposition .cp-ic{color:var(--cm-sky);background:rgba(88,166,255,.16)}
.cp-todo.is-nasse .cp-ic{color:#ff9f97;background:rgba(255,59,48,.16)}
.cp-todo.is-chaine .cp-ic{color:#ffcf8a;background:rgba(255,214,10,.14)}
.cp-urow{display:flex;align-items:stretch;gap:2px;border-radius:7px}
.cp-urow.d1{padding-left:22px}
.cp-urow.is-new{animation:cp-flash 3s ease-out}
@keyframes cp-flash{0%,60%{background:rgba(255,214,10,.28)}100%{background:transparent}}
.cp-fold{flex:none;width:28px;display:flex;align-items:center;justify-content:center;border-radius:6px;color:var(--cm-dim);cursor:pointer}
.cp-fold:hover{background:rgba(148,168,208,.12);color:var(--cm-text)}
.cp-fold.is-none{cursor:default;pointer-events:none}
.cm-coarse .cp-fold{width:40px}
/* (à côté du bouton de pliage : la rangée prend la place restante, sans déborder de la colonne — width:100% de .cp-row
   la faisait dépasser de la largeur du pli et la liste défilait de côté) */
.cp-unit{flex:1 1 0;width:auto;min-width:0;padding:5px 8px 5px 6px}
.cp-line{display:flex;align-items:baseline;gap:7px;min-width:0}
.cp-name{flex:0 1 auto;min-width:0;font-weight:700;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cp-num{flex:none;font-size:11.5px;font-weight:700;color:var(--cm-dim)}
.cp-num.is-low{color:var(--cm-orange)}
.cp-num:empty{display:none}
.cp-doing{flex:1 1 0;min-width:0;font-size:12px;color:#a9d0ff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:right}
.cp-urow.is-free .cp-doing{color:var(--cm-faint)}
.cp-line2{align-items:center;font-size:11.5px;color:var(--cm-dim)}
.cp-status{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cp-relief{flex:none;font-weight:700;color:var(--cm-orange)}
.cp-urow.is-alert .cp-status{color:var(--cm-orange);font-weight:700}
.cp-bar{position:relative;flex:1 1 40px;max-width:90px;height:5px;border-radius:3px;background:rgba(148,168,208,.2);overflow:hidden;margin-left:auto}
.cp-bar::after{content:"";position:absolute;inset:0;background:var(--cm-sky);transform-origin:left center;transform:scaleX(var(--v,0))}
.cp-urow.is-chain .cp-name{color:#ffcf8a}
.cp-urow.is-chain .cp-doing{color:var(--cm-text)}
.cp-urow.is-chain.is-alert .cp-doing{color:var(--cm-orange)}
.cp-cancel{flex:none;align-self:center;margin-right:4px;min-height:36px}
.cm-coarse .cp-cancel{min-height:44px}

/* ── « Cadre légal » ── */
.cp-lead{flex:none;padding:10px 12px 6px;font-size:12.5px;line-height:1.4}
.cp-chain{flex:none;display:flex;align-items:center;gap:8px;margin:0 10px 4px;padding:6px 8px;border-radius:7px;background:rgba(88,166,255,.14);border:1px solid var(--cm-sky);font-size:12px}
.cp-chain.is-alert{background:rgba(255,149,0,.14);border-color:var(--cm-orange)}
.cp-chain-t{flex:1;min-width:0}
.cp-legal .cp-list{flex:1;min-height:0}
.cp-lline .cp-ic{color:var(--cm-yellow);background:rgba(255,214,10,.12)}
.cp-lline.is-on{border-color:var(--cm-green);background:rgba(52,199,89,.1)}
.cp-lline.is-over .cp-s{color:#ffcf8a}
.cp-check{flex:none;font-size:15px;font-weight:800;color:#8ae6a2}
.cp-notes{flex:none;display:flex;flex-direction:column;gap:4px;padding:8px 12px 12px;border-top:1px solid var(--cm-line)}
/* téléphone, fenêtre basse : toute la feuille défile (les six lignes avant les notes), plutôt qu'une liste écrasée */
.cm-coarse .cp-legal{overflow-y:auto;overscroll-behavior:contain}
.cm-coarse .cp-legal .cp-list{flex:none;overflow:visible}
@media (max-height:560px){.cp-legal{overflow-y:auto;overscroll-behavior:contain}.cp-legal .cp-list{flex:none;overflow:visible}}

/* ── « Plus… » et ses sections ── */
.cp-more>.cp-list{flex:1;min-height:0}
.cp-entry .cm-kbd{margin-left:auto}
.cp-body{flex:1;min-height:0;display:flex;flex-direction:column}
.cp-section{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden}
.cp-section>.ct-pane{flex:1;min-height:0}
.cp-orders{flex:1;min-height:0;display:flex;flex-direction:column}
.cp-orders>.cp-list{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain}
.cp-search{flex:none;display:block;padding:8px 10px 4px}
.cp-search input{width:100%;height:38px;padding:0 12px;border-radius:8px;border:1px solid var(--cm-line2);background:#0c1526;color:var(--cm-text);font:inherit;font-size:14px}
.cp-search input:focus{outline:none;border-color:var(--cm-yellow)}
.cm-coarse .cp-search input{height:44px;font-size:16px}
.cp-verb.is-locked .cp-t{color:var(--cm-dim)}
.cp-mark{flex:none;font-size:14px;color:#ffb36b}
.cp-area{display:flex;flex-direction:column;gap:2px;margin-top:4px}
.cp-arow .cp-t{font-size:12.5px}
.cp-plain{appearance:none;border:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;padding:4px 0;min-height:40px}
.cp-plain:focus{outline:none}
.cm-coarse .cp-plain{min-height:48px}
.cp-layers{flex:1;min-height:0;display:flex;flex-direction:column;gap:2px;padding:6px}
.cp-box{flex:none;width:16px;height:16px;border-radius:4px;border:1.5px solid var(--cm-line2)}
.cp-layer.is-on .cp-box{background:var(--cm-sky);border-color:var(--cm-sky);box-shadow:inset 0 0 0 2px #0c1526}
.cp-layer:not(.is-on) .cp-t{color:var(--cm-dim)}
.cp-legend{display:flex;flex-direction:column;gap:4px;margin-top:8px;padding:6px 6px 8px;border-top:1px solid var(--cm-line)}
.cp-legend-r{display:flex;align-items:center;gap:8px;font-size:11.5px;line-height:1.3;color:var(--cm-dim)}
.cp-legend-r i{flex:none;display:inline-flex}
`;
