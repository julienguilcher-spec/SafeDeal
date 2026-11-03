// Cerveau de Jarvis : prompts (général, agents, CEO), délégation des tâches, connexion optionnelle à Claude.
import { data, agentById, AGENT_DEFS, ECO, fmtPct, fmtDuration, fmtEUR } from './data.js';
import { agentsById } from './agents.js';
import { focusAgent, focusEcosystem, goOverview } from './camera.js';
import { STATE_LABEL, renderAll } from './hud.js';
import { applyAgentPatch, triggerHandover, api, localAnswer } from './sim.js';

const STORAGE_PROMPTS = 'jarvis.prompts';
const STORAGE_LLM = 'jarvis.llm';
const MODELS = { 'claude-opus-5-5': 'Claude Opus 5.5', 'claude-sonnet-5-5': 'Claude Sonnet 5.5', 'claude-haiku-5-5': 'Claude Haiku 5.5' };

/* ------------------------------------------------------------------ prompts par défaut */
const DEFAULT_GLOBAL_PROMPT = `Tu es JARVIS, l'intelligence centrale qui commande tous les agents des trois écosystèmes : Studio Shopify (dirigé par le CEO), KCL (dirigé par le CEO-KCL) et le Rédacteur.
Tu parles français, avec précision et sobriété : une ou deux phrases, jamais de bavardage.
Quand on te confie un objectif, tu le délègues au CEO de l'écosystème concerné (ou directement à l'agent quand la demande est précise), tu nommes le livrable attendu et tu rends compte de l'état des agents.
Tu n'annonces que des actions que tu déclenches réellement dans la console.`;

const DEFAULT_PROMPTS = {
  ceo: `Tu es le CEO du Studio Shopify. Tu reçois les objectifs de Jarvis et tu les découpes en tâches pour ton équipe : Design (maquettes), Constructeur (intégration du thème), QA (contrôle qualité), Admin Shopify (configuration de la boutique), Veille (marché), Business (analyse), Publicité (acquisition), Commandes (logistique).
Pour chaque délégation tu précises l'objectif, le livrable et l'échéance, puis tu exiges un retour avant de passer à l'étape suivante du pipeline.`,
  design: `Tu es l'agent Design du Studio Shopify. Tu produis moodboards, grilles typographiques et maquettes (desktop et mobile) sobres et cohérentes avec la charte du client, puis tu transmets au Constructeur des maquettes prêtes à intégrer.`,
  constructeur: `Tu es le Constructeur du Studio Shopify. Tu intègres les maquettes dans le thème Shopify (sections, schémas JSON, responsive, performance) et tu livres à la QA une build testable.`,
  qa: `Tu es l'agent QA du Studio Shopify. Tu testes chaque build (responsive, accessibilité, parcours d'achat, vitesse), tu consignes les anomalies et tu ne valides que ce qui est irréprochable.`,
  admin: `Tu es l'Admin Shopify. Tu configures la boutique (accès, taxes, livraison, paiements, domaines, applications) et tu signales toute action qui exige une validation humaine.`,
  veille: `Tu es l'agent Veille du Studio Shopify. Tu surveilles le marché et les concurrents, tu synthétises les nouveautés utiles et tu alertes le CEO quand une opportunité ou un risque apparaît.`,
  business: `Tu es l'agent Business du Studio Shopify. Tu analyses marges, prix, paniers et conversion, et tu proposes des décisions chiffrées au CEO.`,
  publicite: `Tu es l'agent Publicité du Studio Shopify. Tu conçois et pilotes les campagnes d'acquisition (budgets, audiences, créations, résultats) et tu rends compte du coût par acquisition.`,
  commandes: `Tu es l'agent Commandes du Studio Shopify. Tu suis les commandes, les stocks et les expéditions, et tu traites les incidents de livraison.`,
  'ceo-kcl': `Tu es le CEO-KCL, responsable de l'écosystème d'études KCL. Tu reçois les objectifs de Jarvis et tu les répartis entre Veilleur-KEATS (surveillance des cours), Planning (organisation), Readings (lectures), Contrôle-Qualité (relecture), Essais-Coach (rédaction académique), Révision (fiches), Vidéos (cours vidéo) et Exos-Maths-Stats (exercices).
Tu délègues avec un objectif, un livrable et une échéance, puis tu vérifies la qualité avant de clore.`,
  'veilleur-keats': `Tu es le Veilleur-KEATS. Tu synchronises la plateforme KEATS, tu détectes les nouveaux cours, devoirs et échéances, et tu préviens Planning sans délai.`,
  planning: `Tu es l'agent Planning de KCL. Tu construis et tiens à jour le calendrier de travail (échéances, sessions de révision, priorités) et tu répartis la charge sur la semaine.`,
  readings: `Tu es l'agent Readings de KCL. Tu lis les chapitres et articles imposés, tu en tires des fiches de lecture structurées et tu signales les points difficiles.`,
  'controle-qualite': `Tu es le Contrôle-Qualité de KCL. Tu relis les essais, fiches et exercices, tu vérifies rigueur, sources et clarté, et tu renvoies des corrections précises.`,
  'essais-coach': `Tu es l'Essais-Coach de KCL. Tu analyses les sujets, tu proposes des plans solides et tu accompagnes la rédaction d'essais académiques argumentés.`,
  revision: `Tu es l'agent Révision de KCL. Tu transformes les cours en fiches, flashcards et quiz, et tu organises les séances de révision espacée.`,
  videos: `Tu es l'agent Vidéos de KCL. Tu planifies et produis des cours vidéo courts et clairs à partir des fiches validées.`,
  'exos-maths-stats': `Tu es l'agent Exos-Maths-Stats de KCL. Tu génères des séries d'exercices corrigés, progressifs, avec explications pas à pas.`,
  redacteur: `Tu es le Rédacteur. Tu écris des articles et contenus en français, structurés et sourcés, dans un ton sobre, puis tu relis avant de livrer.`,
};
const LEADER_LABEL = 'Prompt de délégation';
const AGENT_LABEL = 'Prompt général';

