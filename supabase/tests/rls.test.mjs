/**
 * Runs the migrations on a throwaway Postgres and checks the rules the database
 * must enforce on its own, as each role.
 *
 *   npm i embedded-postgres pg      (in any empty folder)
 *   node supabase/tests/rls.test.mjs
 */
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const migrations = path.join(here, "..", "migrations");
const dir = process.env.PGTMP ?? "/tmp/archpoint-vms-pg/data";

let pass = 0;
let fail = 0;
const ok = (name, condition, extra = "") => {
  condition ? pass++ : fail++;
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${condition ? "" : "  <-- " + extra}`);
};
const throws = async (fn, match) => {
  try {
    await fn();
    return false;
  } catch (e) {
    return match ? new RegExp(match, "i").test(e.message) : true;
  }
};

fs.rmSync(dir, { recursive: true, force: true });
const server = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "pw", port: 54331, persistent: false });
await server.initialise();
await server.start();
const db = new pg.Client({ host: "localhost", port: 54331, user: "postgres", password: "pw", database: "postgres" });
await db.connect();

// --- the parts of Supabase the migrations lean on -------------------------
await db.query(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text unique,
    raw_user_meta_data jsonb default '{}'::jsonb
  );
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`);

for (const file of fs.readdirSync(migrations).sort()) {
  await db.query(fs.readFileSync(path.join(migrations, file), "utf8"));
}
ok("all migrations run", true);

// --- people ---------------------------------------------------------------
const addUser = async (email, name) =>
  (await db.query("insert into auth.users (email, raw_user_meta_data) values ($1, jsonb_build_object('full_name', $2::text)) returning id", [email, name])).rows[0].id;

const pratap = await addUser("archpointskill@gmail.com", "Pratap Singh");
const reception = await addUser("reception@archpoint.in", "Front Desk");
const amitUser = await addUser("amit@archpoint.in", "Amit Khandelwal");
const nehaUser = await addUser("neha@archpoint.in", "Neha Sharma");
const manager = await addUser("manager@archpoint.in", "Office Manager");

ok("the first account becomes the active Admin",
  (await db.query("select role, active from public.staff where id = $1", [pratap])).rows[0].role === "admin" &&
  (await db.query("select active from public.staff where id = $1", [pratap])).rows[0].active === true);
ok("later accounts wait for the Admin to activate them",
  (await db.query("select active from public.staff where id = $1", [reception])).rows[0].active === false);

const hostId = async (name) => (await db.query("select id from public.hosts where name = $1", [name])).rows[0].id;
const amitHost = await hostId("Amit Khandelwal");
const nehaHost = await hostId("Neha Sharma");
const poonamHost = await hostId("Poonam Ma'am");
const vartikaHost = await hostId("Vartika Maheshwari");

await db.query("update public.staff set role = 'reception', active = true where id = $1", [reception]);
await db.query("update public.staff set role = 'host', host_id = $2, active = true where id = $1", [amitUser, amitHost]);
await db.query("update public.staff set role = 'host', host_id = $2, active = true where id = $1", [nehaUser, nehaHost]);
await db.query("update public.staff set role = 'manager', active = true where id = $1", [manager]);

ok("seed loaded 11 rooms, 8 hosts and 4 rules",
  (await db.query("select (select count(*) from public.rooms) r, (select count(*) from public.hosts) h, (select count(*) from public.location_rules) l")).rows[0].r === "11");

/** Run a statement as a signed-in Supabase user, rolled back afterwards. */
const as = async (uid, sql, params = []) => {
  await db.query("begin");
  try {
    await db.query("set local role authenticated");
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
    const r = await db.query(sql, params);
    await db.query("rollback");
    return r;
  } catch (e) {
    await db.query("rollback");
    throw e;
  }
};
/** Same, but kept. */
const asKeep = async (uid, sql, params = []) => {
  await db.query("begin");
  try {
    await db.query("set local role authenticated");
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
    const r = await db.query(sql, params);
    await db.query("commit");
    return r;
  } catch (e) {
    await db.query("rollback");
    throw e;
  }
};
/** As the API does it: a trusted connection that names the actor. */
const asApi = async (uid, sql, params = []) => {
  await db.query("begin");
  try {
    await db.query("select set_config('app.actor_id', $1, true)", [uid]);
    const r = await db.query(sql, params);
    await db.query("commit");
    return r;
  } catch (e) {
    await db.query("rollback");
    throw e;
  }
};

