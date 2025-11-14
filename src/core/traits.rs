//! Core traits and types for package publishing
//!
//! This module defines the fundamental abstractions for registry plugins,
//! validation, publishing, and verification workflows.

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ============================================================================
// Severity Levels
// ============================================================================

/// Severity level for validation issues
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Critical,
    High,
    Medium,
    Low,
}

// ============================================================================
// Validation
// ============================================================================

/// Validation error with field information
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ValidationError {
    pub field: String,
    pub message: String,
    #[serde(default = "default_error_severity")]
    pub severity: String, // Always "error"
}

fn default_error_severity() -> String {
    "error".to_string()
}

/// Validation warning with field information
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ValidationWarning {
    pub field: String,
    pub message: String,
    #[serde(default = "default_warning_severity")]
    pub severity: String, // Always "warning"
}

fn default_warning_severity() -> String {
    "warning".to_string()
}

/// Result of package validation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationResult {
    pub valid: bool,
    pub errors: Vec<ValidationError>,
    pub warnings: Vec<ValidationWarning>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<HashMap<String, serde_json::Value>>,
}

// ============================================================================
// Dry Run
// ============================================================================

/// Result of a dry-run publish operation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DryRunResult {
    pub success: bool,
    pub output: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub estimated_size: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub errors: Option<Vec<ValidationError>>,
}

// ============================================================================
// Publishing
// ============================================================================

/// Options for publish operations
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PublishOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dry_run: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub non_interactive: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub otp: Option<String>, // 2FA one-time password
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tag: Option<String>, // npm: dist-tag, cargo: --tag
    #[serde(skip_serializing_if = "Option::is_none")]
    pub access: Option<String>, // "public" | "restricted"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resume: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub registry: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub skip_hooks: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hooks_only: Option<bool>,
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>, // Plugin-specific options
}

/// Result of a publish operation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublishResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub package_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<HashMap<String, serde_json::Value>>,
}

// ============================================================================
// Verification
// ============================================================================

/// Result of package verification
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerificationResult {
    pub verified: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<HashMap<String, serde_json::Value>>,
}

// ============================================================================
// Rollback
// ============================================================================

/// Result of a rollback operation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RollbackResult {
    pub success: bool,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

// ============================================================================
// Registry Plugin Trait
// ============================================================================

/// Main trait for registry plugin implementations
///
/// This trait defines the standard interface for all package registry plugins.
/// Implementations handle registry-specific logic for detection, validation,
/// publishing, and verification.
#[async_trait]
pub trait RegistryPlugin: Send + Sync {
    /// Plugin name (e.g., "npm", "crates-io")
    fn name(&self) -> &str;

    /// Plugin version (semver)
    fn version(&self) -> &str;

    /// Detect if this registry is applicable for the given project
    ///
    /// # Arguments
    ///
    /// * `project_path` - Path to the project directory
    ///
    /// # Examples
    ///
    /// ```no_run
    /// # use package_publisher::core::RegistryPlugin;
    /// # use async_trait::async_trait;
    /// # struct MyPlugin;
    /// # #[async_trait]
    /// # impl RegistryPlugin for MyPlugin {
    /// #   fn name(&self) -> &str { "my-plugin" }
    /// #   fn version(&self) -> &str { "1.0.0" }
    /// async fn detect(&self, project_path: &str) -> anyhow::Result<bool> {
    ///     // Check for package.json, Cargo.toml, etc.
    ///     Ok(std::path::Path::new(project_path).join("package.json").exists())
    /// }
    /// #   async fn validate(&self) -> anyhow::Result<package_publisher::core::ValidationResult> { unimplemented!() }
    /// #   async fn dry_run(&self) -> anyhow::Result<package_publisher::core::DryRunResult> { unimplemented!() }
    /// #   async fn publish(&self, _: Option<package_publisher::core::PublishOptions>) -> anyhow::Result<package_publisher::core::PublishResult> { unimplemented!() }
    /// #   async fn verify(&self) -> anyhow::Result<package_publisher::core::VerificationResult> { unimplemented!() }
    /// # }
    /// ```
    async fn detect(&self, project_path: &str) -> anyhow::Result<bool>;

    /// Validate package metadata and readiness for publishing
    ///
    /// # Examples
    ///
    /// ```no_run
    /// # use package_publisher::core::{RegistryPlugin, ValidationResult, ValidationError};
    /// # use async_trait::async_trait;
    /// # struct MyPlugin;
    /// # #[async_trait]
    /// # impl RegistryPlugin for MyPlugin {
    /// #   fn name(&self) -> &str { "my-plugin" }
    /// #   fn version(&self) -> &str { "1.0.0" }
    /// #   async fn detect(&self, _: &str) -> anyhow::Result<bool> { unimplemented!() }
    /// async fn validate(&self) -> anyhow::Result<ValidationResult> {
    ///     Ok(ValidationResult {
    ///         valid: true,
    ///         errors: vec![],
    ///         warnings: vec![],
    ///         metadata: None,
    ///     })
    /// }
    /// #   async fn dry_run(&self) -> anyhow::Result<package_publisher::core::DryRunResult> { unimplemented!() }
    /// #   async fn publish(&self, _: Option<package_publisher::core::PublishOptions>) -> anyhow::Result<package_publisher::core::PublishResult> { unimplemented!() }
    /// #   async fn verify(&self) -> anyhow::Result<package_publisher::core::VerificationResult> { unimplemented!() }
    /// # }
    /// ```
    async fn validate(&self) -> anyhow::Result<ValidationResult>;

