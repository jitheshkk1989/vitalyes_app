const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../public/js/registration-dashboard.js'), 'utf8');
const context = vm.createContext({
  escapeHtml: value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char])),
  formatAverage: value => value == null ? '—' : `${value} min`
});
vm.runInContext(source, context);

test('demo registration counts and trend buckets reconcile', () => {
  const report = context.registrationDemoReport();
  const data = report.registrationAnalytics;
  assert.equal(data.newConsultations + data.reviews + data.revisits + data.unclassified, data.bookings);
  for (const interval of Object.values(data.trends)) {
    assert.equal(interval.reduce((sum, item) => sum + item.value, 0), data.patientRegistrations);
  }
  for (const group of [report.demo.type, report.demo.channels, report.charts.gender, report.charts.ageGroups, report.charts.districts]) {
    assert.equal(group.reduce((sum, item) => sum + item.value, 0), data.bookings);
  }
  assert.equal(report.demo.registrationBilled, report.demo.registrationCollected + report.demo.registrationWaived);
  for (const provider of [...data.doctors, ...data.departments]) {
    assert.equal(provider.newConsultations + provider.reviews + provider.revisits + provider.unclassified, provider.total);
  }
});

test('preview is explicitly synthetic and report names are escaped', () => {
  const report = context.registrationDemoReport();
  report.registrationAnalytics.doctors[0].name = '<script>alert(1)</script>';
  const html = context.renderRegistrationDashboard(report, true);
  assert.match(html, /SYNTHETIC DEMO/);
  assert.match(html, /No patient records or transactions are created/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
});

test('live registration type uses new patient records and includes unclassified', () => {
  const report = context.registrationDemoReport();
  report.registrationAnalytics.registrationTypes = { OP: 2, IP: 1, ER: 0, Unclassified: 1 };
  report.registrationAnalytics.patientRegistrations = 4;
  const html = context.renderRegistrationDashboard(report, false);
  assert.match(html, /REGISTRATION TYPE \(NEW PATIENT RECORDS\)/);
  assert.match(html, /<strong>OP<\/strong> 2 <small>\(50\.0%\)/);
  assert.match(html, /<strong>Unclassified<\/strong> 1 <small>\(25\.0%\)/);
  assert.match(html, /IP\/ER workflows are not implemented/);
});
