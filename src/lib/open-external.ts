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
        await Browser.open({ url, presentationStyle: "popover" });
      } catch {
        openInNewTab(url);
      }
    })();
    return;
  }

  openInNewTab(url);
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
