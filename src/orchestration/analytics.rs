//! PublishAnalytics - Track and analyze package publishing statistics
//!
//! Features:
//! - Record publish attempts with detailed metadata
//! - Filter and query records by various criteria
//! - Calculate statistics (success rate, duration, etc.)
//! - Generate reports in Markdown and JSON formats
//! - Persistent storage in JSON format

use crate::orchestration::package_publisher::PublishReport;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use tokio::fs;

/// Analytics record for a single publish attempt
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalyticsRecord {
    pub id: String,
    pub registry: String,
    pub package_name: String,
    pub version: String,
    pub success: bool,
    pub error: Option<String>,
    pub duration: u64,
    pub timestamp: DateTime<Utc>,
    pub metadata: AnalyticsMetadata,
}

/// Additional metadata for analytics record
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalyticsMetadata {
    pub state: String,
    pub warnings: Vec<String>,
    pub verification_url: Option<String>,
}

/// Options for filtering analytics records
#[derive(Debug, Clone, Default)]
pub struct AnalyticsOptions {
    pub registry: Option<String>,
    pub package_name: Option<String>,
    pub start_date: Option<DateTime<Utc>>,
    pub end_date: Option<DateTime<Utc>>,
    pub success_only: bool,
    pub failures_only: bool,
    pub limit: Option<usize>,
}

/// Registry-specific statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegistryStatistics {
    pub registry: String,
    pub attempts: usize,
    pub successes: usize,
    pub failures: usize,
    pub success_rate: f64,
    pub average_duration: f64,
    pub last_publish: DateTime<Utc>,
    pub last_version: String,
}

/// Overall publishing statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublishStatistics {
    pub total_attempts: usize,
    pub success_count: usize,
    pub failure_count: usize,
    pub success_rate: f64,
    pub average_duration: f64,
    pub by_registry: HashMap<String, RegistryStatistics>,
    pub time_range: TimeRange,
}

/// Time range for statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimeRange {
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
}

/// Comprehensive analytics report
#[derive(Debug, Clone)]
pub struct AnalyticsReport {
    pub title: String,
    pub generated_at: DateTime<Utc>,
    pub statistics: PublishStatistics,
    pub recent_publishes: Vec<AnalyticsRecord>,
    pub markdown_summary: String,
    pub json_data: String,
}

/// Data file structure
#[derive(Debug, Serialize, Deserialize)]
struct AnalyticsDataFile {
    version: String,
    records: Vec<AnalyticsRecord>,
    last_updated: String,
}

/// PublishAnalytics - Track and analyze package publishing statistics
pub struct PublishAnalytics {
    records: Vec<AnalyticsRecord>,
    data_file_path: PathBuf,
}

impl PublishAnalytics {
    /// Create a new PublishAnalytics instance
    ///
    /// # Arguments
    ///
    /// * `project_path` - Path to the project directory
    pub fn new<P: Into<PathBuf>>(project_path: P) -> Self {
        let project_path = project_path.into();
        let analytics_dir = project_path.join(".package-publisher");
        let data_file_path = analytics_dir.join("analytics.json");

        Self {
            records: Vec::new(),
            data_file_path,
        }
    }

    /// Initialize analytics by loading existing data
    pub async fn initialize(&mut self) -> Result<(), anyhow::Error> {
        match self.load_records().await {
            Ok(()) => Ok(()),
            Err(_) => {
                // If file doesn't exist, start with empty records
                self.records = Vec::new();
                Ok(())
            }
        }
    }

    /// Record a publish attempt
    ///
    /// # Arguments
    ///
    /// * `report` - Publishing report to record
    pub async fn record_publish(&mut self, report: &PublishReport) -> Result<(), anyhow::Error> {
        let record = AnalyticsRecord {
            id: self.generate_id(),
            registry: report.registry.clone(),
            package_name: report.package_name.clone(),
            version: report.version.clone(),
            success: report.success,
            error: if report.errors.is_empty() {
                None
            } else {
                Some(report.errors.join("; "))
            },
            duration: report.duration,
            timestamp: report.published_at.unwrap_or_else(Utc::now),
            metadata: AnalyticsMetadata {
                state: report.state.clone(),
                warnings: report.warnings.clone(),
                verification_url: report.verification_url.clone(),
            },
        };

        self.records.push(record);
        self.save_records().await?;

        Ok(())
    }

