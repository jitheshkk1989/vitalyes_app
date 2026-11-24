function buildRegistrationAnalytics({ registrations, reportPatients, appointments, previousAppointments, doctorName, departmentName }) {
  const categories = ['New Consultation', 'Review', 'Revisit'];
  const categoryKeys = new Map([['New Consultation', 'newConsultations'], ['Review', 'reviews'], ['Revisit', 'revisits']]);
  const rate = (numerator, denominator) => denominator ? Math.round(numerator / denominator * 1000) / 10 : null;
  const providers = (key, nameFor) => {
    const groups = new Map();
    for (const appointment of appointments) {
      const id = appointment[key] || 'Unknown';
      if (!groups.has(id)) groups.set(id, { id, name: nameFor(id), total: 0, patients: new Set(), newConsultations: 0, reviews: 0, revisits: 0, unclassified: 0 });
      const group = groups.get(id);
      group.total += 1;
      if (appointment.patientId) group.patients.add(appointment.patientId);
      const categoryKey = categoryKeys.get(appointment.visitCategory) || 'unclassified';
      group[categoryKey] += 1;
    }
    return [...groups.values()].map(({ patients, ...group }) => {
      const previous = previousAppointments.filter(item => (item[key] || 'Unknown') === group.id).length;
      return {
        ...group,
        patients: patients.size,
        growthPercent: previous ? Math.round((group.total - previous) / previous * 1000) / 10 : null
      };
    }).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  };
  const counts = Object.fromEntries(categories.map(category => [category, 0]));
  for (const appointment of appointments) {
    if (Object.hasOwn(counts, appointment.visitCategory)) counts[appointment.visitCategory] += 1;
  }
  const trends = {};
  const registrationTypes = { OP: 0, IP: 0, ER: 0, Unclassified: 0 };
  for (const patient of registrations) {
    const type = ['OP', 'IP', 'ER'].includes(patient.registrationType) ? patient.registrationType : 'Unclassified';
    registrationTypes[type] += 1;
  }
  for (const interval of ['daily', 'weekly', 'monthly', 'yearly']) {
    const buckets = {};
    for (const patient of registrations) {
      const date = String(patient.createdAt || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      let bucket = date;
      if (interval === 'weekly') {
        const monday = new Date(`${date}T00:00:00Z`);
        monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
        bucket = monday.toISOString().slice(0, 10);
      } else if (interval === 'monthly') bucket = date.slice(0, 7);
      else if (interval === 'yearly') bucket = date.slice(0, 4);
      buckets[bucket] = (buckets[bucket] || 0) + 1;
    }
    trends[interval] = Object.entries(buckets).sort(([a], [b]) => a.localeCompare(b))
      .map(([name, value]) => ({ name, value }));
  }
  return {
    patientRegistrations: registrations.length,
    registrationTypes,
    acquisitionPercent: rate(registrations.length, reportPatients.length),
    bookings: appointments.length,
    newConsultations: counts['New Consultation'],
    reviews: counts.Review,
    revisits: counts.Revisit,
    unclassified: appointments.length - Object.values(counts).reduce((sum, value) => sum + value, 0),
    reviewPercent: rate(counts.Review, appointments.length),
    revisitPercent: rate(counts.Revisit, appointments.length),
    trends,
    doctors: providers('doctorId', doctorName),
    departments: providers('department', departmentName)
  };
}

module.exports = { buildRegistrationAnalytics };
