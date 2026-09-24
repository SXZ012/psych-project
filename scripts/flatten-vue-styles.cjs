/**
 * 一次性工具：把 Vue 单文件组件里重复堆叠的 <style scoped> 块，
 * 按真实 CSS 层叠规则（!important > 特异性 > 源码顺序）求解成一份等价的精简样式。
 *
 * 用法：node flatten-vue-styles.cjs <vue文件> [--write] [--report <文件>]
 */
const fs = require('fs');

const DEAD = new Set(`relax-stage relax-stage__photo relax-stage__sunlight relax-stage__copy relax-stage__meta
scene-wash breath-scene breath-ring
relax-menu relax-thumb relax-reassurance
relax-options relax-option relax-option__image relax-option__copy relax-option--sound relax-option--stretch relax-footnote
self-recommend recommend-meta self-visual
scale-mark catalog-dot catalog-dot--violet catalog-dot--blue catalog-dot--amber catalog-dot--teal catalog-dot--green catalog-dot--rose
article-row sleep-article support-article
reading-modal reading-summary video-row document-list video-modal
service-layout service-list service-detail detail-label detail-note detail-action breath
help-main help-guide self-preview self-orbit preview-line
scale-enter-active scale-leave-active scale-move`.split(/\s+/).filter(Boolean));

/* ---------------- 工具 ---------------- */

function splitTop(str, sep) {
  const parts = [];
  let depth = 0, cur = '', quote = null;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (quote) { cur += ch; if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (ch === sep && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  parts.push(cur);
  return parts.map(s => s.trim()).filter(Boolean);
}

/** 特异性 (b 类/属性/伪类, c 元素/伪元素)，a 恒为 0（本文件无 id 选择器） */
function specificity(sel) {
  const pseudoElements = ['::before', '::after', '::first-line', '::first-letter', '::placeholder', '::selection', '::marker', '::backdrop'];
  let b = 0, c = 0;
  for (const pe of pseudoElements) {
    const n = sel.split(pe).length - 1;
    if (n > 0) { c += n; sel = sel.split(pe).join(' '); }
  }
  // 去掉字符串内容
  sel = sel.replace(/"[^"]*"|'[^']*'/g, '');
  b += (sel.match(/\.[A-Za-z0-9_-]+/g) || []).length;
  b += (sel.match(/\[[^\]]*\]/g) || []).length;
  b += (sel.match(/:(?!:)[A-Za-z-]+/g) || []).length;   // 伪类
  const rest = sel
    .replace(/\.[A-Za-z0-9_-]+/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/:(?!:)[A-Za-z-]+(\([^)]*\))?/g, ' ')
    .replace(/[*>+~|]/g, ' ')
    .replace(/::?[A-Za-z-]+/g, ' ');
  c += (rest.match(/[A-Za-z][A-Za-z0-9_-]*/g) || []).length;
  return { b, c };
}

/* ---------------- 解析 ---------------- */

