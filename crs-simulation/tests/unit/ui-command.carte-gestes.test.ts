// Carte de commandement — gestes, clavier et étiquettes (paquet C2) :
//  - pavé tactile du Mac : deux doigts déplacent la carte, pincer zoome ; la molette de souris zoome toujours ;
//  - clavier en mode 'shiftOnly' : flèches seules laissées à l'écran, Maj + flèches = curseur, Entrée jamais lue par la
//    carte (un seul envoi par Entrée) — vérifié sur une vraie MapCanvas (DOM réduit au strict nécessaire) ;
//  - étiquettes des ordres = colonne `tag` du catalogue, jamais le type brut ;
//  - dans une vraie partie (place de la Concorde) : un clic désigne (pile de repères), ne donne jamais d'ordre ; Maj +
//    clic ajoute une de mes unités à Qui ; « Tracer la ligne moi-même » en deux clics ; aperçu : Qui en avant.
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Button, InputDevice, InputState } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as traffic } from '@/sim/traffic';
import { createSystems as crowd } from '@/sim/crowd';
import { createSystems as police } from '@/sim/police';
import { createSystems as items } from '@/sim/items';
import { createSystems as props } from '@/sim/props';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as radio } from '@/gameplay/radio';
import { createSystems as session } from '@/gameplay/session';
import { createSystems as maps } from '@/ui/maps';
import { createSystems as command } from '@/ui/command';
import type { CommandCore } from '@/ui/command';
import { KEY_CURSOR_FAST, KEY_CURSOR_SPEED, cursorAcceptsButton, cursorAxes, cursorWakes } from '@/ui/maps/cursor';
import type { CursorAxes, CursorInput } from '@/ui/maps/cursor';
import { PointerGestures, wheelIntent } from '@/ui/maps/gestures';
import type { GestureHandlers, PointerInfo } from '@/ui/maps/gestures';
import { MapCanvas } from '@/ui/maps/mapCanvas';
import type { MapsRuntime } from '@/ui/maps/runtime';
import { ORDER_TAGS, ORDER_TAGS_PLURAL, orderTag } from '@/ui/maps/overlay-units';
import { MapTransform, NORTH_UP } from '@/ui/maps/transform';
import type { CardPreview, Repere } from '@/ui/command/cardTypes';
import { EXTRA_PLAIN, ORDER_VERBS, TAG_PASSERSBY, verbOf } from '@/ui/command/orders';
import { cardEnvFromCore } from '@/ui/command/reperes';
import { SNAP_PX, TacticalMap } from '@/ui/command/tacticalMap';
import { TacticalState } from '@/ui/command/tacticalState';

// ───────────────────────────── molette et pavé tactile ─────────────────────────────

function wheelRig(): { g: PointerGestures; pans: { dx: number; dy: number }[]; zooms: number[] } {
  const pans: { dx: number; dy: number }[] = [];
  const zooms: number[] = [];
  const h: GestureHandlers = {
    onDragStart: () => 'pan', onDragMove: () => {}, onDragEnd: () => {}, onTap: () => {}, onDoubleTap: () => {},
    onLongPress: () => false, onPan: (dx, dy) => pans.push({ dx, dy }), onZoom: (_x, _y, f) => zooms.push(f),
  };
  return { g: new PointerGestures(h), pans, zooms };
}

