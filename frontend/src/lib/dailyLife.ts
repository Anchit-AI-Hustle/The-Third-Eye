// Everyday activities the assistant should recognise, for everyone in a
// household: adults, women's and men's health, parents and kids, elders, pets,
// and the home. Each one names how it is carried out with the tools that exist
// (log it, schedule it, open the right app with the search filled in...), the
// steps to give the user, and the rest or recovery that goes with it.
//
// The model still makes the call. The runtime matches the message against this
// catalog and puts the matching entries in the prompt, so "walk the dog" becomes
// a log_activity call plus a daily reminder rather than whatever the model
// improvises that turn.

import { localDay, validZone } from "@/lib/localDay";

export type Who = "everyone" | "women" | "men" | "parents" | "kids" | "elders" | "pets" | "home";

export const LOG_KINDS = [
  "water", "steps", "workout", "sleep", "nap", "meditation", "meal", "weight", "mood",
  "medicine", "symptom", "period", "bp", "sugar",
  "baby_feed", "diaper", "baby_sleep",
  "pet_feed", "pet_walk", "pet_meds",
  "chore",
] as const;
export type LogKind = (typeof LOG_KINDS)[number];

const UNITS: Partial<Record<LogKind, string>> = {
  water: "ml", steps: "steps", workout: "min", sleep: "h", nap: "min", meditation: "min",
  weight: "kg", baby_feed: "ml", baby_sleep: "min", pet_walk: "min", bp: "mmHg", sugar: "mg/dL",
};

/** One way of carrying an activity out: a tool that exists, with the arguments to give it. */
export type Run = { tool: string; args: Record<string, unknown>; when: string };

export type Activity = {
  id: string;
  label: string;
  who: Who[];
  match: RegExp;
  run: Run[];
  steps: string[];
  rest?: string;
};

const log = (kind: LogKind, when = "after it is done, to track it"): Run => ({
  tool: "log_activity", args: { action: "log", kind, unit: UNITS[kind] }, when,
});
const FIRST = "<ISO-8601 first time, with their UTC offset>";
const daily = (title: string, when = "to make it a daily habit"): Run => ({
  tool: "manage_reminders", args: { action: "set", title, fire_at: FIRST, recurrence: "daily" }, when,
});
const repeat = (title: string, recurrence: "weekly" | "monthly", when: string): Run => ({
  tool: "manage_reminders", args: { action: "set", title, fire_at: FIRST, recurrence }, when,
});
const app = (app: string, when: string, query = "<what they asked for>"): Run => ({
  tool: "open_app", args: { target: app, query }, when,
});
const calendar = (when = "for a dated appointment"): Run => ({
  tool: "manage_calendar", args: { action: "add", title: "<what>", start: "<YYYYMMDDTHHMMSSZ>", end: "<YYYYMMDDTHHMMSSZ>" }, when,
});
const nearby = (query: string): Run => ({ tool: "navigate", args: { action: "nearby", query }, when: "to find one close by" });
const task = (when = "as a one-off to-do"): Run => ({ tool: "manage_tasks", args: { action: "create", title: "<what>" }, when });
const summary = (kind: LogKind): Run => ({ tool: "log_activity", args: { action: "summary", kind }, when: "when they ask how they are doing" });

