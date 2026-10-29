# The database

Four things live here: the migrations that build the database, the seed with ArchPoint's own
hosts and rooms, a hardening step, and a test that checks the rules the database enforces by itself.

## Already applied

These have been run against the project `benvidirtbvfwyoohlyd` (archpoint-vms). You do not need
to run them again unless you create a second project.

| File | What it does |
|---|---|
| `0001_schema.sql` | tables, constraints, indexes |
| `0002_functions.sql` | triggers, the audit trail, the meeting-location rules |
| `0003_rls.sql` | who may read and write what |
| `0004_seed.sql` | 11 rooms, 8 hosts, 4 location rules, the data-collection notice |
| `0005_harden.sql` | closes the warnings Supabase's security linter raises |

To apply them to a fresh project: Supabase → SQL Editor, paste each file in order and run it.

## The test

```bash
cd supabase && npm install && npm test
```

Starts a throwaway Postgres, runs the migrations and checks 56 rules as each role: contact codes,
duplicate refusals, one active visit per person, what a host can and cannot see, the self-promotion
block, the append-only audit log, and that a signed-out visitor sees nothing at all.

## Where the rules live

Most rules are written twice on purpose: once in the API, where the message can explain itself to
a receptionist, and once in the database, where nothing can get round them. If the two ever
disagree, the database wins and the API's message is the thing to fix.
