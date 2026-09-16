/**
 * HIGHFY TV - WWE & Professional Wrestling Events Engine
 * Strictly configured and managed for:
 * 1. WWE RAW
 * 2. WWE SMACKDOWN LIVE
 * 3. WWE NXT
 * 4. WWE SPECIAL (Premium Live Events / PLEs)
 * 5. AEW (All Elite Wrestling - Dynamite / Collision / PPVs)
 * 
 * Scheduled authentically according to broadcast timelines in Bangladesh Standard Time (Asia/Dhaka GMT+6).
 * Never generates fake live scores.
 */

class WWEEngine {
  constructor() {
    this.cache = {
      timestamp: 0,
      ttl: 300000, // 5 minutes cache
      data: []
    };
  }

  /**
   * Get configured WWE Feed URL
   */
  getApiUrl() {
    const localUrl = localStorage.getItem('highfy_wwe_url');
    if (localUrl && localUrl.trim()) return localUrl.trim();
    const configUrl = window.CONFIG?.WWE_API_URL;
    if (configUrl && configUrl.trim()) return configUrl.trim();
    return '';
  }

  /**
   * Calculate next dynamic broadcast date in Asia/Dhaka (BST)
   * targetDayOfWeek: 0 = Sunday, 1 = Monday, 2 = Tuesday, 3 = Wednesday, 4 = Thursday, 5 = Friday, 6 = Saturday
   * targetHourBST: Hour in Asia/Dhaka (e.g. 6 = 06:00 AM BST)
   */
  getNextBroadcastTimestamp(targetDayOfWeek, targetHourBST = 6, durationHours = 3.5) {
    const now = new Date();
    // Get current time in Asia/Dhaka
    const dhakaStr = now.toLocaleString('en-US', { timeZone: 'Asia/Dhaka' });
    const dhakaDate = new Date(dhakaStr);
    
    const currentDay = dhakaDate.getDay();
    let daysUntil = (targetDayOfWeek - currentDay + 7) % 7;

    // Build target date in Dhaka time
    const targetDhaka = new Date(dhakaDate);
    targetDhaka.setDate(dhakaDate.getDate() + daysUntil);
    targetDhaka.setHours(targetHourBST, 0, 0, 0);

    const endDhaka = new Date(targetDhaka.getTime() + (durationHours * 3600 * 1000));

    // If target broadcast finished today, advance to next week
    if (daysUntil === 0 && dhakaDate.getTime() > endDhaka.getTime()) {
      targetDhaka.setDate(targetDhaka.getDate() + 7);
    }

    // Convert back to UTC timestamp
    const diffFromNowMs = targetDhaka.getTime() - dhakaDate.getTime();
    const targetTimestamp = now.getTime() + diffFromNowMs;

    // Check status
    const isCurrentlyLive = (daysUntil === 0 && dhakaDate.getTime() >= targetDhaka.getTime() && dhakaDate.getTime() <= endDhaka.getTime());

    return {
      timestamp: targetTimestamp,
      isoString: new Date(targetTimestamp).toISOString(),
      isLive: isCurrentlyLive,
      isFinished: false
    };
  }

  /**
   * Status Normalization for WWE / Wrestling Events
   */
  parseStatus(ev, fallbackStatus = 'upcoming') {
    if (!ev) return { status: fallbackStatus, label: fallbackStatus === 'live' ? 'LIVE' : 'Upcoming' };
    const raw = (ev.status || '').toLowerCase().trim();
    if (raw === 'live' || raw === 'in_progress' || raw === 'in-progress') {
      return { status: 'live', label: 'LIVE' };
    }
    if (raw === 'finished' || raw === 'concluded' || raw === 'completed' || raw === 'ended') {
      return { status: 'finished', label: 'Finished' };
    }
    return { status: 'upcoming', label: 'Upcoming' };
  }

