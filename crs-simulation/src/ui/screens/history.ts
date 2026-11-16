/* =====================================================================================
 * Écran « historique » — parties jouées (service 'history', src/gameplay/history).
 *
 * En-tête : nombre de parties, temps de jeu cumulé, date de la première partie. Colonne de gauche :
 * les cumuls, puis la liste des parties, de la plus récente à la plus ancienne (date, rôle, lieu,
 * résultat, chiffres clés). Colonne de droite : le détail de la partie choisie (par défaut la plus
 * récente). Pied : « Effacer l'historique » (après confirmation), « Exporter ma sauvegarde »,
 * « Importer… », « Rejouer ce scénario » (au menu seulement, si la configuration a été gardée) et
 * « Fermer ». L'écran n'est enregistré que si le service 'history' est branché.
 * ===================================================================================== */

import type { GameContext, GameMode } from '@/core/contracts';
import type { ScreenInstance } from '@/core/extensions';
import { HISTORY_SERVICE } from '@/gameplay/history/api';
import type { HistoryApi, HistoryEntry, HistoryOutcome } from '@/gameplay/history/api';
import { clear, el, h } from '../core/dom';
import { capitalize, dateLabel, durationLabel, hourLabel, int } from '../core/format';
import type { UiEnv } from '../core/kit';
import { rankLabel, roleInfo, weatherLabel } from './catalog';
import { downloadSave, pickSaveFile } from './save-file';
import { ScenarioStore } from './scenarios-store';

/** Service d'historique s'il est branché (null sinon). */
export function readHistory(ctx: Pick<GameContext, 'service'>): HistoryApi | null {
  const api = ctx.service<HistoryApi>(HISTORY_SERVICE);
  if (!api || typeof api.willRecord !== 'function' || typeof api.replayConfig !== 'function') return null;
  return api;
}

const MODE_LABELS: Readonly<Record<GameMode, string>> = {
  carriere: 'Carrière',
  libre: 'Mode libre',
  monde_ouvert: 'Monde ouvert',
  editeur: 'Éditeur',
  test: 'Partie d’essai',
};

export const OUTCOME_LABELS: Readonly<Record<HistoryOutcome, string>> = {
  reussie: 'Mission réussie',
  echouee: 'Mission échouée',
  interrompue: 'Mission interrompue',
  terminee: 'Partie terminée',
  quittee: 'Partie quittée en cours',
};

const JOURNEE_LABELS: Readonly<Record<string, string>> = {
  prise_de_service: 'prise de service',
  embarquement: 'embarquement',
  route: 'en route',
  sur_place: 'sur place',
  rembarquement: 'rembarquement',
  retour: 'retour à la caserne',
  intervention_route: 'en route vers la seconde intervention',
  intervention: 'seconde intervention',
  fin: 'fin de service',
};

/** Titre d'une partie : la mission, sinon le lieu. */
export function entryTitle(e: HistoryEntry): string {
  if (e.missionTitle) return e.missionTitle;
  const place = e.place ? capitalize(e.place) : 'Paris';
  return e.mode === 'monde_ouvert' ? `Patrouille — ${place}` : `Scénario libre — ${place}`;
}

/** Rôle et grade (« CRS — Brigadier-chef »). */
export function entryIdentity(e: HistoryEntry): string {
  const role = roleInfo(e.role).name;
  const rank = e.rank ? rankLabel(e.rank, e.role) : '';
  return rank ? `${role} — ${rank}` : role;
}

/** Résultat en quelques mots (« Mission réussie, note B — Bien »). */
export function entryResult(e: HistoryEntry): string {
  const base = OUTCOME_LABELS[e.outcome] ?? e.outcome;
  return e.result && e.result.grade ? `${base}, note ${e.result.grade}` : base;
}

/** Chiffres clés sur une ligne. */
export function entryFigures(e: HistoryEntry): string {
  const f = e.figures;
  const parts = [`${int(f.arrests)} interpellation${f.arrests > 1 ? 's' : ''}`, `${int(f.injured)} blessé${f.injured > 1 ? 's' : ''}`];
  parts.push(`${int(f.forceUses)} acte${f.forceUses > 1 ? 's' : ''} de force`);
  if (f.sommations > 0) parts.push(`${int(f.sommations)} sommation${f.sommations > 1 ? 's' : ''}`);
  if (f.fires > 0) parts.push(`${int(f.fires)} feu${f.fires > 1 ? 'x' : ''}`);
  return parts.join(' · ');
}

