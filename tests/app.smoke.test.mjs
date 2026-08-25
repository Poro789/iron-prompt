// IronPrompt Pro 应用冒烟测试（Node 原生 test runner，零依赖）
// 用最小 Vue/DOM 桩在 Node 中真实执行 js/app.js 的 setup() 与关键函数路径，
// 捕捉运行时引用错误、执行顺序问题，并回归关键业务流（含首启迁移回归 R1）。
// 运行：node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// ---- 桩：localStorage（空 = 模拟全新安装用户） ----
const store = {};
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; }
};

// ---- 桩：window（捕获事件监听器以便测试快捷键） ----
const listeners = {};
global.window = {
  addEventListener: (ev, cb) => { listeners[ev] = cb; },
  removeEventListener: (ev) => { delete listeners[ev]; },
  IronPromptCore: null
};

// ---- 加载 core.js（Node 下走 module.exports 分支） ----
globalThis.IronPromptCore = require('../js/core.js');
window.IronPromptCore = globalThis.IronPromptCore;
assert.ok(window.IronPromptCore, 'core.js 加载失败');

// ---- 桩：Vue（最小实现，足以驱动 setup 与响应式消费点） ----
let api = null;
global.Vue = {
  ref: (v) => ({ value: v }),
  reactive: (o) => o,
  computed: (fn) => ({ get value() { return fn(); } }),
  watch: () => {},
  createApp: (opts) => ({
    mount: () => {
      api = opts.setup();
      return { unmount: () => {} };
    }
  })
};

// ---- 加载 app.js（顶层执行 createApp().mount()） ----
require('../js/app.js');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

test('setup() 执行完成，导出齐全', () => {
  assert.ok(api, 'setup 未执行');
  for (const key of ['currentPlan', 'sessionVolume', 'tempoCoach', 'restTimer', 'startNewDay',
    'parseAIResponse', 'sessionStats', 'appVersion', 'startManualRest']) {
    assert.ok(key in api, `缺少导出: ${key}`);
  }
});

test('初始状态正确（默认计划 / 求解器 / 统计）', () => {
  assert.equal(api.currentPlan.value, 'A');
  assert.equal(api.activeSession.value.phases.strength.length, 4);
  assert.equal(api.sessionVolume.value, '0.0');
  assert.equal(api.availableDumbbellOptions.value.length, 35, '哑铃默认 35 选项');
  assert.ok(api.availableBandOptions.value.some(o => o.weight === 35), '拉力绳 35 磅可达');
  assert.equal(api.sessionStats.value.done, 0, '初始无已完成组');
  assert.ok(api.sessionStats.value.total > 0, '初始计划存在正式组（统计管道可用）');
  assert.equal(api.appVersion, '1.3.0');
});

test('首启（空存档）粘贴含 accessory/core 的 AI 处方不崩溃（回归 R1）', () => {
  api.aiImportText.value = '```json\n' + JSON.stringify({
    coach_review: { summary: '总评', volume_analysis: '容量', motivation_highlight: '🔥 亮点' },
    prescription: [
      { phase: 'ACCESSORY', name: '哑铃侧平举', mode: 'weight_reps',
        suggested_sets: [{ set_type: 'working', weight: 3.35, value: 12, rpe: 8 }] },
      { phase: 'core', name: '平板支撑', mode: 'time', suggested_sets: [] }
    ]
  }) + '\n```';
  assert.doesNotThrow(() => api.parseAIResponse(), '首启装载 accessory/core 不得抛错');
  assert.ok(api.activeSession.value.phases.accessory.some(e => e.name === '哑铃侧平举'), 'accessory 动作已装载');
  const plank = api.activeSession.value.phases.core.find(e => e.name === '平板支撑');
  assert.ok(plank && plank.sets.length === 1, '空 suggested_sets 补默认组');
  assert.equal(api.activeSession.value.coach_review.motivation_highlight, '🔥 亮点');
});

test('coach_review 为数组时拒收（R4 守卫）', () => {
  const before = api.activeSession.value.coach_review;
  api.aiImportText.value = JSON.stringify({ coach_review: ['x'] });
  api.parseAIResponse();
  assert.equal(api.activeSession.value.coach_review, before, '数组型 coach_review 未被装载');
});

test('两击打卡流 + 吨位统计', () => {
  const ex = api.activeSession.value.phases.strength[1]; // 哑铃卧推 7.85×10×2
  const set = ex.sets[0];
  api.handleSetCheck('strength', ex, set);
  assert.equal(set.showRpePicker, true);
  assert.equal(set.done, false, '第一击只开 RPE 面板');
  api.selectRpe('strength', ex, set, 9);
  assert.equal(set.done, true);
  assert.equal(set.rpe, 9);
  assert.equal(api.sessionVolume.value, (7.85 * 10).toFixed(1));
});

