/* =====================================================================================
 * Interface — service EXT.objectives (ObjectivesApi) : liste des objectifs affichés.
 * Logique pure ; `version` augmente à chaque modification (le HUD ne se redessine qu'à ce moment).
 * ===================================================================================== */

import type { Objective, ObjectivesApi } from '@/core/extensions';

export interface ObjectivesStore extends ObjectivesApi {
  /** Incrémenté à chaque changement de la liste ou de l'objectif suivi. */
  readonly version: number;
}

function sanitize(o: Objective): Objective {
  const out: Objective = {
    id: String(o.id),
    text: String(o.text ?? ''),
    state: o.state === 'reussi' || o.state === 'echoue' ? o.state : 'actif',
    secondary: o.secondary === true,
  };
  if (typeof o.x === 'number' && typeof o.z === 'number' && Number.isFinite(o.x) && Number.isFinite(o.z)) {
    out.x = o.x;
    out.z = o.z;
  }
  if (typeof o.progress === 'number' && Number.isFinite(o.progress)) {
    out.progress = o.progress < 0 ? 0 : o.progress > 1 ? 1 : o.progress;
  }
  return out;
}

function same(a: Objective, b: Objective): boolean {
  return a.id === b.id && a.text === b.text && a.state === b.state && a.secondary === b.secondary
    && a.x === b.x && a.z === b.z && a.progress === b.progress;
}

export function createObjectives(): ObjectivesStore {
  const list: Objective[] = [];
  let tracked = '';
  let version = 0;

  function indexOf(id: string): number {
    for (let i = 0; i < list.length; i++) if (list[i]!.id === id) return i;
    return -1;
  }

  /** L'objectif suivi doit exister et être actif ; à défaut, le premier objectif actif localisé. */
  function retarget(): void {
    const i = tracked ? indexOf(tracked) : -1;
    if (i >= 0 && list[i]!.state === 'actif') return;
    let next = '';
    for (let k = 0; k < list.length; k++) {
      const o = list[k]!;
      if (o.state === 'actif' && o.x !== undefined && !o.secondary) {
        next = o.id;
        break;
      }
    }
    if (!next) {
      for (let k = 0; k < list.length; k++) {
        const o = list[k]!;
        if (o.state === 'actif' && o.x !== undefined) {
          next = o.id;
          break;
        }
      }
    }
    tracked = next;
  }

  return {
    get list(): readonly Objective[] {
      return list;
    },
    get version(): number {
      return version;
    },
    get tracked(): string {
      return tracked;
    },
    set tracked(id: string) {
      const next = id && indexOf(id) >= 0 ? id : '';
      if (next === tracked) return;
      tracked = next;
      version++;
    },
    set(items: Objective[]): void {
      list.length = 0;
      const seen = new Set<string>();
      for (const o of items) {
        if (!o || seen.has(String(o.id))) continue;
        seen.add(String(o.id));
        list.push(sanitize(o));
      }
      retarget();
      version++;
    },
    upsert(objective: Objective): void {
      const next = sanitize(objective);
      const i = indexOf(next.id);
      if (i >= 0) {
        if (same(list[i]!, next)) return;
        list[i] = next;
      } else {
        list.push(next);
      }
      retarget();
      version++;
    },
    remove(id: string): void {
      const i = indexOf(id);
      if (i < 0) return;
      list.splice(i, 1);
      retarget();
      version++;
    },
    clear(): void {
      if (list.length === 0 && tracked === '') return;
      list.length = 0;
      tracked = '';
      version++;
    },
  };
}
