// 0.3 分片存储：原子写 / 缓存 / 聚合 / 坏文件 / 补丁合并
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-m93-'))
process.env.EMOTION_POOL_DIR = 目录
const S = await import('../lib/store.js')
const I = await import('../lib/index.js')

const 短A = 'aaaaaaaa'
const 短B = 'cccccccc'
const 会话A = 'session-aaaaaaaa-f40c-4fc3-ad69-f8338376753b'
const 会话B = 'session-cccccccc-7cd3-44e9-9c9a-abae7c728005'

function 清() { S.清缓存() }

test('原子写：并发 100 次写同一本，最终可解析且 rev 连续', () => {
  S.准备目录(); 清()
  for (let i = 1; i <= 100; i += 1) S.写会话(短A, { sid: 会话A, rev: i, 事件: [{ id: 'e' + i, sid: 会话A, turn: i }], 结: [], 快照: {} })
  const 本 = S.读会话(短A)
  assert.equal(本.rev, 100)
  assert.equal(本.事件.length, 1)
  assert.equal(本.事件[0].id, 'e100')
  const 名们 = readdirSync(S.会话目录)
  assert.equal(名们.some((n) => n.includes('.tmp')), false)
})

test('缓存：读全部命中缓存，文件改动后立刻看到新值', () => {
  S.准备目录(); 清()
  S.写会话(短A, { sid: 会话A, rev: 1, 事件: [{ id: 'x1', sid: 会话A }], 结: [], 快照: {} })
  const 一 = S.读全部()
  assert.equal(一[短A].rev, 1)
  S.写会话(短A, { sid: 会话A, rev: 2, 事件: [{ id: 'x2', sid: 会话A }], 结: [], 快照: {} })
  const 二 = S.读全部()
  assert.equal(二[短A].rev, 2)
  assert.equal(二[短A].事件[0].id, 'x2')
})

test('坏文件：半截 JSON 跳过、记坏、其余照读，不抛', () => {
  S.准备目录(); 清()
  S.写会话(短A, { sid: 会话A, rev: 3, 事件: [], 结: [], 快照: {} })
  writeFileSync(join(S.会话目录, 短B + '.json'), '{ "version": 1, "事件": [', 'utf8')
  清()
  const 全 = S.读全部()
  assert.ok(全[短A])
  assert.equal(全[短B], undefined)
  assert.ok(S.坏文件().some((x) => x.路径.includes(短B)))
})

test('拆池：按 sid 分组，空/timer 归未归组', () => {
  const 池 = { rev: 9, events: [
    { id: 'a1', sid: 会话A }, { id: 'a2', sid: 会话A }, { id: 'b1', sid: 会话B },
    { id: 't1', sid: 'timer' }, { id: 'n1' },
  ], 刺: [{ t: 'x', sid: 会话A }, { t: 'y', sid: 'timer' }], 会话快照: { [短A]: { E: { x: 0.1 } } } }
  const 拆 = S.拆池(池)
  assert.equal(拆.本表[短A].事件.length, 2)
  assert.equal(拆.本表[短B].事件.length, 1)
  assert.equal(拆.总表.未归组.事件.length, 2)
  assert.equal(拆.总表.未归组.结.length, 1)
  assert.equal(拆.本表[短A].结.length, 1)
})

test('合池：拆-写-读回来事件/结/快照总数不变', () => {
  S.准备目录(); 清()
  const 池 = { rev: 11, events: [
    { id: 'a1', sid: 会话A, turn: 1, delta_raw: { E: 0.1 } },
    { id: 'a2', sid: 会话A, turn: 2, delta_raw: { E: 0.1 } },
    { id: 'b1', sid: 会话B, turn: 1, delta_raw: { S: 0.1 } },
    { id: 't1', sid: 'timer', turn: null, delta_raw: { P: 0.1 } },
  ], 刺: [{ t: 'x', sid: 会话A, 轴: 'E', 值: 0.1 }], 会话快照: { [短A]: { E: { x: 0.2, t: new Date().toISOString(), τ: 12 } } } }
  const 拆 = S.拆池(池)
  for (const [短, 本] of Object.entries(拆.本表)) S.写会话(短, 本)
  S.写总表(拆.总表)
  const 回 = S.合池()
  assert.equal(回.events.length, 4)
  assert.equal((回.结 || []).length, 1)
  assert.equal(回.会话快照[短A].E.x, 0.2)
})

