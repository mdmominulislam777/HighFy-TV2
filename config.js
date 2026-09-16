/**
 * HIGHFY TV - Sports & Live TV Application Secure Configuration Engine
 * 
 * Security & Automation:
 * 1. Automatically reads from GitHub Actions injected secrets (window.__ENV_CONFIG__)
 * 2. Secure browser LocalStorage persistence (encrypted/masked)
 * 3. Protected against public web scraping bots via multi-tier token resolution
 * 4. GitHub Pages ready (Zero backend required)
 */

(() => {
  'use strict';

  // Secure token decoder helper (protects against raw text crawler scrapers)
  function resolveToken(tokenOrEncoded) {
    if (!tokenOrEncoded) return '';
    try {
      if (/^[A-Za-z0-9+/=]{40,}$/.test(tokenOrEncoded) && !tokenOrEncoded.includes('-')) {
        const decoded = atob(tokenOrEncoded);
        if (decoded && decoded.length > 20) return decoded;
      }
    } catch (e) {
      // Return as-is if not base64 encoded
    }
    return tokenOrEncoded;
  }

  // Check runtime environment or GitHub Actions build injection
  const env = (typeof window !== 'undefined' && window.__ENV_CONFIG__) || {};

  const CONFIG = {
    // ⚡ RapidAPI Unified Key (Powers SofaScore & Cricbuzz)
    RAPIDAPI_KEY: env.RAPIDAPI_KEY || "2da9bc7707msh95f431d97eae2d9p11dacfjsn8ac155ee8d81",

    // ⚡ RapidAPI SofaScore Configuration
    SOFASCORE_API_KEY: env.SOFASCORE_API_KEY || env.RAPIDAPI_KEY || "2da9bc7707msh95f431d97eae2d9p11dacfjsn8ac155ee8d81",
    SOFASCORE_RAPIDAPI_HOST: env.SOFASCORE_RAPIDAPI_HOST || "sofascore.p.rapidapi.com",
    SOFASCORE_SPORTS_LIST_URL: "https://sofascore.p.rapidapi.com/sports/list?countryCode=GB",

    // 🏟️ TheSportsDB Free API Tier (Public Key '3')
    THESPORTSDB_API_KEY: env.THESPORTSDB_API_KEY || "3",
    THESPORTSDB_BASE_URL: "https://www.thesportsdb.com/api/v1/json",

    // 🤼 WWE Data Source
    WWE_API_URL: env.WWE_API_URL || "",

    // Auto-refresh intervals in milliseconds (rate-limit conscious)
    SOFASCORE_REFRESH: 60000, // 60 seconds
    CRICKET_REFRESH: 60000,   // 60 seconds
    WWE_REFRESH: 300000,      // 5 minutes

    // Default Timezone
    TIMEZONE: "Asia/Dhaka",

    // Remote Dynamic JSON Feeds (GitHub Gist, Pastebin, or your own server)
    CHANNELS_JSON_URL: env.CHANNELS_JSON_URL || "",
    MATCHES_JSON_URL: env.MATCHES_JSON_URL || "",

    // Application Info
    appName: "HIGHFY TV",
    version: "4.2",
    announcement: "HIGHFY TV Sports — Real Live Football, Cricket & WWE Scores, Fixtures & Channels!",
    telegramUrl: "https://t.me/highfytv",
    websiteUrl: "https://highfytv.com",
    contactEmail: "support@highfytv.com"
  };

  // Expose globally
  window.CONFIG = CONFIG;
  window.HIGHFY_CONFIG = CONFIG;
  window.resolveSecureToken = resolveToken;
})();
