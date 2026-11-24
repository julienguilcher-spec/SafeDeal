// Recette des ordres directs, scénario 1 (le cas exact du joueur) : COMMANDANT, MISSION SPÉCIALE cdt-01 « Prise de
// commandement » (place de la République), lancée depuis sa fiche, trajet en passager de son véhicule de commandement,
// puis à pied au point de ralliement. Le robot joue comme lui (playtest.ordre-direct.lib.ts) :
//   (a) §7.1 — il regarde une bouche de rue, Entrée : la section libre la plus proche la barre (accusé ≤ 1 s, premier
//       mouvement ≤ 2 s, en place ≤ 45 s ; des agents encore assis descendent d'abord, et c'est dit) ;
//   (c) A : tout le monde le suit dans la seconde ; ⌫ rend les ordres d'avant (acceptations 6 et 19) ;
//   (e) §7.2 — un manifestant lance un projectile, il le regarde, UN appui : interpellé ≤ 60 s, à bord d'un fourgon
//       cellulaire ≤ 120 s, l'unité revient « avec vous » (acceptation 7) ; deux fourgons cellulaires au moins, dont un
//       avec une place libre à moins de 150 m du lieu de la remise ;
//   (f) il interpelle quelqu'un lui-même : la ligne d'aide dit où l'emmener en moins de 0,5 s, quatre appuis au plus
//       le libèrent (acceptation 11) ;
//   (g) le fourgon part au commissariat sur ordre (U, Entrée), un second tient la remise (acceptation 12) ;
//   (h) les nombres du compte rendu de fin sont ceux des registres (acceptation 13).
// (cdt-01 n'a pas de BRAV-M : (d) et la BRAV-M de (c) et (e) sont jouées dans cdt-04, playtest.ordre-direct-cdt04 ;
// (b), l'ordre donné pendant que la colonne roule ou se gare, dans playtest.ordre-direct-cdt01-colonne.)
import { beforeAll, describe, expect, it } from 'vitest';

import type { Person } from '@/core/contracts';
import { Joueur, direAvecMoi, direInterpeller, etapeAvecMoi, etapeBarrage, etapeInterpeller, jetConstate, releves, verifierBarrage } from './playtest.ordre-direct.lib';
import type { Appui, EtapeAvecMoi, EtapeBarrage, EtapeInterpeller } from './playtest.ordre-direct.lib';

interface Releve {
  arrivee: { secondes: number; journee: string; colonne: string; assis: number };
  a: EtapeBarrage | null;
  c: EtapeAvecMoi | null;
  fourgons: number;
  libreA150: number;
  e: EtapeInterpeller | null;
  f: { aide: string; invites: string[]; quatrieme: string; libre: boolean; appuis: number; entree: string; auFourgon: number } | null;
  g: { ligne: string; appui: Appui; parti: number; secondSurPlace: boolean; sansFourgon: number; depose: number; joue: number; dit: string; pilote: string } | null;
  h: { compteRendu: string; registres: { total: number; fourgon: number; commissariat: number }; monde: { fourgon: number; commissariat: number }; ligneEtat: string } | null;
}

/**
 * Où les interpellés sont remis : le point de remise de la compagnie quand il est fixé ; en journée de service, tant
 * que la foule est loin de la ligne, il ne l'est pas (session/remise.ts) : les fourgons restent où la colonne s'est
 * arrêtée, et c'est de là qu'on mesure (le point de ralliement, où il est descendu).
 */
let ralliement = { x: 0, z: 0 };
function lieuDeRemise(): { x: number; z: number } {
  return j.remise.point() ?? ralliement;
}

const R: Releve = { arrivee: { secondes: -1, journee: '', colonne: '', assis: 0 }, a: null, c: null, fourgons: 0, libreA150: 0, e: null, f: null, g: null, h: null };
let j: Joueur;

