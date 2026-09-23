/* ==========================================================================
   안심ON — UI helpers
   Plain script (no ES modules): the app has to run straight off file://,
   where module imports are blocked by CORS.
   ========================================================================== */

window.App = window.App || {};
App.views = App.views || {};

/** Register a screen. A view is { render(params) -> html, mount?(root, params),
 *  unmount?(), title? }. Defined here because the view scripts load before
 *  the router does. */
App.registerView = function (name, view) {
  App.views[name] = view;
};

App.ui = (function () {
  /* --- escaping ---------------------------------------------------------- */

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /** Tagged template that escapes every interpolation.
   *  Wrap a value in raw() to opt out (for nested markup). */
  function html(strings) {
    var values = Array.prototype.slice.call(arguments, 1);
    return strings.reduce(function (out, chunk, i) {
      var v = values[i - 1];
      if (v && v.__raw) v = v.value;
      else if (Array.isArray(v)) v = v.map(function (x) { return (x && x.__raw) ? x.value : esc(x); }).join("");
      else v = esc(v);
      return out + v + chunk;
    });
  }

  function raw(value) {
    return { __raw: true, value: value == null ? "" : String(value) };
  }

  /* --- icons ------------------------------------------------------------- */

  /** <span class="icon i-bell" data-mask> — tinted by the parent's color. */
  function icon(name, opts) {
    opts = opts || {};
    var cls = ["icon", "i-" + name];
    if (opts.size === 20) cls.push("icon--20");
    if (opts.size === 16) cls.push("icon--16");
    if (opts.className) cls.push(opts.className);
    var tag = opts.button ? "button" : "span";
    var attrs = opts.label ? ' aria-label="' + esc(opts.label) + '"' : ' aria-hidden="true"';
    if (opts.button) attrs = ' type="button"' + attrs;
    if (opts.action) attrs += ' data-action="' + esc(opts.action) + '"';
    return "<" + tag + ' class="' + cls.join(" ") + '" data-mask' + attrs + "></" + tag + ">";
  }

  /* --- brand glyphs (vectors exported from Figma) ------------------------- */

  var LOGO = '<svg viewBox="0 0 34 36" fill="none" aria-hidden="true">'
    + '<path d="M16.8898 0.000390416C7.50049 0.0633636 -0.0625828 7.72405 0.000390417 17.1133C0.0287283 21.6002 1.79827 25.6651 4.65411 28.6847L3.95196 34.3334C3.83231 35.2969 4.80209 35.9549 5.65538 35.4889L10.6492 32.7748C12.6454 33.5777 14.8243 34.0185 17.1102 34.0028C26.4995 33.9398 34.0626 26.2791 33.9996 16.8898C33.9366 7.50049 26.2759 -0.0625828 16.8866 0.000390416H16.8898ZM17.0819 29.6072C10.1202 29.6545 4.43685 24.0467 4.39277 17.085C4.34554 10.1233 9.9533 4.44 16.915 4.39592C23.8767 4.34869 29.56 9.95645 29.6041 16.9181C29.6513 23.8798 24.0435 29.5631 17.0819 29.6072Z" fill="currentColor"/>'
    + '<path d="M17 25.508C13.5711 25.508 10.4414 23.7699 8.61831 20.848C8.07989 19.9821 8.34122 18.8454 9.20711 18.3038C10.0698 17.7623 11.2097 18.0268 11.7512 18.8926C12.9005 20.7346 14.859 21.8146 17.041 21.8146C19.1695 21.802 21.1185 20.7094 22.2488 18.8926C22.7873 18.0268 23.9271 17.7654 24.793 18.3038C25.6588 18.8423 25.9202 19.9821 25.3818 20.848C23.5776 23.7416 20.4667 25.4859 17.0662 25.508C17.0441 25.508 17.0221 25.508 17 25.508Z" fill="currentColor"/></svg>';

  var CHAT_GLYPH = '<svg viewBox="0 0 21 22" fill="none" aria-hidden="true">'
    + '<path d="M10.1093 0.000233681C4.48937 0.0379259 -0.0374585 4.62318 0.000233681 10.2431C0.0171952 12.9287 1.07634 15.3617 2.78568 17.169L2.36542 20.55C2.2938 21.1267 2.87426 21.5206 3.38499 21.2417L6.37398 19.6171C7.56882 20.0977 8.87297 20.3616 10.2412 20.3521C15.8611 20.3144 20.3879 15.7292 20.3502 10.1093C20.3125 4.48937 15.7273 -0.0374585 10.1074 0.000233681H10.1093ZM10.2242 17.7212C6.05736 17.7495 2.65565 14.393 2.62926 10.2261C2.60099 6.05925 5.95748 2.65753 10.1243 2.63115C14.2912 2.60288 17.6929 5.95937 17.7193 10.1262C17.7476 14.2931 14.3911 17.6948 10.2242 17.7212Z" fill="currentColor"/>'
    + '<path d="M10.1753 15.2677C8.12293 15.2677 6.24963 14.2274 5.15844 12.4785C4.83618 11.9603 4.9926 11.2799 5.51086 10.9558C6.02725 10.6316 6.70948 10.7899 7.03363 11.3082C7.72151 12.4107 8.89374 13.0571 10.1998 13.0571C11.4738 13.0496 12.6403 12.3956 13.3169 11.3082C13.6392 10.7899 14.3214 10.6335 14.8397 10.9558C15.3579 11.278 15.5144 11.9603 15.1921 12.4785C14.1122 14.2105 12.2502 15.2546 10.2148 15.2677C10.2017 15.2677 10.1885 15.2677 10.1753 15.2677Z" fill="currentColor"/></svg>';

  /* --- shared chrome ----------------------------------------------------- */

  function statusbar(onBlue) {
    return '<div class="statusbar' + (onBlue ? " statusbar--on-blue" : "") + '">'
      + "<span>" + clockLabel() + "</span>"
      + '<span class="statusbar__glyphs">'
      + '<span class="statusbar__bars"><i></i><i></i><i></i><i></i></span>'
      + '<svg class="statusbar__wifi" viewBox="0 0 16 12" fill="none" aria-hidden="true">'
      + '<path d="M1 4.2a10 10 0 0 1 14 0M3.4 6.9a6.5 6.5 0 0 1 9.2 0M5.8 9.5a3 3 0 0 1 4.4 0M8 11.4h.01"'
      + ' stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'
      + '<span class="statusbar__battery"></span>'
      + "</span></div>";
  }

  /* The artboard keeps the design's 9:41 rather than the visitor's clock,
     so screenshots of the prototype match the Figma frames. */
  function clockLabel() {
    return "9:41";
  }

  var NAV = [
    { key: "home", label: "홈", icon: "home", href: "#/home" },
    { key: "records", label: "기록", icon: "file", href: "#/records" },
    { key: "ask", label: "문의", icon: "message-typing", href: "#/ask" },
    { key: "together", label: "함께ON", icon: "users", href: "#/together" }
  ];

  function navbar(active, modifier) {
    var items = NAV.map(function (n) {
      var cur = n.key === active ? ' aria-current="page"' : "";
      return '<a class="navbar__item" href="' + n.href + '"' + cur + ">"
        + icon(n.icon) + "<span>" + n.label + "</span></a>";
    }).join("");
    return '<nav class="navbar' + (modifier ? " " + modifier : "") + '" aria-label="주요 메뉴">' + items + "</nav>";
  }

  /** `fallbackHref` is only used when there is no in-app history to go back to
   *  — e.g. the prototype was opened straight on a deep link. Otherwise the
   *  arrow returns to whatever screen the user actually came from. */
  function appbar(title, fallbackHref) {
    return '<header class="appbar">'
      + '<button type="button" class="appbar__back" data-action="app-back"'
      + ' data-fallback="' + esc(fallbackHref || "#/home") + '" aria-label="뒤로">'
      + icon("chevron-left") + "</button>"
      + '<h1 class="appbar__title">' + esc(title) + "</h1>"
      + '<span class="appbar__spacer" aria-hidden="true"></span>'
      + "</header>";
  }

  /* --- dates ------------------------------------------------------------- */

  var DOW = ["일", "월", "화", "수", "목", "금", "토"];

  function parseISO(iso) {
    var p = String(iso).split("-").map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  }

  function toISO(date) {
    return date.getFullYear() + "-"
      + String(date.getMonth() + 1).padStart(2, "0") + "-"
      + String(date.getDate()).padStart(2, "0");
  }

  function dowLabel(iso) {
    return DOW[parseISO(iso).getDay()];
  }

  /** Every day of the month that `iso` falls in. */
  function monthDays(iso) {
    var d = parseISO(iso);
    var last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    var out = [];
    for (var i = 1; i <= last; i++) {
      out.push(toISO(new Date(d.getFullYear(), d.getMonth(), i)));
    }
    return out;
  }

  function monthLabel(iso) {
    var d = parseISO(iso);
    return d.getFullYear() + "년 " + (d.getMonth() + 1) + "월";
  }

  function dateLabel(iso) {
    var d = parseISO(iso);
    return (d.getMonth() + 1) + "월 " + d.getDate() + "일";
  }

  /** "3시간 전" / "어제 오전 11:57" / "2026.09.08" */
  function relTime(iso, now) {
    var then = new Date(iso);
    var mins = Math.round(((now || new Date()) - then) / 60000);
    if (mins < 1) return "방금 전";
    if (mins < 60) return mins + "분 전";
    if (mins < 60 * 24) return Math.round(mins / 60) + "시간 전";
    if (mins < 60 * 48) {
      var h = then.getHours();
      return "어제 " + (h < 12 ? "오전 " + (h || 12) : "오후 " + (h === 12 ? 12 : h - 12))
        + ":" + String(then.getMinutes()).padStart(2, "0");
    }
    return then.getFullYear() + "." + String(then.getMonth() + 1).padStart(2, "0")
      + "." + String(then.getDate()).padStart(2, "0");
  }

  /** A row of day chips. `days` = [iso], marks the selected one. */
  function datestrip(days, selectedISO) {
    return '<ol class="datestrip">' + days.map(function (iso) {
      var d = parseISO(iso);
      var cls = "datestrip__day";
      if (d.getDay() === 6) cls += " datestrip__day--sat";
      if (d.getDay() === 0) cls += " datestrip__day--sun";
      var cur = iso === selectedISO ? ' aria-current="date"' : "";
      return '<li><button type="button" class="' + cls + '" data-action="pick-date" data-date="' + iso + '"' + cur + ">"
        + '<span class="datestrip__num">' + d.getDate() + "</span>"
        + '<span class="datestrip__dow">' + DOW[d.getDay()] + "</span>"
        + "</button></li>";
    }).join("") + "</ol>";
  }

  /* --- misc -------------------------------------------------------------- */

  /** Scroll a horizontal strip so the marked child sits in view. */
  function centerSelected(scroller, selector) {
    if (!scroller) return;
    var el = scroller.querySelector(selector || "[aria-current]");
    if (!el) return;
    scroller.scrollLeft = el.offsetLeft - (scroller.clientWidth - el.offsetWidth) / 2;
  }

  /** Brief confirmation message at the bottom of the screen. */
  function toast(message) {
    var host = document.querySelector(".app");
    if (!host) return;
    var prev = host.querySelector(".toast");
    if (prev) prev.remove();
    var el = document.createElement("div");
    el.className = "toast";
    el.setAttribute("role", "status");
    el.textContent = message;
    host.appendChild(el);
    requestAnimationFrame(function () { el.classList.add("is-in"); });
    setTimeout(function () {
      el.classList.remove("is-in");
      setTimeout(function () { el.remove(); }, 220);
    }, 2000);
  }

  return {
    esc: esc, html: html, raw: raw,
    icon: icon, LOGO: LOGO, CHAT_GLYPH: CHAT_GLYPH,
    statusbar: statusbar, navbar: navbar, appbar: appbar, NAV: NAV,
    parseISO: parseISO, toISO: toISO, dowLabel: dowLabel, monthDays: monthDays,
    monthLabel: monthLabel, dateLabel: dateLabel, relTime: relTime,
    datestrip: datestrip, centerSelected: centerSelected, toast: toast
  };
})();
