// 依次执行 tests/ 下所有段（文件名序）。状态在各段之间连续流动，所以不能并行、也不能只跑一段。
// 用法：node tests/run.js
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('./harness.js');   // 加载桩 + 用 (0,eval) 载入 js/app.js + 建立 __T 桥接
(async () => {
  const files = fs.readdirSync(__dirname).filter(f => /^p\d\d-.+\.js$/.test(f)).sort();
  for (const f of files) await require(path.join(__dirname, f))();
  H.finish();
})();
