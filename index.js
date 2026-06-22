// vercel-ledger-v3/api/index.js
// 单文件搞定: 首页HTML + 所有API + Upstash Redis 持久化

const { Redis } = require('@upstash/redis');

function getRedis() {
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

const INITIAL = 10000;

async function getState(redis) {
  const raw = await redis.get('ledger:state');
  if (raw) return JSON.parse(raw);
  return { balance: INITIAL, used: 0, initial: INITIAL, entries: [], version: 0 };
}

async function saveState(redis, state) {
  state.version = (state.version || 0) + 1;
  await redis.set('ledger:state', JSON.stringify(state), { ex: 86400 * 365 });
}

// ====== HTML 页面 (移动端优先竖屏) ======
const HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no,viewport-fit=cover" />
<title>共享账本</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
body{background:#f0f2f5;font-family:-apple-system,system-ui,sans-serif; padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);}
input,select,textarea{font-size:16px!important}
input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}
.btn-quick{transition:transform .1s,box-shadow .1s;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;border-radius:14px;padding:14px 10px;font-size:15px;font-weight:600;text-align:center;cursor:pointer;border:none;user-select:none;touch-action:manipulation}
.btn-quick:active{transform:scale(.95);box-shadow:0 2px 8px rgba(102,126,234,.4)}
.card{background:linear-gradient(135deg,#11998e,#38ef7d);border-radius:20px;color:#fff;padding:24px 20px;position:relative;overflow:hidden}
.card::after{content:'';position:absolute;top:-30px;right:-30px;width:120px;height:120px;border-radius:50%;background:rgba(255,255,255,.12)}
.entry-item{animation:slideIn .25s ease-out}
@keyframes slideIn{from{opacity:0;transform:translateX(-16px)}to{opacity:1;transform:translateX(0)}}
.sync-dot{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:6px}
.sync-dot.on{background:#38ef7d;box-shadow:0 0 6px #38ef7d}
.sync-dot.off{background:#999}
.bottom-bar{position:fixed;bottom:0;left:0;right:0;background:#fff;border-top:1px solid #e8e8e8;padding:14px 16px;z-index:50;padding-bottom:calc(14px + env(safe-area-inset-bottom))}
body{padding-bottom:110px}
</style>
</head>
<body class="max-w-md mx-auto">
<div id="app"></div>

<script>
const API = location.pathname.startsWith('/api/') ? '../api' : '/api';
let state = null;
let selected = [];
let syncErrCount = 0;

// ---- 工具 ----
function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML}
function fmt(n){return '¥'+Number(n).toLocaleString('zh-CN')}
function timeAgo(ts){
  const s=Math.floor((Date.now()-ts)/1000);
  if(s<60)return '刚刚';
  if(s<3600)return Math.floor(s/60)+'分钟前';
  if(s<86400)return Math.floor(s/3600)+'小时前';
  return Math.floor(s/86400)+'天前';
}
function vibrate(){if(navigator.vibrate)navigator.vibrate(12)}

// ---- 渲染 ----
function render(){
  const app=document.getElementById('app');
  const pct=state?Math.round((state.used/state.initial)*100):0;
  const totalSel=selected.reduce((s,i)=>s+i.amount,0);

  app.innerHTML=`
  <div style="padding:16px 16px 8px">
    <div class="card">
      <div style="font-size:13px;opacity:.85;margin-bottom:6px">当前余额</div>
      <div style="font-size:42px;font-weight:800;letter-spacing:-1px">${state?fmt(state.balance):'--'}</div>
      <div style="margin-top:14px;background:rgba(255,255,255,.3);border-radius:6px;height:8px;overflow:hidden"><div style="width:${pct}%;height:100%;background:rgba(255,255,255,.7);border-radius:6px;transition:width .4s"></div></div>
      <div style="font-size:12px;margin-top:6px;display:flex;justify-content:space-between;opacity:.8"><span>已用 ${state?fmt(state.used):'--'} / ${fmt(INITIAL)}</span><span>${pct}%</span></div>
    </div>

    <div style="margin-top:18px">
      <div style="font-size:15px;font-weight:700;color:#333;margin-bottom:10px">快速扣账</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:9px" id="btns">
        ${[[25,1],[25,2],[25,3],[18,1],[18,2],[18,3]].map(([p,n])=>`
          <button class="btn-quick" data-p="${p}" data-n="${n}">
            <div style="font-size:19px;font-weight:800">${p}元/人</div>
            <div style="font-size:12px;opacity:.75;margin-top:3px">×${n}人</div>
          </button>`).join('')}
      </div>
    </div>

    <details style="margin-top:14px">
      <summary style="font-size:14px;font-weight:600;color:#555;cursor:pointer;padding:6px 0">自定义金额 ▼</summary>
      <div style="margin-top:10px;display:flex;gap:8px;align-items:center">
        <input type="number" id="customAmt" placeholder="金额" step="0.01" min="0"
          style="flex:1;border:2px solid #e0e0e0;border-radius:10px;padding:10px 12px;font-size:16px;outline:none" />
        <input type="number" id="customCnt" placeholder="人数" value="1" min="1"
          style="width:72px;border:2px solid #e0e0e0;border-radius:10px;padding:10px 8px;font-size:16px;outline:none;text-align:center" />
        <button id="customBtn" style="background:linear-gradient(135deg,#f093fb,#f5576c);color:#fff;border:none;border-radius:10px;padding:10px 16px;font-weight:700;white-space:nowrap;cursor:pointer">添加</button>
      </div>
    </details>

    <div style="margin-top:14px;display:flex;gap:8px;align-items:center">
      <input type="text" id="whoInput" placeholder="操作人姓名（必填）"
        style="flex:1;border:2px solid #e0e0e0;border-radius:10px;padding:10px 12px;font-size:16px;outline:none" />
      <button id="clearSel" style="padding:8px 14px;border:2px solid #e0e0e0;border-radius:10px;background:#fff;cursor:pointer;font-weight:600;color:#888;font-size:13px">清空</button>
    </div>

    <input type="text" id="noteInput" placeholder="备注（选填）"
      style="margin-top:8px;width:100%;border:2px solid #e0e0e0;border-radius:10px;padding:10px 12px;font-size:16px;outline:none" />

    <!-- 本次合计 -->
    <div style="margin-top:14px;background:#fff8e1;border:2px solid #ffd54f;border-radius:14px;padding:14px 16px;display:flex;justify-content:space-between;align-items:center">
      <span style="font-weight:700;color:#e65100;font-size:15px">本次合计</span>
      <span style="font-size:26px;font-weight:800;color:#e65100">${totalSel>0?fmt(totalSel):'¥0'}</span>
    </div>
  </div>

  <!-- 流水列表 -->
  <div style="padding:8px 16px 140px">
    <div style="font-size:15px;font-weight:700;color:#333;margin:10px 0 8px;display:flex;align-items:center;justify-content:space-between">
      <span>流水记录</span>
      <span id="syncStatus" style="font-size:12px;font-weight:400;color:#999"><span class="sync-dot on"></span>同步中</span>
    </div>
    <div id="entries">
      ${(state&&state.entries?state.entries:[]).length===0
        ?'<div style="text-align:center;padding:40px 0;color:#bbb;font-size:14px">暂无记录</div>'
        : (state.entries||[]).slice().reverse().map(e=>`
          <div class="entry-item" style="background:#fff;border-radius:12px;padding:12px 14px;margin-bottom:8px;border:1px solid #eee">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div>
                <span style="font-weight:700;font-size:16px;color:#c62828">-${esc(e.note||'消费')}</span>
                <span style="margin-left:6px;font-size:13px;color:#888">| ${esc(e.person)} | ${e.perPerson}元/人 ×${e.people}人</span>
              </div>
              <span style="font-weight:800;font-size:17px;color:#c62828">${fmt(e.amount)}</span>
            </div>
            <div style="font-size:12px;color:#aaa;margin-top:5px">${new Date(e.time).toLocaleString('zh-CN')} · 余额 ${fmt(e.balanceAfter)}</div>
          </div>`).join('')
      }
    </div>
  </div>

  <!-- 底部固定条 -->
  <div class="bottom-bar" style="max-width:512px;left:50%;transform:translateX(-50%)">
    <div style="display:flex;gap:10px;align-items:center">
      <button id="submitBtn" style="flex:1;background:linear-gradient(135deg,#ff6b6b,#ee0979);color:#fff;border:none;border-radius:14px;padding:15px;font-size:18px;font-weight:800;cursor:pointer;letter-spacing:2px"
        ${selected.length===0?'disabled style="opacity:.45;cursor:not-allowed"':''}>确认扣账</button>
      <button id="resetBtn" title="重置所有数据" style="background:#fff;border:2px solid #ffcdd2;border-radius:14px;padding:14px 16px;cursor:pointer;font-weight:700;color:#e57373;font-size:14px;white-space:nowrap">重置</button>
    </div>
  </div>`;

  bindEvents();
}

// ---- 绑定事件 ----
function bindEvents(){
  // 快速按钮
  document.querySelectorAll('.btn-quick').forEach(btn=>{
    btn.addEventListener('click',()=>{
      vibrate();
      const p=+btn.dataset.p,n=+btn.dataset.n;
      selected.push({perPerson:p,people:n,amount:p*n});
      render();
    });
  });

  // 自定义
  const cBtn=document.getElementById('customBtn');
  if(cBtn)cBtn.addEventListener('click',()=>{
    const a=+document.getElementById('customAmt').value,c=+document.getElementById('customCnt').value;
    if(!a||!c||a<=0||c<=0){alert('请输入有效金额和人数');return;}
    vibrate();
    selected.push({perPerson:a,people:c,amount:a*c});
    document.getElementById('customAmt').value='';
    document.getElementById('customCnt').value='1';
    render();
  });

  // 清空选择
  const cS=document.getElementById('clearSel');
  if(cS)cS.addEventListener('click',()=>{selected=[];render();});

  // 确认扣账
  const sBtn=document.getElementById('submitBtn');
  if(sBtn)sBtn.addEventListener('click',async ()=>{
    const who=(document.getElementById('whoInput')?.value||'').trim();
    if(!who){alert('请填写操作人姓名');document.getElementById('whoInput')?.focus();return;}
    if(!selected.length){alert('请先选择或输入消费项');return;}

    sBtn.disabled=true;sBtn.textContent='提交中...';

    try{
      for(const item of selected){
        const r=await fetch(API+'/charge',{method:'POST',headers:{'Content-Type':'application/json'},
          JSON.stringify({perPerson:item.perPerson,people:item.people,person:who,note:document.getElementById('noteInput')?.value.trim()||''})});
        if(!r.ok){const e=await r.json();throw new Error(e.error||'扣账失败');}
      }
      selected=[];
      document.getElementById('whoInput').value='';
      document.getElementById('noteInput').value='';
      await loadState();
      alert('扣账成功！');
    }catch(e){
      alert('错误: '+e.message);
    }
    sBtn.disabled=false;sBtn.textContent='确认扣账';
  });

  // 重置
  const rBtn=document.getElementById('resetBtn');
  if(rBtn)rBtn.addEventListener('click',async()=>{
    if(!confirm('确定要重置所有数据吗？余额将恢复到 ¥'+INITIAL.toLocaleString()))return;
    try{await fetch(API+'/reset',{method:'POST'});selected=[];await loadState();}
    catch(e){alert('重置失败:'+e.message)}
  });

  // 输入框回车也触发
  const whoEl=document.getElementById('whoInput');
  if(whoEl)whoEl.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();sBtn?.click();}});
}

// ---- 数据加载 & 同步 ----
async function loadState(){
  try{
    const r=await fetch(API+'/state');
    if(!r.ok)throw new Error('HTTP '+r.status);
    state=await r.json();
    syncErrCount=0;
    updateSyncDot(true);
    render();
  }catch(e){
    console.error('loadState:',e);
    syncErrCount++;
    updateSyncDot(false);
  }
}

function updateSyncDot(ok){
  const el=document.getElementById('syncStatus');
  if(el)el.innerHTML='<span class="sync-dot '+(ok?'on':'off')+'"></span>'+(ok?'同步中':'连接断开('+syncErrCount+')');
}

// SSE 实时同步 (轮询模式兼容)
function startSync(){
  let lastVer=state?.version||0;
  async function poll(){
    try{
      const r=await fetch(API+'/events?v='+lastVer,{headers:{'Accept':'text/event-stream'}});
      const text=await r.text();
      for(const line of text.split('\\n')){
        if(line.startsWith('data:')){
          try{const d=JSON.parse(line.slice(5));if(d.version>lastVer){lastVer=d.version;loadState();}}catch{}
        }
      }
    }catch{}
    setTimeout(poll,2000);
  }
  poll();
  setInterval(()=>{if(syncErrCount<3)loadState()},5000);
}

// 启动
loadState().then(startSync);
</script>
</body>
</html>`;

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const url = req.url || '/';
  const path = url.split('?')[0];

  try {
    const redis = getRedis();

    // GET / → 返回 HTML 页面
    if ((path === '/' || path === '' || path === '/index.html') && req.method === 'GET') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      return res.send(HTML);
    }

    // GET /api/state → 获取状态
    if (path === '/api/state' && req.method === 'GET') {
      const state = await getState(redis);
      res.json(state);
      return;
    }

    // POST /api/charge → 扣账
    if (path === '/api/charge' && req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const perPerson = parseFloat(body.perPerson) || 0;
      const people = parseInt(body.people) || 0;
      const person = String(body.person || '').trim();
      const note = String(body.note || '').trim();

      if (!person || !perPerson || !people || perPerson <= 0 || people <= 0) {
        return res.status(400).json({ error: '参数不完整' });
      }

      const amount = Math.round(perPerson * people * 100) / 100;
      const state = await getState(redis);

      if (amount > state.balance) {
        return res.status(400).json({ error: '余额不足', balance: state.balance });
      }

      state.balance = Math.round((state.balance - amount) * 100) / 100;
      state.used = Math.round((state.initial - state.balance) * 100) / 100;
      const entry = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        time: new Date().toISOString(),
        person,
        perPerson,
        people,
        amount,
        note,
        balanceAfter: state.balance,
      };
      state.entries.push(entry);
      await saveState(redis, state);

      return res.json({ ok: true, entry, state });
    }

    // POST /api/reset → 重置
    if (path === '/api/reset' && req.method === 'POST') {
      await redis.del('ledger:state');
      const fresh = { balance: INITIAL, used: 0, initial: INITIAL, entries: [], version: 0 };
      await saveState(redis, fresh);
      return res.json({ ok: true, state: fresh });
    }

    // GET /api/events → SSE 实时推送
    if (path === '/api/events' && req.method === 'GET') {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const currentState = await getState(redis);
      res.write(`data: ${JSON.stringify({ version: currentState.version })}\n\n`);
      res.end();
      return;
    }

    // 其他路径 → 也返回 HTML (SPA fallback)
    if (req.method === 'GET') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(HTML);
    }

    return res.status(404).json({ error: 'NOT_FOUND' });
  } catch (err) {
    console.error('Error:', err);
    return res.status(500).json({ error: 'Internal error: ' + err.message });
  }
}
