// 生成给更新程序看的目录和说明：node tools/make-catalog.mjs
//   data/catalog.json          —— 所有模型、位置点（机器读）
//   data/README-更新说明.md    —— 中文说明（给 deepseek 看，不用看代码）
// 目录的来源是 src/items/catalog.js 和 src/items/slots.js，改了那两个文件就重新跑一遍
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { MODELS, KINDS, kindsOf } from '../src/items/catalog.js';
import { SLOTS } from '../src/items/slots.js';
import { checkItems } from './check-items.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const items = JSON.parse(readFileSync(resolve(root, 'data/items.json'), 'utf8'));
const { errors } = checkItems(items);
if (errors.length) { console.error('data/items.json 自己就有错，先改好：\n' + errors.join('\n')); process.exit(1); }

const FIXED = (m) => ['固定', '被褥'].includes(kindsOf(m)[0]);

// ———— catalog.json ————
const catalog = {
  说明: '宿舍物件清单的目录。models = 能用的模型；slots = 能放东西的位置点。详细规则见 README-更新说明.md',
  kinds: KINDS,
  models: MODELS.map((m) => ({
    id: m.id, name: m.name, kind: kindsOf(m), states: m.states, default: m.states[0],
    ...(m.auto ? { auto: m.auto } : {}), ...(m.text ? { text: m.text } : {}),
    fixed: FIXED(m), desc: m.desc,
    ...(FIXED(m) ? { slots: SLOTS.filter((s) => s.only?.includes(m.id)).map((s) => s.name) } : {}),
  })),
  slots: SLOTS.map((s) => ({ name: s.name, area: s.area, where: s.where, cap: s.cap, accepts: s.accepts, ...(s.only ? { only: s.only } : {}) })),
};
writeFileSync(resolve(root, 'data/catalog.json'), JSON.stringify(catalog, null, 2) + '\n');

