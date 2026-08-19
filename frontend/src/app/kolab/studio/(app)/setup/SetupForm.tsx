"use client";
// web/app/(app)/setup/SetupForm.tsx — profile editor. Posts to server routes that re-validate
// everything (client validation is UX only). KYC uses the Phase-2 provider stub.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Label, Pill } from "@/components/kolab-studio/ui";

interface Initial {
  name: string;
  handle: string;
  dob: string;
  pincode: string;
  website_url: string;
  city: string;
  state: string;
  country: string;
}

export function SetupForm({
  initial,
  kycVerified,
  canPro,
}: {
  initial: Initial;
  kycVerified: boolean;
  canPro: boolean;
}) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [loc, setLoc] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Initial, v: string) => setF((p) => ({ ...p, [k]: v }));

  async function lookupPin(pin: string) {
    if (!/^\d{6}$/.test(pin)) return;
    setLoc("Looking up…");
    try {
      const r = await fetch(`https://api.postalpincode.in/pincode/${pin}`).then((x) => x.json());
      const po = r?.[0]?.PostOffice?.[0];
      if (po) {
        setF((p) => ({ ...p, city: po.District, state: po.State, country: po.Country || "India" }));
        setLoc(`✓ ${po.District}, ${po.State}`);
      } else setLoc("Pincode not found — enter city/state manually");
    } catch {
      setLoc("Offline — enter city/state manually");
    }
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/kolab-studio/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: f.name || undefined,
          handle: f.handle || undefined,
          dob: f.dob || undefined,
          pincode: f.pincode || undefined,
          website_url: canPro && f.website_url ? f.website_url : undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || "Save failed");
      setMsg("Profile saved");
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <Card className="p-[22px]">
        <div className="grid gap-3.5 md:grid-cols-2">
          <div>
            <Label>Full name</Label>
            <Input value={f.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div>
            <Label>Influencer / brand handle</Label>
            <Input value={f.handle} placeholder="@yourhandle" onChange={(e) => set("handle", e.target.value)} />
          </div>
          <div>
            <Label>Date of birth</Label>
            <Input type="date" value={f.dob} onChange={(e) => set("dob", e.target.value)} />
          </div>
          <div>
            <Label>Pincode</Label>
            <Input
              inputMode="numeric"
              maxLength={6}
              value={f.pincode}
              onChange={(e) => {
                set("pincode", e.target.value);
                lookupPin(e.target.value.trim());
              }}
            />
            <div className="mt-1 font-kolab-mono text-[11px] text-kolab-lime">{loc}</div>
          </div>
          <div>
            <Label>City / District</Label>
            <Input value={f.city} disabled />
          </div>
          <div>
            <Label>State</Label>
            <Input value={f.state} disabled />
          </div>
          <div className="md:col-span-2">
            <Label>
              Website URL {!canPro && <Pill tone="lock">Pro</Pill>}
            </Label>
            <Input
              value={f.website_url}
              disabled={!canPro}
              placeholder="https://yoursite.com"
              onChange={(e) => set("website_url", e.target.value)}
            />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button variant="primary" disabled={busy} onClick={save}>
            Save profile
          </Button>
          {msg && <span className="font-kolab-mono text-[12px] text-kolab-muted">{msg}</span>}
        </div>
      </Card>

      <KycCard verified={kycVerified} onDone={() => router.refresh()} />
    </div>
  );
}

function KycCard({ verified, onDone }: { verified: boolean; onDone: () => void }) {
  const [aadhaar, setAadhaar] = useState("");
  const [ref, setRef] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function call(action: "initiate" | "verify") {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/kolab-studio/kyc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "initiate"
            ? { action, aadhaar, consent: true }
            : { action, reference_id: ref, otp },
        ),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || "KYC unavailable");
      if (action === "initiate") {
        setRef(body.data.reference_id);
        setMsg("OTP sent to your Aadhaar-linked mobile (provider).");
      } else {
        setMsg("Aadhaar verified.");
        onDone();
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "KYC unavailable");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-[22px]">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-[16px]">Aadhaar verification</h3>
        {verified && <Pill tone="ok">✓ Verified</Pill>}
      </div>
      {verified ? (
        <p className="text-[13px] text-kolab-muted">Your identity is verified. Features are unlocked once you also have an active plan.</p>
      ) : (
        <>
          <div className="grid gap-3.5 md:grid-cols-2">
            <Input
              inputMode="numeric"
              maxLength={14}
              placeholder="XXXX XXXX XXXX"
              value={aadhaar}
              onChange={(e) => setAadhaar(e.target.value)}
            />
            {!ref ? (
              <Button disabled={busy} onClick={() => call("initiate")}>
                Verify via OTP
              </Button>
            ) : (
              <div className="flex gap-2">
                <Input placeholder="OTP" value={otp} onChange={(e) => setOtp(e.target.value)} />
                <Button variant="primary" disabled={busy} onClick={() => call("verify")}>
                  Confirm
                </Button>
              </div>
            )}
          </div>
          <p className="mt-2.5 font-kolab-mono text-[10px] leading-relaxed text-kolab-faint">
            Real Aadhaar eKYC runs only through a UIDAI-licensed provider with your consent. We never
            store your Aadhaar number or biometrics — only verification status and a masked reference.
          </p>
        </>
      )}
      {msg && <div className="mt-2 font-kolab-mono text-[12px] text-kolab-muted">{msg}</div>}
    </Card>
  );
}
