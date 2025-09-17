import express from 'express';
import axios from 'axios';
const app = express();
const PORT = process.env.PORT || 5000;

// Upgrader API configuration
const API_KEY = process.env.UPGRADER_API_KEY;
const BASE_URL = 'https://api.upgrader.com';
const STATS_ENDPOINT = '/affiliate/creator/get-stats';

// Rainbet API configuration
const RAINBET_API_KEY = process.env.RAINBET_API_KEY;

// Environment variable validation
if (!API_KEY) {
  console.error('❌ UPGRADER_API_KEY environment variable is required');
  process.exit(1);
}

if (!RAINBET_API_KEY) {
  console.error('❌ RAINBET_API_KEY environment variable is required');
  process.exit(1);
}
const SELF_URL = `https://bigjuanwinsdata.onrender.com/leaderboard/top14`;

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
// Advanced request headers that mimic real browser behavior
function getBrowserHeaders() {
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0'
  ];
  
  return {
    'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'DNT': '1',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'cross-site',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
  };
}

// Try different request strategies to bypass blocking
async function fetchWithAntiBlock(url, postData = null, attempt = 1) {
  const strategies = [
    // Strategy 1: Enhanced headers with random delay
    async () => {
      await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 1000));
      const config = {
        timeout: 30000,
        headers: {
          ...getBrowserHeaders(),
          'Referer': 'https://google.com/',
          'Origin': postData ? new URL(url).origin : undefined
        }
      };
      
      if (postData) {
        return await axios.post(url, postData, config);
      } else {
        return await axios.get(url, config);
      }
    },
    
    // Strategy 2: Different user agent and longer delay
    async () => {
      await new Promise(resolve => setTimeout(resolve, Math.random() * 3000 + 2000));
      const config = {
        timeout: 40000,
        headers: {
          ...getBrowserHeaders(),
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Referer': 'https://www.google.com/search?q=casino+games',
          'X-Requested-With': 'XMLHttpRequest'
        }
      };
      
      if (postData) {
        return await axios.post(url, postData, config);
      } else {
        return await axios.get(url, config);
      }
    },
    
    // Strategy 3: Minimal headers, different approach
    async () => {
      await new Promise(resolve => setTimeout(resolve, Math.random() * 5000 + 3000));
      const config = {
        timeout: 50000,
        headers: {
          'User-Agent': 'curl/7.68.0',
          'Accept': '*/*'
        }
      };
      
      if (postData) {
        return await axios.post(url, postData, config);
      } else {
        return await axios.get(url, config);
      }
    }
  ];
  
  console.log(`[🔄] Trying anti-block strategy ${attempt}/3...`);
  
  try {
    return await strategies[attempt - 1]();
  } catch (error) {
    if (attempt < 3) {
      console.log(`[⚠️] Strategy ${attempt} failed, trying next approach...`);
      return await fetchWithAntiBlock(url, postData, attempt + 1);
    }
    throw error;
  }
}

