/* =====================================================================================
 * Feuille de style des cartes (injectée une fois). Direction artistique « salle de commandement » :
 * bleu nuit, blanc, rouge et jaune signalétiques, liseré tricolore discret, chiffres tabulaires.
 * Toutes les classes sont préfixées « cm- » ; les jetons sont portés par .cm-root.
 * ===================================================================================== */

const CSS = `
.cm-root{--cm-bg:rgba(9,16,31,.9);--cm-solid:#0b1424;--cm-panel:rgba(12,21,39,.94);--cm-raise:#152440;--cm-raise2:#1b2d50;
--cm-line:rgba(148,168,208,.2);--cm-line2:rgba(148,168,208,.36);--cm-text:#eaf0fa;--cm-dim:#9aabc9;--cm-faint:#6f80a0;
--cm-blue:#1f66e0;--cm-sky:#58a6ff;--cm-red:#ff3b30;--cm-fr:#e1000f;--cm-yellow:#ffd60a;--cm-orange:#ff9500;--cm-green:#34c759;--cm-cyan:#3ddcff;
--cm-tap:32px;--cm-r:8px;
color:var(--cm-text);font:13px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased;letter-spacing:.005em;-webkit-tap-highlight-color:transparent;
-webkit-user-select:none;user-select:none;box-sizing:border-box}
.cm-root *,.cm-root *::before,.cm-root *::after{box-sizing:border-box}
.cm-root.cm-coarse{--cm-tap:44px}
.cm-ico{display:block;flex:none}
.cm-panel{background:var(--cm-panel);border:1px solid var(--cm-line);border-radius:var(--cm-r);box-shadow:0 8px 28px rgba(0,0,0,.38)}
.cm-title{display:flex;align-items:center;gap:9px;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--cm-text);white-space:nowrap}
.cm-title::before{content:"";flex:none;width:18px;height:4px;border-radius:1px;background:linear-gradient(90deg,#2b5fd9 0 33.3%,#fff 33.3% 66.6%,var(--cm-fr) 66.6%)}
.cm-sub{font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--cm-dim)}
.cm-btn{appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:var(--cm-tap);padding:0 11px;
border:1px solid var(--cm-line2);border-radius:6px;background:var(--cm-raise);color:var(--cm-text);font:inherit;font-weight:600;font-size:12.5px;
cursor:pointer;white-space:nowrap;transition:background .12s,border-color .12s,transform .08s;touch-action:manipulation}
.cm-btn:hover{background:var(--cm-raise2);border-color:rgba(170,190,230,.55)}
.cm-btn:active{transform:translateY(1px)}
.cm-btn:focus{outline:none}
.cm-btn:focus-visible,.cm-focusable:focus-visible{outline:2px solid var(--cm-yellow);outline-offset:1px}
.cm-btn[disabled]{opacity:.42;cursor:default;pointer-events:none}
.cm-btn.is-primary{background:var(--cm-blue);border-color:#6fa3ff;color:#fff}
.cm-btn.is-primary:hover{background:#2b74f0}
.cm-btn.is-danger{background:#8f1811;border-color:#ff6a5f;color:#fff}
.cm-btn.is-danger:hover{background:#a81d15}
.cm-btn.is-ghost{background:transparent;border-color:transparent;color:var(--cm-dim)}
.cm-btn.is-ghost:hover{background:rgba(148,168,208,.12);color:var(--cm-text)}
.cm-btn.is-on{background:#f1f5fd;border-color:#fff;color:#0b1424}
.cm-btn.is-icon{width:var(--cm-tap);padding:0}
.cm-btn.is-small{min-height:calc(var(--cm-tap) - 4px);padding:0 8px;font-size:12px}
.cm-kbd{display:inline-block;min-width:18px;padding:1px 5px;border:1px solid var(--cm-line2);border-bottom-width:2px;border-radius:4px;
font-size:10.5px;font-weight:700;line-height:1.3;text-align:center;color:var(--cm-dim);background:rgba(8,14,26,.6)}
.cm-chip{display:inline-flex;align-items:center;gap:4px;height:18px;padding:0 6px;border-radius:9px;font-size:10px;font-weight:700;letter-spacing:.04em;
background:rgba(148,168,208,.16);color:var(--cm-text);white-space:nowrap}

/* ── carte interactive ── */
.cm-map{position:absolute;inset:0;overflow:hidden;background:#0f1829;touch-action:none}
.cm-map canvas{position:absolute;left:0;top:0;width:100%;height:100%;display:block;touch-action:none;outline:none}
.cm-cursor{position:absolute;left:0;top:0;width:34px;height:34px;margin:-17px 0 0 -17px;pointer-events:none;display:none;will-change:transform;z-index:3}
.cm-cursor::before,.cm-cursor::after{content:"";position:absolute;left:50%;top:50%;background:#fff;box-shadow:0 0 0 1px rgba(8,14,26,.8)}
.cm-cursor::before{width:2px;height:34px;margin:-17px 0 0 -1px;clip-path:polygon(0 0,100% 0,100% 34%,0 34%,0 66%,100% 66%,100% 100%,0 100%)}
.cm-cursor::after{width:34px;height:2px;margin:-1px 0 0 -17px;clip-path:polygon(0 0,34% 0,34% 100%,0 100%,0 0,66% 0,100% 0,100% 100%,66% 100%,66% 0)}
.cm-cursor.is-on{display:block}
.cm-mapctl{position:absolute;right:calc(10px + var(--safe-right,0px));bottom:calc(10px + var(--safe-bottom,0px));display:flex;flex-direction:column;gap:6px;z-index:4}
.cm-mapctl .cm-btn{background:var(--cm-panel);box-shadow:0 4px 14px rgba(0,0,0,.35)}
.cm-scale{position:absolute;left:calc(12px + var(--safe-left,0px));bottom:calc(10px + var(--safe-bottom,0px));z-index:4;pointer-events:none;
display:flex;flex-direction:column;gap:3px;font-size:10.5px;font-weight:700;color:#dfe7f6;text-shadow:0 1px 2px #000}
.cm-scale i{display:block;height:5px;border:1.5px solid #dfe7f6;border-top:0;box-shadow:0 1px 0 rgba(0,0,0,.5)}
.cm-attrib{position:absolute;left:50%;bottom:calc(4px + var(--safe-bottom,0px));transform:translateX(-50%);z-index:4;pointer-events:none;
max-width:46%;font-size:9.5px;color:rgba(200,212,236,.62);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 1px 2px #000}
.cm-compass{position:absolute;z-index:4;pointer-events:none;display:flex;align-items:center;gap:8px;padding:5px 10px 5px 6px;border-radius:20px;
background:var(--cm-panel);border:1px solid var(--cm-line);font-size:11px;font-weight:600;color:var(--cm-dim)}
.cm-compass b{color:var(--cm-text);font-weight:700}
.cm-rose{position:relative;width:30px;height:30px;border-radius:50%;border:1.5px solid var(--cm-line2);flex:none}
.cm-rose::before{content:"N";position:absolute;left:50%;top:-1px;transform:translateX(-50%);font-size:8px;font-weight:800;color:var(--cm-red);line-height:1;background:var(--cm-solid);padding:0 1px}
.cm-rose i{position:absolute;left:50%;top:50%;width:2.5px;height:20px;margin:-10px 0 0 -1.25px;background:var(--cm-cyan);border-radius:2px;will-change:transform}
.cm-rose i::before{content:"";position:absolute;left:50%;top:-3px;margin-left:-4.5px;border:4.5px solid transparent;border-bottom:7px solid var(--cm-cyan);border-top:0}

/* ── mini-carte ── */
.cm-mini{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:5px;pointer-events:none;width:max-content;max-width:240px}
.cm-mini.is-off{display:none}
.cm-mini-disc{position:relative;width:var(--cm-mini,168px);height:var(--cm-mini,168px);flex:none;pointer-events:auto;cursor:pointer;border-radius:50%}
.cm-mini-clip{position:absolute;inset:0;border-radius:50%;overflow:hidden;background:#0f1829;border:2px solid rgba(214,226,250,.72);
box-shadow:0 0 0 1px rgba(5,10,20,.9),0 6px 18px rgba(0,0,0,.45);contain:strict}
.cm-mini-rotor{position:absolute;left:50%;top:50%;width:0;height:0;will-change:transform}
.cm-mini-rotor canvas{position:absolute;display:block}
.cm-mini-clip::after{content:"";position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle,rgba(5,10,20,0) 58%,rgba(5,10,20,.5) 100%);pointer-events:none}
.cm-mini-me{position:absolute;left:50%;top:50%;width:16px;height:18px;margin:-10px 0 0 -8px;pointer-events:none}
.cm-mini-n{position:absolute;left:50%;top:50%;width:0;height:0;pointer-events:none;will-change:transform}
.cm-mini-n b{position:absolute;left:-8px;top:-8px;width:16px;height:16px;border-radius:50%;background:#0b1424;border:1.5px solid rgba(214,226,250,.72);
color:var(--cm-red);font-size:9.5px;font-weight:800;line-height:13px;text-align:center}
.cm-mini-gps{position:absolute;left:50%;top:50%;width:0;height:0;pointer-events:none;will-change:transform;display:none}
.cm-mini-gps.is-on{display:block}
.cm-mini-gps i{position:absolute;left:-6px;top:-7px;border:6px solid transparent;border-bottom:10px solid var(--cm-cyan);border-top:0;filter:drop-shadow(0 0 1.5px #04101f)}
.cm-mini-info{display:flex;flex-direction:column;gap:1px;padding:3px 8px 4px;border-radius:6px;background:rgba(9,16,31,.78);border:1px solid var(--cm-line);max-width:100%}
.cm-mini-street{font-size:10.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cm-mini-dist{font-size:11px;font-weight:600;color:var(--cm-cyan);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cm-mini-dist:empty{display:none}

/* ── plan de Paris ── */
.cm-plan{position:absolute;inset:0;overflow:hidden;background:#0f1829}
.cm-plan-top{position:absolute;left:calc(12px + var(--safe-left,0px));top:calc(12px + var(--safe-top,0px));z-index:5;width:min(340px,calc(100% - 140px));
display:flex;flex-direction:column;gap:8px;padding:10px 12px 12px}
.cm-plan-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.cm-search{display:flex;align-items:center;gap:7px;height:var(--cm-tap);min-height:34px;padding:0 9px;border-radius:6px;background:rgba(5,10,20,.6);border:1px solid var(--cm-line2);color:var(--cm-dim)}
.cm-search:focus-within{border-color:var(--cm-sky)}
.cm-search input{flex:1;min-width:0;height:100%;border:0;outline:0;background:transparent;color:var(--cm-text);font:inherit;font-size:13px;-webkit-user-select:text;user-select:text}
.cm-search input::placeholder{color:var(--cm-faint)}
.cm-results{display:flex;flex-direction:column;gap:2px;max-height:min(46vh,300px);overflow:auto;overscroll-behavior:contain;margin:0 -4px -4px;padding:0 4px 4px}
.cm-results:empty{display:none}
.cm-result{appearance:none;display:flex;align-items:center;gap:9px;width:100%;min-height:var(--cm-tap);padding:5px 8px;border:1px solid transparent;border-radius:6px;background:transparent;
color:var(--cm-text);font:inherit;text-align:left;cursor:pointer}
.cm-result:hover,.cm-result:focus-visible{background:var(--cm-raise);border-color:var(--cm-line2);outline:none}
.cm-result b{display:block;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cm-result small{display:block;font-size:10.5px;color:var(--cm-dim)}
.cm-result span{flex:1;min-width:0}
.cm-result em{font-style:normal;font-size:11px;color:var(--cm-dim);white-space:nowrap}
.cm-plan-close{position:absolute;right:calc(12px + var(--safe-right,0px));top:calc(12px + var(--safe-top,0px));z-index:5}
.cm-plan-card{position:absolute;left:50%;bottom:calc(22px + var(--safe-bottom,0px));transform:translateX(-50%);z-index:5;display:flex;align-items:center;gap:12px;
max-width:calc(100% - 150px);padding:9px 10px 9px 14px}
.cm-plan-card.is-off{display:none}
.cm-plan-card div{min-width:0}
.cm-plan-card b{display:block;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cm-plan-card small{display:block;font-size:11.5px;color:var(--cm-dim);white-space:nowrap}
.cm-plan-compass{left:calc(12px + var(--safe-left,0px));bottom:calc(44px + var(--safe-bottom,0px))}
.cm-plan-legend{position:absolute;right:calc(58px + var(--safe-right,0px));bottom:calc(10px + var(--safe-bottom,0px));z-index:4;display:flex;gap:10px;padding:6px 10px;font-size:10.5px;color:var(--cm-dim);pointer-events:none}
.cm-plan-legend span{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
.cm-plan-legend i{display:inline-block;width:10px;height:10px;border-radius:50%}
@media (max-height:480px){.cm-plan-legend{display:none}.cm-plan-top{padding:8px 10px 10px;gap:6px}}
`;

let injected = false;

/** Installe la feuille de style (une seule fois par document). */
export function ensureMapsStyle(): void {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const style = document.createElement('style');
  style.id = 'crs-maps-style';
  style.textContent = CSS;
  document.head.appendChild(style);
}

/** Le pointeur principal est-il grossier (doigt) ? Les cibles passent alors à 44 px. */
export function coarsePointer(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(hover: none)').matches;
}
