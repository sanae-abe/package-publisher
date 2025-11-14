//! Batch Publisher - Manages publishing to multiple registries
//!
//! Features:
//! - Parallel or sequential publishing
//! - Error handling with continueOnError option
//! - Concurrency control
//! - Detailed reporting for each registry

use crate::orchestration::package_publisher::{PackagePublisher, PublishOptions, PublishReport};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Semaphore;

/// Batch publishing options
#[derive(Debug, Clone)]
pub struct BatchPublishOptions {
    /// Publish sequentially (default: parallel)
    pub sequential: bool,

    /// Continue on error (default: stop on first error)
    pub continue_on_error: bool,

    /// Maximum concurrent publishes (default: 3)
    pub max_concurrency: usize,

    /// Options passed to each publish operation
    pub publish_options: PublishOptions,
}

impl Default for BatchPublishOptions {
    fn default() -> Self {
        Self {
            sequential: false,
            continue_on_error: false,
            max_concurrency: 3,
            publish_options: PublishOptions::default(),
        }
    }
}

/// Batch publish result
#[derive(Debug, Clone)]
pub struct BatchPublishResult {
    /// Successfully published registries
    pub succeeded: Vec<String>,

    /// Failed registries with error messages
    pub failed: HashMap<String, String>,

    /// Skipped registries (due to previous failures)
    pub skipped: Vec<String>,

    /// Overall success status
    pub success: bool,

    /// Detailed results for each registry
    pub results: HashMap<String, PublishReport>,
}

/// BatchPublisher - Manages publishing to multiple registries
pub struct BatchPublisher {
    project_path: PathBuf,
}

impl BatchPublisher {
    /// Create a new BatchPublisher
    ///
    /// # Arguments
    ///
    /// * `project_path` - Path to the project directory
    pub fn new<P: Into<PathBuf>>(project_path: P) -> Self {
        Self {
            project_path: project_path.into(),
        }
    }

    /// Publish to multiple registries
    ///
    /// # Arguments
    ///
    /// * `registries` - List of registry names to publish to
    /// * `options` - Batch publish options
    ///
    /// # Returns
    ///
    /// Batch publish result with success/failure details
    pub async fn publish_to_multiple(
        &self,
        registries: Vec<String>,
        options: BatchPublishOptions,
    ) -> Result<BatchPublishResult, anyhow::Error> {
        // Validate input
        if registries.is_empty() {
            return Err(anyhow::anyhow!("At least one registry must be specified"));
        }

        println!("\n📦 Batch Publishing to {} registries: {}", registries.len(), registries.join(", "));
        println!("Mode: {}", if options.sequential {
            "Sequential".to_string()
        } else {
            format!("Parallel (max {} concurrent)", options.max_concurrency)
        });
        println!("Continue on error: {}\n", if options.continue_on_error { "Yes" } else { "No" });

        // Initialize result
        let mut result = BatchPublishResult {
            succeeded: Vec::new(),
            failed: HashMap::new(),
            skipped: Vec::new(),
            success: false,
            results: HashMap::new(),
        };

        if options.sequential {
            // Sequential publishing
            self.publish_sequentially(registries, &options, &mut result).await?;
        } else {
            // Parallel publishing with concurrency control
            self.publish_in_parallel(registries, &options, &mut result).await?;
        }

        // Set overall success status
        result.success = result.failed.is_empty() && result.skipped.is_empty();

        // Print summary
        Self::print_summary(&result);

        Ok(result)
    }

    /// Publish to registries sequentially
    async fn publish_sequentially(
        &self,
        registries: Vec<String>,
        options: &BatchPublishOptions,
        result: &mut BatchPublishResult,
    ) -> Result<(), anyhow::Error> {
        for registry in registries {
            // Skip if we had a failure and continueOnError is false
            if !result.failed.is_empty() && !options.continue_on_error {
                println!("⏭️  Skipping {} due to previous failure", registry);
                result.skipped.push(registry);
                continue;
            }

            self.publish_to_registry(&registry, options, result).await;
        }

        Ok(())
    }