    /// Get filtered records
    ///
    /// # Arguments
    ///
    /// * `options` - Filtering options
    ///
    /// # Returns
    ///
    /// Filtered and sorted records
    pub fn get_records(&self, options: &AnalyticsOptions) -> Vec<AnalyticsRecord> {
        let mut filtered: Vec<_> = self.records
            .iter()
            .filter(|r| {
                if let Some(ref registry) = options.registry
                    && &r.registry != registry {
                        return false;
                    }

                if let Some(ref package_name) = options.package_name
                    && &r.package_name != package_name {
                        return false;
                    }

                if let Some(start_date) = options.start_date
                    && r.timestamp < start_date {
                        return false;
                    }

                if let Some(end_date) = options.end_date
                    && r.timestamp > end_date {
                        return false;
                    }

                if options.success_only && !r.success {
                    return false;
                }

                if options.failures_only && r.success {
                    return false;
                }

                true
            })
            .cloned()
            .collect();

        // Sort by timestamp descending (most recent first)
        filtered.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));

        // Apply limit
        if let Some(limit) = options.limit {
            filtered.truncate(limit);
        }

        filtered
    }

    /// Calculate statistics from records
    ///
    /// # Arguments
    ///
    /// * `options` - Filtering options
    ///
    /// # Returns
    ///
    /// Comprehensive publishing statistics
    pub fn get_statistics(&self, options: &AnalyticsOptions) -> PublishStatistics {
        let records = self.get_records(options);

        if records.is_empty() {
            return self.get_empty_statistics();
        }

        let success_count = records.iter().filter(|r| r.success).count();
        let failure_count = records.len() - success_count;
        let total_duration: u64 = records.iter().map(|r| r.duration).sum();
        let average_duration = total_duration as f64 / records.len() as f64;

        // Calculate registry-specific statistics
        let by_registry = self.calculate_registry_statistics(&records);

        // Determine time range
        let timestamps: Vec<_> = records.iter().map(|r| r.timestamp).collect();
        let start = *timestamps.iter().min().unwrap();
        let end = *timestamps.iter().max().unwrap();

        PublishStatistics {
            total_attempts: records.len(),
            success_count,
            failure_count,
            success_rate: (success_count as f64 / records.len() as f64) * 100.0,
            average_duration,
            by_registry,
            time_range: TimeRange { start, end },
        }
    }

    /// Generate a comprehensive report
    ///
    /// # Arguments
    ///
    /// * `options` - Filtering options
    ///
    /// # Returns
    ///
    /// Comprehensive analytics report
    pub async fn generate_report(&self, options: &AnalyticsOptions) -> Result<AnalyticsReport, anyhow::Error> {
        let statistics = self.get_statistics(options);

        let mut recent_options = options.clone();
        if recent_options.limit.is_none() {
            recent_options.limit = Some(10);
        }
        let recent_publishes = self.get_records(&recent_options);

        let markdown_summary = self.generate_markdown_summary(&statistics, &recent_publishes);
        let json_data = self.generate_json_export(&statistics, &recent_publishes)?;

        Ok(AnalyticsReport {
            title: self.generate_report_title(options),
            generated_at: Utc::now(),
            statistics,
            recent_publishes,
            markdown_summary,
            json_data,
        })
    }

    /// Clear all analytics data
    pub async fn clear_data(&mut self) -> Result<(), anyhow::Error> {
        self.records.clear();
        self.save_records().await?;
        Ok(())
    }

    // Private methods

    fn generate_id(&self) -> String {
        format!("{}-{}", Utc::now().timestamp_millis(), uuid::Uuid::new_v4())
    }

    async fn load_records(&mut self) -> Result<(), anyhow::Error> {
        let data = fs::read_to_string(&self.data_file_path).await?;
        let parsed: AnalyticsDataFile = serde_json::from_str(&data)?;
        self.records = parsed.records;
        Ok(())
    }

    async fn save_records(&self) -> Result<(), anyhow::Error> {
        let dir = self.data_file_path.parent().unwrap();
        fs::create_dir_all(dir).await?;

        let data = AnalyticsDataFile {
            version: "1.0".to_string(),
            records: self.records.clone(),
            last_updated: Utc::now().to_rfc3339(),
        };

        let json = serde_json::to_string_pretty(&data)?;
        fs::write(&self.data_file_path, json).await?;

        Ok(())
    }

    fn calculate_registry_statistics(&self, records: &[AnalyticsRecord]) -> HashMap<String, RegistryStatistics> {
        let mut registry_map: HashMap<String, Vec<&AnalyticsRecord>> = HashMap::new();

        // Group records by registry
        for record in records {
            registry_map
                .entry(record.registry.clone())
                .or_default()
                .push(record);
        }

        // Calculate statistics for each registry
        registry_map
            .into_iter()
            .map(|(registry, reg_records)| {
                let successes = reg_records.iter().filter(|r| r.success).count();
                let attempts = reg_records.len();
                let total_duration: u64 = reg_records.iter().map(|r| r.duration).sum();

                // Find the most recent publish
                let most_recent = reg_records
                    .iter()
                    .max_by_key(|r| r.timestamp)
                    .unwrap();

                let stats = RegistryStatistics {
                    registry: registry.clone(),
                    attempts,
                    successes,
                    failures: attempts - successes,
                    success_rate: (successes as f64 / attempts as f64) * 100.0,
                    average_duration: total_duration as f64 / attempts as f64,
                    last_publish: most_recent.timestamp,
                    last_version: most_recent.version.clone(),
                };

                (registry, stats)
            })
            .collect()
    }

    fn get_empty_statistics(&self) -> PublishStatistics {
        PublishStatistics {
            total_attempts: 0,
            success_count: 0,
            failure_count: 0,
            success_rate: 0.0,
            average_duration: 0.0,
            by_registry: HashMap::new(),
            time_range: TimeRange {
                start: Utc::now(),
                end: Utc::now(),
            },
        }
    }

    fn generate_report_title(&self, options: &AnalyticsOptions) -> String {
        let mut parts = vec!["Publishing Analytics Report".to_string()];

        if let Some(ref registry) = options.registry {
            parts.push(format!("- {}", registry));
        }

        if let Some(ref package_name) = options.package_name {
            parts.push(format!("- {}", package_name));
        }

        parts.join(" ")
    }

    fn generate_markdown_summary(
        &self,
        statistics: &PublishStatistics,
        recent_publishes: &[AnalyticsRecord],
    ) -> String {
        let mut lines = Vec::new();

        lines.push("# Publishing Analytics Report\n".to_string());
        lines.push(format!("**Generated**: {}\n", Utc::now().to_rfc3339()));

        // Overall Statistics
        lines.push("## Overall Statistics\n".to_string());
        lines.push(format!("- **Total Attempts**: {}", statistics.total_attempts));
        lines.push(format!("- **Successful**: {}", statistics.success_count));
        lines.push(format!("- **Failed**: {}", statistics.failure_count));
        lines.push(format!("- **Success Rate**: {:.2}%", statistics.success_rate));
        lines.push(format!("- **Average Duration**: {:.2}s\n", statistics.average_duration / 1000.0));

        // Time Range
        if statistics.total_attempts > 0 {
            lines.push("### Time Range\n".to_string());
            lines.push(format!("- **Start**: {}", statistics.time_range.start.to_rfc3339()));
            lines.push(format!("- **End**: {}\n", statistics.time_range.end.to_rfc3339()));
        }

        // Registry Statistics
        if !statistics.by_registry.is_empty() {
            lines.push("## Registry Statistics\n".to_string());
            lines.push("| Registry | Attempts | Successes | Failures | Success Rate | Avg Duration |".to_string());
            lines.push("|----------|----------|-----------|----------|--------------|--------------|".to_string());

            for stats in statistics.by_registry.values() {
                lines.push(format!(
                    "| {} | {} | {} | {} | {:.1}% | {:.2}s |",
                    stats.registry,
                    stats.attempts,
                    stats.successes,
                    stats.failures,
                    stats.success_rate,
                    stats.average_duration / 1000.0
                ));
            }
            lines.push(String::new());
        }

        // Recent Publishes
        if !recent_publishes.is_empty() {
            lines.push("## Recent Publishes\n".to_string());
            lines.push("| Timestamp | Registry | Package | Version | Status | Duration |".to_string());
            lines.push("|-----------|----------|---------|---------|--------|----------|".to_string());

            for record in recent_publishes {
                let status = if record.success { "✅ Success" } else { "❌ Failed" };
                let timestamp = record.timestamp.format("%Y-%m-%d").to_string();
                let duration = format!("{:.2}s", record.duration as f64 / 1000.0);

                lines.push(format!(
                    "| {} | {} | {} | {} | {} | {} |",
                    timestamp, record.registry, record.package_name, record.version, status, duration
                ));
            }
            lines.push(String::new());
        }

        lines.join("\n")
    }

    fn generate_json_export(
        &self,
        statistics: &PublishStatistics,
        recent_publishes: &[AnalyticsRecord],
    ) -> Result<String, anyhow::Error> {
        let data = serde_json::json!({
            "generatedAt": Utc::now().to_rfc3339(),
            "statistics": {
                "totalAttempts": statistics.total_attempts,
                "successCount": statistics.success_count,
                "failureCount": statistics.failure_count,
                "successRate": statistics.success_rate,
                "averageDuration": statistics.average_duration,
                "byRegistry": statistics.by_registry.values().collect::<Vec<_>>(),
                "timeRange": statistics.time_range,
            },
            "recentPublishes": recent_publishes,
        });

        Ok(serde_json::to_string_pretty(&data)?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_new_analytics() {
        let analytics = PublishAnalytics::new(".");
        assert_eq!(analytics.records.len(), 0);
    }

    #[test]
    fn test_analytics_options_default() {
        let options = AnalyticsOptions::default();
        assert_eq!(options.registry, None);
        assert_eq!(options.success_only, false);
        assert_eq!(options.failures_only, false);
    }
}