beforeAll(async () => {
  j = await Joueur.mission('cdt-01-prise-de-commandement');
  const { ctx } = j;
  // ── trajet en passager, jusqu'au début de la mission ──
  R.arrivee.secondes = j.trajet(() => j.missions.phaseIndex >= 0 || j.missions.result !== null);
  const own = j.core.scope().ownSquadId;
  R.arrivee.journee = j.journee.stage;
  R.arrivee.colonne = j.cmd.convoyOf(own)?.stage ?? '-';
  R.arrivee.assis = j.agents([own], true).filter((p) => p.vehicleId !== 0).length;
  j.descendre();
  ralliement = { x: j.moi.x, z: j.moi.z };
  console.log(`arrivée : ${R.arrivee.secondes} s de trajet, journée ${R.arrivee.journee}, colonne ${R.arrivee.colonne}, ${R.arrivee.assis} agents encore assis ; état « ${j.ecran()?.state} »`);

  // ── (a) il regarde une bouche de rue, Entrée ──
  R.a = etapeBarrage(j);
  if (R.a) console.log(`${j.dire('(a) bouche de rue', R.a.appui, R.a.suivi)}\n      barrage : ${JSON.stringify(R.a.barrage)}`);

  // ── (c) A : tout le monde avec moi ; ⌫ : les ordres d'avant ──
  R.c = etapeAvecMoi(j, R.a ? R.a.squadId : 0);
  console.log(`(c) ${direAvecMoi(R.c, R.a ? R.a.unite : '')}`);

  // ── (e) un manifestant lance un projectile : il le regarde, un appui ──
  {
    j.pas(2);
    const vans = j.cellulaires();
    const remise = lieuDeRemise();
    R.fourgons = vans.length;
    R.libreA150 = vans.filter(({ s, v }) => { const w = j.transfert.view(s.id); return w !== null && w.detainees < w.seats && Math.hypot(v.x - remise.x, v.z - remise.z) <= 150; }).length;
    // il va vers le cortège jusqu'à voir des manifestants à quelques dizaines de mètres
    const cible = j.approcher(25, 60, 120);
    if (cible) {
      R.e = etapeInterpeller(j, cible, 200);
      console.log(`(e) ${direInterpeller(R.e)} ; ${R.fourgons} fourgons cellulaires, ${R.libreA150} avec une place à moins de 150 m du lieu de la remise`);
    } else console.log('(e) aucun manifestant en vue à 25–60 m après 120 s de marche');
  }

  // ── (f) il interpelle quelqu'un lui-même : E, E, E, puis la meilleure issue ──
  {
    const me = j.moi;
    j.a();
    j.pas(6);
    const target: Person = ctx.people.spawn({ kind: 'manifestant', x: me.x + Math.sin(me.heading) * 1.2, z: me.z + Math.cos(me.heading) * 1.2, name: 'Christian Lopez' });
    jetConstate(j, target);
    ctx.people.rebuildIndex();
    const invites: string[] = [];
    let appuis = 0;
    // (la maîtrise peut échouer — tirage : il recommence, comme le joueur ; ces essais ne sont pas comptés deux fois)
    for (let i = 0; i < 8 && target.custody !== 'held'; i++) {
      target.x = me.x + Math.sin(me.heading) * 1.2;
      target.z = me.z + Math.cos(me.heading) * 1.2;
      ctx.people.rebuildIndex();
      const p = j.e();
      if (i === 0) { invites.push(p ? p.label : '(aucune invite)'); appuis++; }
      if ((target.custody as string) !== 'held') j.pas(2);
    }
    for (let i = 0; i < 2; i++) { const p = j.e(); invites.push(p ? p.label : '(aucune invite)'); appuis++; }
    // (j.e() a laissé passer 0,25 s après la palpation : la ligne d'aide est lue dans la demi-seconde)
    const t0 = j.now;
    const aide = j.custody.guidance(me.id);
    const entree = j.ligne();
    const fourth = j.e();
    appuis++;
    invites.push(fourth ? fourth.label : '(aucune invite)');
    const libre = j.custody.detaineeOf(me.id) === null;
    // le binôme emmène l'interpellé au fourgon
    let auFourgon = -1;
    for (let k = 0; k < 240 && auFourgon < 0; k++) {
      j.pas(1);
      const v = target.vehicleId !== 0 ? ctx.vehicles.get(target.vehicleId) : undefined;
      if (target.custody === 'in_vehicle' && v && v.kind === 'fourgon_cellulaire') auFourgon = j.now - t0;
    }
    R.f = { aide, invites, quatrieme: fourth ? fourth.verb : '', libre, appuis, entree, auFourgon };
    console.log(`(f) invites : ${invites.join(' → ')} ; ligne d'aide « ${aide} » ; ligne Entrée « ${entree} » ; libre après ${appuis} appuis : ${libre} ; son interpellé à bord d'un fourgon cellulaire ${auFourgon.toFixed(0)} s plus tard`);
  }

  // ── (g) U jusqu'au fourgon qui a des interpellés, Entrée : il part au commissariat, un second tient la remise ──
  {
    const o = j.uJusqua((u) => u.kind === 'cellulaire' && (u.detainees ?? 0) > 0);
    const ligne = j.ligne();
    if (o) {
      const appui = j.entree();
      const id = appui.res.squads[0] ?? o.who!.squadIds[0]!;
      const ap = ctx.service<{ status(v: unknown): { mode: string; state: string; reason: string; remaining: number } }>('vehicles.autopilot')!;
      let parti = -1, depose = -1, sansFourgon = 0, joue = 0;
      let secondSurPlace = false;
      let pilote = '';
      for (let s = 0; s < 600 && depose < 0 && ctx.session.phase === 'playing' && !j.missions.result; s++) {
        j.pas(1);
        joue++;
        const w = j.transfert.view(id);
        if (parti < 0 && w && (w.stage === 'aller' || w.stage === 'commissariat')) parti = j.now - appui.at;
        const remise = lieuDeRemise();
        const free = j.cellulaires().filter(({ s: q, v }) => { const x = j.transfert.view(q.id); return x !== null && q.id !== id && x.detainees < x.seats && Math.hypot(v.x - remise.x, v.z - remise.z) <= 150; }).length;
        if (free > 0) secondSurPlace = true; else sansFourgon++;
        if (j.records.interpellations.some((r) => r.status === 'depose')) depose = j.now - appui.at;
        if (s % 60 === 59) {
          const van = j.cellulaires().find((x) => x.s.id === id);
          if (van) { const st = ap.status(van.v); pilote = `t+${s + 1} s : ${w?.stage} à (${van.v.x.toFixed(0)}, ${van.v.z.toFixed(0)}), ${van.v.speed.toFixed(1)} m/s, pilote ${st.mode}/${st.state}/${st.reason}, reste ${st.remaining.toFixed(0)} m`; }
        }
      }
      const dit = j.messages.filter((m) => m.t >= appui.at - 1e-6 && m.t <= appui.at + 10).map((m) => m.text)
        .concat(ctx.radio.log.filter((l) => l.t >= appui.at - 1e-6 && l.t <= appui.at + 60 && /CELLULAIRE/.test(l.from)).map((l) => `${l.from} : ${l.text}`)).join(' | ');
      R.g = { ligne, appui, parti, secondSurPlace, sansFourgon, depose, joue, dit, pilote };
      console.log(`(g) « ${ligne} » : ${appui.res.ok ? 'accepté' : appui.res.text} ; parti à ${parti.toFixed(0)} s ; second fourgon libre à moins de 150 m du lieu de la remise : ${secondSurPlace} (${sansFourgon} s sans) ; déposés au commissariat à ${depose.toFixed(0)} s (${joue} s jouées) ; ${pilote}\n      dit : ${dit}`);
    } else {
      R.g = { ligne, appui: { touche: 'Entrée', at: j.now, ligne, ordre: null, res: { ok: false, text: 'aucun fourgon avec des interpellés dans le cycle de U', squads: [], ignored: false } }, parti: -1, secondSurPlace: false, sansFourgon: 0, depose: -1, joue: 0, dit: '', pilote: '' };
      console.log(`(g) U n'a proposé aucun fourgon cellulaire avec des interpellés ; fourgons : ${j.transfert.vans.map((v) => `${v.name} ${v.stage} ${v.detainees}/${v.seats}`).join(', ')}`);
    }
  }

  // ── (h) le compte rendu de fin et les registres ──
  {
    const recs = j.records.interpellations;
    const monde = { fourgon: 0, commissariat: 0 };
    for (const { v } of j.cellulaires()) monde.fourgon += j.aBord(v).length;
    for (const d of j.transfert.delivered) monde.commissariat += d.count;
    R.h = {
      compteRendu: j.compteRendu(),
      registres: { total: recs.length, fourgon: recs.filter((r) => r.status === 'remis_vehicule').length, commissariat: recs.filter((r) => r.status === 'depose').length },
      monde, ligneEtat: j.ecran()?.custody ?? '',
    };
    console.log(`(h) compte rendu « ${R.h.compteRendu} » ; registres ${JSON.stringify(R.h.registres)} ; monde ${JSON.stringify(monde)} ; bloc d'état « ${R.h.ligneEtat} »`);
  }
  console.log(`lectures interdites : ${j.lectures.length} ${j.lectures.slice(0, 5).join(' | ')}\nrefus : ${j.refus.join(' | ') || 'aucun'}\nattentes : ${j.attentes.slice(0, 5).join(' | ') || 'aucune'}`);
}, 1_500_000);

