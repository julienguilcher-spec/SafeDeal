// Voix radio : l'accusé de réception d'un ordre du joueur (drapeau `interrupt`, posé pour RadioMessage.reply) est dit
// tout de suite — il coupe la parole ordinaire en cours, qui est redite une fois après lui — mais jamais un urgent.
import { describe, expect, it } from 'vitest';

import type { Settings } from '@/core/contracts';
import type { AudioEngine } from '@/audio/engine';
import { SpeechQueue } from '@/audio/speech';
import type { SpeechRequest } from '@/audio/speech';

function make(): { q: SpeechQueue; spoken: () => string[]; step: (s: number) => void } {
  const engine = { running: true, lx: 0, lz: 0, play: () => 1, stop: () => undefined } as unknown as AudioEngine;
  const q = new SpeechQueue(engine, () => ({ voiceSynthesis: false } as unknown as Settings));
  const said: string[] = [];
  const view = q as unknown as { current: { text: string; stage: string } | null };
  let last: unknown = null;
  const step = (s: number): void => {
    for (let t = 0; t < s; t += 0.05) {
      q.frame(0.05);
      const cur = view.current;
      if (cur && cur !== last && (cur.stage === 'opening' || cur.stage === 'speaking')) said.push(cur.text);
      last = cur;
    }
  };
  return { q, spoken: () => said, step };
}

const req = (text: string, priority: 0 | 1 | 2 = 1, interrupt = false): SpeechRequest => ({
  text, mode: 'radio', voice: 0, volume: 1, spatial: false, x: 0, y: 0, z: 0, priority, ...(interrupt ? { interrupt: true } : {}),
});

describe('voix radio : accusé de réception prioritaire', () => {
  it('coupe un message ordinaire en cours, passe devant la file, et le message coupé est redit une fois', () => {
    const { q, spoken, step } = make();
    q.enqueue(req('MISTRAL ICI CENTRAL. Point de situation, rien à signaler sur le boulevard. PARLEZ.'));
    q.enqueue(req('MISTRAL ICI MISTRAL TROIS. Rien à signaler. PARLEZ.'));
    step(0.4);
    q.enqueue(req('ICI MISTRAL UN. REÇU, je barre la rue. TERMINÉ.', 1, true));
    step(0.8);
    // l'accusé est dit moins d'une seconde après sa demande (bip de fin de la parole coupée, puis bip d'ouverture)
    expect(spoken()[1]).toBe('ICI MISTRAL UN. REÇU, je barre la rue. TERMINÉ.');
    step(20);
    expect(spoken()).toEqual([
      'MISTRAL ICI CENTRAL. Point de situation, rien à signaler sur le boulevard. PARLEZ.',
      'ICI MISTRAL UN. REÇU, je barre la rue. TERMINÉ.',
      'MISTRAL ICI CENTRAL. Point de situation, rien à signaler sur le boulevard. PARLEZ.',
      'MISTRAL ICI MISTRAL TROIS. Rien à signaler. PARLEZ.',
    ]);
  });

  it('ne coupe pas un urgent : l’accusé passe juste après lui, devant le reste', () => {
    const { q, spoken, step } = make();
    q.enqueue(req('MISTRAL ICI CENTRAL. URGENT. Agent à terre rue de Lyon. PARLEZ.', 2));
    q.enqueue(req('MISTRAL ICI MISTRAL TROIS. Rien à signaler. PARLEZ.'));
    step(0.4);
    q.enqueue(req('ICI FAUCON UN. REÇU, en colonne vers le point. TERMINÉ.', 1, true));
    step(20);
    expect(spoken()).toEqual([
      'MISTRAL ICI CENTRAL. URGENT. Agent à terre rue de Lyon. PARLEZ.',
      'ICI FAUCON UN. REÇU, en colonne vers le point. TERMINÉ.',
      'MISTRAL ICI MISTRAL TROIS. Rien à signaler. PARLEZ.',
    ]);
  });

  it('jamais écarté par une file pleine, ni doublé par les urgents arrivés après lui', () => {
    const { q, spoken, step } = make();
    q.enqueue(req('URGENT un.', 2));
    step(0.1);
    q.enqueue(req('ICI MISTRAL UN. REÇU, je tiens la position. TERMINÉ.', 1, true));
    for (let i = 0; i < 6; i++) q.enqueue(req(`URGENT numéro ${i + 2}.`, 2));
    step(60);
    // dit juste après l'urgent en cours, avant les urgents arrivés après lui
    expect(spoken().slice(0, 2)).toEqual(['URGENT un.', 'ICI MISTRAL UN. REÇU, je tiens la position. TERMINÉ.']);
  });
});