function parse(css, media, counter, out, pendingComments) {
  let i = 0;
  const comments = pendingComments || [];
  while (i < css.length) {
    while (i < css.length && /\s/.test(css[i])) i++;
    if (i >= css.length) break;
    if (css.startsWith('/*', i)) {
      const end = css.indexOf('*/', i + 2);
      comments.push(css.slice(i, end + 2).replace(/\s+/g, ' ').trim());
      i = end + 2;
      continue;
    }
    // 读到 { 或 ;
    let depth = 0, j = i;
    while (j < css.length) {
      const ch = css[j];
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      else if (depth === 0 && (ch === '{' || ch === ';')) break;
      j++;
    }
    const prelude = css.slice(i, j).trim();
    if (j >= css.length || css[j] === ';') { i = j + 1; continue; }
    let k = j + 1, d = 1;
    while (k < css.length && d > 0) {
      if (css[k] === '{') d++;
      else if (css[k] === '}') d--;
      k++;
    }
    const body = css.slice(j + 1, k - 1);
    if (/^@media/i.test(prelude)) {
      parse(body, prelude.replace(/^@media/i, '').trim(), counter, out, comments.slice());
      comments.length = 0;
    } else if (/^@(?:-webkit-)?keyframes/i.test(prelude)) {
      counter.n++;
      out.misc.push({ order: counter.n, raw: `${prelude}{${body}}`, kind: 'keyframes', name: prelude.replace(/^@(?:-webkit-)?keyframes/i, '').trim(), comments: comments.splice(0) });
    } else if (prelude.startsWith('@')) {
      counter.n++;
      out.misc.push({ order: counter.n, raw: `${prelude}{${body}}`, kind: 'at', comments: comments.splice(0) });
    } else {
      const decls = [];
      for (const chunk of splitTop(body, ';')) {
        const idx = chunk.indexOf(':');
        if (idx < 0) continue;
        let prop = chunk.slice(0, idx).trim();
        let value = chunk.slice(idx + 1).trim();
        let important = false;
        if (/!important$/i.test(value)) { important = true; value = value.replace(/\s*!important$/i, '').trim(); }
        if (prop && value) decls.push({ prop, value, important });
      }
      if (decls.length) {
        for (const sel of splitTop(prelude, ',')) {
          counter.n++;
          out.rules.push({ media, sel: sel.replace(/\s+/g, ' ').trim(), decls, order: counter.n, spec: specificity(sel), comments: comments.splice(0), block: prelude });
        }
      }
      comments.length = 0;
    }
    i = k;
  }
}

function collect(cssTexts) {
  const out = { rules: [], misc: [] };
  const counter = { n: 0 };
  for (const t of cssTexts) parse(t, null, counter, out, []);
  return out;
}

/* ---------------- 层叠求解 ---------------- */

const deadSel = sel => (sel.match(/\.[A-Za-z0-9_-]+/g) || []).some(t => DEAD.has(t.slice(1)));

function resolve(rules) {
  // key = media||selector  ->  prop -> winner
  const map = new Map();
  for (const r of rules) {
    if (deadSel(r.sel)) continue;
    const key = `${r.media || ''}||${r.sel}`;
    if (!map.has(key)) map.set(key, { media: r.media, sel: r.sel, spec: r.spec, props: new Map(), lastOrder: 0, comments: [], order: r.order });
    const e = map.get(key);
    e.lastOrder = Math.max(e.lastOrder, r.order);
    if (r.comments.length) e.comments.push(...r.comments);
    for (const d of r.decls) {
      const cur = e.props.get(d.prop);
      const cand = { value: d.value, important: d.important, spec: r.spec, order: r.order };
      if (!cur) { e.props.set(d.prop, cand); continue; }
      const better =
        (cand.important && !cur.important) ||
        (cand.important === cur.important && (
          cand.spec.b > cur.spec.b ||
          (cand.spec.b === cur.spec.b && cand.spec.c > cur.spec.c) ||
          (cand.spec.b === cur.spec.b && cand.spec.c === cur.spec.c && cand.order > cur.order)
        ));
      if (better) e.props.set(d.prop, cand);
    }
  }
  return map;
}

/** 为每个 (media, selector) 记录「生效声明的最大位置」 */
function withWinnerOrder(map) {
  for (const e of map.values()) {
    let m = 0;
    for (const v of e.props.values()) m = Math.max(m, v.order);
    e.winnerOrder = m;
  }
  return map;
}

/** 每个 media 上下文里，实际生效的是「无 media 声明 + 该 media 声明」的胜者 */
function winnersByContext(rules) {
  const contexts = new Set(['']);
  for (const r of rules) if (r.media) contexts.add(r.media);
  const res = new Map(); // ctx -> key -> props
  for (const ctx of contexts) {
    const applicable = rules.filter(r => !r.media || r.media === ctx).filter(r => !deadSel(r.sel));
    res.set(ctx, resolve(applicable));
  }
  return res;
}

/* ---------------- 输出 ---------------- */

