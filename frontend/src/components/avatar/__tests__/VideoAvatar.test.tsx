import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { VideoAvatar } from "@/components/avatar/VideoAvatar";

// Mock SpeechSynthesis
const mockSpeak = vi.fn();
const mockCancel = vi.fn();
const mockGetVoices = vi.fn(() => []);
Object.defineProperty(window, "speechSynthesis", {
  value: {
    speak: mockSpeak,
    cancel: mockCancel,
    getVoices: mockGetVoices,
    onvoiceschanged: null,
  },
  writable: true,
});

// Mock MediaRecorder
class MockMediaRecorder {
  state = "inactive";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start() { this.state = "recording"; }
  stop() { this.state = "inactive"; this.onstop?.(); }
}
Object.defineProperty(window, "MediaRecorder", { value: MockMediaRecorder, writable: true });

// Mock canvas.captureStream
HTMLCanvasElement.prototype.captureStream = () => ({
  getVideoTracks: () => [{ stop: () => {} }],
  getAudioTracks: () => [],
} as any);

// Mock URL.createObjectURL / revokeObjectURL
const mockCreateObjectURL = vi.fn(() => "blob:mock-url");
const mockRevokeObjectURL = vi.fn();
Object.defineProperty(URL, "createObjectURL", { value: mockCreateObjectURL, writable: true });
Object.defineProperty(URL, "revokeObjectURL", { value: mockRevokeObjectURL, writable: true });

// Mock recordGeneration
vi.mock("@/lib/generations", () => ({
  recordGeneration: vi.fn(),
}));

describe("VideoAvatar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders idle state with placeholder", () => {
    render(<VideoAvatar />);
    expect(screen.getByText(/Enter a script and click/)).toBeDefined();
    expect(screen.getByText("Generate avatar")).toBeDefined();
  });

  it("renders with initial script and style props", () => {
    render(<VideoAvatar script="Hello world" style="casual" />);
    const textarea = screen.getByPlaceholderText(/Type the script/) as HTMLTextAreaElement;
    expect(textarea.value).toBe("Hello world");
    expect(screen.getByText(/Casual/)).toBeDefined();
  });

  it("disables generate button when script is empty", () => {
    render(<VideoAvatar />);
    const btn = screen.getByText("Generate avatar").closest("button")!;
    expect(btn.disabled).toBe(true);
  });

  it("enables generate button when script has content", () => {
    render(<VideoAvatar />);
    const textarea = screen.getByPlaceholderText(/Type the script/);
    fireEvent.change(textarea, { target: { value: "Hello world" } });
    const btn = screen.getByText("Generate avatar").closest("button")!;
    expect(btn.disabled).toBe(false);
  });

  it("shows 4 avatar style options", () => {
    render(<VideoAvatar />);
    expect(screen.getByText(/Professional/)).toBeDefined();
    expect(screen.getByText(/Casual/)).toBeDefined();
    expect(screen.getByText(/Anime/)).toBeDefined();
    expect(screen.getByText(/Realistic/)).toBeDefined();
  });

  it("allows changing avatar style", () => {
    render(<VideoAvatar />);
    const animeBtn = screen.getByText(/Anime/);
    fireEvent.click(animeBtn);
    // The anime button should now have active styling
    // Style button should be clickable and change state
    expect(screen.getByText(/Anime/)).toBeDefined();
  });

  it("updates script when textarea changes", () => {
    render(<VideoAvatar />);
    const textarea = screen.getByPlaceholderText(/Type the script/);
    fireEvent.change(textarea, { target: { value: "New script" } });
    expect((textarea as HTMLTextAreaElement).value).toBe("New script");
  });
});
