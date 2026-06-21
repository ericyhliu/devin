import { sharedStyles, sidebar } from "./layout.js";

/**
 * The Workflows page: a control to run the autonomous code-quality workflow
 * (Devin discovers + files issues) and a live table of the issues it generated,
 * each joined to its remediation status. Polls /api/workflows every 5s.
 */
export function renderWorkflowsPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Workflows · Devin Orchestrator</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<style>
${sharedStyles()}
</style>
</head>
<body>
${sidebar("workflows")}

  <main class="main">
    <h1 class="page-title">Workflows</h1>
    <p class="page-sub">Devin autonomously discovers code-quality issues and files them — the remediation pipeline takes it from there.</p>

    <div class="panel" style="margin-bottom:24px">
      <div class="wf-control">
        <button class="btn btn-primary" id="run-btn" onclick="runWorkflow()">
          <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>
          Run Code Quality Workflow
        </button>
        <a class="icon-btn tip disabled" id="disc-session" target="_blank" data-tip="No discovery session yet">
          <img src="/devin-logo.svg" class="dv-ico" alt="Devin">
        </a>
        <div class="sched">
          <span id="sched-badge" class="badge b-none">Auto-run hourly disabled</span>
        </div>
      </div>
      <div class="panel-kpi" id="wf-summary" style="margin: 14px 0 0"></div>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Generated Issue</th><th>Discovered</th><th>Remediation</th><th></th></tr>
        </thead>
        <tbody id="wf-rows"><tr><td colspan="4" class="empty">Loading…</td></tr></tbody>
      </table>
    </div>
  </main>

<script>
const DEVIN_SESSION_BASE = "https://app.devin.ai/sessions/";
const GH_ICON = '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"></path></svg>';
const DV_ICON = '<img src="/devin-logo.svg" class="dv-ico" alt="Devin">';
const STATUS_LABELS = { queued:"Queued", running:"Running", pr_open:"PR Open", done:"Done", failed:"Failed", rejected:"Rejected" };

let state = { schedule: "paused", runs: [], issues: [] };

function escapeHtml(s){return (s||"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
function ago(ts){ const s=Math.floor((Date.now()-new Date(ts))/1000); if(s<60)return s+"s ago"; const m=Math.floor(s/60); if(m<60)return m+"m ago"; const h=Math.floor(m/60); if(h<24)return h+"h ago"; return Math.floor(h/24)+"d ago"; }
function issueUrl(repo, n){ return "https://github.com/"+repo+"/issues/"+n; }

function render() {
  // schedule + buttons
  const active = state.schedule === "active";
  const discovering = state.runs.some(r => r.status === "discovering");
  const schedBadge = document.getElementById("sched-badge");
  schedBadge.className = "badge " + (active ? "b-done" : "b-none");
  schedBadge.textContent = active ? "Auto-run hourly enabled" : "Auto-run hourly disabled";
  const runBtn = document.getElementById("run-btn");
  runBtn.disabled = discovering;
  runBtn.querySelector("svg").nextSibling.textContent = discovering ? " Discovering…" : " Run Code Quality Workflow";

  // Devin button → peek into the active (or most recent) discovery session
  const discRun = state.runs.find(r => r.status === "discovering") || state.runs[0];
  const discSession = discRun && discRun.discovery_session_id;
  const discBtn = document.getElementById("disc-session");
  if (discSession) {
    discBtn.classList.remove("disabled");
    discBtn.href = DEVIN_SESSION_BASE + discSession;
    discBtn.setAttribute("data-tip", discRun.status === "discovering" ? "View active discovery session" : "View last discovery session");
  } else {
    discBtn.classList.add("disabled");
    discBtn.removeAttribute("href");
    discBtn.setAttribute("data-tip", "No discovery session yet");
  }

  const totalIssues = state.issues.length;
  document.getElementById("wf-summary").innerHTML =
    '<b>'+state.runs.length+'</b> runs · <b>'+totalIssues+'</b> issues filed'
    + (discovering ? ' · <span style="color:var(--blue)">discovery in progress…</span>' : '');

  // issues table
  const tbody = document.getElementById("wf-rows");
  if (!state.issues.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty">'
      + (discovering ? 'Devin is scanning the repository and filing issues…' : 'No issues generated yet. Press “Run Code Quality Workflow”.')
      + '</td></tr>';
    return;
  }
  tbody.innerHTML = state.issues.map(it => {
    const ts = it.task_status;
    const remediation = ts
      ? '<span class="badge b-'+ts+(ts==="running"?' pulse':'')+'">'+(STATUS_LABELS[ts]||ts)+'</span>'
      : '<span class="badge b-none">Pending</span>';
    const prBtn = it.pr_url
      ? '<a class="icon-btn tip" data-tip="View GitHub PR" href="'+it.pr_url+'" target="_blank">'+GH_ICON+'</a>'
      : '<span class="icon-btn tip disabled" data-tip="No PR yet">'+GH_ICON+'</span>';
    const sessBtn = it.devin_session_id
      ? '<a class="icon-btn tip" data-tip="View Devin session" href="'+DEVIN_SESSION_BASE+it.devin_session_id+'" target="_blank">'+DV_ICON+'</a>'
      : '<span class="icon-btn tip disabled" data-tip="No session yet">'+DV_ICON+'</span>';
    return '<tr>'
      + '<td><div class="issue-title"><a href="'+issueUrl(it.repo,it.issue_number)+'" target="_blank">'+escapeHtml(it.title)+'</a></div>'
      +   '<div class="issue-meta">'+it.repo+' #'+it.issue_number+(it.file?' · '+escapeHtml(it.file):'')+'</div></td>'
      + '<td class="mono">'+ago(it.created_at)+'</td>'
      + '<td>'+remediation+'</td>'
      + '<td style="text-align:right;white-space:nowrap">'+prBtn+sessBtn+'</td>'
      + '</tr>';
  }).join("");
}

async function refresh() {
  try { const r = await fetch("/api/workflows"); state = await r.json(); render(); } catch (e) {}
}
async function runWorkflow() {
  const btn = document.getElementById("run-btn");
  btn.disabled = true;
  try { await fetch("/api/workflows/run", { method: "POST" }); } catch (e) {}
  await refresh();
}
refresh();
setInterval(refresh, 5000);
</script>
</body>
</html>`;
}
