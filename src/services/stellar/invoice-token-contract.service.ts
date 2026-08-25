import { Contract, Address, nativeToScVal, xdr } from "stellar-sdk";

export class InvoiceTokenContractService {
  private readonly contract: Contract;
  readonly contractId: string;

  constructor(contractId: string) {
    if (!contractId) {
      throw new Error("contractId is required.");
    }
    this.contractId = contractId;
    this.contract = new Contract(contractId);
  }

  /**
   * Build the Soroban contract invocation operation for minting SEP-41 invoice tokens.
   *
   * @param recipientAddress Stellar address receiving the minted tokens
   * @param tokenAmount Token amount formatted as i128 (bigint, number, or string)
   * @returns xdr.Operation configured for host function contract invocation
   */
  public buildMintTx(
    recipientAddress: string,
    tokenAmount: bigint | number | string,
  ): xdr.Operation {
    const toScVal = new Address(recipientAddress).toScVal();
    const amountBigInt =
      typeof tokenAmount === "bigint" ? tokenAmount : BigInt(tokenAmount);
    const amountScVal = nativeToScVal(amountBigInt, { type: "i128" });

    return this.contract.call("mint", toScVal, amountScVal);
  }
}
