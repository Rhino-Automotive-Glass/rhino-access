# Production-shaped RLS matrix (2026-09-22)

## Setup

Used isolated, network-disabled Supabase PostgreSQL 17.6 Docker containers. Created minimal legacy `user_roles`, `audit_logs`, and `product_codes` tables, replayed this repository's `001`–`012` migrations (with removed `009` absent), loaded sibling-owned production policies for public product reads, editor product creation, and authenticated audit insertion, then applied `013`. These three definitions and table grants were checked against production `pg_policies` and `has_table_privilege` before testing. Fixture contained seven synthetic auth users, including another viewer, another admin, and a new subject, plus other-user rows in `user_roles`, `user_permissions`, and `audit_logs`.

Each actor ran with `SET LOCAL ROLE` (`anon` or `authenticated`) and corresponding JWT claim settings. Each actor's transaction was rolled back. A successful write means one row changed; denial means zero rows changed or SQLSTATE `42501`. Read probes targeted other-user rows. Product codes are shared records without a user-owner column.

## Results

All 100 role × table × operation cases matched expected production policy behavior. `✓` means allowed; `—` means denied.

| Table | Actor | Read | Insert | Update | Delete |
| --- | --- | :---: | :---: | :---: | :---: |
| `user_roles` | anon | — | — | — | — |
| `user_roles` | viewer | — | — | — | — |
| `user_roles` | quality_assurance | — | — | — | — |
| `user_roles` | editor | — | — | — | — |
| `user_roles` | admin | ✓ | ✓ | ✓ | ✓ |
| `user_permissions` | anon | — | — | — | — |
| `user_permissions` | viewer | — | — | — | — |
| `user_permissions` | quality_assurance | — | — | — | — |
| `user_permissions` | editor | — | — | — | — |
| `user_permissions` | admin | ✓ | ✓ | ✓ | ✓ |
| `role_permissions` | anon | — | — | — | — |
| `role_permissions` | viewer | — | — | — | — |
| `role_permissions` | quality_assurance | — | — | — | — |
| `role_permissions` | editor | — | — | — | — |
| `role_permissions` | admin | ✓ | — | — | — |
| `audit_logs` | anon | — | — | — | — |
| `audit_logs` | viewer | — | ✓¹ | — | — |
| `audit_logs` | quality_assurance | — | ✓¹ | — | — |
| `audit_logs` | editor | — | ✓¹ | — | — |
| `audit_logs` | admin | ✓ | ✓¹ | — | — |
| `product_codes` | anon | ✓ | — | — | — |
| `product_codes` | viewer | ✓ | — | — | — |
| `product_codes` | quality_assurance | ✓ | — | —² | — |
| `product_codes` | editor | ✓ | ✓ | ✓ | — |
| `product_codes` | admin | ✓ | ✓ | ✓ | ✓ |

¹ Authenticated INSERT succeeded only with `user_id = auth.uid()`. Other fields remained client-controlled.

² Matrix updated `notes`; separate QA probe updating only `verified` succeeded. Admin update/delete of a peer admin's `user_roles` row both returned zero rows. These three boundary probes passed.

## Replay checks

- Reapplying `012` left `pg_get_functiondef` hashes for all three audit functions unchanged.
- Reapplying historical `002`, `003`, or `006` after `013` raised their guard before changing functions or policies; before/after catalog hashes matched.
- Fresh shared-schema replay through revised `013` passed with sibling policies loaded first. Reapplying `013` also passed. Dropping the editor-create policy inside a test transaction caused `013` to abort with its expected exception; the transaction rolled back and policy remained present.

## Finding and limits

Production's `System can insert audit logs` policy plus `authenticated` INSERT table grant lets any signed-in user write an audit row attributed to themselves, with arbitrary `action`, `resource_type`, and JSON data. `log_audit_event()` restricts its own RPC to admins but does not prevent this direct insert. This PR records production behavior; changing that policy needs a separate reviewed security change.

This targeted fixture covered policies and functions involved in the migration; it was not a full clone of every sibling application's schema or an end-to-end browser test. No production DDL or DML was executed.
