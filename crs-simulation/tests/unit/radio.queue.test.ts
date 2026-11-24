import { describe, expect, it } from 'vitest';
import type { GameContext, RadioMessage } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { createSystems } from '@/gameplay/radio';
import type { RadioControl } from '@/gameplay/radio';
import { RADIO_CONTROL_SERVICE } from '@/gameplay/radio';
import { DEFAULT_QUEUE_CONFIG, RadioQueue, trimLog } from '@/gameplay/radio/queue';
import { estimateDuration } from '@/gameplay/radio/text';

function msg(text: string, priority: 0 | 1 | 2 = 1, channel: RadioMessage['channel'] = 'unite', from = 'MISTRAL 1'): RadioMessage {
  return { channel, from, text, priority };
}

async function start(seed = 5): Promise<{ ctx: GameContext; step: (s: number) => void; control: RadioControl }> {
  const t = createTestContext({ seed, modules: [createSystems] });
  await t.start({ seed });
  const control = t.ctx.require<RadioControl>(RADIO_CONTROL_SERVICE);
  control.ambient = false; // les tests de file ne veulent que leurs propres messages
  return { ctx: t.ctx, step: (s) => t.step(s), control };
}

describe('radio — file d\'attente (logique pure)', () => {
  function make(): { q: RadioQueue; played: { text: string; t: number }[] } {
    const played: { text: string; t: number }[] = [];
    const q = new RadioQueue((m, now) => played.push({ text: m.text, t: now }));
    return { q, played };
  }

  it('diffuse tout de suite sur un canal libre, met en file sinon', () => {
    const { q, played } = make();
    expect(q.submit(msg('Premier message sur le canal.'), 0)).toBe('played');
    expect(q.submit(msg('Deuxième message sur le canal.'), 0.1)).toBe('queued');
    expect(played.map((p) => p.text)).toEqual(['Premier message sur le canal.']);
    expect(q.pending('unite')).toBe(1);
  });

  it('ne chevauche pas : le suivant attend la fin estimée du premier', () => {
    const { q, played } = make();
    const first = 'Un message assez long pour durer plusieurs secondes sur le réseau radio de la compagnie.';
    q.submit(msg(first), 0);
    q.submit(msg('Suite du trafic.'), 0.2);
    const free = estimateDuration(first) + DEFAULT_QUEUE_CONFIG.gap;
    q.update(free - 0.1);
    expect(played).toHaveLength(1);
    q.update(free + 0.01);
    expect(played).toHaveLength(2);
    expect(played[1]!.t).toBeGreaterThanOrEqual(free);
  });

  it('les canaux sont indépendants', () => {
    const { q, played } = make();
    q.submit(msg('Message sur le canal des unités.', 1, 'unite'), 0);
    expect(q.submit(msg('Message sur le canal des secours.', 1, 'secours', 'SANTÉ 1'), 0)).toBe('played');
    expect(played).toHaveLength(2);
  });

  it('les messages urgents passent devant, puis par ancienneté', () => {
    const { q, played } = make();
    q.submit(msg('Occupation du canal par un premier message.'), 0);
    q.submit(msg('Normal numéro un.', 1), 0.1);
    q.submit(msg('Ambiance numéro deux.', 0), 0.2);
    q.submit(msg('URGENT agent à terre.', 2), 0.3);
    q.submit(msg('Normal numéro trois.', 1), 0.4);
    let t = 0;
    for (let i = 0; i < 400; i++) {
      t += 0.1;
      q.update(t);
    }
    expect(played.map((p) => p.text)).toEqual([
      'Occupation du canal par un premier message.',
      'URGENT agent à terre.',
      'Normal numéro un.',
      'Normal numéro trois.',
      // l'ambiance a attendu plus de 8 s : abandonnée
    ]);
    expect(q.counters.dropped).toBe(1);
  });

  it('abandonne l\'ambiance qui attend trop, pas les messages normaux', () => {
    const { q, played } = make();
    q.submit(msg('Un message très long qui occupe le canal pendant un bon moment, avec beaucoup de mots à dire à la suite.'), 0);
    q.submit(msg('Ambiance sans importance.', 0), 0.1);
    q.submit(msg('Message normal à passer.', 1), 0.1);
    q.update(DEFAULT_QUEUE_CONFIG.maxWait[0] + 0.5);
    expect(q.pending('unite')).toBe(1); // l'ambiance est partie
    expect(q.counters.dropped).toBe(1);
    q.update(DEFAULT_QUEUE_CONFIG.maxWait[0] + 20);
    expect(played.map((p) => p.text)).toContain('Message normal à passer.');
    expect(played.map((p) => p.text)).not.toContain('Ambiance sans importance.');
  });

  it('anti-répétition : le même message n\'est pas redit dans le délai, il l\'est après', () => {
    const { q, played } = make();
    expect(q.submit(msg('Rien à signaler, secteur Concorde.', 1), 0)).toBe('played');
    expect(q.submit(msg('Rien à signaler, secteur Concorde.', 1), 10)).toBe('repeated');
    // casse, accents et ponctuation ne comptent pas
    expect(q.submit(msg('rien a signaler secteur concorde', 1), 12)).toBe('repeated');
    expect(q.submit(msg('Rien à signaler, secteur Concorde.', 1), DEFAULT_QUEUE_CONFIG.repeatWindow[1] + 1)).toBe('played');
    expect(played).toHaveLength(2);
    expect(q.counters.repeated).toBe(2);
  });

  it('anti-répétition : un autre émetteur peut dire la même chose', () => {
    const { q } = make();
    q.submit(msg('Rien à signaler.', 1, 'unite', 'MISTRAL 1'), 0);
    expect(q.submit(msg('Rien à signaler.', 1, 'unite', 'MISTRAL 2'), 1)).toBe('queued');
  });

  it('anti-répétition : l\'ambiance se répète moins vite que l\'urgent', () => {
    const { q } = make();
    q.submit(msg('Même ambiance.', 0), 0);
    expect(q.submit(msg('Même ambiance.', 0), 60)).toBe('repeated');
    q.submit(msg('Même urgence.', 2, 'commandement'), 0);
    expect(q.submit(msg('Même urgence.', 2, 'commandement'), 9)).not.toBe('repeated');
  });

  it('un doublon déjà en attente n\'est pas empilé et relève la priorité de la copie', () => {
    const { q } = make();
    q.submit(msg('Occupation initiale du canal radio par un message.'), 0);
    q.submit(msg('Doublon en attente.', 0), 0.1);
    expect(q.submit(msg('Doublon en attente.', 2), 0.2)).toBe('repeated');
    expect(q.pending('unite')).toBe(1);
  });

  it('file saturée : on écarte d\'abord les messages les moins importants', () => {
    const played: string[] = [];
    const q = new RadioQueue((m) => played.push(m.text), { ...DEFAULT_QUEUE_CONFIG, maxPending: 3 });
    q.submit(msg('Occupation.'), 0);
    q.submit(msg('Ambiance A.', 0), 0.1);
    q.submit(msg('Normal B.', 1), 0.1);
    q.submit(msg('Normal C.', 1), 0.1);
    expect(q.pending('unite')).toBe(3);
    expect(q.submit(msg('Urgent D.', 2), 0.2)).toBe('queued'); // évince l'ambiance
    expect(q.pending('unite')).toBe(3);
    expect(q.submit(msg('Ambiance E.', 0), 0.3)).toBe('dropped'); // trop peu importante
    expect(q.counters.dropped).toBe(2);
  });

  it('ignore un texte vide', () => {
    const { q } = make();
    expect(q.submit(msg('   '), 0)).toBe('dropped');
  });

  it('journal plein : l\'ambiance ancienne part d\'abord, les messages opérationnels restent', () => {
    const journal: (RadioMessage & { t: number })[] = [];
    for (let i = 0; i < 100; i++) journal.push({ ...msg(`message ${i}`, i % 2 === 0 ? 0 : 1), t: i });
    trimLog(journal, 200);
    expect(journal).toHaveLength(100); // pas encore plein : rien ne bouge
    trimLog(journal, 100);
    // la moitié ancienne a perdu son ambiance (25 messages), tout l'opérationnel est là, dans l'ordre
    expect(journal).toHaveLength(75);
    expect(journal.filter((m) => m.priority === 1)).toHaveLength(50);
    expect(journal.slice(0, 3).map((m) => m.text)).toEqual(['message 1', 'message 3', 'message 5']);
    expect(journal[journal.length - 1]!.text).toBe('message 99');
    for (let i = 1; i < journal.length; i++) expect(journal[i]!.t).toBeGreaterThan(journal[i - 1]!.t);
    // aucun message d'ambiance à retirer : on abandonne le quart le plus ancien
    const urgent: (RadioMessage & { t: number })[] = [];
    for (let i = 0; i < 40; i++) urgent.push({ ...msg(`urgent ${i}`, 2), t: i });
    trimLog(urgent, 40);
    expect(urgent).toHaveLength(30);
    expect(urgent[0]!.text).toBe('urgent 10');
  });

  it('silent : écrit tout de suite même sur un canal occupé, sans occuper le canal ni passer par l\'anti-répétition', () => {
    const { q, played } = make();
    q.submit(msg('Un message assez long pour occuper le canal du commandement pendant plusieurs secondes.', 1, 'commandement', 'CENTRAL'), 0);
    const busy = q.busyUntil('commandement');
    const order: RadioMessage = { ...msg('MISTRAL 1, barrez la rue Saint-Gilles.', 1, 'commandement', 'MISTRAL'), silent: true };
    expect(q.submit(order, 1)).toBe('played');
    expect(played.map((p) => p.text)).toContain('MISTRAL 1, barrez la rue Saint-Gilles.');
    expect(played[played.length - 1]!.t).toBe(1);
    expect(q.busyUntil('commandement')).toBe(busy);
    expect(q.pending('commandement')).toBe(0);
    // le même ordre redonné s'écrit à nouveau
    expect(q.submit({ ...order }, 3)).toBe('played');
  });

  it('reply : l\'accusé coupe un message de priorité 1 en cours, passe aussitôt, et le message coupé est redit après', () => {
    const { q, played } = make();
    const long = 'MISTRAL ICI CENTRAL. Point de situation, cortège arrêté boulevard Beaumarchais, rien à signaler de plus pour le moment. PARLEZ.';
    q.submit(msg(long, 1, 'commandement', 'CENTRAL'), 0);
    q.submit(msg('Trafic ordinaire en attente.', 1, 'commandement', 'MISTRAL 3'), 0.2);
    const ack: RadioMessage = { ...msg('ICI MISTRAL UN. REÇU, je barre la rue, rue Saint-Gilles. TERMINÉ.', 1, 'commandement', 'MISTRAL 1'), reply: true };
    expect(q.submit(ack, 1)).toBe('played');
    expect(played[played.length - 1]).toEqual({ text: ack.text, t: 1 });
    // le canal reste occupé le temps de l'accusé puis de redire le message coupé : le trafic en attente passe après
    const free = 1 + estimateDuration(ack.text) + DEFAULT_QUEUE_CONFIG.gap + estimateDuration(long) + DEFAULT_QUEUE_CONFIG.gap;
    expect(q.busyUntil('commandement')).toBeCloseTo(free, 5);
    q.update(free - 0.1);
    expect(played).toHaveLength(2);
    q.update(free + 0.01);
    expect(played.map((p) => p.text)).toEqual([long, ack.text, 'Trafic ordinaire en attente.']);
    // coupé une seconde fois pendant sa redite (deux ordres de suite), il n'est plus redit : le second accusé passe
    // aussitôt et le canal se libère à la fin de celui-ci
    const { q: q2, played: p2 } = make();
    q2.submit(msg(long, 1, 'commandement', 'CENTRAL'), 0);
    expect(q2.submit({ ...ack }, 0.5)).toBe('played');
    const second: RadioMessage = { ...msg('ICI MISTRAL DEUX. REÇU, je tiens la position. TERMINÉ.', 1, 'commandement', 'MISTRAL 2'), reply: true };
    const t2 = 0.5 + estimateDuration(ack.text) + DEFAULT_QUEUE_CONFIG.gap + 0.3;
    q2.update(t2);
    expect(q2.submit(second, t2)).toBe('played');
    expect(p2[p2.length - 1]).toEqual({ text: second.text, t: t2 });
    expect(q2.busyUntil('commandement')).toBeCloseTo(t2 + estimateDuration(second.text) + DEFAULT_QUEUE_CONFIG.gap, 5);
  });

  it('reply : ne coupe ni un urgent ni le joueur, mais passe le premier dès que le canal se libère', () => {
    const played: { text: string; t: number }[] = [];
    const q = new RadioQueue((m, now) => played.push({ text: m.text, t: now }));
    q.fromPlayer = (m) => m.personId === 7;
    const urgent = 'MISTRAL ICI CENTRAL. URGENT. Agent à terre, rue de la Roquette, il faut le dégager sans délai. PARLEZ.';
    q.submit(msg(urgent, 2, 'commandement', 'CENTRAL'), 0);
    q.submit(msg('Autre urgence en attente sur le réseau.', 2, 'commandement', 'MISTRAL 4'), 0.1);
    q.submit(msg('Compte rendu ordinaire en attente.', 1, 'commandement', 'MISTRAL 3'), 0.2);
    const ack: RadioMessage = { ...msg('ICI FAUCON UN. REÇU, en colonne vers le point. TERMINÉ.', 1, 'commandement', 'FAUCON 1'), reply: true };
    expect(q.submit(ack, 0.5)).toBe('queued');
    const free = estimateDuration(urgent) + DEFAULT_QUEUE_CONFIG.gap;
    q.update(free + 0.01);
    expect(played.map((p) => p.text)).toEqual([urgent, ack.text]);
    // le message du joueur en cours n'est pas coupé non plus
    const played2: string[] = [];
    const q2 = new RadioQueue((m) => played2.push(m.text));
    q2.fromPlayer = (m) => m.personId === 7;
    q2.submit({ ...msg('MISTRAL UN ICI MISTRAL. Barrez la rue Saint-Gilles, toute sa largeur. PARLEZ.', 1, 'commandement', 'MISTRAL'), personId: 7 }, 0);
    expect(q2.submit({ ...ack }, 0.3)).toBe('queued');
  });

  it('reply : jamais avant l\'ordre — la phrase du joueur en attente passe avant l\'accusé', () => {
    const played: { text: string; t: number }[] = [];
    const q = new RadioQueue((m, now) => played.push({ text: m.text, t: now }));
    q.fromPlayer = (m) => m.personId === 7;
    const urgent = 'MISTRAL ICI CENTRAL. URGENT. Feu de véhicule rue de Lyon, je demande un moyen d’extinction. PARLEZ.';
    q.submit(msg(urgent, 2, 'commandement', 'CENTRAL'), 0);
    const order: RadioMessage = { ...msg('MISTRAL UN ICI MISTRAL. Tenez la position. PARLEZ.', 1, 'commandement', 'MISTRAL'), personId: 7 };
    expect(q.submit(order, 0.2)).toBe('queued');
    const ack: RadioMessage = { ...msg('ICI MISTRAL UN. REÇU, je tiens la position. TERMINÉ.', 1, 'commandement', 'MISTRAL 1'), reply: true };
    expect(q.submit(ack, 0.6)).toBe('queued');
    let t = 0;
    for (let i = 0; i < 300; i++) q.update((t += 0.1));
    expect(played.map((p) => p.text)).toEqual([urgent, order.text, ack.text]);
  });

  it('reply : jamais abandonné, ni par l\'attente ni par une file pleine, et redit pour un ordre redonné', () => {
    const played: string[] = [];
    const q = new RadioQueue((m) => played.push(m.text), { ...DEFAULT_QUEUE_CONFIG, maxPending: 3 });
    q.submit(msg('URGENT. Occupation du canal par un message très long, avec beaucoup de mots, encore et encore, sans fin.', 2, 'unite'), 0);
    const ack: RadioMessage = { ...msg('ICI MISTRAL UN. REÇU, je tiens la position. TERMINÉ.', 1, 'unite', 'MISTRAL 1'), reply: true };
    q.submit(ack, 0.1);
    for (let i = 0; i < 5; i++) q.submit(msg(`Urgent numéro ${i}.`, 2, 'unite', `MISTRAL ${i + 2}`), 0.2);
    expect(q.pending('unite')).toBe(3);
    q.update(500);
    expect(played).toContain(ack.text);
    // le même accusé, pour le même ordre redonné quelques secondes plus tard, est redit (pas d'anti-répétition)
    const played2: string[] = [];
    const q2 = new RadioQueue((m) => played2.push(m.text));
    expect(q2.submit({ ...ack }, 0)).toBe('played');
    expect(q2.submit({ ...ack }, 6)).toBe('played');
    expect(played2).toHaveLength(2);
  });

  it('estimateDuration croît avec la longueur et reste bornée', () => {
    expect(estimateDuration('Reçu.')).toBe(2);
    expect(estimateDuration('a'.repeat(130))).toBeCloseTo(11, 5);
    expect(estimateDuration('a'.repeat(5000))).toBe(16);
  });
});

