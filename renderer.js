/* GLBN — renderer.js: вся логика интерфейса */
'use strict';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const FLAGS = [
  [['de', 'germany', 'герман', 'frankfurt', 'франкфурт'], '🇩🇪'],
  [['nl', 'netherland', 'нидерланд', 'amsterdam', 'амстердам'], '🇳🇱'],
  [['fr', 'france', 'франц', 'paris', 'париж'], '🇫🇷'],
  [['us', 'united states', 'usa', 'америк', 'new york'], '🇺🇸'],
  [['gb', 'uk', 'britain', 'англ', 'london', 'лондон'], '🇬🇧'],
  [['fi', 'finland', 'финлянд', 'helsinki'], '🇫🇮'],
  [['se', 'sweden', 'швец', 'stockholm'], '🇸🇪'],
  [['pl', 'poland', 'польш', 'warsaw'], '🇵🇱'],
  [['jp', 'japan', 'япон', 'tokyo', 'токио'], '🇯🇵'],
  [['sg', 'singapore', 'сингапур'], '🇸🇬'],
  [['tr', 'turkey', 'турц', 'istanbul'], '🇹🇷'],
  [['kz', 'kazakh', 'казахстан', 'almaty'], '🇰🇿'],
  [['ua', 'ukrain', 'украин', 'kyiv', 'киев'], '🇺🇦'],
  [['ee', 'estonia', 'эстон', 'tallinn'], '🇪🇪'],
  [['lv', 'latvia', 'латв', 'riga'], '🇱🇻'],
  [['lt', 'lithuan', 'литв', 'vilnius'], '🇱🇹'],
  [['ca', 'canada', 'канад', 'toronto'], '🇨🇦'],
  [['ch', 'switzer', 'швейцар', 'zurich'], '🇨🇭'],
  [['at', 'austria', 'австр', 'vienna'], '🇦🇹'],
  [['it', 'italy', 'итал', 'milan'], '🇮🇹'],
  [['es', 'spain', 'испан', 'madrid'], '🇪🇸'],
  [['ae', 'emirat', 'dubai', 'дубай'], '🇦🇪'],
  [['hk', 'hong kong', 'гонконг'], '🇭🇰'],
  [['kr', 'korea', 'коре'], '🇰🇷'],
  [['in', 'india', 'индия', 'mumbai'], '🇮🇳'],
  [['ru', 'russia', 'росси', 'москв', 'moscow'], '🇷🇺']
];

function flagFor(p) {
  const s = ((p.name || '') + ' ' + (p.address || '')).toLowerCase();
  for (const [keys, flag] of FLAGS) {
    if (keys.some((k) => s.includes(k))) return flag;
  }
  return '🌐';
}

function fmtSize(kbps) {
  if (kbps < 1000) return { v: Math.round(kbps), u: 'КБ/с' };
  return { v: (kbps / 1024).toFixed(1), u: 'МБ/с' };
}
const pad = (n) => String(n).padStart(2, '0');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let state = {
  profiles: [],
  settings: { theme: 'midnight', accent: '#7c5cff', animations: true, xrayPath: '', startMinimized: false, systemProxy: true },
  lastProfileId: null
};
let connState = 'off';           // off | connecting | connected
let sysProxyApplied = false;
let sessionStart = 0;
let timers = { session: null, chart: null, ping: null };
let chart = { up: new Array(90).fill(0), down: new Array(90).fill(0) };

const api = window.glbn || {
  storeGet: async () => state,
  storeSet: async () => true,
  winMinimize: () => {},
  winClose: () => window.close(),
  writeConfig: async () => null,
  xrayStart: async () => ({ ok: false, error: 'нет моста' }),
  xrayStop: async () => {},
  ping: async () => ({ ok: false, ms: null }),
  sysProxyOn: async () => ({ ok: false }),
  sysProxyOff: async () => ({ ok: false }),
  onXrayExit: () => {}
};

/* ---------- toasts ---------- */
function toast(msg, kind) {
  const el = document.createElement('div');
  el.className = 'toast' + (kind ? ' ' + kind : '');
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.classList.add('hide'); setTimeout(() => el.remove(), 320); }, 3200);
}

/* ---------- theme ---------- */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme || 'midnight');
  $$('.theme-tile').forEach((t) => t.classList.toggle('active', t.dataset.theme === theme));
}
function applyAccent(accent) {
  if (accent) document.documentElement.style.setProperty('--accent', accent);
  $$('.acc').forEach((a) => a.classList.toggle('active', a.dataset.accent === accent));
}
function applyAnimations(on) {
  document.body.classList.toggle('no-anim', !on);
}

