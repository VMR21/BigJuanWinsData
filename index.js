import express from 'express';
import axios from 'axios';

const app = express();
const PORT = process.env.PORT || 5000;

// Upgrader API configuration
const API_KEY = 'c8d7147e-a896-4992-8abf-d84504f17191';
const BASE_URL = 'https://api.upgrader.com';
const STATS_ENDPOINT = '/affiliate/creator/get-stats';

// Rainbet API configuration
const RAINBET_API_KEY = "ll7ILoJfEopD0DUY8oLXoyFpISFifOFv";
const SELF_URL = `http://localhost:${PORT}/leaderboard/top14`;

// Cache variables
let cachedRainbetData = [];
let cachedUpgraderCurrent = [];
let cachedUpgraderPrevious = [];

// CORS headers
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});

// Utility to format Date as YYYY-MM-DD
function formatDate(date) {
  return date.toISOString().substring(0, 10);
}

// Calculate biweekly periods starting from 2025-09-18 00:00 UTC
function getBiweeklyPeriods() {
  const anchor = new Date(Date.UTC(2025, 8, 18, 0, 0, 0));
  const now = new Date();
  const msPerPeriod = 14 * 24 * 60 * 60 * 1000;
  const elapsedPeriods = Math.floor((now - anchor) / msPerPeriod);
  const currentStart = new Date(anchor.getTime() + elapsedPeriods * msPerPeriod);
  const currentEnd = new Date(currentStart.getTime() + msPerPeriod - 1);
  const previousStart = new Date(currentStart.getTime() - msPerPeriod);
  const previousEnd = new Date(currentStart.getTime() - 1);
  return {
    current: { from: currentStart, to: currentEnd },
    previous: { from: previousStart, to: previousEnd }
  };
}

// Fetch leaderboard data from Upgrader affiliate API for given range
async function fetchLeaderboard(fromDate, toDate) {
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[Attempt ${attempt}] Making API request to:`, BASE_URL + STATS_ENDPOINT);
      console.log('Request payload:', {
        apikey: API_KEY.substring(0, 8) + '...',
        from: formatDate(fromDate),
        to: formatDate(toDate),
      });
      
      const resp = await axios.post(BASE_URL + STATS_ENDPOINT, {
        apikey: API_KEY,
        from: formatDate(fromDate),
        to: formatDate(toDate),
      }, {
        timeout: 30000, // 30 second timeout
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; LeaderboardAPI/1.0)'
        }
      });
      
      console.log('API response status:', resp.status);
      console.log('API response data:', JSON.stringify(resp.data, null, 2));
      
      if (resp.data.error) {
        throw new Error(resp.data.message || resp.data.msg || 'API error');
      }
      return resp.data.data.summarizedBets || [];
      
    } catch (error) {
      console.error(`[Attempt ${attempt}] Fetch error details:`);
      console.error('Message:', error.message);
      
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
        
        // Handle rate limiting
        if (error.response.status === 500 && error.response.data.msg && error.response.data.msg.includes('Rate limit')) {
          const waitTime = 30; // Wait 30 seconds for rate limit
          console.log(`Rate limited. Waiting ${waitTime} seconds before retry...`);
          
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
            continue;
          }
        }
      }
      
      // If this was the last attempt or a non-rate-limit error, return null
      if (attempt === maxRetries) {
        console.error('All retry attempts failed');
        return null;
      }
      
      // Wait a bit before retrying for other errors
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  return null;
}

// Mask usernames, e.g., co***17
function maskUsername(username) {
  if (username.length <= 4) return username;
  return username.slice(0, 2) + '***' + username.slice(-2);
}

// Format data to required output structure
function formatOutput(data) {
  if (!data) return [];
  return data.map(u => ({
    username: maskUsername(u.user.username),
    wagered: u.wager / 100,
    weightedWager: u.wager / 100,
  }));
}

// Rainbet API functions
function getDynamicApiUrl() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth(); // 0-indexed
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 0));
  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);
  return `https://services.rainbet.com/v1/external/affiliates?start_at=${startStr}&end_at=${endStr}&key=${RAINBET_API_KEY}`;
}

async function fetchAndCacheRainbetData() {
  try {
    const response = await axios.get(getDynamicApiUrl(), {
      timeout: 30000, // 30 second timeout
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LeaderboardAPI/1.0)'
      }
    });
    const json = response.data;
    if (!json.affiliates) throw new Error("No data");
    const sorted = json.affiliates.sort(
      (a, b) => parseFloat(b.wagered_amount) - parseFloat(a.wagered_amount)
    );
    const top10 = sorted.slice(0, 10);
    cachedRainbetData = top10.map(entry => ({
      username: maskUsername(entry.username),
      wagered: Math.round(parseFloat(entry.wagered_amount)),
      weightedWager: Math.round(parseFloat(entry.wagered_amount)),
    }));
    console.log(`[✅] Rainbet leaderboard updated`);
  } catch (err) {
    console.error("[❌] Failed to fetch Rainbet data:", err.message);
  }
}