test('节拍教练跑完 → 真正打卡 + 自动休息（回归 P0-2）', async () => {
  const ex = api.activeSession.value.phases.strength[1];
  ex.sets[1].value = 2;
  ex.tempo = [1, 0, 1];
  api.startTempoCoach('strength', ex, ex.sets[1]);
  assert.equal(api.tempoCoach.running, true);
  const t0 = Date.now();
  while (!ex.sets[1].done && Date.now() - t0 < 6000) await sleep(100);
  assert.equal(ex.sets[1].done, true, '带练结束必须真正打卡');
  assert.equal(api.tempoCoach.running, false, '带练自动结束');
  assert.equal(api.restTimer.running, true, '打卡后休息计时自动启动');
  api.stopRestTimer();
});

test('休息计时：墙钟递减 / +15s / 手动启动', async () => {
  api.startManualRest();
  assert.equal(api.restTimer.timeLeft, 90);
  await sleep(1100);
  assert.ok(api.restTimer.timeLeft <= 89, `递减（90 → ${api.restTimer.timeLeft}）`);
  const before = api.restTimer.timeLeft;
  api.adjustRestTimer(15);
  assert.ok(api.restTimer.timeLeft >= before + 14, '+15s 生效');
  api.stopRestTimer();
  assert.equal(api.restTimer.running, false);
  assert.equal(api.restTimer.timeLeft, 0);
});

test('R 快捷键：开始/停止休息；输入框聚焦时忽略', () => {
  const keydown = listeners.keydown;
  assert.ok(typeof keydown === 'function', 'keydown 监听已注册');
  keydown({ key: 'r', target: null });
  assert.equal(api.restTimer.running, true, 'R 开始休息');
  keydown({ key: 'R', target: null });
  assert.equal(api.restTimer.running, false, 'R 再按停止');
  keydown({ key: 'r', target: { tagName: 'INPUT' } });
  assert.equal(api.restTimer.running, false, '输入框聚焦时 R 被忽略');
});

test('A/B 切换停止带练（回归 P1-13）', () => {
  const ex = api.activeSession.value.phases.strength[0];
  ex.tempo = [1, 0, 1];
  ex.sets[0].value = 5;
  api.startTempoCoach('strength', ex, ex.sets[0]);
  assert.equal(api.tempoCoach.running, true);
  api.switchPlan('B');
  assert.equal(api.tempoCoach.running, false, '切换计划停止带练');
  assert.equal(api.currentPlan.value, 'B');
  api.switchPlan('A');
});

test('AI 处方：大小写归一 / 同名覆盖 / 未知阶段 / 小数节奏取整', () => {
  api.aiImportText.value = '```json\n' + JSON.stringify({
    prescription: [
      { phase: 'Strength', name: '哑铃卧推', mode: 'weight_reps', overload_status: '🟢 升级至 11.35kg',
        tempo: [2.5, 0.5, 1.5],
        suggested_sets: [{ set_type: 'warmup', weight: 5.35, value: 5, rpe: 6 },
                         { set_type: 'working', weight: 11.35, value: 10, rpe: 8 }] },
      { phase: 'weirdPhase', name: '神秘动作' }
    ]
  }) + '\n```';
  api.parseAIResponse();
  const bench = api.activeSession.value.phases.strength.find(e => e.name === '哑铃卧推');
  assert.equal(bench.overload_status, '🟢 升级至 11.35kg', '同名覆盖（Strength 归一）');
  assert.deepEqual(bench.tempo, [3, 1, 2], '小数节奏取整');
  assert.ok(api.phases.some(p => p.key === 'weirdphase'), '未知阶段自动创建');
  assert.equal(api.aiImportText.value, '', '装载后清空输入框');
});

test('新训练日：清空打卡 + 吨位归零 + 停止带练（含 R2 回归）', () => {
  const ex = api.activeSession.value.phases.strength[0];
  ex.sets[0].value = 5;
  ex.tempo = [1, 0, 1];
  ex.sets[0].done = true;
  api.startTempoCoach('strength', ex, ex.sets[0]); // 模拟重置时带练仍在跑
  global.confirm = () => true;
  api.startNewDay();
  assert.equal(api.tempoCoach.running, false, 'R2：重置时带练被停止');
  assert.ok(ex.sets.every(s => s.done === false), 'done 全部清空');
  assert.equal(api.sessionVolume.value, '0.0', '吨位归零');
  delete global.confirm;
});

test('快速编辑：草稿模式（取消不生效 / 保存生效）', () => {
  const target = api.activeSession.value.phases.strength[0];
  const before = target.name;
  api.openQuickEditModal('strength', target);
  api.editModal.draft.name = '改名测试';
  api.cancelQuickEdit();
  assert.equal(target.name, before, '取消不生效');
  api.openQuickEditModal('strength', target);
  api.editModal.draft.name = '新名字';
  api.editModal.draft.mode = 'bodyweight_reps';
  api.saveQuickEdit();
  assert.equal(target.name, '新名字');
  assert.equal(target.mode, 'bodyweight_reps');
  target.name = before;
  target.mode = 'weight_reps';
});

test('拉力绳字符串输入不污染（回归 P0-4）', () => {
  api.equipment.bands[1] = '15';
  const bands = api.availableBandOptions.value;
  assert.ok(bands.length > 0);
  for (const o of bands) assert.equal(typeof o.weight, 'number', 'weight 必须为数字');
  assert.ok(bands.some(o => o.weight === 25), '10+15=25 可达');
  api.equipment.bands[1] = 15;
});
