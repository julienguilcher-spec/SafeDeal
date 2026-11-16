/* =====================================================================================
 * Écran « carriere » — progression de carrière (service 'career', src/gameplay/career).
 *
 * En-tête : grade tenu et chapitre en cours. Colonne de gauche : le chapitre choisi (par défaut le
 * chapitre en cours), son exigence et son avancement, ses missions avec leur meilleure note ; une
 * mission ouverte se choisit puis se lance par « Jouer la mission », qui rouvre la page d'accueil en
 * mode carrière avec cette mission choisie. Colonne de droite : les chapitres et leur état, les
 * déblocages obtenus, le dossier disciplinaire. « Recommencer la carrière » efface la progression
 * après confirmation.
 * ===================================================================================== */

import type { ScreenInstance } from '@/core/extensions';
import type { CareerApi, CareerChapterView, CareerSanction } from '@/gameplay/career/api';
import { missionById } from '@/gameplay/missions/catalog';
import { clear, el, h } from '../core/dom';
import { dateLabel, int } from '../core/format';
import type { UiEnv } from '../core/kit';
import { rankLabel } from './catalog';
import { readCareer } from './home-career';

const STATUS_LABELS: Readonly<Record<CareerChapterView['status'], string>> = {
  done: 'Terminé',
  current: 'En cours',
  locked: 'Verrouillé',
};

const SANCTION_LABELS: Readonly<Record<CareerSanction['kind'], string>> = {
  avertissement: 'Avertissement',
  blame: 'Blâme',
  retrogradation: 'Rétrogradation',
};

function statusLabel(c: CareerChapterView): string {
  // un détachement ou les regards croisés ne sont pas « en cours » : ils sont ouverts, à jouer quand on veut
  if (c.status === 'current' && c.index > 8) return 'Ouvert';
  return STATUS_LABELS[c.status];
}

function line(label: string, value: string, note?: string, tone?: 1 | -1): HTMLElement {
  const v = h('span', 'ui-line__value', value);
  if (tone === 1) v.classList.add('is-plus');
  if (tone === -1) v.classList.add('is-minus');
  const row = el('div', 'ui-line', h('span', undefined, label), v);
  if (note) row.append(h('span', 'ui-line__note', note));
  return row;
}

function para(text: string): HTMLElement {
  const p = h('p', 'ui-para', text);
  p.style.marginTop = '8px';
  return p;
}

