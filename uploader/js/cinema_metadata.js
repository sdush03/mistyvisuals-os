// Cinema Categories, Auto-Classification & High-End Story Descriptions Bank

const CINEMA_CATEGORIES = [
  'THE DIRECTORS’ CUT',
  'CANDID DIARIES',
  'STAGE & SPOTLIGHT',
  'THE EXTENDED CUTS'
];

const CINEMA_DESCRIPTIONS = {
  trailer: [
    'From the quiet morning butterflies to the golden glow of their first steps as husband and wife, every second told a story of genuine love. Two families laughing, crying, and celebrating together as two best friends promised each other a lifetime of adventures. This is the emotional heartbeat of their celebration — timeless, joyful, and completely unforgettable.',
    'Some love stories feel like pure destiny, where every glance holds a world of understanding and every shared laugh feels like coming home. Surrounded by the people who cherish them most, their wedding day was an outpouring of deep affection and heartfelt promises. Here are the defining chapters of two souls officially beginning their forever.',
    'It started with stolen glances across a crowded room and blossomed into this breathtaking celebration of a lifetime. The joy in their parents’ eyes, the electric energy of their closest friends, and the quiet magic between the two of them made every single moment golden. A true celebration of two hearts finding their perfect match.',
    'There is a rare kind of magic that happens when two souls are meant to be together, and you could feel it radiating all day long. From tender morning blessings to the wild euphoria of the night, their celebration was filled with raw emotion and boundless warmth. A glimpse into a love that will only grow deeper and stronger with every passing year.',
    'Two beautiful families coming together, endless laughter echoing through the halls, and a couple whose chemistry lights up every room they enter. Their wedding was not just a ceremony, but an unforgettable festival of love, heritage, and genuine happiness. Relive the moments that made everyone present fall in love all over again.',
    'Watching them together, you realize that true love is both a peaceful anchor and a thrilling adventure. Their wedding day unfolded like a dream — tender vows, tearful embraces, and an unbridled celebration that nobody wanted to end. Here is the timeless story of their promises, their joy, and their forever.'
  ],

  prewedding: [
    'Long before the dhol beats and the grand celebrations began, there were just these quiet, golden moments of two people deeply in love. Wandering together with nowhere to rush, sharing inside jokes and gentle embraces that spoke louder than any words. A romantic glimpse into the effortless connection that started it all.',
    'When you look at them, love doesn’t look complicated — it looks comfortable, joyful, and completely natural. Wrapped up in each other’s warmth as the sun dipped below the horizon, every moment captured the quiet excitement of the journey ahead. This is their love in its purest, most intimate element.',
    'Stolen glances, runaway laughter, and the kind of chemistry that needs no script. Away from the bustle of wedding planning, they carved out a space just for themselves to celebrate their journey so far. A dreamy chapter celebrating two hearts finding peace and magic in each other’s presence.',
    'The world fades into the background whenever they are together, leaving only soft smiles and unspoken promises. Hand in hand against breathtaking backdrops, their romance is effortless, playful, and deeply genuine. A beautiful reminder of the friendship and devotion at the very foundation of their story.',
    'Before the sacred rituals and wedding lights, they paused to celebrate the quiet promise that brought them here. Every touch, shared smile, and lingering embrace carries the warmth of two people ready to spend a lifetime together. An intimate love story set in the golden warmth of pre-wedding bliss.',
    'A love story written in gentle whispers, easy laughter, and sun-drenched horizons. Walking together into their next chapter, their bond is effortless and undeniably real. Relive this romantic escape that captures the heartbeat of their journey toward forever.'
  ],

  sangeet: [
    'An electrifying night where the music never slowed down and the dance floor was packed from the very first beat! Both families took center stage with high-energy showdowns, singing along to every anthem and cheering each other on. Glamour, laughter, and pure celebration made this an unforgettable night of rhythm and joy.',
    'From soulful family tributes to the wildest late-night dance madness, the sangeet brought out the absolute best in everyone. Sparkling outfits, heart-thumping beats, and non-stop cheers filled the ballroom as friends and family danced their hearts out for the couple. This was celebration in its loudest, happiest, and most vibrant form.',
    'The energy was off the charts as chandeliers shimmered and the dhol shook the entire room! Generations came together on one dance floor, turning weeks of rehearsals into sheer stage magic and unforgettable memories. A night of pure euphoria celebrating the couple with every beat, spin, and toast.',
    'Neon lights, glittering lehengas, and a crowd that refused to let the party end! The sangeet night captured the spirit of two families truly becoming one through music, playful banter, and incredible performances. Watch the night unfold into a magnificent festival of rhythm, love, and laughter.',
    'The stage was set, the crowd was buzzing, and every single performance raised the roof! From emotional family ballads to high-octane dance battles between both sides, every moment was charged with electric joy. A celebration that proved when these two families come together, the party never stops.',
    'Shimmering lights, booming bass, and boundless excitement from start to finish! The couple took the spotlight surrounded by their favorite people, singing their hearts out and dancing until the early morning hours. This is what pure wedding celebration looks and feels like.'
  ],

  performance: [
    'Center stage magic at its finest! Months of secret late-night rehearsals and inside jokes came alive in this show-stopping routine. Flawless choreography, infectious energy, and crowd cheers that shook the hall — an unforgettable performance dedicated to the newlyweds.',
    'The lights dimmed, the crowd erupted, and they absolutely owned the stage! From the very first beat, the synchrony, attitude, and confidence were undeniable, turning the dance floor into a full-blown celebration. Pure entertainment and boundless love in every single step.',
    'A performance full of swag, charm, and unstoppable groove that brought the entire audience to their feet! You could feel the joy and camaraderie radiating across the stage as friends and family gave it their all for the couple. Watch them steal the show in style!',
    'Effortless style, perfect coordination, and non-stop cheers from both sides of the family. This routine was packed with playful energy, expressive smiles, and pure celebration. A stage performance that will be talked about for years to come!',
    'When the music dropped, the stage completely caught fire! Every turn, beat, and expression was filled with enthusiasm and love, delivering a performance that was equal parts glamorous and wildly fun. A golden highlight of the evening that nobody wanted to see end.',
    'Setting the stage on fire with rhythm, charm, and sensational moves! Celebrating the couple through pure choreography and heart, this performance had everyone clapping, whistling, and dancing along in their seats. A masterclass in celebration!'
  ],

  haldi: [
    'A riot of golden yellow, fragrant marigolds, and laughter that echoed across the courtyard! Friends and cousins wasted no time turning the traditional blessings into delightfully playful chaos. A sunny morning filled with flower showers, splashing water, and unfiltered happiness.',
    'Covered in fragrant turmeric and surrounded by the warmest hugs, the couple was showered with boundless love and mischievous smiles. The joy was contagious as elders gave heartfelt blessings while friends made sure no one escaped clean. The ultimate golden celebration marking the start of wedding festivities!',
    'Sunshine, vibrant marigold petals, and happy tears mixed with endless giggles. The haldi ceremony brought together tradition and pure fun, painting everyone in golden hues of love and good fortune. Relive the most cheerful, sun-drenched morning of the entire wedding!',
    'Pure, unfiltered joy in every single splash! From gentle turmeric applications by grandparents to full-on turmeric battles with the squad, every moment was packed with warmth and high spirits. A vibrant ritual where love and laughter took center stage.',
    'There is something uniquely special about the haldi — the vibrant yellow decor, the playful banter, and the blessings that touch your soul. Wrapped in love and golden glow, the couple laughed through the sweet mess, surrounded by their favorite faces. A morning of pure, unadulterated happiness.',
    'Golden rituals, fragrant flower showers, and endless teasing from friends and cousins. The haldi was a celebration of bright colors, cherished family traditions, and spontaneous moments of pure joy that will be treasured forever.'
  ],

  mehendi: [
    'Strains of traditional folk songs filled the afternoon air as intricate henna patterns were lovingly drawn onto palms and feet. Surrounded by cozy bohemian florals, colorful cushions, and laughing cousins, the bride beamed with quiet anticipation. An afternoon wrapped in art, warmth, and the sweet scent of celebration.',
    'Every delicate swirl of henna held a secret blessing, hidden initials, and whispers of the journey to come. With friends singing along to classic tunes and delicious treats being passed around, the mehendi was a relaxing, sunlit celebration of beauty, friendship, and family bonds.',
    'Vibrant lehengas, whimsical floral arrangements, and joyful chatter from morning until dusk. The mehendi ceremony brought out the colorful heart of the wedding, where laughter flowed effortlessly and bonds grew even deeper. A picturesque afternoon celebrating love etched into every detail.',
    'Henna, laughter, and the sweetest pre-wedding excitement! Sitting amidst a sea of colorful blossoms and loved ones, every minute was filled with warmth, singing, and happy stories. Watch the beauty and gentle joy of this cherished tradition unfold.',
    'A celebration of intricate artistry and timeless tradition, where each henna motif tells a story of love and good fortune. With friends dancing spontaneously to dholak beats and elders sharing sweet memories, this mehendi was pure warmth and festive charm.',
    'Sun-kissed smiles, flowing fabrics, and palms adorned with deep, fragrant henna. The mehendi afternoon was an oasis of color and joy, bringing everyone together to celebrate the bride and the exciting days ahead.'
  ],

  wedding: [
    'Sacred Vedic chants echoed in the air as they took their seven steps around the holy fire, hand in hand. With every sacred vow, two paths merged into one lifelong destiny in front of their tearful, smiling families. A deeply moving, majestic ceremony sealing their love for lifetimes to come.',
    'Underneath a breathtaking mandap adorned with fragrant blooms, the moment they had dreamed of finally arrived. The quiet tenderness of holding hands, the emotional vermilion ritual, and the shower of rose petals made time stand still. A sacred union of two souls rooted in faith, family, and forever.',
    'The holy fire glowed warmly, casting a soft light on their faces as ancient promises were whispered with conviction and grace. Surrounded by the heartfelt prayers of parents and elders, their wedding was the perfect harmony of timeless tradition and profound personal devotion. A truly divine celebration of love.',
    'Two souls, seven sacred vows, and a bond forged to last through all of life’s seasons. From the gentle tying of the sacred knot to the joyous cheers as the ceremony concluded, every ritual was steeped in meaning and tender affection. Relive the most sacred, emotional heart of their wedding day.',
    'As the priest recited the sacred mantras and family members looked on with proud, teary eyes, they promised to love, honor, and stand by each other always. A serene and royal ceremony that celebrated not just two individuals, but the sacred union of two devoted families.',
    'The red vermilion, the sacred mangalsutra, and the quiet smiles exchanged beneath the mandap canopy. With blessings pouring in from every corner of the room, their pheras were a magnificent testament to timeless love and enduring devotion.'
  ],

  reception: [
    'Making their grand debut as husband and wife, the newlyweds stepped into the ballroom to thunderous applause and a sea of loving faces. Dressed in striking formal elegance, they spent the evening receiving warm blessings, sharing toasts, and celebrating their new chapter in grand style.',
    'An evening of black-tie sophistication, heartfelt speeches that brought both tears and laughter, and memories to last a lifetime. Surrounded by friends and family who traveled from near and far, the reception was the crowning celebration of an extraordinary wedding journey.',
    'Chandeliers glittered and champagne glasses clinked as the newlyweds took their first formal turn around the ballroom. The warmth in the room was palpable, with touching toasts from closest friends and royal hospitality welcoming everyone into the celebration. A truly magical gala under the evening stars.',
    'Royalty, grace, and heartfelt celebration! The reception was a magnificent affair where family and guests showered the new couple with love, gifts, and boundless good wishes. A picture-perfect evening celebrating the triumph of love in grand elegance.',
    'The formal celebrations reached their spectacular peak as the couple greeted their loved ones with radiant smiles. From touching family speeches to an exquisite banquet and late-night toasts, the reception was an elegant, joyful conclusion to an unforgettable wedding.',
    'Dazzling evening gowns, sharp suits, and an atmosphere filled with warmth and celebration. The newlyweds celebrated their love surrounded by generations of family and lifelong friends, creating moments of connection and joy that will be cherished forever.'
  ],

  engagement: [
    'The moment it all became official! With the exchange of sparkling rings and the sweetest, nervous smiles, two people promised to walk hand in hand toward forever. Families embraced with open arms and joyful tears, marking the auspicious beginning of an incredible wedding journey.',
    'Two hearts, one promise, and a room overflowing with boundless excitement. Surrounded by their closest family, the couple sealed their commitment with blessings, toasts, and happy tears. A charming, intimate milestone that set the stage for all the grand celebrations to come.',
    'A magical evening where sweet glances and heartfelt promises took center stage. As rings were placed on fingers, applause and flower showers filled the air, welcoming both families into a shared future. A radiant celebration of love, commitment, and sweet anticipation.',
    'From a quiet “yes” to this joyous official commitment, the engagement was a celebration of pure happiness. Golden blessings, sparkling promises, and proud parents looking on with joyful hearts — the beginning of a truly magnificent love story.',
    'Sealed with blessings and celebrated with loved ones, this special evening marked the day two lives officially intertwined. Delicious food, loving toasts, and non-stop smiles made this celebration the perfect kickoff to their wedding season.',
    'The promise of forever, celebrated in style. Hand in hand and glowing with excitement, the couple took their first big step toward the aisle, showered in affection and blessings from everyone who holds them dear.'
  ],

  cocktail: [
    'High glamour, clinking glasses, and an evening that turned straight into a high-energy party! Everyone dressed to the nines, letting their hair down, and toasting to the happy couple as the music kept everyone on their feet. A night of chic sophistication and wild celebration.',
    'The perfect kickoff to the wedding weekend! Signature drinks, heartfelt spontaneous toasts from best friends, and a dance floor that refused to cool down. The couple lit up the room with their style and magnetic energy, laughing and grooving into the night.',
    'Sleek tuxedos, glamorous evening gowns, and an electric atmosphere full of laughter and celebration. Away from the formal rituals, the cocktail night gave everyone the chance to mingle, dance, and celebrate the newlyweds in effortless, modern style.',
    'Sparkling lights, curated toasts, and unforgettable conversations under the night sky. With music setting the mood and friends sharing hilarious stories about the couple, this party was the ideal blend of luxury, intimacy, and late-night dancing.',
    'An unforgettable soiree where the toasts were sweet, the energy was magnetic, and the laughter was non-stop. The couple danced effortlessly with their closest crew, creating memories that will make everyone smile for decades to come.',
    'Modern, chic, and filled with non-stop excitement! The cocktail evening brought out the couple’s fun, glamorous side as friends and family raised a glass to celebrate the grand journey ahead.'
  ],

  baraat: [
    'The dhol started beating and the entire street turned into a joyous, unstoppable dance floor! Friends and family danced with unbridled energy, escorting the groom in true royal fashion. Pure excitement, flying currency, and wild celebration leading up to the grand gates.',
    'An electric baraat packed with booming beats, bhangra moves, and friends lifting the groom onto their shoulders! The energy was infectious as both young and old danced their hearts out to herald the arrival of the groom. A grand procession that set the tone for an epic wedding day.',
    'Royal, loud, and bursting with joy! Riding in grand style surrounded by his closest brothers and friends, the groom arrived to claim his bride amidst smoke bombs, celebratory music, and thunderous cheers. This was a baraat to remember!',
    'High-octane dhols, sunglasses on, and hands in the air — the baraat was a massive carnival of celebration! Everyone brought their absolute best dance moves, laughing and celebrating every single step toward the wedding entrance.',
    'The groom’s grand procession brought the house down! From heartfelt hugs between uncles to the wildest dance circles with the squad, the atmosphere was charged with unrestrained happiness and royal pride.',
    'Swirling turbans, vibrant colors, and non-stop dancing that nobody wanted to finish. The baraat proved that when it comes to celebrating their main man, this crew knows how to throw down like royalty.'
  ],

  varmala: [
    'The moment their eyes met across the grand stage, everything else faded away. Amidst cascading cold pyros, showers of fresh rose petals, and thunderous cheers from the crowd, they exchanged their fragrant garlands with radiant smiles and playful competition. A breathtaking, royal highlight of the celebration.',
    'Standing tall on the varmala stage with hearts racing and smiles glowing, the couple shared an unforgettable moment of pure connection. Friends lifted them high amidst laughter, petals rained down like confetti, and the night sky lit up with celebratory cheers. A picture-perfect milestone!',
    'Pure grandeur in real life! The bride’s grand entry led to this magical moment on stage, where mutual respect, deep love, and playful banter came together in the sacred garland exchange. A moment of goosebumps and sheer joy for everyone watching.',
    'Surrounded by a sea of cheering friends and family, they placed the auspicious garlands around each other’s necks, sealing their promise with radiant laughter. The sparkling stage illuminated their faces, capturing the breathtaking triumph of two best friends becoming one.',
    'Rose petals swirling in the cool breeze, celebratory music rising to a crescendo, and two happy souls lost in each other’s gaze. The varmala ceremony was a royal, emotional spectacle celebrating their union in grand visual majesty.',
    'A shower of blessings, fragrant jasmine and roses, and the happiest smiles you will ever see. The varmala was equal parts playful fun and touching romance, leaving an indelible memory in the hearts of everyone present.'
  ],

  vidai: [
    'A deeply touching moment of farewell filled with tears, warm embraces, and boundless love. Throwing rice over her shoulders to bless the home that raised her, the bride took her first steps toward her new life, held tenderly by her partner. An emotional chapter honoring family bonds that only grow deeper with time.',
    'Gentle tears of gratitude and proud, loving smiles as parents embraced their daughter before she embarked on her next great adventure. The vidai was a tender, bittersweet ceremony reminding everyone of the profound, eternal bond between a family and their child.',
    'Walking out hand in hand, carrying the love, blessings, and values of two devoted homes. Amidst heartfelt hugs from siblings and warm reassurances from her new family, this emotional departure was the sacred doorway into their shared future.',
    'A mother’s tender embrace, a father’s quiet pride, and brothers holding back tears as they escorted the bride to the car. The vidai touched every heart present — a moving farewell that celebrated roots, love, and the beautiful dawn of a new family.',
    'Tears flowed freely, mixed with sweet smiles and prayers for happiness. As the car rolled away carrying the newlyweds, everyone waved with full hearts, knowing that while she is stepping into a new home, she will always be cherished right where she grew up.',
    'The most poignant, heartfelt ritual of the wedding day. Surrounded by the warmth of family elders whispering their final blessings, the bride stepped forward into her forever, supported by the one who promised to cherish her always.'
  ],

  chooda: [
    'The gentle clinking of auspicious red chooda bangles and the golden shimmer of dangling kaleeras filled the room with traditional grace. Surrounded by maternal uncles, aunts, and sisters sharing playful glances and happy tears, this intimate morning ritual was steeped in cultural elegance and heartfelt blessings.',
    'Laughter erupted as the bride shook her golden kaleeras over the heads of her eager bridesmaids and sisters, hoping the lucky charm would strike next! A beautiful morning ceremony celebrating family heritage, sisterly bonds, and the tender moments leading up to the walk down the aisle.',
    'Auspicious red ivory, delicate golden tassels, and the sweet love of family blessing every bangle slipped onto her wrists. The chooda ceremony captured the gentle, emotional essence of a bride being lovingly prepared for the biggest day of her life.',
    'An emotional embrace with her maternal family as the sacred chooda was adorned, followed by the fun-filled chaos of the kaleera drop! A cherished tradition filled with meaningful heritage, beautiful jewelry, and unforgettable sisterhood.',
    'Glowing with happiness, the bride sat surrounded by her closest women as sweet blessings were whispered and the iconic chooda and kaleeras were tied with love. A tender, picture-perfect celebration of maternal family ties and wedding anticipation.',
    'The tinkling of golden charms, sweet tears from mother, and the excitement of the girls waiting for the kaleera to fall! This beautiful ritual was a celebration of timeless traditions and the pure joy of being pampered by loved ones.'
  ],

  reel: [
    'The best moments are always the ones that were never planned! A stolen glance when they thought nobody was looking, sudden bursts of laughter with the cousins, and pure, unfiltered happiness caught in the moment. Real love, real people, and raw celebration.',
    'Behind all the grand decor and formal rituals, this is the real heartbeat of the wedding. Messy hair, genuine giggles, and spontaneous dance moves when the dhol caught everyone off guard. A delightful slice of candid celebration!',
    'Unscripted, effortless, and overflowing with chemistry! Just two happy souls having the absolute time of their lives on their wedding day, surrounded by the friends who know them best. This is pure joy, served with zero filters.',
    'It’s the little things — a secret wink across the mandap, a tight hug from a best friend, and spontaneous laughter during the rituals. These are the candid treasures that you will replay a thousand times and cherish forever.',
    'Pure energy and unscripted magic! Catching the exact second when the party went from formal dinner to wild dance floor mayhem. An authentic glimpse into how this wedding actually felt from the inside out.',
    'Spontaneous smiles, quick warm hugs, and natural charm that needs no poses. Watching them just be themselves is a breath of fresh air — a reminder that at the heart of every great wedding is genuine friendship and deep love.'
  ]
};

