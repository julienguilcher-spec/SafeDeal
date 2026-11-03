// HUD : lecture holographique sans cadre, légendes HTML, commande vocale, panneaux.
import * as THREE from 'three/webgpu';
import { data, agentById, ECO, fmtEUR, fmtInt, fmtPct, fmtDuration, fmtTokens, $ } from './data.js';
import { camera, clock } from './engine.js';
import { CORE_POS, jarvis } from './core.js';
import { agentsById } from './agents.js';
import { focusAgent } from './camera.js';
import { api, applyAgentPatch } from './sim.js';
import { getPrompts, setPrompt, promptLabel, setLLM, getLLM, MODELS, resetPrompts } from './brain.js';

/* ------------------------------------------------------------------ HUD : lecture holographique, sans cadre */
const hud = $('hud');
const el = {
  date: $('date'), time: $('time'), fps: $('fps'), statusDot: $('status-dot'), statusText: $('status-text'), titleMain: $('title-main'), titleSub: $('title-sub'),
  agentsCount: $('agents-count'), agentsCountLabel: $('agents-count-label'), agentsToggle: $('agents-toggle'), agentsDrop: $('agents-drop'), agentsList: $('agents-list'), agentsAll: $('agents-all'),
  command: $('command'), commandInput: $('command-input'), mic: $('mic'), answer: $('answer'), labels: $('labels'), leaders: $('leaders'),
};
const ECO_CLASS = { studio: 'c-studio', kcl: 'c-kcl', redacteur: 'c-redacteur' };
const STATE_LABEL = { idle: 'Inactif', working: 'En cours', waiting: 'En attente' };

