/* ==========================================================================
   IronPrompt Pro - 纯力量训练核心引擎
   ========================================================================== */

const { createApp, ref, reactive, computed, watch } = Vue;

const DEFAULT_EQUIPMENT = {
  dumbbellBarWeight: 0.35,
  plates: [
    { weight: 3.0, count: 8 },
    { weight: 2.5, count: 4 },
    { weight: 1.25, count: 4 }
  ],
  bands: [10, 15, 20, 25, 30]
};

const INITIAL_PLANS = {
  A: {
    athlete: { bodyweight: 70, readiness: 4 },
    avg_hr: null,
    rest_hr: null,
    coach_review: {
      summary: "卧推与深蹲轨迹控制极稳，已完全适应当前强度！",
      volume_analysis: "今日有效做功 14 组，拉/推容量比 1.2:1 (肩关节平衡健康)",
      motivation_highlight: "🔥 卧推完成质量极高，下一周期已批准加重！"
    },
    phases: {
      warmup: [
        { name: '靠墙天使', mode: 'bodyweight_reps', target: '肩胛胸壁活动度', cues: '后脑/上背/臀紧贴，下背压死', pitfalls: '严禁拱腰', tempo: [2, 1, 2], target_rest: 30, sets: [{ set_type: 'working', value: 10, done: false, feedback: '', prev_record: '自重×10' }] },
        { name: '扫帚贴背屈髋测试', mode: 'bodyweight_reps', target: '髋铰链轨迹标定', cues: '头/胸椎/尾骨三点触杆', pitfalls: '离杆即停', tempo: [3, 1, 1], target_rest: 30, sets: [{ set_type: 'working', value: 5, done: false, feedback: '', prev_record: '自重×5' }] }
      ],
      strength: [
        { name: '高脚杯深蹲', mode: 'weight_reps', overload_status: '🟢 推荐下放3秒', target: '股四头肌/臀大肌', cues: '单铃竖抱，肘贴肋，慢速下蹲平稳起', pitfalls: '膝盖内扣、弯腰前飘', tempo: [3, 1, 1], target_rest: 90, sets: [
          { set_type: 'warmup', weight: 5.35, value: 5, rpe: 6, done: false, feedback: '', prev_record: '5.35kg×5' },
          { set_type: 'working', weight: 11.35, value: 10, rpe: 8, done: false, feedback: '', prev_record: '11.35kg×10' },
          { set_type: 'working', weight: 11.35, value: 10, rpe: 8, done: false, feedback: '', prev_record: '11.35kg×10' }
        ]},
        { name: '哑铃卧推', mode: 'weight_reps', overload_status: '🟢 升级至 7.85kg', target: '胸大肌', cues: '肘躯干45°，下放大臂平行，两铃不撞', pitfalls: '肘外展90°(伤肩)', tempo: [3, 1, 1], target_rest: 90, sets: [
          { set_type: 'working', weight: 7.85, value: 10, rpe: 8, done: false, feedback: '', prev_record: '5.35kg×10' },
          { set_type: 'working', weight: 7.85, value: 10, rpe: 8, done: false, feedback: '', prev_record: '5.35kg×10' }
        ]},
        { name: '罗马尼亚硬拉 (RDL)', mode: 'weight_reps', overload_status: '🔴 维持打磨', target: '腘绳肌/臀大肌', cues: '微屈膝髋后推(屁股关门)，贴腿滑', pitfalls: '严禁弓背！腰酸立刻停', tempo: [3, 1, 1], target_rest: 90, sets: [
          { set_type: 'working', weight: 5.35, value: 10, rpe: 8, done: false, feedback: '', prev_record: '5.35kg×10' }
        ]},
        { name: '拉力绳坐姿划船', mode: 'band_reps', overload_status: '🟢 状态优异', target: '背阔肌/菱形肌', cues: '躯干竖直不动！后夹停1秒慢回', pitfalls: '身体后仰借力', tempo: [2, 1, 1], target_rest: 90, sets: [
          { set_type: 'working', weight: 35, value: 12, rpe: 8, done: false, feedback: '', prev_record: '35磅×12' }
        ]}
      ],
      cooldown: [
        { name: '髂腰肌跪姿拉伸', mode: 'time', target: '髂腰肌', cues: '收尾骨重心前移，深呼气', pitfalls: '过度挺腰', target_rest: 0, sets: [{ set_type: 'working', weight: 0, value: 30, done: false, feedback: '', prev_record: '30s' }] }
      ]
    }
  },
  B: {
    athlete: { bodyweight: 70, readiness: 4 },
    avg_hr: null,
    rest_hr: null,
    coach_review: null,
    phases: {
      warmup: [
        { name: '靠墙天使', mode: 'bodyweight_reps', target: '肩胛活动度', cues: '下背压死贴墙', pitfalls: '严禁拱腰', tempo: [2, 1, 2], target_rest: 30, sets: [{ set_type: 'working', value: 10, done: false, feedback: '', prev_record: '自重×10' }] }
      ],
      strength: [
        { name: '哑铃臀桥', mode: 'weight_reps', overload_status: '🟢 动作标准', target: '臀大肌', cues: '脚跟发力顶髋，顶端夹臀停2秒', pitfalls: '腰部反弓', tempo: [2, 2, 1], target_rest: 90, sets: [
          { set_type: 'working', weight: 5.35, value: 15, rpe: 8, done: false, feedback: '', prev_record: '5.35kg×15' }
        ]}
      ],
      cooldown: [
        { name: '全身静态拉伸', mode: 'time', target: '全身肌群下调', cues: '每处30秒深呼气', pitfalls: '憋气', target_rest: 0, sets: [{ set_type: 'working', weight: 0, value: 180, done: false, feedback: '', prev_record: '180s' }] }
      ]
    }
  }
};

