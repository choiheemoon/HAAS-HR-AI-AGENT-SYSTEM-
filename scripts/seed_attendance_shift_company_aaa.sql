-- 한국어 회사(회사코드 AAA) 교대·OT 샘플 데이터
-- OT 요율: 월급(M)=급여처리 Monthly, 시급(D)=Daily
-- 열 의미: 평일 / 일요일 / 전통휴일 (TigerSoft M1·M2 2열과 다른 3열 구조)
-- 실행 전: 앱 기동으로 스키마 보정(컬럼 추가). psql 등으로 실행.

DELETE FROM attendance_shift_ot_range
WHERE shift_id IN (
  SELECT s.id FROM attendance_shift s
  INNER JOIN companies c ON c.id = s.company_id
  WHERE c.company_code = 'AAA' AND s.shift_code = 'SHIFT1'
);

DELETE FROM attendance_shift s
USING companies c
WHERE s.company_id = c.id AND c.company_code = 'AAA' AND s.shift_code = 'SHIFT1';

INSERT INTO attendance_shift (
  company_id, shift_code, title,
  start_check_in, start_work, lateness_count_start,
  break_late_time, break_late_enabled, break_early_time, break_early_enabled, break_sum, time_out,
  continue_shift_without_zip_minutes,
  work_on_holiday, late_enabled, late_threshold_minutes, late_shift_note, late_monthly_note,
  early_enabled, leaves_enabled, leave_food_minutes, leave_food_monthly, leave_food_daily,
  continuous_ot_minutes, continuous_ot_after, continuous_ot_before,
  allowance_food, allowance_food_monthly, allowance_food_daily, allowance_shift
)
SELECT
  c.id,
  'SHIFT1',
  '한국어 표준 교대 (샘플)',
  '08:30', '09:00', '09:01',
  '12:00', TRUE, '13:00', TRUE, '01:00', '18:00',
  0,
  TRUE, TRUE, 0, '0', '0',
  TRUE, TRUE, 60, 60, 60,
  120, FALSE, TRUE,
  50, 50, 50, 50
FROM companies c
WHERE c.company_code = 'AAA'
LIMIT 1;

INSERT INTO attendance_shift_ot_range (
  shift_id, sort_order, range_start, range_end,
  monthly_rate_a, monthly_rate_b, monthly_rate_holiday,
  daily_rate_a, daily_rate_b, daily_rate_holiday
)
SELECT sh.sid, v.sort_order, v.rs, v.re, v.ma, v.mb, v.mh, v.da, v.db, v.dh
FROM (
  SELECT s.id AS sid
  FROM attendance_shift s
  INNER JOIN companies c ON c.id = s.company_id
  WHERE c.company_code = 'AAA' AND s.shift_code = 'SHIFT1'
) sh
CROSS JOIN (
  VALUES
    (0, '09:00', '18:00', 1.0::numeric,  1.0::numeric,  1.25::numeric, 1.5::numeric, 1.5::numeric, 2.0::numeric),
    (1, '18:01', '22:00', 1.5::numeric,  2.0::numeric,  2.5::numeric,  2.0::numeric, 2.5::numeric, 3.0::numeric),
    (2, '22:01', '06:00', 2.0::numeric,  2.5::numeric,  3.0::numeric,  2.5::numeric, 3.0::numeric, 3.5::numeric),
    (3, '00:00', '00:00', NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric),
    (4, '00:00', '00:00', NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric),
    (5, '00:00', '00:00', NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric),
    (6, '00:00', '00:00', NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric),
    (7, '00:00', '00:00', NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric)
) AS v(sort_order, rs, re, ma, mb, mh, da, db, dh);
