/* =====================================================================================
 * PATROUILLE (interface) — carte d'appel de CENTRAL pendant une vacation.
 *
 * Deux présentations d'un même panneau (CallPanel) :
 *   - HUD (zone de gauche, au-dessus des actions rapides ; en haut au centre, sous la boussole, sur écran tactile) : carte
 *     « hud-appel » avec « Prendre l'appel » et « Décliner » à l'annonce, puis « Renforts » (Patrouille, Compagnie de CRS, Pompiers, SAMU) et « Fin
 *     d'intervention ». Touches lues directement : Y prend l'appel, Maj + Y le décline (KeyY est réservée dans
 *     src/input/bindings.ts) ; appel déjà pris : Y ouvre l'écran radio, où l'on choisit renforts et fin d'intervention
 *     au clavier. Sans effet quand un champ de saisie a le focus ou qu'un écran modal est ouvert. Au bout de 20 s sans
 *     changement, la carte se replie en une pastille « Appel en cours » (un toucher ou Y la rouvre).
 *   - écran radio (chemin manette) : section « Appel en cours » avec les mêmes boutons, renforts toujours visibles.
 * Le répartiteur (service 'patrol.mode', src/gameplay/patrols/mode.ts) fait tout le travail : ce module ne fait
 * qu'afficher son état (rafraîchi toutes les 0,5 s) et lui transmettre les réponses du joueur.
 * ===================================================================================== */

import type { GameContext } from '@/core/contracts';
import type { HudWidget } from '@/core/extensions';
import { PATROL_MODE_SERVICE, readVacation } from '@/gameplay/patrols/model';
import type { BackupKind, DispatchCall, PatrolModeApi } from '@/gameplay/patrols/model';
import type { InputLabelsApi } from '@/input/api';
import { button, el, setClass, setText } from '../maps/icons';
import { coarsePointer } from '../maps/style';
import { ensureCommandStyle } from '../command/style';
import { capitalize, distanceLabel } from '../core/format';
import { BACKUP_KINDS, BACKUP_LABELS, backupOptions, backupRefused, callLine, callTitle, stateLabel } from './format';

/** Touche de réponse aux appels (code physique : même place en AZERTY et en QWERTY ; « Z » en QWERTZ). */
export const CALL_KEY = 'KeyY';
/** Période de rafraîchissement de la carte (s). */
const PERIOD = 0.5;
/** Délai au bout duquel la carte du HUD se replie en pastille (s sans changement d'état). */
const COLLAPSE_AFTER = 20;

const STYLE_ID = 'pd-style';

