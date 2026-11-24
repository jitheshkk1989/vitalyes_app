function registrationDemoReport() {
  const total = 12846;
  const newPatients = 5620;
  const weights = [38, 42, 39, 45, 43, 40, 44, 41, 39, 45, 42, 40, 44, 43, 41, 46, 42, 40, 43, 42, 45, 41, 40, 44, 43, 41, 45, 42, 44, 46];
  const sum = weights.reduce((a, b) => a + b, 0);
  const daily = weights.map((weight, index) => ({
    name: `2026-11-${String(index + 1).padStart(2, '0')}`,
    value: Math.floor(weight / sum * newPatients)
  }));
  daily[daily.length - 1].value += newPatients - daily.reduce((count, item) => count + item.value, 0);
  const providers = [
    { name: 'General Medicine', total: 2184, patients: 1990, newConsultations: 928, reviews: 546, revisits: 710, unclassified: 0, growthPercent: 8.2 },
    { name: 'Cardiology', total: 1986, patients: 1810, newConsultations: 824, reviews: 482, revisits: 680, unclassified: 0, growthPercent: 5.4 },
    { name: 'Orthopedics', total: 1472, patients: 1360, newConsultations: 640, reviews: 362, revisits: 470, unclassified: 0, growthPercent: 4.1 },
    { name: 'Pediatrics', total: 1132, patients: 1080, newConsultations: 486, reviews: 274, revisits: 372, unclassified: 0, growthPercent: 6.8 },
    { name: 'Gynecology', total: 1084, patients: 1002, newConsultations: 460, reviews: 258, revisits: 366, unclassified: 0, growthPercent: 3.9 }
  ];
  return {
    period: { startDate: '2026-11-01', endDate: '2026-11-30' },
    summary: { averageRegistrationMinutes: 2.3, averageWaitingMinutes: 5.4 },
    registrationAnalytics: {
      patientRegistrations: 5620, acquisitionPercent: 43.7, bookings: total,
      newConsultations: 5620, reviews: 3146, revisits: 4080, unclassified: 0,
      reviewPercent: 24.5, revisitPercent: 31.8,
      trends: {
        daily,
        weekly: [{ name: '2026-10-26', value: daily[0].value }, ...[1, 8, 15, 22, 29].map(start => ({
          name: daily[start].name, value: daily.slice(start, start + 7).reduce((count, item) => count + item.value, 0)
        }))],
        monthly: [{ name: '2026-11', value: newPatients }],
        yearly: [{ name: '2026', value: newPatients }]
      },
      departments: providers,
      doctors: [
        { name: 'Dr. Ananya Reddy', total: 1248, patients: 1160, newConsultations: 552, reviews: 318, revisits: 378, unclassified: 0, growthPercent: 8.2 },
        { name: 'Dr. Vikram Singh', total: 1102, patients: 1020, newConsultations: 486, reviews: 272, revisits: 344, unclassified: 0, growthPercent: 6.5 },
        { name: 'Dr. Meera Iyer', total: 976, patients: 910, newConsultations: 428, reviews: 230, revisits: 318, unclassified: 0, growthPercent: 5.1 },
        { name: 'Dr. Suresh Nair', total: 912, patients: 850, newConsultations: 408, reviews: 212, revisits: 292, unclassified: 0, growthPercent: 3.8 },
        { name: 'Dr. Kavita Desai', total: 846, patients: 795, newConsultations: 382, reviews: 198, revisits: 266, unclassified: 0, growthPercent: 2.6 }
      ]
    },
    charts: {
      gender: [{ name: 'Male', value: 6742 }, { name: 'Female', value: 6104 }, { name: 'Other', value: 0 }],
      ageGroups: [{ name: '0–14', value: 1079 }, { name: '15–24', value: 1490 }, { name: '25–34', value: 2428 }, { name: '35–44', value: 3147 }, { name: '45–54', value: 2222 }, { name: '55–64', value: 1529 }, { name: '65+', value: 951 }],
      districts: [{ name: 'Ernakulam', value: 5472 }, { name: 'Thrissur', value: 2749 }, { name: 'Kottayam', value: 1143 }, { name: 'Idukki', value: 809 }, { name: 'Other', value: 2673 }]
    },
    demo: {
      type: [{ name: 'OP', value: 11632 }, { name: 'IP', value: 942 }, { name: 'ER', value: 272 }],
      channels: [{ name: 'Walk-in', value: 8790 }, { name: 'Online', value: 2261 }, { name: 'Kiosk', value: 1118 }, { name: 'Referral', value: 677 }],
      registrationBilled: 1000000, registrationCollected: 653000, registrationWaived: 347000,
      queueMinutes: 5.4, counterUtilization: 81
    }
  };
}

function registrationNumber(value) {
  return Number(value).toLocaleString('en-IN');
}

