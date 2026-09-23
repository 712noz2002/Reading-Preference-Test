/* ==========================================================================
   안심ON — 문의
   Figma: ask-1 (787:1508), ask-2 (787:1580), ask-2-1 (821:1547),
          ask-2-2 (867:1955), ask-3 (787:1616), ask-3-1 (787:1686)

   네 개의 뷰를 등록합니다.
     ask        #/ask       문의 홈          — ask-1
     askChat    #/ask/new   문의하기 대화     — ask-2 (빈 상태) + ask-2-1 (대화 중)
     askList    #/ask/list  문의목록         — ask-3
                #/ask/list?view=open  진행중인 문의 (완료되지 않은 문의)
                #/ask/list?view=past  지난 문의기록 (완료된 문의)
     askDetail  #/ask/:id   문의 진행 타임라인 — ask-2-2 (2단계) + ask-3-1 (5단계)
   ========================================================================== */

(function () {
  var ui = App.ui;
  var store = App.store;
  var data = App.data;

  var FILTERS = ["전체", "확인중", "확인완료"];

  /* 병원 답변이 도착하기까지의 연출 지연 */
  var REPLY_DELAY = 700;

  /* ask-2-1 에서 이 한 자리만 아래 간격이 33px 이다 (대본 두 번째 답변) */
  var SPACED_AT = 1;

  var replyTimer = null;

  /* 최근 문의 기록에 보여줄 최대 개수 — 나머지는 전체 문의 보기로 */
  var RECENT_LIMIT = 5;

  function seed() {
    store.seed("inquiries", data.inquiries);
    store.seed("askFilter", "전체");
    store.seed("chatLog", []);
  }

  /* --- helpers ----------------------------------------------------------- */

  function inquiries() {
    return store.get("inquiries", []).slice().sort(function (a, b) {
      return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
    });
  }

  /* --- 상태 분류 ------------------------------------------------------------
     하나의 inquiries 목록을 phase 로만 나눈다. 화면마다 따로 데이터를 두지 않는다. */

  function phaseOf(q) {
    return (data.inquiryPhase || {})[q.status] || "inProgress";
  }

  function isOpen(q) {
    return phaseOf(q) !== "completed";
  }

  var VIEWS = {
    open: { title: "진행중인 문의", test: isOpen },
    past: { title: "지난 문의기록", test: function (q) { return !isOpen(q); } }
  };

  /** 월별로 묶기 (최신 달부터) */
  function byMonth(rows) {
    var groups = [];
    var index = {};
    rows.forEach(function (q) {
      var key = String(q.createdAt).slice(0, 7);
      if (!(key in index)) {
        index[key] = groups.length;
        groups.push({ label: monthLabel(q.createdAt), rows: [] });
      }
      groups[index[key]].rows.push(q);
    });
    return groups;
  }

  function findInquiry(id) {
    var all = store.get("inquiries", []);
    for (var i = 0; i < all.length; i++) {
      if (all[i].id === id) return all[i];
    }
    return null;
  }

  /** "2026-09-08T10:12:00" -> "2026.09.08" */
  function dayLabel(iso) {
    return String(iso).slice(0, 10).replace(/-/g, ".");
  }

  /** "2026-09-08T10:12:00" -> "2026년 9월" */
  function monthLabel(iso) {
    return Number(String(iso).slice(0, 4)) + "년 " + Number(String(iso).slice(5, 7)) + "월";
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  /** Date -> "2026-09-08T10:12:00" (로컬 기준, data.js 와 같은 모양) */
  function localISO(d) {
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate())
      + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
  }

  /** Date -> "2026.08.24 10:12" (타임라인 스텝 표기) */
  function stampLabel(d) {
    return d.getFullYear() + "." + pad(d.getMonth() + 1) + "." + pad(d.getDate())
      + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  function statusPill(status) {
    var mod = status === "waiting" ? " status-pill--waiting"
      : status === "done" ? " status-pill--done" : "";
    return '<span class="status-pill' + mod + '">'
      + ui.esc(data.statusLabels[status] || status) + "</span>";
  }

  function avatar() {
    return '<span class="timeline__avatar">' + ui.CHAT_GLYPH + "</span>";
  }

  /** 이름의 두 번째 글자 — ask-3 의 "수" (김수진) */
  function initial(name) {
    return String(name || "").charAt(1) || String(name || "").charAt(0) || "?";
  }

  /** app.js 는 매번 같은 `#view` 노드를 mount 에 넘긴다 — 거기에 리스너를 달면
   *  화면을 다시 그릴 때마다 하나씩 쌓여 한 번의 클릭이 여러 번 처리된다.
   *  render 가 새로 만든 화면 노드에 달아 렌더마다 깨끗하게 버려지도록 한다. */
  function screenOf(root) {
    return root.querySelector(".screen") || root;
  }

  function emptyState(title, text) {
    return '<div class="empty">'
      + '<span class="empty__glyph">' + ui.CHAT_GLYPH + "</span>"
      + '<p class="empty__title">' + ui.esc(title) + "</p>"
      + '<p class="empty__text">' + ui.esc(text) + "</p>"
      + "</div>";
  }

  /* ==========================================================================
     문의 홈 — ask-1
     ========================================================================== */

  function askUser() {
    var p = data.patient;
    return '<header class="ask-user">'
      + '<span class="ask-user__avatar">' + ui.LOGO + "</span>"
      + '<div class="ask-user__identity">'
      + '<h1 class="ask-user__name">' + ui.esc(p.name) + " <small>님</small></h1>"
      + '<p class="ask-user__ward">' + ui.esc(p.hospital + " · " + p.ward) + "</p>"
      + "</div>"
      + '<div class="ask-user__actions">'
      + ui.icon("bell", { button: true, label: "알림", action: "ask-bell" })
      + ui.icon("menu", { button: true, label: "메뉴", action: "ask-menu" })
      + "</div></header>";
  }

  /* 겹친 말풍선 두 개 — 앞의 작은 말풍선이 뒤 말풍선의 선을 가려야 해서
     마스크 아이콘 대신 인라인 SVG 로 그린다 (색은 ask.css). */
  var BUBBLES = '<svg class="ask-entry__bubbles" viewBox="0 0 68 66" fill="none" aria-hidden="true">'
    + '<path class="ask-entry__bubble-back" d="M40 3.5C52.4 3.5 62.5 13.4 62.5 25.6C62.5 31.3 60.3 36.5 56.7 40.4L58.6 47.9L50.4 45C47.3 46.7 43.7 47.7 40 47.7C27.6 47.7 17.5 37.8 17.5 25.6C17.5 13.4 27.6 3.5 40 3.5Z"/>'
    + '<path class="ask-entry__bubble-front" d="M24.5 29.5C33 29.5 39.8 36.2 39.8 44.5C39.8 52.8 33 59.5 24.5 59.5C21.8 59.5 19.3 58.8 17.1 57.6L9.6 60.3L11.4 53.4C9.9 50.9 9.2 47.8 9.2 44.5C9.2 36.2 16 29.5 24.5 29.5Z"/>'
    + "</svg>";

  /* 비대칭 2단 — 왼쪽 새 문의하기(주 행동), 오른쪽 위아래로 진행중 / 지난 기록 */
  function askEntries() {
    return '<nav class="ask-entries" aria-label="문의 메뉴">'
      + '<a class="ask-entry ask-entry--new" href="#/ask/new">'
      + BUBBLES
      + '<span class="ask-entry__title">새 문의하기</span>'
      + '<span class="ask-entry__text">궁금한 점을 편하게<br>남기고 병원에 확인을<br>요청할 수 있어요</span>'
      + "</a>"
      + '<a class="ask-entry ask-entry--sub" href="#/ask/list?view=open">'
      + ui.icon("message-typing", { className: "ask-entry__icon" })
      + '<span class="ask-entry__title">진행중인 문의</span>'
      + "</a>"
      + '<a class="ask-entry ask-entry--sub" href="#/ask/list?view=past">'
      + ui.icon("clock-check", { className: "ask-entry__icon" })
      + '<span class="ask-entry__title">지난 문의기록</span>'
      + "</a></nav>";
  }

  function askRow(q) {
    return "<li>"
      + '<a class="ask-row" href="#/ask/' + ui.esc(q.id) + '">'
      + avatar()
      + '<span class="ask-row__body">'
      + '<span class="ask-row__title">' + ui.esc(q.subject) + "</span>"
      + '<span class="ask-row__date">' + ui.esc(dayLabel(q.createdAt)) + "</span>"
      + "</span>"
      + statusPill(q.status)
      + "</a></li>";
  }

  /** 진행 여부와 관계없이 가장 최근 문의 몇 건 — 월별로 묶고 달 사이에는 구분선 */
  function askRecent() {
    var all = inquiries();
    var rows = all.slice(0, RECENT_LIMIT);
    var body;

    if (!rows.length) {
      body = emptyState("아직 남긴 문의가 없어요", "궁금한 점이 있으면 새 문의하기로 남겨보세요.");
    } else {
      body = byMonth(rows).map(function (g, i) {
        return (i ? '<hr class="ask-recent__divider">' : "")
          + '<p class="ask-recent__month">' + ui.esc(g.label) + "</p>"
          + '<ul class="ask-recent__list">' + g.rows.map(askRow).join("") + "</ul>";
      }).join("")
        + (all.length > rows.length
          ? '<a class="ask-recent__more" href="#/ask/list">전체 문의 보기 &gt;</a>'
          : "");
    }

    return '<section class="ask-recent">'
      + '<h2 class="ask-recent__title">최근 문의 기록</h2>'
      + body
      + "</section>";
  }

  App.registerView("ask", {
    title: "문의",

    render: function () {
      seed();
      return '<main class="screen ask" data-node-id="787:1508">'
        + ui.statusbar()
        + '<div class="ask__body ask__body--scroll">'
        + askUser()
        + askEntries()
        + askRecent()
        + "</div>"
        + ui.navbar("ask", "navbar--sheet")
        + "</main>";
    },

    mount: function (root) {
      screenOf(root).addEventListener("click", function (e) {
        var el = e.target.closest("[data-action]");
        if (!el) return;
        if (el.dataset.action === "ask-bell") ui.toast("알림은 준비 중입니다.");
        else if (el.dataset.action === "ask-menu") ui.toast("메뉴는 준비 중입니다.");
      });
    }
  });

  /* ==========================================================================
     문의하기 — ask-2 (빈 상태) + ask-2-1 (대화 중)
     ========================================================================== */

  function askIntro() {
    return '<div class="ask-intro">'
      + ui.icon("logo", { className: "ask-intro__logo" })
      + '<h2 class="ask-intro__title">무엇이 궁금하신가요?</h2>'
      + '<p class="ask-intro__lede">편하게 말씀해주시면 확인해드릴게요</p>'
      + "</div>";
  }

  function suggestionList() {
    return '<ul class="suggestions">' + data.suggestions.map(function (s) {
      return "<li>"
        + '<button type="button" class="suggestion" data-suggestion data-text="' + ui.esc(s) + '">'
        + ui.esc(s) + "</button></li>";
    }).join("") + "</ul>";
  }

  /** 병원 답변 대본 — 인사 한 마디 + data.inquiries[0] 의 staff 메시지 순서대로 */
  function staffScript() {
    var out = [{ text: data.askOpeningReply }];
    data.inquiries[0].messages.forEach(function (m) {
      if (m.from !== "staff") return;
      out.push({ text: m.text, action: m.action });
    });
    return out.map(function (m, i) {
      if (i === SPACED_AT) m.spaced = true;
      return m;
    });
  }

  function bubble(msg) {
    var cls = "chat__bubble " + (msg.from === "me" ? "chat__bubble--me" : "chat__bubble--them")
      + (msg.spaced ? " chat__bubble--spaced" : "");
    if (msg.action) {
      return '<div class="' + cls + '">' + ui.esc(msg.text)
        + '<button type="button" class="chat__cta" data-action="ask-progress">'
        + ui.esc(msg.action.label) + "</button></div>";
    }
    return '<p class="' + cls + '">' + ui.esc(msg.text) + "</p>";
  }

  function composer() {
    return '<form class="composer" data-composer>'
      + '<input class="composer__field" type="text" name="text" placeholder="궁금한 점을 적어주세요"'
      + ' aria-label="궁금한 점" autocomplete="off">'
      + '<button type="submit" class="composer__send" aria-label="보내기">'
      + ui.icon("send") + "</button></form>";
  }

  function scrollToLatest(chat) {
    if (chat) chat.scrollTop = chat.scrollHeight;
  }

  /** 말풍선 하나를 상태에 담고 화면에 붙인다.
   *  빈 상태(추천 질문)에서는 대화 레이아웃이 아직 없으므로 다시 그린다. */
  function pushMessage(msg) {
    store.update("chatLog", function (log) {
      return (log || []).concat([msg]);
    });
    var chat = document.querySelector("[data-chat]");
    if (!chat) {
      App.refresh();
      return;
    }
    chat.insertAdjacentHTML("beforeend", bubble(msg));
    scrollToLatest(chat);
  }

  function scheduleReply() {
    clearTimeout(replyTimer);
    replyTimer = setTimeout(function () {
      replyTimer = null;
      if (location.hash !== "#/ask/new") return;
      var log = store.get("chatLog", []);
      var sent = log.filter(function (m) { return m.from === "staff"; }).length;
      var script = staffScript();
      var next = script[sent] || { text: data.askFallbackReply };
      pushMessage({ from: "staff", text: next.text, action: next.action, spaced: next.spaced });
    }, REPLY_DELAY);
  }

  function send(text) {
    text = String(text == null ? "" : text).trim();
    if (!text) return;
    pushMessage({ from: "me", text: text });
    scheduleReply();
  }

  /** 대화를 실제 문의로 접수한다 — 진행 타임라인이 있는 새 문의를 만든다. */
  function openProgress() {
    var log = store.get("chatLog", []);
    var first = null;
    for (var i = 0; i < log.length; i++) {
      if (log[i].from === "me") { first = log[i].text; break; }
    }
    var subject = first || "새 문의";
    var now = new Date();
    var at = stampLabel(now);
    var id = "q" + now.getTime().toString(36);

    var inquiry = {
      id: id,
      subject: subject,
      author: data.patient.guardian,
      createdAt: localISO(now),
      status: "checking",
      topic: subject,
      steps: [
        { title: "문의 접수", at: at, note: "문의 주제 : " + subject, noteStyle: "quote" },
        { title: "병원 확인중", at: at, note: "담당 간호사가 확인을 진행하고 있어요", noteStyle: "card" }
      ],
      messages: log.slice()
    };

    store.update("inquiries", function (list) {
      return [inquiry].concat(list || []);
    });
    store.set("chatLog", []);
    /* The conversation is finished and its log has been cleared, so going back
       to it would show an empty chat. Replace the entry: back from the new
       inquiry returns to wherever the user was before they started writing. */
    App.replace("#/ask/" + id);
  }

  App.registerView("askChat", {
    title: "문의하기",

    render: function () {
      seed();
      var log = store.get("chatLog", []);

      /* ask-2-1 drops the intro once the conversation starts — the log fills
         the screen on its own and scrolls up out of the app bar. */
      var body = log.length
        ? '<div class="ask__body chat" role="log" aria-label="문의 대화" data-chat>'
            + log.map(bubble).join("")
            + "</div>"
        : '<div class="ask__body">' + askIntro() + suggestionList() + "</div>";

      return '<main class="screen ask" data-node-id="' + (log.length ? "821:1547" : "787:1580") + '">'
        + ui.statusbar()
        + ui.appbar("문의하기", "#/ask")
        + body
        + composer()
        + ui.navbar("ask", "navbar--sheet")
        + "</main>";
    },

    mount: function (root) {
      var screen = screenOf(root);
      scrollToLatest(root.querySelector("[data-chat]"));

      screen.addEventListener("submit", function (e) {
        if (!e.target.closest("[data-composer]")) return;
        e.preventDefault();
        var field = e.target.querySelector(".composer__field");
        var text = field ? field.value : "";
        if (field) field.value = "";
        send(text);
      });

      screen.addEventListener("click", function (e) {
        var pick = e.target.closest("[data-suggestion]");
        if (pick) {
          send(pick.dataset.text);
          return;
        }
        var el = e.target.closest("[data-action]");
        if (el && el.dataset.action === "ask-progress") openProgress();
      });
    },

    unmount: function () {
      clearTimeout(replyTimer);
      replyTimer = null;
    }
  });

  /* ==========================================================================
     문의목록 — ask-3
     ========================================================================== */

  function matchesFilter(q, filter) {
    if (filter === "확인중") return isOpen(q);
    if (filter === "확인완료") return !isOpen(q);
    return true;
  }

  function askCard(q) {
    return "<li>"
      + '<article class="ask-card">'
      + '<span class="ask-card__avatar" aria-hidden="true">' + ui.esc(initial(q.author)) + "</span>"
      + '<div class="ask-card__body">'
      + '<div class="ask-card__head">'
      + '<h2 class="ask-card__name">' + ui.esc(q.author) + "</h2>"
      + '<span class="ask-card__sep" aria-hidden="true"></span>'
      + '<p class="ask-card__date">' + ui.esc(dayLabel(q.createdAt)) + "</p>"
      + statusPill(q.status)
      + "</div>"
      + '<p class="ask-card__subject">' + ui.esc(q.subject) + "</p>"
      + '<a class="ask-card__action" href="#/ask/' + ui.esc(q.id) + '">내용 확인</a>'
      + "</div></article></li>";
  }

  /* --- 진행중인 문의 / 지난 문의기록 ------------------------------------------ */

  function stageOf(q) {
    /* 진행 단계는 문의의 steps 에서 읽는다: 접수만 → 0, 확인중 → 1, 결과가 나옴 → 2 */
    var n = (q.steps || []).length;
    if (!isOpen(q)) return 3;
    return Math.max(0, Math.min(2, n - 1));
  }

  function openItem(q) {
    var steps = q.steps || [];
    var last = steps[steps.length - 1] || { title: "문의 접수", at: dayLabel(q.createdAt) };
    var now = stageOf(q);
    var stages = (data.inquiryStages || []).map(function (label, i) {
      var cls = i < now ? " is-done" : i === now ? " is-now" : "";
      return '<li class="ask-stage' + cls + '"' + (i === now ? ' aria-current="step"' : "") + ">"
        + '<span class="ask-stage__dot" aria-hidden="true"></span>'
        + '<span class="ask-stage__label">' + ui.esc(label) + "</span></li>";
    }).join("");

    return "<li>"
      + '<a class="ask-open" href="#/ask/' + ui.esc(q.id) + '">'
      + '<span class="ask-open__head">'
      + '<span class="ask-open__title">' + ui.esc(q.subject) + "</span>"
      + statusPill(q.status)
      + "</span>"
      + '<span class="ask-open__date">' + ui.esc(dayLabel(q.createdAt)) + " 문의</span>"
      + '<ol class="ask-stages" aria-label="진행 단계">' + stages + "</ol>"
      + '<span class="ask-open__update">'
      + '<span class="ask-open__update-label">최근 업데이트</span>'
      + ui.esc(last.title + " · " + last.at)
      + "</span>"
      + "</a></li>";
  }

  function pastRow(q) {
    var steps = q.steps || [];
    var last = steps[steps.length - 1];
    return "<li>"
      + '<a class="ask-row ask-row--past" href="#/ask/' + ui.esc(q.id) + '">'
      + avatar()
      + '<span class="ask-row__body">'
      + '<span class="ask-row__title">' + ui.esc(q.subject) + "</span>"
      + '<span class="ask-row__date">' + ui.esc(dayLabel(q.createdAt)) + " 문의"
      + (last ? " · " + ui.esc(String(last.at).slice(0, 10)) + " 답변 완료" : "") + "</span>"
      + "</span>"
      + statusPill(q.status)
      + "</a></li>";
  }

  function phaseList(key) {
    var v = VIEWS[key];
    var rows = inquiries().filter(v.test);   // 같은 inquiries 를 phase 로만 거른다
    var body;

    if (key === "open") {
      body = rows.length
        ? '<p class="ask-phase__lede">병원에서 확인하고 있거나 답변을 기다리는 문의예요.</p>'
          + '<ul class="ask-open-list">' + rows.map(openItem).join("") + "</ul>"
        : emptyState("진행중인 문의가 없어요", "새로 궁금한 점이 생기면 새 문의하기로 남겨보세요.");
    } else {
      body = rows.length
        ? '<p class="ask-phase__lede">답변이 끝난 문의는 이곳에 기록으로 보관돼요.</p>'
          + byMonth(rows).map(function (g, i) {
            return (i ? '<hr class="ask-recent__divider">' : "")
              + '<p class="ask-recent__month">' + ui.esc(g.label) + "</p>"
              + '<ul class="ask-recent__list">' + g.rows.map(pastRow).join("") + "</ul>";
          }).join("")
        : emptyState("지난 문의기록이 없어요", "답변이 끝난 문의가 이곳에 모여요.");
    }

    return '<main class="screen ask ask--phase ask--' + key + '">'
      + ui.statusbar()
      + ui.appbar(v.title, "#/ask")
      + '<div class="ask__body ask__body--scroll"><section class="ask-phase">' + body + "</section></div>"
      + ui.navbar("ask", "navbar--sheet")
      + "</main>";
  }

  App.registerView("askList", {
    title: "문의목록",

    render: function (params) {
      seed();
      var view = params && params.query && params.query.view;
      if (VIEWS[view]) return phaseList(view);

      var filter = store.get("askFilter", "전체");
      var shown = inquiries().filter(function (q) { return matchesFilter(q, filter); });

      var chips = FILTERS.map(function (f) {
        return '<button type="button" class="chip" data-action="ask-filter" data-filter="' + ui.esc(f) + '"'
          + ' aria-pressed="' + (f === filter) + '">' + ui.esc(f) + "</button>";
      }).join("");

      var list = shown.length
        ? '<ul class="ask-cards">' + shown.map(askCard).join("") + "</ul>"
        : emptyState("해당하는 문의가 없어요", "다른 상태를 선택해 보세요.");

      return '<main class="screen ask" data-node-id="787:1616">'
        + ui.statusbar()
        + ui.appbar("문의목록", "#/ask")
        + '<div class="ask__body ask__body--scroll">'
        + '<div class="chips" role="group" aria-label="문의 상태 필터">' + chips + "</div>"
        + list
        + "</div>"
        + ui.navbar("ask", "navbar--sheet")
        + "</main>";
    },

    mount: function (root) {
      if (root.querySelector(".ask--phase")) return;
      screenOf(root).addEventListener("click", function (e) {
        var el = e.target.closest("[data-action='ask-filter']");
        if (!el) return;
        store.set("askFilter", el.dataset.filter);
        App.refresh();
      });
    }
  });

  /* ==========================================================================
     문의 진행 타임라인 — ask-2-2 (2단계) / ask-3-1 (5단계)
     같은 뷰가 문의의 steps 배열 길이만큼 그려준다.
     ========================================================================== */

  function progressStep(step, isLast) {
    var dot = '<span class="progress__dot' + (isLast ? " progress__dot--lg" : "") + '" aria-hidden="true">'
      + (step.done ? ui.icon("check") : "") + "</span>";

    var note = "";
    if (step.note && step.noteStyle === "card") {
      note = '<div class="progress__card">' + avatar()
        + '<p class="progress__card-text">' + ui.esc(step.note) + "</p></div>";
    } else if (step.note) {
      var multi = step.note.length > 30 ? " progress__note--multi" : "";
      note = '<p class="progress__note' + multi + '">' + ui.esc(step.note) + "</p>";
    }

    return '<li class="progress__step">'
      + dot
      + '<h2 class="progress__label">' + ui.esc(step.title) + "</h2>"
      + '<p class="progress__time">' + ui.esc(step.at) + "</p>"
      + note
      + "</li>";
  }

  App.registerView("askDetail", {
    title: "문의 타임라인",

    render: function (params) {
      seed();
      var q = findInquiry(params && params.id);

      if (!q) {
        return '<main class="screen ask">'
          + ui.statusbar()
          + ui.appbar("문의목록", "#/ask/list")
          + '<div class="ask__body">'
          + emptyState("문의를 찾을 수 없어요", "문의목록에서 다시 선택해 주세요.")
          + "</div>"
          + ui.navbar("ask", "navbar--sheet")
          + "</main>";
      }

      var steps = q.steps || [];
      var done = q.status === "done";

      var cta = done
        ? '<a class="progress__cta" href="#/ask/new">추가 질문하기</a>'
        : '<button type="button" class="progress__cta progress__cta--muted" disabled>추가 질문하기</button>';

      return '<main class="screen ask" data-node-id="' + (done ? "787:1686" : "867:1955") + '">'
        + ui.statusbar()
        + ui.appbar(done ? "문의 타임라인" : "문의목록", "#/ask/list")
        + '<div class="ask__body ask__body--scroll">'
        + (done ? '<p class="ask-archive">' + ui.icon("clock-check", { size: 16 })
          + "답변이 완료된 문의예요 · 기록으로 보관 중</p>" : "")
        + '<section class="progress' + (steps.length <= 2 ? " progress--low" : "") + '">'
        + '<ol class="progress__steps">'
        + steps.map(function (s, i) { return progressStep(s, i === steps.length - 1); }).join("")
        + "</ol>"
        + cta
        + "</section>"
        + "</div>"
        + ui.navbar("ask", "navbar--sheet")
        + "</main>";
    }
  });
})();
