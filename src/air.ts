/**
 * Air pollution expressed as cigarettes.
 *
 * Berkeley Earth's rule of thumb: breathing 22 µg/m³ of PM2.5 for a day has
 * roughly the same mortality effect as smoking one cigarette. Their memo's
 * own examples fit it: China's 52 µg/m³ average -> 2.4 cigarettes/day, and
 * Delhi at 547 µg/m³ -> about 25.
 * https://berkeleyearth.org/air-pollution-and-cigarette-equivalence/
 *
 * It's a way to make the harm tangible, not a medical equivalence.
 */

export const PM25_PER_CIGARETTE = 22;

/** WHO 2021 guideline for 24-hour PM2.5. */
export const WHO_24H_PM25 = 15;

export function cigarettesPerDay(pm25DailyMean: number): number {
  if (!Number.isFinite(pm25DailyMean) || pm25DailyMean < 0) {
    throw new RangeError(`PM2.5 must be a non-negative number, got ${pm25DailyMean}`);
  }
  return pm25DailyMean / PM25_PER_CIGARETTE;
}

/** "about 2 cigarettes", "about half a cigarette", "less than a quarter of a cigarette". */
export function describeCigarettes(n: number): string {
  if (n < 0.25) return 'less than a quarter of a cigarette';
  if (n < 0.75) return 'about half a cigarette';
  if (n < 1.5) return 'about 1 cigarette';
  return `about ${Math.round(n)} cigarettes`;
}

/** CPCB's National AQI bands for 24-hour PM2.5 (µg/m³). */
export const AQI_BANDS = [
  { max: 30, label: 'Good' },
  { max: 60, label: 'Satisfactory' },
  { max: 90, label: 'Moderate' },
  { max: 120, label: 'Poor' },
  { max: 250, label: 'Very poor' },
  { max: Infinity, label: 'Severe' },
] as const;
export type AqiLabel = (typeof AQI_BANDS)[number]['label'];

export function aqiBand(pm25: number): AqiLabel {
  return AQI_BANDS.find((b) => pm25 <= b.max)?.label ?? 'Severe';
}

export function mean(xs: readonly (number | null)[]): number | null {
  const vals = xs.filter((x): x is number => x !== null && Number.isFinite(x));
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

export interface Hourly {
  time: string[];
  pm25: (number | null)[];
}

export interface CityAir {
  /** Mean of the last 24 hours: what you actually breathed. */
  last24h: number | null;
  /** Mean of the next 24 hours and the 24 after that. */
  forecast: [number | null, number | null];
  /** Worst forecast hour in the next 48 hours. */
  peak: { time: string; pm25: number } | null;
  /** Hourly series for the next 48 hours, for charting. */
  next48: Hourly;
}

/**
 * Splits an hourly series fetched with past_hours=24 and forecast_hours=48
 * into the last day, the next two days and the peak.
 */
export function summarise(h: Hourly, nowIndex = 24): CityAir {
  const past = h.pm25.slice(0, nowIndex);
  const future = h.pm25.slice(nowIndex, nowIndex + 48);
  let peak: CityAir['peak'] = null;
  future.forEach((v, k) => {
    if (v !== null && (peak === null || v > peak.pm25)) {
      peak = { time: h.time[nowIndex + k] ?? '', pm25: v };
    }
  });
  return {
    last24h: mean(past),
    forecast: [mean(future.slice(0, 24)), mean(future.slice(24, 48))],
    peak,
    next48: { time: h.time.slice(nowIndex, nowIndex + 48), pm25: future },
  };
}

export interface City {
  name: string;
  lat: number;
  lon: number;
}

export const CITIES: readonly City[] = [
  { name: 'Delhi', lat: 28.61, lon: 77.21 },
  { name: 'Mumbai', lat: 19.08, lon: 72.88 },
  { name: 'Bengaluru', lat: 12.97, lon: 77.59 },
  { name: 'Kolkata', lat: 22.57, lon: 88.36 },
  { name: 'Chennai', lat: 13.08, lon: 80.27 },
  { name: 'Hyderabad', lat: 17.39, lon: 78.49 },
  { name: 'Ahmedabad', lat: 23.02, lon: 72.57 },
  { name: 'Pune', lat: 18.52, lon: 73.86 },
  { name: 'Jaipur', lat: 26.91, lon: 75.79 },
  { name: 'Lucknow', lat: 26.85, lon: 80.95 },
  { name: 'Kanpur', lat: 26.45, lon: 80.33 },
  { name: 'Patna', lat: 25.59, lon: 85.14 },
  { name: 'Chandigarh', lat: 30.73, lon: 76.78 },
  { name: 'Guwahati', lat: 26.14, lon: 91.74 },
  { name: 'Bhopal', lat: 23.26, lon: 77.41 },
  { name: 'Nagpur', lat: 21.15, lon: 79.09 },
  { name: 'Indore', lat: 22.72, lon: 75.86 },
  { name: 'Varanasi', lat: 25.32, lon: 82.97 },
  { name: 'Bhubaneswar', lat: 20.3, lon: 85.82 },
  { name: 'Visakhapatnam', lat: 17.69, lon: 83.22 },
  { name: 'Kochi', lat: 9.93, lon: 76.27 },
  { name: 'Thiruvananthapuram', lat: 8.52, lon: 76.94 },
  { name: 'Srinagar', lat: 34.08, lon: 74.8 },
];

const API = 'https://air-quality-api.open-meteo.com/v1/air-quality';

/** One request for every city: 24 hours back, 48 forward, Indian time. */
export function requestUrl(cities: readonly City[]): string {
  const p = new URLSearchParams({
    latitude: cities.map((c) => c.lat).join(','),
    longitude: cities.map((c) => c.lon).join(','),
    hourly: 'pm2_5',
    past_hours: '24',
    forecast_hours: '48',
    timezone: 'Asia/Kolkata',
  });
  return `${API}?${p}`;
}

interface ApiLocation {
  hourly: { time: string[]; pm2_5: (number | null)[] };
}

export async function fetchCities(
  cities: readonly City[] = CITIES,
  fetchFn: typeof fetch = fetch,
): Promise<{ city: City; air: CityAir }[]> {
  const res = await fetchFn(requestUrl(cities));
  if (!res.ok) throw new Error(`Air quality service returned ${res.status}`);
  const body: unknown = await res.json();
  // A single location comes back as an object, several as an array.
  const locations = (Array.isArray(body) ? body : [body]) as ApiLocation[];
  if (locations.length !== cities.length) {
    throw new Error(`Expected ${cities.length} locations, got ${locations.length}`);
  }
  return cities.map((city, k) => {
    const h = (locations[k] as ApiLocation).hourly;
    return { city, air: summarise({ time: h.time, pm25: h.pm2_5 }) };
  });
}
