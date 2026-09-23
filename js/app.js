/* ==========================================================================
   안심ON — Router + boot
   Hash routing so the whole thing runs from file:// with no server.
   ========================================================================== */

(function () {
  var root;
  var current = null;

  /* --- routing ----------------------------------------------------------- */

  var ROUTES = [
    { pattern: /^\/home$/, view: "home" },
    { pattern: /^\/records$/, view: "records" },
    { pattern: /^\/ask$/, view: "ask" },
    { pattern: /^\/ask\/new$/, view: "askChat" },
    { pattern: /^\/ask\/list$/, view: "askList" },
    { pattern: /^\/ask\/([\w-]+)$/, view: "askDetail", keys: ["id"] },
    { pattern: /^\/together$/, view: "together" }
  ];

  function parse(hash) {
    var path = (hash || "").replace(/^#/, "") || "/home";
    var q = path.indexOf("?");
    var query = {};
    if (q > -1) {
      path.slice(q + 1).split("&").forEach(function (pair) {
        if (!pair) return;
        var kv = pair.split("=");
        query[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || "");
      });
      path = path.slice(0, q);
    }
    for (var i = 0; i < ROUTES.length; i++) {
      var m = path.match(ROUTES[i].pattern);
      if (m) {
        var params = { query: query };
        (ROUTES[i].keys || []).forEach(function (k, idx) { params[k] = m[idx + 1]; });
        return { view: ROUTES[i].view, params: params };
      }
    }
    return { view: "home", params: { query: query } };
  }

  App.go = function (hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  };

  /** Replace the current entry instead of stacking a new one. Use it when a
   *  screen hands off to another and should not be returned to — the chat
   *  handing off to the inquiry it just created, for instance. */
  App.replace = function (hash) {
    if (location.hash === hash) { render(); return; }
    location.replace(location.href.split("#")[0] + hash);
  };

  /* --- history ------------------------------------------------------------
     Each history entry is stamped with its position so back and forward can be
     told apart from a fresh navigation: a new hash entry starts with no state,
     while an entry we have already seen still carries the index we gave it.
     That index is what tells us whether there is anywhere to go back TO — if
     there isn't (the prototype was opened straight on a deep link), the app bar
     arrow falls back to its parent screen instead of leaving the page.
     -------------------------------------------------------------------------- */

  var index = 0;

  function stamp(i) {
    index = i;
    try {
      /* No URL argument: passing one is rejected on file:// origins. */
      history.replaceState({ ansimIndex: i }, "");
    } catch (e) { /* history state unavailable — back still works, just coarser */ }
  }

  function onHashChange() {
    var state = history.state;
    if (state && typeof state.ansimIndex === "number") index = state.ansimIndex;
    else stamp(index + 1);
    render();
  }

  App.back = function (fallbackHash) {
    if (index > 0) history.back();
    else App.go(fallbackHash || "#/home");
  };

  /* --- rendering --------------------------------------------------------- */

  function render() {
    var route = parse(location.hash);
    var view = App.views[route.view];

    if (current && current.unmount) {
      try { current.unmount(); } catch (e) { /* view already gone */ }
    }

    /* A fresh container every render. Views attach delegated listeners to the
       root they are handed, so reusing one element would stack a new listener
       on every refresh and fire each handler n times. Replacing the node
       throws its listeners away with it. */
    var fresh = document.createElement("div");
    fresh.className = "app__view";
    fresh.id = "view";
    fresh.innerHTML = view
      ? view.render(route.params)
      : '<main class="screen"><p style="padding:60px 20px">화면을 찾을 수 없습니다.</p></main>';

    root.replaceWith(fresh);
    root = fresh;

    current = view || null;
    if (view && view.mount) view.mount(root, route.params);
    document.title = "안심ON" + (view && view.title ? " · " + view.title : "");
  }

  /** Views call this after changing state to redraw themselves in place. */
  App.refresh = render;

  /* --- global delegation -------------------------------------------------- */

  function onClick(e) {
    var back = e.target.closest("[data-action='app-back']");
    if (back) {
      e.preventDefault();
      App.back(back.dataset.fallback);
      return;
    }
    var reset = e.target.closest("[data-action='reset-demo']");
    if (reset) {
      e.preventDefault();
      if (confirm("입력한 내용을 모두 지우고 처음 상태로 되돌릴까요?")) App.store.reset();
    }
  }

  /* --- boot --------------------------------------------------------------- */

  function boot() {
    root = document.getElementById("view");
    document.addEventListener("click", onClick);
    window.addEventListener("hashchange", onHashChange);
    /* replace, not assign: landing on the app should not leave an empty entry
       behind that the first back press would return to. */
    if (!location.hash) location.replace(location.href.split("#")[0] + "#/home");
    stamp(0);
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
