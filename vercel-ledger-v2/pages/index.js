export default function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache');
  res.status(200).send(HTML);
}

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
    html,body{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}
    body{padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);-webkit-tap-highlight-color:transparent;overscroll-behavior-y:contain}
    .num-display{font-variant-numeric:tabular-nums}
    .fade-in{animation:fadeIn .25s ease-out}
    @keyframes fadeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
    .pulse-dot{animation:pulse 1.6s ease-in-out infinite}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
    input[type=number]::-webkit-outer-spin-button,input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
    input[type=number]{-moz-appearance:textfield}
    input,select,textarea{font-size:16px}
    .tap{transition:transform .08s ease,background-color .15s ease}.tap:active{transform:scale(.97)}
  </style>
</head>
<body class="min-h-screen bg-slate-50 text-slate-800">

<header class="px-4 pt-3 pb-2 flex items-center justify-between">
  <div class="flex items-center gap-2"><span class="text-lg">🍱</span><span class="font-semibold text-slate-700">共享账本</span></div>
  <div id="connStatus" class="flex items-center gap-1.5 text-xs text-slate-500"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 pulse-dot"></span><span>同步中</span></div>
</header>

<main class="px-4 pb-28 space-y-3">

<section class="bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-2xl p-4 shadow-lg">
  <div class="flex items-center justify-between text-xs opacity-90"><span>当前余额</span><span>初始 ¥<span id="initial" class="num-display">--</span></span></div>
  <div class="mt-1 flex items-baseline gap-1"><span class="text-2xl font-medium opacity-90">¥</span><span id="balance" class="text-4xl font-bold tracking-tight num-display leading-none">--</span></div>
  <div class="mt-2 flex items-center justify-between text-xs opacity-90"><span>已消费 ¥<span id="used" class="num-display">--</span></span><span id="progressText" class="num-display">--%</span></div>
  <div class="mt-1.5 h-1.5 bg-white/20 rounded-full overflow-hidden"><div id="progressBar" class="h-full bg-white/80 transition-all duration-500" style="width:0%"></div></div>
</section>

<section class="bg-white rounded-2xl p-4 shadow-sm">
  <div class="flex items-center justify-between mb-2.5"><h2 class="font-semibold text-slate-800">快速扣账</h2><button id="toggleCustom" class="text-xs text-indigo-600 tap">+ 自定义</button></div>
  <div class="grid grid-cols-2 gap-2">
    <div>
      <div class="text-xs text-slate-500 mb-1.5 flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span><span>25 元/人</span></div>
      <div class="grid grid-cols-3 gap-1.5">
        <button data-price="25" data-count="1" class="quick tap bg-amber-50 text-amber-700 font-semibold py-2.5 rounded-lg active:bg-amber-100">1人</button>
        <button data-price="25" data-count="2" class="quick tap bg-amber-50 text-amber-700 font-semibold py-2.5 rounded-lg active:bg-amber-100">2人</button>
        <button data-price="25" data-count="3" class="quick tap bg-amber-50 text-amber-700 font-semibold py-2.5 rounded-lg active:bg-amber-100">3人</button>
      </div>
    </div>
    <div>
      <div class="text-xs text-slate-500 mb-1.5 flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span><span>18 元/人</span></div>
      <div class="grid grid-cols-3 gap-1.5">
        <button data-price="18" data-count="1" class="quick tap bg-emerald-50 text-emerald-700 font-semibold py-2.5 rounded-lg active:bg-amber-100">1人</button>
        <button data-price="18" data-count="2" class="quick tap bg-emerald-50 text-emerald-700 font-semibold py-2.5 rounded-lg active:bg-amber-100">2人</button>
        <button data-price="18" data-count="3" class="quick tap bg-emerald-50 text-emerald-700 font-semibold py-2.5 rounded-lg active:bg-amber-100">3人</button>
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
  <div><label class="block text-xs text-slate-500 mb-1">操作人</label><input id="operator" type="text" placeholder="点击输入你的名字" class="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-400"/></div>
  <div><label class="block text-xs text-slate-500 mb-1">备注(可选)</label><input id="note" type="text" placeholder="例:周三午餐" class="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-400"/></div>
</section>

<section class="bg-white rounded-2xl p-4 shadow-sm">
  <div class="flex items-center justify-between mb-2"><h2 class="font-semibold text-slate-800">最近消费</h2><button id="reset" class="text-xs text-slate-400 tap">重置账本</button></div>
  <div id="empty" class="text-center text-slate-400 py-6 text-sm hidden">还没有消费记录</div>
  <ul id="list" class="divide-y divide-slate-100"></ul>
