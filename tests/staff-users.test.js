const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

test('prototype staff accounts persist and enforce configured roles', async t => {
  const root = path.join(__dirname, '..');
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'vitalyes-staff-test-'));
  fs.mkdirSync(path.join(fixture, 'data'));
  fs.cpSync(path.join(root, 'server.js'), path.join(fixture, 'server.js'));
  fs.cpSync(path.join(root, 'utils'), path.join(fixture, 'utils'), { recursive: true });
  fs.cpSync(path.join(root, 'data/config.json'), path.join(fixture, 'data/config.json'));
  fs.cpSync(path.join(root, 'data/patients.json'), path.join(fixture, 'data/patients.json'));
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(fixture, 'node_modules'), 'dir');
  let child;
  t.after(async () => {
    if (child && child.exitCode === null) {
      child.kill();
      await once(child, 'exit');
    }
    fs.rmSync(fixture, { recursive: true, force: true });
  });

  async function start(mode = 'development') {
    const listener = net.createServer();
    await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
    const port = listener.address().port;
    await new Promise(resolve => listener.close(resolve));
    const env = { ...process.env, PORT: String(port), NODE_ENV: mode };
    for (const key of Object.keys(env)) if (key.startsWith('VITALYES_')) delete env[key];
    child = spawn(process.execPath, ['server.js'], { cwd: fixture, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error(`Test server exited: ${child.exitCode}`);
      try {
        const response = await fetch(`${base}/api/health`);
        if (response.ok) return base;
      } catch (error) {
        if (i === 99) throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error('Test server did not become ready');
  }
  async function stop() {
    child.kill();
    await once(child, 'exit');
    child = null;
  }
  async function request(base, route, { body, cookie, method = body ? 'POST' : 'GET' } = {}) {
    const response = await fetch(`${base}${route}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    return { status: response.status, cookie: response.headers.get('set-cookie')?.split(';')[0], data: await response.json() };
  }

  let base = await start();
  assert.equal((await request(base, '/api/admin/users')).status, 401);
  const admin = await request(base, '/api/auth/local-login', { body: { username: 'admin', password: 'admin' } });
  assert.equal(admin.status, 200);
  const person = { name: 'Test Staff', username: 'Test.Staff', password: 'example-password-123', roles: ['Department Head'], departmentIds: ['GEN'] };
  assert.equal((await request(base, '/api/admin/users', { cookie: admin.cookie, body: { ...person, departmentIds: [] } })).status, 400);
  assert.equal((await request(base, '/api/admin/users', { cookie: admin.cookie, body: person })).status, 201);
  assert.equal((await request(base, '/api/admin/users', { cookie: admin.cookie, body: person })).status, 409);
  const manager = { name: 'Test Manager', username: 'test.manager', password: 'manager-password-123', roles: ['Hospital Administration'], departmentIds: [] };
  assert.equal((await request(base, '/api/admin/users', { cookie: admin.cookie, body: manager })).status, 201);
  const stored = fs.readFileSync(path.join(fixture, 'data/staff-users.json'), 'utf8');
  assert.ok(!stored.includes(person.password));
  assert.equal(fs.statSync(path.join(fixture, 'data/staff-users.json')).mode & 0o777, 0o600);
  const listing = await request(base, '/api/admin/users', { cookie: admin.cookie });
  assert.equal(listing.data.data[0].username, 'test.staff');
  assert.equal(JSON.stringify(listing.data).includes('passwordHash'), false);
  assert.equal((await request(base, '/api/auth/local-login', { body: { username: 'test.staff', password: 'wrong' } })).status, 401);
  const login = await request(base, '/api/auth/local-login', { body: { username: 'TEST.STAFF', password: person.password } });
  assert.equal(login.status, 200);
  const session = await request(base, '/api/auth/session', { cookie: login.cookie });
  assert.deepEqual(session.data.staff.departmentIds, ['GEN']);
  assert.equal(session.data.staff.reportView, 'department');
  assert.equal((await request(base, '/api/admin/users', { cookie: login.cookie })).status, 403);
  assert.equal((await request(base, '/api/admin/config', { cookie: login.cookie })).status, 403);
  const managerLogin = await request(base, '/api/auth/local-login', { body: { username: manager.username, password: manager.password } });
  assert.equal(managerLogin.status, 200);
  assert.equal((await request(base, '/api/admin/config', { cookie: managerLogin.cookie })).status, 200);
  assert.equal((await request(base, '/api/admin/logout', { cookie: managerLogin.cookie, method: 'POST' })).status, 200);
  assert.equal((await request(base, '/api/admin/config', { cookie: managerLogin.cookie })).status, 401);
  assert.equal((await request(base, '/api/admin/login', { cookie: managerLogin.cookie, body: { username: manager.username, password: manager.password } })).status, 200);
  assert.equal((await request(base, '/api/admin/config', { cookie: managerLogin.cookie })).status, 200);

  const cashier = { name: 'Cashier', username: 'cashier', password: 'cashier-password-123', roles: ['Front Office'], departmentIds: [] };
  assert.equal((await request(base, '/api/admin/users', { cookie: admin.cookie, body: cashier })).status, 201);
  const otp = await request(base, '/api/otp/send', { body: { mobile: '9876543210' } });
  const identity = await request(base, '/api/otp/verify', { body: { mobile: '9876543210', otp: otp.data.prototypeOtp } });
  const patientSession = identity.data.sessionId;
  const dates = (await request(base, '/api/dates')).data.data;
  let date;
  let slot;
  for (const candidate of dates) {
    const slots = await request(base, `/api/slots?doctorId=DOC-01&date=${candidate}`);
    if (slots.data.data.length) {
      date = candidate;
      slot = slots.data.data[0];
      break;
    }
  }
  assert.ok(slot);
  const invoice = await request(base, '/api/invoices', { body: { sessionId: patientSession, doctorId: 'DOC-01', slotId: slot.id, appointmentDate: date, visitIntent: 'new' } });
  assert.equal(invoice.status, 201);
  const payment = await request(base, '/api/payments/initiate', { body: { sessionId: patientSession, invoiceId: invoice.data.invoice.id, paymentMethod: 'cash_counter' } });
  assert.equal(payment.status, 200);
  const paymentId = payment.data.payment.id;
  const confirmation = { sessionId: patientSession, paymentId, outcome: 'success' };
  const credentials = { sessionId: patientSession, paymentId, username: cashier.username, password: cashier.password };
  assert.equal((await request(base, '/api/payments/confirm', { body: confirmation })).status, 401);
  assert.equal((await request(base, '/api/payments/counter-authorize', { body: { ...credentials, password: 'wrong' } })).status, 401);
  assert.equal((await request(base, '/api/payments/counter-authorize', { body: { ...credentials, username: manager.username, password: manager.password } })).status, 403);
  const grant = await request(base, '/api/payments/counter-authorize', { body: credentials });
  assert.equal(grant.status, 200);
  assert.equal(grant.cookie, undefined);
  assert.equal((await request(base, '/api/auth/session')).data.staff, null);
  assert.equal((await request(base, '/api/payments/confirm', { body: { ...confirmation, sessionId: 'other', counterAuthorization: grant.data.authorization } })).status, 401);
  assert.equal((await request(base, '/api/payments/confirm', { body: { ...confirmation, counterAuthorization: 'invalid' } })).status, 401);
  const configPath = path.join(fixture, 'data/config.json');
  const originalConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const changedConfig = structuredClone(originalConfig);
  changedConfig.roles.find(role => role.name === 'Front Office').permissions =
    changedConfig.roles.find(role => role.name === 'Front Office').permissions.filter(permission => permission !== 'payment:collect');
  fs.writeFileSync(configPath, JSON.stringify(changedConfig));
  assert.equal((await request(base, '/api/payments/confirm', { body: { ...confirmation, counterAuthorization: grant.data.authorization } })).status, 401);
  fs.writeFileSync(configPath, JSON.stringify(originalConfig));
  const confirmed = await request(base, '/api/payments/confirm', { body: { ...confirmation, counterAuthorization: grant.data.authorization } });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.data.payment.status, 'success');
  assert.equal((await request(base, '/api/payments/confirm', { body: { ...confirmation, counterAuthorization: grant.data.authorization } })).status, 409);

  const nextSlots = await request(base, `/api/slots?doctorId=DOC-01&date=${date}`);
  const secondInvoice = await request(base, '/api/invoices', { body: { sessionId: patientSession, doctorId: 'DOC-01', slotId: nextSlots.data.data[0].id, appointmentDate: date, visitIntent: 'new' } });
  assert.equal(secondInvoice.status, 201);
  const secondPayment = await request(base, '/api/payments/initiate', { body: { sessionId: patientSession, invoiceId: secondInvoice.data.invoice.id, paymentMethod: 'cash_counter' } });
  const secondConfirmation = { sessionId: patientSession, paymentId: secondPayment.data.payment.id, outcome: 'success' };
  assert.equal((await request(base, '/api/payments/confirm', { body: { ...secondConfirmation, counterAuthorization: grant.data.authorization } })).status, 401);
  const cashierLogin = await request(base, '/api/auth/local-login', { body: { username: cashier.username, password: cashier.password } });
  assert.equal(cashierLogin.status, 200);
  assert.equal((await request(base, '/api/payments/confirm', { body: secondConfirmation, cookie: cashierLogin.cookie })).status, 200);

  await stop();
  base = await start();
  const persisted = await request(base, '/api/auth/local-login', { body: { username: 'test.staff', password: person.password } });
  assert.equal(persisted.status, 200);
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.roles = config.roles.filter(role => role.name !== 'Department Head');
  fs.writeFileSync(configPath, JSON.stringify(config));
  assert.equal((await request(base, '/api/auth/session', { cookie: persisted.cookie })).data.staff, null);
  for (let i = 0; i < 10; i++) {
    assert.equal((await request(base, '/api/auth/local-login', { body: { username: 'unknown', password: 'bad' } })).status, 401);
  }
  assert.equal((await request(base, '/api/auth/local-login', { body: { username: 'admin', password: 'admin' } })).status, 429);
  await stop();
  base = await start('production');
  assert.equal((await request(base, '/api/auth/local-login', { body: { username: 'test.staff', password: person.password } })).status, 403);
  assert.equal((await request(base, '/api/payments/counter-authorize', { body: credentials })).status, 403);
});
