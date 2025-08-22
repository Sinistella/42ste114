// ==UserScript==
// @name         GFRe No Escape
// @namespace    gfre.no.escape
// @match        https://soraniwa.428.st/gf/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const SEL = {
    encRoot: '#encount',
    mapdesc: '.mapdesc'
  };
  const MSG_HTML = '<br><small class="csred">★　現在移動禁止中　★<br>逃走ペナルティ: 調子-15</small>';
  const DATA_ORIG = 'tmOrigHtml';
  let locked = false;
  let raf = 0;

  function q(s, r = document) { return r.querySelector(s); }
  function qa(s, r = document) { return Array.from(r.querySelectorAll(s)); }
  function norm(t) { return (t || '').replace(/\s+/g, '').trim(); }

  function isEncounterActive() {
    const enc = q(SEL.encRoot);
    return !!enc && !!enc.querySelector('.encounterarea');
  }

  // 監視範囲
  function findMoveRowCell() {
    const root = q(SEL.mapdesc);
    if (!root) return null;
    const rows = qa('.labelb', root);
    for (const row of rows) {
      const head = row.querySelector('.labelbleft');
      if (head && norm(head.textContent) === '移動') {
        const cell = row.querySelector('.labelbright.labelbrightcell2');
        if (cell) return cell;
      }
    }
    return null;
  }

  function applyMoveHidden(hide) {
    const cell = findMoveRowCell();
    if (!cell) return;
    if (hide) {
      if (!cell.dataset[DATA_ORIG]) cell.dataset[DATA_ORIG] = cell.innerHTML;
      cell.innerHTML = MSG_HTML;
    } else {
      if (cell.dataset[DATA_ORIG]) {
        cell.innerHTML = cell.dataset[DATA_ORIG];
        delete cell.dataset[DATA_ORIG];
      }
    }
  }

  // 保険
  function evGuard(e) {
    if (!locked) return;
    const t = e.target;
    if (!t) return;
    if (t.closest?.('#moveUp,#moveLeft,#moveDown,#moveRight')) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  }
  function bindGuards(on) {
    const types = ['click', 'pointerdown', 'mousedown', 'touchstart'];
    types.forEach(tp => {
      const fn = on ? 'addEventListener' : 'removeEventListener';
      document[fn](tp, evGuard, true);
    });
  }

  // rAFデバウンスで状態反映
  function scheduleUpdate() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const now = isEncounterActive();
      if (now !== locked) {
        locked = now;
        applyMoveHidden(locked);
        bindGuards(locked);
      } else if (locked) {
        // 行が描き直されても維持
        applyMoveHidden(true);
      }
    });
  }

  function observe() {
    const enc = q(SEL.encRoot);
    if (!enc) return;
    new MutationObserver(() => scheduleUpdate())
      .observe(enc, { childList: true, subtree: true, characterData: true, attributes: false });
  }

  function init() {
    scheduleUpdate();
    observe();
    setInterval(() => { if (locked) scheduleUpdate(); }, 1000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
