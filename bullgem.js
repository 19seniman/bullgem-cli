#!/usr/bin/env node
// Bullgem (https://gem.bullshot.io) CLI — login wallet/email, auto quest, auto mining.
// Endpoint & payload diambil dari bundle produksi /assets/index-BTmGa2gL.js (app 2026-11).
// Private key dibaca dari .env di folder ini; tidak pernah dicetak atau dikirim ke mana pun
// selain dipakai untuk menandatangani pesan login (EIP-191) secara lokal.

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const API = 'https://gemapi.bullshot.io/api';
const TOKENS = path.join(HERE, '.tokens.json');
const argv = process.argv.slice(2);
const cmd = argv[0] || 'help';
const arg = (k, d = null) => {
  const i = argv.indexOf(k);
  return i > -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const has = (k) => argv.includes(k);

/* ---------- env ---------- */
function loadEnv() {
  const out = { ...process.env };
  const p = path.join(HERE, '.env');
  if (fs.existsSync(p)) {
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (v !== '') out[m[1]] = v;
    }
  }
  return out;
}
const ENV = loadEnv();

/* ---------- tokens ---------- */
function loadTokens() {
  try { return JSON.parse(fs.readFileSync(TOKENS, 'utf8')); } catch { return {}; }
}
function saveTokens(t) {
  fs.writeFileSync(TOKENS, JSON.stringify(t, null, 2), { mode: 0o600 });
  try { fs.chmodSync(TOKENS, 0o600); } catch {}
}