// --- contacts -------------------------------------------------------------
const c1 = (await asKeep(reception,
  `insert into public.contacts (full_name, mobile, email, date_of_birth, organisation, created_by)
   values ('Anita Sharma', '+919829000001', 'anita@example.com', '1990-05-24', 'Sharma Constructions', $1)
   returning id, contact_code`, [reception])).rows[0];
ok("the first contact gets AP-C-000001", c1.contact_code === "AP-C-000001", c1.contact_code);

const c2 = (await asKeep(reception,
  "insert into public.contacts (full_name, mobile, created_by) values ('Rohit Mehra', '+919829000002', $1) returning id, contact_code", [reception])).rows[0];
ok("codes keep counting up", c2.contact_code === "AP-C-000002", c2.contact_code);

ok("a contact code can never be changed",
  await throws(() => asKeep(reception, "update public.contacts set contact_code = 'AP-C-999999' where id = $1", [c1.id]), "cannot be changed"));
ok("a bad mobile number is refused",
  await throws(() => asKeep(reception, "insert into public.contacts (full_name, mobile) values ('X', '98290')")));
ok("a date of birth in the future is refused",
  await throws(() => asKeep(reception, "insert into public.contacts (full_name, mobile, date_of_birth) values ('X', '+919829000009', '2999-01-01')")));
ok("a PR contact without email and date of birth is refused",
  await throws(() => asKeep(reception, "update public.contacts set is_pr_contact = true where id = $1", [c2.id]), "pr_contact"));
ok("a PR contact with both is allowed",
  (await asKeep(reception, "update public.contacts set is_pr_contact = true where id = $1 returning id", [c1.id])).rowCount === 1);

ok("date of birth is not a readable column",
  await throws(() => as(reception, "select date_of_birth from public.contacts"), "permission denied"));
ok("the other contact columns read normally",
  (await as(reception, "select full_name, contact_code from public.contacts")).rowCount === 2);
ok("reception gets no full date of birth",
  (await as(reception, "select public.contact_dob($1) d", [c1.id])).rows[0].d === null);
ok("the Manager gets the full date of birth",
  String((await as(manager, "select public.contact_dob($1)::text d", [c1.id])).rows[0].d) === "1990-05-24");
ok("reception gets day and month only",
  (await as(reception, "select public.contact_birthday($1) b", [c1.id])).rows[0].b === "24 May");

// --- meeting location rules ----------------------------------------------
const roomFor = async (host, type) => (await as(reception, "select public.suggest_room($1, $2::visitor_type) r", [host, type])).rows[0].r;
const roomName = async (id) => (await db.query("select name from public.rooms where id = $1", [id])).rows[0].name;
ok("Amit plus a client goes to the Board room", (await roomName(await roomFor(amitHost, "Client"))) === "Board room");
ok("Amit plus a vendor goes to the Board room", (await roomName(await roomFor(amitHost, "Vendor and site vendor"))) === "Board room");
ok("Amit plus anything else goes to his cabin", (await roomName(await roomFor(amitHost, "Wellness session"))) === "Amit cabin");
ok("an interview goes to the interview room for any host", (await roomName(await roomFor(nehaHost, "Interview candidate"))) === "Interview room");
ok("Poonam Ma'am's visitors go to her cabin", (await roomName(await roomFor(poonamHost, "Client"))) === "Poonam Ma'am cabin");
ok("anyone else falls back to the host's own cabin", (await roomName(await roomFor(nehaHost, "Client"))) === "Neha cabin");

// --- visits ---------------------------------------------------------------
const board = (await db.query("select id from public.rooms where name = 'Board room'")).rows[0].id;
const v1 = (await asKeep(reception,
  `insert into public.visits (contact_id, host_id, visitor_type, purpose, room_id, created_by)
   values ($1, $2, 'Client', 'Project discussion', $3, $4) returning id`, [c1.id, amitHost, board, reception])).rows[0];
