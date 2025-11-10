/**
 * EmailNotifier - Send email notifications via SendGrid API
 */

import { PublishEvent, Notifier, NotificationResult } from '../core/interfaces.js'

export interface EmailNotifierOptions {
  /** SendGrid API key */
  apiKey: string

  /** Sender email address */
  from: string

  /** Recipient email addresses */
  recipients: string[]

  /** Email subject prefix (optional) */
  subjectPrefix?: string
}

export class EmailNotifier implements Notifier {
  readonly name = 'email'
  private apiKey: string
  private from: string
  private recipients: string[]
  private subjectPrefix: string

  constructor(options: EmailNotifierOptions) {
    this.apiKey = options.apiKey
    this.from = options.from
    this.recipients = options.recipients
    this.subjectPrefix = options.subjectPrefix || '[Package Publisher]'
  }

  /**
   * Send email notification via SendGrid
   */
  async notify(event: PublishEvent): Promise<NotificationResult> {
    const sentAt = new Date()

    try {
      const payload = this.buildEmailPayload(event)

      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`SendGrid API error: ${response.status} - ${errorText}`)
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
   * Build SendGrid email payload
   */
  private buildEmailPayload(event: PublishEvent): Record<string, unknown> {
    const subject = `${this.subjectPrefix} ${this.getStatusText(event.type)}: ${event.packageName}@${event.version}`
    const htmlContent = this.buildHtmlContent(event)
    const textContent = this.buildTextContent(event)

    return {
      personalizations: [
        {
          to: this.recipients.map((email) => ({ email })),
        },
      ],
      from: {
        email: this.from,
      },
      subject,
      content: [
        {
          type: 'text/plain',
          value: textContent,
        },
        {
          type: 'text/html',
          value: htmlContent,
        },
      ],
    }
  }

  /**
   * Build HTML email content
   */
  private buildHtmlContent(event: PublishEvent): string {
    const statusColor = this.getStatusColor(event.type)
    const statusEmoji = this.getStatusEmoji(event.type)

    let html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: ${statusColor}; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
    .content { background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd; border-top: none; border-radius: 0 0 5px 5px; }
    .field { margin: 10px 0; }
    .label { font-weight: bold; color: #666; }
    .value { color: #333; }
    .error-box { background-color: #ffe6e6; border-left: 4px solid #d32f2f; padding: 15px; margin: 15px 0; }
    .footer { text-align: center; color: #999; font-size: 12px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>${statusEmoji} ${event.message}</h2>
    </div>
    <div class="content">
      <div class="field">
        <span class="label">Registry:</span>
        <span class="value">${event.registry}</span>
      </div>
      <div class="field">
        <span class="label">Package:</span>
        <span class="value">${event.packageName}</span>
      </div>
      <div class="field">
        <span class="label">Version:</span>
        <span class="value">${event.version}</span>
      </div>
      <div class="field">
        <span class="label">Status:</span>
        <span class="value">${this.getStatusText(event.type)}</span>
      </div>
      <div class="field">
        <span class="label">Timestamp:</span>
        <span class="value">${event.timestamp.toISOString()}</span>
      </div>
`

    if (event.error) {
      html += `
      <div class="error-box">
        <strong>Error Details:</strong><br>
        <pre style="white-space: pre-wrap; word-wrap: break-word;">${this.escapeHtml(event.error)}</pre>
      </div>
`
    }

    html += `
    </div>
    <div class="footer">
      <p>Sent by Package Publisher</p>
    </div>
  </div>
</body>
</html>
`

    return html
  }

  /**
   * Build plain text email content
   */
  private buildTextContent(event: PublishEvent): string {
    let text = `${event.message}\n\n`
    text += `Registry: ${event.registry}\n`
    text += `Package: ${event.packageName}\n`
    text += `Version: ${event.version}\n`
    text += `Status: ${this.getStatusText(event.type)}\n`
    text += `Timestamp: ${event.timestamp.toISOString()}\n`

    if (event.error) {
      text += `\nError Details:\n${event.error}\n`
    }

    text += `\n---\nSent by Package Publisher\n`

    return text
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

  /**
   * Get status color for event type
   */
  private getStatusColor(type: PublishEvent['type']): string {
    switch (type) {
      case 'success':
        return '#4caf50' // green
      case 'failure':
        return '#d32f2f' // red
      case 'warning':
        return '#ff9800' // orange
      default:
        return '#808080' // gray
    }
  }

  /**
   * Get status emoji for event type
   */
  private getStatusEmoji(type: PublishEvent['type']): string {
    switch (type) {
      case 'success':
        return '✅'
      case 'failure':
        return '❌'
      case 'warning':
        return '⚠️'
      default:
        return 'ℹ️'
    }
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    const htmlEscapeMap: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }

    return text.replace(/[&<>"']/g, (char) => htmlEscapeMap[char] || char)
  }
}
