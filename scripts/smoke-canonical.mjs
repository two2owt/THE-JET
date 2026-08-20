#!/usr/bin/env node
/**
 * Smoke test: apex -> www redirect chain has no loops, and each critical
 * route serves a canonical + og:url on the canonical host.
 *
 * Usage: node scripts/smoke-canonical.mjs [--host www.jet-around.com]
 */

const args = process.argv.slice(2);
const hostArg = args.indexOf('--host');
const CANONICAL_HOST = hostArg > -1 ? args[hostArg + 1] : 'jet-around.com';
// --origin lets the same assertions run against a local dev/preview server:
// tags are still expected to point at the canonical production host.
const originArg = args.indexOf('--origin');
const ORIGIN = originArg > -1 ? args[originArg + 1] : null;
const APEX_HOST = CANONICAL_HOST.replace(/^www\./, '');
const MAX_HOPS = 5;

const ROUTES = [
  '/',
  '/auth',
  '/signin',
  '/signup',
  '/favorites',
  '/social',
  '/messages',
  '/profile',
  '/privacy-policy',
  '/terms-of-service',
];

const failures = [];
const fail = (msg) => { failures.push(msg); console.error(`  FAIL ${msg}`); };
const ok = (msg) => console.log(`  ok   ${msg}`);

async function followChain(startUrl) {
  const chain = [startUrl];
  let url = startUrl;
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const res = await fetch(url, { redirect: 'manual' });
    if (res.status < 300 || res.status >= 400) {
      return { chain, status: res.status, finalUrl: url };
    }
    const location = res.headers.get('location');
    if (!location) return { chain, status: res.status, finalUrl: url };
    const next = new URL(location, url).toString();
    if (chain.includes(next)) {
      chain.push(next);
      return { chain, status: res.status, finalUrl: next, loop: true };
    }
    chain.push(next);
    url = next;
  }
  return { chain, status: null, finalUrl: url, loop: true };
}

function extract(html, re) {
  const m = html.match(re);
  return m ? m[1] : null;
}

console.log(`Canonical host: https://${CANONICAL_HOST}\n`);

if (ORIGIN) console.log(`Fetching from origin: ${ORIGIN} (redirect checks skipped)\n`);

if (!ORIGIN) {
console.log('1) Redirect chains (apex + www)');
for (const host of [APEX_HOST, CANONICAL_HOST]) {
  for (const path of ['/', '/auth']) {
    const start = `https://${host}${path}`;
    const { chain, status, loop, finalUrl } = await followChain(start);
    if (loop) {
      fail(`${start} redirect loop: ${chain.join(' -> ')}`);
    } else if (status !== 200) {
      fail(`${start} -> ${status} (${finalUrl})`);
    } else if (new URL(finalUrl).host !== CANONICAL_HOST) {
      fail(`${start} settled on ${new URL(finalUrl).host}, expected ${CANONICAL_HOST}`);
    } else {
      ok(`${start} -> 200 @ ${finalUrl} (${chain.length - 1} hop(s))`);
    }
  }
}
}

console.log('\n2) Canonical + og:url tags');
for (const path of ROUTES) {
  const url = `https://${CANONICAL_HOST}${path}`;
  const res = await fetch(ORIGIN ? `${ORIGIN}${path}` : url, { redirect: 'follow' });
  if (res.status !== 200) { fail(`${path} -> HTTP ${res.status}`); continue; }
  const html = await res.text();
  const canonical = extract(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)
    ?? extract(html, /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
  const ogUrl = extract(html, /<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i)
    ?? extract(html, /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:url["']/i);

  for (const [label, value] of [['canonical', canonical], ['og:url', ogUrl]]) {
    if (!value) { fail(`${path} missing ${label}`); continue; }
    let parsed;
    try { parsed = new URL(value, url); } catch { fail(`${path} ${label} not a URL: ${value}`); continue; }
    if (parsed.protocol !== 'https:') fail(`${path} ${label} is not https: ${value}`);
    else if (parsed.host !== CANONICAL_HOST) fail(`${path} ${label} host ${parsed.host} != ${CANONICAL_HOST}`);
    else if (parsed.pathname.replace(/\/$/, '') !== path.replace(/\/$/, '')) fail(`${path} ${label} path mismatch: ${parsed.pathname}`);
    else ok(`${path} ${label} = ${value}`);
  }
}

console.log('');
if (failures.length) {
  console.error(`SMOKE FAILED — ${failures.length} issue(s)`);
  process.exit(1);
}
console.log('SMOKE PASSED — no redirect loops, canonical/og URLs correct');
