/**
 * 把「改前 CSS」与「改后 CSS」分别套在同一个 DOM 快照上，
 * 用真实 Chrome 逐元素比对计算样式与布局盒，验证样式清理是否零视觉改动。
 *
 * 用法：node style-diff.cjs <old.css> <new.css> <harness.html> <outDir>
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const [oldCssPath, newCssPath, harnessPath, outDir] = process.argv.slice(2)
  .map(p => path.resolve(p));
if (!oldCssPath || !newCssPath || !harnessPath || !outDir) {
  console.error('用法：node style-diff.cjs <old.css> <new.css> <harness.html> <outDir>');
  process.exit(1);
}
const oldCss = fs.readFileSync(oldCssPath, 'utf8');
const newCss = fs.readFileSync(newCssPath, 'utf8');

const BROWSERS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];
const exe = BROWSERS.find(p => fs.existsSync(p));
if (!exe) { console.error('找不到浏览器'); process.exit(1); }

const PORT = 9411;
const userDir = path.join(require('os').tmpdir(), 'style-diff-profile');

const VIEWPORTS = [
  { name: '1280x720', w: 1280, h: 720, motion: 'no-preference' },
  { name: '1000x600', w: 1000, h: 600, motion: 'no-preference' },
  { name: '700x900', w: 700, h: 900, motion: 'no-preference' },
  { name: '1280x720-reduced', w: 1280, h: 720, motion: 'reduce' },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function http(pathname) {
  const res = await fetch(`http://127.0.0.1:${PORT}${pathname}`);
  return res.json();
}

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.events = []; this.handlers = new Map(); }
  static async attach(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const c = new CDP(ws);
    ws.onmessage = ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && c.pending.has(msg.id)) {
        const { resolve, reject } = c.pending.get(msg.id);
        c.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      } else if (msg.method) {
        c.events.push(msg);
        (c.handlers.get(msg.method) || []).forEach(fn => fn(msg.params));
      }
    };
    return c;
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  on(method, fn) { if (!this.handlers.has(method)) this.handlers.set(method, []); this.handlers.get(method).push(fn); }
}

async function main() {
  const args = [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${userDir}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--allow-file-access-from-files', '--font-render-hinting=none',
    'about:blank',
  ];
  const proc = spawn(exe, args, { stdio: 'ignore', detached: false });

  let target = null;
  for (let i = 0; i < 60; i++) {
    try { const list = await http('/json/list'); target = list.find(t => t.type === 'page'); if (target) break; } catch { }
    await sleep(500);
  }
  if (!target) { proc.kill(); throw new Error('无法连接到浏览器调试端口'); }

  const cdp = await CDP.attach(target.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  const fileUrl = 'file:///' + harnessPath.replace(/\\/g, '/');
  const loaded = new Promise(resolve => cdp.on('Page.loadEventFired', resolve));
  await cdp.send('Page.navigate', { url: fileUrl });
  await loaded;
  await sleep(300);

  fs.mkdirSync(outDir, { recursive: true });
  const report = [];

  for (const vp of VIEWPORTS) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: false,
    });
    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: vp.motion }],
    });

    const shots = {};
    const data = {};
    // 统一的求值封装：页面里抛异常时给出可读报错，而不是后续 JSON.parse(undefined)
    const evalExpr = async (expression, returnByValue = false) => {
      const res = await cdp.send('Runtime.evaluate', { expression, returnByValue });
      if (res.exceptionDetails) {
        throw new Error(`页面求值失败: ${expression}\n${JSON.stringify(res.exceptionDetails, null, 2).slice(0, 1200)}`);
      }
      if (returnByValue && res.result.value === undefined) {
        throw new Error(`页面求值未返回可序列化值: ${expression}（result=${JSON.stringify(res.result).slice(0, 300)}）`);
      }
      return res;
    };
    for (const variant of ['old', 'new']) {
      await evalExpr(`window.__setCss(${JSON.stringify(variant === 'old' ? oldCss : newCss)})`);
      await evalExpr('window.__freeze(false)');
      await sleep(800);
      const props = await evalExpr('window.__snapProps()', true);
      await evalExpr('window.__freeze(true)');
      await sleep(120);
      const rects = await evalExpr('window.__snapRect()', true);
      await evalExpr('window.__freeze(false)');
      await sleep(60);
      data[variant] = { props: JSON.parse(props.result.value), rects: JSON.parse(rects.result.value) };
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      shots[variant] = Buffer.from(shot.data, 'base64');
    }

    fs.writeFileSync(path.join(outDir, `${vp.name}-old.png`), shots.old);
    fs.writeFileSync(path.join(outDir, `${vp.name}-new.png`), shots.new);

    const diffs = [];
    const A = data.old.props, B = data.new.props;
    const n = Math.max(A.length, B.length);
    for (let i = 0; i < n; i++) {
      const a = A[i], b = B[i];
      if (!a || !b) { diffs.push(`元素数量不一致 @${i}: ${a ? a.sel : '(缺)'} / ${b ? b.sel : '(缺)'}`); continue; }
      if (a.sel !== b.sel) { diffs.push(`元素错位 @${i}: ${a.sel} / ${b.sel}`); continue; }
      if (a.props !== b.props) {
        const pa = new Map(a.props.split(';').map(s => [s.slice(0, s.indexOf('=')), s.slice(s.indexOf('=') + 1)]));
        const pb = new Map(b.props.split(';').map(s => [s.slice(0, s.indexOf('=')), s.slice(s.indexOf('=') + 1)]));
        const keys = new Set([...pa.keys(), ...pb.keys()]);
        const changed = [];
        // 带无限动画的元素，其 transform/opacity 取决于取样时刻，属测量噪声
        const animated = a.noisy || b.noisy;
        for (const k of keys) {
          if (animated && (k === 'transform' || k === 'opacity')) continue;
          if (pa.get(k) !== pb.get(k)) changed.push(`${k}: ${pa.get(k)} -> ${pb.get(k)}`);
        }
        if (changed.length) diffs.push(`${a.sel}\n    ${changed.join('\n    ')}`);
      }
      for (const pe of ['::before', '::after']) {
        if (a[pe] === b[pe]) continue;
        if (a.noisy || b.noisy) {
          // 只比较非动画相关字段
          const strip = v => v.split('|').filter((_, i) => i !== 9 && i !== 10).join('|');
          if (strip(a[pe]) === strip(b[pe])) continue;
        }
        diffs.push(`${a.sel} ${pe}\n    原=${a[pe]}\n    新=${b[pe]}`);
      }
    }
    const rectDiffs = [];
    for (let i = 0; i < data.old.rects.length; i++) {
      const a = data.old.rects[i], b = data.new.rects[i];
      if (!a || !b) continue;
      if (a.rect !== b.rect) rectDiffs.push(`${a.sel}  ${a.rect} -> ${b.rect}`);
    }

    report.push({
      vp: vp.name, diffs, rectDiffs,
      elements: data.old.rects.length,
      oldPng: path.join(outDir, `${vp.name}-old.png`),
      newPng: path.join(outDir, `${vp.name}-new.png`),
      pngIdentical: shots.old.equals(shots.new),
      oldSize: shots.old.length, newSize: shots.new.length,
    });
  }

  const lines = [];
  let allOk = true;
  for (const r of report) {
    lines.push(`===== 视口 ${r.vp}（元素 ${r.elements}） =====`);
    lines.push(`截图字节一致: ${r.pngIdentical ? 'YES' : 'NO'}  (${r.oldSize} / ${r.newSize} bytes)`);
    if (r.diffs.length) { allOk = false; lines.push(`！！计算样式差异 ${r.diffs.length} 处：`); lines.push(...r.diffs.slice(0, 120)); }
    else lines.push('✓ 计算样式逐属性完全一致');
    if (r.rectDiffs.length) { allOk = false; lines.push(`！！布局盒差异 ${r.rectDiffs.length} 处：`); lines.push(...r.rectDiffs.slice(0, 120)); }
    else lines.push('✓ 布局盒（x/y/w/h）完全一致');
    lines.push('');
  }
  lines.unshift(allOk ? '★★ 全部视口：样式清理零视觉改动，验证通过 ★★\n' : '×× 存在差异，需处理 ××\n');
  fs.writeFileSync(path.join(outDir, 'report.txt'), lines.join('\n'), 'utf8');
  console.log(lines.join('\n').slice(0, 6000));

  proc.kill();
  process.exit(allOk ? 0 : 2);
}

main().catch(e => { console.error(e); process.exit(1); });
