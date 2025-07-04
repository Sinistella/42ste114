// ==UserScript==
// @name         北摩戦闘エリアタイマー
// @namespace    https://wdrb.work/
// @version      1.1
// @description  敵のWTと座標、味方のRWTを表示
// @match        https://wdrb.work/otherside/area.php*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // セーフエリアではタイマー非表示
  const enemyList = document.querySelector('ul.area_charalist.enemy');
  if (!enemyList || !enemyList.querySelector('li')) {
    return;
  }

  // バナーから自キャラenoを取得
  function getSelfEno() {
    const banner = document.querySelector('.charaBanner.cap[data-tippy-content*="あなたです"] a[href*="profile.php?eno="]');
    if (!banner) return null;
    const match = banner.href.match(/eno=(\d+)/);
    return match ? match[1] : null;
  }

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

  function drawPlayerTimers() {
    let selfEno = getSelfEno();

    let enoTimeMap = {};
    document.querySelectorAll('.chat_shout').forEach(div => {
      let enoA = div.querySelector('a[href^="profile.php?eno="]');
      let timeS = div.querySelector('.chat_time');
      if (!enoA || !timeS) return;
      let eno = (enoA.href.match(/eno=(\d+)/)||[])[1];
      let chatTimeStr = timeS.textContent.trim();
      if (!eno || !chatTimeStr) return;
      let chatTime = new Date(chatTimeStr.replace(/-/g, '/')).getTime();
      if (!enoTimeMap[eno] || chatTime > enoTimeMap[eno]) {
        enoTimeMap[eno] = chatTime;
      }
    });

    let now = Date.now();
    document.querySelectorAll('.move_box .map_chara[data-eno]:not(.enemy)').forEach(charaDiv => {
      let eno = charaDiv.getAttribute('data-eno');
      if (eno === selfEno) return;  // 自キャラのタイマー非表示でいいよね？

      let timerDiv = charaDiv.querySelector('.kaiki_action_timer');
      if (timerDiv) timerDiv.remove();

      let display = 'R';
      if (enoTimeMap[eno]) {
        let sec = Math.floor((now - enoTimeMap[eno]) / 1000);
        display = (sec < 60) ? (60 - sec) : 'R';
      }

      let d = document.createElement('div');
      d.className = 'kaiki_action_timer';
      d.style.fontSize = '16px';
      d.style.fontWeight = 'bold';
      d.style.color = '#fff';
      d.style.position = 'absolute';
      d.style.left = '50%';
      d.style.transform = 'translateX(-50%)';
      d.style.pointerEvents = 'none';
      d.style.userSelect = 'none';
      d.style.whiteSpace = 'nowrap';
      d.style.lineHeight = '1.1';
      d.style.textShadow = '1px 1px 2px #000';

      if (display === 'R') {
        d.innerHTML = 'R';
        d.style.bottom = '-64px';
      } else {
        d.textContent = display;
        d.style.bottom = '-48px';
      }
      charaDiv.appendChild(d);
    });
  }

  function ensureOverflowVisible () {
    ['.map_chara','.map_chip','.areamap','.map_area','.move_box'].forEach(sel =>
      document.querySelectorAll(sel).forEach(el =>
        el.style.setProperty('overflow','visible','important')
      )
    );
  }

  function refresh() {
    ensureOverflowVisible();
    drawEnemyHUD();
    drawPlayerTimers();
  }

  refresh();
  const area=document.querySelector('.area_bg')||document.body;
  new MutationObserver(refresh).observe(area,{
    childList:true, subtree:true, attributes:true,
    attributeFilter:['data-next_at','data-skill_name','class']
  });
  setInterval(refresh,1000);
})();
