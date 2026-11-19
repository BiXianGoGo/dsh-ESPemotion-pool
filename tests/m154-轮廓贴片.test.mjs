import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// P0-2（2026-11-19）：轮廓贴 必须把 片/枝 写进轮画像，否则 /state.片分布 永远「无片」。
// HOME 在模块 import 时绑定，所以先设 env，再动态 import。
const 家 = join(tmpdir(), 'ep-m154-' + process.pid + '-' + Date.now())
if (existsSync(家)) rmSync(家, { recursive: true, force: true })
mkdirSync(家, { recursive: true })
process.env.EMOTION_POOL_DIR = 家
const 模 = await import('../lib/index.js')

const 配 = {
  组: [{ 名: '测试组', 会话: ['8f689553'] }],
  装载会话: ['8f689553'],
  存储模式: '分片',
  刻度: 100,
}

function 点们(轴们) {
  const n = 轴们.E.length
  const 出 = []
  for (let i = 0; i < n; i++) 出.push({ E: 轴们.E[i], S: 轴们.S[i], P: 轴们.P[i] })
  return 出
}

function 读画像() {
  const p = join(家, '情绪池-轮画像', '测试组.json')
  assert.ok(existsSync(p), '轮画像文件应生成')
  return JSON.parse(readFileSync(p, 'utf8')).记录
}

test('趋势轮：轮画像的 片 非空、枝 非空', () => {
  const 轴 = { E: [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35], S: [0, 0, 0, 0, 0, 0, 0, 0], P: [0, 0, 0, 0, 0, 0, 0, 0] }
  模.推轴('8f689553', { E: 0.35, S: 0, P: 0 }, 't1', 配, { 曲线: 点们(轴), 段数: 1 })
  const 记 = 读画像()
  assert.equal(记.length, 1)
  assert.equal(记[0].状态, '趋势')
  assert.ok(记[0].片 >= 1 && 记[0].片 <= 8, '趋势轮应有 1..8 片，实际 ' + 记[0].片)
  assert.ok(记[0].枝 != null, '趋势轮应有枝')
})

test('非趋势轮：轮画像的 片 为 null', () => {
  const 轴 = { E: [0, 0, 0, 0, 0, 0, 0, 0], S: [0, 0, 0, 0, 0, 0, 0, 0], P: [0, 0, 0, 0, 0, 0, 0, 0] }
  模.推轴('8f689553', { E: 0, S: 0, P: 0 }, 't2', 配, { 曲线: 点们(轴), 段数: 1 })
  const 记 = 读画像()
  const 末 = 记[记.length - 1]
  assert.notEqual(末.状态, '趋势')
  assert.equal(末.片, null)
  assert.equal(末.枝, null)
})
