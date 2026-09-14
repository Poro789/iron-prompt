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
const APP_VERSION = '0.6.0';   // 唯一版本源：页头徽章与「关于」卡片都从这里渲染；CI 会用它给 sw.js 打缓存版本戳
const TREND_WINDOW = 12;       // 趋势计算回看的训练次数（导出原始日志仍只带用户选的 N 次）

/* ---------------- 占位种子数据（导入 AI 方案后替换；旧格式由 migrate 归一化） ---------------- */
const SEED = {
  version: 1,
  settings: { lastDay: 'A', weightStep: 2.5, restSec: 90, restNote: '' },
  profile: { background: '体态问题：X 型腿、肋骨外扩\n目标：增肌 + 改善体态\n（请补充：身高体重、训练水平、器械范围与上限）' },
  program: {
    A: [
      { exerciseId: 'bench',   sets: 4, reps: '6-8'   },
      { exerciseId: 'ohp',     sets: 3, reps: '8-10'  },
      { exerciseId: 'lateral', sets: 3, reps: '12-15' },
      { exerciseId: 'squat',   sets: 4, reps: '5-8'   },
      { exerciseId: 'legcurl', sets: 3, reps: '10-12' }
    ],
    B: [
      { exerciseId: 'deadlift', sets: 3, reps: '3-5'   },
      { exerciseId: 'row',      sets: 4, reps: '8-10'  },
      { exerciseId: 'pullup',   sets: 3, reps: '6-10'  },
      { exerciseId: 'rdl',      sets: 3, reps: '8-10'  },
      { exerciseId: 'curl',     sets: 3, reps: '10-12' }
    ]
  },
  exercises: {
    bench:   { name:'杠铃卧推',   muscles:'胸 / 三头 / 前束',
               tips:'肩胛后收下沉、双脚踩实；杠触下胸，肘与躯干约 45°',
               pitfalls:'弹胸、肘外展 90°、挺髋', tempo:'离心 2s · 停 1s · 向心 1s',
               alternatives:'哑铃卧推', personal:'' },
    ohp:     { name:'站姿杠铃推举', muscles:'肩 / 三头',
               tips:'核心与臀收紧，微收臀；杠铃在面部正上方锁定',
               pitfalls:'腰椎过度反弓、后仰借力、杠铃前移', tempo:'离心 2s · 向心 1s',
               alternatives:'坐姿哑铃推举', personal:'' },
    lateral: { name:'哑铃侧平举', muscles:'中束',
               tips:'肘部引领、身体微前倾，举至肩高即停',
               pitfalls:'甩动借力、耸肩、举过肩高', tempo:'离心 1s · 向心 1s',
               alternatives:'绳索侧平举', personal:'' },
    squat:   { name:'杠铃深蹲',   muscles:'股四 / 臀 / 核心',
               tips:'下蹲前憋气收紧核心，髋膝同动，膝跟脚尖方向一致，脚跟不离地',
               pitfalls:'脚跟抬起、过度前倾、深度不足', tempo:'离心 3s · 停 1s · 向心 1s',
               alternatives:'前蹲 / 哈克深蹲', personal:'' },
    legcurl: { name:'仰卧腿弯举', muscles:'腘绳肌',
               tips:'髋部贴实垫面，脚跟启动，底部完全伸展但不锁死膝',
               pitfalls:'甩髋、半程动作', tempo:'离心 2s · 向心 1s',
               alternatives:'坐姿腿弯举', personal:'' },
    deadlift:{ name:'杠铃硬拉',   muscles:'后链 / 全身',
               tips:'杠贴小腿，推地而非拉，全程背中立，髋部锁定收尾',
               pitfalls:'圆背、手臂先拉、躯干过度前倾', tempo:'向心 1s · 无停顿',
               alternatives:'六角杠硬拉', personal:'' },
    row:     { name:'杠铃划船',   muscles:'上背 / 二头',
               tips:'髋铰链至约 45°，杠拉至下肋，肘部引领',
               pitfalls:'甩动借力、耸肩、半程', tempo:'离心 2s · 向心 1s',
               alternatives:'T 杠划船 / 单臂哑铃划船', personal:'' },
    pullup:  { name:'引体向上',   muscles:'背阔 / 二头',
               tips:'底部完全悬挂，背阔肌启动，顶部下巴过杠',
               pitfalls:'借力摆动、半程、耸肩代偿', tempo:'离心 2s · 向心 1s',
               alternatives:'高位下拉 / 弹力带辅助引体', personal:'' },
    rdl:     { name:'罗马尼亚硬拉', muscles:'腘绳肌 / 臀',
               tips:'微屈膝、髋部后推，杠贴腿下行至腘绳肌充分拉伸即停',
               pitfalls:'圆背、下探过深、膝锁死', tempo:'离心 3s · 向心 1s',
               alternatives:'直腿硬拉', personal:'' },
    curl:    { name:'杠铃弯举',   muscles:'二头',
               tips:'肘贴体侧、手腕中立，底部完全伸展',
               pitfalls:'甩动借力、屈腕、半程', tempo:'离心 2s · 向心 1s',
               alternatives:'哑铃弯举 / 锤式弯举', personal:'' }
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
const isDone = s => s.done !== false;
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

/* ---------------- 视图切换 ---------------- */
let currentView = 'today';
function switchView(v){
  currentView = v;
  ['today','history','settings'].forEach(x => {
    $('view-' + x).classList.toggle('active', x === v);
    $('tab-' + x).classList.toggle('active', x === v);
    $('tab-' + x).setAttribute('aria-selected', x === v ? 'true' : 'false');
  });
  render();
}

/* ---------------- 今日训练 ---------------- */
let draft = {};    // 内存草稿：未开始（未确认任何一组）前的预填数据，按日分存
let openNotes = {}; // 已展开的"要点/避坑"详情，key = day:exIdx，重渲染后恢复
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
        sets: p.sets.map(spec => ({
          type: spec.type,
          weight: spec.weight ?? lv.weight,
          reps: spec.reps ?? lv.reps,
          duration: spec.duration ?? lv.duration,
          rpe: null,
          side: spec.side ?? null,
          targetRpe: spec.rpe,
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

/* 一组一行：按动作模式渲染（weight/band 双步进，bodyweight 自重+次数，time 时长） */
function setRowHTML(exIdx, setIdx, st, ex){
  const mode = ex.mode || 'weight';
  const d = f => `data-ex="${exIdx}" data-set="${setIdx}" data-f="${f}"`;
  let mid;
  if(mode === 'time'){
    mid = `
      <div class="stepper">
        <button class="step-btn" ${d('duration')} data-act="dec">−</button>
        <input class="set-input" ${d('duration')} inputmode="numeric" value="${st.duration ?? ''}" aria-label="时长">
        <button class="step-btn" ${d('duration')} data-act="inc">＋</button>
        <span class="unit">s</span>
      </div>`;
  }else if(mode === 'bodyweight'){
    mid = `
      <span class="bw-tag">自重</span>
      <div class="stepper">
        <button class="step-btn" ${d('reps')} data-act="dec">−</button>
        <input class="set-input" ${d('reps')} inputmode="numeric" value="${st.reps ?? ''}" aria-label="次数">
        <button class="step-btn" ${d('reps')} data-act="inc">＋</button>
      </div>`;
  }else{
    mid = `
      <div class="stepper">
        <button class="step-btn" ${d('weight')} data-act="dec">−</button>
        <input class="set-input" ${d('weight')} inputmode="decimal" value="${fmtW(st.weight)}" aria-label="重量">
        <button class="step-btn" ${d('weight')} data-act="inc">＋</button>
      </div>
      <div class="stepper">
        <button class="step-btn" ${d('reps')} data-act="dec">−</button>
        <input class="set-input" ${d('reps')} inputmode="numeric" value="${st.reps ?? ''}" aria-label="次数">
        <button class="step-btn" ${d('reps')} data-act="inc">＋</button>
      </div>`;
  }
  const rpeTarget = st.targetRpe != null ? `<span class="rpe-target">目标 ${esc(st.targetRpe)}</span>` : '';
  return `
    <div class="set-row ${st.done ? 'done' : ''} ${st.type === 'warmup' ? 'warmup' : ''} ${mode}">
      <div class="set-idx">${setIdx + 1}</div>
      ${mid}
      <button class="confirm-btn" data-ex="${exIdx}" data-set="${setIdx}" data-act="confirm"
              aria-label="确认这组" aria-pressed="${st.done ? 'true' : 'false'}">${st.done ? '✓' : '○'}</button>
    </div>
    <div class="rpe-row">
      <span class="rpe-label">RPE</span>
      <button class="rpe-btn" ${d('rpe')} data-act="dec">−</button>
      <span class="rpe-val">${st.rpe ?? '–'}</span>
      <button class="rpe-btn" ${d('rpe')} data-act="inc">＋</button>
      ${rpeTarget}
    </div>`;
}

function renderToday(){
  const day = curDay();
  $('day-btn-A').classList.toggle('active', day === 'A');
  $('day-btn-B').classList.toggle('active', day === 'B');
  $('day-btn-A').classList.toggle('running', !!state.sessions.A);
  $('day-btn-B').classList.toggle('running', !!state.sessions.B);
  $('day-btn-A').setAttribute('aria-pressed', day === 'A' ? 'true' : 'false');
  $('day-btn-B').setAttribute('aria-pressed', day === 'B' ? 'true' : 'false');

  const sess = state.sessions[day];
  const status = $('session-status');
  const condVal = sess ? sess.condition : condDraft[day];
  const condBtn = `<button class="cond-btn" onclick="cycleCondition('${day}')">状态：${esc(COND_LABEL[condVal] || '–')}</button>`;
  if(sess){
    status.innerHTML = `<span class="live"></span><span>进行中</span><span class="clock" id="session-clock">${fmtDuration((Date.now() - sess.startedAt)/1000)}</span>${condBtn}`;
  }else{
    status.innerHTML = `<span>未开始 · 确认第一组后自动计时</span>${condBtn}`;
  }

  const list = $('ex-list');
  const program = state.program[day] || [];
  if(!program.length){
    list.innerHTML = '<div class="empty-hint">该日暂无动作，等待导入训练计划。</div>';
  }else{
    const items = getItems(day);
    let lastSection = null;
    list.innerHTML = program.map((p, exIdx) => {
      const ex = state.exercises[p.exerciseId];
      const item = items[exIdx];
      if(!ex || !item) return '';
      let html = '';
      if(p.section && p.section !== lastSection){
        html += `<div class="section-head">${esc(p.section)}</div>`;
        lastSection = p.section;
      }
      const mode = ex.mode || 'weight';
      const unitTag = (mode === 'weight' || mode === 'band') ? ' · ' + esc(ex.unit || 'kg') : '';
      const notes = [
        ex.tips ? `<div class="note"><b>要点</b>${esc(ex.tips)}</div>` : '',
        ex.pitfalls ? `<div class="note"><b>避坑</b>${esc(ex.pitfalls)}</div>` : '',
        ex.tempo ? `<div class="note"><b>节奏</b>${esc(ex.tempo)}</div>` : '',
        ex.alternatives ? `<div class="note"><b>替代</b>${esc(ex.alternatives)}</div>` : '',
        ex.personal ? `<div class="note"><b>个人</b>${esc(ex.personal)}</div>` : ''
      ].join('');
      const sets = item.sets.map((st, setIdx) => setRowHTML(exIdx, setIdx, st, ex)).join('');
      const rowsKey = exIdx + ':' + day + ':' + item.sets.length;
      html += `
        <div class="ex-card">
          <div class="ex-head">
            <div class="ex-name">${esc(ex.name)}<span class="ex-muscle">${esc(ex.muscles || '')}</span></div>
            <div class="ex-target">${esc(targetLabel(item))}${unitTag}</div>
          </div>
          ${notes ? `<details class="ex-notes" data-notes="${exIdx}" ${openNotes[day + ':' + exIdx] ? 'open' : ''}><summary>要点 / 避坑 / 节奏</summary>${notes}</details>` : ''}
          <div class="sets" data-rows="${rowsKey}">${sets}</div>
          <button class="add-set" data-ex="${exIdx}" data-act="addset">＋ 加一组</button>
        </div>`;
      return html;
    }).join('');
    list.querySelectorAll('details[data-notes]').forEach(d => {
      d.addEventListener('toggle', () => { openNotes[day + ':' + d.dataset.notes] = d.open; });
    });
  }

  $('end-btn').style.display = sess ? '' : 'none';
  $('discard-btn').style.display = sess ? '' : 'none';
  startClock();
  renderRestBar();
}

/* 只重建受影响的那一组（保留其余行的输入焦点与键盘），结构性变化才走全量渲染 */
function patchRow(exIdx, setIdx){
  const day = curDay();
  const item = getItems(day)[exIdx];
  if(!item) return false;
  const ex = state.exercises[item.exerciseId];
  if(!ex) return false;
  const rows = document.querySelector(`.sets[data-rows="${exIdx}:${day}:${item.sets.length}"]`);
  if(!rows) return false;
  const nodes = rows.children;
  const target = setIdx * 2;   // 每组 = set-row + rpe-row 两个兄弟节点
  if(nodes.length < target + 2) return false;
  const tmp = document.createElement('div');
  tmp.innerHTML = setRowHTML(exIdx, setIdx, item.sets[setIdx], ex);
  nodes[target].replaceWith(tmp.children[0]);
  nodes[target + 1].replaceWith(tmp.children[1]);
  return true;
}

/* 步进 / 确认 / 加组（事件委托） */
$('ex-list').addEventListener('click', e => {
  const btn = e.target.closest('button[data-act]');
  if(!btn) return;
  const day = curDay();
  const exIdx = +btn.dataset.ex;
  const items = getItems(day);
  const item = items[exIdx];
  if(!item) return;

  if(btn.dataset.act === 'addset'){
    const last = item.sets[item.sets.length - 1];
    item.sets.push({
      type: last ? last.type : 'work',
      weight: last ? last.weight : null,
      reps: last ? last.reps : null,
      duration: last ? last.duration : null,
      rpe: null,
      side: null,
      targetRpe: last ? last.targetRpe : null,
      done: false
    });
    saveSoon(); renderToday();
    return;
  }

  const setIdx = +btn.dataset.set;
  const set = item.sets[setIdx];
  if(!set) return;
  const f = btn.dataset.f, act = btn.dataset.act;

  if(f === 'weight'){
    const ex = state.exercises[item.exerciseId];
    const step = (ex && ex.unit === 'lb') ? 5 : (state.settings.weightStep || 2.5);
    set.weight = act === 'inc'
      ? round1((set.weight || 0) + step)
      : Math.max(0, round1((set.weight || 0) - step));
  }else if(f === 'reps'){
    set.reps = act === 'inc' ? (set.reps || 0) + 1 : Math.max(0, (set.reps || 0) - 1);
  }else if(f === 'duration'){
    set.duration = act === 'inc' ? (set.duration || 0) + 5 : Math.max(0, (set.duration || 0) - 5);
  }else if(f === 'rpe'){
    set.rpe = act === 'inc' ? Math.min(10, round1((set.rpe || 7.5) + 0.5))
                            : Math.max(5,  round1((set.rpe || 8.5) - 0.5));
  }else if(act === 'confirm'){
    set.done = !set.done;
    if(set.done){
      startSessionIfNeeded(day);
      startRestTimer();
    }
  }
  saveSoon();
  if(!patchRow(exIdx, setIdx)) renderToday();
});

/* 直接输入数值（change：失焦或回车时提交） */
$('ex-list').addEventListener('change', e => {
  const inp = e.target.closest('input.set-input');
  if(!inp) return;
  const day = curDay();
  const set = getItems(day)[+inp.dataset.ex]?.sets[+inp.dataset.set];
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
  if(!patchRow(+inp.dataset.ex, +inp.dataset.set)) renderToday();
});

/* 结束训练：写入 logs（P0 闭环的落盘点） */
function endSession(){
  const day = curDay();
  const sess = state.sessions[day];
  if(!sess) return;
  const exercises = sess.items
    .map(it => ({
      exerciseId: it.exerciseId,
      sets: it.sets.map(s => ({
        weight: s.weight ?? null, reps: s.reps ?? null,
        duration: s.duration ?? null, rpe: s.rpe ?? null,
        side: s.side ?? null, done: !!s.done
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

function discardSession(){
  const day = curDay();
  if(!state.sessions[day]) return;
  if(!confirm('放弃本次未结束的记录？已确认的组数将丢失。')) return;
  state.sessions[day] = null;
  delete draft[day];
  condDraft[day] = null;
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

/* ---------------- 组间休息倒计时 ----------------
 * 确认一组后自动启动（取消确认不启动）；结束响一声 + toast。
 * 基于 restEndsAt 时间戳，切后台/休眠后回来仍显示真实剩余。
 * ------------------------------------------------ */
let restEndsAt = null;
let restStartsAt = null;
let restTimer = null;
let restDone = false;

function startRestTimer(){
  const sec = state.settings.restSec;
  if(!(sec > 0)) return;
  restStartsAt = Date.now();
  restEndsAt = restStartsAt + sec * 1000;
  restDone = false;
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
  if(remain <= 0){
    if(!restDone){
      restDone = true;
      renderRestBar();
      beep();
      toast('休息结束，开始下一组');
    }
    return;
  }
  renderRestBar();
}
function renderRestBar(){
  const bar = $('rest-bar');
  if(restEndsAt === null){
    if(restTimer){ clearInterval(restTimer); restTimer = null; }
    bar.style.display = 'none';
    return;
  }
  const total = restEndsAt - restStartsAt;
  const remain = Math.max(0, restEndsAt - Date.now());
  bar.style.display = '';
  bar.classList.toggle('done', remain <= 0);
  $('rest-clock').textContent = fmtDuration(remain / 1000);
  const pct = total > 0 ? (1 - remain / total) * 100 : 100;
  $('rest-fill').style.width = Math.max(0, Math.min(100, pct)) + '%';
}
function adjustRest(delta){
  if(restEndsAt === null) return;
  restEndsAt += delta * 1000;
  if(restEndsAt - restStartsAt < 1000) restStartsAt = restEndsAt - 1000;  // 进度条基准兜底
  restDone = false;
  renderRestBar();
}
function skipRest(){ restEndsAt = null; restStartsAt = null; renderRestBar(); }
function resetRest(){ restEndsAt = null; restStartsAt = null; restDone = false; renderRestBar(); }
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
function renderHistory(){
  const list = $('hist-list');
  if(!state.logs.length){
    list.innerHTML = '<div class="empty-hint">还没有训练记录。<br>完成一次训练后会自动出现在这里。</div>';
    return;
  }
  list.innerHTML = state.logs.slice().reverse().map((entry, ri) => {
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
        return base + (s.rpe ? ` (RPE ${s.rpe})` : '');
      }).join('，');
      return `<div class="h-ex"><b>${esc(exName)}</b>${esc(sets)}</div>`;
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
数据说明：done=false 的组是计划内未完成（数值为上次预填，非实际表现）；condition 为当日整体状态（佳/一般/差）；trends 由已完成组聚合，回看最近 ${data.trendsSpan || logs.length} 次（可能多于 recentLogs 条数）。

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

/* ---------------- 设置 ---------------- */
function renderSettings(){
  $('weight-step').value = state.settings.weightStep;
  $('rest-sec').value = state.settings.restSec;
  $('rest-note').value = state.settings.restNote || '';
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
$('rest-note').addEventListener('change', e => {
  state.settings.restNote = e.target.value.trim();
  save();
  toast('组间休息：' + (state.settings.restNote || '未设置'));
});
$('profile-bg').addEventListener('change', e => {
  state.profile.background = e.target.value;
  save();
  toast('AI 分析背景已保存');
});

function clearAll(){
  if(!confirm('确定清除全部数据？此操作不可恢复。')) return;
  if(!confirm('再次确认：日志、计划、动作库、进行中的记录都会删除。')) return;
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
