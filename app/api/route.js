// 共享账本 — Vercel 部署版
// 改用 Vercel KV (Upstash Redis) 做持久化,SSE 通过 Response 流式返回
// 数据模型保持与本地版兼容

import { Redis } from '@upstash/redis';

const INITIAL_BALANCE = 10000;
const KEY_STATE = 'ledger:state';

let redis = null;
function getRedis() {
  if (!redis) {
    redis = Redis.fromEnv();
  }
  return redis;
}

async function loadState() {
  try {
    const obj = await getRedis().get(KEY_STATE);
    if (obj && Array.isArray(obj.entries)) return obj;
  } catch (e) { console.error('KV read fail:', e.message); }
  return { nextId: 1, entries: [] };
}
async function saveState(state) {
  try { await getRedis().set(KEY_STATE, state); }
  catch (e) { console.error('KV write fail:', e.message); throw e; }
}

function getBalance(state) {
  const used = state.entries.reduce((s, e) => s + e.total, 0);
  return {
    balance: Math.round((INITIAL_BALANCE - used) * 100) / 100,
    used:    Math.round(used * 100) / 100
  };
}
function snapshot(state) {
  return { ...getBalance(state), initial: INITIAL_BALANCE, entries: state.entries.slice().reverse() };
}

// ---------- SSE 订阅者管理 ----------
// 简单做法: 用 KV 的 pub/sub 广播 — 不可行(KV 本身不暴露 pubsub 给普通 key)
// 改用轮询 + push: 客户端连 /api/events 返回 SSE,服务端每 2 秒主动查一次最新余额变化
// 成本极低: 一台小机器 < 1000 个用户并发无压力
const channels = new Set();
function broadcast(snap) {
  const data = JSON.stringify(snap);
  const msg = `event: update\ndata: ${data}\n\n`;
  for (const res of channels) {
    try { res.write(msg); } catch (_) {}
  }
}
let lastSig = '';
async function tick() {
  try {
    const state = await loadState();
    const sig = state.entries.length + ':' + (state.entries[state.entries.length - 1]?.id || 0);
    if (sig !== lastSig) {
      lastSig = sig;
      broadcast(snapshot(state));
    }
  } catch (_) {}
}
setInterval(tick, 1500);

// ---------- API 路由 ----------
export async function GET(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  // 静态首页
  if (path === '/' || path === '/index.html') {
    return new Response(HTML, {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  }

  if (path === '/api/state') {
    const state = await loadState();
    return Response.json(snapshot(state));
  }

  if (path === '/api/events') {
    const stream = new ReadableStream({
      start(controller) {
        const enc = new TextEncoder();
        // hello 帧: 推一次当前状态
        (async () => {
          const state = await loadState();
          const data = JSON.stringify(snapshot(state));
          controller.enqueue(enc.encode(`event: hello\ndata: ${data}\n\n`));
        })();
        // 包装 controller 让 broadcast 写入
        channels.add({
          write(chunk) {
            try { controller.enqueue(enc.encode(chunk)); } catch (_) {}
          }
        });
        // keepalive
        const ka = setInterval(() => {
          try { controller.enqueue(enc.encode(`: ka ${Date.now()}\n\n`)); } catch (_) {}
        }, 15000);
        request.signal.addEventListener('abort', () => {
          clearInterval(ka);
          channels.delete(channels.size - 1);
        });
      }
    });
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      }
    });
  }

  return new Response('Not Found', { status: 404 });
}

