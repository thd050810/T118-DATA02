export const referenceTime = new Date('2026-11-13T10:30:00+07:00');

export const datasets = [
  { id: 'orders', name: 'fct_orders', schema: 'analytics', rows: 12480, columns: 12, bytes: 3993600, owner: 'Commerce', updated: '10:25', description: 'Đơn hàng & doanh thu', color: 'green' },
  { id: 'customers', name: 'dim_customers', schema: 'analytics', rows: 4821, columns: 9, bytes: 1157040, owner: 'Growth', updated: '10:20', description: 'Hồ sơ khách hàng', color: 'purple' },
  { id: 'payments', name: 'fct_payments', schema: 'analytics', rows: 12360, columns: 8, bytes: 2472000, owner: 'Finance', updated: '10:22', description: 'Giao dịch thanh toán', color: 'blue' },
];

export const fixtures = {
  orders: Array.from({ length: 12480 }, (_, index) => ({
    order_id: index >= 12456 ? index - 12456 : index,
    customer_id: index < 168 ? null : index % 4821,
    amount: index < 18 ? -10000 : 180000 + (index % 23) * 15000,
    status: index % 10 === 0 ? 'cancelled' : 'completed',
    updated_at: '2026-11-13T10:25:00+07:00',
  })),
  customers: Array.from({ length: 4821 }, (_, index) => ({
    customer_id: index,
    email: index < 36 ? 'invalid-format' : `customer-${index}@example.test`,
  })),
  payments: Array.from({ length: 12360 }, (_, index) => ({ payment_id: index, amount: 280000 })),
};

export const initialRules = [
  { id: 'r1', name: 'Mỗi đơn hàng là duy nhất', dataset: 'orders', column: 'order_id', type: 'Uniqueness', status: 'approved', confidence: 99, severity: 'critical' },
  { id: 'r2', name: 'Giá trị đơn hàng hợp lệ', dataset: 'orders', column: 'amount', type: 'Range', status: 'approved', confidence: 98, severity: 'warning' },
  { id: 'r3', name: 'Dữ liệu cập nhật trong 1 giờ', dataset: 'orders', column: 'updated_at', type: 'Freshness', status: 'approved', confidence: 97, severity: 'warning' },
  { id: 'r4', name: 'Email đúng định dạng', dataset: 'customers', column: 'email', type: 'Format', status: 'approved', confidence: 99, severity: 'warning' },
  { id: 'r5', name: 'Mã thanh toán là duy nhất', dataset: 'payments', column: 'payment_id', type: 'Uniqueness', status: 'approved', confidence: 99, severity: 'critical' },
  { id: 'r6', name: 'Đơn hàng phải có khách hàng', dataset: 'orders', column: 'customer_id', type: 'Not null', status: 'pending', confidence: 98, severity: 'warning' },
  { id: 'r7', name: 'Mã khách hàng là duy nhất', dataset: 'customers', column: 'customer_id', type: 'Uniqueness', status: 'pending', confidence: 96, severity: 'critical' },
  { id: 'r8', name: 'Thanh toán lớn hơn 0', dataset: 'payments', column: 'amount', type: 'Range', status: 'pending', confidence: 97, severity: 'warning' },
];

export function evaluateRule(rule) {
  const rows = fixtures[rule.dataset];
  const values = rows.map(row => row[rule.column]);
  let failed = 0;
  if (rule.type === 'Uniqueness') failed = values.length - new Set(values).size;
  if (rule.type === 'Not null') failed = values.filter(value => value == null).length;
  if (rule.type === 'Range') failed = values.filter(value => value == null || value <= 0).length;
  if (rule.type === 'Format') failed = values.filter(value => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value ?? '')).length;
  if (rule.type === 'Freshness') {
    const lastUpdate = Math.max(...values.map(value => Date.parse(value)));
    failed = referenceTime.getTime() - lastUpdate > 3600000 ? rows.length : 0;
  }
  return { failed, total: rows.length, rate: failed / rows.length * 100, passed: failed === 0 };
}

export function ruleSQL(rule) {
  const table = `analytics.${datasets.find(dataset => dataset.id === rule.dataset).name}`;
  const column = rule.column;
  const queries = {
    'Uniqueness': `SELECT ${column}, COUNT(*) AS occurrences\nFROM ${table}\nGROUP BY ${column}\nHAVING COUNT(*) > 1;`,
    'Not null': `SELECT COUNT(*) AS failed_rows\nFROM ${table}\nWHERE ${column} IS NULL;`,
    'Range': `SELECT COUNT(*) AS failed_rows\nFROM ${table}\nWHERE ${column} <= 0 OR ${column} IS NULL;`,
    'Format': `SELECT COUNT(*) AS failed_rows\nFROM ${table}\nWHERE ${column} IS NULL\n   OR NOT REGEXP_LIKE(${column},\n     '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$');`,
    'Freshness': `SELECT MAX(${column}) AS latest_update\nFROM ${table}\nHAVING MAX(${column}) <\n  CURRENT_TIMESTAMP - INTERVAL '1 hour';`,
  };
  return queries[rule.type];
}

export function preflight(rule, { role = 'steward', budget = 8, sql = ruleSQL(rule) } = {}) {
  const trustedRule = initialRules.find(item => item.id === rule.id);
  const valid = Boolean(trustedRule && ruleSQL(trustedRule) === sql);
  const dataset = datasets.find(item => item.id === rule.dataset);
  const megabytes = dataset ? dataset.bytes / 1000000 : Infinity;
  return {
    allowed: valid && role === 'steward' && megabytes <= budget,
    checks: [
      { name: 'SQL template', detail: valid ? 'Khớp template SELECT cho phép' : 'SQL ngoài danh sách cho phép', passed: valid },
      { name: 'Quyền thực thi', detail: role === 'steward' ? 'Data Steward · read-only fixture' : 'Viewer không có quyền chạy check', passed: role === 'steward' },
      { name: 'Ngân sách quét', detail: `${megabytes.toFixed(2)} MB / ${budget} MB`, passed: megabytes <= budget },
    ],
    megabytes,
  };
}

export function summarize(rules) {
  const active = rules.filter(rule => rule.status === 'approved');
  const results = active.map(rule => ({ ...rule, ...evaluateRule(rule) }));
  const total = results.reduce((sum, result) => sum + result.total, 0);
  const failed = results.reduce((sum, result) => sum + result.failed, 0);
  return { active, results, score: total ? 100 * (1 - failed / total) : 100, failed, total };
}

export function revenue() {
  const current = fixtures.orders.reduce((sum, row) => sum + (row.status === 'completed' && row.amount > 0 ? row.amount : 0), 0);
  const baseline = 5700000000;
  return { current, baseline, change: (current - baseline) / baseline * 100 };
}

export function incidents(rules) {
  const issues = summarize(rules).results.filter(result => !result.passed).map(result => ({
    id: result.id,
    title: result.type === 'Uniqueness' ? 'Phát hiện mã đơn hàng trùng lặp' : result.type === 'Not null' ? 'Tỷ lệ thiếu customer_id tăng' : result.type === 'Format' ? 'Email không đúng định dạng' : 'Giá trị đơn hàng ngoài phạm vi',
    dataset: result.dataset,
    severity: result.severity,
    metric: `${result.failed.toLocaleString('vi-VN')} bản ghi`,
    result,
  }));
  const metric = revenue();
  if (metric.change < -20) issues.unshift({ id: 'revenue', title: 'Doanh thu giảm bất thường', dataset: 'orders', severity: 'critical', metric: `${metric.change.toFixed(1)}%`, result: metric });
  return issues;
}
