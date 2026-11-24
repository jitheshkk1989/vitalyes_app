# Vitalyes – Hospital OP Registration Prototype

Phase 1 interactive prototype for the Vitalyes Hospital OP Operations platform.

**Product principle:** one common application, multiple hospital configurations, independent business rules, and centralised intelligence. Hospital-specific behavior belongs in validated, versioned configuration—not customer-specific code forks.

The current JSON-backed prototype is for workflow validation only. The product owner has approved the requirements and relational-architecture baseline; the next iteration starts with the PostgreSQL/tenant foundation, while unresolved policies remain open as documented in the [requirements and architecture baseline](./docs/product-requirements-and-architecture.md).

- **Frontend**: Responsive kiosk + mobile-friendly single-page experience
- **Backend**: Node.js with ExcelJS reports and JSON-backed prototype staff accounts
- **Database**: JSON files
- **Integrations**: Fully simulated (OTP, Payment gateway, HIS)
- **Admin settings**: role-based access and prototype username/password accounts

### Phase 1 flows

- Language selection for English, Malayalam and Hindi.
- The welcome screen provides direct staff/admin access and spaces for hospital news, feeds and advertisements. These show empty states; no content feed or advertising integration is configured.
- Patient lookup using an international calling code and phone number + simulated OTP, or MRN + OTP to the registered mobile. Existing Indian numbers without a stored calling code are treated as +91.
- New patient form with required demographics and address fields; duplicate mobile registrations are rejected.
- Patient profiles capture country, state, district, postal code and post office. Indian states and districts use the `india-state-district` reference dataset with an "Other" option; international state and district names are entered manually. India requires a six-digit PIN and post office; postal code and post office are optional for other countries. Reference data can be incomplete or change over time.
- New patient registrations capture OP, IP or ER for reporting. This is a label on patient record creation, not an inpatient admission, emergency workflow or visit-level classification; all subsequent scheduling remains the prototype outpatient flow.
- Doctors Visit options for new consultation and follow-up/revisit.
- Appointment date selection before department/doctor selection.
- Doctor search and department filtering, configured fees and real schedule-derived slots.
- Weekly working days, sessions, breaks, slot duration, per-slot capacity, unavailable dates and optional special working-day overrides are configured per doctor in `data/config.json`.
- Follow-up classification is calculated from completed consultation history and configurable 15-calendar-day rules; follow-up with another doctor is treated as a new consultation.
- Invoice, simulated UPI/card/net-banking/cash-at-counter confirmation, payment-failure path and doctor/date token sequence.
- Basic daily operational report with registration, booking, visit-category and amount totals; completed appointments are recorded to drive the next review-eligibility window.
- Business Intelligence Dashboard with daily/weekly/monthly/quarterly/annual/custom date ranges, provider and demographic/geographic filters, operational KPIs, demographic breakdowns, revenue and payment summaries, schedule-capacity estimates, catchment views, CSV download and print-to-PDF.
- Registration overview shows new patient record creation trends (daily, Monday-based weekly, monthly, yearly), acquisition rate, appointment category mix, and doctor/department booking mix and prior-period growth. The acquisition rate is new patient records divided by distinct patients in the report; category percentages divide by all bookings, including unclassified and cancelled/failed bookings. Booking mix uses appointment dates, while registrations use patient creation dates. New consultations are not necessarily first-time patients. Provider filters restrict new patient records to patients matched to visits in the selected period.
- Use **Preview with demo data** on the analytics page to see the registration dashboard populated with a fixed, fictional November 2026 example. It does not write patient or transaction data; report filters and real-data exports do not apply to the preview. Switch back to **Live prototype report** to resume role-scoped reporting and exports. The preview can be printed separately.
- OP/IP/ER breakdown counts newly created patient records by their recorded registration type, with older records grouped as unclassified. Percentages use all new records in the filtered period; provider filters restrict records to patients matched to visits in that period. Channels, registration queue times, counters, staff, doctor conversion, and registration-fee collections and waivers remain unavailable until the prototype records the necessary events and charge-level payment/waiver allocations. The existing patient wait metric measures arrival to consultation start, not registration queue time. The existing review classification and fee rules are unchanged.
- Reporting filters include country, state, district, PIN code, post office and locality. The dashboard compares current and previous periods and supports configured hospital-level targets.
- Downloadable multi-sheet Excel workbooks, CSV exports, and browser print-to-PDF are available. Enabled schedules generate Excel files for the previous completed period at the configured hospital-local time; no email delivery is configured.
- When staff marks a consultation complete in the daily report, they can optionally record patient arrival and actual consultation start times for waiting-time and schedule-adherence reporting.
- Strategic dashboard with department/provider growth comparisons, peak appointment day/hour, unused-slot gross-value estimates, and an anonymous patient-journey funnel.
- Exploratory department demand projection for the month after the report month; each department projection requires completed visits for that department in all six preceding months and is not a staffing recommendation.
- Feedback and consultation-room utilization are explicitly marked unavailable until those integrations exist.

