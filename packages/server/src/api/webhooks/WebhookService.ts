import { Webhook, WebhookEvent } from '@opencall/core';
import * as crypto from 'crypto';
import { logger } from '../../utils/logger';
import { AuditLogger } from '../../audit/AuditLogger';
import postgres from 'postgres';
import IORedis from 'ioredis';

interface WebhookPayload {
  event: WebhookEvent;
  data: any;
  timestamp: Date;
  organizationId: string;
}

interface WebhookDelivery {
  id: string;
  webhookId: string;
  payload: WebhookPayload;
  status: 'pending' | 'success' | 'failed';
  attempts: number;
  lastAttemptAt?: Date;
  responseStatus?: number;
  responseBody?: string;
  error?: string;
}

export class WebhookService {
  private deliveryQueue: string = 'webhook:deliveries';
  private maxRetries: number = 3;
  private retryDelays: number[] = [1000, 5000, 15000]; // ms

  constructor(
    private auditLogger: AuditLogger,
    private postgresClient: postgres.Sql,
    private redisClient: IORedis
  ) {
    this.startDeliveryWorker();
  }

  async triggerWebhook(
    organizationId: string,
    event: WebhookEvent,
    data: any
  ): Promise<void> {
    // Get all active webhooks for this event
    const webhooks = await this.postgresClient`
      SELECT * FROM webhooks
      WHERE organization_id = ${organizationId}
        AND enabled = true
        AND events @> ${[event]}
    `;

    const payload: WebhookPayload = {
      event,
      data,
      timestamp: new Date(),
      organizationId,
    };

    // Queue deliveries for each webhook
    for (const webhook of webhooks) {
      await this.queueDelivery(webhook, payload);
    }

    logger.info(`Triggered ${webhooks.length} webhooks for event ${event}`);
  }

  private async queueDelivery(
    webhook: Webhook,
    payload: WebhookPayload
  ): Promise<void> {
    const delivery: WebhookDelivery = {
      id: crypto.randomUUID(),
      webhookId: webhook.id,
      payload,
      status: 'pending',
      attempts: 0,
    };

    // Store delivery record
    await this.postgresClient`
      INSERT INTO webhook_deliveries ${this.postgresClient(delivery)}
    `;

    // Queue for processing
    await this.redisClient.lpush(
      this.deliveryQueue,
      JSON.stringify({ webhookId: webhook.id, deliveryId: delivery.id })
    );
  }

  private async startDeliveryWorker(): Promise<void> {
    while (true) {
      try {
        // Block and wait for new deliveries
        const item = await this.redisClient.brpop(this.deliveryQueue, 1);
        if (!item) continue;

        const { webhookId, deliveryId } = JSON.parse(item[1]);
        await this.processDelivery(webhookId, deliveryId);
      } catch (error) {
        logger.error('Webhook delivery worker error', error);
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait before retry
      }
    }
  }

  private async processDelivery(
    webhookId: string,
    deliveryId: string
  ): Promise<void> {
    const [webhook] = await this.postgresClient`
      SELECT * FROM webhooks WHERE id = ${webhookId}
    `;

    const [delivery] = await this.postgresClient`
      SELECT * FROM webhook_deliveries WHERE id = ${deliveryId}
    `;

    if (!webhook || !delivery) {
      logger.error(`Webhook or delivery not found: ${webhookId}/${deliveryId}`);
      return;
    }

    try {
      const response = await this.sendWebhook(webhook, delivery.payload);
      
      // Update delivery status
      await this.postgresClient`
        UPDATE webhook_deliveries
        SET status = 'success',
            attempts = ${delivery.attempts + 1},
            last_attempt_at = NOW(),
            response_status = ${response.status},
            response_body = ${response.body}
        WHERE id = ${deliveryId}
      `;

      // Update webhook metadata
      await this.postgresClient`
        UPDATE webhooks
        SET metadata = jsonb_set(
          metadata,
          '{lastTriggeredAt}',
          to_jsonb(NOW())
        )
        WHERE id = ${webhookId}
      `;

      await this.auditLogger.log({
        organizationId: webhook.organizationId,
        action: 'webhook.delivered',
        resource: 'webhook',
        resourceId: webhook.id,
        details: {
          event: delivery.payload.event,
          status: response.status,
        },
      });
    } catch (error) {
      await this.handleDeliveryFailure(webhook, delivery, error);
    }
  }

  private async sendWebhook(
    webhook: Webhook,
    payload: WebhookPayload
  ): Promise<{ status: number; body: string }> {
    const signature = this.generateSignature(webhook.secret, payload);
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-OpenCall-Signature': signature,
      'X-OpenCall-Event': payload.event,
      'X-OpenCall-Timestamp': payload.timestamp.toISOString(),
      ...webhook.headers,
    };

