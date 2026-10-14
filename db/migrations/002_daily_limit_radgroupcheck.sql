-- Daily 4h-per-person limit, phase 2 (2026-10-14)
--
-- Run only AFTER FreeRADIUS has been restarted with mods-enabled/daily_person:
-- that module defines Max-Daily-Person-Session, and rlm_sql can't parse a
-- check item for an attribute it doesn't know yet.
--
-- Change the limit later with an UPDATE on this row — no deploy or restart.
INSERT INTO radgroupcheck (groupname, attribute, op, value)
VALUES ('freewifi', 'Max-Daily-Person-Session', ':=', '14400');
