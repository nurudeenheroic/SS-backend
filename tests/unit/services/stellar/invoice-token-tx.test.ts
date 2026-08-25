import { Address, nativeToScVal, scValToNative, xdr } from "stellar-sdk";
import { InvoiceTokenContractService } from "../../../../src/services/stellar/invoice-token-contract.service";

describe("InvoiceTokenContractService - buildMintTx", () => {
  const TOKEN_CONTRACT_ID = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";
  const TEST_RECIPIENT = "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI";

  let service: InvoiceTokenContractService;

  beforeEach(() => {
    service = new InvoiceTokenContractService(TOKEN_CONTRACT_ID);
  });

  it("should initialize with correct contract ID", () => {
    expect(service.contractId).toBe(TOKEN_CONTRACT_ID);
  });

  it("should throw an error when contractId is empty", () => {
    expect(() => new InvoiceTokenContractService("")).toThrow(
      "contractId is required.",
    );
  });

  it("should construct a valid InvokeHostFunction operation", () => {
    const tokenAmount = 50_000_000n;
    const op = service.buildMintTx(TEST_RECIPIENT, tokenAmount);

    expect(op).toBeDefined();
    const opBody = op.body();
    expect(opBody.switch().name).toBe("invokeHostFunction");
  });

  it("should target the exact configured TOKEN_CONTRACT_ID", () => {
    const tokenAmount = 100_000n;
    const op = service.buildMintTx(TEST_RECIPIENT, tokenAmount);

    const invokeHostFunctionOp = op.body().invokeHostFunctionOp();
    const hostFunction = invokeHostFunctionOp.hostFunction();

    expect(hostFunction.switch().name).toBe(
      "hostFunctionTypeHostFunctionTypeInvokeContract",
    );

    const invokeContractArgs = hostFunction.invokeContract();
    const contractAddressScVal = invokeContractArgs.contractAddress();
    const contractAddress = Address.fromScVal(contractAddressScVal).toString();

    expect(contractAddress).toBe(TOKEN_CONTRACT_ID);
  });

  it("should serialize the mint function name and ScVal arguments properly", () => {
    const tokenAmount = 750_000n;
    const op = service.buildMintTx(TEST_RECIPIENT, tokenAmount);

    const invokeContractArgs = op
      .body()
      .invokeHostFunctionOp()
      .hostFunction()
      .invokeContract();

    // Verify function name
    const functionName = invokeContractArgs.functionName().toString();
    expect(functionName).toBe("mint");

    // Verify args length: [recipient, amount]
    const args = invokeContractArgs.args();
    expect(args).toHaveLength(2);

    // Verify recipient Address ScVal serialization
    const recipientScVal = args[0];
    expect(Address.fromScVal(recipientScVal).toString()).toBe(TEST_RECIPIENT);

    // Verify token amount i128 ScVal serialization
    const amountScVal = args[1];
    expect(amountScVal.switch().name).toBe("scvI128");
    const nativeAmount = scValToNative(amountScVal);
    expect(BigInt(nativeAmount)).toBe(tokenAmount);
  });

  it("should accept bigint, number, and string token amounts", () => {
    const amountFromBigInt = service.buildMintTx(TEST_RECIPIENT, 1_000_000n);
    const amountFromNumber = service.buildMintTx(TEST_RECIPIENT, 1_000_000);
    const amountFromString = service.buildMintTx(TEST_RECIPIENT, "1000000");

    const getAmount = (operation: xdr.Operation) => {
      const args = operation
        .body()
        .invokeHostFunctionOp()
        .hostFunction()
        .invokeContract()
        .args();
      return BigInt(scValToNative(args[1]));
    };

    expect(getAmount(amountFromBigInt)).toBe(1_000_000n);
    expect(getAmount(amountFromNumber)).toBe(1_000_000n);
    expect(getAmount(amountFromString)).toBe(1_000_000n);
  });

  it("should handle boundary amounts such as zero and large 128-bit values", () => {
    const zeroAmount = 0n;
    const largeAmount = 18446744073709551615000000n;

    const opZero = service.buildMintTx(TEST_RECIPIENT, zeroAmount);
    const opLarge = service.buildMintTx(TEST_RECIPIENT, largeAmount);

    const getAmount = (operation: xdr.Operation) => {
      const args = operation
        .body()
        .invokeHostFunctionOp()
        .hostFunction()
        .invokeContract()
        .args();
      return BigInt(scValToNative(args[1]));
    };

    expect(getAmount(opZero)).toBe(zeroAmount);
    expect(getAmount(opLarge)).toBe(largeAmount);
  });

  it("should reject invalid recipient Stellar address strings", () => {
    expect(() => service.buildMintTx("INVALID_STELLAR_ADDRESS", 1000n)).toThrow();
  });
});
