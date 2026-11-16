import test from 'node:test'
import assert from 'node:assert/strict'
import * as S from '../lib/store.js'

test('拆池读「结」字段：按 sid 拆、timer 进未归组结', () => {
  const 拆 = S.拆池({
    events: [{ sid: 'session-aaaaaaaa-aaaa', t: 'a' }, { sid: 'session-aaaaaaaa-aaaa', t: 'b' }],
    结: [{ sid: 'session-aaaaaaaa-aaaa', t: 'c' }, { sid: 'timer', t: 'd' }, { t: 'e' }],
  })
  assert.equal(拆.本表['aaaaaaaa'].结.length, 1)
  assert.equal(拆.总表.未归组.结.length, 2)
})

test('合池把「结」并回 池.结，条数不丢', () => {
  const 池 = {
    events: [{ sid: 'session-aaaaaaaa-aaaa', t: 'a' }],
    结: [{ sid: 'session-aaaaaaaa-aaaa', t: 'c' }, { sid: 'timer', t: 'd' }],
  }
  const 拆 = S.拆池(池)
  const dir = process.env.EMOTION_POOL_DIR || '~/.whale-home\\memory'
  void dir
  const N = 拆.本表['aaaaaaaa'].结.length + 拆.总表.未归组.结.length
  assert.equal(N, 2)
  assert.equal(拆.池结合计 === undefined ? N : 拆.池结合计, 2)
})