</section>

</main>

<div class="fixed inset-x-0 bottom-0 z-50 pointer-events-none">
  <div class="max-w-3xl mx-auto pointer-events-auto">
    <div class="mx-3 mb-3 bg-white/95 backdrop-blur rounded-2xl shadow-2xl border border-slate-200 p-3 flex items-center gap-3" style="padding-bottom:max(0.75rem,env(safe-area-inset-bottom))">
      <div class="flex-1 min-w-0"><div class="text-[10px] text-slate-500">本次合计</div><div class="text-xl font-bold text-indigo-600 num-display leading-tight truncate">¥ <span id="previewTotal">0.00</span></div></div>
      <button id="submit" class="shrink-0 bg-indigo-600 active:bg-indigo-700 text-white font-semibold px-6 py-3 rounded-xl tap disabled:opacity-40 disabled:cursor-not-allowed">确认扣账</button>
    </div>
  </div>
</div>

<script>
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const fmt = n => (Math.round(n*100)/100).toFixed(2);
const fmtTime = iso => { const d=new Date(iso),p=n=>String(n).padStart(2,'0'),now=new Date(); const same=d.toDateString()===now.toDateString(); return same? \`今天 \${p(d.getHours())}:\${p(d.getMinutes())}\` : \`\${d.getMonth()+1}-\${p(d.getDate())} \${p(d.getHours())}:\${p(d.getMinutes())}\` };
const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]));
let state={balance:0,used:0,initial:10000,entries:[]},draft=[];
function render(){
  $('#balance').textContent=fmt(state.balance);$('#initial').textContent=fmt(state.initial);$('#used').textContent=fmt(state.used);
  const pct=state.initial>0?Math.min(100,(state.used/state.initial)*100):0;
  $('#progressBar').style.width=pct.toFixed(1)+'%';$('#progressText').textContent=pct.toFixed(0)+'%';
  $('#empty').classList.toggle('hidden',state.entries.length>0);
  $('#list').innerHTML=state.entries.slice(0,30).map(e=>\`<li class="py-2.5 fade-in"><div class="flex items-start justify-between gap-2"><div class="min-w-0 flex-1"><div class="flex items-center gap-1.5 flex-wrap"><span class="font-medium text-slate-800 text-sm">\${esc(e.operator||'匿名')}</span><span class="text-[11px] text-slate-400">\${fmtTime(e.createdAt)}</span>\${e.note?\`<span class="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">\${esc(e.note)}</span>\`:''}</div><div class="mt-0.5 text-xs text-slate-500">\${e.breakdown.map(b=>\`\${b.count}×¥\${fmt(b.price)}\`).join(' + ')}</div></div><div class="text-right shrink-0"><div class="font-semibold text-slate-800 text-sm num-display">-¥\${fmt(e.total)}</div></div></div></li>\`).join('');
  updatePreview();
}
function addToDraft(p,c){const e=draft.find(b=>b.price===p&&b.count===c);if(e)e.count+=c;else draft.push({price:p,count:c});refreshRows();flash(p,c)}
function flash(p,c){const b=document.querySelector(\`.quick[data-price="\${p}"][data-count="\${c}"]\`);if(!b)return;b.classList.add('ring-2','ring-indigo-400');setTimeout(()=>b.classList.remove('ring-2','ring-indigo-400'),220)}
function rowHtml(i,p,c){return \`<div class="row flex items-center gap-1.5" data-idx="\${i}"><span class="text-xs text-slate-500 w-9 shrink-0">人均</span><div class="flex items-center flex-1"><span class="px-1 text-slate-400 text-sm">¥</span><input type="number" inputmode="decimal" step="0.01" min="0.01" value="\${p}" data-field="price" placeholder="金额" class="price w-full px-2 py-1.5 rounded-md border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-400"/></div><span class="text-xs text-slate-400">×</span><div class="flex items-center gap-1"><button class="dec w-7 h-7 rounded-md border border-slate-200 tap">−</button><input type="number" inputmode="numeric" min="1" value="\${c}" data-field="count" class="count w-10 text-center px-1 py-1.5 rounded-md border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-400"/><button class="inc w-7 h-7 rounded-md border border-slate-200 tap">+</button></div><button class="del w-7 h-7 rounded-md text-slate-400 tap" title="删除">✕</button></div>\`}
function refreshRows(){const b=$('#rows');if(!draft.length)b.innerHTML='<div class="text-center text-xs text-slate-400 py-2">点击上方按钮或添加自定义行</div>';else b.innerHTML=draft.map((r,i)=>rowHtml(i,r.price,r.count)).join('');bindRowEvents();updatePreview()}
function bindRowEvents(){$$('.row').forEach(el=>{const idx=Number(el.dataset.idx);el.querySelector('[data-field="price"]').addEventListener('input',e=>{draft[idx].price=e.target.value===''?'':Number(e.target.value);updatePreview()});el.querySelector('[data-field="count"]').addEventListener('input',e=>{const v=parseInt(e.target.value,10);draft[idx].count=isNaN(v)||v<1?1:v;updatePreview()});el.querySelector('.inc').addEventListener('click',()=>{draft[idx].count++;el.querySelector('[data-field="count"]').value=draft[idx].count;updatePreview()});el.querySelector('.dec').addEventListener('click',()=>{draft[idx].count=Math.max(1,draft[idx].count-1);el.querySelector('[data-field="count"]').value=draft[idx].count;updatePreview()});el.querySelector('.del').addEventListener('click',()=>{draft.splice(idx,1);refreshRows()})})}
function updatePreview(){let t=0;$$('.row').forEach(el=>{const p=Number(el.querySelector('[data-field="price"]').value);const c=parseInt(el.querySelector('[data-field="count"]').value,10)||0;t+=(Number.isFinite(p)&&p>0&&c>0)?p*c:0});$('#previewTotal').textContent=fmt(t);$('#submit').disabled=t<=0||t>state.balance}
$$('.quick').forEach(btn=>btn.addEventListener('click',()=>{addToDraft(Number(btn.dataset.price),Number(btn.dataset.count));if(navigator.vibrate)navigator.vibrate(8)}));
$('#toggleCustom').addEventListener('click',()=>$('#customPanel').classList.toggle('hidden'));
$('#addCustom').addEventListener('click',()=>{draft.push({price:'',count:1});refreshRows();$$('.row').slice(-1)[0]?.querySelector('[data-field="price"]')?.focus()});
$('#submit').addEventListener('click',async()=>{
  const breakdown=draft.map(r=>({price:Number(r.price),count:parseInt(r.count,10)})).filter(r=>Number.isFinite(r.price)&&r.price>0&&r.count>0);
  if(!breakdown.length)return toast('请先选择人数配置');
  const op=$('#operator').value.trim();if(!op){$('#operator').focus();return toast('请填写操作人')}
  const nt=$('#note').value.trim();const sb=$('#submit');sb.disabled=true;const old=sb.textContent;sb.textContent='提交中…';
  try{const r=await fetch('/api/charge',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operator:op,note:nt,breakdown})});const d=await r.json();if(!r.ok)throw new Error(d.error||'提交失败');draft=[];$('#note').value='';refreshRows();if(navigator.vibrate)navigator.vibrate([10,30,10]);toast('扣账成功')}catch(err){toast(err.message)}finally{sb.textContent=old;updatePreview()}
});
function toast(m){let el=document.getElementById('toast');if(!el){el=document.createElement('div');el.id='toast';el.className='fixed left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 z-[60] bg-slate-900/90 text-white text-sm px-4 py-2 rounded-full pointer-events-none opacity-0 transition-opacity';document.body.appendChild(el)}el.textContent=m;el.style.opacity='1';clearTimeout(el._t);el._t=setTimeout(()=>el.style.opacity='0',1600)}
$('#reset').addEventListener('click',async()=>{if(!confirm('确定要清空所有流水并重置余额为 10000 吗？'))return;await fetch('/api/reset',{method:'POST'});toast('已重置')});
async function pull(){try{const r=await fetch('/api/state');state=await r.json();render()}catch(e){console.error(e)}}
function connectSSE(){const es=new EventSource('/api/events');es.addEventListener('hello',e=>{state=JSON.parse(e.data);render()});es.addEventListener('update',e=>{state=JSON.parse(e.data);render()});es.onerror={()=>{$('#connStatus').innerHTML='<span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span><span>重连中…</span>';es.close();setTimeout(connectSSE,2000)}};
(function init(){const s=localStorage.getItem('operator');if(s)$('#operator').value=s;$('#operator').addEventListener('input',e=>localStorage.setItem('operator',e.target.value));refreshRows();pull().then(connectSSE)})();
</script>
</body>
</html>`;