ok("checking in alerts the host",
  (await as(amitUser, "select body from public.notifications where visit_id = $1", [v1.id])).rows[0].body.includes("Anita Sharma"));
ok("a second active visit for the same person is refused",
  await throws(() => asKeep(reception,
    "insert into public.visits (contact_id, host_id, visitor_type, purpose) values ($1, $2, 'Client', 'Other')", [c1.id, amitHost]), "duplicate key"));
ok("checking out before checking in is refused",
  await throws(() => asKeep(reception, "update public.visits set status = 'Checked out', check_out = check_in - interval '1 hour' where id = $1", [v1.id]), "checkout_not_before_checkin"));
ok("denying without a reason is refused",
  await throws(() => asKeep(reception, "update public.visits set status = 'Denied' where id = $1", [v1.id]), "closed_states_need_a_reason"));
ok("a wellness visit cannot carry another purpose",
  await throws(() => asKeep(reception,
    "insert into public.visits (contact_id, host_id, visitor_type, purpose) values ($1, $2, 'Wellness session', 'Other')", [c2.id, poonamHost]), "wellness_purpose_is_fixed"));

const v2 = (await asKeep(reception,
  "insert into public.visits (contact_id, host_id, visitor_type, purpose) values ($1, $2, 'Client', 'Other') returning id", [c2.id, nehaHost])).rows[0];

ok("a host sees only the visits addressed to them",
  (await as(amitUser, "select id from public.visits")).rows.map((r) => String(r.id)).join() === String(v1.id));
ok("a host sees only the people who visited them",
  (await as(amitUser, "select full_name from public.contacts")).rows.map((r) => r.full_name).join() === "Anita Sharma");
ok("a host cannot change a visit directly",
  (await asKeep(amitUser, "update public.visits set status = 'Checked out' where id = $1", [v1.id])).rowCount === 0);
ok("a host cannot see the contact list",
  (await as(amitUser, "select count(*)::int n from public.contacts")).rows[0].n === 1);

await asKeep(amitUser, "select public.reply_to_visit($1, 'Wait 10 minutes')", [v1.id]);
ok("the host's 'wait 10 minutes' sets the waiting time",
  (await db.query("select reply, wait_until is not null w from public.visits where id = $1", [v1.id])).rows[0].w === true);
ok("a host cannot reply to someone else's visitor",
  await throws(() => asKeep(amitUser, "select public.reply_to_visit($1, 'Send in')", [v2.id]), "only the host"));

await asKeep(amitUser, "select public.reply_to_visit($1, 'Can''t meet today')", [v1.id]);
const denied = (await db.query("select status, reason, check_out from public.visits where id = $1", [v1.id])).rows[0];
ok("'can't meet today' denies the visit and records the reason",
  denied.status === "Denied" && denied.reason === "The host could not meet today" && denied.check_out !== null);
ok("the same person can visit again once the last visit is closed",
  (await asKeep(reception, "insert into public.visits (contact_id, host_id, visitor_type, purpose) values ($1, $2, 'Client', 'Other') returning id", [c1.id, amitHost])).rowCount === 1);
ok("a reply to a closed visit is refused",
  await throws(() => asKeep(amitUser, "select public.reply_to_visit($1, 'Send in')", [v1.id]), "no longer active"));

// --- appointments and room clashes ---------------------------------------
const mkAppt = async (name, startsAt, status = "Approved", room = board, host = amitHost) =>
  (await asKeep(reception,
    `insert into public.appointments (guest_name, guest_mobile, host_id, visitor_type, purpose, room_id, starts_at, duration_minutes, status)
     values ($1, '+919829000111', $2, 'Client', 'Project discussion', $3, $4, 60, $5) returning id`,
    [name, host, room, startsAt, status])).rows[0].id;

