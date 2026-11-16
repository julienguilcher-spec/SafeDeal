/* =====================================================================================
 * INCIDENTS — libellés français (« Feu de poubelles, rue de Rivoli ») et textes associés.
 * ===================================================================================== */

import type { GameContext, Prop, Vehicle } from '@/core/contracts';
import type { IncidentKind, IncidentMeans } from '@/core/extensions';
import type { Entry } from './entry';
import { FAM_FIRE, FAM_OFFICER, FAM_VICTIM } from './tuning';

const KIND_LABEL: Readonly<Record<IncidentKind, string>> = {
  feu_poubelle: 'Feu de poubelles', feu_barricade: 'Barricade en feu', feu_vehicule: 'Véhicule en feu', feu_boutique: 'Commerce en feu',
  blesse: 'Blessé à terre', agent_a_terre: 'Agent à terre', agent_isole: 'Agent isolé', pillage: 'Pillage en cours',
  barricade: 'Barricade', automobiliste_bloque: 'Automobiliste bloqué', secours_bloques: 'Secours bloqués',
  suspect: 'Suspect à interpeller',
};

export const MEANS_LABEL: Readonly<Record<IncidentMeans, string>> = {
  '': 'aucun moyen', unite: 'une unité', joueur: 'vous-même', canon_eau: 'l’engin lanceur d’eau', centaure: 'le Centaure',
  bravm: 'la BRAV-M', pompiers: 'les sapeurs-pompiers', samu: 'le SAMU',
};

/** Nature d'un petit feu d'après l'objet qui brûle. */
function propFireLabel(prop: Prop): string {
  switch (prop.kind) {
    case 'poubelle':
    case 'conteneur':
      return 'Feu de poubelles';
    case 'velo':
    case 'trottinette':
    case 'station_velo':
      return 'Feu de deux-roues';
    case 'palette':
    case 'barriere_chantier':
    case 'table_terrasse':
    case 'chaise':
    case 'banc':
    case 'echafaudage':
      return 'Feu de mobilier';
    case 'debris':
      return 'Feu de débris';
    case 'kiosque':
      return 'Kiosque en feu';
    case 'abribus':
      return 'Abribus en feu';
    default:
      return 'Feu de mobilier urbain';
  }
}

function vehicleFireLabel(v: Vehicle, count: number): string {
  if (count > 1) return 'Véhicules en feu';
  switch (v.kind) {
    case 'scooter':
    case 'moto_bravm':
      return 'Deux-roues en feu';
    case 'bus':
      return 'Autobus en feu';
    case 'camion_pompiers':
    case 'ambulance':
      return 'Véhicule de secours en feu';
    default:
      return v.faction === 'police' ? 'Véhicule de police en feu' : 'Véhicule en feu';
  }
}

/** Libellé sans le lieu, d'après la nature de l'incident et ce qu'il regroupe. */
export function baseLabel(ctx: GameContext, e: Entry): string {
  if (e.family === FAM_FIRE) {
    if (e.reignition) return 'Reprise de feu';
    if (e.kind === 'feu_poubelle') {
      const prop = e.targetKind === 'prop' ? ctx.props.get(e.targetId) : undefined;
      return prop ? propFireLabel(prop) : e.targetKind === 'place' ? 'Feu sur la chaussée' : KIND_LABEL.feu_poubelle;
    }
    if (e.kind === 'feu_vehicule') {
      const v = e.targetKind === 'vehicle' ? ctx.vehicles.get(e.targetId) : undefined;
      let vehicles = 0;
      for (let i = 0; i < e.members.length; i++) if (e.members[i].kind === 'vehicle' && !e.members[i].gone) vehicles++;
      return v ? vehicleFireLabel(v, vehicles) : KIND_LABEL.feu_vehicule;
    }
    return KIND_LABEL[e.kind];
  }
  if (e.family === FAM_VICTIM || e.family === FAM_OFFICER) {
    const n = e.presentCount();
    const officer = e.family === FAM_OFFICER;
    if (n >= 2) return officer ? `${n} agents à terre` : `${n} blessés`;
    if (officer) return KIND_LABEL.agent_a_terre;
    let worst = 0;
    for (let i = 0; i < e.members.length; i++) if (!e.members[i].gone && e.members[i].injury > worst) worst = e.members[i].injury;
    return worst >= 4 ? 'Personne inanimée' : worst >= 3 ? 'Blessé grave' : KIND_LABEL.blesse;
  }
  return KIND_LABEL[e.kind] ?? 'Incident';
}

/** Recalcule libellé et secteur de l'incident. */
export function relabel(ctx: GameContext, e: Entry): void {
  e.labelBase = baseLabel(ctx, e);
  const sector = ctx.world.sectorName(e.x, e.z);
  e.sector = sector;
  e.label = sector !== '' ? `${e.labelBase}, ${sector}` : e.labelBase;
  e.record.label = e.label;
  e.record.kind = e.kind;
  if (e.task) {
    e.task.label = e.label;
    e.task.kind = e.kind;
  }
}

/** Nature dite à la radio (« feu de poubelles », « véhicule en feu »). */
export function spokenType(e: Entry): string {
  const s = e.labelBase;
  return s.length > 0 ? s.charAt(0).toLowerCase() + s.slice(1) : 'incident';
}

/** Gravité dite à la radio, au féminin. */
export function spokenGravity(e: Entry): string {
  return e.urgency >= 3 ? 'critique' : e.urgency === 2 ? 'sérieuse' : 'légère';
}

/** Durée en clair : « 45 s », « 2 min 05 ». */
export function durationLabel(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  const r = s % 60;
  return `${Math.floor(s / 60)} min ${r < 10 ? '0' : ''}${r}`;
}
