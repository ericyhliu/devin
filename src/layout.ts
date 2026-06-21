/** Shared chrome (CSS + sidebar) used by both the Tasks and Workflows pages. */

export function sharedStyles(): string {
  return `
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
  .panel-head { margin-bottom: 8px; }
  .panel-title { font-size: 16.5px; font-weight: 650; letter-spacing: -0.01em; }
  .panel-kpi { font-size: 12px; color: var(--muted); margin-bottom: 18px; }
  .panel-kpi b { color: var(--text); font-weight: 600; }
  .chart-box { position: relative; height: 260px; width: 100%; }
  .chart-box canvas { position: absolute; inset: 0; }

  .tp-stack { display: flex; flex-direction: column; gap: 16px; height: 260px; justify-content: space-between; }
  .tp-block .num { font-size: 22px; font-weight: 680; letter-spacing: -0.02em; margin-top: 2px; }
  .box-title { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }
  .bp { position: relative; height: 48px; margin-top: 22px; }
  .bp-track { position: absolute; top: 15px; left: 0; right: 0; height: 2px; background: #3a3d48; border-radius: 2px; }
  .bp-cap { position: absolute; top: 8px; width: 2px; height: 16px; background: var(--muted); }
  .bp-cap.min { left: 0; }
  .bp-cap.max { right: 0; }
  .bp-avg { position: absolute; top: 10px; width: 11px; height: 11px; background: var(--blue); transform: translateX(-50%) rotate(45deg); border-radius: 2px; }
  .bp-lab { position: absolute; font-size: 10px; color: var(--muted); white-space: nowrap; }
  .bp-lab.min { left: 0; top: 25px; }
  .bp-lab.max { right: 0; top: 25px; }
  .bp-lab.avg { top: -14px; color: var(--text); transform: translateX(-50%); }
  @media (max-width: 1000px) { .panels { grid-template-columns: 1fr; } .tp-stack { height: auto; } }

  .table-wrap { background: var(--panel); border: 1px solid var(--border); border-radius: 14px; }
  .tip { position: relative; }
  .tip::after {
    content: attr(data-tip); position: absolute; bottom: calc(100% + 9px); left: 50%; transform: translateX(-50%);
    background: #1c1e26; color: var(--text); border: 1px solid var(--border); padding: 6px 10px; border-radius: 7px;
    font-size: 11px; font-weight: 600; white-space: nowrap; opacity: 0; pointer-events: none; z-index: 100;
    box-shadow: 0 8px 22px rgba(0,0,0,0.55);
  }
  .tip::before {
    content: ""; position: absolute; bottom: calc(100% + 4px); left: 50%; transform: translateX(-50%);
    border: 6px solid transparent; border-top-color: var(--border); opacity: 0; pointer-events: none; z-index: 100;
  }
  .tip:hover::after, .tip:hover::before { opacity: 1; }
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
  .b-discovering { color: var(--blue); background: rgba(96,165,250,0.14); }
  .b-completed { color: var(--green); background: rgba(52,211,153,0.14); }
  .b-none { color: var(--gray); background: rgba(107,114,128,0.14); }
  .pulse::before { animation: pulse 1.2s ease-in-out infinite; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.25; } }

  .icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border: 1px solid var(--border); border-radius: 8px; color: var(--text); background: var(--panel-2); cursor: pointer; font: inherit; }
  .icon-btn + .icon-btn { margin-left: 6px; }
  .icon-btn:hover { border-color: var(--accent); color: #fff; }
  .icon-btn.disabled { opacity: 0.32; cursor: default; }
  .icon-btn svg { width: 15px; height: 15px; }
  .icon-btn .dv-ico { width: 15px; height: 15px; filter: brightness(0) invert(1); }
  .empty { padding: 40px; text-align: center; color: var(--muted); }
  .detail-row td { padding: 0; background: var(--panel-2); }
  .detail-panel { padding: 14px 18px 16px; }
  .detail-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); margin-bottom: 6px; }
  .detail-msg { font-size: 13px; color: var(--text); line-height: 1.55; white-space: pre-wrap; word-break: break-word; }
  .icon-btn.chev svg { transition: transform 0.15s ease; }
  .icon-btn.chev.open svg { transform: rotate(180deg); }

  /* workflow controls */
  .btn { display: inline-flex; align-items: center; gap: 8px; padding: 9px 16px; border-radius: 9px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1px solid var(--border); background: var(--panel-2); color: var(--text); }
  .btn:hover { border-color: var(--accent); }
  .btn svg { width: 15px; height: 15px; }
  .btn-primary { background: var(--accent); border-color: var(--accent); color: #fff; }
  .btn-primary:hover { filter: brightness(1.08); }
  .btn:disabled { opacity: 0.45; cursor: default; filter: none; }
  .wf-control { display: flex; align-items: center; gap: 14px; }
  .sched { display: inline-flex; align-items: center; gap: 10px; font-size: 13px; color: var(--muted); margin-left: auto; }

  /* toggle switch */
  .switch { display: inline-flex; align-items: center; gap: 10px; cursor: pointer; user-select: none; }
  .switch input { display: none; }
  .switch .track { width: 38px; height: 22px; border-radius: 999px; background: var(--panel-2); border: 1px solid var(--border); position: relative; transition: background 0.15s, border-color 0.15s; }
  .switch .track::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: var(--muted); transition: transform 0.15s, background 0.15s; }
  .switch input:checked + .track { background: var(--accent); border-color: var(--accent); }
  .switch input:checked + .track::after { transform: translateX(16px); background: #fff; }
  `;
}

const ICON_TASKS = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>';
const ICON_WORKFLOWS = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="8" x="3" y="3" rx="2"/><path d="M7 11v4a2 2 0 0 0 2 2h4"/><rect width="8" height="8" x="13" y="13" rx="2"/></svg>';

export function sidebar(active: "tasks" | "workflows"): string {
  const a = (k: string) => (active === k ? ' class="active"' : "");
  return `
  <aside class="sidebar">
    <div class="brand">
      <img src="/devin-logo.svg" class="brand-logo" alt="Devin" />
      <span class="brand-name">Devin Orchestrator</span>
    </div>
    <nav class="nav">
      <a href="/"${a("tasks")}>${ICON_TASKS} Tasks</a>
      <a href="/workflows"${a("workflows")}>${ICON_WORKFLOWS} Workflows</a>
    </nav>
    <div class="sidebar-foot"><span class="dot"></span>live · auto-refresh 5s</div>
  </aside>`;
}
