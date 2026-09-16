const fs = require('fs');
const path = require('path');

// Read verified live channels
const liveChannels = JSON.parse(fs.readFileSync(path.join(__dirname, 'jio_verified_live.json'), 'utf8'));

// Read existing channels.json
const channelsPath = path.join(__dirname, '..', 'channels.json');
let channels = JSON.parse(fs.readFileSync(channelsPath, 'utf8'));

console.log(`Original channels.json total: ${channels.length}`);

// Step 1: Remove any previous Jio channels as requested ("jio তে থাকা আগের চ্যানেল মুছে দাও")
channels = channels.filter(ch => {
  const cat = (ch.category || '').toLowerCase().trim();
  const prov = (ch.provider || '').toLowerCase().trim();
  const cats = Array.isArray(ch.categories) ? ch.categories.map(c => String(c).toLowerCase().trim()) : [];
  const id = String(ch.id || '').toLowerCase();
  
  const isPreviousJio = ch.isJio || ch.isJioTV || 
    id.startsWith('jio-') || id.startsWith('ch-jio-') ||
    cat === 'jio' || cat === 'jio tv' || cat === 'jiotv' ||
    prov === 'jio' || prov === 'jio tv' || prov === 'jiotv' ||
    cats.includes('jio') || cats.includes('jio tv') || cats.includes('jiotv');
  
  return !isPreviousJio;
});

console.log(`Channels after removing previous Jio channels: ${channels.length}`);

