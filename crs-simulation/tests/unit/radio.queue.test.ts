import { describe, expect, it } from 'vitest';
import type { GameContext, RadioMessage } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { createSystems } from '@/gameplay/radio';
import type { RadioControl } from '@/gameplay/radio';
import { RADIO_CONTROL_SERVICE } from '@/gameplay/radio';
import { DEFAULT_QUEUE_CONFIG, RadioQueue } from '@/gameplay/radio/queue';
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
