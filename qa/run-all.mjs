// Runs every QA suite file sequentially, keeps the raw spec output, and writes a normalized
// qa-reports/results.json (PASS / FAIL / BLOCKED / NOT_TESTED per test id) for the reports.
//   usage:  node run-all.mjs [api|e2e|all] [--retry-failed] [--only=<substr>] [--merge] [--reparse]
//   --reparse rebuilds results.json from qa-reports/raw/* without running any test.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const here = import.meta.dirname;
const out = path.resolve(here, '../qa-reports');
const raw = path.join(out, 'raw');
fs.mkdirSync(raw, { recursive: true });

const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const flag = (n) => process.argv.includes(`--${n}`);
const scope = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'all';
const retry = flag('retry-failed');
const only = arg('only');
const merge = flag('merge');
const reparse = flag('reparse');
const dirs = scope === 'all' ? ['api', 'e2e'] : [scope];
const files = dirs
  .flatMap((d) => fs.readdirSync(path.join(here, d)).filter((f) => f.endsWith('.test.mjs')).sort().map((f) => `${d}/${f}`))
  .filter((f) => !only || f.includes(only));

const NL = /\r?\n/;
const LINE = /^\s*(✔|✖|﹣) (.*?) \(([\d.]+)ms\)(?: # (.*))?$/;
const SUMMARY_HEAD = /^✖ failing tests:/;
const SUMMARY_ITEM = /^✖ (.*?) \(([\d.]+)ms\)/;
const ERR_LINE = /^\s+((?:Assertion|Type|Range)?Error.*|Error:.*)$/;

function parse(text, file) {
  const rows = [];
  const seen = new Set();
  const failMsgs = {};
  let inSummary = false;
  let current = null;
  for (const line of text.split(NL)) {
    if (SUMMARY_HEAD.test(line)) { inSummary = true; continue; }
    if (inSummary) {
      const f = SUMMARY_ITEM.exec(line);
      if (f) { current = f[1]; continue; }
      const a = ERR_LINE.exec(line);
      if (a && current && !failMsgs[current]) failMsgs[current] = a[1].slice(0, 300);
      continue;
    }
    const m = LINE.exec(line);
    if (!m || !/\[[A-Z]+-\d+[a-z]?\]/.test(m[2])) continue;
    const id = /\[([A-Z]+-\d+[a-z]?)\]/.exec(m[2])[1];
    const key = `${id}|${m[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const reason = m[4] ?? '';
    const status = m[1] === '✔' ? 'PASS' : m[1] === '✖' ? 'FAIL' : /BLOCKED/.test(reason) ? 'BLOCKED' : 'NOT_TESTED';
    const row = { id, title: m[2].replace(/^\[[^\]]+\]\s*/, ''), status, ms: Number(m[3]), file, note: reason };
    if (status === 'FAIL' && failMsgs[m[2]]) row.message = failMsgs[m[2]];
    rows.push(row);
  }
  return rows;
}

function attachRetry(rows, rows2) {
  for (const row of rows) {
    if (row.status !== 'FAIL') continue;
    const again = rows2.find((x) => x.id === row.id && x.title === row.title);
    row.retry = again?.status ?? 'NOT_RERUN';
    if (again?.status === 'PASS') row.flaky = true;
  }
}

const RETRY_MARK = '\n----- RETRY RUN -----\n';
const all = [];
for (const f of files) {
  const rawFile = path.join(raw, `${f.replace(/\//g, '_')}.txt`);
  if (reparse) {
    if (!fs.existsSync(rawFile)) continue;
    const [first, second] = fs.readFileSync(rawFile, 'utf8').split(RETRY_MARK);
    const rows = parse(first, f);
    if (second) attachRetry(rows, parse(second, f));
    all.push(...rows);
    continue;
  }
  const run = () => spawnSync(process.execPath, ['--test', f], { cwd: here, encoding: 'utf8', timeout: 1_500_000, maxBuffer: 64 * 1024 * 1024 });
  const r = run();
  let text = `${r.stdout}\n${r.stderr}`;
  const rows = parse(text, f);
  if (retry && rows.some((x) => x.status === 'FAIL')) {
    const second = run();
    const t2 = `${second.stdout}\n${second.stderr}`;
    attachRetry(rows, parse(t2, f));
    text += `${RETRY_MARK}${t2}`;
  }
  fs.writeFileSync(rawFile, text);
  all.push(...rows);
}

let merged = all;
const resultsPath = path.join(out, 'results.json');
if (merge && fs.existsSync(resultsPath)) {
  const prev = JSON.parse(fs.readFileSync(resultsPath, 'utf8')).tests.filter((t) => !files.includes(t.file));
  merged = [...prev, ...all];
}
fs.writeFileSync(resultsPath, JSON.stringify({ generatedAt: new Date().toISOString(), tests: merged }, null, 2));
for (const f of files) {
  const rows = merged.filter((t) => t.file === f);
  const c = (s) => rows.filter((x) => x.status === s).length;
  console.log(`${f.padEnd(48)} pass ${c('PASS')}  fail ${c('FAIL')}  blocked ${c('BLOCKED')}  not_tested ${c('NOT_TESTED')}`);
}
const tally = (s) => merged.filter((x) => x.status === s).length;
console.log(`TOTAL ${merged.length}  PASS ${tally('PASS')}  FAIL ${tally('FAIL')}  BLOCKED ${tally('BLOCKED')}  NOT_TESTED ${tally('NOT_TESTED')}`);