/* horloge, connexion */
const dateFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
function updateClock() { const now = new Date(); const d = dateFmt.format(now); el.date.textContent = d.charAt(0).toUpperCase() + d.slice(1); el.time.textContent = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
setInterval(updateClock, 1000); updateClock();
function updateConnection() { const on = data.connection === 'online' && navigator.onLine !== false; el.statusDot.classList.toggle('off', !on); el.statusText.textContent = on ? 'En ligne' : 'Hors ligne'; }
window.addEventListener('online', updateConnection); window.addEventListener('offline', updateConnection); updateConnection();

/* panneaux : accordéon */
document.querySelectorAll('.panel-head').forEach((btn) => btn.addEventListener('click', () => { const p = btn.parentElement; const wasOpen = p.classList.contains('open'); document.querySelectorAll('.panel.open').forEach((o) => o.classList.remove('open')); if (!wasOpen) p.classList.add('open'); }));
function openPanel(name) { document.querySelectorAll('.panel.open').forEach((o) => o.classList.remove('open')); const p = document.querySelector(`.panel[data-panel="${name}"]`); if (p) p.classList.add('open'); }

function renderMission() {
  const m = data.mission; $('mission-project').textContent = m.project; $('mission-progress').textContent = fmtPct(m.progress); $('mission-gauge').style.width = `${Math.round(m.progress * 100)}%`;
  $('mission-elapsed').textContent = fmtDuration(m.elapsed); $('mission-remaining').textContent = fmtDuration(m.remaining);
  const ag = agentById(m.agent); $('mission-agent').textContent = ag ? ag.name : (m.agent || '—'); $('mission-step').textContent = m.step || '—'; $('mission-summary').textContent = fmtPct(m.progress);
}
function renderPipeline() {
  const list = $('pipeline-list'); list.innerHTML = '';
  data.pipeline.forEach((name, i) => { const li = document.createElement('li'); const st = i < data.pipelineIndex ? 'done' : i === data.pipelineIndex ? 'active' : 'todo'; li.className = st; li.innerHTML = `<span class="idx">${String(i + 1).padStart(2, '0')}</span><span>${name}</span><span class="mark">${st === 'done' ? 'OK' : st === 'active' ? 'EN COURS' : ''}</span>`; list.appendChild(li); });
  $('pipeline-summary').textContent = `${Math.min(data.pipelineIndex + 1, data.pipeline.length)} / ${data.pipeline.length}`;
}
function renderCosts() {
  const c = data.costs; $('costs-total').textContent = fmtEUR.format(c.total); $('costs-cap').textContent = fmtEUR.format(c.cap); $('costs-budget').textContent = `${fmtEUR.format(c.spent)} / ${fmtEUR.format(c.budget)}`;
  const g = $('costs-gauge'); const r = c.spent / c.budget; g.style.width = `${Math.min(100, Math.round(r * 100))}%`; g.classList.toggle('warn', r > 0.85);
  const ul = $('costs-agents'); ul.innerHTML = ''; data.agents.slice().sort((a, b) => b.cost - a.cost).slice(0, 6).forEach((a) => { const li = document.createElement('li'); li.innerHTML = `<span class="n ${ECO_CLASS[a.eco]}">${a.name}</span><span class="c">${fmtEUR.format(a.cost)}</span>`; ul.appendChild(li); });
  $('costs-summary').textContent = fmtEUR.format(c.total);
}
function renderUsage() { const u = data.usage; $('usage-input').textContent = fmtTokens(u.input); $('usage-output').textContent = fmtTokens(u.output); $('usage-sessions').textContent = fmtInt.format(u.sessions); $('usage-tools').textContent = fmtInt.format(u.tools); $('usage-summary').textContent = `${fmtTokens(u.input + u.output)} tokens`; }
function renderPreview() { const p = data.preview; $('preview-status').textContent = p.status; $('preview-url').textContent = p.url; $('preview-updated').textContent = p.updated; $('preview-summary').textContent = p.status; }
function renderDelivery() { const d = data.delivery; $('delivery-date').textContent = d.date; $('delivery-status').textContent = d.status; const ul = $('delivery-items'); ul.innerHTML = ''; d.items.forEach((t) => { const li = document.createElement('li'); li.innerHTML = `<span class="n">${t}</span>`; ul.appendChild(li); }); $('delivery-summary').textContent = d.date; }
function renderValidation() {
  const ul = $('validation-list'); ul.innerHTML = '';
  if (!data.validation.length) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'Rien à valider'; ul.appendChild(li); }
  data.validation.forEach((v) => { const li = document.createElement('li'); const ag = agentById(v.agent); li.innerHTML = `<span>${v.text}</span><span class="acts"><button class="ok" data-id="${v.id}" data-act="ok">Valider</button><button data-id="${v.id}" data-act="no">Refuser</button></span>`; if (ag) li.querySelector('span').innerHTML = `<b class="${ECO_CLASS[ag.eco]}" style="font-weight:400">${ag.name}</b> · ${v.text}`; ul.appendChild(li); });
  ul.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => resolveValidation(b.dataset.id, b.dataset.act === 'ok')));
  $('validation-summary').textContent = data.validation.length ? String(data.validation.length) : '—';
}
function resolveValidation(id, ok) {
  const v = data.validation.find((x) => x.id === id); if (!v) return; data.validation = data.validation.filter((x) => x.id !== id);
  const ag = agentById(v.agent); if (ag && ag.state === 'waiting') applyAgentPatch(ag.id, { state: ok ? 'working' : 'idle', task: ok ? ag.task.replace(/^Attend .*$/, 'Reprend la tâche validée') : 'Tâche refusée, en attente de consigne' });
  api.appendLog(v.agent, ok ? `Validation accordée : ${v.text}` : `Validation refusée : ${v.text}`); renderValidation(); renderAlerts();
}
function renderLog() { const ul = $('live-list'); ul.innerHTML = ''; data.log.slice(-8).reverse().forEach((l) => { const li = document.createElement('li'); const ag = agentById(l.agent); li.innerHTML = `<time>${l.time}</time><span>${ag ? `<b class="${ECO_CLASS[ag.eco]}">${ag.name}</b> · ` : ''}${l.text}</span>`; ul.appendChild(li); }); $('live-summary').textContent = data.log.length ? data.log[data.log.length - 1].time : '—'; }
function renderAlerts() { const ul = $('alerts-list'); ul.innerHTML = ''; if (!data.alerts.length) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'Aucune alerte'; ul.appendChild(li); } data.alerts.forEach((a) => { const li = document.createElement('li'); li.className = a.level === 'info' ? 'info' : ''; li.innerHTML = `<i></i><span>${a.text}</span>`; ul.appendChild(li); }); $('alerts-summary').textContent = data.alerts.length ? String(data.alerts.length) : '—'; }
function renderMemory() { const ul = $('memory-list'); ul.innerHTML = ''; data.memory.forEach((m) => { const li = document.createElement('li'); li.textContent = m; ul.appendChild(li); }); $('memory-summary').textContent = `${data.memory.length} éléments`; }
function showAgentDetail(a) {
  const d = a.data; $('agent-name').textContent = d.name; $('agent-role').textContent = d.role; $('agent-eco').textContent = a.eco.name; const st = $('agent-state'); st.textContent = STATE_LABEL[d.state] || d.state; st.className = `state ${d.state}`;
  $('agent-task').textContent = d.task || '—'; const ul = $('agent-actions'); ul.innerHTML = ''; (d.actions || []).forEach((t) => { const li = document.createElement('li'); li.textContent = t; ul.appendChild(li); }); if (!(d.actions || []).length) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'Aucune action'; ul.appendChild(li); }
  $('agent-cost').textContent = fmtEUR.format(d.cost || 0); $('agent-summary').textContent = d.name;
  $('agent-prompt-label').textContent = promptLabel(d.id); const ta = $('agent-prompt'); ta.value = d.prompt || ''; ta.dataset.agent = d.id; autoGrow(ta); $('agent-prompt-state').textContent = '';
  openPanel('agent');
}
function autoGrow(ta) { ta.style.height = 'auto'; ta.style.height = `${Math.min(220, ta.scrollHeight)}px`; }
function renderJarvisPanel() {
  const ta = $('jarvis-prompt'); if (document.activeElement !== ta) { ta.value = data.jarvisPrompt || ''; autoGrow(ta); }
  const sel = $('llm-model'); if (!sel.options.length) Object.keys(MODELS).forEach((id) => { const o = document.createElement('option'); o.value = id; o.textContent = MODELS[id]; sel.appendChild(o); });
  const st = getLLM(); sel.value = st.model; $('llm-status').textContent = st.configured ? `Connecté à ${st.label} · la clé reste dans ce navigateur` : 'Mode local : réponses et délégation par règles, sans clé';
  $('llm-connect').textContent = st.configured ? 'Déconnecter' : 'Connecter'; $('jarvis-summary').textContent = st.configured ? st.label : 'Mode local';
}
document.addEventListener('DOMContentLoaded', () => {});
(() => {
  const ta = $('agent-prompt'); const jp = $('jarvis-prompt');
  [ta, jp].forEach((t) => { t.addEventListener('input', () => autoGrow(t)); t.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') t.blur(); }); });
  $('agent-prompt-save').addEventListener('click', () => { const id = ta.dataset.agent; if (!id) return; setPrompt(id, ta.value); $('agent-prompt-state').textContent = 'Enregistré'; setTimeout(() => { $('agent-prompt-state').textContent = ''; }, 2500); api.appendLog(id, 'Prompt mis à jour'); });
  $('jarvis-prompt-save').addEventListener('click', () => { setPrompt('jarvis', jp.value); $('jarvis-prompt-state').textContent = 'Enregistré'; setTimeout(() => { $('jarvis-prompt-state').textContent = ''; }, 2500); });
  $('jarvis-prompt-reset').addEventListener('click', () => { resetPrompts(); renderJarvisPanel(); if (ta.dataset.agent) { const a = agentById(ta.dataset.agent); if (a) { ta.value = a.prompt; autoGrow(ta); } } $('jarvis-prompt-state').textContent = 'Prompts par défaut restaurés'; setTimeout(() => { $('jarvis-prompt-state').textContent = ''; }, 2500); });
  $('llm-model').addEventListener('change', (e) => { setLLM({ model: e.target.value }); renderJarvisPanel(); });
  $('llm-key').addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') $('llm-connect').click(); });
  $('llm-connect').addEventListener('click', () => { const st = getLLM(); if (st.configured) { setLLM({ apiKey: '' }); $('llm-key').value = ''; } else { const k = $('llm-key').value.trim(); if (!k) { $('llm-status').textContent = 'Colle d\'abord une clé API Anthropic'; return; } setLLM({ apiKey: k }); $('llm-key').value = ''; } renderJarvisPanel(); });
})();
function renderAgentsBar() {
  const working = data.agents.filter((a) => a.state === 'working'); el.agentsCount.textContent = String(working.length); el.agentsCountLabel.textContent = working.length === 1 ? 'agent actif' : 'agents actifs';
  const showAll = el.agentsAll.checked; const list = showAll ? data.agents : working; el.agentsList.innerHTML = '';
  list.forEach((a) => { const li = document.createElement('li'); li.className = a.state; li.innerHTML = `<span class="dot" style="background:${ECO[a.eco].hex}"></span><span><span class="name" style="color:${a.state === 'idle' ? '' : ECO[a.eco].hex}">${a.name}</span><span class="state-tag">${STATE_LABEL[a.state]}</span><br><span class="task">${a.task || ''}</span></span>`; li.addEventListener('click', () => { closeAgentsDrop(); focusAgent(a.id); }); el.agentsList.appendChild(li); });
  if (!list.length) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'Aucun agent actif'; el.agentsList.appendChild(li); }
}
function closeAgentsDrop() { el.agentsDrop.classList.remove('open'); el.agentsToggle.setAttribute('aria-expanded', 'false'); }
el.agentsToggle.addEventListener('click', () => { const open = !el.agentsDrop.classList.contains('open'); el.agentsDrop.classList.toggle('open', open); el.agentsToggle.setAttribute('aria-expanded', String(open)); });
el.agentsAll.addEventListener('change', renderAgentsBar);
document.addEventListener('pointerdown', (e) => { if (!e.target.closest('#agentsbar')) closeAgentsDrop(); });
function renderAll() { el.titleMain.textContent = data.title; el.titleSub.textContent = data.subtitle; renderMission(); renderPipeline(); renderCosts(); renderUsage(); renderPreview(); renderDelivery(); renderValidation(); renderLog(); renderAlerts(); renderMemory(); renderAgentsBar(); renderJarvisPanel(); }

/* légendes (survol / focus) : HTML net, ligne de rappel, point d'ancrage */
const callouts = { hover: makeCallout(), focus: makeCallout() };
function makeCallout() { const div = document.createElement('div'); div.className = 'callout'; div.innerHTML = '<div class="name"></div><div class="role"></div><div class="meta"></div>'; el.labels.appendChild(div); const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line'); const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line'); const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); dot.setAttribute('r', '2.5'); [line1, line2, dot].forEach((n) => { n.style.opacity = '0'; n.style.transition = 'opacity .2s ease'; el.leaders.appendChild(n); }); return { div, line1, line2, dot, agent: null, rect: null }; }
function setFocusLabel(agent) { callouts.focus.agent = agent; }
const _proj = new THREE.Vector3();
function projectToScreen(v3, out) { _proj.copy(v3).project(camera); out.x = (_proj.x + 1) / 2 * window.innerWidth; out.y = (1 - _proj.y) / 2 * window.innerHeight; out.visible = _proj.z < 1 && _proj.z > -1; return out; }
function layoutCallout(c, other) {
  const a = c.agent; const show = !!a && hud.classList.contains('ready');
  c.div.classList.toggle('show', show); [c.line1, c.line2, c.dot].forEach((n) => { n.style.opacity = show ? '1' : '0'; });
  if (!show) { c.rect = null; return; }
  const anchor = projectToScreen(a.pos.clone().add(new THREE.Vector3(0, 0.32, 0)), {});
  if (!anchor.visible) { c.div.classList.remove('show'); [c.line1, c.line2, c.dot].forEach((n) => { n.style.opacity = '0'; }); c.rect = null; return; }
  const d = a.data; c.div.querySelector('.name').textContent = d.name; c.div.querySelector('.role').textContent = d.role; c.div.querySelector('.role').style.color = a.eco.hex; c.div.querySelector('.meta').textContent = `${STATE_LABEL[d.state]}${d.state !== 'idle' && d.task ? ' · ' + d.task : ''}`;
  const right = anchor.x < window.innerWidth - 420; c.div.classList.toggle('left', !right);
  const kx = anchor.x + (right ? 34 : -34), ky = anchor.y - 34; let lx = kx + (right ? 22 : -22), ly = ky;
  const w = c.div.offsetWidth, h = c.div.offsetHeight;
  ly = Math.max(60, Math.min(window.innerHeight - 40, ly));
  if (right) lx = Math.min(lx, window.innerWidth - (hud.classList.contains('ready') ? 360 : 20) - w); else lx = Math.max(lx, 20 + w);
  let rect = { x: right ? lx : lx - w, y: ly - h / 2, w, h };
  if (other && other.rect && !(rect.x > other.rect.x + other.rect.w || rect.x + rect.w < other.rect.x || rect.y > other.rect.y + other.rect.h || rect.y + rect.h < other.rect.y)) { ly = other.rect.y + other.rect.h + 18 + h / 2; rect = { ...rect, y: ly - h / 2 }; }
  c.rect = rect; c.div.style.transform = `translate(${right ? lx : lx}px, ${ly}px) translate(${right ? 0 : -100}%, -50%)`;
  c.dot.setAttribute('cx', anchor.x); c.dot.setAttribute('cy', anchor.y);
  c.line1.setAttribute('x1', anchor.x); c.line1.setAttribute('y1', anchor.y); c.line1.setAttribute('x2', kx); c.line1.setAttribute('y2', ly);
  c.line2.setAttribute('x1', kx); c.line2.setAttribute('y1', ly); c.line2.setAttribute('x2', right ? lx - 8 : lx + 8); c.line2.setAttribute('y2', ly);
}
function updateLabels(hoverTarget) { layoutCallout(callouts.focus, null); const h = hoverTarget && hoverTarget.type === 'agent' && hoverTarget.agent !== callouts.focus.agent ? hoverTarget.agent : null; callouts.hover.agent = h; layoutCallout(callouts.hover, callouts.focus); }

