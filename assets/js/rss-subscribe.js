// 아이콘 링크는 JavaScript가 없어도 원래 RSS 피드로 이동한다.
(() => {
  const dialog = document.querySelector('#rss-subscribe');
  if (!dialog || typeof dialog.showModal !== 'function') return;
  const input = dialog.querySelector('#rss-feed-url');
  const copy = dialog.querySelector('[data-rss-copy]');
  const status = dialog.querySelector('[data-rss-status]');
  let trigger = null;

  document.querySelectorAll('[data-rss-subscribe]').forEach((link) => {
    link.setAttribute('aria-haspopup', 'dialog');
    link.setAttribute('aria-controls', dialog.id);
    link.addEventListener('click', (event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
      event.preventDefault();
      trigger = link;
      status.textContent = '';
      dialog.showModal();
      document.documentElement.classList.add('rss-subscribe-open');
    });
  });

  // 기본 dialog 동작으로 Esc 닫기와 Tab 포커스 이동을 처리한다.
  dialog.addEventListener('close', () => {
    document.documentElement.classList.remove('rss-subscribe-open');
    if (trigger) trigger.focus({ preventScroll: true });
  });
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  copy.addEventListener('click', async () => {
    copy.disabled = true;
    try {
      await navigator.clipboard.writeText(input.value);
      if (dialog.open) status.textContent = '피드 주소를 복사했어요. RSS 리더에 붙여넣으세요.';
    } catch {
      if (dialog.open) {
        input.focus();
        input.select();
        status.textContent = '자동 복사가 안 되면 선택된 주소를 길게 누르거나 Ctrl+C로 복사하세요.';
      }
    } finally {
      copy.disabled = false;
    }
  });
})();
