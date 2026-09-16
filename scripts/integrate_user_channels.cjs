const fs = require('fs');

const channelsFile = 'channels.json';
const channels = JSON.parse(fs.readFileSync(channelsFile, 'utf8'));

// Canonical metadata mapping for the 64 live verified channels from user's PDF
const channelMetadata = {
  // Page 1
  "Channel I": {
    id: "ch-channel-i",
    category: "Bangla",
    categories: ["Bangla", "Entertainment"],
    sports: [],
    logo: "./assets/channel-logos/ch-channel-i.svg"
  },
  "NTV": {
    id: "ch-ntv-live",
    category: "Bangla",
    categories: ["Bangla", "News", "Entertainment"],
    sports: [],
    logo: "./assets/channel-logos/ch-ntv-bd.svg"
  },
  "Bangla Vision": {
    id: "ch-banglavision",
    category: "Bangla",
    categories: ["Bangla", "Entertainment", "News"],
    sports: [],
    logo: "https://upload.wikimedia.org/wikipedia/en/thumb/0/07/Banglavision_logo.svg/320px-Banglavision_logo.svg.png"
  },
  "ATN Bangla": {
    id: "ch-atn-bangla",
    category: "Bangla",
    categories: ["Bangla", "Entertainment"],
    sports: [],
    logo: "./assets/channel-logos/ch-atn-bangla.svg"
  },
  "RTV": {
    id: "ch-rtv",
    category: "Bangla",
    categories: ["Bangla", "Entertainment"],
    sports: [],
    logo: "https://upload.wikimedia.org/wikipedia/en/thumb/1/1d/RTV_Bangladesh_Logo.svg/320px-RTV_Bangladesh_Logo.svg.png"
  },
  "Duronto TV": {
    id: "ch-duronto-tv",
    category: "Kids",
    categories: ["Kids", "Bangla"],
    sports: [],
    logo: "https://upload.wikimedia.org/wikipedia/en/thumb/7/7b/Duronto_TV_logo.svg/320px-Duronto_TV_logo.svg.png"
  },
  "ETV": {
    id: "ch-ekushey-tv",
    category: "Bangla",
    categories: ["Bangla", "Entertainment"],
    sports: [],
    logo: "./assets/channel-logos/ch-ekushey-tv.svg"
  },
  "Ekhon TV": {
    id: "ch-ekhon-tv",
    category: "News",
    categories: ["News", "Bangla"],
    sports: [],
    logo: "https://upload.wikimedia.org/wikipedia/en/thumb/c/cf/Ekhon_TV_logo.png/320px-Ekhon_TV_logo.png"
  },
  "Desh TV": {
    id: "ch-desh-tv",
    category: "Bangla",
    categories: ["Bangla", "Entertainment"],
    sports: [],
    logo: "./assets/channel-logos/ch-desh-tv.svg"
  },
  "Boishakhi TV": {
    id: "ch-boishakhi-tv",
    category: "Bangla",
    categories: ["Bangla", "Entertainment"],
    sports: [],
    logo: "https://upload.wikimedia.org/wikipedia/en/thumb/1/18/Boishakhi_Television_logo.png/320px-Boishakhi_Television_logo.png"
  },

  // Page 2
  "SA TV": {
    id: "ch-sa-tv",
    category: "Bangla",
    categories: ["Bangla", "Entertainment"],
    sports: [],
    logo: "https://upload.wikimedia.org/wikipedia/en/thumb/3/37/SA_TV_logo.png/320px-SA_TV_logo.png"
  },
  "Bangla TV": {
    id: "ch-bangla-tv",
    category: "Bangla",
    categories: ["Bangla", "Entertainment"],
    sports: [],
    logo: "https://upload.wikimedia.org/wikipedia/en/thumb/9/91/Bangla_TV_logo.png/320px-Bangla_TV_logo.png"
  },
  "Mohona TV": {
    id: "ch-mohona-tv",
    category: "Bangla",
    categories: ["Bangla", "Entertainment"],
    sports: [],
    logo: "https://upload.wikimedia.org/wikipedia/en/thumb/e/e6/Mohona_Television_logo.png/320px-Mohona_Television_logo.png"
  },
  "NEXUS TV": {
    id: "ch-nexus-tv",
    category: "Bangla",
    categories: ["Bangla", "Entertainment"],
    sports: [],
    logo: "https://upload.wikimedia.org/wikipedia/en/thumb/e/e4/Nexus_Television_logo.png/320px-Nexus_Television_logo.png"
  },
  "Bijoy TV": {
    id: "ch-bijoy-tv",
    category: "Bangla",
    categories: ["Bangla", "Entertainment"],
    sports: [],
    logo: "./assets/channel-logos/ch-bijoy-tv.svg"
  },
  "Global TV": {
    id: "ch-global-tv",
    category: "Bangla",
    categories: ["Bangla", "Entertainment"],
    sports: [],
    logo: "https://upload.wikimedia.org/wikipedia/en/thumb/1/1a/Global_Television_Bangladesh_logo.png/320px-Global_Television_Bangladesh_logo.png"
  },
  "My TV": {
    id: "ch-my-tv",
    category: "Bangla",
    categories: ["Bangla", "Entertainment"],
    sports: [],
    logo: "./assets/channel-logos/ch-my-tv.svg"
  },
  "Ananda TV": {
    id: "ch-ananda-tv",
    category: "Bangla",
    categories: ["Bangla", "Entertainment"],
    sports: [],
    logo: "https://upload.wikimedia.org/wikipedia/en/thumb/d/d1/Ananda_TV_logo.png/320px-Ananda_TV_logo.png"
  },
  "BTV CTG": {
    id: "ch-btv-ctg",
    category: "Bangla",
    categories: ["Bangla", "News"],
    sports: [],
    logo: "./assets/channel-logos/ch-btv-world.svg"
  },
  "Sangeet Bangla": {
    id: "ch-sangeet-bangla",
    category: "Music",
    categories: ["Music", "Kolkata", "Bangla"],
    sports: [],
    logo: "https://upload.wikimedia.org/wikipedia/en/thumb/c/cb/Sangeet_Bangla_logo.jpg/320px-Sangeet_Bangla_logo.jpg"
  },

  // Page 3
  "CNN": {
    id: "ch-cnn-news",
    category: "News",
    categories: ["News", "World Country"],
    sports: [],
    logo: "./assets/channel-logos/news-cnn.svg"
  },
  "Bloomberg TV": {
    id: "ch-bloomberg-tv",
    category: "News",
    categories: ["News", "World Country"],
    sports: [],
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/64/Bloomberg_Television_logo_2016.svg/320px-Bloomberg_Television_logo_2016.svg.png"
  },
  "ABC News": {
    id: "ch-abc-news",
    category: "News",
    categories: ["News", "World Country"],
    sports: [],
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/ABC_News_logo_2021.svg/320px-ABC_News_logo_2021.svg.png"
  },
  "CNBC TV": {
    id: "ch-cnbc-tv",
    category: "News",
    categories: ["News", "World Country"],
    sports: [],
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e3/CNBC_logo.svg/320px-CNBC_logo.svg.png"
  },
  "CP 24": {
    id: "ch-cp-24",
    category: "News",
    categories: ["News", "World Country"],
    sports: [],
    logo: "https://upload.wikimedia.org/wikipedia/en/thumb/5/52/CP24_Logo.svg/320px-CP24_Logo.svg.png"
  },
  "Fox News": {
    id: "ch-fox-news",
    category: "News",
    categories: ["News", "World Country"],
    sports: [],
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/Fox_News_Channel_logo.svg/320px-Fox_News_Channel_logo.svg.png"
  },
  "Sky News": {
    id: "ch-sky-news",
    category: "News",
    categories: ["News", "World Country"],
    sports: [],
    logo: "./assets/channel-logos/news-sky-news.svg"
  },
  "Somoy TV": {
    id: "ch-somoy-tv",
    category: "News",
    categories: ["News", "Bangla"],
    sports: [],
    logo: "./assets/channel-logos/ch-somoy-tv.svg"
  },
  "ABN": {
    id: "ch-abn-urdu",
    category: "Pakistan",
    categories: ["Pakistan", "News"],
    sports: [],
    logo: "https://abnnews.pk/assets/images/logo.png"
  },
  "India Today": {
    id: "ch-india-today",
    category: "News",
    categories: ["News", "India"],
    sports: [],
    logo: "./assets/channel-logos/news-india-today.svg"
  },
  "Republic TV Bharat": {
    id: "ch-republic-tv-bharat",
    category: "News",
    categories: ["News", "India"],
    sports: [],
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Republic_Bharat_Logo.svg/320px-Republic_Bharat_Logo.svg.png"
  },
  "News 1 India": {
    id: "ch-news-1-india",
    category: "News",
    categories: ["News", "India"],
    sports: [],
    logo: "https://news1india.in/wp-content/uploads/2023/06/cropped-News-1-India-Logo-1.png"
  },
  "Sadhna Prime News": {
    id: "ch-sadhna-prime-news",
    category: "News",
    categories: ["News", "India"],
    sports: [],
    logo: "https://sadhnaprimenews.com/wp-content/uploads/2021/04/Sadhna-Prime-News-Logo.png"
  },

  // Page 4
  "Accu Weather": {
    id: "ch-accu-weather",
    category: "Infotainment",
    categories: ["Infotainment", "World Country"],
    sports: [],
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/AccuWeather_2019.svg/320px-AccuWeather_2019.svg.png"
  },
  "Fox Weather": {
    id: "ch-fox-weather",
    category: "Infotainment",
    categories: ["Infotainment", "World Country"],
    sports: [],
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Fox_Weather_logo.svg/320px-Fox_Weather_logo.svg.png"
  },
  "Sky News Weather": {
    id: "ch-sky-news-weather",
    category: "Infotainment",
    categories: ["Infotainment", "World Country"],
    sports: [],
    logo: "./assets/channel-logos/news-sky-news.svg"
  },
  "Weather SPY": {
    id: "ch-weather-spy",
    category: "Infotainment",
    categories: ["Infotainment", "World Country"],
    sports: [],
    logo: "https://images.pluto.tv/channels/5f1b259d816a75000788cf24/featuredImage.jpg"
  },
  "MTV": {
    id: "ch-mtv",
    category: "Music",
    categories: ["Music", "Entertainment", "World Country"],
    sports: [],
    logo: "./assets/channel-logos/music-mtv-beats.svg"
  },
  "Fox 5": {
    id: "ch-fox-5",
    category: "World Country",
    categories: ["World Country", "Entertainment"],
    sports: [],
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/76/Fox_Broadcasting_Company_logo_%282019%29.svg/320px-Fox_Broadcasting_Company_logo_%282019%29.svg.png"
  },
  "Fox Business": {
    id: "ch-fox-business",
    category: "News",
    categories: ["News", "World Country"],
    sports: [],
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/69/Fox_Business_Network_logo.svg/320px-Fox_Business_Network_logo.svg.png"
  },
  "CBS TV": {
    id: "ch-cbs-tv",
    category: "World Country",
    categories: ["World Country", "Entertainment"],
    sports: [],
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/CBS_logo.svg/320px-CBS_logo.svg.png"
  },
  "USA TV": {
    id: "ch-usa-tv",
    category: "World Country",
    categories: ["World Country", "Entertainment"],
    sports: [],
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/USA_Network_logo_2016.svg/320px-USA_Network_logo_2016.svg.png"
  },
  "FX TV": {
    id: "ch-fx-tv",
    category: "Entertainment",
    categories: ["Entertainment", "Movie", "World Country"],
    sports: [],
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/FX_2013_logo.svg/320px-FX_2013_logo.svg.png"
  },
  "Wion": {
    id: "ch-wion",
    category: "News",
    categories: ["News", "India", "World Country"],
    sports: [],
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/WION_logo.svg/320px-WION_logo.svg.png"
  },

  // Page 5
  "FIFA+": {
    id: "ch-fifa-plus",
    category: "Sports",
    categories: ["Sports"],
    sports: ["Football"],
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/10/FIFA_wordmark.svg/320px-FIFA_wordmark.svg.png"
  },
  "Enter 10 Bangla": {
    id: "ch-enter-10-bangla",
    category: "Kolkata",
    categories: ["Kolkata", "Bangla", "Entertainment"],
    sports: [],
    logo: "https://upload.wikimedia.org/wikipedia/en/thumb/e/e0/Enterr10_Bangla_logo.png/320px-Enterr10_Bangla_logo.png"
  },
  "Sony AATH": {
    id: "ch-sony-aath",
    category: "Kolkata",
    categories: ["Kolkata", "Bangla", "Entertainment"],
    sports: [],
    logo: "./assets/channel-logos/ch-sony-aath.svg"
  },
  "Thikana": {
    id: "ch-thikana-tv",
    category: "Bangla",
    categories: ["Bangla", "News"],
    sports: [],
    logo: "https://thikana.net/wp-content/uploads/2021/04/logo.png"
  },
  "Zee 24 Ghanta": {
    id: "ch-zee-24-ghanta",
    category: "News",
    categories: ["News", "Kolkata", "Bangla"],
    sports: [],
    logo: "https://upload.wikimedia.org/wikipedia/en/thumb/b/b3/Zee_24_Ghanta_logo.svg/320px-Zee_24_Ghanta_logo.svg.png"
  },
  "Talk Sport": {
    id: "ch-talk-sport",
    category: "Sports",
    categories: ["Sports"],
    sports: ["Football", "Cricket"],
    logo: "https://upload.wikimedia.org/wikipedia/en/thumb/e/e2/Talksport_logo.svg/320px-Talksport_logo.svg.png"
  },
  "Hindi Movie Classic 24": {
    id: "ch-hindi-movie-classic-24",
    category: "Movie",
    categories: ["Movie", "India"],
    sports: [],
    logo: "https://images.pluto.tv/channels/5cae0ea04ffcfaae72ca819f/featuredImage.jpg"
  },
  "Drama 24": {
    id: "ch-drama-24",
    category: "Bangla",
    categories: ["Bangla", "Entertainment"],
    sports: [],
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/de/Drama_theatre_masks.svg/320px-Drama_theatre_masks.svg.png"
  },

  // Page 6
  "Deepto tv": {
    id: "ch-deepto-tv",
    category: "Bangla",
    categories: ["Bangla", "Entertainment"],
    sports: [],
    logo: "./assets/channel-logos/ch-deepto-tv.svg"
  },
  "DD Bangla": {
    id: "ch-dd-bangla",
    category: "Kolkata",
    categories: ["Kolkata", "Bangla", "News"],
    sports: [],
    logo: "https://upload.wikimedia.org/wikipedia/en/thumb/4/4b/DD_Bangla_logo.png/320px-DD_Bangla_logo.png"
  },
  "Kolkata TV": {
    id: "ch-kolkata-tv",
    category: "Kolkata",
    categories: ["Kolkata", "Bangla", "News"],
    sports: [],
    logo: "./assets/channel-logos/ch-kolkata-tv.svg"
  },
  "Sports Fishing TV": {
    id: "ch-sports-fishing-tv",
    category: "Sports",
    categories: ["Sports"],
    sports: ["Fishing", "Outdoor"],
    logo: "https://images.pluto.tv/channels/5e381045b6db760007bbf0ea/featuredImage.jpg"
  },
  "Discovery HD": {
    id: "ch-discovery-hd",
    category: "Infotainment",
    categories: ["Infotainment", "Discovery"],
    sports: [],
    logo: "./assets/channel-logos/info-discovery.svg"
  },
  "Goal TV": {
    id: "ch-goal-tv",
    category: "Sports",
    categories: ["Sports"],
    sports: ["Football"],
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Goal_wordmark.svg/320px-Goal_wordmark.svg.png"
  },

  // Page 7
  "Nat Geo TV": {
    id: "ch-nat-geo-tv",
    category: "Infotainment",
    categories: ["Infotainment", "Discovery"],
    sports: [],
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6a/National_Geographic_Channel_logo.svg/320px-National_Geographic_Channel_logo.svg.png"
  },
  "TV9 Bangla": {
    id: "ch-tv9-bangla",
    category: "News",
    categories: ["News", "Kolkata", "Bangla"],
    sports: [],
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/ce/TV9_Bangla_logo.png/320px-TV9_Bangla_logo.png"
  },
  "Animal Planet HD": {
    id: "ch-animal-planet-hd",
    category: "Infotainment",
    categories: ["Infotainment", "Discovery"],
    sports: [],
    logo: "./assets/channel-logos/info-animal-planet.svg"
  },
  "AMC": {
    id: "ch-amc",
    category: "Movie",
    categories: ["Movie", "Entertainment", "World Country"],
    sports: [],
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/AMC_logo_2019.svg/320px-AMC_logo_2019.svg.png"
  },
  "Goldmines Movies": {
    id: "ch-goldmines-movies",
    category: "Movie",
    categories: ["Movie", "India"],
    sports: [],
    logo: "https://upload.wikimedia.org/wikipedia/en/thumb/6/61/Goldmines_TV_channel_logo.png/320px-Goldmines_TV_channel_logo.png"
  },
  "HBO 2": {
    id: "ch-hbo-2",
    category: "Movie",
    categories: ["Movie", "Entertainment", "World Country"],
    sports: [],
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/de/HBO_logo.svg/320px-HBO_logo.svg.png"
  }
};

