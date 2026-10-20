// Everything the public demo shows. Fictional people, fictional files; the
// "assistant" output is scripted to match what the signed-in tools return.

export type DemoTask = {
  id: string;
  title: string;
  due: string;
  priority: "high" | "medium" | "low";
  source: string;
  done?: boolean;
};

export type DemoNote = { id: string; title: string; body: string; source: string };

export const SAMPLE_EMAILS = [
  {
    id: "e1",
    from: "Priya Shah · Northwind",
    subject: "Contract renewal - need your sign-off by Thursday",
    body: "Hi! The Northwind services agreement renews on 1 Nov. Could you check clause 7 (auto-renewal) and send me your sign-off by Thursday? I'll also need the Q3 usage numbers for the review.",
    tasks: [
      { id: "t1", title: "Review clause 7 of the Northwind agreement", due: "Thu", priority: "high", source: "Email · Priya Shah" },
      { id: "t2", title: "Send Q3 usage numbers to Priya", due: "Thu", priority: "medium", source: "Email · Priya Shah" },
    ] as DemoTask[],
  },
  {
    id: "e2",
    from: "Smile Dental Clinic",
    subject: "Appointment reminder",
    body: "This is a reminder of your check-up on Friday at 10:30. Reply to this email if you need to reschedule.",
    tasks: [
      { id: "t3", title: "Dentist check-up at 10:30", due: "Fri", priority: "low", source: "Email · Smile Dental" },
    ] as DemoTask[],
  },
  {
    id: "e3",
    from: "This Week in AI",
    subject: "Issue #142: five papers worth reading",
    body: "Our weekly roundup of research, tools and launches…",
    tasks: [] as DemoTask[],
  },
];

export const SAMPLE_DOC = {
  name: "Northwind_Services_Agreement.pdf",
  pages: 12,
  passages: [
    { ref: "§7 Auto-renewal", text: "This Agreement renews automatically for successive 12-month terms unless either party gives written notice at least 30 days before the renewal date." },
    { ref: "§9 Fees", text: "Fees increase by 4% at each renewal unless otherwise agreed in writing." },
  ],
};

export const SAMPLE_PHOTO = {
  name: "whiteboard.jpg",
  lines: ["LAUNCH PLAN", "- beta invites go out Mon", "- fix onboarding bug (step 3)", "- call Sam re: pricing"],
  note: {
    id: "n1",
    title: "Launch plan (whiteboard)",
    body: "Beta invites go out Monday. Onboarding bug in step 3 must be fixed first. Pricing still open - Sam to confirm.",
    source: "Camera · whiteboard.jpg",
  } as DemoNote,
  tasks: [
    { id: "t4", title: "Fix onboarding bug (step 3)", due: "Mon", priority: "high", source: "Camera · whiteboard.jpg" },
    { id: "t5", title: "Call Sam about pricing", due: "Mon", priority: "medium", source: "Camera · whiteboard.jpg" },
  ] as DemoTask[],
};

export const DRAFT_REPLY = {
  to: "priya@northwind.example",
  subject: "Re: Contract renewal - need your sign-off by Thursday",
  body: "Hi Priya,\n\nThanks for the heads-up. I'll review clause 7 and send my sign-off along with the Q3 usage numbers by Thursday.\n\nBest,\nAlex",
};

export const PROMPTS = [
  { id: "due", label: "What's due this week?", tools: ["manage_tasks"] },
  { id: "clause", label: "What does clause 7 of the Northwind contract say?", tools: ["search_knowledge"] },
  { id: "reply", label: "Draft a reply to Priya confirming Thursday", tools: ["communicate"] },
] as const;

export type PromptId = (typeof PROMPTS)[number]["id"];
