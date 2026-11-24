// Recette des ordres directs, scénario 3 : CHEF DE LA BRAV-M (acceptation 9 : « La BRAV-M m'obéit comme les autres, et le
// chef de la BRAV-M peut la commander »). Mode libre « Déjà sur place », place de la Concorde, graine 21 : chaque verbe
// que la BRAV-M accepte — Envoyer (loin : en selle ; près : à pied), Avec moi (A), Tenir (F 8 5), Se replier (F 8 1),
// Interpeller (un lanceur désigné, Entrée), Disperser (F 6 : avant les sommations, la phrase qui dit qui décide) — avec
// l'accusé à la radio (≤ 1 s), l'ordre affiché qui reste celui du joueur, le premier mouvement (≤ 2 s à pied, ≤ 6 s
// quand il faut remonter en selle). Puis la mission bravm-01, lancée depuis sa fiche : il n'est jamais laissé sans son
// unité ni sans une moto qui l'attend.
import { beforeAll, describe, expect, it } from 'vitest';

import type { SessionConfig } from '@/core/contracts';
import {
  Joueur, direEnvoyer, direInterpeller, direVerbe, etapeEnvoyer, etapeInterpeller, etapeVerbe, phraseDuTableau, releves,
} from './playtest.ordre-direct.lib';
import type { Appui, EtapeEnvoyer, EtapeInterpeller, EtapeVerbe } from './playtest.ordre-direct.lib';

const MEANS = { sections: 3, fourgons: 9, centaure: 1, canon_eau: 1, bravm: 1, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };

let j: Joueur;
let depart = { poste: '', portee: '', unite: '', etat: '', avecLui: false };
let enSelleAuDepart = false;
let loin: EtapeEnvoyer | null = null;
let avecMoi: EtapeVerbe | null = null;
let revenus = -1;
let tenir: EtapeVerbe | null = null;
let repli: EtapeVerbe | null = null;
let pres: EtapeEnvoyer | null = null;
let interpeller: EtapeInterpeller | null = null;
let disperser: Appui | null = null;
let m: Joueur;
let mission = { poste: '', portee: '', seul: [] as string[], joue: 0 };