export async function POST(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === '/api/charge') {
    let body;
    try { body = await request.json(); } catch (_) { return Response.json({ error: 'JSON 解析失败' }, { status: 400 }); }
    const { operator, note, breakdown } = body || {};
    if (!operator || typeof operator !== 'string' || !operator.trim()) {
      return Response.json({ error: '请填写操作人姓名' }, { status: 400 });
    }
    if (!Array.isArray(breakdown) || breakdown.length === 0) {
      return Response.json({ error: '请至少添加一组人数配置' }, { status: 400 });
    }
    const normalized = [];
    let total = 0;
    for (const it of breakdown) {
      const count = Number(it.count);
      const price = Number(it.price);
      if (!Number.isInteger(count) || count <= 0)  return Response.json({ error: '人数必须是正整数' }, { status: 400 });
      if (!Number.isFinite(price) || price <= 0)   return Response.json({ error: '人均金额必须大于 0' }, { status: 400 });
      const sub = Math.round(count * price * 100) / 100;
      normalized.push({ price: Math.round(price * 100) / 100, count, subtotal: sub });
      total += sub;
    }
    total = Math.round(total * 100) / 100;
    const state = await loadState();
    if (total > getBalance(state).balance) {
      return Response.json({ error: `余额不足,本次需要 ${total} 元,剩余 ${getBalance(state).balance} 元` }, { status: 400 });
    }
    const entry = {
      id: state.nextId++,
      createdAt: new Date().toISOString(),
      operator: operator.trim(),
      note: (note || '').trim(),
      breakdown: normalized,
      total
    };
    state.entries.push(entry);
    try { await saveState(state); }
    catch (e) { return Response.json({ error: '保存失败:' + e.message }, { status: 500 }); }
    return Response.json({ ok: true, entry, state: snapshot(state) });
  }

  if (path === '/api/reset') {
    const fresh = { nextId: 1, entries: [] };
    try { await saveState(fresh); }
    catch (e) { return Response.json({ error: '保存失败:' + e.message }, { status: 500 }); }
    return Response.json({ ok: true, state: snapshot(fresh) });
  }

  return new Response('Not Found', { status: 404 });
}

