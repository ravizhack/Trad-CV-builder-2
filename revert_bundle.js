const fs = require('fs');
let s = fs.readFileSync('js/html2pdf.bundle.min.js', 'utf8');
const bad = 'var n=r("./node_modules/jspdf/dist/jspdf.es.min.js"),o=r("./node_modules/html2canvas/dist/html2canvas.js"),s=r("./src/utils.js");try{window.html2canvas=o.default||o;window.jsPDF=n.jsPDF||n.default||n;}catch(e){}';
const good = 'var n=r("./node_modules/jspdf/dist/jspdf.es.min.js"),o=r("./node_modules/html2canvas/dist/html2canvas.js"),s=r("./src/utils.js")';
if (s.includes(bad)) {
  s = s.replace(bad, good);
  fs.writeFileSync('js/html2pdf.bundle.min.js', s, 'utf8');
  console.log('Reverted successfully!');
} else {
  console.log('Bad string not found');
}
