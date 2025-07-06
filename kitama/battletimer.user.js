// ==UserScript==
// @name         北摩バトルタイマー
// @namespace    https://wdrb.work/
// @version      1.3
// @description  敵のWTと座標、味方のRWTを表示
// @match        https://wdrb.work/otherside/area.php*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // WT算出（従来：60秒固定→今：data-remain基準に可変）
  function getMateRemainWT(actionUnixSec, baseRemain) {
    const nowSec = Math.floor(Date.now() / 1000);
    const diff = nowSec - actionUnixSec;
    return Math.max(0, baseRemain - diff);
  }

  // ページ初期化情報
  const PAGE_INIT_TIME = Math.floor(Date.now() / 1000);
  let baseRemain = 60;
  const timeRemainElem = document.getElementById('time_remain');
  if (timeRemainElem) {
    baseRemain = parseInt(timeRemainElem.getAttribute('data-remain'), 10);
  }

  // セーフエリア判定
  const enemyList = document.querySelector('ul.area_charalist.enemy');
  if (!enemyList || !enemyList.querySelector('li')) {
    return;
  }

  // 自キャラeno取得
  function getSelfEno() {
    const banner = document.querySelector('.charaBanner.cap[data-tippy-content*="あなたです"] a[href*="profile.php?eno="]');
    if (!banner) return null;
    const match = banner.href.match(/eno=(\d+)/);
    return match ? match[1] : null;
  }

  // ENEMY HUD描画
  function drawEnemyHUD() {
    document.querySelectorAll('.kaiki_skill_timer_in_hpbar,.kaiki_coord_label').forEach(e => e.remove());
    document.querySelectorAll('.map_chara.enemy.common').forEach(chara => {
      if (chara.classList.contains('defeated')) return;
      if ((chara.getAttribute('data-bt_state') || '').includes('行動不能')) return;

      const hpBar = chara.querySelector('.hp_guege');
      if (!hpBar) return;
      chara.style.position = 'relative';

      const nextAt = Number(chara.getAttribute('data-next_at') || '0');
      const rawSkill = chara.getAttribute('data-skill_name') || '';
      const dispSkill = rawSkill.slice(0, 4);

      const timer = document.createElement('div');
      timer.className = 'kaiki_skill_timer_in_hpbar';
      timer.innerHTML = `${nextAt}＞<br>${dispSkill}`;
      timer.style.cssText = `
        position:absolute; left:50%; transform:translateX(-50%);
        top:-32px; font-size:11px; line-height:12px;
        font-weight:bold; color:#fff200;
        text-shadow:1px 1px 2px #222,0 0 8px #000;
        pointer-events:none; user-select:none; white-space:pre; z-index:99;
      `;
      chara.insertBefore(timer, hpBar);

      const chip = chara.closest('.map_chip');
      if (!chip) return;
      const xValue = chip.getAttribute('data-x') ?? '?';
      const coord = document.createElement('div');
      coord.className = 'kaiki_coord_label';
      coord.textContent = xValue;
      coord.style.cssText = `
        position:absolute; left:50%; transform:translateX(-50%);
        bottom:-28px; font-size:16px;
        font-weight:bold; color:#fff200;
        text-shadow:1px 1px 2px #000;
        pointer-events:none; user-select:none; white-space:nowrap; z-index:98;
      `;
      chara.appendChild(coord);
    });
  }

  // WT/RWTタイマー描画
  function drawPlayerTimers() {
    let selfEno = String(getSelfEno());

    // 【変更点】行動ログだけを抽出
    let enoTimeMap = {};
    document.querySelectorAll('.system.bt-log.following, .system.bt-log.outer').forEach(div => {
      let enoA = div.querySelector('a[href^="profile.php?eno="]');
      let timeS = div.querySelector('.chat_time');
      if (!enoA || !timeS) return;
      let eno = (enoA.href.match(/eno=(\d+)/)||[])[1];
      let chatTimeStr = timeS.textContent.trim();
      if (!eno || !chatTimeStr) return;
      let chatTime = Math.floor(new Date(chatTimeStr.replace(/-/g, '/')).getTime() / 1000);
      if (!enoTimeMap[eno] || chatTime > enoTimeMap[eno]) {
        enoTimeMap[eno] = chatTime;
      }
    });

    // フィールド側タイマー
    document.querySelectorAll('.move_box .map_chara[data-eno]:not(.enemy), .modal .map_chara[data-eno]:not(.enemy)').forEach(charaDiv => {
      let eno = String(charaDiv.getAttribute('data-eno')).trim();

      // 既存タイマー削除
      let timerDiv = charaDiv.querySelector('.kaiki_action_timer');
      if (timerDiv) timerDiv.remove();

      let remain, display, color;
      if (eno === selfEno) {
        // 自キャラ：公式値完全同期
        if (typeof baseRemain === 'number' && !isNaN(baseRemain)) {
          let nowSec = Math.floor(Date.now() / 1000);
          remain = Math.max(0, baseRemain - (nowSec - PAGE_INIT_TIME));
        } else {
          remain = '?';
        }
        // 表示ルールは従来通り
        if (remain === '?' || remain <= 0 || remain >= 60) {
          display = 'R';
          color = '#fff';
        } else if (remain > 9) {
          display = 'W';
          color = '#fff';
        } else if (remain > 0) {
          display = remain;
          color = '#fff200';
        }
      } else {
        // 味方キャラ
        if (enoTimeMap[eno]) {
          remain = getMateRemainWT(enoTimeMap[eno], baseRemain);
          if (remain === '?' || remain <= 0 || remain >= 60) {
            display = 'R';
            color = '#fff';
          } else if (remain > 9) {
            display = 'W';
            color = '#fff';
          } else if (remain > 0) {
            display = remain;
            color = '#fff200';
          }
        } else {
          // 発言履歴がなければ「?」で黄緑色
          display = '?';
          color = '#b8d200';
        }
      }

      let d = document.createElement('div');
      d.className = 'kaiki_action_timer';
      d.style.fontSize = '16px';
      d.style.fontWeight = 'bold';
      d.style.position = 'absolute';
      d.style.left = '50%';
      d.style.transform = 'translateX(-50%)';
      d.style.pointerEvents = 'none';
      d.style.userSelect = 'none';
      d.style.whiteSpace = 'nowrap';
      d.style.lineHeight = '1.1';
      d.style.color = color;
      d.style.textShadow = '1px 1px 2px #222, 0 0 6px #000';
      d.style.bottom = (display === 'R' ? '-64px' : '-48px');

      d.textContent = display;
      charaDiv.appendChild(d);
    });

    // キャラリスト側タイマー
    document.querySelectorAll('ul.area_charalist li').forEach(li => {
      let link = li.querySelector('a[href^="profile.php?eno="]');
      if (!link) return;
      let eno = String((link.href.match(/eno=(\d+)/)||[])[1]);
      if (!eno) return;

      let timerSpan = li.querySelector('.kaiki_charalist_timer');
      if (timerSpan) timerSpan.remove();

      let remain, display, color;
      if (eno === selfEno) {
        if (typeof baseRemain === 'number' && !isNaN(baseRemain)) {
          let nowSec = Math.floor(Date.now() / 1000);
          remain = Math.max(0, baseRemain - (nowSec - PAGE_INIT_TIME));
        } else {
          remain = '?';
        }
        if (remain === '?' || remain <= 0 || remain >= 60) {
          display = 'R';
          color = '#fff';
        } else if (remain > 9) {
          display = 'W';
          color = '#fff';
        } else if (remain > 0) {
          display = remain;
          color = '#fff200';
        }
      } else {
        if (enoTimeMap[eno]) {
          remain = getMateRemainWT(enoTimeMap[eno], baseRemain);
          if (remain === '?' || remain <= 0 || remain >= 60) {
            display = 'R';
            color = '#fff';
          } else {
            display = remain;
            color = '#fff200';
          }
        } else {
          display = '?';
          color = '#b8d200';
        }
      }

      let nameB = li.querySelector('p.small b');
      if (nameB) {
        let span = document.createElement('span');
        span.className = 'kaiki_charalist_timer';
        span.style.marginLeft = '0.5em';
        span.style.fontSize = '12px';
        span.style.fontWeight = 'bold';
        span.style.color = color;
        span.style.textShadow = '1px 1px 2px #222,0 0 6px #000';
        span.textContent = display;
        nameB.after(span);
      }
    });
  }

  // 各要素のoverflowをvisibleに
  function ensureOverflowVisible () {
    ['.map_chara','.map_chip','.areamap','.map_area','.move_box'].forEach(sel =>
      document.querySelectorAll(sel).forEach(el =>
        el.style.setProperty('overflow','visible','important')
      )
    );
  }

  // 全体リフレッシュ
  function refresh() {
    ensureOverflowVisible();
    drawEnemyHUD();
    drawPlayerTimers();
  }

  // 起動時
  refresh();

  // メインタイマー管理
  let mainTimer = null;
  function startMainTimer() {
    if (!mainTimer) {
      mainTimer = setInterval(refresh, 1000);
    }
  }
  function stopMainTimer() {
    if (mainTimer) {
      clearInterval(mainTimer);
      mainTimer = null;
    }
  }
  startMainTimer();

  // area_bg, bodyを監視
  const area = document.querySelector('.area_bg') || document.body;
  new MutationObserver(refresh).observe(area, {
    childList: true, subtree: true, attributes: true,
    attributeFilter: ['data-next_at', 'data-skill_name', 'class']
  });

  // モーダル監視
  let modalTimer = null;
  function startModalTimer() {
    if (!modalTimer) {
      modalTimer = setInterval(refresh, 1000);
    }
  }
  function stopModalTimer() {
    if (modalTimer) {
      clearInterval(modalTimer);
      modalTimer = null;
    }
  }
  function observeModal() {
    const modal = document.getElementById('targetModal');
    if (!modal) return;
    const obs = new MutationObserver(() => {
      if (modal.style.display === 'block') {
        startModalTimer();
      } else {
        stopModalTimer();
      }
    });
    obs.observe(modal, { attributes: true, attributeFilter: ['style'] });
  }
  observeModal();

})();
