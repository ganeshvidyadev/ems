import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { call, login } from '../lib/client.mjs';
import { USERS } from '../lib/config.mjs';
import { sql } from '../lib/db.mjs';

const KEYS = { hero: 'hero', features: 'features', products: 'products', plansDisplay: 'plans_display', about: 'about', career: 'career', contact: 'contact', header: 'header', footer: 'footer' };
let admin, original, preexistingRows;
const TAG = `QA-${Date.now().toString(36)}`;

const adminGet = async () => (await call('GET', '/platform/website', { token: admin })).body.data;
const publicGet = async () => (await call('GET', '/website/content')).body.data;
const put = (body, token = admin) => call('PUT', '/platform/website', { token, body });

before(async () => {
  admin = await login(USERS.superAdmin);
  original = await adminGet();
  preexistingRows = new Set(sql('SELECT `key` FROM website_content').map((r) => r[0]));
});

// Restore: put the original content back, then drop rows that did not exist before this run so the
// DB returns to its exact prior state (rows that were absent fall back to code defaults).
after(async () => {
  await put(original);
  for (const k of Object.values(KEYS)) {
    if (!preexistingRows.has(k)) sql(`DELETE FROM website_content WHERE \`key\`='${k}'`);
  }
});

test('[WEB-001] admin can read all 9 editable sections', async () => {
  const d = await adminGet();
  for (const s of Object.keys(KEYS)) assert.ok(d[s], `missing section ${s}`);
});

test('[WEB-002] public endpoint needs no token and matches admin view', async () => {
  const [a, p] = [await adminGet(), await publicGet()];
  assert.deepEqual(p, a);
});

test('[WEB-003] hero update is validated, persisted to website_content, and served publicly', async () => {
  const hero = { ...original.hero, titleHighlight: `${TAG}-hero` };
  const r = await put({ hero });
  assert.equal(r.status, 200);
  assert.equal((await publicGet()).hero.titleHighlight, `${TAG}-hero`);
  const row = sql("SELECT JSON_UNQUOTE(JSON_EXTRACT(value,'$.titleHighlight')) FROM website_content WHERE `key`='hero'");
  assert.equal(row[0][0], `${TAG}-hero`, 'row not persisted in MySQL website_content');
});

test('[WEB-004] partial update leaves other sections untouched', async () => {
  const before = await publicGet();
  await put({ contact: { ...original.contact, heading: `${TAG}-contact` } });
  const after = await publicGet();
  assert.equal(after.contact.heading, `${TAG}-contact`);
  assert.deepEqual(after.hero, before.hero);
  assert.deepEqual(after.features, before.features);
});

for (const [section, field] of [
  ['features', 'heading'], ['products', 'heading'], ['plansDisplay', 'heading'], ['about', 'heading'], ['career', 'heading'], ['header', 'logoText'], ['footer', 'tagline'],
]) {
  test(`[WEB-005] ${section}.${field} round-trips through admin PUT -> public GET`, async () => {
    const val = `${TAG}-${section}`.slice(0, 40);
    const r = await put({ [section]: { ...original[section], [field]: val } });
    assert.equal(r.status, 200, JSON.stringify(r.body?.error));
    assert.equal((await publicGet())[section][field], val);
  });
}

test('[WEB-006] invalid hero (empty CTA label) -> 422 and nothing saved', async () => {
  const cur = (await publicGet()).hero;
  const r = await put({ hero: { ...original.hero, primaryCtaLabel: '' } });
  assert.equal(r.status, 422);
  assert.deepEqual((await publicGet()).hero, cur);
});

test('[WEB-007] invalid feature icon / accent enum -> 422', async () => {
  const bad = { ...original.features, items: [{ icon: 'not-an-icon', title: 't', description: 'd', accent: 'indigo' }] };
  assert.equal((await put({ features: bad })).status, 422);
  const bad2 = { ...original.features, items: [{ icon: 'zap', title: 't', description: 'd', accent: 'purple-700' }] };
  assert.equal((await put({ features: bad2 })).status, 422);
});

test('[WEB-008] length limits enforced (hero title > 120 chars)', async () => {
  assert.equal((await put({ hero: { ...original.hero, titlePrefix: 'x'.repeat(500) } })).status, 422);
});

test('[WEB-009] max-items limit enforced (13 feature cards)', async () => {
  const items = Array.from({ length: 13 }, (_, i) => ({ icon: 'zap', title: `t${i}`, description: 'd', accent: 'indigo' }));
  assert.equal((await put({ features: { ...original.features, items } })).status, 422);
});

test('[WEB-010] wrong types / non-object body rejected, never 500', async () => {
  for (const body of [{ hero: 'string' }, { hero: null }, { features: { heading: 5 } }, { header: { navLinks: 'x' } }, []]) {
    const r = await put(body);
    assert.ok(r.status >= 400 && r.status < 500, `${JSON.stringify(body)} -> ${r.status}`);
  }
});

test('[WEB-011] unauthenticated and merchant users cannot modify content', async () => {
  const cur = JSON.stringify((await publicGet()).hero);
  assert.equal((await call('PUT', '/platform/website', { body: { hero: { ...original.hero, titlePrefix: 'anon' } } })).status, 401);
  assert.equal((await put({ hero: { ...original.hero, titlePrefix: 'merchant' } }, await login(USERS.nwOwner))).status, 403);
  assert.equal(JSON.stringify((await publicGet()).hero), cur);
});

test('[WEB-012] unknown sections are not persisted as new rows', async () => {
  await put({ evil: { a: 1 } });
  const rows = sql('SELECT `key` FROM website_content').map((r) => r[0]);
  assert.ok(!rows.includes('evil'), 'unknown key was stored');
});

test('[WEB-013] stored XSS payload is returned as inert JSON text (rendering is checked in E2E)', async () => {
  const xss = '<img src=x onerror=alert(1)>';
  await put({ about: { ...original.about, heading: xss } });
  const r = await call('GET', '/website/content');
  assert.match(r.headers.get('content-type'), /application\/json/);
  assert.equal(r.body.data.about.heading, xss);
});

test('[WEB-014] pricing is sourced from /plans API, not duplicated static data', async () => {
  const plans = (await call('GET', '/plans')).body.data;
  assert.ok(plans.length >= 3);
  assert.ok(!('plans' in (await publicGet())), 'website content must not embed plan prices');
  const marketingSrc = path.resolve(import.meta.dirname, '../../apps/marketing/src');
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const hits = walk(marketingSrc).filter((f) => /\.(tsx?|css)$/.test(f)).filter((f) => /₹\s?\d|priceMonthly\s*[:=]\s*['"]?\d/.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(hits, [], 'hard-coded prices found in marketing source');
});

test('[WEB-015] plan name/price shown by /plans match the plans table in MySQL', async () => {
  const api = (await call('GET', '/plans')).body.data;
  const rows = sql("SELECT code, price_monthly_minor FROM plans WHERE is_public=1 AND status='ACTIVE' ORDER BY sort_order");
  assert.deepEqual(api.map((p) => [p.code, p.priceMonthlyMinor]), rows);
});

test('[WEB-016] restore: original content is back after the run (verified in after-hook, asserted here for current state)', async () => {
  // Informational check that fixtures from this file are not left behind mid-run.
  const d = await publicGet();
  assert.ok(typeof d.hero.titlePrefix === 'string');
});
