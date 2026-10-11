import { describe, expect, it, vi } from "vitest";

vi.mock("dns/promises", () => {
  const lookup = async (host: string) => {
    const table: Record<string, string[]> = {
      "mcp.example.com": ["93.184.216.34"],
      "evil.example.com": ["10.0.0.5"],
      "rebind.example.com": ["93.184.216.34", "127.0.0.1"],
      "metadata.example.com": ["169.254.169.254"],
    };
    if (!table[host]) throw new Error("ENOTFOUND");
    return table[host].map((address) => ({ address, family: 4 }));
  };
  return { lookup, default: { lookup } };
});

const { checkConnectorUrl, connectorSlug, isPrivateAddress, maskUrl } = await import("@/lib/mcp/userConnectors");

describe("user-added connector URLs", () => {
  it("accepts https on a public host", async () => {
    expect(await checkConnectorUrl("https://mcp.example.com/s/abc")).toEqual({ ok: true, url: "https://mcp.example.com/s/abc" });
  });

  it("refuses anything that could reach the server's own network", async () => {
    for (const url of [
      "http://mcp.example.com/mcp",
      "https://localhost/mcp",
      "https://127.0.0.1/mcp",
      "https://[::1]/mcp",
      "https://evil.example.com/mcp",
      "https://rebind.example.com/mcp",
      "https://metadata.example.com/latest",
      "https://user:pass@mcp.example.com/mcp",
      "https://nowhere.example.com/mcp",
      "not a url",
    ]) {
      expect((await checkConnectorUrl(url)).ok, url).toBe(false);
    }
  });

  it("classifies private and public addresses", () => {
    for (const ip of ["10.1.2.3", "172.16.0.1", "192.168.1.1", "100.64.0.1", "169.254.1.1", "0.0.0.0", "::ffff:10.0.0.1", "fd00::1", "fe80::1"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ["8.8.8.8", "172.32.0.1", "2606:4700::1111"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });

  it("makes safe tool-name prefixes and hides keys in URLs", () => {
    expect(connectorSlug("My Zapier!!")).toBe("u_my_zapier");
    expect(connectorSlug("a__b")).toBe("u_a_b");
    expect(maskUrl("https://mcp.zapier.com/api/mcp/s/SECRET/mcp")).toBe("mcp.zapier.com/…");
  });
});
