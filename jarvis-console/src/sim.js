// Simulation de démonstration, transferts entre agents, trafic de fusées, réponses de Jarvis et API publique.
import * as THREE from 'three/webgpu';
import { DEBUG, clamp01, seg, easeInOutCubic, rng, fmtEUR, fmtPct, fmtDuration, data, agentById, HANDOVERS, AGENT_DEFS } from './data.js';
import { BACKEND, clock } from './engine.js';
import { agentsById, agents } from './agents.js';
import { LINK_STYLE, linksByKey, spawnRocket, pathToAgent } from './links.js';
import { cam, focusAgent, focusEcosystem, goOverview, post, buildPost, perf } from './camera.js';
import { askJarvis, delegate, getPrompts, setPrompt, setPrompts, resetPrompts, setLLM, getLLM } from './brain.js';
import { STATE_LABEL, renderMission, renderCosts, renderUsage, renderPipeline, renderValidation, renderLog, renderAlerts, renderMemory, renderAgentsBar, showAgentDetail, renderAll, showAnswer, speakText, openCommand, closeCommand } from './hud.js';

/* ------------------------------------------------------------------ états, transferts, simulation */
const sim = { enabled: !DEBUG.noSim, next: 9.5, nextToggle: 14, external: false };
const handovers = [];
function triggerHandover(fromId, toId) {
  const l = linksByKey[`hand:${fromId}>${toId}`]; if (!l) return false;
  l.handover = { t: 0, launched: 0 }; l.u.alpha.value = LINK_STYLE.hand.alpha; l.u.draw.value = 0; handovers.push(l);
  return true;
}
function updateHandovers(dt) {
  for (let i = handovers.length - 1; i >= 0; i--) {
    const l = handovers[i]; const h = l.handover; h.t += dt;
    const draw = easeInOutCubic(seg(h.t, 0, 0.9)); l.u.draw.value = draw; l.u.flow.value = seg(h.t, 0.4, 1.2) * (1 - seg(h.t, 3.2, 4.2));
    if (h.t > 0.9 && h.launched < 5 && h.t > 0.9 + h.launched * 0.42) { h.launched++; spawnRocket([l], 1, l.handoverFrom.eco.color, 1.0, 0.62, l.handoverTo); }
    l.u.alpha.value = LINK_STYLE.hand.alpha * (1 - seg(h.t, 3.4, 4.6));
    if (h.t > 4.6) { l.handover = null; l.u.draw.value = 0; l.u.flow.value = 0; handovers.splice(i, 1); }
  }
}
const LOG_LINES = {
  handover: ['transmet la maquette validée', 'passe la main avec le dossier complet', 'transfère les éléments pour la suite', 'remet les livrables de l\'étape'],
  start: ['démarre une nouvelle tâche', 'reprend le travail', 'lance l\'analyse'],
  stop: ['termine sa tâche', 'met la tâche en pause', 'clôture l\'étape'],
  wait: ['attend une validation', 'a besoin d\'une consigne'],
};
const pickOne = (arr) => arr[Math.floor(rng() * arr.length)];
function timeLabel() { const now = new Date(); return now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }
function updateSim(dt) {
  if (!sim.enabled || sim.external) return;
  data.mission.elapsed += dt; data.mission.remaining = Math.max(0, data.mission.remaining - dt); data.mission.progress = Math.min(0.99, data.mission.progress + dt * 0.00035);
  let working = 0; data.agents.forEach((a) => { if (a.state === 'working') { working++; a.progress = Math.min(1, (a.progress || 0) + dt * 0.012 * (0.4 + a.load)); if (a.progress >= 1) a.progress = 0; a.cost += dt * 0.00012 * (0.5 + a.load); } });
  data.costs.total += dt * 0.00012 * working; data.usage.input += dt * 34 * working; data.usage.output += dt * 6 * working;
  if (Math.floor(clock.t) % 5 === 0 && Math.floor(clock.t) !== sim.lastRender) { sim.lastRender = Math.floor(clock.t); renderMission(); renderCosts(); renderUsage(); }
  if (clock.t > sim.next) {
    sim.next = clock.t + 7 + rng() * 9;
    const candidates = HANDOVERS.filter(([f]) => agentById(f).state === 'working'); if (candidates.length) { const [f, t] = pickOne(candidates); triggerHandover(f, t); const to = agentById(t); if (to.state === 'idle') { applyAgentPatch(t, { state: 'working', load: 0.5 + rng() * 0.5, task: to.task }); } api.appendLog(f, `${pickOne(LOG_LINES.handover)} à ${to.name}`); }
  }
  if (clock.t > sim.nextToggle) {
    sim.nextToggle = clock.t + 12 + rng() * 14; const a = pickOne(data.agents.filter((x) => !AGENT_DEFS.find((d) => d.id === x.id).leader));
    if (a.state === 'working') { if (rng() < 0.3) { applyAgentPatch(a.id, { state: 'waiting' }); api.appendLog(a.id, pickOne(LOG_LINES.wait)); } else { applyAgentPatch(a.id, { state: 'idle' }); api.appendLog(a.id, pickOne(LOG_LINES.stop)); } }
    else if (a.state === 'idle') { applyAgentPatch(a.id, { state: 'working', load: 0.4 + rng() * 0.6 }); api.appendLog(a.id, pickOne(LOG_LINES.start)); }
    else { applyAgentPatch(a.id, { state: 'working' }); api.appendLog(a.id, 'reprend après validation'); }
  }
}

