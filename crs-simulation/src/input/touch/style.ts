/* =====================================================================================
 * Surcouche tactile — feuille de style (injectée une fois dans <head>).
 *
 * Toutes les tailles sont multipliées par la variable --s (facteur d'échelle calculé d'après
 * l'écran). Les positions des boutons sont posées en ligne à la création (voir overlay.ts) et
 * tiennent compte des zones sûres : env(safe-area-inset-*).
 * Pas de flou d'arrière-plan (backdrop-filter) : trop coûteux au-dessus d'un canevas WebGL sur téléphone.
 * ===================================================================================== */

export const STYLE_ID = 'crs-touch-style';

export const TOUCH_CSS = `
.crs-touch{position:absolute;inset:0;overflow:hidden;--s:1;color:#f4f7fb;
  font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  -webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;touch-action:none}
.crs-touch[hidden]{display:none}
.crs-touch *{box-sizing:border-box}
.ct-zone{position:absolute;display:none;pointer-events:auto;touch-action:none;z-index:0}
.ct-look{inset:0}
.ct-move{left:0;bottom:0;width:40%;top:30%}
.crs-touch[data-layout="pied"] .ct-zone,.crs-touch[data-layout="vehicule"] .ct-zone,.crs-touch[data-layout="drone"] .ct-zone{display:block}

.ct-c{position:absolute;display:none;pointer-events:auto;touch-action:none;z-index:1;
  align-items:center;justify-content:center;flex-direction:column;gap:calc(var(--s)*2px);
  background:rgba(13,19,33,.5);border:calc(var(--s)*1.5px) solid rgba(255,255,255,.46);
  box-shadow:0 calc(var(--s)*2px) calc(var(--s)*7px) rgba(0,0,0,.38);
  transition:transform .07s ease-out,background-color .07s ease-out,border-color .07s ease-out,opacity .15s}
.crs-touch[data-layout="pied"] .ct-l-pied,.crs-touch[data-layout="vehicule"] .ct-l-vehicule,.crs-touch[data-layout="drone"] .ct-l-drone{display:flex}
.crs-touch .ct-off{display:none!important}
.ct-round{border-radius:50%}
.ct-chip{border-radius:calc(var(--s)*12px);gap:calc(var(--s)*1px)}
.ct-pill{border-radius:calc(var(--s)*23px);flex-direction:row;gap:calc(var(--s)*7px);padding:0 calc(var(--s)*14px);
  width:auto!important;min-width:calc(var(--s)*108px);max-width:calc(var(--s)*250px)}
.ct-pedal{border-radius:calc(var(--s)*18px);justify-content:flex-end;padding-bottom:calc(var(--s)*11px);overflow:hidden;gap:calc(var(--s)*5px)}
.ct-c svg{flex:none;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;
  filter:drop-shadow(0 1px 1.5px rgba(0,0,0,.7));pointer-events:none}
.ct-round svg{width:42%;height:42%}
.ct-chip svg{width:calc(var(--s)*22px);height:calc(var(--s)*22px)}
.ct-pill svg{width:calc(var(--s)*22px);height:calc(var(--s)*22px)}
.ct-pedal svg{width:calc(var(--s)*34px);height:calc(var(--s)*34px)}
.ct-t{font-size:calc(var(--s)*9.5px);font-weight:700;letter-spacing:.045em;text-transform:uppercase;line-height:1.05;
  text-align:center;text-shadow:0 1px 2px rgba(0,0,0,.85);pointer-events:none;white-space:nowrap}
.ct-chip .ct-t{font-size:calc(var(--s)*8.5px);letter-spacing:.02em}
.ct-pill .ct-t{font-size:calc(var(--s)*13px);letter-spacing:.02em;text-transform:none;overflow:hidden;text-overflow:ellipsis}
.ct-pedal .ct-t{font-size:calc(var(--s)*10.5px)}
.ct-w2 .ct-t{white-space:normal;max-width:90%}
.ct-accent{border-color:rgba(255,255,255,.8);background:rgba(20,32,58,.6);border-width:calc(var(--s)*2px)}
.ct-c.is-down{background:rgba(255,255,255,.36);border-color:#fff;transform:scale(.94)}
.ct-c.is-on{background:rgba(40,104,214,.82);border-color:#d6e4ff}
.ct-c.is-ctx{background:rgba(40,104,214,.86);border-color:#e3ecff}
.ct-c.is-ctx.is-down{background:rgba(96,150,240,.95)}
.ct-c.is-dim{opacity:.6}
.ct-fill{position:absolute;left:0;right:0;bottom:0;height:0;background:rgba(72,136,240,.55);pointer-events:none;z-index:-1}
.ct-pedal{isolation:isolate}

.ct-stick{position:absolute;left:0;top:0;display:none;pointer-events:none;z-index:1;border-radius:50%;
  border:calc(var(--s)*2px) solid rgba(255,255,255,.4);
  background:radial-gradient(circle,rgba(13,19,33,.18) 0%,rgba(13,19,33,.42) 62%,rgba(13,19,33,.58) 100%);
  box-shadow:0 calc(var(--s)*2px) calc(var(--s)*9px) rgba(0,0,0,.3);will-change:transform;
  transition:border-color .1s,box-shadow .1s,opacity .15s}
.crs-touch[data-layout="pied"] .ct-stick,.crs-touch[data-layout="vehicule"] .ct-stick,.crs-touch[data-layout="drone"] .ct-stick{display:block}
.ct-stick.is-track{border-radius:calc(var(--s)*40px)}
.ct-stick.is-idle{opacity:.78}
.ct-stick.is-full{border-color:#9cc0ff;box-shadow:0 0 0 calc(var(--s)*4px) rgba(84,146,255,.5),0 calc(var(--s)*2px) calc(var(--s)*9px) rgba(0,0,0,.3)}
.ct-knob{position:absolute;left:50%;top:50%;border-radius:50%;background:rgba(244,247,251,.82);
  border:calc(var(--s)*1.5px) solid rgba(13,19,33,.55);box-shadow:0 calc(var(--s)*2px) calc(var(--s)*6px) rgba(0,0,0,.45);will-change:transform}
.ct-stick.is-full .ct-knob{background:#cfe0ff}
.ct-stick-tip{position:absolute;left:50%;bottom:100%;transform:translate(-50%,calc(var(--s)*-7px));white-space:nowrap;
  font-size:calc(var(--s)*10px);font-weight:700;letter-spacing:.06em;text-transform:uppercase;text-shadow:0 1px 2px rgba(0,0,0,.85);opacity:.85}
.ct-stick.is-full .ct-stick-tip{color:#cfe0ff;opacity:1}
.ct-stick-arrows{position:absolute;inset:0;display:none;align-items:center;justify-content:space-between;padding:0 calc(var(--s)*12px);
  font-size:calc(var(--s)*17px);opacity:.7}
.ct-stick.is-track .ct-stick-arrows{display:flex}

.ct-items{position:absolute;display:none;z-index:1;pointer-events:none;justify-content:center;align-items:stretch;gap:calc(var(--s)*5px)}
.crs-touch[data-layout="pied"] .ct-items{display:flex}
.ct-item{position:relative;flex:0 1 calc(var(--s)*46px);min-width:0;pointer-events:auto;touch-action:none;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:calc(var(--s)*1px);overflow:hidden;
  border-radius:calc(var(--s)*10px);background:rgba(13,19,33,.5);border:calc(var(--s)*1.5px) solid rgba(255,255,255,.3);
  box-shadow:0 calc(var(--s)*2px) calc(var(--s)*6px) rgba(0,0,0,.32);transition:transform .07s,background-color .07s,border-color .07s}
.ct-item.is-active{border-color:#fff;background:rgba(40,104,214,.8)}
.ct-item.is-down{background:rgba(255,255,255,.36);transform:scale(.94)}
.ct-item-ic{font-size:calc(var(--s)*21px);line-height:1;pointer-events:none;text-shadow:0 1px 2px rgba(0,0,0,.7)}
.ct-item-ic.is-text{font-size:calc(var(--s)*8px);font-weight:700;letter-spacing:0;
  max-width:96%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:calc(var(--s)*6px)}
.ct-item-l{font-size:calc(var(--s)*7.5px);font-weight:600;line-height:1;max-width:94%;overflow:hidden;white-space:nowrap;
  text-overflow:clip;opacity:.9;pointer-events:none}
.ct-item-n{position:absolute;right:calc(var(--s)*4px);top:calc(var(--s)*2px);font-size:calc(var(--s)*9.5px);font-weight:700;
  line-height:1.15;text-shadow:0 1px 2px rgba(0,0,0,.9);pointer-events:none}
.ct-item-k{position:absolute;left:calc(var(--s)*4px);top:calc(var(--s)*2px);font-size:calc(var(--s)*8.5px);font-weight:600;
  line-height:1.25;opacity:.7;pointer-events:none}
.ct-item-ic{margin-top:calc(var(--s)*7px)}

.ct-rotate{position:absolute;inset:0;z-index:9999;display:none;pointer-events:auto;touch-action:none;
  flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:28px;text-align:center;background:rgba(8,12,22,.97)}
.crs-touch.is-portrait .ct-rotate{display:flex}
.crs-touch.is-portrait .ct-c,.crs-touch.is-portrait .ct-stick,.crs-touch.is-portrait .ct-items,.crs-touch.is-portrait .ct-zone{display:none!important}
.ct-rotate svg{width:104px;height:104px;fill:none;stroke:#f4f7fb;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;
  animation:ct-turn 2.6s ease-in-out infinite}
.ct-rotate b{font-size:21px;font-weight:700;letter-spacing:.01em}
.ct-rotate span{font-size:15px;line-height:1.45;color:#aab6cc;max-width:30ch}
@keyframes ct-turn{0%,18%{transform:rotate(0)}58%,100%{transform:rotate(-90deg)}}
@media (prefers-reduced-motion:reduce){.ct-rotate svg{animation:none;transform:rotate(-90deg)}.ct-c,.ct-item{transition:none}}
.ct-probe{position:absolute;left:0;top:0;visibility:hidden;pointer-events:none;
  width:env(safe-area-inset-left,0px);height:env(safe-area-inset-bottom,0px)}
`;
