// Recette des ordres directs, scénario 1 (b) : COMMANDANT, MISSION SPÉCIALE cdt-01, le MÊME ordre donné PENDANT QUE LA
// COLONNE ROULE ENCORE, puis PENDANT QU'ELLE SE GARE ET DÉBARQUE (acceptation 2 : « Je donne un ordre pendant qu'ils sont
// encore dans les fourgons : ils descendent et y vont » — jamais zéro agent en mouvement dix secondes plus tard ; §2.5 :
// l'écran dit ce que l'unité finit et dans combien de temps). Le joueur est passager de son véhicule de commandement ;
// il tourne la tête, lit « Entrée  Bloquer … », appuie.
import { beforeAll, describe, expect, it } from 'vitest';

import { doneText } from '@/ui/command/direct';
import { Joueur, direEnColonne, etapeEnColonne, releves, verifierEnColonne } from './playtest.ordre-direct.lib';
import type { EtapeEnColonne } from './playtest.ordre-direct.lib';

let j: Joueur;
let arrive = -1;
let enRoute: EtapeEnColonne | null = null;
let auStationnement: EtapeEnColonne | null = null;

beforeAll(async () => {
  j = await Joueur.mission('cdt-01-prise-de-commandement');
  const own = j.core.scope().ownSquadId;
  const stage = (): string => j.cmd.convoyOf(own)?.stage ?? '-';
  // en route, à moins de 250 m de la destination : il regarde dehors et ordonne ; puis au stationnement / débarquement
  arrive = j.trajet(() => j.missions.phaseIndex >= 0 || j.missions.result !== null, 1300, () => {
    const d = j.journee.destination;
    const me = j.moi;
    if (me.vehicleId === 0 || !d) return;
    const v = j.ctx.vehicles.get(me.vehicleId)!;
    const st = stage();
    if (!enRoute && st === 'route' && Math.hypot(d.x - v.x, d.z - v.z) < 250 && Math.abs(v.speed) > 1) {
      enRoute = etapeEnColonne(j, 'en route (la colonne roule)');
      if (enRoute) console.log(direEnColonne(enRoute));
    } else if (!auStationnement && (st === 'stationnement' || st === 'debarquement')) {
      auStationnement = etapeEnColonne(j, `au ${st === 'stationnement' ? 'stationnement' : 'débarquement'} (la colonne se gare)`, enRoute ? [enRoute.squadId] : [], 300);
      if (auStationnement) console.log(direEnColonne(auStationnement));
    }
  });
  console.log(`mission commencée à ${arrive} s ; colonne ${stage()} ; lectures interdites ${j.lectures.length} ${j.lectures.slice(0, 4).join(' | ')} ; refus ${j.refus.join(' | ') || 'aucun'} ; attentes ${j.attentes.slice(0, 4).join(' | ') || 'aucune'}`);
}, 1_500_000);

describe('recette — commandant, cdt-01 : l’ordre donné pendant que la colonne roule, puis pendant qu’elle se gare', () => {
  it('en route : la section désignée va barrer la rue (acceptation 2, §2.5)', () => {
    expect(enRoute, 'une ligne « Bloquer … » lue depuis son siège pendant que la colonne roule').not.toBeNull();
    verifierEnColonne(enRoute!);
  });

  it('au stationnement : la section désignée descend et va barrer la rue (acceptation 2, §2.5)', () => {
    expect(auStationnement, 'une ligne « Bloquer … » lue depuis son siège pendant que la colonne se gare').not.toBeNull();
    verifierEnColonne(auStationnement!);
  });

  it('le « ✓ » s’accorde avec la voie : « rue … barrée », « boulevard … barré »', () => {
    expect(doneText({ verb: 'bloquer', place: 'rue René Boulanger' })).toBe('rue René Boulanger barrée');
    expect(doneText({ verb: 'bloquer', place: 'avenue Gabriel' })).toBe('avenue Gabriel barrée');
    expect(doneText({ verb: 'bloquer', place: 'boulevard de Magenta' })).toBe('boulevard de Magenta barré');
    expect(doneText({ verb: 'bloquer', place: 'quai des Tuileries' })).toBe('quai des Tuileries barré');
    expect(doneText({ verb: 'bloquer', place: 'pont de la Concorde' })).toBe('pont de la Concorde barré');
    expect(doneText({ verb: 'bloquer', place: '' })).toBe('rue barrée');
    expect(auStationnement!.ecran[auStationnement!.ecran.length - 1]).toBe('MISTRAL 2 · boulevard de Magenta barré ✓');
  });

  it('la mission commence, et les relevés permanents tiennent (acceptations 3, 5, 10)', () => {
    expect(arrive).toBeGreaterThanOrEqual(0);
    releves(j);
    expect(j.attentes).toEqual([]);
  });
});
