//! Retry logic with exponential backoff
//!
//! This module provides configurable retry mechanisms for network operations
//! and other potentially transient failures.

use std::future::Future;
use std::time::Duration;
use tokio::time::sleep;

/// Options for retry behavior
#[derive(Debug, Clone)]
pub struct RetryOptions {
    /// Maximum number of retry attempts
    pub max_attempts: u32,
    /// Initial delay before first retry
    pub initial_delay: Duration,
    /// Maximum delay between retries
    pub max_delay: Duration,
    /// Backoff multiplier for exponential backoff
    pub backoff_multiplier: f64,
}

impl Default for RetryOptions {
    fn default() -> Self {
        Self {
            max_attempts: 3,
            initial_delay: Duration::from_secs(1),
            max_delay: Duration::from_secs(30),
            backoff_multiplier: 2.0,
        }
    }
}

/// Retry manager for executing operations with exponential backoff
///
/// # Examples
///
/// ```no_run
/// use package_publisher::core::{RetryManager, RetryOptions};
/// use std::time::Duration;
///
/// #[tokio::main]
/// async fn main() -> anyhow::Result<()> {
///     let manager = RetryManager::new(RetryOptions::default());
///
///     let result = manager.retry(|| async {
///         // Your operation here
///         Ok::<_, anyhow::Error>("success")
///     }).await?;
///
///     Ok(())
/// }
/// ```
pub struct RetryManager {
    options: RetryOptions,
}

impl RetryManager {
    /// Create a new RetryManager with the given options
    ///
    /// # Examples
    ///
    /// ```
    /// use package_publisher::core::{RetryManager, RetryOptions};
    ///
    /// let manager = RetryManager::new(RetryOptions::default());
    /// ```
    pub fn new(options: RetryOptions) -> Self {
        Self { options }
    }

    /// Execute the given async operation with retry logic
    ///
    /// # Arguments
    ///
    /// * `operation` - Async function that returns a Result
    ///
    /// # Examples
    ///
    /// ```no_run
    /// # use package_publisher::core::{RetryManager, RetryOptions};
    /// # #[tokio::main]
    /// # async fn main() -> anyhow::Result<()> {
    /// let manager = RetryManager::new(RetryOptions::default());
    ///
    /// let result = manager.retry(|| async {
    ///     // Simulated network operation
    ///     Ok::<_, anyhow::Error>(42)
    /// }).await?;
    ///
    /// assert_eq!(result, 42);
    /// # Ok(())
    /// # }
    /// ```
    pub async fn retry<F, Fut, T, E>(&self, mut operation: F) -> Result<T, E>
    where
        F: FnMut() -> Fut,
        Fut: Future<Output = Result<T, E>>,
        E: std::fmt::Display,
    {
        let mut delay = self.options.initial_delay;
        let mut last_error: Option<E> = None;

        for attempt in 1..=self.options.max_attempts {
            match operation().await {
                Ok(result) => return Ok(result),
                Err(error) => {
                    // Check if error is retryable
                    if !self.is_retryable_error(&error) {
                        return Err(error);
                    }

                    // Last attempt
                    if attempt >= self.options.max_attempts {
                        return Err(error);
                    }

                    last_error = Some(error);

                    // Wait before retry with exponential backoff
                    sleep(delay).await;

                    // Calculate next delay with backoff multiplier
                    delay = Duration::from_secs_f64(
                        delay.as_secs_f64() * self.options.backoff_multiplier,
                    )
                    .min(self.options.max_delay);
                }
            }
        }

        // This should never be reached, but satisfy the compiler
        Err(last_error.unwrap())
    }

