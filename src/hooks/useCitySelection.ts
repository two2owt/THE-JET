import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CITIES, type City } from "@/types/cities";

const STORAGE_KEY = "jet-map-selected-city";

/**
 * City selection for the map experience.
 *
 * Adding a new launch city only requires appending it to `CITIES` — this hook
 * owns persistence, the takeoff/landing transition nonce, and the reverse
 * geocoded location label, so no page-level wiring changes per city.
 */
export function useCitySelection() {
  // Initialized synchronously from localStorage so the first paint already
  // shows the user's last city (no flash of the default city).
  const [selectedCity, setSelectedCity] = useState<City>(() => {
    try {
      const savedId =
        typeof window !== "undefined"
          ? window.localStorage.getItem(STORAGE_KEY)
          : null;
      const match = savedId ? CITIES.find((c) => c.id === savedId) : undefined;
      return match ?? CITIES[0];
    } catch {
      return CITIES[0];
    }
  });

  // Increments every time the user (or geolocation) picks a city, so the
  // CityTransitionOverlay replays its animation.
  const [cityTransitionNonce, setCityTransitionNonce] = useState(0);
  // Actual city from reverse geocoding.
  const [detectedLocationName, setDetectedLocationName] = useState<
    string | null
  >(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, selectedCity.id);
    } catch {
      /* storage disabled — ignore */
    }
  }, [selectedCity]);

  const handleCityChange = useCallback((city: City) => {
    setSelectedCity(city);
    setCityTransitionNonce((n) => n + 1);
    toast.success(`Switched to ${city.name}, ${city.state}`, {
      description: "Finding deals in your area",
    });
  }, []);

  // Auto-select nearest city when geolocation detects it (no toast: the user
  // didn't ask for it).
  const handleNearestCityDetected = useCallback((city: City) => {
    setSelectedCity(city);
    setCityTransitionNonce((n) => n + 1);
  }, []);

  const handleDetectedLocationNameChange = useCallback(
    (name: string | null) => setDetectedLocationName(name),
    [],
  );

  const cityName =
    detectedLocationName || `${selectedCity.name}, ${selectedCity.state}`;

  return {
    selectedCity,
    cityName,
    cityTransitionNonce,
    detectedLocationName,
    handleCityChange,
    handleNearestCityDetected,
    handleDetectedLocationNameChange,
  };
}
