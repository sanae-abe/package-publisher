//! Configuration structures and types for package-publisher
//!
//! This module provides type-safe configuration management with serde support.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Root configuration object
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PublishConfig {
    /// Schema version (required)
    pub version: String,

    /// Extend from base configuration file (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extends: Option<String>,

    /// Variable definitions (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub variables: Option<HashMap<String, String>>,

    /// Project basic information (optional, auto-detection available)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project: Option<ProjectConfig>,

    /// Registry-specific configurations (required)
    pub registries: RegistryConfigs,

    /// Security settings (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub security: Option<SecurityConfig>,

    /// Pre/Post-publish hooks (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hooks: Option<HooksConfig>,

    /// Publish options (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub publish: Option<PublishOptionsConfig>,

    /// Validation rules (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub validation: Option<ValidationConfig>,

    /// Notification settings (optional, Phase 4-4)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notifications: Option<NotificationsConfig>,

    /// Plugin configurations (optional, Phase 4-5)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plugins: Option<Vec<PluginConfig>>,
}

/// Project basic information
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ProjectConfig {
    /// Package name (optional, auto-detection from package.json/Cargo.toml etc.)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,

    /// Default registry to publish (optional, auto-detect if not specified)
    #[serde(skip_serializing_if = "Option::is_none", rename = "defaultRegistry")]
    pub default_registry: Option<String>,
}

/// Registry configurations
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct RegistryConfigs {
    /// npm registry configuration
    #[serde(skip_serializing_if = "Option::is_none")]
    pub npm: Option<NPMRegistryConfig>,

    /// crates.io registry configuration
    #[serde(skip_serializing_if = "Option::is_none")]
    pub crates: Option<CratesRegistryConfig>,

    /// PyPI registry configuration
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pypi: Option<PyPIRegistryConfig>,

    /// Homebrew registry configuration
    #[serde(skip_serializing_if = "Option::is_none")]
    pub homebrew: Option<HomebrewRegistryConfig>,

    /// Custom registries (generic schema)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom: Option<HashMap<String, CustomRegistryConfig>>,
}

/// npm registry configuration
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct NPMRegistryConfig {
    /// Enable this registry (default: true if defined)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,

    /// npm dist-tag (default: "latest")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tag: Option<String>,

    /// Package access level (default: "public")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub access: Option<NPMAccess>,

    /// One-time password (2FA) configuration
    #[serde(skip_serializing_if = "Option::is_none")]
    pub otp: Option<OTPConfig>,
}

/// npm package access level
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum NPMAccess {
    Public,
    Restricted,
}

/// OTP (2FA) configuration
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct OTPConfig {
    /// Is OTP required? (default: false)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub required: Option<bool>,

    /// When to prompt for OTP (required if otp.required=true)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompt: Option<String>,
}

/// crates.io registry configuration
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CratesRegistryConfig {
    /// Enable this registry (default: true if defined)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,

    /// Cargo features to enable
    #[serde(skip_serializing_if = "Option::is_none")]
    pub features: Option<Vec<String>>,
}

/// PyPI registry configuration
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PyPIRegistryConfig {
    /// Enable this registry (default: true if defined)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,

    /// Repository name (default: "pypi")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub repository: Option<PyPIRepository>,
}

/// PyPI repository name
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum PyPIRepository {
    Pypi,
    Testpypi,
}

/// Homebrew registry configuration
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct HomebrewRegistryConfig {
    /// Enable this registry (default: true if defined)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,

    /// Custom tap name (default: auto-detect)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tap: Option<String>,
}

/// Custom registry configuration (generic schema)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CustomRegistryConfig {
    /// Enable this registry (default: true if defined)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,

    /// Plugin type
    #[serde(rename = "type")]
    pub plugin_type: String,

    /// Plugin-specific configuration
    pub config: HashMap<String, serde_json::Value>,

    /// Publish command template (optional)
    #[serde(skip_serializing_if = "Option::is_none", rename = "publishCommand")]
    pub publish_command: Option<String>,

    /// Verify command template (optional)
    #[serde(skip_serializing_if = "Option::is_none", rename = "verifyCommand")]
    pub verify_command: Option<String>,
}

