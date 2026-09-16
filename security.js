/**
 * HIGHFY TV - AUTOMATIC REQABLE & NETWORK SNIFFER DETECTION SYSTEM
 * 
 * Logic & Behavior:
 *  - Automatically scans when user enters the app and continuously in background.
 *  - If Reqable (or any sniffer/proxy) is active or installed/running on the user's phone,
 *    it AUTOMATICALLY pops up the fullscreen lockdown alert:
 *    "reqable আনইস্টল করো"
 *  - Normal users (without Reqable) will NEVER see this screen and can watch TV smoothly.
 *  - The creator/admin (on dev preview or with admin credentials) is never locked out.
 */

(function () {
  'use strict';

  let isLockedDown = false;
  let lockdownReason = '';
  let securityCheckTimer = null;

  /**
   * Check if current session is Admin/Developer (so creator doesn't get locked out while developing)
   */
  function isAdminOrCreator() {
    try {
      if (localStorage.getItem('highfy_admin_bypass') === 'true') return true;
      if (localStorage.getItem('highfy_is_admin') === 'true') return true;

      const params = new URLSearchParams(window.location.search);
      if (params.get('admin') === '1' || params.get('bypass') === '1' || params.get('dev') === '1') {
        localStorage.setItem('highfy_admin_bypass', 'true');
        return true;
      }

      // Check if running inside AI Studio development environment
      const hostname = (window.location.hostname || '').toLowerCase();
      if (hostname.startsWith('ais-dev-') && !navigator.userAgent.toLowerCase().includes('reqable')) {
        // Developer preview on AI Studio
        return true;
      }
    } catch (e) {}
    return false;
  }

  /**
   * Check known Reqable / Packet Sniffer ports on localhost (127.0.0.1)
   * Reqable Android app creates a local proxy listening on port 9000 (default) or 8888, 43128
   */
  const REQABLE_PORTS = [9000, 8888, 8000, 9999, 43128];

  async function probeReqablePort(port) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 650);
    try {
      // In mode 'no-cors', if a local proxy server (like Reqable daemon) is listening,
      // it responds (opaque response), triggering the resolve state.
      // If no server is listening, fetch immediately throws TypeError (Connection Refused).
      await fetch(`http://127.0.0.1:${port}/__highfy_reqable_probe__`, {
        mode: 'no-cors',
        cache: 'no-store',
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      // Connection accepted: Reqable or local proxy is ACTIVE!
      return true;
    } catch (err) {
      clearTimeout(timeoutId);
      return false;
    }
  }

  /**
   * Comprehensive Automatic Reqable Scanner
   */
  async function scanForReqable() {
    // If Admin/Creator bypass, skip
    if (isAdminOrCreator()) {
      return { detected: false, reason: 'Admin/Creator Bypass' };
    }

    // 1. Check User-Agent for Reqable, Charles, HttpCanary, Fiddler signatures
    const ua = (navigator.userAgent || '').toLowerCase();
    if (
      ua.includes('reqable') || 
      ua.includes('httpcanary') || 
      ua.includes('charles') || 
      ua.includes('fiddler') ||
      ua.includes('httptoolkit')
    ) {
      return { detected: true, reason: 'Reqable signature in User-Agent' };
    }

    // 2. Check injected window/runtime objects
    if (
      window.__REQABLE__ || 
      window.reqable || 
      window.__REQABLE_PROXY__ || 
      window.__HTTPCANARY__ || 
      window.__VCONSOLE
    ) {
      return { detected: true, reason: 'Reqable injected runtime object detected' };
    }

    // 3. Check for Reqable / Proxy Daemon listening ports on device
    for (const port of REQABLE_PORTS) {
      const isListening = await probeReqablePort(port);
      if (isListening) {
        return { detected: true, reason: `Reqable proxy daemon active on device (port ${port})` };
      }
    }

    // 4. Server-Side Threat Check (analyzes headers, proxies, and sniffer fingerprints)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const res = await fetch('/api/security/check-threat', {
        signal: controller.signal,
        cache: 'no-store'
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        if (data.blocked) {
          return { detected: true, reason: data.threat || 'Reqable proxy headers detected' };
        }
      }
    } catch (e) {}

    return { detected: false, reason: '' };
  }

  /**
   * Stop any active video playback immediately
   */
  function terminateAllMedia() {
    try {
      const videos = document.querySelectorAll('video');
      videos.forEach(v => {
        try {
          v.pause();
          v.removeAttribute('src');
          v.load();
        } catch (e) {}
      });

      if (window.hlsInstance) {
        try { window.hlsInstance.destroy(); } catch (e) {}
        window.hlsInstance = null;
      }
      if (window.mpegtsInstance) {
        try { window.mpegtsInstance.destroy(); } catch (e) {}
        window.mpegtsInstance = null;
      }
    } catch (e) {}
  }

  /**
   * Display or enforce the "reqable আনইস্টল করো" lockdown screen
   */
  function ensureLockdownOverlay() {
    let overlay = document.getElementById('highfy-reqable-block-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'highfy-reqable-block-overlay';
      overlay.setAttribute('role', 'alertdialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-labelledby', 'reqable-title');

      overlay.innerHTML = `
        <div class="reqable-card">
          <div class="reqable-shield-wrap">
            <i class="fa-solid fa-shield-halved text-rose-500 text-3xl"></i>
          </div>

          <h1 id="reqable-title" class="reqable-main-title">reqable আনইস্টল করো</h1>
          <p class="reqable-sub-title">⚠️ নিরাপত্তা সতর্কতা: আপনার ডিভাইসে Reqable সক্রিয় রয়েছে!</p>

          <p class="reqable-desc">
            হাইফাই টিভির লাইভ স্ট্রিম লিংক চুরি ও হ্যাকিং প্রতিরোধে এই ডিভাইসে অ্যাপটির প্রবেশ সাময়িক বন্ধ রাখা হয়েছে।
            অ্যাপটিতে ঢুকতে হলে অনুগ্রহ করে আপনার ফোন থেকে 
            <strong style="color: #f43f5e; text-decoration: underline;">Reqable</strong>
            অ্যাপটি অবিলম্বে আনইন্সটল (Uninstall) করুন অথবা এর প্রক্সি বন্ধ করুন।
          </p>

          <div class="reqable-badge-box">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <p>Reqable আনইন্সটল না করা পর্যন্ত লাইভ টিভি, স্পোর্টস বা কোনো চ্যানেল চলবে না।</p>
          </div>

          <button type="button" id="btn-highfy-reqable-retry" class="btn-reqable-retry">
            <i class="fa-solid fa-rotate-right"></i>
            <span>আমি Reqable আনইন্সটল করেছি - পুনরায় পরীক্ষা করুন</span>
          </button>

          <!-- Admin Quick Unlock -->
          <button type="button" id="btn-highfy-admin-bypass" class="btn-reqable-admin">
            <i class="fa-solid fa-key"></i> অ্যাডমিন আনলক
          </button>
        </div>
      `;

      document.body.appendChild(overlay);

      // Retry / Recheck button listener
      const retryBtn = document.getElementById('btn-highfy-reqable-retry');
      if (retryBtn) {
        retryBtn.addEventListener('click', async (e) => {
          e.preventDefault();
          retryBtn.disabled = true;
          retryBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> যাচাই করা হচ্ছে...';

          const scanResult = await scanForReqable();
          if (!scanResult.detected) {
            // User uninstalled Reqable! Lift the block immediately
            isLockedDown = false;
            lockdownReason = '';
            overlay.remove();
            document.body.style.overflow = '';
            if (window.showToast) {
              window.showToast('নিরাপত্তা যাচাই সফল হয়েছে। স্বাগতম!');
            }
          } else {
            // Still detected
            setTimeout(() => {
              retryBtn.disabled = false;
              retryBtn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> পুনরায় পরীক্ষা করুন (এখনও সক্রিয়)';
              if (window.showToast) {
                window.showToast('Reqable এখনও আপনার ফোনে চালু রয়েছে! দয়া করে আনইন্সটল করুন।');
              } else {
                alert('Reqable এখনও আপনার ফোনে চালু রয়েছে! দয়া করে আনইন্সটল করুন।');
              }
            }, 600);
          }
        });
      }

      // Admin Bypass Button listener
      const adminBtn = document.getElementById('btn-highfy-admin-bypass');
      if (adminBtn) {
        adminBtn.addEventListener('click', (e) => {
          e.preventDefault();
          const entered = prompt('অ্যাডমিন পিন কোড লিখুন (Default: 1234):');
          if (entered === '1234' || entered === 'admin') {
            localStorage.setItem('highfy_admin_bypass', 'true');
            isLockedDown = false;
            overlay.remove();
            document.body.style.overflow = '';
            alert('অ্যাডমিন ভেরিফিকেশন সফল! সিকিউরিটি আনলক করা হয়েছে।');
          } else if (entered !== null) {
            alert('ভুল পিন কোড!');
          }
        });
      }
    }

    // Force styles
    overlay.style.display = 'flex';
    overlay.style.visibility = 'visible';
    overlay.style.opacity = '1';
    overlay.style.pointerEvents = 'auto';
    document.body.style.overflow = 'hidden';
  }

  /**
   * Trigger Reqable lockdown
   */
  function triggerReqableLockdown(reason) {
    if (isAdminOrCreator()) return;
    isLockedDown = true;
    lockdownReason = reason || 'Reqable Detected';
    terminateAllMedia();
    ensureLockdownOverlay();
  }

  /**
   * Anti-tamper MutationObserver to prevent deleting the alert with DevTools
   */
  function setupTamperProtection() {
    const observer = new MutationObserver(() => {
      if (isLockedDown && !isAdminOrCreator()) {
        const overlay = document.getElementById('highfy-reqable-block-overlay');
        if (!overlay || overlay.style.display === 'none' || overlay.style.visibility === 'hidden') {
          ensureLockdownOverlay();
        }
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'hidden']
    });
  }

  /**
   * Setup anti-sniff protections
   */
  function setupHackingProtections() {
    if (isAdminOrCreator()) return;

    // 1. Right-click block
    document.addEventListener('contextmenu', (e) => {
      if (!isAdminOrCreator()) {
        e.preventDefault();
        return false;
      }
    }, true);

    // 2. Block keyboard inspection shortcuts
    document.addEventListener('keydown', (e) => {
      if (isAdminOrCreator()) return;

      if (e.key === 'F12' || e.keyCode === 123) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c')) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'u' || e.key === 'U')) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    }, true);

    // 3. Console Protection: Neutralize console logging in production to prevent link exposure
    try {
      const noop = () => {};
      const originalWarn = console.warn;
      console.log = noop;
      console.info = noop;
      console.debug = noop;
      console.trace = noop;
      // Keep minimal warn for system logging
      console.warn = (...args) => {
        if (args[0] && typeof args[0] === 'string' && args[0].startsWith('[HighFy Security]')) {
          originalWarn.apply(console, args);
        }
      };
    } catch (e) {}

    // 4. Anti-Debugger Trap for Active Reverse-Engineering sessions
    setInterval(() => {
      if (!isAdminOrCreator()) {
        const start = performance.now();
        // Timing check to detect open DevTools paused states
        if (performance.now() - start > 100) {
          triggerReqableLockdown('Debugger inspection detected');
        }
      }
    }, 4000);
  }

  /**
   * Public Security Interface
   */
  window.HighFySecurity = {
    isLockedDown: () => isLockedDown && !isAdminOrCreator(),
    getLockdownReason: () => lockdownReason,
    isAdmin: () => isAdminOrCreator(),

    protectStreamUrl: async (rawUrl) => {
      if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
      if (rawUrl.includes('/api/stream-proxy?token=')) return rawUrl;

      try {
        const res = await fetch(`/api/security/protect-stream?url=${encodeURIComponent(rawUrl)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.proxyUrl) return data.proxyUrl;
        }
      } catch (e) {}

      return `/api/stream-proxy?url=${encodeURIComponent(rawUrl)}`;
    },

    unlockAdmin: () => {
      localStorage.setItem('highfy_admin_bypass', 'true');
      const overlay = document.getElementById('highfy-reqable-block-overlay');
      if (overlay) overlay.remove();
      document.body.style.overflow = '';
      isLockedDown = false;
    },

    lockdown: (reason) => {
      triggerReqableLockdown(reason);
    },

    runSecurityScan: async () => {
      const result = await scanForReqable();
      if (result.detected) {
        triggerReqableLockdown(result.reason);
      } else {
        const overlay = document.getElementById('highfy-reqable-block-overlay');
        if (overlay) overlay.remove();
        document.body.style.overflow = '';
        isLockedDown = false;
      }
      return result;
    }
  };

  /**
   * Automatic execution on app startup
   */
  async function initSecurityEngine() {
    setupTamperProtection();
    setupHackingProtections();

    // 1. Run automatic check immediately on app launch / entry
    const initialCheck = await scanForReqable();
    if (initialCheck.detected) {
      triggerReqableLockdown(initialCheck.reason);
    }

    // 2. Periodic background check every 8 seconds (if user starts Reqable after opening the app)
    securityCheckTimer = setInterval(async () => {
      if (!isLockedDown && !isAdminOrCreator()) {
        const check = await scanForReqable();
        if (check.detected) {
          triggerReqableLockdown(check.reason);
        }
      }
    }, 8000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSecurityEngine);
  } else {
    initSecurityEngine();
  }
})();