function detectCinemaSubtype(filename, isVertical) {
  const clean = (filename || '').toLowerCase();
  
  if (isVertical || clean.includes('reel') || clean.includes('vertical') || clean.includes('short') || clean.includes('candid')) {
    return 'reel';
  }
  if (clean.includes('dance') || clean.includes('performance') || clean.includes('solo') || clean.includes('squad') || clean.includes('choreo') || clean.includes('choreography') || clean.includes('stage') || clean.includes('duet') || clean.includes('flashmob')) {
    return 'performance';
  }
  if (clean.includes('baraat') || clean.includes('barat') || clean.includes('ghodi') || clean.includes('groom entry') || clean.includes('procession')) {
    return 'baraat';
  }
  if (clean.includes('varmala') || clean.includes('jaimala') || clean.includes('garland')) {
    return 'varmala';
  }
  if (clean.includes('vidai') || clean.includes('bidaai') || clean.includes('doli') || clean.includes('farewell')) {
    return 'vidai';
  }
  if (clean.includes('cocktail') || clean.includes('afterparty') || clean.includes('after party') || clean.includes('soiree')) {
    return 'cocktail';
  }
  if (clean.includes('chooda') || clean.includes('chuda') || clean.includes('kaleera') || clean.includes('kalira')) {
    return 'chooda';
  }
  if (clean.includes('haldi') || clean.includes('pithi')) return 'haldi';
  if (clean.includes('mehendi') || clean.includes('mehndi') || clean.includes('henna')) return 'mehendi';
  if (clean.includes('sangeet')) return 'sangeet';
  if (clean.includes('wedding') || clean.includes('phera') || clean.includes('vow') || clean.includes('mandap') || clean.includes('marriage') || clean.includes('shaadi') || clean.includes('sindoor')) return 'wedding';
  if (clean.includes('reception') || clean.includes('banquet')) return 'reception';
  if (clean.includes('engagement') || clean.includes('roka') || clean.includes('ring') || clean.includes('sagai')) return 'engagement';
  if (clean.includes('prewed') || clean.includes('pre-wed') || clean.includes('pre wed') || clean.includes('lovestory') || clean.includes('love story')) return 'prewedding';
  if (clean.includes('trailer') || clean.includes('teaser') || clean.includes('highlight') || clean.includes('film')) return 'trailer';

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
    case 'cocktail':
    case 'chooda':
    case 'baraat':
    case 'varmala':
    case 'vidai':
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
  if (!filename) return 'The Wedding Highlights';
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
    case 'trailer': return 'The Wedding Highlights';
    case 'prewedding': return 'Pre-Wedding Love Story';
    case 'haldi': return 'The Haldi Ritual';
    case 'mehendi': return 'The Mehendi Ceremony';
    case 'sangeet': return 'The Sangeet Night';
    case 'wedding': return 'The Wedding Ceremony';
    case 'reception': return 'The Grand Reception';
    case 'engagement': return 'The Engagement & Roka';
    case 'performance': return 'Stage Performance';
    case 'reel': return 'Candid Moments';
    case 'cocktail': return 'The Cocktail Soiree';
    case 'chooda': return 'The Chooda & Kaleera';
    case 'baraat': return 'The Grand Baraat';
    case 'varmala': return 'The Varmala Moment';
    case 'vidai': return 'The Emotional Vidai';
    default: return 'The Wedding Highlights';
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
