const fs = require('fs');

// 1. Read existing channels
const existing = JSON.parse(fs.readFileSync('channels.json', 'utf8'));
const ayana = JSON.parse(fs.readFileSync('scripts/parsed_ayana_channels.json', 'utf8'));

// Filter out any existing channels that have aynaott urls or are ayna category
const cleanExisting = existing.filter(ch => {
  const url = (ch.streamUrl || ch.url || '').toLowerCase();
  const cat = (ch.category || '').toLowerCase();
  const prov = (ch.provider || '').toLowerCase();
  return !url.includes('aynaott.com') && !url.includes('aynascope.com') && cat !== 'ayna' && cat !== 'ayana' && prov !== 'ayana';
});

console.log('Clean existing channels:', cleanExisting.length);

// Ensure every ayana channel is strictly configured
const formattedAyana = ayana.map(ch => ({
  id: ch.id,
  name: ch.name,
  category: 'Ayana',
  categories: ['Ayana'],
  sports: [],
  priority: 1,
  active: true,
  streamUrl: ch.streamUrl,
  url: ch.streamUrl,
  stream_url: ch.streamUrl,
  logo: ch.logo,
  provider: 'Ayana',
  isAyana: true,
  isAyna: true,
  originalGroup: ch.originalGroup || ''
}));

console.log('Formatted Ayana channels:', formattedAyana.length);

// Combine
const merged = [...cleanExisting, ...formattedAyana];
console.log('Total merged channels:', merged.length);

fs.writeFileSync('channels.json', JSON.stringify(merged, null, 2));

// 2. Update categories.json
const categories = JSON.parse(fs.readFileSync('categories.json', 'utf8'));
let foundAyna = false;
for (const cat of categories) {
  if (cat.id === 'ayna') {
    cat.name = 'Ayana';
    cat.description = 'Ayana OTT Live TV Channels, Bengali Cinema, Natok & Entertainment';
    foundAyna = true;
  }
}
if (!foundAyna) {
  categories.push({
    id: 'ayna',
    name: 'Ayana',
    icon: 'fa-film',
    logo: './assets/category-logos/ayna.svg',
    ringColor: '#6366f1',
    glowColor: 'rgba(99, 102, 241, 0.4)',
    description: 'Ayana OTT Live TV Channels, Bengali Cinema, Natok & Entertainment'
  });
}

fs.writeFileSync('categories.json', JSON.stringify(categories, null, 2));
console.log('Updated categories.json successfully');
