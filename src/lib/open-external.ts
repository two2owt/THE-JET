/**
 * Open an external URL in a new tab exactly once.
 *
 * `window.open(url, "_blank", "noopener")` returns `null` in several browsers
 * even when the tab *did* open (Safari, in-app webviews, some popup-blocker
 * heuristics). Treating that `null` as "blocked" and then setting
 * `window.location.href` opened the destination twice — one new tab plus the
 * current tab navigating away. Using a synthetic anchor click gives the
 * browser its normal link semantics: one navigation, no opener leak, and a
 * native popup fallback handled by the browser itself.
 */
export function openExternalUrl(url: string): void {
  if (typeof document === "undefined" || !url) return;

  // Snapshot where the user was before we hand off to the external browser.
  const restore = captureFocusAndScroll();

  // Native shells: use the system/in-app browser so the app's own webview is
  // never replaced by the destination site (users can return with one tap).
  // The platform check is synchronous so the web path keeps the user gesture
  // and never trips popup blockers.
  const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } })
    .Capacitor;
  if (cap?.isNativePlatform?.()) {
    void (async () => {
      try {
        const { Browser } = await import("@capacitor/browser");
        // `browserFinished` fires when the in-app browser is dismissed —
        // that's the moment the webview regains focus and iOS/Android may
        // have reset scroll offsets.
        const handle = await Browser.addListener("browserFinished", () => {
          void handle.remove();
          restore();
        });
        await Browser.open({ url, presentationStyle: "popover" });
      } catch {
        openInNewTab(url);
      }
    })();
    // Belt-and-braces for shells that never emit `browserFinished`.
    onReturnToApp(restore);
    return;
  }

  openInNewTab(url);
  // Web: the new tab steals focus; restore ours when the user comes back.
  onReturnToApp(restore);
}

/**
 * Capture the currently focused element and every scroll offset that matters
 * (window plus the focused element's scrollable ancestors), and return a
 * function that puts them all back.
 */
function captureFocusAndScroll(): () => void {
  const active = document.activeElement as HTMLElement | null;
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;

  // Walk up from the active element collecting scroll containers.
  const containers: Array<{ el: Element; left: number; top: number }> = [];
  let node: Element | null = active;
  while (node && node !== document.body && node !== document.documentElement) {
    if (node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth) {
      containers.push({ el: node, left: node.scrollLeft, top: node.scrollTop });
    }
    node = node.parentElement;
  }

  let done = false;
  return () => {
    if (done) return;
    done = true;
    // Wait a frame so the webview has finished its own restore pass first,
    // otherwise the platform overwrites whatever we set.
    requestAnimationFrame(() => {
      for (const c of containers) {
        if (!c.el.isConnected) continue;
        c.el.scrollLeft = c.left;
        c.el.scrollTop = c.top;
      }
      window.scrollTo({ left: scrollX, top: scrollY, behavior: "auto" });
      if (active?.isConnected && typeof active.focus === "function") {
        active.focus({ preventScroll: true });
      }
    });
  };
}

/** Run `fn` once, the first time the app becomes visible/focused again. */
function onReturnToApp(fn: () => void): void {
  const cleanup = () => {
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("pageshow", onFocus);
  };
  const run = () => {
    cleanup();
    fn();
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") run();
  };
  const onFocus = () => run();

  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onFocus);
  window.addEventListener("pageshow", onFocus);

  // Never leak listeners if the user simply never returns to this document.
  window.setTimeout(cleanup, 10 * 60 * 1000);
}

function openInNewTab(url: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
