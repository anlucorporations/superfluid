import { describe, expect, it } from "vitest";
import { anonymizedName, isValidJob } from "@/lib/jobs/reconciler";

describe("jobs internos (H6)", () => {
  it("reconoce los cuatro jobs del sistema", () => {
    for (const job of ["reconcile_flows", "flows_history", "anonymize_pii", "mark_scheduled_due"]) {
      expect(isValidJob(job)).toBe(true);
    }
    expect(isValidJob("reset_database")).toBe(false);
    expect(isValidJob("")).toBe(false);
  });

  it("anonimiza de forma irreversible y sin PII", () => {
    const name = anonymizedName("abcd1234efgh5678");
    expect(name.startsWith("Anonimizado · ")).toBe(true);
    expect(name).toContain("abcd1234");
    expect(name).not.toContain("efgh");
    expect(anonymizedName("wxyz9876")).not.toBe(name);
  });
});
