const fs = require('fs');
const path = require('path');

const channelsFile = path.resolve('channels.json');
let channels = JSON.parse(fs.readFileSync(channelsFile, 'utf8'));

console.log(`Starting integration with ${channels.length} existing channels...`);

// Definition of all 37 channels covering all 44 URLs from user PDF
const newSportsChannels = [
  {
    id: "ch-star-sports-1-hindi",
    name: "Star Sports 1 Hindi",
    category: "Sports",
    categories: ["LiveTV", "Sports", "Cricket", "India"],
    sports: ["Cricket"],
    priority: 1,
    active: true,
    provider: "HighFy",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cb/Star_Sports_1_Hindi_logo.png/320px-Star_Sports_1_Hindi_logo.png",
    url: "http://41.205.93.154/STARSPORTS1/index.m3u8",
    streamUrl: "http://41.205.93.154/STARSPORTS1/index.m3u8",
    stream_url: "http://41.205.93.154/STARSPORTS1/index.m3u8",
    streams: [
      {
        name: "Star Sports 1 Hindi (Server 1 HD)",
        serverLabel: "Server 1 HD",
        channelName: "Star Sports 1 Hindi",
        url: "http://41.205.93.154/STARSPORTS1/index.m3u8",
        quality: "1080p FHD",
        isHD: true
      },
      {
        name: "Star Sports 1 Hindi (Server 2 Backup)",
        serverLabel: "Server 2 Backup",
        channelName: "Star Sports 1 Hindi",
        url: "https://starsportshindiii.pages.dev/index.m3u8",
        quality: "720p HD",
        isHD: true
      }
    ],
    backupUrls: ["https://starsportshindiii.pages.dev/index.m3u8"],
    isLive: true,
    isHD: true
  },
  {
    id: "ch-star-sports-khel",
    name: "Star Sports Khel",
    category: "Sports",
    categories: ["LiveTV", "Sports", "Cricket", "India"],
    sports: ["Cricket", "Kabaddi"],
    priority: 2,
    active: true,
    provider: "HighFy",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d2/Star_Sports_Khel.png/320px-Star_Sports_Khel.png",
    url: "http://103.175.73.12:8080/live/151/151_0.m3u8",
    streamUrl: "http://103.175.73.12:8080/live/151/151_0.m3u8",
    stream_url: "http://103.175.73.12:8080/live/151/151_0.m3u8",
    streams: [
      {
        name: "Star Sports Khel (Server 1)",
        serverLabel: "Server 1",
        channelName: "Star Sports Khel",
        url: "http://103.175.73.12:8080/live/151/151_0.m3u8",
        quality: "720p HD",
        isHD: true
      },
      {
        name: "Star Sports Khel (Jio Backup)",
        serverLabel: "Server 2 Jio",
        channelName: "Star Sports Khel",
        url: "https://hey-lookme.shop/live.php?id=1998",
        quality: "720p HD",
        isHD: true
      }
    ],
    backupUrls: ["https://hey-lookme.shop/live.php?id=1998"],
    isLive: true,
    isHD: true
  },
  {
    id: "ch-ziggo-sport-1",
    name: "Ziggo Sport 1",
    category: "Sports",
    categories: ["LiveTV", "Sports", "Football", "Motorsport", "Tennis"],
    sports: ["Football", "Motorsport", "Tennis"],
    priority: 1,
    active: true,
    provider: "HighFy",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/Ziggo_Sport_2022.svg/320px-Ziggo_Sport_2022.svg.png",
    url: "http://ytoxw6un.ottclub.xyz/iptv/KCUHA6DGYYVA8ZZFUPQV3KZH/2560/index.m3u8",
    streamUrl: "http://ytoxw6un.ottclub.xyz/iptv/KCUHA6DGYYVA8ZZFUPQV3KZH/2560/index.m3u8",
    stream_url: "http://ytoxw6un.ottclub.xyz/iptv/KCUHA6DGYYVA8ZZFUPQV3KZH/2560/index.m3u8",
    streams: [
      {
        name: "Ziggo Sport 1 (Server 1 HD)",
        serverLabel: "Server 1 HD",
        channelName: "Ziggo Sport 1",
        url: "http://ytoxw6un.ottclub.xyz/iptv/KCUHA6DGYYVA8ZZFUPQV3KZH/2560/index.m3u8",
        quality: "1080p FHD",
        isHD: true
      },
      {
        name: "Ziggo Sport 1 (Server 2 Fast)",
        serverLabel: "Server 2 Fast",
        channelName: "Ziggo Sport 1",
        url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/2560/index.m3u8",
        quality: "1080p FHD",
        isHD: true
      }
    ],
    backupUrls: ["http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/2560/index.m3u8"],
    isLive: true,
    isHD: true
  },
  {
    id: "ch-ziggo-sport-2",
    name: "Ziggo Sport 2",
    category: "Sports",
    categories: ["LiveTV", "Sports", "Football", "Motorsport", "Tennis"],
    sports: ["Football", "Motorsport", "Tennis"],
    priority: 1,
    active: true,
    provider: "HighFy",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/Ziggo_Sport_2022.svg/320px-Ziggo_Sport_2022.svg.png",
    url: "http://ytoxw6un.ottclub.xyz/iptv/KCUHA6DGYYVA8ZZFUPQV3KZH/2561/index.m3u8",
    streamUrl: "http://ytoxw6un.ottclub.xyz/iptv/KCUHA6DGYYVA8ZZFUPQV3KZH/2561/index.m3u8",
    stream_url: "http://ytoxw6un.ottclub.xyz/iptv/KCUHA6DGYYVA8ZZFUPQV3KZH/2561/index.m3u8",
    streams: [
      {
        name: "Ziggo Sport 2 (Server 1 HD)",
        serverLabel: "Server 1 HD",
        channelName: "Ziggo Sport 2",
        url: "http://ytoxw6un.ottclub.xyz/iptv/KCUHA6DGYYVA8ZZFUPQV3KZH/2561/index.m3u8",
        quality: "1080p FHD",
        isHD: true
      },
      {
        name: "Ziggo Sport 2 (Server 2 Fast)",
        serverLabel: "Server 2 Fast",
        channelName: "Ziggo Sport 2",
        url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/2561/index.m3u8",
        quality: "1080p FHD",
        isHD: true
      }
    ],
    backupUrls: ["http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/2561/index.m3u8"],
    isLive: true,
    isHD: true
  },
  {
    id: "ch-ziggo-sport-3",
    name: "Ziggo Sport 3",
    category: "Sports",
    categories: ["LiveTV", "Sports", "Football", "Motorsport", "Tennis"],
    sports: ["Football", "Motorsport", "Tennis"],
    priority: 1,
    active: true,
    provider: "HighFy",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/Ziggo_Sport_2022.svg/320px-Ziggo_Sport_2022.svg.png",
    url: "http://ytoxw6un.ottclub.xyz/iptv/KCUHA6DGYYVA8ZZFUPQV3KZH/2559/index.m3u8",
    streamUrl: "http://ytoxw6un.ottclub.xyz/iptv/KCUHA6DGYYVA8ZZFUPQV3KZH/2559/index.m3u8",
    stream_url: "http://ytoxw6un.ottclub.xyz/iptv/KCUHA6DGYYVA8ZZFUPQV3KZH/2559/index.m3u8",
    streams: [
      {
        name: "Ziggo Sport 3 (Server 1 HD)",
        serverLabel: "Server 1 HD",
        channelName: "Ziggo Sport 3",
        url: "http://ytoxw6un.ottclub.xyz/iptv/KCUHA6DGYYVA8ZZFUPQV3KZH/2559/index.m3u8",
        quality: "1080p FHD",
        isHD: true
      },
      {
        name: "Ziggo Sport 3 (Server 2 Fast)",
        serverLabel: "Server 2 Fast",
        channelName: "Ziggo Sport 3",
        url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXSYCA/2559/index.m3u8",
        quality: "1080p FHD",
        isHD: true
      }
    ],
    backupUrls: ["http://6zirt9yx.otttv.pw/iptv/HEGN4VXXSYCA/2559/index.m3u8"],
    isLive: true,
    isHD: true
  },
  {
    id: "ch-dazn-1",
    name: "DAZN 1",
    category: "Sports",
    categories: ["LiveTV", "Sports", "Football", "Combat Sports", "Boxing"],
    sports: ["Football", "Boxing", "Combat Sports"],
    priority: 1,
    active: true,
    provider: "HighFy",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/DAZN_Logo_Master.svg/320px-DAZN_Logo_Master.svg.png",
    url: "http://ytoxw6un.ottclub.xyz/iptv/KCUHA6DGYYVA8ZZFUPQV3KZH/2531/index.m3u8",
    streamUrl: "http://ytoxw6un.ottclub.xyz/iptv/KCUHA6DGYYVA8ZZFUPQV3KZH/2531/index.m3u8",
    stream_url: "http://ytoxw6un.ottclub.xyz/iptv/KCUHA6DGYYVA8ZZFUPQV3KZH/2531/index.m3u8",
    streams: [
      {
        name: "DAZN 1 (Server 1 HD)",
        serverLabel: "Server 1 HD",
        channelName: "DAZN 1",
        url: "http://ytoxw6un.ottclub.xyz/iptv/KCUHA6DGYYVA8ZZFUPQV3KZH/2531/index.m3u8",
        quality: "1080p FHD",
        isHD: true
      },
      {
        name: "DAZN 1 (Server 2 Fast)",
        serverLabel: "Server 2 Fast",
        channelName: "DAZN 1",
        url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/2531/index.m3u8",
        quality: "1080p FHD",
        isHD: true
      }
    ],
    backupUrls: ["http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/2531/index.m3u8"],
    isLive: true,
    isHD: true
  },
  {
    id: "ch-dazn-2",
    name: "DAZN 2",
    category: "Sports",
    categories: ["LiveTV", "Sports", "Football", "Combat Sports", "Boxing"],
    sports: ["Football", "Boxing", "Combat Sports"],
    priority: 1,
    active: true,
    provider: "HighFy",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/DAZN_Logo_Master.svg/320px-DAZN_Logo_Master.svg.png",
    url: "http://ytoxw6un.ottclub.xyz/iptv/KCUHA6DGYYVA8ZZFUPQV3KZH/2532/index.m3u8",
    streamUrl: "http://ytoxw6un.ottclub.xyz/iptv/KCUHA6DGYYVA8ZZFUPQV3KZH/2532/index.m3u8",
    stream_url: "http://ytoxw6un.ottclub.xyz/iptv/KCUHA6DGYYVA8ZZFUPQV3KZH/2532/index.m3u8",
    streams: [
      {
        name: "DAZN 2 (Server 1 HD)",
        serverLabel: "Server 1 HD",
        channelName: "DAZN 2",
        url: "http://ytoxw6un.ottclub.xyz/iptv/KCUHA6DGYYVA8ZZFUPQV3KZH/2532/index.m3u8",
        quality: "1080p FHD",
        isHD: true
      },
      {
        name: "DAZN 2 (Server 2 Fast)",
        serverLabel: "Server 2 Fast",
        channelName: "DAZN 2",
        url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/2532/index.m3u8",
        quality: "1080p FHD",
        isHD: true
      }
    ],
    backupUrls: ["http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/2532/index.m3u8"],
    isLive: true,
    isHD: true
  },
  {
    id: "ch-dazn-3",
    name: "DAZN 3",
    category: "Sports",
    categories: ["LiveTV", "Sports", "Football", "Combat Sports", "Boxing"],
    sports: ["Football", "Boxing", "Combat Sports"],
    priority: 1,
    active: true,
    provider: "HighFy",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/DAZN_Logo_Master.svg/320px-DAZN_Logo_Master.svg.png",
    url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/2533/index.m3u8",
    streamUrl: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/2533/index.m3u8",
    stream_url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/2533/index.m3u8",
    streams: [
      {
        name: "DAZN 3 (Server 1 HD)",
        serverLabel: "Server 1 HD",
        channelName: "DAZN 3",
        url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/2533/index.m3u8",
        quality: "1080p FHD",
        isHD: true
      }
    ],
    isLive: true,
    isHD: true
  },
  {
    id: "ch-dazn-4",
    name: "DAZN 4",
    category: "Sports",
    categories: ["LiveTV", "Sports", "Football", "Combat Sports", "Boxing"],
    sports: ["Football", "Boxing", "Combat Sports"],
    priority: 1,
    active: true,
    provider: "HighFy",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/DAZN_Logo_Master.svg/320px-DAZN_Logo_Master.svg.png",
    url: "http://ytoxw6un.ottclub.xyz/iptv/KCUHA6DGYYVA8ZZFUPQV3KZH/2534/index.m3u8",
    streamUrl: "http://ytoxw6un.ottclub.xyz/iptv/KCUHA6DGYYVA8ZZFUPQV3KZH/2534/index.m3u8",
    stream_url: "http://ytoxw6un.ottclub.xyz/iptv/KCUHA6DGYYVA8ZZFUPQV3KZH/2534/index.m3u8",
    streams: [
      {
        name: "DAZN 4 (Server 1 HD)",
        serverLabel: "Server 1 HD",
        channelName: "DAZN 4",
        url: "http://ytoxw6un.ottclub.xyz/iptv/KCUHA6DGYYVA8ZZFUPQV3KZH/2534/index.m3u8",
        quality: "1080p FHD",
        isHD: true
      },
      {
        name: "DAZN 4 (Server 2 Fast)",
        serverLabel: "Server 2 Fast",
        channelName: "DAZN 4",
        url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/2534/index.m3u8",
        quality: "1080p FHD",
        isHD: true
      }
    ],
    backupUrls: ["http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/2534/index.m3u8"],
    isLive: true,
    isHD: true
  },
  {
    id: "ch-dazn-5",
    name: "DAZN 5",
    category: "Sports",
    categories: ["LiveTV", "Sports", "Football", "Combat Sports", "Boxing"],
    sports: ["Football", "Boxing", "Combat Sports"],
    priority: 1,
    active: true,
    provider: "HighFy",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/DAZN_Logo_Master.svg/320px-DAZN_Logo_Master.svg.png",
    url: "http://ytoxw6un.ottclub.xyz/iptv/KCUHA6DGYYVA8ZZFUPQV3KZH/2535/index.m3u8",
    streamUrl: "http://ytoxw6un.ottclub.xyz/iptv/KCUHA6DGYYVA8ZZFUPQV3KZH/2535/index.m3u8",
    stream_url: "http://ytoxw6un.ottclub.xyz/iptv/KCUHA6DGYYVA8ZZFUPQV3KZH/2535/index.m3u8",
    streams: [
      {
        name: "DAZN 5 (Server 1 HD)",
        serverLabel: "Server 1 HD",
        channelName: "DAZN 5",
        url: "http://ytoxw6un.ottclub.xyz/iptv/KCUHA6DGYYVA8ZZFUPQV3KZH/2535/index.m3u8",
        quality: "1080p FHD",
        isHD: true
      },
      {
        name: "DAZN 5 (Server 2 Fast)",
        serverLabel: "Server 2 Fast",
        channelName: "DAZN 5",
        url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/2535/index.m3u8",
        quality: "1080p FHD",
        isHD: true
      }
    ],
    backupUrls: ["http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/2535/index.m3u8"],
    isLive: true,
    isHD: true
  },
  {
    id: "ch-eurosport-1",
    name: "Eurosport 1",
    category: "Sports",
    categories: ["LiveTV", "Sports", "Tennis", "Cycling", "Motorsport"],
    sports: ["Tennis", "Cycling", "Motorsport", "Olympic Sports"],
    priority: 1,
    active: true,
    provider: "HighFy",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Eurosport_1_logo_2015.svg/320px-Eurosport_1_logo_2015.svg.png",
    url: "http://151.80.18.177:86/Eurosport_HD/index.m3u8",
    streamUrl: "http://151.80.18.177:86/Eurosport_HD/index.m3u8",
    stream_url: "http://151.80.18.177:86/Eurosport_HD/index.m3u8",
    streams: [
      {
        name: "Eurosport 1 (Server 1 HD)",
        serverLabel: "Server 1 HD",
        channelName: "Eurosport 1",
        url: "http://151.80.18.177:86/Eurosport_HD/index.m3u8",
        quality: "1080p FHD",
        isHD: true
      }
    ],
    isLive: true,
    isHD: true
  },
  {
    id: "ch-eurosport-2",
    name: "Eurosport 2",
    category: "Sports",
    categories: ["LiveTV", "Sports", "Tennis", "Cycling", "Motorsport"],
    sports: ["Tennis", "Cycling", "Motorsport", "Olympic Sports"],
    priority: 1,
    active: true,
    provider: "HighFy",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Eurosport_2_logo_2015.svg/320px-Eurosport_2_logo_2015.svg.png",
    url: "http://151.80.18.177:86/Eurosport_2_HD/index.m3u8",
    streamUrl: "http://151.80.18.177:86/Eurosport_2_HD/index.m3u8",
    stream_url: "http://151.80.18.177:86/Eurosport_2_HD/index.m3u8",
    streams: [
      {
        name: "Eurosport 2 (Server 1 HD)",
        serverLabel: "Server 1 HD",
        channelName: "Eurosport 2",
        url: "http://151.80.18.177:86/Eurosport_2_HD/index.m3u8",
        quality: "1080p FHD",
        isHD: true
      }
    ],
    isLive: true,
    isHD: true
  },
  {
    id: "ch-espn",
    name: "ESPN",
    category: "Sports",
    categories: ["LiveTV", "Sports", "Basketball", "Football", "Baseball", "American Football"],
    sports: ["Basketball", "Football", "Baseball", "American Football"],
    priority: 1,
    active: true,
    provider: "HighFy",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/ESPN_wordmark.svg/320px-ESPN_wordmark.svg.png",
    url: "http://ytoxw6un.ottclub.xyz/iptv/KCUHA6DGYYVA8ZZFUPQV3KZH/19056/index.m3u8",
    streamUrl: "http://ytoxw6un.ottclub.xyz/iptv/KCUHA6DGYYVA8ZZFUPQV3KZH/19056/index.m3u8",
    stream_url: "http://ytoxw6un.ottclub.xyz/iptv/KCUHA6DGYYVA8ZZFUPQV3KZH/19056/index.m3u8",
    streams: [
      {
        name: "ESPN (Server 1 HD)",
        serverLabel: "Server 1 HD",
        channelName: "ESPN",
        url: "http://ytoxw6un.ottclub.xyz/iptv/KCUHA6DGYYVA8ZZFUPQV3KZH/19056/index.m3u8",
        quality: "1080p FHD",
        isHD: true
      }
    ],
    isLive: true,
    isHD: true
  },
  {
    id: "ch-trace-sport-stars",
    name: "Trace Sport",
    category: "Sports",
    categories: ["LiveTV", "Sports", "Lifestyle"],
    sports: ["Lifestyle", "Sports Entertainment"],
    priority: 3,
    active: true,
    provider: "HighFy",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/Trace_Sport_Stars_logo.svg/320px-Trace_Sport_Stars_logo.svg.png",
    url: "https://lightning-tracesport-samsungau.amagi.tv/playlist.m3u8",
    streamUrl: "https://lightning-tracesport-samsungau.amagi.tv/playlist.m3u8",
    stream_url: "https://lightning-tracesport-samsungau.amagi.tv/playlist.m3u8",
    streams: [
      {
        name: "Trace Sport (Server 1 HD)",
        serverLabel: "Server 1 HD",
        channelName: "Trace Sport",
        url: "https://lightning-tracesport-samsungau.amagi.tv/playlist.m3u8",
        quality: "1080p FHD",
        isHD: true
      }
    ],
    isLive: true,
    isHD: true
  },
  {
    id: "ch-sky-sports-action",
    name: "Sky Sports Action",
    category: "Sports",
    categories: ["LiveTV", "Sports", "Rugby", "Boxing", "Combat Sports", "Motorsport"],
    sports: ["Rugby", "Boxing", "Combat Sports", "Motorsport"],
    priority: 1,
    active: true,
    provider: "HighFy",
    logo: "https://upload.wikimedia.org/wikipedia/en/thumb/f/f9/Sky_Sports_Action_logo_2020.svg/320px-Sky_Sports_Action_logo_2020.svg.png",
    url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/9155/index.m3u8",
    streamUrl: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/9155/index.m3u8",
    stream_url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/9155/index.m3u8",
    streams: [
      {
        name: "Sky Sports Action (Server 1 HD)",
        serverLabel: "Server 1 HD",
        channelName: "Sky Sports Action",
        url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/9155/index.m3u8",
        quality: "1080p FHD",
        isHD: true
      }
    ],
    isLive: true,
    isHD: true
  },
  {
    id: "ch-sky-sports-cricket",
    name: "Sky Sports Cricket",
    category: "Sports",
    categories: ["LiveTV", "Sports", "Cricket"],
    sports: ["Cricket"],
    priority: 1,
    active: true,
    provider: "HighFy",
    logo: "https://upload.wikimedia.org/wikipedia/en/thumb/0/07/Sky_Sports_Cricket_logo_2020.svg/320px-Sky_Sports_Cricket_logo_2020.svg.png",
    url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/9258/index.m3u8",
    streamUrl: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/9258/index.m3u8",
    stream_url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/9258/index.m3u8",
    streams: [
      {
        name: "Sky Sports Cricket (Server 1 HD)",
        serverLabel: "Server 1 HD",
        channelName: "Sky Sports Cricket",
        url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/9258/index.m3u8",
        quality: "1080p FHD",
        isHD: true
      }
    ],
    isLive: true,
    isHD: true
  },
  {
    id: "ch-sky-sports-football",
    name: "Sky Sports Football",
    category: "Sports",
    categories: ["LiveTV", "Sports", "Football"],
    sports: ["Football"],
    priority: 1,
    active: true,
    provider: "HighFy",
    logo: "https://upload.wikimedia.org/wikipedia/en/thumb/4/4b/Sky_Sports_Football_logo_2020.svg/320px-Sky_Sports_Football_logo_2020.svg.png",
    url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/9289/index.m3u8",
    streamUrl: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/9289/index.m3u8",
    stream_url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/9289/index.m3u8",
    streams: [
      {
        name: "Sky Sports Football (Server 1 HD)",
        serverLabel: "Server 1 HD",
        channelName: "Sky Sports Football",
        url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/9289/index.m3u8",
        quality: "1080p FHD",
        isHD: true
      }
    ],
    isLive: true,
    isHD: true
  },
  {
    id: "ch-sky-sports-golf",
    name: "Sky Sports Golf",
    category: "Sports",
    categories: ["LiveTV", "Sports", "Golf"],
    sports: ["Golf"],
    priority: 1,
    active: true,
    provider: "HighFy",
    logo: "https://upload.wikimedia.org/wikipedia/en/thumb/9/9e/Sky_Sports_Golf_logo_2020.svg/320px-Sky_Sports_Golf_logo_2020.svg.png",
    url: "http://ytoxw6un.ottclub.xyz/iptv/KCUHA6DGYYVA8ZZFUPQV3KZH/19132/index.m3u8",
    streamUrl: "http://ytoxw6un.ottclub.xyz/iptv/KCUHA6DGYYVA8ZZFUPQV3KZH/19132/index.m3u8",
    stream_url: "http://ytoxw6un.ottclub.xyz/iptv/KCUHA6DGYYVA8ZZFUPQV3KZH/19132/index.m3u8",
    streams: [
      {
        name: "Sky Sports Golf (Server 1 HD)",
        serverLabel: "Server 1 HD",
        channelName: "Sky Sports Golf",
        url: "http://ytoxw6un.ottclub.xyz/iptv/KCUHA6DGYYVA8ZZFUPQV3KZH/19132/index.m3u8",
        quality: "1080p FHD",
        isHD: true
      }
    ],
    isLive: true,
    isHD: true
  },
  {
    id: "ch-sky-sports-mix",
    name: "Sky Sports Mix",
    category: "Sports",
    categories: ["LiveTV", "Sports", "Football", "Cricket", "Motorsport"],
    sports: ["Football", "Cricket", "Motorsport"],
    priority: 2,
    active: true,
    provider: "HighFy",
    logo: "https://upload.wikimedia.org/wikipedia/en/thumb/8/86/Sky_Sports_Mix_logo_2020.svg/320px-Sky_Sports_Mix_logo_2020.svg.png",
    url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/9310/index.m3u8",
    streamUrl: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/9310/index.m3u8",
    stream_url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/9310/index.m3u8",
    streams: [
      {
        name: "Sky Sports Mix (Server 1 HD)",
        serverLabel: "Server 1 HD",
        channelName: "Sky Sports Mix",
        url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/9310/index.m3u8",
        quality: "1080p FHD",
        isHD: true
      }
    ],
    isLive: true,
    isHD: true
  },
  {
    id: "ch-sky-sports-epl",
    name: "Sky Sports Premier League",
    category: "Sports",
    categories: ["LiveTV", "Sports", "Football", "Premier League"],
    sports: ["Football"],
    priority: 1,
    active: true,
    provider: "HighFy",
    logo: "https://upload.wikimedia.org/wikipedia/en/thumb/4/46/Sky_Sports_Premier_League_logo_2020.svg/320px-Sky_Sports_Premier_League_logo_2020.svg.png",
    url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/9334/index.m3u8",
    streamUrl: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/9334/index.m3u8",
    stream_url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/9334/index.m3u8",
    streams: [
      {
        name: "Sky Sports Premier League (Server 1 HD)",
        serverLabel: "Server 1 HD",
        channelName: "Sky Sports Premier League",
        url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/9334/index.m3u8",
        quality: "1080p FHD",
        isHD: true
      }
    ],
    isLive: true,
    isHD: true
  },
  {
    id: "ch-sky-sports-racing",
    name: "Sky Sports Racing",
    category: "Sports",
    categories: ["LiveTV", "Sports", "Horse Racing", "Motorsport"],
    sports: ["Motorsport", "Horse Racing"],
    priority: 2,
    active: true,
    provider: "HighFy",
    logo: "https://upload.wikimedia.org/wikipedia/en/thumb/9/90/Sky_Sports_Racing_logo_2020.svg/320px-Sky_Sports_Racing_logo_2020.svg.png",
    url: "http://ytoxw6un.ottclub.xyz/iptv/KCUHA6DGYYVA8ZZFUPQV3KZH/7341/index.m3u8",
    streamUrl: "http://ytoxw6un.ottclub.xyz/iptv/KCUHA6DGYYVA8ZZFUPQV3KZH/7341/index.m3u8",
    stream_url: "http://ytoxw6un.ottclub.xyz/iptv/KCUHA6DGYYVA8ZZFUPQV3KZH/7341/index.m3u8",
    streams: [
      {
        name: "Sky Sports Racing (Server 1 HD)",
        serverLabel: "Server 1 HD",
        channelName: "Sky Sports Racing",
        url: "http://ytoxw6un.ottclub.xyz/iptv/KCUHA6DGYYVA8ZZFUPQV3KZH/7341/index.m3u8",
        quality: "1080p FHD",
        isHD: true
      }
    ],
    isLive: true,
    isHD: true
  },
  {
    id: "ch-sky-sports-tennis",
    name: "Sky Sports Tennis",
    category: "Sports",
    categories: ["LiveTV", "Sports", "Tennis"],
    sports: ["Tennis"],
    priority: 1,
    active: true,
    provider: "HighFy",
    logo: "https://upload.wikimedia.org/wikipedia/en/thumb/3/30/Sky_Sports_Tennis_logo.svg/320px-Sky_Sports_Tennis_logo.svg.png",
    url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/6546/index.m3u8",
    streamUrl: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/6546/index.m3u8",
    stream_url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/6546/index.m3u8",
    streams: [
      {
        name: "Sky Sports Tennis (Server 1 HD)",
        serverLabel: "Server 1 HD",
        channelName: "Sky Sports Tennis",
        url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/6546/index.m3u8",
        quality: "1080p FHD",
        isHD: true
      }
    ],
    isLive: true,
    isHD: true
  },
  {
    id: "ch-sky-sports-f1",
    name: "Sky Sports F1",
    category: "Sports",
    categories: ["LiveTV", "Sports", "Motorsport", "Formula 1"],
    sports: ["Motorsport", "Formula 1"],
    priority: 1,
    active: true,
    provider: "HighFy",
    logo: "https://upload.wikimedia.org/wikipedia/en/thumb/7/7a/Sky_Sports_F1_logo_2020.svg/320px-Sky_Sports_F1_logo_2020.svg.png",
    url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/7342/index.m3u8",
    streamUrl: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/7342/index.m3u8",
    stream_url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/7342/index.m3u8",
    streams: [
      {
        name: "Sky Sports F1 (Server 1 HD)",
        serverLabel: "Server 1 HD",
        channelName: "Sky Sports F1",
        url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/7342/index.m3u8",
        quality: "1080p FHD",
        isHD: true
      }
    ],
    isLive: true,
    isHD: true
  },
  {
    id: "ch-sport-1",
    name: "Sport 1",
    category: "Sports",
    categories: ["LiveTV", "Sports", "Football", "Motorsport"],
    sports: ["Football", "Motorsport"],
    priority: 2,
    active: true,
    provider: "HighFy",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Sport1_Logo_2013.svg/320px-Sport1_Logo_2013.svg.png",
    url: "http://212.102.38.45/live/test_sport1_25p/playlist.m3u8",
    streamUrl: "http://212.102.38.45/live/test_sport1_25p/playlist.m3u8",
    stream_url: "http://212.102.38.45/live/test_sport1_25p/playlist.m3u8",
    streams: [
      {
        name: "Sport 1 (Server 1)",
        serverLabel: "Server 1",
        channelName: "Sport 1",
        url: "http://212.102.38.45/live/test_sport1_25p/playlist.m3u8",
        quality: "720p HD",
        isHD: true
      }
    ],
    isLive: true,
    isHD: true
  },
  {
    id: "ch-sport-2",
    name: "Sport 2",
    category: "Sports",
    categories: ["LiveTV", "Sports", "Football", "Motorsport"],
    sports: ["Football", "Motorsport"],
    priority: 2,
    active: true,
    provider: "HighFy",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Sport1_Logo_2013.svg/320px-Sport1_Logo_2013.svg.png",
    url: "http://212.102.38.45/live/test_sport_2/playlist.m3u8",
    streamUrl: "http://212.102.38.45/live/test_sport_2/playlist.m3u8",
    stream_url: "http://212.102.38.45/live/test_sport_2/playlist.m3u8",
    streams: [
      {
        name: "Sport 2 (Server 1)",
        serverLabel: "Server 1",
        channelName: "Sport 2",
        url: "http://212.102.38.45/live/test_sport_2/playlist.m3u8",
        quality: "720p HD",
        isHD: true
      }
    ],
    isLive: true,
    isHD: true
  },
  {
    id: "ch-dd-sports",
    name: "DD Sports",
    category: "Sports",
    categories: ["LiveTV", "Sports", "Cricket", "India"],
    sports: ["Cricket", "Football", "Olympic Sports"],
    priority: 2,
    active: true,
    provider: "HighFy",
    logo: "https://upload.wikimedia.org/wikipedia/en/thumb/3/38/DD_Sports_logo.svg/320px-DD_Sports_logo.svg.png",
    url: "https://d3qs3d2rkhfqrt.cloudfront.net/out/v1/b17adfe543354fdd8d189b110617cddd/index.m3u8",
    streamUrl: "https://d3qs3d2rkhfqrt.cloudfront.net/out/v1/b17adfe543354fdd8d189b110617cddd/index.m3u8",
    stream_url: "https://d3qs3d2rkhfqrt.cloudfront.net/out/v1/b17adfe543354fdd8d189b110617cddd/index.m3u8",
    streams: [
      {
        name: "DD Sports (Cloudfront HD)",
        serverLabel: "Server 1 HD",
        channelName: "DD Sports",
        url: "https://d3qs3d2rkhfqrt.cloudfront.net/out/v1/b17adfe543354fdd8d189b110617cddd/index.m3u8",
        quality: "1080p FHD",
        isHD: true
      }
    ],
    isLive: true,
    isHD: true
  },
  {
    id: "ch-football-worldcup-2026",
    name: "Football World Cup 2026",
    category: "Sports",
    categories: ["LiveTV", "Sports", "Football", "World Cup"],
    sports: ["Football"],
    priority: 2,
    active: true,
    provider: "HighFy",
    logo: "https://upload.wikimedia.org/wikipedia/en/thumb/1/10/2026_FIFA_World_Cup_logo.svg/320px-2026_FIFA_World_Cup_logo.svg.png",
    url: "https://live.inplyr.com/room/168740.m3u8",
    streamUrl: "https://live.inplyr.com/room/168740.m3u8",
    stream_url: "https://live.inplyr.com/room/168740.m3u8",
    streams: [
      {
        name: "Football World Cup 2026 Fast",
        serverLabel: "Server 1 Fast",
        channelName: "Football World Cup 2026",
        url: "https://live.inplyr.com/room/168740.m3u8",
        quality: "1080p FHD",
        isHD: true
      }
    ],
    isLive: true,
    isHD: true
  },
  {
    id: "ch-go3-sport-1-hd",
    name: "GO3 Sport 1 HD",
    category: "Sports",
    categories: ["LiveTV", "Sports", "Football", "Basketball"],
    sports: ["Football", "Basketball"],
    priority: 2,
    active: true,
    provider: "HighFy",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/ca/Go3_Sport_logo.png/320px-Go3_Sport_logo.png",
    url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/18000/index.m3u8",
    streamUrl: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/18000/index.m3u8",
    stream_url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/18000/index.m3u8",
    streams: [
      {
        name: "GO3 Sport 1 HD (Server 1 HD)",
        serverLabel: "Server 1 HD",
        channelName: "GO3 Sport 1 HD",
        url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/18000/index.m3u8",
        quality: "1080p FHD",
        isHD: true
      }
    ],
    isLive: true,
    isHD: true
  },
  {
    id: "ch-go3-sport-2-hd",
    name: "GO3 Sport 2 HD",
    category: "Sports",
    categories: ["LiveTV", "Sports", "Football", "Motorsport"],
    sports: ["Football", "Motorsport"],
    priority: 2,
    active: true,
    provider: "HighFy",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/ca/Go3_Sport_logo.png/320px-Go3_Sport_logo.png",
    url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/18012/index.m3u8",
    streamUrl: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/18012/index.m3u8",
    stream_url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/18012/index.m3u8",
    streams: [
      {
        name: "GO3 Sport 2 HD (Server 1 HD)",
        serverLabel: "Server 1 HD",
        channelName: "GO3 Sport 2 HD",
        url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/18012/index.m3u8",
        quality: "1080p FHD",
        isHD: true
      }
    ],
    isLive: true,
    isHD: true
  },
  {
    id: "ch-tnt-sports-1",
    name: "TNT Sports 1",
    category: "Sports",
    categories: ["LiveTV", "Sports", "Football", "Champions League", "Premier League"],
    sports: ["Football", "Champions League", "Premier League"],
    priority: 1,
    active: true,
    provider: "HighFy",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/TNT_Sports_%28United_Kingdom%29_logo.svg/320px-TNT_Sports_%28United_Kingdom%29_logo.svg.png",
    url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/2505/index.m3u8",
    streamUrl: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/2505/index.m3u8",
    stream_url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/2505/index.m3u8",
    streams: [
      {
        name: "TNT Sports 1 (Server 1 HD)",
        serverLabel: "Server 1 HD",
        channelName: "TNT Sports 1",
        url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/2505/index.m3u8",
        quality: "1080p FHD",
        isHD: true
      }
    ],
    isLive: true,
    isHD: true
  },
  {
    id: "ch-tnt-sports-2",
    name: "TNT Sports 2",
    category: "Sports",
    categories: ["LiveTV", "Sports", "Football", "Rugby", "Motorsport"],
    sports: ["Football", "Rugby", "Motorsport"],
    priority: 1,
    active: true,
    provider: "HighFy",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/TNT_Sports_%28United_Kingdom%29_logo.svg/320px-TNT_Sports_%28United_Kingdom%29_logo.svg.png",
    url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/2506/index.m3u8",
    streamUrl: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/2506/index.m3u8",
    stream_url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/2506/index.m3u8",
    streams: [
      {
        name: "TNT Sports 2 (Server 1 HD)",
        serverLabel: "Server 1 HD",
        channelName: "TNT Sports 2",
        url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/2506/index.m3u8",
        quality: "1080p FHD",
        isHD: true
      }
    ],
    isLive: true,
    isHD: true
  },
  {
    id: "ch-tnt-sports-3",
    name: "TNT Sports 3",
    category: "Sports",
    categories: ["LiveTV", "Sports", "Combat Sports", "Boxing", "UFC"],
    sports: ["Combat Sports", "Boxing", "UFC"],
    priority: 1,
    active: true,
    provider: "HighFy",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/TNT_Sports_%28United_Kingdom%29_logo.svg/320px-TNT_Sports_%28United_Kingdom%29_logo.svg.png",
    url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/6564/index.m3u8",
    streamUrl: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/6564/index.m3u8",
    stream_url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/6564/index.m3u8",
    streams: [
      {
        name: "TNT Sports 3 (Server 1 HD)",
        serverLabel: "Server 1 HD",
        channelName: "TNT Sports 3",
        url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/6564/index.m3u8",
        quality: "1080p FHD",
        isHD: true
      }
    ],
    isLive: true,
    isHD: true
  },
  {
    id: "ch-tnt-sports-4",
    name: "TNT Sports 4",
    category: "Sports",
    categories: ["LiveTV", "Sports", "Motorsport", "WWE", "Combat Sports"],
    sports: ["Motorsport", "WWE", "Combat Sports"],
    priority: 1,
    active: true,
    provider: "HighFy",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/TNT_Sports_%28United_Kingdom%29_logo.svg/320px-TNT_Sports_%28United_Kingdom%29_logo.svg.png",
    url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/19054/index.m3u8",
    streamUrl: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/19054/index.m3u8",
    stream_url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/19054/index.m3u8",
    streams: [
      {
        name: "TNT Sports 4 (Server 1 HD)",
        serverLabel: "Server 1 HD",
        channelName: "TNT Sports 4",
        url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/19054/index.m3u8",
        quality: "1080p FHD",
        isHD: true
      }
    ],
    isLive: true,
    isHD: true
  },
  {
    id: "ch-bein-sports-1-hd",
    name: "beIN Sports 1 HD",
    category: "Sports",
    categories: ["LiveTV", "Sports", "Football", "Champions League", "La Liga"],
    sports: ["Football"],
    priority: 1,
    active: true,
    provider: "HighFy",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/BeIN_Sports_1_logo.svg/320px-BeIN_Sports_1_logo.svg.png",
    url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/6123/index.m3u8",
    streamUrl: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/6123/index.m3u8",
    stream_url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/6123/index.m3u8",
    streams: [
      {
        name: "beIN Sports 1 HD (Server 1 HD)",
        serverLabel: "Server 1 HD",
        channelName: "beIN Sports 1 HD",
        url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/6123/index.m3u8",
        quality: "1080p FHD",
        isHD: true
      }
    ],
    isLive: true,
    isHD: true
  },
  {
    id: "ch-bein-sports-3-hd",
    name: "beIN Sports 3 HD",
    category: "Sports",
    categories: ["LiveTV", "Sports", "Football", "Ligue 1", "Tennis"],
    sports: ["Football", "Tennis"],
    priority: 1,
    active: true,
    provider: "HighFy",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/BeIN_Sports_3_logo.svg/320px-BeIN_Sports_3_logo.svg.png",
    url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/6124/index.m3u8",
    streamUrl: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/6124/index.m3u8",
    stream_url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/6124/index.m3u8",
    streams: [
      {
        name: "beIN Sports 3 HD (Server 1 HD)",
        serverLabel: "Server 1 HD",
        channelName: "beIN Sports 3 HD",
        url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/6124/index.m3u8",
        quality: "1080p FHD",
        isHD: true
      }
    ],
    isLive: true,
    isHD: true
  },
  {
    id: "ch-bein-sports-4-hd",
    name: "beIN Sports 4 HD",
    category: "Sports",
    categories: ["LiveTV", "Sports", "Football", "Premier League", "Basketball"],
    sports: ["Football", "Basketball"],
    priority: 1,
    active: true,
    provider: "HighFy",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/BeIN_Sports_4_logo.svg/320px-BeIN_Sports_4_logo.svg.png",
    url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/6125/index.m3u8",
    streamUrl: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/6125/index.m3u8",
    stream_url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/6125/index.m3u8",
    streams: [
      {
        name: "beIN Sports 4 HD (Server 1 HD)",
        serverLabel: "Server 1 HD",
        channelName: "beIN Sports 4 HD",
        url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/6125/index.m3u8",
        quality: "1080p FHD",
        isHD: true
      }
    ],
    isLive: true,
    isHD: true
  },
  {
    id: "ch-bein-sports-5-hd",
    name: "beIN Sports 5 HD",
    category: "Sports",
    categories: ["LiveTV", "Sports", "Football", "Motorsport", "Tennis"],
    sports: ["Football", "Motorsport", "Tennis"],
    priority: 1,
    active: true,
    provider: "HighFy",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/88/BeIN_Sports_5_logo.svg/320px-BeIN_Sports_5_logo.svg.png",
    url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/6126/index.m3u8",
    streamUrl: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/6126/index.m3u8",
    stream_url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/6126/index.m3u8",
    streams: [
      {
        name: "beIN Sports 5 HD (Server 1 HD)",
        serverLabel: "Server 1 HD",
        channelName: "beIN Sports 5 HD",
        url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/6126/index.m3u8",
        quality: "1080p FHD",
        isHD: true
      }
    ],
    isLive: true,
    isHD: true
  }
];

