import { computeInvestorReturn } from "../../src/utils/compute-investor-return";

describe("computeInvestorReturn", () => {
  describe("floor division behavior", () => {
    it("should return floored value for three equal investors splitting 1000 proceeds", () => {
      // 3 investors each with 1/3 share of 1000 proceeds
      // Each should get floor(1000 / 3) = 333.3333333
      // Total: 999.9999999 (floor division in action)
      const totalFunded = 1000_0000000n; // 1000 stroops (7 decimals)
      const settledProceeds = 1000_0000000n;
      const investorFunded = 333_3333333n; // Approximately 1/3

      const investor1Return = computeInvestorReturn(investorFunded, totalFunded, settledProceeds);
      const investor2Return = computeInvestorReturn(investorFunded, totalFunded, settledProceeds);
      const investor3Return = computeInvestorReturn(
        333_3333334n, // Slightly more to reach exactly 1000
        totalFunded,
        settledProceeds
      );

      // Each gets 333.3333333 stroops (floored)
      expect(investor1Return).toBe(333_3333333n);
      expect(investor2Return).toBe(333_3333333n);
      expect(investor3Return).toBe(333_3333334n);

      // Sum should equal 1000.0000000
      const total = investor1Return + investor2Return + investor3Return;
      expect(total).toBe(1000_0000000n);
      expect(total).toBeLessThanOrEqual(settledProceeds);
    });

    it("should return 33 for investor with 1 stroop out of 3 total, 100 proceeds", () => {
      // 1/3 share of 100 = 33.33... should floor to 33
      const investorFunded = 1_0000000n; // 1 stroop
      const totalFunded = 3_0000000n; // 3 stroops
      const settledProceeds = 100_0000000n; // 100 stroops

      const result = computeInvestorReturn(investorFunded, totalFunded, settledProceeds);

      expect(result).toBe(33_3333333n); // floor(100/3) = 33.3333333
    });

    it("should return 66 for investor with 2 stroops out of 3, 100 proceeds", () => {
      // 2/3 share of 100 = 66.66... should floor to 66
      const investorFunded = 2_0000000n; // 2 stroops
      const totalFunded = 3_0000000n; // 3 stroops
      const settledProceeds = 100_0000000n; // 100 stroops

      const result = computeInvestorReturn(investorFunded, totalFunded, settledProceeds);

      expect(result).toBe(66_6666666n); // floor(200/3) = 66.6666666
    });

    it("should ensure sum of 1/3 and 2/3 investors equals 99, not 100", () => {
      // This test proves the remainder stays in the contract
      const totalFunded = 3_0000000n;
      const settledProceeds = 100_0000000n;

      const investor1Return = computeInvestorReturn(1_0000000n, totalFunded, settledProceeds);
      const investor2Return = computeInvestorReturn(2_0000000n, totalFunded, settledProceeds);

      expect(investor1Return).toBe(33_3333333n);
      expect(investor2Return).toBe(66_6666666n);

      const total = investor1Return + investor2Return;
      expect(total).toBe(99_9999999n); // Not 100!
      expect(total).toBeLessThan(settledProceeds);
    });

    it("should demonstrate meaningful difference between floor and ceiling division", () => {
      // Show that ceiling would produce different (incorrect) results
      const investorFunded = 1_0000000n;
      const totalFunded = 3_0000000n;
      const settledProceeds = 100_0000000n;

      const floorResult = computeInvestorReturn(investorFunded, totalFunded, settledProceeds);

      // If we used ceiling instead, it would be 34 (33.33... rounded up)
      // But we use floor, so it's 33
      expect(floorResult).toBe(33_3333333n);
      expect(floorResult).not.toBe(34_0000000n); // Not ceiling!
    });
  });

  describe("sum never exceeds settled proceeds", () => {
    it("should ensure total returns never exceed proceeds for multiple investors", () => {
      const totalFunded = 1000_0000000n;
      const settledProceeds = 1000_0000000n;

      // Create 7 investors with different amounts
      const investorAmounts = [
        150_0000000n,
        200_0000000n,
        100_0000000n,
        175_0000000n,
        125_0000000n,
        150_0000000n,
        100_0000000n,
      ];

      const returns = investorAmounts.map((amount) =>
        computeInvestorReturn(amount, totalFunded, settledProceeds)
      );

      const totalReturns = returns.reduce((sum, ret) => sum + ret, 0n);

      expect(totalReturns).toBeLessThanOrEqual(settledProceeds);
    });

    it("should handle case where one investor funded everything", () => {
      const investorFunded = 1000_0000000n;
      const totalFunded = 1000_0000000n;
      const settledProceeds = 1500_0000000n;

      const result = computeInvestorReturn(investorFunded, totalFunded, settledProceeds);

      expect(result).toBe(1500_0000000n);
      expect(result).toBeLessThanOrEqual(settledProceeds);
    });

    it("should handle very small investor share", () => {
      const investorFunded = 1n; // 1 stroop
      const totalFunded = 10000_0000000n; // 10000 stroops
      const settledProceeds = 10000_0000000n;

      const result = computeInvestorReturn(investorFunded, totalFunded, settledProceeds);

      // Should be floor(10000 / 10000) = 1
      expect(result).toBe(1n);
      expect(result).toBeLessThanOrEqual(settledProceeds);
    });
  });

  describe("edge cases", () => {
    it("should throw error for zero total funded", () => {
      expect(() => computeInvestorReturn(100_0000000n, 0n, 1000_0000000n)).toThrow(
        "Total funded amount cannot be zero"
      );
    });

    it("should throw error for negative investor amount", () => {
      expect(() => computeInvestorReturn(-100_0000000n, 1000_0000000n, 1000_0000000n)).toThrow(
        "All amounts must be non-negative"
      );
    });

    it("should throw error for negative total funded", () => {
      expect(() => computeInvestorReturn(100_0000000n, -1000_0000000n, 1000_0000000n)).toThrow(
        "All amounts must be non-negative"
      );
    });

    it("should throw error for negative settled proceeds", () => {
      expect(() => computeInvestorReturn(100_0000000n, 1000_0000000n, -1000_0000000n)).toThrow(
        "All amounts must be non-negative"
      );
    });

    it("should throw error when investor amount exceeds total", () => {
      expect(() => computeInvestorReturn(1500_0000000n, 1000_0000000n, 1000_0000000n)).toThrow(
        "Investor funded amount cannot exceed total funded amount"
      );
    });

    it("should return zero for zero investor funded", () => {
      const result = computeInvestorReturn(0n, 1000_0000000n, 1000_0000000n);
      expect(result).toBe(0n);
    });

    it("should return zero for zero settled proceeds", () => {
      const result = computeInvestorReturn(100_0000000n, 1000_0000000n, 0n);
      expect(result).toBe(0n);
    });
  });

  describe("precision handling", () => {
    it("should handle 7 decimal place precision correctly", () => {
      // 1.0000001 stroops out of 10 total, 100 proceeds
      const investorFunded = 1_0000001n;
      const totalFunded = 10_0000000n;
      const settledProceeds = 100_0000000n;

      const result = computeInvestorReturn(investorFunded, totalFunded, settledProceeds);

      // Should be floor((1.0000001 / 10) * 100) = floor(10.00000 10) = 10.0000010
      expect(result).toBe(10_0000010n);
    });

    it("should handle large amounts without overflow", () => {
      // Test with amounts in billions
      const investorFunded = 1000000000_0000000n; // 1 billion
      const totalFunded = 3000000000_0000000n; // 3 billion
      const settledProceeds = 3300000000_0000000n; // 3.3 billion

      const result = computeInvestorReturn(investorFunded, totalFunded, settledProceeds);

      // Should be floor((1B / 3B) * 3.3B) = floor(1.1B) = 1.1B
      expect(result).toBe(1100000000_0000000n);
    });
  });
});
