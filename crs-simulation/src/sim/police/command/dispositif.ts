/* =====================================================================================
 * COMMANDEMENT — le dispositif d'une compagnie : conception (emplacements, poste de commandement,
 * éléments de manœuvre), mise en place, fermetures de rues en avance du cortège, glissement avec le
 * cortège (barrages dépassés levés, unités reportées en avant). Fonctions sur un Command (command.ts).
 *
 * Articulation (docs/research/06-roles-jouables.md §4.2, bible §E) : les sections de manœuvre
 * tiennent les débouchés latéraux du parcours (canalisation), fractionnées en groupes quand il y a
 * plus de débouchés que de sections ; la dernière section est la réserve, au poste de commandement.
 * ===================================================================================== */

import type { Squad } from '@/core/contracts';
import type { Post } from './api';
import type { Command, Element } from './command';
import { planPosts } from './plan';
import * as TX from './texts';

/** Allure d'une unité qui rejoint un emplacement en colonne (m/s) et allure moyenne d'un cortège (m/s). */
const MARCH_SPEED = 1.2;
const CORTEGE_SPEED = 0.7;

/** Emplacement du dispositif actif à cet instant (devant la queue, dans l'horizon de la tête). */
export function isActive(cmd: Command, post: Post): boolean {
  const pic = cmd.pic;
  if (post.state === 'leve') return false;
  if (!pic.active || pic.route.length < 4) return true;
  const horizon = cmd.core.tuning.horizon * (0.5 + 0.5 * cmd.state.aptitude);
  return post.s >= pic.tailS - 30 && post.s <= pic.headS + horizon;
}

export function plan(cmd: Command): void {
  const core = cmd.core;
  const pic = cmd.pic;
  const cfg = core.ctx.session.config;
  // poste de commandement : là où se trouve la compagnie à la prise de commandement
  const chief = cmd.commander();
  if (core.centerOf(cmd.squad.id)) {
    cmd.pcX = core.v2.x;
    cmd.pcZ = core.v2.z;
  } else if (chief) {
    cmd.pcX = chief.x;
    cmd.pcZ = chief.z;
  }
  if (pic.route.length >= 2) {
    cmd.gx = pic.route[0];
    cmd.gz = pic.route[1];
  } else if (cfg && cfg.x !== undefined && cfg.z !== undefined) {
    cmd.gx = cfg.x;
    cmd.gz = cfg.z;
  } else {
    cmd.gx = cmd.pcX;
    cmd.gz = cmd.pcZ;
  }
  planPosts(core, pic, cmd.gx, cmd.gz, cmd.posts);
  settlePost(cmd);
  cmd.pcH = Math.atan2(cmd.gx - cmd.pcX, cmd.gz - cmd.pcZ);
  cmd.routeN = pic.route.length;
  cmd.planned = true;
  let active = 0;
  for (let i = 0; i < cmd.posts.length; i++) if (isActive(cmd, cmd.posts[i])) active++;
  const secs: Squad[] = [];
  cmd.sections(secs);
  // fractionnement en groupes quand il y a plus de débouchés que de sections de manœuvre (un bon chef le fait)
  cmd.buildElements(cmd.state.aptitude >= 0.4 && active > Math.max(1, secs.length - 1));
}

/**
 * Le poste de commandement (et la réserve) ne se tient jamais sur le parcours déclaré : s'il s'y trouve, il
 * est reporté dans la rue latérale la plus proche, 25 m derrière l'emplacement du barrage.
 */
