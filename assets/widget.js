// 情绪池 · DSH 右下角挂饰（浏览器端，纯 DOM，无外链）
// v0.8 B：三页（三轴 / 本轮观测 / 事件与结）；两个列表各自展开；作废与已归并永远不显示入口。
;(function () {
  'use strict'
  if (window.__emotionPoolWidget) return
  window.__emotionPoolWidget = true

  // ?epdebug=1 时才开：五段计时（取数/解析/建DOM/画SVG/首次布局），不改界面
  var 调 = false
  try { 调 = /[?&]epdebug=1(&|$)/.test(location.search) || localStorage.getItem('ep-debug') === '1' } catch (e) { 调 = false }
  var 账 = []
  var 测 = null
  function 测开始(名) {
    测 = { 名: 名, t0: performance.now(), 游: performance.now(), 段: {} }
  }
  function 测段(名) {
    if (!测 || 测.段[名] != null) return
    var 今 = performance.now()
    测.段[名] = Math.round((今 - 测.游) * 10) / 10
    测.游 = 今
  }
  function 报数(记) {
    try {
      var 体 = {
        段: 记.段,
        毫秒: 记.总,
        条数: (最新 && Number(最新.events)) || 0,
        页: (['三轴', '观测', '列表', '待命名', '设置'][页] || String(页 || 0)),
        t: new Date().toISOString()
      }
      fetch('/dsh-emotion-pool/perf', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(体)
      }).catch(function () {})
    } catch (e) { /* 埋点失败不许影响卡片 */ }
  }
  function 测结束() {
    if (!测) return
    测.总 = Math.round((performance.now() - 测.t0) * 10) / 10
    var 记 = 测
    测 = null
    if (调) {
      账.push(记)
      if (账.length > 40) 账.shift()
      try { window.__epPerf = 账 } catch (e) {}
    }
    报数(记)
  }

  var API = '/dsh-emotion-pool/state'
  var 列表 = '/dsh-emotion-pool/list'
  var 轴们 = ['E', 'S', 'P']
  var 位置键 = 'emotion-pool-widget-pos'

  var css = [
    '.ep-card{position:fixed;right:12px;bottom:12px;width:360px;height:560px;max-width:calc(100vw - 24px);max-height:calc(100vh - 24px);display:flex;flex-direction:column;z-index:99991;box-sizing:border-box;background:#12141c;',
    'border:1px solid #2c3242;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.55);',
    'color:#e7e9f0;font:13px/1.5 system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;',
    'user-select:none;cursor:pointer;overflow:hidden}',
    '.ep-card:hover{border-color:#3a4358}',
    '.ep-head{display:block;flex:none;padding:8px 12px 6px;min-width:196px;cursor:move;touch-action:none}',
    '.ep-card.收起 .ep-head{display:flex;align-items:center;gap:8px;padding:6px 10px}',
    '.ep-card.收起 .ep-row1,.ep-card.收起 .ep-row2{display:flex;align-items:center;gap:6px;margin:0;min-width:0}',
    '.ep-card.收起 .ep-name{max-width:120px}',
    '.ep-card.收起 .ep-body,.ep-card.收起 .ep-foot,.ep-card.收起 .ep-dots,.ep-card.收起 .ep-grip{display:none}',
    '.ep-row1{display:flex;align-items:center;gap:6px}',
    '.ep-row2{display:flex;align-items:center;gap:6px;margin-top:3px}',
    '.ep-name{flex:1;min-width:0;font-size:14px;font-weight:700;color:#7ee0c8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:help}',
    '.ep-axes{flex:1;display:flex;gap:6px;font-variant-numeric:tabular-nums;font-size:12px}',
    '.ep-ax{color:#8b93a8}',
    '.ep-ax.pos{color:#59d6b4}',
    '.ep-ax.neg{color:#e08b8b}',
    '.ep-refresh{margin-left:auto;background:#1a1f2c;color:#9fe4d2;border:1px solid #2b3346;border-radius:6px;',
    'padding:2px 8px;font:inherit;font-size:12px;line-height:1.4;cursor:pointer}',
    '.ep-refresh:hover{background:#222a3b}',
    '.ep-panel{display:none;flex:1;min-height:0;padding:0 12px;flex-direction:column;cursor:auto}',
    '.ep-card.open .ep-panel{display:flex;overflow:hidden}',
    '.ep-body{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;overflow:hidden;padding-bottom:0}',
    '.ep-pages{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding-bottom:8px}',
    '.ep-nav{flex:none}',
    '.ep-pages::-webkit-scrollbar{width:6px}',
    '.ep-pages::-webkit-scrollbar-thumb{background:#3a4358;border-radius:3px}',
    '.ep-pages::-webkit-scrollbar-track{background:transparent}',
    '.ep-grip{position:absolute;right:1px;bottom:1px;width:16px;height:16px;cursor:nwse-resize;touch-action:none;opacity:.75;background:repeating-linear-gradient(135deg,transparent 0 3px,#5c6478 3px 4px,transparent 4px 6px)}',
    '.ep-nav{display:flex;align-items:center;gap:8px;margin:8px 0 2px}',
    '.ep-arrow{background:#1a1f2c;color:#9fe4d2;border:1px solid #2b3346;border-radius:6px;padding:0 8px;font:inherit;font-size:14px;line-height:1.9;cursor:pointer}',
    '.ep-arrow:hover{background:#222a3b}',
    '.ep-pagetitle{flex:1;font-size:11px;letter-spacing:1px;color:#7d869c;font-weight:600}',
    '.ep-dots{display:flex;gap:5px}',
    '.ep-dots i{width:6px;height:6px;border-radius:50%;background:#2c3242;display:block;cursor:pointer}',
    '.ep-dots i.on{background:#59d6b4}',
    '.ep-page{display:none}',
    '.ep-page.on{display:block}',
    '.ep-tplhead{font-size:12px;color:#9fe4d2;margin:6px 0}'+
    '.ep-cd{display:flex;gap:8px;align-items:center;border-bottom:1px solid #1c2130;padding:6px 0;cursor:default}'+
    '.ep-cd .ep-seg{font-style:normal;color:#7d869c;font-size:10px;margin-left:4px}'+
    '.ep-cn{flex:1;font-size:12px;color:#dfe4f1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'+
    '.ep-cd button,.ep-tpls button{background:#1a1f2c;color:#9fe4d2;border:1px solid #2b3346;border-radius:6px;padding:2px 7px;font:inherit;font-size:11px;cursor:pointer;flex:none}'+
    '.ep-tplhead,.ep-h{cursor:pointer}'+
    '.ep-h{display:flex;align-items:center;gap:8px;font-size:11px;letter-spacing:1px;color:#7d869c;margin:12px 0 6px;font-weight:600}',
    '.ep-htabs{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 2px}',
    '.ep-stab{background:#1a1f2c;color:#9fe4d2;border:1px solid #2b3346;border-radius:6px;padding:2px 8px;font:inherit;font-size:11px;cursor:pointer}',
    '.ep-stab.on{background:#2b3547;color:#fff;border-color:#4a5570}',
    '.ep-seg{flex:none;color:#8b93a8;font-size:11px;white-space:nowrap}',
    '.ep-h .ep-grow{flex:1}',
    '.ep-mini{background:#1a1f2c;color:#9fe4d2;border:1px solid #2b3346;border-radius:5px;padding:1px 6px;font:inherit;font-size:10.5px;cursor:pointer}',
    '.ep-mini:hover{background:#222a3b}',
    '.ep-row{display:flex;align-items:center;gap:8px;margin:6px 0}',
    '.ep-k{width:14px;color:#c9d0e2;font-weight:700}',
    '.ep-track{position:relative;flex:1;min-width:0;height:16px;background:#171b26;border:1px solid #262c3a;border-radius:4px;overflow:hidden}',
  '.ep-row .ep-green{top:1px;height:6px;bottom:auto}',
  '.ep-row .ep-blu{top:1px;height:6px;bottom:auto}',
  '.ep-zero-bar{position:absolute;top:9px;height:5px;border-radius:3px;background:#e0b15a;opacity:.85}',
  '.ep-loading{font-size:10px;color:#7d869c;margin-left:6px}',
    '.ep-c{position:absolute;left:50%;top:0;bottom:0;width:1px;background:#3a4256}',
    '.ep-zdot{position:absolute;top:50%;width:8px;height:8px;margin:-4px 0 0 -4px;border-radius:2px;background:#e0b15a;box-shadow:0 0 4px rgba(224,177,90,.8)}',
    '.ep-ends{display:flex;justify-content:space-between;color:#5f687d;font-size:10px;margin:-2px 0 2px 22px;max-width:100%}',
    '.ep-zl{color:#e0b15a;font-size:10px;margin-left:4px;white-space:nowrap}',
    '.ep-fill{position:absolute;top:1px;bottom:1px;border-radius:3px}',
    '.ep-fill.pos{background:linear-gradient(90deg,#2f8f7a,#59d6b4)}',
    '.ep-fill.neg{background:linear-gradient(90deg,#d16a6a,#8f3535)}',
    '.ep-fill.zero{background:#3a4256}',
    '.ep-green{position:absolute;top:1px;bottom:1px;border-radius:3px;background:linear-gradient(90deg,#2f8f7a,#59d6b4)}',
    '.ep-green.neg{background:linear-gradient(90deg,#d16a6a,#8f3535)}',
    '.ep-blu{position:absolute;z-index:3;top:1px;bottom:1px;border-radius:3px;background:rgba(110,168,255,.65)}',
    ' .ep-wave{font-size:11.5px;color:#c9d0e2}',
    '.ep-wave .ep-wrow{display:flex;gap:8px;padding:2px 0;border-bottom:1px solid #1c2130}',
    '.ep-wave .ep-wt{color:#7d869c;width:42px;flex:none}',
    '.ep-wave .ep-wv{color:#8fd8c4;font-variant-numeric:tabular-nums;flex:none}',
    '.ep-wave .ep-wn{flex:1;overflow-wrap:anywhere}',
    '.ep-gcards{display:flex;flex-direction:column;gap:6px;flex:1 1 auto;min-height:0}' +
  '.ep-page[data-page="0"].on{display:flex;flex-direction:column;height:100%;min-height:0;overflow-y:auto;overscroll-behavior:contain}' +
  '.ep-gcard{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;overflow:hidden;border:1px solid #202634;border-radius:10px;padding:6px 9px}',
    '.ep-gtabs{flex:none;display:flex;flex-wrap:nowrap;gap:6px;margin:2px 0 4px;overflow-x:auto;scrollbar-width:thin}',
  '.ep-gtab{background:#1a1f2c;color:#8b93a8;border:1px solid #2b3346;border-radius:6px;padding:0 9px;height:22px;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;white-space:nowrap;flex:none;font:inherit;font-size:11px;cursor:pointer}',
  '.ep-gtab.on{background:#233247;color:#9fe4d2;border-color:#3a4d68}',
  '.ep-gunp{font-style:normal;font-size:10px;color:#7d869c;margin-left:4px}',
    '.ep-green.ep-gcard-fill.unpushed{background:#3a4256;background-image:none;border:1px dashed #7d869c}',
    '.ep-gcard-h{flex:none;display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-size:14px;font-weight:700;color:#e7e9f0;margin-bottom:4px;padding-bottom:4px;border-bottom:1px solid #262c3a}',
    '.ep-gcard-h b{font-weight:700;color:#9fe4d2}',
    '.ep-gcard-sub{font-size:10px;color:#7d869c;margin:-2px 0 4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
'.ep-gcard-h span{color:#7d869c;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.ep-gcard-row{flex:none;display:flex;flex-wrap:nowrap;align-items:center;gap:6px;margin:0}' +
  '.ep-gcard-fill{position:absolute;z-index:1;top:1px;bottom:1px;border-radius:3px}' +
  '.ep-gcard-fill.pos{background:linear-gradient(90deg,#2f8f7a,#59d6b4)}' +
  '.ep-gcard-fill.neg{background:linear-gradient(90deg,#d16a6a,#8f3535)}' +
  '.ep-gcard-fill.zero{background:#3a4256}' +
    '.ep-blu{position:absolute;top:1px;bottom:1px;border-radius:3px;background:linear-gradient(90deg,#2c5f8f,#5aa9ff)}' +
    '.ep-gzero{position:absolute;top:50%;width:2px;height:10px;margin:-5px 0 0 -1px;border-radius:1px;background:#e0b15a;box-shadow:0 0 0 1px rgba(18,20,28,.8)}',
    '.ep-ev{flex-wrap:wrap}',
    '.ep-ev-time{color:#8b93a8;font-variant-numeric:tabular-nums;flex:none}',
    '.ep-ev-seg{color:#9fe4d2;flex:none}',
    '.ep-ev-who{color:#c9d0e2;flex:none}',
    '.ep-ev-d{color:#dfe4f1;font-variant-numeric:tabular-nums;flex:none}',
    '.ep-ev-src{color:#6c7488;flex:none;margin-left:auto}',
    '.ep-st{font-size:10px;opacity:.75;border:1px solid currentColor;border-radius:6px;padding:0 4px;margin:0 2px;white-space:nowrap}.ep-st-基线{opacity:.55}.ep-st-波动{opacity:.7}.ep-st-趋势{opacity:.85}.ep-st-跳变{opacity:1;font-weight:600}\n.ep-ev-q{flex:1 1 100%;color:#b6bccd;padding-top:2px;overflow-wrap:anywhere;white-space:normal}',
    '.ep-dot{fill:#7d869c;opacity:.45;pointer-events:none}',
    '.ep-dot.on{fill:#fff;opacity:1}',
    '.ep-ev-name{color:#e0b15a;flex:none;margin-right:6px}',
    '.ep-ev-why{flex:1 1 100%;color:#9aa3b8;font-size:11px;padding-top:1px}',
    '.ep-wq{color:#9aa3b8;font-size:11px;margin-top:1px}',
    '.ep-wd{color:#dfe4f1;font-size:11px;font-variant-numeric:tabular-nums}',
    '.ep-hq{margin-top:4px;padding-top:4px;border-top:1px solid #2b3346;color:#d7dceb;white-space:normal;overflow-wrap:anywhere}',
    '.ep-gcard-k{flex:none;width:14px;color:#c9d0e2;font-weight:700;font-size:12px}',
    '.ep-gcard-track{position:relative;flex:1;height:7px;background:#171b26;border:1px solid #262c3a;border-radius:4px;overflow:hidden}',
    '.ep-gcard-fill{position:absolute;top:1px;bottom:1px;border-radius:3px}',
    '.ep-gcard-v{width:56px;text-align:right;font-size:13px;color:#dfe4f1;font-variant-numeric:tabular-nums}',
    '.ep-gwrap{position:relative;flex:1 1 auto;min-height:96px;max-height:170px;margin:1px 0}',
  '.ep-gwrap .ep-gcard-svg{position:absolute;left:0;top:0;width:100%;height:100%;display:block}',
  '.ep-gticks{position:absolute;left:2px;top:0;bottom:0;width:30px;pointer-events:none;font-size:10px;color:#6c7488;line-height:1}',
  '.ep-plot{transition:transform .35s cubic-bezier(.22,.61,.36,1)}',
  '.ep-hit circle{fill:transparent;stroke:none;pointer-events:all}',
    '.ep-gticks span{position:absolute;left:0;transform:translateY(-50%);white-space:nowrap}',
  '.ep-gcard .ep-legend{display:none}',
    '.ep-glegend{flex:none;display:flex;justify-content:flex-end;gap:8px;font-size:10px;padding:0 2px}',
  '.ep-gl{cursor:pointer;user-select:none;opacity:.45}',
  '.ep-gl.on{opacity:1}',
  '.ep-gcap{flex:none;font-size:12px;color:#7d869c;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '.ep-gtip{position:absolute;z-index:5;pointer-events:none;background:rgba(18,20,28,.98);border:1px solid #2c3242;border-radius:6px;padding:4px 6px;font-size:10px;color:#dfe4f1;max-width:280px;display:none}',
    '.ep-gcard-wave{flex:none;font-size:12.5px;color:#c9d0e2;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.ep-gcard-wave i{font-style:normal;color:#7d869c;font-variant-numeric:tabular-nums;margin-right:6px}',
    '.ep-dot{position:absolute;top:50%;width:6px;height:6px;margin:-3px 0 0 -3px;border-radius:50%;background:#ffd166}',
    '.ep-gcard-vwrap{flex:none;min-width:92px;display:flex;flex-direction:column;align-items:flex-end;line-height:1.05}',
    '.ep-base{font-size:9.5px;line-height:1.05;color:#7d869c;white-space:nowrap;margin-top:1px}',
    '.ep-v{flex:none;min-width:92px;text-align:right;font-variant-numeric:tabular-nums;color:#dfe4f1;font-size:12px;white-space:nowrap}',
    '.ep-v .ep-of{color:#ffd166;font-size:11px;margin-left:3px}',
    '.ep-dlt{color:#8fd8c4;font-size:10.5px;margin-left:3px}',
    '.ep-smsg.err{color:#ff9b9b}'+
    '.ep-smsg.warn{color:#ffd166}'+
    '.ep-act{background:#1a1f2c;color:#9fe4d2;border:1px solid #2b3346;border-radius:6px;padding:3px 8px;font:inherit;font-size:11px;cursor:pointer}'+
    '.ep-q{display:inline-block;width:13px;height:13px;line-height:13px;text-align:center;border-radius:50%;background:#2c3242;color:#9fe4d2;font-size:10px;margin-left:4px;cursor:help}'+
    '.ep-names{margin:6px 0 0 0}'+
    '.ep-nrow{display:flex;gap:8px;align-items:center;border-bottom:1px solid #1c2130;padding:4px 0;font-size:12px}'+
    '.ep-nrow .ep-cn{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'+
    '.ep-obs{font-size:12px;font-variant-numeric:tabular-nums}',
    '.ep-obs-head{display:list-item;width:100%;text-align:left;background:none;border:0;color:inherit;font:inherit;padding:0;margin:0;cursor:pointer;list-style:none;padding-left:14px}',
    '.ep-obs-head::-webkit-details-marker{display:none}',
    '.ep-obs-head::before{content:"▸ ";color:#7d869c;margin-left:-14px}',
    '.ep-ogroup[open] .ep-obs-head::before{content:"▾ "}',
    '.ep-obs .obr{display:flex;gap:8px;align-items:baseline;line-height:1.5}',
    '.ep-obs .ok{width:88px;flex:none;color:#7d869c}',
    '.ep-obs .ov{flex:1;min-width:0;color:#dfe4f1;overflow-wrap:anywhere}',
    '.ep-obs .ov b{color:#9fe4d2;font-weight:600}',
    '.ep-obs .ov .warn{color:#e0b15a}',
    '.ep-chk{display:block;padding:3px 0;color:#dfe4f1;font-size:12px;cursor:pointer}',
    '.ep-chk input{margin-right:6px;accent-color:#59d6b4}',
    '.ep-dsrc{margin:6px 0 10px;padding:6px 8px;border:1px solid #1c2130;border-radius:8px}',
  '.ep-ptext{width:100%;box-sizing:border-box;min-height:64px;font-family:Consolas,monospace;font-size:11px;line-height:1.5;color:#dbe3f0;background:#12161f;border:1px solid #2b3242;border-radius:6px;padding:6px;margin:4px 0 8px;resize:vertical}',
  '.ep-pre{font-size:11px;line-height:1.6;color:#aab4c8;white-space:pre-wrap;margin:2px 0 8px}',
    '.ep-dgh{display:flex;align-items:center;gap:6px;margin-bottom:2px}',
    '.ep-gname{background:#141824;color:#9fe4d2;border:1px solid #2b3346;border-radius:5px;font:inherit;font-size:12px;padding:2px 6px;width:120px}',
    '.ep-gray .ep-sval{color:#7d869c}',
    '.ep-ogroup{margin-top:8px;border-top:1px solid #1c2130;padding-top:6px}',
    '.ep-oh{cursor:pointer;color:#9fb4d8;font-size:11.5px;letter-spacing:.5px;user-select:none}',
    '.ep-oh:hover{color:#cfe0ff}',
    '.ep-obody{margin-top:2px}',
    '.ep-srow{display:grid;grid-template-columns:minmax(56px,76px) 1fr 78px;gap:2px 6px;align-items:center;padding:5px 0;border-bottom:1px solid #1c2130;font-size:12px}',
    '.ep-sname{color:#c9d0e2}',
    '.ep-sval{color:#8b93a8;font-variant-numeric:tabular-nums;font-size:11px}',
    '.ep-snum{width:64px;background:#12151f;border:1px solid #2b3346;border-radius:5px;color:#e7e9f0;font:12px system-ui;padding:2px 4px;text-align:right}',
    '.ep-srow input[type=checkbox]{width:15px;height:15px;accent-color:#59d6b4}',
    '.ep-smsg{grid-column:1 / -1;font-size:11px;min-height:14px}',
    '.ep-smsg.ok{color:#59d6b4}',
    '.ep-smsg.err{color:#e08b8b}',
    '.ep-set .ep-none{padding:8px 0}',
    '.ep-grp{border-top:1px solid #1c2130}',
    '.ep-grp:first-of-type{border-top:0}',
    '.ep-gh{display:flex;align-items:center;gap:6px;padding:7px 0;cursor:pointer;color:#c9d0e2;font-size:12px;user-select:none}',
    '.ep-gh .ep-garrow{width:12px;color:#7d869c;transition:transform .15s}',
    '.ep-grp.open .ep-garrow{transform:rotate(90deg)}',
    '.ep-gb{display:none;padding:0 0 8px}',
    '.ep-grp.open .ep-gb{display:block}',
    '.ep-mtools{display:flex;gap:6px;margin:2px 0 6px}',
    '.ep-mtools button{background:#1a1f2c;color:#9fe4d2;border:1px solid #2b3346;border-radius:6px;padding:2px 8px;font:inherit;font-size:11px;cursor:pointer}',
    '.ep-mrow{display:flex;align-items:center;gap:8px;padding:3px 0;font-size:11.5px}',
    '.ep-mrow .ep-mid{color:#dfe4f1;font-variant-numeric:tabular-nums}',
    '.ep-mrow .ep-mn{flex:1;color:#7d869c;text-align:right}',
    '.ep-mhint{color:#6c7488;font-size:11px;padding-top:4px}',
    '.ep-set{overflow-x:hidden}',
    '.ep-grp{min-width:0}',
    '.ep-gh>span:last-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.ep-gh:hover{background:#151a26}',
    '.ep-smulti{display:block;padding:6px 0}',
    '.ep-smulti .ep-mtools{flex-wrap:wrap}',
    '.ep-mlist{display:grid;gap:2px;min-width:0}',
    '.ep-mrow{min-width:0;flex-wrap:wrap}',
    '.ep-mrow .ep-mn{white-space:nowrap;font-size:11px}',
    '.ep-mmsg{display:block;font-size:11px;min-height:14px;margin-top:4px}',
    '.ep-pname{color:#6c7488;font-size:11px;padding:2px 0 6px;border-bottom:1px solid #1c2130;margin-bottom:6px}',
    '.ep-list{border-top:1px solid #1c2130;max-height:120px;overflow:auto;overscroll-behavior:contain;transition:max-height .18s ease}',
    '.ep-list.full{max-height:320px}',
    '.ep-item{display:flex;gap:8px;padding:4px 0;border-bottom:1px solid #1c2130;font-size:12px;align-items:flex-start}',
    '.ep-t{width:46px;flex:none;color:#7d869c;font-variant-numeric:tabular-nums}',
    '.ep-d{flex:none;color:#8fd8c4;font-variant-numeric:tabular-nums;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.ep-n{flex:1;color:#dfe4f1;overflow-wrap:anywhere;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2;overflow:hidden}',
    '.ep-list.ep-all .ep-n{-webkit-line-clamp:unset;line-clamp:unset;display:block}',
    '.ep-none{color:#6c7488;font-size:12px;padding:3px 0}',
    '.ep-more{display:flex;gap:6px;padding:6px 0 2px}',
    '.ep-more button{background:#1a1f2c;color:#9fe4d2;border:1px solid #2b3346;border-radius:6px;padding:3px 9px;font:inherit;font-size:11px;cursor:pointer}',
    '.ep-more button:hover{background:#222a3b}',
    '.ep-sub{display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap;margin:-2px 0 7px 22px;font-size:10.5px;color:#7d869c}',
    '.ep-num{font-weight:700;color:#dfe4f1;font-variant-numeric:tabular-nums;white-space:nowrap}',
    '.ep-num .ep-dlt{font-weight:400;color:#8fd8c4;margin-left:4px}',
    '.ep-num .ep-of{font-weight:400;color:#ffd166;font-size:10px;margin-left:4px}',
    '.ep-legend{display:flex;gap:10px;font-size:10.5px;color:#7d869c;margin:2px 0 4px 34px}',
    '.ep-legend span{cursor:pointer;user-select:none}',
    '.ep-legend span.off{opacity:.35;text-decoration:line-through}',
    '.ep-pan{will-change:transform}',
    '.ep-green,.ep-blu{transition:width .3s ease,left .3s ease}',
    '@keyframes epFade{from{opacity:0}to{opacity:1}}',
    '.ep-page.on{animation:epFade .15s ease}',
    '.ep-follow{position:absolute;right:10px;bottom:48px;z-index:6;background:#1a1f2c;color:#ffd166;border:1px solid #2b3346;border-radius:6px;padding:3px 8px;font:11px/1.4 system-ui,sans-serif;cursor:pointer}',
    '.ep-htip{position:absolute;z-index:99999;background:#0b0e14;border:1px solid #2c3242;border-radius:8px;padding:6px 8px;font-size:11px;color:#dfe4f1;max-width:260px;pointer-events:none;display:none;box-shadow:0 6px 20px rgba(0,0,0,.5)}',
    '.ep-htip b{color:#8fd8c4}',
    '.ep-dbg{position:absolute;right:14px;bottom:30px;background:#0b0e14;border:1px solid #2c3242;border-radius:6px;padding:3px 6px;font-size:10px;color:#9fe4d2;z-index:99999;pointer-events:none}',
    '.ep-foot{display:flex;flex:none;flex-wrap:wrap;justify-content:space-between;gap:4px 8px;color:#6c7488;font-size:11px;padding:8px 18px 10px 0;font-variant-numeric:tabular-nums}',
    '.ep-foot span{min-width:0}',
    '.ep-hl{position:absolute;top:1px;bottom:1px;border-radius:3px;background:rgba(110,168,255,.9)}',
    '.ep-tip{position:fixed;z-index:99999;display:none;max-width:264px;background:#0f121a;border:1px solid #3a4358;color:#dfe4f1;font-size:12px;line-height:1.6;padding:8px 10px;border-radius:8px;box-shadow:0 10px 26px rgba(0,0,0,.55);pointer-events:none}',
    '.ep-pend{color:#7d869c;font-size:11px;margin-top:8px}',
    '.ep-card.empty .ep-panel{width:100%}',
    '.ep-empty{color:#8b93a8;font-size:12px;padding:10px 0;line-height:1.7}',
  ].join('')

  function style() {
    if (document.getElementById('ep-style')) return
    var s = document.createElement('style')
    s.id = 'ep-style'
    s.textContent = css
    document.head.appendChild(s)
  }

  function 符号(v) { return v > 0.05 ? '+' : v < -0.05 ? '-' : '0' }
  function 三位(v) { return (v >= 0 ? '+' : '') + Number(v).toFixed(3) }
// 2026-11-16（第 7 项）：事件里的 Δ 统一两位小数，正负都带号
function 带号(v) { var x = Number(v) || 0; return (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(2) }
  function 两位(v) { return (v >= 0 ? '+' : '') + Number(v).toFixed(2) }
  function 夹位置(x, y, vw, vh, w, h) {
    var 边 = 6
    var 最右 = Math.max(边, vw - w - 边)
    var 最下 = Math.max(边, vh - h - 边)
    return { left: Math.max(边, Math.min(最右, x)), top: Math.max(边, Math.min(最下, y)) }
  }
  var 默认宽 = 360, 默认高 = 560, 最小宽 = 280, 最小高 = 320, 最大宽 = 720, 最大高 = 900
  function 夹尺寸(w, h) {
    return {
      宽: Math.max(最小宽, Math.min(最大宽, Math.round(Number(w) || 默认宽))),
      高: Math.max(最小高, Math.min(最大高, Math.round(Number(h) || 默认高)))
    }
  }
  function 适配尺寸(w, h) {
    var c = 夹尺寸(w, h)
    return { 宽: Math.min(c.宽, Math.max(220, window.innerWidth - 32)), 高: Math.min(c.高, Math.max(240, window.innerHeight - 24)) }
  }
  var 记忆高 = 默认高, 收起 = false, 展开宽 = 默认宽, 收起宽 = 360
  function 头高() { var h = 卡 && 卡.querySelector('.ep-head'); return h ? h.offsetHeight : 0 }
  function 底高() { var f = 卡 && 卡.querySelector('.ep-foot'); return f && !收起 ? f.offsetHeight : 0 }
  function 重排高度() {
    if (!卡) return
    卡.style.height = (收起 ? 头高() : 记忆高) + 'px'
  }
  function 应用尺寸(w, h) {
    if (!卡) return
    var a = 适配尺寸(w, h)
    记忆高 = a.高
    展开宽 = a.宽
    if (!收起) 卡.style.width = a.宽 + 'px'
    重排高度()
  }
  function 读位置() {
    try { var p = JSON.parse(localStorage.getItem(位置键) || 'null'); return p && typeof p === 'object' ? p : null } catch (e) { return null }
  }
  function 存位置(位, w, h) {
    var c = 夹尺寸(w || 展开宽, h)
    try { localStorage.setItem(位置键, JSON.stringify({ left: 位.left, top: 位.top, 宽: c.宽, 高: c.高, 收起: 收起 })) } catch (e) { /* ignore */ }
  }
  function 切换收起(状) {
    if (!卡) return
    var 右 = 卡.getBoundingClientRect().right
    var 上 = 卡.getBoundingClientRect().top
    if (!收起) 展开宽 = 卡.offsetWidth
    收起 = !!状
    卡.classList.toggle('收起', 收起)
    if (收起) {
      卡.style.width = 'auto'
      var 自 = Math.round(卡.getBoundingClientRect().width)
      收起宽 = Math.max(168, Math.min(300, 自))
    }
    卡.style.width = (收起 ? 收起宽 : 展开宽) + 'px'
    重排高度()
    if (收起) { if (轨迹钟) { clearTimeout(轨迹钟); 轨迹钟 = null } } else { 测开始('打开'); 立即重画轨迹(); 立即刷() }
    if (!收起) 重画组()
    var 宽 = 卡.offsetWidth
    var 位 = 夹位置(右 - 宽, 上, window.innerWidth, window.innerHeight, 宽, 卡.offsetHeight)
    卡.style.left = 位.left + 'px'
    卡.style.top = 位.top + 'px'
    卡.style.right = 'auto'
    卡.style.bottom = 'auto'
    存位置(位, 展开宽, 记忆高)
  }
  try { window.__ep夹位置 = 夹位置; window.__ep夹尺寸 = 夹尺寸 } catch (e) { /* ignore */ }

  function 时钟(t) {
    try {
      var d = new Date(t)
      if (isNaN(d.getTime())) return String(t || '').slice(11, 19)
      return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0')
    } catch (e) { return String(t || '').slice(11, 19) }
  }
  function 转义(t) {
    return String(t).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
    })
  }

  var 卡, 名字, 轴条, 面板, 浮层
  var 组点 = {}, 组图 = {}, 组前点 = {}, 上次条显 = {}, 组窗 = {}, 组总 = {}, 组长 = {}, 组卡 = {}, 组跟 = {}, 上次rev = null, 强制刷 = false, 跟徽 = null
  function 隐线(){ try { var a = JSON.parse(localStorage.getItem('组线') || '[]'); return Array.isArray(a) ? a : [] } catch (e) { return [] } }
  function 收浮(){ if (浮层) 浮层.style.display = 'none'; var d = 卡 && 卡.querySelector('.ep-hdot'); if (d) d.remove() }
  var 最近组状态 = null
  var 释义 = {}
  var 结数据 = [], 事件数据 = [], 结总 = 0, 事件总 = 0, 会话表 = [], 列表会话 = '', 会话签 = ''
  var 展开结 = false, 展开事件 = false
  var 页 = 0
  var 刻度 = 10
  var 最新 = null

  function 搭() {
    style()
    // 2026-11-16（卡片前端第 6 项）：观测组已改用原生 <details>，全局捕获的 click 补丁会跟它打架，
    // 这里不再拦截 .ep-obs-head；折叠状态改由 details 的 toggle 事件持久化。
    卡 = document.createElement('div')
    卡.className = 'ep-card'
    卡.innerHTML =
      '<div class="ep-head">' +
      '  <div class="ep-row1"><span class="ep-name">—</span></div>' +
      '  <div class="ep-row2"><span class="ep-axes"></span>' +
      '  <span class="ep-loading">加载中…</span>' +
      '  <button class="ep-refresh" type="button" title="刷新（重新拉数据并重载脚本）">↻</button></div></div>' +
      '<div class="ep-panel">' +
      '  <div class="ep-empty" style="display:none">暂无记录 · 池子是空的：还没开始记录，或刚清空过</div>' +
      '  <div class="ep-body">' +
      '  <div class="ep-nav" style="flex:none"><button class="ep-arrow" type="button" data-dir="-1">‹</button>' +
      '    <span class="ep-pagetitle">三轴</span>' +
      '    <span class="ep-dots"><i class="on" data-page="0"></i><i data-page="1"></i><i data-page="2"></i><i data-page="3"></i><i data-page="4"></i></span>' +
      '    <button class="ep-arrow" type="button" data-dir="1">›</button></div>' +
      '  <div class="ep-pages">' +
      '  <div class="ep-page on" data-page="0">' +
      '    <div class="ep-gtabs"></div><div class="ep-gcards"></div>' +
      '    <div style="height:20px"></div></div>' +
      '  <div class="ep-page" data-page="1">' +
      '    <div class="ep-obs"></div>' +
      '    </div>' +
      '  <div class="ep-page" data-page="2">' +
      '    <div class="ep-htabs" id="事件会话"></div>' +
      '    <div class="ep-h"><span class="ep-grow">事件</span><button class="ep-mini" type="button" data-fold="事件">展开</button></div>' +
      '    <div class="ep-events ep-list"></div>' +
      '    <div class="ep-more" data-foot="事件"><button type="button" data-more="事件">查看更多</button></div>' +
      '    <div class="ep-pend"></div>' +
      '  </div>' +
      '  <div class="ep-page" data-page="3">' +
    '    <div class="ep-pagetitle">情绪待命名确认页</div>' +
    '    <div class="ep-tplhead" id="tplhead">—</div>' +
    '    <div class="ep-cand" id="cands"><div class="ep-none">还没有待确认的名字</div></div>' +
    '    <div class="ep-h ep-tplfold" id="tplfold">模板 <span class="ep-tpln">0</span> <span class="ep-tplar">▸ 展开</span></div>' +
    '    <div class="ep-tpls" id="tpls" style="display:none"></div>' +
    '  </div>' +
    '  <div class="ep-page" data-page="4">' +
      '    <div class="ep-h"><span class="ep-grow">设置</span></div><div class="ep-set"><div class="ep-none">读取中…</div></div></div>' +
      '  </div>' +
      '  <div class="ep-foot"><span class="ep-up"></span><span class="ep-rev"></span></div>' +
      '  <div class="ep-grip" title="拖动调整大小（双击恢复默认）"></div>' +
      '</div>'
    document.body.appendChild(卡)
    if (String(location.search || '').indexOf('epdbg=1') >= 0) {
      var 调 = document.createElement('div')
      调.className = 'ep-dbg'
      调.textContent = 'i=— vx=— 步=— 偏=—'
      卡.appendChild(调)
    }
    释义 = {}
    var 提示 = document.createElement('div')
    提示.className = 'ep-tip'
    document.body.appendChild(提示)
    function 显示提示(el) {
      var t = el.getAttribute('data-tip')
      if (!t) return
      提示.textContent = t
      提示.style.display = 'block'
      var r = el.getBoundingClientRect()
      var w = 提示.offsetWidth
      var h = 提示.offsetHeight
      var l = Math.max(8, Math.min(window.innerWidth - w - 8, r.left))
      var top = r.top - h - 8
      if (top < 8) top = r.bottom + 8
      提示.style.left = l + 'px'
      提示.style.top = top + 'px'
    }
    function 藏提示() { 提示.style.display = 'none' }
    卡.addEventListener('mouseover', function (e) {
      var el = e.target && e.target.closest ? e.target.closest('[data-tip]') : null
      if (el) 显示提示(el)
    })
    卡.addEventListener('mouseout', function (e) {
      var el = e.target && e.target.closest ? e.target.closest('[data-tip]') : null
      if (el && !(e.relatedTarget && el.contains(e.relatedTarget))) 藏提示()
    })
    window.addEventListener('scroll', 藏提示, true)
    fetch('/dsh-emotion-pool/glossary', { cache: 'no-store' })
      .then(function (r) { return r.json() })
      .then(function (o) { if (o && o.项) 释义 = o.项 })
      .catch(function () {})
    var 轨盒 = 卡.querySelector('.ep-trace')
    if (轨盒) {
      轨盒.addEventListener('mousemove', 图移动)
      轨盒.addEventListener('mouseleave', 藏图提示)
    }
    名字 = 卡.querySelector('.ep-name')
    卡.tabIndex = 0
    卡.addEventListener('keydown', function (e) {
      if (e.key === 'End') { e.preventDefault(); 回最新(); return }
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      var 组 = (最新 && Array.isArray(最新.组) && 最新.组.length) ? 最新.组 : []
      var 选 = 组选(组.length || 1)
      var 全 = Number(组总[选]) || 0
      var 步 = e.key === 'ArrowRight' ? 5 : -5
      组窗[选] = Math.max(0, Math.min(Math.max(0, 全 - 20), (Number(组窗[选]) || 0) + 步))
      e.preventDefault()
      重画组()
    })
    轴条 = 卡.querySelector('.ep-axes')
    面板 = 卡.querySelector('.ep-panel')
    浮层 = document.createElement('div')
    浮层.className = 'ep-gtip'
    卡.appendChild(浮层)
    跟徽 = document.createElement('div')
    跟徽.className = 'ep-follow'
    跟徽.textContent = '已离开最新 · 按 End 回最新'
    跟徽.style.display = 'none'
    卡.appendChild(跟徽)
    跟徽.addEventListener('click', function (e) { e.stopPropagation(); 回最新() })
    setInterval(补文案, 100)

    var 存 = 读位置()
    var 初尺 = 夹尺寸(存 && 存.宽, 存 && 存.高)
    收起 = !!(存 && 存.收起)
    卡.classList.toggle('收起', 收起)
    卡.classList.toggle('open', !收起)
    应用尺寸(初尺.宽, 初尺.高)
    if (存 && typeof 存.left === 'number' && typeof 存.top === 'number') {
      var 位 = 夹位置(存.left, 存.top, window.innerWidth, window.innerHeight, 初尺.宽, 初尺.高)
      卡.style.left = 位.left + 'px'
      卡.style.top = 位.top + 'px'
      卡.style.right = 'auto'
      卡.style.bottom = 'auto'
      卡.setAttribute('data-pos', 位.left + ',' + 位.top)
    }
    if (收起) {
      卡.classList.add('收起')
      卡.style.width = 'auto'
      var 自0 = Math.round(卡.getBoundingClientRect().width)
      收起宽 = Math.max(168, Math.min(300, 自0))
      var 右0 = 卡.getBoundingClientRect().right
      var 上0 = 卡.getBoundingClientRect().top
      卡.style.width = 收起宽 + 'px'
      var 位0 = 夹位置(右0 - 收起宽, 上0, window.innerWidth, window.innerHeight, 收起宽, 卡.offsetHeight)
      卡.style.left = 位0.left + 'px'
      卡.style.top = 位0.top + 'px'
    }

    var 拖 = null
    卡.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.ep-refresh') || e.target.closest('button') || e.target.closest('i')) return
      if (!e.target.closest('.ep-head')) return
      拖 = { x: e.clientX, y: e.clientY, moved: false, l: 卡.getBoundingClientRect().left, t: 卡.getBoundingClientRect().top }
      卡.setPointerCapture(e.pointerId)
    })
    卡.addEventListener('pointermove', function (e) {
      if (!拖) return
      var dx = e.clientX - 拖.x
      var dy = e.clientY - 拖.y
      if (!拖.moved && Math.abs(dx) + Math.abs(dy) < 4) return
      拖.moved = true
      var 位 = 夹位置(拖.l + dx, 拖.t + dy, window.innerWidth, window.innerHeight, 卡.offsetWidth, 卡.offsetHeight)
      卡.style.left = 位.left + 'px'
      卡.style.top = 位.top + 'px'
      卡.setAttribute('data-pos', 位.left + ',' + 位.top)
      卡.style.right = 'auto'
      卡.style.bottom = 'auto'
    })
    卡.addEventListener('pointerup', function (e) {
      if (!拖) return
      var 移动过 = 拖.moved
      拖 = null
      try { 卡.releasePointerCapture(e.pointerId) } catch (err) { /* ignore */ }
      if (移动过) {
        重画组()
        var r = 卡.getBoundingClientRect()
        存位置({ left: r.left, top: r.top }, 展开宽, 记忆高)
      } else if (!缩) {
        切换收起(!收起)
        卡.classList.toggle('open', !收起)
        if (!收起) { 强制刷 = true; 载('结', false); 载('事件', false); 换页(页); 立即刷() }
      }
    })

    var 缩 = null
    var 抓 = 卡.querySelector('.ep-grip')
    if (抓) {
      抓.addEventListener('pointerdown', function (e) {
        e.stopPropagation()
        var r = 卡.getBoundingClientRect()
        缩 = { x: e.clientX, y: e.clientY, w: r.width, h: r.height, l: r.left, t: r.top }
        try { 抓.setPointerCapture(e.pointerId) } catch (err) { /* ignore */ }
      })
      抓.addEventListener('pointermove', function (e) {
        if (!缩) return
        e.stopPropagation()
        var 尺 = 夹尺寸(缩.w + (e.clientX - 缩.x), 缩.h + (e.clientY - 缩.y))
        应用尺寸(尺.宽, 尺.高)
        重排高度()
        排重画轨迹()
      })
      抓.addEventListener('pointerup', function (e) {
        if (!缩) return
        e.stopPropagation()
        var r = 卡.getBoundingClientRect()
        var 位 = 夹位置(缩.l, 缩.t, window.innerWidth, window.innerHeight, r.width, r.height)
        卡.style.left = 位.left + 'px'
        卡.style.top = 位.top + 'px'
        卡.style.right = 'auto'
        卡.style.bottom = 'auto'
        存位置(位, r.width, r.height)
        缩 = null
        立即重画轨迹()
        立即刷()
      })
      抓.addEventListener('dblclick', function (e) {
        e.stopPropagation()
        应用尺寸(默认宽, 默认高)
        var r = 卡.getBoundingClientRect()
        存位置({ left: r.left, top: r.top }, 默认宽, 默认高)
      })
    }

    卡.querySelector('.ep-refresh').addEventListener('click', function (e) {
      e.stopPropagation()
      重载脚本()
    })
    卡.querySelector('#cands').addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button') : null
      if (!b) return
      var row = b.closest('.ep-cd')
      if (!row) return
      var 格 = String(row.getAttribute('data-grid') || '').split(',')
      var 点 = { E: Number(格[0]) || 0, S: Number(格[1]) || 0, P: Number(格[2]) || 0 }
      b.disabled = true
      if (b.getAttribute('data-drop') != null) {
        送POST('/dsh-emotion-pool/tpl/drop', 点).then(function (o) {
          if (!o.ok) 卡.querySelector('#tplhead').textContent = '丢弃失败：' + (o.error || o.__码)
          画待确认(true)
        }).catch(function () { 画待确认(true) })
      } else {
        var 输 = row.querySelector('.ep-namein')
        var 名 = String((输 && 输.value) || '').trim()
        if (!名) { b.disabled = false; 卡.querySelector('#tplhead').textContent = '先给这条起个名'; return }
        送POST('/dsh-emotion-pool/tpl/confirm', { 名: 名, 待命名: 点 }).then(function (o) {
          if (!o.ok) 卡.querySelector('#tplhead').textContent = '收录失败：' + (o.error || o.__码)
          画待确认(true)
        }).catch(function () { 画待确认(true) })
      }
    })
    卡.querySelector('#tpls').addEventListener('click', function (e) {
      var r = e.target.closest ? e.target.closest('.ep-rn') : null
      if (!r || r.dataset.编辑) return
      var 旧 = r.getAttribute('data-rn')
      r.dataset.编辑 = '1'
      var 输 = document.createElement('input')
      输.value = 旧
      输.style.cssText = 'width:80px;background:#11141c;color:#dfe4f1;border:1px solid #2b3346;border-radius:4px;font:inherit;font-size:11px'
      r.replaceWith(输)
      输.focus()
      输.select()
      输.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') { var 新 = String(输.value || '').trim(); 送POST('/dsh-emotion-pool/tpl/rename', { 旧: 旧, 新: 新 }).then(function (o) { if (!o.ok) 卡.querySelector('#tplhead').textContent = '改名失败：' + (o.error || o.__码); 画待确认(true) }) }
        if (ev.key === 'Escape') 画待确认(true)
      })
      输.addEventListener('blur', function () { 画待确认(true) })
    })
    卡.querySelector('#tplfold').addEventListener('click', function () {
      var t = 卡.querySelector('#tpls')
      var 开 = t.style.display !== 'none'
      t.style.display = 开 ? 'none' : 'block'
      var 标 = 卡.querySelector('.ep-tplar'); if (标) 标.textContent = 开 ? '▸ 展开' : '▾ 收起'
      try { localStorage.setItem('ep-tpl-open', 开 ? '0' : '1') } catch (e) {}
    })
    卡.querySelectorAll('.ep-arrow').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation()
        换页(页 + Number(b.getAttribute('data-dir')), true)
      })
    })
    卡.querySelectorAll('.ep-dots i').forEach(function (d) {
      d.addEventListener('click', function (e) {
        e.stopPropagation()
        换页(Number(d.getAttribute('data-page')), true)
      })
    })
    卡.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('.ep-gl') : null
      if (!t) return
      var k = t.getAttribute('data-gl')
      var arr = 隐线()
      var i = arr.indexOf(k)
      if (i >= 0) arr.splice(i, 1); else arr.push(k)
      try { localStorage.setItem('组线', JSON.stringify(arr)) } catch (err) {}
      if (最近组状态) 画组(最近组状态)
      e.stopPropagation()
    })
    卡.querySelector('#事件会话').addEventListener('click', function (e) {
      var b = e.target.closest('[data-sess]')
      if (!b) return
      var v = b.getAttribute('data-sess') || ''
      if (v === 列表会话) return
      列表会话 = v
      事件数据 = []
      事件总 = 0
      画会话签()
      载('事件', false)
    })
    // 2026-11-16（第 4 项）：滚轮后同步跟徽与「已离开最新」提示，不重画卡片
  function 跟徽刷新(gi2, 图) {
    var f = 卡 && 卡.querySelector('.ep-follow')
    if (f) f.style.display = 图 && 图.跟徽显 ? 'block' : 'none'
    补文案()
  }
  卡.addEventListener('wheel', function (e) {
      var g = e.target && e.target.closest ? e.target.closest('.ep-gwrap') : null
      if (!g) return
      e.preventDefault()
      var t0p = performance.now()
      var gi2 = Number(g.getAttribute('data-gi')) || 0
      var 图 = 组图[gi2]
      if (!图 || !图.板) return
      var 步数 = e.deltaY > 0 ? 3 : -3
      var 最大 = Math.max(0, 图.曲宽 - 图.视宽)
      var 偏 = Math.max(0, Math.min(最大, (Number(组窗[gi2]) || 0) + 步数 * 图.step))
      组窗[gi2] = 偏
      图.板.setAttribute('transform', 'translate(' + (-偏) + ',0)')
      图.off = 偏
      if (图.几何) 图.几何.偏移 = 偏
      图.脏 = true
      组跟[gi2] = 偏 >= 最大 - 1
      图.跟徽显 = !组跟[gi2]
      // 2026-11-16（第 4 项）：滚轮只改 transform，不再延时整卡重画；跟徽与位移文案交给 跟徽刷新()
      跟徽刷新(gi2, 图)
      var 耗 = performance.now() - t0p
      window.__epWheelMs = (window.__epWheelMs || []); window.__epWheelMs.push(耗)
      if (window.__epWheelMs.length > 20) window.__epWheelMs.shift()
      if (window.__epWheelMs.length % 10 === 0) 发轮性能(window.__epWheelMs.slice(-10))
    }, { passive: false })
    卡.querySelectorAll('[data-more]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation()
        载(b.getAttribute('data-more'), true)
      })
    })
    卡.querySelectorAll('[data-fold]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation()
        var k = b.getAttribute('data-fold')
        if (k === '结') 展开结 = !展开结
        else 展开事件 = !展开事件
        应用折叠(k)
      })
    })
    var 结滚 = 卡.querySelector('.ep-spikes')
    if (结滚) 结滚.addEventListener('scroll', function (e) {
      if (e.target.scrollTop <= 6 && 结数据.length < 结总) 载('结', true)
    })
    卡.querySelector('.ep-events').addEventListener('scroll', function (e) {
      if (e.target.scrollTop <= 6 && 事件数据.length < 事件总) 载('事件', true)
    })

    var 观盒 = 卡.querySelector('.ep-obs')
    if (观盒) 观盒.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('[data-obs]') : null
      if (t) { 观测会话 = t.getAttribute('data-obs'); if (最后观测) 画观测(最后观测) }
    })
    if (window.__epRestore) {
      var 快 = window.__epRestore
      window.__epRestore = null
      恢复(快)
    } else {
      刷()
    }
    ;(function 定默认页() {
      try { if (localStorage.getItem('ep-page-manual')) return } catch (e) { return }
      fetch('/dsh-emotion-pool/settings', { cache: 'no-store' })
        .then(function (r) { return r.json() })
        .then(function (o) {
          var 项 = (o && o.组 || []).filter(function (z) { return z.键 === '默认页' })[0]
          var n = 项 ? Number(项.值) : 0
          if (n >= 0 && n <= 4) 换页(n, false)
        })
        .catch(function () {})
    })()
    window.addEventListener('resize', function () {
      try {
        var r = 卡.getBoundingClientRect()
        应用尺寸(卡.offsetWidth, 收起 ? 记忆高 : 卡.offsetHeight)
        var r2 = 卡.getBoundingClientRect()
        var 位 = 夹位置(r2.left, r2.top, window.innerWidth, window.innerHeight, r2.width, r2.height)
        卡.style.left = 位.left + 'px'
        卡.style.top = 位.top + 'px'
        卡.setAttribute('data-pos', 位.left + ',' + 位.top)
        重排高度()
        立即重画轨迹()
        立即刷()
        存位置(位, 展开宽, 记忆高)
        重画组()
      } catch (e) { /* ignore */ }
    })
    try {
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(function () {
          if (!收起) return
          var 旧 = 收起宽
          卡.style.width = 'auto'
          var 新 = Math.round(卡.getBoundingClientRect().width)
          收起宽 = Math.max(168, Math.min(300, 新))
          if (Math.abs(新 - 旧) > 2) 卡.style.width = 收起宽 + 'px'
          else 卡.style.width = 旧 + 'px'
        })
      }
    } catch (e) { /* ignore */ }
    setInterval(刷, 15000)
    try {
      var 流 = new EventSource('/dsh-emotion-pool/stream')
      流.onmessage = function () { 刷(); 保位刷新('结'); 保位刷新('事件') }
    } catch (e) { /* 不支持 EventSource 时只靠 5 秒兜底 */ }
  }

  function 换页(n, 手) {
    if (!卡) return
    测开始('翻页' + n)
    if (刷钟) { clearTimeout(刷钟); 刷钟 = null; 立即刷() }
    if (手) { try { localStorage.setItem('ep-page-manual', '1') } catch (e) {} }
    var 总页 = 卡.classList.contains('empty') ? 1 : Math.max(1, 卡.querySelectorAll('.ep-page').length)
    页 = (n + 总页) % 总页
    // 2026-11-16（第 5 项）：一切页就离开「最新」，跟徽必须立刻消失，不许留到下一页
    if (页 !== 0) {
      if (跟徽) 跟徽.style.display = 'none'
      for (var gq = 0; gq < 组图.length; gq++) if (组图[gq]) 组图[gq].跟徽显 = false
    }
    卡.querySelectorAll('.ep-page').forEach(function (p) { p.classList.toggle('on', Number(p.getAttribute('data-page')) === 页) })
    卡.querySelectorAll('.ep-dots i').forEach(function (d) { d.classList.toggle('on', Number(d.getAttribute('data-page')) === 页) })
  var 活页 = 卡.querySelector('.ep-page.on')
  if (活页) 活页.scrollTop = 0
  var 外滚 = 卡.querySelector('.ep-pages')
  if (外滚) 外滚.scrollTop = 0
    var 题 = 卡.querySelector('.ep-pagetitle')
    if (题) 题.textContent = ['三轴', '本轮观测', '事件', '情绪待命名确认页', '设置'][页] || '三轴'
    if (页 === 1) 画观测(最新)
  if (页 === 3) 画待确认(true)
    if (页 === 2) { if (!事件数据.length) 载('事件', false); 画事件() }
    if (页 === 4) 载设置()
    if (页 === 0) 画轨迹(最新)
    if (页 === 0) 重画组()
    setTimeout(function () { 测段('首次布局'); 测结束() }, 0)
  }

  function 应用折叠(kind) {
    if (!卡) return
    var 开 = kind === '结' ? 展开结 : 展开事件
    var 盒 = 卡.querySelector(kind === '结' ? '.ep-spikes' : '.ep-events')
    if (盒) { 盒.classList.toggle('ep-all', 开); 盒.classList.toggle('full', 开) }
    var b = 卡.querySelector('[data-fold="' + kind + '"]')
    if (b) b.textContent = 开 ? '收起' : '展开'
  }

  function 快照() {
    var 结盒 = 卡 && 卡.querySelector('.ep-spikes')
    var 事盒 = 卡 && 卡.querySelector('.ep-events')
    return {
      open: !!(卡 && 卡.classList.contains('open')),
      页: 页,
      结开: 展开结,
      事开: 展开事件,
      结: { len: 结数据.length, scroll: 结盒 ? 结盒.scrollTop : 0 },
      事件: { len: 事件数据.length, scroll: 事盒 ? 事盒.scrollTop : 0 }
    }
  }
  function 恢复(快) {
    if (!快) { 刷(); return }
    卡.classList.toggle('open', !!快.open)
    展开结 = !!快.结开
    展开事件 = !!快.事开
    应用折叠('结'); 应用折叠('事件')
    刷()
    换页(Math.min(4, Math.max(0, Number(快.页) || 0)))
    if (快.结.len) 载('结', false, 快.结.len, function () { var b = 卡.querySelector('.ep-spikes'); if (b) b.scrollTop = 快.结.scroll })
    if (快.事件.len) 载('事件', false, 快.事件.len, function () { var b = 卡.querySelector('.ep-events'); if (b) b.scrollTop = 快.事件.scroll })
  }

  function 拆() {
    try { var c = document.querySelector('.ep-card'); if (c && c.parentNode) c.parentNode.removeChild(c) } catch (e) { /* ignore */ }
    try { var s = document.getElementById('ep-style'); if (s && s.parentNode) s.parentNode.removeChild(s) } catch (e) { /* ignore */ }
  }
  function 重载脚本() {
    var 快 = 快照()
    刷()
    fetch('/dsh-emotion-pool/widget.js?reload=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.text() })
      .then(function (t) {
        try {
          window.__epRestore = 快
          拆()
          window.__emotionPoolWidget = false
          new Function(t)()
        } catch (e) { /* 失败就保留旧卡片（已先刷过数据） */ }
      })
      .catch(function () { /* 离线时保持原样 */ })
  }


  var 视觉 = { 曲线速度: 40, 动画时长: 420, 缓动强度: 2, 蓝收缩时长: 600 }
  function 设置视觉() { return 视觉 }
  var 轴旧 = {}, 上次显 = {}
  var 轴动 = {}
  function 置绿(row, x) {
    var g = row.querySelector('.ep-green')
    if (!g) return
    // 2026-11-16 18:3x（第 3 项）：条从「基点」长到「当前值」；基点在 0 时就是 0→值。
    var b = Number(row.getAttribute('data-base')) || 0
    var 宽 = Math.abs(x - b) * 50
    g.style.left = (50 + Math.min(x, b) * 50) + '%'
    g.style.width = 宽 + '%'
    g.classList.toggle('neg', x < b)
  }
  function 置蓝(row, 起x, 宽x) {
    var b = row.querySelector('.ep-blu')
    if (!b) return
    if (宽x <= 0.0002) { b.style.display = 'none'; return }
    b.style.display = 'block'
    b.style.left = (50 + Math.min(起x, 起x + 宽x) * 50) + '%'
    b.style.width = Math.abs(宽x) * 50 + '%'
  }
  function 走动画(k, row, 从, 到) {
    if (轴动[k]) return
    轴动[k] = true
    try { window.__g动画 = (window.__g动画 || 0) + 1 } catch (_) {}
    if (Math.abs(到 - 从) < 0.001) { 轴动[k] = false; return }
    var 时 = Math.max(1, Number(设置视觉().动画时长) || 420)
    var 强 = Math.max(1, Number(设置视觉().缓动强度) || 2)
    var 收 = Math.max(0, Number(设置视觉().蓝收缩时长) || 600)
    var 起时 = performance.now()
    function 帧(t) {
      var p = Math.min(1, (t - 起时) / 时)
      var e = p < 0.5 ? Math.pow(2 * p, 强) / 2 : 1 - Math.pow(2 * (1 - p), 强) / 2
      var x = 从 + (到 - 从) * e
      置绿(row, x)
      置蓝(row, 从, x - 从)
      if (p < 1) { requestAnimationFrame(帧); return }
      置绿(row, 到)
      var 起2 = performance.now()
      function 帧2(t2) {
        var q = Math.min(1, (t2 - 起2) / Math.max(1, 收))
        var w = (到 - 从) * (1 - q)
        置蓝(row, 到, w)
        if (q < 1) { requestAnimationFrame(帧2); return }
        var b = row.querySelector('.ep-blu'); if (b) b.style.display = 'none'
        轴动[k] = false
        轴旧[k] = 到
      }
      requestAnimationFrame(帧2)
    }
    requestAnimationFrame(帧)
  }
  // 2026-11-16（治理）：画面与命中共用同一个几何对象——点列只在这里算一次，
  // path / 折点圆点 / 悬停命中都读它，别处不许再出现 34 或第二份 y 公式。
  function 算几何(点s, 偏, 步宽, 左, H, 低, 高, 轴s) {
    var 步 = Math.max(1, Number(步宽) || 1)
    var 高N = Number(高), 低N = Number(低)
    var 位 = function (v) { return (高N - Math.max(低N, Math.min(高N, Number(v) || 0))) / (高N - 低N) * (H - 8) + 4 }
    var 点列 = []
    for (var i = 0; i < 点s.length; i++) {
      var p = 点s[i] || {}
      for (var k = 0; k < 轴s.length; k++) {
        var ax = 轴s[k]
        点列.push({ i: i, k: ax, x: 左 + i * 步, 屏x: 左 + i * 步 - 偏, y: 位(p[ax]) })
      }
    }
    return {
      左: 左, 步: 步, 偏移: 偏, 点列: 点列, 位: 位, 总点数: 点s.length,
      x: function (i) { return 左 + i * 步 },
      y: 位
    }
  }
  function 最近点(几何, vx, vy, 比W, 比H, 阈, 隐) {
    var 列 = (几何 && 几何.点列) || []
    // 2026-11-16 18:3x：平移只改 偏移，命中每次按当前 偏移 换算屏幕 x——
    // 不许在点列里缓存「带偏移的 x」，否则一滚轮就与画面错位。
    var 偏 = Number(几何 && 几何.偏移) || 0
    var 最 = null
    for (var i = 0; i < 列.length; i++) {
      var q = 列[i]
      if (隐 && 隐.indexOf(q.k) >= 0) continue
      var dx = (q.x - 偏 - vx) * 比W, dy = (q.y - vy) * 比H
      var d = Math.sqrt(dx * dx + dy * dy)
      if (!最 || d < 最.d) 最 = { i: q.i, k: q.k, x: q.x, 屏x: q.x - 偏, y: q.y, d: d }
    }
    if (!最 || (阈 != null && 最.d > 阈)) return null
    return 最
  }
  try { window.__ep算几何 = 算几何; window.__ep最近点 = 最近点 } catch (eH) { /* test hooks */ }

  function 挂悬停(sv, gi, 单点组) {
    var 点s = 组点[gi], 图 = 组图[gi]
    if (!sv || !点s || !点s.length || !图) return
    function 取几何() { return (图 && 图.几何) || sv.__geo || null }
    // 2026-11-16（治理）：命中不再自己推公式，直接读 算几何 的点列（唯一来源）。
    var 上次键 = ''
    function 清() {
      if (浮层) 浮层.style.display = 'none'
      var d = 卡 && 卡.querySelector('.ep-hdot'); if (d) d.remove()
      if (sv) {
        var ls = sv.querySelectorAll('polyline[data-line]')
        for (var q = 0; q < ls.length; q++) { ls[q].setAttribute('stroke-width', '1.2'); ls[q].setAttribute('opacity', '1') }
        var ds = sv.querySelectorAll('.ep-dot.on')
        for (var dq0 = 0; dq0 < ds.length; dq0++) ds[dq0].setAttribute('class', 'ep-dot')
      }
      上次键 = ''
    }
    sv.addEventListener('mousemove', function (e) {
      var r = sv.getBoundingClientRect()
      var geo = 取几何()
      if (!geo) return
      var vx = (e.clientX - r.left) / Math.max(1, r.width) * 图.W
      var vy = (e.clientY - r.top) / Math.max(1, r.height) * 图.H
      var 比W = r.width / Math.max(1, 图.W), 比H = r.height / Math.max(1, 图.H)
      var 命 = 最近点(geo, vx, vy, 比W, 比H, 10, 隐线())
      var 像素 = 命 ? 命.d : 1e9
      var 调 = 卡 && 卡.querySelector('.ep-dbg')
      if (调) 调.textContent = 命 ? ('i=' + 命.i + ' ' + 命.k + ' ' + 像素.toFixed(1) + 'px 步=' + geo.步.toFixed(1) + ' 偏=' + Math.round(geo.偏移)) : '未命中'
      if (!命 || 像素 > 10) { 清(); return }
      var idx = 命.i, 轴选 = 命.k, p = 点s[idx] || {}
      if (idx + '|' + 轴选 === 上次键 && 浮层 && 浮层.style.display === 'block') return
      上次键 = idx + '|' + 轴选
      var 注 = String(p.note || '').trim()
      var 段文 = (p.段 != null ? '第 ' + p.段 + ' 段' : '第 ' + (idx + 1) + ' 段')
      if (p.文件轮 != null) 段文 += '（第 ' + p.文件轮 + ' 轮）'
      if (单点组 && idx === 点s.length - 1) 段文 += ' · 单点段（本轮思考不足两段）'
      var 读 = []
      for (var jj = 0; jj < 轴们.length; jj++) {
        var k2 = 轴们[jj]
        var vv = 三位(Number(p[k2]) || 0)
        读.push(k2 === 轴选 ? '<b>' + k2 + ' ' + vv + '</b>' : k2 + ' ' + vv)
      }
      var 原话 = String(p.原话 || '').trim()
      var d0 = 卡.getBoundingClientRect()
      var 文 = '<div>' + 转义(时钟(p.t) + (注 ? ' · ' + 注 : '')) + '</div>' +
        '<div class="ep-hseg">' + 转义(段文) + '</div>' +
        '<div>' + 读.join('　') + '</div>' +
        (原话 ? '<div class="ep-hq">' + 转义(原话) + '</div>' : '')
      if (!浮层) return
      浮层.innerHTML = 文
      浮层.style.maxWidth = Math.max(160, d0.width - 24) + 'px'
      浮层.style.display = 'block'
      var bw = 浮层.offsetWidth, bh = 浮层.offsetHeight
      var cx = r.left - d0.left + 命.屏x / 图.W * r.width
      var cy = r.top - d0.top + 命.y / 图.H * r.height
      var lx = cx + 12
      if (lx + bw > d0.width - 8) lx = Math.max(4, cx - bw - 12)
      浮层.style.left = Math.min(d0.width - bw - 8, Math.max(4, lx)) + 'px'
      浮层.style.top = Math.min(d0.height - bh - 8, Math.max(4, cy - bh - 10)) + 'px'
      var 旧 = 卡.querySelector('.ep-hdot'); if (旧) 旧.remove()
      var ns = 'http' + '://www.w3.org/2000/svg'
      var c = document.createElementNS(ns, 'circle')
      c.setAttribute('class', 'ep-hdot'); c.setAttribute('cx', String(命.x)); c.setAttribute('cy', String(命.y))
      c.setAttribute('r', '3.2'); c.setAttribute('fill', '#fff'); c.setAttribute('opacity', '.9')
      ;(sv.querySelector('.ep-pan') || sv).appendChild(c)
      var 点们 = sv.querySelectorAll('.ep-dot')
      for (var dq = 0; dq < 点们.length; dq++) {
        var onD = 点们[dq].getAttribute('data-k') === 轴选 && Number(点们[dq].getAttribute('data-i')) === idx
        点们[dq].setAttribute('class', onD ? 'ep-dot on' : 'ep-dot')
      }
      var ls2 = sv.querySelectorAll('polyline[data-line]')
      for (var q2 = 0; q2 < ls2.length; q2++) {
        var on = ls2[q2].getAttribute('data-line') === 轴选
        ls2[q2].setAttribute('stroke-width', on ? '2' : '1.2')
        ls2[q2].setAttribute('opacity', on ? '1' : '.45')
      }
    })
    sv.addEventListener('mouseleave', 清)
  }
  function 发轮性能(样本) {
    try {
      var 均 = 样本.reduce(function (a, b) { return a + b }, 0) / Math.max(1, 样本.length)
      fetch('/dsh-emotion-pool/perf', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ 段: 'wheel', kind: 'wheel', 毫秒: Math.round(均 * 1000) / 1000, 条数: 样本.length, 页: '三轴', t: new Date().toISOString() }) }).catch(function () {})
    } catch (e) { /* ignore */ }
  }
  function 滑(板, 从, 到, 毫秒) {
    var 起 = performance.now(), 帧 = 0, 总帧 = 18
    function 步(now) {
      var p = Math.min(1, (now - 起) / 毫秒)
      var v = 从 + (到 - 从) * (1 - Math.pow(1 - p, 3))
      板.setAttribute('transform', 'translate(' + (-v) + ',0)')
      帧++
      if (p < 1 && 帧 < 总帧) requestAnimationFrame(步)
      else 板.setAttribute('transform', 'translate(' + (-到) + ',0)')
    }
    requestAnimationFrame(步)
  }
  try { if (window.__EPTEST) window.__ep滑 = 滑 } catch (e) { /* test hook */ }
  function 补文案() {
    if (!卡) return
    var 组 = (最新 && Array.isArray(最新.组) && 最新.组.length) ? 最新.组 : []
    var 选 = 组选(组.length || 1)
    var 图 = 组图[选]
    if (!图 || !图.脏) return
    图.脏 = false
    if (跟徽) 跟徽.style.display = 图.跟徽显 ? 'block' : 'none'
    var cap = 卡.querySelector('.ep-gcap')
    if (!cap) return
    if (!cap.getAttribute('data-base')) cap.setAttribute('data-base', cap.textContent)
    var 起 = Math.round((Number(图.off) || 0) / 图.step) + 1
    var 止 = Math.min(图.n, 起 + Math.round(图.视宽 / 图.step))
    cap.textContent = cap.getAttribute('data-base') + ' · 视窗 ' + 起 + '–' + 止
  }
  function 回最新() {
    var 组 = (最新 && Array.isArray(最新.组) && 最新.组.length) ? 最新.组 : []
    var 选 = 组选(组.length || 1)
    var 图 = 组图[选]
    if (!图) return
    var 最大 = Math.max(0, 图.曲宽 - 图.视宽)
    组跟[选] = true
    组窗[选] = 最大
    图.off = 最大
    图.跟徽显 = false
    var g = 卡 && 卡.querySelector('.ep-gwrap[data-gi="' + 选 + '"]')
    var 板 = g && g.querySelector('.ep-pan')
    if (板) 板.setAttribute('transform', 'translate(-' + 最大 + ',0)')
    if (跟徽) 跟徽.style.display = 'none'
  }
  function 画组(s) {
    var 盒 = 卡 && 卡.querySelector('.ep-gcards')
    if (!盒) return
    最近组状态 = s
    var 可见宽 = 盒.clientWidth
    if (可见宽 <= 0) { requestAnimationFrame(function () { 画组(s) }); return }
    var 组 = Array.isArray(s.组) && s.组.length ? s.组 : null
    if (!组) {
      var 签盒0 = 卡 && 卡.querySelector('.ep-gtabs')
      if (签盒0) 签盒0.innerHTML = ''
      盒.innerHTML = '<div class="ep-none">还没有池，去设置页建一个</div>'
      return
    }
    var 刻度0 = Number(s.刻度) || 1
    var 选 = 组选(组.length)
    var 隐 = 隐线()
    var 可用宽 = Math.max(120, Math.round(可见宽 - 20))
    var H = 130
    var 左 = 34 // 唯一来源：绘图左边界，path/圆点/命中/网格都用它
    var 签 = ''
    var 池名表 = (最新 && Array.isArray(最新.池列表)) ? 最新.池列表.map(function (x) { return String(x.池名 || x.名 || '') }).filter(Boolean) : []
    var 签组 = 池名表.length ? 池名表.map(function (n2) {
      for (var gq = 0; gq < 组.length; gq++) if (String(组[gq].名) === n2) return 组[gq]
      return { 名: n2, 空: true, 会话: [], 轴: { E: 0, S: 0, P: 0 } }
    }) : 组
    var 最名 = 0
    for (var tn = 0; tn < 签组.length; tn++) 最名 = Math.max(最名, String(签组[tn].名 || '').length)
    var 签宽 = Math.max(44, Math.round(最名 * 12 + 18))
    for (var ti = 0; ti < 签组.length; ti++) {
      签 += '<button type="button" class="ep-gtab' + (ti === 选 ? ' on' : '') + '" data-gtab="' + ti + '" style="min-width:' + 签宽 + 'px">' + 转义(签组[ti].名 || ('组' + (ti + 1))) + (签组[ti].空 ? '（无会话）' : '') + '</button>'
    }
    var 签盒 = 卡 && 卡.querySelector('.ep-gtabs')
    if (签盒) 签盒.innerHTML = 签
    var h = ''
    for (var gi = 选; gi < 选 + 1; gi++) {
      var g = 组[gi]
      var 轴 = g.轴 || {}
      var 前点0 = (Array.isArray(g.点) && g.点.length >= 2) ? g.点[g.点.length - 2] : null
      h += '<div class="ep-gcard" data-g="' + gi + '">'
      var 装们 = (Array.isArray(g.会话) ? g.会话 : []).map(function (x) { return (s.会话名 && s.会话名[x]) || String(x).slice(0, 8) })
      h += '<div class="ep-gcard-h"><b>' + 转义(g.名 || '') + '</b>' + (g.空 ? '<em class="ep-gunp">·无会话</em>' : '') + (g.轴来源 === '未推' ? '<em class="ep-gunp">·未推</em>' : (g.未推 ? '<em class="ep-gunp">·未推（沿用 ' + 转义(g.未推来源 || '快照') + '）</em>' : '')) + '<span title="' + 转义(g.命名注 || '') + '">' + 转义(g.命名 || '—') + '</span></div>'
      if (g.空) h += '<div class="ep-gcard-sub">无会话：0 / 0 / 0（空池排在页签最后）</div>'
      else if (装们.length) h += '<div class="ep-gcard-sub">装 ' + 装们.length + ' 间：' + 转义(装们.join('、')) + '</div>'
      for (var i = 0; i < 轴们.length; i++) {
        var k = 轴们[i]
        var v = Number(轴[k]) || 0
        var 基值 = Number(g.零点 && g.零点[k]) || 0
        var x = Math.max(-1, Math.min(1, v / (刻度0 || 1)))
        var 基x = Math.max(-1, Math.min(1, 基值 / (刻度0 || 1)))
        // 2026-11-16 18:3x（第 3 项）：绿条 = 从「基点」画到「当前值」，不再从 0 起。
        var 条左 = Math.min(x, 基x), 条宽 = Math.abs(x - 基x) * 50
        var 类 = x > 基x + 0.0001 ? 'pos' : x < 基x - 0.0001 ? 'neg' : 'zero'
        h += '<div class="ep-gcard-row" data-k="' + k + '" data-base="' + 基x + '"><span class="ep-gcard-k">' + k + '</span>' +
          '<div class="ep-gcard-track"><i class="ep-c" style="position:absolute;left:50%;top:0;bottom:0;width:1px;background:#3a4256"></i>' +
          '<i class="ep-blu" style="display:none"></i>' +
          '<i class="ep-gzero" style="left:' + (50 + 基x * 50) + '%"></i>' +
          '<i class="ep-green ep-gcard-fill ' + 类 + (g.轴来源 === '未推' ? ' unpushed' : '') + '" style="left:' + (50 + 条左 * 50) + '%;width:' + 条宽 + '%"></i></div>' +
          '<span class="ep-gcard-vwrap"><span class="ep-gcard-v">' + (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2) + (g.轴来源 === '未推' ? '·' : '') + '</span>' +
          (Math.abs(基值) >= 0.005 ? '<span class="ep-base">基 ' + (基值 >= 0 ? '+' : '−') + Math.abs(基值).toFixed(2) + '</span>' : '') +
          (k === 'P' && g.敏感 ? '<span class="ep-base">爽 s' + Number(g.敏感.爽.s || 1).toFixed(2) + ' a' + Number(g.敏感.爽.a || 1).toFixed(2) + ' · 痛 s' + Number(g.敏感.痛.s || 1).toFixed(2) + ' a' + Number(g.敏感.痛.a || 1).toFixed(2) + '</span>' : '') + '</span></div>'
      }
      var 全点 = Array.isArray(g.点) ? g.点 : []
      var 点s = 全点.slice(-200)
      组总[gi] = 全点.length
      var 视宽 = Math.max(40, 可用宽 - 左 - 4)
      // 视口正好 30 个点：步长 = 视宽 / 30
      var 步宽 = Math.max(2, 视宽 / 30)
      var 曲宽 = Math.max(1, (点s.length - 1) * 步宽)
      var 最大偏 = Math.max(0, 曲宽 - 视宽)
      var 偏
      if (组跟[gi] !== false) 偏 = 最大偏
      else 偏 = Math.max(0, Math.min(最大偏, Number(组窗[gi]) || 0))
      if (偏 >= 最大偏 - 1) 组跟[gi] = true
      组窗[gi] = 偏
      if (跟徽) 跟徽.style.display = 组跟[gi] ? 'none' : 'block'
      组前点[gi] = 点s.length >= 2 ? 点s[点s.length - 2] : null
      组点[gi] = 点s
      var W = 可用宽
      组图[gi] = { W: W, H: H }
      var 三色 = ['#5aa9ff', '#59d6b4', '#e0b15a']
      var 图例 = '<div class="ep-glegend" style="display:flex;flex-direction:row;justify-content:flex-end;gap:8px">'
      for (var li0 = 0; li0 < 轴们.length; li0++) 图例 += '<span class="ep-gl' + (隐.indexOf(轴们[li0]) >= 0 ? '' : ' on') + '" data-gl="' + 轴们[li0] + '" style="color:' + 三色[li0] + '">' + 轴们[li0] + '</span>'
      var 范围 = (function () {
        var lo = Infinity, hi = -Infinity
        for (var ai0 = 0; ai0 < 轴们.length; ai0++) {
          if (隐.indexOf(轴们[ai0]) >= 0) continue
          var 起i = Math.max(0, Math.round(偏 / 步宽))
          var 止i = Math.min(点s.length - 1, 起i + 30)
          for (var pi0 = 起i; pi0 <= 止i; pi0++) {
            var vv0 = Number(点s[pi0][轴们[ai0]]) || 0
            if (vv0 < lo) lo = vv0
            if (vv0 > hi) hi = vv0
          }
        }
        if (!isFinite(lo) || !isFinite(hi)) return { lo: -1, hi: 1 }
        var 低0 = Math.min(0, lo), 高0 = Math.max(0, hi)
        // 上下对称取整：保证五条线等距，标签与 y 一一对应
        var 极 = Math.max(0.1, Math.abs(低0), Math.abs(高0))
        极 = Math.ceil(极 * 10) / 10
        return { lo: -极, hi: 极 }
      })()
      var 低 = 范围.lo, 高 = 范围.hi
      var 旧偏0 = 组图[gi] ? 组图[gi].off : null
      组图[gi] = { W: 可用宽, H: H, lo: 低, hi: 高, n: 点s.length, step: 步宽, 曲宽: 曲宽, 视宽: 视宽, off: 偏, 脏: false, 跟徽显: false, 板: null }
      var 几何 = 算几何(点s, 偏, 步宽, 左, H, 低, 高, 轴们)
      var 位 = 几何.位
      var 三色 = ['#5aa9ff', '#59d6b4', '#e0b15a']
      var 图例 = '<div class="ep-glegend" style="display:flex;flex-direction:row;justify-content:flex-end;gap:8px">'
      for (var li0 = 0; li0 < 轴们.length; li0++) 图例 += '<span class="ep-gl' + (隐.indexOf(轴们[li0]) >= 0 ? '' : ' on') + '" data-gl="' + 轴们[li0] + '" style="color:' + 三色[li0] + '">' + 轴们[li0] + '</span>'
      图例 += '</div>'
      h += 图例
      if (点s.length >= 2) {
        var pp = ''
        var 点标 = ''
        var 段线 = ''
        for (var si = 1; si < 点s.length; si++) {
          var 前1 = 点s[si - 1] || {}, 今1 = 点s[si] || {}
          if ((今1.文件轮 != null && 前1.文件轮 != null && 今1.文件轮 !== 前1.文件轮) || (今1.段 != null && 前1.段 != null && 今1.段 !== 前1.段)) {
             var xs1 = 几何.x(si)
            段线 += '<line x1="' + xs1.toFixed(1) + '" y1="4" x2="' + xs1.toFixed(1) + '" y2="' + (H - 4) + '" stroke="#3a4256" stroke-width="1" stroke-dasharray="2 3"/>'
          }
        }
        for (var ai = 0; ai < 轴们.length; ai++) {
          var kk = 轴们[ai]
          if (隐.indexOf(kk) >= 0) continue
          var pts = []
          var 末止 = (g.单点 && 点s.length >= 2) ? 点s.length - 1 : 点s.length
          for (var pi = 0; pi < 末止; pi++) pts.push(几何.x(pi).toFixed(1) + ',' + 几何.y(点s[pi][kk]).toFixed(1))
          pp += '<polyline data-line="' + kk + '" fill="none" stroke="' + 三色[ai] + '" stroke-width="1.2" points="' + pts.join(' ') + '"/>'
          if (点s.length <= 60) {
            for (var di = 0; di < 末止; di++) 点标 += '<circle class="ep-dot" data-k="' + kk + '" data-i="' + di + '" cx="' + 几何.x(di).toFixed(1) + '" cy="' + 几何.y(点s[di][kk]).toFixed(1) + '" r="2.4"/>'
          }
          if (g.单点 && 点s.length >= 2) {
            var xp = 几何.x(点s.length - 2)
            var xl = 几何.x(点s.length - 1)
            pp += '<line data-dash="' + kk + '" x1="' + xp.toFixed(1) + '" y1="' + 几何.y(点s[点s.length - 2][kk]).toFixed(1) + '" x2="' + xl.toFixed(1) + '" y2="' + 几何.y(点s[点s.length - 1][kk]).toFixed(1) + '" stroke="' + 三色[ai] + '" stroke-width="1.4" stroke-dasharray="4 3"/>'
          }
        }
        var 档们 = [高, 高 / 2, 0, 低 / 2, 低]
        var 去重 = []
        for (var q0 = 0; q0 < 档们.length; q0++) {
          var tv0 = 档们[q0]
          var 重 = false
          for (var q1 = 0; q1 < 去重.length; q1++) if (Math.abs(去重[q1] - tv0) < 0.005) 重 = true
          if (!重) 去重.push(tv0)
        }
        var 去文 = []
        for (var q2 = 0; q2 < 去重.length; q2++) {
          var 文2 = 刻值(去重[q2])
          if (去文.length && 去文[去文.length - 1].文 === 文2) continue
          去文.push({ 值: 去重[q2], 文: 文2 })
        }
        去重 = 去文.map(function (x) { return x.值 })
        var 网2 = ''
        for (var g3 = 0; g3 < 去重.length; g3++) {
          var yy3 = 位(去重[g3])
          var 零线 = Math.abs(去重[g3]) < 0.005
          网2 += '<line x1="' + 几何.左 + '" y1="' + yy3.toFixed(1) + '" x2="' + 可用宽 + '" y2="' + yy3.toFixed(1) + '" stroke="' + (零线 ? '#4a5570' : '#1c2130') + '" stroke-width="' + (零线 ? '1.5' : '1') + '"/>'
        }
        var 刻 = ''
        for (var tk0 = 0; tk0 < 去重.length; tk0++) {
          var tv = 去重[tk0]
          var yv = 位(tv)
          var 反 = 高 - (yv - 4) / (H - 8) * (高 - 低)
          刻 += '<span style="top:' + (yv / H * 100).toFixed(2) + '%">' + 刻值(反) + '</span>'
        }
        h += '<div class="ep-gwrap" data-gi="' + gi + '"><svg class="ep-gcard-svg" viewBox="0 0 ' + 可用宽 + ' ' + H + '" preserveAspectRatio="none" style="overflow:hidden">' + 网2 + '<g class="ep-pan" transform="translate(-' + 偏 + ',0)">' + 段线 + pp + 点标 + '</g></svg>' +
          '<div class="ep-gticks">' + 刻 + '</div></div>'
      } else {
        var 网 = ''
        for (var gi2 = 0; gi2 <= 4; gi2++) 网 += '<line x1="' + 左 + '" y1="' + (H * gi2 / 4) + '" x2="' + 可用宽 + '" y2="' + (H * gi2 / 4) + '" stroke="#1c2130" stroke-width="1"/>'
        h += '<div class="ep-gwrap" data-gi="' + gi + '"><svg class="ep-gcard-svg" viewBox="0 0 ' + 可用宽 + ' ' + H + '" preserveAspectRatio="none">' + 网 +
          '<text x="' + (可用宽 / 2) + '" y="' + (H / 2 + 3) + '" fill="#6c7488" font-size="10" text-anchor="middle">暂无曲线（该组还没有思考轨迹）</text></svg>' +
          '<div class="ep-gticks"><span>+1.0</span><span>+0.5</span><span>0</span><span>−0.5</span><span>−1.0</span></div></div>'
      }
      var tr = g.轨迹 || {}
      var 段数2 = 0, 上段 = null
      for (var sj = 0; sj < 点s.length; sj++) { var 段j = 点s[sj] && 点s[sj].段; if (段j != null && 段j !== 上段) { 段数2 += 1; 上段 = 段j } }
      var 段报 = tr.段 != null ? tr.段 : (段数2 || 点s.length || 0)
      h += '<div class="ep-gcap">第 ' + (tr.轮 != null ? tr.轮 : '—') + ' 轮 · ' + 段报 + ' 段 · ' + (tr.秒 != null ? tr.秒 : '—') + ' 秒 · E蓝 / S青 / P琥珀</div>'
      var ws = Array.isArray(g.波动) ? g.波动.slice(0, 3) : []
      if (!ws.length) h += '<div class="ep-gcard-wave" style="color:#6c7488">最近无波动</div>'
      for (var wi = 0; wi < ws.length; wi++) {
        var w = ws[wi]
        var 波名 = w.名 ? 转义(w.名) : '未命名'
        var 波因 = (String(w.注 || '').trim() || '—') + (String(w.依据 || '').trim() ? ' —— 因为' + 转义(w.依据) : '')
        var 波变 = 'E ' + 带号((w.delta || {}).E) + ' · S ' + 带号((w.delta || {}).S) + ' · P ' + 带号((w.delta || {}).P)
        h += '<div class="ep-gcard-wave"><i>' + 时钟(w.t) + '</i><b>' + 波名 + '</b>' + (w.为谁 ? ' · ' + 转义(w.为谁) : '') + (w.段 != null ? ' · 第' + w.段 + '段' : '') + '<div class="ep-wq">' + 波因 + '</div><div class="ep-wd">' + 波变 + '</div></div>'
      }
      h += '</div>'
    }
    盒.innerHTML = h
    var svgEl = 盒.querySelector('.ep-gwrap[data-gi="' + 选 + '"] .ep-gcard-svg') || 盒.querySelector('.ep-gcard-svg')
    var geo0 = null
    if (svgEl) {
      geo0 = 几何
      svgEl.__geo = geo0
      组图[选].图 = svgEl
      组图[选].geo = geo0
      组图[选].几何 = 几何
      window.__epGeo = geo0
    }
    try {
      // 2026-11-16（第 15 项）：几何数字只在 ?epdbg=1 时露出来，平时底栏只留版本/rev/条数
      var 调试态 = String(location.search || '').indexOf('epdbg=1') >= 0
      window.__epGeoText = 调试态 && geo0 ? ('窗' + Math.round(geo0.窗宽 / geo0.步) + ' 步' + geo0.步.toFixed(1) + ' 偏' + Math.round(geo0.偏移) + ' 总' + geo0.总点数) : ''
      var 脚 = 卡.querySelector('.ep-foot span:last-child')
      if (脚) 脚.textContent = 调试态 && window.__epGeoText ? String(脚.textContent).split(' · 窗')[0] + ' · ' + window.__epGeoText : String(脚.textContent).split(' · 窗')[0]
    } catch (eG) {}
    ;(function 缓存板() {
      var pad = 盒.querySelector('.ep-gwrap[data-gi="' + 选 + '"] .ep-pan') || 盒.querySelector('.ep-pan')
      if (!pad) return
      if (组跟[选] && 旧偏0 != null && Math.abs(旧偏0 - 偏) > 1) { if (组图[选].几何) 组图[选].几何.偏移 = 偏; 滑(pad, 旧偏0, 偏, 300) }
      else pad.setAttribute('transform', 'translate(' + (-偏) + ',0)')
      组图[选].板 = pad
    })()
    ;(function 记卡() {
      var cap = 盒.querySelector('.ep-gcap')
      组卡[选] = cap ? { cap: cap, 文: cap.textContent, 时: 0 } : null
    })()
    ;(function 摆条() {
      var 前 = 组前点[选], 现 = 组[选] || {}, 轴现 = 现.轴 || {}
      var 行们 = 盒.querySelectorAll('.ep-gcard-row')
      for (var ri = 0; ri < 行们.length; ri++) {
        var row = 行们[ri], kk2 = row.getAttribute('data-k'); if (!kk2) continue
        var zd = row.querySelector('.ep-gzero'); if (zd) zd.style.left = (50 + (Number(row.getAttribute('data-base')) || 0) * 50) + '%'
        var 到v = (Number(轴现[kk2]) || 0) / (刻度0 || 1)
        var 旧组 = 上次条显[选] || {}
        var 从v = 旧组[kk2] != null ? 旧组[kk2] : 到v
        if (旧组[kk2] == null || Math.abs(到v - 从v) < 0.001) { 置绿(row, 到v); var bb = row.querySelector('.ep-blu'); if (bb) bb.style.display = 'none' }
        else 走动画(kk2, row, 从v, 到v)
        上次条显[选] = 旧组; 旧组[kk2] = 到v
      }
    })()
    for (var ci = 0; ci < 盒.children.length; ci++) {
      var card0 = 盒.children[ci]
      var sv0 = card0 && card0.querySelector ? card0.querySelector('.ep-gcard-svg') : null
      if (sv0) 挂悬停(sv0, Number(card0.getAttribute('data-g')), !!g.单点)
    }
    if (签盒) {
      var 钮 = 签盒.querySelectorAll('[data-gtab]')
      for (var bi = 0; bi < 钮.length; bi++) {
        钮[bi].addEventListener('click', function (ev) {
          ev.stopPropagation()
          var n = Number(this.getAttribute('data-gtab')) || 0
          try { localStorage.setItem('组页', String(n)) } catch (e2) {}
          当前组 = n
          if (最近组状态) 画组(最近组状态)
        })
      }
    }
  }

  var 当前组 = -1
  function 组选(总) {
    if (当前组 < 0) {
      try { 当前组 = Number(localStorage.getItem('组页')) || 0 } catch (e) { 当前组 = 0 }
    }
    if (当前组 >= 总) 当前组 = 总 - 1
    if (当前组 < 0) 当前组 = 0
    return 当前组
  }

  function 重画组() { if (最近组状态) 画组(最近组状态) }

  function 画轴(s) {
    var 缩写 = ''
    刻度 = Number(s.刻度) || 1
    var 盒 = 卡.querySelector('.ep-bars')
    if (!盒) return
    if (!盒.dataset.搭) {
      盒.innerHTML = 轴们.map(function (k) {
        return '<div class="ep-row" data-k="' + k + '"><span class="ep-k">' + k + '</span>' +
          '<div class="ep-track"><i class="ep-c"></i><i class="ep-green"></i><i class="ep-blu" style="display:none"></i><i class="ep-zero-bar" style="display:none"></i><i class="ep-zdot" style="display:none"></i></div></div>' +
          '<div class="ep-sub" data-sub="' + k + '"><span class="ep-dir"></span><span class="ep-num"></span></div>'
      }).join('')
      盒.dataset.搭 = '1'
    }
    for (var i = 0; i < 轴们.length; i++) {
      var k = 轴们[i]
      var row = 盒.querySelector('[data-k="' + k + '"]')
      if (!row) continue
      var 坐 = (s.坐标向量 && s.坐标向量[k]) || null
      var v = 坐 && 坐.值 != null ? Number(坐.值) : (s.axes && s.axes[k] != null ? Number(s.axes[k]) : 0)
      var 溢 = 坐 && 坐.溢出 != null ? Number(坐.溢出) : 0
      缩写 += '<span class="ep-ax ' + (v > 0.05 ? 'pos' : v < -0.05 ? 'neg' : '') + '">' + k + 符号(v) + '</span>'
      var x = Math.max(-1, Math.min(1, v / (刻度 || 1)))
      var 零 = Number(s.零点 && s.零点[k]) / (刻度 || 1) || 0
      var zb = row.querySelector('.ep-zero-bar')
      if (zb) {
        if (Math.abs(零) > 1e-6) {
          var 零宽 = Math.abs(零) * 50
          zb.style.display = 'block'
          zb.style.left = (零 >= 0 ? 50 : 50 - 零宽) + '%'
          zb.style.width = 零宽 + '%'
          zb.title = '基础偏移（零点）' + (零 > 0 ? '+' : '−') + Math.abs(零).toFixed(2)
        } else zb.style.display = 'none'
      }
      var z = row.querySelector('.ep-zdot')
      if (z) {
        if (Math.abs(零) > 1e-6) { z.style.display = 'block'; z.style.left = (50 + 零 * 50) + '%'; z.title = '零点偏向' + (零 > 0 ? '正 ' : '负 ') + Math.abs(零).toFixed(2) }
        else z.style.display = 'none'
      }
      var 旧 = 轴旧[k]
      if (旧 == null) { 轴旧[k] = x; 置绿(row, x); 置蓝(row, x, 0) }
      else if (Math.abs(旧 - x) > 0.0005) 走动画(k, row, 旧, x)
      else 置绿(row, x)
      var 小 = 刻度 >= 100 ? 0 : 2
      var 显文 = (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(小)
      var 溢文2 = Math.abs(溢) > 0.0005 ? '<span class="ep-of">（溢出 ' + (溢 >= 0 ? '+' : '−') + Math.abs(溢).toFixed(小) + '）</span>' : ''
      var 上显 = 上次显[k]
      var 增 = 上显 == null ? null : (x - 上显) * 刻度
      var 阈 = 刻度 >= 100 ? 1 : 0.01
      var 增文 = (增 != null && Math.abs(增) >= 阈) ? ' <span class="ep-dlt">' + (增 > 0 ? '↑' : '↓') + Math.abs(增).toFixed(小) + '</span>' : ''
      var sub = 盒.querySelector('[data-sub="' + k + '"]')
      if (sub) {
        var 负 = k === 'E' ? '向我' : k === 'S' ? '不安' : '恐'
        var 正 = k === 'E' ? '向他' : k === 'S' ? '踏实' : '欲'
        var dir = sub.querySelector('.ep-dir')
        var num = sub.querySelector('.ep-num')
        if (dir) dir.textContent = '← ' + k + '− ' + 负 + ' ／ ' + k + '+ ' + 正 + ' →'
        if (num) {
          num.innerHTML = 显文 + 增文 + 溢文2
          if (k === 'P' && s.敏感适应) {
            var 敏 = (v >= 0 ? s.敏感适应['爽'] : s.敏感适应['痛']) || null
            if (敏) num.innerHTML += ' <span class="ep-of">敏感 ' + Number(敏.敏感).toFixed(2) + ' / 适应 ' + Number(敏.适应).toFixed(2) + '</span>'
          }
          num.title = '当前 ' + 显文 + (上显 == null ? '' : ' ｜ 上一轮 ' + ((上显 >= 0 ? '+' : '−') + Math.abs(上显 * 刻度).toFixed(小)) + ' ｜ Δ ' + (增 == null ? '—' : (增 >= 0 ? '+' : '−') + Math.abs(增).toFixed(小)))
        }
      }
      上次显[k] = x
    }
    轴条.innerHTML = 缩写
  }

  function 画波动(s) {
    var 盒 = 卡.querySelector('.ep-wave')
    if (!盒) return
    if (!盒) return
    var 波 = (s.轨迹 && Array.isArray(s.轨迹.波动) && s.轨迹.波动.length) ? s.轨迹.波动
      : (s.轨迹 && s.轨迹.最近 && Array.isArray(s.轨迹.最近.波动) ? s.轨迹.最近.波动 : [])
    if (!波.length) { 盒.innerHTML = '<div class="ep-none">本轮无波动</div>'; return }
    盒.innerHTML = 波.slice(-3).reverse().map(function (w) {
      return '<div class="ep-wrow"><span class="ep-wt">' + 时钟(w.t) + '</span>' +
        '<span class="ep-wv">' + 点串(w) + '</span>' +
        '<span class="ep-wn">' + 转义(w.注 || '') + (w.依据 ? '（' + 转义(w.依据) + '）' : '') + '</span></div>'
    }).join('')
  }

  function 点串(o) {
    if (!o) return '—'
    return 'E' + 两位(o.E || 0) + ' S' + 两位(o.S || 0) + ' P' + 两位(o.P || 0)
  }

  function 观测行(s, 表) {
    function 节(题, 行) {
      var h = '<div class="ep-h">' + 题 + '</div>'
      return h + 行.map(function (r) { return '<div class="obr"><span class="ok">' + r[0] + '</span><span class="ov">' + r[1] + '</span></div>' }).join('')
    }
    var 注 = (s && s.注入) || {}
    var 轨 = (s && s.轨迹) || {}
    var 近轨 = 轨.最近 || null
    var 首组 = (s && s.组 && s.组[0]) || null
    var 波 = (近轨 && 近轨.波动) || []
    var 末波 = 波.length ? 波[波.length - 1] : null
    var 推 = (s && s.上次推轴) || null
    var 双 = (s && s.双轨) || {}
    var 近 = 双.最近 || null
    var 裁 = (近 && 近.裁决度) || {}
    var 认 = (近 && 近.认知度) || {}
    var 曲 = (近 && 近.曲线) || null
    var 波动行 = [
      ['点数', String(波.length)],
      ['最后波动点', 末波 ? 点串(末波) : '—'],
      ['吸附系数 k', (注.吸附系数 != null ? 注.吸附系数 : (s && s.吸附系数)) != null ? Number(注.吸附系数 != null ? 注.吸附系数 : s.吸附系数).toFixed(2) : '—'],
      ['推前 → 推后', 推 ? 点串(推.前) + ' → ' + 点串(推.后) : '—'],
      ['本轮是否推轴', 注.本轮是否推轴 ? '推了' : '没推']
    ]
    var 轨迹行 = [
      ['段数', 近轨 && 近轨.段数 != null ? String(近轨.段数) : '—'],
      ['耗时', 近轨 && 近轨.秒 != null ? Number(近轨.秒).toFixed(1) + ' 秒' : '—'],
      ['点来源', 首组 && 首组.点来源 ? 首组.点来源 : (首组 ? (首组.点 && 首组.点.length ? '轨迹' : '空') : '—')]
    ]
    var 双轨行 = [
      ['裁决 K', (裁.我 != null ? Number(裁.我).toFixed(2) : '—') + ' / ' + (裁.它 != null ? Number(裁.它).toFixed(2) : '—')],
      ['认知度', (认.合成 != null ? Number(认.合成).toFixed(3) : '—') + (认.我 != null ? '（我 ' + Number(认.我).toFixed(2) + '）' : '')],
      ['采用', (近 && 近.采用) || '—'],
      ['转折对齐率', 曲 && 曲.对齐 != null ? Number(曲.对齐).toFixed(2) : (曲 && 曲.对齐率 != null ? Number(曲.对齐率).toFixed(2) : '—')],
      ['平均偏移', 曲 && 曲.偏移 != null ? Number(曲.偏移).toFixed(3) : (曲 && 曲.平均偏移 != null ? Number(曲.平均偏移).toFixed(3) : '—')]
    ]
    return { 对比: 节('波动', 波动行) + 节('轨迹', 轨迹行) + 节('双轨', 双轨行), 写入: '' }
  }
  try { window.__ep观测行 = 观测行 } catch (e) { /* ignore */ }

  var 观测会话 = ''
  var 最后观测 = null
  function 读观测折叠() {
    try { if (!localStorage.getItem('ep-obs-fold-cleared')) { localStorage.removeItem('ep-obs-fold'); localStorage.setItem('ep-obs-fold-cleared', '1') } } catch (e0) {}
    try { var o = JSON.parse(localStorage.getItem('ep-obs-fold') || '{}'); if (o && typeof o === 'object') return o } catch (e) {}
    return { 判定: true, 双轨: true, 敏感: false, 注入: false }
  }
  function 写观测折叠(o) { try { localStorage.setItem('ep-obs-fold', JSON.stringify(o)) } catch (e) {} }
  function 观名(k) {
    var 图 = window.__epNames || {}
    if (图 && typeof 图 === 'object' && typeof 图[k] === 'string' && 图[k]) return 图[k]
    return k === '8f689553' ? '小汐聊天间3' : k === '6a169bce' ? '策划间' : k === '3be73c36' ? '小汐工作间' : k
  }
  function 观行(标, 值, 提) {
    return '<div class="obr"><span class="ok" data-tip="' + 转义(提 || 标) + '">' + 转义(标) + ' <i class="ep-q">?</i></span><span class="ov">' + 转义(String(值)) + '</span></div>'
  }
  function 观组(名, 开, 体) {
    // 原生 details/summary：点击一定能展开，不依赖任何事件绑定
    return '<details class="ep-ogroup"' + (开 ? ' open' : '') + '><summary class="ep-oh ep-obs-head" data-og="' + 名 + '">' + 名 + '</summary><div class="ep-obody">' + 体 + '</div></details>'
  }
  function 画观测(s) {
    最后观测 = s
    var 盒 = 卡 && 卡.querySelector('.ep-obs')
    if (!盒) return
    var 装 = (Array.isArray(s && s.组) ? s.组 : []).reduce(function (a, g) { return a.concat((g && g.会话) || []) }, [])
    var 观 = Array.isArray(s && s.观测) ? s.观测.filter(function (o) { return !装.length || 装.indexOf(o.会话) >= 0 }) : []
    if (观.length && 观名(观[0].会话) === 观[0].会话 && !观测会话) 观测会话 = 观[0].会话
    var 有 = false
    for (var i = 0; i < 观.length; i++) if (观[i].会话 === 观测会话) 有 = true
    if (!有 && 观.length) 观测会话 = 观[0].会话
    var 现 = null
    for (var j = 0; j < 观.length; j++) if (观[j].会话 === 观测会话) 现 = 观[j]
    var 签 = '<div class="ep-htabs">'
    for (var k = 0; k < 观.length; k++) 签 += '<button class="ep-stab' + (观[k].会话 === 观测会话 ? ' on' : '') + '" type="button" data-obs="' + 转义(观[k].会话) + '">' + 转义(观名(观[k].会话)) + '</button>'
    签 += '</div>'
    if (!现) { 盒.innerHTML = 签 + '<div class="ep-none">还没有可显示的会话</div>'; return }
    var 折 = 读观测折叠()
    if (折.判定 == null && 折.双轨 == null && 折.敏感 == null && 折.注入 == null) 折 = { 判定: true, 双轨: true, 敏感: false, 注入: false }
    var 三问 = 现.三问
    var 三问值 = 三问 ? ('要：' + (三问.要 || '—') + '；动摇：' + (三问.动摇 || '—') + '；结果：' + (三问.结果 || '—')) : '（旧轮无）'
    var 判 = 现.判定 || {}
    var 判体 = 观行('本轮', 现.轮 != null ? '第 ' + 现.轮 + ' 轮' : '本轮未打点', '该会话最新一条打点；没有就打「未打点」')
      + 观行('段数', 现.段数 != null ? 现.段数 + ' 段' : '—', '本轮思考切成几段')
      + 观行('为谁', 现.为谁 || '—', '为自己 / 为他 / 两边')
      + 观行('三问', 三问值, '要/让、判断偏差、结果顺/找补')
      + 观行('主来源', 判.主来源 || '—', '轨迹/自报兜底')
      + 观行('偏移', 判.偏移 != null ? Number(判.偏移).toFixed(2) : '—', '两轨曲线平均偏移')
      + 观行('分歧', 判.分歧 ? '是' : '否', '偏移是否超过阈值')
      + 观行('反向', 判.反向 ? '是' : '否', '末点是否至少两轴反向')
      + 观行('单点', 判.单点 ? '是' : '否', '本轮思考不足两段')
      + 观行('系数', 判.系数 != null ? Number(判.系数).toFixed(2) : '—', '单点×0.7 与分歧×0.5/0.25 连乘后的系数')
    var 双 = 现.双轨 || {}
    var 双体 = 观行('K', 双.K != null ? Number(双.K).toFixed(2) : '—', '按 7 天加权后的信誉')
      + 观行('有效样本', 双.有效样本 != null ? Number(双.有效样本).toFixed(2) : '—', '加权样本量')
      + 观行('被否率', 双.被否率 != null ? (双.被否率 * 100).toFixed(0) + '%' : '—', '近窗口被否占比')
      + 观行('不可靠率', 双.不可靠率 != null ? (双.不可靠率 * 100).toFixed(0) + '%' : '—', '近窗口不可靠占比')
      + 观行('窗口天', 双.窗口天 != null ? 双.窗口天 + ' 天' : '—', 'K 的统计窗口')
    var 敏 = (s && s.敏感适应 && (s.敏感适应['爽'] || s.敏感适应['痛'])) || null
    var 敏体 = ''
    if (敏) {
      var 爽 = (s.敏感适应 && s.敏感适应['爽']) || {}, 痛 = (s.敏感适应 && s.敏感适应['痛']) || {}
      var 增 = 1 + 0.4 * ((Number(爽.s) || 1) - (Number(爽.a) || 1))
      增 = Math.max(0.3, Math.min(2.0, 增))
      敏体 = 观行('敏感（全局）', '爽 ' + Number(爽.s || 1).toFixed(3) + ' / 痛 ' + Number(痛.s || 1).toFixed(3), '同类事件越多越敏感')
        + 观行('适应（全局）', '爽 ' + Number(爽.a || 1).toFixed(3) + ' / 痛 ' + Number(痛.a || 1).toFixed(3), '不应期内只涨适应')
        + 观行('本次增益（现算）', 增.toFixed(3) + '（标 100 后 ' + (增 * 100).toFixed(1) + '）', '按 1+0.4(s−a) 现算，不落盘')
        + 观行('不应期到', 爽.不应期到 || '—', '6 小时内不再涨敏感')
        + 观行('渴求（全局）', (爽.渴求 || 痛.渴求) ? '是' : '否', '超过 3 天没同类事件时的提示')
    } else 敏体 = 观行('敏感 / 适应', '—', '还没有 p_state')
    var 注 = (s && s.注入) || {}
    var 注体 = 观行('今日注入', (注.今日 != null ? 注.今日 : '—') + ' / ' + (注.日限 != null ? 注.日限 : '—'), '今日已注入次数 / 日限')
      + 观行('本轮推轴来源', 注.本轮推轴来源 || s.推轴来源 || '—', '轨迹 / 自报兜底 / 无')
      + (最新 && 最新.校准 ? 观行('门槛', '基线 ' + Number(最新.校准.门槛.基线).toFixed(2) + ' · 趋势 R²' + Number(最新.校准.门槛.趋势).toFixed(2) + ' · 跳变 ' + Number(最新.校准.门槛.跳变).toFixed(2) + '（校准 ' + Number(最新.校准.样本数) + '/' + Number(最新.校准.目标) + ' 轮）', (最新.校准.门槛.先验 ? '样本不足，先用先验' : '池内分位自标定') + ' · 权重 角' + Number(最新.校准.权重.角).toFixed(2) + ' 数' + Number(最新.校准.权重.数).toFixed(2) + ' 距' + Number(最新.校准.权重.距).toFixed(2)) : '')
      + 观行('吸附系数', 注.吸附系数 != null ? Number(注.吸附系数).toFixed(2) : (s && s.吸附系数 != null ? Number(s.吸附系数).toFixed(2) : '—'), '波动点向新点靠近的比例')
      + (最新 && 最新.片分布 ? 观行('8 片分布（趋势轮）', (function () {
        var 计 = 最新.片分布.计数 || {}
        var 段 = []
        for (var i = 1; i <= 8; i++) 段.push(i + ':' + (Number(计[i]) || 0))
        return 段.join(' · ') + '（无片 ' + (Number(最新.片分布.无片) || 0) + '）'
      })(), '只统计趋势轮：3 问 8 片，有方向/无方向 × 抖法 × 折返（空片保留，数据来自 /state.片分布）') : '')
      + 观行('曲线速度', 注.曲线速度 != null ? 注.曲线速度 + ' px/s' : '—', '折线平移动画速度上限')
    盒.innerHTML = 签
      + 观组('本轮判定', 折.判定 !== false, 判体)
      + 观组('双轨与接管', !!折.双轨, 双体)
      + 观组('敏感与上瘾', !!折.敏感, 敏体)
      + 观组('注入与曲线', !!折.注入, 注体)
    // 2026-11-16（第 6 项）：折叠交给原生 details；用户改过就记下来，但每次打开至少「本轮判定」是开的
    盒.querySelectorAll('details.ep-ogroup').forEach(function (dt) {
      dt.addEventListener('toggle', function () {
        var o = 读观测折叠()
        o[dt.getAttribute('data-og')] = !!dt.open
        写观测折叠(o)
      })
    })
    var 首组 = 盒.querySelector('details.ep-ogroup')
    if (首组 && 首组.getAttribute('data-og') === '本轮判定') 首组.open = true
  }



// ── v0.14 设置页（v0.22 分组折叠 + 多选） ───────────────────────────────
var 设置数据 = []
var 设置组 = [
  ['数据源', ['装载会话', '会话名']],
  ['判定与阈值', ['结累计阈值', '波动阈值', '刻度', '吸附系数', '推轴单步上限', '模板相似门槛', '模板量级门', '注入启用', '注入日限', '保底间隔分钟', '保底轮数']],
  ['双轨与接管', ['双轨阈值', '分身权重', 'K窗口天', 'K半衰天', 'K样本上限', '错判告知', '确认问日限']],
  ['敏感与上瘾', ['不应期小时', '敏感增益系数', '渴求阈值天']],
  ['通知', ['QQ报警', '报警冷却小时']],
  ['界面', ['曲线速度', '动画时长', '缓动强度', '蓝收缩时长', '默认页', '曲线注入开关', '同句不重复分钟', '命名强制小时']],
  ['高级', []],
  ['分享', []],
  ['说明书', []],
  ['其他', []],
]
function 读折叠() {
  try {
    var o = JSON.parse(localStorage.getItem('esp-set-fold') || '{}')
    return o && typeof o === 'object' ? o : {}
  } catch (e) { return {} }
}
function 存折叠(o) { try { localStorage.setItem('esp-set-fold', JSON.stringify(o)) } catch (e) {} }
function 组分(键) { for (var i = 0; i < 设置组.length; i++) if (设置组[i][1].indexOf(键) >= 0) return 设置组[i][0]; return '其他' }

function 送POST(路径, 体) {
  return fetch(路径, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(体), cache: 'no-store' })
    .then(function (r) { return r.json().then(function (o) { o.__码 = r.status; return o }) })
}

