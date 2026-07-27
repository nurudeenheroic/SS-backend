import { DataSource, Repository } from "typeorm";
import { InvestmentService } from "../../src/services/investment.service";
import { Investment } from "../../src/models/Investment.model";
import { InvestmentStatus } from "../../src/types/enums";

describe("Investor dashboard aggregate", () => {
  let mockRepository: jest.Mocked<Repository<Investment>>;
  let mockDataSource: jest.Mocked<DataSource>;
  let investmentService: InvestmentService;

  const walletAId = "wallet-a";

  function seedInvestment(overrides: Partial<Investment>): Investment {
    return {
      id: "investment-id",
      invoiceId: "invoice-id",
      investorId: walletAId,
      investmentAmount: "0.0000",
      expectedReturn: "0.0000",
      actualReturn: null,
      status: InvestmentStatus.PENDING,
      transactionHash: null,
      stellarOperationIndex: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      ...overrides,
    } as Investment;
  }

  beforeEach(() => {
    mockRepository = {
      find: jest.fn(),
    } as unknown as jest.Mocked<Repository<Investment>>;

    mockDataSource = {
      getRepository: jest.fn().mockReturnValue(mockRepository),
    } as unknown as jest.Mocked<DataSource>;

    investmentService = new InvestmentService(mockDataSource);
  });

  it("aggregates total invested, total returns, and active count across investment states", async () => {
    // Wallet A: two active investments (2000, 3000) and one settled
    // investment (1000, realised return 1100).
    mockRepository.find.mockResolvedValue([
      seedInvestment({ id: "inv-1", investmentAmount: "2000.0000", status: InvestmentStatus.PENDING }),
      seedInvestment({ id: "inv-2", investmentAmount: "3000.0000", status: InvestmentStatus.CONFIRMED }),
      seedInvestment({
        id: "inv-3",
        investmentAmount: "1000.0000",
        status: InvestmentStatus.SETTLED,
        actualReturn: "1100.0000",
      }),
    ]);

    const dashboard = await investmentService.getInvestorDashboard(walletAId);

    expect(mockDataSource.getRepository).toHaveBeenCalledWith(Investment);
    expect(mockRepository.find).toHaveBeenCalledWith({ where: { investorId: walletAId } });

    expect(dashboard.totalInvested).toBe("6000.0000");
    expect(dashboard.totalReturns).toBe("1100.0000");
    expect(dashboard.activeInvestments).toBe(2);
  });

  it("does not count pending returns towards totalReturns", async () => {
    mockRepository.find.mockResolvedValue([
      seedInvestment({ id: "inv-1", investmentAmount: "500.0000", status: InvestmentStatus.PENDING, expectedReturn: "550.0000" }),
    ]);

    const dashboard = await investmentService.getInvestorDashboard(walletAId);

    expect(dashboard.totalInvested).toBe("500.0000");
    expect(dashboard.totalReturns).toBe("0.0000");
    expect(dashboard.activeInvestments).toBe(1);
  });

  it("excludes cancelled investments from the active count", async () => {
    mockRepository.find.mockResolvedValue([
      seedInvestment({ id: "inv-1", investmentAmount: "800.0000", status: InvestmentStatus.CANCELLED }),
    ]);

    const dashboard = await investmentService.getInvestorDashboard(walletAId);

    expect(dashboard.totalInvested).toBe("800.0000");
    expect(dashboard.activeInvestments).toBe(0);
  });

  it("returns zero for all fields when the wallet has no investments", async () => {
    mockRepository.find.mockResolvedValue([]);

    const dashboard = await investmentService.getInvestorDashboard("wallet-with-nothing");

    expect(dashboard).toEqual({
      totalInvested: "0.0000",
      totalReturns: "0.0000",
      activeInvestments: 0,
    });
  });
});
