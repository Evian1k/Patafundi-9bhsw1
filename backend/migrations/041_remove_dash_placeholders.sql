-- Migration 041: remove em/en dash placeholder characters from user-visible text.
-- The dash sign was used as an empty-value placeholder and in seeded demo copy;
-- users read it as "missing data". All visible text now uses plain hyphens or
-- honest words. Code-side strings were cleaned in the same pass; this migration
-- cleans rows that were already seeded/persisted (dev PGlite + production).
-- All updates are idempotent: they match only rows that still contain the sign.

update fundis
   set bio = replace(replace(bio, '—', '-'), '–', '-')
 where bio like '%—%' or bio like '%–%';

update customer_properties
   set label = replace(replace(label, '—', '-'), '–', '-')
 where label like '%—%' or label like '%–%';

update company_profiles
   set branches = replace(branches::text, '—', '-')::jsonb
 where branches::text like '%—%';

update company_profiles
   set description = replace(replace(description, '—', '-'), '–', '-')
 where description like '%—%' or description like '%–%';

update jobs
   set description = replace(replace(description, '—', '-'), '–', '-')
 where description like '%—%' or description like '%–%';

update reviews
   set comment = replace(replace(comment, '—', '-'), '–', '-')
 where comment like '%—%' or comment like '%–%';

update revenue_ledger
   set notes = replace(replace(notes, '—', '-'), '–', '-')
 where notes like '%—%' or notes like '%–%';

update notifications
   set title = replace(replace(title, '—', '-'), '–', '-'),
       body  = replace(replace(body,  '—', '-'), '–', '-')
 where title like '%—%' or title like '%–%' or body like '%—%' or body like '%–%';

update policies
   set body = replace(replace(body, '—', '-'), '–', '-')
 where body like '%—%' or body like '%–%';