// Known specific logo mappings for Jio CDN dare_images
const logoMap = {
  162: 'Ten_HD.png',
  155: 'SIX_HD.png',
  514: 'Ten_1.png',
  523: 'Ten_2.png',
  524: 'Ten_3.png',
  525: 'Sony_Six.png',
  891: 'Ten2_HD.png',
  892: 'Sony_Ten_3_HD.png',
  1774: 'Sony_Ten_4_Tamil.png',
  1775: 'Sony_Ten_4_Telugu.png',
  3510: 'Ten_HD.png',
  3511: 'Ten2_HD.png',
  3512: 'Sony_Ten_3_HD.png',
  3513: 'Sony_Ten_4_Telugu.png',
  3514: 'Sony_Ten_4_Tamil.png',
  3515: 'SIX_HD.png',
  1984: 'Star_Sports_2_Hindi_HD.png',
  1985: 'Star_Sports_2_Hindi.png',
  2852: 'Star_Sports_2_Telugu.png',
  2853: 'Star_Sports_2_Tamil.png',
  1998: 'Star_Sports_1_Hindi.png',
  875: 'DSports_HD.png',
  1294: 'DSports.png',
  204: 'DD_Sports.png',
  3146: 'AWSN_HD.png',
  2779: 'Red_Bull_TV.png',
  3243: 'Pickleball_Now.png',
  3499: 'World_Chess.png',

  // Bangla
  464: 'Zee_24_Ghanta.png',
  625: 'Zee_Bangla.png',
  672: 'ABP_Ananda.png',
  697: 'Sony_Aath.png',
  717: 'News18_Bangla.png',
  756: 'Colors_Bangla_HD.png',
  1369: 'Colors_Bangla.png',
  1657: 'Colors_Bangla_Cinema.png',
  685: 'Zee_Bangla_Cinema.png',
  690: 'DD_Bangla.png',
  698: 'Aakash_Aath.png',
  740: 'Sangeet_Bangla.png',
  1341: 'Nick_Bangla.png',
  1345: 'Sonic_Bangla.png',
  1735: 'TV9_Bangla.png',
  1796: 'Ananda_Barta.png',
  1962: 'Amar_Bangla.png',
  1977: 'Zee_Bangla_HD.png',
  2027: 'Raatdin_Bangla.png',
  2184: 'U_Bangla.png',
  2228: 'Samay_Kolkata.png',
  2780: 'R_Bangla.png',
  2817: 'Boogle_Bangla.png',
  2933: 'NK_TV_Bangla.png',
  3005: 'Rupashi_Bangla.png',
  3006: 'Dhoom_Music_Bangla.png',
  3019: 'Bangla_Jago.png',
  3298: 'Mon_TV_Bangla.png',
  3424: 'Sony_YAY_Bengali.png',
  3428: 'Discovery_HD_Bengali.png',
  3439: 'Akhon_Kolkata.png',
  3476: 'Zee_Bangla_Sonar.png',

  // Entertainment
  144: 'Colors_HD.png',
  154: 'Sony_SAB.png',
  279: 'Colors_Rishtey.png',
  291: 'SET_HD.png',
  471: 'Sony_SAB_HD.png',
  472: 'And_TV_HD.png',
  473: 'Zee_Anmol.png',
  474: 'Sony_Pal.png',
  1132: 'Star_Plus_HD.png',
  1143: 'Star_Utsav.png',
  1146: 'Sony_Marathi.png',
  1158: 'Colors_Infinity_HD.png',
  1351: 'Zee_TV.png',
  1368: 'Colors.png',
  1393: 'Sony_Wah.png',
  1396: 'SET.png',
  1961: 'Shemaroo_TV.png',
  2024: 'And_TV.png',
  2078: 'Shemaroo_Umang.png',
  3088: 'Sun_Neo_HD.png',
  3381: 'Brio_TV.png',
  3382: 'Epic_TV.png',
  3509: 'SET_HD.png',

  // Movies
  151: 'Movies_Now_HD.png',
  156: 'Star_Gold_HD.png',
  182: 'B4U_Movies.png',
  185: 'And_Pictures_HD.png',
  289: 'Sony_Max.png',
  476: 'Sony_Max_HD.png',
  477: 'MN_Plus_HD.png',
  478: 'Romedy_Now_HD.png',
  482: 'Colors_Cineplex.png',
  483: 'Sony_MAX2.png',
  484: 'Zee_Cinema.png',
  488: 'Zee_Action.png',
  877: 'MNX_HD.png',
  1104: 'Star_Movies_HD.png',
  1110: 'Star_Movies_Select_HD.png',
  1113: 'Star_Gold_Select_HD.png',
  1136: 'Star_Utsav_Movies.png',
  1295: 'B4U_Kadak.png',
  1322: 'And_Flix_HD.png',
  1401: 'Romedy_Now.png',
  1450: 'Colors_Cineplex_Superhits.png',
  1477: 'Colors_Cineplex_HD.png',
  1763: 'Colors_Cineplex_Bollywood.png',
  1839: 'And_Pictures.png',
  2761: 'Zee_Anmol_Cinema_2.png',
  2832: 'Sony_Max_HD.png',
  2834: 'Sony_MAX2.png',
  3075: 'Shemaroo_Bollywood.png',
  3096: 'Star_Gold_2_HD.png',
  3097: 'Star_Gold_Romance.png',
  3098: 'Star_Gold_Thrills.png',
  3418: 'Sony_MAX.png',

  // News
  142: 'BBC_World_News.png',
  173: 'Aaj_Tak.png',
  177: 'ABP_News.png',
  193: 'CNN.png',
  203: 'DD_News.png',
  231: 'News_18_India.png',
  235: 'India_TV.png',
  255: 'NDTV_24x7.png',
  258: 'NDTV_India.png',
  383: 'Times_Now.png',
  412: 'WION.png',
  489: 'CNBC_TV18.png',
  491: 'Mirror_Now.png',
  492: 'CNN_News18.png',
  493: 'India_Today.png',
  494: 'Al_Jazeera.png',
  501: 'News_24.png',
  504: 'Zee_News.png',
  876: 'Times_Now_World.png',
  1251: 'TV9_Bharatvarsh.png',
  1403: 'Republic_Bharat.png',
  1431: 'BBC_News_Hindi.png',
  1906: 'Times_Now_Navbharat.png',
  2079: 'Bharat_24.png',
  2772: 'India_Daily_24x7.png',

  // Kids
  544: 'Nick_Jr.png',
  545: 'Nick.png',
  559: 'Pogo.png',
  816: 'Cartoon_Network.png',
  872: 'Sony_YAY.png',
  1079: 'Cartoon_Network_HD.png',
  1226: 'Nick_HD.png',
  1373: 'Disney_Channel.png',
  1374: 'Disney_Junior.png',
  1375: 'Disney_International_HD.png',
  1391: 'Hungama.png',
  1392: 'Super_Hungama.png',
  1780: 'HooplaKidz.png',
  1976: 'CBeebies.png',
  3507: 'Sony_YAY.png',

  // Infotainment
  146: 'History_TV18_HD.png',
  164: 'Travel_XP_HD.png',
  242: 'Discovery.png',
  286: 'Animal_Planet_HD.png',
  463: 'Discovery_HD.png',
  541: 'Discovery_Turbo.png',
  566: 'Animal_Planet.png',
  568: 'Discovery_Science.png',
  575: 'Discovery.png',
  578: 'History_TV18_HD.png',
  821: 'Sony_BBC_Earth_HD.png',
  823: 'Sony_BBC_Earth.png',
  1332: 'Nat_Geo_Wild_HD.png',
  1335: 'National_Geographic_HD.png',
  2437: 'WildEarth.png',
  3402: 'DocuBay.png',

  // Music
  183: 'B4U_Music.png',
  248: 'MTV.png',
  250: 'Music_India.png',
  587: '9XM.png',
  592: 'Zoom.png',
  1145: 'MTV_HD.png',
  2753: 'YRF_Music.png',
  3074: 'Shemaroo_Filmy_Gaane.png'
};

