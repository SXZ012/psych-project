/**
 * 收尾复验：拿写回后的真实 .vue 与备份 .vue 对比。
 *  1. style 块数量
 *  2. <style> 之前的 template/script 是否逐字节不变
 *  3. 两个文件里抽出 CSS 的——旧版 23 块合并 vs 新版单块——再走一遍浏览器比对（由 style-diff.cjs 完成）
 *
 * 用法：node verify-flatten.cjs <当前.vue> <备份.vue> <outOldCss> <outNewCss>
 */
const fs = require('fs');

const [curPath, bakPath, outOldCss, outNewCss] = process.argv.slice(2).map(p => require('path').resolve(p));

const read = p => fs.readFileSync(p, 'utf8');
const cur = read(curPath), bak = read(bakPath);

const blocksOf = s => {
  const re = /<style scoped>([\s\S]*?)<\/style>/g;
  let m, n = 0, css = [];
  while ((m = re.exec(s))) { n++; css.push(m[1]); }
  return { n, css: css.join('\n') };
};
const headOf = s => s.slice(0, s.indexOf('<style scoped>'));

const cb = blocksOf(cur), bb = blocksOf(bak);

const lines = [
  `当前文件: ${curPath}`,
  `style 块数: ${bb.n} -> ${cb.n}`,
  `文件大小: ${bak.length} -> ${cur.length} 字节（省 ${bak.length - cur.length}）`,
  '',
  `template + script 部分逐字节一致: ${headOf(cur) === headOf(bak) ? 'YES ✓' : 'NO ！！'}`,
  `片段长度: ${headOf(bak).length} / ${headOf(cur).length}`,
  '',
  `旧 CSS ${bb.css.length} 字符 / 新 CSS ${cb.css.length} 字符`,
];

if (outOldCss) fs.writeFileSync(outOldCss, bb.css, 'utf8');
if (outNewCss) fs.writeFileSync(outNewCss, cb.css, 'utf8');

const out = lines.join('\n');
fs.writeFileSync(require('path').resolve(__dirname, '../logs/verify-flatten.txt'), out, 'utf8');
console.log(out);
