// ==UserScript==
// @name         GFRe add 5btn
// @namespace    gfre.add.5btn
// @version      0.9.1
// @description  呼出＆花壇ボタンを追加
// @match        https://soraniwa.428.st/gf/*
// @run-at       document-idle
// @grant        none
// @updateURL    https://github.com/Sinistella/42ste114/raw/refs/heads/main/GFRe/add5btn.user.js
// @downloadURL  https://github.com/Sinistella/42ste114/raw/refs/heads/main/GFRe/add5btn.user.js
// ==/UserScript==

(function () {
  'use strict';
  if (window.__GFRE_ADD5_CFG__) return;
  window.__GFRE_ADD5_CFG__ = true;

  // --- 定数・設定 ---
  const K_CALL1 = 'gfre:add5:call1';
  const K_CALL2 = 'gfre:add5:call2';
  const K_CALL3 = 'gfre:add5:call3';
  const K_KADAN = 'gfre:add5:kadan';
  const HIDE_ON = new Set(['btn2','btn4','btn6']);

  function onReady(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }

  onReady(() => {
    const base = document.querySelector('input[type="submit"][value="行動する"]');
    if (!base) return;

    if (!document.getElementById('__gfre_add5_marker__')) {
      // 1. 配置崩れの原因となる改行(BR)を削除
      const next = base.nextSibling;
      if (next && next.tagName === 'BR') next.remove();

      // 2. ボタンの生成
      ['設定','花壇','呼出３','呼出２','呼出１'].forEach(v => {
        const btn = document.createElement('input');
        btn.type = 'submit'; // 見た目を「行動する」と完全に一致させる
        btn.className = '__gfre_btn';
        btn.value = v;
        btn.style.margin = '4px'; // main.cssの余白を明示

        // ★重要：サイト側による value 書き換えを「拒否」する設定
        Object.defineProperty(btn, 'value', {
          value: v,
          writable: false,     // 書き換え禁止
          configurable: true
        });

        base.insertAdjacentElement('afterend', btn);

        // イベント付与
        btn.addEventListener('click', (e) => {
          e.preventDefault(); // 送信を阻止
          e.stopPropagation();
          if (v === '呼出１') applyCall(loadArr(K_CALL1));
          else if (v === '呼出２') applyCall(loadArr(K_CALL2));
          else if (v === '呼出３') applyCall(loadArr(K_CALL3));
          else if (v === '花壇') applyKadan(loadStr(K_KADAN));
          else if (v === '設定') openConfig(); // ★修正箇所
        }, true);
      });

      const m = document.createElement('span');
      m.id = '__gfre_add5_marker__';
      base.parentNode.insertBefore(m, base.nextSibling);
    }

    buildModal(); // ★追加箇所
    injectHiddenClass();
    const mo = new MutationObserver(() => syncByActiveTab());
    mo.observe(document.documentElement, { subtree:true, attributes:true, attributeFilter:['class'] });
    syncByActiveTab();
  });

  // --- 反映・保存ロジック ---
  function applyCall(arr){
    const [v1,v2,v3] = norm3(arr).map(normalizeNum);
    setValue('#d1', v1); setValue('#d2', v2); setValue('#d3', v3);
  }
  function applyKadan(v){
    const val = normalizeNum(v);
    setValue('#d1', val); setValue('#d2', ''); setValue('#d3', '');
  }
  function setValue(sel, v){ const el = document.querySelector(sel); if(el) el.value = v ?? ''; }
  function loadArr(k){ try{ return JSON.parse(localStorage.getItem(k)||'[]'); }catch{return [];} }
  function loadStr(k){ return localStorage.getItem(k)||''; }
  function normalizeNum(v){ return String(v||'').replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0)-0xFEE0)).replace(/[^0-9]/g,''); }
  function norm3(a){ return [a[0]||'', a[1]||'', a[2]||'']; }

  function injectHiddenClass(){
    if (document.getElementById('__gfre_style_hidden__')) return;
    const st = document.createElement('style');
    st.id = '__gfre_style_hidden__';
    st.textContent = '.gfre-hidden{display:none !important;}';
    document.head.appendChild(st);
  }

  function syncByActiveTab(){
    const act = document.querySelector('.switchbutton.enablebtn');
    const show = !HIDE_ON.has(act?.id || '');
    document.querySelectorAll('.__gfre_btn').forEach(el => {
      const val = el.getAttribute('value');
      if (val !== '設定') el.classList.toggle('gfre-hidden', !show);
    });
  }

  // --- ★以下追加分：設定画面ロジック ---
  function openConfig() { const w = document.getElementById('__gfre_cfg_wrap__'); if (w) w.style.display = 'flex'; }
  function closeConfig() { const w = document.getElementById('__gfre_cfg_wrap__'); if (w) w.style.display = 'none'; }
  function getVal(sel) { const el = document.querySelector(sel); return el ? String(el.value || '') : ''; }
  function saveArr(k, a) { try { localStorage.setItem(k, JSON.stringify(Array.isArray(a) ? a : [])); } catch {} }
  function saveStr(k, s) { localStorage.setItem(k, String(s || '')); }

  function enforceHalfWidthNumeric(input) {
    const fix = () => {
      const v = normalizeNum(input.value);
      if (input.value !== v) input.value = v;
    };
    input.addEventListener('input', fix);
    input.addEventListener('blur', fix);
    input.addEventListener('paste', () => setTimeout(fix, 0));
  }

  function buildModal() {
    if (document.getElementById('__gfre_cfg_wrap__')) return;

    const wrap = document.createElement('div');
    wrap.id = '__gfre_cfg_wrap__';
    wrap.style.cssText = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.3);z-index:2147483647';

    const pane = document.createElement('div');
    pane.id = '__gfre_cfg_pane__';
    pane.style.cssText = 'min-width:340px;max-width:90vw;background:#fff;border:1px solid #ddd;border-radius:12px;padding:14px;box-shadow:0 10px 24px rgba(0,0,0,.18);font:14px/1.5 -apple-system,BlinkMacSystemFont,Segoe UI,Meiryo,system-ui,sans-serif';

    pane.innerHTML = [
      '<div style="font-weight:700;margin-bottom:6px;">Eno登録</div>',
      row('呼出１', ['__in_c11', '__in_c12', '__in_c13']),
      row('呼出２', ['__in_c21', '__in_c22', '__in_c23']),
      row('呼出３', ['__in_c31', '__in_c32', '__in_c33']),
      row('花壇', ['__in_k1']),
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">',
      '<button type="button" id="__cfg_cancel" style="height:32px;padding:0 12px;border:1px solid #d0d0d0;border-radius:8px;background:#fff;cursor:pointer;">キャンセル</button>',
      '<button type="button" id="__cfg_save" style="height:32px;padding:0 12px;border:1px solid #2563eb;border-radius:8px;background:#2563eb;color:#fff;cursor:pointer;">登録</button>',
      '</div>'
    ].join('');

    wrap.appendChild(pane);
    document.body.appendChild(wrap);

    fillInputs();

    ['__in_c11', '__in_c12', '__in_c13', '__in_c21', '__in_c22', '__in_c23', '__in_c31', '__in_c32', '__in_c33', '__in_k1'].forEach(id => {
      const el = document.getElementById(id);
      if (el) enforceHalfWidthNumeric(el);
    });

    wrap.addEventListener('click', (e) => { if (e.target === wrap) closeConfig(); });
    pane.querySelector('#__cfg_cancel').addEventListener('click', closeConfig);
    pane.querySelector('#__cfg_save').addEventListener('click', saveConfig);

    function row(label, ids) {
      const inputs = ids.map(id => '<input id="' + id + '" type="text" inputmode="numeric" pattern="\\d*" style="flex:1 1 0;border:1px solid #ccc;border-radius:6px;height:30px;padding:0 8px;">').join('<span style="width:6px;"></span>');
      return '<div style="display:flex;align-items:center;gap:8px;margin-top:8px;"><label style="min-width:54px;">' + label + '</label><div style="display:flex;flex:1 1 auto;">' + inputs + '</div></div>';
    }

    function fillInputs() {
      const c1 = loadArr(K_CALL1);
      const c2 = loadArr(K_CALL2);
      const c3 = loadArr(K_CALL3);
      const kd = loadStr(K_KADAN);
      setValue('#__in_c11', c1[0]); setValue('#__in_c12', c1[1]); setValue('#__in_c13', c1[2]);
      setValue('#__in_c21', c2[0]); setValue('#__in_c22', c2[1]); setValue('#__in_c23', c2[2]);
      setValue('#__in_c31', c3[0]); setValue('#__in_c32', c3[1]); setValue('#__in_c33', c3[2]);
      setValue('#__in_k1', kd);
    }

    function saveConfig() {
      const c1 = [getVal('#__in_c11'), getVal('#__in_c12'), getVal('#__in_c13')].map(normalizeNum).filter(x => x !== '');
      const c2 = [getVal('#__in_c21'), getVal('#__in_c22'), getVal('#__in_c23')].map(normalizeNum).filter(x => x !== '');
      const c3 = [getVal('#__in_c31'), getVal('#__in_c32'), getVal('#__in_c33')].map(normalizeNum).filter(x => x !== '');
      const kd = normalizeNum(getVal('#__in_k1'));
      saveArr(K_CALL1, c1);
      saveArr(K_CALL2, c2);
      saveArr(K_CALL3, c3);
      saveStr(K_KADAN, kd);
      closeConfig();
    }
  }
})();