function ensurePatrolStyle(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
.pd{pointer-events:auto;width:max-content;max-width:min(330px,100%);text-shadow:none}
.pd .pd-off,.pd-off{display:none !important}
.pd-card{display:flex;flex-direction:column;gap:5px;padding:9px 11px 10px;border-radius:10px;background:rgba(11,18,32,.9);
border:1px solid rgba(255,196,64,.55);box-shadow:0 6px 22px rgba(0,0,0,.4);backdrop-filter:blur(4px)}
.pd-card[data-state="acceptee"],.pd-card[data-state="sur_place"]{border-color:rgba(88,166,255,.6)}
.pd-card[data-state="fin"]{border-color:rgba(255,255,255,.3)}
.pd-kick{display:flex;align-items:center;gap:7px;font-size:10.5px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:#ffc440}
.pd-card[data-state="acceptee"] .pd-kick,.pd-card[data-state="sur_place"] .pd-kick{color:#58a6ff}
.pd-card[data-state="fin"] .pd-kick{color:#c3cbda}
.pd-dot{width:8px;height:8px;border-radius:50%;background:currentColor;flex:none}
.pd-card[data-state="annonce"] .pd-dot{animation:pd-blink 1s steps(2,start) infinite}
@keyframes pd-blink{to{visibility:hidden}}
.pd-title{font-size:14px;font-weight:800;letter-spacing:.02em;line-height:1.2;color:#f2f5fa}
.pd-line{font-size:12.5px;color:#d4dbe8;line-height:1.3}
.pd-note{font-size:11.5px;color:#9aabc9;line-height:1.3}
.pd-row{display:flex;flex-wrap:wrap;gap:6px;margin-top:3px}
.pd-row .cm-btn{min-height:36px;padding:4px 10px;font-size:12.5px;font-weight:650;border-radius:8px;gap:7px}
.pd-row .pd-go{background:#1f66e0;border-color:#6fa3ff;color:#fff}
.pd-row .pd-go:hover{background:#2b74f0}
.pd-backup{padding-left:6px;border-left:2px solid rgba(88,166,255,.45)}
.pd-backup .cm-btn{min-height:32px;font-size:12px}
.pd-key{padding:1px 6px;border-radius:5px;background:rgba(255,255,255,.16);font-size:11px;font-weight:700;color:#e6ebf4;white-space:nowrap}
.pd-pill{display:inline-flex;align-items:center;gap:8px;min-height:36px;padding:4px 12px;border-radius:18px;background:rgba(11,18,32,.9);
border:1px solid rgba(255,196,64,.6);color:#f2f5fa;font:600 12.5px/1.2 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;cursor:pointer}
.pd-pill[data-state="acceptee"],.pd-pill[data-state="sur_place"]{border-color:rgba(88,166,255,.65)}
.pd-pill:focus-visible{outline:2px solid #ffd60a;outline-offset:1px}
/* écran tactile (téléphone) : carte compacte en haut au centre — titre, lieu et distance, deux boutons de 40 px ; ni bandeau
   d'état, ni touches, ni indications ; « Renforts » ouvre l'écran radio */
.ui-hud:not([data-touch="none"]) .pd{max-width:min(270px,100%)}
.ui-hud:not([data-touch="none"]) .pd-card{padding:6px 8px 7px;gap:3px}
.ui-hud:not([data-touch="none"]) .pd-title{font-size:12.5px}
.ui-hud:not([data-touch="none"]) .pd-line{font-size:11.5px}
.ui-hud:not([data-touch="none"]) .pd-note,.ui-hud:not([data-touch="none"]) .pd-key,.ui-hud:not([data-touch="none"]) .pd-kick{display:none}
.ui-hud:not([data-touch="none"]) .pd-row{gap:5px;margin-top:2px}
.ui-hud:not([data-touch="none"]) .pd-row .cm-btn{min-height:40px;padding:4px 10px;font-size:12px}
.ui-hud:not([data-touch="none"]) .pd-pill{min-height:40px}
@media (pointer:coarse){.pd-key{display:none}.pd-row .cm-btn,.pd-pill{min-height:44px}}
/* écran tactile, carte d'appel dépliée (en haut au centre) : les pastilles « Suivez-moi » / « Secours ici » du bloc
   « ORDRES » (sous la mini-carte, à la même hauteur) passaient sous le bas de la carte et prenaient le toucher de
   « Renforts » ; les sous-titres montaient sur ses boutons. Elles s'effacent le temps de la carte (20 s au plus, puis
   pastille « Appel en cours ») : la roue « Ordres » garde les mêmes ordres, et la carte a ses renforts pompiers / SAMU. */
.ui-hud[data-pd-open="1"]:not([data-touch="none"]) [data-id="hud-orders"]{display:none!important}
/* écran radio : section « Appel en cours » */
.cr-call{flex:none;display:flex;flex-direction:column;gap:5px;padding:9px 12px 10px;border-bottom:1px solid var(--cm-line);background:rgba(60,44,8,.35);
max-height:52%;overflow-y:auto}
.cm-coarse .cr-call .pd-note{display:none}
.cr-call[data-state="acceptee"],.cr-call[data-state="sur_place"]{background:rgba(16,40,80,.4)}
.cr-call .pd-row .cm-btn{min-height:var(--cm-tap)}
.cr-call .pd-backup{padding-left:0;border-left:0}
.cr-call .pd-backup .cm-sub{flex-basis:100%}
`;
  document.head.appendChild(s);
}

/** Service du répartiteur, s'il existe et qu'une vacation est en cours. */
export function patrolMode(ctx: GameContext): PatrolModeApi | null {
  const api = ctx.service<PatrolModeApi>(PATROL_MODE_SERVICE);
  return api && typeof api.accept === 'function' && api.active ? api : null;
}

function labels(ctx: GameContext): InputLabelsApi | undefined {
  const l = ctx.service<InputLabelsApi>('input.labels');
  return l && typeof l.codeLabel === 'function' ? l : undefined;
}

/** Libellé de la touche d'appel (« Y » en AZERTY ou QWERTY, « Z » en QWERTZ). */
export function callKeyLabel(ctx: GameContext): string {
  const l = labels(ctx);
  try {
    if (l) return l.codeLabel('kbm', CALL_KEY) || 'Y';
  } catch (err) {
    console.error('[patrouille] libellé de la touche d’appel indisponible', err);
  }
  return 'Y';
}

type Variant = 'hud' | 'radio';

/**
 * Panneau d'un appel (carte du HUD ou section de l'écran radio). Tous les boutons sont créés une fois et seulement
 * montrés ou masqués : le focus de la manette n'est jamais perdu par une reconstruction.
 */
export class CallPanel {
  readonly root: HTMLDivElement;
  private readonly kick: HTMLElement;
  private readonly kickText: HTMLElement;
  private readonly title: HTMLElement;
  private readonly line: HTMLElement;
  private readonly note: HTMLElement;
  private readonly answerRow: HTMLDivElement;
  private readonly actRow: HTMLDivElement;
  private readonly backupRow: HTMLDivElement;
  private readonly takeBtn: HTMLButtonElement;
  private readonly declineBtn: HTMLButtonElement;
  private readonly backupBtn: HTMLButtonElement | null;
  private readonly endBtn: HTMLButtonElement;
  private readonly endLabel: HTMLElement;
  private readonly backupBtns = new Map<BackupKind, HTMLButtonElement>();
  private readonly backupTexts = new Map<BackupKind, HTMLElement>();
  private readonly takeKey: HTMLElement;
  private readonly declineKey: HTMLElement;
  /** Menu « Renforts » déplié (HUD) : la carte ne se replie pas pendant le choix. */
  backupOpen = false;
  /** Appel affiché (0 : aucun). */
  callId = 0;
  /** État affiché : celui de l'appel, 'fin' (fin de vacation sans appel) ou '' (rien). */
  shown = '';
  /**
   * Carte compacte (HUD sur écran tactile) : « Renforts » ouvre l'écran radio, où les quatre renforts ont des cibles de
   * 44 px, au lieu de déplier une rangée de plus que la place libre du téléphone (entre la mini-carte, les boutons système
   * et les actions rapides) ne contient pas.
   */
  compact = false;
  /** Une réponse du joueur (pour la pastille du HUD : la carte reste dépliée). */
  onAction: (() => void) | null = null;

  constructor(private readonly ctx: GameContext, private readonly variant: Variant) {
    ensureCommandStyle();
    ensurePatrolStyle();
    const p = variant === 'hud' ? '' : 'radio-';
    this.root = el('div', variant === 'hud' ? 'pd-card' : 'cr-call');
    this.root.dataset.id = variant === 'hud' ? 'hud-appel' : 'radio-appel';
    this.root.setAttribute('role', 'group');
    this.root.setAttribute('aria-label', 'Appel de CENTRAL');
    this.kick = el('div', variant === 'hud' ? 'pd-kick' : 'pd-kick cm-sub');
    this.kick.appendChild(el('span', 'pd-dot'));
    this.kickText = el('span', '', '');
    this.kick.appendChild(this.kickText);
    this.title = el('div', 'pd-title', '');
    this.title.dataset.id = p + 'appel-titre';
    this.line = el('div', 'pd-line', '');
    this.line.dataset.id = p + 'appel-ligne';
    this.note = el('div', 'pd-note', '');

    this.answerRow = el('div', 'pd-row');
    this.takeBtn = button('Prendre l’appel', () => this.act(() => this.accept()), { icon: 'check', id: p + 'appel-prendre', className: 'pd-go', title: 'Prendre l’appel' });
    this.takeKey = el('span', 'pd-key', 'Y');
    this.declineBtn = button('Décliner', () => this.act(() => this.decline()), { icon: 'close', id: p + 'appel-decliner', title: 'Décliner : CENTRAL confie l’appel à une autre patrouille' });
    this.declineKey = el('span', 'pd-key', 'Maj + Y');
    if (variant === 'hud') {
      this.takeBtn.appendChild(this.takeKey);
      this.declineBtn.appendChild(this.declineKey);
    }
    this.answerRow.append(this.takeBtn, this.declineBtn);

    this.actRow = el('div', 'pd-row');
    this.backupBtn = variant === 'hud'
      ? button('Renforts', () => this.act(() => this.toggleBackup()), { icon: 'units', id: 'appel-renforts', title: 'Demander des renforts' })
      : null;
    this.endBtn = button('Fin d’intervention', () => this.act(() => this.close()), { icon: 'flag', id: p + 'appel-fin' });
    this.endLabel = this.endBtn.querySelector('.cm-btn-t') as HTMLElement;
    if (this.backupBtn) this.actRow.appendChild(this.backupBtn);
    this.actRow.appendChild(this.endBtn);

    this.backupRow = el('div', 'pd-row pd-backup');
    const icons: Record<BackupKind, 'units' | 'shield' | 'fire' | 'cross'> = { patrouille: 'units', compagnie: 'shield', pompiers: 'fire', samu: 'cross' };
    for (const kind of BACKUP_KINDS) {
      const b = button('', () => this.act(() => this.backup(kind)), { icon: icons[kind], id: `${p}renfort-${kind}` });
      const t = el('span', 'cm-btn-t', BACKUP_LABELS[kind]);
      b.appendChild(t);
      this.backupBtns.set(kind, b);
      this.backupTexts.set(kind, t);
      this.backupRow.appendChild(b);
    }
    if (variant === 'radio') this.backupRow.prepend(el('div', 'cm-sub', 'Renforts'));

    this.root.append(this.kick, this.title, this.line, this.note, this.answerRow, this.actRow, this.backupRow);
    this.render(null, false);
  }

  private api(): PatrolModeApi | null {
    return patrolMode(this.ctx);
  }

  private act(run: () => void): void {
    try {
      run();
    } catch (err) {
      console.error('[patrouille] réponse à l’appel', err);
    }
    if (this.onAction) this.onAction();
    this.refresh();
  }

  /** Prendre l'appel affiché (bouton, touche Y). */
  accept(): boolean {
    const api = this.api();
    if (!api || this.callId === 0) return false;
    const ok = api.accept(this.callId);
    if (ok) this.ctx.ui.notify('Appel pris : suivez le GPS jusqu’au lieu.', 'ok', 3);
    else this.ctx.ui.notify('Cet appel n’est plus à prendre.', 'info', 3);
    return ok;
  }

  /** Décliner l'appel affiché (bouton, Maj + Y). */
  decline(): boolean {
    const api = this.api();
    if (!api || this.callId === 0) return false;
    const ok = api.decline(this.callId);
    if (!ok) this.ctx.ui.notify('Cet appel n’est plus en attente.', 'info', 3);
    return ok;
  }

  private close(): void {
    const api = this.api();
    if (!api || this.callId === 0) return;
    const call = api.current;
    const onScene = !!call && call.id === this.callId && call.state === 'sur_place';
    if (api.close(this.callId)) this.ctx.ui.notify(onScene ? 'Fin d’intervention : reprenez la patrouille.' : 'Appel laissé : CENTRAL le confie à une autre patrouille.', 'info', 3);
    this.backupOpen = false;
  }

  private toggleBackup(): void {
    if (this.compact) {
      this.backupOpen = false;
      if (this.ctx.ui.current === null) this.ctx.ui.open('radio');
      return;
    }
    this.backupOpen = !this.backupOpen;
  }

  private backup(kind: BackupKind): void {
    const api = this.api();
    if (!api || this.callId === 0) return;
    if (api.requestBackup(this.callId, kind)) {
      this.backupOpen = false;
      this.ctx.ui.notify(kind === 'compagnie' ? 'Compagnie de CRS demandée : engagement dans quelques minutes.' : 'Renfort demandé.', 'ok', 3);
    } else {
      this.ctx.ui.notify(backupRefused(kind), 'warn', 4);
    }
  }

  /** Relit le répartiteur et met la carte à jour (aucune écriture si rien ne change). */
  refresh(): void {
    const api = this.api();
    const call = api ? api.current : null;
    this.render(call, !!api && api.ending);
  }

  private distance(x: number, z: number): number {
    const me = this.ctx.player.person();
    return me ? Math.hypot(me.x - x, me.z - z) : -1;
  }

  private render(call: DispatchCall | null, ending: boolean): void {
    const api = this.api();
    if (!call) {
      this.callId = 0;
      this.backupOpen = false;
      setClass(this.answerRow, 'pd-off', true);
      setClass(this.actRow, 'pd-off', true);
      setClass(this.backupRow, 'pd-off', true);
      if (ending) {
        const v = this.ctx.session.config ? readVacation(this.ctx.session.config) : null;
        this.shown = 'fin';
        this.root.dataset.state = 'fin';
        setText(this.kickText, 'Fin de vacation');
        setText(this.title, 'REGAGNEZ LE SERVICE');
        const d = v ? this.distance(v.depart.x, v.depart.z) : -1;
        setText(this.line, v ? `${capitalize(v.depart.name)}${d >= 0 ? ' · ' + distanceLabel(d) : ''}` : 'Point de départ de la vacation');
        setText(this.note, 'Le compte rendu s’ouvre à l’arrivée, ou de lui-même au bout de 3 minutes.');
        setClass(this.note, 'pd-off', false);
      } else {
        this.shown = '';
        this.root.dataset.state = 'aucun';
        setText(this.kickText, 'CENTRAL');
        setText(this.title, this.variant === 'radio' ? 'Aucun appel en cours' : '');
        setText(this.line, this.variant === 'radio' ? 'CENTRAL vous appellera dès qu’un événement se déclare.' : '');
        setText(this.note, '');
        setClass(this.note, 'pd-off', true);
      }
      return;
    }
    if (call.id !== this.callId) this.backupOpen = false;
    this.callId = call.id;
    this.shown = call.state;
    this.root.dataset.state = call.state;
    this.root.dataset.call = String(call.id);
    setText(this.kickText, stateLabel(call.state));
    setText(this.title, callTitle(call.kind, call.label));
    setText(this.line, callLine(call, this.distance(call.x, call.z)));
    const answering = call.state === 'annonce';
    const working = call.state === 'acceptee' || call.state === 'sur_place';
    setClass(this.answerRow, 'pd-off', !answering);
    setClass(this.actRow, 'pd-off', !working);
    setText(this.endLabel, call.state === 'sur_place' ? 'Fin d’intervention' : 'Laisser l’appel');
    this.endBtn.title = call.state === 'sur_place' ? 'Fin d’intervention : l’appel est réglé' : 'Laisser l’appel : CENTRAL le confie à une autre patrouille';
    // touches et indications : clavier (Y, Maj + Y), manette (bouton radio), rien au doigt
    const device = this.ctx.input.device;
    const key = callKeyLabel(this.ctx);
    setText(this.takeKey, key);
    setText(this.declineKey, `Maj + ${key}`);
    let note = '';
    if (answering) {
      const left = Math.max(0, Math.ceil(90 - (this.ctx.clock.now - call.t)));
      note = `Sans réponse dans ${left} s, CENTRAL le confie à une autre patrouille.`;
      if (this.variant === 'hud' && device === 'gamepad') note = `${this.radioKey()} : répondre depuis la radio. ` + note;
    } else if (working) {
      note = call.state === 'sur_place' ? 'Sur place. Évaluez et rendez compte.' : 'En route : suivez le GPS.';
      if (call.backup.length > 0) note += ` Renforts : ${call.backup.map((b) => backupWord(b)).join(', ')}.`;
      if (this.variant === 'hud' && device === 'kbm') note += ` ${key} : renforts et fin d’intervention (radio).`;
      else if (this.variant === 'hud' && device === 'gamepad') note += ` ${this.radioKey()} : renforts et fin d’intervention.`;
    }
    // renforts : toujours visibles à la radio, dépliés par « Renforts » au HUD — où ils prennent la place de
    // l'indication, pour que la carte ne pousse pas les actions rapides sur la barre de santé
    const showBackup = working && (this.variant === 'radio' || this.backupOpen);
    setText(this.note, note.trim());
    setClass(this.note, 'pd-off', note.trim() === '' || (showBackup && this.variant === 'hud'));
    setClass(this.backupRow, 'pd-off', !showBackup);
    if (this.backupBtn) setClass(this.backupBtn, 'is-on', this.backupOpen);
    if (working && api) {
      for (const o of backupOptions(call, api.calls)) {
        const b = this.backupBtns.get(o.kind)!;
        setText(this.backupTexts.get(o.kind)!, call.backup.indexOf(o.kind) >= 0 ? `${o.label} ✓` : o.label);
        if (b.disabled !== !o.available) b.disabled = !o.available;
        // la compagnie ne vient que sur un rassemblement ou une manifestation sauvage : bouton masqué ailleurs
        const hide = o.kind === 'compagnie' && call.kind !== 'rassemblement' && call.kind !== 'manif_sauvage';
        setClass(b, 'pd-off', hide);
        b.title = o.available ? `Demander : ${o.label}` : o.reason;
      }
    }
  }

  private radioKey(): string {
    const l = labels(this.ctx);
    let key = '';
    try {
      key = l ? l.labelFor('radio') : '';
    } catch {
      key = '';
    }
    return key !== '' ? `Radio (${key})` : 'Radio';
  }

  /** Le bouton à focaliser en premier (écran radio, manette). */
  primaryButton(): HTMLButtonElement | null {
    if (this.shown === 'annonce') return this.takeBtn;
    if (this.shown === 'acceptee' || this.shown === 'sur_place') {
      for (const kind of BACKUP_KINDS) {
        const b = this.backupBtns.get(kind)!;
        if (!b.disabled && !b.classList.contains('pd-off')) return b;
      }
      return this.endBtn;
    }
    return null;
  }
}

/** Horloge réelle de l'interface (ms) : n'entre jamais dans la simulation. */
function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : 0;
}

function backupWord(kind: BackupKind): string {
  switch (kind) {
    case 'patrouille': return 'patrouille';
    case 'compagnie': return 'compagnie de CRS';
    case 'pompiers': return 'pompiers';
    case 'samu': return 'SAMU';
    default: return kind;
  }
}

/**
 * Élément de HUD 'patrol.dispatch' (zone de gauche) : la carte d'appel, sa pastille repliée et les touches Y / Maj + Y.
 * Affiché seulement pendant une vacation en cours (PatrolModeApi.active), en jeu.
 */
export class PatrolDispatchHud implements HudWidget {
  readonly root: HTMLDivElement;
  private readonly panel: CallPanel;
  private readonly pill: HTMLButtonElement;
  private readonly pillText: HTMLElement;
  private readonly pillKey: HTMLElement;
  private readonly onKey: (e: KeyboardEvent) => void;
  /** Dernier rafraîchissement (ms, horloge réelle). */
  private lastAt = -1e9;
  /**
   * Début de l'affichage dépliée (ms, horloge réelle : le pas de l'interface est plafonné, et une image lente — téléphone,
   * WebGL logiciel — ne doit pas retarder la pastille) : dernier changement d'appel ou d'état, ou dernière réponse.
   */
  private since = 0;
  private key = '';
  private collapsed = false;
  private visible = false;
  /** Emplacement de la zone de gauche (clavier, souris, manette). */
  private readonly leftHost: HTMLElement;
  /**
   * Emplacement en haut au centre, créé à la demande pour l'écran tactile : sur un téléphone en paysage, la zone de
   * gauche (sous la mini-carte, au-dessus des commandes du véhicule) n'a pas la hauteur de la carte d'appel en plus des
   * actions rapides — elle remontait sur la mini-carte.
   */
  private topHost: HTMLElement | null = null;

  constructor(private readonly ctx: GameContext, host: HTMLElement) {
    this.leftHost = host;
    ensureCommandStyle();
    ensurePatrolStyle();
    // devant les actions rapides de la même zone (ordre 50 par défaut) : l'appel passe en premier
    host.style.order = '40';
    this.root = el('div', 'pd cm-root pd-off' + (coarsePointer() ? ' cm-coarse' : ''));
    this.root.dataset.id = 'hud-patrouille';
    this.panel = new CallPanel(ctx, 'hud');
    this.panel.onAction = () => this.expand();
    this.pill = document.createElement('button');
    this.pill.type = 'button';
    this.pill.className = 'pd-pill pd-off';
    this.pill.dataset.id = 'hud-appel-pastille';
    this.pill.appendChild(el('span', 'pd-dot'));
    this.pillText = el('span', '', 'Appel en cours');
    this.pillKey = el('span', 'pd-key', 'Y');
    this.pill.append(this.pillText, this.pillKey);
    this.pill.addEventListener('click', (e) => {
      e.stopPropagation();
      this.expand();
      this.panel.refresh();
    });
    // toute interaction avec la carte la garde dépliée 20 s de plus
    this.panel.root.addEventListener('pointerdown', () => this.expand());
    this.root.append(this.panel.root, this.pill);
    host.appendChild(this.root);

    this.onKey = (e: KeyboardEvent): void => {
      if (e.code !== CALL_KEY || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (this.ctx.session.phase !== 'playing' || this.ctx.ui.modal) return;
      const api = patrolMode(this.ctx);
      const call = api ? api.current : null;
      if (!api || !call) return;
      e.preventDefault();
      this.panel.refresh();
      if (call.state === 'annonce') {
        if (e.shiftKey) this.panel.decline();
        else this.panel.accept();
      } else if (!e.shiftKey && this.ctx.ui.current === null) {
        // appel pris : renforts et fin d'intervention se choisissent au clavier dans l'écran radio
        this.ctx.ui.open('radio');
      }
      this.expand();
      this.panel.refresh();
      this.lastAt = nowMs();
      this.apply();
    };
    if (typeof window !== 'undefined') window.addEventListener('keydown', this.onKey);
  }

  private expand(): void {
    this.since = nowMs();
    this.collapsed = false;
  }

  update(): void {
    const now = nowMs();
    if (now - this.lastAt < PERIOD * 1000) return;
    this.lastAt = now;
    this.place();
    this.panel.refresh();
    this.apply();
  }

  /** Zone de gauche au clavier et à la manette ; en haut au centre sur écran tactile (data-touch du HUD). */
  private place(): void {
    const hud = this.leftHost.closest('.ui-hud');
    const touch = !!hud && (hud.getAttribute('data-touch') ?? 'none') !== 'none';
    let target = this.leftHost;
    if (touch && hud) {
      if (!this.topHost) {
        const slot = hud.querySelector<HTMLElement>('.hud-slot--top');
        if (slot) {
          this.topHost = el('div', 'hud-w');
          this.topHost.dataset.w = 'patrol.dispatch.tactile';
          // sous la boussole et les objectifs (ordre 50)
          this.topHost.style.order = '60';
          slot.appendChild(this.topHost);
        }
      }
      if (this.topHost) target = this.topHost;
    }
    this.panel.compact = touch;
    if (this.root.parentElement !== target) {
      target.appendChild(this.root);
      // l'emplacement vide ne prend pas de place dans sa zone
      this.leftHost.style.display = target === this.leftHost ? '' : 'none';
      if (this.topHost) this.topHost.style.display = target === this.topHost ? '' : 'none';
    }
  }

  /** Visibilité de la carte et de la pastille. */
  private apply(): void {
    const api = patrolMode(this.ctx);
    const playing = this.ctx.session.phase === 'playing';
    const shown = !!api && playing && this.panel.shown !== '';
    if (shown !== this.visible) {
      this.visible = shown;
      setClass(this.root, 'pd-off', !shown);
    }
    if (!shown) {
      this.key = '';
      this.markOpen(false);
      return;
    }
    const key = `${this.panel.callId}:${this.panel.shown}`;
    if (key !== this.key) {
      this.key = key;
      this.expand();
    }
    if (this.panel.backupOpen) this.since = nowMs();
    if (!this.collapsed && nowMs() - this.since >= COLLAPSE_AFTER * 1000) this.collapsed = true;
    setClass(this.panel.root, 'pd-off', this.collapsed);
    setClass(this.pill, 'pd-off', !this.collapsed);
    this.markOpen(!this.collapsed);
    if (this.collapsed) {
      const state = this.panel.shown;
      this.pill.dataset.state = state;
      setText(this.pillText, state === 'fin' ? 'Fin de vacation' : state === 'annonce' ? 'Appel de CENTRAL' : 'Appel en cours');
      const device = this.ctx.input.device;
      const keyText = device === 'kbm' && state !== 'fin' ? callKeyLabel(this.ctx) : '';
      setText(this.pillKey, keyText);
      setClass(this.pillKey, 'pd-off', keyText === '');
      this.pill.title = state === 'annonce' ? 'Afficher l’appel (Y : le prendre)' : 'Afficher l’appel';
    }
  }

  /**
   * Carte dépliée : attribut data-pd-open du HUD, lu par la feuille de style (sur écran tactile, les pastilles du bloc
   * « ORDRES » s'effacent le temps de la carte, voir ensurePatrolStyle).
   */
  private markOpen(open: boolean): void {
    const hud = this.leftHost.closest('.ui-hud') as HTMLElement | null;
    if (!hud || hud.hasAttribute('data-pd-open') === open) return;
    if (open) hud.setAttribute('data-pd-open', '1');
    else hud.removeAttribute('data-pd-open');
  }

  dispose(): void {
    if (typeof window !== 'undefined') window.removeEventListener('keydown', this.onKey);
    this.markOpen(false);
    this.root.remove();
    if (this.topHost) this.topHost.remove();
    this.topHost = null;
  }
}
