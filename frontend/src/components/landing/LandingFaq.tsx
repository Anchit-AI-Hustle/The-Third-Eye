"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

const FAQS = [
  {
    q: "What does Google sign-in access?",
    a: "Sign-in requests only your name and email address to open your private workspace. Gmail and Calendar stay disconnected unless you explicitly grant access later in Settings.",
  },
  {
    q: "Is my data used to train AI models or shared?",
    a: "No. Your tasks, notes, and uploaded documents stay private to your account. We never sell your data or share it with third parties for advertising.",
  },
  {
    q: "Which devices can I use it on?",
    a: "The Third Eye works in any desktop or mobile browser, and as a native app on iPhone and Android. Your workspace, notes, and Studio generations sync across all of them.",
  },
  {
    q: "Can I connect my own AI provider keys?",
    a: "Yes. Built-in free and paid providers work out of the box, and you can also add your own Gemini, Groq, OpenRouter, Mistral, Cerebras, OpenAI, or Ollama keys in Settings.",
  },
  {
    q: "How do I start without configuring anything?",
    a: "Click Sign in, continue with Google, and your workspace is ready immediately with starter credits and zero setup.",
  },
];

export function LandingFaq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="mx-auto max-w-3xl divide-y divide-border-default rounded-card border border-border-default bg-background-surface">
      {FAQS.map((item, i) => {
        const isOpen = openIndex === i;
        const panelId = `faq-panel-${i}`;
        const btnId = `faq-btn-${i}`;
        return (
          <div key={item.q}>
            <button
              id={btnId}
              type="button"
              aria-expanded={isOpen}
              aria-controls={panelId}
              onClick={() => setOpenIndex(isOpen ? null : i)}
              className="flex min-h-[52px] w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-medium text-text-primary transition-colors duration-interaction hover:bg-background-elevated/50"
            >
              <span>{item.q}</span>
              <ChevronDown
                size={16}
                aria-hidden="true"
                className={`shrink-0 text-text-muted transition-transform duration-200 ${isOpen ? "rotate-180 text-accent-blue" : ""}`}
              />
            </button>
            <div
              id={panelId}
              role="region"
              aria-labelledby={btnId}
              hidden={!isOpen}
              className="px-5 pb-4 text-sm leading-relaxed text-text-secondary"
            >
              {item.a}
            </div>
          </div>
        );
      })}
    </div>
  );
}
