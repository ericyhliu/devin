/**
 * The dashboard is a single server-rendered HTML shell with embedded CSS + JS.
 * It polls /api/tasks every few seconds and re-renders the cards + table client
 * side, so elapsed timers tick smoothly without a framework or build step.
 */
export function renderDashboardPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Devin Orchestrator</title>
<style>
  :root {
    --bg: #0a0a0c;
    --sidebar: #0e0f13;
    --panel: #131419;
    --panel-2: #16181f;
    --border: #23252e;
    --text: #e7e8ec;
    --muted: #8a909c;
    --accent: #7c83ff;
    --green: #34d399;
    --amber: #fbbf24;
    --blue: #60a5fa;
    --red: #f87171;
    --gray: #6b7280;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--text);
    font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    display: flex; min-height: 100vh;
  }
  a { color: inherit; text-decoration: none; }

  /* Sidebar */
  .sidebar {
    width: 240px; flex-shrink: 0; background: var(--sidebar);
    border-right: 1px solid var(--border); padding: 20px 14px;
    display: flex; flex-direction: column; gap: 24px;
  }
  .brand { display: flex; align-items: center; gap: 10px; padding: 4px 8px; }
  .brand svg { width: 22px; height: 22px; }
  .brand-name { font-weight: 600; font-size: 15px; letter-spacing: -0.01em; }
  .nav { display: flex; flex-direction: column; gap: 2px; }
  .nav a {
    display: flex; align-items: center; gap: 10px; padding: 8px 10px;
    border-radius: 8px; color: var(--muted); font-weight: 500;
  }
  .nav a.active { background: var(--panel-2); color: var(--text); }
  .nav a:hover { color: var(--text); }
  .sidebar-foot { margin-top: auto; color: var(--muted); font-size: 12px; padding: 0 8px; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--green); display: inline-block; margin-right: 6px; }

  /* Main */
  .main { flex: 1; padding: 28px 32px; max-width: 1200px; }
  .page-title { font-size: 22px; font-weight: 650; letter-spacing: -0.02em; margin: 0 0 4px; }
  .page-sub { color: var(--muted); margin: 0 0 24px; }

  /* Metric cards */
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 14px; margin-bottom: 28px; }
  .card { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 16px 18px; }
  .card .label { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }
  .card .value { font-size: 26px; font-weight: 650; margin-top: 6px; letter-spacing: -0.02em; }
  .card .value small { font-size: 14px; color: var(--muted); font-weight: 500; }

  /* Table */
  .table-wrap { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
  table { width: 100%; border-collapse: collapse; }
  thead th {
    text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;
    color: var(--muted); font-weight: 600; padding: 12px 16px; border-bottom: 1px solid var(--border);
  }
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
  .b-rejected { color: #f0789b; background: rgba(240,120,155,0.14); }
  .pulse::before { animation: pulse 1.2s ease-in-out infinite; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.25; } }

  .btn {
    display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px;
    border: 1px solid var(--border); border-radius: 8px; font-size: 12px; font-weight: 600;
    color: var(--text); background: var(--panel-2); white-space: nowrap;
  }
  .btn:hover { border-color: var(--accent); color: #fff; }
  .btn.disabled { opacity: 0.4; pointer-events: none; }
  .btn-pr { border-color: rgba(124,131,255,0.4); }
  .empty { padding: 40px; text-align: center; color: var(--muted); }
  .detail { color: var(--muted); font-size: 12px; }
  .detail-cell { max-width: 360px; }
  .detail-cell .detail { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
</head>
<body>
  <aside class="sidebar">
    <div class="brand">
      <!-- Placeholder mark — swap for the official Devin logo SVG if desired -->
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="10" stroke="#fff" stroke-width="1.6"/>
        <circle cx="12" cy="12" r="3.2" fill="#fff"/>
      </svg>
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

    <div class="cards" id="cards"></div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Issue</th><th>Status</th><th>Processing</th><th>Elapsed</th><th>ACUs</th><th></th>
          </tr>
        </thead>
        <tbody id="rows">
          <tr><td colspan="6" class="empty">Loading…</td></tr>
        </tbody>
      </table>
    </div>
  </main>

<script>
const DEVIN_SESSION_BASE = "https://app.devin.ai/sessions/";
let state = { metrics: null, tasks: [] };

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
  // terminal: cycle time from created -> pr opened (or last update)
  const end = t.pr_opened_at || t.updated_at;
  return (new Date(end) - new Date(t.created_at)) / 1000;
}
function statusLabel(s) { return s.replace("_"," "); }

function renderCards(m) {
  if (!m) return;
  const sr = m.successRate == null ? "—" : Math.round(m.successRate * 100) + "%";
  const cyc = m.avgCycleSeconds == null ? "—" : fmtDuration(m.avgCycleSeconds);
  const acus = (m.totalAcus ?? 0).toFixed(2);
  const cards = [
    { label: "Total Tasks", value: m.total },
    { label: "Active", value: m.active },
    { label: "Resolved", value: m.resolved },
    { label: "Failed", value: m.failed },
    { label: "Rejected", value: m.rejected },
    { label: "Success Rate", value: sr },
    { label: "Avg Cycle Time", value: cyc },
    { label: "Throughput · 24h", value: m.throughput24h },
    { label: "Total ACUs", value: acus },
  ];
  document.getElementById("cards").innerHTML = cards.map(c =>
    '<div class="card"><div class="label">'+c.label+'</div><div class="value">'+c.value+'</div></div>'
  ).join("");
}

function renderRows(tasks) {
  const tbody = document.getElementById("rows");
  if (!tasks.length) { tbody.innerHTML = '<tr><td colspan="6" class="empty">No tasks yet. Label a GitHub issue <b>devin</b> to begin.</td></tr>'; return; }
  tbody.innerHTML = tasks.map(t => {
    const running = t.status === "running";
    const badge = '<span class="badge b-'+t.status+(running?' pulse':'')+'">'+statusLabel(t.status)+'</span>';
    // Live progress: prefer Devin's latest message, fall back to status_detail.
    let detailText = "—";
    if (running) detailText = t.last_message || t.status_detail || "working";
    else if (t.status === "queued") detailText = "waiting for worker";
    const detail = '<span class="detail" title="'+escapeHtml(detailText)+'">'+escapeHtml(detailText)+'</span>';
    const acus = Number(t.acus_consumed || 0).toFixed(2);
    const sessionBtn = t.devin_session_id
      ? '<a class="btn" href="'+DEVIN_SESSION_BASE+t.devin_session_id+'" target="_blank">Live session →</a>'
      : '<span class="btn disabled">Live session</span>';
    const prBtn = t.pr_url ? '<a class="btn btn-pr" href="'+t.pr_url+'" target="_blank">PR →</a>' : '';
    return '<tr>'
      + '<td><div class="issue-title"><a href="'+t.issue_url+'" target="_blank">'+escapeHtml(t.issue_title)+'</a></div>'
      +   '<div class="issue-meta">'+t.repo+' #'+t.issue_number+'</div></td>'
      + '<td>'+badge+'</td>'
      + '<td class="detail-cell">'+detail+'</td>'
      + '<td class="mono" data-elapsed="'+t.id+'">'+fmtDuration(elapsedFor(t))+'</td>'
      + '<td class="mono">'+acus+'</td>'
      + '<td style="text-align:right;white-space:nowrap">'+prBtn+' '+sessionBtn+'</td>'
      + '</tr>';
  }).join("");
}

function escapeHtml(s){return (s||"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}

async function refresh() {
  try {
    const r = await fetch("/api/tasks");
    state = await r.json();
    renderCards(state.metrics);
    renderRows(state.tasks);
  } catch (e) { /* keep last state on transient error */ }
}
// tick elapsed timers every second for active rows without refetching
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
