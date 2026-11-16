import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const 根 = join(dirname(fileURLToPath(import.meta.url)), '..');
const W = readFileSync(join(根, 'assets', 'widget.js'), 'utf8');
const L = readFileSync(join(根, 'lib', 'index.js'), 'utf8');

function 取函数(名) {
  const 起 = W.indexOf('function ' + 名 + '(');
  assert.ok(起 >= 0, '找不到 ' + 名);
  // 从函数头起，按花括号配平截取
  let i = W.indexOf('{', 起), 深 = 0, 末 = i;
  for (; i < W.length; i++) {
    if (W[i] === '{') 深++;
    else if (W[i] === '}') { 深--; if (深 === 0) { 末 = i + 1; break } }
  }
  return W.slice(起, 末);
}

const 造 = (源码, 名) => {
  const vm = { 轴们: ['E', 'S', 'P'] };
  const f = new Function('window', 源码 + '\nreturn ' + 名);
  return f({ __EPTEST: 1 });
};

test('算几何：点列与 path 同源（第 0/中/末 三点坐标一致 ±0.01）', () => {
  const 算几何 = 造(取函数('算几何'), '算几何');
  const 点s = [
    { E: 0.2, S: -0.4, P: 0.1 },
    { E: 0.5, S: 0.3, P: -0.2 },
    { E: -0.1, S: 0.8, P: 0.6 },
  ];
  const g = 算几何(点s, 0, 10, 34, 130, -1, 1, ['E', 'S', 'P']);
  assert.equal(g.点列.length, 9);
  const 位 = (v) => (1 - v) / 2 * 122 + 4;
  for (const i of [0, 1, 2]) {
    const q = g.点列.find((x) => x.i === i && x.k === 'E');
    // path 用 几何.x(i) 与 几何.y(值) 拼；点列必须是同一对数
    assert.ok(Math.abs(q.x - g.x(i)) <= 0.01, 'x 与 path 同源 i=' + i);
    assert.ok(Math.abs(q.y - 位(点s[i].E)) <= 0.01, 'y 与 path 同源 i=' + i);
    assert.ok(Math.abs(q.屏x - (g.x(i) - 0)) <= 0.01, '屏x = x - 偏');
  }
  // 带平移时 屏x 才变，x（组内坐标）不变
  const g2 = 算几何(点s, 12, 10, 34, 130, -1, 1, ['E', 'S', 'P']);
  const q2 = g2.点列.find((x) => x.i === 1 && x.k === 'S');
  assert.ok(Math.abs(q2.x - 44) <= 0.01);
  assert.ok(Math.abs(q2.屏x - 32) <= 0.01);
});

test('最近点：横竖各用各的比例，10px 阈值（正反各一条）', () => {
  const 算几何 = 造(取函数('算几何'), '算几何');
  const 最近点 = 造(取函数('最近点'), '最近点');
  const 点s = [{ E: 0, S: 0, P: 0 }, { E: 0.5, S: 0.5, P: 0.5 }];
  const g = 算几何(点s, 0, 10, 34, 130, -1, 1, ['E', 'S', 'P']);
  const q = g.点列.find((x) => x.i === 1 && x.k === 'E');
  // 命中：鼠标在点旁 4px（宽比 0.5 → 8 屏幕 px）
  const 中 = 最近点(g, q.屏x + 8, q.y + 0, 0.5, 0.5, 10, null);
  assert.ok(中 && 中.i === 1 && 中.k === 'E', '10px 内应命中');
  // 不命中：纵向偏 40 几何 px（屏幕 20px）
  const 外 = 最近点(g, q.屏x, q.y + 40, 0.5, 0.5, 10, null);
  assert.notEqual(外 && 外.i === 1 && 外.k === 'E', true, '超过 10px 不该命中这一点');
});

test('画面与命中不再各推公式（源码守卫）', () => {
  // 只允许一处 34 的赋值；path 用 几何.x / 几何.y；命中只调 最近点
  const 画组 = 取函数('画组');
  const m = 画组.match(/\b34\b/g) || [];
  assert.equal(m.length, 1, '画组 里 34 只许出现一次（就是 左 的定义），实际 ' + m.length);
  assert.ok(!/=\s*34\b/.test(取函数('算几何')), '算几何 不许自己定 34，要由调用方传进来');
  assert.ok(/几何\.x\(pi\)/.test(画组), 'path 的 x 必须走 几何.x');
  assert.ok(/几何\.y\(点s\[pi\]\[kk\]\)/.test(画组), 'path 的 y 必须走 几何.y');
  assert.ok(!/34 \+ pi \* 步宽/.test(画组), 'path 不许再自己算 x');
  const 悬 = 取函数('挂悬停');
  assert.ok(/最近点\(geo, vx, vy, 比W, 比H, 10/.test(悬), '命中必须调 最近点');
  assert.ok(!/\(hi - v\) \/ \(hi - lo\)/.test(悬), '命中不许再有一条 y 公式');
});

test('文案：事件/波动有情绪名与为什么（后端带注/依据）', () => {
  assert.ok(/事\.注 = String\(选项\.注\)/.test(L), '推轴事件写 注');
  assert.ok(/事\.依据 = String\(选项\.依据\)/.test(L), '推轴事件写 依据');
  assert.ok(/名: \(e\.定名 && e\.定名\.名\) \|\| 补\.名 \|\| null/.test(L), '波动带 名（缺则回查轨迹）');
  assert.ok(/注: e\.注 \|\| 补\.注 \|\| null/.test(L), '波动带 注（缺则回查轨迹）');
  assert.ok(/function 轨迹补\(e\)/.test(L), '老事件回查轨迹补 注/依据/名');
  const 画事件 = 取函数('画事件');
  assert.ok(/未命名/.test(画事件), '无名为「未命名」');
  assert.ok(/因为/.test(画事件), '为什么句式');
  assert.ok(/带号/.test(画事件), '变化两位带符号');
});

test('页签：每次按 池列表 重建，空池也有签', () => {
  const 画组 = 取函数('画组');
  assert.ok(/最新\.池列表\.map/.test(画组), '签从 池列表 取');
  assert.ok(/签组/.test(画组), '签组 每次重建');
  assert.ok(/（无会话）/.test(画组), '空池签带（无会话）');
});