// Upgrader data fetch and cache (new)
async function fetchAndCacheUpgraderData() {
  try {
    const periods = getBiweeklyPeriods();

    // Fetch current period data
    const currentData = await fetchLeaderboard(periods.current.from, periods.current.to);
    if (currentData !== null) cachedUpgraderCurrent = currentData;

    // Fetch previous period data
    const previousData = await fetchLeaderboard(periods.previous.from, periods.previous.to);
    if (previousData !== null) cachedUpgraderPrevious = previousData;

    console.log(`[✅] Upgrader leaderboard data updated`);
  } catch (err) {
    console.error('[❌] Failed to update Upgrader leaderboard data:', err.message);
  }
}

// Status endpoint to show API connection
app.get('/', (req, res) => {
  res.json({
    status: 'API Server Running',
    endpoints: {
      upgrader_current: '/leaderboard/upgrader',
      upgrader_previous: '/leaderboard/prev-upgrade',
      rainbet_current: '/leaderboard/top14',
      rainbet_previous: '/leaderboard/prev'
    },
    affiliate_codes: {
      upgrader: 'JUAN',
      rainbet: 'Active'
    }
  });
});

// Modified endpoints using cached Upgrader data

app.get('/leaderboard/upgrader', (req, res) => {
  if (cachedUpgraderCurrent.length === 0) {
    // If cache empty, try fetching live data (fallback)
    fetchLeaderboard(getBiweeklyPeriods().current.from, getBiweeklyPeriods().current.to)
      .then(data => {
        if (!data) return res.status(500).json({ error: 'Failed to fetch data' });
        cachedUpgraderCurrent = data;
        res.json(formatOutput(cachedUpgraderCurrent));
      })
      .catch(() => res.status(500).json({ error: 'Failed to fetch data' }));
  } else {
    res.json(formatOutput(cachedUpgraderCurrent));
  }
});

app.get('/leaderboard/prev-upgrade', (req, res) => {
  if (cachedUpgraderPrevious.length === 0) {
    // If cache empty, try fetching live data (fallback)
    fetchLeaderboard(getBiweeklyPeriods().previous.from, getBiweeklyPeriods().previous.to)
      .then(data => {
        if (!data) return res.status(500).json({ error: 'Failed to fetch data' });
        cachedUpgraderPrevious = data;
        res.json(formatOutput(cachedUpgraderPrevious));
      })
      .catch(() => res.status(500).json({ error: 'Failed to fetch data' }));
  } else {
    res.json(formatOutput(cachedUpgraderPrevious));
  }
});

// Rainbet endpoints (unchanged)
app.get('/leaderboard/top14', (req, res) => {
  res.json(cachedRainbetData);
});

app.get('/leaderboard/prev', async (req, res) => {
  try {
    const now = new Date();
    const prevMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const prevMonthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
    const startStr = prevMonth.toISOString().slice(0, 10);
    const endStr = prevMonthEnd.toISOString().slice(0, 10);
    const url = `https://services.rainbet.com/v1/external/affiliates?start_at=${startStr}&end_at=${endStr}&key=${RAINBET_API_KEY}`;
    const response = await axios.get(url, {
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LeaderboardAPI/1.0)'
      }
    });
    const json = response.data;
    if (!json.affiliates) throw new Error("No previous data");
    const sorted = json.affiliates.sort(
      (a, b) => parseFloat(b.wagered_amount) - parseFloat(a.wagered_amount)
    );
    const top10 = sorted.slice(0, 10);
    const processed = top10.map(entry => ({
      username: maskUsername(entry.username),
      wagered: Math.round(parseFloat(entry.wagered_amount)),
      weightedWager: Math.round(parseFloat(entry.wagered_amount)),
    }));
    res.json(processed);
  } catch (err) {
    console.error("[❌] Failed to fetch previous leaderboard:", err.message);
    res.status(500).json({ error: "Failed to fetch previous leaderboard data." });
  }
});

// Initialize data caches on startup
fetchAndCacheRainbetData();
fetchAndCacheUpgraderData();

// Schedule data refresh every 10 minutes
setInterval(fetchAndCacheRainbetData, 10 * 60 * 1000);
setInterval(fetchAndCacheUpgraderData, 10 * 60 * 1000);

// Self-ping to keep service alive every 10 minutes
setInterval(() => {
  axios.get(SELF_URL, { timeout: 5000 })
    .then(() => console.log(`[🔁] Self-pinged ${SELF_URL}`))
    .catch(err => console.error("[⚠️] Self-ping failed:", err.message));
}, 600000);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
  console.log(`Available endpoints:`);
  console.log(`- Upgrader current: /leaderboard/upgrader`);
  console.log(`- Upgrader previous: /leaderboard/prev-upgrade`);
  console.log(`- Rainbet current: /leaderboard/top14`);
  console.log(`- Rainbet previous: /leaderboard/prev`);
});
