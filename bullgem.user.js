// ==UserScript==
// @name         Bullgem auto quest + auto mining
// @namespace    https://gem.bullshot.io
// @version      1.0.0
// @description  Klaim posisi mining yang siap dan kerjakan quest otomatis, jalan di dalam halaman gem.bullshot.io
// @match        https://gem.bullshot.io/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const API = 'https://gemapi.bullshot.io/api';
  const LOGIN_KEY = 'rg_jwt_token';
  const TICK = 45_000; // interval loop

  const token = () => {
    try { return localStorage.getItem(LOGIN_KEY); } catch { return null; }
  };

  async function api(path, { method = 'GET', body } = {}) {
    const t = token();
    if (!t) throw new Error('belum login di web — login dulu lewat UI Bullgem');
    const headers = { accept: 'application/json', authorization: `Bearer ${t}` };
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await fetch(API + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'include',
    });
    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 200) }; }
    if (!res.ok) throw new Error(`HTTP ${res.status} ${data?.error || data?.message || ''}`.trim());
    return data;
  }

  const arr = (d, k) => (Array.isArray(d) ? d : d?.[k] || d?.data || []);
  const ready = (p) =>
    p.status === 'ready' || p.status === 'completed' || (p.endsAt && new Date(p.endsAt) <= new Date());

  /* ---------- panel ---------- */
  const box = document.createElement('div');
  box.style.cssText = `position:fixed;right:16px;bottom:16px;z-index:999999;width:290px;
    background:#0f1115;color:#e6e6e6;font:12px/1.45 ui-monospace,Menlo,monospace;
    border:1px solid #2a2f3a;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.45);overflow:hidden`;
  box.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:#171a21;border-bottom:1px solid #2a2f3a">
      <b style="flex:1;color:#8ff">Bullgem Auto</b>
      <button id="bg-run" style="all:unset;cursor:pointer;padding:2px 8px;border-radius:6px;background:#1f6f45;color:#fff">start</button>
      <button id="bg-min" style="all:unset;cursor:pointer;padding:2px 6px;color:#889">—</button>
    </div>
    <pre id="bg-log" style="margin:0;padding:8px 10px;max-height:180px;overflow:auto;white-space:pre-wrap;color:#9fb3c8"></pre>`;
  document.body.appendChild(box);

  const logEl = box.querySelector('#bg-log');
  const btn = box.querySelector('#bg-run');
  const lines = [];
  const log = (m) => {
    lines.push(`${new Date().toLocaleTimeString('id-ID')} ${m}`);
    while (lines.length > 40) lines.shift();
    logEl.textContent = lines.join('\n');
    logEl.scrollTop = logEl.scrollHeight;
  };
  box.querySelector('#bg-min').onclick = () => {
    logEl.style.display = logEl.style.display === 'none' ? 'block' : 'none';
  };

  /* ---------- actions ---------- */
  let running = false;
  let timer = null;

  async function claimPositions() {
    const list = arr(await api('/mining/positions'), 'positions');
    let n = 0;
    for (const p of list.filter(ready)) {
      try {
        await api(`/mining/positions/${p.id}/claim`, { method: 'POST' });
        n++;
        log(`claim ${p.id} ✓`);
      } catch (e) {
        log(`claim ${p.id} ✗ ${e.message}`);
      }
    }
    return { claimed: n, active: list.filter((p) => !ready(p)).length, total: list.length };
  }

  async function startPosition() {
    const locs = arr(await api('/mining/locations'), 'locations');
    const usable = locs.filter((l) => l.unlocked !== false);
    const pick = usable[usable.length - 1] || locs[locs.length - 1];
    if (!pick) throw new Error('tidak ada lokasi mining');
    const pos = await api('/mining/positions', {
      method: 'POST',
      body: { locationId: pick.id, strategy: 'balanced' },
    });
    log(`start ${pick.name || pick.id} → ${pos?.id || '?'}`);
    return pos;
  }

  async function doQuests() {
    const list = arr(await api('/quests'), 'quests');
    for (const q of list) {
      const id = q.questId || q.id;
      const st = q.status;
      try {
        if (['available', 'locked', 'not_started'].includes(st)) {
          await api('/quests/start', { method: 'POST', body: { questId: id } });
          log(`quest start ${id}`);
        } else if (st === 'ready' || st === 'completed') {
          if (q.requiresTweet) { log(`quest ${id} butuh tweet, dilewati`); continue; }
          await api('/quests/claim', { method: 'POST', body: { questId: id, tweetUrl: '' } });
          log(`quest claim ${id} ✓`);
        }
      } catch (e) {
        log(`quest ${id} ✗ ${e.message}`);
      }
    }
  }

  async function tick() {
    if (!running) return;
    try {
      const r = await claimPositions();
      if (r.active === 0) await startPosition();
      else log(`aktif ${r.active} posisi`);
      await doQuests();
    } catch (e) {
      log(`error: ${e.message}`);
      if (/401/.test(e.message)) stop('sesi habis — login ulang di web');
    }
    if (running) timer = setTimeout(tick, TICK);
  }

  function start() {
    if (!token()) return log('belum login — login dulu di halaman Bullgem');
    running = true;
    btn.textContent = 'stop';
    btn.style.background = '#7a2c2c';
    log('loop mulai');
    tick();
  }
  function stop(msg) {
    running = false;
    clearTimeout(timer);
    btn.textContent = 'start';
    btn.style.background = '#1f6f45';
    if (msg) log(msg);
  }
  btn.onclick = () => (running ? stop('loop berhenti') : start());

  log('siap · tekan start (interval 45s)');
})();