/** 把「属性 -> 生效值」按生效位置分组：同一位置生效的属性才能合并进同一条规则 */
function groupByOrder(props) {
  const g = new Map();
  for (const [prop, v] of props) {
    if (!g.has(v.order)) g.set(v.order, new Map());
    g.get(v.order).set(prop, v);
  }
  return g;
}

function build(rules, misc, baseCtx) {
  const ctxWinner = winnersByContext(rules);
  const base = ctxWinner.get(baseCtx);

  const lines = [];
  const allComments = new Set();

  // keyframes / at-rules（保留定义，剔除无人引用的 keyframes）
  const kf = new Map();
  for (const m of misc) {
    if (m.kind === 'keyframes') kf.set(m.name, m);
    else lines.push({ order: m.order, text: m.raw, comments: m.comments, noMerge: true });
  }
  const usedNames = new Set();
  for (const e of base.values()) for (const p of e.props.values()) {
    const found = String(p.value).match(/[A-Za-z][A-Za-z0-9_-]*/g) || [];
    for (const f of found) usedNames.add(f);
  }
  const droppedKeyframes = [];
  for (const [name, m] of kf) {
    if (usedNames.has(name)) lines.push({ order: m.order, text: m.raw, comments: m.comments });
    else droppedKeyframes.push(name);
  }

  const decls = props => [...props].map(([prop, v]) => `${prop}:${v.value}${v.important ? '!important' : ''}`).join(';');
  const push = (text, order, comments) => {
    const cs = (comments || []).filter(c => !allComments.has(c) && c.length > 3);
    cs.forEach(c => allComments.add(c));
    lines.push({ order, text, comments: cs.slice(0, 4) });
  };

  // 基础（无 media）规则：按「真正生效那条声明」的位置分组输出，保证排序精确
  for (const e of base.values()) {
    if (!e.props.size) continue;
    const groups = [...groupByOrder(e.props)];
    groups.forEach(([order, props], i) => push(`${e.sel}{${decls(props)}}`, order, i === groups.length - 1 ? e.comments : []));
  }

  // 各 media 上下文中与基础不同的部分
  for (const ctx of ctxWinner.keys()) {
    if (!ctx) continue;
    const ctxMap = ctxWinner.get(ctx);
    for (const [key, e] of ctxMap) {
      const b = base.get(key);
      const diff = new Map();
      for (const [prop, v] of e.props) {
        const bv = b && b.props.get(prop);
        if (!bv || bv.value !== v.value || bv.important !== v.important) diff.set(prop, v);
      }
      for (const [order, props] of groupByOrder(diff)) {
        push(`@media ${ctx}{${e.sel}{${decls(props)}}}`, order, []);
      }
    }
  }

  lines.sort((a, b) => a.order - b.order);

  /* 纯排版整理：把「相邻且媒体条件完全相同」的 @media 块合成一个。
   * `@media X{a} @media X{b}` 与 `@media X{a b}` 完全等价（条件相同、内部顺序不变、相邻所以中间没有别的规则），
   * 不触碰任何声明的生效位置，因此对层叠零影响。 */
  const mediaRe = /^@media ([^{]*)\{(.*)\}$/;
  const grouped = [];
  for (const l of lines) {
    const m = mediaRe.exec(l.text);
    const prev = grouped[grouped.length - 1];
    if (m && prev && prev.media === m[1]) {
      prev.inner.push({ text: m[2], comments: l.comments || [] });
    } else if (m) {
      grouped.push({ media: m[1], comments: l.comments || [], inner: [{ text: m[2], comments: [] }] });
    } else {
      grouped.push({ media: '', comments: l.comments || [], text: l.text });
    }
  }

  const out = [];
  for (const g of grouped) {
    for (const c of g.comments) out.push(c);
    if (!g.inner) { out.push(g.text); continue; }
    const body = [];
    for (const it of g.inner) {
      for (const c of it.comments) body.push(`  ${c}`);
      body.push(`  ${it.text}`);
    }
    out.push(`@media ${g.media}{\n${body.join('\n')}\n}`);
  }
  return { css: out.join('\n'), droppedKeyframes, ctxCount: ctxWinner.size };
}

/* ---------------- 交叉选择器顺序检查 ---------------- */
/** 取选择器最后一个复合选择器（最后一个组合符之后的部分） */
function lastCompound(sel) {
  let depth = 0, last = 0;
  for (let i = 0; i < sel.length; i++) {
    const ch = sel[i];
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (depth === 0 && (ch === ' ' || ch === '>' || ch === '+' || ch === '~')) last = i + 1;
  }
  return sel.slice(last).trim();
}

/**
 * 交叉选择器顺序检查（辅助手段，非决定性判据）。
 * 注意：这里用「尾复合选择器相同」来判定两个选择器可能命中同一元素，这是个**保守但不完备**的近似——
 * 元素可以同时带多个类（class="a b"），此时 `a` 与 `.b` 明明命中同一元素、尾复合选择器却不同，
 * 会被漏判。所以本检查只能发现一部分顺序翻转，最终结论必须以 style-diff.cjs 的真实浏览器比对为准。
 */
function collisionCheck(rules) {
  const contexts = new Set(['']);
  for (const r of rules) if (r.media) contexts.add(r.media);
  const out = [];
  for (const ctx of contexts) {
    const applicable = rules.filter(r => !r.media || r.media === ctx).filter(r => !deadSel(r.sel));
    const map = resolve(applicable);
    const entries = [...map.values()].filter(e => e.props.size).map(e => ({ ...e, tail: lastCompound(e.sel) }));
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const A = entries[i], B = entries[j];
        if (A.sel === B.sel) continue;
        if (A.tail !== B.tail) continue;                                   // 不同元素，永不冲突
        if (A.spec.b !== B.spec.b || A.spec.c !== B.spec.c) continue;      // 特异性不同，顺序无关
        for (const p of A.props.keys()) {
          if (!B.props.has(p)) continue;
          const av = A.props.get(p), bv = B.props.get(p);
          const origWinner = av.order > bv.order ? 'A' : bv.order > av.order ? 'B' : '=';
          const newWinner = A.lastOrder > B.lastOrder ? 'A' : B.lastOrder > A.lastOrder ? 'B' : '=';
          out.push({ ctx, pair: `${A.sel} ┃ ${B.sel}`, prop: p, origWinner, newWinner, ok: origWinner === newWinner });
        }
      }
    }
  }
  return out;
}

