//! Crates.io Plugin - Crates.io registry publishing implementation

use crate::core::traits::{
    DryRunResult, PublishOptions, PublishResult, RegistryPlugin, ValidationResult,
    VerificationResult,
};
use async_trait::async_trait;
use std::path::Path;

/// Crates.io registry plugin
pub struct CratesIoPlugin {
    _private: (),
}

impl Default for CratesIoPlugin {
    fn default() -> Self {
        Self::new()
    }
}

impl CratesIoPlugin {
    pub fn new() -> Self {
        Self { _private: () }
    }
}

#[async_trait]
impl RegistryPlugin for CratesIoPlugin {
    fn name(&self) -> &str {
        "crates-io"
    }

    fn version(&self) -> &str {
        "1.0.0"
    }

    async fn detect(&self, project_path: &str) -> anyhow::Result<bool> {
        let cargo_toml = Path::new(project_path).join("Cargo.toml");
        Ok(tokio::fs::metadata(&cargo_toml).await.is_ok())
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
            package_url: Some("https://crates.io/crates/stub-crate".to_string()),
            output: Some("Stub: Not yet implemented".to_string()),
            error: None,
            metadata: None,
        })
    }

    async fn verify(&self) -> anyhow::Result<VerificationResult> {
        Ok(VerificationResult {
            verified: false,
            version: None,
            url: Some("https://crates.io".to_string()),
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

    #[tokio::test]
    async fn test_detect() {
        let temp_dir = TempDir::new().unwrap();
        let cargo_toml = temp_dir.path().join("Cargo.toml");
        let mut file = std::fs::File::create(&cargo_toml).unwrap();
        writeln!(file, "[package]\nname = \"test\"").unwrap();

        let plugin = CratesIoPlugin::new();
        assert!(plugin.detect(temp_dir.path().to_str().unwrap()).await.unwrap());
    }

    #[test]
    fn test_version() {
        let plugin = CratesIoPlugin::new();
        assert_eq!(plugin.version(), "1.0.0");
    }
}
