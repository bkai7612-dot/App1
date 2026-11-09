import { test } from "node:test";
import assert from "node:assert/strict";
import { safeNext } from "../../src/lib/safe-next.ts";

test("safeNext blocks open redirects", () => {
  for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)", "evil", "/x\r\nSet-Cookie:a=b", ""]) {
    assert.equal(safeNext(bad, "/home"), "/home", bad);
  }
  assert.equal(safeNext("/players/SS-ABC?tab=negative"), "/players/SS-ABC?tab=negative");
});
