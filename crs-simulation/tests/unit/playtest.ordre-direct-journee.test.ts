// Recette des ordres directs, scénario 2 : COMMANDANT, JOURNÉE DE SERVICE, place de la République, graine 7 (mode libre,
// départ de la caserne). Chaque étape de la colonne du §2.5 reçoit le même ordre — « Bloquer la rue … », lu puis donné
// avec Entrée : à la caserne (à pied, avant d'embarquer), sur la route (passager, la colonne roule), à l'arrêt et pendant
// le débarquement. Puis, à pied sur place, à la première intervention : (a) §7.1, (c) A puis ⌫, (d) §7.3 la BRAV-M à
// 300–400 m, (e) §7.2 un lanceur de projectile interpellé en un appui.
import { beforeAll, describe, expect, it } from 'vitest';

import {
  Joueur, direAvecMoi, direEnColonne, direEnvoyer, direInterpeller, etapeAvecMoi, etapeBarrage, etapeEnColonne, etapeEnvoyer, etapeInterpeller, releves,
  verifierBarrage, verifierEnColonne, verifierFaitEnColonne, verifierPrisEnColonne,
} from './playtest.ordre-direct.lib';
import type { EtapeAvecMoi, EtapeBarrage, EtapeEnColonne, EtapeEnvoyer, EtapeInterpeller } from './playtest.ordre-direct.lib';

let j: Joueur;
let arrivee = -1;
let caserne: EtapeEnColonne | null = null;
let rappel = { ok: false, pasAvecMoi: [] as string[] };
let route: EtapeEnColonne | null = null;
let arret: EtapeEnColonne | null = null;
let a: EtapeBarrage | null = null;
let c: EtapeAvecMoi | null = null;
let d: EtapeEnvoyer | null = null;
let e: EtapeInterpeller | null = null;
let bravm: string[] = [];

beforeAll(async () => {
  j = await Joueur.libre({ role: 'commandant' as never, rank: 'commandant' as never, variante: 'terrain', place: 'Place de la République', x: 3123, z: -208, crowdSize: 300 }, 7);
  const own = j.core.scope().ownSquadId;
  const stage = (): string => j.cmd.convoyOf(own)?.stage ?? '-';
  j.pas(4);
  bravm = j.bravm().map((u) => u.name);
  console.log(`caserne : journée ${j.journee.stage}, colonne ${stage()} ; BRAV-M ${bravm.join(', ') || 'aucune'} ; état « ${j.ecran()?.state} »`);

  // ── à la caserne, à pied : l'ordre, puis A (tout le monde revient : la colonne partira au complet) ──
  caserne = etapeEnColonne(j, `à la caserne (journée ${j.journee.stage}, colonne ${stage()})`, [], 90);
  if (caserne) console.log(direEnColonne(caserne));
  {
    const ap = j.a();
    j.pas(2);
    const me = j.moi;
    rappel = { ok: ap.res.ok, pasAvecMoi: j.unites().filter((u) => u.kind !== 'cellulaire' && !u.avecVous && !(j.squad(u.squadId).order.type === 'suivre' && j.squad(u.squadId).order.targetId === me.id)).map((u) => `${u.name} (${j.squad(u.squadId).order.type})`) };
    console.log(`caserne, A : ${ap.res.ok ? 'accepté' : ap.res.text} ; pas avec lui 2 s après : ${rappel.pasAvecMoi.join(', ') || 'aucune'} ; état « ${j.ecran()?.state} »`);
  }

  // ── trajet en passager : l'ordre sur la route (à moins de 250 m), puis à l'arrêt / au débarquement ──
  arrivee = j.trajet(() => j.journee.stage === 'sur_place', 1500, () => {
    const dest = j.journee.destination;
    const me = j.moi;
    if (me.vehicleId === 0 || !dest) return;
    const v = j.ctx.vehicles.get(me.vehicleId)!;
    const st = stage();
    if (!route && st === 'route' && Math.hypot(dest.x - v.x, dest.z - v.z) < 250 && Math.abs(v.speed) > 1) {
      route = etapeEnColonne(j, 'sur la route (la colonne roule)');
      if (route) console.log(direEnColonne(route));
    } else if (!arret && (st === 'stationnement' || st === 'debarquement')) {
      arret = etapeEnColonne(j, `à l’arrêt (colonne ${st})`, route ? [route.squadId] : []);
      if (arret) console.log(direEnColonne(arret));
    }
  });
  console.log(`arrivée : ${arrivee} s, journée ${j.journee.stage}, colonne ${stage()}`);
  j.descendre();

  // ── à pied, à la première intervention ──
  const tenues = [route, arret].filter((x): x is EtapeEnColonne => !!x && x.appui.res.ok).map((x) => x.squadId);
  a = etapeBarrage(j, tenues);
  if (a) console.log(`${j.dire('(a) bouche de rue', a.appui, a.suivi)}\n      barrage : ${JSON.stringify(a.barrage)}`);
  c = etapeAvecMoi(j, a ? a.squadId : 0);
  console.log(`(c) ${direAvecMoi(c, a ? a.unite : '')}`);
  j.pas(3);
  if (j.chercherLoin(300, 400)) {
    d = etapeEnvoyer(j, (u) => u.kind === 'bravm', 120);
    if (d) console.log(`(d) ${direEnvoyer(d)}`);
  } else console.log('(d) aucun lieu à 300–400 m en tournant sur lui-même');
  j.a();
  const cible = j.approcher(25, 60, 150);
  if (cible) {
    e = etapeInterpeller(j, cible, 200);
    console.log(`(e) ${direInterpeller(e)}`);
  } else console.log('(e) aucun manifestant en vue à 25–60 m après 150 s de marche');
  console.log(`lectures interdites : ${j.lectures.length} ${j.lectures.slice(0, 5).join(' | ')}\nrefus : ${j.refus.join(' | ') || 'aucun'}\nattentes : ${j.attentes.slice(0, 5).join(' | ') || 'aucune'}`);
}, 1_800_000);