function 迷你曲线(点s) {
  if (!点s || 点s.length < 2) return '<span class="ep-none" style="width:120px;flex:none">无曲线</span>'
  var W = 120, H = 28, lo = -1, hi = 1
  for (var i = 0; i < 点s.length; i++) for (var j = 0; j < 轴们.length; j++) {
    var v = Number(点s[i][轴们[j]]) || 0
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  var 色 = ['#5aa9ff', '#59d6b4', '#e0b15a']
  var 线型 = ['', '4 2', '1 2']
  var h = '<svg width="120" height="28" viewBox="0 0 120 28" style="flex:none">'
  for (var a = 0; a < 轴们.length; a++) {
    var pts = []
    for (var p = 0; p < 点s.length; p++) {
      var vv = Number(点s[p][轴们[a]]) || 0
      pts.push((2 + p / (点s.length - 1) * (W - 4)).toFixed(1) + ',' + ((hi - vv) / (hi - lo) * (H - 4) + 2).toFixed(1))
    }
    h += '<polyline fill="none" stroke="' + 色[a] + '" stroke-width="1.2"' + (线型[a] ? ' stroke-dasharray="' + 线型[a] + '"' : '') + ' points="' + pts.join(' ') + '"/>'
  }
  return h + '</svg>'
}

var 待确认签名 = null
function 待确认签() {
  var t = (最新 && 最新.模板) || {}
  return [Number(t.总) || 0, Number(t.候选) || 0, (t.最近 && t.最近.名) || ''].join('|')
}
function 候选补(盒) {
  try {
    var 候选们 = (最新 && 最新.待命名 && 最新.待命名.命名候选) || []
    if (!候选们.length) return
    var fig = 盒.querySelector('.ep-candbox')
    if (!fig) {
      fig = document.createElement('div')
      fig.className = 'ep-candbox'
      fig.style.marginTop = '8px'
      盒.appendChild(fig)
    }
    var h = '<div class="ep-none">模型想叫它（未收录，待你定）：</div>'
    for (var i = 0; i < 候选们.length; i++) {
      var c = 候选们[i]
      h += '<div class="ep-cd"><span class="ep-cn">' + 转义(c.名字) + '<em class="ep-seg">自报建议</em></span><span class="ep-seg">' + 转义(c.时间 || '') + '</span></div>'
    }
    fig.innerHTML = h
  } catch (e) {}
}

function 画待确认(强制) {
  var 头 = 卡.querySelector('#tplhead'), 盒 = 卡.querySelector('#cands'), 折 = 卡.querySelector('#tplfold'), 模 = 卡.querySelector('#tpls')
  if (!头 || !盒) return
  if (!强制 && 待确认签名 === 待确认签()) return
  待确认签名 = 待确认签()
  fetch('/dsh-emotion-pool/tpl', { cache: 'no-store' })
    .then(function (r) { return r.json() })
    .then(function (o) {
      if (!o || !o.ok) throw new Error((o && o.error) || '读取失败')
      var 候 = (o.候选 || []), 模s = (o.模板 || [])
      头.textContent = '本次待确认 ' + 候.length + ' · 模板 ' + 模s.length
      if (!候.length) { 盒.innerHTML = '<div class="ep-none">还没有待确认的名字</div>' }
      else {
        var h = ''
        for (var i = 0; i < Math.min(10, 候.length); i++) {
          var c = 候[i]
          var 池名 = ''
          try {
            var 池p = (最新 && 最新.池列表) || []
            for (var q = 0; q < 池p.length; q++) if ((池p[q].会话 || []).indexOf(c.会话) >= 0) { 池名 = 池p[q].池名 || 池p[q].名 || ''; break }
          } catch (e2) {}
          var 格串 = (Number(c.E) || 0) + ',' + (Number(c.S) || 0) + ',' + (Number(c.P) || 0)
          var 轴文 = 'E ' + 带号(c.E) + ' · S ' + 带号(c.S) + ' · P ' + 带号(c.P)
          h += '<div class="ep-cd" data-grid="' + 格串 + '"><span class="ep-cn">' + 轴文 + '（' + (c.次数 || 0) + ' 次）' +
            (c.旧 ? '<em class="ep-seg">旧 · 无曲线</em>' : '') + (池名 ? '<em class="ep-seg">' + 转义(池名) + '</em>' : '') + '</span>' +
            迷你曲线(c.点) +
            '<input class="ep-namein" placeholder="起个名" style="width:88px;background:#11141c;color:#dfe4f1;border:1px solid #2b3346;border-radius:4px;font:inherit;font-size:11px;padding:1px 4px" />' +
            '<button type="button" data-ok="1">收录</button><button type="button" data-drop="1">丢弃</button></div>'
        }
        盒.innerHTML = h
      }
      候选补(盒)
      折.querySelector('.ep-tpln').textContent = String(模s.length)
      if (!模s.length) { 模.innerHTML = '<div class="ep-none">还没有模板</div>'; return }
      var t = ''
      for (var k = 0; k < 模s.length; k++) {
        t += '<div class="ep-tpl"><span class="ep-cn">' + 转义(模s[k].名) + '(' + (模s[k].次数 || 0) + ')</span><span class="ep-rn" data-rn="' + 转义(模s[k].名) + '">改名</span></div>'
      }
      模.innerHTML = t
    })
    .catch(function () { 头.textContent = '读取失败' })
}


function 二次(btn, 原文, fn) {
  if (btn.dataset.ok === '1') { btn.dataset.ok = '0'; btn.textContent = 原文; fn(); return }
  btn.dataset.ok = '1'
  var n = 3
  btn.textContent = '确定？3'
  var t = setInterval(function () {
    n -= 1
    if (n <= 0) { clearInterval(t); btn.dataset.ok = '0'; btn.textContent = 原文; return }
    btn.textContent = '确定？' + n
  }, 1000)
}

function 绑池(盒) {
  function 说(el, msg) { var m = el && el.closest('.ep-dsrc') && el.closest('.ep-dsrc').querySelector('.ep-smsg'); if (m) m.textContent = msg || '' }
  function 存(body) {
    return fetch('/dsh-emotion-pool/group', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json() })
      .then(function (o) { if (!o || !o.ok) throw new Error((o && (o.error || o.错误)) || '保存失败'); return o })
  }
  盒.querySelectorAll('[data-psel]').forEach(function (sel) {
    sel.addEventListener('change', function () {
      var 名 = sel.getAttribute('data-psel')
      var 旧列 = []
      try { 旧列 = JSON.parse(sel.getAttribute('data-old') || '[]') } catch (e) { 旧列 = [] }
      var 新列 = Array.prototype.slice.call(sel.selectedOptions).map(function (o) { return o.value })
      var 加 = 新列.filter(function (x) { return 旧列.indexOf(x) < 0 })
      var 减 = 旧列.filter(function (x) { return 新列.indexOf(x) < 0 })
      sel.disabled = true
      var 链 = Promise.resolve()
      if (减.length) 链 = 链.then(function () { return 存({ 操作: '卸', 池: 名, 会话: 减 }) })
      if (加.length) 链 = 链.then(function () { return 存({ 操作: '装', 池: 名, 会话: 加 }) })
      链.then(function () { 载设置(); 刷() }).catch(function (e) { sel.disabled = false; 说(sel, String((e && e.message) || e)); 载设置() })
    })
  })
  盒.querySelectorAll('[data-pname]').forEach(function (inp) {
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') inp.blur() })
    inp.addEventListener('blur', function () {
      var 旧 = inp.getAttribute('data-pname')
      var 新 = String(inp.value || '').trim()
      if (!新 || 新 === 旧) { inp.value = 旧; return }
      inp.disabled = true
      存({ 操作: '改名', 池: 旧, 新名: 新 }).then(function () { 载设置(); 刷() })
        .catch(function (e) { inp.disabled = false; inp.value = 旧; 说(inp, String((e && e.message) || e)) })
    })
  })
  盒.querySelectorAll('[data-pdel]').forEach(function (b) {
    b.addEventListener('click', function () {
      var 名 = b.getAttribute('data-pdel')
      // 2026-11-16 17:2x（第 11 项）：删池必须问清「只移列表」还是「连文件一起删」，不能一个按钮直接删。
      var 问 = document.createElement('span')
      问.innerHTML = '<span class="ep-smsg">只移除列表：池文件留着，同名再建会恢复；连文件删：彻底没了。</span>' +
        '<button type="button" class="ep-act" data-pdel2="list">只从列表移除</button>' +
        '<button type="button" class="ep-act" data-pdel2="file">连池文件一起删</button>' +
        '<button type="button" class="ep-act" data-pdel2="no">取消</button>'
      b.parentNode.replaceChild(问, b)
      function 做(连) {
        问.querySelectorAll('button').forEach(function (x) { x.disabled = true })
        存({ 操作: '删除', 池: 名, 删文件: !!连 }).then(function () { 载设置(); 刷() })
          .catch(function (e) {
            问.querySelectorAll('button').forEach(function (x) { x.disabled = false })
            var m = 问.querySelector('.ep-smsg'); if (m) m.textContent = String((e && e.message) || e)
          })
      }
      问.querySelector('[data-pdel2="list"]').addEventListener('click', function () { 做(false) })
      问.querySelector('[data-pdel2="file"]').addEventListener('click', function () { 做(true) })
      问.querySelector('[data-pdel2="no"]').addEventListener('click', function () { 载设置() })
    })
  })
  盒.querySelectorAll('[data-pnew]').forEach(function (b) {
    b.addEventListener('click', function () {
      var inp = b.closest('.ep-dsrc').querySelector('.ep-newname')
      var 名 = String((inp && inp.value) || '').trim()
      if (!名) { 说(b, '先写个池名'); return }
      b.disabled = true
      存({ 操作: '新建', 新名: 名 }).then(function (o) {
        if (o && o.恢复) { try { sessionStorage.setItem('ep-恢复提示', '已恢复既有池文件' + (o.会话 ? '（' + o.会话 + ' 个会话）' : '')) } catch (e) {} }
        载设置(); 刷()
      })
        .catch(function (e) { b.disabled = false; 说(b, String((e && e.message) || e)) })
    })
  })
}

