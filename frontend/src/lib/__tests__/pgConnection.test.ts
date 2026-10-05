import { X509Certificate } from "node:crypto";
import { rootCertificates } from "node:tls";
import { describe, expect, it } from "vitest";
import { pgConnection } from "@/lib/pgConnection.mjs";

describe("pgConnection", () => {
  it("verifies Supabase hosts against Supabase's root as well as the system roots", () => {
    const c = pgConnection("postgresql://postgres.ref:pw@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true");
    expect(c.connectionString).toBe("postgresql://postgres.ref:pw@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true");
    const ca = (c as { ssl: { ca: string[] } }).ssl.ca;
    expect(ca).toHaveLength(rootCertificates.length + 1);
    const root = new X509Certificate(ca.at(-1)!);
    expect(root.subject).toContain("CN=Supabase Root 2021 CA");
    expect(root.fingerprint256).toBe("80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA");
    expect(pgConnection("postgres://postgres:pw@db.hlcjghpzxzatgjfwcoav.supabase.co:5432/postgres")).toHaveProperty("ssl");
  });

  it("leaves every other database's connection string alone", () => {
    for (const url of ["postgres://u:p@ep-x.us-east-2.aws.neon.tech/db?sslmode=require", "postgres://owner:pw@localhost:5432/neontest"]) {
      expect(pgConnection(url)).toEqual({ connectionString: url });
    }
    expect(pgConnection("postgres://u:p@evil-supabase.co.example.com/db")).not.toHaveProperty("ssl");
  });
});
