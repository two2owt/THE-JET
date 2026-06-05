import { useState, useEffect } from "react";

/**
 * Debounce a value so downstream effects only run after the user pauses.
 * @param value  The live value to debounce.
 * @param delay  Milliseconds to wait after the last change before updating.
 * @returns The debounced value.
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}
