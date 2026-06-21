import { sharedStyles, sidebar } from "./layout.js";

/**
 * The dashboard is a single server-rendered HTML shell with embedded CSS + JS.
 * It polls /api/tasks every few seconds and re-renders the charts + table client
 * side. Charts use Chart.js (CDN); the min/avg/max boxplots are hand-drawn SVG.
 */
export function renderDashboardPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Devin Orchestrator</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js"></script>
<style>
${sharedStyles()}
</style>
</head>
<body>
${sidebar("tasks")}

  <main class="main">
    <h1 class="page-title">Tasks</h1>
    <p class="page-sub">Autonomous remediation of labeled GitHub issues via Devin.</p>

    <div class="panels">
      <div class="panel">
        <div class="panel-head"><div class="panel-title">Task Status</div></div>
        <div class="panel-kpi" id="kpi-status"></div>
        <div class="chart-box"><canvas id="chartStatus"></canvas></div>
      </div>

      <div class="panel">
        <div class="panel-head"><div class="panel-title">Success &amp; Failure Rate</div></div>
        <div class="panel-kpi" id="kpi-rate"></div>
        <div class="chart-box"><canvas id="chartRate"></canvas></div>
      </div>

      <div class="panel">
        <div class="panel-head"><div class="panel-title">Throughput &amp; Resource Usage</div></div>
        <div class="panel-kpi" id="kpi-tp"></div>
        <div class="tp-stack">
          <div class="tp-block">
            <div class="box-title">Total ACUs Consumed</div>
            <div class="num" id="tp-total-acus">0</div>
          </div>
          <div class="tp-block box">
            <div class="box-title">ACU Consumption (min · avg · max)</div>
            <div id="box-acu"></div>
          </div>
          <div class="tp-block box">
            <div class="box-title">Elapsed Time (min · avg · max)</div>
            <div id="box-elapsed"></div>
          </div>
        </div>
      </div>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Issue</th><th>Status</th><th>Elapsed</th><th>ACUs</th><th></th></tr>
        </thead>
        <tbody id="rows"><tr><td colspan="5" class="empty">Loading…</td></tr></tbody>
      </table>
    </div>
  </main>

<script>
const DEVIN_SESSION_BASE = "https://app.devin.ai/sessions/";
const GH_ICON = '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"></path></svg>';
const DV_ICON = '<img src="/devin-logo.svg" class="dv-ico" alt="Devin">';
const CHEVRON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
const expanded = new Set();
function toggleRow(id) {
  if (expanded.has(id)) expanded.delete(id); else expanded.add(id);
  renderRows(state.tasks);
}
let state = { metrics: null, tasks: [], charts: null };
let statusChart, rateChart;

const CLR = { active:"#60a5fa", resolved:"#34d399", failed:"#f87171", rejected:"#f0789b", muted:"#8a909c", grid:"rgba(255,255,255,0.06)" };

