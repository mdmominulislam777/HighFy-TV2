/**
 * HIGHFY TV - Central Sports Coordinator (sports.js)
 * Unifies Football (API-Football), Cricket (CricketData), and WWE into one normalized stream.
 * Handles deduplication, caching, auto-refresh, search, favorites, countdowns, and stream matching.
 * Compatible with GitHub Pages.
 */

class SportsCoordinator {
  constructor() {
    this.events = [];
    this.errors = {
      football: null,
      cricket: null,
      wwe: null
    };
    this.statusReports = {
      football: { configured: false, live: 0, upcoming: 0, finished: 0 },
      cricket: { configured: false, live: 0, upcoming: 0, finished: 0 },
      wwe: { configured: false, live: 0, upcoming: 0, finished: 0 },
      allsportsapi: { configured: false, live: 0, upcoming: 0, finished: 0 },
      sofascore: { configured: false, live: 0, upcoming: 0, finished: 0 }
    };
    this.lastUpdated = null;
    this.lastFetchTime = 0;
    this.fetchTtl = 5 * 60 * 1000; // 5 minutes coordinator cache
    this.channels = [];
    this.favKey = 'highfy_sports_favs';
    this.cacheKey = 'highfy_coordinator_events';
    this.mappingStorageKey = 'highfy_event_channel_map_v3';
    this.eventChannelMap = new Map();
    this.inFlightFetch = null;
    this.loadLocalCache();
    this.loadEventChannelMap();
  }

  /**
   * Hydrate events from localStorage with strict staleness validation
   */
  loadLocalCache() {
    try {
      const stored = localStorage.getItem(this.cacheKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        const now = Date.now();
        // Strict TTL: Discard cache if older than 5 minutes
        if (parsed && (now - (parsed.timestamp || 0) < 5 * 60 * 1000) && Array.isArray(parsed.events) && parsed.events.length > 0) {
          // Clean any stale "live" matches or legacy mock matches from cache
          const cleanedEvents = parsed.events
            .filter(ev => {
              if (!ev || !ev.id) return false;
              const id = String(ev.id);
              if (id.startsWith('cricket-upcoming-') || id.startsWith('cricket-live-') || id.startsWith('football-live-') || id.startsWith('dummy-') || id.startsWith('mock-') || id.startsWith('sample-')) {
                return false;
              }
              return true;
            })
            .map(ev => {
              const evTime = ev.timestamp || 0;
              if (ev.status === 'live' && (now - evTime > 12 * 60 * 60 * 1000)) {
                return { ...ev, status: 'finished', timeOrTimer: 'FT', statusLabel: 'Finished' };
              }
              return ev;
            });
          this.events = cleanedEvents;
          this.lastFetchTime = parsed.timestamp || 0;
          this.lastUpdated = new Date(this.lastFetchTime);
        } else {
          localStorage.removeItem(this.cacheKey);
          this.events = [];
          this.lastFetchTime = 0;
        }
      }
    } catch (e) {
      localStorage.removeItem(this.cacheKey);
    }
  }

  /**
   * Save curated events to localStorage
   */
  saveLocalCache(events, timestamp = Date.now()) {
    try {
      this.events = events;
      this.lastFetchTime = timestamp;
      this.lastUpdated = new Date(timestamp);
      localStorage.setItem(this.cacheKey, JSON.stringify({ timestamp, events }));
    } catch (e) {}
  }

  /**
   * Load reliable Event-to-Channel Mapping from persistent storage
   */
  loadEventChannelMap() {
    try {
      const stored = localStorage.getItem(this.mappingStorageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        const now = Date.now();
        if (parsed && typeof parsed === 'object') {
          for (const [id, item] of Object.entries(parsed)) {
            // Keep mappings valid for up to 12 hours
            if (item && (now - (item.cachedAt || 0) < 12 * 60 * 60 * 1000)) {
              this.eventChannelMap.set(id, item);
            }
          }
        }
      }
    } catch (e) {}
  }

  /**
   * Save reliable Event-to-Channel Mapping both in-memory and to localStorage
   */
  saveEventChannelMap(eventOrId, channelOrId) {
    if (!eventOrId || !channelOrId) return;
    try {
      const candidateIds = [];
      if (typeof eventOrId === 'object') {
        if (eventOrId.id) candidateIds.push(String(eventOrId.id));
        if (eventOrId.rawId) candidateIds.push(String(eventOrId.rawId));
        if (eventOrId.idEvent) candidateIds.push(String(eventOrId.idEvent));
        if (eventOrId.matchId) candidateIds.push(String(eventOrId.matchId));
      } else {
        candidateIds.push(String(eventOrId));
      }

      let channelId = '';
      let channelName = '';
      if (typeof channelOrId === 'object') {
        channelId = channelOrId.id || channelOrId.channelId || '';
        channelName = channelOrId.name || channelOrId.channelName || '';
      } else {
        channelId = String(channelOrId);
      }

      if (!channelId) return;

      const payload = {
        channelId: channelId,
        channelName: channelName,
        cachedAt: Date.now()
      };

      for (const id of candidateIds) {
        this.eventChannelMap.set(id, payload);
      }

      // Persist top 300 active mappings to avoid localStorage quota issues
      const obj = {};
      let count = 0;
      for (const [k, v] of this.eventChannelMap.entries()) {
        if (count++ > 300) break;
        obj[k] = v;
      }
      localStorage.setItem(this.mappingStorageKey, JSON.stringify(obj));
    } catch (e) {}
  }

  /**
   * Retrieve reliable mapped channel for an event without re-guessing
   * Returns the verified active Channel object from existing app channels
   */
  getMappedChannel(event) {
    if (!event) return null;
    const now = Date.now();
    const candidateIds = [
      event.id,
      event.rawId,
      event.idEvent,
      event.matchId,
      event.sofascoreId
    ].filter(Boolean).map(String);

    let foundEntry = null;
    for (const cid of candidateIds) {
      if (this.eventChannelMap.has(cid)) {
        const entry = this.eventChannelMap.get(cid);
        if (entry && (now - (entry.cachedAt || 0) < 24 * 60 * 60 * 1000)) {
          foundEntry = entry;
          break;
        }
      }
    }

    if (!foundEntry || !foundEntry.channelId) return null;

    // Verify channel still exists and is active in channels catalog
    const sportsChannels = this.getAllSportsChannels();
    const verifiedChannel = sportsChannels.find(c => 
      (c.id === foundEntry.channelId || c.id === `ch-${foundEntry.channelId}`) &&
      c.active !== false &&
      (c.stream_url || c.url || c.streamUrl)
    );

    if (verifiedChannel) {
      // Data integrity guard: Never allow T Sports to be recalled for EPL, La Liga, UCL or non-Bangladesh matches
      const chName = (verifiedChannel.name || '').toLowerCase();
      const sport = (event.sport || event.sportName || '').toLowerCase();
      const tourn = (event.tournament || event.league || '').toLowerCase();
      const country = (event.country || '').toLowerCase();
      const t1 = (event.team1?.name || event.homeTeam?.name || '').toLowerCase();
      const t2 = (event.team2?.name || event.awayTeam?.name || '').toLowerCase();
      const isTSports = chName.includes('t sports') || chName.includes('tsports');

      if (isTSports) {
        const isBD = tourn.includes('bangladesh') || tourn.includes('bpl') || country.includes('bangladesh') ||
          tourn.includes('dhaka') || t1.includes('bangladesh') || t2.includes('bangladesh');
        if (!isBD) return null; // Discard invalid cached mapping
      }
      return verifiedChannel;
    }

    return null;
  }

