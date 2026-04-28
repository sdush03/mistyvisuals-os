const PDFDocument = require('pdfkit');
const fs = require('fs');

const doc = new PDFDocument();
doc.pipe(fs.createWriteStream('test_blend.pdf'));

doc.rect(0, 0, doc.page.width, doc.page.height).fill('white');
doc.fillColor('black').text('Testing white rect on white background using blend mode', 50, 50);

doc.save();
doc.blendMode('Difference');
doc.rect(50, 100, 100, 50).fill('white');
doc.restore();

doc.end();
