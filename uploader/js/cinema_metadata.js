// Cinema Categories, Auto-Classification & High-End Descriptions Bank

const CINEMA_CATEGORIES = [
  'THE DIRECTORS’ CUT',
  'CANDID DIARIES',
  'STAGE & SPOTLIGHT',
  'THE EXTENDED CUTS'
];

const CINEMA_DESCRIPTIONS = {
  trailer: [
    'The moment everything changed — nervous anticipation, heartfelt promises, and the beginning of forever captured in 4K cinema.',
    'A breathtaking cinematic journey celebrating love, timeless elegance, and memories to cherish across generations.',
    'Laughter, happy tears, and an unforgettable celebration — the defining moments of two souls becoming one.',
    'From nervous morning smiles to the twilight dance floor, the pure poetry of an extraordinary wedding day.',
    'Raw emotion, sacred promises, and pure joy — masterfully woven into an unforgettable visual love story.',
    'An electric celebration of two families uniting, preserved in vivid high-definition with original audio.'
  ],
  prewedding: [
    'Stolen glances and unspoken promises — an intimate cinematic prelude before the grand celebration.',
    'A golden hour dreamscape capturing the pure romance and effortless chemistry of the couple.',
    'Where love feels like home — quiet laughter, gentle embraces, and the anticipation of forever.',
    'An editorial visual journal celebrating the love story that brought two hearts to this beginning.',
    'Sunlit frames and tender moments — capturing the pure essence of their journey together.',
    'A cinematic escape celebrating love in its most effortless, timeless, and radiant form.'
  ],
  haldi: [
    'Sun-drenched laughter, yellow hues, and joyous showers of love and blessings from family.',
    'Golden turmeric, pure chaos, and contagious smiles as the wedding celebrations officially begin.',
    'Tradition wrapped in unbridled joy — family and friends showering the couple with golden love.',
    'A riot of yellow, flower showers, and playful moments with cousins and dearest elders.',
    'The auspicious golden ritual celebrated with unfiltered laughter, music, and playful blessings.',
    'A golden morning of pure happiness, splashes of water, and love painted on every smile.'
  ],
  mehendi: [
    'Intricate henna tales, gentle melodies, and the fragrance of love woven into every pattern.',
    'Vibrant colors, delicate designs, and joyful chatter as love is etched onto palms and hearts.',
    'Whimsical floral decor, bohemian warmth, and the heartfelt warmth of women singing traditional folk songs.',
    'Every swirl of henna carrying a secret blessing — a relaxing afternoon of beauty and connection.',
    'Lively beats, swirling lehengas, and the quiet sweetness of pre-wedding anticipation.',
    'Artistry meets romance — sunlit laughter, delicate henna motifs, and festive celebration.'
  ],
  sangeet: [
    'Electrifying energy, shimmering lights, and unforgettable musical showdowns between both sides.',
    'A high-octane night of dance, music, and celebratory toasts as two families become one dance floor.',
    'Dazzling glamour, heart-thumping beats, and memories made beneath a canopy of neon and chandeliers.',
    'Laughter, cheers, and nonstop celebration celebrating love through rhythm and movement.',
    'From emotional family ballads to midnight dance chaos — an unforgettable sangeet celebration.',
    'The ultimate night of music and high spirits — where every performance tells a story of love.'
  ],
  wedding: [
    'Sacred vows whispered around the sacred fire, binding two souls together for lifetimes.',
    'The royal baraat, tearful emotional eyes, and the eternal sanctity of the seven sacred pheras.',
    'The grandeur of timeless rituals and the tender intimacy of promises made for a lifetime.',
    'A celestial union beneath the mandap — where ancient traditions meet lifelong devotion.',
    'The eternal moment: red vermilion, heartfelt blessings, and the quiet triumph of true love.',
    'Timeless vows, the royal procession, and the sacred sacred bond forged in the presence of loved ones.'
  ],
  reception: [
    'A grand twilight gala celebrating the newlyweds in formal elegance and timeless glamour.',
    'Toasts raised, heartfelt speeches, and a night of royal hospitality and joyful camaraderie.',
    'Champagne sparkle, warm embraces from guests, and the newlyweds\' first official ballroom celebration.',
    'Black-tie sophistication, heartfelt speeches, and unforgettable memories made with cherished guests.',
    'The perfect grand finale to an extraordinary celebration of two lives beginning as one.',
    'Elegance, celebration, and royal banquet festivities welcoming the newlyweds into their new chapter.'
  ],
  engagement: [
    'The first official step toward forever — sealed with rings, golden blessings, and boundless excitement.',
    'Two families embracing as one, marking the joyous beginning of a lifelong journey together.',
    'Champagne flutes, sparkling diamond promises, and the quiet thrill of what lies ahead.',
    'An intimate gathering of closest hearts celebrating the moment two paths became one destiny.',
    'The beautiful official commitment — filled with hopeful hearts and sweet celebrations.',
    'A celebration of love announced to the world — promises made, rings exchanged, and hearts united.'
  ],
  performance: [
    'Center stage magic — high energy, flawless choreography, and infectious celebration on the dance floor.',
    'A show-stopping performance that brought the entire ballroom to its feet with thunderous cheers.',
    'Weeks of late-night rehearsals coming alive in pure stage energy, laughter, and synchrony.',
    'A heartfelt musical tribute honoring the couple through dance, rhythm, and boundless enthusiasm.',
    'Spotlights on, bass pumping, and family members giving their all for the newlyweds.',
    'Pure Bollywood glamour and effortless moves celebrating the newlyweds on the grand stage.'
  ],
  reel: [
    'The candid moments in between the big rituals — raw emotion, quiet smiles, and pure authenticity.',
    '60 seconds of pure cinematic magic crafted for your pocket screen.',
    'Behind the scenes of the big celebration — unscripted laughter and tender stolen glances.',
    'The heartbeats you might have missed — candid glimpses of happiness captured in vertical beauty.',
    'Bite-sized emotion and vibrant colors — the celebration distilled into its sweetest essence.',
    'A glimpse of pure serendipity — natural smiles and spontaneous joy when no one was watching.'
  ]
};

