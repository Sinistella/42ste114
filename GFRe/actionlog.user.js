// ==UserScript==
// @name         GFRe 行動ログ
// @namespace    gfre.actionlog
// @version      1.0.0
// @description  アイコン画像クリックで行動ログをポップアップ
// @match        https://soraniwa.428.st/gf/result/*
// @grant        none
// ==/UserScript==
(function () {
  "use strict";

  // ========= 共通ユーティリティ =========
  function normalizeName(name) {
    if (!name) return "";
    return name.replace(/\s+/g, "").normalize("NFKC");
  }

  function extractSkillNameFromB(b) {
    if (!b) return null;

    let sib = b.nextSibling;
    let steps = 0;
    while (sib && steps < 6) {
      if (sib.nodeType === Node.ELEMENT_NODE) {
        const t = sib.textContent || "";
        if (t.includes(">>")) {
          let after = t.split(">>")[1];
          if (after) {
            after = after.replace(/\(.+?\)/g, "");
            after = after.replace(/[ 　]+$/g, "");
            after = after.trim();
            if (after) return after;
          }
        }
      }
      sib = sib.nextSibling;
      steps++;
    }

    let base = b.textContent || "";
    base = base.replace(/！+$/g, "").trim();
    return base || null;
  }

  function parseAllActions() {
    const root = document.querySelector("div.battlemain");

    /** actions[normName] = { turns: { [turn:number]: string[] } } */
    const actions = {};
    let currentTurn = null;

    function ensureActor(normName) {
      if (!normName) return null;
      if (!actions[normName]) {
        actions[normName] = { turns: {} };
      }
      return actions[normName];
    }

    function addAction(rawName, skillName) {
      if (!rawName || !skillName) return;
      const norm = normalizeName(rawName);
      if (!norm) return;
      const actor = ensureActor(norm);
      if (!actor) return;
      const t = currentTurn || 1;
      if (!actor.turns[t]) actor.turns[t] = [];
      actor.turns[t].push(skillName);
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null);

    while (walker.nextNode()) {
      const el = /** @type {HTMLElement} */ (walker.currentNode);
      const cls = el.classList;
      const text = el.textContent || "";

      if (cls.contains("talkarea")) {
        const m = text.match(/-Turn\s+(\d+)\s*-/);
        if (m) {
          const tnum = parseInt(m[1], 10);
          if (!Number.isNaN(tnum)) currentTurn = tnum;
        }
        continue;
      }

      if ((cls.contains("markerA") || cls.contains("markerB")) && text.includes("の行動！")) {
        if (text.includes("先行行動") || text.includes("反撃行動")) continue;

        const mh = text.match(/▼(.+?) の行動！/);
        if (!mh) continue;
        const actorName = mh[1].trim();
        if (!actorName) continue;

        let node = el.nextSibling;
        let chosenSkill = null;
        let blockText = "";

        while (node) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const ne = /** @type {HTMLElement} */ (node);
            const ncls = ne.classList;

            if (ncls.contains("markerA") || ncls.contains("markerB")) break;

            if (ncls.contains("talkarea")) {
              const ttxt = ne.textContent || "";
              if (/-Turn\s+\d+\s*-/.test(ttxt)) break;
            }

            blockText += ne.textContent || "";

            if (!chosenSkill) {
              const candidates = [];
              if (ne.matches && ne.matches("b.tskill.skill")) {
                candidates.push(ne);
              }
              if (ne.querySelectorAll) {
                ne.querySelectorAll("b.tskill").forEach((bb) => {
                  candidates.push(bb);
                });
              }

              const seen = new Set();
              for (const bb of candidates) {
                if (seen.has(bb)) continue;
                seen.add(bb);
                const name = extractSkillNameFromB(bb);
                if (name) {
                  chosenSkill = name;
                  break;
                }
              }
            }
          }
          node = node.nextSibling;
        }

        if (!chosenSkill) {
          if (blockText.includes("体がしびれている") && blockText.includes("連続行動がキャンセル")) {
            chosenSkill = "麻痺";
          }
        }

        if (chosenSkill) {
          addAction(actorName, chosenSkill);
        }

        continue;
      }
    }

    return actions;
  }

  // ========= ポップアップ描画 =========
  function showPopup(displayName, actorInfo) {
    const overlayId = "soraniwa-action-popup-overlay";
    let overlay = document.getElementById(overlayId);
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = overlayId;
      Object.assign(overlay.style, {
        position: "fixed",
        inset: "0",
        background: "rgba(0,0,0,0.4)",
        zIndex: "9999",
        display: "none"
      });
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) overlay.style.display = "none";
      });
      document.body.appendChild(overlay);
    }

    let box = document.getElementById("soraniwa-action-popup-box");
    if (!box) {
      box = document.createElement("div");
      box.id = "soraniwa-action-popup-box";
      Object.assign(box.style, {
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: "auto",
        background: "#fffdf5",
        border: "1px solid #aa8855",
        borderRadius: "6px",
        padding: "12px",
        minWidth: "320px",
        maxWidth: "1000px",
        fontSize: "10pt",
        boxShadow: "0 3px 9px rgba(0,0,0,0.35)"
      });
      overlay.appendChild(box);
    }

    box.innerHTML = "";

    const content = document.createElement("div");
    content.id = "soraniwa-action-popup-content";
    Object.assign(content.style, {
      marginTop: "8px",
      maxHeight: "70vh",
      overflow: "auto",
      paddingBottom: "8px"
    });

    const close = document.createElement("div");
    close.textContent = "×";
    Object.assign(close.style, {
      position: "absolute",
      top: "4px",
      right: "8px",
      cursor: "pointer",
      fontWeight: "bold",
      fontSize: "14px"
    });
    close.onclick = () => {
      overlay.style.display = "none";
    };

    const title = document.createElement("div");
    title.textContent = (displayName || "不明なキャラ") + " の行動一覧";
    Object.assign(title.style, {
      fontWeight: "bold",
      textAlign: "center",
      marginBottom: "10px",
      fontSize: "11pt"
    });

    box.appendChild(close);
    box.appendChild(title);
    box.appendChild(content);

    const turns = actorInfo
      ? Object.keys(actorInfo.turns)
          .map((v) => parseInt(v, 10))
          .filter((v) => !Number.isNaN(v))
          .sort((a, b) => a - b)
      : [];

    if (!actorInfo || turns.length === 0) {
      const msg = document.createElement("div");
      msg.textContent = "行動ログが見つかりません。";
      Object.assign(msg.style, { textAlign: "center", marginTop: "10px" });
      content.appendChild(msg);
    } else {
      const table = document.createElement("table");
      table.style.borderCollapse = "collapse";
      table.style.width = "auto";
      table.style.marginBottom = "4px";

      const maxRows = turns.reduce((m, t) => {
        const len = actorInfo.turns[t]?.length || 0;
        return len > m ? len : m;
      }, 0);

      // ヘッダ
      const trHead = document.createElement("tr");
      for (const t of turns) {
        const th = document.createElement("th");
        th.textContent = t + "ターン目";
        Object.assign(th.style, {
          border: "1px solid #ccaa77",
          padding: "3px 6px",
          textAlign: "center",
          background: "#f2e4c8",
          whiteSpace: "nowrap"
        });
        trHead.appendChild(th);
      }
      table.appendChild(trHead);

      for (let row = 0; row < maxRows; row++) {
        const tr = document.createElement("tr");
        for (const t of turns) {
          const td = document.createElement("td");
          const arr = actorInfo.turns[t] || [];
          td.textContent = arr[row] ?? "-";
          Object.assign(td.style, {
            border: "1px solid #ddc090",
            padding: "3px 6px",
            background: row % 2 === 0 ? "#fffff0" : "#f7ffea",
            whiteSpace: "nowrap"
          });
          tr.appendChild(td);
        }
        table.appendChild(tr);
      }

      content.appendChild(table);
      // 列幅を最も長いセルの幅に揃える
      requestAnimationFrame(() => {
        const rows = table.rows;
        if (!rows.length) return;
        const colCount = rows[0].cells.length || 0;
        if (!colCount) return;

        table.style.tableLayout = "auto";

        let max = 0;
        for (const row of rows) {
          for (const cell of row.cells) {
            const w = cell.getBoundingClientRect().width;
            if (w > max) max = w;
          }
        }
        if (!max) return;

        table.style.tableLayout = "fixed";
        table.style.width = (max * colCount) + "px";
      });
    }

    overlay.style.display = "block";
  }

  function setupNameJumpAndTurnHeader(battlemain) {
    if (!battlemain) return;

    const statusTable = battlemain.querySelector("table");
    if (statusTable) {
      const nameLinks = statusTable.querySelectorAll("a[href*='eno=']");
      nameLinks.forEach((a) => {
        const href = a.getAttribute("href") || "";
        const m = href.match(/eno=(\d+)/);
        if (!m) return;
        const eno = m[1];
        const anchorId = "s_" + eno + "_0";
        const anchorEl = document.getElementById(anchorId);
        if (anchorEl) {
          a.setAttribute("href", "#" + anchorId);
        }
      });
    }

    if (!document.getElementById("s_turn1")) {
      const firstScrolldata = battlemain.querySelector("span.scrolldata");
      if (firstScrolldata) {
        const wrapper = document.createElement("div");
        wrapper.innerHTML =
          '<div class="talkarea" style="text-align:center;background-color: #ffffff33;">' +
          '<b style="color: #eebb99; font-size: 16pt;font-style: italic;">' +
          '<span><small style="font-weight:thin; font-size: 50%;">▲前のターン</small></span>' +
          "　　　-Turn 1-　　　" +
          '<span id="s_turn1"><a href="#s_turn2"><small style="font-weight:thin; font-size: 50%;">次のターン▼</small></a></span>' +
          "</b></div>";
        const headerDiv = wrapper.firstElementChild;
        if (headerDiv && firstScrolldata.parentNode) {
          firstScrolldata.parentNode.insertBefore(headerDiv, firstScrolldata);
        }
      }
    }
  }

  function setupIconBindings(actions, battlemain) {
    if (!battlemain) return;

    const statusTable = battlemain.querySelector("table");
    if (!statusTable) return;

    const bindings = [];

    const charBlocks = statusTable.querySelectorAll("div[style*='display: table']");
    charBlocks.forEach((block) => {
      const cells = block.querySelectorAll("div[style*='table-cell']");
      if (cells.length < 2) return;

      const iconImg = cells[0].querySelector("img");
      if (!iconImg) return;

      let rawName = "";
      const link = cells[1].querySelector("a");
      if (link) {
        rawName = (link.textContent || "").trim();
      } else {
        const tname = cells[1].querySelector(".tname");
        if (tname) {
          rawName = (tname.textContent || "").trim();
        } else {
          let txt = (cells[1].textContent || "").trim();
          const m = txt.match(/^(.+?)(?:[（(]|[ 　])/);
          rawName = (m ? m[1] : txt).trim();
        }
      }
      if (!rawName) return;

      const norm = normalizeName(rawName);
      if (!norm) return;

      bindings.push({ element: iconImg, normName: norm, displayName: rawName });
    });

    bindings.forEach(({ element, normName, displayName }) => {
      element.dataset.soraniwaActor = normName;
      element.dataset.soraniwaActorDisplay = displayName;
      element.style.cursor = "pointer";
    });

    // クリック委譲：アイコンだけを拾う
    document.addEventListener(
      "click",
      (ev) => {
        const target = ev.target;
        if (!(target instanceof HTMLElement)) return;
        const el = target.closest("[data-soraniwa-actor]");
        if (!el) return;

        const normName = el.dataset.soraniwaActor;
        const displayName = el.dataset.soraniwaActorDisplay || normName || "";
        if (!normName) return;

        const actorInfo = actions[normName] || null;

        ev.stopPropagation();
        ev.preventDefault();
        showPopup(displayName || normName, actorInfo || { turns: {} });
      },
      true
    );
  }

  function init() {
    const battlemain = document.querySelector("div.battlemain");
    if (!battlemain) return;

    const actions = parseAllActions();

    setupNameJumpAndTurnHeader(battlemain);

    setupIconBindings(actions, battlemain);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
