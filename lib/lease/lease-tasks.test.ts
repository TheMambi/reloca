// Script-style assertions for the lease tasks and the state deposit rule.
// Run via: `npx tsx lib/lease/lease-tasks.test.ts`

import assert from "node:assert/strict";
import { buildLeaseTasks, depositDeadline, noticeSendByDate } from "./lease-tasks";
import { depositReturnDays, leaseStateCode } from "./deposit-rules";

// Fictional fixture leases.
const colorado = {
  city: "Denver, CO 80000",
  lease_end_date: "2027-10-31",
  notice_days_required: 60,
  target_move_out_date: null,
};
const california = {
  city: "Sacramento, CA 95800",
  lease_end_date: "2027-11-30",
  notice_days_required: 30,
  target_move_out_date: "2027-11-15",
};

// The state comes from the lease's city line, or from the registry for a bare name.
assert.equal(leaseStateCode("Denver, CO 80000"), "CO");
assert.equal(leaseStateCode("Sacramento, CA 95800"), "CA");
assert.equal(leaseStateCode("Denver"), "CO", "bare registry city");
assert.equal(leaseStateCode("Testville"), null, "unknown city");
assert.equal(leaseStateCode("Testville, ZZ"), null, "not a state code");

// Only a state with a rule on file has a number.
assert.equal(depositReturnDays("CO"), 60);
assert.equal(depositReturnDays("CA"), null, "no figure is invented for other states");
assert.equal(depositReturnDays(null), null);

// Colorado lease, 60-day notice: the dates the app has always produced.
{
  const tasks = buildLeaseTasks(colorado);
  assert.equal(tasks.length, 7);
  assert.deepEqual(tasks.map((t) => t.order_index), [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(tasks[0].title, "Send 60-day notice to vacate");
  assert.equal(tasks[0].due_date, "2027-09-01");
  assert.deepEqual(
    tasks.map((t) => t.due_date),
    ["2027-09-01", "2027-10-17", "2027-10-24", "2027-11-07", "2027-10-28", "2027-10-31", "2027-12-30"],
  );
  assert.match(tasks[6].description ?? "", /^Colorado: .* 60 days/);
  assert.equal(depositDeadline(colorado), null, "no deposit event without a target move-out date");
  assert.equal(depositDeadline({ ...colorado, target_move_out_date: "2027-10-31" }), "2027-12-30");
}

// California lease, 30-day notice: 30-day wording, and no Colorado deposit date.
{
  const tasks = buildLeaseTasks(california);
  assert.equal(tasks[0].title, "Send 30-day notice to vacate");
  assert.equal(tasks[0].due_date, "2027-10-31");
  assert.equal(noticeSendByDate(california), "2027-10-31");
  assert.equal(tasks[5].due_date, "2027-11-15", "key return follows the target move-out date");
  assert.equal(tasks[6].due_date, null, "no deposit date without a rule on file");
  assert.doesNotMatch(tasks[6].description ?? "", /Colorado|60/);
  assert.match(tasks[6].description ?? "", /Check your state's rule/);
  assert.equal(depositDeadline(california), null);
}

// The stored notice task is recognized whatever period its title carries.
{
  const pattern = buildLeaseTasks(california)[0].titlePattern!;
  assert.ok(pattern.test("Send 60-day notice to vacate"));
  assert.ok(pattern.test("Send notice to vacate"));
  assert.ok(!pattern.test("Send flowers"));
  assert.equal(buildLeaseTasks({ ...california, notice_days_required: 0 })[0].title, "Send notice to vacate");
}

console.log("lease-tasks.test.ts ✅");
