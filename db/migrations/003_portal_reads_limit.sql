-- Daily 4h-per-person limit, phase 3 (2026-10-14)
--
-- The portal reads the limit (Max-Daily-Person-Session on group 'freewifi')
-- from radgroupcheck to show time left and turn people away before RADIUS
-- does. Run BEFORE deploying the phase 3 portal: without it every
-- registration fails.
GRANT SELECT ON `radius`.`radgroupcheck` TO `tsmportalwifi`@`172.17.%`;