describe('radio — service dans le moteur', () => {
  it('say() : journal horodaté, événement radio:message, sous-titre, voix stable', async () => {
    const { ctx, step } = await start();
    const events: { msg: RadioMessage; t: number }[] = [];
    ctx.events.on('radio:message', (e) => events.push(e));
    const subtitles: { who: string; text: string }[] = [];
    ctx.ui.subtitle = (who, text) => subtitles.push({ who, text });

    step(1);
    ctx.radio.say(msg('Premier compte rendu de situation.', 1, 'unite', 'MISTRAL 2'));
    ctx.radio.say(msg('Deuxième compte rendu de situation.', 2, 'unite', 'MISTRAL 2'));
    step(30);

    expect(ctx.radio.log.map((m) => m.text)).toEqual([
      'Premier compte rendu de situation.', 'Deuxième compte rendu de situation.',
    ]);
    const [a, b] = ctx.radio.log;
    expect(a!.t).toBeGreaterThan(0);
    expect(b!.t).toBeGreaterThan(a!.t); // pas de chevauchement
    expect(events).toHaveLength(2);
    expect(events[0]!.msg.voice).toBe(events[1]!.msg.voice); // même émetteur, même voix
    expect(events[0]!.msg.voice).toBeGreaterThanOrEqual(0);
    expect(events[0]!.msg.voice).toBeLessThan(6);
    expect(subtitles.map((s) => s.who)).toEqual(['MISTRAL 2', 'MISTRAL 2']);
  });

  it('pas de sous-titre pour l\'ambiance, ni quand ils sont coupés', async () => {
    const { ctx, step, control } = await start();
    const subtitles: string[] = [];
    ctx.ui.subtitle = (_w, text) => subtitles.push(text);
    ctx.radio.say(msg('Bruit de fond.', 0));
    control.subtitles = false;
    ctx.radio.say(msg('Message sans sous-titre.', 1, 'secours', 'SANTÉ 1'));
    step(1);
    expect(subtitles).toEqual([]);
    expect(ctx.radio.log).toHaveLength(2);
  });

  it('un message qui attend sort quand le canal est libre, avec l\'heure réelle de diffusion', async () => {
    const { ctx, step } = await start();
    ctx.radio.say(msg('Un long message de situation qui occupe le canal de la compagnie pendant plusieurs secondes.'));
    ctx.radio.say(msg('Réponse de la salle.', 1, 'unite', 'CENTRAL'));
    expect(ctx.radio.log).toHaveLength(1);
    step(20);
    expect(ctx.radio.log).toHaveLength(2);
    expect(ctx.radio.log[1]!.t).toBeGreaterThan(ctx.radio.log[0]!.t + 3);
  });

  it('clear() vide le journal et les files', async () => {
    const { ctx, control } = await start();
    ctx.radio.say(msg('Un message assez long pour occuper le canal quelques secondes.'));
    ctx.radio.say(msg('En attente.'));
    expect(control.pending('unite')).toBe(1);
    ctx.radio.clear();
    expect(ctx.radio.log).toHaveLength(0);
    expect(control.pending('unite')).toBe(0);
    // l'anti-répétition est remise à zéro avec la session
    ctx.radio.say(msg('Un message assez long pour occuper le canal quelques secondes.'));
    expect(ctx.radio.log).toHaveLength(1);
  });

  it('accusé d\'un ordre du joueur dans la seconde, après la phrase d\'ordre, avec la salle qui sature le réseau', async () => {
    const { ctx, step } = await start();
    const aired: { msg: RadioMessage; t: number }[] = [];
    ctx.events.on('radio:message', (e) => aired.push(e));
    const subtitles: { who: string; text: string; t: number }[] = [];
    ctx.ui.subtitle = (who, text) => subtitles.push({ who, text, t: ctx.clock.now });
    // la salle et les unités parlent sans arrêt sur les deux réseaux (un message toutes les 2 s, chacun différent)
    let n = 0;
    const chatter = (): void => {
      ctx.radio.say(msg(`MISTRAL ICI CENTRAL. Point de situation numéro ${n}, circulation dense boulevard Voltaire, sans incident. PARLEZ.`, 1, 'commandement', 'CENTRAL'));
      ctx.radio.say(msg(`MISTRAL ICI MISTRAL ${(n % 3) + 2}. Rien à signaler sur mon secteur, compte rendu numéro ${n}. PARLEZ.`, 1, 'unite', `MISTRAL ${(n % 3) + 2}`));
      n++;
    };
    for (let i = 0; i < 20; i++) {
      chatter();
      step(2);
    }
    const order = 'MISTRAL UN ICI MISTRAL. Barrez la rue, rue Saint-Gilles. PARLEZ.';
    const delays: number[] = [];
    for (let k = 0; k < 6; k++) {
      // (un ordre toutes les 7 à 9 s : deux accusés ne se coupent pas l'un l'autre, voir le test suivant)
      chatter();
      step(2);
      chatter();
      step(2);
      chatter();
      step(2.7 + k * 0.37);
      const t0 = ctx.clock.now;
      ctx.radio.say({ channel: 'commandement', from: 'MISTRAL', priority: 1, text: order, silent: true });
      // l'unité accuse réception 0,3 s plus tard (maneuver.ts : ackAt d'un ordre du joueur)
      step(0.3);
      const ack = `ICI MISTRAL UN. REÇU, je barre la rue, rue Saint-Gilles, compte ${k}. TERMINÉ.`;
      ctx.radio.say({ channel: 'commandement', from: 'MISTRAL 1', priority: 1, text: ack, reply: true });
      for (let i = 0; i < 20; i++) step(0.05);
      const o = aired.filter((a) => a.msg.text === order).pop()!;
      const a = aired.find((x) => x.msg.text === ack);
      expect(o.t).toBeCloseTo(t0, 5);
      expect(a, `accusé ${k} non diffusé`).toBeDefined();
      expect(a!.t).toBeGreaterThanOrEqual(o.t);
      delays.push(a!.t - t0);
      // le sous-titre de l'ordre vient avant celui de l'accusé
      const so = subtitles.filter((s) => s.text === order).pop()!;
      const sa = subtitles.find((s) => s.text === ack)!;
      expect(so.t).toBeLessThanOrEqual(sa.t);
    }
    console.log('délais ordre → accusé (s) :', delays.map((d) => d.toFixed(2)).join(' '));
    for (const d of delays) expect(d).toBeLessThanOrEqual(1.0);
    // la phrase d'ordre est au journal, elle ne passe pas par la voix (événement marqué silent)
    expect(aired.filter((a) => a.msg.text === order).every((a) => a.msg.silent === true)).toBe(true);
  });

  it('deux ordres coup sur coup : le second accusé coupe le premier, qui est redit juste après, devant tout le trafic', async () => {
    const { ctx, step } = await start();
    const aired: { msg: RadioMessage; t: number }[] = [];
    ctx.events.on('radio:message', (e) => aired.push(e));
    for (let i = 0; i < 6; i++) ctx.radio.say(msg(`MISTRAL ICI CENTRAL. Message de la salle numéro ${i}, sans urgence particulière. PARLEZ.`, 1, 'commandement', 'CENTRAL'));
    step(1);
    const a1 = 'ICI MISTRAL UN. REÇU, je tiens la position. TERMINÉ.';
    const a2 = 'ICI MISTRAL DEUX. REÇU, je barre la rue. TERMINÉ.';
    ctx.radio.say({ channel: 'commandement', from: 'MISTRAL 1', priority: 1, text: a1, reply: true });
    step(0.5);
    ctx.radio.say({ channel: 'commandement', from: 'MISTRAL 2', priority: 1, text: a2, reply: true });
    step(20);
    const order = aired.map((a) => a.msg.text).filter((t) => t === a1 || t === a2 || t.includes('numéro'));
    const i1 = order.indexOf(a1);
    expect(order[i1 + 1]).toBe(a2);
    const t1 = aired.find((a) => a.msg.text === a1)!.t;
    const t2 = aired.find((a) => a.msg.text === a2)!.t;
    expect(t2 - t1).toBeCloseTo(0.5, 1);
    // le premier accusé, coupé, est redit avant le trafic de la salle : la salle ne reprend qu'après les deux, plus
    // la redite (le canal est occupé d'autant)
    const firstCentral = aired.find((a) => a.msg.text.includes('numéro 1'))!;
    expect(firstCentral.t).toBeGreaterThanOrEqual(t2 + estimateDuration(a2) + DEFAULT_QUEUE_CONFIG.gap + estimateDuration(a1) - 0.01);
  });

  it('une nouvelle session repart de zéro', async () => {
    const t = createTestContext({ seed: 2, modules: [createSystems] });
    await t.start();
    t.ctx.require<RadioControl>(RADIO_CONTROL_SERVICE).ambient = false;
    t.ctx.radio.say(msg('Message de la première session.'));
    expect(t.ctx.radio.log).toHaveLength(1);
    await t.ctx.session.start({ ...(t.ctx.session.config!), seed: 2 });
    expect(t.ctx.radio.log).toHaveLength(0);
    expect(t.ctx.require<RadioControl>(RADIO_CONTROL_SERVICE).stats.broadcast).toBe(0);
  });
});
