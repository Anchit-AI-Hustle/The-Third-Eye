// Declarations for every tool the assistant can call.
//
// Pure data, deliberately separated from the handlers that implement it and the
// route that orchestrates both. Two reasons: the declarations are what an MCP
// bridge has to merge into, and a 2,186-line route with schemas, handlers,
// prompt assembly and streaming interleaved had no seam to add one at.
//
// Shape is Gemini's functionDeclarations. Anything added here must have a
// matching case in the tool dispatch, or the model will call something that
// does not exist.

import { STUDIO_TOOLS } from "@/lib/studioTools";

export const geminiTools = [
  {
    functionDeclarations: [
      // ─── PLATFORM TOOLS (consolidated from 61 → 31) ───────────────────────
      {
        name: "manage_tasks",
        description: "Unified task manager: create, update, search, delete tasks. action='create' to add a task, 'update' to modify status/priority/due_date, 'search' to list tasks, 'delete' to remove. All in one call.",
        parameters: {
          type: "OBJECT",
          properties: {
            action: { type: "STRING", enum: ["create", "update", "search", "delete"], description: "What to do with the task" },
            id: { type: "STRING", description: "Task ID (required for update/delete)" },
            title: { type: "STRING", description: "Task title (required for create, optional for update)" },
            priority: { type: "STRING", enum: ["low", "medium", "high", "urgent"], description: "Priority level" },
            status: { type: "STRING", enum: ["todo", "in_progress", "done", "cancelled"], description: "Task status (for update)" },
            assignee: { type: "STRING", description: "Person responsible" },
            agent: { type: "STRING", description: "Appointed AI agent profile id (jarvis|friday|edith|ultron|zeus|athena) — set when the user appoints an agent to the task, '' to un-appoint" },
            due_date: { type: "STRING", description: "Due date YYYY-MM-DD (infer from 'tomorrow', 'Friday', etc.)" },
            description: { type: "STRING", description: "Additional context or notes" },
            filter: { type: "STRING", enum: ["all", "open", "urgent", "overdue"], description: "Filter for search (default: open)" },
          },
          required: ["action"],
        },
      },
      {
        name: "manage_notes",
        description: "Unified notes manager: create, search, delete notes. action='create' to save a note, 'search' to find notes by keyword, 'delete' to remove by id.",
        parameters: {
          type: "OBJECT",
          properties: {
            action: { type: "STRING", enum: ["create", "search", "delete"], description: "What to do" },
            id: { type: "STRING", description: "Note ID (required for delete)" },
            title: { type: "STRING", description: "Note title or topic (required for create)" },
            content: { type: "STRING", description: "Note body content (required for create)" },
            query: { type: "STRING", description: "Search keyword (required for search)" },
          },
          required: ["action"],
        },
      },
      {
        name: "manage_goals",
        description: "Unified goals manager: create, update progress, delete goals. action='create' to set a new goal, 'update' to report progress, 'delete' to remove.",
        parameters: {
          type: "OBJECT",
          properties: {
            action: { type: "STRING", enum: ["create", "update", "delete"], description: "What to do" },
            id: { type: "STRING", description: "Goal ID (required for update/delete)" },
            title: { type: "STRING", description: "Goal title (required for create)" },
            category: { type: "STRING", description: "Category: Health, Finance, Learning, Career, Personal, etc." },
            target: { type: "NUMBER", description: "Numeric target to reach" },
            unit: { type: "STRING", description: "Unit: km, %, $, hours, books, etc." },
            current: { type: "NUMBER", description: "Current progress (defaults to 0)" },
            deadline: { type: "STRING", description: "Target date YYYY-MM-DD" },
            delta: { type: "NUMBER", description: "Amount to add to progress (for update)" },
            set_to: { type: "NUMBER", description: "Set progress to exact value (for update)" },
          },
          required: ["action"],
        },
      },
      {
        name: "manage_expenses",
        description: "Unified expense tracker: log spending, or summarise it. action='create' to log an expense (the amount is what was paid, GST-inclusive), 'summary' for this-month totals, category breakdown and GST paid. Use when the user says things like 'log 1200 groceries', 'I spent 450 on lunch with 5% GST', or 'how much did I spend this month'.",
        parameters: {
          type: "OBJECT",
          properties: {
            action: { type: "STRING", enum: ["create", "summary"], description: "What to do" },
            amount: { type: "NUMBER", description: "Amount paid (GST-inclusive), for create" },
            category: { type: "STRING", enum: ["Food", "Groceries", "Transport", "Shopping", "Bills", "Health", "Entertainment", "Travel", "Other"], description: "Expense category" },
            note: { type: "STRING", description: "Short note, e.g. 'lunch with team'" },
            gst_rate: { type: "NUMBER", enum: [0, 5, 12, 18, 28, 40], description: "GST % already included in the amount (0 if unknown/none)" },
            spent_on: { type: "STRING", description: "Date YYYY-MM-DD (defaults to today; infer from 'yesterday' etc.)" },
          },
          required: ["action"],
        },
      },
      {
        name: "calculate",
        description: "Run a precise financial calculation instead of estimating. Pick a calculator by slug and pass its inputs. Use for GST (gst-calculator: amount, rate, mode 0=add/1=remove), income tax (income-tax-calculator: grossIncome, regime 1=new/0=old, salaried 1/0, deductions), EMI (emi-calculator: principal, rate, years), SIP (sip-calculator: monthly, rate, years), FD, compound interest, and more. Always prefer this over doing the arithmetic yourself.",
        parameters: {
          type: "OBJECT",
          properties: {
            slug: { type: "STRING", description: "Calculator slug, e.g. 'gst-calculator', 'income-tax-calculator', 'emi-calculator', 'sip-calculator', 'fd-calculator', 'compound-interest-calculator'" },
            inputs: { type: "OBJECT", description: "Input values keyed by the calculator's input ids, e.g. { amount: 5000, rate: 18, mode: 0 }" },
          },
          required: ["slug", "inputs"],
        },
      },
      {
        name: "manage_reminders",
        description: "Unified reminder manager: set, list, cancel reminders. action='set' to schedule, 'list' to see pending, 'cancel' to remove.",
        parameters: {
          type: "OBJECT",
          properties: {
            action: { type: "STRING", enum: ["set", "list", "cancel"], description: "What to do" },
            id: { type: "STRING", description: "Reminder ID (required for cancel)" },
            title: { type: "STRING", description: "What to remind about (required for set)" },
            fire_at: { type: "STRING", description: "ISO-8601 timestamp (required for set)" },
            recurrence: { type: "STRING", enum: ["none", "daily", "weekly", "monthly"], description: "Repeat cadence (default: none)" },
          },
          required: ["action"],
        },
      },
      {
        name: "manage_calendar",
        description: "Unified calendar manager: add events and get upcoming events. action='add' to create an event, 'get' to retrieve upcoming events.",
        parameters: {
          type: "OBJECT",
          properties: {
            action: { type: "STRING", enum: ["add", "get"], description: "What to do" },
            title: { type: "STRING", description: "Event title (required for add)" },
            start: { type: "STRING", description: "Start time, compact UTC 'YYYYMMDDTHHMMSSZ'" },
            end: { type: "STRING", description: "End time, compact UTC 'YYYYMMDDTHHMMSSZ'" },
            details: { type: "STRING", description: "Event details" },
            location: { type: "STRING", description: "Event location" },
            days_ahead: { type: "NUMBER", description: "Days to look ahead (for get, default: 7)" },
            max_results: { type: "NUMBER", description: "Max events to return (for get, default: 10)" },
          },
          required: ["action"],
        },
      },
      {
        name: "communicate",
        description: "Unified communication hub: send WhatsApp, SMS, email, make calls, read emails. action='whatsapp'/'sms'/'email'/'call' to send, 'read_emails' to check inbox.",
        parameters: {
          type: "OBJECT",
          properties: {
            action: { type: "STRING", enum: ["whatsapp", "sms", "email", "call", "read_emails"], description: "Communication channel" },
            to: { type: "STRING", description: "Recipient (phone number or email)" },
            number: { type: "STRING", description: "Phone number (for sms/call)" },
            message: { type: "STRING", description: "Message text" },
            subject: { type: "STRING", description: "Email subject (for email)" },
            body: { type: "STRING", description: "Email body (for email)" },
            query: { type: "STRING", description: "Gmail search query (for read_emails, default: 'is:unread')" },
            max_results: { type: "NUMBER", description: "Max results (for read_emails, default: 5)" },
          },
          required: ["action"],
        },
      },
      {
        name: "navigate",
        description: "Unified navigation: get directions, find current location, discover nearby places. action='directions' for maps, 'location' for GPS coords, 'nearby' for POIs.",
        parameters: {
          type: "OBJECT",
          properties: {
            action: { type: "STRING", enum: ["directions", "location", "nearby"], description: "What to do" },
            destination: { type: "STRING", description: "Where to go (for directions)" },
            query: { type: "STRING", description: "What to find nearby (for nearby)" },
          },
          required: ["action"],
        },
      },
      {
        name: "generate",
        description: "Unified generation engine: images, QR codes, charts, invoices, resumes, screenshots, forms, data analysis, URLs, code, PDFs. type='image' for AI images, 'qr' for QR codes, 'chart' for data viz, 'invoice' for billing, 'resume' for CV, 'screenshot' for webpage capture, 'form' for surveys, 'analyze' for data insights, 'shorten_url' for URL shortening, 'code' for programming, 'pdf' for documents.",
        parameters: {
          type: "OBJECT",
          properties: {
            type: { type: "STRING", enum: ["image", "qr", "chart", "invoice", "resume", "screenshot", "form", "analyze", "shorten_url", "code", "pdf"], description: "What to generate" },
            prompt: { type: "STRING", description: "Description for image/QR generation" },
            style: { type: "STRING", enum: ["realistic", "artistic", "minimal", "cartoon", "photo"], description: "Visual style (for image)" },
            size: { type: "STRING", enum: ["square", "landscape", "portrait", "wide"], description: "Aspect ratio (for image)" },
            data: { type: "STRING", description: "Data to encode (QR), chart data (JSON/CSV), or content to analyze" },
            label: { type: "STRING", description: "Optional label (for QR)" },
            title: { type: "STRING", description: "Title for chart/invoice/form/pdf" },
            chart_type: { type: "STRING", enum: ["bar", "line", "pie", "comparison"], description: "Chart type" },
            client: { type: "STRING", description: "Client name (for invoice)" },
            items: { type: "STRING", description: "Line items (for invoice)" },
            tax_rate: { type: "STRING", description: "Tax rate (for invoice)" },
            notes: { type: "STRING", description: "Notes (for invoice)" },
            name: { type: "STRING", description: "Full name (for resume)" },
            role: { type: "STRING", description: "Target role (for resume)" },
            experience: { type: "STRING", description: "Work experience (for resume)" },
            skills: { type: "STRING", description: "Key skills (for resume)" },
            education: { type: "STRING", description: "Education details (for resume)" },
            url: { type: "STRING", description: "URL to capture (for screenshot)" },
            width: { type: "NUMBER", description: "Viewport width (for screenshot, default: 1280)" },
            fields: { type: "STRING", description: "Form fields definition (for form)" },
            purpose: { type: "STRING", description: "Form purpose (for form)" },
            question: { type: "STRING", description: "What to analyze (for analyze)" },
            task: { type: "STRING", enum: ["generate", "explain", "debug", "refactor", "review", "convert"], description: "Coding task (for code)" },
            language: { type: "STRING", description: "Programming language (for code)" },
            description: { type: "STRING", description: "What to generate or code to process (for code)" },
            context: { type: "STRING", description: "Additional context (for code)" },
            content: { type: "STRING", description: "Document content (for pdf)" },
            format: { type: "STRING", enum: ["report", "letter", "receipt", "certificate"], description: "Document format (for pdf)" },
          },
          required: ["type"],
        },
      },
      {
        name: "automate",
        description: "Unified automation: schedule recurring actions and run autonomous background checks. action='schedule' to set up automations, 'check' to scan for overdue tasks/deadlines/conflicts.",
        parameters: {
          type: "OBJECT",
          properties: {
            action: { type: "STRING", enum: ["schedule", "check"], description: "What to do" },
            name: { type: "STRING", description: "Automation name (for schedule)" },
            trigger: { type: "STRING", description: "Time of day to run (for schedule): 'morning' (08:00 UTC) or 'evening' (19:00 UTC). Omit to start one full interval from now." },
            automation_action: { type: "STRING", description: "What action to take (for schedule)" },
            schedule: { type: "STRING", enum: ["daily", "weekly", "monthly"], description: "How often it repeats (for schedule). Only these three run — there is no event-driven scheduler." },
            check_type: { type: "STRING", enum: ["overdue_tasks", "deadlines", "calendar", "habits", "all"], description: "What to check (for check, default: all)" },
          },
          required: ["action"],
        },
      },
      {
        name: "learn",
        description: "Unified intelligence: proactive suggestions, user insights, habit detection, pattern learning. action='suggest' for contextual suggestions, 'insights' for learned patterns, 'habits' for detected routines, 'record' to teach a new pattern.",
        parameters: {
          type: "OBJECT",
          properties: {
            action: { type: "STRING", enum: ["suggest", "insights", "habits", "record"], description: "What to do" },
            context: { type: "STRING", description: "What triggered the suggestion (for suggest)" },
            suggestion: { type: "STRING", description: "The suggestion to offer (for suggest)" },
            urgency: { type: "STRING", enum: ["low", "medium", "high"], description: "Time-sensitivity (for suggest)" },
            category: { type: "STRING", enum: ["all", "habits", "patterns", "preferences", "activity"], description: "Insight category (for insights)" },
            min_confidence: { type: "NUMBER", description: "Confidence threshold 0-1 (for habits, default: 0.5)" },
            kind: { type: "STRING", description: "Pattern category (for record)" },
            value: { type: "STRING", description: "Pattern value (for record)" },
            confidence: { type: "NUMBER", description: "Confidence 0-1 (for record, default: 0.8)" },
          },
          required: ["action"],
        },
      },

      // ─── INDIVIDUAL TOOLS (unique functionality) ──────────────────────────
      {
        name: "get_current_time",
        description: "Returns the current date and time.",
        parameters: {
          type: "OBJECT",
          properties: {
            timezone: { type: "STRING", description: "IANA timezone (e.g. 'America/New_York'). Defaults to UTC." },
          },
        },
      },
      {
        name: "remember",
        description: "Persist a key-value fact about the user. Use when user shares name, location, preferences, or any context worth recalling.",
        parameters: {
          type: "OBJECT",
          properties: {
            key: { type: "STRING", description: "Short identifier (e.g. 'name', 'city', 'work_hours')" },
            value: { type: "STRING" },
          },
          required: ["key", "value"],
        },
      },
      {
        name: "web_search",
        description: "Search the web for current events, news, prices, facts. Use proactively when uncertain or when info may have changed.",
        parameters: {
          type: "OBJECT",
          properties: {
            query: { type: "STRING", description: "Specific, focused search query" },
          },
          required: ["query"],
        },
      },
      {
        name: "open_app",
        description:
          "Open an app, a page inside JARVIS, or a website. Prefers the user's own apps: 'open my tasks', " +
          "'take me to Kolab', 'open the Music Studio' navigate inside JARVIS to Tasks, Notes, Goals, Knowledge, " +
          "Finance, Job Agent, Kolab, Lifelog and every Studio tool. Anything else opens the real service — " +
          "'open YouTube', 'play lo-fi on Spotify', 'open gmail.com'.",
        parameters: {
          type: "OBJECT",
          properties: {
            target: { type: "STRING", description: "App name, domain, or full URL" },
            query: { type: "STRING", description: "Optional: what to search within the app" },
          },
          required: ["target"],
        },
      },
      {
        name: "pay",
        description: "Send money via UPI. Opens payment app PRE-FILLED with payee+amount; user approves. Requires vpa and amount — never guess.",
        parameters: {
          type: "OBJECT",
          properties: {
            vpa: { type: "STRING", description: "Payee UPI id / VPA" },
            amount: { type: "NUMBER", description: "Amount to pay" },
            name: { type: "STRING", description: "Payee display name (optional)" },
            note: { type: "STRING", description: "Payment note (optional)" },
            currency: { type: "STRING", description: "Currency code, defaults to INR" },
          },
          required: ["vpa", "amount"],
        },
      },
      {
        name: "get_weather",
        description: "Get current weather conditions and forecast for any location.",
        parameters: {
          type: "OBJECT",
          properties: {
            location: { type: "STRING", description: "City name, city+country, or coordinates" },
          },
          required: ["location"],
        },
      },
      {
        name: "search_knowledge",
        description: "Search the user's uploaded knowledge base documents.",
        parameters: {
          type: "OBJECT",
          properties: {
            query: { type: "STRING", description: "The search query" },
          },
          required: ["query"],
        },
      },
      {
        name: "get_news",
        description: "Latest news headlines. Pass a topic or omit for top news.",
        parameters: {
          type: "OBJECT",
          properties: {
            query: { type: "STRING", description: "Topic, or omit for top headlines" },
          },
        },
      },
      {
        name: "translate",
        description: "Translate text between languages.",
        parameters: {
          type: "OBJECT",
          properties: {
            text: { type: "STRING", description: "Text to translate" },
            target_language: { type: "STRING", description: "Target language ('Spanish', 'Hindi', 'Japanese')" },
            source_language: { type: "STRING", description: "Source language (auto-detect if omitted)" },
          },
          required: ["text", "target_language"],
        },
      },
      {
        name: "stock_quote",
        description: "Latest price for a stock or crypto ticker (AAPL, TSLA, BTC-USD).",
        parameters: {
          type: "OBJECT",
          properties: {
            symbol: { type: "STRING", description: "Ticker symbol" },
          },
          required: ["symbol"],
        },
      },
      {
        name: "multi_agent_run",
        description: "ULTRON-mode parallel reasoning: spin N sub-agents on distinct angles of a hard question, then synthesise. Use for strategy, pros/cons/risks.",
        parameters: {
          type: "OBJECT",
          properties: {
            question: { type: "STRING", description: "The question or problem" },
            angles: {
              type: "ARRAY",
              items: { type: "STRING" },
              description: "3-5 distinct angles ('financial', 'technical risk', 'competitive moat')",
            },
          },
          required: ["question", "angles"],
        },
      },
      {
        name: "create_asset",
        description: `Generate anything Studio can build, without the user opening Studio: ${STUDIO_TOOLS.map((t) => `${t.id} (${t.label})`).join(", ")}.`,
        parameters: {
          type: "OBJECT",
          properties: {
            // Derived from the Studio registry rather than hand-listed. The
            // hand-written version had drifted to 18 of 28 tools, so ten of
            // them could be opened but never run.
            kind: { type: "STRING", enum: STUDIO_TOOLS.map((t) => t.id), description: "Asset type" },
            title: { type: "STRING", description: "Short name/subject for the asset" },
            brief: { type: "STRING", description: "The full brief with all details" },
          },
          required: ["kind", "brief"],
        },
      },
      {
        name: "deep_research",
        description: "Multi-step research: search web, read sources, synthesize findings, deliver comprehensive report with citations. Use for competitive analysis, market research, tech comparisons.",
        parameters: {
          type: "OBJECT",
          properties: {
            topic: { type: "STRING", description: "The research question or topic" },
            depth: { type: "STRING", enum: ["quick", "standard", "thorough"], description: "How deep to go" },
            format: { type: "STRING", enum: ["report", "brief", "comparison", "timeline"], description: "Output structure" },
          },
          required: ["topic"],
        },
      },
      {
        name: "play_music",
        description: "Open music on Spotify, YouTube Music, Apple Music, or JioSaavn with search ready.",
        parameters: {
          type: "OBJECT",
          properties: {
            query: { type: "STRING", description: "Song, artist, album, or playlist" },
            service: { type: "STRING", enum: ["spotify", "youtube-music", "apple-music", "jiosaavn", "gaana"], description: "Music service (default: spotify)" },
            mood: { type: "STRING", description: "Optional mood filter ('relaxing', 'upbeat', 'focus')" },
          },
          required: ["query"],
        },
      },
      {
        name: "initiate_protocol",
        description: "Activate a named protocol — pre-defined routine. 'HOME' (lights off, alarm), 'WORK' (Slack, calendar, email), 'SOS' (emergency call, share location).",
        parameters: {
          type: "OBJECT",
          properties: {
            protocol: { type: "STRING", description: "Protocol name ('HOME', 'WORK', 'SOS', 'SLEEP', 'WAKE', 'TRAVEL')" },
            context: { type: "STRING", description: "Additional context or overrides" },
          },
          required: ["protocol"],
        },
      },
      {
        name: "get_health_data",
        description: "Check health data (steps, heart rate, sleep, workouts, calories). Reports connection status until Apple Health/Google Fit integration is built.",
        parameters: {
          type: "OBJECT",
          properties: {
            metric: { type: "STRING", enum: ["steps", "heart_rate", "sleep", "workouts", "calories", "weight", "summary"], description: "What to retrieve" },
            period: { type: "STRING", enum: ["today", "week", "month", "year"], description: "Time period (default: today)" },
          },
        },
      },
      {
        name: "control_device",
        description: "Smart home control (lights, thermostat, locks). Reports connection status until Matter/HomeKit integration is built.",
        parameters: {
          type: "OBJECT",
          properties: {
            action: { type: "STRING", enum: ["on", "off", "toggle", "dim", "lock", "unlock", "set_temperature"], description: "Action to perform" },
            device: { type: "STRING", description: "Device name or type" },
            value: { type: "STRING", description: "Value for dim/temperature" },
          },
          required: ["action", "device"],
        },
      },
      {
        name: "weekly_report",
        description: "Generate comprehensive weekly summary: tasks completed, goals progress, calendar highlights, health metrics.",
        parameters: {
          type: "OBJECT",
          properties: {
            period: { type: "STRING", enum: ["this_week", "last_week", "custom"], description: "Which period" },
            focus: { type: "STRING", description: "Optional focus areas ('productivity', 'health', 'finance')" },
          },
        },
      },
      {
        name: "emergency_alert",
        description: "Open emergency channels — dialer for 112 and WhatsApp for contacts. ONLY for genuine emergencies. User must confirm each action.",
        parameters: {
          type: "OBJECT",
          properties: {
            message: { type: "STRING", description: "Emergency message" },
            contacts: { type: "ARRAY", items: { type: "STRING" }, description: "Phone numbers to alert" },
          },
        },
      },
      {
        name: "book_reservation",
        description: "Search and open booking pages for restaurants, hotels, flights, events. Opens relevant service with search results ready.",
        parameters: {
          type: "OBJECT",
          properties: {
            type: { type: "STRING", enum: ["restaurant", "hotel", "flight", "event", "movie"], description: "What to book" },
            query: { type: "STRING", description: "Search criteria" },
            date: { type: "STRING", description: "Preferred date (optional)" },
            guests: { type: "NUMBER", description: "Number of guests (optional)" },
          },
          required: ["type", "query"],
        },
      },
      {
        name: "smart_summary",
        description: "Intelligent summary of text or URL. Choose depth: tl;dr, brief, or detailed.",
        parameters: {
          type: "OBJECT",
          properties: {
            source: { type: "STRING", description: "URL or text content to summarize" },
            depth: { type: "STRING", enum: ["tl;dr", "brief", "detailed"], description: "Level of detail" },
            focus: { type: "STRING", description: "Optional focus area" },
          },
          required: ["source"],
        },
      },
    ],
  },
] as any;