export const ACTIVITIES: Activity[] = [
  // ── Everyone: body and rest ────────────────────────────────────────────────
  {
    id: "wake", label: "Wake up / morning routine", who: ["everyone"],
    match: /\b(wake me|wake up|set (an |my )?alarm|morning routine)\b/i,
    run: [daily("Wake up", "for the alarm, at the time they give"), { tool: "initiate_protocol", args: { protocol: "WAKE" }, when: "to start the morning routine now" }],
    steps: ["Same wake time every day, weekends included", "Water and daylight in the first 30 minutes", "Look at the day's plan before messages"],
    rest: "Count back 7-9 hours from the alarm to set a bedtime.",
  },
  {
    id: "sleep", label: "Sleep / bedtime", who: ["everyone"],
    match: /\b(go(ing)? to (bed|sleep)|bed ?time|i slept|slept \d|hours? of sleep|my sleep|insomnia|can'?t sleep)\b/i,
    run: [log("sleep", "with the hours slept"), { tool: "initiate_protocol", args: { protocol: "SLEEP" }, when: "when they are going to bed now" }, daily("Wind down for bed", "for a nightly wind-down reminder")],
    steps: ["Screens off 30-60 minutes before bed", "Dark, cool room", "Same bedtime each night"],
    rest: "Adults need 7-9 hours; teenagers 8-10; children 9-12.",
  },
  {
    id: "nap", label: "Nap / power nap", who: ["everyone"],
    match: /\b(take a nap|power nap|napping|nap for)\b/i,
    run: [{ tool: "manage_reminders", args: { action: "set", title: "Wake up from nap", fire_at: FIRST }, when: "as a one-off alarm 20-30 minutes ahead" }, log("nap")],
    steps: ["Set the alarm before lying down", "Keep it before mid-afternoon"],
    rest: "20-30 minutes refreshes without grogginess; longer naps can cost night sleep.",
  },
  {
    id: "water", label: "Drink water", who: ["everyone"],
    match: /\b(drink(ing)? (more )?water|drank( a)? (glass|bottle|\d)|water intake|stay hydrated|hydration (goal|reminder)|glass(es)? of water|\d+ ?ml of water|litres? of water)\b/i,
    run: [log("water", "with the amount in ml (one glass is about 250 ml)"), daily("Drink a glass of water", "for reminders through the day, one per time they choose"), summary("water")],
    steps: ["Glass on waking", "One with each meal", "Refill a bottle at midday"],
    rest: "Around 2-3 litres a day for most adults; more in heat or exercise.",
  },
  {
    id: "walk", label: "Walk / daily steps", who: ["everyone"],
    match: /(\b\d[\d,]*\s*steps\b|\bstep count\b|\bmy steps\b|\bsteps today\b|\b(went|go|going) for a walk\b|\b(morning|evening) walk\b)/i,
    run: [log("steps", "with the step count"), summary("steps"), { tool: "get_health_data", args: { metric: "steps" }, when: "to read back logged and wearable steps" }],
    steps: ["Short walk after each meal", "Take calls on foot", "Stairs instead of the lift"],
    rest: "7,000-10,000 steps a day is a common target; build up gradually.",
  },
  {
    id: "workout", label: "Workout / gym / run", who: ["everyone"],
    match: /\b(work ?out|gym|exercis(e|ed|ing)|(go(ing)?|went) for a (run|swim|ride)|i ran \d|morning run|jog(ged|ging)?|went cycling|weight ?lifting|cardio|hiit)\b/i,
    run: [log("workout", "with minutes and the type in the note"), { tool: "play_music", args: { query: "workout playlist" }, when: "for music during it" }, repeat("Workout", "weekly", "for a set weekly session on chosen days")],
    steps: ["5-10 minute warm-up", "Main set", "Cool-down and stretch", "Log it"],
    rest: "Rest 48 hours before training the same muscles hard again, and take at least one full rest day a week.",
  },
  {
    id: "yoga", label: "Yoga / stretching / meditation", who: ["everyone"],
    match: /\b(yoga|stretching|meditat\w*|breathing exercises?|breathwork|pranayam\w*)\b/i,
    run: [log("meditation", "with the minutes"), daily("Yoga / meditation"), { tool: "open_app", args: { target: "youtube", query: "guided session" }, when: "for a guided session" }],
    steps: ["Same time and place daily", "Start with 10 minutes", "Breathe slowly through the nose"],
    rest: "Gentle practice is fine daily; skip strong inversions when unwell.",
  },
  {
    id: "meal", label: "Meals / what I ate / recipe", who: ["everyone"],
    match: /\b(breakfast|dinner|snack|i ate|i had \w+ for (breakfast|lunch|dinner)|what (did|should) i eat|calories|recipe|cook (dinner|lunch|breakfast|something)|meal (plan|prep)|lunch(?! (meeting|with)))\b/i,
    run: [log("meal", "with what they ate in the note"), { tool: "web_search", args: { query: "<dish> recipe" }, when: "for a recipe" }, app("swiggy", "to order in instead")],
    steps: ["Half the plate vegetables", "Protein with every meal", "Eat slowly, stop at comfortably full"],
  },
  {
    id: "groceries", label: "Groceries", who: ["everyone", "home"],
    match: /\b(grocer\w*|vegetables|milk|eggs|bread|atta|blinkit|zepto|bigbasket|instamart)\b/i,
    run: [app("zepto", "for delivery in minutes (or instamart; blinkit opens without the search)", "<items>"), app("bigbasket", "for a planned weekly shop", "<items>"), { tool: "manage_notes", args: { action: "create", title: "Grocery list", content: "<items>" }, when: "to keep a list" }],
    steps: ["Check what is already at home", "List by aisle", "Order once, not several times"],
  },
  {
    id: "medicine", label: "Take medicine", who: ["everyone", "elders"],
    match: /\b(medicines?|medications?|meds|my (tablets?|pills?)|(take|took|taking) (a |my |the )?(\w+ ){0,2}(tablets?|pills?)|(next|missed) dose|inhaler|insulin|vitamins?)\b/i,
    run: [daily("Take <medicine> <dose>", "one reminder per dose time"), log("medicine", "after each dose, with the name in the note"), app("1mg", "to reorder", "<medicine>")],
    steps: ["Same time each day, tied to a meal if the label says so", "Never double up a missed dose without checking the leaflet or a pharmacist"],
  },
  {
    id: "health_numbers", label: "Weight, blood pressure, sugar", who: ["everyone", "elders"],
    match: /\b(my weight|i weigh|weighed (myself|in)|weight (is|was|today)|blood pressure|my bp|bp reading|blood sugar|sugar (level|reading)|glucose|my bmi)\b/i,
    run: [log("weight", "for weight in kg"), log("bp", "for blood pressure as systolic/diastolic in the note"), log("sugar", "for blood sugar in mg/dL"), repeat("Check BP", "weekly", "for a regular check")],
    steps: ["Measure at the same time of day", "Sit quietly 5 minutes before a BP reading"],
  },
  {
    id: "mood", label: "Mood / journal", who: ["everyone"],
    match: /\b(my mood|feeling (low|down|anxious|stressed|sad|great|good)|journal entry|gratitude)\b/i,
    run: [log("mood", "with a 1-5 score and a word in the note"), { tool: "manage_notes", args: { action: "create", title: "Journal", content: "<entry>" }, when: "for a longer journal entry" }],
    steps: ["Name the feeling", "One thing that went well", "One small next step"],
    rest: "If low mood lasts two weeks or more, talk to a doctor or someone you trust.",
  },
  {
    id: "break", label: "Breaks and screen rest", who: ["everyone"],
    match: /\b(take a break|screen time|eye strain|stand up and stretch|sitting too long)\b/i,
    run: [daily("Stand up and stretch", "for regular break reminders")],
    steps: ["Every 20 minutes look 20 feet away for 20 seconds", "Stand and move for 2-3 minutes each hour"],
    rest: "A 5-10 minute break every hour keeps focus up.",
  },
  {
    id: "doctor", label: "Doctor or dentist appointment", who: ["everyone"],
    match: /\b(doctor|dentist|clinic|(health|medical|annual|full body) check ?-?up|hospital)\b/i,
    run: [calendar(), nearby("clinic"), app("practo", "to book online")],
    steps: ["Note symptoms and questions beforehand", "Carry reports and the medicine list"],
  },
  {
    id: "ride", label: "Cab / commute", who: ["everyone"],
    match: /\b(cab|taxi|uber|ola|rapido|auto ?rickshaw|book an auto|ride to|commute|book a ride)\b/i,
    run: [{ tool: "book_ride", args: { destination: "<destination>" }, when: "for a cab or bike taxi; service only when they named one" }, { tool: "navigate", args: { action: "directions" }, when: "for directions or public transport" }],
    steps: ["Confirm pickup and drop", "Share the trip with family for late rides"],
  },
  {
    id: "bills", label: "Bills and recharges", who: ["everyone", "home"],
    match: /\b((electricity|water|gas|phone|mobile|broadband|wifi|credit card) bill|pay (the |my )?bills?|bill payment|recharge|dth|emi)\b/i,
    run: [repeat("Pay <bill>", "monthly", "a few days before the due date"), app("cred", "to pay card and utility bills (or phonepe / paytm)"), { tool: "manage_expenses", args: { action: "create", category: "Bills" }, when: "after paying, to log it" }],
    steps: ["Check the amount on the bill", "Pay before the due date", "Log it"],
  },
  {
    id: "rent", label: "Pay rent / send money", who: ["everyone"],
    match: /\b(rent|pay (my )?(landlord|maid|cook|driver)|salary to)\b/i,
    run: [{ tool: "pay", args: { vpa: "<their UPI ID>", amount: "<amount>" }, when: "to pay now (opens the UPI app; the user approves)" }, repeat("Pay rent", "monthly", "for a monthly reminder")],
    steps: ["Confirm the UPI ID", "Pay", "Keep the receipt"],
  },
  {
    id: "family_call", label: "Call or message family", who: ["everyone", "elders"],
    match: /\b(call|message|whatsapp|check on) (my )?(mom|mum|mother|dad|father|parents|grandma|grandpa|nani|dadi|wife|husband|family)\b/i,
    run: [{ tool: "communicate", args: { action: "call" }, when: "to call now (or whatsapp)" }, repeat("Call <person>", "weekly", "to keep a regular check-in")],
    steps: ["Pick a regular day", "Ask about health and medicines for older parents"],
  },
  {
    id: "birthday", label: "Birthdays and gifts", who: ["everyone"],
    match: /\b(birthday|anniversary|buy a gift|gift for)\b/i,
    run: [calendar("with yearly repeat in the description"), { tool: "shopping", args: { action: "search", query: "<gift idea>" }, when: "to find a gift" }],
    steps: ["Reminder a week before to order a gift", "Message on the day"],
  },

  // ── Women ─────────────────────────────────────────────────────────────────
  {
    id: "period", label: "Period / cycle tracking", who: ["women"],
    match: /\b(my period|periods? (is|are) late|period (came|started|ended|tracker|tracking|pain|cramps)|next period|menstrua\w*|my cycle|cycle track\w*|pms|ovulat\w*)\b/i,
    run: [log("period", "note 'start' on day one and 'end' on the last day; flow or symptoms in the note"), summary("period")],
    steps: ["Log the first day of each period", "Note flow and symptoms", "The summary predicts the next start from past cycles"],
    rest: "Rest, heat and gentle movement help cramps; see a doctor for very heavy bleeding or severe pain.",
  },
  {
    id: "pregnancy", label: "Pregnancy care", who: ["women"],
    match: /\b(pregnan\w*|prenatal|antenatal|folic acid|trimester)\b/i,
    run: [daily("Take prenatal vitamin"), calendar("for each check-up and scan"), log("symptom", "for symptoms or kicks in the note")],
    steps: ["Daily prenatal vitamin as prescribed", "Keep every scheduled check-up", "Ask the doctor before any new medicine"],
    rest: "Rest when tired; follow the doctor's guidance on activity.",
  },
  {
    id: "breast_check", label: "Breast self-exam", who: ["women"],
    match: /\b(breast (self[- ]?)?exam|breast check)\b/i,
    run: [repeat("Breast self-exam", "monthly", "a few days after the period ends")],
    steps: ["Same time each month", "See a doctor about any new lump or change"],
  },

  // ── Men ───────────────────────────────────────────────────────────────────
  {
    id: "mens_health", label: "Men's health checks", who: ["men"],
    match: /\b(testicular|prostate|men'?s health|cholesterol)\b/i,
    run: [repeat("Testicular self-exam", "monthly", "for the monthly self-check"), calendar("for a yearly check-up: BP, cholesterol, sugar")],
    steps: ["Monthly self-check after a warm shower", "Yearly check-up from 30; prostate discussion from 50"],
  },
  {
    id: "grooming", label: "Haircut / grooming / salon", who: ["men", "women"],
    match: /\b(haircut|barber|salon|beard trim|waxing|facial|manicure|pedicure)\b/i,
    run: [app("urban company", "to book at home"), nearby("salon")],
    steps: ["Book ahead for weekends"],
  },

  // ── Parents and kids ──────────────────────────────────────────────────────
  {
    id: "school", label: "School drop-off / pickup", who: ["parents", "kids"],
    match: /\b(school (run|pickup|pick up|drop)|pick up (the )?(kids?|son|daughter)|drop (the )?(kids?|son|daughter))\b/i,
    run: [daily("School pickup", "on school days at the pickup time"), calendar("for a one-off change")],
    steps: ["Leave 10 minutes early", "Agree a backup person for pickups"],
  },
  {
    id: "homework", label: "Homework / exams / PTM", who: ["parents", "kids"],
    match: /\b(homework|exams?|ptm|parent.?teacher|school project|school fees)\b/i,
    run: [task("with the due date"), calendar("for exams and parent-teacher meetings")],
    steps: ["Same homework time daily", "Break projects into small steps"],
    rest: "Short breaks every 25-30 minutes help children focus.",
  },
  {
    id: "lunchbox", label: "Kids' lunchbox / tiffin", who: ["parents", "kids"],
    match: /\b(lunch ?box|tiffin)\b/i,
    run: [daily("Pack lunchbox", "the night before or morning"), { tool: "web_search", args: { query: "healthy tiffin ideas for kids" }, when: "for ideas" }],
    steps: ["Prep the night before", "A fruit, a protein, a grain"],
  },
  {
    id: "baby", label: "Baby feeds, diapers, sleep", who: ["parents", "kids"],
    match: /\b(baby|infant|newborn|diaper|nappy|breastfe\w*|formula feed\w*)\b/i,
    run: [log("baby_feed", "with ml or minutes"), log("diaper", "with wet/dirty in the note"), log("baby_sleep", "with minutes")],
    steps: ["Log each feed and diaper", "Watch for 6+ wet diapers a day in newborns"],
    rest: "Sleep when the baby sleeps; share night feeds where you can.",
  },
  {
    id: "vaccination", label: "Vaccinations", who: ["parents", "kids", "pets"],
    match: /\b(vaccin\w*|immuni[sz]\w*|booster dose)\b/i,
    run: [calendar("for each due date"), repeat("Check vaccination schedule", "monthly", "to stay ahead of the schedule")],
    steps: ["Keep the vaccination card handy", "Note side effects for 48 hours"],
  },
  {
    id: "kids_activity", label: "Kids' classes and playtime", who: ["kids", "parents"],
    match: /\b(tuition|coaching|swimming class|dance class|music class|playdate|play ?time)\b/i,
    run: [repeat("<class>", "weekly", "for a weekly class"), calendar()],
    steps: ["Keep one weekday free", "Pack the bag the night before"],
    rest: "Children need free unstructured play every day.",
  },

  // ── Elders ────────────────────────────────────────────────────────────────
  {
    id: "elder_care", label: "Elder care check-ins", who: ["elders"],
    match: /\b(elderly|ageing parents?|aging parents?|old (mother|father|parents)|caregiver|grand(mother|father|ma|pa))\b/i,
    run: [repeat("Check in with <person>", "weekly", "for a regular call"), daily("<person>'s medicine", "for their medicine times"), { tool: "emergency_alert", args: {}, when: "only in a real emergency" }],
    steps: ["Keep a list of their medicines and doctors", "Check the home for trip hazards"],
  },

  // ── Pets ──────────────────────────────────────────────────────────────────
  {
    id: "pet_feed", label: "Feed the pet", who: ["pets"],
    match: /\b((feed|fed|feeding) (the |my )?(dog|cat|puppy|kitten|pet|fish|bird)|pet food|dog food|cat food)\b/i,
    run: [log("pet_feed", "with the pet's name as subject"), daily("Feed <pet>", "one reminder per meal time"), app("supertails", "to reorder food", "<food>")],
    steps: ["Same times each day", "Measure portions", "Fresh water always"],
  },
  {
    id: "pet_walk", label: "Walk the dog", who: ["pets"],
    match: /\b(walk(ed|ing)? (the |my )?(dog|puppy)|dog walk)\b/i,
    run: [log("pet_walk", "with minutes and the dog's name as subject"), daily("Walk <dog>")],
    steps: ["Morning and evening walks", "Carry water and bags"],
    rest: "Avoid hot midday pavements; puppies need short walks with rest.",
  },
  {
    id: "vet", label: "Vet visit / pet health", who: ["pets"],
    match: /\b(the vet|a vet|vet (clinic|appointment|visit)|veterinar\w*|deworm\w*|fleas?|tick treatment|pet (is )?sick|pet meds)\b/i,
    run: [nearby("veterinary clinic"), calendar("for the vet visit"), log("pet_meds", "for doses given"), repeat("Deworm / flea treatment for <pet>", "monthly", "for regular treatment")],
    steps: ["Keep the pet's vaccination record", "Note appetite, energy and stool changes"],
  },
  {
    id: "pet_grooming", label: "Pet grooming and litter", who: ["pets"],
    match: /\b(groom(ing)? (the |my )?(dog|cat|pet)|bath (the |my )?(dog|cat)|litter (box|tray))\b/i,
    run: [daily("Clean the litter box", "for the litter box"), nearby("pet grooming"), app("supertails", "for supplies", "<item>")],
    steps: ["Brush weekly", "Trim nails monthly"],
  },

  // ── Home ──────────────────────────────────────────────────────────────────
  {
    id: "chores", label: "Laundry, cleaning, dishes", who: ["home"],
    match: /\b(laundry|wash(ing)? (the )?clothes|clean(ing)? (the )?(house|room|kitchen|bathroom)|do the dishes|household chores|ironing|take out the (trash|bins?|garbage))\b/i,
    run: [repeat("<chore>", "weekly", "for a weekly chore"), task("for a one-off"), log("chore", "when done, with the chore in the note"), app("urban company", "to book cleaning help")],
    steps: ["Split chores across the household", "One small chore a day beats a weekend pile-up"],
  },
  {
    id: "repairs", label: "Home repairs and services", who: ["home"],
    match: /\b(plumber|electrician|carpenter|ac (service|repair)|pest control|(tap|pipe|roof|ceiling|water) (is )?leak\w*)\b/i,
    run: [app("urban company", "to book a professional"), task("to track it until fixed")],
    steps: ["Describe the problem with a photo", "Get the price before work starts"],
  },
  {
    id: "plants", label: "Water the plants", who: ["home"],
    match: /\b(water (the )?plants|gardening|garden)\b/i,
    run: [daily("Water the plants", "morning or evening")],
    steps: ["Water early or late, not midday", "Check soil before watering"],
  },
  {
    id: "home_mode", label: "Leaving or arriving home", who: ["home"],
    match: /\b(leaving (home|the house)|i'?m home|back home|lock (the )?door|lights off)\b/i,
    run: [{ tool: "initiate_protocol", args: { protocol: "HOME" }, when: "on arriving home" }, { tool: "control_device", args: { action: "lock", device: "front door" }, when: "when leaving: lock up and switch things off" }],
    steps: ["Check stove, taps and doors before leaving"],
  },
];

const AUDIENCE: Record<Who, string> = {
  everyone: "everyone", women: "women", men: "men", parents: "parents", kids: "kids", elders: "elders", pets: "pets", home: "home",
};

/**
 * Catalog entries the message is about, in the order they were asked, at most
 * `limit`. A match inside a longer one is dropped: "swimming class" is a kids'
 * class, not a workout.
 */
export function matchActivities(text: string, limit = 3): Activity[] {
  const t = text || "";
  const hits = ACTIVITIES.flatMap((a) => {
    const m = a.match.exec(t);
    return m ? [{ a, start: m.index, end: m.index + m[0].length }] : [];
  });
  return hits
    .filter((h) => !hits.some((o) => o !== h && o.start <= h.start && o.end >= h.end && o.end - o.start > h.end - h.start))
    .sort((x, y) => x.start - y.start || (y.end - y.start) - (x.end - x.start))
    .slice(0, limit)
    .map((h) => h.a);
}

function argText(args: Record<string, unknown>): string {
  return Object.entries(args).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(", ");
}

/** The prompt section for this turn, or "" when the message is not an everyday activity. */
export function activityBrief(text: string): string {
  const found = matchActivities(text);
  if (!found.length) return "";
  const blocks = found.map((a) => [
    `- **${a.label}** (for ${a.who.map((w) => AUDIENCE[w]).join(", ")})`,
    ...a.run.map((r) => `  - \`${r.tool}\` ${argText(r.args)} - ${r.when}`),
    `  - Steps: ${a.steps.join("; ")}`,
    a.rest ? `  - Rest/recovery: ${a.rest}` : "",
  ].filter(Boolean).join("\n"));
  return "## Everyday activity (runtime catalog)\nThe message matches these. Carry it out with the listed tool that fits what they asked - fill the <placeholders> from the message, and ask only for what is missing. Give the steps or rest note when they asked how, or when it helps; do not lecture. Repeating reminders are a Premium feature: if one is refused, set a one-off for the next time and say so.\n" + blocks.join("\n");
}

// ─── The activity log (stored as one memory key) ──────────────────────────────
//
// The whole log rides along in the memory the browser mirrors and sends with
// every message, so it is kept small: 60 days, 600 entries, short field names.

export const DAYLOG_KEY = "daylog";
const KEEP_DAYS = 60;
const MAX_ENTRIES = 600;

export type LogEntry = { i: string; d: string; t: string; k: LogKind; a?: number; u?: string; n?: string; s?: string };

// Kinds where adding entries up means something. The rest are readings (show the
// latest and the range) or events (count them).
const SUMMED: LogKind[] = ["water", "steps", "workout", "sleep", "nap", "meditation", "baby_feed", "baby_sleep", "pet_walk"];
const READINGS: LogKind[] = ["weight", "bp", "sugar", "mood"];

export function isLogKind(k: unknown): k is LogKind {
  return typeof k === "string" && (LOG_KINDS as readonly string[]).includes(k);
}

function isEntry(e: unknown): e is LogEntry {
  const x = e as LogEntry;
  return !!x && typeof x === "object" && typeof x.i === "string" && /^\d{4}-\d{2}-\d{2}$/.test(String(x.d)) && typeof x.t === "string" && isLogKind(x.k);
}

/** The stored log; anything malformed (a hand-edited or damaged value) is dropped. */
export function readLog(store: Record<string, string>): LogEntry[] {
  try {
    const v = JSON.parse(store[DAYLOG_KEY] ?? "[]");
    return Array.isArray(v) ? v.filter(isEntry) : [];
  } catch {
    return [];
  }
}

function hhmm(d: Date, tz?: string): string {
  return d.toLocaleTimeString("en-GB", { timeZone: validZone(tz), hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

function daysBefore(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

// Period days are few and the cycle estimate needs months of them, so they are
// kept for a year.
const PERIOD_KEEP_DAYS = 400;

function keep(entries: LogEntry[], today: string): string {
  const cutoff = daysBefore(today, KEEP_DAYS);
  const periodCutoff = daysBefore(today, PERIOD_KEEP_DAYS);
  return JSON.stringify(entries.filter((x) => x.d > (x.k === "period" ? periodCutoff : cutoff)).sort((x, y) => (x.d + x.t).localeCompare(y.d + y.t)).slice(-MAX_ENTRIES));
}

/** Adds one entry to the store and returns it. */
export function addEntry(
  store: Record<string, string>,
  e: { kind: LogKind; amount?: number; unit?: string; note?: string; subject?: string },
  now: Date,
  tz?: string,
): LogEntry {
  const day = localDay(now, tz);
  // Two identical entries in the same minute ("two glasses of water") are two
  // entries; the id is what keeps a later merge from folding them into one.
  const entry: LogEntry = { i: Math.random().toString(36).slice(2, 8), d: day, t: hhmm(now, tz), k: e.kind };
  if (typeof e.amount === "number" && Number.isFinite(e.amount)) entry.a = e.amount;
  const unit = e.unit || UNITS[e.kind];
  if (unit && entry.a !== undefined) entry.u = unit;
  if (e.note) entry.n = String(e.note).slice(0, 120);
  if (e.subject) entry.s = String(e.subject).slice(0, 40);
  store[DAYLOG_KEY] = keep([...readLog(store), entry], day);
  return entry;
}

// The browser keeps its own copy of memory and it wins over the server's, so a
// device that has not synced lately would drop entries logged elsewhere. The two
// logs are unioned by entry id instead.
export function mergeLogs(today: string, ...values: (string | undefined)[]): string {
  const byId = new Map<string, LogEntry>();
  for (const v of values) for (const e of readLog({ [DAYLOG_KEY]: v ?? "[]" })) byId.set(e.i, e);
  return keep(Array.from(byId.values()), today);
}

const SPAN: Record<string, number> = { today: 0, week: 6, month: 29 };
const DAY_MS = 86_400_000;

function periodPrediction(entries: LogEntry[], today: string): string {
  const days = Array.from(new Set(entries.filter((e) => e.k === "period" && /^\s*(start|started|began|day ?1)\b/i.test(e.n ?? "")).map((e) => e.d))).sort();
  // A second "start" a few days into the same period is the same period.
  const starts = days.filter((d, i) => i === 0 || Date.parse(d) - Date.parse(days[i - 1]) >= 15 * DAY_MS);
  if (!starts.length) return "No period start logged yet. Log the first day with note 'start'.";
  const last = starts[starts.length - 1];
  const gaps = starts.slice(1).map((d, i) => Math.round((Date.parse(d) - Date.parse(starts[i])) / DAY_MS)).filter((g) => g <= 60);
  const avg = gaps.length ? Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length) : 28;
  const next = new Date(Date.parse(last) + avg * DAY_MS).toISOString().slice(0, 10);
  const late = Math.round((Date.parse(today) - Date.parse(next)) / DAY_MS);
  return `Last period started ${last}. Average cycle ${avg} days${gaps.length ? ` (from ${gaps.length} logged cycle${gaps.length > 1 ? "s" : ""})` : " (default until two starts are logged)"}. Next expected around ${next}${late > 0 ? ` - that was ${late} day${late > 1 ? "s" : ""} ago, so it is late or the start was not logged` : ""}. An estimate, not medical advice.`;
}

function describe(kind: LogKind, es: LogEntry[], days: number, multiDay: boolean): string {
  const last = es[es.length - 1];
  const tailNote = `; last ${last.d} ${last.t}${last.a !== undefined ? ` ${last.a}${last.u ? ` ${last.u}` : ""}` : ""}${last.n ? ` (${last.n})` : ""}${last.s ? ` [${last.s}]` : ""}`;
  const count = `${es.length} entr${es.length === 1 ? "y" : "ies"}`;
  const nums = es.filter((e) => e.a !== undefined);
  if (SUMMED.includes(kind) && nums.length) {
    const byUnit = new Map<string, number>();
    for (const e of nums) byUnit.set(e.u ?? "", (byUnit.get(e.u ?? "") ?? 0) + (e.a ?? 0));
    const totals = Array.from(byUnit, ([u, total]) => `${Math.round(total * 10) / 10}${u ? ` ${u}` : ""}${multiDay ? `, about ${Math.round((total / days) * 10) / 10}/day over ${days} days` : ""}`);
    return `- ${kind}: ${count} - total ${totals.join(" + ")}${tailNote}`;
  }
  if (READINGS.includes(kind) && nums.length > 1) {
    const vals = nums.map((e) => e.a ?? 0);
    return `- ${kind}: ${count} - range ${Math.min(...vals)}-${Math.max(...vals)}${nums[0].u ? ` ${nums[0].u}` : ""}${tailNote}`;
  }
  return `- ${kind}: ${count}${tailNote}`;
}

/** What was logged over a period, as text for the model and the user. */
export function summarize(store: Record<string, string>, period: string, now: Date, tz?: string, kind?: string): string {
  const today = localDay(now, tz);
  const all = readLog(store);
  if (kind === "period") return periodPrediction(all, today);
  const span = SPAN[period] ?? 0;
  const from = daysBefore(today, span);
  const inRange = all.filter((e) => e.d >= from && e.d <= today && (!kind || e.k === kind));
  const label = span ? `in the last ${span + 1} days` : "today";
  if (!inRange.length) return `Nothing logged${kind ? ` for ${kind}` : ""} ${label}.`;
  const byKind = new Map<LogKind, LogEntry[]>();
  for (const e of inRange) byKind.set(e.k, [...(byKind.get(e.k) ?? []), e]);
  const days = span + 1;
  const lines = Array.from(byKind, ([k, es]) => describe(k, es, days, span > 0));
  return `Activity log, ${span ? `${from} to ${today}` : `today (${today})`}:\n${lines.join("\n")}`;
}
