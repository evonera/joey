import { describe, expect, it } from "vitest";
import { redactPII } from "../redact-pii";

describe("redactPII", () => {
  it("redacts email addresses", () => {
    expect(redactPII("Contact jane.doe+promo@example.co.uk for details")).toBe(
      "Contact [email redacted] for details",
    );
  });

  it("redacts phone numbers", () => {
    expect(redactPII("Call +1 (415) 555-0132 tomorrow")).toBe("Call [phone redacted] tomorrow");
    expect(redactPII("Call 415-555-0132 tomorrow")).toBe("Call [phone redacted] tomorrow");
  });

  it("redacts key-like secrets", () => {
    expect(redactPII("key=sk-abcdefgh12345678 here")).toBe("key=[key redacted] here");
    expect(redactPII("token ghp_abcdefgh1234567890 done")).toBe("token [key redacted] done");
    expect(redactPII("Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig")).toBe("Bearer [REDACTED]");
  });

  it("leaves ordinary prose and metrics untouched", () => {
    const prose = "Launch post got 1,234 likes and 56 comments in 2026. Reach was up 12% week over week.";
    expect(redactPII(prose)).toBe(prose);
    expect(redactPII("Brand voice is playful and concise.")).toBe("Brand voice is playful and concise.");
  });
});
