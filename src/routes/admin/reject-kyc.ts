import { Request, Response } from "express";
import { DataSource } from "typeorm";
import { User } from "@/models/User.model";
import { KYCStatus } from "@/types/enums";
import { truncateWalletAddress } from "@/lib/kyc";
import { logger } from "@/observability/logger";

interface RejectKYCBody {
  userId: string;
  reviewerId: string;
  rejectionReason: string;
}

export async function rejectKYC(req: Request<unknown, unknown, RejectKYCBody>, res: Response, dataSource: DataSource) {
  try {
    const adminKey = req.headers["x-admin-key"];
    if (adminKey !== process.env.ADMIN_API_KEY) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { userId, reviewerId, rejectionReason } = req.body;

    const userRepo = dataSource.getRepository(User);
    const user = await userRepo.findOneBy({ id: userId });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    await userRepo.update(userId, { kycStatus: KYCStatus.REJECTED });

    // Logged only after the DB update succeeds, so the audit trail never
    // records a decision that didn't actually persist.
    const decidedAt = new Date().toISOString();
    logger.info("KYC rejection decision", {
      wallet_address: truncateWalletAddress(user.stellarAddress),
      decision: "rejected",
      reviewer_id: reviewerId,
      decided_at: decidedAt,
      rejection_reason: rejectionReason,
    });

    return res.json({ success: true });
  } catch (err: unknown) {
    const appErr = err as { status?: number; code?: string; message?: string };
    return res.status(appErr.status ?? 500).json({
      error: {
        code: appErr.code ?? "INTERNAL_ERROR",
        message: appErr.message ?? "Internal server error",
      },
    });
  }
}
