// IronPrompt Pro 核心函数单元测试（Node 原生 test runner，零依赖）
// 运行：node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const C = require('../js/core.js');

const DEFAULT_PLATES = [
  { weight: 3.0, count: 8 },
  { weight: 2.5, count: 4 },
  { weight: 1.25, count: 4 }
];
const DEFAULT_BANDS = [10, 15, 20, 25, 30];

// ---------------- formatTime ----------------
test('formatTime: 常规/零/负数/小数', () => {
  assert.equal(C.formatTime(90), '01:30');
  assert.equal(C.formatTime(0), '00:00');
  assert.equal(C.formatTime(-5), '00:00');
  assert.equal(C.formatTime(59.9), '00:59');
  assert.equal(C.formatTime('90'), '01:30'); // 字符串容错
});

// ---------------- 哑铃求解器 ----------------
test('solveDumbbellOptions: 默认库存行为与原实现一致', () => {
  const out = C.solveDumbbellOptions(0.35, DEFAULT_PLATES);
  // 原实现默认库存产出 35 个选项
  assert.equal(out.length, 35);
  assert.equal(out[0].weight, 0.35);
  assert.equal(out[0].label, '空杆');
  const w535 = out.find(o => o.weight === 5.35);
  assert.ok(w535, '5.35kg 可达');
  assert.equal(w535.label, '单边: 2.5');
  const w785 = out.find(o => o.weight === 7.85);
  assert.ok(w785, '7.85kg 可达');
  const w1135 = out.find(o => o.weight === 11.35);
  assert.ok(w1135, '11.35kg 可达');
  // 严格升序
  for (let i = 1; i < out.length; i++) assert.ok(out[i].weight > out[i - 1].weight);
});

test('solveDumbbellOptions: 字符串输入（v-model 未转换）安全', () => {
  const out = C.solveDumbbellOptions('0.35', [
    { weight: '2.5', count: '4' },
    { weight: '1.25', count: '4' }
  ]);
  const w535 = out.find(o => o.weight === 5.35);
  assert.ok(w535);
  // 所有 weight 必须是数字
  for (const o of out) assert.equal(typeof o.weight, 'number');
});

test('solveDumbbellOptions: 无片规只剩空杆', () => {
  const out = C.solveDumbbellOptions(0.35, []);
  assert.deepEqual(out, [{ weight: 0.35, label: '空杆' }]);
  const out2 = C.solveDumbbellOptions(0.35, [{ weight: 2.5, count: 1 }]); // 单片不够一对
  assert.deepEqual(out2, [{ weight: 0.35, label: '空杆' }]);
});

test('solveDumbbellOptions: 极端库存不再指数爆炸（回归 P0-6）', () => {
  const big = Array.from({ length: 6 }, (_, i) => ({ weight: 1 + i * 0.5, count: 40 }));
  const t0 = Date.now();
  const out = C.solveDumbbellOptions(0.35, big);
  const ms = Date.now() - t0;
  assert.ok(ms < 1000, `应在 1s 内完成（实际 ${ms}ms）`);
  assert.ok(out.length <= 1500, '渲染上限 1500');
  for (const o of out) assert.equal(typeof o.weight, 'number');
  // 某个确定可达重量必须存在：单边 4 片 3.5kg = 7kg → 0.35+14=14.35（0.5kg 粒度降采样后按 0.5 对齐）
  const near = out.find(o => Math.abs(o.weight - 14.35) <= 0.5);
  assert.ok(near, '14.35kg 附近应有可达项');
});

// ---------------- 拉力绳求解器 ----------------
test('solveBandOptions: 默认库存覆盖常见叠加', () => {
  const out = C.solveBandOptions(DEFAULT_BANDS);
  const w35 = out.find(o => o.weight === 35);
  assert.ok(w35, '35磅 可达');
  assert.ok(/^叠: \d+(\+\d+)*磅$/.test(w35.label));
  const w15 = out.find(o => o.weight === 15);
  assert.equal(w15.label, '叠: 15磅');
  for (let i = 1; i < out.length; i++) assert.ok(out[i].weight > out[i - 1].weight);
});

