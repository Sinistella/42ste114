// ==UserScript==
// @name         北摩のすっきりcontainer_area
// @namespace    https://wdrb.work/
// @version      1.0
// @description  上のステータス画面デカ杉晋作やろ
// @match        https://wdrb.work/otherside/area.php*
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  'use strict';

  /* h2 と status_area 内 h5 を削除 */
  document.querySelectorAll('.container.area > h2, .status_area > h5').forEach(el => el.remove());

  /* serif_comment ブロックを削除 */
  document.querySelectorAll('.status_area.serif_comment').forEach(el => el.remove());

  /* status_box を1個に統合し並び順を HP SP RV LOCATION MYS STATE に調整 */
  document.querySelectorAll('.status_area').forEach(area => {
    const boxes = area.querySelectorAll('.status_box');
    if (boxes.length >= 2) {
      const main   = boxes[0];                      // HP SP RV STATE
      const place  = boxes[1];                      // LOCATION MYS
      const stateP = main.querySelector('p[style*="width:100%"]');
      [...place.children].forEach(node => main.insertBefore(node.cloneNode(true), stateP));
      place.remove();
    }

    /* <small class="gray">HP|SP|RV|LOCATION|AREA MYS</small> と直前の "/" などを削除 */
    area.querySelectorAll('small.gray').forEach(sml => {
      const key = sml.textContent.trim().toUpperCase();
      if (['HP','SP','RV','LOCATION','AREA MYS'].includes(key)) {
        const prev = sml.previousSibling;
        if (prev && prev.nodeType === 3 && prev.textContent.match(/^\s*\/?\s*$/)) prev.remove();
        sml.remove();
      }
    });
  });

  /* レイアウトと幅の調整＋スマホ向け微調整 */
  GM_addStyle(`
    .status_area{
      width:100% !important;
      max-width:1200px !important;
      box-sizing:border-box;
    }
    .status_area .status_box{
      display:flex !important;
      flex-wrap:wrap;
      align-items:center;
      gap:0 20px;
    }
    .status_area .status_box > p.cap{
      flex:0 0 auto;
      margin:0;
    }
    .status_area .status_box > p[style*="width:100%"]{
      flex:1 1 100%;
      margin:4px 0 0;
    }
    /* スマホ幅でアイコンを少し縮小し三列配置に */
    @media (max-width:450px){
      .status_area .status_box .fas{font-size:0.9em;}
      .status_area .status_box > p.cap{flex:1 1 32%;min-width:120px;margin-bottom:4px;}
      .status_area .status_box{gap:0 10px;}
    }
  `);
})();