  /**
   * Format start time (Asia/Dhaka BST)
   */
  formatMatchTime(isoStringOrTimestamp, timezone = 'Asia/Dhaka') {
    if (typeof window !== 'undefined' && window.SportsCoordinator && typeof window.SportsCoordinator.formatEventTime === 'function') {
      return window.SportsCoordinator.formatEventTime(isoStringOrTimestamp, timezone);
    }
    if (!isoStringOrTimestamp) return 'Scheduled';
    try {
      let ts = null;
      if (typeof isoStringOrTimestamp === 'number') {
        ts = isoStringOrTimestamp < 10000000000 ? isoStringOrTimestamp * 1000 : isoStringOrTimestamp;
      } else {
        let str = String(isoStringOrTimestamp).trim();
        if (!str.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(str)) str = str.replace(' ', 'T') + 'Z';
        ts = new Date(str).getTime();
      }
      const date = new Date(ts);
      return date.toLocaleDateString('en-US', {
        timeZone: timezone,
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch {
      return String(isoStringOrTimestamp);
    }
  }

  /**
   * Categorize strictly into WWE RAW, WWE SMACKDOWN LIVE, WWE NXT, WWE SPECIAL, or AEW
   */
  categorizeBrand(item) {
    const text = `${item.name || ''} ${item.title || ''} ${item.brand || ''} ${item.tournament || ''} ${item.league || ''} ${item.type || ''}`.toLowerCase();
    
    // 1. WWE RAW
    if (text.includes('raw') || text.includes('monday night')) {
      return {
        brand: 'WWE RAW',
        shortName: 'RAW',
        ribbon: 'WWE RAW',
        icon: 'fa-hand-fist',
        color: '#ef4444',
        logo: '/assets/wwe-logos/wwe_raw.svg'
      };
    }
    
    // 2. WWE SMACKDOWN LIVE
    if (text.includes('smackdown') || text.includes('smack down') || text.includes('friday night')) {
      return {
        brand: 'WWE SMACKDOWN LIVE',
        shortName: 'SmackDown Live',
        ribbon: 'SmackDown',
        icon: 'fa-hand-fist',
        color: '#0284c7',
        logo: '/assets/wwe-logos/wwe_smackdown.svg'
      };
    }
    
    // 3. WWE NXT
    if (text.includes('nxt') || text.includes('super tuesday')) {
      return {
        brand: 'WWE NXT',
        shortName: 'NXT',
        ribbon: 'WWE NXT',
        icon: 'fa-bolt',
        color: '#f59e0b',
        logo: '/assets/wwe-logos/wwe_nxt.svg'
      };
    }

    // 4. AEW (All Elite Wrestling)
    if (text.includes('aew') || text.includes('elite wrestling') || text.includes('dynamite') || text.includes('rampage') || text.includes('collision') || text.includes('all in') || text.includes('revolution')) {
      return {
        brand: 'AEW',
        shortName: 'AEW',
        ribbon: 'AEW',
        icon: 'fa-hand-back-fist',
        color: '#eab308',
        logo: '/assets/wwe-logos/aew_official.svg'
      };
    }
    
    // 5. WWE SPECIAL (Premium Live Events / PLEs: WrestleMania, Royal Rumble, SummerSlam, Bad Blood, Crown Jewel, etc.)
    return {
      brand: 'WWE SPECIAL',
      shortName: 'WWE Special',
      ribbon: 'WWE Special',
      icon: 'fa-trophy',
      color: '#8b5cf6',
      logo: '/assets/wwe-logos/wwe_special.svg'
    };
  }

  /**
   * Normalize WWE / AEW Event item
   */
  normalizeEvent(item, index) {
    if (!item) return null;

    const brandInfo = this.categorizeBrand(item);
    const id = item.id || `wwe-${brandInfo.shortName.toLowerCase().replace(/\s+/g, '-')}-${index + 1}`;
    const name = brandInfo.brand;
    const dateStr = item.date || item.startTime || item.dateTime;
    const timezone = window.CONFIG?.TIMEZONE || 'Asia/Dhaka';
    
    let timestamp = item.timestamp;
    if (!timestamp && dateStr) {
      timestamp = new Date(dateStr).getTime();
    }
    if (!timestamp || isNaN(timestamp)) {
      timestamp = Date.now() + ((index + 1) * 24 * 3600 * 1000);
    } else if (timestamp < 10000000000) {
      timestamp *= 1000;
    }

    const matchTime = this.formatMatchTime(timestamp, timezone);
    const venue = item.venue ? `${item.venue}${item.city ? ', ' + item.city : ''}` : 'Arena';
    const statusParsed = this.parseStatus(item);

    // Strictly Brand / Show Names and Official Brand Logos (NO individual wrestler/player names)
    const homeName = brandInfo.brand === 'AEW' ? 'AEW' : 'WWE';
    const homeLogo = brandInfo.brand === 'AEW' ? '/assets/wwe-logos/aew_official.svg' : '/assets/wwe-logos/wwe_official.svg';
    const awayName = brandInfo.shortName;
    const awayLogo = brandInfo.logo;

    const defaultStreams = [
      {
        name: "Server 1: Sony Sports Ten 1 HD",
        channelName: "Sony Ten Sports 1 HD",
        quality: "1080p FHD",
        url: "https://s3.itcnbd.live/channel/2929059f34d114ca.m3u8"
      },
      {
        name: "Server 2: Sony Sports Ten 5 HD",
        channelName: "Sony Ten Sports 5 HD",
        quality: "1080p FHD",
        url: "https://s3.itcnbd.live/channel/ea25a516d781cb1c.m3u8"
      },
      {
        name: "Server 3: WWE Network Live",
        channelName: "WWE Network",
        quality: "1080p 60fps",
        url: "http://tv.nkservicebd.com:8080/live/wwe/mono.m3u8"
      }
    ];

    return {
      id: id.startsWith('wwe-') || id.startsWith('aew-') ? id : `wwe-${id}`,
      rawId: id,
      sport: 'wwe',
      sportName: 'WWE',
      sportIcon: brandInfo.icon,
      title: name,
      league: brandInfo.brand,
      tournament: brandInfo.brand,
      brandCategory: brandInfo.brand,
      ribbonLabel: brandInfo.ribbon,
      eventName: name,
      eventType: brandInfo.brand,
      status: statusParsed.status,
      statusLabel: statusParsed.label,
      statusText: statusParsed.label,
      startTime: new Date(timestamp).toISOString(),
      matchTime: matchTime,
      timestamp: timestamp,
      venue: venue,
      isHot: true,
      isSpecial: true,

      homeTeam: {
        name: homeName,
        logo: homeLogo,
        score: ''
      },
      awayTeam: {
        name: awayName,
        logo: awayLogo,
        score: ''
      },

      team1: {
        name: homeName,
        logo: homeLogo,
        score: ''
      },
      team2: {
        name: awayName,
        logo: awayLogo,
        score: ''
      },

      timeOrTimer: statusParsed.status === 'live' ? 'LIVE' : (statusParsed.status === 'finished' ? 'FT' : matchTime),
      subText: `${brandInfo.brand} • ${venue}`,
      matches: item.matches || item.matchCard || [],
      details: item.details || item.description || '',
      streams: (item.streams && item.streams.length > 0) ? item.streams : defaultStreams,
      source: 'Official Schedule'
    };
  }

  /**
   * Authentic Built-In Schedule strictly for:
   * 1. WWE RAW
   * 2. WWE SMACKDOWN LIVE
   * 3. WWE NXT
   * 4. WWE SPECIAL
   * 5. AEW
   */
  getDefaultEvents() {
    // STRICT RULE: Never fabricate fake or simulated matches. Only authentic API data.
    return [];
  }

  /**
   * Fetch All WWE & AEW Events strictly filtered to:
   * WWE RAW, WWE SMACKDOWN LIVE, WWE NXT, WWE SPECIAL, and AEW
   */
  async getAllEvents(forceRefresh = false) {
    const apiUrl = this.getApiUrl();
    if (!apiUrl) {
      return {
        configured: false,
        events: []
      };
    }

    const now = Date.now();
    if (!forceRefresh && (now - this.cache.timestamp < this.cache.ttl) && this.cache.data.length > 0) {
      return {
        configured: true,
        events: this.cache.data
      };
    }

    try {
      console.log('[WWEEngine] Fetching WWE/AEW data from URL:', apiUrl);
      const res = await fetch(apiUrl);
      if (!res.ok) {
        return {
          configured: true,
          events: []
        };
      }

      const json = await res.json();
      const rawList = Array.isArray(json) ? json : (json.events || json.data || []);
      
      // Strictly filter to WWE RAW, WWE SMACKDOWN LIVE, WWE NXT, WWE SPECIAL, and AEW
      const allowedRegex = /(raw|wwe raw|smackdown|smack down|smackdown live|wwe smackdown|nxt|wwe nxt|wwe special|ple|wrestlemania|summerslam|royal rumble|survivor series|bad blood|crown jewel|aew|all elite wrestling|dynamite|rampage|collision|all in|revolution)/i;
      
      const normalized = rawList
        .filter(item => {
          if (!item) return false;
          const str = `${item.name || ''} ${item.title || ''} ${item.brand || ''} ${item.league || ''} ${item.tournament || ''}`;
          return allowedRegex.test(str);
        })
        .map((item, idx) => this.normalizeEvent(item, idx))
        .filter(ev => ev !== null);

      if (normalized.length === 0) {
        return {
          configured: true,
          events: []
        };
      }

      normalized.sort((a, b) => {
        const order = { live: 1, upcoming: 2, finished: 3 };
        const diff = (order[a.status] || 99) - (order[b.status] || 99);
        if (diff !== 0) return diff;
        return a.timestamp - b.timestamp;
      });

      this.cache.timestamp = Date.now();
      this.cache.data = normalized;

      return {
        configured: true,
        events: normalized
      };
    } catch (err) {
      console.error('[WWEEngine] Error loading WWE/AEW events:', err);
      return {
        configured: true,
        events: []
      };
    }
  }
}

window.WWEEngine = WWEEngine;
window.wweEngine = new WWEEngine();
