BEGIN;

CREATE SCHEMA IF NOT EXISTS vitalyes;

CREATE OR REPLACE FUNCTION vitalyes.current_hospital_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('vitalyes.hospital_id', true), '')::uuid
$$;

CREATE TABLE vitalyes.hospital (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  country_code char(2) NOT NULL,
  time_zone text NOT NULL,
  currency_code char(3) NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE vitalyes.hospital_setting (
  hospital_id uuid NOT NULL REFERENCES vitalyes.hospital(id),
  setting_key text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  value jsonb NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  created_by_subject text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hospital_id, setting_key, version),
  UNIQUE (hospital_id, setting_key, effective_from),
  CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE TABLE vitalyes.department (
  hospital_id uuid NOT NULL REFERENCES vitalyes.hospital(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code text NOT NULL,
  names jsonb NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hospital_id, id),
  UNIQUE (hospital_id, code)
);

CREATE TABLE vitalyes.doctor (
  hospital_id uuid NOT NULL REFERENCES vitalyes.hospital(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code text NOT NULL,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hospital_id, id),
  UNIQUE (hospital_id, code)
);

CREATE TABLE vitalyes.doctor_department (
  hospital_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL,
  department_id uuid NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hospital_id, id),
  UNIQUE (hospital_id, id, doctor_id, department_id),
  FOREIGN KEY (hospital_id, doctor_id) REFERENCES vitalyes.doctor(hospital_id, id),
  FOREIGN KEY (hospital_id, department_id) REFERENCES vitalyes.department(hospital_id, id),
  CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE TABLE vitalyes.doctor_schedule_rule (
  hospital_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  doctor_department_id uuid NOT NULL,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  effective_from date NOT NULL,
  effective_to date,
  slot_duration_minutes integer NOT NULL CHECK (slot_duration_minutes > 0),
  capacity_per_slot integer NOT NULL CHECK (capacity_per_slot > 0),
  consultation_fee numeric(12, 2) NOT NULL CHECK (consultation_fee >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hospital_id, id),
  UNIQUE (hospital_id, id, doctor_department_id),
  FOREIGN KEY (hospital_id, doctor_department_id)
    REFERENCES vitalyes.doctor_department(hospital_id, id),
  CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE TABLE vitalyes.doctor_schedule_session (
  hospital_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  schedule_rule_id uuid NOT NULL,
  starts_at time NOT NULL,
  ends_at time NOT NULL,
  PRIMARY KEY (hospital_id, id),
  FOREIGN KEY (hospital_id, schedule_rule_id)
    REFERENCES vitalyes.doctor_schedule_rule(hospital_id, id),
  CHECK (starts_at < ends_at)
);

CREATE TABLE vitalyes.doctor_schedule_break (
  hospital_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  schedule_rule_id uuid NOT NULL,
  starts_at time NOT NULL,
  ends_at time NOT NULL,
  reason text,
  PRIMARY KEY (hospital_id, id),
  FOREIGN KEY (hospital_id, schedule_rule_id)
    REFERENCES vitalyes.doctor_schedule_rule(hospital_id, id),
  CHECK (starts_at < ends_at)
);

CREATE TABLE vitalyes.doctor_schedule_exception (
  hospital_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  doctor_department_id uuid NOT NULL,
  exception_date date NOT NULL,
  exception_type text NOT NULL CHECK (exception_type IN ('unavailable', 'replace_schedule')),
  reason text,
  slot_duration_override integer CHECK (slot_duration_override > 0),
  capacity_override integer CHECK (capacity_override > 0),
  consultation_fee_override numeric(12, 2) CHECK (consultation_fee_override >= 0),
  created_by_subject text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hospital_id, id),
  UNIQUE (hospital_id, doctor_department_id, exception_date),
  FOREIGN KEY (hospital_id, doctor_department_id)
    REFERENCES vitalyes.doctor_department(hospital_id, id)
);

CREATE TABLE vitalyes.doctor_schedule_exception_session (
  hospital_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  exception_id uuid NOT NULL,
  starts_at time NOT NULL,
  ends_at time NOT NULL,
  PRIMARY KEY (hospital_id, id),
  FOREIGN KEY (hospital_id, exception_id)
    REFERENCES vitalyes.doctor_schedule_exception(hospital_id, id),
  CHECK (starts_at < ends_at)
);

CREATE TABLE vitalyes.platform_patient (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE vitalyes.hospital_patient (
  hospital_id uuid NOT NULL REFERENCES vitalyes.hospital(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  platform_patient_id uuid NOT NULL REFERENCES vitalyes.platform_patient(id),
  mrn text NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  date_of_birth date NOT NULL,
  gender text NOT NULL CHECK (gender IN ('Male', 'Female', 'Other', 'Unknown')),
  chart_status text NOT NULL DEFAULT 'active' CHECK (chart_status IN ('active', 'inactive', 'merged')),
  registered_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hospital_id, id),
  UNIQUE (hospital_id, mrn),
  UNIQUE (hospital_id, platform_patient_id),
  UNIQUE (hospital_id, id, platform_patient_id)
);

CREATE TABLE vitalyes.patient_contact (
  hospital_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  hospital_patient_id uuid NOT NULL,
  contact_type text NOT NULL CHECK (contact_type IN ('mobile', 'email', 'alternate_mobile')),
  normalized_value text NOT NULL,
  verified_at timestamptz,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hospital_id, id),
  FOREIGN KEY (hospital_id, hospital_patient_id)
    REFERENCES vitalyes.hospital_patient(hospital_id, id),
  CHECK (valid_to IS NULL OR valid_to > valid_from)
);

CREATE INDEX patient_contact_lookup_idx
  ON vitalyes.patient_contact (hospital_id, contact_type, normalized_value)
  WHERE valid_to IS NULL;

CREATE TABLE vitalyes.patient_address (
  hospital_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  hospital_patient_id uuid NOT NULL,
  address_line text NOT NULL,
  locality text,
  post_office text,
  postal_code text,
  district text,
  state text,
  country_code char(2) NOT NULL,
  source text NOT NULL DEFAULT 'patient',
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz,
  PRIMARY KEY (hospital_id, id),
  FOREIGN KEY (hospital_id, hospital_patient_id)
    REFERENCES vitalyes.hospital_patient(hospital_id, id),
  CHECK (valid_to IS NULL OR valid_to > valid_from)
);

CREATE TABLE vitalyes.identity_consent (
  hospital_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  hospital_patient_id uuid NOT NULL,
  purpose text NOT NULL,
  source text NOT NULL,
  wording_version text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  withdrawn_at timestamptz,
  PRIMARY KEY (hospital_id, id),
  FOREIGN KEY (hospital_id, hospital_patient_id)
    REFERENCES vitalyes.hospital_patient(hospital_id, id),
  CHECK (withdrawn_at IS NULL OR withdrawn_at >= granted_at)
);

CREATE TABLE vitalyes.app_user (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer text NOT NULL,
  subject text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (issuer, subject)
);

CREATE TABLE vitalyes.hospital_user (
  hospital_id uuid NOT NULL REFERENCES vitalyes.hospital(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  app_user_id uuid NOT NULL REFERENCES vitalyes.app_user(id),
  display_name text NOT NULL,
  email text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hospital_id, id),
  UNIQUE (hospital_id, app_user_id),
  UNIQUE (hospital_id, id, app_user_id)
);

CREATE TABLE vitalyes.role (
  hospital_id uuid NOT NULL REFERENCES vitalyes.hospital(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  role_code text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  PRIMARY KEY (hospital_id, id),
  UNIQUE (hospital_id, role_code)
);

CREATE TABLE vitalyes.permission (
  code text PRIMARY KEY,
  description text NOT NULL
);

CREATE TABLE vitalyes.role_permission (
  hospital_id uuid NOT NULL,
  role_id uuid NOT NULL,
  permission_code text NOT NULL REFERENCES vitalyes.permission(code),
  PRIMARY KEY (hospital_id, role_id, permission_code),
  FOREIGN KEY (hospital_id, role_id) REFERENCES vitalyes.role(hospital_id, id)
);

CREATE TABLE vitalyes.role_idp_group (
  hospital_id uuid NOT NULL,
  role_id uuid NOT NULL,
  issuer text NOT NULL,
  group_claim_value text NOT NULL,
  PRIMARY KEY (hospital_id, role_id, issuer, group_claim_value),
  FOREIGN KEY (hospital_id, role_id) REFERENCES vitalyes.role(hospital_id, id)
);

CREATE TABLE vitalyes.hospital_user_role (
  hospital_id uuid NOT NULL,
  hospital_user_id uuid NOT NULL,
  role_id uuid NOT NULL,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  granted_by_subject text NOT NULL,
  PRIMARY KEY (hospital_id, hospital_user_id, role_id, effective_from),
  FOREIGN KEY (hospital_id, hospital_user_id) REFERENCES vitalyes.hospital_user(hospital_id, id),
  FOREIGN KEY (hospital_id, role_id) REFERENCES vitalyes.role(hospital_id, id),
  CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE TABLE vitalyes.hospital_user_department (
  hospital_id uuid NOT NULL,
  hospital_user_id uuid NOT NULL,
  department_id uuid NOT NULL,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  PRIMARY KEY (hospital_id, hospital_user_id, department_id, effective_from),
  FOREIGN KEY (hospital_id, hospital_user_id) REFERENCES vitalyes.hospital_user(hospital_id, id),
  FOREIGN KEY (hospital_id, department_id) REFERENCES vitalyes.department(hospital_id, id),
  CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE TABLE vitalyes.appointment_slot (
  hospital_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  doctor_department_id uuid NOT NULL,
  service_date date NOT NULL,
  starts_at time NOT NULL,
  ends_at time NOT NULL,
  capacity integer NOT NULL CHECK (capacity > 0),
  reserved_count integer NOT NULL DEFAULT 0 CHECK (reserved_count >= 0 AND reserved_count <= capacity),
  schedule_snapshot jsonb NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hospital_id, id),
  UNIQUE (hospital_id, id, doctor_department_id),
  UNIQUE (hospital_id, doctor_department_id, service_date, starts_at),
  FOREIGN KEY (hospital_id, doctor_department_id)
    REFERENCES vitalyes.doctor_department(hospital_id, id),
  CHECK (starts_at < ends_at)
);

CREATE TABLE vitalyes.consultation (
  hospital_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  appointment_id uuid,
  hospital_patient_id uuid NOT NULL,
  doctor_department_id uuid NOT NULL,
  consultation_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  arrived_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  source_system text NOT NULL DEFAULT 'vitalyes',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hospital_id, id),
  UNIQUE (hospital_id, id, hospital_patient_id, doctor_department_id),
  UNIQUE (hospital_id, appointment_id),
  FOREIGN KEY (hospital_id, hospital_patient_id)
    REFERENCES vitalyes.hospital_patient(hospital_id, id),
  FOREIGN KEY (hospital_id, doctor_department_id)
    REFERENCES vitalyes.doctor_department(hospital_id, id),
  CHECK (ended_at IS NULL OR started_at IS NOT NULL AND ended_at >= started_at)
);

CREATE TABLE vitalyes.review_entitlement (
  hospital_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  hospital_patient_id uuid NOT NULL,
  doctor_department_id uuid NOT NULL,
  source_consultation_id uuid NOT NULL,
  policy_version integer NOT NULL CHECK (policy_version > 0),
  policy_snapshot jsonb NOT NULL,
  starts_on date NOT NULL,
  expires_on date NOT NULL,
  allowed_uses integer NOT NULL DEFAULT 1 CHECK (allowed_uses > 0),
  consumed_uses integer NOT NULL DEFAULT 0 CHECK (consumed_uses >= 0 AND consumed_uses <= allowed_uses),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'consumed', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hospital_id, id),
  UNIQUE (hospital_id, source_consultation_id),
  UNIQUE (hospital_id, id, hospital_patient_id, doctor_department_id),
  FOREIGN KEY (hospital_id, source_consultation_id, hospital_patient_id, doctor_department_id)
    REFERENCES vitalyes.consultation(hospital_id, id, hospital_patient_id, doctor_department_id),
  CHECK (expires_on >= starts_on)
);

CREATE TABLE vitalyes.appointment (
  hospital_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  hospital_patient_id uuid NOT NULL,
  doctor_department_id uuid NOT NULL,
  slot_id uuid NOT NULL,
  review_entitlement_id uuid,
  service_date date NOT NULL,
  scheduled_start time NOT NULL,
  scheduled_end time NOT NULL,
  visit_category text NOT NULL CHECK (visit_category IN ('new_consultation', 'review', 'revisit')),
  status text NOT NULL CHECK (status IN ('held', 'pending_payment', 'confirmed', 'completed', 'cancelled', 'no_show', 'payment_failed', 'expired')),
  hold_expires_at timestamptz,
  configuration_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hospital_id, id),
  UNIQUE (hospital_id, id, hospital_patient_id),
  FOREIGN KEY (hospital_id, hospital_patient_id)
    REFERENCES vitalyes.hospital_patient(hospital_id, id),
  FOREIGN KEY (hospital_id, doctor_department_id)
    REFERENCES vitalyes.doctor_department(hospital_id, id),
  FOREIGN KEY (hospital_id, slot_id, doctor_department_id)
    REFERENCES vitalyes.appointment_slot(hospital_id, id, doctor_department_id),
  FOREIGN KEY (hospital_id, review_entitlement_id, hospital_patient_id, doctor_department_id)
    REFERENCES vitalyes.review_entitlement(hospital_id, id, hospital_patient_id, doctor_department_id),
  CHECK (scheduled_start < scheduled_end),
  CHECK ((status IN ('held', 'pending_payment')) = (hold_expires_at IS NOT NULL))
);

