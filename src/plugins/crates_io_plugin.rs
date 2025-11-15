//! Crates.io Plugin - Crates.io registry publishing implementation
//!
//! This module provides comprehensive Crates.io registry integration including:
//! - Cargo.toml detection and validation
//! - Crates.io naming rules enforcement
//! - SemVer version validation
//! - cargo check/clippy integration
//! - Dry-run and publish operations
//! - Package verification on crates.io
//! - Yank support for rollback

use crate::core::traits::{
    DryRunResult, PublishOptions, PublishResult, RegistryPlugin, ValidationError,
    ValidationResult, ValidationWarning, VerificationResult,
};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tokio::fs;
use tokio::process::Command;

/// Cargo.toml package section
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CargoPackage {
    pub name: Option<String>,
    pub version: Option<String>,
    pub authors: Option<Vec<String>>,
    pub license: Option<String>,
    pub description: Option<String>,
    pub repository: Option<String>,
    pub homepage: Option<String>,
    pub keywords: Option<Vec<String>>,
    pub categories: Option<Vec<String>>,
    pub edition: Option<String>,
}

/// Cargo.toml structure (simplified)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CargoToml {
    pub package: Option<CargoPackage>,
    #[serde(default)]
    pub dependencies: HashMap<String, toml::Value>,
}

/// Crates.io API crate info
#[derive(Debug, Deserialize)]
struct CratesIoCrateInfo {
    #[serde(rename = "crate")]
    crate_info: CrateData,
    versions: Vec<VersionData>,
}

#[derive(Debug, Deserialize)]
struct CrateData {
    newest_version: String,
}

#[derive(Debug, Deserialize)]
struct VersionData {
    num: String,
}

/// Crates.io registry plugin
pub struct CratesIoPlugin {
    project_path: PathBuf,
}

impl Default for CratesIoPlugin {
    fn default() -> Self {
        Self::new(PathBuf::from("."))
    }
}

impl CratesIoPlugin {
    /// Create a new Crates.io plugin instance
    pub fn new(project_path: PathBuf) -> Self {
        Self { project_path }
    }

    /// Load and parse Cargo.toml
    async fn load_cargo_toml(&self) -> anyhow::Result<CargoToml> {
        let cargo_toml_path = self.project_path.join("Cargo.toml");
        let content = fs::read_to_string(&cargo_toml_path).await?;
        let cargo_toml: CargoToml = toml::from_str(&content)?;
        Ok(cargo_toml)
    }

    /// Validate package name according to crates.io rules
    /// https://doc.rust-lang.org/cargo/reference/manifest.html#the-name-field
    fn validate_package_name(&self, name: &str) -> Vec<ValidationError> {
        let mut errors = Vec::new();

        // Must be alphanumeric with dashes and underscores
        if !name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
        {
            errors.push(ValidationError {
                field: "package.name".to_string(),
                message: "パッケージ名は英数字、ハイフン、アンダースコアのみ使用可能です"
                    .to_string(),
                severity: "error".to_string(),
            });
        }

        // Cannot be empty
        if name.is_empty() {
            errors.push(ValidationError {
                field: "package.name".to_string(),
                message: "パッケージ名は空にできません".to_string(),
                severity: "error".to_string(),
            });
        }

        // Max length check (crates.io limit)
        if name.len() > 64 {
            errors.push(ValidationError {
                field: "package.name".to_string(),
                message: "パッケージ名は64文字以内である必要があります".to_string(),
                severity: "error".to_string(),
            });
        }

        errors
    }

    /// Validate SemVer version
    fn is_valid_semver(&self, version: &str) -> bool {
        semver::Version::parse(version).is_ok()
    }

