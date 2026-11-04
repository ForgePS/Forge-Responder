/**
 * Live location for the hydrant map: follows the phone's GPS while the screen
 * is open (works without signal; GPS doesn't need data).
 */
import { useEffect, useState } from "react";

const GEO_OPTIONS = { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 };

/** Turn a browser position into the shape the map uses. */
export function readPosition(pos) {
  const { latitude, longitude, accuracy, heading, speed } = pos.coords;
  return {
    lat: latitude,
    lng: longitude,
    accuracy: Number.isFinite(accuracy) ? accuracy : null,
    // Heading is only meaningful while moving.
    heading: Number.isFinite(heading) && Number(speed) > 0.5 ? heading : null,
    at: pos.timestamp || Date.now(),
  };
}

export function locationErrorText(error) {
  if (error?.code === 1) return "Location is blocked. Allow location for this site in your phone's settings to see where you are.";
  if (error?.code === 3) return "Still looking for GPS. Move outside or away from tall buildings.";
  return "Couldn't get your location. Try again outside.";
}

/**
 * While `enabled`, keeps `position` updated from the GPS.
 * status: "off" | "locating" | "on" | "error"
 */
export function useLiveLocation(enabled) {
  const [position, setPosition] = useState(null);
  const [status, setStatus] = useState("off");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabled) {
      setStatus("off");
      return undefined;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("error");
      setError("This device can't share its location.");
      return undefined;
    }
    setStatus((current) => (current === "on" ? current : "locating"));
    setError("");
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition(readPosition(pos));
        setStatus("on");
        setError("");
      },
      (err) => {
        // A timeout while we already have a fix just means no new fix yet.
        if (err?.code === 3) {
          setStatus((current) => (current === "on" ? current : "locating"));
          setError(locationErrorText(err));
          return;
        }
        setStatus("error");
        setError(locationErrorText(err));
      },
      GEO_OPTIONS,
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled]);

  return { position: enabled ? position : null, status, error };
}