ALTER TABLE vitalyes.consultation
  ADD CONSTRAINT consultation_appointment_fk
  FOREIGN KEY (hospital_id, appointment_id)
  REFERENCES vitalyes.appointment(hospital_id, id);

CREATE TABLE vitalyes.review_entitlement_use (
  hospital_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  entitlement_id uuid NOT NULL,
  consultation_id uuid NOT NULL,
  used_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hospital_id, id),
  UNIQUE (hospital_id, consultation_id),
  FOREIGN KEY (hospital_id, entitlement_id) REFERENCES vitalyes.review_entitlement(hospital_id, id),
  FOREIGN KEY (hospital_id, consultation_id) REFERENCES vitalyes.consultation(hospital_id, id)
);

CREATE TABLE vitalyes.invoice (
  hospital_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL,
  appointment_id uuid NOT NULL,
  hospital_patient_id uuid NOT NULL,
  currency_code char(3) NOT NULL,
  subtotal numeric(12, 2) NOT NULL CHECK (subtotal >= 0),
  tax_total numeric(12, 2) NOT NULL DEFAULT 0 CHECK (tax_total >= 0),
  total numeric(12, 2) NOT NULL CHECK (total >= 0),
  status text NOT NULL CHECK (status IN ('draft', 'issued', 'paid', 'partially_refunded', 'refunded', 'void')),
  configuration_snapshot jsonb NOT NULL,
  issued_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hospital_id, id),
  UNIQUE (hospital_id, invoice_number),
  UNIQUE (hospital_id, appointment_id),
  UNIQUE (hospital_id, id, appointment_id),
  FOREIGN KEY (hospital_id, appointment_id, hospital_patient_id)
    REFERENCES vitalyes.appointment(hospital_id, id, hospital_patient_id)
);

