/* ==========================================================================
   안심ON — 함께ON (병실)
   Figma: together-1 (787:1195), together-1-1 (869:2424), together-2 (787:1032)
   The three frames are one screen: the room photo for the selected day, and a
   supply sheet that peeks at the bottom until it is pulled up to full height.
   ========================================================================== */

(function () {
  var ui = App.ui;
  var store = App.store;
  var data = App.data;

  var FILTERS = ["전체", "물품", "간식", "기타"];

  /* 분류별 순서. 최신 시안은 그룹 라벨 없이 한 목록으로 이어 보여준다. */
  var GROUPS = [
    { category: "물품", label: "필요 물품" },
    { category: "간식", label: "보낸 간식" },
    { category: "기타", label: "기타" }
  ];

  /* --- 공간 탐색 타이밍 (ms) ------------------------------------------------
     tap → press → swell → pop ─┬─ camera zoom/pan ───────────┐
                                └ 다른 물방울 fade   분류 sync(65%) → 목록 안정 */
  var T = {
    press: 100,          // scale 0.96
    swell: 150,          // scale 1.12, 안쪽 장면 1.07
    pop: 110,            // 외곽이 퍼지며 사라짐 (camera 와 동시에 시작)
    camera: 600,         // zoom/pan
    syncAt: 0.65,        // camera 진행률 65% 에서 분류/목록 전환
    listOut: 120         // 목록이 잠깐 비켰다가 새 내용으로 들어옴
  };

  var LEVEL_CLASS = { enough: "ok", low: "low", out: "out" };

  var LEVEL_NOTE = "남은 양을 세 단계로 알려드려요. "
    + "충분해요는 여유가 있고, 조금 남았어요는 곧 준비가 필요하며, "
    + "부족해요는 지금 채워주셔야 해요.";

  /* Fallbacks for the sheet travel, in case the custom properties can't be
     read (older engines drop unknown custom properties from computed style). */
  var SHEET_SHUT = 447;   // 필터 바 윗변 = 사진 아래 57px 위
  var SHEET_OPEN = 114;   // 헤더 바로 아래
  var DRAG_THRESHOLD = 60;

  function seed() {
    store.seed("supplies", data.supplies);
    store.seed("togetherDay", data.roomDays[0].date);
    store.seed("togetherFilter", "전체");
    store.seed("sheetOpen", false);
    store.seed("togetherInfo", false);
    store.seed("togetherDaysOpen", false);
  }

  function currentDay() {
    var iso = store.get("togetherDay", data.roomDays[0].date);
    for (var i = 0; i < data.roomDays.length; i++) {
      if (data.roomDays[i].date === iso) return data.roomDays[i];
    }
    return data.roomDays[0];
  }

  function dayLabel(iso) {
    return ui.dateLabel(iso) + " (" + ui.dowLabel(iso) + ")";
  }

  /* --- pieces ------------------------------------------------------------ */

  function roomHead(day) {
    var p = data.patient;
    var open = store.get("togetherDaysOpen", false);

    return '<header class="room-head">'
      + '<div class="room-head__identity">'
      + '<h1 class="room-head__name">'
      + '<button type="button" class="room-head__pick" data-action="toggle-days"'
      + ' aria-haspopup="listbox" aria-expanded="' + open + '">'
      + ui.esc(p.name) + "님 병실" + ui.icon("chevron-down")
      + "</button></h1>"
      + '<p class="room-head__ward">' + ui.esc(p.hospital + " · " + p.ward) + "</p>"
      + (open ? dayList(day) : "")
      + "</div>"
      + ui.icon("bell", { button: true, className: "room-head__bell", label: "알림", action: "notify" })
      + "</header>";
  }

  function dayList(day) {
    return '<div class="room-days" role="listbox" aria-label="날짜 선택">'
      + data.roomDays.map(function (d) {
        return '<button type="button" class="room-days__item" role="option"'
          + ' data-action="pick-day" data-date="' + ui.esc(d.date) + '"'
          + ' aria-selected="' + (d.date === day.date) + '">'
          + '<span class="room-days__date">' + ui.esc(dayLabel(d.date)) + "</span>"
          + '<span class="room-days__mood">' + ui.esc(d.mood) + "</span>"
          + "</button>";
      }).join("")
      + "</div>";
  }

  function moodCard(day) {
    return '<section class="mood-card" aria-labelledby="together-mood">'
      + '<p class="mood-card__label" id="together-mood">오늘의 병실</p>'
      + '<p class="mood-card__text">' + ui.esc(day.mood) + "</p>"
      + "</section>";
  }

  function roomshot(day) {
    /* 물방울마다 같은 사진을 한 장 더 넣어 둔다 (lens). 제자리에서는 뒤 사진과
       픽셀이 정확히 겹쳐 보이지 않다가, 부풀 때만 안쪽 장면이 살짝 확대된다. */
    var spots = (day.hotspots || []).map(function (h, i) {
      return '<button type="button" class="roomshot__spot"'
        + ' data-action="hotspot" data-spot="' + i + '" data-category="' + ui.esc(h.category || "") + '"'
        + ' aria-label="' + ui.esc(h.label + " · " + (h.category || "") + " 보기") + '">'
        + '<span class="roomshot__lens" aria-hidden="true"><span class="roomshot__scene">'
        + '<img class="roomshot__img" src="' + ui.esc(day.photo) + '" alt="">'
        + "</span></span></button>";
    }).join("");

    return '<figure class="roomshot" data-hero>'
      + '<div class="roomshot__camera" data-camera>'
      + '<img class="roomshot__img" src="' + ui.esc(day.photo) + '" alt="'
      + ui.esc(data.patient.name) + '님 병실 사진">'
      + "</div>"
      + moodCard(day)
      + spots
      + "</figure>";
  }

  function sheet(day) {
    var open = store.get("sheetOpen", false);
    var filter = store.get("togetherFilter", "전체");
    var info = store.get("togetherInfo", false);
    var body = listBody(filter);

    return '<section class="supplies' + (open ? " supplies--expanded" : "") + '"'
      + ' id="together-sheet" aria-label="챙길 것이 있어요">'

      /* 사진 하단에 떠 있는 분류 바 — 시트 윗변에 붙어 있어 시트와 함께 움직인다. */
      + '<div class="room-filter" role="tablist" aria-label="물품 분류">'
      + FILTERS.map(function (f) {
        return '<button type="button" class="room-filter__tab"'
          + ' role="tab" data-action="supply-filter" data-filter="' + f + '"'
          + ' aria-selected="' + (f === filter) + '">' + f + "</button>";
      }).join("")
      + "</div>"

      + '<div class="supplies__sheet">'
      /* 최신 업데이트 줄이 시트 손잡이다 — 누르거나 끌어 올리면 목록이 펼쳐진다. */
      + '<div class="supplies__head" data-action="toggle-sheet" role="button" tabindex="0"'
      + ' aria-controls="together-sheet" aria-expanded="' + open + '"'
      + ' aria-label="' + (open ? "물품 리스트 접기" : "물품 리스트 펼치기") + '">'
      + '<p class="supplies__updated">최신 업데이트 '
      + ui.esc(day.updatedAt || data.suppliesUpdatedAt) + "</p>"
      + ui.icon("info-circle", {
        button: true, size: 16, className: "supplies__info", label: "상태 안내", action: "toggle-info"
      })
      + "</div>"
      + (info ? '<p class="supplies__note" role="note">' + ui.esc(LEVEL_NOTE) + "</p>" : "")
      + '<div class="supplies__scroll" data-supply-list>' + body + "</div>"
      + "</div>"
      + "</section>";
  }

  /** 분류에 맞는 물품 목록 — 처음 그릴 때와, 공간 전환 중 목록만 바꿀 때 같이 쓴다. */
  function listBody(filter) {
    var rows = store.get("supplies", []);
    var list = [];
    GROUPS.forEach(function (g) {
      if (filter !== "전체" && filter !== g.category) return;
      rows.forEach(function (r) { if (r.category === g.category) list.push(r); });
    });
    return list.length
      ? '<ul class="supply-list">' + list.map(supplyRow).join("") + "</ul>"
      : emptyState("해당하는 물품이 없어요", "다른 분류를 선택해 보세요.");
  }

  function supplyRow(r) {
    var cls = LEVEL_CLASS[r.level] || "ok";
    return '<li class="supply">'
      + '<span class="supply__avatar">' + ui.icon("logo") + "</span>"
      + '<span class="supply__body">'
      + '<span class="supply__title">'
      + '<span class="supply__name">' + ui.esc(r.name) + "</span>"
      + '<span class="supply__qty"><span class="supply__sep" aria-hidden="true">·</span>'
      + ui.esc(r.count) + "개</span>"
      + "</span>"
      + '<span class="supply__date">전달일 ' + ui.esc(r.deliveredAt) + "</span>"
      + "</span>"
      + '<span class="supply__status supply__status--' + cls + '">'
      + ui.esc(data.levelLabels[r.level] || "") + "</span>"
      + "</li>";
  }

  function emptyState(title, text) {
    return '<div class="empty">'
      + '<span class="empty__glyph">' + ui.CHAT_GLYPH + "</span>"
      + '<p class="empty__title">' + ui.esc(title) + "</p>"
      + '<p class="empty__text">' + ui.esc(text) + "</p>"
      + "</div>";
  }

  /* --- view -------------------------------------------------------------- */

  var bound = null;
  var spaceNow = null;

  App.registerView("together", {
    title: "함께ON",

    render: function () {
      seed();
      var day = currentDay();

      return '<main class="screen screen--together" data-node-id="787:1195">'
        + '<div class="together__body">'
        + ui.statusbar()
        + roomHead(day)
        + roomshot(day)
        + sheet(day)
        + "</div>"
        + ui.navbar("together", "navbar--sheet")
        + "</main>";
    },

    mount: function (root) {
      var screen = root.querySelector(".screen--together");
      var el = root.querySelector(".supplies");
      var travel = sheetTravel(screen);
      var drag = null;
      var dragged = false;
      var space = createSpace(root, currentDay());

      function setOpen(next) {
        store.set("sheetOpen", next);
        App.refresh();
      }

      /* --- click ----------------------------------------------------------- */

      function onClick(e) {
        var hit = e.target.closest("[data-action]");
        var action = hit ? hit.dataset.action : "";
        var redraw = false;

        /* 공간 전환은 화면을 다시 그리지 않고 제자리에서 움직인다.
           날짜 목록이 열려 있으면 DOM 에서만 닫는다 (refresh 하면 전환이 끊긴다). */
        if (action === "hotspot" || action === "supply-filter") {
          closeDaysInPlace(root);
          if (action === "hotspot") space.enterFromSpot(hit);
          else space.selectCategory(hit.dataset.filter);
          return;
        }

        /* Any tap that isn't the switcher itself puts the day list away. */
        if (store.get("togetherDaysOpen", false) && action !== "toggle-days") {
          store.set("togetherDaysOpen", false);
          redraw = true;
        }

        if (action === "toggle-sheet") {
          var swallow = dragged;          // the click a finished drag leaves behind
          dragged = false;
          if (!swallow) {
            store.set("sheetOpen", !store.get("sheetOpen", false));
            redraw = true;
          }
        } else if (action === "toggle-days") {
          store.set("togetherDaysOpen", !store.get("togetherDaysOpen", false));
          redraw = true;
        } else if (action === "pick-day") {
          store.set("togetherDay", hit.dataset.date);
          redraw = true;
        } else if (action === "toggle-info") {
          store.set("togetherInfo", !store.get("togetherInfo", false));
          redraw = true;
        } else if (action === "notify") {
          ui.toast("알림은 준비 중입니다.");
        }

        if (redraw) App.refresh();
      }

      /* --- drag ------------------------------------------------------------ */

      function onDown(e) {
        if (!el || e.button > 0) return;
        if (!e.target.closest(".supplies__head")) return;
        if (e.target.closest(".supplies__info")) return;
        drag = { from: e.clientY, dy: 0, moved: false };
        dragged = false;
        el.classList.add("supplies--dragging");
        /* Keep the gesture even if the finger leaves the handle. */
        try { e.target.setPointerCapture(e.pointerId); } catch (err) { /* not supported */ }
      }

      function onMove(e) {
        if (!drag || !el) return;
        var open = store.get("sheetOpen", false);
        var span = travel.shut - travel.open;
        var dy = Math.max(open ? 0 : -span, Math.min(open ? span : 0, e.clientY - drag.from));
        drag.dy = dy;
        if (Math.abs(dy) > 4) drag.moved = true;
        el.style.setProperty("--sheet-drag", dy + "px");
      }

      function onUp() {
        if (!drag || !el) return;
        var d = drag;
        drag = null;
        el.classList.remove("supplies--dragging");
        el.style.removeProperty("--sheet-drag");
        if (!d.moved) return;          // a plain tap — onClick toggles it
        dragged = true;                // swallow the click this drag produced
        if (Math.abs(d.dy) > DRAG_THRESHOLD) setOpen(!store.get("sheetOpen", false));
      }

      function onKey(e) {
        if ((e.key === "Enter" || e.key === " ") && e.target.classList.contains("supplies__head")) {
          e.preventDefault();
          setOpen(!store.get("sheetOpen", false));
        }
      }

      root.addEventListener("click", onClick);
      root.addEventListener("keydown", onKey);
      root.addEventListener("pointerdown", onDown);
      root.addEventListener("pointermove", onMove);
      root.addEventListener("pointerup", onUp);
      root.addEventListener("pointercancel", onUp);

      /* The router reuses one #view element, so every listener has to come
         back off again in unmount — otherwise they stack up on each refresh. */
      bound = { root: root, click: onClick, key: onKey, down: onDown, move: onMove, up: onUp };
    },

    unmount: function () {
      if (spaceNow) { spaceNow.destroy(); spaceNow = null; }
      if (!bound) return;
      bound.root.removeEventListener("click", bound.click);
      bound.root.removeEventListener("keydown", bound.key);
      bound.root.removeEventListener("pointerdown", bound.down);
      bound.root.removeEventListener("pointermove", bound.move);
      bound.root.removeEventListener("pointerup", bound.up);
      bound.root.removeEventListener("pointercancel", bound.up);
      bound = null;
    }
  });

  function closeDaysInPlace(root) {
    if (!store.get("togetherDaysOpen", false)) return;
    store.set("togetherDaysOpen", false);
    var list = root.querySelector(".room-days");
    if (list) list.remove();
    var pick = root.querySelector("[data-action='toggle-days']");
    if (pick) pick.setAttribute("aria-expanded", "false");
  }

  /* --- 공간 탐색: hotspot pop · camera · 분류 sync --------------------------
     카메라는 사진을 감싼 .roomshot__camera 하나에 translate + scale 을 준다.
     목표값은 hotspot 의 x/y/zoom 에서 계산하고, 분류가 바뀌어도 화면을 다시
     그리지 않아 사진이 교체되거나 깜빡이지 않는다. */

  function createSpace(root, day) {
    var hero = root.querySelector("[data-hero]");
    var camera = root.querySelector("[data-camera]");
    var listEl = root.querySelector("[data-supply-list]");
    var tabs = Array.prototype.slice.call(root.querySelectorAll(".room-filter__tab"));
    var spots = Array.prototype.slice.call(root.querySelectorAll(".roomshot__spot"));
    var hotspots = day.hotspots || [];
    var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    var timers = [];
    var busy = false;

    function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
    function clearTimers() { timers.forEach(clearTimeout); timers = []; }

    function size() {
      return { w: hero.clientWidth, h: hero.clientHeight };
    }

    /* 보이는 영역의 가운데 — 위의 상태 카드와 아래 분류 바에 가리지 않는 곳 */
    function focusPoint(sz) {
      return { x: sz.w / 2, y: sz.h * 0.53 };
    }

    /** hotspot → camera transform. 사진 밖 빈 곳이 보이지 않게 잘라낸다. */
    function cameraFor(h) {
      var sz = size();
      var s = h.zoom || 1.6;
      var px = sz.w * h.x / 100;
      var py = sz.h * h.y / 100;
      var c = focusPoint(sz);
      var tx = Math.min(0, Math.max(sz.w - sz.w * s, c.x - s * px));
      var ty = Math.min(0, Math.max(sz.h - sz.h * s, c.y - s * py));
      return { scale: s, translateX: tx, translateY: ty };
    }

    function applyCamera(cam) {
      camera.style.transform = cam
        ? "translate(" + cam.translateX.toFixed(1) + "px, " + cam.translateY.toFixed(1) + "px) scale(" + cam.scale + ")"
        : "";
    }

    function spotFor(category) {
      for (var i = 0; i < hotspots.length; i++) if (hotspots[i].category === category) return i;
      return -1;
    }

    /* 물방울 위치·크기와, 안쪽 lens 장면이 뒤 사진과 정확히 겹치도록 맞춘다. */
    function layoutSpots() {
      var sz = size();
      spots.forEach(function (el, i) {
        var h = hotspots[i];
        if (!h) return;
        var d = sz.w * h.d / 100;
        var left = sz.w * h.x / 100 - d / 2;
        var top = sz.h * h.y / 100 - d / 2;
        el.style.left = left + "px";
        el.style.top = top + "px";
        el.style.width = d + "px";
        el.style.height = d + "px";
        var scene = el.querySelector(".roomshot__scene");
        scene.style.width = sz.w + "px";
        scene.style.height = sz.h + "px";
        scene.style.left = -left + "px";
        scene.style.top = -top + "px";
        scene.style.transformOrigin = (left + d / 2) + "px " + (top + d / 2) + "px";
      });
    }

    function setTabs(category) {
      tabs.forEach(function (t) {
        t.setAttribute("aria-selected", String(t.dataset.filter === category));
      });
    }

    /* 목록은 사진 속 전환이 먼저 보인 뒤 따라온다: 살짝 비켰다가 새 내용으로. */
    function swapList(category) {
      if (!listEl) return;
      listEl.classList.add("is-swapping");
      later(function () {
        listEl.innerHTML = listBody(category);   // 숨겨진 상태로 넣고
        listEl.scrollTop = 0;
        void listEl.offsetWidth;                  // 한 프레임 확정한 뒤
        listEl.classList.remove("is-swapping");   // 새 목록이 올라온다
      }, reduced ? 0 : T.listOut);
    }

    function commit(category) {
      store.set("togetherFilter", category);
      setTabs(category);
      swapList(category);
    }

    /** 카메라를 옮긴다. index < 0 이면 병실 전경으로. */
    function moveCamera(index) {
      hero.classList.toggle("is-focused", index > -1);
      spots.forEach(function (el, i) { el.classList.toggle("is-current", i === index); });
      if (reduced) {
        hero.classList.add("is-dipping");
        later(function () {
          applyCamera(index > -1 ? cameraFor(hotspots[index]) : null);
          hero.classList.remove("is-dipping");
        }, 160);
      } else {
        applyCamera(index > -1 ? cameraFor(hotspots[index]) : null);
      }
    }

    /* 물방울의 짧은 pop: 얇은 ring 한 번 + 작은 점 4개. 끝나면 지운다. */
    function burst(el) {
      var fx = document.createElement("span");
      fx.className = "roomshot__burst";
      fx.setAttribute("aria-hidden", "true");
      fx.style.left = el.style.left;
      fx.style.top = el.style.top;
      fx.style.width = el.style.width;
      fx.style.height = el.style.height;
      fx.style.setProperty("--r", (parseFloat(el.style.width) / 2) + "px");
      fx.innerHTML = '<span class="roomshot__ring"></span>'
        + '<i style="--a:-60deg"></i><i style="--a:30deg"></i><i style="--a:125deg"></i><i style="--a:215deg"></i>';
      hero.appendChild(fx);
      later(function () { fx.remove(); }, 420);
    }

    function enterFromSpot(el) {
      if (busy || hero.classList.contains("is-focused")) return;
      var index = +el.dataset.spot;
      var h = hotspots[index];
      if (!h) return;
      busy = true;
      clearTimers();

      if (reduced) {
        moveCamera(index);
        later(function () { commit(h.category); busy = false; }, 180);
        return;
      }

      el.classList.add("is-pressed");
      later(function () {
        el.classList.remove("is-pressed");
        el.classList.add("is-swelling");
      }, T.press);
      later(function () {
        el.classList.remove("is-swelling");
        el.classList.add("is-popping");
        burst(el);
        moveCamera(index);                       // pop 과 동시에 카메라 출발
      }, T.press + T.swell);
      later(function () { commit(h.category); }, T.press + T.swell + T.camera * T.syncAt);
      later(function () {
        el.classList.remove("is-popping");
        busy = false;
      }, T.press + T.swell + T.camera);
    }

    /* 분류 바에서 직접 고를 때도 같은 공간 이동을 쓴다. 전체 = 전경 복귀. */
    function selectCategory(category) {
      if (store.get("togetherFilter", "전체") === category && !busy) return;
      clearTimers();
      spots.forEach(function (el) { el.classList.remove("is-pressed", "is-swelling", "is-popping"); });
      busy = false;
      setTabs(category);                          // 누른 탭은 바로 반응
      store.set("togetherFilter", category);
      moveCamera(category === "전체" ? -1 : spotFor(category));
      later(function () { swapList(category); }, reduced ? 120 : T.camera * T.syncAt * 0.7);
    }

    /* 처음 그릴 때: 저장된 분류에 맞는 시점으로 애니메이션 없이 놓는다. */
    layoutSpots();
    hero.classList.add("is-still");
    var start = store.get("togetherFilter", "전체");
    if (start !== "전체") moveCamera(spotFor(start));
    void hero.offsetWidth;                        // 위치를 확정한 뒤 전환을 켠다
    requestAnimationFrame(function () { hero.classList.remove("is-still"); });

    var api = {
      enterFromSpot: enterFromSpot,
      selectCategory: selectCategory,
      cameraFor: cameraFor,
      destroy: clearTimers
    };
    spaceNow = api;
    return api;
  }

  /** The two rest positions of the sheet, read off the screen's custom props. */
  function sheetTravel(screen) {
    var shut = SHEET_SHUT;
    var open = SHEET_OPEN;
    if (screen && window.getComputedStyle) {
      var cs = getComputedStyle(screen);
      shut = parseFloat(cs.getPropertyValue("--sheet-top")) || shut;
      open = parseFloat(cs.getPropertyValue("--sheet-top-open")) || open;
    }
    return { shut: shut, open: open };
  }
})();
