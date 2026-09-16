const fs = require('fs');
const path = require('path');

const channelsPath = path.resolve('channels.json');
let channels = JSON.parse(fs.readFileSync(channelsPath, 'utf8'));

console.log(`Initial channel count: ${channels.length}`);

// 1. Remove dead Bleav Football channel
channels = channels.filter(c => c.id !== 'ch-ayna-019de785-3a0b-7492-944c-93b197e0fc39' && c.name !== 'Bleav Football');

// 2. Configure T Sports HD (Server 1 HD) & T Sports HD (Server 2)
const tSportsHD = channels.find(c => c.id === 'ch-t-sports-hd');
if (tSportsHD) {
  tSportsHD.category = 'Sports';
  tSportsHD.categories = ['LiveTV', 'Sports', 'Cricket', 'Football'];
  tSportsHD.sports = ['Cricket', 'Football'];
  tSportsHD.isAyana = false;
  tSportsHD.isAyna = false;
  tSportsHD.streams = [
    {
      name: 'T Sports HD (Server 1 HD)',
      serverLabel: 'SERVER 1 (1080P HD)',
      channelName: 'T Sports HD',
      url: 'https://tvsen5.aynaott.com/TnMn5kZz8aLm/tracks-v1a1/mono.ts.m3u8',
      quality: '1080p FHD',
      isHD: true
    },
    {
      name: 'T Sports HD (Server 2)',
      serverLabel: 'SERVER 2 (BACKUP)',
      channelName: 'T Sports HD',
      url: 'https://tvsen5.aynaott.com/TnMn5kZz8aLm/index.m3u8',
      quality: '720p HD',
      isHD: true
    }
  ];
  tSportsHD.backupUrls = ['https://tvsen5.aynaott.com/TnMn5kZz8aLm/index.m3u8'];
}

// Add T Sports HD (Server 2) direct channel card
if (!channels.find(c => c.id === 'ch-t-sports-server-2')) {
  channels.push({
    id: 'ch-t-sports-server-2',
    name: 'T Sports HD (Server 2)',
    category: 'Sports',
    categories: ['LiveTV', 'Sports', 'Cricket', 'Football'],
    sports: ['Cricket', 'Football'],
    priority: 2,
    active: true,
    provider: 'HighFy',
    logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/9/91/T_Sports_Logo.svg/320px-T_Sports_Logo.svg.png',
    url: 'https://tvsen5.aynaott.com/TnMn5kZz8aLm/index.m3u8',
    streamUrl: 'https://tvsen5.aynaott.com/TnMn5kZz8aLm/index.m3u8',
    stream_url: 'https://tvsen5.aynaott.com/TnMn5kZz8aLm/index.m3u8',
    streams: [
      {
        name: 'T Sports HD (Server 2)',
        serverLabel: 'SERVER 2 (FAST STREAM)',
        channelName: 'T Sports HD (Server 2)',
        url: 'https://tvsen5.aynaott.com/TnMn5kZz8aLm/index.m3u8',
        quality: '720p HD',
        isHD: true
      }
    ],
    backupUrls: [],
    isLive: true,
    isHD: true
  });
}

// 3. Configure Willow HD (Server 1 HD) & Willow HD (Server 2)
const willowHD = channels.find(c => c.id === 'ch-willow-hd');
if (willowHD) {
  willowHD.category = 'Sports';
  willowHD.categories = ['LiveTV', 'Sports', 'Cricket'];
  willowHD.sports = ['Cricket'];
  willowHD.streams = [
    {
      name: 'Willow HD (Server 1 HD)',
      serverLabel: 'SERVER 1 (1080P HD)',
      channelName: 'Willow HD',
      url: 'https://warm-caverns-48629-92fab798385f.herokuapp.com/https://d36r8jifhgsk5j.cloudfront.net/Willow_TV540p.m3u8',
      quality: '1080p FHD',
      isHD: true
    },
    {
      name: 'Willow HD (Server 2)',
      serverLabel: 'SERVER 2 (BACKUP)',
      channelName: 'Willow HD',
      url: 'http://tvsen5.aynascope.net/willowhd/tracks-v1a1/mono.ts.m3u8',
      quality: '720p HD',
      isHD: true
    }
  ];
  willowHD.backupUrls = ['http://tvsen5.aynascope.net/willowhd/tracks-v1a1/mono.ts.m3u8'];
}

