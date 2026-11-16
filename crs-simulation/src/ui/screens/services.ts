/* =====================================================================================
 * Lecture tolérante des services facultatifs dont l'interface n'est pas encore fixée par le
 * contrat : 'missions' (catalogue, compte rendu) et 'roles.causes'. Formes acceptées : voir
 * MissionLike, MissionResultLike et CauseLike dans ../core/api.ts. Rien ne lève d'exception.
 * ===================================================================================== */

import type { PlayableRole, SessionConfig } from '@/core/contracts';
import type { CauseLike, MissionLike, MissionResultLike } from '../core/api';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(...values: unknown[]): string {
  for (const v of values) if (typeof v === 'string' && v) return v;
  return '';
}

/** Tableau porté par le service : le service lui-même, ou l'une de ses propriétés (valeur ou fonction). */
function arrayOf(service: unknown, keys: readonly string[]): unknown[] {
  if (Array.isArray(service)) return service;
  if (!isRecord(service)) return [];
  for (const key of keys) {
    let v: unknown = service[key];
    if (typeof v === 'function') {
      try {
        v = (v as () => unknown).call(service);
      } catch {
        v = null;
      }
    }
    if (Array.isArray(v)) return v;
  }
  return [];
}

export function readMissions(service: unknown): MissionLike[] {
  const out: MissionLike[] = [];
  const seen = new Set<string>();
  for (const raw of arrayOf(service, ['catalog', 'missions', 'all', 'list'])) {
    if (!isRecord(raw)) continue;
    const id = str(raw.id, raw.key);
    const title = str(raw.title, raw.titre, raw.name, raw.nom);
    if (!id || !title || seen.has(id)) continue;
    seen.add(id);
    const roleValue = raw.roles ?? raw.role;
    const roles: PlayableRole[] = Array.isArray(roleValue)
      ? roleValue.filter((r): r is PlayableRole => typeof r === 'string')
      : typeof roleValue === 'string' ? [roleValue as PlayableRole] : [];
    const diff = raw.difficulty ?? raw.difficulte ?? raw.stars;
    const config = isRecord(raw.config) ? raw.config : isRecord(raw.defaults) ? raw.defaults : isRecord(raw.session) ? raw.session : {};
    out.push({
      id,
      title,
      roles,
      type: str(raw.type, raw.kind, raw.categorie),
      difficulty: typeof diff === 'number' && Number.isFinite(diff) ? Math.max(0, Math.min(5, Math.round(diff))) : 0,
      summary: str(raw.summary, raw.description, raw.brief, raw.resume),
      place: str(raw.place, raw.lieu, config.place),
      config: config as Partial<SessionConfig>,
    });
  }
  return out;
}

export function readCauses(service: unknown): CauseLike[] {
  const out: CauseLike[] = [];
  const seen = new Set<string>();
  for (const raw of arrayOf(service, ['list', 'causes', 'all'])) {
    let id = '';
    let label = '';
    if (typeof raw === 'string') {
      id = raw;
      label = raw;
    } else if (isRecord(raw)) {
      id = str(raw.id, raw.key);
      label = str(raw.label, raw.name, raw.nom, raw.titre, id);
    }
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }
  return out;
}

export function readMissionResult(service: unknown): MissionResultLike | null {
  if (!isRecord(service)) return null;
  let raw: unknown = null;
  for (const key of ['result', 'lastResult', 'report', 'debrief']) {
    let v: unknown = service[key];
    if (typeof v === 'function') {
      try {
        v = (v as () => unknown).call(service);
      } catch {
        v = null;
      }
    }
    if (isRecord(v)) {
      raw = v;
      break;
    }
  }
  if (!isRecord(raw)) return null;
  const out: MissionResultLike = {};
  const title = str(raw.title, raw.titre, raw.name);
  if (title) out.title = title;
  if (typeof raw.success === 'boolean') out.success = raw.success;
  else if (typeof raw.reussite === 'boolean') out.success = raw.reussite;
  const score = raw.score ?? raw.note;
  if (typeof score === 'number' && Number.isFinite(score)) out.score = Math.max(0, Math.min(100, score));
  const grade = str(raw.grade, raw.mention);
  if (grade) out.grade = grade;
  const summary = str(raw.summary, raw.resume, raw.text);
  if (summary) out.summary = summary;
  const lines = raw.lines ?? raw.lignes ?? raw.details;
  if (Array.isArray(lines)) {
    out.lines = [];
    for (const l of lines) {
      if (!isRecord(l)) continue;
      const label = str(l.label, l.libelle, l.text);
      if (!label) continue;
      const value = typeof l.value === 'number' || typeof l.value === 'string' ? l.value : typeof l.valeur === 'number' || typeof l.valeur === 'string' ? l.valeur : '';
      const line: { label: string; value: string | number; delta?: number; note?: string } = { label, value };
      const delta = l.delta ?? l.points;
      if (typeof delta === 'number' && Number.isFinite(delta)) line.delta = delta;
      const note = str(l.note, l.reason, l.motif);
      if (note) line.note = note;
      out.lines.push(line);
    }
  }
  return out;
}
