import jwt from "jsonwebtoken";
import { extractWalletFromToken } from "../../src/lib/extract-wallet-from-token";

const SECRET = "test-secret";

function makeToken(overrides: jwt.SignOptions & { sub?: string } = {}) {
  const { sub = "GABC1234DEFG5678", ...options } = overrides;
  return jwt.sign({ sub }, SECRET, { expiresIn: "1h", ...options });
}

describe("extractWalletFromToken", () => {
  it("returns the sub claim for a valid token", () => {
    const token = makeToken();
    expect(extractWalletFromToken(token, SECRET)).toBe("GABC1234DEFG5678");
  });

  it("returns null for undefined token", () => {
    expect(extractWalletFromToken(undefined, SECRET)).toBeNull();
  });

  it("returns null for empty string token", () => {
    expect(extractWalletFromToken("", SECRET)).toBeNull();
  });

  it("returns null for expired token", () => {
    const token = jwt.sign({ sub: "GABC" }, SECRET, { expiresIn: -1 });
    expect(extractWalletFromToken(token, SECRET)).toBeNull();
  });

  it("returns null for invalid signature", () => {
    const token = jwt.sign({ sub: "GABC" }, "wrong-secret");
    expect(extractWalletFromToken(token, SECRET)).toBeNull();
  });

  it("returns null when sub claim is missing", () => {
    const token = jwt.sign({ foo: "bar" }, SECRET, { expiresIn: "1h" });
    expect(extractWalletFromToken(token, SECRET)).toBeNull();
  });

  it("returns null when sub claim is empty string", () => {
    const token = jwt.sign({ sub: "" }, SECRET, { expiresIn: "1h" });
    expect(extractWalletFromToken(token, SECRET)).toBeNull();
  });

  it("never throws", () => {
    expect(extractWalletFromToken("not.a.jwt", SECRET)).toBeNull();
    expect(extractWalletFromToken(undefined, "")).toBeNull();
  });
});
