// ==UserScript==
// @name         GFRe add 5btn
// @namespace    gfre.add.5btn
// @version      0.4.0
// @description  呼出＆花壇ボタンを追加
// @match        https://soraniwa.428.st/gf/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';
  if (window.__GFRE_ADD5_CFG__) return;
  window.__GFRE_ADD5_CFG__ = true;

  const K_CALL1 = 'gfre:add5:call1';
  const K_CALL2 = 'gfre:add5:call2';
  const K_CALL3 = 'gfre:add5:call3';
  const K_KADAN = 'gfre:add5:kadan';

  const HIDE_ON = new Set(['btn2','btn4','btn6']); // 探索, ワープ, 全体マップ

  function onReady(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }

  onReady(() => {
    const base = document.querySelector('input[type="submit"][value="行動する"]');
    if (!base) return;

    // 5ボタン追加（右側に並べるため逆順で挿入）
    if (!document.getElementById('__gfre_add5_marker__')) {
      ['設定','花壇','呼出3','呼出2','呼出1'].forEach(v => {
        base.insertAdjacentHTML('afterend', ' <input type="submit" class="__gfre_btn" style="display:inline;" value="'+ v +'">');
      });
      const m = document.createElement('span');
      m.id = '__gfre_add5_marker__';
      base.parentNode.insertBefore(m, base.nextSibling);
    }

    const btnCall1 = findBtn('呼出1');
    const btnCall2 = findBtn('呼出2');
    const btnCall3 = findBtn('呼出3');
    const btnKadan = findBtn('花壇');
    const btnConfig = findBtn('設定');

    btnCall1?.addEventListener('click', (e) => { e.preventDefault(); applyCall(loadArr(K_CALL1)); });
    btnCall2?.addEventListener('click', (e) => { e.preventDefault(); applyCall(loadArr(K_CALL2)); });
    btnCall3?.addEventListener('click', (e) => { e.preventDefault(); applyCall(loadArr(K_CALL3)); });
    btnKadan?.addEventListener('click', (e) => { e.preventDefault(); applyKadan(loadStr(K_KADAN)); });
    btnConfig?.addEventListener('click', (e) => { e.preventDefault(); openConfig(); });

    buildModal();

    // 無ちらつき表示制御
    injectHiddenClass();
    // 1) ユーザー操作直後に先に切替（pointerdown捕捉）
    document.addEventListener('pointerdown', (e) => {
      const sb = e.target.closest?.('.switchbutton');
      if (!sb || !sb.id) return;
      toggleExtra(!HIDE_ON.has(sb.id)); // 押下した時点で即反映
    }, true);
    // 2) クラス変化を監視（プログラム的切替に対応）
    const mo = new MutationObserver(() => syncByActiveTab());
    mo.observe(document.documentElement, { subtree:true, attributes:true, attributeFilter:['class'] });
    // 初期同期
    syncByActiveTab();
  });

  // d1〜d3へ代入
  function applyCall(arr){
    const [v1,v2,v3] = norm3(arr).map(normalizeNum);
    setValue('#d1', v1);
    setValue('#d2', v2);
    setValue('#d3', v3);
  }
  function applyKadan(v){
    const val = normalizeNum(v);
    setValue('#d1', val);
    setValue('#d2', '');
    setValue('#d3', '');
  }

  // 設定モーダル
  function buildModal(){
    if (document.getElementById('__gfre_cfg_wrap__')) return;

    const wrap = document.createElement('div');
    wrap.id = '__gfre_cfg_wrap__';
    wrap.style.cssText = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.3);z-index:2147483647';

    const pane = document.createElement('div');
    pane.id = '__gfre_cfg_pane__';
    pane.style.cssText = 'min-width:340px;max-width:90vw;background:#fff;border:1px solid #ddd;border-radius:12px;padding:14px;box-shadow:0 10px 24px rgba(0,0,0,.18);font:14px/1.5 -apple-system,BlinkMacSystemFont,Segoe UI,Meiryo,system-ui,sans-serif';

    pane.innerHTML = [
      '<div style="font-weight:700;margin-bottom:6px;">Quick設定</div>',
      row('呼出1', ['__in_c11','__in_c12','__in_c13']),
      row('呼出2', ['__in_c21','__in_c22','__in_c23']),
      row('呼出3', ['__in_c31','__in_c32','__in_c33']),
      row('花壇', ['__in_k1']),
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">',
      '<button type="button" id="__cfg_cancel" style="height:32px;padding:0 12px;border:1px solid #d0d0d0;border-radius:8px;background:#fff;cursor:pointer;">キャンセル</button>',
      '<button type="button" id="__cfg_save" style="height:32px;padding:0 12px;border:1px solid #2563eb;border-radius:8px;background:#2563eb;color:#fff;cursor:pointer;">登録</button>',
      '</div>'
    ].join('');

    wrap.appendChild(pane);
    document.body.appendChild(wrap);

    fillInputs();
    attachNumericFilters();

    wrap.addEventListener('click', (e)=>{ if(e.target===wrap) closeConfig(); });
    pane.querySelector('#__cfg_cancel').addEventListener('click', closeConfig);
    pane.querySelector('#__cfg_save').addEventListener('click', saveConfig);

    window.__GFRE_OPEN_CFG__ = openConfig;

    function row(label, ids){
      const inputs = ids.map(id => '<input id="'+id+'" type="text" inputmode="numeric" pattern="\\d*" style="flex:1 1 0;border:1px solid #ccc;border-radius:6px;height:30px;padding:0 8px;">').join('<span style="width:6px;"></span>');
      return '<div style="display:flex;align-items:center;gap:8px;margin-top:8px;"><label style="min-width:54px;">'+label+'</label><div style="display:flex;flex:1 1 auto;">'+inputs+'</div></div>';
    }

    function fillInputs(){
      const c1 = loadArr(K_CALL1);
      const c2 = loadArr(K_CALL2);
      const c3 = loadArr(K_CALL3);
      const kd = loadStr(K_KADAN);
      set('#__in_c11', c1[0]||''); set('#__in_c12', c1[1]||''); set('#__in_c13', c1[2]||'');
      set('#__in_c21', c2[0]||''); set('#__in_c22', c2[1]||''); set('#__in_c23', c2[2]||'');
      set('#__in_c31', c3[0]||''); set('#__in_c32', c3[1]||''); set('#__in_c33', c3[2]||'');
      set('#__in_k1', kd||'');
    }

    function attachNumericFilters(){
      const ids = ['__in_c11','__in_c12','__in_c13','__in_c21','__in_c22','__in_c23','__in_c31','__in_c32','__in_c33','__in_k1'];
      ids.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        enforceHalfWidthNumeric(el);
      });
    }

    function saveConfig(){
      const c1 = [val('#__in_c11'), val('#__in_c12'), val('#__in_c13')].map(normalizeNum).filter(x=>x!=='');
      const c2 = [val('#__in_c21'), val('#__in_c22'), val('#__in_c23')].map(normalizeNum).filter(x=>x!=='');
      const c3 = [val('#__in_c31'), val('#__in_c32'), val('#__in_c33')].map(normalizeNum).filter(x=>x!=='');
      const kd = normalizeNum(val('#__in_k1'));
      saveArr(K_CALL1, c1);
      saveArr(K_CALL2, c2);
      saveArr(K_CALL3, c3);
      saveStr(K_KADAN, kd);
      closeConfig();
    }
  }

  // 可視制御
  function injectHiddenClass(){
    if (document.getElementById('__gfre_style_hidden__')) return;
    const st = document.createElement('style');
    st.id = '__gfre_style_hidden__';
    st.textContent = '.gfre-hidden{display:none !important;}';
    document.head.appendChild(st);
  }
  function extraButtons(){
    return document.querySelectorAll('.__gfre_btn');
  }
  function toggleExtra(show){
    extraButtons().forEach(el => el.classList.toggle('gfre-hidden', !show));
  }
  function activeTabId(){
    const act = document.querySelector('.switchbutton.enablebtn');
    return act?.id || '';
  }
  function syncByActiveTab(){
    const id = activeTabId();
    toggleExtra(!HIDE_ON.has(id));
  }

  // 開閉
  function openConfig(){ const w = document.getElementById('__gfre_cfg_wrap__'); if(w) w.style.display='flex'; }
  function closeConfig(){ const w = document.getElementById('__gfre_cfg_wrap__'); if(w) w.style.display='none'; }

  // 小物
  function findBtn(label){ return Array.from(document.querySelectorAll('input[type="submit"]')).find(b => b.value === label); }
  function setValue(sel, v){ const el = document.querySelector(sel); if(el!=null) el.value = v ?? ''; }
  function set(sel, v){ const el = document.querySelector(sel); if(el!=null) el.value = v ?? ''; }
  function val(sel){ const el = document.querySelector(sel); return el ? String(el.value||'') : ''; }
  function norm3(a){ const x = Array.isArray(a)?a:[]; return [x[0]||'',x[1]||'',x[2]||'']; }
  function loadArr(k){ try{ const v = JSON.parse(localStorage.getItem(k)||'[]'); return Array.isArray(v)?v:[]; }catch{return [];} }
  function saveArr(k,a){ try{ localStorage.setItem(k, JSON.stringify(Array.isArray(a)?a:[])); }catch{} }
  function loadStr(k){ try{ return localStorage.getItem(k)||''; }catch{return '';} }
  function saveStr(k,s){ try{ localStorage.setItem(k, String(s||'')); }catch{} }

  // 入力制御 全角→半角、半角数字のみ、1〜9999へ制限
  function enforceHalfWidthNumeric(input){
    const fix = () => {
      let v = input.value;
      v = v.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
      v = v.replace(/[^0-9]/g, '');
      if (v.length > 4) v = v.slice(0, 4);
      if (v !== '') {
        let n = parseInt(v, 10);
        if (!Number.isFinite(n)) n = 0;
        if (n < 1) n = 1;
        if (n > 9999) n = 9999;
        v = String(n);
      }
      if (input.value !== v) input.value = v;
    };
    input.addEventListener('input', fix);
    input.addEventListener('blur', fix);
    input.addEventListener('paste', () => { setTimeout(fix, 0); });
  }

  // 任意値→Eno正規形。空は空のまま返す。
  function normalizeNum(v){
    let s = typeof v === 'string' ? v : '';
    s = s.replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
    s = s.replace(/[^0-9]/g, '');
    if (s === '') return '';
    let n = parseInt(s, 10);
    if (!Number.isFinite(n)) return '';
    if (n < 1) n = 1;
    if (n > 9999) n = 9999;
    return String(n);
  }
})();
