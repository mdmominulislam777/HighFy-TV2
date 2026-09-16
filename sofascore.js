/**
 * HIGHFY TV - SofaScore RapidAPI Engine (sofascore.js)
 * Live Scores, Fixtures, Lineups & Multi-Sport Data from RapidAPI SofaScore.
 * RapidAPI Documentation: https://rapidapi.com/search/sofascore
 */

(() => {
  'use strict';

  class SofaScoreEngine {
    constructor() {
      this.storageKey = 'highfy_sofascore_key';
      this.hostStorageKey = 'highfy_sofascore_host';
      this.cacheKey = 'highfy_cache_sofascore';
      this.defaultHost = 'sofascore.p.rapidapi.com';
      this.cache = {
        timestamp: 0,
        ttl: 60 * 1000, // 60 seconds TTL
        data: []
      };
      this.inFlightPromise = null;
      this.loadLocalCache();
    }

    loadLocalCache() {
      try {
        const stored = localStorage.getItem(this.cacheKey);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && Array.isArray(parsed.events) && (Date.now() - parsed.timestamp < 5 * 60 * 1000)) {
            this.cache.data = parsed.events;
            this.cache.timestamp = parsed.timestamp;
          }
        }
      } catch (e) {}
    }

    saveLocalCache(events, timestamp) {
      try {
        localStorage.setItem(this.cacheKey, JSON.stringify({
          timestamp: timestamp || Date.now(),
          events: events || []
        }));
      } catch (e) {}
    }

    getApiKey() {
      try {
        const stored = localStorage.getItem(this.storageKey);
        if (stored && stored.trim()) {
          return stored.trim();
        }
      } catch (e) {}
      return window.CONFIG?.SOFASCORE_API_KEY || window.CONFIG?.RAPIDAPI_KEY || '';
    }

    getHost() {
      try {
        const stored = localStorage.getItem(this.hostStorageKey);
        if (stored && stored.trim()) {
          const trimmed = stored.trim();
          if (trimmed.includes('.') && trimmed.length <= 40 && !trimmed.includes('msh95f4')) {
            return trimmed;
          }
        }
      } catch (e) {}
      const cfgHost = window.CONFIG?.SOFASCORE_RAPIDAPI_HOST;
      if (cfgHost && cfgHost.includes('.') && cfgHost.length <= 40 && !cfgHost.includes('msh95f4')) {
        return cfgHost;
      }
      return this.defaultHost || 'sofascore.p.rapidapi.com';
    }

    saveKey(key, host) {
      try {
        if (key && key.trim()) {
          localStorage.setItem(this.storageKey, key.trim());
          if (window.CONFIG) window.CONFIG.SOFASCORE_API_KEY = key.trim();
        }
        if (host && host.trim()) {
          localStorage.setItem(this.hostStorageKey, host.trim());
          if (window.CONFIG) window.CONFIG.SOFASCORE_RAPIDAPI_HOST = host.trim();
        }
      } catch (e) {}
    }

    clearKey() {
      try {
        localStorage.removeItem(this.storageKey);
        localStorage.removeItem(this.hostStorageKey);
        localStorage.removeItem(this.cacheKey);
      } catch (e) {}
      this.cache = { timestamp: 0, ttl: 30000, data: [] };
      if (window.CONFIG) {
        window.CONFIG.SOFASCORE_API_KEY = '';
      }
    }

    async testApiKey(customKey, customHost) {
      const key = (customKey || this.getApiKey() || '').trim();
      const host = (customHost || this.getHost() || this.defaultHost).trim();

      if (!key) {
        return { valid: false, message: 'Please enter a RapidAPI SofaScore key first.' };
      }

      try {
        const url = `/api/sofascore/test?key=${encodeURIComponent(key)}&host=${encodeURIComponent(host)}`;
        const res = await fetch(url);
        const data = await res.json();

        if (res.ok && data && data.valid) {
          return {
            valid: true,
            message: data.message || 'RapidAPI SofaScore key is valid and connected!'
          };
        } else {
          return {
            valid: false,
            message: data?.message || data?.error || 'Failed to authenticate with RapidAPI SofaScore.'
          };
        }
      } catch (err) {
        return {
          valid: false,
          message: `Connection error: ${err.message || 'Unable to contact proxy'}`
        };
      }
    }

    async getAllMatches(forceRefresh = false) {
      const apiKey = this.getApiKey();
      if (!apiKey) {
        return { configured: false, events: [] };
      }

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
        try {
          const host = this.getHost();
          const url = `/api/sofascore/matches?key=${encodeURIComponent(apiKey)}&host=${encodeURIComponent(host)}`;
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(`SofaScore API returned status ${response.status}`);
          }
          const json = await response.json();
          const events = Array.isArray(json?.data) ? json.data : [];

          this.cache.data = events;
          this.cache.timestamp = Date.now();
          this.saveLocalCache(events, this.cache.timestamp);

          return {
            configured: true,
            events: events
          };
        } catch (err) {
          console.warn('[SofaScoreEngine] Failed to load matches:', err.message);
          return {
            configured: true,
            error: err.message,
            events: this.cache.data || []
          };
        } finally {
          this.inFlightPromise = null;
        }
      })();

      return this.inFlightPromise;
    }

    async getH2HEvents(customId) {
      const apiKey = this.getApiKey();
      const host = this.getHost();
      const url = `/api/sofascore/h2h?customId=${encodeURIComponent(customId || '')}&key=${encodeURIComponent(apiKey)}&host=${encodeURIComponent(host)}`;
      try {
        const res = await fetch(url);
        if (!res.ok) return { events: [] };
        const data = await res.json();
        return data;
      } catch (e) {
        return { events: [] };
      }
    }

    async getSportsList(countryCode = 'GB', forceRefresh = false) {
      const apiKey = this.getApiKey();
      const host = this.getHost();
      const code = (countryCode || 'GB').trim().toUpperCase();
      const cacheKey = `sofascore_sports_list_${code}`;
      const now = Date.now();

      if (!forceRefresh) {
        try {
          const cached = sessionStorage.getItem(cacheKey);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed && (now - parsed.timestamp < 15 * 60 * 1000)) {
              return parsed.data;
            }
          }
        } catch (e) {}
      }

      const url = `/api/sofascore/sports/list?countryCode=${encodeURIComponent(code)}&key=${encodeURIComponent(apiKey)}&host=${encodeURIComponent(host)}`;
      try {
        const res = await fetch(url);
        if (!res.ok) {
          // Fallback to proxy
          const proxyUrl = `/api/sofascore/proxy?path=${encodeURIComponent(`/sports/list?countryCode=${code}`)}&key=${encodeURIComponent(apiKey)}&host=${encodeURIComponent(host)}`;
          const pRes = await fetch(proxyUrl);
          if (!pRes.ok) return { status: 'error', sports: [], countrySportPriorities: [] };
          const pData = await pRes.json();
          return pData;
        }
        const data = await res.json();
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify({ timestamp: now, data }));
        } catch (e) {}
        return data;
      } catch (e) {
        return { status: 'error', error: e.message, sports: [], countrySportPriorities: [] };
      }
    }
  }

  window.sofascoreEngine = new SofaScoreEngine();
  window.SofaScore = window.sofascoreEngine;
})();
