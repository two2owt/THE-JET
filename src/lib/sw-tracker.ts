import { supabase } from "@/integrations/supabase/client";

interface SWEvent {
  event_type: string;
  sw_state?: string;
  error_message?: string;
  sw_version?: string;
  user_agent: string;
  timestamp: string;
}

/** Lazy toast import so the tracker chunk stays tiny until needed. */
async function showUpdateToast(reload: () => void) {
  try {
    const { toast } = await import("sonner");
    toast("JET update available", {
      id: "jet-pwa-update",
      duration: Infinity,
      description: "A new version is ready. Reload to get the latest features and fixes.",
      action: {
        label: "Reload",
        onClick: reload,
      },
    });
  } catch (e) {
    // Sonner may not be loaded in very early edge cases; fall back to a plain reload.
    if (import.meta.env.DEV) {
      console.warn("[SW Tracker] Could not show update toast:", e);
    }
  }
}

/**
 * Tracks service worker lifecycle events to identify users stuck on old versions
 * and surfaces a reload prompt when a production update is available.
 */
class ServiceWorkerTracker {
  private swVersion: string | null = null;
  private hadController = false;
  private updateToastShown = false;
  private userTyping = false;
  private dirtyForms = false;
  private typingTimeout: number | null = null;

  constructor() {
    if (typeof document !== "undefined") {
      this.attachFormTracking();
    }
  }

  /**
   * Determine if an element is an editable form field.
   */
  private isEditableElement(el: Element | null): boolean {
    if (!el) return false;
    const tag = el.tagName;
    return (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      (el instanceof HTMLElement && el.isContentEditable) ||
      el.getAttribute("contenteditable") === "true"
    );
  }

