/**
 * Tests for SlackNotifier
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'
import { SlackNotifier } from '../../src/notifications/SlackNotifier'
import { PublishEvent } from '../../src/core/interfaces'

// Mock fetch
const mockFetch = jest.fn<typeof fetch>()
global.fetch = mockFetch

describe('SlackNotifier', () => {
  let notifier: SlackNotifier
  const webhookUrl = 'https://hooks.slack.com/services/TEST/WEBHOOK/URL'

  beforeEach(() => {
    mockFetch.mockClear()
    notifier = new SlackNotifier({ webhookUrl })
  })

  afterEach(() => {
    mockFetch.mockReset()
  })

  // ============================================================================
  // Initialization Tests
  // ============================================================================

  describe('constructor', () => {
    it('should create instance with default options', () => {
      expect(notifier.name).toBe('slack')
    })

    it('should accept custom username', () => {
      const customNotifier = new SlackNotifier({
        webhookUrl,
        username: 'Custom Bot',
      })
      expect(customNotifier.name).toBe('slack')
    })

    it('should accept custom channel', () => {
      const customNotifier = new SlackNotifier({
        webhookUrl,
        channel: '#custom-channel',
      })
      expect(customNotifier.name).toBe('slack')
    })
  })

  // ============================================================================
  // Notification Tests
  // ============================================================================

  describe('notify', () => {
    it('should send successful notification to Slack', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response)

      const event = createMockEvent('success')
      const result = await notifier.notify(event)

      expect(result.success).toBe(true)
      expect(result.channel).toBe('slack')
      expect(result.sentAt).toBeInstanceOf(Date)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('should send correct payload structure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response)

      const event = createMockEvent('success')
      await notifier.notify(event)

      expect(mockFetch).toHaveBeenCalledWith(
        webhookUrl,
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        })
      )

      const callArgs = mockFetch.mock.calls[0]
      const body = callArgs[1] as RequestInit
      const payload = JSON.parse(body.body as string)

      expect(payload).toHaveProperty('username')
      expect(payload).toHaveProperty('text')
      expect(payload).toHaveProperty('attachments')
      expect(payload.attachments[0]).toHaveProperty('color')
      expect(payload.attachments[0]).toHaveProperty('fields')
    })

    it('should include success emoji and color for success events', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response)

      const event = createMockEvent('success')
      await notifier.notify(event)

      const body = mockFetch.mock.calls[0][1] as RequestInit
      const payload = JSON.parse(body.body as string)

      expect(payload.text).toContain(':white_check_mark:')
      expect(payload.attachments[0].color).toBe('good')
    })

    it('should include failure emoji and color for failure events', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response)

      const event = createMockEvent('failure', 'Test error')
      await notifier.notify(event)

      const body = mockFetch.mock.calls[0][1] as RequestInit
      const payload = JSON.parse(body.body as string)

      expect(payload.text).toContain(':x:')
      expect(payload.attachments[0].color).toBe('danger')
    })

    it('should include warning emoji and color for warning events', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response)

      const event = createMockEvent('warning')
      await notifier.notify(event)

      const body = mockFetch.mock.calls[0][1] as RequestInit
      const payload = JSON.parse(body.body as string)

      expect(payload.text).toContain(':warning:')
      expect(payload.attachments[0].color).toBe('warning')
    })

    it('should include error details for failure events', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response)

      const event = createMockEvent('failure', 'Publishing failed: Connection timeout')
      await notifier.notify(event)

      const body = mockFetch.mock.calls[0][1] as RequestInit
      const payload = JSON.parse(body.body as string)

      const errorField = payload.attachments[0].fields.find((f: { title: string }) => f.title === 'Error')
      expect(errorField).toBeDefined()
      expect(errorField.value).toContain('Publishing failed: Connection timeout')
    })

    it('should include all required fields', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response)

      const event = createMockEvent('success')
      await notifier.notify(event)

      const body = mockFetch.mock.calls[0][1] as RequestInit
      const payload = JSON.parse(body.body as string)
      const fields = payload.attachments[0].fields

      expect(fields.find((f: { title: string }) => f.title === 'Registry')).toBeDefined()
      expect(fields.find((f: { title: string }) => f.title === 'Package')).toBeDefined()
      expect(fields.find((f: { title: string }) => f.title === 'Version')).toBeDefined()
      expect(fields.find((f: { title: string }) => f.title === 'Status')).toBeDefined()
    })

    it('should include custom channel if specified', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response)

      const customNotifier = new SlackNotifier({
        webhookUrl,
        channel: '#deployments',
      })

      const event = createMockEvent('success')
      await customNotifier.notify(event)

      const body = mockFetch.mock.calls[0][1] as RequestInit
      const payload = JSON.parse(body.body as string)
      expect(payload.channel).toBe('#deployments')
    })
  })

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe('error handling', () => {
    it('should handle Slack API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Invalid payload',
      } as Response)

      const event = createMockEvent('success')
      const result = await notifier.notify(event)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Slack API error')
      expect(result.error).toContain('400')
    })

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const event = createMockEvent('success')
      const result = await notifier.notify(event)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Network error')
    })

    it('should include error timestamp even on failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Test error'))

      const event = createMockEvent('success')
      const result = await notifier.notify(event)

      expect(result.sentAt).toBeInstanceOf(Date)
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
