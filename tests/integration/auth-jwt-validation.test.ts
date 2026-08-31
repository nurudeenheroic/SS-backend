import crypto from "crypto";
import jwt from "jsonwebtoken";
import { Networks } from "stellar-sdk";
import request from "supertest";

import { createApp } from "../../src/app";
import { AuthService } from "../../src/services/auth.service";
import type {
  ChallengeRepositoryContract,
  UserRepositoryContract,
} from "../../src/services/auth.service";
import { User } from "../../src/models/User.model";
import { KYCStatus, UserType } from "../../src/types/enums";

// ── In-memory repositories ────────────────────────────────────────────────────

type InMemoryUser = User;

interface InMemoryChallenge {
  id: string;
  stellarAddress: string;
  nonceHash: string;
  message: string;
  network: string;
  issuedAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
}

class InMemoryUserRepository implements UserRepositoryContract {
  private readonly users = new Map<string, InMemoryUser>();

  async findById(id: string) {
    return this.users.get(id) ?? null;
  }

  async findByStellarAddress(stellarAddress: string) {
    return (
      [...this.users.values()].find(
        (user) => user.stellarAddress === stellarAddress,
      ) ?? null
    );
  }

  async save(user: Partial<InMemoryUser>) {
    const now = new Date();
    const entity: InMemoryUser = {
      id: crypto.randomUUID(),
      stellarAddress: user.stellarAddress ?? "",
      email: user.email ?? null,
      userType: user.userType ?? UserType.INVESTOR,
      kycStatus: user.kycStatus ?? KYCStatus.PENDING,
      isKycVerified: user.isKycVerified ?? false,
      createdAt: user.createdAt ?? now,
      updatedAt: user.updatedAt ?? now,
      deletedAt: user.deletedAt ?? null,
      invoices: user.invoices ?? [],
      investments: user.investments ?? [],
      transactions: user.transactions ?? [],
      kycVerifications: user.kycVerifications ?? [],
      notifications: user.notifications ?? [],
    };

    this.users.set(entity.id, entity);
    return entity;
  }
}

class InMemoryChallengeRepository implements ChallengeRepositoryContract {
  readonly challenges = new Map<string, InMemoryChallenge>();

  async create(input: InMemoryChallenge) {
    const challenge: InMemoryChallenge = {
      id: crypto.randomUUID(),
      stellarAddress: input.stellarAddress,
      nonceHash: input.nonceHash,
      message: input.message,
      network: input.network,
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt,
      consumedAt: null,
    };

    this.challenges.set(challenge.id, challenge);
    return challenge;
  }

  async findByAddressAndNonceHash(stellarAddress: string, nonceHash: string) {
    return (
      [...this.challenges.values()].find(
        (challenge) =>
          challenge.stellarAddress === stellarAddress &&
          challenge.nonceHash === nonceHash,
      ) ?? null
    );
  }

  async consume(id: string, consumedAt: Date) {
    const challenge = this.challenges.get(id);

    if (!challenge || challenge.consumedAt) {
      return false;
    }

    challenge.consumedAt = consumedAt;
    return true;
  }
}

// ── Test helpers ──────────────────────────────────────────────────────────────

const VALID_JWT_SECRET = "valid-test-secret";

function createTestApp() {
  const authService = new AuthService({
    userRepository: new InMemoryUserRepository(),
    challengeRepository: new InMemoryChallengeRepository(),
    config: {
      jwt: {
        secret: VALID_JWT_SECRET,
        expiresIn: "15m",
      },
      auth: {
        challengeTtlMs: 60_000,
      },
      stellar: {
        network: "testnet",
        networkPassphrase: Networks.TESTNET,
      },
    },
  });

  return createApp({ authService });
}

/**
 * Every case in this file asserts a rejection on GET /api/v1/auth/me and never
 * creates a user, so the app carries no per-test state. Build it once and reuse
 * it — this removes ~25 redundant AuthService/Express constructions from the run.
 */
