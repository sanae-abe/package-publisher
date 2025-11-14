//! NPM Plugin - NPM registry publishing implementation
//!
//! This module provides NPM registry integration via the RegistryPlugin trait.

use crate::core::traits::{
    DryRunResult, PublishOptions, PublishResult, RegistryPlugin, ValidationResult,
    VerificationResult,
};
use async_trait::async_trait;
use std::path::Path;

/// NPM registry plugin
pub struct NpmPlugin {
    _private: (),
}

impl Default for NpmPlugin {
    fn default() -> Self {
        Self::new()
    }
}

impl NpmPlugin {
    /// Create a new NPM plugin instance
    pub fn new() -> Self {
        Self { _private: () }
    }

    /// Detect NPM project (helper method)
    pub async fn detect_project(&self, project_path: &Path) -> anyhow::Result<bool> {
        let package_json = project_path.join("package.json");
        Ok(tokio::fs::metadata(&package_json).await.is_ok())
    }
}

#[async_trait]
impl RegistryPlugin for NpmPlugin {
    fn name(&self) -> &str {
        "npm"
    }

    fn version(&self) -> &str {
        "1.0.0"
    }

    async fn detect(&self, project_path: &str) -> anyhow::Result<bool> {
        let package_json = Path::new(project_path).join("package.json");
        Ok(tokio::fs::metadata(&package_json).await.is_ok())
    }

    async fn validate(&self) -> anyhow::Result<ValidationResult> {
        Ok(ValidationResult {
            valid: true,
            errors: Vec::new(),
            warnings: Vec::new(),
            metadata: None,
        })
    }

    async fn dry_run(&self) -> anyhow::Result<DryRunResult> {
        Ok(DryRunResult {
            success: true,
            output: "Dry run successful (stub)".to_string(),
            estimated_size: Some("0 B".to_string()),
            errors: None,
        })
    }

    async fn publish(&self, _options: Option<PublishOptions>) -> anyhow::Result<PublishResult> {
        Ok(PublishResult {
            success: true,
            version: Some("0.0.0".to_string()),
            package_url: Some("https://registry.npmjs.org/stub-package".to_string()),
            output: Some("Stub: Not yet implemented".to_string()),
            error: None,
            metadata: None,
        })
    }

    async fn verify(&self) -> anyhow::Result<VerificationResult> {
        Ok(VerificationResult {
            verified: false,
            version: None,
            url: Some("https://registry.npmjs.org".to_string()),
            error: Some("Stub: Not yet implemented".to_string()),
            metadata: None,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::TempDir;

    #[test]
    fn test_new_plugin() {
        let plugin = NpmPlugin::new();
        assert_eq!(plugin.name(), "npm");
    }

    #[tokio::test]
    async fn test_detect_with_package_json() {
        let temp_dir = TempDir::new().unwrap();
        let package_json = temp_dir.path().join("package.json");
        let mut file = std::fs::File::create(&package_json).unwrap();
        writeln!(file, r#"{{"name": "test"}}"#).unwrap();

        let plugin = NpmPlugin::new();
        let result = plugin.detect(temp_dir.path().to_str().unwrap()).await.unwrap();
        assert!(result);
    }

    #[tokio::test]
    async fn test_detect_without_package_json() {
        let temp_dir = TempDir::new().unwrap();
        let plugin = NpmPlugin::new();
        let result = plugin.detect(temp_dir.path().to_str().unwrap()).await.unwrap();
        assert!(!result);
    }

    #[tokio::test]
    async fn test_validate() {
        let plugin = NpmPlugin::new();
        let result = plugin.validate().await.unwrap();
        assert!(result.valid);
    }

    #[test]
    fn test_version() {
        let plugin = NpmPlugin::new();
        assert_eq!(plugin.version(), "1.0.0");
    }
}
