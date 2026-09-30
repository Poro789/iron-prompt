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
const APP_VERSION = '0.9.95';   // 唯一版本源：页头徽章与「关于」卡片都从这里渲染；CI 会用它给 sw.js 打缓存版本戳
const TREND_WINDOW = 12;       // 趋势计算回看的训练次数（导出原始日志仍只带用户选的 N 次）

/* ---------------- 占位种子数据（导入 AI 方案后替换；旧格式由 migrate 归一化） ---------------- */
const SEED = {
  version: 1,
  settings: { lastDay: 'A', weightStep: 2.5, restSec: 90, restNote: '', warmupRestSec: 30 },
  profile: { background: '体态问题：X 型腿、肋骨外扩\n目标：增肌 + 改善体态\n（请补充：身高体重、训练水平、器械范围与上限）' },
  program: {
    A: [
      { section:'1. 动态升温与激活', exerciseId:'wall_angel',        sets:[{type:'warmup', weight:null,   reps:10,  duration:null, rpe:6}] },
      { section:'1. 动态升温与激活', exerciseId:'broom_hinge',       sets:[{type:'warmup', weight:null,   reps:5,   duration:null, rpe:6}] },
      { section:'1. 动态升温与激活', exerciseId:'cat_cow',           sets:[{type:'warmup', weight:null,   reps:8,   duration:null, rpe:6}] },
      { section:'1. 动态升温与激活', exerciseId:'glute_bridge',      sets:[{type:'warmup', weight:null,   reps:15,  duration:null, rpe:6}] },
      { section:'1. 动态升温与激活', exerciseId:'bw_squat',          sets:[{type:'warmup', weight:null,   reps:15,  duration:null, rpe:6}] },
      { section:'1. 动态升温与激活', exerciseId:'band_pull_apart',   sets:[{type:'warmup', weight:10,     reps:15,  duration:null, rpe:6}] },
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
      { section:'热身 8 分钟', exerciseId:'wall_angel',    sets:[{type:'warmup', weight:null, reps:10, duration:null, rpe:6}] },
      { section:'热身 8 分钟', exerciseId:'broom_hinge',   sets:[{type:'warmup', weight:null, reps:5,  duration:null, rpe:6}] },
      { section:'热身 8 分钟', exerciseId:'cat_cow',       sets:[{type:'warmup', weight:null, reps:8,  duration:null, rpe:6}] },
      { section:'热身 8 分钟', exerciseId:'clamshell',     sets:[{type:'warmup', weight:null, reps:15, duration:null, rpe:6, side:'L'},{type:'warmup', weight:null, reps:15, duration:null, rpe:6, side:'R'}] },
      { section:'热身 8 分钟', exerciseId:'bw_squat',      sets:[{type:'warmup', weight:null, reps:15, duration:null, rpe:6}] },
      { section:'热身 8 分钟', exerciseId:'empty_bar_warmup', sets:[{type:'warmup', weight:null, reps:10, duration:null, rpe:6}] },
      { section:'主课（组间90秒，动作间2分钟）', exerciseId:'db_glute_bridge', sets:[{type:'work', weight:null, reps:15, duration:null, rpe:8},{type:'work', weight:null, reps:15, duration:null, rpe:8}] },
      { section:'主课（组间90秒，动作间2分钟）', exerciseId:'bulgarian_squat', sets:[{type:'work', weight:null, reps:10, duration:null, rpe:8, side:'L'},{type:'work', weight:null, reps:10, duration:null, rpe:8, side:'R'}] },
      { section:'主课（组间90秒，动作间2分钟）', exerciseId:'incline_db_bench', sets:[{type:'work', weight:5, reps:10, duration:null, rpe:8},{type:'work', weight:5, reps:10, duration:null, rpe:8},{type:'work', weight:5, reps:10, duration:null, rpe:8}] },
      { section:'主课（组间90秒，动作间2分钟）', exerciseId:'band_row',        sets:[{type:'work', weight:15, reps:12, duration:null, rpe:8},{type:'work', weight:15, reps:12, duration:null, rpe:8}] },
      { section:'主课（组间90秒，动作间2分钟）', exerciseId:'lateral_raise',   sets:[{type:'work', weight:null, reps:12, duration:null, rpe:8},{type:'work', weight:null, reps:12, duration:null, rpe:8}] },
      { section:'主课（组间90秒，动作间2分钟）', exerciseId:'band_external_rot', sets:[{type:'work', weight:10, reps:15, duration:null, rpe:8, side:'L'},{type:'work', weight:10, reps:15, duration:null, rpe:8, side:'R'}] },
      { section:'主课（组间90秒，动作间2分钟）', exerciseId:'bird_dog',        sets:[{type:'work', weight:null, reps:8, duration:null, rpe:8},{type:'work', weight:null, reps:8, duration:null, rpe:8}] },
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
  // 重量/次数/时长/RPE 都没有负数语义：负值等同未填，否则会以负贡献混进容量与趋势
  return isNaN(n) || n < 0 ? null : n;
}
function normalizeSet(s){
  s = s || {};
  return {
    type: s.type === 'warmup' ? 'warmup' : 'work',
    weight: numOrNull(s.weight),
    reps: numOrNull(s.reps),
    duration: numOrNull(s.duration),
    rpe: numOrNull(s.rpe),
    rpeLabel: typeof s.rpeLabel === 'string' ? s.rpeLabel : '',
    side: s.side === 'L' || s.side === 'R' ? s.side : null
  };
}
function normalizeItem(raw){
  raw = raw || {};
  const section = typeof raw.section === 'string' ? raw.section : '';
  // repsRange 是导出里的规范拼写（自己的导出粘回来不能丢）；手写的 item 级 "reps":"8-12" 也继续接受
  const repsRange = typeof raw.repsRange === 'string' ? raw.repsRange
    : (typeof raw.reps === 'string' ? raw.reps : '');
  let sets;
  if(Array.isArray(raw.sets)){
    sets = raw.sets.map(normalizeSet);
  }else{
    // 手编备份的 sets 可能是天文数字：1e9 会当场耗尽堆内存、2^32 直接 RangeError（整个数据被静默重置）。
    // 封顶 100 组——再多也没有训练意义，导入路径本来也要求 sets 是数组。
    const n = Math.min(100, Math.max(0, Math.round(Number(raw.sets) || 0)));
    sets = Array.from({ length: n }, () => normalizeSet({}));
  }
  return { section, exerciseId: raw.exerciseId, repsRange, sets };
}
/* 已存日志/会话里的数值字段：手工编辑备份可能把重量写成字符串（"12"），
 * 容量与趋势的乘法会把 NaN 传染给整次训练；能转的转成数，转不了的归 null（等同未填）。 */
function coerceSetNums(sets){
  if(!Array.isArray(sets)) return;
  for(const s of sets){
    if(!s || typeof s !== 'object') continue;
    for(const k of ['weight', 'reps', 'duration', 'rpe']){
      if(s[k] != null && typeof s[k] !== 'number') s[k] = numOrNull(s[k]);
    }
  }
}
function migrate(d){
  if(!d.settings) d.settings = {};
  if(d.settings.restNote === undefined) d.settings.restNote = '';
  if(typeof d.settings.restSec !== 'number' || !(d.settings.restSec >= 0)) d.settings.restSec = 90;
  else d.settings.restSec = Math.min(1800, d.settings.restSec);   // 与设置页同口径封顶：手改备份写 1e9 也别倒计时到明年
  if(typeof d.settings.warmupRestSec !== 'number' || !(d.settings.warmupRestSec >= 0)) d.settings.warmupRestSec = 30;
  else d.settings.warmupRestSec = Math.min(1800, d.settings.warmupRestSec);
  /* 手工编辑/旧版备份可能缺这些：缺了就补默认值，别让 curDay() 拿到 undefined、
   * ±步进算出 NaN、或设置页显示 "undefined" */
  if(d.settings.lastDay !== 'A' && d.settings.lastDay !== 'B') d.settings.lastDay = 'A';
  if(typeof d.settings.weightStep !== 'number' || !(d.settings.weightStep > 0)) d.settings.weightStep = 2.5;
  else d.settings.weightStep = Math.min(100, d.settings.weightStep);   // 封顶：± 按钮按步进直加，1e9 的步进没有意义
  if(!Array.isArray(d.logs)) d.logs = [];
  /* 手工编辑/截断的备份里混进坏条目（null、缺 exercises）会让历史/趋势/导出整页崩。
   * 最低形状要求：对象 + exercises 是数组；其余字段缺了顶多显示空，不会崩。
   * 动作条目再筛一层：sets 不是数组的会在 reduce 时崩，直接丢弃该动作；
   * 组里的非数值字段顺手归一化（见 coerceSetNums）。 */
  d.logs = d.logs.filter(l => l && typeof l === 'object' && Array.isArray(l.exercises));
  d.logs.forEach(l => {
    l.exercises = l.exercises.filter(it => it && typeof it === 'object' && Array.isArray(it.sets));
    l.exercises.forEach(it => coerceSetNums(it.sets));
  });
  if(!d.profile) d.profile = { background: '' };
  /* profile 被手改成字符串（有人直接在备份里写背景）：保住内容，形状纠正 */
  else if(typeof d.profile !== 'object') d.profile = { background: String(d.profile) };
  if(!d.sessions) d.sessions = { A: null, B: null };
  /* v0.9.2：草稿与浏览位置进 state，刷新/崩溃不再丢数据
   *   d.drafts[day]      未确认任何一组前的预填数据（含已输入但未确认的数值）
   *   d.condDraft[day]   当日状态（佳/一般/差），会话建立前先存在这里
   *   d.ui.curPos[day]   当前停在第几组（扁平位置） */
  if(!d.drafts || typeof d.drafts !== 'object') d.drafts = {};
  /* 草稿也可能被手工改过：缺 sets 的条目会让训练页渲染崩（筛掉后若与计划数量不符，
   * getItems 会整份重建草稿，等于自动修复）；字符串数值同日志一样归一化。 */
  for(const dDay of ['A', 'B']){
    if(Array.isArray(d.drafts[dDay])){
      d.drafts[dDay] = d.drafts[dDay].filter(it => it && typeof it === 'object' && Array.isArray(it.sets));
      d.drafts[dDay].forEach(it => coerceSetNums(it.sets));
    }
  }
  if(!d.condDraft || typeof d.condDraft !== 'object') d.condDraft = { A: null, B: null };
  if(!d.ui || typeof d.ui !== 'object') d.ui = {};
  if(!d.ui.curPos || typeof d.ui.curPos !== 'object') d.ui.curPos = {};
  /* v0.9.9：导入方案前的快照，用于「撤销上次导入」（只留一层） */
  if(!d.lastImport) d.lastImport = null;
  /* v0.9.57：休息计时器与秒表按时间戳持久化，刷新/浏览器杀进程后能接上继续 */
  d.rest = (d.rest && typeof d.rest === 'object' && d.rest.endsAt > 0) ? d.rest : null;
  d.timer = (d.timer && typeof d.timer === 'object' && d.timer.startsAt > 0) ? d.timer : null;
  /* 备份整个缺 program/exercises（手工删字段/截断的 JSON）时全应用崩：
   * state.program[day] 直接抛 TypeError，连设置页都进不去，用户只能清数据重来。
   * 缺了就用内置种子补；是对象但某日缺则不动——清空计划是合法状态。 */
  if(!d.program || typeof d.program !== 'object') d.program = JSON.parse(JSON.stringify(SEED.program));
  if(!d.exercises || typeof d.exercises !== 'object') d.exercises = JSON.parse(JSON.stringify(SEED.exercises));
  // 动作条目本身可能被手编成 null/字符串：后续渲染到处直接取 .name，会在设置页每次渲染时抛 TypeError
  for(const k of Object.keys(d.exercises)){
    if(!d.exercises[k] || typeof d.exercises[k] !== 'object') d.exercises[k] = { name: k, mode: 'weight', unit: null };
  }
  for(const day of ['A','B']){
    if(d.program && Array.isArray(d.program[day])){
      d.program[day] = d.program[day].map(normalizeItem);
    }
    // v0.9: 二态迁移 done: null/undefined → false
    /* 手编备份里 sessions 可能被改成字符串、items 可能缺/坏：
     * 纠正形状而不是让训练页在 .items.forEach 上崩掉。 */
    if(d.sessions[day] && typeof d.sessions[day] !== 'object') d.sessions[day] = null;
    if(d.sessions[day] && !Array.isArray(d.sessions[day].items)) d.sessions[day].items = [];
    if(d.sessions[day] && d.sessions[day].items){
      // sets 不是数组的条目和日志侧一样丢弃：renderToday/flatPos 直接 .length/.forEach，留着必崩
      d.sessions[day].items = d.sessions[day].items.filter(it => it && typeof it === 'object' && Array.isArray(it.sets));
      d.sessions[day].items.forEach(it => (it.sets || []).forEach(s => {
        if(s.done === null || s.done === undefined) s.done = false;
      }));
      d.sessions[day].items.forEach(it => coerceSetNums(it.sets));
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

/* 清除全部数据后，reload 触发的 pagehide/visibilitychange 会回调 flushSave：
 * 不拦住它，刚删掉的旧 state 会被原样写回 localStorage——清除等于没清。 */
let clearingAll = false;
function save(){
  if(clearingAll) return;
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
/* 回到前台：后台标签的 setInterval 会被挂起（iOS 上可能整段停掉），先按时间戳纠一次，
 * 避免回来时看到几秒前的旧倒计时。休息若早已在后台到点，不补响提示音——
 * 隔了几小时回来突然响一声只会吓一跳（与 resumeTimers 刷新时的口径一致）。 */
function resumeClocks(){
  if(restEndsAt !== null){
    if(Date.now() >= restEndsAt) restDone = true;
    tickRest();
  }
  if(timerFor){ const el = timerInputEl(); if(el) el.value = timerElapsedSec(); }
  const sess = state.sessions[curDay()], clock = $('session-clock');
  if(sess && sess.startedAt && clock) clock.textContent = fmtDuration((Date.now() - sess.startedAt) / 1000);
}
document.addEventListener('visibilitychange', () => {
  if(document.visibilityState === 'hidden'){ flushSave(); return; }
  resumeClocks();
});
window.addEventListener('pagehide', flushSave);

/* ---------------- 通用工具 ---------------- */
const $ = id => document.getElementById(id);
const round1 = v => Math.round(v * 10) / 10;
const round2 = v => Math.round(v * 100) / 100;   // 重量用 0.01：AI 计划/种子常有 11.35（=25lb）这种半档精度，round1 会把它显示成 11.3/11.4，和存的数据对不上
const fmtW = v => (v === null || v === undefined || v === '') ? '' : String(round2(v));
const WEEK = ['日','一','二','三','四','五','六'];
/* 所有来自 localStorage / AI 导入的文本在拼进 innerHTML 前必须过 esc() */
const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

function fmtDuration(sec){
  if(!(sec >= 0)) return '—';   // 手工编辑/截断的日志可能缺 durationSec：显示 NaN:NaN:NaN 不如一个破折号
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec/3600), m = Math.floor(sec%3600/60), s = sec%60;
  const mm = String(m).padStart(2,'0'), ss = String(s).padStart(2,'0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}
function fmtDate(dateStr){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ''))) return '未知日期';
  const d = new Date(dateStr + 'T00:00:00');
  /* 格式对但日历不存在（手编备份的「2025-02-30」）：JS 会把它顺延成 3 月 2 日，
   * 念出「2025-02-30 周一」是日期与星期打架的假数据——只念日期本身，别猜星期 */
  if(isNaN(d.getTime()) || d.getMonth() !== +dateStr.slice(5, 7) - 1 || d.getDate() !== +dateStr.slice(8, 10)) return String(dateStr);
  return `${dateStr} 周${WEEK[d.getDay()]}`;
}
/* 本地日期串 YYYY-MM-DD。不能用 toISOString().slice(0,10)：那是 UTC，
 * 东八区凌晨 00:30 结束的训练会被记到前一天，历史与趋势的日期全部错位。 */
function localDateStr(ts){
  const d = new Date(ts);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
const isDone = s => s.done === true;
/* 聚合容量在界面上统一标 kg：lb 动作（拉力绳档位）先换算成 kg 再累加。
 * 不换算的话，一次训练里 20lb 的绳和 20kg 的哑铃会被当成一样重，总数没有统一含义。 */
const LB_TO_KG = 0.45359237;
/* items 形状（session/draft 的 items）与日志 entry.exercises 相同，容量统一走这里 */
function itemsVolume(items){
  return items.reduce((sum, it) => {
    const unit = String(((state.exercises[it.exerciseId] || {}).unit || 'kg')).trim().toLowerCase();
    const k = unit === 'lb' ? LB_TO_KG : 1;
    return sum + it.sets.filter(isDone).reduce((s, st) => s + (st.weight || 0) * k * (st.reps || 0), 0);
  }, 0);
}
function sessionVolume(entry){
  return itemsVolume(entry.exercises);
}
function sessionSets(entry){
  return entry.exercises.reduce((s, ex) => s + ex.sets.filter(isDone).length, 0);
}
/* 组间实际休息均值（秒）：restAfter 在每组休息结算时写入（跳过/换组/结束都会结算）。
 * 没有任何记录时返回 null，小结里就不显示这一行。 */
function sessionAvgRest(entry){
  const rs = [];
  for(const ex of entry.exercises) for(const st of (ex.sets || [])){
    if(typeof st.restAfter === 'number' && st.restAfter >= 0) rs.push(st.restAfter);
  }
  return rs.length ? Math.round(rs.reduce((a, b) => a + b, 0) / rs.length) : null;
}

let toastTimer = null;
let toastAction = null;   // 提示条上的按钮（目前只有「撤销删除」）
function hideToast(){
  const t = $('toast');
  t.classList.remove('show');
  t.classList.remove('with-act');   // 没有按钮时提示条不接收点击，不挡下面的按钮
  toastAction = null;
}
/* 第二个参数传函数时，提示条里多一个「撤销」按钮，并停留更久（6s） */
function toast(msg, action){
  const t = $('toast');
  if(typeof action !== 'function' && toastAction){
    // 待撤销的删除还没过期时来了个普通提示（复制成功、保存失败…）：
    // 不能把它悄悄吞掉——吞掉后删除就再也救不回来了。保留撤销按钮，只换文案、续期。
    t.innerHTML = esc(msg) + '<button class="toast-act" data-act="undo">撤销</button>';
    t.classList.add('with-act');
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 6000);
    return;
  }
  toastAction = typeof action === 'function' ? action : null;
  t.classList.remove('with-act');
  if(toastAction){
    t.innerHTML = esc(msg) + '<button class="toast-act" data-act="undo">撤销</button>';
    t.classList.add('with-act');
  }else{
    t.textContent = msg;
  }
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, toastAction ? 6000 : 2200);
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
  setBackdropInert(true);
  return new Promise(res => { confirmResolve = res; });
}
function answerConfirm(ok){
  $('confirm-overlay').classList.remove('show');
  setBackdropInert(false);
  const r = confirmResolve;
  confirmResolve = null;
  if(r) r(ok);
}
/* 键盘纪律：模态打开时背景整体 inert（Tab 不再落到背景控件），ESC 关闭最上层模态。
 * 遮罩只挡指针（display:flex），键盘原本是完全穿透的：小结开着时按 Tab+Enter
 * 能在背后凭空开一次「进行中」；确认框开着时能触发背景按钮，甚至嵌套两个确认
 * 让第一个 Promise 永不 resolve。 */
function setBackdropInert(on){
  [document.querySelector('header'), $('drawer'), document.querySelector('main')].forEach(el => {
    if(!el || !el.setAttribute) return;
    if(on) el.setAttribute('inert', ''); else el.removeAttribute('inert');
  });
}
document.addEventListener('keydown', e => {
  if(e.key !== 'Escape') return;
  if($('confirm-overlay').classList.contains('show')) answerConfirm(false);
  else if($('summary-overlay').classList.contains('show')) closeSummary();
});

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
  // 切视图后回到页首：新视图更短时浏览器只会夹掉多余滚动，仍停在旧位置
  window.scrollTo({ top: 0, behavior: 'smooth' });
  render();
}
/* 抽屉开关（关闭态 visibility:hidden 由 CSS 保证，控件不进 Tab 序列；
 * aria-expanded 告诉读屏器菜单状态，打开时焦点进抽屉、关闭时还给汉堡按钮） */
function toggleDrawer(){
  $('drawer').classList.toggle('open');
  $('drawer-overlay').classList.toggle('show');
  const isOpen = $('drawer').classList.contains('open');
  $('hamburger-btn').setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  if(isOpen){ const c = document.querySelector('.drawer-close'); if(c) c.focus(); }
}
function closeDrawer(){
  const wasOpen = $('drawer').classList.contains('open');
  $('drawer').classList.remove('open');
  $('drawer-overlay').classList.remove('show');
  $('hamburger-btn').setAttribute('aria-expanded', 'false');
  if(wasOpen) $('hamburger-btn').focus();
}

/* ---------------- 今日训练 ----------------
 * 草稿（未确认任何一组前的预填数据、当日状态选择）存在 state 里而不是内存变量：
 * 训练中刷新页面 / 浏览器被系统回收，输入过的数值不再凭空消失。 */
let draft = {};      // 指向 state.drafts（见下），保留局部名只为可读性
let condDraft = {};  // 指向 state.condDraft
function bindDrafts(){
  draft = state.drafts;
  condDraft = state.condDraft;
}
bindDrafts();

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
  curPos = state.ui.curPos[d] || 0;   // A/B 各记各的位置，切回来不用重找
  // 休息属于上一日的某组：切走前结算到它自己的组上（换日后 curDay 已变，晚一步就写错地方）。
  // 秒表不同：它的读数实时写进输入框，换日只清掉挂起的引用。
  if(restEndsAt !== null) finishRest();
  clearTimer();
  save();
  render();
}

/* 上次同动作的数值：跳过热身组，取最近一次日志中该动作的「最好一组」。
 * 按模式选主指标（weight/time/bodyweight → weight/duration/reps）：
 * 计时动作（平板、拉伸）没有重量，旧写法按 weight 挑会落到第一个已完成组，
 * 一次平板 30/45/60 秒时「上次最长」显示 30 秒，uselast 也填 30——应当是 60。 */
/* 当前模式会显示/使用的指标。预填与「沿用上次」只填这些：
 * 动作从计时改成重量后，旧 duration 若被悄悄带进新组，界面上看不见，
 * 但历史详情会优先读 duration 显示成「45 秒」而不是「60kg×10」。 */
function modeFields(mode){
  if(mode === 'time') return ['duration'];
  if(mode === 'bodyweight') return ['reps'];
  return ['weight', 'reps'];
}
function lastValues(exerciseId){
  const ex = state.exercises[exerciseId];
  const mode = (ex && ex.mode) || 'weight';
  const f = mode === 'time' ? 'duration' : (mode === 'bodyweight' ? 'reps' : 'weight');
  for(let i = state.logs.length - 1; i >= 0; i--){
    const exl = state.logs[i].exercises.find(e => e.exerciseId === exerciseId);
    if(!exl) continue;
    const done = exl.sets.filter(s => isDone(s) && s.type !== 'warmup');
    if(!done.length) continue;
    const g = done.reduce((a, b) => ((b[f] || 0) > (a[f] || 0) ? b : a));
    return { weight: g.weight ?? null, reps: g.reps ?? null, duration: g.duration ?? null, date: state.logs[i].date || null };
  }
  return { weight: null, reps: null, duration: null, date: null };
}

/* PR 判定：只有刷新历史最好成绩才算。两个对比对象缺一不可：
 * 1) 全部历史日志的最好成绩——不是「上一次」：减载周之后按最近一次比，
 *    会把远离纪录的数值误标成 PR（历史 100、上次 50、这次 60 不是纪录）。
 * 2) 本次会话里同动作的其他已完成正式组——刚确认过 85，再确认 52 不算破纪录。
 * 没有任何历史记录时不算 PR（与「上次」显示一致，不给第一组刷徽章）。 */
function detectPR(day, exIdx, setIdx, exerciseId){
  const ex = state.exercises[exerciseId];
  const mode = (ex && ex.mode) || 'weight';
  const f = mode === 'time' ? 'duration' : (mode === 'bodyweight' ? 'reps' : 'weight');
  const cur = getItems(day)[exIdx].sets[setIdx][f];
  if(cur == null) return false;
  let best = null;
  for(const log of state.logs){
    const le = log.exercises.find(e => e.exerciseId === exerciseId);
    if(!le) continue;
    for(const s of le.sets){
      if(!isDone(s) || s.type === 'warmup') continue;
      if(s[f] != null && (best === null || s[f] > best)) best = s[f];
    }
  }
  if(best === null) return false;
  const siblings = getItems(day)[exIdx].sets;
  for(let i = 0; i < siblings.length; i++){
    if(i === setIdx) continue;
    const s = siblings[i];
    if(!isDone(s) || s.type === 'warmup') continue;
    if(s[f] != null && s[f] >= cur) return false;
  }
  return cur > best;
}

/* 卡片上的「上次」一行：训练中决定「要不要加」，前提是看得见上次做到了多少。
 * 点一下就把上次的数值填进这一组，省掉照着记忆打字。热身组不显示（它的目标本来就比正式组低）。 */
function lastHintHTML(exIdx, setIdx, exId, ex, set){
  if(set.type === 'warmup') return '';
  const lv = lastValues(exId);
  const mode = ex.mode || 'weight';
  let desc = '';
  if(mode === 'time'){
    if(lv.duration != null) desc = '上次最长 ' + Math.round(lv.duration) + ' 秒';
  }else if(mode === 'bodyweight'){
    if(lv.reps != null) desc = '上次最多 ' + lv.reps + ' 次';
  }else{
    const w = lv.weight != null ? fmtW(lv.weight) + esc(ex.unit || 'kg') : '';
    const r = lv.reps != null ? '×' + lv.reps : '';
    if(w) desc = '上次最重 ' + w + r;
    else if(r) desc = '上次做过 ' + r;   // 历史里没记重量（只填了次数），别谎称「最重」
  }
  if(!desc) return '';
  const when = lv.date ? ' <span class="fs-last-date">' + esc(String(lv.date).slice(5)) + '</span>' : '';
  return `<button class="fs-last" data-ex="${exIdx}" data-set="${setIdx}" data-act="uselast"
          aria-label="沿用上次记录的数值">↑ ${desc}${when}<span class="fs-last-act">点按沿用</span></button>`;
}

/* 当前日期的可编辑 items：有进行中记录用记录，否则用草稿（计划规格优先，上次数值兜底） */
function getItems(day){
  if(state.sessions[day]) return state.sessions[day].items;
  /* 草稿现在会存盘，所以要先确认它和当前计划还对得上：组数不一致（计划被改过、
   * 或数据来自更早的版本）就丢掉重建，否则会出现「对着不存在的组编辑」。 */
  if(draft[day] && draft[day].length !== (state.program[day] || []).length) delete draft[day];
  if(!draft[day]){
    draft[day] = (state.program[day] || []).map(p => {
      const lv = lastValues(p.exerciseId);
      const keep = modeFields((state.exercises[p.exerciseId] || {}).mode || 'weight');
      return {
        exerciseId: p.exerciseId,
        note: '',
        repsRange: p.repsRange || '',   // 计划里的 "8-12" 次数区间：目标标签要用，不带就只剩「N 组」
        sets: p.sets.map(spec => ({
          type: spec.type,
          weight: spec.weight ?? (keep.includes('weight') ? lv.weight : null),
          reps: spec.reps ?? (keep.includes('reps') ? lv.reps : null),
          duration: spec.duration ?? (keep.includes('duration') ? lv.duration : null),
          rpe: null,
          side: spec.side ?? null,
          targetRpe: spec.rpe,
          targetRpeLabel: spec.rpeLabel || '',
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
    delete draft[day];   // 草稿已升格为进行中记录，不留第二份引用
  }
}

/* 卡片右上角目标标签：如 "热身 1 + 2 × 10" / "4 × 30s" */
function targetLabel(item){
  let work = item.sets.filter(s => s.type !== 'warmup');
  const warmOnly = !work.length;
  if(warmOnly) work = item.sets;   // 纯热身动作：目标就念热身组，别显示「热身 2 + 0 组」
  const warm = warmOnly ? 0 : item.sets.length - work.length;
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
  return warm ? '热身 ' + warm + ' + ' + core : (warmOnly ? '热身 ' + core : core);
}

/* ---------------- 全屏一次一组（v0.8 交互） ----------------
 * 一屏只显示当前组：大数字 + 输入框与 ± 步进 + 备注 + RPE 步进 + 完成按钮。
 * 完成按钮二态：○ 未记录 ↔ ✓ 已完成（再点一次取消）；整个动作都没记录时可「跳过此动作」。
 * 组间休息集成在卡片内：确认一组后卡片切到休息态；倒计时到 0 提示后继续向上计（超时），
 * 由用户点「下一组」继续——点的时候把实际休息用时记进该组的 restAfter。
 */
let curPos = state.ui.curPos[curDay()] || 0;  // 当前 (exIdx, setIdx) 扁平化位置，从上次停下的地方继续
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
  /* 记住停在第几组：切走再回来 / 页面被回收后重开，不用从头找第几组。 */
  if(state.ui.curPos[day] !== curPos){ state.ui.curPos[day] = curPos; saveSoon(); }
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
    startSessionIfNeeded(day);
    set.done = true;
    // PR 检测：仅正式组，对比历史最好成绩 + 本次会话同动作其他已完成组
    if(set.type !== 'warmup'){
      const item = getItems(day)[exIdx];
      set.isPR = detectPR(day, exIdx, setIdx, item.exerciseId);
    }
    // 休息归属：始终指向被确认的这一组。不用 curPos——确认会重建 DOM，
    // 用户此刻可能已经手动切组，用 curPos 会把休息时长写到别的组上。
    startRestTimer({ exIdx, setIdx });
  }
}
function setDoneState(day, exIdx, setIdx, val){
  const set = getItems(day)[exIdx].sets[setIdx];
  if(!set) return;
  set.done = val;
}
/* 已确认的组改了数字：PR 徽章必须跟着重算。
 * 确认 105 拿到 🔥 后改成 90，🔥 还挂着；确认 90 后 ± 加到 105 却没有 🔥——
 * 两个方向都会让徽章和真实表现脱钩。未确认的组不重算（确认时才判定）。 */
function refreshPR(day, exIdx, setIdx){
  const item = getItems(day)[exIdx];
  const set = item && item.sets[setIdx];
  if(!set || set.done !== true) return;
  set.isPR = set.type !== 'warmup' && detectPR(day, exIdx, setIdx, item.exerciseId);
}
/* 按模式生成输入框 + ± 步进按钮。
 * 训练中改数值最常见的动作是「比上次加 2.5kg」「少做 1 个」，键盘输入是这套流程里最烦的一步：
 * weight 用设置里的重量步进，reps ±1，时长 ±5 秒；精确值仍然可以直接打字。 */
function setInputsHTML(exIdx, setIdx, st, ex){
  const d = f => `data-ex="${exIdx}" data-set="${setIdx}" data-f="${f}"`;
  const step = (f, dir, label) => `<button class="fs-step" data-ex="${exIdx}" data-set="${setIdx}" data-f="${f}" data-act="step" data-dir="${dir}" aria-label="${label}">${dir < 0 ? '−' : '＋'}</button>`;
  const mode = ex.mode || 'weight';
  if(mode === 'time'){
    /* 表归属另一日时（罕见：恢复后视图与归属不同日）别把它的读数画进当前卡片 */
    const running = timerFor && timerForDay === curDay() && timerFor.exIdx === exIdx && timerFor.setIdx === setIdx;
    const shown = running ? timerElapsedSec() : (st.duration ?? '');
    const timerBtn = `<button class="fs-timer${running ? ' running' : ''}" data-ex="${exIdx}" data-set="${setIdx}" data-act="timer" aria-label="${running ? '停止计时并填入时长' : '开始计时'}">${running ? '停止' : '计时'}</button>`;
    return `${timerBtn}<span class="val-group">${step('duration', -1, '时长减少 5 秒')}<input class="fs-input" ${d('duration')} inputmode="numeric" value="${shown}" aria-label="时长（秒）"><span class="fs-unit">秒</span>${step('duration', 1, '时长增加 5 秒')}</span>`;
  }
  if(mode === 'bodyweight'){
    return `<span class="fs-bw">自重</span><span class="val-group">${step('reps', -1, '次数减少 1')}<input class="fs-input" ${d('reps')} inputmode="numeric" value="${st.reps ?? ''}" aria-label="次数"><span class="fs-unit">次</span>${step('reps', 1, '次数增加 1')}</span>`;
  }
  const ws = state.settings.weightStep;
  const unitLbl = esc(ex.unit || 'kg');   // 读屏文案与实际显示的单位保持一致（lb/band 不再念成 kg）
  return `<span class="val-group">${step('weight', -1, '重量减少 ' + ws + ' ' + unitLbl)}<input class="fs-input" ${d('weight')} inputmode="decimal" value="${fmtW(st.weight)}" aria-label="重量（${unitLbl}）"><span class="fs-unit">${unitLbl}</span>${step('weight', 1, '重量增加 ' + ws + ' ' + unitLbl)}</span>
    <span class="val-group">${step('reps', -1, '次数减少 1')}<input class="fs-input" ${d('reps')} inputmode="numeric" value="${st.reps ?? ''}" aria-label="次数"><span class="fs-unit">次</span>${step('reps', 1, '次数增加 1')}</span>`;
}
function fullScreenHTML(day){
  const program = state.program[day] || [];
  if(!program.length) return '<div class="empty-hint">该日暂无动作，等待导入训练计划。</div>';
  const p = clampPos(day);
  const pos = flatPos(day)[p];
  const { ex: rawEx, item, set } = posLabel(day, pos);
  if(!item || !set) return '<div class="empty-hint">没有可显示的组。</div>';
  let ex = rawEx, missing = '';
  if(!ex){
    /* 动作库里没有这个 id（导入的计划只给了 id，没带动作定义）。
     * 不能停在空白页——那样既记不了也切不走。合成一个最小动作：照常可导航可记录，
     * 同时把问题讲明白，补上定义后要点自动恢复。 */
    ex = { name: item.exerciseId, muscles: '', mode: 'weight', unit: 'kg',
           tips: '', pitfalls: '', tempo: '', alternatives: '', personal: '' };
    missing = `<div class="warn-inline">动作库里没有 <b>${esc(item.exerciseId)}</b> 的定义（导入计划时缺动作库条目）。数值照常记录，补上定义后要点会恢复。</div>`;
  }
  const mode = ex.mode || 'weight';
  const unitTag = (mode === 'weight' || mode === 'band') ? ' · ' + esc(ex.unit || 'kg') : '';
  const sideTag = set.side ? `<span class="fs-side">${set.side === 'L' ? '左' : '右'}侧</span>` : '';
  const warmTag = set.type === 'warmup' ? '<span class="fs-warm">热身</span>' : '';
  /* 计划段落名与编号：正常会话 items 与 program 一一对应（getItems 有长度守卫）。
   * 但从历史「改一下」的旧记录是按当时实际做过的动作筛过的，可能比 program 短——
   * 这时按 exerciseId 找回计划条目，分区名和编号跟着计划走，不串位。 */
  const items = getItems(day);
  const aligned = items.length === program.length;
  const planIdx = aligned ? pos.exIdx
    : Math.max(0, program.findIndex(pr => pr.exerciseId === item.exerciseId));
  const secName = (program[planIdx] || {}).section || '';
  const sectionLine = secName ? `<div class="fs-section">${esc(secName)}</div>` : '';
  const notes = [
    ex.tips ? `<div class="note"><b>要点</b>${esc(ex.tips)}</div>` : '',
    ex.pitfalls ? `<div class="note"><b>避坑</b>${esc(ex.pitfalls)}</div>` : '',
    ex.tempo ? `<div class="note"><b>节奏</b>${esc(ex.tempo)}</div>` : '',
    ex.alternatives ? `<div class="note"><b>替代</b>${esc(ex.alternatives)}</div>` : '',
    ex.personal ? `<div class="note"><b>个人</b>${esc(ex.personal)}</div>` : ''
  ].join('');
  const rpeTarget = set.targetRpe != null ? `<span class="rpe-target">目标 ${esc(set.targetRpe)}${set.targetRpeLabel ? ` <span class="rpe-target-label">${esc(set.targetRpeLabel)}</span>` : ''}</span>` : '';
  const doneCls = set.done === true ? 'done' : 'undone';
  const doneIcon = set.done === true ? '✓' : '✗';
  const doneLabel = set.done === true ? '已完成' : '未完成';
  // 休息条同秒表口径：只在归属日的卡片上显示（applyPlan/刷新可以带着视图切到另一日，
  // 归属另一日的倒计时不该画进当前卡片；切日手势本身会先结算它）。
  const restActive = restEndsAt !== null && restForDay === day;
  // 当日进度
  const allPos = flatPos(day);
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
  /* 组点二态说明：done=false 只是「还没记」，不是「没做到」——未确认的组保持中性灰点，
   * 只有确认过的组变绿（三态时代的红点分支会让整列还没开始的组全是红的）。
   * 注意这段必须在 return 的模板字符串外面：写在模板里的 // 注释会被原样渲染到卡片上。 */
  return `
    <div class="fs-card">
      <div class="fs-progress" aria-hidden="true"><div class="fs-progress-fill" style="width:${pct}%"></div></div>
       ${sectionLine}
      ${restActive ? `
      <div class="fs-rest-bar" role="timer" aria-label="组间休息计时">
        <span class="rest-label">休息</span>
        <span class="rest-clock" id="rest-clock">${restClock}</span>
        <button class="cond-btn" onclick="skipRest()">跳过</button>
      </div>` : ''}
      <div class="fs-top">
        <button class="fs-nav" data-act="prev" aria-label="上一组">‹</button>
        <div class="fs-title">
          <div class="fs-name"><span class="fs-num">${planIdx + 1}.</span> ${esc(ex.name)}${sideTag}${warmTag}</div>
          <div class="fs-muscles">${esc(ex.muscles || '')}</div>
        </div>
        <button class="fs-nav" data-act="next" aria-label="下一组">›</button>
      </div>
      ${missing}
      ${notes ? `<details class="ex-notes" data-notes="${pos.exIdx}" ${openNotes[day + ':' + pos.exIdx] ? 'open' : ''}><summary>要点 / 避坑 / 节奏</summary>${notes}</details>` : ''}
      <div class="fs-set">
        <div class="fs-sub">第 ${pos.setIdx + 1} / ${item.sets.length} 组 · ${esc(targetLabel(item))}${unitTag}${set.isPR ? ' <span class="pr-badge">🔥 PR</span>' : ''}</div>
        <div class="fs-dots" aria-hidden="true">${item.sets.map((st, si) => `<span class="fs-dot${si === pos.setIdx ? ' cur' : ''}${st.done === true ? ' ok' : ''}"></span>`).join('')}</div>
        ${lastHintHTML(pos.exIdx, pos.setIdx, item.exerciseId, ex, set)}
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
        ${item.sets.length > 1 && item.sets[item.sets.length - 1].done !== true ? `<button class="add-set" data-ex="${pos.exIdx}" data-act="delset">− 删掉最后一组</button>` : ''}
        <input class="fs-exnote" maxlength="500" data-ex="${pos.exIdx}" value="${esc(item.note || '')}" placeholder="动作备注（可选）">
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
  const vol = Math.round(itemsVolume(items));
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

/* 组内局部更新：只改一个输入框的值（保留焦点，不重建整屏） */
function patchValue(exIdx, setIdx, f, val){
  const inp = document.querySelector(`#ex-list input[data-f="${f}"][data-ex="${exIdx}"][data-set="${setIdx}"]`);
  if(!inp) return false;
  inp.value = val;
  return true;
}
/* 组内局部更新：只替换 RPE 值（保留输入焦点）；其余变化走全量渲染 */
function patchRpe(exIdx, setIdx){
  const day = curDay();
  const item = getItems(day)[exIdx];
  if(!item) return false;
  // 限定在卡片容器内：全页 querySelector('.rpe-val') 会命中别的视图里的同名元素
  const val = document.querySelector(`#ex-list .rpe-val`);
  if(!val) return false;
  val.textContent = item.sets[setIdx].rpe ?? '–';
  return true;
}

/* 全屏卡片交互（事件委托）：组导航 / 二态完成 / RPE 步进 / 加组 / 跳过动作 */
$('ex-list').addEventListener('click', e => {
  const btn = e.target.closest('button[data-act]');
  if(!btn) return;
  unlockAudio();   // 用户手势：解锁提示音用的 AudioContext（iOS 上之后定时器里无法解锁）
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
    // 跳到下一个还没做完的动作的第一组（整组做完的动作跳过没有意义）
    const pos = flatPos(day)[curPos];
    if(pos){
      const items = getItems(day);
      let nextEx = pos.exIdx + 1;
      while(nextEx < items.length && items[nextEx].sets.every(s => s.done === true)) nextEx++;
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
      side: last ? (last.side ?? null) : null,   // 单侧动作补组：沿用最后一组的左/右（界面上没有改 side 的入口，不继承就丢）
      targetRpe: last ? last.targetRpe : null,
      targetRpeLabel: last ? (last.targetRpeLabel || '') : '',
      restAfter: null,
      done: false
    });
    saveSoon(); renderToday();
    return;
  }

  if(act === 'delset'){
    // 删组：只允许删最后一组，且未确认的组（已确认的组不会被误删）
    if(item.sets.length <= 1) return;
    const lastIdx = item.sets.length - 1;
    const removed = item.sets[lastIdx];
    if(removed.done === true) return;
    /* 秒表归属另一日时别连带清掉它（与渲染守卫 v0.9.70 同一口径） */
    if(timerFor && timerForDay === curDay() && timerFor.exIdx === exIdx && timerFor.setIdx === lastIdx) clearTimer();
    item.sets.pop();
    saveSoon(); renderToday();
    toast('已删掉最后一组', () => {
      const it = getItems(day)[exIdx];
      if(it && it.sets.length === lastIdx){ it.sets.push(removed); flushSave(); renderToday(); }
      else toast('这个动作已经有新的组了');
    });
    return;
  }

  const setIdx = +btn.dataset.set;
  const set = item.sets[setIdx];
  if(!set) return;

  if(act === 'step'){
    // ± 步进：重量按设置里的步进，次数 ±1，时长 ±5 秒；下限 0（次数下限 1）
    const f = btn.dataset.f;
    const dir = +btn.dataset.dir;
    const inc = f === 'weight' ? state.settings.weightStep : (f === 'duration' ? 5 : 1);
    const next = Math.max(f === 'reps' ? 1 : 0, f === 'weight' ? round2((Number(set[f]) || 0) + dir * inc) : Math.round((Number(set[f]) || 0) + dir * inc));
    const wasPR = set.isPR === true;
    set[f] = next;
    refreshPR(day, exIdx, setIdx);
    saveSoon();
    // PR 状态变了：🔥 徽章在 .fs-sub 里，patchValue 只改输入框，必须整卡重画才看得见变化
    if(set.done === true && (set.isPR === true) !== wasPR){ renderToday(); return; }
    if(!patchValue(exIdx, setIdx, f, f === 'weight' ? fmtW(next) : next)) renderToday();
    return;
  }

  if(act === 'timer'){
    // 计时动作（平板/拉伸/呼吸）：按一下开始，再按一下把经过的秒数填进这一组
    /* 只有表就挂在当前日时才按「按一下停」处理；归属别的日时这一下是新起一张表 */
    if(timerFor && timerForDay === curDay() && timerFor.exIdx === exIdx && timerFor.setIdx === setIdx) stopTimer();
    else { stopTimer(); startTimer(exIdx, setIdx); }
    renderToday();
    return;
  }

  if(act === 'uselast'){
    /* 沿用上次：只填上次真记录过的字段（没记录的不动），填完重画卡片让人看见变化。
     * 这是「比上次加一点」的第一步——先拿到上次的数，再用 ± 往上加。 */
    const lv = lastValues(item.exerciseId);
    /* 只填当前模式会显示的字段（与预填同规矩）：改过模式的动作不带上看不见旧指标 */
    const keep = modeFields((state.exercises[item.exerciseId] || {}).mode || 'weight');
    let used = false;
    if(lv.weight != null && keep.includes('weight')){ set.weight = lv.weight; used = true; }
    if(lv.reps != null && keep.includes('reps')){ set.reps = lv.reps; used = true; }
    if(lv.duration != null && keep.includes('duration')){ set.duration = lv.duration; used = true; }
    if(used){
      // 沿用上次改了已确认组的数字：🔥 必须跟着重算（与 step/change 同一规矩）
      refreshPR(day, exIdx, setIdx);
      saveSoon();
    }
    renderToday();
    return;
  }

  if(act === 'confirm'){
    if(restEndsAt !== null) finishRest();
    // 确认时秒表还在跑（且就挂在当前日）：先停表填入时长，再记这一组，省掉「看表→打字」
    if(timerFor && timerForDay === curDay() && timerFor.exIdx === exIdx && timerFor.setIdx === setIdx) stopTimer();
    // 不做「幽灵点击抑制」：CSS 已对所有 button 设 touch-action:manipulation
    // （见 css/style.css:13），双击缩放不会发生；再加时间窗只会吞掉用户故意的快速撤销。
    cycleDone(day, exIdx, setIdx);
    if(navigator.vibrate) navigator.vibrate(50);
    saveSoon(); renderToday();
    return;
  }
  if(act === 'dec' || act === 'inc'){
    /* 从目标 RPE 起步（计划里写了 targetRpe 就用它），范围 1–10：
     * 拉伸/呼吸的目标只有 RPE 2–4，旧代码下限卡在 5，记不了真实强度。 */
    const base = set.rpe ?? set.targetRpe ?? (act === 'inc' ? 7.5 : 8.5);
    set.rpe = act === 'inc' ? Math.min(10, round1(base + 0.5))
                            : Math.max(1,  round1(base - 0.5));
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
    /* 封顶 500 字（输入框也有 maxlength）：超长备注会把 localStorage 写爆，
     * 配额失败连累的是整个应用的所有持久化，不只是这条备注。 */
    item.note = inp.value.trim().slice(0, 500);
    saveSoon();
    return;
  }
  const set = item.sets[+inp.dataset.set];
  if(!set) return;
  const wasPR = set.isPR === true;
  /* 中文输入法的全角字符（１２、全角句点。）先转半角再解析：
   * 否则「12。5」会被 parseFloat 读成 12，小数位无声丢掉。
   * 欧系小数逗号同理：「12,5」→12.5（只认结尾 1–2 位小数的逗号，
   * 「1,500」这种千分位不动，避免把 1500 读成 1.5）。 */
  const v = parseFloat(String(inp.value)
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 48))
    .replace(/[．。]/g, '.')
    .replace(/(\d)[,，](\d{1,2})$/, '$1.$2'));
  /* 粘贴超长数字（300 位）或 1e308：round2 里 v*100 溢出成 Infinity，
   * 存进 state 后输入框显示「Infinity」、容量「∞」、假 PR，
   * 而且 JSON.stringify(Infinity)=null——导出/备份里静默变没填。
   * 有限但荒谬的巨数（1e302）同样只会制造假 PR：超过 1e6 一律按非法值处理。 */
  const fin = x => Number.isFinite(x) && x <= 1e6 ? x : null;
  if(inp.dataset.f === 'weight'){
    set.weight = fin(Math.max(0, round2(v)));
  }else if(inp.dataset.f === 'duration'){
    set.duration = fin(Math.max(0, Math.round(v)));
  }else{
    set.reps = fin(Math.max(0, Math.round(v)));
  }
  /* 内部纠正了就要写回输入框（与设置页步进同一规矩）：
   * 否则框里还显示「abc」或「62.49」，存的却是 null / 62.5，显示和数据对不上。 */
  const val = inp.dataset.f === 'weight' ? set.weight : inp.dataset.f === 'duration' ? set.duration : set.reps;
  if(val === null){ if(inp.value !== '') inp.value = ''; }
  else if(String(inp.value) !== String(val)) inp.value = val;
  refreshPR(day, exIdx, +inp.dataset.set);
  saveSoon();
  // 改数可能让 🔥 出现或消失（徽章在 .fs-sub 里）：状态变了就重画卡片。
  // change 在失焦/回车时触发，焦点已经离开输入框，重画不会打断输入。
  if(set.done === true && (set.isPR === true) !== wasPR) renderToday();
});

/* 回车推进流（桌面/PWA 常见）：重量框回车 → 跳到次数框；次数/时长框回车 → 完成这一组。
 * 先按 change 委托同一路径提交当前输入，再跳转或完成——否则 Enter 抢在失焦提交前，
 * 完成的是旧值。移动端数字键盘通常显示「下一项」，不触发 Enter，不会添乱。 */
$('ex-list').addEventListener('keydown', e => {
  if(e.key !== 'Enter') return;
  // 模态打开时不推进训练（inert 之外的双保险：老浏览器不认 inert）
  if($('confirm-overlay').classList.contains('show') || $('summary-overlay').classList.contains('show')) return;
  const inp = e.target.closest && e.target.closest('input.fs-input');
  if(!inp) return;
  e.preventDefault();
  inp.dispatchEvent(new Event('change', { bubbles:true }));
  const ex = inp.dataset.ex, set = inp.dataset.set;
  const next = inp.dataset.f === 'weight'
    ? document.querySelector(`#ex-list .fs-input[data-ex="${ex}"][data-set="${set}"][data-f="reps"]`)
    : null;
  if(next){ next.focus(); return; }
  const done = document.querySelector(`#ex-list .fs-done[data-ex="${ex}"][data-set="${set}"]`);
  if(done) done.click();
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

/* 历史里的「删除这次记录」：清掉试训或填错的整次记录，6 秒内在提示条里可撤销。
 * 「改一下」：把旧记录放回编辑态（改数值不改变它发生在哪一天）。 */
$('hist-list').addEventListener('click', async e => {
  const btn = e.target.closest('button[data-act="dellog"], button[data-act="reeditlog"]');
  if(!btn) return;
  const ts = Number(btn.dataset.ts);
  let i = Number.isFinite(ts) ? state.logs.findIndex(l => l.startedAt === ts) : -1;
  if(i < 0 && btn.dataset.i !== ''){
    const alt = state.logs[+btn.dataset.i];
    if(alt && (alt.startedAt ?? '') === btn.dataset.ts) i = +btn.dataset.i;
  }
  if(i < 0){ toast('这条记录已经不在了'); return; }
  const entry = state.logs[i];

  if(btn.dataset.act === 'reeditlog'){
    const day = entry.day === 'B' ? 'B' : 'A';
    if(state.sessions[day]){ toast('这一日已经有新的记录了'); return; }
    state.logs.splice(i, 1);
    // 不在这里 resetRest：休息属于另一日（本日的进行中记录已被上面的守卫挡掉），
    // 紧接着的 switchDay 会按归属日把它结算到对应的组上——无差别清掉会永久丢掉 restAfter。
    // clearTimer 也不必：switchDay 自己会清秒表引用（读数本来就实时写在输入框里）。
    // condDraft 也不动：这条路径没有会话、condDraft 存的是用户今天刚选的状态，
    // 覆盖成旧记录的状态会在结束/放弃后把它悄悄吞掉（小结里的「改一下」另有恢复逻辑）。
    state.sessions[day] = {
      startedAt: Date.now(),   // 时钟从本次编辑起算；原时间戳存在 keepMeta 里
      items: entry.exercises.map(it => ({ exerciseId: it.exerciseId, note: it.note ?? '', sets: it.sets.map(s => ({ ...s })) })),
      condition: entry.condition ?? null,
      keepMeta: { date: entry.date, startedAt: entry.startedAt ?? null, endedAt: entry.endedAt ?? null, durationSec: entry.durationSec ?? null },
      originalEntry: entry   // 放弃这次编辑时原记录要能原样放回
    };
    switchView('today'); switchDay(day);
    flushSave();
    toast('已放回编辑，改完点「结束训练」会按原日期写回');
    return;
  }

  const ok = await askConfirm({
    title: '删除 ' + fmtDate(entry.date) + ' 的记录？',
    desc: '趋势、导出和 AI 分析都不再包含它。删除后 6 秒内可以撤销。',
    okLabel: '删除'
  });
  if(!ok) return;
  state.logs.splice(i, 1);
  flushSave();
  render();
  toast('已删除 ' + fmtDate(entry.date) + ' 的记录', () => {
    /* 撤销时列表可能已经变了（比如这 6 秒里又结束了一次训练）：
     * 按 startedAt 有序插回，而不是塞回原来的下标。 */
    insertLog(entry);
    flushSave();
    render();
    toast('已恢复');
  });
});

/* 提示条上的按钮 */
$('toast').addEventListener('click', e => {
  if(!e.target.closest('button[data-act="undo"]')) return;
  const fn = toastAction;
  hideToast();
  if(fn) fn();
});

/* 结束训练：写入 logs（P0 闭环的落盘点） */
/* 刚结束的那次记录：summary 里的「改一下」用它把记录放回编辑态，
 * 关掉小结或另开一次记录后就失效（不留悬挂引用）。 */
let lastEnded = null;

/* 日志按 startedAt 保持时间序：正常结束插在末尾；「改一下」的旧记录按原时间戳回到原位 */
function insertLog(entry){
  const ins = state.logs.findIndex(l => (l.startedAt ?? 0) > (entry.startedAt ?? 0));
  if(ins >= 0) state.logs.splice(ins, 0, entry); else state.logs.push(entry);
}

function endSession(){
  const day = curDay();
  const sess = state.sessions[day];
  if(!sess) return;
  // 结束训练时秒表/休息还在跑：先结算（秒表把经过的秒填进这一组；休息记到被确认的组上），
  // 再做快照。顺序反过来会把用户真实做过的 40 秒平板、真实休息过的 45 秒丢掉。
  if(timerFor) stopTimer();
  if(restEndsAt !== null) finishRest();
  const exercises = sess.items
    .map(it => ({
      exerciseId: it.exerciseId,
      note: (it.note || '').trim() || null,
      sets: it.sets.map(s => {
        const o = {
          weight: s.weight ?? null, reps: s.reps ?? null,
          duration: s.duration ?? null, rpe: s.rpe ?? null,
          side: s.side ?? null, restAfter: s.restAfter ?? null,
          done: s.done === true
        };
        if(s.isPR === true) o.isPR = true;   // 只在真的破纪录时写，普通组不增加体积
        if(s.type === 'warmup') o.type = 'warmup';   // 只有热身组需要标记：「上次」/PR 不能把热身组算进去（旧日志无此字段，按普通组处理）
        return o;
      })
    }))
    .filter(it => it.sets.some(isDone));
  if(!exercises.length){ toast('还没有确认任何一组'); return; }

  const endedAt = Date.now();
  // 从历史「改一下」的记录：日期与时间戳保持原样——改数值不改变它发生在哪一天
  const km = sess.keepMeta;
  const entry = km ? {
    date: km.date, day,
    startedAt: km.startedAt ?? sess.startedAt,
    endedAt: km.endedAt ?? endedAt,
    durationSec: km.durationSec ?? Math.round((endedAt - sess.startedAt) / 1000),
    condition: sess.condition ?? null,
    exercises
  } : {
    date: localDateStr(endedAt),   // 本地日期：跨零点训练记在结束那天，不会跑到昨天
    day,
    startedAt: sess.startedAt,
    endedAt,
    durationSec: Math.round((endedAt - sess.startedAt) / 1000),
    condition: sess.condition ?? null,
    exercises
  };
  // 「改一下 → 放弃 → 撤销 → 再结束」：原记录可能还留在日志里，先摘掉避免同一时间戳写两条
  const dup = state.logs.findIndex(l => (l.startedAt ?? -1) === (entry.startedAt ?? -2));
  if(dup >= 0) state.logs.splice(dup, 1);
  insertLog(entry);
  lastEnded = { day, entry, items: sess.items, startedAt: sess.startedAt, condition: sess.condition ?? null };
  state.sessions[day] = null;
  // 「改一下」会把原状态放回 condDraft 用于显示；结束之后必须清掉，
  // 否则空着的今日卡还挂着旧状态，下次开练第一组也会把旧状态抄进新记录
  condDraft[day] = null;
  if(!km) delete draft[day];   // 「改一下」结束的是旧记录：当日草稿不是它的，留着别清掉
  resetRest();
  flushSave();
  render();
  showSummary(entry);
}

async function discardSession(){
  const day = curDay();
  if(!state.sessions[day]) return;
  const ok = await askConfirm({ title: '放弃本次记录？', desc: '已确认的组数将丢失。放弃后 6 秒内可以撤销。', okLabel: '放弃' });
  if(!ok) return;
  /* 误触「放弃」不该直接丢数据：和删除历史同一口径，快照后 6 秒内在提示条里可撤销 */
  const snap = { day, session: state.sessions[day], cond: condDraft[day] };
  /* 放弃的是「改一下」的旧记录：原记录原样放回日志，编辑失败不该等于删掉数据 */
  const orig = snap.session.originalEntry;
  if(orig && !state.logs.some(l => (l.startedAt ?? -1) === (orig.startedAt ?? -2))) insertLog(orig);
  state.sessions[day] = null;
  // 「改一下」的旧记录被放弃：当日草稿属于今天的新训练，不是这条旧记录的，别清掉（与 endSession 同一口径）
  if(!orig) delete draft[day];
  condDraft[day] = null;
  curPos = 0;
  state.ui.curPos[day] = 0;   // 放弃后回到第一组，别把旧位置留着
  /* 只清归属这一日的休息/秒表：另一日正在跑的计时不属于这次放弃（与 applyPlan 同一口径） */
  if(restForDay === day) resetRest();
  if(timerFor && timerForDay === day) clearTimer();
  flushSave();
  render();
  toast('已放弃', () => {
    if(state.sessions[snap.day]){ toast('这一日已经有新的记录了'); return; }
    state.sessions[snap.day] = snap.session;
    condDraft[snap.day] = snap.cond;
    flushSave();
    render();
  });
}

function showSummary(entry){
  const vol = Math.round(sessionVolume(entry));
  /* 本次会话破掉的 PR 组数（isPR 只在确认/改数字时按全历史严格比较写入） */
  const prs = entry.exercises.reduce((n, ex) => n + (ex.sets || []).filter(s => s.isPR === true).length, 0);
  const avgRest = sessionAvgRest(entry);
  $('summary-title').textContent = `${entry.day} 日训练完成`;
  $('summary-body').innerHTML = `
    <div class="stat">动作 <b>${entry.exercises.length}</b> 个</div>
    <div class="stat">总组数 <b>${sessionSets(entry)}</b> 组</div>
    <div class="stat">总容量 <b>${vol.toLocaleString()} kg</b></div>
    <div class="stat">用时 <b>${fmtDuration(entry.durationSec)}</b></div>
    ${avgRest !== null ? `<div class="stat">平均休息 <b>${fmtDuration(avgRest)}</b></div>` : ''}
    ${prs ? `<div class="stat">破 PR <b>${prs}</b> 组 🔥</div>` : ''}
    ${entry.condition ? `<div class="stat">状态 <b>${esc(entry.condition)}</b></div>` : ''}`;
  // 记错了不必重来：只要这条记录还在最末尾，就把它放回编辑态
  const re = $('summary-reedit');
  if(re) re.style.display = lastEnded ? '' : 'none';
  $('summary-overlay').classList.add('show');
  setBackdropInert(true);
}
function closeSummary(){
  lastEnded = null;
  const re = $('summary-reedit');
  if(re) re.style.display = 'none';
  $('summary-overlay').classList.remove('show');
  setBackdropInert(false);
}

/* 把刚结束的那次记录放回「进行中」，改完再点结束 */
function reeditSession(){
  if(!lastEnded){ closeSummary(); return; }
  const { day, entry, items, startedAt, condition } = lastEnded;
  if(state.sessions[day]){ toast('这一日已经有新的记录了'); closeSummary(); return; }
  const at = state.logs.indexOf(entry);
  if(at >= 0) state.logs.splice(at, 1);
  resetRest();    // 小结开着的时候休息到点了会响铃：放回编辑态不该还挂着那条铃
  state.sessions[day] = { startedAt, items, condition, originalEntry: entry,
    // 改数值不改变它发生在哪一天、实际练了多久：时间戳沿用原记录（与历史「改一下」同一口径），
    // 否则光是打开编辑多想几分钟，历史里的「用时」就会被凭空拉长
    keepMeta: { date: entry.date, startedAt: entry.startedAt, endedAt: entry.endedAt, durationSec: entry.durationSec } };
  condDraft[day] = condition;
  lastEnded = null;
  closeSummary();
  switchView('today');
  switchDay(day);
  flushSave();
  toast('已放回编辑，改完再点结束');
}

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
let restForDay = null;  // 触发休息的日：换日后结算也要写回原来那一日的 items

function startRestTimer(atPos){
  // 热身组用更短的休息时长（拉伸等动作本身有时长，计时器照常走完即可）
  const at = atPos || flatPos(curDay())[curPos];
  const set = at ? getItems(curDay())[at.exIdx]?.sets[at.setIdx] : null;
  const sec = set && set.type === 'warmup' ? state.settings.warmupRestSec : state.settings.restSec;
  if(!(sec > 0)) return;
  restStartsAt = Date.now();
  restEndsAt = restStartsAt + sec * 1000;
  restDone = false;
  // 触发休息的组：优先用调用方传入的位置，避免渲染后 curPos 已移动导致归属错位
  restForPos = atPos || flatPos(curDay())[curPos] || null;
  restForDay = curDay();
  state.rest = { startsAt: restStartsAt, endsAt: restEndsAt, day: restForDay,
    exIdx: restForPos ? restForPos.exIdx : null, setIdx: restForPos ? restForPos.setIdx : null };
  saveSoon();
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
    // 手机在口袋里或静音时，震动比 880Hz 更容易被注意到
    if(navigator.vibrate) navigator.vibrate([180, 80, 180]);
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
/* 记录休息时长并清除计时器。归属日在 startRestTimer 时记下：
 * 结算发生在换日/结束之后时 curDay() 已经指向别的日，写错地方不如不写。 */
function finishRest(){
  if(restStartsAt !== null && restForPos){
    const elapsed = Math.round((Date.now() - restStartsAt) / 1000);
    const day = restForDay || curDay();
    const items = state.sessions[day] ? state.sessions[day].items
      : (draft[day] && draft[day].length ? draft[day] : null);
    const item = items && items[restForPos.exIdx];
    if(item && item.sets[restForPos.setIdx]) item.sets[restForPos.setIdx].restAfter = elapsed;
  }
  restEndsAt = null; restStartsAt = null; restDone = false; restForPos = null; restForDay = null;
  state.rest = null;
  if(restTimer){ clearInterval(restTimer); restTimer = null; }
}
function skipRest(){
  // 休息条「跳过」：结束休息计时，并前进到下一组——无论用户此前是否手动切过组，
  // 按下跳过的意图就是「我现在开始下一组」
  finishRest();
  nextPos(curDay());
  saveSoon();
  renderToday();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function resetRest(){
  restEndsAt = null; restStartsAt = null; restDone = false; restForPos = null; restForDay = null;
  state.rest = null;
  if(restTimer){ clearInterval(restTimer); restTimer = null; }
}
function restTotalSec(){ return restEndsAt === null ? 0 : Math.round((restEndsAt - restStartsAt) / 1000); }

/* iOS/Safari：AudioContext 必须在用户手势里创建或恢复，否则之后在定时器回调里
 * 调用 resume() 无效——休息结束提示音会永远静音。第一次点训练卡片任意按钮时解锁。 */
function unlockAudio(){
  try{
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if(!Ctx) return;
    const ctx = beep._ctx || (beep._ctx = new Ctx());
    if(ctx.state === 'suspended') ctx.resume();
  }catch(e){}
}

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

/* ---------------- 计时动作的秒表 ----------------
 * A 日有 9 个计时动作（平板、各类拉伸、呼吸），原来要自己看表、再打字填秒数。
 * 按时间戳计算，切后台回来也不会少算；确认这一组时会自动停表填入。 */
let timerFor = null;         // {exIdx, setIdx} 正在计时的组
let timerForDay = null;      // 正在计时的日：导入方案换日后停表也要写回原来那一日的组
let timerStartsAt = null;
let timerTicker = null;
function timerElapsedSec(){ return timerStartsAt === null ? 0 : Math.round((Date.now() - timerStartsAt) / 1000); }
function timerInputEl(){
  if(!timerFor || curDay() !== timerForDay) return null;   // 显示中的卡片不是计时归属日：别把秒数打进别人家
  return document.querySelector('#ex-list .fs-input[data-ex="' + timerFor.exIdx + '"][data-set="' + timerFor.setIdx + '"][data-f="duration"]');
}
function stopTimerTicker(){ if(timerTicker){ clearInterval(timerTicker); timerTicker = null; } }
function startTimer(exIdx, setIdx){
  timerFor = { exIdx, setIdx };
  timerForDay = curDay();
  timerStartsAt = Date.now();
  state.timer = { day: timerForDay, exIdx, setIdx, startsAt: timerStartsAt };
  saveSoon();
  stopTimerTicker();
  timerTicker = setInterval(() => { const el = timerInputEl(); if(el) el.value = timerElapsedSec(); }, 250);
}
/* 停表并把经过的秒数写进这一组；没有在计时则什么都不做 */
function stopTimer(){
  stopTimerTicker();
  state.timer = null;
  if(!timerFor) return null;
  // 归属日优先：正在看别的日时停表，秒数要回到它真正发生的那一日
  const at = timerFor, home = timerForDay || curDay(), elapsed = timerElapsedSec();
  timerFor = null; timerForDay = null; timerStartsAt = null;
  const items = state.sessions[home] ? state.sessions[home].items
    : (draft[home] && draft[home].length ? draft[home] : null);
  const set = items && items[at.exIdx] && items[at.exIdx].sets[at.setIdx];
  if(set){ set.duration = elapsed; refreshPR(home, at.exIdx, at.setIdx); }
  saveSoon();
  return { at, elapsed };
}
/* 放弃/结束/换日：丢掉秒表，不写进任何组 */
function clearTimer(){ stopTimerTicker(); timerFor = null; timerForDay = null; timerStartsAt = null; state.timer = null; }

/* 刷新/浏览器杀进程后接上：休息与秒表都是时间戳，经过的秒数不会少算。
 * 归属日必须还有进行中记录或草稿，否则持久化的副本属于已结束的会话——丢弃。 */
function resumeTimers(){
  const r = state.rest, t = state.timer;
  resetRest(); clearTimer();
  if(r && (r.day === 'A' || r.day === 'B') && (state.sessions[r.day] || (draft[r.day] && draft[r.day].length))){
    restStartsAt = r.startsAt; restEndsAt = r.endsAt; restForDay = r.day;
    restForPos = (Number.isFinite(r.exIdx) && Number.isFinite(r.setIdx)) ? { exIdx: r.exIdx, setIdx: r.setIdx } : null;
    restDone = Date.now() >= restEndsAt;   // 离开期间已经到点：回来不补响铃，直接显示超时
    state.rest = r;                        // 接上了就要重新可持久化：否则第二次刷新会把它丢掉
    startRestTick();
  } else if(r) state.rest = null;
  if(t && (t.day === 'A' || t.day === 'B') && (state.sessions[t.day] || (draft[t.day] && draft[t.day].length))){
    // 秒表和休息同一口径：还没确认任何一组的草稿日也接得上（计时动作先按表后确认是常态）
    timerFor = { exIdx: t.exIdx, setIdx: t.setIdx };
    timerForDay = t.day;
    timerStartsAt = t.startsAt;
    state.timer = t;                      // 同上：接上后保持可持久化
    timerTicker = setInterval(() => { const el = timerInputEl(); if(el) el.value = timerElapsedSec(); }, 250);
  } else if(t) state.timer = null;
}

/* ---------------- 历史 & 导出 ---------------- */
/* 趋势折线图：按指标分组（kg / 秒 / 次 不能共用一条 Y 轴），X=该动作被记录的次数，Y=最好一组的主指标 */
const TREND_COLORS = ['#4f8cff', '#3fb96f', '#e0a030', '#e05252', '#9b6dff'];
const TREND_KIND_LABEL = { weight: '重量（kg）', duration: '时长（秒）', reps: '次数' };
const TREND_DIR = { up: '↑ 上升', down: '↓ 下降', plateau: '→ 持平', new: '· 新出现' };
const trendMetric = s => s.top.weight != null ? s.top.weight : (s.top.duration != null ? s.top.duration : (s.top.reps || 0));
function trendKind(t){
  /* 与 trendMetric 严格同序（weight 优先）：混合组（既有权重又有残留时长）
   * 若这里先判 duration，会把动作分到「时长」图里却按 kg 画点、图例念 kg——单位和数值打架。 */
  const top = (t.sessions[t.sessions.length - 1] || {}).top || {};
  if(top.weight != null) return 'weight';
  if(top.duration != null) return 'duration';
  return 'reps';
}
/* 单次会话自己的指标类型（与 trendMetric/trendKind 严格同序：weight 先）。
 * 动作改过类型（导入方案改了 time→weight 之类）时，历史里会混着秒和 kg；
 * 折线图只画与当前类型同指标的记录，秒不会被画进重量轴。导出/方向判定不受影响。 */
const sessionKind = s => s.top.weight != null ? 'weight' : (s.top.duration != null ? 'duration' : 'reps');
function trendValText(v, kind){ return kind === 'weight' ? fmtW(v) : String(Math.round(v)); }
function trendUnit(id, kind){
  if(kind !== 'weight') return kind === 'duration' ? '秒' : '次';
  // 与分组标题、历史详情同口径：weight 类动作单位缺失按 kg 念，别出现「标题 kg、图例没单位」
  return normUnit(id) || 'kg';
}
/* 单位归一：大小写/空格不敏感（AI 方案可能写 "LB"）——与 itemsVolume 同口径 */
function normUnit(id){
  return String((state.exercises[id] || {}).unit || '').trim().toLowerCase();
}
/* 单位混用的重量组：lb 先换算成 kg 再上同一条 Y 轴（与容量汇总同一口径）。
 * 单位一致的组保持原单位绘制，不换算。conv 只在混用组里为 true。 */
function trendConvFactor(id, conv){
  return conv && normUnit(id) === 'lb' ? LB_TO_KG : 1;
}
/* 动作在计划里出现的先后顺序：用来稳定选线（练得一样多的时候按训练顺序排） */
function programOrder(){
  const order = {};
  ['A', 'B'].forEach(day => (state.program[day] || []).forEach(p => {
    if(!(p.exerciseId in order)) order[p.exerciseId] = Object.keys(order).length;
  }));
  return order;
}
function trendChartSVG(entries, kind, label, conv){
  const W = 320, H = 120, PAD = { t: 14, r: 10, b: 20, l: 34 };
  const pw = W - PAD.l - PAD.r, ph = H - PAD.t - PAD.b;
  const allPts = [];
  const val = (id, s) => trendMetric(s) * trendConvFactor(id, conv);
  entries.forEach(([id, t]) => t.sessions.forEach(s => allPts.push(val(id, s))));
  const lo = Math.min(...allPts), hi = Math.max(...allPts);
  const yMin = kind === 'reps' ? Math.max(0, lo - 1) : lo * 0.9;
  const yMax = (hi * 1.06) || 1;
  const yRange = (yMax - yMin) || 1;
  const maxLen = Math.max(...entries.map(([, t]) => t.sessions.length));
  const xStep = maxLen > 1 ? pw / (maxLen - 1) : pw;
  const yScale = v => PAD.t + ph - ((v - yMin) / yRange) * ph;
  const xAt = i => PAD.l + i * xStep;
  // 三条水平网格线 + 左侧刻度（读得出“这条线大概是多少”）
  let grid = '';
  [yMin, (yMin + yMax) / 2, yMax].forEach(v => {
    const y = yScale(v).toFixed(1);
    grid += `<line x1="${PAD.l}" y1="${y}" x2="${W - PAD.r}" y2="${y}" stroke="rgba(139,147,163,.18)" stroke-width="1"/>
      <text x="${PAD.l - 5}" y="${(+y + 3).toFixed(1)}" font-size="9" fill="#8b93a3" text-anchor="end">${trendValText(v, kind)}</text>`;
  });
  // X 轴说明：横轴是每个动作各自被记录的次数，不是同一天的刻度，所以只标两端含义
  const axis = `<text x="${PAD.l}" y="${H - 6}" font-size="9" fill="#8b93a3">最早</text>
    <text x="${W - PAD.r}" y="${H - 6}" font-size="9" fill="#8b93a3" text-anchor="end">最近</text>`;
  const lines = entries.map(([id, t], li) => {
    const c = TREND_COLORS[li % TREND_COLORS.length];
    const pts = t.sessions.map((s, i) => `${xAt(i).toFixed(1)},${yScale(val(id, s)).toFixed(1)}`).join(' ');
    const last = t.sessions[t.sessions.length - 1];
    return `<polyline points="${pts}" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round"/>
      <circle cx="${xAt(t.sessions.length - 1).toFixed(1)}" cy="${yScale(val(id, last)).toFixed(1)}" r="2.5" fill="${c}"/>`;
  }).join('');
  return `<div class="trend-chart"><svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${label || TREND_KIND_LABEL[kind]}趋势图">${grid}${axis}${lines}</svg></div>`;
}
function trendLegend(entries, conv){
  return '<div class="trend-legend">' + entries.map(([id, t], li) => {
    const last = t.sessions[t.sessions.length - 1];
    const name = (state.exercises[id] || {}).name || id;
    const dir = TREND_DIR[t.direction] || TREND_DIR.new;
    const kind = trendKind(t);
    const v = trendMetric(last) * trendConvFactor(id, conv);
    const u = conv ? 'kg' : trendUnit(id, kind);
    return `<div class="lg-row"><span class="lg-swatch" style="background:${TREND_COLORS[li % TREND_COLORS.length]}"></span>`
      + `<span class="lg-name">${esc(name)}</span>`
      + `<b class="lg-val">${trendValText(v, kind)} ${esc(u)}</b>`
      + `<span class="lg-dir ${esc(t.direction || 'new')}">${dir} · ${t.sessions.length} 次</span></div>`;
  }).join('') + '</div>';
}
function buildTrendCharts(trends, maxLines){
  /* 先按「当前类型」过滤掉改类型之前的旧指标记录（秒画进重量轴会画出假飙升），
   * 过滤后不足 2 点的线不画（单点没有趋势可言）。 */
  const usable = Object.entries(trends).map(([id, t]) => {
    const sessions = t.sessions.filter(s => sessionKind(s) === trendKind(t));
    return sessions.length >= 2 ? [id, { ...t, sessions }] : null;
  }).filter(Boolean);
  if(!usable.length){
    return '<div class="trend-empty">趋势要同一个动作至少记录 2 次。<br>再练两次，这里就会出现折线。</div>';
  }
  const order = programOrder();
  const groups = {};
  usable.forEach(([id, t]) => {
    const k = trendKind(t);
    (groups[k] = groups[k] || []).push([id, t]);
  });
  return Object.keys(groups).map(kind => {
    const list = groups[kind]
      .sort((a, b) => (b[1].sessions.length - a[1].sessions.length) || ((order[a[0]] ?? 999) - (order[b[0]] ?? 999)))
      .slice(0, maxLines || 5);
    /* 组标题的单位：同组动作单位一致才写（lb 组不再念成 kg）；
     * 单位混用时全部换算成 kg 再画（30lb≈13.6kg 与 80kg 放同一条轴才可比），标题写 kg。 */
    let title = TREND_KIND_LABEL[kind], conv = false;
    if(kind === 'weight'){
      const us = new Set(list.map(([id]) => normUnit(id) || 'kg'));
      const u = [...us];
      if(u.length > 1){ conv = true; title = '重量（kg）'; }
      else title = u[0] ? `重量（${esc(u[0])}）` : '重量';
    }
    return `<div class="trend-block"><div class="trend-title">${title}</div>`
      + trendChartSVG(list, kind, title, conv) + trendLegend(list, conv) + '</div>';
  }).join('');
}
function renderHistory(){
  const list = $('hist-list');
  if(!state.logs.length){
    list.innerHTML = '<div class="empty-hint">还没有训练记录。<br>完成一次训练后会自动出现在这里。</div>';
    return;
  }
  const trendSVG = buildTrendCharts(buildTrends(state.logs.slice(-TREND_WINDOW)), 5);
  list.innerHTML = trendSVG + state.logs.slice().reverse().map((entry, ri) => {
    const vol = Math.round(sessionVolume(entry));
    const doneSets = sessionSets(entry);
    const totalSets = entry.exercises.reduce((s, ex) => s + ex.sets.length, 0);
    const cond = entry.condition ? ` · 状态${esc(entry.condition)}` : '';
    const detail = entry.exercises.map(ex => {
      const exName = (state.exercises[ex.exerciseId] || {}).name || ex.exerciseId;
      const unit = (state.exercises[ex.exerciseId] || {}).unit || 'kg';
      const sets = ex.sets.filter(isDone).map(s => {
        let base;
        if(s.duration != null) base = s.duration + ' 秒';
        else if(s.weight != null) base = fmtW(s.weight) + unit + '×' + (s.reps ?? '?');
        else base = (s.reps ?? '?') + ' 次';
        // 热身组标出来：历史里「60kg×10，20kg×10」连着看，分不清哪组是正式哪组是热身
        // 单侧动作标「左/右」：保加利亚蹲这类 L/R 两组连着看，分不清哪边做了什么
        const sideTag = (s.side === 'L' || s.side === 'R') ? (s.side === 'L' ? '左' : '右') + '侧 ' : '';
        return sideTag + (s.type === 'warmup' ? '热身 ' : '') + base + (s.rpe ? ` (RPE ${s.rpe})` : '') + (s.isPR ? ' 🔥' : '');
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
        <div class="hist-detail">${detail}<button class="h-edit" data-act="reeditlog" data-ts="${entry.startedAt ?? ''}" data-i="${state.logs.length - 1 - ri}">改一下</button><button class="h-del" data-act="dellog" data-ts="${entry.startedAt ?? ''}" data-i="${state.logs.length - 1 - ri}">删除这次记录</button></div>
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
  if(t.includes('```')){
    /* 按 ``` 切段：奇数下标就是代码块内容，任意语言标签（json/js/text…）剥掉。
     * 多段时取最后一个——分析 prompt 是「中文总结 + JSON 代码块」两段式，
     * 用户整段粘贴（甚至粘了两版方案）时最终方案在最后。
     * 没有代码块就取首个 { 到末个 } 的跨度。 */
    const parts = t.split('```');
    let last = null;
    for(let i = 1; i < parts.length; i += 2){
      last = parts[i].replace(/^[ \t]*[a-zA-Z]*[ \t]*\r?\n?/, '').trim();
    }
    if(last !== null) return last;
  }
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if(a !== -1 && b > a) return t.slice(a, b + 1);
  return t;
}
function validatePlan(d){
  if(!d || typeof d !== 'object' || Array.isArray(d)) return '顶层必须是 JSON 对象';
  if(!d.exercises || typeof d.exercises !== 'object' || Array.isArray(d.exercises)) return '缺少 exercises 字段（对象）';
  if(!d.program || typeof d.program !== 'object' || Array.isArray(d.program)) return '缺少 program 字段（对象）';
  /* exercises 条目：允许只更新部分字段（合并语义），但写了 mode/unit 就得合法——
   * 「body-weight」或数字 unit 会被原样存下，输入界面默默落到重量分支，
   * 历史里出现「607×8」这种没有单位的数字，不如当场拒绝说清楚。
   * unit 只要是字符串就放行（历史数据里有 'LB'，严格枚举会挡住自导出回环）。 */
  for(const [id, ex] of Object.entries(d.exercises)){
    if(!ex || typeof ex !== 'object' || Array.isArray(ex)) return `exercises.${id} 必须是对象`;
    if(ex.mode != null && !['weight','band','bodyweight','time'].includes(ex.mode))
      return `exercises.${id}.mode 必须是 weight / band / bodyweight / time 之一`;
    if(ex.unit != null && typeof ex.unit !== 'string')
      return `exercises.${id}.unit 必须是 kg / lb / null`;
  }
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
/* 有进行中记录的日不能换计划（组数据会对不上） */
function planSessionConflict(d){
  for(const day of ['A','B']){
    if(d.program[day] !== undefined && state.sessions[day])
      return `${day} 日有进行中的记录，请先结束或放弃后再导入`;
  }
  return null;
}
function applyPlan(d){
  const conflict = planSessionConflict(d);
  if(conflict) return { ok:false, error:conflict };
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
    // 秒表还挂在旧草稿上跑：草稿即将被删掉重建，这块表没有可写的归属了，直接丢掉
    // （按表的归属日判断，不是当前查看的日——导入把视图切去另一日时也要清对表）
    if(timerFor && timerForDay === day && !state.sessions[day]) clearTimer();
    // 休息计时同口径：休息是由旧草稿的组触发的，草稿删掉重建后 exIdx/setIdx
    // 指向的是新计划里不相干的组，让它继续倒计时只会把 restAfter 写错地方。
    if(restForDay === day && !state.sessions[day]) resetRest();
    // 草稿会被整体删掉重建。若里面有用户真实产生过的内容（确认过的组、手写备注），
    // 必须在导入结果里说一声，否则换了计划数量后用户回头才发现「刚才填的东西没了」。
    // 只看 done/notes：新建草稿本身带着上次数值的预填，那不是用户输入，丢了不算损失。
    const dr = draft[day];
    const draftDirty = Array.isArray(dr) && dr.some(it =>
      (it.note || '').trim() || (it.sets || []).some(s => s.done === true));
    state.program[day] = d.program[day].map(normalizeItem);
    delete draft[day];
    state.ui.curPos[day] = 0;   // 计划换了，停在第几组可能已经不存在
    if(curDay() === day) curPos = 0;
    daySummary.push(`${day} 日 ${state.program[day].length} 动作${draftDirty ? '（已丢弃未确认草稿）' : ''}`);
  }
  if(typeof d.day === 'string' && (d.day === 'A' || d.day === 'B')) state.settings.lastDay = d.day;
  /* 导入可能把视图切去另一日：模块里的组位置必须跟着当前日走，
   * 不能留着旧日的位置去新日里悬空（该日位置上面已归 0，这里只是把视图对齐）。 */
  curPos = state.ui.curPos[curDay()] || 0;
  openNotes = {};   // 展开的「要点」按位置记忆：计划换了，别把展开状态跟到不相干的动作上
  save();
  render();
  return { ok:true, summary:`导入完成：${daySummary.join('，')}；动作库 ${exCount} 项` };
}
function parsePlanInput(text){
  let t = stripFences(String(text || ''));
  t = t.replace(/,\s*([}\]])/g, '$1'); // 容忍多余尾逗号
  let data;
  try{ data = JSON.parse(t); }
  catch(e){ return { ok:false, error:'JSON 解析失败：' + e.message }; }
  const verr = validatePlan(data);
  if(verr) return { ok:false, error:'校验失败：' + verr };
  return { ok:true, data };
}
function importPlan(text){
  const p = parsePlanInput(text);
  if(!p.ok) return p;
  return applyPlan(p.data);
}
/* 导入前把当前计划存一份（只留一层），导入后能一键换回来 */
function snapshotPlan(){
  state.lastImport = {
    at: Date.now(),
    program: JSON.parse(JSON.stringify(state.program)),
    exercises: JSON.parse(JSON.stringify(state.exercises))
  };
}
function undoImport(){
  const snap = state.lastImport;
  if(!snap){ toast('没有可撤销的导入'); return; }
  // 与 applyPlan 同政策：有进行中记录时不换计划。会话的组是按导入后的计划生成的，
  // 换回旧计划会让分区/编号对不上号，还会白白把进度位置清零。
  for(const day of ['A','B']){
    if(state.sessions[day]){ toast(`${day} 日有进行中的记录，请先结束或放弃后再撤销`); return; }
  }
  // 同 applyPlan：挂在被丢弃草稿上的秒表要先丢掉，否则换回旧计划时会把秒表读数写进不相干的组。
  // 按表的归属日判断（不是当前查看的日）：归属日有进行中记录时表还有可写的地方，不该误清。
  if(timerFor && !state.sessions[timerForDay]) clearTimer();
  state.program = snap.program;
  state.exercises = snap.exercises;
  state.lastImport = null;
  for(const day of ['A','B']){
    if(restForDay === day && !state.sessions[day]) resetRest();   // 同 applyPlan：两日草稿都要查
    delete draft[day];          // 草稿是按刚导入的计划生成的，一起丢掉
    state.ui.curPos[day] = 0;   // 旧位置在新计划里未必存在
    if(curDay() === day) curPos = 0;
  }
  openNotes = {};   // 同 applyPlan：换计划后展开状态不该跟到不相干的动作上
  flushSave();
  render();
  renderSettings();
  toast('已恢复到导入前的方案');
}
function listCut(arr, n){
  n = n || 4;
  return arr.length > n ? arr.slice(0, n).join('、') + `…等 ${arr.length} 项` : arr.join('、');
}
/* 导入前说清「会改什么」：AI 一句话就能换掉整份计划，看不出来就只能事后后悔。
 * 只列增减与目标变化，各列表最多 4 项。 */
function planDiffText(d){
  const oldName = id => (state.exercises[id] && state.exercises[id].name) || id;
  const newName = id => (d.exercises[id] && d.exercises[id].name) || id;
  const lines = [];
  for(const day of ['A','B']){
    if(!Array.isArray(d.program[day])) continue;
    const before = state.program[day] || [];
    const after = d.program[day].map(normalizeItem);
    const bIds = before.map(it => it.exerciseId);
    const aIds = after.map(it => it.exerciseId);
    const removed = bIds.filter(id => !aIds.includes(id)).map(oldName);
    const added = aIds.filter(id => !bIds.includes(id)).map(newName);
    const changed = [];
    for(const it of after){
      const old = before.find(x => x.exerciseId === it.exerciseId);
      if(!old) continue;
      const a = targetLabel(it), b = targetLabel(old);
      if(a !== b) changed.push(`${oldName(it.exerciseId)} ${b} → ${a}`);
    }
    let line = `${day} 日 ${before.length} → ${after.length} 个动作`;
    const parts = [];
    if(removed.length) parts.push('移除 ' + listCut(removed));
    if(added.length) parts.push('新增 ' + listCut(added));
    if(changed.length) parts.push('目标改为 ' + listCut(changed));
    if(parts.length) line += '：' + parts.join('；');
    lines.push(line);
  }
  lines.push(`动作库共 ${Object.keys(d.exercises || {}).length} 项（已有动作的个人注意不会被覆盖）`);
  lines.push('日志不会改动。');
  return lines.join('\n');
}
/* 导入是替换整份计划：先给差异、确认，再落数据（并留一份可撤销的快照） */
async function doImport(){
  const msg = $('import-msg');
  const p = parsePlanInput($('import-text').value);
  if(!p.ok){
    msg.className = 'import-msg err';
    msg.textContent = p.error;   // textContent：校验错误里的 exerciseId 无需转义
    return;
  }
  const conflict = planSessionConflict(p.data);
  if(conflict){
    msg.className = 'import-msg err';
    msg.textContent = conflict;
    return;
  }
  const ok = await askConfirm({ title: '按这份方案更新计划？', desc: planDiffText(p.data), okLabel: '导入' });
  if(!ok){
    msg.className = 'import-msg';
    msg.textContent = '已取消，没有改动任何数据';
    return;
  }
  snapshotPlan();
  const r = applyPlan(p.data);
  msg.className = 'import-msg ' + (r.ok ? 'ok' : 'err');
  msg.textContent = r.ok ? r.summary : r.error;
  if(r.ok){
    $('import-text').value = '';
    renderSettings();   // 让「撤销上次导入」出现
    toast('已导入新方案', undoImport);
  }
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
/* 趋势里的 top 只留能比较的四个数值：done/restAfter/side 对分析没用，
 * 但会把导出里最大的一块（trends）撑大一倍。 */
function trimSet(s){
  return { weight: s.weight ?? null, reps: s.reps ?? null,
           duration: s.duration ?? null, rpe: s.rpe ?? null };
}
function avgRpe(sets){
  const rs = sets.map(s => s.rpe).filter(v => v != null);
  return rs.length ? round1(rs.reduce((a,b) => a + b, 0) / rs.length) : null;
}
function buildTrends(logs){
  const byEx = {};
  for(const entry of logs){
    for(const ex of entry.exercises){
      // 趋势只统计正式组：热身组的重量/RPE 天然偏低，混进来会把「最好一组」和平均强度拉歪，
      // AI 拿到的 sets 数也会虚高（与 lastValues/detectPR 的口径一致；旧日志无 type 字段，按正式组处理）
      const doneSets = ex.sets.filter(s => isDone(s) && s.type !== 'warmup');
      if(!doneSets.length) continue;
      // 容量与界面聚合同一口径：lb 动作先换算成 kg，不然 35lb 的绳看着比 11kg 的壶铃负荷大
      const volUnit = String((state.exercises[ex.exerciseId] || {}).unit || '').trim().toLowerCase();
      const volFactor = volUnit === 'lb' ? LB_TO_KG : 1;
      (byEx[ex.exerciseId] = byEx[ex.exerciseId] || []).push({
        date: entry.date,
        day: entry.day,
        top: trimSet(topSet(doneSets)),
        avgRpe: avgRpe(doneSets),
        volume: Math.round(doneSets.reduce((s,st) => s + (st.weight||0) * volFactor * (st.reps||0), 0)),
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
  // 空数组的日（用户手动清空过）不写进导出：导入规则本来就拒绝空数组日，
  // 写出去反而让用户粘回自己的导出时被拒。不写 = 导入不动那个日，语义一致。
  const program = {};
  for(const day of ['A','B']) if(Array.isArray(state.program[day]) && state.program[day].length) program[day] = state.program[day];
  return {
    type: 'ironlog-export',
    version: 1,
    generatedAt: localDateStr(Date.now()),
    settings: { weightStep: state.settings.weightStep, restSec: state.settings.restSec, restNote: state.settings.restNote || '', warmupRestSec: state.settings.warmupRestSec },
    program,
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
    // 回退复制的是 textarea 的内容：先保证它就是我们要复制的 t（clearAll 调用点不经过导出页）
    if(ta.value !== t) ta.value = t;
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
      "mode": "weight",
      "unit": "kg",
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
        "exerciseId": "exercise_id",
        "sets": [
          { "type": "warmup", "weight": 5, "reps": 10, "duration": null, "rpe": null, "side": null },
          { "type": "work", "weight": 12.5, "reps": 8, "duration": null, "rpe": 8, "rpeLabel": "目标 RPE 的文字说明（可省略；原计划有内容请保留）", "side": null }
        ]
      }
    ]
  }
}
字段规则：
- exercises 条目可以只写部分字段（会与现有内容合并）；mode 只能是 weight / band / bodyweight / time 之一，unit 只能是 kg / lb 或 null
- sets 的 weight/reps/duration/rpe 为数字或 null：weight/band 模式填 weight+reps，bodyweight 填 reps，time 填 duration；rpe 为目标 RPE；side 仅单侧动作填 L/R，否则 null
- 如果想表达次数区间（如 8-12），在 item 层（sets 之外）加 "reps": "8-12"，它会显示为目标「N 组 × 8-12」；sets 内的 reps 仍是数字目标
- exerciseId 必须存在于 exercises；program 只写需要更新的日（不更新的日不要写，也不要写空数组）
- program 至少要写一个日：如果你判断无需调整，就把当前某一日的计划原样写回，空的 program 会被拒绝`;

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
${JSON.stringify(data)}
${fence}
数据说明：done=false 的组是计划内未完成（数值可能是上次预填、也可能是用户填了但没点完成的意图，都不当作已验证的实际表现）；type="warmup" 的组是热身组（趋势、最好成绩、PR 都不统计热身）；condition 为当日整体状态（佳/一般/差）；restAfter 是该组之后实际休息的秒数（null 表示未记录，可用于分析恢复节奏）；settings.restNote 是用户对组间休息约束的自我说明（如场地时段限制），分析休息是否合理时要优先考虑；note 是动作级备注（用户手写的实际情况，如代偿、状态、计划外调整）；isPR=true 的组刷新了该动作的历史最好成绩；trends 由已完成组聚合（top 是该次最好一组的 weight/reps/duration/rpe，选组按 最大重量→否则最长时间→否则最多次数），回看最近 ${data.trendsSpan || logs.length} 次（可能多于 recentLogs 条数）；volume 是该次正式组的负荷合计（重量×次数，lb 已统一换算为 kg，可与 kg 动作直接比较）；avgRpe 是已完成组的平均 RPE；direction 是应用基于该动作近史的判定（up/down 要求首尾与后半段同向，否则 plateau，new 为首次出现），不是我的主观评价。program 里 item 层的 repsRange 是我当前计划的次数区间，仅供你了解现状；你输出区间时按下面的格式用 "reps": "8-12"。settings 里的 weightStep/restSec/warmupRestSec 是我的应用操作设置（重量步进按钮的步长、正式组/热身组的组间休息秒数），不是训练数据，仅供你了解我的记录习惯。

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
  const text = withPrompt ? buildPrompt(data) : JSON.stringify(data);
  $('export-text').value = text;
  const msg = $('export-msg');
  return copyText(text).then(ok => {
    const note = data.recentLogs.length
      ? `最近 ${data.recentLogs.length} 次日志 + ${Object.keys(data.trends).length} 个动作趋势，共 ${(text.length / 1000).toFixed(1)}k 字符`
      : '暂无训练日志，仅含当前计划与动作库';
    msg.className = 'import-msg ' + (ok ? 'ok' : 'err');
    msg.textContent = ok
      ? (withPrompt
          ? `已复制（${note}，含分析 prompt）。粘贴给 AI，返回的 JSON 可直接用「导入 AI 方案」导入。`
          : `已复制（${note}）。这是纯数据快照，不含分析要求与输出模板；要拿到可直接导入的 JSON，请用「生成并复制（含 prompt）」。`)
      : `复制失败（${note}）：请手动全选下方文本后复制。`;
  });
}
function doExport(){ return runExport(true); }
function doExportData(){ return runExport(false); }

/* ---------------- 全量备份 / 恢复（换设备的唯一迁移路径） ----------------
 * 「导出给 AI」只含最近 N 次日志，不能当备份用：这里导出的是完整 state，
 * 包括日志、计划、动作库、进行中的记录、草稿、设置与浏览位置。 */
function buildBackup(){
  return {
    type: 'ironlog-backup', version: 1, appVersion: APP_VERSION,
    exportedAt: localDateStr(Date.now()),
    counts: { logs: state.logs.length, exercises: Object.keys(state.exercises).length },
    state: JSON.parse(JSON.stringify(state))
  };
}
function parseBackup(text){
  let d;
  try{ d = JSON.parse(text); }catch(e){ return { ok: false, error: '不是有效 JSON（文件被截断或选错了文件）' }; }
  if(!d || typeof d !== 'object') return { ok: false, error: '空文件' };
  // 也接受直接粘出来的 state（手工编辑过的备份）
  const st = (d.state && d.state.program) ? d.state : d;
  if(st.version !== 1 || !st.program || !st.exercises){
    return { ok: false, error: '缺少 version/program/exercises —— 不像 Iron Log 的备份文件' };
  }
  return { ok: true, state: st };
}
function doBackup(){
  const data = buildBackup();
  const name = 'ironlog-backup-' + data.exportedAt + '.json';
  try{
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }catch(e){ console.warn('Iron Log: 下载备份失败', e); }
  const msg = $('restore-msg');
  msg.className = 'import-msg ok';
  msg.textContent = `已生成 ${name}（${data.counts.logs} 条日志、${data.counts.exercises} 个动作）。换设备时把文件拷过去，再点「从备份文件恢复」。`;
}
function applyRestoredState(st){
  state = migrate(st);
  bindDrafts();                        // draft/condDraft 是指向旧 state 的别名，换 state 必须重新绑定
  curPos = state.ui.curPos[curDay()] || 0;
  openNotes = {};   // 同 applyPlan：全量替换后展开状态属于旧数据
  resetRest();
  clearTimer();   // 备份恢复是全量替换：挂着的秒表属于旧数据，丢掉，不让它的读数写进恢复后的组
  flushSave();
  render();
}
async function restoreBackupText(text){
  const msg = $('restore-msg');
  const r = parseBackup(text);
  if(!r.ok){ msg.className = 'import-msg err'; msg.textContent = '恢复失败：' + r.error; return false; }
  const n = (r.state.logs || []).length;
  const ok = await askConfirm({
    title: '用备份覆盖本机数据？',
    desc: `备份含 ${n} 条日志、${Object.keys(r.state.exercises || {}).length} 个动作。当前数据会被整体替换（不确定的话先点「下载备份文件」存一份现在的）。`,
    okLabel: '覆盖'
  });
  if(!ok){ msg.className = 'import-msg'; msg.textContent = '已取消，没有改动任何数据。'; return false; }
  try{ applyRestoredState(r.state); }
  catch(err){ msg.className = 'import-msg err'; msg.textContent = '恢复失败：备份数据无法应用（' + err + '）'; return false; }
  msg.className = 'import-msg ok';
  msg.textContent = '已恢复：' + n + ' 条日志。';
  return true;
}
function pickBackup(){ $('restore-file').click(); }
$('restore-file').addEventListener('change', async e => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';                 // 清空，允许连续选同一个文件
  if(!f) return;
  let text;
  try{ text = await f.text(); }
  catch(err){ const m = $('restore-msg'); m.className = 'import-msg err'; m.textContent = '读文件失败：' + err; return; }
  await restoreBackupText(text);
});

/* ---------------- 设置（v0.9：备注融合） ---------------- */
function renderSettings(){
  $('weight-step').value = state.settings.weightStep;
  $('rest-sec').value = state.settings.restSec;
  $('warmup-rest-sec').value = state.settings.warmupRestSec;
  $('rest-note').value = state.settings.restNote || '';
  $('profile-bg').value = (state.profile && state.profile.background) || '';
  renderPersonalPicker();
  /* 只有存在快照时才显示「撤销上次导入」（只留最近一次） */
  const undoBtn = $('undo-import');
  if(undoBtn) undoBtn.style.display = state.lastImport ? '' : 'none';
}
/* 设置页「动作个人备注」：编辑 state.exercises[id].personal（卡片上显示，导入计划时保留本地值）。
 * 此前该字段只能靠 AI 计划写入，用户自己没有任何入口能记。 */
let personalExId = '';
function renderPersonalPicker(){
  const sel = $('personal-ex'); if(!sel) return;
  const ids = Object.keys(state.exercises)
    .sort((a, b) => String(state.exercises[a].name || a).localeCompare(String(state.exercises[b].name || b), 'zh'));
  if(!ids.includes(personalExId)) personalExId = ids[0] || '';
  sel.innerHTML = ids.map(id =>
    `<option value="${esc(id)}"${id === personalExId ? ' selected' : ''}>${esc(state.exercises[id].name || id)}</option>`).join('');
  $('personal-note').value = personalExId ? (state.exercises[personalExId].personal || '') : '';
}
$('personal-ex').addEventListener('change', e => { personalExId = e.target.value; renderPersonalPicker(); });
$('personal-note').addEventListener('change', e => {
  if(!personalExId || !state.exercises[personalExId]) return;
  state.exercises[personalExId].personal = e.target.value.trim().slice(0, 500);   // 封顶与动作备注一致：超长文本写爆配额会连累全部持久化
  e.target.value = state.exercises[personalExId].personal;
  save();
  toast(state.exercises[personalExId].personal ? '个人备注已保存' : '个人备注已清除');
});
$('weight-step').addEventListener('change', e => {
  const v = parseFloat(e.target.value);
  /* 精度用 round2 与重量输入一致：1.25 是现实里最常见的微片档，
   * round1 会把它改成 1.3，步进从此永远加不出 1.25。 */
  state.settings.weightStep = (isNaN(v) || v < 0.5) ? 2.5 : Math.min(100, round2(v));
  e.target.value = state.settings.weightStep;   // 非法输入被纠正后要把纠正结果写回输入框，否则显示 0.2 实际用 2.5
  save();
  toast('重量步进：' + state.settings.weightStep);   // 步进是数字，按各动作自己的单位生效，不写死 kg
});
$('rest-sec').addEventListener('change', e => {
  const v = Math.round(parseFloat(e.target.value));
  state.settings.restSec = (isNaN(v) || v < 0) ? 90 : Math.min(1800, v);
  e.target.value = state.settings.restSec;
  flushSave();
  toast(state.settings.restSec > 0 ? `正式组间休息：${state.settings.restSec} 秒` : '正式组间休息已关闭');
});
$('warmup-rest-sec').addEventListener('change', e => {
  const v = Math.round(parseFloat(e.target.value));
  state.settings.warmupRestSec = (isNaN(v) || v < 0) ? 30 : Math.min(1800, v);
  e.target.value = state.settings.warmupRestSec;
  flushSave();
  toast(state.settings.warmupRestSec > 0 ? `热身组间休息：${state.settings.warmupRestSec} 秒` : '热身组间休息已关闭');
});
$('rest-note').addEventListener('change', e => {
  // 自由文本：给 AI 的休息约束说明（时段限制之类），随导出的 settings 一起走
  state.settings.restNote = e.target.value.trim().slice(0, 200);
  e.target.value = state.settings.restNote;
  save();
  toast(state.settings.restNote ? '休息说明已保存' : '休息说明已清除');
});
$('profile-bg').addEventListener('change', e => {
  state.profile.background = e.target.value.slice(0, 2000);   // 背景是最长的自由文本，封顶防配额写爆
  save();
  toast('训练备注已保存');
});

async function clearAll(){
  const ok1 = await askConfirm({ title: '清除全部数据？', desc: '日志、计划、动作库、进行中的记录都会删除。', okLabel: '继续' });
  if(!ok1) return;
  // 先把底留了，再做最后确认：确认文案就能如实说清有没有留成（复制失败后 toast 会被 reload 吞掉）
  let copied = false;
  try { copied = await copyText(JSON.stringify(buildBackup())); } catch(e){}
  const ok2 = await askConfirm({ title: '再次确认', desc: copied
    ? '此操作不可恢复。备份已复制到剪贴板，可先粘贴到别处留底。'
    : '此操作不可恢复。剪贴板不可用，这次留不了底。', okLabel: '全部清除' });
  if(!ok2) return;
  clearingAll = true;
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

/* 首屏：先接上刷新前挂着的休息/秒表（时间戳连续），再渲染 */
resumeTimers();
render();
renderSettings();

/* PWA：注册 service worker（file:// 下跳过；SW 内部失败不影响页面） */
if('serviceWorker' in navigator && location.protocol.startsWith('http')){
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
