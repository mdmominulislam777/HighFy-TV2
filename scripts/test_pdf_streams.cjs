const fs = require('fs');

const pdfChannels = [
  // Page 1
  { name: "Star Sports 1 Hindi", url: "http://41.205.93.154/STARSPORTS1/index.m3u8" },
  { name: "STAR SPORTS KHEL", url: "http://103.175.73.12:8080/live/151/151_0.m3u8" },
  { name: "ZIGGO SPORT 1", url: "http://ytoxw6un.ottclub.xyz/iptv/KCUHA6DGYYVA8ZZFUPQV3KZH/2560/index.m3u8" },
  { name: "ZIGGO SPORT 2", url: "http://ytoxw6un.ottclub.xyz/iptv/KCUHA6DGYYVA8ZZFUPQV3KZH/2561/index.m3u8" },
  { name: "ZIGGO SPORT 3", url: "http://ytoxw6un.ottclub.xyz/iptv/KCUHA6DGYYVA8ZZFUPQV3KZH/2559/index.m3u8" },
  { name: "DAZN 1", url: "http://ytoxw6un.ottclub.xyz/iptv/KCUHA6DGYYVA8ZZFUPQV3KZH/2531/index.m3u8" },
  { name: "DAZN 2", url: "http://ytoxw6un.ottclub.xyz/iptv/KCUHA6DGYYVA8ZZFUPQV3KZH/2532/index.m3u8" },
  { name: "DAZN 4", url: "http://ytoxw6un.ottclub.xyz/iptv/KCUHA6DGYYVA8ZZFUPQV3KZH/2534/index.m3u8" },
  { name: "DAZN 5", url: "http://ytoxw6un.ottclub.xyz/iptv/KCUHA6DGYYVA8ZZFUPQV3KZH/2535/index.m3u8" },
  { name: "EUROSPORT 1", url: "http://151.80.18.177:86/Eurosport_HD/index.m3u8" },

  // Page 2
  { name: "EUROSPORT 2", url: "http://151.80.18.177:86/Eurosport_2_HD/index.m3u8" },
  { name: "ESPN", url: "http://ytoxw6un.ottclub.xyz/iptv/KCUHA6DGYYVA8ZZFUPQV3KZH/19056/index.m3u8" },
  { name: "Trace Sport", url: "https://lightning-tracesport-samsungau.amagi.tv/playlist.m3u8" },
  { name: "SKY SPORTS ACTION", url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/9155/index.m3u8" },
  { name: "SKY SPORTS CRICKET", url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/9258/index.m3u8" },
  { name: "SKY SPORTS FOOTBALL", url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/9289/index.m3u8" },
  { name: "SKY SPORTS GOLF", url: "http://ytoxw6un.ottclub.xyz/iptv/KCUHA6DGYYVA8ZZFUPQV3KZH/19132/index.m3u8" },
  { name: "SKY SPORTS MIX", url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/9310/index.m3u8" },
  { name: "SKY SPORTS EPL", url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/9334/index.m3u8" },
  { name: "SKY SPORTS RACING", url: "http://ytoxw6un.ottclub.xyz/iptv/KCUHA6DGYYVA8ZZFUPQV3KZH/7341/index.m3u8" },
  { name: "SKY SPORTS TENNIS", url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/6546/index.m3u8" },

  // Page 3
  { name: "Sport 1", url: "http://212.102.38.45/live/test_sport1_25p/playlist.m3u8" },
  { name: "Sport 2", url: "http://212.102.38.45/live/test_sport_2/playlist.m3u8" },
  { name: "DD SPORTS", url: "https://d3qs3d2rkhfqrt.cloudfront.net/out/v1/b17adfe543354fdd8d189b110617cddd/index.m3u8" },
  { name: "Football World Cup 2026 fast", url: "https://live.inplyr.com/room/168740.m3u8" },
  { name: "GO 3 sport 1 hd", url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/18000/index.m3u8" },
  { name: "GO 3 sport 2 hd", url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/18012/index.m3u8" },
  { name: "TNT Sports 1", url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/2505/index.m3u8" },
  { name: "TNT Sports 2", url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/2506/index.m3u8" },
  { name: "TNT Sports 3", url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/6564/index.m3u8" },
  { name: "TNT Sports 4", url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/19054/index.m3u8" },
  { name: "ZIGGO SPORT 1", url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/2560/index.m3u8" },
  { name: "ZIGGO SPORT 2", url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/2561/index.m3u8" },

  // Page 4
  { name: "ZIGGO SPORT 3", url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXSYCA/2559/index.m3u8" },
  { name: "DAZN 1", url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/2531/index.m3u8" },
  { name: "DAZN 2", url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/2532/index.m3u8" },
  { name: "DAZN 3", url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/2533/index.m3u8" },
  { name: "DAZN 4", url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/2534/index.m3u8" },
  { name: "DAZN 5", url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/2535/index.m3u8" },
  { name: "SKY SPORTS F1", url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/7342/index.m3u8" },
  { name: "beIN SPORTS 1 HD", url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/6123/index.m3u8" },
  { name: "beIN SPORTS 3 HD", url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/6124/index.m3u8" },
  { name: "beIN SPORTS 4 HD", url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/6125/index.m3u8" },
  { name: "beIN SPORTS 5 HD", url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/6126/index.m3u8" }
];

console.log(`Testing all ${pdfChannels.length} stream entries from user PDF...`);

(async () => {
  let okCount = 0;
  for (let i = 0; i < pdfChannels.length; i++) {
    const item = pdfChannels[i];
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(item.url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: controller.signal
      });
      clearTimeout(timeout);
      const txt = await res.text();
      const isM3u8 = txt.includes('#EXTM3U');
      if (res.status === 200 && isM3u8) {
        okCount++;
        console.log(`[${i+1}/${pdfChannels.length}] OK (200, M3U8): ${item.name} -> ${item.url.slice(0, 50)}...`);
      } else {
        console.log(`[${i+1}/${pdfChannels.length}] Non-200/non-M3U8 (${res.status}): ${item.name}`);
      }
    } catch (e) {
      console.log(`[${i+1}/${pdfChannels.length}] Failed (${e.message}): ${item.name}`);
    }
  }
  console.log(`Finished: ${okCount}/${pdfChannels.length} streams successfully verified live.`);
})();
