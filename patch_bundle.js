const fs = require('fs');
let s = fs.readFileSync('js/html2pdf.bundle.min.js', 'utf8');
const target = 'var n=r("./node_modules/jspdf/dist/jspdf.es.min.js"),o=r("./node_modules/html2canvas/dist/html2canvas.js"),s=r("./src/utils.js")';
const replacement = 'var n=r("./node_modules/jspdf/dist/jspdf.es.min.js"),o=r("./node_modules/html2canvas/dist/html2canvas.js"),s=r("./src/utils.js");try{window.html2canvas=o.default||o;window.jsPDF=n.jsPDF||n.default||n;}catch(e){}';

if (s.includes(target)) {
  s = s.replace(target, replacement);
  fs.writeFileSync('js/html2pdf.bundle.min.js', s, 'utf8');
  console.log('Successfully exposed window.html2canvas and window.jsPDF!');
} else {
  console.log('Target not found!');
}
