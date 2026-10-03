const { app, BrowserWindow, ipcMain, safeStorage, dialog, shell } = require('electron');
const fs = require('fs'), path = require('path');

const DEFAULTS = {
  provider: 'claude',
  claude:  { model: 'claude-sonnet-5-5' },
  copilot: { baseUrl: 'https://models.github.ai/inference', model: 'openai/gpt-4.1' },
  custom:  { baseUrl: 'http://localhost:11434/v1', model: 'llama3.1' },
  atlassian: {},
};
const cfgFile = () => path.join(app.getPath('userData'), 'config.json');
function load() {
  try { const c = JSON.parse(fs.readFileSync(cfgFile(), 'utf8'));
    return { provider: c.provider || 'claude', claude: { ...DEFAULTS.claude, ...c.claude }, copilot: { ...DEFAULTS.copilot, ...c.copilot }, custom: { ...DEFAULTS.custom, ...c.custom }, atlassian: c.atlassian || {} };
  } catch { return JSON.parse(JSON.stringify(DEFAULTS)); }
}
const store = (c) => fs.writeFileSync(cfgFile(), JSON.stringify(c, null, 2));
// API keys are encrypted with the OS keychain (safeStorage) when available.
const enc = (s) => safeStorage.isEncryptionAvailable() ? 'enc:' + safeStorage.encryptString(s).toString('base64') : 'raw:' + Buffer.from(s).toString('base64');
const dec = (s) => !s ? '' : s.startsWith('enc:') ? safeStorage.decryptString(Buffer.from(s.slice(4), 'base64')) : Buffer.from(s.slice(4), 'base64').toString();

ipcMain.handle('cfg:get', () => {
  const c = load(), out = { provider: c.provider };
  for (const p of ['claude', 'copilot', 'custom']) { const { key, ...rest } = c[p]; out[p] = { ...rest, hasKey: !!key }; }
  return out;
});
ipcMain.handle('cfg:save', (_e, patch) => {
  const c = load();
  if (patch.provider) c.provider = patch.provider;
  for (const p of ['claude', 'copilot', 'custom']) if (patch[p]) c[p] = { ...c[p], ...patch[p] };
  if (patch.key) c[patch.keyFor].key = enc(patch.key);
  store(c); return true;
});

async function post(url, headers, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(180000) });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = null; }
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(j && (j.error?.message || j.message)) || t.slice(0, 300)}`);
  return j;
}
ipcMain.handle('llm:complete', async (_e, { system, user }) => {
  const c = load(), p = c.provider, s = c[p], key = dec(s.key);
  if (p === 'claude') {
    if (!key) throw new Error('No Anthropic API key set (Settings).');
    const j = await post('https://api.anthropic.com/v1/messages', { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      { model: s.model, max_tokens: 4096, system, messages: [{ role: 'user', content: user }] });
    return { text: j.content.filter(b => b.type === 'text').map(b => b.text).join('\n') };
  }
  // GitHub Copilot (GitHub Models) and Custom both speak the OpenAI chat-completions format.
  if (p === 'copilot' && !key) throw new Error('No GitHub token set (Settings).');
  const headers = key ? { Authorization: `Bearer ${key}` } : {};
  if (p === 'copilot') Object.assign(headers, { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' });
  const j = await post(s.baseUrl.replace(/\/$/, '') + '/chat/completions', headers,
    { model: s.model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] });
  return { text: j.choices?.[0]?.message?.content || '' };
});
ipcMain.handle('file:save', async (_e, name, text) => {
  const r = await dialog.showSaveDialog({ defaultPath: name });
  if (r.canceled) return false; fs.writeFileSync(r.filePath, text); return true;
});

// ---------- Jira & Confluence (read-only) ----------
const MAXCH = 15000;
const clip = (t) => t.length > MAXCH ? t.slice(0, MAXCH) + '\n[...truncated]' : t;
function cleanBase(u, label) {
  u = (u || '').trim().replace(/\/+$/, '');
  if (!/^https:\/\/[^\s/]+/i.test(u)) throw new Error(`${label} URL must start with https:// (set it in Jira & Confluence settings).`);
  return u;
}
const jiraBase = (a) => cleanBase(a.jiraUrl, 'Jira');
const confBase = (a) => { const j = (a.jiraUrl || '').trim().replace(/\/+$/, '');
  return cleanBase(a.confUrl || (/atlassian\.net$/i.test(j) ? j + '/wiki' : ''), 'Confluence'); };