let app: ReturnType<typeof createTestApp>;

beforeAll(() => {
  app = createTestApp();
});

/**
 * Build a signed token without repeating the claim/option boilerplate.
 * Defaults to the app's real secret and a 15m expiry; override `secret` to
 * forge, or pass `expiresIn` / `algorithm` / `notBefore` for the edge cases.
 */
function signToken(
  payload: Record<string, unknown>,
  overrides: jwt.SignOptions & { secret?: string } = {},
): string {
  const { secret = VALID_JWT_SECRET, ...options } = overrides;
  return jwt.sign(payload, secret, { expiresIn: "15m", ...options });
}

/** Base claims for a well-formed token; override per case. */
function claims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sub: "GTESTSUBJECT",
    stellarAddress: "GTESTSUBJECT",
    userId: crypto.randomUUID(),
    ...overrides,
  };
}

/** Issue GET /api/v1/auth/me with the given Authorization header value. */
function getMe(authorization?: string) {
  const req = request(app).get("/api/v1/auth/me");
  return authorization === undefined ? req : req.set("Authorization", authorization);
}

/**
 * Canonical middleware / auth-service messages (see src/middleware/auth.middleware.ts
 * and src/services/auth.service.ts#getCurrentUser). Every failure mode still
 * returns 401 with the standard envelope; only the message differentiates them.
 */
const INVALID_TOKEN_MESSAGE = "Invalid or expired token."; // unverifiable / undecodable token
const INVALID_PAYLOAD_MESSAGE = "Invalid token payload."; // verified token, missing/empty sub
const UNKNOWN_USER_MESSAGE = "User no longer exists."; // verified token, sub resolves to no user
const MISSING_TOKEN_MESSAGE = "Authorization token is required."; // no usable Bearer credential

/**
 * Assert the standard 401 rejection envelope. Centralising this keeps every
 * case checking the same contract — status, `success:false`, a string
 * `error.message`, and no `data` leak — so an envelope regression fails once
 * and loudly instead of in whichever test happened to run first.
 */
function expectRejected(
  response: Awaited<ReturnType<typeof getMe>>,
  expectedMessage?: string,
): void {
  expect(response.status).toBe(401);
  expect(response.body).toHaveProperty("success", false);
  expect(response.body).toHaveProperty("error");
  expect(typeof response.body.error?.message).toBe("string");
  expect(response.body).not.toHaveProperty("data");
  if (expectedMessage !== undefined) {
    expect(response.body.error.message).toBe(expectedMessage);
  }
}

// Hand-rolled tokens that jsonwebtoken cannot produce directly.
function twoSegmentToken(): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ sub: "GTESTADDRESS", stellarAddress: "GTESTADDRESS" }),
  ).toString("base64url");
  return `${header}.${payload}`;
}

function undecodablePayloadToken(): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  return `${header}.!!!invalid-base64!!!.signature`;
}