    /// Publish to registries in parallel with concurrency control
    async fn publish_in_parallel(
        &self,
        registries: Vec<String>,
        options: &BatchPublishOptions,
        result: &mut BatchPublishResult,
    ) -> Result<(), anyhow::Error> {
        let semaphore = Arc::new(Semaphore::new(options.max_concurrency));
        let mut tasks = Vec::new();

        for registry in registries {
            let semaphore = Arc::clone(&semaphore);
            let registry_for_task = registry.clone();
            let project_path = self.project_path.clone();
            let publish_options = options.publish_options.clone();

            let task = tokio::spawn(async move {
                let _permit = semaphore.acquire().await.unwrap();
                Self::publish_single_registry(&project_path, &registry_for_task, &publish_options).await
            });

            tasks.push((registry, task));
        }

        // Wait for all tasks and collect results
        for (registry, task) in tasks {
            match task.await {
                Ok(publish_result) => {
                    match publish_result {
                        Ok(report) => {
                            if report.success {
                                println!("✅ {}: Published successfully in {}ms", registry, report.duration);
                                result.succeeded.push(registry.clone());
                            } else {
                                let error = report.errors.first()
                                    .cloned()
                                    .unwrap_or_else(|| "Unknown error".to_string());
                                println!("❌ {}: Failed - {}", registry, error);
                                result.failed.insert(registry.clone(), error);
                            }
                            result.results.insert(registry, report);
                        }
                        Err(e) => {
                            let error_msg = e.to_string();
                            println!("❌ {}: Failed - {}", registry, error_msg);
                            result.failed.insert(registry.clone(), error_msg.clone());

                            // Create error report
                            let report = PublishReport {
                                success: false,
                                registry: registry.clone(),
                                package_name: "unknown".to_string(),
                                version: "0.0.0".to_string(),
                                published_at: None,
                                verification_url: None,
                                errors: vec![error_msg],
                                warnings: Vec::new(),
                                duration: 0,
                                state: "FAILED".to_string(),
                            };
                            result.results.insert(registry, report);
                        }
                    }
                }
                Err(e) => {
                    let error_msg = format!("Task failed: {}", e);
                    println!("❌ {}: {}", registry, error_msg);
                    result.failed.insert(registry.clone(), error_msg.clone());

                    let report = PublishReport {
                        success: false,
                        registry: registry.clone(),
                        package_name: "unknown".to_string(),
                        version: "0.0.0".to_string(),
                        published_at: None,
                        verification_url: None,
                        errors: vec![error_msg],
                        warnings: Vec::new(),
                        duration: 0,
                        state: "FAILED".to_string(),
                    };
                    result.results.insert(registry, report);
                }
            }

            // Check if we should stop due to errors
            if !result.failed.is_empty() && !options.continue_on_error {
                // Cancel remaining tasks by breaking
                // (tasks will be dropped and cancelled)
                break;
            }
        }

        Ok(())
    }

    /// Publish to a single registry
    async fn publish_to_registry(
        &self,
        registry: &str,
        options: &BatchPublishOptions,
        result: &mut BatchPublishResult,
    ) {
        println!("\n🚀 Publishing to {}...", registry);

        match Self::publish_single_registry(&self.project_path, registry, &options.publish_options).await {
            Ok(report) => {
                if report.success {
                    println!("✅ {}: Published successfully in {}ms", registry, report.duration);
                    result.succeeded.push(registry.to_string());
                } else {
                    let error = report.errors.first()
                        .cloned()
                        .unwrap_or_else(|| "Unknown error".to_string());
                    println!("❌ {}: Failed - {}", registry, error);
                    result.failed.insert(registry.to_string(), error);
                }
                result.results.insert(registry.to_string(), report);
            }
            Err(e) => {
                let error_msg = e.to_string();
                println!("❌ {}: Failed - {}", registry, error_msg);
                result.failed.insert(registry.to_string(), error_msg.clone());

                let report = PublishReport {
                    success: false,
                    registry: registry.to_string(),
                    package_name: "unknown".to_string(),
                    version: "0.0.0".to_string(),
                    published_at: None,
                    verification_url: None,
                    errors: vec![error_msg],
                    warnings: Vec::new(),
                    duration: 0,
                    state: "FAILED".to_string(),
                };
                result.results.insert(registry.to_string(), report);
            }
        }
    }

    /// Helper function to publish to a single registry (used by parallel tasks)
    async fn publish_single_registry(
        project_path: &PathBuf,
        registry: &str,
        publish_options: &PublishOptions,
    ) -> Result<PublishReport, anyhow::Error> {
        let mut publisher = PackagePublisher::new(project_path);

        // Force non-interactive for batch operations
        let mut batch_options = publish_options.clone();
        batch_options.non_interactive = true;
        batch_options.registry = Some(registry.to_string());

        publisher.publish(batch_options).await
            .map_err(|e| anyhow::anyhow!("{}", e))
    }

    /// Print batch publish summary
    fn print_summary(result: &BatchPublishResult) {
        println!("\n{}", "=".repeat(60));
        println!("📊 Batch Publish Summary");
        println!("{}", "=".repeat(60));

        println!("\n✅ Succeeded: {}", result.succeeded.len());
        if !result.succeeded.is_empty() {
            for registry in &result.succeeded {
                let report = result.results.get(registry).unwrap();
                println!("   - {} ({}ms)", registry, report.duration);
            }
        }

        println!("\n❌ Failed: {}", result.failed.len());
        if !result.failed.is_empty() {
            for (registry, error) in &result.failed {
                let report = result.results.get(registry);
                let duration = report.map(|r| r.duration).unwrap_or(0);
                println!("   - {}: {} ({}ms)", registry, error, duration);
            }
        }

        if !result.skipped.is_empty() {
            println!("\n⏭️  Skipped: {}", result.skipped.len());
            for registry in &result.skipped {
                println!("   - {}", registry);
            }
        }

        println!("\n{}", "=".repeat(60));
        println!("Overall Status: {}", if result.success { "✅ SUCCESS" } else { "❌ FAILED" });
        println!("{}\n", "=".repeat(60));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_batch_publisher() {
        let publisher = BatchPublisher::new(".");
        assert_eq!(publisher.project_path, PathBuf::from("."));
    }

    #[test]
    fn test_batch_options_default() {
        let options = BatchPublishOptions::default();
        assert_eq!(options.sequential, false);
        assert_eq!(options.continue_on_error, false);
        assert_eq!(options.max_concurrency, 3);
    }
}
