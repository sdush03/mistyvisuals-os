const PDFDocument = require('pdfkit');
const fs = require('fs');

const doc = new PDFDocument();
doc.pipe(fs.createWriteStream('test_rupee3.pdf'));
doc.registerFont('RupeeFont', './assets/Roboto-Regular.ttf');

const startY = 100;

// Draw a baseline reference line
doc.moveTo(50, 108.5).lineTo(300, 108.5).strokeColor('red').lineWidth(0.5).stroke();

doc.fontSize(9.5).font('Helvetica').text('Total Package Value:', 50, startY, { continued: false });
const lw = doc.widthOfString('Total Package Value: ');

// Try different offsets
doc.fontSize(10).font('RupeeFont').text('₹', 50 + lw, startY - 1.5, { continued: false });
const rw = doc.widthOfString('₹ ');

doc.fontSize(9.5).font('Helvetica').text('1,80,000', 50 + lw + rw, startY, { continued: false });

doc.end();
