export function computeInvestorReturn(
  investorFundedStroops: bigint,
  totalFundedStroops: bigint,
  settledProceedsStroops: bigint
): bigint {
  if (totalFundedStroops === 0n) {
    throw new Error("Total funded amount cannot be zero");
  }

  if (investorFundedStroops < 0n || totalFundedStroops < 0n || settledProceedsStroops < 0n) {
    throw new Error("All amounts must be non-negative");
  }

  if (investorFundedStroops > totalFundedStroops) {
    throw new Error("Investor funded amount cannot exceed total funded amount");
  }

  // Calculate: (investorFunded * settledProceeds) / totalFunded
  // Using floor division by default with bigint
  const numerator = investorFundedStroops * settledProceedsStroops;
  const investorReturn = numerator / totalFundedStroops;

  return investorReturn;
}
