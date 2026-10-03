const L=require('./lib.js'),a=require('assert');
const r=L.redact('mail bob@x.com pw=abc password: hunter2 ip 10.0.0.1 card 4111 1111 1111 1111 ts 1760000000000 tel +1 415 555 0100 tok ghp_abcdefghijklmnopqrstuvwxyz1234');
a(r.n>=6&&!/bob@x|hunter2|10\.0\.0\.1|4111|ghp_/.test(r.text)&&/1760000000000/.test(r.text)); a.strictEqual(r.map['[EMAIL_1]'],'bob@x.com');
const md='### Positive\n| ID | Title | Steps | Expected |\n|---|---|---|---|\n| 1 | Login | enter creds<br>click | success |\n';
a.strictEqual(L.countCases(md),1); a(L.testCsv(md,'xray').includes('"Login","Manual"'));
a(L.md2jira('## H\n**b** x\n- i\n'+md).includes('h2. H')&&L.md2jira(md).includes('||ID||Title||Steps||Expected||'));
a.deepStrictEqual(L.srcKeys('### Jira AB-1\nx\n### Confluence: Spec'),['Jira AB-1','Confluence: Spec']);
console.log('lib tests OK');
