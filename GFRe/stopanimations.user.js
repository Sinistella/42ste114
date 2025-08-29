// ==UserScript==
// @name         GFRe Stop Animations
// @namespace    gfre.stop.movie
// @version      2.0.0
// @description  アニメーション効果停止
// @match        https://soraniwa.428.st/gf/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @connect      *
// @require      https://github.com/Sinistella/42ste114/raw/refs/heads/main/GFRe/stopper-core.js
// ==/UserScript==
(function(){
  "use strict";
  function boot(){
    if (!window.GFReStopper){ return setTimeout(boot, 20); }
    window.GFReStopper.install({ log: false, maxConcurrent: 6 });
  }
  boot();
})();
