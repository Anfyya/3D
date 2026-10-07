// 不开浏览器检查物件清单：node tools/check-items.mjs [data/items.json]
// 查的和场景加载时一样：模型、位置点、状态、类别、容量、id 重复。
// 「放不放得下」要搭出模型才知道，只有场景里查得到（M 键清单底部）。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { MODEL, kindsOf } from '../src/items/catalog.js';
import { SLOT } from '../src/items/slots.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const file = resolve(root, process.argv[2] || 'data/items.json');

export function checkItems(data) {
  const errors = [], warnings = [];
  const list = Array.isArray(data) ? data : data?.items;
  if (!Array.isArray(list)) return { errors: ['顶层要是 { "items": [ ... ] }'], warnings, count: 0 };
  const seen = new Set(), count = new Map(), fixtureTaken = new Set();
  list.forEach((rec, i) => {
    const where = `第 ${i + 1} 条${rec?.id ? `（${rec.id}）` : ''}`;
    const bad = (msg) => errors.push(`${where}：${msg}`);
    if (!rec || typeof rec !== 'object') return bad('不是一个对象');
    if (typeof rec.id !== 'string' || !rec.id.trim()) return bad('缺少 id');
    if (seen.has(rec.id)) return bad('id 和前面的重复了');
    seen.add(rec.id);
    const m = MODEL[rec.model];
    if (!m) return bad(`不认识的模型「${rec.model}」`);
    const s = SLOT[rec.slot];
    if (!s) return bad(`不认识的位置点「${rec.slot}」`);
    if (s.only && !s.only.includes(rec.model)) return bad(`「${rec.slot}」只能放 ${s.only.join('、')}`);
    if (!s.only && !kindsOf(m).some((k) => s.accepts.includes(k))) return bad(`${rec.model}（${kindsOf(m).join('/')}）不能放在「${rec.slot}」，这里只收${s.accepts.join('、')}`);
    if (rec.state === undefined) warnings.push(`${where}：没写 state，会用默认的「${m.states[0]}」`);
    else if (!m.states.includes(rec.state)) return bad(`${rec.model} 没有「${rec.state}」这个状态（可以用：${m.states.join('、')}）`);
    if (s.only && ['固定', '被褥'].includes(kindsOf(m)[0])) {
      if (fixtureTaken.has(rec.slot)) return bad(`「${rec.slot}」已经有一条了`);
      fixtureTaken.add(rec.slot);
      return;
    }
    const n = (count.get(rec.slot) || 0) + 1;
    count.set(rec.slot, n);
    if (n > s.cap) return bad(`「${rec.slot}」最多放 ${s.cap} 件，这是第 ${n} 件`);
    if (!rec.label) warnings.push(`${where}：没写 label，场景里会显示模型名「${m.name}」`);
    if (rec.note === undefined) warnings.push(`${where}：没写 note，会显示模型的外观说明`);
    if (rec.text !== undefined && !m.text) warnings.push(`${where}：${rec.model} 不能写字，text 会被忽略`);
  });
  return { errors, warnings, count: list.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let data;
  try { data = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { console.error('读不了或者不是合法的 JSON：' + e.message); process.exit(1); }
  const { errors, warnings, count } = checkItems(data);
  for (const w of warnings) console.log('提示  ' + w);
  for (const e of errors) console.log('错误  ' + e);
  console.log(errors.length ? `\n${count} 条里有 ${errors.length} 条会被跳过。` : `\n${count} 条都没问题。`);
  process.exit(errors.length ? 1 : 0);
}
