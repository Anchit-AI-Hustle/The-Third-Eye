import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLocalContacts, parseVCard, parseCSVContacts } from "@/hooks/useLocalContacts";

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { email: "test@example.com" } } }),
}));

describe("useLocalContacts", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("loads empty contacts initially", () => {
    const { result } = renderHook(() => useLocalContacts());
    expect(result.current.contacts).toEqual([]);
  });

  it("adds and persists a new contact", () => {
    const { result } = renderHook(() => useLocalContacts());
    act(() => {
      result.current.addContact({
        name: "Mom",
        phone: "+91 9873945238",
        relationship: "Mother",
      });
    });

    expect(result.current.contacts.length).toBe(1);
    expect(result.current.contacts[0].name).toBe("Mom");
    expect(result.current.contacts[0].phone).toBe("+91 9873945238");
    expect(result.current.contacts[0].relationship).toBe("Mother");

    const saved = JSON.parse(localStorage.getItem("jarvis_contacts_v1:test@example.com") ?? "[]");
    expect(saved.length).toBe(1);
    expect(saved[0].name).toBe("Mom");
  });

  it("never loads another account's contacts left on this browser", () => {
    localStorage.setItem("jarvis_contacts_v1", JSON.stringify([{ id: "x", name: "Someone else", phone: "1", updated_at: "" }]));
    localStorage.setItem("jarvis_contacts_v1:other@example.com", JSON.stringify([{ id: "y", name: "Other user", phone: "2", updated_at: "" }]));
    const { result } = renderHook(() => useLocalContacts());
    expect(result.current.contacts).toEqual([]);
  });

  it("removes a contact by id", () => {
    const { result } = renderHook(() => useLocalContacts());
    act(() => {
      result.current.addContact({
        name: "Rohit",
        phone: "+91 9999999999",
      });
    });

    const contactId = result.current.contacts[0].id;
    act(() => {
      result.current.removeContact(contactId);
    });

    expect(result.current.contacts).toEqual([]);
  });

  it("parses vCard 3.0 / 4.0 data accurately", () => {
    const vcfSample = `BEGIN:VCARD
VERSION:3.0
FN:Aviral Mehta
N:Mehta;Aviral;;;
TEL;TYPE=CELL,VOICE:+91 98111 22334
EMAIL;TYPE=WORK:aviral@acme.com
NOTE:Co-founder
END:VCARD`;

    const parsed = parseVCard(vcfSample);
    expect(parsed.length).toBe(1);
    expect(parsed[0].name).toBe("Aviral Mehta");
    expect(parsed[0].phone).toBe("+91 98111 22334");
    expect(parsed[0].email).toBe("aviral@acme.com");
    expect(parsed[0].notes).toBe("Co-founder");
    expect(parsed[0].source).toBe("vcf");
  });

  it("parses CSV contacts format accurately", () => {
    const csvSample = `Name,Phone,Email,Notes
Aviral Mehta,+919811122334,aviral@acme.com,Tea Partner
Rohit Sharma,9876543210,,Teammate`;

    const parsed = parseCSVContacts(csvSample);
    expect(parsed.length).toBe(2);
    expect(parsed[0].name).toBe("Aviral Mehta");
    expect(parsed[0].phone).toBe("+919811122334");
    expect(parsed[0].email).toBe("aviral@acme.com");
    expect(parsed[1].name).toBe("Rohit Sharma");
    expect(parsed[1].phone).toBe("9876543210");
  });

  describe("in the native app", () => {
    const plugin = { requestPermissions: vi.fn(), getContacts: vi.fn() };
    beforeEach(() => {
      plugin.requestPermissions.mockReset();
      plugin.getContacts.mockReset();
      (window as any).Capacitor = { isNativePlatform: () => true, Plugins: { Contacts: plugin } };
    });
    afterEach(() => { delete (window as any).Capacitor; });

    it("imports the whole address book once allowed", async () => {
      plugin.requestPermissions.mockResolvedValue({ contacts: "granted" });
      plugin.getContacts.mockResolvedValue({ contacts: [
        { contactId: "1", name: { display: "Priya Sharma" }, phones: [{ number: "+91 98100 00001" }], emails: [{ address: "priya@example.com" }] },
        { contactId: "2", name: { display: "Ravi" }, phones: [{ number: "+91 98100 00002" }] },
        { contactId: "3", name: { display: null }, phones: [] },
      ] });
      const { result } = renderHook(() => useLocalContacts());
      let r: { count: number; supported: boolean; error?: string } | undefined;
      await act(async () => { r = await result.current.syncDeviceContacts(); });
      expect(plugin.getContacts).toHaveBeenCalledWith({ projection: { name: true, phones: true, emails: true } });
      expect(r).toEqual({ count: 2, supported: true });
      expect(result.current.contacts.map((c) => [c.name, c.phone, c.email])).toEqual(expect.arrayContaining([
        ["Priya Sharma", "+91 98100 00001", "priya@example.com"],
        ["Ravi", "+91 98100 00002", undefined],
      ]));
    });

    it("says so when access is refused, and reads nothing", async () => {
      plugin.requestPermissions.mockResolvedValue({ contacts: "denied" });
      const { result } = renderHook(() => useLocalContacts());
      let r: { count: number; supported: boolean; error?: string } | undefined;
      await act(async () => { r = await result.current.syncDeviceContacts(); });
      expect(plugin.getContacts).not.toHaveBeenCalled();
      expect(r?.count).toBe(0);
      expect(r?.error).toMatch(/Contacts access is off/);
    });
  });
});
