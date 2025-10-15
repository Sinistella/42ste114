// ==UserScript==
// @name         GFRe 通信軽量化
// @namespace    gfre.net.opt
// @version      1.3.0
// @description  探索と移動をPOSTだけにし、自動リロードを停止。必要時のみ手動リロード。
// @match        https://soraniwa.428.st/gf/*
// @run-at       document-start
// @grant        none
// ==/UserScript==
(function () {
  "use strict";

  const ABORT_AFTER_HEADERS = false; // 応答ヘッダ到達で中断する場合はtrue（まずはfalseで安定優先）
  const NS = (window.__gfre_patch__ = window.__gfre_patch__ || {});

  // 初期の自動呼出しを無力化しつつ、出現後に原本を退避
  if (typeof window.reloadMap !== "function") window.reloadMap = function(){};
  if (typeof window.reloadPage !== "function") window.reloadPage = function(){};

  function waitForFunction(path, tries = 400, interval = 25) {
    return new Promise((resolve, reject) => {
      const it = setInterval(() => {
        const fn = path.split(".").reduce((o, k) => (o && o[k] != null ? o[k] : undefined), window);
        if (typeof fn === "function") { clearInterval(it); resolve(fn); }
        else if (--tries <= 0) { clearInterval(it); reject(new Error("timeout: " + path)); }
      }, interval);
    });
  }
  function waitFor$ (tries = 400, interval = 25) {
    return new Promise((resolve, reject) => {
      const it = setInterval(() => {
        const $ = window.jQuery || window.$;
        if ($) { clearInterval(it); resolve($); }
        else if (--tries <= 0) { clearInterval(it); reject(new Error("timeout: jquery")); }
      }, interval);
    });
  }

  // 原本退避と恒久無効化
  waitForFunction("reloadMap").then(fn => { if (!NS.originalReload) NS.originalReload = fn; window.reloadMap = function(){}; }).catch(()=>{});
  waitForFunction("reloadPage").then(fn => { if (!NS.originalReloadPage) NS.originalReloadPage = fn; window.reloadPage = function(){}; }).catch(()=>{});

  // 探索POSTのみ送信
  function sendExploreOnly(form) {
    try {
      if (window.reloadrequest) return;
      const at = document.getElementById("actiontype");
      const st = document.getElementById("sendtype");
      if (at) at.value = "1";
      if (st) st.value = "1";
      const fd = new FormData(form);
      if (!fd.has("mode")) fd.append("mode", "keizoku04_post");
      const xhr = new XMLHttpRequest();
      xhr.open("POST", form.action || location.href, true);
      xhr.withCredentials = true;
      xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
      if (ABORT_AFTER_HEADERS) {
        xhr.onreadystatechange = function () { if (xhr.readyState === 2) { try { xhr.abort(); } catch(_) {} } };
      }
      xhr.send(fd);
      if (typeof window.alerttip === "function") window.alerttip("探索をサーバへ送信しました。");
    } catch (_) {}
  }

  // 探索ボタンを確実に横取り（キャプチャ位相＋closest判定で包絡要素にも対応）
  document.addEventListener("click", function(e){
    const t = e.target && e.target.closest && (e.target.closest("#tansaku") || e.target.closest("#btn2"));
    if (!t) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const submitEl = document.getElementById("submit");
    const form = (submitEl && submitEl.form) || document.querySelector("form");
    if (!form) return;
    sendExploreOnly(form);
  }, true);

  // ドキュメント到着後の仕上げ
  waitFor$().then(($) => {
    // リサイズ由来の自動リロード停止
    try {
      $(window).off("resize");
      const _on = $.fn.on;
      $.fn.on = function (type) { if (type === "resize") return this; return _on.apply(this, arguments); };
    } catch(_) {}

    // マップ移動タブ押下の即時リロード抑止（UI切替は維持）
    try {
      $(document).off("click", "#btn1");
      $(document).on("click", "#btn1", function () {
        if (typeof window.btn1 === "function") window.btn1();
        $("#messagebar").text("");
        try { localStorage.battletab = "1"; } catch (_) {}
        return false;
      });
    } catch(_) {}

    // 送信ボタンとsubmitも横取り（二重保険）
    $(document).on("click", "#submit", function (e) {
      try {
        const at = $("#actiontype").val();
        const st = $("#sendtype").val();
        if (at === "1" && st === "1") {
          e.preventDefault();
          e.stopImmediatePropagation();
          const form = $(this).closest("form")[0];
          if (form) sendExploreOnly(form);
          return false;
        }
      } catch (_) {}
    });
    $(document).on("submit", "form", function (e) {
      try {
        const at = $("#actiontype").val();
        const st = $("#sendtype").val();
        if (at === "1" && st === "1") {
          e.preventDefault();
          e.stopImmediatePropagation();
          sendExploreOnly(this);
          return false;
        }
      } catch (_) {}
    });

    // リロードボタンを常時保証して配置
    (function installSelfReloadButtonWatcher(){
      function ensureFallbackHost(){
        let btn = document.getElementById("self_reload");
        if (!btn) {
          btn = document.createElement("div");
          btn.id = "self_reload";
          btn.className = "self_reload queryButton";
          btn.textContent = "リロード";
          Object.assign(btn.style, { position: "fixed", top: "8px", right: "8px", zIndex: "9999" });
          btn.addEventListener("click", function () { if (NS.originalReload) NS.originalReload(); });
          document.body.appendChild(btn);
        }
      }
      function moveNextToTansaku(){
        const anchor = document.getElementById("tansaku");
        const btn = document.getElementById("self_reload");
        if (!anchor || !btn) return;
        if (anchor.parentElement && btn.previousElementSibling !== anchor) {
          anchor.parentElement.insertBefore(btn, anchor.nextSibling);
          btn.style.position = ""; btn.style.top = ""; btn.style.right = ""; btn.style.zIndex = "";
        }
      }
      const mo = new MutationObserver(() => { ensureFallbackHost(); moveNextToTansaku(); });
      function start(){
        ensureFallbackHost();
        moveNextToTansaku();
        mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
      }
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
      else start();
    })();
  }).catch(()=>{});
})();