  /**
   * Determine if an editable element has unsaved changes.
   */
  private isElementDirty(el: Element | null): boolean {
    if (!el) return false;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      return el.value !== el.defaultValue;
    }
    if (el instanceof HTMLSelectElement) {
      return Array.from(el.options).some((opt) => opt.selected !== opt.defaultSelected);
    }
    if (el instanceof HTMLElement && el.isContentEditable) {
      return el.innerHTML !== (el.dataset.defaultContent ?? "");
    }
    return false;
  }

  /**
   * Check whether the user is currently interacting with an unsaved form field.
   */
  private hasActiveUnsavedInput(): boolean {
    const active = document.activeElement;
    return this.isEditableElement(active) && this.isElementDirty(active);
  }

  /**
   * Check whether it is safe to auto-reload the app right now.
   */
  private canAutoReloadNow(): boolean {
    return !this.userTyping && !this.dirtyForms && !this.hasActiveUnsavedInput();
  }

  /**
   * Track typing and form dirty state so auto-reload does not interrupt users
   * who are editing unsaved form fields.
   */
  private attachFormTracking() {
    const refreshDirtyState = () => {
      this.dirtyForms = this.hasActiveUnsavedInput();
    };

    const onTyping = () => {
      this.userTyping = true;
      refreshDirtyState();
      if (this.typingTimeout) {
        window.clearTimeout(this.typingTimeout);
      }
      // Keep the typing guard active briefly after the last keystroke so
      // rapid edits do not race against the controller change event.
      this.typingTimeout = window.setTimeout(() => {
        this.userTyping = false;
        refreshDirtyState();
      }, 3000);
    };

    document.addEventListener("input", onTyping, true);
    document.addEventListener("change", refreshDirtyState, true);
    document.addEventListener("focusin", refreshDirtyState, true);
    document.addEventListener("focusout", refreshDirtyState, true);
    document.addEventListener("blur", refreshDirtyState, true);
  }


  /**
   * Get current SW controlling state
   */
  private getSWState(): string {
    if (!("serviceWorker" in navigator)) return "not_supported";
    if (!navigator.serviceWorker.controller) return "no_controller";
    return navigator.serviceWorker.controller.state || "unknown";
  }

  /**
   * Log SW event to analytics
   */
  private async logEvent(eventType: string, errorMessage?: string) {
    const event: SWEvent = {
      event_type: eventType,
      sw_state: this.getSWState(),
      error_message: errorMessage,
      sw_version: this.swVersion || undefined,
      user_agent: navigator.userAgent,
      timestamp: new Date().toISOString(),
    };

    try {
      const client = supabase as unknown as {
        from: (table: string) => {
          insert: (data: unknown) => Promise<{ error: { message: string } | null }>;
        };
      };

      await client.from("analytics_events").insert({
        event_name: "sw_lifecycle",
        event_data: event,
        page_path: window.location.pathname,
        session_id: sessionStorage.getItem("analytics_session_id"),
      });
    } catch (e) {
      // Silently fail - never break the app for tracking
      if (import.meta.env.DEV) {
        console.warn("[SW Tracker] Failed to log event:", e);
      }
    }
  }

  /**
   * Register service worker with full lifecycle tracking and update prompts.
   */
  async registerWithTracking(): Promise<ServiceWorkerRegistration | null> {
    if (!("serviceWorker" in navigator)) {
      await this.logEvent("not_supported");
      return null;
    }

    // Remember if a controller was already active before registration.
    // This lets us distinguish a fresh install from a production update.
    this.hadController = !!navigator.serviceWorker.controller;

    try {
      // Register main Workbox service worker for caching
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });

      // Track initial registration
      await this.logEvent("registered");

      // Note: We do NOT auto-register the web-push service worker here.
      // Registering multiple service workers with the same scope ("/") causes controller churn
      // and can create reload loops in production.
      // Web push registers its own worker only when the user opts in (see useWebPushNotifications).

      // Listen for updates
      registration.addEventListener("updatefound", () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        this.logEvent("update_found");

        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed") {
            if (navigator.serviceWorker.controller) {
              this.logEvent("update_installed_waiting");
            } else {
              this.logEvent("first_install");
            }
          } else if (newWorker.state === "activated") {
            this.logEvent("update_activated");
          } else if (newWorker.state === "redundant") {
            this.logEvent("worker_redundant");
          }
        });

        newWorker.addEventListener("error", (e) => {
          this.logEvent("install_error", e.message || "Unknown install error");
        });
      });

      // Track controller changes and reload installed users when a new
      // production build has taken control, unless they prefer manual reloads
      // or are currently editing unsaved form fields.
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        this.logEvent("controller_changed");

        if (!this.hadController || this.updateToastShown) return;

        const autoReload = (() => {
          try {
            return localStorage.getItem("jet_auto_reload_updates") === "true";
          } catch {
            return false;
          }
        })();

        if (autoReload && this.canAutoReloadNow()) {
          this.logEvent("auto_reload_triggered");
          window.location.reload();
          return;
        }

        if (autoReload) {
          this.logEvent("auto_reload_deferred_due_to_unsaved_input");
        }

        this.updateToastShown = true;
        showUpdateToast(() => window.location.reload());
      });

      // Listen for SW messages
      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data?.type === "SW_VERSION") {
          this.swVersion = event.data.version;
          this.logEvent("version_reported");
        }
      });

      // Check for updates immediately after registration and periodically.
      setTimeout(() => this.checkForUpdates(registration), 30000);
      setInterval(() => this.checkForUpdates(registration), 5 * 60 * 1000);

      // Also check for updates every time the app returns to the foreground.
      // This is critical for installed PWA users who reopen the app.
      const visibilityHandler = () => {
        if (document.visibilityState === "visible") {
          this.checkForUpdates(registration);
        }
      };
      document.addEventListener("visibilitychange", visibilityHandler);

      return registration;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown registration error";
      await this.logEvent("registration_failed", errorMessage);
      return null;
    }
  }

  /**
   * Check for a service worker update and log stuck states.
   */
  private async checkForUpdates(registration: ServiceWorkerRegistration) {
    try {
      // Check for waiting worker (update available but not yet activated)
      if (registration.waiting) {
        this.logEvent("update_stuck_waiting");
      }

      // Ask the browser to check for a new service worker now.
      await registration.update();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown update check error";
      this.logEvent("update_check_failed", errorMessage);
    }
  }

  /**
   * Force skip waiting (call from UI "update" button).
   */
  async forceUpdate(): Promise<boolean> {
    if (!("serviceWorker" in navigator)) return false;

    try {
      const registration = await navigator.serviceWorker.ready;

      if (registration.waiting) {
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
        this.logEvent("force_update_triggered");
        return true;
      }

      this.logEvent("force_update_no_waiting");
      return false;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown force update error";
      this.logEvent("force_update_failed", errorMessage);
      return false;
    }
  }
}

export const swTracker = new ServiceWorkerTracker();
