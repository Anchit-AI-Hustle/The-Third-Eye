// The deployment owner's own work context. Only accounts listed in OWNER_EMAILS
// get it; everyone else gets prompts about "the user" with no assumed employer.
const OWNER_CONTEXT = `The user is Anchit Tandon, who leads D2C growth at Vahdam India (a premium tea D2C brand). Direct team: Aman, Manisha, Arihant.
Office work means Vahdam work: growth, marketing, marketplace, CRO, retention, team.`;

const GENERIC_CONTEXT = `Office work means the user's job: their employer, clients, colleagues and professional projects.`;

export function isOwner(email: string | null | undefined): boolean {
  const list = (process.env.OWNER_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return !!email && list.includes(email.toLowerCase());
}

export function workContext(email: string | null | undefined): string {
  return isOwner(email) ? OWNER_CONTEXT : GENERIC_CONTEXT;
}