describe('carte — molette et pavé tactile (MacBook Air sans souris)', () => {
  it('wheelIntent : deux doigts = déplacer ; pincer (ctrlKey) = zoomer ; cran de souris = zoomer', () => {
    // défilement à deux doigts : petits pas fractionnaires, souvent avec une composante horizontale
    expect(wheelIntent(0, 4.5, false, 0)).toBe('pan');
    expect(wheelIntent(-12, 3, false, 0)).toBe('pan');
    expect(wheelIntent(30, 0, false, 0)).toBe('pan');
    expect(wheelIntent(0, 48, false, 0)).toBe('pan');
    expect(wheelIntent(0, 60.5, false, 0)).toBe('pan');
    // pincement sur le pavé tactile (Safari et Chrome sur Mac le signalent avec ctrlKey)
    expect(wheelIntent(0, -3.2, true, 0)).toBe('zoom');
    expect(wheelIntent(2, 7, true, 0)).toBe('zoom');
    // molette de souris : en lignes (Firefox) ou en pixels entiers ≥ 50 sans dx (Chrome, Safari)
    expect(wheelIntent(0, 3, false, 1)).toBe('zoom');
    expect(wheelIntent(0, 100, false, 0)).toBe('zoom');
    expect(wheelIntent(0, -120, false, 0)).toBe('zoom');
  });

  it('deux doigts : la carte suit les doigts (aucun zoom) ; pincer et molette : zoom dans le bon sens', () => {
    const r = wheelRig();
    r.g.wheel(400, 300, 6, 14.5, false, 0);
    expect(r.zooms).toEqual([]);
    // la vue défile comme une page : le contenu part dans le sens opposé au défilement
    expect(r.pans).toEqual([{ dx: -6, dy: -14.5 }]);
    r.g.wheel(400, 300, 0, -5, true, 0);   // pincer pour écarter
    r.g.wheel(400, 300, 0, 5, true, 0);    // pincer pour resserrer
    r.g.wheel(400, 300, 0, 100, false, 0); // cran vers soi
    r.g.wheel(400, 300, 0, -2, false, 1);  // deux lignes vers le haut (Firefox)
    expect(r.zooms.length).toBe(4);
    expect(r.zooms[0]!).toBeGreaterThan(1);
    expect(r.zooms[1]!).toBeLessThan(1);
    expect(r.zooms[0]! * r.zooms[1]!).toBeCloseTo(1, 9);
    expect(r.zooms[2]!).toBeLessThan(1);
    expect(r.zooms[3]!).toBeGreaterThan(1);
    expect(r.pans.length).toBe(1);
  });
});

// ───────────────────────────── clavier : Maj + flèches seulement ─────────────────────────────

function frame(device: InputDevice, down: Button[] = [], pressed: Button[] = []): CursorInput {
  return { device, moveX: 0, moveY: 0, down: (b) => down.includes(b) || pressed.includes(b), pressed: (b) => pressed.includes(b) };
}
const axes = (): CursorAxes => ({ x: 0, y: 0, speed: 0 });

describe('carte de commandement — curseur à Maj + flèches (mode shiftOnly)', () => {
  it('flèches seules : aucun mouvement ; Maj + flèche : le curseur bouge, à vitesse normale', () => {
    expect(cursorAxes(frame('kbm', ['ui_right']), 560, axes(), 'shiftOnly', false)).toEqual({ x: 0, y: 0, speed: 0 });
    expect(cursorAxes(frame('kbm', ['ui_up', 'ui_left']), 560, axes(), 'shiftOnly', false)).toEqual({ x: 0, y: 0, speed: 0 });
    expect(cursorAxes(frame('kbm', ['ui_right']), 560, axes(), 'shiftOnly', true)).toEqual({ x: 1, y: 0, speed: KEY_CURSOR_SPEED });
    // Maj (touche « courir ») suffit, sans paramètre explicite
    const m = cursorAxes(frame('kbm', ['ui_down', 'sprint']), 560, axes(), 'shiftOnly');
    expect(m).toEqual({ x: 0, y: -1, speed: KEY_CURSOR_SPEED });
    // mode libre (plan de Paris) inchangé : Maj accélère
    expect(cursorAxes(frame('kbm', ['ui_down', 'sprint']), 560, axes()).speed).toBe(KEY_CURSOR_SPEED * KEY_CURSOR_FAST);
    // la manette garde son stick dans les deux modes
    const pad: CursorInput = { ...frame('gamepad'), moveX: 0.5, moveY: 1 };
    expect(cursorAxes(pad, 560, axes(), 'shiftOnly')).toEqual({ x: 0.5, y: 1, speed: 560 });
  });

  it('Entrée et le A de la manette ne réveillent pas le curseur et ne sont jamais son bouton', () => {
    expect(cursorWakes(frame('kbm', [], ['ui_accept']), axes(), 'shiftOnly')).toBe(false);
    expect(cursorWakes(frame('gamepad', [], ['ui_accept']), axes(), 'shiftOnly')).toBe(false);
    expect(cursorWakes(frame('kbm', [], ['ui_accept']), axes(), 'free')).toBe(true);
    expect(cursorAcceptsButton('shiftOnly')).toBe(false);
    expect(cursorAcceptsButton('free')).toBe(true);
  });
});