/* ---------- http ---------- */
async function api(endpoint, { method = 'GET', body, auth = true } = {}) {
  const t = loadTokens();
  const headers = { accept: 'application/json', origin: 'https://gem.bullshot.io', referer: 'https://gem.bullshot.io/' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (auth && t.token) headers.authorization = `Bearer ${t.token}`;
  const res = await fetch(API + endpoint, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  if (text.trimStart().startsWith('<!')) {
    const err = new Error(`HTTP ${res.status} — Cloudflare memblokir request (halaman HTML, bukan JSON).`);
    err.cf = true;
    throw err;
  }
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 300) }; }
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} ${data?.error || data?.message || ''}`.trim());
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

/* ---------- auth ---------- */
async function loginWallet(pk, refCode) {
  const { Wallet } = await import('ethers');
  const w = new Wallet(pk);
  const address = w.address.toLowerCase();
  const nonce = await api('/auth/nonce', { method: 'POST', body: { walletAddress: address }, auth: false });
  const message = nonce?.message || `Sign in to Bull GEM on Base: ${nonce?.nonce}`;
  const signature = await w.signMessage(message);
  const res = await api('/auth/login', { method: 'POST', body: { walletAddress: address, signature, message, refCode: refCode || undefined }, auth: false });
  if (!res?.token) throw new Error('login tidak mengembalikan token: ' + JSON.stringify(res).slice(0, 200));
  saveTokens({ token: res.token, account: address, mode: 'wallet', at: new Date().toISOString() });
  return { address, user: res.user };
}

async function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const a = await rl.question(q);
  rl.close();
  return a.trim();
}

async function loginEmail(email) {
  await api('/auth/email/start', { method: 'POST', body: { email }, auth: false });
  console.log(`kode OTP dikirim ke ${email}`);
  const code = await ask('kode OTP: ');
  const res = await api('/auth/email/verify', { method: 'POST', body: { email, code }, auth: false });
  if (!res?.token) throw new Error('verifikasi gagal: ' + JSON.stringify(res).slice(0, 200));
  const account = (res.user?.walletAddress || res.user?.handle || `miner_${res.user?.id ?? ''}`).toLowerCase();
  saveTokens({ token: res.token, account, mode: 'email', at: new Date().toISOString() });
  return { account, user: res.user };
}

async function ensureLogin() {
  const t = loadTokens();
  if (t.token) {
    try {
      await api('/user/balance');
      return t;
    } catch (e) {
      if (e.status !== 401) throw e;
      console.log('token kedaluwarsa, login ulang…');
    }
  }
  if (ENV.PRIVATE_KEY) {
    const r = await loginWallet(ENV.PRIVATE_KEY, ENV.REF_CODE);
    console.log(`login wallet OK · ${r.address}`);
    return loadTokens();
  }
  if (ENV.EMAIL) {
    const r = await loginEmail(ENV.EMAIL);
    console.log(`login email OK · ${r.account}`);
    return loadTokens();
  }
  throw new Error('isi PRIVATE_KEY atau EMAIL di .env dulu');
}

/* ---------- views ---------- */
const gems = (n) => (typeof n === 'number' ? n.toLocaleString('id-ID') : n);

async function status() {
  const [bal, me] = await Promise.all([api('/user/balance'), api('/user/me').catch(() => null)]);
  console.log('akun   :', loadTokens().account || '-');
  console.log('balance:', JSON.stringify(bal));
  if (me) console.log('profil :', me.handle || me.username || me.id || JSON.stringify(me).slice(0, 160));
}

async function locations() {
  const data = await api('/mining/locations');
  const list = Array.isArray(data) ? data : data?.locations || data?.data || [];
  if (!list.length) return console.log(JSON.stringify(data, null, 2).slice(0, 1200));
  for (const l of list) {
    const req = l.requiredLevel ? ` · min lvl ${l.requiredLevel}` : '';
    const unlock = l.unlocked === false ? ' · terkunci' : '';
    console.log(`${String(l.id).padEnd(22)} ${l.name || ''}${req}${unlock}`);
  }
}

async function positions() {
  const data = await api('/mining/positions');
  const list = Array.isArray(data) ? data : data?.positions || data?.data || [];
  if (!list.length) return console.log('tidak ada posisi mining aktif');
  for (const p of list) {
    console.log(`${p.id} · ${p.locationName || p.locationId} · ${p.status || '?'} · ends ${p.endsAt || '-'}`);
  }
}

/* ---------- mining ---------- */
async function mineOnce({ locationId, spotId, strategy }) {
  const body = { locationId };
  if (spotId) body.spotId = spotId;
  if (strategy) body.strategy = strategy;
  const pos = await api('/mining/positions', { method: 'POST', body });
  console.log(`mining dimulai · ${pos.locationName || locationId} · id ${pos.id} · ends ${pos.endsAt || '?'}`);
  return pos;
}

const isReady = (p) => p.status === 'ready' || p.status === 'completed' || (p.endsAt && new Date(p.endsAt).getTime() <= Date.now());

async function claimAll() {
  const data = await api('/mining/positions');
  const list = Array.isArray(data) ? data : data?.positions || data?.data || [];
  let claimed = 0;
  for (const p of list.filter(isReady)) {
    try {
      const r = await api(`/mining/positions/${p.id}/claim`, { method: 'POST' });
      claimed++;
      console.log(`claim ${p.id} → ${JSON.stringify(r).slice(0, 120)}`);
    } catch (e) {
      console.log(`claim ${p.id} gagal: ${e.message}`);
    }
  }
  return claimed;
}

async function pickLocation() {
  if (ENV.MINING_LOCATION) return { locationId: ENV.MINING_LOCATION, spotId: ENV.MINING_SPOT, strategy: ENV.MINING_STRATEGY };
  const data = await api('/mining/locations');
  const list = Array.isArray(data) ? data : data?.locations || data?.data || [];
  const open = list.filter((l) => l.unlocked !== false && (!l.requiredLevel || l.requiredLevel <= (l.playerLevel ?? 999)));
  const pick = open[open.length - 1] || list[list.length - 1];
  if (!pick) throw new Error('tidak ada lokasi mining yang tersedia');
  return { locationId: pick.id, strategy: ENV.MINING_STRATEGY };
}

async function miningLoop() {
  const poll = Math.max(10, Number(ENV.POLL_SECONDS || 30));
  console.log(`loop mining · poll ${poll}s · Ctrl+C stop`);
  for (;;) {
    try {
      await claimAll();
      const data = await api('/mining/positions');
      const list = Array.isArray(data) ? data : data?.positions || data?.data || [];
      const active = list.filter((p) => !isReady(p));
      if (!active.length) {
        const cfg = await pickLocation();
        await mineOnce(cfg);
      } else {
        const nxt = active[0];
        const left = nxt.endsAt ? Math.max(0, Math.round((new Date(nxt.endsAt) - Date.now()) / 1000)) : '?';
        console.log(`${new Date().toLocaleTimeString('id-ID')} · aktif ${active.length} · sisa ${left}s`);
      }
    } catch (e) {
      console.log(`error: ${e.message}`);
      if (e.cf) console.log('→ jalankan dari jaringan rumah, bukan VPS; atau tunggu beberapa menit.');
    }
    await new Promise((r) => setTimeout(r, poll * 1000));
  }
}

/* ---------- quests ---------- */
async function quests(auto = false, tweetUrl = '') {
  const data = await api('/quests');
  const list = Array.isArray(data) ? data : data?.quests || data?.data || [];
  if (!list.length) return console.log(JSON.stringify(data, null, 2).slice(0, 1500));
  for (const q of list) {
    console.log(`${String(q.questId || q.id).padEnd(28)} ${String(q.status || '?').padEnd(12)} ${q.title || q.name || ''}${q.reward ? ' · ' + q.reward : ''}`);
  }
  if (!auto) return;

  for (const q of list) {
    const id = q.questId || q.id;
    const st = q.status;
    try {
      if (st === 'available' || st === 'locked' || st === 'not_started' || st === 'in_progress') {
        if (st !== 'in_progress') {
          await api('/quests/start', { method: 'POST', body: { questId: id } });
          console.log(`start ${id}`);
        }
      }
      if (st === 'ready' || st === 'completed') {
        const needsTweet = !!q.requiresTweet || /twitter|x\.com/i.test(q.verificationType || '');
        if (needsTweet && !tweetUrl) {
          console.log(`lewati ${id} (butuh tweetUrl, pakai --tweet-url)`);
          continue;
        }
        const r = await api('/quests/claim', { method: 'POST', body: { questId: id, tweetUrl: tweetUrl || '' } });
        console.log(`claim ${id} → ${JSON.stringify(r).slice(0, 100)}`);
      }
    } catch (e) {
      console.log(`${id}: ${e.message}`);
    }
  }
}

/* ---------- main ---------- */
try {
  if (cmd === 'login') {
    if (ENV.PRIVATE_KEY) {
      const r = await loginWallet(ENV.PRIVATE_KEY, ENV.REF_CODE);
      console.log(`login wallet OK · ${r.address}`);
    } else if (ENV.EMAIL || arg('--email')) {
      const r = await loginEmail(ENV.EMAIL || arg('--email'));
      console.log(`login email OK · ${r.account}`);
    } else {
      console.error('isi PRIVATE_KEY atau EMAIL di .env');
      process.exit(1);
    }
  } else if (cmd === 'status') {
    await ensureLogin();
    await status();
  } else if (cmd === 'locations') {
    await ensureLogin();
    await locations();
  } else if (cmd === 'positions') {
    await ensureLogin();
    await positions();
  } else if (cmd === 'quests') {
    await ensureLogin();
    await quests(has('--auto'), arg('--tweet-url', ''));
  } else if (cmd === 'mine') {
    await ensureLogin();
    if (has('--once')) {
      await claimAll();
      const cfg = await pickLocation();
      await mineOnce(cfg);
    } else {
      await miningLoop();
    }
  } else if (cmd === 'auto') {
    await ensureLogin();
    console.log('mode auto: quest → mining loop');
    await quests(true, arg('--tweet-url', ''));
    await miningLoop();
  } else if (cmd === 'whoami') {
    const t = loadTokens();
    console.log(t.token ? `${t.account} (${t.mode}) sejak ${t.at}` : 'belum login');
  } else {
    console.log(`bullgem.js — CLI untuk gem.bullshot.io

  node bullgem.js login              login pakai PRIVATE_KEY (atau EMAIL → OTP)
  node bullgem.js status             saldo + profil
  node bullgem.js locations          daftar tambang
  node bullgem.js positions          posisi mining aktif
  node bullgem.js quests             daftar quest
  node bullgem.js quests --auto      start & claim semua yang bisa
  node bullgem.js mine --once        klaim yang siap, lalu mulai satu posisi
  node bullgem.js mine               loop mining (claim → start → tunggu)
  node bullgem.js auto               quest otomatis + loop mining
  node bullgem.js whoami             cek sesi tersimpan

.env: PRIVATE_KEY atau EMAIL, REF_CODE, MINING_LOCATION, POLL_SECONDS`);
  }
} catch (e) {
  console.error('error:', e.message);
  if (e.cf) console.error('→ Cloudflare menolak request dari IP ini. Jalankan dari jaringan rumah, atau coba lagi nanti.');
  if (e.data) console.error('detail:', JSON.stringify(e.data).slice(0, 300));
  process.exit(1);
}