/// Security configuration
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SecurityConfig {
    /// Environment variable expansion settings
    #[serde(skip_serializing_if = "Option::is_none", rename = "envVarExpansion")]
    pub env_var_expansion: Option<EnvVarExpansionConfig>,

    /// Secrets scanning settings
    #[serde(skip_serializing_if = "Option::is_none", rename = "secretsScanning")]
    pub secrets_scanning: Option<SecretsScanningConfig>,

    /// Allowed commands settings
    #[serde(skip_serializing_if = "Option::is_none", rename = "allowedCommands")]
    pub allowed_commands: Option<HashMap<String, AllowedCommandConfig>>,
}

/// Environment variable expansion configuration
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EnvVarExpansionConfig {
    /// Enable environment variable expansion (default: true)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,

    /// Allowed environment variable prefixes (default: all)
    #[serde(skip_serializing_if = "Option::is_none", rename = "allowedPrefixes")]
    pub allowed_prefixes: Option<Vec<String>>,

    /// Forbidden patterns (regex) for environment variable names
    #[serde(skip_serializing_if = "Option::is_none", rename = "forbiddenPatterns")]
    pub forbidden_patterns: Option<Vec<String>>,
}

/// Secrets scanning configuration
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SecretsScanningConfig {
    /// Enable secrets scanning (default: true)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,

    /// Patterns to ignore during scanning
    #[serde(skip_serializing_if = "Option::is_none", rename = "ignorePatterns")]
    pub ignore_patterns: Option<Vec<IgnorePattern>>,

    /// Reject path traversal attempts (default: true)
    #[serde(skip_serializing_if = "Option::is_none", rename = "rejectTraversal")]
    pub reject_traversal: Option<bool>,
}

/// Ignore pattern for secrets scanning
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct IgnorePattern {
    /// Pattern to match (glob pattern)
    pub pattern: String,

    /// Path prefix to restrict (prevent path traversal)
    #[serde(rename = "pathPrefix")]
    pub path_prefix: String,
}

/// Allowed commands configuration
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AllowedCommandConfig {
    /// Full path to executable (required)
    pub executable: String,

    /// Allowed arguments (whitelist)
    #[serde(rename = "allowedArgs")]
    pub allowed_args: Vec<String>,

    /// Forbidden arguments (blacklist, optional)
    #[serde(skip_serializing_if = "Option::is_none", rename = "forbiddenArgs")]
    pub forbidden_args: Option<Vec<String>>,
}

/// Hooks configuration
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct HooksConfig {
    /// Pre-build hooks
    #[serde(skip_serializing_if = "Option::is_none", rename = "preBuild")]
    pub pre_build: Option<Vec<HookCommand>>,

    /// Pre-publish hooks
    #[serde(skip_serializing_if = "Option::is_none", rename = "prePublish")]
    pub pre_publish: Option<Vec<HookCommand>>,

    /// Post-publish hooks
    #[serde(skip_serializing_if = "Option::is_none", rename = "postPublish")]
    pub post_publish: Option<Vec<HookCommand>>,

    /// Error handling hooks
    #[serde(skip_serializing_if = "Option::is_none", rename = "onError")]
    pub on_error: Option<Vec<HookCommand>>,
}

/// Hook command configuration
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct HookCommand {
    /// Command to execute
    pub command: String,

    /// Allowed commands for this hook (required)
    #[serde(rename = "allowedCommands")]
    pub allowed_commands: Vec<String>,

    /// Timeout in seconds (default: 300)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timeout: Option<u32>,

    /// Working directory (default: "./")
    #[serde(skip_serializing_if = "Option::is_none", rename = "workingDirectory")]
    pub working_directory: Option<String>,
}

/// Publish options configuration
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PublishOptionsConfig {
    /// Dry-run behavior (default: "first")
    #[serde(skip_serializing_if = "Option::is_none", rename = "dryRun")]
    pub dry_run: Option<DryRunMode>,

    /// Confirm before publish (default: true in interactive mode)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub confirm: Option<bool>,

    /// Verify after publish (default: true)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub verify: Option<bool>,

    /// Interactive mode (default: true)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub interactive: Option<bool>,
}

/// Dry-run mode
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DryRunMode {
    First,
    Always,
    Never,
}

/// Validation configuration
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ValidationConfig {
    /// Custom validation rules
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rules: Option<Vec<ValidationRule>>,
}

/// Validation rule
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ValidationRule {
    /// Rule name
    pub name: String,

    /// Pattern to match (regex)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pattern: Option<String>,

    /// Condition expression
    #[serde(skip_serializing_if = "Option::is_none")]
    pub condition: Option<String>,

    /// Field to validate
    pub field: String,

    /// Severity level (default: "error")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub severity: Option<ValidationSeverity>,

    /// Error message to display
    #[serde(rename = "errorMessage")]
    pub error_message: String,
}