beforeAll(async () => {
  j = await Joueur.partie({
    mode: 'libre', role: 'bravm', rank: 'brigadier_chef', place: 'Place de la Concorde', x: -10, z: 15, crowdSize: 300, tension: 0.4, volatility: 0.3,
    duration: 'standard', extra: { moyens: MEANS, variante: 'terrain', poste: 'chef_groupe' },
  } as Partial<SessionConfig>, 21);
  j.pas(4);
  const own = j.core.scope().ownSquadId;
  // (il est en selle au début de la partie : E « Descendre », il commande à pied comme dans les parcours du §7)
  enSelleAuDepart = j.moi.vehicleId !== 0;
  j.descendre();
  j.pas(2);
  const unit = j.unite(own);
  depart = { poste: j.direct.env().poste, portee: j.core.scope().level, unite: j.squad(own)?.name ?? '', etat: j.ecran()?.state ?? '', avecLui: !!unit && unit.avecVous };
  console.log(`chef de la BRAV-M (${enSelleAuDepart ? 'en selle au départ, descendu' : 'à pied'}) : poste ${depart.poste}, portée ${depart.portee}, unité ${depart.unite}, état « ${depart.etat} »`);

  // ── Envoyer loin (300–400 m) : Entrée — elle remonte en selle et y roule ──
  if (j.chercherLoin(300, 400)) {
    loin = etapeEnvoyer(j, () => true, 120);
    if (loin) console.log(`Envoyer loin : ${direEnvoyer(loin)}`);
  } else console.log('Envoyer loin : aucun lieu à 300–400 m en tournant sur lui-même');

  // ── A : avec moi — elle revient ──
  {
    const ap = j.a();
    avecMoi = etapeVerbe(j, 'Avec moi', ap, own, 'suivre', 8);
    console.log(direVerbe(avecMoi));
    const me = j.moi;
    for (let s = 0; s < 150 && revenus < 0; s++) {
      j.pas(1);
      const ops = j.agents([own], true);
      const near = ops.filter((p) => { const q = j.lieu(p); return Math.hypot(q.x - me.x, q.z - me.z) < 40; }).length;
      if (ops.length > 0 && near * 2 >= ops.length) revenus = j.now - ap.at;
    }
    console.log(`      la moitié des opérateurs à moins de 40 m de lui ${revenus.toFixed(0)} s après A ; état « ${j.ecran()?.state} »`);
  }

  // ── F 8 5 : tenir sa position ; F 8 1 : se replier ──
  j.cap(j.ctx.player.state.camYaw);
  tenir = etapeVerbe(j, 'Tenir', j.roue(8, 5), own, 'tenir', 6);
  console.log(direVerbe(tenir));
  j.pas(1);
  repli = etapeVerbe(j, 'Se replier', j.roue(8, 1), own, 'repli', 8);
  console.log(direVerbe(repli));
  j.pas(12);

  // ── Envoyer près (un point à moins de 60 m) : à pied ──
  j.a();
  j.pas(15);
  if (j.chercher((n) => (n.rule === 'h' || (n.rule === 'g' && n.autre !== null && n.autre.verb === 'envoyer')) && n.distance >= 20 && n.distance <= 60)) {
    const o = j.direct.ready()!;
    pres = etapeEnvoyer(j, () => true, 60, o.rule === 'g');
    if (pres) console.log(`Envoyer près : ${direEnvoyer(pres)}`);
  } else console.log('Envoyer près : aucun point à 20–60 m');

  // ── Interpeller : un lanceur de projectile désigné, Entrée ──
  j.a();
  const cible = j.approcher(25, 60, 150);
  if (cible) {
    interpeller = etapeInterpeller(j, cible, 150);
    console.log(`Interpeller : ${direInterpeller(interpeller)}`);
  } else console.log('Interpeller : aucun manifestant en vue à 25–60 m');

  // ── Disperser (F 6) sur la foule, avant les sommations : la phrase dit qui décide ──
  {
    const vu = j.approcher(15, 60, 30);
    if (vu) j.regarder(vu.x, vu.z);
    disperser = j.roue(6);
    console.log(`Disperser (F 6) « ${disperser.ligne} » : ${disperser.res.ok ? 'accepté' : `« ${disperser.res.text} »`}`);
  }
  console.log(`lectures interdites : ${j.lectures.length} ${j.lectures.slice(0, 5).join(' | ')}\nrefus : ${j.refus.join(' | ') || 'aucun'}\nattentes : ${j.attentes.slice(0, 5).join(' | ') || 'aucune'}`);

  // ── mission bravm-01, lancée depuis sa fiche : jamais sans son unité ni sans une moto qui l'attend ──
  m = await Joueur.mission('bravm-01-en-selle');
  m.pas(3);
  mission.poste = m.moi.poste ?? '';
  mission.portee = m.core.scope().level;
  for (let s = 0; s < 240 && m.ctx.session.phase === 'playing' && !m.missions.result; s++) {
    m.pas(1);
    mission.joue++;
    const me = m.moi;
    if (me.vehicleId !== 0) continue;
    // à pied : un collègue de son unité à moins de 60 m, ou une moto de la BRAV-M avec une place à moins de 40 m
    const mates = m.agents([me.squadId]).some((p) => { const q = m.lieu(p); return Math.hypot(q.x - me.x, q.z - me.z) < 60; });
    const moto = m.ctx.vehicles.list.some((v) => v.kind === 'moto_bravm' && Math.hypot(v.x - me.x, v.z - me.z) < 40 && v.seats.some((id) => id === 0));
    if (!mates && !moto) mission.seul.push(`t=${m.now.toFixed(0)} s`);
  }
  console.log(`bravm-01 : poste ${mission.poste}, portée ${mission.portee}, ${mission.joue} s jouées, seul (ni collègue à 60 m ni moto libre à 40 m) : ${mission.seul.length} s ${mission.seul.slice(0, 3).join(', ')} ; lectures interdites ${m.lectures.length}`);
}, 1_800_000);

