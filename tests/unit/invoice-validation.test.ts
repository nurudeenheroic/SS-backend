import { validateInvoiceForPublish } from "@/lib/invoice-validation";

describe("validateInvoiceForPublish", () => {
  const now = new Date("2025-01-01T00:00:00.000Z");

  it("passes when due date is exactly 24 hours in the future", () => {
    const dueDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    expect(() => validateInvoiceForPublish({ dueDate }, now)).not.toThrow();
  });

  it("fails when due date is 23 hours 59 minutes in the future", () => {
    const dueDate = new Date(now.getTime() + (23 * 60 + 59) * 60 * 1000);
    expect(() => validateInvoiceForPublish({ dueDate }, now)).toThrow();
  });

  it("fails when due date is in the past", () => {
    const dueDate = new Date(now.getTime() - 60 * 60 * 1000);
    expect(() => validateInvoiceForPublish({ dueDate }, now)).toThrow();
  });

  it("fails when due date equals the current timestamp", () => {
    expect(() => validateInvoiceForPublish({ dueDate: new Date(now) }, now)).toThrow();
  });

  it("reports the dueDate field on failure", () => {
    const dueDate = new Date(now.getTime() - 1000);
    try {
      validateInvoiceForPublish({ dueDate }, now);
      throw new Error("expected validateInvoiceForPublish to throw");
    } catch (err: unknown) {
      const serviceErr = err as { code: string; details?: { field?: string } };
      expect(serviceErr.code).toBe("invalid_due_date");
      expect(serviceErr.details?.field).toBe("dueDate");
    }
  });
});
