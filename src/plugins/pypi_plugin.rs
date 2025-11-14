//! PyPI Plugin - PyPI registry publishing implementation

use crate::core::traits::{
    DryRunResult, PublishOptions, PublishResult, RegistryPlugin, ValidationResult,
    VerificationResult,
};
use async_trait::async_trait;
use std::path::Path;

/// PyPI registry plugin
pub struct PyPiPlugin {
    _private: (),
}

impl Default for PyPiPlugin {
    fn default() -> Self {
        Self::new()
    }
}

impl PyPiPlugin {
    pub fn new() -> Self {
        Self { _private: () }
    }
}

#[async_trait]
impl RegistryPlugin for PyPiPlugin {
    fn name(&self) -> &str {
        "pypi"
    }

    fn version(&self) -> &str {
        "1.0.0"
    }

    async fn detect(&self, project_path: &str) -> anyhow::Result<bool> {
        let path = Path::new(project_path);
        let pyproject = path.join("pyproject.toml");
        let setup_py = path.join("setup.py");

        Ok(tokio::fs::metadata(&pyproject).await.is_ok()
            || tokio::fs::metadata(&setup_py).await.is_ok())
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
            package_url: Some("https://pypi.org/project/stub-package".to_string()),
            output: Some("Stub: Not yet implemented".to_string()),
            error: None,
            metadata: None,
        })
    }

    async fn verify(&self) -> anyhow::Result<VerificationResult> {
        Ok(VerificationResult {
            verified: false,
            version: None,
            url: Some("https://pypi.org".to_string()),
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
    async fn test_detect_pyproject() {
        let temp_dir = TempDir::new().unwrap();
        let pyproject = temp_dir.path().join("pyproject.toml");
        let mut file = std::fs::File::create(&pyproject).unwrap();
        writeln!(file, "[project]\nname = \"test\"").unwrap();

        let plugin = PyPiPlugin::new();
        assert!(plugin.detect(temp_dir.path().to_str().unwrap()).await.unwrap());
    }

    #[tokio::test]
    async fn test_detect_setup_py() {
        let temp_dir = TempDir::new().unwrap();
        let setup_py = temp_dir.path().join("setup.py");
        std::fs::File::create(&setup_py).unwrap();

        let plugin = PyPiPlugin::new();
        assert!(plugin.detect(temp_dir.path().to_str().unwrap()).await.unwrap());
    }

    #[test]
    fn test_version() {
        let plugin = PyPiPlugin::new();
        assert_eq!(plugin.version(), "1.0.0");
    }
}
