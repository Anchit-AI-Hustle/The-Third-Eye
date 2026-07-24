# The Third Eye — Business Plan

*Voice-first personal AI OS ("JARVIS for your life and work"). Founder: Anchit Tandon. Deployed at the-third-eye.anchit-tandon.com.*

> **Reading note:** Every figure is labelled **[Sourced]** (published, cited) or **[EST]** (analyst assumption). Do not treat any [EST] as a forecast — they are directional planning numbers. Produced by a multi-agent research pass (8 analysts + synthesis); sources consolidated at the end.

---

## 1. Vision & Thesis

The assistant layer is commoditising fast — ChatGPT, Gemini, and Perplexity are being given away *free* in India via telecom bundles (Jio→Gemini, Airtel→Perplexity Pro). Winning general chat is a price war against zero. **The Third Eye's thesis is the opposite: value accrues not to the model but to the proprietary context and the actions taken on it.** A product that ambiently captures your work (Gmail/Chat→tasks), remembers your day (Life Log), and *executes* in India-native rails (UPI, WhatsApp, calls) builds switching cost no telecom giveaway replicates. We are not selling intelligence; we are selling an operating system for a person's life and work.

## 2. Product & Wedge

**Full vision:** conversational assistant + named AI agents, auto task-capture, content/music Studio, Job/Finance/Health engines, Life Log timeline, 3D personas, approval-gated agentic actions, saved "Skills."

**The wedge (what we lead with):** *auto task-capture* — email/Chat → tracked task, zero typing, first captured task within 10 minutes of connecting Gmail. It is narrow, demonstrable, and delivers an immediate "aha" that broad rivals blur. Sell the wedge first, the OS later. The **Life Log daily brief** is the retention loop (a daily open-reason); accumulating memory is the moat.

## 3. Market Sizing

*Categories The Third Eye straddles are enterprise-weighted; we size the consumer-paid slice only.*

**India**

| Layer | Value | Basis |
|---|---|---|
| TAM (consumer AI-assistant/productivity) | ~$585M by 2030, 27% CAGR | [Sourced: Grand View, India IVA] |
| SAM (English/Hindi, UPI, willing-to-pay) | ~$180–230M | **[EST]** ~30–40% of TAM |
| SOM (by 2028) | ~$3–9M | **[EST]** 2–4% capture |

Riding tailwinds: 660M smartphone users, 16–17B UPI txns/month, voice search +270% YoY, 70% want vernacular **[all Sourced]**. Core risk: **India's monetization gap** — huge user base, thin paying base; freemium conversion ~2–5% **[Sourced]**.

**International (US/EU/SEA)**

Consumer paid-assistant SAM ~$8–12B by 2030 **[EST]**, anchored to revealed demand (OpenAI: 50M paid subs, $8B revenue; Perplexity ~$450M ARR **[Sourced]**). SOM ~$4–24M ARR by 2030 **[EST]**, ~50–200K subs. **SEA drives volume (lower ARPU, home advantage); US/EU drive revenue.** International tiers in USD carry blended ARPU — the margin hedge against India's low willingness-to-pay.

## 4. Competitive Landscape

| Product | Lane | Price (Sourced) | Gap we exploit |
|---|---|---|---|
| **Zoey OS** | Voice AI OS (true peer) | $90–170/mo | No life-log/health/finance; no India action layer (UPI) |
| **ChatGPT/Operator** | General + agent | Free–$200 | Not ambient; no auto task-capture |
| **Perplexity** | Answer engine | Free–$200 | Weak life-management, actions, personas |
| **Gemini (via Jio)** | General assistant | Free 18mo | Generic; no cross-app execution or Life Log |
| **Martin** | Proactive inbox agent | ~$21/mo | No Studio/Health/personas |
| **Motion/Reclaim** | Calendar/scheduling | $8–29/seat | Single-lane |

**How we win:** *breadth tuned for India.* One product = voice OS + auto-capture + Studio + Health + Life Log + agentic UPI/WhatsApp actions. Zoey is the only feature peer but lacks the India-native action layer. **Honest risk:** all-in-one invites depth-vs-breadth criticism against best-of-breed incumbents, and Kruti's stall shows standalone agentic-assistant retention is fragile.

## 5. Unit Economics

*Per active paid user/month. Rates [Sourced]; volumes [EST].*

| Cost driver | Cost/user |
|---|---|
| LLM inference (Gemini Flash, ~8M in/1M out) | ~$4.90 |
| Transcription (~30 min/day Life Log) | ~$2.70 |
| Studio image/music gen | ~$1.30 |
| Infra (hosting/DB/storage) | ~$0.80 |
| **Total variable COGS** | **~$9.70** |

**~75% of COGS is LLM + transcription tokens.** A 2× output-token overrun halves Pro margin and turns a cheap tier negative. **Margin is a routing-and-metering problem, not a pricing one:** route cheap turns to Flash-Lite/Groq, cache/summarize transcripts, hard per-tier usage caps, push heavy users to credits.

- **CAC [Sourced ranges]:** India paid-user CAC ~$15–40; founder-led/organic ≈ near-zero (carry early growth).
- **LTV [EST]:** Pro ~$99 gross-margin LTV (18/mo × 55% × ~10-mo retention).
- **Payback [EST]:** ~3 months blended; **thin tiers push payback past 12 months — a red flag** unless credit-metered.

## 6. Pricing & Packaging

India prices are **PPP-adjusted (~25–35% of USD), not FX-converted** — the same logic as ChatGPT Go's ₹399 **[Sourced anchor; our points EST]**.

