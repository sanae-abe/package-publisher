/**
 * Tests for EmailNotifier
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'
import { EmailNotifier } from '../../src/notifications/EmailNotifier'
import { PublishEvent } from '../../src/core/interfaces'

// Mock fetch
const mockFetch = jest.fn<typeof fetch>()
global.fetch = mockFetch

describe('EmailNotifier', () => {
  let notifier: EmailNotifier
  const apiKey = 'TEST_SENDGRID_API_KEY'
  const from = 'noreply@example.com'
  const recipients = ['dev@example.com', 'team@example.com']

  beforeEach(() => {
    mockFetch.mockClear()
    notifier = new EmailNotifier({ apiKey, from, recipients })
  })

  afterEach(() => {
    mockFetch.mockReset()
  })

  // ============================================================================
  // Initialization Tests
  // ============================================================================

  describe('constructor', () => {
    it('should create instance with required options', () => {
      expect(notifier.name).toBe('email')
    })

    it('should accept custom subject prefix', () => {
      const customNotifier = new EmailNotifier({
        apiKey,
        from,
        recipients,
        subjectPrefix: '[Custom Prefix]',
      })
      expect(customNotifier.name).toBe('email')
    })
  })

  // ============================================================================
  // Notification Tests
  // ============================================================================

  describe('notify', () => {
    it('should send successful notification via SendGrid', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 202,
      } as Response)

      const event = createMockEvent('success')
      const result = await notifier.notify(event)

      expect(result.success).toBe(true)
      expect(result.channel).toBe('email')
      expect(result.sentAt).toBeInstanceOf(Date)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('should send to correct SendGrid endpoint with authorization', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 202,
      } as Response)

      const event = createMockEvent('success')
      await notifier.notify(event)

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.sendgrid.com/v3/mail/send',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
        })
      )
    })

    it('should include all recipients in payload', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 202,
      } as Response)

      const event = createMockEvent('success')
      await notifier.notify(event)

      const body = mockFetch.mock.calls[0][1] as RequestInit
      const payload = JSON.parse(body.body as string)

      expect(payload.personalizations[0].to).toHaveLength(2)
      expect(payload.personalizations[0].to[0].email).toBe('dev@example.com')
      expect(payload.personalizations[0].to[1].email).toBe('team@example.com')
    })

    it('should include from address', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 202,
      } as Response)

      const event = createMockEvent('success')
      await notifier.notify(event)

      const body = mockFetch.mock.calls[0][1] as RequestInit
      const payload = JSON.parse(body.body as string)
      expect(payload.from.email).toBe(from)
    })

    it('should include appropriate subject for success events', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 202,
      } as Response)

      const event = createMockEvent('success')
      await notifier.notify(event)

      const body = mockFetch.mock.calls[0][1] as RequestInit
      const payload = JSON.parse(body.body as string)
      expect(payload.subject).toContain('Success')
      expect(payload.subject).toContain('test-package@1.0.0')
    })

    it('should include appropriate subject for failure events', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 202,
      } as Response)

      const event = createMockEvent('failure')
      await notifier.notify(event)

      const body = mockFetch.mock.calls[0][1] as RequestInit
      const payload = JSON.parse(body.body as string)
      expect(payload.subject).toContain('Failed')
    })

    it('should include custom subject prefix', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 202,
      } as Response)

      const customNotifier = new EmailNotifier({
        apiKey,
        from,
        recipients,
        subjectPrefix: '[Custom]',
      })

      const event = createMockEvent('success')
      await customNotifier.notify(event)

      const body = mockFetch.mock.calls[0][1] as RequestInit
      const payload = JSON.parse(body.body as string)
      expect(payload.subject).toContain('[Custom]')
    })

    it('should include both plain text and HTML content', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 202,
      } as Response)

      const event = createMockEvent('success')
      await notifier.notify(event)

      const body = mockFetch.mock.calls[0][1] as RequestInit
      const payload = JSON.parse(body.body as string)

      expect(payload.content).toHaveLength(2)
      expect(payload.content[0].type).toBe('text/plain')
      expect(payload.content[1].type).toBe('text/html')
    })

    it('should include package details in email content', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 202,
      } as Response)

      const event = createMockEvent('success')
      await notifier.notify(event)

      const body = mockFetch.mock.calls[0][1] as RequestInit
      const payload = JSON.parse(body.body as string)
      const textContent = payload.content[0].value
      const htmlContent = payload.content[1].value

      expect(textContent).toContain('npm')
      expect(textContent).toContain('test-package')
      expect(textContent).toContain('1.0.0')
      expect(htmlContent).toContain('npm')
      expect(htmlContent).toContain('test-package')
      expect(htmlContent).toContain('1.0.0')
    })

    it('should include error details for failure events', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 202,
      } as Response)

      const event = createMockEvent('failure', 'Authentication failed')
      await notifier.notify(event)

      const body = mockFetch.mock.calls[0][1] as RequestInit
      const payload = JSON.parse(body.body as string)
      const htmlContent = payload.content[1].value

      expect(htmlContent).toContain('Error Details')
      expect(htmlContent).toContain('Authentication failed')
    })

    it('should properly escape HTML in error messages', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 202,
      } as Response)

      const event = createMockEvent('failure', '<script>alert("XSS")</script>')
      await notifier.notify(event)

      const body = mockFetch.mock.calls[0][1] as RequestInit
      const payload = JSON.parse(body.body as string)
      const htmlContent = payload.content[1].value

      expect(htmlContent).not.toContain('<script>')
      expect(htmlContent).toContain('&lt;script&gt;')
    })
  })

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe('error handling', () => {
    it('should handle SendGrid API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Invalid email address',
      } as Response)

      const event = createMockEvent('success')
      const result = await notifier.notify(event)

      expect(result.success).toBe(false)
      expect(result.error).toContain('SendGrid API error')
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

  // ============================================================================
  // HTML Generation Tests
  // ============================================================================

  describe('HTML generation', () => {
    it('should use green color for success events', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 202,
      } as Response)

      const event = createMockEvent('success')
      await notifier.notify(event)

      const body = mockFetch.mock.calls[0][1] as RequestInit
      const payload = JSON.parse(body.body as string)
      const htmlContent = payload.content[1].value

      expect(htmlContent).toContain('#4caf50') // green color
      expect(htmlContent).toContain('✅')
    })

    it('should use red color for failure events', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 202,
      } as Response)

      const event = createMockEvent('failure')
      await notifier.notify(event)

      const body = mockFetch.mock.calls[0][1] as RequestInit
      const payload = JSON.parse(body.body as string)
      const htmlContent = payload.content[1].value

      expect(htmlContent).toContain('#d32f2f') // red color
      expect(htmlContent).toContain('❌')
    })

    it('should use orange color for warning events', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 202,
      } as Response)

      const event = createMockEvent('warning')
      await notifier.notify(event)

      const body = mockFetch.mock.calls[0][1] as RequestInit
      const payload = JSON.parse(body.body as string)
      const htmlContent = payload.content[1].value

      expect(htmlContent).toContain('#ff9800') // orange color
      expect(htmlContent).toContain('⚠️')
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