// une vraie MapCanvas sur un DOM réduit : éléments factices, pas de canevas 2D (rien n'est dessiné)
function fakeEl(): Record<string, unknown> {
  return {
    style: {}, dataset: {}, className: '', tabIndex: 0, clientWidth: 800, clientHeight: 600,
    classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
    append: () => {}, appendChild: () => {}, remove: () => {}, addEventListener: () => {}, removeEventListener: () => {},
    getContext: () => null, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    setPointerCapture: () => {}, focus: () => {},
  };
}

function input(device: InputDevice, down: Button[] = [], pressed: Button[] = []): InputState {
  return {
    device, moveX: 0, moveY: 0, lookX: 0, lookY: 0, throttle: 0, brake: 0,
    down: (b: Button) => down.includes(b) || pressed.includes(b), pressed: (b: Button) => pressed.includes(b),
  } as unknown as InputState;
}

function mapRig(mode: 'free' | 'shiftOnly'): { map: MapCanvas; taps: string[]; hovers: string[] } {
  const doc = { createElement: () => fakeEl(), activeElement: null as unknown };
  vi.stubGlobal('document', doc);
  vi.stubGlobal('window', { addEventListener: () => {}, removeEventListener: () => {}, devicePixelRatio: 1 });
  const runtime = {
    ctx: { world: { bounds: { minX: -5000, minZ: -5000, maxX: 5000, maxZ: 5000 }, edge: () => null } },
    basemap: () => ({ draw: () => {} }), gps: { route: [], target: null }, time: 0, scene: {}, use: () => {},
  } as unknown as MapsRuntime;
  const map = new MapCanvas(runtime, fakeEl() as unknown as HTMLElement);
  map.view.setSize(800, 600);
  map.keyCursor = mode;
  doc.activeElement = map.canvas;
  const taps: string[] = [];
  const hovers: string[] = [];
  map.handlers = {
    onTap: (x, y, info) => taps.push(`${info.kind} ${Math.round(x)},${Math.round(y)}`),
    onHover: (_x, _y, source) => hovers.push(source),
  };
  return { map, taps, hovers };
}

describe('MapCanvas en mode shiftOnly (vraie carte, DOM réduit)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('une Entrée au clavier ne produit aucun geste ; les flèches seules ne bougent pas le curseur', () => {
    const { map, taps } = mapRig('shiftOnly');
    map.setCursor(300, 200);
    for (let i = 0; i < 4; i++) map.updatePad(0.016, input('kbm', ['ui_accept'], i === 0 ? ['ui_accept'] : []));
    for (let i = 0; i < 4; i++) map.updatePad(0.016, input('kbm'));
    expect(taps).toEqual([]);
    // A de la manette : laissé à l'écran lui aussi
    map.updatePad(0.016, input('gamepad', ['ui_accept'], ['ui_accept']));
    map.updatePad(0.016, input('gamepad'));
    expect(taps).toEqual([]);
    // flèche seule : le curseur reste où l'écran l'a posé
    for (let i = 0; i < 10; i++) map.updatePad(0.05, input('kbm', ['ui_right']));
    expect(map.cursorX).toBe(300);
    expect(map.cursorY).toBe(200);
  });

  it('Maj + flèche : le curseur bouge (survol « curseur », jamais « pointeur »)', () => {
    const { map, hovers } = mapRig('shiftOnly');
    map.setCursor(300, 200);
    for (let i = 0; i < 10; i++) map.updatePad(0.05, input('kbm', ['ui_right', 'sprint']));
    expect(map.cursorX).toBeCloseTo(300 + KEY_CURSOR_SPEED * 0.5, 3);
    expect(map.cursorY).toBe(200);
    expect(hovers.length).toBeGreaterThan(0);
    expect(hovers.every((h) => h === 'cursor')).toBe(true);
  });

  it('mode libre (plan de Paris) : Entrée reste le bouton du curseur (témoin)', () => {
    const { map, taps } = mapRig('free');
    map.updatePad(0.016, input('kbm', ['ui_accept'], ['ui_accept']));
    map.updatePad(0.016, input('kbm'));
    expect(taps).toEqual(['pad 400,300']);
  });

  it('setCursor : le réticule se pose ; hors de la vue, la carte se déplace pour le montrer', () => {
    const { map } = mapRig('shiftOnly');
    map.view.setMpp(1);
    map.view.setCenter(0, 0);
    map.setCursor(120, 80);
    expect(map.cursorOn).toBe(true);
    expect([map.cursorX, map.cursorY]).toEqual([120, 80]);
    expect([map.view.cx, map.view.cz]).toEqual([0, 0]);
    // point à 1 000 px à droite : la vue s'y porte, le curseur revient au milieu
    map.setCursor(1400, 300);
    expect(map.cursorX).toBe(400);
    expect(map.cursorY).toBe(300);
    expect(Math.hypot(map.view.cx, map.view.cz)).toBeCloseTo(1000, 3);
  });
});

