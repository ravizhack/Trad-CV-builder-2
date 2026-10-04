const fs = require('fs');
const s = fs.readFileSync('js/html2pdf.bundle.min.js', 'utf8');
const p = s.indexOf('var n=r("./node_modules/jspdf/dist/jspdf.es.min.js"),o=r("./node_modules/html2canvas/dist/html2canvas.js")');
console.log('Pos 2:', p);
if (p !== -1) console.log(s.substring(p, p + 200));