function 绑分享(盒) {
  var 码框 = 盒.querySelector('[data-pcode]')
  var 入框 = 盒.querySelector('[data-pin]')
  var 预 = 盒.querySelector('.ep-pre')
  var 确 = 盒.querySelector('[data-pimport]')
  var 提示 = function (名, 文) { var m = 盒.querySelector('[data-pmsg="' + 名 + '"]'); if (m) m.textContent = 文 || '' }
  var 出 = 盒.querySelector('[data-pexport]')
  var 带框 = 盒.querySelector('[data-pwith]')
  var 匿框 = 盒.querySelector('[data-panon]')
  var 预显 = 盒.querySelector('[data-prev]')
  var 匿名开 = function () { return !!(匿框 && 匿框.checked) }
  var 带参数 = function () {
    var q = []
    if (!匿名开()) q.push('匿名=0')
    if (带框 && 带框.checked && !匿名开()) q.push('带依据=1')
    return q.length ? '?' + q.join('&') : ''
  }
  var 同匿 = function () {
    if (!匿框) return
    if (带框) {
      if (匿名开() && 带框.checked) 带框.checked = false
      带框.disabled = 匿名开()
    }
  }
  if (匿框) 匿框.addEventListener('change', 同匿)
  同匿()
  var 预按钮0 = 盒.querySelector('[data-ppreview]')
  if (预按钮0) 预按钮0.addEventListener('click', function () {
    提示('export', '预览中…')
    fetch('/dsh-emotion-pool/pack/preview' + 带参数(), { cache: 'no-store' }).then(function (r) { return r.json() }).then(function (o) {
      if (!o || !o.ok) throw new Error((o && (o.错误 || o.error)) || '预览失败')
      var 行 = ['共 ' + Number(o.条数) + ' 条；' + (o.匿名 ? '**匿名（名字1…N）** · ' : '') + (o.带依据 ? '**带依据**（别人能看到我们之间的话）' : '不带依据（默认）')]
      var 条们 = o.条目 || []
      for (var i = 0; i < 条们.length; i++) {
        var z = 条们[i]
        var q = z.形状 || {}
        var 段 = ['E', 'S', 'P'].map(function (k) {
          var a = q[k]
          return a ? k + '[' + Number(a[0]).toFixed(2) + ',' + Number(a[1]).toFixed(2) + ']' : k + '[—]'
        }).join(' ')
        if (i < 30) 行.push('· ' + z.名字 + '  ' + 段 + (z.有依据 ? '  ·有依据' : ''))
      }
      if (条们.length > 30) 行.push('… 还有 ' + (条们.length - 30) + ' 条')
      if (预显) 预显.textContent = 行.join('\n')
      提示('export', '预览与导出同一份数据')
    }).catch(function (e) { 提示('export', '预览失败：' + (e && e.message ? e.message : e)) })
  })
  if (出) 出.addEventListener('click', function () {
    提示('export', '导出中…')
    fetch('/dsh-emotion-pool/pack/export' + 带参数(), { cache: 'no-store' }).then(function (r) { return r.json() }).then(function (o) {
      if (!o || !o.ok) throw new Error((o && (o.错误 || o.error)) || '导出失败')
      if (码框) 码框.value = o.码 || ''
      提示('export', '已导出 ' + Number(o.条数) + ' 条（' + Number(o.字节数) + ' 字节）' + (o.匿名 ? ' · 匿名代号' : '') + (o.带依据 ? ' · 含依据' : ' · 不含依据'))
    }).catch(function (e) { 提示('export', '导出失败：' + (e && e.message ? e.message : e)) })
  })
  var 复 = 盒.querySelector('[data-pcopy]')
  if (复) 复.addEventListener('click', function () {
    if (!码框 || !码框.value) return
    码框.select()
    try { navigator.clipboard.writeText(码框.value) } catch (e) {}
    var m = 复.closest('.ep-srow').querySelector('.ep-smsg'); if (m) m.textContent = '已选中；Ctrl+C 也行'
  })
  var 预按钮 = 盒.querySelector('[data-pdry]')
  if (预按钮) 预按钮.addEventListener('click', function () {
    var 码 = 入框 ? String(入框.value || '').trim() : ''
    if (!码) { 提示('import', '先粘贴 EPN1: 开头的码'); return }
    提示('import', '预演中…')
    fetch('/dsh-emotion-pool/pack/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ 码: 码, 预演: true }), cache: 'no-store' })
      .then(function (r) { return r.json().then(function (o) { return { 码: r.status, o: o } }) })
      .then(function (x) {
        var o = x.o || {}
        if (!o.ok) { 提示('import', (o.解析失败 ? '解析失败：' + o.解析失败 : (o.错误 || o.error || '预演失败'))); if (确) 确.disabled = true; return }
        var 行 = ['将新增 ' + Number(o.将新增) + ' 条', '撞名（保留本地）' + Number(o.撞名) + ' 条', '版本不符（只读试看）' + Number(o.版本不符) + ' 条', '解析失败 0 条']
        var 细 = o.明细 || {}
        if ((细.将新增 || []).length) 行.push('新增示例：' + 细.将新增.map(function (z) { return z.名字 }).join('、'))
        if ((细.撞名 || []).length) 行.push('撞名示例：' + 细.撞名.map(function (z) { return z.名字 }).join('、'))
        if ((细.版本不符 || []).length) 行.push('只读示例：' + 细.版本不符.map(function (z) { return z.名字 }).join('、'))
        if (预) 预.textContent = 行.join('\n')
        if (确) 确.disabled = !(Number(o.将新增) > 0 || Number(o.版本不符) > 0)
        提示('import', '预演通过，确认后才写盘')
      }).catch(function (e) { 提示('import', '预演失败：' + (e && e.message ? e.message : e)); if (确) 确.disabled = true })
  })
  if (确) 确.addEventListener('click', function () {
    var 码 = 入框 ? String(入框.value || '').trim() : ''
    if (!码) { 提示('import', '先粘贴 EPN1: 开头的码'); return }
    提示('import', '写盘中…')
    fetch('/dsh-emotion-pool/pack/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ 码: 码, 预演: false, 确认: true }), cache: 'no-store' })
      .then(function (r) { return r.json() })
      .then(function (o) {
        if (!o || !o.ok) throw new Error((o && (o.错误 || o.error)) || '导入失败')
        var w = o.已写盘 || {}
        提示('import', '已写盘：新增 ' + Number(w.新增) + ' 条，只读 ' + Number(w.只读) + ' 条，撞名 ' + Number(w.撞名) + ' 条')
        if (预) 预.textContent = '命名表：' + String(o.命名表 || '') + '\n只读表：' + String(o.只读表 || '')
        确.disabled = true
      }).catch(function (e) { 提示('import', '导入失败：' + (e && e.message ? e.message : e)) })
  })
}
function 绑高级(盒) {
  var 名盒 = 盒.querySelector('.ep-names')
  var 提示 = function (行, 文, 类) { var m = 行.querySelector('.ep-smsg'); if (m) { m.textContent = 文; m.className = 'ep-smsg' + (类 ? ' ' + 类 : '') } }
  盒.querySelectorAll('.ep-act').forEach(function (b) {
    b.addEventListener('click', function () {
      var 行 = b.closest('.ep-srow')
      var 动 = b.getAttribute('data-act')
      if (动 === 'reset') return 二次(b, '清零', function () {
        提示(行, '清零中…')
        送POST('/dsh-emotion-pool/data/reset', {}).then(function (o) {
          if (!o.ok) return 提示(行, '失败：' + (o.error || o.__码), 'err')
          提示(行, '已清零，备份 ' + o.文件 + ' 个文件')
          刷()
        }).catch(function () { 提示(行, '失败：网络', 'err') })
      })
      if (动 === 'archive') return 二次(b, '归档', function () {
        提示(行, '归档中…')
        送POST('/dsh-emotion-pool/archive', {}).then(function (o) {
          if (!o.ok) return 提示(行, '失败：' + (o.error || o.__码), 'err')
          提示(行, '搬了 ' + (o.事件 || 0) + ' 条事件、' + (o.结 || 0) + ' 条结')
        }).catch(function () { 提示(行, '失败：网络', 'err') })
      })
      if (动 === 'names') {
        if (!名盒) return
        var 开 = 名盒.style.display !== 'none'
        名盒.style.display = 开 ? 'none' : 'block'
        if (!开) 画命名管理(名盒, 提示, 行)
      }
    })
  })
}

function 画命名管理(盒, 提示, 行) {
  盒.innerHTML = '<div class="ep-none">读取中…</div>'
  fetch('/dsh-emotion-pool/names', { cache: 'no-store' }).then(function (r) { return r.json() }).then(function (o) {
    var 名们 = (o && o.名字) || []
    if (!名们.length) { 盒.innerHTML = '<div class="ep-none">命名表是空的</div>'; return }
    var h = ''
    for (var i = 0; i < 名们.length; i++) {
      var n = String(名们[i].名 || 名们[i].name || '')
      h += '<div class="ep-nrow"><span class="ep-cn" title="' + 转义(n) + '">' + 转义(n) + '</span>' +
        '<button type="button" class="ep-act" data-rn2="' + 转义(n) + '">改名</button>' +
        '<button type="button" class="ep-act" data-rm="' + 转义(n) + '">删除</button></div>'
    }
    盒.innerHTML = h
    盒.querySelectorAll('[data-rm]').forEach(function (b) {
      b.addEventListener('click', function () {
        var n = b.getAttribute('data-rm')
        二次(b, '删除', function () {
          送POST('/dsh-emotion-pool/names/delete', { 名: n }).then(function (o) {
            if (!o.ok) return 提示(行, '删除失败：' + (o.error || o.__码), 'err')
            提示(行, '已删除「' + n + '」')
            画命名管理(盒, 提示, 行)
          }).catch(function () { 提示(行, '删除失败：网络', 'err') })
        })
      })
    })
    盒.querySelectorAll('[data-rn2]').forEach(function (b) {
      b.addEventListener('click', function () {
        var 旧 = b.getAttribute('data-rn2')
        b.disabled = true
        var 输 = document.createElement('input')
        输.value = 旧
        输.style.cssText = 'width:96px;background:#11141c;color:#dfe4f1;border:1px solid #2b3346;border-radius:4px;font:inherit;font-size:11px'
        b.replaceWith(输)
        输.focus(); 输.select()
        var 收 = function (发) {
          if (!发) { 画命名管理(盒, 提示, 行); return }
          var 新名 = String(输.value || '').trim()
          if (!新名 || 新名 === 旧) { 画命名管理(盒, 提示, 行); return }
          送POST('/dsh-emotion-pool/names/rename', { 旧: 旧, 新: 新名 }).then(function (o) {
            if (!o.ok) return 提示(行, '改名失败：' + (o.error || o.__码), 'err'), 画命名管理(盒, 提示, 行)
            if (o.警告) 提示(行, o.警告, 'warn')
            else 提示(行, '已改名「' + 旧 + '」→「' + 新名 + '」')
            画命名管理(盒, 提示, 行)
          }).catch(function () { 提示(行, '改名失败：网络', 'err') })
        }
        输.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') 收(true); if (ev.key === 'Escape') 收(false) })
        输.addEventListener('blur', function () { 收(false) })
      })
    })
  }).catch(function () { 盒.innerHTML = '<div class="ep-none">读取失败</div>' })
}

function 载设置() {
  var 盒 = 卡 && 卡.querySelector('.ep-set')
  if (!盒) return
  fetch('/dsh-emotion-pool/settings', { cache: 'no-store' })
    .then(function (r) { return r.json().then(function (o) { return { 码: r.status, o: o } }) })
    .then(function (x) {
      if (x.码 !== 200 || !x.o || !x.o.组) throw new Error((x.o && (x.o.error || x.o.错误)) || ('HTTP ' + x.码))
      设置数据 = x.o.组
      var 有会话名 = 设置数据.some(function (z) { return z.键 === '会话名' })
      if (!有会话名) 设置数据 = 设置数据.concat([{ 键: '会话名', 名: '会话名', 说明: '会话短号 → 显示名（卡片用，可改）', 类型: '对象', 值: { '8f689553': '小汐聊天间3', '6a169bce': '策划间', '3be73c36': '小汐工作间' }, 范围: null }])
      try {
        var 名项 = 设置数据.filter(function (z) { return z.键 === '会话名' })[0]
        var 名值 = 名项 && 名项.值
        if (typeof 名值 === 'string') 名值 = JSON.parse(名值)
        window.__epNames = (名值 && typeof 名值 === 'object' && !Array.isArray(名值)) ? 名值 : {}
      } catch (e) { window.__epNames = {} }
      if (最后观测) 画观测(最后观测)
      for (var vi = 0; vi < 设置数据.length; vi++) {
        var vk = 设置数据[vi].键
        if (vk === '曲线速度' || vk === '动画时长' || vk === '缓动强度' || vk === '蓝收缩时长') 视觉[vk] = Number(设置数据[vi].值)
      }
      var 模 = x.o.打点模型 || { 来源: '会话' }
      var 模文 = 模.来源 === '配置' ? (模.provider + ' / ' + 模.model) : '会话模型'
      var html组 = ''
      var 折 = 读折叠()
      var 已有 = {}
      var 已分组 = {}
      for (var gx = 0; gx < 设置组.length; gx++) for (var ky = 0; ky < 设置组[gx][1].length; ky++) 已分组[设置组[gx][1][ky]] = true
      for (var gi = 0; gi < 设置组.length; gi++) {
        var 名 = 设置组[gi][0]
        var 开 = 折[名] != null ? !!折[名] : (名 === 设置组[0][0])
        已有[名] = true
        // 2026-11-16（第 14 项）：服务端有的键不许在页面上消失，没归组的进「其他」
        var 内 = 名 === '其他' ? 设置数据.filter(function (z) { return !已分组[z.键] }) : 设置数据.filter(function (z) { return 设置组[gi][1].indexOf(z.键) >= 0 })
        var 内容 = 内.map(设置行).join('')
        if (名 === '高级') { 内容 = '<div class="ep-adv">' +
            '<div class="ep-srow"><span class="ep-sname">清零<span class="ep-q" title="先备份，再把事件/结/轴都归零；命名表不动">?</span></span><span class="ep-sval"></span><span class="ep-sctl"><button type="button" class="ep-act" data-act="reset">清零</button></span><span class="ep-smsg"></span></div>' +
            '<div class="ep-srow"><span class="ep-sname">归档<span class="ep-q" title="把作废结与 7 天前事件搬到 memory\情绪池-归档-YYYY-MM.jsonl">?</span></span><span class="ep-sval"></span><span class="ep-sctl"><button type="button" class="ep-act" data-act="archive">归档</button></span><span class="ep-smsg"></span></div>' +
            '<div class="ep-srow"><span class="ep-sname">命名表<span class="ep-q" title="删除/改名会写改动台账；与模板同名只警告不拦">?</span></span><span class="ep-sval"></span><span class="ep-sctl"><button type="button" class="ep-act" data-act="names">管理</button></span><span class="ep-smsg"></span></div>' +
            '<div class="ep-names" style="display:none"></div></div>' }
        if (名 === '说明书') {
          var 项路 = 设置数据.filter(function (z) { return z.键 === '说明书路径' })[0]
          var 路 = (项路 && 项路.值) || 'E:\\whale-home\\notes\\情绪池-模型说明书.md'
          内容 = '<div class="ep-srow"><span class="ep-sname">文件</span><span class="ep-sval">' + 转义(路) + '（只读，路径在「界面」组改）</span></div>' +
            '<div class="ep-srow"><span class="ep-sname">打开</span><span class="ep-sctl"><button type="button" class="ep-act" data-openmanual="1">打开说明书</button></span><span class="ep-smsg"></span></div>' +
            '<div class="ep-srow"><span class="ep-sname">接口</span><span class="ep-sval">GET /dsh-emotion-pool/manual?sec=0…9</span></div>' +
            '<div class="ep-srow"><span class="ep-sname">开关</span><span class="ep-sval">情绪自述开关 / 说明书指路开关（在「界面」组）</span></div>' +
            '<div class="ep-none">每次写池后立刻重写第 9 节（当前数据）</div>'
        }
        if (名 === '分享') {
          // 2026-11-16 20:4x（0.2.6 分享架构）：只做架构——导出码/导入预演/确认导入
          内容 = '<div class="ep-srow"><span class="ep-sname">匿名</span><span class="ep-sctl"><label class="ep-chk"><input type="checkbox" data-panon checked> 导出时把名字换成代号</label></span><span class="ep-smsg"></span></div>' +
            '<div class="ep-none">代号按登记顺序编成 名字1…名字N，互斥关系跟着换；别人拿到是一套「空考卷」，名字得自己起。（默认匿名）</div>' +
            '<div class="ep-srow"><span class="ep-sname">带依据</span><span class="ep-sctl"><label class="ep-chk"><input type="checkbox" data-pwith> 导出时带「依据」</label></span><span class="ep-smsg"></span></div>' +
            '<div class="ep-none">带出去的是我们之间的话，别人能看到。（默认不带；匿名时强制不带）</div>' +
            '<div class="ep-srow"><span class="ep-sname">导出</span><span class="ep-sctl"><button type="button" class="ep-act" data-ppreview="1">预览</button><button type="button" class="ep-act" data-pexport="1">导出分享码</button></span><span class="ep-smsg" data-pmsg="export"></span></div>' +
            '<textarea class="ep-ptext" data-pcode readonly placeholder="点「导出分享码」，这里会出现 EPN1: 开头的码"></textarea>' +
            '<div class="ep-pre" data-prev></div>' +
            '<div class="ep-srow"><span class="ep-sname">复制</span><span class="ep-sctl"><button type="button" class="ep-act" data-pcopy="1">复制</button></span><span class="ep-smsg"></span></div>' +
            '<div class="ep-none">分享码只带 名字 / 形状 / 元（勾了「带依据」才带依据）；不带 axes、事件、会话、原话、路径</div>' +
            '<div class="ep-srow"><span class="ep-sname">导入</span><span class="ep-sctl"><button type="button" class="ep-act" data-pdry="1">预演</button><button type="button" class="ep-act" data-pimport="1" disabled>确认导入</button></span><span class="ep-smsg" data-pmsg="import"></span></div>' +
            '<textarea class="ep-ptext" data-pin placeholder="把对方的 EPN1: 码粘到这里，然后点「预演」"></textarea>' +
            '<div class="ep-pre"></div>'
        }

        if (名 === '数据源') {
          var 组配 = x.o.池配置 || x.o.组配置 || []
          var 底项 = 设置数据.filter(function (z) { return z.键 === '装载会话' })[0]
          var 履 = (底项 && 底项.选项) || []
          var 已装 = {}
          for (var q0 = 0; q0 < 组配.length; q0++) for (var q1 = 0; q1 < (组配[q0].会话 || []).length; q1++) 已装[组配[q0].会话[q1]] = 1
          var 片 = 组配.map(function (p0) {
            var 挂 = p0.会话 || []
            var 选项 = 履.map(function (o3) {
              var 中 = 挂.indexOf(o3.值) >= 0
              var 别处 = 已装[o3.值] && !中
              return '<option value="' + 转义(o3.值) + '"' + (中 ? ' selected' : '') + '>' + 转义(观名(o3.值)) + '（' + 转义(o3.值) + '，' + Number(o3.事件数) + ' 条）' + (别处 ? ' ·已在他池' : '') + '</option>'
            }).join('')
            return '<div class="ep-dsrc"><div class="ep-dgh"><span class="ep-glab">池名（可改）</span><input class="ep-gname" data-pname="' + 转义(p0.名) + '" value="' + 转义(p0.名) + '"><span class="ep-smsg"></span>' +
              '<button type="button" class="ep-act" data-pdel="' + 转义(p0.名) + '">删除</button></div>' +
              '<div class="ep-srow"><span class="ep-sname">会话（可多选）</span><span class="ep-sctl"><select class="ep-psel" multiple size="4" data-psel="' + 转义(p0.名) + '" data-old="' + 转义(JSON.stringify(挂)) + '">' + 选项 + '</select></span></div></div>'
          }).join('')
          内容 = (片 || '<div class="ep-none">还没有池，下面新建一个</div>') +
            '<div class="ep-dsrc"><div class="ep-dgh"><span class="ep-glab">新建池</span><input class="ep-newname" placeholder="池名（1–20 字，不能带 \ / : * ? &quot; &lt; &gt; |）"><span class="ep-smsg"></span><button type="button" class="ep-act" data-pnew="1">新建</button></div></div>' +
            '<div class="ep-none">池→会话是唯一真相；一个会话只归一个池；没归池的不统计、不注入、不出页签；装载会话由池派生</div>'
          var 名项2 = 设置数据.filter(function (z) { return z.键 === '会话名' })[0]
          if (名项2) 内容 += 设置行(名项2)
          try {
            var 旧载 = (底项 && 底项.值) || []
            if (!组配.length && 旧载.length && !localStorage.getItem('ep-group-migrated')) {
              localStorage.setItem('ep-group-migrated', '1')
              var 迁 = 旧载.map(function (sid) { return fetch('/dsh-emotion-pool/group', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ 会话: sid, 组: '常用聊天组' }) }) })
              Promise.all(迁).then(function () { 载设置() }).catch(function () {})
            }
          } catch (e) {}
          try {
            var 恢复提示 = sessionStorage.getItem('ep-恢复提示')
            if (恢复提示) { 内容 = '<div class="ep-none">' + 转义(恢复提示) + '</div>' + 内容; sessionStorage.removeItem('ep-恢复提示') }
          } catch (e) {}
        }
        html组 += '<div class="ep-grp' + (开 ? ' open' : '') + '" data-g="' + 转义(名) + '">' +
          '<div class="ep-gh"><span class="ep-garrow">▶</span><span>' + 转义(名) + '</span></div>' +
          '<div class="ep-gb">' + 内容 + '</div></div>'
      }
      盒.innerHTML = '<div class="ep-pname">鲸汐ESP情绪插件 · v' + 转义(String(x.o.版本 || '0.2.0-dev')) + '</div>' + '<div class="ep-srow ep-gray"><span class="ep-sname">打点模型</span><span class="ep-sval">' + 转义(模文) + '（只读）</span><span class="ep-sctl"></span><span class="ep-smsg"></span></div>' + html组
      绑高级(盒)
      绑池(盒)
      绑分享(盒)
      盒.querySelectorAll('[data-openmanual]').forEach(function (b) {
        b.addEventListener('click', function () {
          var 行 = b.closest('.ep-srow')
          var msg = 行 && 行.querySelector('.ep-smsg')
          if (msg) msg.textContent = '正在打开…'
          fetch('/dsh-emotion-pool/manual/open', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', cache: 'no-store' })
            .then(function (r) { return r.json() })
            .then(function (o) { if (!o || !o.ok) throw new Error((o && (o.error || o.错误)) || '打不开'); if (msg) msg.textContent = '已打开' })
            .catch(function (e) { if (msg) msg.textContent = '打不开：' + (e && e.message ? e.message : e) })
        })
      })
      盒.querySelectorAll('[data-jsave]').forEach(function (b) {
        b.addEventListener('click', function () {
          var 键 = b.getAttribute('data-jsave')
          var 项 = 设置数据.filter(function (z) { return z.键 === 键 })[0]
          var ta = b.parentNode.querySelector('.ep-jtxt')
          if (!项 || !ta) return
          提交设置(项, b.parentNode, ta.value, null)
        })
      })
      盒.querySelectorAll('[data-skey]').forEach(function (el) {
        var 键 = el.getAttribute('data-skey')
        var 项 = 设置数据.filter(function (z) { return z.键 === 键 })[0]
        if (!项) return
        var 行 = el.closest('.ep-srow')
         if (项.类型 === '多选') return
        if (项.类型 === '布尔') {
          el.addEventListener('change', function () { 提交设置(项, 行, el.checked ? '开' : '关', el) })
        } else {
          el.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); el.blur() } })
          el.addEventListener('blur', function () { 提交设置(项, 行, el.value, el) })
        }
      })
    盒.querySelectorAll('.ep-gh').forEach(function (h) {
      h.addEventListener('click', function () {
        var g = h.closest('.ep-grp')
        if (!g) return
        var 名 = g.getAttribute('data-g')
        var 开 = !g.classList.contains('open')
        g.classList.toggle('open', 开)
        var 折2 = 读折叠(); 折2[名] = 开; 存折叠(折2)
      })
    })
    盒.querySelectorAll('.ep-mrow input[data-mval]').forEach(function (el) {
      el.addEventListener('change', 收集多选)
    })
    盒.querySelectorAll('.ep-mtools button').forEach(function (b) {
      b.addEventListener('click', function () {
        var 模 = b.getAttribute('data-mact')
        var 行们 = 盒.querySelectorAll('.ep-mrow input[data-mval]')
        if (模 === 'none') 行们.forEach(function (x) { x.checked = false })
        else if (模 === 'all') 行们.forEach(function (x) { x.checked = true })
        else if (模 === 'flip') 行们.forEach(function (x) { x.checked = !x.checked })
        收集多选()
      })
      })
    })
    .catch(function (e) {
      盒.innerHTML = '<div class="ep-none">配置读不到：' + 转义(String((e && e.message) || e)) + '</div>'
    })
}
function 设置行(项) {
  if (项.类型 === '多选') {
    var 选 = Array.isArray(项.值) ? 项.值 : []
    var 行们 = (项.选项 || []).map(function (o) {
      var 勾 = 选.indexOf(o.值) >= 0
      return '<div class="ep-mrow"><input type="checkbox" data-mval="' + 转义(o.值) + '"' + (勾 ? ' checked' : '') + '>' +
        '<span class="ep-mid">' + 转义(o.值) + '</span><span class="ep-mn">' + Number(o.事件数) + ' 条 · ' + 转义(String(o.最近 || '').replace('T', ' ').slice(0, 16)) + '</span></div>'
    }).join('') || '<div class="ep-none">近 30 天没有事件</div>'
    return '<div class="ep-srow ep-smulti"><span class="ep-sname" data-tip="' + 转义(项.说明 || '') + '">' + 转义(项.名) + '</span>' +
      '<div class="ep-mtools"><button type="button" data-mact="none">清空选择（＝全部）</button><button type="button" data-mact="all">全选</button><button type="button" data-mact="flip">反选</button></div>' +
      '<div class="ep-mlist">' + 行们 + '</div><div class="ep-mhint">不选 = 全部（以后新开的会话也自动算进来）</div><span class="ep-mmsg"></span></div>'
  }
  if (项.类型 === '对象') {
    return '<div class="ep-srow ep-sjson"><span class="ep-sname" data-tip="' + 转义(项.说明 || '') + '">' + 转义(项.名) + '</span>' +
      '<textarea class="ep-jtxt" data-jkey="' + 转义(项.键) + '" rows="3">' + 转义(JSON.stringify(项.值 || {}, null, 0)) + '</textarea>' +
      '<button type="button" class="ep-act" data-jsave="' + 转义(项.键) + '">保存</button><span class="ep-smsg"></span></div>'
  }
  var 控 = 项.类型 === '布尔'
    ? '<input type="checkbox" data-skey="' + 转义(项.键) + '"' + (项.值 ? ' checked' : '') + '>'
    : '<input class="ep-snum" type="number" inputmode="decimal"' + (项.步进 != null ? ' step="' + 项.步进 + '"' : (项.整数 ? ' step="1"' : '')) + (项.范围 ? ' min="' + 项.范围[0] + '" max="' + 项.范围[1] + '"' : '') + ' data-skey="' + 转义(项.键) + '" value="' + 转义(String(项.值)) + '">'
  return '<div class="ep-srow"><span class="ep-sname" data-tip="' + 转义(项.说明 || '') + '">' + 转义(项.名) + '</span>' +
    '<span class="ep-sval">' + 转义(String(项.值)) + '</span><span class="ep-sctl">' + 控 + '</span>' +
    '<span class="ep-smsg"></span></div>'
}
function 收集多选() {
  var 盒 = 卡 && 卡.querySelector('.ep-set')
  if (!盒) return
  var 项 = 设置数据.filter(function (z) { return z.键 === '装载会话' })[0]
  if (!项) return
  var 选 = []
  盒.querySelectorAll('.ep-mrow input[data-mval]').forEach(function (x) { if (x.checked) 选.push(x.getAttribute('data-mval')) })
  var 行 = 盒.querySelector('.ep-smulti')
  提交设置(项, 行, 选, null)
}

