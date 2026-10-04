const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const userDataDir = path.join(__dirname, 'edge-debug-profile');

const proc = execFile(edgePath, [
  '--remote-debugging-port=9223',
  '--headless=new',
  `--user-data-dir=${userDataDir}`,
  'file:///' + path.resolve(__dirname, '../index.html').replace(/\\/g, '/')
]);

async function run() {
  let tab = null;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 500));
    try {
      const res = await fetch('http://127.0.0.1:9223/json');
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

      ws.addEventListener('message', (evt) => {
        const msg = JSON.parse(evt.data);
        if (msg.method === 'Runtime.consoleAPICalled') {
          console.log('BROWSER LOG:', msg.params.type, msg.params.args.map(a => a.value || a.description).join(' '));
        }
        if (msg.method === 'Runtime.exceptionThrown') {
          console.log('BROWSER EXCEPTION:', msg.params.exceptionDetails.text, msg.params.exceptionDetails.exception?.description);
        }
      });

      for (let i = 0; i < 30; i++) {
        const check = await send('Runtime.evaluate', {
          expression: 'typeof window.showScreen !== "undefined" && typeof window.html2pdf !== "undefined"',
          returnByValue: true
        });
        if (check?.result?.value === true) break;
        await new Promise(r => setTimeout(r, 300));
      }

      // Run exact downloadPDF sequence, but capture pdf datauri
      const res = await send('Runtime.evaluate', {
        expression: `(async () => {
          showScreen('editorScreen');
          const sample = generateSampleCV();
          AppState.currentCV = sample;
          const target = document.getElementById('cvPreviewPage');
          renderCVPreview(target);

          // Now simulate downloadPDF
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

          const opt = {
            margin: [0, 0, 0, 0],
            filename: 'test.pdf',
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: {
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
              imageTimeout: 0,
              backgroundColor: '#ffffff'
            },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: [] }
          };

          // Also let's test direct html2canvas
          const canvas = await html2canvas(page, opt.html2canvas);
          const canvasData = canvas.toDataURL('image/png');

          const pdfBlob = await html2pdf().set(opt).from(page).outputPdf('datauristring');

          document.body.removeChild(wrapper);

          return {
            canvasWidth: canvas.width,
            canvasHeight: canvas.height,
            canvasDataLen: canvasData.length,
            pdfLen: (pdfBlob || '').length
          };
        })()`,
        awaitPromise: true,
        returnByValue: true
      });

      console.log('Result evaluated:', JSON.stringify(res.result));

      proc.kill();
      process.exit(0);
    };
  } catch (e) {
    console.error(e);
    proc.kill();
    process.exit(1);
  }
}
run();
