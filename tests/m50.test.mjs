// M50 回归：QQ 报警总闸（2026-11-11 刷屏事故）
// 起因：用户 10:58 前后仍收到【ESP】。总闸当时写成「读不到配置就照发」，
//       配置一旦读失败（BOM / 半截文件 / 路径不对）就等于闸门失效。
// 现在：每次实时读文件、剥 BOM，只有 QQ报警 === true 才发，其余一律不发。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const 目录 = mkdtempSync(join(tmpdir(), '情绪池-m50-'))
process.env.EMOTION_POOL_DIR = 目录
const 模 = await import('../lib/index.js')

const 发送 = []
globalThis.fetch = async (url, opts) => {
  发送.push({ url: String(url), body: opts && opts.body ? String(opts.body) : '' })
  return { json: async () => ({ status: 'ok', retcode: 0 }) }
}

function 写配置(obj) {
  writeFileSync(join(目录, '情绪池配置.json'), JSON.stringify(obj, null, 2))
}

test('QQ报警=true → 真的发出去', async () => {
  发送.length = 0
  写配置({ QQ报警: true })
  const 好 = await 模.发用户QQ('测试一')
  assert.equal(发送.length, 1)
  assert.match(发送[0].url, /send_private_msg$/)
  assert.equal(好, true)
})

test('QQ报警=false → 一条都不发', async () => {
  发送.length = 0
  写配置({ QQ报警: false })
  const 好 = await 模.发用户QQ('测试二')
  assert.equal(发送.length, 0)
  assert.notEqual(好, true)
})

test('配置里没有 QQ报警 这个键 → 一条都不发（熄灯默认）', async () => {
  发送.length = 0
  写配置({ 提醒启用: false, 报警冷却小时: 24 })
  const 好 = await 模.发用户QQ('测试三')
  assert.equal(发送.length, 0)
  assert.notEqual(好, true)
})

test('配置文件带 BOM → 照常读到，不会因为解析失败而放行', async () => {
  发送.length = 0
  writeFileSync(join(目录, '情绪池配置.json'), '\uFEFF' + JSON.stringify({ QQ报警: false }))
  const 好 = await 模.发用户QQ('测试四')
  assert.equal(发送.length, 0)
  assert.notEqual(好, true)
})

test('配置是半截坏 JSON → 不发（不许把异常当放行）', async () => {
  发送.length = 0
  writeFileSync(join(目录, '情绪池配置.json'), '{"QQ报警": tr')
  const 好 = await 模.发用户QQ('测试五')
  assert.equal(发送.length, 0)
  assert.notEqual(好, true)
})
