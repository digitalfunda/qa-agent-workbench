// Pure helpers (browser global + node-testable)
(function (root) {
  const clip = (t) => (t.length > 15000 ? t.slice(0, 15000) + '\n[...truncated]' : t);
  const luhn = (s) => { if (s.length < 13 || s.length > 19) return false; let sum = 0, alt = false;
    for (let i = s.length - 1; i >= 0; i--) { let d = +s[i]; if (alt) { d *= 2; if (d > 9) d -= 9; } sum += d; alt = !alt; } return sum % 10 === 0; };
  // Mask PII/secrets; returns masked text + map to restore placeholders in the model's answer.
  function redact(t) {
    const map = {}, cnt = {}; let n = 0;
    const rules = [
      ['EMAIL', /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g],
      ['TOKEN', /\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,})\b/g],
      ['SECRET', /(\b(?:password|passwd|pwd|secret|api[_-]?key|token)\b\s*[:=]\s*)(\S+)/gi],
      ['CARD', /\b(?:\d[ -]?){13,19}\b/g],
      ['IP', /\b(?:\d{1,3}\.){3}\d{1,3}\b/g],
      ['PHONE', /\+\d[\d ()-]{8,}\d|\(\d{3}\)[\s-]?\d{3}[\s-]?\d{4}|\b\d{3}[-.]\d{3}[-.]\d{4}\b/g],
    ];
    for (const [name, re] of rules) {
      t = t.replace(re, (...a) => {
        const m = a[0];
        if (name === 'CARD' && !luhn(m.replace(/\D/g, ''))) return m;
        const k = '[' + name + '_' + (cnt[name] = (cnt[name] || 0) + 1) + ']'; n++;
        if (name === 'SECRET') { map[k] = a[2]; return a[1] + k; }
        map[k] = m; return k;
      });
    }
    return { text: t, map, n };
  }
  const isSep = (l) => /^\s*\|?\s*:?-{2,}/.test(l || '') && (l || '').includes('|');
  const isRow = (l) => /^\s*\|.*\|\s*$/.test(l || '');
  const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  function md2jira(md) {
    const L = md.split('\n'), o = []; let code = false;
    for (let i = 0; i < L.length; i++) {
      let l = L[i];
      if (/^```/.test(l)) { o.push('{code}'); code = !code; continue; }
      if (code) { o.push(l); continue; }
      if (isSep(l)) continue;
      const h = l.match(/^(#{1,6})\s+(.*)/); if (h) { o.push('h' + h[1].length + '. ' + h[2]); continue; }
      if (isRow(l)) { const c = cells(l); o.push(isSep(L[i + 1]) ? '||' + c.join('||') + '||' : '|' + c.join('|') + '|'); continue; }
      o.push(l.replace(/^(\s*)[-*]\s+/, '$1* ').replace(/\*\*(.+?)\*\*/g, '*$1*'));
    }
    return o.join('\n');
  }
  function mdTables(text) {
    const L = text.split('\n'), out = []; let sec = '';
    for (let i = 0; i < L.length; i++) {
      const h = L[i].match(/^#{1,6}\s+(.*)/); if (h) { sec = h[1].trim(); continue; }
      if (isRow(L[i]) && isSep(L[i + 1])) {
        const hd = cells(L[i]).map((x) => x.toLowerCase()); i += 2;
        while (i < L.length && isRow(L[i])) { const c = cells(L[i]).map((x) => x.replace(/<br\s*\/?>/gi, '\n')); const r = { section: sec }; hd.forEach((k, j) => (r[k] = c[j] || '')); out.push(r); i++; }
        i--;
      }
    }
    return out;
  }
  const g = (r, re) => { const k = Object.keys(r).find((k) => re.test(k)); return k ? r[k] : ''; };
  const isCase = (r) => !!g(r, /step|action|expected|request|response/);
  const countCases = (t) => mdTables(t).filter(isCase).length;
  const F = (r) => ({ T: g(r, /title|name|scenario/) || g(r, /./), P: g(r, /precond/), S: g(r, /step|action|request/), E: g(r, /expected|result|response/), PR: g(r, /priority|severity/) });
  const FMT = {
    testrail: { h: ['Title', 'Section', 'Preconditions', 'Steps', 'Expected Result', 'Priority'], f: (r) => { const x = F(r); return [x.T, r.section, x.P, x.S, x.E, x.PR]; } },
    xray: { h: ['Summary', 'Test Type', 'Priority', 'Description', 'Preconditions', 'Action', 'Expected Result'], f: (r) => { const x = F(r); return [x.T, 'Manual', x.PR, r.section, x.P, x.S, x.E]; } },
    zephyr: { h: ['Name', 'Objective', 'Precondition', 'Priority', 'Folder', 'Status', 'Step', 'Test Data', 'Expected Result'], f: (r) => { const x = F(r); return [x.T, x.T, x.P, x.PR, r.section, 'Draft', x.S, '', x.E]; } },
  };
  const q = (s) => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
  const toCsv = (head, rows) => [head, ...rows].map((r) => r.map(q).join(',')).join('\n');
  function testCsv(text, fmt) {
    const rows = mdTables(text).filter(isCase); if (!rows.length) return '';
    const f = FMT[fmt] || FMT.testrail; return toCsv(f.h, rows.map(f.f));
  }
  function firstLine(t) { return (t.split('\n').map((l) => l.replace(/[#*|`_-]/g, '').trim()).find(Boolean) || 'AI-assisted QA draft'); }
  const srcKeys = (t) => [...new Set([...t.matchAll(/^### (Jira [A-Z][A-Z0-9_]*-\d+|Confluence: .+)$/gm)].map((m) => m[1]))];
  function junit(f) {
    const d = new DOMParser().parseFromString(f.text, 'text/xml'), cs = [...d.getElementsByTagName('testcase')];
    if (d.getElementsByTagName('parsererror').length || !cs.length) return clip(f.text);
    const rows = cs.map((c) => { const fail = c.getElementsByTagName('failure')[0] || c.getElementsByTagName('error')[0], sk = c.getElementsByTagName('skipped')[0];
      return { n: (c.getAttribute('classname') ? c.getAttribute('classname') + '.' : '') + c.getAttribute('name'), t: c.getAttribute('time') || '', r: fail ? 'FAIL' : sk ? 'SKIP' : 'PASS',
        m: fail ? ((fail.getAttribute('message') || '') + '\n' + (fail.textContent || '').trim().split('\n').slice(0, 6).join('\n')).trim() : '' }; });
    const bad = rows.filter((x) => x.r === 'FAIL'), ns = rows.filter((x) => x.r === 'SKIP').length;
    let o = `Totals: ${rows.length} tests, ${rows.length - bad.length - ns} passed, ${bad.length} failed, ${ns} skipped.\n`;
    if (bad.length) o += '\nFailures:\n' + bad.slice(0, 40).map((x) => `- ${x.n} (${x.t}s)\n  ${x.m.replace(/\n/g, '\n  ')}`).join('\n');
    o += '\n\nAll results (test,result,seconds):\n' + rows.slice(0, 300).map((x) => `${x.n},${x.r},${x.t}`).join('\n');
    return clip(o);
  }
  const lib = { clip, redact, md2jira, mdTables, countCases, testCsv, toCsv, firstLine, srcKeys, junit };
  if (typeof module !== 'undefined' && module.exports) module.exports = lib; else Object.assign(root, lib);
})(typeof window !== 'undefined' ? window : globalThis);