await mkAppt("Mahesh Tailor", "2026-11-03T05:30:00Z", "Pending approval");
await mkAppt("Sunita Kothari", "2026-11-03T06:00:00Z");
await mkAppt("Ravi Purohit", "2026-11-05T05:30:00Z");
const clashes = (await as(reception, "select * from public.room_clashes($1, $2)", ["2026-11-01T00:00:00Z", "2026-11-30T00:00:00Z"])).rows;
ok("two overlapping Board room bookings are reported as a clash", clashes.length === 1, JSON.stringify(clashes));
await mkAppt("Declined Guest", "2026-11-05T05:45:00Z", "Declined");
ok("a declined booking never counts as a clash",
  (await as(reception, "select * from public.room_clashes($1, $2)", ["2026-11-05T00:00:00Z", "2026-11-06T00:00:00Z"])).rows.length === 0);

const ownAppt = await mkAppt("Host's own guest", "2026-11-06T05:30:00Z", "Pending approval", null, amitHost);
ok("a host can approve their own booking",
  (await asKeep(amitUser, "update public.appointments set status = 'Approved' where id = $1 returning id", [ownAppt])).rowCount === 1);
ok("a host cannot touch another host's booking",
  (await asKeep(nehaUser, "update public.appointments set status = 'Declined' where id = $1", [ownAppt])).rowCount === 0);

// --- staff, audit and anonymous access ------------------------------------
ok("reception cannot edit hosts",
  (await asKeep(reception, "update public.hosts set name = 'Hacked' where id = $1", [amitHost])).rowCount === 0);
ok("the Admin can edit hosts",
  (await asKeep(pratap, "update public.hosts set mobile = '+919829012345' where id = $1 returning id", [amitHost])).rowCount === 1);
ok("reception cannot see the staff list",
  (await as(reception, "select count(*)::int n from public.staff")).rows[0].n === 1);
ok("the Admin sees everyone",
  (await as(pratap, "select count(*)::int n from public.staff")).rows[0].n === 5);
ok("the Admin cannot change their own role, so nobody can lock themselves out",
  await throws(() => asKeep(pratap, "update public.staff set role = 'reception' where id = $1", [pratap]), "your own role"));
ok("the Admin cannot switch off their own access",
  await throws(() => asKeep(pratap, "update public.staff set active = false where id = $1", [pratap]), "your own role"));
ok("reception cannot promote themselves",
  (await asKeep(reception, "update public.staff set role = 'admin' where id = $1", [reception])).rowCount === 0);
ok("the Admin can promote somebody else",
  (await asKeep(pratap, "update public.staff set role = 'manager' where id = $1 returning id", [nehaUser])).rowCount === 1);

ok("reception cannot read the audit log",
  (await as(reception, "select count(*)::int n from public.audit_log")).rows[0].n === 0);
ok("the Manager reads the audit log",
  (await as(manager, "select count(*)::int n from public.audit_log")).rows[0].n > 5);
ok("the audit log cannot be edited or deleted, even by the owner",
  await throws(() => db.query("delete from public.audit_log"), "cannot be changed"));
ok("the audit log never stores a date of birth",
  (await db.query("select count(*)::int n from public.audit_log where detail ? 'date_of_birth'")).rows[0].n === 0);
ok("the audit log names who did it",
  (await db.query("select count(*)::int n from public.audit_log where actor_name is not null")).rows[0].n > 0);

ok("a signed-out visitor sees nothing",
  await throws(async () => {
    await db.query("begin");
    try { await db.query("set local role anon"); await db.query("select * from public.visits"); } finally { await db.query("rollback"); }
  }, "permission denied"));
ok("a deactivated account loses access", await (async () => {
  await db.query("update public.staff set active = false where id = $1", [manager]);
  const n = (await as(manager, "select count(*)::int n from public.visits")).rows[0].n;
  await db.query("update public.staff set active = true where id = $1", [manager]);
  return n === 0;
})());

// --- the API path (trusted connection naming its actor) -------------------
await asApi(reception, "insert into public.contacts (full_name, mobile) values ('Api Created', '+919829000777')");
ok("the API's actor is recorded in the audit log",
  (await db.query("select actor_id from public.audit_log where entity = 'contacts' order by id desc limit 1")).rows[0].actor_id === reception);

console.log(`\n${pass} passed, ${fail} failed`);
await db.end();
await server.stop();
process.exit(fail ? 1 : 0);
