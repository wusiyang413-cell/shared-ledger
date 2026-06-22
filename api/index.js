// vercel-ledger-v4/api/index.js
// 单文件搞定: 首页HTML + 所有API + Upstash Redis 持久化
// 使用 CommonJS 格式 (module.exports) — 兼容 Vercel 默认运行时

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

/* 工具函数 */
function esc(s){var d=document.createElement('div');d.textContent=s;return d.innerHTML}
function fmt(n){return '¥'+Number(n).toLocaleString('zh-CN')}
function timeAgo(ts){
  var s=Math.floor((Date.now()-ts)/1000);
  if(s<60)return '\u521a\u521a';
  if(s<3600)return Math.floor(s/60)+'\u5206\u949f\u524d';
  if(s<86400)return Math.floor(s/3600)+'\u5c0f\u65f6\u524d';
  return Math.floor(s/86400)+'\u5929\u524d';
}
function vibrate(){if(navigator.vibrate)navigator.vibrate(12)}

/* 渲染页面 */
function render(){
  var app=document.getElementById('app');
  var pct=state?Math.round((state.used/state.initial)*100):0;
  var totalSel=selected.reduce(function(s,i){return s+i.amount},0);

  app.innerHTML=
  '<div style="padding:16px 16px 8px">'+
    '<div class="card">'+
      '<div style="font-size:13px;opacity:.85;margin-bottom:6px">\u5f53\u524d\u4f59\u989d</div>'+
      '<div style="font-size:42px;font-weight:800;letter-spacing:-1px">'+(state?fmt(state.balance):'\u2014\u2014')+'</div>'+
      '<div style="margin-top:14px;background:rgba(255,255,255,.3);border-radius:6px;height:8px;overflow:hidden"><div style="width:'+pct+'%;height:100%;background:rgba(255,255,255,.7);border-radius:6px;transition:width .4s"></div></div>'+
      '<div style="font-size:12px;margin-top:6px;display:flex;justify-content:space-between;opacity:.8"><span>\u5df2\u7528 '+(state?fmt(state.used):'\u2014\u2014')+' / '+fmt(INITIAL)+'</span><span>'+pct+'%</span></div>'+
    '</div>'+

    '<div style="margin-top:18px">'+
      '<div style="font-size:15px;font-weight:700;color:#333;margin-bottom:10px">\u5feb\u901f\u6263\u8d26</div>'+
      '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:9px" id="btns">'+
        [[25,1],[25,2],[25,3],[18,1],[18,2],[18,3]].map(function(pair){
          var p=pair[0],n=pair[1];
          return '<button class="btn-quick" data-p="'+p+'" data-n="'+n+'">'+
            '<div style="font-size:19px;font-weight:800">'+p+'\u5143/\u4eba</div>'+
            '<div style="font-size:12px;opacity:.75;margin-top:3px">\u00d7'+n+'\u4eba</div>'+
          '</button>';
        }).join('')+
      '</div>'+
    '</div>'+

    '<details style="margin-top:14px">'+
      '<summary style="font-size:14px;font-weight:600;color:#555;cursor:pointer;padding:6px 0">\u81ea\u5b9a\u4e49\u91d1\u989d \u25bc</summary>'+
      '<div style="margin-top:10px;display:flex;gap:8px;align-items:center">'+
        '<input type="number" id="customAmt" placeholder="\u91d1\u989d" step="0.01" min="0" style="flex:1;border:2px solid #e0e0e0;border-radius:10px;padding:10px 12px;font-size:16px;outline:none" />'+
        '<input type="number" id="customCnt" placeholder="\u4eba\u6570" value="1" min="1" style="width:72px;border:2px solid #e0e0e0;border-radius:10px;padding:10px 8px;font-size:16px;outline:none;text-align:center" />'+
        '<button id="customBtn" style="background:linear-gradient(135deg,#f093fb,#f5576c);color:#fff;border:none;border-radius:10px;padding:10px 16px;font-weight:700;white-space:nowrap;cursor:pointer">\u6dfb\u52a0</button>'+
      '</div>'+
    '</details>'+

    '<div style="margin-top:14px;display:flex;gap:8px;align-items:center">'+
      '<input type="text" id="whoInput" placeholder="\u64cd\u4f5c\u4eba\u59d3\u540d\uff08\u5fc5\u586b\uff09" style="flex:1;border:2px solid #e0e0e0;border-radius:10px;padding:10px 12px;font-size:16px;outline:none" />'+
      '<button id="clearSel" style="padding:8px 14px;border:2px solid #e0e0e0;border-radius:10px;background:#fff;cursor:pointer;font-weight:600;color:#888;font-size:13px">\u6e05\u7a7a</button>'+
    '</div>'+

    '<input type="text" id="noteInput" placeholder="\u5907\u6ce8\uff08\u9009\u586b\uff09" style="margin-top:8px;width:100%;border:2px solid #e0e0e0;border-radius:10px;padding:10px 12px;font-size:16px;outline:none" />'+

    '<div style="margin-top:14px;background:#fff8e1;border:2px solid #ffd54f;border-radius:14px;padding:14px 16px;display:flex;justify-content:space-between;align-items:center">'+
      '<span style="font-weight:700;color:#e65100;font-size:15px">\u672c\u6b21\u5408\u8ba1</span>'+
      '<span style="font-size:26px;font-weight:800;color:#e65100">'+(totalSel>0?fmt(totalSel):'\u00a50')+'</span>'+
    '</div>'+
  '</div>'+

  /* 流水列表 */
  '<div style="padding:8px 16px 140px">'+
    '<div style="font-size:15px;font-weight:700;color:#333;margin:10px 0 8px;display:flex;align-items:center;justify-content:space-between">'+
      '<span>\u6d41\u6c34\u8bb0\u5f55</span>'+
      '<span id="syncStatus" style="font-size:12px;font-weight:400;color:#999"><span class="sync-dot on"></span>\u540c\u6b65\u4e2d</span>'+
    '</div>'+
    '<div id="entries">'+
      ((state&&state.entries?state.entries:[]).length===0
        ?'<div style="text-align:center;padding:40px 0;color:#bbb;font-size:14px">\u6682\u65e0\u8bb0\u5f55</div>'
        : (state.entries||[]).slice().reverse().map(function(e){
            return '<div class="entry-item" style="background:#fff;border-radius:12px;padding:12px 14px;margin-bottom:8px;border:1px solid #eee">'+
              '<div style="display:flex;justify-content:space-between;align-items:center">'+
                '<div>'+
                  '<span style="font-weight:700;font-size:16px;color:#c62828">-'+esc(e.note||'\u6d88\u8d39')+'</span>'+
                  '<span style="margin-left:6px;font-size:13px;color:#888">| '+esc(e.person)+' | '+e.perPerson+'\u5143/\u4eba \u00d7'+e.people+'\u4eba</span>'+
                '</div>'+
                '<span style="font-weight:800;font-size:17px;color:#c62828">'+fmt(e.amount)+'</span>'+
              '</div>'+
              '<div style="font-size:12px;color:#aaa;margin-top:5px">'+new Date(e.time).toLocaleString('zh-CN')+' \u00b7 \u4f59\u989d '+fmt(e.balanceAfter)+'</div>'+
            '</div>';
          }).join('')
      )+
    '</div>'+
  '</div>'+

  /* 底部固定条 */
  '<div class="bottom-bar" style="max-width:512px;left:50%;transform:translateX(-50%)">'+
    '<div style="display:flex;gap:10px;align-items:center">'+
      '<button id="submitBtn" style="flex:1;background:linear-gradient(135deg,#ff6b6b,#ee0979);color:#fff;border:none;border-radius:14px;padding:15px;font-size:18px;font-weight:800;cursor:pointer;letter-spacing:2px"'+
        (selected.length===0?' disabled style="opacity:.45;cursor:not-allowed"':'')+
        '>\u786e\u8ba4\u6263\u8d26</button>'+
      '<button id="resetBtn" title="\u91cd\u7f6e\u6240\u6709\u6570\u636e" style="background:#fff;border:2px solid #ffcdd2;border-radius:14px;padding:14px 16px;cursor:pointer;font-weight:700;color:#e57373;font-size:14px;white-space:nowrap">\u91cd\u7f6e</button>'+
    '</div>'+
  '</div>';

  bindEvents();
}

