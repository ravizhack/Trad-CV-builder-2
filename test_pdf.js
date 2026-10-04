const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const userDataDir = path.join(__dirname, 'edge-temp-profile');

const proc = execFile(edgePath, [
  '--remote-debugging-port=9222',
  '--headless=new',
  `--user-data-dir=${userDataDir}`,
  'file:///' + path.resolve(__dirname, '../index.html').replace(/\\/g, '/')
]);

async function run() {
  let tab = null;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 500));
    try {
      const res = await fetch('http://127.0.0.1:9222/json');
      const tabs = await res.json();
      tab = tabs.find(t => t.url.includes('index.html')) || tabs[0];
      if (tab) break;
    } catch (e) {}
  }
  if (!tab) {
    console.error('No tab found after 10s');
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

      // Wait until window.showScreen is defined
      for (let i = 0; i < 30; i++) {
        const check = await send('Runtime.evaluate', {
          expression: 'typeof window.showScreen !== "undefined" && typeof window.html2canvas !== "undefined"',
          returnByValue: true
        });
        if (check?.result?.value === true) break;
        await new Promise(r => setTimeout(r, 300));
      }

      const evalRes = await send('Runtime.evaluate', {
        expression: `(async () => {
          showScreen('editorScreen');
          const sample = generateSampleCV();
          sample.design.layout = 'single-column';
          AppState.currentCV = sample;
          const target = document.getElementById('cvPreviewPage');
          renderCVPreview(target);



          // 1. Test printArea setup
          const printArea = document.getElementById('printArea');
          printArea.innerHTML = '';
          const printPage = document.createElement('div');
          printPage.className = 'cv-preview-page';
          printPage.style.cssText = 'width:794px;height:1122px;max-height:1122px;min-height:1122px;margin:0;padding:0;box-shadow:none;';
          printArea.appendChild(printPage);
          renderCVPreview(printPage);

          const guide = printPage.querySelector('.cv-safe-margin-guide');
          if (guide) guide.remove();

          return {
            printPageChildren: printPage.children.length,
            printAreaHtmlLength: printArea.innerHTML.length
          };
        })()`,
        awaitPromise: true,
        returnByValue: true
      });

      console.log('PRINT AREA READY:', JSON.stringify(evalRes, null, 2));

      // Test Page.printToPDF to verify printed PDF is NOT blank
      const printPdfRes = await send('Page.printToPDF', {
        paperWidth: 8.27,
        paperHeight: 11.69,
        marginTop: 0,
        marginBottom: 0,
        marginLeft: 0,
        marginRight: 0,
        printBackground: true
      });
      fs.writeFileSync(path.join(__dirname, 'test_output_print_fixed.pdf'), Buffer.from(printPdfRes.data, 'base64'));
      console.log('Saved test_output_print_fixed.pdf, size:', printPdfRes.data.length);

      // Now test the actual downloadPDF function!
      const dlRes = await send('Runtime.evaluate', {
        expression: `(async () => {
          downloadPDF();

          // Wait for overlay to disappear (meaning export is complete)
          for (let i = 0; i < 40; i++) {
            await new Promise(r => setTimeout(r, 200));
            if (!document.getElementById('pdfExportOverlay') && !document.getElementById('pdfExportWrapper')) {
              return { complete: true, toast: document.getElementById('toast')?.textContent };
            }
          }
          return { complete: false, toast: document.getElementById('toast')?.textContent };
        })()`,
        awaitPromise: true,
        returnByValue: true
      });

      console.log('DOWNLOAD PDF STATUS:', JSON.stringify(dlRes, null, 2));

      proc.kill();
      process.exit(0);
    };
  } catch (err) {
    console.error('Error:', err);
    proc.kill();
    process.exit(1);
  }
}

run();
