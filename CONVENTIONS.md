# 안심ON — 코드 컨벤션

Figma: `GbOXJ9itG1Zb0okYgcethZ` / Page 40 (`787:1031`)
스택: HTML + CSS + 바닐라 JS. 빌드 도구 없음, 서버 없음 — `index.html` 을 더블클릭하면 동작합니다.

## 구조

```
ansim-on/
├── index.html            앱 셸 (전부 여기 하나)
├── css/
│   ├── tokens.css        디자인 토큰 — 색·타이포·radius·그림자. 새 색이 필요하면 여기에 추가
│   ├── base.css          리셋, .screen, .statusbar
│   ├── components.css    두 화면 이상에서 쓰는 컴포넌트
│   ├── icons.css         생성 파일 — 직접 편집 금지
│   ├── app.css           앱 셸, 토스트, 빈 상태, 피커
│   └── home/list/ask/together.css   화면별 스타일
├── js/
│   ├── ui.js             렌더 헬퍼 + 공용 마크업 (statusbar/navbar/appbar/datestrip/toast)
│   ├── store.js          상태 + localStorage
│   ├── data.js           시드 데이터 (모든 화면의 초기값)
│   ├── views/*.js        화면 하나당 파일 하나
│   └── app.js            해시 라우터 + 부팅
├── assets/icons/*.svg    Figma 벡터 원본
├── assets/img/*.jpg      병실 사진
└── tools/build-icons.py  아이콘 → css/icons.css 재생성
```

**ES 모듈 금지.** `file://` 에서 `<script type="module">` 은 CORS 로 막힙니다.
전부 일반 스크립트이고 `window.App` 네임스페이스를 공유합니다.
`fetch()` 도 같은 이유로 쓸 수 없습니다 — 데이터는 `js/data.js` 에 인라인으로.

## 뷰 작성 규칙

`js/views/home.js` 가 레퍼런스입니다. **새 뷰를 쓰기 전에 반드시 읽으세요.**

```js
(function () {
  var ui = App.ui, store = App.store, data = App.data;

  App.registerView("이름", {
    title: "탭 제목",

    // 상태를 읽어 HTML 문자열을 돌려줍니다. 부작용 없이.
    render: function (params) {
      return '<main class="screen">' + ... + ui.navbar("ask") + '</main>';
    },

    // DOM 이 붙은 뒤 한 번. 이벤트는 root 에 위임하세요 (개별 노드에 붙이지 말 것).
    mount: function (root, params) {
      root.addEventListener("click", function (e) {
        var el = e.target.closest("[data-action]");
        if (!el) return;
        if (el.dataset.action === "무엇") { store.set(...); App.refresh(); }
      });
    },

    unmount: function () {}   // 타이머 등을 걸었을 때만
  });
})();
```

- 상태를 바꾼 뒤에는 `App.refresh()` 를 부르면 현재 뷰가 다시 그려집니다.
- 화면 이동은 `<a href="#/ask/list">` 또는 `App.go("#/ask/list")` — 히스토리에 쌓입니다.
- `App.replace("#/...")` 는 현재 항목을 덮어씁니다. 돌아올 필요가 없는 화면을 떠날 때
  쓰세요 (대화를 마치고 생성된 문의로 넘어갈 때처럼).
- 뒤로가기는 `ui.appbar(제목, 폴백해시)` 가 알아서 처리합니다. 실제로 있던 이전 화면으로
  돌아가고, 히스토리가 없을 때(딥링크로 바로 열었을 때)만 폴백 해시로 갑니다.
- `render` 는 문자열을 만들 뿐이므로 `mount` 에서 잡은 DOM 참조는 refresh 후 무효입니다.

### 라우트 (js/app.js)

| 해시 | 뷰 이름 |
|---|---|
| `#/home` | `home` |
| `#/records` | `records` |
| `#/ask` | `ask` |
| `#/ask/new` | `askChat` |
| `#/ask/list` | `askList` |
| `#/ask/:id` | `askDetail` (`params.id`) |
| `#/together` | `together` |

한 파일에서 여러 뷰를 등록해도 됩니다 (`js/views/ask.js` 가 ask / askChat / askList / askDetail 을 모두 등록).

### 상태

```js
store.seed(key, 초기값)   // 처음 한 번만 심음. render 맨 앞에서 호출
store.get(key, 기본값)
store.set(key, 값)        // 저장 + 구독자 통지
store.update(key, fn)     // 읽고-고쳐-쓰기
```

