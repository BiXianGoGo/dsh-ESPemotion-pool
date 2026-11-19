# 测试

151 个 `m*.test.mjs`，共 787 条断言（0.2.7 收口）。

```bash
node --test tests/*.mjs
```

- 文件编号是历史顺序，不是版本号；`m150-三轴定名与八片.test.mjs` 这种带中文后缀的是专题用例。
- 测试只读自己的临时目录（`mktemp` / `EP_*` 环境变量），不碰 `memory/` 的真实池。
- 改代码前留 `.bak-改前`；改完跑全量 + `node --check lib/index.js` + `node --check assets/widget.js`。
- 公开仓库里不保留调试脚本；本地调试请放在 `tests/` 外，别提交。
