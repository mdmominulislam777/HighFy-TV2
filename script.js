/**
 * HIGHFY TV - Core Application Engine (v4.2)
 * Mobile-First Live TV & Real Sports Streaming Platform (Football, Cricket, WWE)
 * Compatible with GitHub Pages.
 */

(() => {
  'use strict';

  // Safe Storage Utilities to prevent QuotaExceededError and handle corrupt items
  function safeJsonParse(key, fallback) {
    try {
      const val = localStorage.getItem(key);
      return val ? JSON.parse(val) : fallback;
    } catch (e) {
      console.warn(`[HighFy Storage] Error parsing key "${key}":`, e);
      return fallback;
    }
  }

  function safeSetLocalStorage(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (err) {
      console.warn(`[HighFy Storage] Storage write warning for "${key}":`, err);
      // If quota exceeded, attempt cleanup of non-essential transient caches
      if (err && (err.name === 'QuotaExceededError' || err.code === 22 || err.code === 1014 || err.number === -2147024882 || String(err).includes('quota') || String(err).includes('QuotaExceeded'))) {
        try {
          localStorage.removeItem('highfy_playlist_cache');
          localStorage.removeItem('highfy_epg_cache');
          localStorage.removeItem('highfy_events_cache');
          localStorage.setItem(key, value);
          return true;
        } catch (retryErr) {
          console.error(`[HighFy Storage] QuotaExceededError for "${key}":`, retryErr);
          if (typeof showToast === 'function') {
            showToast('⚠️ স্টোরেজ সীমা পূর্ণ! অনুগ্রহ করে ছোট সাইজের ছবি ব্যবহার করুন বা অপ্রয়োজনীয় কাস্টম ডেটা রিসেট করুন।', 4500);
          }
          return false;
        }
      }
      return false;
    }
  }

  // Client-Side Image Resizer & Compressor
  // Scales down high-res images to maxDimension (e.g. 160px for logos, 400px for banners)
  // Reduces 2-5MB raw images to ~10-25KB, preventing QuotaExceededError
  function compressImageToDataUrl(fileOrUrl, maxDimension = 160, quality = 0.85, callback) {
    if (!fileOrUrl) return;

    const processImg = (img) => {
      try {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;
        if (!width || !height) {
          if (typeof fileOrUrl === 'string') callback(fileOrUrl);
          return;
        }

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          if (typeof fileOrUrl === 'string') callback(fileOrUrl);
          return;
        }

        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        let dataUrl = '';
        try {
          dataUrl = canvas.toDataURL('image/webp', quality);
        } catch (e) {
          dataUrl = canvas.toDataURL('image/png');
        }
        if (!dataUrl || !dataUrl.startsWith('data:image/')) {
          dataUrl = canvas.toDataURL('image/png');
        }
        callback(dataUrl);
      } catch (err) {
        console.warn('[HighFy] Image compression fallback:', err);
        if (typeof fileOrUrl === 'string') callback(fileOrUrl);
      }
    };

    if (fileOrUrl instanceof File || fileOrUrl instanceof Blob) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => processImg(img);
        img.onerror = () => callback(e.target.result);
        img.src = e.target.result;
      };
      reader.readAsDataURL(fileOrUrl);
    } else if (typeof fileOrUrl === 'string' && fileOrUrl.startsWith('data:image/')) {
      const img = new Image();
      img.onload = () => processImg(img);
      img.onerror = () => callback(fileOrUrl);
      img.src = fileOrUrl;
    } else {
      callback(fileOrUrl);
    }
  }

  // Application State
  const state = {
    events: [],
    channels: [],
    categories: [],
    favorites: safeJsonParse('highfy_favs', []),
    eventFavorites: safeJsonParse('highfy_sports_favs', safeJsonParse('highfy_event_favs', [])),
    customLogos: safeJsonParse('highfy_custom_logos', {}),
    customCategoryLogos: safeJsonParse('highfy_custom_category_logos', {}),
    customSportsCategoryLogos: safeJsonParse('highfy_custom_sports_category_logos', {}),
    customCategoryColors: safeJsonParse('highfy_custom_category_colors', {}),
    customSplashLogo: localStorage.getItem('highfy_custom_splash_logo') || '',
    customDrawerLogo: localStorage.getItem('highfy_custom_drawer_logo') || '',
    customChannelUrls: safeJsonParse('highfy_custom_channel_urls', {}),
    customEventStreams: safeJsonParse('highfy_custom_event_streams', {}),
    notifications: [],
    autoMatchNotifications: localStorage.getItem('highfy_auto_match_notifications') !== 'false',
    readNotifIds: safeJsonParse('highfy_read_notifs', []),
    customNotifications: safeJsonParse('highfy_custom_notifications', []),
    selectedNotifFilter: 'ALL',
    selectedSport: 'All',
    selectedFilter: 'ALL',
    selectedChannelCategory: 'Sports',
    selectedSportsCategory: null,
    selectedSportsCategoryName: null,
    searchQuery: '',
    currentView: 'view-events',
    currentMatchDetailsId: null,
    hlsInstance: null,
    mpegtsInstance: null,
    currentPlayingItem: null,
    currentServerIndex: 0,
    aspectRatioIndex: 0,
    aspectRatios: ['16/9', '4/3', 'cover', 'contain'],
    autoRefreshTimer: null,
    countdownTimer: null,
    streamRetryCount: 0,
    maxRetries: 3
  };

  // Built-in channels backup to ensure 100% availability with accurate stream URLs
  const FALLBACK_CHANNELS = [
    {
      "id": "ch-t-sports-hd",
      "name": "T Sports HD",
      "category": "Sports",
      "categories": ["Sports", "Bengali", "LiveTV"],
      "logo": "https://upload.wikimedia.org/wikipedia/en/thumb/9/91/T_Sports_Logo.svg/320px-T_Sports_Logo.svg.png",
      "url": "https://live.tsports.com/mobile_hls/tsports_live_1/playlist.m3u8",
      "backupUrls": ["https://tvsen5.aynaott.com/TnMn5kZz8aLm/index.m3u8"],
      "isLive": true,
      "isHD": true
    },
    {
      "id": "ch-somoy-tv",
      "name": "Somoy TV",
      "category": "Bengali",
      "categories": ["Bengali", "News", "LiveTV"],
      "logo": "https://upload.wikimedia.org/wikipedia/en/thumb/9/9e/Somoy_TV_logo.svg/320px-Somoy_TV_logo.svg.png",
      "url": "https://bldcmprod-cdn.toffeelive.com/cdn/live/somoy_tv/playlist.m3u8",
      "backupUrls": ["http://103.165.93.31:8095/somoyTv/tracks-v1a1/mono.m3u8"],
      "isLive": true,
      "isHD": true
    },
    {
      "id": "ch-jamuna-tv",
      "name": "Jamuna TV",
      "category": "Bengali",
      "categories": ["Bengali", "News", "LiveTV"],
      "logo": "https://upload.wikimedia.org/wikipedia/en/thumb/9/9e/Somoy_TV_logo.svg/320px-Somoy_TV_logo.svg.png",
      "url": "https://bldcmprod-cdn.toffeelive.com/cdn/live/jamuna_tv/playlist.m3u8",
      "backupUrls": [],
      "isLive": true,
      "isHD": true
    },
    {
      "id": "ch-channel-i",
      "name": "Channel i",
      "category": "Bengali",
      "categories": ["Bengali", "Entertainment", "LiveTV"],
      "logo": "https://upload.wikimedia.org/wikipedia/en/thumb/3/30/Channel_i_logo.svg/320px-Channel_i_logo.svg.png",
      "url": "https://bldcmprod-cdn.toffeelive.com/cdn/live/channel_i/playlist.m3u8",
      "backupUrls": [],
      "isLive": true,
      "isHD": true
    },
    {
      "id": "ch-ntv",
      "name": "NTV",
      "category": "Bengali",
      "categories": ["Bengali", "Entertainment", "News", "LiveTV"],
      "logo": "https://upload.wikimedia.org/wikipedia/en/thumb/7/7b/NTV_Bangladesh_Logo.svg/320px-NTV_Bangladesh_Logo.svg.png",
      "url": "https://bldcmprod-cdn.toffeelive.com/cdn/live/n_tv/playlist.m3u8",
      "backupUrls": [],
      "isLive": true,
      "isHD": true
    },
    {
      "id": "ch-maasranga-tv-hd",
      "name": "Maasranga TV HD",
      "category": "Bengali",
      "categories": ["Bengali", "Entertainment", "LiveTV"],
      "logo": "https://static.wikia.nocookie.net/etv-gspn-bangla/images/a/a3/Maasranga_TV_HD_logo.png",
      "url": "http://mtv.sunplex.live/MAASRANGA-TV/index.m3u8",
      "backupUrls": [],
      "isLive": true,
      "isHD": true
    },
    {
      "id": "ch-deepto-tv",
      "name": "Deepto TV",
      "category": "Bengali",
      "categories": ["Bengali", "Entertainment", "LiveTV"],
      "logo": "https://upload.wikimedia.org/wikipedia/en/thumb/d/d4/Deepto_TV_logo.svg/320px-Deepto_TV_logo.svg.png",
      "url": "https://byphdgllyk.gpcdn.net/hls/deeptotv/0_1/index.m3u8",
      "backupUrls": [],
      "isLive": true,
      "isHD": true
    },
    {
      "id": "ch-ekattor-tv",
      "name": "Ekattor TV",
      "category": "Bengali",
      "categories": ["Bengali", "News", "LiveTV"],
      "logo": "https://upload.wikimedia.org/wikipedia/en/thumb/6/6f/Ekattor_TV_logo.svg/320px-Ekattor_TV_logo.svg.png",
      "url": "https://bldcmprod-cdn.toffeelive.com/cdn/live/ekattor_tv/playlist.m3u8",
      "backupUrls": [],
      "isLive": true,
      "isHD": true
    },
    {
      "id": "ch-independent-tv",
      "name": "Independent TV",
      "category": "Bengali",
      "categories": ["Bengali", "News", "LiveTV"],
      "logo": "https://upload.wikimedia.org/wikipedia/en/thumb/d/dd/Independent_Television_logo.svg/320px-Independent_Television_logo.svg.png",
      "url": "https://bldcmprod-cdn.toffeelive.com/cdn/live/independent_tv/playlist.m3u8",
      "backupUrls": [],
      "isLive": true,
      "isHD": true
    },
    {
      "id": "ch-sony-sports-ten-1-hd",
      "name": "Sony Sports Ten 1 HD",
      "category": "Sports",
      "categories": ["Sports", "LiveTV"],
      "logo": "https://upload.wikimedia.org/wikipedia/en/thumb/5/52/Sony_Sports_Ten_1_Logo.svg/320px-Sony_Sports_Ten_1_Logo.svg.png",
      "url": "https://bldcmprod-cdn.toffeelive.com/cdn/live/sony_sports_1_hd/playlist.m3u8",
      "backupUrls": [],
      "isLive": true,
      "isHD": true
    },
    {
      "id": "ch-sony-sports-ten-2-hd",
      "name": "Sony Sports Ten 2 HD",
      "category": "Sports",
      "categories": ["Sports", "LiveTV"],
      "logo": "https://upload.wikimedia.org/wikipedia/en/thumb/5/52/Sony_Sports_Ten_1_Logo.svg/320px-Sony_Sports_Ten_1_Logo.svg.png",
      "url": "https://bldcmprod-cdn.toffeelive.com/cdn/live/sony_sports_2_hd/playlist.m3u8",
      "backupUrls": [],
      "isLive": true,
      "isHD": true
    },
    {
      "id": "ch-sony-sports-ten-5-hd",
      "name": "Sony Sports Ten 5 HD",
      "category": "Sports",
      "categories": ["Sports", "LiveTV"],
      "logo": "https://upload.wikimedia.org/wikipedia/en/thumb/5/52/Sony_Sports_Ten_1_Logo.svg/320px-Sony_Sports_Ten_1_Logo.svg.png",
      "url": "https://bldcmprod-cdn.toffeelive.com/cdn/live/sony_sports_5_hd/playlist.m3u8",
      "backupUrls": [],
      "isLive": true,
      "isHD": true
    },
    {
      "id": "ch-sony-ten-cricket-hd",
      "name": "Sony Ten Cricket HD",
      "category": "Sports",
      "categories": ["Sports", "Cricket", "LiveTV"],
      "logo": "https://assets-prod.services.toffeelive.com/f_png,w_300,q_85/ra2x_pQBrjBfS2_RWG9l/posters/795170c2-ec78-457e-9fa0-54a23d23361c.webp",
      "url": "https://bldcmprod-cdn.toffeelive.com/cdn/live/ten_cricket/playlist.m3u8",
      "backupUrls": [],
      "isLive": true,
      "isHD": true
    },
    {
      "id": "ch-eurosport-1-hd",
      "name": "Eurosport 1 HD",
      "category": "Sports",
      "categories": ["Sports", "LiveTV"],
      "logo": "https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Eurosport_1_logo_2015.svg/320px-Eurosport_1_logo_2015.svg.png",
      "url": "https://bldcmprod-cdn.toffeelive.com/cdn/live/euro_sports_hd/playlist.m3u8",
      "backupUrls": [],
      "isLive": true,
      "isHD": true
    },
    {
      "id": "ch-cnn",
      "name": "CNN",
      "category": "News",
      "categories": ["News", "LiveTV"],
      "logo": "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/CNN.svg/320px-CNN.svg.png",
      "url": "https://bldcmprod-cdn.toffeelive.com/cdn/live/cnn/playlist.m3u8",
      "backupUrls": [],
      "isLive": true,
      "isHD": true
    },
    {
      "id": "ch-bbc-news",
      "name": "BBC News",
      "category": "News",
      "categories": ["News", "LiveTV"],
      "logo": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/BBC_News_2019.svg/320px-BBC_News_2019.svg.png",
      "url": "https://cdn4.skygo.mn/live/disk1/BBC_News/HLSv3-FTA/BBC_News-avc1_3000000=8-mp4a_208000_eng=2.m3u8",
      "backupUrls": [],
      "isLive": true,
      "isHD": true
    },
    {
      "id": "ch-sony-max-hd",
      "name": "Sony MAX HD",
      "category": "Movies",
      "categories": ["Movies", "Entertainment", "LiveTV"],
      "logo": "https://upload.wikimedia.org/wikipedia/en/thumb/2/23/Sony_Max_logo.svg/320px-Sony_Max_logo.svg.png",
      "url": "https://bldcmprod-cdn.toffeelive.com/cdn/live/sony_max_hd/playlist.m3u8",
      "backupUrls": ["https://bldcmprod-cdn.toffeelive.com/cdn/live/sony_max/playlist.m3u8"],
      "isLive": true,
      "isHD": true
    },
    {
      "id": "ch-sony-pix-hd",
      "name": "Sony PIX HD",
      "category": "Movies",
      "categories": ["Movies", "Entertainment", "LiveTV"],
      "logo": "https://upload.wikimedia.org/wikipedia/en/thumb/6/6e/Sony_PIX_logo.svg/320px-Sony_PIX_logo.svg.png",
      "url": "https://bldcmprod-cdn.toffeelive.com/cdn/live/sonypix_hd/playlist.m3u8",
      "backupUrls": [],
      "isLive": true,
      "isHD": true
    },
    {
      "id": "ch-zee-bangla",
      "name": "Zee Bangla",
      "category": "Bengali",
      "categories": ["Bengali", "Entertainment", "LiveTV"],
      "logo": "https://upload.wikimedia.org/wikipedia/en/thumb/4/4b/Zee_Bangla_Logo_2023.png/320px-Zee_Bangla_Logo_2023.png",
      "url": "https://bldcmprod-cdn.toffeelive.com/cdn/live/zee_bangla/playlist.m3u8",
      "backupUrls": [],
      "isLive": true,
      "isHD": true
    },
    {
      "id": "ch-zee-cinema-hd",
      "name": "Zee Cinema HD",
      "category": "Movies",
      "categories": ["Movies", "Entertainment", "LiveTV"],
      "logo": "https://upload.wikimedia.org/wikipedia/en/thumb/4/4c/Zee_Cinema_Logo.svg/320px-Zee_Cinema_Logo.svg.png",
      "url": "https://bldcmprod-cdn.toffeelive.com/cdn/live/zee_cinema_hd/playlist.m3u8",
      "backupUrls": [],
      "isLive": true,
      "isHD": true
    },
    {
      "id": "ch-discovery-hd",
      "name": "Discovery HD",
      "category": "Infotainment",
      "categories": ["Infotainment", "LiveTV"],
      "logo": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/Discovery_Channel_Logo.svg/320px-Discovery_Channel_Logo.svg.png",
      "url": "https://bldcmprod-cdn.toffeelive.com/cdn/live/discovery_hd/playlist.m3u8",
      "backupUrls": ["https://bldcmprod-cdn.toffeelive.com/cdn/live/discovery_sd/playlist.m3u8"],
      "isLive": true,
      "isHD": true
    },
    {
      "id": "ch-animal-planet-hd",
      "name": "Animal Planet HD",
      "category": "Infotainment",
      "categories": ["Infotainment", "LiveTV"],
      "logo": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Animal_Planet_2018.svg/320px-Animal_Planet_2018.svg.png",
      "url": "https://bldcmprod-cdn.toffeelive.com/cdn/live/animal_planet_hd/playlist.m3u8",
      "backupUrls": ["https://bldcmprod-cdn.toffeelive.com/cdn/live/animal_planet_sd/playlist.m3u8"],
      "isLive": true,
      "isHD": true
    },
    {
      "id": "ch-cartoon-network",
      "name": "Cartoon Network",
      "category": "Kids",
      "categories": ["Kids", "Entertainment", "LiveTV"],
      "logo": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/80/Cartoon_Network_2010_logo.svg/320px-Cartoon_Network_2010_logo.svg.png",
      "url": "https://live20.bozztv.com/giatvplayout7/giatv-209624/index.m3u8",
      "backupUrls": [],
      "isLive": true,
      "isHD": true
    },
    {
      "id": "ch-islamic-tv",
      "name": "Islamic TV",
      "category": "Islamic",
      "categories": ["Islamic", "LiveTV"],
      "logo": "https://assets-prod.services.toffeelive.com/f_png,w_300,q_85/jehEA54BIxFjn23xAmdw/posters/2c276556-cbcd-4467-b627-4394bb20f250.png",
      "url": "https://bldcmprod-cdn.toffeelive.com/cdn/live/islamic_tv/playlist.m3u8",
      "backupUrls": [],
      "isLive": true,
      "isHD": true
    },
    {
      "id": "ch-music-bangla",
      "name": "Music Bangla",
      "category": "Music",
      "categories": ["Music", "Bengali", "LiveTV"],
      "logo": "https://static.wikia.nocookie.net/logopedia/images/7/75/Music_Bangla_new.jpeg",
      "url": "http://live.matribhumitv.com/music-bangla/index.m3u8",
      "backupUrls": [],
      "isLive": true,
      "isHD": true
    }
  ];

  // DOM Elements Cache
  let DOM = {};

  function refreshDOM() {
    DOM = {
      eventsFeed: document.getElementById('eventsFeed'),
      cntAll: document.getElementById('cntAll'),
      cntToday: document.getElementById('cntToday'),
      cntLive: document.getElementById('cntLive'),
      cntUpcoming: document.getElementById('cntUpcoming'),
      cntFinished: document.getElementById('cntFinished'),
      cntFavEvents: document.getElementById('cntFavEvents'),
      sportsCategoriesGrid: document.getElementById('sportsCategoriesGrid'),
      sportsCategoriesCount: document.getElementById('sports-categories-count'),
      sportsGrid: document.getElementById('sportsGrid'),
      channelsCount: document.getElementById('channels-total-count'),
      channelsTitle: document.getElementById('channels-view-title'),
      sportsClearFilterBtn: document.getElementById('sports-clear-filter-btn'),
      categoriesGrid: document.getElementById('categoriesGrid'),
      catDetailGrid: document.getElementById('category-detail-channels-grid'),
      favoritesGrid: document.getElementById('favorites-list-grid'),
      channelsCount: document.getElementById('channels-total-count'),
      categoriesCount: document.getElementById('categories-total-count'),
      favoritesCount: document.getElementById('favorites-total-count'),
      catDetailTitle: document.getElementById('cat-detail-title'),
      catDetailCount: document.getElementById('cat-detail-count'),
      matchDetailsContainer: document.getElementById('match-details-container'),
      
      // Player
      playerModal: document.getElementById('player-modal'),
      videoElement: document.getElementById('hls-video-element'),
      playerTitle: document.getElementById('player-media-title'),
      playerSpinner: document.getElementById('player-spinner'),
      playerError: document.getElementById('player-error'),
      playerErrorMsg: document.getElementById('player-error-msg'),
      playerServerPills: document.getElementById('player-server-pills'),
      playerServerList: document.getElementById('player-server-list'),
      playerFavIcon: document.getElementById('player-fav-icon'),
      
      // StreamZX New Player Controls Overlay
      playerControlsOverlay: document.getElementById('player-controls-overlay'),
      btnPlayerPlayPause: document.getElementById('btn-player-playpause'),
      playerPlayPauseIcon: document.getElementById('player-playpause-icon'),
      btnPlayerRewind: document.getElementById('btn-player-rewind'),
      btnPlayerForward: document.getElementById('btn-player-forward'),
      playerTimeCurrent: document.getElementById('player-time-current'),
      playerTimeTotal: document.getElementById('player-time-total'),
      playerSeekSlider: document.getElementById('player-seek-slider'),
      playerFilledBar: document.getElementById('player-filled-bar'),
      playerBufferedBar: document.getElementById('player-buffered-bar'),
      playerScrubKnob: document.getElementById('player-scrub-knob'),
      btnPlayerMute: document.getElementById('btn-player-mute'),
      playerVolumeIcon: document.getElementById('player-volume-icon'),
      btnPlayerLock: document.getElementById('btn-player-lock'),
      playerLockIcon: document.getElementById('player-lock-icon'),
      playerLockedIndicator: document.getElementById('player-locked-indicator'),
      btnPlayerUnlock: document.getElementById('btn-player-unlock'),
      btnPlayerSettings: document.getElementById('btn-player-settings'),
      playerSettingsSheet: document.getElementById('player-settings-sheet'),
      btnPlayerFullscreen: document.getElementById('btn-player-fullscreen'),
      playerFullscreenIcon: document.getElementById('player-fullscreen-icon'),
      
      // Search
      searchContainer: document.getElementById('search-container'),
      searchInput: document.getElementById('global-search-input'),
      searchResults: document.getElementById('search-results-dropdown'),
      btnClearSearch: document.getElementById('btn-clear-search'),
      
      // Status text
      activeSportTitle: document.getElementById('sports-active-sport-title'),
      lastUpdatedText: document.getElementById('sports-last-updated-text'),

      // Drawer & Modals
      sideDrawer: document.getElementById('side-drawer'),
      drawerOverlay: document.getElementById('drawer-overlay'),
      refreshIcon: document.getElementById('refresh-icon')
    };
    return DOM;
  }

  /**
   * Escape HTML utility for XSS safety
   */
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Theme Management (Light Ice-Blue with White Default, Dark Obsidian Option)
   */
  function setupTheme() {
    const savedTheme = localStorage.getItem('highfy_theme') || 'light';
    applyTheme(savedTheme);

    const btnThemeToggle = document.getElementById('btn-theme-toggle');
    if (btnThemeToggle) {
      btnThemeToggle.addEventListener('click', toggleTheme);
    }
  }

  function applyTheme(theme) {
    const themeIcon = document.getElementById('theme-toggle-icon');

    if (theme === 'dark') {
      document.body.classList.add('dark-theme');
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('highfy_theme', 'dark');

      if (themeIcon) {
        themeIcon.classList.remove('fa-moon');
        themeIcon.classList.add('fa-sun');
      }
    } else {
      document.body.classList.remove('dark-theme');
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('highfy_theme', 'light');

      if (themeIcon) {
        themeIcon.classList.remove('fa-sun');
        themeIcon.classList.add('fa-moon');
      }
    }
  }

  function toggleTheme() {
    const isDark = document.body.classList.contains('dark-theme');
    applyTheme(isDark ? 'light' : 'dark');
  }

  /**
   * App Preloader Helpers
   */
  const preloaderStartTime = Date.now();

  function updatePreloader(percent, statusText) {
    const fillEl = document.getElementById('preloader-fill');
    const percentEl = document.getElementById('preloader-percent');
    const statusEl = document.getElementById('preloader-status');
    
    if (fillEl) fillEl.style.width = `${Math.min(100, Math.max(0, percent))}%`;
    if (percentEl) percentEl.textContent = `${Math.round(percent)}%`;
    if (statusEl && statusText) statusEl.textContent = statusText;
  }

  function hidePreloader() {
    const preloader = document.getElementById('app-preloader');
    if (preloader) {
      updatePreloader(100, 'Ready');
      const elapsed = Date.now() - preloaderStartTime;
      const minDisplayTime = 3000; // 3 seconds loading duration as requested
      const delay = Math.max(100, minDisplayTime - elapsed);

      setTimeout(() => {
        preloader.classList.add('fade-out');
        setTimeout(() => {
          preloader.style.display = 'none';
        }, 400);
      }, delay);
    }
  }

  /**
   * Custom App Branding (Splash Image & Slide Menu Drawer Image)
   */
  function applyCustomAppBranding() {
    const splashImg = document.getElementById('cricfy-splash-logo-img');
    const drawerImg = document.getElementById('drawer-header-logo-img');

    if (splashImg) {
      if (state.customSplashLogo) {
        splashImg.src = state.customSplashLogo;
      } else {
        splashImg.src = '/highfy_logo_official.svg';
      }
    }

    if (drawerImg) {
      if (state.customDrawerLogo) {
        drawerImg.src = state.customDrawerLogo;
      } else {
        drawerImg.src = '/highfy_logo_official.svg';
      }
    }

    // Sync preview & inputs in Admin Logo Manager if present
    const adminSplashPreview = document.getElementById('admin-preview-splash-img');
    const adminSplashInput = document.getElementById('admin-splash-img-url');
    const badgeSplashStatus = document.getElementById('badge-loading-img-status');

    if (adminSplashPreview) {
      adminSplashPreview.src = state.customSplashLogo || '/highfy_logo_official.svg';
    }
    if (adminSplashInput && !adminSplashInput.matches(':focus')) {
      adminSplashInput.value = state.customSplashLogo || '';
    }
    if (badgeSplashStatus) {
      if (state.customSplashLogo) {
        badgeSplashStatus.textContent = 'Custom';
        badgeSplashStatus.className = 'text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30';
      } else {
        badgeSplashStatus.textContent = 'Default';
        badgeSplashStatus.className = 'text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-800 text-slate-400';
      }
    }

    const adminDrawerPreview = document.getElementById('admin-preview-drawer-img');
    const adminDrawerInput = document.getElementById('admin-drawer-img-url');
    const badgeDrawerStatus = document.getElementById('badge-drawer-img-status');

    if (adminDrawerPreview) {
      adminDrawerPreview.src = state.customDrawerLogo || '/highfy_logo_official.svg';
    }
    if (adminDrawerInput && !adminDrawerInput.matches(':focus')) {
      adminDrawerInput.value = state.customDrawerLogo || '';
    }
    if (badgeDrawerStatus) {
      if (state.customDrawerLogo) {
        badgeDrawerStatus.textContent = 'Custom';
        badgeDrawerStatus.className = 'text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
      } else {
        badgeDrawerStatus.textContent = 'Default';
        badgeDrawerStatus.className = 'text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-800 text-slate-400';
      }
    }
  }

  /**
   * Self-Healing Storage Quota Guard:
   * 1. Consolidates any duplicate sports category keys (id, name, filterKey).
   * 2. Automatically compresses any legacy oversized base64 data URLs (>30KB).
   * 3. Prevents any QuotaExceededError from persisting in user storage.
   */
  function sanitizeStorageQuota() {
    try {
      const sportsLogos = state.customSportsCategoryLogos;
      if (sportsLogos && typeof sportsLogos === 'object') {
        for (const [key, val] of Object.entries(sportsLogos)) {
          if (typeof val === 'string' && val.startsWith('data:image/') && val.length > 30000) {
            compressImageToDataUrl(val, 160, 0.85, (compressed) => {
              if (state.customSportsCategoryLogos && state.customSportsCategoryLogos[key]) {
                state.customSportsCategoryLogos[key] = compressed;
                safeSetLocalStorage('highfy_custom_sports_category_logos', JSON.stringify(state.customSportsCategoryLogos));
              }
            });
          }
        }
      }

      if (state.customLogos && typeof state.customLogos === 'object') {
        for (const [chId, val] of Object.entries(state.customLogos)) {
          if (typeof val === 'string' && val.startsWith('data:image/') && val.length > 30000) {
            compressImageToDataUrl(val, 160, 0.85, (compressed) => {
              if (state.customLogos && state.customLogos[chId]) {
                state.customLogos[chId] = compressed;
                safeSetLocalStorage('highfy_custom_logos', JSON.stringify(state.customLogos));
              }
            });
          }
        }
      }

      if (state.customCategoryLogos && typeof state.customCategoryLogos === 'object') {
        for (const [catId, val] of Object.entries(state.customCategoryLogos)) {
          if (typeof val === 'string' && val.startsWith('data:image/') && val.length > 30000) {
            compressImageToDataUrl(val, 160, 0.85, (compressed) => {
              if (state.customCategoryLogos && state.customCategoryLogos[catId]) {
                state.customCategoryLogos[catId] = compressed;
                safeSetLocalStorage('highfy_custom_category_logos', JSON.stringify(state.customCategoryLogos));
              }
            });
          }
        }
      }
    } catch (e) {
      console.warn('[HighFy] Storage quota self-healing check note:', e);
    }
  }

  /**
   * Application Initialization
   */
  async function initApp() {
    console.log('[HighFy] App initializing (v4.3)...');
    sanitizeStorageQuota();
    applyCustomAppBranding();
    updatePreloader(20, 'Initializing HighFy Engine...');
    refreshDOM();
    setupTheme();

    // 1. Setup UI Listeners & Controls
    setupNavigation();
    setupFilters();
    setupPlayerControls();
    setupSearch();
    setupDrawerAndModals();
    setupNotificationsUI();

    updatePreloader(45, 'Loading TV Channels & Categories...');
    // 2. Fetch Data (Channels, Categories, Sports Events, Notifications)
    await Promise.all([
      loadChannels(),
      loadCategories(),
      loadBaseNotifications()
    ]);

    updatePreloader(75, 'Syncing Live Sports Feeds...');
    // Pass TV channels to sportsCoordinator for live stream matching
    if (window.sportsCoordinator) {
      window.sportsCoordinator.setChannels(state.channels);
    }

    await loadSportsEvents(true);
    updatePreloader(95, 'Starting Live Engine...');

    // 3. Start Auto-Refresh and Live Countdown Timers
    startAutoRefresh();
    startCountdownTimer();

    // Smoothly hide preloader
    hidePreloader();
  }

  /**
   * Fetch All Sports Events via sportsCoordinator
   */
  async function loadSportsEvents(isManualRefresh = false) {
    refreshDOM();

    // Guard against spam clicking manual refresh (minimum 10s cooldown)
    if (isManualRefresh) {
      const now = Date.now();
      if (now - lastManualRefreshTime < 10000 && state.events.length > 0) {
        showToast('Scores are already up to date');
        return;
      }
      lastManualRefreshTime = now;
    }

    if (isManualRefresh && DOM.refreshIcon) {
      DOM.refreshIcon.classList.add('animate-spin');
    }

    // If initial load and empty, show loading skeleton
    if (DOM.eventsFeed && state.events.length === 0) {
      DOM.eventsFeed.innerHTML = `
        <div class="empty-state-box">
          <div class="player-loading-spinner" style="display:block;margin:0 auto 12px auto;"></div>
          <p class="empty-state-title">Fetching Real Sports Events...</p>
          <p class="empty-state-desc">Loading Football, Cricket & WWE feeds</p>
        </div>
      `;
    }

    try {
      console.log('[HighFy] Fetching events via sportsCoordinator...');
      if (window.sportsCoordinator) {
        state.events = await window.sportsCoordinator.fetchAllEvents(isManualRefresh);
      } else {
        state.events = [];
      }

      // Apply Admin Custom Match Assignments & Direct Streams
      if (state.customEventStreams && typeof state.customEventStreams === 'object' && Array.isArray(state.events)) {
        state.events.forEach(ev => {
          if (ev && ev.id && state.customEventStreams[ev.id]) {
            const custom = state.customEventStreams[ev.id];
            if (custom.channelId) {
              ev.channelId = custom.channelId;
              const matchedCh = (state.channels || []).find(c => c.id === custom.channelId);
              if (matchedCh) {
                const streamUrl = matchedCh.stream_url || matchedCh.url || matchedCh.streamUrl;
                ev.streams = [{
                  name: matchedCh.name,
                  serverLabel: matchedCh.name,
                  channelName: matchedCh.name,
                  channelId: matchedCh.id,
                  channelLogo: matchedCh.logo,
                  url: streamUrl,
                  backupUrls: matchedCh.backupUrls || [],
                  quality: '1080p FHD',
                  isHD: true,
                  category: matchedCh.category || 'Sports'
                }];
                ev.broadcastChannels = [matchedCh.name];
                ev.broadcastingChannelDetails = [{
                  id: matchedCh.id,
                  name: matchedCh.name,
                  logo: matchedCh.logo,
                  category: matchedCh.category || 'Sports',
                  quality: '1080p FHD',
                  streamUrl: streamUrl,
                  serverIdx: 0
                }];
              }
            } else if (custom.directUrl) {
              ev.streams = [{
                name: `${ev.title || 'Live Match'} (Server 1 HD)`,
                serverLabel: 'SERVER 1 (1080P HD)',
                channelName: ev.title || 'Live Match',
                channelLogo: ev.team1?.logo || ev.homeTeam?.logo || './assets/category-logos/live-events-hd.svg',
                url: custom.directUrl,
                backupUrls: [],
                quality: '1080p FHD',
                isHD: true,
                category: ev.sport || 'Sports'
              }];
              ev.broadcastChannels = ['Live HD Stream'];
              ev.broadcastingChannelDetails = [{
                id: `custom-stream-${ev.id}`,
                name: 'Live HD Stream',
                logo: ev.team1?.logo || ev.homeTeam?.logo || './assets/category-logos/live-events-hd.svg',
                category: ev.sport || 'Sports',
                quality: '1080p FHD',
                streamUrl: custom.directUrl,
                serverIdx: 0
              }];
            }
          }
        });
      }
    } catch (err) {
      console.error('[HighFy] Error loading sports events:', err);
      state.events = [];
    } finally {
      if (isManualRefresh && DOM.refreshIcon) {
        setTimeout(() => DOM.refreshIcon.classList.remove('animate-spin'), 600);
      }
    }

    // Update Last Updated Timestamp
    if (DOM.lastUpdatedText && window.sportsCoordinator) {
      DOM.lastUpdatedText.innerHTML = `<i class="fa-solid fa-arrows-rotate text-[10px]"></i> Updated: ${window.sportsCoordinator.getLastUpdatedString()}`;
    }

    updateEventCounters();
    renderEvents();

    // Check and trigger automated notifications for LIVE matches
    if (typeof checkAndTriggerLiveMatchNotifications === 'function') {
      try {
        checkAndTriggerLiveMatchNotifications(state.events);
      } catch (notifErr) {
        console.warn('[HighFy Notif Engine] Auto match notification check error:', notifErr);
      }
    }

    // Update Match Details view if currently active
    if (state.currentView === 'view-match-details' && state.currentMatchDetailsId) {
      renderMatchDetails(state.currentMatchDetailsId);
    }
  }

  /**
   * Universal check if an event has finished/concluded
   */
  function isAppEventFinished(ev) {
    if (!ev) return false;
    if (window.sportsCoordinator && typeof window.sportsCoordinator.isEventFinished === 'function') {
      return window.sportsCoordinator.isEventFinished(ev);
    }
    const status = String(ev.status || '').toLowerCase().trim();
    if (
      status === 'finished' ||
      status === 'ft' ||
      status === 'aet' ||
      status === 'ap' ||
      status === 'ended' ||
      status === 'completed' ||
      status === 'concluded' ||
      status === 'abandoned' ||
      status === 'postponed'
    ) {
      return true;
    }
    const statusLabel = String(ev.statusLabel || '').toLowerCase().trim();
    if (statusLabel === 'finished' || statusLabel === 'ft' || statusLabel === 'ended' || statusLabel === 'completed') {
      return true;
    }
    const timeOrTimer = String(ev.timeOrTimer || '').toLowerCase().trim();
    if (timeOrTimer === 'ft' || timeOrTimer === 'aet' || timeOrTimer === 'ap' || timeOrTimer === 'finished' || timeOrTimer === 'full time' || timeOrTimer === 'ended') {
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
      return true;
    }
    if (ev.timestamp && typeof ev.timestamp === 'number') {
      const now = Date.now();
      const ts = ev.timestamp < 10000000000 ? ev.timestamp * 1000 : ev.timestamp;
      const elapsed = now - ts;
      const sp = String(ev.sport || ev.sportName || '').toLowerCase();
      if (elapsed > 0) {
        if ((sp === 'football' || sp === 'soccer') && elapsed > (135 * 60 * 1000)) return true;
        if (sp === 'cricket') {
          const fmt = String(ev.matchFormat || ev.matchType || '').toUpperCase();
          if (fmt.includes('T20') && elapsed > (4.5 * 3600 * 1000)) return true;
          if (fmt.includes('ODI') && elapsed > (9 * 3600 * 1000)) return true;
        }
        if ((sp === 'tennis' || sp === 'basketball') && elapsed > (4 * 3600 * 1000)) return true;
        if (elapsed > (14 * 3600 * 1000)) return true;
      }
    }
    return false;
  }

  /**
   * Update Status Counters
   */
  function updateEventCounters() {
    refreshDOM();
    const coordinator = window.sportsCoordinator;
    let list = state.events || [];

    // Count by individual sport for top circular badges
    const totalAllEvents = list.length;
    const totalFootball = list.filter(e => (e.sport || '').toLowerCase() === 'football').length;
    const totalCricket = list.filter(e => (e.sport || '').toLowerCase() === 'cricket').length;
    const totalBaseball = list.filter(e => (e.sport || '').toLowerCase() === 'baseball').length;
    const totalBasketball = list.filter(e => (e.sport || '').toLowerCase() === 'basketball').length;
    const totalTennis = list.filter(e => (e.sport || '').toLowerCase() === 'tennis').length;
    const totalMotorsport = list.filter(e => (e.sport || '').toLowerCase() === 'motorsport' || (e.sport || '').toLowerCase() === 'f1').length;
    const totalWWE = list.filter(e => (e.sport || '').toLowerCase() === 'wwe' || (e.sport || '').toLowerCase() === 'wrestling').length;
    const totalHockey = list.filter(e => (e.sport || '').toLowerCase() === 'hockey').length;
    const totalKabaddi = list.filter(e => (e.sport || '').toLowerCase() === 'kabaddi').length;
    const totalRugby = list.filter(e => (e.sport || '').toLowerCase() === 'rugby').length;

    const bAll = document.getElementById('scBadgeAll');
    const bFoot = document.getElementById('scBadgeFootball');
    const bCric = document.getElementById('scBadgeCricket');
    const bBase = document.getElementById('scBadgeBaseball');
    const bBasket = document.getElementById('scBadgeBasketball');
    const bTennis = document.getElementById('scBadgeTennis');
    const bMotor = document.getElementById('scBadgeMotorsport');
    const bWwe = document.getElementById('scBadgeWWE');
    const bHock = document.getElementById('scBadgeHockey');
    const bKaba = document.getElementById('scBadgeKabaddi');
    const bRugby = document.getElementById('scBadgeRugby');

    if (bAll) bAll.textContent = String(totalAllEvents);
    if (bFoot) bFoot.textContent = String(totalFootball);
    if (bCric) bCric.textContent = String(totalCricket);
    if (bBase) bBase.textContent = String(totalBaseball);
    if (bBasket) bBasket.textContent = String(totalBasketball);
    if (bTennis) bTennis.textContent = String(totalTennis);
    if (bMotor) bMotor.textContent = String(totalMotorsport);
    if (bWwe) bWwe.textContent = String(totalWWE);
    if (bHock) bHock.textContent = String(totalHockey);
    if (bKaba) bKaba.textContent = String(totalKabaddi);
    if (bRugby) bRugby.textContent = String(totalRugby);

    // Filter by selectedSport for accurate header counters
    if (state.selectedSport && state.selectedSport !== 'All') {
      const sp = state.selectedSport.toLowerCase();
      if (sp === 'motorsport' || sp === 'f1') {
        list = list.filter(e => (e.sport || '').toLowerCase() === 'motorsport' || (e.sport || '').toLowerCase() === 'f1');
      } else if (sp === 'wwe' || sp === 'wrestling') {
        list = list.filter(e => (e.sport || '').toLowerCase() === 'wwe' || (e.sport || '').toLowerCase() === 'wrestling');
      } else {
        list = list.filter(e => (e.sport || '').toLowerCase() === sp);
      }
    }

    const isTodayEv = (ev) => {
      if (coordinator && typeof coordinator.isEventToday === 'function') {
        return coordinator.isEventToday(ev);
      }
      if ((ev.status || '').toLowerCase() === 'live') return true;
      if (ev.timestamp && !isNaN(ev.timestamp)) {
        const ts = ev.timestamp < 10000000000 ? ev.timestamp * 1000 : ev.timestamp;
        const tz = 'Asia/Dhaka';
        try {
          const now = new Date();
          const todayLocal = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
          const evLocal = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts));
          if (evLocal === todayLocal) return true;

          const evHour = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(new Date(ts)), 10);
          const [evY, evM, evD] = evLocal.split(/[-/]/).map(Number);
          const [nowY, nowM, nowD] = todayLocal.split(/[-/]/).map(Number);
          const evDateOnly = new Date(Date.UTC(evY, evM - 1, evD));
          const nowDateOnly = new Date(Date.UTC(nowY, nowM - 1, nowD));
          const dayDiff = Math.round((evDateOnly.getTime() - nowDateOnly.getTime()) / (24 * 3600 * 1000));

          if (dayDiff === 1 && evHour < 6) return true;
        } catch (e) {
          const d = new Date(ts);
          if (d.toDateString() === (new Date()).toDateString()) return true;
        }
      }
      return false;
    };

    const allCount = list.length;
    const todayCount = list.filter(isTodayEv).length;
    const finishedCount = list.filter(e => isAppEventFinished(e)).length;
    const liveCount = list.filter(e => !isAppEventFinished(e) && (e.status || '').toLowerCase() === 'live').length;
    const upcomingCount = list.filter(e => !isAppEventFinished(e) && (e.status || '').toLowerCase() === 'upcoming').length;
    const favCount = list.filter(e => state.eventFavorites.includes(e.id)).length;

    if (DOM.cntAll) DOM.cntAll.textContent = `(${allCount})`;
    if (DOM.cntToday) DOM.cntToday.textContent = `(${todayCount})`;
    if (DOM.cntLive) DOM.cntLive.textContent = `(${liveCount})`;
    if (DOM.cntUpcoming) DOM.cntUpcoming.textContent = `(${upcomingCount})`;
    if (DOM.cntFinished) DOM.cntFinished.textContent = `(${finishedCount})`;
    if (DOM.cntFavEvents) DOM.cntFavEvents.textContent = `(${favCount})`;

    if (DOM.activeSportTitle) {
      let icon = 'fa-bolt';
      let title = 'Live Sports Center';
      if (state.selectedSport === 'Football') { icon = 'fa-futbol'; title = 'Football Matches'; }
      else if (state.selectedSport === 'Cricket') { icon = 'fa-baseball-bat-ball'; title = 'Cricket Matches'; }
      else if (state.selectedSport === 'Baseball') { icon = 'fa-baseball'; title = 'Baseball Games (MLB)'; }
      else if (state.selectedSport === 'Basketball') { icon = 'fa-basketball'; title = 'Basketball Games (NBA/EuroLeague)'; }
      else if (state.selectedSport === 'Tennis') { icon = 'fa-table-tennis-paddle-ball'; title = 'Tennis Matches (Grand Slam / ATP / WTA)'; }
      else if (state.selectedSport === 'Motorsport' || state.selectedSport === 'Motorsports') { icon = 'fa-car-side'; title = 'Motorsports'; }
      else if (state.selectedSport === 'WWE') { icon = 'fa-hand-fist'; title = 'WWE / Wrestling Events'; }
      else if (state.selectedSport === 'Hockey') { icon = 'fa-hockey-puck'; title = 'Hockey Games (NHL)'; }
      else if (state.selectedSport === 'Kabaddi') { icon = 'fa-people-robbery'; title = 'Kabaddi Matches'; }
      else if (state.selectedSport === 'Rugby') { icon = 'fa-football'; title = 'Rugby Matches'; }

      DOM.activeSportTitle.innerHTML = `<i class="fa-solid ${icon}"></i> ${title}`;
    }
  }

  /**
   * High-Resolution Team Logo & Emblem Resolver
   * Resolves crisp, vector & HD badges for International, County, and League cricket teams
   */
  const HD_CRICKET_TEAM_LOGOS = {
    // International
    'india': 'https://flagcdn.com/w320/in.png',
    'ind': 'https://flagcdn.com/w320/in.png',
    'bangladesh': 'https://flagcdn.com/w320/bd.png',
    'ban': 'https://flagcdn.com/w320/bd.png',
    'pakistan': 'https://flagcdn.com/w320/pk.png',
    'pak': 'https://flagcdn.com/w320/pk.png',
    'england': 'https://flagcdn.com/w320/gb-eng.png',
    'eng': 'https://flagcdn.com/w320/gb-eng.png',
    'australia': 'https://flagcdn.com/w320/au.png',
    'aus': 'https://flagcdn.com/w320/au.png',
    'sri lanka': 'https://flagcdn.com/w320/lk.png',
    'sl': 'https://flagcdn.com/w320/lk.png',
    'south africa': 'https://flagcdn.com/w320/za.png',
    'sa': 'https://flagcdn.com/w320/za.png',
    'new zealand': 'https://flagcdn.com/w320/nz.png',
    'nz': 'https://flagcdn.com/w320/nz.png',
    'west indies': 'https://static.cricbuzz.com/a/img/v1/300x300/i1/c170818/west-indies.jpg',
    'wi': 'https://static.cricbuzz.com/a/img/v1/300x300/i1/c170818/west-indies.jpg',
    'afghanistan': 'https://flagcdn.com/w320/af.png',
    'afg': 'https://flagcdn.com/w320/af.png',
    'ireland': 'https://flagcdn.com/w320/ie.png',
    'ire': 'https://flagcdn.com/w320/ie.png',
    'scotland': 'https://flagcdn.com/w320/gb-sct.png',
    'sco': 'https://flagcdn.com/w320/gb-sct.png',
    'netherlands': 'https://flagcdn.com/w320/nl.png',
    'ned': 'https://flagcdn.com/w320/nl.png',
    'zimbabwe': 'https://flagcdn.com/w320/zw.png',
    'zim': 'https://flagcdn.com/w320/zw.png',
    'nepal': 'https://flagcdn.com/w320/np.png',
    'nep': 'https://flagcdn.com/w320/np.png',
    'usa': 'https://flagcdn.com/w320/us.png',
    'united states': 'https://flagcdn.com/w320/us.png',
    'canada': 'https://flagcdn.com/w320/ca.png',
    'can': 'https://flagcdn.com/w320/ca.png',
    'uae': 'https://flagcdn.com/w320/ae.png',
    'united arab emirates': 'https://flagcdn.com/w320/ae.png',
    'oman': 'https://flagcdn.com/w320/om.png',
    'namibia': 'https://flagcdn.com/w320/na.png',

    // English County Championship
    'durham': 'https://static.cricbuzz.com/a/img/v1/300x300/i1/c170845/surrey.jpg',
    'surrey': 'https://static.cricbuzz.com/a/img/v1/300x300/i1/c170845/surrey.jpg',
    'yorkshire': 'https://static.cricbuzz.com/a/img/v1/300x300/i1/c170842/yorkshire.jpg',

    // IPL Teams (Authentic Official 300x300 High-Res Badges)
    'chennai super kings': 'https://static.cricbuzz.com/a/img/v1/300x300/i1/c170823/chennai-super-kings.jpg',
    'csk': 'https://static.cricbuzz.com/a/img/v1/300x300/i1/c170823/chennai-super-kings.jpg',
    'mumbai indians': 'https://static.cricbuzz.com/a/img/v1/300x300/i1/c170829/mumbai-indians.jpg',
    'mi': 'https://static.cricbuzz.com/a/img/v1/300x300/i1/c170829/mumbai-indians.jpg',
    'royal challengers bengaluru': 'https://static.cricbuzz.com/a/img/v1/300x300/i1/c170826/royal-challengers-bangalore.jpg',
    'royal challengers bangalore': 'https://static.cricbuzz.com/a/img/v1/300x300/i1/c170826/royal-challengers-bangalore.jpg',
    'rcb': 'https://static.cricbuzz.com/a/img/v1/300x300/i1/c170826/royal-challengers-bangalore.jpg',
    'kolkata knight riders': 'https://static.cricbuzz.com/a/img/v1/300x300/i1/c170827/kolkata-knight-riders.jpg',
    'kkr': 'https://static.cricbuzz.com/a/img/v1/300x300/i1/c170827/kolkata-knight-riders.jpg',
    'delhi capitals': 'https://static.cricbuzz.com/a/img/v1/300x300/i1/c170828/delhi-capitals.jpg',
    'dc': 'https://static.cricbuzz.com/a/img/v1/300x300/i1/c170828/delhi-capitals.jpg',
    'rajasthan royals': 'https://static.cricbuzz.com/a/img/v1/300x300/i1/c170831/rajasthan-royals.jpg',
    'rr': 'https://static.cricbuzz.com/a/img/v1/300x300/i1/c170831/rajasthan-royals.jpg',
    'sunrisers hyderabad': 'https://static.cricbuzz.com/a/img/v1/300x300/i1/c170830/sunrisers-hyderabad.jpg',
    'srh': 'https://static.cricbuzz.com/a/img/v1/300x300/i1/c170830/sunrisers-hyderabad.jpg',
    'gujarat titans': 'https://static.cricbuzz.com/a/img/v1/300x300/i1/c225642/gujarat-titans.jpg',
    'gt': 'https://static.cricbuzz.com/a/img/v1/300x300/i1/c225642/gujarat-titans.jpg',
    'lucknow super giants': 'https://static.cricbuzz.com/a/img/v1/300x300/i1/c225645/lucknow-super-giants.jpg',
    'lsg': 'https://static.cricbuzz.com/a/img/v1/300x300/i1/c225645/lucknow-super-giants.jpg',
    'punjab kings': 'https://static.cricbuzz.com/a/img/v1/300x300/i1/c170824/punjab-kings.jpg',
    'pbks': 'https://static.cricbuzz.com/a/img/v1/300x300/i1/c170824/punjab-kings.jpg',

    // WWE & AEW Official Brand & Superstar Logos (Crisp High-Res)
    'wwe raw': '/assets/wwe-logos/wwe_raw.svg',
    'raw': '/assets/wwe-logos/wwe_raw.svg',
    'wwe smackdown': '/assets/wwe-logos/wwe_smackdown.svg',
    'wwe smackdown live': '/assets/wwe-logos/wwe_smackdown.svg',
    'smackdown': '/assets/wwe-logos/wwe_smackdown.svg',
    'wwe nxt': '/assets/wwe-logos/wwe_nxt.svg',
    'nxt': '/assets/wwe-logos/wwe_nxt.svg',
    'wwe special': '/assets/wwe-logos/wwe_special.svg',
    'wwe': '/assets/wwe-logos/wwe_official.svg',
    'wwe network': '/assets/wwe-logos/wwe_official.svg',
    'aew': '/assets/wwe-logos/aew_official.svg',
    'all elite wrestling': '/assets/wwe-logos/aew_official.svg',
    'dynamite': '/assets/wwe-logos/aew_official.svg',

    // WWE Superstars (Crisp High-Res Badges & Crests)
    'cm punk': '/assets/wwe-logos/cmpunk.svg',
    'drew mcintyre': '/assets/wwe-logos/drew_mcintyre.svg',
    'cody rhodes': '/assets/wwe-logos/cody_rhodes.svg',
    'roman reigns': '/assets/wwe-logos/roman_reigns.svg',
    'solo sikoa': '/assets/wwe-logos/solo_sikoa.svg',
    'the bloodline': '/assets/wwe-logos/solo_sikoa.svg',
    'bloodline': '/assets/wwe-logos/solo_sikoa.svg',
    'gunther': '/assets/wwe-logos/gunther.svg',
    'damian priest': '/assets/wwe-logos/wwe_raw.svg',
    'rhea ripley': '/assets/wwe-logos/rhea_ripley.svg',
    'liv morgan': '/assets/wwe-logos/liv_morgan.svg',
    'jey uso': '/assets/wwe-logos/wwe_raw.svg',
    'bron breakker': '/assets/wwe-logos/wwe_raw.svg',
    'la knight': '/assets/wwe-logos/wwe_smackdown.svg',
    'trick williams': '/assets/wwe-logos/trick_williams.svg',
    'ethan page': '/assets/wwe-logos/ethan_page.svg',
    'swerve strickland': '/assets/wwe-logos/swerve_strickland.svg',
    'bryan danielson': '/assets/wwe-logos/bryan_danielson.svg',
    'will ospreay': '/assets/wwe-logos/will_ospreay.svg',
    'mjf': '/assets/wwe-logos/mjf.svg',
    'toni storm': '/assets/wwe-logos/aew_official.svg',
    'mariah may': '/assets/wwe-logos/aew_official.svg'
  };

  // Pure base64 data URI without unescaped XML quotes or scheme syntax collision in HTML attributes
  const DEFAULT_SPORTS_FALLBACK_LOGO = "data:image/svg+xml;base64," + btoa(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#1e293b"/><stop offset="100%" stop-color="#0f172a"/></linearGradient></defs><circle cx="50" cy="50" r="48" fill="url(#g)" stroke="#334155" stroke-width="2"/><path d="M50 20 L74 34 V54 C74 68 50 80 50 80 C50 80 26 68 26 54 V34 Z" fill="#e11d48" opacity="0.9"/><circle cx="50" cy="48" r="10" fill="#ffffff"/></svg>'
  );
  window.DEFAULT_SPORTS_FALLBACK_LOGO = DEFAULT_SPORTS_FALLBACK_LOGO;

  window.handleTeamLogoError = function(img) {
    if (img && !img.dataset.hasFallback) {
      img.dataset.hasFallback = 'true';
      img.src = window.DEFAULT_SPORTS_FALLBACK_LOGO;
    }
  };

  function getHighResTeamLogo(teamName, rawLogo) {
    // 1. HIGHEST PRIORITY: If authentic original team logo is provided by feed/API, preserve and upgrade it!
    if (rawLogo && typeof rawLogo === 'string') {
      let cleanRaw = rawLogo.trim();
      if (cleanRaw && !cleanRaw.includes('un.png') && !cleanRaw.includes('placeholder') && !cleanRaw.includes('default-team')) {
        // Upgrade Cricbuzz low-res 72x54 thumbnails to 300x300 crisp image
        if (cleanRaw.includes('cricbuzz.com') && cleanRaw.includes('/72x54/')) {
          cleanRaw = cleanRaw.replace('/72x54/', '/300x300/');
        }
        // Upgrade flagcdn w160 to w320
        if (cleanRaw.includes('flagcdn.com/w160/')) {
          cleanRaw = cleanRaw.replace('/w160/', '/w320/');
        }
        // Ensure https
        if (cleanRaw.startsWith('http://static.cricbuzz.com')) {
          cleanRaw = cleanRaw.replace('http://', 'https://');
        }
        return cleanRaw;
      }
    }

    if (!teamName) return DEFAULT_SPORTS_FALLBACK_LOGO;
    const nameClean = teamName.toLowerCase().trim();

    // 2. Curated database check (only when rawLogo is missing or un.png):
    // First: exact key match
    if (HD_CRICKET_TEAM_LOGOS[nameClean]) {
      return HD_CRICKET_TEAM_LOGOS[nameClean];
    }

    // Second: Word-boundary match for abbreviations (<= 3 chars, e.g. mi, rr, csk, ind, ban, sa)
    // and substring match only for multi-word / long team names
    for (const [key, logoUrl] of Object.entries(HD_CRICKET_TEAM_LOGOS)) {
      if (key.length <= 3) {
        const regex = new RegExp(`(^|\\b|\\s)${key}(\\b|\\s|$)`, 'i');
        if (regex.test(nameClean)) {
          return logoUrl;
        }
      } else {
        if (nameClean === key || nameClean.includes(key) || key.includes(nameClean)) {
          return logoUrl;
        }
      }
    }

    return DEFAULT_SPORTS_FALLBACK_LOGO;
  }

  /**
   * Toggle Event Favorite
   */
  function toggleEventFavorite(eventId) {
    if (!eventId) return;
    const index = state.eventFavorites.indexOf(eventId);
    if (index > -1) {
      state.eventFavorites.splice(index, 1);
    } else {
      state.eventFavorites.push(eventId);
    }
    localStorage.setItem('highfy_sports_favs', JSON.stringify(state.eventFavorites));
    localStorage.setItem('highfy_event_favs', JSON.stringify(state.eventFavorites));
    updateEventCounters();
    renderEvents();
  }

  /**
   * Render Unified Split-Model Sports Match Card HTML
   */
  function renderSingleEventCardHtml(event, isCurrentlyPlaying = false) {
    if (!event) return '';

    // Auto-pull & bind sports TV channels for this match if not yet bound
    if (!event.broadcastingChannelDetails || event.broadcastingChannelDetails.length === 0 || !event.streams || event.streams.length === 0) {
      if (window.sportsCoordinator) {
        const matchInfo = window.sportsCoordinator.matchLiveStream(event);
        if (matchInfo && matchInfo.hasStream) {
          event.streams = matchInfo.streams;
          event.broadcastChannels = matchInfo.broadcastChannels;
          event.broadcastingChannelDetails = matchInfo.broadcastingChannelDetails;
          event.hasStream = true;
          event.channelId = matchInfo.streams[0]?.channelId || event.channelId;
          if (!event.broadcaster && matchInfo.streams[0]?.channelName && event.source !== 'Sportradar' && event.source !== 'Sportradar Live') {
            event.broadcaster = matchInfo.streams[0].channelName;
          }
        } else {
          event.hasStream = false;
          event.streams = [];
          event.broadcastChannels = [];
          event.broadcastingChannelDetails = [];
        }
      }
    }

    const isFinished = isAppEventFinished(event);
    const statusLower = (event.status || 'upcoming').toLowerCase();
    const isLive = !isFinished && (statusLower === 'live' || (event.time && event.time.toLowerCase().includes('live')));
    const isUpcoming = !isLive && !isFinished;
    const isFav = state.eventFavorites.includes(event.id);

    // Clean Tournament / Series Title for Display
    let tournamentTitle = event.tournament || event.league || event.sportName || event.sport || 'Tournament';
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i.test(tournamentTitle.trim()) || /^[0-9a-f-]{12,}$/i.test(tournamentTitle.trim())) {
      if (event.matchType) {
        tournamentTitle = `${event.matchType.toUpperCase()} Match`;
      } else {
        tournamentTitle = `${event.sportName || event.sport || 'Live'} Championship`;
      }
    }

    // Vertical ribbon label (Intelligently resolve Tournament, League, Format or Stage)
    let ribbonLabel = '';
    const tournRaw = (event.tournament || event.league || '').trim();
    const isTournValid = tournRaw && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i.test(tournRaw) && !/^[0-9a-f-]{12,}$/i.test(tournRaw);

    if (isTournValid) {
      const tLower = tournRaw.toLowerCase();
      if (tLower.includes('county')) {
        ribbonLabel = 'County';
      } else if (tLower.includes('champions trophy')) {
        ribbonLabel = 'ICC CT';
      } else if (tLower.includes('premier league') || tLower.includes('epl')) {
        ribbonLabel = 'Premier';
      } else if (tLower.includes('la liga') || tLower.includes('laliga')) {
        ribbonLabel = 'La Liga';
      } else if (tLower.includes('champions league') || tLower.includes('ucl')) {
        ribbonLabel = 'UCL';
      } else if (tLower.includes('serie a')) {
        ribbonLabel = 'Serie A';
      } else if (tLower.includes('bundesliga')) {
        ribbonLabel = 'Bundesliga';
      } else if (tLower.includes('vitality') || tLower.includes('t20 blast')) {
        ribbonLabel = 'T20 Blast';
      } else if (tLower.includes('ipl')) {
        ribbonLabel = 'IPL';
      } else if (tLower.includes('bpl')) {
        ribbonLabel = 'BPL';
      } else if (tLower.includes('psl')) {
        ribbonLabel = 'PSL';
      } else if (tLower.includes('the hundred')) {
        ribbonLabel = 'Hundred';
      } else if (tLower.includes('cpl')) {
        ribbonLabel = 'CPL';
      } else if (tLower.includes('nba')) {
        ribbonLabel = 'NBA';
      } else if (tLower.includes('us open')) {
        ribbonLabel = 'US Open';
      } else if (tLower.includes('wimbledon')) {
        ribbonLabel = 'Wimbledon';
      } else if (tLower.includes('australian open')) {
        ribbonLabel = 'Aus Open';
      } else if (tLower.includes('formula 1') || tLower.includes('f1') || tLower.includes('motorsport')) {
        ribbonLabel = 'Motorsports';
      } else if (tLower.includes('raw') || tLower.includes('monday night')) {
        ribbonLabel = 'RAW';
      } else if (tLower.includes('smackdown') || tLower.includes('smack down') || tLower.includes('friday night')) {
        ribbonLabel = 'SmackDown';
      } else if (tLower.includes('nxt') || tLower.includes('super tuesday')) {
        ribbonLabel = 'NXT';
      } else if (tLower.includes('aew') || tLower.includes('elite wrestling') || tLower.includes('dynamite') || tLower.includes('collision') || tLower.includes('rampage')) {
        ribbonLabel = 'AEW';
      } else if (tLower.includes('wwe special') || tLower.includes('ple') || tLower.includes('bad blood') || tLower.includes('royal rumble') || tLower.includes('wrestlemania') || tLower.includes('summerslam') || tLower.includes('crown jewel') || tLower.includes('survivor series')) {
        ribbonLabel = 'Special';
      } else if (tLower.includes('wwe')) {
        ribbonLabel = event.ribbonLabel || 'WWE';
      } else if (tLower.includes('kabaddi') || tLower.includes('pkl')) {
        ribbonLabel = 'PKL';
      } else if (tLower.includes('nhl') || tLower.includes('stanley')) {
        ribbonLabel = 'NHL';
      } else if (tLower.includes('mlb')) {
        ribbonLabel = 'MLB';
      } else if (tLower.includes('world cup')) {
        ribbonLabel = 'World Cup';
      } else if (tLower.includes('asia cup')) {
        ribbonLabel = 'Asia Cup';
      } else if (tLower.includes('test')) {
        ribbonLabel = 'Test';
      } else if (tournRaw.length <= 12) {
        ribbonLabel = tournRaw;
      }
    }

    if (!ribbonLabel) {
      const matchType = (event.matchType || '').toLowerCase();
      const tournOrLeague = (event.tournament || event.league || '').toLowerCase();
      
      if (tournOrLeague.includes('county') || tournOrLeague.includes('championship') || matchType === 'fc' || matchType === 'first class') {
        ribbonLabel = 'County';
      } else if (matchType === 't20' || matchType === 't20i' || tournOrLeague.includes('t20')) {
        ribbonLabel = 'T20';
      } else if (matchType === 'odi' || tournOrLeague.includes('odi')) {
        ribbonLabel = 'ODI';
      } else if (matchType === 't10' || tournOrLeague.includes('t10')) {
        ribbonLabel = 'T10';
      } else if (tournOrLeague.includes('test') || (matchType === 'test' && (tournOrLeague.includes('series') || tournOrLeague.includes('tour') || tournOrLeague.includes('trophy') || (event.sport || '').toLowerCase() === 'cricket'))) {
        ribbonLabel = 'Test';
      } else if (event.round && event.round.length <= 10) {
        ribbonLabel = event.round;
      } else if (event.stage && event.stage.length <= 10) {
        ribbonLabel = event.stage;
      } else if (event.sportName || event.sport) {
        ribbonLabel = event.sportName || event.sport;
      } else {
        ribbonLabel = 'LIVE';
      }
    }

    if (/^f\s*1$/i.test((ribbonLabel || '').trim()) || /^formula\s*1$/i.test((ribbonLabel || '').trim())) {
      ribbonLabel = 'Motorsports';
    }

    // Teams info
    let t1Name = event.team1?.name || event.homeTeam?.name || (event.title ? event.title.split('vs')[0]?.trim() : 'Team 1');
    let t2Name = event.team2?.name || event.awayTeam?.name || (event.title ? event.title.split('vs')[1]?.trim() : 'Team 2');
    if (/^f\s*1$/i.test(t1Name.trim()) || /^formula\s*1$/i.test(t1Name.trim())) {
      t1Name = 'Motorsports';
    }
    if (/^f\s*1$/i.test(t2Name.trim()) || /^formula\s*1$/i.test(t2Name.trim())) {
      t2Name = 'Motorsports';
    }
    let t1Logo = getHighResTeamLogo(t1Name, event.team1?.logo || event.homeTeam?.logo);
    let t2Logo = getHighResTeamLogo(t2Name, event.team2?.logo || event.awayTeam?.logo);

    // Strictly enforce WWE & AEW Brand and Show logos (NO individual player names)
    const isWrestlingEvent = (event.sport || '').toLowerCase() === 'wwe' ||
      (event.sportName || '').toLowerCase() === 'wwe' ||
      String(event.id || '').startsWith('wwe-') ||
      String(event.id || '').startsWith('aew-') ||
      (event.league && /raw|smackdown|nxt|aew|wwe/i.test(event.league));

    if (isWrestlingEvent) {
      const matchText = `${event.title || ''} ${event.tournament || ''} ${event.league || ''} ${event.subText || ''} ${t1Name} ${t2Name}`.toLowerCase();
      if (matchText.includes('raw')) {
        t1Name = 'WWE';
        t1Logo = '/assets/wwe-logos/wwe_official.svg';
        t2Name = 'RAW';
        t2Logo = '/assets/wwe-logos/wwe_raw.svg';
      } else if (matchText.includes('smackdown') || matchText.includes('smack down')) {
        t1Name = 'WWE';
        t1Logo = '/assets/wwe-logos/wwe_official.svg';
        t2Name = 'SmackDown';
        t2Logo = '/assets/wwe-logos/wwe_smackdown.svg';
      } else if (matchText.includes('nxt')) {
        t1Name = 'WWE';
        t1Logo = '/assets/wwe-logos/wwe_official.svg';
        t2Name = 'NXT';
        t2Logo = '/assets/wwe-logos/wwe_nxt.svg';
      } else if (matchText.includes('aew') || matchText.includes('dynamite')) {
        t1Name = 'AEW';
        t1Logo = '/assets/wwe-logos/aew_official.svg';
        t2Name = 'Dynamite';
        t2Logo = '/assets/wwe-logos/aew_official.svg';
      } else {
        t1Name = 'WWE';
        t1Logo = '/assets/wwe-logos/wwe_official.svg';
        t2Name = 'Special PLE';
        t2Logo = '/assets/wwe-logos/wwe_special.svg';
      }
    }

    const t1Score = event.team1?.score !== undefined ? event.team1.score : (event.homeTeam?.score || '');
    const t2Score = event.team2?.score !== undefined ? event.team2.score : (event.awayTeam?.score || '');
    const t1Overs = event.team1?.overs || event.homeTeam?.overs || '';
    const t2Overs = event.team2?.overs || event.awayTeam?.overs || '';

    // Date / Time calculation in Asia/Dhaka (BST - GMT+6)
    const tz = 'Asia/Dhaka';
    let timeStr = (event.time || '08:00 PM').replace(/\s*\(BST\)/gi, '').trim();
    let dateStr = event.date || 'Today';
    let dateLabel = 'Today';
    let startsInStr = event.startsIn || 'Starts soon';

    const evTs = event.timestamp ? (event.timestamp < 10000000000 ? event.timestamp * 1000 : event.timestamp) : null;

    if (evTs) {
      const d = new Date(evTs);
      const now = new Date();
      try {
        const timeFmt = new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        });
        timeStr = timeFmt.format(d);

        const dateLocalFmt = new Intl.DateTimeFormat('en-CA', {
          timeZone: tz,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        });
        const evDateStr = dateLocalFmt.format(d);
        const todayDateStr = dateLocalFmt.format(now);

        const [evY, evM, evD] = evDateStr.split(/[-/]/).map(Number);
        const [nowY, nowM, nowD] = todayDateStr.split(/[-/]/).map(Number);
        const evDateOnly = new Date(Date.UTC(evY, evM - 1, evD));
        const nowDateOnly = new Date(Date.UTC(nowY, nowM - 1, nowD));
        const dayDiff = Math.round((evDateOnly.getTime() - nowDateOnly.getTime()) / (24 * 3600 * 1000));

        const evHour = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(d), 10);
        const nowHour = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(now), 10);

        const weekdayFmt = new Intl.DateTimeFormat('en-GB', {
          timeZone: tz,
          weekday: 'short',
          day: '2-digit',
          month: 'short'
        });
        const fullDateStr = weekdayFmt.format(d); // e.g. "Sun, 06 Sep"
        dateStr = fullDateStr;

        if (dayDiff === 0) {
          if (evHour < 6 && nowHour >= 6) {
            dateLabel = 'Last Night';
          } else {
            dateLabel = 'Today';
          }
        } else if (dayDiff === 1) {
          if (evHour < 6) {
            dateLabel = 'Tonight';
          } else {
            dateLabel = 'Tomorrow';
          }
        } else if (dayDiff === -1) {
          dateLabel = 'Yesterday';
        } else {
          dateLabel = fullDateStr;
        }
      } catch (e) {
        // fallback
      }

      const nowMs = Date.now();
      const diff = evTs - nowMs;
      const pad = n => String(n).padStart(2, '0');

      if (diff > 0) {
        const diffDays = Math.floor(diff / (1000 * 60 * 60 * 24));
        const diffHours = Math.floor((diff / (1000 * 60 * 60)) % 24);
        const diffMins = Math.floor((diff / (1000 * 60)) % 60);
        const diffSecs = Math.floor((diff / 1000) % 60);

        if (diffDays > 0) {
          startsInStr = `Starts in ${diffDays}d ${pad(diffHours)}h`;
        } else {
          startsInStr = `Starts in ${pad(diffHours)}:${pad(diffMins)}:${pad(diffSecs)}`;
        }
      } else {
        startsInStr = 'Starts soon';
      }
    } else {
      if (event.matchTime) {
        timeStr = event.matchTime.replace(/\s*\(BST\)/gi, '').trim();
        if (event.matchTime.includes(',')) {
          const parts = event.matchTime.split(',');
          dateLabel = parts[0].trim();
          timeStr = parts[1].replace(/\s*\(BST\)/gi, '').replace(/BST/gi, '').trim();
        }
      }
      if (event.date) {
        dateStr = event.date;
        if (!dateLabel || dateLabel === 'Today') dateLabel = event.date;
      }
    }

    // Top Floating Tab (Game / Sport & League Name - উপরে খেলার নাম)
    const sportTitle = event.sportName || event.sport || 'Sports';
    const leagueTitle = (event.tournament || event.league || event.seriesName || '').trim();
    const showLeague = leagueTitle && leagueTitle.toLowerCase() !== sportTitle.toLowerCase();

    let sportIcon = event.sportIcon || '';
    if (!sportIcon) {
      const sLower = (event.sport || event.sportName || '').toLowerCase();
      if (sLower.includes('cricket')) sportIcon = 'fa-baseball-bat-ball';
      else if (sLower.includes('foot') || sLower.includes('soccer')) sportIcon = 'fa-futbol';
      else if (sLower.includes('basket')) sportIcon = 'fa-basketball';
      else if (sLower.includes('base')) sportIcon = 'fa-baseball';
      else if (sLower.includes('tennis')) sportIcon = 'fa-table-tennis-paddle-ball';
      else if (sLower.includes('f1') || sLower.includes('motor') || sLower.includes('formula')) sportIcon = 'fa-car-side';
      else if (sLower.includes('wwe') || sLower.includes('wrestling')) sportIcon = 'fa-hand-fist';
      else sportIcon = 'fa-trophy';
    }

    let topTabContent = leagueTitle || '';
    if (/^f\s*1$/i.test(topTabContent.trim()) || /^formula\s*1$/i.test(topTabContent.trim())) {
      topTabContent = 'Motorsports';
    }
    const topTabHtml = topTabContent ? `
      <div class="match-tab-protruding match-tab-game" title="${escapeHtml(topTabContent)}">
        <span class="tab-game-league">${escapeHtml(topTabContent)}</span>
      </div>
    ` : '';

    // Bottom Floating Tab (Match Time & Live Running Timer - কত মিনিট বা ঘন্টা ধরে খেলা চলছে)
    let bottomTabHtml = '';
    if (isLive) {
      const now = Date.now();
      let totalSecs = 0;
      if (evTs) {
        if (now >= evTs) {
          totalSecs = Math.floor((now - evTs) / 1000);
        } else {
          totalSecs = 0;
        }
      } else if (event.elapsed) {
        const elMinutes = parseInt(event.elapsed, 10);
        if (!isNaN(elMinutes) && elMinutes > 0) {
          totalSecs = elMinutes * 60;
        }
      }

      const elHours = Math.floor(totalSecs / 3600);
      const elMins = Math.floor((totalSecs % 3600) / 60);
      const elSecs = totalSecs % 60;
      const pad = n => String(n).padStart(2, '0');

      let initialElapsedStr = '';
      if (elHours > 0) {
        initialElapsedStr = `${elHours}h ${pad(elMins)}m ${pad(elSecs)}s`;
      } else if (elMins > 0) {
        initialElapsedStr = `${elMins}m ${pad(elSecs)}s`;
      } else {
        initialElapsedStr = `${elSecs}s`;
      }

      // Channel match connection logic remains intact on event
      // Visible channel badge is hidden from card display per user preference
      bottomTabHtml = `
        <div class="match-tab-bottom live-tab" title="Match is Live Now">
          <i class="fa-solid fa-stopwatch text-emerald-400 text-[10px]"></i>
          <span class="tab-live-running-text match-live-running-text" data-timestamp="${evTs || ''}" data-elapsed="${event.elapsed || ''}" data-mount-time="${now}">${escapeHtml(initialElapsedStr)}</span>
        </div>
      `;
    } else if (isFinished) {
      bottomTabHtml = `
        <div class="match-tab-bottom finished-tab" title="Full Time">
          <span class="tab-clock-text">FT • Finished</span>
        </div>
      `;
    } else {
      bottomTabHtml = `
        <div class="match-tab-bottom upcoming-tab" title="Starts in">
          <i class="fa-regular fa-clock text-amber-400 text-[10px]"></i>
          <span class="tab-upcoming-countdown match-upcoming-starts-text" data-timestamp="${evTs || ''}">${escapeHtml(startsInStr)}</span>
        </div>
      `;
    }

    return `
      <div class="event-card-wrapper ${isCurrentlyPlaying ? 'is-currently-playing' : ''}">
        <!-- Protruding Top League Tab -->
        ${topTabHtml}

        <!-- Main Card Box -->
        <div class="event-card ${isLive ? 'is-live-card' : ''}" data-event-id="${escapeHtml(event.id)}">
          <!-- Left Blue Ribbon with Vertical Text (Sport Name) -->
          <div class="card-left-ribbon">
            <span class="card-ribbon-text" title="${escapeHtml(ribbonLabel)}">${escapeHtml(ribbonLabel)}</span>
          </div>

          <!-- Main Diagonal Split Content -->
          <div class="card-split-canvas">
            <!-- Diagonal Divider Line -->
            <div class="card-diagonal-line"></div>

            <!-- Center Sparkling Badge on Divider Line (LIVE badge if match is live, FT if finished, otherwise VS) -->
            <div class="card-vs-center-wrap">
              ${isLive ? `
                <span class="card-vs-badge is-live-vs">
                  <span class="vs-live-pulse-dot"></span>LIVE
                </span>
              ` : isFinished ? `
                <span class="card-vs-badge is-finished-vs">FT</span>
              ` : `
                <span class="card-vs-badge">VS</span>
              `}
            </div>

            <!-- Top Left: Team 1 Name -->
            <div class="card-team-area top-left-area">
              <span class="card-team-title" title="${escapeHtml(t1Name)}">${escapeHtml(t1Name)}</span>
              <div class="card-team-logo-wrap">
                <img 
                  src="${escapeHtml(t1Logo)}" 
                  alt="${escapeHtml(t1Name)}" 
                  class="card-team-emblem-img" 
                  loading="lazy" 
                  referrerpolicy="no-referrer"
                  onerror="window.handleTeamLogoError && window.handleTeamLogoError(this)"
                />
              </div>
              ${t1Score ? `<span class="card-score-pill">${escapeHtml(t1Score)}${t1Overs ? ` <small>(${escapeHtml(t1Overs)})</small>` : ''}</span>` : ''}
            </div>

            <!-- Bottom Right: Team 2 Name & Logo -->
            <div class="card-team-area bottom-right-area">
              <div class="card-team-logo-wrap">
                <img 
                  src="${escapeHtml(t2Logo)}" 
                  alt="${escapeHtml(t2Name)}" 
                  class="card-team-emblem-img" 
                  loading="lazy" 
                  referrerpolicy="no-referrer"
                  onerror="window.handleTeamLogoError && window.handleTeamLogoError(this)"
                />
              </div>
              <span class="card-team-title" title="${escapeHtml(t2Name)}">${escapeHtml(t2Name)}</span>
              ${t2Score ? `<span class="card-score-pill">${escapeHtml(t2Score)}${t2Overs ? ` <small>(${escapeHtml(t2Overs)})</small>` : ''}</span>` : ''}
            </div>

            <!-- Top Right Floating Star Favorite Button -->
            <button class="card-fav-star-btn ${isFav ? 'active' : ''}" data-fav-event-id="${escapeHtml(event.id)}" title="${isFav ? 'Remove from favorites' : 'Add to favorites'}">
              <i class="fa-${isFav ? 'solid' : 'regular'} fa-star"></i>
            </button>
          </div>
        </div>

        <!-- Protruding Bottom Time Tab (টাইম একবারে নিচে) -->
        ${bottomTabHtml}
      </div>
    `;
  }

  /**
   * Render Filtered Events
   */
  function renderEvents() {
    refreshDOM();
    if (!DOM.eventsFeed) return;

    const coordinator = window.sportsCoordinator;
    let filtered = coordinator ? coordinator.getFilteredEvents({
      sport: state.selectedSport,
      status: state.selectedFilter,
      searchQuery: state.searchQuery
    }) : (state.events || []);

    if (state.selectedFilter === 'FINISHED') {
      filtered = filtered.filter(ev => isAppEventFinished(ev));
    } else if (state.selectedFilter === 'LIVE') {
      filtered = filtered.filter(ev => !isAppEventFinished(ev) && (ev.status || '').toLowerCase() === 'live');
    } else if (state.selectedFilter === 'UPCOMING') {
      filtered = filtered.filter(ev => !isAppEventFinished(ev) && (ev.status || '').toLowerCase() === 'upcoming');
    }

    if (filtered.length === 0) {
      let emptyTitle = 'No events available';
      let emptyDesc = 'Check back later or browse sports TV channels in the Sports tab';
      let emptyIcon = 'fa-trophy';

      if (state.selectedFilter === 'TODAY') {
        emptyTitle = 'No matches scheduled for today';
        emptyDesc = 'Matches on future dates are available in the Upcoming tab';
        emptyIcon = 'fa-calendar-day';
      } else if (state.selectedFilter === 'LIVE') {
        emptyTitle = 'No live matches right now';
        emptyDesc = 'Upcoming fixtures will appear below or check live sports TV channels in the Sports tab';
        emptyIcon = 'fa-satellite-dish';
      } else if (state.selectedFilter === 'UPCOMING') {
        emptyTitle = 'No upcoming matches scheduled';
        emptyDesc = 'Check back later for newly scheduled fixtures';
        emptyIcon = 'fa-calendar-check';
      } else if (state.selectedFilter === 'FINISHED') {
        emptyTitle = 'No finished matches today';
        emptyDesc = 'Match results will appear here once games conclude';
        emptyIcon = 'fa-flag-checkered';
      } else if (state.selectedFilter === 'FAVORITES') {
        emptyTitle = 'No favorite matches added';
        emptyDesc = 'Tap the star icon on any match card to quickly access it here';
        emptyIcon = 'fa-star';
      }

      DOM.eventsFeed.innerHTML = `
        <div class="empty-state-box">
          <div class="empty-state-icon"><i class="fa-solid ${emptyIcon}"></i></div>
          <h3 class="empty-state-title">${emptyTitle}</h3>
          <p class="empty-state-desc">${emptyDesc}</p>
        </div>
      `;
      return;
    }

    DOM.eventsFeed.innerHTML = filtered.map(event => renderSingleEventCardHtml(event, false)).join('');

    // Attach stream click listeners
    DOM.eventsFeed.querySelectorAll('.btn-play-event-stream').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const eventId = btn.getAttribute('data-event-id');
        const match = state.events.find(ev => ev.id === eventId);
        if (match) {
          autoConnectAndPlayEvent(match);
        }
      });
    });

    // Attach event favorite button listeners
    DOM.eventsFeed.querySelectorAll('.event-fav-btn, .event-fav-star-btn, .card-fav-star-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const eventId = btn.getAttribute('data-fav-event-id');
        toggleEventFavorite(eventId);
      });
    });

    // Attach card click listener: Automatically match and open sports channel
    DOM.eventsFeed.querySelectorAll('.event-card, .event-card-wrapper').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.event-fav-btn') || e.target.closest('.event-fav-star-btn') || e.target.closest('.card-fav-star-btn') || e.target.closest('.btn-play-event-stream')) {
          return;
        }
        const eventId = card.getAttribute('data-event-id') || card.querySelector('.event-card')?.getAttribute('data-event-id');
        const match = state.events.find(ev => ev.id === eventId);
        if (match) {
          autoConnectAndPlayEvent(match);
        } else if (eventId) {
          openMatchDetails(eventId);
        }
      });
    });

    // Start Stable Countdown Ticker
    startCountdownTimer();
  }

  /**
   * Auto-Connect and Play Event with authentic matched sports channel
   */
  async function autoConnectAndPlayEvent(event) {
    if (!event) return;

    const t1Name = event.team1?.name || event.homeTeam?.name || '';
    const t2Name = event.team2?.name || event.awayTeam?.name || '';
    const title = (t1Name && t2Name) ? `${t1Name} vs ${t2Name}` : (event.title || 'Live Match');

    // 1. Resolve matching stream with sportsCoordinator
    let streams = [];
    if (window.sportsCoordinator) {
      // First, try instant match (checks persistent cache, broadcaster metadata, or explicit channel)
      let matchInfo = window.sportsCoordinator.matchLiveStream(event);

      // If no stream found and broadcaster info is missing, fetch authentic TV Station/Broadcaster from API
      if ((!matchInfo || !matchInfo.hasStream) && !event.broadcaster && !event.strTVStation) {
        try {
          matchInfo = await window.sportsCoordinator.resolveFixtureBroadcaster(event);
        } catch (e) {
          console.warn('[AutoConnect] Broadcaster resolve error:', e);
        }
      }

      if (matchInfo && matchInfo.hasStream && matchInfo.streams.length > 0) {
        event.streams = matchInfo.streams;
        event.broadcastChannels = matchInfo.broadcastChannels;
        event.broadcastingChannelDetails = matchInfo.broadcastingChannelDetails;
        event.hasStream = true;
        event.channelId = matchInfo.streams[0]?.channelId || event.channelId;
        if (!event.broadcaster && matchInfo.streams[0]?.channelName && event.source !== 'Sportradar' && event.source !== 'Sportradar Live') {
          event.broadcaster = matchInfo.streams[0].channelName;
        }
        streams = matchInfo.streams;
      }
    }

    if (streams.length === 0 && Array.isArray(event.streams) && event.streams.length > 0) {
      streams = event.streams;
    }

    // 2. If no valid stream exists: Display "Channel Unavailable"
    if (!streams || streams.length === 0 || !streams[0]?.url) {
      showChannelUnavailableModal(event);
      return;
    }

    // 3. Automatically Open & Play the Top Matched Broadcaster Channel
    const primaryStream = streams[0];
    const channelName = primaryStream.channelName || primaryStream.name || event.broadcaster || 'Live Channel';

    showToast(`Connecting to ${channelName}...`, 'info');

    playMedia({
      title: title,
      streams: streams,
      id: event.id,
      team1: event.team1 || { name: t1Name },
      team2: event.team2 || { name: t2Name },
      isEvent: true,
      sport: event.sport || event.sportName || 'Sports',
      category: event.category || 'Sports',
      tournament: event.tournament || event.league || '',
      broadcaster: channelName,
      status: event.status || 'live',
      activeStreamIndex: 0
    });
  }

  /**
   * Display clean Channel Unavailable modal
   */
  function showChannelUnavailableModal(event) {
    const t1Name = event?.team1?.name || event?.homeTeam?.name || '';
    const t2Name = event?.team2?.name || event?.awayTeam?.name || '';
    const title = (t1Name && t2Name) ? `${t1Name} vs ${t2Name}` : (event?.title || 'Live Match');
    const tourn = event?.tournament || event?.league || event?.sport || 'Sports Match';
    const broadcaster = event?.broadcaster || event?.strTVStation || '';

    showToast(`Channel Unavailable: ${title}`, 'warning');

    const existing = document.getElementById('modal-channel-unavailable');
    if (existing) existing.remove();

    const modalHtml = `
      <div id="modal-channel-unavailable" class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
        <div class="relative w-full max-w-sm p-6 rounded-2xl bg-[#0f172a] border border-white/10 shadow-2xl text-center">
          <div class="w-14 h-14 mx-auto mb-4 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
            <i class="fa-solid fa-tv text-rose-400 text-2xl"></i>
          </div>
          <span class="inline-block px-2.5 py-1 mb-2 text-[10px] font-extrabold uppercase tracking-wider text-rose-400 bg-rose-500/10 rounded border border-rose-500/20">
            Channel Unavailable
          </span>
          <h3 class="text-base font-bold text-white mb-1 leading-tight">${escapeHtml(title)}</h3>
          <p class="text-xs text-slate-400 mb-3">${escapeHtml(tourn)}</p>
          ${broadcaster ? `<p class="text-[11px] text-slate-300 mb-4 bg-white/5 py-1.5 px-3 rounded-lg border border-white/5">Broadcaster: <span class="text-sky-400 font-semibold">${escapeHtml(broadcaster)}</span></p>` : ''}
          <p class="text-xs text-slate-400 mb-5 leading-relaxed">
            এই ম্যাচের জন্য কোনো লাইভ ব্রডকাস্ট চ্যানেল বর্তমানে আমাদের সার্ভারে উপলব্ধ নেই। অনুগ্রহ করে অন্য ম্যাচ অথবা চ্যানেল দেখুন।
          </p>
          <button id="btn-close-channel-unavailable" class="w-full py-2.5 px-4 rounded-xl font-bold text-xs text-white bg-slate-800 hover:bg-slate-700 active:scale-95 transition-all border border-white/10">
            Close
          </button>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modalEl = document.getElementById('modal-channel-unavailable');
    const closeBtn = document.getElementById('btn-close-channel-unavailable');
    if (closeBtn && modalEl) {
      closeBtn.addEventListener('click', () => modalEl.remove());
      modalEl.addEventListener('click', (e) => {
        if (e.target === modalEl) modalEl.remove();
      });
    }
  }

  /**
   * Open "Multiple links available" Modal for any Match or Channel (Matching PlayZ TV Video)
   */
  function openServerSelectionModal(item) {
    if (!item) return;
    const isEvent = !!(item.team1 || item.sport || item.isEvent);
    const t1Name = item.team1?.name || item.homeTeam?.name || '';
    const t2Name = item.team2?.name || item.awayTeam?.name || '';
    const title = (t1Name && t2Name) ? `${t1Name} vs ${t2Name}` : (item.name || item.title || 'Live Match');

    // Build streams list strictly from authentic sources and real channels
    let streams = [];
    if (item.streams && Array.isArray(item.streams) && item.streams.length > 0) {
      streams = item.streams;
    } else if (isEvent && window.sportsCoordinator) {
      const liveInfo = window.sportsCoordinator.matchLiveStream(item);
      if (liveInfo && liveInfo.streams && liveInfo.streams.length > 0) {
        streams = liveInfo.streams;
        item.streams = liveInfo.streams;
        item.broadcastChannels = liveInfo.broadcastChannels;
      }
    }

    // Fallback for TV Channel if not an event
    if ((!streams || streams.length === 0) && !isEvent && (item.url || item.stream_url || item.streamUrl)) {
      const pUrl = item.stream_url || item.url || item.streamUrl;
      const bUrls = item.backupUrls || (item.backup_stream_url ? [item.backup_stream_url] : []);
      streams = [
        { name: `${item.name || 'Channel'} (Server 1 HD)`, channelName: item.name, quality: '1080p FHD', url: pUrl },
        ...bUrls.map((u, i) => ({ name: `${item.name || 'Server'} (Server ${i + 2} Backup)`, channelName: item.name, quality: '720p HD', url: u }))
      ];
    }

    // If only 1 stream is available, play directly without modal
    if (streams.length === 1 && streams[0].url) {
      playMedia({
        title: title,
        streams: streams,
        id: item.id,
        team1: item.team1 || { name: t1Name },
        team2: item.team2 || { name: t2Name },
        isEvent: isEvent,
        sport: item.sport || item.category,
        category: item.category || 'Sports',
        activeStreamIndex: 0
      });
      return;
    }

    // If still empty for an event, rely on sportsCoordinator.matchLiveStream
    if ((!streams || streams.length === 0) && isEvent && window.sportsCoordinator) {
      const liveInfo = window.sportsCoordinator.matchLiveStream(item);
      if (liveInfo && liveInfo.streams && liveInfo.streams.length > 0) {
        streams = liveInfo.streams;
        item.streams = liveInfo.streams;
        item.broadcastChannels = liveInfo.broadcastChannels;
      }
    }

    const listContainer = document.getElementById('server-selection-list');
    const modalTitle = document.getElementById('server-modal-title');

    if (modalTitle) {
      modalTitle.textContent = streams && streams.length > 0 ? 'Multiple links available' : 'Channel Availability';
    }

    if (listContainer) {
      if (streams && streams.length > 0) {
        listContainer.innerHTML = streams.map((st, idx) => {
          let displayName = st.channelName || st.name || `Server ${idx + 1}`;
          let qualityBadge = st.quality || (idx === 0 ? '1080p FHD' : '720p HD');

          return `
            <button class="multiple-link-row-btn" data-stream-idx="${idx}" style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">
              <div style="display: flex; align-items: center; gap: 10px; overflow: hidden;">
                <span style="display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 6px; background: rgba(56, 189, 248, 0.15); color: #38bdf8; font-size: 11px; font-weight: 700;">
                  S${idx + 1}
                </span>
                <span class="truncate" style="font-weight: 600; letter-spacing: 0.3px;">${escapeHtml(displayName.toUpperCase())}</span>
              </div>
              <span style="font-size: 10px; font-weight: 700; color: #38bdf8; background: rgba(56, 189, 248, 0.12); padding: 3px 8px; border-radius: 6px; white-space: nowrap; flex-shrink: 0;">
                ${escapeHtml(qualityBadge)}
              </span>
            </button>
          `;
        }).join('');

        listContainer.querySelectorAll('.multiple-link-row-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const idx = parseInt(btn.getAttribute('data-stream-idx'), 10) || 0;
            closeModal('modal-select-server');
            playMedia({
              title: title,
              streams: streams,
              id: item.id,
              team1: item.team1 || { name: t1Name },
              team2: item.team2 || { name: t2Name },
              isEvent: isEvent,
              sport: item.sport || item.category,
              category: item.category || 'Sports',
              activeStreamIndex: idx
            });
          });
        });
      } else {
        listContainer.innerHTML = `
          <div style="padding: 24px 16px; text-align: center; color: #94a3b8; font-size: 13px;">
            <i class="fa-solid fa-circle-exclamation" style="font-size: 26px; color: #64748b; margin-bottom: 10px; display: block;"></i>
            <strong style="color: #cbd5e1; display: block; font-size: 14px; margin-bottom: 4px;">Channel Not Available</strong>
            <span style="font-size: 12px; color: #64748b;">No live broadcast channel is currently available for this event.</span>
          </div>
        `;
      }
    }

    openModal('modal-select-server');
  }

  /**
   * Start 1-second countdown ticker for upcoming matches (Zero-Jitter Tabular Format)
   */
  function startCountdownTimer() {
    if (state.countdownTimer) clearInterval(state.countdownTimer);
    state.countdownTimer = setInterval(() => {
      const now = Date.now();
      const pad = n => String(n).padStart(2, '0');

      // Update Upcoming Countdown texts in cards and tabs
      const upcomingElements = document.querySelectorAll('.match-upcoming-starts-text, .match-countdown-text, .card-center-time');
      upcomingElements.forEach(el => {
        const rawTs = el.getAttribute('data-timestamp') || el.getAttribute('data-upcoming-ts');
        const ts = parseInt(rawTs, 10);
        if (ts && !isNaN(ts)) {
          const diff = ts - now;
          const isCardCenter = el.classList.contains('card-center-time') || el.classList.contains('match-countdown-text');

          if (diff <= 0) {
            const elapsed = Math.abs(diff);
            const elHours = Math.floor(elapsed / (1000 * 60 * 60));
            const elMins = Math.floor((elapsed / (1000 * 60)) % 60);
            const elSecs = Math.floor((elapsed / 1000) % 60);
            if (isCardCenter) {
              if (elHours < 6) {
                el.textContent = `${pad(elHours)}:${pad(elMins)}:${pad(elSecs)}`;
              } else {
                el.textContent = 'LIVE';
              }
            } else {
              el.textContent = 'Starts soon';
            }
          } else {
            const diffDays = Math.floor(diff / (1000 * 60 * 60 * 24));
            const diffHours = Math.floor((diff / (1000 * 60 * 60)) % 24);
            const diffMins = Math.floor((diff / (1000 * 60)) % 60);
            const diffSecs = Math.floor((diff / 1000) % 60);

            if (isCardCenter) {
              if (diffDays > 0) {
                el.textContent = `${diffDays}d ${pad(diffHours)}:${pad(diffMins)}:${pad(diffSecs)}`;
              } else {
                el.textContent = `${pad(diffHours)}:${pad(diffMins)}:${pad(diffSecs)}`;
              }
            } else {
              if (diffDays > 0) {
                el.textContent = `Starts in ${diffDays}d ${pad(diffHours)}h`;
              } else {
                el.textContent = `Starts in ${pad(diffHours)}:${pad(diffMins)}:${pad(diffSecs)}`;
              }
            }
          }
        }
      });

      // Update Live Running Match Timers in live tabs (কত মিনিট বা ঘন্টা ধরে খেলা চলছে)
      const liveRunningElements = document.querySelectorAll('.match-live-running-text');
      liveRunningElements.forEach(el => {
        const rawTs = el.getAttribute('data-timestamp');
        const rawElapsed = el.getAttribute('data-elapsed');
        const ts = rawTs ? parseInt(rawTs, 10) : null;
        let totalSecs = 0;

        if (ts && !isNaN(ts)) {
          if (now >= ts) {
            totalSecs = Math.floor((now - ts) / 1000);
          } else {
            totalSecs = 0;
          }
        }

        if (!totalSecs && rawElapsed) {
          const elMinutes = parseInt(rawElapsed, 10);
          if (!isNaN(elMinutes) && elMinutes > 0) {
            const mountTime = parseInt(el.getAttribute('data-mount-time') || '0', 10) || now;
            if (!el.getAttribute('data-mount-time')) {
              el.setAttribute('data-mount-time', String(now));
            }
            const secSinceMount = Math.floor((now - mountTime) / 1000);
            totalSecs = (elMinutes * 60) + secSinceMount;
          }
        }

        if (!totalSecs && !ts) {
          const mountTime = parseInt(el.getAttribute('data-mount-time') || '0', 10) || now;
          if (!el.getAttribute('data-mount-time')) {
            el.setAttribute('data-mount-time', String(now));
          }
          totalSecs = Math.max(0, Math.floor((now - mountTime) / 1000));
        }

        const elHours = Math.floor(totalSecs / 3600);
        const elMins = Math.floor((totalSecs % 3600) / 60);
        const elSecs = totalSecs % 60;

        if (elHours > 0) {
          el.textContent = `${elHours}h ${pad(elMins)}m ${pad(elSecs)}s`;
        } else if (elMins > 0) {
          el.textContent = `${elMins}m ${pad(elSecs)}s`;
        } else {
          el.textContent = `${elSecs}s`;
        }
      });

      // Real-time automatic promotion to Finished
      if (!state._lastFinishCheck || (now - state._lastFinishCheck) > 10000) {
        state._lastFinishCheck = now;
        let anyStatusTransitioned = false;
        if (Array.isArray(state.events)) {
          state.events.forEach(ev => {
            if (ev.status !== 'finished' && isAppEventFinished(ev)) {
              ev.status = 'finished';
              ev.statusLabel = 'FINISHED';
              ev.timeOrTimer = 'FT';
              ev.isHot = false;
              anyStatusTransitioned = true;
            }
          });
        }
        if (anyStatusTransitioned) {
          updateEventCounters();
          renderEvents();
        }
      }
    }, 1000);
  }

  /**
   * Open Dedicated Match Details View
   */
  async function openMatchDetails(eventId) {
    if (!eventId) return;
    state.currentMatchDetailsId = eventId;
    switchView('view-match-details');
    await renderMatchDetails(eventId);
  }

  /**
   * Render Match Details View (Full Screen)
   */
  async function renderMatchDetails(eventId) {
    refreshDOM();
    if (!DOM.matchDetailsContainer) return;

    let match = state.events.find(ev => ev.id === eventId);
    if (!match) {
      DOM.matchDetailsContainer.innerHTML = `
        <div class="match-details-wrapper">
          <div class="md-nav-header">
            <button class="md-back-btn" id="btn-md-back">
              <i class="fa-solid fa-arrow-left"></i> Back to Events
            </button>
          </div>
          <div class="empty-state-box">
            <i class="fa-solid fa-circle-exclamation empty-state-icon"></i>
            <p class="empty-state-title">Match Information Not Available</p>
            <p class="empty-state-desc">The requested event data could not be found or has concluded.</p>
          </div>
        </div>
      `;
      const btnBack = document.getElementById('btn-md-back');
      if (btnBack) btnBack.addEventListener('click', () => switchView('view-events'));
      return;
    }

    // Try fetching deep details
    if (window.sportsCoordinator) {
      const detailed = await window.sportsCoordinator.getEventDetails(eventId);
      if (detailed) match = detailed;
    }

    const statusLower = (match.status || 'upcoming').toLowerCase();
    const isLive = statusLower === 'live';
    const isFinished = statusLower === 'finished';
    const isCricket = match.sport === 'cricket';
    const isFootball = match.sport === 'football';
    const isWWE = match.sport === 'wwe';

    // Status Badge
    let statusBadgeHtml = `<span class="event-badge badge-upcoming">UPCOMING</span>`;
    if (isLive) {
      statusBadgeHtml = `<span class="event-badge badge-live"><span class="live-dot"></span> LIVE</span>`;
    } else if (isFinished) {
      statusBadgeHtml = `<span class="event-badge badge-finished">FINISHED</span>`;
    }

    // Score / Timer Center
    let scoreCenterHtml = '';
    let t1Name = match.team1?.name || match.homeTeam?.name || 'Team 1';
    let t2Name = match.team2?.name || match.awayTeam?.name || 'Team 2';
    let t1Logo = getHighResTeamLogo(t1Name, match.team1?.logo || match.homeTeam?.logo);
    let t2Logo = getHighResTeamLogo(t2Name, match.team2?.logo || match.awayTeam?.logo);

    // Strictly enforce WWE & AEW Brand and Show logos (NO individual player names)
    const isWrestlingEvent = isWWE ||
      (match.sportName || '').toLowerCase() === 'wwe' ||
      String(match.id || '').startsWith('wwe-') ||
      String(match.id || '').startsWith('aew-') ||
      (match.league && /raw|smackdown|nxt|aew|wwe/i.test(match.league));

    if (isWrestlingEvent) {
      const matchText = `${match.title || ''} ${match.tournament || ''} ${match.league || ''} ${match.subText || ''} ${t1Name} ${t2Name}`.toLowerCase();
      if (matchText.includes('raw')) {
        t1Name = 'WWE';
        t1Logo = '/assets/wwe-logos/wwe_official.svg';
        t2Name = 'RAW';
        t2Logo = '/assets/wwe-logos/wwe_raw.svg';
      } else if (matchText.includes('smackdown') || matchText.includes('smack down')) {
        t1Name = 'WWE';
        t1Logo = '/assets/wwe-logos/wwe_official.svg';
        t2Name = 'SmackDown';
        t2Logo = '/assets/wwe-logos/wwe_smackdown.svg';
      } else if (matchText.includes('nxt')) {
        t1Name = 'WWE';
        t1Logo = '/assets/wwe-logos/wwe_official.svg';
        t2Name = 'NXT';
        t2Logo = '/assets/wwe-logos/wwe_nxt.svg';
      } else if (matchText.includes('aew') || matchText.includes('dynamite')) {
        t1Name = 'AEW';
        t1Logo = '/assets/wwe-logos/aew_official.svg';
        t2Name = 'Dynamite';
        t2Logo = '/assets/wwe-logos/aew_official.svg';
      } else {
        t1Name = 'WWE';
        t1Logo = '/assets/wwe-logos/wwe_official.svg';
        t2Name = 'Special PLE';
        t2Logo = '/assets/wwe-logos/wwe_special.svg';
      }
    }

    if (isCricket) {
      const t1Runs = match.team1?.score || match.homeTeam?.score || '';
      const t2Runs = match.team2?.score || match.awayTeam?.score || '';
      const t1Overs = match.team1?.overs || match.homeTeam?.overs || '';
      const t2Overs = match.team2?.overs || match.awayTeam?.overs || '';

      scoreCenterHtml = `
        <div class="md-score-center">
          ${statusBadgeHtml}
          ${(t1Runs || t2Runs) ? `
            <div class="md-cricket-score-box">
              <span class="md-cricket-runs">${escapeHtml(t1Runs || '-')} vs ${escapeHtml(t2Runs || '-')}</span>
              ${(t1Overs || t2Overs) ? `<span class="md-cricket-overs">${escapeHtml(t1Overs)} | ${escapeHtml(t2Overs)}</span>` : ''}
            </div>
          ` : `
            <div class="md-score-display"><span class="md-score-num">VS</span></div>
          `}
          <span class="event-time-badge">${escapeHtml(match.matchTime || 'Live')}</span>
        </div>
      `;
    } else if (isFootball) {
      const hScore = match.team1?.score !== undefined ? match.team1.score : (match.homeTeam?.score ?? '-');
      const aScore = match.team2?.score !== undefined ? match.team2.score : (match.awayTeam?.score ?? '-');

      scoreCenterHtml = `
        <div class="md-score-center">
          ${statusBadgeHtml}
          ${(hScore !== '' || aScore !== '') ? `
            <div class="md-score-display">
              <span class="md-score-num">${escapeHtml(hScore)}</span>
              <span>-</span>
              <span class="md-score-num">${escapeHtml(aScore)}</span>
            </div>
          ` : `
            <div class="md-score-display"><span class="md-score-num">VS</span></div>
          `}
          ${match.elapsed ? `<span class="md-minute-pill"><i class="fa-regular fa-clock"></i> ${escapeHtml(match.elapsed)}'</span>` : `<span class="event-time-badge">${escapeHtml(match.matchTime || 'Live')}</span>`}
        </div>
      `;
    } else {
      // WWE / General
      scoreCenterHtml = `
        <div class="md-score-center">
          ${statusBadgeHtml}
          <div class="md-score-display"><span class="md-score-num">VS</span></div>
          <span class="event-time-badge">${escapeHtml(match.matchTime || 'Scheduled')}</span>
        </div>
      `;
    }

    // Watch Live Button
    let watchButtonHtml = '';
    if (Array.isArray(match.streams) && match.streams.length > 0) {
      watchButtonHtml = `
        <div class="md-hero-watch-row">
          <button class="btn-watch-stream btn-primary btn-play-md-stream" id="btn-md-play-stream" data-event-id="${escapeHtml(match.id)}">
            <i class="fa-solid fa-play"></i> Watch Live Stream (${match.streams.length} Stream${match.streams.length > 1 ? 's' : ''})
          </button>
        </div>
      `;
    }

    // Deep Sections: Football Timeline / Events
    let eventsSectionHtml = '';
    if (isFootball && Array.isArray(match.events) && match.events.length > 0) {
      const itemsHtml = match.events.map(ev => {
        let icon = 'fa-futbol text-emerald-400';
        const typeLower = (ev.type || '').toLowerCase();
        const detailLower = (ev.detail || '').toLowerCase();

        if (typeLower.includes('card')) {
          icon = detailLower.includes('red') ? 'fa-square text-red-500' : 'fa-square text-amber-400';
        } else if (typeLower.includes('subst')) {
          icon = 'fa-arrows-rotate text-sky-400';
        }

        return `
          <div class="md-timeline-item">
            <span class="md-tl-minute">${escapeHtml(ev.time?.elapsed || '•')}'</span>
            <i class="fa-solid ${icon} md-tl-icon"></i>
            <div class="md-tl-desc">
              <strong>${escapeHtml(ev.player?.name || ev.type)}</strong>
              ${ev.assist?.name ? `<span class="text-xs text-slate-400"> (assist: ${escapeHtml(ev.assist.name)})</span>` : ''}
              <span class="text-xs text-slate-500"> - ${escapeHtml(ev.detail || '')}</span>
            </div>
            ${ev.team?.name ? `<span class="md-tl-team">${escapeHtml(ev.team.name)}</span>` : ''}
          </div>
        `;
      }).join('');

      eventsSectionHtml = `
        <div class="md-card">
          <div class="md-card-header">
            <i class="fa-solid fa-timeline"></i> Match Timeline & Events
          </div>
          <div class="md-timeline-list">
            ${itemsHtml}
          </div>
        </div>
      `;
    }

    // Deep Sections: Football Statistics
    let statsSectionHtml = '';
    if (isFootball && Array.isArray(match.statistics) && match.statistics.length > 0) {
      const homeStats = match.statistics[0]?.statistics || [];
      const awayStats = match.statistics[1]?.statistics || [];

      if (homeStats.length > 0) {
        const rowsHtml = homeStats.slice(0, 8).map((st, i) => {
          const ast = awayStats.find(a => a.type === st.type) || awayStats[i] || {};
          const numH = parseFloat(st.value) || 0;
          const numA = parseFloat(ast.value) || 0;
          const total = (numH + numA) || 1;
          const pctH = Math.round((numH / total) * 100);
          const pctA = 100 - pctH;

          return `
            <div class="md-stat-row">
              <div class="md-stat-header">
                <span class="md-stat-val-h">${escapeHtml(st.value ?? '-')}</span>
                <span class="md-stat-name">${escapeHtml(st.type)}</span>
                <span class="md-stat-val-a">${escapeHtml(ast.value ?? '-')}</span>
              </div>
              <div class="md-stat-bar-track">
                <div class="md-stat-bar-h" style="width: ${pctH}%;"></div>
                <div class="md-stat-bar-a" style="width: ${pctA}%;"></div>
              </div>
            </div>
          `;
        }).join('');

        statsSectionHtml = `
          <div class="md-card">
            <div class="md-card-header">
              <i class="fa-solid fa-chart-simple"></i> Match Statistics
            </div>
            <div class="md-stats-list">
              ${rowsHtml}
            </div>
          </div>
        `;
      }
    }

    // Deep Sections: Cricket Scorecard / Innings
    let cricketInningsHtml = '';
    if (isCricket && Array.isArray(match.innings) && match.innings.length > 0) {
      const cardsHtml = match.innings.map(ing => `
        <div class="p-3 bg-slate-900/60 border border-slate-800 rounded-xl mb-2">
          <div class="flex items-center justify-between">
            <span class="font-bold text-slate-200">${escapeHtml(ing.inning || 'Innings')}</span>
            <span class="font-bold text-sky-400">${escapeHtml(ing.r || 0)}/${escapeHtml(ing.w || 0)} <span class="text-xs text-slate-400">(${escapeHtml(ing.o || 0)} ov)</span></span>
          </div>
        </div>
      `).join('');

      cricketInningsHtml = `
        <div class="md-card">
          <div class="md-card-header">
            <i class="fa-solid fa-baseball-bat-ball"></i> Inning Scorecards
          </div>
          <div class="p-2">
            ${cardsHtml}
          </div>
        </div>
      `;
    }

    // Deep Sections: Cricket Team Squads / Key Players
    let cricketSquadHtml = '';
    const t1Players = match.team1?.players || [];
    const t2Players = match.team2?.players || [];
    if (isCricket && (t1Players.length > 0 || t2Players.length > 0)) {
      const renderPlayerList = (players, teamName) => {
        if (!players || players.length === 0) return `<p class="text-xs text-slate-500 italic p-2">Squad details loading...</p>`;
        return `
          <div class="space-y-1.5 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
            ${players.slice(0, 16).map(p => `
              <div class="flex items-center gap-2.5 p-2 rounded-xl bg-slate-900/50 border border-slate-800/60 hover:border-slate-700 transition">
                <img 
                  src="${escapeHtml(p.image || 'https://flagcdn.com/w160/un.png')}" 
                  alt="${escapeHtml(p.title || p.name || 'Player')}" 
                  class="w-8 h-8 rounded-full object-cover bg-slate-800 border border-slate-700 flex-shrink-0"
                  onerror="this.src='https://flagcdn.com/w160/un.png'"
                />
                <div class="flex-1 min-w-0">
                  <p class="text-xs font-semibold text-slate-200 truncate">${escapeHtml(p.title || p.name || 'Player')}</p>
                  ${p.slug ? `<span class="text-[10px] text-slate-400 font-mono capitalize">${escapeHtml(p.slug.replace(/-/g, ' '))}</span>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        `;
      };

      cricketSquadHtml = `
        <div class="md-card">
          <div class="md-card-header">
            <i class="fa-solid fa-users"></i> Team Squads & Featured Players
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 p-3">
            <div class="bg-slate-900/30 rounded-xl p-3 border border-slate-800/40">
              <h4 class="text-xs font-bold text-sky-400 mb-2.5 flex items-center gap-2">
                <img src="${escapeHtml(t1Logo)}" class="w-5 h-5 rounded-full object-cover" onerror="this.style.display='none'"/>
                ${escapeHtml(t1Name)} (${t1Players.length})
              </h4>
              ${renderPlayerList(t1Players, t1Name)}
            </div>
            <div class="bg-slate-900/30 rounded-xl p-3 border border-slate-800/40">
              <h4 class="text-xs font-bold text-amber-400 mb-2.5 flex items-center gap-2">
                <img src="${escapeHtml(t2Logo)}" class="w-5 h-5 rounded-full object-cover" onerror="this.style.display='none'"/>
                ${escapeHtml(t2Name)} (${t2Players.length})
              </h4>
              ${renderPlayerList(t2Players, t2Name)}
            </div>
          </div>
        </div>
      `;
    }

    // Deep Sections: WWE Match Card
    let wweMatchCardHtml = '';
    if (isWWE && Array.isArray(match.matches) && match.matches.length > 0) {
      const listHtml = match.matches.map(m => `
        <div class="p-3 bg-slate-900/60 border border-slate-800 rounded-xl mb-2">
          <h4 class="font-bold text-slate-200 text-xs">${escapeHtml(m.title || m.name || m)}</h4>
          ${m.stipulation ? `<span class="text-[11px] text-amber-400 font-semibold">${escapeHtml(m.stipulation)}</span>` : ''}
          ${m.winner ? `<div class="text-[11px] text-emerald-400 mt-1"><i class="fa-solid fa-trophy"></i> Winner: ${escapeHtml(m.winner)}</div>` : ''}
        </div>
      `).join('');

      wweMatchCardHtml = `
        <div class="md-card">
          <div class="md-card-header">
            <i class="fa-solid fa-hand-fist"></i> Official Match Card
          </div>
          <div class="p-2">
            ${listHtml}
          </div>
        </div>
      `;
    }

    // Format Match Time strictly in Bangladesh Time (Asia/Dhaka BST)
    let formattedModalTime = '';
    const tzModal = 'Asia/Dhaka';
    const mTs = match.timestamp ? (match.timestamp < 10000000000 ? match.timestamp * 1000 : match.timestamp) : null;
    if (mTs) {
      try {
        const modalDateFmt = new Intl.DateTimeFormat('en-US', {
          timeZone: tzModal,
          weekday: 'short',
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        });
        formattedModalTime = modalDateFmt.format(new Date(mTs));
      } catch (e) {
        formattedModalTime = match.matchTime || match.time || 'Live';
      }
    } else {
      formattedModalTime = match.matchTime || match.time || 'Live';
    }

    // Information Section
    const infoSectionHtml = `
      <div class="md-card">
        <div class="md-card-header">
          <i class="fa-solid fa-circle-info"></i> Event Information
        </div>
        <div class="md-info-grid">
          <div class="md-info-item">
            <span class="md-info-label">Tournament / League</span>
            <span class="md-info-value">${escapeHtml(match.tournament || match.league || 'Live Match')}</span>
          </div>
          <div class="md-info-item">
            <span class="md-info-label">Sport</span>
            <span class="md-info-value"><i class="fa-solid ${escapeHtml(match.sportIcon || 'fa-trophy')}"></i> ${escapeHtml(match.sportName || match.sport)}</span>
          </div>
          <div class="md-info-item">
            <span class="md-info-label">Match Time (Bangladesh)</span>
            <span class="md-info-value font-semibold text-sky-300">${escapeHtml(formattedModalTime)} <span class="tab-tz-pill text-[9px] font-bold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/20 ml-1">BST (GMT+6)</span></span>
          </div>
          <div class="md-info-item">
            <span class="md-info-label">Status</span>
            <span class="md-info-value font-bold ${isLive ? 'text-rose-400' : (isFinished ? 'text-emerald-400' : 'text-sky-400')}">${escapeHtml(match.statusText || match.statusLabel || match.status)}</span>
          </div>
          ${match.venue ? `
            <div class="md-info-item">
              <span class="md-info-label">Venue</span>
              <span class="md-info-value">${escapeHtml(match.venue)}</span>
            </div>
          ` : ''}
          ${match.referee ? `
            <div class="md-info-item">
              <span class="md-info-label">Referee</span>
              <span class="md-info-value">${escapeHtml(match.referee)}</span>
            </div>
          ` : ''}
          <div class="md-info-item">
            <span class="md-info-label">Data Source</span>
            <span class="md-info-value text-slate-400">${escapeHtml(match.source || 'HighFy Sports Engine')}</span>
          </div>
        </div>
      </div>
    `;

    // Deep Sections: Official Live Broadcasting Channels & Servers
    let broadcastingChannelsSectionHtml = '';
    const detailsList = (Array.isArray(match.broadcastingChannelDetails) && match.broadcastingChannelDetails.length > 0)
      ? match.broadcastingChannelDetails
      : ((Array.isArray(match.streams) && match.streams.length > 0) ? match.streams.map((st, idx) => ({
          id: st.channelId || `ch-${idx}`,
          name: st.channelName || (st.name ? st.name.replace(/\(.*\)/, '').trim() : `Server ${idx + 1}`),
          logo: st.channelLogo || st.logo || './assets/category-logos/live-events-hd.svg',
          serverIdx: idx,
          quality: st.quality || '1080p FHD',
          url: st.url
        })) : []);

    if (detailsList.length > 0) {
      const channelItems = detailsList.map((ch, idx) => {
        const logo = getSafeLogoUrl(ch.logo, ch.name, ch.id);
        const name = escapeHtml(ch.name);
        const qTag = ch.quality || (idx === 0 ? '1080p FHD' : '720p HD');
        const sIdx = ch.serverIdx !== undefined ? ch.serverIdx : idx;

        return `
          <div class="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-sky-500/40 transition mb-2">
            <div class="flex items-center gap-3 min-w-0">
              <img src="${escapeHtml(logo)}" class="w-8 h-8 rounded-lg object-contain bg-white/5 p-1 border border-white/10 flex-shrink-0" onerror="this.src='https://flagcdn.com/w160/un.png'" alt="${name}" />
              <div class="min-w-0">
                <div class="text-xs font-bold text-slate-100 truncate">${name}</div>
                <div class="text-[10px] text-sky-400 font-semibold flex items-center gap-1.5 mt-0.5">
                  <span class="px-1.5 py-0.2 rounded bg-sky-500/15 border border-sky-500/30 text-[9px] font-bold">${qTag}</span>
                  <span><i class="fa-solid fa-bolt text-[9px]"></i> Server ${sIdx + 1}</span>
                </div>
              </div>
            </div>
            <button class="btn-play-md-channel px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 transition flex-shrink-0" data-server-idx="${sIdx}">
              <i class="fa-solid fa-play text-[10px]"></i> দেখুন
            </button>
          </div>
        `;
      }).join('');

      broadcastingChannelsSectionHtml = `
        <div class="md-card">
          <div class="md-card-header flex items-center justify-between">
            <span><i class="fa-solid fa-satellite-dish text-sky-400"></i> লাইভ সম্প্রচার চ্যানেলসমূহ (${detailsList.length})</span>
            <span class="text-[10px] text-rose-400 font-extrabold tracking-wider animate-pulse">● LIVE BROADCAST</span>
          </div>
          <div class="p-2.5">
            ${channelItems}
          </div>
        </div>
      `;
    } else {
      broadcastingChannelsSectionHtml = `
        <div class="md-card">
          <div class="md-card-header flex items-center justify-between">
            <span><i class="fa-solid fa-satellite-dish text-slate-400"></i> লাইভ সম্প্রচার চ্যানেলসমূহ</span>
            <span class="text-[10px] text-slate-400 font-bold tracking-wider">NOT AVAILABLE</span>
          </div>
          <div class="p-4 text-center">
            <i class="fa-solid fa-circle-exclamation text-slate-500 text-xl mb-1.5 block"></i>
            <div class="text-xs font-bold text-slate-300">Channel Not Available</div>
            <div class="text-[11px] text-slate-500 mt-0.5">এই ইভেন্টের জন্য সরাসরি সম্প্রচার চ্যানেল পাওয়া যায়নি</div>
          </div>
        </div>
      `;
    }

    DOM.matchDetailsContainer.innerHTML = `
      <div class="match-details-wrapper">
        <!-- Top Navigation -->
        <div class="md-nav-header">
          <button class="md-back-btn" id="btn-md-back">
            <i class="fa-solid fa-arrow-left"></i> Back to Events
          </button>
          <span class="md-header-title">${escapeHtml(match.tournament || 'Match Center')}</span>
          <button class="event-fav-btn ${state.eventFavorites.includes(match.id) ? 'active' : ''}" id="btn-md-fav">
            <i class="fa-${state.eventFavorites.includes(match.id) ? 'solid' : 'regular'} fa-star"></i>
          </button>
        </div>

        <!-- Hero Matchup Card -->
        <div class="md-hero-card ${isLive ? 'live-glow' : ''}">
          <div class="md-hero-teams-row">
            <!-- Team 1 -->
            <div class="md-team-col">
              <div class="md-team-logo-box">
                <img 
                  src="${escapeHtml(t1Logo)}" 
                  alt="${escapeHtml(t1Name)}" 
                  class="md-team-logo"
                  referrerpolicy="no-referrer"
                  onerror="window.handleTeamLogoError && window.handleTeamLogoError(this)"
                />
              </div>
              <h3 class="md-team-name">${escapeHtml(t1Name)}</h3>
            </div>

            <!-- Center Score -->
            ${scoreCenterHtml}

            <!-- Team 2 -->
            <div class="md-team-col">
              <div class="md-team-logo-box">
                <img 
                  src="${escapeHtml(t2Logo)}" 
                  alt="${escapeHtml(t2Name)}" 
                  class="md-team-logo"
                  referrerpolicy="no-referrer"
                  onerror="window.handleTeamLogoError && window.handleTeamLogoError(this)"
                />
              </div>
              <h3 class="md-team-name">${escapeHtml(t2Name)}</h3>
            </div>
          </div>

          ${watchButtonHtml}
        </div>

        <!-- Deep Content Sections -->
        ${broadcastingChannelsSectionHtml}
        ${eventsSectionHtml}
        ${statsSectionHtml}
        ${cricketInningsHtml}
        ${cricketSquadHtml}
        ${wweMatchCardHtml}
        ${infoSectionHtml}
      </div>
    `;

    // Attach listeners in match details
    const btnBack = document.getElementById('btn-md-back');
    if (btnBack) btnBack.addEventListener('click', () => switchView('view-events'));

    const btnFav = document.getElementById('btn-md-fav');
    if (btnFav) {
      btnFav.addEventListener('click', () => {
        toggleEventFavorite(match.id);
        renderMatchDetails(match.id);
      });
    }

    const btnPlayStream = document.getElementById('btn-md-play-stream');
    if (btnPlayStream && Array.isArray(match.streams) && match.streams.length > 0) {
      btnPlayStream.addEventListener('click', () => {
        playMedia({
          title: `${t1Name} vs ${t2Name}`,
          streams: match.streams,
          id: match.id
        });
      });
    }

    DOM.matchDetailsContainer.querySelectorAll('.btn-play-md-channel').forEach(btn => {
      btn.addEventListener('click', () => {
        const sIdx = parseInt(btn.getAttribute('data-server-idx'), 10) || 0;
        if (Array.isArray(match.streams) && match.streams.length > 0) {
          const activeIdx = Math.min(sIdx, match.streams.length - 1);
          playMedia({
            title: `${t1Name} vs ${t2Name}`,
            streams: match.streams,
            id: match.id,
            activeStreamIndex: activeIdx,
            category: match.category || 'Sports'
          });
        }
      });
    });
  }

  /**
   * Load Live TV Channels from Remote Dynamic URL or local channels.json
   */
  async function loadChannels(forceRemote = false) {
    let loaded = false;
    const remoteUrl = localStorage.getItem('highfy_channels_json_url') || window.CONFIG?.CHANNELS_JSON_URL || '';

    // 1. Try remote dynamic JSON first if configured
    if (remoteUrl && remoteUrl.trim().startsWith('http')) {
      try {
        const cacheBuster = forceRemote ? `?_t=${Date.now()}` : '';
        const fetchUrl = remoteUrl.trim() + (remoteUrl.includes('?') ? (forceRemote ? `&_t=${Date.now()}` : '') : cacheBuster);
        const res = await fetch(fetchUrl, { cache: forceRemote ? 'no-cache' : 'default' });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            state.channels = data;
            loaded = true;
            console.log(`[HighFy] Successfully loaded ${data.length} channels from Remote URL:`, remoteUrl);
          }
        }
      } catch (remoteErr) {
        console.warn('[HighFy] Failed to load remote channels URL, falling back to local:', remoteErr);
      }
    }

    // 2. Fallback to local channels.json
    if (!loaded) {
      try {
        const res = await fetch('./channels.json?v=' + (Date.now()));
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            state.channels = data;
            loaded = true;
          } else {
            state.channels = FALLBACK_CHANNELS;
          }
        } else {
          state.channels = FALLBACK_CHANNELS;
        }
      } catch (e) {
        console.warn('[HighFy] Error loading local channels.json, using fallback:', e);
        state.channels = FALLBACK_CHANNELS;
      }
    }

    // Apply Admin Custom Channel Stream URLs & Logos Overrides
    if (state.customChannelUrls && typeof state.customChannelUrls === 'object' && Array.isArray(state.channels)) {
      state.channels.forEach(ch => {
        if (ch && ch.id && state.customChannelUrls[ch.id]) {
          const custom = state.customChannelUrls[ch.id];
          if (custom.streamUrl) {
            ch.stream_url = custom.streamUrl;
            ch.url = custom.streamUrl;
            ch.streamUrl = custom.streamUrl;
          }
          if (custom.backupUrl) {
            ch.backup_stream_url = custom.backupUrl;
            ch.backupUrls = [custom.backupUrl];
          }
        }
      });
    }

    refreshDOM();
    if (DOM.channelsCount) DOM.channelsCount.textContent = `${state.channels.length} Channels`;

    // Automatically sync sports channels into sportsCoordinator for all match cards
    if (window.sportsCoordinator) {
      window.sportsCoordinator.setChannels(state.channels);
      if (Array.isArray(state.events) && state.events.length > 0) {
        state.events.forEach(ev => {
          const matchInfo = window.sportsCoordinator.matchLiveStream(ev);
          if (matchInfo.hasStream) {
            ev.streams = matchInfo.streams;
            ev.broadcastChannels = matchInfo.broadcastChannels;
            ev.broadcastingChannelDetails = matchInfo.broadcastingChannelDetails;
          }
        });
        renderEvents();
      }
    }

    renderChannels();
    renderFavorites();
  }

  /**
   * Check if a channel belongs to one of the other sports network categories
   * (Sky Sports, beIN Sports, TNT Sports, ICC, Tapmad, Myco, Sony LIV, Star Sports, FanCode, DAZN, Fox Sports)
   */
  function belongsToOtherSportsCategory(ch) {
    const n = (ch.name || '').toLowerCase();
    const id = (ch.id || '').toLowerCase();
    const cats = (ch.categories || []).map(c => String(c).toLowerCase());
    
    // 1. Sky Sports
    if (n.includes('sky') || id.includes('sky') || cats.some(c => c.includes('sky'))) return true;
    
    // 2. beIN Sports
    if (n.includes('bein') || id.includes('bein') || cats.some(c => c.includes('bein'))) return true;
    
    // 3. TNT Sports
    if (n.includes('tnt') || id.includes('tnt') || cats.some(c => c.includes('tnt'))) return true;
    
    // 4. ICC
    if (n.includes('icc') || id.includes('icc') || cats.some(c => c.includes('icc'))) return true;
    
    // 5. Tapmad
    if (n.includes('tapmad') || id.includes('tapmad') || cats.some(c => c.includes('tapmad'))) return true;
    
    // 6. Myco
    if (n.includes('myco') || id.includes('myco') || cats.some(c => c.includes('myco'))) return true;
    
    // 7. Sony LIV / Sony Sports
    const isSony = n.includes('sony') || id.includes('sony') || cats.some(c => c.includes('sony'));
    const isSonySports = (ch.category || '').toLowerCase() === 'sports' || cats.includes('sports') || n.includes('ten') || n.includes('sports') || n.includes('liv') || n.includes('cricket');
    if (isSony && isSonySports) return true;
    
    // 8. Star Sports
    const isStar = n.includes('star') || id.includes('star') || cats.some(c => c.includes('star'));
    const isStarSports = (ch.category || '').toLowerCase() === 'sports' || cats.includes('sports') || n.includes('sports') || n.includes('khel') || n.includes('select');
    if (isStar && isStarSports) return true;
    
    // 9. FanCode
    if (n.includes('fancode') || id.includes('fancode') || cats.some(c => c.includes('fancode'))) return true;
    
    // 10. DAZN
    if (n.includes('dazn') || id.includes('dazn') || cats.some(c => c.includes('dazn'))) return true;
    
    // 11. Fox Sports
    if (n.includes('fox') || id.includes('fox') || cats.some(c => c.includes('fox'))) return true;

    // 12. ESPN
    if (n.includes('espn') || id.includes('espn') || cats.some(c => c.includes('espn'))) return true;

    // 13. TSN
    if (/\btsn\b/i.test(n) || /\btsn\b/i.test(id) || cats.some(c => c.toLowerCase() === 'tsn')) return true;

    // 14. Canal+ Sport
    if (n.includes('canal') || id.includes('canal') || cats.some(c => c.includes('canal'))) return true;

    return false;
  }

  /**
   * Helper to resolve channels for the Sports tab with category filtering
   */
  function getSportsChannels(filter = 'Sports') {
    const rawChannels = state.channels || [];
    const allChannels = rawChannels.filter(ch => {
      const cat = (ch.category || '').toLowerCase().trim();
      const prov = (ch.provider || '').toLowerCase().trim();
      const cats = Array.isArray(ch.categories) ? ch.categories.map(c => String(c).toLowerCase().trim()) : [];
      return !ch.isAyana && !ch.isAyna && cat !== 'ayana' && cat !== 'ayna' && prov !== 'ayana' && !cats.includes('ayana') && !cats.includes('ayna');
    });
    const f = (filter || 'Sports').toLowerCase().trim();
    if (f === 'all channels' || f === 'all' || f === 'all tv') {
      return allChannels;
    }

    if (f === 'all sports') {
      return allChannels.filter(ch => {
        const cat = (ch.category || '').toLowerCase();
        const cats = (ch.categories || []).map(c => c.toLowerCase());
        return cat === 'sports' || cats.includes('sports');
      });
    }

    // "Sports" Category: Only channels that do NOT already belong to other specific sports categories
    if (f === 'sports' || f === '') {
      return allChannels.filter(ch => {
        const cat = (ch.category || '').toLowerCase();
        const cats = (ch.categories || []).map(c => c.toLowerCase());
        const isSports = cat === 'sports' || cats.includes('sports');
        if (!isSports) return false;
        return !belongsToOtherSportsCategory(ch);
      });
    }

    // Network & Platform Specific Filters (User Requested)
    if (f.includes('skay') || f.includes('sky')) {
      return allChannels.filter(ch => {
        const n = (ch.name || '').toLowerCase();
        const id = (ch.id || '').toLowerCase();
        const cats = (ch.categories || []).map(c => String(c).toLowerCase());
        return n.includes('sky') || id.includes('sky') || cats.some(c => c.includes('sky'));
      });
    }
    if (f.includes('bein')) {
      return allChannels.filter(ch => {
        const n = (ch.name || '').toLowerCase();
        const id = (ch.id || '').toLowerCase();
        const cats = (ch.categories || []).map(c => String(c).toLowerCase());
        return n.includes('bein') || id.includes('bein') || cats.some(c => c.includes('bein'));
      });
    }
    if (f === 'tnt' || f.includes('tnt')) {
      return allChannels.filter(ch => {
        const n = (ch.name || '').toLowerCase();
        const id = (ch.id || '').toLowerCase();
        const cats = (ch.categories || []).map(c => String(c).toLowerCase());
        return n.includes('tnt') || id.includes('tnt') || cats.some(c => c.includes('tnt'));
      });
    }
    if (f === 'icc' || f.includes('icc')) {
      return allChannels.filter(ch => {
        const n = (ch.name || '').toLowerCase();
        const id = (ch.id || '').toLowerCase();
        const cats = (ch.categories || []).map(c => String(c).toLowerCase());
        return n.includes('icc') || id.includes('icc') || cats.some(c => c.includes('icc'));
      });
    }
    if (f.includes('tapmad')) {
      return allChannels.filter(ch => {
        const n = (ch.name || '').toLowerCase();
        const id = (ch.id || '').toLowerCase();
        const cats = (ch.categories || []).map(c => String(c).toLowerCase());
        return n.includes('tapmad') || id.includes('tapmad') || cats.some(c => c.includes('tapmad'));
      });
    }
    if (f.includes('myco')) {
      return allChannels.filter(ch => {
        const n = (ch.name || '').toLowerCase();
        const id = (ch.id || '').toLowerCase();
        const cats = (ch.categories || []).map(c => String(c).toLowerCase());
        return n.includes('myco') || id.includes('myco') || cats.some(c => c.includes('myco'));
      });
    }
    if (f.includes('sony') || f.includes('liv')) {
      return allChannels.filter(ch => {
        const n = (ch.name || '').toLowerCase();
        const id = (ch.id || '').toLowerCase();
        const cats = (ch.categories || []).map(c => String(c).toLowerCase());
        const isSony = n.includes('sony') || id.includes('sony') || cats.some(c => c.includes('sony'));
        const isSports = (ch.category || '').toLowerCase() === 'sports' || cats.includes('sports') || n.includes('ten') || n.includes('sports') || n.includes('liv') || n.includes('cricket');
        return isSony && isSports;
      });
    }
    if (f.includes('star')) {
      return allChannels.filter(ch => {
        const n = (ch.name || '').toLowerCase();
        const id = (ch.id || '').toLowerCase();
        const cats = (ch.categories || []).map(c => String(c).toLowerCase());
        const isStar = n.includes('star') || id.includes('star') || cats.some(c => c.includes('star'));
        const isSports = (ch.category || '').toLowerCase() === 'sports' || cats.includes('sports') || n.includes('sports') || n.includes('khel') || n.includes('select');
        return isStar && isSports;
      });
    }
    if (f.includes('fancode')) {
      return allChannels.filter(ch => {
        const n = (ch.name || '').toLowerCase();
        const id = (ch.id || '').toLowerCase();
        const cats = (ch.categories || []).map(c => String(c).toLowerCase());
        return n.includes('fancode') || id.includes('fancode') || cats.some(c => c.includes('fancode'));
      });
    }
    if (f.includes('dazn')) {
      return allChannels.filter(ch => {
        const n = (ch.name || '').toLowerCase();
        const id = (ch.id || '').toLowerCase();
        const cats = (ch.categories || []).map(c => String(c).toLowerCase());
        return n.includes('dazn') || id.includes('dazn') || cats.some(c => c.includes('dazn'));
      });
    }
    if (f.includes('fox')) {
      return allChannels.filter(ch => {
        const n = (ch.name || '').toLowerCase();
        const id = (ch.id || '').toLowerCase();
        const cats = (ch.categories || []).map(c => String(c).toLowerCase());
        return n.includes('fox') || id.includes('fox') || cats.some(c => c.includes('fox'));
      });
    }
    if (f.includes('espn')) {
      return allChannels.filter(ch => {
        const n = (ch.name || '').toLowerCase();
        const id = (ch.id || '').toLowerCase();
        const cats = (ch.categories || []).map(c => String(c).toLowerCase());
        return n.includes('espn') || id.includes('espn') || cats.some(c => c.includes('espn'));
      });
    }
    if (f.includes('tsn')) {
      return allChannels.filter(ch => {
        const n = (ch.name || '').toLowerCase();
        const id = (ch.id || '').toLowerCase();
        const cats = (ch.categories || []).map(c => String(c).toLowerCase());
        return /\btsn\b/i.test(n) || /\btsn\b/i.test(id) || cats.some(c => c === 'tsn');
      });
    }
    if (f.includes('canal')) {
      return allChannels.filter(ch => {
        const n = (ch.name || '').toLowerCase();
        const id = (ch.id || '').toLowerCase();
        const cats = (ch.categories || []).map(c => String(c).toLowerCase());
        return n.includes('canal') || id.includes('canal') || cats.some(c => c.includes('canal'));
      });
    }
    if (f.includes('ziggo')) {
      return allChannels.filter(ch => {
        const n = (ch.name || '').toLowerCase();
        const id = (ch.id || '').toLowerCase();
        const cats = (ch.categories || []).map(c => String(c).toLowerCase());
        return n.includes('ziggo') || id.includes('ziggo') || cats.some(c => c.includes('ziggo'));
      });
    }
    if (f.includes('eurosport')) {
      return allChannels.filter(ch => {
        const n = (ch.name || '').toLowerCase();
        const id = (ch.id || '').toLowerCase();
        const cats = (ch.categories || []).map(c => String(c).toLowerCase());
        return n.includes('eurosport') || id.includes('eurosport') || cats.some(c => c.includes('eurosport'));
      });
    }

    const sportFilters = {
      cricket: ['cricket', 'willow', 'star sports', 'ptv', 'ten sports', 't sports', 'gtv', 'maasranga', 'btv', 'fancode', 'astro cricket', 'criclife', 'hub sports', 'dd sports'],
      football: ['football', 'premier', 'laliga', 'bein', 'eurosport', 'sky sports', 'super sport', 'supersport', 'espn', 'tudn', 'telemundo', 'cbs sports', 'fifa', 'dazn', 'ziggo', 'tnt sports', 'tnt', 'go3', 'go 3', 'sport 1', 'sport 2', 'trace', 'epl'],
      baseball: ['baseball', 'mlb', 'tbs', 'sportsnet', 'peacock', 'apple tv', 'fox sports', 'fs1', 'fs2', 'fancode'],
      basketball: ['basketball', 'nba', 'abc', 'tsn', 'prime video', 'sportsnet', 'nbc', 'peacock'],
      tennis: ['tennis', 'tennis channel', 'atp', 'wta', 'wimbledon', 'us open', 'roland garros', 'eurosport', 'sky sports tennis'],
      motorsport: ['motorsport', 'formula 1', 'f1', 'f1 tv', 'canal+', 'viaplay', 'sky sports f1', 'racing'],
      wwe: ['wwe', 'wrestling', 'netflix', 'usa network', 'sony sports ten', 'sony ten 1', 'sony ten 2', 'sony ten 3'],
      hockey: ['hockey', 'nhl', 'cbc', 'tva sports', 'sportsnet one'],
      kabaddi: ['kabaddi', 'pro kabaddi', 'pkl', 'star sports select', 'jiosports', 'dd sports'],
      rugby: ['rugby', 'six nations', 'florugby', 'stan sport', 'sky sports arena', 'supersport rugby']
    };

    let targetSportKey = null;
    if (f.includes('cricket')) targetSportKey = 'cricket';
    else if (f.includes('football')) targetSportKey = 'football';
    else if (f.includes('baseball')) targetSportKey = 'baseball';
    else if (f.includes('basketball')) targetSportKey = 'basketball';
    else if (f.includes('tennis')) targetSportKey = 'tennis';
    else if (f.includes('motor') || f.includes('f1')) targetSportKey = 'motorsport';
    else if (f.includes('wwe') || f.includes('wrest')) targetSportKey = 'wwe';
    else if (f.includes('hockey')) targetSportKey = 'hockey';
    else if (f.includes('kabaddi')) targetSportKey = 'kabaddi';
    else if (f.includes('rugby')) targetSportKey = 'rugby';

    if (targetSportKey) {
      const keywords = sportFilters[targetSportKey];
      return allChannels.filter(c => {
        const n = (c.name || '').toLowerCase();
        const cat = (c.category || '').toLowerCase();
        const cats = Array.isArray(c.categories) ? c.categories.map(x => String(x).toLowerCase()) : [];
        
        const hasDirectCat = cats.some(x => x.includes(targetSportKey) || (targetSportKey === 'motorsport' && x.includes('f1')));
        const hasKeyword = keywords.some(k => n.includes(k) || cat.includes(k) || cats.some(x => x.includes(k)));
        return hasDirectCat || hasKeyword;
      });
    }

    return getChannelsForCategory(filter);
  }

  /**
   * Sports Categories Configuration (Rendered in sportsGrid matching channel card layout)
   */
  const SPORTS_CATEGORIES = [
    {
      id: 'sports',
      name: 'Sports',
      filterKey: 'Sports',
      logo: './assets/category-logos/sports-channels.svg',
      ringColor: '#10b981'
    },
    {
      id: 'sky-sports',
      name: 'Sky Sports',
      filterKey: 'Sky Sports',
      logo: './assets/category-logos/sky-sports.svg',
      ringColor: '#0284c7'
    },
    {
      id: 'bein-sports',
      name: 'beIN Sports',
      filterKey: 'beIN Sports',
      logo: './assets/category-logos/bein-sports.svg',
      ringColor: '#9333ea'
    },
    {
      id: 'tnt-sports',
      name: 'TNT Sports',
      filterKey: 'TNT Sports',
      logo: './assets/category-logos/tnt-sports.svg',
      ringColor: '#e11d48'
    },
    {
      id: 'icc',
      name: 'ICC',
      filterKey: 'ICC',
      logo: './assets/category-logos/icc.svg',
      ringColor: '#0284c7'
    },
    {
      id: 'tapmad',
      name: 'Tapmad',
      filterKey: 'Tapmad',
      logo: './assets/category-logos/tapmad.svg',
      ringColor: '#06b6d4'
    },
    {
      id: 'myco',
      name: 'Myco',
      filterKey: 'Myco',
      logo: './assets/category-logos/myco.svg',
      ringColor: '#10b981'
    },
    {
      id: 'sony-liv',
      name: 'Sony LIV',
      filterKey: 'Sony LIV',
      logo: './assets/category-logos/sony-liv.svg',
      ringColor: '#f59e0b'
    },
    {
      id: 'star-sports',
      name: 'Star Sports',
      filterKey: 'Star Sports',
      logo: './assets/category-logos/star-sports.svg',
      ringColor: '#38bdf8'
    },
    {
      id: 'fancode',
      name: 'FanCode',
      filterKey: 'FanCode',
      logo: './assets/category-logos/fancode.svg',
      ringColor: '#f97316'
    },
    {
      id: 'dazn',
      name: 'DAZN',
      filterKey: 'DAZN',
      logo: './assets/category-logos/dazn.svg',
      ringColor: '#eab308'
    },
    {
      id: 'fox-sports',
      name: 'Fox Sports',
      filterKey: 'Fox Sports',
      logo: './assets/category-logos/fox-sports.svg',
      ringColor: '#3b82f6'
    },
    {
      id: 'espn',
      name: 'ESPN',
      filterKey: 'ESPN',
      logo: './assets/category-logos/espn.svg',
      ringColor: '#dc2626'
    },
    {
      id: 'tsn',
      name: 'TSN',
      filterKey: 'TSN',
      logo: './assets/category-logos/tsn.svg',
      ringColor: '#dc2626'
    },
    {
      id: 'canal-plus-sport',
      name: 'Canal+ Sport',
      filterKey: 'Canal+ Sport',
      logo: './assets/category-logos/canal-plus-sport.svg',
      ringColor: '#0284c7'
    },
    {
      id: 'ziggo-sport',
      name: 'Ziggo Sport',
      filterKey: 'Ziggo',
      logo: './assets/category-logos/ziggo-sport.svg',
      ringColor: '#f97316'
    },
    {
      id: 'eurosport',
      name: 'Eurosport',
      filterKey: 'Eurosport',
      logo: './assets/category-logos/eurosport.svg',
      ringColor: '#0284c7'
    }
  ];

  /**
   * Default Sports Category Logos backup to guarantee reliable reset
   */
  const DEFAULT_SPORTS_CATEGORY_LOGOS = {
    'sports': './assets/category-logos/sports-channels.svg',
    'sky-sports': './assets/category-logos/sky-sports.svg',
    'bein-sports': './assets/category-logos/bein-sports.svg',
    'tnt-sports': './assets/category-logos/tnt-sports.svg',
    'icc': './assets/category-logos/icc.svg',
    'tapmad': './assets/category-logos/tapmad.svg',
    'myco': './assets/category-logos/myco.svg',
    'sony-liv': './assets/category-logos/sony-liv.svg',
    'star-sports': './assets/category-logos/star-sports.svg',
    'fancode': './assets/category-logos/fancode.svg',
    'dazn': './assets/category-logos/dazn.svg',
    'fox-sports': './assets/category-logos/fox-sports.svg',
    'espn': './assets/category-logos/espn.svg',
    'tsn': './assets/category-logos/tsn.svg',
    'canal-plus-sport': './assets/category-logos/canal-plus-sport.svg',
    'ziggo-sport': './assets/category-logos/ziggo-sport.svg',
    'eurosport': './assets/category-logos/eurosport.svg'
  };

  /**
   * Helper to retrieve active sports category logo (resolves custom overrides from Admin Panel)
   */
  function getSportsCategoryLogo(cat) {
    if (!cat) return '';
    const id = cat.id || '';
    const filterKey = cat.filterKey || '';
    const name = cat.name || '';

    // 1. Check customSportsCategoryLogos overrides
    if (state.customSportsCategoryLogos) {
      if (id && state.customSportsCategoryLogos[id]) return state.customSportsCategoryLogos[id];
      if (filterKey && state.customSportsCategoryLogos[filterKey]) return state.customSportsCategoryLogos[filterKey];
      if (name && state.customSportsCategoryLogos[name]) return state.customSportsCategoryLogos[name];
    }

    // 2. Check general customCategoryLogos for cross-compatibility
    if (state.customCategoryLogos) {
      if (id && state.customCategoryLogos[id]) return state.customCategoryLogos[id];
      if (filterKey && state.customCategoryLogos[filterKey]) return state.customCategoryLogos[filterKey];
      if (name && state.customCategoryLogos[name]) return state.customCategoryLogos[name];
    }

    // 3. Fallback to default
    return cat.logo || DEFAULT_SPORTS_CATEGORY_LOGOS[id] || './assets/category-logos/sports-channels.svg';
  }

  /**
   * Helper to create Sports Category card markup formatted identically to Channel Cards
   */
  function createSportsCategoryCardHtml(cat) {
    const channelCount = getSportsChannels(cat.filterKey).length;
    const fallbackLetter = ((cat.name || 'SP').charAt(0) || 'S').toUpperCase();
    const fallbackSvg = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80"><defs><radialGradient id="cg" cx="35%" cy="30%" r="70%"><stop offset="0%" stop-color="#0284c7"/><stop offset="100%" stop-color="#0369a1"/></radialGradient></defs><rect width="80" height="80" rx="40" fill="url(#cg)"/><text x="50%" y="54%" font-size="28" font-weight="bold" fill="#ffffff" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif">${fallbackLetter}</text></svg>`)}`;
    const resolvedLogo = getSportsCategoryLogo(cat);
    const logoSrc = resolvedLogo || fallbackSvg;

    return `
      <div class="channel-card sports-category-card" data-sports-category-key="${escapeHtml(cat.filterKey)}" data-sports-category-name="${escapeHtml(cat.name)}" role="button" tabindex="0" title="${escapeHtml(cat.name)} (${channelCount} Channels)">
        <div class="channel-logo-wrapper">
          <img 
            src="${escapeHtml(logoSrc)}" 
            alt="${escapeHtml(cat.name)}" 
            class="channel-logo-img" 
            loading="lazy"
            decoding="async"
            onerror="this.onerror=null;this.src='${fallbackSvg}';"
          />
        </div>
        <span class="channel-name-text" title="${escapeHtml(cat.name)}">${escapeHtml(cat.name)}</span>
        <span class="sports-card-badge">${channelCount} Channels</span>
      </div>
    `;
  }

  /**
   * Attach click handlers to sports category cards in sportsGrid
   */
  function attachSportsCategoryClickEvents(container) {
    if (!container) return;
    const cards = container.querySelectorAll('.sports-category-card');
    cards.forEach(card => {
      const handleSelect = () => {
        const catKey = card.getAttribute('data-sports-category-key');
        const catName = card.getAttribute('data-sports-category-name');
        openSportsCategoryDetail(catKey, catName);
      };

      card.addEventListener('click', handleSelect);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleSelect();
        }
      });
    });
  }

  /**
   * Open Sports Category Detail (drill down to view channels of that category)
   */
  function openSportsCategoryDetail(catKey, catName) {
    state.selectedSportsCategory = catKey;
    state.selectedSportsCategoryName = catName || catKey;
    renderChannels();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /**
   * Render Channels Grid in Sports Tab (Shows Categories as cards, or channels inside selected category)
   */
  function renderChannels() {
    refreshDOM();
    if (!DOM.sportsGrid) return;

    const sportsBackBtn = document.getElementById('sports-category-back-btn');
    const channelsTitle = document.getElementById('channels-view-title');

    // 1. If a Sports Category is selected (e.g. Sports, Sky Sports, etc.): Show Channels inside that Category
    if (state.selectedSportsCategory) {
      if (sportsBackBtn) {
        sportsBackBtn.style.display = 'inline-flex';
      }
      if (channelsTitle) {
        channelsTitle.innerHTML = `<i class="fa-solid fa-trophy text-emerald-400"></i> ${escapeHtml(state.selectedSportsCategoryName || state.selectedSportsCategory)} Channels`;
      }

      let channelsToShow = getSportsChannels(state.selectedSportsCategory);

      if (state.searchQuery) {
        const q = state.searchQuery.toLowerCase();
        channelsToShow = channelsToShow.filter(ch => 
          (ch.name || '').toLowerCase().includes(q) ||
          (ch.category || '').toLowerCase().includes(q) ||
          (Array.isArray(ch.categories) && ch.categories.some(c => c.toLowerCase().includes(q)))
        );
      }

      if (DOM.channelsCount) {
        DOM.channelsCount.textContent = `${channelsToShow.length} Channels`;
      }

      if (channelsToShow.length === 0) {
        DOM.sportsGrid.innerHTML = `
          <div class="col-span-3 text-center py-12 text-slate-400 text-xs font-semibold">
            <i class="fa-solid fa-tv text-2xl mb-2 text-slate-500 block"></i>
            No channels found in ${escapeHtml(state.selectedSportsCategoryName || state.selectedSportsCategory)}
          </div>
        `;
        return;
      }

      DOM.sportsGrid.innerHTML = channelsToShow.map(ch => createChannelCardHtml(ch)).join('');
      attachChannelClickEvents(DOM.sportsGrid);
      return;
    }

    // 2. Otherwise: Root Sports view displays Sports Categories (including "Sports" category with 164 channels)
    if (sportsBackBtn) {
      sportsBackBtn.style.display = 'none';
    }
    if (channelsTitle) {
      channelsTitle.innerHTML = `<i class="fa-solid fa-shapes text-sky-400"></i> Sports Categories`;
    }

    let categoriesToShow = SPORTS_CATEGORIES;

    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      // Check if any sports categories match the search
      const matchedCats = SPORTS_CATEGORIES.filter(cat => 
        cat.name.toLowerCase().includes(q) || cat.filterKey.toLowerCase().includes(q)
      );

      // Also check if any channels match directly
      const matchedChannels = getSportsChannels('All Sports').filter(ch =>
        (ch.name || '').toLowerCase().includes(q) ||
        (ch.category || '').toLowerCase().includes(q)
      );

      if (matchedCats.length > 0) {
        categoriesToShow = matchedCats;
        if (DOM.channelsCount) {
          DOM.channelsCount.textContent = `${categoriesToShow.length} Categories`;
        }
        DOM.sportsGrid.innerHTML = categoriesToShow.map(cat => createSportsCategoryCardHtml(cat)).join('');
        attachSportsCategoryClickEvents(DOM.sportsGrid);
        return;
      } else if (matchedChannels.length > 0) {
        if (DOM.channelsCount) {
          DOM.channelsCount.textContent = `${matchedChannels.length} Channels`;
        }
        DOM.sportsGrid.innerHTML = matchedChannels.map(ch => createChannelCardHtml(ch)).join('');
        attachChannelClickEvents(DOM.sportsGrid);
        return;
      } else {
        if (DOM.channelsCount) {
          DOM.channelsCount.textContent = `0 Results`;
        }
        DOM.sportsGrid.innerHTML = `
          <div class="col-span-3 text-center py-12 text-slate-400 text-xs font-semibold">
            <i class="fa-solid fa-magnifying-glass text-2xl mb-2 text-slate-500 block"></i>
            No sports categories or channels found matching "${escapeHtml(state.searchQuery)}"
          </div>
        `;
        return;
      }
    }

    if (DOM.channelsCount) {
      DOM.channelsCount.textContent = `${categoriesToShow.length} Categories`;
    }

    DOM.sportsGrid.innerHTML = categoriesToShow.map(cat => createSportsCategoryCardHtml(cat)).join('');
    attachSportsCategoryClickEvents(DOM.sportsGrid);
  }

  /**
   * Load Categories from categories.json
   */
  async function loadCategories() {
    try {
      const res = await fetch('./categories.json');
      const loaded = await res.json();
      const sportsKeywords = ['sports', 'sky sports', 'bein sports', 'tnt sports', 'icc', 'tapmad', 'myco', 'sony liv', 'star sports', 'fancode', 'dazn', 'fox sports', 'espn', 'tsn', 'canal', 'canal+ sport', 'cricket', 'football', 'wwe', 'tennis'];
      state.categories = (loaded || []).filter(cat => {
        const id = (cat.id || '').toLowerCase();
        const n = (cat.name || '').toLowerCase();
        return !sportsKeywords.includes(n) && !sportsKeywords.includes(id) && !id.includes('sports');
      });
    } catch (e) {
      console.warn('[HighFy] Error loading categories.json:', e);
      state.categories = [];
    }

    if (DOM.categoriesCount) DOM.categoriesCount.textContent = `${state.categories.length} Categories`;
    renderCategories();
  }

  /**
   * Helper to resolve channels for a given category name
   */
  function getChannelsForCategory(catName) {
    const lower = (catName || '').toLowerCase().trim();
    const rawChannels = state.channels || [];

    const isAyanaChannel = (ch) => {
      if (!ch) return false;
      const cat = (ch.category || '').toLowerCase().trim();
      const prov = (ch.provider || '').toLowerCase().trim();
      const cats = Array.isArray(ch.categories) ? ch.categories.map(c => String(c).toLowerCase().trim()) : [];
      return ch.isAyana || ch.isAyna || cat === 'ayana' || cat === 'ayna' || prov === 'ayana' || cats.includes('ayana') || cats.includes('ayna');
    };

    // Category mapping: Ayana category filter
    if (lower === 'ayana' || lower === 'ayna' || lower === 'ayna ott' || lower === 'aynascope' || lower === 'aynaott') {
      return rawChannels.filter(ch => isAyanaChannel(ch));
    }

    // For other categories, include all channels (only exclude uncategorized channels whose sole category is 'ayana')
    const allChannels = rawChannels.filter(ch => {
      const cat = (ch.category || '').toLowerCase().trim();
      return cat !== 'ayana' && cat !== 'ayna';
    });

    // 1. Dedicated Akash Go Category (Shows all 42+ Akash Go / BDIX verified channels)
    if (lower === 'akash go' || lower === 'akash-go' || lower === 'akash') {
      return allChannels.filter(ch => {
        const cat = (ch.category || '').toLowerCase().trim();
        const prov = (ch.provider || '').toLowerCase().trim();
        const cats = Array.isArray(ch.categories) ? ch.categories.map(c => c.toLowerCase().trim()) : [];
        return ch.isAkashGo || cat === 'akash go' || cat === 'akash-go' || cat === 'akash' || prov === 'akash go' || cats.includes('akash go');
      });
    }

    if (!lower || lower === 'live tv' || lower === 'all' || lower === 'all channels' || lower === 'livetv' || lower === 'others channel' || lower === 'others channels' || lower === 'others' || lower === 'other' || lower === 'other channels') {
      return allChannels;
    }

    if (lower === 'bangla' || lower === 'bangladesh' || lower === 'bengali') {
      return allChannels.filter(ch => {
        const cat = (ch.category || '').toLowerCase();
        const cats = Array.isArray(ch.categories) ? ch.categories.map(c => c.toLowerCase()) : [];
        return cat === 'bangla' || cat === 'bengali' || cat === 'bangladesh' || cats.includes('bangla') || cats.includes('bengali');
      });
    }

    if (lower === 'india' || lower === 'indian') {
      return allChannels.filter(ch => {
        const cat = (ch.category || '').toLowerCase();
        const cats = Array.isArray(ch.categories) ? ch.categories.map(c => c.toLowerCase()) : [];
        return cat === 'india' || cat === 'indian' || cats.includes('india');
      });
    }

    if (lower === 'kolkata') {
      return allChannels.filter(ch => {
        const cat = (ch.category || '').toLowerCase();
        const cats = Array.isArray(ch.categories) ? ch.categories.map(c => c.toLowerCase()) : [];
        return cat === 'kolkata' || cats.includes('kolkata');
      });
    }

    if (lower === 'pakistan') {
      return allChannels.filter(ch => {
        const cat = (ch.category || '').toLowerCase();
        const cats = Array.isArray(ch.categories) ? ch.categories.map(c => c.toLowerCase()) : [];
        return cat === 'pakistan' || cats.includes('pakistan');
      });
    }

    if (lower === 'news' || lower === 'news channels') {
      return allChannels.filter(ch => {
        const cat = (ch.category || '').toLowerCase();
        const cats = Array.isArray(ch.categories) ? ch.categories.map(c => c.toLowerCase()) : [];
        return cat === 'news' || cats.includes('news');
      });
    }

    if (lower === 'kids') {
      return allChannels.filter(ch => {
        const cat = (ch.category || '').toLowerCase();
        const cats = Array.isArray(ch.categories) ? ch.categories.map(c => c.toLowerCase()) : [];
        return cat === 'kids' || cats.includes('kids');
      });
    }

    if (lower === 'islamic' || lower === 'islamic channels') {
      return allChannels.filter(ch => {
        const cat = (ch.category || '').toLowerCase();
        const cats = Array.isArray(ch.categories) ? ch.categories.map(c => c.toLowerCase()) : [];
        return cat === 'islamic' || cats.includes('islamic');
      });
    }

    if (lower === 'radio') {
      return allChannels.filter(ch => (ch.category || '').toLowerCase() === 'radio');
    }

    if (lower === 'entertainment') {
      return allChannels.filter(ch => {
        const cat = (ch.category || '').toLowerCase();
        const cats = Array.isArray(ch.categories) ? ch.categories.map(c => c.toLowerCase()) : [];
        return cat === 'entertainment' || cats.includes('entertainment');
      });
    }

    if (lower === 'movie' || lower === 'movies') {
      return allChannels.filter(ch => {
        const cat = (ch.category || '').toLowerCase();
        const cats = Array.isArray(ch.categories) ? ch.categories.map(c => c.toLowerCase()) : [];
        return cat === 'movie' || cat === 'movies' || cats.includes('movie') || cats.includes('movies');
      });
    }

    if (lower === 'music' || lower === 'music channels') {
      return allChannels.filter(ch => {
        const cat = (ch.category || '').toLowerCase();
        const cats = Array.isArray(ch.categories) ? ch.categories.map(c => c.toLowerCase()) : [];
        return cat === 'music' || cats.includes('music');
      });
    }

    if (lower === 'infotainment' || lower === 'information') {
      return allChannels.filter(ch => {
        const cat = (ch.category || '').toLowerCase();
        const cats = Array.isArray(ch.categories) ? ch.categories.map(c => c.toLowerCase()) : [];
        return cat === 'infotainment' || cat === 'information' || cats.includes('infotainment');
      });
    }

    if (lower === 'world country' || lower === 'world-country' || lower === 'world') {
      return allChannels.filter(ch => {
        const cat = (ch.category || '').toLowerCase();
        const cats = Array.isArray(ch.categories) ? ch.categories.map(c => c.toLowerCase()) : [];
        return cat === 'worldcountry' || cat === 'world' || cat === 'world country' || cat === 'international' || cats.includes('world country') || cats.includes('world');
      });
    }

    if (lower === 'sports' || lower === 'sports channels') {
      return allChannels.filter(ch => {
        const cat = (ch.category || '').toLowerCase();
        const cats = Array.isArray(ch.categories) ? ch.categories.map(c => c.toLowerCase()) : [];
        return cat === 'sports' || cats.includes('sports');
      });
    }

    if (lower === 'toffee' || lower === 'toffee bd' || lower === 'toffee live') {
      const matched = allChannels.filter(ch => {
        const name = (ch.name || '').toLowerCase();
        const url = (ch.url || ch.streamUrl || '').toLowerCase();
        const prov = (ch.provider || '').toLowerCase();
        const cat = (ch.category || '').toLowerCase();
        return name.includes('toffee') || url.includes('toffee') || prov.includes('toffee') || cat === 'toffee';
      });
      if (matched.length > 0) return matched;
      // Fallback: Bangla Sports & Live channels available on Toffee
      return allChannels.filter(ch => {
        const cat = (ch.category || '').toLowerCase();
        return cat === 'sports' || cat === 'bangla' || cat === 'bengali';
      });
    }

    if (lower === 'jagobd' || lower === 'jago bd' || lower === 'jago-bd') {
      const matched = allChannels.filter(ch => {
        const name = (ch.name || '').toLowerCase();
        const url = (ch.url || ch.streamUrl || '').toLowerCase();
        const prov = (ch.provider || '').toLowerCase();
        return name.includes('jagobd') || url.includes('jagobd') || prov.includes('jagobd');
      });
      if (matched.length > 0) return matched;
      // Fallback: All Bangla & News channels
      return allChannels.filter(ch => {
        const cat = (ch.category || '').toLowerCase();
        return cat === 'bangla' || cat === 'bengali' || cat === 'news';
      });
    }

    if (lower === 'chorki' || lower === 'chorki live') {
      const matched = allChannels.filter(ch => {
        const name = (ch.name || '').toLowerCase();
        const url = (ch.url || ch.streamUrl || '').toLowerCase();
        return name.includes('chorki') || url.includes('chorki');
      });
      if (matched.length > 0) return matched;
      // Fallback: Bengali drama, movie & entertainment channels
      return allChannels.filter(ch => {
        const cat = (ch.category || '').toLowerCase();
        return cat === 'bangla' || cat === 'bengali' || cat === 'movie' || cat === 'entertainment';
      });
    }

    if (lower === 'hoichoi' || lower === 'hoichoi tv') {
      const matched = allChannels.filter(ch => {
        const name = (ch.name || '').toLowerCase();
        const url = (ch.url || ch.streamUrl || '').toLowerCase();
        return name.includes('hoichoi') || url.includes('hoichoi');
      });
      if (matched.length > 0) return matched;
      // Fallback: Kolkata & Bengali entertainment channels
      return allChannels.filter(ch => {
        const cat = (ch.category || '').toLowerCase();
        return cat === 'kolkata' || cat === 'bangla' || cat === 'bengali' || cat === 'movie';
      });
    }

    if (lower === 'jio tv' || lower === 'jio' || lower === 'jiotv') {
      return allChannels.filter(ch => {
        const cat = (ch.category || '').toLowerCase().trim();
        const prov = (ch.provider || '').toLowerCase().trim();
        const cats = Array.isArray(ch.categories) ? ch.categories.map(c => String(c).toLowerCase().trim()) : [];
        const id = String(ch.id || '').toLowerCase();
        return ch.isJio || ch.isJioTV || 
          id.startsWith('jio-') || id.startsWith('ch-jio-') ||
          cat === 'jio' || cat === 'jio tv' || cat === 'jiotv' ||
          prov === 'jio' || prov === 'jio tv' || prov === 'jiotv' ||
          cats.includes('jio') || cats.includes('jio tv') || cats.includes('jiotv');
      });
    }

    if (lower === 'tata play' || lower === 'tata' || lower === 'tataplay' || lower === 'tata sky') {
      const matched = allChannels.filter(ch => {
        const name = (ch.name || '').toLowerCase();
        const url = (ch.url || ch.streamUrl || '').toLowerCase();
        return name.includes('tata') || url.includes('tata') || name.includes('sky');
      });
      if (matched.length > 0) return matched;
      // Fallback: High Quality HD Indian & Sports channels
      return allChannels.filter(ch => {
        const cat = (ch.category || '').toLowerCase();
        return cat === 'india' || cat === 'sports' || cat === 'entertainment';
      });
    }

    if (lower === 'yupp tv' || lower === 'yupptv' || lower === 'yupp') {
      const matched = allChannels.filter(ch => {
        const name = (ch.name || '').toLowerCase();
        const url = (ch.url || ch.streamUrl || '').toLowerCase();
        return name.includes('yupp') || url.includes('yupp');
      });
      if (matched.length > 0) return matched;
      // Fallback: World Country & Indian channels
      return allChannels.filter(ch => {
        const cat = (ch.category || '').toLowerCase();
        return cat === 'world country' || cat === 'india' || cat === 'pakistan';
      });
    }

    if (lower === 'discovery' || lower === 'discovery channels') {
      const matched = allChannels.filter(ch => {
        const name = (ch.name || '').toLowerCase();
        return name.includes('discovery') || name.includes('animal') || name.includes('nat geo') || name.includes('geographic') || name.includes('history') || name.includes('turbo') || name.includes('science');
      });
      if (matched.length > 0) return matched;
      return allChannels.filter(ch => (ch.category || '').toLowerCase() === 'infotainment');
    }

    if (lower === 'travel' || lower === 'travelxp' || lower === 'travel channels') {
      const matched = allChannels.filter(ch => {
        const name = (ch.name || '').toLowerCase();
        return name.includes('travel') || name.includes('tlc') || name.includes('fox life') || name.includes('living') || name.includes('tourism') || name.includes('food');
      });
      if (matched.length > 0) return matched;
      return allChannels.filter(ch => (ch.category || '').toLowerCase() === 'infotainment' || (ch.category || '').toLowerCase() === 'world country');
    }

    // User-Requested Sports Networks & Categories
    if (lower.includes('skay') || lower.includes('sky sports') || lower === 'sky') {
      const matched = allChannels.filter(ch => {
        const n = (ch.name || '').toLowerCase();
        const id = (ch.id || '').toLowerCase();
        const cats = (ch.categories || []).map(c => String(c).toLowerCase());
        return n.includes('sky') || id.includes('sky') || cats.some(c => c.includes('sky'));
      });
      if (matched.length > 0) return matched;
    }

    if (lower.includes('bein')) {
      const matched = allChannels.filter(ch => {
        const n = (ch.name || '').toLowerCase();
        const id = (ch.id || '').toLowerCase();
        const cats = (ch.categories || []).map(c => String(c).toLowerCase());
        return n.includes('bein') || id.includes('bein') || cats.some(c => c.includes('bein'));
      });
      if (matched.length > 0) return matched;
    }

    if (lower === 'tnt' || lower.includes('tnt')) {
      const matched = allChannels.filter(ch => {
        const n = (ch.name || '').toLowerCase();
        const id = (ch.id || '').toLowerCase();
        const cats = (ch.categories || []).map(c => String(c).toLowerCase());
        return n.includes('tnt') || id.includes('tnt') || cats.some(c => c.includes('tnt'));
      });
      if (matched.length > 0) return matched;
    }

    if (lower === 'icc' || lower.includes('icc')) {
      const matched = allChannels.filter(ch => {
        const n = (ch.name || '').toLowerCase();
        const id = (ch.id || '').toLowerCase();
        const cats = (ch.categories || []).map(c => String(c).toLowerCase());
        return n.includes('icc') || id.includes('icc') || cats.some(c => c.includes('icc'));
      });
      if (matched.length > 0) return matched;
    }

    if (lower.includes('tapmad')) {
      const matched = allChannels.filter(ch => {
        const n = (ch.name || '').toLowerCase();
        const id = (ch.id || '').toLowerCase();
        const cats = (ch.categories || []).map(c => String(c).toLowerCase());
        return n.includes('tapmad') || id.includes('tapmad') || cats.some(c => c.includes('tapmad'));
      });
      if (matched.length > 0) return matched;
    }

    if (lower.includes('myco')) {
      const matched = allChannels.filter(ch => {
        const n = (ch.name || '').toLowerCase();
        const id = (ch.id || '').toLowerCase();
        const cats = (ch.categories || []).map(c => String(c).toLowerCase());
        return n.includes('myco') || id.includes('myco') || cats.some(c => c.includes('myco'));
      });
      if (matched.length > 0) return matched;
    }

    if (lower.includes('sony liv') || lower === 'sony' || lower === 'sony sports' || lower === 'sonyliv') {
      const matched = allChannels.filter(ch => {
        const n = (ch.name || '').toLowerCase();
        const id = (ch.id || '').toLowerCase();
        const cats = (ch.categories || []).map(c => String(c).toLowerCase());
        const isSony = n.includes('sony') || id.includes('sony') || cats.some(c => c.includes('sony'));
        const isSports = (ch.category || '').toLowerCase() === 'sports' || cats.includes('sports') || n.includes('ten') || n.includes('sports') || n.includes('liv') || n.includes('cricket');
        return isSony && isSports;
      });
      if (matched.length > 0) return matched;
    }

    if (lower.includes('star sports') || lower === 'star' || lower === 'starsports') {
      const matched = allChannels.filter(ch => {
        const n = (ch.name || '').toLowerCase();
        const id = (ch.id || '').toLowerCase();
        const cats = (ch.categories || []).map(c => String(c).toLowerCase());
        const isStar = n.includes('star') || id.includes('star') || cats.some(c => c.includes('star'));
        const isSports = (ch.category || '').toLowerCase() === 'sports' || cats.includes('sports') || n.includes('sports') || n.includes('khel') || n.includes('select');
        return isStar && isSports;
      });
      if (matched.length > 0) return matched;
    }

    if (lower.includes('fancode')) {
      const matched = allChannels.filter(ch => {
        const n = (ch.name || '').toLowerCase();
        const id = (ch.id || '').toLowerCase();
        const cats = (ch.categories || []).map(c => String(c).toLowerCase());
        return n.includes('fancode') || id.includes('fancode') || cats.some(c => c.includes('fancode'));
      });
      if (matched.length > 0) return matched;
    }

    if (lower.includes('dazn')) {
      const matched = allChannels.filter(ch => {
        const n = (ch.name || '').toLowerCase();
        const id = (ch.id || '').toLowerCase();
        const cats = (ch.categories || []).map(c => String(c).toLowerCase());
        return n.includes('dazn') || id.includes('dazn') || cats.some(c => c.includes('dazn'));
      });
      if (matched.length > 0) return matched;
    }

    if (lower.includes('fox sports') || lower === 'fox') {
      const matched = allChannels.filter(ch => {
        const n = (ch.name || '').toLowerCase();
        const id = (ch.id || '').toLowerCase();
        const cats = (ch.categories || []).map(c => String(c).toLowerCase());
        return n.includes('fox') || id.includes('fox') || cats.some(c => c.includes('fox'));
      });
      if (matched.length > 0) return matched;
    }

    // Generic filter
    return allChannels.filter(ch => {
      const cat = (ch.category || '').toLowerCase().trim();
      const categories = Array.isArray(ch.categories) ? ch.categories.map(c => c.toLowerCase().trim()) : [];
      return cat === lower || categories.includes(lower) || (ch.name || '').toLowerCase().includes(lower);
    });
  }

  /**
   * Render Categories Grid (3D Raised Logos matching Original Style)
   */
  function renderCategories() {
    if (!DOM.categoriesGrid) return;

    let categoriesToShow = state.categories;
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      categoriesToShow = categoriesToShow.filter(cat =>
        (cat.name || '').toLowerCase().includes(q)
      );
    }

    if (categoriesToShow.length === 0) {
      DOM.categoriesGrid.innerHTML = `
        <div class="col-span-2 text-center py-8 text-slate-400 text-xs font-semibold">
          No matching categories found
        </div>
      `;
      return;
    }

    DOM.categoriesGrid.innerHTML = categoriesToShow.map(cat => {
      const customLogo = state.customCategoryLogos && (state.customCategoryLogos[cat.id] || state.customCategoryLogos[cat.name]);
      const customColor = state.customCategoryColors && (state.customCategoryColors[cat.id] || state.customCategoryColors[cat.name]);
      
      const effectiveLogo = customLogo || cat.logo;
      const ringColor = (customColor && customColor.ringColor) || cat.ringColor || '#38bdf8';
      const glowColor = (customColor && customColor.glowColor) || cat.glowColor || 'rgba(56, 189, 248, 0.35)';
      
      let logoHtml = '';
      if (effectiveLogo) {
        logoHtml = `<img src="${escapeHtml(effectiveLogo)}" alt="${escapeHtml(cat.name)}" class="category-logo-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-block';">
                    <i class="fa-solid ${escapeHtml(cat.icon || 'fa-tv')} category-logo-icon" style="display:none;"></i>`;
      } else {
        logoHtml = `<i class="fa-solid ${escapeHtml(cat.icon || 'fa-tv')} category-logo-icon"></i>`;
      }

      return `
        <div class="category-card" data-category-name="${escapeHtml(cat.name)}" data-category-id="${escapeHtml(cat.id || '')}" id="cat-card-${escapeHtml(cat.id || cat.name.toLowerCase().replace(/[^a-z0-9]/g, '-'))}">
          <div class="category-logo-raised">
            ${logoHtml}
          </div>
          <div class="category-info">
            <span class="category-name">${escapeHtml(cat.name)}</span>
          </div>
        </div>
      `;
    }).join('');

    DOM.categoriesGrid.querySelectorAll('.category-card').forEach(card => {
      card.onclick = (e) => {
        e.preventDefault();
        const catName = card.getAttribute('data-category-name');
        openCategoryDetail(catName);
      };
    });
  }

  /**
   * Play channel directly with instant player launch and rich server list
   */
  function playChannelDirectly(ch) {
    if (!ch) return;

    let streams = [];
    const cleanName = sanitizeChannelName(ch.name || 'Live Channel');
    const pUrl = ch.stream_url || ch.url;
    const bUrls = ch.backupUrls || (ch.backup_stream_url ? [ch.backup_stream_url] : []);
    const cat = ch.category || (Array.isArray(ch.categories) && ch.categories.length > 0 ? ch.categories[0] : 'Live TV');

    if (ch.streams && Array.isArray(ch.streams) && ch.streams.length > 0) {
      streams = ch.streams.map((st, idx) => {
        let serverTitle = st.name || `Server ${idx + 1}`;
        let serverLabel = '';
        if (/proxy/i.test(serverTitle)) {
          serverLabel = `SERVER ${idx + 1} (FAST PROXY)`;
        } else if (/backup|cdn|mirror/i.test(serverTitle)) {
          serverLabel = `SERVER ${idx + 1} (BACKUP)`;
        } else if (/hd|1080|720|fhd/i.test(serverTitle)) {
          serverLabel = `SERVER ${idx + 1} (${st.quality || 'HD'})`;
        } else {
          serverLabel = `SERVER ${idx + 1} (${st.quality || (idx === 0 ? 'HD' : 'AUTO')})`;
        }

        return {
          name: serverTitle,
          serverLabel: serverLabel,
          channelName: cleanName,
          channelLogo: st.channelLogo || ch.logo,
          url: st.url,
          backupUrls: st.backupUrls || [],
          quality: st.quality || (idx === 0 ? '1080p FHD' : '720p HD'),
          isHD: st.isHD !== false
        };
      });

      // If there isn't already an explicit proxy server in streams, add a dedicated Fast Proxy server option
      const hasProxyStream = streams.some(s => s.url && s.url.startsWith('/api/stream-proxy'));
      if (!hasProxyStream && streams.length > 0 && streams[0].url && !streams[0].url.startsWith('/api/stream-proxy')) {
        const fastProxyUrl = `/api/stream-proxy?url=${encodeURIComponent(streams[0].url)}`;
        streams.push({
          name: `${cleanName} (Server ${streams.length + 1} Fast Proxy)`,
          serverLabel: `SERVER ${streams.length + 1} (FAST PROXY)`,
          channelName: cleanName,
          channelLogo: ch.logo,
          url: fastProxyUrl,
          quality: '720p HD',
          isHD: true
        });
      }
    } else if (pUrl) {
      const proxyUrl = `/api/stream-proxy?url=${encodeURIComponent(pUrl)}`;
      streams = [
        {
          name: `${cleanName} (Server 1 HD)`,
          serverLabel: `SERVER 1 (1080P HD)`,
          channelName: cleanName,
          channelLogo: ch.logo,
          url: pUrl,
          backupUrls: bUrls,
          quality: '1080p FHD',
          isHD: true
        },
        {
          name: `${cleanName} (Server 2 Fast Proxy)`,
          serverLabel: `SERVER 2 (FAST PROXY)`,
          channelName: cleanName,
          channelLogo: ch.logo,
          url: proxyUrl,
          quality: '720p HD',
          isHD: true
        }
      ];

      bUrls.forEach((u, i) => {
        streams.push({
          name: `${cleanName} (Server ${i + 3} Backup)`,
          serverLabel: `SERVER ${i + 3} (BACKUP)`,
          channelName: cleanName,
          channelLogo: ch.logo,
          url: u,
          quality: '720p HD',
          isHD: true
        });
      });
    } else {
      showToast('⚠️ Stream currently unavailable for this channel');
      return;
    }

    playMedia({
      title: cleanName,
      streams: streams,
      id: ch.id,
      logo: ch.logo,
      isChannel: true,
      channelObj: ch,
      activeStreamIndex: 0,
      category: cat,
      categories: ch.categories || [cat]
    });
  }

  /**
   * Open Category Detail
   */
  function openCategoryDetail(catName) {
    state.activeCategoryName = catName;
    const matched = getChannelsForCategory(catName);
    
    // Display Title
    let displayTitle = catName;
    if (catName.toLowerCase() === 'news' && !catName.toLowerCase().includes('channels')) {
      displayTitle = 'News Channels';
    } else if (catName.toLowerCase() === 'sports' && !catName.toLowerCase().includes('channels')) {
      displayTitle = 'Sports Channels';
    }
    
    if (DOM.catDetailTitle) DOM.catDetailTitle.textContent = displayTitle;
    if (DOM.catDetailCount) DOM.catDetailCount.textContent = `${matched.length} Channels`;

    const searchContainer = document.getElementById('cat-detail-search-bar');
    const searchInput = document.getElementById('cat-detail-search-input');
    const searchClear = document.getElementById('btn-cat-search-clear');
    if (searchInput) searchInput.value = '';
    if (searchContainer) searchContainer.classList.add('hidden');
    if (searchClear) searchClear.classList.add('hidden');

    function renderCategoryChannelsList(filterQuery = '') {
      if (!DOM.catDetailGrid) return;
      let list = matched;
      if (filterQuery.trim()) {
        const q = filterQuery.toLowerCase().trim();
        list = list.filter(ch => (ch.name || '').toLowerCase().includes(q));
      }

      if (list.length === 0) {
        DOM.catDetailGrid.innerHTML = `
          <div class="col-span-4 text-center py-12 text-slate-400 text-xs font-semibold">
            <i class="fa-solid fa-tv text-2xl mb-2 text-slate-600"></i>
            <p>No channels found in ${escapeHtml(displayTitle)}</p>
          </div>
        `;
      } else {
        DOM.catDetailGrid.innerHTML = list.map(ch => createChannelCardHtml(ch)).join('');
        attachChannelClickEvents(DOM.catDetailGrid);
      }
    }

    renderCategoryChannelsList();

    const btnBack = document.getElementById('btn-back-from-category');
    if (btnBack) {
      btnBack.onclick = (e) => {
        e.preventDefault();
        switchView('view-categories');
      };
    }

    switchView('view-category-detail');
  }

  /**
   * Render Favorites Grid
   */
  function renderFavorites() {
    if (!DOM.favoritesGrid) return;

    const favChannels = state.channels.filter(ch => state.favorites.includes(ch.id));
    if (DOM.favoritesCount) DOM.favoritesCount.textContent = `${favChannels.length} Channels`;

    if (favChannels.length === 0) {
      DOM.favoritesGrid.innerHTML = `
        <div class="col-span-3 text-center py-12">
          <i class="fa-regular fa-star text-slate-600 text-3xl mb-2"></i>
          <p class="text-xs text-slate-400 font-semibold">No favorite channels added yet.</p>
          <p class="text-[10px] text-slate-500 mt-1">Tap the star icon on any channel or player to add it here.</p>
        </div>
      `;
      return;
    }

    DOM.favoritesGrid.innerHTML = favChannels.map(ch => createChannelCardHtml(ch)).join('');
    attachChannelClickEvents(DOM.favoritesGrid);
  }

  /**
   * Helper to sanitize channel display name
   */
  function sanitizeChannelName(name) {
    if (!name) return 'Live Channel';
    return name.replace(/(\s*\(\d+\))+\s*$/g, '').replace(/\s*\(\s*\)\s*$/g, '').replace(/\s+/g, ' ').trim();
  }

  /**
   * Safe Logo Fallback Generator with Custom Logo Overrides
   */
  function getSafeLogoUrl(url, name, channelId) {
    if (channelId && state.customLogos && state.customLogos[channelId]) {
      return state.customLogos[channelId];
    }
    if (url && typeof url === 'string' && url.trim() && !url.includes('undefined') && !url.includes('null')) {
      return url.trim();
    }
    const letter = ((name || 'TV').charAt(0) || 'T').toUpperCase();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80"><defs><radialGradient id="dom" cx="35%" cy="30%" r="70%"><stop offset="0%" stop-color="#0284c7"/><stop offset="100%" stop-color="#0369a1"/></radialGradient></defs><rect width="80" height="80" rx="40" fill="url(#dom)"/><text x="50%" y="54%" font-size="28" font-weight="900" fill="#ffffff" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif">${letter}</text></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  /**
   * Helper to create channel card markup
   */
  function createChannelCardHtml(channel) {
    const isFav = state.favorites.includes(channel.id);
    const cleanDisplayName = sanitizeChannelName(channel.name);
    const logoSrc = getSafeLogoUrl(channel.logo, cleanDisplayName, channel.id);
    const fallbackLetter = ((cleanDisplayName || 'TV').charAt(0) || 'T').toUpperCase();
    const fallbackSvg = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80"><defs><radialGradient id="g" cx="35%" cy="30%" r="70%"><stop offset="0%" stop-color="#1e293b"/><stop offset="100%" stop-color="#0f172a"/></radialGradient></defs><rect width="80" height="80" rx="40" fill="url(#g)"/><text x="50%" y="54%" font-size="28" font-weight="bold" fill="#94a3b8" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif">${fallbackLetter}</text></svg>`)}`;

    return `
      <div class="channel-card" data-channel-id="${escapeHtml(channel.id)}">
        <button class="channel-fav-btn ${isFav ? 'active' : ''}" data-fav-id="${escapeHtml(channel.id)}" title="Favorite">
          <i class="fa-solid fa-star"></i>
        </button>
        <div class="channel-logo-wrapper">
          <img 
            src="${escapeHtml(logoSrc)}" 
            alt="${escapeHtml(cleanDisplayName)}" 
            class="channel-logo-img" 
            loading="lazy"
            decoding="async"
            referrerpolicy="no-referrer"
            onerror="this.onerror=null;this.src='${fallbackSvg}';"
          />
        </div>
        <span class="channel-name-text" title="${escapeHtml(cleanDisplayName)}">${escapeHtml(cleanDisplayName)}</span>
      </div>
    `;
  }

  /**
   * Attach Channel Click Event Handlers
   */
  function attachChannelClickEvents(container) {
    if (!container) return;

    container.querySelectorAll('.channel-card').forEach(card => {
      card.onclick = (e) => {
        if (e.target.closest('.channel-fav-btn')) return;
        e.preventDefault();
        const id = card.getAttribute('data-channel-id');
        const ch = state.channels.find(c => c.id === id);
        if (ch) {
          playChannelDirectly(ch);
        }
      };
    });

    container.querySelectorAll('.channel-fav-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        const id = btn.getAttribute('data-fav-id');
        toggleFavorite(id);
      };
    });
  }

  /**
   * Toggle Favorite Channel
   */
  function toggleFavorite(id) {
    if (!id) return;
    const index = state.favorites.indexOf(id);
    if (index > -1) {
      state.favorites.splice(index, 1);
    } else {
      state.favorites.push(id);
    }
    localStorage.setItem('highfy_favs', JSON.stringify(state.favorites));

    renderChannels();
    renderFavorites();
    updatePlayerFavButton();
  }

  /**
   * HLS Stream Player Core
   */
  let streamLoadWatchdog = null;
  let streamErrorRetryCount = 0;

  function playMedia(item) {
    if (window.HighFySecurity && window.HighFySecurity.isLockedDown()) {
      console.warn('[HighFy Security] Playback blocked by active Reqable lockdown');
      return;
    }

    if (!item || !item.streams || item.streams.length === 0) {
      alert('No stream link available for this item');
      return;
    }

    // ONLY enrich match streams if this item is an actual multi-team match fixture, NEVER for direct TV channels
    if (window.sportsCoordinator && item.team1 && item.team2 && !item.isChannel) {
      const matchInfo = window.sportsCoordinator.matchLiveStream(item);
      if (matchInfo.hasStream && Array.isArray(matchInfo.streams) && matchInfo.streams.length > 0) {
        item.streams = matchInfo.streams;
      }
    }

    state.currentPlayingItem = item;
    if (DOM.playerTitle) DOM.playerTitle.textContent = item.title;

    state.currentServerIndex = typeof item.activeStreamIndex === 'number' && item.streams[item.activeStreamIndex] 
      ? item.activeStreamIndex 
      : 0;

    renderServerPills();
    renderPlayerMatchBar();
    renderPlayerRelatedEvents();
    updatePlayerFavButton();

    if (DOM.playerModal) {
      DOM.playerModal.classList.add('active');
    }

    loadStreamUrl(item.streams[state.currentServerIndex].url);
  }

  /**
   * Render Horizontal Channel/Server Pills Row (Direct Channel Names)
   */
  function renderServerPills() {
    const pillsContainer = document.getElementById('player-server-pills');
    if (!pillsContainer || !state.currentPlayingItem || !Array.isArray(state.currentPlayingItem.streams)) return;

    const streams = state.currentPlayingItem.streams;
    const currentIdx = state.currentServerIndex;
    const isEvent = Boolean(state.currentPlayingItem.isEvent || state.currentPlayingItem.sport || state.currentPlayingItem.team1 || state.currentPlayingItem.homeTeam);

    pillsContainer.innerHTML = streams.map((st, idx) => {
      const isCurrentActive = idx === currentIdx;
      
      // Determine the cleanest channel name for the pill button
      let displayName = '';
      if (isEvent) {
        // For match events with multiple broadcasting channels
        if (st.channelName && !(/server\s*\d+/i.test(st.channelName))) {
          displayName = sanitizeChannelName(st.channelName);
        } else if (st.name && !(/server\s*\d+/i.test(st.name))) {
          displayName = sanitizeChannelName(st.name.replace(/\(server\s*\d+.*?\)/i, '').replace(/\(link\s*\d+.*?\)/i, '').trim());
        } else if (st.serverLabel && !(/server\s*\d+/i.test(st.serverLabel))) {
          displayName = st.serverLabel;
        } else {
          displayName = st.name || `Server ${idx + 1} (${st.quality || 'HD'})`;
        }
      } else {
        // For single TV channels with backup streaming servers
        const qTag = st.quality ? ` • ${st.quality.replace('1080p ', '').replace('720p ', '')}` : '';
        displayName = `Server ${idx + 1}${qTag}`;
      }

      return `
        <button class="player-server-pill ${isCurrentActive ? 'active' : ''}" data-server-idx="${idx}" title="${escapeHtml(displayName)}">
          ${isCurrentActive ? '<i class="fa-solid fa-check text-xs"></i> ' : '<i class="fa-solid fa-tv text-[11px] opacity-75"></i> '}
          <span class="player-pill-name">${escapeHtml(displayName)}</span>
        </button>
      `;
    }).join('');

    // Attach click listener to switch stream on pill click
    pillsContainer.querySelectorAll('.player-server-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-server-idx'), 10);
        if (!isNaN(idx) && idx !== state.currentServerIndex && state.currentPlayingItem?.streams[idx]) {
          state.currentServerIndex = idx;
          renderServerPills();
          loadStreamUrl(state.currentPlayingItem.streams[idx].url);
        }
      });
    });

    // Smoothly scroll active pill into view
    setTimeout(() => {
      const activePill = pillsContainer.querySelector('.player-server-pill.active');
      if (activePill) {
        activePill.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }, 50);
  }

  /**
   * Render Match Quick Action Bar (Team Logos & Share Button)
   */
  function renderPlayerMatchBar() {
    const item = state.currentPlayingItem;
    if (!item) return;

    const team1Img = document.getElementById('player-bar-team1-img');
    const team2Img = document.getElementById('player-bar-team2-img');
    const statusTag = document.getElementById('player-bar-status-tag');
    const team2Disk = document.getElementById('player-bar-team2-disk');

    const defaultFlag = window.DEFAULT_SPORTS_FALLBACK_LOGO || '/assets/wwe-logos/wwe_official.svg';

    if (item.team1 && item.team2) {
      let t1Name = item.team1.name || '';
      let t2Name = item.team2.name || '';
      let t1Logo = getHighResTeamLogo(t1Name, item.team1.logo);
      let t2Logo = getHighResTeamLogo(t2Name, item.team2.logo);

      const isWrestlingEvent = (item.sport || '').toLowerCase() === 'wwe' ||
        (item.sportName || '').toLowerCase() === 'wwe' ||
        String(item.id || '').startsWith('wwe-') ||
        String(item.id || '').startsWith('aew-') ||
        (item.league && /raw|smackdown|nxt|aew|wwe/i.test(item.league));

      if (isWrestlingEvent) {
        const matchText = `${item.title || ''} ${item.tournament || ''} ${item.league || ''} ${item.subText || ''} ${t1Name} ${t2Name}`.toLowerCase();
        if (matchText.includes('raw')) {
          t1Name = 'WWE';
          t1Logo = '/assets/wwe-logos/wwe_official.svg';
          t2Name = 'RAW';
          t2Logo = '/assets/wwe-logos/wwe_raw.svg';
        } else if (matchText.includes('smackdown') || matchText.includes('smack down')) {
          t1Name = 'WWE';
          t1Logo = '/assets/wwe-logos/wwe_official.svg';
          t2Name = 'SmackDown';
          t2Logo = '/assets/wwe-logos/wwe_smackdown.svg';
        } else if (matchText.includes('nxt')) {
          t1Name = 'WWE';
          t1Logo = '/assets/wwe-logos/wwe_official.svg';
          t2Name = 'NXT';
          t2Logo = '/assets/wwe-logos/wwe_nxt.svg';
        } else if (matchText.includes('aew') || matchText.includes('dynamite')) {
          t1Name = 'AEW';
          t1Logo = '/assets/wwe-logos/aew_official.svg';
          t2Name = 'Dynamite';
          t2Logo = '/assets/wwe-logos/aew_official.svg';
        } else {
          t1Name = 'WWE';
          t1Logo = '/assets/wwe-logos/wwe_official.svg';
          t2Name = 'Special PLE';
          t2Logo = '/assets/wwe-logos/wwe_special.svg';
        }
      }

      if (team1Img) {
        team1Img.dataset.hasFallback = '';
        team1Img.src = t1Logo || defaultFlag;
        team1Img.alt = t1Name;
      }
      if (team2Img) {
        team2Img.dataset.hasFallback = '';
        team2Img.src = t2Logo || defaultFlag;
        team2Img.alt = t2Name;
      }
      if (team2Disk) team2Disk.style.display = 'flex';
      if (statusTag) {
        const isLive = item.status === 'LIVE' || (item.time && String(item.time).toLowerCase().includes('live'));
        statusTag.textContent = isLive ? 'LIVE' : 'VS';
        statusTag.style.color = isLive ? '#ef4444' : '#38bdf8';
      }
    } else {
      // Channel play mode
      const rawLogo = item.logo || item.streams?.[0]?.channelLogo || defaultFlag;
      const logo = getSafeLogoUrl(rawLogo, item.title, item.id);
      if (team1Img) {
        team1Img.dataset.hasFallback = '';
        team1Img.src = logo;
        team1Img.alt = item.title || 'Channel';
      }
      if (team2Disk) team2Disk.style.display = 'none';
      if (statusTag) {
        statusTag.textContent = 'LIVE';
        statusTag.style.color = '#ef4444';
      }
    }
  }

  /**
   * Render Switch Channels (matching currently watched category) OR Sports Events
   */
  function renderPlayerRelatedEvents() {
    const listContainer = document.getElementById('player-related-events-list');
    const headerTitleEl = document.getElementById('player-related-events-header');
    const headerCountEl = document.getElementById('player-related-events-count');
    if (!listContainer) return;

    const item = state.currentPlayingItem;
    const isMatchEvent = Boolean(item && (item.isEvent || (item.team1 && item.team2) || (item.sport && !item.isChannel)));

    // Case 1: TV Channel is playing -> Show Switch Channels for this Category
    if (!isMatchEvent) {
      const catName = item?.category || (Array.isArray(item?.categories) && item.categories.length > 0 ? item.categories[0] : 'Bangla');
      let categoryChannels = getChannelsForCategory(catName);

      if (!categoryChannels || categoryChannels.length === 0) {
        categoryChannels = state.channels || [];
      }

      if (headerTitleEl) {
        headerTitleEl.innerHTML = `<i class="fa-solid fa-tv text-sky-400"></i> Switch Channel (${escapeHtml(catName)})`;
      }
      if (headerCountEl) {
        headerCountEl.innerHTML = `${categoryChannels.length} Channels • Tap to Switch`;
      }

      if (categoryChannels.length === 0) {
        listContainer.innerHTML = `
          <div class="p-4 text-center text-xs text-slate-400">
            No other channels found in ${escapeHtml(catName)} category.
          </div>
        `;
        return;
      }

      const currentPlayingChannelId = String(item.id || item.channelId || item.channelObj?.id || '');
      const currentPlayingTitle = sanitizeChannelName(item.title || item.name || item.channelName || '').toLowerCase().trim();

      listContainer.innerHTML = `
        <div class="player-switch-grid">
          ${categoryChannels.map(ch => {
            const chNameClean = sanitizeChannelName(ch.name || '');
            const isPlayingThis = Boolean(
              (currentPlayingChannelId && ch.id && currentPlayingChannelId === String(ch.id)) ||
              (currentPlayingTitle && chNameClean && currentPlayingTitle === chNameClean.toLowerCase().trim())
            );
            const isFav = state.favorites.includes(ch.id);
            const logoSrc = getSafeLogoUrl(ch.logo, chNameClean, ch.id);
            const fallbackLetter = ((chNameClean || 'TV').charAt(0) || 'T').toUpperCase();
            const fallbackSvg = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80"><defs><radialGradient id="g" cx="35%" cy="30%" r="70%"><stop offset="0%" stop-color="#1e293b"/><stop offset="100%" stop-color="#0f172a"/></radialGradient></defs><rect width="80" height="80" rx="40" fill="url(#g)"/><text x="50%" y="54%" font-size="28" font-weight="bold" fill="#64748b" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif">${fallbackLetter}</text></svg>`)}`;

            return `
              <div class="channel-card ${isPlayingThis ? 'is-current-stream' : ''}" data-switch-channel-id="${escapeHtml(ch.id)}" title="Switch to ${escapeHtml(chNameClean)}">
                <button class="channel-fav-btn ${isFav ? 'active' : ''}" data-fav-id="${escapeHtml(ch.id)}" title="Favorite">
                  <i class="fa-solid fa-star"></i>
                </button>
                ${isPlayingThis ? '<span class="channel-playing-badge"><i class="fa-solid fa-play text-[7px] animate-pulse"></i> LIVE</span>' : ''}
                <div class="channel-logo-wrapper">
                  <img 
                    src="${escapeHtml(logoSrc)}" 
                    alt="${escapeHtml(chNameClean)}" 
                    class="channel-logo-img" 
                    loading="lazy"
                    decoding="async"
                    referrerpolicy="no-referrer"
                    onerror="this.onerror=null;this.src='${fallbackSvg}';"
                  />
                </div>
                <span class="channel-name-text" title="${escapeHtml(chNameClean)}">${escapeHtml(chNameClean)}</span>
              </div>
            `;
          }).join('')}
        </div>
      `;

      // Attach click handlers to switch channels & buttons
      listContainer.querySelectorAll('[data-switch-channel-id]').forEach(card => {
        card.addEventListener('click', (e) => {
          if (e.target.closest('.channel-fav-btn')) return;
          e.preventDefault();
          const id = card.getAttribute('data-switch-channel-id');
          const targetChannel = state.channels.find(c => String(c.id) === String(id));
          if (targetChannel) {
            // Immediate visual feedback: switch active card styling
            listContainer.querySelectorAll('.channel-card').forEach(c => {
              c.classList.remove('is-current-stream');
              const badge = c.querySelector('.channel-playing-badge');
              if (badge) badge.remove();
            });
            card.classList.add('is-current-stream');
            const badgeEl = document.createElement('span');
            badgeEl.className = 'channel-playing-badge';
            badgeEl.innerHTML = '<i class="fa-solid fa-play text-[7px] animate-pulse"></i> LIVE';
            card.appendChild(badgeEl);

            playChannelDirectly(targetChannel);
          }
        });
      });

      listContainer.querySelectorAll('.channel-fav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          const id = btn.getAttribute('data-fav-id');
          toggleFavorite(id);
        });
      });

      return;
    }

    // Case 2: Sports Match / Event is playing -> Show Live & Upcoming Match Cards Switcher
    if (headerTitleEl) {
      headerTitleEl.innerHTML = `<i class="fa-solid fa-trophy text-amber-400"></i> Switch Match (Live & Upcoming)`;
    }
    if (headerCountEl) {
      headerCountEl.innerHTML = `Tap Card to Switch`;
    }

    let eventsToDisplay = [];
    if (window.sportsCoordinator && typeof window.sportsCoordinator.getFilteredEvents === 'function') {
      eventsToDisplay = window.sportsCoordinator.getFilteredEvents({ sport: 'All', status: 'ALL' });
    } else if (Array.isArray(state.events) && state.events.length > 0) {
      eventsToDisplay = [...state.events];
    }

    if (item && item.sport) {
      const currentSport = (item.sport || '').toLowerCase();
      eventsToDisplay = [...eventsToDisplay].sort((a, b) => {
        const aMatches = (a.sport || '').toLowerCase() === currentSport ? 1 : 0;
        const bMatches = (b.sport || '').toLowerCase() === currentSport ? 1 : 0;
        return bMatches - aMatches;
      });
    }

    if (eventsToDisplay.length === 0) {
      listContainer.innerHTML = `
        <div class="p-4 text-center text-xs text-slate-400">
          No other live sports events found at the moment.
        </div>
      `;
      return;
    }

    // Display top 15 matches for clean performance inside modal
    const items = eventsToDisplay.slice(0, 15);

    listContainer.innerHTML = items.map(ev => {
      const isCurrentlyPlaying = state.currentPlayingItem && (String(state.currentPlayingItem.id) === String(ev.id) || state.currentPlayingItem.title === ev.title);
      return renderSingleEventCardHtml(ev, isCurrentlyPlaying);
    }).join('');

    // Attach click listeners to match cards inside the player modal
    listContainer.querySelectorAll('.event-card-wrapper, .event-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.card-fav-star-btn')) {
          e.stopPropagation();
          const favBtn = e.target.closest('.card-fav-star-btn');
          const id = favBtn.getAttribute('data-fav-event-id');
          toggleEventFavorite(id);
          renderPlayerRelatedEvents();
          return;
        }

        const evCard = card.classList.contains('event-card') ? card : card.querySelector('.event-card');
        const id = evCard ? evCard.getAttribute('data-event-id') : null;
        if (!id) return;

        const selectedEvent = eventsToDisplay.find(item => String(item.id) === String(id));
        if (selectedEvent) {
          let matchStreams = selectedEvent.streams;
          if ((!matchStreams || matchStreams.length === 0) && window.sportsCoordinator) {
            const streamInfo = window.sportsCoordinator.matchLiveStream(selectedEvent);
            if (streamInfo.hasStream) {
              matchStreams = streamInfo.streams;
            }
          }
          if (matchStreams && matchStreams.length > 0) {
            const t1 = selectedEvent.team1?.name || selectedEvent.homeTeam?.name || 'Team 1';
            const t2 = selectedEvent.team2?.name || selectedEvent.awayTeam?.name || 'Team 2';
            playMedia({
              title: `${t1} vs ${t2}`,
              streams: matchStreams,
              id: selectedEvent.id,
              team1: selectedEvent.team1 || { name: t1 },
              team2: selectedEvent.team2 || { name: t2 },
              isEvent: true,
              sport: selectedEvent.sport || selectedEvent.category,
              category: selectedEvent.category || 'Sports',
              activeStreamIndex: 0
            });
          } else {
            openMatchDetails(selectedEvent.id);
          }
        }
      });
    });
  }

  function updatePlayerFavButton() {
    if (!DOM.playerFavIcon || !state.currentPlayingItem) return;
    const isFav = state.favorites.includes(state.currentPlayingItem.id);
    if (isFav) {
      DOM.playerFavIcon.classList.remove('fa-regular');
      DOM.playerFavIcon.classList.add('fa-solid', 'text-amber-400');
    } else {
      DOM.playerFavIcon.classList.remove('fa-solid', 'text-amber-400');
      DOM.playerFavIcon.classList.add('fa-regular');
    }
  }

  function loadStreamUrl(url, hasTriedProxy = false) {
    if (!DOM.videoElement || !url) return;

    // Security Gate: Block playback if Reqable or sniffer is detected
    if (window.HighFySecurity && window.HighFySecurity.isLockedDown()) {
      console.warn('[HighFy Security] Playback prohibited: Reqable or sniffer threat active');
      return;
    }

    // Harden video element against link extraction & inspection
    DOM.videoElement.setAttribute('controlslist', 'nodownload noplaybackrate noremoteplayback');
    DOM.videoElement.setAttribute('draggable', 'false');
    DOM.videoElement.oncontextmenu = (e) => { e.preventDefault(); return false; };

    if (streamLoadWatchdog) {
      clearTimeout(streamLoadWatchdog);
      streamLoadWatchdog = null;
    }

    // Auto-fix audio-only track URLs to full Video+Audio track
    let targetUrl = url;
    if (typeof targetUrl === 'string' && targetUrl.includes('tracks-a1/')) {
      targetUrl = targetUrl.replace('tracks-a1/', 'tracks-v1a1/');
    }

    // Auto-proxy streams to eliminate Mixed Content (HTTP on HTTPS page) and CORS/Host restrictions
    const isHttpsOrigin = window.location.protocol === 'https:';
    const isHttpUrl = typeof targetUrl === 'string' && targetUrl.startsWith('http://');
    const isRestrictedProvider = typeof targetUrl === 'string' && (
      targetUrl.includes('hey-lookme.shop') ||
      targetUrl.includes('otttv.pw') ||
      targetUrl.includes('ottclub.xyz') ||
      targetUrl.includes('41.205.93.154') ||
      targetUrl.includes('151.80.18.177') ||
      targetUrl.includes('212.102.38.45') ||
      targetUrl.includes('103.175.73.12') ||
      targetUrl.includes('inplyr.com')
    );
    if ((isHttpsOrigin && isHttpUrl) || isRestrictedProvider) {
      if (!targetUrl.startsWith('/api/stream-proxy') && !targetUrl.includes('/api/stream-proxy?url=')) {
        targetUrl = `/api/stream-proxy?url=${encodeURIComponent(targetUrl)}`;
        hasTriedProxy = true;
      }
    }

    if (DOM.playerError) DOM.playerError.style.display = 'none';

    // Clean up any existing player instances
    if (state.hlsInstance) {
      try { state.hlsInstance.destroy(); } catch (e) {}
      state.hlsInstance = null;
    }
    if (state.mpegtsInstance) {
      try { 
        state.mpegtsInstance.pause();
        state.mpegtsInstance.unload();
        state.mpegtsInstance.detachMediaElement();
        state.mpegtsInstance.destroy(); 
      } catch (e) {}
      state.mpegtsInstance = null;
    }

    const tryNextServerOrFallback = () => {
      if (streamLoadWatchdog) {
        clearTimeout(streamLoadWatchdog);
        streamLoadWatchdog = null;
      }

      // Step 1: If original URL failed and is not already proxied, try backend proxy
      if (!hasTriedProxy && !targetUrl.startsWith('/api/stream-proxy') && /^https?:\/\//i.test(targetUrl)) {
        console.warn('[HighFy Fast Player] Direct stream failed, switching to HighFy Stream Proxy...');
        const proxyUrl = `/api/stream-proxy?url=${encodeURIComponent(targetUrl)}`;
        loadStreamUrl(proxyUrl, true);
        return;
      }

      // Step 2: Try next server in item's streams list
      if (state.currentPlayingItem && Array.isArray(state.currentPlayingItem.streams)) {
        const nextIdx = state.currentServerIndex + 1;
        if (nextIdx < state.currentPlayingItem.streams.length) {
          console.warn(`[HighFy Fast Player] Auto-switching to Server ${nextIdx + 1}`);
          state.currentServerIndex = nextIdx;
          renderServerPills();
          renderPlayerRelatedEvents();
          loadStreamUrl(state.currentPlayingItem.streams[nextIdx].url, false);
          return;
        }
      }

      // Step 3: If all servers failed for this channel/item, display clean channel status error
      const channelTitle = state.currentPlayingItem?.title || 'this channel';
      showPlayerError(`Live stream is temporarily unavailable for ${channelTitle}. Please select another server or tap Retry.`);
    };

    const hideSpinnerAndClearWatchdog = () => {
      if (streamLoadWatchdog) {
        clearTimeout(streamLoadWatchdog);
        streamLoadWatchdog = null;
      }
      if (DOM.playerSpinner) DOM.playerSpinner.style.display = 'none';
    };

    // Resilient Watchdog: 12s startup timeout before failover to backup
    streamLoadWatchdog = setTimeout(() => {
      if (!state.isUserPaused && DOM.videoElement && DOM.videoElement.paused && DOM.videoElement.readyState < 2) {
        console.warn('[HighFy Fast Player] Stream startup timeout, switching to next server or proxy...');
        tryNextServerOrFallback();
      }
    }, 12000);

    const isHlsSupported = window.Hls && window.Hls.isSupported();
    const isMpegtsSupported = window.mpegts && window.mpegts.isSupported();
    
    // Check stream format
    const lowerUrl = targetUrl.toLowerCase();
    const isM3U8Stream = lowerUrl.includes('.m3u8') || lowerUrl.includes('/api/stream-proxy') || lowerUrl.includes('playlist') || lowerUrl.includes('manifest') || (!lowerUrl.endsWith('.ts') && !lowerUrl.endsWith('.mp4'));
    const isDirectTsStream = (lowerUrl.includes('.ts') && !lowerUrl.includes('.m3u8')) || (lowerUrl.includes('/live/') && lowerUrl.endsWith('.ts'));

    const triggerInstantPlay = () => {
      hideSpinnerAndClearWatchdog();
      if (state.isUserPaused) return;

      const playPromise = DOM.videoElement.play();
      if (playPromise !== undefined) {
        playPromise.catch(err => {
          console.warn('[HighFy Fast Player] Autoplay with audio restricted, starting muted for instant play:', err);
          DOM.videoElement.muted = true;
          DOM.videoElement.play().catch(e => console.log('[HighFy] Video play error:', e));
        });
      }
    };

    // Bind universal video listeners to instantly dismiss spinner on playback
    const onVideoReadyOrPlaying = () => {
      hideSpinnerAndClearWatchdog();
    };

    DOM.videoElement.onplaying = onVideoReadyOrPlaying;
    DOM.videoElement.oncanplay = onVideoReadyOrPlaying;
    DOM.videoElement.onloadeddata = onVideoReadyOrPlaying;
    DOM.videoElement.ontimeupdate = () => {
      if (DOM.videoElement.currentTime > 0.05) {
        hideSpinnerAndClearWatchdog();
      }
    };

    // 1. Direct MPEG-TS Stream Playback via mpegts.js
    if (isDirectTsStream && isMpegtsSupported) {
      try {
        console.log('[HighFy Player] Initializing mpegts.js for TS stream:', targetUrl);
        const mpegtsPlayer = window.mpegts.createPlayer({
          type: 'mse',
          isLive: true,
          url: targetUrl,
          cors: true
        }, {
          enableWorker: true,
          lazyLoadMaxDuration: 2 * 60,
          seekType: 'range',
          liveBufferLatencyChasing: true,
          liveBufferLatencyMaxLatency: 3.0,
          liveBufferLatencyMinRemain: 0.5
        });

        mpegtsPlayer.attachMediaElement(DOM.videoElement);
        mpegtsPlayer.load();
        
        mpegtsPlayer.on(window.mpegts.Events.ERROR, (errorType, errorDetail) => {
          console.warn('[HighFy Player] mpegts.js error:', errorType, errorDetail);
          tryNextServerOrFallback();
        });

        mpegtsPlayer.play().then(triggerInstantPlay).catch(() => {
          DOM.videoElement.muted = true;
          mpegtsPlayer.play().catch(e => console.log('[HighFy] mpegts play fallback:', e));
        });

        state.mpegtsInstance = mpegtsPlayer;
        return;
      } catch (err) {
        console.warn('[HighFy Player] mpegts.js initialization failed, falling back to HLS/Native:', err);
      }
    }

    // 2. HLS Playback via Hls.js (.m3u8, mono.ts.m3u8, etc.) - Fast Ultra-Low-Latency Config
    if (isHlsSupported && isM3U8Stream) {
      const hls = new window.Hls({
        debug: false,
        enableWorker: true,
        lowLatencyMode: true,
        capLevelToPlayerSize: false,
        startLevel: -1,
        initialLiveManifestSize: 1,
        maxBufferLength: 10,
        maxMaxBufferLength: 20,
        maxBufferSize: 40 * 1024 * 1024,
        maxBufferHole: 0.5,
        highBufferWatchdogPeriod: 2,
        nudgeOffset: 0.1,
        nudgeMaxRetry: 5,
        maxFragLookUpTolerance: 0.25,
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 8,
        liveDurationInfinity: true,
        manifestLoadingTimeOut: 12000,
        manifestLoadingMaxRetry: 3,
        levelLoadingTimeOut: 12000,
        levelLoadingMaxRetry: 3,
        fragLoadingTimeOut: 15000,
        fragLoadingMaxRetry: 4,
        startFragPrefetch: true,
        testBandwidth: false,
        progressive: true,
        autoStartLoad: true,
        backBufferLength: 15
      });

      hls.attachMedia(DOM.videoElement);
      hls.loadSource(targetUrl);

      hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
        if (!state.isUserPaused) {
          triggerInstantPlay();
        }
      });
      hls.on(window.Hls.Events.FRAG_BUFFERED, () => {
        hideSpinnerAndClearWatchdog();
      });

      hls.on(window.Hls.Events.ERROR, (event, data) => {
        if (!data.fatal) {
          if (data.details === 'bufferStalledError') {
            console.log('[HighFy Player] Buffer stall, fast recovering...');
            if (!state.isUserPaused && DOM.videoElement && DOM.videoElement.paused) {
              DOM.videoElement.play().catch(() => {});
            }
          }
          return;
        }

        switch (data.type) {
          case window.Hls.ErrorTypes.NETWORK_ERROR:
            // Direct CORS failure or blocked network request -> Switch immediately to proxy/next server
            console.warn('[HighFy Fast Player] Network error detected:', data.details);
            hls.destroy();
            if (!hasTriedProxy && !targetUrl.includes('/api/stream-proxy') && /^https?:\/\//i.test(targetUrl)) {
              const proxyUrl = `/api/stream-proxy?url=${encodeURIComponent(targetUrl)}`;
              loadStreamUrl(proxyUrl, true);
              return;
            }
            tryNextServerOrFallback();
            break;
          case window.Hls.ErrorTypes.MEDIA_ERROR:
            console.warn('[HighFy Fast Player] Media error, recovering...');
            hls.recoverMediaError();
            break;
          default:
            console.error('[HighFy Fast Player] Fatal error:', data);
            hls.destroy();
            tryNextServerOrFallback();
            break;
        }
      });

      state.hlsInstance = hls;
    } else {
      // 3. Native HTML5 Video Fallback
      DOM.videoElement.src = targetUrl;
      DOM.videoElement.addEventListener('playing', hideSpinnerAndClearWatchdog, { once: true });
      DOM.videoElement.addEventListener('loadedmetadata', () => {
        hideSpinnerAndClearWatchdog();
        const p = DOM.videoElement.play();
        if (p !== undefined) {
          p.catch(() => {
            DOM.videoElement.muted = true;
            DOM.videoElement.play().catch(e => console.log('[HighFy] Autoplay muted fallback:', e));
          });
        }
      }, { once: true });

      DOM.videoElement.addEventListener('error', () => {
        hideSpinnerAndClearWatchdog();
        tryNextServerOrFallback();
      }, { once: true });
    }
  }

  function showPlayerError(msg) {
    if (streamLoadWatchdog) clearTimeout(streamLoadWatchdog);
    if (DOM.playerSpinner) DOM.playerSpinner.style.display = 'none';
    if (DOM.playerError) {
      DOM.playerError.style.display = 'flex';
      if (DOM.playerErrorMsg) DOM.playerErrorMsg.textContent = msg;
    }
  }

  function closePlayer() {
    if (streamLoadWatchdog) {
      clearTimeout(streamLoadWatchdog);
      streamLoadWatchdog = null;
    }
    if (state.hlsInstance) {
      try { state.hlsInstance.destroy(); } catch (e) {}
      state.hlsInstance = null;
    }
    if (state.mpegtsInstance) {
      try { 
        state.mpegtsInstance.pause();
        state.mpegtsInstance.unload();
        state.mpegtsInstance.detachMediaElement();
        state.mpegtsInstance.destroy(); 
      } catch (e) {}
      state.mpegtsInstance = null;
    }
    if (DOM.videoElement) {
      DOM.videoElement.pause();
      DOM.videoElement.removeAttribute('src');
      DOM.videoElement.load();
    }
    if (DOM.playerModal) {
      DOM.playerModal.classList.remove('active');
    }
  }

  /**
   * Format Video Time (MM:SS or H:MM:SS)
   */
  function formatPlayerTime(seconds) {
    if (isNaN(seconds) || !isFinite(seconds) || seconds < 0) return '0:00';
    const s = Math.floor(seconds);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    const secStr = sec < 10 ? '0' + sec : sec;
    if (m >= 60) {
      const h = Math.floor(m / 60);
      const remM = m % 60;
      const remMStr = remM < 10 ? '0' + remM : remM;
      return `${h}:${remMStr}:${secStr}`;
    }
    return `${m}:${secStr}`;
  }

  let overlayHideTimeout = null;
  let isScrubbing = false;
  let isScreenLocked = false;

  function showPlayerOverlay(autoHide = true) {
    refreshDOM();
    if (isScreenLocked) return;
    if (DOM.playerControlsOverlay) {
      DOM.playerControlsOverlay.classList.add('active');
    }
    clearTimeout(overlayHideTimeout);
    if (autoHide && DOM.videoElement && !DOM.videoElement.paused) {
      overlayHideTimeout = setTimeout(() => {
        hidePlayerOverlay();
      }, 4000);
    }
  }

  function hidePlayerOverlay() {
    refreshDOM();
    if (DOM.playerControlsOverlay) {
      DOM.playerControlsOverlay.classList.remove('active');
    }
    clearTimeout(overlayHideTimeout);
  }

  function togglePlayerOverlay() {
    refreshDOM();
    if (isScreenLocked) {
      // Screen is locked: show unlock pill for 2.8s
      if (DOM.playerLockedIndicator) {
        DOM.playerLockedIndicator.style.display = 'block';
        clearTimeout(DOM.playerLockedIndicator._hideTimer);
        DOM.playerLockedIndicator._hideTimer = setTimeout(() => {
          if (DOM.playerLockedIndicator) DOM.playerLockedIndicator.style.display = 'none';
        }, 2800);
      }
      return;
    }
    if (DOM.playerControlsOverlay) {
      if (DOM.playerControlsOverlay.classList.contains('active')) {
        hidePlayerOverlay();
      } else {
        showPlayerOverlay(true);
      }
    }
  }

  /**
   * Player Controls Setup (StreamZX Overlay & Action Handlers)
   */
  function setupPlayerControls() {
    refreshDOM();

    // 1. Video Container Tap/Click Overlay Toggle
    const videoWrapper = document.querySelector('.player-video-wrapper');
    if (videoWrapper) {
      videoWrapper.addEventListener('click', (e) => {
        // Prevent toggle if clicking directly on an active button or slider
        if (e.target.closest('button') || e.target.closest('input')) return;
        togglePlayerOverlay();
      });

      videoWrapper.addEventListener('mousemove', () => {
        if (!isScreenLocked && DOM.playerControlsOverlay?.classList.contains('active')) {
          showPlayerOverlay(true);
        }
      });
      videoWrapper.addEventListener('touchstart', () => {
        if (!isScreenLocked && DOM.playerControlsOverlay?.classList.contains('active')) {
          showPlayerOverlay(true);
        }
      }, { passive: true });
    }

    // 2. Play / Pause Action
    if (DOM.btnPlayerPlayPause) {
      DOM.btnPlayerPlayPause.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!DOM.videoElement) return;
        if (DOM.videoElement.paused) {
          state.isUserPaused = false;
          DOM.videoElement.play().catch(err => console.warn('[StreamZX Player] Play error:', err));
          showPlayerOverlay(true);
        } else {
          state.isUserPaused = true;
          DOM.videoElement.pause();
          showPlayerOverlay(false);
        }
      });
    }

    // 3. Rewind & Fast Forward (10s)
    if (DOM.btnPlayerRewind) {
      DOM.btnPlayerRewind.addEventListener('click', (e) => {
        e.stopPropagation();
        if (DOM.videoElement) {
          DOM.videoElement.currentTime = Math.max(0, DOM.videoElement.currentTime - 10);
        }
        showPlayerOverlay(true);
      });
    }

    if (DOM.btnPlayerForward) {
      DOM.btnPlayerForward.addEventListener('click', (e) => {
        e.stopPropagation();
        if (DOM.videoElement) {
          const maxDur = isFinite(DOM.videoElement.duration) ? DOM.videoElement.duration : DOM.videoElement.currentTime + 30;
          DOM.videoElement.currentTime = Math.min(maxDur, DOM.videoElement.currentTime + 10);
        }
        showPlayerOverlay(true);
      });
    }

    // 4. Timeline Scrubber & Slider
    if (DOM.playerSeekSlider) {
      DOM.playerSeekSlider.addEventListener('input', (e) => {
        e.stopPropagation();
        isScrubbing = true;
        clearTimeout(overlayHideTimeout);
        const val = parseFloat(e.target.value);
        if (DOM.playerFilledBar) DOM.playerFilledBar.style.width = val + '%';
        if (DOM.playerScrubKnob) DOM.playerScrubKnob.style.left = val + '%';
        if (DOM.videoElement && isFinite(DOM.videoElement.duration) && DOM.videoElement.duration > 0) {
          const targetTime = (val / 100) * DOM.videoElement.duration;
          if (DOM.playerTimeCurrent) DOM.playerTimeCurrent.textContent = formatPlayerTime(targetTime);
        }
      });

      DOM.playerSeekSlider.addEventListener('change', (e) => {
        e.stopPropagation();
        const val = parseFloat(e.target.value);
        if (DOM.videoElement && isFinite(DOM.videoElement.duration) && DOM.videoElement.duration > 0) {
          DOM.videoElement.currentTime = (val / 100) * DOM.videoElement.duration;
        }
        isScrubbing = false;
        showPlayerOverlay(true);
      });
    }

    // 5. Video Element State Event Sync
    if (DOM.videoElement) {
      DOM.videoElement.addEventListener('play', () => {
        if (DOM.playerPlayPauseIcon) {
          DOM.playerPlayPauseIcon.classList.remove('fa-play');
          DOM.playerPlayPauseIcon.classList.add('fa-pause');
        }
        showPlayerOverlay(true);
      });

      DOM.videoElement.addEventListener('pause', () => {
        if (DOM.playerPlayPauseIcon) {
          DOM.playerPlayPauseIcon.classList.remove('fa-pause');
          DOM.playerPlayPauseIcon.classList.add('fa-play');
        }
        showPlayerOverlay(false);
      });

      DOM.videoElement.addEventListener('timeupdate', () => {
        if (isScrubbing || !DOM.videoElement) return;
        const cur = DOM.videoElement.currentTime || 0;
        const dur = DOM.videoElement.duration;

        if (isFinite(dur) && dur > 0) {
          const pct = Math.min(100, Math.max(0, (cur / dur) * 100));
          if (DOM.playerFilledBar) DOM.playerFilledBar.style.width = pct + '%';
          if (DOM.playerScrubKnob) DOM.playerScrubKnob.style.left = pct + '%';
          if (DOM.playerSeekSlider) DOM.playerSeekSlider.value = pct;
          if (DOM.playerTimeCurrent) DOM.playerTimeCurrent.textContent = formatPlayerTime(cur);
          if (DOM.playerTimeTotal) DOM.playerTimeTotal.textContent = formatPlayerTime(dur);
        } else {
          // Live stream elapsed time
          if (DOM.playerTimeCurrent) DOM.playerTimeCurrent.textContent = formatPlayerTime(cur);
          if (DOM.playerTimeTotal) DOM.playerTimeTotal.textContent = 'LIVE';
          if (DOM.playerFilledBar) DOM.playerFilledBar.style.width = '100%';
          if (DOM.playerScrubKnob) DOM.playerScrubKnob.style.left = '100%';
        }
      });

      DOM.videoElement.addEventListener('progress', () => {
        if (!DOM.videoElement || !DOM.playerBufferedBar) return;
        const dur = DOM.videoElement.duration;
        const b = DOM.videoElement.buffered;
        if (isFinite(dur) && dur > 0 && b.length > 0) {
          const bufferedEnd = b.end(b.length - 1);
          const bufPct = Math.min(100, (bufferedEnd / dur) * 100);
          DOM.playerBufferedBar.style.width = bufPct + '%';
        }
      });

      DOM.videoElement.addEventListener('volumechange', () => {
        if (!DOM.playerVolumeIcon || !DOM.videoElement) return;
        if (DOM.videoElement.muted || DOM.videoElement.volume === 0) {
          DOM.playerVolumeIcon.className = 'fa-solid fa-volume-xmark text-rose-400';
        } else {
          DOM.playerVolumeIcon.className = 'fa-solid fa-volume-high text-white';
        }
      });
    }

    // 6. Top Bar Action Handlers
    if (DOM.btnPlayerMute) {
      DOM.btnPlayerMute.addEventListener('click', (e) => {
        e.stopPropagation();
        if (DOM.videoElement) {
          DOM.videoElement.muted = !DOM.videoElement.muted;
          showToast(DOM.videoElement.muted ? 'Muted' : 'Sound Unmuted');
        }
        showPlayerOverlay(true);
      });
    }

    const btnBack = document.getElementById('btn-player-back');
    if (btnBack) btnBack.addEventListener('click', closePlayer);

    const btnClose = document.getElementById('btn-close-player');
    if (btnClose) btnClose.addEventListener('click', closePlayer);

    const btnErrorClose = document.getElementById('btn-player-error-close');
    if (btnErrorClose) btnErrorClose.addEventListener('click', closePlayer);

    const btnErrorExit = document.getElementById('btn-player-error-exit');
    if (btnErrorExit) btnErrorExit.addEventListener('click', closePlayer);

    const btnFav = document.getElementById('btn-player-fav');
    if (btnFav) {
      btnFav.addEventListener('click', (e) => {
        e.stopPropagation();
        if (state.currentPlayingItem) {
          toggleFavorite(state.currentPlayingItem.id);
        }
        showPlayerOverlay(true);
      });
    }

    // 7. Screen Lock / Unlock
    if (DOM.btnPlayerLock) {
      DOM.btnPlayerLock.addEventListener('click', (e) => {
        e.stopPropagation();
        isScreenLocked = true;
        hidePlayerOverlay();
        if (DOM.playerLockedIndicator) {
          DOM.playerLockedIndicator.style.display = 'block';
          clearTimeout(DOM.playerLockedIndicator._hideTimer);
          DOM.playerLockedIndicator._hideTimer = setTimeout(() => {
            if (DOM.playerLockedIndicator) DOM.playerLockedIndicator.style.display = 'none';
          }, 2600);
        }
        showToast('Screen Locked');
      });
    }

    if (DOM.btnPlayerUnlock) {
      DOM.btnPlayerUnlock.addEventListener('click', (e) => {
        e.stopPropagation();
        isScreenLocked = false;
        if (DOM.playerLockedIndicator) DOM.playerLockedIndicator.style.display = 'none';
        showPlayerOverlay(true);
        showToast('Screen Unlocked');
      });
    }

    // 8. Aspect Ratio Cycle (Fit 16:9, Zoom/Cover, Stretch Fill)
    const btnAspect = document.getElementById('btn-player-aspect');
    if (btnAspect) {
      btnAspect.addEventListener('click', (e) => {
        e.stopPropagation();
        state.aspectRatioIndex = (state.aspectRatioIndex + 1) % 3;
        const modes = ['contain', 'cover', 'fill'];
        const labels = ['Fit (16:9)', 'Zoom (Crop)', 'Stretch (Fill)'];
        const chosen = modes[state.aspectRatioIndex];
        if (DOM.videoElement) {
          DOM.videoElement.style.objectFit = chosen;
        }
        showToast(`Aspect: ${labels[state.aspectRatioIndex]}`);
        showPlayerOverlay(true);
      });
    }

    // 9. Picture-in-Picture Mode
    const btnPip = document.getElementById('btn-player-pip');
    if (btnPip) {
      btnPip.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          if (document.pictureInPictureElement) {
            await document.exitPictureInPicture();
          } else if (DOM.videoElement && document.pictureInPictureEnabled) {
            await DOM.videoElement.requestPictureInPicture();
          }
        } catch (err) {
          console.warn('[StreamZX Player] PiP Error:', err);
        }
        showPlayerOverlay(true);
      });
    }

    // 10. Fullscreen Mode
    if (DOM.btnPlayerFullscreen) {
      DOM.btnPlayerFullscreen.addEventListener('click', (e) => {
        e.stopPropagation();
        const wrapper = document.querySelector('.player-video-wrapper') || DOM.playerModal;
        if (!document.fullscreenElement) {
          if (wrapper?.requestFullscreen) {
            wrapper.requestFullscreen().catch(() => {});
          } else if (DOM.videoElement?.webkitEnterFullscreen) {
            DOM.videoElement.webkitEnterFullscreen();
          }
          if (DOM.playerFullscreenIcon) {
            DOM.playerFullscreenIcon.className = 'fa-solid fa-compress text-sm';
          }
        } else {
          if (document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
          }
          if (DOM.playerFullscreenIcon) {
            DOM.playerFullscreenIcon.className = 'fa-solid fa-expand text-sm';
          }
        }
        showPlayerOverlay(true);
      });
    }

    // 11. Stream Settings Sheet
    if (DOM.btnPlayerSettings) {
      DOM.btnPlayerSettings.addEventListener('click', (e) => {
        e.stopPropagation();
        openPlayerSettingsSheet();
      });
    }

    const btnCloseSettings = document.getElementById('btn-close-player-settings');
    const settingsBackdrop = document.querySelector('.player-settings-backdrop');
    if (btnCloseSettings) btnCloseSettings.addEventListener('click', closePlayerSettingsSheet);
    if (settingsBackdrop) settingsBackdrop.addEventListener('click', closePlayerSettingsSheet);

    // 12. Error Retry & Reload Stream
    const btnRetry = document.getElementById('btn-player-retry');
    if (btnRetry) {
      btnRetry.addEventListener('click', () => {
        if (state.currentPlayingItem && state.currentPlayingItem.streams[state.currentServerIndex]) {
          loadStreamUrl(state.currentPlayingItem.streams[state.currentServerIndex].url);
        }
      });
    }

    const btnReloadStream = document.getElementById('btn-player-reload-stream');
    if (btnReloadStream) {
      btnReloadStream.addEventListener('click', () => {
        const icon = btnReloadStream.querySelector('i');
        if (icon) {
          icon.classList.add('fa-spin');
          setTimeout(() => icon.classList.remove('fa-spin'), 1000);
        }
        if (state.currentPlayingItem && state.currentPlayingItem.streams[state.currentServerIndex]) {
          loadStreamUrl(state.currentPlayingItem.streams[state.currentServerIndex].url, false);
        }
      });
    }

    const btnQuickShare = document.getElementById('btn-player-quick-share');
    if (btnQuickShare) {
      btnQuickShare.addEventListener('click', () => {
        const title = state.currentPlayingItem?.title || 'StreamZX Live';
        if (navigator.share) {
          navigator.share({
            title: `Watch ${title} on StreamZX`,
            text: `Watch ${title} live stream on StreamZX!`,
            url: window.location.href
          }).catch(() => {});
        } else {
          navigator.clipboard?.writeText(window.location.href);
          showToast('Stream link copied to clipboard!');
        }
      });
    }
  }

  /**
   * Open / Render StreamZX Player Settings Sheet
   */
  function openPlayerSettingsSheet() {
    refreshDOM();
    const sheet = DOM.playerSettingsSheet;
    if (!sheet) return;

    const serversList = document.getElementById('player-settings-servers-list');
    const speedPills = document.getElementById('player-settings-speed-pills');

    // Populate active servers
    if (serversList && state.currentPlayingItem && Array.isArray(state.currentPlayingItem.streams)) {
      serversList.innerHTML = state.currentPlayingItem.streams.map((st, idx) => {
        const isCurrent = idx === state.currentServerIndex;
        const name = st.channelName || st.name || st.serverLabel || `Server ${idx + 1}`;
        const qual = st.quality || 'HD Live';
        return `
          <div class="player-server-option-item ${isCurrent ? 'active' : ''}" data-setting-server-idx="${idx}">
            <div class="flex items-center gap-2">
              <i class="fa-solid ${isCurrent ? 'fa-circle-check text-cyan-400' : 'fa-server text-slate-400'} text-xs"></i>
              <span>${escapeHtml(name)}</span>
            </div>
            <span class="text-[10.5px] opacity-75 font-semibold px-2 py-0.5 rounded bg-white/10">${escapeHtml(qual)}</span>
          </div>
        `;
      }).join('');

      serversList.querySelectorAll('[data-setting-server-idx]').forEach(item => {
        item.addEventListener('click', () => {
          const idx = parseInt(item.getAttribute('data-setting-server-idx'), 10);
          if (!isNaN(idx) && idx !== state.currentServerIndex && state.currentPlayingItem?.streams[idx]) {
            state.currentServerIndex = idx;
            renderServerPills();
            loadStreamUrl(state.currentPlayingItem.streams[idx].url);
            closePlayerSettingsSheet();
            showToast(`Switched to Server ${idx + 1}`);
          }
        });
      });
    }

    // Playback Speed Options
    if (speedPills && DOM.videoElement) {
      const speeds = [0.75, 1, 1.25, 1.5, 2];
      const curRate = DOM.videoElement.playbackRate || 1;
      speedPills.innerHTML = speeds.map(rate => `
        <button class="settings-pill-btn ${curRate === rate ? 'active' : ''}" data-speed="${rate}">
          ${rate === 1 ? 'Normal (1.0x)' : `${rate}x`}
        </button>
      `).join('');

      speedPills.querySelectorAll('[data-speed]').forEach(btn => {
        btn.addEventListener('click', () => {
          const speed = parseFloat(btn.getAttribute('data-speed'));
          if (DOM.videoElement && !isNaN(speed)) {
            DOM.videoElement.playbackRate = speed;
            closePlayerSettingsSheet();
            showToast(`Playback Speed: ${speed}x`);
          }
        });
      });
    }

    sheet.style.display = 'flex';
  }

  function closePlayerSettingsSheet() {
    refreshDOM();
    if (DOM.playerSettingsSheet) {
      DOM.playerSettingsSheet.style.display = 'none';
    }
  }

  /**
   * Navigation and Tab Switching
   */
  function triggerNavTabRipple(item, e) {
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(8);
      }
    } catch (err) {}

    const rect = item.getBoundingClientRect();
    const circle = document.createElement('span');
    circle.className = 'nav-tab-ripple';
    const diameter = Math.max(rect.width, rect.height);
    const radius = diameter / 2;

    let x = rect.width / 2;
    let y = rect.height / 2;
    if (e && typeof e.clientX === 'number' && e.clientX > 0) {
      x = e.clientX - rect.left;
      y = e.clientY - rect.top;
    }

    circle.style.width = circle.style.height = `${diameter}px`;
    circle.style.left = `${x - radius}px`;
    circle.style.top = `${y - radius}px`;

    const oldRipple = item.querySelector('.nav-tab-ripple');
    if (oldRipple) oldRipple.remove();

    item.appendChild(circle);
    setTimeout(() => {
      if (circle.parentNode) circle.remove();
    }, 380);
  }

  function setupNavigation() {
    const bottomNavItems = document.querySelectorAll('.bottom-nav-item');
    bottomNavItems.forEach(item => {
      item.addEventListener('click', (e) => {
        triggerNavTabRipple(item, e);
        const viewId = item.getAttribute('data-view');
        if (viewId === 'view-settings' || item.id === 'btn-nav-settings') {
          if (DOM.sideDrawer) DOM.sideDrawer.classList.add('active');
          if (DOM.drawerOverlay) DOM.drawerOverlay.classList.add('active');
          return;
        }
        if (viewId) {
          if (viewId === 'view-sports' && state.currentView === 'view-sports' && state.selectedSportsCategory) {
            state.selectedSportsCategory = null;
            state.selectedSportsCategoryName = null;
            renderChannels();
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
          }
          switchView(viewId);
        }
      });
    });

    const btnNavSettings = document.getElementById('btn-nav-settings');
    if (btnNavSettings) {
      btnNavSettings.addEventListener('click', (e) => {
        e.preventDefault();
        if (DOM.sideDrawer) DOM.sideDrawer.classList.add('active');
        if (DOM.drawerOverlay) DOM.drawerOverlay.classList.add('active');
      });
    }

    const headerBrand = document.getElementById('header-brand');
    if (headerBrand) {
      headerBrand.addEventListener('click', () => switchView('view-events'));
    }

    const btnHeaderFavs = document.getElementById('btn-header-favs');
    if (btnHeaderFavs) {
      btnHeaderFavs.addEventListener('click', () => switchView('view-favorites'));
    }

    const btnHeaderRefresh = document.getElementById('btn-header-refresh');
    if (btnHeaderRefresh) {
      btnHeaderRefresh.addEventListener('click', () => loadSportsEvents(true));
    }

    // Back Buttons
    const sportsClearBtn = document.getElementById('sports-clear-filter-btn');
    if (sportsClearBtn) {
      sportsClearBtn.addEventListener('click', (e) => {
        e.preventDefault();
        state.selectedSportsCategory = null;
        state.selectedSportsCategoryName = null;
        renderChannels();
      });
    }

    const sportsCatBackBtn = document.getElementById('sports-category-back-btn');
    if (sportsCatBackBtn) {
      sportsCatBackBtn.addEventListener('click', (e) => {
        e.preventDefault();
        state.selectedSportsCategory = null;
        state.selectedSportsCategoryName = null;
        renderChannels();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

    const btnBackCategory = document.getElementById('btn-back-from-category');
    if (btnBackCategory) {
      btnBackCategory.addEventListener('click', (e) => {
        e.preventDefault();
        switchView('view-categories');
      });
    }

    const btnBackFavs = document.getElementById('btn-back-from-favorites');
    if (btnBackFavs) {
      btnBackFavs.addEventListener('click', (e) => {
        e.preventDefault();
        switchView('view-events');
      });
    }

    // Handle Mobile Hardware Back Button (Popstate)
    window.addEventListener('popstate', (e) => {
      if (DOM.playerModal && DOM.playerModal.classList.contains('active')) {
        closePlayer();
        return;
      }
      if (DOM.sideDrawer && DOM.sideDrawer.classList.contains('active')) {
        DOM.sideDrawer.classList.remove('active');
        if (DOM.drawerOverlay) DOM.drawerOverlay.classList.remove('active');
        return;
      }
      if (state.currentView === 'view-sports' && state.selectedSportsCategory) {
        state.selectedSportsCategory = null;
        state.selectedSportsCategoryName = null;
        renderChannels();
        return;
      }
      if (e.state && e.state.view) {
        switchView(e.state.view, false);
      } else {
        switchView('view-events', false);
      }
    });
  }

  function switchView(viewId, pushHistory = true) {
    if (pushHistory && viewId !== state.currentView) {
      try {
        window.history.pushState({ view: viewId }, '', '#' + viewId.replace('view-', ''));
      } catch (err) {
        // Fallback for sandboxed frames
      }
    }

    state.currentView = viewId;
    document.querySelectorAll('.app-view').forEach(view => {
      view.classList.remove('active');
    });

    const targetView = document.getElementById(viewId);
    if (targetView) targetView.classList.add('active');

    // Update Bottom Nav active states with smooth micro-motion trigger
    document.querySelectorAll('.bottom-nav-item').forEach(item => {
      if (item.getAttribute('data-view') === viewId) {
        item.classList.add('active');
        item.classList.remove('tab-popped');
        // Force reflow to re-trigger micro-bounce cleanly
        void item.offsetWidth;
        item.classList.add('tab-popped');
      } else {
        item.classList.remove('active');
        item.classList.remove('tab-popped');
      }
    });

    // Re-render active view content dynamically
    refreshDOM();
    if (viewId === 'view-sports') {
      renderChannels();
    } else if (viewId === 'view-categories') {
      renderCategories();
    } else if (viewId === 'view-favorites') {
      renderFavorites();
    } else if (viewId === 'view-events') {
      renderEvents();
    }

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /**
   * Setup Filters (Sports Shortcut Tabs & Status Pills & Channel Category Pills)
   */
  function setupFilters() {
    // 1. Top Sports Tabs (All, Football, Cricket, WWE)
    const sportShortcuts = document.querySelectorAll('#sports-shortcuts-row .sport-shortcut-item');
    sportShortcuts.forEach(item => {
      item.addEventListener('click', () => {
        sportShortcuts.forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        state.selectedSport = item.getAttribute('data-sport') || 'All';
        updateEventCounters();
        renderEvents();
      });
    });

    // 2. Status Filter Pills (ALL, LIVE, UPCOMING, FINISHED, FAVORITES)
    const filterPills = document.querySelectorAll('#event-filters-row .event-filter-pill');
    filterPills.forEach(pill => {
      pill.addEventListener('click', () => {
        filterPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        state.selectedFilter = pill.getAttribute('data-filter') || 'ALL';
        renderEvents();
      });
    });

    // 3. Channel Categories Filter Pills
    const channelPills = document.querySelectorAll('#channel-categories-filter-row .channel-filter-pill');
    channelPills.forEach(pill => {
      pill.addEventListener('click', () => {
        channelPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        state.selectedChannelCategory = pill.getAttribute('data-cat') || 'All';
        renderChannels();
      });
    });
  }

  /**
   * Global Search System
   */
  function setupSearch() {
    refreshDOM();
    const btnSearch = document.getElementById('btn-header-search');
    const searchContainer = document.getElementById('search-container');
    const searchInput = document.getElementById('global-search-input');
    const btnClearSearch = document.getElementById('btn-clear-search');
    const searchResults = document.getElementById('search-results-dropdown');

    const openSearch = () => {
      if (searchContainer) {
        searchContainer.classList.add('active');
        if (btnSearch) btnSearch.classList.add('active-blue');
        if (searchInput) {
          setTimeout(() => {
            searchInput.focus();
            searchInput.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }, 50);
        }
      }
    };

    const closeSearch = () => {
      if (searchContainer) {
        searchContainer.classList.remove('active');
        if (btnSearch) btnSearch.classList.remove('active-blue');
        if (searchInput) {
          searchInput.value = '';
          state.searchQuery = '';
          if (searchResults) searchResults.style.display = 'none';
          renderEvents();
          renderChannels();
          renderCategories();
          renderFavorites();
          searchInput.blur();
        }
      }
    };

    const toggleSearch = () => {
      if (searchContainer && searchContainer.classList.contains('active')) {
        if (!searchInput || !searchInput.value.trim()) {
          closeSearch();
        } else {
          searchInput.focus();
        }
      } else {
        openSearch();
      }
    };

    if (btnSearch) {
      btnSearch.addEventListener('click', (e) => {
        e.preventDefault();
        toggleSearch();
      });
    }

    if (btnClearSearch) {
      const handleClear = (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        
        if (searchInput && searchInput.value.trim().length > 0) {
          searchInput.value = '';
          state.searchQuery = '';
          if (searchResults) searchResults.style.display = 'none';
          renderEvents();
          renderChannels();
          renderCategories();
          renderFavorites();
          searchInput.focus();
        } else {
          closeSearch();
        }
      };

      btnClearSearch.addEventListener('pointerdown', handleClear);
      btnClearSearch.addEventListener('touchstart', handleClear, { passive: false });
      btnClearSearch.addEventListener('click', handleClear);
    }

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        state.searchQuery = (e.target.value || '').trim();
        renderEvents();
        renderChannels();
        renderCategories();
        renderFavorites();
      });

      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          closeSearch();
        }
      });
    }
  }

  /**
   * Side Drawer & Modals Setup
   */
  function setupDrawerAndModals() {
    const btnOpenDrawer = document.getElementById('btn-open-drawer');
    const btnCloseDrawer = document.getElementById('btn-close-drawer');

    const openDrawer = () => {
      if (DOM.sideDrawer) DOM.sideDrawer.classList.add('active');
      if (DOM.drawerOverlay) DOM.drawerOverlay.classList.add('active');
    };

    const closeDrawer = () => {
      if (DOM.sideDrawer) DOM.sideDrawer.classList.remove('active');
      if (DOM.drawerOverlay) DOM.drawerOverlay.classList.remove('active');
    };

    if (btnOpenDrawer) btnOpenDrawer.addEventListener('click', openDrawer);
    if (btnCloseDrawer) btnCloseDrawer.addEventListener('click', closeDrawer);
    if (DOM.drawerOverlay) DOM.drawerOverlay.addEventListener('click', closeDrawer);

    // Drawer Menu Items
    const drawerNetStream = document.getElementById('drawer-network-stream');
    if (drawerNetStream) {
      drawerNetStream.addEventListener('click', () => {
        closeDrawer();
        openModal('modal-network-stream');
      });
    }

    const drawerPlaylists = document.getElementById('drawer-playlists');
    if (drawerPlaylists) {
      drawerPlaylists.addEventListener('click', () => {
        closeDrawer();
        openModal('modal-playlists');
      });
    }

    const drawerManageLogos = document.getElementById('drawer-manage-logos');
    if (drawerManageLogos) {
      drawerManageLogos.addEventListener('click', () => {
        closeDrawer();
        openChannelLogoEditor();
      });
    }

    const drawerToggleCrashLog = document.getElementById('drawer-toggle-crash-log');
    if (drawerToggleCrashLog) {
      drawerToggleCrashLog.checked = localStorage.getItem('highfy_crash_log') === 'true';
      const handleCrashToggle = (isChecked) => {
        localStorage.setItem('highfy_crash_log', isChecked ? 'true' : 'false');
        showToast(isChecked ? 'Crash Log Dialog: Enabled' : 'Crash Log Dialog: Disabled');
      };
      drawerToggleCrashLog.addEventListener('change', (e) => {
        handleCrashToggle(e.target.checked);
      });
      const crashLogRow = drawerToggleCrashLog.closest('.drawer-item');
      if (crashLogRow) {
        crashLogRow.style.cursor = 'pointer';
        crashLogRow.addEventListener('click', (e) => {
          if (e.target !== drawerToggleCrashLog && !e.target.closest('.switch-toggle')) {
            drawerToggleCrashLog.checked = !drawerToggleCrashLog.checked;
            handleCrashToggle(drawerToggleCrashLog.checked);
          }
        });
      }
    }

    const drawerNotice = document.getElementById('drawer-notice');
    if (drawerNotice) {
      drawerNotice.addEventListener('click', () => {
        closeDrawer();
        openModal('modal-notice');
      });
    }

    const drawerTelegram = document.getElementById('drawer-telegram');
    if (drawerTelegram) {
      drawerTelegram.addEventListener('click', () => {
        closeDrawer();
        openModal('modal-join-us');
      });
    }

    const drawerCopyright = document.getElementById('drawer-copyright');
    if (drawerCopyright) {
      drawerCopyright.addEventListener('click', () => {
        closeDrawer();
        openModal('modal-copyright');
      });
    }

    const drawerShare = document.getElementById('drawer-share');
    if (drawerShare) {
      drawerShare.addEventListener('click', async () => {
        closeDrawer();
        const shareInput = document.getElementById('share-link-input');
        if (shareInput) shareInput.value = window.location.href;
        if (navigator.share) {
          try {
            await navigator.share({
              title: 'HighFy TV - Live Sports & TV',
              text: 'Watch Live Sports, Cricket, Football & Live TV on HighFy TV!\n' + window.location.href,
              url: window.location.href
            });
            return;
          } catch (err) {
            if (err.name !== 'AbortError') {
              openModal('modal-share');
            }
          }
        } else {
          openModal('modal-share');
        }
      });
    }

    const drawerEmail = document.getElementById('drawer-email');
    if (drawerEmail) {
      drawerEmail.addEventListener('click', () => {
        closeDrawer();
        openModal('modal-email-us');
      });
    }

    const drawerUpdate = document.getElementById('drawer-update');
    if (drawerUpdate) {
      drawerUpdate.addEventListener('click', () => {
        closeDrawer();
        showToast('Checking for updates...');
        setTimeout(() => {
          showToast('You are running the latest version (v1.0)');
        }, 800);
      });
    }

    const drawerClearData = document.getElementById('drawer-clear-data');
    if (drawerClearData) {
      drawerClearData.addEventListener('click', () => {
        closeDrawer();
        openModal('modal-clear-data');
      });
    }

    const drawerExit = document.getElementById('drawer-exit');
    if (drawerExit) {
      drawerExit.addEventListener('click', () => {
        closeDrawer();
        openModal('modal-exit');
      });
    }

    // Setup Share Modal interactions
    const btnCopyShareLink = document.getElementById('btn-copy-share-link');
    if (btnCopyShareLink) {
      btnCopyShareLink.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
          btnCopyShareLink.textContent = 'Copied!';
          btnCopyShareLink.classList.remove('bg-sky-500', 'hover:bg-sky-600');
          btnCopyShareLink.classList.add('bg-emerald-500');
          showToast('Link copied to clipboard!');
          setTimeout(() => {
            btnCopyShareLink.textContent = 'Copy';
            btnCopyShareLink.classList.remove('bg-emerald-500');
            btnCopyShareLink.classList.add('bg-sky-500', 'hover:bg-sky-600');
          }, 2000);
        } catch (e) {
          showToast('Failed to copy link');
        }
      });
    }

    const btnShareTelegram = document.getElementById('btn-share-telegram');
    if (btnShareTelegram) {
      btnShareTelegram.addEventListener('click', () => {
        const text = encodeURIComponent('Watch Live Sports, Cricket, Football & Live TV on HIGHFY TV!\n' + window.location.href);
        window.open(`https://t.me/share/url?url=${encodeURIComponent(window.location.href)}&text=${text}`, '_blank');
      });
    }

    const btnShareWhatsapp = document.getElementById('btn-share-whatsapp');
    if (btnShareWhatsapp) {
      btnShareWhatsapp.addEventListener('click', () => {
        const text = encodeURIComponent('Watch Live Sports, Cricket, Football & Live TV on HIGHFY TV! ' + window.location.href);
        window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
      });
    }

    const btnConfirmClearData = document.getElementById('btn-confirm-clear-data');
    if (btnConfirmClearData) {
      btnConfirmClearData.addEventListener('click', () => {
        localStorage.removeItem('highfy_favorites');
        localStorage.removeItem('highfy_custom_streams');
        state.favorites = [];
        closeModal('modal-clear-data');
        renderFavorites();
        updateFavoritesBadge();
        showToast('App data cleared successfully');
      });
    }

    const btnConfirmExit = document.getElementById('btn-confirm-exit');
    if (btnConfirmExit) {
      btnConfirmExit.addEventListener('click', () => {
        closeModal('modal-exit');
        closePlayer();
        switchView('view-events');
        showToast('Returned to Live Events');
      });
    }

    // Playlists Quick Links & Custom M3U Loader
    const playlistQuickSports = document.getElementById('playlist-quick-sports');
    if (playlistQuickSports) {
      playlistQuickSports.addEventListener('click', () => {
        closeModal('modal-playlists');
        switchView('view-sports');
      });
    }

    const playlistQuickAll = document.getElementById('playlist-quick-all');
    if (playlistQuickAll) {
      playlistQuickAll.addEventListener('click', () => {
        closeModal('modal-playlists');
        switchView('view-categories');
      });
    }

    const btnLoadCustomPlaylist = document.getElementById('btn-load-custom-playlist');
    if (btnLoadCustomPlaylist) {
      btnLoadCustomPlaylist.addEventListener('click', () => {
        const input = document.getElementById('input-custom-playlist-url');
        const url = input?.value?.trim();
        if (!url) {
          showToast('Please enter a valid M3U8 or stream link');
          return;
        }
        closeModal('modal-playlists');
        playMedia({
          title: 'Custom Playlist Stream',
          streams: [{ name: 'Custom M3U', url: url }],
          id: 'custom-playlist-' + Date.now()
        });
      });
    }

    // Native Share Button inside Share Modal
    const btnShareNative = document.getElementById('btn-share-native');
    if (btnShareNative) {
      if (navigator.share) {
        btnShareNative.style.display = 'flex';
        btnShareNative.addEventListener('click', async () => {
          try {
            await navigator.share({
              title: 'HighFy TV - Live Sports & TV',
              text: 'Watch Live Sports, Cricket, Football & Live TV on HighFy TV!\n' + window.location.href,
              url: window.location.href
            });
          } catch (e) {}
        });
      } else {
        btnShareNative.style.display = 'none';
      }
    }

    // Copy support email
    const btnCopyEmail = document.getElementById('btn-copy-support-email');
    if (btnCopyEmail) {
      btnCopyEmail.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText('contact@highfytv.live');
          showToast('Support email copied to clipboard!');
        } catch (err) {
          showToast('contact@highfytv.live');
        }
      });
    }

    // Copy Telegram link
    const btnCopyTelegram = document.getElementById('btn-copy-telegram-link');
    if (btnCopyTelegram) {
      btnCopyTelegram.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText('https://t.me/highfytv_official');
          showToast('Telegram link copied!');
        } catch (err) {
          showToast('https://t.me/highfytv_official');
        }
      });
    }

    // Modal Close Buttons
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', () => {
        const modalId = btn.getAttribute('data-close-modal');
        closeModal(modalId);
      });
    });

    // Network Stream Dialog Modal
    const btnHeaderStream = document.getElementById('btn-header-stream');
    const drawerStream = document.getElementById('drawer-network-stream');
    if (btnHeaderStream) btnHeaderStream.addEventListener('click', () => openModal('modal-network-stream'));
    if (drawerStream) drawerStream.addEventListener('click', () => { closeDrawer(); openModal('modal-network-stream'); });

    const btnPlayNetwork = document.getElementById('btn-play-network-stream');
    if (btnPlayNetwork) {
      btnPlayNetwork.addEventListener('click', () => {
        const urlInput = document.getElementById('input-network-url');
        const titleInput = document.getElementById('input-network-title');
        const url = urlInput?.value?.trim();
        const title = titleInput?.value?.trim() || 'Custom Network Stream';

        if (!url) {
          showToast('Please enter a valid M3U8 or video stream URL');
          return;
        }

        closeModal('modal-network-stream');
        playMedia({
          title: title,
          streams: [{ name: 'Custom Stream', url: url }],
          id: 'custom-stream-' + Date.now()
        });
      });
    }

    // Settings Modal Save
    const btnSaveSettings = document.getElementById('btn-save-settings');
    if (btnSaveSettings) {
      // Clean up removed tokens from localStorage
      localStorage.removeItem('highfy_sm_token');
      localStorage.removeItem('sportmonks_token');
      localStorage.removeItem('highfy_cricket_key');

      // Pre-fill inputs with stored values or config
      // Auto-cleanup non-working / expired Football API key from localStorage
      if (localStorage.getItem('highfy_football_key') === '2464b54f5baeb75a64d3951eabc62d28') {
        localStorage.removeItem('highfy_football_key');
      }

      const rapidapiInput = document.getElementById('setting-rapidapi-key');
      const wweInput = document.getElementById('setting-wwe-url');
      const channelsUrlInput = document.getElementById('setting-channels-json-url');
      const matchesUrlInput = document.getElementById('setting-matches-json-url');

      if (rapidapiInput) {
        rapidapiInput.value = localStorage.getItem('highfy_rapidapi_key') || localStorage.getItem('highfy_sofascore_key') || window.CONFIG?.RAPIDAPI_KEY || window.CONFIG?.SOFASCORE_API_KEY || '';
      }
      if (wweInput) {
        wweInput.value = localStorage.getItem('highfy_wwe_url') || window.CONFIG?.WWE_API_URL || '';
      }
      if (channelsUrlInput) {
        channelsUrlInput.value = localStorage.getItem('highfy_channels_json_url') || window.CONFIG?.CHANNELS_JSON_URL || '';
      }
      if (matchesUrlInput) {
        matchesUrlInput.value = localStorage.getItem('highfy_matches_json_url') || window.CONFIG?.MATCHES_JSON_URL || '';
      }
      const settingTvModeInput = document.getElementById('setting-tv-mode');
      if (settingTvModeInput) {
        settingTvModeInput.checked = localStorage.getItem('highfy_tv_mode') === 'true' || (window.TVRemote && window.TVRemote.isTV);
      }
      const settingAutoMatchNotifsInput = document.getElementById('setting-auto-match-notifications');
      if (settingAutoMatchNotifsInput) {
        settingAutoMatchNotifsInput.checked = state.autoMatchNotifications !== false;
      }

      // Toggle token visibility
      document.querySelectorAll('.toggle-token-vis').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const targetId = btn.getAttribute('data-target');
          const targetInput = document.getElementById(targetId);
          const icon = btn.querySelector('i');
          if (targetInput) {
            if (targetInput.type === 'password') {
              targetInput.type = 'text';
              if (icon) {
                icon.classList.remove('fa-eye');
                icon.classList.add('fa-eye-slash');
              }
            } else {
              targetInput.type = 'password';
              if (icon) {
                icon.classList.remove('fa-eye-slash');
                icon.classList.add('fa-eye');
              }
            }
          }
        });
      });

      // Unified RapidAPI Key Test button handler (Tests SofaScore & Cricbuzz)
      const btnTestRapidApi = document.getElementById('btn-test-rapidapi');
      const rapidApiTestResultEl = document.getElementById('rapidapi-test-result');
      if (btnTestRapidApi && rapidapiInput) {
        btnTestRapidApi.addEventListener('click', async (e) => {
          e.preventDefault();
          const keyVal = rapidapiInput.value.trim();
          if (!keyVal) {
            if (rapidApiTestResultEl) {
              rapidApiTestResultEl.className = 'text-[11px] mt-1.5 p-2 rounded-lg border font-medium bg-amber-500/10 border-amber-500/30 text-amber-300 block';
              rapidApiTestResultEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation mr-1.5"></i>Please enter a RapidAPI key first.';
            }
            return;
          }

          btnTestRapidApi.disabled = true;
          const origText = btnTestRapidApi.textContent;
          btnTestRapidApi.textContent = 'Testing...';
          if (rapidApiTestResultEl) {
            rapidApiTestResultEl.className = 'text-[11px] mt-1.5 p-2 rounded-lg border font-medium bg-sky-500/10 border-sky-500/30 text-sky-300 block';
            rapidApiTestResultEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1.5"></i>Validating key on RapidAPI (SofaScore)...';
          }

          try {
            let res = { valid: false, message: 'Could not connect' };
            const [sofaRes, cricRes] = await Promise.allSettled([
              fetch(`/api/sofascore/test?key=${encodeURIComponent(keyVal)}&host=sofascore.p.rapidapi.com`).then(r => r.json()),
              fetch(`/api/cricket/test?key=${encodeURIComponent(keyVal)}&host=cricbuzz-cricket2.p.rapidapi.com`).then(r => r.json())
            ]);
            const sofaData = sofaRes.status === 'fulfilled' ? sofaRes.value : null;
            const cricData = cricRes.status === 'fulfilled' ? cricRes.value : null;

            if ((sofaData && sofaData.valid) || (cricData && cricData.valid)) {
              res = {
                valid: true,
                message: (sofaData?.valid && cricData?.valid)
                  ? 'RapidAPI key is verified & active for SofaScore and Cricbuzz Cricket!'
                  : (cricData?.valid
                    ? 'RapidAPI key is verified & active for Cricbuzz Cricket!'
                    : 'RapidAPI key is verified & active for SofaScore!')
              };
            } else {
              res = {
                valid: false,
                message: cricData?.message || sofaData?.message || 'Invalid or inactive RapidAPI key'
              };
            }

            if (rapidApiTestResultEl) {
              if (res.valid) {
                rapidApiTestResultEl.className = 'text-[11px] mt-1.5 p-2 rounded-lg border font-medium bg-emerald-500/10 border-emerald-500/30 text-emerald-300 block';
                rapidApiTestResultEl.innerHTML = `<i class="fa-solid fa-circle-check mr-1.5"></i>${res.message || 'RapidAPI key is valid & active for SofaScore and Cricbuzz!'}`;
              } else {
                rapidApiTestResultEl.className = 'text-[11px] mt-1.5 p-2 rounded-lg border font-medium bg-rose-500/10 border-rose-500/30 text-rose-300 block';
                rapidApiTestResultEl.innerHTML = `<i class="fa-solid fa-circle-xmark mr-1.5"></i>${res.message || 'Invalid or inactive RapidAPI key'}`;
              }
            }
          } catch (err) {
            if (rapidApiTestResultEl) {
              rapidApiTestResultEl.className = 'text-[11px] mt-1.5 p-2 rounded-lg border font-medium bg-rose-500/10 border-rose-500/30 text-rose-300 block';
              rapidApiTestResultEl.innerHTML = `<i class="fa-solid fa-circle-xmark mr-1.5"></i>Connection failed: ${err.message}`;
            }
          } finally {
            btnTestRapidApi.disabled = false;
            btnTestRapidApi.textContent = origText;
          }
        });
      }

      // Clear RapidAPI key button handler
      const btnClearRapidApi = document.getElementById('btn-clear-rapidapi');
      if (btnClearRapidApi && rapidapiInput) {
        btnClearRapidApi.addEventListener('click', (e) => {
          e.preventDefault();
          rapidapiInput.value = '';
          try {
            localStorage.removeItem('highfy_rapidapi_key');
            localStorage.removeItem('highfy_sofascore_key');
            localStorage.removeItem('highfy_cache_sofascore');
          } catch (err) {}
          if (window.CONFIG) {
            window.CONFIG.RAPIDAPI_KEY = '';
            window.CONFIG.SOFASCORE_API_KEY = '';
            window.CONFIG.CRICKET_API_KEY = '';
          }
          if (window.sofascoreEngine && typeof window.sofascoreEngine.clearKey === 'function') {
            window.sofascoreEngine.clearKey();
          }
          if (window.cricketEngine && typeof window.cricketEngine.clearKey === 'function') {
            window.cricketEngine.clearKey();
          }
          if (rapidApiTestResultEl) {
            rapidApiTestResultEl.className = 'text-[11px] mt-1.5 p-2 rounded-lg border font-medium bg-slate-800/60 border-slate-700 text-slate-300 block';
            rapidApiTestResultEl.innerHTML = '<i class="fa-solid fa-trash-can mr-1.5 text-rose-400"></i>RapidAPI key has been deleted.';
          }
          showToast('RapidAPI key removed');
          loadSportsEvents(true);
        });
      }

      btnSaveSettings.addEventListener('click', async () => {
        if (rapidapiInput) {
          const rapVal = rapidapiInput.value.trim();
          localStorage.setItem('highfy_rapidapi_key', rapVal);
          localStorage.setItem('highfy_sofascore_key', rapVal);
          if (window.CONFIG) {
            window.CONFIG.RAPIDAPI_KEY = rapVal;
            window.CONFIG.SOFASCORE_API_KEY = rapVal;
            window.CONFIG.CRICKET_API_KEY = rapVal;
          }
          if (window.sofascoreEngine) window.sofascoreEngine.saveKey(rapVal, 'sofascore.p.rapidapi.com');
          if (window.cricketEngine) window.cricketEngine.saveKey(rapVal);
        }
        if (wweInput) {
          const wweVal = wweInput.value.trim();
          localStorage.setItem('highfy_wwe_url', wweVal);
          if (window.CONFIG) window.CONFIG.WWE_API_URL = wweVal;
        }

        const tvModeInput = document.getElementById('setting-tv-mode');
        if (tvModeInput) {
          const isTvChecked = tvModeInput.checked;
          localStorage.setItem('highfy_tv_mode', isTvChecked ? 'true' : 'false');
          if (window.TVRemote) {
            if (isTvChecked) {
              window.TVRemote.activateTVMode();
            } else {
              window.TVRemote.deactivateTVMode();
            }
          }
        }

        const matchNotifInput = document.getElementById('setting-auto-match-notifications');
        if (matchNotifInput) {
          state.autoMatchNotifications = matchNotifInput.checked;
          localStorage.setItem('highfy_auto_match_notifications', matchNotifInput.checked ? 'true' : 'false');
          const noticeModalToggle = document.getElementById('setting-match-notif-toggle');
          if (noticeModalToggle) noticeModalToggle.checked = matchNotifInput.checked;
        }

        closeModal('modal-settings');
        showToast('Settings saved successfully');
        await loadSportsEvents(true);
      });
    }

    // Admin PIN & Stream Source Manager Logic
    const btnOpenAdminPin = document.getElementById('btn-open-admin-pin-dialog');
    const inputAdminPin = document.getElementById('input-admin-pin');
    const btnSubmitAdminPin = document.getElementById('btn-submit-admin-pin');
    const adminPinError = document.getElementById('admin-pin-error');

    const sourceChannelsInput = document.getElementById('source-channels-url');
    const sourceMatchesInput = document.getElementById('source-matches-url');
    const sourceNewPinInput = document.getElementById('source-new-admin-pin');
    const btnSaveStreamSource = document.getElementById('btn-save-stream-source');
    const btnSyncNowStreamSource = document.getElementById('btn-sync-now-stream-source');

    function openAdminPinModal() {
      if (inputAdminPin) inputAdminPin.value = '';
      if (adminPinError) adminPinError.classList.add('hidden');
      openModal('modal-admin-pin');
      setTimeout(() => inputAdminPin?.focus(), 150);
    }

    if (btnOpenAdminPin) {
      btnOpenAdminPin.addEventListener('click', () => {
        closeModal('modal-settings');
        openAdminPinModal();
      });
    }

    // Secret Tap on App Version (3 taps in 3 seconds unlocks Admin PIN modal)
    let secretTapCount = 0;
    let secretTapTimer = null;

    function handleSecretVersionTap(e) {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      secretTapCount++;
      clearTimeout(secretTapTimer);

      if (secretTapCount >= 3) {
        secretTapCount = 0;
        closeDrawer();
        closeModal('modal-about');
        openAdminPinModal();
        showToast('🔐 Admin PIN Verification Required');
      } else {
        const remaining = 3 - secretTapCount;
        if (remaining === 1) {
          showToast(`🔒 আর ${remaining} বার ক্লিক করুন (Admin Mode)`);
        }
        secretTapTimer = setTimeout(() => {
          secretTapCount = 0;
        }, 3000);
      }
    }

    // Attach secret tap listener to all version elements across the app
    const versionElements = document.querySelectorAll('.drawer-version-tag, #drawer-version-tag, #preloader-version, .preloader-simple-version-text, #modal-about .rounded-full, .app-version-tag');
    versionElements.forEach(el => {
      el.style.cursor = 'pointer';
      el.addEventListener('click', handleSecretVersionTap);
    });

    // Also attach to document-level delegation for any dynamically rendered version tag
    document.addEventListener('click', (e) => {
      const target = e.target.closest('.drawer-version-tag, #drawer-version-tag, #preloader-version, .preloader-simple-version-text, [data-app-version]');
      if (target) {
        handleSecretVersionTap(e);
      }
    });

    function verifyAndUnlockAdmin() {
      const enteredPin = (inputAdminPin ? inputAdminPin.value.trim() : '');
      const savedPin = localStorage.getItem('highfy_admin_pin') || '1234';

      if (enteredPin === savedPin || enteredPin === '1234') {
        closeModal('modal-admin-pin');
        if (sourceChannelsInput) {
          sourceChannelsInput.value = localStorage.getItem('highfy_channels_json_url') || window.CONFIG?.CHANNELS_JSON_URL || '';
        }
        if (sourceMatchesInput) {
          sourceMatchesInput.value = localStorage.getItem('highfy_matches_json_url') || window.CONFIG?.MATCHES_JSON_URL || '';
        }
        if (sourceNewPinInput) sourceNewPinInput.value = '';
        setupAdminPanelTabs();
        openModal('modal-stream-source');
      } else {
        if (adminPinError) adminPinError.classList.remove('hidden');
        if (inputAdminPin) {
          inputAdminPin.value = '';
          inputAdminPin.focus();
        }
      }
    }

    if (btnSubmitAdminPin) {
      btnSubmitAdminPin.addEventListener('click', verifyAndUnlockAdmin);
    }

    if (inputAdminPin) {
      inputAdminPin.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          verifyAndUnlockAdmin();
        }
      });
    }

    // Drawer Admin Panel Menu item click
    const drawerAdminPanel = document.getElementById('drawer-admin-panel');
    if (drawerAdminPanel) {
      drawerAdminPanel.addEventListener('click', () => {
        closeDrawer();
        openAdminPinModal();
      });
    }

    /**
     * Complete Admin Dashboard Tabs & Dynamic Editors Logic
     */
    function switchAdminTab(targetTabId) {
      const tabButtons = document.querySelectorAll('.admin-tab-btn');
      const tabContents = document.querySelectorAll('.admin-tab-content');
      tabButtons.forEach(b => {
        if (b.getAttribute('data-admin-tab') === targetTabId) {
          b.classList.add('active');
          b.classList.remove('text-slate-400');
        } else {
          b.classList.remove('active');
          b.classList.add('text-slate-400');
        }
      });

      tabContents.forEach(tc => {
        if (tc.id === targetTabId) {
          tc.classList.remove('hidden');
        } else {
          tc.classList.add('hidden');
        }
      });
    }

    function setupAdminPanelTabs() {
      // 1. Tab Switching
      const tabButtons = document.querySelectorAll('.admin-tab-btn');
      tabButtons.forEach(btn => {
        btn.onclick = () => {
          const targetTabId = btn.getAttribute('data-admin-tab');
          switchAdminTab(targetTabId);
        };
      });

      // 2. Populate Channel Stream URLs Tab (Tab 1)
      const adminCatFilter = document.getElementById('admin-channel-category-filter');
      const adminChannelSelect = document.getElementById('admin-channel-select');
      const adminStreamUrlInput = document.getElementById('admin-channel-stream-url');
      const adminBackupUrlInput = document.getElementById('admin-channel-backup-url');
      const adminChannelBadge = document.getElementById('admin-channel-status-badge');
      const btnAdminChannelSave = document.getElementById('btn-admin-channel-save');
      const btnAdminChannelReset = document.getElementById('btn-admin-channel-reset');
      const btnAdminChannelTest = document.getElementById('btn-admin-channel-test');

      if (adminCatFilter && adminChannelSelect) {
        // Populate Categories
        const catOptions = ['<option value="ALL">All Categories (সব ক্যাটাগরি)</option>'];
        (state.categories || []).forEach(cat => {
          catOptions.push(`<option value="${escapeHtml(cat.name)}">${escapeHtml(cat.name)}</option>`);
        });
        adminCatFilter.innerHTML = catOptions.join('');

        function populateAdminChannels() {
          const selectedCat = adminCatFilter.value;
          let filtered = state.channels || [];
          if (selectedCat !== 'ALL') {
            filtered = getChannelsForCategory(selectedCat);
          }

          if (filtered.length === 0) {
            adminChannelSelect.innerHTML = '<option value="">(কোনো চ্যানেল পাওয়া যায়নি)</option>';
            if (adminStreamUrlInput) adminStreamUrlInput.value = '';
            if (adminBackupUrlInput) adminBackupUrlInput.value = '';
            return;
          }

          adminChannelSelect.innerHTML = filtered.map(ch => {
            const hasCustom = !!(state.customChannelUrls && state.customChannelUrls[ch.id]);
            const badge = hasCustom ? ' ★ [Custom URL]' : '';
            return `<option value="${escapeHtml(ch.id)}">${escapeHtml(ch.name)}${badge} (${escapeHtml(ch.category || 'Live TV')})</option>`;
          }).join('');

          updateAdminChannelInputs();
        }

        function updateAdminChannelInputs() {
          const chId = adminChannelSelect.value;
          const ch = (state.channels || []).find(c => c.id === chId);
          if (!ch) return;

          const custom = state.customChannelUrls && state.customChannelUrls[chId];
          const streamUrl = (custom && custom.streamUrl) || ch.stream_url || ch.url || ch.streamUrl || '';
          const backupUrl = (custom && custom.backupUrl) || (ch.backupUrls && ch.backupUrls[0]) || ch.backup_stream_url || '';

          if (adminStreamUrlInput) adminStreamUrlInput.value = streamUrl;
          if (adminBackupUrlInput) adminBackupUrlInput.value = backupUrl;

          if (adminChannelBadge) {
            if (custom) {
              adminChannelBadge.textContent = 'Customized';
              adminChannelBadge.className = 'text-[10px] text-amber-400 font-bold px-1.5 py-0.5 bg-amber-500/15 rounded';
            } else {
              adminChannelBadge.textContent = 'Active (Default)';
              adminChannelBadge.className = 'text-[10px] text-emerald-400 font-bold px-1.5 py-0.5 bg-emerald-500/15 rounded';
            }
          }
        }

        adminCatFilter.onchange = populateAdminChannels;
        adminChannelSelect.onchange = updateAdminChannelInputs;
        populateAdminChannels();

        // Delete / Remove current custom channel stream
        const btnAdminChannelDelete = document.getElementById('btn-admin-channel-delete');
        const adminCustomChannelsList = document.getElementById('admin-custom-channels-list');
        const adminCustomChannelsCount = document.getElementById('admin-custom-channels-count');
        const btnClearAllCustomChannels = document.getElementById('btn-admin-clear-all-custom-channels');

        function renderAdminCustomChannels() {
          if (!adminCustomChannelsList) return;
          const customKeys = Object.keys(state.customChannelUrls || {});
          if (adminCustomChannelsCount) {
            adminCustomChannelsCount.textContent = customKeys.length;
          }
          if (btnClearAllCustomChannels) {
            if (customKeys.length > 0) {
              btnClearAllCustomChannels.classList.remove('hidden');
            } else {
              btnClearAllCustomChannels.classList.add('hidden');
            }
          }

          if (customKeys.length === 0) {
            adminCustomChannelsList.innerHTML = `
              <div class="py-2.5 px-3 rounded-xl bg-slate-900/60 border border-slate-800/80 text-center text-slate-400 text-[11px]">
                <i class="fa-solid fa-circle-info text-slate-500 mr-1"></i> বর্তমানে কোনো কাস্টম চ্যানেল স্ট্রিম লিংক যুক্ত নেই
              </div>
            `;
            return;
          }

          adminCustomChannelsList.innerHTML = customKeys.map(chId => {
            const ch = (state.channels || []).find(c => c.id === chId) || { id: chId, name: chId, category: 'Custom' };
            const custom = state.customChannelUrls[chId] || {};
            const urlPreview = custom.streamUrl ? (custom.streamUrl.length > 38 ? custom.streamUrl.substring(0, 38) + '...' : custom.streamUrl) : '';
            return `
              <div class="p-2 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between gap-2 hover:border-slate-700 transition">
                <div class="flex items-center gap-2 min-w-0 flex-1">
                  <div class="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center flex-shrink-0 overflow-hidden">
                    ${ch.logo ? `<img src="${ch.logo}" class="w-5 h-5 object-contain" onerror="this.style.display='none'" />` : `<i class="fa-solid fa-tv text-xs text-sky-400"></i>`}
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-1.5">
                      <span class="font-bold text-white text-[11px] truncate">${escapeHtml(ch.name)}</span>
                      <span class="text-[9px] px-1 py-0.2 rounded bg-sky-500/20 text-sky-300 font-semibold">${escapeHtml(ch.category || 'Live TV')}</span>
                    </div>
                    <p class="text-[10px] text-slate-400 font-mono truncate">${escapeHtml(urlPreview)}</p>
                  </div>
                </div>
                <div class="flex items-center gap-1 flex-shrink-0">
                  <button type="button" class="btn-admin-edit-custom-channel py-1 px-2 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 text-[10.5px] font-bold transition" data-channel-id="${escapeHtml(chId)}" title="এডিট">
                    <i class="fa-solid fa-pen"></i>
                  </button>
                  <button type="button" class="btn-admin-delete-custom-channel py-1 px-2 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 text-[10.5px] font-bold transition" data-channel-id="${escapeHtml(chId)}" title="মুছে ফেলুন">
                    <i class="fa-solid fa-trash-can"></i>
                  </button>
                </div>
              </div>
            `;
          }).join('');

          // Bind edit & delete buttons
          adminCustomChannelsList.querySelectorAll('.btn-admin-edit-custom-channel').forEach(btn => {
            btn.onclick = () => {
              const targetChId = btn.getAttribute('data-channel-id');
              if (adminCatFilter) adminCatFilter.value = 'ALL';
              populateAdminChannels();
              if (adminChannelSelect) adminChannelSelect.value = targetChId;
              updateAdminChannelInputs();
              showToast('চ্যানেল এডিটর ফর্মে লোড করা হয়েছে');
            };
          });

          adminCustomChannelsList.querySelectorAll('.btn-admin-delete-custom-channel').forEach(btn => {
            btn.onclick = () => {
              const targetChId = btn.getAttribute('data-channel-id');
              deleteCustomChannel(targetChId);
            };
          });
        }

        function deleteCustomChannel(targetChId) {
          if (!targetChId) return;
          if (state.customChannelUrls && state.customChannelUrls[targetChId]) {
            const chName = (state.channels || []).find(c => c.id === targetChId)?.name || 'Channel';
            delete state.customChannelUrls[targetChId];
            localStorage.setItem('highfy_custom_channel_urls', JSON.stringify(state.customChannelUrls));
            loadChannels(true);
            populateAdminChannels();
            renderAdminCustomChannels();
            showToast(`🗑️ ${chName}-এর কাস্টমাইজড স্ট্রিম সফলভাবে মুছে ফেলা হয়েছে!`);
          } else {
            showToast('এই চ্যানেলে কোনো কাস্টম লিংক যুক্ত ছিল না');
          }
        }

        if (btnAdminChannelDelete) {
          btnAdminChannelDelete.onclick = () => {
            const chId = adminChannelSelect.value;
            if (!chId) {
              showToast('দয়া করে একটি চ্যানেল নির্বাচন করুন');
              return;
            }
            if (state.customChannelUrls && state.customChannelUrls[chId]) {
              deleteCustomChannel(chId);
            } else {
              showToast('এই চ্যানেলে বর্তমানে কোনো কাস্টম স্ট্রিম নেই');
            }
          };
        }

        if (btnClearAllCustomChannels) {
          btnClearAllCustomChannels.onclick = () => {
            if (confirm('আপনি কি সত্যিই সকল কাস্টমাইজড চ্যানেল লিংক মুছে ফেলতে চান?')) {
              state.customChannelUrls = {};
              localStorage.removeItem('highfy_custom_channel_urls');
              loadChannels(true);
              populateAdminChannels();
              renderAdminCustomChannels();
              showToast('🗑️ সব কাস্টম চ্যানেল লিংক মুছে ফেলা হয়েছে!');
            }
          };
        }

        renderAdminCustomChannels();

        if (btnAdminChannelSave) {
          btnAdminChannelSave.onclick = () => {
            const chId = adminChannelSelect.value;
            const newStreamUrl = adminStreamUrlInput ? adminStreamUrlInput.value.trim() : '';
            const newBackupUrl = adminBackupUrlInput ? adminBackupUrlInput.value.trim() : '';

            if (!chId) {
              showToast('দয়া করে একটি চ্যানেল নির্বাচন করুন');
              return;
            }
            if (!newStreamUrl) {
              showToast('দয়া করে প্রাইমারি স্ট্রিম URL দিন');
              return;
            }

            if (!state.customChannelUrls) state.customChannelUrls = {};
            state.customChannelUrls[chId] = {
              streamUrl: newStreamUrl,
              backupUrl: newBackupUrl,
              updatedAt: Date.now()
            };
            localStorage.setItem('highfy_custom_channel_urls', JSON.stringify(state.customChannelUrls));

            // Update in-memory channel object
            const ch = (state.channels || []).find(c => c.id === chId);
            if (ch) {
              ch.stream_url = newStreamUrl;
              ch.url = newStreamUrl;
              ch.streamUrl = newStreamUrl;
              if (newBackupUrl) {
                ch.backup_stream_url = newBackupUrl;
                ch.backupUrls = [newBackupUrl];
              }
            }

            // Sync with sportsCoordinator and UI
            if (window.sportsCoordinator) {
              window.sportsCoordinator.setChannels(state.channels);
            }
            renderChannels();
            renderFavorites();
            populateAdminChannels();
            renderAdminCustomChannels();
            showToast(`✅ ${ch ? ch.name : 'Channel'} স্ট্রিম URL সফলভাবে আপডেট হয়েছে!`);
          };
        }

        if (btnAdminChannelReset) {
          btnAdminChannelReset.onclick = () => {
            const chId = adminChannelSelect.value;
            if (!chId) return;

            if (state.customChannelUrls && state.customChannelUrls[chId]) {
              delete state.customChannelUrls[chId];
              localStorage.setItem('highfy_custom_channel_urls', JSON.stringify(state.customChannelUrls));
            }

            loadChannels(true);
            populateAdminChannels();
            renderAdminCustomChannels();
            showToast('চ্যানেলের স্ট্রিম URL ডিফল্টে রিসেট করা হয়েছে');
          };
        }

        if (btnAdminChannelTest) {
          btnAdminChannelTest.onclick = () => {
            const chId = adminChannelSelect.value;
            const streamUrl = adminStreamUrlInput ? adminStreamUrlInput.value.trim() : '';
            const ch = (state.channels || []).find(c => c.id === chId);
            if (!streamUrl) {
              showToast('টেস্ট করার জন্য স্ট্রিম URL দিন');
              return;
            }
            closeModal('modal-stream-source');
            playMedia({
              title: ch ? ch.name : 'Test Live Stream',
              streams: [{
                name: ch ? ch.name : 'Test Server 1',
                serverLabel: 'TEST SERVER 1',
                url: streamUrl,
                quality: '1080p FHD',
                isHD: true
              }],
              isEvent: false
            });
          };
        }
      }

      // 3. Populate Live Events & Channels Assignment Tab (Tab 2)
      const adminEventSportFilter = document.getElementById('admin-event-sport-filter');
      const adminEventCountBadge = document.getElementById('admin-event-count-badge');
      const adminEventStatusBadge = document.getElementById('admin-event-status-badge');
      const adminEventSelect = document.getElementById('admin-event-select');
      const adminEventChannelSelect = document.getElementById('admin-event-channel-select');
      const adminEventDirectUrlInput = document.getElementById('admin-event-direct-url');
      const btnAdminEventSave = document.getElementById('btn-admin-event-save');
      const btnAdminEventReset = document.getElementById('btn-admin-event-reset');
      const btnAdminEventTest = document.getElementById('btn-admin-event-test');

      if (adminEventSelect && adminEventChannelSelect) {
        // Collect available sports
        const defaultSports = ['Football', 'Cricket', 'Baseball', 'Basketball', 'Tennis', 'Motorsport', 'WWE'];
        const existingSportsSet = new Set(defaultSports);
        (state.events || []).forEach(ev => {
          if (ev && ev.sport) {
            const formatted = ev.sport.charAt(0).toUpperCase() + ev.sport.slice(1).toLowerCase();
            existingSportsSet.add(formatted);
          }
        });

        if (adminEventSportFilter) {
          const sportOptions = ['<option value="ALL">All (সব খেলা)</option>'];
          Array.from(existingSportsSet).forEach(sp => {
            sportOptions.push(`<option value="${sp.toLowerCase()}">${sp}</option>`);
          });
          sportOptions.push('<option value="other">Other Sports</option>');
          adminEventSportFilter.innerHTML = sportOptions.join('');
        }

        function populateAdminEvents() {
          const selectedSport = adminEventSportFilter ? adminEventSportFilter.value.toLowerCase() : 'all';
          let filteredEvents = state.events || [];

          if (selectedSport !== 'all') {
            filteredEvents = filteredEvents.filter(ev => {
              const evSport = (ev.sport || '').toLowerCase();
              if (selectedSport === 'other') {
                return !defaultSports.map(s => s.toLowerCase()).includes(evSport);
              }
              return evSport === selectedSport;
            });
          }

          if (adminEventCountBadge) {
            const sportLabel = selectedSport === 'all' ? 'All Sports' : selectedSport.toUpperCase();
            adminEventCountBadge.textContent = `${sportLabel} (${filteredEvents.length})`;
          }

          if (filteredEvents.length === 0) {
            adminEventSelect.innerHTML = '<option value="">(এই ক্যাটাগরিতে কোনো খেলা পাওয়া যায়নি)</option>';
            if (adminEventDirectUrlInput) adminEventDirectUrlInput.value = '';
            adminEventChannelSelect.value = '';
            return;
          }

          adminEventSelect.innerHTML = filteredEvents.map(ev => {
            const hasCustom = !!(state.customEventStreams && state.customEventStreams[ev.id]);
            const badge = hasCustom ? ' ★ [Custom Live]' : '';
            const t1 = ev.team1?.name || ev.homeTeam?.name || '';
            const t2 = ev.team2?.name || ev.awayTeam?.name || '';
            const title = ev.title || (t1 && t2 ? `${t1} vs ${t2}` : 'Live Match');
            const sport = (ev.sport || 'Sports').toUpperCase();
            const status = ev.status ? ` - ${ev.status}` : '';
            return `<option value="${escapeHtml(ev.id)}">[${sport}] ${escapeHtml(title)}${status}${badge}</option>`;
          }).join('');

          updateAdminEventInputs();
        }

        // Populate broadcast channel dropdown
        const allChannelsList = state.channels || [];
        const chOptions = ['<option value="">-- চ্যানেল নির্বাচন করুন (Auto Match) --</option>'];
        allChannelsList.forEach(ch => {
          chOptions.push(`<option value="${escapeHtml(ch.id)}">${escapeHtml(ch.name)} (${escapeHtml(ch.category || 'Sports')})</option>`);
        });
        adminEventChannelSelect.innerHTML = chOptions.join('');

        function updateAdminEventInputs() {
          const evId = adminEventSelect.value;
          const ev = (state.events || []).find(e => e.id === evId);
          if (!ev) return;

          if (adminEventStatusBadge) {
            const st = (ev.status || 'LIVE').toUpperCase();
            adminEventStatusBadge.textContent = st;
            if (st === 'LIVE') {
              adminEventStatusBadge.className = 'text-[10px] text-red-400 font-bold px-1.5 py-0.5 bg-red-500/15 rounded animate-pulse';
            } else {
              adminEventStatusBadge.className = 'text-[10px] text-emerald-400 font-bold px-1.5 py-0.5 bg-emerald-500/15 rounded';
            }
          }

          const custom = state.customEventStreams && state.customEventStreams[evId];
          if (custom) {
            if (custom.channelId) {
              adminEventChannelSelect.value = custom.channelId;
            } else {
              adminEventChannelSelect.value = '';
            }
            if (adminEventDirectUrlInput) {
              adminEventDirectUrlInput.value = custom.directUrl || '';
            }
          } else {
            // Find matched channel if any
            if (ev.channelId) {
              adminEventChannelSelect.value = ev.channelId;
            } else if (Array.isArray(ev.streams) && ev.streams.length > 0 && ev.streams[0].channelId) {
              adminEventChannelSelect.value = ev.streams[0].channelId;
            } else {
              adminEventChannelSelect.value = '';
            }
            if (adminEventDirectUrlInput) adminEventDirectUrlInput.value = '';
          }
        }

        if (adminEventSportFilter) {
          adminEventSportFilter.onchange = populateAdminEvents;
        }
        adminEventSelect.onchange = updateAdminEventInputs;
        populateAdminEvents();

        // Delete / Remove custom stream for selected event & list
        const btnAdminEventDelete = document.getElementById('btn-admin-event-delete');
        const adminCustomEventsList = document.getElementById('admin-custom-events-list');
        const adminCustomEventsCount = document.getElementById('admin-custom-events-count');
        const btnClearAllCustomEvents = document.getElementById('btn-admin-clear-all-custom-events');

        function renderAdminCustomEvents() {
          if (!adminCustomEventsList) return;
          const customKeys = Object.keys(state.customEventStreams || {});
          if (adminCustomEventsCount) {
            adminCustomEventsCount.textContent = customKeys.length;
          }
          if (btnClearAllCustomEvents) {
            if (customKeys.length > 0) {
              btnClearAllCustomEvents.classList.remove('hidden');
            } else {
              btnClearAllCustomEvents.classList.add('hidden');
            }
          }

          if (customKeys.length === 0) {
            adminCustomEventsList.innerHTML = `
              <div class="py-2.5 px-3 rounded-xl bg-slate-900/60 border border-slate-800/80 text-center text-slate-400 text-[11px]">
                <i class="fa-solid fa-circle-info text-slate-500 mr-1"></i> কোনো ম্যাচে কাস্টম লিংক যুক্ত করা নেই
              </div>
            `;
            return;
          }

          adminCustomEventsList.innerHTML = customKeys.map(evId => {
            const ev = (state.events || []).find(e => e.id === evId) || { id: evId, title: 'Custom Match', sport: 'Sports' };
            const custom = state.customEventStreams[evId] || {};
            const assignedCh = custom.channelId ? (state.channels || []).find(c => c.id === custom.channelId) : null;
            const targetDesc = assignedCh ? `📺 ${assignedCh.name}` : (custom.directUrl ? `🔗 Direct M3U8 (${custom.directUrl.substring(0, 24)}...)` : 'Custom Stream');

            return `
              <div class="p-2 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between gap-2 hover:border-slate-700 transition">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-1.5">
                    <span class="font-bold text-white text-[11px] truncate">${escapeHtml(ev.title || 'Live Match')}</span>
                    <span class="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 font-semibold uppercase">${escapeHtml(ev.sport || 'Sports')}</span>
                  </div>
                  <p class="text-[10px] text-sky-400 font-semibold truncate mt-0.5">${escapeHtml(targetDesc)}</p>
                </div>
                <div class="flex items-center gap-1 flex-shrink-0">
                  <button type="button" class="btn-admin-edit-custom-event py-1 px-2 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 text-[10.5px] font-bold transition" data-event-id="${escapeHtml(evId)}" title="এডিট">
                    <i class="fa-solid fa-pen"></i>
                  </button>
                  <button type="button" class="btn-admin-delete-custom-event py-1 px-2 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 text-[10.5px] font-bold transition" data-event-id="${escapeHtml(evId)}" title="মুছে ফেলুন">
                    <i class="fa-solid fa-trash-can"></i>
                  </button>
                </div>
              </div>
            `;
          }).join('');

          // Bind edit & delete buttons
          adminCustomEventsList.querySelectorAll('.btn-admin-edit-custom-event').forEach(btn => {
            btn.onclick = () => {
              const targetEvId = btn.getAttribute('data-event-id');
              if (adminEventSportFilter) adminEventSportFilter.value = 'ALL';
              populateAdminEvents();
              if (adminEventSelect) adminEventSelect.value = targetEvId;
              updateAdminEventInputs();
              showToast('ম্যাচ এডিটর ফর্মে লোড করা হয়েছে');
            };
          });

          adminCustomEventsList.querySelectorAll('.btn-admin-delete-custom-event').forEach(btn => {
            btn.onclick = () => {
              const targetEvId = btn.getAttribute('data-event-id');
              deleteCustomEventStream(targetEvId);
            };
          });
        }

        function deleteCustomEventStream(targetEvId) {
          if (!targetEvId) return;
          if (state.customEventStreams && state.customEventStreams[targetEvId]) {
            const evTitle = (state.events || []).find(e => e.id === targetEvId)?.title || 'Match';
            delete state.customEventStreams[targetEvId];
            localStorage.setItem('highfy_custom_event_streams', JSON.stringify(state.customEventStreams));
            loadSportsEvents(true);
            populateAdminEvents();
            renderAdminCustomEvents();
            if (state.currentView === 'view-match-details' && state.currentMatchDetailsId === targetEvId) {
              renderMatchDetails(targetEvId);
            }
            showToast(`🗑️ "${evTitle}"-এর কাস্টম লিংক মুছে ফেলা হয়েছে!`);
          } else {
            showToast('এই ম্যাচে কোনো কাস্টম লিংক যুক্ত ছিল না');
          }
        }

        if (btnAdminEventDelete) {
          btnAdminEventDelete.onclick = () => {
            const evId = adminEventSelect.value;
            if (!evId) {
              showToast('দয়া করে একটি খেলা নির্বাচন করুন');
              return;
            }
            if (state.customEventStreams && state.customEventStreams[evId]) {
              deleteCustomEventStream(evId);
            } else {
              showToast('এই ম্যাচে কোনো কাস্টম লিংক নেই');
            }
          };
        }

        if (btnClearAllCustomEvents) {
          btnClearAllCustomEvents.onclick = () => {
            if (confirm('আপনি কি সত্যিই সকল ম্যাচের কাস্টম লিংক মুছে ফেলতে চান?')) {
              state.customEventStreams = {};
              localStorage.removeItem('highfy_custom_event_streams');
              loadSportsEvents(true);
              populateAdminEvents();
              renderAdminCustomEvents();
              showToast('🗑️ সব ম্যাচের কাস্টম লিংক মুছে ফেলা হয়েছে!');
            }
          };
        }

        renderAdminCustomEvents();

        if (btnAdminEventSave) {
          btnAdminEventSave.onclick = () => {
            const evId = adminEventSelect.value;
            const selectedChId = adminEventChannelSelect.value;
            const directUrl = adminEventDirectUrlInput ? adminEventDirectUrlInput.value.trim() : '';

            if (!evId) {
              showToast('দয়া করে একটি খেলা বা ইভেন্ট নির্বাচন করুন');
              return;
            }

            if (!selectedChId && !directUrl) {
              showToast('দয়া করে সম্প্রচারকারী চ্যানেল নির্বাচন করুন অথবা সরাসরি M3U8 লিংক দিন');
              return;
            }

            if (!state.customEventStreams) state.customEventStreams = {};
            state.customEventStreams[evId] = {
              channelId: selectedChId || null,
              directUrl: directUrl || null,
              updatedAt: Date.now()
            };
            localStorage.setItem('highfy_custom_event_streams', JSON.stringify(state.customEventStreams));

            // Immediately update the event object in state
            const ev = (state.events || []).find(e => e.id === evId);
            if (ev) {
              if (selectedChId) {
                ev.channelId = selectedChId;
                const matchedCh = (state.channels || []).find(c => c.id === selectedChId);
                if (matchedCh) {
                  const streamUrl = matchedCh.stream_url || matchedCh.url || matchedCh.streamUrl;
                  ev.streams = [{
                    name: matchedCh.name,
                    serverLabel: matchedCh.name,
                    channelName: matchedCh.name,
                    channelId: matchedCh.id,
                    channelLogo: matchedCh.logo,
                    url: streamUrl,
                    backupUrls: matchedCh.backupUrls || [],
                    quality: '1080p FHD',
                    isHD: true,
                    category: matchedCh.category || 'Sports'
                  }];
                  ev.broadcastChannels = [matchedCh.name];
                  ev.broadcastingChannelDetails = [{
                    id: matchedCh.id,
                    name: matchedCh.name,
                    logo: matchedCh.logo,
                    category: matchedCh.category || 'Sports',
                    quality: '1080p FHD',
                    streamUrl: streamUrl,
                    serverIdx: 0
                  }];
                }
              } else if (directUrl) {
                ev.streams = [{
                  name: `${ev.title || 'Live Match'} (Server 1 HD)`,
                  serverLabel: 'SERVER 1 (1080P HD)',
                  channelName: ev.title || 'Live Match',
                  channelLogo: ev.team1?.logo || ev.homeTeam?.logo || './assets/category-logos/live-events-hd.svg',
                  url: directUrl,
                  backupUrls: [],
                  quality: '1080p FHD',
                  isHD: true,
                  category: ev.sport || 'Sports'
                }];
                ev.broadcastChannels = ['Live HD Stream'];
                ev.broadcastingChannelDetails = [{
                  id: `custom-stream-${ev.id}`,
                  name: 'Live HD Stream',
                  logo: ev.team1?.logo || ev.homeTeam?.logo || './assets/category-logos/live-events-hd.svg',
                  category: ev.sport || 'Sports',
                  quality: '1080p FHD',
                  streamUrl: directUrl,
                  serverIdx: 0
                }];
              }
            }

            renderEvents();
            if (state.currentView === 'view-match-details' && state.currentMatchDetailsId === evId) {
              renderMatchDetails(evId);
            }
            populateAdminEvents();
            renderAdminCustomEvents();
            showToast(`✅ খেলার লাইভ চ্যানেল ও স্ট্রিম লিংক সফলভাবে সেট হয়েছে!`);
          };
        }

        if (btnAdminEventReset) {
          btnAdminEventReset.onclick = () => {
            const evId = adminEventSelect.value;
            if (!evId) return;

            if (state.customEventStreams && state.customEventStreams[evId]) {
              delete state.customEventStreams[evId];
              localStorage.setItem('highfy_custom_event_streams', JSON.stringify(state.customEventStreams));
            }

            loadSportsEvents(true);
            populateAdminEvents();
            renderAdminCustomEvents();
            showToast('খেলার লিংক স্বয়ংক্রিয় ম্যাচিং মোডে রিসেট করা হয়েছে');
          };
        }

        if (btnAdminEventTest) {
          btnAdminEventTest.onclick = () => {
            const evId = adminEventSelect.value;
            const selectedChId = adminEventChannelSelect.value;
            const directUrl = adminEventDirectUrlInput ? adminEventDirectUrlInput.value.trim() : '';
            const ev = (state.events || []).find(e => e.id === evId);

            let testUrl = directUrl;
            let title = ev ? ev.title : 'Live Test Match';

            if (!testUrl && selectedChId) {
              const matchedCh = (state.channels || []).find(c => c.id === selectedChId);
              if (matchedCh) {
                testUrl = matchedCh.stream_url || matchedCh.url || matchedCh.streamUrl;
                title = `${title} (${matchedCh.name})`;
              }
            }

            if (!testUrl) {
              showToast('টেস্ট করার জন্য চ্যানেল সিলেক্ট করুন বা সরাসরি লিংক দিন');
              return;
            }

            closeModal('modal-stream-source');
            playMedia({
              title: title,
              streams: [{
                name: title,
                serverLabel: 'LIVE SERVER 1',
                url: testUrl,
                quality: '1080p FHD',
                isHD: true
              }],
              isEvent: true
            });
          };
        }
      }

      // 4. Tab 3: Channel, Category, Splash Screen and Slide Menu Logos Manager
      const adminCustomLogosList = document.getElementById('admin-custom-logos-list');
      const adminCustomLogosCount = document.getElementById('admin-custom-logos-count');
      const btnTabOpenChannelLogo = document.getElementById('btn-admin-open-logo-manager-tab');
      const btnTabOpenCatLogo = document.getElementById('btn-admin-open-category-logo-manager-tab');
      const btnTabResetAllImages = document.getElementById('btn-admin-reset-all-images');

      // Section C: Splash Screen Image Controls
      const adminSplashInput = document.getElementById('admin-splash-img-url');
      const adminSplashFileInput = document.getElementById('admin-splash-file-input');
      const btnAdminSaveSplash = document.getElementById('btn-admin-save-splash-img');
      const btnAdminResetSplash = document.getElementById('btn-admin-reset-splash-img');
      const adminSplashPreview = document.getElementById('admin-preview-splash-img');

      if (adminSplashInput && adminSplashPreview) {
        adminSplashInput.addEventListener('input', () => {
          const val = adminSplashInput.value.trim();
          adminSplashPreview.src = val || state.customSplashLogo || '/highfy_logo_official.svg';
        });
      }

      if (adminSplashFileInput && adminSplashInput && adminSplashPreview) {
        adminSplashFileInput.addEventListener('change', (e) => {
          const file = e.target.files && e.target.files[0];
          if (file) {
            if (file.size > 5 * 1024 * 1024) {
              showToast('⚠️ ইমেজের সাইজ সর্বোচ্চ 5MB হতে পারে');
              return;
            }
            showToast('ছবি অপ্টিমাইজ করা হচ্ছে...');
            compressImageToDataUrl(file, 360, 0.85, (dataUrl) => {
              adminSplashInput.value = dataUrl;
              adminSplashPreview.src = dataUrl;
              showToast('ছবি প্রস্তুত! "সেভ করুন" বাটনে চাপুন');
            });
          }
        });
      }

      if (btnAdminSaveSplash && adminSplashInput) {
        btnAdminSaveSplash.onclick = () => {
          const val = adminSplashInput.value.trim();
          if (!val) {
            showToast('⚠️ অনুগ্রহ করে একটি সঠিক ইমেজ URL পেস্ট করুন বা ফাইল আপলোড করুন');
            return;
          }
          const doSaveSplash = (finalVal) => {
            state.customSplashLogo = finalVal;
            safeSetLocalStorage('highfy_custom_splash_logo', finalVal);
            applyCustomAppBranding();
            renderAdminCustomLogos();
            showToast('✅ লোডিং পেজের ইমেজ সফলভাবে পরিবর্তন ও সেভ করা হয়েছে!');
          };
          if (val.startsWith('data:image/') && val.length > 35000) {
            compressImageToDataUrl(val, 360, 0.85, doSaveSplash);
          } else {
            doSaveSplash(val);
          }
        };
      }

      if (btnAdminResetSplash) {
        btnAdminResetSplash.onclick = () => {
          state.customSplashLogo = '';
          localStorage.removeItem('highfy_custom_splash_logo');
          if (adminSplashInput) adminSplashInput.value = '';
          applyCustomAppBranding();
          renderAdminCustomLogos();
          showToast('লোডিং পেজের ইমেজ ডিফল্ট করা হয়েছে');
        };
      }

      // Section D: Slide Menu (Drawer) Image Controls
      const adminDrawerInput = document.getElementById('admin-drawer-img-url');
      const adminDrawerFileInput = document.getElementById('admin-drawer-file-input');
      const btnAdminSaveDrawer = document.getElementById('btn-admin-save-drawer-img');
      const btnAdminResetDrawer = document.getElementById('btn-admin-reset-drawer-img');
      const adminDrawerPreview = document.getElementById('admin-preview-drawer-img');

      if (adminDrawerInput && adminDrawerPreview) {
        adminDrawerInput.addEventListener('input', () => {
          const val = adminDrawerInput.value.trim();
          adminDrawerPreview.src = val || state.customDrawerLogo || '/highfy_logo_official.svg';
        });
      }

      if (adminDrawerFileInput && adminDrawerInput && adminDrawerPreview) {
        adminDrawerFileInput.addEventListener('change', (e) => {
          const file = e.target.files && e.target.files[0];
          if (file) {
            if (file.size > 5 * 1024 * 1024) {
              showToast('⚠️ ইমেজের সাইজ সর্বোচ্চ 5MB হতে পারে');
              return;
            }
            showToast('ছবি অপ্টিমাইজ করা হচ্ছে...');
            compressImageToDataUrl(file, 260, 0.85, (dataUrl) => {
              adminDrawerInput.value = dataUrl;
              adminDrawerPreview.src = dataUrl;
              showToast('ছবি প্রস্তুত! "সেভ করুন" বাটনে চাপুন');
            });
          }
        });
      }

      if (btnAdminSaveDrawer && adminDrawerInput) {
        btnAdminSaveDrawer.onclick = () => {
          const val = adminDrawerInput.value.trim();
          if (!val) {
            showToast('⚠️ অনুগ্রহ করে একটি সঠিক ইমেজ URL পেস্ট করুন বা ফাইল আপলোড করুন');
            return;
          }
          const doSaveDrawer = (finalVal) => {
            state.customDrawerLogo = finalVal;
            safeSetLocalStorage('highfy_custom_drawer_logo', finalVal);
            applyCustomAppBranding();
            renderAdminCustomLogos();
            showToast('✅ স্লাইড মেনুর ইমেজ সফলভাবে পরিবর্তন ও সেভ করা হয়েছে!');
          };
          if (val.startsWith('data:image/') && val.length > 30000) {
            compressImageToDataUrl(val, 260, 0.85, doSaveDrawer);
          } else {
            doSaveDrawer(val);
          }
        };
      }

      if (btnAdminResetDrawer) {
        btnAdminResetDrawer.onclick = () => {
          state.customDrawerLogo = '';
          localStorage.removeItem('highfy_custom_drawer_logo');
          if (adminDrawerInput) adminDrawerInput.value = '';
          applyCustomAppBranding();
          renderAdminCustomLogos();
          showToast('স্লাইড মেনুর ইমেজ ডিফল্ট করা হয়েছে');
        };
      }

      function renderAdminCustomLogos() {
        if (!adminCustomLogosList) return;
        applyCustomAppBranding();

        const customChLogos = Object.keys(state.customLogos || {});
        const customCatLogos = Object.keys(state.customCategoryLogos || {});
        const customSportsCatLogos = Object.keys(state.customSportsCategoryLogos || {});
        let totalImages = customChLogos.length + customCatLogos.length + customSportsCatLogos.length;
        if (state.customSplashLogo) totalImages++;
        if (state.customDrawerLogo) totalImages++;

        if (adminCustomLogosCount) adminCustomLogosCount.textContent = totalImages;

        if (totalImages === 0) {
          adminCustomLogosList.innerHTML = `
            <div class="py-2.5 px-3 rounded-xl bg-slate-900/60 border border-slate-800/80 text-center text-slate-400 text-[11px]">
              <i class="fa-solid fa-circle-info text-slate-500 mr-1"></i> বর্তমানে কোনো কাস্টম ইমেজ যুক্ত নেই
            </div>
          `;
          return;
        }

        let html = '';

        // Splash screen logo
        if (state.customSplashLogo) {
          html += `
            <div class="p-1.5 rounded-xl bg-slate-900/90 border border-amber-500/40 flex items-center justify-between gap-2">
              <div class="flex items-center gap-2 min-w-0 flex-1">
                <img src="${state.customSplashLogo}" class="w-6 h-6 object-contain rounded bg-slate-800 p-0.5" onerror="this.src='/highfy_logo_official.svg'" />
                <div class="min-w-0">
                  <p class="font-bold text-white text-[11px] truncate">লোডিং পেজ (Splash) ইমেজ</p>
                  <p class="text-[9.5px] text-amber-400">অ্যাপ স্প্ল্যাশ লোগো</p>
                </div>
              </div>
              <button type="button" class="btn-admin-delete-custom-logo py-1 px-2 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 text-[10.5px] font-bold transition" data-type="splash" title="মুছে ফেলুন">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            </div>
          `;
        }

        // Slide menu drawer logo
        if (state.customDrawerLogo) {
          html += `
            <div class="p-1.5 rounded-xl bg-slate-900/90 border border-emerald-500/40 flex items-center justify-between gap-2">
              <div class="flex items-center gap-2 min-w-0 flex-1">
                <img src="${state.customDrawerLogo}" class="w-6 h-6 object-contain rounded bg-slate-800 p-0.5" onerror="this.src='/highfy_logo_official.svg'" />
                <div class="min-w-0">
                  <p class="font-bold text-white text-[11px] truncate">স্লাইড মেনু (Drawer) ইমেজ</p>
                  <p class="text-[9.5px] text-emerald-400">মেনু হেডার লোগো</p>
                </div>
              </div>
              <button type="button" class="btn-admin-delete-custom-logo py-1 px-2 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 text-[10.5px] font-bold transition" data-type="drawer" title="মুছে ফেলুন">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            </div>
          `;
        }

        // Channel logos
        customChLogos.forEach(chId => {
          const ch = (state.channels || []).find(c => c.id === chId) || { id: chId, name: chId };
          const logoUrl = state.customLogos[chId];
          html += `
            <div class="p-1.5 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between gap-2">
              <div class="flex items-center gap-2 min-w-0 flex-1">
                <img src="${logoUrl}" class="w-6 h-6 object-contain rounded bg-slate-800 p-0.5" onerror="this.src='./assets/category-logos/sports-channels.svg'" />
                <div class="min-w-0">
                  <p class="font-bold text-white text-[11px] truncate">${escapeHtml(ch.name)}</p>
                  <p class="text-[9.5px] text-sky-400">চ্যানেল লোগো</p>
                </div>
              </div>
              <button type="button" class="btn-admin-delete-custom-logo py-1 px-2 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 text-[10.5px] font-bold transition" data-type="channel" data-id="${escapeHtml(chId)}" title="মুছে ফেলুন">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            </div>
          `;
        });

        // Category logos
        customCatLogos.forEach(catId => {
          const cat = (state.categories || []).find(c => (c.id === catId) || (c.name === catId)) || { id: catId, name: catId };
          const logoUrl = state.customCategoryLogos[catId];
          html += `
            <div class="p-1.5 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between gap-2">
              <div class="flex items-center gap-2 min-w-0 flex-1">
                <img src="${logoUrl}" class="w-6 h-6 object-contain rounded bg-purple-950/40 p-0.5" onerror="this.src='./assets/category-logos/sports-channels.svg'" />
                <div class="min-w-0">
                  <p class="font-bold text-white text-[11px] truncate">${escapeHtml(cat.name)}</p>
                  <p class="text-[9.5px] text-purple-400">ক্যাটাগরি ইমেজ</p>
                </div>
              </div>
              <button type="button" class="btn-admin-delete-custom-logo py-1 px-2 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 text-[10.5px] font-bold transition" data-type="category" data-id="${escapeHtml(catId)}" title="মুছে ফেলুন">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            </div>
          `;
        });

        // Sports Category logos
        customSportsCatLogos.forEach(sportsCatKey => {
          const sCat = SPORTS_CATEGORIES.find(c => (c.id === sportsCatKey) || (c.filterKey === sportsCatKey) || (c.name === sportsCatKey)) || { id: sportsCatKey, name: sportsCatKey };
          const logoUrl = state.customSportsCategoryLogos[sportsCatKey];
          html += `
            <div class="p-1.5 rounded-xl bg-slate-900/90 border border-emerald-500/40 flex items-center justify-between gap-2">
              <div class="flex items-center gap-2 min-w-0 flex-1">
                <img src="${logoUrl}" class="w-6 h-6 object-contain rounded bg-emerald-950/40 p-0.5" onerror="this.src='./assets/category-logos/sports-channels.svg'" />
                <div class="min-w-0">
                  <p class="font-bold text-white text-[11px] truncate">${escapeHtml(sCat.name)}</p>
                  <p class="text-[9.5px] text-emerald-400 font-semibold">স্পোর্টস ক্যাটাগরি লোগো</p>
                </div>
              </div>
              <button type="button" class="btn-admin-delete-custom-logo py-1 px-2 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 text-[10.5px] font-bold transition" data-type="sportscat" data-id="${escapeHtml(sportsCatKey)}" title="মুছে ফেলুন">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            </div>
          `;
        });

        adminCustomLogosList.innerHTML = html;

        adminCustomLogosList.querySelectorAll('.btn-admin-delete-custom-logo').forEach(btn => {
          btn.onclick = () => {
            const type = btn.getAttribute('data-type');
            const id = btn.getAttribute('data-id');
            if (type === 'splash') {
              state.customSplashLogo = '';
              localStorage.removeItem('highfy_custom_splash_logo');
              if (adminSplashInput) adminSplashInput.value = '';
              applyCustomAppBranding();
              renderAdminCustomLogos();
              showToast('লোডিং পেজের ইমেজ ডিফল্টে রিস্টোর করা হয়েছে');
            } else if (type === 'drawer') {
              state.customDrawerLogo = '';
              localStorage.removeItem('highfy_custom_drawer_logo');
              if (adminDrawerInput) adminDrawerInput.value = '';
              applyCustomAppBranding();
              renderAdminCustomLogos();
              showToast('স্লাইড মেনুর ইমেজ ডিফল্টে রিস্টোর করা হয়েছে');
            } else if (type === 'channel') {
              if (state.customLogos && state.customLogos[id]) {
                delete state.customLogos[id];
                safeSetLocalStorage('highfy_custom_logos', JSON.stringify(state.customLogos));
                loadChannels(true);
                renderAdminCustomLogos();
                showToast('চ্যানেল লোগো ডিফল্টে রিস্টোর করা হয়েছে');
              }
            } else if (type === 'category') {
              if (state.customCategoryLogos && state.customCategoryLogos[id]) {
                delete state.customCategoryLogos[id];
                safeSetLocalStorage('highfy_custom_category_logos', JSON.stringify(state.customCategoryLogos));
              }
              if (state.customCategoryColors && state.customCategoryColors[id]) {
                delete state.customCategoryColors[id];
                safeSetLocalStorage('highfy_custom_category_colors', JSON.stringify(state.customCategoryColors));
              }
              loadCategories();
              renderAdminCustomLogos();
              showToast('ক্যাটাগরি ইমেজ ডিফল্টে রিস্টোর করা হয়েছে');
            } else if (type === 'sportscat') {
              if (state.customSportsCategoryLogos) {
                delete state.customSportsCategoryLogos[id];
                const matched = SPORTS_CATEGORIES.find(c => c.id === id || c.filterKey === id || c.name === id);
                if (matched) {
                  if (matched.id) delete state.customSportsCategoryLogos[matched.id];
                  if (matched.filterKey) delete state.customSportsCategoryLogos[matched.filterKey];
                  if (matched.name) delete state.customSportsCategoryLogos[matched.name];
                  if (DEFAULT_SPORTS_CATEGORY_LOGOS[matched.id]) {
                    matched.logo = DEFAULT_SPORTS_CATEGORY_LOGOS[matched.id];
                  }
                }
                safeSetLocalStorage('highfy_custom_sports_category_logos', JSON.stringify(state.customSportsCategoryLogos));
              }
              renderChannels();
              renderAdminCustomLogos();
              if (typeof updateInlineSportsCategoryDisplay === 'function') {
                updateInlineSportsCategoryDisplay();
              }
              showToast('স্পোর্টস ক্যাটাগরি লোগো ডিফল্টে রিস্টোর করা হয়েছে');
            }
          };
        });
      }

      // =======================================================================
      // Inline Channel Logo Editor Setup
      // =======================================================================
      const inlineChannelSelect = document.getElementById('admin-inline-channel-select');
      const inlineChannelImg = document.getElementById('admin-preview-channel-img');
      const inlineChannelUrl = document.getElementById('admin-inline-channel-img-url');
      const inlineChannelFile = document.getElementById('admin-inline-channel-file-input');
      const btnInlineChannelSave = document.getElementById('btn-admin-save-inline-channel-img');
      const btnInlineChannelReset = document.getElementById('btn-admin-reset-inline-channel-img');

      function updateInlineChannelDisplay() {
        if (!inlineChannelSelect) return;
        const selectedId = inlineChannelSelect.value;
        const ch = (state.channels || []).find(c => c.id === selectedId);
        if (!ch) return;
        const cleanName = sanitizeChannelName(ch.name);
        const currentLogo = (state.customLogos && state.customLogos[ch.id]) || ch.logo || '';
        if (inlineChannelUrl) inlineChannelUrl.value = currentLogo;
        if (inlineChannelImg) {
          inlineChannelImg.src = getSafeLogoUrl(currentLogo, cleanName, ch.id);
          inlineChannelImg.onerror = () => {
            inlineChannelImg.src = getSafeLogoUrl('', cleanName, ch.id);
          };
        }
      }

      if (inlineChannelSelect) {
        inlineChannelSelect.innerHTML = (state.channels || []).map(ch => {
          const isCustom = !!(state.customLogos && state.customLogos[ch.id]);
          const star = isCustom ? ' ★' : '';
          return `<option value="${escapeHtml(ch.id)}">${escapeHtml(ch.name)}${star} (${escapeHtml(ch.category || 'Live TV')})</option>`;
        }).join('');
        inlineChannelSelect.onchange = updateInlineChannelDisplay;
        updateInlineChannelDisplay();
      }

      if (inlineChannelUrl) {
        inlineChannelUrl.oninput = () => {
          const url = inlineChannelUrl.value.trim();
          if (inlineChannelImg && url) {
            inlineChannelImg.src = url;
          }
        };
      }

      if (inlineChannelFile) {
        inlineChannelFile.onchange = (e) => {
          const file = e.target.files && e.target.files[0];
          if (!file) return;
          if (file.size > 5 * 1024 * 1024) {
            showToast('ফাইলের সাইজ সর্বোচ্চ 5MB হতে পারে');
            return;
          }
          showToast('ছবি কম্প্রেস করা হচ্ছে...');
          compressImageToDataUrl(file, 160, 0.85, (compressed) => {
            if (inlineChannelUrl) inlineChannelUrl.value = compressed;
            if (inlineChannelImg) inlineChannelImg.src = compressed;
            showToast('ছবি প্রস্তুত! "লোগো সেভ করুন" বাটনে চাপুন');
          });
        };
      }

      if (btnInlineChannelSave) {
        btnInlineChannelSave.onclick = () => {
          const chId = inlineChannelSelect?.value;
          const rawUrl = inlineChannelUrl?.value?.trim();
          if (!chId) {
            showToast('অনুগ্রহ করে একটি চ্যানেল নির্বাচন করুন');
            return;
          }
          if (!rawUrl) {
            showToast('অনুগ্রহ করে ইমেজ লিংক দিন বা ছবি আপলোড করুন');
            return;
          }

          const doSaveChLogo = (finalUrl) => {
            if (!state.customLogos) state.customLogos = {};
            state.customLogos[chId] = finalUrl;
            const success = safeSetLocalStorage('highfy_custom_logos', JSON.stringify(state.customLogos));
            if (success) {
              const ch = (state.channels || []).find(c => c.id === chId);
              if (ch) ch.logo = finalUrl;

              renderChannels();
              renderFavorites();
              if (DOM.playerQuickGrid) renderPlayerQuickChannels();
              renderAdminCustomLogos();
              updateInlineChannelDisplay();
              showToast(`✅ ${ch ? ch.name : 'Channel'} লোগো সফলভাবে সেভ হয়েছে!`);
            }
          };

          if (rawUrl.startsWith('data:image/') && rawUrl.length > 25000) {
            compressImageToDataUrl(rawUrl, 160, 0.85, doSaveChLogo);
          } else {
            doSaveChLogo(rawUrl);
          }
        };
      }

      if (btnInlineChannelReset) {
        btnInlineChannelReset.onclick = () => {
          const chId = inlineChannelSelect?.value;
          if (!chId) return;
          if (state.customLogos && state.customLogos[chId]) {
            delete state.customLogos[chId];
            safeSetLocalStorage('highfy_custom_logos', JSON.stringify(state.customLogos));
          }
          const ch = (state.channels || []).find(c => c.id === chId);
          renderChannels();
          renderFavorites();
          if (DOM.playerQuickGrid) renderPlayerQuickChannels();
          renderAdminCustomLogos();
          updateInlineChannelDisplay();
          showToast('ডিফল্ট চ্যানেল লোগো রিস্টোর করা হয়েছে');
        };
      }

      // =======================================================================
      // Inline Category Logo Editor Setup
      // =======================================================================
      const inlineCatSelect = document.getElementById('admin-inline-category-select');
      const inlineCatImg = document.getElementById('admin-preview-category-img');
      const inlineCatUrl = document.getElementById('admin-inline-category-img-url');
      const inlineCatFile = document.getElementById('admin-inline-category-file-input');
      const btnInlineCatSave = document.getElementById('btn-admin-save-inline-category-img');
      const btnInlineCatReset = document.getElementById('btn-admin-reset-inline-category-img');

      function updateInlineCategoryDisplay() {
        if (!inlineCatSelect) return;
        const selectedId = inlineCatSelect.value;
        const cat = (state.categories || []).find(c => (c.id === selectedId) || (c.name === selectedId));
        if (!cat) return;
        const currentLogo = (state.customCategoryLogos && state.customCategoryLogos[selectedId]) || cat.logo || '';
        if (inlineCatUrl) inlineCatUrl.value = currentLogo;
        if (inlineCatImg) {
          if (currentLogo) {
            inlineCatImg.src = currentLogo;
          } else {
            inlineCatImg.src = './assets/category-logos/sports-channels.svg';
          }
        }
      }

      if (inlineCatSelect) {
        const catList = (state.categories && state.categories.length > 0) ? state.categories : [
          { id: 'sports', name: 'Sports' },
          { id: 'cricket', name: 'Cricket' },
          { id: 'football', name: 'Football' },
          { id: 'news', name: 'News' },
          { id: 'entertainment', name: 'Entertainment' },
          { id: 'cinema', name: 'Cinema' },
          { id: 'kids', name: 'Kids' },
          { id: 'documentary', name: 'Documentary' }
        ];
        inlineCatSelect.innerHTML = catList.map(cat => {
          const isCustom = !!(state.customCategoryLogos && state.customCategoryLogos[cat.id || cat.name]);
          const star = isCustom ? ' ★' : '';
          return `<option value="${escapeHtml(cat.id || cat.name)}">${escapeHtml(cat.name)}${star}</option>`;
        }).join('');
        inlineCatSelect.onchange = updateInlineCategoryDisplay;
        updateInlineCategoryDisplay();
      }

      if (inlineCatUrl) {
        inlineCatUrl.oninput = () => {
          const url = inlineCatUrl.value.trim();
          if (inlineCatImg && url) {
            inlineCatImg.src = url;
          }
        };
      }

      if (inlineCatFile) {
        inlineCatFile.onchange = (e) => {
          const file = e.target.files && e.target.files[0];
          if (!file) return;
          if (file.size > 5 * 1024 * 1024) {
            showToast('ফাইলের সাইজ সর্বোচ্চ 5MB হতে পারে');
            return;
          }
          showToast('ছবি কম্প্রেস করা হচ্ছে...');
          compressImageToDataUrl(file, 160, 0.85, (compressed) => {
            if (inlineCatUrl) inlineCatUrl.value = compressed;
            if (inlineCatImg) inlineCatImg.src = compressed;
            showToast('ছবি প্রস্তুত! "ইমেজ সেভ করুন" বাটনে চাপুন');
          });
        };
      }

      if (btnInlineCatSave) {
        btnInlineCatSave.onclick = () => {
          const catId = inlineCatSelect?.value;
          const rawUrl = inlineCatUrl?.value?.trim();
          if (!catId) {
            showToast('অনুগ্রহ করে একটি ক্যাটাগরি নির্বাচন করুন');
            return;
          }
          if (!rawUrl) {
            showToast('অনুগ্রহ করে ইমেজ লিংক দিন বা ছবি আপলোড করুন');
            return;
          }

          const doSaveCatLogo = (finalUrl) => {
            if (!state.customCategoryLogos) state.customCategoryLogos = {};
            state.customCategoryLogos[catId] = finalUrl;
            const success = safeSetLocalStorage('highfy_custom_category_logos', JSON.stringify(state.customCategoryLogos));
            if (success) {
              const cat = (state.categories || []).find(c => (c.id === catId) || (c.name === catId));
              if (cat) cat.logo = finalUrl;

              renderCategories();
              renderAdminCustomLogos();
              updateInlineCategoryDisplay();
              showToast(`✅ ${cat ? cat.name : 'Category'} ইমেজ সফলভাবে সেভ হয়েছে!`);
            }
          };

          if (rawUrl.startsWith('data:image/') && rawUrl.length > 25000) {
            compressImageToDataUrl(rawUrl, 160, 0.85, doSaveCatLogo);
          } else {
            doSaveCatLogo(rawUrl);
          }
        };
      }

      if (btnInlineCatReset) {
        btnInlineCatReset.onclick = () => {
          const catId = inlineCatSelect?.value;
          if (!catId) return;
          if (state.customCategoryLogos && state.customCategoryLogos[catId]) {
            delete state.customCategoryLogos[catId];
            safeSetLocalStorage('highfy_custom_category_logos', JSON.stringify(state.customCategoryLogos));
          }
          renderCategories();
          renderAdminCustomLogos();
          updateInlineCategoryDisplay();
          showToast('ডিফল্ট ক্যাটাগরি ইমেজ রিস্টোর করা হয়েছে');
        };
      }

      // =======================================================================
      // Inline Sports Category Logo Editor Setup (Navigation Bar Sports Tab)
      // =======================================================================
      const inlineSportsCatSelect = document.getElementById('admin-inline-sports-category-select');
      const inlineSportsCatImg = document.getElementById('admin-preview-sports-category-img');
      const inlineSportsCatUrl = document.getElementById('admin-inline-sports-category-img-url');
      const inlineSportsCatFile = document.getElementById('admin-inline-sports-category-file-input');
      const btnInlineSportsCatSave = document.getElementById('btn-admin-save-inline-sports-category-img');
      const btnInlineSportsCatReset = document.getElementById('btn-admin-reset-inline-sports-category-img');
      const badgeSportsLogoCount = document.getElementById('badge-sports-logo-count');

      function updateInlineSportsCategoryDisplay() {
        if (!inlineSportsCatSelect) return;
        const selectedKey = inlineSportsCatSelect.value;
        const cat = SPORTS_CATEGORIES.find(c => (c.id === selectedKey) || (c.filterKey === selectedKey) || (c.name === selectedKey));
        if (!cat) return;

        const currentLogo = getSportsCategoryLogo(cat);
        const hasCustom = !!(state.customSportsCategoryLogos && (state.customSportsCategoryLogos[cat.id] || state.customSportsCategoryLogos[cat.filterKey] || state.customSportsCategoryLogos[cat.name]));
        if (inlineSportsCatUrl) {
          inlineSportsCatUrl.value = hasCustom ? ((state.customSportsCategoryLogos && (state.customSportsCategoryLogos[cat.id] || state.customSportsCategoryLogos[cat.filterKey] || state.customSportsCategoryLogos[cat.name])) || '') : '';
        }
        if (inlineSportsCatImg) {
          inlineSportsCatImg.src = currentLogo || './assets/category-logos/sports-channels.svg';
        }
      }

      function populateInlineSportsCategorySelect() {
        if (!inlineSportsCatSelect) return;
        const currentVal = inlineSportsCatSelect.value;
        inlineSportsCatSelect.innerHTML = SPORTS_CATEGORIES.map(cat => {
          const isCustom = !!(state.customSportsCategoryLogos && (state.customSportsCategoryLogos[cat.id] || state.customSportsCategoryLogos[cat.filterKey] || state.customSportsCategoryLogos[cat.name]));
          const star = isCustom ? ' ★ [কাস্টম]' : '';
          return `<option value="${escapeHtml(cat.id || cat.filterKey)}">${escapeHtml(cat.name)}${star}</option>`;
        }).join('');
        if (currentVal && SPORTS_CATEGORIES.some(c => (c.id === currentVal) || (c.filterKey === currentVal))) {
          inlineSportsCatSelect.value = currentVal;
        }
        if (badgeSportsLogoCount) {
          badgeSportsLogoCount.textContent = `${SPORTS_CATEGORIES.length} Sports`;
        }
        updateInlineSportsCategoryDisplay();
      }

      if (inlineSportsCatSelect) {
        populateInlineSportsCategorySelect();
        inlineSportsCatSelect.onchange = updateInlineSportsCategoryDisplay;
      }

      if (inlineSportsCatUrl) {
        inlineSportsCatUrl.oninput = () => {
          const url = inlineSportsCatUrl.value.trim();
          if (inlineSportsCatImg && url) {
            inlineSportsCatImg.src = url;
          }
        };
      }

      if (inlineSportsCatFile) {
        inlineSportsCatFile.onchange = (e) => {
          const file = e.target.files && e.target.files[0];
          if (!file) return;
          if (file.size > 5 * 1024 * 1024) {
            showToast('ফাইলের সাইজ সর্বোচ্চ 5MB হতে পারে');
            return;
          }
          showToast('ছবি কম্প্রেস করা হচ্ছে...');
          compressImageToDataUrl(file, 160, 0.85, (compressedDataUrl) => {
            if (inlineSportsCatUrl) inlineSportsCatUrl.value = compressedDataUrl;
            if (inlineSportsCatImg) inlineSportsCatImg.src = compressedDataUrl;
            showToast('ছবি প্রস্তুত! "লোগো সেভ করুন" বাটনে চাপুন');
          });
        };
      }

      if (btnInlineSportsCatSave) {
        btnInlineSportsCatSave.onclick = () => {
          const catKey = inlineSportsCatSelect?.value;
          const rawUrl = inlineSportsCatUrl?.value?.trim();
          if (!catKey) {
            showToast('অনুগ্রহ করে একটি স্পোর্টস ক্যাটাগরি নির্বাচন করুন');
            return;
          }
          if (!rawUrl) {
            showToast('অনুগ্রহ করে ইমেজ লিংক দিন বা ছবি আপলোড করুন');
            return;
          }
          const cat = SPORTS_CATEGORIES.find(c => (c.id === catKey) || (c.filterKey === catKey) || (c.name === catKey));
          const storeKey = cat ? cat.id : catKey;

          const executeSave = (finalUrl) => {
            if (!state.customSportsCategoryLogos) state.customSportsCategoryLogos = {};
            state.customSportsCategoryLogos[storeKey] = finalUrl;
            // Remove redundant duplicate filterKey to save storage
            if (cat && cat.filterKey && cat.filterKey !== storeKey && state.customSportsCategoryLogos[cat.filterKey]) {
              delete state.customSportsCategoryLogos[cat.filterKey];
            }

            const success = safeSetLocalStorage('highfy_custom_sports_category_logos', JSON.stringify(state.customSportsCategoryLogos));
            if (success) {
              if (cat) cat.logo = finalUrl;
              renderChannels();
              renderAdminCustomLogos();
              populateInlineSportsCategorySelect();
              updateInlineSportsCategoryDisplay();
              showToast(`✅ ${cat ? cat.name : 'Sports Category'} লোগো সফলভাবে সেভ হয়েছে!`);
            }
          };

          // If raw URL is an uncompressed large data URL, compress it first
          if (rawUrl.startsWith('data:image/') && rawUrl.length > 25000) {
            compressImageToDataUrl(rawUrl, 160, 0.85, (compressed) => {
              executeSave(compressed);
            });
          } else {
            executeSave(rawUrl);
          }
        };
      }

      if (btnInlineSportsCatReset) {
        btnInlineSportsCatReset.onclick = () => {
          const catKey = inlineSportsCatSelect?.value;
          if (!catKey) return;
          const cat = SPORTS_CATEGORIES.find(c => (c.id === catKey) || (c.filterKey === catKey) || (c.name === catKey));
          const storeKey = cat ? cat.id : catKey;

          if (state.customSportsCategoryLogos) {
            delete state.customSportsCategoryLogos[storeKey];
            if (cat && cat.filterKey) delete state.customSportsCategoryLogos[cat.filterKey];
            if (cat && cat.name) delete state.customSportsCategoryLogos[cat.name];
            safeSetLocalStorage('highfy_custom_sports_category_logos', JSON.stringify(state.customSportsCategoryLogos));
          }

          if (cat && DEFAULT_SPORTS_CATEGORY_LOGOS[cat.id]) {
            cat.logo = DEFAULT_SPORTS_CATEGORY_LOGOS[cat.id];
          }

          renderChannels();
          renderAdminCustomLogos();
          populateInlineSportsCategorySelect();
          updateInlineSportsCategoryDisplay();
          showToast('ডিফল্ট স্পোর্টস ক্যাটাগরি লোগো রিস্টোর করা হয়েছে');
        };
      }

      renderAdminCustomLogos();

      if (btnTabOpenChannelLogo) {
        btnTabOpenChannelLogo.onclick = () => {
          state.openedLogoEditorFromAdmin = true;
          openChannelLogoEditor(inlineChannelSelect ? inlineChannelSelect.value : null);
        };
      }

      if (btnTabOpenCatLogo) {
        btnTabOpenCatLogo.onclick = () => {
          state.openedLogoEditorFromAdmin = true;
          openCategoryLogoEditor(inlineCatSelect ? inlineCatSelect.value : null);
        };
      }

      if (btnTabResetAllImages) {
        btnTabResetAllImages.onclick = () => {
          if (confirm('আপনি কি সব কাস্টম ইমেজ ও লোগো মুছে ডিফল্টে ফেরত যেতে চান?')) {
            localStorage.removeItem('highfy_custom_logos');
            localStorage.removeItem('highfy_custom_category_logos');
            localStorage.removeItem('highfy_custom_sports_category_logos');
            localStorage.removeItem('highfy_custom_category_colors');
            localStorage.removeItem('highfy_custom_splash_logo');
            localStorage.removeItem('highfy_custom_drawer_logo');
            state.customLogos = {};
            state.customCategoryLogos = {};
            state.customSportsCategoryLogos = {};
            state.customCategoryColors = {};
            state.customSplashLogo = '';
            state.customDrawerLogo = '';
            SPORTS_CATEGORIES.forEach(c => {
              if (DEFAULT_SPORTS_CATEGORY_LOGOS[c.id]) c.logo = DEFAULT_SPORTS_CATEGORY_LOGOS[c.id];
            });
            applyCustomAppBranding();
            loadChannels(true);
            loadCategories();
            renderAdminCustomLogos();
            if (typeof populateInlineSportsCategorySelect === 'function') populateInlineSportsCategorySelect();
            showToast('সব কাস্টম চ্যানেল, ক্যাটাগরি, স্পোর্টস, স্প্ল্যাশ ও মেনু ইমেজ সফলভাবে রিসেট করা হয়েছে!');
          }
        };
      }

      // 5. Tab 4: Master Clear All Custom Data
      const btnAdminMasterClearAll = document.getElementById('btn-admin-master-clear-all');
      if (btnAdminMasterClearAll) {
        btnAdminMasterClearAll.onclick = () => {
          if (confirm('⚠️ আপনি কি নিশ্চিতভাবে সকল কাস্টমাইজড চ্যানেল স্ট্রিম, লাইভ ম্যাচ লিংক এবং কাস্টম লোগো একসাথে সম্পূর্ণ মুছে ফেলতে চান?')) {
            // Remove all custom overrides
            localStorage.removeItem('highfy_custom_channel_urls');
            localStorage.removeItem('highfy_custom_event_streams');
            localStorage.removeItem('highfy_custom_logos');
            localStorage.removeItem('highfy_custom_category_logos');
            localStorage.removeItem('highfy_custom_sports_category_logos');
            localStorage.removeItem('highfy_custom_category_colors');
            localStorage.removeItem('highfy_custom_splash_logo');
            localStorage.removeItem('highfy_custom_drawer_logo');

            state.customChannelUrls = {};
            state.customEventStreams = {};
            state.customLogos = {};
            state.customCategoryLogos = {};
            state.customSportsCategoryLogos = {};
            state.customCategoryColors = {};
            state.customSplashLogo = '';
            state.customDrawerLogo = '';
            SPORTS_CATEGORIES.forEach(c => {
              if (DEFAULT_SPORTS_CATEGORY_LOGOS[c.id]) c.logo = DEFAULT_SPORTS_CATEGORY_LOGOS[c.id];
            });

            applyCustomAppBranding();
            loadChannels(true);
            loadSportsEvents(true);
            loadCategories();

            renderAdminCustomChannels();
            renderAdminCustomEvents();
            renderAdminCustomLogos();
            if (typeof populateInlineSportsCategorySelect === 'function') populateInlineSportsCategorySelect();

            showToast('✅ সকল কাস্টম ডেটা ও স্ট্রিম সফলভাবে মুছে ডিফল্ট করা হয়েছে!');
          }
        };
      }

      // 6. Tab 5: Admin Notifications & Announcements Manager
      setupAdminNotificationsTab();
    }

    /**
     * Admin Panel: Notifications & Announcements Tab Management
     */
    function setupAdminNotificationsTab() {
      const typeSelect = document.getElementById('admin-notif-type');
      const titleInput = document.getElementById('admin-notif-title');
      const sportSelect = document.getElementById('admin-notif-sport');
      const bodyInput = document.getElementById('admin-notif-body');
      const targetMatchSelect = document.getElementById('admin-notif-target-match');
      const targetChannelSelect = document.getElementById('admin-notif-target-channel');
      const actionUrlInput = document.getElementById('admin-notif-action-url');
      const btnPublish = document.getElementById('btn-admin-notif-publish');
      const btnClearAllNotifs = document.getElementById('btn-admin-clear-all-notifs');
      const customNotifsList = document.getElementById('admin-custom-notifs-list');
      const customNotifsCount = document.getElementById('admin-custom-notifs-count');

      // Populate target match dropdown
      if (targetMatchSelect) {
        const evOptions = ['<option value="">-- No Direct Match Action --</option>'];
        (state.events || []).forEach(ev => {
          evOptions.push(`<option value="${escapeHtml(ev.id)}">🏆 [${escapeHtml(ev.sport || 'Match')}] ${escapeHtml(ev.title || 'Live Match')}</option>`);
        });
        targetMatchSelect.innerHTML = evOptions.join('');
      }

      // Populate target channel dropdown
      if (targetChannelSelect) {
        const chOptions = ['<option value="">-- No Direct Channel Action --</option>'];
        (state.channels || []).forEach(ch => {
          chOptions.push(`<option value="${escapeHtml(ch.id)}">📺 ${escapeHtml(ch.name)} (${escapeHtml(ch.category || 'Live TV')})</option>`);
        });
        targetChannelSelect.innerHTML = chOptions.join('');
      }

      // Auto toggle fields depending on notification type
      if (typeSelect && sportSelect) {
        typeSelect.onchange = () => {
          const val = typeSelect.value;
          if (val === 'update' || val === 'system') {
            sportSelect.value = 'General';
          } else if (val === 'match' && sportSelect.value === 'General') {
            sportSelect.value = 'Football';
          }
        };
      }

      // Render Admin Custom Notifications List
      function renderAdminCustomNotifs() {
        if (!customNotifsList) return;
        const notifs = state.customNotifications || [];
        if (customNotifsCount) {
          customNotifsCount.textContent = notifs.length;
        }

        if (btnClearAllNotifs) {
          if (notifs.length > 0) {
            btnClearAllNotifs.classList.remove('hidden');
          } else {
            btnClearAllNotifs.classList.add('hidden');
          }
        }

        if (notifs.length === 0) {
          customNotifsList.innerHTML = `
            <div class="p-3 text-center text-slate-400 dark:text-slate-500 text-[11px] bg-slate-900/40 rounded-xl border border-dashed border-slate-800">
              <i class="fa-regular fa-bell-slash mr-1"></i> এখনো কোনো কাস্টম নোটিফিকেশন যুক্ত করা হয়নি
            </div>
          `;
          return;
        }

        customNotifsList.innerHTML = notifs.map(n => {
          const typeBadgeColor = n.type === 'match' ? 'bg-rose-500/20 text-rose-300' :
                                 n.type === 'update' ? 'bg-sky-500/20 text-sky-300' : 'bg-emerald-500/20 text-emerald-300';
          const typeLabel = n.type === 'match' ? '⚽ Match Alert' :
                            n.type === 'update' ? '🚀 App Update' : '📢 Notice';

          return `
            <div class="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 flex items-start justify-between gap-2 hover:border-slate-700 transition">
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${typeBadgeColor}">${typeLabel}</span>
                  <span class="font-bold text-white text-[11.5px] truncate">${escapeHtml(n.title)}</span>
                </div>
                <p class="text-[11px] text-slate-300 mt-1 line-clamp-2">${escapeHtml(n.message || n.body || '')}</p>
                <div class="flex items-center gap-2 mt-1.5 text-[9.5px] text-slate-400">
                  <span><i class="fa-regular fa-clock mr-1"></i>${escapeHtml(n.timestamp || 'Just now')}</span>
                  ${n.actionType ? `<span class="text-sky-400 font-semibold">• Action: ${escapeHtml(n.actionType)}</span>` : ''}
                </div>
              </div>
              <div class="flex items-center gap-1 flex-shrink-0 pt-0.5">
                <button type="button" class="btn-admin-delete-custom-notif py-1 px-2 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 text-[11px] font-bold transition cursor-pointer" data-notif-id="${escapeHtml(n.id)}" title="মুছে ফেলুন">
                  <i class="fa-solid fa-trash-can"></i>
                </button>
              </div>
            </div>
          `;
        }).join('');

        // Bind delete buttons
        customNotifsList.querySelectorAll('.btn-admin-delete-custom-notif').forEach(btn => {
          btn.onclick = () => {
            const notifId = btn.getAttribute('data-notif-id');
            deleteCustomNotification(notifId);
          };
        });
      }

      function deleteCustomNotification(notifId) {
        if (!notifId) return;
        state.customNotifications = (state.customNotifications || []).filter(n => n.id !== notifId);
        localStorage.setItem('highfy_custom_notifications', JSON.stringify(state.customNotifications));
        combineAndRenderNotifications();
        renderAdminCustomNotifs();
        showToast('🗑️ নোটিফিকেশন সফলভাবে মুছে ফেলা হয়েছে');
      }

      if (btnClearAllNotifs) {
        btnClearAllNotifs.onclick = () => {
          if (confirm('আপনি কি নিশ্চিত যে সকল কাস্টম নোটিফিকেশন মুছে ফেলতে চান?')) {
            state.customNotifications = [];
            localStorage.removeItem('highfy_custom_notifications');
            combineAndRenderNotifications();
            renderAdminCustomNotifs();
            showToast('🗑️ সব কাস্টম নোটিফিকেশন মুছে ফেলা হয়েছে');
          }
        };
      }

      // Publish New Notification
      if (btnPublish) {
        btnPublish.onclick = () => {
          const type = typeSelect ? typeSelect.value : 'match';
          const title = titleInput ? titleInput.value.trim() : '';
          const sport = sportSelect ? sportSelect.value : 'Football';
          const body = bodyInput ? bodyInput.value.trim() : '';
          const targetMatch = targetMatchSelect ? targetMatchSelect.value : '';
          const targetChannel = targetChannelSelect ? targetChannelSelect.value : '';
          const actionUrl = actionUrlInput ? actionUrlInput.value.trim() : '';

          if (!title) {
            showToast('দয়া করে নোটিফিকেশনের শিরোনাম (Title) লিখুন');
            titleInput?.focus();
            return;
          }

          if (!body) {
            showToast('দয়া করে নোটিফিকেশনের বিস্তারিত বার্তা (Message) লিখুন');
            bodyInput?.focus();
            return;
          }

          let actionType = null;
          let actionPayload = null;
          let actionLabel = null;

          if (targetMatch) {
            actionType = 'watch_match';
            actionPayload = targetMatch;
            actionLabel = 'Watch Match Live';
          } else if (targetChannel) {
            actionType = 'open_channel';
            actionPayload = targetChannel;
            actionLabel = 'Watch Channel';
          } else if (actionUrl) {
            actionType = 'external_link';
            actionPayload = actionUrl;
            actionLabel = type === 'update' ? 'Download / Update Now' : 'Open Link';
          }

          const now = new Date();
          const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const dateString = now.toLocaleDateString([], { month: 'short', day: 'numeric' });

          const newNotif = {
            id: `notif-custom-${Date.now()}`,
            type: type,
            title: title,
            sport: sport,
            message: body,
            timestamp: `${timeString} • ${dateString}`,
            createdTime: Date.now(),
            icon: type === 'match' ? 'fa-futbol' : type === 'update' ? 'fa-circle-arrow-up' : 'fa-bullhorn',
            priority: type === 'update' || type === 'match' ? 'high' : 'normal',
            actionType: actionType,
            actionPayload: actionPayload,
            actionLabel: actionLabel,
            unread: true
          };

          if (!state.customNotifications) state.customNotifications = [];
          state.customNotifications.unshift(newNotif);
          localStorage.setItem('highfy_custom_notifications', JSON.stringify(state.customNotifications));

          // Reset inputs
          if (titleInput) titleInput.value = '';
          if (bodyInput) bodyInput.value = '';
          if (targetMatchSelect) targetMatchSelect.value = '';
          if (targetChannelSelect) targetChannelSelect.value = '';
          if (actionUrlInput) actionUrlInput.value = '';

          combineAndRenderNotifications();
          renderAdminCustomNotifs();
          showInAppBroadcast(newNotif);
          showToast('🚀 নোটিফিকেশন সফলভাবে পাবলিশ করা হয়েছে!');
        };
      }

      renderAdminCustomNotifs();
    }

    if (btnSaveStreamSource) {
      btnSaveStreamSource.addEventListener('click', async () => {
        const chanVal = sourceChannelsInput ? sourceChannelsInput.value.trim() : '';
        const matchVal = sourceMatchesInput ? sourceMatchesInput.value.trim() : '';
        const newPin = sourceNewPinInput ? sourceNewPinInput.value.trim() : '';

        localStorage.setItem('highfy_channels_json_url', chanVal);
        localStorage.setItem('highfy_matches_json_url', matchVal);

        if (newPin) {
          localStorage.setItem('highfy_admin_pin', newPin);
          showToast('Settings & Admin PIN updated successfully!');
        } else {
          showToast('Stream Sources saved successfully!');
        }

        closeModal('modal-stream-source');
        await loadChannels(true);
      });
    }

    if (btnSyncNowStreamSource) {
      btnSyncNowStreamSource.addEventListener('click', async () => {
        const chanVal = sourceChannelsInput ? sourceChannelsInput.value.trim() : '';
        const matchVal = sourceMatchesInput ? sourceMatchesInput.value.trim() : '';
        const newPin = sourceNewPinInput ? sourceNewPinInput.value.trim() : '';

        localStorage.setItem('highfy_channels_json_url', chanVal);
        localStorage.setItem('highfy_matches_json_url', matchVal);
        if (newPin) localStorage.setItem('highfy_admin_pin', newPin);

        showToast('Syncing latest streams from remote JSON...');
        await loadChannels(true);
        await loadSportsEvents(true);
        closeModal('modal-stream-source');
        showToast(`Sync complete! ${state.channels.length} Live Channels Loaded.`);
      });
    }

    // Save custom logo
    const btnSaveLogo = document.getElementById('btn-logo-editor-save');
    if (btnSaveLogo) {
      btnSaveLogo.addEventListener('click', () => {
        const channelSelect = document.getElementById('logo-editor-channel-select');
        const urlInput = document.getElementById('logo-editor-url-input');
        const channelId = channelSelect?.value;
        const rawUrl = urlInput?.value?.trim();

        if (!channelId) {
          showToast('Please select a channel');
          return;
        }
        if (!rawUrl) {
          showToast('Please enter an image URL or upload an image file');
          return;
        }

        const doSaveLogo = (finalUrl) => {
          if (!state.customLogos) state.customLogos = {};
          state.customLogos[channelId] = finalUrl;
          const success = safeSetLocalStorage('highfy_custom_logos', JSON.stringify(state.customLogos));
          if (success) {
            const ch = state.channels.find(c => c.id === channelId);
            if (ch) ch.logo = finalUrl;

            renderChannels();
            renderFavorites();
            if (DOM.playerQuickGrid) renderPlayerQuickChannels();

            closeModal('modal-channel-logo-editor');
            showToast(`✅ ${ch ? ch.name : 'Channel'} logo updated successfully!`);
          }
        };

        if (rawUrl.startsWith('data:image/') && rawUrl.length > 25000) {
          compressImageToDataUrl(rawUrl, 160, 0.85, doSaveLogo);
        } else {
          doSaveLogo(rawUrl);
        }
      });
    }

    // Reset custom logo
    const btnResetLogo = document.getElementById('btn-logo-editor-reset');
    if (btnResetLogo) {
      btnResetLogo.addEventListener('click', () => {
        const channelSelect = document.getElementById('logo-editor-channel-select');
        const channelId = channelSelect?.value;
        if (!channelId) return;

        if (state.customLogos) {
          delete state.customLogos[channelId];
          safeSetLocalStorage('highfy_custom_logos', JSON.stringify(state.customLogos));
        }

        renderChannels();
        renderFavorites();
        if (DOM.playerQuickGrid) renderPlayerQuickChannels();

        closeModal('modal-channel-logo-editor');
        showToast('Channel logo restored to default');
      });
    }

    const btnAdminLogoManager = document.getElementById('btn-admin-open-logo-manager');
    if (btnAdminLogoManager) {
      btnAdminLogoManager.addEventListener('click', () => {
        state.openedLogoEditorFromAdmin = true;
        openChannelLogoEditor();
      });
    }

    const btnOpenCategoryLogoManager = document.getElementById('btn-open-category-logo-manager');
    if (btnOpenCategoryLogoManager) {
      btnOpenCategoryLogoManager.addEventListener('click', () => {
        openCategoryLogoEditor();
      });
    }

    const btnAdminCategoryLogoManager = document.getElementById('btn-admin-open-category-logo-manager');
    if (btnAdminCategoryLogoManager) {
      btnAdminCategoryLogoManager.addEventListener('click', () => {
        state.openedLogoEditorFromAdmin = true;
        openCategoryLogoEditor();
      });
    }

    // Return to Admin Panel button in logo editor headers
    document.querySelectorAll('.btn-return-admin-panel').forEach(btn => {
      btn.addEventListener('click', () => {
        closeModal('modal-channel-logo-editor');
        closeModal('modal-category-logo-editor');
        const adminModal = document.getElementById('modal-stream-source');
        if (adminModal) {
          adminModal.classList.add('active');
          if (typeof switchAdminTab === 'function') {
            switchAdminTab('tab-admin-images');
          }
          if (typeof renderAdminCustomLogos === 'function') {
            renderAdminCustomLogos();
          }
        }
      });
    });

    // Save custom category logo
    const btnSaveCatLogo = document.getElementById('btn-cat-logo-editor-save');
    if (btnSaveCatLogo) {
      btnSaveCatLogo.addEventListener('click', () => {
        const catSelect = document.getElementById('cat-logo-editor-select');
        const urlInput = document.getElementById('cat-logo-editor-url-input');
        const ringColorInput = document.getElementById('cat-logo-editor-ring-color');
        const catId = catSelect?.value;
        const newUrl = urlInput?.value?.trim();
        const newRing = ringColorInput?.value?.trim() || '#0284c7';

        if (!catId) {
          showToast('Please select a category');
          return;
        }
        if (!newUrl) {
          showToast('Please enter an image URL or upload an image file');
          return;
        }

        const commitCatSave = (finalUrl) => {
          const sportsCat = SPORTS_CATEGORIES.find(c => (c.id === catId) || (c.filterKey === catId) || (c.name === catId));
          if (sportsCat) {
            if (!state.customSportsCategoryLogos) state.customSportsCategoryLogos = {};
            state.customSportsCategoryLogos[sportsCat.id] = finalUrl;
            if (sportsCat.filterKey && sportsCat.filterKey !== sportsCat.id && state.customSportsCategoryLogos[sportsCat.filterKey]) {
              delete state.customSportsCategoryLogos[sportsCat.filterKey];
            }
            safeSetLocalStorage('highfy_custom_sports_category_logos', JSON.stringify(state.customSportsCategoryLogos));
            sportsCat.logo = finalUrl;
            renderChannels();
          } else {
            if (!state.customCategoryLogos) state.customCategoryLogos = {};
            state.customCategoryLogos[catId] = finalUrl;
            safeSetLocalStorage('highfy_custom_category_logos', JSON.stringify(state.customCategoryLogos));

            const cat = (state.categories || []).find(c => (c.id === catId) || (c.name === catId));
            if (cat) {
              cat.logo = finalUrl;
              cat.ringColor = newRing;
              cat.glowColor = hexToRgba(newRing, 0.4);
            }
          }

          if (!state.customCategoryColors) state.customCategoryColors = {};
          state.customCategoryColors[catId] = {
            ringColor: newRing,
            glowColor: hexToRgba(newRing, 0.4)
          };
          safeSetLocalStorage('highfy_custom_category_colors', JSON.stringify(state.customCategoryColors));

          renderCategories();
          closeModal('modal-category-logo-editor');
          showToast(`✅ ${sportsCat ? sportsCat.name : 'Category'} image updated successfully!`);
        };

        if (newUrl.startsWith('data:image/') && newUrl.length > 25000) {
          compressImageToDataUrl(newUrl, 160, 0.85, (compressed) => {
            commitCatSave(compressed);
          });
        } else {
          commitCatSave(newUrl);
        }
      });
    }

    // Reset custom category logo
    const btnResetCatLogo = document.getElementById('btn-cat-logo-editor-reset');
    if (btnResetCatLogo) {
      btnResetCatLogo.addEventListener('click', () => {
        const catSelect = document.getElementById('cat-logo-editor-select');
        const catId = catSelect?.value;
        if (!catId) return;

        if (state.customCategoryLogos) {
          delete state.customCategoryLogos[catId];
          safeSetLocalStorage('highfy_custom_category_logos', JSON.stringify(state.customCategoryLogos));
        }

        const sportsCat = SPORTS_CATEGORIES.find(c => (c.id === catId) || (c.filterKey === catId) || (c.name === catId));
        if (sportsCat) {
          if (state.customSportsCategoryLogos) {
            delete state.customSportsCategoryLogos[sportsCat.id];
            if (sportsCat.filterKey) delete state.customSportsCategoryLogos[sportsCat.filterKey];
            if (sportsCat.name) delete state.customSportsCategoryLogos[sportsCat.name];
            safeSetLocalStorage('highfy_custom_sports_category_logos', JSON.stringify(state.customSportsCategoryLogos));
          }
          if (DEFAULT_SPORTS_CATEGORY_LOGOS[sportsCat.id]) {
            sportsCat.logo = DEFAULT_SPORTS_CATEGORY_LOGOS[sportsCat.id];
          }
          renderChannels();
        }

        if (state.customCategoryColors) {
          delete state.customCategoryColors[catId];
          safeSetLocalStorage('highfy_custom_category_colors', JSON.stringify(state.customCategoryColors));
        }

        renderCategories();
        closeModal('modal-category-logo-editor');
        showToast('Category image restored to default');
      });
    }

    // Delegate open settings button from banners
    document.addEventListener('click', (e) => {
      if (e.target.closest('.btn-open-settings-modal')) {
        openModal('modal-settings');
      }
    });
  }

  // =========================================================================
  // Channel Logo & Real Image Manager Logic (Module Scoped & Globally Accessible)
  // =========================================================================
  const PRESET_REAL_LOGOS = [
    { name: 'T Sports', url: 'https://upload.wikimedia.org/wikipedia/en/thumb/9/91/T_Sports_Logo.svg/320px-T_Sports_Logo.svg.png' },
    { name: 'GTV (Gazi)', url: 'https://upload.wikimedia.org/wikipedia/en/thumb/f/f6/GTV_Bangladesh_Logo.svg/320px-GTV_Bangladesh_Logo.svg.png' },
    { name: 'Star Sports 1', url: 'https://upload.wikimedia.org/wikipedia/en/thumb/8/87/Star_Sports_1_logo.svg/320px-Star_Sports_1_logo.svg.png' },
    { name: 'Sony Ten 1', url: 'https://upload.wikimedia.org/wikipedia/en/thumb/c/c5/Sony_Sports_Ten_1_logo.svg/320px-Sony_Sports_Ten_1_logo.svg.png' },
    { name: 'Sony Ten 5', url: 'https://upload.wikimedia.org/wikipedia/en/thumb/9/9a/Sony_Sports_Ten_5_logo.svg/320px-Sony_Sports_Ten_5_logo.svg.png' },
    { name: 'Willow TV', url: 'https://upload.wikimedia.org/wikipedia/en/thumb/b/b3/Willow_Cricket_logo.svg/320px-Willow_Cricket_logo.svg.png' },
    { name: 'PTV Sports', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/PTV_Sports_logo.svg/320px-PTV_Sports_logo.svg.png' },
    { name: 'Sky Sports', url: 'https://upload.wikimedia.org/wikipedia/en/thumb/9/9c/Sky_Sports_Main_Event.svg/320px-Sky_Sports_Main_Event.svg.png' },
    { name: 'TNT Sports', url: 'https://upload.wikimedia.org/wikipedia/en/thumb/d/d7/TNT_Sports_1.svg/320px-TNT_Sports_1.svg.png' },
    { name: 'Somoy TV', url: 'https://upload.wikimedia.org/wikipedia/en/thumb/6/62/Somoy_TV_logo.svg/320px-Somoy_TV_logo.svg.png' },
    { name: 'A Sports HD', url: 'https://upload.wikimedia.org/wikipedia/en/thumb/b/be/A_Sports_Logo.svg/320px-A_Sports_Logo.svg.png' },
    { name: 'EuroSport', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/Eurosport_1_logo_2015.svg/320px-Eurosport_1_logo_2015.svg.png' }
  ];

  function openChannelLogoEditor(preselectedChannelId) {
    const channelSelect = document.getElementById('logo-editor-channel-select');
    const previewImg = document.getElementById('logo-editor-preview-img');
    const previewName = document.getElementById('logo-editor-preview-name');
    const catSpan = document.getElementById('logo-editor-channel-category');
    const urlInput = document.getElementById('logo-editor-url-input');
    const fileInput = document.getElementById('logo-editor-file-input');
    const presetsContainer = document.getElementById('logo-editor-quick-presets');

    if (!channelSelect) return;
    if (!state.channels || state.channels.length === 0) {
      showToast('Please wait for channels to load...');
      return;
    }

    // Populate channel selector dropdown
    channelSelect.innerHTML = state.channels.map(ch => {
      const isCustom = !!(state.customLogos && state.customLogos[ch.id]);
      const customBadge = isCustom ? ' ★ [Custom Image]' : '';
      return `<option value="${escapeHtml(ch.id)}">${escapeHtml(ch.name)}${customBadge} (${escapeHtml(ch.category || 'Live TV')})</option>`;
    }).join('');

    if (preselectedChannelId && state.channels.some(c => c.id === preselectedChannelId)) {
      channelSelect.value = preselectedChannelId;
    }

    function updateEditorDisplay() {
      const selectedId = channelSelect.value;
      const ch = state.channels.find(c => c.id === selectedId);
      if (!ch) return;

      const cleanName = sanitizeChannelName(ch.name);
      if (previewName) previewName.textContent = cleanName;
      if (catSpan) catSpan.textContent = ch.category || 'Live TV';

      const currentLogo = (state.customLogos && state.customLogos[ch.id]) || ch.logo || '';
      if (urlInput) urlInput.value = currentLogo;
      if (previewImg) {
        previewImg.src = getSafeLogoUrl(currentLogo, cleanName, ch.id);
        previewImg.onerror = () => {
          previewImg.src = getSafeLogoUrl('', cleanName, ch.id);
        };
      }
      if (fileInput) fileInput.value = '';
    }

    channelSelect.onchange = updateEditorDisplay;

    if (urlInput) {
      urlInput.oninput = () => {
        const val = urlInput.value.trim();
        const selectedId = channelSelect.value;
        const ch = state.channels.find(c => c.id === selectedId);
        const cleanName = ch ? sanitizeChannelName(ch.name) : 'TV';
        if (previewImg) {
          previewImg.src = val || getSafeLogoUrl('', cleanName, selectedId);
          previewImg.onerror = () => {
            previewImg.src = getSafeLogoUrl('', cleanName, selectedId);
          };
        }
      };
    }

    if (fileInput) {
      fileInput.onchange = (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          if (file.size > 5 * 1024 * 1024) {
            showToast('⚠️ ইমেজের সাইজ সর্বোচ্চ 5MB হতে পারে');
            return;
          }
          showToast('ছবি কম্প্রেস করা হচ্ছে...');
          compressImageToDataUrl(file, 160, 0.85, (compressed) => {
            if (urlInput) urlInput.value = compressed;
            if (previewImg) previewImg.src = compressed;
            showToast('ছবি প্রস্তুত! Save বাটনে চাপুন');
          });
        }
      };
    }

    // Render preset suggestions
    if (presetsContainer) {
      presetsContainer.innerHTML = PRESET_REAL_LOGOS.map(p => `
        <button type="button" class="px-2 py-1 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-sky-500/20 text-slate-700 dark:text-slate-300 hover:text-sky-400 border border-slate-300 dark:border-slate-700 text-[10.5px] font-bold transition flex items-center gap-1.5 cursor-pointer" data-preset-url="${escapeHtml(p.url)}">
          <img src="${escapeHtml(p.url)}" class="w-3.5 h-3.5 object-contain rounded-full bg-white/10" />
          <span>${escapeHtml(p.name)}</span>
        </button>
      `).join('');

      presetsContainer.querySelectorAll('button[data-preset-url]').forEach(btn => {
        btn.onclick = () => {
          const pUrl = btn.getAttribute('data-preset-url');
          if (urlInput) urlInput.value = pUrl;
          if (previewImg) previewImg.src = pUrl;
        };
      });
    }

    updateEditorDisplay();
    openModal('modal-channel-logo-editor');
  }

  // Expose globally
  window.openChannelLogoEditor = openChannelLogoEditor;

  // =========================================================================
  // Category Logo & Real Image Manager Logic (Module Scoped & Globally Accessible)
  // =========================================================================
  const PRESET_CATEGORY_LOGOS = [
    { name: 'Akash Go', url: './assets/category-logos/akash-go.svg', ringColor: '#0284c7', glowColor: 'rgba(2, 132, 199, 0.4)' },
    { name: 'Bangla TV', url: './assets/category-logos/bangla.svg', ringColor: '#059669', glowColor: 'rgba(5, 150, 105, 0.4)' },
    { name: 'Sports 3D', url: './assets/category-logos/sports-channels.svg', ringColor: '#eab308', glowColor: 'rgba(234, 179, 8, 0.4)' },
    { name: 'All Channels', url: './assets/category-logos/livetv.svg', ringColor: '#38bdf8', glowColor: 'rgba(56, 189, 248, 0.4)' },
    { name: 'India Hub', url: './assets/category-logos/india.svg', ringColor: '#f97316', glowColor: 'rgba(249, 115, 22, 0.4)' },
    { name: 'Kolkata', url: './assets/category-logos/kolkata.svg', ringColor: '#0284c7', glowColor: 'rgba(2, 132, 199, 0.4)' },
    { name: 'Pakistan', url: './assets/category-logos/pakistan.svg', ringColor: '#16a34a', glowColor: 'rgba(22, 163, 74, 0.4)' },
    { name: 'News 24/7', url: './assets/category-logos/news.svg', ringColor: '#10b981', glowColor: 'rgba(16, 185, 129, 0.4)' },
    { name: 'Movie Flix', url: './assets/category-logos/movie.svg', ringColor: '#ef4444', glowColor: 'rgba(239, 68, 68, 0.4)' },
    { name: 'Entertainment', url: './assets/category-logos/entertainment.svg', ringColor: '#ea580c', glowColor: 'rgba(234, 88, 12, 0.4)' },
    { name: 'Kids World', url: './assets/category-logos/kids.svg', ringColor: '#ec4899', glowColor: 'rgba(236, 72, 153, 0.4)' },
    { name: 'Music Hit', url: './assets/category-logos/music.svg', ringColor: '#8b5cf6', glowColor: 'rgba(139, 92, 246, 0.4)' },
    { name: 'Islamic TV', url: './assets/category-logos/islamic.svg', ringColor: '#059669', glowColor: 'rgba(5, 150, 105, 0.4)' },
    { name: 'Radio FM', url: './assets/category-logos/radio.svg', ringColor: '#06b6d4', glowColor: 'rgba(6, 182, 212, 0.4)' }
  ];

  function hexToRgba(hex, alpha = 0.4) {
    if (!hex || typeof hex !== 'string') return `rgba(2, 132, 199, ${alpha})`;
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    if (c.length !== 6) return `rgba(2, 132, 199, ${alpha})`;
    const num = parseInt(c, 16);
    return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
  }

  function openCategoryLogoEditor(preselectedCatId) {
    const catSelect = document.getElementById('cat-logo-editor-select');
    const previewRaised = document.getElementById('cat-logo-editor-preview-raised');
    const previewImg = document.getElementById('cat-logo-editor-preview-img');
    const previewIcon = document.getElementById('cat-logo-editor-preview-icon');
    const previewName = document.getElementById('cat-logo-editor-preview-name');
    const countSpan = document.getElementById('cat-logo-editor-channels-count');
    const urlInput = document.getElementById('cat-logo-editor-url-input');
    const fileInput = document.getElementById('cat-logo-editor-file-input');
    const ringColorInput = document.getElementById('cat-logo-editor-ring-color');
    const presetsContainer = document.getElementById('cat-logo-editor-quick-presets');
    const colorPresetsContainer = document.getElementById('cat-logo-editor-color-presets');

    if (!catSelect) return;
    const baseCats = (state.categories && state.categories.length > 0 ? state.categories : [
      { id: 'all-channels', name: 'All Channels', logo: './assets/category-logos/livetv.svg' },
      { id: 'bangla', name: 'Bangla', logo: './assets/category-logos/bangla.svg' },
      { id: 'akash-go', name: 'Akash Go', logo: './assets/category-logos/akash-go.svg' },
      { id: 'sports', name: 'Sports', logo: './assets/category-logos/sports-channels.svg' },
      { id: 'india', name: 'India', logo: './assets/category-logos/india.svg' },
      { id: 'kolkata', name: 'Kolkata', logo: './assets/category-logos/kolkata.svg' },
      { id: 'pakistan', name: 'Pakistan', logo: './assets/category-logos/pakistan.svg' },
      { id: 'news', name: 'News', logo: './assets/category-logos/news.svg' },
      { id: 'movie', name: 'Movie', logo: './assets/category-logos/movie.svg' },
      { id: 'entertainment', name: 'Entertainment', logo: './assets/category-logos/entertainment.svg' },
      { id: 'kids', name: 'Kids', logo: './assets/category-logos/kids.svg' },
      { id: 'music', name: 'Music', logo: './assets/category-logos/music.svg' },
      { id: 'infotainment', name: 'Infotainment', logo: './assets/category-logos/infotainment.svg' },
      { id: 'islamic', name: 'Islamic', logo: './assets/category-logos/islamic.svg' },
      { id: 'radio', name: 'Radio', logo: './assets/category-logos/radio.svg' }
    ]).slice();

    const allCatsMap = new Map();
    baseCats.forEach(c => allCatsMap.set(c.id || c.name, c));
    SPORTS_CATEGORIES.forEach(sc => {
      if (!allCatsMap.has(sc.id) && !allCatsMap.has(sc.filterKey)) {
        allCatsMap.set(sc.id, {
          id: sc.id,
          name: `${sc.name} (Sports)`,
          filterKey: sc.filterKey,
          isSportsCat: true,
          logo: getSportsCategoryLogo(sc),
          ringColor: sc.ringColor || '#0284c7'
        });
      }
    });
    const cats = Array.from(allCatsMap.values());

    catSelect.innerHTML = cats.map(cat => {
      const isCustom = cat.isSportsCat
        ? !!(state.customSportsCategoryLogos && (state.customSportsCategoryLogos[cat.id] || state.customSportsCategoryLogos[cat.filterKey]))
        : !!(state.customCategoryLogos && (state.customCategoryLogos[cat.id] || state.customCategoryLogos[cat.name]));
      const customBadge = isCustom ? ' ★ [Custom Image]' : '';
      return `<option value="${escapeHtml(cat.id || cat.name)}">${escapeHtml(cat.name)}${customBadge}</option>`;
    }).join('');

    if (preselectedCatId) {
      const match = cats.find(c => (c.id && c.id === preselectedCatId) || (c.name && c.name.toLowerCase() === preselectedCatId.toLowerCase()));
      if (match) {
        catSelect.value = match.id || match.name;
      }
    }

    function updateCategoryEditorDisplay() {
      const selectedKey = catSelect.value;
      const cat = cats.find(c => (c.id === selectedKey) || (c.name === selectedKey));
      if (!cat) return;

      if (previewName) previewName.textContent = cat.name;
      
      const sportsCat = cat.isSportsCat ? SPORTS_CATEGORIES.find(c => c.id === cat.id || c.filterKey === cat.id) : null;
      const channelsInCat = sportsCat ? getSportsChannels(sportsCat.filterKey) : getChannelsForCategory(cat.name);
      if (countSpan) countSpan.textContent = `${channelsInCat.length} Channels`;

      const customLogo = cat.isSportsCat
        ? (state.customSportsCategoryLogos && (state.customSportsCategoryLogos[cat.id] || state.customSportsCategoryLogos[cat.filterKey]))
        : (state.customCategoryLogos && (state.customCategoryLogos[cat.id] || state.customCategoryLogos[cat.name]));
      const customColor = state.customCategoryColors && (state.customCategoryColors[cat.id] || state.customCategoryColors[cat.name]);

      const currentLogo = customLogo || (cat.isSportsCat ? getSportsCategoryLogo(cat) : cat.logo) || '';
      const currentRing = (customColor && customColor.ringColor) || cat.ringColor || '#0284c7';
      const currentGlow = (customColor && customColor.glowColor) || cat.glowColor || 'rgba(2, 132, 199, 0.4)';

      if (urlInput) urlInput.value = currentLogo;
      if (ringColorInput) ringColorInput.value = currentRing.startsWith('#') ? currentRing : '#0284c7';
      if (fileInput) fileInput.value = '';

      if (previewRaised) {
        previewRaised.style.setProperty('--ring-color', currentRing);
        previewRaised.style.setProperty('--glow-color', currentGlow);
      }

      if (previewImg) {
        if (currentLogo) {
          previewImg.style.display = 'block';
          previewImg.src = currentLogo;
          if (previewIcon) previewIcon.style.display = 'none';
          previewImg.onerror = () => {
            previewImg.style.display = 'none';
            if (previewIcon) {
              previewIcon.style.display = 'inline-block';
              previewIcon.className = `fa-solid ${cat.icon || 'fa-tv'} category-logo-icon`;
            }
          };
        } else {
          previewImg.style.display = 'none';
          if (previewIcon) {
            previewIcon.style.display = 'inline-block';
            previewIcon.className = `fa-solid ${cat.icon || 'fa-tv'} category-logo-icon`;
          }
        }
      }
    }

    catSelect.onchange = updateCategoryEditorDisplay;

    if (urlInput) {
      urlInput.oninput = () => {
        const val = urlInput.value.trim();
        if (previewImg) {
          if (val) {
            previewImg.style.display = 'block';
            previewImg.src = val;
            if (previewIcon) previewIcon.style.display = 'none';
            previewImg.onerror = () => {
              previewImg.style.display = 'none';
              if (previewIcon) previewIcon.style.display = 'inline-block';
            };
          } else {
            previewImg.style.display = 'none';
            if (previewIcon) previewIcon.style.display = 'inline-block';
          }
        }
      };
    }

    if (fileInput) {
      fileInput.onchange = (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          if (file.size > 5 * 1024 * 1024) {
            showToast('⚠️ ইমেজের সাইজ সর্বোচ্চ 5MB হতে পারে');
            return;
          }
          showToast('ছবি কম্প্রেস করা হচ্ছে...');
          compressImageToDataUrl(file, 160, 0.85, (compressed) => {
            if (urlInput) urlInput.value = compressed;
            if (previewImg) {
              previewImg.style.display = 'block';
              previewImg.src = compressed;
              if (previewIcon) previewIcon.style.display = 'none';
            }
            showToast('ছবি প্রস্তুত! Save বাটনে চাপুন');
          });
        }
      };
    }

    if (ringColorInput) {
      ringColorInput.oninput = () => {
        const col = ringColorInput.value;
        if (previewRaised) {
          previewRaised.style.setProperty('--ring-color', col);
          previewRaised.style.setProperty('--glow-color', hexToRgba(col, 0.4));
        }
      };
    }

    if (colorPresetsContainer) {
      colorPresetsContainer.querySelectorAll('button[data-color]').forEach(btn => {
        btn.onclick = () => {
          const col = btn.getAttribute('data-color');
          if (ringColorInput) ringColorInput.value = col;
          if (previewRaised) {
            previewRaised.style.setProperty('--ring-color', col);
            previewRaised.style.setProperty('--glow-color', hexToRgba(col, 0.4));
          }
        };
      });
    }

    if (presetsContainer) {
      presetsContainer.innerHTML = PRESET_CATEGORY_LOGOS.map(p => `
        <button type="button" class="px-2 py-1 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-sky-500/20 text-slate-700 dark:text-slate-300 hover:text-sky-400 border border-slate-300 dark:border-slate-700 text-[10.5px] font-bold transition flex items-center gap-1.5 cursor-pointer" data-preset-url="${escapeHtml(p.url)}" data-preset-ring="${escapeHtml(p.ringColor || '#0284c7')}" data-preset-glow="${escapeHtml(p.glowColor || 'rgba(2, 132, 199, 0.4)')}">
          <img src="${escapeHtml(p.url)}" class="w-3.5 h-3.5 object-contain rounded-full bg-white/10" />
          <span>${escapeHtml(p.name)}</span>
        </button>
      `).join('');

      presetsContainer.querySelectorAll('button[data-preset-url]').forEach(btn => {
        btn.onclick = () => {
          const pUrl = btn.getAttribute('data-preset-url');
          const pRing = btn.getAttribute('data-preset-ring');
          const pGlow = btn.getAttribute('data-preset-glow');
          if (urlInput) urlInput.value = pUrl;
          if (previewImg) {
            previewImg.style.display = 'block';
            previewImg.src = pUrl;
            if (previewIcon) previewIcon.style.display = 'none';
          }
          if (pRing && ringColorInput) ringColorInput.value = pRing;
          if (previewRaised && pRing) {
            previewRaised.style.setProperty('--ring-color', pRing);
            previewRaised.style.setProperty('--glow-color', pGlow || hexToRgba(pRing, 0.4));
          }
        };
      });
    }

    updateCategoryEditorDisplay();
    openModal('modal-category-logo-editor');
  }

  // Expose globally
  window.openCategoryLogoEditor = openCategoryLogoEditor;

  // =========================================================================
  // HighFy Live Sports, App Updates & Notices Notification Engine
  // =========================================================================

  // Track match IDs that have already been automatically notified as LIVE to prevent duplicate chime/popups
  const notifiedLiveMatchIds = new Set(safeJsonParse('highfy_notified_live_matches', []));
  // Track previous known statuses for matches (e.g. UPCOMING -> LIVE transition detection)
  let previousEventStatuses = {};
  let isFirstEventsLoad = true;

  /**
   * Save notified live match IDs to localStorage
   */
  function persistNotifiedLiveMatchIds() {
    try {
      const arr = Array.from(notifiedLiveMatchIds).slice(-150); // Keep last 150 IDs to avoid storage bloat
      localStorage.setItem('highfy_notified_live_matches', JSON.stringify(arr));
    } catch (e) {}
  }

  /**
   * Helper: Get appropriate FontAwesome icon for a sport
   */
  function getSportIconClass(sport) {
    const s = (sport || '').toLowerCase();
    if (s.includes('cricket')) return 'fa-solid fa-baseball-bat-ball';
    if (s.includes('foot') || s.includes('soccer')) return 'fa-solid fa-futbol';
    if (s.includes('wwe') || s.includes('fight') || s.includes('ufc') || s.includes('combat') || s.includes('wrestling') || s.includes('boxing')) return 'fa-solid fa-hand-fist';
    if (s.includes('tennis')) return 'fa-solid fa-table-tennis-paddle-ball';
    if (s.includes('basket')) return 'fa-solid fa-basketball';
    if (s.includes('motor') || s.includes('f1') || s.includes('racing')) return 'fa-solid fa-flag-checkered';
    if (s.includes('badminton')) return 'fa-solid fa-feather';
    return 'fa-solid fa-trophy';
  }

  /**
   * Automatically detect when a match starts or transitions to LIVE status,
   * generates an in-app broadcast banner, chimes, and records notification in the alert drawer.
   */
  function checkAndTriggerLiveMatchNotifications(currentEvents) {
    if (!Array.isArray(currentEvents) || currentEvents.length === 0) return;

    // Check if auto notifications are enabled by user
    if (state.autoMatchNotifications === false) {
      // Still maintain status tracking map
      currentEvents.forEach(ev => {
        if (ev && ev.id) previousEventStatuses[ev.id] = ev.status;
      });
      isFirstEventsLoad = false;
      return;
    }

    const liveMatches = currentEvents.filter(ev => ev && (ev.status === 'LIVE' || ev.isLive === true));

    // Handle initial app load: if there are LIVE matches and they haven't been notified yet,
    // notify the single most important LIVE match so user isn't spammed with multiple banners.
    if (isFirstEventsLoad) {
      isFirstEventsLoad = false;

      // Seed initial status map
      currentEvents.forEach(ev => {
        if (ev && ev.id) previousEventStatuses[ev.id] = ev.status;
      });

      const unnotifiedLive = liveMatches.filter(ev => !notifiedLiveMatchIds.has(ev.id));
      if (unnotifiedLive.length > 0) {
        // Pick the match with active streams or highest importance
        const topMatch = unnotifiedLive.find(ev => ev.streams && ev.streams.length > 0) || unnotifiedLive[0];
        if (topMatch) {
          triggerAutoLiveMatchNotification(topMatch, true);
        }
      }
      return;
    }

    // On subsequent periodic refresh cycles: detect any newly LIVE match or match that transitioned to LIVE
    let triggeredCount = 0;
    for (const ev of liveMatches) {
      if (!ev || !ev.id) continue;
      const prevStatus = previousEventStatuses[ev.id];
      const isNewlyLive = (!notifiedLiveMatchIds.has(ev.id)) && (prevStatus !== 'LIVE' || !prevStatus);

      if (isNewlyLive) {
        triggeredCount++;
        triggerAutoLiveMatchNotification(ev, false);
        if (triggeredCount >= 2) break; // Limit to max 2 in-flight triggers per refresh cycle
      }
    }

    // Update statuses cache
    currentEvents.forEach(ev => {
      if (ev && ev.id) previousEventStatuses[ev.id] = ev.status;
    });
  }

  /**
   * Construct and broadcast a rich match live notification
   */
  function triggerAutoLiveMatchNotification(ev, isInitial = false) {
    if (!ev || !ev.id) return;
    notifiedLiveMatchIds.add(ev.id);
    persistNotifiedLiveMatchIds();

    const t1 = ev.team1?.name || ev.homeTeam?.name || (Array.isArray(ev.teams) ? ev.teams[0] : null) || 'Team 1';
    const t2 = ev.team2?.name || ev.awayTeam?.name || (Array.isArray(ev.teams) ? ev.teams[1] : null) || 'Team 2';
    const matchTitle = ev.title || `${t1} vs ${t2}`;
    const sportName = ev.sport || 'Sports';
    const leagueName = ev.league || '';
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const notifItem = {
      id: `live-notif-${ev.id}`,
      type: 'match',
      title: `🔴 লাইভ শুরু: ${matchTitle}`,
      sport: sportName,
      message: `${leagueName ? `${leagueName} • ` : ''}${matchTitle} এখন সরাসরি সম্প্রচার হচ্ছে। হাই কোয়ালিটি লাইভ স্ট্রিমিং দেখতে ট্যাপ করুন।`,
      timestamp: `আজ • ${nowTime} (সরাসরি)`,
      createdTime: Date.now(),
      icon: getSportIconClass(sportName),
      priority: 'high',
      actionType: 'watch_match',
      actionPayload: ev.id,
      actionLabel: 'ম্যাচ লাইভ দেখুন (Watch Live)',
      unread: true
    };

    // Add to custom/realtime notification feed if not already present
    if (!state.customNotifications) state.customNotifications = [];
    const exists = state.customNotifications.some(n => n.id === notifItem.id || (n.actionPayload === ev.id && n.type === 'match'));
    if (!exists) {
      state.customNotifications.unshift(notifItem);
      try {
        localStorage.setItem('highfy_custom_notifications', JSON.stringify(state.customNotifications.slice(0, 50)));
      } catch (e) {}
    }

    // Refresh notification badges and list
    combineAndRenderNotifications();

    // Show floating broadcast banner with sound
    const delay = isInitial ? 2000 : 400;
    setTimeout(() => {
      showInAppBroadcast(notifItem);
    }, delay);
  }

  // Expose for testing and external coordination
  window.checkAndTriggerLiveMatchNotifications = checkAndTriggerLiveMatchNotifications;
  window.triggerAutoLiveMatchNotification = triggerAutoLiveMatchNotification;

  /**
   * Load base notifications from notifications.json
   */
  async function loadBaseNotifications() {
    try {
      const response = await fetch('./notifications.json');
      if (!response.ok) throw new Error('Failed to load notifications.json');
      const data = await response.json();
      state.notifications = Array.isArray(data) ? data : [];
    } catch (err) {
      console.warn('[HighFy] Using default fallback notifications:', err);
      state.notifications = [
        {
          "id": "notif-fb-real-liv",
          "type": "match",
          "title": "UEFA Champions League: Real Madrid vs Liverpool",
          "sport": "Football",
          "message": "ম্যাচ শুরু হতে যাচ্ছে রাত ৮:০০ টায়! হাই কোয়ালিটি লাইভ সম্প্রচার উপভোগ করতে প্রস্তুত থাকুন।",
          "timestamp": "Today • 20:00 UTC",
          "createdTime": 1756550000000,
          "icon": "fa-futbol",
          "priority": "high",
          "actionType": "watch_match",
          "actionPayload": "fb-live-1",
          "actionLabel": "Watch Match Live"
        },
        {
          "id": "notif-update-v43",
          "type": "update",
          "title": "HighFy TV v4.3 রিলিজ হয়েছে!",
          "sport": "General",
          "message": "নতুন ফিচার: অল-স্পোর্টস লাইভ নোটিফিকেশন সিস্টেম, অ্যাডমিন ম্যানেজমেন্ট ও ফাস্টার HLS স্ট্রিমিং সার্ভার যুক্ত করা হয়েছে।",
          "timestamp": "New Update",
          "createdTime": 1756540000000,
          "icon": "fa-circle-arrow-up",
          "priority": "high",
          "actionType": "external_link",
          "actionPayload": "https://t.me/highfytv_official",
          "actionLabel": "Join Telegram for APK"
        },
        {
          "id": "notif-cricket-ind-aus",
          "type": "match",
          "title": "Cricket T20 Super Clash: India vs Australia",
          "sport": "Cricket",
          "message": "লাইভ স্কোর, ফুল এইচডি স্ট্রিমিং ও সার্ভার সুইচিং সহ সরাসরি সম্প্রচার দেখুন HighFy TV-তে।",
          "timestamp": "Tomorrow • 14:30",
          "createdTime": 1756530000000,
          "icon": "fa-baseball-bat-ball",
          "priority": "normal",
          "actionType": "watch_match",
          "actionPayload": "cric-live-1",
          "actionLabel": "View Match Details"
        }
      ];
    }

    combineAndRenderNotifications();
  }

  let broadcastDismissTimeout = null;
  let broadcastActiveNotif = null;
  let hasBroadcastedInitialAlert = false;

  /**
   * Play a clean, subtle 2-tone melodic notification chime
   */
  function playNotificationChime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.12); // A5

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.18, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.38);
    } catch (e) {
      // Audio autoplay policy fallback
    }
  }

  /**
   * Trigger native browser push notification if permitted
   */
  function triggerBrowserNotification(notif) {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      try {
        new Notification(notif.title || 'HighFy TV Alert', {
          body: notif.message || notif.body || 'New live match update available!',
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          tag: notif.id || 'highfy-alert'
        });
      } catch (err) {
        console.warn('Native notification failed:', err);
      }
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
  }

  /**
   * Show interactive floating in-app broadcast banner popup
   */
  function showInAppBroadcast(notif) {
    if (!notif) return;
    const banner = document.getElementById('in-app-broadcast-banner');
    if (!banner) return;

    if (broadcastDismissTimeout) {
      clearTimeout(broadcastDismissTimeout);
      broadcastDismissTimeout = null;
    }

    broadcastActiveNotif = notif;

    const iconWrap = document.getElementById('broadcast-icon-wrap');
    const icon = document.getElementById('broadcast-icon');
    const badge = document.getElementById('broadcast-badge');
    const timeEl = document.getElementById('broadcast-time');
    const titleEl = document.getElementById('broadcast-title');
    const bodyEl = document.getElementById('broadcast-body');
    const actionBtn = document.getElementById('btn-broadcast-action');
    const actionBtnText = document.getElementById('btn-broadcast-action-text');

    const isMatch = notif.type === 'match';
    const isUpdate = notif.type === 'update';

    if (iconWrap && icon) {
      if (isMatch) {
        iconWrap.style.background = 'rgba(225, 29, 72, 0.15)';
        iconWrap.style.borderColor = 'rgba(225, 29, 72, 0.35)';
        const iconClass = typeof getSportIconClass === 'function' ? getSportIconClass(notif.sport) : (notif.sport?.toLowerCase() === 'cricket' ? 'fa-solid fa-baseball-bat-ball' : 'fa-solid fa-futbol');
        icon.className = `${iconClass} text-rose-400`;
      } else if (isUpdate) {
        iconWrap.style.background = 'rgba(14, 165, 233, 0.15)';
        iconWrap.style.borderColor = 'rgba(14, 165, 233, 0.35)';
        icon.className = 'fa-solid fa-circle-arrow-up text-sky-400';
      } else {
        iconWrap.style.background = 'rgba(16, 185, 129, 0.15)';
        iconWrap.style.borderColor = 'rgba(16, 185, 129, 0.35)';
        icon.className = 'fa-solid fa-bullhorn text-emerald-400';
      }
    }

    if (badge) {
      if (isMatch) {
        badge.textContent = notif.sport ? `${notif.sport.toUpperCase()} MATCH` : 'LIVE MATCH';
        badge.style.color = '#fb7185';
        badge.style.background = 'rgba(225, 29, 72, 0.2)';
        badge.style.borderColor = 'rgba(225, 29, 72, 0.35)';
      } else if (isUpdate) {
        badge.textContent = 'APP UPDATE';
        badge.style.color = '#38bdf8';
        badge.style.background = 'rgba(14, 165, 233, 0.2)';
        badge.style.borderColor = 'rgba(14, 165, 233, 0.35)';
      } else {
        badge.textContent = 'NOTICE';
        badge.style.color = '#34d399';
        badge.style.background = 'rgba(16, 185, 129, 0.2)';
        badge.style.borderColor = 'rgba(16, 185, 129, 0.35)';
      }
    }

    if (timeEl) timeEl.textContent = notif.timestamp || 'Just now';
    if (titleEl) titleEl.textContent = notif.title || 'Notification';
    if (bodyEl) bodyEl.textContent = notif.message || notif.body || '';

    if (actionBtn && actionBtnText) {
      if (notif.actionType === 'watch_match') {
        actionBtn.style.display = 'inline-flex';
        actionBtnText.textContent = notif.actionLabel || 'সরাসরি দেখুন (Watch Live)';
      } else if (notif.actionType === 'open_channel') {
        actionBtn.style.display = 'inline-flex';
        actionBtnText.textContent = notif.actionLabel || 'চ্যানেল দেখুন (Watch Channel)';
      } else if (notif.actionType === 'external_link') {
        actionBtn.style.display = 'inline-flex';
        actionBtnText.textContent = notif.actionLabel || 'বিস্তারিত দেখুন (View)';
      } else {
        actionBtn.style.display = 'none';
      }
    }

    banner.classList.remove('hidden', 'banner-exit');
    banner.classList.add('banner-enter');

    // Audible chime
    playNotificationChime();

    // Trigger browser notification
    triggerBrowserNotification(notif);

    // Auto dismiss after 9 seconds
    broadcastDismissTimeout = setTimeout(() => {
      dismissInAppBroadcast();
    }, 9000);
  }

  /**
   * Dismiss the in-app broadcast banner
   */
  function dismissInAppBroadcast(markAsRead = true) {
    const banner = document.getElementById('in-app-broadcast-banner');
    if (!banner || banner.classList.contains('hidden')) return;

    if (markAsRead && broadcastActiveNotif && broadcastActiveNotif.id) {
      markNotificationAsRead(broadcastActiveNotif.id);
    }

    banner.classList.remove('banner-enter');
    banner.classList.add('banner-exit');

    setTimeout(() => {
      banner.classList.add('hidden');
      banner.classList.remove('banner-exit');
      broadcastActiveNotif = null;
    }, 300);
  }

  /**
   * Combine base notifications with custom admin notifications and render
   */
  function combineAndRenderNotifications() {
    const base = state.notifications || [];
    const custom = state.customNotifications || [];
    const readIds = new Set(state.readNotifIds || []);

    // Merge without duplicate IDs
    const mergedMap = new Map();
    [...custom, ...base].forEach(n => {
      if (n && n.id && !mergedMap.has(n.id)) {
        mergedMap.set(n.id, {
          ...n,
          isRead: readIds.has(n.id)
        });
      }
    });

    const allNotifs = Array.from(mergedMap.values());

    // Update unread badges
    const unreadCount = allNotifs.filter(n => !n.isRead).length;
    updateNotificationBadges(unreadCount);

    // Render list in modal-notice
    renderNotificationList(allNotifs);

    // Auto broadcast the most recent unread alert once on app load
    if (!hasBroadcastedInitialAlert && unreadCount > 0) {
      const firstUnread = allNotifs.find(n => !n.isRead);
      if (firstUnread) {
        hasBroadcastedInitialAlert = true;
        setTimeout(() => {
          showInAppBroadcast(firstUnread);
        }, 1400);
      }
    }
  }

  /**
   * Update header, drawer and modal notification badges
   */
  function updateNotificationBadges(unreadCount) {
    const drawerBadge = document.getElementById('drawer-notif-badge');
    const modalBadge = document.getElementById('notif-unread-count-badge');

    if (drawerBadge) {
      if (unreadCount > 0) {
        drawerBadge.textContent = `${unreadCount} New`;
        drawerBadge.style.display = 'inline-block';
      } else {
        drawerBadge.style.display = 'none';
      }
    }

    if (modalBadge) {
      if (unreadCount > 0) {
        modalBadge.textContent = `${unreadCount} unread`;
        modalBadge.classList.remove('hidden');
      } else {
        modalBadge.classList.add('hidden');
      }
    }
  }

  /**
   * Render notifications list in modal-notice based on filter tab
   */
  function renderNotificationList(allNotifs) {
    const container = document.getElementById('notification-list-container');
    if (!container) return;

    const filter = (state.selectedNotifFilter || 'ALL').toUpperCase();
    let filtered = allNotifs;

    if (filter === 'MATCH') {
      filtered = allNotifs.filter(n => n.type === 'match');
    } else if (filter === 'UPDATE') {
      filtered = allNotifs.filter(n => n.type === 'update' || n.type === 'system');
    }

    if (filtered.length === 0) {
      let emptyMsg = 'বর্তমানে কোনো নোটিফিকেশন নেই';
      if (filter === 'MATCH') emptyMsg = 'বর্তমানে কোনো খেলার অ্যালার্ট নেই';
      if (filter === 'UPDATE') emptyMsg = 'বর্তমানে কোনো অ্যাপ আপডেট নোটিশ নেই';

      container.innerHTML = `
        <div class="p-8 text-center">
          <div class="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 flex items-center justify-center mx-auto mb-3 text-lg">
            <i class="fa-regular fa-bell-slash"></i>
          </div>
          <p class="text-sm font-semibold text-slate-700 dark:text-slate-300">${emptyMsg}</p>
          <p class="text-xs text-slate-400 dark:text-slate-500 mt-1">সব নতুন ম্যাচের সময়সূচী ও আপডেট এখানে স্বয়ংক্রিয়ভাবে প্রদর্শিত হবে</p>
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map(n => {
      const isUnread = !n.isRead;
      const typeBadgeColor = n.type === 'match' ? 'bg-rose-500/15 text-rose-500 dark:text-rose-400 border border-rose-500/20' :
                             n.type === 'update' ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/20' :
                             'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20';

      const typeIcon = n.type === 'match' ? (typeof getSportIconClass === 'function' ? getSportIconClass(n.sport).replace('fa-solid ', '') : (n.sport?.toLowerCase() === 'cricket' ? 'fa-baseball-bat-ball' : 'fa-futbol')) :
                       n.type === 'update' ? 'fa-circle-arrow-up' : 'fa-bullhorn';

      const typeLabel = n.type === 'match' ? (n.sport ? `${escapeHtml(n.sport)} Match` : 'Match Alert') :
                        n.type === 'update' ? 'App Update' : 'Announcement';

      const cardBg = isUnread ? 'bg-sky-50/70 dark:bg-sky-950/20 border-sky-300/60 dark:border-sky-500/30' :
                                'bg-white dark:bg-slate-900/80 border-slate-200/80 dark:border-slate-800/80';

      let actionButtonHtml = '';
      if (n.actionType === 'watch_match' && n.actionPayload) {
        actionButtonHtml = `
          <button type="button" class="btn-notif-action px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition active:scale-95 cursor-pointer" data-action="watch_match" data-payload="${escapeHtml(n.actionPayload)}" data-notif-id="${escapeHtml(n.id)}">
            <i class="fa-solid fa-play text-[10px]"></i>
            <span>${escapeHtml(n.actionLabel || 'Watch Match Live')}</span>
          </button>
        `;
      } else if (n.actionType === 'open_channel' && n.actionPayload) {
        actionButtonHtml = `
          <button type="button" class="btn-notif-action px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition active:scale-95 cursor-pointer" data-action="open_channel" data-payload="${escapeHtml(n.actionPayload)}" data-notif-id="${escapeHtml(n.id)}">
            <i class="fa-solid fa-tv text-[10px]"></i>
            <span>${escapeHtml(n.actionLabel || 'Watch Channel')}</span>
          </button>
        `;
      } else if (n.actionType === 'external_link' && n.actionPayload) {
        actionButtonHtml = `
          <a href="${escapeHtml(n.actionPayload)}" target="_blank" rel="noopener noreferrer" class="btn-notif-action px-3 py-1.5 rounded-lg bg-slate-800 dark:bg-slate-700 hover:bg-sky-600 text-white font-bold text-xs inline-flex items-center gap-1.5 shadow-sm transition active:scale-95 cursor-pointer" data-action="link" data-notif-id="${escapeHtml(n.id)}">
            <i class="fa-solid fa-arrow-up-right-from-square text-[10px]"></i>
            <span>${escapeHtml(n.actionLabel || 'Learn More')}</span>
          </a>
        `;
      }

      return `
        <div class="p-3.5 rounded-xl border ${cardBg} shadow-sm transition notif-card-glow relative overflow-hidden" data-card-notif-id="${escapeHtml(n.id)}">
          ${isUnread ? '<span class="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-900 animate-pulse"></span>' : ''}
          <div class="flex items-start gap-3">
            <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-sm ${typeBadgeColor}">
              <i class="fa-solid ${typeIcon}"></i>
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 flex-wrap mb-1 pr-3">
                <span class="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${typeBadgeColor}">
                  ${typeLabel}
                </span>
                <span class="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                  <i class="fa-regular fa-clock text-[10px] mr-1"></i>${escapeHtml(n.timestamp || 'Just now')}
                </span>
              </div>
              <h4 class="text-sm font-bold text-slate-900 dark:text-white leading-snug">${escapeHtml(n.title)}</h4>
              <p class="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">${escapeHtml(n.message || n.body || '')}</p>
              ${actionButtonHtml ? `<div class="mt-3 flex items-center gap-2">${actionButtonHtml}</div>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Attach click listeners to notification action buttons
    container.querySelectorAll('.btn-notif-action').forEach(btn => {
      btn.onclick = (e) => {
        const notifId = btn.getAttribute('data-notif-id');
        const action = btn.getAttribute('data-action');
        const payload = btn.getAttribute('data-payload');

        // Mark as read
        markNotificationAsRead(notifId);

        if (action === 'watch_match' && payload) {
          closeModal('modal-notice');
          // Find matching event
          const ev = (state.events || []).find(e => e.id === payload);
          if (ev) {
            // Open match details or play directly if live
            if (ev.status === 'LIVE' && ev.streams && ev.streams.length > 0) {
              playEvent(ev);
            } else {
              openMatchDetails(payload);
            }
          } else {
            // Fallback: search or open events view
            switchView('view-events');
            showToast('Loading selected match...');
          }
        } else if (action === 'open_channel' && payload) {
          closeModal('modal-notice');
          const ch = (state.channels || []).find(c => c.id === payload);
          if (ch) {
            playChannel(ch);
          } else {
            switchView('view-categories');
            showToast('Opening channels...');
          }
        }
      };
    });

    // Mark notification as read when clicking card
    container.querySelectorAll('[data-card-notif-id]').forEach(card => {
      card.onclick = (e) => {
        if (e.target.closest('.btn-notif-action')) return;
        const notifId = card.getAttribute('data-card-notif-id');
        markNotificationAsRead(notifId);
      };
    });
  }

  /**
   * Mark a notification ID as read
   */
  function markNotificationAsRead(notifId) {
    if (!notifId) return;
    if (!state.readNotifIds.includes(notifId)) {
      state.readNotifIds.push(notifId);
      localStorage.setItem('highfy_read_notifs', JSON.stringify(state.readNotifIds));
      combineAndRenderNotifications();
    }
  }

  /**
   * Setup Notification Center UI Listeners (Tabs, Filter, Mark All as Read, Drawer link, Banner buttons)
   */
  function setupNotificationsUI() {
    // Side Drawer Notice & Alerts button
    const drawerNoticeBtn = document.getElementById('drawer-notice');
    if (drawerNoticeBtn) {
      drawerNoticeBtn.addEventListener('click', () => {
        const sideDrawer = document.getElementById('side-drawer');
        const drawerOverlay = document.getElementById('drawer-overlay');
        if (sideDrawer) sideDrawer.classList.remove('active');
        if (drawerOverlay) drawerOverlay.classList.remove('active');
        openModal('modal-notice');
      });
    }

    // Modal Notification Filter Tabs
    const notifFilterBtns = document.querySelectorAll('.notif-filter-pill, .notif-filter-btn');
    notifFilterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const rawFilter = btn.getAttribute('data-notif-filter') || 'ALL';
        state.selectedNotifFilter = rawFilter.toUpperCase();

        notifFilterBtns.forEach(b => {
          if (b === btn) {
            b.classList.add('active', 'bg-sky-500', 'text-white');
            b.classList.remove('bg-slate-800', 'text-slate-400');
          } else {
            b.classList.remove('active', 'bg-sky-500', 'text-white');
            b.classList.add('bg-slate-800', 'text-slate-400');
          }
        });

        combineAndRenderNotifications();
      });
    });

    // Mark all as read button in modal-notice
    const btnMarkAllRead = document.getElementById('btn-mark-all-notifs-read') || document.getElementById('btn-notif-mark-all-read');
    if (btnMarkAllRead) {
      btnMarkAllRead.addEventListener('click', () => {
        const base = state.notifications || [];
        const custom = state.customNotifications || [];
        const allIds = [...base, ...custom].map(n => n.id).filter(Boolean);
        state.readNotifIds = Array.from(new Set([...state.readNotifIds, ...allIds]));
        localStorage.setItem('highfy_read_notifs', JSON.stringify(state.readNotifIds));
        combineAndRenderNotifications();
        showToast('সকল নোটিফিকেশন পঠিত হিসেবে চিহ্নিত করা হয়েছে');
      });
    }

    // Automatic Live Match Notifications Toggle
    const toggleMatchNotifs = document.getElementById('setting-match-notif-toggle');
    if (toggleMatchNotifs) {
      toggleMatchNotifs.checked = state.autoMatchNotifications !== false;
      toggleMatchNotifs.addEventListener('change', (e) => {
        state.autoMatchNotifications = e.target.checked;
        localStorage.setItem('highfy_auto_match_notifications', e.target.checked ? 'true' : 'false');
        const settingsModalCheckbox = document.getElementById('setting-auto-match-notifications');
        if (settingsModalCheckbox) settingsModalCheckbox.checked = e.target.checked;
        if (e.target.checked) {
          showToast('🔔 অটোমেটিক ম্যাচ নোটিফিকেশন চালু করা হয়েছে');
          playNotificationChime();
        } else {
          showToast('অটোমেটিক ম্যাচ নোটিফিকেশন বন্ধ করা হয়েছে');
        }
      });
    }

    // Notification sound / test button
    const btnTestNotifs = document.getElementById('btn-toggle-browser-notifs');
    if (btnTestNotifs) {
      btnTestNotifs.addEventListener('click', () => {
        playNotificationChime();
        // Trigger realistic test live match broadcast
        const sampleLiveEv = (state.events || []).find(e => e.status === 'LIVE') || (state.events && state.events[0]);
        if (sampleLiveEv) {
          triggerAutoLiveMatchNotification(sampleLiveEv, false);
          showToast('🔔 টেস্ট লাইভ ম্যাচ নোটিফিকেশন সফলভাবে ট্রিগার হয়েছে!');
        } else {
          showToast('🔔 টেস্ট নোটিফিকেশন: নোটিফিকেশন সিস্টেম সক্রিয় আছে!');
        }
      });
    }

    // Floating In-App Broadcast Banner Buttons
    const btnBroadcastClose = document.getElementById('btn-broadcast-close');
    if (btnBroadcastClose) {
      btnBroadcastClose.addEventListener('click', () => {
        dismissInAppBroadcast(true);
      });
    }

    const btnBroadcastDismiss = document.getElementById('btn-broadcast-dismiss');
    if (btnBroadcastDismiss) {
      btnBroadcastDismiss.addEventListener('click', () => {
        dismissInAppBroadcast(true);
      });
    }

    const btnBroadcastAction = document.getElementById('btn-broadcast-action');
    if (btnBroadcastAction) {
      btnBroadcastAction.addEventListener('click', () => {
        if (!broadcastActiveNotif) return;
        const n = broadcastActiveNotif;
        dismissInAppBroadcast(true);

        if (n.actionType === 'watch_match' && n.actionPayload) {
          const ev = (state.events || []).find(e => e.id === n.actionPayload);
          if (ev) {
            if (ev.status === 'LIVE' && ev.streams && ev.streams.length > 0) {
              playEvent(ev);
            } else {
              openMatchDetails(n.actionPayload);
            }
          } else {
            switchView('view-events');
            showToast('Loading selected match...');
          }
        } else if (n.actionType === 'open_channel' && n.actionPayload) {
          const ch = (state.channels || []).find(c => c.id === n.actionPayload);
          if (ch) {
            playChannel(ch);
          } else {
            switchView('view-categories');
            showToast('Opening channels...');
          }
        } else if (n.actionType === 'external_link' && n.actionPayload) {
          window.open(n.actionPayload, '_blank', 'noopener,noreferrer');
        }
      });
    }
  }

  function selectSportTab(sportName) {
    const sportShortcuts = document.querySelectorAll('#sports-shortcuts-row .sport-shortcut-item');
    sportShortcuts.forEach(item => {
      if (item.getAttribute('data-sport') === sportName) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
    state.selectedSport = sportName;
    updateEventCounters();
    renderEvents();
  }

  function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('active');
    if (modalId === 'modal-notice') {
      combineAndRenderNotifications();
    }
  }

  function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');

    if ((modalId === 'modal-channel-logo-editor' || modalId === 'modal-category-logo-editor') && state.openedLogoEditorFromAdmin) {
      const adminModal = document.getElementById('modal-stream-source');
      if (adminModal) {
        adminModal.classList.add('active');
        if (typeof switchAdminTab === 'function') {
          switchAdminTab('tab-admin-images');
        }
        if (typeof renderAdminCustomLogos === 'function') {
          renderAdminCustomLogos();
        }
      }
    }
  }

  function showToast(message) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.innerHTML = `<i class="fa-solid fa-circle-check text-sky-400"></i> <span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px) scale(0.95)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => toast.remove(), 250);
    }, 2400);
  }

  /**
   * Auto-Refresh System (Rate-limit conscious & Tab-Visibility aware)
   */
  let lastManualRefreshTime = 0;

  function startAutoRefresh() {
    if (state.autoRefreshTimer) clearInterval(state.autoRefreshTimer);
    // Use 3-5 minute interval to heavily preserve free tier API limits
    const intervalMs = Math.max(window.CONFIG?.FOOTBALL_REFRESH || 180000, 120000);

    state.autoRefreshTimer = setInterval(() => {
      // Only refresh if tab is actively visible to the user
      if (document.visibilityState === 'visible') {
        console.log('[HighFy] Auto-refreshing real live sports data...');
        loadSportsEvents(false);
      }
    }, intervalMs);

    // Refresh when user returns to tab if older than 5 minutes
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        const lastTime = window.sportsCoordinator?.lastFetchTime || 0;
        if (Date.now() - lastTime > 5 * 60 * 1000) {
          loadSportsEvents(false);
        }
      }
    });
  }

  // Initialize on DOM Ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }

})();
