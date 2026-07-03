import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Always send Supabase email links to the production origin when running locally. */
export const getAppUrl = (): string =>
  window.location.origin.includes("localhost")
    ? "https://jet-around.com"
    : window.location.origin;