function getLogoUrl(ch) {
  if (logoMap[ch.id]) {
    return `https://jiotv.catchup.cdn.jio.com/dare_images/images/${logoMap[ch.id]}`;
  }
  const safeName = ch.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
  return `https://jiotv.catchup.cdn.jio.com/dare_images/images/${safeName}.png`;
}

// Map each verified channel into HighFy TV's schema
const newJioChannels = liveChannels.map((ch, idx) => {
  const rawUrl = `https://hey-lookme.shop/live.php?id=${ch.id}`;
  const proxiedUrl = `/api/stream-proxy?url=${encodeURIComponent(rawUrl)}`;
  const logo = getLogoUrl(ch);
  const isSports = ch.group === 'Sports';

  const categories = ['LiveTV', 'Jio TV', ch.group];
  if (ch.isBangla) {
    categories.push('Bangla', 'Bengali');
  }

  return {
    id: `jio-${ch.id}`,
    name: ch.name,
    category: 'Jio TV',
    categories: categories,
    sports: ch.sports || (isSports ? ['Cricket', 'Football'] : []),
    priority: isSports ? 1 : 2,
    active: true,
    provider: 'Jio TV',
    isJio: true,
    isJioTV: true,
    logo: logo,
    url: rawUrl,
    streamUrl: proxiedUrl,
    stream_url: proxiedUrl,
    streams: [
      {
        name: `${ch.name} (Server 1 HD Fast Stream)`,
        serverLabel: 'SERVER 1 (HD FAST PROXY)',
        channelName: ch.name,
        channelLogo: logo,
        url: proxiedUrl,
        quality: '1080p FHD',
        isHD: true
      },
      {
        name: `${ch.name} (Server 2 Direct HLS)`,
        serverLabel: 'SERVER 2 (DIRECT HLS)',
        channelName: ch.name,
        channelLogo: logo,
        url: rawUrl,
        quality: '720p HD',
        isHD: true
      }
    ],
    backupUrls: [rawUrl],
    isLive: true,
    isHD: true
  };
});

// Append the new verified live Jio channels
channels.push(...newJioChannels);

fs.writeFileSync(channelsPath, JSON.stringify(channels, null, 2), 'utf8');
console.log(`Successfully updated channels.json! Total channels now: ${channels.length}`);
console.log(`Added ${newJioChannels.length} verified live channels to the Jio TV category.`);
