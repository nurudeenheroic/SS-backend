import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Entity("webhook_delivery_logs")
export class WebhookDeliveryLog {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column({ name: "subscription_id", type: "uuid" }) @Index("idx_webhook_delivery_logs_subscription_id") subscriptionId!: string;
  @Column({ name: "event_type", type: "varchar", length: 100 }) eventType!: string;
  @Column({ name: "attempt", type: "integer" }) attempt!: number;
  @Column({ name: "response_status", type: "integer", nullable: true }) responseStatus!: number | null;
  @Column({ name: "delivered", type: "boolean" }) delivered!: boolean;
  @Column({ name: "error_message", type: "text", nullable: true }) errorMessage!: string | null;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" }) createdAt!: Date;
}
