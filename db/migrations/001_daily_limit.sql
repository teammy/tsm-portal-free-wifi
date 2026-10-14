-- Daily 4h-per-person limit, phase 1 (2026-10-14)
--
-- registrations already has idx_doc_hmac (doc_number_hmac) and idx_mac_time
-- (mac, created_at); radacct has username — no new indexes needed.
--
-- The portal now puts every session username in radusergroup (group
-- 'freewifi') so the FreeRADIUS sqlcounter can read Max-Daily-Session from
-- radgroupcheck. The portal DB user needs to write that table.
GRANT SELECT, INSERT, UPDATE, DELETE ON `radius`.`radusergroup` TO `tsmportalwifi`@`172.17.%`;
