import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { Readable } from "stream";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

dotenv.config();

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || process.env.SOFASCORE_API_KEY || "2da9bc7707msh95f431d97eae2d9p11dacfjsn8ac155ee8d81";
const DEFAULT_CRICKET_HOST = "cricbuzz-cricket2.p.rapidapi.com";

function sanitizeCricbuzzHost(h?: any): string {
  const str = typeof h === "string" ? h : Array.isArray(h) ? String(h[0] || "") : "";
  if (!str) return DEFAULT_CRICKET_HOST;
  const trimmed = str.trim();
  if (!trimmed.includes(".") || trimmed.length > 40 || trimmed.includes("msh95f4") || trimmed.length === 50 || !trimmed.includes("rapidapi.com")) {
    return DEFAULT_CRICKET_HOST;
  }
  return trimmed;
}

const RAPIDAPI_CRICKET_HOST = sanitizeCricbuzzHost(process.env.CRICBUZZ_RAPIDAPI_HOST);
const THESPORTSDB_KEY = process.env.THESPORTSDB_API_KEY || "3";
const THESPORTSDB_BASE = `https://www.thesportsdb.com/api/v1/json/${THESPORTSDB_KEY}`;
const SOFASCORE_RAPIDAPI_HOST = "sofascore.p.rapidapi.com";
const SOFASCORE_API_KEY = RAPIDAPI_KEY;

function sanitizeSofaScoreHost(h?: any): string {
  const str = typeof h === "string" ? h : Array.isArray(h) ? String(h[0] || "") : "";
  if (!str) return SOFASCORE_RAPIDAPI_HOST;
  const trimmed = str.trim();
  if (!trimmed.includes(".") || trimmed.length > 40 || trimmed.includes("msh95f4") || trimmed.length === 50) {
    return SOFASCORE_RAPIDAPI_HOST;
  }
  return trimmed;
}

const envSrKey = (process.env.SPORTRADAR_CRICKET_API_KEY || "").trim();
const envSrTierRaw = (process.env.SPORTRADAR_CRICKET_TIER || "").trim();

function isLikelyApiKey(val: string): boolean {
  return typeof val === "string" && val.length >= 16;
}

function sanitizeSportradarTier(t?: any): string {
  let str = typeof t === "string" ? t.trim().toLowerCase() : "";
  if (!str && envSrTierRaw && !isLikelyApiKey(envSrTierRaw)) {
    str = envSrTierRaw.toLowerCase();
  }
  str = str.replace(/^cricket-/, "");
  // If tier was set to an API key or an invalid string, default to "t2"
  if (!str || isLikelyApiKey(str) || str.length > 8) {
    return "t2";
  }
  return str;
}

const SPORTRADAR_CRICKET_API_KEY = envSrKey || (isLikelyApiKey(envSrTierRaw) ? envSrTierRaw : "");
const SPORTRADAR_CRICKET_TIER = sanitizeSportradarTier(envSrTierRaw);

// Cricbuzz API toggle: Active by default for real-time live scores, upcoming matches & scorecards
const ENABLE_CRICBUZZ_API = process.env.ENABLE_CRICBUZZ_API !== "false"; // Default: true (active)

// In-memory cache & In-flight request coalescers to preserve API quota
interface CacheEntry<T> {
  timestamp: number;
  data: T;
}

// In-flight promise coalescers (Prevents duplicate parallel requests to upstream APIs)
const inFlightPromises = {
  rapidSchedule: null as Promise<any> | null,
  rapidTeams: null as Promise<any[]> | null,
  rapidCricketMatches: null as Promise<any[]> | null,
  sportradarCricketMatches: null as Promise<any[]> | null,
  sportsDbEvents: null as Promise<any[]> | null,
  sofaScoreMatches: null as Promise<any> | null,
  sportsProxy: new Map<string, Promise<any>>(),
};

const rapidCache = {
  schedule: null as CacheEntry<any> | null,
  teams: null as CacheEntry<any> | null,
  players: new Map<string, CacheEntry<any>>(),
  matches: null as CacheEntry<any[]> | null,
  TTL_SCHEDULE_NORMAL: 20 * 60 * 1000, // 20 minutes for general cricket schedule
  TTL_SCHEDULE_LIVE: 3 * 60 * 1000,    // 3 minutes when live matches are active
  TTL_STATIC: 12 * 60 * 60 * 1000,      // 12 hours for static teams and player squads
};

const sofaScoreCache = {
  matches: null as CacheEntry<any[]> | null,
  proxy: new Map<string, CacheEntry<any>>(),
  TTL_MATCHES: 60 * 1000, // 1 minute for live matches/fixtures
  TTL_PROXY: 45 * 1000,   // 45 seconds for proxy queries
};

const sportsDbCache = {
  events: null as CacheEntry<any[]> | null,
  leagues: new Map<string, CacheEntry<any>>(),
  details: new Map<string, CacheEntry<any>>(),
  TTL_EVENTS: 20 * 60 * 1000, // 20 minutes for curated events index
  TTL_LEAGUES: 30 * 60 * 1000, // 30 minutes for league fixtures
  TTL_DETAILS: 30 * 60 * 1000, // 30 minutes for event details
};

const sportradarCache = {
  matches: null as CacheEntry<any[]> | null,
  tournaments: null as CacheEntry<any> | null,
  dailySummaries: new Map<string, CacheEntry<any>>(),
  proxy: new Map<string, CacheEntry<any>>(),
  TTL_LIVE: 45 * 1000,        // 45 seconds for live summaries
  TTL_SCHEDULE: 5 * 60 * 1000, // 5 minutes for daily schedule
  TTL_STATIC: 30 * 60 * 1000,  // 30 minutes for tournaments
};

// ============================================================================
// HIGHFY TV ANTI-SNIFF & REQABLE SECURITY SYSTEM
// ============================================================================
const STREAM_SECURITY_KEY = crypto
  .createHash("sha256")
  .update(process.env.STREAM_SECRET || "highfy-anti-sniff-stream-guard-2026-secure-token")
  .digest();

// AES-256-GCM token encryption with timestamp payload to prevent permanent replay attacks
function encryptStreamUrl(url: string): string {
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", STREAM_SECURITY_KEY, iv);
    // Payload: timestamp + delimiter + url (allows dynamic token expiration)
    const payload = `${Date.now()}||${url}`;
    let enc = cipher.update(payload, "utf8", "base64url");
    enc += cipher.final("base64url");
    const tag = cipher.getAuthTag().toString("base64url");
    return `${iv.toString("base64url")}.${tag}.${enc}`;
  } catch (err: any) {
    return Buffer.from(url).toString("base64url");
  }
}

