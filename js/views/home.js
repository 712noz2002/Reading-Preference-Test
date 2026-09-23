/* ==========================================================================
   안심ON — 홈
   Figma: home-1 (787:1844), home-2 (873:4795), home-2-1 (787:1939)
   The three frames are one screen in two tab states, plus the read state of
   the notice cards, so they live in a single view here.
   ========================================================================== */

(function () {
  var ui = App.ui;
  var store = App.store;
  var data = App.data;

  var TABS = [
    { key: "flow", label: "돌봄 흐름" },
    { key: "checks", label: "확인할 내용" }
  ];

  var FILTERS = ["전체", "진료", "면회"];

  function seed() {
    store.seed("notices", data.notices);
    store.seed("records", data.records());
    store.seed("homeTab", "flow");
    store.seed("homeFilter", "전체");
    store.seed("selectedDate", data.TODAY);
    store.seed("menuOpen", false);
  }

  /* --- pieces ------------------------------------------------------------ */

  function hero(tab) {
    var p = data.patient;
    var tip = data.togetherTip;
    var unread = store.get("notices", []).filter(function (n) { return !n.read; }).length;

    var tabsCls = "tabs" + (tab === "checks" ? " tabs--checks" : "");
    var tabs = TABS.map(function (t) {
      return '<button type="button" class="tab" role="tab" data-action="tab" data-tab="' + t.key + '"'
        + ' aria-selected="' + (t.key === tab) + '">' + t.label + "</button>";
    }).join("");

    return '<header class="hero">'
      + ui.statusbar(true)
      + '<div class="hero__top">'
      + '<span class="hero__avatar">' + ui.LOGO + "</span>"
      + '<div class="hero__identity">'
      + '<p class="hero__ward">' + ui.esc(p.hospital + " · " + p.ward) + "</p>"
      + '<h1 class="hero__name">' + ui.esc(p.name) + " <small>님</small>" + ui.icon("chevron-right") + "</h1>"
      + "</div>"
      + '<div class="hero__actions">'
      + ui.icon("bell", { button: true, label: "알림" + (unread ? " " + unread + "건" : ""), action: "go-checks" })
      + ui.icon("menu", { button: true, label: "메뉴", action: "menu" })
      + "</div></div>"

      + '<div class="quick-actions">'
      + '<button type="button" class="quick-action" data-action="visit">'
      + ui.icon("calendar", { size: 20 }) + "면회 예약</button>"
      + '<a class="quick-action" href="#/ask/new">' + ui.icon("message-typing", { size: 20 }) + "문의하기</a>"
      + "</div>"

      + '<a class="hero-card" href="#/together">'
      + '<span class="hero-card__body">'
      + '<span class="hero-card__title">' + ui.esc(tip.title) + "</span>"
      + '<span class="hero-card__text">' + ui.esc(tip.text).replace(/\n/g, "<br>") + "</span>"
      + "</span>" + ui.icon("chevron-right") + "</a>"

      + '<nav class="' + tabsCls + '" role="tablist" aria-label="홈 보기 전환">' + tabs + "</nav>"
      + "</header>";
  }

  function flowPanel() {
    var iso = store.get("selectedDate", data.TODAY);
    var all = store.get("records", {});
    var entries = all[iso] || [];
    var days = ui.monthDays(iso);

    var body;
    if (!entries.length) {
      body = emptyState(
        iso > data.TODAY ? "아직 기록이 없어요" : "이 날은 기록이 없어요",
        iso > data.TODAY ? "돌봄이 끝나면 이곳에 순서대로 올라옵니다." : "다른 날짜를 선택해 보세요."
      );
    } else {
      body = '<div class="timeline">' + groupsFor(entries)
        + '<a class="timeline__more" href="#/records">기록 전체 보기 &gt;</a></div>';
    }

    return '<section class="sheet" role="tabpanel" aria-label="돌봄 흐름">'
      + '<h2 class="sheet__title">' + ui.monthLabel(iso) + "</h2>"
      + '<div class="u-scroll-x" data-strip>' + ui.datestrip(days, iso) + "</div>"
      + body
      + "</section>";
  }

  function groupsFor(entries) {
    return data.periods.map(function (period) {
      var rows = entries.filter(function (e) { return e.period === period.key; });
      if (!rows.length) return "";
      return '<article class="timeline__group">'
        + '<header class="timeline__head">'
        + '<span class="timeline__dot" aria-hidden="true"></span>'
        + '<h3 class="timeline__label">' + ui.esc(period.label) + "</h3>"
        + '<p class="timeline__time">' + ui.esc(period.time) + "</p>"
        + "</header>"
        + rows.map(function (r) {
          return '<a class="timeline__card" href="#/records">'
            + '<span class="timeline__avatar">' + ui.CHAT_GLYPH + "</span>"
            + "<span><span class=\"timeline__card-title\">" + ui.esc(r.title) + "</span>"
            + '<span class="timeline__card-time">' + ui.esc(r.at) + " 기록</span></span></a>";
        }).join("")
        + "</article>";
    }).join("");
  }

  function checksPanel() {
    var filter = store.get("homeFilter", "전체");
    var notices = store.get("notices", []);
    var shown = notices.filter(function (n) { return filter === "전체" || n.kind === filter; });

    var chips = FILTERS.map(function (f) {
      return '<button type="button" class="chip" data-action="filter" data-filter="' + f + '"'
        + ' aria-pressed="' + (f === filter) + '">' + f + "</button>";
    }).join("");

    var list = shown.length
      ? '<ul class="notice-list">' + shown.map(noticeCard).join("") + "</ul>"
      : emptyState("해당하는 알림이 없어요", "다른 유형을 선택해 보세요.");

    return '<section class="sheet sheet--checks" role="tabpanel" aria-label="확인할 내용">'
      + '<div class="u-scroll-x"><div class="chips" role="group" aria-label="유형 필터">' + chips + "</div></div>"
      + list
      + "</section>";
  }

  function noticeCard(n) {
    return "<li>"
      + '<article class="notice' + (n.read ? " notice--read" : "") + '">'
      + '<span class="notice__avatar" aria-hidden="true">' + ui.CHAT_GLYPH + "</span>"
      + '<div class="notice__body">'
      + '<div class="notice__meta">'
      + '<h3 class="notice__title">' + ui.esc(n.title) + "</h3>"
      + '<p class="notice__stamp"><span class="notice__dot" aria-hidden="true"></span>'
      + ui.esc(ui.relTime(n.at, new Date(data.TODAY + "T09:30:00"))) + "</p>"
      + "</div>"
      + '<p class="notice__text">' + ui.esc(n.text).replace(/\n/g, "<br>") + "</p>"
      + '<button type="button" class="notice__action" data-action="read" data-id="' + n.id + '"'
      + (n.read ? " disabled" : "") + ">" + (n.read ? "확인함" : "내용 확인") + "</button>"
      + "</div></article></li>";
  }

  function menuSheet() {
    if (!store.get("menuOpen", false)) return "";
    return '<div class="picker" data-action="close-menu">'
      + '<div class="picker__panel">'
      + '<p class="picker__title">메뉴</p>'
      + '<div class="menu-list">'
      + '<button type="button" class="menu-list__item" data-action="soon">알림 설정</button>'
      + '<button type="button" class="menu-list__item" data-action="soon">보호자 정보</button>'
      + '<button type="button" class="menu-list__item menu-list__item--danger" data-action="reset">'
      + '처음 상태로 되돌리기</button>'
      + "</div></div></div>";
  }

  function emptyState(title, text) {
    return '<div class="empty">'
      + '<span class="empty__glyph">' + ui.CHAT_GLYPH + "</span>"
      + '<p class="empty__title">' + ui.esc(title) + "</p>"
      + '<p class="empty__text">' + ui.esc(text) + "</p>"
      + "</div>";
  }

  /* --- view -------------------------------------------------------------- */

  App.registerView("home", {
    title: "홈",

    /* The menu sheet lives in the store so a refresh keeps it open, but it
       should not still be open when the user comes back to 홈 later. */
    unmount: function () {
      if (store.get("menuOpen", false)) store.set("menuOpen", false);
    },

    render: function () {
      seed();
      var tab = store.get("homeTab", "flow");
      return '<main class="screen" data-node-id="787:1844">'
        + hero(tab)
        + (tab === "flow" ? flowPanel() : checksPanel())
        + ui.navbar("home")
        + menuSheet()
        + "</main>";
    },

    mount: function (root) {
      ui.centerSelected(root.querySelector("[data-strip]"));

      root.addEventListener("click", function (e) {
        var el = e.target.closest("[data-action]");
        if (!el) return;
        var action = el.dataset.action;

        if (action === "tab") {
          store.set("homeTab", el.dataset.tab);
          App.refresh();
        } else if (action === "go-checks") {
          store.set("homeTab", "checks");
          App.refresh();
        } else if (action === "filter") {
          store.set("homeFilter", el.dataset.filter);
          App.refresh();
        } else if (action === "pick-date") {
          store.set("selectedDate", el.dataset.date);
          App.refresh();
        } else if (action === "read") {
          var id = el.dataset.id;
          var target = null;
          store.update("notices", function (list) {
            return list.map(function (n) {
              if (n.id !== id) return n;
              target = n;
              return Object.assign({}, n, { read: true });
            });
          });
          if (target && target.goto) App.go(target.goto);
          else { App.refresh(); ui.toast("확인 처리했습니다."); }
        } else if (action === "visit") {
          ui.toast("면회 예약은 준비 중입니다.");
        } else if (action === "menu") {
          store.set("menuOpen", true);
          App.refresh();
        } else if (action === "close-menu") {
          if (e.target !== el) return;
          store.set("menuOpen", false);
          App.refresh();
        } else if (action === "soon") {
          store.set("menuOpen", false);
          App.refresh();
          ui.toast("준비 중입니다.");
        } else if (action === "reset") {
          if (confirm("입력한 내용을 모두 지우고 처음 상태로 되돌릴까요?")) store.reset();
        }
      });
    }
  });
})();
