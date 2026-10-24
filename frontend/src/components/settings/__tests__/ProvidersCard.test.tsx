import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProvidersCard } from "@/components/settings/ProvidersCard";

afterEach(() => vi.unstubAllGlobals());

function server(local: Record<string, unknown>, putStatus = 200) {
  const puts: unknown[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/providers") return Response.json({ providers: [] });
    if (url === "/api/user/provider-keys") return Response.json({ keys: [{ provider: "ollama", hint: "mac.example.com" }] });
    if (url === "/api/user/local-model" && init?.method === "PUT") { puts.push(JSON.parse(String(init.body))); return Response.json(putStatus === 200 ? { ok: true } : { error: "Database is down." }, { status: putStatus }); }
    if (url === "/api/user/local-model" && init?.method === "POST") return Response.json({ ok: true, models: ["llama3.1:8b", "qwen2.5:14b"], ms: 120 });
    if (url === "/api/user/local-model") return Response.json(local);
    return Response.json({});
  }));
  return puts;
}

describe("AI providers in Settings", () => {
  it("offers each provider its own way in: a sign-in where it has one, otherwise its own key page", async () => {
    server({ connected: false, localFirst: false, model: null, assistantModels: {}, hasToken: false });
    render(<ProvidersCard />);
    expect(await screen.findByRole("link", { name: /Sign in with OpenRouter/ })).toHaveAttribute("href", "/api/connect/openrouter");
    expect(screen.getByRole("link", { name: /Sign in with Hugging Face/ })).toHaveAttribute("href", "/api/connect/huggingface");
    const keyPages = screen.getAllByRole("link", { name: "Get a key" }).map((a) => a.getAttribute("href"));
    expect(keyPages).toEqual(expect.arrayContaining(["https://console.groq.com/keys", "https://aistudio.google.com/apikey", "https://console.mistral.ai/api-keys", "https://platform.openai.com/api-keys"]));
    expect(screen.getByRole("button", { name: "Disconnect Ollama on your computer" })).toBeInTheDocument();
  });

  it("says which provider a sign-in just connected", async () => {
    server({ connected: false, localFirst: false, model: null, assistantModels: {}, hasToken: false });
    window.history.pushState({}, "", "/settings?tab=agent&connect=huggingface_connected");
    render(<ProvidersCard />);
    expect(await screen.findByText("Signed in with Hugging Face. Your chats now use your own Hugging Face account.")).toBeInTheDocument();
    window.history.pushState({}, "", "/");
  });

  it("saves a pasted key for the provider whose row it was pasted in", async () => {
    const keys: unknown[] = [];
    server({ connected: false, localFirst: false, model: null, assistantModels: {}, hasToken: false });
    const base = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      if (url === "/api/user/provider-keys" && init?.method === "PUT") { keys.push(JSON.parse(String(init.body))); return Response.json({ ok: true }); }
      return base(url, init);
    });
    render(<ProvidersCard />);
    const groq = (await screen.findByText("Groq")).closest("li")!;
    fireEvent.click(within(groq).getByRole("button", { name: "Paste key" }));
    fireEvent.change(within(groq).getByLabelText("Groq key"), { target: { value: "gsk_mine" } });
    fireEvent.click(within(groq).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(keys).toEqual([{ provider: "groq", value: "gsk_mine" }]));
  });

  it("shows your computer answering first, lists its models and saves a model per assistant", async () => {
    const puts = server({ connected: true, host: "mac.example.com", localFirst: true, model: null, assistantModels: {}, hasToken: false });
    render(<ProvidersCard />);
    const toggle = await screen.findByRole("checkbox", { name: /Answer from my computer first/ });
    expect(toggle).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
    expect(await screen.findByText(/Connected - 2 models/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "FRIDAY model" }), { target: { value: "qwen2.5:14b" } });
    fireEvent.click(screen.getByRole("button", { name: "Save assistant models" }));
    await waitFor(() => expect(puts).toContainEqual({ assistantModels: { friday: "qwen2.5:14b" } }));

    fireEvent.click(toggle);
    await waitFor(() => expect(puts).toContainEqual({ localFirst: false }));
  });

  it("types any model name and keeps an unsaved one when another setting is saved", async () => {
    const puts = server({ connected: true, host: "mac.example.com", localFirst: true, model: "llama3.1:8b", assistantModels: {}, hasToken: false });
    render(<ProvidersCard />);
    const model = await screen.findByRole("combobox", { name: "Model" });
    fireEvent.change(model, { target: { value: "my-own:7b" } });
    expect(model).toHaveValue("my-own:7b");

    fireEvent.click(screen.getByRole("checkbox", { name: /Answer from my computer first/ }));
    await waitFor(() => expect(puts).toContainEqual({ localFirst: false }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(5));
    expect(model).toHaveValue("my-own:7b");
  });

  it("keeps the tunnel password typed in when saving it fails", async () => {
    const puts = server({ connected: true, host: "mac.example.com", localFirst: true, model: null, assistantModels: {}, hasToken: false }, 500);
    render(<ProvidersCard />);
    const password = await screen.findByLabelText("Tunnel password");
    fireEvent.change(password, { target: { value: "user:pass" } });
    fireEvent.click(within(password.parentElement!).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Database is down.")).toBeInTheDocument();
    expect(puts).toContainEqual({ token: "user:pass" });
    expect(password).toHaveValue("user:pass");
  });
});
