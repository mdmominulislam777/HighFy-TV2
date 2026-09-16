const fs = require('fs');

// Read playlist.m3u8
const content = fs.readFileSync('playlist.m3u8', 'utf8');
const lines = content.split('\n');
const parsed = [];
let current = null;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  if (line.startsWith('#EXTINF:')) {
    const logoMatch = line.match(/tvg-logo=\"([^\"]+)\"/);
    const groupMatch = line.match(/group-title=\"([^\"]+)\"/);
    const idMatch = line.match(/tvg-id=\"([^\"]+)\"/);
    const lastComma = line.lastIndexOf(',');
    const name = lastComma !== -1 ? line.substring(lastComma + 1).trim() : 'Channel';

    const logo = logoMatch ? logoMatch[1].trim() : '';
    const group = groupMatch ? groupMatch[1].trim() : 'Live TV';
    const tvgId = idMatch ? idMatch[1].trim() : '';
    current = { name, logo, group, tvgId };
  } else if (line.startsWith('http') && current) {
    current.url = line;
    parsed.push(current);
    current = null;
  }
}

// Curated high-quality logos for major sports & live channels
const CURATED_LOGOS = {
  't sports': 'https://upload.wikimedia.org/wikipedia/en/thumb/9/91/T_Sports_Logo.svg/320px-T_Sports_Logo.svg.png',
  'gtv': 'https://upload.wikimedia.org/wikipedia/en/thumb/f/f6/GTV_Bangladesh_Logo.svg/320px-GTV_Bangladesh_Logo.svg.png',
  'somoy tv': 'https://upload.wikimedia.org/wikipedia/en/thumb/9/9e/Somoy_TV_logo.svg/320px-Somoy_TV_logo.svg.png',
  'jamuna tv': 'https://upload.wikimedia.org/wikipedia/en/thumb/9/9e/Somoy_TV_logo.svg/320px-Somoy_TV_logo.svg.png',
  'channel i': 'https://upload.wikimedia.org/wikipedia/en/thumb/3/30/Channel_i_logo.svg/320px-Channel_i_logo.svg.png',
  'ntv': 'https://upload.wikimedia.org/wikipedia/en/thumb/7/7b/NTV_Bangladesh_Logo.svg/320px-NTV_Bangladesh_Logo.svg.png',
  'deepto tv': 'https://upload.wikimedia.org/wikipedia/en/thumb/d/d4/Deepto_TV_logo.svg/320px-Deepto_TV_logo.svg.png',
  'ekattor tv': 'https://upload.wikimedia.org/wikipedia/en/thumb/6/6f/Ekattor_TV_logo.svg/320px-Ekattor_TV_logo.svg.png',
  'independent tv': 'https://upload.wikimedia.org/wikipedia/en/thumb/d/dd/Independent_Television_logo.svg/320px-Independent_Television_logo.svg.png',
  'btv': 'https://upload.wikimedia.org/wikipedia/en/thumb/c/ca/Bangladesh_Television_%28BTV%29_Logo.svg/320px-Bangladesh_Television_%28BTV%29_Logo.svg.png',
  'maasranga tv': 'https://static.wikia.nocookie.net/etv-gspn-bangla/images/a/a3/Maasranga_TV_HD_logo.png',
  'maasranga hd': 'https://static.wikia.nocookie.net/etv-gspn-bangla/images/a/a3/Maasranga_TV_HD_logo.png',
  'star sports 1 hd': 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d6/Star_Sports_1_logo.svg/320px-Star_Sports_1_logo.svg.png',
  'star sports 1': 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d6/Star_Sports_1_logo.svg/320px-Star_Sports_1_logo.svg.png',
  'star sports-1 hindi': 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d6/Star_Sports_1_logo.svg/320px-Star_Sports_1_logo.svg.png',
  'ptv sports hd': 'https://upload.wikimedia.org/wikipedia/en/thumb/9/91/PTV_Sports_logo.svg/320px-PTV_Sports_logo.svg.png',
  'ptv sports': 'https://upload.wikimedia.org/wikipedia/en/thumb/9/91/PTV_Sports_logo.svg/320px-PTV_Sports_logo.svg.png',
  'sony sports ten 1 hd': 'https://upload.wikimedia.org/wikipedia/en/thumb/5/52/Sony_Sports_Ten_1_Logo.svg/320px-Sony_Sports_Ten_1_Logo.svg.png',
  'sony sports ten 1': 'https://upload.wikimedia.org/wikipedia/en/thumb/5/52/Sony_Sports_Ten_1_Logo.svg/320px-Sony_Sports_Ten_1_Logo.svg.png',
  'sony sports ten 2 hd': 'https://upload.wikimedia.org/wikipedia/en/thumb/5/52/Sony_Sports_Ten_1_Logo.svg/320px-Sony_Sports_Ten_1_Logo.svg.png',
  'sony sports ten 2': 'https://upload.wikimedia.org/wikipedia/en/thumb/5/52/Sony_Sports_Ten_1_Logo.svg/320px-Sony_Sports_Ten_1_Logo.svg.png',
  'sony sports ten 5 hd': 'https://upload.wikimedia.org/wikipedia/en/thumb/5/52/Sony_Sports_Ten_1_Logo.svg/320px-Sony_Sports_Ten_1_Logo.svg.png',
  'sony sports ten 5': 'https://upload.wikimedia.org/wikipedia/en/thumb/5/52/Sony_Sports_Ten_1_Logo.svg/320px-Sony_Sports_Ten_1_Logo.svg.png',
  'sony ten cricket hd': 'https://upload.wikimedia.org/wikipedia/en/thumb/5/52/Sony_Sports_Ten_1_Logo.svg/320px-Sony_Sports_Ten_1_Logo.svg.png',
  'willow hd': 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Willow_TV_logo.svg/320px-Willow_TV_logo.svg.png',
  'willow tv': 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Willow_TV_logo.svg/320px-Willow_TV_logo.svg.png',
  'eurosport 1': 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Eurosport_1_logo_2015.svg/320px-Eurosport_1_logo_2015.svg.png',
  'eurosport 2': 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Eurosport_2_logo_2015.svg/320px-Eurosport_2_logo_2015.svg.png',
  'sky sports premier league': 'https://upload.wikimedia.org/wikipedia/en/thumb/5/5e/Sky_Sports_Premier_League.svg/320px-Sky_Sports_Premier_League.svg.png',
  'sky sports football': 'https://upload.wikimedia.org/wikipedia/en/thumb/8/87/Sky_Sports_Football.svg/320px-Sky_Sports_Football.svg.png',
  'sky sports cricket': 'https://upload.wikimedia.org/wikipedia/en/thumb/c/cb/Sky_Sports_Cricket.svg/320px-Sky_Sports_Cricket.svg.png',
  'sky sports f1': 'https://upload.wikimedia.org/wikipedia/en/thumb/7/7a/Sky_Sports_F1.svg/320px-Sky_Sports_F1.svg.png',
  'cnn': 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/CNN.svg/320px-CNN.svg.png',
  'bbc news': 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/BBC_News_2019.svg/320px-BBC_News_2019.svg.png',
  'cartoon network': 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/80/Cartoon_Network_2010_logo.svg/320px-Cartoon_Network_2010_logo.svg.png',
  'discovery hd': 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/Discovery_Channel_Logo.svg/320px-Discovery_Channel_Logo.svg.png',
  'animal planet hd': 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Animal_Planet_2018.svg/320px-Animal_Planet_2018.svg.png',
  'zee bangla': 'https://upload.wikimedia.org/wikipedia/en/thumb/4/4b/Zee_Bangla_Logo_2023.png/320px-Zee_Bangla_Logo_2023.png',
  'zee cinema hd': 'https://upload.wikimedia.org/wikipedia/en/thumb/4/4c/Zee_Cinema_Logo.svg/320px-Zee_Cinema_Logo.svg.png',
  'sony max hd': 'https://upload.wikimedia.org/wikipedia/en/thumb/2/23/Sony_Max_logo.svg/320px-Sony_Max_logo.svg.png',
  'sony pix hd': 'https://upload.wikimedia.org/wikipedia/en/thumb/6/6e/Sony_PIX_logo.svg/320px-Sony_PIX_logo.svg.png',
  'sony sab hd': 'https://upload.wikimedia.org/wikipedia/en/thumb/5/50/Sony_SAB_Logo_2022.svg/320px-Sony_SAB_Logo_2022.svg.png'
};

const channelMap = new Map();

parsed.forEach((p) => {
  const g = (p.group || '').toLowerCase();
  const isAkashSource = g.includes('bdix') || g.includes('akash') || (p.name || '').startsWith('[BD]');

  let cleanName = p.name
    .replace(/^\[BD\]\s*/i, '')
    .replace(/\s*\(\d+\)+/g, '')
    .replace(/\s*\(1080p\)/i, '')
    .replace(/\s*\[\d+\]/g, '')
    .trim();

  // Normalize names
  if (/^MAASRANGA/i.test(cleanName)) cleanName = 'Maasranga TV HD';
  if (/^T Sports Live/i.test(cleanName) || cleanName === 'T-Sports') cleanName = 'T Sports HD';
  if (/^Sony Ten Sports 1/i.test(cleanName)) cleanName = 'Sony Sports Ten 1 HD';
  if (/^Sony Ten Sports 2/i.test(cleanName)) cleanName = 'Sony Sports Ten 2 HD';
  if (/^Sony Ten Sports 5/i.test(cleanName)) cleanName = 'Sony Sports Ten 5 HD';
  if (/^Sony Ten Cricket/i.test(cleanName)) cleanName = 'Sony Ten Cricket HD';
  if (/^Eurosport HD/i.test(cleanName)) cleanName = 'Eurosport 1 HD';

  const n = cleanName.toLowerCase();

  // Specific check flags
  const isIslamic = g.includes('islam') || g.includes('relagion') || n.includes('quran') || n.includes('sunnah') || n.includes('peace tv') || n.includes('madani') || n.includes('islamic') || n.includes('arihant') || n.includes('ewtn') || n.includes('al ekhbaria') || n.includes('alistiqama') || n.includes('alqamar') || n.includes('almasira');
  const isRadio = g.includes('radio') || n.includes('fm radio');
  const isKids = g.includes('kid') || g.includes('cartoon') || n.includes('cartoon') || n.includes('gopal') || n.includes('motu') || n.includes('tom & jerry') || n.includes('tom & jarry') || n.includes('doraemon') || n.includes('mr bean') || n.includes('yay') || n.includes('pogo') || n.includes('nursary');
  const isMusic = g.includes('music') || n.includes('music') || n.includes('mastii') || n.includes('baallee') || n.includes('hits') || n.includes('zing') || n.includes('yrf') || n.includes('sangeet');
  const isNews = g.includes('news') || n.includes('news') || n.includes('cnn') || n.includes('dw') || n.includes('france 24') || n.includes('france') || n.includes('ndtv') || n.includes('trt') || n.includes('times of india') || n.includes('iran news') || n.includes('somoy') || n.includes('jamuna') || n.includes('ekattor') || n.includes('independent tv') || n.includes('channel 24') || n.includes('dignews') || n.includes('al jazeera') || n.includes('bbc');
  const isMovie = g.includes('movie') || n.includes('movie') || n.includes('cinema') || n.includes('pix') || n.includes('goldmines') || n.includes('action') || n.includes('b4u movie') || n.includes('sheemaroo') || n.includes('bflix') || n.includes('sky cinema');
  const isInfotainment = g.includes('info') || g.includes('docu') || n.includes('discovery') || n.includes('animal') || n.includes('earth') || n.includes('travel') || n.includes('insight') || n.includes('tlc') || n.includes('wild') || n.includes('amazon sat');
  const isKolkata = g.includes('kolkata') || g.includes('indian-bangla') || g.includes('indian bangla') || n.includes('jalsha') || n.includes('aath') || n.includes('colors bangla') || n.includes('zee 24 ghanta') || n.includes('khabor');
  const isPakistan = g.includes('pakistan') || n.includes('hum tv') || n.includes('hum masala') || n.includes('hum sitaray') || n.includes('geo news') || n.includes('ary news');
  const isIndia = g.includes('hindi') || g.includes('indian') || n.includes('star plus') || n.includes('sony sab') || n.includes('sony entertainment') || n.includes('zee tv') || n.includes('&tv') || n.includes('colors') || n.includes('star bharat') || n.includes('dangal') || n.includes('sab tv');
  const isWorld = g.includes('internasional') || g.includes('international') || g.includes('english') || n.includes('saudia arabia') || n.includes('channel 1 news');

  const isSportsName = n.includes('sport') || n.includes('cricket') || n.includes('football') || n.includes('dazn') || n.includes('eurosport') || n.includes('willow') || n.includes('ziggo') || n.includes('tnt') || n.includes('bein') || n.includes('fifa') || n.includes('wwe') || n.includes('f1') || n.includes('racing') || n.includes('tennis') || n.includes('premier league') || n.includes('laliga') || n.includes('fancode') || n.includes('peacock') || n.includes('nba') || n.includes('nhl') || n.includes('epl') || n.includes('ptv sports') || n.includes('super sport') || n.includes('supersport') || n.includes('espn') || n.includes('tudn') || n.includes('telemundo') || n.includes('cbs sports') || n.includes('nbc sports') || n.includes('fox sports') || n.includes('fs1') || n.includes('fs2') || n.includes('astro cricket') || n.includes('criclife') || n.includes('hub sports') || n.includes('mlb') || n.includes('tsn') || n.includes('florugby') || n.includes('stan sport') || n.includes('kantipur max') || n.includes('a sports');

  const isSportsChannel = (g.includes('sport') || g.includes('cricket') || g.includes('football') || isSportsName) && !isIslamic && !isRadio && !isKids && !n.includes('iran news') && !n.includes('saudia arabia') && !n.includes('channel 1 news') && !n.includes('sky cinema');

  let primaryCat = 'Live TV';
  const categories = ['LiveTV'];
  const sportsTags = [];
  let priority = 5;

  if (isSportsChannel) {
    primaryCat = 'Sports';
    categories.push('Sports');

    // Determine exact sports supported by this channel
    if (n.includes('cricket') || n.includes('willow') || n.includes('ptv') || n.includes('star sports') || n.includes('criclife') || n.includes('astro cricket') || n.includes('t sports') || n.includes('gtv') || n.includes('nagorik') || n.includes('maasranga') || n.includes('ten sports') || n.includes('a sports') || n.includes('sky sports cricket') || n.includes('fancode') || n.includes('fox cricket') || n.includes('supersport cricket') || n.includes('4k cricket')) {
      sportsTags.push('Cricket');
    }

    if (n.includes('football') || n.includes('premier') || n.includes('fifa') || n.includes('bein') || n.includes('ucl') || n.includes('laliga') || n.includes('epl') || n.includes('t sports') || n.includes('sony sports ten 2') || n.includes('sony ten 2') || n.includes('sky sports football') || n.includes('sky sports premier') || n.includes('supersport football') || n.includes('supersport premier') || n.includes('tnt sports') || n.includes('dazn') || n.includes('ziggo') || n.includes('go3') || n.includes('tudn') || n.includes('telemundo') || n.includes('cbs sports') || n.includes('espn') || n.includes('super football') || n.includes('mundial') || n.includes('a spor') || n.includes('eleven sports')) {
      sportsTags.push('Football');
    }

    if (n.includes('f1') || n.includes('motor') || n.includes('racing') || n.includes('formula 1') || n.includes('motogp')) {
      sportsTags.push('F1', 'Motorsport');
    }

    if (n.includes('wwe') || n.includes('wrest') || n.includes('usa network') || n.includes('sony sports ten 1') || n.includes('sony ten 1') || n.includes('sony sports ten 3') || n.includes('sony ten 3')) {
      sportsTags.push('WWE');
    }

    if (n.includes('tennis') || n.includes('eurosport') || n.includes('sony sports ten 2') || n.includes('sony sports ten 5') || n.includes('sony ten 5') || n.includes('sky sports tennis')) {
      sportsTags.push('Tennis');
    }

    if (n.includes('basketball') || n.includes('nba') || n.includes('tnt sports') || n.includes('espn')) {
      sportsTags.push('Basketball');
    }

    if (n.includes('hockey') || n.includes('nhl') || n.includes('eurosport') || n.includes('sony sports ten 1') || n.includes('sony sports ten 5')) {
      sportsTags.push('Hockey');
    }

    if (n.includes('rugby') || n.includes('supersport rugby') || n.includes('florugby')) {
      sportsTags.push('Rugby');
    }

    if (n.includes('kabaddi') || n.includes('star sports 1') || n.includes('star sports 2') || n.includes('sony sports ten 1')) {
      sportsTags.push('Kabaddi');
    }

    if (n.includes('baseball') || n.includes('mlb') || n.includes('tbs') || n.includes('sportsnet') || n.includes('fancode')) {
      sportsTags.push('Baseball');
    }

    if (n.includes('golf') || n.includes('sky sports golf')) {
      sportsTags.push('Golf');
    }

    if (n.includes('boxing') || n.includes('mma') || n.includes('ufc') || n.includes('dazn') || n.includes('tnt sports')) {
      sportsTags.push('Boxing', 'MMA');
    }

    // Default sport tag if general sports
    if (sportsTags.length === 0) {
      sportsTags.push('Football', 'Cricket');
    }

    // Priority
    if (n.includes('t sports') || n.includes('star sports 1') || n.includes('ptv sports') || n.includes('sony sports ten 1') || n.includes('sony sports ten 2') || n.includes('willow')) {
      priority = 1;
    } else if (n.includes('sky sports') || n.includes('supersport') || n.includes('bein') || n.includes('tnt sports') || n.includes('eurosport 1')) {
      priority = 2;
    } else {
      priority = 3;
    }
  } else if (isIslamic) {
    primaryCat = 'Islamic';
    categories.push('Islamic');
  } else if (isRadio) {
    primaryCat = 'Radio';
    categories.push('Radio');
  } else if (isKids) {
    primaryCat = 'Kids';
    categories.push('Kids', 'Entertainment');
  } else if (isMusic) {
    primaryCat = 'Music';
    categories.push('Music', 'Entertainment');
  } else if (isMovie) {
    primaryCat = 'Movies';
    categories.push('Movies', 'Entertainment');
  } else if (isKolkata) {
    primaryCat = 'Kolkata';
    categories.push('Kolkata', 'Bengali', 'Entertainment');
  } else if (g.includes('bangla') || g.includes('bangladeshi') || n.includes('somoy') || n.includes('jamuna') || n.includes('ntv') || n.includes('ekattor') || n.includes('deepto') || n.includes('maasranga') || n.includes('desh') || n.includes('bijoy') || n.includes('asian') || n.includes('mohona') || n.includes('rtv') || n.includes('btv') || n.includes('channel i') || n.includes('channel s') || n.includes('nagorik') || n.includes('ekhon') || n.includes('global tv') || n.includes('rajdhani') || n.includes('ananda') || n.includes('nexus') || n.includes('ekushey') || n.includes('my tv') || n.includes('pcv') || n.includes('music bangla')) {
    primaryCat = 'Bengali';
    categories.push('Bengali', 'Bangla', 'Entertainment');
  } else if (isNews) {
    primaryCat = 'News';
    categories.push('News');
    if (isWorld) categories.push('World Country', 'World');
  } else if (isPakistan) {
    primaryCat = 'Pakistan';
    categories.push('Pakistan', 'Entertainment');
  } else if (isIndia) {
    primaryCat = 'India';
    categories.push('India', 'Entertainment');
  } else if (isInfotainment) {
    primaryCat = 'Infotainment';
    categories.push('Infotainment');
  } else {
    primaryCat = 'Entertainment';
    categories.push('Entertainment');
  }

  if (isAkashSource) {
    categories.push('Akash Go');
  }

  const id = 'ch-' + cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  let logo = p.logo;
  for (const [key, l] of Object.entries(CURATED_LOGOS)) {
    if (cleanName.toLowerCase().includes(key) || key.includes(cleanName.toLowerCase())) {
      logo = l;
      break;
    }
  }

  if (!channelMap.has(id)) {
    channelMap.set(id, {
      id: id,
      name: cleanName,
      category: primaryCat,
      categories: Array.from(new Set(categories)),
      sports: Array.from(new Set(sportsTags)),
      priority: priority,
      active: true,
      provider: isAkashSource ? 'Akash Go' : 'Standard',
      isAkashGo: isAkashSource,
      logo: logo || p.logo,
      url: p.url,
      streamUrl: p.url,
      stream_url: p.url,
      streams: [{
        name: `${cleanName} (Server 1 HD)`,
        serverLabel: 'Server 1 HD',
        channelName: cleanName,
        url: p.url,
        quality: '1080p FHD'
      }],
      backupUrls: [],
      isLive: true,
      isHD: true
    });
  } else {
    const existing = channelMap.get(id);
    if (!existing.backupUrls.includes(p.url) && existing.url !== p.url) {
      existing.backupUrls.push(p.url);
      existing.streams.push({
        name: `${cleanName} (Server ${existing.streams.length + 1})`,
        serverLabel: `Server ${existing.streams.length + 1}`,
        channelName: cleanName,
        url: p.url,
        quality: '720p HD'
      });
    }
    if (isAkashSource) {
      existing.isAkashGo = true;
      existing.provider = 'Akash Go';
      if (!existing.categories.includes('Akash Go')) {
        existing.categories.push('Akash Go');
      }
    }
    // Merge categories & sports
    categories.forEach(c => {
      if (!existing.categories.includes(c)) existing.categories.push(c);
    });
    sportsTags.forEach(s => {
      if (!existing.sports.includes(s)) existing.sports.push(s);
    });
    if (!existing.logo && logo) {
      existing.logo = logo;
    }
  }
});

let channelArray = Array.from(channelMap.values());

// Filter dead channels if verified list exists
if (fs.existsSync('scripts/non_ayana_working_channels.json')) {
  const verifiedNonAyana = JSON.parse(fs.readFileSync('scripts/non_ayana_working_channels.json', 'utf8'));
  const verifiedMap = new Map(verifiedNonAyana.map(c => [c.id, c]));
  channelArray = channelArray
    .filter(c => verifiedMap.has(c.id))
    .map(c => {
      const v = verifiedMap.get(c.id);
      return {
        ...c,
        streamUrl: v.streamUrl,
        url: v.url,
        stream_url: v.stream_url
      };
    });
  console.log('Retained', channelArray.length, 'verified active non-Ayana channels.');
}

// Append authentic Ayana channels from user's file strictly in Ayana category
if (fs.existsSync('scripts/parsed_ayana_channels.json')) {
  const ayanaChannels = JSON.parse(fs.readFileSync('scripts/parsed_ayana_channels.json', 'utf8'));
  ayanaChannels.forEach(ac => {
    channelArray.push({
      id: ac.id,
      name: ac.name,
      category: 'Ayana',
      categories: ['Ayana'],
      sports: [],
      priority: 1,
      active: true,
      streamUrl: ac.streamUrl,
      url: ac.streamUrl,
      stream_url: ac.streamUrl,
      logo: ac.logo,
      provider: 'Ayana',
      isAyana: true,
      isAyna: true,
      originalGroup: ac.originalGroup || ''
    });
  });
  console.log('Appended', ayanaChannels.length, 'Ayana channels strictly into Ayana category.');
}

fs.writeFileSync('channels.json', JSON.stringify(channelArray, null, 2), 'utf8');

// Apply user's categorized live channels
if (fs.existsSync('scripts/integrate_user_channels.cjs')) {
  require('./integrate_user_channels.cjs');
}
if (fs.existsSync('scripts/integrate_sports_channels.cjs')) {
  require('./integrate_sports_channels.cjs');
}
channelArray = JSON.parse(fs.readFileSync('channels.json', 'utf8'));

console.log('Successfully wrote', channelArray.length, 'unique authentic channels into channels.json');
const akashCount = channelArray.filter(c => c.isAkashGo || (c.categories && c.categories.includes('Akash Go'))).length;
console.log('Akash Go channels count:', akashCount);
const sportsCount = channelArray.filter(c => c.category === 'Sports').length;
console.log('Sports channels count:', sportsCount);

if (fs.existsSync('scripts/sync_playlist.cjs')) {
  require('./sync_playlist.cjs');
}