function atlHeaders(a) {
  const tok = dec(a.token);
  if (!tok) throw new Error('No Jira/Confluence token set (settings).');
  const auth = a.authType === 'bearer' ? `Bearer ${tok}` : 'Basic ' + Buffer.from(`${a.email || ''}:${tok}`).toString('base64');
  return { Authorization: auth, Accept: 'application/json' };
}
async function aget(url, headers) {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(60000) });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = null; }
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(j && (j.errorMessages?.join('; ') || j.message)) || t.slice(0, 200)}`);
  return j;
}
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const isKey = (s) => /^[A-Za-z][A-Za-z0-9_]*$/.test(s);
function htmlToText(h) {
  return (h || '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<li[^>]*>/gi, '\n- ').replace(/<\/(p|div|h[1-6]|tr|table|ul|ol)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<\/t[dh]>/gi, ' | ')
    .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
ipcMain.handle('atl:get', () => { const { token, ...r } = load().atlassian; return { ...r, hasToken: !!token }; });
ipcMain.handle('atl:save', (_e, p) => {
  const c = load(), a = c.atlassian;
  for (const k of ['jiraUrl', 'confUrl', 'authType', 'email']) if (p[k] !== undefined) a[k] = p[k];
  if (p.token) a.token = enc(p.token);
  c.atlassian = a; store(c); return true;
});
ipcMain.handle('atl:test', async () => {
  const a = load().atlassian, h = atlHeaders(a), out = {};
  if (a.jiraUrl) { try { const j = await aget(`${jiraBase(a)}/rest/api/2/myself`, h); out.Jira = 'connected as ' + (j.displayName || j.name); } catch (e) { out.Jira = e.message; } }
  try { await aget(`${confBase(a)}/rest/api/space?limit=1`, h); out.Confluence = 'connected'; } catch (e) { out.Confluence = e.message; }
  return out;
});
ipcMain.handle('atl:issue', async (_e, { key, comments }) => {
  const a = load().atlassian; key = String(key || '').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]*-\d+$/.test(key)) throw new Error('Enter a Jira key like PROJ-123.');
  const j = await aget(`${jiraBase(a)}/rest/api/2/issue/${key}?fields=*all&expand=names`, atlHeaders(a));
  const f = j.fields, names = j.names || {};
  const out = [`Key: ${j.key}`, `Type: ${f.issuetype?.name || '-'}`, `Status: ${f.status?.name || '-'}`, `Priority: ${f.priority?.name || '-'}`, `Summary: ${f.summary}`];
  if (f.labels?.length) out.push('Labels: ' + f.labels.join(', '));
  if (f.components?.length) out.push('Components: ' + f.components.map(c => c.name).join(', '));
  out.push('', 'Description:', typeof f.description === 'string' ? f.description : '(none)');
  for (const [id, v] of Object.entries(f)) if (/accept|criteria/i.test(names[id] || '') && typeof v === 'string' && v.trim()) out.push('', `${names[id]}:`, v);
  const links = (f.issuelinks || []).map(l => { const x = l.outwardIssue || l.inwardIssue; return x ? `- ${l.type?.name}: ${x.key} ${x.fields?.summary || ''}` : ''; }).filter(Boolean);
  if (links.length) out.push('', 'Linked issues:', ...links);
  if (comments && f.comment?.comments?.length) out.push('', 'Comments:', ...f.comment.comments.slice(-10).map(c => `- ${c.author?.displayName || '?'}: ${c.body}`));
  return { key: j.key, text: clip(out.join('\n')) };
});
ipcMain.handle('atl:issues', async (_e, { project, text }) => {
  const a = load().atlassian;
  if (!isKey(project || '')) throw new Error('Enter a project key, e.g. PROJ.');
  let jql = `project = "${project}"` + (text ? ` AND text ~ "${esc(text)}"` : '') + ' ORDER BY updated DESC';
  const q = `jql=${encodeURIComponent(jql)}&maxResults=15&fields=summary,status,issuetype`, h = atlHeaders(a), b = jiraBase(a);
  let j;
  try { j = await aget(`${b}/rest/api/2/search/jql?${q}`, h); }
  catch (e) { if (/HTTP (404|410)/.test(e.message)) j = await aget(`${b}/rest/api/2/search?${q}`, h); else throw e; }
  return (j.issues || []).map(i => ({ key: i.key, summary: i.fields.summary, status: i.fields.status?.name || '', type: i.fields.issuetype?.name || '' }));
});
async function apost(url, headers, body) {
  const r = await fetch(url, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = null; }
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${j ? [...(j.errorMessages || []), ...Object.values(j.errors || {})].join('; ') || t.slice(0, 200) : t.slice(0, 200)}`);
  return j;
}
const isIssueKey = (k) => /^[A-Z][A-Z0-9_]*-\d+$/.test(k);
ipcMain.handle('atl:comment', async (_e, { key, body }) => {
  const a = load().atlassian; key = String(key || '').trim().toUpperCase();
  if (!isIssueKey(key)) throw new Error('Enter a Jira key like PROJ-123.');
  if (!body || String(body).length > 30000) throw new Error('Comment is empty or too long.');
  await apost(`${jiraBase(a)}/rest/api/2/issue/${key}/comment`, atlHeaders(a), { body: String(body) });
  return true;
});
ipcMain.handle('atl:create', async (_e, { project, type, summary, description, parent }) => {
  const a = load().atlassian;
  if (!isKey(project || '')) throw new Error('Invalid project key.');
  if (!['Bug', 'Task', 'Story', 'Sub-task'].includes(type)) throw new Error('Unsupported issue type.');
  if (!summary) throw new Error('Title is empty.');
  const fields = { project: { key: project.toUpperCase() }, summary: String(summary).slice(0, 250), description: String(description || '').slice(0, 30000), issuetype: { name: type } };
  if (type === 'Sub-task') { if (!isIssueKey(parent || '')) throw new Error('Sub-task needs a valid parent key.'); fields.parent = { key: parent }; }
  const j = await apost(`${jiraBase(a)}/rest/api/2/issue`, atlHeaders(a), { fields });
  return { key: j.key };
});
ipcMain.handle('atl:jql', async (_e, { jql }) => {
  const a = load().atlassian; jql = String(jql || '').trim();
  if (!jql || jql.length > 1000) throw new Error('Enter a JQL query (max 1000 characters).');
  const q = `jql=${encodeURIComponent(jql)}&maxResults=50&fields=summary,status,issuetype,priority,fixVersions`, h = atlHeaders(a), b = jiraBase(a);
  let j;
  try { j = await aget(`${b}/rest/api/2/search/jql?${q}`, h); }
  catch (e) { if (/HTTP (404|410)/.test(e.message)) j = await aget(`${b}/rest/api/2/search?${q}`, h); else throw e; }
  const lines = (j.issues || []).map((i) => { const f = i.fields; return `- ${i.key} [${f.issuetype?.name || '?'}, ${f.status?.name || '?'}, ${f.priority?.name || '-'}] ${f.summary}${f.fixVersions?.length ? ' (fix: ' + f.fixVersions.map((v) => v.name).join(', ') + ')' : ''}`; });
  return { count: lines.length, text: clip(lines.join('\n') + (lines.length >= 50 ? '\n[showing first 50]' : '')) };
});
ipcMain.handle('file:open', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'], filters: [{ name: 'Test results, logs, JSON', extensions: ['xml', 'json', 'csv', 'txt', 'log', 'md'] }] });
  if (r.canceled) return [];
  return r.filePaths.slice(0, 10).map((fp) => { if (fs.statSync(fp).size > 3e6) throw new Error(path.basename(fp) + ' is larger than 3 MB.'); return { name: path.basename(fp), text: fs.readFileSync(fp, 'utf8') }; });
});
ipcMain.handle('atl:confSearch', async (_e, { query, space }) => {
  const a = load().atlassian; query = String(query || '').trim();
  if (!query) throw new Error('Enter something to search for.');
  if (space && !isKey(space)) throw new Error('Space key looks invalid.');
  const cql = `type = page AND text ~ "${esc(query)}"` + (space ? ` AND space = "${space}"` : '');
  const j = await aget(`${confBase(a)}/rest/api/search?cql=${encodeURIComponent(cql)}&limit=10`, atlHeaders(a));
  return (j.results || []).filter(x => x.content?.id).map(x => ({ id: x.content.id, title: x.content.title || x.title, space: x.resultGlobalContainer?.title || '' }));
});
ipcMain.handle('atl:confPage', async (_e, id) => {
  const a = load().atlassian; id = String(id || '');
  if (!/^\d+$/.test(id)) throw new Error('Invalid page id.');
  const j = await aget(`${confBase(a)}/rest/api/content/${id}?expand=body.storage,space`, atlHeaders(a));
  return { title: j.title, text: clip(`Title: ${j.title}\nSpace: ${j.space?.name || j.space?.key || '-'}\n\n` + htmlToText(j.body?.storage?.value)) };
});

app.whenReady().then(() => {
  const w = new BrowserWindow({ width: 1000, height: 820, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  w.setMenuBarVisibility(false);
  w.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  w.loadFile('index.html');
});
app.on('window-all-closed', () => app.quit());
