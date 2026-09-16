const http = require('http');
const https = require('https');

async function testEndpoint(name, url, options = {}) {
  const start = Date.now();
  return new Promise((resolve) => {
    const isHttps = url.startsWith('https:');
    const client = isHttps ? https : http;

    const req = client.get(url, {
      headers: options.headers || {},
      timeout: 8000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const latency = Date.now() - start;
        let parsed = null;
        try { parsed = JSON.parse(data); } catch(e) {}

        resolve({
          name,
          url: url.split('?')[0],
          statusCode: res.statusCode,
          latency: `${latency}ms`,
          ok: res.statusCode >= 200 && res.statusCode < 300,
          details: parsed ? (parsed.message || parsed.status || `Payload size: ${data.length} bytes`) : `Data length: ${data.length} bytes`,
          parsed
        });
      });
    });

    req.on('error', (err) => {
      resolve({
        name,
        url: url.split('?')[0],
        statusCode: 0,
        latency: `${Date.now() - start}ms`,
        ok: false,
        details: err.message
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        name,
        url: url.split('?')[0],
        statusCode: 408,
        latency: `${Date.now() - start}ms`,
        ok: false,
        details: 'Request Timeout (8s)'
      });
    });
  });
}

async function runAudit() {
  console.log('=====================================================');
  console.log('         HIGHFY TV - COMPREHENSIVE API AUDIT         ');
  console.log('=====================================================\n');

  const tests = [
    // 1. Internal HighFy TV Endpoints
    { name: 'Server Health Check', url: 'http://localhost:3000/api/health' },
    { name: 'Channels Database (/channels.json)', url: 'http://localhost:3000/channels.json' },
    { name: 'Categories Database (/categories.json)', url: 'http://localhost:3000/categories.json' },
    { name: 'M3U8 Playlist Synchronization', url: 'http://localhost:3000/playlist.m3u8' },

    // 2. RapidAPI SofaScore
    { name: 'RapidAPI SofaScore Diagnostic (/api/sofascore/test)', url: 'http://localhost:3000/api/sofascore/test' },
    { name: 'SofaScore Sports List (countryCode=GB)', url: 'http://localhost:3000/api/sofascore/sports/list?countryCode=GB' },
    { name: 'SofaScore Live Matches (/api/sofascore/matches)', url: 'http://localhost:3000/api/sofascore/matches' },

    // 3. RapidAPI Cricbuzz 2
    { name: 'RapidAPI Cricbuzz Diagnostic (/api/cricbuzz/test)', url: 'http://localhost:3000/api/cricbuzz/test' },
    { name: 'Cricbuzz 2 Live Cricket Matches (/api/cricket/matches)', url: 'http://localhost:3000/api/cricket/matches' },

    // 4. Combined Diagnostic Endpoint
    { name: 'Combined RapidAPI Diagnostic (/api/rapidapi/test)', url: 'http://localhost:3000/api/rapidapi/test' },

    // 5. TheSportsDB API (Cricket & Live Sports Fallback)
    { name: 'TheSportsDB Free Tier API (/api/v1/json/3/eventsseason.php?id=4391&s=2026)', url: 'https://www.thesportsdb.com/api/v1/json/3/eventsseason.php?id=4391&s=2026' },

    // 6. HighFy Stream Proxy (AES-128 HLS & Stream Delivery)
    { name: 'Stream Proxy - Sony Ten 1 HD Master', url: 'http://localhost:3000/api/stream-proxy?url=' + encodeURIComponent('https://hey-lookme.shop/live.php?id=162') },
    { name: 'Stream Proxy - Colors HD Master', url: 'http://localhost:3000/api/stream-proxy?url=' + encodeURIComponent('https://hey-lookme.shop/live.php?id=144') },
    { name: 'Stream Proxy - Zee Bangla Master', url: 'http://localhost:3000/api/stream-proxy?url=' + encodeURIComponent('https://hey-lookme.shop/live.php?id=625') },

    // 7. Direct External Stream Source CDN
    { name: 'Jio CDN Dare Images Logo CDN', url: 'https://jiotv.catchup.cdn.jio.com/dare_images/images/Ten_HD.png' }
  ];

  const results = [];
  for (const t of tests) {
    const res = await testEndpoint(t.name, t.url, t.options);
    results.push(res);
    const icon = res.ok ? '✓ PASS' : '✗ FAIL';
    console.log(`${icon} | [${res.statusCode}] ${res.name.padEnd(46)} | ${res.latency.padEnd(7)} | ${res.details.slice(0, 50)}`);
  }

  // Check Gemini API key in process.env
  const hasGemini = !!process.env.GEMINI_API_KEY;
  console.log(`\n--- Server Environment Keys ---`);
  console.log(`Gemini API Key: ${hasGemini ? '✓ Configured in process.env' : 'ℹ Not set (optional)'}`);
  console.log(`RapidAPI Key: ${process.env.RAPIDAPI_KEY || '2da9bc77...8d81 (Default Configured)'}`);
  console.log(`TheSportsDB Key: ${process.env.THESPORTSDB_API_KEY || '3 (Default Free Tier)'}`);
  console.log(`AllSportsAPI Key: ${process.env.ALLSPORTSAPI_KEY ? 'Configured' : 'Not set (optional)'}`);

  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;

  console.log('\n=====================================================');
  console.log(`TOTAL APIS TESTED: ${results.length}`);
  console.log(`SUCCESSFUL (PASS): ${passed}`);
  console.log(`FAILED / ERROR:    ${failed}`);
  console.log('=====================================================');
}

runAudit();
