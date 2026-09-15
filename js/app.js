'use strict';
/* =====================================================================
 * Iron Log —— 力量训练记录（单文件版）
 * 核心闭环：今日训练 / 自动保存 / 导出给 AI（数据快照 + 固定分析 prompt）/ 导入 AI 方案
 * 数据（四层，不混存）：
 *   state.logs       训练日志：日期/动作/组·重量·次数·时长/RPE/完成标记/当日状态/用时
 *   state.exercises  动作库：肌群/模式/单位/要点/避坑/节奏/替代/个人
 *   state.program    训练计划：A/B 日、分区、逐组规格(type/weight/reps/duration/rpe目标)
 *   state.sessions   进行中的记录（按 A/B 分存，未结束前不写入 logs）
 * 导出快照（Export）为 P0-3：由 logs 即时打包生成，不单独存储。
 * =================================================================== */

const LS_KEY = 'ironlog.v1';
const APP_VERSION = '0.9.0';   // 唯一版本源：页头徽章与「关于」卡片都从这里渲染；CI 会用它给 sw.js 打缓存版本戳
const TREND_WINDOW = 12;       // 趋势计算回看的训练次数（导出原始日志仍只带用户选的 N 次）

/* ---------------- 占位种子数据（导入 AI 方案后替换；旧格式由 migrate 归一化） ---------------- */
const SEED = {
  version: 1,
  settings: { lastDay: 'A', weightStep: 2.5, restSec: 90, restNote: '' },
  profile: { background: '体态问题：X 型腿、肋骨外扩\n目标：增肌 + 改善体态\n（请补充：身高体重、训练水平、器械范围与上限）' },
  program: {
    A: [
      { section:'1. 动态升温与激活', exerciseId:'wall_angel',        sets:[{type:'work',   weight:null,   reps:10,  duration:null, rpe:6}] },
      { section:'1. 动态升温与激活', exerciseId:'broom_hinge',       sets:[{type:'work',   weight:null,   reps:5,   duration:null, rpe:6}] },
      { section:'1. 动态升温与激活', exerciseId:'cat_cow',           sets:[{type:'work',   weight:null,   reps:8,   duration:null, rpe:6}] },
      { section:'1. 动态升温与激活', exerciseId:'glute_bridge',      sets:[{type:'work',   weight:null,   reps:15,  duration:null, rpe:6}] },
      { section:'1. 动态升温与激活', exerciseId:'bw_squat',          sets:[{type:'work',   weight:null,   reps:15,  duration:null, rpe:6}] },
      { section:'1. 动态升温与激活', exerciseId:'band_pull_apart',   sets:[{type:'work',   weight:10,     reps:15,  duration:null, rpe:6}] },
      { section:'1. 动态升温与激活', exerciseId:'empty_bar_warmup', sets:[{type:'warmup', weight:null,   reps:10,  duration:null, rpe:6}] },
      { section:'2. 主项力量与神经募集', exerciseId:'goblet_squat',  sets:[{type:'warmup', weight:5.35,   reps:10,  duration:null, rpe:6},{type:'work', weight:11.35, reps:10, duration:null, rpe:8},{type:'work', weight:11.35, reps:10, duration:null, rpe:9}] },
      { section:'2. 主项力量与神经募集', exerciseId:'db_bench',      sets:[{type:'warmup', weight:2.85,   reps:10,  duration:null, rpe:6},{type:'work', weight:7.85,  reps:10, duration:null, rpe:8},{type:'work', weight:7.85,  reps:10, duration:null, rpe:7.5},{type:'work', weight:7.85,  reps:10, duration:null, rpe:9.5}] },
      { section:'2. 主项力量与神经募集', exerciseId:'rdl',           sets:[{type:'warmup', weight:2.85,   reps:10,  duration:null, rpe:7.5},{type:'work', weight:5.35, reps:10, duration:null, rpe:8.5},{type:'work', weight:5.35,  reps:10, duration:null, rpe:8}] },
      { section:'2. 主项力量与神经募集', exerciseId:'band_row',      sets:[{type:'warmup', weight:15,     reps:12,  duration:null, rpe:6},{type:'work', weight:25,    reps:12, duration:null, rpe:8},{type:'work', weight:35,    reps:12, duration:null, rpe:8.5}] },
      { section:'2. 主项力量与神经募集', exerciseId:'db_shrug_push', sets:[{type:'warmup', weight:0.35,   reps:10,  duration:null, rpe:8},{type:'work', weight:2.85,  reps:10, duration:null, rpe:9},{type:'work', weight:2.85,  reps:10, duration:null, rpe:9.5},{type:'work', weight:2.85,  reps:10, duration:null, rpe:9.5}] },
      { section:'3. 辅助强化与细节打磨', exerciseId:'band_face_pull',sets:[{type:'work',   weight:10,     reps:15,  duration:null, rpe:8.5},{type:'work', weight:10,   reps:15, duration:null, rpe:9}] },
      { section:'4. 核心稳定与抗旋转', exerciseId:'plank',           sets:[{type:'work',   weight:null,   reps:null, duration:30,  rpe:7},{type:'work', weight:null, reps:null, duration:25, rpe:7},{type:'work', weight:null, reps:null, duration:25, rpe:7},{type:'work', weight:null, reps:null, duration:25, rpe:7}] },
      { section:'4. 核心稳定与抗旋转', exerciseId:'bird_dog',        sets:[{type:'work',   weight:null,   reps:10,  duration:null, rpe:8},{type:'work', weight:null, reps:10,  duration:null, rpe:8.5}] },
      { section:'5. 静态拉伸与副交感下调', exerciseId:'hip_flexor_stretch', sets:[{type:'work', weight:null, reps:null, duration:30, rpe:5},{type:'work', weight:null, reps:null, duration:30, rpe:5}] },
      { section:'5. 静态拉伸与副交感下调', exerciseId:'hamstring_stretch', sets:[{type:'work', weight:null, reps:null, duration:30, rpe:5},{type:'work', weight:null, reps:null, duration:30, rpe:5}] },
      { section:'5. 静态拉伸与副交感下调', exerciseId:'quad_stretch',      sets:[{type:'work', weight:null, reps:null, duration:30, rpe:5},{type:'work', weight:null, reps:null, duration:30, rpe:5}] },
      { section:'5. 静态拉伸与副交感下调', exerciseId:'glute_figure4',     sets:[{type:'work', weight:null, reps:null, duration:30, rpe:5},{type:'work', weight:null, reps:null, duration:30, rpe:5}] },
      { section:'5. 静态拉伸与副交感下调', exerciseId:'pec_doorway',       sets:[{type:'work', weight:null, reps:null, duration:30, rpe:5},{type:'work', weight:null, reps:null, duration:30, rpe:5},{type:'work', weight:null, reps:null, duration:30, rpe:5},{type:'work', weight:null, reps:null, duration:30, rpe:5}] },
      { section:'5. 静态拉伸与副交感下调', exerciseId:'lat_kneeling',      sets:[{type:'work', weight:null, reps:null, duration:30, rpe:5}] },
      { section:'5. 静态拉伸与副交感下调', exerciseId:'child_pose',        sets:[{type:'work', weight:null, reps:null, duration:30, rpe:4}] },
      { section:'5. 静态拉伸与副交感下调', exerciseId:'parasympathetic_breath', sets:[{type:'work', weight:null, reps:null, duration:60, rpe:3}] }
    ],
    B: [
      { section:'热身 8 分钟', exerciseId:'wall_angel',    sets:[{type:'work', weight:null, reps:10, duration:null, rpe:6}] },
      { section:'热身 8 分钟', exerciseId:'broom_hinge',   sets:[{type:'work', weight:null, reps:5,  duration:null, rpe:6}] },
      { section:'热身 8 分钟', exerciseId:'cat_cow',       sets:[{type:'work', weight:null, reps:8,  duration:null, rpe:6}] },
      { section:'热身 8 分钟', exerciseId:'clamshell',     sets:[{type:'work', weight:null, reps:15, duration:null, rpe:6, side:'L'},{type:'work', weight:null, reps:15, duration:null, rpe:6, side:'R'}] },
      { section:'热身 8 分钟', exerciseId:'bw_squat',      sets:[{type:'work', weight:null, reps:15, duration:null, rpe:6}] },
      { section:'热身 8 分钟', exerciseId:'empty_bar_warmup', sets:[{type:'warmup', weight:null, reps:10, duration:null, rpe:6}] },
      { section:'主课（组间90秒，动作间2分钟）', exerciseId:'db_glute_bridge', sets:[{type:'work', weight:null, reps:15, duration:null, rpe:8},{type:'work', weight:null, reps:15, duration:null, rpe:8}] },
      { section:'主课（组间90秒，动作间2分钟）', exerciseId:'bulgarian_squat', sets:[{type:'work', weight:null, reps:10, duration:null, rpe:8, side:'L'},{type:'work', weight:null, reps:10, duration:null, rpe:8, side:'R'}] },
      { section:'主课（组间90秒，动作间2分钟）', exerciseId:'incline_db_bench', sets:[{type:'work', weight:5, reps:10, duration:null, rpe:8},{type:'work', weight:5, reps:10, duration:null, rpe:8},{type:'work', weight:5, reps:10, duration:null, rpe:8}] },
      { section:'主课（组间90秒，动作间2分钟）', exerciseId:'band_row',        sets:[{type:'work', weight:15, reps:12, duration:null, rpe:8},{type:'work', weight:15, reps:12, duration:null, rpe:8}] },
      { section:'主课（组间90秒，动作间2分钟）', exerciseId:'lateral_raise',   sets:[{type:'work', weight:null, reps:12, duration:null, rpe:8},{type:'work', weight:null, reps:12, duration:null, rpe:8}] },
      { section:'主课（组间90秒，动作间2分钟）', exerciseId:'band_external_rot', sets:[{type:'work', weight:10, reps:15, duration:null, rpe:8, side:'L'},{type:'work', weight:10, reps:15, duration:null, rpe:8, side:'R'}] },
      { section:'主课（组间90秒，动作间2分钟）', exerciseId:'bird_dog',        sets:[{type:'work', weight:null, reps:8, duration:null, rpe:8, side:'L'},{type:'work', weight:null, reps:8, duration:null, rpe:8, side:'R'}] },
      { section:'主课（组间90秒，动作间2分钟）', exerciseId:'dead_bug',        sets:[{type:'work', weight:null, reps:8, duration:null, rpe:8, side:'L'},{type:'work', weight:null, reps:8, duration:null, rpe:8, side:'R'}] },
      { section:'拉伸 10 分钟', exerciseId:'hip_flexor_stretch', sets:[{type:'work', weight:null, reps:null, duration:30, rpe:5},{type:'work', weight:null, reps:null, duration:30, rpe:5}] },
      { section:'拉伸 10 分钟', exerciseId:'hamstring_stretch',   sets:[{type:'work', weight:null, reps:null, duration:30, rpe:5},{type:'work', weight:null, reps:null, duration:30, rpe:5}] },
      { section:'拉伸 10 分钟', exerciseId:'quad_stretch',        sets:[{type:'work', weight:null, reps:null, duration:30, rpe:5}] },
      { section:'拉伸 10 分钟', exerciseId:'glute_figure4',       sets:[{type:'work', weight:null, reps:null, duration:30, rpe:5}] },
      { section:'拉伸 10 分钟', exerciseId:'pec_doorway',         sets:[{type:'work', weight:null, reps:null, duration:30, rpe:5},{type:'work', weight:null, reps:null, duration:30, rpe:5}] },
      { section:'拉伸 10 分钟', exerciseId:'lat_kneeling',        sets:[{type:'work', weight:null, reps:null, duration:30, rpe:5}] },
      { section:'拉伸 10 分钟', exerciseId:'child_pose',          sets:[{type:'work', weight:null, reps:null, duration:30, rpe:4}] },
      { section:'拉伸 10 分钟', exerciseId:'parasympathetic_breath', sets:[{type:'work', weight:null, reps:null, duration:60, rpe:3}] }
    ]
  },
  exercises: {
    /* ---- A 日：实测计划（2026-02 用户提供）---- */
    wall_angel:  { name:'靠墙天使', muscles:'上背 / 肩 / 姿势肌', mode:'bodyweight', unit:null,
                   tips:'后脑/上背/臀紧贴，下背压死，手臂沿墙上滑下滑', tempo:'2-1-1', personal:'' },
    broom_hinge: { name:'扫帚贴背屈髋测试', muscles:'后链 / 髋铰链模式', mode:'bodyweight', unit:null,
                   tips:'头/胸椎/尾骨三点触杆，缓慢屈髋下放', tempo:'3-1-1', personal:'' },
    cat_cow:     { name:'猫牛式', muscles:'胸腰椎 / 核心', mode:'bodyweight', unit:null,
                   tips:'四点跪撑，吸气塌腰抬头、呼气拱背含胸，各停2秒', tempo:'2-2-2', personal:'' },
    glute_bridge:{ name:'臀桥（徒手快速版）', muscles:'臀 / 后链', mode:'bodyweight', unit:null,
                   tips:'只为唤醒臀肌，不停顿不加重', tempo:'1-0-1', personal:'' },
    bw_squat:    { name:'徒手深蹲', muscles:'股四 / 臀', mode:'bodyweight', unit:null,
                   tips:'自然站距，全幅度下蹲', tempo:'2-0-1', personal:'' },
    band_pull_apart: { name:'拉力绳体前拉开', muscles:'后束 / 上背', mode:'band', unit:'lb',
                   tips:'手臂前平举，肩胛后收把绳拉开', tempo:'2-1-1', personal:'' },
    goblet_squat:{ name:'高脚杯深蹲', muscles:'股四 / 臀 / 核心', mode:'weight', unit:'kg',
                   tips:'单铃竖抱，肘贴肋，膝盖顶向脚尖，3秒下蹲到大腿平行', tempo:'3-1-1', personal:'' },
    db_bench:    { name:'哑铃卧推', muscles:'胸 / 三头 / 前束', mode:'weight', unit:'kg',
                   tips:'沉肩锁背，肘与躯干约45°，下放大臂平行地面', tempo:'3-1-1', personal:'' },
    rdl:         { name:'罗马尼亚硬拉 (RDL)', muscles:'腘绳肌 / 臀', mode:'weight', unit:'kg',
                   tips:'微屈膝，髋后推，哑铃贴腿滑到扫帚测试上限', tempo:'3-1-1', personal:'' },
    band_row:    { name:'拉力绳坐姿划船', muscles:'中背 / 肩胛 / 二头', mode:'band', unit:'lb',
                   tips:'躯干竖直，拉向肚脐两侧，肩胛后夹停1秒慢回', tempo:'2-1-1', personal:'' },
    db_shrug_push: { name:'坐姿哑铃肩推', muscles:'肩 / 三头', mode:'weight', unit:'kg',
                   tips:'坐凳踩实，哑铃举到耳侧，垂直推起，顶端不锁死', tempo:'2-1-1', personal:'' },
    band_face_pull: { name:'拉力绳面拉', muscles:'后束 / 外旋肌 / 上背', mode:'band', unit:'lb',
                   tips:'门扣额头高度，掌心相对，拉向脸两侧，拇指指脑后停1秒', tempo:'2-1-2', personal:'' },
    plank:       { name:'平板支撑', muscles:'核心 / 抗伸展', mode:'time', unit:null,
                   tips:'肘在肩正下方，先夹臀再收腹，头到脚跟一条线', tempo:'0-0-0', personal:'' },
    bird_dog:    { name:'鸟狗式', muscles:'核心 / 抗旋转 / 姿势', mode:'bodyweight', unit:null,
                   tips:'四点跪撑，对侧手脚伸到水平停2秒，背上像放一杯水', tempo:'2-2-2', personal:'' },
    hip_flexor_stretch: { name:'髂腰肌跪姿拉伸', muscles:'髂腰肌', mode:'time', unit:null,
                   tips:'弓步跪地，后腿膝盖着地，重心前移+收尾骨，后侧手举过头微侧弯；深呼气，不弹震', tempo:'3-1-1', personal:'' },
    hamstring_stretch: { name:'腘绳肌坐姿拉伸', muscles:'腘绳肌', mode:'time', unit:null,
                   tips:'坐姿单腿伸直体前屈，从髋折叠，背要直', tempo:'3-1-1', personal:'' },
    quad_stretch:  { name:'股四头肌站姿拉伸', muscles:'股四头肌', mode:'time', unit:null,
                   tips:'站姿抓脚踝拉向臀部，膝盖并拢', tempo:'3-1-1', personal:'' },
    glute_figure4: { name:'臀肌仰卧4字拉伸', muscles:'臀中肌 / 梨状肌', mode:'time', unit:null,
                   tips:'仰卧4字抱膝拉向胸口', tempo:'3-1-1', personal:'' },
    pec_doorway: { name:'胸大肌门框拉伸', muscles:'胸大肌 / 前束', mode:'time', unit:null,
                   tips:'两个高度各30秒，圆肩重点项', tempo:'3-1-1', personal:'' },
    lat_kneeling:{ name:'背阔肌跪姿下压拉伸', muscles:'背阔肌', mode:'time', unit:null,
                   tips:'跪姿手扶凳下压，臀往脚跟坐', tempo:'3-1-1', personal:'' },
    child_pose:  { name:'婴儿式', muscles:'背阔 / 下背 / 髋屈', mode:'time', unit:null,
                   tips:'跪坐趴下，额头贴地，双手前伸，专治腰骶紧张', tempo:'3-1-1', personal:'' },
    parasympathetic_breath: { name:'副交感下调平躺呼吸', muscles:'副交感神经 / 恢复', mode:'time', unit:null,
                   tips:'平躺鼻吸4秒呼6秒，心率落100以下再起，起来后走5分钟再坐', tempo:'4-0-6', personal:'' },
    /* ---- B 日：全身（2026-02 用户提供）---- */
    clamshell: { name:'蚌式', muscles:'臀中肌', mode:'bodyweight', unit:null,
                 tips:'侧卧屈膝90°，脚跟叠住不动，上腿膝盖打开到最大再合上，手放上侧髋骨前监督不后倒', tempo:'1-0-1', personal:'' },
    empty_bar_warmup: { name:'空杆预热组', muscles:'各主项动作模式', mode:'weight', unit:'kg',
                 tips:'每个主课动作最轻重量1×10', tempo:'1-0-1', personal:'' },
    db_glute_bridge: { name:'哑铃臀桥', muscles:'臀 / 后链', mode:'weight', unit:'kg',
                 tips:'仰卧凳前，双脚踩地与肩同宽膝弯约90°，脚跟发力顶髋，顶端夹紧臀部停2秒，慢放不完全触地即启动下一次；加重把哑铃竖放髋骨上方双手扶住',
                 pitfalls:'腰部发力顶起（肋骨要下沉）；顶端不停顿；脚尖发力（重心该在脚后跟）', tempo:'1-2-1', personal:'' },
    bulgarian_squat: { name:'保加利亚分腿蹲', muscles:'股四 / 臀 / 平衡', mode:'bodyweight', unit:null,
                 tips:'背对凳一大步远，后脚脚背搭凳面，前脚膝盖沿脚尖方向下蹲到大腿平行地面，前脚跟发力起，重心全在前腿',
                 pitfalls:'站太近膝盖过脚尖太多；站太宽髋屈肌被拉痛；左右晃（前脚稍偏同侧10cm）',
                 alternatives:'站不稳超过5个就撤后腿改后退步弓步', personal:'' },
    incline_db_bench: { name:'上斜哑铃卧推', muscles:'上胸 / 三头 / 前束', mode:'weight', unit:'kg',
                 tips:'凳背调约30°，肩胛后收贴凳面，哑铃从锁骨下方两侧推起，顶端在下巴正上方',
                 pitfalls:'角度调太高变肩推（超45°就不对）；手腕折腕（哑铃骑在掌根，手腕中立）；肘外展超60°', tempo:'3-1-1', personal:'' },
    lateral_raise: { name:'侧平举', muscles:'中束', mode:'weight', unit:'kg',
                 tips:'站姿微屈膝，手臂微弯150–160°，抬到与肩同高，小拇指略高于拇指（像倒水），停1秒3秒慢放',
                 pitfalls:'耸肩（先沉肩再抬）；靠身体晃甩上去（说明太重）；抬过肩（到肩就停）',
                 alternatives:'哑铃最轻档或改拉力绳10磅', tempo:'1-1-3', personal:'' },
    band_external_rot: { name:'拉力绳肩外旋', muscles:'肩外旋肌 / 后束', mode:'band', unit:'lb',
                 tips:'门扣固定肘部高度，侧身站，大臂贴身肘弯90°，用肩旋转的力把绳向外拉开，前臂转到指向正前或略偏外，停1秒慢回',
                 pitfalls:'整条手臂后拉变成划船；用手腕代替肩外旋（大臂全程贴身不动，可夹毛巾监督）', tempo:'1-1-1', personal:'' },
    dead_bug:  { name:'死虫式', muscles:'核心 / 抗伸展', mode:'bodyweight', unit:null,
                 tips:'仰卧双臂指天花板，双腿抬起屈膝90°小腿平行地面，先把腰压实地面，右手伸向头顶方向+左腿向前伸直都不碰地，停1秒收回换边',
                 pitfalls:'腰一拱起立刻停（这个动作做错比不做更差）；靠惯性甩（3秒伸3秒收）；憋气', tempo:'3-1-3', personal:'' }
  },
  logs: [],
  sessions: { A: null, B: null }
};

