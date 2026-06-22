var https = require('https');

var UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
var UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

function redisGet(key, cb){
  var url = UPSTASH_URL + '/get/' + encodeURIComponent(key);
  var req = https.request(url, { method:'GET', headers:{ Authorization:'Bearer '+UPSTASH_TOKEN } }, function(res){
    var d='';
    res.on('data',function(c){d+=c});
    res.on('end',function(){ try{ cb(null, JSON.parse(d)) }catch(e){ cb(e) } });
  });
  req.on('error', function(e){ cb(e) });
  req.end();
}

function redisSet(key, val, cb){
  var body = JSON.stringify([{ command:'SET', args:[key, val] }]);
  var url = UPSTASH_URL;
  var req = https.request(url, {
    method:'POST',
    headers:{ 'Content-Type':'application/json', Authorization:'Bearer '+UPSTASH_TOKEN, 'Content-Length':Buffer.byteLength(body) }
  }, function(res){
    var d='';
    res.on('data',function(c){d+=c});
    res.on('end',function(){ try{ cb(null, JSON.parse(d)) }catch(e){ cb(e) } });
  });
  req.on('error', function(e){ cb(e) });
  req.write(body);
  req.end();
}

function now(){ return new Date().toISOString() }

module.exports = function(req, res){
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if(req.method==='OPTIONS'){ res.statusCode=204; return res.end() }
  if(req.method!=='POST'){ res.statusCode=405; return res.end(JSON.stringify({ok:false,error:'Method not allowed'})) }

  if(!UPSTASH_URL||!UPSTASH_TOKEN){
    res.statusCode=500; return res.end(JSON.stringify({ok:false,error:'Redis env not configured'}));
  }

  var chunks=[];
  req.on('data', function(c){ chunks.push(c) });
  req.on('end', function(){
    var body;
    try{ body=JSON.parse(Buffer.concat(chunks).toString()) }catch(e){ res.statusCode=400; return res.end(JSON.stringify({ok:false,error:'Invalid JSON'})) }

    var amount = parseFloat(body.amount);
    if(isNaN(amount)||amount<=0){ res.statusCode=400; return res.end(JSON.stringify({ok:false,error:'Invalid amount'})) }

    redisGet('ledger_state', function(err, r){
      if(err||!r||r.result===null){
        res.statusCode=500; return res.end(JSON.stringify({ok:false,error:'Failed to read state'}));
      }
      var state;
      try{ state=JSON.parse(r.result) }catch(e){ res.statusCode=500; return res.end(JSON.stringify({ok:false,error:'Corrupted state'})) }

      state.balance = (state.balance||0) + amount;
      state.used = (state.initial||0) - state.balance;
      var entry = {
        amount: amount,
        perPerson: 0,
        people: 0,
        person: body.person||'未知',
        note: '充值 +¥' + amount.toFixed(2),
        time: now(),
        balanceAfter: state.balance
      };
      state.entries = state.entries||[];
      state.entries.push(entry);

      redisSet('ledger_state', JSON.stringify(state), function(err2){
        if(err2){ res.statusCode=500; return res.end(JSON.stringify({ok:false,error:'Failed to save'})) }
        res.setHeader('Content-Type','application/json');
        res.end(JSON.stringify({ok:true,state:state}));
      });
    });
  });
};
