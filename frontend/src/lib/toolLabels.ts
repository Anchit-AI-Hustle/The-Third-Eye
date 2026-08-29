// Human-readable, present-tense labels for tool-call SSE events, so the chat
// and voice UIs can show what the agent is doing right now instead of a raw
// function name like "manage_tasks". Purely presentational — never consulted
// for anything security- or execution-relevant (see lib/actions.ts for that).

const ACTION_LABELS: Record<string, Record<string, string>> = {
  manage_tasks: { create: "Adding a task", update: "Updating a task", delete: "Deleting a task", search: "Checking your tasks" },
  manage_notes: { create: "Saving a note", delete: "Deleting a note", search: "Searching your notes" },
  manage_goals: { create: "Setting a goal", update: "Updating your goal", delete: "Deleting a goal" },
  manage_reminders: { set: "Setting a reminder", cancel: "Canceling a reminder", list: "Checking your reminders" },
  manage_calendar: { add: "Adding a calendar event", get: "Checking your calendar" },
  manage_expenses: { create: "Logging an expense", summary: "Checking your expenses" },
  communicate: { whatsapp: "Opening WhatsApp", sms: "Opening messages", call: "Opening the dialer", read_emails: "Checking Gmail", email: "Sending an email" },
  navigate: { directions: "Getting directions", location: "Checking your location", nearby: "Finding nearby places" },
  generate: {
    image: "Generating an image", qr: "Generating a QR code", chart: "Building a chart",
    invoice: "Building an invoice", resume: "Building a resume", screenshot: "Capturing a screenshot",
    form: "Building a form", analyze: "Analyzing the data", code: "Writing code",
    pdf: "Generating a PDF", shorten_url: "Shortening the link",
  },
  automate: { schedule: "Setting up automation", check: "Scanning for issues" },
  learn: { suggest: "Preparing a suggestion", insights: "Gathering insights", habits: "Checking your habits", record: "Learning a pattern" },
};

const BASE_LABELS: Record<string, string> = {
  calculate: "Running the numbers",
  get_current_time: "Checking the time",
  remember: "Remembering that",
  web_search: "Searching the web",
  open_app: "Opening the app",
  pay: "Setting up the payment",
  get_weather: "Checking the weather",
  search_knowledge: "Searching your documents",
  get_news: "Getting the news",
  translate: "Translating",
  stock_quote: "Checking the stock price",
  multi_agent_run: "Running parallel analysis",
  create_asset: "Creating that asset",
  deep_research: "Researching",
  play_music: "Queuing up music",
  initiate_protocol: "Activating the protocol",
  get_health_data: "Checking your health data",
  control_device: "Controlling the device",
  weekly_report: "Building your weekly report",
  emergency_alert: "Sending an emergency alert",
  book_reservation: "Finding a reservation",
  smart_summary: "Summarizing",
};

/** Present-tense label for a tool-call SSE event, e.g. { name: "manage_tasks", input: { action: "search" } } → "Checking your tasks". */
export function toolLabel(name: string, input?: Record<string, any>): string {
  const action = input?.action ?? input?.type;
  const refined = action ? ACTION_LABELS[name]?.[action] : undefined;
  if (refined) return refined;
  if (BASE_LABELS[name]) return BASE_LABELS[name];
  if (name.startsWith("mcp__")) {
    const short = name.split("__").pop() ?? name;
    return `Using ${short.replace(/_/g, " ")}`;
  }
  return `Running ${name.replace(/_/g, " ")}`;
}