// Add Willow HD (Server 2) direct channel card
if (!channels.find(c => c.id === 'ch-willow-hd-server-2')) {
  channels.push({
    id: 'ch-willow-hd-server-2',
    name: 'Willow HD (Server 2)',
    category: 'Sports',
    categories: ['LiveTV', 'Sports', 'Cricket'],
    sports: ['Cricket'],
    priority: 2,
    active: true,
    provider: 'HighFy',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Willow_TV_logo.svg/320px-Willow_TV_logo.svg.png',
    url: 'http://tvsen5.aynascope.net/willowhd/tracks-v1a1/mono.ts.m3u8',
    streamUrl: 'http://tvsen5.aynascope.net/willowhd/tracks-v1a1/mono.ts.m3u8',
    stream_url: 'http://tvsen5.aynascope.net/willowhd/tracks-v1a1/mono.ts.m3u8',
    streams: [
      {
        name: 'Willow HD (Server 2)',
        serverLabel: 'SERVER 2 (FAST STREAM)',
        channelName: 'Willow HD (Server 2)',
        url: 'http://tvsen5.aynascope.net/willowhd/tracks-v1a1/mono.ts.m3u8',
        quality: '720p HD',
        isHD: true
      }
    ],
    backupUrls: [],
    isLive: true,
    isHD: true
  });
}

// 4. Update Cricket Gold
const cricketGold = channels.find(c => c.name.toLowerCase().includes('cricket gold') || c.id === 'ch-ayna-019efa45-e8e5-7353-a606-b361cf5f42ce');
if (cricketGold) {
  cricketGold.id = 'ch-cricket-gold';
  cricketGold.name = 'Cricket Gold';
  cricketGold.category = 'Sports';
  cricketGold.categories = ['LiveTV', 'Sports', 'Cricket'];
  cricketGold.sports = ['Cricket'];
  cricketGold.provider = 'HighFy';
  cricketGold.isAyana = false;
  cricketGold.isAyna = false;
  cricketGold.active = true;
  cricketGold.streams = [
    {
      name: 'Cricket Gold (Server 1 HD)',
      serverLabel: 'SERVER 1 (HD)',
      channelName: 'Cricket Gold',
      url: 'https://tvsen6.aynaott.com/M2W2UR49dmeKbZnmdRzN/index.m3u8',
      quality: '720p HD',
      isHD: true
    }
  ];
  cricketGold.backupUrls = [];
}

