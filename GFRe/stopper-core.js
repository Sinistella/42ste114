(function () {
  if (window.GFReStopper) return;

  const S = {};
  const state = {
    precise: true,           // 常に1フレームPNG化
    log: false,
    maxConcurrent: 6         // 同時デコード上限
  };

  const animRe = /\.(?:gif|apng)(?:$|[?#])/i;
  const dataGifRe = /^data:image\/gif/i;
  const urlInCssRe = /url\((['"]?)(.+?)\1\)/i;
  const animCssRe = /url\((['"]?)(.+?\.(?:gif|apng)(?:$|[?#]).*?)\1\)/i;
  const tinyPNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAoMBgQz+RVQAAAAASUVORK5CYII=";

  function log(...a){ if(state.log) console.debug("[GFReStopper]", ...a); }

  function isAnimUrl(u){
    if (!u) return false;
    if (dataGifRe.test(u)) return true;
    try{
      const url = new URL(u, location.href);
      return animRe.test(url.pathname + url.search + url.hash);
    }catch{
      return false;
    }
  }

  function lockSize(el){
    const cs = getComputedStyle(el);
    const w = el.clientWidth || parseInt(cs.width) || el.naturalWidth || 0;
    const h = el.clientHeight || parseInt(cs.height) || el.naturalHeight || 0;
    if (w) el.style.width = w + "px";
    if (h) el.style.height = h + "px";
  }

  // 並列制御付きフェッチ→1フレームPNG化
  let running = 0;
  const q = [];
  function schedule(fn){
    if (running < state.maxConcurrent){
      running++;
      Promise.resolve().then(fn).finally(() => {
        running--;
        if (q.length) schedule(q.shift());
      });
    }else{
      q.push(fn);
    }
  }

  function fetchFirstFrame(url, cb){

    if (typeof GM_xmlhttpRequest !== "function"){
      log("GM_xmlhttpRequest not available");
      cb(null);
      return;
    }
    schedule(() => new Promise(resolve => {
      try{
        GM_xmlhttpRequest({
          method: "GET",
          url,
          responseType: "blob",
          timeout: 30000,
          onload: res => {
            try{
              const blob = res.response;
              const blobUrl = URL.createObjectURL(blob);
              const im = new Image();
              im.decoding = "sync";
              im.onload = () => {
                try{
                  const c = document.createElement("canvas");
                  c.width = im.naturalWidth || 1;
                  c.height = im.naturalHeight || 1;
                  c.getContext("2d").drawImage(im, 0, 0);
                  const still = c.toDataURL("image/png");
                  URL.revokeObjectURL(blobUrl);
                  cb(still);
                }catch(e){
                  URL.revokeObjectURL(blobUrl);
                  log("canvas err", e);
                  cb(null);
                }
                resolve();
              };
              im.onerror = () => { try{ URL.revokeObjectURL(blobUrl); }catch{} resolve(); cb(null); };
              im.src = blobUrl;
            }catch(e){ log("onload err", e); resolve(); cb(null); }
          },
          onerror: () => { resolve(); cb(null); },
          ontimeout: () => { resolve(); cb(null); }
        });
      }catch(e){ log("GM err", e); resolve(); cb(null); }
    }));
  }

  // 画像停止（即止め→1フレームに差替）
  function stopImgToFirstFrame(img, rawUrl){
    if (!img || img.__gfre_handled__) return;
    img.__gfre_handled__ = 1;
    lockSize(img);
    try{ img.removeAttribute("srcset"); }catch{}
    img.src = tinyPNG; // 即時停止
    if (!state.precise) return;

    fetchFirstFrame(rawUrl, still => {
      if (still){
        try{ img.removeAttribute("srcset"); }catch{}
        img.src = still;
        img.dataset.animStopped = "freeze";
      }
    });
  }

  // 背景停止（即止め→1フレームに差替）
  function stopBgToFirstFrame(styleDecl, url, el){
    try{
      styleDecl.setProperty("background-image", `url("${tinyPNG}")`);
    }catch{}
    if (!state.precise) return;
    fetchFirstFrame(url, still => {
      if (still){
        try{ styleDecl.setProperty("background-image", `url("${still}")`); }catch{}
        if (el && el.nodeType === 1) el.dataset.animBgStopped = "freeze";
      }
    });
  }

  // フック群
  function hookImg(){
    const proto = HTMLImageElement.prototype;
    if (proto.__gfre_hooked__) return;

    const d = Object.getOwnPropertyDescriptor(proto, "src");
    if (d && d.configurable){
      Object.defineProperty(proto, "src", {
        get(){ return d.get.call(this); },
        set(v){
          if (typeof v === "string" && isAnimUrl(v)){
            stopImgToFirstFrame(this, v);
            return;
          }
          return d.set.call(this, v);
        }
      });
    }

    const origSetAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function(name, value){
      if (this instanceof HTMLImageElement && typeof value === "string" && (name === "src" || name === "srcset") && isAnimUrl(value)){
        try{ this.removeAttribute("srcset"); }catch{}
        this.src = value;
        return;
      }
      return origSetAttribute.call(this, name, value);
    };

    proto.__gfre_hooked__ = 1;
  }

  function hookCssBackground(){
    const cssProto = CSSStyleDeclaration.prototype;
    if (cssProto.__gfre_hooked__) return;

    const origSetProperty = cssProto.setProperty;
    cssProto.setProperty = function(prop, val, prio){
      try{
        if ((prop === "background" || prop === "background-image") && typeof val === "string" && urlInCssRe.test(val)){
          const url = val.replace(/.*url\((['"]?)(.+?)\1\).*/i, "$2");
          if (isAnimUrl(url)){
            const el = this.ownerElement || this.parentRule?.parentStyleSheet?.ownerNode;
            stopBgToFirstFrame(this, url, el && el.nodeType === 1 ? el : null);
            return;
          }
        }
      }catch(e){ log("css hook err", e); }
      return origSetProperty.call(this, prop, val, prio);
    };

    cssProto.__gfre_hooked__ = 1;
  }

  function freezeAll(root=document){
    root.querySelectorAll("img").forEach(img => {
      const u = img.currentSrc || img.src || "";
      if (isAnimUrl(u)) stopImgToFirstFrame(img, u);
    });

    root.querySelectorAll("*").forEach(el => {
      const cs = getComputedStyle(el);
      const bg = cs.backgroundImage;
      if (!bg || bg === "none") return;
      const m = bg.match(animCssRe);
      if (!m) return;
      const u = m[2];
      el.style.setProperty("background-image", `url("${u}")`);
    });
  }

  function startObserver(){
    const mo = new MutationObserver(muts => {
      for (const m of muts){
        if (m.type === "childList"){
          m.addedNodes.forEach(n => {
            if (n.nodeType !== 1) return;
            if (n.tagName === "IMG"){
              const u = n.currentSrc || n.src || "";
              if (isAnimUrl(u)) stopImgToFirstFrame(n, u);
            }
            n.querySelectorAll?.("img").forEach(im => {
              const u2 = im.currentSrc || im.src || "";
              if (isAnimUrl(u2)) stopImgToFirstFrame(im, u2);
            });

            const cs = getComputedStyle(n);
            const bg = cs.backgroundImage;
            if (bg && bg !== "none" && animCssRe.test(bg)){
              const url = bg.replace(/.*url\((['"]?)(.+?)\1\).*/i, "$2");
              n.style.setProperty("background-image", `url("${url}")`);
            }
          });
        }else if (m.type === "attributes"){
          const t = m.target;
          if (t.tagName === "IMG" && (m.attributeName === "src" || m.attributeName === "srcset")){
            const u = t.currentSrc || t.src || "";
            if (isAnimUrl(u)) stopImgToFirstFrame(t, u);
          }else if ((m.attributeName === "style" || m.attributeName === "class") && t.nodeType === 1){
            const cs = getComputedStyle(t);
            const bg = cs.backgroundImage;
            if (bg && bg !== "none" && animCssRe.test(bg)){
              const url = bg.replace(/.*url\((['"]?)(.+?)\1\).*/i, "$2");
              t.style.setProperty("background-image", `url("${url}")`);
            }
          }
        }
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["src","srcset","style","class"] });
  }

  function install(opts={}){
    if (opts.log != null) state.log = !!opts.log;
    if (opts.maxConcurrent != null) state.maxConcurrent = Math.max(1, opts.maxConcurrent|0);

    hookImg();
    hookCssBackground();
    freezeAll(document);
    startObserver();
  }

  S.install = install;
  S.setLog = b => state.log = !!b;
  S.setMaxConcurrent = n => state.maxConcurrent = Math.max(1, n|0);

  window.GFReStopper = S;
})();