// Fetch leaderboard data from affiliate API for given range
async function fetchLeaderboard(fromDate, toDate) {
  const maxRetries = 3;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[Attempt ${attempt}] Making API request to:`, BASE_URL + STATS_ENDPOINT);
      console.log('Request payload:', {
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
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://upgrader.com/'
        }
      });
      
      console.log('API response status:', resp.status);
      
      // Check if we got an HTML response instead of JSON (Cloudflare blocking)
      if (typeof resp.data === 'string' && resp.data.includes('<html')) {
        console.log('[⚠️] Detected HTML response (likely Cloudflare blocking), trying anti-block...');
        
        const response = await fetchWithAntiBlock(BASE_URL + STATS_ENDPOINT, {
          apikey: API_KEY,
          from: formatDate(fromDate),
          to: formatDate(toDate)
        });
        
        if (response.data.error) {
          throw new Error(response.data.message || response.data.msg || 'API error');
        }
        return response.data.data.summarizedBets || [];
      }
      
      if (resp.data.data && resp.data.data.summarizedBets) {
        console.log(`API response: Found ${resp.data.data.summarizedBets.length} user records`);
      }
      
      if (resp.data.error) {
        throw new Error(resp.data.message || resp.data.msg || 'API error');
      }
      return resp.data.data.summarizedBets || [];
      
    } catch (error) {
      console.error(`[Attempt ${attempt}] Fetch error details:`);
      console.error('Message:', error.message);
      
      if (error.response) {
        console.error('Response status:', error.response.status);
        if (error.response.data && error.response.data.msg) {
          console.error('Response message:', error.response.data.msg);
        }
        
        // Handle rate limiting
        if (error.response.status === 500 && error.response.data.msg && error.response.data.msg.includes('Rate limit')) {
          const waitTime = 30; // Wait 30 seconds for rate limit
          console.log(`Rate limited. Waiting ${waitTime} seconds before retry...`);
          
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
            continue;
          }
        }
        
        // Handle 403/503 blocking by trying anti-block strategies
        if ((error.response.status === 403 || error.response.status === 503 || error.response.status === 429) && attempt === maxRetries) {
          console.log(`[⚠️] Got ${error.response.status} status, trying anti-block methods...`);
          
          try {
            const response = await fetchWithAntiBlock(BASE_URL + STATS_ENDPOINT, {
              apikey: API_KEY,
              from: formatDate(fromDate),
              to: formatDate(toDate)
            });
            
            if (response.data.error) {
              throw new Error(response.data.message || response.data.msg || 'API error');
            }
            
            console.log('[✅] Anti-block method succeeded!');
            return response.data.data.summarizedBets || [];
            
          } catch (antiBlockError) {
            console.error('[❌] Anti-block method also failed:', antiBlockError.message);
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
    const apiUrl = getDynamicApiUrl();
    let response;
    
    try {
      // Try regular axios request first
      response = await axios.get(apiUrl, {
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://rainbet.com/'
        }
      });
      
      // Check for blocking (403, 429, etc.)
      // We assume successful axios response means no blocking for now
    } catch (error) {
      if (error.response && (error.response.status === 403 || error.response.status === 429)) {
        console.log('[⚠️] Rainbet API blocked, trying anti-block method...');
        
        try {
          response = await fetchWithAntiBlock(apiUrl);
        } catch (antiBlockError) {
          console.error('[❌] Anti-block failed for Rainbet:', antiBlockError.message);
          throw error;
        }
      } else {
        throw error;
      }
    }
    
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

// Cache Upgrader data to avoid rate limiting
async function fetchAndCacheUpgraderData() {
  try {
    const periods = getBiweeklyPeriods();
    
    console.log('[📊] Fetching Upgrader data...');
    
    // Fetch current period
    const currentData = await fetchLeaderboard(periods.current.from, periods.current.to);
    if (currentData !== null) {
      cachedUpgraderCurrent = formatOutput(currentData);
      console.log('[✅] Upgrader current period data updated');
    }
    
    // Wait a bit before next call to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Fetch previous period
    const previousData = await fetchLeaderboard(periods.previous.from, periods.previous.to);
    if (previousData !== null) {
      cachedUpgraderPrevious = formatOutput(previousData);
      console.log('[✅] Upgrader previous period data updated');
    }
    
  } catch (err) {
    console.error("[❌] Failed to fetch Upgrader data:", err.message);
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

// Express endpoint for current leaderboard data (cached)
app.get('/leaderboard/upgrader', (req, res) => {
  res.json(cachedUpgraderCurrent);
});
// Express endpoint for previous leaderboard data (cached)
app.get('/leaderboard/prev-upgrade', (req, res) => {
  res.json(cachedUpgraderPrevious);
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
    let response;
    
    try {
      response = await axios.get(url, {
        timeout: 30000, // 30 second timeout
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://rainbet.com/'
        }
      });
      
      // Check for blocking (response should be JSON, not HTML)
      // We assume successful axios response means no blocking for now
    } catch (error) {
      if (error.response && (error.response.status === 403 || error.response.status === 429)) {
        console.log('[⚠️] Rainbet previous API blocked, trying anti-block method...');
        
        try {
          response = await fetchWithAntiBlock(url);
        } catch (antiBlockError) {
          console.error('[❌] Anti-block failed for Rainbet previous:', antiBlockError.message);
          throw error;
        }
      } else {
        throw error;
      }
    }
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

// Bind server to all hosts for Replit compatibility
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server listening on 0.0.0.0:${PORT}`);
  console.log(`Available endpoints:`);
  console.log(`- Status: /`);
  console.log(`- Upgrader current: /leaderboard/upgrader`);
  console.log(`- Upgrader previous: /leaderboard/prev-upgrade`);
  console.log(`- Rainbet current: /leaderboard/top14`);
  console.log(`- Rainbet previous: /leaderboard/prev`);
});

// Initialize data caches
fetchAndCacheRainbetData();
setInterval(fetchAndCacheRainbetData, 10 * 60 * 1000); // every 10 minutes

// Initialize Upgrader cache with delay to avoid immediate rate limiting
setTimeout(() => {
  fetchAndCacheUpgraderData();
  // Update Upgrader cache every 10 minutes
  setInterval(fetchAndCacheUpgraderData, 10 * 60 * 1000);
}, 5000); // 5 second delay
