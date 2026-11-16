import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// 2026-11-16 18:3x（策划间五条）：
//  1) 光标停在折点像素上必须命中该点（横竖 ±1px），偏 8px 仍是同一点；
//  2) 平移后命中跟着对（同一份几何，偏移读同一个值）；
//  3) 滚轮一次 3 个点、只认 deltaY 符号、两端都能到；
//  4) 三轴绿条从「基点」画到「当前值」；
//  5) 新建池不许动别的池的 轴/事件数/会话。
const 根 = join(dirname(fileURLToPath(import.meta.url)), '..');
const W = readFileSync(join(根, 'assets', 'widget.js'), 'utf8');
const L = readFileSync(join(根, 'lib', 'index.js'), 'utf8');

function 取函数(名) {
  const 起 = W.indexOf('function ' + 名 + '(');
  assert.ok(起 >= 0, '找不到 ' + 名);
  let i = W.indexOf('{', 起), 深 = 0;
  for (; i < W.length; i++) {
    if (W[i] === '{') 深++;
    else if (W[i] === '}') { 深--; if (深 === 0) return W.slice(起, i + 1); }
  }
  throw new Error('括号没配平：' + 名);
}
const 造 = (源码, 名) => {
  const f = new Function('window', 源码 + '\nreturn ' + 名);
  return f({ __EPTEST: 1 });
};

const 点s = [
  { E: 0.2, S: -0.4, P: 0.1, note: '一' },
  { E: 0.5, S: 0.3, P: -0.2, note: '二' },
  { E: -0.1, S: 0.8, P: 0.6, note: '三' },
  { E: 0.3, S: 0.1, P: -0.5, note: '四' },
];

function 几何(偏) {
  const 算几何 = 造(取函数('算几何'), '算几何');
  return 算几何(点s, 偏, 10, 34, 130, -1, 1, ['E', 'S', 'P']);
}
function 最近(geo) {
  const 最近点 = 造(取函数('最近点'), '最近点');
  return (vx, vy) => 最近点(geo, vx, vy, 2, 1, 10, null);
}

test('悬停：光标精准停在折点像素上 → 命中该点（±1px 内三个点都验）', () => {
  const g = 几何(0), 找 = 最近(g);
  for (const [i, k] of [[0, 'E'], [2, 'S'], [3, 'P']]) {
    const q = g.点列.find((x) => x.i === i && x.k === k);
    for (const 抖 of [-1, 0, 1]) {
      const 命 = 找(q.x + 抖 / 2, q.y);
      assert.ok(命, `i=${i} ${k} 抖=${抖} 应命中`);
      assert.equal(命.i, i);
      assert.equal(命.k, k);
      assert.ok(命.d <= 1.0001, '距离应 ≤1px');
    }
  }
});

test('悬停：光标往左/往右各偏 8px 仍是同一个点', () => {
  const g = 几何(0), 找 = 最近(g);
  const q = g.点列.find((x) => x.i === 2 && x.k === 'S');
  // 比W = 2，屏幕 8px = 视图 4 单位
  for (const dx of [-4, 4]) {
    const 命 = 找(q.x + dx, q.y);
    assert.ok(命, '偏 8px 不该丢');
    assert.equal(命.i, 2);
    assert.equal(命.k, 'S');
  }
});

test('悬停：平移后命中跟着对（偏移只读同一个值）', () => {
  const g = 几何(50), 找 = 最近(g);
  const q = g.点列.find((x) => x.i, 1);
  const 目 = g.点列.find((x) => x.i === 1 && x.k === 'E');
  // 画面上的位置是 x−偏；用这个去命中
  const 命 = 找(目.x - 50, 目.y);
  assert.ok(命, '平移后应命中');
  assert.equal(命.i, 1);
  assert.equal(命.k, 'E');
  // 再改一次偏移，不重建点列也必须跟着变
  g.偏移 = 120;
  const 命2 = 找(目.x - 120, 目.y);
  assert.ok(命2, '换偏移后应命中');
  assert.equal(命2.i, 1);
  assert.equal(命2.k, 'E');
});

