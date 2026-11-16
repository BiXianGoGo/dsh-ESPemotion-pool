// T-20261109-1908 验收：命名表「类/互斥」+ 双轨日志
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-m34-'))
process.env.EMOTION_POOL_DIR = 目录
const 模块 = await import('../lib/index.js')

const 配置 = {
  启用: true, 校验启用: false, 校验每天上限: 50, 校验只跑有自报的轮: true,
  提醒启用: false, 每日衰减系数: 0.9, 守恒上限: 1.0, 写入者: ['aaaaaaaa'],
  注入启用: false, 刻度: 1, 双轨校验: true, 一致阈值: 0.1, 报警阈值: 0.4,
  报警冷却小时: 24, 日志: ['情绪池-日志.md', '情绪池-日志.jsonl'],
}

function 写命名(名字) {
  writeFileSync(join(目录, '情绪池-命名.json'), JSON.stringify({ version: 1, 说明: '', 名字 }, null, 2))
}

function 条(名, lo, hi, 建, 类 = '当下', 互斥 = []) {
  return { 名, E: [lo, hi], S: [lo, hi], P: [lo, hi], 建, 类, 互斥 }
}

test('类分表：当下命中自己，回忆类不抢', () => {
  写命名([
    条('小盒', 0, 0.2, '2026-11-09T10:00'),
    条('大盒', -0.5, 0.5, '2026-11-09T09:00'),
    条('回忆词', -0.5, 0.5, '2026-11-09T11:00', '时间'),
  ])
  const 轴 = { E: 0.05, S: 0.05, P: 0.05 }
  assert.equal(模块.命中命名(轴).名, '小盒')
  assert.equal(模块.命中命名(轴).名, '小盒') // 稳定
  assert.equal(模块.命中命名(轴, { 类: '时间' }).名, '回忆词')
})

test('同宽时按登记时间、再按名字稳定取', () => {
  写命名([
    条('乙', 0, 0.3, '2026-11-09T12:00'),
    条('甲', 0, 0.3, '2026-11-09T12:00'),
  ])
  const 轴 = { E: 0.1, S: 0.1, P: 0.1 }
  const 一次 = 模块.命中命名(轴).名
  assert.equal(一次, 模块.命中命名(轴).名)
  assert.equal(一次, '甲')
})

test('互斥：丢掉后登记的那个，并写日志', () => {
  写命名([
    条('先的', -0.4, 0.4, '2026-11-09T08:00', '当下', ['后的']),
    条('后的', -0.4, 0.4, '2026-11-09T09:00', '当下', ['先的']),
  ])
  const 轴 = { E: 0.1, S: 0.1, P: 0.1 }
  const 命中 = 模块.命中命名(轴, { 配置 })
  assert.equal(命中.名, '先的')
  const 日志 = readFileSync(join(目录, '情绪池-日志.md'), 'utf8')
  assert.match(日志, /互斥丢弃 后的/)
})

test('轴级名不受类过滤影响（满）', () => {
  写命名([
    条('满', 0.9, 1, '2026-11-09T01:00'),
    { ...条('满', 0.9, 1, '2026-11-09T01:00'), 类型: '轴级' },
  ].slice(1))
  const 命中 = 模块.命中命名({ E: 0, S: 0.95, P: 0 })
  assert.equal(命中.名, '满')
  assert.equal(命中.命中轴, 'S')
})

test('双轨分歧：记一行、计数 +1，日志带耗时', async () => {
  writeFileSync(join(目录, '情绪池.json'), JSON.stringify({ rev: 0, axes: { E: 0, S: 0, P: 0 }, spine: { S: 0 }, prev_cell: 'E0S0P0', events: [], stats: { selfreport_total: 0, missed_total: 0 } }, null, 2))
  writeFileSync(join(目录, '情绪池配置.json'), JSON.stringify(配置, null, 2))
  const ctx = {
    llm: {
      async *stream() {
        const t = JSON.stringify({ E: -0.2, S: 0, P: 0, 依据: '他看起来没在高兴' })
        for (const ch of t) yield { type: 'text-delta', text: ch }
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    },
    agents: { list: () => [{ options: { provider: 'fake', model: 'fake-1' } }] },
  }
  const 会话 = { id: 'session-aaaaaaaa-f40c-4fc3-ad69-f8338376753b' }
  const r = await 模块.跑双轨(ctx, 会话, 1, '我挺开心的'.repeat(60), { E: 0.15, S: 0, P: 0 }, '[他说累] 陪他', '今天有点累')
  assert.equal(r.分歧, true)
  assert.equal(模块.双轨统计().样本, 1)
  assert.equal(模块.双轨统计().分歧, 1)
  const 分歧 = readFileSync(join(目录, '情绪池-分歧.jsonl'), 'utf8').trim().split('\n')
  assert.equal(分歧.length, 1)
  const 日志 = readFileSync(join(目录, '情绪池-日志.md'), 'utf8')
  assert.match(日志, /双轨 OK ｜ 耗时 \d+ms/)
})