/* 绑定事件 */
function bindEvents(){
  document.querySelectorAll('.btn-quick').forEach(function(btn){
    btn.addEventListener('click',function(){
      vibrate();
      var p=+btn.dataset.p,n=+btn.dataset.n;
      selected.push({perPerson:p,people:n,amount:p*n});
      render();
    });
  });

  var cBtn=document.getElementById('customBtn');
  if(cBtn)cBtn.addEventListener('click',function(){
    var a=+document.getElementById('customAmt').value,c=+document.getElementById('customCnt').value;
    if(!a||!c||a<=0||c<=0){alert('\u8bf7\u8f93\u5165\u6709\u6548\u91d1\u989d\u548c\u4eba\u6570');return;}
    vibrate();
    selected.push({perPerson:a,people:c,amount:a*c});
    document.getElementById('customAmt').value='';
    document.getElementById('customCnt').value='1';
    render();
  });

  var cS=document.getElementById('clearSel');
  if(cS)cS.addEventListener('click',function(){selected=[];render();});

  var sBtn=document.getElementById('submitBtn');
  if(sBtn)sBtn.addEventListener('click',async function(){
    var who=(document.getElementById('whoInput').value||'').trim();
    if(!who){alert('\u8bf7\u586b\u5199\u64cd\u4f5c\u4eba\u59d3\u540d');document.getElementById('whoInput').focus();return;}
    if(!selected.length){alert('\u8bf7\u5148\u9009\u62e9\u6216\u8f93\u5165\u6d88\u8d39\u9879');return;}

    sBtn.disabled=true;sBtn.textContent='\u63d0\u4ea4\u4e2d...';

    try{
      for(var i=0;i<selected.length;i++){
        var item=selected[i];
        var r=await fetch(API+'/charge',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({perPerson:item.perPerson,people:item.people,person:who,note:(document.getElementById('noteInput').value||'').trim()})});
        if(!r.ok){var e=await r.json();throw new Error(e.error||'\u6263\u8d26\u5931\u8d25');}
      }
      selected=[];
      document.getElementById('whoInput').value='';
      document.getElementById('noteInput').value='';
      await loadState();
      alert('\u6263\u8d26\u6210\u529f\uff01');
    }catch(e){
      alert('\u9519\u8bef: '+e.message);
    }
    sBtn.disabled=false;sBtn.textContent='\u786e\u8ba4\u6263\u8d26';
  });

  var rBtn=document.getElementById('resetBtn');
  if(rBtn)rBtn.addEventListener('click',async function(){
    if(!confirm('\u786e\u5b9a\u8981\u91cd\u7f6e\u6240\u6709\u6570\u636e\u5417\uff1f\u4f59\u989d\u5c06\u6062\u590d\u5230 \u00a5'+INITIAL.toLocaleString()))return;
    try{await fetch(API+'/reset',{method:'POST'});selected=[];await loadState();}
    catch(e){alert('\u91cd\u7f6e\u5931\u8d25:'+e.message)}
  });
}

