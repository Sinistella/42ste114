// ==UserScript==
// @name         GFRe マスキング
// @namespace    gfre.masking
// @version      1.0.0
// @description  人様の名前と画像にマスキング
// @match        https://soraniwa.428.st/gf/result/*
// @updateURL    https://github.com/Sinistella/42ste114/raw/refs/heads/main/GFRe/masking.user.js
// @downloadURL  https://github.com/Sinistella/42ste114/raw/refs/heads/main/GFRe/masking.user.js
// @grant        none
// ==/UserScript==
(function () {
  "use strict";

  const CFG = {
    selectorFirstScrollData: "span.scrolldata",
    teamAttr: "data-team",
    nameAttr: "data-cname",
    teamValue: "0",
    textMaskClass: "gfre-mask-text",
    imgMaskClass: "gfre-mask-img",
    revealedClass: "gfre-revealed",
    fixedEm: 5, // 全角5文字相当
    excludeImgPrefix: "https://soraniwa.428.st/gf/img/"
  };

  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const byLongest = (a, b) => b.length - a.length;

  function collectNames() {
    const first = document.querySelector(CFG.selectorFirstScrollData);
    if (!first) return [];
    const items = first.querySelectorAll(`i[${CFG.teamAttr}="${CFG.teamValue}"][${CFG.nameAttr}]`);
    const names = Array.from(items).map(i => i.getAttribute(CFG.nameAttr)).filter(Boolean);
    return Array.from(new Set(names));
  }

  function isSkippableTextNode(node) {
    if (!node || node.nodeType !== Node.TEXT_NODE) return true;
    const p = node.parentElement;
    if (!p) return true;
    if (p.closest(`.${CFG.textMaskClass}`)) return true;
    if (p.closest(`.${CFG.imgMaskClass}`)) return true;
    if (p.isContentEditable) return true;
    const tn = p.tagName;
    const exclude = new Set(["SCRIPT","STYLE","NOSCRIPT","TEXTAREA","INPUT","CODE","PRE","SELECT","OPTION","TITLE"]);
    if (exclude.has(tn)) return true;
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

  function applyTextMasks(names) {
    if (!names.length) return;
    const re = new RegExp(`(${names.sort(byLongest).map(esc).join("|")})`, "g");
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(txt) {
        if (isSkippableTextNode(txt)) return NodeFilter.FILTER_REJECT;
        if (!re.test(txt.nodeValue)) return NodeFilter.FILTER_REJECT;
        re.lastIndex = 0;
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

  function applyImageMasks(root = document) {
    const imgs = root.querySelectorAll("img[src]");
    for (const img of imgs) {
      if (img.closest(`.${CFG.imgMaskClass}`)) continue;
      const src = img.currentSrc || img.src || "";
      if (src.startsWith(CFG.excludeImgPrefix)) continue;
      const wrap = document.createElement("span");
      wrap.className = CFG.imgMaskClass;
      img.replaceWith(wrap);
      wrap.appendChild(img);
    }
  }

  function addStylesAndHandlers() {
    const css = `
.${CFG.textMaskClass}, .${CFG.imgMaskClass}{
  --peelDur: 0.6s;
  --peelEase: cubic-bezier(0.4, 0, 0.2, 1);
}

/* テキスト用シール */
.${CFG.textMaskClass}{
  position:relative;
  display:inline-block;
  cursor:pointer;
  outline:none;
  min-width: var(--maskW);
  vertical-align:baseline;
}
.${CFG.textMaskClass}.${CFG.revealedClass}{ min-width:auto; }
.${CFG.textMaskClass} .gfre-mask-text-inner{
  color:transparent;
  visibility:hidden;
}
.${CFG.textMaskClass}.${CFG.revealedClass} .gfre-mask-text-inner{
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

/* 画像用シール */
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
`;
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);

    function toggle(el) {
      el.classList.toggle(CFG.revealedClass);
    }

    document.addEventListener("click", e => {
      const t = e.target.closest(`.${CFG.textMaskClass}, .${CFG.imgMaskClass}`);
      if (t) toggle(t);
    });
  }

  function main() {
    const names = collectNames();
    if (!names.length) return;
    addStylesAndHandlers();
    applyTextMasks(names);
    applyImageMasks();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main, { once: true });
  } else {
    main();
  }
})();
