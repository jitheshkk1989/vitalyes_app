const test = require('node:test');
const assert = require('node:assert/strict');
const { buildRegistrationAnalytics } = require('../utils/registration-analytics');

const names = { doctorName: id => `Doctor ${id}`, departmentName: id => `Department ${id}` };

test('aggregates registration trends, booking categories and prior-period growth', () => {
  const registrations = [
    { id: 'p1', createdAt: '2026-01-01T10:00:00Z' },
    { id: 'p2', createdAt: '2026-01-05T10:00:00Z' }
  ];
  const appointments = [
    { patientId: 'p1', doctorId: 'd1', department: 'a', visitCategory: 'New Consultation' },
    { patientId: 'p1', doctorId: 'd1', department: 'a', visitCategory: 'Review' },
    { patientId: 'p2', doctorId: 'd2', department: 'a', visitCategory: 'Revisit' },
    { patientId: 'p3', doctorId: 'd2', department: 'b' }
  ];
  const result = buildRegistrationAnalytics({
    registrations, appointments, reportPatients: [...registrations, { id: 'p3' }],
    previousAppointments: [{ doctorId: 'd1', department: 'a' }], ...names
  });
  assert.equal(result.acquisitionPercent, 66.7);
  assert.equal(result.reviewPercent, 25);
  assert.equal(result.revisitPercent, 25);
  assert.equal(result.unclassified, 1);
  assert.deepEqual(result.trends.weekly, [{ name: '2025-12-29', value: 1 }, { name: '2026-01-05', value: 1 }]);
  assert.deepEqual(result.trends.monthly, [{ name: '2026-01', value: 2 }]);
  assert.deepEqual(result.trends.yearly, [{ name: '2026', value: 2 }]);
  assert.equal(result.doctors[0].patients, 1);
  assert.equal(result.doctors[0].growthPercent, 100);
  assert.equal(result.departments[0].growthPercent, 200);
  assert.equal(result.departments[1].growthPercent, null);
});

test('reports absent denominators rather than fabricating rates', () => {
  const result = buildRegistrationAnalytics({
    registrations: [], reportPatients: [], appointments: [], previousAppointments: [], ...names
  });
  assert.equal(result.acquisitionPercent, null);
  assert.equal(result.reviewPercent, null);
  assert.equal(result.revisitPercent, null);
  assert.deepEqual(result.trends.daily, []);
  assert.deepEqual(result.doctors, []);
});
