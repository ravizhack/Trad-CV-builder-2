const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const userDataDir = path.join(__dirname, 'edge-test-profile');

const proc = execFile(edgePath, [
  '--remote-debugging-port=9226',
  '--headless=new',
  `--user-data-dir=${userDataDir}`,
  'file:///' + path.resolve(__dirname, '../index.html').replace(/\\/g, '/')
]);

async function run() {
  let tab = null;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 500));
    try {
      const res = await fetch('http://127.0.0.1:9226/json');
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
          expression: 'typeof window.showScreen !== "undefined" && typeof window.html2canvas !== "undefined"',
          returnByValue: true
        });
        if (check?.result?.value === true) break;
        await new Promise(r => setTimeout(r, 300));
      }

      const globals = await send('Runtime.evaluate', {
        expression: '({ html2canvas: typeof window.html2canvas, jsPDF: typeof window.jsPDF, html2pdf: typeof window.html2pdf })',
        returnByValue: true
      });
      console.log('GLOBALS CHECK:', globals.result.value);

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
