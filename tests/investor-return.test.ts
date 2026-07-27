import { computeInvestorReturn } from "../src/lib/investor-return";

describe("computeInvestorReturn", () => {
  it("computes the correct return when division is exact", () => {
    expect(computeInvestorReturn(2000n, 4000n, 4400n)).toBe(2200n);
  });

  it("floors the result when division is not exact, without rounding up", () => {
    // (1000 * 1000) / 3000 = 333.33... -> floors to 333
    expect(computeInvestorReturn(1000n, 3000n, 1000n)).toBe(333n);
  });

  it("returns the full settled proceeds when investedAmount equals totalFunded", () => {
    expect(computeInvestorReturn(5000n, 5000n, 7500n)).toBe(7500n);
  });

  it("returns 0 when investedAmount is 0", () => {
    expect(computeInvestorReturn(0n, 5000n, 7500n)).toBe(0n);
  });

  it("throws when totalFunded is zero or negative", () => {
    expect(() => computeInvestorReturn(100n, 0n, 100n)).toThrow(RangeError);
    expect(() => computeInvestorReturn(100n, -100n, 100n)).toThrow(RangeError);
  });

  it("throws on negative investedAmount or settledProceeds", () => {
    expect(() => computeInvestorReturn(-1n, 1000n, 1000n)).toThrow(RangeError);
    expect(() => computeInvestorReturn(1n, 1000n, -1000n)).toThrow(RangeError);
  });
});