export function settlePost(cmd: Command): void {
  const pic = cmd.pic;
  if (pic.route.length < 4) return;
  const s = pic.routeAbscissa(cmd.pcX, cmd.pcZ);
  if (cmd.core.v3.y > 20) return;
  let best: Post | null = null;
  let bestD = Infinity;
  for (let i = 0; i < cmd.posts.length; i++) {
    const p = cmd.posts[i];
    if (p.kind !== 'barrage' || p.width > 30) continue;
    const d = Math.hypot(p.x - cmd.pcX, p.z - cmd.pcZ) + (p.s < s - 60 ? 200 : 0);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  if (!best) return;
  const v = cmd.core.v2;
  v.x = best.x - Math.sin(best.heading) * 25;
  v.z = best.z - Math.cos(best.heading) * 25;
  cmd.core.ctx.world.resolveCircle(v, 1);
  cmd.pcX = v.x;
  cmd.pcZ = v.z;
}

// ───────────────────────────── dispositif ─────────────────────────────

export function freeElements(cmd: Command, out: Element[]): void {
  out.length = 0;
  for (let i = 0; i < cmd.elements.length; i++) {
    const el = cmd.elements[i];
    if (el.role === 'libre' && el.task === '' && !el.pending) out.push(el);
  }
  out.sort((a, b) => b.size - a.size || a.squadId - b.squadId);
}

/** Confie un emplacement à un élément. */
export function assign(cmd: Command, el: Element, post: Post): void {
  const core = cmd.core;
  const chief = cmd.commander();
  el.role = 'poste';
  el.post = post;
  post.squadId = el.squadId;
  post.state = 'ordonne';
  cmd.ordered++;
  if (post.kind === 'site') {
    cmd.order(el, 'dispositif', { type: 'proteger', x: post.x, z: post.z, heading: post.heading, width: post.width }, TX.orderSite(el.name, cmd.squad.name, post.name));
    return;
  }
  let cut = false;
  if (core.traffic && !post.pedestrian && post.closureId === 0) {
    const c = core.traffic.closeRoad(post.x, post.z, chief ? chief.id : 0, el.squadId);
    if (c) {
      post.closureId = c.id;
      cmd.state.closuresAsked++;
      cut = true;
    }
  }
  cmd.order(el, 'dispositif', { type: 'ligne', x: post.x, z: post.z, heading: post.heading, width: 0 }, TX.orderBarrage(el.name, cmd.squad.name, post.name, post.heading, cut));
}

/**
 * L'élément peut-il tenir utilement cet emplacement ? Non s'il n'y arriverait qu'après le passage de la
 * queue du cortège (temps de marche en colonne contre temps de défilement).
 */
export function worth(cmd: Command, el: Element, post: Post): boolean {
  const core = cmd.core;
  const pic = cmd.pic;
  if (!pic.active || pic.route.length < 4 || post.kind !== 'barrage') return true;
  if (!core.centerOf(el.squadId)) return true;
  const travel = (Math.hypot(core.v2.x - post.x, core.v2.z - post.z) * 1.3) / MARCH_SPEED;
  // au rassemblement, l'heure du départ n'est pas connue : on compte une minute de plus
  const wait = pic.phase === 'rassemblement' ? 60 : 0;
  const useful = wait + (post.s + core.tuning.liftBehind - pic.tailS) / CORTEGE_SPEED;
  return travel < useful;
}

/** Élément libre le mieux placé pour un emplacement (le plus proche qui y arrive à temps). */
export function pick(cmd: Command, free: Element[], post: Post): Element | null {
  const core = cmd.core;
  let best: Element | null = null;
  let bestD = Infinity;
  for (let i = 0; i < free.length; i++) {
    const el = free[i];
    if (el.role !== 'libre' || !worth(cmd, el, post)) continue;
    const d = core.centerOf(el.squadId) ? Math.hypot(core.v2.x - post.x, core.v2.z - post.z) : 0;
    // un front large revient à un élément étoffé
    const cost = d - (post.width > 20 ? el.size * 6 : 0);
    if (cost < bestD) {
      bestD = cost;
      best = el;
    }
  }
  return best;
}

/** Mise en place du dispositif : les emplacements actifs les plus importants d'abord, chacun à l'élément le mieux placé. */
export function deployAll(cmd: Command): void {
  const core = cmd.core;
  const free: Element[] = [];
  freeElements(cmd, free);
  const wanted: Post[] = [];
  for (let i = 0; i < cmd.posts.length; i++) {
    const p = cmd.posts[i];
    if (p.state === 'prevu' && isActive(cmd, p)) wanted.push(p);
  }
  // un chef médiocre place ses unités dans l'ordre où les rues se présentent ; un bon chef pèse l'importance
  if (cmd.state.aptitude >= 0.35) wanted.sort((a, b) => b.importance - a.importance || a.s - b.s);
  for (let i = 0; i < wanted.length; i++) {
    const el = pick(cmd, free, wanted[i]);
    if (el) assign(cmd, el, wanted[i]);
  }
  // la réserve tient le poste de commandement
  const res = cmd.element(cmd.state.reserveId);
  if (res && res.lastType === '') {
    cmd.order(res, 'dispositif', { type: 'tenir', x: cmd.pcX, z: cmd.pcZ, heading: cmd.pcH, width: 0 }, TX.orderReserve(res.name, cmd.squad.name, core.sector(cmd.pcX, cmd.pcZ)));
  }
  // les groupes de commandement des sections fractionnées suivent leur groupe d'appui
  for (let i = 0; i < cmd.supports.length; i++) {
    const sup = cmd.supports[i];
    if (sup.ordered || sup.followId === 0) continue;
    sup.ordered = true;
    core.issue(sup.squadId, { type: 'suivre', targetId: sup.followId, width: 0, issuedBy: cmd.issuer() });
  }
  closures(cmd);
}

/** Rues latérales sans unité : fermées à la circulation par barrières, en avance du cortège. */
export function closures(cmd: Command): void {
  const core = cmd.core;
  const pic = cmd.pic;
  const traffic = core.traffic;
  if (!traffic) return;
  const chief = cmd.commander();
  const look = 60 + 240 * cmd.state.aptitude;
  for (let i = 0; i < cmd.posts.length; i++) {
    const p = cmd.posts[i];
    if (p.kind !== 'barrage' || p.state !== 'prevu' || p.pedestrian || p.closureId !== 0) continue;
    if (pic.active && pic.route.length >= 4 && (p.s < pic.tailS - 30 || p.s > pic.headS + look)) continue;
    const key = 'fermeture:' + i;
    if (!cmd.ready(key, 120)) continue;
    const ahead = pic.active && p.s > pic.headS;
    cmd.act(key, 1, p.x, p.z, TX.propose('débouché ' + (p.name || 'latéral') + ' ouvert à la circulation', 'de le fermer par barrières'), () => {
      const c = traffic.closeRoad(p.x, p.z, chief ? chief.id : 0);
      if (!c) return;
      p.closureId = c.id;
      p.state = 'barrieres';
      cmd.state.closuresAsked++;
      const text = TX.roadClosed(cmd.squad.name, p.name, ahead);
      cmd.say(text);
      core.decide(cmd.squad.id, 'fermeture', text, 0, '', p.x, p.z);
    });
  }
}

export function lift(cmd: Command, post: Post): void {
  const core = cmd.core;
  if (post.closureId !== 0 && core.traffic) core.traffic.open(post.closureId);
  post.closureId = 0;
  const el = post.squadId !== 0 ? cmd.element(post.squadId) : null;
  post.squadId = 0;
  post.state = 'leve';
  if (el && el.post === post) {
    el.post = null;
    el.role = 'libre';
    el.inPlace = false;
  }
}

/** Le dispositif glisse avec le cortège : barrages dépassés levés, unités reportées en avant. */
export function slide(cmd: Command): void {
  const core = cmd.core;
  const pic = cmd.pic;
  const moving = pic.active && pic.route.length >= 4;
  if (moving) {
    const behind = core.tuning.liftBehind;
    for (let i = 0; i < cmd.posts.length; i++) {
      const p = cmd.posts[i];
      if (p.kind !== 'barrage' || (p.state !== 'tenu' && p.state !== 'ordonne' && p.state !== 'barrieres')) continue;
      if (pic.tailS > p.s + behind && pic.headS > p.s + behind && cmd.ready('leve:' + i, 30)) {
        const el = p.squadId !== 0 ? cmd.element(p.squadId) : null;
        if (el && el.task !== '') continue;
        cmd.act('leve:' + i, 0, p.x, p.z, TX.propose('la queue du cortège a dépassé ' + (p.name || 'le barrage'), 'de lever le barrage'), () => lift(cmd, p));
      }
    }
  }
  // éléments libres : emplacement suivant, sinon retour au poste de commandement comme réserve
  const free: Element[] = [];
  freeElements(cmd, free);
  for (let i = 0; i < free.length; i++) {
    const el = free[i];
    let best: Post | null = null;
    for (let k = 0; k < cmd.posts.length; k++) {
      const p = cmd.posts[k];
      if ((p.state !== 'prevu' && p.state !== 'barrieres') || p.squadId !== 0 || !isActive(cmd, p) || !worth(cmd, el, p)) continue;
      if (moving && p.s < pic.headS - 20 && p.state === 'barrieres') continue;
      if (!best || p.importance - Math.abs(p.s - pic.headS) * 0.004 > best.importance - Math.abs(best.s - pic.headS) * 0.004) best = p;
    }
    const key = 'poste:' + el.squadId;
    if (best) {
      if (!cmd.ready(key, 20)) continue;
      const post = best;
      cmd.act(key, 1, post.x, post.z, TX.propose('débouché ' + (post.name || 'latéral') + ' non tenu', 'd’y placer ' + el.name), () => assign(cmd, el, post));
      // l'emplacement est réservé pour ne pas y envoyer un second élément dans la même réflexion
      if (cmd.ia) continue;
    } else if (core.centerOf(el.squadId) && Math.hypot(core.v2.x - cmd.pcX, core.v2.z - cmd.pcZ) > 45 && cmd.ready('regroupe:' + el.squadId, 60)) {
      cmd.act('regroupe:' + el.squadId, 0, cmd.pcX, cmd.pcZ, TX.propose(el.name + ' est disponible', 'de le garder en réserve au poste de commandement'), () => {
        el.role = 'reserve';
        cmd.order(el, 'reserve', { type: 'colonne', x: cmd.pcX, z: cmd.pcZ, width: 0 }, TX.orderReserve(el.name, cmd.squad.name, core.sector(cmd.pcX, cmd.pcZ)));
      });
    } else if (cmd.ia) {
      el.role = 'reserve';
    }
  }
}
