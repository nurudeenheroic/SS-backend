import { DataSource } from "typeorm";
import request from "supertest";
import express from "express";
import jwt from "jsonwebtoken";
import { User } from "../../src/models/User.model";
import { Invoice } from "../../src/models/Invoice.model";
import { Investment } from "../../src/models/Investment.model";
import { Transaction } from "../../src/models/Transaction.model";
import { KYCVerification } from "../../src/models/KYCVerification.model";
import { Notification } from "../../src/models/Notification.model";
import { AuthChallenge } from "../../src/models/AuthChallenge.model";
import { UserType, KYCStatus, InvoiceStatus } from "../../src/types/enums";
import { createInvoiceRouter } from "../../src/routes/invoice.routes";
import { createInvoiceService } from "../../src/services/invoice.service";
import { createIPFSService } from "../../src/services/ipfs.service";
import { createErrorMiddleware } from "../../src/middleware/error.middleware";
import { logger } from "../../src/observability/logger";

describe("Invoice Publish KYC Integration Test", () => {
  let dataSource: DataSource;
  let app: express.Application;
  let sellerPendingKYC: User;
  let sellerApprovedKYC: User;
  let sellerRejectedKYC: User;
  let invoice: Invoice;

  const mockConfig = {
    ipfs: {
      apiUrl: "https://api.pinata.cloud",
      jwt: "test-jwt",
      maxFileSizeMB: 10,
      allowedMimeTypes: ["application/pdf"],
      uploadRateLimit: { windowMs: 900000, maxUploads: 10 },
    },
    kyc: {
      skipVerification: false, // KYC is enforced
    },
  };

  beforeAll(async () => {
    // Set up in-memory SQLite database
    dataSource = new DataSource({
      type: "sqlite",
      database: ":memory:",
      entities: [
        User,
        Invoice,
        Investment,
        Transaction,
        KYCVerification,
        Notification,
        AuthChallenge,
      ],
      synchronize: true,
      logging: false,
    });

    await dataSource.initialize();

    // Create test users with different KYC statuses
    const userRepository = dataSource.getRepository(User);

    sellerPendingKYC = await userRepository.save(
      userRepository.create({
        stellarAddress: "GPENDING123",
        email: "pending@test.com",
        userType: UserType.SELLER,
        kycStatus: KYCStatus.PENDING,
      })
    );

    sellerRejectedKYC = await userRepository.save(
      userRepository.create({
        stellarAddress: "GREJECTED123",
        email: "rejected@test.com",
        userType: UserType.SELLER,
        kycStatus: KYCStatus.REJECTED,
      })
    );

    sellerApprovedKYC = await userRepository.save(
      userRepository.create({
        stellarAddress: "GAPPROVED123",
        email: "approved@test.com",
        userType: UserType.SELLER,
        kycStatus: KYCStatus.APPROVED,
      })
    );

    // Create test invoice for pending KYC seller
    const invoiceRepository = dataSource.getRepository(Invoice);
    invoice = await invoiceRepository.save(
      invoiceRepository.create({
        sellerId: sellerPendingKYC.id,
        invoiceNumber: "TEST-INV-001",
        customerName: "Test Customer",
        amount: "1000.0000",
        discountRate: "10.00",
        netAmount: "900.0000",
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days in future
        status: InvoiceStatus.DRAFT,
      })
    );

    // Set up Express app
    process.env.JWT_SECRET = "test-secret";
    const ipfsService = createIPFSService(mockConfig.ipfs, logger);
    const invoiceService = createInvoiceService(dataSource, ipfsService);

    app = express();
    app.use(express.json());
    app.use("/api/v1/invoices", createInvoiceRouter({ invoiceService, config: mockConfig as any }));
    app.use(createErrorMiddleware(logger));
  });

  afterAll(async () => {
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy();
    }
    delete process.env.JWT_SECRET;
  });

  beforeEach(() => {
    if (!dataSource || !dataSource.isInitialized) {
      return;
    }
  });

  describe("POST /api/v1/invoices/:id/publish", () => {
    it("should return 403 for seller with KYC status pending", async () => {
      if (!dataSource || !dataSource.isInitialized) {
        console.warn("Skipping test - DATABASE_URL not configured");
        return;
      }
      const token = jwt.sign(
        { sub: sellerPendingKYC.id, stellarAddress: sellerPendingKYC.stellarAddress },
        "test-secret"
      );

      const response = await request(app)
        .post(`/api/v1/invoices/${invoice.id}/publish`)
        .set("Authorization", `Bearer ${token}`)
        .expect(403);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          message: expect.stringContaining("KYC"),
        },
      });
    });

    it("should return 403 for seller with KYC status rejected", async () => {
      if (!dataSource || !dataSource.isInitialized) {
        console.warn("Skipping test - DATABASE_URL not configured");
        return;
      }
      // Create invoice for rejected seller
      const invoiceRepository = dataSource.getRepository(Invoice);
      const rejectedInvoice = await invoiceRepository.save(
        invoiceRepository.create({
          sellerId: sellerRejectedKYC.id,
          invoiceNumber: "TEST-INV-002",
          customerName: "Test Customer",
          amount: "1000.0000",
          discountRate: "10.00",
          netAmount: "900.0000",
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days in future
          status: InvoiceStatus.DRAFT,
        })
      );

      const token = jwt.sign(
        { sub: sellerRejectedKYC.id, stellarAddress: sellerRejectedKYC.stellarAddress },
        "test-secret"
      );

      const response = await request(app)
        .post(`/api/v1/invoices/${rejectedInvoice.id}/publish`)
        .set("Authorization", `Bearer ${token}`)
        .expect(403);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          message: expect.stringContaining("KYC"),
        },
      });
    });

    it("should return 403 response body that identifies KYC as the blocking reason", async () => {
      if (!dataSource || !dataSource.isInitialized) {
        console.warn("Skipping test - DATABASE_URL not configured");
        return;
      }
      const token = jwt.sign(
        { sub: sellerPendingKYC.id, stellarAddress: sellerPendingKYC.stellarAddress },
        "test-secret"
      );

      const response = await request(app)
        .post(`/api/v1/invoices/${invoice.id}/publish`)
        .set("Authorization", `Bearer ${token}`)
        .expect(403);

      // Response should explicitly mention KYC approval requirement
      expect(response.body.error.message).toMatch(/KYC approval/i);
    });

    it("should succeed (200) for seller with approved KYC", async () => {
      if (!dataSource || !dataSource.isInitialized) {
        console.warn("Skipping test - DATABASE_URL not configured");
        return;
      }
      // Create invoice for approved seller
      const invoiceRepository = dataSource.getRepository(Invoice);
      const approvedInvoice = await invoiceRepository.save(
        invoiceRepository.create({
          sellerId: sellerApprovedKYC.id,
          invoiceNumber: "TEST-INV-003",
          customerName: "Test Customer",
          amount: "1000.0000",
          discountRate: "10.00",
          netAmount: "900.0000",
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days in future
          status: InvoiceStatus.DRAFT,
        })
      );

      const token = jwt.sign(
        { sub: sellerApprovedKYC.id, stellarAddress: sellerApprovedKYC.stellarAddress },
        "test-secret"
      );

      const response = await request(app)
        .post(`/api/v1/invoices/${approvedInvoice.id}/publish`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          id: approvedInvoice.id,
          status: InvoiceStatus.PUBLISHED,
        },
      });

      // Verify the invoice status in the database
      const updatedInvoice = await invoiceRepository.findOne({
        where: { id: approvedInvoice.id },
      });
      expect(updatedInvoice?.status).toBe(InvoiceStatus.PUBLISHED);
    });

    it("should allow publish after KYC is approved", async () => {
      if (!dataSource || !dataSource.isInitialized) {
        console.warn("Skipping test - DATABASE_URL not configured");
        return;
      }
      // Update seller's KYC status to approved
      const userRepository = dataSource.getRepository(User);
      sellerPendingKYC.kycStatus = KYCStatus.APPROVED;
      await userRepository.save(sellerPendingKYC);

      const token = jwt.sign(
        { sub: sellerPendingKYC.id, stellarAddress: sellerPendingKYC.stellarAddress },
        "test-secret"
      );

      const response = await request(app)
        .post(`/api/v1/invoices/${invoice.id}/publish`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          status: InvoiceStatus.PUBLISHED,
        },
      });
    });
  });
});