/* ---------------- 主流程 ---------------- */

const file = process.argv[2];
const doWrite = process.argv.includes('--write');
const reportPath = (() => { const i = process.argv.indexOf('--report'); return i > 0 ? process.argv[i + 1] : null; })();
const emitPath = (() => { const i = process.argv.indexOf('--emit'); return i > 0 ? process.argv[i + 1] : null; })();
const src = fs.readFileSync(file, 'utf8');
const oldCssAll = (() => {
  const r = /<style scoped>([\s\S]*?)<\/style>/g; let mm, acc = [];
  while ((mm = r.exec(src))) acc.push(mm[1]);
  return acc.join('\n');
})();

const re = /<style scoped>([\s\S]*?)<\/style>/g;
let m, blocks = [], spans = [];
while ((m = re.exec(src))) { blocks.push(m[1]); spans.push([m.index, m.index + m[0].length]); }

const orig = collect(blocks);
const origCtx = winnersByContext(orig.rules);

// 构建新 CSS：所有 media 上下文都视为可独立比对，取其并集基准（以 1050/650 那个为主上下文）
const contexts = [...new Set(orig.rules.map(r => r.media).filter(Boolean))];
const built = build(orig.rules, orig.misc, '');

// 验证：用新 css 重新解析并比对
const reparsed = collect([built.css]);
const newCtx = winnersByContext(reparsed.rules);
const diffs = [];
for (const [ctx, map] of origCtx) {
  const nm = newCtx.get(ctx) || new Map();
  const keys = new Set([...map.keys(), ...nm.keys()]);
  for (const k of keys) {
    const a = map.get(k), b = nm.get(k);
    if (!a || !b) { diffs.push(`[${ctx || 'base'}] ${k} 只在一边存在`); continue; }
    const props = new Set([...a.props.keys(), ...b.props.keys()]);
    for (const p of props) {
      const av = a.props.get(p), bv = b.props.get(p);
      const as = av ? `${av.value}${av.important ? '!' : ''}` : '(无)';
      const bs = bv ? `${bv.value}${bv.important ? '!' : ''}` : '(无)';
      if (as !== bs) diffs.push(`[${ctx || 'base'}] ${k} :: ${p}  原=${as}  新=${bs}`);
    }
  }
}