    const response = await fetch(webhook.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000), // 30s timeout
    });

    const body = await response.text();

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${body}`);
    }

    return {
      status: response.status,
      body: body.substring(0, 1000), // Limit stored response
    };
  }

  private generateSignature(secret: string, payload: any): string {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    return `sha256=${hmac.digest('hex')}`;
  }

  private async handleDeliveryFailure(
    webhook: Webhook,
    delivery: WebhookDelivery,
    error: any
  ): Promise<void> {
    const attempts = delivery.attempts + 1;
    const shouldRetry = attempts < this.maxRetries;

    await this.postgresClient`
      UPDATE webhook_deliveries
      SET status = ${shouldRetry ? 'pending' : 'failed'},
          attempts = ${attempts},
          last_attempt_at = NOW(),
          error = ${error.message}
      WHERE id = ${delivery.id}
    `;

    // Update webhook failure count
    await this.postgresClient`
      UPDATE webhooks
      SET metadata = jsonb_set(
        jsonb_set(
          metadata,
          '{failureCount}',
          to_jsonb(COALESCE((metadata->>'failureCount')::int, 0) + 1)
        ),
        '{lastFailureAt}',
        to_jsonb(NOW())
      )
      WHERE id = ${webhook.id}
    `;

    if (shouldRetry) {
      // Schedule retry with exponential backoff
      const delay = this.retryDelays[attempts - 1] || 30000;
      setTimeout(() => {
        this.redisClient.lpush(
          this.deliveryQueue,
          JSON.stringify({ webhookId: webhook.id, deliveryId: delivery.id })
        );
      }, delay);
    } else {
      // Disable webhook after too many failures
      const totalFailures = await this.getTotalFailures(webhook.id);
      if (totalFailures > 10) {
        await this.disableWebhook(webhook.id);
      }
    }

    await this.auditLogger.log({
      organizationId: webhook.organizationId,
      action: 'webhook.delivery_failed',
      resource: 'webhook',
      resourceId: webhook.id,
      details: {
        event: delivery.payload.event,
        attempts,
        error: error.message,
      },
      severity: 'error',
    });
  }

  private async getTotalFailures(webhookId: string): Promise<number> {
    const [result] = await this.postgresClient`
      SELECT COUNT(*) as count
      FROM webhook_deliveries
      WHERE webhook_id = ${webhookId}
        AND status = 'failed'
        AND last_attempt_at > NOW() - INTERVAL '24 hours'
    `;
    return parseInt(result.count);
  }

  private async disableWebhook(webhookId: string): Promise<void> {
    await this.postgresClient`
      UPDATE webhooks
      SET enabled = false,
          metadata = jsonb_set(
            metadata,
            '{disabledAt}',
            to_jsonb(NOW())
          )
      WHERE id = ${webhookId}
    `;

    logger.warn(`Webhook ${webhookId} disabled due to repeated failures`);
  }

  // Verify webhook signature for incoming requests
  verifyWebhookSignature(
    secret: string,
    signature: string,
    payload: any
  ): boolean {
    const expectedSignature = this.generateSignature(secret, payload);
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  // Get webhook delivery history
  async getDeliveryHistory(
    organizationId: string,
    webhookId?: string,
    limit: number = 100
  ): Promise<WebhookDelivery[]> {
    let query = this.postgresClient`
      SELECT d.*
      FROM webhook_deliveries d
      JOIN webhooks w ON d.webhook_id = w.id
      WHERE w.organization_id = ${organizationId}
    `;

    if (webhookId) {
      query = this.postgresClient`
        ${query} AND d.webhook_id = ${webhookId}
      `;
    }

    query = this.postgresClient`
      ${query}
      ORDER BY d.last_attempt_at DESC
      LIMIT ${limit}
    `;

    return await query;
  }

  // Retry failed delivery
  async retryDelivery(
    organizationId: string,
    deliveryId: string
  ): Promise<void> {
    const [delivery] = await this.postgresClient`
      SELECT d.*
      FROM webhook_deliveries d
      JOIN webhooks w ON d.webhook_id = w.id
      WHERE d.id = ${deliveryId} AND w.organization_id = ${organizationId}
    `;

    if (!delivery) {
      throw new Error('Delivery not found');
    }

    // Reset delivery status and queue for processing
    await this.postgresClient`
      UPDATE webhook_deliveries
      SET status = 'pending', attempts = 0
      WHERE id = ${deliveryId}
    `;

    await this.redisClient.lpush(
      this.deliveryQueue,
      JSON.stringify({ webhookId: delivery.webhook_id, deliveryId })
    );
  }

  // Test webhook endpoint
  async testWebhook(
    organizationId: string,
    webhookId: string
  ): Promise<{ success: boolean; response?: any; error?: string }> {
    const [webhook] = await this.postgresClient`
      SELECT * FROM webhooks
      WHERE id = ${webhookId} AND organization_id = ${organizationId}
    `;

    if (!webhook) {
      throw new Error('Webhook not found');
    }

    const testPayload: WebhookPayload = {
      event: 'meeting.created',
      data: {
        test: true,
        meetingId: 'test-meeting-123',
        title: 'Test Meeting',
        createdAt: new Date(),
      },
      timestamp: new Date(),
      organizationId,
    };

    try {
      const response = await this.sendWebhook(webhook, testPayload);
      return { success: true, response };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}