async function fetchDynamicData(searchTerm) {
  const localProxyUrl = `http://localhost:3000/api/data?search=${searchTerm}`;

  try {
    // The client only sends the query, and your server adds the secret key
    const response = await fetch(localProxyUrl);
    const data = await response.json();

    // Process and display the data (Steps 5, 7, 8)
    console.log("Received data from secure proxy: ", data);
    // ... now transform and embed the data into HTML ...
  } catch (error) {
    console.error("Error fetching data from local proxy: ", error);
  }
}

const SERVER_NAME = "api.ebird.org"; // {{serverName}}
const CONTEXT_ROOT = "v2"; // {{contextRoot}}

document.getElementById("findHotspotsBtn").addEventListener("click", async () => {
  const loader = document.getElementById('loader');
  const button = document.getElementById('findHotspotsBtn');

  // Show loader immediately and disable the button so the user gets instant feedback.
  if (loader) loader.classList.add('active');
  if (button) button.disabled = true;

  // Allow the browser one frame to paint the loader before doing more work.
  await new Promise((resolve) => requestAnimationFrame(resolve));

  // Check if the browser supports the Geolocation API
  if (!navigator.geolocation) {
    alert("Geolocation is not supported by this browser.");
    if (loader) loader.classList.remove('active');
    if (button) button.disabled = false;
    return;
  }

  console.log("Preparing to request location...");

  // If the Permissions API is available, check the current state to give
  // a better user experience (and avoid immediately triggering a denied prompt).
  try {
    if (navigator.permissions && navigator.permissions.query) {
      const status = await navigator.permissions.query({ name: 'geolocation' });
      console.log('Geolocation permission state:', status.state);
      if (status.state === 'denied') {
        // Permission was previously denied. Offer a manual fallback so the user
        // can still enter coordinates rather than repeatedly timing out.
        const tryManual = confirm(
          'Location access is currently denied in your browser.\n\n' +
            'You can open your browser settings to grant persistent access,\n' +
            "or enter coordinates manually to continue.\n\nClick OK to enter coordinates now."
        );
        if (tryManual) {
          const lat = prompt('Enter latitude (e.g. 40.71):');
          const lng = prompt('Enter longitude (e.g. -74.01):');
          if (lat && lng && !isNaN(parseFloat(lat)) && !isNaN(parseFloat(lng))) {
            successCallback({ coords: { latitude: parseFloat(lat), longitude: parseFloat(lng) } });
          } else {
            alert('Invalid coordinates entered. Please try again or enable location in your browser settings.');
            if (loader) loader.classList.remove('active');
            if (button) button.disabled = false;
          }
        } else {
          if (loader) loader.classList.remove('active');
          if (button) button.disabled = false;
        }
        return;
      }
    }
  } catch (err) {
    // Non-fatal: if Permissions API isn't available or fails, continue to request location
    console.warn('Permissions API check failed or is unavailable:', err);
  }

  // Request the current position. Increase timeout and allow some cached values to
  // reduce the chance of a timeout. Note: browsers control whether permission is
  // remembered; the app cannot force indefinite permission.
  navigator.geolocation.getCurrentPosition(
    successCallback,
    (err) => {
      // If geolocation fails, ensure the loader is hidden and button re-enabled
      if (loader) loader.classList.remove('active');
      if (button) button.disabled = false;
      errorCallback(err);
    },
    { enableHighAccuracy: true, timeout: 30000, maximumAge: 60000 }
  );
});

function successCallback(position) {
  const lat = position.coords.latitude.toFixed(2);
  const lng = position.coords.longitude.toFixed(2);
  console.log(`Location acquired: Lat ${lat}, Lng ${lng}`);
  // Proceed to fetch nearby hotspots
  fetchHotspots(lat, lng);
}

function errorCallback(error) {
  let message;
  switch (error.code) {
    case error.PERMISSION_DENIED:
      message = "User denied the request for Geolocation.";
      break;
    case error.POSITION_UNAVAILABLE:
      message = "Location information is unavailable.";
      break;
    case error.TIMEOUT:
      message = "The request to get user location timed out.";
      break;
    default:
      message = "An unknown error occurred.";
      break;
  }
  document.getElementById("hotspotList").innerHTML = `<li>Error: ${message}</li>`;
  console.error(error);
}

