/* ==========================================================================
   IronPrompt Pro - 核心纯函数模块
   零依赖（无 DOM / 无 Vue），浏览器挂到 window.IronPromptCore，
   Node 环境可 require/import 用于单元测试。
   ========================================================================== */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.IronPromptCore = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ---- 常量：阶段规范顺序与元数据（AI 处方可能引入规范外的新阶段） ----
  const PHASE_ORDER = ['warmup', 'strength', 'accessory', 'core', 'cooldown'];
  const PHASE_META = {
    warmup:    { baseTitle: '动态升温与激活', icon: '🔥', color: 'text-amber-400' },
    strength:  { baseTitle: '主项力量与神经募集', icon: '🏋️', color: 'text-rose-400' },
    accessory: { baseTitle: '辅助强化与细节打磨', icon: '🎯', color: 'text-cyan-400' },
    core:      { baseTitle: '核心稳定与抗旋转', icon: '🛡️', color: 'text-indigo-400' },
    cooldown:  { baseTitle: '静态拉伸与副交感下调', icon: '🧘', color: 'text-emerald-400' }
  };

  // ---- 基础工具 ----
  function num(v, d) {
    const n = Number(v);
    return Number.isFinite(n) ? n : (d === undefined ? 0 : d);
  }
  const round2 = (n) => Math.round(n * 100) / 100;

  function formatTime(sec) {
    const s = Math.max(0, Math.floor(num(sec)));
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }

  // ==========================================================================
  // 哑铃物理合法重量求解
  //   常规库存：精确枚举所有装载方案（每个重量给出第一套装铃方案标签）
  //   极端库存（组合数超阈值）：改用有界背包 DP 只算可达重量，防止页面冻结
  // ==========================================================================
  const ENUM_COMBO_LIMIT = 4000;   // 组合枚举上限
  const MAX_RENDERABLE_OPTIONS = 1500; // 下拉可选重量渲染上限（超过则按 0.5kg 粒度降采样）

  function solveDumbbellOptions(barWeightRaw, platesRaw) {
    const bar = Math.round(num(barWeightRaw) * 100); // 转为「分」避免浮点误差
    const types = (Array.isArray(platesRaw) ? platesRaw : [])
      .map(p => ({
        weight: Math.round(num(p && p.weight) * 100),
        max: Math.max(0, Math.floor(num(p && p.count) / 2))
      }))
      .filter(t => t.weight > 0 && t.max > 0);

    if (types.length === 0) {
      return [{ weight: round2(bar / 100), label: '空杆' }];
    }

    let combos = 1;
    for (const t of types) combos *= (t.max + 1);

    if (combos <= ENUM_COMBO_LIMIT) {
      // 精确枚举（与原实现行为一致）
      const map = new Map();
      const plan = [];
      (function solve(idx, curCents) {
        const totalW = round2((bar + curCents * 2) / 100);
        if (!map.has(totalW)) {
          map.set(totalW, { weight: totalW, label: plan.length ? '单边: ' + plan.map(p => p.w).join('+') : '空杆' });
        }
        if (idx >= types.length) return;
        const t = types[idx];
        for (let c = t.max; c >= 0; c--) {
          if (c > 0) plan.push({ w: round2(t.weight / 100) });
          solve(idx + 1, curCents + c * t.weight);
          if (c > 0) plan.pop();
        }
      })(0, 0);
      return Array.from(map.values()).sort((a, b) => a.weight - b.weight);
    }

    // 有界背包 DP（按片规逐层推进）：只标记可达重量
    const maxCents = types.reduce((s, t) => s + t.max * t.weight, 0);
    let dp = new Uint8Array(maxCents + 1);
    dp[0] = 1;
    for (let i = 0; i < types.length; i++) {
      const t = types[i];
      const ndp = new Uint8Array(maxCents + 1);
      for (let c = 0; c <= maxCents; c++) {
        if (!dp[c]) continue;
        for (let k = 0; k <= t.max && c + k * t.weight <= maxCents; k++) {
          ndp[c + k * t.weight] = 1;
        }
      }
      dp = ndp;
    }

    const collect = (stepCents) => {
      const out = [];
      for (let c = 0; c <= maxCents; c += stepCents) {
        if (dp[c]) out.push({ weight: round2((bar + c * 2) / 100), label: '可达组合' });
      }
      return out;
    };

    let out = collect(1);
    if (out.length > MAX_RENDERABLE_OPTIONS) out = collect(50); // 0.5kg 粒度降采样
    return out.sort((a, b) => a.weight - b.weight);
  }

  // ==========================================================================
  // 拉力绳叠加磅数求解
  //   0/1 背包 DP + 父指针回溯：O(n × 总磅数)，任意数量绳子都不会指数爆炸；
  //   磅数统一 Number() 归一（修复 v-model 字符串拼接污染）
  // ==========================================================================
  function solveBandOptions(bandsRaw) {
    const bands = (Array.isArray(bandsRaw) ? bandsRaw : [])
      .map(b => Math.round(num(b)))
      .filter(b => b > 0)
      .sort((a, b) => a - b);
    if (!bands.length) return [];

    const maxSum = bands.reduce((s, b) => s + b, 0);
    const last = new Int32Array(maxSum + 1).fill(-1); // last[s] = 最后使用的 band 下标（-1 表示不可达 / 基准）
    for (let j = 0; j < bands.length; j++) {
      for (let s = maxSum; s >= bands[j]; s--) {
        if (s - bands[j] === 0 || last[s - bands[j]] >= 0) {
          if (last[s] < 0) last[s] = j;
        }
      }
    }

    const out = [];
    for (let s = 1; s <= maxSum; s++) {
      if (last[s] < 0) continue;
      const sub = [];
      let r = s;
      let j = last[s];
      while (j >= 0) {
        sub.push(bands[j]);
        r -= bands[j];
        j = last[r];
      }
      out.push({ weight: s, label: '叠: ' + sub.join('+') + '磅' });
    }
    return out.sort((a, b) => a.weight - b.weight);
  }

  // ==========================================================================
  // AI 处方解析辅助
  // ==========================================================================
  // 组数据规范化（缺省值与原实现一致；prev_record 按模式生成合理默认）
  function mapPrescriptionSets(item) {
    const mode = (item && item.mode) || 'weight_reps';
    const weightUnit = mode === 'band_reps' ? '磅' : 'kg';
    const list = (item && Array.isArray(item.suggested_sets)) ? item.suggested_sets : [];
    return list.map(s => {
      const weight = num(s && s.weight, 0);
      const value = num(s && s.value, 10);
      const prev = (s && s.prev_record) ||
        (weight > 0
          ? weight + (mode === 'time' ? 's' : weightUnit) + '×' + value
          : value + (mode === 'time' ? 's' : '次'));
      return {
        set_type: (s && s.set_type === 'warmup') ? 'warmup' : 'working',
        weight: weight,
        value: value,
        rpe: num(s && s.rpe, 8),
        done: false,
        feedback: '',
        prev_record: prev
      };
    });
  }

  // 阶段键归一：去空白 + 小写；命中已知阶段（含自定义阶段）则用已知键，否则保留归一后的新键
  function normalizePhaseKey(raw, knownKeys) {
    const k = String(raw === null || raw === undefined ? '' : raw).trim().toLowerCase();
    if (!k) return 'strength';
    const known = Array.isArray(knownKeys) ? knownKeys : [];
    const hit = known.find(x => String(x).toLowerCase() === k);
    return hit || k;
  }

  // ==========================================================================
  // 备份 / 存档校验与迁移
  // ==========================================================================
  function validateBackup(data) {
    const problems = [];
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return { ok: false, problems: ['不是有效的 JSON 对象'] };
    }
    if (!data.plansData || typeof data.plansData !== 'object' || Array.isArray(data.plansData)) problems.push('缺少 plansData');
    if (!data.equipment || typeof data.equipment !== 'object' || Array.isArray(data.equipment)) problems.push('缺少 equipment');
    if (!problems.length) {
      // 应用为 A/B 双日结构：缺失任一日会导致切换计划后 activeSession 为 undefined 而崩溃
      if (!data.plansData.A || typeof data.plansData.A !== 'object') problems.push('缺少 A 日计划');
      if (!data.plansData.B || typeof data.plansData.B !== 'object') problems.push('缺少 B 日计划');
      const plans = Object.values(data.plansData);
      if (!plans.length) problems.push('plansData 为空');
      for (const p of plans) {
        if (!p || typeof p !== 'object' || !p.phases || typeof p.phases !== 'object') {
          problems.push('存在缺少 phases 结构的计划');
          break;
        }
      }
    }
    return { ok: problems.length === 0, problems };
  }

  // 为每个计划补齐缺失阶段（空数组）与训练者档案；原地修改并返回
  function migratePlans(plans, phaseKeys) {
    if (!plans || typeof plans !== 'object') return plans;
    const keys = Array.isArray(phaseKeys) && phaseKeys.length ? phaseKeys : PHASE_ORDER;
    Object.values(plans).forEach(plan => {
      if (!plan || typeof plan !== 'object') return;
      if (!plan.phases || typeof plan.phases !== 'object' || Array.isArray(plan.phases)) plan.phases = {};
      keys.forEach(k => {
        if (!Array.isArray(plan.phases[k])) plan.phases[k] = [];
      });
      if (!plan.athlete || typeof plan.athlete !== 'object') plan.athlete = { bodyweight: 70, readiness: 4 };
    });
    return plans;
  }

  // 动作模式归一化：AI 常返回 "timer" / "TIME" / "bodyweight" 等变体，
  // 不归一会导致模板 === 'time' 判断全部落空，界面表现为「改了没反应」
  function normalizeMode(raw, fallback = 'weight_reps') {
    const s = String(raw == null ? '' : raw).trim().toLowerCase();
    if (['time', 'timer', 'hold', 'timed', 'time_based', 'duration'].includes(s)) return 'time';
    if (['bodyweight_reps', 'bodyweight', 'body_weight', 'bw'].includes(s)) return 'bodyweight_reps';
    if (['band_reps', 'band', 'bands', 'resistance_band'].includes(s)) return 'band_reps';
    if (['weight_reps', 'weight', 'dumbbell', 'dumbbell_reps', 'reps'].includes(s)) return 'weight_reps';
    return fallback;
  }

  // 全阶段正式组进度（不含热身组）：{ done, total }
  function planStats(plan) {
    let done = 0;
    let total = 0;
    const phases = (plan && typeof plan === 'object' && plan.phases && typeof plan.phases === 'object') ? plan.phases : {};
    Object.keys(phases).forEach(key => {
      const list = Array.isArray(phases[key]) ? phases[key] : [];
      list.forEach(ex => {
        if (!ex || !Array.isArray(ex.sets)) return;
        ex.sets.forEach(s => {
          if (!s || s.set_type === 'warmup') return;
          total++;
          if (s.done) done++;
        });
      });
    });
    return { done, total };
  }

  // 全阶段有效正式组吨位（kg）：仅统计 weight_reps 模式中已完成且非热身、重量/次数 > 0 的组
  function planVolumeKg(plan) {
    let total = 0;
    const phases = (plan && typeof plan === 'object' && plan.phases && typeof plan.phases === 'object') ? plan.phases : {};
    Object.keys(phases).forEach(key => {
      const list = Array.isArray(phases[key]) ? phases[key] : [];
      list.forEach(ex => {
        if (!ex || ex.mode !== 'weight_reps' || !Array.isArray(ex.sets)) return;
        ex.sets.forEach(s => {
          if (s && s.done && s.set_type !== 'warmup' && num(s.weight) > 0 && num(s.value) > 0) {
            total += num(s.weight) * num(s.value);
          }
        });
      });
    });
    return round2(total);
  }

  return {
    PHASE_ORDER,
    PHASE_META,
    num,
    round2,
    formatTime,
    solveDumbbellOptions,
    solveBandOptions,
    mapPrescriptionSets,
    normalizePhaseKey,
    validateBackup,
    migratePlans,
    planVolumeKg,
    planStats,
    normalizeMode
  };
});
