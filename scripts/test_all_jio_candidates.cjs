const https = require('https');
const fs = require('fs');

const candidateChannels = [
  // Sports
  { id: 162, name: 'Sony Ten 1 HD', group: 'Sports', sports: ['Cricket', 'WWE', 'Football'] },
  { id: 155, name: 'Sony Ten 5 HD', group: 'Sports', sports: ['Football', 'Tennis'] },
  { id: 514, name: 'Sony Ten 1', group: 'Sports', sports: ['Cricket', 'WWE'] },
  { id: 523, name: 'Ten 2', group: 'Sports', sports: ['Football'] },
  { id: 524, name: 'Sony Ten 3 Hindi', group: 'Sports', sports: ['Cricket', 'WWE'] },
  { id: 525, name: 'Sony Ten 5', group: 'Sports', sports: ['Football'] },
  { id: 891, name: 'Sony Ten 2 HD', group: 'Sports', sports: ['Football'] },
  { id: 892, name: 'Sony Ten 3 HD Hindi', group: 'Sports', sports: ['Cricket', 'WWE'] },
  { id: 1774, name: 'Sony Ten 4 Tamil', group: 'Sports', sports: ['Cricket', 'WWE'] },
  { id: 1775, name: 'Sony Ten 4 Telugu', group: 'Sports', sports: ['Cricket', 'WWE'] },
  { id: 3510, name: 'Sony Sports Ten 1 HD STB', group: 'Sports', sports: ['Cricket', 'WWE'] },
  { id: 3511, name: 'Sony Sports Ten 2 HD STB', group: 'Sports', sports: ['Football'] },
  { id: 3512, name: 'Sony Sports Ten 3 Hindi HD STB', group: 'Sports', sports: ['Cricket', 'WWE'] },
  { id: 3513, name: 'Sony Sports Ten 4 Telugu STB', group: 'Sports', sports: ['Cricket', 'WWE'] },
  { id: 3514, name: 'Sony Sports Ten 4 Tamil STB', group: 'Sports', sports: ['Cricket', 'WWE'] },
  { id: 3515, name: 'Sony Sports Ten 5 HD STB', group: 'Sports', sports: ['Football'] },
  { id: 1984, name: 'Star Sports 2 Hindi HD', group: 'Sports', sports: ['Cricket', 'Kabaddi'] },
  { id: 1985, name: 'Star Sports 2 Hindi', group: 'Sports', sports: ['Cricket', 'Kabaddi'] },
  { id: 2852, name: 'Star Sports 2 Telugu', group: 'Sports', sports: ['Cricket'] },
  { id: 2853, name: 'Star Sports 2 Tamil', group: 'Sports', sports: ['Cricket'] },
  { id: 1998, name: 'Star Sports Khel', group: 'Sports', sports: ['Cricket', 'Kabaddi'] },
  { id: 875, name: 'Eurosport HD', group: 'Sports', sports: ['Tennis', 'Motorsport'] },
  { id: 1294, name: 'Eurosport', group: 'Sports', sports: ['Tennis', 'Motorsport'] },
  { id: 204, name: 'DD Sports', group: 'Sports', sports: ['Cricket', 'Football'] },
  { id: 3146, name: 'All Women Sports Network', group: 'Sports', sports: ['Football', 'Basketball'] },
  { id: 2779, name: 'Red Bull TV', group: 'Sports', sports: ['Motorsport'] },
  { id: 3243, name: 'Pickleball Now', group: 'Sports', sports: ['Tennis'] },
  { id: 3499, name: 'World Chess', group: 'Sports', sports: ['Chess'] },

  // Bangla
  { id: 464, name: 'Zee 24 Ghanta', group: 'News', isBangla: true },
  { id: 625, name: 'Zee Bangla', group: 'Bengali', isBangla: true },
  { id: 672, name: 'ABP Ananda', group: 'News', isBangla: true },
  { id: 697, name: 'Sony AATH', group: 'Bengali', isBangla: true },
  { id: 717, name: 'News18 Bangla', group: 'News', isBangla: true },
  { id: 756, name: 'Colors Bangla HD', group: 'Bengali', isBangla: true },
  { id: 1369, name: 'Colors Bangla SD', group: 'Bengali', isBangla: true },
  { id: 1657, name: 'Colors Bangla Cinema', group: 'Movies', isBangla: true },
  { id: 685, name: 'Zee Bangla Cinema', group: 'Movies', isBangla: true },
  { id: 690, name: 'DD Bangla', group: 'News', isBangla: true },
  { id: 698, name: 'Aakash Aath', group: 'Bengali', isBangla: true },
  { id: 740, name: 'Sangeet Bangla', group: 'Music', isBangla: true },
  { id: 1341, name: 'Nick Bangla', group: 'Kids', isBangla: true },
  { id: 1345, name: 'Sonic Bangla', group: 'Kids', isBangla: true },
  { id: 1735, name: 'TV9 Bangla', group: 'News', isBangla: true },
  { id: 1796, name: 'Ananda Barta', group: 'News', isBangla: true },
  { id: 1962, name: 'Amar Bangla TV', group: 'News', isBangla: true },
  { id: 1977, name: 'Zee Bangla HD', group: 'Bengali', isBangla: true },
  { id: 2027, name: 'Raatdin Bangla', group: 'News', isBangla: true },
  { id: 2184, name: 'U Bangla', group: 'Infotainment', isBangla: true },
  { id: 2228, name: 'Samay Kolkata', group: 'News', isBangla: true },
  { id: 2780, name: 'R Bangla', group: 'News', isBangla: true },
  { id: 2817, name: 'Boogle Bangla', group: 'Bengali', isBangla: true },
  { id: 2933, name: 'NK TV Bangla', group: 'News', isBangla: true },
  { id: 3005, name: 'Rupashi Bangla', group: 'Bengali', isBangla: true },
  { id: 3006, name: 'Dhoom Music Bangla', group: 'Music', isBangla: true },
  { id: 3019, name: 'Bangla Jago', group: 'News', isBangla: true },
  { id: 3298, name: 'Mon TV Bangla', group: 'Music', isBangla: true },
  { id: 3424, name: 'Sony YAY Bengali', group: 'Kids', isBangla: true },
  { id: 3428, name: 'Discovery HD Bengali', group: 'Infotainment', isBangla: true },
  { id: 3439, name: 'Akhon kolkata', group: 'News', isBangla: true },
  { id: 3476, name: 'Zee Bangla Sonar', group: 'Movies', isBangla: true },

  // Entertainment
  { id: 144, name: 'Colors HD', group: 'Entertainment' },
  { id: 154, name: 'Sony SAB', group: 'Entertainment' },
  { id: 279, name: 'Colors Rishtey', group: 'Entertainment' },
  { id: 291, name: 'SET HD', group: 'Entertainment' },
  { id: 471, name: 'Sony SAB HD', group: 'Entertainment' },
  { id: 472, name: 'And TV HD', group: 'Entertainment' },
  { id: 473, name: 'Anmol TV', group: 'Entertainment' },
  { id: 474, name: 'Sony Pal', group: 'Entertainment' },
  { id: 1132, name: 'Star Plus HD', group: 'Entertainment' },
  { id: 1143, name: 'Star Utsav', group: 'Entertainment' },
  { id: 1146, name: 'Sony Marathi SD', group: 'Entertainment' },
  { id: 1158, name: 'Colors Infinity HD', group: 'Entertainment' },
  { id: 1351, name: 'Zee TV', group: 'Entertainment' },
  { id: 1368, name: 'Colors SD', group: 'Entertainment' },
  { id: 1393, name: 'Sony Wah', group: 'Entertainment' },
  { id: 1396, name: 'Set SD', group: 'Entertainment' },
  { id: 1961, name: 'Shemaroo TV', group: 'Entertainment' },
  { id: 2024, name: 'And TV', group: 'Entertainment' },
  { id: 2078, name: 'Shemaroo Umang', group: 'Entertainment' },
  { id: 3088, name: 'Sun Neo HD', group: 'Entertainment' },
  { id: 3381, name: 'Brio TV', group: 'Entertainment' },
  { id: 3382, name: 'EPIC TV', group: 'Entertainment' },
  { id: 3509, name: 'SET HD STB', group: 'Entertainment' },

  // Movies
  { id: 151, name: 'Movies Now HD', group: 'Movies' },
  { id: 156, name: 'Star Gold HD', group: 'Movies' },
  { id: 182, name: 'B4U Movies', group: 'Movies' },
  { id: 185, name: 'And Pictures HD', group: 'Movies' },
  { id: 289, name: 'Sony Max SD', group: 'Movies' },
  { id: 476, name: 'Sony Max HD', group: 'Movies' },
  { id: 477, name: 'MN+ HD', group: 'Movies' },
  { id: 478, name: 'Romedy Now HD', group: 'Movies' },
  { id: 482, name: 'Colors Cineplex', group: 'Movies' },
  { id: 483, name: 'Sony MAX2', group: 'Movies' },
  { id: 484, name: 'Zee Cinema', group: 'Movies' },
  { id: 488, name: 'Zee Action', group: 'Movies' },
  { id: 877, name: 'MNX HD', group: 'Movies' },
  { id: 1104, name: 'Star Movies HD', group: 'Movies' },
  { id: 1110, name: 'Star Movies Select HD', group: 'Movies' },
  { id: 1113, name: 'Star Gold Select HD', group: 'Movies' },
  { id: 1136, name: 'Star Utsav Movies', group: 'Movies' },
  { id: 1295, name: 'B4U Kadak', group: 'Movies' },
  { id: 1322, name: 'And Flix HD', group: 'Movies' },
  { id: 1401, name: 'Romedy Now', group: 'Movies' },
  { id: 1450, name: 'Colors Cineplex Superhit', group: 'Movies' },
  { id: 1477, name: 'Colors Cineplex HD', group: 'Movies' },
  { id: 1763, name: 'Colors Cineplex Bollywood', group: 'Movies' },
  { id: 1839, name: 'And Pictures', group: 'Movies' },
  { id: 2761, name: 'Zee Anmol Cinema 2', group: 'Movies' },
  { id: 2832, name: 'Sony Max HD EPG', group: 'Movies' },
  { id: 2834, name: 'Sony MAX2 EPG', group: 'Movies' },
  { id: 3075, name: 'Shemaroo Bollywood', group: 'Movies' },
  { id: 3096, name: 'Star Gold 2 HD', group: 'Movies' },
  { id: 3097, name: 'Star Gold Romance', group: 'Movies' },
  { id: 3098, name: 'Star Gold Thrills', group: 'Movies' },
  { id: 3418, name: 'Sony MAX1', group: 'Movies' },

  // News
  { id: 142, name: 'BBC World News', group: 'News' },
  { id: 173, name: 'Aaj Tak', group: 'News' },
  { id: 177, name: 'ABP News India', group: 'News' },
  { id: 193, name: 'CNN', group: 'News' },
  { id: 203, name: 'DD News', group: 'News' },
  { id: 231, name: 'News 18 India', group: 'News' },
  { id: 235, name: 'India TV', group: 'News' },
  { id: 255, name: 'NDTV 24x7', group: 'News' },
  { id: 258, name: 'NDTV India', group: 'News' },
  { id: 383, name: 'Times NOW', group: 'News' },
  { id: 412, name: 'Wion', group: 'News' },
  { id: 489, name: 'CNBC TV18', group: 'News' },
  { id: 491, name: 'Mirror Now', group: 'News' },
  { id: 492, name: 'CNN NEWS18', group: 'News' },
  { id: 493, name: 'India Today', group: 'News' },
  { id: 494, name: 'AL Jazeera', group: 'News' },
  { id: 501, name: 'News 24', group: 'News' },
  { id: 504, name: 'Zee News', group: 'News' },
  { id: 876, name: 'Times Now World', group: 'News' },
  { id: 1251, name: 'TV9 Bharatvarsh', group: 'News' },
  { id: 1403, name: 'Republic Bharat', group: 'News' },
  { id: 1431, name: 'BBC News Hindi', group: 'News' },
  { id: 1906, name: 'Times Now Navbharat', group: 'News' },
  { id: 2079, name: 'Bharat 24', group: 'News' },
  { id: 2772, name: 'India Daily 24x7', group: 'News' },

  // Kids
  { id: 544, name: 'Nick Junior', group: 'Kids' },
  { id: 545, name: 'Nick Hindi', group: 'Kids' },
  { id: 559, name: 'Pogo Hindi', group: 'Kids' },
  { id: 816, name: 'Cartoon Network Hindi', group: 'Kids' },
  { id: 872, name: 'Sony Yay Hindi', group: 'Kids' },
  { id: 1079, name: 'Cartoon Network HD+ English', group: 'Kids' },
  { id: 1226, name: 'Nick HD+', group: 'Kids' },
  { id: 1373, name: 'Disney Channel', group: 'Kids' },
  { id: 1374, name: 'Disney Junior', group: 'Kids' },
  { id: 1375, name: 'Disney International HD', group: 'Kids' },
  { id: 1391, name: 'Hungama', group: 'Kids' },
  { id: 1392, name: 'Super Hungama', group: 'Kids' },
  { id: 1780, name: 'HooplaKidz TV', group: 'Kids' },
  { id: 1976, name: 'BBC Cbeebies', group: 'Kids' },
  { id: 3507, name: 'Sony YAY', group: 'Kids' },

  // Infotainment
  { id: 146, name: 'History TV18 HD', group: 'Infotainment' },
  { id: 164, name: 'Travelxp HD', group: 'Infotainment' },
  { id: 242, name: 'Discovery English', group: 'Infotainment' },
  { id: 286, name: 'Animal Planet HD English', group: 'Infotainment' },
  { id: 463, name: 'Discovery HD English', group: 'Infotainment' },
  { id: 541, name: 'Discovery Turbo', group: 'Infotainment' },
  { id: 566, name: 'Animal Planet Hindi', group: 'Infotainment' },
  { id: 568, name: 'Discovery Science English', group: 'Infotainment' },
  { id: 575, name: 'Discovery Hindi', group: 'Infotainment' },
  { id: 578, name: 'History TV18 HD Hindi', group: 'Infotainment' },
  { id: 821, name: 'Sony BBC Earth HD', group: 'Infotainment' },
  { id: 823, name: 'Sony BBC Earth SD', group: 'Infotainment' },
  { id: 1332, name: 'Nat Geo Wild HD', group: 'Infotainment' },
  { id: 1335, name: 'National Geographic HD', group: 'Infotainment' },
  { id: 2437, name: 'Wild Earth', group: 'Infotainment' },
  { id: 3402, name: 'DocuBay', group: 'Infotainment' },

  // Music
  { id: 183, name: 'B4U Music', group: 'Music' },
  { id: 248, name: 'MTV', group: 'Music' },
  { id: 250, name: 'Music India', group: 'Music' },
  { id: 587, name: '9XM', group: 'Music' },
  { id: 592, name: 'ZOOM', group: 'Music' },
  { id: 1145, name: 'MTV HD', group: 'Music' },
  { id: 2753, name: 'YRF Music', group: 'Music' },
  { id: 3074, name: 'Shemaroo Filmy Gaane', group: 'Music' }
];

