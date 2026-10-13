import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ensure = vi.fn();
vi.mock("@/lib/permissionGate", () => ({ ensureCapability: (c: string) => ensure(c) }));
const deliver = vi.fn((_f: unknown, _o: unknown) => ({ downloaded: true, opened: true }));
vi.mock("@/lib/fileSave", async (orig) => ({ ...(await orig<typeof import("@/lib/fileSave")>()), deliverFile: (f: unknown, o: unknown) => deliver(f, o) }));

import { FileCard } from "@/components/assistant/FileCard";

const file = { filename: "index.html", mime: "text/html", content: "<h1>Hi</h1>" };

beforeEach(() => { ensure.mockReset(); deliver.mockClear(); });

describe("a file JARVIS made, in the chat", () => {
  it("asks for the Files permission, then saves to Downloads and opens it", async () => {
    ensure.mockResolvedValue(true);
    render(<FileCard file={file} claimAuto={() => true} />);
    await waitFor(() => expect(deliver).toHaveBeenCalledWith(file, { open: true }));
    expect(ensure).toHaveBeenCalledWith("files");
    expect(await screen.findByText(/Saved to Downloads and opened/)).toBeTruthy();
  });

  it("does nothing on its own when the permission is refused, and leaves the buttons", async () => {
    ensure.mockResolvedValue(false);
    render(<FileCard file={file} claimAuto={() => true} />);
    await waitFor(() => expect(ensure).toHaveBeenCalled());
    expect(deliver).not.toHaveBeenCalled();
    expect(await screen.findByText(/Not saved yet/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Save & open/ }));
    expect(deliver).toHaveBeenCalledWith(file, { open: true });
  });

  it("never acts on its own for a file from an older reply", () => {
    render(<FileCard file={file} />);
    expect(ensure).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /^Download$/ }));
    expect(deliver).toHaveBeenCalledWith(file, { open: false });
  });

  it("acts on its own only once, so reopening the chat does not download it again", async () => {
    ensure.mockResolvedValue(true);
    const fresh = new Set(["m1:0"]);
    const claim = () => fresh.delete("m1:0");
    const first = render(<FileCard file={file} claimAuto={claim} />);
    await waitFor(() => expect(deliver).toHaveBeenCalledTimes(1));
    first.unmount();
    render(<FileCard file={file} claimAuto={claim} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(deliver).toHaveBeenCalledTimes(1);
  });

  it("says a file too big to keep in chat history is gone, instead of saving an empty file", () => {
    render(<FileCard file={{ ...file, content: "" }} />);
    expect(screen.getByText(/ask JARVIS to make it again/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Download/ })).toBeNull();
  });

  it("says when the browser blocked the new tab", async () => {
    ensure.mockResolvedValue(true);
    deliver.mockReturnValueOnce({ downloaded: true, opened: false });
    render(<FileCard file={file} claimAuto={() => true} />);
    expect(await screen.findByText(/Saved to Downloads.*pop-up/)).toBeTruthy();
  });
});