// ====== 内嵌 HTML (与本地版完全一致) ======
const HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="theme-color" content="#4f46e5" />
  <title>餐厅共享账本</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    html, body { font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; }
    body {
      padding-top: env(safe-area-inset-top);
      padding-bottom: env(safe-area-inset-bottom);
      -webkit-tap-highlight-color: transparent;
      overscroll-behavior-y: contain;
    }
    .num-display { font-variant-numeric: tabular-nums; }
    .fade-in { animation: fadeIn .25s ease-out; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
    .pulse-dot { animation: pulse 1.6s ease-in-out infinite; }
    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
    input[type=number]::-webkit-outer-spin-button,
    input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
    input[type=number] { -moz-appearance: textfield; }
    input, select, textarea { font-size: 16px; }
    .tap { transition: transform .08s ease, background-color .15s ease; }
    .tap:active { transform: scale(.97); }
  </style>
</head>
<body class="min-h-screen bg-slate-50 text-slate-800">

  <header class="px-4 pt-3 pb-2 flex items-center justify-between">
    <div class="flex items-center gap-2">
      <span class="text-lg">🍱</span>
      <span class="font-semibold text-slate-700">共享账本</span>
    </div>
    <div id="connStatus" class="flex items-center gap-1.5 text-xs text-slate-500">
      <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 pulse-dot"></span>
      <span>同步中</span>
    </div>
  </header>

  <main class="px-4 pb-28 space-y-3">

    <section class="bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-2xl p-4 shadow-lg">
      <div class="flex items-center justify-between text-xs opacity-90">
        <span>当前余额</span>
        <span>初始 ¥<span id="initial" class="num-display">--</span></span>
      </div>
      <div class="mt-1 flex items-baseline gap-1">
        <span class="text-2xl font-medium opacity-90">¥</span>
        <span id="balance" class="text-4xl font-bold tracking-tight num-display leading-none">--</span>
      </div>
      <div class="mt-2 flex items-center justify-between text-xs opacity-90">
        <span>已消费 ¥<span id="used" class="num-display">--</span></span>
        <span id="progressText" class="num-display">--%</span>
      </div>
      <div class="mt-1.5 h-1.5 bg-white/20 rounded-full overflow-hidden">
        <div id="progressBar" class="h-full bg-white/80 transition-all duration-500" style="width:0%"></div>
      </div>
    </section>

    <section class="bg-white rounded-2xl p-4 shadow-sm">
      <div class="flex items-center justify-between mb-2.5">
        <h2 class="font-semibold text-slate-800">快速扣账</h2>
        <button id="toggleCustom" class="text-xs text-indigo-600 tap">+ 自定义</button>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div>
          <div class="text-xs text-slate-500 mb-1.5 flex items-center gap-1">
            <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span><span>25 元/人</span>
          </div>
          <div class="grid grid-cols-3 gap-1.5">
            <button data-price="25" data-count="1" class="quick tap bg-amber-50 text-amber-700 font-semibold py-2.5 rounded-lg active:bg-amber-100">1人</button>
            <button data-price="25" data-count="2" class="quick tap bg-amber-50 text-amber-700 font-semibold py-2.5 rounded-lg active:bg-amber-100">2人</button>
            <button data-price="25" data-count="3" class="quick tap bg-amber-50 text-amber-700 font-semibold py-2.5 rounded-lg active:bg-amber-100">3人</button>
          </div>
        </div>
        <div>
          <div class="text-xs text-slate-500 mb-1.5 flex items-center gap-1">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span><span>18 元/人</span>
          </div>
          <div class="grid grid-cols-3 gap-1.5">
            <button data-price="18" data-count="1" class="quick tap bg-emerald-50 text-emerald-700 font-semibold py-2.5 rounded-lg active:bg-emerald-100">1人</button>
            <button data-price="18" data-count="2" class="quick tap bg-emerald-50 text-emerald-700 font-semibold py-2.5 rounded-lg active:bg-emerald-100">2人</button>
            <button data-price="18" data-count="3" class="quick tap bg-emerald-50 text-emerald-700 font-semibold py-2.5 rounded-lg active:bg-emerald-100">3人</button>
          </div>
        </div>
      </div>
      <div id="customPanel" class="hidden mt-3 pt-3 border-t border-slate-100">
        <div class="text-xs text-slate-500 mb-2">多组混合(例:2人×25 + 1人×18)</div>
        <div id="rows" class="space-y-2"></div>
        <button id="addCustom" class="mt-2 w-full text-sm text-slate-500 py-2 rounded-lg border border-dashed border-slate-300 tap">+ 添加一行</button>
      </div>
    </section>

    <section class="bg-white rounded-2xl p-4 shadow-sm space-y-2.5">
      <div>
        <label class="block text-xs text-slate-500 mb-1">操作人</label>
        <input id="operator" type="text" placeholder="点击输入你的名字"
          class="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
      </div>
      <div>
        <label class="block text-xs text-slate-500 mb-1">备注(可选)</label>
        <input id="note" type="text" placeholder="例:周三午餐"
          class="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
      </div>
    </section>

    <section class="bg-white rounded-2xl p-4 shadow-sm">
      <div class="flex items-center justify-between mb-2">
        <h2 class="font-semibold text-slate-800">最近消费</h2>
        <button id="reset" class="text-xs text-slate-400 tap">重置账本</button>
      </div>
      <div id="empty" class="text-center text-slate-400 py-6 text-sm hidden">还没有消费记录</div>
      <ul id="list" class="divide-y divide-slate-100"></ul>
    </section>

  </main>

  <div class="fixed inset-x-0 bottom-0 z-50 pointer-events-none">
    <div class="max-w-3xl mx-auto pointer-events-auto">
      <div class="mx-3 mb-3 bg-white/95 backdrop-blur rounded-2xl shadow-2xl border border-slate-200 p-3 flex items-center gap-3"
           style="padding-bottom: max(0.75rem, env(safe-area-inset-bottom));">
        <div class="flex-1 min-w-0">
          <div class="text-[10px] text-slate-500">本次合计</div>
          <div class="text-xl font-bold text-indigo-600 num-display leading-tight truncate">¥ <span id="previewTotal">0.00</span></div>
        </div>
        <button id="submit"
          class="shrink-0 bg-indigo-600 active:bg-indigo-700 text-white font-semibold px-6 py-3 rounded-xl tap disabled:opacity-40 disabled:cursor-not-allowed">
          确认扣账
        </button>
      </div>
    </div>
  </div>

  <script>
    const $ = (s) => document.querySelector(s);
    const $$ = (s) => Array.from(document.querySelectorAll(s));
    const fmt = (n) => (Math.round(n * 100) / 100).toFixed(2);
    const fmtTime = (iso) => {
      const d = new Date(iso);
      const p = (n) => String(n).padStart(2, '0');
      const now = new Date();
      const sameDay = d.toDateString() === now.toDateString();
      return sameDay
        ? \`今天 \${p(d.getHours())}:\${p(d.getMinutes())}\`
        : \`\${d.getMonth()+1}-\${p(d.getDate())} \${p(d.getHours())}:\${p(d.getMinutes())}\`;
    };
    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }

    let state = { balance: 0, used: 0, initial: 10000, entries: [] };
    let draft = [];

    function render() {
      $('#balance').textContent = fmt(state.balance);
      $('#initial').textContent = fmt(state.initial);
      $('#used').textContent = fmt(state.used);
      const pct = state.initial > 0 ? Math.min(100, (state.used / state.initial) * 100) : 0;
      $('#progressBar').style.width = pct.toFixed(1) + '%';
      $('#progressText').textContent = pct.toFixed(0) + '%';
      $('#empty').classList.toggle('hidden', state.entries.length > 0);
      $('#list').innerHTML = state.entries.slice(0, 30).map(e => \`
        <li class="py-2.5 fade-in">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="font-medium text-slate-800 text-sm">\${escapeHtml(e.operator || '匿名')}</span>
                <span class="text-[11px] text-slate-400">\${fmtTime(e.createdAt)}</span>
                \${e.note ? \`<span class="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">\${escapeHtml(e.note)}</span>\` : ''}
              </div>
              <div class="mt-0.5 text-xs text-slate-500">
                \${e.breakdown.map(b => \`\${b.count}×¥\${fmt(b.price)}\`).join(' + ')}
              </div>
            </div>
            <div class="text-right shrink-0">
              <div class="font-semibold text-slate-800 text-sm num-display">-¥\${fmt(e.total)}</div>
            </div>
          </div>
        </li>
      \`).join('');
      updatePreview();
    }

    function addToDraft(price, count) {
      const existing = draft.find(b => b.price === price && b.count === count);
      if (existing) existing.count += count;
      else draft.push({ price, count });
      refreshRows();
      flashButton(price, count);
    }
    function flashButton(price, count) {
      const btn = document.querySelector(\`.quick[data-price="\${price}"][data-count="\${count}"]\`);
      if (!btn) return;
      btn.classList.add('ring-2', 'ring-indigo-400');
      setTimeout(() => btn.classList.remove('ring-2', 'ring-indigo-400'), 220);
    }

    function rowHtml(idx, price, count) {
      return \`
        <div class="row flex items-center gap-1.5" data-idx="\${idx}">
          <span class="text-xs text-slate-500 w-9 shrink-0">人均</span>
          <div class="flex items-center flex-1">
            <span class="px-1 text-slate-400 text-sm">¥</span>
            <input type="number" inputmode="decimal" step="0.01" min="0.01" value="\${price}" data-field="price" placeholder="金额"
              class="price w-full px-2 py-1.5 rounded-md border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          <span class="text-xs text-slate-400">×</span>
          <div class="flex items-center gap-1">
            <button class="dec w-7 h-7 rounded-md border border-slate-200 tap">−</button>
            <input type="number" inputmode="numeric" min="1" value="\${count}" data-field="count"
              class="count w-10 text-center px-1 py-1.5 rounded-md border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            <button class="inc w-7 h-7 rounded-md border border-slate-200 tap">+</button>
          </div>
          <button class="del w-7 h-7 rounded-md text-slate-400 tap" title="删除">✕</button>
        </div>
      \`;
    }
    function refreshRows() {
      const box = $('#rows');
      if (draft.length === 0) {
        box.innerHTML = '<div class="text-center text-xs text-slate-400 py-2">点击上方按钮或添加自定义行</div>';
      } else {
        box.innerHTML = draft.map((r, i) => rowHtml(i, r.price, r.count)).join('');
      }
      bindRowEvents();
      updatePreview();
    }
    function bindRowEvents() {
      $$('.row').forEach((rowEl) => {
        const idx = Number(rowEl.dataset.idx);
        rowEl.querySelector('[data-field="price"]').addEventListener('input', e => {
          draft[idx].price = e.target.value === '' ? '' : Number(e.target.value);
          updatePreview();
        });
        rowEl.querySelector('[data-field="count"]').addEventListener('input', e => {
          const v = parseInt(e.target.value, 10);
          draft[idx].count = isNaN(v) || v < 1 ? 1 : v;
          updatePreview();
        });
        rowEl.querySelector('.inc').addEventListener('click', () => {
          draft[idx].count++;
          rowEl.querySelector('[data-field="count"]').value = draft[idx].count;
          updatePreview();
        });
        rowEl.querySelector('.dec').addEventListener('click', () => {
          draft[idx].count = Math.max(1, draft[idx].count - 1);
          rowEl.querySelector('[data-field="count"]').value = draft[idx].count;
          updatePreview();
        });
        rowEl.querySelector('.del').addEventListener('click', () => {
          draft.splice(idx, 1);
          refreshRows();
        });
      });
    }
    function updatePreview() {
      let total = 0;
      $$('.row').forEach((rowEl) => {
        const p = Number(rowEl.querySelector('[data-field="price"]').value);
        const c = parseInt(rowEl.querySelector('[data-field="count"]').value, 10) || 0;
        const sub = (Number.isFinite(p) && p > 0 && c > 0) ? p * c : 0;
        total += sub;
      });
      $('#previewTotal').textContent = fmt(total);
      $('#submit').disabled = total <= 0 || total > state.balance;
    }

    $$('.quick').forEach(btn => {
      btn.addEventListener('click', () => {
        const price = Number(btn.dataset.price);
        const count = Number(btn.dataset.count);
        addToDraft(price, count);
        if (window.navigator.vibrate) window.navigator.vibrate(8);
      });
    });
    $('#toggleCustom').addEventListener('click', () => $('#customPanel').classList.toggle('hidden'));
    $('#addCustom').addEventListener('click', () => {
      draft.push({ price: '', count: 1 });
      refreshRows();
      const last = $$('.row').slice(-1)[0];
      last?.querySelector('[data-field="price"]')?.focus();
    });

    $('#submit').addEventListener('click', async () => {
      const breakdown = draft
        .map(r => ({ price: Number(r.price), count: parseInt(r.count, 10) }))
        .filter(r => Number.isFinite(r.price) && r.price > 0 && r.count > 0);
      if (breakdown.length === 0) return toast('请先选择人数配置');
      const operator = $('#operator').value.trim();
      if (!operator) { $('#operator').focus(); return toast('请填写操作人'); }
      const note = $('#note').value.trim();
      const submit = $('#submit');
      submit.disabled = true;
      const oldText = submit.textContent;
      submit.textContent = '提交中…';
      try {
        const res = await fetch('/api/charge', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operator, note, breakdown })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '提交失败');
        draft = [];
        $('#note').value = '';
        refreshRows();
        if (window.navigator.vibrate) window.navigator.vibrate([10, 30, 10]);
        toast('扣账成功');
      } catch (err) {
        toast(err.message);
      } finally {
        submit.textContent = oldText;
        updatePreview();
      }
    });

    function toast(msg) {
      let el = document.getElementById('toast');
      if (!el) {
        el = document.createElement('div');
        el.id = 'toast';
        el.className = 'fixed left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 z-[60] bg-slate-900/90 text-white text-sm px-4 py-2 rounded-full pointer-events-none opacity-0 transition-opacity';
        document.body.appendChild(el);
      }
      el.textContent = msg;
      el.style.opacity = '1';
      clearTimeout(el._t);
      el._t = setTimeout(() => { el.style.opacity = '0'; }, 1600);
    }

    $('#reset').addEventListener('click', async () => {
      if (!confirm('确定要清空所有流水并重置余额为 10000 吗?')) return;
      await fetch('/api/reset', { method: 'POST' });
      toast('已重置');
    });

    async function pull() {
      try { const r = await fetch('/api/state'); state = await r.json(); render(); }
      catch (e) { console.error(e); }
    }
    function connectSSE() {
      const es = new EventSource('/api/events');
      es.addEventListener('hello',  e => { state = JSON.parse(e.data); render(); });
      es.addEventListener('update', e => { state = JSON.parse(e.data); render(); });
      es.onerror = () => {
        $('#connStatus').innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span><span>重连中…</span>';
        es.close();
        setTimeout(connectSSE, 2000);
      };
    }

    (function init() {
      const saved = localStorage.getItem('operator');
      if (saved) $('#operator').value = saved;
      $('#operator').addEventListener('input', e => localStorage.setItem('operator', e.target.value));
      refreshRows();
      pull().then(connectSSE);
    })();
  </script>
</body>
</html>`;
