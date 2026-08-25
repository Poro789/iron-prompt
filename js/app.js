/* ==========================================================================
   IronPrompt Pro - 纯力量训练核心引擎
   纯函数逻辑位于 js/core.js（window.IronPromptCore，可单测），本文件只负责 UI 状态。
   ========================================================================== */

const { createApp, ref, reactive, computed, watch } = Vue;
const Core = window.IronPromptCore;

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
    const VOICE_KEY = 'iron_prompt_voice_v1';
    const APP_VERSION = '1.3.0';

    const currentPlan = ref('A');
    const toastMsg = ref('');
    const showConfigDrawer = ref(false);
    const configTab = ref('plan');
    const showAiReviewModal = ref(false);
    const aiImportText = ref('');

    // 语音开关持久化（刷新不丢）
    const voiceEnabled = ref(true);
    try { if (localStorage.getItem(VOICE_KEY) === '0') voiceEnabled.value = false; } catch (e) {}
    watch(voiceEnabled, (v) => { try { localStorage.setItem(VOICE_KEY, v ? '1' : '0'); } catch (e) {} });

    // 阶段元数据与规范顺序（AI 处方可能引入 accessory / core 等新阶段）
    const PHASE_ORDER = Core.PHASE_ORDER;
    const PHASE_META = Core.PHASE_META;

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
      Object.values(plansData).forEach(plan => { if (plan && !Array.isArray(plan.phases[key])) plan.phases[key] = []; });
    };

    const collapsedPhases = reactive({});

    const cueModal = reactive({ visible: false, ex: {} });
    // 快速编辑：草稿对象，保存才写回（支持取消）
    const editModal = reactive({ visible: false, phaseKey: '', ex: null, draft: null });
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

    // ---- 本地存储：读取带校验、写入防抖 + 异常捕获 ----
    const readStorage = (key) => {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const data = JSON.parse(raw);
        return (data && typeof data === 'object' && !Array.isArray(data)) ? data : null;
      } catch (e) { return null; }
    };

    const storedPlans = readStorage(STORAGE_KEY);
    // 首启（空存档）与老存档统一走迁移：补齐 accessory/core 等阶段键与训练者档案（回归 R1）
    const plansData = reactive(Core.migratePlans(
      storedPlans ? storedPlans : JSON.parse(JSON.stringify(INITIAL_PLANS)),
      PHASE_ORDER
    ));

    const storedEquip = readStorage(EQUIP_KEY);
    const equipment = reactive(
      (storedEquip && Array.isArray(storedEquip.plates) && Array.isArray(storedEquip.bands))
        ? storedEquip
        : JSON.parse(JSON.stringify(DEFAULT_EQUIPMENT))
    );

    let saveTimers = {};
    let storageWarned = false;
    const persist = (key, val) => {
      try {
        localStorage.setItem(key, JSON.stringify(val));
        storageWarned = false;
      } catch (e) {
        if (!storageWarned) {
          storageWarned = true;
          showToast('⚠️ 本地存储写入失败（隐私模式或空间不足），数据仅本次会话有效');
        }
      }
    };
    const scheduleSave = (key, val) => {
      clearTimeout(saveTimers[key]);
      saveTimers[key] = setTimeout(() => persist(key, val), 400);
    };
    const flushSaves = () => {
      Object.keys(saveTimers).forEach(k => { clearTimeout(saveTimers[k]); saveTimers[k] = null; });
      persist(STORAGE_KEY, plansData);
      persist(EQUIP_KEY, equipment);
    };

    watch(plansData, (val) => scheduleSave(STORAGE_KEY, val), { deep: true });
    watch(equipment, (val) => scheduleSave(EQUIP_KEY, val), { deep: true });

    const activeSession = computed(() => plansData[currentPlan.value]);

    // 主打卡视图只展示当前计划中有动作的阶段（空的 accessory/core 不占版面）
    const visiblePhases = computed(() => phases.filter(p => (activeSession.value.phases[p.key] || []).length > 0));

    // Toast：单一定时器，新消息先清旧计时
    let toastTimer = null;
    const showToast = (msg) => {
      clearTimeout(toastTimer);
      toastMsg.value = msg;
      toastTimer = setTimeout(() => { toastMsg.value = ''; }, 3500);
    };

    // --- 自由器械算力（core.js：DP 防爆炸 + 数值归一） ---
    const availableDumbbellOptions = computed(() => Core.solveDumbbellOptions(equipment.dumbbellBarWeight, equipment.plates));
    const availableBandOptions = computed(() => Core.solveBandOptions(equipment.bands));

    const getDumbbellPlateCue = (weight) => {
      const found = availableDumbbellOptions.value.find(o => o.weight === Core.num(weight));
      return found ? found.label : '';
    };

    const getBandStackCue = (weight) => {
      const found = availableBandOptions.value.find(o => o.weight === Core.num(weight));
      return found ? found.label : '';
    };

    const addPlateSpec = () => equipment.plates.push({ weight: 1.0, count: 4 });
    const removePlateSpec = (i) => equipment.plates.splice(i, 1);
    const addBandSpec = () => equipment.bands.push(20);
    const removeBandSpec = (i) => equipment.bands.splice(i, 1);

    // 本次训练吨位：全阶段有效正式组（core.js）
    const sessionVolume = computed(() => Core.planVolumeKg(activeSession.value).toFixed(1));
    // 本次训练正式组进度（桌面侧栏统计用）
    const sessionStats = computed(() => Core.planStats(activeSession.value));

    // --- 音频：单例 AudioContext（修复每次新建导致 ~6 次后静音） ---
    let audioCtx = null;
    const ensureAudio = () => {
      try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        return audioCtx;
      } catch (e) { return null; }
    };
    const playTone = (freq = 880, duration = 0.15) => {
      if (!voiceEnabled.value) return; // 静音开关同时覆盖提示音
      const ctx = ensureAudio();
      if (!ctx) return;
      try {
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

    let speakTimer = null;
    const speakText = (text) => {
      if (!voiceEnabled.value || !('speechSynthesis' in window)) return;
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'zh-CN';
        u.rate = 1.15;
        // 延迟 speak 规避 Chrome cancel→speak 竞态丢字
        clearTimeout(speakTimer);
        speakTimer = setTimeout(() => window.speechSynthesis.speak(u), 80);
      } catch (e) {}
    };
    const cancelSpeech = () => {
      try {
        clearTimeout(speakTimer);
        speakTimer = null;
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      } catch (e) {}
    };

    // --- 节奏控制器 ---
    const startTempoCoach = (phaseKey, ex, set) => {
      clearInterval(tempoCoach.timerId);
      tempoCoach.phaseKey = phaseKey;
      tempoCoach.currentEx = ex;
      tempoCoach.currentSet = set;
      tempoCoach.exName = ex.name;
      tempoCoach.currentRep = 1;
      tempoCoach.targetReps = Core.num(set.value, 10);
      tempoCoach.tempoConfig = Array.isArray(ex.tempo) ? ex.tempo : [3, 1, 1];
      tempoCoach.running = true;

      if (voiceEnabled.value && ex.cues) speakText(`准备，${ex.name}。口诀：${ex.cues}`);
      setTempoPhase('eccentric', Core.num(tempoCoach.tempoConfig[0], 3));
      playTone(330, 0.15);

      tempoCoach.timerId = setInterval(() => {
        if (tempoCoach.countdown > 1) {
          tempoCoach.countdown--;
          playTone(330, 0.08);
        } else {
          if (tempoCoach.phaseState === 'eccentric') {
            if (Core.num(tempoCoach.tempoConfig[1]) > 0) {
              setTempoPhase('pause', Core.num(tempoCoach.tempoConfig[1]));
              playTone(440, 0.1);
            } else {
              setTempoPhase('concentric', Core.num(tempoCoach.tempoConfig[2], 1));
              playTone(880, 0.2);
            }
          } else if (tempoCoach.phaseState === 'pause') {
            setTempoPhase('concentric', Core.num(tempoCoach.tempoConfig[2], 1));
            playTone(880, 0.2);
          } else if (tempoCoach.phaseState === 'concentric') {
            if (tempoCoach.currentRep < tempoCoach.targetReps) {
              tempoCoach.currentRep++;
              setTempoPhase('eccentric', Core.num(tempoCoach.tempoConfig[0], 3));
              playTone(330, 0.15);
              if (voiceEnabled.value && tempoCoach.currentRep % 3 === 0) speakText(`第${tempoCoach.currentRep}次，稳住`);
            } else {
              // 带练结束 = 真正打卡完成（修复原「假完成」：只弹 RPE 面板不打勾）
              const s = tempoCoach.currentSet;
              const exRef = tempoCoach.currentEx;
              const pk = tempoCoach.phaseKey;
              if (s && !s.done) {
                if (!s.rpe) s.rpe = 8;
                stopTempoCoach(false);
                playTone(1046, 0.5);
                if (voiceEnabled.value) speakText(`整组完成！表现优秀，进入休息`);
                completeSet(pk, exRef, s);
              } else {
                stopTempoCoach(false);
              }
            }
          }
        }
      }, 1000);
    };

    const setTempoPhase = (state, sec) => {
      tempoCoach.phaseState = state;
      tempoCoach.countdown = Math.max(0, Math.round(Core.num(sec, 1)));
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

    const stopTempoCoach = (cancelVoice = false) => {
      clearInterval(tempoCoach.timerId);
      if (cancelVoice && tempoCoach.running) cancelSpeech();
      tempoCoach.running = false;
    };

    // --- 触控与两击打卡流 ---
    const stepValue = (ex, set, delta) => {
      const step = ex.mode === 'time' ? 5 : 1; // 计时模式按 5s 步进
      set.value = Math.max(step, (Core.num(set.value, 10) + delta * step));
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
      try { if (navigator.vibrate) navigator.vibrate(30); } catch (e) {}
      playTone(880, 0.2);
      if (ex.target_rest && Core.num(ex.target_rest) > 0) startCustomRestTimer(Core.num(ex.target_rest, 90));

      setTimeout(() => {
        if (isPhaseFullyCompleted(phaseKey)) {
          collapsedPhases[phaseKey] = true;
          showToast(`🎉 阶段动作全部达成！`);
        }
      }, 300);
    };

    // 组间休息计时器：墙钟基准（修复 setInterval 累积漂移）
    const restTimer = reactive({ running: false, timeLeft: 0, deadline: 0, timerId: null });

    const tickRest = () => {
      const left = Math.max(0, Math.ceil((restTimer.deadline - Date.now()) / 1000));
      if (left !== restTimer.timeLeft) restTimer.timeLeft = left;
      if (left <= 0) {
        restTimer.running = false;
        clearInterval(restTimer.timerId);
        restTimer.timerId = null;
        playTone(880, 0.3);
        if (voiceEnabled.value) speakText(`休息结束，准备下一组！`);
        showToast('🔔 休息结束！请准备下一组');
      }
    };

    const startCustomRestTimer = (sec) => {
      clearInterval(restTimer.timerId);
      const s = Math.max(1, Math.round(Core.num(sec, 90)));
      restTimer.deadline = Date.now() + s * 1000;
      restTimer.timeLeft = s;
      restTimer.running = true;
      restTimer.timerId = setInterval(tickRest, 250);
    };

    const stopRestTimer = () => {
      clearInterval(restTimer.timerId);
      restTimer.timerId = null;
      restTimer.running = false;
      restTimer.timeLeft = 0;
      restTimer.deadline = 0;
    };

    const adjustRestTimer = (d) => {
      if (!restTimer.running) return;
      restTimer.deadline += d * 1000;
      restTimer.timeLeft = Math.max(0, Math.ceil((restTimer.deadline - Date.now()) / 1000));
    };

    const startManualRest = () => { if (!restTimer.running) startCustomRestTimer(90); };

    const formatTime = Core.formatTime;

    const openCueModal = (ex) => { cueModal.ex = ex; cueModal.visible = true; };

    // 快速编辑：草稿模式，保存才写回真实对象
    const openQuickEditModal = (phaseKey, ex) => {
      editModal.phaseKey = phaseKey;
      editModal.ex = ex;
      editModal.draft = {
        name: ex.name,
        mode: ex.mode || 'weight_reps',
        cues: ex.cues || '',
        target: ex.target || '',
        pitfalls: ex.pitfalls || '',
        tempo: Array.isArray(ex.tempo) ? ex.tempo.slice() : [3, 1, 1],
        target_rest: Core.num(ex.target_rest, 90)
      };
      editModal.visible = true;
    };
    const saveQuickEdit = () => {
      const d = editModal.draft;
      const ex = editModal.ex;
      editModal.visible = false;
      if (!d || !ex) return;
      ex.name = String(d.name || '新动作').trim() || '新动作';
      ex.mode = d.mode;
      ex.cues = d.cues || '';
      ex.target = d.target || '';
      ex.pitfalls = d.pitfalls || '';
      ex.tempo = [Math.max(0, Math.round(Core.num(d.tempo[0], 3))), Math.max(0, Math.round(Core.num(d.tempo[1], 1))), Math.max(0, Math.round(Core.num(d.tempo[2], 1)))];
      ex.target_rest = Math.max(0, Math.round(Core.num(d.target_rest, 90)));
      showToast('✅ 已保存微调');
    };
    const cancelQuickEdit = () => { editModal.visible = false; };

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
    const removeExercise = (k, i) => {
      if (confirm('删除该动作？此操作不可撤销。')) activeSession.value.phases[k].splice(i, 1);
    };
    const addSet = (ex) => {
      const last = ex.sets[ex.sets.length - 1];
      ex.sets.push({
        set_type: 'working',
        weight: last ? (last.weight != null ? last.weight : undefined) : 5.35,
        value: last ? (last.value != null ? last.value : 10) : 10,
        rpe: last ? (last.rpe != null ? last.rpe : 8) : 8,
        done: false,
        feedback: '',
        prev_record: last?.prev_record || ''
      });
    };

    // A/B 切换：停止带练（含语音），避免跨计划串扰
    const switchPlan = (p) => {
      if (p === currentPlan.value) return;
      stopTempoCoach(true);
      currentPlan.value = p;
      showToast(`已切换到 ${p} 日计划`);
    };

    // 🌅 新训练日：清空 A/B 两日全部打卡状态（保留负荷/次数/RPE 记录）
    const startNewDay = () => {
      if (!confirm('开始新训练日？\n\nA/B 两日所有已打卡（✓）状态将被清空，训练吨位归零；动作、负荷与 RPE 记录保留。')) return;
      let n = 0;
      Object.values(plansData).forEach(plan => {
        if (!plan || typeof plan.phases !== 'object' || !plan.phases) return;
        Object.values(plan.phases).forEach(list => {
          (Array.isArray(list) ? list : []).forEach(ex => {
            (Array.isArray(ex.sets) ? ex.sets : []).forEach(s => {
              if (s.done) { s.done = false; n++; }
            });
          });
        });
      });
      Object.keys(collapsedPhases).forEach(k => delete collapsedPhases[k]);
      stopRestTimer();
      stopTempoCoach(true); // 回归 R2：重置时停止进行中的带练，避免结束后重新打勾
      showToast(`🌅 新训练日开始！已重置 ${n} 组打卡`);
    };

    // --- Prompt 生成与 AI 处方解析 ---
    const copyToClipboard = async (text) => {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      return ok;
    };

    const generateAndCopyPrompt = async () => {
      const s = activeSession.value;
      const validDumbbells = availableDumbbellOptions.value.map(o => `${o.weight}kg(${o.label})`).join(' | ');
      const validBands = availableBandOptions.value.map(o => `${o.weight}磅(${o.label})`).join(' | ');

      let md = `# Role\n你是一位拥有 NSCA-CSCS (美国体能协会体能专家认证) 的顶级力量与体能教练。请根据以下学员的【${currentPlan.value} 日全流程训练打卡记录】，进行深度复盘推演并输出下阶段处方。\n\n`;
      md += `## 1. 训练者状态与硬件物理库存约束\n`;
      md += `- 训练日: **${currentPlan.value} 日** | 今日有效正式组做功吨位: **${sessionVolume.value} kg**\n`;
      md += `- 体重: ${Core.num(s.athlete.bodyweight)}kg | 准备度打分: ${Core.num(s.athlete.readiness)}/5\n`;
      md += `- ⚠️ **物理硬件严格约束 (你给出的重量建议必须严格从此列表中选择，严禁编造无法拼出的重量)**:\n`;
      md += `  - 物理可用哑铃重量: ${validDumbbells}\n`;
      md += `  - 物理可用拉力绳磅数: ${validBands}\n\n`;

      md += `## 2. 今日打卡实录\n`;
      for (const ph of phases) {
        md += `### ${ph.title}\n`;
        const list = s.phases[ph.key] || [];
        if (!list.length) { md += `*(无记录)*\n\n`; continue; }
        list.forEach(ex => {
          md += `**动作: ${ex.name}** | 模式: ${ex.mode} | 节奏: [${ex.tempo ? ex.tempo.join('-') : '3-1-1'}] | 口诀: ${ex.cues || '无'}\n`;
          ex.sets.forEach((set, i) => {
            const w = ex.mode === 'bodyweight_reps' ? '自重' : (ex.mode === 'time' ? `${set.value}s` : `${set.weight}${ex.mode === 'band_reps' ? '磅' : 'kg'} × ${set.value}次`);
            md += `  - 组 ${i + 1} [${set.set_type === 'warmup' ? '热身' : '正式'}]: ${w} | RPE: ${Core.num(set.rpe, 8)} | ${set.done ? '完成' : '未完成'}\n`;
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

      const ok = await copyToClipboard(md);
      showToast(ok ? '✅ 已复制带【硬件物理约束与推演指令】的 Prompt！' : '❌ 复制失败，请检查剪贴板权限');
    };

    const parseAIResponse = () => {
      const text = (aiImportText.value || '').trim();
      if (!text) { showToast('请先粘贴 AI 回复'); return; }
      const match = text.match(/```json([\s\S]*?)```/);
      const rawJson = match ? match[1].trim() : text;
      let data;
      try {
        data = JSON.parse(rawJson);
      } catch (e) {
        showToast('❌ JSON 解析失败，请确认粘贴了完整的 AI 代码块');
        return;
      }

      const normTempo = (t) => Array.isArray(t) ? t.map(v => Math.max(0, Math.round(Core.num(v, 1)))) : null;

      let reviewLoaded = false;
      if (data.coach_review && typeof data.coach_review === 'object' && !Array.isArray(data.coach_review)) {
        activeSession.value.coach_review = {
          summary: '',
          volume_analysis: '',
          motivation_highlight: '',
          ...data.coach_review
        };
        reviewLoaded = true;
      }

      if (data.prescription && Array.isArray(data.prescription)) {
        let updatedCount = 0, addedCount = 0, skippedCount = 0;
        data.prescription.forEach(item => {
          if (!item || !item.name) { skippedCount++; return; }
          const targetPhase = Core.normalizePhaseKey(item.phase, phases.map(p => p.key));
          addPhaseIfMissing(targetPhase);
          const list = activeSession.value.phases[targetPhase];
          const exist = list.find(e => e.name === item.name);
          let sets = Core.mapPrescriptionSets(item);
          if (!sets.length) {
            // 空处方动作：补一个默认正式组，避免产生永远无法完成的卡片
            sets = [{
              set_type: 'working',
              weight: item.mode === 'weight_reps' ? 5.35 : 0,
              value: item.mode === 'time' ? 30 : 10,
              rpe: 8, done: false, feedback: '', prev_record: ''
            }];
          }
          if (exist) {
            exist.mode = item.mode || exist.mode;
            exist.cues = item.cues || exist.cues;
            exist.target = item.target || exist.target;
            exist.pitfalls = item.pitfalls || exist.pitfalls;
            exist.overload_status = (item.overload_status != null && item.overload_status !== '') ? item.overload_status : (exist.overload_status || '');
            exist.tempo = normTempo(item.tempo) || (exist.tempo || [3, 1, 1]);
            exist.target_rest = item.target_rest != null ? item.target_rest : exist.target_rest;
            exist.sets = sets;
            updatedCount++;
          } else {
            list.push({
              name: item.name,
              mode: item.mode || 'weight_reps',
              overload_status: item.overload_status || '',
              target: item.target || '',
              cues: item.cues || '',
              pitfalls: item.pitfalls || '',
              tempo: normTempo(item.tempo) || [3, 1, 1],
              target_rest: item.target_rest != null ? item.target_rest : 90,
              sets
            });
            addedCount++;
          }
        });
        showConfigDrawer.value = false;
        aiImportText.value = '';
        showToast(`🎉 AI 处方已装载：更新 ${updatedCount} 个 / 新增 ${addedCount} 个动作${skippedCount ? `（跳过 ${skippedCount} 条无效）` : ''}${reviewLoaded ? '，复盘看板已更新' : ''}！`);
      } else if (reviewLoaded) {
        aiImportText.value = '';
        showToast('🏆 AI 复盘已装载（顶部胶囊条已更新）');
      } else {
        showToast('❌ 未在回复中找到 coach_review 或 prescription 字段');
      }
    };

    // 粘贴即解析：粘贴的文本若能完整解析出 AI 数据，自动装载（解析失败则不打扰）
    const onAiPaste = () => {
      setTimeout(() => {
        const t = (aiImportText.value || '').trim();
        if (!t.includes('"prescription"') && !t.includes('"coach_review"')) return;
        const m = t.match(/```json([\s\S]*?)```/);
        let ok = false;
        try { JSON.parse((m ? m[1] : t).trim()); ok = true; } catch (e) {}
        if (ok) parseAIResponse();
      }, 50);
    };

    const exportJSONBackup = () => {
      const fullBackup = { version: APP_VERSION, exportedAt: new Date().toISOString(), equipment, plansData };
      const blob = new Blob([JSON.stringify(fullBackup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `IronPrompt_Backup_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      showToast('📦 全量备份已导出！');
    };

    const importJSONBackup = (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = ''; // 允许连续重选同一文件
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        let data;
        try {
          data = JSON.parse(evt.target.result);
        } catch (err) {
          showToast('❌ 备份文件解析失败：不是有效的 JSON');
          return;
        }
        const check = Core.validateBackup(data);
        if (!check.ok) {
          showToast('❌ 备份文件无效：' + check.problems.join('、'));
          return;
        }
        if (!confirm('还原备份将覆盖当前全部数据（A/B 计划 + 器械库存），继续？')) return;

        // 器械：整组替换，避免残留旧键
        Object.keys(equipment).forEach(k => delete equipment[k]);
        Object.assign(equipment, data.equipment);

        // 计划：合并当前与备份中的全部阶段键（含自定义阶段）后统一迁移
        const keySet = new Set(phases.map(p => p.key));
        Object.values(data.plansData).forEach(plan => {
          if (plan && plan.phases && typeof plan.phases === 'object') {
            Object.keys(plan.phases).forEach(k => keySet.add(k));
          }
        });
        const migrated = Core.migratePlans(data.plansData, [...keySet]);
        Object.keys(plansData).forEach(k => delete plansData[k]);
        Object.assign(plansData, migrated);
        [...keySet].forEach(k => addPhaseIfMissing(k));

        showConfigDrawer.value = false;
        showToast('🎉 数据已完全恢复！');
      };
      reader.readAsText(file);
    };

    // 键盘：Esc 关闭最上层弹窗；R 开始/停止组间休息（输入框聚焦时忽略）
    const onKeydown = (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.key === 'Escape') {
        if (weightPicker.visible) weightPicker.visible = false;
        else if (editModal.visible) editModal.visible = false;
        else if (cueModal.visible) cueModal.visible = false;
        else if (showAiReviewModal.value) showAiReviewModal.value = false;
        else if (showConfigDrawer.value) showConfigDrawer.value = false;
        return;
      }
      if (e.key === 'r' || e.key === 'R') {
        if (restTimer.running) { stopRestTimer(); showToast('⏱ 休息计时已停止'); }
        else { startManualRest(); showToast('⏱ 组间休息 90s 开始'); }
      }
    };
    window.addEventListener('keydown', onKeydown);
    window.addEventListener('pagehide', flushSaves);

    return {
      currentPlan, switchPlan, phases, visiblePhases, collapsedPhases, activeSession, toastMsg, voiceEnabled, showConfigDrawer, configTab, showAiReviewModal, aiImportText,
      restTimer, tempoCoach, equipment, availableDumbbellOptions, availableBandOptions, sessionVolume, sessionStats,
      appVersion: APP_VERSION,
      cueModal, editModal, weightPicker,
      openCueModal, openQuickEditModal, saveQuickEdit, cancelQuickEdit, openWeightPicker, selectWeightFromPicker,
      stepValue, toggleSetType, handleSetCheck, selectRpe,
      startTempoCoach, stopTempoCoach, stopRestTimer, adjustRestTimer, startManualRest, formatTime, togglePhaseCollapse,
      isExerciseDone, isPhaseFullyCompleted, getPhaseProgress,
      addExercise, removeExercise, addSet, addPlateSpec, removePlateSpec, addBandSpec, removeBandSpec,
      getDumbbellPlateCue, getBandStackCue,
      generateAndCopyPrompt, parseAIResponse, onAiPaste, exportJSONBackup, importJSONBackup,
      startNewDay
    };
  }
}).mount('#app');