test('solveBandOptions: 字符串输入不产生拼接污染（回归 P0-4）', () => {
  const out = C.solveBandOptions([10, '15', 20, '25', 30]);
  for (const o of out) {
    assert.equal(typeof o.weight, 'number', 'weight 必须是数字');
    assert.ok(o.weight > 0 && o.weight <= 100, `weight 合理范围: ${o.weight}`);
  }
  const w35 = out.find(o => o.weight === 35);
  assert.ok(w35, '15+20=35 可达');
  // 不允许出现 "015" 这类由拼接产生的伪重量（>100 磅或带前导零的字符串）
  assert.ok(!out.some(o => String(o.weight).includes('015')));
});

test('solveBandOptions: 单根/空/非法输入', () => {
  assert.deepEqual(C.solveBandOptions([15]), [{ weight: 15, label: '叠: 15磅' }]);
  assert.deepEqual(C.solveBandOptions([]), []);
  assert.deepEqual(C.solveBandOptions(['x', -1, 0, '']), []);
});

test('solveBandOptions: 大量绳子不指数爆炸（回归 P1-6）', () => {
  const many = Array.from({ length: 30 }, (_, i) => 10 + (i % 5) * 5);
  const t0 = Date.now();
  const out = C.solveBandOptions(many);
  const ms = Date.now() - t0;
  assert.ok(ms < 500, `应在 500ms 内完成（实际 ${ms}ms）`);
  assert.ok(out.length > 0);
});

// ---------------- AI 处方解析 ----------------
test('mapPrescriptionSets: 缺省值与 prev_record 回退', () => {
  // 无 suggested_sets → 空数组
  assert.deepEqual(C.mapPrescriptionSets({ mode: 'weight_reps' }), []);
  assert.deepEqual(C.mapPrescriptionSets(null), []);
  // 正常映射
  const sets = C.mapPrescriptionSets({
    mode: 'weight_reps',
    suggested_sets: [
      { set_type: 'warmup', weight: 5.35, value: 5, rpe: 6, prev_record: '5.35kg×5' },
      { set_type: 'working', weight: 7.85, value: 10 }
    ]
  });
  assert.equal(sets.length, 2);
  assert.equal(sets[0].set_type, 'warmup');
  assert.equal(sets[0].prev_record, '5.35kg×5');
  assert.equal(sets[1].rpe, 8, '缺省 RPE=8');
  assert.equal(sets[1].prev_record, '7.85kg×10');
  // 拉力绳单位
  const band = C.mapPrescriptionSets({ mode: 'band_reps', suggested_sets: [{ weight: 35, value: 12 }] });
  assert.equal(band[0].prev_record, '35磅×12');
  // 计时模式无重量
  const time = C.mapPrescriptionSets({ mode: 'time', suggested_sets: [{ value: 30 }] });
  assert.equal(time[0].weight, 0);
  assert.equal(time[0].prev_record, '30s');
  // 自重
  const body = C.mapPrescriptionSets({ mode: 'bodyweight_reps', suggested_sets: [{ value: 12 }] });
  assert.equal(body[0].prev_record, '12次');
});

test('normalizePhaseKey: 大小写/空白归一 + 自定义阶段保留', () => {
  const known = ['warmup', 'strength', 'accessory', 'core', 'cooldown', 'mobility'];
  assert.equal(C.normalizePhaseKey('Strength', known), 'strength');
  assert.equal(C.normalizePhaseKey('  MOBIlity ', known), 'mobility');
  assert.equal(C.normalizePhaseKey('', known), 'strength');
  assert.equal(C.normalizePhaseKey(null, known), 'strength');
  assert.equal(C.normalizePhaseKey('brandNewPhase', known), 'brandnewphase');
  assert.equal(C.normalizePhaseKey('strength'), 'strength'); // 无已知列表也走规范键
});

