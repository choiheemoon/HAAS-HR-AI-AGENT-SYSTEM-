-- =============================================================================
-- 근태 기준정보 샘플 데이터 (회사별)
-- 대상: companies 테이블의 모든 회사
-- 내용: 회사설정(특별수당 슬롯), 교대근무+OT구간, 반올림(지각/조퇴/OT),
--       휴가등급(1~3등급 + 유형 행), 휴가(연휴) 일자, 급여기간
--
-- ⚠ 경고: 아래 DELETE는 전사(모든 회사)의 해당 테이블 데이터를 비웁니다.
--         운영 DB에는 실행하지 마세요. 개발/스테이징·로컬용입니다.
--
-- 실행: psql "$DATABASE_URL" -f scripts/seed_attendance_standard_all_companies.sql
--       (앱 기동으로 db_schema_ensure 반영 후 실행 권장)
-- =============================================================================

BEGIN;

-- —— FK 순서로 삭제 ——
DELETE FROM attendance_round_up_tier;
DELETE FROM attendance_round_up_section;
DELETE FROM attendance_shift_ot_range;
DELETE FROM attendance_shift;
DELETE FROM attendance_leave_level;
DELETE FROM attendance_leave_global;
DELETE FROM attendance_company_holiday;
DELETE FROM attendance_payment_period;
DELETE FROM attendance_special_allowance;
DELETE FROM attendance_company_settings;

-- —— 회사별 회사설정 ——
INSERT INTO attendance_company_settings (
  company_id,
  daily_work_hours,
  monthly_work_hours,
  day_base_days_per_month,
  ot_rate_level_1,
  ot_rate_level_2,
  ot_rate_level_3,
  ot_rate_level_4,
  ot_rate_level_5,
  processing_format,
  backward_cross_company,
  hide_time_status_no_check,
  zip_card_policy,
  zip_status_in,
  zip_no_machine,
  opt_remark_time_off,
  opt_message_time_off_charge,
  opt_message_leave,
  opt_late_check_half_day_leave,
  opt_process_record_leaves,
  opt_count_leave_in_schedule,
  opt_half_day_leave_half_base
)
SELECT
  c.id,
  '08:00',
  '08:00',
  21,
  1.0,
  1.5,
  2.0,
  2.5,
  3.0,
  'normal',
  FALSE,
  FALSE,
  'warning_full_day',
  NULL,
  NULL,
  FALSE,
  FALSE,
  FALSE,
  FALSE,
  FALSE,
  FALSE,
  FALSE
FROM companies c;

-- —— 특별수당 슬롯 1~3 (빈 이름) ——
INSERT INTO attendance_special_allowance (
  company_id,
  slot_index,
  name,
  working_ot_on_holiday,
  payment_full_day,
  no_payment_late_early
)
SELECT c.id, s.idx, NULL, FALSE, TRUE, FALSE
FROM companies c
CROSS JOIN (VALUES (1::smallint), (2), (3)) AS s(idx);

-- —— 휴가 글로벌(레거시 호환) ——
INSERT INTO attendance_leave_global (
  company_id,
  statutory_start_date,
  leave_other_start_date,
  cumulative_year,
  summer_employee_plus_one,
  display_start_date,
  thai_notice_text,
  certificate_web_path
)
SELECT
  c.id,
  DATE '2026-01-01',
  DATE '2020-01-01',
  2026,
  FALSE,
  DATE '2026-01-01',
  'Sample leave notice (seed).',
  NULL
FROM companies c;

-- —— 휴가등급 1~3 ——
INSERT INTO attendance_leave_level (
  company_id,
  level_number,
  statutory_start_date,
  leave_other_start_date,
  cumulative_year,
  summer_employee_plus_one,
  display_start_date,
  thai_notice_text,
  certificate_web_path
)
SELECT
  c.id,
  ln.lv,
  DATE '2026-01-01',
  DATE '2020-01-01',
  2026,
  FALSE,
  DATE '2026-01-01',
  'Level ' || ln.lv::text || ' · sample notice',
  NULL
FROM companies c
CROSS JOIN generate_series(1, 3) AS ln(lv);

-- —— 등급별 휴가 유형 행 ——
INSERT INTO attendance_leave_level_row (
  leave_level_id,
  sort_order,
  leave_type_name,
  days_quota,
  hours_quota,
  minutes_quota,
  option_checked
)
SELECT
  ll.id,
  v.sort_order,
  v.leave_type_name,
  CASE v.sort_order
    WHEN 0 THEN (CASE ll.level_number WHEN 1 THEN 15 WHEN 2 THEN 12 ELSE 10 END)::numeric
    WHEN 1 THEN 30::numeric
    ELSE 5::numeric
  END,
  0,
  0,
  FALSE