function fmtDuration(sec) {
  if (sec == null || isNaN(sec) || sec < 0) return "—";
  sec = Math.floor(sec);
  const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60), s = sec%60;
  if (h > 0) return h + "h " + m + "m";
  if (m > 0) return m + "m " + String(s).padStart(2,"0") + "s";
  return s + "s";
}
function elapsedFor(t) {
  const start = t.dispatched_at || t.created_at;
  if (t.status === "queued") return (Date.now() - new Date(t.created_at)) / 1000;
  if (t.status === "running") return (Date.now() - new Date(start)) / 1000;
  const end = t.pr_opened_at || t.updated_at;
  return (new Date(end) - new Date(t.created_at)) / 1000;
}
const STATUS_LABELS = { queued:"Queued", running:"Running", pr_open:"PR Open", done:"Done", failed:"Failed", rejected:"Rejected" };
function statusLabel(s) { return STATUS_LABELS[s] || s.replace("_"," "); }
function escapeHtml(s){return (s||"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
function mmdd(d){ return d.slice(5); }
function pad2(n){ return String(n).padStart(2,"0"); }
// last 7 calendar days (UTC) as YYYY-MM-DD, matching the backend's date_trunc keys
function last7Days() {
  const out=[]; const now=new Date();
  for (let i=6;i>=0;i--){ const d=new Date(now.getTime()-i*86400000); out.push(d.toISOString().slice(0,10)); }
  return out;
}
// last 12 hours (UTC) including current, as YYYY-MM-DDTHH:00 to match backend keys
function last12Hours() {
  const out=[]; const now=new Date(); now.setUTCMinutes(0,0,0);
  for (let i=11;i>=0;i--){ const d=new Date(now.getTime()-i*3600000);
    out.push(d.getUTCFullYear()+"-"+pad2(d.getUTCMonth()+1)+"-"+pad2(d.getUTCDate())+"T"+pad2(d.getUTCHours())+":00"); }
  return out;
}

/* ---- Chart.js setup ---- */
if (window.Chart) {
  Chart.defaults.color = CLR.muted;
  Chart.defaults.borderColor = CLR.grid;
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
}
function ensureCharts() {
  if (!window.Chart || statusChart) return;
  statusChart = new Chart(document.getElementById("chartStatus"), {
    type: "bar",
    data: { labels: [], datasets: [
      { label:"Active", backgroundColor:CLR.active, data:[] },
      { label:"Resolved", backgroundColor:CLR.resolved, data:[] },
      { label:"Failed", backgroundColor:CLR.failed, data:[] },
      { label:"Rejected", backgroundColor:CLR.rejected, data:[] },
    ]},
    options: { responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ position:"bottom", labels:{ boxWidth:10, boxHeight:10, usePointStyle:true } } },
      scales:{ x:{ stacked:true, grid:{ display:false } }, y:{ stacked:true, beginAtZero:true, ticks:{ precision:0 } } } }
  });
  rateChart = new Chart(document.getElementById("chartRate"), {
    type: "line",
    data: { labels: [], datasets: [
      { label:"Success %", borderColor:CLR.resolved, backgroundColor:"rgba(52,211,153,0.12)", tension:0.3, fill:true, pointRadius:3, spanGaps:true, clip:false, data:[] },
      { label:"Failure %", borderColor:CLR.failed, backgroundColor:"rgba(248,113,113,0.10)", tension:0.3, fill:true, pointRadius:3, spanGaps:true, clip:false, data:[] },
    ]},
    options: { responsive:true, maintainAspectRatio:false,
      layout:{ padding:{ top:10 } },
      plugins:{ legend:{ position:"bottom", labels:{ boxWidth:10, boxHeight:10, usePointStyle:true } } },
      scales:{ x:{ grid:{ display:false } }, y:{ beginAtZero:true, max:100, ticks:{ stepSize:20, callback:v=>v+"%" } } } }
  });
}

function updateCharts(c) {
  ensureCharts();
  if (!statusChart) return;
  // stacked bar — always 7 days, missing days -> 0
  const dmap = {}; for (const d of c.daily) dmap[d.day] = d;
  const days = last7Days();
  statusChart.data.labels = days.map(mmdd);
  statusChart.data.datasets[0].data = days.map(d => (dmap[d]||{}).active   || 0);
  statusChart.data.datasets[1].data = days.map(d => (dmap[d]||{}).resolved || 0);
  statusChart.data.datasets[2].data = days.map(d => (dmap[d]||{}).failed   || 0);
  statusChart.data.datasets[3].data = days.map(d => (dmap[d]||{}).rejected || 0);
  statusChart.update("none");
  // line — always 12 hours, missing hours default to 100% success / 0% failure
  const hmap = {}; for (const h of c.hourly) hmap[h.hour] = h;
  const hours = last12Hours();
  rateChart.data.labels = hours.map(k => k.slice(11));
  rateChart.data.datasets[0].data = hours.map(k => { const h=hmap[k]; if(!h) return 0; const t=h.resolved+h.failed; return t? Math.round(h.resolved/t*100):0; });
  rateChart.data.datasets[1].data = hours.map(k => { const h=hmap[k]; if(!h) return 0; const t=h.resolved+h.failed; return t? Math.round(h.failed/t*100):0; });
  rateChart.update("none");
}

/* ---- horizontal min·avg·max boxplot:  |---<>---|  (CSS, fully responsive) ---- */
function renderBox(elId, stat, fmt) {
  const { min, avg, max } = stat;
  const span = max - min;
  const pct = span > 0 ? Math.max(0, Math.min(100, (avg-min)/span*100)) : 50;
  document.getElementById(elId).innerHTML =
    '<div class="bp">'
    + '<div class="bp-track"></div>'
    + '<div class="bp-cap min"></div>'
    + '<div class="bp-cap max"></div>'
    + '<div class="bp-avg" style="left:'+pct+'%"></div>'
    + '<div class="bp-lab min">'+fmt(min)+'</div>'
    + '<div class="bp-lab avg" style="left:'+pct+'%">'+fmt(avg)+'</div>'
    + '<div class="bp-lab max">'+fmt(max)+'</div>'
    + '</div>';
}