    /// Run cargo command
    async fn run_cargo(&self, args: &[&str]) -> anyhow::Result<String> {
        let output = Command::new("cargo")
            .args(args)
            .current_dir(&self.project_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await?;

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();

        if !output.status.success() {
            anyhow::bail!("{}", stderr);
        }

        Ok(stdout + &stderr)
    }

    /// Fetch crate info from crates.io API
    async fn fetch_crate_info(&self, crate_name: &str) -> anyhow::Result<CratesIoCrateInfo> {
        let url = format!("https://crates.io/api/v1/crates/{}", crate_name);
        let client = reqwest::Client::new();
        let response = client
            .get(&url)
            .header("User-Agent", "package-publisher/1.0.0")
            .send()
            .await?;

        if !response.status().is_success() {
            anyhow::bail!(
                "パッケージ {} が crates.io で見つかりません（HTTP {}）",
                crate_name,
                response.status()
            );
        }

        let info = response.json::<CratesIoCrateInfo>().await?;
        Ok(info)
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
        let mut errors = Vec::new();
        let mut warnings = Vec::new();
        let mut metadata = HashMap::new();

        // Load Cargo.toml
        let cargo_toml = self.load_cargo_toml().await?;

        // Validate required fields
        let package = cargo_toml
            .package
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("[package] section not found in Cargo.toml"))?;

        if package.name.is_none() {
            errors.push(ValidationError {
                field: "package.name".to_string(),
                message: "nameは必須フィールドです".to_string(),
                severity: "error".to_string(),
            });
        }

        if package.version.is_none() {
            errors.push(ValidationError {
                field: "package.version".to_string(),
                message: "versionは必須フィールドです".to_string(),
                severity: "error".to_string(),
            });
        }

        // Validate package name
        if let Some(ref name) = package.name {
            let name_errors = self.validate_package_name(name);
            errors.extend(name_errors);
            metadata.insert(
                "packageName".to_string(),
                serde_json::Value::String(name.clone()),
            );
        }

        // Validate version (SemVer)
        if let Some(ref version) = package.version {
            if !self.is_valid_semver(version) {
                errors.push(ValidationError {
                    field: "package.version".to_string(),
                    message: format!("無効なSemVer形式: {}", version),
                    severity: "error".to_string(),
                });
            }
            metadata.insert(
                "version".to_string(),
                serde_json::Value::String(version.clone()),
            );
        }

        // Validate license
        if package.license.is_none() {
            warnings.push(ValidationWarning {
                field: "package.license".to_string(),
                message: "ライセンスフィールドの指定を推奨します".to_string(),
                severity: "warning".to_string(),
            });
        }

        // Validate description
        if package.description.is_none() {
            warnings.push(ValidationWarning {
                field: "package.description".to_string(),
                message: "descriptionフィールドの指定を推奨します".to_string(),
                severity: "warning".to_string(),
            });
        }

        // Run cargo check
        match self.run_cargo(&["check"]).await {
            Ok(_) => {}
            Err(e) => {
                errors.push(ValidationError {
                    field: "cargo.check".to_string(),
                    message: format!("cargo checkに失敗: {}", e),
                    severity: "error".to_string(),
                });
            }
        }

        // Note: cargo test can be time-consuming
        warnings.push(ValidationWarning {
            field: "cargo.test".to_string(),
            message: "テストは時間がかかるためスキップしました。手動で `cargo test` を実行してください。".to_string(),
            severity: "warning".to_string(),
        });

        // Run cargo clippy if available
        match self.run_cargo(&["clippy", "--", "-D", "warnings"]).await {
            Ok(_) => {}
            Err(e) => {
                warnings.push(ValidationWarning {
                    field: "cargo.clippy".to_string(),
                    message: format!("Clippy警告が検出されました: {}", e),
                    severity: "warning".to_string(),
                });
            }
        }

        Ok(ValidationResult {
            valid: errors.is_empty(),
            errors,
            warnings,
            metadata: if metadata.is_empty() {
                None
            } else {
                Some(metadata)
            },
        })
    }

    async fn dry_run(&self) -> anyhow::Result<DryRunResult> {
        match self
            .run_cargo(&["publish", "--dry-run", "--allow-dirty"])
            .await
        {
            Ok(output) => Ok(DryRunResult {
                success: true,
                output,
                estimated_size: None,
                errors: None,
            }),
            Err(e) => Ok(DryRunResult {
                success: false,
                output: e.to_string(),
                estimated_size: None,
                errors: Some(vec![ValidationError {
                    field: "publish".to_string(),
                    message: format!("Dry-runに失敗: {}", e),
                    severity: "error".to_string(),
                }]),
            }),
        }
    }

