/**
 * Haptic feedback utilities for enhanced user experience
 * Uses the Web Vibration API where available
 * Gracefully degrades on unsupported platforms
 */

export type HapticPattern =
  | "light"
  | "medium"
  | "heavy"
  | "success"
  | "warning"
  | "error"
  | "glide"
  | "soar";

const canVibrate = () =>
  typeof navigator !== "undefined" && "vibrate" in navigator;

export const isHapticSupported = async (): Promise<boolean> => canVibrate();

export const triggerHaptic = async (
  pattern: HapticPattern = "light",
): Promise<void> => {
  if (!canVibrate()) return;
  try {
    const patterns: Record<HapticPattern, number | number[]> = {
      light: 10,
      medium: 20,
      heavy: 40,
      success: [10, 50, 20],
      warning: [20, 40, 20],
      error: [40, 30, 40],
      glide: [10, 50, 10, 50, 20, 50, 20, 50, 10, 50, 10],
      soar: [10, 40, 10, 40, 20, 40, 20, 40, 40, 60, 40, 40, 20, 40, 10],
    };
    navigator.vibrate(patterns[pattern] ?? 10);
  } catch {}
};

export const triggerCustomHaptic = async (duration = 20): Promise<void> => {
  if (!canVibrate()) return;
  try {
    navigator.vibrate(duration);
  } catch {}
};

export const glideHaptic = async () => triggerHaptic("glide");
export const soarHaptic = async () => triggerHaptic("soar");

export const useHaptic = () => ({
  trigger: triggerHaptic,
  triggerCustom: triggerCustomHaptic,
  glide: glideHaptic,
  soar: soarHaptic,
  isSupported: isHapticSupported,
});
