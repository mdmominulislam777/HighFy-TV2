const fs = require('fs');

function syncPlaylist() {
  const channels = JSON.parse(fs.readFileSync('channels.json', 'utf8'));

  let m3u8 = '#EXTM3U\n\n';

  channels.forEach(c => {
    const streamUrl = c.streamUrl || c.url || c.stream_url;
    if (!streamUrl) return;

    const groupTitle = c.category || 'Other';
    const logoAttr = c.logo ? ` tvg-logo="${c.logo}"` : '';
    const idAttr = c.id ? ` tvg-id="${c.id}"` : '';
    const nameAttr = c.name ? ` tvg-name="${c.name}"` : '';

    m3u8 += `#EXTINF:-1 group-title="${groupTitle}"${idAttr}${nameAttr}${logoAttr},${c.name}\n`;
    m3u8 += `${streamUrl}\n\n`;
  });

  fs.writeFileSync('playlist.m3u8', m3u8, 'utf8');
  console.log(`Synchronized playlist.m3u8 with ${channels.length} verified active channels.`);
}

syncPlaylist();