describe('recette — commandant, mission spéciale cdt-01, à l’arrivée sur la manifestation', () => {
  it('il arrive avec sa colonne : la mission commence, il commande tout', () => {
    expect(R.arrivee.secondes).toBeGreaterThanOrEqual(0);
    expect(j.missions.phaseIndex).toBeGreaterThanOrEqual(0);
    expect(j.core.scope().level).toBe('tout');
  });

  it('(a) §7.1 : il regarde une bouche de rue, Entrée — la section la barre (accusé ≤ 1 s, mouvement ≤ 2 s, en place ≤ 45 s)', () => {
    verifierBarrage(R.a);
    expect(R.a!.ligne).toMatch(/^Bloquer .+ · MISTRAL \d · \d+ m$/);
  });

  it('(c) A : toutes les unités le suivent dans la seconde (acceptation 6)', () => {
    const c = R.c!;
    expect(c.appui.res.ok, c.appui.res.text).toBe(true);
    expect(c.pasAvecMoi, c.ordres.join(' ')).toEqual([]);
    expect(c.accuse, 'accusé à la radio').toBeGreaterThanOrEqual(0);
    expect(c.accuse).toBeLessThanOrEqual(1);
    expect(c.etat).toMatch(/^AVEC VOUS · /);
  });

  it('(c) ⌫ dans les 5 s : la section reprend son barrage, les autres restent avec lui (acceptation 19)', () => {
    const c = R.c!;
    expect(c.retour.res.ok, c.retour.res.text).toBe(true);
    expect(c.rendu).toBe('couper_circulation');
    expect(c.renduApres).toBe('couper_circulation');
    expect(c.autres).toEqual([]);
  });

  it('(e) §7.2 : deux fourgons cellulaires au moins, dont un avec une place libre à moins de 150 m du lieu de la remise', () => {
    expect(R.fourgons).toBeGreaterThanOrEqual(2);
    expect(R.libreA150).toBeGreaterThanOrEqual(1);
  });

  it('(e) §7.2 : un lanceur désigné, UN appui — accusé ≤ 1 s, interpellé ≤ 60 s, il finit dans un fourgon cellulaire, l’unité revient « avec vous » ≤ 10 s après', () => {
    const e = R.e!;
    expect(e, 'un manifestant en vue').not.toBeNull();
    expect(e.ligne).toMatch(/^Interpeller le lanceur de projectile · .+ · \d+ m$/);
    expect(e.appui.res.ok, e.appui.res.text).toBe(true);
    expect(e.accuse).toBeGreaterThanOrEqual(0);
    expect(e.accuse).toBeLessThanOrEqual(1);
    expect(e.interpelle, 'interpellé').toBeGreaterThanOrEqual(0);
    expect(e.interpelle).toBeLessThanOrEqual(60);
    expect(e.aBord, 'à bord d’un fourgon cellulaire').toBeGreaterThanOrEqual(0);
    expect(e.fourgon).toMatch(/^CELLULAIRE \d$/);
    expect(e.revient, 'l’unité revient avec lui').toBeGreaterThanOrEqual(0);
    expect(e.revient).toBeLessThanOrEqual(10);
  });

  // (Le fourgon cellulaire appelé, garé derrière la file des fourgons de la compagnie, a le temps d'en sortir — il
  // n'est plus retenu « coincé » au bout de 12 s pendant qu'il déboîte : à bord en 87 s quand il passe ; quand il ne
  // passe pas, le binôme le rejoint à pied — 110 s mesurées. Avant : 144 s.)
  it('(e) §7.2 : à bord d’un fourgon cellulaire en 120 s au plus (acceptation 7)', () => {
    expect(R.e!.aBord).toBeGreaterThanOrEqual(0);
    expect(R.e!.aBord).toBeLessThanOrEqual(120);
  });

  it('(f) il interpelle lui-même : la ligne d’aide dit où l’emmener en moins de 0,5 s, quatre appuis le libèrent (acceptation 11)', () => {
    const f = R.f!;
    expect(f.aide).toMatch(/^Interpellé\. E : (le confier à .+ \(\d+ m\)|l’emmener au fourgon cellulaire \d \(\d+ m, flèche\)|faire venir le fourgon cellulaire \d \(\d+ m\)|le remettre au fourgon cellulaire \d \(\d+ m\))$/);
    expect(['confier', 'remettre', 'faire_venir']).toContain(f.quatrieme);
    expect(f.invites.some((l) => /^Faire asseoir/.test(l))).toBe(false);
    // le commandant lit la même issue sur sa ligne Entrée
    expect(f.entree).toMatch(/^(Confier l’interpellé à |Remettre l’interpellé au fourgon cellulaire |Faire venir le fourgon cellulaire |Emmenez-le au fourgon cellulaire )/);
    expect(f.appuis).toBeLessThanOrEqual(4);
    expect(f.libre, 'les mains libres au 4e appui').toBe(true);
    expect(f.auFourgon, 'son interpellé finit dans un fourgon cellulaire').toBeGreaterThanOrEqual(0);
  });

  it('(g) U jusqu’au fourgon cellulaire, Entrée : il part tout de suite, un second fourgon tient la remise (acceptation 12)', () => {
    const g = R.g!;
    expect(g.ligne).toMatch(/^CELLULAIRE \d : partir au commissariat \(\d\/\d\)$/);
    expect(g.appui.res.ok, g.appui.res.text).toBe(true);
    expect(g.parti, 'le fourgon part').toBeGreaterThanOrEqual(0);
    expect(g.parti).toBeLessThanOrEqual(15);
    expect(g.secondSurPlace, 'un second fourgon avec une place libre à moins de 150 m du lieu de la remise').toBe(true);
    expect(g.sansFourgon, 'secondes sans autre fourgon libre au lieu de la remise').toBe(0);
  });

  // (fragile : dans une partie voisine, le fourgon parti est resté huit minutes derrière un fourgon de la compagnie arrêté
  // en travers de la voie — pilote « attente / véhicule » — et n'a rien déposé ; voir le compte rendu de la recette)
  it('(g) ses interpellés sont déposés au commissariat (acceptation 12)', () => {
    expect(R.g!.depose, R.g!.pilote).toBeGreaterThanOrEqual(0);
  });

  it('(h) le compte rendu de fin dit les nombres des registres, qui sont ceux du monde (acceptation 13)', () => {
    const h = R.h!;
    expect(h.registres.total).toBeGreaterThanOrEqual(2);
    expect(h.registres.fourgon).toBe(h.monde.fourgon);
    expect(h.registres.commissariat).toBe(h.monde.commissariat);
    expect(h.registres.fourgon + h.registres.commissariat).toBe(h.registres.total);
    expect(h.compteRendu.startsWith(`${h.registres.total} — `)).toBe(true);
    if (h.registres.commissariat > 0) expect(h.compteRendu).toMatch(new RegExp(`${h.registres.commissariat} déposés? au commissariat`));
    if (h.registres.fourgon > 0) expect(h.compteRendu).toMatch(new RegExp(`${h.registres.fourgon} dans le fourgon cellulaire \\d`));
    expect(h.ligneEtat).toMatch(new RegExp(`^Interpellés ${h.registres.total} · `));
  });

  it('à chaque seconde : aucune unité sous ses ordres ne lit « SANS ORDRE », « MONTE », « DESCEND », « EN FILE » ; tout refus est une phrase du tableau (acceptations 5 et 10)', () => {
    releves(j);
  });

  it('toute attente affichée a sa raison et dure 10 s au plus, trajet excepté (acceptation 3)', () => {
    expect(j.attentes).toEqual([]);
  });
});
