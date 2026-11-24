/**
 * Vitalyes Patient Registration & Invoicing – Interactive Prototype
 * Node.js HTTP server, OIDC staff authentication, ExcelJS reports, and JSON storage
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { promisify } = require('util');
const { URL } = require('url');
const ExcelJS = require('exceljs');
const { Issuer, generators } = require('openid-client');
const { getCountries, getCountryCallingCode, parsePhoneNumberFromString } = require('libphonenumber-js');
const { getAllStatesWithDistricts } = require('india-state-district');
const { buildRegistrationAnalytics } = require('./utils/registration-analytics');

// Simple ID generator (no uuid package needed)
function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const STAFF_SESSION_COOKIE = 'vitalyes_staff';
const STAFF_SESSION_SECONDS = 60 * 60;
const OIDC_TRANSACTION_SECONDS = 5 * 60;
const staffSessions = new Map();
const adminUnlocks = new Map();
const oidcTransactions = new Map();
const loginAttempts = new Map();
const scrypt = promisify(crypto.scrypt);
let oidcClientPromise;

function loginAttemptState(req) {
  const now = Date.now();
  for (const [key, entry] of loginAttempts) if (entry.expiresAt <= now) loginAttempts.delete(key);
  const address = req.socket.remoteAddress || 'unknown';
  const attempt = loginAttempts.get(address);
  return { address, attempt, blocked: attempt ? attempt.count >= 10 : loginAttempts.size >= 5000 };
}

function recordFailedLogin(address, attempt) {
  const entry = attempt || { count: 0, expiresAt: Date.now() + 15 * 60 * 1000 };
  entry.count++;
  loginAttempts.set(address, entry);
}

function readStaffUsers() {
  const file = path.join(DATA_DIR, 'staff-users.json');
  let contents;
  try {
    contents = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const users = JSON.parse(contents);
  if (!Array.isArray(users)) throw new Error('Invalid staff user database');
  return users;
}

function writeStaffUsers(users) {
  const file = path.join(DATA_DIR, 'staff-users.json');
  const temp = `${file}.${crypto.randomBytes(8).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temp, `${JSON.stringify(users, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    fs.renameSync(temp, file);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}

async function passwordHash(password, salt) {
  return (await scrypt(password, salt, 64)).toString('hex');
}

function localStaffPrincipal(user) {
  const config = getConfig();
  const roles = config.roles.filter(role => user.roles.includes(role.name));
  const departmentIds = user.departmentIds.filter(id => config.departments.some(department => department.id === id));
  if (roles.length !== user.roles.length || !roles.length ||
      roles.some(role => role.permissions.includes('report:department')) && !departmentIds.length) return null;
  return {
    name: user.name, roles: roles.map(role => role.name),
    permissions: [...new Set(roles.flatMap(role => role.permissions))],
    departmentIds, hospitalCode: config.hospitalCode, subject: `local:${user.username}`
  };
}

async function authenticateLocalUser(username, password) {
  if (typeof username !== 'string' || typeof password !== 'string' || username.length > 64 || password.length > 256) return null;
  const user = readStaffUsers().find(item => item.username === username.trim().toLowerCase());
  const salt = user?.salt || '00000000000000000000000000000000';
  const calculated = await passwordHash(password, salt);
  if (!user || typeof user.passwordHash !== 'string' || !constantTimeStringMatch(user.passwordHash, calculated)) return null;
  return localStaffPrincipal(user);
}

// ---------- Simple JSON DB helpers ----------
function readJson(filename, fallback = []) {
  const filePath = path.join(DATA_DIR, filename);
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return fallback;
  }
}

function writeJson(filename, data) {
  const filePath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function writeConfig(data) {
  const filePath = path.join(DATA_DIR, 'config.json');
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, filePath);
}

function isValidTime(value) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function validateTimeRanges(ranges, label, allowEmpty = false) {
  if (!Array.isArray(ranges) || (!allowEmpty && ranges.length === 0)) {
    return `${label} must contain at least one time range`;
  }
  for (const range of ranges) {
    if (!range || !isValidTime(range.start) || !isValidTime(range.end) || range.start >= range.end) {
      return `${label} must use valid HH:MM start and end times`;
    }
  }
  return null;
}

function validateConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return 'Configuration must be an object';
  if (!String(config.hospitalName || '').trim() || !String(config.hospitalCode || '').trim()) {
    return 'Hospital name and code are required';
  }
  if (!String(config.country || '').trim()) return 'Hospital country is required';
  try {
    new Intl.DateTimeFormat('en', { timeZone: config.timeZone }).format(new Date());
  } catch {
    return 'Hospital time zone must be a valid IANA time zone';
  }
  if (!/^[A-Z]{3}$/.test(config.currency || '') || !String(config.currencySymbol || '').trim()) {
    return 'Currency must be a three-letter uppercase code with a symbol';
  }
  if (!Array.isArray(config.languages) || config.languages.length === 0 ||
      config.languages.some(item => !item || !/^[a-z]{2}(-[A-Z]{2})?$/.test(item.code || '') || !String(item.label || '').trim()) ||
      new Set(config.languages.map(item => item.code)).size !== config.languages.length) {
    return 'Languages need unique valid codes and labels';
  }
  if (!Array.isArray(config.departments) ||
      config.departments.some(item => !item || !String(item.id || '').trim() || !String(item.name || '').trim()) ||
      new Set(config.departments.map(item => item.id)).size !== config.departments.length) {
    return 'Departments need unique IDs and names';
  }
  if (!Array.isArray(config.doctors) ||
      config.doctors.some(item => !item || !String(item.id || '').trim() || !String(item.code || '').trim() ||
        !String(item.name || '').trim() || !config.departments.some(department => department.id === item.department) ||
        !Number.isFinite(Number(item.fee)) || Number(item.fee) < 0) ||
      new Set(config.doctors.map(item => item.id)).size !== config.doctors.length ||
      new Set(config.doctors.map(item => item.code)).size !== config.doctors.length) {
    return 'Doctors need unique IDs/codes, names, valid departments, and non-negative fees';
  }
  for (const doctor of config.doctors) {
    const schedule = doctor.schedule;
    if (!schedule || !Array.isArray(schedule.workingDays) || schedule.workingDays.length === 0 ||
        schedule.workingDays.some(day => !Number.isInteger(day) || day < 0 || day > 6) ||
        !Number.isInteger(Number(schedule.slotDurationMinutes)) || Number(schedule.slotDurationMinutes) < 1 ||
        !Number.isInteger(Number(schedule.capacityPerSlot)) || Number(schedule.capacityPerSlot) < 1) {
      return `Doctor ${doctor.name} needs working days, a positive slot duration, and positive capacity`;
    }
    const sessionError = validateTimeRanges(schedule.sessions, `Doctor ${doctor.name} sessions`);
    if (sessionError) return sessionError;
    const breakError = validateTimeRanges(schedule.breaks || [], `Doctor ${doctor.name} breaks`, true);
    if (breakError) return breakError;
    if (!Array.isArray(schedule.unavailableDates || []) ||
        (schedule.unavailableDates || []).some(date => !isValidDate(date))) {
      return `Doctor ${doctor.name} has an invalid unavailable date`;
    }
    if (!Array.isArray(schedule.specialWorkingDays || [])) return `Doctor ${doctor.name} special days must be a list`;
    for (const specialDay of schedule.specialWorkingDays || []) {
      if (!specialDay || !isValidDate(specialDay.date)) return `Doctor ${doctor.name} has an invalid special working date`;
      const specialSessionError = validateTimeRanges(specialDay.sessions, `Doctor ${doctor.name} special-day sessions`);
      if (specialSessionError) return specialSessionError;
      for (const key of ['slotDurationMinutes', 'capacityPerSlot']) {
        if (specialDay[key] !== undefined && (!Number.isInteger(Number(specialDay[key])) || Number(specialDay[key]) < 1)) {
          return `Doctor ${doctor.name} special-day ${key} must be positive`;
        }
      }
    }
  }
  if (!config.charges || ['registrationFee', 'consultationBase', 'tokenFee'].some(key =>
    !Number.isFinite(Number(config.charges[key])) || Number(config.charges[key]) < 0)) {
    return 'Registration, consultation, and token charges must be non-negative amounts';
  }
  if (!config.reviewRules || !Number.isInteger(Number(config.reviewRules.freeReviewDays)) ||
      Number(config.reviewRules.freeReviewDays) < 1 ||
      !['calendar_days_inclusive', 'calendar_days_exclusive'].includes(config.reviewRules.countingRule)) {
    return 'Review rules need a positive period and a supported calendar-day counting rule';
  }
  if (!['{doctorCode}', '{DDMMYY}', '{sequence}'].every(part => String(config.tokenFormat || '').includes(part))) {
    return 'Token format must include {doctorCode}, {DDMMYY}, and {sequence}';
  }
  if (!config.paymentConfig || config.paymentConfig.mode !== 'simulated' ||
      !Array.isArray(config.paymentConfig.enabledMethods) ||
      config.paymentConfig.enabledMethods.some(method => !['upi', 'card', 'netBanking', 'cash'].includes(method))) {
    return 'Payment settings must use simulated mode and supported payment methods';
  }
  if (!Array.isArray(config.roles) || config.roles.some(role =>
    !role || !String(role.name || '').trim() || !Array.isArray(role.permissions) ||
    role.permissions.some(permission => typeof permission !== 'string' || !permission.trim()) ||
    (role.oidcGroups !== undefined &&
      (!Array.isArray(role.oidcGroups) || role.oidcGroups.some(group => typeof group !== 'string' || !group.trim()))))) {
    return 'Roles need names, permission identifiers, and optional OIDC group mappings';
  }
  if (!config.reportConfig || !Array.isArray(config.reportConfig.enabledReports) ||
      config.reportConfig.enabledReports.some(report => typeof report !== 'string')) {
    return 'Report settings must contain a list of enabled report names';
  }
  const targetMetrics = ['footfall', 'registrations', 'appointments', 'collectedAmount', 'newPatients'];
  const targetPeriods = ['daily', 'weekly', 'monthly', 'quarterly', 'annual'];
  if (!Array.isArray(config.reportConfig.targets) ||
      config.reportConfig.targets.some(target =>
        !target || !targetMetrics.includes(target.metric) || !targetPeriods.includes(target.period) ||
        typeof target.value !== 'number' || !Number.isFinite(target.value) || target.value < 0)) {
    return 'Report targets need a supported metric, period, and non-negative value';
  }
  const schedules = config.reportConfig.schedules;
  if (!Array.isArray(schedules) ||
      schedules.some(schedule =>
        !schedule || typeof schedule.id !== 'string' || !/^[a-z0-9-]+$/i.test(schedule.id) ||
        typeof schedule.name !== 'string' || !schedule.name.trim() ||
        typeof schedule.enabled !== 'boolean' || !targetPeriods.includes(schedule.frequency) ||
        !isValidTime(schedule.time) ||
        (schedule.departmentId && !config.departments.some(department => department.id === schedule.departmentId)) ||
        (schedule.doctorId && !config.doctors.some(doctor => doctor.id === schedule.doctorId)) ||
        (schedule.departmentId && schedule.doctorId &&
          !config.doctors.some(doctor => doctor.id === schedule.doctorId && doctor.department === schedule.departmentId))) ||
      new Set(schedules.map(schedule => schedule.id)).size !== schedules.length) {
    return 'Report schedules need unique IDs, names, enabled flags, valid frequencies, and HH:MM times';
  }
  const targetKeys = (config.reportConfig.targets || []).map(target => `${target.metric}|${target.period}`);
  if (new Set(targetKeys).size !== targetKeys.length) return 'Report targets must be unique for each metric and period';
  return null;
}

function isLoopbackRequest(req) {
  const address = String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  const hostHeader = String(req.headers.host || '').toLowerCase();
  const hostname = hostHeader.startsWith('[')
    ? hostHeader.slice(1, hostHeader.indexOf(']'))
    : hostHeader.split(':')[0];
  const localHost = hostname === 'localhost' || hostname === '::1' || /^127\./.test(hostname);
  return localHost && (address === '::1' || /^127\./.test(address));
}

function adminCredentialsConfigured(req) {
  const hasUsername = !!process.env.VITALYES_ADMIN_USERNAME;
  const hasPassword = !!process.env.VITALYES_ADMIN_PASSWORD;
  return hasUsername && hasPassword ||
    (!hasUsername && !hasPassword && process.env.NODE_ENV !== 'production' && isLoopbackRequest(req));
}

function demoAdminLoginAvailable(req) {
  return process.env.NODE_ENV !== 'production' && isLoopbackRequest(req) && adminCredentialsConfigured(req);
}

function constantTimeStringMatch(expected, candidate) {
  const expectedHash = crypto.createHash('sha256').update(expected).digest();
  const candidateHash = crypto.createHash('sha256').update(candidate).digest();
  return crypto.timingSafeEqual(expectedHash, candidateHash);
}

function adminCredentialsMatch(req, username, password) {
  if (!adminCredentialsConfigured(req) || typeof username !== 'string' || typeof password !== 'string') return false;
  const configuredUsername = process.env.VITALYES_ADMIN_USERNAME || 'admin';
  const configuredPassword = process.env.VITALYES_ADMIN_PASSWORD || 'admin';
  const usernameMatches = constantTimeStringMatch(configuredUsername, username);
  const passwordMatches = constantTimeStringMatch(configuredPassword, password);
  return usernameMatches && passwordMatches;
}

function demoAdminPrincipal() {
  const config = getConfig();
  const role = (config.roles || []).find(candidate =>
    candidate.permissions.includes('config:manage') || candidate.permissions.includes('hospital:configure'));
  if (!role) return null;
  return {
    name: 'Local Demo Administrator',
    roles: [role.name],
    permissions: role.permissions,
    departmentIds: [],
    hospitalCode: config.hospitalCode,
    subject: 'local-demo-admin'
  };
}

function adminSessionIsUnlocked(req) {
  const token = readCookie(req, STAFF_SESSION_COOKIE);
  const unlock = adminUnlocks.get(token);
  if (!unlock) return false;
  if (unlock.expiresAt <= Date.now()) {
    adminUnlocks.delete(token);
    return false;
  }
  return true;
}

function oidcSettings() {
  return {
    issuerUrl: process.env.VITALYES_OIDC_ISSUER_URL,
    clientId: process.env.VITALYES_OIDC_CLIENT_ID,
    clientSecret: process.env.VITALYES_OIDC_CLIENT_SECRET,
    callbackUrl: process.env.VITALYES_OIDC_CALLBACK_URL,
    scope: process.env.VITALYES_OIDC_SCOPE || 'openid profile email',
    roleClaim: process.env.VITALYES_OIDC_ROLE_CLAIM || 'groups',
    departmentClaim: process.env.VITALYES_OIDC_DEPARTMENT_CLAIM || 'department_ids',
    hospitalClaim: process.env.VITALYES_OIDC_HOSPITAL_CLAIM || 'hospital_codes'
  };
}

function oidcIsConfigured() {
  const settings = oidcSettings();
  return !!(settings.issuerUrl && settings.clientId && settings.clientSecret && settings.callbackUrl);
}

function getOidcClient() {
  if (!oidcIsConfigured()) throw new Error('Staff sign-in is not configured');
  if (!oidcClientPromise) {
    const settings = oidcSettings();
    const issuerUrl = new URL(settings.issuerUrl);
    const callbackUrl = new URL(settings.callbackUrl);
    const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
    if ((issuerUrl.protocol !== 'https:' || callbackUrl.protocol !== 'https:') &&
        (process.env.NODE_ENV === 'production' || !localHosts.has(issuerUrl.hostname) || !localHosts.has(callbackUrl.hostname))) {
      throw new Error('OIDC issuer and callback must use HTTPS outside localhost development');
    }
    oidcClientPromise = Issuer.discover(settings.issuerUrl).then(issuer => new issuer.Client({
      client_id: settings.clientId,
      client_secret: settings.clientSecret,
      redirect_uris: [settings.callbackUrl],
      response_types: ['code']
    })).catch(error => {
      oidcClientPromise = null;
      throw error;
    });
  }
  return oidcClientPromise;
}

function claimAtPath(claims, pathValue) {
  return String(pathValue || '').split('.').filter(Boolean).reduce((value, part) => value?.[part], claims);
}

function claimValues(value) {
  if (Array.isArray(value)) return value.filter(item => typeof item === 'string').map(item => item.trim()).filter(Boolean);
  return typeof value === 'string' && value.trim() ? [value.trim()] : [];
}

function readCookie(req, name) {
  const cookies = String(req.headers.cookie || '').split(';');
  const entry = cookies.map(item => item.trim()).find(item => item.startsWith(`${name}=`));
  return entry ? entry.slice(name.length + 1) : '';
}

function staffPrincipal(req) {
  const token = readCookie(req, STAFF_SESSION_COOKIE);
  const session = staffSessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    staffSessions.delete(token);
    return null;
  }
  if (session.principal.subject?.startsWith('local:')) {
    const username = session.principal.subject.slice(6);
    const user = readStaffUsers().find(item => item.username === username);
    const principal = user && localStaffPrincipal(user);
    if (!principal) {
      staffSessions.delete(token);
      adminUnlocks.delete(token);
      return null;
    }
    session.principal = principal;
  }
  session.expiresAt = Date.now() + STAFF_SESSION_SECONDS * 1000;
  return session.principal;
}

function requireStaffPermission(req, res, allowedPermissions) {
  const principal = staffPrincipal(req);
  if (!principal) {
    console.warn(`[AUTH] Unauthenticated request denied: ${req.method} ${new URL(req.url, 'http://localhost').pathname}`);
    sendJson(res, 401, { success: false, message: 'Staff sign-in is required' });
    return null;
  }
  if (!allowedPermissions.some(permission => principal.permissions.includes(permission))) {
    console.warn(`[AUTH] Permission denied for configured roles: ${req.method} ${new URL(req.url, 'http://localhost').pathname}`);
    sendJson(res, 403, { success: false, message: 'Your staff role does not allow this action' });
    return null;
  }
  return principal;
}

function staffView(principal) {
  const permissionSet = new Set(principal.permissions);
  return {
    authenticated: true,
    name: principal.name,
    roles: principal.roles,
    permissions: principal.permissions,
    departmentIds: principal.departmentIds,
    hospitalCode: principal.hospitalCode,
    reportView: permissionSet.has('report:strategic') ? 'strategic'
      : permissionSet.has('report:finance') ? 'finance'
        : permissionSet.has('report:hospital') ? 'hospital'
          : permissionSet.has('report:department') ? 'department' : null,
    canViewDailyReport: permissionSet.has('report:daily'),
    canManageSettings: permissionSet.has('config:manage') || permissionSet.has('hospital:configure')
  };
}

function setStaffCookie(res, token, maxAge) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${STAFF_SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`);
}

function mapStaffIdentity(claims) {
  const settings = oidcSettings();
  const config = getConfig();
  const groups = new Set(claimValues(claimAtPath(claims, settings.roleClaim)));
  const assignedDepartments = new Set(
    claimValues(claimAtPath(claims, settings.departmentClaim))
      .filter(id => config.departments?.some(department => department.id === id))
  );
  const hospitalCodes = claimValues(claimAtPath(claims, settings.hospitalClaim));
  if (!hospitalCodes.includes(config.hospitalCode)) {
    return { error: 'hospital_scope' };
  }

  const mappedRoles = (config.roles || []).filter(role =>
    Array.isArray(role.oidcGroups) && role.oidcGroups.some(group => groups.has(group)) &&
    (!role.permissions.includes('report:department') || assignedDepartments.size > 0)
  );
  const permissions = [...new Set(mappedRoles.flatMap(role => role.permissions))];
  if (!mappedRoles.length || !permissions.length) return { error: 'unmapped_role' };

  return {
    principal: {
      name: claims.name || claims.preferred_username || claims.email || 'Vitalyes staff',
      roles: mappedRoles.map(role => role.name),
      permissions,
      departmentIds: [...assignedDepartments],
      hospitalCode: config.hospitalCode,
      subject: claims.sub
    }
  };
}

function projectedAnalyticsReport(report, principal) {
  const permissions = new Set(principal.permissions);
  if (permissions.has('report:strategic')) return report;

  const common = {
    generatedAt: report.generatedAt,
    period: report.period,
    filters: report.filters
  };
  if (permissions.has('report:finance')) {
    return {
      ...common,
      view: 'finance',
      summary: Object.fromEntries([
        'invoicedAmount', 'collectedAmount', 'failedPayments', 'refunds',
        'averageRevenuePerConsultation', 'freeReviewEstimatedValue'
      ].map(key => [key, report.summary[key]])),
      charts: {
        trends: report.charts.trends.map(({ period, collected }) => ({ period, collected })),
        departments: report.charts.departments.map(({ name, invoiced, collected }) => ({ name, invoiced, collected })),
        doctors: report.charts.doctors.map(({ name, invoiced, collected }) => ({ name, invoiced, collected })),
        paymentMethods: report.charts.paymentMethods,
        visitCategoryRevenue: report.charts.visitCategoryRevenue
      }
    };
  }

  const operationSummary = Object.fromEntries([
    'footfall', 'registrations', 'newPatients', 'existingPatients', 'appointments',
    'pendingConsultations', 'newConsultations', 'reviews', 'revisits', 'cancelled',
    'noShows', 'tokens', 'noShowPercent', 'averageRegistrationMinutes',
    'averageWaitingMinutes', 'averageAppointmentDelayMinutes', 'averageConsultationMinutes',
    'patientRetentionPercent', 'repeatConsultations'
  ].map(key => [key, report.summary[key]]));
  const charts = {
    trends: report.charts.trends.map(({ period, registrations, footfall, appointments }) =>
      ({ period, registrations, footfall, appointments })),
    departments: report.charts.departments.map(({ name, appointments, completed, capacity, utilizationPercent, unutilizedSlots, growthPercent }) =>
      ({ name, appointments, completed, capacity, utilizationPercent, unutilizedSlots, growthPercent })),
    doctors: report.charts.doctors.map(({ name, appointments, completed, capacity, utilizationPercent, unutilizedSlots, growthPercent }) =>
      ({ name, appointments, completed, capacity, utilizationPercent, unutilizedSlots, growthPercent })),
    hourlyScheduledAppointments: report.charts.hourlyScheduledAppointments,
    hourlyActualArrivals: report.charts.hourlyActualArrivals,
    visitCategories: report.charts.visitCategories,
    periodComparisons: report.charts.periodComparisons.filter(item => !/collection|revenue/i.test(item.name))
  };

  const departmentView = permissions.has('report:department') &&
    !permissions.has('report:hospital') && !permissions.has('report:finance');
  if (departmentView) {
    Object.assign(charts, {
      ageGroups: report.charts.ageGroups,
      newAgeGroups: report.charts.newAgeGroups,
      returningAgeGroups: report.charts.returningAgeGroups,
      gender: report.charts.gender,
      ageGender: report.charts.ageGender,
      ageDepartment: report.charts.ageDepartment,
      districts: report.charts.districts,
      states: report.charts.states
    });
  }

  return {
    ...common,
    view: departmentView ? 'department' : 'hospital',
    summary: operationSummary,
    charts,
    registrationAnalytics: report.registrationAnalytics
  };
}

function getPatients() { return readJson('patients.json', []); }
function savePatients(data) { writeJson('patients.json', data); }
function getConfig() { return readJson('config.json', {}); }
function getInvoices() { return readJson('invoices.json', []); }
function saveInvoices(data) { writeJson('invoices.json', data); }
function getPayments() { return readJson('payments.json', []); }
function savePayments(data) { writeJson('payments.json', data); }
function getTokens() { return readJson('tokens.json', []); }
function saveTokens(data) { writeJson('tokens.json', data); }
function getAppointments() { return readJson('appointments.json', []); }
function saveAppointments(data) { writeJson('appointments.json', data); }
function getConsultations() { return readJson('consultations.json', []); }
function getFunnelEvents() { return readJson('funnel-events.json', []); }
function getScheduledReports() { return readJson('scheduled-reports.json', []); }
function recordFunnelEvent(journeyId, stage) {
  const events = getFunnelEvents();
  events.push({ journeyId, stage, occurredAt: new Date().toISOString() });
  writeJson('funnel-events.json', events);
}

function findPatientByMobile(mobile) {
  return getPatients().find(p => normalizePhone(p.mobile) === normalizePhone(mobile)) || null;
}
function normalizePhone(value, country = 'IN') {
  if (typeof value !== 'string' || !/^\+?[1-9]\d{3,14}$/.test(value)) return null;
  const phone = parsePhoneNumberFromString(value, country);
  return phone?.isPossible() ? phone.number : null;
}

function geographicOptions() {
  const names = new Intl.DisplayNames(['en'], { type: 'region' });
  return {
    countries: getCountries().map(code => ({ code, name: names.of(code), callingCode: `+${getCountryCallingCode(code)}` }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    indiaStates: getAllStatesWithDistricts().map(item => ({
      name: item.name.trim(), districts: [...new Set(item.districts.map(name => name.trim()))].sort()
    })).sort((a, b) => a.name.localeCompare(b.name))
  };
}
function findPatientById(id) {
  return getPatients().find(p => p.id === id) || null;
}

function createPatient(patientData) {
  const patients = getPatients();
  const nextNum = patients.length + 1001;
  const id = `PAT-${nextNum}`;
  const mrn = `MRN-2024-${String(nextNum).padStart(3, '0')}`;
  const now = new Date().toISOString();
  const patient = { id, mrn, ...patientData, createdAt: now, updatedAt: now };
  patients.push(patient);
  savePatients(patients);
  return patient;
}

function createInvoice(invoiceData) {
  const invoices = getInvoices();
  const nextNum = invoices.length + 1;
  const invoiceNumber = `INV-${new Date().getFullYear()}-${String(nextNum).padStart(5, '0')}`;
  const now = new Date().toISOString();
  const invoice = {
    id: `INV-${Date.now()}`,
    invoiceNumber,
    status: 'created',
    ...invoiceData,
    createdAt: now,
    updatedAt: now
  };
  invoices.push(invoice);
  saveInvoices(invoices);
  return invoice;
}

function updateInvoice(id, updates) {
  const invoices = getInvoices();
  const idx = invoices.findIndex(i => i.id === id);
  if (idx === -1) return null;
  invoices[idx] = { ...invoices[idx], ...updates, updatedAt: new Date().toISOString() };
  saveInvoices(invoices);
  return invoices[idx];
}

function createPayment(paymentData) {
  const payments = getPayments();
  const now = new Date().toISOString();
  const payment = {
    id: `PAY-${Date.now()}`,
    status: 'pending',
    ...paymentData,
    createdAt: now,
    updatedAt: now
  };
  payments.push(payment);
  savePayments(payments);
  return payment;
}

function updatePayment(id, updates) {
  const payments = getPayments();
  const idx = payments.findIndex(p => p.id === id);
  if (idx === -1) return null;
  payments[idx] = { ...payments[idx], ...updates, updatedAt: new Date().toISOString() };
  savePayments(payments);
  return payments[idx];
}

function createToken(tokenData) {
  const tokens = getTokens();
  const date = tokenData.appointmentDate;
  const datePart = date.slice(8, 10) + date.slice(5, 7) + date.slice(2, 4);
  const doctor = (getConfig().doctors || []).find(d => d.id === tokenData.doctorId);
  const code = doctor?.code || tokenData.doctorId;
  const prefix = `${code}-${datePart}-`;
  const nextNum = tokens.filter(t => t.tokenNumber && t.tokenNumber.startsWith(prefix)).length + 1;
  const tokenNumber = `${prefix}${String(nextNum).padStart(3, '0')}`;
  const token = {
    id: `TOK-${Date.now()}`,
    tokenNumber,
    status: 'active',
    ...tokenData,
    createdAt: new Date().toISOString()
  };
  tokens.push(token);
  saveTokens(tokens);
  return token;
}

function getDoctor(config, doctorId) {
  return (config.doctors || []).find(doctor => doctor.id === doctorId);
}

function isValidDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function localDateString(date = new Date()) {
  const timeZone = getConfig().timeZone || 'Asia/Kolkata';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function hospitalDateTime(date, time, timeZone) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const targetUtc = Date.UTC(year, month - 1, day, hour, minute);
  let timestamp = targetUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(new Date(timestamp));
    const values = Object.fromEntries(parts.map(part => [part.type, Number(part.value)]));
    const representedUtc = Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute, values.second);
    const adjustment = targetUtc - representedUtc;
    timestamp += adjustment;
    if (adjustment === 0) break;
  }
  return new Date(timestamp);
}

function getSlots(doctor, date) {
  const schedule = doctor?.schedule;
  if (!schedule || !isValidDate(date)) return [];
  const timeZone = getConfig().timeZone || 'Asia/Kolkata';
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  const isException = (schedule.unavailableDates || []).includes(date);
  const specialDay = (schedule.specialWorkingDays || []).find(item => item.date === date);
  if (isException || (!specialDay && !(schedule.workingDays || []).includes(day))) return [];

  const appointments = getAppointments().filter(appointment =>
    appointment.doctorId === doctor.id &&
    appointment.appointmentDate === date &&
    (appointment.status === 'confirmed' ||
      (appointment.status === 'pending_payment' && Date.parse(appointment.holdExpiresAt || 0) > Date.now()))
  );
  const duration = Number(specialDay?.slotDurationMinutes || schedule.slotDurationMinutes) || 30;
  const capacity = Number(specialDay?.capacityPerSlot || schedule.capacityPerSlot) || 1;
  const now = new Date();
  const slots = [];

  for (const session of specialDay?.sessions || schedule.sessions || []) {
    const [startHour, startMinute] = session.start.split(':').map(Number);
    const [endHour, endMinute] = session.end.split(':').map(Number);
    let minuteOfDay = startHour * 60 + startMinute;
    const sessionEnd = endHour * 60 + endMinute;

    while (minuteOfDay + duration <= sessionEnd) {
      const time = `${String(Math.floor(minuteOfDay / 60)).padStart(2, '0')}:${String(minuteOfDay % 60).padStart(2, '0')}`;
      const slotEnd = minuteOfDay + duration;
      const overlapsBreak = (specialDay?.breaks || schedule.breaks || []).some(breakTime => {
        const [breakStartHour, breakStartMinute] = breakTime.start.split(':').map(Number);
        const [breakEndHour, breakEndMinute] = breakTime.end.split(':').map(Number);
        const breakStart = breakStartHour * 60 + breakStartMinute;
        const breakEnd = breakEndHour * 60 + breakEndMinute;
        return minuteOfDay < breakEnd && slotEnd > breakStart;
      });
      const booked = appointments.filter(appointment => appointment.appointmentTime === time).length;
      const slotDateTime = hospitalDateTime(date, time, timeZone);
      if (!overlapsBreak && booked < capacity && slotDateTime > now) {
        slots.push({
          id: `SLOT-${doctor.id}-${date}-${time}`,
          date,
          time,
          display: time,
          availableCapacity: capacity - booked
        });
      }
      minuteOfDay += duration;
    }
  }
  return slots;
}

function classifyVisit(patientId, doctorId, requestedType, appointmentDate, config) {
  if (requestedType === 'new') return { category: 'New Consultation', fee: null, consultationId: null, expiresOn: null };
  const previous = getConsultations()
    .filter(consultation => consultation.patientId === patientId && consultation.status === 'completed')
    .sort((a, b) => b.consultationDate.localeCompare(a.consultationDate) ||
      String(b.completedAt || '').localeCompare(String(a.completedAt || '')))[0];
  if (!previous || previous.doctorId !== doctorId) {
    return { category: 'New Consultation', fee: null, consultationId: null, expiresOn: null };
  }
  const days = Number(config.reviewRules?.freeReviewDays) || 15;
  const expires = new Date(`${previous.consultationDate}T12:00:00Z`);
  const offset = config.reviewRules?.countingRule === 'calendar_days_inclusive' ? days - 1 : days;
  expires.setUTCDate(expires.getUTCDate() + offset);
  const expiresOn = expires.toISOString().slice(0, 10);
  const withinEligibility = appointmentDate <= expiresOn;
  return {
    category: withinEligibility ? 'Review' : 'Revisit',
    fee: withinEligibility ? 0 : null,
    consultationId: previous.id,
    expiresOn
  };
}

const AGE_GROUPS = ['0-5', '6-12', '13-18', '19-30', '31-45', '46-60', '61-75', '76+'];

function datePart(value) {
  if (typeof value !== 'string' || !value) return null;
  if (isValidDate(value.slice(0, 10))) return value.slice(0, 10);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : localDateString(parsed);
}

function ageOnDate(dob, asOfDate) {
  if (!isValidDate(dob) || !isValidDate(asOfDate)) return null;
  const [birthYear, birthMonth, birthDay] = dob.split('-').map(Number);
  const [year, month, day] = asOfDate.split('-').map(Number);
  let age = year - birthYear;
  if (month < birthMonth || (month === birthMonth && day < birthDay)) age -= 1;
  return age >= 0 ? age : null;
}

function ageGroupFor(age) {
  if (age === null) return 'Unknown';
  if (age <= 5) return '0-5';
  if (age <= 12) return '6-12';
  if (age <= 18) return '13-18';
  if (age <= 30) return '19-30';
  if (age <= 45) return '31-45';
  if (age <= 60) return '46-60';
  if (age <= 75) return '61-75';
  return '76+';
}

function incrementCount(target, key, amount = 1) {
  target[key] = (target[key] || 0) + amount;
}

function scheduleCapacity(doctor, startDate, endDate) {
  const schedule = doctor.schedule || {};
  const unavailable = new Set(schedule.unavailableDates || []);
  const specialDays = new Map((schedule.specialWorkingDays || []).map(item => [item.date, item]));
  const duration = Number(schedule.slotDurationMinutes) || 30;
  const defaultCapacity = Number(schedule.capacityPerSlot) || 1;
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  let total = 0;
  let sessionCount = 0;

  for (const date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
    const dateString = date.toISOString().slice(0, 10);
    if (unavailable.has(dateString)) continue;
    const specialDay = specialDays.get(dateString);
    const working = specialDay || (schedule.workingDays || []).includes(date.getUTCDay());
    if (!working) continue;
    const sessions = specialDay?.sessions || schedule.sessions || [];
    const breaks = specialDay?.breaks || schedule.breaks || [];
    const slotDuration = Number(specialDay?.slotDurationMinutes) || duration;
    const capacity = Number(specialDay?.capacityPerSlot) || defaultCapacity;

    for (const session of sessions) {
      let sessionCapacity = 0;
      const [startHour, startMinute] = session.start.split(':').map(Number);
      const [endHour, endMinute] = session.end.split(':').map(Number);
      const sessionStart = startHour * 60 + startMinute;
      const sessionEnd = endHour * 60 + endMinute;
      for (let minute = sessionStart; minute + slotDuration <= sessionEnd; minute += slotDuration) {
        const overlapsBreak = breaks.some(period => {
          const [breakStartHour, breakStartMinute] = period.start.split(':').map(Number);
          const [breakEndHour, breakEndMinute] = period.end.split(':').map(Number);
          const breakStart = breakStartHour * 60 + breakStartMinute;
          const breakEnd = breakEndHour * 60 + breakEndMinute;
          return minute < breakEnd && minute + slotDuration > breakStart;
        });
        if (!overlapsBreak) sessionCapacity += capacity;
      }
      total += sessionCapacity;
      if (sessionCapacity > 0) sessionCount += 1;
    }
  }
  return {
    capacity: total,
    sessionCount,
    averageSlotsPerSession: sessionCount ? total / sessionCount : 0
  };
}

function buildConversionFunnel(events, filters) {
  const endTime = Date.parse(`${filters.endDate}T23:59:59.999Z`);
  const eventsByJourney = new Map();
  for (const event of events) {
    const eventTime = Date.parse(event.occurredAt || '');
    if (!event.journeyId || !Number.isFinite(eventTime) || eventTime > endTime) continue;
    if (!eventsByJourney.has(event.journeyId)) eventsByJourney.set(event.journeyId, []);
    eventsByJourney.get(event.journeyId).push(event);
  }

  const maturityCutoff = Date.now() - 15 * 60 * 1000;
  const cohorts = [];
  for (const journeyEvents of eventsByJourney.values()) {
    const started = journeyEvents.find(event => event.stage === 'identity_started');
    const startedDate = datePart(started?.occurredAt);
    if (startedDate >= filters.startDate && startedDate <= filters.endDate) {
      cohorts.push(journeyEvents);
    }
  }
  const firstMaturedEvent = (journeyEvents, stage, afterEvent = null) => {
    const afterIndex = afterEvent ? journeyEvents.indexOf(afterEvent) : -1;
    return journeyEvents
      .map((event, index) => ({ event, index, time: Date.parse(event.occurredAt) }))
      .filter(item => item.index > afterIndex && item.event.stage === stage && item.time <= maturityCutoff)
      .sort((a, b) => a.index - b.index)[0]?.event || null;
  };
  const matureStarts = cohorts.filter(eventsForJourney =>
    firstMaturedEvent(eventsForJourney, 'identity_started')
  );
  const startedCount = matureStarts.length;
  const verifiedJourneys = matureStarts.filter(eventsForJourney => {
    const started = firstMaturedEvent(eventsForJourney, 'identity_started');
    return firstMaturedEvent(eventsForJourney, 'identity_verified', started);
  });
  const newPatientJourneys = verifiedJourneys.filter(eventsForJourney => {
    const started = firstMaturedEvent(eventsForJourney, 'identity_started');
    return firstMaturedEvent(eventsForJourney, 'new_patient_verified', started);
  });
  const registeredJourneys = newPatientJourneys.filter(eventsForJourney => {
    const newPatientVerified = firstMaturedEvent(eventsForJourney, 'new_patient_verified');
    return firstMaturedEvent(eventsForJourney, 'patient_registered', newPatientVerified);
  });
  const bookingEligibleJourneys = verifiedJourneys.filter(eventsForJourney =>
    firstMaturedEvent(eventsForJourney, 'existing_patient_verified') ||
    registeredJourneys.includes(eventsForJourney)
  );
  const countAfter = (journeys, stage, previousStage) => journeys.filter(eventsForJourney => {
    const previous = firstMaturedEvent(eventsForJourney, previousStage);
    return previous && firstMaturedEvent(eventsForJourney, stage, previous);
  }).length;
  const verifiedCount = verifiedJourneys.length;
  const registeredCount = registeredJourneys.length;
  const reservedCount = countAfter(bookingEligibleJourneys, 'appointment_reserved', 'identity_verified');
  const paymentStartedCount = countAfter(bookingEligibleJourneys, 'payment_started', 'appointment_reserved');
  const paymentSucceededCount = countAfter(bookingEligibleJourneys, 'payment_succeeded', 'payment_started');
  const dropOff = (from, to) => ({
    count: Math.max(0, from - to),
    percent: from ? Math.round((Math.max(0, from - to) / from) * 1000) / 10 : null
  });

  return {
    maturityMinutes: 15,
    scope: 'Organization-wide journeys in the selected date range; provider and demographic filters do not apply.',
    stages: {
      identityStarted: startedCount,
      identityVerified: verifiedCount,
      newPatientVerified: newPatientJourneys.length,
      patientRegistered: registeredCount,
      eligibleForBooking: bookingEligibleJourneys.length,
      appointmentSlotsReserved: reservedCount,
      paymentsStarted: paymentStartedCount,
      paymentsSucceeded: paymentSucceededCount
    },
    dropOff: {
      identityVerification: dropOff(startedCount, verifiedCount),
      newPatientRegistration: dropOff(newPatientJourneys.length, registeredCount),
      appointmentReservation: dropOff(bookingEligibleJourneys.length, reservedCount),
      paymentCompletion: dropOff(paymentStartedCount, paymentSucceededCount)
    }
  };
}

function buildAnalyticsReport(filters) {
  const config = getConfig();
  const allPatients = getPatients();
  const allAppointments = getAppointments();
  const allInvoices = getInvoices();
  const allPayments = getPayments();
  const allTokens = getTokens();
  const allConsultations = getConsultations();
  const patientById = new Map(allPatients.map(patient => [patient.id, patient]));
  const appointmentById = new Map(allAppointments.map(appointment => [appointment.id, appointment]));
  const invoiceById = new Map(allInvoices.map(invoice => [invoice.id, invoice]));
  const patientAgeGroup = patient => ageGroupFor(ageOnDate(patient?.dob, filters.endDate));
  const matchesPatient = patient => {
    if (!patient) return !filters.gender && !filters.ageGroup && !filters.state && !filters.district &&
      !filters.pincode && !filters.country && !filters.postOffice && !filters.locality;
    if (filters.gender && patient.gender !== filters.gender) return false;
    if (filters.ageGroup && patientAgeGroup(patient) !== filters.ageGroup) return false;
    if (filters.state && String(patient.state || '').toLowerCase() !== filters.state.toLowerCase()) return false;
    if (filters.district && String(patient.district || '').toLowerCase() !== filters.district.toLowerCase()) return false;
    if (filters.pincode && String(patient.pincode || '') !== filters.pincode) return false;
    if (filters.country && String(patient.country || '').toLowerCase() !== filters.country.toLowerCase()) return false;
    if (filters.postOffice && String(patient.postOffice || '').toLowerCase() !== filters.postOffice.toLowerCase()) return false;
    if (filters.locality && String(patient.locality || patient.city || '').toLowerCase() !== filters.locality.toLowerCase()) return false;
    return true;
  };
  const withinRange = value => {
    const date = datePart(value);
    return !!date && date >= filters.startDate && date <= filters.endDate;
  };
  const withinRangeFor = (value, startDate, endDate) => {
    const date = datePart(value);
    return !!date && date >= startDate && date <= endDate;
  };
  const matchesDepartment = item =>
    (!filters.departmentId || item.department === filters.departmentId) &&
    (!filters.departmentIds || filters.departmentIds.includes(item.department));
  const matchesProvider = item =>
    matchesDepartment(item) &&
    (!filters.doctorId || item.doctorId === filters.doctorId);

  const appointments = allAppointments.filter(appointment => {
    const date = appointment.appointmentDate || datePart(appointment.createdAt);
    return date >= filters.startDate && date <= filters.endDate &&
      matchesProvider(appointment) && matchesPatient(patientById.get(appointment.patientId));
  });
  const matchedPatientIds = new Set(appointments.map(appointment => appointment.patientId));
  const consultations = allConsultations.filter(consultation => {
    const date = consultation.consultationDate || datePart(consultation.completedAt);
    return date >= filters.startDate && date <= filters.endDate &&
      consultation.status === 'completed' &&
      matchesProvider(consultation) && matchesPatient(patientById.get(consultation.patientId));
  });
  for (const consultation of consultations) matchedPatientIds.add(consultation.patientId);
  const registrations = allPatients.filter(patient =>
    withinRange(patient.createdAt) && matchesPatient(patient) &&
    (!filters.departmentId && !filters.departmentIds && !filters.doctorId || matchedPatientIds.has(patient.id))
  );
  const reportPatientIds = new Set([...matchedPatientIds, ...registrations.map(patient => patient.id)]);
  const reportPatients = [...reportPatientIds].map(id => patientById.get(id)).filter(Boolean);
  const newPatientIds = new Set(registrations.map(patient => patient.id));
  const ageDepartmentCounts = {};
  const visitCategoryRevenue = {};
  const patientVisitCounts = {};
  const districtDepartmentCounts = {};
  const genderDepartmentCounts = {};
  const invoices = allInvoices.filter(invoice => {
    const date = invoice.appointmentDate || datePart(invoice.createdAt);
    return date >= filters.startDate && date <= filters.endDate &&
      matchesProvider(invoice) && matchesPatient(patientById.get(invoice.patientId));
  });
  const matchedInvoiceIds = new Set(invoices.map(invoice => invoice.id));
  const payments = allPayments.filter(payment => matchedInvoiceIds.has(payment.invoiceId) &&
    withinRange(payment.completedAt || payment.createdAt));
  const tokens = allTokens.filter(token => {
    const appointment = appointmentById.get(token.appointmentId);
    const invoice = invoiceById.get(token.invoiceId);
    const date = token.appointmentDate || appointment?.appointmentDate ||
      invoice?.appointmentDate || datePart(token.createdAt);
    return date >= filters.startDate && date <= filters.endDate &&
      (!filters.doctorId || token.doctorId === filters.doctorId) &&
      matchesDepartment({ department: appointment?.department || invoice?.department });
  });
  const appointmentsByStatus = status => appointments.filter(appointment => appointment.status === status);
  const completedAppointments = appointmentsByStatus('completed');
  const completedAppointmentIds = new Set(completedAppointments.map(appointment => appointment.id));
  const independentConsultations = consultations.filter(consultation =>
    !consultation.appointmentId || !completedAppointmentIds.has(consultation.appointmentId)
  );
  const completedVisitRecords = [
    ...completedAppointments.map(appointment => ({ ...appointment, patientId: appointment.patientId })),
    ...independentConsultations
  ];
  for (const visit of completedVisitRecords) incrementCount(patientVisitCounts, visit.patientId);
  const completedFootfall = completedAppointments.length + independentConsultations.length;
  const bookedAppointments = appointments.filter(appointment =>
    !['cancelled', 'canceled', 'payment_failed', 'expired'].includes(appointment.status)
  );
  const activeExistingPatients = reportPatients.filter(patient => {
    const created = datePart(patient.createdAt);
    return created && created < filters.startDate;
  });
  const activeNewPatients = reportPatients.filter(patient => newPatientIds.has(patient.id));

  const categoryCounts = {};
  const departmentStats = new Map();
  const doctorStats = new Map();
  const getDepartmentStats = id => {
    if (!departmentStats.has(id)) departmentStats.set(id, { id, appointments: 0, reserved: 0, completed: 0, invoiced: 0, collected: 0 });
    return departmentStats.get(id);
  };
  const getDoctorStats = id => {
    if (!doctorStats.has(id)) doctorStats.set(id, { id, appointments: 0, reserved: 0, completed: 0, invoiced: 0, collected: 0 });
    return doctorStats.get(id);
  };
  for (const appointment of appointments) {
    incrementCount(categoryCounts, appointment.visitCategory || 'Unclassified');
    const department = getDepartmentStats(appointment.department || 'Unknown');
    department.appointments += 1;
    const doctor = getDoctorStats(appointment.doctorId || 'Unknown');
    doctor.appointments += 1;
    if (['confirmed', 'completed', 'no_show', 'pending_payment'].includes(appointment.status)) {
      department.reserved = (department.reserved || 0) + 1;
      doctor.reserved = (doctor.reserved || 0) + 1;
    }
    if (appointment.status === 'completed') {
      department.completed += 1;
      doctor.completed += 1;
    }
    const patient = patientById.get(appointment.patientId);
    const ageGroup = ageGroupFor(ageOnDate(patient?.dob, filters.endDate));
    const district = patient?.district || patient?.city || 'Unknown';
    const gender = patient?.gender || 'Unknown';
    if (!ageDepartmentCounts[ageGroup]) ageDepartmentCounts[ageGroup] = {};
    incrementCount(ageDepartmentCounts[ageGroup], appointment.department || 'Unknown');
    if (!districtDepartmentCounts[district]) districtDepartmentCounts[district] = {};
    incrementCount(districtDepartmentCounts[district], appointment.department || 'Unknown');
    if (!genderDepartmentCounts[gender]) genderDepartmentCounts[gender] = {};
    incrementCount(genderDepartmentCounts[gender], appointment.department || 'Unknown');
  }
  for (const consultation of independentConsultations) {
    getDepartmentStats(consultation.department || 'Unknown').completed += 1;
    getDoctorStats(consultation.doctorId || 'Unknown').completed += 1;
  }

  const successfulPayments = payments.filter(payment => ['success', 'paid'].includes(payment.status));
  const collectedAmount = successfulPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const invoicedAmount = invoices.reduce((sum, invoice) => sum + Number(invoice.total || 0), 0);
  const rangeDays = Math.floor((Date.parse(`${filters.endDate}T00:00:00Z`) - Date.parse(`${filters.startDate}T00:00:00Z`)) / 86400000) + 1;
  const previousEnd = new Date(`${filters.startDate}T00:00:00Z`);
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
  const previousEndDate = previousEnd.toISOString().slice(0, 10);
  const previousStart = new Date(`${previousEndDate}T00:00:00Z`);
  previousStart.setUTCDate(previousStart.getUTCDate() - rangeDays + 1);
  const previousStartDate = previousStart.toISOString().slice(0, 10);
  const previousAppointments = allAppointments.filter(appointment => {
    const date = appointment.appointmentDate || datePart(appointment.createdAt);
    return date >= previousStartDate && date <= previousEndDate &&
      matchesProvider(appointment) && matchesPatient(patientById.get(appointment.patientId));
  });
  const previousPatientIds = new Set(previousAppointments.map(appointment => appointment.patientId));
  const previousRegistrations = allPatients.filter(patient => {
    const date = datePart(patient.createdAt);
    return date >= previousStartDate && date <= previousEndDate && matchesPatient(patient) &&
      (!filters.departmentId && !filters.departmentIds && !filters.doctorId || previousPatientIds.has(patient.id));
  });
  const previousInvoices = allInvoices.filter(invoice => {
    const date = invoice.appointmentDate || datePart(invoice.createdAt);
    return date >= previousStartDate && date <= previousEndDate &&
      matchesProvider(invoice) && matchesPatient(patientById.get(invoice.patientId));
  });
  const previousInvoiceIds = new Set(previousInvoices.map(invoice => invoice.id));
  const previousCollected = allPayments.filter(payment => previousInvoiceIds.has(payment.invoiceId) &&
    ['success', 'paid'].includes(payment.status) &&
    withinRangeFor(payment.completedAt || payment.createdAt, previousStartDate, previousEndDate))
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const previousCompletedAppointmentIds = new Set(previousAppointments
    .filter(appointment => appointment.status === 'completed').map(appointment => appointment.id));
  const previousFootfall = previousCompletedAppointmentIds.size + allConsultations.filter(consultation => {
    const date = consultation.consultationDate || datePart(consultation.completedAt);
    return date >= previousStartDate && date <= previousEndDate && consultation.status === 'completed' &&
      (!consultation.appointmentId || !previousCompletedAppointmentIds.has(consultation.appointmentId)) &&
      matchesProvider(consultation) && matchesPatient(patientById.get(consultation.patientId));
  }).length;
  const percentChange = (current, previous) => previous
    ? Math.round(((current - previous) / previous) * 1000) / 10
    : null;
  const paymentMethodCounts = {};
  const paymentMethodAmounts = {};
  for (const payment of payments) {
    const method = payment.method || 'Unknown';
    incrementCount(paymentMethodCounts, method);
    if (['success', 'paid'].includes(payment.status)) {
      paymentMethodAmounts[method] = (paymentMethodAmounts[method] || 0) + Number(payment.amount || 0);
    }
  }
  const invoicesById = new Map(invoices.map(invoice => [invoice.id, invoice]));
  for (const invoice of invoices) {
    const department = getDepartmentStats(invoice.department || 'Unknown');
    department.invoiced += Number(invoice.total || 0);
    const doctor = getDoctorStats(invoice.doctorId || 'Unknown');
    doctor.invoiced += Number(invoice.total || 0);
    const category = invoice.visitCategory || 'Unclassified';
    if (!visitCategoryRevenue[category]) visitCategoryRevenue[category] = { invoiced: 0, collected: 0 };
    visitCategoryRevenue[category].invoiced += Number(invoice.total || 0);
  }
  for (const payment of successfulPayments) {
    const invoice = invoicesById.get(payment.invoiceId);
    if (!invoice) continue;
    getDepartmentStats(invoice.department || 'Unknown').collected += Number(payment.amount || 0);
    getDoctorStats(invoice.doctorId || 'Unknown').collected += Number(payment.amount || 0);
    const category = invoice.visitCategory || 'Unclassified';
    if (!visitCategoryRevenue[category]) visitCategoryRevenue[category] = { invoiced: 0, collected: 0 };
    visitCategoryRevenue[category].collected += Number(payment.amount || 0);
  }

  const ageCounts = Object.fromEntries([...AGE_GROUPS, 'Unknown'].map(group => [group, 0]));
  const newAgeCounts = {};
  const returningAgeCounts = {};
  const genderCounts = {};
  const ageGenderCounts = {};
  const geography = { countries: {}, states: {}, districts: {}, pinCodes: {}, postOffices: {}, localities: {} };
  const geographyRevenue = {};
  const newPatientDistricts = {};
  for (const patient of reportPatients) {
    const ageGroup = patientAgeGroup(patient);
    const gender = patient.gender || 'Unknown';
    incrementCount(ageCounts, ageGroup);
    incrementCount(newPatientIds.has(patient.id) ? newAgeCounts : returningAgeCounts, ageGroup);
    incrementCount(genderCounts, gender);
    if (!ageGenderCounts[ageGroup]) ageGenderCounts[ageGroup] = {};
    incrementCount(ageGenderCounts[ageGroup], gender);
    incrementCount(geography.countries, patient.country || 'Unknown');
    incrementCount(geography.states, patient.state || 'Unknown');
    incrementCount(geography.districts, patient.district || patient.city || 'Unknown');
    incrementCount(geography.pinCodes, patient.pincode || 'Unknown');
    incrementCount(geography.postOffices, patient.postOffice || 'Unknown');
    incrementCount(geography.localities, patient.locality || patient.city || 'Unknown');
  }
  for (const patient of registrations) {
    incrementCount(newPatientDistricts, patient.district || patient.city || 'Unknown');
  }
  for (const payment of successfulPayments) {
    const patient = patientById.get(payment.patientId);
    if (!patient) continue;
    const area = patient.district || patient.city || 'Unknown';
    geographyRevenue[area] = (geographyRevenue[area] || 0) + Number(payment.amount || 0);
  }

  const temporalSeries = new Map();
  const useMonthBuckets = (Date.parse(`${filters.endDate}T00:00:00Z`) - Date.parse(`${filters.startDate}T00:00:00Z`)) > 60 * 86400000;
  const useYearBuckets = (Date.parse(`${filters.endDate}T00:00:00Z`) - Date.parse(`${filters.startDate}T00:00:00Z`)) > 730 * 86400000;
  const ageTrendBuckets = {};
  const genderTrendBuckets = {};
  const geographyTrendBuckets = {};
  const bucketFor = date => useYearBuckets ? date.slice(0, 4) : useMonthBuckets ? date.slice(0, 7) : date;
  const addSeries = (date, key) => {
    const bucket = bucketFor(date);
    if (!temporalSeries.has(bucket)) temporalSeries.set(bucket, { period: bucket, registrations: 0, footfall: 0, appointments: 0, collected: 0 });
    temporalSeries.get(bucket)[key] += 1;
  };
  for (const patient of registrations) {
    const date = datePart(patient.createdAt);
    if (date) {
      addSeries(date, 'registrations');
      const agePeriod = useYearBuckets ? date.slice(0, 4) : date.slice(0, 7);
      const ageGroup = ageGroupFor(ageOnDate(patient.dob, date));
      const district = patient.district || patient.city || 'Unknown';
      if (!ageTrendBuckets[agePeriod]) ageTrendBuckets[agePeriod] = {};
      if (!geographyTrendBuckets[agePeriod]) geographyTrendBuckets[agePeriod] = {};
      incrementCount(ageTrendBuckets[agePeriod], ageGroup);
      incrementCount(genderTrendBuckets, `${agePeriod}|${patient.gender || 'Unknown'}`);
      incrementCount(geographyTrendBuckets[agePeriod], district);
    }
  }
  for (const appointment of appointments) {
    const date = appointment.appointmentDate || datePart(appointment.createdAt);
    if (date) addSeries(date, 'appointments');
  }
  for (const appointment of completedAppointments) {
    const date = appointment.appointmentDate || datePart(appointment.completedAt);
    if (date) addSeries(date, 'footfall');
  }
  for (const consultation of independentConsultations) {
    const date = consultation.consultationDate || datePart(consultation.completedAt);
    if (date) addSeries(date, 'footfall');
  }
  for (const payment of successfulPayments) {
    const date = datePart(payment.completedAt || payment.createdAt);
    if (!date) continue;
    const bucket = bucketFor(date);
    if (!temporalSeries.has(bucket)) temporalSeries.set(bucket, { period: bucket, registrations: 0, footfall: 0, appointments: 0, collected: 0 });
    temporalSeries.get(bucket).collected += Number(payment.amount || 0);
  }

  const hourlyScheduledAppointments = {};
  const hourlyActualArrivals = {};
  const waitingMinutes = [];
  const appointmentDelayMinutes = [];
  const consultationDurationMinutes = [];
  const registrationMinutes = [];
  for (const patient of registrations) {
    if (!patient.registrationStartedAt || !patient.createdAt) continue;
    const elapsed = (Date.parse(patient.createdAt) - Date.parse(patient.registrationStartedAt)) / 60000;
    if (Number.isFinite(elapsed) && elapsed >= 0) registrationMinutes.push(elapsed);
  }
  for (const appointment of appointments) {
    const arrival = Date.parse(appointment.arrivedAt || '');
    const started = Date.parse(appointment.consultationStartedAt || '');
    const ended = Date.parse(appointment.consultationEndedAt || appointment.completedAt || '');
    if (appointment.appointmentTime) incrementCount(hourlyScheduledAppointments, appointment.appointmentTime.slice(0, 2));
    if (Number.isFinite(arrival)) {
      const arrivalHour = new Intl.DateTimeFormat('en', { timeZone: config.timeZone || 'Asia/Kolkata', hour: '2-digit', hourCycle: 'h23' }).format(new Date(arrival));
      incrementCount(hourlyActualArrivals, arrivalHour);
    }
    if (Number.isFinite(arrival) && Number.isFinite(started) && started >= arrival) waitingMinutes.push((started - arrival) / 60000);
    if (Number.isFinite(started)) {
      const scheduled = hospitalDateTime(appointment.appointmentDate, appointment.appointmentTime, config.timeZone || 'Asia/Kolkata').getTime();
      appointmentDelayMinutes.push((started - scheduled) / 60000);
      if (Number.isFinite(ended) && ended >= started) consultationDurationMinutes.push((ended - started) / 60000);
    }
  }
  for (const consultation of independentConsultations) {
    const started = Date.parse(consultation.consultationStartedAt || '');
    const ended = Date.parse(consultation.consultationEndedAt || consultation.completedAt || '');
    if (Number.isFinite(started) && Number.isFinite(ended) && ended >= started) {
      consultationDurationMinutes.push((ended - started) / 60000);
    }
  }

  const activeDoctors = (config.doctors || []).filter(doctor =>
    matchesDepartment(doctor) &&
    (!filters.doctorId || doctor.id === filters.doctorId)
  );
  const providerCapacity = new Map(activeDoctors.map(doctor => [doctor.id, scheduleCapacity(doctor, filters.startDate, filters.endDate)]));
  const departmentName = id => config.departments?.find(item => item.id === id)?.name || id;
  const doctorName = id => config.doctors?.find(item => item.id === id)?.name || id;
  const previousCompletedByDepartment = {};
  const previousCompletedByDoctor = {};
  const priorCompletedAppointments = allAppointments.filter(appointment => {
    const date = appointment.appointmentDate || datePart(appointment.completedAt);
    return appointment.status === 'completed' &&
      date >= previousStartDate && date <= previousEndDate &&
      matchesProvider(appointment) && matchesPatient(patientById.get(appointment.patientId));
  });
  const priorAppointmentIds = new Set(priorCompletedAppointments.map(appointment => appointment.id));
  for (const appointment of priorCompletedAppointments) {
    incrementCount(previousCompletedByDepartment, appointment.department || 'Unknown');
    incrementCount(previousCompletedByDoctor, appointment.doctorId || 'Unknown');
  }
  for (const consultation of allConsultations) {
    const date = consultation.consultationDate || datePart(consultation.completedAt);
    if (consultation.status !== 'completed' ||
        (consultation.appointmentId && priorAppointmentIds.has(consultation.appointmentId)) ||
        date < previousStartDate || date > previousEndDate ||
        !matchesProvider(consultation) || !matchesPatient(patientById.get(consultation.patientId))) continue;
    incrementCount(previousCompletedByDepartment, consultation.department || 'Unknown');
    incrementCount(previousCompletedByDoctor, consultation.doctorId || 'Unknown');
  }
  const departmentIds = new Set([...departmentStats.keys(), ...activeDoctors.map(doctor => doctor.department)]);
  const departmentPerformance = [...departmentIds].map(id => {
    const item = departmentStats.get(id) || {
      id,
      appointments: 0,
      reserved: 0,
      completed: 0,
      invoiced: 0,
      collected: 0
    };
    const doctors = activeDoctors.filter(doctor => doctor.department === item.id);
    const capacity = doctors.reduce((sum, doctor) => sum + (providerCapacity.get(doctor.id)?.capacity || 0), 0);
    const unutilizedSlots = Math.max(0, capacity - (item.reserved || 0));
    const grossUnusedCapacityValue = doctors.reduce((sum, doctor) => {
      const doctorCapacity = providerCapacity.get(doctor.id)?.capacity || 0;
      const doctorReserved = doctorStats.get(doctor.id)?.reserved || 0;
      return sum + Math.max(0, doctorCapacity - doctorReserved) * Number(doctor.fee || 0);
    }, 0);
    return {
      ...item,
      name: departmentName(item.id),
      capacity,
      capacityGap: (item.reserved || 0) - capacity,
      unutilizedSlots,
      grossUnusedCapacityValue: Math.round(grossUnusedCapacityValue),
      previousCompleted: previousCompletedByDepartment[item.id] || 0,
      growthPercent: percentChange(item.completed || 0, previousCompletedByDepartment[item.id] || 0),
      utilizationPercent: capacity ? Math.round(((item.reserved || 0) / capacity) * 1000) / 10 : null
    };
  });
  const doctorProductivity = [...new Set([...activeDoctors.map(doctor => doctor.id), ...doctorStats.keys()])].map(id => {
    const item = doctorStats.get(id) || { id, appointments: 0, reserved: 0, completed: 0, invoiced: 0, collected: 0 };
    const capacity = providerCapacity.get(id)?.capacity || 0;
    return {
      ...item,
      name: doctorName(id),
      capacity,
      previousCompleted: previousCompletedByDoctor[id] || 0,
      growthPercent: percentChange(item.completed || 0, previousCompletedByDoctor[id] || 0),
      unutilizedSlots: Math.max(0, capacity - (item.reserved || 0)),
      utilizationPercent: capacity ? Math.round(((item.reserved || 0) / capacity) * 1000) / 10 : null
    };
  });

  const weekdayCounts = {};
  const peakHourCounts = {};
  for (const appointment of appointments) {
    const date = appointment.appointmentDate || datePart(appointment.createdAt);
    if (date && isValidDate(date)) {
      const weekday = new Date(`${date}T00:00:00Z`).toLocaleDateString('en', { weekday: 'long', timeZone: 'UTC' });
      incrementCount(weekdayCounts, weekday);
    }
    if (appointment.appointmentTime) incrementCount(peakHourCounts, appointment.appointmentTime.slice(0, 2));
  }

  const reportMonthStart = new Date(`${filters.endDate.slice(0, 7)}-01T00:00:00Z`);
  const forecastStart = new Date(reportMonthStart);
  forecastStart.setUTCMonth(forecastStart.getUTCMonth() + 1);
  const forecastEnd = new Date(forecastStart);
  forecastEnd.setUTCMonth(forecastEnd.getUTCMonth() + 1);
  forecastEnd.setUTCDate(forecastEnd.getUTCDate() - 1);
  const forecastStartDate = forecastStart.toISOString().slice(0, 10);
  const forecastEndDate = forecastEnd.toISOString().slice(0, 10);
  const historyMonthKeys = [];
  for (let offset = 6; offset >= 1; offset -= 1) {
    const month = new Date(reportMonthStart);
    month.setUTCMonth(month.getUTCMonth() - offset);
    historyMonthKeys.push(month.toISOString().slice(0, 7));
  }
  const historyMonthSet = new Set(historyMonthKeys);
  const completedHistory = [];
  const historyCompletedAppointmentIds = new Set();
  for (const appointment of allAppointments) {
    const date = appointment.appointmentDate || datePart(appointment.completedAt);
    if (appointment.status !== 'completed' || !date || !historyMonthSet.has(date.slice(0, 7)) ||
        !matchesProvider(appointment) || !matchesPatient(patientById.get(appointment.patientId))) continue;
    completedHistory.push({ date, department: appointment.department || 'Unknown' });
    historyCompletedAppointmentIds.add(appointment.id);
  }
  for (const consultation of allConsultations) {
    const date = consultation.consultationDate || datePart(consultation.completedAt);
    if (consultation.status !== 'completed' || !date || !historyMonthSet.has(date.slice(0, 7)) ||
        (consultation.appointmentId && historyCompletedAppointmentIds.has(consultation.appointmentId)) ||
        !matchesProvider(consultation) || !matchesPatient(patientById.get(consultation.patientId))) continue;
    completedHistory.push({ date, department: consultation.department || 'Unknown' });
  }
  const observedHistoryMonths = new Set(completedHistory.map(visit => visit.date.slice(0, 7))).size;
  const configuredDepartments = (config.departments || []).filter(department =>
    matchesDepartment({ department: department.id })
  );
  const demandForecast = configuredDepartments.map(department => {
    const monthlyDemand = historyMonthKeys.map(month =>
      completedHistory.filter(visit => visit.department === department.id && visit.date.startsWith(month)).length
    );
    const departmentHistoryMonths = new Set(completedHistory
      .filter(visit => visit.department === department.id)
      .map(visit => visit.date.slice(0, 7))).size;
    const demandDoctors = activeDoctors.filter(doctor => doctor.department === department.id);
    const futurePlans = demandDoctors.map(doctor =>
      scheduleCapacity(doctor, forecastStartDate, forecastEndDate)
    );
    const nextMonthCapacity = futurePlans.reduce((sum, plan) => sum + plan.capacity, 0);
    const averageSlotsPerSession = futurePlans.reduce((sum, plan) =>
      sum + plan.averageSlotsPerSession * plan.sessionCount, 0
    ) / Math.max(1, futurePlans.reduce((sum, plan) => sum + plan.sessionCount, 0));
    const enoughHistory = departmentHistoryMonths === historyMonthKeys.length;
    let forecastVisits = null;
    if (enoughHistory) {
      const meanX = (monthlyDemand.length - 1) / 2;
      const meanY = monthlyDemand.reduce((sum, value) => sum + value, 0) / monthlyDemand.length;
      const numerator = monthlyDemand.reduce((sum, value, index) => sum + (index - meanX) * (value - meanY), 0);
      const denominator = monthlyDemand.reduce((sum, _value, index) => sum + (index - meanX) ** 2, 0);
      forecastVisits = Math.max(0, Math.round(meanY + numerator / denominator * (monthlyDemand.length - meanX)));
    }
    const capacityGap = forecastVisits === null ? null : forecastVisits - nextMonthCapacity;
    return {
      departmentId: department.id,
      name: department.name,
      status: enoughHistory ? 'projected' : 'insufficient_history',
      observedHistoryMonths: departmentHistoryMonths,
      requiredHistoryMonths: historyMonthKeys.length,
      forecastVisits,
      nextMonthCapacity,
      capacityGap,
      additionalSessions: capacityGap === null || capacityGap <= 0 || !averageSlotsPerSession
        ? 0
        : Math.ceil(capacityGap / averageSlotsPerSession),
      monthlyDemand
    };
  });
  const funnel = buildConversionFunnel(getFunnelEvents(), filters);
  const weekdaySeries = Object.entries(weekdayCounts).map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
  const peakHourSeries = Object.entries(peakHourCounts).map(([name, value]) => ({ name: `${name}:00`, value }))
    .sort((a, b) => b.value - a.value);
  const cancelledCount = appointments.filter(item => ['cancelled', 'canceled'].includes(item.status)).length;
  const noShowCount = appointmentsByStatus('no_show').length;
  const pendingCount = appointments.filter(item => ['confirmed', 'pending_payment'].includes(item.status)).length;
  const failedPaymentCount = payments.filter(item => ['failed', 'cancelled'].includes(item.status)).length;
  const refunds = payments.reduce((sum, item) => sum + Number(item.refundedAmount || 0), 0);
  const waivedReviewAmount = appointments.filter(item => item.visitCategory === 'Review')
    .reduce((sum, item) => sum + Number(config.doctors?.find(doctor => doctor.id === item.doctorId)?.fee || 0), 0);
  const average = values => values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10 : null;
  const activePatientCount = reportPatients.length;
  const repeatVisits = consultations.filter(item => {
    const patient = patientById.get(item.patientId);
    return patient && datePart(patient.createdAt) < filters.startDate;
  }).length;
  const unutilizedSlotGrossValue = departmentPerformance.reduce((sum, item) => sum + item.grossUnusedCapacityValue, 0);
  const targetActuals = {
    footfall: completedFootfall,
    registrations: registrations.length,
    appointments: appointments.length,
    collectedAmount,
    newPatients: activeNewPatients.length
  };
  const hasScopedFilters = !!(filters.departmentId || filters.departmentIds || filters.doctorId || filters.ageGroup || filters.gender ||
    filters.state || filters.district || filters.pincode || filters.country || filters.postOffice || filters.locality);
  const targetComparisons = hasScopedFilters ? [] : (config.reportConfig?.targets || [])
    .filter(target => target.period === filters.reportPeriod)
    .map(target => {
      const actual = targetActuals[target.metric];
      return {
        metric: target.metric,
        period: target.period,
        target: Number(target.value),
        actual,
        variance: actual - Number(target.value),
        attainmentPercent: Number(target.value) ? Math.round((actual / Number(target.value)) * 1000) / 10 : null
      };
    });

  return {
    generatedAt: new Date().toISOString(),
    registrationAnalytics: buildRegistrationAnalytics({
      registrations, reportPatients, appointments, previousAppointments, doctorName, departmentName
    }),
    period: {
      startDate: filters.startDate,
      endDate: filters.endDate,
      reportPeriod: filters.reportPeriod,
      hospitalName: config.hospitalName,
      hospitalCode: config.hospitalCode,
      previousStartDate,
      previousEndDate,
      bucket: useYearBuckets ? 'year' : useMonthBuckets ? 'month' : 'day'
    },
    filters: {
      reportPeriod: filters.reportPeriod,
      departmentId: filters.departmentId || null,
      departmentIds: filters.departmentIds || null,
      doctorId: filters.doctorId || null,
      ageGroup: filters.ageGroup || null,
      gender: filters.gender || null,
      state: filters.state || null,
      district: filters.district || null,
      pincode: filters.pincode || null,
      country: filters.country || null,
      postOffice: filters.postOffice || null,
      locality: filters.locality || null
    },
    summary: {
      registrations: registrations.length,
      newPatients: activeNewPatients.length,
      existingPatients: activeExistingPatients.length,
      uniquePatients: activePatientCount,
      footfall: completedFootfall,
      appointments: appointments.length,
      completed: completedFootfall,
      cancelled: cancelledCount,
      noShows: noShowCount,
      pendingConsultations: pendingCount,
      newConsultations: categoryCounts['New Consultation'] || 0,
      reviews: categoryCounts.Review || 0,
      revisits: categoryCounts.Revisit || 0,
      tokens: tokens.length,
      invoicedAmount,
      collectedAmount,
      failedPayments: failedPaymentCount,
      refunds,
      averageRevenuePerConsultation: completedFootfall ? Math.round(collectedAmount / completedFootfall) : 0,
      freeReviewEstimatedValue: waivedReviewAmount,
      repeatConsultations: repeatVisits,
      patientRetentionPercent: reportPatients.length
        ? Math.round((Object.values(patientVisitCounts).filter(count => count > 1).length / reportPatients.length) * 1000) / 10
        : 0,
      registrationGrowthPercent: percentChange(registrations.length, previousRegistrations.length),
      footfallGrowthPercent: percentChange(completedFootfall, previousFootfall),
      collectionGrowthPercent: percentChange(collectedAmount, previousCollected),
      averageRegistrationMinutes: average(registrationMinutes),
      averageWaitingMinutes: average(waitingMinutes),
      averageAppointmentDelayMinutes: average(appointmentDelayMinutes),
      averageConsultationMinutes: average(consultationDurationMinutes),
      unutilizedSlotGrossValue,
      noShowPercent: bookedAppointments.length ? Math.round((noShowCount / bookedAppointments.length) * 1000) / 10 : 0
    },
    charts: {
      trends: [...temporalSeries.values()].sort((a, b) => a.period.localeCompare(b.period)),
      periodComparisons: [
        { name: 'OP footfall', current: completedFootfall, previous: previousFootfall, growthPercent: percentChange(completedFootfall, previousFootfall) },
        { name: 'Registrations', current: registrations.length, previous: previousRegistrations.length, growthPercent: percentChange(registrations.length, previousRegistrations.length) },
        { name: 'Collections', current: collectedAmount, previous: previousCollected, growthPercent: percentChange(collectedAmount, previousCollected) }
      ],
      visitCategories: Object.entries(categoryCounts).map(([name, value]) => ({ name, value })),
      ageGroups: [...AGE_GROUPS, 'Unknown'].map(name => ({ name, value: ageCounts[name] || 0 })),
      newAgeGroups: [...AGE_GROUPS, 'Unknown'].map(name => ({ name, value: newAgeCounts[name] || 0 })),
      returningAgeGroups: [...AGE_GROUPS, 'Unknown'].map(name => ({ name, value: returningAgeCounts[name] || 0 })),
      gender: Object.entries(genderCounts).map(([name, value]) => ({ name, value })),
      ageGender: ageGenderCounts,
      ageDepartment: ageDepartmentCounts,
      genderDepartment: genderDepartmentCounts,
      districtDepartment: districtDepartmentCounts,
      ageTrends: Object.entries(ageTrendBuckets).flatMap(([period, groups]) =>
        Object.entries(groups).map(([name, value]) => ({ period, name, value }))
      ).sort((a, b) => a.period.localeCompare(b.period) || a.name.localeCompare(b.name)),
      genderTrends: Object.entries(genderTrendBuckets).map(([key, value]) => {
        const [period, name] = key.split('|');
        return { period, name, value };
      }).sort((a, b) => a.period.localeCompare(b.period) || a.name.localeCompare(b.name)),
      geographyTrends: Object.entries(geographyTrendBuckets).flatMap(([period, districts]) =>
        Object.entries(districts).map(([name, value]) => ({ period, name, value }))
      ).sort((a, b) => a.period.localeCompare(b.period) || a.name.localeCompare(b.name)),
      visitCategoryRevenue: Object.entries(visitCategoryRevenue).map(([name, value]) => ({ name, ...value })),
      visitFrequency: [
        { name: '1 completed visit', value: Object.values(patientVisitCounts).filter(count => count === 1).length },
        { name: '2 completed visits', value: Object.values(patientVisitCounts).filter(count => count === 2).length },
        { name: '3+ completed visits', value: Object.values(patientVisitCounts).filter(count => count >= 3).length }
      ],
      countries: Object.entries(geography.countries).map(([name, value]) => ({ name, value })),
      states: Object.entries(geography.states).map(([name, value]) => ({ name, value })),
      districts: Object.entries(geography.districts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
      pinCodes: Object.entries(geography.pinCodes).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
      postOffices: Object.entries(geography.postOffices).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
      localities: Object.entries(geography.localities).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
      geographyRevenue: Object.entries(geographyRevenue).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
      departments: departmentPerformance,
      doctors: doctorProductivity,
      paymentMethods: Object.entries(paymentMethodCounts).map(([name, value]) => ({ name, value, amount: paymentMethodAmounts[name] || 0 })),
      newPatientDistricts: Object.entries(newPatientDistricts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
      hourlyScheduledAppointments: Object.entries(hourlyScheduledAppointments).map(([name, value]) => ({ name, value })).sort((a, b) => a.name.localeCompare(b.name)),
      hourlyActualArrivals: Object.entries(hourlyActualArrivals).map(([name, value]) => ({ name, value })).sort((a, b) => a.name.localeCompare(b.name)),
      peakDays: weekdaySeries,
      peakHours: peakHourSeries
    },
    strategic: {
      targetComparisons,
      demandForecast: {
        targetStartDate: forecastStartDate,
        targetEndDate: forecastEndDate,
        requiredHistoryMonths: historyMonthKeys.length,
        observedHistoryMonths,
        method: 'Six-month linear trend over completed visits; exploratory only.',
        departments: demandForecast
      },
      conversionFunnel: funnel,
      planning: {
        unutilizedSlotGrossValue,
        patientFeedbackAvailable: false,
        consultationRoomUtilizationAvailable: false
      }
    },
    coverage: {
      registrationTimingRecords: registrationMinutes.length,
      arrivalRecords: waitingMinutes.length,
      consultationStartRecords: appointmentDelayMinutes.length,
      consultationDurationRecords: consultationDurationMinutes.length,
      refundRecords: payments.filter(item => Number(item.refundedAmount || 0) > 0).length,
      capacityIsEstimatedFromCurrentSchedules: true,
      geographyUsesAvailableProfileFields: true,
      conversionFunnelEvents: getFunnelEvents().length
    },
    notes: [
      'Reports aggregate the prototype JSON transactions and are not an OLTP-safe production BI layer.',
      'Wait time, adherence, consultation duration, and registration time require explicit event timestamps; missing events are excluded.',
      'Capacity utilization uses the current configured schedule for the selected historical period and is an estimate.',
      'Refund and no-show metrics are zero unless matching transaction/status records exist.',
      'Demand projections require completed visits in each of the six consecutive months before the report month; they are descriptive estimates, not staffing recommendations.',
      'Conversion drop-off uses anonymous journey events and excludes steps less than 15 minutes old; historical coverage starts only after event capture is enabled.',
      'Patient satisfaction and consultation-room utilization are unavailable until feedback and room integrations are configured.',
      'Unused-slot gross value uses current configured consultation fees and is an opportunity estimate, not expected or recognized revenue.'
    ]
  };
}

function addWorkbookSheet(workbook, name, headers, rows) {
  const sheet = workbook.addWorksheet(name);
  sheet.addRow(headers);
  sheet.addRows(rows);
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF245E87' } };
  sheet.columns = headers.map(header => ({ width: Math.min(34, Math.max(14, String(header).length + 3)) }));
  return sheet;
}

function addRegistrationAnalyticsSheets(workbook, data) {
  if (!data) return;
  const { trends, doctors, departments, registrationTypes, ...metrics } = data;
  addWorkbookSheet(workbook, 'Registration overview', ['Metric', 'Value'], [
    ['Basis', 'Patient creation dates; booking mix uses appointment dates and all statuses'],
    ['Acquisition rate', 'New patient registrations / distinct report patients'],
    ['Review and revisit rates', 'Category bookings / all bookings'],
    ...Object.entries(registrationTypes).map(([type, value]) => [`Registration type: ${type}`, value]),
    ...Object.entries(metrics).map(([name, value]) => [name, value ?? 'No data'])
  ]);
  addWorkbookSheet(workbook, 'Registration trends', ['Interval', 'Period', 'Registrations'],
    Object.entries(trends).flatMap(([interval, rows]) => rows.map(item => [interval, item.name, item.value])));
  for (const [label, rows] of [['Booking departments', departments], ['Booking doctors', doctors]]) {
    addWorkbookSheet(workbook, label, ['Name', 'Bookings', 'Patients', 'New consultations', 'Review', 'Revisit', 'Unclassified', 'Booking growth %'],
      rows.map(item => [item.name, item.total, item.patients, item.newConsultations, item.reviews, item.revisits, item.unclassified, item.growthPercent ?? 'No prior baseline']));
  }
}

function buildAnalyticsWorkbook(report) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Vitalyes';
  workbook.subject = 'Aggregated hospital business intelligence report';
  workbook.created = new Date();
  addRegistrationAnalyticsSheets(workbook, report.registrationAnalytics);
  addWorkbookSheet(workbook, 'Overview', ['Metric', 'Value'], [
    ['Hospital', report.period.hospitalName],
    ['Hospital code', report.period.hospitalCode],
    ['Period', report.period.reportPeriod],
    ['Start date', report.period.startDate],
    ['End date', report.period.endDate],
    ['Generated at', report.generatedAt],
    ['Previous period', `${report.period.previousStartDate} to ${report.period.previousEndDate}`],
    ...Object.entries(report.summary)
  ]);
  addWorkbookSheet(workbook, 'Filters', ['Filter', 'Value'], Object.entries(report.filters).map(([name, value]) => [name, value ?? 'All']));
  addWorkbookSheet(workbook, 'Period comparison', ['Metric', 'Current', 'Previous', 'Growth %'], report.charts.periodComparisons.map(item =>
    [item.name, item.current, item.previous, item.growthPercent ?? 'No prior baseline']
  ));
  addWorkbookSheet(workbook, 'Targets', ['Metric', 'Period', 'Target', 'Actual', 'Variance', 'Attainment %'], report.strategic.targetComparisons.map(item =>
    [item.metric, item.period, item.target, item.actual, item.variance, item.attainmentPercent ?? '—']
  ));
  addWorkbookSheet(workbook, 'Departments', ['Department', 'Appointments', 'Completed', 'Capacity estimate', 'Utilization %', 'Unused slots', 'Growth %', 'Invoiced', 'Collected'], report.charts.departments.map(item =>
    [item.name, item.appointments, item.completed, item.capacity, item.utilizationPercent ?? '—', item.unutilizedSlots, item.growthPercent ?? 'No prior baseline', item.invoiced, item.collected]
  ));
  addWorkbookSheet(workbook, 'Doctors', ['Doctor', 'Appointments', 'Completed', 'Capacity estimate', 'Utilization %', 'Unused slots', 'Growth %', 'Invoiced', 'Collected'], report.charts.doctors.map(item =>
    [item.name, item.appointments, item.completed, item.capacity, item.utilizationPercent ?? '—', item.unutilizedSlots, item.growthPercent ?? 'No prior baseline', item.invoiced, item.collected]
  ));
  addWorkbookSheet(workbook, 'Trends', ['Period', 'Registrations', 'Footfall', 'Appointments', 'Collected'], report.charts.trends.map(item =>
    [item.period, item.registrations, item.footfall, item.appointments, item.collected]
  ));
  addWorkbookSheet(workbook, 'Demographics', ['Age group', 'Patients'], report.charts.ageGroups.map(item => [item.name, item.value]));
  addWorkbookSheet(workbook, 'Geography', ['District', 'Patients', 'Revenue'], report.charts.districts.map(item =>
    [item.name, item.value, report.charts.geographyRevenue.find(area => area.name === item.name)?.value || 0]
  ));
  addWorkbookSheet(workbook, 'Forecast', ['Department', 'Status', 'Observed months', 'Projected visits', 'Scheduled capacity', 'Demand-capacity gap', 'Additional sessions'], report.strategic.demandForecast.departments.map(item =>
    [item.name, item.status, item.observedHistoryMonths, item.forecastVisits ?? 'Insufficient data', item.nextMonthCapacity, item.capacityGap ?? '—', item.status === 'projected' ? item.additionalSessions : '—']
  ));
  addWorkbookSheet(workbook, 'Patient funnel', ['Stage', 'Journeys', 'Drop-off', 'Drop-off %'], Object.entries(report.strategic.conversionFunnel.dropOff).map(([name, item]) =>
    [name, item.count, item.count, item.percent ?? '—']
  ));
  return workbook;
}

function buildScopedAnalyticsWorkbook(report) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Vitalyes';
  workbook.subject = `Role-scoped ${report.view} analytics report`;
  workbook.created = new Date();
  addRegistrationAnalyticsSheets(workbook, report.registrationAnalytics);
  addWorkbookSheet(workbook, 'Overview', ['Metric', 'Value'], [
    ['Hospital', report.period.hospitalName],
    ['Period', report.period.reportPeriod],
    ['Start date', report.period.startDate],
    ['End date', report.period.endDate],
    ['Report view', report.view],
    ['Generated at', report.generatedAt],
    ...Object.entries(report.summary)
  ]);
  for (const [chartName, chartData] of Object.entries(report.charts)) {
    if (Array.isArray(chartData)) {
      const columns = [...new Set(chartData.flatMap(item => Object.keys(item || {})))];
      addWorkbookSheet(
        workbook,
        chartName.slice(0, 31),
        columns.length ? columns : ['No data'],
        chartData.map(item => columns.map(column =>
          item[column] && typeof item[column] === 'object' ? JSON.stringify(item[column]) : item[column]
        ))
      );
    } else if (chartData && typeof chartData === 'object') {
      addWorkbookSheet(workbook, chartName.slice(0, 31), ['Category', 'Value'],
        Object.entries(chartData).map(([name, value]) => [
          name,
          value && typeof value === 'object' ? JSON.stringify(value) : value
        ]));
    }
  }
  return workbook;
}

function completedReportRange(frequency, referenceDate) {
  const date = new Date(`${referenceDate}T00:00:00Z`);
  let start;
  let end;
  if (frequency === 'daily') {
    end = new Date(date);
    end.setUTCDate(end.getUTCDate() - 1);
    start = new Date(end);
  } else if (frequency === 'weekly') {
    const currentWeekStart = new Date(date);
    currentWeekStart.setUTCDate(currentWeekStart.getUTCDate() - ((currentWeekStart.getUTCDay() + 6) % 7));
    end = new Date(currentWeekStart);
    end.setUTCDate(end.getUTCDate() - 1);
    start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 6);
  } else if (frequency === 'monthly') {
    end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 0));
    start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  } else if (frequency === 'quarterly') {
    const currentQuarterMonth = Math.floor(date.getUTCMonth() / 3) * 3;
    end = new Date(Date.UTC(date.getUTCFullYear(), currentQuarterMonth, 0));
    start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 2, 1));
  } else {
    end = new Date(Date.UTC(date.getUTCFullYear(), 0, 0));
    start = new Date(Date.UTC(end.getUTCFullYear(), 0, 1));
  }
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10)
  };
}

let scheduledReportRunInProgress = false;
async function runScheduledAnalyticsReports() {
  if (scheduledReportRunInProgress) return;
  scheduledReportRunInProgress = true;
  try {
    const config = getConfig();
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: config.timeZone || 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(now);
    const currentTime = `${parts.find(part => part.type === 'hour')?.value}:${parts.find(part => part.type === 'minute')?.value}`;
    const runDate = localDateString(now);
    const existingReports = getScheduledReports();
    for (const schedule of config.reportConfig?.schedules || []) {
      if (!schedule.enabled || currentTime < schedule.time ||
          existingReports.some(report => report.scheduleId === schedule.id && report.runDate === runDate)) continue;
      try {
        const range = completedReportRange(schedule.frequency, runDate);
        const report = buildAnalyticsReport({
          ...range,
          reportPeriod: schedule.frequency,
          departmentId: schedule.departmentId || '',
          doctorId: schedule.doctorId || '',
          ageGroup: '',
          gender: '',
          state: '',
          district: '',
          pincode: '',
          country: '',
          postOffice: '',
          locality: ''
        });
        const workbook = buildAnalyticsWorkbook(report);
        const buffer = await workbook.xlsx.writeBuffer();
        const reportId = uuid();
        const fileName = `${schedule.id}-${range.startDate}-${range.endDate}-${reportId.slice(0, 8)}.xlsx`;
        const outputDirectory = path.join(DATA_DIR, 'generated-reports');
        fs.mkdirSync(outputDirectory, { recursive: true });
        fs.writeFileSync(path.join(outputDirectory, fileName), buffer);
        const metadata = {
          id: reportId,
          scheduleId: schedule.id,
          scheduleName: schedule.name,
          runDate,
          generatedAt: now.toISOString(),
          startDate: range.startDate,
          endDate: range.endDate,
          fileName
        };
        existingReports.unshift(metadata);
        writeJson('scheduled-reports.json', existingReports);
      } catch (error) {
        console.error(`Scheduled report ${schedule.id} failed:`, error);
      }
    }
  } catch (error) {
    console.error('Scheduled report runner failed:', error);
  } finally {
    scheduledReportRunInProgress = false;
  }
}

// ---------- In-memory stores (prototype) ----------
const otpStore = new Map();
const sessions = new Map();

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ---------- Helpers ----------
function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-session-id',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS'
  });
  res.end(data);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) reject(new Error('Body too large'));
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
  };
  return map[ext] || 'application/octet-stream';
}

// ---------- API Router ----------
async function handleApi(req, res, pathname) {
  const method = req.method;

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, x-session-id',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS'
    });
    return res.end();
  }

  try {
    if (method === 'GET' && pathname === '/api/auth/session') {
      const principal = staffPrincipal(req);
      return sendJson(res, 200, {
        success: true,
        configured: oidcIsConfigured(),
        localLoginAvailable: process.env.NODE_ENV !== 'production',
        staff: principal ? staffView(principal) : null,
        adminCredentialsConfigured: adminCredentialsConfigured(req) || !!principal?.subject.startsWith('local:'),
        adminLoginAvailable: demoAdminLoginAvailable(req),
        demoAdminDefaultCredentials: demoAdminLoginAvailable(req) &&
          !process.env.VITALYES_ADMIN_USERNAME && !process.env.VITALYES_ADMIN_PASSWORD,
        adminUnlocked: !!principal && adminSessionIsUnlocked(req)
      });
    }

    if (method === 'POST' && ['/api/auth/local-login', '/api/auth/admin-login'].includes(pathname)) {
      if (process.env.NODE_ENV === 'production') {
        return sendJson(res, 403, { success: false, message: 'Local staff accounts are only available in prototype mode' });
      }
      if (pathname === '/api/auth/admin-login' && !demoAdminLoginAvailable(req)) {
        return sendJson(res, 403, { success: false, message: 'Local administrator sign-in is available only from this computer' });
      }
      const { address, attempt, blocked } = loginAttemptState(req);
      const now = Date.now();
      if (blocked) return sendJson(res, 429, { success: false, message: 'Too many sign-in attempts. Try again later.' });
      const body = await parseBody(req);
      let principal = pathname === '/api/auth/local-login' ? await authenticateLocalUser(body?.username, body?.password) : null;
      if (!principal && demoAdminLoginAvailable(req) && adminCredentialsMatch(req, body?.username, body?.password)) {
        principal = demoAdminPrincipal();
      }
      if (!principal) {
        recordFailedLogin(address, attempt);
        return sendJson(res, 401, { success: false, message: 'Username or password is invalid' });
      }
      loginAttempts.delete(address);
      for (const [token, session] of staffSessions) {
        if (session.expiresAt <= now) {
          staffSessions.delete(token);
          adminUnlocks.delete(token);
        }
      }
      if (staffSessions.size >= 5000) return sendJson(res, 503, { success: false, message: 'Staff session capacity is temporarily unavailable' });
      const previousToken = readCookie(req, STAFF_SESSION_COOKIE);
      staffSessions.delete(previousToken);
      adminUnlocks.delete(previousToken);
      const token = crypto.randomBytes(32).toString('base64url');
      staffSessions.set(token, { principal, expiresAt: now + STAFF_SESSION_SECONDS * 1000 });
      if (principal.permissions.some(permission => ['config:manage', 'hospital:configure'].includes(permission))) {
        adminUnlocks.set(token, { expiresAt: now + STAFF_SESSION_SECONDS * 1000 });
      }
      setStaffCookie(res, token, STAFF_SESSION_SECONDS);
      return sendJson(res, 200, { success: true });
    }

    if (pathname === '/api/admin/users' && ['GET', 'POST'].includes(method)) {
      if (process.env.NODE_ENV === 'production') return sendJson(res, 403, { success: false, message: 'Local staff accounts are only available in prototype mode' });
      if (!requireStaffPermission(req, res, ['config:manage', 'hospital:configure'])) return;
      if (!adminSessionIsUnlocked(req)) return sendJson(res, 401, { success: false, message: 'Administrator sign-in is required' });
      const users = readStaffUsers();
      if (method === 'GET') return sendJson(res, 200, { success: true, data: users.map(({ name, username, roles, departmentIds }) => ({ name, username, roles, departmentIds })) });
      const body = await parseBody(req);
      const name = typeof body?.name === 'string' ? body.name.trim() : '';
      const username = typeof body?.username === 'string' ? body.username.trim().toLowerCase() : '';
      const password = body?.password;
      const roles = body?.roles;
      const departmentIds = body?.departmentIds;
      const config = getConfig();
      if (!name || name.length > 100 || !/^[a-z0-9._-]{3,64}$/.test(username) ||
          typeof password !== 'string' || password.length < 12 || password.length > 256 ||
          !Array.isArray(roles) || !roles.length || new Set(roles).size !== roles.length ||
          roles.some(role => typeof role !== 'string' || !config.roles.some(item => item.name === role)) ||
          !Array.isArray(departmentIds) || new Set(departmentIds).size !== departmentIds.length ||
          departmentIds.some(id => typeof id !== 'string' || !config.departments.some(item => item.id === id)) ||
          roles.some(role => config.roles.find(item => item.name === role).permissions.includes('report:department')) && !departmentIds.length) {
        return sendJson(res, 400, { success: false, message: 'Enter a name, a valid username, a password of 12–256 characters, valid roles and required departments.' });
      }
      if (username === 'admin' || username === (process.env.VITALYES_ADMIN_USERNAME || '').toLowerCase() || users.some(user => user.username === username)) {
        return sendJson(res, 409, { success: false, message: 'Username is already in use or reserved.' });
      }
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = await passwordHash(password, salt);
      // Re-read after hashing so concurrent requests cannot overwrite each other.
      const currentUsers = readStaffUsers();
      if (currentUsers.some(user => user.username === username)) return sendJson(res, 409, { success: false, message: 'Username is already in use.' });
      currentUsers.push({ name, username, roles, departmentIds, salt, passwordHash: hash });
      writeStaffUsers(currentUsers);
      return sendJson(res, 201, { success: true, message: 'Staff user created.' });
    }

    if (method === 'GET' && pathname === '/api/auth/login') {
      if (!oidcIsConfigured()) {
        return sendJson(res, 503, { success: false, message: 'OIDC staff sign-in is not configured' });
      }
      for (const [state, transaction] of oidcTransactions) {
        if (transaction.expiresAt <= Date.now()) oidcTransactions.delete(state);
      }
      if (oidcTransactions.size >= 1000) {
        return sendJson(res, 429, { success: false, message: 'Too many active sign-in requests; try again shortly' });
      }
      const client = await getOidcClient();
      const state = generators.state();
      const nonce = generators.nonce();
      const codeVerifier = generators.codeVerifier();
      const codeChallenge = generators.codeChallenge(codeVerifier);
      oidcTransactions.set(state, {
        state,
        nonce,
        codeVerifier,
        expiresAt: Date.now() + OIDC_TRANSACTION_SECONDS * 1000
      });
      const settings = oidcSettings();
      const authorizationUrl = client.authorizationUrl({
        scope: settings.scope,
        redirect_uri: settings.callbackUrl,
        response_type: 'code',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        state,
        nonce
      });
      res.writeHead(302, { Location: authorizationUrl, 'Cache-Control': 'no-store' });
      return res.end();
    }

    if (method === 'GET' && pathname === '/api/auth/callback') {
      if (!oidcIsConfigured()) {
        return sendJson(res, 503, { success: false, message: 'OIDC staff sign-in is not configured' });
      }
      const client = await getOidcClient();
      const params = client.callbackParams(req);
      const transaction = oidcTransactions.get(params.state);
      if (!transaction || transaction.expiresAt <= Date.now()) {
        oidcTransactions.delete(params.state);
        return sendJson(res, 400, { success: false, message: 'Sign-in state is missing, expired, or invalid' });
      }
      oidcTransactions.delete(params.state);
      if (params.error) {
        console.info('[AUTH] OIDC sign-in was cancelled or rejected by the identity provider');
        res.writeHead(302, { Location: '/?staffAuthError=login_failed', 'Cache-Control': 'no-store' });
        return res.end();
      }
      const settings = oidcSettings();
      const tokenSet = await client.callback(settings.callbackUrl, params, {
        state: transaction.state,
        nonce: transaction.nonce,
        code_verifier: transaction.codeVerifier
      });
      const mapped = mapStaffIdentity(tokenSet.claims());
      if (mapped.error) {
        console.warn(`[AUTH] OIDC sign-in denied: ${mapped.error}`);
        const destination = mapped.error === 'hospital_scope' ? 'hospital_scope' : 'unmapped_role';
        res.writeHead(302, { Location: `/?staffAuthError=${destination}`, 'Cache-Control': 'no-store' });
        return res.end();
      }
      for (const [token, session] of staffSessions) {
        if (session.expiresAt <= Date.now()) staffSessions.delete(token);
      }
      if (staffSessions.size >= 5000) {
        return sendJson(res, 503, { success: false, message: 'Staff session capacity is temporarily unavailable' });
      }
      const sessionToken = crypto.randomBytes(32).toString('base64url');
      staffSessions.set(sessionToken, {
        principal: mapped.principal,
        expiresAt: Date.now() + STAFF_SESSION_SECONDS * 1000
      });
      setStaffCookie(res, sessionToken, STAFF_SESSION_SECONDS);
      console.info(`[AUTH] OIDC sign-in accepted for configured roles: ${mapped.principal.roles.join(', ')}`);
      res.writeHead(302, { Location: '/', 'Cache-Control': 'no-store' });
      return res.end();
    }

    if (method === 'POST' && pathname === '/api/auth/logout') {
      const sessionToken = readCookie(req, STAFF_SESSION_COOKIE);
      if (sessionToken) staffSessions.delete(sessionToken);
      if (sessionToken) adminUnlocks.delete(sessionToken);
      setStaffCookie(res, '', 0);
      return sendJson(res, 200, { success: true });
    }

    if (method === 'POST' && pathname === '/api/admin/login') {
      const principal = requireStaffPermission(req, res, ['config:manage', 'hospital:configure']);
      if (!principal) return;
      const { address, attempt, blocked } = loginAttemptState(req);
      if (blocked) return sendJson(res, 429, { success: false, message: 'Too many sign-in attempts. Try again later.' });
      const body = await parseBody(req);
      const localPrincipal = process.env.NODE_ENV !== 'production' ? await authenticateLocalUser(body?.username, body?.password) : null;
      if (!(localPrincipal && localPrincipal.subject === principal.subject) && !adminCredentialsMatch(req, body?.username, body?.password)) {
        recordFailedLogin(address, attempt);
        return sendJson(res, 401, { success: false, message: 'Administrator username or password is invalid' });
      }
      loginAttempts.delete(address);
      const sessionToken = readCookie(req, STAFF_SESSION_COOKIE);
      for (const [token, unlock] of adminUnlocks) {
        if (unlock.expiresAt <= Date.now()) adminUnlocks.delete(token);
      }
      adminUnlocks.set(sessionToken, { expiresAt: Date.now() + STAFF_SESSION_SECONDS * 1000 });
      return sendJson(res, 200, { success: true });
    }

    if (method === 'POST' && pathname === '/api/admin/logout') {
      const principal = requireStaffPermission(req, res, ['config:manage', 'hospital:configure']);
      if (!principal) return;
      const sessionToken = readCookie(req, STAFF_SESSION_COOKIE);
      if (sessionToken) adminUnlocks.delete(sessionToken);
      return sendJson(res, 200, { success: true });
    }

    if (pathname === '/api/admin/config' && ['GET', 'PUT'].includes(method)) {
      if (!requireStaffPermission(req, res, ['config:manage', 'hospital:configure'])) return;
      if (!adminSessionIsUnlocked(req)) {
        return sendJson(res, 401, { success: false, message: 'Administrator sign-in is required' });
      }
      if (method === 'GET') return sendJson(res, 200, { success: true, data: getConfig() });
      const candidate = await parseBody(req);
      const validationError = validateConfig(candidate);
      if (validationError) return sendJson(res, 400, { success: false, message: validationError });
      writeConfig(candidate);
      return sendJson(res, 200, { success: true, data: candidate, message: 'Settings saved' });
    }

    if (method === 'GET' && pathname === '/api/health') {
      return sendJson(res, 200, {
        success: true,
        service: 'Vitalyes Patient Registration Prototype',
        mode: 'JSON database + simulated integrations',
        time: new Date().toISOString()
      });
    }

    if (method === 'GET' && pathname === '/api/config') {
      const { roles, ...publicConfig } = getConfig();
      return sendJson(res, 200, { success: true, data: publicConfig });
    }

    if (method === 'GET' && pathname === '/api/geography') {
      return sendJson(res, 200, { success: true, data: geographicOptions() });
    }

    if (method === 'POST' && pathname === '/api/otp/send') {
      const body = await parseBody(req);
      const mobile = normalizePhone(body.mobile);
      if (!mobile) {
        return sendJson(res, 400, { success: false, message: 'Enter a possible phone number with country code' });
      }
      const otp = generateOtp();
      const journeyId = uuid();
      otpStore.set(mobile, { otp, createdAt: Date.now(), expiresAt: Date.now() + 120000, journeyId });
      recordFunnelEvent(journeyId, 'identity_started');
      console.log(`[OTP] Mobile: ${mobile} | OTP: ${otp}`);
      return sendJson(res, 200, {
        success: true,
        message: 'OTP sent successfully (simulated)',
        prototypeOtp: otp,
        expiresInSeconds: 120
      });
    }

    if (method === 'POST' && pathname === '/api/identity/mrn') {
      const body = await parseBody(req);
      const patient = getPatients().find(record => record.mrn?.toLowerCase() === String(body.mrn || '').trim().toLowerCase());
      if (!patient) return sendJson(res, 404, { success: false, message: 'MRN not found' });
      const otp = generateOtp();
      const journeyId = uuid();
      otpStore.set(normalizePhone(patient.mobile), { otp, createdAt: Date.now(), expiresAt: Date.now() + 120000, journeyId });
      recordFunnelEvent(journeyId, 'identity_started');
      console.log(`[OTP] MRN verification | OTP: ${otp}`);
      return sendJson(res, 200, {
        success: true,
        mobile: `${patient.mobile.slice(0, 2)}••••${patient.mobile.slice(-2)}`,
        prototypeOtp: otp,
        message: 'Verification code sent to the mobile number on the patient record'
      });
    }

    if (method === 'POST' && pathname === '/api/identity/mrn/verify') {
      const body = await parseBody(req);
      const patient = getPatients().find(record => record.mrn?.toLowerCase() === String(body.mrn || '').trim().toLowerCase());
      const otpRecord = patient && otpStore.get(normalizePhone(patient.mobile));
      if (!patient || !otpRecord || Date.now() > otpRecord.expiresAt || otpRecord.otp !== String(body.otp || '')) {
        return sendJson(res, 400, { success: false, message: 'Invalid or expired MRN verification code' });
      }
      otpStore.delete(normalizePhone(patient.mobile));
      recordFunnelEvent(otpRecord.journeyId, 'identity_verified');
      recordFunnelEvent(otpRecord.journeyId, 'existing_patient_verified');
      const sessionId = uuid();
      sessions.set(sessionId, {
        mobile: patient.mobile,
        verified: true,
        patientId: patient.id,
        isNew: false,
        journeyId: otpRecord.journeyId,
        createdAt: Date.now(),
        identityStartedAt: otpRecord.createdAt
      });
      return sendJson(res, 200, {
        success: true,
        sessionId,
        isExistingPatient: true,
        patient: {
          id: patient.id,
          mrn: patient.mrn,
          firstName: patient.firstName,
          lastName: patient.lastName,
          mobile: patient.mobile,
          gender: patient.gender,
          dob: patient.dob,
          address: patient.address,
          locality: patient.locality || patient.city || '',
          postOffice: patient.postOffice,
          district: patient.district,
          state: patient.state,
          country: patient.country || '',
          pincode: patient.pincode,
          email: patient.email,
          bloodGroup: patient.bloodGroup
        }
      });
    }

    if (method === 'POST' && pathname === '/api/otp/verify') {
      const body = await parseBody(req);
      const mobile = normalizePhone(body.mobile);
      const { otp } = body;
      if (!mobile || !otp) {
        return sendJson(res, 400, { success: false, message: 'Mobile and OTP required' });
      }
      const record = otpStore.get(mobile);
      if (!record) {
        return sendJson(res, 400, { success: false, message: 'OTP not found or expired. Please request a new one.' });
      }
      if (Date.now() > record.expiresAt) {
        otpStore.delete(mobile);
        return sendJson(res, 400, { success: false, message: 'OTP has expired. Please request a new one.' });
      }
      if (record.otp !== String(otp)) {
        return sendJson(res, 400, { success: false, message: 'Invalid OTP' });
      }
      otpStore.delete(mobile);

      const patient = findPatientByMobile(mobile);
      recordFunnelEvent(record.journeyId, 'identity_verified');
      recordFunnelEvent(record.journeyId, patient ? 'existing_patient_verified' : 'new_patient_verified');
      const sessionId = uuid();
      sessions.set(sessionId, {
        mobile,
        verified: true,
        patientId: patient ? patient.id : null,
        isNew: !patient,
        journeyId: record.journeyId,
        createdAt: Date.now(),
        identityStartedAt: record.createdAt
      });

      return sendJson(res, 200, {
        success: true,
        message: 'OTP verified',
        sessionId,
        isExistingPatient: !!patient,
        patient: patient ? {
          id: patient.id,
          mrn: patient.mrn,
          firstName: patient.firstName,
          lastName: patient.lastName,
          mobile: patient.mobile,
          gender: patient.gender,
          dob: patient.dob,
          address: patient.address,
          locality: patient.locality || patient.city || '',
          postOffice: patient.postOffice,
          district: patient.district,
          state: patient.state,
          country: patient.country || '',
          pincode: patient.pincode,
          email: patient.email,
          bloodGroup: patient.bloodGroup
        } : null
      });
    }

    if (method === 'POST' && pathname === '/api/patients') {
      const body = await parseBody(req);
      const { sessionId, firstName, lastName, dob, gender, email, address, locality, postOffice, district, state, country, pincode, alternateMobile, bloodGroup, registrationType } = body;

      if (!sessionId || !sessions.has(sessionId)) {
        return sendJson(res, 401, { success: false, message: 'Invalid or expired session' });
      }
      const session = sessions.get(sessionId);
      if (!session.verified) {
        return sendJson(res, 401, { success: false, message: 'Session not verified' });
      }
      if (!String(firstName || '').trim() || !String(lastName || '').trim() ||
          !isValidDate(dob) || dob > localDateString() || !['Male', 'Female', 'Other'].includes(gender) ||
          !String(address || '').trim() || !String(district || '').trim() || !String(state || '').trim() ||
          !String(country || '').trim() || !['OP', 'IP', 'ER'].includes(registrationType)) {
        return sendJson(res, 400, { success: false, message: 'Complete all required patient and address fields and select a registration type' });
      }
      if (String(country).trim().toLowerCase() === 'india' &&
          (!String(postOffice || '').trim() || !/^\d{6}$/.test(String(pincode || '').trim()))) {
        return sendJson(res, 400, { success: false, message: 'For India, enter a post office and a valid 6-digit PIN code' });
      }
      if (String(pincode || '').length > 20) {
        return sendJson(res, 400, { success: false, message: 'Postal code must be at most 20 characters' });
      }

      const existing = findPatientByMobile(session.mobile);
      if (existing) {
        return sendJson(res, 409, { success: false, message: 'Patient with this mobile already exists', patient: existing });
      }

      const patient = createPatient({
        mobile: session.mobile,
        registrationStartedAt: new Date(session.identityStartedAt || Date.now()).toISOString(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        dob,
        gender,
        email: String(email || '').trim(),
        address: String(address).trim(),
        locality: String(locality || '').trim(),
        alternateMobile: String(alternateMobile || '').trim(),
        postOffice: String(postOffice || '').trim(),
        district: String(district).trim(),
        state: String(state).trim(),
        country: String(country).trim(),
        pincode: String(pincode || '').trim(),
        registrationType,
        bloodGroup: String(bloodGroup || '').trim()
      });

      session.patientId = patient.id;
      sessions.set(sessionId, session);
      recordFunnelEvent(session.journeyId, 'patient_registered');

      return sendJson(res, 201, {
        success: true,
        message: 'Patient registered successfully',
        patient: {
          id: patient.id,
          mrn: patient.mrn,
          firstName: patient.firstName,
          lastName: patient.lastName,
          mobile: patient.mobile
        }
      });
    }

    if (method === 'GET' && pathname === '/api/doctors') {
      const config = getConfig();
      return sendJson(res, 200, {
        success: true,
        data: config.doctors || [],
        departments: config.departments || []
      });
    }

    if (method === 'GET' && pathname === '/api/dates') {
      const start = new Date(`${localDateString()}T00:00:00Z`);
      const dates = [];
      for (let offset = 0; offset < 45 && dates.length < 21; offset += 1) {
        const date = new Date(start);
        date.setUTCDate(start.getUTCDate() + offset);
        const dateString = date.toISOString().slice(0, 10);
        if ((getConfig().doctors || []).some(doctor => getSlots(doctor, dateString).length > 0)) dates.push(dateString);
      }
      return sendJson(res, 200, { success: true, data: dates });
    }

    if (method === 'GET' && pathname === '/api/visit-context') {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const session = sessions.get(url.searchParams.get('sessionId'));
      if (!session?.patientId) return sendJson(res, 401, { success: false, message: 'Verified patient session required' });
      const config = getConfig();
      const previous = getConsultations()
        .filter(consultation => consultation.patientId === session.patientId && consultation.status === 'completed')
        .sort((a, b) => b.consultationDate.localeCompare(a.consultationDate))[0];
      const doctor = previous ? getDoctor(config, previous.doctorId) : null;
      const requestedDate = url.searchParams.get('date');
      const classification = doctor && requestedDate
        ? classifyVisit(session.patientId, doctor.id, 'followup', requestedDate, config)
        : null;
      return sendJson(res, 200, {
        success: true,
        data: {
          previousConsultation: previous || null,
          doctor: doctor || null,
          classification
        }
      });
    }

    if (method === 'GET' && pathname === '/api/slots') {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const doctorId = url.searchParams.get('doctorId');
      const date = url.searchParams.get('date');
      const doctor = getDoctor(getConfig(), doctorId);
      if (!doctor) return sendJson(res, 404, { success: false, message: 'Doctor not found' });
      if (!isValidDate(date)) return sendJson(res, 400, { success: false, message: 'A valid appointment date is required' });
      const slots = getSlots(doctor, date);
      const suggestions = [];
      if (!slots.length) {
        const base = new Date(`${date}T00:00:00Z`);
        for (let offset = -1; offset <= 30 && suggestions.length < 2; offset += 1) {
          if (offset === 0) continue;
          const candidate = new Date(base);
          candidate.setUTCDate(base.getUTCDate() + offset);
          const candidateDate = candidate.toISOString().slice(0, 10);
          if (candidateDate < localDateString()) continue;
          if (getSlots(doctor, candidateDate).length) suggestions.push(candidateDate);
        }
      }
      return sendJson(res, 200, {
        success: true,
        data: slots,
        suggestions
      });
    }

    if (method === 'POST' && pathname === '/api/invoices') {
      const body = await parseBody(req);
      const { sessionId, doctorId, slotId, appointmentDate, visitIntent } = body;

      if (!sessionId || !sessions.has(sessionId)) {
        return sendJson(res, 401, { success: false, message: 'Invalid session' });
      }
      const session = sessions.get(sessionId);
      if (!session.patientId) {
        return sendJson(res, 400, { success: false, message: 'Patient not registered in this session' });
      }

      const config = getConfig();
      const patient = findPatientById(session.patientId);
      const doctor = getDoctor(config, doctorId);
      if (!doctor || !isValidDate(appointmentDate) || !slotId) {
        return sendJson(res, 400, { success: false, message: 'Valid doctor, appointment date and slot are required' });
      }
      const slot = getSlots(doctor, appointmentDate).find(item => item.id === slotId);
      if (!slot) return sendJson(res, 409, { success: false, message: 'That appointment slot is no longer available. Please select another slot.' });

      const classification = classifyVisit(
        patient.id,
        doctor.id,
        visitIntent === 'new' ? 'new' : 'followup',
        appointmentDate,
        config
      );
      const appointmentId = `APT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const appointments = getAppointments();
      appointments.push({
        id: appointmentId,
        patientId: patient.id,
        doctorId: doctor.id,
        department: doctor.department,
        appointmentDate,
        appointmentTime: slot.time,
        visitCategory: classification.category,
        status: 'pending_payment',
        reviewConsultationId: classification.consultationId,
        reviewExpiresOn: classification.expiresOn,
        holdExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString()
      });
      saveAppointments(appointments);

      const registrationFee = session.isNew ? (config.charges?.registrationFee ?? 100) : 0;
      const consultationFee = classification.fee ?? doctor.fee ?? config.charges?.consultationBase ?? 300;
      const lineItems = [];

      if (registrationFee > 0) {
        lineItems.push({ description: 'Registration Fee', quantity: 1, unitPrice: registrationFee, amount: registrationFee });
      }
      const tokenFee = Number(config.charges?.tokenFee) || 0;
      if (tokenFee > 0) {
        lineItems.push({ description: 'Token Fee', quantity: 1, unitPrice: tokenFee, amount: tokenFee });
      }
      lineItems.push({
        description: `${classification.category} - ${doctor.name}`,
        quantity: 1,
        unitPrice: consultationFee,
        amount: consultationFee
      });

      const subtotal = lineItems.reduce((sum, i) => sum + i.amount, 0);
      const taxPercent = config.taxPercent || 0;
      const tax = Math.round(subtotal * (taxPercent / 100));
      const total = subtotal + tax;

      const invoice = createInvoice({
        patientId: patient.id,
        patientMrn: patient.mrn,
        patientName: `${patient.firstName} ${patient.lastName}`,
        mobile: patient.mobile,
        doctorId: doctor.id,
        doctorName: doctor.name,
        department: doctor.department,
        appointmentId,
        appointmentDate,
        appointmentTime: slot.time,
        slotId,
        visitCategory: classification.category,
        reviewConsultationId: classification.consultationId,
        reviewExpiresOn: classification.expiresOn,
        lineItems,
        subtotal,
        tax,
        taxPercent,
        total,
        currency: config.currency || 'INR',
        status: 'issued'
      });

      session.invoiceId = invoice.id;
      session.appointmentId = appointmentId;
      sessions.set(sessionId, session);
      recordFunnelEvent(session.journeyId, 'appointment_reserved');

      return sendJson(res, 201, { success: true, message: 'Invoice created', invoice });
    }

    if (method === 'GET' && pathname.startsWith('/api/invoices/')) {
      const id = pathname.split('/').pop();
      const invoice = getInvoices().find(i => i.id === id);
      if (!invoice) return sendJson(res, 404, { success: false, message: 'Invoice not found' });
      return sendJson(res, 200, { success: true, data: invoice });
    }

    if (method === 'POST' && pathname === '/api/payments/initiate') {
      const body = await parseBody(req);
      const { sessionId, invoiceId, paymentMethod } = body;
      if (!sessionId || !sessions.has(sessionId)) {
        return sendJson(res, 401, { success: false, message: 'Invalid session' });
      }
      const invoice = getInvoices().find(i => i.id === invoiceId);
      if (!invoice) return sendJson(res, 404, { success: false, message: 'Invoice not found' });
      if (invoice.patientId !== sessions.get(sessionId).patientId) {
        return sendJson(res, 403, { success: false, message: 'Invoice does not belong to this patient session' });
      }
      if (invoice.status === 'paid') {
        return sendJson(res, 400, { success: false, message: 'Invoice already paid' });
      }
      const configuredMethods = getConfig().paymentConfig?.enabledMethods || ['upi', 'card', 'netBanking', 'cash'];
      const methodConfig = {
        upi: 'upi',
        card: 'card',
        net_banking: 'netBanking',
        cash_counter: 'cash'
      };
      if (!methodConfig[paymentMethod] || !configuredMethods.includes(methodConfig[paymentMethod]) ||
          (paymentMethod === 'cash_counter' && getConfig().paymentConfig?.counterConfirmationEnabled === false)) {
        return sendJson(res, 400, { success: false, message: 'Select a supported payment method' });
      }
      const appointments = getAppointments();
      const appointment = appointments.find(item => item.id === invoice.appointmentId);
      if (!appointment) return sendJson(res, 404, { success: false, message: 'Appointment reservation not found' });
      if (appointment.status !== 'pending_payment' || Date.parse(appointment.holdExpiresAt || '') <= Date.now()) {
        const available = getSlots(getDoctor(getConfig(), invoice.doctorId), invoice.appointmentDate)
          .some(slot => slot.id === invoice.slotId);
        if (!available) return sendJson(res, 409, { success: false, message: 'The appointment slot is no longer available. Please book another time.' });
        appointment.status = 'pending_payment';
        appointment.holdExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        saveAppointments(appointments);
      }

      const payment = createPayment({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        patientId: invoice.patientId,
        amount: invoice.total,
        currency: invoice.currency,
        method: paymentMethod,
        status: 'pending'
      });

      const session = sessions.get(sessionId);
      session.paymentId = payment.id;
      delete session.counterAuthorization;
      sessions.set(sessionId, session);
      recordFunnelEvent(session.journeyId, 'payment_started');

      return sendJson(res, 200, {
        success: true,
        message: 'Payment initiated (simulated)',
        payment: { id: payment.id, amount: payment.amount, currency: payment.currency, status: payment.status, method: payment.method }
      });
    }

    if (method === 'POST' && pathname === '/api/payments/counter-authorize') {
      if (process.env.NODE_ENV === 'production') {
        return sendJson(res, 403, { success: false, message: 'Local staff accounts are only available in prototype mode' });
      }
      const body = await parseBody(req);
      const session = sessions.get(body.sessionId);
      if (!session) return sendJson(res, 401, { success: false, message: 'Invalid patient session' });
      if (session.paymentId !== body.paymentId) return sendJson(res, 403, { success: false, message: 'Payment does not belong to this patient session' });
      const payment = getPayments().find(item => item.id === body.paymentId);
      if (!payment || payment.status !== 'pending' || payment.method !== 'cash_counter') {
        return sendJson(res, 409, { success: false, message: 'A pending counter payment is required' });
      }
      const { address, attempt, blocked } = loginAttemptState(req);
      if (blocked) return sendJson(res, 429, { success: false, message: 'Too many sign-in attempts. Try again later.' });
      const principal = await authenticateLocalUser(body.username, body.password);
      if (!principal) {
        recordFailedLogin(address, attempt);
        return sendJson(res, 401, { success: false, message: 'Username or password is invalid' });
      }
      loginAttempts.delete(address);
      if (!principal.permissions.includes('payment:collect')) {
        return sendJson(res, 403, { success: false, message: 'This staff account is not permitted to confirm counter payments' });
      }
      if (sessions.get(body.sessionId) !== session || session.paymentId !== body.paymentId ||
          !getPayments().some(item => item.id === body.paymentId && item.status === 'pending' && item.method === 'cash_counter')) {
        return sendJson(res, 409, { success: false, message: 'The counter payment is no longer pending' });
      }
      const authorization = crypto.randomBytes(32).toString('base64url');
      session.counterAuthorization = {
        token: authorization, paymentId: payment.id, subject: principal.subject,
        expiresAt: Date.now() + 5 * 60 * 1000
      };
      return sendJson(res, 200, { success: true, authorization, name: principal.name });
    }

    if (method === 'POST' && pathname === '/api/payments/confirm') {
      const body = await parseBody(req);
      const { sessionId, paymentId, outcome } = body;
      if (!sessionId || !sessions.has(sessionId)) {
        return sendJson(res, 401, { success: false, message: 'Invalid session' });
      }
      const session = sessions.get(sessionId);
      if (session.paymentId !== paymentId) {
        return sendJson(res, 403, { success: false, message: 'Payment does not belong to this patient session' });
      }
      if (!['success', 'failed', 'cancelled'].includes(outcome)) {
        return sendJson(res, 400, { success: false, message: 'Invalid outcome' });
      }

      const pendingPayment = getPayments().find(item => item.id === paymentId);
      if (!pendingPayment || pendingPayment.status !== 'pending') {
        return sendJson(res, 409, { success: false, message: 'Payment is not pending or has already been processed' });
      }
      if (pendingPayment.method === 'cash_counter' && outcome === 'success') {
        const grant = session.counterAuthorization;
        const authorizedUser = grant && grant.expiresAt > Date.now() && grant.paymentId === paymentId &&
          typeof body.counterAuthorization === 'string' &&
          constantTimeStringMatch(grant.token, body.counterAuthorization)
          ? readStaffUsers().find(user => `local:${user.username}` === grant.subject) : null;
        const authorizedPrincipal = authorizedUser && localStaffPrincipal(authorizedUser);
        if (!authorizedPrincipal?.permissions.includes('payment:collect') &&
            !requireStaffPermission(req, res, ['payment:collect'])) return;
      }
      delete session.counterAuthorization;
      const payment = updatePayment(paymentId, {
        status: outcome === 'success' ? 'success' : outcome,
        transactionRef: outcome === 'success' ? `TXN-SIM-${Date.now()}` : null,
        completedAt: new Date().toISOString()
      });
      if (!payment) return sendJson(res, 404, { success: false, message: 'Payment not found' });
      recordFunnelEvent(
        session.journeyId,
        outcome === 'success' ? 'payment_succeeded' : 'payment_failed'
      );

      let invoice = null;
      let token = null;

      if (outcome === 'success') {
        invoice = updateInvoice(payment.invoiceId, {
          status: 'paid',
          paidAt: new Date().toISOString(),
          paymentId: payment.id
        });
        token = createToken({
          patientId: payment.patientId,
          invoiceId: payment.invoiceId,
          paymentId: payment.id,
          doctorId: invoice?.doctorId,
          doctorName: invoice?.doctorName,
          appointmentDate: invoice?.appointmentDate,
          appointmentId: invoice?.appointmentId
        });
        const appointments = getAppointments();
        const appointment = appointments.find(item => item.id === invoice?.appointmentId);
        if (appointment) {
          appointment.status = 'confirmed';
          appointment.confirmedAt = new Date().toISOString();
          saveAppointments(appointments);
          token.appointmentId = appointment.id;
        }
        session.tokenId = token.id;
        sessions.set(sessionId, session);
      } else {
        const appointments = getAppointments();
        const appointment = appointments.find(item => item.id === session.appointmentId && item.status === 'pending_payment');
        if (appointment) {
          appointment.status = 'payment_failed';
          appointment.updatedAt = new Date().toISOString();
          saveAppointments(appointments);
        }
      }

      return sendJson(res, 200, {
        success: true,
        message: `Payment ${outcome}`,
        payment,
        invoice,
        token
      });
    }

    if (method === 'GET' && pathname.startsWith('/api/receipt/')) {
      const invoiceId = pathname.split('/').pop();
      const invoice = getInvoices().find(i => i.id === invoiceId);
      if (!invoice) return sendJson(res, 404, { success: false, message: 'Invoice not found' });
      const patientSession = sessions.get(req.headers['x-session-id']);
      if (!patientSession || patientSession.invoiceId !== invoiceId) {
        return sendJson(res, 403, { success: false, message: 'Receipt is only available to the patient session that created the invoice' });
      }
      const payment = getPayments().find(p => p.invoiceId === invoice.id && p.status === 'success');
      const token = getTokens().find(t => t.invoiceId === invoice.id);
      return sendJson(res, 200, { success: true, data: { invoice, payment, token } });
    }

    if (method === 'POST' && /^\/api\/appointments\/[^/]+\/complete$/.test(pathname)) {
      const appointmentId = pathname.split('/')[3];
      const principal = requireStaffPermission(req, res, ['consultation:complete', 'appointment:manage']);
      if (!principal) return;
      const body = await parseBody(req);
      const appointments = getAppointments();
      const appointment = appointments.find(item => item.id === appointmentId);
      if (!appointment) return sendJson(res, 404, { success: false, message: 'Appointment not found' });
      if (principal.permissions.includes('report:department') &&
          !principal.departmentIds.includes(appointment.department)) {
        return sendJson(res, 403, { success: false, message: 'Appointment is outside your assigned departments' });
      }
      if (appointment.status === 'completed') return sendJson(res, 409, { success: false, message: 'Consultation is already marked complete' });
      if (appointment.status !== 'confirmed') return sendJson(res, 409, { success: false, message: 'Only confirmed appointments can be completed' });
      const appointmentTime = hospitalDateTime(appointment.appointmentDate, appointment.appointmentTime, getConfig().timeZone || 'Asia/Kolkata');
      if (appointmentTime > new Date()) return sendJson(res, 400, { success: false, message: 'A future appointment cannot be marked complete' });
      if ((body.arrivalTime && !isValidTime(body.arrivalTime)) ||
          (body.consultationStartTime && !isValidTime(body.consultationStartTime))) {
        return sendJson(res, 400, { success: false, message: 'Arrival and consultation start times must use HH:MM' });
      }

      const arrivedAt = body.arrivalTime
        ? hospitalDateTime(appointment.appointmentDate, body.arrivalTime, getConfig().timeZone || 'Asia/Kolkata')
        : null;
      const consultationStartedAt = body.consultationStartTime
        ? hospitalDateTime(appointment.appointmentDate, body.consultationStartTime, getConfig().timeZone || 'Asia/Kolkata')
        : null;
      if (consultationStartedAt && consultationStartedAt > new Date()) {
        return sendJson(res, 400, { success: false, message: 'Consultation start cannot be in the future' });
      }
      if (arrivedAt && consultationStartedAt && arrivedAt > consultationStartedAt) {
        return sendJson(res, 400, { success: false, message: 'Patient arrival must be before consultation start' });
      }

      appointment.status = 'completed';
      appointment.completedAt = new Date().toISOString();
      if (arrivedAt) appointment.arrivedAt = arrivedAt.toISOString();
      if (consultationStartedAt) appointment.consultationStartedAt = consultationStartedAt.toISOString();
      appointment.consultationEndedAt = appointment.completedAt;
      saveAppointments(appointments);
      const consultations = getConsultations();
      consultations.push({
        id: `CONS-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        appointmentId: appointment.id,
        patientId: appointment.patientId,
        doctorId: appointment.doctorId,
        department: appointment.department,
        consultationDate: appointment.appointmentDate,
        status: 'completed',
        arrivedAt: appointment.arrivedAt || null,
        consultationStartedAt: appointment.consultationStartedAt || null,
        consultationEndedAt: appointment.consultationEndedAt,
        completedAt: appointment.completedAt
      });
      writeJson('consultations.json', consultations);
      return sendJson(res, 200, { success: true, data: appointment });
    }

    if (method === 'GET' && pathname === '/api/reports/scheduled') {
      if (!requireStaffPermission(req, res, ['report:strategic'])) return;
      return sendJson(res, 200, {
        success: true,
        data: getScheduledReports().map(({ id, scheduleName, generatedAt, startDate, endDate }) => ({
          id,
          scheduleName,
          generatedAt,
          startDate,
          endDate
        }))
      });
    }

    if (method === 'GET' && pathname.startsWith('/api/reports/scheduled/')) {
      if (!requireStaffPermission(req, res, ['report:strategic'])) return;
      const reportId = pathname.split('/').pop();
      const scheduledReport = getScheduledReports().find(item => item.id === reportId);
      if (!scheduledReport) return sendJson(res, 404, { success: false, message: 'Scheduled report not found' });
      const reportPath = path.join(DATA_DIR, 'generated-reports', scheduledReport.fileName);
      fs.readFile(reportPath, (error, data) => {
        if (error) {
          console.error('Scheduled report download failed:', error);
          return sendJson(res, 500, { success: false, message: 'Scheduled report file is unavailable' });
        }
        res.writeHead(200, {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${path.basename(scheduledReport.fileName)}"`,
          'Cache-Control': 'no-store',
          'Content-Length': data.length
        });
        res.end(data);
      });
      return;
    }

    if (method === 'GET' && ['/api/reports/analytics', '/api/reports/analytics.xlsx'].includes(pathname)) {
      const principal = requireStaffPermission(req, res, [
        'report:department', 'report:hospital', 'report:finance', 'report:strategic'
      ]);
      if (!principal) return;
      const url = new URL(req.url, `http://${req.headers.host}`);
      const startDate = url.searchParams.get('startDate') || localDateString();
      const endDate = url.searchParams.get('endDate') || startDate;
      if (!isValidDate(startDate) || !isValidDate(endDate) || startDate > endDate) {
        return sendJson(res, 400, { success: false, message: 'A valid start and end date range is required' });
      }
      if (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`) > 1826 * 86400000) {
        return sendJson(res, 400, { success: false, message: 'Report range cannot exceed five years' });
      }
      const departmentId = url.searchParams.get('departmentId') || '';
      const doctorId = url.searchParams.get('doctorId') || '';
      const departmentRole = principal.permissions.includes('report:department') &&
        !principal.permissions.some(permission => ['report:hospital', 'report:finance', 'report:strategic'].includes(permission));
      const assignedDepartmentIds = departmentRole ? principal.departmentIds : null;
      const ageGroup = url.searchParams.get('ageGroup') || '';
      const gender = url.searchParams.get('gender') || '';
      const reportPeriod = url.searchParams.get('period') || 'custom';
      if (departmentId && !getConfig().departments?.some(department => department.id === departmentId)) {
        return sendJson(res, 400, { success: false, message: 'Unknown department filter' });
      }
      if (doctorId && !getConfig().doctors?.some(doctor => doctor.id === doctorId)) {
        return sendJson(res, 400, { success: false, message: 'Unknown doctor filter' });
      }
      if (departmentRole) {
        const selectedDoctor = doctorId ? getConfig().doctors.find(doctor => doctor.id === doctorId) : null;
        if (departmentId && !assignedDepartmentIds.includes(departmentId)) {
          return sendJson(res, 403, { success: false, message: 'Department filter is outside your assignments' });
        }
        if (selectedDoctor && !assignedDepartmentIds.includes(selectedDoctor.department)) {
          return sendJson(res, 403, { success: false, message: 'Doctor filter is outside your assigned departments' });
        }
      }
      if (ageGroup && ![...AGE_GROUPS, 'Unknown'].includes(ageGroup)) {
        return sendJson(res, 400, { success: false, message: 'Unknown age-group filter' });
      }
      if (gender && !['Male', 'Female', 'Other'].includes(gender)) {
        return sendJson(res, 400, { success: false, message: 'Unknown gender filter' });
      }
      if (!['daily', 'weekly', 'monthly', 'quarterly', 'annual', 'custom'].includes(reportPeriod)) {
        return sendJson(res, 400, { success: false, message: 'Unknown reporting-period filter' });
      }
      const canViewDemographics = principal.permissions.includes('report:strategic') ||
        (principal.permissions.includes('report:department') &&
          !principal.permissions.some(permission => ['report:hospital', 'report:finance'].includes(permission)));
      const report = buildAnalyticsReport({
        startDate,
        endDate,
        reportPeriod,
        departmentId,
        departmentIds: departmentRole && !departmentId ? assignedDepartmentIds : undefined,
        doctorId,
        ageGroup: canViewDemographics ? ageGroup : '',
        gender: canViewDemographics ? gender : '',
        state: canViewDemographics ? url.searchParams.get('state')?.trim() || '' : '',
        district: canViewDemographics ? url.searchParams.get('district')?.trim() || '' : '',
        pincode: canViewDemographics ? url.searchParams.get('pincode')?.trim() || '' : '',
        country: canViewDemographics ? url.searchParams.get('country')?.trim() || '' : '',
        postOffice: canViewDemographics ? url.searchParams.get('postOffice')?.trim() || '' : '',
        locality: canViewDemographics ? url.searchParams.get('locality')?.trim() || '' : ''
      });
      const viewReport = projectedAnalyticsReport(report, principal);
      if (pathname === '/api/reports/analytics.xlsx') {
        const workbook = viewReport.view ? buildScopedAnalyticsWorkbook(viewReport) : buildAnalyticsWorkbook(report);
        const buffer = await workbook.xlsx.writeBuffer();
        const fileName = `vitalyes-bi-${startDate}-${endDate}.xlsx`;
        res.writeHead(200, {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${fileName}"`,
          'Cache-Control': 'no-store',
          'Content-Length': buffer.length
        });
        return res.end(buffer);
      }
      return sendJson(res, 200, { success: true, data: viewReport });
    }

    if (method === 'GET' && pathname === '/api/reports/daily') {
      if (!requireStaffPermission(req, res, ['report:daily'])) return;
      const url = new URL(req.url, `http://${req.headers.host}`);
      const date = url.searchParams.get('date') || localDateString();
      if (!isValidDate(date)) return sendJson(res, 400, { success: false, message: 'A valid report date is required' });
      const appointments = getAppointments().filter(item => item.appointmentDate === date);
      const invoices = getInvoices().filter(item => item.appointmentDate === date);
      const patients = getPatients();
      const config = getConfig();
      const patientIds = new Set(appointments.map(item => item.patientId));
      const booked = appointments.filter(item => ['confirmed', 'pending_payment', 'completed'].includes(item.status));
      const departments = {};
      const visitCategories = {};
      for (const appointment of booked) {
        departments[appointment.department] = (departments[appointment.department] || 0) + 1;
        visitCategories[appointment.visitCategory] = (visitCategories[appointment.visitCategory] || 0) + 1;
      }
      return sendJson(res, 200, {
        success: true,
        data: {
          date,
          registrations: patients.filter(patient => patient.createdAt?.slice(0, 10) === date).length,
          uniquePatients: patientIds.size,
          appointments: booked.length,
          newConsultations: visitCategories['New Consultation'] || 0,
          reviews: visitCategories.Review || 0,
          revisits: visitCategories.Revisit || 0,
          departmentCounts: departments,
          appointmentRows: booked.map(appointment => {
            const patient = findPatientById(appointment.patientId);
            const doctor = getDoctor(config, appointment.doctorId);
            return {
              id: appointment.id,
              patientName: patient ? `${patient.firstName} ${patient.lastName}` : 'Patient',
              doctorName: doctor?.name || 'Doctor',
              appointmentTime: appointment.appointmentTime,
              visitCategory: appointment.visitCategory,
              status: appointment.status,
              canComplete: appointment.status === 'confirmed' &&
                hospitalDateTime(appointment.appointmentDate, appointment.appointmentTime, config.timeZone || 'Asia/Kolkata') <= new Date()
            };
          }),
          invoicedAmount: invoices.reduce((sum, invoice) => sum + Number(invoice.total || 0), 0),
          paidAmount: invoices.filter(invoice => invoice.status === 'paid').reduce((sum, invoice) => sum + Number(invoice.total || 0), 0)
        }
      });
    }

    sendJson(res, 404, { success: false, message: 'API endpoint not found' });
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { success: false, message: err.message || 'Internal server error' });
  }
}

// ---------- Static file server + API ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let pathname = url.pathname;

  if (pathname.startsWith('/api')) {
    return handleApi(req, res, pathname);
  }

  if (pathname === '/') pathname = '/index.html';
  const filePath = path.join(PUBLIC_DIR, pathname);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (pathname !== '/index.html') {
        fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (err2, data2) => {
          if (err2) {
            res.writeHead(404);
            return res.end('Not found');
          }
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(data2);
        });
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
      return;
    }
    res.writeHead(200, { 'Content-Type': getContentType(filePath) });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log('================================================');
  console.log('  Vitalyes Patient Registration & Invoicing');
  console.log('  Interactive Prototype (JSON Database)');
  console.log('  Node.js + OIDC staff authentication + ExcelJS reporting');
  console.log('================================================');
  console.log(`  Server running at: http://localhost:${PORT}`);
  console.log('  Mode: Synthetic data + Simulated OTP / Payment');
  console.log('================================================');
  console.log('  Demo mobiles: 9876543210 | 9123456789 | 9988776655');
  console.log('================================================');
  setTimeout(runScheduledAnalyticsReports, 0);
  setInterval(runScheduledAnalyticsReports, 30_000);
});