function updateThroughput(m, c) {
  document.getElementById("tp-total-acus").textContent = (c.acu.total||0).toFixed(2);
  renderBox("box-acu", c.acu, v => (v||0).toFixed(2));
  renderBox("box-elapsed", c.elapsed, v => fmtDuration(v));
  document.getElementById("kpi-tp").innerHTML =
    '<b>'+m.total+'</b> tasks · <b>'+m.throughput24h+'</b> in 24h';
}

function updateKpis(m) {
  document.getElementById("kpi-status").innerHTML = '<b>'+m.total+'</b> total · <b>'+m.active+'</b> active';
  const sr = m.successRate == null ? "—" : Math.round(m.successRate*100)+"%";
  document.getElementById("kpi-rate").innerHTML = '<b>'+sr+'</b> success · <b>'+m.failed+'</b> failed · <b>'+m.rejected+'</b> rejected';
}

function renderRows(tasks) {
  const tbody = document.getElementById("rows");
  if (!tasks.length) { tbody.innerHTML = '<tr><td colspan="6" class="empty">No tasks yet. Label a GitHub issue <b>devin</b> to begin.</td></tr>'; return; }
  tbody.innerHTML = tasks.map(t => {
    const running = t.status === "running";
    const badge = '<span class="badge b-'+t.status+(running?' pulse':'')+'">'+statusLabel(t.status)+'</span>';
    const acus = Number(t.acus_consumed || 0).toFixed(2);
    const isOpen = expanded.has(t.id);
    const prBtn = t.pr_url
      ? '<a class="icon-btn tip" data-tip="View GitHub PR" href="'+t.pr_url+'" target="_blank">'+GH_ICON+'</a>'
      : '<span class="icon-btn tip disabled" data-tip="No PR yet">'+GH_ICON+'</span>';
    const sessionBtn = t.devin_session_id
      ? '<a class="icon-btn tip" data-tip="View Devin session" href="'+DEVIN_SESSION_BASE+t.devin_session_id+'" target="_blank">'+DV_ICON+'</a>'
      : '<span class="icon-btn tip disabled" data-tip="No session yet">'+DV_ICON+'</span>';
    const chevBtn = '<button type="button" class="icon-btn tip chev'+(isOpen?' open':'')+'" data-tip="Latest message" onclick="toggleRow('+t.id+')">'+CHEVRON+'</button>';

    const msg = t.last_message || t.status_detail || (t.status === "queued" ? "Waiting for worker to dispatch." : "No messages yet.");
    const detailRow =
      '<tr class="detail-row" style="'+(isOpen?'':'display:none')+'">'
      + '<td colspan="5"><div class="detail-panel">'
      +   '<div class="detail-label">Latest message</div>'
      +   '<div class="detail-msg">'+escapeHtml(msg)+'</div>'
      + '</div></td></tr>';

    return '<tr>'
      + '<td><div class="issue-title"><a href="'+t.issue_url+'" target="_blank">'+escapeHtml(t.issue_title)+'</a></div>'
      +   '<div class="issue-meta">'+t.repo+' #'+t.issue_number+'</div></td>'
      + '<td>'+badge+'</td>'
      + '<td class="mono" data-elapsed="'+t.id+'">'+fmtDuration(elapsedFor(t))+'</td>'
      + '<td class="mono">'+acus+'</td>'
      + '<td style="text-align:right;white-space:nowrap">'+prBtn+sessionBtn+chevBtn+'</td>'
      + '</tr>'
      + detailRow;
  }).join("");
}

async function refresh() {
  try {
    const r = await fetch("/api/tasks");
    state = await r.json();
    updateKpis(state.metrics);
    updateCharts(state.charts);
    updateThroughput(state.metrics, state.charts);
    renderRows(state.tasks);
  } catch (e) { /* keep last state on transient error */ }
}
function tick() {
  for (const t of state.tasks) {
    if (t.status !== "running" && t.status !== "queued") continue;
    const cell = document.querySelector('[data-elapsed="'+t.id+'"]');
    if (cell) cell.textContent = fmtDuration(elapsedFor(t));
  }
}
refresh();
setInterval(refresh, 5000);
setInterval(tick, 1000);
</script>
</body>
</html>`;
}
