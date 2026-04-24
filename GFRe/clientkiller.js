// ==UserScript==
// @name         GFRe 完全通信クライアント化v2
// @namespace    gfre.clientkiller
// @version      2.0.1
// @description  探索も戦闘もPOSTだけ送信し、画面遷移を完全排除。
// @match        https://soraniwa.428.st/gf/*
// @run-at       document-start
// @grant        none
// @updateURL    https://github.com/Sinistella/42ste114/raw/refs/heads/main/GFRe/clientkiller.js
// @downloadURL  https://github.com/Sinistella/42ste114/raw/refs/heads/main/GFRe/clientkiller.js
// ==/UserScript==

(function () {
  "use strict";

  // =====================================================
  // 0. 自動リロード殺し（reloadMap / reloadPage）
  // =====================================================

  const NS = (window.__gfre_patch__ = window.__gfre_patch__ || {});

  if (typeof window.reloadMap !== "function") window.reloadMap = function () {};
  if (typeof window.reloadPage !== "function") window.reloadPage = function () {};

  function waitForFunction(path, tries = 400, interval = 25) {
    return new Promise((resolve, reject) => {
      const it = setInterval(() => {
        const fn = path.split(".").reduce((o, k) => (o && o[k] != null ? o[k] : undefined), window);
        if (typeof fn === "function") {
          clearInterval(it);
          resolve(fn);
        } else if (--tries <= 0) {
          clearInterval(it);
          reject(new Error("timeout: " + path));
        }
      }, interval);
    });
  }

  function waitFor$(tries = 400, interval = 25) {
    return new Promise((resolve, reject) => {
      const it = setInterval(() => {
        const $ = window.jQuery || window.$;
        if ($) {
          clearInterval(it);
          resolve($);
        } else if (--tries <= 0) {
          clearInterval(it);
          reject(new Error("timeout: jquery"));
        }
      }, interval);
    });
  }

  waitForFunction("reloadMap")
    .then((fn) => {
      NS.originalReload = fn;
      window.reloadMap = function () {};
    })
    .catch(() => {});
  waitForFunction("reloadPage")
    .then((fn) => {
      NS.originalReloadPage = fn;
      window.reloadPage = function () {};
    })
    .catch(() => {});

  // =====================================================
  // 1. UI反応制御（送信中UI復活）
  // =====================================================

  function setSubmittingUI(isSubmitting) {
    const submits = document.querySelectorAll("input[type='submit']");

    submits.forEach((btn) => {
      try {
        if (isSubmitting) {
          btn.style.opacity = "0.5";
          btn.value = "送信中…";
          btn.disabled = true;
        } else {
          btn.style.opacity = "";
          btn.value = "行動する";
          btn.disabled = false;
        }
      } catch (_) {}
    });
  }

  // =====================================================
  // 2. POST-only実行（探索・戦闘共通）
  // =====================================================

  function sendAction(form, forceExplore = false) {
    try {
      setSubmittingUI(true);

      const fd = new FormData(form);

      if (forceExplore) {
        fd.set("actiontype", "1");
        fd.set("sendtype", "1");
      }

      if (!fd.has("mode")) fd.append("mode", "keizoku04_post");

      const xhr = new XMLHttpRequest();
      xhr.open("POST", form.action || location.href, true);
      xhr.withCredentials = true;
      xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");

      xhr.onreadystatechange = function () {
        if (xhr.readyState === 2) {
          try {
            xhr.abort();
          } catch (_) {}
          setSubmittingUI(false);
        }
      };

      xhr.send(fd);
      console.log("[GFRe] POST送信完了（画面遷移なし）");
    } catch (err) {
      console.error("[GFRe] POST送信エラー", err);
      setSubmittingUI(false);
    }
  }

  // =====================================================
  // 3. 各種行動ページ（mode=action）専用処理
  // =====================================================

  document.addEventListener("DOMContentLoaded", () => {
    if (!location.search.includes("mode=action")) return;

    waitFor$().then(($) => {
      // ----------------------------------------------
      // ★ 探索する(#tansaku) を完全横取り
      //    → タブ切替(btn2)を禁止
      //    → 探索POSTだけ送る
      // ----------------------------------------------
      document.addEventListener(
        "click",
        function (e) {
          const t = e.target.closest && e.target.closest("#tansaku");
          if (!t) return;

          e.preventDefault();
          e.stopImmediatePropagation();

          const submitEl = document.getElementById("submit");
          const form = submitEl?.form || document.querySelector("form");
          if (!form) return;

          sendAction(form, true);
        },
        true
      );

      // ----------------------------------------------
      // ★ 「行動する」(#submit) を横取り
      //    → 探索中でも戦闘中でも、
      //      画面を遷移させずPOSTのみ送信
      // ----------------------------------------------
      $(document).on("click", "#submit", function (e) {
        e.preventDefault();
        e.stopImmediatePropagation();

        const form = this.form;
        if (!form) return;

        sendAction(form, false);
        return false;
      });

      // ----------------------------------------------
      // ★ form.submit の横取り（ブラウザの通常送信禁止）
      // ----------------------------------------------
      $(document).on("submit", "form", function (e) {
        e.preventDefault();
        e.stopImmediatePropagation();

        sendAction(this, false);
        return false;
      });

      // ----------------------------------------------
      // ★ resize による自動リロード禁止
      // ----------------------------------------------
      try {
        $(window).off("resize");
        const _on = $.fn.on;
        $.fn.on = function (type) {
          if (type === "resize") return this;
          return _on.apply(this, arguments);
        };
      } catch (_) {}
    });
  });
})();