CREATE TABLE vitalyes.invoice_line (
  hospital_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL,
  line_type text NOT NULL,
  description text NOT NULL,
  quantity numeric(10, 3) NOT NULL CHECK (quantity > 0),
  unit_amount numeric(12, 2) NOT NULL CHECK (unit_amount >= 0),
  tax_amount numeric(12, 2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  line_total numeric(12, 2) NOT NULL CHECK (line_total >= 0),
  price_snapshot jsonb NOT NULL,
  PRIMARY KEY (hospital_id, id),
  FOREIGN KEY (hospital_id, invoice_id) REFERENCES vitalyes.invoice(hospital_id, id)
);

CREATE TABLE vitalyes.payment (
  hospital_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL,
  provider_code text NOT NULL,
  provider_reference text,
  idempotency_key text NOT NULL,
  method text NOT NULL,
  amount numeric(12, 2) NOT NULL CHECK (amount > 0),
  currency_code char(3) NOT NULL,
  status text NOT NULL CHECK (status IN ('initiated', 'pending', 'succeeded', 'failed', 'cancelled')),
  initiated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  provider_payload_redacted jsonb,
  PRIMARY KEY (hospital_id, id),
  UNIQUE (hospital_id, provider_code, idempotency_key),
  UNIQUE (hospital_id, id, invoice_id),
  FOREIGN KEY (hospital_id, invoice_id) REFERENCES vitalyes.invoice(hospital_id, id)
);

CREATE UNIQUE INDEX payment_provider_reference_uq
  ON vitalyes.payment (hospital_id, provider_code, provider_reference)
  WHERE provider_reference IS NOT NULL;

CREATE TABLE vitalyes.refund (
  hospital_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  amount numeric(12, 2) NOT NULL CHECK (amount > 0),
  reason text NOT NULL,
  status text NOT NULL CHECK (status IN ('requested', 'pending', 'succeeded', 'failed', 'cancelled')),
  provider_reference text,
  requested_by_subject text NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  PRIMARY KEY (hospital_id, id),
  UNIQUE (hospital_id, idempotency_key),
  FOREIGN KEY (hospital_id, payment_id) REFERENCES vitalyes.payment(hospital_id, id)
);

CREATE TABLE vitalyes.token_counter (
  hospital_id uuid NOT NULL,
  doctor_department_id uuid NOT NULL,
  service_date date NOT NULL,
  last_sequence bigint NOT NULL DEFAULT 0 CHECK (last_sequence >= 0),
  PRIMARY KEY (hospital_id, doctor_department_id, service_date),
  FOREIGN KEY (hospital_id, doctor_department_id)
    REFERENCES vitalyes.doctor_department(hospital_id, id)
);

CREATE TABLE vitalyes.token (
  hospital_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL,
  doctor_department_id uuid NOT NULL,
  service_date date NOT NULL,
  sequence_number bigint NOT NULL CHECK (sequence_number > 0),
  rendered_value text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'superseded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hospital_id, id),
  UNIQUE (hospital_id, doctor_department_id, service_date, sequence_number),
  UNIQUE (hospital_id, rendered_value),
  FOREIGN KEY (hospital_id, appointment_id)
    REFERENCES vitalyes.appointment(hospital_id, id),
  FOREIGN KEY (hospital_id, doctor_department_id)
    REFERENCES vitalyes.doctor_department(hospital_id, id)
);

CREATE UNIQUE INDEX token_one_active_per_appointment_uq
  ON vitalyes.token (hospital_id, appointment_id)
  WHERE status = 'active';

CREATE TABLE vitalyes.report_target (
  hospital_id uuid NOT NULL REFERENCES vitalyes.hospital(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  metric_code text NOT NULL,
  period_code text NOT NULL,
  target_value numeric(16, 2) NOT NULL CHECK (target_value >= 0),
  department_id uuid,
  effective_from date NOT NULL,
  effective_to date,
  created_by_subject text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hospital_id, id),
  FOREIGN KEY (hospital_id, department_id) REFERENCES vitalyes.department(hospital_id, id),
  CHECK (period_code IN ('daily', 'weekly', 'monthly', 'quarterly', 'annual')),
  CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE TABLE vitalyes.report_schedule (
  hospital_id uuid NOT NULL REFERENCES vitalyes.hospital(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  report_code text NOT NULL,
  frequency text NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly', 'quarterly', 'annual')),
  local_run_time time NOT NULL,
  filter_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
  created_by_subject text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hospital_id, id)
);

CREATE TABLE vitalyes.integration_system (
  hospital_id uuid NOT NULL REFERENCES vitalyes.hospital(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  system_code text NOT NULL,
  display_name text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound', 'bidirectional')),
  status text NOT NULL DEFAULT 'disabled' CHECK (status IN ('enabled', 'disabled', 'degraded')),
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  secret_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hospital_id, id),
  UNIQUE (hospital_id, system_code)
);

CREATE TABLE vitalyes.integration_message (
  hospital_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  integration_system_id uuid NOT NULL,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  external_message_id text,
  idempotency_key text NOT NULL,
  message_type text NOT NULL,
  status text NOT NULL CHECK (status IN ('received', 'queued', 'processing', 'succeeded', 'failed')),
  payload_reference text,
  error_code text,
  occurred_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hospital_id, id),
  UNIQUE (hospital_id, integration_system_id, idempotency_key),
  FOREIGN KEY (hospital_id, integration_system_id)
    REFERENCES vitalyes.integration_system(hospital_id, id)
);

CREATE TABLE vitalyes.audit_event (
  hospital_id uuid NOT NULL REFERENCES vitalyes.hospital(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  actor_subject text NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  correlation_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata_redacted jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (hospital_id, id)
);

CREATE TABLE vitalyes.outbox_event (
  hospital_id uuid NOT NULL REFERENCES vitalyes.hospital(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  payload_version integer NOT NULL CHECK (payload_version > 0),
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  PRIMARY KEY (hospital_id, id)
);

CREATE TABLE vitalyes.idempotency_record (
  hospital_id uuid NOT NULL REFERENCES vitalyes.hospital(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  operation text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  response_status integer,
  response_reference uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  PRIMARY KEY (hospital_id, id),
  UNIQUE (hospital_id, operation, idempotency_key)
);

CREATE INDEX appointment_patient_date_idx
  ON vitalyes.appointment (hospital_id, hospital_patient_id, service_date DESC);
CREATE INDEX appointment_slot_status_idx
  ON vitalyes.appointment (hospital_id, slot_id, status);
CREATE INDEX consultation_patient_date_idx
  ON vitalyes.consultation (hospital_id, hospital_patient_id, consultation_date DESC);
CREATE INDEX payment_invoice_status_idx
  ON vitalyes.payment (hospital_id, invoice_id, status);
CREATE INDEX outbox_unpublished_idx
  ON vitalyes.outbox_event (occurred_at)
  WHERE published_at IS NULL;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'hospital_setting', 'department', 'doctor', 'doctor_department',
    'doctor_schedule_rule', 'doctor_schedule_session', 'doctor_schedule_break',
    'doctor_schedule_exception', 'doctor_schedule_exception_session',
    'hospital_patient', 'patient_contact', 'patient_address', 'identity_consent',
    'hospital_user', 'role', 'role_permission', 'role_idp_group',
    'hospital_user_role', 'hospital_user_department', 'appointment_slot', 'consultation',
    'review_entitlement', 'appointment', 'review_entitlement_use',
    'invoice', 'invoice_line', 'payment', 'refund', 'token_counter', 'token',
    'report_target', 'report_schedule', 'integration_system',
    'integration_message', 'audit_event', 'outbox_event', 'idempotency_record'
  ]
  LOOP
    EXECUTE format('ALTER TABLE vitalyes.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE vitalyes.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY hospital_isolation ON vitalyes.%I USING (hospital_id = vitalyes.current_hospital_id()) WITH CHECK (hospital_id = vitalyes.current_hospital_id())',
      table_name
    );
  END LOOP;
END
$$;

ALTER TABLE vitalyes.platform_patient ENABLE ROW LEVEL SECURITY;
ALTER TABLE vitalyes.platform_patient FORCE ROW LEVEL SECURITY;
CREATE POLICY patient_chart_scope ON vitalyes.platform_patient
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM vitalyes.hospital_patient hp
      WHERE hp.platform_patient_id = platform_patient.id
        AND hp.hospital_id = vitalyes.current_hospital_id()
    )
  );
CREATE POLICY patient_identity_create ON vitalyes.platform_patient
  FOR INSERT
  WITH CHECK (true);

ALTER TABLE vitalyes.app_user ENABLE ROW LEVEL SECURITY;
ALTER TABLE vitalyes.app_user FORCE ROW LEVEL SECURITY;
CREATE POLICY app_user_hospital_membership ON vitalyes.app_user
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM vitalyes.hospital_user hu
      WHERE hu.app_user_id = app_user.id
        AND hu.hospital_id = vitalyes.current_hospital_id()
    )
  );
CREATE POLICY app_user_identity_create ON vitalyes.app_user
  FOR INSERT
  WITH CHECK (true);

COMMENT ON FUNCTION vitalyes.current_hospital_id() IS
  'Reads transaction-local tenant context. The API must set this from verified authorization, never from an untrusted request parameter.';
COMMENT ON TABLE vitalyes.appointment_slot IS
  'Materialized bookable slot and capacity snapshot. Reserve capacity by locking/updating this row within the appointment transaction.';
COMMENT ON TABLE vitalyes.outbox_event IS
  'Tenant-scoped transactional outbox for reliable BI projections and integrations; redact patient data from payloads.';

COMMIT;
