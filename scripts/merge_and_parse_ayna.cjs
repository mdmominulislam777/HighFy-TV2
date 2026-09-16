const fs = require('fs');

const raw1 = fs.readFileSync('scripts/raw_pdf_ocr_part1.txt', 'utf8');
const raw2 = fs.readFileSync('scripts/raw_pdf_ocr_part2.txt', 'utf8');
const raw3 = fs.readFileSync('scripts/raw_pdf_ocr_part3.txt', 'utf8');

const combined = raw1 + '\n' + raw2 + '\n' + raw3;

// Clean up wrapped lines: in the raw OCR, lines inside #EXTINF or inside URLs are wrapped
const rawLines = combined.split('\n');
const reconstructedLines = [];
let buffer = '';

for (let i = 0; i < rawLines.length; i++) {
  const line = rawLines[i].trim();
  if (!line) continue;
  if (line.startsWith('#EXTM3U') || line.startsWith('#=')) continue;
  if (line.startsWith('# Developed') || line.startsWith('# Telegram') || line.startsWith('# Last Updated') || line.startsWith('# All channel')) continue;

  if (line.startsWith('#EXTINF:')) {
    if (buffer) reconstructedLines.push(buffer);
    buffer = line;
  } else if (line.startsWith('http://') || line.startsWith('https://')) {
    if (buffer) {
      reconstructedLines.push(buffer);
      buffer = '';
    }
    buffer = line;
  } else {
    // Continuation of previous line (wrapped text)
    buffer = buffer + line;
  }
}
if (buffer) reconstructedLines.push(buffer);

console.log('Reconstructed lines count:', reconstructedLines.length);

// Now pair #EXTINF with url
const channels = [];
for (let i = 0; i < reconstructedLines.length; i++) {
  const line = reconstructedLines[i];
  if (line.startsWith('#EXTINF:')) {
    const nextLine = reconstructedLines[i + 1];
    const url = (nextLine && (nextLine.startsWith('http://') || nextLine.startsWith('https://'))) ? nextLine : '';
    
    const idMatch = line.match(/tvg-id=\"([^\"]+)\"/);
    const nameMatch = line.match(/tvg-name=\"([^\"]+)\"/);
    const logoMatch = line.match(/tvg-logo=\"([^\"]+)\"/);
    const groupMatch = line.match(/group-title=\"([^\"]+)\"/);
    const lastComma = line.lastIndexOf(',');
    const channelTitle = lastComma !== -1 ? line.substring(lastComma + 1).trim() : (nameMatch ? nameMatch[1].trim() : 'Channel');

    const tvgId = idMatch ? idMatch[1] : '';
    const tvgName = nameMatch ? nameMatch[1].trim() : channelTitle;
    const logo = logoMatch ? logoMatch[1].replace(/\s+/g, '') : '';
    const group = groupMatch ? groupMatch[1] : 'Ayana';

    if (url) {
      channels.push({
        id: 'ch-ayna-' + (tvgId || channelTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')),
        name: channelTitle,
        category: 'Ayana',
        categories: ['Ayana'],
        sports: [],
        priority: 1,
        active: true,
        streamUrl: url,
        url: url,
        logo: logo,
        provider: 'Ayana',
        isAyana: true,
        isAyna: true,
        originalGroup: group
      });
      i++; // Skip the URL line
    }
  }
}

console.log('Total parsed Ayana channels:', channels.length);
channels.slice(0, 10).forEach(c => console.log(c.name, '|', c.url, '|', c.category));
fs.writeFileSync('scripts/parsed_ayana_channels.json', JSON.stringify(channels, null, 2));
