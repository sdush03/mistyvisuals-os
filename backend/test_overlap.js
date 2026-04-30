const PDFDocument = require('pdfkit');
const fs = require('fs');

const doc = new PDFDocument();
doc.pipe(fs.createWriteStream('test_overlap.pdf'));

const sigData = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="; // just a pixel

let y = 100;
doc.rect(100, y, 150, 60).stroke(); // Draw bounding box
doc.image(sigData, 100, y, { fit: [150, 60], align: 'left' });
y += 65;
doc.text("By Dushyant", 100, y);

doc.end();