/* ------------------------------------------------------------------ persistance */
function loadJSON(key, fallback) { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch (_) { return fallback; } }
function saveJSON(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {} }
const stored = loadJSON(STORAGE_PROMPTS, {});
data.jarvisPrompt = typeof stored.__global === 'string' ? stored.__global : DEFAULT_GLOBAL_PROMPT;
data.agents.forEach((a) => { a.prompt = typeof stored[a.id] === 'string' ? stored[a.id] : (DEFAULT_PROMPTS[a.id] || ''); });
const llm = Object.assign({ apiKey: '', model: 'claude-opus-5-5' }, loadJSON(STORAGE_LLM, {}));
data.llm = { configured: !!llm.apiKey, model: llm.model, label: MODELS[llm.model] || llm.model };

function persistPrompts() { const out = { __global: data.jarvisPrompt }; data.agents.forEach((a) => { out[a.id] = a.prompt || ''; }); saveJSON(STORAGE_PROMPTS, out); }
function getPrompts() { const out = { jarvis: data.jarvisPrompt }; data.agents.forEach((a) => { out[a.id] = a.prompt || ''; }); return out; }
function setPrompt(id, text) { if (id === 'jarvis' || id === '__global') data.jarvisPrompt = String(text || ''); else { const a = agentById(id); if (!a) return false; a.prompt = String(text || ''); } persistPrompts(); return true; }
function setPrompts(map = {}) { Object.keys(map).forEach((k) => setPrompt(k, map[k])); }
function resetPrompts() { data.jarvisPrompt = DEFAULT_GLOBAL_PROMPT; data.agents.forEach((a) => { a.prompt = DEFAULT_PROMPTS[a.id] || ''; }); persistPrompts(); }
function promptLabel(id) { const def = AGENT_DEFS.find((d) => d.id === id); return def && def.leader ? LEADER_LABEL : AGENT_LABEL; }
function setLLM({ apiKey, model } = {}) {
  if (apiKey !== undefined) llm.apiKey = String(apiKey || '').trim();
  if (model !== undefined && MODELS[model]) llm.model = model;
  saveJSON(STORAGE_LLM, llm); data.llm = { configured: !!llm.apiKey, model: llm.model, label: MODELS[llm.model] || llm.model }; brain.client = null;
  return data.llm;
}
function getLLM() { return { configured: !!llm.apiKey, model: llm.model, label: MODELS[llm.model] || llm.model }; }

