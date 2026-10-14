// 휴대폰 목차 (layouts/_partials/footer/custom.html 에서 불러온다)
//
// 테마는 1024px 미만에서 본문 위에 접이식 목차 상자를 그리는데, 휴대폰에서는 본문 카드 안에
// 그림자 진 상자가 하나 더 떠 보이고 펼치면 게임 정보와 본문을 한 화면 넘게 밀어낸다.
// 그래서 그 상자는 custom.scss 에서 숨기고, 대신 오른쪽 아래 "목차" 버튼으로 하단 시트를 연다.
// 시트 내용은 오른쪽 사이드바 목차(#TableOfContents)를 복제해 쓰고, 지금 읽는 절을 표시한다.
// 1600px 이상에서는 버튼을 CSS 로 숨기고, 본문 오른쪽 여백의 고정 목차만 보인다 (custom.scss).
// 목차 항목을 눌렀을 때의 이동(맨 아래)은 오른쪽 고정 목차에도 함께 적용한다. 주소는 바꾸지 않는다.
(() => {
  const source = document.querySelector("#TableOfContents");
  const content = document.querySelector(".article-content");
  if (!source || !content) return;

  const headings = [...content.querySelectorAll("h2[id], h3[id], h4[id]")];
  if (!headings.length) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "toc-fab";
  button.setAttribute("aria-haspopup", "dialog");
  button.innerHTML =
    '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
    '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/></svg><span>목차</span>';

  const backdrop = document.createElement("div");
  backdrop.className = "toc-sheet-backdrop";

  const sheet = document.createElement("div");
  sheet.className = "toc-sheet";
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.setAttribute("aria-label", "목차");
  sheet.innerHTML = '<div class="toc-sheet-header"><span>목차</span><button type="button" class="toc-sheet-close" aria-label="닫기">&times;</button></div>';

  // 복제본은 id 를 지워 원본 #TableOfContents (테마 스크롤스파이 대상) 와 겹치지 않게 한다
  const nav = source.cloneNode(true);
  nav.removeAttribute("id");
  nav.classList.add("toc-sheet-nav");
  nav.querySelectorAll(".active-class").forEach((li) => li.classList.remove("active-class"));
  sheet.appendChild(nav);

  document.body.append(button, backdrop, sheet);

  // 처음에는 본문 첫 제목에 닿아야 버튼을 보였는데, 도입부가 긴 글에서는
  // 첫 화면에 목차가 어디에도 없어 기능이 사라진 것처럼 보였다. 처음부터 보인다.
  button.classList.add("is-visible");

  // 화면 위쪽 1/4 지점을 지난 마지막 제목을 "지금 읽는 절"로 본다
  function markCurrent() {
    const line = window.innerHeight / 4;
    let current = null;
    for (const h of headings) {
      if (h.getBoundingClientRect().top <= line) current = h;
      else break;
    }
    nav.querySelectorAll("li").forEach((li) => li.classList.remove("active-class"));
    if (!current) return null;
    const link = nav.querySelector(`a[href="#${CSS.escape(current.id)}"]`);
    if (!link) return null;
    link.parentElement.classList.add("active-class");
    return link;
  }

  let lastFocus = null;
  function open() {
    lastFocus = document.activeElement;
    const link = markCurrent();
    document.documentElement.classList.add("toc-sheet-open");
    sheet.classList.add("is-open");
    backdrop.classList.add("is-open");
    if (link) {
      // 지금 절이 시트 가운데쯤 오게 시트 안쪽만 스크롤한다
      nav.scrollTop = link.offsetTop - nav.clientHeight / 2;
    }
    sheet.querySelector(".toc-sheet-close").focus({ preventScroll: true });
  }
  function close() {
    document.documentElement.classList.remove("toc-sheet-open");
    sheet.classList.remove("is-open");
    backdrop.classList.remove("is-open");
    if (lastFocus) lastFocus.focus({ preventScroll: true });
  }

  button.addEventListener("click", open);
  backdrop.addEventListener("click", close);
  sheet.querySelector(".toc-sheet-close").addEventListener("click", close);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && sheet.classList.contains("is-open")) close();
  });

  // 목차 항목을 누르면 300ms 안에 그 절로 간다. 오른쪽 고정 목차와 하단 시트 모두.
  // 테마(smoothAnchors.ts)는 브라우저 기본 부드러운 스크롤을 쓰는데, 긴 글에서는 이동 거리에
  // 비례해 1.5초가량 걸려 느렸다 (2026-10-14 실측: 14,000px 이동에 약 1.5초).
  // 테마가 각 링크에 붙인 처리보다 먼저 받으려고 문서 단위 capture 로 가로챈다.
  // 동작 줄이기 설정이 켜져 있으면 애니메이션 없이 바로 간다.
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let scrollAnim = 0;

  function scrollToY(top) {
    cancelAnimationFrame(scrollAnim);
    const start = window.scrollY;
    const distance = Math.max(top, 0) - start;
    if (reduceMotion.matches || Math.abs(distance) < 2) {
      window.scrollTo(0, start + distance);
      return;
    }
    const duration = 300;
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min((now - t0) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // 처음에 빠르고 끝에서 천천히 멈춘다
      window.scrollTo(0, start + distance * eased);
      if (t < 1) scrollAnim = requestAnimationFrame(step);
    };
    scrollAnim = requestAnimationFrame(step);
  }

  document.addEventListener("click", (e) => {
    const link = e.target.closest(".toc-nav a[href^='#']");
    if (!link) return;
    e.preventDefault();
    e.stopPropagation();
    const target = document.getElementById(decodeURI(link.getAttribute("href").slice(1)));
    // 시트에서 눌렀으면 먼저 닫아 스크롤 잠금을 푼 뒤 움직인다
    if (sheet.contains(link)) close();
    if (!target) return;
    // 주소에 #절이름 을 붙이지 않는다. 소제목이 한국어라 주소창과 복사한 링크에
    // #%ED%8C%90%EA%B2%B0 같은 문자열이 길게 붙었고, 뒤로 가기가 절마다 한 칸씩 걸렸다.
    scrollToY(target.getBoundingClientRect().top + window.scrollY - 16);
  }, true);
})();
