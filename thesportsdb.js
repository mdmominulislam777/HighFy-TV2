/**
 * HIGHFY TV - TheSportsDB Free Engine (thesportsdb.js)
 * Real-Time and Scheduled Sports Events from TheSportsDB Official Free Link (Key: 3).
 * Compatible with GitHub Pages & AI Studio Full-Stack Proxy.
 */

class TheSportsDBEngine {
  constructor() {
    this.storageKey = 'highfy_thesportsdb_key';
    this.cacheKey = 'highfy_thesportsdb_cache';
    this.cache = {
      timestamp: 0,
      ttl: 15 * 60 * 1000, // 15 minutes client cache to preserve free quota
      data: []
    };
    this.detailsCache = new Map();
    this.inFlightPromise = null;
    this.loadLocalCache();
  }

  /**
   * Hydrate cache from localStorage instantly
   */
  loadLocalCache() {
    try {
      const stored = localStorage.getItem(this.cacheKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && Array.isArray(parsed.data) && parsed.data.length > 0) {
          this.cache.timestamp = parsed.timestamp || 0;
          this.cache.data = parsed.data;
        }
      }
    } catch (e) {}
  }

  /**
   * Save cache to localStorage
   */
  saveLocalCache(data, timestamp = Date.now()) {
    try {
      this.cache.timestamp = timestamp;
      this.cache.data = data;
      localStorage.setItem(this.cacheKey, JSON.stringify({ timestamp, data }));
    } catch (e) {}
  }

  /**
   * Get active API Key (Defaults to free tier key '3')
   */
  getApiKey() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored && stored.trim()) return stored.trim();
    } catch (e) {}
    return window.CONFIG?.THESPORTSDB_API_KEY || '3';
  }

  /**
   * Set or update custom TheSportsDB API key
   */
  setApiKey(key) {
    try {
      if (key && key.trim()) {
        localStorage.setItem(this.storageKey, key.trim());
      } else {
        localStorage.removeItem(this.storageKey);
      }
      this.cache.timestamp = 0;
      this.cache.data = [];
    } catch (e) {}
  }

  /**
   * Base API URL
   */
  getBaseUrl() {
    const key = this.getApiKey();
    return `https://www.thesportsdb.com/api/v1/json/${encodeURIComponent(key)}`;
  }

  /**
   * Format start time into human readable date/time (Asia/Dhaka BST)
   */
  formatMatchTime(isoString, timezone = 'Asia/Dhaka') {
    if (typeof window !== 'undefined' && window.SportsCoordinator && typeof window.SportsCoordinator.formatEventTime === 'function') {
      return window.SportsCoordinator.formatEventTime(isoString, timezone);
    }
    if (!isoString) return '--:--';
    try {
      let str = String(isoString).trim();
      if (!str.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(str)) str = str.replace(' ', 'T') + 'Z';
      const date = new Date(str);
      if (isNaN(date.getTime())) return '--:--';
      return new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        month: 'short',
        day: 'numeric'
      }).format(date);
    } catch (e) {
      return '--:--';
    }
  }

  /**
   * Normalize Sport Category
   */
  normalizeSport(strSport = '') {
    const s = strSport.toLowerCase();
    if (s.includes('soccer') || (s.includes('football') && !s.includes('american'))) {
      return { sport: 'football', sportName: 'Football', sportIcon: 'fa-futbol' };
    }
    if (s.includes('cricket')) {
      return { sport: 'cricket', sportName: 'Cricket', sportIcon: 'fa-baseball-bat-ball' };
    }
    if (s.includes('basketball') || s.includes('nba')) {
      return { sport: 'basketball', sportName: 'Basketball', sportIcon: 'fa-basketball' };
    }
    if (s.includes('motorsport') || s.includes('racing') || s.includes('formula')) {
      return { sport: 'motorsport', sportName: 'Motorsports', sportIcon: 'fa-car-side' };
    }
    if (s.includes('tennis')) {
      return { sport: 'tennis', sportName: 'Tennis', sportIcon: 'fa-table-tennis-paddle-ball' };
    }
    if (s.includes('ice hockey') || s.includes('hockey')) {
      return { sport: 'hockey', sportName: 'Ice Hockey', sportIcon: 'fa-hockey-puck' };
    }
    if (s.includes('wwe') || s.includes('wrestling')) {
      return { sport: 'wwe', sportName: 'WWE', sportIcon: 'fa-hand-fist' };
    }
    if (s.includes('fighting') || s.includes('mma') || s.includes('ufc') || s.includes('boxing')) {
      return { sport: 'combat', sportName: 'Combat Sports', sportIcon: 'fa-hand-back-fist' };
    }
    return { sport: 'football', sportName: strSport || 'Sports', sportIcon: 'fa-trophy' };
  }

  /**
   * Normalize single event from TheSportsDB
   */
  normalizeEvent(raw) {
    if (!raw || !raw.idEvent) return null;
    const { sport, sportName, sportIcon } = this.normalizeSport(raw.strSport);

    let timestamp = Date.now();
    if (raw.strTimestamp) {
      let tsStr = String(raw.strTimestamp).trim();
      if (!tsStr.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(tsStr)) {
        tsStr = tsStr.replace(' ', 'T') + 'Z';
      }
      const parsed = Date.parse(tsStr);
      if (!isNaN(parsed)) timestamp = parsed;
    } else if (raw.dateEvent) {
      const timePart = raw.strTime ? raw.strTime.split('+')[0].split('Z')[0].trim() : '12:00:00';
      const parsed = Date.parse(`${raw.dateEvent}T${timePart}Z`);
      if (!isNaN(parsed)) timestamp = parsed;
    }

    const now = Date.now();
    const sportLower = (sport || '').toLowerCase();
    const matchDuration = sportLower.includes('cricket') ? (8 * 3600 * 1000) : (sportLower.includes('motor') || sportLower.includes('tennis') ? (4 * 3600 * 1000) : (2.2 * 3600 * 1000));
    const isLiveTime = now >= timestamp && now <= (timestamp + matchDuration);
    const isPastTime = now > (timestamp + matchDuration);

    let status = 'upcoming';
    let statusText = 'Scheduled';
    let statusLabel = 'Upcoming';

    const hasScores = (raw.intHomeScore !== null && raw.intHomeScore !== undefined && raw.intHomeScore !== '') ||
                      (raw.intAwayScore !== null && raw.intAwayScore !== undefined && raw.intAwayScore !== '');

    if (raw.strStatus === 'Match Finished' || raw.strPostponed === 'yes' || isPastTime || (hasScores && !isLiveTime)) {
      status = 'finished';
      statusText = 'Full Time';
      statusLabel = 'FT';
    } else if (isLiveTime || raw.strStatus === 'Live') {
      status = 'live';
      statusText = 'LIVE NOW';
      statusLabel = 'LIVE';
    }

    const homeScore = (raw.intHomeScore !== null && raw.intHomeScore !== undefined) ? String(raw.intHomeScore) : '';
    const awayScore = (raw.intAwayScore !== null && raw.intAwayScore !== undefined) ? String(raw.intAwayScore) : '';

    const timezone = window.CONFIG?.TIMEZONE || 'Asia/Dhaka';
    const matchTimeStr = this.formatMatchTime(new Date(timestamp).toISOString(), timezone);

    // Intelligently parse team or participant names from event title if missing
    let homeName = (raw.strHomeTeam || '').trim();
    let awayName = (raw.strAwayTeam || '').trim();
    const rawTitle = (raw.strEvent || '').trim();

    if ((!homeName || homeName.toLowerCase() === 'home team') && rawTitle.includes(' vs ')) {
      const parts = rawTitle.split(' vs ');
      homeName = parts[0].trim();
      awayName = parts[1].trim();
    } else if ((!homeName || homeName.toLowerCase() === 'home team') && rawTitle.includes(' v ')) {
      const parts = rawTitle.split(' v ');
      homeName = parts[0].trim();
      awayName = parts[1].trim();
    }

    // Skip corrupted or meaningless placeholder records
    if (!homeName || homeName.toLowerCase() === 'home team' || !awayName || awayName.toLowerCase() === 'away team') {
      if (!rawTitle || rawTitle.toLowerCase().includes('home team')) {
        return null;
      }
      homeName = rawTitle;
      awayName = raw.strLeague || 'Match';
    }

    const homeLogo = raw.strHomeTeamBadge || raw.strThumb || '';
    const awayLogo = raw.strAwayTeamBadge || '';
    const title = rawTitle || `${homeName} vs ${awayName}`;
    const league = raw.strLeague || 'Top League';

    const isHot = status === 'live' ||
                  league.toLowerCase().includes('premier league') ||
                  league.toLowerCase().includes('champions league') ||
                  league.toLowerCase().includes('la liga') ||
                  league.toLowerCase().includes('serie a') ||
                  league.toLowerCase().includes('bundesliga');

    return {
      id: `tsdb-${raw.idEvent}`,
      rawId: raw.idEvent,
      idEvent: raw.idEvent,
      sport: sport,
      sportName: sportName,
      sportIcon: sportIcon,
      title: title,
      name: title,
      league: league,
      tournament: league,
      leagueBadge: raw.strLeagueBadge || '',
      matchDesc: raw.strRound ? `Round ${raw.strRound}` : (raw.strDescriptionEN || ''),
      status: status,
      statusText: statusText,
      statusLabel: statusLabel,
      timestamp: timestamp,
      date: new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(timestamp)),
      matchTime: matchTimeStr,
      timeOrTimer: status === 'live' ? 'LIVE' : (status === 'finished' ? (homeScore && awayScore ? `${homeScore} - ${awayScore}` : 'FT') : matchTimeStr),
      venue: `${raw.strVenue || ''}${raw.strCountry ? `, ${raw.strCountry}` : ''}`,
      broadcaster: (raw.strTVStation || raw.strBroadcaster || raw.strBroadcast || raw.strChannel || '').trim(),
      broadcasters: (raw.strTVStation || raw.strBroadcaster || raw.strBroadcast || raw.strChannel || '') ? [(raw.strTVStation || raw.strBroadcaster || raw.strBroadcast || raw.strChannel || '').trim()] : [],
      isHot: isHot,
      videoUrl: raw.strVideo || null,
      team1: {
        id: raw.idHomeTeam,
        name: homeName,
        logo: homeLogo,
        score: homeScore
      },
      team2: {
        id: raw.idAwayTeam,
        name: awayName,
        logo: awayLogo,
        score: awayScore
      },
      homeTeam: {
        id: raw.idHomeTeam,
        name: homeName,
        logo: homeLogo,
        score: homeScore
      },
      awayTeam: {
        id: raw.idAwayTeam,
        name: awayName,
        logo: awayLogo,
        score: awayScore
      },
      subText: `${league} • ${matchTimeStr}`,
      source: 'TheSportsDB (Free)',
      streams: []
    };
  }

  /**
   * Fetch All Matches from TheSportsDB (Backend Proxy with Direct Fallback & In-Flight Coalescing)
   */
  async getAllMatches(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && (now - this.cache.timestamp < this.cache.ttl) && this.cache.data.length > 0) {
      return {
        configured: true,
        source: 'TheSportsDB (Cache)',
        events: this.cache.data
      };
    }

    if (this.inFlightPromise) {
      return this.inFlightPromise;
    }

    this.inFlightPromise = (async () => {
      try {
        // 1. Try Backend Proxy First
        const res = await fetch('/api/thesportsdb/events');
        if (res.ok) {
          const json = await res.json();
          if (json && Array.isArray(json.data) && json.data.length > 0) {
            this.saveLocalCache(json.data, Date.now());
            return {
              configured: true,
              source: 'TheSportsDB (Free)',
              events: json.data
            };
          }
        }
      } catch (e) {
        console.warn('[TheSportsDB] Backend proxy notice:', e.message);
      }

      // 2. Direct Fallback to TheSportsDB Free Public Endpoint (Key: 3)
      try {
        console.log('[TheSportsDB] Fetching directly from Free TheSportsDB endpoint...');
        const baseUrl = this.getBaseUrl();
        const topLeagueIds = [
          '4328', // Premier League
          '4335', // La Liga
          '4332', // Serie A
          '4331', // Bundesliga
          '4334', // Ligue 1
          '4480', // Champions League
          '4481', // Europa League
          '4427', // UEFA Nations League
          '4906', // Saudi Pro League
          '4346', // MLS
          '4387', // NBA
          '4370', // Formula 1
          '4380', // NHL Ice Hockey
          '4464', // ATP Tennis
          '4517', // WTA Tennis
          '4581', // Laver Cup Tennis
          '4466', // Grand Slam Tennis (US Open)
          '4467', // Wimbledon
          '4885', // International Cricket Tours
          '4886', // ICC T20 World Cup
          '4443', // ICC Cricket World Cup / UFC
          '4444', // ICC Champions Trophy
          '4442', // Indian Premier League (IPL)
          '4887', // Big Bash League (BBL)
          '4888'  // Pakistan Super League (PSL)
        ];
        const promises = [];

        for (const id of topLeagueIds) {
          promises.push(
            fetch(`${baseUrl}/eventsnextleague.php?id=${id}`)
              .then(r => r.ok ? r.json() : { events: [] })
              .catch(() => ({ events: [] }))
          );
          promises.push(
            fetch(`${baseUrl}/eventspastleague.php?id=${id}`)
              .then(r => r.ok ? r.json() : { events: [] })
              .catch(() => ({ events: [] }))
          );
        }

        const results = await Promise.allSettled(promises);
        const seen = new Set();
        const events = [];

        for (const r of results) {
          if (r.status === 'fulfilled' && r.value && Array.isArray(r.value.events)) {
            for (const raw of r.value.events) {
              if (raw && raw.idEvent && !seen.has(raw.idEvent)) {
                seen.add(raw.idEvent);
                const norm = this.normalizeEvent(raw);
                if (norm) events.push(norm);
              }
            }
          }
        }

        if (events.length > 0) {
          this.saveLocalCache(events, Date.now());
          return {
            configured: true,
            source: 'TheSportsDB (Free)',
            events: events
          };
        }
      } catch (e) {
        console.warn('[TheSportsDB] Direct fetch failed:', e.message);
      } finally {
        this.inFlightPromise = null;
      }

      return {
        configured: true,
        source: 'TheSportsDB',
        events: this.cache.data || []
      };
    })();

    return this.inFlightPromise;
  }

  /**
   * Get Event Details with Lineups & Media
   */
  async getMatchDetails(eventId) {
    if (!eventId) return null;
    const cleanId = String(eventId).replace(/^tsdb-/, '');

    if (this.detailsCache.has(cleanId)) {
      return this.detailsCache.get(cleanId);
    }

    // Try backend proxy
    try {
      const res = await fetch(`/api/thesportsdb/event/${encodeURIComponent(cleanId)}`);
      if (res.ok) {
        const json = await res.json();
        if (json && json.data) {
          this.detailsCache.set(cleanId, json.data);
          return json.data;
        }
      }
    } catch (e) {}

    // Direct lookup
    try {
      const baseUrl = this.getBaseUrl();
      const res = await fetch(`${baseUrl}/lookupevent.php?id=${encodeURIComponent(cleanId)}`);
      if (res.ok) {
        const json = await res.json();
        const raw = json.events?.[0];
        if (raw) {
          const norm = this.normalizeEvent(raw);
          this.detailsCache.set(cleanId, norm);
          return norm;
        }
      }
    } catch (e) {}

    return null;
  }
}

// Global Export
if (typeof window !== 'undefined') {
  window.TheSportsDBEngine = TheSportsDBEngine;
  window.thesportsdbEngine = new TheSportsDBEngine();
}