/// Validation severity
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ValidationSeverity {
    Error,
    Warning,
}

/// Notifications configuration (Phase 4-4)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct NotificationsConfig {
    /// Enable notifications (default: false)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,

    /// Slack notification settings
    #[serde(skip_serializing_if = "Option::is_none")]
    pub slack: Option<SlackNotificationConfig>,

    /// Email notification settings
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email: Option<EmailNotificationConfig>,
}

/// Slack notification configuration
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SlackNotificationConfig {
    /// Slack webhook URL (environment variable expansion supported)
    #[serde(rename = "webhookUrl")]
    pub webhook_url: String,
}

/// Email notification configuration
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EmailNotificationConfig {
    /// Email recipients
    pub recipients: Vec<String>,
}

/// Plugin configuration (Phase 4-5)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PluginConfig {
    /// Plugin name (npm package or local path)
    pub name: String,

    /// Plugin version (npm package version)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,

    /// Plugin-specific configuration
    pub config: HashMap<String, serde_json::Value>,
}

/// Default configuration values
impl Default for PublishConfig {
    fn default() -> Self {
        Self {
            version: "1.0".to_string(),
            extends: None,
            variables: None,
            project: None,
            registries: RegistryConfigs {
                npm: None,
                crates: None,
                pypi: None,
                homebrew: None,
                custom: None,
            },
            security: Some(SecurityConfig::default()),
            hooks: None,
            publish: Some(PublishOptionsConfig::default()),
            validation: None,
            notifications: None,
            plugins: None,
        }
    }
}

impl Default for SecurityConfig {
    fn default() -> Self {
        Self {
            env_var_expansion: Some(EnvVarExpansionConfig {
                enabled: Some(true),
                allowed_prefixes: None,
                forbidden_patterns: None,
            }),
            secrets_scanning: Some(SecretsScanningConfig {
                enabled: Some(true),
                ignore_patterns: None,
                reject_traversal: Some(true),
            }),
            allowed_commands: None,
        }
    }
}

impl Default for PublishOptionsConfig {
    fn default() -> Self {
        Self {
            dry_run: Some(DryRunMode::First),
            confirm: Some(true),
            verify: Some(true),
            interactive: Some(true),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = PublishConfig::default();
        assert_eq!(config.version, "1.0");
        assert!(config.security.is_some());
        assert!(config.publish.is_some());
    }

    #[test]
    fn test_serialize_config() {
        let config = PublishConfig::default();
        let yaml = serde_yaml::to_string(&config).unwrap();
        assert!(yaml.contains("version: '1.0'"));
    }

    #[test]
    fn test_deserialize_minimal_config() {
        let yaml = r#"
version: "1.0"
registries:
  npm:
    enabled: true
"#;
        let config: PublishConfig = serde_yaml::from_str(yaml).unwrap();
        assert_eq!(config.version, "1.0");
        assert!(config.registries.npm.is_some());
    }

    #[test]
    fn test_npm_access_serialization() {
        let config = NPMRegistryConfig {
            enabled: Some(true),
            tag: Some("latest".to_string()),
            access: Some(NPMAccess::Public),
            otp: None,
        };
        let yaml = serde_yaml::to_string(&config).unwrap();
        assert!(yaml.contains("access: public"));
    }

    #[test]
    fn test_dry_run_mode_serialization() {
        let config = PublishOptionsConfig {
            dry_run: Some(DryRunMode::First),
            confirm: Some(true),
            verify: Some(true),
            interactive: Some(true),
        };
        let yaml = serde_yaml::to_string(&config).unwrap();
        assert!(yaml.contains("dryRun: first"));
    }

    #[test]
    fn test_pypi_repository_serialization() {
        let config = PyPIRegistryConfig {
            enabled: Some(true),
            repository: Some(PyPIRepository::Testpypi),
        };
        let yaml = serde_yaml::to_string(&config).unwrap();
        assert!(yaml.contains("repository: testpypi"));
    }

    #[test]
    fn test_validation_severity() {
        let rule = ValidationRule {
            name: "test-rule".to_string(),
            pattern: Some(r"^\d+\.\d+\.\d+$".to_string()),
            condition: None,
            field: "version".to_string(),
            severity: Some(ValidationSeverity::Warning),
            error_message: "Invalid version format".to_string(),
        };
        let yaml = serde_yaml::to_string(&rule).unwrap();
        assert!(yaml.contains("severity: warning"));
    }
}