function detectCinemaSubtype(filename, isVertical) {
  const clean = (filename || '').toLowerCase();
  
  if (isVertical || clean.includes('reel') || clean.includes('vertical') || clean.includes('short')) {
    return 'reel';
  }
  if (clean.includes('dance') || clean.includes('performance') || clean.includes('solo') || clean.includes('squad') || clean.includes('choreography') || clean.includes('entry') || clean.includes('stage')) {
    return 'performance';
  }
  if (clean.includes('haldi')) return 'haldi';
  if (clean.includes('mehendi') || clean.includes('mehndi')) return 'mehendi';
  if (clean.includes('sangeet')) return 'sangeet';
  if (clean.includes('wedding') || clean.includes('phera') || clean.includes('vow') || clean.includes('mandap') || clean.includes('marriage')) return 'wedding';
  if (clean.includes('reception')) return 'reception';
  if (clean.includes('engagement') || clean.includes('roka') || clean.includes('ring')) return 'engagement';
  if (clean.includes('prewed') || clean.includes('pre-wed') || clean.includes('pre wed')) return 'prewedding';
  if (clean.includes('trailer') || clean.includes('teaser') || clean.includes('highlight')) return 'trailer';

  return 'trailer';
}

function mapSubtypeToCategory(subtype) {
  switch (subtype) {
    case 'reel':
      return 'CANDID DIARIES';
    case 'performance':
      return 'STAGE & SPOTLIGHT';
    case 'haldi':
    case 'mehendi':
    case 'sangeet':
    case 'wedding':
    case 'reception':
    case 'engagement':
      return 'THE EXTENDED CUTS';
    case 'trailer':
    case 'prewedding':
    default:
      return 'THE DIRECTORS’ CUT';
  }
}

function getRandomDescription(subtypeOrCategory) {
  let key = subtypeOrCategory ? subtypeOrCategory.toLowerCase() : 'trailer';
  if (key === 'the directors’ cut' || key === "the directors' cut") key = 'trailer';
  if (key === 'candid diaries') key = 'reel';
  if (key === 'stage & spotlight') key = 'performance';
  if (key === 'the extended cuts') key = 'wedding';

  const list = CINEMA_DESCRIPTIONS[key] || CINEMA_DESCRIPTIONS.trailer;
  const idx = Math.floor(Math.random() * list.length);
  return list[idx];
}

function generateCleanTitle(filename, subtype) {
  if (!filename) return 'The Wedding Film';
  let nameWithoutExt = filename.replace(/\.[a-zA-Z0-9]+$/, '').replace(/[_.-]+/g, ' ').trim();
  
  nameWithoutExt = nameWithoutExt
    .replace(/\b(final|v\d+|h264|4k|1080p|master|cut|export|draft)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (nameWithoutExt.length > 2) {
    return nameWithoutExt
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }

  switch (subtype) {
    case 'trailer': return 'The Wedding Film (Trailer)';
    case 'prewedding': return 'Pre-Wedding Film';
    case 'haldi': return 'The Haldi Ritual';
    case 'mehendi': return 'The Mehendi Celebration';
    case 'sangeet': return 'The Sangeet Night';
    case 'wedding': return 'The Wedding Ceremony';
    case 'reception': return 'The Grand Reception';
    case 'engagement': return 'The Engagement & Roka';
    case 'performance': return 'Stage Performance';
    case 'reel': return 'Candid Reel';
    default: return 'The Wedding Film';
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CINEMA_CATEGORIES,
    CINEMA_DESCRIPTIONS,
    detectCinemaSubtype,
    mapSubtypeToCategory,
    getRandomDescription,
    generateCleanTitle
  };
} else {
  window.CinemaMetadata = {
    CINEMA_CATEGORIES,
    CINEMA_DESCRIPTIONS,
    detectCinemaSubtype,
    mapSubtypeToCategory,
    getRandomDescription,
    generateCleanTitle
  };
}