FROM attendance_leave_level ll
CROSS JOIN LATERAL (
  VALUES
    (0, 'Annual leave / 연차'),
    (1, 'Sick leave / 병가'),
    (2, 'Personal / 경조사')
) AS v(sort_order, leave_type_name);

-- —— 회사 휴일(연휴) 샘플 ——
INSERT INTO attendance_company_holiday (company_id, holiday_date, remarks)
SELECT c.id, h.d, h.r
FROM companies c
CROSS JOIN LATERAL (
  VALUES
    (DATE '2026-01-01', 'New Year (sample)'),
    (DATE '2026-05-01', 'Labour Day (sample)'),
    (DATE '2026-12-25', 'Christmas (sample)')
) AS h(d, r);

-- —— 급여기간 샘플: 2026년 1~2월 ——
INSERT INTO attendance_payment_period (
  company_id,
  calendar_year,
  calendar_month,
  period_label,
  start_date_daily,
  end_date_daily,
  start_date_monthly,
  end_date_monthly,
  ot_start_daily,
  ot_end_daily,
  ot_start_monthly,
  ot_end_monthly,
  remarks
)
SELECT
  c.id,
  2026,
  m.mth,
  'Period 1',
  DATE '2026-01-01' + (m.mth - 1) * INTERVAL '1 month',
  (DATE '2026-01-01' + m.mth * INTERVAL '1 month' - INTERVAL '1 day')::date,
  DATE '2026-01-01' + (m.mth - 1) * INTERVAL '1 month',
  (DATE '2026-01-01' + m.mth * INTERVAL '1 month' - INTERVAL '1 day')::date,
  DATE '2026-01-01' + (m.mth - 1) * INTERVAL '1 month',
  (DATE '2026-01-01' + m.mth * INTERVAL '1 month' - INTERVAL '1 day')::date,
  DATE '2026-01-01' + (m.mth - 1) * INTERVAL '1 month',
  (DATE '2026-01-01' + m.mth * INTERVAL '1 month' - INTERVAL '1 day')::date,
  'Sample pay period ' || m.mth::text || '/2026'
FROM companies c
CROSS JOIN (VALUES (1), (2)) AS m(mth);

-- —— 교대 SHIFT1 + 시간/식대 샘플 ——
INSERT INTO attendance_shift (
  company_id,
  shift_code,
  title,
  start_check_in,
  start_work,
  lateness_count_start,
  break_late_time,
  break_late_enabled,
  break_early_time,
  break_early_enabled,
  break_sum,
  time_out,
  continue_shift_without_zip_minutes,
  work_on_holiday,
  late_enabled,
  late_threshold_minutes,
  late_shift_note,
  late_monthly_note,
  early_enabled,
  leaves_enabled,
  leave_food_minutes,
  leave_food_monthly,
  leave_food_daily,
  continuous_ot_minutes,
  continuous_ot_after,
  continuous_ot_before,
  allowance_food,
  allowance_food_monthly,
  allowance_food_daily,
  allowance_shift
)
SELECT
  c.id,
  'SHIFT1',
  COALESCE(NULLIF(TRIM(c.name_kor), ''), NULLIF(TRIM(c.name_eng), ''), NULLIF(TRIM(c.name_thai), ''), c.company_code)
    || ' · Standard shift (sample)',
  '08:30',
  '09:00',
  '09:01',
  '12:00',
  TRUE,
  '13:00',
  TRUE,
  '01:00',
  '18:00',
  0,
  TRUE,
  TRUE,
  10,
  '0',
  '0',
  TRUE,
  TRUE,
  60,
  60,
  60,
  120,
  FALSE,
  TRUE,
  50,
  50,
  50,
  50
FROM companies c;

INSERT INTO attendance_shift_ot_range (
  shift_id,
  sort_order,
  range_start,
  range_end,
  monthly_rate_a,
  monthly_rate_b,
  monthly_rate_holiday,
  daily_rate_a,
  daily_rate_b,
  daily_rate_holiday
)
SELECT
  sh.id,
  v.sort_order,
  v.rs,
  v.re,
  v.ma,
  v.mb,
  v.mh,
  v.da,
  v.db,
  v.dh
