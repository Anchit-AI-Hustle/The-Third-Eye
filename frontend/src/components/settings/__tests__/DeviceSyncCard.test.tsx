import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DeviceSyncCard } from "../DeviceSyncCard";

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { email: "test@example.com" } } }),
}));

describe("DeviceSyncCard", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders Device Data & Media Sync header and cloud active indicator", () => {
    render(<DeviceSyncCard />);
    expect(screen.getByText("Device Data & Media Sync")).toBeInTheDocument();
    expect(screen.getByText(/Mobile & Laptop Cloud Sync Active/i)).toBeInTheDocument();
    expect(screen.getByText("Device Contacts")).toBeInTheDocument();
    expect(screen.getByText("Device Files & Photos Vault")).toBeInTheDocument();
  });

  it("opens Contacts Sync modal when clicking Sync Device Contacts on web/laptop/iOS", async () => {
    render(<DeviceSyncCard />);
    const syncBtn = screen.getByRole("button", { name: /Sync Device Contacts/i });
    expect(syncBtn).toBeInTheDocument();

    fireEvent.click(syncBtn);

    // Modal appears with instructions and options
    await waitFor(() => {
      expect(screen.getAllByText("Device Contacts Sync").length).toBeGreaterThan(0);
      expect(screen.getByText(/Option 1: Import Contacts File/i)).toBeInTheDocument();
      expect(screen.getByText(/Option 2: Paste Contact Names/i)).toBeInTheDocument();
      expect(screen.getByText(/Option 3: Add Single Contact/i)).toBeInTheDocument();
      expect(screen.getByText(/How to export all iPhone contacts in 5 seconds/i)).toBeInTheDocument();
    });

    // Close modal
    const closeBtn = screen.getByRole("button", { name: "Close" });
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByText(/Option 1: Import Contacts File/i)).not.toBeInTheDocument();
    });
  });

  it("allows adding a contact manually and updates count", async () => {
    render(<DeviceSyncCard />);
    const addBtn = screen.getByRole("button", { name: /Add Contact/i });
    fireEvent.click(addBtn);

    const nameInput = screen.getByPlaceholderText(/Name \(e\.g\. Priya Sharma/i);
    const phoneInput = screen.getByPlaceholderText(/Phone \(e\.g\. \+91/i);

    fireEvent.change(nameInput, { target: { value: "Rohit Sharma" } });
    fireEvent.change(phoneInput, { target: { value: "+91 9873945238" } });

    const saveBtn = screen.getByRole("button", { name: /Save Contact/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText(/Contact added to JARVIS memory/i)).toBeInTheDocument();
      expect(screen.getByText("1 synced")).toBeInTheDocument();
    });
  });

  it("allows pasting multiple contacts in batch", async () => {
    render(<DeviceSyncCard />);
    const pasteBtn = screen.getByRole("button", { name: /Paste/i });
    fireEvent.click(pasteBtn);

    const textarea = screen.getByPlaceholderText(/Priya Sharma, \+91/i);
    fireEvent.change(textarea, {
      target: {
        value: "Aviral Vahdam, +91 9811122334\nMom, +1 555 123 4567",
      },
    });

    const importLinesBtn = screen.getByRole("button", { name: /Import Lines/i });
    fireEvent.click(importLinesBtn);

    await waitFor(() => {
      expect(screen.getByText(/Imported 2 contacts/i)).toBeInTheDocument();
      expect(screen.getByText("2 synced")).toBeInTheDocument();
    });
  });

  it("renders dedicated upload buttons for Photos and Documents in vault", () => {
    render(<DeviceSyncCard />);
    expect(screen.getByText("Upload Photos")).toBeInTheDocument();
    expect(screen.getByText("Upload Documents")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sync Folder/i })).toBeInTheDocument();
  });
});