describe('recette — commandant, journée de service, République (graine 7)', () => {
  it('§2.5, à la caserne : l’ordre est exécuté à pied ; A ramène tout le monde avant le départ', () => {
    expect(caserne, 'une ligne « Bloquer … » à la caserne').not.toBeNull();
    verifierEnColonne(caserne!);
    expect(rappel.ok).toBe(true);
    expect(rappel.pasAvecMoi).toEqual([]);
  });

  it('la colonne part et arrive sur place avec lui', () => {
    expect(arrivee).toBeGreaterThanOrEqual(0);
  });

  it('§2.5, sur la route : l’ordre est pris, dit à l’écran, les agents bougent — ils descendent y aller, ou la colonne les emporte jusqu’à l’arrêt (acceptation 2)', () => {
    expect(route, 'une ligne « Bloquer … » lue depuis son siège pendant que la colonne roule').not.toBeNull();
    // (la distance de la ligne est celle de l'unité au point ; plan §2.5 : « route, order point ≤ 150 m from the unit's
    // lead vehicle : released, its vehicles stop, dismount-first, on foot » ; « route, point farther : queued, kept in
    // afterConvoy, executed at the stop — « MISTRAL 2 · Bloquer rue X · à l'arrivée » »)
    const m = /· (\d+)\u00a0m$/.exec(route!.ligne);
    const loin = /\u00a0km$/.test(route!.ligne) || (m !== null && Number(m[1]) > 150);
    if (!loin) {
      verifierPrisEnColonne(route!);
      return;
    }
    expect(route!.appui.res.ok, route!.appui.res.text).toBe(true);
    // jamais zéro agent en mouvement dix secondes après : ils roulent, la colonne les emporte
    expect(route!.bougent, 'agents en mouvement à 10 s').toBeGreaterThan(0);
    // personne n'est mis à pied à des centaines de mètres de sa rue, et l'écran dit ce que l'unité finit
    expect(route!.aPied, 'personne à pied avant l’arrêt').toBe(-1);
    expect(route!.ecran.some((t) => /à l’arrivée|en fourgons/.test(t)), route!.ecran.join(' → ')).toBe(true);
  });

  // DÉFAUT : la section désignée sur la route (16 assis) descend aussitôt, mais sa rue n'est pas barrée 150 s plus tard —
  // l'écran alterne « en fourgons » et « bloqué : la route est barrée — ils finissent à pied ».
  it.fails('§2.5, sur la route : la rue est barrée (« ✓ ») dans les 150 s', () => {
    verifierFaitEnColonne(route!);
  });

  // DÉFAUT : à l'arrêt, la « section libre la plus proche » que nomme la ligne (MISTRAL 4 · 16 m) est celle qui a exécuté
  // l'ordre donné à la caserne : rappelée par A, elle n'a pas embarqué avec la colonne et se trouve à plus d'un kilomètre ;
  // son ordre devient « embarquer », puis « suivre » — l'ordre du joueur est remplacé, la rue jamais barrée.
  it.fails('§2.5, à l’arrêt et au débarquement : la section descend, y va et barre la rue (acceptation 2)', () => {
    expect(arret, 'une ligne « Bloquer … » lue pendant que la colonne se gare').not.toBeNull();
    verifierEnColonne(arret!);
  });

  // DÉFAUT : à la première intervention, la section désignée (MISTRAL 2 · 25 m sur la ligne, en fait à 130 m) accuse
  // réception et part, six agents en marche à 10 s, puis « bloqué : la foule barre la route — ils finissent à pied » :
  // la rue n'est pas barrée en 60 s (45 s demandés).
  it.fails('(a) §7.1 à la première intervention : une bouche de rue, Entrée — la section la barre (acceptation 1)', () => {
    verifierBarrage(a);
  });

  it('(c) A : l’ordre part, l’écran dit « AVEC VOUS » ; ⌫ est accepté (acceptation 19)', () => {
    expect(c!.appui.res.ok, c!.appui.res.text).toBe(true);
    expect(c!.etat).toMatch(/^AVEC VOUS · /);
    expect(c!.retour.res.ok, c!.retour.res.text).toBe(true);
  });

  // DÉFAUT : une seconde après A, les sections restées loin (MISTRAL 1, MISTRAL 4 et leurs groupes) tiennent « embarquer »
  // — elles viennent en fourgons — et non « suivre » ; ⌫ ne rend pas son barrage à la section de (a), restée « embarquer ».
  it.fails('(c) A : toutes les unités tiennent « suivre » dans la seconde ; ⌫ rend le barrage (acceptations 6 et 19)', () => {
    expect(c!.pasAvecMoi, c!.ordres.join(' ')).toEqual([]);
    expect(c!.rendu).toBe('couper_circulation');
    expect(c!.autres).toEqual([]);
  });

  // DÉFAUT : du point d'arrivée de cette partie, aucun lieu à 300–400 m ne se désigne ; dans une partie voisine (même
  // graine, avant les derniers correctifs) « Envoyer : rue Debelleyme · BRAV-M · 390 m » était accusé à 24 s (« les motos
  // nous rejoignent ») et la BRAV-M, à pied, était à 855 m du point 120 s plus tard.
  it.fails('(d) §7.3 : U, Entrée — la BRAV-M part pour un carrefour à 300–400 m et y arrive, ou finit à pied et le dit (acceptation 8)', () => {
    expect(bravm.length, 'une BRAV-M avec la compagnie').toBeGreaterThanOrEqual(1);
    expect(d, 'un lieu à 300–400 m').not.toBeNull();
    expect(d!.appui.res.ok, d!.appui.res.text).toBe(true);
    expect(d!.accuse).toBeGreaterThanOrEqual(0);
    expect(d!.accuse).toBeLessThanOrEqual(1);
    expect(d!.arrive).toBeGreaterThanOrEqual(0);
    expect(d!.arrive).toBeLessThanOrEqual(90);
  });

  it('(e) §7.2 : un lanceur désigné, UN appui — la ligne nomme l’unité, l’ordre part', () => {
    expect(e, 'un manifestant en vue').not.toBeNull();
    expect(e!.ligne).toMatch(/^Interpeller le lanceur de projectile · .+ · \d+\u00a0m$/);
    expect(e!.appui.res.ok, e!.appui.res.text).toBe(true);
    expect(e!.types[0]).toBe('interpeller');
  });

  // DÉFAUT : la BRAV-M désignée (FAUCON 1, encore loin après le trajet) n'accuse réception qu'à 40 s et n'interpelle
  // personne en 200 s.
  it.fails('(e) §7.2 : interpellé ≤ 60 s, à bord d’un fourgon cellulaire ≤ 120 s, l’unité revient « avec vous » (acceptation 7)', () => {
    expect(e!.interpelle, 'interpellé').toBeGreaterThanOrEqual(0);
    expect(e!.interpelle).toBeLessThanOrEqual(60);
    expect(e!.aBord, 'à bord d’un fourgon cellulaire').toBeGreaterThanOrEqual(0);
    expect(e!.aBord).toBeLessThanOrEqual(120);
    expect(e!.revient).toBeGreaterThanOrEqual(0);
    expect(e!.revient).toBeLessThanOrEqual(10);
  });

  it('relevés permanents : jamais « SANS ORDRE », « MONTE », « DESCEND », « EN FILE » ; refus du tableau ; attentes dites (acceptations 3, 5, 10)', () => {
    releves(j);
    expect(j.attentes).toEqual([]);
  });
});
