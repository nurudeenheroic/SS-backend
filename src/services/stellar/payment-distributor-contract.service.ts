import { Contract, Address, nativeToScVal, xdr, SorobanRpc } from "stellar-sdk";
import type { AppLogger } from "../../observability/logger";
import { logger as globalLogger } from "../../observability/logger";

/**
 * A single payout leg: an on-chain destination and the amount (in stroops)
 * it should receive out of a settlement's proceeds.
 */
export interface PayoutRecipient {
  address: string;
  amountStroops: bigint | number | string;
}

export interface PaymentDistributorContractServiceDependencies {
  contractId: string;
  rpcUrl?: string;
  networkPassphrase?: string;
  platformSecretKey?: string;
  server?: SorobanRpc.Server;
  logger?: AppLogger;
}

const MAX_FEE_BPS = 10_000;

/**
 * Encodes Soroban contract calls for the on-chain payment distributor
 * contract, which fans a settlement's proceeds out across sellers,
 * investors, and the platform fee account in a single transaction.
 *
 * Minimal implementation covering `buildDistributePayoutsTx` only (#156).
 * `createEscrowOnChain`-style orchestration (structured completion logging,
 * simulate/submit helpers) intentionally mirrors
 * `InvoiceEscrowContractService`'s shape so a fuller implementation can be
 * layered on without a breaking change to this constructor/method surface.
 */
export class PaymentDistributorContractService {
  private readonly contract: Contract;
  readonly contractId: string;
  private readonly rpcServer?: SorobanRpc.Server;
  private readonly networkPassphrase?: string;
  private readonly platformSecretKey?: string;
  private readonly logger: AppLogger;

  constructor(
    dependenciesOrContractId: string | PaymentDistributorContractServiceDependencies,
    logger?: AppLogger,
  ) {
    if (typeof dependenciesOrContractId === "string") {
      if (!dependenciesOrContractId) {
        throw new Error("contractId is required.");
      }
      this.contractId = dependenciesOrContractId;
      this.contract = new Contract(dependenciesOrContractId);
      this.logger = logger ?? globalLogger;
    } else {
      if (!dependenciesOrContractId.contractId) {
        throw new Error("contractId is required.");
      }
      this.contractId = dependenciesOrContractId.contractId;
      this.contract = new Contract(dependenciesOrContractId.contractId);
      this.networkPassphrase = dependenciesOrContractId.networkPassphrase;
      this.platformSecretKey = dependenciesOrContractId.platformSecretKey;
      if (dependenciesOrContractId.server) {
        this.rpcServer = dependenciesOrContractId.server;
      } else if (dependenciesOrContractId.rpcUrl) {
        this.rpcServer = new SorobanRpc.Server(dependenciesOrContractId.rpcUrl, {
          allowHttp: dependenciesOrContractId.rpcUrl.startsWith("http://"),
        });
      }
      this.logger = dependenciesOrContractId.logger ?? logger ?? globalLogger;
    }
  }

  /**
   * Builds the Soroban contract invocation operation for fanning a
   * settlement's proceeds out to every recipient (sellers, investors) plus
   * the platform fee account, in a single `distribute_payouts` call.
   *
   * @param invoiceId The settled invoice this distribution is for.
   * @param recipients Non-empty list of (address, amountStroops) payout legs.
   * @param platformFeeAccount The platform's fee-collection Stellar address.
   * @param feeBps Platform fee in basis points (0-10000) applied on-chain.
   *
   * @throws if recipients is empty, or feeBps is not an integer in [0, 10000].
   */
  public buildDistributePayoutsTx(
    invoiceId: string,
    recipients: PayoutRecipient[],
    platformFeeAccount: string,
    feeBps: number,
  ): xdr.Operation {
    if (recipients.length === 0) {
      throw new Error("At least one payout recipient is required.");
    }
    if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > MAX_FEE_BPS) {
      throw new Error(`feeBps must be an integer between 0 and ${MAX_FEE_BPS}.`);
    }

    const recipientAddressesScVal = xdr.ScVal.scvVec(
      recipients.map((recipient) => new Address(recipient.address).toScVal()),
    );

    const recipientAmountsScVal = xdr.ScVal.scvVec(
      recipients.map((recipient) => {
        const amountBigInt =
          typeof recipient.amountStroops === "bigint"
            ? recipient.amountStroops
            : BigInt(recipient.amountStroops);
        return nativeToScVal(amountBigInt, { type: "i128" });
      }),
    );

    return this.contract.call(
      "distribute_payouts",
      nativeToScVal(invoiceId, { type: "symbol" }),
      recipientAddressesScVal,
      recipientAmountsScVal,
      new Address(platformFeeAccount).toScVal(),
      nativeToScVal(feeBps, { type: "u32" }),
    );
  }
}