    /// Perform a dry-run of the publishing process
    async fn dry_run(&self) -> anyhow::Result<DryRunResult>;

    /// Publish the package to the registry
    ///
    /// # Arguments
    ///
    /// * `options` - Optional publish options
    async fn publish(
        &self,
        options: Option<PublishOptions>,
    ) -> anyhow::Result<PublishResult>;

    /// Verify that the package was published successfully
    async fn verify(&self) -> anyhow::Result<VerificationResult>;

    /// Rollback a published version (if supported)
    ///
    /// Default implementation returns an error indicating rollback is not supported.
    async fn rollback(&self, version: &str) -> anyhow::Result<RollbackResult> {
        Ok(RollbackResult {
            success: false,
            message: format!("{} does not support rollback", self.name()),
            error: Some(format!("Rollback not supported for version {}", version)),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validation_error_creation() {
        let error = ValidationError {
            field: "version".to_string(),
            message: "Invalid version format".to_string(),
            severity: "error".to_string(),
        };

        assert_eq!(error.field, "version");
        assert_eq!(error.severity, "error");
    }

    #[test]
    fn test_validation_warning_creation() {
        let warning = ValidationWarning {
            field: "description".to_string(),
            message: "Description is empty".to_string(),
            severity: "warning".to_string(),
        };

        assert_eq!(warning.field, "description");
        assert_eq!(warning.severity, "warning");
    }

    #[test]
    fn test_validation_result_valid() {
        let result = ValidationResult {
            valid: true,
            errors: vec![],
            warnings: vec![],
            metadata: None,
        };

        assert!(result.valid);
        assert!(result.errors.is_empty());
        assert!(result.warnings.is_empty());
    }

    #[test]
    fn test_validation_result_with_errors() {
        let result = ValidationResult {
            valid: false,
            errors: vec![ValidationError {
                field: "name".to_string(),
                message: "Name is required".to_string(),
                severity: "error".to_string(),
            }],
            warnings: vec![],
            metadata: None,
        };

        assert!(!result.valid);
        assert_eq!(result.errors.len(), 1);
        assert_eq!(result.errors[0].field, "name");
    }

    #[test]
    fn test_dry_run_result_success() {
        let result = DryRunResult {
            success: true,
            output: "Dry run completed successfully".to_string(),
            estimated_size: Some("1.2 MB".to_string()),
            errors: None,
        };

        assert!(result.success);
        assert!(result.estimated_size.is_some());
    }

    #[test]
    fn test_publish_options_default() {
        let options = PublishOptions::default();

        assert!(options.dry_run.is_none());
        assert!(options.non_interactive.is_none());
        assert!(options.otp.is_none());
    }

    #[test]
    fn test_publish_result_success() {
        let result = PublishResult {
            success: true,
            version: Some("1.0.0".to_string()),
            package_url: Some("https://registry.example.com/pkg@1.0.0".to_string()),
            output: None,
            error: None,
            metadata: None,
        };

        assert!(result.success);
        assert_eq!(result.version, Some("1.0.0".to_string()));
    }

    #[test]
    fn test_publish_result_failure() {
        let result = PublishResult {
            success: false,
            version: None,
            package_url: None,
            output: None,
            error: Some("Authentication failed".to_string()),
            metadata: None,
        };

        assert!(!result.success);
        assert!(result.error.is_some());
    }

    #[test]
    fn test_verification_result_verified() {
        let result = VerificationResult {
            verified: true,
            version: Some("1.0.0".to_string()),
            url: Some("https://registry.example.com/pkg".to_string()),
            error: None,
            metadata: None,
        };

        assert!(result.verified);
        assert!(result.version.is_some());
    }

    #[test]
    fn test_rollback_result_not_supported() {
        let result = RollbackResult {
            success: false,
            message: "Rollback not supported".to_string(),
            error: Some("This registry does not support rollback".to_string()),
        };

        assert!(!result.success);
        assert!(result.error.is_some());
    }

    #[test]
    fn test_severity_serialization() {
        let severity = Severity::Critical;
        let json = serde_json::to_string(&severity).unwrap();
        assert_eq!(json, r#""critical""#);

        let deserialized: Severity = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, Severity::Critical);
    }

    #[test]
    fn test_validation_result_serialization() {
        let result = ValidationResult {
            valid: true,
            errors: vec![],
            warnings: vec![ValidationWarning {
                field: "readme".to_string(),
                message: "README.md not found".to_string(),
                severity: "warning".to_string(),
            }],
            metadata: None,
        };

        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("\"valid\":true"));
        assert!(json.contains("\"readme\""));

        let deserialized: ValidationResult = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.warnings.len(), 1);
    }

    #[test]
    fn test_publish_options_with_extra_fields() {
        let mut options = PublishOptions::default();
        options.extra.insert(
            "custom_flag".to_string(),
            serde_json::Value::Bool(true),
        );

        let json = serde_json::to_string(&options).unwrap();
        assert!(json.contains("\"custom_flag\":true"));
    }
}
