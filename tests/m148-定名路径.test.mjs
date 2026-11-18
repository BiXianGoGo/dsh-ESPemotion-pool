import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 源 = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')

// store.js 在首次 import 时绑定 HOME，所以全部用例共用一个临时家
const 家 = mkdtempSync(join(tmpdir(), 'dsh-naming-'))
writeFileSync(join(家, '情绪池配置.json'), JSON.stringify({ 存储模式: '分片', 组: [] }), 'utf8')
mkdirSync(join(家, '情绪池', '会话'), { recursive: true })
writeFileSync(
  join(家, '情绪池', '会话', 'aaaaaaaa.json'),
  JSON.stringify({
    事件: [{ t: '2026-11-18T08:00:00.000Z', sid: 'aaaaaaaa', turn: 900, note: '推轴（单轨）', delta_raw: { E: 0.1, S: 0, P: 0 } }],
  }),
  'utf8'
)
writeFileSync(
  join(家, '情绪池', '会话', 'bbbbbbbb.json'),
  JSON.stringify({
    事件: [{ t: '2026-11-18T08:01:00.000Z', sid: 'bbbbbbbb', turn: 901, note: '推轴（单轨）', 曲线: '名字A', delta_raw: { E: 0.1, S: 0, P: 0 } }],
  }),
  'utf8'
)
writeFileSync(
  join(家, '情绪池', '会话', 'cccccccc.json'),
  JSON.stringify({
    事件: [{ t: '2026-11-18T08:02:00.000Z', sid: 'cccccccc', turn: 902, note: '推轴（单轨）', 曲线: '陌生的名', delta_raw: { E: 0.1, S: 0, P: 0 } }],
  }),
  'utf8'
)
writeFileSync(
  join(家, '情绪模板.json'),
  JSON.stringify({ version: 1, 模板: [{ 名: '旧的尺', 次数: 3, 签名: { E: [0.1, 0.2], S: [0, 0], P: [0, 0] } }], 候选: [] }),
  'utf8'
)
writeFileSync(
  join(家, '情绪池-命名表.json'),
  JSON.stringify({ 格式: 'EPN-names', 版本: 1, 条目: [{ 名字: '名字A' }, { 名字: '名字B' }] }),
  'utf8'
)
process.env.EMOTION_POOL_DIR = 家
const m = await import('../lib/index.js')

const 点 = [
  { t: 't1', E: 0.1, S: 0, P: 0 },
  { t: 't2', E: 0.2, S: 0, P: 0 },
  { t: 't3', E: 0.3, S: 0, P: 0 },
]

test('0.2.7 定名 1：旧 0.8 尺不参与定名（有模板也不命中）', () => {
  const 定名 = m.定名波动('aaaaaaaa', 900, 点, [{ 起: 0, 止: 2 }], {})
  assert.equal(定名.名, null)
  assert.equal(定名.结论, '未命中')
  assert.notEqual(定名.来源, '自报')
  const o = JSON.parse(readFileSync(join(家, '情绪模板.json'), 'utf8'))
  assert.equal(o.模板.length, 1)
  assert.equal(o.模板[0].次数, 3)
})

test('0.2.7 定名 2：自报精确名优先于形状归属', () => {
  const 定名 = m.定名波动('bbbbbbbb', 901, 点, [{ 起: 0, 止: 2 }], {})
  assert.equal(定名.名, '名字A')
  assert.equal(定名.来源, '自报')
  assert.equal(定名.结论, '命中')
})

test('0.2.7 定名 4：自报未登记名 → 名 null，但进候选（不新建 情绪模板.json）', () => {
  const 定名 = m.定名波动('cccccccc', 902, 点, [{ 起: 0, 止: 2 }], {})
  assert.equal(定名.名, null)
  assert.equal(定名.来源, '自报未登记')
  const o = JSON.parse(readFileSync(join(家, '情绪池-命名表.json'), 'utf8'))
  assert.ok(Array.isArray(o.候选), '命名表应有 候选 数组')
  const 候 = o.候选.find((x) => x && x.名字 === '陌生的名')
  assert.ok(候, '候选里应出现「陌生的名」')
  assert.equal(候.来源, '自报')
  assert.equal(候.元.类, '当下')
  assert.ok(候.形状 && typeof 候.形状 === 'object')
  // 候选走命名表，旧模板文件不受影响（仍是那 1 条、次数仍 3）
  const 模 = JSON.parse(readFileSync(join(家, '情绪模板.json'), 'utf8'))
  assert.equal(模.模板.length, 1)
  assert.equal(模.模板[0].次数, 3)
})

test('0.2.7 定名 3：归属 <0.55 不兜底（源码守卫）', () => {
  assert.ok(源.includes("名: 判.层 === '待命名' ? null : 最像.名"))
  assert.ok(!源.includes('模板判定(签'))
  assert.ok(!源.includes('模板更新(t.签名'))
  assert.ok(!源.includes('判模板 as 模板判定'))
  assert.ok(源.includes("来源: '自报'"))
  assert.ok(源.includes("来源: '形状'"))
})

