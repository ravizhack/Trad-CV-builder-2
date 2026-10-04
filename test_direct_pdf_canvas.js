const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const userDataDir = path.join(__dirname, 'edge-test-profile');

const proc = execFile(edgePath, [
  '--remote-debugging-port=9228',
  '--headless=new',
  `--user-data-dir=${userDataDir}`,
  'file:///' + path.resolve(__dirname, '../index.html').replace(/\\/g, '/')
]);

async function run() {
  let tab = null;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 500));
    try {
      const res = await fetch('http://127.0.0.1:9228/json');
      const tabs = await res.json();
      tab = tabs.find(t => t.url.includes('index.html')) || tabs[0];
      if (tab) break;
    } catch (e) {}
  }
  if (!tab) {
    console.error('No tab found');
    proc.kill();
    process.exit(1);
  }
  try {
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    ws.onopen = async () => {
      let id = 1;
      const send = (method, params = {}) => new Promise((resolve) => {
        const myId = id++;
        const handler = (evt) => {
          const msg = JSON.parse(evt.data);
          if (msg.id === myId) {
            ws.removeEventListener('message', handler);
            resolve(msg.result);
          }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id: myId, method, params }));
      });

      await send('Page.enable');
      await send('Runtime.enable');

      for (let i = 0; i < 30; i++) {
        const check = await send('Runtime.evaluate', {
          expression: 'typeof window.showScreen !== "undefined" && typeof window.html2canvas !== "undefined"',
          returnByValue: true
        });
        if (check?.result?.value === true) break;
        await new Promise(r => setTimeout(r, 300));
      }

      // Test generating PDF directly via html2canvas + jsPDF
      const res = await send('Runtime.evaluate', {
        expression: `(async () => {
          showScreen('editorScreen');
          const sample = generateSampleCV();
          AppState.currentCV = sample;
          const target = document.getElementById('cvPreviewPage');
          renderCVPreview(target);

          // Create wrapper
          const wrapper = document.createElement('div');
          wrapper.id = 'pdfExportWrapper';
          wrapper.style.cssText = [
            'position:fixed',
            'top:0',
            'left:0',
            'width:794px',
            'height:1122px',
            'overflow:hidden',
            'opacity:1',
            'pointer-events:none',
            'z-index:999990',
            'background:#ffffff'
          ].join(';');
          document.body.appendChild(wrapper);

          const page = document.createElement('div');
          page.className = 'cv-preview-page';
          page.style.cssText = [
            'width:794px',
            'height:1122px',
            'max-height:1122px',
            'min-height:1122px',
            'box-sizing:border-box',
            'overflow:hidden',
            'box-shadow:none',
            'margin:0',
            'padding:0',
            'position:relative',
            'background:#ffffff'
          ].join(';');
          wrapper.appendChild(page);
          renderCVPreview(page);

          page.classList.remove('show-safe-margins');
          const guide = page.querySelector('.cv-safe-margin-guide');
          if (guide) guide.remove();

          const spacer = page.querySelector('.cv-bottom-spacer');
          if (spacer) spacer.style.cssText = 'height:76px;min-height:76px;flex-shrink:0;width:100%;';

          // Inline computed CSS variables
          const cs = window.getComputedStyle(page);
          const vars = [
            '--cv-pad-top', '--cv-pad-bottom', '--cv-pad-side',
            '--cv-gap-main', '--cv-sec-gap', '--cv-item-gap',
            '--cv-sec-title-mb', '--cv-sec-title-pb',
            '--cv-font-body', '--cv-line-height', '--cv-font-title',
            '--cv-font-small', '--cv-font-name', '--cv-photo-size',
            '--cv-banner-pad-bottom', '--cv-bullet-gap'
          ];
          vars.forEach(v => {
            const val = cs.getPropertyValue(v).trim();
            if (val) page.style.setProperty(v, val);
          });

          // Wait a tick for reflow
          await new Promise(r => setTimeout(r, 100));

          // Run direct html2canvas
          const canvas = await html2canvas(page, {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            logging: false,
            width: 794,
            height: 1122,
            windowWidth: 794,
            windowHeight: 1122,
            scrollX: 0,
            scrollY: 0,
            backgroundColor: '#ffffff'
          });

          const imgData = canvas.toDataURL('image/jpeg', 0.98);

          // Direct jsPDF
          const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4',
            compress: true
          });
          pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
          const pdfDataUri = pdf.output('datauristring');

          document.body.removeChild(wrapper);

          return {
            canvasW: canvas.width,
            canvasH: canvas.height,
            imgDataLen: imgData.length,
            pdfLen: pdfDataUri.length,
            sampleImgPrefix: imgData.substring(0, 50)
          };
        })()`,
        awaitPromise: true,
        returnByValue: true
      });

      console.log('DIRECT EVAL RESULT:', JSON.stringify(res.result.value, null, 2));

      proc.kill();
      process.exit(0);
    };
  } catch (err) {
    console.error(err);
    proc.kill();
    process.exit(1);
  }
}
run();