function decryptStreamUrl(token: string): string | null {
  try {
    const trimmed = token.trim();
    const parts = trimmed.split(".");
    if (parts.length === 3) {
      const iv = Buffer.from(parts[0], "base64url");
      const tag = Buffer.from(parts[1], "base64url");
      const enc = parts[2];
      const decipher = crypto.createDecipheriv("aes-256-gcm", STREAM_SECURITY_KEY, iv);
      decipher.setAuthTag(tag);
      let dec = decipher.update(enc, "base64url", "utf8");
      dec += decipher.final("utf8");

      // Check timestamped payload format: timestamp||url
      if (dec.includes("||")) {
        const separatorIdx = dec.indexOf("||");
        const ts = parseInt(dec.slice(0, separatorIdx), 10);
        const url = dec.slice(separatorIdx + 2);
        // Tokens are valid for up to 6 hours (renewable continuously by the active player)
        if (!isNaN(ts) && (Date.now() - ts < 6 * 60 * 60 * 1000) && /^https?:\/\//i.test(url)) {
          return url;
        }
      }

      // Legacy direct URL format inside GCM
      if (/^https?:\/\//i.test(dec)) {
        return dec;
      }
    }

    // Fallback: standard base64url decode
    const buf = Buffer.from(trimmed, "base64url").toString("utf8");
    if (/^https?:\/\//i.test(buf)) return buf;
    return null;
  } catch {
    return null;
  }
}

function isReqableOrSnifferThreat(req: express.Request): { detected: boolean; reason: string } {
  const userAgent = (req.headers["user-agent"] || "").toLowerCase();
  const rawHeaders = JSON.stringify(req.headers).toLowerCase();

  // 1. Packet Sniffers & Reverse Engineering Tools
  if (userAgent.includes("reqable") || rawHeaders.includes("reqable")) {
    return { detected: true, reason: "Reqable network sniffer detected" };
  }
  if (userAgent.includes("charles") || rawHeaders.includes("charlesproxy")) {
    return { detected: true, reason: "Charles proxy detected" };
  }
  if (userAgent.includes("fiddler") || rawHeaders.includes("fiddler")) {
    return { detected: true, reason: "Fiddler sniffer detected" };
  }
  if (userAgent.includes("http toolkit") || rawHeaders.includes("httptoolkit")) {
    return { detected: true, reason: "HTTP Toolkit detected" };
  }
  if (userAgent.includes("burp") || rawHeaders.includes("burpcollaborator") || rawHeaders.includes("x-burp")) {
    return { detected: true, reason: "Burp Suite detected" };
  }
  if (userAgent.includes("wireshark") || rawHeaders.includes("wireshark")) {
    return { detected: true, reason: "Wireshark traffic capture detected" };
  }
  if (userAgent.includes("mitmproxy") || rawHeaders.includes("mitmproxy")) {
    return { detected: true, reason: "mitmproxy interceptor detected" };
  }

  // 2. Command-Line Scraping & Downloading Bots (unless explicitly internal or authorized)
  if (
    userAgent.startsWith("curl/") ||
    userAgent.startsWith("wget/") ||
    userAgent.includes("python-requests") ||
    userAgent.includes("aiohttp") ||
    userAgent.includes("scrapy") ||
    userAgent.includes("postmanruntime")
  ) {
    return { detected: true, reason: "Automated scraper tool detected" };
  }

  // 3. Known Proxy & Sniffer Specific Injected Headers
  if (
    req.headers["x-reqable-proxy"] ||
    req.headers["reqable-client"] ||
    req.headers["reqable-version"] ||
    req.headers["x-mitmproxy"] ||
    req.headers["x-charles-proxy"] ||
    req.headers["x-packet-sniffer"]
  ) {
    return { detected: true, reason: "Proxy sniffer injected headers detected" };
  }

  return { detected: false, reason: "" };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // 1. Configure Trust Proxy for Reverse Proxies (Cloud Run / Nginx)
  app.set("trust proxy", 1);

  // 2. Hide sensitive server fingerprint headers
  app.disable("x-powered-by");

  // 3. Helmet Security Headers (Content-Security-Policy tailored for video streaming, iframe players & assets)
  app.use(
    helmet({
      contentSecurityPolicy: false, // Allows flexible video stream CDN embeds (HLS/m3u8/iframes)
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
      crossOriginOpenerPolicy: false,
      frameguard: false, // Allows safe AI Studio iframe preview
    })
  );

  // 4. Global API Rate Limiter (Protects against DDoS, Brute Force & Scraping Attacks)
  const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute window
    max: 120, // max 120 requests per IP per minute
    standardHeaders: true,
    legacyHeaders: false,
    validate: {
      trustProxy: false,
      xForwardedForHeader: false,
      forwardedHeader: false,
    },
    message: { error: "Too many requests, please try again later." },
  });
  app.use("/api/", apiLimiter);

  // 5. CORS Protection & JSON Body parsing with strict payload limit
  app.use(cors());
  app.use(express.json({ limit: "100kb" }));

  // 6. Anti-Reqable & Anti-Sniffer Network Firewall Middleware
  app.use((req, res, next) => {
    // Permit threat verification check endpoint to report status to client
    if (req.path === "/api/security/check-threat") {
      return next();
    }

    const threat = isReqableOrSnifferThreat(req);
    if (threat.detected) {
      console.warn(`[HighFy Security] Blocked sniffer threat (${threat.reason}) from IP: ${req.ip}`);
      return res.status(403).json({
        status: "error",
        blocked: true,
        code: "REQABLE_DETECTED",
        threat: threat.reason,
        message: "reqable আনইস্টল করো",
        detail: "নিরাপত্তা সতর্কতা: আপনার ডিভাইসে Reqable বা নেটওয়ার্ক স্নিফিং অ্যাপ সনাক্ত করা হয়েছে। হাইফাই টিভি ব্যবহার করতে এটি আনইন্সটল করুন।"
      });
    }
    next();
  });

  // Client Threat & Reqable Verification Endpoint
  app.get("/api/security/check-threat", (req, res) => {
    const threat = isReqableOrSnifferThreat(req);
    res.json({
      status: "success",
      blocked: threat.detected,
      threat: threat.reason || null,
      message: threat.detected ? "reqable আনইস্টল করো" : "clear",
      timestamp: Date.now()
    });
  });

  // Stream URL Protection / Encryption Endpoint
  app.get("/api/security/protect-stream", (req, res) => {
    try {
      const rawUrl = typeof req.query.url === "string" ? req.query.url.trim() : "";
      if (!rawUrl || !/^https?:\/\//i.test(rawUrl)) {
        return res.status(400).json({ status: "error", message: "Invalid stream URL" });
      }
      const token = encryptStreamUrl(rawUrl);
      return res.json({
        status: "success",
        token,
        proxyUrl: `/api/stream-proxy?token=${token}`
      });
    } catch (err: any) {
      return res.status(500).json({ status: "error", message: err.message });
    }
  });

  // Sanitize path parameter helper to prevent path traversal
  const sanitizePath = (p: string): string => {
    return p.replace(/(\.\.[\/\\])+/g, "").replace(/^\/+/, "");
  };

  // Helper: Fetch and cache Cricbuzz Cricket Teams (Single-Flight Promise Coalescer)
  async function fetchRapidTeams(customKey?: string): Promise<any[]> {
    if (!ENABLE_CRICBUZZ_API) return [];
    const activeKey = (customKey && customKey.trim()) ? customKey.trim() : RAPIDAPI_KEY;
    const now = Date.now();
    if (rapidCache.teams && (now - rapidCache.teams.timestamp < rapidCache.TTL_STATIC)) {
      return rapidCache.teams.data;
    }
    if (inFlightPromises.rapidTeams) {
      return inFlightPromises.rapidTeams;
    }

    inFlightPromises.rapidTeams = (async () => {
      try {
        const response = await fetch(`https://${RAPIDAPI_CRICKET_HOST}/teams/v1/international`, {
          headers: {
            "x-rapidapi-host": RAPIDAPI_CRICKET_HOST,
            "x-rapidapi-key": activeKey,
          },
        });
        if (response.ok) {
          const json = await response.json();
          const teams = Array.isArray(json.list) ? json.list : (Array.isArray(json.teams) ? json.teams : (Array.isArray(json.response) ? json.response : []));
          rapidCache.teams = { timestamp: Date.now(), data: teams };
          return teams;
        }
      } catch (e: any) {
        console.warn("[Backend Proxy] RapidAPI teams fetch error:", e.message);
      } finally {
        inFlightPromises.rapidTeams = null;
      }
      return rapidCache.teams?.data || [];
    })();

    return inFlightPromises.rapidTeams;
  }

  // Helper: Fetch and cache Cricbuzz Cricket Schedule (Single-Flight Promise Coalescer & Adaptive TTL)
  async function fetchRapidSchedule(customKey?: string): Promise<any> {
    if (!ENABLE_CRICBUZZ_API) return null;
    const activeKey = (customKey && customKey.trim()) ? customKey.trim() : RAPIDAPI_KEY;
    const now = Date.now();
    const currentTtl = rapidCache.TTL_SCHEDULE_NORMAL;
    if (rapidCache.schedule && (now - rapidCache.schedule.timestamp < currentTtl)) {
      return rapidCache.schedule.data;
    }
    if (inFlightPromises.rapidSchedule) {
      return inFlightPromises.rapidSchedule;
    }

    inFlightPromises.rapidSchedule = (async () => {
      try {
        const response = await fetch(`https://${RAPIDAPI_CRICKET_HOST}/matches/v1/upcoming`, {
          headers: {
            "x-rapidapi-host": RAPIDAPI_CRICKET_HOST,
            "x-rapidapi-key": activeKey,
          },
        });
        if (response.ok) {
          const json = await response.json();
          rapidCache.schedule = { timestamp: Date.now(), data: json };
          return json;
        }
      } catch (e: any) {
        console.warn("[Backend Proxy] RapidAPI schedule fetch error:", e.message);
      } finally {
        inFlightPromises.rapidSchedule = null;
      }
      return rapidCache.schedule?.data || null;
    })();

    return inFlightPromises.rapidSchedule;
  }

  // Helper: Transform RapidAPI Schedule into Normalized Match Events (Cached & Coalesced)
  // Universal Bangladesh (Asia/Dhaka BST) Event Date & Time Formatter
  function formatDhakaEventTime(timestamp: number): string {
    try {
      const dateObj = new Date(timestamp);
      const now = new Date();
      const tz = "Asia/Dhaka";
      const timeStr = dateObj.toLocaleTimeString("en-US", {
        timeZone: tz,
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
      const hourFormatter = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hour: "numeric",
        hour12: false,
      });
      const dateFormatter = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        weekday: "short",
        day: "numeric",
        month: "short",
      });
      const dateLocalFmt = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      const evComp = dateLocalFmt.format(dateObj);
      const todayComp = dateLocalFmt.format(now);

      const evHour = parseInt(hourFormatter.format(dateObj), 10);
      const nowHour = parseInt(hourFormatter.format(now), 10);

      const [evY, evM, evD] = evComp.split(/[-/]/).map(Number);
      const [nowY, nowM, nowD] = todayComp.split(/[-/]/).map(Number);
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
      return new Date(timestamp).toLocaleTimeString("en-US", { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit", hour12: true }) + " BST";
    }
  }

  const HD_CRICKET_LOGOS_MAP: Record<string, string> = {
    "india": "https://flagcdn.com/w320/in.png",
    "ind": "https://flagcdn.com/w320/in.png",
    "bangladesh": "https://flagcdn.com/w320/bd.png",
    "ban": "https://flagcdn.com/w320/bd.png",
    "pakistan": "https://flagcdn.com/w320/pk.png",
    "pak": "https://flagcdn.com/w320/pk.png",
    "england": "https://flagcdn.com/w320/gb-eng.png",
    "eng": "https://flagcdn.com/w320/gb-eng.png",
    "australia": "https://flagcdn.com/w320/au.png",
    "aus": "https://flagcdn.com/w320/au.png",
    "sri lanka": "https://flagcdn.com/w320/lk.png",
    "sl": "https://flagcdn.com/w320/lk.png",
    "south africa": "https://flagcdn.com/w320/za.png",
    "sa": "https://flagcdn.com/w320/za.png",
    "new zealand": "https://flagcdn.com/w320/nz.png",
    "nz": "https://flagcdn.com/w320/nz.png",
    "west indies": "https://static.cricbuzz.com/a/img/v1/300x300/i1/c170818/west-indies.jpg",
    "wi": "https://static.cricbuzz.com/a/img/v1/300x300/i1/c170818/west-indies.jpg",
    "afghanistan": "https://flagcdn.com/w320/af.png",
    "afg": "https://flagcdn.com/w320/af.png",
    "ireland": "https://flagcdn.com/w320/ie.png",
    "scotland": "https://flagcdn.com/w320/gb-sct.png",
    "netherlands": "https://flagcdn.com/w320/nl.png",
    "zimbabwe": "https://flagcdn.com/w320/zw.png",
    "nepal": "https://flagcdn.com/w320/np.png",
    "usa": "https://flagcdn.com/w320/us.png",
    "canada": "https://flagcdn.com/w320/ca.png",
    "uae": "https://flagcdn.com/w320/ae.png",
    "chennai super kings": "https://static.cricbuzz.com/a/img/v1/300x300/i1/c170823/chennai-super-kings.jpg",
    "csk": "https://static.cricbuzz.com/a/img/v1/300x300/i1/c170823/chennai-super-kings.jpg",
    "mumbai indians": "https://static.cricbuzz.com/a/img/v1/300x300/i1/c170829/mumbai-indians.jpg",
    "mi": "https://static.cricbuzz.com/a/img/v1/300x300/i1/c170829/mumbai-indians.jpg",
    "royal challengers bengaluru": "https://static.cricbuzz.com/a/img/v1/300x300/i1/c170826/royal-challengers-bangalore.jpg",
    "royal challengers bangalore": "https://static.cricbuzz.com/a/img/v1/300x300/i1/c170826/royal-challengers-bangalore.jpg",
    "rcb": "https://static.cricbuzz.com/a/img/v1/300x300/i1/c170826/royal-challengers-bangalore.jpg",
    "kolkata knight riders": "https://static.cricbuzz.com/a/img/v1/300x300/i1/c170827/kolkata-knight-riders.jpg",
    "kkr": "https://static.cricbuzz.com/a/img/v1/300x300/i1/c170827/kolkata-knight-riders.jpg",
    "delhi capitals": "https://static.cricbuzz.com/a/img/v1/300x300/i1/c170828/delhi-capitals.jpg",
    "dc": "https://static.cricbuzz.com/a/img/v1/300x300/i1/c170828/delhi-capitals.jpg",
    "rajasthan royals": "https://static.cricbuzz.com/a/img/v1/300x300/i1/c170831/rajasthan-royals.jpg",
    "rr": "https://static.cricbuzz.com/a/img/v1/300x300/i1/c170831/rajasthan-royals.jpg",
    "sunrisers hyderabad": "https://static.cricbuzz.com/a/img/v1/300x300/i1/c170830/sunrisers-hyderabad.jpg",
    "srh": "https://static.cricbuzz.com/a/img/v1/300x300/i1/c170830/sunrisers-hyderabad.jpg",
    "gujarat titans": "https://static.cricbuzz.com/a/img/v1/300x300/i1/c225642/gujarat-titans.jpg",
    "gt": "https://static.cricbuzz.com/a/img/v1/300x300/i1/c225642/gujarat-titans.jpg",
    "lucknow super giants": "https://static.cricbuzz.com/a/img/v1/300x300/i1/c225645/lucknow-super-giants.jpg",
    "lsg": "https://static.cricbuzz.com/a/img/v1/300x300/i1/c225645/lucknow-super-giants.jpg",
    "punjab kings": "https://static.cricbuzz.com/a/img/v1/300x300/i1/c170824/punjab-kings.jpg",
    "pbks": "https://static.cricbuzz.com/a/img/v1/300x300/i1/c170824/punjab-kings.jpg"
  };

  function resolveHDTeamLogo(teamName: string, rawLogo?: string): string {
    // 1. HIGHEST PRIORITY: If authentic original team logo is provided by feed/API, preserve and upgrade it!
    if (rawLogo && typeof rawLogo === "string") {
      let clean = rawLogo.trim();
      if (clean && !clean.includes("un.png") && !clean.includes("placeholder") && !clean.includes("default-team")) {
        if (clean.includes("cricbuzz.com") && clean.includes("/72x54/")) {
          clean = clean.replace("/72x54/", "/300x300/");
        }
        if (clean.includes("flagcdn.com/w160/")) {
          clean = clean.replace("/w160/", "/w320/");
        }
        if (clean.startsWith("http://static.cricbuzz.com")) {
          clean = clean.replace("http://", "https://");
        }
        return clean;
      }
    }

    if (!teamName) return "https://flagcdn.com/w320/un.png";
    const tLower = teamName.toLowerCase().trim();

    // 2. Exact match in curated database
    if (HD_CRICKET_LOGOS_MAP[tLower]) {
      return HD_CRICKET_LOGOS_MAP[tLower];
    }

    // 3. Match abbreviations (<= 3 chars) only as exact whole words, full names with substring
    for (const [k, v] of Object.entries(HD_CRICKET_LOGOS_MAP)) {
      if (k.length <= 3) {
        const regex = new RegExp(`(^|\\b|\\s)${k}(\\b|\\s|$)`, "i");
        if (regex.test(tLower)) {
          return v;
        }
      } else {
        if (tLower === k || tLower.includes(k) || k.includes(tLower)) {
          return v;
        }
      }
    }

    return "https://flagcdn.com/w320/un.png";
  }

  // Helper: Format team score from Cricbuzz matchScore
  function formatCricbuzzScore(scoreObj: any): { score: string; overs: string } {
    if (!scoreObj) return { score: "", overs: "" };
    const inngs = scoreObj.inngs2 || scoreObj.inngs1;
    if (!inngs) return { score: "", overs: "" };
    let score = `${inngs.runs || 0}/${inngs.wickets !== undefined ? inngs.wickets : 0}`;
    if (scoreObj.inngs2 && scoreObj.inngs1) {
      score = `${scoreObj.inngs1.runs || 0}/${scoreObj.inngs1.wickets !== undefined ? scoreObj.inngs1.wickets : 0} & ${score}`;
    }
    const overs = inngs.overs ? `${inngs.overs} ov` : "";
    return { score, overs };
  }

  async function getNormalizedRapidCricketMatches(customKey?: string): Promise<any[]> {
    if (!ENABLE_CRICBUZZ_API) {
      // Cricbuzz API is temporarily paused per user instruction
      return [];
    }
    const activeKey = (customKey && customKey.trim()) ? customKey.trim() : RAPIDAPI_KEY;
    const now = Date.now();
    if (rapidCache.matches && (now - rapidCache.matches.timestamp < rapidCache.TTL_SCHEDULE_LIVE)) {
      return rapidCache.matches.data;
    }
    if (inFlightPromises.rapidCricketMatches) {
      return inFlightPromises.rapidCricketMatches;
    }

    inFlightPromises.rapidCricketMatches = (async () => {
      try {
        const events: any[] = [];
        const seenIds = new Set<string>();
        const curNow = Date.now();

        // 1. Fetch Cricbuzz Live, Upcoming, and Recent Matches via RapidAPI
        if (activeKey) {
          const endpoints = ["live", "upcoming", "recent"];
          const fetchPromises = endpoints.map((ep) =>
            fetch(`https://${RAPIDAPI_CRICKET_HOST}/matches/v1/${ep}`, {
              headers: {
                "x-rapidapi-host": RAPIDAPI_CRICKET_HOST,
                "x-rapidapi-key": activeKey,
              },
            })
              .then(async (res) => {
                if (!res.ok || res.status === 204) return null;
                try {
                  return await res.json();
                } catch {
                  return null;
                }
              })
              .catch((err) => {
                console.warn(`[Backend Proxy] Cricbuzz /matches/v1/${ep} notice:`, err.message);
                return null;
              })
          );

          const [liveData, upcomingData, recentData] = await Promise.all(fetchPromises);
          const datasets = [liveData, upcomingData, recentData].filter(Boolean);

          for (const json of datasets) {
            const typeMatches = Array.isArray(json.typeMatches) ? json.typeMatches : [];
            for (const tm of typeMatches) {
              const matchTypeCategory = tm.matchType || "Cricket";
              const seriesMatches = Array.isArray(tm.seriesMatches) ? tm.seriesMatches : [tm];
              for (const sm of seriesMatches) {
                const seriesName = sm.seriesAdWrapper?.seriesName || sm.seriesName || matchTypeCategory || "Cricket Series";
                const matches = sm.seriesAdWrapper?.matches || sm.matches || (sm.matchInfo ? [sm] : []);

                for (const m of matches) {
                  const info = m.matchInfo || m;
                  const matchId = String(info.matchId || info.id || "");
                  if (!matchId || seenIds.has(matchId)) continue;
                  seenIds.add(matchId);

                  const t1 = info.team1 || {};
                  const t2 = info.team2 || {};
                  const t1Name = t1.teamName || t1.name || "Team 1";
                  const t2Name = t2.teamName || t2.name || "Team 2";

                  const t1Logo = resolveHDTeamLogo(
                    t1Name,
                    t1.imageId ? `https://static.cricbuzz.com/a/img/v1/300x300/i1/c${t1.imageId}/team.jpg` : "https://flagcdn.com/w320/un.png"
                  );
                  const t2Logo = resolveHDTeamLogo(
                    t2Name,
                    t2.imageId ? `https://static.cricbuzz.com/a/img/v1/300x300/i1/c${t2.imageId}/team.jpg` : "https://flagcdn.com/w320/un.png"
                  );

                  let startTimestamp = parseInt(info.startDate) || curNow;
                  if (startTimestamp < 10000000000) startTimestamp *= 1000;
                  const endTimestamp = parseInt(info.endDate)
                    ? (parseInt(info.endDate) < 10000000000 ? parseInt(info.endDate) * 1000 : parseInt(info.endDate))
                    : startTimestamp + 4 * 3600 * 1000;

                  const rawState = String(info.state || "").toLowerCase();
                  const rawStatus = String(info.status || "").toLowerCase();

                  let status = "upcoming";
                  let statusText = info.status || info.matchDesc || "Scheduled";

                  if (
                    rawState.includes("progress") ||
                    rawState.includes("live") ||
                    rawState.includes("toss") ||
                    rawState.includes("stump") ||
                    rawState.includes("delay") ||
                    rawState.includes("rain") ||
                    rawState.includes("break") ||
                    rawStatus.includes("opt to") ||
                    rawStatus.includes("need ") ||
                    rawStatus.includes("trail by") ||
                    rawStatus.includes("lead by")
                  ) {
                    status = "live";
                    statusText = info.status || "LIVE NOW";
                  } else if (
                    rawState.includes("complete") ||
                    rawStatus.includes("won by") ||
                    rawStatus.includes("won the") ||
                    rawStatus.includes("tied") ||
                    rawStatus.includes("no result") ||
                    rawStatus.includes("abandon") ||
                    rawStatus.includes("drawn") ||
                    rawStatus.includes("concluded")
                  ) {
                    status = "finished";
                    statusText = info.status || "Match Concluded";
                  } else if (curNow >= startTimestamp && curNow <= endTimestamp) {
                    status = "live";
                    statusText = info.status || "LIVE NOW";
                  } else if (curNow > endTimestamp) {
                    status = "finished";
                    statusText = info.status || "Match Concluded";
                  }

                  const matchScore = m.matchScore || info.matchScore || {};
                  const t1Score = formatCricbuzzScore(matchScore.team1Score);
                  const t2Score = formatCricbuzzScore(matchScore.team2Score);

                  const matchTimeStr = formatDhakaEventTime(startTimestamp);

                  const sNameLower = seriesName.toLowerCase();
                  const t1Lower = t1Name.toLowerCase();
                  const t2Lower = t2Name.toLowerCase();

                  const isHot =
                    status === "live" ||
                    sNameLower.includes("tour of") ||
                    sNameLower.includes("tri-series") ||
                    sNameLower.includes("world cup") ||
                    sNameLower.includes("asia cup") ||
                    sNameLower.includes("ipl") ||
                    sNameLower.includes("bpl") ||
                    sNameLower.includes("psl") ||
                    sNameLower.includes("cpl") ||
                    sNameLower.includes("hundred") ||
                    sNameLower.includes("trophy") ||
                    sNameLower.includes("india") ||
                    sNameLower.includes("bangladesh") ||
                    sNameLower.includes("pakistan") ||
                    sNameLower.includes("australia") ||
                    sNameLower.includes("england") ||
                    sNameLower.includes("south africa") ||
                    sNameLower.includes("sri lanka") ||
                    sNameLower.includes("new zealand") ||
                    sNameLower.includes("west indies") ||
                    sNameLower.includes("afghanistan") ||
                    t1Lower.includes("bangladesh") ||
                    t2Lower.includes("bangladesh") ||
                    t1Lower.includes("india") ||
                    t2Lower.includes("india");

                  let finalFormat = info.matchFormat || "Cricket";
                  if (sNameLower.includes("t20") || sNameLower.includes("blast") || sNameLower.includes("cpl") || sNameLower.includes("ipl")) {
                    finalFormat = "T20";
                  } else if (sNameLower.includes("odi") || sNameLower.includes("one day")) {
                    finalFormat = "ODI";
                  } else if (sNameLower.includes("test")) {
                    finalFormat = "Test";
                  } else if (sNameLower.includes("hundred")) {
                    finalFormat = "Hundred";
                  }

                  const venueName = `${info.venueInfo?.ground || ""}${info.venueInfo?.city ? `, ${info.venueInfo.city}` : ""}`.trim();

                  events.push({
                    id: `cr-cricbuzz-${matchId}`,
                    matchId: matchId,
                    seriesId: info.seriesId,
                    sport: "cricket",
                    sportName: "Cricket",
                    sportIcon: "fa-baseball-bat-ball",
                    title: `${t1Name} vs ${t2Name}`,
                    name: `${t1Name} vs ${t2Name}`,
                    seriesName: seriesName,
                    tournament: seriesName,
                    league: seriesName,
                    matchDesc: info.matchDesc || "Match",
                    matchFormat: finalFormat,
                    matchType: finalFormat,
                    status: status,
                    statusText: statusText,
                    statusLabel: status === "live" ? "LIVE" : (status === "finished" ? "FT" : "Upcoming"),
                    timestamp: startTimestamp,
                    date: new Intl.DateTimeFormat("en-CA", {
                      timeZone: "Asia/Dhaka",
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                    }).format(new Date(startTimestamp)),
                    matchTime: matchTimeStr,
                    timeOrTimer: status === "live" ? "LIVE" : (status === "finished" ? "FT" : matchTimeStr),
                    venue: venueName,
                    isHot: isHot,
                    isSpecial: isHot,
                    team1: {
                      teamId: t1.teamId || t1.id,
                      name: t1Name,
                      shortName: t1.teamSName || "",
                      logo: t1Logo,
                      score: t1Score.score,
                      overs: t1Score.overs,
                    },
                    team2: {
                      teamId: t2.teamId || t2.id,
                      name: t2Name,
                      shortName: t2.teamSName || "",
                      logo: t2Logo,
                      score: t2Score.score,
                      overs: t2Score.overs,
                    },
                    homeTeam: {
                      name: t1Name,
                      logo: t1Logo,
                      score: t1Score.score,
                      overs: t1Score.overs,
                    },
                    awayTeam: {
                      name: t2Name,
                      logo: t2Logo,
                      score: t2Score.score,
                      overs: t2Score.overs,
                    },
                    broadcaster: (info.broadcaster || info.tvStation || info.broadcastInfo || info.channel || "").trim(),
                    broadcasters: (info.broadcaster || info.tvStation || info.broadcastInfo || info.channel || "").trim() ? [(info.broadcaster || info.tvStation || info.broadcastInfo || info.channel || "").trim()] : [],
                    subText: `${finalFormat} • ${venueName || seriesName}`,
                    source: "Cricbuzz RapidAPI",
                    streams: [],
                  });
                }
              }
            }
          }
        }

        // 2. Fallback: If Cricbuzz RapidAPI had no data or was unavailable, query TheSportsDB Cricket Feed
        if (events.length === 0) {
          try {
            const todayStr = new Date().toISOString().split("T")[0];
            const tsdbRes = await fetch(`${THESPORTSDB_BASE}/eventsday.php?d=${todayStr}&s=Cricket`).catch(() => null);
            if (tsdbRes && tsdbRes.ok) {
              const tsdbJson = await tsdbRes.json();
              for (const ev of (tsdbJson.events || [])) {
                const t1N = ev.strHomeTeam || "Team 1";
                const t2N = ev.strAwayTeam || "Team 2";
                const t1L = resolveHDTeamLogo(t1N, ev.strHomeTeamBadge || "https://flagcdn.com/w320/un.png");
                const t2L = resolveHDTeamLogo(t2N, ev.strAwayTeamBadge || "https://flagcdn.com/w320/un.png");
                let sTs = curNow;
                if (ev.strTimestamp) sTs = new Date(ev.strTimestamp).getTime();
                else if (ev.dateEvent && ev.strTime) sTs = new Date(`${ev.dateEvent}T${ev.strTime}`).getTime();

                const isLv = (ev.strStatus || "").toLowerCase().includes("live");
                const isFin = (ev.strStatus || "").toLowerCase().includes("ft") || (ev.strStatus || "").toLowerCase().includes("finish");

                events.push({
                  id: `cr-tsdb-${ev.idEvent || sTs}`,
                  matchId: ev.idEvent,
                  sport: "cricket",
                  sportName: "Cricket",
                  sportIcon: "fa-baseball-bat-ball",
                  title: `${t1N} vs ${t2N}`,
                  name: `${t1N} vs ${t2N}`,
                  tournament: ev.strLeague || "Cricket League",
                  league: ev.strLeague || "Cricket League",
                  matchFormat: "Cricket",
                  status: isLv ? "live" : (isFin ? "finished" : "upcoming"),
                  statusText: ev.strStatus || (isLv ? "LIVE NOW" : "Scheduled"),
                  statusLabel: isLv ? "LIVE" : (isFin ? "FT" : "Upcoming"),
                  timestamp: sTs,
                  date: ev.dateEvent || todayStr,
                  matchTime: formatDhakaEventTime(sTs),
                  timeOrTimer: isLv ? "LIVE" : (isFin ? "FT" : formatDhakaEventTime(sTs)),
                  venue: ev.strVenue || "",
                  isHot: true,
                  isSpecial: true,
                  team1: { name: t1N, logo: t1L, score: "", overs: "" },
                  team2: { name: t2N, logo: t2L, score: "", overs: "" },
                  homeTeam: { name: t1N, logo: t1L, score: "", overs: "" },
                  awayTeam: { name: t2N, logo: t2L, score: "", overs: "" },
                  broadcaster: (ev.strTVStation || ev.strBroadcaster || ev.strBroadcast || "").trim(),
                  broadcasters: (ev.strTVStation || ev.strBroadcaster || ev.strBroadcast || "") ? [(ev.strTVStation || ev.strBroadcaster || ev.strBroadcast || "").trim()] : [],
                  strTVStation: (ev.strTVStation || "").trim(),
                  subText: `Cricket • ${ev.strVenue || ev.strLeague || ""}`,
                  source: "TheSportsDB Cricket",
                  streams: [],
                });
              }
            }
          } catch (e: any) {
            console.warn("[Backend Proxy] Cricket fallback error:", e.message);
          }
        }

        if (events.length > 0) {
          rapidCache.matches = { timestamp: Date.now(), data: events };
        }
        return events.length > 0 ? events : (rapidCache.matches?.data || []);
      } catch (err: any) {
        console.warn("[Backend Proxy] Transform cricket matches error:", err.message);
        return rapidCache.matches?.data || [];
      } finally {
        inFlightPromises.rapidCricketMatches = null;
      }
    })();

    return inFlightPromises.rapidCricketMatches;
  }

  let lastSportradarApiTime = 0;
  async function fetchSportradarApi(
    endpoint: string,
    apiKey: string,
    tier: string = SPORTRADAR_CRICKET_TIER
  ): Promise<{ ok: boolean; status: number; data?: any; error?: string; rawText?: string }> {
    if (!apiKey || !apiKey.trim()) {
      return { ok: false, status: 400, error: "Sportradar API key is missing." };
    }

    // Strict throttle to protect 1 QPS trial rate limit
    const now = Date.now();
    const diff = now - lastSportradarApiTime;
    if (diff < 1100) {
      await new Promise((r) => setTimeout(r, 1100 - diff));
    }
    lastSportradarApiTime = Date.now();

    const cleanTier = sanitizeSportradarTier(tier);
    const cleanEndpoint = endpoint.startsWith("/") ? endpoint.slice(1) : endpoint;
    const sep = cleanEndpoint.includes("?") ? "&" : "?";
    const url = `https://api.sportradar.com/cricket-${cleanTier}/en/${cleanEndpoint}${sep}api_key=${encodeURIComponent(apiKey.trim())}`;

    try {
      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(9000),
      });

      const text = await res.text();
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }

      if (!res.ok) {
        return {
          ok: false,
          status: res.status,
          error: data?.message || data?.error || (text ? text.slice(0, 250) : res.statusText),
          rawText: text,
        };
      }

      return { ok: true, status: res.status, data, rawText: text };
    } catch (err: any) {
      return { ok: false, status: 500, error: err.message || "Network error reaching Sportradar API" };
    }
  }

  // Load and cache authentic channels.json for matching broadcast channels
  let cachedChannelsJson: any[] | null = null;
  function getChannelsFromDisk(): any[] {
    if (cachedChannelsJson && cachedChannelsJson.length > 0) return cachedChannelsJson;
    try {
      const raw = fs.readFileSync(path.join(process.cwd(), "channels.json"), "utf8");
      cachedChannelsJson = JSON.parse(raw);
      return cachedChannelsJson || [];
    } catch (e: any) {
      console.warn("[Channels] Error reading channels.json:", e.message);
      return [];
    }
  }

  // Resolve authentic broadcaster information exclusively from Sportradar API response
  // STRICT USER MANDATE:
  // "Sportradar API থেকে যে Broadcasting, Channel বা TV তথ্য আসবে শুধুমাত্র সেটাই ব্যবহার করবে।
  // কোনো Channel Name, Broadcaster, Logo বা Broadcasting তথ্য নিজে থেকে তৈরি, অনুমান বা Placeholder হিসেবে যোগ করবে না।
  // API response-এ তথ্য না থাকলে সেই তথ্য দেখাবে না। সব Broadcasting data সম্পূর্ণভাবে API-এর real-time response অনুযায়ী প্রদর্শন করবে।"
  function resolveCricketBroadcastData(sportEvent: any, item: any) {
    const extracted: string[] = [];

    // Extract all potential broadcasting/channel fields directly present in Sportradar API response payload
    const srSources = [
      item?.channels,
      sportEvent?.channels,
      item?.broadcasters,
      sportEvent?.broadcasters,
      item?.tv_channels,
      sportEvent?.tv_channels,
      item?.broadcast,
      sportEvent?.broadcast,
      item?.media?.channels,
      sportEvent?.media?.channels,
      item?.media?.broadcasters,
      sportEvent?.media?.broadcasters,
      item?.coverage?.channels,
      sportEvent?.coverage?.channels,
      item?.coverage?.tv_channels,
      sportEvent?.coverage?.tv_channels,
      item?.coverage?.tv,
      sportEvent?.coverage?.tv,
      item?.sport_event_status?.broadcast,
      sportEvent?.sport_event_status?.broadcast,
      item?.sport_event_status?.channels,
      sportEvent?.sport_event_status?.channels,
    ];

    function extractFromEntry(entry: any) {
      if (!entry) return;
      if (Array.isArray(entry)) {
        for (const sub of entry) {
          extractFromEntry(sub);
        }
      } else if (typeof entry === "string") {
        const trimmed = entry.trim();
        if (trimmed && !trimmed.toLowerCase().includes("unknown") && !trimmed.toLowerCase().includes("tbd")) {
          extracted.push(trimmed);
        }
      } else if (typeof entry === "object") {
        const name =
          entry.name ||
          entry.channel_name ||
          entry.broadcaster_name ||
          entry.station ||
          entry.tv_name ||
          entry.channel ||
          entry.title ||
          "";
        if (typeof name === "string" && name.trim()) {
          const trimmed = name.trim();
          if (trimmed && !trimmed.toLowerCase().includes("unknown") && !trimmed.toLowerCase().includes("tbd")) {
            extracted.push(trimmed);
          }
        }
      }
    }

    for (const src of srSources) {
      extractFromEntry(src);
    }

    // STRICT USER MANDATE:
    // If no broadcasting/channel information is provided in the API response, return null/empty.
    // Absolutely NO guessing, NO country/tournament inference, and NO placeholder/fallback channels!
    if (extracted.length === 0) {
      return {
        broadcaster: null,
        broadcasters: [],
        channelId: null,
        channelName: null,
        channelLogo: null,
        streamUrl: null,
        streams: [],
      };
    }

    // Deduplicate extracted broadcaster names strictly from API
    const uniqueBroadcasters = Array.from(new Set(extracted.filter(Boolean)));
    const primaryBroadcaster = uniqueBroadcasters.slice(0, 3).join(", ");

    // Only match against HighFy TV channels.json if an active channel matches the authentic broadcaster from the API
    const allChannels = getChannelsFromDisk();
    let matchedChannel: any = null;

    for (const bName of uniqueBroadcasters) {
      const bLower = bName.toLowerCase();
      matchedChannel = allChannels.find((c: any) => {
        if (!c || c.active === false) return false;
        const cName = (c.name || "").toLowerCase();
        const cId = (c.id || "").toLowerCase();
        return (
          cName === bLower ||
          cName.includes(bLower) ||
          bLower.includes(cName) ||
          cId === bLower
        );
      });
      if (matchedChannel) break;
    }

    return {
      broadcaster: primaryBroadcaster,
      broadcasters: uniqueBroadcasters,
      channelId: matchedChannel ? matchedChannel.id : null,
      channelName: matchedChannel ? matchedChannel.name : uniqueBroadcasters[0],
      channelLogo: matchedChannel ? (matchedChannel.logo || null) : null,
      streamUrl: matchedChannel ? (matchedChannel.streamUrl || matchedChannel.url || matchedChannel.stream_url || null) : null,
      streams: matchedChannel?.streams || [],
    };
  }

  function normalizeSportradarEvent(item: any): any {
    if (!item) return null;
    const sportEvent = item.sport_event || item;
    const statusObj = item.sport_event_status || {};
    const competitors = Array.isArray(sportEvent.competitors) ? sportEvent.competitors : [];
    const home = competitors.find((c: any) => c.qualifier === "home") || competitors[0] || {};
    const away = competitors.find((c: any) => c.qualifier === "away") || competitors[1] || {};
    const homeName = home.name || "Home Team";
    const awayName = away.name || "Away Team";
    const tournamentName = sportEvent.tournament?.name || sportEvent.season?.name || "Cricket Tournament";

    const rawStatus = String(statusObj.status || sportEvent.status || item.status || "").toLowerCase();
    const matchStatus = String(statusObj.match_status || "").toLowerCase();
    let status = "upcoming";
    let statusText = "Scheduled";

    if (
      rawStatus === "live" ||
      rawStatus === "in_progress" ||
      rawStatus === "started" ||
      matchStatus === "in_progress" ||
      matchStatus.includes("progress") ||
      rawStatus.includes("progress")
    ) {
      status = "live";
      statusText = statusObj.match_status || "LIVE NOW";
    } else if (
      rawStatus === "closed" ||
      rawStatus === "ended" ||
      rawStatus === "finished" ||
      rawStatus === "complete" ||
      rawStatus === "completed" ||
      matchStatus === "ended" ||
      matchStatus === "completed" ||
      rawStatus.includes("ended") ||
      rawStatus.includes("concluded")
    ) {
      status = "finished";
      statusText = statusObj.match_status || "Match Concluded";
    } else {
      status = "upcoming";
      statusText = statusObj.match_status || "Upcoming";
    }

    const periodScores = Array.isArray(statusObj.period_scores) ? statusObj.period_scores : [];
    let homeScore = "";
    let homeOvers = "";
    let awayScore = "";
    let awayOvers = "";

    const homePeriods = periodScores.filter((p: any) => p.home_score !== undefined && p.home_score !== null);
    if (homePeriods.length > 0) {
      const lastP = homePeriods[homePeriods.length - 1];
      homeScore = `${lastP.home_score}/${lastP.home_wickets !== undefined ? lastP.home_wickets : 0}`;
      if (lastP.home_overs) homeOvers = `(${lastP.home_overs} ov)`;
    }
    const awayPeriods = periodScores.filter((p: any) => p.away_score !== undefined && p.away_score !== null);
    if (awayPeriods.length > 0) {
      const lastP = awayPeriods[awayPeriods.length - 1];
      awayScore = `${lastP.away_score}/${lastP.away_wickets !== undefined ? lastP.away_wickets : 0}`;
      if (lastP.away_overs) awayOvers = `(${lastP.away_overs} ov)`;
    }

    const scheduledDate = sportEvent.scheduled ? new Date(sportEvent.scheduled) : new Date();
    const timestamp = !isNaN(scheduledDate.getTime()) ? scheduledDate.getTime() : Date.now();
    const matchTimeStr = formatDhakaEventTime(timestamp);

    const t1Logo = resolveHDTeamLogo(homeName);
    const t2Logo = resolveHDTeamLogo(awayName);

    return {
      id: `cr-sportradar-${String(sportEvent.id || Date.now()).replace(/[^a-zA-Z0-9_-]/g, "_")}`,
      rawId: sportEvent.id,
      matchId: sportEvent.id,
      sport: "cricket",
      sportName: "Cricket",
      sportIcon: "fa-baseball-bat-ball",
      title: `${homeName} vs ${awayName}`,
      name: `${homeName} vs ${awayName}`,
      seriesName: tournamentName,
      tournament: tournamentName,
      league: tournamentName,
      matchDesc: sportEvent.type || "Match",
      matchFormat: "Cricket",
      status,
      statusText,
      statusLabel: status === "live" ? "LIVE" : (status === "finished" ? "FT" : "Upcoming"),
      timestamp,
      date: new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Dhaka",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(timestamp)),
      matchTime: matchTimeStr,
      timeOrTimer: status === "live" ? "LIVE" : (status === "finished" ? "FT" : matchTimeStr),
      venue: sportEvent.venue ? `${sportEvent.venue.name || ""}${sportEvent.venue.city_name ? `, ${sportEvent.venue.city_name}` : ""}`.trim() : "",
      isHot: status === "live",
      isSpecial: status === "live",
      team1: {
        teamId: home.id,
        name: homeName,
        shortName: home.abbreviation || "",
        logo: t1Logo,
        score: homeScore,
        overs: homeOvers,
      },
      team2: {
        teamId: away.id,
        name: awayName,
        shortName: away.abbreviation || "",
        logo: t2Logo,
        score: awayScore,
        overs: awayOvers,
      },
      homeTeam: {
        name: homeName,
        logo: t1Logo,
        score: homeScore,
        overs: homeOvers,
      },
      awayTeam: {
        name: awayName,
        logo: t2Logo,
        score: awayScore,
        overs: awayOvers,
      },
      ...(() => {
        const bData = resolveCricketBroadcastData(sportEvent, item);
        return {
          broadcaster: bData.broadcaster,
          broadcasters: bData.broadcasters,
          channelId: bData.channelId,
          channelName: bData.channelName,
          channelLogo: bData.channelLogo,
          streamUrl: bData.streamUrl,
          streams: bData.streams,
          subText: bData.channelName
            ? `${tournamentName} • ${bData.channelName}`
            : tournamentName,
        };
      })(),
      source: "Sportradar",
    };
  }

  async function getNormalizedSportradarCricketMatches(
    apiKey: string = SPORTRADAR_CRICKET_API_KEY,
    tier: string = SPORTRADAR_CRICKET_TIER
  ): Promise<any[]> {
    const activeKey = apiKey.trim() || SPORTRADAR_CRICKET_API_KEY;
    if (!activeKey) return [];

    const cleanTier = sanitizeSportradarTier(tier);

    const now = Date.now();
    if (sportradarCache.matches && now - sportradarCache.matches.timestamp < sportradarCache.TTL_LIVE) {
      return sportradarCache.matches.data;
    }
    if (inFlightPromises.sportradarCricketMatches) {
      return inFlightPromises.sportradarCricketMatches;
    }

    inFlightPromises.sportradarCricketMatches = (async () => {
      try {
        const events: any[] = [];
        const seenIds = new Set<string>();

        // 1. Fetch live schedule (Sportradar Cricket v2 route: schedules/live/schedule.json)
        const liveRes = await fetchSportradarApi("schedules/live/schedule.json", activeKey, cleanTier);
        if (liveRes.ok && liveRes.data) {
          const list = Array.isArray(liveRes.data.sport_events)
            ? liveRes.data.sport_events
            : Array.isArray(liveRes.data.summaries)
            ? liveRes.data.summaries
            : [];
          for (const item of list) {
            const ev = normalizeSportradarEvent(item);
            if (ev && !seenIds.has(ev.id)) {
              seenIds.add(ev.id);
              events.push(ev);
            }
          }
        }

        // 2. Fetch today's schedule (Sportradar Cricket v2 route: schedules/{date}/schedule.json)
        const nowDhaka = new Date();
        const today = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Dhaka",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(nowDhaka);

        const dailyRes = await fetchSportradarApi(`schedules/${today}/schedule.json`, activeKey, cleanTier);
        if (dailyRes.ok && dailyRes.data) {
          const list = Array.isArray(dailyRes.data.sport_events)
            ? dailyRes.data.sport_events
            : Array.isArray(dailyRes.data.summaries)
            ? dailyRes.data.summaries
            : [];
          for (const item of list) {
            const ev = normalizeSportradarEvent(item);
            if (ev && !seenIds.has(ev.id)) {
              seenIds.add(ev.id);
              events.push(ev);
            }
          }
        }

        // 3. Fetch tomorrow's schedule for upcoming matches
        const tomorrowDate = new Date(nowDhaka.getTime() + 24 * 60 * 60 * 1000);
        const tomorrow = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Dhaka",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(tomorrowDate);

        const tomorrowRes = await fetchSportradarApi(`schedules/${tomorrow}/schedule.json`, activeKey, cleanTier);
        if (tomorrowRes.ok && tomorrowRes.data) {
          const list = Array.isArray(tomorrowRes.data.sport_events)
            ? tomorrowRes.data.sport_events
            : Array.isArray(tomorrowRes.data.summaries)
            ? tomorrowRes.data.summaries
            : [];
          for (const item of list) {
            const ev = normalizeSportradarEvent(item);
            if (ev && !seenIds.has(ev.id)) {
              seenIds.add(ev.id);
              events.push(ev);
            }
          }
        }

        // Sort events: LIVE first, then UPCOMING (sorted by time ascending), then FINISHED
        events.sort((a, b) => {
          const order: Record<string, number> = { live: 0, upcoming: 1, finished: 2 };
          const orderA = order[a.status] !== undefined ? order[a.status] : 1;
          const orderB = order[b.status] !== undefined ? order[b.status] : 1;
          if (orderA !== orderB) return orderA - orderB;
          return (a.timestamp || 0) - (b.timestamp || 0);
        });

        if (events.length > 0) {
          sportradarCache.matches = { timestamp: Date.now(), data: events };
        }
        return events.length > 0 ? events : (sportradarCache.matches?.data || []);
      } catch (err: any) {
        console.warn("[Backend Proxy] Sportradar cricket error:", err.message);
        return sportradarCache.matches?.data || [];
      } finally {
        inFlightPromises.sportradarCricketMatches = null;
      }
    })();

    return inFlightPromises.sportradarCricketMatches;
  }

  // Proxy: Cricket Data API (RapidAPI live cricket engine + optional Sportradar integration)
  app.get("/api/cricket/matches", async (req, res) => {
    try {
      const rapidKey = (typeof req.query.rapidapikey === "string" && req.query.rapidapikey.trim())
        ? req.query.rapidapikey.trim()
        : (typeof req.headers["x-rapidapi-key"] === "string" && req.headers["x-rapidapi-key"].trim()
          ? req.headers["x-rapidapi-key"].trim()
          : RAPIDAPI_KEY);
      
      const srKey = (typeof req.query.sportradar_key === "string" && req.query.sportradar_key.trim())
        ? req.query.sportradar_key.trim()
        : (typeof req.headers["x-sportradar-api-key"] === "string" && req.headers["x-sportradar-api-key"].trim()
          ? req.headers["x-sportradar-api-key"].trim()
          : SPORTRADAR_CRICKET_API_KEY);

      const srTier = sanitizeSportradarTier(req.query.sportradar_tier || req.headers["x-sportradar-tier"]);

      // If requested only from Sportradar:
      if (req.query.provider === "sportradar") {
        if (!srKey) {
          return res.status(400).json({ status: "error", message: "Sportradar API key required." });
        }
        const srMatches = await getNormalizedSportradarCricketMatches(srKey, srTier);
        return res.json({
          status: "success",
          source: "Sportradar",
          total: srMatches.length,
          data: srMatches,
        });
      }

      // If Cricbuzz API is paused, prioritize Sportradar as the primary engine:
      if (!ENABLE_CRICBUZZ_API) {
        if (srKey) {
          const srMatches = await getNormalizedSportradarCricketMatches(srKey, srTier);
          return res.json({
            status: "success",
            source: "Sportradar",
            total: srMatches.length,
            data: srMatches,
          });
        }
        return res.json({
          status: "success",
          source: "Sportradar",
          total: 0,
          data: [],
          message: "Cricbuzz API is temporarily paused per user configuration. Provide Sportradar API key to view cricket matches.",
        });
      }

      // Automatically fetch from high-speed RapidAPI Cricket Engine (if enabled)
      let rapidEvents = await getNormalizedRapidCricketMatches(rapidKey);

      // Merge Sportradar matches if key is configured or explicitly requested
      if (srKey && (req.query.includesportradar === "true" || !!process.env.SPORTRADAR_CRICKET_API_KEY)) {
        try {
          const srMatches = await getNormalizedSportradarCricketMatches(srKey, srTier);
          if (srMatches && srMatches.length > 0) {
            const existingTitles = new Set(rapidEvents.map((e: any) => (e.title || "").toLowerCase()));
            const newSr = srMatches.filter((e: any) => !existingTitles.has((e.title || "").toLowerCase()));
            rapidEvents = [...newSr, ...rapidEvents];
          }
        } catch (e: any) {
          console.warn("[Backend Proxy] Sportradar auto-merge note:", e.message);
        }
      }

      res.json({
        status: "success",
        source: rapidEvents.some((e: any) => e.source === "Sportradar") ? "Sportradar + RapidAPI" : "RapidAPI",
        data: rapidEvents,
      });
    } catch (err: any) {
      console.warn("[Backend Proxy] Cricket error:", err.message);
      res.json({ status: "ok", data: [], error: "Failed to fetch cricket matches" });
    }
  });

  // Dedicated Cricket Scorecard & Match Details (Cricbuzz Match Center)
  app.get("/api/cricket/scorecard", async (req, res) => {
    try {
      const matchId = String(req.query.id || req.query.matchid || "").replace(/^cr-/, "").replace(/^rapid-/, "").trim();
      if (!matchId) {
        return res.status(400).json({ status: "error", message: "Match ID required." });
      }

      const rapidKey = (typeof req.query.rapidapikey === "string" && req.query.rapidapikey.trim())
        ? req.query.rapidapikey.trim()
        : (typeof req.headers["x-rapidapi-key"] === "string" && req.headers["x-rapidapi-key"].trim()
          ? req.headers["x-rapidapi-key"].trim()
          : RAPIDAPI_KEY);

      const [mCenterRes, scardRes, leanbackRes] = await Promise.allSettled([
        fetch(`https://${RAPIDAPI_CRICKET_HOST}/mcenter/v1/${encodeURIComponent(matchId)}`, {
          headers: { "x-rapidapi-host": RAPIDAPI_CRICKET_HOST, "x-rapidapi-key": rapidKey }
        }).then(r => r.ok && r.status !== 204 ? r.json() : null),
        fetch(`https://${RAPIDAPI_CRICKET_HOST}/mcenter/v1/${encodeURIComponent(matchId)}/scard`, {
          headers: { "x-rapidapi-host": RAPIDAPI_CRICKET_HOST, "x-rapidapi-key": rapidKey }
        }).then(r => r.ok && r.status !== 204 ? r.json() : null),
        fetch(`https://${RAPIDAPI_CRICKET_HOST}/mcenter/v1/${encodeURIComponent(matchId)}/leanback`, {
          headers: { "x-rapidapi-host": RAPIDAPI_CRICKET_HOST, "x-rapidapi-key": rapidKey }
        }).then(r => r.ok && r.status !== 204 ? r.json() : null),
      ]);

      const mCenter = mCenterRes.status === "fulfilled" ? mCenterRes.value : null;
      const scard = scardRes.status === "fulfilled" ? scardRes.value : null;
      const leanback = leanbackRes.status === "fulfilled" ? leanbackRes.value : null;

      res.json({
        status: "success",
        data: {
          matchId,
          matchInfo: mCenter,
          scorecard: scard?.scorecard || scard,
          miniscore: leanback?.miniscore || leanback,
        }
      });
    } catch (err: any) {
      console.warn("[Backend Proxy] Cricket scorecard error:", err.message);
      res.status(500).json({ status: "error", message: err.message });
    }
  });

  // Dedicated RapidAPI Cricket Key Validator
  app.get("/api/cricket/test", async (req, res) => {
    try {
      const key = (typeof req.query.key === "string" && req.query.key.trim())
        ? req.query.key.trim()
        : (typeof req.headers["x-rapidapi-key"] === "string" && req.headers["x-rapidapi-key"].trim()
          ? req.headers["x-rapidapi-key"].trim()
          : RAPIDAPI_KEY);

      const host = (typeof req.query.host === "string" && req.query.host.trim())
        ? req.query.host.trim()
        : RAPIDAPI_CRICKET_HOST;

      if (!key) {
        return res.json({ valid: false, message: "No RapidAPI key provided" });
      }

      const checkRes = await fetch(`https://${host}/matches/v1/live`, {
        headers: {
          "x-rapidapi-host": host,
          "x-rapidapi-key": key,
        },
      });

      if (checkRes.status === 200 || checkRes.status === 204) {
        return res.json({
          valid: true,
          status: "active",
          message: "RapidAPI Cricket (Cricbuzz) key is verified & operational!"
        });
      }

      if (checkRes.status === 429) {
        return res.json({ valid: false, message: "RapidAPI monthly rate limit exceeded for Cricket" });
      }

      if (checkRes.status === 403 || checkRes.status === 401) {
        return res.json({ valid: false, message: "Invalid RapidAPI key or unauthorized host access" });
      }

      res.json({ valid: false, message: `RapidAPI responded with status ${checkRes.status}` });
    } catch (e: any) {
      res.json({ valid: false, message: `Connection error: ${e.message}` });
    }
  });

  // Dedicated Sportradar Cricket Broadcast Channels & Coverage Endpoint
  app.get("/api/cricket/sportradar/channels", (_req, res) => {
    try {
      const allChannels = getChannelsFromDisk();
      const cricketChannels = allChannels.filter((c: any) => {
        if (!c || c.active === false) return false;
        const name = (c.name || "").toLowerCase();
        const cat = (c.category || "").toLowerCase();
        const cats = Array.isArray(c.categories) ? c.categories.map((x: any) => String(x).toLowerCase()) : [];
        return (
          cat === "sports" ||
          cats.includes("sports") ||
          cats.includes("cricket") ||
          name.includes("t sports") ||
          name.includes("tsports") ||
          name.includes("gazi") ||
          name.includes("gtv") ||
          name.includes("star sports") ||
          name.includes("willow") ||
          name.includes("ptv sports") ||
          name.includes("a sports") ||
          name.includes("ten sports") ||
          name.includes("sky sports") ||
          name.includes("cricket")
        );
      });

      res.json({
        status: "success",
        total: cricketChannels.length,
        policy: "Strictly API-driven broadcast resolution. Zero placeholder, invented or assumed mappings.",
        channels: cricketChannels.map((c: any) => ({
          id: c.id,
          name: c.name,
          category: c.category,
          logo: c.logo,
          active: c.active,
          streamUrl: c.streamUrl || c.url || c.stream_url,
          streams: c.streams || [],
        })),
      });
    } catch (e: any) {
      res.status(500).json({ status: "error", message: e.message });
    }
  });

  // Dedicated Sportradar Cricket Test Endpoint
  app.get(["/api/sportradar/test", "/api/cricket/sportradar/test"], async (req, res) => {
    try {
      const apiKey = String(
        req.query.key ||
        req.query.api_key ||
        req.query.APIkey ||
        req.headers["x-sportradar-api-key"] ||
        SPORTRADAR_CRICKET_API_KEY ||
        ""
      ).trim();

      const tier = sanitizeSportradarTier(req.query.tier || req.headers["x-sportradar-tier"] || SPORTRADAR_CRICKET_TIER);

      if (!apiKey) {
        return res.status(400).json({
          valid: false,
          status: "missing_key",
          message: "Sportradar API key is required. Pass ?api_key=YOUR_KEY or set SPORTRADAR_CRICKET_API_KEY in Environment Variables.",
          tier,
        });
      }

      const startTime = Date.now();
      // Test with tournaments list or live summaries
      const testRes = await fetchSportradarApi("tournaments.json", apiKey, tier);
      const elapsed = Date.now() - startTime;

      if (testRes.ok && testRes.data) {
        const tournaments = Array.isArray(testRes.data.tournaments) ? testRes.data.tournaments : [];
        return res.json({
          valid: true,
          status: "success",
          message: `Sportradar Cricket API Trial/Production key is VALID and working! (${tournaments.length} tournaments indexed)`,
          tier,
          latencyMs: elapsed,
          tournamentsCount: tournaments.length,
          sampleTournaments: tournaments.slice(0, 5).map((t: any) => ({
            id: t.id,
            name: t.name,
            category: t.category?.name || "Cricket",
          })),
        });
      }

      if (testRes.status === 403) {
        return res.status(403).json({
          valid: false,
          status: "unauthorized",
          statusCode: 403,
          tier,
          message: `Sportradar returned 403 Forbidden. Your trial key may have been issued for a different tier package (e.g., 't2', 'v2', or 'p2') or needs activation in your Sportradar developer portal.`,
          error: testRes.error,
        });
      }

      if (testRes.status === 429) {
        return res.status(429).json({
          valid: false,
          status: "rate_limited",
          statusCode: 429,
          tier,
          message: "Sportradar rate limit reached (Trial keys allow 1 QPS). Please wait 2 seconds and try again.",
          error: testRes.error,
        });
      }

      return res.status(testRes.status || 500).json({
        valid: false,
        status: "error",
        statusCode: testRes.status,
        tier,
        message: testRes.error || `Sportradar API error with HTTP status ${testRes.status}`,
      });
    } catch (err: any) {
      return res.status(500).json({
        valid: false,
        status: "error",
        message: err.message,
      });
    }
  });

  // Dedicated Sportradar Cricket Matches Endpoint
  app.get("/api/cricket/sportradar/matches", async (req, res) => {
    try {
      const apiKey = String(
        req.query.api_key ||
        req.query.key ||
        req.headers["x-sportradar-api-key"] ||
        SPORTRADAR_CRICKET_API_KEY ||
        ""
      ).trim();

      const tier = sanitizeSportradarTier(req.query.tier || req.headers["x-sportradar-tier"] || SPORTRADAR_CRICKET_TIER);

      if (!apiKey) {
        return res.status(400).json({
          status: "error",
          message: "Sportradar API key is required. Pass ?api_key=YOUR_KEY or set SPORTRADAR_CRICKET_API_KEY.",
        });
      }

      const matches = await getNormalizedSportradarCricketMatches(apiKey, tier);
      res.json({
        status: "success",
        source: "Sportradar",
        tier,
        total: matches.length,
        data: matches,
      });
    } catch (err: any) {
      res.status(500).json({ status: "error", message: err.message });
    }
  });

  // Dedicated Sportradar Cricket Live Summaries Endpoint
  app.get("/api/cricket/sportradar/live", async (req, res) => {
    try {
      const apiKey = String(
        req.query.api_key ||
        req.query.key ||
        req.headers["x-sportradar-api-key"] ||
        SPORTRADAR_CRICKET_API_KEY ||
        ""
      ).trim();

      const tier = sanitizeSportradarTier(req.query.tier || req.headers["x-sportradar-tier"] || SPORTRADAR_CRICKET_TIER);

      if (!apiKey) {
        return res.status(400).json({
          status: "error",
          message: "Sportradar API key is required. Pass ?api_key=YOUR_KEY or set SPORTRADAR_CRICKET_API_KEY.",
        });
      }

      const apiRes = await fetchSportradarApi("schedules/live/schedule.json", apiKey, tier);
      if (!apiRes.ok) {
        return res.status(apiRes.status).json({ status: "error", message: apiRes.error });
      }

      const rawList = Array.isArray(apiRes.data?.sport_events)
        ? apiRes.data.sport_events
        : Array.isArray(apiRes.data?.summaries)
        ? apiRes.data.summaries
        : [];

      const normalized = rawList.map((item: any) => normalizeSportradarEvent(item)).filter(Boolean);

      res.json({
        status: "success",
        source: "Sportradar Live",
        tier,
        total: normalized.length,
        data: normalized,
        raw: apiRes.data,
      });
    } catch (err: any) {
      res.status(500).json({ status: "error", message: err.message });
    }
  });

  // Dedicated Sportradar Cricket Schedule Endpoint
  app.get("/api/cricket/sportradar/schedule", async (req, res) => {
    try {
      const apiKey = String(
        req.query.api_key ||
        req.query.key ||
        req.headers["x-sportradar-api-key"] ||
        SPORTRADAR_CRICKET_API_KEY ||
        ""
      ).trim();

      const tier = sanitizeSportradarTier(req.query.tier || req.headers["x-sportradar-tier"] || SPORTRADAR_CRICKET_TIER);
      const date = String(req.query.date || "").trim() || new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Dhaka",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());

      if (!apiKey) {
        return res.status(400).json({
          status: "error",
          message: "Sportradar API key is required. Pass ?api_key=YOUR_KEY or set SPORTRADAR_CRICKET_API_KEY.",
        });
      }

      const apiRes = await fetchSportradarApi(`schedules/${date}/schedule.json`, apiKey, tier);
      if (!apiRes.ok) {
        return res.status(apiRes.status).json({ status: "error", message: apiRes.error });
      }

      const rawList = Array.isArray(apiRes.data?.sport_events)
        ? apiRes.data.sport_events
        : Array.isArray(apiRes.data?.summaries)
        ? apiRes.data.summaries
        : [];

      const normalized = rawList.map((item: any) => normalizeSportradarEvent(item)).filter(Boolean);

      res.json({
        status: "success",
        source: "Sportradar Schedule",
        date,
        tier,
        total: normalized.length,
        data: normalized,
      });
    } catch (err: any) {
      res.status(500).json({ status: "error", message: err.message });
    }
  });

  // Dedicated Sportradar Cricket Tournaments Endpoint
  app.get("/api/cricket/sportradar/tournaments", async (req, res) => {
    try {
      const apiKey = String(
        req.query.api_key ||
        req.query.key ||
        req.headers["x-sportradar-api-key"] ||
        SPORTRADAR_CRICKET_API_KEY ||
        ""
      ).trim();

      const tier = sanitizeSportradarTier(req.query.tier || req.headers["x-sportradar-tier"] || SPORTRADAR_CRICKET_TIER);

      if (!apiKey) {
        return res.status(400).json({
          status: "error",
          message: "Sportradar API key is required. Pass ?api_key=YOUR_KEY or set SPORTRADAR_CRICKET_API_KEY.",
        });
      }

      const now = Date.now();
      if (sportradarCache.tournaments && now - sportradarCache.tournaments.timestamp < sportradarCache.TTL_STATIC) {
        return res.json(sportradarCache.tournaments.data);
      }

      const apiRes = await fetchSportradarApi("tournaments.json", apiKey, tier);
      if (!apiRes.ok) {
        return res.status(apiRes.status).json({ status: "error", message: apiRes.error });
      }

      sportradarCache.tournaments = { timestamp: now, data: apiRes.data };
      res.json(apiRes.data);
    } catch (err: any) {
      res.status(500).json({ status: "error", message: err.message });
    }
  });

  // General Sportradar Cricket Proxy Endpoint
  app.all("/api/cricket/sportradar/proxy/*endpointPath", async (req, res) => {
    try {
      const apiKey = String(
        req.query.api_key ||
        req.query.key ||
        req.headers["x-sportradar-api-key"] ||
        SPORTRADAR_CRICKET_API_KEY ||
        ""
      ).trim();

      const tier = sanitizeSportradarTier(req.query.tier || req.headers["x-sportradar-tier"] || SPORTRADAR_CRICKET_TIER);

      if (!apiKey) {
        return res.status(400).json({
          status: "error",
          message: "Sportradar API key is required. Pass ?api_key=YOUR_KEY or set SPORTRADAR_CRICKET_API_KEY.",
        });
      }

      const targetPath = (req.params as any).endpointPath || "";
      const apiRes = await fetchSportradarApi(targetPath, apiKey, tier);

      if (!apiRes.ok) {
        return res.status(apiRes.status).json({
          status: "error",
          statusCode: apiRes.status,
          message: apiRes.error,
        });
      }

      res.json(apiRes.data);
    } catch (err: any) {
      res.status(500).json({ status: "error", message: err.message });
    }
  });

  // Endpoint: RapidAPI Cricket Schedule
  app.get("/api/cricket/schedule", async (req, res) => {
    try {
      const rapidKey = (typeof req.query.rapidapikey === "string" && req.query.rapidapikey.trim())
        ? req.query.rapidapikey.trim()
        : (typeof req.headers["x-rapidapi-key"] === "string" && req.headers["x-rapidapi-key"].trim()
          ? req.headers["x-rapidapi-key"].trim()
          : RAPIDAPI_KEY);
      const sched = await fetchRapidSchedule(rapidKey);
      res.json(sched || { status: "empty", response: { schedules: [] } });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch cricket schedule", message: err.message });
    }
  });

  // Endpoint: RapidAPI Cricket Teams
  app.get("/api/cricket/teams", async (req, res) => {
    try {
      const rapidKey = (typeof req.query.rapidapikey === "string" && req.query.rapidapikey.trim())
        ? req.query.rapidapikey.trim()
        : (typeof req.headers["x-rapidapi-key"] === "string" && req.headers["x-rapidapi-key"].trim()
          ? req.headers["x-rapidapi-key"].trim()
          : RAPIDAPI_KEY);
      const teams = await fetchRapidTeams(rapidKey);
      res.json({ status: "success", response: teams });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch cricket teams", message: err.message });
    }
  });

  // Endpoint: RapidAPI Cricket Players by Team ID (e.g., 2=India, 6=Bangladesh, 3=Pakistan, etc.)
  app.get("/api/cricket/players", async (req, res) => {
    try {
      const teamId = String(req.query.teamid || "2").trim();
      const rapidKey = (typeof req.query.rapidapikey === "string" && req.query.rapidapikey.trim())
        ? req.query.rapidapikey.trim()
        : (typeof req.headers["x-rapidapi-key"] === "string" && req.headers["x-rapidapi-key"].trim()
          ? req.headers["x-rapidapi-key"].trim()
          : RAPIDAPI_KEY);

      const now = Date.now();
      const cached = rapidCache.players.get(teamId);
      if (cached && (now - cached.timestamp < rapidCache.TTL_STATIC)) {
        return res.json(cached.data);
      }

      const response = await fetch(`https://${RAPIDAPI_CRICKET_HOST}/teams/v1/${encodeURIComponent(teamId)}/players`, {
        headers: {
          "x-rapidapi-host": RAPIDAPI_CRICKET_HOST,
          "x-rapidapi-key": rapidKey,
        },
      });

      if (!response.ok) {
        return res.status(response.status).json({ error: "Failed to fetch players", status: response.status });
      }

      const data = await response.json();
      rapidCache.players.set(teamId, { timestamp: now, data });
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch players", message: err.message });
    }
  });

  // Helper: Normalize Sport Name from TheSportsDB
  function normalizeSportsDbSport(strSport: string = ""): { sport: string; sportName: string; sportIcon: string } {
    const s = strSport.toLowerCase();
    if (s.includes("soccer") || s.includes("football") && !s.includes("american")) {
      return { sport: "football", sportName: "Football", sportIcon: "fa-futbol" };
    }
    if (s.includes("cricket")) {
      return { sport: "cricket", sportName: "Cricket", sportIcon: "fa-baseball-bat-ball" };
    }
    if (s.includes("basketball") || s.includes("nba")) {
      return { sport: "basketball", sportName: "Basketball", sportIcon: "fa-basketball" };
    }
    if (s.includes("motorsport") || s.includes("racing") || s.includes("formula")) {
      return { sport: "motorsport", sportName: "Motorsport", sportIcon: "fa-car-side" };
    }
    if (s.includes("baseball") || s.includes("mlb")) {
      return { sport: "baseball", sportName: "Baseball", sportIcon: "fa-baseball" };
    }
    if (s.includes("tennis")) {
      return { sport: "tennis", sportName: "Tennis", sportIcon: "fa-table-tennis-paddle-ball" };
    }
    if (s.includes("ice hockey") || s.includes("hockey")) {
      return { sport: "hockey", sportName: "Ice Hockey", sportIcon: "fa-hockey-puck" };
    }
    if (s.includes("wwe") || s.includes("wrestling")) {
      return { sport: "wwe", sportName: "WWE", sportIcon: "fa-hand-fist" };
    }
    if (s.includes("fighting") || s.includes("mma") || s.includes("ufc") || s.includes("boxing")) {
      return { sport: "combat", sportName: "Combat Sports", sportIcon: "fa-hand-back-fist" };
    }
    return { sport: "football", sportName: strSport || "Sports", sportIcon: "fa-trophy" };
  }

  // Helper: Normalize a single TheSportsDB event
  function normalizeSportsDbEvent(raw: any): any {
    if (!raw || !raw.idEvent) return null;
    const { sport, sportName, sportIcon } = normalizeSportsDbSport(raw.strSport);

    let timestamp = Date.now();
    if (raw.strTimestamp) {
      let tsStr = String(raw.strTimestamp).trim();
      if (!tsStr.endsWith("Z") && !/[+-]\d{2}:?\d{2}$/.test(tsStr)) {
        tsStr = tsStr.replace(" ", "T") + "Z";
      }
      const parsed = Date.parse(tsStr);
      if (!isNaN(parsed)) timestamp = parsed;
    } else if (raw.dateEvent) {
      const timePart = raw.strTime ? raw.strTime.split("+")[0].split("Z")[0].trim() : "12:00:00";
      const parsed = Date.parse(`${raw.dateEvent}T${timePart}Z`);
      if (!isNaN(parsed)) timestamp = parsed;
    }

    const now = Date.now();
    const isLiveTime = now >= timestamp && now <= (timestamp + (2 * 3600 * 1000));
    const isPastTime = now > (timestamp + (2 * 3600 * 1000));

    let status = "upcoming";
    let statusText = "Scheduled";
    let statusLabel = "Upcoming";

    const hasScores = (raw.intHomeScore !== null && raw.intHomeScore !== undefined && raw.intHomeScore !== "") ||
                      (raw.intAwayScore !== null && raw.intAwayScore !== undefined && raw.intAwayScore !== "");

    if (raw.strStatus === "Match Finished" || raw.strPostponed === "yes" || isPastTime || (hasScores && !isLiveTime)) {
      status = "finished";
      statusText = "Full Time";
      statusLabel = "FT";
    } else if (isLiveTime || raw.strStatus === "Live") {
      status = "live";
      statusText = "LIVE NOW";
      statusLabel = "LIVE";
    }

    const homeScore = raw.intHomeScore !== null && raw.intHomeScore !== undefined ? String(raw.intHomeScore) : "";
    const awayScore = raw.intAwayScore !== null && raw.intAwayScore !== undefined ? String(raw.intAwayScore) : "";

    const matchTimeStr = formatDhakaEventTime(timestamp);

    let homeName = (raw.strHomeTeam || "").trim();
    let awayName = (raw.strAwayTeam || "").trim();
    const rawTitle = (raw.strEvent || "").trim();

    if ((!homeName || homeName.toLowerCase() === "home team") && rawTitle.includes(" vs ")) {
      const parts = rawTitle.split(" vs ");
      homeName = parts[0].trim();
      awayName = parts[1].trim();
    } else if ((!homeName || homeName.toLowerCase() === "home team") && rawTitle.includes(" v ")) {
      const parts = rawTitle.split(" v ");
      homeName = parts[0].trim();
      awayName = parts[1].trim();
    }

    if (!homeName || homeName.toLowerCase() === "home team" || !awayName || awayName.toLowerCase() === "away team") {
      if (!rawTitle || rawTitle.toLowerCase().includes("home team")) {
        return null;
      }
      homeName = rawTitle;
      awayName = raw.strLeague || "Match";
    }

    const homeLogo = raw.strHomeTeamBadge || raw.strThumb || "";
    const awayLogo = raw.strAwayTeamBadge || "";
    const title = rawTitle || `${homeName} vs ${awayName}`;
    const league = raw.strLeague || "Top League";

    const isHot = status === "live" ||
                  league.toLowerCase().includes("premier league") ||
                  league.toLowerCase().includes("champions league") ||
                  league.toLowerCase().includes("la liga") ||
                  league.toLowerCase().includes("serie a") ||
                  league.toLowerCase().includes("bundesliga");

    return {
      id: `tsdb-${raw.idEvent}`,
      idEvent: raw.idEvent,
      sport: sport,
      sportName: sportName,
      sportIcon: sportIcon,
      title: title,
      name: title,
      league: league,
      tournament: league,
      leagueBadge: raw.strLeagueBadge || "",
      matchDesc: raw.strRound ? `Round ${raw.strRound}` : (raw.strDescriptionEN || ""),
      status: status,
      statusText: statusText,
      statusLabel: statusLabel,
      timestamp: timestamp,
      date: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(timestamp)),
      matchTime: matchTimeStr,
      timeOrTimer: status === "live" ? "LIVE" : (status === "finished" ? (homeScore && awayScore ? `${homeScore} - ${awayScore}` : "FT") : matchTimeStr),
      venue: `${raw.strVenue || ""}${raw.strCountry ? `, ${raw.strCountry}` : ""}`,
      isHot: isHot,
      videoUrl: raw.strVideo || null,
      team1: {
        id: raw.idHomeTeam,
        name: homeName,
        logo: homeLogo,
        score: homeScore,
      },
      team2: {
        id: raw.idAwayTeam,
        name: awayName,
        logo: awayLogo,
        score: awayScore,
      },
      homeTeam: {
        id: raw.idHomeTeam,
        name: homeName,
        logo: homeLogo,
        score: homeScore,
      },
      awayTeam: {
        id: raw.idAwayTeam,
        name: awayName,
        logo: awayLogo,
        score: awayScore,
      },
      broadcaster: (raw.strTVStation || raw.strBroadcaster || raw.strBroadcast || raw.strChannel || "").trim(),
      broadcasters: (raw.strTVStation || raw.strBroadcaster || raw.strBroadcast || raw.strChannel || "") ? [(raw.strTVStation || raw.strBroadcaster || raw.strBroadcast || raw.strChannel || "").trim()] : [],
      strTVStation: (raw.strTVStation || "").trim(),
      subText: `${league} • ${matchTimeStr}`,
      source: "TheSportsDB (Free)",
      streams: [],
    };
  }

  // Helper: Fetch all curated events from TheSportsDB free API (Single-Flight Promise Coalescer)
  async function fetchTheSportsDBAllEvents(): Promise<any[]> {
    const now = Date.now();
    if (sportsDbCache.events && (now - sportsDbCache.events.timestamp < sportsDbCache.TTL_EVENTS)) {
      return sportsDbCache.events.data;
    }
    if (inFlightPromises.sportsDbEvents) {
      return inFlightPromises.sportsDbEvents;
    }

    inFlightPromises.sportsDbEvents = (async () => {
      const TOP_LEAGUE_IDS = [
        "4328", // English Premier League
        "4335", // Spanish La Liga
        "4332", // Italian Serie A
        "4331", // German Bundesliga
        "4334", // French Ligue 1
        "4480", // UEFA Champions League
        "4481", // UEFA Europa League
        "4833", // UEFA Conference League
        "4427", // UEFA Nations League
        "4906", // Saudi Pro League
        "4346", // MLS
        "4387", // NBA
        "4370", // Formula 1
        "4380", // NHL Ice Hockey
        "4464", // ATP Tennis
        "4517", // WTA Tennis
        "4581", // Laver Cup Tennis
        "4466", // Grand Slam Tennis (US Open)
        "4467", // Wimbledon
        "4885", // International Cricket Tours
        "4886", // ICC T20 World Cup
        "4443", // ICC Cricket World Cup / UFC
        "4444", // ICC Champions Trophy
        "4442", // Indian Premier League (IPL)
        "4887", // Big Bash League (BBL)
        "4888", // Pakistan Super League (PSL)
      ];

      const todayStr = new Date().toISOString().split("T")[0];
      const yestDate = new Date(Date.now() - 24 * 3600 * 1000).toISOString().split("T")[0];
      const tmwDate = new Date(Date.now() + 24 * 3600 * 1000).toISOString().split("T")[0];

      const promises: Promise<any>[] = [];

      // 1. Fetch next and past events for top leagues
      for (const lid of TOP_LEAGUE_IDS) {
        promises.push(
          fetch(`${THESPORTSDB_BASE}/eventsnextleague.php?id=${lid}`)
            .then((r) => (r.ok ? r.json() : { events: [] }))
            .catch(() => ({ events: [] }))
        );
        promises.push(
          fetch(`${THESPORTSDB_BASE}/eventspastleague.php?id=${lid}`)
            .then((r) => (r.ok ? r.json() : { events: [] }))
            .catch(() => ({ events: [] }))
        );
      }

      // 2. Fetch day schedules
      for (const d of [todayStr, tmwDate, yestDate]) {
        promises.push(
          fetch(`${THESPORTSDB_BASE}/eventsday.php?d=${d}`)
            .then((r) => (r.ok ? r.json() : { events: [] }))
            .catch(() => ({ events: [] }))
        );
      }

      try {
        const results = await Promise.allSettled(promises);
        const seenEventIds = new Set<string>();
        const normalizedEvents: any[] = [];

        for (const res of results) {
          if (res.status === "fulfilled" && res.value && Array.isArray(res.value.events)) {
            for (const rawEv of res.value.events) {
              if (rawEv && rawEv.idEvent && !seenEventIds.has(rawEv.idEvent)) {
                seenEventIds.add(rawEv.idEvent);
                const norm = normalizeSportsDbEvent(rawEv);
                if (norm) normalizedEvents.push(norm);
              }
            }
          }
        }

        if (normalizedEvents.length > 0) {
          sportsDbCache.events = { timestamp: Date.now(), data: normalizedEvents };
          return normalizedEvents;
        }
      } catch (err: any) {
        console.warn("[TheSportsDB] Batch events fetch failed:", err.message);
      } finally {
        inFlightPromises.sportsDbEvents = null;
      }

      return sportsDbCache.events?.data || [];
    })();

    return inFlightPromises.sportsDbEvents;
  }

  // Endpoint: TheSportsDB All Free Normalized Events
  app.get("/api/thesportsdb/events", async (_req, res) => {
    try {
      const events = await fetchTheSportsDBAllEvents();
      res.json({
        status: "success",
        source: "TheSportsDB (Free Tier)",
        total: events.length,
        data: events,
      });
    } catch (err: any) {
      console.warn("[TheSportsDB] Events fetch error:", err.message);
      res.json({ status: "error", message: err.message, data: sportsDbCache.events?.data || [] });
    }
  });

  // Endpoint: TheSportsDB Single League Lookup (Cached)
  app.get("/api/thesportsdb/league/:id", async (req, res) => {
    try {
      const leagueId = String(req.params.id || "4328").trim();
      const now = Date.now();
      const cached = sportsDbCache.leagues.get(leagueId);
      if (cached && (now - cached.timestamp < sportsDbCache.TTL_LEAGUES)) {
        return res.json({ status: "success", leagueId, data: cached.data, cached: true });
      }

      const [nextRes, pastRes] = await Promise.all([
        fetch(`${THESPORTSDB_BASE}/eventsnextleague.php?id=${encodeURIComponent(leagueId)}`),
        fetch(`${THESPORTSDB_BASE}/eventspastleague.php?id=${encodeURIComponent(leagueId)}`),
      ]);
      const nextData = nextRes.ok ? await nextRes.json() : { events: [] };
      const pastData = pastRes.ok ? await pastRes.json() : { events: [] };

      const all = [...(nextData.events || []), ...(pastData.events || [])];
      const normalized = all.map(normalizeSportsDbEvent).filter(Boolean);
      sportsDbCache.leagues.set(leagueId, { timestamp: now, data: normalized });
      res.json({ status: "success", leagueId, data: normalized });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch league events", message: err.message });
    }
  });

  // Endpoint: TheSportsDB Single Event Details (Cached)
  app.get("/api/thesportsdb/event/:id", async (req, res) => {
    try {
      const eventId = String(req.params.id || "").replace(/^tsdb-/, "").trim();
      const now = Date.now();
      const cached = sportsDbCache.details.get(eventId);
      if (cached && (now - cached.timestamp < sportsDbCache.TTL_DETAILS)) {
        return res.json({ status: "success", data: cached.data, cached: true });
      }

      const response = await fetch(`${THESPORTSDB_BASE}/lookupevent.php?id=${encodeURIComponent(eventId)}`);
      if (!response.ok) {
        return res.status(response.status).json({ error: "Event lookup failed" });
      }
      const data = await response.json();
      const raw = (data.events && data.events[0]) || null;
      if (!raw) {
        return res.status(404).json({ error: "Event not found" });
      }
      const norm = normalizeSportsDbEvent(raw);
      sportsDbCache.details.set(eventId, { timestamp: now, data: norm });
      res.json({ status: "success", data: norm, raw });
    } catch (err: any) {
      res.status(500).json({ error: "Event details error", message: err.message });
    }
  });

  // Lookup Fixture Broadcaster by Event / Fixture ID
  app.get("/api/fixture/broadcaster", async (req, res) => {
    try {
      const fixtureId = String(req.query.fixtureId || req.query.id || "").trim();
      if (!fixtureId) {
        return res.status(400).json({ status: "error", error: "fixtureId is required" });
      }

      // Check rapidCache and sportsDbCache first if cached events have broadcaster
      const allCached = [
        ...(rapidCache.matches?.data || []),
        ...(sportsDbCache.events?.data || [])
      ];
      const cachedEv = allCached.find((e: any) =>
        String(e.id) === fixtureId || String(e.rawId) === fixtureId || String(e.idEvent) === fixtureId
      );
      if (cachedEv && (cachedEv.broadcaster || cachedEv.strTVStation)) {
        const rawStation = String(cachedEv.broadcaster || cachedEv.strTVStation).trim();
        if (rawStation) {
          const broadcasters = rawStation
            .split(/[,/|;+&]|\band\b|\bor\b/i)
            .map((s: string) => s.trim())
            .filter(Boolean);
          return res.json({
            status: "success",
            fixtureId,
            broadcaster: rawStation,
            broadcasters,
            source: "Cache"
          });
        }
      }

      // Check TheSportsDB event lookup if fixture is numeric or starts with tsdb-
      const cleanTsdbId = fixtureId.replace(/^tsdb-/, "");
      if (/^\d+$/.test(cleanTsdbId)) {
        const response = await fetch(`${THESPORTSDB_BASE}/lookupevent.php?id=${encodeURIComponent(cleanTsdbId)}`);
        if (response.ok) {
          const data = await response.json();
          const raw = (data.events && data.events[0]) || null;
          if (raw) {
            const rawStation = String(raw.strTVStation || raw.strBroadcaster || raw.strBroadcast || "").trim();
            const broadcasters = rawStation
              ? rawStation.split(/[,/|;+&]|\band\b|\bor\b/i).map((s: string) => s.trim()).filter(Boolean)
              : [];
            return res.json({
              status: "success",
              fixtureId,
              broadcaster: rawStation,
              broadcasters,
              source: "TheSportsDB"
            });
          }
        }
      }

      return res.json({
        status: "not_found",
        fixtureId,
        broadcaster: "",
        broadcasters: []
      });
    } catch (err: any) {
      res.status(500).json({ status: "error", message: err.message });
    }
  });

  // =========================================================================
  // SofaScore RapidAPI Integration Engine & Proxy
  // =========================================================================
  function normalizeSofaScoreEvent(item: any, customSport?: string): any {
    if (!item) return null;

    const eventId = String(item.id || item.event_key || item.customId || Math.random().toString(36).substring(7));
    const homeTeam = item.homeTeam || item.home_team || item.team1 || {};
    const awayTeam = item.awayTeam || item.away_team || item.team2 || {};

    const homeName = (homeTeam.name || "Home Team").trim();
    const awayName = (awayTeam.name || "Away Team").trim();

    if (!homeName && !awayName) return null;

    const homeLogo = homeTeam.id
      ? `https://api.sofascore.app/api/v1/team/${homeTeam.id}/image`
      : (homeTeam.logo || homeTeam.image_path || "");

    const awayLogo = awayTeam.id
      ? `https://api.sofascore.app/api/v1/team/${awayTeam.id}/image`
      : (awayTeam.logo || awayTeam.image_path || "");

    let sport = (
      customSport ||
      item.tournament?.category?.sport?.name ||
      item.league?.sport?.name ||
      item.sport?.name ||
      item.sport ||
      "Football"
    ).trim();

    // Capitalize sport name for consistency
    sport = sport.charAt(0).toUpperCase() + sport.slice(1).toLowerCase();
    if (sport.toLowerCase() === "soccer") sport = "Football";

    const league = (
      item.tournament?.name ||
      item.league?.name ||
      item.tournament?.uniqueTournament?.name ||
      "SofaScore"
    ).trim();

    // Determine status: live, upcoming, or finished
    const statusType = String(item.status?.type || item.status || "").toLowerCase();
    const statusDesc = String(item.status?.description || item.status_more || "").toLowerCase();

    let status = "upcoming";
    if (
      statusType === "inprogress" ||
      statusType === "live" ||
      statusDesc.includes("live") ||
      statusDesc.includes("half") ||
      statusDesc.includes("quarter") ||
      statusDesc.includes("period") ||
      statusDesc.includes("set") ||
      statusDesc.includes("over")
    ) {
      status = "live";
    } else if (
      statusType === "finished" ||
      statusType === "ended" ||
      statusType === "postponed" ||
      statusType === "canceled" ||
      statusType === "abandoned" ||
      statusType === "interrupted" ||
      statusDesc.includes("ft") ||
      statusDesc.includes("ended") ||
      statusDesc.includes("finished") ||
      statusDesc.includes("full time") ||
      statusDesc.includes("aet") ||
      statusDesc.includes("extra time") ||
      statusDesc.includes("penalties") ||
      statusDesc.includes("abandoned")
    ) {
      status = "finished";
    }

    const homeScoreVal = item.homeScore?.current ?? item.home_score?.current ?? null;
    const awayScoreVal = item.awayScore?.current ?? item.away_score?.current ?? null;
    const homeScore = (homeScoreVal !== null && homeScoreVal !== undefined) ? String(homeScoreVal) : "";
    const awayScore = (awayScoreVal !== null && awayScoreVal !== undefined) ? String(awayScoreVal) : "";

    let matchTimestamp = Date.now();
    if (item.startTimestamp) {
      matchTimestamp = Number(item.startTimestamp) * 1000;
    } else if (item.start_at) {
      matchTimestamp = new Date(item.start_at).getTime() || Date.now();
    }

    const title = `${homeName} vs ${awayName}`;
    const dateStr = new Date(matchTimestamp).toISOString().split("T")[0];
    const timeStr = new Date(matchTimestamp).toTimeString().substring(0, 5);

    return {
      id: `sofascore-${eventId}`,
      sport: sport,
      league: league,
      title: title,
      date: dateStr,
      time: timeStr,
      status: status,
      channelId: null, // Matched dynamically in frontend via rules
      timestamp: matchTimestamp,
      teams: [homeName, awayName],
      team1: {
        name: homeName,
        logo: homeLogo,
        score: homeScore
      },
      team2: {
        name: awayName,
        logo: awayLogo,
        score: awayScore
      },
      homeTeam: {
        name: homeName,
        logo: homeLogo,
        score: homeScore
      },
      awayTeam: {
        name: awayName,
        logo: awayLogo,
        score: awayScore
      },
      score: (homeScore && awayScore) ? `${homeScore} - ${awayScore}` : "",
      broadcaster: String(item.broadcaster || item.tv || item.media?.broadcaster || item.channel || item.strTVStation || "").trim(),
      broadcasters: String(item.broadcaster || item.tv || item.media?.broadcaster || item.channel || item.strTVStation || "").trim() ? [String(item.broadcaster || item.tv || item.media?.broadcaster || item.channel || item.strTVStation || "").trim()] : [],
      customId: item.customId || null,
      sofascoreId: eventId,
      slug: item.slug || "",
      source: "SofaScore RapidAPI",
      streams: []
    };
  }

  async function getNormalizedSofaScoreMatches(customKey?: string, customHost?: string): Promise<{ status: string; count: number; message?: string; data: any[] }> {
    const activeKey = (customKey && customKey.trim()) ? customKey.trim() : (SOFASCORE_API_KEY || RAPIDAPI_KEY);
    const activeHost = sanitizeSofaScoreHost(customHost);

    if (!activeKey) {
      return {
        status: "unconfigured",
        count: 0,
        message: "RapidAPI SofaScore key is not configured. Please add your key in Settings or SOFASCORE_API_KEY in .env",
        data: []
      };
    }

    const now = Date.now();
    if (sofaScoreCache.matches && (now - sofaScoreCache.matches.timestamp < sofaScoreCache.TTL_MATCHES)) {
      return {
        status: "success",
        count: sofaScoreCache.matches.data.length,
        data: sofaScoreCache.matches.data
      };
    }

    if (inFlightPromises.sofaScoreMatches) {
      const cached = await inFlightPromises.sofaScoreMatches;
      return {
        status: "success",
        count: cached?.length || 0,
        data: cached || []
      };
    }

    inFlightPromises.sofaScoreMatches = (async () => {
      try {
        const headers = {
          "Content-Type": "application/json",
          "x-rapidapi-host": activeHost,
          "x-rapidapi-key": activeKey,
          "Accept": "application/json",
          "User-Agent": "HighFy-TV-Sports/4.2"
        };

        const rawEvents: any[] = [];
        
        // Fetch matches from top teams on SofaScore
        const topTeams = [42, 2829, 2817, 17, 35, 44, 38, 2672];
        const fetchPromises = topTeams.map(async (tid) => {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 6000);
            const resp = await fetch(`https://${activeHost}/teams/get-matches?teamId=${tid}`, {
              headers,
              signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (resp.ok) {
              const json = await resp.json();
              if (Array.isArray(json?.events)) {
                return json.events;
              }
            }
          } catch (e) {}
          return [];
        });

        const results = await Promise.allSettled(fetchPromises);
        for (const res of results) {
          if (res.status === "fulfilled" && Array.isArray(res.value)) {
            rawEvents.push(...res.value);
          }
        }

        const normalizedEvents: any[] = [];
        const seen = new Set<string>();

        for (const item of rawEvents) {
          const norm = normalizeSofaScoreEvent(item);
          if (norm && !seen.has(norm.id)) {
            seen.add(norm.id);
            normalizedEvents.push(norm);
          }
        }

        normalizedEvents.sort((a, b) => {
          const rank = (s: string) => (s === "live" ? 0 : s === "upcoming" ? 1 : 2);
          const rDiff = rank(a.status) - rank(b.status);
          if (rDiff !== 0) return rDiff;
          if (a.status === "upcoming") return a.timestamp - b.timestamp;
          return b.timestamp - a.timestamp;
        });

        if (normalizedEvents.length > 0) {
          sofaScoreCache.matches = { timestamp: now, data: normalizedEvents };
        }

        return normalizedEvents;
      } catch (err: any) {
        console.warn("[SofaScore] Error fetching matches:", err.message);
        return sofaScoreCache.matches ? sofaScoreCache.matches.data : [];
      } finally {
        inFlightPromises.sofaScoreMatches = null;
      }
    })();

    const result = await inFlightPromises.sofaScoreMatches;
    return {
      status: "success",
      count: result ? result.length : 0,
      data: result || []
    };
  }

  // SofaScore Normalized Matches Endpoint
  app.get("/api/sofascore/matches", async (req, res) => {
    try {
      const apiKey = String(
        req.query.key ||
        req.query.APIkey ||
        req.query.apikey ||
        req.headers["x-rapidapi-key"] ||
        req.headers["x-sofascore-key"] ||
        SOFASCORE_API_KEY ||
        RAPIDAPI_KEY ||
        ""
      ).trim();

      const host = sanitizeSofaScoreHost(
        req.query.host ||
        req.headers["x-rapidapi-host"]
      );

      const result = await getNormalizedSofaScoreMatches(apiKey, host);
      return res.json({
        ...result,
        source: "SofaScore RapidAPI",
        host: host
      });
    } catch (err: any) {
      return res.status(500).json({
        status: "error",
        message: err.message,
        data: []
      });
    }
  });

  // SofaScore Test Key Endpoint
  app.get("/api/sofascore/test", async (req, res) => {
    try {
      const apiKey = String(
        req.query.key ||
        req.query.APIkey ||
        req.headers["x-rapidapi-key"] ||
        SOFASCORE_API_KEY ||
        RAPIDAPI_KEY ||
        ""
      ).trim();

      const host = sanitizeSofaScoreHost(
        req.query.host ||
        req.headers["x-rapidapi-host"]
      );

      if (!apiKey) {
        return res.status(400).json({
          valid: false,
          message: "RapidAPI key is required for SofaScore test."
        });
      }

      // Test with reliable endpoint sports/list?countryCode=GB
      try {
        const testResp = await fetch(`https://${host}/sports/list?countryCode=GB`, {
          headers: {
            "Content-Type": "application/json",
            "x-rapidapi-host": host,
            "x-rapidapi-key": apiKey,
            "Accept": "application/json"
          },
          signal: AbortSignal.timeout(6000)
        });

        if (testResp.status < 400) {
          let sportsCount = 0;
          try {
            const testData = await testResp.json();
            sportsCount = Array.isArray(testData?.countrySportPriorities) ? testData.countrySportPriorities.length : 0;
          } catch (e) {}
          return res.json({
            valid: true,
            message: `RapidAPI SofaScore key is valid and working on ${host}! (${sportsCount} sports active)`,
            host: host,
            sportsCount
          });
        }

        const respText = await testResp.text();
        let parsed: any = null;
        try {
          parsed = JSON.parse(respText);
        } catch (e) {}

        return res.status(testResp.status).json({
          valid: false,
          message: parsed?.message || `Authentication failed: Status ${testResp.status} from ${host}`,
          host: host
        });
      } catch (e: any) {
        return res.status(500).json({
          valid: false,
          message: `Connection failed: ${e.message}`,
          host: host
        });
      }
    } catch (err: any) {
      return res.status(500).json({
        valid: false,
        message: err.message
      });
    }
  });

  // Cricbuzz Test Key Endpoint
  app.get("/api/cricbuzz/test", async (req, res) => {
    try {
      const apiKey = String(
        req.query.key ||
        req.query.APIkey ||
        req.headers["x-rapidapi-key"] ||
        RAPIDAPI_KEY ||
        ""
      ).trim();

      const host = RAPIDAPI_CRICKET_HOST;

      if (!apiKey) {
        return res.status(400).json({
          valid: false,
          message: "RapidAPI key is required for Cricbuzz test."
        });
      }

      try {
        const testResp = await fetch(`https://${host}/matches/v1/live`, {
          headers: {
            "Content-Type": "application/json",
            "x-rapidapi-host": host,
            "x-rapidapi-key": apiKey,
            "Accept": "application/json"
          },
          signal: AbortSignal.timeout(6000)
        });

        const respText = await testResp.text();
        let parsed: any = null;
        try {
          parsed = JSON.parse(respText);
        } catch (e) {}

        if (testResp.status < 400) {
          const typeMatchesCount = Array.isArray(parsed?.typeMatches) ? parsed.typeMatches.length : 0;
          return res.json({
            valid: true,
            status: testResp.status,
            message: `RapidAPI Cricbuzz key is valid and working on ${host}! (${typeMatchesCount} match categories active)`,
            host,
            typeMatchesCount
          });
        }

        return res.status(testResp.status).json({
          valid: false,
          status: testResp.status,
          message: parsed?.message || `Cricbuzz request failed: Status ${testResp.status} from ${host}`,
          host
        });
      } catch (e: any) {
        return res.status(500).json({
          valid: false,
          message: `Connection failed: ${e.message}`,
          host
        });
      }
    } catch (err: any) {
      return res.status(500).json({
        valid: false,
        message: err.message
      });
    }
  });

  // Combined RapidAPI Diagnostic Endpoint (SofaScore + Cricbuzz)
  app.get("/api/rapidapi/test", async (req, res) => {
    try {
      const apiKey = String(
        req.query.key ||
        req.query.APIkey ||
        req.headers["x-rapidapi-key"] ||
        RAPIDAPI_KEY ||
        ""
      ).trim();

      if (!apiKey) {
        return res.status(400).json({
          valid: false,
          message: "RapidAPI key is required."
        });
      }

      const results: any = {
        keyPreview: apiKey.slice(0, 8) + "..." + apiKey.slice(-4),
        sofascore: null,
        cricbuzz: null
      };

      // 1. Check SofaScore
      try {
        const sResp = await fetch(`https://${SOFASCORE_RAPIDAPI_HOST}/sports/list?countryCode=GB`, {
          headers: {
            "x-rapidapi-host": SOFASCORE_RAPIDAPI_HOST,
            "x-rapidapi-key": apiKey
          },
          signal: AbortSignal.timeout(6000)
        });
        const sText = await sResp.text();
        let sJson: any = null;
        try { sJson = JSON.parse(sText); } catch (e) {}

        results.sofascore = {
          host: SOFASCORE_RAPIDAPI_HOST,
          status: sResp.status,
          working: sResp.status === 200,
          details: sResp.status === 200
            ? `Active (${Array.isArray(sJson?.countrySportPriorities) ? sJson.countrySportPriorities.length : 0} sports supported)`
            : (sJson?.message || `Status ${sResp.status}`)
        };
      } catch (err: any) {
        results.sofascore = {
          host: SOFASCORE_RAPIDAPI_HOST,
          status: 500,
          working: false,
          details: err.message
        };
      }

      // 2. Check Cricbuzz
      try {
        const cResp = await fetch(`https://${RAPIDAPI_CRICKET_HOST}/matches/v1/live`, {
          headers: {
            "x-rapidapi-host": RAPIDAPI_CRICKET_HOST,
            "x-rapidapi-key": apiKey
          },
          signal: AbortSignal.timeout(6000)
        });
        const cText = await cResp.text();
        let cJson: any = null;
        try { cJson = JSON.parse(cText); } catch (e) {}

        results.cricbuzz = {
          host: RAPIDAPI_CRICKET_HOST,
          status: cResp.status,
          working: cResp.status === 200,
          details: cResp.status === 200
            ? "Active (live matches reachable)"
            : (cJson?.message || `Status ${cResp.status}`)
        };
      } catch (err: any) {
        results.cricbuzz = {
          host: RAPIDAPI_CRICKET_HOST,
          status: 500,
          working: false,
          details: err.message
        };
      }

      return res.json(results);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // SofaScore Sports List Endpoint (sports/list?countryCode=GB)
  app.get(["/sports/list", "/api/sports/list", "/api/sofascore/sports/list", "/api/sofascore/sports"], async (req, res) => {
    try {
      const countryCode = String(req.query.countryCode || req.query.country || "GB").trim().toUpperCase();
      const apiKey = String(
        req.query.key ||
        req.headers["x-rapidapi-key"] ||
        SOFASCORE_API_KEY ||
        RAPIDAPI_KEY ||
        ""
      ).trim();

      const host = sanitizeSofaScoreHost(
        req.query.host ||
        req.headers["x-rapidapi-host"]
      );

      if (!apiKey) {
        return res.status(400).json({ status: "error", error: "RapidAPI key is required" });
      }

      const cacheKey = `sports_list:${countryCode}`;
      const now = Date.now();
      const cached = sofaScoreCache.proxy.get(cacheKey);
      if (cached && (now - cached.timestamp < 300000)) {
        return res.json(cached.data);
      }

      const targetUrl = `https://${host}/sports/list?countryCode=${encodeURIComponent(countryCode)}`;
      const upstream = await fetch(targetUrl, {
        headers: {
          "Content-Type": "application/json",
          "x-rapidapi-host": host,
          "x-rapidapi-key": apiKey,
          "Accept": "application/json",
          "User-Agent": "HighFy-TV-Sports/4.2"
        },
        signal: AbortSignal.timeout(8000)
      });

      if (!upstream.ok) {
        return res.status(upstream.status).json({
          status: "error",
          error: `RapidAPI error: ${upstream.statusText}`
        });
      }

      const data = await upstream.json();
      const countrySportPriorities = Array.isArray(data?.countrySportPriorities) ? data.countrySportPriorities : [];
      const sports = countrySportPriorities.map((item: any) => ({
        id: item.sport?.id,
        name: item.sport?.name,
        slug: item.sport?.slug,
        position: item.position,
        country: item.country
      }));

      const responsePayload = {
        countrySportPriorities,
        status: "success",
        countryCode,
        count: sports.length,
        sports
      };

      sofaScoreCache.proxy.set(cacheKey, { timestamp: now, data: responsePayload });
      return res.json(responsePayload);
    } catch (err: any) {
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  // SofaScore Head-to-Head (H2H) Events Endpoint (matches/get-h2h-events)
  app.get("/api/sofascore/h2h", async (req, res) => {
    try {
      const customId = String(req.query.customId || req.query.id || "").trim();
      const apiKey = String(
        req.query.key ||
        req.headers["x-rapidapi-key"] ||
        SOFASCORE_API_KEY ||
        RAPIDAPI_KEY ||
        ""
      ).trim();

      const host = sanitizeSofaScoreHost(
        req.query.host ||
        req.headers["x-rapidapi-host"]
      );

      if (!apiKey) {
        return res.status(400).json({ error: "RapidAPI key is required" });
      }

      const cacheKey = `h2h:${customId || "all"}`;
      const now = Date.now();
      const cached = sofaScoreCache.proxy.get(cacheKey);
      if (cached && (now - cached.timestamp < 120000)) {
        return res.json(cached.data);
      }

      const targetUrl = `https://${host}/matches/get-h2h-events${customId ? `?customId=${encodeURIComponent(customId)}` : ""}`;
      const upstream = await fetch(targetUrl, {
        headers: {
          "Content-Type": "application/json",
          "x-rapidapi-host": host,
          "x-rapidapi-key": apiKey,
          "Accept": "application/json",
          "User-Agent": "HighFy-TV-Sports/4.2"
        },
        signal: AbortSignal.timeout(6000)
      });

      if (upstream.status === 204) {
        return res.json({ events: [] });
      }

      if (!upstream.ok) {
        return res.status(upstream.status).json({
          error: `RapidAPI error: ${upstream.statusText}`
        });
      }

      const data = await upstream.json();
      sofaScoreCache.proxy.set(cacheKey, { timestamp: now, data });
      return res.json(data);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // SofaScore Generic RapidAPI Proxy Endpoint
  app.get("/api/sofascore/proxy", async (req, res) => {
    try {
      let endpoint = String(req.query.path || req.query.url || "/sports/list?countryCode=GB").trim();
      const apiKey = String(
        req.query.key ||
        req.headers["x-rapidapi-key"] ||
        SOFASCORE_API_KEY ||
        RAPIDAPI_KEY ||
        ""
      ).trim();

      const host = sanitizeSofaScoreHost(
        req.query.host ||
        req.headers["x-rapidapi-host"]
      );

      if (!apiKey) {
        return res.status(400).json({ error: "API key is required" });
      }

      // Handle absolute URL if passed in path or url
      if (endpoint.startsWith("http://") || endpoint.startsWith("https://")) {
        try {
          const parsedUrl = new URL(endpoint);
          endpoint = parsedUrl.pathname + parsedUrl.search;
        } catch (e) {
          endpoint = endpoint.replace(/^https?:\/\/[^\/]+/, "");
        }
      }

      let cleanPath = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;

      // Append any extra query parameters if not already in cleanPath
      const extraParams = new URLSearchParams();
      for (const [k, v] of Object.entries(req.query)) {
        if (k !== "path" && k !== "url" && k !== "key" && k !== "host" && typeof v === "string") {
          if (!cleanPath.includes(`${k}=`)) {
            extraParams.append(k, v);
          }
        }
      }
      const extraQs = extraParams.toString();
      if (extraQs) {
        cleanPath += (cleanPath.includes("?") ? "&" : "?") + extraQs;
      }

      const cacheKey = `${host}:${cleanPath}`;
      const now = Date.now();
      const cached = sofaScoreCache.proxy.get(cacheKey);

      if (cached && (now - cached.timestamp < sofaScoreCache.TTL_PROXY)) {
        return res.json(cached.data);
      }

      const targetUrl = `https://${host}${cleanPath}`;
      const upstream = await fetch(targetUrl, {
        headers: {
          "Content-Type": "application/json",
          "x-rapidapi-key": apiKey,
          "x-rapidapi-host": host,
          "Accept": "application/json",
          "User-Agent": "HighFy-TV-Sports/4.2"
        },
        signal: AbortSignal.timeout(8000)
      });

      if (upstream.status === 204) {
        return res.json({ data: [] });
      }

      if (!upstream.ok) {
        return res.status(upstream.status).json({
          error: `RapidAPI error: ${upstream.statusText}`
        });
      }

      const data = await upstream.json();
      sofaScoreCache.proxy.set(cacheKey, { timestamp: now, data });
      return res.json(data);
    } catch (err: any) {
      return res.status(500).json({ error: "SofaScore proxy error", message: err.message });
    }
  });

  // Universal Resilient M3U8 & Live Stream Proxy with CORS & URL Rewriting
  app.options("/api/stream-proxy", (_req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.sendStatus(204);
  });

  app.get("/api/stream-proxy", async (req, res) => {
    try {
      const threat = isReqableOrSnifferThreat(req);
      if (threat.detected) {
        return res.status(403).json({
          status: "error",
          blocked: true,
          code: "REQABLE_DETECTED",
          threat: threat.reason,
          message: "reqable আনইস্টল করো",
          detail: "নিরাপত্তা সতর্কতা: আপনার ডিভাইসে Reqable বা নেটওয়ার্ক স্নিফিং অ্যাপ সনাক্ত করা হয়েছে। লাইভ স্ট্রিম দেখার জন্য Reqable আনইন্সটল করুন।"
        });
      }

      let decodedUrl = "";
      if (typeof req.query.token === "string" && req.query.token.trim()) {
        const dec = decryptStreamUrl(req.query.token.trim());
        if (!dec) {
          return res.status(403).send("Invalid or expired stream security token");
        }
        decodedUrl = dec;
      } else if (typeof req.query.url === "string" && req.query.url.trim()) {
        decodedUrl = decodeURIComponent(req.query.url).trim();
      } else {
        return res.status(400).send("Missing stream token or URL");
      }

      if (!/^https?:\/\//i.test(decodedUrl)) {
        return res.status(400).send("Invalid stream URL protocol");
      }

      const targetUrlObj = new URL(decodedUrl);
      const origin = targetUrlObj.origin;

      const fetchHeaders: Record<string, string> = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "Accept-Language": "en-US,en;q=0.9,bn;q=0.8,hi;q=0.7",
        "Referer": origin + "/",
        "Origin": origin,
      };

      if (req.headers.range) {
        fetchHeaders["Range"] = req.headers.range as string;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const targetRes = await fetch(decodedUrl, {
        headers: fetchHeaders,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Pass CORS and low-latency streaming headers
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "*");
      res.setHeader("X-Accel-Buffering", "no"); // Disables reverse proxy buffering for immediate chunk delivery

      const contentType = targetRes.headers.get("content-type") || "";
      const pathname = targetUrlObj.pathname.toLowerCase();
      const isExplicitSegment = pathname.endsWith(".ts") ||
                                pathname.endsWith(".m4s") ||
                                pathname.endsWith(".mp4") ||
                                pathname.endsWith(".aac") ||
                                decodedUrl.includes(".ts?") ||
                                decodedUrl.includes(".m4s?") ||
                                (decodedUrl.includes("tracks-v1a1/") && pathname.endsWith(".ts"));

      // 1. Direct High-Speed Segment Streaming (Bypasses in-memory buffering for zero-lag video packets)
      if (isExplicitSegment && targetRes.body) {
        if (contentType && !contentType.includes("mpegurl")) {
          res.setHeader("Content-Type", contentType);
        } else {
          res.setHeader("Content-Type", "video/mp2t");
        }
        res.setHeader("Cache-Control", "public, max-age=60, immutable");
        const cl = targetRes.headers.get("content-length");
        if (cl) res.setHeader("Content-Length", cl);
        const cr = targetRes.headers.get("content-range");
        if (cr) res.setHeader("Content-Range", cr);
        const ar = targetRes.headers.get("accept-ranges");
        if (ar) res.setHeader("Accept-Ranges", ar);

        res.status(targetRes.status);
        const nodeStream = Readable.fromWeb(targetRes.body as any);
        nodeStream.pipe(res);
        req.on("close", () => {
          try { nodeStream.destroy(); } catch {}
        });
        return;
      }

      // 2. Otherwise inspect body (M3U8 Manifest, AES Key, or other format)
      const rawBuffer = Buffer.from(await targetRes.arrayBuffer());

      // Check if it is an M3U8 manifest (starts with #EXTM3U)
      const isM3U8Manifest = rawBuffer.length > 0 &&
                             rawBuffer.length < 2000000 &&
                             rawBuffer.toString("utf8", 0, Math.min(rawBuffer.length, 128)).includes("#EXTM3U");

      if (isM3U8Manifest) {
        const manifestText = rawBuffer.toString("utf8");
        const lines = manifestText.split(/\r?\n/);
        const rewrittenLines = lines.map((line) => {
          const trimmed = line.trim();
          if (!trimmed) return line;

          // Handle M3U8 tags and comments starting with '#'
          if (trimmed.startsWith("#")) {
            if (trimmed.startsWith("#EXT")) {
              return line.replace(/URI="([^"]+)"/g, (_match, uri) => {
                try {
                  const absUri = new URL(uri, decodedUrl).toString();
                  return `URI="/api/stream-proxy?token=${encodeURIComponent(encryptStreamUrl(absUri))}"`;
                } catch {
                  return `URI="${uri}"`;
                }
              });
            }
            return line;
          }

          // Handle TS/AAC/M3U8 URI line
          try {
            const absUrl = new URL(trimmed, decodedUrl).toString();
            return `/api/stream-proxy?token=${encodeURIComponent(encryptStreamUrl(absUrl))}`;
          } catch {
            return line;
          }
        });

        res.setHeader("Content-Type", "application/vnd.apple.mpegurl; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        return res.send(rewrittenLines.join("\n"));
      }

      // If it is NOT an M3U8 manifest, handle AES key or media
      const isKey = decodedUrl.includes("pkey=") ||
                    decodedUrl.includes(".pkey") ||
                    decodedUrl.includes("aes128.key") ||
                    (rawBuffer.length === 16);

      if (isKey) {
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      } else {
        if (contentType && !contentType.includes("mpegurl")) {
          res.setHeader("Content-Type", contentType);
        } else {
          res.setHeader("Content-Type", "video/mp2t");
        }
        res.setHeader("Cache-Control", "public, max-age=60, immutable");
      }

      res.setHeader("Content-Length", rawBuffer.length.toString());
      const contentRange = targetRes.headers.get("content-range");
      if (contentRange) res.setHeader("Content-Range", contentRange);
      const acceptRanges = targetRes.headers.get("accept-ranges");
      if (acceptRanges) res.setHeader("Accept-Ranges", acceptRanges);

      res.status(targetRes.status);
      return res.send(rawBuffer);
    } catch (err: any) {
      if (!res.headersSent) {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.status(502).json({ error: "Stream proxy failed", details: err.message });
      }
    }
  });

  // Universal Real Image Proxy (Allows any image URL to load safely bypassing CORS & hotlinking blocks)
  app.get("/api/image-proxy", async (req, res) => {
    try {
      const rawUrl = req.query.url;
      if (!rawUrl || typeof rawUrl !== "string") {
        return res.status(400).json({ error: "Missing image url parameter" });
      }

      const decodedUrl = decodeURIComponent(rawUrl.trim());
      if (!/^https?:\/\//i.test(decodedUrl)) {
        return res.status(400).json({ error: "Invalid URL protocol" });
      }

      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

      const imgRes = await fetch(decodedUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          "Referer": new URL(decodedUrl).origin
        }
      });

      if (!imgRes.ok) {
        return res.status(imgRes.status).send(`Failed to fetch image: ${imgRes.status}`);
      }

      const contentType = imgRes.headers.get("content-type") || "image/png";
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");

      const arrayBuf = await imgRes.arrayBuffer();
      res.send(Buffer.from(arrayBuf));
    } catch (err: any) {
      if (!res.headersSent) {
        res.status(500).json({ error: "Image proxy error", message: err.message });
      }
    }
  });

  // Backend Health check (Does not expose internal keys or secrets)
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      secure: true,
      rapidApiConfigured: !!RAPIDAPI_KEY,
      sofascoreConfigured: !!RAPIDAPI_KEY,
      cricbuzzConfigured: ENABLE_CRICBUZZ_API && !!RAPIDAPI_KEY,
      cricbuzzPaused: !ENABLE_CRICBUZZ_API,
      sportradarConfigured: !!SPORTRADAR_CRICKET_API_KEY,
      thesportsdbConfigured: true,
    });
  });

  // Vite middleware for development vs Static files in production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[HIGHFY TV Server] Running securely on http://0.0.0.0:${PORT}`);
  });
}

startServer();
