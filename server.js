
import express from "express"; 

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to handle JSON and CORS
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});



// Define index.html as the root explicitly (useful on Vercel, optional when running Node locally).
app.get('/', (req, res) => { res.redirect('/index.html') })


// Secure Proxy Endpoint
app.get("/api/hotspots", async (req, res) => {
  const apiKey = process.env.EBIRD_API_KEY;
  const {lat, lng, dist, maxResults} = req.query;

  if (!lat || !lng) {
    return res.status(400).send("Missing required latitude or longitude parameters.");
  }

  const ebirdUrl = `https://api.ebird.org/v2/ref/hotspot/geo?lat=${lat}&lng=${lng}&dist=${dist}&maxResults=${maxResults}&fmt=json`;

  if (!apiKey) {
    console.error("EBIRD_API_KEY is not set in environment variables.");
    return res.status(500).send("Server-side API key not configured.");
  }

  try {
    const ebirdResponse = await fetch(ebirdUrl, {
      headers: {"X-eBirdApiToken": apiKey},
    });

    if (!ebirdResponse.ok) {
      const errorBody = await ebirdResponse.text();
      return res
        .status(ebirdResponse.status)
        .send(`eBird API Error: ${ebirdResponse.status}. Details: ${errorBody.substring(0, 100)}...`);
    }

    const data = await ebirdResponse.json();
    res.json(data);
  } catch (error) {
    console.error("Server Proxy Failed:", error);
    res.status(500).send("Internal server error during fetch to eBird.");
  }
});

// Simple health/debug endpoint
app.get('/api/_ping', (req, res) => {
  res.status(200).send('ok');
});

// Proxy endpoint to fetch recent observations (species) for a hotspot by locId
app.get("/api/hotspotSpecies", async (req, res) => {
  console.log('/api/hotspotSpecies request received, query=', req.query);
  const apiKey = process.env.EBIRD_API_KEY;
  const { locId, maxResults } = req.query;

  if (!locId) {
    return res.status(400).send("Missing required locId parameter.");
  }

  if (!apiKey) {
    console.error("EBIRD_API_KEY is not set in environment variables.");
    return res.status(500).send("Server-side API key not configured.");
  }

  const results = maxResults ? `?maxResults=${encodeURIComponent(maxResults)}` : "";
  const ebirdUrl = `https://api.ebird.org/v2/data/obs/hotspot/recent/${encodeURIComponent(locId)}${results}`;

  try {
    const ebirdResponse = await fetch(ebirdUrl, { headers: { "X-eBirdApiToken": apiKey } });
    if (!ebirdResponse.ok) {
      const errorBody = await ebirdResponse.text();
      return res
        .status(ebirdResponse.status)
        .send(`eBird API Error: ${ebirdResponse.status}. Details: ${errorBody.substring(0, 200)}...`);
    }

    const data = await ebirdResponse.json();
    // Return the raw observations; client will pick comName and other fields as needed
    res.json(data);
  } catch (error) {
    console.error("Server Proxy Failed (hotspotSpecies):", error);
    res.status(500).send("Internal server error during fetch to eBird.");
  }
});

// Proxy endpoint to fetch recent observations by geographic coordinates
app.get("/api/recentObservations", async (req, res) => {
  console.log('/api/recentObservations request received, query=', req.query);
  const apiKey = process.env.EBIRD_API_KEY;
  const { lat, lng, maxResults } = req.query;

  if (!lat || !lng) {
    return res.status(400).send("Missing required latitude or longitude parameters.");
  }

  if (!apiKey) {
    console.error("EBIRD_API_KEY is not set in environment variables.");
    return res.status(500).send("Server-side API key not configured.");
  }

  const results = maxResults ? `&maxResults=${encodeURIComponent(maxResults)}` : "";
  const ebirdUrl = `https://api.ebird.org/v2/data/obs/geo/recent?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}${results}`;
  console.log('recentObservations ebirdUrl:', ebirdUrl);

  try {
    const ebirdResponse = await fetch(ebirdUrl, { headers: { "X-eBirdApiToken": apiKey } });
    if (!ebirdResponse.ok) {
      const errorBody = await ebirdResponse.text();
      return res
        .status(ebirdResponse.status)
        .send(`eBird API Error: ${ebirdResponse.status}. Details: ${errorBody.substring(0, 200)}...`);
    }

    const data = await ebirdResponse.json();
    res.json(data);
  } catch (error) {
    console.error("Server Proxy Failed (recentObservations):", error);
    res.status(500).send("Internal server error during fetch to eBird.");
  }
});

// Serve static files from /public folder (useful when running Node locally, optional on Vercel).
app.use(express.static('public'));

// Diagnostic: list registered routes (temporary)
app.get('/__routes', (req, res) => {
  try {
    const routes = [];
    app._router.stack.forEach(mw => {
      if (mw.route && mw.route.path) {
        const methods = Object.keys(mw.route.methods).join(',');
        routes.push({ path: mw.route.path, methods });
      }
    });
    res.json(routes);
  } catch (err) {
    res.status(500).send(String(err));
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Access your website at http://localhost:${PORT}/index.html`);
});