// ───────────────────────────── étiquettes des ordres ─────────────────────────────

describe('étiquettes des ordres sur la carte', () => {
  it('ORDER_TAGS = la colonne `tag` du catalogue, pour chaque ordre ; retour_poste compris', () => {
    for (const v of ORDER_VERBS) {
      expect(ORDER_TAGS[v.type], v.type).toBe(verbOf(v.type)!.tag);
      expect(ORDER_TAGS_PLURAL[v.type], v.type).toBeTruthy();
      expect(orderTag(v.type)).toBe(v.tag);
    }
    expect(ORDER_TAGS['retour_poste']).toBe(EXTRA_PLAIN['retour_poste']!.tag);
    expect(Object.keys(ORDER_TAGS).sort()).toEqual(Object.keys(ORDER_TAGS_PLURAL).sort());
    expect(Object.keys(ORDER_TAGS).length).toBe(ORDER_VERBS.length + 1);
  });

  it('passants admis, pluriel ; ordre inconnu : rien (jamais le type brut en majuscules)', () => {
    expect(orderTag('couper_circulation', -2)).toBe(TAG_PASSERSBY);
    expect(orderTag('couper_circulation', -2, true)).toBe('BARRENT (PASSANTS)');
    expect(orderTag('couper_circulation', 0, true)).toBe('BARRENT');
    expect(orderTag('ordre_inconnu')).toBe('');
    expect(orderTag('ordre_inconnu', 0, true)).toBe('');
    for (const t of [...Object.values(ORDER_TAGS), ...Object.values(ORDER_TAGS_PLURAL)]) {
      expect(t).not.toMatch(/_/);
      expect(t.length).toBeLessThanOrEqual(24);
      expect(t).toBe(t.toLocaleUpperCase('fr-FR'));
    }
  });
});

// ───────────────────────────── vraie partie : désigner, jamais ordonner ─────────────────────────────

const MODULES = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, session, maps, command];
const MEANS = { sections: 3, fourgons: 9, centaure: 1, canon_eau: 1, bravm: 1, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };
const LEFT: PointerInfo = { button: 0, shift: false, ctrl: false, kind: 'mouse' };

