import test, { before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-m90-'))
process.env.EMOTION_POOL_DIR = 目录
process.env.EP_LEGACY_INJECT = '1' // 旧【此刻】格式的回归用例
const 模 = await import('../lib/index.js')

const 今天 = () => {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
}

function 跑(距分, 上次轮, 当前轮, 改 = {}) {
  const 配置 = { 注入启用: true, 注入日限: 24, 刻度: 1, ...改 }
  const 池 = { rev: 1, axes: { E: 0, S: 0, P: 0 }, prev_cell: 'E0S0P0', events: [], 上轮波动: { 有: false } }
  writeFileSync(join(目录, '情绪池-注入.json'), JSON.stringify({
    今天: 今天(), 判断: 0, 注入: 0, 保底: 0, 插队: 0, 次数: 0,
    上次轮, 上次时间: new Date(Date.now() - 距分 * 60000).toISOString(),
    上次轴: { E: 0, S: 0, P: 0 }, 上次格: 'E0S0P0', 上次rev: 1,
  }))
  writeFileSync(join(目录, '情绪池-轮号.json'), JSON.stringify({ 总: 当前轮, 按会话: {}, 末: {}, 更新: null }))
  writeFileSync(join(目录, '情绪池.json'), JSON.stringify(池))
  return 模.取注入(配置, 池)
}

const 表 = 模.设置清单()
const 取 = (k) => 表.find((x) => x.键 === k)

test('设置清单：保底间隔分钟默认 90、范围 20–240', () => {
  assert.equal(取('保底间隔分钟').默认, 90)
  assert.deepEqual(取('保底间隔分钟').范围, [20, 240])
})

test('设置清单：保底轮数默认 8、范围 3–20', () => {
  assert.equal(取('保底轮数').默认, 8)
  assert.deepEqual(取('保底轮数').范围, [3, 20])
})

test('设置清单：注入日限仍是 24', () => {
  assert.equal(取('注入日限').默认, 24)
})

test('缺键回退 90：距 89 分钟、轮未变 → 不保底', () => {
  assert.equal(跑(89, 1, 2), '')
})

test('缺键回退 90：距 91 分钟 → 保底注入', () => {
  const 文 = 跑(91, 1, 2)
  assert.ok(文.startsWith('【此刻】'), 文)
})

test('缺键回退 8 轮：7 轮 → 不保底', () => {
  assert.equal(跑(1, 1, 8), '')
})

test('缺键回退 8 轮：8 轮 → 保底注入', () => {
  const 文 = 跑(1, 1, 9)
  assert.ok(文.startsWith('【此刻】'), 文)
})

test('显式 保底间隔分钟 20：21 分钟就保底', () => {
  const 文 = 跑(21, 1, 2, { 保底间隔分钟: 20 })
  assert.ok(文.startsWith('【此刻】'), 文)
})

test('显式 保底轮数 3：3 轮就保底', () => {
  const 文 = 跑(1, 1, 4, { 保底轮数: 3 })
  assert.ok(文.startsWith('【此刻】'), 文)
})