| Tier | Intl/mo | India/mo | Credits/mo | Key gates |
|---|---|---|---|---|
| Free | $0 | ₹0 | 100 | Chat + capture; 15 min/day Life Log |
| **Basic** | $6 | ₹299 | 500 | Capture + chat; 1 hr/day Life Log |
| **Plus** | $15 | ₹599 | 2,000 | + Agents, agentic actions, 3 hr/day Log |
| **Pro** | $32 | ₹1,299 | 6,000 | + Studio, Job/Finance/Health, Skills |
| **Max** | $69 | ₹2,499 | 18,000 | All features, priority inference, 3D personas |

*(Reconciliation: an earlier model floated Plus at $6/₹499 — that yields only ~17% margin and is rejected. Plus is set at $15/₹599 so no subscription tier is structurally loss-making.)*

**Credits meter the costly actions** (1 credit ≈ ₹0.40/$0.005 loaded COGS): chat=1, agentic action=2, image=5, transcription min=1.5, video=40–80. Bundles: ₹99/1k · ₹399/5k · ₹1,499/25k (per-credit priced *above* in-plan rate so subscriptions stay the better deal). This holds blended gross margin ~70–80% **[EST]** even for heavy users. **PIN test-bypass must never mint real credits** — flag QA separately.

## 7. GTM & Growth (12-month motion)

**ICP:** solo founders / D2C operators / creators in India, 25–40, drowning in Gmail/WhatsApp/Sheets — Anchit's own peer group, UPI-native.

- **M0–3:** ship the wedge; 100 hand-picked founder-friends via PIN/waitlist; founder builds in public daily (LinkedIn/X — "I built a JARVIS that runs my D2C business," Vahdam as proof).
- **M3–6:** open free tier + **UPI Autopay trials** (structurally required — India card penetration ~8% **[Sourced]**; a card-wall chokes); seed 10–20 productivity YouTubers/Reels creators with free Pro (voice + 3D personas are inherently screen-recordable).
- **M6–9:** paid tiers live; referral credit loop; Discord/WhatsApp community shipping user feature requests publicly.
- **M9–12:** expand wedge→full-OS positioning; launch international tiers as the ARPU/margin hedge.

**Activation metric:** first auto-captured task <10 min. **Conversion [EST]:** ~2–3% freemium→paid (global median 2.2–2.6% **[Sourced]**) — so free volume must be large. Virality is the weakest lever (personal-OS use is private); force it via exportable Skills and "agent did X today" recaps.

## 8. Financial Projection (3-Year Sketch)

**All figures [EST] — a directional shape, not precision.** Assumptions: blended ARPU rises as international mix grows; conversion ~2.5%; gross margin ~65% after credit-metering, before ~15% app-store cut; founder-led CAC keeps S&M light early.

| | Y1 | Y2 | Y3 |
|---|---|---|---|
| Free users (avg) | ~20K | ~120K | ~500K |
| Paying subs (avg) | ~500 | ~5,000 | ~20,000 |
| Blended ARPU/mo | ~$8 | ~$9 | ~$10 |
| **Revenue** | **~$48K** | **~$540K** | **~$2.4M** |
| Gross margin | ~55% | ~62% | ~66% |
| **Gross profit** | ~$26K | ~$335K | ~$1.6M |
| Opex (infra, audit, contractors, S&M) | ~$120K | ~$400K | ~$1.1M |
| **Net** | **~($94K)** | **~($65K)** | **~+$500K** |

Y3 ARR (~$2.4M) sits inside the India SOM band ($3–9M by 2028) and low end of intl SOM. Path to break-even hinges on international ARPU and disciplined token routing — **not** on India volume alone.

## 9. Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| **DPDP Act 2023** (obligations live 13 May 2027; penalties to ₹250cr) — ingests email, always-on mic, health/finance | High | Local-first processing, on-device Whisper, per-feature consent, short retention, published DPA, bystander-consent for audio |
| **Google OAuth restricted scopes** — annual CASA Tier 2 audit (~$500–1,000/yr); lapse silently breaks capture for all users | High | Budget/calendar the audit, minimise scopes, add IMAP/manual-import fallback |
| **Free-assistant price reset** (Jio/Airtel bundles) | High | Don't compete on general chat; compete on actions + context |
| **LLM token cost blowout** (always-on transcription) | Med-High | RoutedClient fallback chain, Ollama local tier, hard caps, credit pass-through |
| **Platform risk** (Vercel, app-store ToS on UPI/call automation) | Medium | Approval-gating, compliant action design, diversify hosting |
| **Thin moat** (assistant layer commoditised; Zoey direct) | Medium | Data network effects, India-native integrations, execution speed |

## 10. 90-Day Execution Plan

- **Days 1–30 — Wedge hardening.** Nail auto task-capture reliability + <10-min activation; instrument the funnel; begin CASA Tier 2 audit prep; draft privacy/consent + DPA.
- **Days 31–60 — Closed alpha.** 100 founder-friends via PIN/waitlist; ship UPI Autopay trial rail; wire per-tier usage caps and credit metering (QA credits flagged separately); daily founder build-in-public.
- **Days 61–90 — Paid + creator seed.** Open free tier + Basic/Plus paid; seed 10–20 creators with free Pro; launch referral credits; stand up Discord/WhatsApp community. **Success gate:** ≥2.5% activated→paid conversion and CAC payback <6 months before scaling spend.

---
*Sources consolidated from analyst sections: Grand View Research, FICCI-EY/Storyboard18, Business Standard, MarketsandMarkets, MarkNtel, Deloitte, Business of Apps, Sacra, Zoey OS, OpenRouter/Gemini pricing, RevenueCat, TechCrunch, CNBC, TelecomTalk, PIB, EY, Google OAuth docs, DeepStrike.*
