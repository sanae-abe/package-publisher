/**
 * NotificationManager - Manage and send notifications for publish events
 */

import { PublishEvent, Notifier, NotificationResult } from '../core/interfaces.js'

export class NotificationManager {
  private notifiers: Notifier[] = []

  /**
   * Register a notifier
   */
  registerNotifier(notifier: Notifier): void {
    this.notifiers.push(notifier)
  }

  /**
   * Send notification to all registered notifiers
   */
  async notify(event: PublishEvent): Promise<NotificationResult[]> {
    if (this.notifiers.length === 0) {
      return []
    }

    const results: NotificationResult[] = []

    // Send notifications in parallel
    await Promise.allSettled(
      this.notifiers.map(async (notifier) => {
        try {
          const result = await notifier.notify(event)
          results.push(result)
        } catch (error) {
          // Log error but don't fail the entire notification process
          results.push({
            success: false,
            channel: notifier.name,
            error: error instanceof Error ? error.message : String(error),
            sentAt: new Date(),
          })
        }
      })
    )

    return results
  }

  /**
   * Get all registered notifiers
   */
  getNotifiers(): Notifier[] {
    return [...this.notifiers]
  }

  /**
   * Clear all registered notifiers
   */
  clearNotifiers(): void {
    this.notifiers = []
  }
}
