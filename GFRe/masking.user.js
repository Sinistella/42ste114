// ==UserScript==
// @name         GFRe マスキング
// @namespace    gfre.masking
// @version      2.0.0
// @description  人様の名前と画像にマスキング
// @match        https://soraniwa.428.st/gf/result/*
// @updateURL    https://github.com/Sinistella/42ste114/raw/refs/heads/main/GFRe/masking.user.js
// @downloadURL  https://github.com/Sinistella/42ste114/raw/refs/heads/main/GFRe/masking.user.js
// @grant        none
// ==/UserScript==
(function () {
  "use strict";

  const CFG = {
    selectorScrollData: "span.scrolldata",
    teamAttr: "data-team",
    nameAttr: "data-cname",
    iconAttr: "data-icon",
    teamValue: "0",
    textMaskClass: "gfre-mask-text",
    imgMaskClass: "gfre-mask-img",
    revealedClass: "gfre-revealed",
    offClass: "gfre-masking-off",
    chunkClass: "gfre-mask-chunk",
    processedAttr: "data-gfre-mask-processed",
    toggleId: "gfre-mask-toggle",
    fixedEm: 5, // 全角5文字相当
    viewportMargin: 240,
    // 公式画像はドメインだけで判定する。
    // この2ドメイン以外の画像は、味方/敵/文脈を問わずマスキングする。
    officialImgHosts: new Set([
      "soraniwa.428.st",
      "st.x0.to"
    ])
  };

  const EXCLUDED_TEXT_TAGS = new Set([
    "SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "CODE", "PRE", "SELECT", "OPTION", "TITLE"
  ]);

  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const byLongest = (a, b) => b.length - a.length;

  function isOfficialImage(src) {
    if (!src) return false;
    try {
      const u = new URL(src, location.href);
      return CFG.officialImgHosts.has(u.hostname);
    } catch (_) {
      return false;
    }
  }

  function collectTargets() {
    const names = [];
    const items = document.querySelectorAll(`${CFG.selectorScrollData} i[${CFG.nameAttr}]`);

    for (const item of items) {
      const name = item.getAttribute(CFG.nameAttr);
      if (!name) continue;

      const isOwnSide = item.getAttribute(CFG.teamAttr) === CFG.teamValue;
      const icon = item.getAttribute(CFG.iconAttr) || "";
      const hasNonOfficialIcon = !!icon && !isOfficialImage(icon);

      // 旧仕様の「team=0」は維持しつつ、敵側に出るプレイヤー/外部画像キャラも拾う。
      if (isOwnSide || hasNonOfficialIcon) names.push(name);
    }

    return {
      names: Array.from(new Set(names))
    };
  }

  function isSkippableTextNode(node) {
    if (!node || node.nodeType !== Node.TEXT_NODE) return true;

    const p = node.parentElement;
    if (!p) return true;
    if (p.closest(`.${CFG.textMaskClass}, .${CFG.imgMaskClass}, ${CFG.selectorScrollData}`)) return true;
    if (p.isContentEditable) return true;
    if (EXCLUDED_TEXT_TAGS.has(p.tagName)) return true;

    return false;
  }

  function buildTextMask(text) {
    const wrap = document.createElement("span");
    wrap.className = CFG.textMaskClass;
    wrap.style.setProperty("--maskW", `${CFG.fixedEm}em`);

    const hidden = document.createElement("span");
    hidden.className = "gfre-mask-text-inner";
    hidden.textContent = text;
    wrap.appendChild(hidden);

    return wrap;
  }

  function buildNameRegex(names) {
    if (!names.length) return null;
    return new RegExp(`(${[...names].sort(byLongest).map(esc).join("|")})`, "g");
  }

  function hasTargetName(re, text) {
    if (!re || !text) return false;
    re.lastIndex = 0;
    const hit = re.test(text);
    re.lastIndex = 0;
    return hit;
  }

  function shouldMaskImage(img) {
    if (!img || img.closest(`.${CFG.imgMaskClass}`)) return false;

    const src = img.currentSrc || img.src || img.getAttribute("src") || "";
    if (!src) return false;

    return !isOfficialImage(src);
  }

  function rootHasTarget(root, re) {
    if (!root) return false;

    if (root.matches && root.matches("img[src]")) {
      return shouldMaskImage(root);
    }

    if (hasTargetName(re, root.textContent || "")) return true;

    const imgs = root.querySelectorAll ? root.querySelectorAll("img[src]") : [];
    for (const img of imgs) {
      if (shouldMaskImage(img)) return true;
    }

    return false;
  }

  function applyTextMasks(re, root) {
    if (!re || !root) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(txt) {
        if (isSkippableTextNode(txt)) return NodeFilter.FILTER_REJECT;
        if (!hasTargetName(re, txt.nodeValue)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    const targets = [];
    let n;
    while ((n = walker.nextNode())) targets.push(n);

    for (const textNode of targets) {
      const text = textNode.nodeValue;
      re.lastIndex = 0;

      const frag = document.createDocumentFragment();
      let last = 0;
      let m;

      while ((m = re.exec(text)) !== null) {
        const idx = m.index;
        const hit = m[0];
        if (idx > last) frag.appendChild(document.createTextNode(text.slice(last, idx)));
        frag.appendChild(buildTextMask(hit));
        last = idx + hit.length;
      }

      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      textNode.parentNode.replaceChild(frag, textNode);
    }
  }

  function applyImageMasks(root) {
    if (!root) return;

    const imgs = root.matches && root.matches("img[src]")
      ? [root]
      : Array.from(root.querySelectorAll ? root.querySelectorAll("img[src]") : []);

    for (const img of imgs) {
      if (!shouldMaskImage(img)) continue;

      const wrap = document.createElement("span");
      wrap.className = CFG.imgMaskClass;
      img.replaceWith(wrap);
      wrap.appendChild(img);
    }
  }

  function wrapDirectBattleTextChunks(re) {
    if (!re) return [];

    const main = document.querySelector(".battlemain");
    if (!main) return [];

    const chunks = [];
    for (const node of Array.from(main.childNodes)) {
      if (node.nodeType !== Node.TEXT_NODE) continue;

      const text = node.nodeValue || "";
      if (!text.trim()) continue;
      if (!hasTargetName(re, text)) continue;

      const span = document.createElement("span");
      span.className = CFG.chunkClass;
      node.parentNode.replaceChild(span, node);
      span.appendChild(node);
      chunks.push(span);
    }

    return chunks;
  }

  function uniqueElements(elements) {
    return Array.from(new Set(elements.filter(Boolean)));
  }

  function pruneNestedRoots(elements) {
    const set = new Set(elements);
    return elements.filter(el => {
      let p = el.parentElement;
      while (p) {
        if (set.has(p)) return false;
        p = p.parentElement;
      }
      return true;
    });
  }

  function collectMaskRoots(re) {
    const roots = [
      ...wrapDirectBattleTextChunks(re),
      ...document.querySelectorAll([
        ".battlemain > .talkarea",
        ".battlemain > .indent",
        ".battlemain span.markerA",
        ".battlemain span[class^='c']",
        ".battlemain .frameareab table td > div",
        ".battlemain img[src]",
        ".framearea > p > span",
        ".stats .framearea",
        ".stats img[src]"
      ].join(","))
    ];

    const filtered = uniqueElements(roots).filter(el => {
      if (el.closest(CFG.selectorScrollData)) return false;
      return rootHasTarget(el, re);
    });

    return pruneNestedRoots(filtered);
  }

  function isInViewport(el) {
    if (!el || !el.getBoundingClientRect) return false;

    const r = el.getBoundingClientRect();
    const m = CFG.viewportMargin;
    return r.bottom >= -m &&
           r.right >= -m &&
           r.top <= (window.innerHeight || document.documentElement.clientHeight) + m &&
           r.left <= (window.innerWidth || document.documentElement.clientWidth) + m;
  }

  function addStylesAndHandlers() {
    const css = `
.${CFG.textMaskClass}, .${CFG.imgMaskClass}{
  --peelDur: 0.6s;
  --peelEase: cubic-bezier(0.4, 0, 0.2, 1);
}

#${CFG.toggleId}{
  position:fixed;
  top:8px;
  left:8px;
  z-index:2147483647;
  padding:6px 10px;
  border:1px solid rgba(0,0,0,0.35);
  border-radius:6px;
  background:rgba(32,32,32,0.85);
  color:#fff;
  font-size:13px;
  line-height:1.2;
  cursor:pointer;
  box-shadow:0 1px 4px rgba(0,0,0,0.25);
}
#${CFG.toggleId}.off{ background:rgba(120,120,120,0.85); }

.${CFG.textMaskClass}{
  position:relative;
  display:inline-block;
  width: var(--maskW);
  min-width: var(--maskW);
  white-space:nowrap;
  cursor:pointer;
  outline:none;
  vertical-align:baseline;
}
.${CFG.textMaskClass}.${CFG.revealedClass}{
  width:auto;
  min-width:0;
}
.${CFG.textMaskClass} .gfre-mask-text-inner{
  display:inline-block;
  max-width:0;
  overflow:hidden;
  white-space:nowrap;
  color:transparent;
  visibility:hidden;
}
.${CFG.textMaskClass}.${CFG.revealedClass} .gfre-mask-text-inner{
  max-width:none;
  overflow:visible;
  visibility:visible;
  color:inherit;
  text-shadow:none;
}
.${CFG.textMaskClass}::before{
  content:"";
  position:absolute;
  left:0;
  top:50%;
  width: var(--maskW);
  height:1.2em;
  transform: translateY(-50%);
  background: linear-gradient(180deg,#aaa,#999);
  border-radius:2px;
  box-shadow:0 0 0 1px rgba(0,0,0,0.15) inset, 0 1px 2px rgba(0,0,0,0.15);
  transition: transform var(--peelDur) var(--peelEase), opacity var(--peelDur) var(--peelEase);
  transform-origin: left center;
  z-index:2;
}
.${CFG.textMaskClass}.${CFG.revealedClass}::before{
  transform: translateX(100%) rotateY(45deg);
  opacity:0;
}

.${CFG.imgMaskClass}{
  position:relative;
  display:inline-block;
  cursor:pointer;
  outline:none;
}
.${CFG.imgMaskClass} > img{ display:block; }
.${CFG.imgMaskClass}::before{
  content:"";
  position:absolute;
  inset:0;
  background: linear-gradient(180deg,#aaa,#999);
  border-radius:2px;
  box-shadow:0 0 0 1px rgba(0,0,0,0.15) inset, 0 1px 2px rgba(0,0,0,0.15);
  transition: transform var(--peelDur) var(--peelEase), opacity var(--peelDur) var(--peelEase);
  transform-origin: left center;
  z-index:2;
}
.${CFG.imgMaskClass}.${CFG.revealedClass}::before{
  transform: translateX(100%) rotateY(45deg);
  opacity:0;
}

body.${CFG.offClass} .${CFG.textMaskClass}{
  width:auto;
  min-width:0;
  cursor:inherit;
}
body.${CFG.offClass} .${CFG.textMaskClass} .gfre-mask-text-inner{
  max-width:none;
  overflow:visible;
  visibility:visible;
  color:inherit;
}
body.${CFG.offClass} .${CFG.textMaskClass}::before,
body.${CFG.offClass} .${CFG.imgMaskClass}::before{ display:none; }
body.${CFG.offClass} .${CFG.imgMaskClass}{ cursor:inherit; }
`;

    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);

    document.addEventListener("click", e => {
      const t = e.target.closest(`.${CFG.textMaskClass}, .${CFG.imgMaskClass}`);
      if (!t || document.body.classList.contains(CFG.offClass)) return;
      t.classList.toggle(CFG.revealedClass);
    });
  }

  function addToggleButton(onEnable) {
    const btn = document.createElement("button");
    btn.id = CFG.toggleId;
    btn.type = "button";
    document.body.appendChild(btn);

    let enabled = false; // 初期状態は常にOFF。状態保存はしない。

    function render() {
      document.body.classList.toggle(CFG.offClass, !enabled);
      btn.textContent = enabled ? "マスキングON" : "マスキングOFF";
      btn.classList.toggle("off", !enabled);
      btn.setAttribute("aria-pressed", enabled ? "true" : "false");
    }

    btn.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      enabled = !enabled;
      render();
      if (enabled) onEnable();
    });

    render();
    return () => enabled;
  }

  function main() {
    addStylesAndHandlers();

    let initialized = false;
    let nameRe = null;
    let roots = [];
    let observer = null;
    let throttled = null;
    let isEnabled = null;

    function processRoot(root) {
      if (!root || root.getAttribute(CFG.processedAttr) === "1") return;

      applyTextMasks(nameRe, root);
      applyImageMasks(root);
      root.setAttribute(CFG.processedAttr, "1");
    }

    function processVisibleRoots() {
      if (!initialized) initMasking();
      for (const root of roots) {
        if (isInViewport(root)) processRoot(root);
      }
    }

    function initMasking() {
      if (initialized) return;
      initialized = true;

      const targets = collectTargets();
      nameRe = buildNameRegex(targets.names);
      roots = collectMaskRoots(nameRe);

      if (!roots.length) return;

      if ("IntersectionObserver" in window) {
        observer = new IntersectionObserver(entries => {
          if (!isEnabled || !isEnabled()) return;

          for (const entry of entries) {
            if (entry.isIntersecting) processRoot(entry.target);
          }
        }, {
          root: null,
          rootMargin: `${CFG.viewportMargin}px 0px`,
          threshold: 0
        });

        for (const root of roots) observer.observe(root);
      } else {
        throttled = (() => {
          let timer = 0;
          return () => {
            if (timer) return;
            timer = window.setTimeout(() => {
              timer = 0;
              if (isEnabled && isEnabled()) processVisibleRoots();
            }, 150);
          };
        })();

        window.addEventListener("scroll", throttled, { passive: true });
        window.addEventListener("resize", throttled, { passive: true });
      }
    }

    // 初期OFF時は、対象収集・ルート収集・IntersectionObserver登録すら行わない。
    // ONにした瞬間だけ初期化する。
    isEnabled = addToggleButton(processVisibleRoots);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main, { once: true });
  } else {
    main();
  }
})();
