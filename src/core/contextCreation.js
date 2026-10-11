const { validateRequest, timeToMinutes } = require("../core/validate");

const GEOCODING_API =
  "https://geocoding-api.open-meteo.com/v1/search";

const WEATHER_API =
  "https://api.open-meteo.com/v1/forecast";

const HOURLY_VARIABLES = [
  "temperature_2m",
  "relative_humidity_2m",
  "apparent_temperature",
  "wind_speed_10m",
  "precipitation_probability",
  "uv_index"
].join(",");

// Fetch JSON and handle HTTP/API errors.
async function fetchJson(url, serviceName) {
  const response = await fetch(url);
  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `${serviceName} failed with HTTP ${response.status}: ` +
      responseText.slice(0, 300)
    );
  }

  try {
    return JSON.parse(responseText);
  } catch {
    throw new Error(`${serviceName} returned invalid JSON.`);
  }
}

// Open-Meteo's geocoder accepts a place name with
// its country or first-level administrative area.
// For "Jadavpur, Kolkata, West Bengal", use
// "Jadavpur, West Bengal".
function normalizeLocationQuery(location) {
  const parts = location
    .split(",")
    .map(part => part.trim())
    .filter(Boolean);

  // For "Area, City, State", discard the area and search
  // using "City, State".
  if (parts.length >= 3) {
    return parts.slice(1).join(", ");
  }

  // Preserve shorter inputs, such as "Howrah, West Bengal".
  return location.trim();
}

// Convert a locality into coordinates.
async function geocodeLocation(location) {
  let searchQuery = normalizeLocationQuery(location);

  const parts = location
    .split(",")
    .map(part => part.trim())
    .filter(Boolean);

  let parameters = new URLSearchParams({
    name: searchQuery,
    count: "10",
    language: "en",
    format: "json",
    countryCode: "IN"
  });

  let url = `${GEOCODING_API}?${parameters}`;

  let data = await fetchJson(url, "Open-Meteo Geocoding");

  if (!data.results || data.results.length === 0) {
    throw new Error(
      `Could not resolve "${location}" using "${searchQuery}". ` +
      "Please check the city and state."
    );
  }

  const requestedName = searchQuery
    .split(",")[0]
    .trim()
    .toLowerCase();

  const exactMatches = data.results.filter(
    result => result.name.toLowerCase() === requestedName
  );

  let selectedLocation;

  if (exactMatches.length === 1) {
    selectedLocation = exactMatches[0];
  } else if (exactMatches.length > 1) {
    throw new Error(
      `Multiple exact matches for "${location}". ` +
      "The location must be made more specific."
    );
  } else if (data.results.length === 1) {
    selectedLocation = data.results[0];
  } else {
    const candidates = data.results
      .slice(0, 5)
      .map(result =>
        `${result.name}, ${result.admin1 || ""}, ${result.country}`
      );

    throw new Error(
      `Ambiguous location "${location}". Candidates: ` +
      candidates.join("; ")
    );
  }

  return {
    query: location,
    resolutionPrecision: parts.length >= 3
      ? "city/state search (locality omitted)"
      : "provided location search",
    resolvedName: selectedLocation.name,
    district: selectedLocation.admin2 || null,
    state: selectedLocation.admin1 || null,
    country: selectedLocation.country,
    latitude: selectedLocation.latitude,
    longitude: selectedLocation.longitude,
    timezone: selectedLocation.timezone || "Asia/Kolkata"
  };
}

// Fetch weather for one location and retain only the
// requested date and planning hours.
async function getHourlyForecast(
  location,
  date,
  planningWindow
) {
  const parameters = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    hourly: HOURLY_VARIABLES,
    start_date: date,
    end_date: date,
    timezone: "Asia/Kolkata",
    temperature_unit: "celsius",
    wind_speed_unit: "kmh"
  });

  const url = `${WEATHER_API}?${parameters}`;

  const data = await fetchJson(url, "Open-Meteo Forecast");

  if (!data.hourly || !Array.isArray(data.hourly.time)) {
    throw new Error(
      `Hourly forecast is missing for "${location.query}".`
    );
  }

  const startMinutes = timeToMinutes(planningWindow.start);
  const endMinutes = timeToMinutes(planningWindow.end);

  return data.hourly.time
    .map((timestamp, index) => {
      const hour = timestamp.slice(11, 16);
      const hourMinutes = timeToMinutes(hour);

      return {
        timestamp,
        temperatureC: data.hourly.temperature_2m[index],
        humidityPercent:
          data.hourly.relative_humidity_2m[index],
        apparentTemperatureC:
          data.hourly.apparent_temperature[index],
        windSpeedKmh:
          data.hourly.wind_speed_10m[index],
        precipitationProbabilityPercent:
          data.hourly.precipitation_probability[index],
        uvIndex: data.hourly.uv_index[index]
      };
    })
    .filter(record => {
      const recordDate = record.timestamp.slice(0, 10);
      const recordTime = record.timestamp.slice(11, 16);
      const recordMinutes = timeToMinutes(recordTime);

      return (
        recordDate === date &&
        recordMinutes >= startMinutes &&
        recordMinutes <= endMinutes
      );
    });
}

// Main context-creation function.
async function createWeatherContext(request) {
  const validation = validateRequest(request);

  if (!validation.valid) {
    return {
      status: "INVALID_REQUEST",
      reason: validation.reason
    };
  }

  // Collect all starting and ending locations, removing
  // repeated location strings.
  const locationNames = [
    ...new Set(
      request.tasks.flatMap(task => [
        task.startLocation,
        task.endLocation
      ])
    )
  ];

  const resolvedLocations = {};

  for (const locationName of locationNames) {
    resolvedLocations[locationName] =
      await geocodeLocation(locationName);
  }

  // Reuse forecasts when different names resolve to
  // exactly the same coordinates.
  const forecastCache = new Map();
  const weatherByLocation = {};

  for (const locationName of locationNames) {
    const location = resolvedLocations[locationName];
    const coordinateKey =
      `${location.latitude},${location.longitude}`;

    if (!forecastCache.has(coordinateKey)) {
      const forecast = await getHourlyForecast(
        location,
        request.date,
        request.planningWindow
      );

      forecastCache.set(coordinateKey, forecast);
    }

    weatherByLocation[locationName] = {
      location,
      hourlyForecast: forecastCache.get(coordinateKey)
    };
  }

  return {
    userRequest: request,
    timezone: "Asia/Kolkata",
    resolvedLocations,
    weatherByLocation,
  };
}

module.exports = {
  createWeatherContext
};