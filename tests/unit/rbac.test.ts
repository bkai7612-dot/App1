import { test } from "node:test";
import assert from "node:assert/strict";
import { can, assignableRoles, isStaff } from "../../src/lib/rbac.ts";

test("least privilege matrix", () => {
  assert.equal(can("user", "mod.dashboard"), false);
  assert.equal(can("moderator", "mod.reports.review"), true);
  assert.equal(can("moderator", "mod.appeals.decide"), false);
  assert.equal(can("moderator", "audit.view"), false);
  assert.equal(can("moderator", "billing.view"), false);
  assert.equal(can("senior_moderator", "users.suspend"), true);
  assert.equal(can("senior_moderator", "users.roles.manage"), false);
  assert.equal(can("admin", "audit.view"), true);
  assert.equal(can("bogus", "mod.dashboard"), false);
  assert.equal(isStaff("user"), false);
});
test("role assignment limits", () => {
  assert.deepEqual(assignableRoles("moderator"), []);
  assert.ok(!assignableRoles("admin").includes("admin"));
  assert.ok(!assignableRoles("admin").includes("super_admin"));
  assert.ok(assignableRoles("super_admin").includes("admin"));
});