/* planification des fusées selon l'activité */
function updateTraffic(dt) {
  agents.forEach((a) => {
    const d = a.data; if (d.state !== 'working' || !(a.eco.reveal > 0.9)) { a.nextOut = 0; a.nextIn = 0; return; }
    const load = clamp01(d.load !== undefined ? d.load : 0.5);
    a.nextOut = (a.nextOut || clock.t + rng()) ; a.nextIn = (a.nextIn || clock.t + 1 + rng() * 2);
    if (clock.t >= a.nextOut) { a.nextOut = clock.t + (1.9 - 1.35 * load) * (0.7 + rng() * 0.6); spawnRocket(pathToAgent(a), 1, jarvisColor, 0.9 + load * 0.5, 0.5 + load * 0.45, a); }
    if (clock.t >= a.nextIn) { a.nextIn = clock.t + (4.2 - 2.4 * load) * (0.7 + rng() * 0.6); spawnRocket(pathToAgent(a), -1, a.eco.color, 0.9 + load * 0.4, 0.5 + load * 0.4, a); }
  });
}
const jarvisColor = new THREE.Color(0.82, 0.93, 1.0);

/* ------------------------------------------------------------------ réponses locales de Jarvis */
function localAnswer(q) {
  const s = q.toLowerCase(); const working = data.agents.filter((a) => a.state === 'working'); const waiting = data.agents.filter((a) => a.state === 'waiting');
  if (/co[uû]t|budget|d[ée]pense/.test(s)) return `Le coût actuel est de ${fmtEUR.format(data.costs.total)}, pour un plafond de ${fmtEUR.format(data.costs.cap)} par site. Le budget mensuel est consommé à ${Math.round(data.costs.spent / data.costs.budget * 100)} %.`;
  if (/mission|projet|avancement|progr/.test(s)) return `${data.mission.project} : ${fmtPct(data.mission.progress)} réalisés, étape ${data.mission.step}. Il reste environ ${fmtDuration(data.mission.remaining)}.`;
  if (/valid/.test(s)) return data.validation.length ? `${data.validation.length} validation${data.validation.length > 1 ? 's' : ''} en attente : ${data.validation.map((v) => v.text).join(' ; ')}.` : 'Aucune validation en attente.';
  if (/attente|bloqu/.test(s)) return waiting.length ? `${waiting.map((a) => a.name).join(' et ')} ${waiting.length > 1 ? 'attendent' : 'attend'} une décision de ta part.` : 'Aucun agent n\'est bloqué.';
  if (/studio|shopify/.test(s)) { focusEcosystem('studio'); return 'Je t\'emmène au Studio Shopify.'; }
  if (/kcl|cours|keats/.test(s)) { focusEcosystem('kcl'); return 'Direction la constellation KCL.'; }
  if (/r[ée]dac/.test(s)) { focusEcosystem('redacteur'); return 'Voici le Rédacteur.'; }
  if (/vue d'ensemble|overview|retour|accueil/.test(s)) { goOverview(); return 'Retour à la vue d\'ensemble.'; }
  const found = data.agents.find((a) => s.includes(a.name.toLowerCase())); if (found) { focusAgent(found.id); return `${found.name} : ${STATE_LABEL[found.state].toLowerCase()}. ${found.task}.`; }
  if (/bonjour|salut|hello/.test(s)) return `Bonjour. ${working.length} agents travaillent en ce moment et la mission est à ${fmtPct(data.mission.progress)}.`;
  return `${working.length} agents travaillent, ${waiting.length} ${waiting.length > 1 ? 'attendent' : 'attend'} une validation. La mission est à ${fmtPct(data.mission.progress)}, étape ${data.mission.step}.`;
}