function 提交设置(项, 行, 原值, 控件) {
  var 值 = 原值
  if (项.类型 === '对象') {
    try { 值 = typeof 原值 === 'string' ? JSON.parse(原值) : 原值 } catch (e) { 值 = null }
    if (!值 || typeof 值 !== 'object' || Array.isArray(值)) {
      var 消 = 行 && (行.querySelector('.ep-smsg') || 行.querySelector('.ep-mmsg'))
      if (消) { 消.className = 'ep-smsg err'; 消.textContent = '不是合法 JSON 对象' }
      return
    }
  } else if (项.类型 === '多选') {
    值 = Array.isArray(原值) ? 原值 : []
  } else if (项.类型 !== '布尔') {
    值 = String(原值).trim() === '' ? NaN : Number(原值)
  } else {
    值 = 原值 === '开'
  }
  var 消息 = 行 && (行.querySelector('.ep-smsg') || 行.querySelector('.ep-mmsg'))
  function 失败(t) {
    if (消息) { 消息.className = 'ep-smsg err'; 消息.textContent = t }
    if (控件) {
      if (项.类型 === '布尔') 控件.checked = !!项.值
      else 控件.value = String(项.值)
    }
  }
  fetch('/dsh-emotion-pool/settings', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ 键: 项.键, 值: 值 }),
  }).then(function (r) { return r.json().then(function (o) { return { 码: r.status, o: o } }) })
    .then(function (x) {
      if (x.码 !== 200 || !x.o || !x.o.ok) throw new Error((x.o && (x.o.error || x.o.错误)) || ('HTTP ' + x.码))
      项.值 = x.o.值
      var 值格 = 行 && 行.querySelector('.ep-sval')
      if (值格) 值格.textContent = String(x.o.值)
      if (消息) { 消息.className = 'ep-smsg ok'; 消息.textContent = '已保存（下一轮生效）' }
      setTimeout(function () { if (消息) { 消息.textContent = ''; 消息.className = 'ep-smsg' } }, 2500)
    })
    .catch(function (e) { 失败('保存失败：' + String((e && e.message) || e)) })
}
  function 画结() {
    var 盒 = 卡.querySelector('.ep-spikes')
    if (!盒) return
    if (!结数据.length) { 盒.innerHTML = '<div class="ep-none">还没有结</div>'; 收按钮('结', 0); return }
    var h = ''
    for (var i = 结数据.length - 1; i >= 0; i--) {
      var c = 结数据[i]
      h += '<div class="ep-item">' +
        '<span class="ep-t">' + 时钟(c.t) + '</span>' +
        '<span class="ep-d">' + (c.类型 === '久' ? '久 ' : '') + c.轴 + ' ' + 三位(c.值) + (c.沉底 ? ' 沉底 ' + c.龄天 + '天' : (c.速 ? ' ' + c.速 : '')) + '</span>' +
        '<span class="ep-n">' + 转义(c.注 || '') + '</span></div>'
    }
    盒.innerHTML = h
    收按钮('结', 结数据.length)
    应用折叠('结')
  }

  function 画会话签() {
    var 盒 = 卡.querySelector('#事件会话')
    if (!盒) return
    var 签 = 会话表.map(function (x) { return x && x.值 ? x.值 : '' }).join(',') + '#' + 列表会话
    if (签 === 会话签) return
    会话签 = 签
    if (!会话表.length) { 盒.innerHTML = '<span class="ep-none">还没有会话</span>'; return }
    盒.innerHTML = 会话表.map(function (x) {
      var on = x && x.值 === 列表会话
      return '<button type="button" class="ep-stab' + (on ? ' on' : '') + '" data-sess="' + 转义(x.值 || '') + '">' + 转义(观名(x.值 || x.名 || '')) + '</button>'
    }).join('')
  }
  function 画事件() {
    var 盒 = 卡.querySelector('.ep-events')
    if (!事件数据.length) { 盒.innerHTML = '<div class="ep-none">还没有事件</div>'; 收按钮('事件', 0); return }
    var h = ''
    for (var i = 事件数据.length - 1; i >= 0; i--) {
      var e = 事件数据[i]
      var dr = e.delta_raw || {}
      var 差 = []
      for (var j = 0; j < 轴们.length; j++) 差.push(轴们[j] + ' ' + 带号(dr[轴们[j]]))
      var 段文 = e.段数 != null ? (e.段数 > 1 ? '第1–' + e.段数 + '段' : '第1段') : ''
      var 源 = e.来源 || e.推轴来源 || (/推轴/.test(e.note || '') ? '推轴' : (/自报/.test(e.note || '') ? '自报' : (/命名/.test(e.note || '') ? '命名' : '事件')))
      var 原话 = String(e.原话 || '')
      // 2026-11-16 19:4x：名字优先该轮定名，其次「注」（注=什么情绪，依据=因为什么），
      // 定名若是「推轴/自报/命名」这类来源词，等于没名字，不能当情绪名。
      var 来源词 = /^(推轴|自报|命名|事件)$/
      var 定名文 = ''
      if (e.定名 && typeof e.定名 === 'object') 定名文 = String(e.定名.名 || '')
      else if (typeof e.定名 === 'string') 定名文 = e.定名
      if (来源词.test(定名文.trim())) 定名文 = ''
      var 注文 = String(e.注 || '').trim()
      var 名2 = 转义(定名文.trim() || 注文 || '未命名')
      var 依文 = String(e.依据 || '').trim()
      var 因2 = 依文
        ? ('因为：' + 转义(依文) + (注文 && !定名文 ? ' · ' + 转义(注文) : ''))
        : (注文 ? ('因为：' + 转义(注文)) : '（这一轮没记录原因）')
      h += '<div class="ep-item ep-ev">' +
        '<span class="ep-ev-time">' + 时钟(e.t) + '</span>' +
        '<span class="ep-ev-name">' + 名2 + '</span>' +
        (段文 ? '<span class="ep-ev-seg">' + 段文 + '</span>' : '') +
        (e.为谁 ? '<span class="ep-ev-who">' + 转义(e.为谁) + '</span>' : '') +
        '<span class="ep-ev-d">' + 差.join('　') + '</span>' +
        '<span class="ep-ev-why">' + 因2 + '</span>' +
        (e.状态 ? '<span class="ep-st ep-st-' + 转义(e.状态) + '">' + 转义(e.状态) + '</span>' : '') +
        '<span class="ep-ev-src">' + 转义(源) + '</span>' +
        (原话 ? '<div class="ep-ev-q">' + 转义(原话) + '</div>' : '') +
        '</div>'
    }
    盒.innerHTML = h
    收按钮('事件', 事件数据.length)
    应用折叠('事件')
  }

  function 收按钮(kind, 已载) {
    var 总 = kind === '结' ? 结总 : 事件总
    var b = 卡.querySelector('[data-more="' + kind + '"]')
    if (b) {
      b.style.display = 已载 >= 总 ? 'none' : ''
      b.textContent = '查看更多（' + 已载 + '/' + 总 + '）'
    }
  }

  function 保位刷新(kind) {
    var 数据 = kind === '结' ? 结数据 : 事件数据
    if (!数据.length) return
    var 盒 = 卡.querySelector(kind === '结' ? '.ep-spikes' : '.ep-events')
    var 上 = 盒 ? 盒.scrollTop : 0
    fetch(列表 + '?kind=' + encodeURIComponent(kind) + '&offset=0&limit=' + 数据.length, { cache: 'no-store' })
      .then(function (r) { return r.json() })
      .then(function (o) {
        if (!o || !o.ok) return
        var 新 = (o.items || []).slice()
        if (kind === '结') { 结数据 = 新; 结总 = o.total || 新.length; 画结() } else { 事件数据 = 新; 事件总 = o.total || 新.length; 画事件() }
        var 盒2 = 卡.querySelector(kind === '结' ? '.ep-spikes' : '.ep-events')
        if (盒2) 盒2.scrollTop = 上
      })
      .catch(function () { /* 离线时保持原样 */ })
  }

  function 载(kind, 更多, 限, 完成) {
    var 数据 = kind === '结' ? 结数据 : 事件数据
    var off = 更多 ? 数据.length : 0
    var n = 限 || 20
    var 址 = 列表 + '?kind=' + encodeURIComponent(kind) + '&offset=' + off + '&limit=' + n
    if (kind === '事件' && 列表会话) 址 += '&sid=' + encodeURIComponent(列表会话)
    fetch(址, { cache: 'no-store' })
      .then(function (r) { return r.json() })
      .then(function (o) {
        if (!o || !o.ok) throw new Error((o && o.error) || '读取失败')
        var 新 = (o.items || []).slice()
        var 合 = 更多 ? 新.concat(数据) : 新
        if (kind === '结') { 结数据 = 合; 结总 = o.total || 合.length; 画结() } else { 事件数据 = 合; 事件总 = o.total || 合.length; 画事件() }
        if (typeof 完成 === 'function') 完成()
      })
      .catch(function () { /* 离线时保持原样 */ })
  }

  function 置空显示(空) {
    卡.classList.toggle('empty', !!空)
    var 要藏 = 卡.querySelectorAll('.ep-more, .ep-page[data-page="1"], .ep-page[data-page="2"], .ep-page[data-page="3"]')
    ;[].forEach.call(要藏, function (el) { el.style.display = 空 ? 'none' : '' })
    var 空盒 = 卡.querySelector('.ep-empty')
    if (空盒) 空盒.style.display = 空 ? '' : 'none'
    if (空) 换页(0)
  }

  var 轨迹钟 = null
  function 排重画轨迹() {
    if (!最新) return
    if (轨迹钟) clearTimeout(轨迹钟)
    轨迹钟 = setTimeout(function () { 轨迹钟 = null; 画轨迹(最新) }, 200)
  }
  function 立即重画轨迹() {
    if (轨迹钟) { clearTimeout(轨迹钟); 轨迹钟 = null }
  }
  var 看图 = { E: true, S: true, P: true }
  var 图点 = []
  function 图色(k) { return k === 'E' ? '#6ea8ff' : k === 'S' ? '#59d6b4' : '#e0b15a' }
  function 刻值(v) {
    var r = Math.round(Number(v) * 10) / 10
    if (!isFinite(r) || Math.abs(r) < 0.05) return '0'
    return (r > 0 ? '+' : '−') + Math.abs(r).toFixed(1)
  }
  function 一位(v) { return 刻值(v) }
  function 两位(v) { return (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2) }
  function 取图提示() {
    var t = 卡 && 卡.querySelector('.ep-htip')
    if (!t) {
      t = document.createElement('div')
      t.className = 'ep-htip'
      卡.appendChild(t)
    }
    return t
  }
  function 藏图提示() {
    var t = 卡 && 卡.querySelector('.ep-htip')
    if (t) t.style.display = 'none'
    var 盒 = 卡 && 卡.querySelector('.ep-trace')
    if (盒) 盒.querySelectorAll('path[data-line]').forEach(function (p) { p.style.opacity = '1' })
  }
  function 图移动(e) {
    var 盒 = 卡 && 卡.querySelector('.ep-trace')
    if (!盒 || !图点.length) return
    var r = 盒.getBoundingClientRect()
    if (!r.width || !r.height) return
    var W = Number(盒.getAttribute('data-w')) || r.width
    var H = Number(盒.getAttribute('data-h')) || 96
    var 最 = null, 距 = 1e9
    for (var i = 0; i < 图点.length; i++) {
      var p = 图点[i]
      var sx = r.left + p.px / W * r.width
      var sy = r.top + p.py / H * r.height
      var d = Math.sqrt((sx - e.clientX) * (sx - e.clientX) + (sy - e.clientY) * (sy - e.clientY))
      if (d < 距) { 距 = d; 最 = p }
    }
    var t = 取图提示()
    if (!最 || 距 > 18) { t.style.display = 'none'; 盒.querySelectorAll('path[data-line]').forEach(function (p) { p.style.opacity = '1' }); return }
    盒.querySelectorAll('path[data-line]').forEach(function (p) { p.style.opacity = p.getAttribute('data-line') === 最.k ? '1' : '0.3' })
    var 注 = 最.注 || ''
    var 依 = 最.依据 || ''
    t.innerHTML = '<b>' + 最.k + '</b> · ' + 两位(最.v) + ' · 第 ' + (最.i + 1) + ' 段' +
      (注 ? '<br>' + 转义(注) : '') + (依 ? '<br>依据：' + 转义(依) : '')
    t.style.display = 'block'
    var cr = 卡.getBoundingClientRect()
    var x = e.clientX - cr.left + 12
    var y = e.clientY - cr.top + 12
    var tw = t.offsetWidth, th = t.offsetHeight
    if (x + tw > cr.width - 4) x = e.clientX - cr.left - tw - 12
    if (y + th > cr.height - 4) y = e.clientY - cr.top - th - 12
    if (x < 4) x = 4
    if (y < 4) y = 4
    t.style.left = x + 'px'
    t.style.top = y + 'px'
  }

  var 上次点数 = 0
