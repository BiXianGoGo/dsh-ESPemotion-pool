import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const 前端 = readFileSync(new URL('../assets/widget.js', import.meta.url), 'utf8')

test('性能第二版：测段记自己这一段，不再用从 t0 的累计', () => {
  assert.ok(前端.includes('游: performance.now()'))
  assert.ok(前端.includes('var 今 = performance.now()'))
  assert.ok(前端.includes('测.段[名] = Math.round((今 - 测.游) * 10) / 10'))
  assert.ok(前端.includes('测.游 = 今'))
  assert.ok(!前端.includes('测.段[名] = Math.round((performance.now() - 测.t0) * 10) / 10'))
})

test('性能第二版：待确认页按签名跳过重画，切页与动作强制重画', () => {
  assert.ok(前端.includes('function 待确认签()'))
  assert.ok(前端.includes("return [Number(t.总) || 0, Number(t.候选) || 0, (t.最近 && t.最近.名) || ''].join('|')"))
  assert.ok(前端.includes('if (!强制 && 待确认签名 === 待确认签()) return'))
  assert.ok(前端.includes('if (页 === 3) 画待确认(true)'))
  assert.ok(前端.includes('if (页 === 3) 画待确认()'))
})
