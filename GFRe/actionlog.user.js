// ==UserScript==
// @name         GFRe 行動ログ
// @namespace    gfre.actionlog
// @version      1.1.0
// @description  アイコン画像クリックで行動ログをポップアップ
// @match        https://soraniwa.428.st/gf/result/*
// @grant        none
// @updateURL    https://github.com/Sinistella/42ste114/raw/refs/heads/main/GFRe/actionlog.user.js
// @downloadURL  https://github.com/Sinistella/42ste114/raw/refs/heads/main/GFRe/actionlog.user.js
// ==/UserScript==
(function () {
  "use strict";

  // ========= 共通ユーティリティ =========
  function normalizeName(name) {
    if (!name) return "";
    return name.replace(/\s+/g, "").normalize("NFKC");
  }


  function actorKeyFromIndex(index) {
    if (index === null || index === undefined || index === "") return "";
    return "idx:" + String(index);
  }

  function readScrolldataActors(scrolldata) {
    if (!scrolldata) return [];
    return Array.from(scrolldata.querySelectorAll("i[data-index]")).map((i) => {
      const name = i.dataset.cname || "";
      const index = i.dataset.index || "";
      return {
        key: actorKeyFromIndex(index),
        index,
        team: i.dataset.team || "",
        displayName: name,
        normName: normalizeName(name),
        states: i.dataset.states || ""
      };
    }).filter((a) => a.key && a.normName);
  }

  function escapeRegExp(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function statePairsFromText(states) {
    return String(states || "")
      .trim()
      .split(/\s+/)
      .map((part) => {
        const m = part.match(/^(.+?)x(-?\d+(?:\.\d+)?)$/);
        if (!m) return null;
        return { name: m[1], value: Number(m[2]), token: part };
      })
      .filter(Boolean);
  }

  function getActionStatusText(markerEl) {
    let node = markerEl.nextSibling;
    let steps = 0;
    while (node && steps < 12) {
      if (node.nodeName === "BR") break;
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = /** @type {HTMLElement} */ (node);
        if (el.tagName === "SMALL") {
          return (el.textContent || "").replace(/\s+/g, " ");
        }
      }
      node = node.nextSibling;
      steps++;
    }
    return "";
  }

  function scoreActorByStatusText(actor, statusText) {
    if (!actor || !statusText) return 0;

    let score = 0;
    let matched = 0;

    statePairsFromText(actor.states).forEach((st) => {
      if (statusText.includes(st.token)) {
        score += 4;
        matched++;
        return;
      }

      const m = statusText.match(
        new RegExp(escapeRegExp(st.name) + "x(-?\\d+(?:\\.\\d+)?)")
      );
      if (!m) return;

      matched++;
      const visibleValue = Number(m[1]);
      if (Number.isNaN(visibleValue) || Number.isNaN(st.value)) return;

      const diff = Math.abs(visibleValue - st.value);
      if (diff <= 1) score += 3;
      else if (diff <= 3) score += 1;
    });

    return matched ? score : 0;
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
    if (!root) return {};

    /** actions[actorKey] = { turns: { [turn:number]: string[] } } */
    const actions = {};
    let currentTurn = null;
    let currentActorOrders = {};
    const actionCursors = {};

    function ensureActor(actorKey) {
      if (!actorKey) return null;
      if (!actions[actorKey]) {
        actions[actorKey] = { turns: {} };
      }
      return actions[actorKey];
    }

    function updateActorOrders(scrolldata) {
      currentActorOrders = {};
      readScrolldataActors(scrolldata).forEach((actor) => {
        const k = actor.team + "|" + actor.normName;
        if (!currentActorOrders[k]) currentActorOrders[k] = [];
        currentActorOrders[k].push(actor);
      });
    }

    function getActionNo(markerEl) {
      let node = markerEl.nextSibling;
      let text = "";
      let steps = 0;
      while (node && steps < 8) {
        if (node.nodeName === "BR") break;
        text += node.textContent || node.nodeValue || "";
        node = node.nextSibling;
        steps++;
      }
      const m = text.match(/\((\d+)\)/);
      return m ? parseInt(m[1], 10) : null;
    }

    function resolveActorKey(rawName, team, actionNo, markerEl) {
      const norm = normalizeName(rawName);
      if (!norm) return "";

      const candidates = currentActorOrders[team + "|" + norm] || [];
      if (!candidates.length) return norm;
      if (candidates.length === 1) return candidates[0].key;

      const statusText = getActionStatusText(markerEl);
      if (statusText) {
        const ranked = candidates
          .map((actor) => ({ actor, score: scoreActorByStatusText(actor, statusText) }))
          .filter((item) => item.score > 0)
          .sort((a, b) => b.score - a.score);

        if (ranked.length && (ranked.length === 1 || ranked[0].score > ranked[1].score)) {
          return ranked[0].actor.key;
        }
      }

      const t = currentTurn || 1;
      const cursorKey = t + "|" + team + "|" + norm;
      const state = actionCursors[cursorKey] || { pos: 0, lastNo: null, count: 0 };

      if (actionNo !== null && !Number.isNaN(actionNo)) {
        if (state.count > 0 && state.lastNo !== null && actionNo <= state.lastNo) {
          state.pos++;
        }
        state.lastNo = actionNo;
      } else if (state.count > 0) {
        state.pos++;
      }

      state.count++;
      actionCursors[cursorKey] = state;
      return candidates[state.pos % candidates.length].key;
    }

    function addAction(rawName, skillName, actorKey) {
      if (!rawName || !skillName) return;
      const key = actorKey || normalizeName(rawName);
      if (!key) return;
      const actor = ensureActor(key);
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

      if (cls.contains("scrolldata")) {
        updateActorOrders(el);
        continue;
      }

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

        const team = cls.contains("markerB") ? "1" : "0";
        const actorKey = resolveActorKey(actorName, team, getActionNo(el), el);

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
          addAction(actorName, chosenSkill, actorKey);
        }
      }
    }

    return actions;
  }

  // ========= ポップアップ描画 =========
  function showPopup(displayName, actorInfo) {
    const overlayId = "gfre-actionlog-overlay";
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
    title.textContent = (displayName || "？？？") + " の行動一覧";
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
      msg.textContent = "行動ログが見つからない……多分即死。";
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

      const trHead = document.createElement("tr");

      const th0 = document.createElement("th");
      th0.textContent = "★";
      Object.assign(th0.style, {
        border: "1px solid #ccaa77",
        padding: "3px 6px",
        textAlign: "center",
        background: "#f2e4c8",
        whiteSpace: "nowrap"
      });
      trHead.appendChild(th0);

      for (let act = 0; act < maxRows; act++) {
        const th = document.createElement("th");
        th.textContent = (act + 1) + "行動目";
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

      for (const t of turns) {
        const tr = document.createElement("tr");

        const tdTurn = document.createElement("td");
        tdTurn.textContent = t + "ターン目";
        Object.assign(tdTurn.style, {
          border: "1px solid #ddc090",
          padding: "3px 6px",
          textAlign: "center",
          background: "#f2e4c8",
          whiteSpace: "nowrap",
          fontWeight: "bold"
        });
        tr.appendChild(tdTurn);

        const arr = actorInfo.turns[t] || [];
        for (let act = 0; act < maxRows; act++) {
          const td = document.createElement("td");
          td.textContent = arr[act] ?? "-";
          Object.assign(td.style, {
            border: "1px solid #ddc090",
            padding: "3px 6px",
            background: act % 2 === 0 ? "#fffff0" : "#f7ffea",
            whiteSpace: "nowrap"
          });
          tr.appendChild(td);
        }

        table.appendChild(tr);
      }

      content.appendChild(table);

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
          '<span><small style="font-weight:thin; font-size: 50%;">《ここが最初のターンや》</small></span>' +
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

  function setupActionBackLinks(battlemain) {
    if (!battlemain) return;

    battlemain.querySelectorAll("span.markerA a[id][href^='#s_'], span.markerB a[id][href^='#s_']").forEach((a) => {
      if (!(a.textContent || "").includes("の行動！")) return;

      const id = a.getAttribute("id") || "";
      const m = id.match(/^s_(.+)_(\d+)$/);
      if (!m) return;

      const actorId = m[1];
      const actionIndex = parseInt(m[2], 10);
      if (!Number.isFinite(actionIndex) || actionIndex <= 0) return;

      const prevId = "s_" + actorId + "_" + (actionIndex - 1);
      if (!document.getElementById(prevId)) return;

      const marker = a.parentElement;
      if (!marker) return;

      const exists = Array.from(marker.querySelectorAll("a.gfre-actionlog-backlink")).some((link) => {
        return link.dataset.prevFor === id;
      });
      if (exists) return;

      const back = document.createElement("a");
      back.href = "#" + prevId;
      back.textContent = "▲戻る";
      back.className = "gfre-actionlog-backlink";
      back.dataset.prevFor = id;

      const space = document.createTextNode(" ");
      const parent = a.parentNode;
      if (!parent) return;
      parent.insertBefore(space, a.nextSibling);
      parent.insertBefore(back, space.nextSibling);
    });
  }

  function setupIconBindings(actions, battlemain) {
    if (!battlemain) return;

    const statusTables = battlemain.querySelectorAll("table");
    if (!statusTables.length) return;

    const tableActors = new WeakMap();
    let latestActors = [];
    battlemain.querySelectorAll("span.scrolldata, table").forEach((el) => {
      if (el.matches("span.scrolldata")) {
        latestActors = readScrolldataActors(el);
      } else if (el.matches("table")) {
        tableActors.set(el, latestActors);
      }
    });

    const bindings = [];

    statusTables.forEach((statusTable) => {
      const actorList = tableActors.get(statusTable) || [];
      const usedActorIndexes = new Set();
      let actorPos = 0;

      function takeActorMeta(normName) {
        const direct = actorList[actorPos];
        if (direct && direct.normName === normName && !usedActorIndexes.has(actorPos)) {
          usedActorIndexes.add(actorPos);
          actorPos++;
          return direct;
        }

        const foundIndex = actorList.findIndex((actor, index) => {
          return index >= actorPos && !usedActorIndexes.has(index) && actor.normName === normName;
        });
        if (foundIndex >= 0) {
          usedActorIndexes.add(foundIndex);
          while (usedActorIndexes.has(actorPos)) actorPos++;
          return actorList[foundIndex];
        }

        return null;
      }

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

        const actorMeta = takeActorMeta(norm);
        const actorKey = actorMeta ? actorMeta.key : norm;

        bindings.push({ element: iconImg, actorKey, normName: norm, displayName: rawName });
      });
    });

    bindings.forEach(({ element, actorKey, normName, displayName }) => {
      element.dataset.soraniwaActor = actorKey;
      element.dataset.soraniwaActorName = normName;
      element.dataset.soraniwaActorDisplay = displayName;
      element.style.cursor = "pointer";
    });

    document.addEventListener(
      "click",
      (ev) => {
        const target = ev.target;
        if (!(target instanceof HTMLElement)) return;
        const el = target.closest("[data-soraniwa-actor]");
        if (!el) return;

        const actorKey = el.dataset.soraniwaActor;
        const normName = el.dataset.soraniwaActorName || actorKey || "";
        const displayName = el.dataset.soraniwaActorDisplay || normName || "";
        if (!actorKey) return;

        const actorInfo = actions[actorKey] || actions[normName] || null;

        ev.stopPropagation();
        ev.preventDefault();
        showPopup(displayName || normName, actorInfo);
      },
      true
    );
  }

  function init() {
    const battlemain = document.querySelector("div.battlemain");
    if (!battlemain) return;

    const actions = parseAllActions();

    setupNameJumpAndTurnHeader(battlemain);

    setupActionBackLinks(battlemain);

    setupIconBindings(actions, battlemain);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
