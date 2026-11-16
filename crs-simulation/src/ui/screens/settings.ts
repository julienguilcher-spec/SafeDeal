/* =====================================================================================
 * Écran « parametres » : graphismes, commandes, touches, son, jeu, sauvegarde.
 * Chaque réglage est lié à ctx.settings (enregistré aussitôt) ; un réglage modifié ailleurs
 * (événement settings:changed) redessine la section affichée.
 * ===================================================================================== */

import type { QualityLevel, Settings, ViolenceLevel } from '@/core/contracts';
import { applyQualityPreset } from '@/core/settings';
import type { ScreenInstance } from '@/core/extensions';
import type { TabsHandle } from '../core/components';
import { clear, el, h } from '../core/dom';
import { int, times } from '../core/format';
import type { IconName } from '../core/icons';
import type { UiEnv } from '../core/kit';
import { simulatedCrowd } from './scenario';
import { buildBindings } from './settings-bindings';

type TabId = 'graphismes' | 'commandes' | 'touches' | 'son' | 'jeu' | 'sauvegarde';

const TABS: readonly { id: TabId; label: string; icon: IconName }[] = [
  { id: 'graphismes', label: 'Graphismes', icon: 'monitor' },
  { id: 'commandes', label: 'Commandes', icon: 'gamepad' },
  { id: 'touches', label: 'Touches', icon: 'keyboard' },
  { id: 'son', label: 'Son', icon: 'sound' },
  { id: 'jeu', label: 'Jeu', icon: 'sliders' },
  { id: 'sauvegarde', label: 'Sauvegarde', icon: 'save' },
];

const QUALITY: readonly { value: QualityLevel; label: string }[] = [
  { value: 'bas', label: 'Basse' }, { value: 'moyen', label: 'Moyenne' }, { value: 'haut', label: 'Haute' }, { value: 'ultra', label: 'Ultra' },
];

export interface SettingsPane {
  el: HTMLElement;
  /** Appelé à chaque image tant que la section est affichée. */
  update?(): void;
  dispose?(): void;
}

