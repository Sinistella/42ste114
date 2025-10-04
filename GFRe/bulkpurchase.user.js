// ==UserScript==
// @name         GFre 連続購入
// @namespace    GFre.bulk.purchase
// @version      1.1.3
// @description  Shopでの連続購入を可能に
// @match        https://soraniwa.428.st/gf/?mode=shop
// @run-at       document-end
// @grant        none
// @noframes
// @updateURL    https://github.com/Sinistella/42ste114/raw/refs/heads/main/GFRe/bulkpurchase.user.js
// @downloadURL  https://github.com/Sinistella/42ste114/raw/refs/heads/main/GFRe/bulkpurchase.user.js
// @homepageURL  https://github.com/Sinistella/42ste114
// ==/UserScript==
(function(){
  'use strict';

  // =======================
  // 設定値
  // =======================
  const LIMIT_MAX_QTY   = 99;     // 最大購入可数
  const SUCCESS_WAIT_MS = 1500;   // 成功時の待機(ms)
  const REQ_TIMEOUT_MS  = 15000;  // リクエストタイムアウト(ms)
  const JITTER_MS       = 300;    // 待機に加えるランダム揺らぎ(ms)

  const $  = (s, r=document)=>r.querySelector(s);
  const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
  const sleep  = ms=>new Promise(r=>setTimeout(r, ms));
  const jitter = base=> base + Math.floor(Math.random()*JITTER_MS);

  // 対象フォーム
  const form = $$('form').find(f=>{
    const methodOk = (f.method||'').toLowerCase()==='post';
    const hasMode  = f.querySelector('input[name="mode"][value="keizoku02_item_post"]');
    const hasBuy   = f.querySelector('input[name="action"][value="buy"]');
    const hasIno   = f.querySelector('[name="ino"]');
    return methodOk && hasMode && hasBuy && hasIno;
  });
  if(!form){
    console.warn('[GFre Shop 連続購入] 対象フォームが見つかりません');
    return;
  }

  // styleとUI
  const style = document.createElement('style');
  style.textContent = [
    '#sgMask{position:fixed;inset:0;background:rgba(0,0,0,.45);display:none;z-index:2147483646}',
    '#sgModal{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:#1e1e1e;color:#eee;border:1px solid #555;border-radius:10px;padding:16px;min-width:280px}',
    '#sgModal h3{margin:0 0 8px 0;font-size:16px}',
    '#sgQty{width:100%;box-sizing:border-box;padding:8px;margin-top:6px;font-size:16px}',
    '#sgBtns{margin-top:10px;display:flex;justify-content:flex-end;gap:6px}',

    /* 購入コンソール全体 */
    '#sgConsole{position:fixed;right:8px;bottom:8px;z-index:2147483645;background:rgba(30,30,30,.95);color:#eee;border:1px solid #555;border-radius:8px;padding:10px;width:360px;max-height:48vh;overflow:auto;font-family:ui-monospace,monospace}',
    '#sgConsole h4{margin:0 0 6px 0;font-size:13px;color:#eee}',

    /* プログレスバー */
    '#sgBar{height:6px;background:#333;border-radius:4px;overflow:hidden;margin-bottom:6px}',
    '#sgBar > i{display:block;height:100%;width:0%}',

    /* ステータスとログ */
    '#sgState{font-size:12px;margin-top:2px;color:#eee}',
    '#sgLog{margin:0;white-space:pre-wrap;word-break:break-word;font-size:12px;line-height:1.45;color:#eee}'
  ].join('\n');
  document.head.appendChild(style);

  const mask = document.createElement('div');
  mask.id = 'sgMask';
  mask.innerHTML =
    '<div id="sgModal" role="dialog" aria-modal="true">'+
      '<h3>購入個数の入力（最大99）</h3>'+
      '<input id="sgQty" type="text" inputmode="numeric" pattern="\\d*" placeholder="例 15" autocomplete="off">'+
      '<div id="sgBtns">'+
        '<button id="sgCancel" type="button">キャンセル</button>'+
        '<button id="sgOk" type="button">決定</button>'+
      '</div>'+
    '</div>';
  document.body.appendChild(mask);

  const panel = document.createElement('div');
  panel.id = 'sgConsole';
  panel.innerHTML =
    '<div style="font-size:13px;color:#eee;margin-bottom:4px">購入管理画面</div>'+
    '<div id="sgBar"><i></i></div>'+
    '<div id="sgState"></div>'+
    '<pre id="sgLog"></pre>'+
    '<div style="display:flex;gap:6px;justify-content:flex-end;margin-top:6px">'+
      '<button id="sgPause" type="button" disabled>一時停止</button>'+
      '<button id="sgResume" type="button" disabled>再開</button>'+
      '<button id="sgStop" type="button" disabled>中止</button>'+
    '</div>';
  document.body.appendChild(panel);

  const ui = {
    mask,
    qty: mask.querySelector('#sgQty'),
    ok: mask.querySelector('#sgOk'),
    cancel: mask.querySelector('#sgCancel'),
    bar: panel.querySelector('#sgBar > i'),
    state: panel.querySelector('#sgState'),
    log: panel.querySelector('#sgLog'),
    pause: panel.querySelector('#sgPause'),
    resume: panel.querySelector('#sgResume'),
    stop: panel.querySelector('#sgStop')
  };

  function log(s){
    const t = new Date().toLocaleTimeString();
    ui.log.textContent += '['+t+'] '+s+'\n';
    // ログは最新5件だけ保持
    const lines = ui.log.textContent.trim().split('\n');
    if(lines.length > 5) ui.log.textContent = lines.slice(-5).join('\n')+'\n';
    ui.log.parentElement.scrollTop = ui.log.parentElement.scrollHeight;
  }
  function setProgress(cur,total){
    const pct = total>0 ? Math.floor(cur*100/total) : 0;
    ui.bar.style.width = pct+'%';
    ui.bar.style.background = pct<100 ? '#6aa' : '#6a6';
    ui.state.textContent = '進捗 '+cur+'/'+total+' ('+pct+'%)';
  }

  // 入力補正
  ui.qty.addEventListener('input', function(){
    const v = this.value.replace(/[^\d]/g,'');
    if(v !== this.value) this.value = v;
  });
  ui.qty.addEventListener('keydown', function(e){
    if(e.key==='Enter') ui.ok.click();
  });

  // submit差し替え
  let guardSubmitting = false;
  let running = false;
  form.addEventListener('submit', function(ev){
    if(guardSubmitting) return;
    if(running){ alert('購入処理が進行中です'); return; }
    ev.preventDefault();
    ui.qty.value = '';
    if(ui.mask.style.display!=='block'){
      ui.mask.style.display = 'block';
      setTimeout(()=>ui.qty.focus(), 0);
    }
  });
  ui.cancel.addEventListener('click', ()=> ui.mask.style.display = 'none');

  // 制御フラグ
  let stopRequested = false;
  let paused = false;
  ui.pause.addEventListener('click', function(){
    paused = true;
    this.disabled = true;
    ui.resume.disabled = false;
    log('一時停止を受け付けました');
  });
  ui.resume.addEventListener('click', function(){
    paused = false;
    this.disabled = true;
    ui.pause.disabled = false;
    log('再開');
  });
  ui.stop.addEventListener('click', function(){
    stopRequested = true;
    log('中止を受け付けました');
  });

  // 直列実行本体
  async function runSerialBuy(qty){
    if(running) return;
    running = true;

    const inoInput = form.querySelector('[name="ino"]');
    const ino = inoInput ? String(inoInput.value||'').trim() : '';
    if(!ino || !/^\d+$/.test(ino)){ alert('商品No.が存在しない'); running=false; return; }

    log('購入開始 商品No.'+ino+' 個数'+qty);
    setProgress(0, qty);

    ui.pause.disabled = false;
    ui.stop.disabled = false;
    ui.resume.disabled = true;

    let success = 0;

    for(let i=1;i<=qty;i++){
      if(stopRequested){ log('中止命令により終了'); break; }
      while(paused && !stopRequested){ await sleep(200); }
      if(stopRequested){ log('中止命令により終了'); break; }

      try{
        const fd = new FormData(form);
        fd.set('action','buy');
        fd.set('ino', ino);

        const body = new URLSearchParams();
        for(const [k,v] of fd.entries()){
          body.append(k, typeof v==='string' ? v : String(v));
        }

        const actAttr = form.getAttribute('action') || '.';
        const url = new URL(actAttr, location.href).href;

        const ctrl = new AbortController();
        const timer = setTimeout(()=>ctrl.abort('timeout'), REQ_TIMEOUT_MS);
        const t0 = performance.now();

        const resp = await fetch(url, {
          method: 'POST',
          headers: {'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8'},
          body: body.toString(),
          credentials: 'same-origin',
          cache: 'no-store',
          redirect: 'follow',
          signal: ctrl.signal
        });

        const elapsed = Math.round(performance.now() - t0);
        clearTimeout(timer);

        if(resp.ok){
          success++;
          log('成功 '+i+'/'+qty+' 判定根拠:http-200 応答ms:'+elapsed);
          setProgress(i, qty);
          await sleep(jitter(SUCCESS_WAIT_MS));
        }else{
          log('不確定 '+i+'/'+qty+' 応答ms:'+elapsed+' → 安全面を配慮して停止');
          setProgress(i, qty);
          break;
        }
      }catch(e){
        const msg = e && e.name==='AbortError' ? 'タイムアウト' : '例外処理';
        log('不確定 '+i+'/'+qty+' 詳細:'+msg+' → 安全面を配慮して停止');
        setProgress(i, qty);
        break;
      }
    }

    log('購入処理を終了 成功:'+success);
    guardSubmitting = false;
    running = false;
    ui.pause.disabled = true;
    ui.resume.disabled = true;
    ui.stop.disabled = true;
  }

  // モーダル確定
  ui.ok.addEventListener('click', async function(){
    let qtyStr = ui.qty.value.trim();
    if(!qtyStr){ alert('個数を入力して下さい'); return; }
    if(!/^\d+$/.test(qtyStr)){ alert('半角数字のみ有効'); return; }
    let qty = Math.min(parseInt(qtyStr, 10), LIMIT_MAX_QTY);
    if(qty <= 0){ alert('1以上を指定'); return; }

    ui.mask.style.display = 'none';
    stopRequested = false;
    paused = false;

    guardSubmitting = true;
    await runSerialBuy(qty);
  });

})();