function registrationDonut(rows, center, caption) {
  const colors = ['#0786e9', '#19bf6a', '#f8c52b', '#a653e8', '#e96aae'];
  const total = rows.reduce((sum, item) => sum + item.value, 0);
  let offset = 0;
  const stops = rows.map((item, index) => {
    const start = offset;
    offset += total ? item.value / total * 100 : 0;
    return `${colors[index % colors.length]} ${start}% ${offset}%`;
  });
  return `<div class="rd-donut-layout"><div class="rd-donut" style="background:${total ? `conic-gradient(${stops.join(',')})` : '#e5eef5'}"><div><strong>${escapeHtml(center)}</strong><span>${escapeHtml(caption)}</span></div></div><div class="rd-legend">${rows.map((item, index) =>
    `<div><i style="background:${colors[index % colors.length]}"></i><span>${escapeHtml(item.name)}</span><strong>${registrationNumber(item.value)}</strong><small>${total ? (item.value / total * 100).toFixed(1) : '0.0'}%</small></div>`).join('')}</div></div>`;
}

function registrationTrendChart(rows) {
  if (!rows.length) return '<p class="rd-empty">No registrations in the selected range.</p>';
  const width = 560;
  const height = 145;
  const max = Math.max(1, ...rows.map(item => item.value));
  const points = rows.map((item, index) => {
    const x = rows.length === 1 ? width / 2 : 30 + index * (width - 45) / (rows.length - 1);
    const y = 12 + (1 - item.value / max) * (height - 35);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const label = rows.length === 1 ? rows[0].name : `${rows[0].name} — ${rows[rows.length - 1].name}`;
  return `<svg class="rd-line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Registration trend, ${escapeHtml(label)}. Peak ${registrationNumber(max)}.">
    <line x1="30" y1="12" x2="545" y2="12"/><line x1="30" y1="62" x2="545" y2="62"/><line x1="30" y1="112" x2="545" y2="112"/>
    <polyline points="${points}"/><text x="30" y="139">${escapeHtml(rows[0].name)}</text>${rows.length > 1 ? `<text x="545" y="139" text-anchor="end">${escapeHtml(rows[rows.length - 1].name)}</text>` : ''}
  </svg><div class="rd-trend-summary"><span><i></i> New patient registrations</span><strong>Peak ${registrationNumber(max)}</strong></div>`;
}

function registrationBars(rows) {
  if (!rows?.length) return '<p class="rd-empty">No data in the selected range.</p>';
  const max = Math.max(1, ...rows.map(item => item.value));
  return `<div class="rd-bars">${rows.slice(0, 7).map(item => `<div><span title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span><div><i style="width:${item.value / max * 100}%"></i></div><strong>${registrationNumber(item.value)}</strong></div>`).join('')}</div>`;
}

function registrationProviderTable(title, rows) {
  return `<section class="rd-card rd-provider"><h3>${escapeHtml(title)}</h3><div class="table-wrap"><table><thead><tr><th>Name</th><th>Bookings</th><th>Patients</th><th>New consult.</th><th>Review</th><th>Revisit</th><th>Unclassified</th><th>Growth</th></tr></thead><tbody>${rows.length ? rows.slice(0, 5).map(item =>
    `<tr><td>${escapeHtml(item.name)}</td><td>${registrationNumber(item.total)}</td><td>${registrationNumber(item.patients)}</td><td>${registrationNumber(item.newConsultations)}</td><td>${registrationNumber(item.reviews)}</td><td>${registrationNumber(item.revisits)}</td><td>${registrationNumber(item.unclassified)}</td><td>${item.growthPercent === null ? '—' : `${item.growthPercent}%`}</td></tr>`).join('') : '<tr><td colspan="8">No bookings in the selected range.</td></tr>'}</tbody></table></div></section>`;
}

function renderRegistrationDashboard(report, demo = false) {
  const data = report.registrationAnalytics;
  const percent = value => value === null ? 'No data' : `${value}%`;
  const demoData = report.demo;
  const metrics = [
    ['▦', 'Appointment bookings', registrationNumber(data.bookings), 'All statuses', 'blue'],
    ['✚', 'New patient records', registrationNumber(data.patientRegistrations), `${percent(data.acquisitionPercent)} of report patients`, 'green'],
    ['◷', 'New consultations', registrationNumber(data.newConsultations), 'Not necessarily first visits', 'cyan'],
    ['✓', 'Review bookings', registrationNumber(data.reviews), `${percent(data.reviewPercent)} of bookings`, 'yellow'],
    ['↻', 'Revisit bookings', registrationNumber(data.revisits), `${percent(data.revisitPercent)} of bookings`, 'purple']
  ];
  const categories = [{ name: 'New consultation', value: data.newConsultations }, { name: 'Review', value: data.reviews }, { name: 'Revisit', value: data.revisits }, { name: 'Unclassified', value: data.unclassified }];
  const demographics = report.charts.gender;
  return `<section class="registration-dashboard">
    <div class="rd-title"><div><span class="rd-eyebrow">PATIENT REGISTRATION ANALYTICS</span><h2>Registration Overview</h2><p>Patient registration performance, mix and operational insights</p></div><div class="rd-title-meta"><span>${demo ? 'SYNTHETIC DEMO' : 'LIVE PROTOTYPE DATA'}</span><strong>${escapeHtml(report.period.startDate)} — ${escapeHtml(report.period.endDate)}</strong></div></div>
    ${demo ? '<div class="rd-demo-notice"><strong>Demo preview only.</strong> All figures are fictional, fixed examples; the real report filters do not apply. No patient records or transactions are created.</div>' : '<div class="rd-demo-notice rd-live-notice">Patient records use creation date; booking mix uses appointment date and includes all statuses. New consultations are not necessarily first-time patients.</div>'}
    <div class="rd-kpis">${metrics.map(([icon, label, value, detail, color]) => `<div class="rd-kpi rd-${color}"><span class="rd-kpi-icon" aria-hidden="true">${icon}</span><div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></div></div>`).join('')}</div>
    <div class="rd-types"><span>REGISTRATION TYPE (${demo ? 'DEMO BOOKINGS' : 'NEW PATIENT RECORDS'})</span>${(demo ? demoData.type : Object.entries(data.registrationTypes).map(([name, value]) => ({ name, value }))).map(item => {
      const total = demo ? data.bookings : data.patientRegistrations;
      return `<div><strong>${escapeHtml(item.name)}</strong> ${registrationNumber(item.value)} <small>(${total ? (item.value / total * 100).toFixed(1) : '0.0'}%)</small></div>`;
    }).join('')}</div>
    <div class="rd-top-grid">
      <section class="rd-card rd-trend"><div class="rd-card-heading"><div><h3>Registration Trend</h3><p>New patient records</p></div><label>Group by <select id="registration-trend-interval"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></label></div><div id="registration-trend-chart">${registrationTrendChart(data.trends.daily)}</div></section>
      <section class="rd-card"><div class="rd-card-heading"><div><h3>Booking Mix</h3><p>All appointment statuses</p></div></div>${registrationDonut(categories, registrationNumber(data.bookings), 'bookings')}</section>
      <section class="rd-card rd-operations"><div class="rd-card-heading"><div><h3>Operational Metrics</h3><p>Time and capacity</p></div></div><div><span>Registration flow time</span><strong>${formatAverage(report.summary.averageRegistrationMinutes)}</strong></div><div><span>Patient wait to consultation</span><strong>${formatAverage(report.summary.averageWaitingMinutes)}</strong></div><div><span>Registration queue wait</span><strong>${demo ? formatAverage(demoData.queueMinutes) : 'Unavailable'}</strong></div><div><span>Counter utilisation</span><strong>${demo ? `${demoData.counterUtilization}%` : 'Unavailable'}</strong></div><p class="rd-footnote">${demo ? 'Illustrative timings and utilisation.' : 'Flow time measures identity start to patient creation. Patient wait is not registration queue wait.'}</p></section>
    </div>
    <div class="rd-provider-grid">${registrationProviderTable('Top Departments by Bookings', data.departments)}${registrationProviderTable('Top Doctors by Bookings', data.doctors)}</div>
    <div class="rd-bottom-grid">
      <section class="rd-card"><div class="rd-card-heading"><div><h3>Patient Demographics</h3><p>Distinct report patients</p></div></div>${demographics ? registrationDonut(demographics, registrationNumber(demographics.reduce((sum, item) => sum + item.value, 0)), 'patients') : '<p class="rd-empty">Not available for this report role.</p>'}</section>
      <section class="rd-card"><div class="rd-card-heading"><div><h3>Age Groups</h3><p>Distinct report patients</p></div></div>${report.charts.ageGroups ? registrationBars(report.charts.ageGroups) : '<p class="rd-empty">Not available for this report role.</p>'}</section>
      <section class="rd-card"><div class="rd-card-heading"><div><h3>Registration Channel</h3><p>Channel distribution</p></div></div>${demo ? registrationDonut(demoData.channels, registrationNumber(data.bookings), 'bookings') : '<p class="rd-empty">Unavailable — registration channels are not recorded.</p>'}</section>
      <section class="rd-card"><div class="rd-card-heading"><div><h3>Patient Geography</h3><p>District / available profile data</p></div></div>${report.charts.districts ? registrationBars(report.charts.districts) : '<p class="rd-empty">Not available for this report role.</p>'}</section>
    </div>
    <section class="rd-revenue"><div><span class="rd-revenue-icon">₹</span><strong>Registration Revenue<br><small>&amp; Waivers</small></strong></div><div><span>Registration charge billed</span><strong>${demo ? `₹${registrationNumber(demoData.registrationBilled)}` : 'Unavailable'}</strong></div><div><span>Registration charge collected</span><strong>${demo ? `₹${registrationNumber(demoData.registrationCollected)}` : 'Unavailable'}</strong></div><div><span>Registration fee waived</span><strong>${demo ? `₹${registrationNumber(demoData.registrationWaived)}` : 'Unavailable'}</strong></div></section>
    <p class="rd-footnote">${demo ? 'All figures on this preview are synthetic.' : 'Registration type is captured for new patient records; older records without a type are unclassified. IP/ER workflows are not implemented. Channels, registration queue, counters, staff, conversion and charge-level collections or waivers are not available in the current data. Acquisition is new patient records / distinct report patients; review and revisit rates use all bookings. Booking growth compares an equally long prior period.'} Weekly trend buckets start on Monday; periods with no registrations are omitted.</p>
  </section>`;
}