test('滚轮：一次 3 个点、只认符号、只改 transform 不重建', () => {
  assert.ok(/e\.deltaY > 0 \? 3 : -3/.test(W), '一次固定 3 个点');
  assert.ok(/translate\(' \+ \(-偏\) \+ ',0\)/.test(W), '平移用 translate(-偏,0)');
  assert.ok(!/translate3d\(-/.test(W), 'SVG 不许再用 translate3d');
  assert.ok(/Math\.max\(0, Math\.min\(最大,/.test(W), '两端夹住');
});

test('三轴：黄点标基点，绿条从基点画到当前值（量程不缩）', () => {
  const 画 = 取函数('画组');
  assert.ok(/data-base="' \+ 基x/.test(画), '行上记基点');
  assert.ok(/class="ep-gzero" style="left:' \+ \(50 \+ 基x \* 50\)/.test(画), '黄点在 位(基点)');
  assert.ok(/Math\.min\(x, 基x\)/.test(画), '条左端取基/值较小者');
  assert.ok(/Math\.abs\(x - 基x\) \* 50/.test(画), '条宽 = |值−基|（按 ±1 量程 50%/单位）');
  const 置绿 = 取函数('置绿');
  assert.ok(/data-base/.test(置绿), '动画也读同一个基点');
});

test('打开说明书：失败要把真实错误说出来', () => {
  // 2026-11-16 19:2x：`.md` 没有系统关联，`cmd start` 只会开一个空 cmd 窗口。
  // 改成直接用记事本打开，路径走参数数组（不经 shell，不做引号拼接）。
  assert.ok(/spawn\('notepad\.exe',\s*\[p\]/.test(L), '必须用记事本按参数数组打开，不许再拼 cmd 引号');
  assert.ok(!/windowsVerbatimArguments: true/.test(L), '不再需要 verbatim 参数拼引号');
  assert.ok(/使用说明文件不存在/.test(L), '使用说明缺失要明确报错，不许拿模型说明书冒充');
  assert.ok(/打开失败：/.test(L), 'spawn 失败要回 ok:false');
  assert.ok(/'data-openmanual'/.test(W) || /data-openmanual/.test(W), '前端有按钮');
});

test('新建池：别的池的 轴/事件数/会话 三项逐一不变', async () => {
  const 根2 = join(process.env.TEMP || 'C:/temp', 'ep-m144-' + process.pid);
  mkdirSync(join(根2, '情绪池', '池'), { recursive: true });
  process.env.EMOTION_POOL_DIR = 根2;
  const 配 = {
    组: [
      { 名: '甲', 会话: ['aaaaaaaa'] },
      { 名: '乙', 会话: ['bbbbbbbb'] },
    ],
    存储模式: '分片',
    刻度: 100,
  };
  writeFileSync(join(根2, '情绪池配置.json'), JSON.stringify(配, null, 2), 'utf8');
  const 事 = (sid, d) => ({ t: '2026-11-16T10:00:00.000Z', sid, turn: 1, note: '推轴（单轨）', delta_raw: d, 类型: '推轴' });
  writeFileSync(join(根2, '情绪池', '池', '甲.json'), JSON.stringify({ 会话: ['aaaaaaaa'], axes: { E: 0.3, S: 0.1, P: -0.2 }, events: [事('aaaaaaaa', { E: 0.1, S: 0.1, P: 0.1 })] }, null, 2), 'utf8');
  writeFileSync(join(根2, '情绪池', '池', '乙.json'), JSON.stringify({ 会话: ['bbbbbbbb'], axes: { E: -0.4, S: 0.2, P: 0.3 }, events: [事('bbbbbbbb', { E: -0.1, S: 0.1, P: 0.1 }), 事('bbbbbbbb', { E: 0.1, S: 0, P: 0 }) ] }, null, 2), 'utf8');
  const 模 = await import(pathToFileURL(join(根, 'lib', 'index.js')).href);
  const 拍 = () => {
    const c = 模.读配置();
    const o = {};
    for (const n of ['甲', '乙']) {
      const v = 模.池视图(c, n);
      o[n] = { axes: JSON.stringify(v.axes || null), 事件数: (v.events || []).length, 会话: JSON.stringify(v.会话 || []) };
    }
    return o;
  };
  const 前 = 拍();
  const r = 模.池操作('新建', null, '丙');
  assert.equal(r.ok, true, JSON.stringify(r));
  const 后 = 拍();
  assert.deepEqual(后, 前, '新建池后别的池三项不许变');
});
