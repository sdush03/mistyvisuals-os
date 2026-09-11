/**
 * Poster Typography Studio for MistyVisuals Cinema Uploader
 * 
 * Provides:
 * - 40 Curated wedding & cinema Google Fonts + Dynamic on-the-go font loading
 * - Local font file (.ttf / .otf) upload via FontFace API
 * - 3:4 portrait (4:3 vertical) live card preview
 * - 1080 x 1440 high-resolution Canvas baking engine
 * - Seamless integration with upload_queue.js and lightbox.js
 */

(function () {
  // Built-in 40 Curated Fonts (Batched across aesthetic categories)
  const DEFAULT_FONTS = [
    // 1. Retro Romance (SS1 Inspo)
    { id: 'spicy-rice', name: 'Spicy Rice', family: 'Spicy Rice', category: 'Retro Romance (SS1)', badge: '⭐ SS1 Inspo', type: 'google', scale: 1.05, spacing: 1 },
    { id: 'abril-fatface', name: 'Abril Fatface', family: 'Abril Fatface', category: 'Retro Romance (SS1)', badge: 'Editorial Retro', type: 'google', scale: 1.0, spacing: 1 },
    { id: 'shrikhand', name: 'Shrikhand', family: 'Shrikhand', category: 'Retro Romance (SS1)', badge: 'Indian Folk', type: 'google', scale: 0.95, spacing: 1 },
    { id: 'calistoga', name: 'Calistoga', family: 'Calistoga', category: 'Retro Romance (SS1)', badge: '70s Nostalgia', type: 'google', scale: 1.0, spacing: 1 },
    { id: 'chonburi', name: 'Chonburi', family: 'Chonburi', category: 'Retro Romance (SS1)', badge: 'High Contrast', type: 'google', scale: 1.0, spacing: 1 },
    { id: 'rozha-one', name: 'Rozha One', family: 'Rozha One', category: 'Retro Romance (SS1)', badge: 'Royal Indian', type: 'google', scale: 1.0, spacing: 1 },
    { id: 'cinzel-decorative', name: 'Cinzel Decorative', family: 'Cinzel Decorative', category: 'Retro Romance (SS1)', badge: 'Gilded Roman', type: 'google', scale: 0.95, spacing: 2, transform: 'uppercase' },
    { id: 'yeseva-one', name: 'Yeseva One', family: 'Yeseva One', category: 'Retro Romance (SS1)', badge: 'Feminine Grace', type: 'google', scale: 1.0, spacing: 1 },

    // 2. Romantic Script (SS2 Inspo)
    { id: 'tangerine', name: 'Tangerine', family: 'Tangerine', category: 'Romantic Script (SS2)', badge: '⭐ SS2 Inspo', type: 'google', scale: 1.6, spacing: 0.5, weight: '700' },
    { id: 'great-vibes', name: 'Great Vibes', family: 'Great Vibes', category: 'Romantic Script (SS2)', badge: 'Classic Wedding', type: 'google', scale: 1.25, spacing: 0.5 },
    { id: 'alex-brush', name: 'Alex Brush', family: 'Alex Brush', category: 'Romantic Script (SS2)', badge: 'Brush Script', type: 'google', scale: 1.2, spacing: 0.5 },
    { id: 'allura', name: 'Allura', family: 'Allura', category: 'Romantic Script (SS2)', badge: 'Couture Invitation', type: 'google', scale: 1.25, spacing: 0.5 },
    { id: 'pinyon-script', name: 'Pinyon Script', family: 'Pinyon Script', category: 'Romantic Script (SS2)', badge: 'Aristocratic French', type: 'google', scale: 1.35, spacing: 0.5 },
    { id: 'parisienne', name: 'Parisienne', family: 'Parisienne', category: 'Romantic Script (SS2)', badge: 'Bistro Chic', type: 'google', scale: 1.15, spacing: 0.5 },
    { id: 'italianno', name: 'Italianno', family: 'Italianno', category: 'Romantic Script (SS2)', badge: 'Slanted Formal', type: 'google', scale: 1.45, spacing: 0.5 },
    { id: 'sacramento', name: 'Sacramento', family: 'Sacramento', category: 'Romantic Script (SS2)', badge: 'Vintage Monoline', type: 'google', scale: 1.25, spacing: 0.5 },

    // 3. Cinematic Drama (Netflix Inspo)
    { id: 'cinzel', name: 'Cinzel', family: 'Cinzel', category: 'Cinematic Drama (Netflix)', badge: '🎬 Ultimate Cinema', type: 'google', scale: 0.95, spacing: 2.5, transform: 'uppercase', weight: '700' },
    { id: 'bebas-neue', name: 'Bebas Neue', family: 'Bebas Neue', category: 'Cinematic Drama (Netflix)', badge: '🎬 Blockbuster', type: 'google', scale: 1.15, spacing: 1.5, transform: 'uppercase' },
    { id: 'oswald', name: 'Oswald', family: 'Oswald', category: 'Cinematic Drama (Netflix)', badge: 'Bold Condensed', type: 'google', scale: 1.0, spacing: 1.5, transform: 'uppercase', weight: '700' },
    { id: 'castoro-titling', name: 'Castoro Titling', family: 'Castoro Titling', category: 'Cinematic Drama (Netflix)', badge: 'Chiseled Roman', type: 'google', scale: 0.95, spacing: 2, transform: 'uppercase' },
    { id: 'bodoni-moda', name: 'Bodoni Moda', family: 'Bodoni Moda', category: 'Cinematic Drama (Netflix)', badge: 'Haute Cinema', type: 'google', scale: 1.0, spacing: 1.5, transform: 'uppercase', weight: '700' },
    { id: 'prata', name: 'Prata', family: 'Prata', category: 'Cinematic Drama (Netflix)', badge: 'Teardrop Serif', type: 'google', scale: 1.0, spacing: 1 },
    { id: 'cormorant-garamond', name: 'Cormorant Garamond', family: 'Cormorant Garamond', category: 'Cinematic Drama (Netflix)', badge: 'Poetic Timeless', type: 'google', scale: 1.05, spacing: 1, style: 'italic', weight: '700' },
    { id: 'marcellus', name: 'Marcellus', family: 'Marcellus', category: 'Cinematic Drama (Netflix)', badge: 'Flare Roman', type: 'google', scale: 1.0, spacing: 2, transform: 'uppercase' },

    // 4. Modern Minimalist & Editorial Vogue
    { id: 'playfair-display', name: 'Playfair Display', family: 'Playfair Display', category: 'Editorial Vogue', badge: '👑 Bridal Vogue', type: 'google', scale: 1.0, spacing: 1, style: 'italic', weight: '700' },
    { id: 'dm-serif-display', name: 'DM Serif Display', family: 'DM Serif Display', category: 'Editorial Vogue', badge: 'Contemporary Serif', type: 'google', scale: 1.0, spacing: 0.5, style: 'italic' },
    { id: 'italiana', name: 'Italiana', family: 'Italiana', category: 'Editorial Vogue', badge: 'Milan Runway', type: 'google', scale: 1.05, spacing: 1.5 },
    { id: 'bellefair', name: 'Bellefair', family: 'Bellefair', category: 'Editorial Vogue', badge: 'Delicate Jewelry', type: 'google', scale: 1.1, spacing: 1 },
    { id: 'tenor-sans', name: 'Tenor Sans', family: 'Tenor Sans', category: 'Editorial Vogue', badge: 'Humanist Sans', type: 'google', scale: 0.95, spacing: 2.5, transform: 'uppercase' },
    { id: 'forum', name: 'Forum', family: 'Forum', category: 'Editorial Vogue', badge: 'Architectural', type: 'google', scale: 1.0, spacing: 2, transform: 'uppercase' },
    { id: 'syne', name: 'Syne', family: 'Syne', category: 'Editorial Vogue', badge: 'Cannes Indie', type: 'google', scale: 0.95, spacing: 1.5, transform: 'uppercase', weight: '800' },
    { id: 'montserrat', name: 'Montserrat', family: 'Montserrat', category: 'Editorial Vogue', badge: 'Modern Streamer', type: 'google', scale: 0.85, spacing: 3, transform: 'uppercase', weight: '800' },
    { id: 'plus-jakarta-sans', name: 'Plus Jakarta Sans', family: 'Plus Jakarta Sans', category: 'Editorial Vogue', badge: 'Clean Tagline', type: 'google', scale: 1.0, spacing: 2.5, weight: '700' },

    // 5. Royal Heritage & Palace Grandeur
    { id: 'almendra-display', name: 'Almendra Display', family: 'Almendra Display', category: 'Royal Heritage', badge: 'Palace Fairytale', type: 'google', scale: 1.05, spacing: 1 },
    { id: 'fondamento', name: 'Fondamento', family: 'Fondamento', category: 'Royal Heritage', badge: 'Archival Hand', type: 'google', scale: 1.1, spacing: 0.5, style: 'italic' },
    { id: 'unna', name: 'Unna', family: 'Unna', category: 'Royal Heritage', badge: 'Imperial Dignity', type: 'google', scale: 1.0, spacing: 1.5, weight: '700' },
    { id: 'federo', name: 'Federo', family: 'Federo', category: 'Royal Heritage', badge: 'Art Deco Royal', type: 'google', scale: 1.0, spacing: 2, transform: 'uppercase' },
    { id: 'meddon', name: 'Meddon', family: 'Meddon', category: 'Royal Heritage', badge: 'Historic Quill', type: 'google', scale: 1.15, spacing: 0.5 },
    { id: 'jost', name: 'Jost', family: 'Jost', category: 'Royal Heritage', badge: 'Geometric Royal', type: 'google', scale: 0.9, spacing: 3, transform: 'uppercase', weight: '700' },

    // 6. Intimate Signature & Love Letter
    { id: 'caveat', name: 'Caveat', family: 'Caveat', category: 'Intimate Signature', badge: 'Personal Note', type: 'google', scale: 1.25, spacing: 0.5, weight: '700' },
    { id: 'meow-script', name: 'Meow Script', family: 'Meow Script', category: 'Intimate Signature', badge: 'Delicate Cursive', type: 'google', scale: 1.3, spacing: 0.5 }
  ];

  // State
  let activeFonts = [...DEFAULT_FONTS];
  let customFontsStorageKey = 'misty_custom_fonts_registry';
  let removedFontsStorageKey = 'misty_removed_fonts_registry';

  // Load user saved fonts from localStorage
  function loadPersistedFonts() {
    try {
      const savedCustom = localStorage.getItem(customFontsStorageKey);
      if (savedCustom) {
        const parsed = JSON.parse(savedCustom);
        parsed.forEach(f => {
          if (!activeFonts.some(existing => existing.id === f.id)) {
            activeFonts.push(f);
            if (f.type === 'google') ensureGoogleFontLoaded(f.family);
          }
        });
      }

      const removedIds = JSON.parse(localStorage.getItem(removedFontsStorageKey) || '[]');
      if (Array.isArray(removedIds)) {
        activeFonts = activeFonts.filter(f => !removedIds.includes(f.id));
      }
    } catch (e) {
      console.warn('Error loading custom fonts from storage:', e);
    }
  }

  // Preload all 40 Google Fonts in batches of 8
  function preloadDefaultGoogleFonts() {
    const batches = [
      'Spicy+Rice&family=Abril+Fatface&family=Shrikhand&family=Calistoga&family=Chonburi&family=Rozha+One&family=Cinzel+Decorative:wght@700&family=Yeseva+One',
      'Tangerine:wght@700&family=Great+Vibes&family=Alex+Brush&family=Allura&family=Pinyon+Script&family=Parisienne&family=Italianno&family=Sacramento',
      'Cinzel:wght@600;700;900&family=Bebas+Neue&family=Oswald:wght@600;700&family=Castoro+Titling&family=Bodoni+Moda:ital,opsz,wght@0,6..96,700&family=Prata&family=Cormorant+Garamond:ital,wght@0,600;0,700;1,600&family=Marcellus',
      'Playfair+Display:ital,wght@0,600;0,700;1,600&family=DM+Serif+Display:ital@0;1&family=Italiana&family=Bellefair&family=Tenor+Sans&family=Forum&family=Syne:wght@700;800&family=Montserrat:wght@600;700;800&family=Plus+Jakarta+Sans:wght@600;700;800',
      'Almendra+Display&family=Fondamento:ital@0;1&family=Unna:ital,wght@0,700;1,700&family=Federo&family=Meddon&family=Jost:wght@600;700;800&family=Caveat:wght@600;700&family=Meow+Script'
    ];

    batches.forEach(b => {
      const url = `https://fonts.googleapis.com/css2?family=${b}&display=swap`;
      if (!document.querySelector(`link[href*="${b.split('&')[0]}"]`)) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = url;
        document.head.appendChild(link);
      }
    });
  }

  // Ensure individual Google Font is injected
  function ensureGoogleFontLoaded(fontFamily) {
    const queryFamily = fontFamily.replace(/ /g, '+');
    if (!document.querySelector(`link[href*="${queryFamily}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?family=${queryFamily}:ital,wght@0,400;0,600;0,700;0,800;1,400;1,700&display=swap`;
      document.head.appendChild(link);
    }
  }

  // Active Session State for Studio Modal
  let studioSession = {
    activeTab: 'title', // 'title' | 'subtitle'
    currentImageSource: null,
    currentTitle: 'The Wedding Film',
    currentSubtitle: 'CHAPTER I • 18 MIN',
    showSubtitle: true,

    // Main Title Typography
    selectedFontId: 'spicy-rice',
    baseFontSize: 80, // for 1080x1440 canvas
    color: '#FFFFFF',
    letterSpacing: 1,
    casing: 'smart', // 'smart', 'uppercase', 'titlecase'

    // Subtitle / Tagline Typography
    subtitleFontId: 'plus-jakarta-sans',
    subtitleFontSize: 24, // for 1080x1440 canvas
    subtitleColor: '#FFFFFF',
    subtitleLetterSpacing: 3,
    subtitleCasing: 'uppercase', // 'uppercase', 'titlecase', 'smart'

    position: 'bottom', // 'bottom', 'center', 'top'
    verticalOffset: 0,
    scrimMode: 'app', // 'app', 'deep', 'soft', 'none'
    onSaveCallback: null
  };

  // HTML Modal Template
  function injectStudioModalHtml() {
    if (document.getElementById('poster-studio-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'poster-studio-modal';
    modal.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.88);
      backdrop-filter: blur(14px);
      z-index: 100000;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 24px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;

    modal.innerHTML = `
      <div style="
        background: #121319;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 16px;
        max-width: 960px;
        width: 100%;
        max-height: 92vh;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        box-shadow: 0 24px 60px rgba(0,0,0,0.8);
      ">
        <!-- Header -->
        <div style="
          padding: 16px 22px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: rgba(255,255,255,0.02);
        ">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 20px;">🎨</span>
            <div>
              <h2 style="font-size: 15px; font-weight: 700; color: #fff; margin: 0; letter-spacing: 0.04em;">Poster Typography Studio</h2>
              <p style="font-size: 11px; color: var(--text-muted, #9ca3af); margin: 0;">Design 4:3 Vertical Cinema Movie Poster (1080 × 1440)</p>
            </div>
          </div>
          <button id="ps-close-btn" style="
            background: rgba(255,255,255,0.08);
            border: 1px solid rgba(255,255,255,0.15);
            color: #fff;
            width: 30px;
            height: 30px;
            border-radius: 50%;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 15px;
          ">✕</button>
        </div>

        <!-- Body 2-Column: Left = Preview, Right = Controls -->
        <div style="display: flex; flex: 1; overflow: hidden;">
          
          <!-- Left Column: Live 3:4 Poster Preview -->
          <div style="
            width: 360px;
            padding: 24px;
            background: #090a0e;
            border-right: 1px solid rgba(255, 255, 255, 0.08);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 16px;
            flex-shrink: 0;
          ">
            <!-- 3:4 Aspect Ratio Frame (210px x 280px) -->
            <div id="ps-card-frame" style="
              width: 210px;
              height: 280px;
              border-radius: 8px;
              overflow: hidden;
              position: relative;
              background: #141418;
              box-shadow: 0 12px 36px rgba(0, 0, 0, 0.85);
            ">
              <img id="ps-preview-img" src="" style="width: 100%; height: 100%; object-fit: cover; display: block;" />
              <!-- Bottom Scrim Layer -->
              <div id="ps-preview-scrim" style="
                position: absolute;
                inset: 0;
                pointer-events: none;
                background: linear-gradient(to bottom, transparent 0%, transparent 30%, rgba(0,0,0,0.25) 62%, rgba(0,0,0,0.75) 100%);
              "></div>

              <!-- Top Badge Safe-Zone Guide (Mobile Continue Watching) -->
              <div id="ps-badge-guide-top" style="
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                display: flex;
                justify-content: center;
                pointer-events: none;
                z-index: 6;
                transition: opacity 0.2s;
              ">
                <div style="
                  background: #E50914;
                  padding: 2px 7px;
                  border-bottom-left-radius: 3px;
                  border-bottom-right-radius: 3px;
                  font-size: 8px;
                  font-weight: 700;
                  color: #ffffff;
                  letter-spacing: -0.1px;
                  box-shadow: 0 1px 4px rgba(0,0,0,0.6);
                  opacity: 0.9;
                ">Recently added</div>
              </div>

              <!-- Bottom Badge Safe-Zone Guide (Mobile Catalog Shelves) -->
              <div id="ps-badge-guide-bottom" style="
                position: absolute;
                bottom: 0;
                left: 0;
                right: 0;
                display: flex;
                justify-content: center;
                pointer-events: none;
                z-index: 6;
                transition: opacity 0.2s;
              ">
                <div style="
                  background: #E50914;
                  padding: 2px 7px;
                  border-top-left-radius: 3px;
                  border-top-right-radius: 3px;
                  font-size: 8px;
                  font-weight: 700;
                  color: #ffffff;
                  letter-spacing: -0.1px;
                  box-shadow: 0 -1px 4px rgba(0,0,0,0.6);
                  opacity: 0.9;
                ">Recently added</div>
              </div>

              <!-- Text Overlay Layer (With Safe-Zone clearance) -->
              <div id="ps-preview-text-layer" style="
                position: absolute;
                left: 12px;
                right: 12px;
                bottom: 36px;
                display: flex;
                flex-direction: column;
                align-items: center;
                pointer-events: none;
                text-align: center;
              ">
                <div id="ps-preview-subtitle" style="
                  font-size: 9px;
                  font-weight: 700;
                  letter-spacing: 1.5px;
                  text-transform: uppercase;
                  color: rgba(255, 255, 255, 0.82);
                  margin-bottom: 3px;
                  text-shadow: 0 1px 3px rgba(0,0,0,0.9);
                ">CHAPTER I • 18 MIN</div>
                <div id="ps-preview-title" style="
                  font-size: 20px;
                  line-height: 1.15;
                  color: #ffffff;
                  text-shadow: 0 2px 5px rgba(0,0,0,0.95);
                  word-break: break-word;
                  white-space: pre-wrap;
                ">The Wedding Film</div>
              </div>
            </div>

            <!-- Preview Badges Toggle & Background Action -->
            <div style="display: flex; flex-direction: column; align-items: center; gap: 8px; width: 100%;">
              <button type="button" id="ps-toggle-badges-btn" style="
                background: rgba(229, 9, 20, 0.12);
                border: 1px solid rgba(229, 9, 20, 0.4);
                color: #ff6b6b;
                font-size: 10px;
                font-weight: 700;
                padding: 4px 10px;
                border-radius: 6px;
                cursor: pointer;
              ">🛡️ Mobile Badge Guides: Shown</button>
              <button type="button" id="ps-change-bg-btn" style="
                background: rgba(255, 255, 255, 0.08);
                border: 1px solid rgba(255, 255, 255, 0.18);
                color: #fff;
                font-size: 11px;
                font-weight: 600;
                padding: 6px 14px;
                border-radius: 8px;
                cursor: pointer;
              ">🖼️ Choose Other Background Photo</button>
            </div>
            <input type="file" id="ps-bg-file-input" accept="image/*" style="display: none;" />
          </div>

          <!-- Right Column: Controls -->
          <div style="
            flex: 1;
            padding: 20px 24px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 16px;
          ">
            <!-- Text Inputs -->
            <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 12px;">
              <div>
                <label style="display: block; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; color: var(--text-muted, #9ca3af); margin-bottom: 4px;">POSTER TITLE</label>
                <textarea id="ps-input-title" rows="2" style="width: 100%; box-sizing: border-box; background: #181a22; border: 1px solid rgba(255,255,255,0.15); color: #fff; font-size: 13px; padding: 7px 10px; border-radius: 8px; outline: none; resize: vertical; font-family: inherit; line-height: 1.3;">The Wedding Film</textarea>
              </div>
              <div>
                <label style="display: block; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; color: var(--text-muted, #9ca3af); margin-bottom: 4px;">TAGLINE / SUBTITLE</label>
                <input type="text" id="ps-input-subtitle" value="CHAPTER I • 18 MIN" style="width: 100%; box-sizing: border-box; background: #181a22; border: 1px solid rgba(255,255,255,0.15); color: #fff; font-size: 13px; padding: 7px 10px; border-radius: 8px; outline: none;" />
              </div>
            </div>

            <!-- Element Target Switcher: Main Title vs Subtitle -->
            <div style="display: flex; gap: 8px; background: #0f1015; padding: 4px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.12);">
              <button type="button" id="ps-tab-title" class="ps-target-tab" style="flex: 1; padding: 8px 12px; font-size: 11px; font-weight: 700; border-radius: 7px; border: none; background: #10b981; color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;">
                ✍️ Main Title Styling
              </button>
              <button type="button" id="ps-tab-subtitle" class="ps-target-tab" style="flex: 1; padding: 8px 12px; font-size: 11px; font-weight: 700; border-radius: 7px; border: none; background: transparent; color: #888; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;">
                🏷️ Subtitle / Tagline Styling
              </button>
            </div>

            <!-- Subtitle Visibility Toggle Row (shown when Subtitle tab is active) -->
            <div id="ps-subtitle-toggle-row" style="display: none; align-items: center; justify-content: space-between; background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 8px; padding: 8px 12px;">
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin: 0; font-size: 11px; font-weight: 700; color: #fff;">
                <input type="checkbox" id="ps-check-show-subtitle" checked style="width: 15px; height: 15px; accent-color: #10b981; cursor: pointer;" />
                <span>Show Subtitle / Tagline on Poster</span>
              </label>
              <span style="font-size: 10px; color: #10b981;">Subtitle will be baked above title</span>
            </div>

            <!-- Font Selector & Manage Fonts -->
            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <label style="font-size: 10px; font-weight: 700; letter-spacing: 0.08em; color: var(--text-muted, #9ca3af);"><span id="ps-label-font-target">MAIN TITLE</span> FONT (${activeFonts.length} Available)</label>
                <div style="display: flex; gap: 8px;">
                  <button type="button" id="ps-btn-add-google" style="background: transparent; border: none; color: #10b981; font-size: 11px; font-weight: 600; cursor: pointer; text-decoration: underline;">+ Add Google Font</button>
                  <button type="button" id="ps-btn-add-custom" style="background: transparent; border: none; color: #38bdf8; font-size: 11px; font-weight: 600; cursor: pointer; text-decoration: underline;">+ Upload .TTF / .OTF</button>
                  <input type="file" id="ps-font-file-input" accept=".ttf,.otf,.woff,.woff2" style="display: none;" />
                </div>
              </div>
              <select id="ps-select-font" style="width: 100%; background: #181a22; border: 1px solid rgba(255,255,255,0.18); color: #fff; font-size: 13px; font-weight: 600; padding: 8px 10px; border-radius: 8px; outline: none;">
              </select>
              <!-- Inline Google Font Bar -->
              <div id="ps-google-font-box" style="display: none; margin-top: 8px; padding: 8px 10px; background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 8px;">
                <div style="font-size: 10px; font-weight: 700; color: #10b981; margin-bottom: 4px;">LOAD ANY GOOGLE FONT:</div>
                <div style="display: flex; gap: 6px;">
                  <input type="text" id="ps-input-google-name" placeholder="e.g. Ephesis, Playfair Display, Cinzel, Alex Brush..." style="flex: 1; background: #111318; border: 1px solid rgba(255,255,255,0.2); color: #fff; font-size: 12px; padding: 5px 8px; border-radius: 6px; outline: none;" />
                  <button type="button" id="ps-btn-load-google" style="background: #10b981; border: none; color: #fff; font-size: 11px; font-weight: 700; padding: 5px 12px; border-radius: 6px; cursor: pointer;">Add</button>
                  <button type="button" id="ps-btn-cancel-google" style="background: transparent; border: 1px solid rgba(255,255,255,0.2); color: #888; font-size: 11px; padding: 5px 8px; border-radius: 6px; cursor: pointer;">✕</button>
                </div>
              </div>
            </div>

            <!-- Sliders: Font Size & Letter Spacing -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
              <div>
                <div style="display: flex; justify-content: space-between; font-size: 10px; font-weight: 700; color: var(--text-muted, #9ca3af); margin-bottom: 4px;">
                  <span><span id="ps-label-size-target">MAIN TITLE</span> SIZE</span>
                  <span id="ps-val-size" style="color: #fff;">80px</span>
                </div>
                <input type="range" id="ps-slider-size" min="48" max="140" value="80" style="width: 100%; accent-color: #10b981;" />
              </div>
              <div>
                <div style="display: flex; justify-content: space-between; font-size: 10px; font-weight: 700; color: var(--text-muted, #9ca3af); margin-bottom: 4px;">
                  <span><span id="ps-label-spacing-target">MAIN TITLE</span> TRACKING</span>
                  <span id="ps-val-spacing" style="color: #fff;">1px</span>
                </div>
                <input type="range" id="ps-slider-spacing" min="0" max="6" step="0.5" value="1" style="width: 100%; accent-color: #10b981;" />
              </div>
            </div>

            <!-- Color Palette -->
            <div>
              <label style="display: block; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; color: var(--text-muted, #9ca3af); margin-bottom: 6px;"><span id="ps-label-color-target">MAIN TITLE</span> COLOR</label>
              <div style="display: flex; align-items: center; gap: 10px;">
                <div class="ps-swatch active" data-color="#FFFFFF" style="width: 24px; height: 24px; border-radius: 50%; background: #FFFFFF; cursor: pointer; border: 2px solid #fff; box-shadow: 0 0 6px rgba(255,255,255,0.6);" title="Pearl White"></div>
                <div class="ps-swatch" data-color="#F6E7CB" style="width: 24px; height: 24px; border-radius: 50%; background: #F6E7CB; cursor: pointer; border: 2px solid transparent;" title="Champagne Gold"></div>
                <div class="ps-swatch" data-color="#FBD5DF" style="width: 24px; height: 24px; border-radius: 50%; background: #FBD5DF; cursor: pointer; border: 2px solid transparent;" title="Rose Blush"></div>
                <div class="ps-swatch" data-color="#E5B25D" style="width: 24px; height: 24px; border-radius: 50%; background: #E5B25D; cursor: pointer; border: 2px solid transparent;" title="Royal Gilded Ochre"></div>
                <div class="ps-swatch" data-color="#000000" style="width: 24px; height: 24px; border-radius: 50%; background: #000000; cursor: pointer; border: 2px solid rgba(255,255,255,0.3);" title="Obsidian Black"></div>
                <div style="display: flex; align-items: center; gap: 6px; margin-left: 8px;">
                  <span style="font-size: 11px; color: var(--text-muted, #9ca3af);">Custom:</span>
                  <input type="color" id="ps-color-picker" value="#ffffff" style="width: 28px; height: 28px; border: none; border-radius: 6px; cursor: pointer; background: transparent;" />
                </div>
              </div>
            </div>

            <!-- Position & Casing Grid -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
              <div>
                <label style="display: block; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; color: var(--text-muted, #9ca3af); margin-bottom: 6px;">VERTICAL POSITION</label>
                <div style="display: flex; gap: 4px; background: #181a22; padding: 3px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">
                  <button type="button" class="ps-btn-pos" data-pos="bottom" style="flex: 1; padding: 5px; font-size: 11px; font-weight: 600; border: none; border-radius: 6px; background: rgba(255,255,255,0.12); color: #fff; cursor: pointer;">Bottom (Default)</button>
                  <button type="button" class="ps-btn-pos" data-pos="center" style="flex: 1; padding: 5px; font-size: 11px; font-weight: 600; border: none; border-radius: 6px; background: transparent; color: #888; cursor: pointer;">Center</button>
                  <button type="button" class="ps-btn-pos" data-pos="top" style="flex: 1; padding: 5px; font-size: 11px; font-weight: 600; border: none; border-radius: 6px; background: transparent; color: #888; cursor: pointer;">Top</button>
                </div>
              </div>

              <div>
                <label style="display: block; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; color: var(--text-muted, #9ca3af); margin-bottom: 6px;"><span id="ps-label-casing-target">MAIN TITLE</span> CASING</label>
                <div style="display: flex; gap: 4px; background: #181a22; padding: 3px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">
                  <button type="button" class="ps-btn-casing" data-casing="smart" style="flex: 1; padding: 5px; font-size: 11px; font-weight: 600; border: none; border-radius: 6px; background: rgba(255,255,255,0.12); color: #fff; cursor: pointer;">Smart</button>
                  <button type="button" class="ps-btn-casing" data-casing="uppercase" style="flex: 1; padding: 5px; font-size: 11px; font-weight: 600; border: none; border-radius: 6px; background: transparent; color: #888; cursor: pointer;">UPPERCASE</button>
                  <button type="button" class="ps-btn-casing" data-casing="titlecase" style="flex: 1; padding: 5px; font-size: 11px; font-weight: 600; border: none; border-radius: 6px; background: transparent; color: #888; cursor: pointer;">Title Case</button>
                </div>
              </div>
            </div>

            <!-- Vertical Fine-Tune (Nudge) Slider -->
            <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 10px 12px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <label style="font-size: 10px; font-weight: 700; letter-spacing: 0.08em; color: var(--text-muted, #9ca3af);">VERTICAL FINE-TUNE (NUDGE UP / DOWN)</label>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span id="ps-val-offset" style="font-size: 10px; font-weight: 700; color: #10b981;">0px (Default)</span>
                  <button type="button" id="ps-btn-reset-offset" style="background: transparent; border: none; color: #888; font-size: 10px; cursor: pointer; text-decoration: underline;">Reset</button>
                </div>
              </div>
              <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 11px; color: #9ca3af; font-weight: 600;">↑ Higher</span>
                <input type="range" id="ps-slider-offset" min="-220" max="220" value="0" step="2" style="flex: 1; accent-color: #10b981; cursor: pointer;" />
                <span style="font-size: 11px; color: #9ca3af; font-weight: 600;">Lower ↓</span>
              </div>
            </div>

            <!-- Gradient Scrim Selector -->
            <div>
              <label style="display: block; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; color: var(--text-muted, #9ca3af); margin-bottom: 6px;">GRADIENT SCRIM</label>
              <div style="display: flex; gap: 6px;">
                <button type="button" class="ps-btn-scrim" data-scrim="app" style="flex: 1; padding: 6px 10px; font-size: 11px; font-weight: 600; border: 1px solid #10b981; border-radius: 8px; background: rgba(16,185,129,0.15); color: #fff; cursor: pointer;">App Scrim (0.75)</button>
                <button type="button" class="ps-btn-scrim" data-scrim="deep" style="flex: 1; padding: 6px 10px; font-size: 11px; font-weight: 600; border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; background: transparent; color: #888; cursor: pointer;">Deep (0.92)</button>
                <button type="button" class="ps-btn-scrim" data-scrim="soft" style="flex: 1; padding: 6px 10px; font-size: 11px; font-weight: 600; border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; background: transparent; color: #888; cursor: pointer;">Soft (0.55)</button>
                <button type="button" class="ps-btn-scrim" data-scrim="none" style="flex: 1; padding: 6px 10px; font-size: 11px; font-weight: 600; border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; background: transparent; color: #888; cursor: pointer;">None</button>
              </div>
            </div>

          </div>
        </div>

        <!-- Footer Actions -->
        <div style="
          padding: 14px 24px;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: rgba(255,255,255,0.02);
        ">
          <div style="font-size: 11px; color: var(--text-muted, #9ca3af);">
            📐 <strong>Strict 3:4 Portrait Ratio</strong> (1080 × 1440 px) • Formatted for mobile cinema cards
          </div>
          <div style="display: flex; gap: 10px;">
            <button type="button" id="ps-cancel-btn" style="padding: 8px 18px; font-size: 12px; font-weight: 600; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; color: #fff; cursor: pointer;">Cancel</button>
            <button type="button" id="ps-bake-btn" style="padding: 8px 24px; font-size: 12px; font-weight: 700; background: #10b981; border: none; border-radius: 8px; color: #fff; cursor: pointer; box-shadow: 0 4px 14px rgba(16,185,129,0.3);">✨ Bake & Apply Poster</button>
          </div>
        </div>

      </div>
    `;

    document.body.appendChild(modal);
    attachStudioEventListeners();
  }

  // Populate Font Selector Dropdown
  function populateFontSelect() {
    const select = document.getElementById('ps-select-font');
    if (!select) return;

    select.innerHTML = '';
    const categories = {};
    activeFonts.forEach(font => {
      const cat = font.category || 'General';
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(font);
    });

    for (const [catName, fonts] of Object.entries(categories)) {
      const optgroup = document.createElement('optgroup');
      optgroup.label = catName;
      fonts.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f.id;
        opt.innerText = f.name;
        if (f.id === studioSession.selectedFontId) opt.selected = true;
        optgroup.appendChild(opt);
      });
      select.appendChild(optgroup);
    }
  }

  // Live Update Preview
  function updateLivePreview() {
    const font = activeFonts.find(f => f.id === studioSession.selectedFontId) || activeFonts[0];
    const previewImg = document.getElementById('ps-preview-img');
    const previewTitle = document.getElementById('ps-preview-title');
    const previewSubtitle = document.getElementById('ps-preview-subtitle');
    const previewScrim = document.getElementById('ps-preview-scrim');
    const textLayer = document.getElementById('ps-preview-text-layer');

    if (previewImg) {
      if (studioSession.currentImageSource) {
        previewImg.src = studioSession.currentImageSource;
        previewImg.style.display = 'block';
      } else {
        previewImg.src = '';
        previewImg.style.display = 'none';
      }
    }

    // Scrim gradient
    if (previewScrim) {
      if (studioSession.scrimMode === 'app') {
        previewScrim.style.background = 'linear-gradient(to bottom, transparent 0%, transparent 30%, rgba(0,0,0,0.25) 62%, rgba(0,0,0,0.75) 100%)';
      } else if (studioSession.scrimMode === 'deep') {
        previewScrim.style.background = 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.2) 30%, rgba(0,0,0,0.5) 62%, rgba(0,0,0,0.92) 100%)';
      } else if (studioSession.scrimMode === 'soft') {
        previewScrim.style.background = 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.15) 50%, rgba(0,0,0,0.55) 100%)';
      } else {
        previewScrim.style.background = 'none';
      }
    }

    // Vertical Position & Fine-Tune Nudge Offset (Protected Badge Safe-Zones)
    if (textLayer) {
      const previewScale = 280 / 1440; // ~0.1944 (ratio of 280px preview to 1440px canvas)
      const offsetInPreview = Math.round((studioSession.verticalOffset || 0) * previewScale);
      const hasSubtitle = Boolean(studioSession.showSubtitle && studioSession.currentSubtitle);

      if (studioSession.position === 'top') {
        // Minimum top margin is 38px (or 42px with subtitle) to guarantee clearance below top badge (28px height)
        const minSafeTop = hasSubtitle ? 42 : 38;
        const safeTop = Math.max(minSafeTop, minSafeTop + offsetInPreview);
        textLayer.style.top = `${safeTop}px`;
        textLayer.style.bottom = '';
        textLayer.style.transform = '';
      } else if (studioSession.position === 'center') {
        const clampedOffset = Math.max(-50, Math.min(50, offsetInPreview));
        textLayer.style.top = '50%';
        textLayer.style.bottom = '';
        textLayer.style.transform = `translateY(calc(-50% + ${clampedOffset}px))`;
      } else {
        // Bottom: minimum bottom margin is 38px to guarantee clearance above bottom badge (28px height + breathing space)
        // Offset negative moves upwards (safeBottom increases)
        // Offset positive moves downwards, but is strictly clamped so it never drops below minSafeBottom
        const minSafeBottom = 38;
        const safeBottom = Math.max(minSafeBottom, minSafeBottom - offsetInPreview);
        textLayer.style.top = '';
        textLayer.style.bottom = `${safeBottom}px`;
        textLayer.style.transform = '';
      }
    }

    // Casing
    let displayTitle = studioSession.currentTitle;
    let transform = font.transform || 'none';
    if (studioSession.casing === 'uppercase') transform = 'uppercase';
    if (studioSession.casing === 'titlecase') transform = 'capitalize';

    // Title Font & Styling
    if (previewTitle) {
      const canvasFontSize = Math.round(studioSession.baseFontSize * (font.scale || 1.0));
      const previewScale = 210 / 1080;
      const scaledSize = Math.max(12, Math.round(canvasFontSize * previewScale));
      previewTitle.innerText = displayTitle;
      previewTitle.style.fontFamily = `"${font.family}", cursive, serif, sans-serif`;
      previewTitle.style.fontSize = `${scaledSize}px`;
      previewTitle.style.lineHeight = '1.15';
      previewTitle.style.whiteSpace = 'pre-wrap';
      previewTitle.style.wordBreak = 'break-word';
      previewTitle.style.color = studioSession.color;
      previewTitle.style.letterSpacing = `${studioSession.letterSpacing}px`;
      previewTitle.style.textTransform = transform;
      previewTitle.style.fontWeight = font.weight || 'normal';
      previewTitle.style.fontStyle = font.style || 'normal';
    }

    // Subtitle
    if (previewSubtitle) {
      if (!studioSession.showSubtitle || !studioSession.currentSubtitle) {
        previewSubtitle.innerText = '';
        previewSubtitle.style.display = 'none';
      } else {
        const subFont = activeFonts.find(f => f.id === studioSession.subtitleFontId) || { family: 'Plus Jakarta Sans', weight: '700' };
        let subCasing = studioSession.subtitleCasing || 'uppercase';
        let subTransform = 'uppercase';
        if (subCasing === 'titlecase') subTransform = 'capitalize';
        if (subCasing === 'smart') subTransform = 'none';

        const previewScale = 210 / 1080;
        const subScaledSize = Math.max(8, Math.round(studioSession.subtitleFontSize * previewScale * (subFont.scale || 1.0)));

        previewSubtitle.innerText = studioSession.currentSubtitle;
        previewSubtitle.style.display = 'block';
        previewSubtitle.style.fontFamily = `"${subFont.family}", -apple-system, sans-serif`;
        previewSubtitle.style.fontSize = `${subScaledSize}px`;
        previewSubtitle.style.fontWeight = subFont.weight || '700';
        previewSubtitle.style.fontStyle = subFont.style || 'normal';
        previewSubtitle.style.color = studioSession.subtitleColor || '#ffffff';
        previewSubtitle.style.letterSpacing = `${studioSession.subtitleLetterSpacing || 3}px`;
        previewSubtitle.style.textTransform = subTransform;
      }
    }
  }

  // Multi-line Word Wrapping Helper for HTML5 Canvas
  function getWrappedLines(ctx, text, maxWidth) {
    if (!text) return [''];
    const paragraphs = String(text).split('\n');
    const allLines = [];

    for (const para of paragraphs) {
      const trimmedPara = para.trim();
      if (!trimmedPara) {
        allLines.push('');
        continue;
      }

      const words = trimmedPara.split(/\s+/);
      let currentLine = '';

      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const metrics = ctx.measureText(testLine);

        if (metrics.width <= maxWidth) {
          currentLine = testLine;
        } else {
          if (currentLine) {
            allLines.push(currentLine);
            currentLine = word;
          } else {
            // A single word is wider than maxWidth; force-break characters
            let chunk = '';
            for (const char of word) {
              if (ctx.measureText(chunk + char).width <= maxWidth) {
                chunk += char;
              } else {
                if (chunk) allLines.push(chunk);
                chunk = char;
              }
            }
            currentLine = chunk;
          }
        }
      }

      if (currentLine) {
        allLines.push(currentLine);
      }
    }

    return allLines.length > 0 ? allLines : [''];
  }

  // High-Resolution 1080 x 1440 Canvas Baker
  async function bakePosterCanvasBlob() {
    const font = activeFonts.find(f => f.id === studioSession.selectedFontId) || activeFonts[0];
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1440; // 3:4 portrait (4:3 vertical)
    const ctx = canvas.getContext('2d');

    // 1. Draw Background Image with exact object-fit: cover (centered, matching preview)
    if (studioSession.currentImageSource) {
      const img = await loadImage(studioSession.currentImageSource);
      const cw = 1080, ch = 1440;
      const iw = img.naturalWidth || img.width;
      const ih = img.naturalHeight || img.height;
      const canvasAspect = cw / ch; // 0.75
      const imgAspect = iw / ih;

      let sx = 0, sy = 0, sWidth = iw, sHeight = ih;
      if (imgAspect > canvasAspect) {
        // Source image is wider than 3:4 container
        sWidth = ih * canvasAspect;
        sx = (iw - sWidth) / 2;
      } else {
        // Source image is taller than 3:4 container
        sHeight = iw / canvasAspect;
        sy = (ih - sHeight) / 2;
      }
      ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, cw, ch);
    } else {
      ctx.fillStyle = '#141418';
      ctx.fillRect(0, 0, 1080, 1440);
    }

    // 2. Draw Bottom Scrim Gradient
    if (studioSession.scrimMode !== 'none') {
      const scrim = ctx.createLinearGradient(0, 1440 * 0.30, 0, 1440);
      if (studioSession.scrimMode === 'deep') {
        scrim.addColorStop(0, 'rgba(0,0,0,0)');
        scrim.addColorStop(0.35, 'rgba(0,0,0,0.2)');
        scrim.addColorStop(0.65, 'rgba(0,0,0,0.5)');
        scrim.addColorStop(1, 'rgba(0,0,0,0.92)');
      } else if (studioSession.scrimMode === 'soft') {
        scrim.addColorStop(0, 'rgba(0,0,0,0)');
        scrim.addColorStop(0.5, 'rgba(0,0,0,0.15)');
        scrim.addColorStop(1, 'rgba(0,0,0,0.55)');
      } else {
        // Exact App Scrim: 0% to 30% transparent, 30% to 62% rgba(0,0,0,0.25), 62% to 100% rgba(0,0,0,0.75)
        scrim.addColorStop(0, 'rgba(0,0,0,0)');
        scrim.addColorStop(0.45, 'rgba(0,0,0,0.25)');
        scrim.addColorStop(1, 'rgba(0,0,0,0.75)');
      }
      ctx.fillStyle = scrim;
      ctx.fillRect(0, 0, 1080, 1440);
    }

    // 3. Compute Title Font Metrics
    const canvasFontSize = Math.round(studioSession.baseFontSize * (font.scale || 1.0));
    const fontDecl = `${font.style || ''} ${font.weight || ''} ${canvasFontSize}px "${font.family}"`.trim();
    try {
      await document.fonts.load(fontDecl);
    } catch (_) {}

    const hasSubtitle = Boolean(studioSession.showSubtitle && studioSession.currentSubtitle);

    // 4. Coordinates & Multi-line Wrapping (With Protected Badge Safe-Zones on 1080 x 1440 Canvas)
    let yPos = 1240;
    if (studioSession.position === 'top') {
      // Top base: 260px (or 320px if subtitle sits above) to ensure clearance below top badge (144px height on 1440 canvas)
      const baseTop = hasSubtitle ? 320 : 260;
      const minSafeTop = hasSubtitle ? 310 : 250;
      yPos = Math.max(minSafeTop, baseTop + studioSession.verticalOffset);
    } else if (studioSession.position === 'center') {
      yPos = 720 + Math.max(-260, Math.min(260, studioSession.verticalOffset));
    } else {
      // Bottom base: 1240px (clears 144px bottom badge + 56px breathing room on 1440px canvas)
      // Clamped to 1250 maximum so text NEVER bleeds into bottom badge
      yPos = Math.min(1250, 1240 + studioSession.verticalOffset);
    }

    // 5. Text Shadow & Context Setup
    ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 4;

    // Format Title text according to casing
    let titleText = studioSession.currentTitle || '';
    if (studioSession.casing === 'uppercase' || font.transform === 'uppercase') {
      titleText = titleText.toUpperCase();
    } else if (studioSession.casing === 'titlecase') {
      titleText = titleText.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.substr(1).toLowerCase());
    }

    // Set typography context prior to wrapping so ctx.measureText is exact
    ctx.font = fontDecl;
    ctx.fillStyle = studioSession.color;
    ctx.textAlign = 'center';
    ctx.letterSpacing = `${studioSession.letterSpacing * 2}px`;

    const MAX_CANVAS_TEXT_WIDTH = 960;
    const lines = getWrappedLines(ctx, titleText, MAX_CANVAS_TEXT_WIDTH);
    const lineHeight = Math.round(canvasFontSize * 1.15);
    const totalTitleHeight = (lines.length - 1) * lineHeight;

    let startY = yPos;
    if (studioSession.position === 'bottom') {
      // Bottom anchor: bottom-most line sits at yPos, preceding lines push upwards
      startY = yPos - totalTitleHeight;
    } else if (studioSession.position === 'center') {
      // Center anchor: vertically center the entire multi-line block
      const subtitleOffset = hasSubtitle ? 20 : 0;
      startY = Math.round(yPos - (totalTitleHeight / 2) + subtitleOffset);
    } else {
      // Top anchor: first line begins at yPos
      startY = yPos;
    }

    // 6. Draw Subtitle (if any) - sits cleanly above the top-most line (startY)
    if (hasSubtitle) {
      const subFont = activeFonts.find(f => f.id === studioSession.subtitleFontId) || { family: 'Plus Jakarta Sans', weight: '700' };
      const subFontSize = Math.round(studioSession.subtitleFontSize * (subFont.scale || 1.0));
      const subFontDecl = `${subFont.style || ''} ${subFont.weight || '700'} ${subFontSize}px "${subFont.family}", sans-serif`.trim();
      try {
        await document.fonts.load(subFontDecl);
      } catch (_) {}

      let subText = studioSession.currentSubtitle;
      if (studioSession.subtitleCasing === 'uppercase') {
        subText = subText.toUpperCase();
      } else if (studioSession.subtitleCasing === 'titlecase') {
        subText = subText.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.substr(1).toLowerCase());
      }

      ctx.font = subFontDecl;
      ctx.fillStyle = studioSession.subtitleColor || 'rgba(255, 255, 255, 0.85)';
      ctx.textAlign = 'center';
      ctx.letterSpacing = `${(studioSession.subtitleLetterSpacing || 3) * 2}px`;
      ctx.fillText(subText, 540, startY - canvasFontSize - 14);
    }

    // 7. Draw Main Title Lines
    ctx.font = fontDecl;
    ctx.fillStyle = studioSession.color;
    ctx.textAlign = 'center';
    ctx.letterSpacing = `${studioSession.letterSpacing * 2}px`;

    lines.forEach((line, idx) => {
      ctx.fillText(line, 540, startY + (idx * lineHeight));
    });

    return canvas.toDataURL('image/jpeg', 0.92);
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  // Event Listeners for UI
  function attachStudioEventListeners() {
    const modal = document.getElementById('poster-studio-modal');
    const closeBtn = document.getElementById('ps-close-btn');
    const cancelBtn = document.getElementById('ps-cancel-btn');
    const bakeBtn = document.getElementById('ps-bake-btn');

    const inputTitle = document.getElementById('ps-input-title');
    const inputSubtitle = document.getElementById('ps-input-subtitle');
    const selectFont = document.getElementById('ps-select-font');
    const sliderSize = document.getElementById('ps-slider-size');
    const sliderSpacing = document.getElementById('ps-slider-spacing');
    const colorPicker = document.getElementById('ps-color-picker');

    const changeBgBtn = document.getElementById('ps-change-bg-btn');
    const bgFileInput = document.getElementById('ps-bg-file-input');

    const btnAddGoogle = document.getElementById('ps-btn-add-google');
    const btnAddCustom = document.getElementById('ps-btn-add-custom');
    const fontFileInput = document.getElementById('ps-font-file-input');

    const tabTitle = document.getElementById('ps-tab-title');
    const tabSub = document.getElementById('ps-tab-subtitle');
    const checkShowSub = document.getElementById('ps-check-show-subtitle');

    function syncControlsToActiveTab() {
      const isTitle = studioSession.activeTab === 'title';

      if (tabTitle && tabSub) {
        if (isTitle) {
          tabTitle.style.background = '#10b981';
          tabTitle.style.color = '#fff';
          tabSub.style.background = 'transparent';
          tabSub.style.color = '#888';
        } else {
          tabSub.style.background = '#10b981';
          tabSub.style.color = '#fff';
          tabTitle.style.background = 'transparent';
          tabTitle.style.color = '#888';
        }
      }

      const subToggleRow = document.getElementById('ps-subtitle-toggle-row');
      if (subToggleRow) {
        subToggleRow.style.display = isTitle ? 'none' : 'flex';
      }
      if (checkShowSub) {
        checkShowSub.checked = Boolean(studioSession.showSubtitle);
      }

      const targetName = isTitle ? 'MAIN TITLE' : 'SUBTITLE';
      const labelFont = document.getElementById('ps-label-font-target');
      const labelSize = document.getElementById('ps-label-size-target');
      const labelSpacing = document.getElementById('ps-label-spacing-target');
      const labelColor = document.getElementById('ps-label-color-target');
      const labelCasing = document.getElementById('ps-label-casing-target');
      if (labelFont) labelFont.innerText = targetName;
      if (labelSize) labelSize.innerText = targetName;
      if (labelSpacing) labelSpacing.innerText = targetName;
      if (labelColor) labelColor.innerText = targetName;
      if (labelCasing) labelCasing.innerText = targetName;

      // Font select
      if (selectFont) {
        selectFont.value = isTitle ? studioSession.selectedFontId : studioSession.subtitleFontId;
      }

      // Size slider
      const valSize = document.getElementById('ps-val-size');
      if (sliderSize) {
        if (isTitle) {
          sliderSize.min = '48';
          sliderSize.max = '140';
          sliderSize.value = String(studioSession.baseFontSize);
          if (valSize) valSize.innerText = `${studioSession.baseFontSize}px`;
        } else {
          sliderSize.min = '14';
          sliderSize.max = '60';
          sliderSize.value = String(studioSession.subtitleFontSize);
          if (valSize) valSize.innerText = `${studioSession.subtitleFontSize}px`;
        }
      }

      // Letter spacing slider
      const valSpacing = document.getElementById('ps-val-spacing');
      if (sliderSpacing) {
        if (isTitle) {
          sliderSpacing.min = '0';
          sliderSpacing.max = '6';
          sliderSpacing.step = '0.5';
          sliderSpacing.value = String(studioSession.letterSpacing);
          if (valSpacing) valSpacing.innerText = `${studioSession.letterSpacing}px`;
        } else {
          sliderSpacing.min = '0';
          sliderSpacing.max = '8';
          sliderSpacing.step = '0.5';
          sliderSpacing.value = String(studioSession.subtitleLetterSpacing);
          if (valSpacing) valSpacing.innerText = `${studioSession.subtitleLetterSpacing}px`;
        }
      }

      // Color swatches & picker
      const activeColor = isTitle ? studioSession.color : studioSession.subtitleColor;
      if (colorPicker) colorPicker.value = (activeColor && activeColor.startsWith('#')) ? activeColor : '#ffffff';
      document.querySelectorAll('.ps-swatch').forEach(sw => {
        const swColor = sw.getAttribute('data-color');
        if (swColor && swColor.toLowerCase() === (activeColor || '').toLowerCase()) {
          sw.classList.add('active');
          sw.style.borderColor = '#fff';
          sw.style.boxShadow = '0 0 6px rgba(255,255,255,0.6)';
        } else {
          sw.classList.remove('active');
          sw.style.borderColor = swColor === '#000000' ? 'rgba(255,255,255,0.3)' : 'transparent';
          sw.style.boxShadow = 'none';
        }
      });

      // Casing buttons
      const activeCasing = isTitle ? studioSession.casing : studioSession.subtitleCasing;
      document.querySelectorAll('.ps-btn-casing').forEach(btn => {
        const casing = btn.getAttribute('data-casing');
        if (casing === activeCasing) {
          btn.style.background = 'rgba(255,255,255,0.12)';
          btn.style.color = '#fff';
        } else {
          btn.style.background = 'transparent';
          btn.style.color = '#888';
        }
      });
    }

    window._syncStudioControls = syncControlsToActiveTab;

    if (tabTitle) {
      tabTitle.onclick = () => {
        studioSession.activeTab = 'title';
        syncControlsToActiveTab();
      };
    }
    if (tabSub) {
      tabSub.onclick = () => {
        studioSession.activeTab = 'subtitle';
        syncControlsToActiveTab();
      };
    }
    if (checkShowSub) {
      checkShowSub.onchange = () => {
        studioSession.showSubtitle = Boolean(checkShowSub.checked);
        updateLivePreview();
      };
    }

    // Close & Cancel
    closeBtn.onclick = () => modal.style.display = 'none';
    cancelBtn.onclick = () => modal.style.display = 'none';

    // Live Title & Subtitle with auto tab focus
    inputTitle.onfocus = () => {
      studioSession.activeTab = 'title';
      syncControlsToActiveTab();
    };
    inputTitle.oninput = () => {
      studioSession.currentTitle = inputTitle.value;
      updateLivePreview();
    };

    inputSubtitle.onfocus = () => {
      studioSession.activeTab = 'subtitle';
      syncControlsToActiveTab();
    };
    inputSubtitle.oninput = () => {
      studioSession.currentSubtitle = inputSubtitle.value;
      updateLivePreview();
    };

    // Font Select
    selectFont.onchange = () => {
      if (studioSession.activeTab === 'title') {
        studioSession.selectedFontId = selectFont.value;
      } else {
        studioSession.subtitleFontId = selectFont.value;
      }
      const f = activeFonts.find(x => x.id === selectFont.value);
      if (f && f.type === 'google') ensureGoogleFontLoaded(f.family);
      updateLivePreview();
    };

    // Sliders
    sliderSize.oninput = () => {
      const val = parseInt(sliderSize.value, 10);
      if (studioSession.activeTab === 'title') {
        studioSession.baseFontSize = val;
      } else {
        studioSession.subtitleFontSize = val;
      }
      document.getElementById('ps-val-size').innerText = `${val}px`;
      updateLivePreview();
    };
    sliderSpacing.oninput = () => {
      const val = parseFloat(sliderSpacing.value);
      if (studioSession.activeTab === 'title') {
        studioSession.letterSpacing = val;
      } else {
        studioSession.subtitleLetterSpacing = val;
      }
      document.getElementById('ps-val-spacing').innerText = `${val}px`;
      updateLivePreview();
    };

    // Swatches
    document.querySelectorAll('.ps-swatch').forEach(sw => {
      sw.onclick = () => {
        document.querySelectorAll('.ps-swatch').forEach(s => {
          s.classList.remove('active');
          s.style.borderColor = s.getAttribute('data-color') === '#000000' ? 'rgba(255,255,255,0.3)' : 'transparent';
          s.style.boxShadow = 'none';
        });
        sw.classList.add('active');
        sw.style.borderColor = '#fff';
        sw.style.boxShadow = '0 0 6px rgba(255,255,255,0.6)';
        const c = sw.getAttribute('data-color');
        if (studioSession.activeTab === 'title') {
          studioSession.color = c;
        } else {
          studioSession.subtitleColor = c;
        }
        colorPicker.value = (c && c.startsWith('#')) ? c : '#ffffff';
        updateLivePreview();
      };
    });

    colorPicker.oninput = () => {
      const c = colorPicker.value;
      if (studioSession.activeTab === 'title') {
        studioSession.color = c;
      } else {
        studioSession.subtitleColor = c;
      }
      document.querySelectorAll('.ps-swatch').forEach(s => {
        s.classList.remove('active');
        s.style.borderColor = s.getAttribute('data-color') === '#000000' ? 'rgba(255,255,255,0.3)' : 'transparent';
      });
      updateLivePreview();
    };

    // Position Buttons
    document.querySelectorAll('.ps-btn-pos').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.ps-btn-pos').forEach(b => {
          b.style.background = 'transparent';
          b.style.color = '#888';
        });
        btn.style.background = 'rgba(255,255,255,0.12)';
        btn.style.color = '#fff';
        const newPos = btn.getAttribute('data-pos');
        studioSession.position = newPos;

        // Dynamically adjust slider bounds based on position to enforce safe-zone
        if (sliderOffset) {
          if (newPos === 'bottom') {
            sliderOffset.min = '-240';
            sliderOffset.max = '30';
          } else if (newPos === 'top') {
            sliderOffset.min = '-30';
            sliderOffset.max = '240';
          } else {
            sliderOffset.min = '-180';
            sliderOffset.max = '180';
          }
          studioSession.verticalOffset = Math.max(parseInt(sliderOffset.min, 10), Math.min(parseInt(sliderOffset.max, 10), studioSession.verticalOffset));
          sliderOffset.value = studioSession.verticalOffset.toString();
          if (valOffset) {
            const val = studioSession.verticalOffset;
            if (val < 0) {
              valOffset.innerText = `↑ ${Math.abs(val)}px Higher`;
              valOffset.style.color = '#38bdf8';
            } else if (val > 0) {
              valOffset.innerText = `↓ ${val}px Lower`;
              valOffset.style.color = '#f59e0b';
            } else {
              valOffset.innerText = '0px (Default)';
              valOffset.style.color = '#10b981';
            }
          }
        }
        updateLivePreview();
      };
    });

    // Mobile Badge Safe-Zone Guides Toggle
    const toggleBadgesBtn = document.getElementById('ps-toggle-badges-btn');
    const guideTop = document.getElementById('ps-badge-guide-top');
    const guideBottom = document.getElementById('ps-badge-guide-bottom');
    let showBadgeGuides = true;
    if (toggleBadgesBtn) {
      toggleBadgesBtn.onclick = () => {
        showBadgeGuides = !showBadgeGuides;
        if (guideTop) guideTop.style.display = showBadgeGuides ? 'flex' : 'none';
        if (guideBottom) guideBottom.style.display = showBadgeGuides ? 'flex' : 'none';
        toggleBadgesBtn.innerText = showBadgeGuides ? '🛡️ Mobile Badge Guides: Shown' : '🛡️ Mobile Badge Guides: Hidden';
        toggleBadgesBtn.style.opacity = showBadgeGuides ? '1' : '0.6';
      };
    }

    // Vertical Fine-Tune (Nudge) Slider
    const sliderOffset = document.getElementById('ps-slider-offset');
    const valOffset = document.getElementById('ps-val-offset');
    const btnResetOffset = document.getElementById('ps-btn-reset-offset');

    if (sliderOffset) {
      sliderOffset.oninput = () => {
        const val = parseInt(sliderOffset.value, 10) || 0;
        studioSession.verticalOffset = val;
        if (valOffset) {
          if (val < 0) {
            valOffset.innerText = `↑ ${Math.abs(val)}px Higher`;
            valOffset.style.color = '#38bdf8';
          } else if (val > 0) {
            valOffset.innerText = `↓ ${val}px Lower`;
            valOffset.style.color = '#f59e0b';
          } else {
            valOffset.innerText = '0px (Default)';
            valOffset.style.color = '#10b981';
          }
        }
        updateLivePreview();
      };
    }

    if (btnResetOffset) {
      btnResetOffset.onclick = () => {
        studioSession.verticalOffset = 0;
        if (sliderOffset) sliderOffset.value = '0';
        if (valOffset) {
          valOffset.innerText = '0px (Default)';
          valOffset.style.color = '#10b981';
        }
        updateLivePreview();
      };
    }

    // Casing Buttons
    document.querySelectorAll('.ps-btn-casing').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.ps-btn-casing').forEach(b => {
          b.style.background = 'transparent';
          b.style.color = '#888';
        });
        btn.style.background = 'rgba(255,255,255,0.12)';
        btn.style.color = '#fff';
        const casing = btn.getAttribute('data-casing');
        if (studioSession.activeTab === 'title') {
          studioSession.casing = casing;
        } else {
          studioSession.subtitleCasing = casing;
        }
        updateLivePreview();
      };
    });

    // Scrim Buttons
    document.querySelectorAll('.ps-btn-scrim').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.ps-btn-scrim').forEach(b => {
          b.style.background = 'transparent';
          b.style.color = '#888';
          b.style.borderColor = 'rgba(255,255,255,0.15)';
        });
        btn.style.background = 'rgba(16,185,129,0.15)';
        btn.style.borderColor = '#10b981';
        btn.style.color = '#fff';
        studioSession.scrimMode = btn.getAttribute('data-scrim');
        updateLivePreview();
      };
    });

    // Background Image Change
    changeBgBtn.onclick = async () => {
      if (window.api && window.api.selectVideoCover) {
        try {
          const chosen = await window.api.selectVideoCover('Poster Background');
          if (chosen) {
            const inspected = await window.api.inspectCoverImage(chosen);
            if (inspected && (inspected.highResDataUrl || inspected.previewDataUrl)) {
              studioSession.currentImageSource = inspected.highResDataUrl || inspected.previewDataUrl;
              updateLivePreview();
            }
          }
        } catch (err) {
          bgFileInput.click();
        }
      } else {
        bgFileInput.click();
      }
    };

    bgFileInput.onchange = () => {
      const file = bgFileInput.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          studioSession.currentImageSource = e.target.result;
          updateLivePreview();
        };
        reader.readAsDataURL(file);
      }
    };

    const googleFontBox = document.getElementById('ps-google-font-box');
    const inputGoogleName = document.getElementById('ps-input-google-name');
    const btnLoadGoogle = document.getElementById('ps-btn-load-google');
    const btnCancelGoogle = document.getElementById('ps-btn-cancel-google');

    // Add Google Font On the Fly (Inline box, no window.prompt)
    btnAddGoogle.onclick = () => {
      if (googleFontBox) {
        const isHidden = googleFontBox.style.display === 'none' || !googleFontBox.style.display;
        googleFontBox.style.display = isHidden ? 'block' : 'none';
        if (isHidden && inputGoogleName) {
          inputGoogleName.focus();
        }
      }
    };

    if (btnCancelGoogle) {
      btnCancelGoogle.onclick = () => {
        if (googleFontBox) googleFontBox.style.display = 'none';
      };
    }

    const handleAddGoogleFont = () => {
      const fontName = inputGoogleName ? inputGoogleName.value.trim() : '';
      if (!fontName) return;
      const cleanName = fontName.trim();
      const id = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

      ensureGoogleFontLoaded(cleanName);

      const newFont = {
        id,
        name: cleanName,
        family: cleanName,
        category: 'Custom Google Fonts',
        badge: '✨ Custom Added',
        type: 'google',
        scale: 1.0,
        spacing: 1
      };

      if (!activeFonts.some(f => f.id === id)) {
        activeFonts.unshift(newFont);
        // Persist to localStorage
        try {
          const custom = JSON.parse(localStorage.getItem(customFontsStorageKey) || '[]');
          custom.unshift(newFont);
          localStorage.setItem(customFontsStorageKey, JSON.stringify(custom));
        } catch (_) {}
      }

      studioSession.selectedFontId = id;
      populateFontSelect();
      updateLivePreview();

      if (inputGoogleName) inputGoogleName.value = '';
      if (googleFontBox) googleFontBox.style.display = 'none';
    };

    if (btnLoadGoogle) btnLoadGoogle.onclick = handleAddGoogleFont;
    if (inputGoogleName) {
      inputGoogleName.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleAddGoogleFont();
        }
      };
    }

    // Add Local Font File (.TTF / .OTF) On the Fly (Automatic name, no window.prompt)
    btnAddCustom.onclick = () => {
      fontFileInput.click();
    };

    fontFileInput.onchange = async () => {
      const file = fontFileInput.files[0];
      if (!file) return;

      const baseName = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ');
      const fontName = baseName;
      const id = 'custom-' + Date.now();

      try {
        const buffer = await file.arrayBuffer();
        const fontFace = new FontFace(fontName, buffer);
        await fontFace.load();
        document.fonts.add(fontFace);

        const newFont = {
          id,
          name: fontName,
          family: fontName,
          category: 'Uploaded Local Fonts',
          badge: '📁 .TTF File',
          type: 'custom_file',
          scale: 1.0,
          spacing: 1
        };

        activeFonts.unshift(newFont);
        studioSession.selectedFontId = id;
        populateFontSelect();
        updateLivePreview();
      } catch (err) {
        alert('Failed to load font file: ' + err.message);
      }
    };

    // Bake & Apply Button
    bakeBtn.onclick = async () => {
      bakeBtn.disabled = true;
      bakeBtn.innerText = '⏳ Baking 1080 × 1440 Poster...';

      try {
        const base64Data = await bakePosterCanvasBlob();
        let tempFilePath = null;

        if (window.api && window.api.saveTempBakedCover) {
          try {
            tempFilePath = await window.api.saveTempBakedCover({
              base64Data,
              filename: `${studioSession.currentTitle.replace(/[^a-z0-9]/gi, '_')}.jpg`
            });
          } catch (e) {
            console.warn("saveTempBakedCover warning (using direct base64 fallback):", e.message);
          }
        }

        if (studioSession.onSaveCallback) {
          await studioSession.onSaveCallback({
            base64Data,
            tempFilePath,
            config: {
              title: (studioSession.currentTitle || '').replace(/\r?\n+/g, ' ').trim(),
              rawTitle: studioSession.currentTitle,
              subtitle: studioSession.showSubtitle ? (studioSession.currentSubtitle || '').trim() : '',
              showSubtitle: studioSession.showSubtitle,
              subtitleFontId: studioSession.subtitleFontId,
              subtitleFontSize: studioSession.subtitleFontSize,
              subtitleColor: studioSession.subtitleColor,
              subtitleLetterSpacing: studioSession.subtitleLetterSpacing,
              subtitleCasing: studioSession.subtitleCasing,
              fontId: studioSession.selectedFontId,
              color: studioSession.color,
              position: studioSession.position,
              scrimMode: studioSession.scrimMode
            }
          });
        }

        modal.style.display = 'none';
      } catch (err) {
        console.error('Error baking poster:', err);
        alert('Failed to bake poster: ' + err.message);
      } finally {
        bakeBtn.disabled = false;
        bakeBtn.innerText = '✨ Bake & Apply Poster';
      }
    };
  }

  // Public Entry Point: window.PosterStudio.open(...)
  function openStudio({
    initialImage,
    initialTitle,
    initialSubtitle,
    onSave
  }) {
    injectStudioModalHtml();
    preloadDefaultGoogleFonts();
    loadPersistedFonts();

    if (initialImage) {
      studioSession.currentImageSource = initialImage;
    }
    if (initialTitle) {
      studioSession.currentTitle = initialTitle;
    }

    const galleryName = (typeof getCurrentGalleryName === 'function' ? getCurrentGalleryName() : (window.getCurrentGalleryName ? window.getCurrentGalleryName() : ''));
    const defaultFallbackSubtitle = galleryName || 'CHAPTER I • 18 MIN';
    studioSession.currentSubtitle = (initialSubtitle !== undefined && initialSubtitle !== '') ? initialSubtitle : defaultFallbackSubtitle;
    studioSession.showSubtitle = Boolean(studioSession.currentSubtitle);
    studioSession.activeTab = 'title';
    studioSession.onSaveCallback = onSave || null;

    studioSession.verticalOffset = 0;
    const sliderOffset = document.getElementById('ps-slider-offset');
    if (sliderOffset) {
      if (studioSession.position === 'bottom') {
        sliderOffset.min = '-240';
        sliderOffset.max = '30';
      } else if (studioSession.position === 'top') {
        sliderOffset.min = '-30';
        sliderOffset.max = '240';
      } else {
        sliderOffset.min = '-180';
        sliderOffset.max = '180';
      }
      sliderOffset.value = '0';
    }
    const valOffset = document.getElementById('ps-val-offset');
    if (valOffset) {
      valOffset.innerText = '0px (Default)';
      valOffset.style.color = '#10b981';
    }

    document.getElementById('ps-input-title').value = studioSession.currentTitle;
    const psSubInput = document.getElementById('ps-input-subtitle');
    if (psSubInput) {
      psSubInput.value = studioSession.currentSubtitle;
      if (defaultFallbackSubtitle) psSubInput.placeholder = `e.g. ${defaultFallbackSubtitle}`;
    }

    populateFontSelect();
    if (window._syncStudioControls) window._syncStudioControls();
    updateLivePreview();

    const modal = document.getElementById('poster-studio-modal');
    modal.style.display = 'flex';
  }

  // Expose API
  window.PosterStudio = {
    open: openStudio,
    getActiveFonts: () => activeFonts,
    ensureGoogleFontLoaded
  };

  // Pre-load default Google Fonts at app launch
  preloadDefaultGoogleFonts();
  loadPersistedFonts();
})();