    async fn publish(&self, options: Option<PublishOptions>) -> anyhow::Result<PublishResult> {
        let opts = options.unwrap_or_default();

        // Load Cargo.toml to get metadata
        let cargo_toml = self.load_cargo_toml().await?;
        let package = cargo_toml
            .package
            .ok_or_else(|| anyhow::anyhow!("[package] section not found"))?;

        let mut args = vec!["publish", "--allow-dirty"];

        // Tag specification (features in Cargo)
        if let Some(ref tag) = opts.tag
            && tag != "latest"
        {
            args.push("--features");
            args.push(tag);
        }

        match self.run_cargo(&args).await {
            Ok(output) => {
                let package_name = package.name.unwrap_or_else(|| "unknown".to_string());
                let package_url = format!("https://crates.io/crates/{}", package_name);

                Ok(PublishResult {
                    success: true,
                    version: package.version,
                    package_url: Some(package_url),
                    output: Some(output),
                    error: None,
                    metadata: None,
                })
            }
            Err(e) => {
                // Check for authentication errors
                let error_msg = e.to_string();
                if error_msg.contains("authentication") || error_msg.contains("token") {
                    return Ok(PublishResult {
                        success: false,
                        version: None,
                        package_url: None,
                        output: None,
                        error: Some(
                            "crates.ioの認証に失敗しました。CARGO_REGISTRY_TOKENを確認してください"
                                .to_string(),
                        ),
                        metadata: None,
                    });
                }

                Ok(PublishResult {
                    success: false,
                    version: None,
                    package_url: None,
                    output: None,
                    error: Some(error_msg),
                    metadata: None,
                })
            }
        }
    }