// ---------------- 备份校验与迁移 ----------------
test('validateBackup: 合法/缺字段/结构异常', () => {
  const ok = C.validateBackup({
    plansData: { A: { phases: { strength: [] } }, B: { phases: {} } },
    equipment: { plates: [], bands: [] }
  });
  assert.equal(ok.ok, true);
  assert.equal(C.validateBackup({ equipment: {} }).ok, false);
  assert.equal(C.validateBackup({ plansData: {} }).ok, false);
  assert.equal(C.validateBackup(null).ok, false);
  assert.equal(C.validateBackup('str').ok, false);
  assert.equal(C.validateBackup({ plansData: { A: { phases: null } }, equipment: {} }).ok, false);
});

test('validateBackup: 缺失 A 或 B 日计划必须拒收（回归 R3）', () => {
  const badA = C.validateBackup({ plansData: { B: { phases: {} } }, equipment: {} });
  assert.equal(badA.ok, false);
  assert.ok(badA.problems.join(',').includes('A 日'));
  const badB = C.validateBackup({ plansData: { A: { phases: {} } }, equipment: {} });
  assert.equal(badB.ok, false);
  assert.ok(badB.problems.join(',').includes('B 日'));
});

test('migratePlans: 补齐缺失阶段/档案，且保留已有数据', () => {
  const plans = { A: { phases: { strength: [{ name: 'x' }] }, athlete: { bodyweight: 80 } } };
  C.migratePlans(plans, C.PHASE_ORDER);
  for (const k of C.PHASE_ORDER) assert.ok(Array.isArray(plans.A.phases[k]), k + ' 应为数组');
  assert.equal(plans.A.phases.strength.length, 1, '已有动作保留');
  assert.equal(plans.A.athlete.bodyweight, 80, '已有档案保留');
  const plans2 = { B: {} };
  C.migratePlans(plans2, C.PHASE_ORDER);
  assert.ok(Array.isArray(plans2.B.phases.warmup));
  assert.deepEqual(plans2.B.athlete, { bodyweight: 70, readiness: 4 });
});

// ---------------- 吨位统计 ----------------
test('planVolumeKg: 全阶段统计，排除热身/自重/计时/拉力绳/未完成', () => {
  const plan = {
    phases: {
      strength: [
        { mode: 'weight_reps', sets: [
          { set_type: 'warmup', weight: 5.35, value: 5, done: true },      // 热身 → 不计
          { set_type: 'working', weight: 11.35, value: 10, done: true },   // 113.5
          { set_type: 'working', weight: 11.35, value: 10, done: false }   // 未完成 → 不计
        ]},
        { mode: 'bodyweight_reps', sets: [{ set_type: 'working', weight: 0, value: 10, done: true }] },
        { mode: 'time', sets: [{ set_type: 'working', weight: 0, value: 30, done: true }] },
        { mode: 'band_reps', sets: [{ set_type: 'working', weight: 35, value: 12, done: true }] }
      ],
      accessory: [
        { mode: 'weight_reps', sets: [{ set_type: 'working', weight: 5.35, value: 15, done: true }] } // 80.25
      ]
    }
  };
  assert.equal(C.planVolumeKg(plan), 193.75); // 113.5 + 80.25，含 accessory（回归 P1-11）
  assert.equal(C.planVolumeKg({}), 0);
  assert.equal(C.planVolumeKg(null), 0);
  assert.equal(C.planVolumeKg({ phases: { strength: [{ sets: null }] } }), 0);
});

// ---------------- 正式组进度 ----------------
test('planStats: 只统计非热身组，忽略结构异常', () => {
  const plan = {
    phases: {
      strength: [
        { mode: 'weight_reps', sets: [
          { set_type: 'warmup', done: true },
          { set_type: 'working', done: true },
          { set_type: 'working', done: false }
        ]},
        { mode: 'time', sets: [{ set_type: 'working', done: true }] }
      ],
      accessory: [
        { sets: null },
        { sets: [] }
      ]
    }
  };
  assert.deepEqual(C.planStats(plan), { done: 2, total: 3 });
  assert.deepEqual(C.planStats({}), { done: 0, total: 0 });
  assert.deepEqual(C.planStats(null), { done: 0, total: 0 });
});
