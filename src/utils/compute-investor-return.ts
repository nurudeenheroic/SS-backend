/**
 * Compute the pro-rata return for an investor given their funded amount,
 * total funded amount, and total settled proceeds.
 *
 * Uses floor division to ensure the sum of all investor returns never exceeds
 * the settled proceeds.
 *
 * Formula: floor((investorFunded / totalFunded) * settledProceeds)
 *
 * @param investorFundedStroops - Amount investor contributed in stroops (7 decimal places)
 * @param totalFundedStroops - Total amount funded by all investors in stroops
 * @param settledProceedsStroops - Total proceeds settled in stroops
 * @returns The investor's return in stroops (floored to nearest stroop)
 */
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
