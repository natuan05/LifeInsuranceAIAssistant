// Type at mount, before passive effects can restore an older URL value.
export async function typeAtSearchMount(page, id, value) {
  await page.addInitScript(({ id, value }) => {
    const observer = new MutationObserver(() => {
      const input = document.getElementById(id);
      if (!(input instanceof HTMLInputElement)) return;
      observer.disconnect();
      input.focus();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    observer.observe(document, { childList: true, subtree: true });
  }, { id, value });
}
