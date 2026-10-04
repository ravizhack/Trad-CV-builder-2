const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const userDataDir = path.join(__dirname, 'edge-test-profile');

const proc = execFile(edgePath, [
  '--remote-debugging-port=9231',
  '--headless=new',
  `--user-data-dir=${userDataDir}`,
  'file:///' + path.resolve(__dirname, '../index.html').replace(/\\/g, '/')
]);

async function run() {
  let tab = null;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 500));
    try {
      const res = await fetch('http://127.0.0.1:9231/json');
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

      for (let i = 0; i < 30; i++) {
        const check = await send('Runtime.evaluate', {
          expression: 'typeof window.showScreen !== "undefined" && typeof window.downloadPDF === "function"',
          returnByValue: true
        });
        if (check?.result?.value === true) break;
        await new Promise(r => setTimeout(r, 300));
      }

      // Test 1: Setup sample CV and run downloadPDF
      const testRes = await send('Runtime.evaluate', {
        expression: `(async () => {
          showScreen('editorScreen');
          const sample = generateSampleCV();
          AppState.currentCV = sample;
          renderCVPreview(document.getElementById('cvPreviewPage'));

          // Trigger downloadPDF
          downloadPDF();

          // Wait until overlay is removed
          for (let i = 0; i < 50; i++) {
            await new Promise(r => setTimeout(r, 150));
            if (!document.getElementById('pdfExportOverlay') && !document.getElementById('pdfExportWrapper')) {
              return { success: true, toast: document.getElementById('toast')?.textContent };
            }
          }
          return { success: false, toast: document.getElementById('toast')?.textContent };
        })()`,
        awaitPromise: true,
        returnByValue: true
      });

      console.log('TEST 1 (DOWNLOAD PDF) RESULT:', testRes.result.value);

      // Test 2: Test printArea setup
      const printTest = await send('Runtime.evaluate', {
        expression: `(() => {
          // Trigger print setup without window.print modal hang
          const origPrint = window.print;
          let printed = false;
          window.print = () => { printed = true; };
          printCV();
          const printArea = document.getElementById('printArea');
          const page = printArea.querySelector('.cv-preview-page');
          const res = {
            printed,
            hasPrintPage: !!page,
            pageClasses: page ? page.className : '',
            pageChildren: page ? page.children.length : 0,
            hasBottomSpacer: !!(page && page.querySelector('.cv-bottom-spacer')),
            twoCol: !!(page && page.querySelector('.cv-page-two-col')),
            singleCol: !!(page && page.querySelector('.cv-page-single-col'))
          };
          window.print = origPrint;
          return res;
        })()`,
        returnByValue: true
      });

      console.log('TEST 2 (PRINT CV) RESULT:', printTest.result.value);

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
