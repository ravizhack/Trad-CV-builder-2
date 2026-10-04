const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const userDataDir = path.join(__dirname, 'edge-debug-profile');

const proc = execFile(edgePath, [
  '--remote-debugging-port=9240',
  '--headless=new',
  `--user-data-dir=${userDataDir}`,
  'file:///' + path.resolve(__dirname, '../index.html').replace(/\\/g, '/')
]);

async function run() {
  let tab = null;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 500));
    try {
      const res = await fetch('http://127.0.0.1:9240/json');
      const tabs = await res.json();
      tab = tabs.find(t => t.url.includes('index.html')) || tabs[0];
      if (tab) break;
    } catch (e) {}
  }
  if (!tab) { proc.kill(); process.exit(1); }

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
          expression: 'typeof window.downloadPDF !== "undefined"',
          returnByValue: true
        });
        if (check?.result?.value === true) break;
        await new Promise(r => setTimeout(r, 300));
      }

      // Load sample CV, switch to single-column, and call downloadPDF()
      const evalRes = await send('Runtime.evaluate', {
        expression: `(async () => {
          showScreen('editorScreen');
          const sample = generateSampleCV();
          sample.design.layout = 'single-column';
          AppState.currentCV = sample;
          const target = document.getElementById('cvPreviewPage');
          renderCVPreview(target);

          // Spy on pdf.save
          let savedPdfUri = null;
          const JsPdfClass = window.jsPDF || (window.jspdf && window.jspdf.jsPDF);
          if (JsPdfClass) {
            JsPdfClass.prototype.save = function(name) {
              savedPdfUri = this.output('datauristring');
              window.__lastSavedPdf = savedPdfUri;
            };
          }

          downloadPDF();

          // Wait for downloadPDF async rendering
          for (let i = 0; i < 40; i++) {
            await new Promise(r => setTimeout(r, 200));
            if (savedPdfUri) break;
          }

          return {
            hasSavedPdf: !!savedPdfUri,
            pdfLen: savedPdfUri ? savedPdfUri.length : 0
          };
        })()`,
        awaitPromise: true,
        returnByValue: true
      });

      console.log('Eval result:', evalRes?.result?.value);

      if (evalRes?.result?.value?.hasSavedPdf) {
        const fullUri = await send('Runtime.evaluate', {
          expression: 'window.__lastSavedPdf',
          returnByValue: true
        });
        const raw = fullUri.result.value.split(',')[1];
        fs.writeFileSync(path.join(__dirname, 'test_output_downloadPDF.pdf'), Buffer.from(raw, 'base64'));
        console.log('Wrote test_output_downloadPDF.pdf, size:', fs.statSync(path.join(__dirname, 'test_output_downloadPDF.pdf')).size);
      }

      ws.close();
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
