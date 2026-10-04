const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const userDataDir = path.join(__dirname, 'edge-test-profile');

const proc = execFile(edgePath, [
  '--remote-debugging-port=9229',
  '--headless=new',
  `--user-data-dir=${userDataDir}`,
  'file:///' + path.resolve(__dirname, '../index.html').replace(/\\/g, '/')
]);

async function run() {
  let tab = null;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 500));
    try {
      const res = await fetch('http://127.0.0.1:9229/json');
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
          expression: 'typeof window.showScreen !== "undefined" && typeof window.html2canvas !== "undefined"',
          returnByValue: true
        });
        if (check?.result?.value === true) break;
        await new Promise(r => setTimeout(r, 300));
      }

      const res = await send('Runtime.evaluate', {
        expression: `(async () => {
          showScreen('editorScreen');
          const sample = generateSampleCV();
          AppState.currentCV = sample;

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

          await new Promise(r => setTimeout(r, 100));

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
          document.body.removeChild(wrapper);

          // Return base64 chunks or save to localStorage so we can read it
          sessionStorage.setItem('exported_img', imgData);
          return { done: true, len: imgData.length };
        })()`,
        awaitPromise: true,
        returnByValue: true
      });

      console.log('Canvas generated:', res.result.value);

      // Now read back from sessionStorage in chunks
      const len = res.result.value.len;
      let fullBase64 = '';
      const chunkSize = 200000;
      for (let offset = 0; offset < len; offset += chunkSize) {
        const chunkRes = await send('Runtime.evaluate', {
          expression: `sessionStorage.getItem('exported_img').substring(${offset}, ${offset + chunkSize})`,
          returnByValue: true
        });
        fullBase64 += chunkRes.result.value;
      }

      const raw = fullBase64.replace(/^data:image\/jpeg;base64,/, '');
      fs.writeFileSync(path.join(__dirname, 'perfect_export.jpg'), Buffer.from(raw, 'base64'));
      console.log('Saved perfect_export.jpg! Size:', fs.statSync(path.join(__dirname, 'perfect_export.jpg')).size);

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