const audit = JSON.parse(fs.readFileSync('scripts/pdf_audit_results.json', 'utf8'));
const liveChannels = audit.live;

// Normalize names for fuzzy lookup
function norm(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Map existing channels
const existingMap = new Map();
channels.forEach((c, idx) => {
  existingMap.set(norm(c.name), idx);
  existingMap.set(norm(c.id), idx);
});

let updatedCount = 0;
let addedCount = 0;

liveChannels.forEach(item => {
  const meta = channelMetadata[item.name] || {};
  const targetCategory = meta.category || "Bangla";
  const targetCategories = meta.categories || [targetCategory];
  const targetSports = meta.sports || [];
  const targetLogo = meta.logo || "./assets/channel-logos/ch-btv-world.svg";
  const targetId = meta.id || ("ch-" + norm(item.name));

  const nKey = norm(item.name);
  if (existingMap.has(nKey)) {
    const idx = existingMap.get(nKey);
    const existing = channels[idx];
    existing.name = item.name;
    existing.streamUrl = item.url;
    existing.url = item.url;
    existing.stream_url = item.url;
    existing.category = targetCategory;
    existing.categories = Array.from(new Set([...(existing.categories || []), ...targetCategories, targetCategory]));
    if (targetSports.length > 0) {
      existing.sports = Array.from(new Set([...(existing.sports || []), ...targetSports]));
    }
    if (meta.logo) {
      existing.logo = meta.logo;
    }
    existing.active = true;
    updatedCount++;
  } else {
    // Add new channel
    const newChan = {
      id: targetId,
      name: item.name,
      category: targetCategory,
      categories: targetCategories,
      sports: targetSports,
      priority: 1,
      active: true,
      streamUrl: item.url,
      url: item.url,
      stream_url: item.url,
      logo: targetLogo,
      provider: "HighFy"
    };
    channels.push(newChan);
    existingMap.set(norm(item.name), channels.length - 1);
    existingMap.set(norm(targetId), channels.length - 1);
    addedCount++;
  }
});

// Standardize Bengali -> Bangla and Movies -> Movie across all channels for consistency with categories.json
channels.forEach(c => {
  if (c.category === 'Bengali') {
    c.category = 'Bangla';
  }
  if (c.category === 'Movies') {
    c.category = 'Movie';
  }
  if (Array.isArray(c.categories)) {
    c.categories = c.categories.map(cat => {
      if (cat === 'Bengali') return 'Bangla';
      if (cat === 'Movies') return 'Movie';
      return cat;
    });
  }
});

fs.writeFileSync(channelsFile, JSON.stringify(channels, null, 2), 'utf8');

console.log(`\nSuccessfully integrated verified channels!`);
console.log(`Updated existing channels: ${updatedCount}`);
console.log(`Added new channels: ${addedCount}`);
console.log(`Total channels in channels.json: ${channels.length}`);

// Category breakdown
const catCount = {};
channels.forEach(c => {
  catCount[c.category] = (catCount[c.category] || 0) + 1;
});
console.log('\nUpdated Category Distribution:');
console.log(catCount);
