const PDFDocument = require('pdfkit');
const fs = require('fs');

const doc = new PDFDocument();
doc.pipe(fs.createWriteStream('test_rupee.pdf'));
doc.registerFont('RupeeFont', './assets/NotoSans-Regular.ttf');
doc.fontSize(10).font('RupeeFont').text('₹', 100, 100);
doc.fontSize(9.5).font('Helvetica').text(' 1,80,000', 110, 100);
doc.end();
