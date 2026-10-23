export async function fetchWeatherAtTime(latitude, longitude, isoTime = "") {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { temperature: null, windSpeed: null, windDirection: null };
  }

  const target = isoTime ? new Date(isoTime) : new Date();
  const isRecent = Date.now() - target.getTime() < 2 * 60 * 60 * 1000;

  try {
    if (isRecent) {
      const url = new URL("https://api.open-meteo.com/v1/forecast");
      url.searchParams.set("latitude", String(lat));
      url.searchParams.set("longitude", String(lng));
      url.searchParams.set("current", "temperature_2m,wind_speed_10m,wind_direction_10m");
      url.searchParams.set("wind_speed_unit", "mph");
      url.searchParams.set("temperature_unit", "fahrenheit");
      const response = await fetch(url);
      const payload = await response.json();
      const current = payload.current || {};
      return {
        temperature: current.temperature_2m ?? null,
        windSpeed: current.wind_speed_10m ?? null,
        windDirection: current.wind_direction_10m ?? null,
      };
    }

    const date = target.toISOString().slice(0, 10);
    const url = new URL("https://archive-api.open-meteo.com/v1/archive");
    url.searchParams.set("latitude", String(lat));
    url.searchParams.set("longitude", String(lng));
    url.searchParams.set("start_date", date);
    url.searchParams.set("end_date", date);
    url.searchParams.set("hourly", "temperature_2m,wind_speed_10m,wind_direction_10m");
    url.searchParams.set("wind_speed_unit", "mph");
    url.searchParams.set("temperature_unit", "fahrenheit");
    const response = await fetch(url);
    const payload = await response.json();
    const hour = target.getHours();
    const index = Math.min(hour, (payload.hourly?.time?.length || 1) - 1);
    return {
      temperature: payload.hourly?.temperature_2m?.[index] ?? null,
      windSpeed: payload.hourly?.wind_speed_10m?.[index] ?? null,
      windDirection: payload.hourly?.wind_direction_10m?.[index] ?? null,
    };
  } catch {
    return { temperature: null, windSpeed: null, windDirection: null };
  }
}
