const https = require('https');

const sampleChannels = [
  { id: 162, name: 'Sony Ten 1 HD', group: 'Sports' },
  { id: 155, name: 'Sony Ten 5 HD', group: 'Sports' },
  { id: 514, name: 'Sony Ten 1', group: 'Sports' },
  { id: 523, name: 'Ten 2', group: 'Sports' },
  { id: 524, name: 'Sony Ten 3 Hindi', group: 'Sports' },
  { id: 525, name: 'Sony Ten 5', group: 'Sports' },
  { id: 891, name: 'Sony Ten 2 HD', group: 'Sports' },
  { id: 892, name: 'Sony Ten 3 HD Hindi', group: 'Sports' },
  { id: 875, name: 'Eurosport HD', group: 'Sports' },
  { id: 1984, name: 'Star Sports 2 Hindi HD', group: 'Sports' },
  { id: 1998, name: 'Star Sports Khel', group: 'Sports' },
  { id: 3372, name: 'Sony LIV Sports 1', group: 'Sports' },
  { id: 3510, name: 'Sony Sports Ten 1 HD STB', group: 'Sports' },
  { id: 3511, name: 'Sony Sports Ten 2 HD STB', group: 'Sports' },
  { id: 204, name: 'DD Sports', group: 'Sports' },
  { id: 3146, name: 'All Women Sports Network', group: 'Sports' },
  { id: 173, name: 'Aaj Tak', group: 'News' },
  { id: 231, name: 'News 18 India', group: 'News' },
  { id: 464, name: 'Zee 24 Ghanta', group: 'News' },
  { id: 177, name: 'ABP News India', group: 'News' },
  { id: 144, name: 'Colors HD', group: 'Entertainment' },
  { id: 154, name: 'Sony SAB', group: 'Entertainment' },
  { id: 167, name: 'Zee TV HD', group: 'Entertainment' },
  { id: 291, name: 'SET HD', group: 'Entertainment' },
  { id: 317, name: 'Star Jalsha HD', group: 'Entertainment' },
  { id: 625, name: 'Zee Bangla', group: 'Entertainment' },
  { id: 697, name: 'Sony AATH', group: 'Entertainment' },
  { id: 1763, name: 'Colors Cineplex Bollywood', group: 'Movies' },
  { id: 165, name: 'Zee Cinema HD', group: 'Movies' },
  { id: 289, name: 'Sony Max SD', group: 'Movies' },
  { id: 545, name: 'Nick Hindi', group: 'Kids' },
  { id: 559, name: 'Pogo Hindi', group: 'Kids' }
];

async function checkChannel(ch) {
  const url = `https://hey-lookme.shop/live.php?id=${ch.id}`;
  return new Promise((resolve) => {
    let isDone = false;
    const timer = setTimeout(() => {
      if (!isDone) {
        isDone = true;
        resolve({ ...ch, status: 'TIMEOUT', live: false, details: 'Request timed out' });
      }
    }, 6000);

    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Referer': 'https://hey-lookme.shop/'
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (isDone) return;
        isDone = true;
        clearTimeout(timer);

        if (res.statusCode === 200 && body.includes('#EXTM3U')) {
          // Check if wanda or variant stream exists
          const hasStream = body.includes('wanda.php') || body.includes('.m3u8') || body.includes('EXT-X-STREAM-INF');
          resolve({
            ...ch,
            status: '200 OK',
            live: hasStream,
            details: hasStream ? 'Live HLS Stream Available' : 'Manifest returned but no variants'
          });
        } else {
          resolve({
            ...ch,
            status: `HTTP ${res.statusCode}`,
            live: false,
            details: body.substring(0, 50).trim()
          });
        }
      });
    });

    req.on('error', (e) => {
      if (isDone) return;
      isDone = true;
      clearTimeout(timer);
      resolve({ ...ch, status: 'ERROR', live: false, details: e.message });
    });
  });
}

async function run() {
  console.log(`Auditing ${sampleChannels.length} sample channels from hey-lookme.shop...`);
  const results = await Promise.all(sampleChannels.map(c => checkChannel(c)));

  let liveCount = 0;
  let deadCount = 0;

  console.log('\n--- AUDIT RESULTS ---');
  results.forEach(r => {
    const mark = r.live ? '✓ LIVE' : '✗ DEAD';
    if (r.live) liveCount++; else deadCount++;
    console.log(`${mark} | ${r.name.padEnd(26)} | ${r.group.padEnd(14)} | id=${r.id} | ${r.status} | ${r.details}`);
  });

  console.log('\n================================');
  console.log(`TOTAL TESTED: ${results.length}`);
  console.log(`LIVE / WORKING: ${liveCount}`);
  console.log(`DEAD / OFFLINE: ${deadCount}`);
  console.log('================================');
}

run();