function applyAgentPatch(id, patch = {}) {
  const d = agentById(id); if (!d) return null;
  const prevState = d.state; Object.keys(patch).forEach((k) => { if (k !== 'handoverTo') d[k] = patch[k]; });
    if (patch.handoverTo) triggerHandover(id, patch.handoverTo);
    const a = agentsById[id]; if (a) { if (d.state === 'working' && prevState !== 'working') { a.nextOut = clock.t + 0.3; a.nextIn = clock.t + 2; } }
    if (d.state === 'waiting' && prevState !== 'waiting' && !data.validation.find((v) => v.agent === id)) { data.validation.push({ id: `v-${id}-${Math.floor(clock.t)}`, text: d.task || 'Décision requise', agent: id }); renderValidation(); }
    renderAgentsBar(); if (cam.focus && cam.focus.def.id === id) showAgentDetail(agentsById[id]); if (data.mission.agent === id) renderMission(); renderCosts();
    return d;
}

/* ------------------------------------------------------------------ API publique */
const api = {
  data,
  updateAgent(id, patch = {}) { sim.external = true; return applyAgentPatch(id, patch); },

  updateCosts(total) { if (typeof total === 'number') data.costs.total = total; else if (total && typeof total === 'object') Object.assign(data.costs, total); renderCosts(); },
  updateMission(patch = {}) { Object.assign(data.mission, patch); if (patch.stepIndex !== undefined) data.pipelineIndex = patch.stepIndex; if (patch.step && data.pipeline.includes(patch.step)) data.pipelineIndex = data.pipeline.indexOf(patch.step); renderMission(); renderPipeline(); },
  appendLog(agentId, text) { data.log.push({ agent: agentId, text, time: timeLabel() }); if (data.log.length > 200) data.log.shift(); renderLog(); },
  speak(text) { if (!text) return; showAnswer(text); speakText(text); },
  ask(text) {
    if (!text) return Promise.resolve('');
    api.appendLog(null, `Toi : ${text}`);
    const custom = typeof api.onCommand === 'function' ? api.onCommand(text) : null;
    const p = custom !== null && custom !== undefined ? Promise.resolve(custom) : askJarvis(text);
    return p.then((r) => { const reply = r || ''; if (reply) api.speak(reply); return reply; }).catch((e) => { console.warn(e); const r = localAnswer(text); api.speak(r); return r; });
  },
  delegate(agentId, task) { const r = delegate(agentId, task); if (r) api.speak(r.reply); return r ? r.reply : null; },
  getPrompts, setPrompt, setPrompts, resetPrompts, setLLM, getLLM,
  onCommand: null,
  setAlerts(list) { data.alerts = list || []; renderAlerts(); }, setMemory(list) { data.memory = list || []; renderMemory(); }, setValidation(list) { data.validation = list || []; renderValidation(); },
  focusAgent, focusEcosystem, overview: goOverview, openCommand, closeCommand,
  setSimulation(on) { sim.enabled = !!on; sim.external = !on; },
  setQuality(tier) { buildPost(Math.max(0, Math.min(3, tier | 0))); },
  getFPS() { return Math.round(perf.fps); }, get backend() { return BACKEND; }, get quality() { return post.tier; },
  render: renderAll,
};
window.jarvisConsole = api;

export { sim, handovers, triggerHandover, updateHandovers, updateSim, updateTraffic, jarvisColor, localAnswer, applyAgentPatch, api };
