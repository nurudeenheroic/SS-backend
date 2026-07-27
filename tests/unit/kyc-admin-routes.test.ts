import { approveKYC } from "@/routes/admin/approve-kyc";
import { rejectKYC } from "@/routes/admin/reject-kyc";
import { KYCStatus } from "@/types/enums";
import { logger } from "@/observability/logger";

describe("KYC admin routes — structured logging", () => {
  const ADMIN_KEY = "test-admin-key";
  let mockUserRepo: any;
  let mockDataSource: any;
  let req: any;
  let res: any;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env.ADMIN_API_KEY = ADMIN_KEY;

    mockUserRepo = {
      findOneBy: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    };
    mockDataSource = {
      getRepository: jest.fn().mockReturnValue(mockUserRepo),
    };

    req = {
      headers: { "x-admin-key": ADMIN_KEY },
      body: {},
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    logSpy = jest.spyOn(logger, "info").mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  describe("approveKYC", () => {
    it("emits an approval log with wallet, decision, reviewer, and timestamp after the DB update", async () => {
      const callOrder: string[] = [];
      mockUserRepo.findOneBy.mockResolvedValue({ id: "user-1", stellarAddress: "GABCDEFGHIJKLMNOP" });
      mockUserRepo.update.mockImplementation(async () => {
        callOrder.push("db_update");
      });
      logSpy.mockImplementation(() => {
        callOrder.push("log");
      });

      req.body = { userId: "user-1", reviewerId: "reviewer-1" };

      await approveKYC(req, res, mockDataSource);

      expect(mockUserRepo.update).toHaveBeenCalledWith("user-1", { kycStatus: KYCStatus.APPROVED });
      expect(logSpy).toHaveBeenCalledTimes(1);

      const [message, metadata] = logSpy.mock.calls[0];
      expect(message).toBe("KYC approval decision");
      expect(metadata).toMatchObject({
        wallet_address: "GABC...MNOP",
        decision: "approved",
        reviewer_id: "reviewer-1",
      });
      expect(typeof metadata.decided_at).toBe("string");
      expect(Object.keys(metadata).sort()).toEqual(
        ["decided_at", "decision", "reviewer_id", "wallet_address"].sort(),
      );

      expect(callOrder).toEqual(["db_update", "log"]);
    });

    it("does not log when the admin key is invalid", async () => {
      req.headers["x-admin-key"] = "wrong-key";
      req.body = { userId: "user-1", reviewerId: "reviewer-1" };

      await approveKYC(req, res, mockDataSource);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(logSpy).not.toHaveBeenCalled();
    });
  });

  describe("rejectKYC", () => {
    it("emits a rejection log including the rejection reason after the DB update", async () => {
      mockUserRepo.findOneBy.mockResolvedValue({ id: "user-2", stellarAddress: "GZYXWVUTSRQPONML" });

      req.body = {
        userId: "user-2",
        reviewerId: "reviewer-2",
        rejectionReason: "Document expired",
      };

      await rejectKYC(req, res, mockDataSource);

      expect(mockUserRepo.update).toHaveBeenCalledWith("user-2", { kycStatus: KYCStatus.REJECTED });
      expect(logSpy).toHaveBeenCalledTimes(1);

      const [message, metadata] = logSpy.mock.calls[0];
      expect(message).toBe("KYC rejection decision");
      expect(metadata).toMatchObject({
        wallet_address: "GZYX...ONML",
        decision: "rejected",
        reviewer_id: "reviewer-2",
        rejection_reason: "Document expired",
      });
      expect(typeof metadata.decided_at).toBe("string");
      expect(Object.keys(metadata).sort()).toEqual(
        ["decided_at", "decision", "reviewer_id", "rejection_reason", "wallet_address"].sort(),
      );
    });
  });
});
