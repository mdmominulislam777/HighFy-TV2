const fs = require('fs');

async function testChannelThoroughly(c) {
  const url = c.streamUrl;
  if (!url || !url.startsWith('http') || url.includes('.mpd') || url.includes('giatv-209592')) {
    return { ok: false, reason: 'Invalid or placeholder/DRM URL' };
  }

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*'
      }
    });
    clearTimeout(t);

    if (!res.ok) {
      return { ok: false, reason: 'HTTP ' + res.status };
    }

    const text = await res.text();
    if (!text || text.length < 20 || !text.includes('#EXTM3U')) {
      return { ok: false, reason: 'Empty or not an M3U8 playlist' };
    }

    const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    if (lines.length === 0) {
      return { ok: false, reason: 'No media segments in playlist' };
    }

    let firstMedia = lines[0];
    if (!firstMedia.startsWith('http')) {
      firstMedia = new URL(firstMedia, url).toString();
    }

    // Now test if the subplaylist or segment actually loads!
    const ctrl2 = new AbortController();
    const t2 = setTimeout(() => ctrl2.abort(), 4000);
    const resMedia = await fetch(firstMedia, {
      signal: ctrl2.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Range': 'bytes=0-1000'
      }
    });
    clearTimeout(t2);

    if (!resMedia.ok) {
      return { ok: false, reason: 'Media/Child segment HTTP ' + resMedia.status };
    }

    const mediaTextOrBuf = await resMedia.text();
    // If it was a sub-playlist, verify it has segments
    if (firstMedia.endsWith('.m3u8') || mediaTextOrBuf.includes('#EXTM3U')) {
      const subLines = mediaTextOrBuf.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
      if (subLines.length === 0) {
        return { ok: false, reason: 'Child playlist has no segments' };
      }
      let segmentUrl = subLines[0];
      if (!segmentUrl.startsWith('http')) {
        segmentUrl = new URL(segmentUrl, firstMedia).toString();
      }
      const ctrl3 = new AbortController();
      const t3 = setTimeout(() => ctrl3.abort(), 4000);
      const resSeg = await fetch(segmentUrl, {
        signal: ctrl3.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Range': 'bytes=0-500'
        }
      });
      clearTimeout(t3);
      if (!resSeg.ok) {
        return { ok: false, reason: 'TS Segment HTTP ' + resSeg.status };
      }
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.name || err.message };
  }
}

async function runTest() {
  const channels = JSON.parse(fs.readFileSync('channels.json', 'utf8'));
  const sports = channels.filter(c => {
    const cat = (c.category || '').toLowerCase();
    const cats = Array.isArray(c.categories) ? c.categories.map(x => String(x).toLowerCase()) : [];
    const hasSports = Array.isArray(c.sports) && c.sports.length > 0;
    return cat === 'sports' || cats.includes('sports') || hasSports;
  });

  console.log(`Starting deep verification of all ${sports.length} sports channels in channels.json...`);

  const results = [];
  const batchSize = 10;
  for (let i = 0; i < sports.length; i += batchSize) {
    const batch = sports.slice(i, i + batchSize);
    await Promise.all(batch.map(async (c) => {
      const res = await testChannelThoroughly(c);
      results.push({ channel: c, ...res });
      if (res.ok) {
        console.log(`[PASS ✓] ${c.name} (${c.id})`);
      } else {
        console.log(`[FAIL ✗] ${c.name} (${c.id}) -> ${res.reason}`);
      }
    }));
  }

  const live = results.filter(r => r.ok);
  const dead = results.filter(r => !r.ok);

  console.log('\n==================================');
  console.log(`Deep Sports Audit Complete:`);
  console.log(`Total Sports Channels: ${sports.length}`);
  console.log(`Verified Live & Working: ${live.length}`);
  console.log(`Dead / Broken Channels to Remove: ${dead.length}`);
  console.log('==================================\n');

  fs.writeFileSync('scripts/sports_deep_audit_results.json', JSON.stringify({
    live: live.map(l => l.channel),
    dead: dead.map(d => ({ channel: d.channel, reason: d.reason }))
  }, null, 2));
}

runTest();
