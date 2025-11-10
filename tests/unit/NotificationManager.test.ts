/**
 * Tests for NotificationManager
 */

import { describe, it, expect, beforeEach } from '@jest/globals'
import { NotificationManager } from '../../src/notifications/NotificationManager'
import { PublishEvent, Notifier, NotificationResult } from '../../src/core/interfaces'

// Mock Notifier implementation
class MockNotifier implements Notifier {
  readonly name: string
  private shouldFail: boolean
  public receivedEvents: PublishEvent[] = []

  constructor(name: string, shouldFail = false) {
    this.name = name
    this.shouldFail = shouldFail
  }

  async notify(event: PublishEvent): Promise<NotificationResult> {
    this.receivedEvents.push(event)

    if (this.shouldFail) {
      throw new Error(`${this.name} notification failed`)
    }

    return {
      success: true,
      channel: this.name,
      sentAt: new Date(),
    }
  }
}

describe('NotificationManager', () => {
  let manager: NotificationManager

  beforeEach(() => {
    manager = new NotificationManager()
  })

  // ============================================================================
  // Registration Tests
  // ============================================================================

  describe('registerNotifier', () => {
    it('should register a notifier', () => {
      const notifier = new MockNotifier('test')
      manager.registerNotifier(notifier)

      const notifiers = manager.getNotifiers()
      expect(notifiers).toHaveLength(1)
      expect(notifiers[0]).toBe(notifier)
    })

    it('should register multiple notifiers', () => {
      const notifier1 = new MockNotifier('test1')
      const notifier2 = new MockNotifier('test2')

      manager.registerNotifier(notifier1)
      manager.registerNotifier(notifier2)

      const notifiers = manager.getNotifiers()
      expect(notifiers).toHaveLength(2)
    })
  })

  // ============================================================================
  // Notification Tests
  // ============================================================================

  describe('notify', () => {
    it('should send notification to all registered notifiers', async () => {
      const notifier1 = new MockNotifier('notifier1')
      const notifier2 = new MockNotifier('notifier2')

      manager.registerNotifier(notifier1)
      manager.registerNotifier(notifier2)

      const event = createMockEvent('success')
      const results = await manager.notify(event)

      expect(results).toHaveLength(2)
      expect(results.every((r) => r.success)).toBe(true)
      expect(notifier1.receivedEvents).toHaveLength(1)
      expect(notifier2.receivedEvents).toHaveLength(1)
    })

    it('should return empty array when no notifiers registered', async () => {
      const event = createMockEvent('success')
      const results = await manager.notify(event)

      expect(results).toEqual([])
    })

    it('should handle individual notifier failures gracefully', async () => {
      const successNotifier = new MockNotifier('success')
      const failNotifier = new MockNotifier('fail', true)

      manager.registerNotifier(successNotifier)
      manager.registerNotifier(failNotifier)

      const event = createMockEvent('success')
      const results = await manager.notify(event)

      expect(results).toHaveLength(2)

      const successResult = results.find((r) => r.channel === 'success')
      const failResult = results.find((r) => r.channel === 'fail')

      expect(successResult?.success).toBe(true)
      expect(failResult?.success).toBe(false)
      expect(failResult?.error).toContain('fail notification failed')
    })

    it('should continue notifying even if one notifier fails', async () => {
      const notifier1 = new MockNotifier('notifier1')
      const failNotifier = new MockNotifier('fail', true)
      const notifier2 = new MockNotifier('notifier2')

      manager.registerNotifier(notifier1)
      manager.registerNotifier(failNotifier)
      manager.registerNotifier(notifier2)

      const event = createMockEvent('success')
      await manager.notify(event)

      // All notifiers should have received the event
      expect(notifier1.receivedEvents).toHaveLength(1)
      expect(notifier2.receivedEvents).toHaveLength(1)
      expect(failNotifier.receivedEvents).toHaveLength(1)
    })

    it('should send success event correctly', async () => {
      const notifier = new MockNotifier('test')
      manager.registerNotifier(notifier)

      const event = createMockEvent('success')
      await manager.notify(event)

      expect(notifier.receivedEvents[0].type).toBe('success')
      expect(notifier.receivedEvents[0].packageName).toBe('test-package')
    })

    it('should send failure event correctly', async () => {
      const notifier = new MockNotifier('test')
      manager.registerNotifier(notifier)

      const event = createMockEvent('failure', 'Publishing failed')
      await manager.notify(event)

      expect(notifier.receivedEvents[0].type).toBe('failure')
      expect(notifier.receivedEvents[0].error).toBe('Publishing failed')
    })

    it('should send warning event correctly', async () => {
      const notifier = new MockNotifier('test')
      manager.registerNotifier(notifier)

      const event = createMockEvent('warning')
      await manager.notify(event)

      expect(notifier.receivedEvents[0].type).toBe('warning')
    })
  })

  // ============================================================================
  // Utility Methods Tests
  // ============================================================================

  describe('getNotifiers', () => {
    it('should return a copy of notifiers array', () => {
      const notifier = new MockNotifier('test')
      manager.registerNotifier(notifier)

      const notifiers1 = manager.getNotifiers()
      const notifiers2 = manager.getNotifiers()

      // Should be different array instances
      expect(notifiers1).not.toBe(notifiers2)
      // But contain the same notifier
      expect(notifiers1[0]).toBe(notifiers2[0])
    })
  })

  describe('clearNotifiers', () => {
    it('should clear all registered notifiers', () => {
      manager.registerNotifier(new MockNotifier('test1'))
      manager.registerNotifier(new MockNotifier('test2'))

      expect(manager.getNotifiers()).toHaveLength(2)

      manager.clearNotifiers()

      expect(manager.getNotifiers()).toHaveLength(0)
    })
  })
})

// ============================================================================
// Helper Functions
// ============================================================================

function createMockEvent(
  type: 'success' | 'failure' | 'warning',
  error?: string
): PublishEvent {
  return {
    type,
    registry: 'npm',
    packageName: 'test-package',
    version: '1.0.0',
    message: `Package publish ${type}`,
    timestamp: new Date(),
    error,
  }
}
