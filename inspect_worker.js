const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const userDataDir = path.join(__dirname, 'edge-test-profile');

const proc = execFile(edgePath, [
  '--remote-debugging-port=9227',
  '--headless=new',
  `--user-data-dir=${userDataDir}`,
  'file:///' + path.resolve(__dirname, '../index.html').replace(/\\/g, '/')
]);

async function run() {
  let tab = null;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 500));
    try {
      const res = await fetch('http://127.0.0.1:9227/json');
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
          expression: 'typeof window.html2pdf !== "undefined"',
          returnByValue: true
        });
        if (check?.result?.value === true) break;
        await new Promise(r => setTimeout(r, 300));
      }

      const info = await send('Runtime.evaluate', {
        expression: `(() => {
          const w = html2pdf();
          const proto = Object.getOwnPropertyNames(Object.getPrototypeOf(w));
          const keys = Object.keys(w);
          return { proto, keys, workerStatic: Object.keys(html2pdf.Worker || {}) };
        })()`,
        returnByValue: true
      });
      console.log('WORKER INFO:', JSON.stringify(info.result.value, null, 2));

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