/* ---------------- 归一化与迁移（旧格式 {sets:N, reps:'x-y'} → 逐组数组） ---------------- */
function numOrNull(v){
  if(v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}
function normalizeSet(s){
  s = s || {};
  return {
    type: s.type === 'warmup' ? 'warmup' : 'work',
    weight: numOrNull(s.weight),
    reps: numOrNull(s.reps),
    duration: numOrNull(s.duration),
    rpe: numOrNull(s.rpe),
    side: s.side === 'L' || s.side === 'R' ? s.side : null
  };
}
function normalizeItem(raw){
  raw = raw || {};
  const section = typeof raw.section === 'string' ? raw.section : '';
  const repsRange = typeof raw.reps === 'string' ? raw.reps : '';
  let sets;
  if(Array.isArray(raw.sets)){
    sets = raw.sets.map(normalizeSet);
  }else{
    const n = Math.max(0, Math.round(Number(raw.sets) || 0));
    sets = Array.from({ length: n }, () => normalizeSet({}));
  }
  return { section, exerciseId: raw.exerciseId, repsRange, sets };
}
function migrate(d){
  if(!d.settings) d.settings = {};
  if(d.settings.restNote === undefined) d.settings.restNote = '';
  if(typeof d.settings.restSec !== 'number' || !(d.settings.restSec >= 0)) d.settings.restSec = 90;
  if(!d.profile) d.profile = { background: '' };
  if(!d.sessions) d.sessions = { A: null, B: null };
  for(const day of ['A','B']){
    if(d.program && Array.isArray(d.program[day])){
      d.program[day] = d.program[day].map(normalizeItem);
    }
    // v0.9: 二态迁移 done: null/undefined → false
    if(d.sessions[day] && d.sessions[day].items){
      d.sessions[day].items.forEach(it => (it.sets || []).forEach(s => {
        if(s.done === null || s.done === undefined) s.done = false;
      }));
    }
  }
  return d;
}

/* ---------------- 状态加载 / 保存（P0-2 自动保存） ---------------- */
let state = load();

function load(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(raw){
      const d = JSON.parse(raw);
      if(d && d.version === 1) return migrate(d);
    }
  }catch(e){ console.warn('Iron Log: 读取本地数据失败', e); }
  const d = JSON.parse(JSON.stringify(SEED));
  migrate(d);
  try{ localStorage.setItem(LS_KEY, JSON.stringify(d)); }catch(e){}
  return d;
}