`localStorage` 에 `ansim-on:v1` 로 저장되며, 사용 불가 환경에서는 자동으로
메모리 전용으로 떨어집니다 (앱은 그대로 동작).

### ui.js 에서 바로 쓸 수 있는 것

| 함수 | 설명 |
|---|---|
| `ui.esc(s)` | HTML 이스케이프. **사용자 입력은 반드시 통과시킬 것** |
| `ui.icon(name, {size, button, label, action})` | 아이콘 span/button |
| `ui.LOGO`, `ui.CHAT_GLYPH` | 브랜드 SVG (인라인) |
| `ui.statusbar(onBlue)` | 상태바 |
| `ui.navbar(activeKey)` | 하단 4탭. key: `home` `records` `ask` `together` |
| `ui.appbar(title, backHref)` | 뒤로가기 앱바 |
| `ui.datestrip(days, selectedISO)` | 날짜 칩. 클릭 시 `data-action="pick-date"`, `data-date` |
| `ui.monthDays(iso)` `ui.monthLabel(iso)` `ui.dateLabel(iso)` `ui.relTime(iso, now)` | 날짜 |
| `ui.centerSelected(scroller)` | 가로 스트립에서 선택 항목을 보이게 스크롤 |
| `ui.toast(msg)` | 하단 토스트 |

### 데이터 (js/data.js)

`data.patient` `data.TODAY` `data.periods` `data.records()` `data.notices`
`data.togetherTip` `data.suggestions` `data.inquiries` `data.statusLabels`
`data.roomDays` `data.supplies` `data.levelLabels` `data.suppliesUpdatedAt`

필요한 필드가 없으면 `data.js` 에 **추가**하세요. 기존 필드 이름은 바꾸지 마세요.

## CSS 규칙

1. 인라인 스타일 금지. 하드코딩 색 금지 — `var(--...)` 만.
2. 토큰에 없는 값이 필요하면 `tokens.css` 에 Figma 출처 주석과 함께 추가.
   플로우 CSS 에 `:root` 를 다시 선언하지 마세요 (서로 덮어씁니다).
3. 두 화면 이상에서 쓰면 `components.css`, 한 화면이면 `<flow>.css`.
4. **다른 플로우와 같은 클래스 이름을 새로 만들지 마세요.** 모든 CSS 가 한 페이지에
   같이 로드됩니다. 공용 클래스를 조정해야 하면 자기 플로우 안에서 스코프를 주세요:
   `.ask .chip { ... }`
5. 하단 네비게이션은 `app.css` 가 아트보드 바닥에 고정합니다 — 뷰에서 건드리지 마세요.
6. `app.css` 의 `.app__view > .screen > * { flex: none }` 때문에 화면 안에서 남는 공간을
   채워야 하는 블록은 더 높은 특이성으로 덮어써야 합니다 (`css/ask.css`, `css/together.css` 참고).

## 아이콘

Figma 에셋 CDN 은 이 환경에서 403 입니다. `curl`/`WebFetch` 로 받지 마세요.
Plugin API 로 진짜 벡터를 뽑습니다:

1. `figma-use` 스킬 로드
2. ```js
   const page = await figma.getNodeByIdAsync("787:1031");
   await figma.setCurrentPageAsync(page);
   const n = await figma.getNodeByIdAsync("<icon node id>");
   return await n.exportAsync({ format: "SVG_STRING" });
   ```
3. `assets/icons/<name>.svg` 로 저장하고 고정 색을 `currentColor` 로 교체
4. `python3 tools/build-icons.py`
5. `ui.icon("<name>")` 로 사용

이미 있는 아이콘: `bell menu calendar message-typing home file users send check
info-circle chevron-right chevron-left chevron-down chevron-down-16 logo`

## 검증

```bash
node /tmp/claude-0/app.cjs [단계...]
```

각 단계는 셋 중 하나입니다:

- `#/ask/list` — 해당 해시로 이동
- `[data-action=send]` — 해당 셀렉터 클릭
- `shot:이름` — `/tmp/claude-0/shots/이름.png` 로 스크린샷

예: `node /tmp/claude-0/app.cjs "#/ask" "shot:a1" "[data-action=new]" "shot:a2"`

JS 에러·콘솔 에러가 있으면 마지막에 출력됩니다 (`clean` 이면 통과).
스크린샷은 Read 도구로 열어 Figma 원본과 대조하세요.
