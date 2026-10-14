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

    const saved = JSON.parse(localStorage.getItem("jarvis_contacts_v1") ?? "[]");
    expect(saved.length).toBe(1);
    expect(saved[0].name).toBe("Mom");
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
FN:Aviral Vahdam
N:Vahdam;Aviral;;;
TEL;TYPE=CELL,VOICE:+91 98111 22334
EMAIL;TYPE=WORK:aviral@vahdam.com
NOTE:Co-founder
END:VCARD`;

    const parsed = parseVCard(vcfSample);
    expect(parsed.length).toBe(1);
    expect(parsed[0].name).toBe("Aviral Vahdam");
    expect(parsed[0].phone).toBe("+91 98111 22334");
    expect(parsed[0].email).toBe("aviral@vahdam.com");
    expect(parsed[0].notes).toBe("Co-founder");
    expect(parsed[0].source).toBe("vcf");
  });

  it("parses CSV contacts format accurately", () => {
    const csvSample = `Name,Phone,Email,Notes
Aviral Vahdam,+919811122334,aviral@vahdam.com,Tea Partner
Rohit Sharma,9876543210,,Teammate`;

    const parsed = parseCSVContacts(csvSample);
    expect(parsed.length).toBe(2);
    expect(parsed[0].name).toBe("Aviral Vahdam");
    expect(parsed[0].phone).toBe("+919811122334");
    expect(parsed[0].email).toBe("aviral@vahdam.com");
    expect(parsed[1].name).toBe("Rohit Sharma");
    expect(parsed[1].phone).toBe("9876543210");
  });
});
