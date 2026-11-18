// 0.3 分片存储：模式开关与读写贯通
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-m94-'))
process.env.EMOTION_POOL_DIR = 目录
const I = await import('../lib/index.js')
const S = await import('../lib/store.js')
const 会话 = 'session-c4b92d68-f40c-4fc3-ad69-f8338376753b'

function 配(补 = {}) {
  writeFileSync(join(目录, '情绪池配置.json'), JSON.stringify({ 启用: true, 刻度: 1, ...补 }, null, 2), 'utf8')
}

test('默认配置：存储模式 = 旧', () => {
  const 默 = I.默认配置 || I.读配置()
  assert.equal(I.读配置().存储模式 === undefined ? '旧' : I.读配置().存储模式, '旧')
  assert.ok(JSON.stringify(I).length > 0)
})

test('分片模式：推轴会留一条事件，快照进总表，读池能读回', () => {
  配({ 存储模式: '分片', 组: [{ 名: 'g', 会话: ['c4b92d68'] }] })
  S.清缓存()
  I.推轴(会话, { E: 0.4, S: 0, P: 0 }, 1, I.读配置(), { 系数: 1, 来源: '轨迹' })
  assert.equal(existsSync(join(S.会话目录, 'c4b92d68.json')), true)
  S.清缓存()
  const 池 = I.读池()
  assert.ok(池.会话快照 && 池.会话快照.c4b92d68)
  assert.ok(Math.abs(Number(池.会话快照.c4b92d68.E.x) - 0.16) < 1e-6, String(池.会话快照.c4b92d68.E.x))
})

test('分片模式：坏会话文件不拖垮读池', () => {
  配({ 存储模式: '分片' })
  writeFileSync(join(S.会话目录, 'badbad00.json'), '{ "oops": ', 'utf8')
  S.清缓存()
  const 池 = I.读池()
  assert.ok(池 && typeof 池 === 'object')
})