async function concorde() {
  const t = createTestContext({ seed: 21, strict: false, modules: MODULES });
  await t.start({
    mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place de la Concorde', x: -10, z: 15,
    crowdSize: 300, tension: 0.4, volatility: 0.3, duration: 'standard', extra: { moyens: MEANS, variante: 'terrain' },
  } as never);
  t.step(3);
  const core = t.ctx.service<CommandCore>('ui.command')!;
  const state = new TacticalState();
  // la carte réduite à sa vue : la carte tactique ne lit que la vue, les gestionnaires et les options du calque
  const view = new MapTransform();
  view.up = NORTH_UP;
  view.setSize(900, 700);
  view.setMpp(0.6);
  const fakeMap = {
    handlers: {}, view, overlay: {} as Record<string, unknown>, cursorOn: false, cursorX: 0, cursorY: 0,
    worldAt: (x: number, y: number, out: { x: number; z: number }) => view.screenToWorld(x, y, out),
    invalidate: () => {},
  };
  const tmap = new TacticalMap(core, fakeMap as unknown as MapCanvas, state);
  return { t, ctx: t.ctx, core, state, view, tmap, fakeMap, h: fakeMap.handlers as MapCanvas['handlers'] };
}

describe('carte de commandement — un clic désigne, n’ordonne jamais (vraie partie, Concorde)', () => {
  it('clic sur une de mes unités : pile de repères (elle d’abord), aucun ordre ; Maj + clic : ajoutée à Qui', async () => {
    const { core, state, view, tmap, h } = await concorde();
    const env = cardEnvFromCore(core);
    const unit = env.units.find((u) => u.mine && u.total > 0 && u.symbol === 'section')!;
    expect(unit).toBeTruthy();
    view.setCenter(unit.x, unit.z);
    const p = view.worldToScreen(unit.x, unit.z, { x: 0, y: 0 });
    const taps: { stack: Repere[]; touch: boolean }[] = [];
    tmap.onRepereTap = (stack, _x, _y, touch) => taps.push({ stack, touch });
    const issued = core.issued.length;
    const orders = env.units.map((u) => core.ctx.squads.get(u.squadId)?.order.issuedAt ?? 0);

    h.onTap!(p.x + 6, p.y - 4, LEFT);
    expect(taps.length).toBe(1);
    expect(taps[0]!.touch).toBe(false);
    expect(taps[0]!.stack[0]!.kind).toBe('unite');
    expect(taps[0]!.stack.some((r) => r.squadId === unit.squadId)).toBe(true);
    // priorité : mes unités avant tout le reste, la rue (s'il y en a une) en dernier
    const kinds = taps[0]!.stack.map((r) => r.kind);
    expect(kinds.lastIndexOf('unite')).toBeLessThan(kinds.indexOf('rue') < 0 ? Infinity : kinds.indexOf('rue'));
    // au doigt, l'accroche est plus large (48 px) : un toucher à 44 px trouve encore l'unité
    h.onTap!(p.x + 44, p.y, { ...LEFT, kind: 'touch' });
    expect(taps.length).toBe(2);
    expect(taps[1]!.touch).toBe(true);
    expect(taps[1]!.stack.some((r) => r.squadId === unit.squadId)).toBe(true);
    // aucun ordre n'est parti
    expect(core.issued.length).toBe(issued);
    expect(env.units.map((u) => core.ctx.squads.get(u.squadId)?.order.issuedAt ?? 0)).toEqual(orders);
    expect(state.selection.size).toBe(0);

    // Maj + clic : l'unité s'ajoute à Qui, la fiche n'est pas rouverte
    h.onTap!(p.x, p.y, { ...LEFT, shift: true });
    expect(taps.length).toBe(2);
    expect(state.selection.has(unit.key)).toBe(true);
    expect(core.issued.length).toBe(issued);
  }, 300000);

  it('clic loin de tout repère : rue nommée sous le point (8 m), sinon pile vide ; survol : pile et position', async () => {
    const { core, view, tmap, h } = await concorde();
    const env = cardEnvFromCore(core);
    // une rue nommée sans foule ni unité autour : rue de Rivoli, loin à l'est de la place
    const road = env.roadAt(env.player!.x + 520, env.player!.z, 60)!;
    expect(road).toBeTruthy();
    view.setCenter(road.x, road.z);
    const p = view.worldToScreen(road.x, road.z, { x: 0, y: 0 });
    let last: Repere[] | null = null;
    tmap.onRepereTap = (stack) => { last = stack; };
    h.onTap!(p.x, p.y, LEFT);
    expect(last).not.toBeNull();
    const rue = last!.find((r) => r.kind === 'rue');
    expect(rue, JSON.stringify(last)).toBeTruthy();
    expect(rue!.name.toLowerCase()).toContain(road.name.toLowerCase().slice(0, 6));
    // le survol suit le pointeur avec la même pile ; le curseur du clavier, lui, ne déclenche pas onRepereHover
    const hovers: { n: number; x: number }[] = [];
    tmap.onRepereHover = (stack, x) => hovers.push({ n: stack.length, x });
    h.onHover!(p.x, p.y, 'pointer');
    h.onHover!(p.x, p.y, 'cursor');
    expect(hovers.length).toBe(1);
    expect(hovers[0]!.n).toBe(last!.length);
    expect(hovers[0]!.x).toBe(p.x);
    expect(SNAP_PX).toBe(40);
  }, 300000);

  it('« Tracer la ligne moi-même » : deux clics posent les deux bouts ; clic droit abandonne ; aucun repère désigné', async () => {
    const { core, view, tmap, h } = await concorde();
    const env = cardEnvFromCore(core);
    view.setCenter(env.player!.x, env.player!.z);
    let taps = 0;
    tmap.onRepereTap = () => { taps++; };
    let ends: number[] | null = null;
    tmap.beginTrace((ax, az, bx, bz) => { ends = [ax, az, bx, bz]; });
    expect(tmap.tracing).toBe(true);
    const a = view.screenToWorld(300, 350, { x: 0, z: 0 });
    const b = view.screenToWorld(380, 350, { x: 0, z: 0 });
    h.onTap!(300, 350, LEFT);
    expect(tmap.traceEnds).toEqual({ ax: a.x, az: a.z });
    expect(ends).toBeNull();
    h.onTap!(380, 350, LEFT);
    expect(ends).toEqual([a.x, a.z, b.x, b.z]);
    expect(tmap.tracing).toBe(false);
    expect(taps).toBe(0);
    // abandon au clic droit
    ends = null;
    tmap.beginTrace((ax, az, bx, bz) => { ends = [ax, az, bx, bz]; });
    h.onTap!(300, 350, LEFT);
    h.onTap!(380, 350, { ...LEFT, button: 2 });
    expect(tmap.tracing).toBe(false);
    expect(ends).toBeNull();
    // au clavier : Entrée au curseur → traceAtScreen
    tmap.beginTrace((ax, az, bx, bz) => { ends = [ax, az, bx, bz]; });
    expect(tmap.traceAtScreen(300, 350)).toBe(false);
    expect(tmap.traceAtScreen(300, 352)).toBe(false); // trop court : on attend un vrai second bout
    expect(tmap.traceAtScreen(390, 350)).toBe(true);
    expect(ends).not.toBeNull();
  }, 300000);

  it('aperçu : les unités de Qui sont mises en avant, les autres estompées ; rien au repos', async () => {
    const { core, tmap, fakeMap, h } = await concorde();
    const env = cardEnvFromCore(core);
    const unit = env.units.find((u) => u.mine && u.total > 0 && u.symbol === 'section')!;
    const preview: CardPreview = {
      kind: 'arrows', x: 0, z: 0, heading: 0, width: 0, radius: 0, label: '', passersby: false, filter: false,
      arrows: [{ squadId: unit.squadId, fromX: unit.x, fromZ: unit.z, toX: 0, toZ: 0, text: 'à pied · 2 min', vehicles: false }],
      segments: [], wind: null, steps: [], service: '',
    };
    tmap.drawCard(preview, null);
    h.beforeDraw!();
    expect([...(fakeMap.overlay['emphasis'] as Set<number>)]).toEqual([unit.squadId]);
    expect(fakeMap.overlay['readOnly']).toBe(false);
    expect(fakeMap.overlay['executant']).toBeNull();
    tmap.drawCard(null, null);
    h.beforeDraw!();
    expect(fakeMap.overlay['emphasis']).toBeNull();
  }, 300000);
});