### Quick Start

```bash
cd vitalyes-prototype
npm install
npm start
```

Open **http://localhost:3000**

> If port 3000 is busy: `PORT=3001 node server.js`

### Prototype administrative settings

In non-production mode, open the app on the server computer and sign in from **Staff / admin login** using `admin` / `admin` when no administrator credentials are configured. This bootstrap login is available only on the server's loopback interface. To use different bootstrap credentials, set both `VITALYES_ADMIN_USERNAME` and `VITALYES_ADMIN_PASSWORD` in the environment. Never use the default credentials for a deployment.

Open **Settings → Staff users**, enter a name, username and password, assign one or more saved roles and, for department reporting, at least one department. To authorize counter payments, assign a role with `payment:collect`, such as **Front Office**; administrative access alone does not grant that permission. The password must be 12–256 characters. Usernames are case-insensitive and use letters, numbers, periods, underscores or hyphens. Users can then sign in using their own credentials. Role and department changes in settings must be saved before assigning them to users.

At a simulated cash-counter payment, staff can enter their username and password on the payment screen. Authorization is limited to that pending payment for five minutes and does not create a staff login session on the patient's device. Staff must still select **Confirm authorised counter payment**. Local accounts are available only in prototype mode; when OIDC is configured, its existing sign-in option remains available.

Accounts are stored in `data/staff-users.json` with salted scrypt password hashes, not plaintext passwords. The server creates this file with owner-only permissions; keep it private and out of source control and backups accessible to others. User creation is immediate and separate from the Save settings button. This prototype does not provide password reset, account editing or deletion; account management must be completed before using it beyond a demo. Login attempts are limited in memory and sessions expire after inactivity or a server restart. JSON-backed sign-in and account creation are disabled when `NODE_ENV=production`; the prototype is not suitable for real patient data or production use.

An optional pre-existing OIDC sign-in can still be configured if needed. For that flow, set strong administrator credentials through the environment:

```bash
export VITALYES_OIDC_ISSUER_URL="https://identity.example.com"
export VITALYES_OIDC_CLIENT_ID="vitalyes-staff"
export VITALYES_OIDC_CLIENT_SECRET="<set-through-your-secret-manager>"
export VITALYES_OIDC_CALLBACK_URL="https://vitalyes.example.com/api/auth/callback"
export VITALYES_ADMIN_USERNAME="<set-a-unique-admin-username>"
export VITALYES_ADMIN_PASSWORD="<set-a-strong-password-through-your-secret-manager>"
npm start
```

Register the exact callback URL with the identity provider. `VITALYES_OIDC_SCOPE` defaults to `openid profile email`; configure the provider to include the claims used below. Claim paths can be changed with `VITALYES_OIDC_ROLE_CLAIM` (default `groups`), `VITALYES_OIDC_DEPARTMENT_CLAIM` (default `department_ids`), and `VITALYES_OIDC_HOSPITAL_CLAIM` (default `hospital_codes`).

The bootstrap login uses the first configured role with `config:manage` or `hospital:configure` and automatically unlocks settings. Local users assigned one of these permissions also unlock settings on sign-in.

For OIDC, map the provider's exact group values in each matching role's `oidcGroups` array in `data/config.json`. For example, a Department Head needs an OIDC role/group value mapped to that role, a department claim such as `["GEN","CARD"]`, and the configured hospital code in the hospital claim such as `["VDH-001"]`. The default group arrays are empty. Role permissions are enforced server-side for daily reports, BI aggregates and exports, consultation completion, counter-payment confirmation, and settings. Department Head filters and aggregates are restricted to all assigned departments. The interface only shows staff functions permitted by the authenticated roles.

The home screen shows Administrative Settings only to staff with `config:manage` or `hospital:configure`; OIDC-authenticated staff must also enter the configured administrator username and password. Local administrators re-enter their own credentials after locking settings. A successful unlock is tied to the staff session for up to one hour. Settings are grouped into Hospital & Languages, Departments & Doctors, Fees & Visit Rules, Payments, Roles & Access, and Reports. The sample configuration includes illustrative monthly appointment/collection targets and a disabled demo report schedule.

Departments and doctors are listed in tables under Departments & Doctors. Use Edit to change details and schedules, or Delete to remove an entry; select Save settings to persist changes. Reassign or remove linked doctors and report schedules before deleting a department, and remove linked report schedules before deleting a doctor.

