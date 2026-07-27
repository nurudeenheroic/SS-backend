import { validateInvoiceForPublish } from "../src/lib/validate-invoice-for-publish";
import { Invoice } from "../src/models/Invoice.model";
import { InvoiceStatus } from "../src/types/enums";

function futureDate(hoursFromNow: number): Date {
  return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
}

function createInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "invoice-1",
    sellerId: "seller-1",
    invoiceNumber: "INV-001",
    customerName: "Customer A",
    amount: "1000.0000",
    discountRate: "5.00",
    netAmount: "950.0000",
    dueDate: futureDate(48),
    ipfsHash: "QmTestHash",
    riskScore: null,
    status: InvoiceStatus.DRAFT,
    smartContractId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    seller: overrides.seller as Invoice["seller"],
    investments: overrides.investments ?? [],
    transactions: overrides.transactions ?? [],
    ...overrides,
  } as Invoice;
}

describe("validateInvoiceForPublish", () => {
  it("returns an empty array when all checks pass", () => {
    const invoice = createInvoice();
    expect(validateInvoiceForPublish(invoice)).toEqual([]);
  });

  it("returns a validation error for zero face value", () => {
    const invoice = createInvoice({ amount: "0.0000" });
    const errors = validateInvoiceForPublish(invoice);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ field: "amount", code: "FACE_VALUE_NOT_POSITIVE" });
  });

  it("returns a validation error for a negative face value", () => {
    const invoice = createInvoice({ amount: "-100.0000" });
    const errors = validateInvoiceForPublish(invoice);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ field: "amount", code: "FACE_VALUE_NOT_POSITIVE" });
  });

  it("returns a validation error for a due date in the past", () => {
    const invoice = createInvoice({ dueDate: futureDate(-1) });
    const errors = validateInvoiceForPublish(invoice);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ field: "dueDate", code: "DUE_DATE_TOO_SOON" });
  });

  it("returns a validation error for a due date less than 24 hours away", () => {
    const invoice = createInvoice({ dueDate: futureDate(1) });
    const errors = validateInvoiceForPublish(invoice);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ field: "dueDate", code: "DUE_DATE_TOO_SOON" });
  });

  it("returns a validation error when no document is attached", () => {
    const invoice = createInvoice({ ipfsHash: null });
    const errors = validateInvoiceForPublish(invoice);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ field: "ipfsHash", code: "MISSING_DOCUMENT" });
  });

  it("returns all errors when multiple fields are invalid, not just the first", () => {
    const invoice = createInvoice({
      amount: "0.0000",
      dueDate: futureDate(-5),
      ipfsHash: null,
    });
    const errors = validateInvoiceForPublish(invoice);
    expect(errors).toHaveLength(3);
    expect(errors.map((e) => e.code)).toEqual(
      expect.arrayContaining(["FACE_VALUE_NOT_POSITIVE", "DUE_DATE_TOO_SOON", "MISSING_DOCUMENT"]),
    );
  });
});