async function checkChannel(ch) {
  const url = `https://hey-lookme.shop/live.php?id=${ch.id}`;
  return new Promise((resolve) => {
    let isDone = false;
    const timer = setTimeout(() => {
      if (!isDone) {
        isDone = true;
        resolve({ ...ch, live: false, reason: 'TIMEOUT' });
      }
    }, 5000);

    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Referer': 'https://hey-lookme.shop/'
      }
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        if (isDone) return;
        isDone = true;
        clearTimeout(timer);
        if (res.statusCode === 200 && body.includes('#EXTM3U') && !body.includes('404 Not Found') && !body.includes('<script')) {
          resolve({ ...ch, live: true, status: 200 });
        } else {
          resolve({ ...ch, live: false, reason: `Status ${res.statusCode}` });
        }
      });
    });

    req.on('error', (e) => {
      if (isDone) return;
      isDone = true;
      clearTimeout(timer);
      resolve({ ...ch, live: false, reason: e.message });
    });
  });
}

// Batch execution with concurrency limit
async function runAll() {
  console.log(`Starting audit of ${candidateChannels.length} JioTV candidates...`);
  const chunkSize = 15;
  const results = [];
  for (let i = 0; i < candidateChannels.length; i += chunkSize) {
    const chunk = candidateChannels.slice(i, i + chunkSize);
    const chunkRes = await Promise.all(chunk.map(checkChannel));
    results.push(...chunkRes);
    process.stdout.write(`Tested ${Math.min(i + chunkSize, candidateChannels.length)}/${candidateChannels.length}\r`);
  }

  const live = results.filter(r => r.live);
  const dead = results.filter(r => !r.live);

  console.log(`\n\nCompleted! Live: ${live.length}, Dead: ${dead.length}`);
  fs.writeFileSync('scripts/jio_verified_live.json', JSON.stringify(live, null, 2), 'utf8');
  console.log('Saved verified live channels to scripts/jio_verified_live.json');
}

runAll();