function line(label: string, value: string, note?: string, tone?: 1 | -1): HTMLElement {
  const v = h('span', 'ui-line__value', value);
  if (tone === 1) v.classList.add('is-plus');
  if (tone === -1) v.classList.add('is-minus');
  const row = el('div', 'ui-line', h('span', undefined, label), v);
  if (note) row.append(h('span', 'ui-line__note', note));
  return row;
}

function tile(label: string, value: string): HTMLElement {
  return el('div', 'ui-tile', h('b', undefined, label), h('span', undefined, value));
}

function para(text: string): HTMLElement {
  const p = h('p', 'ui-para', text);
  p.style.marginTop = '8px';
  return p;
}

export function createHistoryScreen(env: UiEnv): (host: HTMLElement) => ScreenInstance {
  const { ctx, widgets } = env;
  return (host: HTMLElement): ScreenInstance => {
    const history = readHistory(ctx);
    const wrap = h('div', 'ui-window-wrap');
    const win = h('div', 'ui-panel ui-panel--flag ui-window ui-debrief');
    win.setAttribute('aria-label', 'Historique des parties');
    const head = h('div', 'ui-debrief__head');
    const body = h('div', 'ui-debrief__body ui-scroll');
    body.tabIndex = -1;
    const left = h('div', 'ui-debrief__col');
    const right = h('div', 'ui-debrief__col');
    // le détail reste visible pendant qu'on fait défiler la liste
    right.style.position = 'sticky';
    right.style.top = '0';
    right.style.alignSelf = 'start';
    body.append(left, right);

    /** Partie affichée à droite. */
    let picked = '';
    let entries: readonly HistoryEntry[] = [];

    const replay = widgets.button('Rejouer ce scénario', () => {
      if (!history || !picked || ctx.session.phase !== 'menu') return;
      const cfg = history.replayConfig(picked);
      if (!cfg) return;
      // « Continuer » de la page d'accueil reprendra cette configuration
      new ScenarioStore(ctx.save).setLast(cfg);
      ctx.ui.close('historique');
      ctx.session.start(cfg).catch((err: unknown) => {
        console.error('[ui] relance de la partie impossible', err);
        ctx.ui.notify('Le scénario n’a pas pu être relancé.', 'alert');
      });
    }, 'primary', 'restart');
    replay.dataset.id = 'historique-rejouer';

    const wipe = widgets.button('Effacer l’historique', () => {
      widgets.confirm(host, {
        title: 'Effacer l’historique ?',
        text: 'La liste des parties jouées et les cumuls seront définitivement effacés. La carrière, les scénarios enregistrés et les paramètres sont conservés.',
        confirm: 'Effacer l’historique',
        danger: true,
        onConfirm: () => {
          history?.clear();
          picked = '';
          render();
          ctx.ui.notify('Historique effacé.', 'ok');
        },
      });
    }, 'danger', 'trash');
    wipe.dataset.id = 'historique-effacer';

    const exportBtn = widgets.button('Exporter ma sauvegarde', () => {
      const { downloaded } = downloadSave(ctx);
      ctx.ui.notify(
        downloaded
          ? 'Sauvegarde exportée : carrière, historique, scénarios et paramètres sont dans le fichier téléchargé.'
          : 'Export impossible ici : utilisez l’onglet « Sauvegarde » des paramètres pour copier le texte.',
        downloaded ? 'ok' : 'warn',
        7,
      );
    }, 'secondary', 'download');
    exportBtn.dataset.id = 'historique-exporter';

    const reload = widgets.button('Recharger le jeu', () => window.location.reload(), 'ghost', 'restart');
    reload.hidden = true;
    reload.dataset.id = 'historique-recharger';

    const importBtn = widgets.button('Importer…', () => {
      pickSaveFile(host, (text) => {
        if (ctx.save.importAll(text)) {
          picked = '';
          render();
          reload.hidden = false;
          ctx.ui.notify('Sauvegarde importée : l’historique est à jour. Rechargez le jeu pour appliquer aussi la carrière et les paramètres.', 'ok', 9);
        } else {
          ctx.ui.notify('Ce fichier n’est pas une sauvegarde de CRS Simulation France.', 'alert');
        }
      }, () => ctx.ui.notify('Ce fichier n’a pas pu être lu.', 'alert'));
    }, 'secondary', 'upload');
    importBtn.dataset.id = 'historique-importer';

    const close = widgets.button('Fermer', () => ctx.ui.close('historique'), 'secondary', 'close');
    close.dataset.id = 'historique-fermer';
    close.setAttribute('data-autofocus', '');
    const foot = el('div', 'ui-window__foot', wipe, exportBtn, importBtn, reload, replay, close);
    if (!history) wipe.disabled = true;

    function paintReplay(): void {
      // on ne relance une partie que depuis le menu (pas par-dessus une partie ou un compte rendu)
      const e = entries.find((x) => x.id === picked);
      const ok = !!history && !!e && !!e.config && ctx.session.phase === 'menu';
      replay.disabled = !ok;
      replay.setAttribute('data-tip', !e ? 'Choisissez une partie dans la liste'
        : !e.config ? 'La configuration de cette partie n’a pas été gardée'
          : ctx.session.phase !== 'menu' ? 'Revenez d’abord à l’accueil pour relancer une partie'
            : `Relance « ${entryTitle(e)} » avec les mêmes réglages`);
    }

    function renderHead(api: HistoryApi): void {
      clear(head);
      const t = api.totals;
      const sub = t.sessions === 0
        ? 'Aucune partie enregistrée pour l’instant'
        : [
          `${int(t.sessions)} partie${t.sessions > 1 ? 's' : ''}`,
          `${durationLabel(t.playSeconds)} de jeu`,
          t.firstAt > 0 ? `depuis le ${dateLabel(t.firstAt).replace(/, .*$/, '')}` : '',
        ].filter((x) => x).join(' · ');
      const titles = el('div', 'ui-debrief__titles', h('div', 'ui-kicker', 'Historique'), h('h2', 'ui-title', 'Vos parties'), h('p', 'ui-sub', sub));
      titles.lastElementChild!.setAttribute('data-id', 'historique-resume');
      const badge = el('div', 'ui-score', h('b', undefined, int(t.sessions)), h('span', undefined, t.sessions > 1 ? 'Parties' : 'Partie'));
      badge.dataset.tone = 'ok';
      badge.setAttribute('aria-label', `${t.sessions} parties enregistrées`);
      head.append(titles, badge);
    }

    function renderLeft(api: HistoryApi): void {
      clear(left);
      const t = api.totals;
      left.append(widgets.sectionTitle('Cumuls'));
      const tiles = h('div', 'ui-tiles');
      tiles.dataset.id = 'historique-cumuls';
      tiles.append(
        tile('Parties', int(t.sessions)),
        tile('Temps de jeu', durationLabel(t.playSeconds)),
        tile('Missions réussies', `${int(t.missionsSucceeded)}/${int(t.missions)}`),
        tile('Interpellations', int(t.arrests)),
        tile('Blessés', int(t.injured)),
        tile('Actes de force', int(t.forceUses)),
        tile('Sommations', int(t.sommations)),
        tile('Feux', int(t.fires)),
        tile('Promotions', int(t.promotions)),
      );
      left.append(tiles);

      left.append(widgets.sectionTitle('Parties'));
      if (entries.length === 0) {
        left.append(para('Chaque partie jouée est inscrite ici automatiquement à sa fin : date, rôle, lieu, résultat et chiffres clés. Rien n’est oublié quand vous fermez le jeu.'));
      } else {
        const list = h('div', 'ui-list');
        list.dataset.id = 'historique-liste';
        const items = new Map<string, HTMLButtonElement>();
        for (const e of entries) {
          const b = h('button', 'ui-list__item');
          b.type = 'button';
          b.dataset.id = 'historique-partie-' + e.id;
          b.setAttribute('aria-pressed', String(e.id === picked));
          b.append(
            h('span', 'ui-list__title', entryTitle(e)),
            h('span', 'ui-list__trail', dateLabel(e.endedAt)),
            h('span', 'ui-list__sub', `${entryIdentity(e)} · ${entryResult(e)} · ${durationLabel(e.playSeconds)}`),
            h('span', 'ui-list__sub', entryFigures(e)),
          );
          b.addEventListener('click', () => {
            if (picked === e.id) return;
            picked = e.id;
            for (const [id, x] of items) x.setAttribute('aria-pressed', String(id === picked));
            renderDetail();
          });
          items.set(e.id, b);
          list.append(b);
        }
        left.append(list);
        if (entries.length > 1) left.append(para(`Les ${int(entries.length)} dernières parties sont listées ; les cumuls portent sur toutes les parties enregistrées.`));
      }
      const persistent = (ctx.save as { persistent?: boolean }).persistent !== false;
      const note = para(persistent
        ? 'Enregistré automatiquement sur cet appareil à la fin de chaque partie. Exportez votre sauvegarde pour la mettre à l’abri ou la copier ailleurs.'
        : 'Attention : le stockage est indisponible ici, l’historique sera perdu à la fermeture. Exportez votre sauvegarde pour la conserver.');
      note.dataset.id = 'historique-stockage';
      left.append(note);
    }

    function renderDetail(): void {
      clear(right);
      const e = entries.find((x) => x.id === picked);
      if (!e) {
        right.append(widgets.sectionTitle('Détail'), para('Choisissez une partie pour en voir le détail.'));
        paintReplay();
        return;
      }
      const f = e.figures;
      right.append(widgets.sectionTitle(entryTitle(e)));
      const lines = h('div', 'ui-lines');
      lines.dataset.id = 'historique-detail';
      lines.append(
        line('Date', dateLabel(e.endedAt)),
        line('Rôle', entryIdentity(e)),
        line('Mode', MODE_LABELS[e.mode] ?? e.mode, e.journee ? `Journée de service — ${JOURNEE_LABELS[e.journee] ?? e.journee}` : undefined),
        line('Lieu', e.place ? capitalize(e.place) : '—', `${hourLabel(e.timeOfDay)} · ${weatherLabel(e.weather).toLowerCase()}`),
        line('Temps de jeu', durationLabel(e.playSeconds), e.simSeconds > 0 ? `${durationLabel(e.simSeconds)} dans la simulation` : undefined),
        line('Résultat', OUTCOME_LABELS[e.outcome] ?? e.outcome, undefined, e.outcome === 'reussie' ? 1 : e.outcome === 'echouee' ? -1 : undefined),
      );
      if (e.result) lines.append(line('Note', `${Math.round(e.result.score)}/100`, e.result.grade, e.result.score >= 70 ? 1 : e.result.score < 40 ? -1 : undefined));
      lines.append(
        line('Interpellations', int(f.arrests)),
        line('Blessés', int(f.injured), undefined, f.injured > 0 ? -1 : undefined),
        line('Actes de force', int(f.forceUses), f.forceUses > 0 ? (f.forceFaults > 0 ? `dont ${int(f.forceFaults)} hors cadre` : 'tous dans le cadre légal') : undefined, f.forceFaults > 0 ? -1 : undefined),
        line('Sommations', int(f.sommations)),
      );
      if (f.fires > 0 || f.firesOut > 0) lines.append(line('Feux', int(f.fires), `${int(f.firesOut)} éteint${f.firesOut > 1 ? 's' : ''}`));
      if (f.treated > 0) lines.append(line('Soins prodigués', int(f.treated)));
      if (f.crowd > 0) lines.append(line('Manifestants', int(f.crowd), f.dispersed > 0 ? `${int(f.dispersed)} dispersés` : undefined));
      if (f.incidents > 0) lines.append(line('Incidents traités', `${int(f.incidentsTreated)} sur ${int(f.incidents)}`));
      if (f.lawScore !== null) lines.append(line('Régularité', `${Math.round(f.lawScore)}/100`, undefined, f.lawScore >= 70 ? 1 : -1));
      if (e.career) {
        const c = e.career;
        lines.append(line('Carrière', `Note ${c.grade}`, c.promoted && c.newRank ? `Promotion : ${rankLabel(c.newRank)}` : c.success ? 'Mission réussie' : 'Mission non réussie', c.success ? 1 : -1));
        if (c.sanction) lines.append(line('Sanction', c.sanction.replace(/ : .*$/, ''), c.sanction.replace(/^[^:]*: /, ''), -1));
      }
      right.append(lines);
      if (e.result && e.result.summary) right.append(para(e.result.summary));
      if (e.career && e.career.message) right.append(para(e.career.message));
      paintReplay();
    }

    function render(): void {
      if (!history) {
        clear(head);
        head.append(el('div', 'ui-debrief__titles', h('div', 'ui-kicker', 'Historique'), h('h2', 'ui-title', 'Historique indisponible')));
        clear(left);
        left.append(para('Le suivi des parties n’est pas installé dans cette version.'));
        clear(right);
        paintReplay();
        return;
      }
      entries = history.entries;
      if (!entries.some((e) => e.id === picked)) picked = entries.length > 0 ? entries[0]!.id : '';
      wipe.disabled = entries.length === 0 && history.totals.sessions === 0;
      renderHead(history);
      renderLeft(history);
      renderDetail();
    }

    render();
    win.append(head, body, foot);
    wrap.append(win);
    host.append(wrap);

    return {
      dispose(): void {
        wrap.remove();
      },
    };
  };
}