// Perform merge / update in channels.json
let updatedCount = 0;
let addedCount = 0;

for (const newCh of newSportsChannels) {
  // Check if channel already exists by ID or name
  const existingIdx = channels.findIndex(c => 
    c.id === newCh.id || 
    c.name.toLowerCase() === newCh.name.toLowerCase()
  );

  if (existingIdx >= 0) {
    // Merge properties while keeping existing custom fields
    const oldCh = channels[existingIdx];
    channels[existingIdx] = {
      ...oldCh,
      ...newCh,
      logo: newCh.logo || oldCh.logo,
      streams: newCh.streams && newCh.streams.length > 0 ? newCh.streams : oldCh.streams,
      backupUrls: newCh.backupUrls || oldCh.backupUrls || [],
      sports: newCh.sports || oldCh.sports || []
    };
    updatedCount++;
  } else {
    // Insert new channel near the top of sports channels (after priority sports like T Sports)
    channels.push(newCh);
    addedCount++;
  }
}

// Write back to channels.json
fs.writeFileSync(channelsFile, JSON.stringify(channels, null, 2), 'utf8');
console.log(`Updated channels.json: ${updatedCount} existing channels updated, ${addedCount} new channels added. Total channels: ${channels.length}`);

// Re-generate playlist.m3u8
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
console.log(`Synchronized playlist.m3u8 successfully with ${channels.length} channels.`);
