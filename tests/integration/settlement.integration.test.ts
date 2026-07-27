import crypto from "crypto";
import { DataSource } from "typeorm";
import { InvestmentService } from "../../src/services/investment.service";
import { SettlementService } from "../../src/services/settlement.service";
import { Invoice } from "../../src/models/Invoice.model";
import { Investment } from "../../src/models/Investment.model";
import { InvoiceStatus, InvestmentStatus } from "../../src/types/enums";

/**
 * Minimal in-memory TypeORM stand-in shared by InvestmentService and
 * SettlementService so this test exercises the real funding -> settlement
 * flow end to end without a live database.
 */
function createFakeDataSource(invoice: Invoice) {
  const invoices = new Map<string, Invoice>([[invoice.id, invoice]]);
  const investments = new Map<string, Investment>();

  type FakeManager = {
    createQueryBuilder: (entity: unknown, alias: string) => {
      setLock: () => unknown;
      where: (clause: string, params: { id: string }) => unknown;
      getOne: () => Promise<Invoice | null>;
    };
    find: (
      entity: unknown,
      options: { where: Record<string, unknown> | Record<string, unknown>[] },
    ) => Promise<Investment[]>;
    create: (entity: unknown, data: Partial<Investment>) => Investment | Partial<Investment>;
    save: (entity: unknown, data: Investment | Invoice) => Promise<Investment | Invoice>;
  };

  const manager: FakeManager = {
    createQueryBuilder: (_entity: unknown, _alias: string) => {
      let targetId: string | undefined;
      const builder = {
        setLock: () => builder,
        where: (_clause: string, params: { id: string }) => {
          targetId = params.id;
          return builder;
        },
        getOne: async () => (targetId ? invoices.get(targetId) ?? null : null),
      };
      return builder;
    },
    find: async (
      entity: unknown,
      options: { where: Record<string, unknown> | Record<string, unknown>[] },
    ) => {
      if (entity === Investment) {
        const whereClauses = Array.isArray(options.where) ? options.where : [options.where];
        return [...investments.values()].filter((investment) =>
          whereClauses.some((clause) =>
            Object.entries(clause).every(
              ([key, value]) => (investment as unknown as Record<string, unknown>)[key] === value,
            ),
          ),
        );
      }
      return [];
    },
    create: (entity: unknown, data: Partial<Investment>) => {
      if (entity === Investment) {
        return { id: crypto.randomUUID(), ...data } as Investment;
      }
      return data;
    },
    save: async (entity: unknown, data: Investment | Invoice) => {
      if (entity === Investment) {
        investments.set((data as Investment).id, data as Investment);
      } else if (entity === Invoice) {
        invoices.set((data as Invoice).id, data as Invoice);
      }
      return data;
    },
  };

  const dataSource = {
    transaction: async (callback: (manager: FakeManager) => Promise<unknown>) =>
      callback(manager),
  } as unknown as DataSource;

  return { dataSource, invoices, investments };
}

function createInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: crypto.randomUUID(),
    sellerId: crypto.randomUUID(),
    invoiceNumber: "INV-SETTLE-001",
    customerName: "Customer A",
    amount: "6000.0000",
    discountRate: "0.00",
    netAmount: "6000.0000",
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    ipfsHash: "QmTestHash",
    riskScore: null,
    status: InvoiceStatus.PUBLISHED,
    smartContractId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    seller: undefined as unknown as Invoice["seller"],
    investments: [],
    transactions: [],
    ...overrides,
  } as Invoice;
}

describe("Settlement integration: funding multiple investors then settling", () => {
  it("distributes proceeds pro-rata to each investor and marks the invoice settled", async () => {
    const invoice = createInvoice();
    const { dataSource, invoices, investments } = createFakeDataSource(invoice);

    const investmentService = new InvestmentService(dataSource);
    const settlementService = new SettlementService(dataSource);

    const investorAId = crypto.randomUUID();
    const investorBId = crypto.randomUUID();

    const investmentA = await investmentService.createInvestment({
      invoiceId: invoice.id,
      investorId: investorAId,
      investmentAmount: "4000.0000",
    });

    const investmentB = await investmentService.createInvestment({
      invoiceId: invoice.id,
      investorId: investorBId,
      investmentAmount: "2000.0000",
    });

    // Simulate confirmed on-chain payment for both investments before settlement.
    for (const investment of [investmentA, investmentB]) {
      const stored = investments.get(investment.id)!;
      stored.status = InvestmentStatus.CONFIRMED;
      investments.set(investment.id, stored);
    }

    // Invoice reaches FUNDED once fully subscribed (asserted by InvestmentService already);
    // settlement requires FUNDED status.
    expect(invoices.get(invoice.id)?.status).toBe(InvoiceStatus.FUNDED);

    const result = await settlementService.settleInvoice({
      invoiceId: invoice.id,
      proceeds: "6600.0000",
    });

    const returnByInvestor = new Map(
      result.settlements.map((settlement) => [settlement.investorId, settlement.actualReturn]),
    );

    expect(returnByInvestor.get(investorAId)).toBe("4400.0000");
    expect(returnByInvestor.get(investorBId)).toBe("2200.0000");

    expect(result.status).toBe(InvoiceStatus.SETTLED);
    expect(invoices.get(invoice.id)?.status).toBe(InvoiceStatus.SETTLED);

    const sumOfReturns = result.settlements.reduce(
      (sum, settlement) => sum + Number(settlement.actualReturn),
      0,
    );
    expect(sumOfReturns).toBeCloseTo(6600, 4);
  });
});