// 5. Add new verified sports channels
const newSportsChannels = [
  {
    id: 'ch-ptv-sports-hd',
    name: 'PTV Sports',
    category: 'Sports',
    categories: ['LiveTV', 'Sports', 'Cricket'],
    sports: ['Cricket'],
    priority: 1,
    active: true,
    provider: 'HighFy',
    logo: './assets/channel-logos/ch-ptv-sports.svg',
    url: 'https://tvsen7.aynascope.net/zY3hJ7pQ2vM5gD8s/index.m3u8',
    streamUrl: 'https://tvsen7.aynascope.net/zY3hJ7pQ2vM5gD8s/index.m3u8',
    stream_url: 'https://tvsen7.aynascope.net/zY3hJ7pQ2vM5gD8s/index.m3u8',
    streams: [
      {
        name: 'PTV Sports (Server 1 HD)',
        serverLabel: 'SERVER 1 (HD)',
        channelName: 'PTV Sports',
        url: 'https://tvsen7.aynascope.net/zY3hJ7pQ2vM5gD8s/index.m3u8',
        quality: '720p HD',
        isHD: true
      }
    ],
    backupUrls: [],
    isLive: true,
    isHD: true
  },
  {
    id: 'ch-unite8-sports-2',
    name: 'Unite8 Sports 2',
    category: 'Sports',
    categories: ['LiveTV', 'Sports', 'Football'],
    sports: ['Football'],
    priority: 1,
    active: true,
    provider: 'HighFy',
    logo: './assets/category-logos/sports-channels.svg',
    url: 'https://tvsen7.aynascope.net/Sports1/index.m3u8',
    streamUrl: 'https://tvsen7.aynascope.net/Sports1/index.m3u8',
    stream_url: 'https://tvsen7.aynascope.net/Sports1/index.m3u8',
    streams: [
      {
        name: 'Unite8 Sports 2 (Server 1 HD)',
        serverLabel: 'SERVER 1 (HD)',
        channelName: 'Unite8 Sports 2',
        url: 'https://tvsen7.aynascope.net/Sports1/index.m3u8',
        quality: '720p HD',
        isHD: true
      }
    ],
    backupUrls: [],
    isLive: true,
    isHD: true
  },
  {
    id: 'ch-tsn-1',
    name: 'TSN 1',
    category: 'Sports',
    categories: ['LiveTV', 'Sports', 'TSN', 'Football', 'Basketball'],
    sports: ['Football', 'Basketball'],
    priority: 1,
    active: true,
    provider: 'HighFy',
    logo: './assets/category-logos/tsn.svg',
    url: 'https://tvsen7.aynascope.net/tsn1/index.m3u8',
    streamUrl: 'https://tvsen7.aynascope.net/tsn1/index.m3u8',
    stream_url: 'https://tvsen7.aynascope.net/tsn1/index.m3u8',
    streams: [
      {
        name: 'TSN 1 (Server 1 HD)',
        serverLabel: 'SERVER 1 (HD)',
        channelName: 'TSN 1',
        url: 'https://tvsen7.aynascope.net/tsn1/index.m3u8',
        quality: '720p HD',
        isHD: true
      }
    ],
    backupUrls: [],
    isLive: true,
    isHD: true
  },
  {
    id: 'ch-tsn-2',
    name: 'TSN 2',
    category: 'Sports',
    categories: ['LiveTV', 'Sports', 'TSN', 'Football', 'Basketball'],
    sports: ['Football', 'Basketball'],
    priority: 1,
    active: true,
    provider: 'HighFy',
    logo: './assets/category-logos/tsn.svg',
    url: 'https://tvsen7.aynascope.net/tsn2/index.m3u8',
    streamUrl: 'https://tvsen7.aynascope.net/tsn2/index.m3u8',
    stream_url: 'https://tvsen7.aynascope.net/tsn2/index.m3u8',
    streams: [
      {
        name: 'TSN 2 (Server 1 HD)',
        serverLabel: 'SERVER 1 (HD)',
        channelName: 'TSN 2',
        url: 'https://tvsen7.aynascope.net/tsn2/index.m3u8',
        quality: '720p HD',
        isHD: true
      }
    ],
    backupUrls: [],
    isLive: true,
    isHD: true
  },
  {
    id: 'ch-tsn-3',
    name: 'TSN 3',
    category: 'Sports',
    categories: ['LiveTV', 'Sports', 'TSN', 'Football', 'Basketball'],
    sports: ['Football', 'Basketball'],
    priority: 1,
    active: true,
    provider: 'HighFy',
    logo: './assets/category-logos/tsn.svg',
    url: 'https://tvsen7.aynascope.net/tsn3/index.m3u8',
    streamUrl: 'https://tvsen7.aynascope.net/tsn3/index.m3u8',
    stream_url: 'https://tvsen7.aynascope.net/tsn3/index.m3u8',
    streams: [
      {
        name: 'TSN 3 (Server 1 HD)',
        serverLabel: 'SERVER 1 (HD)',
        channelName: 'TSN 3',
        url: 'https://tvsen7.aynascope.net/tsn3/index.m3u8',
        quality: '720p HD',
        isHD: true
      }
    ],
    backupUrls: [],
    isLive: true,
    isHD: true
  },
  {
    id: 'ch-nfl-network',
    name: 'NFL Network',
    category: 'Sports',
    categories: ['LiveTV', 'Sports', 'Football'],
    sports: ['Football'],
    priority: 1,
    active: true,
    provider: 'HighFy',
    logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/0/0c/NFL_Network_logo.svg/320px-NFL_Network_logo.svg.png',
    url: 'https://tvsen6.aynaott.com/nfl/index.m3u8',
    streamUrl: 'https://tvsen6.aynaott.com/nfl/index.m3u8',
    stream_url: 'https://tvsen6.aynaott.com/nfl/index.m3u8',
    streams: [
      {
        name: 'NFL Network (Server 1 HD)',
        serverLabel: 'SERVER 1 (HD)',
        channelName: 'NFL Network',
        url: 'https://tvsen6.aynaott.com/nfl/index.m3u8',
        quality: '720p HD',
        isHD: true
      }
    ],
    backupUrls: [],
    isLive: true,
    isHD: true
  },
  {
    id: 'ch-bein-xtra',
    name: 'beIN XTRA',
    category: 'Sports',
    categories: ['LiveTV', 'Sports', 'beIN Sports', 'Football'],
    sports: ['Football'],
    priority: 1,
    active: true,
    provider: 'HighFy',
    logo: './assets/category-logos/bein-sports.svg',
    url: 'https://amg01334-beinsportsllc-beinxtra-localnow-kcy6r.amagi.tv/playlistR1080p.m3u8',
    streamUrl: 'https://amg01334-beinsportsllc-beinxtra-localnow-kcy6r.amagi.tv/playlistR1080p.m3u8',
    stream_url: 'https://amg01334-beinsportsllc-beinxtra-localnow-kcy6r.amagi.tv/playlistR1080p.m3u8',
    streams: [
      {
        name: 'beIN XTRA (Server 1 HD)',
        serverLabel: 'SERVER 1 (1080P HD)',
        channelName: 'beIN XTRA',
        url: 'https://amg01334-beinsportsllc-beinxtra-localnow-kcy6r.amagi.tv/playlistR1080p.m3u8',
        quality: '1080p FHD',
        isHD: true
      }
    ],
    backupUrls: [],
    isLive: true,
    isHD: true
  },
  {
    id: 'ch-sony-sports-2-hd',
    name: 'Sony Sports 2 HD',
    category: 'Sports',
    categories: ['LiveTV', 'Sports', 'Sony LIV', 'Cricket', 'WWE', 'Football'],
    sports: ['Cricket', 'WWE', 'Football'],
    priority: 1,
    active: true,
    provider: 'HighFy',
    logo: './assets/channel-logos/sports-sony-ten-2.svg',
    url: 'https://stream.ottplus.live/live/ten_2_hd_abr/live/ten_2_hd_720/chunks.m3u8',
    streamUrl: 'https://stream.ottplus.live/live/ten_2_hd_abr/live/ten_2_hd_720/chunks.m3u8',
    stream_url: 'https://stream.ottplus.live/live/ten_2_hd_abr/live/ten_2_hd_720/chunks.m3u8',
    streams: [
      {
        name: 'Sony Sports 2 HD (Server 1 HD)',
        serverLabel: 'SERVER 1 (720P HD)',
        channelName: 'Sony Sports 2 HD',
        url: 'https://stream.ottplus.live/live/ten_2_hd_abr/live/ten_2_hd_720/chunks.m3u8',
        quality: '720p HD',
        isHD: true
      }
    ],
    backupUrls: [],
    isLive: true,
    isHD: true
  },
  {
    id: 'ch-star-sports-select-1',
    name: 'Star Sports Select 1',
    category: 'Sports',
    categories: ['LiveTV', 'Sports', 'Star Sports', 'Cricket', 'Football'],
    sports: ['Cricket', 'Football'],
    priority: 1,
    active: true,
    provider: 'HighFy',
    logo: './assets/category-logos/star-sports.svg',
    url: 'https://tvsen7.aynascope.net/Sports1/tracks-v1a1/mono.ts.m3u8',
    streamUrl: 'https://tvsen7.aynascope.net/Sports1/tracks-v1a1/mono.ts.m3u8',
    stream_url: 'https://tvsen7.aynascope.net/Sports1/tracks-v1a1/mono.ts.m3u8',
    streams: [
      {
        name: 'Star Sports Select 1 (Server 1 HD)',
        serverLabel: 'SERVER 1 (HD)',
        channelName: 'Star Sports Select 1',
        url: 'https://tvsen7.aynascope.net/Sports1/tracks-v1a1/mono.ts.m3u8',
        quality: '720p HD',
        isHD: true
      }
    ],
    backupUrls: [],
    isLive: true,
    isHD: true
  },
  {
    id: 'ch-zv68-sports-stream',
    name: 'ZV68 Sports Stream',
    category: 'Sports',
    categories: ['LiveTV', 'Sports'],
    sports: ['Football', 'Cricket'],
    priority: 1,
    active: true,
    provider: 'HighFy',
    logo: './assets/category-logos/sports-channels.svg',
    url: 'https://tvsen6.aynaott.com/zv68oqPDu7MZZwmHhRxt/tracks-v1a1/mono.ts.m3u8',
    streamUrl: 'https://tvsen6.aynaott.com/zv68oqPDu7MZZwmHhRxt/tracks-v1a1/mono.ts.m3u8',
    stream_url: 'https://tvsen6.aynaott.com/zv68oqPDu7MZZwmHhRxt/tracks-v1a1/mono.ts.m3u8',
    streams: [
      {
        name: 'ZV68 Sports (Server 1 HD)',
        serverLabel: 'SERVER 1 (HD)',
        channelName: 'ZV68 Sports Stream',
        url: 'https://tvsen6.aynaott.com/zv68oqPDu7MZZwmHhRxt/tracks-v1a1/mono.ts.m3u8',
        quality: '720p HD',
        isHD: true
      }
    ],
    backupUrls: [],
    isLive: true,
    isHD: true
  },
  {
    id: 'ch-online24-stream',
    name: 'Online24 Stream',
    category: 'Sports',
    categories: ['LiveTV', 'Sports'],
    sports: ['Football', 'Cricket'],
    priority: 1,
    active: true,
    provider: 'HighFy',
    logo: './assets/category-logos/sports-channels.svg',
    url: 'https://ua101.online24.pm:8443/9999/tracks-v1/mono.m3u8',
    streamUrl: 'https://ua101.online24.pm:8443/9999/tracks-v1/mono.m3u8',
    stream_url: 'https://ua101.online24.pm:8443/9999/tracks-v1/mono.m3u8',
    streams: [
      {
        name: 'Online24 (Server 1 HD)',
        serverLabel: 'SERVER 1 (HD)',
        channelName: 'Online24 Stream',
        url: 'https://ua101.online24.pm:8443/9999/tracks-v1/mono.m3u8',
        quality: '720p HD',
        isHD: true
      }
    ],
    backupUrls: [],
    isLive: true,
    isHD: true
  }
];

newSportsChannels.forEach(item => {
  const existingIdx = channels.findIndex(c => c.id === item.id);
  if (existingIdx >= 0) {
    channels[existingIdx] = { ...channels[existingIdx], ...item };
  } else {
    channels.push(item);
  }
});

console.log(`Final channel count: ${channels.length}`);

fs.writeFileSync(channelsPath, JSON.stringify(channels, null, 2), 'utf8');
console.log('Successfully integrated sports channels into channels.json');