/* commande : « Parle à Jarvis » */
const uiState = { commandOpen: false };
function openCommand() { uiState.commandOpen = true; el.command.classList.add('open'); el.commandInput.focus(); requestAnimationFrame(() => el.commandInput.focus()); setTimeout(() => el.commandInput.focus(), 60); }
function closeCommand() { uiState.commandOpen = false; el.command.classList.remove('open'); el.commandInput.blur(); stopListening(); }
el.commandInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const txt = el.commandInput.value.trim(); if (txt) { el.commandInput.value = ''; api.ask(txt); } } });
let answerTimer = 0;
function showAnswer(text) { el.answer.textContent = text; el.answer.classList.add('show'); clearTimeout(answerTimer); answerTimer = setTimeout(() => el.answer.classList.remove('show'), 6500); }
function speakText(text) {
  jarvis.speakUntil = clock.t + Math.min(14, 1.2 + text.length * 0.065);
  if (!('speechSynthesis' in window)) return;
  try { window.speechSynthesis.cancel(); const ut = new SpeechSynthesisUtterance(text); ut.lang = 'fr-FR'; ut.rate = 1.0; ut.pitch = 0.95; const voices = window.speechSynthesis.getVoices(); const fr = voices.find((v) => /fr/i.test(v.lang) && /google|thomas|audrey|amelie|premium|enhanced/i.test(v.name)) || voices.find((v) => /fr/i.test(v.lang)); if (fr) ut.voice = fr; ut.onend = () => { jarvis.speakUntil = Math.min(jarvis.speakUntil, clock.t + 0.3); }; window.speechSynthesis.speak(ut); } catch (_) {}
}
const SR = window.SpeechRecognition || window.webkitSpeechRecognition; let recog = null;
if (!SR) { el.mic.disabled = true; el.mic.title = 'Reconnaissance vocale indisponible dans ce navigateur'; }
function stopListening() { if (recog) { try { recog.stop(); } catch (_) {} recog = null; } el.mic.classList.remove('live'); }
el.mic.addEventListener('click', () => { if (!SR) return; if (recog) { stopListening(); return; } recog = new SR(); recog.lang = 'fr-FR'; recog.interimResults = true; recog.onresult = (ev) => { let txt = ''; for (const r of ev.results) txt += r[0].transcript; el.commandInput.value = txt; if (ev.results[ev.results.length - 1].isFinal) { stopListening(); el.commandInput.value = ''; api.ask(txt.trim()); } }; recog.onend = () => stopListening(); recog.onerror = () => stopListening(); el.mic.classList.add('live'); recog.start(); });
function positionCommand() {
  const p = projectToScreen(CORE_POS.clone().add(new THREE.Vector3(0, 0.2, 0)), {}); const edge = projectToScreen(CORE_POS.clone().add(new THREE.Vector3(2.6, 0.2, 0)), {});
  const r = Math.max(60, Math.abs(edge.x - p.x)); const panelLeft = window.innerWidth - 40 - 300 - 30; const w = 360;
  let x = p.x + r + 28, y = p.y - 16, below = false;
  if (x + w > panelLeft) { below = true; x = Math.max(24, Math.min(panelLeft - w, p.x - 165)); y = Math.min(window.innerHeight - 110, p.y + r + 28); }
  y = Math.max(70, y); el.command.style.transform = `translate(${x}px, ${y}px)`;
  const ay = below ? y + 54 : Math.min(window.innerHeight - 80, p.y + r + 26); el.answer.style.transform = `translate(${Math.max(240, Math.min(panelLeft - 200, below ? x + 165 : p.x))}px, ${ay}px) translateX(-50%)`;
}

export { hud, el, ECO_CLASS, STATE_LABEL, openPanel, renderJarvisPanel, autoGrow, renderMission, renderPipeline, renderCosts, renderUsage, renderPreview, renderDelivery, renderValidation, renderLog, renderAlerts, renderMemory, showAgentDetail, renderAgentsBar, closeAgentsDrop, renderAll, callouts, setFocusLabel, projectToScreen, updateLabels, uiState, openCommand, closeCommand, showAnswer, speakText, stopListening, positionCommand };