  /**
   * Resolve authentic Fixture Broadcaster directly from API if missing
   */
  async resolveFixtureBroadcaster(event) {
    if (!event || event.source === 'Sportradar') return null;

    const fixtureId = event.rawId || event.idEvent || event.matchId || event.id;
    if (fixtureId) {
      try {
        const cleanId = String(fixtureId).replace(/^tsdb-/, '');
        const res = await fetch(`/api/fixture/broadcaster?fixtureId=${encodeURIComponent(cleanId)}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.status === 'success' && data.broadcaster) {
            event.broadcaster = data.broadcaster;
            event.broadcasters = data.broadcasters || [data.broadcaster];
            event.strTVStation = data.broadcaster;
          }
        }
      } catch (e) {
        console.warn('[SportsCoordinator] Fixture broadcaster resolve error:', e.message);
      }
    }

    return this.matchLiveStream(event);
  }

  /**
   * Set TV Channels list for live stream matching & automatically re-bind all events
   */
  setChannels(channelsList) {
    if (Array.isArray(channelsList)) {
      this.channels = channelsList;
      // Auto-bind streams to all currently loaded events
      if (Array.isArray(this.events) && this.events.length > 0) {
        this.events.forEach(ev => {
          const matchInfo = this.matchLiveStream(ev);
          if (matchInfo.hasStream) {
            ev.streams = matchInfo.streams;
            ev.broadcastChannels = matchInfo.broadcastChannels;
            ev.broadcastingChannelDetails = matchInfo.broadcastingChannelDetails;
          }
        });
      }
    }
  }

  /**
   * Core Sports Channels Catalog for instant 0-latency matching
   */
  getDefaultSportsChannels() {
    return [
      {
        id: "ch-t-sports-bd",
        name: "T Sports HD",
        category: "Sports",
        categories: ["Sports", "Bangla", "Cricket", "Football"],
        logo: "./assets/channel-logos/ch-t-sports-bd.svg",
        stream_url: "https://tvsen3.aynaott.com/Sports1/mono.m3u8",
        url: "https://tvsen3.aynaott.com/Sports1/mono.m3u8",
        backupUrls: ["https://s1.itcnbd.live/T-Sports-HD/tracks-v1a1/mono.m3u8"],
        isHD: true
      },
      {
        id: "sports-t-sports-1",
        name: "T Sports Live 01",
        category: "Sports",
        categories: ["Sports", "Bangla", "Cricket"],
        logo: "./assets/channel-logos/sports-t-sports-1.svg",
        stream_url: "https://tvsen3.aynaott.com/Sports1/mono.m3u8",
        url: "https://tvsen3.aynaott.com/Sports1/mono.m3u8",
        backupUrls: ["https://s1.itcnbd.live/T-Sports-HD/tracks-v1a1/mono.m3u8"],
        isHD: true
      },
      {
        id: "sports-star-sports-1",
        name: "Star Sports 1",
        category: "Sports",
        categories: ["Sports", "Cricket", "India"],
        logo: "./assets/channel-logos/sports-star-sports-1.svg",
        stream_url: "https://cdn10.zohanayaan.com:1686/hls/star1in.m3u8?md5=_OOHBfSs4-F7nrHWdaOvRA&expires=1787160100",
        url: "https://cdn10.zohanayaan.com:1686/hls/star1in.m3u8?md5=_OOHBfSs4-F7nrHWdaOvRA&expires=1787160100",
        backupUrls: ["https://live20.bozztv.com/giatvplayout7/giatv-209592/tracks-v1a1/mono.ts.m3u8"],
        isHD: true
      },
      {
        id: "sports-star-sports-1-hindi",
        name: "Star Sports 1 Hindi",
        category: "Sports",
        categories: ["Sports", "Cricket", "India"],
        logo: "./assets/channel-logos/sports-star-sports-1-hindi.svg",
        stream_url: "https://cdn6.zohanayaan.com:1686/hls/starhindi.m3u8?md5=3uGoFkUteXHTq00tfl42UA&expires=1787160100",
        url: "https://cdn6.zohanayaan.com:1686/hls/starhindi.m3u8?md5=3uGoFkUteXHTq00tfl42UA&expires=1787160100",
        backupUrls: ["https://live20.bozztv.com/giatvplayout7/giatv-209592/tracks-v1a1/mono.ts.m3u8"],
        isHD: true
      },
      {
        id: "sports-sony-ten-cricket",
        name: "Sony Ten Cricket",
        category: "Sports",
        categories: ["Sports", "Cricket", "International"],
        logo: "./assets/channel-logos/sports-sony-ten-cricket.svg",
        stream_url: "https://bldcmprod-cdn.toffeelive.com/cdn/live/ten_cricket/playlist.m3u8",
        url: "https://bldcmprod-cdn.toffeelive.com/cdn/live/ten_cricket/playlist.m3u8",
        backupUrls: ["https://live20.bozztv.com/giatvplayout7/giatv-209592/tracks-v1a1/mono.ts.m3u8"],
        isHD: true
      },
      {
        id: "sports-sony-ten-1",
        name: "Sony Ten Sports 1 HD",
        category: "Sports",
        categories: ["Sports", "WWE", "Football", "Combat"],
        logo: "./assets/channel-logos/sports-sony-ten-1.svg",
        stream_url: "https://bldcmprod-cdn.toffeelive.com/cdn/live/sony_sports_1_hd/playlist.m3u8",
        url: "https://bldcmprod-cdn.toffeelive.com/cdn/live/sony_sports_1_hd/playlist.m3u8",
        backupUrls: ["https://live20.bozztv.com/giatvplayout7/giatv-209592/tracks-v1a1/mono.ts.m3u8"],
        isHD: true
      },
      {
        id: "sports-sony-ten-2",
        name: "Sony Ten Sports 2 HD",
        category: "Sports",
        categories: ["Sports", "Football", "Champions League", "UEFA"],
        logo: "./assets/channel-logos/sports-sony-ten-2.svg",
        stream_url: "https://bldcmprod-cdn.toffeelive.com/cdn/live/sony_sports_2_hd/playlist.m3u8",
        url: "https://bldcmprod-cdn.toffeelive.com/cdn/live/sony_sports_2_hd/playlist.m3u8",
        backupUrls: ["https://live20.bozztv.com/giatvplayout7/giatv-209592/tracks-v1a1/mono.ts.m3u8"],
        isHD: true
      },
      {
        id: "sports-sony-ten-5",
        name: "Sony Ten Sports 5 HD",
        category: "Sports",
        categories: ["Sports", "Cricket", "Football"],
        logo: "./assets/channel-logos/sports-sony-ten-5.svg",
        stream_url: "https://bldcmprod-cdn.toffeelive.com/cdn/live/sony_sports_5_hd/playlist.m3u8",
        url: "https://bldcmprod-cdn.toffeelive.com/cdn/live/sony_sports_5_hd/playlist.m3u8",
        backupUrls: ["https://live20.bozztv.com/giatvplayout7/giatv-209592/tracks-v1a1/mono.ts.m3u8"],
        isHD: true
      },
      {
        id: "sports-willow-hd",
        name: "Willow HD",
        category: "Sports",
        categories: ["Sports", "Cricket", "International", "USA"],
        logo: "./assets/channel-logos/sports-willow-hd.svg",
        stream_url: "https://cdn9.zohanayaan.com:1686/hls/willowusa.m3u8?md5=CYVJUG-GwQ16dfctgP2pOw&expires=1787160100",
        url: "https://cdn9.zohanayaan.com:1686/hls/willowusa.m3u8?md5=CYVJUG-GwQ16dfctgP2pOw&expires=1787160100",
        backupUrls: ["https://warm-caverns-48629-92fab798385f.herokuapp.com/https://d36r8jifhgsk5j.cloudfront.net/Willow_TV540p.m3u8"],
        isHD: true
      },
      {
        id: "sports-willow-hd-2",
        name: "Willow HD 2",
        category: "Sports",
        categories: ["Sports", "Cricket", "CPL"],
        logo: "./assets/channel-logos/sports-willow-hd-2.svg",
        stream_url: "https://cdn9.zohanayaan.com:1686/hls/willowextra.m3u8?md5=hqyptd61oG74sdoV7hBQ5Q&expires=1787160101",
        url: "https://cdn9.zohanayaan.com:1686/hls/willowextra.m3u8?md5=hqyptd61oG74sdoV7hBQ5Q&expires=1787160101",
        backupUrls: ["https://live20.bozztv.com/giatvplayout7/giatv-209592/tracks-v1a1/mono.ts.m3u8"],
        isHD: true
      },
      {
        id: "ch-ptv-sports",
        name: "PTV Sports HD",
        category: "Sports",
        categories: ["Sports", "Cricket", "Pakistan"],
        logo: "./assets/channel-logos/ch-ptv-sports.svg",
        stream_url: "https://cdn1.zohanayaan.com:1686/hls/ptvpk.m3u8?md5=r8px8GYKCr8Q05R23jrFEg&expires=1787160100",
        url: "https://cdn1.zohanayaan.com:1686/hls/ptvpk.m3u8?md5=r8px8GYKCr8Q05R23jrFEg&expires=1787160100",
        backupUrls: ["https://live20.bozztv.com/giatvplayout7/giatv-209592/tracks-v1a1/mono.ts.m3u8"],
        isHD: true
      },
      {
        id: "ch-ten-sports-pk",
        name: "Ten Sports Pakistan",
        category: "Sports",
        categories: ["Sports", "Cricket", "PSL"],
        logo: "./assets/channel-logos/ch-ten-sports-pk.svg",
        stream_url: "https://cdn3.zohanayaan.com:1686/hls/tenspk.m3u8?md5=CN2FaffVJgR6__z8ctOa0Q&expires=1787160101",
        url: "https://cdn3.zohanayaan.com:1686/hls/tenspk.m3u8?md5=CN2FaffVJgR6__z8ctOa0Q&expires=1787160101",
        backupUrls: ["https://live20.bozztv.com/giatvplayout7/giatv-209592/tracks-v1a1/mono.ts.m3u8"],
        isHD: true
      },
      {
        id: "ch-a-sports-hd",
        name: "A Sports HD",
        category: "Sports",
        categories: ["Sports", "Cricket", "Pakistan"],
        logo: "./assets/channel-logos/ch-a-sports-hd.svg",
        stream_url: "https://cdn8.zohanayaan.com:1686/hls/asportshd.m3u8?md5=IxS649coN83ERcq0m5uUrA&expires=1787160101",
        url: "https://cdn8.zohanayaan.com:1686/hls/asportshd.m3u8?md5=IxS649coN83ERcq0m5uUrA&expires=1787160101",
        backupUrls: ["https://playztv-apps.pages.dev/asports/index.m3u8"],
        isHD: true
      },
      {
        id: "sports-sky-sports-cricket",
        name: "Sky Sports Cricket",
        category: "Sports",
        categories: ["Sports", "Cricket", "UK", "Ashes"],
        logo: "./assets/channel-logos/sports-sky-sports-cricket.svg",
        stream_url: "https://cdn9.zohanayaan.com:1686/hls/skyscric.m3u8?md5=vKqnXIQMF2pTw-rdyHo_dQ&expires=1787160102",
        url: "https://cdn9.zohanayaan.com:1686/hls/skyscric.m3u8?md5=vKqnXIQMF2pTw-rdyHo_dQ&expires=1787160102",
        backupUrls: ["https://live20.bozztv.com/giatvplayout7/giatv-209592/tracks-v1a1/mono.ts.m3u8"],
        isHD: true
      },
      {
        id: "sports-supersport-premier",
        name: "SuperSport Premier League",
        category: "Sports",
        categories: ["Sports", "Football", "EPL", "Premier League"],
        logo: "./assets/channel-logos/sports-supersport-premier.svg",
        stream_url: "https://s3.itcnbd.live/channel/ea25a516d781cb1c.m3u8",
        url: "https://s3.itcnbd.live/channel/ea25a516d781cb1c.m3u8",
        backupUrls: ["https://live20.bozztv.com/giatvplayout7/giatv-209592/tracks-v1a1/mono.ts.m3u8"],
        isHD: true
      },
      {
        id: "sports-bein-sports-hd",
        name: "beIN Sports HD",
        category: "Sports",
        categories: ["Sports", "Football", "La Liga", "Champions League"],
        logo: "./assets/channel-logos/sports-bein-sports-hd.svg",
        stream_url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/6123/index.m3u8",
        url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/6123/index.m3u8",
        backupUrls: ["https://live20.bozztv.com/giatvplayout7/giatv-209592/tracks-v1a1/mono.ts.m3u8"],
        isHD: true
      },
      {
        id: "sports-wwe-network",
        name: "WWE Network Live",
        category: "Sports",
        categories: ["Sports", "WWE", "Combat", "Wrestling"],
        logo: "/assets/wwe-logos/wwe_official.svg",
        stream_url: "https://bldcmprod-cdn.toffeelive.com/cdn/live/sony_sports_1_hd/playlist.m3u8",
        url: "https://bldcmprod-cdn.toffeelive.com/cdn/live/sony_sports_1_hd/playlist.m3u8",
        backupUrls: ["https://live20.bozztv.com/giatvplayout7/giatv-209592/tracks-v1a1/mono.ts.m3u8"],
        isHD: true
      },
      {
        id: "sports-nba-tv",
        name: "NBA TV",
        category: "Sports",
        categories: ["Sports", "Basketball", "NBA"],
        logo: "./assets/channel-logos/sports-sky-sports-cricket.svg",
        stream_url: "https://live20.bozztv.com/giatvplayout7/giatv-209592/tracks-v1a1/mono.ts.m3u8",
        url: "https://live20.bozztv.com/giatvplayout7/giatv-209592/tracks-v1a1/mono.ts.m3u8",
        backupUrls: [],
        isHD: true
      },
      {
        id: "sports-sky-sports-f1",
        name: "Sky Sports F1",
        category: "Sports",
        categories: ["Sports", "Motorsport", "F1"],
        logo: "./assets/channel-logos/sports-sky-sports-cricket.svg",
        stream_url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/7342/index.m3u8",
        url: "http://6zirt9yx.otttv.pw/iptv/HEGN4VXXQQSYCA/7342/index.m3u8",
        backupUrls: ["http://fastshare1.com:8080//live/25711345/late8airline/384213.ts"],
        isHD: true
      },
      {
        id: "sports-tennis-channel",
        name: "Tennis Channel",
        category: "Sports",
        categories: ["Sports", "Tennis"],
        logo: "./assets/channel-logos/sports-bein-sports-hd.svg",
        stream_url: "https://live20.bozztv.com/giatvplayout7/giatv-209592/tracks-v1a1/mono.ts.m3u8",
        url: "https://live20.bozztv.com/giatvplayout7/giatv-209592/tracks-v1a1/mono.ts.m3u8",
        backupUrls: [],
        isHD: true
      },
      {
        id: "sports-espn-hd",
        name: "ESPN HD",
        category: "Sports",
        categories: ["Sports", "Football", "Basketball", "Tennis", "Motorsport"],
        logo: "./assets/channel-logos/sports-bein-sports-hd.svg",
        stream_url: "https://live20.bozztv.com/giatvplayout7/giatv-209592/tracks-v1a1/mono.ts.m3u8",
        url: "https://live20.bozztv.com/giatvplayout7/giatv-209592/tracks-v1a1/mono.ts.m3u8",
        backupUrls: [],
        isHD: true
      },
      {
        id: "sports-eurosport-hd",
        name: "Eurosport HD",
        category: "Sports",
        categories: ["Sports", "Tennis", "Motorsport", "Hockey", "Kabaddi"],
        logo: "./assets/channel-logos/sports-sony-ten-1.svg",
        stream_url: "https://bldcmprod-cdn.toffeelive.com/cdn/live/euro_sports_hd/playlist.m3u8",
        url: "https://bldcmprod-cdn.toffeelive.com/cdn/live/euro_sports_hd/playlist.m3u8",
        backupUrls: ["http://151.80.18.177:86/Eurosport_2_HD/index.m3u8"],
        isHD: true
      },
      {
        id: "sports-usa-network",
        name: "USA Network",
        category: "Sports",
        categories: ["Sports", "WWE", "Combat"],
        logo: "/assets/wwe-logos/wwe_official.svg",
        stream_url: "https://live20.bozztv.com/giatvplayout7/giatv-209592/tracks-v1a1/mono.ts.m3u8",
        url: "https://live20.bozztv.com/giatvplayout7/giatv-209592/tracks-v1a1/mono.ts.m3u8",
        backupUrls: [],
        isHD: true
      }
    ];
  }

  /**
   * Get all active authentic channels in Sports category
   */
  getAllSportsChannels() {
    let list = [];
    if (Array.isArray(this.channels) && this.channels.length > 0) {
      list = this.channels.filter(ch => {
        if (!ch) return false;

        const name = (ch.name || '').toLowerCase();
        const cat = (ch.category || '').toLowerCase();
        const categories = Array.isArray(ch.categories) ? ch.categories.map(c => String(c).toLowerCase()) : [];

        // STRICT NON-SPORTS EXCLUSION (Block pure entertainment, serials, drama, movies, news, kids, music, religious)
        // Allow sports-broadcasting channels even if general Bengali (GTV, Nagorik, Maasranga)
        const isGeneralNonSports = name.includes('sab') || name.includes('max') || name.includes('entertainment') || 
                            name.includes('aath') || name.includes('pal') || name.includes('yay') || 
                            name.includes('cinema') || name.includes('movies') || name.includes('music') || 
                            name.includes('news') || name.includes('cartoon') || name.includes('kids') ||
                            name.includes('somoy') || name.includes('jamuna') || name.includes('ekattor') || 
                            name.includes('channel 24') || name.includes('dbc') || name.includes('atn news') ||
                            name.includes('zee bangla') || name.includes('star jalsha') || name.includes('colors') ||
                            name.includes('star plus') || name.includes('sony tv') || name.includes('bangla vision') ||
                            name.includes('quran') || name.includes('sunnah') || name.includes('makkah') || name.includes('madinah');
        
        const isSportsBroadcaster = name.includes('gtv') || name.includes('gazi tv') || name.includes('nagorik') || 
                                    name.includes('maasranga') || name.includes('t sports') || name.includes('tsports');
        if (isGeneralNonSports && !isSportsBroadcaster) return false;

        const isSportsCat = cat === 'sports' || categories.includes('sports') || categories.includes('cricket') || 
                            categories.includes('football') || categories.includes('tennis') || categories.includes('motorsport') || 
                            categories.includes('wwe');
        const hasSportsKeywords = name.includes('sport') || 
                                  name.includes('cricket') || name.includes('football') || 
                                  name.includes('fifa') || name.includes('ten sports') || 
                                  name.includes('sony ten') || name.includes('sony six') || 
                                  name.includes('sony sports') || name.includes('star sports') || 
                                  name.includes('willow') || name.includes('ptv sports') || 
                                  name.includes('tsports') || name.includes('t sports') || 
                                  name.includes('bein') || name.includes('supersport') || 
                                  name.includes('eurosport') || name.includes('wwe') ||
                                  name.includes('sports18') || name.includes('fancode') ||
                                  name.includes('dazn') || name.includes('ziggo') ||
                                  name.includes('tnt sports') || name.includes('khel') ||
                                  name.includes('espn') || name.includes('nba') ||
                                  name.includes('tennis channel') || name.includes('sky sports') ||
                                  name.includes('f1') || name.includes('formula') ||
                                  name.includes('usa network') || isSportsBroadcaster;

        return isSportsCat || hasSportsKeywords;
      });
    }

    if (list.length < 5) {
      // Merge with default core sports channels to guarantee complete sports selection
      const defaults = this.getDefaultSportsChannels();
      const existingIds = new Set(list.map(c => (c.id || c.name || '').toLowerCase()));
      defaults.forEach(d => {
        if (!existingIds.has((d.id || '').toLowerCase()) && !existingIds.has((d.name || '').toLowerCase())) {
          list.push(d);
        }
      });
    }

    return list;
  }

  /**
   * Normalize broadcaster or TV Station string for robust matching
   * Strips HD, 4K, brackets, generic filler words, punctuation, etc.
   */
  normalizeBroadcasterName(name) {
    if (!name) return '';
    return String(name)
      .toLowerCase()
      // Remove bracketed text e.g. (UK), (India), [Live], (BST)
      .replace(/\([^\)]*\)/g, ' ')
      .replace(/\[[^\]]*\]/g, ' ')
      // Remove technical suffixes
      .replace(/\b(hd|fhd|uhd|4k|1080p|720p|stb|feed|mono)\b/gi, ' ')
      // Remove generic broadcast filler terms
      .replace(/\b(official|live|stream|television|network|channel|broadcast|station|tv)\b/gi, ' ')
      // Replace punctuation and symbols with space
      .replace(/[-_.:/\\,+|&]/g, ' ')
      // Collapse whitespace
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Comprehensive broadcaster and TV station aliases mapping to verified app channels
   */
  getBroadcasterAliases() {
    return {
      't sports': ['ch-t-sports-hd', 'ch-t-sports-server-2', 'sports-t-sports-1', 'ch-t-sports-bd'],
      'tsports': ['ch-t-sports-hd', 'ch-t-sports-server-2', 'sports-t-sports-1', 'ch-t-sports-bd'],
      'gazi tv': ['ch-gazi-tv'],
      'gtv': ['ch-gazi-tv'],
      'gazi television': ['ch-gazi-tv'],
      'gazi': ['ch-gazi-tv'],
      'maasranga': ['ch-maasranga-tv-hd'],
      'maasranga tv': ['ch-maasranga-tv-hd'],
      'maasranga tv hd': ['ch-maasranga-tv-hd'],
      'nagorik': ['ch-nagorik-tv'],
      'nagorik tv': ['ch-nagorik-tv'],
      'star sports 1 hindi': ['ch-star-sports-1-hindi'],
      'star sports hindi': ['ch-star-sports-1-hindi'],
      'ss1 hindi': ['ch-star-sports-1-hindi'],
      'star sports 1': ['ch-star-sports-1-hd', 'sports-star-sports-1'],
      'star sports 1 hd': ['ch-star-sports-1-hd', 'sports-star-sports-1'],
      'star sports one': ['ch-star-sports-1-hd', 'sports-star-sports-1'],
      'star sports': ['ch-star-sports-1-hd', 'sports-star-sports-1'],
      'star sport 1': ['ch-star-sports-1-hd', 'sports-star-sports-1'],
      'ss1': ['ch-star-sports-1-hd', 'sports-star-sports-1'],
      'star sports 2': ['jio-1984', 'jio-1985', 'jio-2852', 'jio-2853', 'jio-1998'],
      'star sports 2 hindi': ['jio-1984', 'jio-1985'],
      'star sports 2 hd': ['jio-1984'],
      'star sports khel': ['jio-1998'],
      'ss2': ['jio-1984', 'jio-1985'],
      'star sports select 1': ['ch-star-sports-select-1'],
      'star sports select': ['ch-star-sports-select-1'],
      'star select 1': ['ch-star-sports-select-1'],
      'select 1': ['ch-star-sports-select-1'],
      'ss select 1': ['ch-star-sports-select-1'],
      'hotstar': ['ch-star-sports-1-hd', 'ch-star-sports-1-hindi', 'ch-star-sports-select-1'],
      'disney+ hotstar': ['ch-star-sports-1-hd', 'ch-star-sports-1-hindi'],
      'disney hotstar': ['ch-star-sports-1-hd', 'ch-star-sports-1-hindi'],
      'willow': ['ch-willow-hd', 'ch-willow-hd-server-2'],
      'willow cricket': ['ch-willow-hd', 'ch-willow-hd-server-2'],
      'willow tv': ['ch-willow-hd', 'ch-willow-hd-server-2'],
      'willow hd': ['ch-willow-hd', 'ch-willow-hd-server-2'],
      'willow usa': ['ch-willow-hd', 'ch-willow-hd-server-2'],
      'willow xtra': ['ch-willow-hd', 'ch-willow-hd-server-2'],
      'willow extra': ['ch-willow-hd', 'ch-willow-hd-server-2'],
      'cricbuzz': ['ch-willow-hd', 'ch-star-sports-1-hd'],
      'fancode': ['ch-willow-hd', 'jio-162', 'ch-star-sports-1-hd'],
      'ptv sports': ['ch-ptv-sports-hd'],
      'ptv sport': ['ch-ptv-sports-hd'],
      'ptv': ['ch-ptv-sports-hd'],
      'a sports': ['ch-a-sports-hd'],
      'asports': ['ch-a-sports-hd'],
      'a sport': ['ch-a-sports-hd'],
      'ten sports': ['ch-ten-sports-pk'],
      'ten sports pakistan': ['ch-ten-sports-pk'],
      'ten sports pk': ['ch-ten-sports-pk'],
      'sony ten 1': ['jio-162', 'jio-3510', 'jio-514'],
      'sony sports ten 1': ['jio-162', 'jio-3510', 'jio-514'],
      'ten 1': ['jio-162', 'jio-3510', 'jio-514'],
      'ten sports 1': ['jio-162', 'jio-3510', 'jio-514'],
      'sony six': ['jio-162', 'jio-3510', 'jio-514'],
      'sony ten 2': ['jio-891', 'jio-3511', 'jio-523', 'ch-sony-sports-2-hd'],
      'sony sports ten 2': ['jio-891', 'jio-3511', 'jio-523', 'ch-sony-sports-2-hd'],
      'ten 2': ['jio-891', 'jio-3511', 'jio-523', 'ch-sony-sports-2-hd'],
      'ten sports 2': ['jio-891', 'jio-3511', 'jio-523', 'ch-sony-sports-2-hd'],
      'sony sports 2': ['jio-891', 'jio-3511', 'jio-523', 'ch-sony-sports-2-hd'],
      'sony ten 3': ['jio-524', 'jio-892', 'jio-3512'],
      'sony sports ten 3': ['jio-524', 'jio-892', 'jio-3512'],
      'ten 3': ['jio-524', 'jio-892', 'jio-3512'],
      'ten sports 3': ['jio-524', 'jio-892', 'jio-3512'],
      'sony ten 3 hindi': ['jio-524', 'jio-892', 'jio-3512'],
      'sony ten 5': ['jio-155', 'jio-3515', 'jio-525'],
      'sony sports ten 5': ['jio-155', 'jio-3515', 'jio-525'],
      'ten 5': ['jio-155', 'jio-3515', 'jio-525'],
      'ten sports 5': ['jio-155', 'jio-3515', 'jio-525'],
      'sony six hd': ['jio-155', 'jio-3515', 'jio-525'],
      'sony ten 4': ['jio-1774', 'jio-3514', 'jio-1775', 'jio-3513'],
      'sony sports ten 4': ['jio-1774', 'jio-3514'],
      'ten 4': ['jio-1774', 'jio-3514'],
      'jiocinema': ['jio-891', 'jio-162'],
      'jio cinema': ['jio-891', 'jio-162'],
      'sports18': ['jio-891', 'ch-star-sports-select-1'],
      'sports 18': ['jio-891', 'ch-star-sports-select-1'],
      'sports18 1': ['jio-891', 'ch-star-sports-select-1'],
      'supersport premier league': ['sports-supersport-premier'],
      'supersport premier': ['sports-supersport-premier'],
      'supersport epl': ['sports-supersport-premier'],
      'supersport football': ['sports-supersport-premier', 'ch-sony-sports-2-hd'],
      'supersport': ['sports-supersport-premier'],
      'supersport cricket': ['sports-sky-sports-cricket', 'ch-willow-hd', 'ch-star-sports-1-hd'],
      'supersport grandstand': ['sports-supersport-premier'],
      'supersport variety': ['sports-supersport-premier'],
      'supersport rugby': ['sports-supersport-premier'],
      'sky sports premier league': ['sports-supersport-premier', 'ch-star-sports-select-1'],
      'sky sports premier': ['sports-supersport-premier', 'ch-star-sports-select-1'],
      'sky premier league': ['sports-supersport-premier', 'ch-star-sports-select-1'],
      'sky sports football': ['sports-supersport-premier', 'ch-sony-sports-2-hd'],
      'sky sports main event': ['sports-supersport-premier', 'sports-sky-sports-cricket'],
      'sky sports main': ['sports-supersport-premier', 'sports-sky-sports-cricket'],
      'sky sports action': ['sports-sky-sports-f1', 'sports-supersport-premier'],
      'sky sports arena': ['sports-sky-sports-cricket', 'ch-tsn-1'],
      'sky sports cricket': ['sports-sky-sports-cricket'],
      'sky cricket': ['sports-sky-sports-cricket'],
      'sky sports f1': ['sports-sky-sports-f1'],
      'sky f1': ['sports-sky-sports-f1'],
      'sky sports racing': ['ch-sky-sports-racing'],
      'sky racing': ['ch-sky-sports-racing'],
      'tnt sports 1': ['ch-sony-sports-2-hd', 'jio-891'],
      'tnt sports 2': ['ch-sony-sports-2-hd', 'jio-891'],
      'tnt sports': ['ch-sony-sports-2-hd', 'jio-891'],
      'tnt 1': ['ch-sony-sports-2-hd', 'jio-891'],
      'tnt 2': ['ch-sony-sports-2-hd', 'jio-891'],
      'peacock': ['sports-supersport-premier', 'ch-star-sports-select-1'],
      'paramount': ['ch-sony-sports-2-hd', 'jio-891'],
      'paramount+': ['ch-sony-sports-2-hd', 'jio-891'],
      'optus sport': ['sports-supersport-premier', 'ch-star-sports-select-1'],
      'optus': ['sports-supersport-premier', 'ch-star-sports-select-1'],
      'prime video': ['ch-sony-sports-2-hd', 'sports-supersport-premier'],
      'amazon prime video': ['ch-sony-sports-2-hd', 'sports-supersport-premier'],
      'amazon prime': ['ch-sony-sports-2-hd', 'sports-supersport-premier'],
      'canal+': ['ch-sony-sports-2-hd', 'ch-bein-xtra'],
      'canal plus': ['ch-sony-sports-2-hd', 'ch-bein-xtra'],
      'viaplay': ['sports-supersport-premier', 'ch-dazn-1'],
      'stan sport': ['ch-sony-sports-2-hd', 'ch-dazn-1'],
      'dazn 1': ['ch-dazn-1'],
      'dazn 2': ['ch-dazn-2'],
      'dazn 4': ['ch-dazn-4'],
      'dazn 5': ['ch-dazn-5'],
      'dazn': ['ch-dazn-1', 'ch-dazn-2'],
      'eurosport 1': ['ch-eurosport-1'],
      'eurosport 2': ['ch-eurosport-2'],
      'eurosport': ['ch-eurosport-1', 'ch-eurosport-2', 'jio-875', 'jio-1294'],
      'euro sports': ['ch-eurosport-1', 'ch-eurosport-2', 'jio-875', 'jio-1294'],
      'eurosport hd': ['jio-875', 'ch-eurosport-1'],
      'ziggo sport 1': ['ch-ziggo-sport-1'],
      'ziggo sport 2': ['ch-ziggo-sport-2'],
      'ziggo sport 3': ['ch-ziggo-sport-3'],
      'ziggo sport': ['ch-ziggo-sport-1'],
      'ziggo 1': ['ch-ziggo-sport-1'],
      'ziggo': ['ch-ziggo-sport-1'],
      'tsn 1': ['ch-tsn-1'],
      'tsn 2': ['ch-tsn-2'],
      'tsn 3': ['ch-tsn-3'],
      'tsn': ['ch-tsn-1', 'ch-tsn-2', 'ch-tsn-3'],
      'bein xtra': ['ch-bein-xtra'],
      'bein sports xtra': ['ch-bein-xtra'],
      'bein sports': ['ch-bein-xtra'],
      'bein': ['ch-bein-xtra'],
      'dd sports': ['ch-dd-sports', 'jio-204'],
      'dd national': ['ch-dd-sports', 'jio-204'],
      'qaz sports': ['ch-qaz-sports-hd'],
      'qazsport': ['ch-qaz-sports-hd'],
      'mundial sports': ['ch-mundial-sports-hd'],
      'a spor': ['ch-a-spor'],
      'aspor': ['ch-a-spor'],
      'pk sports': ['ch-pk-sports-hd'],
      'fifa+': ['ch-ayna-019efa45-d8f0-7732-8263-6030073a34fe'],
      'fifa plus': ['ch-ayna-019efa45-d8f0-7732-8263-6030073a34fe'],
      'fifa': ['ch-ayna-019efa45-d8f0-7732-8263-6030073a34fe'],
      'wwe network': ['sports-wwe-network'],
      'wwe network live': ['sports-wwe-network'],
      'wwe': ['sports-wwe-network'],
      'nba tv': ['sports-nba-tv'],
      'nba': ['sports-nba-tv', 'ch-tsn-1'],
      'tennis channel': ['sports-tennis-channel'],
      'espn': ['sports-espn-hd'],
      'espn hd': ['sports-espn-hd'],
      'usa network': ['sports-usa-network'],
      'cricket gold': ['ch-cricket-gold'],
      'nfl network': ['ch-nfl-network'],
      'motor vision': ['ch-motor-vision'],
      'motorvision': ['ch-motor-vision'],
      'red bull tv': ['jio-2779'],
      'pickleball now': ['jio-3243'],
      'world chess': ['jio-3499'],
      'all women sports network': ['jio-3146'],
      'awsn': ['jio-3146']
    };
  }

  /**
   * Precise whole-word and token matching between broadcaster metadata and internal channel/alias names.
   * Strictly prevents substring false positives (e.g. 'TNT Sports' or 'Sports' will NEVER match 'T Sports').
   */
  isBroadcasterMatch(token, aliasOrName) {
    if (!token || !aliasOrName) return false;
    const t = this.normalizeBroadcasterName(token);
    const a = this.normalizeBroadcasterName(aliasOrName);
    if (!t || !a) return false;
    if (t === a) return true;

    const tWords = t.split(/\s+/).filter(Boolean);
    const aWords = a.split(/\s+/).filter(Boolean);
    if (tWords.length === 0 || aWords.length === 0) return false;

    // Never match if alias has more words than token (e.g. token "sports" matching alias "t sports")
    if (tWords.length < aWords.length && aWords.length > 1) return false;

    // Every word of the alias/channel must exist as an EXACT whole word in the token words
    for (const aw of aWords) {
      if (!tWords.includes(aw)) return false;
    }
    return true;
  }

  /**
   * Match authentic broadcaster tokens against available active sports channels
   * Strictly filters out any channels not actually existing in the app.
   */
  findMatchingChannelsForBroadcaster(rawBroadcaster, sportsChannels) {
    if (!rawBroadcaster || !Array.isArray(sportsChannels) || sportsChannels.length === 0) {
      return [];
    }

    const aliases = this.getBroadcasterAliases();
    // Split on delimiters (comma, semicolon, slash, pipe, 'and', '&')
    const tokens = String(rawBroadcaster)
      .split(/[,/|;+&]|\band\b|\bor\b/i)
      .map(t => t.trim())
      .filter(Boolean);

    const matchedChannels = [];
    const matchedIds = new Set();

    for (const token of tokens) {
      const normToken = this.normalizeBroadcasterName(token);
      if (!normToken || normToken.length < 2) continue;

      let foundForToken = null;

      // 1. Direct Alias Lookup with whole-word verification
      for (const [aliasKey, channelIds] of Object.entries(aliases)) {
        if (this.isBroadcasterMatch(token, aliasKey)) {
          for (const cid of channelIds) {
            const ch = sportsChannels.find(c => (c.id === cid || c.id === `ch-${cid}`) && c.active !== false);
            if (ch && (ch.stream_url || ch.url || ch.streamUrl)) {
              foundForToken = ch;
              break;
            }
          }
          if (foundForToken) break;
        }
      }

      // 2. Direct Channel Name Comparison with whole-word verification
      if (!foundForToken) {
        for (const ch of sportsChannels) {
          if (ch.active === false) continue;
          const streamUrl = ch.stream_url || ch.url || ch.streamUrl;
          if (!streamUrl) continue;

          if (this.isBroadcasterMatch(token, ch.name)) {
            foundForToken = ch;
            break;
          }
        }
      }

      if (foundForToken && !matchedIds.has(foundForToken.id)) {
        matchedIds.add(foundForToken.id);
        matchedChannels.push(foundForToken);
      }
    }

    return matchedChannels;
  }

  /**
   * Intelligently pull, rank and connect authentic Sports channels to any match event.
   * Strictly adheres to Master Instructions: Real Data Integrity, Strict Sport Separation,
   * Channel Priority & Selection rules, and no fake/random channel assignment.
   */
  matchLiveStream(event) {
    if (!event) return { hasStream: false, streams: [], broadcastChannels: [], broadcastingChannelDetails: [] };

    // Normalize sport name
    const rawSport = (event.sport || event.sportName || '').toLowerCase().trim();
    let sport = rawSport;
    if (sport.includes('cricket')) sport = 'cricket';
    else if (sport.includes('football') || sport.includes('soccer')) sport = 'football';
    else if (sport.includes('wwe') || sport.includes('wrestling')) sport = 'wwe';
    else if (sport.includes('tennis') || sport.includes('pickleball')) sport = 'tennis';
    else if (sport.includes('basket')) sport = 'basketball';
    else if (sport.includes('f1') || sport.includes('formula') || sport.includes('motor') || sport.includes('racing') || sport.includes('nascar') || sport.includes('motogp')) sport = 'motorsport';
    else if (sport.includes('badminton')) sport = 'badminton';
    else if (sport.includes('kabaddi') || sport.includes('pkl')) sport = 'kabaddi';
    else if (sport.includes('hockey') || sport.includes('nhl')) sport = 'hockey';
    else if (sport.includes('nfl') || sport.includes('american football')) sport = 'nfl';
    else if (sport.includes('rugby')) sport = 'rugby';
    else if (sport.includes('baseball') || sport.includes('mlb')) sport = 'baseball';
    else if (sport.includes('box') || sport.includes('mma') || sport.includes('ufc') || sport.includes('combat') || sport.includes('bellator') || sport.includes('pfl')) sport = 'combat';
    else if (sport.includes('chess')) sport = 'chess';
    else if (sport.includes('golf')) sport = 'golf';

    const tourn = (event.tournament || event.league || event.seriesName || '').toLowerCase();
    const t1 = (event.team1?.name || event.homeTeam?.name || '').toLowerCase();
    const t2 = (event.team2?.name || event.awayTeam?.name || '').toLowerCase();
    const country = (event.country || event.region || '').toLowerCase();

    const sportsChannels = this.getAllSportsChannels();

    // 0. Reliable Mapped Channel Check (Persistent Cache - Section 3 requirement)
    const mappedCh = this.getMappedChannel(event);
    if (mappedCh && mappedCh.active !== false) {
      const pUrl = mappedCh.stream_url || mappedCh.url || mappedCh.streamUrl;
      if (pUrl) {
        const bUrls = mappedCh.backupUrls || (mappedCh.backup_stream_url ? [mappedCh.backup_stream_url] : []);
        const streams = [
          {
            name: mappedCh.name,
            serverLabel: mappedCh.name,
            channelName: mappedCh.name,
            channelId: mappedCh.id,
            channelLogo: mappedCh.logo,
            url: pUrl,
            backupUrls: bUrls,
            backupUrl: bUrls[0] || pUrl,
            quality: '1080p FHD',
            isHD: mappedCh.isHD !== false,
            category: mappedCh.category || 'Sports'
          },
          ...bUrls.map((bUrl, bIdx) => ({
            name: `${mappedCh.name} (Server ${bIdx + 2} Backup)`,
            serverLabel: `Server ${bIdx + 2} Backup`,
            channelName: mappedCh.name,
            channelId: mappedCh.id,
            channelLogo: mappedCh.logo,
            url: bUrl,
            backupUrls: [],
            quality: '720p HD',
            isHD: mappedCh.isHD !== false,
            category: mappedCh.category || 'Sports'
          }))
        ];

        return {
          hasStream: true,
          streams: streams,
          broadcastChannels: [mappedCh.name],
          broadcastingChannelDetails: [{
            id: mappedCh.id,
            name: mappedCh.name,
            logo: mappedCh.logo,
            category: mappedCh.category || 'Sports',
            quality: '1080p FHD',
            streamUrl: pUrl,
            backupUrls: bUrls,
            serverIdx: 0
          }]
        };
      }
    }

    // 1. Broadcaster-First Auto Matching from real API TV Station / Broadcaster metadata
    const rawBroadcaster = event.broadcaster || event.broadcasters || event.strTVStation || event.tvStation || event.tv || event.broadcast || event.channelName || '';
    if (rawBroadcaster) {
      const matchedFromBroadcaster = this.findMatchingChannelsForBroadcaster(rawBroadcaster, sportsChannels);
      if (matchedFromBroadcaster.length > 0) {
        const primary = matchedFromBroadcaster[0];
        // Save to reliable mapping cache for instant future lookup
        this.saveEventChannelMap(event, primary.id);

        const streams = matchedFromBroadcaster.map((ch, idx) => {
          const pUrl = ch.stream_url || ch.url || ch.streamUrl;
          const bUrls = ch.backupUrls || (ch.backup_stream_url ? [ch.backup_stream_url] : []);
          return {
            name: ch.name,
            serverLabel: ch.name,
            channelName: ch.name,
            channelId: ch.id,
            channelLogo: ch.logo,
            url: pUrl,
            backupUrls: bUrls,
            backupUrl: bUrls[0] || pUrl,
            quality: idx === 0 ? '1080p FHD' : '720p HD',
            isHD: ch.isHD !== false,
            category: ch.category || 'Sports'
          };
        });

        return {
          hasStream: streams.length > 0,
          streams: streams,
          broadcastChannels: matchedFromBroadcaster.map(c => c.name),
          broadcastingChannelDetails: matchedFromBroadcaster.map((ch, idx) => ({
            id: ch.id,
            name: ch.name,
            logo: ch.logo,
            category: ch.category || 'Sports',
            quality: idx === 0 ? '1080p FHD' : '720p HD',
            streamUrl: ch.stream_url || ch.url || ch.streamUrl,
            backupUrls: ch.backupUrls || (ch.backup_stream_url ? [ch.backup_stream_url] : []),
            serverIdx: idx
          }))
        };
      }
    }

    // 2. If event already has an explicit channelId (Section 4 & Section 7 of Master Instructions)
    if (event.channelId) {
      const explicitCh = sportsChannels.find(c => c.id === event.channelId || c.id === `ch-${event.channelId}`);
      if (explicitCh && explicitCh.active !== false) {
        const pUrl = explicitCh.stream_url || explicitCh.url || explicitCh.streamUrl;
        if (pUrl) {
          const bUrls = explicitCh.backupUrls || (explicitCh.backup_stream_url ? [explicitCh.backup_stream_url] : []);
          const streams = [
            {
              name: explicitCh.name,
              serverLabel: explicitCh.name,
              channelName: explicitCh.name,
              channelId: explicitCh.id,
              channelLogo: explicitCh.logo,
              url: pUrl,
              backupUrls: bUrls,
              backupUrl: bUrls[0] || pUrl,
              quality: '1080p FHD',
              isHD: explicitCh.isHD !== false,
              category: explicitCh.category || 'Sports'
            },
            ...bUrls.map((bUrl, bIdx) => ({
              name: `${explicitCh.name} (Server ${bIdx + 2} Backup)`,
              serverLabel: `Server ${bIdx + 2} Backup`,
              channelName: explicitCh.name,
              channelId: explicitCh.id,
              channelLogo: explicitCh.logo,
              url: bUrl,
              backupUrls: [],
              quality: '720p HD',
              isHD: explicitCh.isHD !== false,
              category: explicitCh.category || 'Sports'
            }))
          ];

          return {
            hasStream: true,
            streams: streams,
            broadcastChannels: [explicitCh.name],
            broadcastingChannelDetails: [{
              id: explicitCh.id,
              name: explicitCh.name,
              logo: explicitCh.logo,
              category: explicitCh.category || 'Sports',
              quality: '1080p FHD',
              streamUrl: pUrl,
              backupUrls: bUrls,
              serverIdx: 0
            }]
          };
        }
      }
    }

    // 2. Direct custom streams already on event if present
    if (Array.isArray(event.streams) && event.streams.length > 0) {
      const validStreams = event.streams.filter(s => s && s.url && typeof s.url === 'string' && s.url.startsWith('http'));
      if (validStreams.length > 0) {
        return {
          hasStream: true,
          streams: validStreams,
          broadcastChannels: validStreams.map(s => s.channelName || s.name || 'Live Server'),
          broadcastingChannelDetails: validStreams.map((s, idx) => ({
            id: s.channelId || `stream-${idx}`,
            name: s.channelName || s.name || `Server ${idx + 1}`,
            logo: s.channelLogo || s.logo || './assets/category-logos/live-events-hd.svg',
            category: s.category || 'Sports',
            quality: s.quality || (idx === 0 ? '1080p FHD' : '720p HD'),
            streamUrl: s.url,
            serverIdx: idx
          }))
        };
      }
    }

    // 3. Rule-Based Intelligent Matching Engine with Broadcaster Auto-Connection (Section 6 & Section 7)
    if (sportsChannels.length > 0) {
      // Extract & Normalize Fixture Broadcasters from API
      const rawBroadcaster = event.broadcaster || event.broadcasters || event.strTVStation || event.tvStation || event.tv || event.broadcast || event.channelName || '';
      const broadcastersList = [];
      if (Array.isArray(rawBroadcaster)) {
        broadcastersList.push(...rawBroadcaster.map(b => String(b).trim().toLowerCase()).filter(Boolean));
      } else if (typeof rawBroadcaster === 'string' && rawBroadcaster.trim()) {
        rawBroadcaster.split(/[,/|;+&]|\band\b|\bor\b/i).forEach(b => {
          const cleaned = b.trim().toLowerCase();
          if (cleaned) broadcastersList.push(cleaned);
        });
      }
      if (Array.isArray(event.broadcastChannels)) {
        event.broadcastChannels.forEach(b => {
          const cleaned = String(b).trim().toLowerCase();
          if (cleaned && !broadcastersList.includes(cleaned)) broadcastersList.push(cleaned);
        });
      }

      const scoredChannels = sportsChannels.map(ch => {
        const name = (ch.name || '').toLowerCase();
        const chSports = Array.isArray(ch.sports) ? ch.sports.map(s => String(s).toLowerCase()) : [];
        const chCats = Array.isArray(ch.categories) ? ch.categories.map(c => String(c).toLowerCase()) : [];
        const pUrl = ch.stream_url || ch.url || ch.streamUrl;

        // Inactive or broken stream channels receive 0
        if (!pUrl || ch.active === false) {
          return { channel: ch, score: 0, hasExactBroadcaster: false };
        }

        let score = 0;
        let hasExactBroadcaster = false;
        let broadcasterBonus = 0;

        // Check against fixture broadcaster strings from API
        if (broadcastersList.length > 0) {
          for (let i = 0; i < broadcastersList.length; i++) {
            const bRaw = broadcastersList[i];

            if (name === bRaw || (ch.id && ch.id.toLowerCase() === bRaw)) {
              hasExactBroadcaster = true;
              broadcasterBonus = Math.max(broadcasterBonus, 160);
              break;
            } else if (this.isBroadcasterMatch(bRaw, name) || this.isBroadcasterMatch(bRaw, ch.id)) {
              hasExactBroadcaster = true;
              broadcasterBonus = Math.max(broadcasterBonus, 135);
              break;
            }
          }
        }

        // 🏏 1. CRICKET
        if (sport === 'cricket') {
          const isCricketChannel = chSports.includes('cricket') || chCats.includes('cricket') ||
            name.includes('t sports') || name.includes('tsports') ||
            name.includes('gtv') || name.includes('gazi tv') ||
            name.includes('nagorik') || name.includes('maasranga') ||
            name.includes('star sports') || name.includes('sony sports') ||
            name.includes('sony ten') || name.includes('sony six') ||
            name.includes('willow') || name.includes('ptv sports') ||
            name.includes('ten sports') || name.includes('a sports') ||
            name.includes('sky sports cricket') || name.includes('sky sports main') ||
            name.includes('fancode') || name.includes('astro cricket') ||
            name.includes('criclife') || name.includes('fox cricket') ||
            name.includes('supersport cricket') || name.includes('dd sports');

          // Strict prohibition: Non-cricket exclusive channels
          const isProhibited = name.includes('premier league') || name.includes('laliga') ||
            name.includes('f1') || name.includes('wwe') || name.includes('nhl') ||
            name.includes('nba') || (name.includes('football') && !name.includes('t sports'));

          if (isCricketChannel && !isProhibited) {
            score = 40; // Valid cricket base
            if (hasExactBroadcaster) score += broadcasterBonus;

            // A. Bangladesh matches / BPL / DPL
            const isBDMatch = t1.includes('bangladesh') || t2.includes('bangladesh') ||
              tourn.includes('bpl') || tourn.includes('bangladesh') ||
              tourn.includes('dhaka') || tourn.includes('sylhet') ||
              tourn.includes('chattogram') || tourn.includes('comilla') ||
              tourn.includes('rangpur') || tourn.includes('barishal') ||
              tourn.includes('khulna') || tourn.includes('fortune') ||
              tourn.includes('dpl') || country.includes('bangladesh');
            if (isBDMatch) {
              if (name.includes('t sports') || name.includes('tsports')) score += 40;
              if (name.includes('gtv') || name.includes('gazi tv')) score += 35;
              if (name.includes('nagorik')) score += 30;
              if (name.includes('maasranga')) score += 25;
              if (name.includes('star sports 1')) score += 15;
            }

            // B. India matches / IPL / Asia Cup / ICC Tournaments
            const isIndiaMatch = t1.includes('india') || t2.includes('india') ||
              tourn.includes('ipl') || tourn.includes('indian premier') ||
              tourn.includes('asia cup') || tourn.includes('icc') ||
              tourn.includes('world cup') || tourn.includes('champions trophy') ||
              t1.includes('mumbai indians') || t2.includes('mumbai indians') ||
              t1.includes('chennai') || t2.includes('chennai') ||
              t1.includes('kolkata') || t2.includes('kolkata') ||
              t1.includes('royal challengers') || t2.includes('royal challengers');
            if (isIndiaMatch) {
              if (name.includes('star sports 1') && !name.includes('hindi')) score += 38;
              if (name.includes('star sports 1 hindi')) score += 35;
              if (name.includes('star sports select 1')) score += 32;
              if (name.includes('star sports 2')) score += 30;
              if (name.includes('sony sports ten 1') || name.includes('sony ten 1')) score += 25;
            }

            // C. Pakistan matches / PSL
            const isPakMatch = t1.includes('pakistan') || t2.includes('pakistan') ||
              tourn.includes('psl') || tourn.includes('pakistan super') ||
              t1.includes('lahore') || t2.includes('lahore') ||
              t1.includes('karachi') || t2.includes('karachi') ||
              t1.includes('peshawar') || t2.includes('peshawar') ||
              t1.includes('islamabad') || t2.includes('islamabad') ||
              t1.includes('quetta') || t2.includes('quetta') ||
              t1.includes('multan') || t2.includes('multan');
            if (isPakMatch) {
              if (name.includes('ptv sports')) score += 38;
              if (name.includes('ten sports')) score += 35;
              if (name.includes('a sports')) score += 32;
              if (name.includes('sony sports ten 1') || name.includes('sony ten 1')) score += 20;
            }

            // D. Caribbean Premier League (CPL) / West Indies / USA / MLC
            const isCPLOrUSA = tourn.includes('cpl') || tourn.includes('caribbean') ||
              tourn.includes('mlc') || tourn.includes('major league cricket') ||
              t1.includes('west indies') || t2.includes('west indies') ||
              t1.includes('antigua') || t2.includes('antigua') ||
              t1.includes('barbados') || t2.includes('barbados') ||
              t1.includes('trinbago') || t2.includes('trinbago') ||
              t1.includes('guyana') || t2.includes('guyana') ||
              t1.includes('st lucia') || t2.includes('st lucia') ||
              t1.includes('st kitts') || t2.includes('st kitts');
            if (isCPLOrUSA) {
              if (name.includes('willow')) score += 38;
              if (name.includes('sky sports cricket')) score += 32;
              if (name.includes('star sports 1')) score += 25;
            }

            // E. England / The Ashes / English County / The Hundred / Vitality Blast
            const isUKMatch = tourn.includes('county') || tourn.includes('hundred') ||
              tourn.includes('vitality') || tourn.includes('t20 blast') ||
              tourn.includes('ashes') ||
              ((t1.includes('england') || t2.includes('england')) && (t1.includes('australia') || t2.includes('australia')));
            if (isUKMatch) {
              if (name.includes('sky sports cricket')) score += 38;
              if (name.includes('sky sports main')) score += 32;
              if (name.includes('sony sports ten 5') || name.includes('sony ten 5')) score += 28;
              if (name.includes('star sports select')) score += 22;
            }

            // F. Australia / Big Bash League (BBL) / WBBL / Sheffield Shield
            const isAusMatch = tourn.includes('bbl') || tourn.includes('big bash') ||
              tourn.includes('wbbl') || tourn.includes('sheffield') ||
              t1.includes('sixers') || t2.includes('sixers') ||
              t1.includes('scorchers') || t2.includes('scorchers') ||
              t1.includes('thunder') || t2.includes('thunder') ||
              t1.includes('heat') || t2.includes('heat') ||
              t1.includes('hurricanes') || t2.includes('hurricanes') ||
              t1.includes('stars') || t2.includes('stars') ||
              t1.includes('renegades') || t2.includes('renegades') ||
              t1.includes('strikers') || t2.includes('strikers');
            if (isAusMatch) {
              if (name.includes('sky sports cricket')) score += 38;
              if (name.includes('willow')) score += 35;
              if (name.includes('sony sports ten 5') || name.includes('sony ten 5')) score += 30;
              if (name.includes('sony sports ten 1') || name.includes('sony ten 1')) score += 22;
            }

            // G. South Africa SA20 / Sri Lanka LPL / NZ Super Smash / UAE ILT20 / T10
            const isOtherT20Leagues = tourn.includes('sa20') || tourn.includes('lpl') ||
              tourn.includes('lanka premier') || tourn.includes('super smash') ||
              tourn.includes('ilt20') || tourn.includes('international league t20') ||
              tourn.includes('t10') || tourn.includes('abu dhabi');
            if (isOtherT20Leagues) {
              if (name.includes('sony sports ten 5') || name.includes('sony ten 5')) score += 38;
              if (name.includes('willow')) score += 34;
              if (name.includes('star sports select')) score += 28;
              if (name.includes('sony sports ten 1') || name.includes('sony ten 1')) score += 25;
            }

            // General Priority adjustments
            if (ch.priority === 1) score += 5;
            if (ch.priority === 2) score += 3;
          }
        }

        // ⚽ 2. FOOTBALL
        else if (sport === 'football') {
          const isBDFootballMatch = tourn.includes('bpl') || country.includes('bangladesh') ||
            tourn.includes('bangladesh') || tourn.includes('federation cup') ||
            tourn.includes('independence cup') || tourn.includes('dhaka') ||
            t1.includes('bangladesh') || t2.includes('bangladesh') ||
            t1.includes('bashundhara') || t2.includes('bashundhara') ||
            t1.includes('abahani') || t2.includes('abahani') ||
            t1.includes('mohammedan') || t2.includes('mohammedan');

          const isFootballChannel = chSports.includes('football') || chCats.includes('football') ||
            name.includes('premier league') || name.includes('laliga') ||
            name.includes('football') || name.includes('super football') ||
            name.includes('sky sports premier') || name.includes('sky sports football') ||
            name.includes('supersport premier') || name.includes('supersport football') ||
            name.includes('sony sports ten 2') || name.includes('sony ten 2') ||
            (isBDFootballMatch && (name.includes('t sports') || name.includes('tsports') || name.includes('gtv'))) ||
            name.includes('tnt sports') || name.includes('tnt 1') || name.includes('tnt 2') ||
            name.includes('bein sports') || name.includes('bein xtra') || name.includes('dazn') ||
            name.includes('ziggo sport') || name.includes('go3 sport') ||
            name.includes('espn') || name.includes('cbs sports') ||
            name.includes('tudn') || name.includes('telemundo') ||
            name.includes('mundial') || name.includes('a spor') ||
            name.includes('fifa') || name.includes('tsn') || name.includes('eleven sports');

          // Strict prohibition: Cricket, WWE, F1, NHL exclusive channels
          const isProhibited = name.includes('willow') || name.includes('ptv sports') ||
            name.includes('criclife') || name.includes('astro cricket') ||
            name.includes('wwe network') || name.includes('nhl network') ||
            (name.includes('cricket') && !name.includes('t sports'));

          if (isFootballChannel && !isProhibited) {
            score = 40; // Valid football base
            if (hasExactBroadcaster) score += broadcasterBonus;

            // A. English Premier League (EPL) / FA Cup / Carabao Cup / Championship
            const isEPL = tourn.includes('premier league') || tourn.includes('epl') ||
              tourn.includes('fa cup') || tourn.includes('carabao') || tourn.includes('efl') ||
              tourn.includes('community shield') || tourn.includes('championship') ||
              t1.includes('arsenal') || t2.includes('arsenal') ||
              t1.includes('chelsea') || t2.includes('chelsea') ||
              t1.includes('liverpool') || t2.includes('liverpool') ||
              t1.includes('manchester') || t2.includes('manchester') ||
              t1.includes('tottenham') || t2.includes('tottenham') ||
              t1.includes('newcastle') || t2.includes('newcastle') ||
              t1.includes('aston villa') || t2.includes('aston villa') ||
              t1.includes('west ham') || t2.includes('west ham') ||
              t1.includes('brighton') || t2.includes('brighton');
            if (isEPL) {
              if (name.includes('supersport premier')) score += 40;
              if (name.includes('sky sports premier')) score += 38;
              if (name.includes('star sports select 1')) score += 35;
              if (name.includes('sky sports football') || name.includes('sky sports main')) score += 32;
              if (name.includes('sony sports ten 2') || name.includes('sony ten 2')) score += 28;
              if (name.includes('tnt sports 1') || name.includes('tnt 1')) score += 25;
            }

            // B. UEFA Champions League / Europa League / Conference League / Super Cup
            const isUCL = tourn.includes('champions league') || tourn.includes('ucl') ||
              tourn.includes('europa') || tourn.includes('conference league') || tourn.includes('uefa super cup');
            if (isUCL) {
              if (name.includes('sony sports ten 2') || name.includes('sony ten 2')) score += 40;
              if (name.includes('tnt sports 1') || name.includes('tnt 1')) score += 38;
              if (name.includes('tnt sports 2') || name.includes('tnt 2')) score += 35;
              if (name.includes('bein xtra') || name.includes('bein sports')) score += 32;
              if (name.includes('dazn 1') || name.includes('dazn 2')) score += 28;
              if (name.includes('ziggo sport')) score += 25;
            }

            // C. Spanish La Liga / Copa del Rey / Supercopa
            const isLaLiga = tourn.includes('la liga') || tourn.includes('laliga') ||
              tourn.includes('copa del rey') || tourn.includes('supercopa') ||
              t1.includes('real madrid') || t2.includes('real madrid') ||
              t1.includes('barcelona') || t2.includes('barcelona') ||
              t1.includes('atletico') || t2.includes('atletico') ||
              t1.includes('sevilla') || t2.includes('sevilla') ||
              t1.includes('girona') || t2.includes('girona');
            if (isLaLiga) {
              if (name.includes('dazn 1') || name.includes('dazn 2')) score += 40;
              if (name.includes('bein xtra') || name.includes('bein sports')) score += 36;
              if (name.includes('sony sports ten 2') || name.includes('sony ten 2')) score += 32;
              if (name.includes('ziggo sport 1') || name.includes('ziggo sport')) score += 30;
            }

            // D. Italian Serie A / German Bundesliga / French Ligue 1
            const isOtherTopEuro = tourn.includes('serie a') || tourn.includes('bundesliga') ||
              tourn.includes('ligue 1') || tourn.includes('coppa italia') || tourn.includes('dfb-pokal') ||
              t1.includes('juventus') || t2.includes('juventus') ||
              t1.includes('milan') || t2.includes('milan') ||
              t1.includes('inter') || t2.includes('inter') ||
              t1.includes('napoli') || t2.includes('napoli') ||
              t1.includes('roma') || t2.includes('roma') ||
              t1.includes('bayern') || t2.includes('bayern') ||
              t1.includes('dortmund') || t2.includes('dortmund') ||
              t1.includes('leverkusen') || t2.includes('leverkusen') ||
              t1.includes('paris') || t2.includes('paris') || t1.includes('psg') || t2.includes('psg');
            if (isOtherTopEuro) {
              if (name.includes('sony sports ten 2') || name.includes('sony ten 2')) score += 40;
              if (name.includes('bein xtra') || name.includes('bein sports')) score += 36;
              if (name.includes('dazn 1') || name.includes('dazn 2')) score += 32;
              if (name.includes('ziggo sport 1') || name.includes('ziggo sport')) score += 28;
            }

            // E. Major League Soccer (MLS) & Saudi Pro League & AFC Champions League
            const isMLSOrSPL = tourn.includes('mls') || tourn.includes('major league soccer') ||
              tourn.includes('leagues cup') || tourn.includes('saudi') || tourn.includes('spl') ||
              tourn.includes('afc champions') ||
              t1.includes('inter miami') || t2.includes('inter miami') ||
              t1.includes('al hilal') || t2.includes('al hilal') ||
              t1.includes('al nassr') || t2.includes('al nassr') ||
              t1.includes('al ittihad') || t2.includes('al ittihad');
            if (isMLSOrSPL) {
              if (name.includes('tsn 1') || name.includes('tsn 2')) score += 38;
              if (name.includes('sony sports ten 2') || name.includes('sony ten 2')) score += 35;
              if (name.includes('bein xtra') || name.includes('bein sports')) score += 32;
              if (name.includes('dazn 1')) score += 28;
            }

            // F. Bangladesh Football Matches & Tournaments (Strictly T Sports & GTV)
            if (isBDFootballMatch) {
              if (name.includes('t sports') || name.includes('tsports')) score += 40;
              if (name.includes('gtv') || name.includes('gazi tv')) score += 35;
            }

            // G. International / FIFA / World Cup / Euro / Copa America / Friendlies / Nations League
            const isIntlTournament = tourn.includes('world cup') || tourn.includes('euro') ||
              tourn.includes('copa america') || tourn.includes('friendly') ||
              tourn.includes('nations') || tourn.includes('afcon') || tourn.includes('fifa');
            if (isIntlTournament && !isBDFootballMatch) {
              if (name.includes('fifa') || name.includes('mundial')) score += 40;
              if (name.includes('sony sports ten 2') || name.includes('sony ten 2')) score += 36;
              if (name.includes('a spor') || name.includes('aspor')) score += 34;
              if (name.includes('bein xtra') || name.includes('bein sports')) score += 30;
            }

            // Priority bonus
            if (ch.priority === 1) score += 5;
            if (ch.priority === 2) score += 3;
          }
        }

        // 🤼 3. WWE & COMBAT SPORTS
        else if (sport === 'wwe' || sport === 'combat') {
          const isWWEChannel = chSports.includes('wwe') || chSports.includes('combat') ||
            chSports.includes('boxing') || chSports.includes('mma') || chSports.includes('ufc') ||
            name.includes('sony sports ten 1') || name.includes('sony ten 1') ||
            name.includes('sony sports ten 3') || name.includes('sony ten 3') ||
            name.includes('sony ten sports 1') || name.includes('wwe network') ||
            name.includes('usa network') || name.includes('tnt sports') ||
            name.includes('dazn 1') || name.includes('dazn 2') ||
            name.includes('dazn 4') || name.includes('dazn 5');

          const isProhibited = name.includes('willow') || name.includes('cricket') || name.includes('nhl') || name.includes('f1');

          if (isWWEChannel && !isProhibited) {
            score = 40;
            if (hasExactBroadcaster) score += broadcasterBonus;

            const isWWEEvent = tourn.includes('wwe') || tourn.includes('raw') || tourn.includes('smackdown') ||
              tourn.includes('nxt') || tourn.includes('wrestlemania') || tourn.includes('rumble') ||
              tourn.includes('summerslam') || tourn.includes('survivor series');
            if (isWWEEvent) {
              if (name.includes('sony sports ten 1') || name.includes('sony ten 1')) score += 40;
              if (name.includes('sony sports ten 3') || name.includes('sony ten 3')) score += 36;
              if (name.includes('usa network')) score += 34;
              if (name.includes('wwe network')) score += 32;
            } else {
              // Combat / UFC / Boxing / MMA
              if (name.includes('dazn 1') || name.includes('dazn 2') || name.includes('dazn 4')) score += 40;
              if (name.includes('sony sports ten 2') || name.includes('sony ten 2')) score += 32;
              if (name.includes('sony sports ten 1') || name.includes('sony ten 1')) score += 28;
            }
          }
        }

        // 🎾 4. TENNIS
        else if (sport === 'tennis') {
          const isTennisChannel = chSports.includes('tennis') ||
            name.includes('tennis channel') || name.includes('sky sports tennis') ||
            name.includes('eurosport 1') || name.includes('eurosport 2') || name.includes('eurosport') ||
            name.includes('sony sports ten 5') || name.includes('sony ten 5') ||
            name.includes('sony sports ten 2') || name.includes('sony ten 2') ||
            name.includes('pickleball');

          const isProhibited = name.includes('willow') || name.includes('cricket') || name.includes('wwe') || name.includes('nhl');

          if (isTennisChannel && !isProhibited) {
            score = 40;
            if (hasExactBroadcaster) score += broadcasterBonus;

            const isPickleball = tourn.includes('pickleball') || sport.includes('pickleball');
            if (isPickleball) {
              if (name.includes('pickleball')) score += 45;
              if (name.includes('eurosport')) score += 25;
            } else {
              // Grand Slams / ATP / WTA Tour
              if (name.includes('eurosport 1') || name.includes('eurosport hd')) score += 40;
              if (name.includes('eurosport 2')) score += 36;
              if (name.includes('sony sports ten 5') || name.includes('sony ten 5')) score += 34;
              if (name.includes('tennis channel')) score += 32;
              if (name.includes('sony sports ten 2')) score += 26;
            }
          }
        }

        // 🏎️ 5. MOTORSPORT / FORMULA 1 / MOTOGP
        else if (sport === 'motorsport') {
          const isMotorsportChannel = chSports.includes('motorsport') || chSports.includes('f1') ||
            name.includes('sky sports f1') || name.includes('f1 tv') ||
            name.includes('motor vision') || name.includes('eurosport') ||
            name.includes('sky sports racing') || name.includes('red bull tv') ||
            name.includes('sky sports action') || name.includes('dazn');

          const isProhibited = name.includes('willow') || name.includes('cricket') || name.includes('wwe') || name.includes('nhl');

          if (isMotorsportChannel && !isProhibited) {
            score = 40;
            if (hasExactBroadcaster) score += broadcasterBonus;

            const isF1 = tourn.includes('f1') || tourn.includes('formula') || tourn.includes('grand prix');
            if (isF1) {
              if (name.includes('sky sports f1') || name.includes('f1 tv')) score += 42;
              if (name.includes('motor vision')) score += 35;
              if (name.includes('eurosport')) score += 28;
              if (name.includes('red bull tv')) score += 25;
            } else {
              // MotoGP / NASCAR / Racing
              if (name.includes('motor vision')) score += 40;
              if (name.includes('eurosport 1') || name.includes('eurosport')) score += 34;
              if (name.includes('red bull tv')) score += 30;
              if (name.includes('sky sports racing')) score += 28;
            }
          }
        }

        // 🏀 6. BASKETBALL / NBA
        else if (sport === 'basketball') {
          const isBasketballChannel = chSports.includes('basketball') ||
            name.includes('nba tv') || name.includes('tsn') ||
            name.includes('espn') || name.includes('all women sports');

          const isProhibited = name.includes('willow') || name.includes('cricket') || name.includes('wwe') || name.includes('nhl');

          if (isBasketballChannel && !isProhibited) {
            score = 40;
            if (hasExactBroadcaster) score += broadcasterBonus;

            if (name.includes('nba tv')) score += 40;
            if (name.includes('tsn 1')) score += 35;
            if (name.includes('tsn 2') || name.includes('tsn 3')) score += 32;
            if (name.includes('espn')) score += 28;
            if (name.includes('all women sports')) score += 25;
          }
        }

        // 🏈 7. AMERICAN FOOTBALL / NFL
        else if (sport === 'nfl') {
          const isNFLChannel = name.includes('nfl network') || name.includes('tsn 1') ||
            name.includes('tsn 2') || name.includes('tsn 3') || name.includes('espn');

          const isProhibited = name.includes('willow') || name.includes('cricket') || name.includes('wwe');

          if (isNFLChannel && !isProhibited) {
            score = 40;
            if (hasExactBroadcaster) score += broadcasterBonus;

            if (name.includes('nfl network')) score += 42;
            if (name.includes('tsn 1')) score += 36;
            if (name.includes('tsn 2') || name.includes('tsn 3')) score += 32;
            if (name.includes('espn')) score += 28;
          }
        }

        // 🏑 8. HOCKEY / NHL
        else if (sport === 'hockey') {
          const isHockeyChannel = chSports.includes('hockey') ||
            name.includes('nhl network') || name.includes('tsn') ||
            name.includes('eurosport') || name.includes('sony sports ten 1');

          const isProhibited = name.includes('willow') || name.includes('cricket') || name.includes('wwe');

          if (isHockeyChannel && !isProhibited) {
            score = 40;
            if (hasExactBroadcaster) score += broadcasterBonus;

            if (name.includes('tsn 1') || name.includes('tsn 2')) score += 38;
            if (name.includes('eurosport 1') || name.includes('eurosport')) score += 32;
            if (name.includes('sony sports ten 1')) score += 25;
          }
        }

        // 🏉 9. RUGBY
        else if (sport === 'rugby') {
          const isRugbyChannel = chSports.includes('rugby') ||
            name.includes('supersport rugby') || name.includes('supersport premier');

          const isProhibited = name.includes('willow') || name.includes('cricket') || name.includes('wwe');

          if (isRugbyChannel && !isProhibited) {
            score = 40;
            if (hasExactBroadcaster) score += broadcasterBonus;

            if (name.includes('supersport rugby')) score += 40;
            if (name.includes('supersport premier')) score += 30;
          }
        }

        // 🤼‍♂️ 10. KABADDI
        else if (sport === 'kabaddi' || tourn.includes('pkl') || tourn.includes('pro kabaddi')) {
          const isKabaddiChannel = chSports.includes('kabaddi') ||
            name.includes('star sports 1') || name.includes('star sports 2') ||
            name.includes('star sports 1 hindi') || name.includes('star sports select') ||
            name.includes('star sports khel');

          const isProhibited = name.includes('willow') || name.includes('nhl') || name.includes('f1');

          if (isKabaddiChannel && !isProhibited) {
            score = 40;
            if (hasExactBroadcaster) score += broadcasterBonus;

            if (name.includes('star sports 1') && !name.includes('hindi')) score += 38;
            if (name.includes('star sports 1 hindi')) score += 35;
            if (name.includes('star sports 2')) score += 32;
            if (name.includes('star sports khel')) score += 32;
            if (name.includes('star sports select 1')) score += 30;
          }
        }

        // ⚾ 11. BASEBALL / MLB
        else if (sport === 'baseball') {
          const isBaseballChannel = chSports.includes('baseball') ||
            name.includes('tsn 1') || name.includes('tsn 2') || name.includes('espn');

          const isProhibited = name.includes('willow') || name.includes('cricket') || name.includes('wwe');

          if (isBaseballChannel && !isProhibited) {
            score = 40;
            if (hasExactBroadcaster) score += broadcasterBonus;

            if (name.includes('tsn 1')) score += 38;
            if (name.includes('tsn 2')) score += 32;
            if (name.includes('espn')) score += 28;
          }
        }

        // 🏸 12. BADMINTON
        else if (sport === 'badminton') {
          const isBadmintonChannel = name.includes('sony sports ten 5') || name.includes('sony ten 5') ||
            name.includes('sony sports ten 1') || name.includes('sony ten 1') ||
            name.includes('star sports 1') || name.includes('eurosport');

          const isProhibited = name.includes('willow') || name.includes('nhl') || name.includes('wwe') || name.includes('f1');

          if (isBadmintonChannel && !isProhibited) {
            score = 40;
            if (hasExactBroadcaster) score += broadcasterBonus;

            if (name.includes('sony sports ten 5') || name.includes('sony ten 5')) score += 38;
            if (name.includes('sony sports ten 1') || name.includes('sony ten 1')) score += 32;
            if (name.includes('star sports 1')) score += 30;
            if (name.includes('eurosport')) score += 20;
          }
        }

        // ♟️ 13. CHESS
        else if (sport === 'chess' || tourn.includes('chess') || tourn.includes('fide')) {
          if (name.includes('world chess') || ch.id === 'jio-3499') {
            score = 98;
          }
        }

        // Unrecognized Sport -> Only match if exact broadcaster matches
        else {
          if (hasExactBroadcaster) {
            score = 60 + broadcasterBonus;
          } else {
            score = 0;
          }
        }

        return { channel: ch, score, hasExactBroadcaster };
      });

      // Filter to genuine authentic matches only
      let validChannels = [];
      const isSportradar = (event.source === 'Sportradar' || event.source === 'Sportradar Live');

      if (broadcastersList.length > 0) {
        // Broadcaster metadata is present from API: strictly filter to channels that matched the broadcaster
        const exactMatches = scoredChannels.filter(item => item.hasExactBroadcaster && item.score >= 50);
        if (exactMatches.length > 0) {
          validChannels = exactMatches;
        } else {
          // Broadcaster from API did not match any of our channels.
          if (isSportradar) {
            // STRICT USER MANDATE: Never infer or fall back to guessed channels for Sportradar events
            return { hasStream: false, streams: [], broadcastChannels: [], broadcastingChannelDetails: [], message: 'Channel Unavailable' };
          }
          // Fall back to tournament rights holders, BUT never connect T Sports unless it's an authentic Bangladesh match!
          validChannels = scoredChannels.filter(item => {
            const chName = (item.channel.name || '').toLowerCase();
            const isTSports = chName.includes('t sports') || chName.includes('tsports');
            if (isTSports) {
              const isBDMatch = tourn.includes('bpl') || tourn.includes('bangladesh') ||
                tourn.includes('dhaka') || country.includes('bangladesh') ||
                t1.includes('bangladesh') || t2.includes('bangladesh');
              return isBDMatch && item.score >= 60;
            }
            return item.score >= 65;
          });
        }
      } else {
        // No broadcaster metadata in API
        if (isSportradar) {
          // STRICT USER MANDATE: Never fabricate or assume channels when Sportradar API provided no broadcast data
          return { hasStream: false, streams: [], broadcastChannels: [], broadcastingChannelDetails: [], message: 'Channel Unavailable' };
        }
        // General sport events: filter based on authentic sport & tournament rights
        validChannels = scoredChannels.filter(item => {
          const chName = (item.channel.name || '').toLowerCase();
          const isTSports = chName.includes('t sports') || chName.includes('tsports');
          if (isTSports) {
            const isBDMatch = tourn.includes('bpl') || tourn.includes('bangladesh') ||
              tourn.includes('dhaka') || country.includes('bangladesh') ||
              t1.includes('bangladesh') || t2.includes('bangladesh');
            return isBDMatch && item.score >= 60;
          }
          return item.score >= 65;
        });
      }

      // If no suitable channel exists in database, return no stream (Channel Not Available)
      if (validChannels.length === 0) {
        return { hasStream: false, streams: [], broadcastChannels: [], broadcastingChannelDetails: [], message: 'Channel Unavailable' };
      }

      // Sort channels from highest relevance to lowest (broadcaster match has absolute priority)
      validChannels.sort((a, b) => {
        if (b.hasExactBroadcaster !== a.hasExactBroadcaster) {
          return b.hasExactBroadcaster ? 1 : -1;
        }
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        const pA = a.channel.priority || 99;
        const pB = b.channel.priority || 99;
        return pA - pB;
      });

      // Extract top unique sports channels with distinct stream URLs (up to top 4)
      const seenUrls = new Set();
      const matchedChannels = [];
      for (const item of validChannels) {
        const u = item.channel.stream_url || item.channel.url || item.channel.streamUrl;
        if (u && !seenUrls.has(u)) {
          seenUrls.add(u);
          matchedChannels.push(item.channel);
          if (matchedChannels.length >= 4) break;
        }
      }

      if (matchedChannels.length === 0 && validChannels.length > 0) {
        const seenNames = new Set();
        for (const item of validChannels) {
          if (!seenNames.has(item.channel.name)) {
            seenNames.add(item.channel.name);
            matchedChannels.push(item.channel);
            if (matchedChannels.length >= 4) break;
          }
        }
      }

      if (matchedChannels.length === 0) {
        return { hasStream: false, streams: [], broadcastChannels: [], broadcastingChannelDetails: [] };
      }

      // Save top genuine match to reliable persistent cache
      if (matchedChannels.length > 0) {
        this.saveEventChannelMap(event, matchedChannels[0].id);
      }

      // Build rich Stream objects connected to each Sports channel
      const streams = matchedChannels.map((ch, idx) => {
        const pUrl = ch.stream_url || ch.url || ch.streamUrl;
        const bUrls = ch.backupUrls || (ch.backup_stream_url ? [ch.backup_stream_url] : []);
        const qualityTag = idx === 0 ? '1080p FHD' : (idx < 3 ? '720p HD' : 'HD Auto');

        return {
          name: ch.name,
          serverLabel: ch.name,
          channelName: ch.name,
          channelId: ch.id,
          channelLogo: ch.logo,
          url: pUrl,
          backupUrls: bUrls,
          backupUrl: bUrls[0] || pUrl,
          quality: qualityTag,
          isHD: ch.isHD !== false,
          category: ch.category || 'Sports'
        };
      });

      const broadcastNames = matchedChannels.map(c => c.name);

      const broadcastingChannelDetails = matchedChannels.map((ch, idx) => ({
        id: ch.id,
        name: ch.name,
        logo: ch.logo,
        category: ch.category || 'Sports',
        quality: idx === 0 ? '1080p FHD' : '720p HD',
        streamUrl: ch.stream_url || ch.url || ch.streamUrl,
        backupUrls: ch.backupUrls || (ch.backup_stream_url ? [ch.backup_stream_url] : []),
        serverIdx: idx
      }));

      return {
        hasStream: streams.length > 0,
        streams: streams,
        broadcastChannels: broadcastNames,
        broadcastingChannelDetails: broadcastingChannelDetails
      };
    }

    return { hasStream: false, streams: [], broadcastChannels: [], broadcastingChannelDetails: [] };
  }

  /**
   * Helper to check if a match is a Special / Featured Match
   */
  isSpecialMatch(ev) {
    if (!ev) return false;
    const sport = (ev.sport || ev.sportName || '').toLowerCase();
    
    // WWE, Boxing, MMA, Motorsport/F1, Tennis, Basketball, Baseball, Hockey, Kabaddi, Rugby are all Special Events
    if (['wwe', 'boxing', 'mma', 'motorsport', 'f1', 'tennis', 'basketball', 'baseball', 'hockey', 'kabaddi', 'rugby'].includes(sport)) {
      return true;
    }

    const league = (ev.league || ev.tournament || ev.seriesName || '').toLowerCase();
    const t1 = (ev.team1?.name || ev.homeTeam?.name || '').toLowerCase();
    const t2 = (ev.team2?.name || ev.awayTeam?.name || '').toLowerCase();
    const title = (ev.title || ev.name || '').toLowerCase();

    // Top Football Tournaments & Cups
    const topFootballLeagues = [
      'premier league', 'champions league', 'europa league', 'conference league',
      'la liga', 'laliga', 'serie a', 'bundesliga', 'ligue 1',
      'fa cup', 'copa del rey', 'coppa italia', 'dfb pokal', 'coupe de france',
      'saudi pro league', 'major league soccer', 'mls',
      'world cup', 'euro', 'copa america', 'uefa nations league', 'afcon', 'asian cup',
      'afc champions league', 'fifa club world cup', 'international friendly', 'olympics',
      'super cup', 'carabao cup', 'efl cup', 'championship', 'brasileiro', 'copa libertadores'
    ];

    // Top Football Clubs & National Teams
    const topFootballTeams = [
      'manchester city', 'manchester united', 'man city', 'man united', 'liverpool', 'arsenal',
      'chelsea', 'tottenham', 'newcastle', 'aston villa',
      'real madrid', 'barcelona', 'atletico madrid', 'bayern munich', 'borussia dortmund', 'bayer leverkusen',
      'paris saint germain', 'psg', 'inter', 'ac milan', 'milan', 'juventus', 'roma', 'napoli',
      'al nassr', 'al hilal', 'al ittihad', 'inter miami',
      'argentina', 'brazil', 'france', 'england', 'germany', 'spain', 'portugal', 'italy', 'netherlands', 'belgium'
    ];

    // Top Cricket Series & Teams (International tours, leagues, World Cups, ICC)
    const topCricketKeywords = [
      'tour of', 'international', 'tri-series', 'world cup', 'asia cup',
      'champions trophy', 'test', 'odi', 't20i', 'continental cup',
      'bangladesh', 'india', 'pakistan', 'australia', 'england', 'south africa',
      'sri lanka', 'west indies', 'new zealand', 'afghanistan', 'ireland', 'scotland',
      'netherlands', 'zimbabwe', 'namibia', 'nepal', 'usa', 'canada', 'uae', 'oman',
      'ipl', 'bpl', 'psl', 'big bash', 'cpl', 'hundred', 'vitality',
      'duleep', 'trophy', 'county championship', 'premier league'
    ];

    if (sport === 'football') {
      const matchLeague = topFootballLeagues.some(k => league.includes(k));
      const matchTeam = topFootballTeams.some(k => t1.includes(k) || t2.includes(k) || title.includes(k));
      if (matchLeague || matchTeam) return true;
    }

    if (sport === 'cricket') {
      const matchCricket = topCricketKeywords.some(k => 
        league.includes(k) || t1.includes(k) || t2.includes(k) || title.includes(k)
      );
      if (matchCricket) return true;
    }

    if (sport === 'wwe') {
      return true; // All curated WWE & AEW matches are high-priority marquee events
    }

    return ev.isHot === true || ev.isSpecial === true;
  }

  /**
   * Helper to check if a match is obscure/low-tier noise
   */
  isObscureNoiseMatch(ev) {
    if (!ev) return true;
    const sport = (ev.sport || '').toLowerCase();
    if (sport !== 'football') return false;

    const league = (ev.league || ev.tournament || '').toLowerCase();
    const noiseKeywords = [
      'u19', 'u20', 'u21', 'u18', 'u17', 'u16', 'u23', 'youth', 'juniors',
      'druha liga', '3. liga', '4. liga', '5. liga', 'regional division', 'amateur',
      'oberliga', 'tercera', 'division 3', 'division 4', 'reserve league', 'wpsl'
    ];

    return noiseKeywords.some(k => league.includes(k));
  }

  /**
   * Universal Date/Time Formatter in Asia/Dhaka (BST - GMT+6)
   */
  static formatEventTime(timestampOrIso, timezone = 'Asia/Dhaka') {
    if (!timestampOrIso) return 'Scheduled';
    let ts = null;
    if (typeof timestampOrIso === 'number') {
      ts = timestampOrIso < 10000000000 ? timestampOrIso * 1000 : timestampOrIso;
    } else if (typeof timestampOrIso === 'string') {
      let str = timestampOrIso.trim();
      if (/^\d+$/.test(str)) {
        const num = parseInt(str, 10);
        ts = num < 10000000000 ? num * 1000 : num;
      } else {
        // Fix strings without timezone indicator by treating as UTC
        if (!str.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(str)) {
          str = str.replace(' ', 'T') + 'Z';
        }
        ts = new Date(str).getTime();
      }
    }
    if (!ts || isNaN(ts)) return 'Scheduled';

    const dateObj = new Date(ts);
    const now = new Date();

    try {
      const timeFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
      const hourFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: 'numeric',
        hour12: false
      });
      const dateFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        weekday: 'short',
        day: 'numeric',
        month: 'short'
      });
      const dateLocalFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });

      const timeStr = timeFormatter.format(dateObj);
      const evHour = parseInt(hourFormatter.format(dateObj), 10);
      const nowHour = parseInt(hourFormatter.format(now), 10);

      const eventDateStr = dateLocalFormatter.format(dateObj);
      const todayDateStr = dateLocalFormatter.format(now);

      const [evY, evM, evD] = eventDateStr.split(/[-/]/).map(Number);
      const [nowY, nowM, nowD] = todayDateStr.split(/[-/]/).map(Number);
      const evDateOnly = new Date(Date.UTC(evY, evM - 1, evD));
      const nowDateOnly = new Date(Date.UTC(nowY, nowM - 1, nowD));
      const dayDiff = Math.round((evDateOnly.getTime() - nowDateOnly.getTime()) / (24 * 3600 * 1000));

      if (dayDiff === 0) {
        if (evHour < 6 && nowHour >= 6) {
          return `Last Night, ${timeStr} BST`;
        }
        return `Today, ${timeStr} BST`;
      } else if (dayDiff === 1) {
        if (evHour < 6) {
          return `Tonight, ${timeStr} BST`;
        }
        return `Tomorrow, ${timeStr} BST`;
      } else if (dayDiff === -1) {
        return `Yesterday, ${timeStr} BST`;
      } else {
        const dateStr = dateFormatter.format(dateObj);
        return `${dateStr}, ${timeStr} BST`;
      }
    } catch (e) {
      return dateObj.toLocaleTimeString('en-US', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: true }) + ' BST';
    }
  }

  /**
   * Format start time instance method
   */
  formatTime(timestampOrIso) {
    return SportsCoordinator.formatEventTime(timestampOrIso, window.CONFIG?.TIMEZONE || 'Asia/Dhaka');
  }

  /**
   * Robust detection for finished/concluded matches
   */
  static isEventFinished(ev) {
    if (!ev) return false;
    const status = String(ev.status || '').toLowerCase().trim();
    if (
      status === 'finished' ||
      status === 'ft' ||
      status === 'aet' ||
      status === 'ap' ||
      status === 'completed' ||
      status === 'ended' ||
      status === 'concluded' ||
      status === 'abandoned' ||
      status === 'postponed'
    ) {
      ev.status = 'finished';
      ev.statusLabel = 'FINISHED';
      if (!ev.timeOrTimer || ev.timeOrTimer.toLowerCase() === 'live') ev.timeOrTimer = 'FT';
      ev.isHot = false;
      return true;
    }

    const statusLabel = String(ev.statusLabel || '').toLowerCase().trim();
    if (statusLabel === 'finished' || statusLabel === 'ft' || statusLabel === 'ended' || statusLabel === 'completed') {
      ev.status = 'finished';
      ev.statusLabel = 'FINISHED';
      if (!ev.timeOrTimer || ev.timeOrTimer.toLowerCase() === 'live') ev.timeOrTimer = 'FT';
      ev.isHot = false;
      return true;
    }

    const timeOrTimer = String(ev.timeOrTimer || '').toLowerCase().trim();
    if (timeOrTimer === 'ft' || timeOrTimer === 'aet' || timeOrTimer === 'ap' || timeOrTimer === 'finished' || timeOrTimer === 'full time' || timeOrTimer === 'ended') {
      ev.status = 'finished';
      ev.statusLabel = 'FINISHED';
      ev.isHot = false;
      return true;
    }

    const text = (
      String(ev.statusText || '') + ' ' +
      String(ev.matchDesc || '') + ' ' +
      String(ev.subText || '') + ' ' +
      String(ev.result || '') + ' ' +
      String(ev.time || '')
    ).toLowerCase();

    if (/(^|\b)(won by|won the|match won|match tied|match drawn|match ended|no result|abandoned|concluded|completed|full time|final score|winner)(\b|$)/i.test(text)) {
      ev.status = 'finished';
      ev.statusLabel = 'FINISHED';
      if (!ev.timeOrTimer || ev.timeOrTimer.toLowerCase() === 'live') ev.timeOrTimer = 'FT';
      ev.isHot = false;
      return true;
    }

    // Time-based automatic finish detection
    let ts = ev.timestamp;
    if (typeof ts === 'string') {
      const parsed = Date.parse(ts);
      if (!isNaN(parsed)) ts = parsed;
    }
    if (!ts && ev.startTime) {
      let s = String(ev.startTime).trim();
      if (!s.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(s)) s = s.replace(' ', 'T') + 'Z';
      const parsed = Date.parse(s);
      if (!isNaN(parsed)) ts = parsed;
    }

    if (ts && !isNaN(ts)) {
      const now = Date.now();
      const numTs = Number(ts) < 10000000000 ? Number(ts) * 1000 : Number(ts);
      const elapsed = now - numTs;
      const sp = String(ev.sport || ev.sportName || '').toLowerCase();

      if (elapsed > 0) {
        if ((sp === 'football' || sp === 'soccer') && elapsed > (135 * 60 * 1000)) { // 2h 15m
          ev.status = 'finished';
          ev.statusLabel = 'FINISHED';
          if (!ev.timeOrTimer || ev.timeOrTimer.toLowerCase() === 'live') ev.timeOrTimer = 'FT';
          ev.isHot = false;
          return true;
        }
        if (sp === 'cricket') {
          const fmt = String(ev.matchFormat || ev.matchType || ev.title || '').toUpperCase();
          if (fmt.includes('T20') && elapsed > (4.5 * 3600 * 1000)) { // 4.5 hours
            ev.status = 'finished';
            ev.statusLabel = 'FINISHED';
            if (!ev.timeOrTimer || ev.timeOrTimer.toLowerCase() === 'live') ev.timeOrTimer = 'FT';
            ev.isHot = false;
            return true;
          }
          if (fmt.includes('ODI') && elapsed > (9 * 3600 * 1000)) { // 9 hours
            ev.status = 'finished';
            ev.statusLabel = 'FINISHED';
            if (!ev.timeOrTimer || ev.timeOrTimer.toLowerCase() === 'live') ev.timeOrTimer = 'FT';
            ev.isHot = false;
            return true;
          }
          if (fmt.includes('TEST') && elapsed > (5 * 24 * 3600 * 1000)) { // 5 days
            ev.status = 'finished';
            ev.statusLabel = 'FINISHED';
            if (!ev.timeOrTimer || ev.timeOrTimer.toLowerCase() === 'live') ev.timeOrTimer = 'FT';
            ev.isHot = false;
            return true;
          }
          if (elapsed > (6 * 3600 * 1000)) {
            ev.status = 'finished';
            ev.statusLabel = 'FINISHED';
            if (!ev.timeOrTimer || ev.timeOrTimer.toLowerCase() === 'live') ev.timeOrTimer = 'FT';
            ev.isHot = false;
            return true;
          }
        }
        if ((sp === 'tennis' || sp === 'basketball') && elapsed > (4 * 3600 * 1000)) {
          ev.status = 'finished';
          ev.statusLabel = 'FINISHED';
          if (!ev.timeOrTimer || ev.timeOrTimer.toLowerCase() === 'live') ev.timeOrTimer = 'FT';
          ev.isHot = false;
          return true;
        }
        if (elapsed > (14 * 3600 * 1000)) { // Over 14 hours ago
          ev.status = 'finished';
          ev.statusLabel = 'FINISHED';
          if (!ev.timeOrTimer || ev.timeOrTimer.toLowerCase() === 'live') ev.timeOrTimer = 'FT';
          ev.isHot = false;
          return true;
        }
      }
    }

    return false;
  }

  isEventFinished(ev) {
    return SportsCoordinator.isEventFinished(ev);
  }

  /**
   * Deduplicate, filter upcoming window, prioritize special matches, and curate finished matches
   */
  curateEvents(rawEvents) {
    const now = Date.now();
    const tz = window.CONFIG?.TIMEZONE || 'Asia/Dhaka';
    // Maximum 14 days ahead for cricket/special matches, 3 days for general football
    const maxCricketUpcomingTime = now + (14 * 24 * 60 * 60 * 1000);
    const maxFootballUpcomingTime = now + (3 * 24 * 60 * 60 * 1000);
    const minLiveTime = now - (6 * 60 * 60 * 1000);

    const liveList = [];
    const upcomingList = [];
    const finishedList = [];

    rawEvents.forEach(ev => {
      if (!ev || !ev.id) return;
      
      // Ensure proper timestamp parsing and format matchTime in Asia/Dhaka BST
      if (ev.timestamp && ev.timestamp < 10000000000) {
        ev.timestamp *= 1000;
      } else if (!ev.timestamp && ev.startTime) {
        let s = String(ev.startTime).trim();
        if (!s.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(s)) s = s.replace(' ', 'T') + 'Z';
        ev.timestamp = new Date(s).getTime();
      }

      if (ev.timestamp && !isNaN(ev.timestamp)) {
        ev.matchTime = SportsCoordinator.formatEventTime(ev.timestamp, tz);
        try {
          ev.date = new Intl.DateTimeFormat('en-CA', {
            timeZone: tz,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          }).format(new Date(ev.timestamp));
        } catch (e) {}
      }

      // Check if finished via helper
      const isFin = this.isEventFinished(ev);
      if (isFin) {
        ev.status = 'finished';
        ev.statusLabel = 'FINISHED';
        if (!ev.timeOrTimer || ev.timeOrTimer.toLowerCase() === 'live') {
          ev.timeOrTimer = 'FT';
        }
      }

      const status = (ev.status || 'upcoming').toLowerCase();
      const sport = (ev.sport || '').toLowerCase();
      const isSpecial = this.isSpecialMatch(ev);
      ev.isSpecial = isSpecial;
      if (isSpecial) {
        ev.isHot = true;
      }

      const isNoise = this.isObscureNoiseMatch(ev);

      if (isFin || status === 'finished') {
        // Collect finished candidates
        finishedList.push(ev);
      } else if (status === 'live') {
        // Keep special live matches and top quality live matches, skip low-tier noise
        if (!isNoise || isSpecial) {
          liveList.push(ev);
        }
      } else if (status === 'upcoming') {
        const matchTime = ev.timestamp || now;
        const maxTime = (sport === 'cricket' || isSpecial) ? maxCricketUpcomingTime : maxFootballUpcomingTime;
        if (matchTime >= minLiveTime && (matchTime <= maxTime || isSpecial)) {
          // If special or not obscure noise, include it
          if (isSpecial || !isNoise) {
            upcomingList.push(ev);
          }
        }
      }
    });

    // 1. Sort Live: Special matches first
    liveList.sort((a, b) => {
      const spA = a.isSpecial ? 1 : 0;
      const spB = b.isSpecial ? 1 : 0;
      return spB - spA;
    });

    // 2. Sort Upcoming: Special first if same time, chronological
    upcomingList.sort((a, b) => {
      const spA = a.isSpecial ? 1 : 0;
      const spB = b.isSpecial ? 1 : 0;
      if (spB !== spA) return spB - spA;
      return (a.timestamp || 0) - (b.timestamp || 0);
    });

    // 3. Finished Matches: Keep full pool of concluded games so Finished tab works seamlessly
    finishedList.sort((a, b) => {
      const spA = a.isSpecial ? 1 : 0;
      const spB = b.isSpecial ? 1 : 0;
      if (spB !== spA) return spB - spA;
      return (b.timestamp || 0) - (a.timestamp || 0);
    });
    const curatedFinished = finishedList.slice(0, 50);

    // Combine: Live (top quality) -> Upcoming -> Finished (placed at the bottom per Rule 8)
    const combined = [...liveList, ...upcomingList, ...curatedFinished];

    // Ensure all curated events have streams and sports channels attached
    combined.forEach(ev => {
      if (!ev.broadcastingChannelDetails || ev.broadcastingChannelDetails.length === 0 || !ev.streams || ev.streams.length === 0) {
        const streamInfo = this.matchLiveStream(ev);
        if (streamInfo && streamInfo.hasStream) {
          ev.streams = streamInfo.streams;
          ev.broadcastChannels = streamInfo.broadcastChannels;
          ev.broadcastingChannelDetails = streamInfo.broadcastingChannelDetails;
        }
      }
    });

    return combined;
  }
  async fetchAllEvents(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && (now - this.lastFetchTime < this.fetchTtl) && this.events.length > 0) {
      return this.events;
    }

    if (this.inFlightFetch) {
      return this.inFlightFetch;
    }

    this.inFlightFetch = (async () => {
      console.log('[SportsCoordinator] Fetching real sports events...');
      const sofascoreEngine = window.sofascoreEngine;
      const cricketEngine = window.cricketEngine;
      const thesportsdbEngine = window.thesportsdbEngine;
      const wweEngine = window.wweEngine;

      const fetches = [
        sofascoreEngine ? sofascoreEngine.getAllMatches(forceRefresh) : Promise.resolve({ configured: false, events: [] }),
        cricketEngine ? cricketEngine.getAllMatches(forceRefresh) : Promise.resolve({ configured: false, events: [] }),
        thesportsdbEngine ? thesportsdbEngine.getAllMatches(forceRefresh) : Promise.resolve({ configured: false, events: [] }),
        wweEngine ? wweEngine.getAllEvents(forceRefresh) : Promise.resolve({ configured: false, events: [] })
      ];

      const results = await Promise.allSettled(fetches);

      const ssRes = results[0].status === 'fulfilled' ? results[0].value : { configured: false, error: 'network_error', message: 'SofaScore load failed', events: [] };
      const crRes = results[1].status === 'fulfilled' ? results[1].value : { configured: false, error: 'network_error', message: 'Cricket load failed', events: [] };
      const tsdbRes = (results[2] && results[2].status === 'fulfilled') ? results[2].value : { configured: false, events: [] };
      const wweRes = (results[3] && results[3].status === 'fulfilled') ? results[3].value : { configured: false, error: 'not_configured', message: 'WWE not configured', events: [] };

      // Record error states
      this.errors.sofascore = ssRes.error ? { error: ssRes.error, message: ssRes.message } : null;
      this.errors.cricket = crRes.error ? { error: crRes.error, message: crRes.message } : null;
      this.errors.wwe = (wweRes.error && wweRes.error !== 'not_configured') ? { error: wweRes.error, message: wweRes.message } : null;

      const ssEvents = Array.isArray(ssRes.events) ? ssRes.events : [];
      const crEvents = Array.isArray(crRes.events) ? crRes.events : [];
      const tsdbEvents = Array.isArray(tsdbRes.events) ? tsdbRes.events : [];
      const wweEvents = Array.isArray(wweRes.events) ? wweRes.events : [];

      // Update status reports
      this.statusReports.sofascore = {
        configured: ssRes.configured !== false,
        error: ssRes.error || null,
        message: ssRes.message || '',
        live: ssEvents.filter(e => e.status === 'live').length,
        upcoming: ssEvents.filter(e => e.status === 'upcoming').length,
        finished: ssEvents.filter(e => e.status === 'finished').length,
        total: ssEvents.length
      };

      this.statusReports.cricket = {
        configured: crRes.configured !== false,
        error: crRes.error || null,
        message: crRes.message || '',
        live: crEvents.filter(e => e.status === 'live').length,
        upcoming: crEvents.filter(e => e.status === 'upcoming').length,
        finished: crEvents.filter(e => e.status === 'finished').length,
        total: crEvents.length
      };

      this.statusReports.thesportsdb = {
        configured: tsdbRes.configured !== false,
        error: tsdbRes.error || null,
        message: tsdbRes.message || '',
        live: tsdbEvents.filter(e => e.status === 'live').length,
        upcoming: tsdbEvents.filter(e => e.status === 'upcoming').length,
        finished: tsdbEvents.filter(e => e.status === 'finished').length,
        total: tsdbEvents.length
      };

      this.statusReports.wwe = {
        configured: wweRes.configured === true,
        error: wweRes.error || null,
        message: wweRes.message || '',
        live: wweEvents.filter(e => e.status === 'live').length,
        upcoming: wweEvents.filter(e => e.status === 'upcoming').length,
        finished: wweEvents.filter(e => e.status === 'finished').length,
        total: wweEvents.length
      };

      // Deduplicate and merge events
      const eventMap = new Map();

      const addList = (list) => {
        list.forEach(ev => {
          if (!ev || !ev.id || eventMap.has(ev.id)) return;

          // Reject corrupt, placeholder or mock events
          const id = String(ev.id || '');
          if (id.startsWith('cricket-upcoming-') || id.startsWith('cricket-live-') || id.startsWith('football-live-') || id.startsWith('dummy-') || id.startsWith('mock-') || id.startsWith('sample-')) {
            return;
          }

          const t1 = (ev.team1?.name || ev.homeTeam?.name || '').trim().toLowerCase();
          const t2 = (ev.team2?.name || ev.awayTeam?.name || '').trim().toLowerCase();
          if ((t1 === 'home team' && t2 === 'away team') || (t1 === 'home' && t2 === 'away') || (!t1 && !t2)) {
            return;
          }

          const sp = (ev.sport || '').toLowerCase();
          // WWE Tab strictly accepts authentic WWE and AEW fixtures
          if (sp === 'wwe') {
            const text = `${ev.title || ''} ${ev.league || ''} ${ev.tournament || ''} ${t1} ${t2}`.toLowerCase();
            const isWrestling = text.includes('wwe') || text.includes('raw') || text.includes('smackdown') || text.includes('nxt') || text.includes('aew') || text.includes('ple') || text.includes('wrestle');
            if (!isWrestling) return;
          }

          // Attach stream match
          const streamInfo = this.matchLiveStream(ev);
          if (streamInfo.hasStream) {
            ev.streams = streamInfo.streams;
            ev.broadcastChannels = streamInfo.broadcastChannels;
            ev.broadcastingChannelDetails = streamInfo.broadcastingChannelDetails;
            ev.hasStream = true;
            ev.channelId = streamInfo.streams[0]?.channelId || ev.channelId;
            if (!ev.broadcaster && streamInfo.streams[0]?.channelName && ev.source !== 'Sportradar' && ev.source !== 'Sportradar Live') {
              ev.broadcaster = streamInfo.streams[0].channelName;
            }
          } else {
            ev.streams = [];
            ev.broadcastChannels = [];
            ev.broadcastingChannelDetails = [];
            ev.hasStream = false;
          }
          eventMap.set(ev.id, ev);
        });
      };

      addList(ssEvents);
      addList(crEvents);
      addList(tsdbEvents);
      addList(wweEvents);

      // STRICT RULE: Only authentic events from sports APIs are accepted. Never fabricate or fall back to dummy/mock data.

      const rawMerged = Array.from(eventMap.values());

      // Apply strict Smart Curation (Next 3 days only, Special Matches, max 2-3 finished)
      const curated = this.curateEvents(rawMerged);

      if (curated.length > 0) {
        this.saveLocalCache(curated, Date.now());
      } else {
        this.events = curated;
      }

      // Update status reports based on curated list
      const getSportStats = (sp) => {
        const spList = curated.filter(e => (e.sport || '').toLowerCase() === sp);
        return {
          live: spList.filter(e => e.status === 'live').length,
          upcoming: spList.filter(e => e.status === 'upcoming').length,
          finished: spList.filter(e => e.status === 'finished').length,
          total: spList.length
        };
      };

      const fbStats = getSportStats('football');
      this.statusReports.football = {
        ...this.statusReports.football,
        ...fbStats
      };

      const crStats = getSportStats('cricket');
      this.statusReports.cricket = {
        ...this.statusReports.cricket,
        ...crStats
      };

      const wweStats = getSportStats('wwe');
      this.statusReports.wwe = {
        ...this.statusReports.wwe,
        ...wweStats
      };

      this.inFlightFetch = null;
      console.log(`[SportsCoordinator] Curated ${curated.length} high-quality events (Live: ${curated.filter(e => e.status === 'live').length}, Upcoming: ${curated.filter(e => e.status === 'upcoming').length}, Finished: ${curated.filter(e => e.status === 'finished').length})`);
      return this.events;
    })();

    return this.inFlightFetch;
  }

  /**
   * Check if an event is today in Bangladesh timezone (Asia/Dhaka BST)
   */
  isEventToday(ev) {
    if (!ev) return false;
    const status = (ev.status || '').toLowerCase();
    if (status === 'live') return true;

    const tz = window.CONFIG?.TIMEZONE || 'Asia/Dhaka';
    const now = new Date();

    let todayLocalStr = '';
    let nowHour = 12;
    try {
      todayLocalStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
      nowHour = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(now), 10);
    } catch (e) {
      todayLocalStr = now.toISOString().split('T')[0];
    }

    if (ev.timestamp && !isNaN(ev.timestamp)) {
      const ts = ev.timestamp < 10000000000 ? ev.timestamp * 1000 : ev.timestamp;
      const evDate = new Date(ts);
      let evLocalStr = '';
      let evHour = 12;
      try {
        evLocalStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(evDate);
        evHour = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(evDate), 10);
      } catch (e) {
        evLocalStr = evDate.toISOString().split('T')[0];
      }

      // 1. Same calendar day in Bangladesh (Asia/Dhaka)
      if (evLocalStr === todayLocalStr) return true;

      // 2. Early morning matches (00:00 to 05:59) are part of tonight's sports night in Bangladesh
      const [evY, evM, evD] = evLocalStr.split(/[-/]/).map(Number);
      const [nowY, nowM, nowD] = todayLocalStr.split(/[-/]/).map(Number);
      const evDateOnly = new Date(Date.UTC(evY, evM - 1, evD));
      const nowDateOnly = new Date(Date.UTC(nowY, nowM - 1, nowD));
      const dayDiff = Math.round((evDateOnly.getTime() - nowDateOnly.getTime()) / (24 * 3600 * 1000));

      if (dayDiff === 1 && evHour < 6) {
        return true;
      }

      // 3. If currently early morning (00:00 to 05:59) and event was last night
      if (nowHour < 6 && dayDiff === -1 && evHour >= 18) {
        return true;
      }

      return false;
    }

    if (ev.date) {
      if (ev.date === todayLocalStr) return true;
      if (String(ev.date).toLowerCase().trim() === 'today') return true;
    }

    return false;
  }

  /**
   * Filter Events by Sport and Status
   */
  getFilteredEvents({ sport = 'all', status = 'all', searchQuery = '' } = {}) {
    let list = this.events;

    // 1. Sport Filter (All, Football, Cricket, WWE)
    if (sport && sport.toLowerCase() !== 'all') {
      const sp = sport.toLowerCase();
      list = list.filter(e => (e.sport || '').toLowerCase() === sp);
    }

    // 2. Status Filter (ALL, TODAY, LIVE, UPCOMING, FINISHED, FAVORITES)
    if (status && status.toUpperCase() !== 'ALL') {
      const st = status.toUpperCase();
      if (st === 'FAVORITES') {
        const favs = this.getFavorites();
        list = list.filter(e => favs.includes(e.id));
      } else if (st === 'TODAY') {
        list = list.filter(e => this.isEventToday(e));
      } else if (st === 'FINISHED') {
        list = list.filter(e => this.isEventFinished(e));
      } else if (st === 'LIVE') {
        list = list.filter(e => !this.isEventFinished(e) && (e.status || '').toLowerCase() === 'live');
      } else if (st === 'UPCOMING') {
        list = list.filter(e => !this.isEventFinished(e) && (e.status || '').toLowerCase() === 'upcoming');
      } else {
        list = list.filter(e => (e.status || '').toUpperCase() === st);
      }
    }

    // 3. Search Query Filter (team, league, tournament, venue, title)
    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(e => {
        const title = (e.title || '').toLowerCase();
        const t1 = (e.team1?.name || e.homeTeam?.name || '').toLowerCase();
        const t2 = (e.team2?.name || e.awayTeam?.name || '').toLowerCase();
        const league = (e.league || '').toLowerCase();
        const tourn = (e.tournament || '').toLowerCase();
        const venue = (e.venue || '').toLowerCase();
        const sport = (e.sportName || e.sport || '').toLowerCase();
        const eventName = (e.eventName || '').toLowerCase();

        return title.includes(q) || t1.includes(q) || t2.includes(q) || league.includes(q) || tourn.includes(q) || venue.includes(q) || sport.includes(q) || eventName.includes(q);
      });
    }

    // Sort order per Rule 8: LIVE -> UPCOMING -> FINISHED
    if (!status || status.toUpperCase() === 'ALL') {
      list.sort((a, b) => {
        const order = ev => {
          if (!this.isEventFinished(ev) && (ev.status || '').toLowerCase() === 'live') return 0;
          if (!this.isEventFinished(ev) && (ev.status || '').toLowerCase() === 'upcoming') return 1;
          return 2; // Finished
        };

        const rankA = order(a);
        const rankB = order(b);
        if (rankA !== rankB) return rankA - rankB;

        if (rankA === 0) {
          const spA = a.isSpecial ? 1 : 0;
          const spB = b.isSpecial ? 1 : 0;
          return spB - spA;
        } else if (rankA === 1) {
          const spA = a.isSpecial ? 1 : 0;
          const spB = b.isSpecial ? 1 : 0;
          if (spB !== spA) return spB - spA;
          return (a.timestamp || 0) - (b.timestamp || 0);
        } else {
          // Finished: latest concluded first
          return (b.timestamp || 0) - (a.timestamp || 0);
        }
      });
    } else if (status.toUpperCase() === 'FINISHED') {
      // Finished tab: Sort by most recently concluded first
      list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    }

    return list;
  }

  /**
   * Calculate Real-Time Countdown string for upcoming events
   */
  getCountdownString(timestamp) {
    if (!timestamp || isNaN(timestamp)) return '';
    const now = Date.now();
    const diff = timestamp - now;

    if (diff <= 0) return 'Starts soon';

    const seconds = Math.floor((diff / 1000) % 60);
    const minutes = Math.floor((diff / (1000 * 60)) % 60);
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    const pad = (n) => String(n).padStart(2, '0');

    if (days > 0) {
      return `Starts in ${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `Starts in ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }

  /**
   * Favorites Management (localStorage)
   */
  getFavorites() {
    try {
      return JSON.parse(localStorage.getItem(this.favKey) || '[]');
    } catch {
      return [];
    }
  }

  isFavorite(eventId) {
    if (!eventId) return false;
    return this.getFavorites().includes(eventId);
  }

  toggleFavorite(eventId) {
    if (!eventId) return false;
    const favs = this.getFavorites();
    const idx = favs.indexOf(eventId);
    let isFav = false;
    if (idx > -1) {
      favs.splice(idx, 1);
      isFav = false;
    } else {
      favs.push(eventId);
      isFav = true;
    }
    localStorage.setItem(this.favKey, JSON.stringify(favs));
    return isFav;
  }

  /**
   * Get Event Details with Deep Data
   */
  async getEventDetails(eventId) {
    if (!eventId) return null;
    const event = this.events.find(e => e.id === eventId);
    if (!event) return null;

    // If football/sofascore event, fetch head-to-head / details if available
    if (window.sofascoreEngine && (event.rawId || event.id)) {
      try {
        const h2h = await window.sofascoreEngine.getH2HEvents(event.rawId || event.id);
        if (h2h && Array.isArray(h2h) && h2h.length > 0) {
          event.h2h = h2h;
        }
      } catch (e) {}
    }

    // If cricket, fetch deep scorecard
    if (event.sport === 'cricket' && window.cricketEngine) {
      const detailed = await window.cricketEngine.getMatchDetails(event.rawId || event.id);
      if (detailed) {
        Object.assign(event, detailed);
      }
    }

    return event;
  }

  /**
   * Format Last Updated Time
   */
  getLastUpdatedString() {
    if (!this.lastUpdated) return 'Never';
    return this.lastUpdated.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  }

  /**
   * Fetch SofaScore Official Sports List and Priorities
   */
  async getSofaScoreSportsList(countryCode = 'GB') {
    if (window.sofascoreEngine && typeof window.sofascoreEngine.getSportsList === 'function') {
      return await window.sofascoreEngine.getSportsList(countryCode);
    }
    return { status: 'error', sports: [], countrySportPriorities: [] };
  }
}

window.SportsCoordinator = SportsCoordinator;
window.sportsCoordinator = new SportsCoordinator();
window.formatEventTime = SportsCoordinator.formatEventTime;
window.isEventFinished = SportsCoordinator.isEventFinished;