In report configuration, targets are hospital-level metric/period/value entries. Enabled schedule entries specify an ID, name, frequency and hospital-local `HH:MM` run time; optional department/doctor IDs scope generated aggregate workbooks.

OIDC sessions and administrator unlocks are held in memory for up to one hour and are cleared on server restart. Production cookies are marked `Secure`; deploy behind HTTPS and use an MFA-enabled identity provider for privileged roles. This prototype remains single-hospital, JSON-backed, and unsuitable for real patient data; payment settings remain simulated and do not configure a real provider.

### Demo patients

| Mobile      | Name          | Type     |
|-------------|---------------|----------|
| 9876543210  | Rahul Sharma  | Existing |
| 9123456789  | Priya Patel   | Existing |
| 9988776655  | Amit Kumar    | Existing |
| Any other   | —             | New      |

OTP is displayed on screen in prototype mode (also logged in the terminal). The synthetic history for Rahul Sharma exercises the free-review path.

### Project Structure

```
vitalyes-prototype/
├── server.js              # Node.js HTTP server, staff auth, and API
├── package.json
├── db/
│   └── migrations/
│       └── 001_initial_schema.sql # PostgreSQL tenant-aware foundation; not wired to demo server
├── data/                  # JSON "database"
│   ├── patients.json
│   ├── appointments.json
│   ├── consultations.json
│   ├── invoices.json
│   ├── payments.json
│   ├── tokens.json
│   ├── funnel-events.json
│   ├── scheduled-reports.json
│   ├── generated-reports/ # locally generated Excel files (runtime)
│   └── config.json
├── public/                # Frontend
│   ├── index.html
│   ├── css/style.css
│   └── js/app.js
└── README.md
```

### Prototype limitations

- No real SMS OTP is sent
- No real payment gateway is called; success/failure actions are simulated
- No connection to any hospital HIS/HMIS
- Data is synthetic and stored in local JSON files. It is not production-safe for concurrent or multi-hospital deployment.
- Staff sign-in supports JSON-backed prototype accounts and optional OIDC; sessions are in-memory. This is not a production identity or tenant architecture.
- Staff reports and exports are server-authorized and scoped to the one hospital in `data/config.json`; Department Heads are restricted to assigned departments. Cross-hospital administration and transaction drill-down require tenant-separated transaction data and audited production authorization.
- Targets are hospital-level and apply only to unfiltered totals. Scheduled Excel exports are written locally and listed in the dashboard; there is no email delivery, worker service, retention policy, or production access control.
- BI aggregates the prototype JSON files directly; it is not a separate analytics store or a production reporting layer. Waiting time, adherence, consultation duration, registration timing, refunds, and no-show measures are only meaningful when their source events/statuses exist. Capacity uses current schedules for historical dates.
- Strategic forecasts use a six-month linear trend over completed visits and require at least one completed visit for the department in every month; they are exploratory and do not provide staffing or clinical recommendations. Current schedules are used for projected capacity.
- The patient journey funnel stores random journey IDs and stage timestamps without patient identifiers in its event file; it excludes steps less than 15 minutes old. Production retention, access controls, and privacy review are still required.
- Satisfaction and consultation-room utilization are unavailable without feedback and room integrations.
- Catchment results are descriptive counts only; low-penetration claims require population denominators, and small-area results need privacy thresholds before production use.
- Review eligibility is determined from completed rows in `consultations.json`; payment/booking does not imply a consultation was completed. The prototype report provides a manual completion action.
- Aadhaar retrieval, real OTP, validated forecasting, refunds, appointment cancellation/rescheduling and external integrations are not implemented.
- Suitable for stakeholder demos and journey validation only

### Reset transactional data

```bash
npm run reset-db
```

### Production work still required

- Relational database, migrations, transaction-safe appointment reservations and multi-hospital data segregation
- Durable production authentication/session storage, MFA policy enforcement, audit logging, and tenant-separated authorization
- Authorized HIS integration and consent-based identity integrations
- Production payment gateway, reconciliation, refunds and authorised counter workflows
- Production-grade multi-hospital BI, role-authorized drill-down, scheduled delivery and export retention
- Kiosk lockdown mode & inactivity timeout
- Automated tests and hospital UAT

---

**Vitalyes – Hospital Operations Intelligence Platform**

See [the product requirements and architecture baseline](./docs/product-requirements-and-architecture.md) for the proposed Phase 1 scope, patient journey, scheduling and visit rules, relational data model, API and access-control outline, roadmap, acceptance criteria, and decisions requiring stakeholder sign-off.
