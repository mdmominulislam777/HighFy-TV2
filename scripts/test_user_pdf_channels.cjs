const fs = require('fs');

async function testChannel(ch) {
  const url = ch.url;
  if (!url || !url.startsWith('http')) {
    return { ...ch, ok: false, reason: 'Invalid URL' };
  }

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*'
      }
    });
    clearTimeout(t);

    if (!res.ok) {
      return { ...ch, ok: false, reason: 'HTTP ' + res.status };
    }

    const text = await res.text();
    if (!text || text.length < 15 || (!text.includes('#EXTM3U') && !text.includes('#EXTINF') && !text.includes('.ts'))) {
      return { ...ch, ok: false, reason: 'Not a valid HLS playlist (length ' + (text ? text.length : 0) + ')' };
    }

    // Check media segments or child playlist
    const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    if (lines.length === 0) {
      return { ...ch, ok: false, reason: 'Empty playlist (no media entries)' };
    }

    let firstItem = lines[0];
    if (!firstItem.startsWith('http')) {
      firstItem = new URL(firstItem, url).toString();
    }

    // Fetch child playlist or chunk to confirm downstream stream is alive
    const ctrl2 = new AbortController();
    const t2 = setTimeout(() => ctrl2.abort(), 5000);
    const resChild = await fetch(firstItem, {
      signal: ctrl2.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Range': 'bytes=0-1000'
      }
    });
    clearTimeout(t2);

    if (!resChild.ok) {
      return { ...ch, ok: false, reason: 'Media segment HTTP ' + resChild.status };
    }

    return { ...ch, ok: true, status: res.status };
  } catch (err) {
    return { ...ch, ok: false, reason: err.name || err.message };
  }
}

async function run() {
  const list = JSON.parse(fs.readFileSync('scripts/user_pdf_channels.json', 'utf8'));
  console.log(`Starting thorough audit of all ${list.length} channels from PDF...`);

  const results = [];
  const batchSize = 10;
  for (let i = 0; i < list.length; i += batchSize) {
    const batch = list.slice(i, i + batchSize);
    const resBatch = await Promise.all(batch.map(testChannel));
    results.push(...resBatch);
    console.log(`Tested ${results.length}/${list.length} channels...`);
  }

  const live = results.filter(r => r.ok);
  const dead = results.filter(r => !r.ok);

  console.log('\n=======================================');
  console.log(`PDF Channels Audit Results:`);
  console.log(`Total channels tested: ${list.length}`);
  console.log(`Working / Live channels: ${live.length}`);
  console.log(`Dead / Unreachable channels: ${dead.length}`);
  console.log('=======================================\n');

  console.log('--- LIVE CHANNELS ---');
  live.forEach((c, idx) => console.log(`${idx + 1}. [LIVE] ${c.name} -> ${c.url}`));

  console.log('\n--- DEAD CHANNELS ---');
  dead.forEach((c, idx) => console.log(`${idx + 1}. [DEAD] ${c.name} -> ${c.reason} (${c.url})`));

  fs.writeFileSync('scripts/pdf_audit_results.json', JSON.stringify({ live, dead }, null, 2), 'utf8');
}

run();
