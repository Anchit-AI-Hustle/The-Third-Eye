import { describe, expect, it } from "vitest";
import { callingCode, toWhatsAppNumber } from "@/lib/whatsappNumber";

describe("WhatsApp numbers", () => {
  it("keeps a number that already has its country code", () => {
    expect(toWhatsAppNumber("+44 7700 900123", "Asia/Kolkata")).toBe("447700900123");
    expect(toWhatsAppNumber("00971 50 123 4567", "Asia/Kolkata")).toBe("971501234567");
    expect(toWhatsAppNumber("919810000001", "America/New_York")).toBe("919810000001");
  });

  it("adds the user's own country code to a local number", () => {
    expect(toWhatsAppNumber("98100 00001", "Asia/Kolkata")).toBe("919810000001");
    expect(toWhatsAppNumber("098100 00001", "Asia/Kolkata")).toBe("919810000001");
    expect(toWhatsAppNumber("(212) 555-0101", "America/New_York")).toBe("12125550101");
    expect(toWhatsAppNumber("07700 900123", "Europe/London")).toBe("447700900123");
    expect(toWhatsAppNumber("050 123 4567", "Asia/Dubai")).toBe("971501234567");
  });

  it("knows the code for common zones and says when it does not", () => {
    expect(callingCode("Asia/Kolkata")).toBe("+91");
    expect(callingCode("Australia/Sydney")).toBe("+61");
    expect(callingCode("Mars/Base")).toBeNull();
    expect(toWhatsAppNumber("", "Asia/Kolkata")).toBe("");
  });
});
