const fs = require('fs');
const https = require('https');
const http = require('http');
const url = require('url');

const rawList = [
  { name: "T Sports HD", url: "https://tvsen5.aynaott.com/TnMn5kZz8aLm/index.m3u8" },
  { name: "PTV Sports", url: "https://tvsen7.aynascope.net/zY3hJ7pQ2vM5gD8s/index.m3u8" },
  { name: "Unite8 Sports 2", url: "https://tvsen7.aynascope.net/Sports1/index.m3u8" },
  { name: "TSN 1", url: "https://tvsen7.aynascope.net/tsn1/index.m3u8" },
  { name: "TSN 2", url: "https://tvsen7.aynascope.net/tsn2/index.m3u8" },
  { name: "TSN 3", url: "https://tvsen7.aynascope.net/tsn3/index.m3u8" },
  { name: "Willow TV", url: "https://tvsen7.aynaott.com/rEBp38Ax/index.m3u8" },
  { name: "Bein Sports 1", url: "https://1nyaler.streamhostingcdn.top/stream/23/index.m3u8" },
  { name: "ESPN", url: "https://tvsen7.aynaott.com/espn/index.m3u8" },
  { name: "A Sports", url: "https://tvsen3.aynascope.net/yn6gezcX/index.m3u8" },
  { name: "NFL Network", url: "https://tvsen6.aynaott.com/nfl/index.m3u8" },
  { name: "Bleav Football", url: "https://linear-493.frequency.stream/dist/glewedtv/493/hls/master/playlist.m3u8" },
  { name: "Cricket Gold", url: "https://tvsen6.aynaott.com/M2W2UR49dmeKbZnmdRzN/index.m3u8" },
  { name: "BT Sports 2", url: "https://tvsen3.aynascope.net/FCKU2jmP/index.m3u8" },
  { name: "TNT Sport 1", url: "https://tvsen3.aynascope.net/4T5fe4Sc/index.m3u8" },
  { name: "DD Sports", url: "https://cdn-6.pishow.tv/live/13/master.m3u8" },
  { name: "Golf Channel", url: "https://tvsen3.aynascope.net/APKc7EfX/index.m3u8" },
  { name: "Gazi TV", url: "https://tvsen5.aynaott.com/Ravc7gPCZpxk/index.m3u8" },
  { name: "beIN XTRA", url: "https://amg01334-beinsportsllc-beinxtra-localnow-kcy6r.amagi.tv/playlistR1080p.m3u8" },
  { name: "sony Sports 2 HD", url: "https://stream.ottplus.live/live/ten_2_hd_abr/live/ten_2_hd_720/chunks.m3u8" },
  { name: "Willow HD", url: "http://tvsen5.aynascope.net/willowhd/tracks-v1a1/mono.ts.m3u8" },
  { name: "Star Sports select 1", url: "https://tvsen7.aynascope.net/Sports1/tracks-v1a1/mono.ts.m3u8" },
  { name: "ZV68 Sports Stream", url: "https://tvsen6.aynaott.com/zv68oqPDu7MZZwmHhRxt/tracks-v1a1/mono.ts.m3u8" },
  { name: "Online24 Stream", url: "https://ua101.online24.pm:8443/9999/tracks-v1/mono.m3u8" }
];

function fetchUrl(targetUrl, timeoutMs = 4000, maxRedirects = 3) {
  return new Promise((resolve, reject) => {
    if (maxRedirects < 0) return reject(new Error('Too many redirects'));
    const parsed = url.parse(targetUrl);
    const client = parsed.protocol === 'https:' ? https : http;

    let isDone = false;
    const timer = setTimeout(() => {
      if (!isDone) {
        isDone = true;
        if (req) req.destroy();
        reject(new Error('Hard timeout'));
      }
    }, timeoutMs);

    const req = client.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
        'Accept': '*/*'
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        clearTimeout(timer);
        isDone = true;
        const nextUrl = url.resolve(targetUrl, res.headers.location);
        res.resume();
        return resolve(fetchUrl(nextUrl, timeoutMs, maxRedirects - 1));
      }

      let data = '';
      res.on('data', chunk => {
        data += chunk;
        if (data.length > 500000) {
          req.destroy();
        }
      });
      res.on('end', () => {
        if (!isDone) {
          isDone = true;
          clearTimeout(timer);
          resolve({ statusCode: res.statusCode, headers: res.headers, body: data });
        }
      });
    });

    req.on('error', (err) => {
      if (!isDone) {
        isDone = true;
        clearTimeout(timer);
        reject(err);
      }
    });
  });
}

async function testChannel(item) {
  try {
    const res = await fetchUrl(item.url, 5000);
    if (res.statusCode !== 200 && res.statusCode !== 206) {
      return { ...item, alive: false, reason: `HTTP ${res.statusCode}` };
    }

    if (!res.body || !res.body.includes('#EXTM3U')) {
      if (res.body.includes('<html') || res.body.includes('<!DOCTYPE')) {
        return { ...item, alive: false, reason: 'HTML error page' };
      }
      return { ...item, alive: false, reason: 'Invalid M3U header' };
    }

    const lines = res.body.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    if (lines.length === 0) {
      return { ...item, alive: false, reason: 'Empty playlist' };
    }

    const firstSegment = url.resolve(item.url, lines[0]);
    try {
      const segRes = await fetchUrl(firstSegment, 4000);
      if (segRes.statusCode === 200 || segRes.statusCode === 206) {
        return { ...item, alive: true, reason: 'OK' };
      } else {
        return { ...item, alive: false, reason: `Segment HTTP ${segRes.statusCode}` };
      }
    } catch (segErr) {
      return { ...item, alive: true, reason: 'Playlist OK (segment: ' + segErr.message + ')' };
    }
  } catch (err) {
    return { ...item, alive: false, reason: err.message };
  }
}

async function run() {
  console.log(`Auditing ${rawList.length} sports channels in parallel...`);
  const promises = rawList.map(item => testChannel(item));
  const results = await Promise.all(promises);

  const live = results.filter(r => r.alive);
  const dead = results.filter(r => !r.alive);

  console.log('\n--- AUDIT RESULTS ---');
  results.forEach(r => {
    console.log(`${r.alive ? '✓ LIVE' : '✗ DEAD'} | ${r.name.padEnd(22)} | ${r.reason} | ${r.url}`);
  });

  console.log('\n================================');
  console.log(`LIVE: ${live.length}`);
  console.log(`DEAD: ${dead.length}`);
  console.log('================================\n');

  fs.writeFileSync('scripts/sports_audit_results.json', JSON.stringify({ live, dead }, null, 2), 'utf8');
}

run();
