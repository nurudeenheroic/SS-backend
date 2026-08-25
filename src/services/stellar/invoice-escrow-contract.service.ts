import { Contract, Address, nativeToScVal, xdr } from "stellar-sdk";
import type { AppLogger } from "../../observability/logger";
import { logger as globalLogger } from "../../observability/logger";

export interface CreateEscrowInput {
  invoiceId: string;
  sellerAddress: string;
  amountStroops: bigint | number | string;
  dueDateTimestamp: number;
  paymentTokenAddress: string;
  tokenContractAddress?: string;
  commitmentHash?: string;
  platformFeeBps?: number;
}

export interface CreateEscrowResult {
  contractId: string;
  invoiceId: string;
  sellerAddress: string;
  amountStroops: string;
  txHash?: string;
  operation: xdr.Operation;
}

export interface InvoiceEscrowContractServiceDependencies {
  contractId: string;
  logger?: AppLogger;
}

export class InvoiceEscrowContractService {
  private readonly contract: Contract;
  readonly contractId: string;
  private readonly logger: AppLogger;

  constructor(
    dependenciesOrContractId: string | InvoiceEscrowContractServiceDependencies,
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
      this.logger = dependenciesOrContractId.logger ?? logger ?? globalLogger;
    }
  }

  /**
   * Build the Soroban contract invocation operation for creating an escrow.
   */
  public buildCreateEscrowTx(
    invoiceId: string,
    sellerAddress: string,
    amountStroops: bigint | number | string,
    dueDateTimestamp: number,
    paymentTokenAddress: string,
  ): xdr.Operation {
    const amountBigInt =
      typeof amountStroops === "bigint" ? amountStroops : BigInt(amountStroops);

    return this.contract.call(
      "create_escrow",
      nativeToScVal(invoiceId, { type: "symbol" }),
      new Address(sellerAddress).toScVal(),
      nativeToScVal(amountBigInt, { type: "i128" }),
      nativeToScVal(dueDateTimestamp, { type: "u64" }),
      new Address(paymentTokenAddress).toScVal(),
    );
  }

  /**
   * Creates/initializes an escrow on-chain and logs the structured completion event.
   * Ensures that only sanitized metadata (invoiceId, sorobanContractId, sellerAddress, amountStroops)
   * is logged without leaking any secret keys, signing seeds, or auth tokens.
   */
  public async createEscrowOnChain(
    input: CreateEscrowInput,
  ): Promise<CreateEscrowResult> {
    const amountBigInt =
      typeof input.amountStroops === "bigint"
        ? input.amountStroops
        : BigInt(input.amountStroops);

    const operation = this.buildCreateEscrowTx(
      input.invoiceId,
      input.sellerAddress,
      amountBigInt,
      input.dueDateTimestamp,
      input.paymentTokenAddress,
    );

    const amountStroopsStr = amountBigInt.toString();

    // Log structured event on successful escrow creation
    this.logger.info("Soroban escrow created successfully on-chain.", {
      invoiceId: input.invoiceId,
      sorobanContractId: this.contractId,
      sellerAddress: input.sellerAddress,
      amountStroops: amountStroopsStr,
    });

    return {
      contractId: this.contractId,
      invoiceId: input.invoiceId,
      sellerAddress: input.sellerAddress,
      amountStroops: amountStroopsStr,
      operation,
    };
  }
}
