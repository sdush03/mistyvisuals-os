const PDFDocument = require('pdfkit');
const fs = require('fs');
const doc = new PDFDocument();
doc.pipe(fs.createWriteStream('scratch_blend.pdf'));
doc.rect(0, 0, 500, 500).fill('white');
// Create a small base64 white square PNG to test
const img = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=";
doc.save();
if (doc.blendMode) {
  doc.blendMode('difference');
}
doc.image(img, 50, 50, { width: 100, height: 100 });
doc.restore();
doc.end();
console.log("PDF generated, blendMode supported: " + !!doc.blendMode);
