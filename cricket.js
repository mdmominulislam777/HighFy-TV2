/**
 * HIGHFY TV - Cricket Engine (RapidAPI Live Cricket Data)
 * Fetches real Live, Upcoming, and Finished cricket matches.
 * Compatible with GitHub Pages and Backend Server Proxy.
 */

class CricketEngine {
  constructor() {
    this.cacheKey = 'highfy_cricket_events_cache';
    this.cache = {
      timestamp: 0,
      ttl: 5 * 60 * 1000, // 5 minutes cache to strictly preserve quota
      data: []
    };
    this.detailsCache = new Map();
    this.inFlightPromise = null;
    this.loadLocalCache();
  }

  /**
   * Hydrate cricket events from localStorage with strict staleness validation
   */
  loadLocalCache() {
    try {
      const stored = localStorage.getItem(this.cacheKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        const now = Date.now();
        // Strict TTL: purge cache if older than 5 minutes
        if (parsed && (now - (parsed.timestamp || 0) < 5 * 60 * 1000) && Array.isArray(parsed.data) && parsed.data.length > 0) {
          // Sanitize any stale "live" matches (> 12h past start) or legacy mock matches
          const cleanData = parsed.data
            .filter(ev => {
              if (!ev || !ev.id) return false;
              const id = String(ev.id);
              if (id.startsWith('cricket-upcoming-') || id.startsWith('cricket-live-') || id.startsWith('dummy-') || id.startsWith('mock-')) {
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
          this.cache.timestamp = parsed.timestamp || 0;
          this.cache.data = cleanData;
        } else {
          localStorage.removeItem(this.cacheKey);
          this.cache.data = [];
          this.cache.timestamp = 0;
        }
      }
    } catch (e) {
      localStorage.removeItem(this.cacheKey);
    }
  }

  /**
   * Save cricket events to localStorage
   */
  saveLocalCache(data, timestamp = Date.now()) {
    try {
      this.cache.timestamp = timestamp;
      this.cache.data = data;
      localStorage.setItem(this.cacheKey, JSON.stringify({ timestamp, data }));
    } catch (e) {}
  }

  /**
   * Get active RapidAPI Key
   */
  getRapidApiKey() {
    const localKey = localStorage.getItem('highfy_rapidapi_key');
    if (localKey && localKey.trim()) return localKey.trim();
    const configKey = window.CONFIG?.RAPIDAPI_KEY;
    if (configKey && configKey.trim()) return configKey.trim();
    return '';
  }

  /**
   * Get active Sportradar Cricket API Key
   */
  getSportradarKey() {
    const localKey = localStorage.getItem('highfy_sportradar_key');
    if (localKey && localKey.trim()) return localKey.trim();
    const configKey = window.CONFIG?.SPORTRADAR_CRICKET_API_KEY;
    if (configKey && configKey.trim()) return configKey.trim();
    return '';
  }

  /**
   * Status Normalization for Cricket
   */
  parseStatus(item) {
    if (!item) return { status: 'upcoming', label: 'Upcoming' };

    const statusText = (item.status || '').toLowerCase().trim();
    const matchEnded = item.matchEnded === true || item.matchEnded === 'true';
    const matchStarted = item.matchStarted === true || item.matchStarted === 'true';

    // Finished criteria
    if (matchEnded || 
        statusText.includes('won by') || 
        statusText.includes('match drawn') || 
        statusText.includes('match tied') || 
        statusText.includes('no result') || 
        statusText.includes('abandoned') ||
        statusText.includes('awarded') ||
        statusText.includes('refused to play') ||
        statusText.includes('walkover') ||
        statusText.includes('concluded') ||
        statusText.includes('completed') ||
        statusText.includes('winner') ||
        statusText.includes('lost by') ||
        statusText.includes('target reached') ||
        statusText.includes('cancelled')) {
      return { status: 'finished', label: item.status || 'Match Concluded' };
    }

    // Time-based guard: if a match was scheduled > 14 hours ago and has no live overs update, it cannot be live
    const dateStr = item.dateTimeGMT || item.date || item.startTime;
    if (dateStr) {
      const ts = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z').getTime();
      if (!isNaN(ts) && (Date.now() - ts > 14 * 60 * 60 * 1000)) {
        return { status: 'finished', label: item.status || 'Match Concluded' };
      }
    }

    // Live criteria
    if (matchStarted && !matchEnded) {
      return { status: 'live', label: item.status || 'In Progress' };
    }

    // Upcoming
    return { status: 'upcoming', label: item.status || 'Scheduled' };
  }

  /**
   * Format start time (Asia/Dhaka BST)
   */
  formatMatchTime(isoString, timezone = 'Asia/Dhaka') {
    if (typeof window !== 'undefined' && window.SportsCoordinator && typeof window.SportsCoordinator.formatEventTime === 'function') {
      return window.SportsCoordinator.formatEventTime(isoString, timezone);
    }
    if (!isoString) return 'Scheduled';
    try {
      let str = String(isoString).trim();
      if (!str.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(str)) str = str.replace(' ', 'T') + 'Z';
      const date = new Date(str);
      return date.toLocaleTimeString('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch {
      return isoString;
    }
  }

  /**
   * Core API Fetcher
   */
  async fetchFromApi(endpoint) {
    const sportradarKey = this.getSportradarKey();
    const rapidKey = this.getRapidApiKey();

    // 1. Direct Sportradar matches fetch if explicitly requested
    if (sportradarKey && endpoint.includes('provider=sportradar')) {
      try {
        const srRes = await fetch(`/api/cricket/sportradar/matches?api_key=${encodeURIComponent(sportradarKey)}`);
        if (srRes.ok) {
          const srJson = await srRes.json();
          if (srJson && Array.isArray(srJson.data) && srJson.data.length > 0) {
            return { success: true, data: srJson.data, source: 'Sportradar' };
          }
        }
      } catch (srErr) {
        console.warn('[CricketEngine] Sportradar note:', srErr.message);
      }
    }

    // 2. Query backend server proxy (Cricbuzz RapidAPI + Sportradar unified engine)
    try {
      if (endpoint.includes('currentMatches') || endpoint.includes('matches')) {
        const queryParts = [];
        if (rapidKey) queryParts.push(`rapidapikey=${encodeURIComponent(rapidKey)}`);
        if (sportradarKey) queryParts.push(`sportradar_key=${encodeURIComponent(sportradarKey)}`);
        const queryString = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';

        const proxyUrl = `/api/cricket/matches${queryString}`;
        const headers = {};
        if (rapidKey) headers['x-rapidapi-key'] = rapidKey;
        if (sportradarKey) headers['x-sportradar-api-key'] = sportradarKey;

        const proxyRes = await fetch(proxyUrl, { headers });
        if (proxyRes.ok) {
          const json = await proxyRes.json();
          if (json && Array.isArray(json.data) && json.data.length > 0) {
            return { success: true, data: json.data, source: json.source || 'CricketData' };
          }
        }
      } else if (endpoint.includes('match_info') || endpoint.includes('scorecard') || endpoint.includes('details')) {
        const cleanId = (endpoint.split('id=')[1] || '').split('&')[0];
        if (cleanId) {
          const queryParts = [`id=${encodeURIComponent(cleanId)}`];
          if (rapidKey) queryParts.push(`rapidapikey=${encodeURIComponent(rapidKey)}`);
          const queryString = `?${queryParts.join('&')}`;

          const headers = {};
          if (rapidKey) headers['x-rapidapi-key'] = rapidKey;

          const scardRes = await fetch(`/api/cricket/scorecard${queryString}`, { headers });
          if (scardRes.ok) {
            const scardJson = await scardRes.json();
            if (scardJson && scardJson.data) {
              return { success: true, data: scardJson.data, source: 'Cricbuzz Scorecard' };
            }
          }
        }
      }
    } catch (proxyErr) {
      console.warn('[CricketEngine] Backend proxy note:', proxyErr.message);
    }

    return { error: 'no_matches', message: 'No live cricket matches at this time.' };
  }

  /**
   * Helper to resolve high-definition logos for cricket teams
   */
  resolveHDLogo(teamName, rawLogo) {
    if (typeof window !== 'undefined' && typeof window.getHighResTeamLogo === 'function') {
      return window.getHighResTeamLogo(teamName, rawLogo);
    }
    // 1. HIGHEST PRIORITY: If authentic original team logo is provided by feed/API, preserve and upgrade it!
    if (rawLogo && typeof rawLogo === 'string') {
      let clean = rawLogo.trim();
      if (clean && !clean.includes('un.png') && !clean.includes('placeholder') && !clean.includes('default-team')) {
        if (clean.includes('/72x54/')) clean = clean.replace('/72x54/', '/300x300/');
        if (clean.includes('/w160/')) clean = clean.replace('/w160/', '/w320/');
        if (clean.startsWith('http://static.cricbuzz.com')) clean = clean.replace('http://', 'https://');
        return clean;
      }
    }

    if (!teamName) return 'https://flagcdn.com/w320/un.png';
    const tLower = teamName.toLowerCase().trim();
    const map = {
      'india': 'https://flagcdn.com/w320/in.png',
      'bangladesh': 'https://flagcdn.com/w320/bd.png',
      'pakistan': 'https://flagcdn.com/w320/pk.png',
      'england': 'https://flagcdn.com/w320/gb-eng.png',
      'australia': 'https://flagcdn.com/w320/au.png',
      'sri lanka': 'https://flagcdn.com/w320/lk.png',
      'south africa': 'https://flagcdn.com/w320/za.png',
      'new zealand': 'https://flagcdn.com/w320/nz.png',
      'west indies': 'https://static.cricbuzz.com/a/img/v1/300x300/i1/c170818/west-indies.jpg',
      'afghanistan': 'https://flagcdn.com/w320/af.png',
      'ireland': 'https://flagcdn.com/w320/ie.png',
      'scotland': 'https://flagcdn.com/w320/gb-sct.png',
      'netherlands': 'https://flagcdn.com/w320/nl.png',
      'zimbabwe': 'https://flagcdn.com/w320/zw.png'
    };
    if (map[tLower]) return map[tLower];
    for (const [k, v] of Object.entries(map)) {
      if (k.length <= 3) {
        const regex = new RegExp(`(^|\\b|\\s)${k}(\\b|\\s|$)`, 'i');
        if (regex.test(tLower)) return v;
      } else {
        if (tLower === k || tLower.includes(k) || k.includes(tLower)) return v;
      }
    }
    return 'https://flagcdn.com/w320/un.png';
  }

  /**
   * Helper to check if a string is a UUID or raw ID
   */
  isUuidString(str) {
    if (!str || typeof str !== 'string') return true;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i.test(str.trim()) || /^[0-9a-f-]{12,}$/i.test(str.trim());
  }

  /**
   * Normalize Cricket Match Data (handles both RapidAPI & CricAPI schemas)
   */
  normalizeMatch(item) {
    if (!item) return null;

    // If item is already normalized from backend RapidAPI, Cricbuzz, or Sportradar proxy:
    if (item.source === 'Sportradar' || item.source === 'Sportradar Live' || item.source === 'Cricbuzz RapidAPI' || item.source === 'RapidAPI Cricket' || item.source === 'RapidAPI' || item.source === 'Cricbuzz Live' || (item.sport === 'cricket' && item.team1 && item.team2)) {
      const statusLower = (item.status || 'upcoming').toLowerCase();
      const isLive = statusLower === 'live';
      const isFinished = statusLower === 'finished';
      const timezone = window.CONFIG?.TIMEZONE || 'Asia/Dhaka';
      const timestamp = item.timestamp || Date.now();
      const matchTime = item.matchTime || this.formatMatchTime(new Date(timestamp).toISOString(), timezone);

      return {
        ...item,
        id: item.id || `cr-rapid-${item.matchId || Date.now()}`,
        sport: 'cricket',
        sportName: 'Cricket',
        sportIcon: 'fa-baseball-bat-ball',
        matchTime: matchTime,
        timeOrTimer: isLive ? 'LIVE' : (isFinished ? 'FT' : matchTime),
        status: statusLower,
        statusLabel: isLive ? 'LIVE' : (isFinished ? 'FINISHED' : 'Upcoming'),
        isHot: item.isHot || isLive,
        streams: item.streams || []
      };
    }

    if (!item.id) return null;

    const teams = item.teams || (item.teamInfo ? item.teamInfo.map(t => t.name) : []);
    const team1Name = teams[0] || item.teamInfo?.[0]?.name || 'Team 1';
    const team2Name = teams[1] || item.teamInfo?.[1]?.name || 'Team 2';

    const team1Info = item.teamInfo?.find(t => t.name === team1Name) || item.teamInfo?.[0] || {};
    const team2Info = item.teamInfo?.find(t => t.name === team2Name) || item.teamInfo?.[1] || {};

    const scores = Array.isArray(item.score) ? item.score : [];

    // Extract score info for team 1 and team 2
    let team1ScoreStr = '';
    let team1OversStr = '';
    let team2ScoreStr = '';
    let team2OversStr = '';

    const t1ScoreObj = scores.find(s => s.inning && s.inning.toLowerCase().includes(team1Name.toLowerCase())) || scores[0];
    const t2ScoreObj = scores.find(s => s.inning && s.inning.toLowerCase().includes(team2Name.toLowerCase())) || scores[1];

    if (t1ScoreObj) {
      team1ScoreStr = `${t1ScoreObj.r || 0}/${t1ScoreObj.w !== undefined ? t1ScoreObj.w : 0}`;
      team1OversStr = t1ScoreObj.o !== undefined ? `(${t1ScoreObj.o} ov)` : '';
    }

    if (t2ScoreObj) {
      team2ScoreStr = `${t2ScoreObj.r || 0}/${t2ScoreObj.w !== undefined ? t2ScoreObj.w : 0}`;
      team2OversStr = t2ScoreObj.o !== undefined ? `(${t2ScoreObj.o} ov)` : '';
    }

    const statusParsed = this.parseStatus(item);
    const timezone = window.CONFIG?.TIMEZONE || 'Asia/Dhaka';
    const dateStr = item.dateTimeGMT || item.date;
    const matchTime = this.formatMatchTime(dateStr, timezone);
    const timestamp = dateStr ? new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z').getTime() : Date.now();

    const isLive = statusParsed.status === 'live';
    const isFinished = statusParsed.status === 'finished';

    let timeOrTimer = matchTime;
    if (isLive) {
      timeOrTimer = 'LIVE';
    } else if (isFinished) {
      timeOrTimer = 'FT';
    }

    // Resolve clean human-readable series / tournament name (never display UUIDs)
    let tournamentName = '';
    if (item.series_name && !this.isUuidString(item.series_name)) {
      tournamentName = item.series_name;
    } else if (item.seriesName && !this.isUuidString(item.seriesName)) {
      tournamentName = item.seriesName;
    } else if (item.series && !this.isUuidString(item.series)) {
      tournamentName = item.series;
    } else if (item.name && !this.isUuidString(item.name)) {
      tournamentName = item.name;
    } else if (item.matchType) {
      tournamentName = `${item.matchType.toUpperCase()} Match`;
    } else {
      tournamentName = 'Cricket Series';
    }

    const tNameLower = tournamentName.toLowerCase();
    let computedFormat = item.matchType || 'Match';
    if (tNameLower.includes('county') || tNameLower.includes('championship')) {
      computedFormat = 'County';
    } else if (tNameLower.includes('t20') || tNameLower.includes('blast') || tNameLower.includes('ipl') || tNameLower.includes('bpl') || tNameLower.includes('psl')) {
      computedFormat = 'T20';
    } else if (tNameLower.includes('odi') || tNameLower.includes('champions trophy') || tNameLower.includes('one day')) {
      computedFormat = 'ODI';
    } else if (tNameLower.includes('test') || (item.matchType && item.matchType.toLowerCase() === 'test' && !tNameLower.includes('county'))) {
      computedFormat = 'Test';
    }

    const cleanTitle = (item.name && !this.isUuidString(item.name)) ? item.name : `${team1Name} vs ${team2Name}`;
    const cleanLeague = computedFormat ? computedFormat.toUpperCase() : tournamentName;

    return {
      id: `cr-${item.id}`,
      rawId: item.id,
      sport: 'cricket',
      sportName: 'Cricket',
      sportIcon: 'fa-baseball-bat-ball',
      title: cleanTitle,
      name: cleanTitle,
      league: cleanLeague,
      tournament: tournamentName,
      matchType: computedFormat,
      status: statusParsed.status, // "live" | "upcoming" | "finished"
      statusLabel: statusParsed.label,
      statusText: item.status || statusParsed.label,
      startTime: dateStr,
      matchTime: matchTime,
      timestamp: isNaN(timestamp) ? Date.now() : timestamp,
      date: new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(isNaN(timestamp) ? Date.now() : timestamp)),
      venue: item.venue || '',
      isHot: isLive,

      // Common normalized standard format
      homeTeam: {
        name: team1Name,
        logo: this.resolveHDLogo(team1Name, team1Info.img),
        score: team1ScoreStr,
        overs: team1OversStr
      },
      awayTeam: {
        name: team2Name,
        logo: this.resolveHDLogo(team2Name, team2Info.img),
        score: team2ScoreStr,
        overs: team2OversStr
      },

      // UI View Adapters (team1 / team2)
      team1: {
        name: team1Name,
        logo: this.resolveHDLogo(team1Name, team1Info.img),
        score: team1ScoreStr,
        overs: team1OversStr
      },
      team2: {
        name: team2Name,
        logo: this.resolveHDLogo(team2Name, team2Info.img),
        score: team2ScoreStr,
        overs: team2OversStr
      },

      runs: t1ScoreObj ? t1ScoreObj.r : '',
      wickets: t1ScoreObj ? t1ScoreObj.w : '',
      overs: t1ScoreObj ? t1ScoreObj.o : '',
      innings: scores,
      requiredRunRate: '',
      timeOrTimer: timeOrTimer,
      broadcaster: (item.broadcaster || item.broadcasters || item.tv || item.broadcast || item.channel || item.strTVStation || '').trim(),
      broadcasters: (item.broadcaster || item.broadcasters || item.tv || item.broadcast || item.channel || item.strTVStation || '') ? [String(item.broadcaster || item.broadcasters || item.tv || item.broadcast || item.channel || item.strTVStation || '').trim()] : [],
      subText: item.status || `${item.matchType || 'Cricket'} • ${item.venue || ''}`,
      scoreDetails: scores,
      streams: [],
      source: 'CricketData'
    };
  }

  /**
   * Helper to check if a cricket match is a Special / Featured Match
   */
  isSpecialMatch(item) {
    if (!item) return false;
    const name = (item.name || '').toLowerCase();
    const series = (item.series_name || item.seriesName || item.series || '').toLowerCase();
    const matchType = (item.matchType || '').toLowerCase();
    const teams = item.teams ? item.teams.map(t => String(t).toLowerCase()) : [];

    const topTeams = [
      'bangladesh', 'india', 'pakistan', 'australia', 'england', 'south africa',
      'new zealand', 'sri lanka', 'west indies', 'afghanistan', 'ireland', 'scotland',
      'netherlands', 'zimbabwe', 'namibia', 'nepal', 'usa', 'canada', 'uae', 'oman'
    ];

    const topSeries = [
      'tour of', 'international', 'tri-series', 'world cup', 'asia cup',
      'champions trophy', 'test', 'odi', 't20i', 'continental cup',
      'ipl', 'bpl', 'psl', 'big bash', 'cpl', 'hundred', 'vitality',
      'duleep trophy', 'ranji', 'county championship', 'premier league'
    ];

    const hasTopTeam = topTeams.some(t => teams.some(tm => tm.includes(t)) || name.includes(t) || series.includes(t));
    const hasTopSeries = topSeries.some(s => series.includes(s) || name.includes(s) || matchType.includes(s));

    return hasTopTeam || hasTopSeries;
  }

  /**
   * Fetch All Cricket Matches (In-Flight Coalescing & Quota-Preserving Cache)
   */
  async getAllMatches(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && (now - this.cache.timestamp < this.cache.ttl) && this.cache.data.length > 0) {
      return {
        configured: true,
        events: this.cache.data
      };
    }

    if (this.inFlightPromise) {
      return this.inFlightPromise;
    }

    this.inFlightPromise = (async () => {
      console.log('[CricketEngine] Querying Cricket Live Feed...');
      const res = await this.fetchFromApi(`/currentMatches?offset=0`);

      if (res.error && (!res.data || res.data.length === 0)) {
        this.inFlightPromise = null;
        if (this.cache.data && this.cache.data.length > 0) {
          return { configured: true, events: this.cache.data };
        }
        return { configured: false, error: res.error, message: res.message, events: [] };
      }

      const rawList = Array.isArray(res.data) ? res.data : [];
      const normalized = rawList
        .map(item => this.normalizeMatch(item))
        .filter(ev => ev !== null);

      // Tag special matches
      normalized.forEach(ev => {
        ev.isSpecial = this.isSpecialMatch({
          name: ev.title || ev.name,
          series_name: ev.tournament || ev.seriesName,
          matchType: ev.matchType || ev.matchFormat,
          teams: [ev.team1?.name, ev.team2?.name]
        });
        if (ev.isSpecial) {
          ev.isHot = true;
        }
      });

      // 14-Day Upcoming Window Bound: Keep full international tours, leagues and upcoming matches
      const curNow = Date.now();
      const fourteenDaysAhead = curNow + (14 * 24 * 60 * 60 * 1000);
      const isCricketFinished = (e) => {
        if (typeof window !== 'undefined' && typeof window.isEventFinished === 'function') {
          return window.isEventFinished(e);
        }
        const st = (e.status || '').toLowerCase();
        if (st === 'finished' || st === 'ft' || st === 'ended' || st === 'completed') return true;
        const txt = (String(e.statusText || '') + ' ' + String(e.matchDesc || '')).toLowerCase();
        if (/(^|\b)(won by|won the|match won|match tied|match drawn|match ended|no result|abandoned|concluded|completed|winner)(\b|$)/i.test(txt)) {
          e.status = 'finished';
          e.statusLabel = 'FINISHED';
          e.timeOrTimer = 'FT';
          return true;
        }
        if (e.timestamp) {
          const ts = e.timestamp < 10000000000 ? e.timestamp * 1000 : e.timestamp;
          const elapsed = curNow - ts;
          const fmt = String(e.matchFormat || e.matchType || '').toUpperCase();
          if (fmt.includes('T20') && elapsed > 4.5 * 3600 * 1000) {
            e.status = 'finished';
            e.statusLabel = 'FINISHED';
            e.timeOrTimer = 'FT';
            return true;
          }
          if (fmt.includes('ODI') && elapsed > 9 * 3600 * 1000) {
            e.status = 'finished';
            e.statusLabel = 'FINISHED';
            e.timeOrTimer = 'FT';
            return true;
          }
          if (elapsed > 6 * 3600 * 1000) {
            e.status = 'finished';
            e.statusLabel = 'FINISHED';
            e.timeOrTimer = 'FT';
            return true;
          }
        }
        return false;
      };

      const finishedMatches = normalized.filter(e => isCricketFinished(e));
      const liveMatches = normalized.filter(e => !isCricketFinished(e) && e.status === 'live');
      const upcomingMatches = normalized.filter(e => !isCricketFinished(e) && e.status === 'upcoming' && ((e.timestamp || curNow) <= fourteenDaysAhead || e.isSpecial));

      // Sort finished matches
      finishedMatches.sort((a, b) => {
        const spA = a.isSpecial ? 1 : 0;
        const spB = b.isSpecial ? 1 : 0;
        if (spB !== spA) return spB - spA;
        return (b.timestamp || 0) - (a.timestamp || 0);
      });
      const topFinished = finishedMatches.slice(0, 50);

      // Sort upcoming: Special first, then chronological
      upcomingMatches.sort((a, b) => {
        const spA = a.isSpecial ? 1 : 0;
        const spB = b.isSpecial ? 1 : 0;
        if (spB !== spA) return spB - spA;
        return (a.timestamp || 0) - (b.timestamp || 0);
      });

      const curatedCricket = [...liveMatches, ...upcomingMatches, ...topFinished];

      if (curatedCricket.length > 0) {
        this.saveLocalCache(curatedCricket, Date.now());
      }

      this.inFlightPromise = null;
      return {
        configured: true,
        events: curatedCricket
      };
    })();

    return this.inFlightPromise;
  }

  /**
   * Fetch Team Players Squad from RapidAPI
   */
  async getTeamPlayers(teamId) {
    if (!teamId) return [];
    try {
      const rapidKey = this.getRapidApiKey();
      const query = rapidKey ? `?teamid=${encodeURIComponent(teamId)}&rapidapikey=${encodeURIComponent(rapidKey)}` : `?teamid=${encodeURIComponent(teamId)}`;
      const res = await fetch(`/api/cricket/players${query}`, {
        headers: rapidKey ? { 'x-rapidapi-key': rapidKey } : {}
      });
      if (res.ok) {
        const json = await res.json();
        return Array.isArray(json.response) ? json.response : [];
      }
    } catch (e) {
      console.warn('[CricketEngine] Failed to fetch team players:', e);
    }
    return [];
  }

  /**
   * Fetch Cricket Teams list
   */
  async getTeams() {
    try {
      const rapidKey = this.getRapidApiKey();
      const query = rapidKey ? `?rapidapikey=${encodeURIComponent(rapidKey)}` : '';
      const res = await fetch(`/api/cricket/teams${query}`, {
        headers: rapidKey ? { 'x-rapidapi-key': rapidKey } : {}
      });
      if (res.ok) {
        const json = await res.json();
        return Array.isArray(json.response) ? json.response : [];
      }
    } catch (e) {
      console.warn('[CricketEngine] Failed to fetch teams:', e);
    }
    return [];
  }

  /**
   * Helper to map Team Name to RapidAPI Team ID
   */
  getTeamIdByName(name) {
    if (!name || typeof name !== 'string') return null;
    const n = name.toLowerCase().trim();
    const map = {
      'india': '2', 'ind': '2',
      'pakistan': '3', 'pak': '3',
      'australia': '4', 'aus': '4',
      'sri lanka': '5', 'sl': '5',
      'bangladesh': '6', 'ban': '6',
      'england': '9', 'eng': '9',
      'west indies': '10', 'wi': '10',
      'south africa': '11', 'sa': '11', 'rsa': '11',
      'new zealand': '13', 'nz': '13',
      'zimbabwe': '12', 'zim': '12',
      'afghanistan': '96', 'afg': '96',
      'ireland': '27', 'ire': '27',
      'scotland': '24', 'scot': '24',
      'netherlands': '23', 'ned': '23'
    };

    for (const [key, id] of Object.entries(map)) {
      if (n === key || n.includes(key)) return id;
    }
    return null;
  }

  /**
   * Fetch Detailed Scorecard & Team Squads
   */
  async getMatchDetails(matchId) {
    if (!matchId) return null;
    const cleanId = String(matchId).replace(/^cr-/, '').replace(/^rapid-/, '');

    if (this.detailsCache.has(cleanId)) {
      return this.detailsCache.get(cleanId);
    }

    let detailed = null;
    const res = await this.fetchFromApi(`/match_info?id=${cleanId}`);
    if (res.success && res.data) {
      detailed = this.normalizeMatch(res.data);
    }

    // If matching from local events list:
    if (!detailed && this.cache.data.length > 0) {
      const match = this.cache.data.find(e => e.id === matchId || e.rawId == cleanId || e.matchId == cleanId);
      if (match) detailed = { ...match };
    }

    if (detailed) {
      // Load squad players for teams if available
      const t1Id = detailed.team1?.teamId || this.getTeamIdByName(detailed.team1?.name);
      const t2Id = detailed.team2?.teamId || this.getTeamIdByName(detailed.team2?.name);

      const [p1, p2] = await Promise.all([
        t1Id ? this.getTeamPlayers(t1Id) : Promise.resolve([]),
        t2Id ? this.getTeamPlayers(t2Id) : Promise.resolve([]),
      ]);

      if (p1.length > 0) detailed.team1.players = p1;
      if (p2.length > 0) detailed.team2.players = p2;

      this.detailsCache.set(cleanId, detailed);
      return detailed;
    }

    return null;
  }

  /**
   * Test RapidAPI Cricket Key validity
   */
  async testApiKey(key, host = 'cricbuzz-cricket2.p.rapidapi.com') {
    if (!key) return { valid: false, message: 'Please enter a RapidAPI key' };
    try {
      const res = await fetch(`/api/cricket/test?key=${encodeURIComponent(key)}&host=${encodeURIComponent(host)}`);
      if (res.ok) {
        return await res.json();
      }
      return { valid: false, message: `Server returned HTTP ${res.status}` };
    } catch (e) {
      return { valid: false, message: e.message || 'Connection failed' };
    }
  }
}

window.CricketEngine = CricketEngine;
window.cricketEngine = new CricketEngine();