/* ------------------------------------------------------------------ délégation locale (sans modèle) */
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
const normKeepLength = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’]/g, "'");
const ALIASES = {
  ceo: ['ceo', 'patron', 'directeur du studio', 'ceo studio', 'ceo shopify', 'direction du studio'],
  design: ['design', 'designer', 'graphiste', 'direction artistique', 'da'],
  constructeur: ['constructeur', 'developpeur', 'dev', 'integrateur', 'integration', 'builder'],
  qa: ['qa', 'qualite', 'testeur', 'tests', 'controle qualite studio'],
  admin: ['admin', 'admin shopify', 'administrateur', 'administration'],
  veille: ['veille', 'veilleur studio', 'veille marche'],
  business: ['business', 'analyste', 'analyse business', 'finance'],
  publicite: ['publicite', 'pub', 'ads', 'acquisition', 'marketing'],
  commandes: ['commandes', 'logistique', 'expeditions', 'livraisons'],
  'ceo-kcl': ['ceo-kcl', 'ceo kcl', 'directeur kcl', 'direction kcl'],
  'veilleur-keats': ['veilleur-keats', 'veilleur keats', 'veilleur', 'keats'],
  planning: ['planning', 'planification', 'calendrier', 'organisation'],
  readings: ['readings', 'reading', 'lectures', 'lecture'],
  'controle-qualite': ['controle-qualite', 'controle qualite', 'controle', 'relecture', 'relecteur'],
  'essais-coach': ['essais-coach', 'essais coach', 'essai', 'essais', 'coach', 'dissertation'],
  revision: ['revision', 'revisions', 'fiches', 'flashcards'],
  videos: ['videos', 'video', 'cours video'],
  'exos-maths-stats': ['exos-maths-stats', 'exos', 'exercices', 'maths', 'stats', 'statistiques', 'mathematiques'],
  redacteur: ['redacteur', 'redaction', 'article', 'articles', 'blog'],
};
function findAgentIn(text) {
  const t = ` ${norm(text)} `; let best = null, bestLen = 0;
  data.agents.forEach((a) => { const names = [norm(a.name), ...(ALIASES[a.id] || [])]; names.forEach((n) => { if (n && t.includes(` ${n} `) && n.length > bestLen) { best = a; bestLen = n.length; } }); });
  return best;
}
function findEcosystemIn(text) {
  const t = norm(text);
  if (/\b(studio|shopify|boutique|theme|collection|produit|site)\b/.test(t)) return 'studio';
  if (/\b(kcl|keats|cours|revision|exam|examen|essai|lecture|chapitre|universite)\b/.test(t)) return 'kcl';
  if (/\b(article|redaction|blog|texte|newsletter)\b/.test(t)) return 'redacteur';
  return null;
}
const DELEGATION_PATTERNS = [
  /(?:demande|demandez|dis|dites|ordonne|confie|confiez|delegue|deleguez|charge)\s+(?:a|au|aux)\s+(?:l'|la\s|le\s)?(?<agent>[a-z0-9\- ]+?)\s+(?:de\s|d')(?<task>.+)/,
  /(?:fais|faites|fait)\s+(?<task>.+?)\s+par\s+(?:l'|la\s|le\s)?(?<agent>[a-z0-9\- ]+)/,
  /(?<agent>[a-z0-9\- ]+?)\s+(?:doit|devrait|va)\s+(?<task>.+)/,
  /(?:lance|lancez|demarre|demarrez)\s+(?<task>.+)/,
];
function cleanTask(task) { let t = String(task || '').trim().replace(/[.!]+$/, ''); if (!t) return ''; return t.charAt(0).toUpperCase() + t.slice(1); }
function tryLocalDelegation(text) {
  const original = String(text || '').trim(); const t = normKeepLength(original);
  for (const re of DELEGATION_PATTERNS) {
    const m = t.match(re); if (!m) continue;
    const start = t.indexOf(m.groups.task, m.index); const task = cleanTask(start >= 0 ? original.slice(start, start + m.groups.task.length) : m.groups.task); if (!task) continue;
    let agent = m.groups.agent ? findAgentIn(m.groups.agent) : findAgentIn(task);
    if (!agent) { const ecoId = findEcosystemIn(text); if (ecoId) agent = agentById(ECO[ecoId].leader); }
    if (!agent) continue;
    return delegate(agent.id, task, { origin: 'jarvis' });
  }
  return null;
}
/* délègue une tâche : Jarvis → CEO → agent (liens, fusées, journal) */
function delegate(agentId, task, { origin = 'jarvis' } = {}) {
  const agent = agentById(agentId); if (!agent) return null;
  const def = AGENT_DEFS.find((d) => d.id === agentId); const eco = ECO[agent.eco]; const leader = agentById(eco.leader);
  const taskText = cleanTask(task) || agent.task;
  if (!def.leader && leader) {
    if (leader.state !== 'working') applyAgentPatch(leader.id, { state: 'working', load: Math.max(0.5, leader.load || 0.5) });
    api.appendLog(leader.id, `Reçoit de Jarvis : ${taskText}`);
    applyAgentPatch(agentId, { state: 'working', load: 0.75, task: taskText, progress: 0, handoverTo: undefined });
    triggerHandover(leader.id, agentId);
    api.appendLog(agentId, `Délégation de ${leader.name} : ${taskText}`);
    return { reply: `Entendu. ${leader.name} délègue à ${agent.name} : ${taskText}.`, agent, leader };
  }
  applyAgentPatch(agentId, { state: 'working', load: 0.7, task: taskText, progress: 0 });
  api.appendLog(agentId, `Objectif reçu de Jarvis : ${taskText}`);
  return { reply: `Entendu. ${agent.name} prend en charge : ${taskText}.`, agent, leader: null };
}

/* ------------------------------------------------------------------ connexion à Claude (clé stockée dans ce navigateur uniquement) */
const brain = { client: null, history: [], busy: false };
const REPLY_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['reply', 'actions'],
  properties: {
    reply: { type: 'string', description: 'Réponse parlée de Jarvis, en français, une ou deux phrases.' },
    actions: {
      type: 'array', description: 'Actions à exécuter dans la console, dans l\'ordre. Tableau vide si aucune.',
      items: {
        type: 'object', additionalProperties: false, required: ['type', 'agent', 'to', 'task', 'state', 'target'],
        properties: {
          type: { type: 'string', enum: ['assign', 'set_state', 'handover', 'focus', 'overview', 'none'], description: 'assign : confier une tâche (agent, task). set_state : changer l\'état (agent, state). handover : transfert agent → to. focus : voler vers un agent ou un écosystème (target). overview : vue d\'ensemble.' },
          agent: { type: 'string', description: 'Identifiant d\'agent, ou chaîne vide.' },
          to: { type: 'string', description: 'Identifiant d\'agent destinataire pour handover, sinon chaîne vide.' },
          task: { type: 'string', description: 'Tâche à confier, sinon chaîne vide.' },
          state: { type: 'string', enum: ['idle', 'working', 'waiting', ''], description: 'Nouvel état pour set_state, sinon chaîne vide.' },
          target: { type: 'string', description: 'Identifiant d\'agent ou d\'écosystème (studio, kcl, redacteur) pour focus, sinon chaîne vide.' },
        },
      },
    },
  },
};
function buildSystemPrompt() {
  const roster = data.agents.map((a) => `- ${a.id} (${a.name}, ${a.role}, écosystème ${ECO[a.eco].name}, état : ${STATE_LABEL[a.state] || a.state}${a.task ? `, tâche : ${a.task}` : ''})\n  Prompt : ${a.prompt || '(aucun)'}`).join('\n');
  const m = data.mission;
  return `${data.jarvisPrompt}

CONTEXTE ACTUEL
Mission : ${m.project}, ${fmtPct(m.progress)}, étape ${m.step}, temps restant ${fmtDuration(m.remaining)}.
Coûts : ${fmtEUR.format(data.costs.total)} (plafond ${fmtEUR.format(data.costs.cap)} par site, budget mensuel consommé à ${Math.round(data.costs.spent / data.costs.budget * 100)} %).
Validations en attente : ${data.validation.length ? data.validation.map((v) => v.text).join(' ; ') : 'aucune'}.

AGENTS (identifiant, nom, rôle, écosystème, état, prompt)
${roster}

RÈGLES
- Réponds uniquement avec le JSON demandé : « reply » (une ou deux phrases en français, parlées à voix haute) et « actions ».
- Pour déléguer, respecte la hiérarchie : Jarvis commande les CEO (ceo, ceo-kcl) et le Rédacteur ; les CEO délèguent à leurs agents. Une délégation vers un agent non-CEO s'exprime par une action assign sur l'agent (la console fait passer le transfert par son CEO).
- N'invente pas d'agent : utilise seulement les identifiants listés. Les champs inutilisés restent des chaînes vides.`;
}
function applyActions(actions = []) {
  let applied = 0;
  actions.forEach((act) => {
    if (!act || act.type === 'none') return;
    const id = act.agent || ''; const a = id ? agentById(id) : null;
    if (act.type === 'assign' && a && act.task) { delegate(a.id, act.task, { origin: 'claude' }); applied++; }
    else if (act.type === 'set_state' && a && ['idle', 'working', 'waiting'].includes(act.state)) { applyAgentPatch(a.id, { state: act.state }); applied++; }
    else if (act.type === 'handover' && a && agentById(act.to)) { applyAgentPatch(act.to, { state: 'working', task: act.task || agentById(act.to).task }); triggerHandover(a.id, act.to); api.appendLog(a.id, `Transmet à ${agentById(act.to).name}${act.task ? ' : ' + act.task : ''}`); applied++; }
    else if (act.type === 'focus') { if (agentsById[act.target]) focusAgent(act.target); else if (ECO[act.target]) focusEcosystem(act.target); applied++; }
    else if (act.type === 'overview') { goOverview(); applied++; }
  });
  if (applied) renderAll();
  return applied;
}
async function askClaude(text) {
  if (!brain.client) { const { default: Anthropic } = await import('@anthropic-ai/sdk'); brain.client = new Anthropic({ apiKey: llm.apiKey, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: 60000 }); }
  const client = brain.client;
  const messages = [...brain.history.slice(-8), { role: 'user', content: text }];
  const base = { model: llm.model, max_tokens: 1500, system: buildSystemPrompt(), messages, output_config: { effort: 'low', format: { type: 'json_schema', schema: REPLY_SCHEMA } } };
  let res;
  try { res = await client.beta.messages.create({ ...base, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }); }
  catch (e) { if (e && e.status === 400) res = await client.messages.create(base); else throw e; }
  if (res.stop_reason === 'refusal') return { reply: 'Je ne peux pas donner suite à cette demande.', actions: [] };
  const block = res.content.find((b) => b.type === 'text'); if (!block) throw new Error('Réponse vide');
  let parsed; try { parsed = JSON.parse(block.text); } catch (_) { parsed = { reply: block.text.slice(0, 240), actions: [] }; }
  brain.history.push({ role: 'user', content: text }, { role: 'assistant', content: block.text }); if (brain.history.length > 16) brain.history.splice(0, brain.history.length - 16);
  return parsed;
}

/* ------------------------------------------------------------------ point d'entrée : Jarvis répond */
async function askJarvis(text) {
  const q = String(text || '').trim(); if (!q) return '';
  if (llm.apiKey) {
    try { const out = await askClaude(q); applyActions(out.actions || []); return out.reply || '…'; }
    catch (e) { console.warn('Jarvis : Claude indisponible, réponse locale.', e); api.appendLog(null, `Claude indisponible (${(e && e.message) ? e.message.slice(0, 80) : 'erreur'}), réponse locale.`); }
  }
  const delegated = tryLocalDelegation(q); if (delegated) return delegated.reply;
  return localAnswer(q);
}

export { askJarvis, delegate, getPrompts, setPrompt, setPrompts, resetPrompts, promptLabel, setLLM, getLLM, MODELS, DEFAULT_GLOBAL_PROMPT, DEFAULT_PROMPTS, findAgentIn };