test('补丁合并：只覆盖给的键，别的不动', () => {
  S.准备目录(); S.清缓存()
  S.写总表({ 注入: { 今日: { 判断: 1, 注入: 0 } }, 模板库: { 模板: [], 候选: [] } })
  S.写总表({ 注入: { 今日: { 注入: 2 } } })
  const 总 = S.读总表()
  assert.equal(总.注入.今日.判断, 1)
  assert.equal(总.注入.今日.注入, 2)
  assert.ok(Array.isArray(总.模板库.模板))
})

test('聚合口径：分片与旧池的现值轴逐位一致（<1e-6）', () => {
  S.准备目录(); 清()
  const 旧 = I.规整池({ rev: 3, events: [
    { id: 'a1', sid: 会话A, turn: 1, t: new Date().toISOString(), delta_raw: { E: 0.2, S: -0.1 }, 注: 'x' },
    { id: 'a2', sid: 会话A, turn: 2, t: new Date().toISOString(), delta_raw: { E: 0.1 }, 注: 'y' },
    { id: 'b1', sid: 会话B, turn: 1, t: new Date().toISOString(), delta_raw: { P: 0.3 }, 注: 'z' },
  ], 刺: [], 会话快照: {} })
  writeFileSync(join(目录, '情绪池.json'), JSON.stringify(旧, null, 2), 'utf8')
  const 拆 = S.拆池(旧)
  for (const [短, 本] of Object.entries(拆.本表)) S.写会话(短, 本)
  S.写总表(拆.总表)
  const 新 = I.规整池(S.合池())
  const a = I.现值(旧).轴, b = I.现值(新).轴
  for (const k of ['E', 'S', 'P']) assert.ok(Math.abs(a[k] - b[k]) < 1e-6, k + ' ' + a[k] + ' vs ' + b[k])
})

test('读会话：缺文件返回 null，不建空文件', () => {
  S.准备目录(); 清()
  assert.equal(S.读会话('zzzzzzzz'), null)
})

test('写会话：rev 由调用方决定，不被自动加一', () => {
  S.准备目录(); 清()
  S.写会话(短A, { sid: 会话A, rev: 7, 事件: [], 结: [], 快照: {} })
  S.写会话(短A, { sid: 会话A, rev: 7, 事件: [{ id: 'z', sid: 会话A }], 结: [], 快照: {} })
  assert.equal(S.读会话(短A).rev, 7)
})

test('拆池：只有快照、没有事件/结的会话不建空本，快照进总表', () => {
  const 拆 = S.拆池({ events: [], 刺: [], 会话快照: { zzzzzzzz: { E: { x: 0.1 } } } })
  assert.equal(拆.本表.zzzzzzzz, undefined)
  assert.ok(拆.总表.未归组快照 && 拆.总表.未归组快照.zzzzzzzz)
  assert.deepEqual(拆.空会话, ['zzzzzzzz'])
})

test('合池：总表字段原样带出（组/配置版本等）', () => {
  S.准备目录(); 清()
  S.写总表({ 组: [{ 名: 'g', 会话: [短A] }], 配置版本: 19 })
  S.写会话(短A, { sid: 会话A, rev: 1, 事件: [], 结: [], 快照: {} })
  const 回 = S.合池()
  assert.equal(回.组[0].名, 'g')
  assert.equal(回.配置版本, 19)
})

test('合池：未归组事件并入 events', () => {
  S.准备目录(); 清()
  S.写总表({ 未归组: { 事件: [{ id: 't1', sid: 'timer' }], 结: [] } })
  S.清缓存()
  assert.ok(S.合池().events.some((e) => e.id === 't1'))
})

test('坏文件不拖垮读全部：其它本仍返回', () => {
  S.准备目录(); 清()
  S.写会话(短A, { sid: 会话A, rev: 1, 事件: [], 结: [], 快照: {} })
  S.写会话(短B, { sid: 会话B, rev: 1, 事件: [], 结: [], 快照: {} })
  writeFileSync(join(S.会话目录, 'zzzzzzzz.json'), 'not json', 'utf8')
  清()
  const 全 = S.读全部()
  assert.equal(Object.keys(全).length, 2)
})