/* ---------- persistence ---------- */
async function save() {
  await api.storeSet(JSON.parse(JSON.stringify(state)));
}

/* ---------- navigation ---------- */
function go(view) {
  $$('.view').forEach((v) => { v.hidden = v.id !== 'view-' + view; });
  $$('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  if (view === 'home') requestAnimationFrame(drawChart);
  if (view === 'servers') refreshPings();
}

/* ---------- server list ---------- */
function currentProfile() {
  return state.profiles.find((p) => p.id === state.lastProfileId) || null;
}

function renderServers() {
  const list = $('#server-list');
  list.innerHTML = '';
  const has = state.profiles.length > 0;
  $('#server-empty').hidden = has;

  state.profiles.forEach((p, i) => {
    const el = document.createElement('div');
    el.className = 'srv' + (p.id === state.lastProfileId ? ' selected' : '');
    el.style.animationDelay = (i * 35) + 'ms';
    el.dataset.id = p.id;
    const addr = p.protocol === 'subscription' ? (p.url || p.address) : (p.address + ':' + p.port);
    el.innerHTML =
      '<div class="srv-flag">' + flagFor(p) + '</div>' +
      '<div class="srv-body">' +
        '<div class="srv-name">' + esc(p.name) + '</div>' +
        '<div class="srv-sub">' + esc(addr) + '</div>' +
      '</div>' +
      '<div class="srv-meta">' +
        '<span class="proto-tag">' + esc(p.protocol.toUpperCase()) + '</span>' +
        '<span class="ping" data-ping="' + esc(p.address) + '">—</span>' +
      '</div>' +
      '<button class="srv-del" title="Удалить">' +
        '<svg viewBox="0 0 16 16" width="15" height="15" fill="none"><path d="M4.5 6v6.5M8 6v6.5M11.5 6v6.5M3.2 3.8h9.6M6.4 3.8V2.6h3.2v1.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>' +
      '</button>';

    el.addEventListener('click', (e) => {
      if (e.target.closest('.srv-del')) return;
      selectProfile(p.id);
    });
    el.querySelector('.srv-del').addEventListener('click', async (e) => {
      e.stopPropagation();
      state.profiles = state.profiles.filter((x) => x.id !== p.id);
      if (state.lastProfileId === p.id) state.lastProfileId = state.profiles[0] ? state.profiles[0].id : null;
      await save();
      renderServers(); renderCurrent();
      toast('Профиль удалён');
    });
    list.appendChild(el);
  });
  renderCurrent();
}

function selectProfile(id) {
  state.lastProfileId = id;
  save();
  renderServers();
  toast('Выбран: ' + (currentProfile() ? currentProfile().name : ''), 'ok');
  if (connState === 'connected') reconnectForNewProfile();
}

function renderCurrent() {
  const p = currentProfile();
  if (p) {
    $('#cur-flag').textContent = flagFor(p);
    $('#cur-name').textContent = p.name;
    $('#cur-sub').textContent = p.protocol === 'subscription' ? 'подписка' : (p.protocol + ' · ' + p.address + ':' + p.port);
  } else {
    $('#cur-flag').textContent = '🌐';
    $('#cur-name').textContent = 'Сервер не выбран';
    $('#cur-sub').textContent = 'нажми, чтобы выбрать';
  }
}

function refreshPings() {
  const targets = $$('.ping[data-ping]');
  targets.forEach(async (el, i) => {
    const host = el.dataset.ping;
    el.textContent = '…';
    el.className = 'ping';
    await new Promise((r) => setTimeout(r, i * 120));
    const res = await api.ping(host);
    if (res && res.ok) {
      el.textContent = res.ms + ' мс';
      el.className = 'ping ' + (res.ms < 150 ? 'good' : res.ms < 400 ? 'mid' : 'bad');
    } else {
      el.textContent = 'н/д';
      el.className = 'ping bad';
    }
  });
}

/* ---------- connection ---------- */
function setLabelAndDemo() {
  const demo = !state.settings.xrayPath;
  $('#demo-badge').hidden = !demo;
}

async function connect() {
  const p = currentProfile();
  if (!p) { toast('Сначала добавь и выбери прокси-ссылку', 'err'); go('servers'); return; }
  if (p.protocol === 'subscription') {
    toast('Это ссылка-подписка: выбери конкретный сервер из неё', 'err');
    return;
  }
  connState = 'connecting';
  document.body.dataset.state = 'connecting';
  $('#state-label').textContent = 'Подключение…';
  $('#graph-caption').textContent = 'поднимаем туннель…';

  const cfg = window.GLBNParse.buildXrayConfig(p, 10808);
  if (!cfg) { toast('Не удалось собрать конфиг для этого типа', 'err'); disconnect(true); return; }

  if (!state.settings.xrayPath) {
    // демо-режим: имитируем
    setTimeout(() => {
      if (connState !== 'connecting') return;
      connState = 'connected';
      document.body.dataset.state = 'connected';
      $('#state-label').textContent = 'Подключено';
      startSession();
    }, 1400);
    return;
  }

  try {
    const cfgPath = await api.writeConfig(cfg);
    const res = await api.xrayStart(state.settings.xrayPath, cfgPath);
    if (!res.ok) {
      toast(res.error || 'Ошибка запуска xray', 'err');
      disconnect(true);
      return;
    }
    connState = 'connected';
    document.body.dataset.state = 'connected';
    $('#state-label').textContent = 'Подключено';
    $('#graph-caption').textContent = 'SOCKS5 активен на 127.0.0.1:10808';
    if (state.settings.systemProxy !== false) {
      const sp = await api.sysProxyOn('socks=127.0.0.1:10808');
      if (sp && sp.ok) {
        sysProxyApplied = true;
        $('#graph-caption').textContent = 'системный прокси → 127.0.0.1:10808';
      } else {
        toast('Не удалось включить системный прокси — направь приложения вручную на SOCKS5 127.0.0.1:10808', 'err');
      }
    }
    startSession();
    toast('Туннель поднят', 'ok');
  } catch (err) {
    toast('Ошибка: ' + (err && err.message ? err.message : err), 'err');
    disconnect(true);
  }
}

function disconnect(silent) {
  connState = 'off';
  if (sysProxyApplied) { sysProxyApplied = false; api.sysProxyOff(); }
  document.body.dataset.state = 'off';
  $('#state-label').textContent = 'Отключено';
  $('#session-timer').hidden = true;
  $('#graph-caption').textContent = 'график трафика оживёт после подключения';
  stopSession();
  api.xrayStop();
  chart.up = chart.up.map(() => 0); chart.down = chart.down.map(() => 0);
  $('#speed-up').innerHTML = '0 <small>КБ/с</small>';
  $('#speed-down').innerHTML = '0 <small>КБ/с</small>';
  drawChart();
  if (!silent) toast('Отключено');
}

function reconnectForNewProfile() {
  api.xrayStop();
  stopSession();
  toast('Переподключаю на новый сервер…');
  setTimeout(() => { connState = 'off'; connect(); }, 400);
}

function startSession() {
  sessionStart = Date.now();
  $('#session-timer').hidden = false;
  tickSession();
  timers.session = setInterval(tickSession, 1000);
  timers.chart = setInterval(tickTraffic, 900);
}
function stopSession() {
  clearInterval(timers.session); clearInterval(timers.chart);
  timers.session = timers.chart = null;
  sessionStart = 0;
}
function tickSession() {
  const s = Math.floor((Date.now() - sessionStart) / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  $('#session-timer').textContent = (h > 0 ? h + ':' + pad(m) : pad(m)) + ':' + pad(sec);
}

/* ---------- traffic + chart ---------- */
function tickTraffic() {
  const base = connState === 'connected' ? 1 : 0;
  const up = base * (30 + Math.abs(Math.sin(Date.now() / 3400)) * 260 + Math.random() * 90);
  const down = base * (60 + Math.abs(Math.cos(Date.now() / 2600)) * 520 + Math.random() * 180);
  chart.up.push(up); chart.up.shift();
  chart.down.push(down); chart.down.shift();
  const fu = fmtSize(up), fd = fmtSize(down);
  $('#speed-up').innerHTML = fu.v + ' <small>' + fu.u + '</small>';
  $('#speed-down').innerHTML = fd.v + ' <small>' + fd.u + '</small>';
  drawChart();
}

function drawChart() {
  const cv = $('#graph');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  const max = Math.max(120, ...chart.up, ...chart.down) * 1.15;
  const line = (arr, color, fill) => {
    ctx.beginPath();
    for (let i = 0; i < arr.length; i++) {
      const x = (i / (arr.length - 1)) * W;
      const y = H - (arr[i] / max) * (H - 10) - 4;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    ctx.beginPath();
    for (let i = 0; i < arr.length; i++) {
      const x = (i / (arr.length - 1)) * W;
      const y = H - (arr[i] / max) * (H - 10) - 4;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
  };
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#7c5cff';
  const accent2 = getComputedStyle(document.documentElement).getPropertyValue('--accent2').trim() || '#4ea8ff';
  line(chart.down, accent2, 'rgba(78,168,255,.16)');
  line(chart.up, accent, 'rgba(124,92,255,.18)');
}

/* ---------- modal ------ */
function openModal() {
  $('#inp-link').value = '';
  $('#inp-name').value = '';
  $('#modal-err').hidden = true;
  $('#modal-back').hidden = false;
  setTimeout(() => $('#inp-link').focus(), 60);
}
function closeModal() { $('#modal-back').hidden = true; }

async function addFromModal() {
  const link = $('#inp-link').value.trim();
  const name = $('#inp-name').value.trim();
  const err = $('#modal-err');
  if (!link) { err.textContent = 'Вставь ссылку'; err.hidden = false; return; }
  const p = window.GLBNParse.parseShareLink(link);
  if (!p) {
    err.textContent = 'Не распознал ссылку. Поддерживаю vless:// vmess:// trojan:// ss:// и https-подписки.';
    err.hidden = false;
    return;
  }
  if (name) p.name = name;
  state.profiles.push(p);
  state.lastProfileId = p.id;
  await save();
  renderServers();
  closeModal();
  go('servers');
  toast('Добавлено: ' + p.name, 'ok');
}

/* ---------- settings wiring ---------- */
function bindSettings() {
  $$('.theme-tile').forEach((t) => t.addEventListener('click', () => {
    state.settings.theme = t.dataset.theme; applyTheme(t.dataset.theme); save();
  }));
  $$('.acc').forEach((a) => a.addEventListener('click', () => {
    state.settings.accent = a.dataset.accent; applyAccent(a.dataset.accent); save(); drawChart();
  }));
  $('#opt-anim').addEventListener('change', (e) => {
    state.settings.animations = e.target.checked; applyAnimations(e.target.checked); save();
  });
  $('#opt-min').addEventListener('change', (e) => {
    state.settings.startMinimized = e.target.checked; save();
  });
  $('#opt-sysproxy').addEventListener('change', (e) => {
    state.settings.systemProxy = e.target.checked;
    if (!e.target.checked && sysProxyApplied) { sysProxyApplied = false; api.sysProxyOff(); }
    save();
  });
  $('#opt-xray').addEventListener('change', (e) => {
    state.settings.xrayPath = e.target.value.trim();
    setLabelAndDemo(); save();
    $('#xray-hint').textContent = state.settings.xrayPath ? 'Путь сохранён. Подключение будет через xray.exe.' : '';
  });
  $('#opt-xray').addEventListener('input', (e) => {
    state.settings.xrayPath = e.target.value.trim();
    setLabelAndDemo();
  });
}

/* ---------- boot ---------- */
async function boot() {
  try {
    const data = await api.storeGet();
    if (data) {
      state.profiles = Array.isArray(data.profiles) ? data.profiles : [];
      state.settings = Object.assign(state.settings, data.settings || {});
      state.lastProfileId = data.lastProfileId || null;
    }
  } catch (e) { /* первая загрузка */ }

  applyTheme(state.settings.theme);
  applyAccent(state.settings.accent);
  applyAnimations(state.settings.animations);
  $('#opt-anim').checked = !!state.settings.animations;
  $('#opt-min').checked = !!state.settings.startMinimized;
  $('#opt-sysproxy').checked = state.settings.systemProxy !== false;
  $('#opt-xray').value = state.settings.xrayPath || '';
  $('#xray-hint').textContent = state.settings.xrayPath ? 'Путь сохранён. Подключение будет через xray.exe.' : '';
  setLabelAndDemo();

  renderServers();
  drawChart();

  document.body.dataset.state = 'off';
  $('#power').addEventListener('click', () => {
    if (connState === 'off') connect();
    else if (connState === 'connected') disconnect();
  });
  $('#current-server').addEventListener('click', () => go('servers'));

  $$('.nav-btn').forEach((b) => b.addEventListener('click', () => go(b.dataset.view)));
  $('#btn-add').addEventListener('click', openModal);
  $('#btn-add-empty').addEventListener('click', openModal);
  $('#modal-x').addEventListener('click', closeModal);
  $('#modal-cancel').addEventListener('click', closeModal);
  $('#modal-save').addEventListener('click', addFromModal);
  $('#modal-back').addEventListener('click', (e) => { if (e.target.id === 'modal-back') closeModal(); });
  $('#inp-link').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) addFromModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  $('#btn-min').addEventListener('click', () => api.winMinimize());
  $('#btn-close').addEventListener('click', () => api.winClose());

  bindSettings();
  api.onXrayExit((code) => {
    if (connState === 'connected') {
      toast('xray завершился (код ' + code + ')', 'err');
      disconnect(true);
    }
  });

  window.addEventListener('resize', drawChart);
}

document.addEventListener('DOMContentLoaded', boot);