export function createSettingsScreen(env: UiEnv): (host: HTMLElement, data: unknown) => ScreenInstance {
  const { ctx, widgets } = env;
  let lastTab: TabId = 'graphismes';

  return (host: HTMLElement, data: unknown): ScreenInstance => {
    const requested = data && typeof data === 'object' ? (data as { tab?: unknown }).tab : undefined;
    let tab: TabId = TABS.some((t) => t.id === requested) ? (requested as TabId) : lastTab;
    const settings = ctx.settings;
    /** Vrai pendant nos propres écritures : l'événement settings:changed ne doit pas redessiner la section. */
    let writing = false;
    let dirty = false;
    let current: SettingsPane | null = null;

    const wrap = h('div', 'ui-window-wrap');
    const win = h('div', 'ui-panel ui-panel--flag ui-window');
    win.setAttribute('aria-label', 'Paramètres');
    const close = widgets.button('Retour', () => ctx.ui.close('parametres'), 'secondary', 'back');
    close.dataset.id = 'parametres-retour';
    const head = el('div', 'ui-window__head', h('h2', 'ui-title', 'Paramètres'), close);
    const body = h('div', 'ui-window__body');
    const rail = h('div', 'ui-window__rail ui-scroll');
    const pane = h('div', 'ui-window__pane ui-scroll');
    body.append(rail, pane);
    win.append(head, body);
    wrap.append(win);
    host.append(wrap);

    function set<K extends keyof Settings>(key: K, value: Settings[K]): void {
      writing = true;
      try {
        settings.set(key, value);
      } finally {
        writing = false;
      }
    }

    function slider(
      label: string, key: 'renderScale' | 'drawDistance' | 'crowdScale' | 'fov' | 'mouseSensitivity' | 'gamepadSensitivity' | 'touchSensitivity'
        | 'volumeMaster' | 'volumeEffects' | 'volumeVoices' | 'volumeAmbience',
      min: number, max: number, step: number, format: (v: number) => string, hint?: string | ((v: number) => string),
    ): HTMLElement {
      const value = settings.values[key];
      const hintOf = (v: number): string => (typeof hint === 'function' ? hint(v) : hint ?? '');
      const field = widgets.field(label, null, { value: format(value), hint: hintOf(value) });
      const s = widgets.slider({
        label, min, max, step, value, format,
        onInput: (v: number) => {
          set(key, v);
          field.setValue(format(v));
          if (typeof hint === 'function') field.setHint(hint(v));
        },
      });
      s.el.dataset.id = 'set-' + key;
      field.el.insertBefore(s.el, field.el.lastElementChild);
      return field.el;
    }

    function toggle(label: string, key: 'shadows' | 'invertY' | 'voiceSynthesis' | 'subtitles' | 'hudMarkers' | 'aimAssist' | 'vibration' | 'showFps', hint?: string): HTMLElement {
      const t = widgets.toggle({ label, hint, value: settings.values[key], onChange: (v: boolean) => set(key, v) });
      t.el.dataset.id = 'set-' + key;
      return t.el;
    }

    const pct = (v: number): string => `${Math.round(v * 100)} %`;

    function graphics(): SettingsPane {
      const root = h('div');
      const qField = widgets.field('Qualité', null, { hint: 'Un préréglage ajuste d’un coup l’échelle de rendu, les ombres, la distance et la densité de foule.' });
      const q = widgets.segmented<QualityLevel>({
        label: 'Qualité', options: QUALITY, value: settings.values.quality,
        onChange: (level: QualityLevel) => {
          writing = true;
          try {
            applyQualityPreset(settings, level);
          } finally {
            writing = false;
          }
          show(tab); // les autres curseurs de la section suivent le préréglage
          pane.querySelector<HTMLElement>(`[data-value="${level}"]`)?.focus({ preventScroll: true });
        },
      });
      q.el.dataset.id = 'set-quality';
      qField.el.insertBefore(q.el, qField.el.lastElementChild);
      root.append(
        qField.el,
        slider('Échelle de rendu', 'renderScale', 0.5, 1, 0.05, pct, 'Réduire l’échelle allège le rendu sur téléphone, au prix de la netteté.'),
        toggle('Ombres', 'shadows', 'Ombres portées du soleil et de l’éclairage public.'),
        slider('Distance d’affichage', 'drawDistance', 100, 1500, 50, (v) => `${int(v)} m`),
        slider('Densité de foule', 'crowdScale', 0.25, 2, 0.25, (v) => times(v), (v) => `Une manifestation de 1 000 personnes en simule ${int(simulatedCrowd(1000, v))}.`),
        slider('Champ de vision', 'fov', 50, 110, 5, (v) => `${Math.round(v)}°`),
      );
      return { el: root };
    }

    function controls(): SettingsPane {
      const root = h('div');
      const sens = (v: number): string => times(v, 1);
      root.append(
        slider('Sensibilité de la souris', 'mouseSensitivity', 0.2, 3, 0.1, sens),
        slider('Sensibilité de la manette', 'gamepadSensitivity', 0.2, 3, 0.1, sens),
        slider('Sensibilité tactile', 'touchSensitivity', 0.2, 3, 0.1, sens),
        toggle('Inverser l’axe vertical', 'invertY', 'Pousser vers le haut fait regarder vers le bas.'),
        toggle('Vibration', 'vibration', 'Manette et téléphone vibrent aux impacts et aux détonations.'),
        toggle('Aide à la visée', 'aimAssist', 'À la manette, le réticule ralentit près d’une cible légitime.'),
      );
      const go = widgets.button('Réaffecter les touches', () => {
        tabs.set('touches');
        show('touches');
      }, 'secondary', 'keyboard');
      const line = el('div', 'ui-inline', go);
      line.style.marginTop = '12px';
      root.append(line);
      return { el: root };
    }

    function sound(): SettingsPane {
      const root = h('div');
      root.append(
        slider('Volume général', 'volumeMaster', 0, 1, 0.05, pct),
        slider('Effets', 'volumeEffects', 0, 1, 0.05, pct, 'Grenades, impacts, véhicules, sirènes.'),
        slider('Voix', 'volumeVoices', 0, 1, 0.05, pct, 'Radio, mégaphone, slogans.'),
        slider('Ambiance', 'volumeAmbience', 0, 1, 0.05, pct, 'Rumeur de la foule, ville, météo.'),
        toggle('Voix synthétique', 'voiceSynthesis', 'Les messages radio et les sommations sont lus à voix haute.'),
        toggle('Sous-titres', 'subtitles', 'Affiche le texte des messages radio, du mégaphone et des dialogues.'),
      );
      return { el: root };
    }

    function game(): SettingsPane {
      const root = h('div');
      const hintOf = (v: ViolenceLevel): string => (v === 'sobre' ? 'Le sang est masqué ; les blessures restent signalées.' : 'Blessures représentées de façon réaliste, sans complaisance.');
      const vField = widgets.field('Violence affichée', null, { hint: hintOf(settings.values.violence) });
      const v = widgets.segmented<ViolenceLevel>({
        label: 'Violence affichée',
        options: [{ value: 'realiste', label: 'Réaliste' }, { value: 'sobre', label: 'Sobre' }],
        value: settings.values.violence,
        onChange: (level: ViolenceLevel) => {
          set('violence', level);
          vField.setHint(hintOf(level));
        },
      });
      v.el.dataset.id = 'set-violence';
      vField.el.insertBefore(v.el, vField.el.lastElementChild);
      root.append(
        vField.el,
        toggle('Marqueurs', 'hudMarkers', 'Repères des objectifs, de l’incident qui vous est confié et du suspect désigné.'),
        toggle('Compteur d’images', 'showFps', 'Affiche la cadence d’affichage en jeu.'),
      );
      return { el: root };
    }

    function saveData(): SettingsPane {
      const root = h('div');
      const area = h('textarea', 'ui-input ui-textarea');
      area.setAttribute('aria-label', 'Sauvegarde au format JSON');
      area.placeholder = 'Collez ici une sauvegarde exportée, puis choisissez « Importer ».';
      area.spellcheck = false;
      area.dataset.id = 'save-json';
      const file = h('input');
      file.type = 'file';
      file.accept = '.json,application/json';
      file.hidden = true;
      file.addEventListener('change', () => {
        const f = file.files && file.files[0];
        if (!f) return;
        f.text().then((text) => {
          area.value = text;
          ctx.ui.notify('Fichier lu : choisissez « Importer » pour l’appliquer.', 'info');
        }).catch(() => ctx.ui.notify('Ce fichier n’a pas pu être lu.', 'alert'));
        file.value = '';
      });

      const exportBtn = widgets.button('Exporter', () => {
        const json = ctx.save.exportAll();
        area.value = json;
        let downloaded = false;
        try {
          const blob = new Blob([json], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'crs-simulation-france-sauvegarde.json';
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 2000);
          downloaded = true;
        } catch {
          downloaded = false;
        }
        ctx.ui.notify(downloaded ? 'Sauvegarde exportée (fichier téléchargé, texte ci-dessous).' : 'Sauvegarde exportée : copiez le texte ci-dessous.', 'ok');
      }, 'secondary', 'download');
      exportBtn.dataset.id = 'save-export';
      const pick = widgets.button('Choisir un fichier…', () => file.click(), 'secondary', 'upload');
      const importBtn = widgets.button('Importer', () => {
        const text = area.value.trim();
        if (!text) {
          ctx.ui.notify('Collez d’abord une sauvegarde, ou choisissez un fichier.', 'warn');
          return;
        }
        if (ctx.save.importAll(text)) {
          ctx.ui.notify('Sauvegarde importée. Rechargez la page pour l’appliquer aux paramètres.', 'ok', 7);
          reload.hidden = false;
        } else {
          ctx.ui.notify('Ce texte n’est pas une sauvegarde de CRS Simulation France.', 'alert');
        }
      }, 'primary');
      importBtn.dataset.id = 'save-import';
      const reload = widgets.button('Recharger la page', () => window.location.reload(), 'secondary', 'restart');
      reload.hidden = true;
      const reset = widgets.button('Rétablir les paramètres par défaut', () => {
        widgets.confirm(host, {
          title: 'Rétablir les paramètres par défaut ?',
          text: 'Graphismes, commandes, son et options de jeu reviennent à leurs valeurs d’origine. Votre progression est conservée.',
          confirm: 'Rétablir',
          onConfirm: () => {
            writing = true;
            try {
              settings.reset();
            } finally {
              writing = false;
            }
            ctx.ui.notify('Paramètres par défaut rétablis.', 'ok');
          },
        });
      }, 'secondary');
      reset.dataset.id = 'save-reset';
      const wipe = widgets.button('Effacer toute la sauvegarde', () => {
        widgets.confirm(host, {
          title: 'Effacer toute la sauvegarde ?',
          text: 'Carrière, scénarios enregistrés, paramètres et touches seront définitivement supprimés de cet appareil.',
          confirm: 'Tout effacer',
          danger: true,
          onConfirm: () => {
            ctx.save.wipe();
            writing = true;
            try {
              settings.reset();
            } finally {
              writing = false;
            }
            area.value = '';
            ctx.ui.notify('Sauvegarde effacée.', 'ok');
          },
        });
      }, 'danger', 'trash');
      wipe.dataset.id = 'save-wipe';

      const exportLine = el('div', 'ui-inline', exportBtn, pick, importBtn, reload, file);
      const dangerLine = el('div', 'ui-inline', reset, wipe);
      root.append(
        widgets.sectionTitle('Exporter et importer'),
        h('p', 'ui-para', 'La sauvegarde reste sur cet appareil. Exportez-la pour la copier vers un autre navigateur, puis importez-la là-bas.'),
        exportLine, area,
        widgets.sectionTitle('Remise à zéro'), dangerLine,
      );
      exportLine.style.margin = '10px 0';
      return { el: root };
    }

    function show(id: TabId): void {
      tab = id;
      lastTab = id;
      dirty = false;
      current?.dispose?.();
      clear(pane);
      pane.scrollTop = 0;
      switch (id) {
        case 'graphismes': current = graphics(); break;
        case 'commandes': current = controls(); break;
        case 'touches': current = buildBindings(env); break;
        case 'son': current = sound(); break;
        case 'jeu': current = game(); break;
        default: current = saveData(); break;
      }
      pane.append(current.el);
    }

    const tabs: TabsHandle<TabId> = widgets.tabs<TabId>({
      label: 'Sections des paramètres', tabs: TABS, value: tab, rail: true,
      onChange: (id: TabId) => show(id),
    });
    for (const t of TABS) {
      const b = tabs.button(t.id);
      if (b) b.dataset.id = 'ptab-' + t.id;
    }
    tabs.button(tab)?.setAttribute('data-autofocus', '');
    rail.append(tabs.el);
    show(tab);

    const off = ctx.events.on('settings:changed', () => {
      if (!writing) dirty = true;
    });
    const onTab = (e: Event): void => {
      tabs.step((e as CustomEvent<{ step: -1 | 1 }>).detail.step);
    };
    host.addEventListener('ui:tab', onTab);

    return {
      update(): void {
        // réglage modifié par un autre que cet écran : la section est redessinée (hors glissement en cours)
        if (dirty && !pane.querySelector('.is-drag') && tab !== 'touches') {
          const hadFocus = pane.contains(document.activeElement);
          show(tab);
          if (hadFocus) tabs.button(tab)?.focus({ preventScroll: true });
        }
        current?.update?.();
      },
      dispose(): void {
        off();
        host.removeEventListener('ui:tab', onTab);
        current?.dispose?.();
        wrap.remove();
      },
    };
  };
}