describe('recette — chef de la BRAV-M, Concorde (graine 21, déjà sur place)', () => {
  it('il commande sa BRAV-M, elle est avec lui au départ', () => {
    expect(depart.poste).toBe('bravm');
    expect(depart.portee).toBe('unite');
    expect(depart.unite).toMatch(/^FAUCON/);
    expect(depart.avecLui).toBe(true);
    expect(depart.etat).toMatch(/^AVEC VOUS/);
  });

  it('Envoyer à 300–400 m, Entrée : la ligne nomme sa BRAV-M, l’ordre part, accusé ≤ 1 s, l’ordre affiché reste le sien (acceptation 9)', () => {
    expect(loin, 'un lieu à 300–400 m').not.toBeNull();
    expect(loin!.ligne).toMatch(/^Envoyer\u00a0: .+ · .+ · \d+\u00a0m$/);
    expect(loin!.u).toBe(0);
    expect(loin!.appui.res.ok, loin!.appui.res.text).toBe(true);
    expect(loin!.accuse).toBeGreaterThanOrEqual(0);
    expect(loin!.accuse).toBeLessThanOrEqual(1);
    expect(loin!.autresOrdres).toEqual([]);
  });

  // DÉFAUT : le chef à pied (comme en selle), « Envoyer » à 320 m est accusé puis rien ne part — la BRAV-M reste en
  // selle, colonne « route » (l'écran dit maintenant « en selle », plus « descend des motos — prêt dans … ») ; premier
  // mouvement à 31 s, toujours à 325 m du point deux minutes plus tard. Relevé (étape 7) : la moto de tête est celle du
  // chef descendu, son pilote seul en selle — elle manœuvre trente secondes sur place, lui debout à côté ; les têtes
  // suivantes butent sur un mur (pilote « attente / mur »), et l'itinéraire des motos jusqu'à l'allée du Bord de l'Eau
  // fait 880 à 1 140 m pour 320 m à vol d'oiseau (sim/vehicles, command/bravm.ts departure / startSwap).
  it.fails('Envoyer à 300–400 m : les motos roulent en 6 s au plus, elle arrive (≤ 30 m) ou finit à pied et le dit en 90 s (acceptations 8 et 9)', () => {
    expect(loin!.mouvement).toBeGreaterThanOrEqual(0);
    expect(loin!.mouvement).toBeLessThanOrEqual(6);
    expect(loin!.arrive, `médiane à ${loin!.reste.toFixed(0)} m, étapes ${loin!.etapes.join(' → ')}`).toBeGreaterThanOrEqual(0);
    expect(loin!.arrive).toBeLessThanOrEqual(90);
  });

  it('A : l’ordre part, elle bouge dans les 6 s et revient autour de lui', () => {
    expect(avecMoi!.appui.res.ok, avecMoi!.appui.res.text).toBe(true);
    expect(avecMoi!.mouvement).toBeGreaterThanOrEqual(0);
    expect(avecMoi!.mouvement).toBeLessThanOrEqual(6);
    expect(revenus, 'la moitié des opérateurs revenue à moins de 40 m').toBeGreaterThanOrEqual(0);
    expect(revenus).toBeLessThanOrEqual(60);
  });

  // DÉFAUT : en selle, la BRAV-M appelée « Avec moi » tient d'abord « débarquer » (cinq secondes, sans « REÇU » ; elle dit
  // « Pied à terre, CINQ à pied » à 5,3 s) avant « suivre » — session/follow.ts orderOnFoot, unité à bord. Essayé à
  // l'étape 7 : donner « suivre » tout de suite à la BRAV-M que le joueur commande (comme à celle de la compagnie) — A
  // est alors vert (« suivre » à l'instant, « REÇU, pied à terre, je vous suis » à 0,03 s), mais l'ordre donné deux
  // secondes après un A est pris 3,7 s plus tard par la BRAV-M (« Interpeller » plus bas : accusé à 3,78 s) : retiré.
  it.fails('A : elle tient « suivre » dans la seconde et accuse réception en 1 s au plus (acceptations 6 et 9)', () => {
    expect(avecMoi!.autresOrdres).toEqual([]);
    expect(avecMoi!.accuse).toBeGreaterThanOrEqual(0);
    expect(avecMoi!.accuse).toBeLessThanOrEqual(1);
  });

  it('Tenir (F 8 5) et Se replier (F 8 1) : accusé ≤ 1 s, l’ordre tenu, mouvement ≤ 2 s pour le repli (acceptation 9)', () => {
    for (const v of [tenir!, repli!]) {
      expect(v.appui.res.ok, `${v.verbe} : ${v.appui.res.text}`).toBe(true);
      expect(v.autresOrdres, v.verbe).toEqual([]);
      expect(v.accuse, v.verbe).toBeGreaterThanOrEqual(0);
      expect(v.accuse, v.verbe).toBeLessThanOrEqual(1);
    }
    expect(repli!.mouvement).toBeGreaterThanOrEqual(0);
    expect(repli!.mouvement).toBeLessThanOrEqual(2);
  });

  it('Envoyer à moins de 60 m : à pied, accusé ≤ 1 s, premier mouvement ≤ 2 s, l’ordre tenu (acceptation 9)', () => {
    expect(pres, 'un point à 20–60 m').not.toBeNull();
    expect(pres!.appui.res.ok, pres!.appui.res.text).toBe(true);
    expect(pres!.accuse).toBeGreaterThanOrEqual(0);
    expect(pres!.accuse).toBeLessThanOrEqual(1);
    expect(pres!.mouvement).toBeGreaterThanOrEqual(0);
    expect(pres!.mouvement).toBeLessThanOrEqual(2);
    expect(pres!.autresOrdres).toEqual([]);
    expect(pres!.arrive, 'la moitié des opérateurs à moins de 30 m du point').toBeGreaterThanOrEqual(0);
  });

  // DÉFAUT (mesure) : 55 m à pied, la moitié des opérateurs n'est à moins de 30 m du point qu'au bout de 45 s — l'objectif
  // du §2.2 est 40 s pour 50 m.
  it.fails('Envoyer à moins de 60 m : sur le point en 40 s au plus (§2.2)', () => {
    expect(pres!.arrive).toBeGreaterThanOrEqual(0);
    expect(pres!.arrive).toBeLessThanOrEqual(40);
  });

  it('Interpeller un lanceur désigné, Entrée : accusé ≤ 1 s, l’ordre tenu, interpellé ≤ 60 s (acceptations 7 et 9)', () => {
    expect(interpeller, 'un manifestant en vue').not.toBeNull();
    expect(interpeller!.ligne).toMatch(/^Interpeller le lanceur de projectile · .+ · \d+ m$/);
    expect(interpeller!.appui.res.ok, interpeller!.appui.res.text).toBe(true);
    expect(interpeller!.accuse).toBeGreaterThanOrEqual(0);
    expect(interpeller!.accuse).toBeLessThanOrEqual(1);
    expect(interpeller!.types).toEqual(['interpeller']);
    expect(interpeller!.interpelle).toBeGreaterThanOrEqual(0);
    expect(interpeller!.interpelle).toBeLessThanOrEqual(60);
  });

  it('Disperser (F 6) avant les sommations : il n’est pas l’autorité — la phrase du tableau dit qui décide (acceptations 10 et 23)', () => {
    expect(disperser!.res.ok).toBe(false);
    expect(disperser!.res.ignored).toBe(false);
    expect(phraseDuTableau(disperser!.res.text), disperser!.res.text).toBe(true);
  });

  it('relevés permanents : jamais « SANS ORDRE », « MONTE », « DESCEND », « EN FILE » ; refus du tableau ; attentes dites (acceptations 3, 5, 10)', () => {
    releves(j);
    expect(j.attentes).toEqual([]);
  });

  it('mission bravm-01 : il n’est jamais laissé sans son unité ni sans une moto qui l’attend', () => {
    expect(mission.joue).toBeGreaterThan(60);
    expect(mission.seul).toEqual([]);
    expect(m.lectures).toEqual([]);
  });
});
