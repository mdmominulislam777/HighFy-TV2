const fs = require('fs');

async function testUrl(url, timeoutMs = 6000) {
  if (!url || typeof url !== 'string' || !url.startsWith('http')) {
    return { ok: false, reason: 'Invalid URL' };
  }
  try {
    const c = new AbortController();
    const timer = setTimeout(() => c.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: c.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
      }
    });
    clearTimeout(timer);

    if (!res.ok) {
      return { ok: false, reason: 'HTTP ' + res.status };
    }

    const text = await res.text();
    if (!text || text.length < 10) {
      return { ok: false, reason: 'Empty response' };
    }

    // Check if valid m3u8
    const isM3U = text.includes('#EXTM3U');
    const hasMedia = text.includes('#EXTINF') || text.includes('.ts') || text.includes('.m3u8') || text.includes('#EXT-X-STREAM-INF');

    if (!isM3U && !hasMedia) {
      return { ok: false, reason: 'Not an HLS playlist' };
    }

    // If master playlist, test first child playlist
    if (text.includes('#EXT-X-STREAM-INF')) {
      const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
      if (lines.length > 0) {
        let childUrl = lines[0];
        if (!childUrl.startsWith('http')) {
          childUrl = new URL(childUrl, url).toString();
        }
        try {
          const c2 = new AbortController();
          const t2 = setTimeout(() => c2.abort(), 4000);
          const childRes = await fetch(childUrl, {
            signal: c2.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            }
          });
          clearTimeout(t2);
          if (!childRes.ok) {
            return { ok: false, reason: 'Child playlist HTTP ' + childRes.status };
          }
          const childText = await childRes.text();
          if (!childText.includes('#EXTM3U') && !childText.includes('#EXTINF') && !childText.includes('.ts')) {
            return { ok: false, reason: 'Invalid child playlist content' };
          }
        } catch (childErr) {
          // If child fails with network/abort, warn but if master was valid, check severity
          return { ok: false, reason: 'Child stream: ' + (childErr.name || childErr.message) };
        }
      }
    }

    return { ok: true, textSnippet: text.substring(0, 100) };
  } catch (err) {
    return { ok: false, reason: err.name || err.message };
  }
}

async function auditSports() {
  const channels = JSON.parse(fs.readFileSync('channels.json', 'utf8'));

  const sportsKeywords = ['sport', 'cricket', 'football', 'wwe', 'tennis', 'golf', 'fight', 'motor', 'racing', 'espn', 'euro', 'willow', 'sony ten', 'star sport', 'bein', 'tsn', 'dazn', 'fox sport', 'ziggo', 'super sport', 'astro', 'premier'];

  const sportsChannels = channels.filter(c => {
    const cat = (c.category || '').toLowerCase();
    const cats = Array.isArray(c.categories) ? c.categories.map(x => String(x).toLowerCase()) : [];
    const hasSports = Array.isArray(c.sports) && c.sports.length > 0;
    const nameMatch = sportsKeywords.some(k => (c.name || '').toLowerCase().includes(k));
    return cat === 'sports' || cats.includes('sports') || hasSports || nameMatch;
  });

  console.log('Auditing', sportsChannels.length, 'sports channels in channels.json...');

  const working = [];
  const dead = [];

  const batchSize = 10;
  for (let i = 0; i < sportsChannels.length; i += batchSize) {
    const batch = sportsChannels.slice(i, i + batchSize);
    await Promise.all(batch.map(async (ch) => {
      const candidates = [];
      if (ch.streamUrl) candidates.push(ch.streamUrl);
      if (ch.url && !candidates.includes(ch.url)) candidates.push(ch.url);
      if (ch.stream_url && !candidates.includes(ch.stream_url)) candidates.push(ch.stream_url);
      if (Array.isArray(ch.backupUrls)) {
        ch.backupUrls.forEach(u => { if (u && !candidates.includes(u)) candidates.push(u); });
      }
      if (Array.isArray(ch.streams)) {
        ch.streams.forEach(s => { if (s && s.url && !candidates.includes(s.url)) candidates.push(s.url); });
      }

      let workingCandidate = null;
      let lastReason = 'No candidate URLs';

      for (const u of candidates) {
        const testRes = await testUrl(u);
        if (testRes.ok) {
          workingCandidate = u;
          break;
        } else {
          lastReason = testRes.reason;
        }
      }

      if (workingCandidate) {
        working.push({
          channel: ch,
          workingUrl: workingCandidate
        });
        console.log('[LIVE ✓]', ch.name, '->', workingCandidate);
      } else {
        dead.push({
          channel: ch,
          reason: lastReason
        });
        console.log('[DEAD ✗]', ch.name, '->', lastReason, '(' + (ch.streamUrl || 'no url') + ')');
      }
    }));
  }

  console.log('\n==============================');
  console.log('SPORTS AUDIT SUMMARY:');
  console.log('Total sports channels tested:', sportsChannels.length);
  console.log('Working (Live streams confirmed):', working.length);
  console.log('Dead (Failed streams):', dead.length);
  console.log('==============================\n');

  fs.writeFileSync('scripts/sports_working.json', JSON.stringify(working, null, 2));
  fs.writeFileSync('scripts/sports_dead.json', JSON.stringify(dead, null, 2));
}

auditSports();