// Function to call the eBird API
async function fetchHotspots(lat, lng) {
  const maxDistKm = 25;
  const maxResults = 10;

  const loader = document.getElementById('loader');
  const button = document.getElementById('findHotspotsBtn');

  // FIX: Define the localProxyUrl, using the lat/lng from the Geolocation successCallback
  const localProxyUrl = `http://localhost:3000/api/hotspots?lat=${lat}&lng=${lng}&dist=${maxDistKm}&maxResults=${maxResults}`;

  try {
    const response = await fetch(localProxyUrl);

    if (!response.ok) {
      // Read the server's text response and throw it as an error
      const errorText = await response.text();
      throw new Error(`Proxy Error (${response.status}): ${errorText}`);
    }

    const hotspots = await response.json();
      // Try to fetch recent observations (second data source) and match them to hotspots
      let observations = [];
      try {
        observations = await fetchRecentObservations(lat, lng, 200);
        console.log('recentObservations received (count):', Array.isArray(observations) ? observations.length : 'non-array');
      } catch (err) {
        console.warn('recentObservations fetch failed:', err);
        observations = [];
      }

      // Render hotspots enriched with matched species from observations
      renderHotspots(hotspots, parseFloat(lat), parseFloat(lng), observations);
      // hide loader and re-enable button after rendering
      if (loader) loader.classList.remove('active');
      if (button) button.disabled = false;
  } catch (error) {
    console.error("Fetch error:", error);
    document.getElementById(
      "hotspotList"
    ).innerHTML = `<li>API Error: ${error.message}. Check console for details.</li>`;
    // hide loader and re-enable button on error
    if (loader) loader.classList.remove('active');
    if (button) button.disabled = false;
  }
}

