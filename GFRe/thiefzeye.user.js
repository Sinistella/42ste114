// ==UserScript==
// @name         GFRe Thiefz Eye
// @namespace    gfre.thiefz.eye
// @version      1.0.0
// @description  メモから座標群を取得し★で表示
// @match        https://soraniwa.428.st/gf/*
// @run-at       document-end
// @grant        GM_xmlhttpRequest
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  // GAS
  const GAS_URL = 'https://script.google.com/macros/s/AKfycbx5hBy0XC2-ySat0CatFePaAZy3QAQM6_1Wkvi81fpOa-W0HY5ICCPF1rorr9tWszhV/exec';

  // 設定
  const CFG = {
    subMapSel: '#maparea_sub',
    xSel: '#map_x',
    ySel: '#map_y',
    overlayId: 'gfre-thiefz-eye-overlay',
    buttonInlineStyle: 'margin-left: 5px; margin-bottom: -60px; padding: 0px; padding-left: 8px; padding-right: 8px;',
    viewSize: 15,
    markChar: '★',
    markOpacity: 0.8,
    zIndex: 10000,
    tipOffsetX: -5,
    tipOffsetY: -45,
    minFont: 14,
    maxFont: 30,
    fontScale: 0.7
  };

  // ボタン定義
  const BUTTONS = [
    { id: 'Fragments_of_Power', icon: 'ri-sword-line',    tip: '力のかけらの位置を表示', type: 'cat', cat: 'power'  },
    { id: 'Raw_Stone',          icon: 'ri-copper-diamond-line',  tip: '原石の位置を表示',       type: 'cat', cat: 'stone'  },
    { id: 'Petals_of_Memory',   icon: 'ri-seedling-line', tip: '記憶の花弁の位置を表示', type: 'cat', cat: 'petals' },
    { id: 'GfreRefresh',        icon: 'ri-restart-line',  tip: 'データを再取得',         type: 'refresh' }
  ];

  // フォント不達時の代替文字とフラグ
  const FALLBACK_ICONS = {
    'ri-sword-line':   '⚔',
    'ri-diamond-line': '◆',
    'ri-seedling-line':'✿',
    'ri-restart-line': '↻'
  };
  let cdnFailed = false;

  // 日付整形
  function formatDate(isoString) {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const mi = String(d.getMinutes()).padStart(2, '0');
      return `${yyyy}年${mm}月${dd}日 ${hh}時${mi}分`;
    } catch { return ''; }
  }

  function ensureTooltipNode() {
    let tip = document.getElementById('gfre-tooltip');
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'gfre-tooltip';
      tip.style.cssText = 'padding:10px;font-size:9pt;background-color:rgba(34,17,17,0.6);position:absolute;top:0;left:0;color:#ffffee;z-index:10001;border-radius:5px;backdrop-filter:blur(3px);pointer-events:none;display:none;';
      document.body.appendChild(tip);
    }
    return tip;
  }
  const tipEl = ensureTooltipNode();
  function showTipFor(el) {
    const text = el.getAttribute('data-gfre-tip');
    if (!text) return;
    tipEl.textContent = text;
    const rect = el.getBoundingClientRect();
    const scrollX = window.pageXOffset;
    const scrollY = window.pageYOffset;
    tipEl.style.left = (scrollX + rect.left + CFG.tipOffsetX) + 'px';
    tipEl.style.top  = (scrollY + rect.top  + CFG.tipOffsetY) + 'px';
    tipEl.style.display = 'block';
  }
  function hideTip() { tipEl.style.display = 'none'; }
  function bindTooltip(el) {
    el.addEventListener('mouseenter', () => showTipFor(el));
    el.addEventListener('mouseleave', hideTip);
  }

  // 簡易トースト
  function toast(msg){
    let t = document.getElementById('gfre-toast');
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

  // 状態
  let cats = { power:[], stone:[], petals:[] };
  let activeCat = null;
  let rafScheduled = false;
  let firstFetchNotified = false;
  let lastUpdatedAt = '';

  const $ = sel => document.querySelector(sel);

  // オーバレイ
  function ensureOverlay() {
    let layer = document.getElementById(CFG.overlayId);
    if (!layer) {
      layer = document.createElement('div');
      layer.id = CFG.overlayId;
      layer.style.cssText = `position:fixed; pointer-events:none; z-index:${CFG.zIndex}; display:none;`;
      document.body.appendChild(layer);
    }
    return layer;
  }
  function getSubContentRect() {
    const sub = $(CFG.subMapSel);
    if (!sub) return null;
    const r = sub.getBoundingClientRect();
    const cs = getComputedStyle(sub);
    const bl = parseFloat(cs.borderLeftWidth)  || 0;
    const br = parseFloat(cs.borderRightWidth) || 0;
    const bt = parseFloat(cs.borderTopWidth)   || 0;
    const bb = parseFloat(cs.borderBottomWidth)|| 0;
    const width  = Math.max(0, Math.round(r.width  - bl - br));
    const height = Math.max(0, Math.round(r.height - bt - bb));
    if (width === 0 || height === 0) return null;
    return { left:Math.round(r.left + bl), top:Math.round(r.top + bt), width, height };
  }
  function getPlayerXY0() {
    const x = Number($(CFG.xSel)?.textContent?.trim());
    const y = Number($(CFG.ySel)?.textContent?.trim());
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x0: x - 1, y0: y - 1 };
  }

  // 描画
  function draw() {
    const layer = ensureOverlay();
    layer.innerHTML = '';
    if (!activeCat) { layer.style.display = 'none'; return; }
    const rect = getSubContentRect();
    const p = getPlayerXY0();
    if (!rect || !p) { layer.style.display = 'none'; return; }
    layer.style.left   = `${rect.left}px`;
    layer.style.top    = `${rect.top}px`;
    layer.style.width  = `${rect.width}px`;
    layer.style.height = `${rect.height}px`;
    layer.style.display = 'block';
    const half = Math.floor(CFG.viewSize / 2);
    const cw = rect.width  / CFG.viewSize;
    const ch = rect.height / CFG.viewSize;
    let marks = 0;
    const list = cats[activeCat] || [];
    for (const pt of list) {
      const x0 = p.x0, y0 = p.y0;
      if (pt.x < x0 - half + 1 || pt.x > x0 + half + 1) continue;
      if (pt.y < y0 - half + 1 || pt.y > y0 + half + 1) continue;
      const dx = (pt.x - 1) - x0;
      const dy = (pt.y - 1) - y0;
      const col = dx + half;
      const row = dy + half;
      if (col < 0 || col >= CFG.viewSize || row < 0 || row >= CFG.viewSize) continue;
      const cx = Math.round((col + 0.5) * cw);
      const cy = Math.round((row + 0.5) * ch);
      const m = document.createElement('div');
      m.textContent = CFG.markChar;
      m.style.cssText = `position:absolute;left:${cx}px;top:${cy}px;transform:translate(-50%,-50%);font-weight:800;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.7);opacity:${CFG.markOpacity};line-height:1;font-size:${Math.max(CFG.minFont, Math.min(CFG.maxFont, Math.round(ch * CFG.fontScale)))}px;`;
      layer.appendChild(m);
      marks++;
    }
    if (marks === 0) { layer.style.display = 'none'; }
  }
  function rafDraw() {
    if (rafScheduled) return;
    rafScheduled = true;
    requestAnimationFrame(() => { rafScheduled = false; draw(); });
  }

  // 監視
  function setupObservers() {
    const sub = $(CFG.subMapSel);
    if (sub) {
      new MutationObserver(() => rafDraw()).observe(sub, { childList:true, subtree:true, characterData:true, attributes:true });
      new ResizeObserver(() => rafDraw()).observe(sub);
    }
    const xEl = $(CFG.xSel), yEl = $(CFG.ySel);
    if (xEl) new MutationObserver(() => rafDraw()).observe(xEl, { childList:true, subtree:true, characterData:true });
    if (yEl) new MutationObserver(() => rafDraw()).observe(yEl, { childList:true, subtree:true, characterData:true });
    document.body.addEventListener('click', e => {
      if (e.target.closest?.('#btn1,#btn2,#btn3,#btn4,#btn5,#btn6,#btn7,#btn8,#btn9')) rafDraw();
    });
    window.addEventListener('resize', rafDraw);
    window.addEventListener('scroll', rafDraw, { passive:true });
  }

  // 取得
  function fetchAll(nocache = false) {
    return new Promise(resolve => {
      const fail = () => {
        cats = { power:[], stone:[], petals:[] };
        if (!firstFetchNotified) { firstFetchNotified = true; toast('データ未取得'); }
        resolve();
      };
      const url = GAS_URL + '?t=' + Date.now() + (nocache ? '&nocache=1' : '');
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        timeout: 15000,
        onload: res => {
          try {
            const json = JSON.parse(res.responseText || '{}');
            if (res.status === 200 && json && json.ok && json.cats) {
              cats = {
                power: Array.isArray(json.cats.power) ? json.cats.power : [],
                stone: Array.isArray(json.cats.stone) ? json.cats.stone : [],
                petals: Array.isArray(json.cats.petals) ? json.cats.petals : []
              };
              lastUpdatedAt = json.updatedAt || '';
            } else { fail(); return; }
          } catch { fail(); return; }
          resolve();
        },
        onerror: fail,
        ontimeout: fail
      });
    });
  }

  // 既存ボタンへ一括フォールバック
  function applyFallbackToExistingButtons() {
    for (const spec of BUTTONS) {
      const el = document.getElementById(spec.id);
      if (!el) continue;
      const i = el.querySelector('i');
      if (!i) continue;
      const ch = FALLBACK_ICONS[spec.icon];
      if (!ch) continue;
      i.className = '';
      i.textContent = ch;
    }
  }

  // UI生成
  function createButton(spec) {
    const div = document.createElement('div');
    div.className = 'queryButton';
    div.id = spec.id;
    div.setAttribute('style', CFG.buttonInlineStyle);
    div.setAttribute('data-gfre-tip', spec.tip);
    const i = document.createElement('i');
    // フォント可用性に応じて切り替え
    if (cdnFailed) {
      const ch = FALLBACK_ICONS[spec.icon];
      if (ch) i.textContent = ch; else i.className = spec.icon;
    } else {
      i.className = spec.icon;
    }
    div.appendChild(i);
    bindTooltip(div);
    // イベントは定義から分岐
    if (spec.type === 'cat') {
      div.addEventListener('click', () => { activeCat = (activeCat === spec.cat) ? null : spec.cat; rafDraw(); });
    } else if (spec.type === 'refresh') {
      div.addEventListener('click', async () => {
        const prev = lastUpdatedAt;
        await fetchAll(true);
        for (const s of BUTTONS) {
          const b = document.getElementById(s.id);
          if (b) b.setAttribute('data-gfre-tip', s.tip + (lastUpdatedAt ? '（最終更新 ' + formatDate(lastUpdatedAt) + '）' : ''));
        }
        toast(lastUpdatedAt ? ('更新: ' + formatDate(lastUpdatedAt)) : (prev ? '更新失敗' : '更新しました'));
        rafDraw();
      });
    }
    return div;
  }
  function addButtonsOnce(anchor) {
    if (!anchor || document.getElementById(BUTTONS[0].id)) return;
    let insertAfter = anchor;
    for (const spec of BUTTONS) {
      const btn = createButton(spec);
      insertAfter.parentNode.insertBefore(btn, insertAfter.nextSibling);
      insertAfter = btn;
    }
  }
  function tryInsertUI() {
    const anchor = document.getElementById('iconmute');
    if (anchor) addButtonsOnce(anchor);
  }

  // 初期化
  async function init() {
    // Remix Icon注入とフォント可用性チェック
    const remixiconUrl = 'https://cdn.jsdelivr.net/npm/remixicon@4.3.0/fonts/remixicon.css';
    if (!document.querySelector('link[rel="stylesheet"][href*="remixicon"]')) {
      const link = document.createElement('link');
      link.href = remixiconUrl;
      link.rel = 'stylesheet';
      link.crossOrigin = 'anonymous';
      link.addEventListener('error', () => {
        cdnFailed = true;
        applyFallbackToExistingButtons();
      });
      link.addEventListener('load', async () => {
        try {
          if (document.fonts && typeof document.fonts.load === 'function') {
            try { await document.fonts.load('1em remixicon'); } catch {}
            const ok = document.fonts.check && document.fonts.check('1em remixicon');
            if (!ok) { cdnFailed = true; applyFallbackToExistingButtons(); }
          } else {
            setTimeout(() => {
              if (!document.querySelector('.ri-restart-line')) { cdnFailed = true; applyFallbackToExistingButtons(); }
            }, 1500);
          }
        } catch {
          cdnFailed = true;
          applyFallbackToExistingButtons();
        }
      });
      document.head.appendChild(link);
    }
    // まずデータを取得して準備完了を待つ
    await fetchAll();

    // ここで初めてボタンを描画
    tryInsertUI();
    new MutationObserver(() => tryInsertUI())
      .observe(document.documentElement, { childList:true, subtree:true });

    // ツールチップに鮮度を反映
    for (const s of BUTTONS) {
      const b = document.getElementById(s.id);
      if (b) b.setAttribute('data-gfre-tip', s.tip + (lastUpdatedAt ? '（最終更新 ' + formatDate(lastUpdatedAt) + '）' : ''));
    }

    setupObservers();
    rafDraw();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once:true });
  } else {
    init();
  }
})();
