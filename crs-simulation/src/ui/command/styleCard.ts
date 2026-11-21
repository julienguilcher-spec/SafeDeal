/* =====================================================================================
 * Feuille de style de la FICHE de la carte de commandement (panelCard.ts, préfixe « cc- ») : en-tête, lignes
 * numérotées (52 px ; 40 px au téléphone), marques légales (⚖ / 🔒), bloc « Qui », phrase « Ce qui va se passer »,
 * « Donner l'ordre » / « ‹ Retour » (44 px ; 48 px au doigt), liste « Qui envoyer ? », confirmation légale (S3) et
 * bandeau « ✓ ORDRE DONNÉ » (S4). La ligne surlignée se voit autrement que par la couleur : marque « ▶ » et bord
 * épais. S'appuie sur les jetons de .cm-root ; ajoutée à la feuille du commandement par l'intégration (style.ts).
 * ===================================================================================== */

export const CARD_CSS = `
/* ── fiche : structure ── */
.cc{flex:1;min-height:0;display:flex;flex-direction:column;color:var(--cm-text);font-size:13px;line-height:1.35;user-select:none;-webkit-user-select:none}
.cc [hidden]{display:none !important}
.cc-box{flex:1;min-height:0;display:flex;flex-direction:column}
.cc-btn{appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 12px;border:1px solid var(--cm-line2);
border-radius:8px;background:var(--cm-raise);color:var(--cm-text);font:inherit;font-weight:700;font-size:13px;cursor:pointer;white-space:nowrap;touch-action:manipulation}
.cc-btn:hover{background:var(--cm-raise2);border-color:rgba(170,190,230,.55)}
.cc-btn:focus{outline:none}
.cc-btn[disabled]{opacity:.42;cursor:default;pointer-events:none}
.cc-btn.is-primary{flex:1;background:var(--cm-blue);border-color:#6fa3ff;color:#fff}
.cc-btn.is-primary:hover{background:#2b74f0}
.cc-btn.is-on{background:#f1f5fd;border-color:#fff;color:#0b1424}
.cc-btn.is-small{min-height:32px;padding:0 9px;font-size:12px}
.cc-btn .cm-kbd{background:rgba(8,14,26,.35)}
.cc-btn.is-primary .cm-kbd,.cc-btn.is-on .cm-kbd{color:inherit;border-color:currentColor}
.cm-coarse .cc-btn{min-height:48px}
.cm-coarse .cc-btn.is-small{min-height:44px;min-width:44px}
.cm-coarse .cc .cm-kbd{display:none}
/* au doigt, les indications du clavier (« Espace : cocher plusieurs · Entrée : valider ») ne servent à rien */
.cm-coarse .cc-hint{display:none}

/* ── en-tête ── */
.cc-head{flex:none;display:flex;flex-direction:column;gap:3px;padding:10px 12px 8px;border-bottom:1px solid var(--cm-line)}
.cc-top{display:flex;align-items:center;gap:8px;min-height:28px}
.cc-title{flex:1;min-width:0;margin:0;font-size:13.5px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;line-height:1.25;
display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
.cc-pos{flex:none;display:inline-flex;align-items:center;gap:2px;font-size:12px;font-weight:700;color:var(--cm-dim)}
.cc-pos .cc-btn{min-height:28px;min-width:28px;padding:0 6px;border-color:transparent;background:transparent;color:var(--cm-dim)}
.cc-pos .cc-btn:hover{background:rgba(148,168,208,.14);color:var(--cm-text)}
.cm-coarse .cc-pos .cc-btn{min-height:40px;min-width:40px}
.cc-x{flex:none}
.cc-tabs{display:flex;flex-wrap:wrap;gap:4px}
.cc-tab{min-height:26px;padding:0 9px;border-radius:13px;font-size:11.5px;font-weight:700}
.cc-tab.is-on{background:var(--cm-yellow);border-color:var(--cm-yellow);color:#0b1424}
.cm-coarse .cc-tab{min-height:36px}
/* téléphone : les repères empilés sur une seule rangée qui défile de côté (jamais plusieurs lignes d'onglets) */
.cc.is-compact .cc-tabs{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}
.cc.is-compact .cc-tabs::-webkit-scrollbar{display:none}
.cc.is-compact .cc-tab{flex:none;white-space:nowrap}
.cc.is-compact .cc-top>.cc-tabs{flex:1 1 auto;min-width:0}
.cc.is-compact .cc-top>.cc-tabs .cc-tab{min-height:36px}
.cc-sticky{padding:4px 8px;border-radius:6px;background:rgba(255,214,10,.12);border:1px solid rgba(255,214,10,.45);color:#ffe680;font-size:12px;font-weight:700}
.cc-subl{font-size:12px;color:var(--cm-dim);display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
.cc-notes{display:flex;flex-direction:column;gap:1px;font-size:11.5px;color:var(--cm-dim)}
.cc-note.is-warn{color:#ffcf8a}

/* ── S4 : ordre donné ── */
.cc-sent{display:flex;flex-direction:column;gap:4px;padding:8px 10px;border-radius:8px;background:rgba(52,199,89,.16);border:1px solid var(--cm-green)}
.cc-sent-t{font-size:13px;font-weight:800;color:#8ae6a2;letter-spacing:.02em}
.cc-sent-d{font-size:12px;color:var(--cm-text)}
.cc-sent .cc-btn{align-self:flex-start}

/* ── lignes ── */
.cc-list{flex:1;min-height:0;display:flex;flex-direction:column;gap:2px;padding:6px 6px 4px;overflow-y:auto}
.cc-cap{padding:4px 8px 2px;font-size:10.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--cm-dim)}
.cc-row{appearance:none;position:relative;flex:none;display:flex;align-items:center;gap:8px;min-height:52px;width:100%;padding:5px 8px 5px 6px;
border:1px solid transparent;border-left-width:4px;border-radius:7px;background:transparent;color:var(--cm-text);font:inherit;text-align:left;cursor:pointer;touch-action:manipulation}
.cc-row:hover{background:rgba(148,168,208,.1)}
.cc-row:focus{outline:none}
.cc-row.is-on{background:rgba(255,214,10,.13);border-color:rgba(255,214,10,.5);border-left-color:var(--cm-yellow)}
.cc-mk{flex:none;width:12px;font-size:11px;color:var(--cm-yellow);text-align:center}
.cc-n{flex:none;width:18px;height:18px;border-radius:4px;border:1px solid var(--cm-line2);font-size:11px;font-weight:800;line-height:16px;text-align:center;color:var(--cm-dim)}
.cc-row.is-on .cc-n{border-color:var(--cm-yellow);color:var(--cm-yellow)}
.cc-ic{flex:none;display:inline-flex;width:20px;height:20px;color:var(--cm-sky)}
.cc-ic svg{width:20px;height:20px}
.cc-tx{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.cc-lab{font-size:13.5px;font-weight:700;line-height:1.2}
.cc-exp{font-size:11.5px;color:var(--cm-dim);line-height:1.25}
.cc-lock{color:#ffb35c;font-weight:700}
.cc-law{color:#ffd28a;font-weight:700}
.cc-mark{flex:none;min-width:20px;font-size:14px;text-align:center}
.cc-row.is-locked .cc-lab{color:#d9dfeb}
.cc-row.is-others .cc-lab{color:var(--cm-dim);font-weight:600}
.cc-empty{padding:10px 12px;font-size:12.5px;color:var(--cm-dim)}

/* ── Qui, phrase, pied ── */
.cc-who{flex:none;display:flex;flex-direction:column;gap:6px;padding:8px 12px;border-top:1px solid var(--cm-line)}
.cc-who-name{appearance:none;display:flex;flex-direction:column;align-items:flex-start;gap:1px;padding:0;border:0;background:transparent;color:var(--cm-text);font:inherit;text-align:left;cursor:pointer}
.cc-who-name[disabled]{cursor:default}
.cc-who-name b{font-size:13px}
.cc-who-name span{font-size:12px;color:var(--cm-dim)}
.cc-who-name:not([disabled]):hover b{text-decoration:underline}
.cc-who-btns{display:flex;gap:6px}
.cc-who-btns .cc-btn{flex:1;min-height:40px}
.cm-coarse .cc-who-btns .cc-btn{min-height:48px}
.cc-say{flex:none;padding:6px 12px 2px;font-size:12.5px;line-height:1.4}
.cc-rule{flex:none;padding:0 12px 4px;font-size:12px;color:var(--cm-orange);font-weight:600}
.cc-foot{flex:none;display:flex;gap:8px;align-items:center;padding:8px 12px 8px}
.cc-hint{flex:none;padding:0 12px 8px;font-size:11px;color:var(--cm-faint)}

/* ── fenêtre basse (moins de 760 px, MacBook Air avec les barres du navigateur ; classe is-short de l'écran) :
   lignes de 44 px au pointeur fin, Qui resserré : la fiche tient sans défiler jusqu'à 720 px de haut ── */
.ct.is-short:not(.cm-coarse) .cc:not(.is-compact) .cc-row{min-height:44px;padding-top:3px;padding-bottom:3px}
.ct.is-short:not(.cm-coarse) .cc:not(.is-compact) .cc-head{padding:7px 12px 6px}
.ct.is-short:not(.cm-coarse) .cc:not(.is-compact) .cc-who{gap:4px;padding:6px 12px}
.ct.is-short:not(.cm-coarse) .cc:not(.is-compact) .cc-who-btns .cc-btn{min-height:36px}
.ct.is-short:not(.cm-coarse) .cc:not(.is-compact) .cc-say{padding-top:4px}
.ct.is-short:not(.cm-coarse) .cc:not(.is-compact) .cc-foot{padding:6px 12px}
/* fiche chargée qui déborderait (onglets, notes, règles ; classe is-tight posée par l'écran après mesure) : mêmes
   resserrements, quelle que soit la hauteur de la fenêtre — la fiche ne défile jamais */
.cc.is-tight:not(.is-compact) .cc-row{min-height:44px;padding-top:3px;padding-bottom:3px}
.cc.is-tight:not(.is-compact) .cc-head{padding:7px 12px 6px}
.cc.is-tight:not(.is-compact) .cc-who{gap:4px;padding:6px 12px}
.cc.is-tight:not(.is-compact) .cc-who-btns .cc-btn{min-height:36px}
.cc.is-tight:not(.is-compact) .cc-say{padding-top:4px}
.cc.is-tight:not(.is-compact) .cc-foot{padding:6px 12px}

/* ── téléphone (feuille de 380 px) : lignes de 40 px, explication de la ligne surlignée seulement, Qui et envoi sur une rangée ── */
/* téléphone : en-tête, lignes et pied au plus juste — les six lignes, « Autres ordres ici… » et « Donner l'ordre »
   tiennent dans les 390 px de la feuille sans défiler */
.cc.is-compact .cc-head{padding:0 8px;gap:2px}
.cc.is-compact .cc-top{min-height:30px}
.cc.is-compact .cc-title{font-size:12.5px;-webkit-line-clamp:1}
.cc.is-compact .cc-list{padding:1px 4px}
.cc.is-compact .cc-row{min-height:40px;padding:2px 6px 2px 4px}
.cc.is-compact .cc-lab{font-size:13px}
.cc.is-compact .cc-exp{font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cc.is-compact .cc-foot{min-height:44px;padding:0 8px calc(2px + var(--safe-bottom,0px));gap:6px}
.cc-wq{flex:1;min-width:0;display:flex;align-items:center;gap:4px;font-size:12px}
.cc-wq b{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cc.is-compact .cc-foot .cc-btn.is-primary{flex:none;min-width:120px}

/* ── liste « Qui envoyer ? » ── */
.cc-qrow{appearance:none;flex:none;display:flex;align-items:center;gap:8px;min-height:48px;width:100%;padding:4px 8px 4px 6px;border:1px solid transparent;border-left-width:4px;
border-radius:7px;background:transparent;color:var(--cm-text);font:inherit;text-align:left;cursor:pointer;touch-action:manipulation}
.cc-qrow:hover{background:rgba(148,168,208,.1)}
.cc-qrow.is-on{background:rgba(255,214,10,.13);border-color:rgba(255,214,10,.5);border-left-color:var(--cm-yellow)}
.cc-tick{flex:none;display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border:1px solid var(--cm-line2);border-radius:5px;background:rgba(8,14,26,.5);
color:var(--cm-text);font:inherit;font-size:14px;font-weight:800;cursor:pointer}
.cm-coarse .cc-tick{width:36px;height:36px}
.cc-tick.is-on{background:var(--cm-yellow);border-color:var(--cm-yellow);color:#0b1424}
.cc-ok{color:var(--cm-green);font-size:11.5px;font-weight:700;white-space:nowrap}

/* ── confirmation légale (S3) ── */
.cc-cf{flex:1;min-height:0;display:flex;flex-direction:column;gap:8px;padding:12px;overflow-y:auto}
.cc-cf-intro{font-size:12.5px;color:var(--cm-dim)}
.cc-steps{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px}
.cc-step{display:flex;gap:8px;font-size:13px;line-height:1.35}
.cc-step i{flex:none;font-style:normal;font-weight:800;color:var(--cm-yellow)}
.cc-warn{padding:8px 10px;border-radius:8px;border:1px solid #ff9f43;background:rgba(255,159,67,.12);color:#ffcf8a;font-size:12.5px;font-weight:700}
.cc-cf-btns{display:flex;flex-direction:column;gap:6px;margin-top:4px}
.cc-cf-btns .cc-btn{width:100%}
`;
