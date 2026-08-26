import crypto from "crypto";
import { DataSource } from "typeorm";
import { WebhookSubscription } from "../models/WebhookSubscription.model";
import { WebhookDeliveryLog } from "../models/WebhookDeliveryLog.model";
import { logger, type AppLogger } from "../observability/logger";

export function generateWebhookSignature(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export interface WebhookDispatchResult { subscriptionId: string; delivered: boolean; attempts: number; responseStatus: number | null; }

export class WebhookDispatcherService {
  constructor(private readonly dataSource: DataSource, private readonly appLogger: AppLogger = logger) {}

  async dispatchWebhookEvent(eventType: string, payload: unknown): Promise<WebhookDispatchResult[]> {
    const subscriptions = await this.dataSource.getRepository(WebhookSubscription).find({ where: { active: true } });
    const body = JSON.stringify({ eventType, payload });
    const eligible = subscriptions.filter((subscription) => subscription.eventTypes.includes(eventType));
    return Promise.all(eligible.map((subscription) => this.deliver(subscription, eventType, body)));
  }

  private async deliver(subscription: WebhookSubscription, eventType: string, body: string): Promise<WebhookDispatchResult> {
    let lastStatus: number | null = null;
    let lastError: string | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const response = await fetch(subscription.url, {
          method: "POST",
          headers: { "content-type": "application/json", "x-signature": generateWebhookSignature(body, subscription.secret) },
          body,
          signal: controller.signal,
        });
        clearTimeout(timer);
        lastStatus = response.status;
        const delivered = response.status >= 200 && response.status < 300;
        await this.logDelivery(subscription.id, eventType, attempt, response.status, delivered, delivered ? null : `HTTP ${response.status}`);
        if (delivered) return { subscriptionId: subscription.id, delivered: true, attempts: attempt, responseStatus: response.status };
        lastError = `HTTP ${response.status}`;
      } catch (error) {
        lastError = error instanceof Error ? error.message : "Webhook request failed";
        await this.logDelivery(subscription.id, eventType, attempt, lastStatus, false, lastError);
      }
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** (attempt - 1)));
    }
    this.appLogger.warn("webhook.delivery.failed", { subscription_id: subscription.id, event_type: eventType, status: lastStatus, error: lastError });
    return { subscriptionId: subscription.id, delivered: false, attempts: 3, responseStatus: lastStatus };
  }

  private async logDelivery(subscriptionId: string, eventType: string, attempt: number, responseStatus: number | null, delivered: boolean, errorMessage: string | null): Promise<void> {
    await this.dataSource.getRepository(WebhookDeliveryLog).save({ subscriptionId, eventType, attempt, responseStatus, delivered, errorMessage });
    this.appLogger.info("webhook.delivery.attempt", { subscription_id: subscriptionId, event_type: eventType, attempt, response_status: responseStatus, delivered });
  }
}

export function createWebhookDispatcherService(dataSource: DataSource, appLogger?: AppLogger): WebhookDispatcherService {
  return new WebhookDispatcherService(dataSource, appLogger);
}
