import { datasets, initialRules, summarize, incidents, ruleSQL, revenue } from './engine.js';

const icons = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>',
  shield: '<path d="M12 3 3 7v5c0 5 9 10 9 10s9-5 9-10V7Z"/><path d="m8 12 3 3 5-6"/>',
  pulse: '<path d="M2 12h5l3-8 4 16 3-8h5"/>',
  layers: '<path d="m12 3 10 5-10 5L2 8Zm-10 9 10 5 10-5M2 16l10 5 10-5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM20 2v4m-2-2h4"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
  settings: '<path d="M12 3v3m0 12v3M3 12h3m12 0h3M6 6l2 2m8 8 2 2M6 18l2-2m8-8 2-2"/><circle cx="12" cy="12" r="5"/>',
  play: '<path d="m8 4 12 8-12 8Z"/>',
  alert: '<path d="m12 3 10 18H2Z"/><path d="M12 9v5m0 3v1"/>',
  code: '<path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-14-2 16"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  link: '<path d="m10 13 4-4M8 15l-2 2a4 4 0 0 1-5-5l5-5a4 4 0 0 1 6 0m0 2 2-2a4 4 0 0 1 7 5l-5 5a4 4 0 0 1-6 0"/>',
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.grid}</svg>`;
const nav = [['overview', 'grid', 'Tổng quan'], ['sources', 'database', 'Nguồn dữ liệu'], ['rules', 'shield', 'Quality rules'], ['anomalies', 'pulse', 'Bất thường'], ['semantic', 'layers', 'Semantic & lineage'], ['history', 'clock', 'Lịch sử chạy']];
let rules = initialRules.map(rule => ({ ...rule }));
let page = 'overview';
let scanning = false;
let hasRun = false;
let activeFilter = 'all';
let query = '';
let runHistory = [];
let scanTimer;
const number = value => value.toLocaleString('vi-VN');
const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const tag = (label, tone = 'green') => `<span class="tag ${tone}">${label}</span>`;
const action = (name, label, cls = 'btn', extra = '') => `<button class="${cls}" data-action="${name}" ${extra}>${label}</button>`;

function shell() {
  const pending = rules.filter(rule => rule.status === 'pending').length;
  document.querySelector('#app').innerHTML = `
    <aside class="sidebar">
      <a class="brand" href="#overview"><span class="brand-symbol">${icon('shield')}</span>sentinel<span class="brand-dot">.</span></a>
      <div class="workspace"><span class="workspace-icon">V</span><div>VinUni workspace<small>DATA-02 · Demo project</small></div><span class="muted">⌄</span></div>
      <div class="nav-label">WORKSPACE</div>
      <nav>${nav.map(([id, symbol, title]) => `<button class="nav-item ${page === id ? 'active' : ''}" data-page="${id}">${icon(symbol)}<span>${title}</span>${id === 'anomalies' ? `<span class="nav-count">${incidents(rules).length}</span>` : id === 'rules' && pending ? `<span class="nav-count neutral">${pending}</span>` : ''}</button>`).join('')}</nav>
      <div class="sidebar-bottom"><div class="agent-status"><span class="live-dot"></span> Agent đang giám sát<span class="signal">▂▄▆</span></div><button class="nav-item" data-action="settings">${icon('settings')}Cài đặt workspace</button><div class="profile"><span class="avatar">AN</span><div>An Nguyễn<small>Data Engineer</small></div><span>⌄</span></div></div>
    </aside>
    <main><header class="topbar"><div class="breadcrumb">Workspace ${icon('chevron')} <strong>${nav.find(item => item[0] === page)[2]}</strong></div><div class="top-actions"><span class="demo-badge">DEMO MODE</span><button class="icon-button" aria-label="Xem cảnh báo" data-page="anomalies">${icon('bell')}<i></i></button><span class="avatar small">AN</span></div></header><div class="content">${renderPage()}</div><footer>Sentinel AI · Data you can trust.<span><span class="live-dot"></span> Tất cả hệ thống hoạt động <span class="footer-divider">|</span> Dữ liệu giả lập</span></footer></main>`;
}

function pageHeading(title, sub, buttons = '') {
  return `<div class="page-heading"><div><div class="eyebrow">YOUR DATA, IN GOOD HANDS</div><h1>${title}</h1><p>${sub}</p></div><div class="heading-actions">${buttons}</div></div>`;
}
function overview() {
  const summary = summarize(rules);
  const pending = rules.filter(rule => rule.status === 'pending').length;
  return `${pageHeading('Sức khỏe dữ liệu của bạn', 'Một góc nhìn toàn diện. Mọi bất thường đều có lời giải thích.', action('schedule', `${icon('clock')} Lịch chạy: mỗi giờ`, 'btn secondary') + action('scan', `${icon(scanning ? 'clock' : 'spark')} ${scanning ? 'Đang khảo sát…' : 'Chạy AI Agent'}`, 'btn primary', scanning ? 'disabled' : ''))}
  <section class="agent-banner"><div class="banner-icon">${icon('spark')}</div><div><div class="banner-title">${hasRun ? 'Agent đã hoàn thành kiểm tra dữ liệu' : 'Agent đã tìm thấy điều cần bạn quan tâm'} <span class="tiny-tag">AI INSIGHT</span></div><p>${hasRun ? `Đã chạy ${summary.active.length} rule. Kết quả và chẩn đoán đã được cập nhật bên dưới.` : `Doanh thu giảm bất thường và ${pending} rule mới đang chờ duyệt. Cùng xem dữ liệu đang nói gì.`}</p></div><button class="text-button" data-page="anomalies">Xem phân tích ${icon('arrow')}</button></section>
  <section class="stats"><article class="stat-card"><div class="stat-top">Data quality score <span class="stat-icon green">${icon('shield')}</span></div><div class="stat-value">${summary.score.toFixed(1)}<span>/100</span><svg class="mini-line" viewBox="0 0 100 35"><path d="m0 30 13-5 12 3 14-15 12 4 13-10 12 5 24-10"/></svg></div><div class="stat-bottom"><span class="trend">${icon('check')} Chất lượng tốt</span><span>trên bộ rule đã duyệt</span></div></article>
  <article class="stat-card"><div class="stat-top">Nguồn dữ liệu <span class="stat-icon blue">${icon('database')}</span></div><div class="stat-value">03<span>datasets</span></div><div class="stat-bottom"><span class="dot-label"><i></i> Đã kết nối</span><span>${number(29661)} bản ghi</span></div></article>
  <article class="stat-card"><div class="stat-top">Quality rules <span class="stat-icon purple">${icon('shield')}</span></div><div class="stat-value">${String(rules.length).padStart(2, '0')}<span>rules</span></div><div class="stat-bottom"><span>${summary.active.length} đang hoạt động</span>${tag(`${pending} chờ duyệt`, 'amber')}</div></article>
  <article class="stat-card"><div class="stat-top">Bất thường cần xử lý <span class="stat-icon orange">${icon('pulse')}</span></div><div class="stat-value">${String(incidents(rules).length).padStart(2, '0')}<span>issues</span><span class="little-bars">▂▃▂▅▃█▅</span></div><div class="stat-bottom">${tag('2 nghiêm trọng', 'red')}<span>Cần bạn chú ý</span></div></article></section>
  <section class="chart-grid"><article class="panel trend-panel"><div class="panel-header"><div><h2>Chất lượng dữ liệu theo thời gian</h2><p>Tỷ lệ bản ghi vượt qua kiểm tra chất lượng</p></div><span class="period">7 ngày gần nhất ⌄</span></div><div class="chart-legend"><span><i class="green-dot"></i>Quality score</span><span><i class="dashed-line"></i>Ngưỡng mục tiêu 95%</span></div>${qualityChart()}<div class="chart-foot">${icon('check')} Dữ liệu duy trì trên ngưỡng mục tiêu trong 7 ngày qua</div></article>
  <article class="panel agent-panel"><div class="panel-header"><h2>${icon('spark')} Hoạt động của Agent</h2><span class="live-pill"><span class="live-dot"></span>Live</span></div><div class="timeline"><div><span class="timeline-dot green">${icon('check')}</span><div><strong>Hoàn tất khảo sát dữ liệu</strong><p>3 bảng · 29 cột · 29.661 bản ghi</p><small>10:25 · Dataset profiler</small></div></div><div><span class="timeline-dot purple">${icon('spark')}</span><div><strong>Đề xuất 3 quality rules mới</strong><p>Phát hiện khóa định danh và ràng buộc</p><small>10:26 · Rule generator</small></div></div><div><span class="timeline-dot orange">${icon('pulse')}</span><div><strong>Phát hiện biến động doanh thu</strong><p>Vượt ngưỡng thống kê so với baseline</p><small>10:27 · Anomaly detector</small></div></div></div><button class="panel-link" data-page="history">Xem toàn bộ hoạt động ${icon('arrow')}</button></article></section>
  <section class="panel sources-panel"><div class="panel-header"><div class="inline-title"><h2>Nguồn dữ liệu được giám sát</h2><span class="counter">3</span></div><button class="text-button" data-page="sources">Xem tất cả ${icon('arrow')}</button></div>${datasetTable()}</section>
  <section class="bottom-grid"><article class="panel"><div class="panel-header"><h2>Bất thường gần đây <span class="counter red-count">${incidents(rules).length}</span></h2><button class="text-button" data-page="anomalies">Xem tất cả ${icon('arrow')}</button></div>${incidents(rules).slice(0, 2).map(issue => `<button class="issue-row" data-incident="${issue.id}"><span class="issue-icon ${issue.severity === 'critical' ? 'red' : 'amber'}">${icon('pulse')}</span><div><strong>${issue.title}</strong><small>analytics.${datasets.find(dataset => dataset.id === issue.dataset).name} · 10:27</small></div><span class="issue-metric">${issue.metric}</span>${icon('chevron')}</button>`).join('')}</article><article class="panel suggestion"><span class="suggestion-icon">${icon('spark')}</span><div><span class="eyebrow">LET AI DO THE HEAVY LIFTING</span><h2>${pending} rule mới, bớt việc cho bạn.</h2><p>Agent đã khảo sát schema và đề xuất các kiểm tra phù hợp với dữ liệu của bạn.</p><button class="text-button" data-page="rules">Xem & duyệt đề xuất ${icon('arrow')}</button></div></article></section>`;
}
function qualityChart() {
  return `<div class="chart"><svg viewBox="0 0 720 198" role="img" aria-label="Biểu đồ minh họa quality score trong 7 ngày từ 97 đến 99 phần trăm"><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#30a384" stop-opacity=".18"/><stop offset="100%" stop-color="#30a384" stop-opacity="0"/></linearGradient></defs><g class="grid-lines"><path d="M45 22H700M45 65H700M45 108H700M45 151H700"/></g><g class="axis-text"><text x="0" y="26">100%</text><text x="8" y="69">98%</text><text x="8" y="112">96%</text><text x="8" y="155">94%</text></g><path class="target-line" d="M45 130H700"/><path d="M45 80C87 80 108 41 154 44S225 77 263 68S334 26 372 38S443 62 481 55S553 42 590 44S667 25 700 30V159H45Z" fill="url(#area)"/><path class="quality-line" d="M45 80C87 80 108 41 154 44S225 77 263 68S334 26 372 38S443 62 481 55S553 42 590 44S667 25 700 30"/><circle cx="700" cy="30" r="5" fill="#27896f" stroke="white" stroke-width="3"/><g class="axis-text"><text x="35" y="186">07 Th11</text><text x="137" y="186">08 Th11</text><text x="246" y="186">09 Th11</text><text x="355" y="186">10 Th11</text><text x="464" y="186">11 Th11</text><text x="573" y="186">12 Th11</text><text x="664" y="186">13 Th11</text></g></svg></div>`;
}
function datasetTable() {
  return `<div class="table-wrap"><table><thead><tr><th>TÊN DATASET</th><th>BẢN GHI</th><th>QUALITY SCORE</th><th>TRẠNG THÁI</th><th>CẬP NHẬT</th><th></th></tr></thead><tbody>${datasets.map(dataset => { const summary = summarize(rules.filter(rule => rule.dataset === dataset.id)); return `<tr><td><div class="dataset-name"><span class="table-icon ${dataset.color}">${icon('database')}</span><div><strong>${dataset.name}</strong><small>analytics · ${dataset.description}</small></div></div></td><td>${number(dataset.rows)}</td><td><div class="quality-cell"><span>${summary.score.toFixed(1)}%</span><div class="progress"><i style="width:${summary.score}%"></i></div></div></td><td>${dataset.id === 'orders' ? tag('● Cần chú ý', 'amber') : tag('● Khỏe mạnh')}</td><td class="muted">Hôm nay, ${dataset.updated}</td><td><button class="icon-button" aria-label="Xem ${dataset.name}" data-dataset="${dataset.id}">${icon('chevron')}</button></td></tr>`; }).join('')}</tbody></table></div>`;
}
function renderPage() {
  if (page === 'overview') return overview();
  if (page === 'sources') return `${pageHeading('Nguồn dữ liệu', 'Khảo sát schema, phân tích dữ liệu và hiểu rõ từng dataset.', action('connect', '+ Kết nối nguồn', 'btn primary'))}<div class="panel">${datasetTable()}</div><div class="note">${icon('database')} Demo workspace sử dụng 3 dataset giả lập. Click vào một bảng để xem profile dữ liệu.</div>`;
  if (page === 'rules') return `${pageHeading('Quality rules', 'AI đề xuất. Bạn kiểm soát. Chất lượng dữ liệu được đảm bảo.', action('export', `${icon('code')} Xuất dbt tests`, 'btn secondary') + action('approve-all', `${icon('check')} Duyệt tất cả`, 'btn primary'))}<div class="filter-bar"><div class="tabs">${[['all', 'Tất cả'], ['pending', 'Chờ duyệt'], ['approved', 'Đang hoạt động']].map(([id, label]) => `<button data-filter="${id}" class="${activeFilter === id ? 'selected' : ''}">${label} <span>${id === 'all' ? rules.length : rules.filter(rule => rule.status === id).length}</span></button>`).join('')}</div><label class="search">${icon('search')}<input id="rule-search" placeholder="Tìm rule, tên cột…" value="${escape(query)}"></label></div><div class="panel"><div class="table-wrap"><table><thead><tr><th>RULE / CỘT DỮ LIỆU</th><th>LOẠI KIỂM TRA</th><th>AI CONFIDENCE</th><th>TRẠNG THÁI</th><th>HÀNH ĐỘNG</th></tr></thead><tbody>${rules.filter(rule => (activeFilter === 'all' || rule.status === activeFilter) && `${rule.name} ${rule.column}`.toLowerCase().includes(query.toLowerCase())).map(rule => `<tr><td><strong>${rule.name}</strong><small class="cell-sub">${datasets.find(dataset => dataset.id === rule.dataset).name}.${rule.column}</small></td><td>${tag(rule.type, 'gray')}</td><td><span class="confidence">${icon('spark')} ${rule.confidence}%</span></td><td>${tag(rule.status === 'pending' ? 'Chờ duyệt' : 'Đang hoạt động', rule.status === 'pending' ? 'amber' : 'green')}</td><td><div class="row-actions"><button class="btn compact secondary" data-sql="${rule.id}">Xem SQL</button>${rule.status === 'pending' ? `<button class="btn compact primary" data-approve="${rule.id}">Duyệt</button>` : `<span class="muted">${icon('check')}</span>`}</div></td></tr>`).join('')}</tbody></table></div></div>`;
  if (page === 'anomalies') return `${pageHeading('Bất thường & chẩn đoán', 'Từ tín hiệu bất thường đến nguyên nhân có thể kiểm chứng.', tag('Statistical monitoring', 'green'))}<div class="anomaly-list">${incidents(rules).map(issue => `<article class="panel anomaly-card"><div class="issue-icon ${issue.severity === 'critical' ? 'red' : 'amber'}">${icon('pulse')}</div><div class="anomaly-body"><div class="inline-title"><h2>${issue.title}</h2>${tag(issue.severity === 'critical' ? 'Nghiêm trọng' : 'Cảnh báo', issue.severity === 'critical' ? 'red' : 'amber')}</div><p>analytics.${datasets.find(dataset => dataset.id === issue.dataset).name} <span class="sep">·</span> Phát hiện 13/11/2026, 10:27</p><div class="anomaly-tags">${tag(issue.metric, 'gray')}${tag(issue.id === 'revenue' ? 'So sánh baseline' : 'Kiểm định xác định', 'gray')}</div></div><button class="btn secondary" data-incident="${issue.id}">Chẩn đoán ${icon('arrow')}</button></article>`).join('')}</div>`;
  if (page === 'semantic') return `${pageHeading('Semantic & lineage', 'Cùng một định nghĩa. Cùng một sự thật trong toàn tổ chức.')}<div class="panel semantic-panel"><div class="panel-header"><h2>Revenue lineage</h2>${tag('Định nghĩa đã xác thực')}</div><div class="lineage">${[['database', 'raw.orders', 'Nguồn dữ liệu'], ['code', 'stg_orders', 'Chuẩn hóa · SQL AST'], ['layers', 'fct_orders', 'Mô hình phân tích'], ['pulse', 'net_revenue', 'Semantic metric']].map(([symbol, title, sub], index) => `${index ? `<span class="lineage-arrow">${icon('arrow')}</span>` : ''}<button class="lineage-node" data-action="metric">${icon(symbol)}<strong>${title}</strong><small>${sub}</small></button>`).join('')}</div><div class="semantic-definition"><span class="eyebrow">METRIC DEFINITION</span><h2>Doanh thu thuần <span class="tag gray">net_revenue</span></h2><pre>SUM(amount) WHERE status = 'completed' AND amount > 0</pre><p>Owner: Finance · Đơn vị: VND · Grain: ngày · Loại trừ đơn hủy và giá trị âm.</p></div></div><div class="note">${icon('layers')} Sơ đồ lineage và phân tích AST là minh họa UX. Định nghĩa revenue được áp dụng trực tiếp trên dữ liệu mẫu.</div>`;
  return `${pageHeading('Lịch sử chạy', 'Theo dõi các lần kiểm tra và kết quả của AI Agent.', action('scan', `${icon('play')} Chạy kiểm tra`, 'btn primary', scanning ? 'disabled' : ''))}<div class="panel"><div class="panel-header"><h2>Agent runs</h2>${tag('Read-only checks')}</div>${runHistory.length ? runHistory.map(run => `<div class="history-row"><span class="timeline-dot green">${icon('check')}</span><div><strong>${run.id}</strong><small>${run.time} · ${run.count} rules · 3 datasets</small></div>${tag('Hoàn thành')}<strong>${run.score}% quality</strong></div>`).join('') : '<div class="empty-state">Chưa có lần chạy trong phiên demo này. Nhấn “Chạy kiểm tra” để bắt đầu.</div>'}</div>`;
}
function toast(message) {
  const element = document.querySelector('#toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(element.timer);
  element.timer = setTimeout(() => element.classList.remove('show'), 3500);
}
function modal(title, body, wide = false) {
  document.querySelector('#overlay-root').innerHTML = `<div class="overlay"><section class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${escape(title)}"><div class="modal-heading"><h2>${title}</h2><button class="icon-button" data-action="close" aria-label="Đóng">${icon('close')}</button></div>${body}</section></div>`;
  document.querySelector('.modal button')?.focus();
}
function showIncident(id) {
  const issue = incidents(rules).find(item => item.id === id);
  if (!issue) return;
  const isRevenue = id === 'revenue';
  modal('Chẩn đoán bất thường', `<div class="diagnosis-heading">${tag(issue.severity === 'critical' ? 'Nghiêm trọng' : 'Cảnh báo', 'red')}<h3>${issue.title}</h3><p>analytics.${datasets.find(dataset => dataset.id === issue.dataset).name}</p></div><div class="diagnosis-stat"><span>Biến động quan sát được</span><strong>${issue.metric}</strong></div><div class="diagnosis-section"><h4>${icon('spark')} Phân tích của Agent</h4><p>${isRevenue ? `Doanh thu theo định nghĩa net_revenue đạt ${number(revenue().current)} VND, thấp hơn baseline mẫu 5,7 tỷ VND. Biến động vượt ngưỡng cảnh báo −20%.` : `Có ${issue.result.failed} / ${number(issue.result.total)} bản ghi vi phạm rule “${issue.result.name}”. Kết quả được kiểm tra trực tiếp trên fixture.`}</p></div><div class="diagnosis-section"><h4>${icon('layers')} Giả thuyết nguyên nhân</h4><p>${isRevenue ? 'Đơn hàng bị hủy hoặc amount không hợp lệ có thể làm giảm doanh thu. Cần đối chiếu phân bố trạng thái và dữ liệu nguồn để xác nhận; chưa đủ bằng chứng kết luận quan hệ nhân quả.' : 'Dữ liệu nguồn có thể chưa được chuẩn hóa hoặc pipeline nạp dữ liệu thiếu ràng buộc. Kiểm tra batch ingest gần nhất và logic xử lý khóa.'}</p><div class="mini-lineage">raw.orders → stg_orders → fct_orders</div></div><div class="diagnosis-section"><h4>${icon('check')} Hành động đề xuất</h4><p>Đối chiếu dữ liệu nguồn, kiểm tra pipeline và giao cho Data Owner xử lý trước khi chạy lại test.</p></div><div class="modal-actions">${action('close', 'Đóng', 'btn secondary')}${action('acknowledge', 'Ghi nhận cảnh báo', 'btn primary')}</div>`, true);
}
function startScan() {
  if (scanning) return;
  scanning = true;
  shell();
  modal('AI Agent đang làm việc', `<div class="scan-visual">${icon('spark')}</div><h3 class="center">Đang khảo sát workspace của bạn</h3><div class="scan-steps"><p id="scan-step">01 — Đọc schema và profile 3 dataset…</p><div class="scan-track"><i></i></div><small>Demo chạy kiểm tra trên dữ liệu mẫu có sẵn</small></div>`);
  let step = 0;
  scanTimer = setInterval(() => {
    step += 1;
    const el = document.querySelector('#scan-step');
    if (el) el.textContent = ['02 — Kiểm tra uniqueness, range và format…', '03 — Đối chiếu semantic metric và baseline…'][step - 1] || '04 — Hoàn tất phân tích';
    if (step === 3) {
      clearInterval(scanTimer);
      scanning = false;
      hasRun = true;
      const summary = summarize(rules);
      runHistory.unshift({ id: `RUN-${String(runHistory.length + 1).padStart(3, '0')}`, time: new Date().toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }), count: summary.active.length, score: summary.score.toFixed(1) });
      document.querySelector('#overlay-root').innerHTML = '';
      shell();
      toast(`Hoàn tất: ${summary.active.length} rule đã chạy · ${incidents(rules).length} bất thường được phát hiện`);
    }
  }, 800);
}
const actions = {
  close: () => document.querySelector('#overlay-root').innerHTML = '',
  scan: startScan,
  'approve-all': () => { const count = rules.filter(rule => rule.status === 'pending').length; rules.forEach(rule => rule.status = 'approved'); shell(); toast(count ? `Đã duyệt ${count} rule. Chạy Agent để kiểm tra.` : 'Tất cả rule đã được duyệt.'); },
  schedule: () => modal('Lịch kiểm tra tự động', `<p>Thiết lập chu kỳ giám sát cho workspace.</p><label class="field">Tần suất<select id="frequency"><option>Mỗi giờ</option><option>Mỗi 6 giờ</option><option>Mỗi ngày</option></select></label><label class="field">Kênh cảnh báo<select><option>Trong workspace</option><option>Email (minh họa)</option><option>Slack (minh họa)</option></select></label><div class="note">Cấu hình minh họa trong phiên demo; chưa có tác vụ nền.</div><div class="modal-actions">${action('save-schedule', 'Lưu cấu hình demo', 'btn primary')}</div>`),
  'save-schedule': () => { const frequency = document.querySelector('#frequency').value; actions.close(); toast(`Đã lưu cấu hình demo: ${frequency.toLowerCase()}`); },
  acknowledge: () => { actions.close(); toast('Đã ghi nhận cảnh báo trong phiên demo.'); },
  settings: () => modal('Workspace settings', '<div class="workspace-settings"><span class="workspace-icon">V</span><h3>VinUni workspace</h3><p>DATA-02 · Sentinel prototype</p><p>Vai trò: Data Engineer · Dữ liệu: fixtures local</p></div>'),
  connect: () => modal('Kết nối nguồn dữ liệu', `<p>Chọn nguồn dữ liệu để bắt đầu khảo sát.</p><div class="connector-grid">${['PostgreSQL', 'BigQuery', 'Snowflake', 'CSV / Excel'].map(name => `<button class="connector" data-action="demo-connection">${icon('database')}<strong>${name}</strong><small>Kết nối trong bản đầy đủ</small></button>`).join('')}</div><div class="note">Prototype đã nạp sẵn 3 dataset mẫu để demo ngay.</div>`),
  'demo-connection': () => toast('Đây là bản UX demo. Dùng 3 dataset có sẵn để khám phá các chức năng.'),
  metric: () => toast(`net_revenue = ${number(revenue().current)} VND · đã áp dụng định nghĩa semantic trên fixture`),
  export: () => {
    const active = rules.filter(rule => rule.status === 'approved');
    const yaml = `version: 2\n\nmodels:\n${datasets.map(dataset => `  - name: ${dataset.name}\n    columns:\n${active.filter(rule => rule.dataset === dataset.id).map(rule => `      - name: ${rule.column}\n        data_tests:\n          - ${rule.type === 'Uniqueness' ? 'unique' : rule.type === 'Not null' ? 'not_null' : `# ${rule.type}: xem file SQL tương ứng`}`).join('\n')}`).join('\n')}\n`;
    const sql = active.filter(rule => !['Uniqueness', 'Not null'].includes(rule.type)).map(rule => `-- tests/${rule.id}.sql\n${ruleSQL(rule)}`).join('\n\n');
    const blob = new Blob([yaml, '\n# SQL tests: tạo từng file trong thư mục tests/\n', sql], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'sentinel-dbt-tests-demo.txt'; anchor.click(); URL.revokeObjectURL(url);
    toast('Đã xuất bản nháp YAML + SQL để review.');
  },
};
document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) { if (event.target.classList.contains('overlay')) actions.close(); return; }
  const data = button.dataset;
  if (data.page) { page = data.page; query = ''; shell(); window.scrollTo(0, 0); }
  if (data.action) actions[data.action]?.();
  if (data.filter) { activeFilter = data.filter; shell(); }
  if (data.approve) { rules.find(rule => rule.id === data.approve).status = 'approved'; shell(); toast('Đã duyệt rule. Sẵn sàng chạy kiểm tra.'); }
  if (data.sql) { const rule = rules.find(rule => rule.id === data.sql); modal('SQL test được sinh tự động', `<p>${rule.name} ${tag(`${rule.confidence}% confidence`, 'green')}</p><pre>${escape(ruleSQL(rule))}</pre><div class="note">${icon('shield')} SELECT read-only · ${datasets.find(dataset => dataset.id === rule.dataset).name}</div><div class="modal-actions">${action('close', 'Đóng', 'btn primary')}</div>`); }
  if (data.incident) showIncident(data.incident);
  if (data.dataset) { const dataset = datasets.find(item => item.id === data.dataset); modal(`Dataset profile · ${dataset.name}`, `<p>${dataset.description} · Owner: ${dataset.owner}</p><div class="profile-stats"><div><strong>${number(dataset.rows)}</strong><small>Bản ghi</small></div><div><strong>${dataset.columns}</strong><small>Cột trong schema mẫu</small></div><div><strong>${(dataset.bytes / 1000000).toFixed(2)} MB</strong><small>Dung lượng mẫu</small></div></div><h4>Quality rules cho dataset</h4>${rules.filter(rule => rule.dataset === dataset.id).map(rule => `<div class="profile-rule"><span>${rule.column}</span>${tag(rule.type, 'gray')}${tag(rule.status === 'approved' ? 'Đang chạy' : 'Chờ duyệt', rule.status === 'approved' ? 'green' : 'amber')}</div>`).join('')}`); }
});
document.addEventListener('input', event => { if (event.target.id === 'rule-search') { const position = event.target.selectionStart; query = event.target.value; shell(); const input = document.querySelector('#rule-search'); input.focus(); input.setSelectionRange(position, position); } });
document.addEventListener('keydown', event => { if (event.key === 'Escape') actions.close(); });
shell();
