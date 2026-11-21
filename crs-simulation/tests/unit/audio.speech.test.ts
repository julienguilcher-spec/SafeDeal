import { afterEach, describe, expect, it } from 'vitest';
import { AUDIO_DEBUG_SERVICE, createSystems, type AudioDebug } from '@/audio';
import { createFakeContext, type FakeContext } from '@/audio/dev/fakeContext';
import { FakeAudioContext } from '@/audio/dev/fakeWebAudio';
import type { AudioSystem } from '@/audio/system';

class FakeUtterance {
  lang = '';
  voice: { lang: string; name: string } | null = null;
  rate = 1;
  pitch = 1;
  volume = 1;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
}

interface FakeSynth {
  spoken: FakeUtterance[];
  cancelled: number;
  paused: boolean;
  getVoices(): { lang: string; name: string; localService: boolean; default: boolean }[];
  speak(u: FakeUtterance): void;
  cancel(): void;
  pause(): void;
  resume(): void;
  addEventListener(): void;
  removeEventListener(): void;
}

const G = globalThis as unknown as { speechSynthesis?: FakeSynth; SpeechSynthesisUtterance?: typeof FakeUtterance };

function installSynth(langs: string[]): FakeSynth {
  const synth: FakeSynth = {
    spoken: [],
    cancelled: 0,
    paused: false,
    getVoices: () => langs.map((lang, i) => ({ lang, name: 'Voix ' + i, localService: true, default: i === 0 })),
    speak(u) { this.spoken.push(u); },
    cancel() { this.cancelled++; },
    pause() { this.paused = true; },
    resume() { this.paused = false; },
    addEventListener() { /* liste des voix déjà chargée */ },
    removeEventListener() { /* idem */ },
  };
  G.speechSynthesis = synth;
  G.SpeechSynthesisUtterance = FakeUtterance;
  return synth;
}

interface Rig { fake: FakeContext; sys: AudioSystem; debug: AudioDebug; run(s: number): void; has(id: string): boolean }

function rig(): Rig {
  const fake = createFakeContext(false);
  const sys = createSystems()[0] as AudioSystem;
  sys.provide(fake.ctx);
  sys.init(fake.ctx);
  const ac = new FakeAudioContext();
  sys.engine.disabled = false;
  sys.engine.attach(ac.asContext());
  const debug = fake.ctx.require<AudioDebug>(AUDIO_DEBUG_SERVICE);
  return {
    fake, sys, debug,
    run(seconds) {
      for (let t = 0; t < seconds - 1e-9; t += 0.05) {
        ac.advance(0.05);
        sys.frame(0.05);
      }
    },
    has: (id) => debug.voices().some((v) => v.includes(` ${id}`)),
  };
}

const radio = (r: Rig, text: string, voice?: number, priority: 0 | 1 | 2 = 1): void =>
  r.fake.ctx.events.emit('radio:message', { msg: { channel: 'unite', from: 'Alpha', text, priority, voice }, t: 0 });

afterEach(() => {
  delete G.speechSynthesis;
  delete G.SpeechSynthesisUtterance;
});

