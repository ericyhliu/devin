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
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js"></script>
<style>
  :root {
    --bg: #0a0a0c; --sidebar: #0e0f13; --panel: #131419; --panel-2: #16181f;
    --border: #23252e; --text: #e7e8ec; --muted: #8a909c; --accent: #7c83ff;
    --green: #34d399; --amber: #fbbf24; --blue: #60a5fa; --red: #f87171;
    --gray: #6b7280; --pink: #f0789b;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--text);
    font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    display: flex; min-height: 100vh;
  }
  a { color: inherit; text-decoration: none; }

  .sidebar {
    width: 240px; flex-shrink: 0; background: var(--sidebar);
    border-right: 1px solid var(--border); padding: 20px 14px;
    display: flex; flex-direction: column; gap: 24px;
  }
  .brand { display: flex; align-items: center; gap: 10px; padding: 4px 8px; }
  .brand-logo { width: 22px; height: 22px; }
  .brand-name { font-weight: 600; font-size: 15px; letter-spacing: -0.01em; }
  .nav { display: flex; flex-direction: column; gap: 2px; }
  .nav a { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 8px; color: var(--muted); font-weight: 500; }
  .nav a.active { background: var(--panel-2); color: var(--text); }
  .nav a:hover { color: var(--text); }
  .sidebar-foot { margin-top: auto; color: var(--muted); font-size: 12px; padding: 0 8px; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--green); display: inline-block; margin-right: 6px; }

  .main { flex: 1; padding: 56px 32px 40px; display: flex; flex-direction: column; align-items: center; }
  .main > * { width: 100%; max-width: 1180px; }
  .page-title { font-size: 22px; font-weight: 650; letter-spacing: -0.02em; margin: 0 0 4px; }
  .page-sub { color: var(--muted); margin: 0 0 24px; }

  .panels { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 24px; }
  .panel { background: var(--panel); border: 1px solid var(--border); border-radius: 14px; padding: 18px 18px 14px; }
  .panel-head { margin-bottom: 2px; }
  .panel-title { font-size: 14px; font-weight: 600; }
  .panel-kpi { font-size: 12px; color: var(--muted); margin-bottom: 14px; }
  .panel-kpi b { color: var(--text); font-weight: 600; }
  .chart-box { position: relative; height: 260px; width: 100%; }
  .chart-box canvas { position: absolute; inset: 0; }

  /* throughput panel — vertical stack to match chart height */
  .tp-stack { display: flex; flex-direction: column; gap: 16px; height: 260px; justify-content: space-between; }
  .tp-block .num { font-size: 30px; font-weight: 680; letter-spacing: -0.02em; margin-top: 2px; }
  .box-title { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }
  /* horizontal min·avg·max boxplot:  |---<>---|  */
  .bp { position: relative; height: 44px; margin-top: 12px; }
  .bp-track { position: absolute; top: 15px; left: 0; right: 0; height: 2px; background: #3a3d48; border-radius: 2px; }
  .bp-cap { position: absolute; top: 8px; width: 2px; height: 16px; background: var(--muted); }
  .bp-cap.min { left: 0; }
  .bp-cap.max { right: 0; }
  .bp-avg { position: absolute; top: 10px; width: 11px; height: 11px; background: var(--blue); transform: translateX(-50%) rotate(45deg); border-radius: 2px; }
  .bp-lab { position: absolute; font-size: 10px; color: var(--muted); white-space: nowrap; }
  .bp-lab.min { left: 0; top: 25px; }
  .bp-lab.max { right: 0; top: 25px; }
  .bp-lab.avg { top: -2px; color: var(--text); transform: translateX(-50%); }
  @media (max-width: 1000px) { .panels { grid-template-columns: 1fr; } .tp-stack { height: auto; } }

  .table-wrap { background: var(--panel); border: 1px solid var(--border); border-radius: 14px; overflow: hidden; }
  table { width: 100%; border-collapse: collapse; }
  thead th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); font-weight: 600; padding: 12px 16px; border-bottom: 1px solid var(--border); }
  tbody td { padding: 14px 16px; border-bottom: 1px solid var(--border); vertical-align: middle; }
  tbody tr:last-child td { border-bottom: none; }
  tbody tr:hover { background: var(--panel-2); }
  .issue-title { font-weight: 550; }
  .issue-meta { color: var(--muted); font-size: 12px; margin-top: 2px; }
  .mono { font-variant-numeric: tabular-nums; }

  .badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 9px; border-radius: 999px; font-size: 12px; font-weight: 600; }
  .badge::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
  .b-queued { color: var(--gray); background: rgba(107,114,128,0.14); }
  .b-running { color: var(--blue); background: rgba(96,165,250,0.14); }
  .b-pr_open { color: var(--amber); background: rgba(251,191,36,0.14); }
  .b-done { color: var(--green); background: rgba(52,211,153,0.14); }
  .b-failed { color: var(--red); background: rgba(248,113,113,0.14); }
  .b-rejected { color: var(--pink); background: rgba(240,120,155,0.14); }
  .pulse::before { animation: pulse 1.2s ease-in-out infinite; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.25; } }

  /* icon action buttons in the table */
  .icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border: 1px solid var(--border); border-radius: 8px; color: var(--text); background: var(--panel-2); }
  .icon-btn + .icon-btn { margin-left: 6px; }
  .icon-btn:hover { border-color: var(--accent); color: #fff; }
  .icon-btn.disabled { opacity: 0.32; pointer-events: none; }
  .icon-btn svg { width: 15px; height: 15px; }
  .icon-btn .dv-ico { width: 15px; height: 15px; filter: brightness(0) invert(1); }
  .empty { padding: 40px; text-align: center; color: var(--muted); }
  .detail { color: var(--muted); font-size: 12px; }
  .detail-cell { max-width: 360px; }
  .detail-cell .detail { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
</head>
<body>
  <aside class="sidebar">
    <div class="brand">
      <img src="/devin-logo.svg" class="brand-logo" alt="Devin" />
      <span class="brand-name">Devin Orchestrator</span>
    </div>
    <nav class="nav">
      <a href="/tasks" class="active">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
        Tasks
      </a>
    </nav>
    <div class="sidebar-foot"><span class="dot"></span>live · auto-refresh 5s</div>
  </aside>

  <main class="main">
    <h1 class="page-title">Tasks</h1>
    <p class="page-sub">Autonomous remediation of labeled GitHub issues via Devin.</p>

    <div class="panels">
      <div class="panel">
        <div class="panel-head"><div class="panel-title">Task Status (last 7D)</div></div>
        <div class="panel-kpi" id="kpi-status"></div>
        <div class="chart-box"><canvas id="chartStatus"></canvas></div>
      </div>

      <div class="panel">
        <div class="panel-head"><div class="panel-title">Success / Failure Rate</div></div>
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
          <tr><th>Issue</th><th>Status</th><th>Processing</th><th>Elapsed</th><th>ACUs</th><th></th></tr>
        </thead>
        <tbody id="rows"><tr><td colspan="6" class="empty">Loading…</td></tr></tbody>
      </table>
    </div>
  </main>

<script>
const DEVIN_SESSION_BASE = "https://app.devin.ai/sessions/";
const GH_ICON = '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"></path></svg>';
const DV_ICON = '<img src="/devin-logo.svg" class="dv-ico" alt="Devin">';
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
function statusLabel(s) { return s.replace("_"," "); }
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
      { label:"Success %", borderColor:CLR.resolved, backgroundColor:"rgba(52,211,153,0.12)", tension:0.3, fill:true, pointRadius:3, spanGaps:true, data:[] },
      { label:"Failure %", borderColor:CLR.failed, backgroundColor:"rgba(248,113,113,0.10)", tension:0.3, fill:true, pointRadius:3, spanGaps:true, data:[] },
    ]},
    options: { responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ position:"bottom", labels:{ boxWidth:10, boxHeight:10, usePointStyle:true } } },
      scales:{ x:{ grid:{ display:false } }, y:{ beginAtZero:true, max:100, ticks:{ callback:v=>v+"%" } } } }
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
  rateChart.data.datasets[0].data = hours.map(k => { const h=hmap[k]; if(!h) return 100; const t=h.resolved+h.failed; return t? Math.round(h.resolved/t*100):100; });
  rateChart.data.datasets[1].data = hours.map(k => { const h=hmap[k]; if(!h) return 0;   const t=h.resolved+h.failed; return t? Math.round(h.failed/t*100):0; });
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
    let detailText = "—";
    if (running) detailText = t.last_message || t.status_detail || "working";
    else if (t.status === "queued") detailText = "waiting for worker";
    const detail = '<span class="detail" title="'+escapeHtml(detailText)+'">'+escapeHtml(detailText)+'</span>';
    const acus = Number(t.acus_consumed || 0).toFixed(2);
    const prBtn = t.pr_url
      ? '<a class="icon-btn" href="'+t.pr_url+'" target="_blank" title="View GitHub PR">'+GH_ICON+'</a>'
      : '<span class="icon-btn disabled" title="No PR yet">'+GH_ICON+'</span>';
    const sessionBtn = t.devin_session_id
      ? '<a class="icon-btn" href="'+DEVIN_SESSION_BASE+t.devin_session_id+'" target="_blank" title="View Devin session">'+DV_ICON+'</a>'
      : '<span class="icon-btn disabled" title="No session yet">'+DV_ICON+'</span>';
    return '<tr>'
      + '<td><div class="issue-title"><a href="'+t.issue_url+'" target="_blank">'+escapeHtml(t.issue_title)+'</a></div>'
      +   '<div class="issue-meta">'+t.repo+' #'+t.issue_number+'</div></td>'
      + '<td>'+badge+'</td>'
      + '<td class="detail-cell">'+detail+'</td>'
      + '<td class="mono" data-elapsed="'+t.id+'">'+fmtDuration(elapsedFor(t))+'</td>'
      + '<td class="mono">'+acus+'</td>'
      + '<td style="text-align:right;white-space:nowrap">'+prBtn+sessionBtn+'</td>'
      + '</tr>';
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
