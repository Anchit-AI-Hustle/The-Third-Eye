// Server-only check of the test unlock code. It used to be a NEXT_PUBLIC_ value,
// which ships inside the browser bundle for anyone to read. Set TEST_UNLOCK_CODE
// (server-only); NEXT_PUBLIC_TEST_UNLOCK_CODE is still read here, on the server,
// until that rename is made. Unset means the bypass is off.

export function testUnlockCode(): string {
  return (process.env.TEST_UNLOCK_CODE || process.env.NEXT_PUBLIC_TEST_UNLOCK_CODE || "").trim();
}

export function matchesTestCode(entered: string): boolean {
  const expected = testUnlockCode();
  return expected.length > 0 && entered.trim() === expected;
}
