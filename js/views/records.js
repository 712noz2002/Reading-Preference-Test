/* ==========================================================================
   안심ON — 기록
   하루 = 카드 한 장. 가운데 카드가 앞에, 전날/다음날 카드가 좌우 뒤에서
   살짝 보이는 swivel(cover-flow) carousel.

   구조
   - 카드 DOM 은 data.careDays 배열에서 한 번에 렌더한다 (날짜별 하드코딩 없음).
   - 위치는 연속 값 `pos` 하나로 관리한다. 카드 i 의 상대 위치 o = i - pos.
     JS 는 카드마다 CSS 변수 --o(부호 있는 위치)와 --d(|o|) 만 쓰고,
     실제 translate / rotateY / depth / scale 은 list.css 가 계산한다.
   - 드래그 중에는 pos 가 손가락을 그대로 따라가고(0~1 사이 progress 가 곧
     pos 의 소수부), 손을 떼면 rAF 트윈으로 가장 가까운/다음 정수로 snap.
     트윈 도중 다시 잡으면 그 자리에서 이어받으므로 순서가 꼬이지 않는다.
   - 화살표도 같은 트윈을 쓴다.
   ========================================================================== */

(function () {
  var ui = App.ui;
  var store = App.store;
  var data = App.data;

  var MONTHS = ["2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01", "2026-11-01", "2026-12-01"];
  var DOW_FULL = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

  var AREA_ICON = { meal: "care-meal", activity: "care-activity", toilet: "care-toilet", hygiene: "care-hygiene" };

  var TONE_TAG = { calm: "평소와 같아요", change: "살펴볼 변화 1", upcoming: "기록 전" };

  /* 모션 파라미터 */
  var SNAP_MS = 420;            // 350~450ms
  var DIST_RATIO = 0.22;        // 카드 폭의 22% 이상 끌면 넘어감
  var FLICK_V = 0.45;           // px/ms — 짧게 튕겨도 넘어감
  var EDGE_RESIST = 0.28;       // 끝 날짜에서 당길 때 저항
  var EDGE_MAX = 0.18;          // 끝에서 최대로 밀리는 양 (카드 1장 대비)

  /* 가로 배치 (카드 폭 배수). 쉬는 상태에서 옆 카드는 SHIFT 만큼만 비켜
     메인 카드 뒤에서 가장자리만 보이고, 넘어가는 도중에는 SWING 만큼 더
     벌어져 두 카드가 겹친 채로 순서가 뒤바뀌지 않게 한다. */
  var SHIFT = 0.25;
  var SWING = 0.3;
  var DRAG_PER_CARD = 1.05;     // 카드 폭의 105% 를 끌면 progress 1 (초반엔 손가락과 거의 1:1)

  /* 현재 선택된 날짜 — 진입할 때마다 오늘 카드에서 시작한다. */
  var state = { index: 0 };

  function days() { return data.careDays || []; }

  function todayIndex() {
    var list = days();
    for (var i = 0; i < list.length; i++) if (list[i].date === data.careToday) return i;
    return Math.max(0, list.length - 1);
  }

  function lines(text) {
    return ui.esc(text).replace(/\n/g, "<br>");
  }

  /* --- pieces ------------------------------------------------------------ */

  function head(iso) {
    return '<header class="rc-head">'
      + '<button type="button" class="rc-head__month" data-action="open-months"'
      + ' aria-expanded="' + store.get("monthOpen", false) + '">'
      + '<span data-rc-month>' + ui.monthLabel(iso) + "</span>"
      + ui.icon("chevron-down-16", { size: 16 })
      + "</button></header>";
  }

  /* 요약형 카드 — 위에서부터 "하루가 어땠는가" → (변화) → 네 가지 돌봄 한 줄 → 기록 흐름 */
  function card(day, i, count) {
    var d = ui.parseISO(day.date);
    var sum = day.dailySummary || {};
    var tone = sum.tone || "calm";
    var recs = day.careRecords || {};
    var tl = day.timeline || [];

    /* 네 가지 돌봄은 순서가 없는 병렬 상태값 — 레이블 + 상태만, 연결선·점 없음 */
    var cells = (data.careAreas || []).map(function (a) {
      var r = recs[a.key] || { status: "-", state: "pending" };
      return '<li class="rc-stat rc-stat--' + r.state + '">'
        + '<span class="rc-stat__label">' + ui.esc(a.label) + "</span>"
        + '<span class="rc-stat__value">' + ui.esc(r.status) + "</span>"
        + "</li>";
    }).join("");

    var change = sum.change
      ? '<div class="rc-change">'
        + '<p class="rc-change__title">'
        + '<span class="rc-change__icon">' + ui.icon(AREA_ICON[sum.change.area] || "info-circle", { size: 16 }) + "</span>"
        + ui.esc(sum.change.title) + "</p>"
        + '<p class="rc-change__text">' + ui.esc(sum.change.text) + "</p>"
        + "</div>"
      : "";

    var meta = tl.length ? "기록 " + tl.length + "건" : "기록 전";

    return '<article class="rc-card rc-card--' + tone + '"'
      + ' data-rc-card="' + i + '" aria-roledescription="slide"'
      + ' aria-label="' + ui.esc(ui.dateLabel(day.date)) + ' 기록">'
      + '<header class="rc-card__head">'
      + '<button type="button" class="rc-card__arrow" data-action="rc-prev" aria-label="이전 날짜"'
      + (i === 0 ? " disabled" : "") + ">" + ui.icon("chevron-left", { size: 20 }) + "</button>"
      + '<div class="rc-card__date">'
      + '<p class="rc-card__dow">' + DOW_FULL[d.getDay()] + "</p>"
      + '<h2 class="rc-card__day">' + ui.dateLabel(day.date) + "</h2>"
      + "</div>"
      + '<button type="button" class="rc-card__arrow" data-action="rc-next" aria-label="다음 날짜"'
      + (i === count - 1 ? " disabled" : "") + ">" + ui.icon("chevron-right", { size: 20 }) + "</button>"
      + "</header>"

      + '<section class="rc-day">'
      + '<p class="rc-day__tag">' + ui.esc(TONE_TAG[tone] || "") + "</p>"
      + '<p class="rc-day__headline">' + lines(sum.headline || "") + "</p>"
      + '<p class="rc-day__text">' + ui.esc(sum.text || "") + "</p>"
      + change
      + "</section>"

      + '<section class="rc-stats" aria-label="' + ui.esc(statsTitle(day)) + '">'
      + '<header class="rc-stats__head">'
      + '<h3 class="rc-stats__title">' + ui.esc(statsTitle(day)) + "</h3>"
      + '<p class="rc-stats__meta">' + ui.esc(meta) + "</p>"
      + "</header>"
      + '<ul class="rc-stats__list">' + cells + "</ul>"
      + "</section>"

      + '<button type="button" class="rc-card__more" data-action="rc-timeline">오늘의 돌봄 흐름 살펴보기</button>'
      + '<span class="rc-card__veil" aria-hidden="true"></span>'
      + "</article>";
  }

  function statsTitle(day) {
    return day.date === data.careToday ? "오늘의 돌봄 상태" : "이날의 돌봄 상태";
  }

  function carousel() {
    var list = days();
    return '<section class="rc-stage" data-rc-stage aria-roledescription="carousel" aria-label="날짜별 돌봄 기록">'
      + list.map(function (day, i) { return card(day, i, list.length); }).join("")
      + "</section>";
  }

  function summaryTitle(day) {
    if (day.date === data.careToday) return "오늘의 돌봄";
    if ((day.dailySummary || {}).tone === "upcoming") return "다음 돌봄";
    return ui.dateLabel(day.date) + "의 돌봄";
  }

  function summary(day) {
    return '<section class="rc-summary" aria-live="polite">'
      + '<h3 class="rc-summary__title" data-rc-sum-title>' + ui.esc(summaryTitle(day)) + "</h3>"
      + '<p class="rc-summary__text" data-rc-sum-text>' + ui.esc(day.note || "") + "</p>"
      + "</section>";
  }

  function monthPicker(iso) {
    if (!store.get("monthOpen", false)) return "";
    var currentMonth = iso.slice(0, 7);
    var items = MONTHS.map(function (m) {
      return '<button type="button" class="picker__item" data-action="pick-month" data-month="' + m + '"'
        + ' aria-current="' + (m.slice(0, 7) === currentMonth) + '">' + ui.monthLabel(m) + "</button>";
    }).join("");
    return '<div class="picker" data-action="close-months">'
      + '<div class="picker__panel">'
      + '<p class="picker__title">월 선택</p>'
      + '<div class="picker__grid">' + items + "</div>"
      + "</div></div>";
  }

  /* --- 돌봄 타임라인 (기록 안의 두 번째 화면) --------------------------------
     카드와 같은 day 객체의 timeline 을 시간대별로 묶어 보여준다. */

  function timelineView(day) {
    var tl = day.timeline || [];
    var groups = (data.carePeriods || []).map(function (p) {
      var rows = tl.filter(function (r) { return r.period === p.key; });
      if (!rows.length) return "";
      return '<article class="timeline__group">'
        + '<header class="timeline__head">'
        + '<span class="timeline__dot" aria-hidden="true"></span>'
        + '<h3 class="timeline__label">' + ui.esc(p.label) + "</h3>"
        + '<p class="timeline__time">' + ui.esc(p.time) + "</p>"
        + "</header>"
        + rows.map(function (r) {
          return '<div class="timeline__card rt-item' + (r.watch ? " rt-item--watch" : "") + '">'
            + '<span class="timeline__avatar rt-item__avatar">' + ui.CHAT_GLYPH + "</span>"
            + '<span class="rt-item__body">'
            + '<span class="timeline__card-title">' + ui.esc(r.title)
            + (r.watch ? '<span class="rt-item__flag">관찰</span>' : "") + "</span>"
            + '<span class="rt-item__detail">' + ui.esc(r.detail) + "</span>"
            + "</span>"
            + '<span class="rt-item__at">' + ui.esc(r.at) + " 기록</span>"
            + "</div>";
        }).join("")
        + "</article>";
    }).join("");

    var body = groups
      ? '<div class="timeline rt-timeline">' + groups + "</div>"
      : '<div class="empty">'
        + '<span class="empty__glyph">' + ui.CHAT_GLYPH + "</span>"
        + '<p class="empty__title">아직 기록 전이에요</p>'
        + '<p class="empty__text">돌봄이 시작되면 이곳에 시간 순서대로 올라와요.</p>'
        + "</div>";

    var dow = DOW_FULL[ui.parseISO(day.date).getDay()];
    return '<main class="screen screen--care-timeline">'
      + ui.statusbar(false)
      + ui.appbar("돌봄 타임라인", "#/records")
      + '<p class="rt-date">' + ui.esc(ui.dateLabel(day.date) + " " + dow) + "</p>"
      + '<div class="rt-scroll">' + body + "</div>"
      + ui.navbar("records", "navbar--sheet")
      + "</main>";
  }

  function indexOf(iso) {
    var list = days();
    for (var i = 0; i < list.length; i++) if (list[i].date === iso) return i;
    return -1;
  }

  /* --- carousel engine --------------------------------------------------- */

  var engine = null;

  function createEngine(root) {
    var stage = root.querySelector("[data-rc-stage]");
    var cards = Array.prototype.slice.call(root.querySelectorAll("[data-rc-card]"));
    var monthEl = root.querySelector("[data-rc-month]");
    var sumTitle = root.querySelector("[data-rc-sum-title]");
    var sumText = root.querySelector("[data-rc-sum-text]");
    var last = cards.length - 1;

    var pos = state.index;       // 연속 위치 (드래그/트윈 중 소수)
    var raf = 0;
    var drag = null;
    var suppressClick = false;

    function ease(t) { return 1 - Math.pow(1 - t, 5); } // ≈ cubic-bezier(0.22, 1, 0.36, 1)

    function paint() {
      for (var i = 0; i < cards.length; i++) {
        var o = i - pos;
        var d = Math.abs(o);
        var el = cards[i];
        el.style.setProperty("--o", o.toFixed(4));
        var dc = Math.min(d, 2);
        var x = (o < 0 ? -1 : 1) * (SHIFT * dc + SWING * Math.sin(Math.PI * Math.min(dc, 1)));
        el.style.setProperty("--d", dc.toFixed(4));
        el.style.setProperty("--x", x.toFixed(4));
        el.style.setProperty("--mid", Math.sin(Math.PI * Math.min(dc, 1)).toFixed(4));
        el.style.zIndex = String(100 - Math.round(d * 10));
        el.classList.toggle("is-hidden", d > 1.9);
        var active = d < 0.5;
        el.classList.toggle("is-active", active);
        el.setAttribute("aria-hidden", active ? "false" : "true");
        el.inert = !active;
      }
    }

    function syncText(i) {
      var day = days()[i];
      if (!day) return;
      monthEl.textContent = ui.monthLabel(day.date);
      sumTitle.textContent = summaryTitle(day);
      sumText.textContent = day.note || "";
    }

    function setIndex(i) {
      if (i === state.index) return;
      state.index = i;
      syncText(i);
    }

    function animateTo(target) {
      target = Math.max(0, Math.min(last, target));
      setIndex(target);
      cancelAnimationFrame(raf);
      var from = pos;
      var dist = target - from;
      if (Math.abs(dist) < 0.0005) { pos = target; paint(); return; }
      var t0 = performance.now();
      /* 여러 장을 건너뛸 때(월 선택)만 조금 더 길게 */
      var dur = SNAP_MS * Math.min(1.6, Math.max(1, Math.abs(dist)));
      function step(now) {
        var t = Math.min(1, (now - t0) / dur);
        pos = from + dist * ease(t);
        paint();
        if (t < 1) raf = requestAnimationFrame(step);
        else { pos = target; paint(); raf = 0; }
      }
      raf = requestAnimationFrame(step);
    }

    function width() { return cards[0] ? cards[0].offsetWidth : stage.clientWidth; }

    /* 끝 날짜에서는 넘어가지 않고 조금만 밀린다 */
    function resist(p) {
      if (p < 0) return -EDGE_MAX * (1 - 1 / (1 + (-p) * EDGE_RESIST / EDGE_MAX * 4));
      if (p > last) return last + EDGE_MAX * (1 - 1 / (1 + (p - last) * EDGE_RESIST / EDGE_MAX * 4));
      return p;
    }

    function onDown(e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (store.get("monthOpen", false)) return;
      cancelAnimationFrame(raf);  // 트윈 중이면 그 자리에서 이어받기
      raf = 0;
      drag = {
        id: e.pointerId, x: e.clientX, y: e.clientY,
        start: pos, w: width() * DRAG_PER_CARD, live: false,
        samples: [{ x: e.clientX, t: e.timeStamp }]
      };
      suppressClick = false;
    }

    function onMove(e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.x;
      var dy = e.clientY - drag.y;
      if (!drag.live) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        if (Math.abs(dy) > Math.abs(dx)) { drag = null; return; } // 세로 스크롤에 양보
        drag.live = true;
        suppressClick = true;
        stage.classList.add("is-dragging");
        try { stage.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      }
      e.preventDefault();
      drag.samples.push({ x: e.clientX, t: e.timeStamp });
      if (drag.samples.length > 6) drag.samples.shift();
      /* 카드 한 장 폭만큼 끌면 progress 1 */
      pos = resist(drag.start - dx / drag.w);
      paint();
    }

    function onUp(e) {
      if (!drag || e.pointerId !== drag.id) return;
      var wasLive = drag.live;
      var s = drag.samples;
      var v = 0;
      if (s.length > 1) {
        var a = s[0], b = s[s.length - 1];
        var dt = Math.max(1, b.t - a.t);
        if (e.timeStamp - b.t < 90) v = (b.x - a.x) / dt; // 멈췄다 놓으면 속도 0
      }
      var moved = drag.start - pos;          // + 면 오른쪽으로 끌었음(이전 날짜 방향)
      var base = Math.round(drag.start);
      drag = null;
      stage.classList.remove("is-dragging");
      if (!wasLive) return;

      var target = base;
      if (moved < -DIST_RATIO || v < -FLICK_V) target = base + 1;
      else if (moved > DIST_RATIO || v > FLICK_V) target = base - 1;
      /* 한 번에 여러 장을 크게 끌었다면 가장 가까운 카드로 */
      if (Math.abs(pos - base) > 1) target = Math.round(pos);
      animateTo(target);
    }

    function onClickCapture(e) {
      if (suppressClick) {
        e.stopPropagation();
        e.preventDefault();
        suppressClick = false;
      }
    }

    function onKey(e) {
      if (e.key === "ArrowLeft") { animateTo(state.index - 1); e.preventDefault(); }
      if (e.key === "ArrowRight") { animateTo(state.index + 1); e.preventDefault(); }
    }

    stage.addEventListener("pointerdown", onDown);
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerup", onUp);
    stage.addEventListener("pointercancel", onUp);
    stage.addEventListener("click", onClickCapture, true);
    stage.addEventListener("dragstart", function (e) { e.preventDefault(); });
    stage.addEventListener("keydown", onKey);

    paint();

    return {
      prev: function () { animateTo(state.index - 1); },
      next: function () { animateTo(state.index + 1); },
      go: animateTo,
      destroy: function () { cancelAnimationFrame(raf); }
    };
  }

  /* --- view -------------------------------------------------------------- */

  App.registerView("records", {
    title: "기록",

    unmount: function () {
      if (engine) { engine.destroy(); engine = null; }
      /* App.refresh() 도 unmount 를 거친다. 해시가 그대로면 같은 화면을 다시
         그리는 것이므로 선택 날짜를 유지하고, 탭을 떠날 때만 오늘로 되돌린다. */
      var leaving = location.hash.indexOf("#/records") !== 0;
      if (leaving) {
        state.fresh = true;
        if (store.get("monthOpen", false)) store.set("monthOpen", false);
      }
    },

    render: function (params) {
      store.seed("monthOpen", false);

      /* #/records?timeline=2026-09-21 — 그 날짜 카드에서 들어온 돌봄 타임라인.
         carousel 의 선택 날짜도 그 날짜로 맞춰 두어, 뒤로 가면 같은 카드가 가운데 온다. */
      var tlDate = params && params.query && params.query.timeline;
      if (tlDate && indexOf(tlDate) > -1) {
        state.index = indexOf(tlDate);
        state.fresh = false;
        return timelineView(days()[state.index]);
      }

      if (state.fresh !== false) { state.index = todayIndex(); state.fresh = false; }
      var list = days();
      state.index = Math.max(0, Math.min(list.length - 1, state.index));
      var day = list[state.index];
      return '<main class="screen screen--records">'
        + ui.statusbar(true)
        + head(day.date)
        + carousel()
        + summary(day)
        + ui.navbar("records", "navbar--sheet")
        + monthPicker(day.date)
        + "</main>";
    },

    mount: function (root) {
      if (!root.querySelector("[data-rc-stage]")) return;   // 타임라인 화면
      engine = createEngine(root);

      root.addEventListener("click", function (e) {
        var el = e.target.closest("[data-action]");
        if (!el) return;
        var action = el.dataset.action;

        if (action === "rc-prev") {
          engine.prev();
        } else if (action === "rc-next") {
          engine.next();
        } else if (action === "rc-timeline") {
          /* 지금 가운데 있는 카드의 날짜로 — 고정 날짜가 아니라 state 에서 읽는다 */
          App.go("#/records?timeline=" + days()[state.index].date);
        } else if (action === "open-months") {
          store.set("monthOpen", true);
          App.refresh();
        } else if (action === "close-months") {
          /* only the scrim itself closes, not a click inside the panel */
          if (e.target !== el) return;
          store.set("monthOpen", false);
          App.refresh();
        } else if (action === "pick-month") {
          var month = el.dataset.month.slice(0, 7);
          var list = days();
          var hit = -1;
          /* 그 달에 오늘이 있으면 오늘, 아니면 기록이 있는 마지막 날 */
          if (data.careToday.slice(0, 7) === month) hit = todayIndex();
          else for (var i = list.length - 1; i >= 0; i--) {
            if (list[i].date.slice(0, 7) === month && !list[i].upcoming) { hit = i; break; }
          }
          store.set("monthOpen", false);
          App.refresh();
          if (hit < 0) ui.toast(ui.monthLabel(el.dataset.month) + " 기록이 아직 없어요");
          else engine.go(hit);
        }
      });
    }
  });
})();