function save(){
  try{ localStorage.setItem(LS_KEY, JSON.stringify(state)); }
  catch(e){ toast('保存失败：' + e.message); }
}

/* 防抖写入：连点步进时合并为一次全量序列化；隐藏/卸载前强制落盘，不丢数据 */
let saveTimer = null;
function saveSoon(){
  if(saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; save(); }, 250);
}
function flushSave(){
  if(saveTimer){ clearTimeout(saveTimer); saveTimer = null; }
  save();
}
document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'hidden') flushSave(); });
window.addEventListener('pagehide', flushSave);

/* ---------------- 通用工具 ---------------- */
const $ = id => document.getElementById(id);
const round1 = v => Math.round(v * 10) / 10;
const fmtW = v => (v === null || v === undefined || v === '') ? '' : String(round1(v));
const WEEK = ['日','一','二','三','四','五','六'];
/* 所有来自 localStorage / AI 导入的文本在拼进 innerHTML 前必须过 esc() */
const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

function fmtDuration(sec){
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec/3600), m = Math.floor(sec%3600/60), s = sec%60;
  const mm = String(m).padStart(2,'0'), ss = String(s).padStart(2,'0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}
function fmtDate(dateStr){
  const d = new Date(dateStr + 'T00:00:00');
  return `${dateStr} 周${WEEK[d.getDay()]}`;
}
const isDone = s => s.done === true;
function sessionVolume(entry){
  return entry.exercises.reduce((sum, ex) =>
    sum + ex.sets.filter(isDone).reduce((s, st) => s + (st.weight||0) * (st.reps||0), 0), 0);
}
function sessionSets(entry){
  return entry.exercises.reduce((s, ex) => s + ex.sets.filter(isDone).length, 0);
}

let toastTimer = null;
function toast(msg){
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* 应用内确认弹层：替换浏览器原生确认框（iOS 上样式与行为不一致，且无法本地化）
 * 用法：askConfirm({title, desc, okLabel}).then(ok => ...)
 */
let confirmResolve = null;
function askConfirm(opts){
  $('confirm-title').textContent = opts.title;
  $('confirm-desc').textContent = opts.desc || '';
  $('confirm-ok-btn').textContent = opts.okLabel || '确定';
  $('confirm-overlay').classList.add('show');
  return new Promise(res => { confirmResolve = res; });
}
function answerConfirm(ok){
  $('confirm-overlay').classList.remove('show');
  const r = confirmResolve;
  confirmResolve = null;
  if(r) r(ok);
}

/* ---------------- 视图切换（v0.9：抽屉导航） ---------------- */
let currentView = 'today';
function switchView(v){
  currentView = v;
  ['today','history','settings'].forEach(x => {
    $('view-' + x).classList.toggle('active', x === v);
    const tab = $('tab-' + x);
    if(tab){
      tab.classList.toggle('active', x === v);
      tab.setAttribute('aria-selected', x === v ? 'true' : 'false');
    }
  });
  render();
}
/* 抽屉开关 */
function toggleDrawer(){
  $('drawer').classList.toggle('open');
  $('drawer-overlay').classList.toggle('show');
}
function closeDrawer(){
  $('drawer').classList.remove('open');
  $('drawer-overlay').classList.remove('show');
}

/* ---------------- 今日训练 ---------------- */
let draft = {};    // 内存草稿：未开始（未确认任何一组）前的预填数据，按日分存
let condDraft = { A: null, B: null }; // 当日状态草稿（会话建立前），点按循环切换

const COND_ORDER = [null, '佳', '一般', '差'];
const COND_LABEL = { '佳': '佳', '一般': '一般', '差': '差' };
function cycleCondition(day){
  const cur = state.sessions[day] ? state.sessions[day].condition : condDraft[day];
  const next = COND_ORDER[(COND_ORDER.indexOf(cur) + 1) % COND_ORDER.length];
  if(state.sessions[day]) state.sessions[day].condition = next;
  else condDraft[day] = next;
  save();
  renderToday();
}

function curDay(){ return state.settings.lastDay; }

function switchDay(d){
  state.settings.lastDay = d;
  save();
  render();
}

/* 上次同动作的数值：跳过热身组，取最近一次日志中该动作最重的已完成组 */
function lastValues(exerciseId){
  for(let i = state.logs.length - 1; i >= 0; i--){
    const ex = state.logs[i].exercises.find(e => e.exerciseId === exerciseId);
    if(!ex) continue;
    const done = ex.sets.filter(s => isDone(s) && s.type !== 'warmup');
    if(!done.length) continue;
    const f = done.reduce((a, b) => ((b.weight || 0) > (a.weight || 0) ? b : a));
    return { weight: f.weight ?? null, reps: f.reps ?? null, duration: f.duration ?? null };
  }
  return { weight: null, reps: null, duration: null };
}

/* 当前日期的可编辑 items：有进行中记录用记录，否则用草稿（计划规格优先，上次数值兜底） */
function getItems(day){
  if(state.sessions[day]) return state.sessions[day].items;
  if(!draft[day]){
    draft[day] = (state.program[day] || []).map(p => {
      const lv = lastValues(p.exerciseId);
      return {
        exerciseId: p.exerciseId,
        note: '',
        sets: p.sets.map(spec => ({
          type: spec.type,
          weight: spec.weight ?? lv.weight,
          reps: spec.reps ?? lv.reps,
          duration: spec.duration ?? lv.duration,
          rpe: null,
          side: spec.side ?? null,
          targetRpe: spec.rpe,
          restAfter: null,
          done: false
        }))
      };
    });
  }
  return draft[day];
}

/* 首次确认一组时，把草稿提升为正式的进行中记录 */
function startSessionIfNeeded(day){
  if(!state.sessions[day]){
    state.sessions[day] = { startedAt: Date.now(), items: getItems(day), condition: condDraft[day] || null };
    condDraft[day] = null;
  }
}

/* 卡片右上角目标标签：如 "热身 1 + 2 × 10" / "4 × 30s" */
function targetLabel(item){
  const work = item.sets.filter(s => s.type !== 'warmup');
  const warm = item.sets.length - work.length;
  let core;
  if(work.length && work.every(s => s.duration != null)){
    const ds = work.map(s => s.duration);
    const dmin = Math.min(...ds), dmax = Math.max(...ds);
    core = work.length + ' × ' + (dmin === dmax ? dmin : dmin + '-' + dmax) + 's';
  }else if(work.length && work.every(s => s.reps != null)){
    const rs = work.map(s => s.reps);
    const rmin = Math.min(...rs), rmax = Math.max(...rs);
    core = work.length + ' × ' + (rmin === rmax ? rmin : rmin + '-' + rmax);
  }else if(item.repsRange){
    core = work.length + ' × ' + item.repsRange;
  }else{
    core = work.length + ' 组';
  }
  return warm ? '热身 ' + warm + ' + ' + core : core;
}

/* ---------------- 全屏一次一组（v0.8 交互） ----------------
 * 一屏只显示当前组：大数字 + 输入框（无步进按钮）+ 备注 + RPE 步进 + 三态完成按钮。
 * 三态：○ 未记录 → ✓ 完成（绿）→ ✗ 未完成（红）→ ○。
 * 组间休息集成在卡片内：确认一组后卡片切到休息态，倒计时结束自动切下一组。
 */
let curPos = 0;      // 当前 (exIdx, setIdx) 扁平化位置
let openNotes = {};  // 已展开的"要点/避坑"详情，key = day:exIdx

function flatPos(day){
  const items = getItems(day);
  const pos = [];
  items.forEach((it, exIdx) => it.sets.forEach((s, setIdx) => pos.push({ exIdx, setIdx })));
  return pos;
}
function posLabel(day, p){
  const items = getItems(day);
  const it = items[p.exIdx];
  if(!it) return { ex: null, item: null, set: null };
  return { ex: state.exercises[it.exerciseId], item: it, set: it.sets[p.setIdx] };
}
function clampPos(day){
  const n = flatPos(day).length;
  if(!n) return 0;
  curPos = Math.max(0, Math.min(curPos, n - 1));
  return curPos;
}
function nextPos(day){
  const n = flatPos(day).length;
  if(!n) return;
  curPos = (curPos + 1) % n;
}
function prevPos(day){
  const n = flatPos(day).length;
  if(!n) return;
  curPos = (curPos - 1 + n) % n;
}
function cycleDone(day, exIdx, setIdx){
  const set = getItems(day)[exIdx].sets[setIdx];
  if(!set) return;
  if(set.done === true){ set.done = false; set.isPR = false; }  // ✓ → ✗
  else {                                            // ✗ → ✓
    set.done = true;
    // PR 检测：仅正式组，对比上次同动作最重/最长/最多
    if(set.type !== 'warmup'){
      const item = getItems(day)[exIdx];
      const lv = lastValues(item.exerciseId);
      const ex = state.exercises[item.exerciseId];
      const mode = (ex && ex.mode) || 'weight';
      if(mode === 'time'){
        set.isPR = (set.duration != null && lv.duration != null && set.duration > lv.duration);
      } else if(mode === 'bodyweight'){
        set.isPR = (set.reps != null && lv.reps != null && set.reps > lv.reps);
      } else {
        set.isPR = (set.weight != null && lv.weight != null && set.weight > lv.weight);
      }
    }
    startSessionIfNeeded(day);
    startRestTimer();
  }
}
function setDoneState(day, exIdx, setIdx, val){
  const set = getItems(day)[exIdx].sets[setIdx];
  if(!set) return;
  set.done = val;
}
/* 按模式生成输入框（无步进按钮；weight 小数、reps/duration 整数） */
function setInputsHTML(exIdx, setIdx, st, ex){
  const d = f => `data-ex="${exIdx}" data-set="${setIdx}" data-f="${f}"`;
  const mode = ex.mode || 'weight';
  if(mode === 'time'){
    return `<input class="fs-input" ${d('duration')} inputmode="numeric" value="${st.duration ?? ''}" aria-label="时长（秒）"><span class="fs-unit">秒</span>`;
  }
  if(mode === 'bodyweight'){
    return `<span class="fs-bw">自重</span><input class="fs-input" ${d('reps')} inputmode="numeric" value="${st.reps ?? ''}" aria-label="次数"><span class="fs-unit">次</span>`;
  }
  return `<input class="fs-input" ${d('weight')} inputmode="decimal" value="${fmtW(st.weight)}" aria-label="重量"><span class="fs-unit">${esc(ex.unit || 'kg')}</span>
    <input class="fs-input" ${d('reps')} inputmode="numeric" value="${st.reps ?? ''}" aria-label="次数"><span class="fs-unit">次</span>`;
}
function fullScreenHTML(day){
  const program = state.program[day] || [];
  if(!program.length) return '<div class="empty-hint">该日暂无动作，等待导入训练计划。</div>';
  const p = clampPos(day);
  const pos = flatPos(day)[p];
  const { ex, item, set } = posLabel(day, pos);
  if(!ex || !item || !set) return '<div class="empty-hint">动作库缺少该动作（exerciseId 不在 exercises 中）。</div>';
  const mode = ex.mode || 'weight';
  const unitTag = (mode === 'weight' || mode === 'band') ? ' · ' + esc(ex.unit || 'kg') : '';
  const sideTag = set.side ? `<span class="fs-side">${set.side === 'L' ? '左' : '右'}侧</span>` : '';
  const warmTag = set.type === 'warmup' ? '<span class="fs-warm">热身</span>' : '';
  const notes = [
    ex.tips ? `<div class="note"><b>要点</b>${esc(ex.tips)}</div>` : '',
    ex.pitfalls ? `<div class="note"><b>避坑</b>${esc(ex.pitfalls)}</div>` : '',
    ex.tempo ? `<div class="note"><b>节奏</b>${esc(ex.tempo)}</div>` : '',
    ex.alternatives ? `<div class="note"><b>替代</b>${esc(ex.alternatives)}</div>` : '',
    ex.personal ? `<div class="note"><b>个人</b>${esc(ex.personal)}</div>` : ''
  ].join('');
  const rpeTarget = set.targetRpe != null ? `<span class="rpe-target">目标 ${esc(set.targetRpe)}</span>` : '';
  const doneCls = set.done === true ? 'done' : 'undone';
  const doneIcon = set.done === true ? '✓' : '✗';
  const doneLabel = set.done === true ? '已完成' : '未完成';
  const restActive = restEndsAt !== null;
  // 当日进度
  const allPos = flatPos(day);
  const items = getItems(day);
  const totalSets = allPos.length;
  const doneSets = items.reduce((s, it) => s + it.sets.filter(st => st.done === true).length, 0);
  const pct = totalSets > 0 ? Math.round(doneSets / totalSets * 100) : 0;
  // 跳过此动作：当前动作所有组都是 ✗
  const allUndone = item.sets.every(st => st.done === false);
  const restClock = restActive
    ? (restEndsAt - Date.now() > 0
        ? fmtDuration((restEndsAt - Date.now()) / 1000)
        : '超时 ' + fmtDuration((Date.now() - restEndsAt) / 1000))
    : '';
  return `
    <div class="fs-card">
      <div class="fs-progress" aria-hidden="true"><div class="fs-progress-fill" style="width:${pct}%"></div></div>
      ${restActive ? `
      <div class="fs-rest-bar" role="timer" aria-label="组间休息计时">
        <span class="rest-label">休息</span>
        <span class="rest-clock" id="rest-clock">${restClock}</span>
        <button class="cond-btn" onclick="skipRest()">跳过</button>
      </div>` : ''}
      <div class="fs-top">
        <button class="fs-nav" data-act="prev" aria-label="上一组">‹</button>
        <div class="fs-title">
          <div class="fs-name"><span class="fs-num">${pos.exIdx + 1}.</span> ${esc(ex.name)}${sideTag}${warmTag}</div>
          <div class="fs-muscles">${esc(ex.muscles || '')}</div>
        </div>
        <button class="fs-nav" data-act="next" aria-label="下一组">›</button>
      </div>
      ${notes ? `<details class="ex-notes" data-notes="${pos.exIdx}" ${openNotes[day + ':' + pos.exIdx] ? 'open' : ''}><summary>要点 / 避坑 / 节奏</summary>${notes}</details>` : ''}
      <div class="fs-set">
        <div class="fs-sub">第 ${pos.setIdx + 1} / ${item.sets.length} 组 · ${esc(targetLabel(item))}${unitTag}${set.isPR ? ' <span class="pr-badge">🔥 PR</span>' : ''}</div>
        <div class="fs-values">${setInputsHTML(pos.exIdx, pos.setIdx, set, ex)}</div>
        <div class="rpe-row">
          <span class="rpe-label">RPE</span>
          <button class="rpe-btn" data-ex="${pos.exIdx}" data-set="${pos.setIdx}" data-f="rpe" data-act="dec" aria-label="RPE 减 0.5">−</button>
          <span class="rpe-val">${set.rpe ?? '–'}</span>
          <button class="rpe-btn" data-ex="${pos.exIdx}" data-set="${pos.setIdx}" data-f="rpe" data-act="inc" aria-label="RPE 加 0.5">＋</button>
          ${rpeTarget}
        </div>
        <button class="fs-done ${doneCls}" data-ex="${pos.exIdx}" data-set="${pos.setIdx}" data-act="confirm"
                aria-label="完成状态：${doneLabel}" aria-pressed="${set.done === true ? 'true' : 'false'}">${doneIcon}</button>
      </div>
      <div class="fs-foot">
        <button class="add-set" data-ex="${pos.exIdx}" data-act="addset">＋ 加一组</button>
        <input class="fs-exnote" data-ex="${pos.exIdx}" value="${esc(item.note || '')}" placeholder="动作备注（可选）">
      </div>
      ${allUndone ? `<button class="skip-ex" data-act="skipex" aria-label="跳过此动作">跳过此动作 →</button>` : ''}
    </div>`;
}

function renderToday(){
  const day = curDay();
  // 抽屉内日期按钮状态
  const dA = $('day-btn-A'), dB = $('day-btn-B');
  if(dA){ dA.classList.toggle('active', day === 'A'); dA.setAttribute('aria-pressed', day === 'A' ? 'true' : 'false'); }
  if(dB){ dB.classList.toggle('active', day === 'B'); dB.setAttribute('aria-pressed', day === 'B' ? 'true' : 'false'); }

  const sess = state.sessions[day];
  const status = $('session-status');
  const condVal = sess ? sess.condition : condDraft[day];
  const condBtn = `<button class="cond-btn" onclick="cycleCondition('${day}')">状态：${esc(COND_LABEL[condVal] || '–')}</button>`;
  // 实时进度
  const items = getItems(day);
  const totalSets = items.reduce((s, it) => s + it.sets.length, 0);
  const doneSets = items.reduce((s, it) => s + it.sets.filter(st => st.done === true).length, 0);
  const vol = Math.round(items.reduce((s, it) => s + it.sets.filter(st => st.done === true).reduce((v, st) => v + (st.weight||0)*(st.reps||0), 0), 0));
  const progStr = totalSets > 0 ? `<span class="session-progress">${doneSets}/${totalSets} 组${vol > 0 ? ' · ' + vol.toLocaleString() + 'kg' : ''}</span>` : '';
  if(sess){
    status.innerHTML = `<span class="live"></span><span>进行中</span><span class="clock" id="session-clock">${fmtDuration((Date.now() - sess.startedAt)/1000)}</span>${progStr}${condBtn}`;
  }else{
    status.innerHTML = `<span>未开始 · 确认第一组后自动计时</span>${progStr}${condBtn}`;
  }

  const list = $('ex-list');
  list.innerHTML = fullScreenHTML(day);
  list.querySelectorAll('details[data-notes]').forEach(d => {
    d.addEventListener('toggle', () => { openNotes[day + ':' + d.dataset.notes] = d.open; });
  });

  $('end-btn').style.display = sess ? '' : 'none';
  $('discard-btn').style.display = sess ? '' : 'none';
  startClock();
  renderRestBar();
}

/* 组内局部更新：只替换 RPE 值（保留输入焦点）；其余变化走全量渲染 */
function patchRpe(exIdx, setIdx){
  const day = curDay();
  const item = getItems(day)[exIdx];
  if(!item) return false;
  const val = document.querySelector(`.rpe-val`);
  if(!val) return false;
  val.textContent = item.sets[setIdx].rpe ?? '–';
  return true;
}

/* 全屏卡片交互（事件委托）：组导航 / 二态完成 / RPE 步进 / 加组 / 跳过动作 */
$('ex-list').addEventListener('click', e => {
  const btn = e.target.closest('button[data-act]');
  if(!btn) return;
  const day = curDay();
  const act = btn.dataset.act;

  if(act === 'prev'){
    prevPos(day); saveSoon(); renderToday();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  if(act === 'next'){
    nextPos(day); saveSoon(); renderToday();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  if(act === 'skipex'){
    if(restEndsAt !== null) finishRest();
    // 跳到下一个动作的第一组
    const pos = flatPos(day)[curPos];
    if(pos){
      const items = getItems(day);
      let nextEx = pos.exIdx + 1;
      while(nextEx < items.length && items[nextEx].sets.every(s => s.done === false)) nextEx++;
      if(nextEx < items.length){
        curPos = 0;
        // 找到 nextEx 的第一组在 flatPos 中的位置
        let count = 0;
        for(let i = 0; i < nextEx; i++) count += items[i].sets.length;
        curPos = count;
      } else {
        nextPos(day);
      }
    }
    saveSoon(); renderToday();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  const exIdx = +btn.dataset.ex;
  const item = getItems(day)[exIdx];
  if(!item) return;

  if(act === 'addset'){
    const last = item.sets[item.sets.length - 1];
    item.sets.push({
      type: last ? last.type : 'work',
      weight: last ? last.weight : null,
      reps: last ? last.reps : null,
      duration: last ? last.duration : null,
      rpe: null,
      side: null,
      targetRpe: last ? last.targetRpe : null,
      restAfter: null,
      done: false
    });
    saveSoon(); renderToday();
    return;
  }

  const setIdx = +btn.dataset.set;
  const set = item.sets[setIdx];
  if(!set) return;

  if(act === 'confirm'){
    if(restEndsAt !== null) finishRest();
    cycleDone(day, exIdx, setIdx);
    if(navigator.vibrate) navigator.vibrate(50);
    saveSoon(); renderToday();
    return;
  }
  if(act === 'dec' || act === 'inc'){
    set.rpe = act === 'inc' ? Math.min(10, round1((set.rpe || 7.5) + 0.5))
                            : Math.max(5,  round1((set.rpe || 8.5) - 0.5));
    saveSoon();
    if(!patchRpe(exIdx, setIdx)) renderToday();
  }
});

/* 直接输入（change：失焦或回车时提交）：数值 / 动作备注 */
$('ex-list').addEventListener('change', e => {
  const inp = e.target.closest('input');
  if(!inp) return;
  const day = curDay();
  const exIdx = +inp.dataset.ex;
  const item = getItems(day)[exIdx];
  if(!item) return;
  if(inp.classList.contains('fs-exnote')){
    item.note = inp.value.trim();
    saveSoon();
    return;
  }
  const set = item.sets[+inp.dataset.set];
  if(!set) return;
  const v = parseFloat(inp.value);
  if(inp.dataset.f === 'weight'){
    set.weight = isNaN(v) ? null : Math.max(0, round1(v));
  }else if(inp.dataset.f === 'duration'){
    set.duration = isNaN(v) ? null : Math.max(0, Math.round(v));
  }else{
    set.reps = isNaN(v) ? null : Math.max(0, Math.round(v));
  }
  saveSoon();
});

/* 滑动切组（touch 手势：左滑=下一组，右滑=上一组） */
let touchStartX = 0, touchStartY = 0;
$('ex-list').addEventListener('touchstart', e => {
  if(e.touches.length !== 1) return;
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
}, { passive: true });
$('ex-list').addEventListener('touchend', e => {
  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = e.changedTouches[0].clientY - touchStartY;
  if(Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx)) return; // 水平滑动且幅度够
  const day = curDay();
  if(dx < 0) nextPos(day); else prevPos(day);
  saveSoon(); renderToday();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}, { passive: true });

/* 结束训练：写入 logs（P0 闭环的落盘点） */
function endSession(){
  const day = curDay();
  const sess = state.sessions[day];
  if(!sess) return;
  const exercises = sess.items
    .map(it => ({
      exerciseId: it.exerciseId,
      note: (it.note || '').trim() || null,
      sets: it.sets.map(s => ({
        weight: s.weight ?? null, reps: s.reps ?? null,
        duration: s.duration ?? null, rpe: s.rpe ?? null,
        side: s.side ?? null, restAfter: s.restAfter ?? null,
        done: s.done === true
      }))
    }))
    .filter(it => it.sets.some(isDone));
  if(!exercises.length){ toast('还没有确认任何一组'); return; }

  const endedAt = Date.now();
  const entry = {
    date: new Date().toISOString().slice(0, 10),
    day,
    startedAt: sess.startedAt,
    endedAt,
    durationSec: Math.round((endedAt - sess.startedAt) / 1000),
    condition: sess.condition ?? null,
    exercises
  };
  state.logs.push(entry);
  state.sessions[day] = null;
  delete draft[day];
  resetRest();
  flushSave();
  render();
  showSummary(entry);
}

async function discardSession(){
  const day = curDay();
  if(!state.sessions[day]) return;
  const ok = await askConfirm({ title: '放弃本次记录？', desc: '已确认的组数将丢失，不可恢复。', okLabel: '放弃' });
  if(!ok) return;
  state.sessions[day] = null;
  delete draft[day];
  condDraft[day] = null;
  curPos = 0;
  resetRest();
  flushSave();
  render();
  toast('已放弃');
}

function showSummary(entry){
  const vol = Math.round(sessionVolume(entry));
  $('summary-title').textContent = `${entry.day} 日训练完成`;
  $('summary-body').innerHTML = `
    <div class="stat">动作 <b>${entry.exercises.length}</b> 个</div>
    <div class="stat">总组数 <b>${sessionSets(entry)}</b> 组</div>
    <div class="stat">总容量 <b>${vol.toLocaleString()} kg</b></div>
    <div class="stat">用时 <b>${fmtDuration(entry.durationSec)}</b></div>
    ${entry.condition ? `<div class="stat">状态 <b>${esc(entry.condition)}</b></div>` : ''}`;
  $('summary-overlay').classList.add('show');
}
function closeSummary(){ $('summary-overlay').classList.remove('show'); }

/* 进行中计时（只更新时钟，不重渲染） */
let clockTimer = null;
function startClock(){
  if(clockTimer) clearInterval(clockTimer);
  clockTimer = setInterval(() => {
    const sess = state.sessions[curDay()];
    const el = $('session-clock');
    if(sess && el) el.textContent = fmtDuration((Date.now() - sess.startedAt) / 1000);
  }, 1000);
}

/* ---------------- 组间休息计时（v0.9：超时继续 + 自动记录用时） ----------------
 * 确认一组后自动启动；倒计时到 0 后继续向上计（超时），不自动跳转。
 * 用户点「下一组」或「跳过」时记录实际休息时长到 set.restAfter。
 * 基于 restStartsAt 时间戳，切后台/休眠后回来仍显示真实值。
 * ------------------------------------------------ */
let restEndsAt = null;
let restStartsAt = null;
let restTimer = null;
let restDone = false;
let restForPos = null;  // {exIdx, setIdx} 触发休息的组

function startRestTimer(){
  const sec = state.settings.restSec;
  if(!(sec > 0)) return;
  restStartsAt = Date.now();
  restEndsAt = restStartsAt + sec * 1000;
  restDone = false;
  restForPos = { exIdx: null, setIdx: null };
  // 记录当前组位置
  const day = curDay();
  const pos = flatPos(day)[curPos];
  if(pos) restForPos = pos;
  renderRestBar();
  startRestTick();
}
function startRestTick(){
  if(restTimer) clearInterval(restTimer);
  restTimer = setInterval(tickRest, 250);
}
function tickRest(){
  if(restEndsAt === null) return;
  const remain = restEndsAt - Date.now();
  if(remain <= 0 && !restDone){
    restDone = true;
    beep();
  }
  renderRestBar();
}
function renderRestBar(){
  if(restEndsAt === null){
    if(restTimer){ clearInterval(restTimer); restTimer = null; }
    return;
  }
  const clock = $('rest-clock');
  if(!clock) return;
  const remain = restEndsAt - Date.now();
  if(remain > 0){
    clock.textContent = fmtDuration(remain / 1000);
    clock.classList.remove('overtime');
  } else {
    clock.textContent = '超时 ' + fmtDuration((-remain) / 1000);
    clock.classList.add('overtime');
  }
}
/* 记录休息时长并清除计时器 */
function finishRest(){
  if(restStartsAt !== null && restForPos){
    const elapsed = Math.round((Date.now() - restStartsAt) / 1000);
    const day = curDay();
    const item = getItems(day)[restForPos.exIdx];
    if(item && item.sets[restForPos.setIdx]) item.sets[restForPos.setIdx].restAfter = elapsed;
  }
  restEndsAt = null; restStartsAt = null; restDone = false; restForPos = null;
  if(restTimer){ clearInterval(restTimer); restTimer = null; }
}
function skipRest(){
  finishRest();
  nextPos(curDay());
  saveSoon();
  renderToday();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function resetRest(){
  restEndsAt = null; restStartsAt = null; restDone = false; restForPos = null;
  if(restTimer){ clearInterval(restTimer); restTimer = null; }
}
function restTotalSec(){ return restEndsAt === null ? 0 : Math.round((restEndsAt - restStartsAt) / 1000); }

/* 休息结束提示音（WebAudio，无外部资源；失败静默） */
function beep(){
  try{
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if(!Ctx) return;
    const ctx = beep._ctx || (beep._ctx = new Ctx());
    if(ctx.state === 'suspended') ctx.resume();
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = 880;
    osc.connect(gain); gain.connect(ctx.destination);
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    osc.start(t); osc.stop(t + 0.5);
  }catch(e){}
}

/* ---------------- 历史 & 导出 ---------------- */
/* 纯 SVG 趋势折线图：每个动作一条线，X=日期，Y=top 组主指标 */
function buildTrendChartSVG(trends, maxLines){
  const entries = Object.entries(trends).filter(([, t]) => t.sessions.length >= 2).slice(0, maxLines || 5);
  if(!entries.length) return '';
  const W = 320, H = 120, PAD = { t: 16, r: 12, b: 24, l: 36 };
  const pw = W - PAD.l - PAD.r, ph = H - PAD.t - PAD.b;
  // 收集所有数据点
  const allPts = [];
  entries.forEach(([id, t]) => {
    const metric = s => s.top.weight != null ? s.top.weight : (s.top.duration != null ? s.top.duration : (s.top.reps || 0));
    t.sessions.forEach((s, i) => allPts.push(metric(s)));
  });
  const yMin = Math.min(...allPts) * 0.9, yMax = Math.max(...allPts) * 1.05;
  const yRange = yMax - yMin || 1;
  const totalSessions = Math.max(...entries.map(([, t]) => t.sessions.length));
  const xStep = totalSessions > 1 ? pw / (totalSessions - 1) : pw;
  const yScale = v => PAD.t + ph - ((v - yMin) / yRange) * ph;
  const colors = ['#4f8cff','#3fb96f','#e0a030','#e05252','#9b6dff'];
  const lines = entries.map(([id, t], li) => {
    const metric = s => s.top.weight != null ? s.top.weight : (s.top.duration != null ? s.top.duration : (s.top.reps || 0));
    const pts = t.sessions.map((s, i) => `${PAD.l + i * xStep},${yScale(metric(s))}`).join(' ');
    const last = t.sessions[t.sessions.length - 1];
    const label = `${(state.exercises[id] || {}).name || id} ${metric(last).toFixed(1)}`;
    return `<polyline points="${pts}" fill="none" stroke="${colors[li % colors.length]}" stroke-width="2" stroke-linejoin="round"/>
      <text x="${PAD.l + (t.sessions.length - 1) * xStep + 4}" y="${yScale(metric(last)) + 4}" font-size="9" fill="${colors[li % colors.length]}">${esc(label)}</text>`;
  }).join('');
  // Y 轴刻度
  const yTicks = [yMin, yMin + yRange / 2, yMax].map(v =>
    `<text x="${PAD.l - 4}" y="${yScale(v) + 3}" font-size="9" fill="#8b93a3" text-anchor="end">${Math.round(v)}</text>`
  ).join('');
  return `<div class="trend-chart"><svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="动作趋势图">${yTicks}${lines}</svg></div>`;
}
function renderHistory(){
  const list = $('hist-list');
  if(!state.logs.length){
    list.innerHTML = '<div class="empty-hint">还没有训练记录。<br>完成一次训练后会自动出现在这里。</div>';
    return;
  }
  const trendSVG = buildTrendChartSVG(buildTrends(state.logs.slice(-TREND_WINDOW)), 5);
  list.innerHTML = trendSVG + state.logs.slice().reverse().map((entry, ri) => {
    const vol = Math.round(sessionVolume(entry));
    const doneSets = sessionSets(entry);
    const totalSets = entry.exercises.reduce((s, ex) => s + ex.sets.length, 0);
    const cond = entry.condition ? ` · 状态${esc(entry.condition)}` : '';
    const detail = entry.exercises.map(ex => {
      const exName = (state.exercises[ex.exerciseId] || {}).name || ex.exerciseId;
      const sets = ex.sets.filter(isDone).map(s => {
        let base;
        if(s.duration != null) base = s.duration + 's';
        else if(s.weight != null) base = fmtW(s.weight) + '×' + (s.reps ?? '?');
        else base = (s.reps ?? '?') + ' 次';
        return base + (s.rpe ? ` (RPE ${s.rpe})` : '') + (s.note ? `（${s.note}）` : '');
      }).join('，');
      return `<div class="h-ex"><b>${esc(exName)}</b>${esc(sets)}${ex.note ? `<div class="h-note">${esc(ex.note)}</div>` : ''}</div>`;
    }).join('');
    return `
      <details class="hist-item">
        <summary>
          <span class="hist-date">${esc(fmtDate(entry.date))}</span>
          <span class="day-badge">${esc(entry.day)}</span>
          <span class="hist-meta">${entry.exercises.length} 动作 · ${doneSets === totalSets ? doneSets : doneSets + '/' + totalSets} 组${cond} · ${vol.toLocaleString()} kg · ${fmtDuration(entry.durationSec)}</span>
        </summary>
        <div class="hist-detail">${detail}</div>
      </details>`;
  }).join('');
}

/* ---------------- P0-4 导入 AI 方案 ----------------
 * 容错：markdown 代码块包裹、多余尾逗号。
 * 校验：逐字段检查，错误信息带具体路径。
 * 合并：exercises 按 id 合并（personal 保留本地值）；program 按日整体替换；
 *       日志不动；有进行中记录的日禁止导入。
 * ------------------------------------------------------------------ */
function stripFences(t){
  t = t.trim();
  const m = t.match(/^```(?:json|javascript)?\s*([\s\S]*?)\s*```$/i);
  if(m) t = m[1].trim();
  return t;
}
function validatePlan(d){
  if(!d || typeof d !== 'object' || Array.isArray(d)) return '顶层必须是 JSON 对象';
  if(!d.exercises || typeof d.exercises !== 'object' || Array.isArray(d.exercises)) return '缺少 exercises 字段（对象）';
  if(!d.program || typeof d.program !== 'object' || Array.isArray(d.program)) return '缺少 program 字段（对象）';
  const days = ['A','B'].filter(day => d.program[day] !== undefined);
  if(!days.length) return 'program 必须包含 A 或 B（数组）';
  for(const day of days){
    const arr = d.program[day];
    if(!Array.isArray(arr)) return `program.${day} 必须是数组`;
    if(!arr.length) return `program.${day} 是空数组`;
    for(let i = 0; i < arr.length; i++){
      const it = arr[i];
      if(!it || typeof it !== 'object') return `program.${day}[${i}] 必须是对象`;
      if(typeof it.exerciseId !== 'string' || !it.exerciseId) return `program.${day}[${i}].exerciseId 缺失`;
      if(!d.exercises[it.exerciseId]) return `program.${day}[${i}].exerciseId "${it.exerciseId}" 不在 exercises 中`;
      if(!Array.isArray(it.sets) || !it.sets.length) return `program.${day}[${i}].sets 必须是非空数组`;
      for(let j = 0; j < it.sets.length; j++){
        const s = it.sets[j];
        if(!s || typeof s !== 'object') return `program.${day}[${i}].sets[${j}] 必须是对象`;
        for(const k of ['weight','reps','duration','rpe']){
          if(s[k] !== null && s[k] !== undefined && typeof s[k] !== 'number')
            return `program.${day}[${i}].sets[${j}].${k} 必须是数字或 null`;
        }
      }
    }
  }
  return null;
}
function applyPlan(d){
  for(const day of ['A','B']){
    if(d.program[day] !== undefined && state.sessions[day])
      return { ok:false, error:`${day} 日有进行中的记录，请先结束或放弃后再导入` };
  }
  let exCount = 0;
  for(const [id, ex] of Object.entries(d.exercises)){
    const old = state.exercises[id] || {};
    state.exercises[id] = {
      name: ex.name || old.name || id,
      muscles: ex.muscles ?? old.muscles ?? '',
      mode: ex.mode || old.mode || 'weight',
      unit: ex.unit ?? old.unit ?? null,
      tips: ex.tips ?? old.tips ?? '',
      pitfalls: ex.pitfalls ?? old.pitfalls ?? '',
      tempo: ex.tempo ?? old.tempo ?? '',
      alternatives: ex.alternatives ?? old.alternatives ?? '',
      personal: (ex.personal && String(ex.personal).trim()) ? ex.personal : (old.personal || '')
    };
    exCount++;
  }
  const daySummary = [];
  for(const day of ['A','B']){
    if(d.program[day] === undefined) continue;
    state.program[day] = d.program[day].map(normalizeItem);
    delete draft[day];
    daySummary.push(`${day} 日 ${state.program[day].length} 动作`);
  }
  if(typeof d.day === 'string' && (d.day === 'A' || d.day === 'B')) state.settings.lastDay = d.day;
  save();
  render();
  return { ok:true, summary:`导入完成：${daySummary.join('，')}；动作库 ${exCount} 项` };
}
function importPlan(text){
  let t = stripFences(String(text || ''));
  t = t.replace(/,\s*([}\]])/g, '$1'); // 容忍多余尾逗号
  let data;
  try{ data = JSON.parse(t); }
  catch(e){ return { ok:false, error:'JSON 解析失败：' + e.message }; }
  const verr = validatePlan(data);
  if(verr) return { ok:false, error:'校验失败：' + verr };
  return applyPlan(data);
}
function doImport(){
  const msg = $('import-msg');
  const r = importPlan($('import-text').value);
  msg.className = 'import-msg ' + (r.ok ? 'ok' : 'err');
  msg.textContent = r.ok ? r.summary : r.error;   // textContent：校验错误里的 exerciseId 无需转义
  if(r.ok) $('import-text').value = '';
}

/* ---------------- P0-3 导出给 AI ----------------
 * 由 logs 即时打包生成快照（不单独存储）：
 *   program + exercises + 最近 N 次日志 + 逐动作趋势（top 组 / 平均 RPE / 方向）
 * 输出与导入格式兼容（program/exercises 原样），AI 可基于它生成 type: ai-plan 的新方案。
 * ------------------------------------------------------------------ */
function topSet(sets){
  const withW = sets.filter(s => s.weight != null);
  if(withW.length) return withW.reduce((a,b) =>
    (b.weight > a.weight || (b.weight === a.weight && (b.reps||0) > (a.reps||0))) ? b : a);
  const withD = sets.filter(s => s.duration != null);
  if(withD.length) return withD.reduce((a,b) => b.duration > a.duration ? b : a);
  return sets.reduce((a,b) => (b.reps||0) > (a.reps||0) ? b : a, { reps: null });
}
function avgRpe(sets){
  const rs = sets.map(s => s.rpe).filter(v => v != null);
  return rs.length ? round1(rs.reduce((a,b) => a + b, 0) / rs.length) : null;
}
function buildTrends(logs){
  const byEx = {};
  for(const entry of logs){
    for(const ex of entry.exercises){
      const doneSets = ex.sets.filter(isDone);
      if(!doneSets.length) continue;
      (byEx[ex.exerciseId] = byEx[ex.exerciseId] || []).push({
        date: entry.date,
        day: entry.day,
        top: topSet(doneSets),
        avgRpe: avgRpe(doneSets),
        volume: Math.round(doneSets.reduce((s,st) => s + (st.weight||0) * (st.reps||0), 0)),
        sets: doneSets.length
      });
    }
  }
  const metric = t => t.weight != null ? t.weight : (t.duration != null ? t.duration : t.reps);
  const trends = {};
  for(const [id, list] of Object.entries(byEx)){
    let direction = 'new';
    if(list.length > 1){
      // 首尾对比 + 后半段均值对比：两者同向才判定 up/down；
      // 会话数 >= 6 时再加「近3次 vs 前3次」校验，避免「涨上去后停滞」被误判为 up
      const first = metric(list[0].top), last = metric(list[list.length-1].top);
      const half = Math.ceil(list.length / 2);
      const mean = a => a.reduce((s, t) => s + (metric(t.top) || 0), 0) / a.length;
      const late = mean(list.slice(list.length - half)) - mean(list.slice(0, half));
      const recent3 = list.length >= 6 ? mean(list.slice(-3)) - mean(list.slice(0, 3)) : null;
      const d = last - first;
      direction = (d > 0 && late > 0) ? 'up' : ((d < 0 && late < 0) ? 'down' : 'plateau');
      if(direction === 'up' && recent3 !== null && recent3 <= 0) direction = 'plateau';
    }
    trends[id] = { name: (state.exercises[id] || {}).name || id, direction, sessions: list };
  }
  return trends;
}
function buildExport(n){
  n = Math.max(1, Math.round(Number(n)) || 4);
  const logs = state.logs.slice(-n);
  // 趋势基于更长历史（最近 TREND_WINDOW 次）计算，否则 4 次窗口会把平台期误判成上升
  const trendLogs = state.logs.slice(-TREND_WINDOW);
  return {
    type: 'ironlog-export',
    version: 1,
    generatedAt: new Date().toISOString().slice(0, 10),
    settings: { weightStep: state.settings.weightStep, restSec: state.settings.restSec, restNote: state.settings.restNote || '' },
    program: state.program,
    exercises: state.exercises,
    recentLogs: logs,
    trends: buildTrends(trendLogs),
    trendsSpan: trendLogs.length
  };
}
async function copyText(t){
  try{
    if(navigator && navigator.clipboard && navigator.clipboard.writeText){
      await navigator.clipboard.writeText(t);
      return true;
    }
  }catch(e){}
  try{
    const ta = $('export-text');
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, t.length);
    return !!document.execCommand('copy');
  }catch(e){ return false; }
}
/* 固定输出模板：字段名与导入解析器（validatePlan/normalizeItem）严格一致 */
const PLAN_SCHEMA = `{
  "type": "ai-plan",
  "day": "A",
  "exercises": {
    "exercise_id": {
      "name": "动作名",
      "muscles": "目标肌群",
      "mode": "weight / band / bodyweight / time 四选一",
      "unit": "kg / lb / null",
      "tips": "要点",
      "pitfalls": "避坑",
      "tempo": "节奏（离心-停-向心）",
      "alternatives": "替代动作",
      "personal": "个人注意（已有内容请保留）"
    }
  },
  "program": {
    "A": [
      {
        "section": "分区名（可省略）",
        "exerciseId": "exercises 中的 key",
        "sets": [
          { "type": "warmup", "weight": 5, "reps": 10, "duration": null, "rpe": null, "side": null },
          { "type": "work", "weight": 12.5, "reps": 8, "duration": null, "rpe": 8, "side": null }
        ]
      }
    ]
  }
}
字段规则：
- sets 的 weight/reps/duration/rpe 为数字或 null：weight/band 模式填 weight+reps，bodyweight 填 reps，time 填 duration；rpe 为目标 RPE；side 仅单侧动作填 L/R，否则 null
- exerciseId 必须存在于 exercises；program 只写需要更新的日（不更新的日不要写，也不要写空数组）`;

function buildPrompt(data){
  const logs = data.recentLogs;
  const span = logs.length
    ? `${logs[0].date} 至 ${logs[logs.length-1].date}，共 ${logs.length} 次（A 日 ${logs.filter(l => l.day === 'A').length} 次、B 日 ${logs.filter(l => l.day === 'B').length} 次）`
    : '暂无训练记录';
  const bg = ((state.profile && state.profile.background) || '').trim() || '（未填写背景，请先问我）';
  const fence = '```';
  return `你是我的力量训练数据分析助手。我的背景：
${bg}

以下是我最近的训练记录（JSON，${span}）：
${fence}json
${JSON.stringify(data, null, 2)}
${fence}
数据说明：done=false 的组是计划内未完成（数值为上次预填，非实际表现）；condition 为当日整体状态（佳/一般/差）；note 为组级/动作级备注（用户手写的实际情况，如代偿、状态、计划外调整）；trends 由已完成组聚合，回看最近 ${data.trendsSpan || logs.length} 次（可能多于 recentLogs 条数）。

请只基于这份数据分析（不要泛泛而谈通用健身知识）：
1. 各动作重量/次数/时长趋势，是否需要渐进超负荷
2. 计划（组数/次数/重量）或动作（替换/增删）是否需要调整，结合我的体态问题
3. 需要注意的异常信号（停滞、左右不对称、疑似代偿、状态波动）

输出要求（两段式）：
- 先给一段中文可读总结，说明每处调整的原因
- 再给一个 JSON 代码块，严格按以下字段结构，不要注释、不要多余逗号：
${PLAN_SCHEMA}`;
}

function runExport(withPrompt){
  const n = parseInt($('export-n').value, 10) || 4;
  const data = buildExport(n);
  const text = withPrompt ? buildPrompt(data) : JSON.stringify(data, null, 2);
  $('export-text').value = text;
  const msg = $('export-msg');
  return copyText(text).then(ok => {
    const note = data.recentLogs.length
      ? `最近 ${data.recentLogs.length} 次日志 + ${Object.keys(data.trends).length} 个动作趋势`
      : '暂无训练日志，仅含当前计划与动作库';
    msg.className = 'import-msg ' + (ok ? 'ok' : 'err');
    msg.textContent = ok
      ? `已复制（${note}${withPrompt ? '，含分析 prompt' : ''}）。粘贴给 AI，返回的 JSON 可直接用「导入 AI 方案」导入。`
      : `复制失败（${note}）：请手动全选下方文本后复制。`;
  });
}
function doExport(){ return runExport(true); }
function doExportData(){ return runExport(false); }

/* ---------------- 设置（v0.9：备注融合） ---------------- */
function renderSettings(){
  $('weight-step').value = state.settings.weightStep;
  $('rest-sec').value = state.settings.restSec;
  $('profile-bg').value = (state.profile && state.profile.background) || '';
}
$('weight-step').addEventListener('change', e => {
  const v = parseFloat(e.target.value);
  state.settings.weightStep = (isNaN(v) || v < 0.5) ? 2.5 : round1(v);
  save();
  toast('重量步进：' + state.settings.weightStep + ' kg');
});
$('rest-sec').addEventListener('change', e => {
  const v = Math.round(parseFloat(e.target.value));
  state.settings.restSec = (isNaN(v) || v < 0) ? 90 : Math.min(1800, v);
  e.target.value = state.settings.restSec;
  flushSave();
  toast(state.settings.restSec > 0 ? `组间休息：${state.settings.restSec} 秒` : '组间休息已关闭');
});
$('profile-bg').addEventListener('change', e => {
  state.profile.background = e.target.value;
  save();
  toast('训练备注已保存');
});

async function clearAll(){
  const ok1 = await askConfirm({ title: '清除全部数据？', desc: '日志、计划、动作库、进行中的记录都会删除。', okLabel: '继续' });
  if(!ok1) return;
  const ok2 = await askConfirm({ title: '再次确认', desc: '此操作不可恢复，且无法撤销。', okLabel: '全部清除' });
  if(!ok2) return;
  localStorage.removeItem(LS_KEY);
  location.reload();
}

/* ---------------- 总渲染 ---------------- */
function render(){
  $('ver-badge').textContent = 'v' + APP_VERSION;
  $('about-ver').textContent = 'v' + APP_VERSION;
  if(currentView === 'today') renderToday();
  else if(currentView === 'history') renderHistory();
  else renderSettings();
}

/* 首屏：默认视图只渲染一次，设置页控件预先填值 */
render();
renderSettings();

/* PWA：注册 service worker（file:// 下跳过；SW 内部失败不影响页面） */
if('serviceWorker' in navigator && location.protocol.startsWith('http')){
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
