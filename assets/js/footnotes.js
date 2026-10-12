// 각주 보강 (layouts/_partials/footer/custom.html 에서 불러온다)
//
// 1. 본문의 각주 번호에 마우스를 올리면 각주 내용을 말풍선으로 보여 준다 (나무위키 방식).
//    터치로 누르면 이동하지 않고 말풍선을 열며, 말풍선 안의 링크로 각주까지 내려간다.
//    터치 여부는 기기 단위(hover 미디어 쿼리)가 아니라 매번 누른 입력(pointerType)으로 판단한다.
//    일부 휴대폰 브라우저는 (hover: hover) 로 응답해서 기기 단위 판단이 틀린다.
// 2. 문서 끝 각주 목록의 번호 [1] 을 누르면 본문의 그 자리로 올라간다.
//    Goldmark 가 붙이는 ↩ 링크는 번호와 같은 곳을 가리키므로 첫 번째 것은 숨긴다.
(() => {
  const content = document.querySelector(".article-content");
  if (!content) return;
  const refs = content.querySelectorAll("a.footnote-ref");
  if (!refs.length) return;

  // 마지막으로 누른 입력의 종류. 탭하면 브라우저가 흉내 낸 마우스 이벤트도 뒤따르므로
  // 마우스 이벤트만 보고는 터치인지 알 수 없다.
  let lastPointer = "mouse";
  document.addEventListener("pointerdown", (e) => { lastPointer = e.pointerType; }, true);
  const isTouch = () => lastPointer === "touch" || lastPointer === "pen";

  // 테마의 smoothAnchors.ts 와 같은 방식으로 부드럽게 이동하고, 도착한 곳을 잠깐 표시한다.
  function jumpTo(hash) {
    const target = document.getElementById(decodeURI(hash.slice(1)));
    if (!target) return;
    const top = target.getBoundingClientRect().top + window.scrollY - window.innerHeight / 3;
    history.pushState({}, "", hash);
    window.scrollTo({ top: Math.max(top, 0), behavior: "smooth" });
    target.classList.remove("footnote-flash");
    void target.offsetWidth; // 같은 곳을 다시 눌러도 애니메이션이 다시 돌게 한다
    target.classList.add("footnote-flash");
  }

  // 테마의 smoothAnchors 도 같은 링크에 클릭 처리를 붙이는데(이 스크립트보다 늦게 실행됨),
  // 그쪽은 대상을 화면 맨 위에 붙인다. 먼저 붙은 이쪽이 처리하고 테마 쪽은 막는다.
  function onJumpClick(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    hide();
    jumpTo(e.currentTarget.getAttribute("href"));
  }

  // ── 2. 각주 목록 번호 → 본문 위치 ──
  content.querySelectorAll(".footnotes li[id]").forEach((li, i) => {
    const back = li.querySelector("a.footnote-backref");
    if (!back) return;
    const num = document.createElement("a");
    num.className = "footnote-number";
    num.href = back.getAttribute("href");
    num.textContent = `[${i + 1}]`;
    num.setAttribute("aria-label", `본문의 ${i + 1}번 각주 위치로`);
    num.addEventListener("click", onJumpClick);
    const first = li.firstElementChild;
    (first && first.tagName === "P" ? first : li).prepend(num, " ");
    back.classList.add("footnote-backref--dup");
  });

  // ── 1. 말풍선 ──
  const popup = document.createElement("div");
  popup.className = "footnote-popup";
  popup.setAttribute("role", "tooltip");
  popup.hidden = true;
  document.body.appendChild(popup);

  let current = null;
  let hideTimer = null;
  let openedByTouch = false;

  function contentFor(ref, withGo) {
    const li = document.getElementById(decodeURI(ref.getAttribute("href").slice(1)));
    if (!li) return null;
    const clone = li.cloneNode(true);
    clone.removeAttribute("id");
    clone.querySelectorAll(".footnote-backref, .footnote-number").forEach((el) => el.remove());
    const frag = document.createDocumentFragment();
    const label = document.createElement("span");
    label.className = "footnote-popup__label";
    label.textContent = `[${ref.textContent.trim()}]`;
    frag.append(label, ...clone.childNodes);
    if (withGo) {
      const go = document.createElement("a");
      go.className = "footnote-popup__go";
      go.href = ref.getAttribute("href");
      go.textContent = "각주로 이동";
      go.addEventListener("click", (e) => {
        e.preventDefault();
        hide();
        jumpTo(go.getAttribute("href"));
      });
      frag.append(go);
    }
    return frag;
  }

  function place(ref) {
    const r = ref.getBoundingClientRect();
    const margin = 8;
    popup.style.left = "0px";
    popup.style.top = "0px";
    const w = popup.offsetWidth;
    const h = popup.offsetHeight;
    let left = r.left + r.width / 2 - w / 2;
    left = Math.min(Math.max(left, margin), document.documentElement.clientWidth - w - margin);
    // 위쪽에 자리가 있으면 위에, 없으면 아래에 띄운다
    const above = r.top - h - margin >= 0;
    const top = above ? r.top - h - margin : r.bottom + margin;
    popup.style.left = `${left + window.scrollX}px`;
    popup.style.top = `${top + window.scrollY}px`;
  }

  function show(ref, byTouch = false) {
    clearTimeout(hideTimer);
    if (current === ref && !popup.hidden && openedByTouch === byTouch) return;
    const frag = contentFor(ref, byTouch);
    if (!frag) return;
    popup.replaceChildren(frag);
    popup.hidden = false;
    current = ref;
    openedByTouch = byTouch;
    ref.setAttribute("aria-describedby", "footnote-popup");
    popup.id = "footnote-popup";
    place(ref);
  }

  function hide() {
    clearTimeout(hideTimer);
    popup.hidden = true;
    if (current) current.removeAttribute("aria-describedby");
    current = null;
    openedByTouch = false;
  }

  function hideSoon() {
    if (openedByTouch) return; // 탭으로 연 말풍선은 다른 곳을 누를 때까지 둔다
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, 150);
  }

  // 본문 번호 → 각주, 남아 있는 ↩ → 본문도 같은 방식으로 이동한다 (터치로 누른 본문 번호는 아래에서 따로 처리)
  content.querySelectorAll(".footnotes a.footnote-backref").forEach((a) => a.addEventListener("click", onJumpClick));

  refs.forEach((ref) => {
    ref.addEventListener("click", onJumpClick);
    // 마우스일 때만. 터치에서는 pointerType 이 "touch" 라 걸러진다
    ref.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") show(ref); });
    ref.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") hideSoon(); });
    // 키보드(Tab)로 왔을 때만. 탭하면 링크에 포커스가 가는 브라우저가 있어 :focus-visible 로 가른다
    ref.addEventListener("focus", () => { if (ref.matches(":focus-visible")) show(ref); });
    ref.addEventListener("blur", hideSoon);
  });

  // 말풍선 안의 링크를 누를 수 있게, 말풍선 위에 있는 동안은 닫지 않는다
  popup.addEventListener("mouseenter", () => clearTimeout(hideTimer));
  popup.addEventListener("mouseleave", hideSoon);
  popup.addEventListener("focusin", () => clearTimeout(hideTimer));
  popup.addEventListener("focusout", hideSoon);

  // 터치로 누르면 이동하지 않고 말풍선만 연다(같은 번호를 다시 누르면 닫는다).
  // 요소에 직접 붙은 이동 처리(위의 onJumpClick, 테마의 smoothAnchors)보다 먼저 가로채야 하므로
  // document 의 캡처 단계에서 처리한다.
  document.addEventListener(
    "click",
    (e) => {
      const ref = e.target.closest && e.target.closest("a.footnote-ref");
      if (ref && content.contains(ref) && isTouch()) {
        e.preventDefault();
        e.stopPropagation();
        if (current === ref && !popup.hidden && openedByTouch) hide();
        else show(ref, true);
        return;
      }
      if (!popup.hidden && !popup.contains(e.target) && !(ref && content.contains(ref))) hide();
    },
    true
  );

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hide();
  });
  window.addEventListener("resize", () => {
    if (current && !popup.hidden) place(current);
  });
})();
