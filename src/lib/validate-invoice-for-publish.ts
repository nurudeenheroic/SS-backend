import type { Invoice } from "@/models/Invoice.model";

export interface ValidationError {
  field: string;
  code: string;
  message: string;
}

const MIN_LEAD_TIME_MS = 24 * 60 * 60 * 1000;

/**
 * Validates that an invoice meets the minimum field requirements
 * required for the draft -> published lifecycle transition.
 */
export function validateInvoiceForPublish(invoice: Invoice): ValidationError[] {
  const errors: ValidationError[] = [];

  const faceValue = parseFloat(invoice.amount);
  if (!(faceValue > 0)) {
    errors.push({
      field: "amount",
      code: "FACE_VALUE_NOT_POSITIVE",
      message: "Invoice face value must be greater than zero.",
    });
  }

  const dueDate = new Date(invoice.dueDate);
  if (Number.isNaN(dueDate.getTime()) || dueDate.getTime() - Date.now() < MIN_LEAD_TIME_MS) {
    errors.push({
      field: "dueDate",
      code: "DUE_DATE_TOO_SOON",
      message: "Invoice due date must be at least 24 hours in the future.",
    });
  }

  if (!invoice.ipfsHash) {
    errors.push({
      field: "ipfsHash",
      code: "MISSING_DOCUMENT",
      message: "Invoice must have at least one document attached before it can be published.",
    });
  }

  return errors;
}