createApp({
  setup() {
    const STORAGE_KEY = 'iron_prompt_static_v10';
    const EQUIP_KEY = 'iron_prompt_equip_v10';

    const currentPlan = ref('A');
    const toastMsg = ref('');
    const voiceEnabled = ref(true);
    const showConfigDrawer = ref(false);
    const configTab = ref('plan');
    const showAiReviewModal = ref(false);
    const aiImportText = ref('');

    // 阶段元数据与规范顺序（AI 处方可能引入 accessory / core 等新阶段）
    const PHASE_ORDER = ['warmup', 'strength', 'accessory', 'core', 'cooldown'];
    const PHASE_META = {
      warmup:    { baseTitle: '动态升温与激活', icon: '🔥', color: 'text-amber-400' },
      strength:  { baseTitle: '主项力量与神经募集', icon: '🏋️', color: 'text-rose-400' },
      accessory: { baseTitle: '辅助强化与细节打磨', icon: '🎯', color: 'text-cyan-400' },
      core:      { baseTitle: '核心稳定与抗旋转', icon: '🛡️', color: 'text-indigo-400' },
      cooldown:  { baseTitle: '静态拉伸与副交感下调', icon: '🧘', color: 'text-emerald-400' }
    };

    const phases = reactive(PHASE_ORDER.map(key => ({
      key,
      baseTitle: PHASE_META[key].baseTitle,
      icon: PHASE_META[key].icon,
      color: PHASE_META[key].color,
      title: ''
    })));

    const renumberPhases = () => phases.forEach((p, i) => { p.title = `${i + 1}. ${p.baseTitle}`; });
    renumberPhases();

    const addPhaseIfMissing = (key) => {
      if (phases.some(p => p.key === key)) return;
      const meta = PHASE_META[key] || { baseTitle: key, icon: '📌', color: 'text-slate-300' };
      const orderIdx = PHASE_ORDER.indexOf(key);
      const entry = { key, baseTitle: meta.baseTitle, icon: meta.icon, color: meta.color, title: '' };
      let insertAt = -1;
      if (orderIdx >= 0) insertAt = phases.findIndex(p => PHASE_ORDER.indexOf(p.key) > orderIdx);
      if (insertAt >= 0) phases.splice(insertAt, 0, entry); else phases.push(entry);
      renumberPhases();
      Object.values(plansData).forEach(plan => { if (!Array.isArray(plan.phases[key])) plan.phases[key] = []; });
    };

    const collapsedPhases = reactive({});
    const restTimer = reactive({ running: false, timeLeft: 0, timerId: null });

    const cueModal = reactive({ visible: false, ex: {} });
    const editModal = reactive({ visible: false, phaseKey: '', ex: {} });
    const weightPicker = reactive({ visible: false, ex: {}, set: {} });

    // 🎵 沉浸式节拍状态机
    const tempoCoach = reactive({
      running: false,
      timerId: null,
      phaseKey: '',
      currentEx: null,
      currentSet: null,
      exName: '',
      currentRep: 1,
      targetReps: 10,
      tempoConfig: [3, 1, 1],
      phaseState: 'eccentric',
      countdown: 3,
      phaseTitle: '慢速下放 / 离心 (3s)',
      phaseIcon: '📉',
      phaseColor: 'text-amber-400',
      dynamicCue: ''
    });

    const plansData = reactive(JSON.parse(localStorage.getItem(STORAGE_KEY)) || INITIAL_PLANS);
    const equipment = reactive(JSON.parse(localStorage.getItem(EQUIP_KEY)) || DEFAULT_EQUIPMENT);

    // 旧存档兼容：为每个计划补齐新增阶段 (accessory/core) 的空数组
    PHASE_ORDER.forEach(key => Object.values(plansData).forEach(plan => {
      if (plan.phases && !Array.isArray(plan.phases[key])) plan.phases[key] = [];
    }));

    watch(plansData, (val) => localStorage.setItem(STORAGE_KEY, JSON.stringify(val)), { deep: true });
    watch(equipment, (val) => localStorage.setItem(EQUIP_KEY, JSON.stringify(val)), { deep: true });

    const activeSession = computed(() => plansData[currentPlan.value]);

    // 主打卡视图只展示当前计划中有动作的阶段（空的 accessory/core 不占版面）
    const visiblePhases = computed(() => phases.filter(p => (activeSession.value.phases[p.key] || []).length > 0));

    const showToast = (msg) => {
      toastMsg.value = msg;
      setTimeout(() => { toastMsg.value = ''; }, 3500);
    };

    // --- 自由器械算力 ---
    const availableDumbbellOptions = computed(() => {
      const bar = parseFloat(equipment.dumbbellBarWeight) || 0;
      const plates = equipment.plates.filter(p => p.count >= 2);
      const map = new Map();

      function solve(idx, curSum, plan) {
        const totalW = Number((bar + curSum * 2).toFixed(2));
        if (!map.has(totalW)) {
          const planStr = plan.length > 0 ? plan.map(p => `${p.weight}`).join('+') : '空杆';
          map.set(totalW, { weight: totalW, label: `单边: ${planStr}` });
        }
        if (idx >= plates.length) return;

        const p = plates[idx];
        const maxPerSide = Math.floor(p.count / 2);
        for (let c = maxPerSide; c >= 0; c--) {
          if (c > 0) plan.push({ weight: p.weight, count: c });
          solve(idx + 1, Number((curSum + c * p.weight).toFixed(3)), plan);
          if (c > 0) plan.pop();
        }
      }

      solve(0, 0, []);
      return Array.from(map.values()).sort((a, b) => a.weight - b.weight);
    });

    const availableBandOptions = computed(() => {
      const bands = [...equipment.bands].sort((a, b) => a - b);
      const map = new Map();

      for (let i = 1; i < (1 << bands.length); i++) {
        let sum = 0;
        let sub = [];
        for (let j = 0; j < bands.length; j++) {
          if ((i >> j) & 1) { sum += bands[j]; sub.push(bands[j]); }
        }
        if (!map.has(sum)) {
          map.set(sum, { weight: sum, label: `叠: ${sub.join('+')}磅` });
        }
      }
      return Array.from(map.values()).sort((a, b) => a.weight - b.weight);
    });

    const getDumbbellPlateCue = (weight) => {
      const found = availableDumbbellOptions.value.find(o => o.weight === weight);
      return found ? found.label : '';
    };

    const getBandStackCue = (weight) => {
      const found = availableBandOptions.value.find(o => o.weight === weight);
      return found ? found.label : '';
    };

    const addPlateSpec = () => equipment.plates.push({ weight: 1.0, count: 4 });
    const removePlateSpec = (i) => equipment.plates.splice(i, 1);
    const addBandSpec = () => equipment.bands.push(20);
    const removeBandSpec = (i) => equipment.bands.splice(i, 1);

    const sessionVolume = computed(() => {
      let total = 0;
      activeSession.value.phases.strength.forEach(ex => {
        if (ex.mode === 'weight_reps') {
          ex.sets.forEach(s => {
            if (s.done && s.set_type !== 'warmup' && s.weight > 0 && s.value > 0) total += (s.weight * s.value);
          });
        }
      });
      return total.toFixed(1);
    });

    // --- 音频与真人语音 ---
    const playTone = (freq = 880, duration = 0.15) => {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        gain.gain.setValueAtTime(0.18, ctx.currentTime);
        osc.start();
        osc.stop(ctx.currentTime + duration);
      } catch (e) {}
    };

    const speakText = (text) => {
      if (!voiceEnabled.value || !('speechSynthesis' in window)) return;
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'zh-CN';
        u.rate = 1.15;
        window.speechSynthesis.speak(u);
      } catch(e) {}
    };

    // --- 节奏控制器 ---
    const startTempoCoach = (phaseKey, ex, set) => {
      clearInterval(tempoCoach.timerId);
      tempoCoach.phaseKey = phaseKey;
      tempoCoach.currentEx = ex;
      tempoCoach.currentSet = set;
      tempoCoach.exName = ex.name;
      tempoCoach.currentRep = 1;
      tempoCoach.targetReps = set.value || 10;
      tempoCoach.tempoConfig = Array.isArray(ex.tempo) ? ex.tempo : [3, 1, 1];
      tempoCoach.running = true;

      if (voiceEnabled.value && ex.cues) speakText(`准备，${ex.name}。口诀：${ex.cues.slice(0, 16)}`);
      setTempoPhase('eccentric', tempoCoach.tempoConfig[0]);
      playTone(330, 0.15);

      tempoCoach.timerId = setInterval(() => {
        if (tempoCoach.countdown > 1) {
          tempoCoach.countdown--;
          playTone(330, 0.08);
        } else {
          if (tempoCoach.phaseState === 'eccentric') {
            if (tempoCoach.tempoConfig[1] > 0) {
              setTempoPhase('pause', tempoCoach.tempoConfig[1]);
              playTone(440, 0.1);
            } else {
              setTempoPhase('concentric', tempoCoach.tempoConfig[2]);
              playTone(880, 0.2);
            }
          } else if (tempoCoach.phaseState === 'pause') {
            setTempoPhase('concentric', tempoCoach.tempoConfig[2]);
            playTone(880, 0.2);
          } else if (tempoCoach.phaseState === 'concentric') {
            if (tempoCoach.currentRep < tempoCoach.targetReps) {
              tempoCoach.currentRep++;
              setTempoPhase('eccentric', tempoCoach.tempoConfig[0]);
              playTone(330, 0.15);
              if (voiceEnabled.value && tempoCoach.currentRep % 3 === 0) speakText(`第${tempoCoach.currentRep}次，稳住`);
            } else {
              stopTempoCoach();
              playTone(1046, 0.5);
              if (voiceEnabled.value) speakText(`整组完成！表现优秀，进入休息`);
              handleSetCheck(tempoCoach.phaseKey, tempoCoach.currentEx, tempoCoach.currentSet);
            }
          }
        }
      }, 1000);
    };

    const setTempoPhase = (state, sec) => {
      tempoCoach.phaseState = state;
      tempoCoach.countdown = sec;
      const ex = tempoCoach.currentEx;
      if (state === 'eccentric') {
        tempoCoach.phaseTitle = `慢速下放 / 离心 (${sec}s)`;
        tempoCoach.dynamicCue = ex?.cues ? `💡 ${ex.cues}` : '控制重力，肌肉拉长不泄力';
        tempoCoach.phaseIcon = '📉';
        tempoCoach.phaseColor = 'text-amber-400';
      } else if (state === 'pause') {
        tempoCoach.phaseTitle = `底峰/顶峰停顿 (${sec}s)`;
        tempoCoach.dynamicCue = '消除惯性，保持肌肉紧绷';
        tempoCoach.phaseIcon = '⏸️';
        tempoCoach.phaseColor = 'text-purple-400';
      } else if (state === 'concentric') {
        tempoCoach.phaseTitle = `向心推起 / 发力 (${sec}s)`;
        tempoCoach.dynamicCue = ex?.target ? `🎯 专注 ${ex.target} 爆发收缩` : '平稳发力，严禁借力甩动';
        tempoCoach.phaseIcon = '📈';
        tempoCoach.phaseColor = 'text-rose-400';
      }
    };

    const stopTempoCoach = () => {
      clearInterval(tempoCoach.timerId);
      tempoCoach.running = false;
    };

    // --- 触控与两击打卡流 ---
    const stepValue = (set, delta) => {
      set.value = Math.max(1, (set.value || 10) + delta);
    };

    const toggleSetType = (set) => {
      set.set_type = (set.set_type === 'warmup') ? 'working' : 'warmup';
    };

    const handleSetCheck = (phaseKey, ex, set) => {
      if (!set.done) {
        set.showRpePicker = !set.showRpePicker;
        if (!set.showRpePicker) completeSet(phaseKey, ex, set);
      } else {
        set.done = false;
        set.showRpePicker = false;
      }
    };

    const selectRpe = (phaseKey, ex, set, rpeValue) => {
      set.rpe = rpeValue;
      set.showRpePicker = false;
      completeSet(phaseKey, ex, set);
    };

    const completeSet = (phaseKey, ex, set) => {
      set.done = true;
      playTone(880, 0.2);
      if (ex.target_rest && ex.target_rest > 0) startCustomRestTimer(ex.target_rest);

      setTimeout(() => {
        if (isPhaseFullyCompleted(phaseKey)) {
          collapsedPhases[phaseKey] = true;
          showToast(`🎉 阶段动作全部达成！`);
        }
      }, 300);
    };

    const startCustomRestTimer = (sec) => {
      clearInterval(restTimer.timerId);
      restTimer.timeLeft = sec;
      restTimer.running = true;
      restTimer.timerId = setInterval(() => {
        if (restTimer.timeLeft > 1) {
          restTimer.timeLeft--;
        } else {
          restTimer.timeLeft = 0;
          restTimer.running = false;
          clearInterval(restTimer.timerId);
          playTone(880, 0.3);
          if (voiceEnabled.value) speakText(`休息结束，准备下一组！`);
          showToast('🔔 休息结束！请准备下一组');
        }
      }, 1000);
    };

    const stopRestTimer = () => { clearInterval(restTimer.timerId); restTimer.running = false; restTimer.timeLeft = 0; };
    const adjustRestTimer = (d) => restTimer.timeLeft = Math.max(0, restTimer.timeLeft + d);
    const formatTime = (s) => `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;

    const openCueModal = (ex) => { cueModal.ex = ex; cueModal.visible = true; };
    const openQuickEditModal = (phaseKey, ex) => { editModal.phaseKey = phaseKey; editModal.ex = ex; editModal.visible = true; };
    const openWeightPicker = (ex, set) => {
      if (ex.mode === 'bodyweight_reps' || ex.mode === 'time') return;
      weightPicker.ex = ex;
      weightPicker.set = set;
      weightPicker.visible = true;
    };
    const selectWeightFromPicker = (w) => {
      weightPicker.set.weight = w;
      weightPicker.visible = false;
    };

    const togglePhaseCollapse = (k) => collapsedPhases[k] = !collapsedPhases[k];
    const isExerciseDone = (ex) => ex.sets.length > 0 && ex.sets.every(s => s.done);
    const isPhaseFullyCompleted = (k) => (activeSession.value.phases[k] || []).every(ex => isExerciseDone(ex));
    const getPhaseProgress = (k) => {
      const list = activeSession.value.phases[k] || [];
      return `${list.filter(ex => isExerciseDone(ex)).length}/${list.length}`;
    };

    const addExercise = (k) => {
      activeSession.value.phases[k].push({
        name: '新动作', mode: 'weight_reps', cues: '', target: '', pitfalls: '', tempo: [3, 1, 1], target_rest: 90,
        sets: [{ set_type: 'working', weight: 5.35, value: 10, rpe: 8, done: false, feedback: '' }]
      });
    };
    const removeExercise = (k, i) => activeSession.value.phases[k].splice(i, 1);
    const addSet = (ex) => {
      const last = ex.sets[ex.sets.length - 1];
      ex.sets.push({
        set_type: 'working',
        weight: last ? last.weight : 5.35,
        value: last ? last.value : 10,
        rpe: last ? last.rpe : 8,
        done: false,
        feedback: '',
        prev_record: last?.prev_record || ''
      });
    };

    // --- Prompt 生成与 AI 处方解析 ---
    const generateAndCopyPrompt = async () => {
      const s = activeSession.value;
      const validDumbbells = availableDumbbellOptions.value.map(o => `${o.weight}kg(${o.label})`).join(' | ');
      const validBands = availableBandOptions.value.map(o => `${o.weight}磅(${o.label})`).join(' | ');

      let md = `# Role\n你是一位拥有 NSCA-CSCS (美国体能协会体能专家认证) 的顶级力量与体能教练。请根据以下学员的【${currentPlan.value} 日全流程训练打卡记录】，进行深度复盘推演并输出下阶段处方。\n\n`;
      md += `## 1. 训练者状态与硬件物理库存约束\n`;
      md += `- 训练日: **${currentPlan.value} 日** | 今日有效正式组做功吨位: **${sessionVolume.value} kg**\n`;
      md += `- 体重: ${s.athlete.bodyweight}kg | 准备度打分: ${s.athlete.readiness}/5\n`;
      md += `- ⚠️ **物理硬件严格约束 (你给出的重量建议必须严格从此列表中选择，严禁编造无法拼出的重量)**:\n`;
      md += `  - 物理可用哑铃重量: ${validDumbbells}\n`;
      md += `  - 物理可用拉力绳磅数: ${validBands}\n\n`;

      md += `## 2. 今日打卡实录\n`;
      for (const ph of phases) {
        md += `### ${ph.title}\n`;
        const list = s.phases[ph.key];
        if (!list.length) { md += `*(无记录)*\n\n`; continue; }
        list.forEach(ex => {
          md += `**动作: ${ex.name}** | 模式: ${ex.mode} | 节奏: [${ex.tempo ? ex.tempo.join('-') : '3-1-1'}] | 口诀: ${ex.cues || '无'}\n`;
          ex.sets.forEach((set, i) => {
            const w = ex.mode === 'bodyweight_reps' ? '自重' : (ex.mode === 'time' ? `${set.value}s` : `${set.weight}${ex.mode === 'band_reps' ? '磅' : 'kg'} × ${set.value}次`);
            md += `  - 组 ${i + 1} [${set.set_type === 'warmup' ? '热身' : '正式'}]: ${w} | RPE: ${set.rpe || 8} | ${set.done ? '完成' : '未完成'}\n`;
          });
        });
        md += `\n`;
      }

      md += `## 3. 专家复盘与推演指令
1. **加重信号判定：** 检查每个动作正式组，若组组做满且末组RPE≤8，标记为 \`🟢 升级至 X.XXkg\` 并从上述可用硬件列表中选取下一档负荷；否则标记为 \`🔴 维持打磨\`。
2. **热身爬坡组安排：** 为主项安排 1 组约 50% 负荷的热身组（\`"set_type": "warmup"\`）。
3. **推拉容量平衡评估：** 计算上肢推(Push)与上肢拉(Pull)的有效组数比例，评估肩关节平衡并给出诊断。
4. **正向激励评语：** 提炼本次训练突破亮点，生成一句激励短评。

### 必须输出的标准 JSON 代码块规范:
\`\`\`json
{
  "coach_review": {
    "summary": "100字以内的专业复盘总评",
    "volume_analysis": "今日有效做功14组，推拉比例1.2:1 (肩关节平衡健康)",
    "motivation_highlight": "🔥 卧推完成质量极高，下一周期已批准加重！"
  },
  "prescription": [
    {
      "phase": "strength",
      "name": "哑铃卧推",
      "mode": "weight_reps",
      "overload_status": "🟢 升级至 7.85kg",
      "target": "胸大肌",
      "cues": "沉肩锁背，哑铃落点在胸骨剑突两侧",
      "pitfalls": "避免手腕后折",
      "tempo": [3, 1, 1],
      "target_rest": 90,
      "suggested_sets": [
        { "set_type": "warmup", "weight": 5.35, "value": 5, "rpe": 6, "prev_record": "5.35kg×5" },
        { "set_type": "working", "weight": 7.85, "value": 10, "rpe": 8, "prev_record": "7.85kg×10" },
        { "set_type": "working", "weight": 7.85, "value": 10, "rpe": 8, "prev_record": "7.85kg×10" }
      ]
    }
  ]
}
\`\`\``;

      try {
        await navigator.clipboard.writeText(md);
        showToast(`✅ 已复制带【硬件物理约束与推演指令】的 Prompt！`);
      } catch(e) { showToast('复制失败，请检查剪贴板权限'); }
    };

    const parseAIResponse = () => {
      try {
        const match = aiImportText.value.match(/```json([\s\S]*?)```/);
        const rawJson = match ? match[1].trim() : aiImportText.value.trim();
        const data = JSON.parse(rawJson);

        if (data.coach_review) activeSession.value.coach_review = data.coach_review;

        if (data.prescription && Array.isArray(data.prescription)) {
          const mapSets = (item) => (item.suggested_sets || []).map(s => ({
            set_type: s.set_type || 'working',
            weight: s.weight || 0,
            value: s.value || 10,
            rpe: s.rpe || 8,
            done: false,
            feedback: '',
            prev_record: s.prev_record || `${s.weight ? s.weight + (item.mode === 'band_reps' ? '磅' : 'kg') + '×' + s.value : s.value + (item.mode === 'time' ? 's' : '次')}`
          }));
          let updatedCount = 0, addedCount = 0;
          data.prescription.forEach(item => {
            const targetPhase = item.phase || 'strength';
            addPhaseIfMissing(targetPhase);
            const list = activeSession.value.phases[targetPhase];
            const exist = list.find(e => e.name === item.name);
            if (exist) {
              exist.mode = item.mode || exist.mode;
              exist.cues = item.cues || exist.cues;
              exist.target = item.target || exist.target;
              exist.pitfalls = item.pitfalls || exist.pitfalls;
              exist.overload_status = item.overload_status || '';
              exist.tempo = item.tempo || exist.tempo || [3, 1, 1];
              exist.target_rest = item.target_rest || exist.target_rest;
              exist.sets = mapSets(item);
              updatedCount++;
            } else {
              list.push({
                name: item.name,
                mode: item.mode || 'weight_reps',
                overload_status: item.overload_status || '',
                target: item.target || '',
                cues: item.cues || '',
                pitfalls: item.pitfalls || '',
                tempo: item.tempo || [3, 1, 1],
                target_rest: item.target_rest || 90,
                sets: mapSets(item)
              });
              addedCount++;
            }
          });
          showConfigDrawer.value = false;
          aiImportText.value = '';
          showToast(`🎉 AI 处方已装载：更新 ${updatedCount} 个动作，新增 ${addedCount} 个动作！`);
        }
      } catch(e) { alert('JSON 解析失败，请确认包含了完整的 AI 代码块'); }
    };

    // 粘贴即解析：粘贴的文本若能完整解析出处方 JSON，自动装载（解析失败则不打扰）
    const onAiPaste = () => {
      setTimeout(() => {
        const t = aiImportText.value ? aiImportText.value.trim() : '';
        if (!t.includes('"prescription"')) return;
        const m = t.match(/```json([\s\S]*?)```/);
        let ok = false;
        try { JSON.parse((m ? m[1] : t).trim()); ok = true; } catch(e) {}
        if (ok) parseAIResponse();
      }, 50);
    };

    const exportJSONBackup = () => {
      const fullBackup = { version: '5.0', exportedAt: new Date().toISOString(), equipment, plansData };
      const blob = new Blob([JSON.stringify(fullBackup, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `IronPrompt_Backup_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      showToast('📦 全量备份已导出！');
    };

    const importJSONBackup = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const data = JSON.parse(evt.target.result);
          if (data.plansData && data.equipment) {
            Object.assign(equipment, data.equipment);
            Object.assign(plansData, data.plansData);
            showToast('🎉 数据已完全恢复！');
            showConfigDrawer.value = false;
          }
        } catch (err) { alert('JSON 解析失败'); }
      };
      reader.readAsText(file);
    };

    return {
      currentPlan, phases, visiblePhases, collapsedPhases, activeSession, toastMsg, voiceEnabled, showConfigDrawer, configTab, showAiReviewModal, aiImportText,
      restTimer, tempoCoach, equipment, availableDumbbellOptions, availableBandOptions, sessionVolume,
      cueModal, editModal, weightPicker,
      openCueModal, openQuickEditModal, openWeightPicker, selectWeightFromPicker,
      stepValue, toggleSetType, handleSetCheck, selectRpe,
      startTempoCoach, stopTempoCoach, stopRestTimer, adjustRestTimer, formatTime, togglePhaseCollapse,
      isExerciseDone, isPhaseFullyCompleted, getPhaseProgress,
      addExercise, removeExercise, addSet, addPlateSpec, removePlateSpec, addBandSpec, removeBandSpec,
      getDumbbellPlateCue, getBandStackCue,
      generateAndCopyPrompt, parseAIResponse, onAiPaste, exportJSONBackup, importJSONBackup
    };
  }
}).mount('#app');