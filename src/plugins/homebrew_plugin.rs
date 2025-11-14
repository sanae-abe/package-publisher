//! Homebrew Plugin - Homebrew tap publishing implementation

use crate::core::traits::{
    DryRunResult, PublishOptions, PublishResult, RegistryPlugin, ValidationResult,
    VerificationResult,
};
use async_trait::async_trait;
use std::path::Path;

/// Homebrew tap plugin
pub struct HomebrewPlugin {
    _private: (),
}

impl Default for HomebrewPlugin {
    fn default() -> Self {
        Self::new()
    }
}

impl HomebrewPlugin {
    pub fn new() -> Self {
        Self { _private: () }
    }
}

#[async_trait]
impl RegistryPlugin for HomebrewPlugin {
    fn name(&self) -> &str {
        "homebrew"
    }

    fn version(&self) -> &str {
        "1.0.0"
    }

    async fn detect(&self, project_path: &str) -> anyhow::Result<bool> {
        let path = Path::new(project_path);
        let formula_dir = path.join("Formula");
        if tokio::fs::metadata(&formula_dir).await.is_ok() {
            // Check if there's at least one .rb file
            let mut entries = tokio::fs::read_dir(&formula_dir).await?;
            while let Some(entry) = entries.next_entry().await? {
                if entry.path().extension().map(|e| e == "rb").unwrap_or(false) {
                    return Ok(true);
                }
            }
        }
        Ok(false)
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
            package_url: Some("homebrew-tap/stub-formula".to_string()),
            output: Some("Stub: Not yet implemented".to_string()),
            error: None,
            metadata: None,
        })
    }

    async fn verify(&self) -> anyhow::Result<VerificationResult> {
        Ok(VerificationResult {
            verified: false,
            version: None,
            url: Some("homebrew-tap".to_string()),
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
        let formula_dir = temp_dir.path().join("Formula");
        std::fs::create_dir(&formula_dir).unwrap();
        let formula = formula_dir.join("test.rb");
        let mut file = std::fs::File::create(&formula).unwrap();
        writeln!(file, "class Test < Formula\nend").unwrap();

        let plugin = HomebrewPlugin::new();
        assert!(plugin.detect(temp_dir.path().to_str().unwrap()).await.unwrap());
    }

    #[test]
    fn test_version() {
        let plugin = HomebrewPlugin::new();
        assert_eq!(plugin.version(), "1.0.0");
    }
}
