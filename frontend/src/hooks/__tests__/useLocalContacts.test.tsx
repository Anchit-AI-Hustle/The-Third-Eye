import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLocalContacts } from "@/hooks/useLocalContacts";

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
});
