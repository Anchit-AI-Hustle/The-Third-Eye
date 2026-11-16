import { X509Certificate } from "node:crypto";
import { rootCertificates } from "node:tls";
import { describe, expect, it, vi } from "vitest";
import { isSupabase, pgConnection } from "@/lib/pgConnection.mjs";

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

  it("names verify-full explicitly where the URL used an alias pg already treats as verify-full", () => {
    for (const mode of ["prefer", "require", "verify-ca"]) {
      expect(pgConnection(`postgres://u:p@ep-x.us-east-2.aws.neon.tech/db?sslmode=${mode}&channel_binding=require`))
        .toEqual({ connectionString: "postgres://u:p@ep-x.us-east-2.aws.neon.tech/db?sslmode=verify-full&channel_binding=require" });
    }
  });

  it("does not trigger pg's sslmode alias warning", async () => {
    const { parse } = await import("pg-connection-string");
    const warn = vi.spyOn(process, "emitWarning");
    parse(pgConnection("postgres://u:p@ep-x.us-east-2.aws.neon.tech/db?sslmode=require").connectionString);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("leaves other connection strings alone", () => {
    for (const url of ["postgres://u:p@ep-x.us-east-2.aws.neon.tech/db?sslmode=verify-full", "postgres://owner:pw@localhost:5432/neontest", "postgres://u:p@h/db?sslmode=disable"]) {
      expect(pgConnection(url)).toEqual({ connectionString: url });
    }
    expect(pgConnection("postgres://u:p@evil-supabase.co.example.com/db")).not.toHaveProperty("ssl");
  });

  it("tells a Supabase database from any other, so the build flags a non-Supabase one", () => {
    expect(isSupabase("postgresql://postgres.ref:pw@aws-0-ap-south-1.pooler.supabase.com:6543/postgres")).toBe(true);
    expect(isSupabase("postgresql://postgres:pw@db.dypkppctdbmsiqclnhzx.supabase.co:5432/postgres")).toBe(true);
    expect(isSupabase("postgresql://u:pw@ep-x-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require")).toBe(false);
    expect(isSupabase("postgres://u:pw@localhost:5432/app")).toBe(false);
  });
});
