//! Orchestration layer for package publishing
//!
//! This module provides the high-level orchestration components for
//! managing package publishing workflows across multiple registries.

pub mod analytics;
pub mod batch_publisher;
pub mod package_publisher;

// Re-export main types for convenience
pub use analytics::{AnalyticsOptions, AnalyticsRecord, PublishAnalytics, PublishStatistics};
pub use batch_publisher::{BatchPublishOptions, BatchPublishResult, BatchPublisher};
pub use package_publisher::{PackagePublisher, PublishOptions, PublishReport};
