const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { buildRegistrationAnalytics } = require('../utils/registration-analytics');

test('registration type counts include missing historical values', () => {
  const registrations = [
    { registrationType: 'OP' }, { registrationType: 'IP' },
    { registrationType: 'ER' }, {}, { registrationType: 'invalid' }
  ];
  const data = buildRegistrationAnalytics({
    registrations, reportPatients: registrations, appointments: [], previousAppointments: [],
    doctorName: String, departmentName: String
  });
  assert.deepEqual(data.registrationTypes, { OP: 1, IP: 1, ER: 1, Unclassified: 2 });
  assert.equal(Object.values(data.registrationTypes).reduce((a, b) => a + b, 0), data.patientRegistrations);
});

test('international phone identity and country-specific postal validation', async t => {
  const root = path.join(__dirname, '..');
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'vitalyes-patient-test-'));
  fs.mkdirSync(path.join(fixture, 'data'));
  fs.cpSync(path.join(root, 'server.js'), path.join(fixture, 'server.js'));
  fs.cpSync(path.join(root, 'utils'), path.join(fixture, 'utils'), { recursive: true });
  fs.cpSync(path.join(root, 'data/config.json'), path.join(fixture, 'data/config.json'));
  fs.cpSync(path.join(root, 'data/patients.json'), path.join(fixture, 'data/patients.json'));
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(fixture, 'node_modules'), 'dir');
  const listener = net.createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const env = { ...process.env, PORT: String(port), NODE_ENV: 'development' };
  for (const key of Object.keys(env)) if (key.startsWith('VITALYES_')) delete env[key];
  const child = spawn(process.execPath, ['server.js'], { cwd: fixture, env, stdio: 'ignore' });
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill();
      await once(child, 'exit');
    }
    fs.rmSync(fixture, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error('Test server exited unexpectedly');
    try {
      if ((await fetch(`${base}/api/health`)).ok) break;
    } catch (error) {
      if (i === 99) throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  async function request(route, body) {
    const response = await fetch(`${base}${route}`, body === undefined ? {} : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    return { status: response.status, data: await response.json() };
  }
  async function verify(mobile) {
    const sent = await request('/api/otp/send', { mobile });
    assert.equal(sent.status, 200);
    return request('/api/otp/verify', { mobile, otp: sent.data.prototypeOtp });
  }

  const geography = (await request('/api/geography')).data.data;
  assert.equal(geography.indiaStates.length, 36);
  assert.ok(geography.indiaStates.find(item => item.name === 'Kerala').districts.includes('Ernakulam'));
  assert.ok(geography.countries.some(item => item.code === 'GB' && item.callingCode === '+44'));
  assert.equal((await request('/api/otp/send', { mobile: '+123' })).status, 400);
  const existing = await verify('+919876543210');
  assert.equal(existing.data.isExistingPatient, true);
  assert.equal(existing.data.patient.mobile, '9876543210');
  const mrnOtp = await request('/api/identity/mrn', { mrn: existing.data.patient.mrn });
  assert.equal(mrnOtp.status, 200);
  const mrnVerification = await request('/api/identity/mrn/verify', { mrn: existing.data.patient.mrn, otp: mrnOtp.data.prototypeOtp });
  assert.equal(mrnVerification.data.isExistingPatient, true);

  const identity = await verify('+442079460123');
  assert.equal(identity.data.isExistingPatient, false);
  const patient = {
    sessionId: identity.data.sessionId, firstName: 'Test', lastName: 'Patient',
    dob: '1990-01-01', gender: 'Other', address: 'Example',
    postOffice: '', district: 'London', state: 'London', country: 'United Kingdom',
    pincode: '', registrationType: 'IP'
  };
  assert.equal((await request('/api/patients', { ...patient, registrationType: '' })).status, 400);
  assert.equal((await request('/api/patients', { ...patient, pincode: 'X'.repeat(21) })).status, 400);
  const registered = await request('/api/patients', patient);
  assert.equal(registered.status, 201);
  const stored = JSON.parse(fs.readFileSync(path.join(fixture, 'data/patients.json'), 'utf8'));
  assert.equal(stored.at(-1).mobile, '+442079460123');
  assert.equal(stored.at(-1).pincode, '');
  assert.equal(stored.at(-1).registrationType, 'IP');
  assert.equal((await verify('+442079460123')).data.isExistingPatient, true);
  const indian = await verify('+919876543219');
  const indiaPatient = { ...patient, sessionId: indian.data.sessionId, country: 'India', state: 'Kerala', district: 'Ernakulam', postOffice: 'Kochi', registrationType: 'OP' };
  const invalid = await request('/api/patients', { ...indiaPatient, pincode: '12345' });
  assert.equal(invalid.status, 400);
  assert.match(invalid.data.message, /6-digit PIN/);
  assert.equal((await request('/api/patients', { ...indiaPatient, pincode: 'ABC123' })).status, 400);
  assert.equal((await request('/api/patients', { ...indiaPatient, pincode: '682001' })).status, 201);
});