    /// Check if an error should be retried
    ///
    /// Network errors and timeout errors are always retryable.
    fn is_retryable_error<E: std::fmt::Display>(&self, error: &E) -> bool {
        let error_msg = error.to_string();

        // Network error patterns
        let retryable_patterns = [
            "ECONNREFUSED",
            "ENOTFOUND",
            "ETIMEDOUT",
            "ECONNRESET",
            "socket hang up",
            "network error",
            "timeout",
            "connection refused",
            "connection reset",
        ];

        retryable_patterns
            .iter()
            .any(|pattern| error_msg.to_lowercase().contains(&pattern.to_lowercase()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use std::sync::atomic::{AtomicU32, Ordering};

    #[tokio::test]
    async fn test_retry_success_on_first_attempt() {
        let manager = RetryManager::new(RetryOptions::default());

        let result = manager.retry(|| async { Ok::<_, anyhow::Error>(42) }).await;

        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 42);
    }

    #[tokio::test]
    async fn test_retry_success_after_failures() {
        let manager = RetryManager::new(RetryOptions {
            max_attempts: 3,
            initial_delay: Duration::from_millis(10),
            max_delay: Duration::from_millis(100),
            backoff_multiplier: 2.0,
        });

        let counter = Arc::new(AtomicU32::new(0));
        let counter_clone = counter.clone();

        let result = manager
            .retry(move || {
                let count = counter_clone.fetch_add(1, Ordering::SeqCst);
                async move {
                    if count < 2 {
                        Err(anyhow::anyhow!("ECONNREFUSED"))
                    } else {
                        Ok::<_, anyhow::Error>("success")
                    }
                }
            })
            .await;

        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "success");
        assert_eq!(counter.load(Ordering::SeqCst), 3);
    }

    #[tokio::test]
    async fn test_retry_max_attempts_reached() {
        let manager = RetryManager::new(RetryOptions {
            max_attempts: 3,
            initial_delay: Duration::from_millis(10),
            max_delay: Duration::from_millis(100),
            backoff_multiplier: 2.0,
        });

        let counter = Arc::new(AtomicU32::new(0));
        let counter_clone = counter.clone();

        let result = manager
            .retry(move || {
                counter_clone.fetch_add(1, Ordering::SeqCst);
                async move { Err::<i32, _>(anyhow::anyhow!("ECONNREFUSED")) }
            })
            .await;

        assert!(result.is_err());
        assert_eq!(counter.load(Ordering::SeqCst), 3);
    }

    #[tokio::test]
    async fn test_non_retryable_error() {
        let manager = RetryManager::new(RetryOptions::default());

        let counter = Arc::new(AtomicU32::new(0));
        let counter_clone = counter.clone();

        let result = manager
            .retry(move || {
                counter_clone.fetch_add(1, Ordering::SeqCst);
                async move { Err::<i32, _>(anyhow::anyhow!("Invalid input")) }
            })
            .await;

        assert!(result.is_err());
        // Should fail immediately without retries
        assert_eq!(counter.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn test_retryable_error_patterns() {
        let manager = RetryManager::new(RetryOptions::default());

        let retryable_errors = vec![
            "ECONNREFUSED",
            "ENOTFOUND",
            "ETIMEDOUT",
            "ECONNRESET",
            "socket hang up",
            "network error",
            "timeout",
            "connection refused",
        ];

        for error_msg in retryable_errors {
            assert!(
                manager.is_retryable_error(&anyhow::anyhow!("{}", error_msg)),
                "Expected '{}' to be retryable",
                error_msg
            );
        }
    }

    #[tokio::test]
    async fn test_exponential_backoff() {
        let manager = RetryManager::new(RetryOptions {
            max_attempts: 3,
            initial_delay: Duration::from_millis(10),
            max_delay: Duration::from_millis(50),
            backoff_multiplier: 2.0,
        });

        let start = std::time::Instant::now();

        let _result = manager
            .retry(|| async { Err::<i32, _>(anyhow::anyhow!("ECONNREFUSED")) })
            .await;

        let elapsed = start.elapsed();

        // Should have delays: 10ms + 20ms + (attempt 3 no delay) = ~30ms minimum
        assert!(
            elapsed >= Duration::from_millis(30),
            "Expected at least 30ms, got {:?}",
            elapsed
        );
    }

    #[tokio::test]
    async fn test_max_delay_cap() {
        let manager = RetryManager::new(RetryOptions {
            max_attempts: 5,
            initial_delay: Duration::from_millis(100),
            max_delay: Duration::from_millis(200),
            backoff_multiplier: 3.0,
        });

        let start = std::time::Instant::now();

        let _result = manager
            .retry(|| async { Err::<i32, _>(anyhow::anyhow!("timeout")) })
            .await;

        let elapsed = start.elapsed();

        // Delays: 100, 200 (capped), 200 (capped), 200 (capped) = 700ms minimum
        // But last attempt doesn't wait
        assert!(
            elapsed >= Duration::from_millis(600) && elapsed < Duration::from_millis(1000),
            "Expected 600-1000ms, got {:?}",
            elapsed
        );
    }

    #[test]
    fn test_retry_options_default() {
        let options = RetryOptions::default();

        assert_eq!(options.max_attempts, 3);
        assert_eq!(options.initial_delay, Duration::from_secs(1));
        assert_eq!(options.max_delay, Duration::from_secs(30));
        assert_eq!(options.backoff_multiplier, 2.0);
    }

    #[tokio::test]
    async fn test_case_insensitive_error_matching() {
        let manager = RetryManager::new(RetryOptions::default());

        assert!(manager.is_retryable_error(&anyhow::anyhow!("Connection Refused")));
        assert!(manager.is_retryable_error(&anyhow::anyhow!("NETWORK ERROR")));
        assert!(manager.is_retryable_error(&anyhow::anyhow!("TimeOut")));
    }
}
