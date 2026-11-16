import { describe, expect, it } from "vitest";
import { actionProof, validActionProof } from "@/lib/actionIdentity";
describe("reviewed action proof", () => {
 it("binds every parameter, user, id and expiry; argument ordering does not matter", () => {
  process.env.NEXTAUTH_SECRET = "synthetic-only-secret";
  const args = { to: "synthetic@example.test", body: "Synthetic" };
  const proof = actionProof("u", "id", "send_email", args);
  expect(validActionProof(proof, "u", "id", "send_email", { body: "Synthetic", to: args.to })).toBe(true);
  for (const [u,id,tool,a] of [["v","id","send_email",args],["u","id2","send_email",args],["u","id","social_post",args],["u","id","send_email",{...args,body:"changed"}]] as const)
   expect(validActionProof(proof,u,id,tool,a)).toBe(false);
  expect(validActionProof(actionProof("u","id","send_email",args,Date.now()-1),"u","id","send_email",args)).toBe(false);
 });
});
