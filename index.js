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
const SELF_URL = `https://bigjuanwinsdata.onrender.com/leaderboard/top14`;

let cachedRainbetData = [];

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
// Calculate biweekly periods starting from 2025-09-17 00:00 UTC
function getBiweeklyPeriods() {
  const anchor = new Date(Date.UTC(2025, 8, 17, 0, 0, 0));
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
// Fetch leaderboard data from affiliate API for given range
async function fetchLeaderboard(fromDate, toDate) {
  try {
    console.log('Making API request to:', BASE_URL + STATS_ENDPOINT);
    console.log('Request payload:', {
      apikey: API_KEY.substring(0, 8) + '...',
      from: formatDate(fromDate),
      to: formatDate(toDate),
    });
    
    const resp = await axios.post(BASE_URL + STATS_ENDPOINT, {
      apikey: API_KEY,
      from: formatDate(fromDate),
      to: formatDate(toDate),
    });
    
    console.log('API response status:', resp.status);
    console.log('API response data:', JSON.stringify(resp.data, null, 2));
    
    if (resp.data.error) {
      throw new Error(resp.data.message || 'API error');
    }
    return resp.data.data.summarizedBets || [];
  } catch (error) {
    console.error('Fetch error details:');
    console.error('Message:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    return null;
  }
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
    const response = await axios.get(getDynamicApiUrl());
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

// Express endpoint for current leaderboard data
app.get('/leaderboard/upgrader', async (req, res) => {
  const periods = getBiweeklyPeriods();
  const data = await fetchLeaderboard(periods.current.from, periods.current.to);
  if (data === null) return res.status(500).json({ error: 'Failed to fetch data' });
  res.json(formatOutput(data));
});
// Express endpoint for previous leaderboard data
app.get('/leaderboard/prev-upgrade', async (req, res) => {
  const periods = getBiweeklyPeriods();
  const data = await fetchLeaderboard(periods.previous.from, periods.previous.to);
  if (data === null) return res.status(500).json({ error: 'Failed to fetch data' });
  res.json(formatOutput(data));
});

// Rainbet endpoints
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
    const response = await axios.get(url);
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
// Initialize Rainbet data cache
fetchAndCacheRainbetData();
setInterval(fetchAndCacheRainbetData, 5 * 60 * 1000); // every 5 minutes

// Self-ping to keep service alive
setInterval(() => {
  axios.get(SELF_URL)
    .then(() => console.log(`[🔁] Self-pinged ${SELF_URL}`))
    .catch(err => console.error("[⚠️] Self-ping failed:", err.message));
}, 270000); // every 4.5 mins

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
  console.log(`Available endpoints:`);
  console.log(`- Upgrader current: /leaderboard/upgrader`);
  console.log(`- Upgrader previous: /leaderboard/prev-upgrade`);
  console.log(`- Rainbet current: /leaderboard/top14`);
  console.log(`- Rainbet previous: /leaderboard/prev`);
});