describe('voix : synthèse vocale et habillage', () => {
  it('message radio : bip, souffle sous la voix française, bip de fin quand la voix se tait', () => {
    const synth = installSynth(['en-US', 'fr-FR', 'fr-CA']);
    const r = rig();
    expect(r.debug.speech()).toMatchObject({ supported: true, frenchVoices: 1 }); // seule la voix de France est retenue
    radio(r, 'Autorité de Alpha 1, en position.');
    r.run(0.1);
    expect(r.has('radio_bip')).toBe(true);
    expect(synth.spoken.length).toBe(0); // la voix attend la fin du bip d'ouverture
    r.run(0.4);
    expect(synth.spoken.length).toBe(1);
    const u = synth.spoken[0]!;
    expect(u.text).toBe('Autorité de Alpha 1, en position.');
    expect(u.voice!.lang).toBe('fr-FR'); // fr-FR préféré aux autres français, jamais une voix étrangère
    expect(u.lang).toBe('fr-FR');
    expect(u.volume).toBeCloseTo(0.8 * 1, 6); // volume général × volume des voix
    expect(r.has('radio_souffle')).toBe(true);
    r.run(1);
    expect(r.has('radio_souffle')).toBe(true); // tant que la voix parle
    u.onend!();
    r.run(0.1);
    expect(r.has('radio_souffle')).toBe(false);
    expect(r.has('radio_fin')).toBe(true);
    r.run(1);
    expect(r.debug.speech().speaking).toBe(false);
  });

  it('plusieurs timbres selon l’indice de voix', () => {
    const synth = installSynth(['fr-FR', 'fr-FR']);
    const r = rig();
    for (let i = 0; i < 6; i++) {
      radio(r, 'Message numéro ' + i, i);
      r.run(0.5);
      synth.spoken[i]!.onend!();
      r.run(0.8);
    }
    expect(synth.spoken.length).toBe(6);
    const timbres = new Set(synth.spoken.map((u) => `${u.voice!.name}|${u.pitch.toFixed(2)}|${u.rate.toFixed(2)}`));
    expect(timbres.size).toBe(6);
    expect(new Set(synth.spoken.map((u) => u.voice!.name)).size).toBe(2);
    for (const u of synth.spoken) {
      expect(u.pitch).toBeGreaterThan(0.5);
      expect(u.pitch).toBeLessThan(1.6);
      expect(u.rate).toBeGreaterThan(0.8);
      expect(u.rate).toBeLessThan(1.3);
    }
  });

  it('à défaut de voix de France, une autre voix française est acceptée', () => {
    const synth = installSynth(['en-GB', 'fr-CA', 'fr-BE']);
    const r = rig();
    expect(r.debug.speech().frenchVoices).toBe(2);
    radio(r, 'Reçu.', 0);
    r.run(0.5);
    expect(synth.spoken[0]!.voice!.lang).toBe('fr-CA');
  });

  it('sans voix française : rien n’est dit, l’habillage seul marque le message', () => {
    const synth = installSynth(['en-US', 'de-DE', 'es-ES']);
    const r = rig();
    expect(r.debug.speech().frenchVoices).toBe(0);
    radio(r, 'Autorité de Alpha 1, en position.');
    r.run(0.5);
    expect(r.has('radio_souffle')).toBe(true);
    r.run(4);
    expect(synth.spoken.length).toBe(0);
    expect(r.debug.speech().speaking).toBe(false);
  });

  it('réglage voiceSynthesis coupé : rien n’est dit, et la parole en cours est annulée', () => {
    const synth = installSynth(['fr-FR']);
    const r = rig();
    radio(r, 'Premier message.');
    r.run(0.5);
    expect(synth.spoken.length).toBe(1);
    r.fake.ctx.settings.set('voiceSynthesis', false);
    expect(synth.cancelled).toBeGreaterThan(0);
    radio(r, 'Second message.');
    r.run(4);
    expect(synth.spoken.length).toBe(1);
  });

  it('sommation : clic et souffle de mégaphone autour de la voix ; voix indistincte seulement sans synthèse', () => {
    const synth = installSynth(['fr-FR']);
    const r = rig();
    const sommation = (): void => r.fake.ctx.events.emit('law:sommation', { stage: 1, byId: 4, x: 0, z: 10, text: 'Obéissance à la loi. Dispersez-vous.' });
    sommation();
    r.run(0.1);
    expect(r.has('megaphone_clic')).toBe(true);
    r.run(0.4);
    expect(synth.spoken.length).toBe(1);
    expect(r.has('megaphone_fond')).toBe(true);
    expect(r.debug.voices().some((v) => / megaphone( |$)/.test(v))).toBe(false);
    // débit ralenti et voix plus grave qu'à la radio
    expect(synth.spoken[0]!.rate).toBeLessThan(1);
    synth.spoken[0]!.onend!();
    r.run(1);
    // sans synthèse : la recette « megaphone » prend le relais
    r.fake.ctx.settings.set('voiceSynthesis', false);
    r.run(2.5);
    sommation();
    r.run(0.2);
    expect(r.debug.voices().some((v) => / megaphone( |$)/.test(v))).toBe(true);
  });

  it('le volume de la voix suit la distance de celui qui parle', () => {
    const synth = installSynth(['fr-FR']);
    const r = rig();
    const say = (z: number, text: string): number => {
      r.fake.ctx.events.emit('law:sommation', { stage: 1, byId: 4, x: 0, z, text });
      r.run(0.6);
      const u = synth.spoken[synth.spoken.length - 1]!;
      u.onend!();
      r.run(1);
      return u.volume;
    };
    const near = say(5, 'Première annonce.');
    const far = say(120, 'Deuxième annonce.');
    expect(near).toBeCloseTo(0.8, 2);
    expect(far).toBeLessThan(near * 0.2);
    expect(far).toBeGreaterThan(0);
  });

  it('un message à la fois ; l’urgent passe devant ceux qui attendent', () => {
    const synth = installSynth(['fr-FR']);
    const r = rig();
    radio(r, 'Message un.');
    r.run(0.05); // le premier message est pris en charge
    radio(r, 'Message deux.');
    radio(r, 'Message trois.');
    radio(r, 'Urgent !', 0, 2);
    r.run(0.5);
    expect(synth.spoken.map((u) => u.text)).toEqual(['Message un.']);
    r.run(2);
    expect(synth.spoken.length).toBe(1); // le deuxième attend la fin du premier
    const order: string[] = [];
    for (let i = 0; i < 4; i++) {
      const u = synth.spoken[i]!;
      order.push(u.text);
      u.onend!();
      r.run(1.2);
    }
    expect(order).toEqual(['Message un.', 'Urgent !', 'Message deux.', 'Message trois.']);
  });

  it('file pleine : les messages d’ambiance sont abandonnés, jamais les urgents', () => {
    const synth = installSynth(['fr-FR']);
    const r = rig();
    radio(r, 'En cours.');
    r.run(0.5);
    radio(r, 'Normal A.');
    radio(r, 'Normal B.');
    radio(r, 'Ambiance.', 0, 0); // file déjà à 2 : écarté
    radio(r, 'Normal C.');
    radio(r, 'Normal D.');
    radio(r, 'Urgent !', 0, 2);
    expect(r.debug.speech().queued).toBe(4);
    const texts: string[] = [];
    for (let i = 0; i < 5; i++) {
      const u = synth.spoken[i]!;
      texts.push(u.text);
      u.onend!();
      r.run(1.2);
    }
    expect(texts[0]).toBe('En cours.');
    expect(texts[1]).toBe('Urgent !');
    expect(texts).not.toContain('Ambiance.');
  });

  it('garde-fou : si le navigateur ne signale jamais la fin, la file repart d’elle-même', () => {
    const synth = installSynth(['fr-FR']);
    const r = rig();
    radio(r, 'Bref.');
    radio(r, 'Suivant.');
    r.run(0.5);
    expect(synth.spoken.length).toBe(1);
    r.run(12);
    expect(synth.spoken.map((u) => u.text)).toEqual(['Bref.', 'Suivant.']);
    expect(synth.cancelled).toBeGreaterThan(0);
  });

  it('pause de session : la voix se fige puis reprend', () => {
    const synth = installSynth(['fr-FR']);
    const r = rig();
    radio(r, 'Message.');
    r.run(0.5);
    r.fake.ctx.session.pause(true);
    expect(synth.paused).toBe(true);
    r.run(30); // rien n'avance pendant la pause, pas même le garde-fou
    expect(r.debug.speech().speaking).toBe(true);
    r.fake.ctx.session.pause(false);
    expect(synth.paused).toBe(false);
  });

  it('speak() du contrat : voix simple sans habillage, radio avec habillage', () => {
    const synth = installSynth(['fr-FR']);
    const r = rig();
    r.fake.ctx.audio.speak('Bonjour.', { voice: 2 });
    r.run(0.2);
    expect(synth.spoken.length).toBe(1);
    expect(r.has('radio_bip')).toBe(false);
    synth.spoken[0]!.onend!();
    r.run(0.5);
    r.fake.ctx.audio.speak('Reçu.', { radio: true, volume: 0.5 });
    r.run(0.1);
    expect(r.has('radio_bip')).toBe(true);
    r.run(0.4);
    expect(synth.spoken[1]!.volume).toBeCloseTo(0.4, 6);
    r.fake.ctx.audio.speak('   ');
    expect(r.debug.speech().queued).toBe(0);
  });
});