FROM attendance_shift sh
CROSS JOIN (
  VALUES
    (0, '09:00', '18:00', 1.0::numeric, 1.0::numeric, 1.25::numeric, 1.5::numeric, 1.5::numeric, 2.0::numeric),
    (1, '18:01', '22:00', 1.5::numeric, 2.0::numeric, 2.5::numeric, 2.0::numeric, 2.5::numeric, 3.0::numeric),
    (2, '22:01', '06:00', 2.0::numeric, 2.5::numeric, 3.0::numeric, 2.5::numeric, 3.0::numeric, 3.5::numeric),
    (3, '00:00', '00:00', NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric),
    (4, '00:00', '00:00', NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric),
    (5, '00:00', '00:00', NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric),
    (6, '00:00', '00:00', NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric),
    (7, '00:00', '00:00', NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric)
) AS v(sort_order, rs, re, ma, mb, mh, da, db, dh)
WHERE sh.shift_code = 'SHIFT1';

-- —— 반올림: 지각 / 조퇴 / OT (tab당 section_1) ——
INSERT INTO attendance_round_up_section (
  company_id,
  tab_key,
  section_key,
  mode_code,
  flag_payroll_include,
  flag_first_minute,
  flag_footer,
  flag_use_late_count,
  extra_json
)
SELECT
  c.id,
  t.tab_key,
  'section_1',
  NULL,
  t.f_pi,
  t.f_fm,
  t.f_ft,
  t.f_uc,
  t.extra
FROM companies c
CROSS JOIN LATERAL (
  VALUES
    (
      'lateness'::varchar(32),
      TRUE,
      TRUE,
      FALSE,
      TRUE,
      (
        SELECT jsonb_build_object(
          'late_day_mode', 'sum_minutes',
          'late_period_mode', 'exceed_hour',
          'late_count_charge_mode', 'charge_per',
          'late_count_with_early_out', FALSE,
          'tiers_period',
          COALESCE(
            (
              SELECT jsonb_agg(
                jsonb_build_object('value_from', 0, 'value_to', 0, 'rounded_minutes', 0) ORDER BY g
              )
              FROM generate_series(1, 8) AS g(g)
            ),
            '[]'::jsonb
          ),
          'tiers_count',
          COALESCE(
            (
              SELECT jsonb_agg(
                jsonb_build_object('value_from', 0, 'value_to', 0, 'rounded_minutes', 0) ORDER BY g
              )
              FROM generate_series(1, 8) AS g(g)
            ),
            '[]'::jsonb
          )
        )
      )
    ),
    (
      'early_checkout',
      TRUE,
      TRUE,
      FALSE,
      TRUE,
      (
        SELECT jsonb_build_object(
          'early_day_mode', 'exceed_hour',
          'early_period_mode', 'exceed_hour',
          'early_count_charge_mode', 'charge_per',
          'early_tiers_period',
          COALESCE(
            (
              SELECT jsonb_agg(
                jsonb_build_object('value_from', 0, 'value_to', 0, 'rounded_minutes', 0) ORDER BY g
              )
              FROM generate_series(1, 8) AS g(g)
            ),
            '[]'::jsonb
          ),
          'early_tiers_count',
          COALESCE(
            (
              SELECT jsonb_agg(
                jsonb_build_object('value_from', 0, 'value_to', 0, 'rounded_minutes', 0) ORDER BY g
              )
              FROM generate_series(1, 8) AS g(g)
            ),
            '[]'::jsonb
          )
        )
      )
    ),
    (
      'ot',
      FALSE,
      TRUE,
      FALSE,
      FALSE,
      (
        SELECT jsonb_build_object(
          'ot_payroll_no_separate_ot_holiday', FALSE,
          'ot_round_up_working', TRUE,
          'ot_day_mode', 'exceed_hour',
          'ot_period_mode', 'exceed_hour',
          'ot_tiers_period',
          COALESCE(
            (
              SELECT jsonb_agg(
                jsonb_build_object('value_from', 0, 'value_to', 0, 'rounded_minutes', 0) ORDER BY g
              )
              FROM generate_series(1, 11) AS g(g)
            ),
            '[]'::jsonb
          )
        )
      )
    )
) AS t(tab_key, f_pi, f_fm, f_ft, f_uc, extra);

-- —— 반올림 티어(메인 tiers 컬럼): 지각·조퇴 8행, OT 11행 ——
INSERT INTO attendance_round_up_tier (section_id, row_index, value_from, value_to, rounded_minutes)
SELECT s.id, g.i, 0, 0, 0
FROM attendance_round_up_section s
CROSS JOIN generate_series(0, 7) AS g(i)
WHERE s.tab_key IN ('lateness', 'early_checkout');

INSERT INTO attendance_round_up_tier (section_id, row_index, value_from, value_to, rounded_minutes)
SELECT s.id, g.i, 0, 0, 0
FROM attendance_round_up_section s
CROSS JOIN generate_series(0, 10) AS g(i)
WHERE s.tab_key = 'ot';

COMMIT;