// Client helper to call the new server proxy endpoint for recent observations by geo
async function fetchRecentObservations(lat, lng, maxResults = 100) {
  const url = `/api/recentObservations?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&maxResults=${encodeURIComponent(maxResults)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// NOTE: Also ensure you have removed the old ebird API key and server vars like 'birdApiKey', 'SERVER_NAME', 'CONTEXT_ROOT'
// if you are fully adopting the proxy approach, as they are no longer used client-side.

// Function to process and display the results
// observations: optional array of recent observations from the second API
function renderHotspots(hotspots, userLat, userLng, observations = []) {
  const list = document.getElementById("hotspotList");
  list.innerHTML = ""; // Clear previous results

  if (!Array.isArray(hotspots) || hotspots.length === 0) {
    list.innerHTML = "<li>No nearby hotspots found. Try increasing the distance parameter.</li>";
    return;
  }

  // Helper: Haversine distance in kilometers between two lat/lng points
  function haversineDistance(lat1, lon1, lat2, lon2) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const R = 6371; // Earth radius in km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // Normalize lat/lng property names and compute distance for each hotspot
  hotspots.forEach((h) => {
    const hLat = (h.lat !== undefined) ? parseFloat(h.lat) : parseFloat(h.latitude || h.lat || 0);
    const hLng = (h.lng !== undefined) ? parseFloat(h.lng) : parseFloat(h.longitude || h.lng || 0);
    h.__distanceKm = Number.isFinite(hLat) && Number.isFinite(hLng) && Number.isFinite(userLat) && Number.isFinite(userLng)
      ? haversineDistance(userLat, userLng, hLat, hLng)
      : Infinity;
    // store normalized coords for matching
    h.__lat = hLat;
    h.__lng = hLng;
    h.__matchedSpecies = []; // will populate from observations
  });

  // If observations were provided, match them to hotspots.
  if (Array.isArray(observations) && observations.length > 0) {
    const MAX_MATCH_KM = 0.5; // 500m

    // Build a quick map of hotspots by locId for exact matching
    const hotspotByLocId = new Map();
    hotspots.forEach(h => {
      const id = (h.locId || h.loc_id || h.locid || '').toString();
      if (id) hotspotByLocId.set(id, h);
    });

    // Helper to add species into hotspot.__matchedSpecies with dedupe
    const addSpeciesToHotspot = (h, speciesName, speciesCode) => {
      if (!h) return;
      const key = speciesCode || speciesName;
      if (!key) return;
      // store unique by key
      if (!h.__matchedSpeciesKeys) h.__matchedSpeciesKeys = new Set();
      if (h.__matchedSpeciesKeys.has(key)) return;
      h.__matchedSpeciesKeys.add(key);
      h.__matchedSpecies.push(speciesName || speciesCode);
    };

    // For each observation, try locId match first, else proximity match
    observations.forEach(obs => {
      const obsLocId = (obs.locId || obs.loc_id || obs.locationId || '').toString();
      const comName = obs.comName || obs.comname || obs.sciName || obs.speciesCode || null;
      const speciesCode = obs.speciesCode || obs.species_code || null;

      if (obsLocId && hotspotByLocId.has(obsLocId)) {
        const h = hotspotByLocId.get(obsLocId);
        addSpeciesToHotspot(h, comName, speciesCode);
        return;
      }

      // fallback: match by coordinates if available
      const oLat = obs.lat !== undefined ? parseFloat(obs.lat) : (obs.latitude !== undefined ? parseFloat(obs.latitude) : null);
      const oLng = obs.lng !== undefined ? parseFloat(obs.lng) : (obs.longitude !== undefined ? parseFloat(obs.longitude) : null);
      if (oLat == null || oLng == null || Number.isNaN(oLat) || Number.isNaN(oLng)) return;

      // find nearest hotspot within MAX_MATCH_KM
      let nearest = null;
      let nearestKm = Infinity;
      hotspots.forEach(h => {
        if (!Number.isFinite(h.__lat) || !Number.isFinite(h.__lng)) return;
        const d = haversineDistance(oLat, oLng, h.__lat, h.__lng);
        if (d < nearestKm) { nearest = h; nearestKm = d; }
      });

      if (nearest && Number.isFinite(nearestKm) && nearestKm <= MAX_MATCH_KM) {
        addSpeciesToHotspot(nearest, comName, speciesCode);
      }
    });

    // Clean up helper sets to avoid leaking across renders
    hotspots.forEach(h => { if (h.__matchedSpeciesKeys) delete h.__matchedSpeciesKeys; });
  }

  // Sort by computed distance (ascending)
  hotspots.sort((a, b) => (a.__distanceKm || Infinity) - (b.__distanceKm || Infinity));

  // Filter out hotspots beyond 8 km so the list only shows nearby locations
  const MAX_DISPLAY_KM = 8;
  const beforeCount = hotspots.length;
  hotspots = hotspots.filter(h => Number.isFinite(h.__distanceKm) && h.__distanceKm <= MAX_DISPLAY_KM);
  const afterCount = hotspots.length;

  if (!Array.isArray(hotspots) || hotspots.length === 0) {
    if (beforeCount > 0 && afterCount === 0) {
      list.innerHTML = `<li>No hotspots within ${MAX_DISPLAY_KM} km. Try increasing the search distance.</li>`;
    } else {
      list.innerHTML = "<li>No nearby hotspots found. Try increasing the distance parameter.</li>";
    }
    return;
  }

  // Render sorted list with distance displayed
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  hotspots.forEach((hotspot, idx) => {
    const listItem = document.createElement("li");
    listItem.classList.add('hotspot-item');
    // Staggered delays so items fade in one after another
    if (!reduceMotion) {
      const delayMs = 200 + idx * 80; // first item 200ms, then +80ms each
      listItem.style.animationDelay = `${delayMs}ms`;
    }
    const latestObsText = hotspot.latestObsDt ? ` (Last Obs: ${hotspot.latestObsDt})` : "";

    // Prefer locName but fall back to name
    const name = hotspot.locName || hotspot.name || "Unknown hotspot";
    const distanceText = isFinite(hotspot.__distanceKm) ? ` — ${hotspot.__distanceKm.toFixed(1)} km` : "";

    listItem.innerHTML = `
      <span class="hotspot-name">${escapeHtml(name)}</span>
      <span class="hotspot-meta"> 
        <span class="hotspot-species-count" disabled>
          ${hotspot.numSpeciesAllTime || "—"} spp.
        </span>
        ${distanceText}${latestObsText}
      </span>
      <div class="species-container" aria-hidden="true"></div>
    `;

    // Species button is disabled - no click handler
    const speciesBtn = listItem.querySelector('.hotspot-species-count');
    const speciesContainer = listItem.querySelector('.species-container');
    let speciesLoaded = false;

    // Species button is disabled - no click listener

    list.appendChild(listItem);
  });
}

// Small helper to avoid inserting raw HTML from API
function escapeHtml(str) {
  if (typeof str !== 'string') return '' + str;
  return str.replace(/[&<>'"]/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[c]));
}

// Fetch species observations for a hotspot via server proxy
async function fetchSpeciesForHotspot(locId, maxResults = 200) {
  const url = `/api/hotspotSpecies?locId=${encodeURIComponent(locId)}&maxResults=${encodeURIComponent(maxResults)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// Render species list (deduplicated by comName)
function renderSpeciesList(container, observations) {
  if (!Array.isArray(observations) || observations.length === 0) {
    container.innerHTML = '<div class="no-species">No species returned.</div>';
    return;
  }

  // Deduplicate by common name
  const seen = new Set();
  const names = [];
  observations.forEach((o) => {
    const name = o.comName || o.comname || o.sciName || null;
    if (name && !seen.has(name)) {
      seen.add(name);
      names.push({ name, sci: o.sciName, obsDt: o.obsDt });
    }
  });

  const ul = document.createElement('ul');
  ul.className = 'species-list';
  names.forEach((n) => {
    const li = document.createElement('li');
    li.className = 'bird-name';
    li.textContent = n.name;
    ul.appendChild(li);
  });

  container.innerHTML = '';
  container.appendChild(ul);
}
