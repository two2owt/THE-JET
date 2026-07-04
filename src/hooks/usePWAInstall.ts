import { useState, useEffect, useCallback } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "pwa-install-dismissed";

export const usePWAInstall = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [justInstalled, setJustInstalled] = useState(false);

  useEffect(() => {
    // Detect iOS
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(iOS);
    
    // Detect mobile
    const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    setIsMobile(mobile);

    // Check if already installed (standalone mode)
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || 
                         (navigator as any).standalone === true;
    
    if (isStandalone) {
      setIsInstalled(true);
      return;
    }

    // Check if user has permanently dismissed the install prompt.
    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (dismissedAt) {
      return;
    }

    // For iOS, we can't detect beforeinstallprompt, so show manual instructions
    if (iOS && mobile) {
      // Delay showing the prompt for better UX
      const timer = setTimeout(() => {
        setIsInstallable(true);
        setShowPrompt(true);
      }, 3000);
      return () => clearTimeout(timer);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      // Capture the event for later use - browser will show native prompt when we call prompt()
      // Note: preventDefault() defers the native banner, allowing us to show a custom prompt
      // The browser warning is expected - we'll call prompt() from our custom UI
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      
      // Delay showing the prompt for better UX
      setTimeout(() => {
        setIsInstallable(true);
        setShowPrompt(true);
      }, 3000);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      setShowPrompt(false);
      setDeferredPrompt(null);
      setJustInstalled(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const installApp = useCallback(async () => {
    if (!deferredPrompt) return false;

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === "accepted") {
        setIsInstalled(true);
        setIsInstallable(false);
        setShowPrompt(false);
        setJustInstalled(true);
      }
      
      setDeferredPrompt(null);
      return outcome === "accepted";
    } catch (error) {
      console.error("Error installing PWA:", error);
      return false;
    }
  }, [deferredPrompt]);

  const dismissPrompt = useCallback(() => {
    setShowPrompt(false);
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
  }, []);

  // Sync dismissal state across tabs via the storage event so the prompt hides
  // in other open windows as soon as a user dismisses it anywhere.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === DISMISS_KEY && e.newValue) {
        setShowPrompt(false);
        setIsInstallable(false);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const clearJustInstalled = useCallback(() => {
    setJustInstalled(false);
  }, []);

  return {
    isInstallable,
    isInstalled,
    isIOS,
    isMobile,
    showPrompt,
    justInstalled,
    installApp,
    dismissPrompt,
    clearJustInstalled,
  };
};