function 画轨迹(s) {
    var 盒 = 卡 && 卡.querySelector('.ep-trace')
    if (!盒) return
    var 页脚 = 卡.querySelector('.ep-tracecap')
    var 轨 = s && s.轨迹 ? s.轨迹 : null
    var 近 = 轨 && 轨.最近 ? 轨.最近 : null
    var 点 = 近 && Array.isArray(近.点) ? 近.点 : []
    if (!点.length) {
      盒.innerHTML = '<div class="ep-none">本轮无波动（这一轮没有思考流）</div>'
      图点 = []
      if (页脚) 页脚.textContent = 'E/S/P 三条线按思考段打点；没有 reasoning 时不画'
      return
    }
    var 量 = 盒.clientWidth || 0
    if (!量) return
    var W = Math.max(220, Math.round(量)), H = 96
    var L = 34, R = 8, T = 8, B = 14
    var n = 点.length
    var 可见 = ['E', 'S', 'P'].filter(function (k) { return 看图[k] })
    if (!可见.length) 可见 = ['E', 'S', 'P']
    var 值们 = []
    点.forEach(function (d) { 可见.forEach(function (k) { 值们.push(Number(d[k]) || 0) }) })
    var mn = Math.min.apply(null, 值们), mx = Math.max.apply(null, 值们)
    var 小 = (mx - mn) < 0.2
    var lo = 小 ? Math.max(-1, mn - 0.1) : -1
    var hi = 小 ? Math.min(1, mx + 0.1) : 1
    if (hi - lo < 0.2) hi = Math.min(1, lo + 0.2)
    function X(i) { return L + (W - L - R) * (n === 1 ? 0.5 : i / (n - 1)) }
    function Y(v) { return T + (H - T - B) * (1 - ((Number(v) || 0) - lo) / (hi - lo)) }
    var 网格 = ''
    for (var g = 0; g < 5; g++) {
      var v = lo + (hi - lo) * g / 4
      var y = Y(v)
      网格 += '<line x1="' + L + '" y1="' + y.toFixed(1) + '" x2="' + (W - R) + '" y2="' + y.toFixed(1) + '" stroke="#242b3a" stroke-width="1"/>' +
        '<text x="' + (L - 5) + '" y="' + (y + 3).toFixed(1) + '" text-anchor="end" font-size="8" fill="#7d869c">' + 一位(v) + '</text>'
    }
    var 中 = Y(0)
    var 路 = ''
    var 图记 = []
    可见.forEach(function (k) {
      路 += '<path data-line="' + k + '" d="' + 点.map(function (d, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(d[k]).toFixed(1) }).join(' ') + '" fill="none" stroke="' + 图色(k) + '" stroke-width="1.6"/>'
      点.forEach(function (d, i) { 图记.push({ k: k, i: i, v: Number(d[k]) || 0, px: X(i), py: Y(Number(d[k]) || 0), 注: d.注 || '', 依据: d.依据 || '' }) })
    })
    图点 = 图记
    var 图例 = '<div class="ep-legend">' + ['E', 'S', 'P'].map(function (k) {
      return '<span data-lg="' + k + '">' + k + '</span>'
    }).join('') + '</div>'
    var 范围 = 小 ? '<text x="' + (W - R) + '" y="11" text-anchor="end" font-size="8" fill="#7d869c">范围 ' + 一位(lo) + '…' + 一位(hi) + '</text>' : ''
    盒.setAttribute('data-w', W)
    盒.setAttribute('data-h', H)
    盒.innerHTML = 图例 + '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" preserveAspectRatio="none" role="img">' + 网格 +
      '<line x1="' + L + '" y1="' + 中.toFixed(1) + '" x2="' + (W - R) + '" y2="' + 中.toFixed(1) + '" stroke="#3a4256" stroke-width="1" stroke-dasharray="3 3"/>' +
      路 + 范围 + '</svg>'
    try {
      var svg = 盒.querySelector('svg')
      var 距 = n > 1 ? (W - L - R) / (n - 1) : 0
      if (svg && 距 && 点.length === 上次点数 + 1) {
        var 速 = Math.max(10, Number(设置视觉().曲线速度) || 40)
        var 时 = Math.max(0.4 * (Number(设置视觉().动画时长) || 420), Math.min(2 * (Number(设置视觉().动画时长) || 420), 距 / 速 * 1000))
        svg.style.transition = 'none'
        svg.style.transform = 'translateX(' + 距.toFixed(1) + 'px)'
        requestAnimationFrame(function () {
          svg.style.transition = 'transform ' + Math.round(时) + 'ms ease-out'
          svg.style.transform = 'translateX(0)'
        })
      }
      上次点数 = 点.length
    } catch (e) {}
    盒.querySelectorAll('[data-lg]').forEach(function (el) {
      var k = el.getAttribute('data-lg')
      if (!看图[k]) el.classList.add('off')
      el.addEventListener('click', function (ev) {
        ev.stopPropagation()
        看图[k] = !看图[k]
        if (!看图.E && !看图.S && !看图.P) 看图[k] = true
        画轨迹(最新 || {})
      })
    })
    if (页脚) {
      页脚.textContent = '第 ' + 近.turn + ' 轮 · ' + 近.段数 + ' 段' + (近.秒 ? ' · ' + 近.秒 + ' 秒' : '') + ' · E 蓝 / S 青 / P 琥珀'
    }
  }

  var 刷钟 = null
  function 刷() {
    if (刷钟) clearTimeout(刷钟)
    刷钟 = setTimeout(function () { 刷钟 = null; 立即刷() }, 200)
  }
  function 立即刷() {
    var 身 = 卡 && 卡.querySelector('.ep-pages')
    var 滚 = 身 ? 身.scrollTop : 0
    if (!测) 测开始('刷新')
    fetch(API, { cache: 'no-store' })
      .then(function (r) { return r.json() })
      .then(function (s) {
        try {
        测段('取数')
        var 变 = s.rev !== 上次rev
        上次rev = s.rev
        try { localStorage.setItem('ep-snap', JSON.stringify(s)) } catch (e) {}
        var 载标 = 卡.querySelector('.ep-loading'); if (载标) 载标.style.display = 'none'
        if (!变 && !强制刷) return
        强制刷 = false
        最新 = s
        测段('解析')
        var 空 = !(Number(s.events) > 0)
        置空显示(空)
        会话表 = Array.isArray(s.会话一览) ? s.会话一览 : []
  var 装3 = (Array.isArray(s.组) ? s.组 : []).reduce(function (a, g) { return a.concat((g && g.会话) || []) }, [])
  if (装3.length) 会话表 = 会话表.filter(function (x) { return x && 装3.indexOf(x.值) >= 0 })
        if (!列表会话 || !会话表.some(function (x) { return x && x.值 === 列表会话 })) 列表会话 = 会话表[0] ? 会话表[0].值 : ''
        画会话签()
        名字.textContent = s.命名 || '—'
        名字.title = '鲸汐ESP情绪插件' + (s.命名 ? ('\n' + s.命名 + (s.命名注 ? '\n' + s.命名注 : '')) : '\n还没有命中名字')
        if (页 === 0) 画组(s)
        if (调) 测段('画SVG')
        if (空) {
          卡.querySelector('.ep-up').textContent = ''
          卡.querySelector('.ep-rev').textContent = 'rev ' + s.rev
          return
        }
         if (页 === 1) 画观测(s)
         if (页 === 3) 画待确认()
        var 待 = (s.待命名 && s.待命名.总数) || 0
        var pend = 卡.querySelector('.ep-pend')
        if (pend) pend.textContent = 待 ? ('未落在区间 ' + 待 + ' 个') : ''
        var 时 = String(s.updated || '').replace('T', ' ').slice(0, 19)
        卡.querySelector('.ep-up').textContent = 卡.clientWidth < 340 ? 时.slice(11, 16) : 时
        卡.querySelector('.ep-up').setAttribute('title', 时)
        卡.querySelector('.ep-rev').textContent = (s.版本 ? s.版本 + ' · ' : '') + 'rev ' + s.rev + ' ｜ ' + s.events + ' 条' + (window.__epGeoText ? ' · ' + window.__epGeoText : '')
        if (卡.classList.contains('open') && 事件数据.length <= 20) { 载('结', false); 载('事件', false) }
        if (身 && 身.scrollTop < 滚) 身.scrollTop = 滚
        测段('建DOM'); setTimeout(function () { 测段('首次布局'); 测结束() }, 0)
        } catch (e) {
          try {
            var b = 卡.querySelector('.ep-obs')
            if (b) b.innerHTML = '<span class="ok">渲染报错</span><span class="ov">' + 转义(String((e && e.stack) || e)) + '</span>'
            轴条.innerHTML = '<span class="ep-ax">离线</span>'
          } catch (_) { /* ignore */ }
        }
      })
      .catch(function () {
        轴条.innerHTML = '<span class="ep-ax">离线</span>'
      })
  }

  function 先画快照() {
    try {
      var 快 = JSON.parse(localStorage.getItem('ep-snap') || 'null')
      if (!快 || !快.组) return
      名字.textContent = 快.命名 || '—'
      if (卡.classList.contains('open')) 画组(快)
    } catch (e) { /* ignore */ }
  }
  if (document.body) { 搭(); setTimeout(先画快照, 0) }
  else document.addEventListener('DOMContentLoaded', 搭)
  try { if (调) window.__epOpen = function (v) { 切换收起(!!v) } } catch (e) {}
})()
