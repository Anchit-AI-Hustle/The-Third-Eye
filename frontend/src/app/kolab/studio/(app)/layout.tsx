// web/app/(app)/layout.tsx — authenticated, org-aware shell. Server component: enforces a
// Kolab session (Supabase Auth — separate from the outer NextAuth gate in
// app/kolab/studio/layout.tsx), resolves the active org (→ onboarding if the user has none),
// and renders the pack-specific menu, org switcher, and top bar. Pack routing/vocabulary comes
// from lib/packs + lib/copy.
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/kolab-studio/db";
import { ensureProvisioned } from "@/lib/kolab-studio/provision";
import { getActiveOrg, getMyMemberships } from "@/lib/kolab-studio/org";
import { PACK_NAV } from "@/lib/kolab-studio/packs";
import { Logo } from "@/components/kolab-studio/Logo";
import { AppMenu } from "./AppMenu";
import { OrgSwitcher } from "./OrgSwitcher";
import { SignOutButton } from "./SignOutButton";

export default async function KolabAppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser().catch(() => null);
  if (!user) redirect("/kolab/studio/auth");

  const active = await getActiveOrg();
  if (!active) redirect("/kolab/studio/onboarding");

  // Creator profile/subscription/kyc bootstrap only applies to the creator pack.
  if (active.org.type === "creator") await ensureProvisioned(user);

  const memberships = await getMyMemberships();
  const label = user.email || user.phone || "New member";
  const initials = (label || "?").slice(0, 2).toUpperCase();

  return (
    <div>
      <div className="sticky top-0 z-40 border-b border-kolab-line bg-kolab-base/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1120px] items-center gap-3 px-[clamp(16px,4vw,30px)] py-3">
          <Logo size={16} />
          <div className="ml-auto flex items-center gap-2.5">
            <OrgSwitcher
              orgs={memberships.map((m) => ({ id: m.org.id, name: m.org.name, type: m.org.type }))}
              activeId={active.org.id}
            />
            <div className="hidden items-center gap-2.5 rounded-full border border-kolab-line bg-kolab-surface py-[5px] pl-3 pr-[6px] sm:flex">
              <span className="max-w-[150px] truncate text-[13px] font-semibold">{label}</span>
              <span className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-kolab-lime to-kolab-violet font-kolab-display text-[12px] font-black text-kolab-base">
                {initials}
              </span>
            </div>
            <SignOutButton />
          </div>
        </div>
      </div>

      <AppMenu nav={PACK_NAV[active.org.type]} />

      <main className="mx-auto max-w-[1120px] px-[clamp(16px,4vw,30px)] py-[clamp(24px,4vw,44px)] pb-16">
        {children}
      </main>
    </div>
  );
}