/* 数据加载 & 同步 */
async function loadState(){
  try{
    var r=await fetch(API+'/state');
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
  var el=document.getElementById('syncStatus');
  if(el)el.innerHTML='<span class="sync-dot '+(ok?'on':'off')+'"></span>'+(ok?'\u540c\u6b65\u4e2d':'\u8fde\u63a5\u65ad\u5f00('+syncErrCount+')');
}

/* 启动 */
function startSync(){
  setInterval(function(){if(syncErrCount<3)loadState()},5000);
}

loadState().then(startSync);
</script>
</body>
</html>`;

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  var url = req.url || '/';
  var path = url.split('?')[0];

  try {
    var redis = getRedis();

    // GET / → 返回 HTML 页面
    if ((path === '/' || path === '' || path === '/index.html') && req.method === 'GET') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      return res.send(HTML);
    }

    // GET /api/state → 获取状态
    if (path === '/api/state' && req.method === 'GET') {
      var state = await getState(redis);
      res.json(state);
      return;
    }

    // POST /api/charge → 扣账
    if (path === '/api/charge' && req.method === 'POST') {
      var body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      var perPerson = parseFloat(body.perPerson) || 0;
      var people = parseInt(body.people) || 0;
      var person = String(body.person || '').trim();
      var note = String(body.note || '').trim();

      if (!person || !perPerson || !people || perPerson <= 0 || people <= 0) {
        return res.status(400).json({ error: '\u53c2\u6570\u4e0d\u5b8c\u6574' });
      }

      var amount = Math.round(perPerson * people * 100) / 100;
      var state = await getState(redis);

      if (amount > state.balance) {
        return res.status(400).json({ error: '\u4f59\u989d\u4e0d\u8db3', balance: state.balance });
      }

      state.balance = Math.round((state.balance - amount) * 100) / 100;
      state.used = Math.round((state.initial - state.balance) * 100) / 100;

      var entry = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        time: new Date().toISOString(),
        person: person,
        perPerson: perPerson,
        people: people,
        amount: amount,
        note: note,
        balanceAfter: state.balance,
      };
      state.entries.push(entry);
      await saveState(redis, state);

      return res.json({ ok: true, entry: entry, state: state });
    }

    // POST /api/reset → 重置
    if (path === '/api/reset' && req.method === 'POST') {
      await redis.del('ledger:state');
      var fresh = { balance: INITIAL, used: 0, initial: INITIAL, entries: [], version: 0 };
      await saveState(redis, fresh);
      return res.json({ ok: true, state: fresh });
    }

    // GET /api/events → 轮询检测变更
    if (path === '/api/events' && req.method === 'GET') {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');

      var currentState = await getState(redis);
      res.write('data: ' + JSON.stringify({ version: currentState.version }) + '\n\n');
      res.end();
      return;
    }

    // 其他 GET 路径 → 返回首页 HTML (SPA fallback)
    if (req.method === 'GET') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(HTML);
    }

    return res.status(404).json({ error: 'NOT_FOUND' });
  } catch (err) {
    console.error('Error:', err);
    return res.status(500).json({ error: 'Internal error: ' + err.message });
  }
};
