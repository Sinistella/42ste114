// ==UserScript==
// @name         GFRe 共有スプシ転記
// @namespace    gfre.silver.song
// @version      1.5.3
// @description  現在座標(x,y)の探索データを対応セルのメモ欄へ転記
// @match        https://soraniwa.428.st/gf/*
// @run-at       document-end
// @grant        GM_xmlhttpRequest
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @noframes
// ==/UserScript==

(function() {
  'use strict';

  const GAS_URL = 'https://script.google.com/macros/s/AKfycbzuw0595-IaDFLqcST3NreSmEN3Db8GW6UY8wAdpPxxWIQw3yXoOYZBRgUK6cksoNXQ/exec';

  function q(sel){ return document.querySelector(sel); }
  function toast(msg){
    let t = q('#gfre-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'gfre-toast';
      t.style.cssText = 'position:fixed;left:50%;bottom:64px;transform:translateX(-50%);background:#333;color:#fff;padding:8px 12px;border-radius:6px;z-index:2147483647;font-size:13px;opacity:0;transition:opacity .15s;';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    setTimeout(()=>{ t.style.opacity = '0'; },1500);
  }

  function parseItemsFromDrop(node){
    const html = node.innerHTML || '';
    // 属性付きbrも等価に扱い、不可視文字も正規化して除去
    const raw = html
      .split(/<br\b[^>]*>/gi)
      .map(s => normalizeText(s.replace(/<[^>]*>/g,'')));
    return raw.filter(s => s.length > 0);
  }

  function postOnce(payload){
    return new Promise(resolve=>{
      GM_xmlhttpRequest({
        method:'POST',
        url:GAS_URL,
        headers:{'Content-Type':'application/json'},
        data:JSON.stringify(payload),
        timeout:15000,
        onload:res=>{
          const status = res.status;
          const text = res.responseText || '';
          try{
            const json = JSON.parse(text);
            resolve({ok:!!json.ok, status, json, text, responseHeaders: res.responseHeaders});
          }catch{
            resolve({ok:false, status, json:null, text, responseHeaders: res.responseHeaders});
          }
        },
        onerror:()=>resolve({ok:false, status:0, json:null, text:'', responseHeaders:''}),
        ontimeout:()=>resolve({ok:false, status:408, json:null, text:'Request timed out.', responseHeaders:''})
      });
    });
  }

  function delay(ms){ return new Promise(r=>setTimeout(r,ms)); }
  async function postToGAS(payload, retries=1){
    let last=null;
    for(let i=0;i<=retries;i++){
      const res = await postOnce(payload);
      if(res.status === 200 && res.ok) return res;
      last = res;
      if(i<retries) await delay(800 + Math.floor(Math.random()*400));
    }
    return last;
  }

  function numToA1Col(n){
    let s='';
    while(n>0){
      n-=1;
      s=String.fromCharCode(65+(n%26))+s;
      n=Math.floor(n/26);
    }
    return s;
  }

  // NFKC正規化と不可視文字の除去でパースを強化
  function normalizeText(str){
    if(!str) return '';
    return String(str)
      .normalize('NFKC')
      .replace(/[\u00A0\u2007\u202F\u200B-\u200D\u2060\uFEFF]/g,'') // NBSP系とゼロ幅類
      .replace(/\s+/g,' ')
      .trim();
  }

  function isEncounterBusy(){
    const enc1 = q('#encount');
    const enc2 = q('#encount2');
    const text1 = enc1 ? enc1.textContent || '' : '';
    const text2 = enc2 ? enc2.textContent || '' : '';
    const hasText = (text1 + text2).replace(/[\u200B-\u200D\u2060\uFEFF]/g,'').trim() !== '';
    return hasText;
  }

  let pending=false;
  async function onClick(){
    if(pending) return;
    if(isEncounterBusy()){
      toast('演出中は転記できない');
      return;
    }
    const xNode=q('#map_x');
    const yNode=q('#map_y');
    const dropNode=q('#drop');
    if(!xNode || !yNode || !dropNode){
      toast('対象DOM未検出');
      return;
    }

    const x = parseInt(normalizeText(xNode.textContent), 10);
    const y = parseInt(normalizeText(yNode.textContent), 10);
    const items=parseItemsFromDrop(dropNode);

    const FORBIDDEN_KEYWORDS = ['アイテム', '何か'];
    const hasForbiddenItem = items.some(item =>
        FORBIDDEN_KEYWORDS.some(keyword => item.includes(keyword))
    );
    if (hasForbiddenItem) {
        toast('未探索のため転記できません');
        return;
    }

    if(!Number.isInteger(x) || !Number.isInteger(y) || items.length === 0){
      toast('データ不足');
      return;
    }

    const btn=q('#silversong');
    const origText=btn?btn.textContent:'';
    if(btn){
      btn.textContent='転記中';
      btn.style.opacity='0.6';
      btn.style.pointerEvents='none';
    }

    pending=true;
    try{
      const res = await postToGAS({x,y,items}, 1);
      if(res && res.ok && res.status === 200){
        const colNumber=x+1;
        const rowNumber=y+2;
        const a1=numToA1Col(colNumber)+rowNumber;
        toast(`シートの${a1}、メモ欄に転記完了。`);
      }else{
        console.error('[GFRe] 転記失敗', {
          status: res && res.status,
          head: res && res.text ? String(res.text).slice(0,160) : '',
          hdr: res && res.responseHeaders ? String(res.responseHeaders).slice(0,80) : '',
          json: res && res.json
        });
        toast('転記失敗');
      }
    }catch(e){
      console.error('[GFRe] 例外', e);
      toast('エラー発生');
    }finally{
      pending=false;
      if(btn){
        btn.textContent=origText||'情報提供';
        btn.style.opacity='';
        btn.style.pointerEvents='';
      }
    }
  }

  function ensureButton() {
    if (q('#silversong')) return;
    const drop = q('#drop');
    if (!drop) return;
    const btn = document.createElement('div');
    btn.className = 'queryButton';
    btn.id = 'silversong';
    btn.textContent = '情報提供';
    btn.addEventListener('click', onClick);
    const tansaku = q('#tansaku');
    if (tansaku && tansaku.parentElement) {
      tansaku.insertAdjacentElement('afterend', btn);
    } else {
      drop.insertAdjacentElement('afterend', btn);
    }
  }

  function init(){
    ensureButton();
    let timer;
    const debounced = () => {
      clearTimeout(timer);
      timer = setTimeout(ensureButton, 250);
    };
    // 監視対象を#dropの親要素に限定。見つからなければbodyを監視
    const target = q('#drop') ? q('#drop').parentElement || document.body : document.body;
    const obs = new MutationObserver(debounced);
    obs.observe(target, {childList:true, subtree:true});
  }

  if(document.readyState === 'complete' || document.readyState === 'interactive') {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init, {once:true});
  }
})();
