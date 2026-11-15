/* =====================================================================================
 * Faux contexte WebAudio pour les tests unitaires sous Node (hors jeu livré).
 * Ne produit aucun son : il enregistre le graphe et VALIDE chaque appel comme le ferait un
 * navigateur — valeurs finies, instants non négatifs, rampe exponentielle strictement positive,
 * source démarrée une seule fois, connexions vers un nœud ou un paramètre. Une recette qui
 * passe ici ne lèvera pas d'exception de programmation dans un vrai contexte.
 * ===================================================================================== */

function finite(what: string, v: number): void {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new TypeError(`${what} : valeur non finie (${v})`);
}

function time(what: string, t: number): void {
  finite(what, t);
  if (t < 0) throw new RangeError(`${what} : instant négatif (${t})`);
}

export class FakeParam {
  events = 0;
  private v: number;
  constructor(public readonly name: string, value: number) {
    this.v = value;
  }
  get value(): number {
    return this.v;
  }
  set value(v: number) {
    finite(this.name + '.value', v);
    this.v = v;
  }
  setValueAtTime(v: number, t: number): this {
    finite(this.name + '.setValueAtTime', v);
    time(this.name + '.setValueAtTime', t);
    this.v = v;
    this.events++;
    return this;
  }
  linearRampToValueAtTime(v: number, t: number): this {
    finite(this.name + '.linearRamp', v);
    time(this.name + '.linearRamp', t);
    this.v = v;
    this.events++;
    return this;
  }
  exponentialRampToValueAtTime(v: number, t: number): this {
    finite(this.name + '.exponentialRamp', v);
    time(this.name + '.exponentialRamp', t);
    if (!(v > 0)) throw new RangeError(`${this.name}.exponentialRamp : la cible doit être > 0 (${v})`);
    this.v = v;
    this.events++;
    return this;
  }
  setTargetAtTime(v: number, t: number, tau: number): this {
    finite(this.name + '.setTarget', v);
    time(this.name + '.setTarget', t);
    finite(this.name + '.setTarget (constante)', tau);
    if (tau < 0) throw new RangeError(`${this.name}.setTarget : constante de temps négative`);
    this.v = v;
    this.events++;
    return this;
  }
  cancelScheduledValues(t: number): this {
    time(this.name + '.cancel', t);
    return this;
  }
}

export class FakeNode {
  readonly outputs: (FakeNode | FakeParam)[] = [];
  constructor(public readonly context: FakeAudioContext, public readonly kind: string) {
    context.nodes++;
  }
  connect(dest: FakeNode | FakeParam): FakeNode | FakeParam {
    if (!(dest instanceof FakeNode) && !(dest instanceof FakeParam)) throw new TypeError(`${this.kind}.connect : destination invalide`);
    this.outputs.push(dest);
    this.context.connections++;
    return dest;
  }
  disconnect(): void {
    this.outputs.length = 0;
  }
  protected param(name: string, value: number): FakeParam {
    return new FakeParam(this.kind + '.' + name, value);
  }
}

class FakeSource extends FakeNode {
  started = false;
  startAt = -1;
  stopAt = Infinity;
  start(when = 0, offset = 0): void {
    if (this.started) throw new Error(`${this.kind}.start : source déjà démarrée`);
    time(this.kind + '.start', when);
    time(this.kind + '.start (décalage)', offset);
    this.started = true;
    this.startAt = when;
    this.context.started++;
  }
  stop(when = 0): void {
    if (!this.started) throw new Error(`${this.kind}.stop : source jamais démarrée`);
    time(this.kind + '.stop', when);
    this.stopAt = when;
  }
}

export class FakeBuffer {
  readonly duration: number;
  private readonly data: Float32Array[];
  constructor(public readonly numberOfChannels: number, public readonly length: number, public readonly sampleRate: number) {
    if (!(length > 0) || !(sampleRate >= 3000)) throw new RangeError('createBuffer : dimensions invalides');
    this.duration = length / sampleRate;
    this.data = [];
    for (let c = 0; c < numberOfChannels; c++) this.data.push(new Float32Array(length));
  }
  getChannelData(c: number): Float32Array {
    return this.data[c]!;
  }
}

