const fs = require('fs');
let s = fs.readFileSync('js/html2pdf.bundle.min.js', 'utf8');
const target = 't.Worker=e.default,s.default=t';
const replacement = 't.Worker=e.default;try{var _h=o("./node_modules/html2canvas/dist/html2canvas.js");window.html2canvas=_h.default||_h;var _j=o("./node_modules/jspdf/dist/jspdf.es.min.js");window.jsPDF=_j.jsPDF||_j.default||_j;}catch(_err){}s.default=t';

if (s.includes(target)) {
  s = s.replace(target, replacement);
  fs.writeFileSync('js/html2pdf.bundle.min.js', s, 'utf8');
  console.log('Successfully patched webpack exports!');
} else {
  console.log('Target not found!');
}
