// ==UserScript==
// @name         GFRe Map Guide
// @namespace    https://github.com/Sinistella/42ste114
// @version      0.2.0
// @description  マップの座標を表示し、対象セルを赤枠で強調
// @match        https://soraniwa.428.st/gf/*
// ==/UserScript==

(function () {
  'use strict';

  const CONFIG = {
    MAP_AREA_SELECTOR: '#maparea_sub',
    CURRENT_X_SELECTOR: '#map_x',
    CURRENT_Y_SELECTOR: '#map_y',
    GRID_CONTAINER_SELECTOR: '.strollmaparea_close, .strollmaparea_full, .strollmaparea, .layout',
    TILE_SIZE: 35,               // 1マスは35pxで確定
    TIP_OFFSET_X: 6,             // カーソル直下寄せ
    TIP_OFFSET_Y: 10,
    HILITE_BORDER: '2px solid #ff3333',
    HILITE_BOXSHADOW: '0 0 0 2px rgba(255,255,255,0.5) inset',
    HILITE_FILL_ALPHA: 0.08,
    CURSOR_CACHE_MS: 1000        // 現在地テキストが一瞬消える対策
  };

  // 座標ツールチップ
  const tip = document.createElement('div');
  Object.assign(tip.style, {
    position: 'fixed', zIndex: '99999', pointerEvents: 'none',
    background: '#221111cc', color: '#ffffee', fontSize: '12px',
    padding: '2px 6px', borderRadius: '4px', lineHeight: '1.4',
    display: 'none', whiteSpace: 'nowrap'
  });
  document.documentElement.appendChild(tip);

  // セル強調
  const hilite = document.createElement('div');
  Object.assign(hilite.style, {
    position: 'fixed', zIndex: '99998', pointerEvents: 'none',
    border: CONFIG.HILITE_BORDER, boxSizing: 'border-box',
    background: `rgba(255,0,0,${CONFIG.HILITE_FILL_ALPHA})`,
    boxShadow: CONFIG.HILITE_BOXSHADOW, display: 'none'
  });
  document.documentElement.appendChild(hilite);

  const $ = (sel, root = document) => root.querySelector(sel);

  let gridInfo = null; // {innerLeft, innerTop, innerWidth, innerHeight, cols, rows, selfCol, selfRow}
  let lastCur = null;
  let lastCurAt = 0;

  function now() { return Date.now(); }

  function getCurrentPos() {
    const xNode = $(CONFIG.CURRENT_X_SELECTOR);
    const yNode = $(CONFIG.CURRENT_Y_SELECTOR);
    if (xNode && yNode) {
      const x = Number(xNode.textContent.trim());
      const y = Number(yNode.textContent.trim());
      if (Number.isFinite(x) && Number.isFinite(y)) {
        lastCur = { x, y }; lastCurAt = now();
        return lastCur;
      }
    }
    if (lastCur && now() - lastCurAt <= CONFIG.CURSOR_CACHE_MS) return lastCur;
    const label = document.querySelector('.labelbright.labelbrightcell2');
    if (label) {
      const m = label.textContent.match(/x:\s*(\d+)\s*,\s*y:\s*(\d+)/i);
      if (m) {
        const pos = { x: Number(m[1]), y: Number(m[2]) };
        lastCur = pos; lastCurAt = now();
        return pos;
      }
    }
    return null;
  }

  function getInnerBox(container) {
    const r = container.getBoundingClientRect();
    const cs = getComputedStyle(container);
    const paddL = parseFloat(cs.paddingLeft) || 0;
    const paddT = parseFloat(cs.paddingTop) || 0;
    const paddR = parseFloat(cs.paddingRight) || 0;
    const paddB = parseFloat(cs.paddingBottom) || 0;
    const bordL = parseFloat(cs.borderLeftWidth) || 0;
    const bordT = parseFloat(cs.borderTopWidth) || 0;
    const bordR = parseFloat(cs.borderRightWidth) || 0;
    const bordB = parseFloat(cs.borderBottomWidth) || 0;
    const innerLeft = r.left + bordL + paddL;
    const innerTop = r.top + bordT + paddT;
    const innerWidth = r.width - (bordL + bordR + paddL + paddR);
    const innerHeight = r.height - (bordT + bordB + paddT + paddB);
    return { innerLeft, innerTop, innerWidth, innerHeight };
  }

  function pickGridContainer() {
    const mapArea = $(CONFIG.MAP_AREA_SELECTOR);
    if (!mapArea) return null;
    return $(CONFIG.GRID_CONTAINER_SELECTOR, mapArea) || mapArea;
  }

  function rebuildGridInfo() {
    const cont = pickGridContainer();
    if (!cont) { gridInfo = null; return; }
    const box = getInnerBox(cont);
    const cols = Math.max(1, Math.floor(box.innerWidth / CONFIG.TILE_SIZE));
    const rows = Math.max(1, Math.floor(box.innerHeight / CONFIG.TILE_SIZE));
    const selfCol = Math.floor(cols / 2);
    const selfRow = Math.floor(rows / 2);
    gridInfo = { ...box, cols, rows, selfCol, selfRow };
  }

  function hideAll() {
    tip.style.display = 'none';
    hilite.style.display = 'none';
  }

  function updateTipText(x, y) {
    tip.textContent = `x:${x}, y:${y}`;
  }

  function showTipAt(cx, cy) {
    tip.style.left = `${Math.round(cx + CONFIG.TIP_OFFSET_X)}px`;
    tip.style.top = `${Math.round(cy + CONFIG.TIP_OFFSET_Y)}px`;
    if (tip.style.display !== 'block') tip.style.display = 'block';
  }

  function showHiliteCell(left, top, w, h) {
    hilite.style.left = `${Math.round(left)}px`;
    hilite.style.top = `${Math.round(top)}px`;
    hilite.style.width = `${Math.round(w)}px`;
    hilite.style.height = `${Math.round(h)}px`;
    if (hilite.style.display !== 'block') hilite.style.display = 'block';
  }

  function handleMove(ev) {
    if (!gridInfo) return hideAll();
    const cur = getCurrentPos();
    if (!cur) return hideAll();

    const { innerLeft, innerTop, cols, rows } = gridInfo;
    const ts = CONFIG.TILE_SIZE;

    const gx = Math.floor((ev.clientX - innerLeft) / ts);
    const gy = Math.floor((ev.clientY - innerTop) / ts);

    // 端の境界で消えないようにクランプ
    const gxc = Math.min(Math.max(gx, 0), cols - 1);
    const gyc = Math.min(Math.max(gy, 0), rows - 1);

    const dx = gxc - gridInfo.selfCol;
    const dy = gyc - gridInfo.selfRow;
    const absX = cur.x + dx;
    const absY = cur.y + dy;

    updateTipText(absX, absY);
    showTipAt(ev.clientX, ev.clientY);

    const cellLeft = innerLeft + gxc * ts;
    const cellTop = innerTop + gyc * ts;
    showHiliteCell(cellLeft, cellTop, ts, ts);
  }

  function handleEnter() { rebuildGridInfo(); }
  function handleLeave() { hideAll(); }

  function bindMouse() {
    const mapArea = $(CONFIG.MAP_AREA_SELECTOR);
    if (!mapArea) return;
    mapArea.removeEventListener('mousemove', handleMove, true);
    mapArea.removeEventListener('mouseleave', handleLeave, true);
    mapArea.removeEventListener('mouseenter', handleEnter, true);
    mapArea.addEventListener('mousemove', handleMove, true);
    mapArea.addEventListener('mouseleave', handleLeave, true);
    mapArea.addEventListener('mouseenter', handleEnter, true);
  }

  function setupObservers() {
    const subObserver = new MutationObserver(() => { rebuildGridInfo(); });
    const attachSubObserver = () => {
      const mapArea = $(CONFIG.MAP_AREA_SELECTOR);
      if (!mapArea) return;
      try { subObserver.disconnect(); } catch {}
      subObserver.observe(mapArea, { childList: true, subtree: true });
    };
    const rootObserver = new MutationObserver(() => {
      const mapArea = $(CONFIG.MAP_AREA_SELECTOR);
      if (!mapArea) return;
      bindMouse();
      rebuildGridInfo();
      attachSubObserver();
    });
    rootObserver.observe(document.body, { childList: true, subtree: true });
    if ($(CONFIG.MAP_AREA_SELECTOR)) {
      bindMouse();
      rebuildGridInfo();
      attachSubObserver();
    }
  }

  // レイアウト変化での原点ズレ対策
  window.addEventListener('resize', rebuildGridInfo);
  window.addEventListener('scroll', rebuildGridInfo, true);

  setupObservers();
})();