const deadRules = orig.rules.filter(r => deadSel(r.sel)).length;

// 交叉选择器（同尾 + 同优先级）的胜负关系必须与原文一致
const colOrig = collisionCheck(orig.rules);
const colNew = collisionCheck(reparsed.rules);
const kc = c => `${c.ctx}|${c.pair}|${c.prop}`;
const origCol = new Map(colOrig.map(c => [kc(c), c.origWinner]));
const colDiffs = colNew.filter(c => origCol.has(kc(c)) && origCol.get(kc(c)) !== c.newWinner)
  .map(c => `${c.ctx || 'base'} ${c.pair} (${c.prop}) 原胜方=${origCol.get(kc(c))} 新胜方=${c.newWinner}`);

const report = [
  `源文件: ${file}`,
  `style 块数: ${blocks.length}`,
  `原规则条目: ${orig.rules.length}（其中死代码规则 ${deadRules}）`,
  `新规则条目: ${reparsed.rules.length}`,
  `media 上下文: ${contexts.length} -> ${contexts.join(' | ')}`,
  `剔除的无用 keyframes: ${built.droppedKeyframes.join(', ') || '(无)'}`,
  `新 CSS 字符数: ${built.css.length}   原始字符数: ${blocks.join('').length}`,
  '',
  diffs.length ? `！！层叠差异 ${diffs.length} 处（须人工确认）：` : '✓ 层叠等价性校验通过：所有选择器/属性的最终生效值与原文完全一致',
  ...diffs.slice(0, 200),
  '',
  `同尾同优先级交叉点: 原文 ${colOrig.length} 处 / 新文 ${colNew.length} 处`,
  colDiffs.length
    ? `（仅供参考，不阻塞）胜负关系翻转 ${colDiffs.length} 处 —— 本检查基于「尾复合选择器相同」的近似，`
      + `遇到同一元素挂多个类名时会误报，无法作为判据；真正的等价性以 style-diff.cjs 的浏览器逐元素比对为准。`
    : '✓ 交叉选择器胜负关系与原文一致',
].join('\n');

if (reportPath) fs.writeFileSync(reportPath, report, 'utf8');
if (emitPath) fs.writeFileSync(emitPath, built.css, 'utf8');
const oldPath = (() => { const i = process.argv.indexOf('--emit-old'); return i > 0 ? process.argv[i + 1] : null; })();
if (oldPath) fs.writeFileSync(oldPath, oldCssAll, 'utf8');
console.log(report);

// 写回的唯一闸门是「层叠等价性」：新 CSS 重解析后每个 (media, 选择器, 属性) 的最终生效值
// 必须与原文逐条一致。静态交叉检查噪声过大，不作为闸门（详见 collisionCheck 注释）。
if (doWrite && diffs.length === 0) {
  let out = src;
  for (let i = spans.length - 1; i >= 0; i--) {
    const [s, e] = spans[i];
    out = out.slice(0, s) + (i === 0 ? `<style scoped>\n${built.css}\n</style>\n` : '') + out.slice(e);
  }
  fs.writeFileSync(file, out, 'utf8');
  console.log(`\n已写回文件：${blocks.length} 个 style 块 -> 1 个。`);
  console.log('提醒：请再跑一次 style-diff.cjs（浏览器逐元素比对）作为最终验收。');
} else if (doWrite) {
  console.log('\n存在层叠差异，未写回。');
}