function algSwitchToken(): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub: "GTAMPEREDADDR",
      stellarAddress: "GTAMPEREDADDR",
      userId: crypto.randomUUID(),
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 900,
    }),
  ).toString("base64url");
  const signature = crypto
    .createHmac("sha256", "wrong-secret")
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("JWT validation: rejects invalid tokens with a 401 envelope", () => {
  // [label, tokenFactory, expectedMessage]
  const cases: Array<[string, () => string, string]> = [
    ["signed with an unknown secret key", () => signToken(claims(), { secret: "invalid-secret-key" }), INVALID_TOKEN_MESSAGE],
    [
      "signed with a different HS256 secret",
      () => signToken(claims(), { secret: "completely-different-secret", algorithm: "HS256" }),
      INVALID_TOKEN_MESSAGE,
    ],
    ["expired", () => signToken(claims(), { expiresIn: "-5m" }), INVALID_TOKEN_MESSAGE],
    ["not yet valid (nbf set in the future)", () => signToken(claims(), { notBefore: "1h" }), INVALID_TOKEN_MESSAGE],
    ["signed with the 'none' algorithm", () => signToken(claims(), { secret: "", algorithm: "none" }), INVALID_TOKEN_MESSAGE],
    ["a completely random non-JWT string", () => "not-a-jwt-at-all", INVALID_TOKEN_MESSAGE],
    ["missing its signature segment", twoSegmentToken, INVALID_TOKEN_MESSAGE],
    ["carrying an undecodable base64url payload", undecodablePayloadToken, INVALID_TOKEN_MESSAGE],
    ["header alg-switched and re-signed with the wrong key", algSwitchToken, INVALID_TOKEN_MESSAGE],
    [
      "verified but missing the sub claim",
      () => signToken({ stellarAddress: "GNOSUBCLAIM", userId: crypto.randomUUID() }),
      INVALID_PAYLOAD_MESSAGE,
    ],
    ["verified but carrying an empty sub claim", () => signToken(claims({ sub: "", stellarAddress: "" })), INVALID_PAYLOAD_MESSAGE],
    ["verified but carrying a non-string sub claim", () => signToken(claims({ sub: 12345 })), UNKNOWN_USER_MESSAGE],
    [
      "verified and well-formed but for a user that does not exist",
      () => signToken(claims({ sub: "GNONEXISTENTUSERADDRESS", stellarAddress: "GNONEXISTENTUSERADDRESS" })),
      UNKNOWN_USER_MESSAGE,
    ],
    [
      "verified, long-lived, but for a user that does not exist",
      () =>
        signToken(
          claims({ sub: "GLONGVALIDTOKEN", stellarAddress: "GLONGVALIDTOKEN" }),
          { expiresIn: "365d" },
        ),
      UNKNOWN_USER_MESSAGE,
    ],
  ];

  it.each(cases)("rejects a token %s", async (_label, makeToken, expectedMessage) => {
    const response = await getMe(`Bearer ${makeToken()}`);
    expectRejected(response, expectedMessage);
  });
});

describe("JWT validation: rejects missing or non-Bearer credentials", () => {
  const validToken = signToken(claims());

  const cases: Array<[string, string | undefined]> = [
    ["no Authorization header is sent", undefined],
    ["the bearer value is empty", "Bearer "],
    ["the scheme is a lowercase 'bearer'", `bearer ${validToken}`],
    ["there is no scheme prefix", validToken],
    ["the scheme is 'Token' instead of 'Bearer'", `Token ${validToken}`],
  ];

  it.each(cases)("returns the missing-token 401 when %s", async (_label, authorization) => {
    const response = await getMe(authorization);
    expectRejected(response, MISSING_TOKEN_MESSAGE);
  });

  it("rejects (401) a Bearer value padded with surrounding whitespace", async () => {
    // Implementations differ on whether the padding is trimmed before verify;
    // only the rejection envelope is guaranteed here.
    const response = await getMe(`Bearer   ${validToken}   `);
    expectRejected(response);
  });
});

describe("JWT validation: error envelope shape", () => {
  it("uses { success:false, error:{ message } } for a forged token", async () => {
    const response = await getMe(`Bearer ${signToken(claims(), { secret: "wrong-secret" })}`);
    expectRejected(response, INVALID_TOKEN_MESSAGE);
  });

  it("uses the same envelope when no Authorization header is sent", async () => {
    const response = await getMe();
    expectRejected(response, MISSING_TOKEN_MESSAGE);
  });

  it("always answers 401 (never 403 or 500) across a sample of invalid tokens", async () => {
    const tokens = [
      signToken(claims(), { secret: "wrong" }),
      signToken(claims(), { expiresIn: "-1m" }),
      "not-a-jwt",
    ];

    for (const token of tokens) {
      const response = await getMe(`Bearer ${token}`);
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    }
  });
});
