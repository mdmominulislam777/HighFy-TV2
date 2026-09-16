/**
 * HighFy TV - Universal Android TV & D-Pad Remote Control Navigation Engine
 * Provides seamless 5-way D-Pad (Up, Down, Left, Right, Enter, Back) navigation
 * for Android TV, Google TV, FireTV, Smart TVs, and keyboard users.
 */
(function () {
  'use strict';

  class TVRemoteEngine {
    constructor() {
      this.isTV = this.detectTVEnvironment();
      this.currentFocusIndex = -1;
      this.focusableElements = [];
      this.tvModeActive = this.isTV || localStorage.getItem('highfy_tv_mode') === 'true';
      this.lastInteractionTime = Date.now();
      this.remoteCooldown = false;
      this.activeZone = 'channels'; // 'header', 'tabs', 'channels', 'player', 'modal', 'bottom-nav'
      
      this.init();
    }

    /**
     * Detect if running on Android TV, Google TV, Smart TV or Big Screen
     */
    detectTVEnvironment() {
      const ua = (navigator.userAgent || '').toLowerCase();
      const isTVDevice = (
        ua.includes('tv') ||
        ua.includes('smarttv') ||
        ua.includes('googletv') ||
        ua.includes('android tv') ||
        ua.includes('tizen') ||
        ua.includes('webos') ||
        ua.includes('bravia') ||
        ua.includes('aft') || // Amazon Fire TV
        ua.includes('crkey') || // Chromecast
        ua.includes('roku') ||
        ua.includes('hisense') ||
        ua.includes('mi box')
      );

      // Also check if no primary pointer/touch and widescreen
      const isNoTouchWidescreen = (
        window.matchMedia &&
        window.matchMedia('(hover: none) and (pointer: coarse)').matches === false &&
        window.innerWidth >= 1280 &&
        window.innerHeight >= 720
      );

      return isTVDevice;
    }

    init() {
      console.log(`[HighFy TV Engine] Initializing. TV detected: ${this.isTV}, Mode Active: ${this.tvModeActive}`);

      if (this.tvModeActive) {
        document.body.classList.add('highfy-tv-mode');
      }

      this.bindKeyListeners();
      this.bindTVModeToggle();
      this.setupTVFocusObserver();

      // Automatically focus first item on TV startup
      if (this.tvModeActive) {
        setTimeout(() => this.focusFirstVisibleElement(), 1000);
      }
    }

    /**
     * Bind Keydown handler for Android TV D-Pad & Media Keys
     */
    bindKeyListeners() {
      window.addEventListener('keydown', (e) => {
        const key = e.key;
        const keyCode = e.keyCode || e.which;

        // Automatically activate TV mode upon receiving Arrow keys or TV remote inputs
        if (!this.tvModeActive && (key.startsWith('Arrow') || keyCode === 13 || keyCode === 10009 || keyCode === 461)) {
          this.activateTVMode();
        }

        // 1. Back Key handling (Android TV Back, Escape, Tizen Return, webOS Back)
        if (
          key === 'Escape' ||
          key === 'Back' ||
          key === 'GoBack' ||
          keyCode === 27 ||
          keyCode === 8 || // Backspace (when not in input)
          keyCode === 10009 || // Samsung Tizen Return
          keyCode === 461 // LG webOS Back
        ) {
          // If active element is a text input, don't intercept Backspace
          if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') && keyCode === 8) {
            return;
          }

          if (this.handleBackKey()) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
        }

        // 2. Media Play / Pause keys on Remote
        if (
          key === 'MediaPlayPause' ||
          key === 'MediaPlay' ||
          key === 'MediaPause' ||
          keyCode === 179 ||
          keyCode === 250
        ) {
          e.preventDefault();
          this.toggleVideoPlayback();
          return;
        }

        // 3. Arrow Keys Navigation (D-Pad)
        if (key === 'ArrowUp' || keyCode === 38) {
          e.preventDefault();
          this.navigateSpatial('up');
          return;
        }
        if (key === 'ArrowDown' || keyCode === 40) {
          e.preventDefault();
          this.navigateSpatial('down');
          return;
        }
        if (key === 'ArrowLeft' || keyCode === 37) {
          e.preventDefault();
          this.navigateSpatial('left');
          return;
        }
        if (key === 'ArrowRight' || keyCode === 39) {
          e.preventDefault();
          this.navigateSpatial('right');
          return;
        }

        // 4. Enter / OK / Select key
        if (key === 'Enter' || keyCode === 13) {
          // If active focused element exists and it's not input submit
          const focused = document.querySelector('.tv-focused, :focus');
          if (focused && focused.tagName !== 'INPUT') {
            e.preventDefault();
            focused.click();
          }
        }
      }, { passive: false });
    }

    /**
     * Get all currently visible and focusable elements on the screen
     */
    getFocusableElements() {
      // Check if a modal is currently open
      const openModal = document.querySelector('.modal:not(.hidden), .cricfy-modal:not(.hidden), #modal-channel-details:not(.hidden), #modal-settings:not(.hidden), #modal-search:not(.hidden)');
      if (openModal) {
        return Array.from(openModal.querySelectorAll('button:not([disabled]), input:not([disabled]), a, [tabindex="0"]'))
          .filter(el => this.isElementVisible(el));
      }

      // Check if player is open
      const playerBox = document.getElementById('player-container');
      const isPlayerActive = playerBox && playerBox.classList.contains('active');
      if (isPlayerActive) {
        return Array.from(playerBox.querySelectorAll('button:not([disabled]), .btn-player, .player-control-btn, .player-header-btn'))
          .filter(el => this.isElementVisible(el));
      }

      // Main content: Category tabs, Live event cards, Channel cards, Bottom Nav
      const selectors = [
        '.category-tab:not([disabled])',
        '.channel-card:not([disabled])',
        '.live-event-card',
        '.btn-stream-play',
        '.header-btn',
        '.nav-item',
        '#input-search-channels',
        '#btn-player-close',
        '.filter-pill'
      ];

      return Array.from(document.querySelectorAll(selectors.join(',')))
        .filter(el => this.isElementVisible(el));
    }

    isElementVisible(el) {
      if (!el || !el.getBoundingClientRect) return false;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.opacity !== '0'
      );
    }

    /**
     * Spatial Navigation: Move focus smoothly in D-Pad direction
     */
    navigateSpatial(direction) {
      const elements = this.getFocusableElements();
      if (elements.length === 0) return;

      const currentFocused = document.querySelector('.tv-focused') || document.activeElement;
      let currentIndex = elements.indexOf(currentFocused);

      if (currentIndex === -1) {
        this.setFocus(elements[0]);
        return;
      }

      const currentRect = currentFocused.getBoundingClientRect();
      const currentCenter = {
        x: currentRect.left + currentRect.width / 2,
        y: currentRect.top + currentRect.height / 2
      };

      let bestElement = null;
      let bestScore = Infinity;

      elements.forEach((el) => {
        if (el === currentFocused) return;
        const rect = el.getBoundingClientRect();
        const center = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2
        };

        const dx = center.x - currentCenter.x;
        const dy = center.y - currentCenter.y;

        let isCorrectDirection = false;
        if (direction === 'up' && dy < -10) isCorrectDirection = true;
        if (direction === 'down' && dy > 10) isCorrectDirection = true;
        if (direction === 'left' && dx < -10) isCorrectDirection = true;
        if (direction === 'right' && dx > 10) isCorrectDirection = true;

        if (!isCorrectDirection) return;

        // Euclidean distance with directional priority weighting
        const mainDist = direction === 'up' || direction === 'down' ? Math.abs(dy) : Math.abs(dx);
        const crossDist = direction === 'up' || direction === 'down' ? Math.abs(dx) : Math.abs(dy);
        const score = mainDist + crossDist * 2.2;

        if (score < bestScore) {
          bestScore = score;
          bestElement = el;
        }
      });

      // If spatial match found, focus it; else fallback to sequential loop
      if (bestElement) {
        this.setFocus(bestElement);
      } else {
        if (direction === 'right' || direction === 'down') {
          const nextIdx = (currentIndex + 1) % elements.length;
          this.setFocus(elements[nextIdx]);
        } else if (direction === 'left' || direction === 'up') {
          const prevIdx = (currentIndex - 1 + elements.length) % elements.length;
          this.setFocus(elements[prevIdx]);
        }
      }
    }

    setFocus(element) {
      if (!element) return;

      // Remove existing tv-focused
      document.querySelectorAll('.tv-focused').forEach(el => el.classList.remove('tv-focused'));

      element.classList.add('tv-focused');
      if (typeof element.focus === 'function') {
        element.focus({ preventScroll: true });
      }

      // Smoothly scroll into visible center
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest'
      });
    }

    focusFirstVisibleElement() {
      const elements = this.getFocusableElements();
      if (elements.length > 0) {
        this.setFocus(elements[0]);
      }
    }

    /**
     * Handle Android TV Back Button
     */
    handleBackKey() {
      // 1. If modal is open, close it
      const openModal = document.querySelector('.modal:not(.hidden), .cricfy-modal:not(.hidden), #modal-channel-details:not(.hidden), #modal-settings:not(.hidden)');
      if (openModal) {
        const closeBtn = openModal.querySelector('.btn-modal-close, .modal-close-btn, #btn-close-channel-details');
        if (closeBtn) {
          closeBtn.click();
          return true;
        }
        openModal.classList.add('hidden');
        return true;
      }

      // 2. If video player is in fullscreen, exit fullscreen
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        }
        return true;
      }

      // 3. If video player is open, close it
      const playerBox = document.getElementById('player-container');
      if (playerBox && playerBox.classList.contains('active')) {
        const closeBtn = document.getElementById('btn-player-close') || document.getElementById('btn-close-player');
        if (closeBtn) {
          closeBtn.click();
          return true;
        }
      }

      // 4. If on secondary tab, return to Home (Live Events)
      const homeTabBtn = document.querySelector('[data-tab="live-events"]') || document.querySelector('.nav-item[data-target="feed"]');
      const isHomeActive = homeTabBtn && homeTabBtn.classList.contains('active');
      if (!isHomeActive && homeTabBtn) {
        homeTabBtn.click();
        return true;
      }

      return false;
    }

    /**
     * Play/Pause video from TV Remote
     */
    toggleVideoPlayback() {
      const video = document.getElementById('hls-video-element') || document.querySelector('video');
      if (video) {
        if (video.paused) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      }
    }

    activateTVMode() {
      this.tvModeActive = true;
      document.body.classList.add('highfy-tv-mode');
      localStorage.setItem('highfy_tv_mode', 'true');
      console.log('[HighFy TV Engine] TV D-Pad Mode Activated');
      this.focusFirstVisibleElement();
    }

    deactivateTVMode() {
      this.tvModeActive = false;
      document.body.classList.remove('highfy-tv-mode');
      localStorage.setItem('highfy_tv_mode', 'false');
      document.querySelectorAll('.tv-focused').forEach(el => el.classList.remove('tv-focused'));
    }

    bindTVModeToggle() {
      // Toggle button in Settings modal if available
      const btnToggle = document.getElementById('btn-toggle-tv-mode');
      if (btnToggle) {
        btnToggle.addEventListener('click', () => {
          if (this.tvModeActive) {
            this.deactivateTVMode();
            btnToggle.classList.remove('active');
          } else {
            this.activateTVMode();
            btnToggle.classList.add('active');
          }
        });
      }
    }

    setupTVFocusObserver() {
      // Auto-rebind focus if DOM changes while in TV mode
      const observer = new MutationObserver(() => {
        if (this.tvModeActive && !document.querySelector('.tv-focused')) {
          this.focusFirstVisibleElement();
        }
      });
      observer.observe(document.body, { childList: true, subtree: false });
    }
  }

  // Universal Audio & Touch Unlock for iPhone & iPad (iOS Safari)
  function initIOSAudioTouchUnlock() {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (isIOS) {
      document.documentElement.classList.add('ios-safari-device');

      const unlockAudio = () => {
        const video = document.getElementById('hls-video-element') || document.querySelector('video');
        if (video && video.paused && video.src) {
          video.play().catch(() => {});
        }
        window.removeEventListener('touchstart', unlockAudio);
        window.removeEventListener('click', unlockAudio);
      };

      window.addEventListener('touchstart', unlockAudio, { passive: true });
      window.addEventListener('click', unlockAudio, { passive: true });
    }
  }

  // Register PWA Service Worker
  if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('[PWA] Service Worker registered:', reg.scope))
        .catch(err => console.log('[PWA] Service Worker registration failed:', err));
    });
  }

  // Initialize TV Remote & iOS Enhancer when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.TVRemote = new TVRemoteEngine();
      initIOSAudioTouchUnlock();
    });
  } else {
    window.TVRemote = new TVRemoteEngine();
    initIOSAudioTouchUnlock();
  }
})();