// ———— README ————
const esc = (t) => String(t ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const normal = MODELS.filter((m) => !FIXED(m));
const fixed = MODELS.filter(FIXED);
const groups = [...new Set(SLOTS.map((s) => s.area))];
const normalSlots = (a) => SLOTS.filter((s) => s.area === a && !(s.only && s.accepts.some((k) => k === '固定' || k === '被褥')));

const modelTable = (list) => [
  '| 模型编号 model | 中文名 | 分类 | 能用的状态 state（第一个是默认） | 能写字（text） | 外观 |',
  '|---|---|---|---|---|---|',
  ...list.map((m) => `| \`${m.id}\` | ${esc(m.name)} | ${kindsOf(m).join(' / ')} | ${m.states.map((x) => '「' + x + '」').join(' ')}${m.auto ? `<br>自动：${esc(m.auto)}` : ''} | ${m.text ? esc(m.text) : '—'} | ${esc(m.desc) || '—'} |`),
].join('\n');

const fixedTable = [
  '| 位置点 slot | 模型 model | 能用的状态 state | 说明 |',
  '|---|---|---|---|',
  ...fixed.flatMap((m) => SLOTS.filter((s) => s.only?.includes(m.id)).map((s) => `| \`${s.name}\` | \`${m.id}\` | ${m.states.map((x) => '「' + x + '」').join(' ')} | ${esc(s.where)}。${esc(m.desc)}${m.auto ? `（自动：${esc(m.auto)}）` : ''} |`)),
].join('\n');

const slotTables = groups.map((a) => {
  const rows = normalSlots(a);
  if (!rows.length) return '';
  return [`#### ${a}`, '', '| 位置点名字 slot | 在哪 | 最多几件 | 收什么 |', '|---|---|---|---|',
    ...rows.map((s) => `| \`${s.name}\` | ${esc(s.where)} | ${s.cap} | ${s.only ? '只收 ' + s.only.map((x) => '`' + x + '`').join('、') : s.accepts.join('、')} |`), ''].join('\n');
}).filter(Boolean).join('\n');

const readme = `# 宿舍物件清单 · 更新说明

这份说明写给每天 0 点更新宿舍的程序。**你只需要改一个文件：\`data/items.json\`**。不用看代码，也不能写坐标。

## 一、宿舍是怎么搭起来的

宿舍场景分两层：

- **不常变的**：房子、院子、家具、灯、时间段（清晨 / 午后 / 黄昏 / 夜）。这些写在代码里，你不用管。
- **每天会变的**：屋里摆了什么、东西是什么状态（多了一瓶花、障子糊好了、被褥收进壁橱……）。这些全部写在 \`data/items.json\` 里。

页面打开时读 \`data/items.json\`，按里面的每一条把东西摆进房子。换了文件，刷新页面就生效。

房子里预先定义好了一批有名字的**位置点**（比如「我房间·书桌靠窗那格」「饭厅·饭桌」）。你只写「放在哪个位置点」，东西在位置点里怎么排开，由场景自己处理。

## 二、items.json 的格式

\`\`\`json
{
  "date": "2026-10-07",
  "items": [
    {
      "id": "vase-kiku",
      "model": "vase",
      "slot": "饭厅·饭桌",
      "state": "黄色野菊",
      "label": "一小瓶黄色野菊",
      "note": "一只小白瓷瓶，插着几枝黄色野菊。"
    }
  ]
}
\`\`\`

| 字段 | 必须有 | 说明 |
|---|---|---|
| \`date\` | 否 | 这份清单是哪一天的（只是记录，场景不用它） |
| \`items\` | 是 | 数组，一件东西一条 |
| \`id\` | 是 | 这件东西的编号，整份清单里不能重复。用英文小写、数字和连字符，例如 \`vase-kiku\`、\`bowls-murasame\`。**同一件东西每天保持同一个 id**；新出现的东西起一个新 id |
| \`model\` | 是 | 用哪个模型，只能从下面「模型目录」里挑编号 |
| \`slot\` | 是 | 放在哪个位置点，只能从下面「位置点目录」里挑，**名字要一字不差**（中间的点是全角「·」） |
| \`state\` | 是 | 状态，只能是这个模型列出来的状态之一（不写就用第一个） |
| \`label\` | 是 | 场景清单里显示的名字（中文，短一点） |
| \`note\` | 是 | 点开这件东西时显示的说明文字（中文，一两句到一小段） |
| \`text\` | 否 | 只有「能写字」的模型才用：写在物件上显示出来的字（纸条、标签、日志）。多行用 \`\\n\` 分开 |

JSON 的规矩：只能用英文双引号，最后一项后面不要逗号，不能写注释。

## 三、规则

1. **类别要对得上。** 每个模型有一个类别，每个位置点只收某几类：
${Object.entries(KINDS).map(([k, v]) => `   - **${k}**：${v}`).join('\n')}
2. **每个位置点有容量上限**（「最多几件」）。超过的按清单顺序，后面的会被跳过。东西太大放不下也会被跳过（比如把「摊开晾的旧被」放到书桌上）。
3. **同一个位置点里的东西按清单里的先后顺序从左往右、从后往前排开**，不会叠在一起。
4. **固定设施和被褥**（东侧的四扇障子、在室牌、温泉池、地炉、灯笼、两套被褥）：每个只有一条，位置点是固定的。**只能改 \`state\`、\`label\`、\`note\`**，不能新增第二条，也不能换位置点。这条删掉的话就恢复默认状态。
5. **「自动」状态**：跟着时间段自己变（比如被褥晚上铺开、白天收进壁橱）。写成别的状态，就一直保持那个状态，不再跟着时间变。
6. **东西没了**（吃完了扔了、带出门了）：删掉那一条，或者换成对应的状态（比如羊羹「吃完了」）。**东西挪地方了**：只改 \`slot\`。**状态变了**：只改 \`state\`，顺便更新 \`note\`。
7. **抽屉里的东西**（\`我房间·书桌抽屉\`、\`丛雨的房间·小抽屉\`）要拉开抽屉才看得到，适合放藏起来的东西。
8. **写错了不会让场景崩**：不认识的模型、位置点、状态，或者放不下、超了容量，那一条会被跳过，场景里按 M 打开清单，最底下「没摆上的东西」会列出是哪一条、为什么。
9. 能运行命令的话，改完可以跑 \`node tools/check-items.mjs\` 先检查一遍（不用开浏览器）。

## 四、常见改法

- 障子又破了一扇：把 \`shoji-east-2\` 的 \`state\` 改成 \`"破洞"\`，\`note\` 写上怎么破的。
- 白天被褥也铺着（有人睡午觉）：把 \`futon-atri\` 的 \`state\` 从 \`"自动"\` 改成 \`"铺开"\`；第二天再改回 \`"自动"\`。
- 亚托莉出门买东西：把 \`nametag-atri\` 的 \`state\` 改成 \`"外出"\`，再把 \`shoes-atri\` 那条删掉（鞋穿走了）。
- 温泉池放了水 / 放空了：\`bath-pool\` 的 \`state\` 改 \`"放满了水"\` 或 \`"没放水"\`。
- 地炉晚上熄了：\`irori\` 的 \`state\` 改 \`"熄了"\`。
- 多了一瓶花：在 \`items\` 里加一条，\`model\` 用 \`vase\`，挑一个收「小件」而且还没满的位置点。
- 写了一张留言条贴在橱柜上：加一条 \`model\` 为 \`note\`、\`slot\` 为 \`厨房·橱柜侧面\`、\`text\` 写纸条上的字（每行十个字以内）。
- 日志写了新的一页：改 \`journal-new\` 的 \`text\`，第一行写日期，最多四行。
- 半成的木框做好了：\`half-frame\` 的 \`state\` 改 \`"做好了"\`；拿出来摆好了，就把 \`slot\` 改到要摆的地方。

## 五、固定设施和被褥（只改状态）

${fixedTable}

## 六、模型目录（能自由摆放的）

${modelTable(normal)}

## 七、位置点目录（能自由摆放的）

${slotTables}

## 八、初始清单（完整示例）

下面就是现在 \`data/items.json\` 的全部内容（${items.items.length} 条），可以照着它的写法改。

\`\`\`json
${JSON.stringify(items, null, 2)}
\`\`\`
`;
writeFileSync(resolve(root, 'data/README-更新说明.md'), readme);
console.log(`catalog.json：${MODELS.length} 个模型、${SLOTS.length} 个位置点；README 已更新。`);