/** Sous-ensemble de BaseAudioContext utilisé par le module audio. */
export class FakeAudioContext {
  currentTime = 0;
  sampleRate = 44100;
  state = 'running';
  nodes = 0;
  connections = 0;
  started = 0;
  readonly destination: FakeNode;
  /** Tous les nœuds de gain créés (pour inspecter les bus). */
  readonly gains: (FakeNode & { gain: FakeParam })[] = [];
  readonly sources: FakeSource[] = [];

  constructor() {
    this.destination = new FakeNode(this, 'destination');
  }

  /** Vue typée pour le code du module (qui attend un BaseAudioContext). */
  asContext(): BaseAudioContext {
    return this as unknown as BaseAudioContext;
  }

  advance(dt: number): void {
    this.currentTime += dt;
  }

  createGain(): FakeNode & { gain: FakeParam } {
    const n = new FakeNode(this, 'gain') as FakeNode & { gain: FakeParam };
    n.gain = new FakeParam('gain.gain', 1);
    this.gains.push(n);
    return n;
  }

  createOscillator(): FakeSource & { frequency: FakeParam; detune: FakeParam; type: string } {
    const n = new FakeSource(this, 'oscillateur') as FakeSource & { frequency: FakeParam; detune: FakeParam; type: string };
    n.frequency = new FakeParam('oscillateur.frequency', 440);
    n.detune = new FakeParam('oscillateur.detune', 0);
    n.type = 'sine';
    this.sources.push(n);
    return n;
  }

  createBufferSource(): FakeSource & { buffer: FakeBuffer | null; loop: boolean; playbackRate: FakeParam } {
    const n = new FakeSource(this, 'tampon') as FakeSource & { buffer: FakeBuffer | null; loop: boolean; playbackRate: FakeParam };
    n.buffer = null;
    n.loop = false;
    n.playbackRate = new FakeParam('tampon.playbackRate', 1);
    this.sources.push(n);
    return n;
  }

  createBuffer(channels: number, length: number, sampleRate: number): FakeBuffer {
    return new FakeBuffer(channels, length, sampleRate);
  }

  createBiquadFilter(): FakeNode & { type: string; frequency: FakeParam; Q: FakeParam; gain: FakeParam } {
    const n = new FakeNode(this, 'filtre') as FakeNode & { type: string; frequency: FakeParam; Q: FakeParam; gain: FakeParam };
    n.type = 'lowpass';
    n.frequency = new FakeParam('filtre.frequency', 350);
    n.Q = new FakeParam('filtre.Q', 1);
    n.gain = new FakeParam('filtre.gain', 0);
    return n;
  }

  createDelay(max = 1): FakeNode & { delayTime: FakeParam } {
    finite('createDelay', max);
    if (!(max > 0)) throw new RangeError('createDelay : durée maximale invalide');
    const n = new FakeNode(this, 'retard') as FakeNode & { delayTime: FakeParam };
    n.delayTime = new FakeParam('retard.delayTime', 0);
    return n;
  }

  createWaveShaper(): FakeNode & { curve: Float32Array | null } {
    const n = new FakeNode(this, 'conformateur') as FakeNode & { curve: Float32Array | null };
    n.curve = null;
    return n;
  }

  createStereoPanner(): FakeNode & { pan: FakeParam } {
    const n = new FakeNode(this, 'panoramique') as FakeNode & { pan: FakeParam };
    n.pan = new FakeParam('panoramique.pan', 0);
    return n;
  }

  createDynamicsCompressor(): FakeNode & Record<'threshold' | 'knee' | 'ratio' | 'attack' | 'release', FakeParam> {
    const n = new FakeNode(this, 'compresseur') as FakeNode & Record<'threshold' | 'knee' | 'ratio' | 'attack' | 'release', FakeParam>;
    n.threshold = new FakeParam('compresseur.threshold', -24);
    n.knee = new FakeParam('compresseur.knee', 30);
    n.ratio = new FakeParam('compresseur.ratio', 12);
    n.attack = new FakeParam('compresseur.attack', 0.003);
    n.release = new FakeParam('compresseur.release', 0.25);
    return n;
  }

  createAnalyser(): FakeNode & { fftSize: number; frequencyBinCount: number } {
    const n = new FakeNode(this, 'analyseur') as FakeNode & { fftSize: number; frequencyBinCount: number };
    n.fftSize = 2048;
    n.frequencyBinCount = 1024;
    return n;
  }
}