export function createCareerScreen(env: UiEnv): (host: HTMLElement) => ScreenInstance {
  const { ctx, widgets } = env;
  return (host: HTMLElement): ScreenInstance => {
    const career: CareerApi | null = readCareer(ctx);
    const wrap = h('div', 'ui-window-wrap');
    const win = h('div', 'ui-panel ui-panel--flag ui-window ui-debrief');
    win.setAttribute('aria-label', 'Carrière');
    const head = h('div', 'ui-debrief__head');
    const body = h('div', 'ui-debrief__body ui-scroll');
    body.tabIndex = -1;
    const left = h('div', 'ui-debrief__col');
    const right = h('div', 'ui-debrief__col');
    body.append(left, right);

    /** Chapitre affiché à gauche et mission choisie pour « Jouer la mission ». */
    let shown = career ? career.progress.chapter : 0;
    let picked = '';

    const play = widgets.button('Jouer la mission', () => {
      if (!picked || !career || !career.isMissionAvailable(picked)) return;
      const missionId = picked;
      ctx.ui.close('carriere');
      ctx.ui.open('menu_principal', { section: 'mode', mode: 'carriere', missionId });
    }, 'primary', 'play');
    play.dataset.id = 'carriere-jouer';
    const restart = widgets.button('Recommencer la carrière', () => {
      widgets.confirm(host, {
        title: 'Recommencer la carrière ?',
        text: 'Grades, notes, déblocages et dossier disciplinaire seront définitivement effacés. Les paramètres et les scénarios enregistrés sont conservés.',
        confirm: 'Tout recommencer',
        danger: true,
        onConfirm: () => {
          career?.reset();
          shown = 0;
          picked = '';
          render();
          ctx.ui.notify('Carrière recommencée : retour à l’école.', 'ok');
        },
      });
    }, 'danger', 'restart');
    restart.dataset.id = 'carriere-recommencer';
    const close = widgets.button('Fermer', () => ctx.ui.close('carriere'), 'secondary', 'close');
    close.dataset.id = 'carriere-fermer';
    close.setAttribute('data-autofocus', '');
    const foot = el('div', 'ui-window__foot', restart, play, close);
    if (!career) restart.disabled = true;

    function paintPlay(): void {
      // la page d'accueil n'existe qu'au menu : en jeu, on ne lance pas de mission d'ici
      const ok = !!career && picked !== '' && career.isMissionAvailable(picked) && ctx.session.phase === 'menu';
      play.disabled = !ok;
      const def = picked ? missionById(picked) : undefined;
      play.setAttribute('data-tip', ok && def ? `Choisit « ${def.title} » sur la page d’accueil, en mode carrière` : 'Choisissez une mission ouverte du chapitre');
    }

    function renderHead(c: CareerApi): void {
      clear(head);
      const p = c.progress;
      const cur = c.chapters[p.chapter]!;
      const played = Object.keys(p.results).length;
      const sub = [
        `Chapitre ${cur.index} « ${cur.title} »${cur.status === 'done' ? ' — carrière terminée' : ''}`,
        `${int(played)} mission${played > 1 ? 's' : ''} jouée${played > 1 ? 's' : ''}`,
        p.sanctions.length === 0 ? 'aucune sanction' : `${int(p.sanctions.length)} sanction${p.sanctions.length > 1 ? 's' : ''}`,
      ];
      const titles = el('div', 'ui-debrief__titles', h('div', 'ui-kicker', 'Carrière'), h('h2', 'ui-title', rankLabel(p.rank)), h('p', 'ui-sub', sub.join(' · ')));
      titles.lastElementChild!.setAttribute('data-id', 'carriere-resume');
      const mainDone = c.chapters.filter((x) => x.index <= 8 && x.status === 'done').length;
      const badge = el('div', 'ui-score', h('b', undefined, `${mainDone}/9`), h('span', undefined, 'Chapitres'));
      badge.dataset.tone = mainDone >= 9 ? 'ok' : 'warn';
      badge.setAttribute('aria-label', `${mainDone} chapitres terminés sur 9`);
      head.append(titles, badge);
    }

    function renderChapter(c: CareerApi): void {
      clear(left);
      const ch = c.chapters[shown] ?? c.chapters[c.progress.chapter]!;
      left.append(widgets.sectionTitle(`Chapitre ${ch.index} — ${ch.title}`));
      const lines = h('div', 'ui-lines');
      lines.append(
        line('Grade tenu', rankLabel(ch.rank)),
        line('État', statusLabel(ch), undefined, ch.status === 'done' ? 1 : undefined),
        line('Exigence', ch.requirementMet ? 'Remplie' : 'À remplir', ch.requirement, ch.requirementMet ? 1 : undefined),
        line('Avancement', ch.progressLabel),
      );
      left.append(para(ch.description), lines);

      left.append(widgets.sectionTitle('Missions'));
      const list = h('div', 'ui-list');
      const items = new Map<string, HTMLButtonElement>();
      const paint = (): void => {
        for (const [id, b] of items) b.setAttribute('aria-pressed', String(id === picked));
        paintPlay();
      };
      for (const id of ch.missions) {
        const def = missionById(id);
        if (!def) continue;
        const st = c.missionStatus(id);
        const r = c.progress.results[id];
        const b = h('button', 'ui-list__item');
        b.type = 'button';
        b.dataset.id = 'carriere-mission-' + id;
        const sub = !st.available ? st.reason
          : r ? `${r.success ? 'Réussie' : 'Pas encore réussie'} — meilleure note ${r.best}, ${int(r.plays)} partie${r.plays > 1 ? 's' : ''}`
            : 'Pas encore jouée';
        b.append(h('span', 'ui-list__title', def.title), h('span', 'ui-list__trail', r ? `Note ${r.best}` : st.available ? '—' : 'Verrouillée'), h('span', 'ui-list__sub', sub));
        if (st.available) {
          b.addEventListener('click', () => {
            picked = id;
            paint();
          });
        } else {
          b.disabled = true;
          b.style.opacity = '.5';
        }
        items.set(id, b);
        list.append(b);
      }
      left.append(list);
      if (!items.has(picked)) picked = '';
      paint();
    }

    function renderSide(c: CareerApi): void {
      clear(right);
      right.append(widgets.sectionTitle('Chapitres'));
      const list = h('div', 'ui-list');
      for (const ch of c.chapters) {
        const b = h('button', 'ui-list__item');
        b.type = 'button';
        b.dataset.id = 'carriere-chapitre-' + ch.index;
        b.setAttribute('aria-pressed', String(ch.index === shown));
        const sub = ch.status === 'locked' ? `${rankLabel(ch.rank)} — ${ch.requirement}` : ch.progressLabel;
        b.append(h('span', 'ui-list__title', `${ch.index}. ${ch.title}`), h('span', 'ui-list__trail', statusLabel(ch)), h('span', 'ui-list__sub', sub));
        if (ch.status === 'locked') b.style.opacity = '.6';
        b.addEventListener('click', () => {
          if (shown === ch.index) return;
          shown = ch.index;
          picked = '';
          renderChapter(c);
          for (const x of Array.from(list.children)) x.setAttribute('aria-pressed', String(x === b));
        });
        list.append(b);
      }
      right.append(list);

      right.append(widgets.sectionTitle('Déblocages'));
      const unlocked = c.progress.unlocked;
      if (unlocked.length === 0) {
        right.append(para('Rien pour l’instant : chaque chapitre terminé apporte grades, habilitations, matériels ou rôles.'));
      } else {
        const ul = h('div', 'ui-lines');
        for (const u of unlocked) ul.append(line(u, 'Obtenu', undefined, 1));
        right.append(ul);
      }

      right.append(widgets.sectionTitle('Dossier disciplinaire'));
      const sanctions = c.progress.sanctions;
      if (sanctions.length === 0) {
        right.append(para('Aucune sanction : dossier vierge.'));
      } else {
        const sl = h('div', 'ui-lines');
        // les plus récentes d'abord, dix au plus
        for (let i = sanctions.length - 1, n = 0; i >= 0 && n < 10; i--, n++) {
          const s = sanctions[i]!;
          const def = s.missionId ? missionById(s.missionId) : undefined;
          const when = s.at > 0 ? dateLabel(s.at) : '';
          sl.append(line(SANCTION_LABELS[s.kind], [when, def ? def.title : ''].filter((x) => x).join(' — ') || '—', s.reason, -1));
        }
        right.append(sl);
        if (sanctions.length > 10) right.append(para(`Et ${int(sanctions.length - 10)} sanction(s) plus ancienne(s).`));
      }
    }

    function render(): void {
      if (!career) {
        clear(head);
        head.append(el('div', 'ui-debrief__titles', h('div', 'ui-kicker', 'Carrière'), h('h2', 'ui-title', 'Carrière indisponible')));
        clear(left);
        left.append(para('Le suivi de carrière n’est pas installé dans cette version.'));
        paintPlay();
        return;
      }
      renderHead(career);
      renderChapter(career);
      renderSide(career);
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
