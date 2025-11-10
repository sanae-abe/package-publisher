import { RetryOptions } from './interfaces'

/**
 * Retry manager with exponential backoff
 */
export class RetryManager {
  private static readonly DEFAULT_MAX_ATTEMPTS = 3
  private static readonly DEFAULT_INITIAL_DELAY = 1000 // 1 second
  private static readonly DEFAULT_MAX_DELAY = 30000 // 30 seconds
  private static readonly DEFAULT_BACKOFF_MULTIPLIER = 2

  async retry<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<T> {
    const {
      maxAttempts = RetryManager.DEFAULT_MAX_ATTEMPTS,
      initialDelay = RetryManager.DEFAULT_INITIAL_DELAY,
      maxDelay = RetryManager.DEFAULT_MAX_DELAY,
      backoffMultiplier = RetryManager.DEFAULT_BACKOFF_MULTIPLIER,
      retryableErrors = [],
      onRetry
    } = options

    let lastError: Error | undefined
    let delay = initialDelay

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn()
      } catch (error) {
        lastError = error as Error

        // Check if error is retryable
        const isRetryable = this.isRetryableError(error as Error, retryableErrors)

        // Last attempt or non-retryable error
        if (attempt >= maxAttempts || !isRetryable) {
          throw error
        }

        // Call onRetry callback if provided
        if (onRetry) {
          await onRetry(attempt, error as Error)
        }

        // Wait before retry with exponential backoff
        await this.sleep(Math.min(delay, maxDelay))
        delay *= backoffMultiplier
      }
    }

    throw lastError!
  }

  private isRetryableError(error: Error, retryablePatterns: RegExp[]): boolean {
    // Always retry on network errors
    const networkErrors = [
      /ECONNREFUSED/,
      /ENOTFOUND/,
      /ETIMEDOUT/,
      /ECONNRESET/,
      /socket hang up/i,
      /network error/i
    ]

    const allPatterns = [...networkErrors, ...retryablePatterns]

    return allPatterns.some((pattern) => pattern.test(error.message))
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
