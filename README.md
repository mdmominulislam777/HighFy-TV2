# ⚡ HIGHFY TV — Live TV & Sports Streaming Platform (v4.2)

A high-performance, mobile-first Web & Android TV application for live sports events (**Football**, **Cricket**, **WWE**) and M3U8/HLS TV channels. Built with vanilla HTML5, CSS3, and JavaScript, strictly compatible with **GitHub Pages** (zero backend/server required).

---

## 📁 File Structure

```text
/
├── index.html          # Main application structure & views
├── style.css           # AMOLED dark theme stylesheet (responsive & TV-ready)
├── script.js           # Core application coordinator & view engine
├── config.js           # Central configuration for API keys & settings
├── football.js         # API-Football v3 engine (Live, Upcoming, Finished & Lineups)
├── cricket.js          # CricketData.org engine (Live, Scores, Overs & Scorecards)
├── wwe.js              # WWE Events engine (Raw, SmackDown, NXT & PLE schedule)
├── sports.js           # Unified Sports coordinator, caching, search & stream matching
├── channels.json       # Live TV channels directory with M3U8 streams
├── categories.json     # Channel categories definition
└── README.md           # Documentation & setup guide
```

---

## 🔑 How to Configure API Keys

You can configure your API keys in **two easy ways**:

### Method 1: In `config.js` (Recommended for GitHub Pages)
Open `config.js` and paste your API keys:

```javascript
const CONFIG = {
  // ⚽ API-Football Key (Get free key at https://dashboard.api-football.com/)
  FOOTBALL_API_KEY: "PASTE_YOUR_API_FOOTBALL_KEY_HERE",

  // 🏏 CricketData.org Key (Get free key at https://cricketdata.org/)
  CRICKET_API_KEY: "PASTE_YOUR_CRICKET_KEY_HERE",

  // 🤼 WWE Events Data URL (Optional custom JSON feed)
  WWE_API_URL: "",

  // Refresh intervals in milliseconds
  FOOTBALL_REFRESH: 60000,  // 60 seconds
  CRICKET_REFRESH: 60000,   // 60 seconds
  WWE_REFRESH: 300000,      // 5 minutes

  TIMEZONE: "Asia/Dhaka"
};
```

### Method 2: Directly in Application UI Settings
1. Click the **Menu (☰)** icon in the top left corner of the app.
2. Select **Settings & API Keys**.
3. Paste your **API-Football Key** and **CricketData Key**.
4. Click **Save Settings**. (Keys are securely saved in browser `localStorage`).

---

## ⚽ 1. How to Get a Free Football API Key (API-Football)
1. Go to [https://dashboard.api-football.com/](https://dashboard.api-football.com/) and register for a free account.
2. Go to **Account** → **API Key**.
3. Copy your API Key.
4. Paste it into `config.js` under `FOOTBALL_API_KEY` or in the in-app Settings modal.
5. **Features Provided**: Real live match scores, elapsed time (e.g. `68'`), upcoming fixtures, completed match results, lineups, statistics bar charts, and timeline events (goals, red/yellow cards, substitutions).

---

## 🏏 2. How to Get a Free Cricket API Key (CricketData.org)
1. Go to [https://cricketdata.org/](https://cricketdata.org/) and register for a free account.
2. Navigate to your dashboard and copy your **API Key**.
3. Paste it into `config.js` under `CRICKET_API_KEY` or in the in-app Settings modal.
4. **Features Provided**: Real live cricket scores, team runs, wickets, overs (e.g. `145/4 (18.2 ov)`), series/tournament info, venue details, and full inning scorecards.

---

## 🤼 3. How to Configure WWE Events Data Source
WWE does not have an open real-time live score API. HighFy TV strictly **never generates fake live scores or fictional events**.
Instead, it provides a configurable data source module for WWE Raw, SmackDown, NXT, and Premium Live Events (WrestleMania, Royal Rumble, SummerSlam, Survivor Series).

- Set `WWE_API_URL` in `config.js` (or in Settings) to point to your custom JSON endpoint or schedule feed.
- Example JSON schema for custom WWE feed:
```json
[
  {
    "id": "wrestlemania-41",
    "name": "WWE WrestleMania 41",
    "brand": "PLE",
    "date": "2026-04-19T00:00:00Z",
    "venue": "Allegiant Stadium, Las Vegas, NV",
    "status": "upcoming",
    "matches": [
      { "title": "Undisputed WWE Championship Match", "stipulation": "Singles Match" }
    ]
  }
]
```
- If `WWE_API_URL` is empty, the app clearly displays: `⚠️ WWE data source is not configured yet.`

---

## 🎯 How to Test Live, Upcoming, and Finished Matches

1. **Top Sports Navigation**: Click **⚽ Football**, **🏏 Cricket**, **🤼 WWE**, or **All Sports**.
2. **Status Pills**:
   - **All**: Displays all available real matches.
   - **Live**: Filter for in-progress fixtures with real-time pulsing indicator.
   - **Upcoming**: Filter for scheduled fixtures with real-time countdown timer (`Starts in 02:14:36`).
   - **Finished**: Filter for concluded matches (`FT` / match results).
   - **Favorites**: Filter for your starred matches.
3. **Match Details View**: Tap any event card to open the deep details page (Lineups, Statistics, Scorecards, Timeline, Venue & Referee).
4. **▶ WATCH LIVE Button**: If a matching TV channel in `channels.json` or direct event stream exists, the button opens the stream directly in the HLS video player.

---

## 🛡️ API Security & GitHub Automation

### How Your API Keys Are Protected:
1. **GitHub Secrets Support (`.github/workflows/deploy.yml`)**:
   - You do NOT need to hardcode API keys into public git commits.
   - Go to your GitHub Repo **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
   - Add your secret keys:
     - `SPORTMONKS_API_TOKEN`
     - `FOOTBALL_API_KEY`
     - `CRICKET_API_KEY`
     - `WWE_API_URL`
   - When you push to GitHub, the **automated GitHub Actions workflow** automatically injects these secrets into `config.js` and deploys your site live to GitHub Pages.

2. **Client-Side Masking & Password Protection**:
   - In-app settings inputs are masked with password security (`••••••••`) with show/hide toggle.
   - Keys configured in UI settings are stored in local browser storage (`localStorage`), keeping them isolated to your device.

3. **Anti-Scraping Obfuscation**:
   - Base64 token resolution protects against automated crawler bots scraping public repositories.

---

## 🚀 GitHub Pages Deployment (Automatic via GitHub Actions)

1. Push this repository to GitHub.
2. Go to **Settings** → **Pages**.
3. Under **Build and deployment** → **Source**, select **GitHub Actions**.
4. Every push to `main` or `master` will automatically build, inject your secrets, and deploy your live site!
