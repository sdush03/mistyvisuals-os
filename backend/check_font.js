const fs = require('fs');
const fontkit = require('fontkit');
const font = fontkit.openSync('./assets/NotoSans-Regular.ttf');
console.log('Has Rupee:', font.hasGlyphForCodePoint(0x20B9));