    async fn verify(&self) -> anyhow::Result<VerificationResult> {
        // Load Cargo.toml
        let cargo_toml = self.load_cargo_toml().await?;
        let package = cargo_toml
            .package
            .ok_or_else(|| anyhow::anyhow!("[package] section not found"))?;

        let crate_name = package
            .name
            .ok_or_else(|| anyhow::anyhow!("Package name not found"))?;
        let expected_version = package
            .version
            .ok_or_else(|| anyhow::anyhow!("Package version not found"))?;

        match self.fetch_crate_info(&crate_name).await {
            Ok(info) => {
                // Check if expected version exists
                let version_exists = info.versions.iter().any(|v| v.num == expected_version);

                if !version_exists {
                    let available: Vec<String> = info.versions.iter().map(|v| v.num.clone()).collect();
                    return Ok(VerificationResult {
                        verified: false,
                        version: Some(expected_version.clone()),
                        url: Some(format!("https://crates.io/crates/{}", crate_name)),
                        error: Some(format!(
                            "バージョン {} が crates.io で見つかりません。利用可能なバージョン: {}",
                            expected_version,
                            available.join(", ")
                        )),
                        metadata: None,
                    });
                }

                let newest_version = info.crate_info.newest_version.clone();
                let all_versions: Vec<String> = info.versions.iter().map(|v| v.num.clone()).collect();

                let mut metadata = HashMap::new();
                metadata.insert(
                    "newestVersion".to_string(),
                    serde_json::Value::String(newest_version),
                );
                metadata.insert(
                    "allVersions".to_string(),
                    serde_json::Value::Array(
                        all_versions
                            .iter()
                            .map(|v| serde_json::Value::String(v.clone()))
                            .collect(),
                    ),
                );

                Ok(VerificationResult {
                    verified: true,
                    version: Some(expected_version),
                    url: Some(format!("https://crates.io/crates/{}", crate_name)),
                    error: None,
                    metadata: Some(metadata),
                })
            }
            Err(e) => Ok(VerificationResult {
                verified: false,
                version: Some(expected_version),
                url: Some(format!("https://crates.io/crates/{}", crate_name)),
                error: Some(format!("検証に失敗: {}", e)),
                metadata: None,
            }),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::TempDir;

    #[test]
    fn test_new_plugin() {
        let plugin = CratesIoPlugin::new(PathBuf::from("."));
        assert_eq!(plugin.name(), "crates-io");
        assert_eq!(plugin.version(), "1.0.0");
    }

    #[tokio::test]
    async fn test_detect_with_cargo_toml() {
        let temp_dir = TempDir::new().unwrap();
        let cargo_toml = temp_dir.path().join("Cargo.toml");
        let mut file = std::fs::File::create(&cargo_toml).unwrap();
        writeln!(file, "[package]\nname = \"test\"").unwrap();

        let plugin = CratesIoPlugin::new(temp_dir.path().to_path_buf());
        let result = plugin.detect(temp_dir.path().to_str().unwrap()).await.unwrap();
        assert!(result);
    }

    #[tokio::test]
    async fn test_detect_without_cargo_toml() {
        let temp_dir = TempDir::new().unwrap();
        let plugin = CratesIoPlugin::new(temp_dir.path().to_path_buf());
        let result = plugin.detect(temp_dir.path().to_str().unwrap()).await.unwrap();
        assert!(!result);
    }

    #[test]
    fn test_validate_package_name_valid() {
        let plugin = CratesIoPlugin::new(PathBuf::from("."));
        let errors = plugin.validate_package_name("my-crate");
        assert!(errors.is_empty());
    }

    #[test]
    fn test_validate_package_name_with_underscore() {
        let plugin = CratesIoPlugin::new(PathBuf::from("."));
        let errors = plugin.validate_package_name("my_crate");
        assert!(errors.is_empty());
    }

    #[test]
    fn test_validate_package_name_invalid_chars() {
        let plugin = CratesIoPlugin::new(PathBuf::from("."));
        let errors = plugin.validate_package_name("my@crate");
        assert!(!errors.is_empty());
        assert_eq!(errors[0].field, "package.name");
    }

    #[test]
    fn test_validate_package_name_empty() {
        let plugin = CratesIoPlugin::new(PathBuf::from("."));
        let errors = plugin.validate_package_name("");
        assert!(!errors.is_empty());
    }

    #[test]
    fn test_validate_package_name_too_long() {
        let plugin = CratesIoPlugin::new(PathBuf::from("."));
        let long_name = "a".repeat(65);
        let errors = plugin.validate_package_name(&long_name);
        assert!(!errors.is_empty());
    }

    #[test]
    fn test_is_valid_semver() {
        let plugin = CratesIoPlugin::new(PathBuf::from("."));
        assert!(plugin.is_valid_semver("1.0.0"));
        assert!(plugin.is_valid_semver("1.2.3-alpha.1"));
        assert!(plugin.is_valid_semver("2.0.0+build.123"));
        assert!(!plugin.is_valid_semver("1.0"));
        assert!(!plugin.is_valid_semver("invalid"));
    }

    #[tokio::test]
    async fn test_validate_missing_package_section() {
        let temp_dir = TempDir::new().unwrap();
        let cargo_toml = temp_dir.path().join("Cargo.toml");
        let mut file = std::fs::File::create(&cargo_toml).unwrap();
        writeln!(file, "[dependencies]").unwrap();

        let plugin = CratesIoPlugin::new(temp_dir.path().to_path_buf());
        let result = plugin.validate().await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_validate_missing_name() {
        let temp_dir = TempDir::new().unwrap();
        let cargo_toml = temp_dir.path().join("Cargo.toml");
        let mut file = std::fs::File::create(&cargo_toml).unwrap();
        writeln!(file, "[package]\nversion = \"1.0.0\"").unwrap();

        let plugin = CratesIoPlugin::new(temp_dir.path().to_path_buf());
        let result = plugin.validate().await.unwrap();
        assert!(!result.valid);
        assert!(!result.errors.is_empty());
        assert_eq!(result.errors[0].field, "package.name");
    }

    #[tokio::test]
    async fn test_validate_missing_version() {
        let temp_dir = TempDir::new().unwrap();
        let cargo_toml = temp_dir.path().join("Cargo.toml");
        let mut file = std::fs::File::create(&cargo_toml).unwrap();
        writeln!(file, "[package]\nname = \"test-crate\"").unwrap();

        let plugin = CratesIoPlugin::new(temp_dir.path().to_path_buf());
        let result = plugin.validate().await.unwrap();
        assert!(!result.valid);
        assert!(!result.errors.is_empty());
        assert_eq!(result.errors[0].field, "package.version");
    }

    #[tokio::test]
    async fn test_validate_invalid_semver() {
        let temp_dir = TempDir::new().unwrap();
        let cargo_toml = temp_dir.path().join("Cargo.toml");
        let mut file = std::fs::File::create(&cargo_toml).unwrap();
        writeln!(file, "[package]\nname = \"test-crate\"\nversion = \"1.0\"").unwrap();

        let plugin = CratesIoPlugin::new(temp_dir.path().to_path_buf());
        let result = plugin.validate().await.unwrap();
        assert!(!result.valid);
        assert!(!result.errors.is_empty());
        assert_eq!(result.errors[0].field, "package.version");
    }
}
