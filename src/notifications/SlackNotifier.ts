/**
 * SlackNotifier - Send notifications to Slack via webhook
 */

import { PublishEvent, Notifier, NotificationResult } from '../core/interfaces.js'

export interface SlackNotifierOptions {
  /** Slack webhook URL */
  webhookUrl: string

  /** Custom username for the bot (optional) */
  username?: string

  /** Channel to post to (optional, overrides webhook default) */
  channel?: string
}

export class SlackNotifier implements Notifier {
  readonly name = 'slack'
  private webhookUrl: string
  private username: string
  private channel?: string

  constructor(options: SlackNotifierOptions) {
    this.webhookUrl = options.webhookUrl
    this.username = options.username || 'Package Publisher'
    this.channel = options.channel
  }

  /**
   * Send notification to Slack
   */
  async notify(event: PublishEvent): Promise<NotificationResult> {
    const sentAt = new Date()

    try {
      const payload = this.buildSlackPayload(event)

      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Slack API error: ${response.status} - ${errorText}`)
      }

      return {
        success: true,
        channel: this.name,
        sentAt,
      }
    } catch (error) {
      return {
        success: false,
        channel: this.name,
        error: error instanceof Error ? error.message : String(error),
        sentAt,
      }
    }
  }

  /**
   * Build Slack message payload
   */
  private buildSlackPayload(event: PublishEvent): Record<string, unknown> {
    const emoji = this.getEmoji(event.type)
    const color = this.getColor(event.type)
    const statusText = this.getStatusText(event.type)

    const fields: Array<{ title: string; value: string; short: boolean }> = [
      {
        title: 'Registry',
        value: event.registry,
        short: true,
      },
      {
        title: 'Package',
        value: event.packageName,
        short: true,
      },
      {
        title: 'Version',
        value: event.version,
        short: true,
      },
      {
        title: 'Status',
        value: statusText,
        short: true,
      },
    ]

    const payload: Record<string, unknown> = {
      username: this.username,
      text: `${emoji} ${event.message}`,
      attachments: [
        {
          color,
          fields,
          footer: 'Package Publisher',
          ts: Math.floor(event.timestamp.getTime() / 1000),
        },
      ],
    }

    if (this.channel) {
      payload.channel = this.channel
    }

    // Add error details if present
    if (event.error) {
      const attachments = payload.attachments as Array<Record<string, unknown>>
      payload.attachments = [
        {
          ...attachments[0],
          fields: [
            ...fields,
            {
              title: 'Error',
              value: `\`\`\`${event.error}\`\`\``,
              short: false,
            },
          ],
        },
      ]
    }

    return payload
  }

  /**
   * Get emoji for event type
   */
  private getEmoji(type: PublishEvent['type']): string {
    switch (type) {
      case 'success':
        return ':white_check_mark:'
      case 'failure':
        return ':x:'
      case 'warning':
        return ':warning:'
      default:
        return ':information_source:'
    }
  }

  /**
   * Get color for event type
   */
  private getColor(type: PublishEvent['type']): string {
    switch (type) {
      case 'success':
        return 'good' // green
      case 'failure':
        return 'danger' // red
      case 'warning':
        return 'warning' // yellow
      default:
        return '#808080' // gray
    }
  }

  /**
   * Get status text for event type
   */
  private getStatusText(type: PublishEvent['type']): string {
    switch (type) {
      case 'success':
        return 'Success'
      case 'failure':
        return 'Failed'
      case 'warning':
        return 'Warning'
      default:
        return 'Unknown'
    }
  }
}
