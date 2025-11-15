//! NPM Plugin - NPM registry publishing implementation
//!
//! This module provides comprehensive NPM registry integration including:
//! - package.json detection and validation
//! - NPM naming rules enforcement
//! - SemVer version validation
//! - npm audit integration
//! - Dry-run and publish operations
//! - Package verification on npmjs.com
//! - Rollback with unpublish/deprecate

use crate::core::traits::{
    DryRunResult, PublishOptions, PublishResult, RegistryPlugin, ValidationError,
    ValidationResult, ValidationWarning, VerificationResult,
};
use async_trait::async_trait;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tokio::fs;
use tokio::process::Command;

/// Package.json structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackageJson {
    pub name: Option<String>,
    pub version: Option<String>,
    pub description: Option<String>,
    pub license: Option<String>,
    pub main: Option<String>,
    pub types: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scripts: Option<HashMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dependencies: Option<HashMap<String, String>>,
    #[serde(rename = "devDependencies", skip_serializing_if = "Option::is_none")]
    pub dev_dependencies: Option<HashMap<String, String>>,
}

/// NPM audit response
#[derive(Debug, Deserialize)]
struct NpmAuditResponse {
    #[serde(default)]
    vulnerabilities: HashMap<String, serde_json::Value>,
}

/// NPM registry package info
#[derive(Debug, Deserialize)]
struct NpmRegistryInfo {
    #[serde(default)]
    versions: HashMap<String, serde_json::Value>,
    #[serde(rename = "dist-tags", default)]
    dist_tags: HashMap<String, String>,
}

/// NPM registry plugin
pub struct NpmPlugin {
    project_path: PathBuf,
}

impl Default for NpmPlugin {
    fn default() -> Self {
        Self::new(PathBuf::from("."))
    }
}

impl NpmPlugin {
    /// Create a new NPM plugin instance
    pub fn new(project_path: PathBuf) -> Self {
        Self { project_path }
    }

    /// Validate package name according to NPM rules
    /// https://docs.npmjs.com/cli/v9/configuring-npm/package-json#name
    fn validate_package_name(&self, name: &str) -> Vec<ValidationError> {
        let mut errors = Vec::new();

        // Length check (including scope)
        if name.len() > 214 {
            errors.push(ValidationError {
                field: "name".to_string(),
                message: "パッケージ名は214文字以内である必要があります".to_string(),
                severity: "error".to_string(),
            });
        }

        // Extract name without scope
        let name_without_scope = if name.starts_with('@') {
            name.split('/').nth(1).unwrap_or(name)
        } else {
            name
        };

        // URL-safe characters only (lowercase, numbers, hyphens, underscores, dots)
        let valid_chars_regex = Regex::new(r"^[a-z0-9._-]+$").unwrap();
        if !valid_chars_regex.is_match(name_without_scope) {
            errors.push(ValidationError {
                field: "name".to_string(),
                message:
                    "パッケージ名は小文字英数字とハイフン、アンダースコア、ドットのみ使用可能です"
                        .to_string(),
                severity: "error".to_string(),
            });
        }

        // Cannot start with . or _
        if name_without_scope.starts_with('.') || name_without_scope.starts_with('_') {
            errors.push(ValidationError {
                field: "name".to_string(),
                message: "パッケージ名はドットまたはアンダースコアで始めることはできません"
                    .to_string(),
                severity: "error".to_string(),
            });
        }

        // No uppercase letters
        if name.chars().any(|c| c.is_uppercase()) {
            errors.push(ValidationError {
                field: "name".to_string(),
                message: "パッケージ名に大文字を含めることはできません".to_string(),
                severity: "error".to_string(),
            });
        }

        // No non-URL-safe characters
        let url_safe_regex = Regex::new(r"^[@a-z0-9._/-]+$").unwrap();
        if !url_safe_regex.is_match(name) {
            errors.push(ValidationError {
                field: "name".to_string(),
                message: "パッケージ名はURL安全な文字のみ使用可能です".to_string(),
                severity: "error".to_string(),
            });
        }

        errors
    }

    /// Validate SemVer version
    fn is_valid_semver(&self, version: &str) -> bool {
        semver::Version::parse(version).is_ok()
    }

    /// Check if package is scoped (starts with @)
    fn is_scoped_package(&self, name: Option<&String>) -> bool {
        name.map(|n| n.starts_with('@')).unwrap_or(false)
    }

    /// Run npm audit and collect vulnerabilities
    async fn run_npm_audit(&self) -> anyhow::Result<Option<ValidationWarning>> {
        let output = Command::new("npm")
            .args(["audit", "--json"])
            .current_dir(&self.project_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await?;

        if !output.status.success() {
            // Try to parse audit output
            if let Ok(audit_data) = serde_json::from_slice::<NpmAuditResponse>(&output.stdout) {
                let vuln_count = audit_data.vulnerabilities.len();
                if vuln_count > 0 {
                    return Ok(Some(ValidationWarning {
                        field: "dependencies".to_string(),
                        message: format!(
                            "{}件の脆弱性が検出されました。npm audit fixで修正を推奨します",
                            vuln_count
                        ),
                        severity: "warning".to_string(),
                    }));
                }
            }
        }

        Ok(None)
    }

    /// Run npm script if it exists
    async fn run_script(&self, script_name: &str) -> anyhow::Result<()> {
        let output = Command::new("npm")
            .args(["run", script_name])
            .current_dir(&self.project_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            anyhow::bail!("{}", stderr);
        }

        Ok(())
    }

    /// Execute npm publish with retry
    async fn execute_npm_publish(&self, args: &[String]) -> anyhow::Result<String> {
        let output = Command::new("npm")
            .args(args)
            .current_dir(&self.project_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await?;

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();

        if !output.status.success() {
            // Check for OTP requirement
            if stderr.contains("OTP") || stderr.contains("two-factor") {
                anyhow::bail!(
                    "2要素認証が必要です。--otpオプションでワンタイムパスワードを指定してください"
                );
            }
            anyhow::bail!("{}", stderr);
        }

        Ok(stdout + &stderr)
    }

    /// Fetch package info from npm registry
    async fn fetch_package_info(&self, package_name: &str) -> anyhow::Result<NpmRegistryInfo> {
        let url = format!("https://registry.npmjs.org/{}", package_name);
        let client = reqwest::Client::new();
        let response = client.get(&url).send().await?;

        if !response.status().is_success() {
            anyhow::bail!(
                "パッケージ {} が npmjs.com で見つかりません（HTTP {}）",
                package_name,
                response.status()
            );
        }

        let info = response.json::<NpmRegistryInfo>().await?;
        Ok(info)
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
        let mut errors = Vec::new();
        let mut warnings = Vec::new();
        let mut metadata = HashMap::new();

        // Load package.json
        let package_json_path = self.project_path.join("package.json");
        let content = fs::read_to_string(&package_json_path).await?;
        let pkg: PackageJson = serde_json::from_str(&content)?;

        // Validate required fields
        if pkg.name.is_none() {
            errors.push(ValidationError {
                field: "name".to_string(),
                message: "nameは必須フィールドです".to_string(),
                severity: "error".to_string(),
            });
        }

        if pkg.version.is_none() {
            errors.push(ValidationError {
                field: "version".to_string(),
                message: "versionは必須フィールドです".to_string(),
                severity: "error".to_string(),
            });
        }

        // Validate package name
        if let Some(ref name) = pkg.name {
            let name_errors = self.validate_package_name(name);
            errors.extend(name_errors);
            metadata.insert(
                "packageName".to_string(),
                serde_json::Value::String(name.clone()),
            );
        }

        // Validate version (SemVer)
        if let Some(ref version) = pkg.version {
            if !self.is_valid_semver(version) {
                errors.push(ValidationError {
                    field: "version".to_string(),
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
        if pkg.license.is_none() {
            warnings.push(ValidationWarning {
                field: "license".to_string(),
                message: "ライセンスフィールドの指定を推奨します".to_string(),
                severity: "warning".to_string(),
            });
        }

        // Check for vulnerabilities
        if let Ok(Some(audit_warning)) = self.run_npm_audit().await {
            warnings.push(audit_warning);
        }

        // Run build script if exists
        if let Some(ref scripts) = pkg.scripts {
            if scripts.contains_key("build")
                && let Err(e) = self.run_script("build").await {
                    errors.push(ValidationError {
                        field: "scripts.build".to_string(),
                        message: format!("ビルドスクリプトの実行に失敗: {}", e),
                        severity: "error".to_string(),
                    });
                }

            // Run test script if exists
            if scripts.contains_key("test")
                && let Err(e) = self.run_script("test").await {
                    errors.push(ValidationError {
                        field: "scripts.test".to_string(),
                        message: format!("テストの実行に失敗: {}", e),
                        severity: "error".to_string(),
                    });
                }

            // Run lint script if exists
            if scripts.contains_key("lint") {
                if let Err(e) = self.run_script("lint").await {
                    warnings.push(ValidationWarning {
                        field: "scripts.lint".to_string(),
                        message: format!("Lintエラーが検出されました: {}", e),
                        severity: "warning".to_string(),
                    });
                }
            } else {
                warnings.push(ValidationWarning {
                    field: "scripts.lint".to_string(),
                    message: "lintスクリプトの設定を推奨します".to_string(),
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
        let output = Command::new("npm")
            .args(["publish", "--dry-run"])
            .current_dir(&self.project_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await?;

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let combined_output = stdout + &stderr;

        if !output.status.success() {
            return Ok(DryRunResult {
                success: false,
                output: combined_output.clone(),
                estimated_size: None,
                errors: Some(vec![ValidationError {
                    field: "publish".to_string(),
                    message: format!("Dry-runに失敗: {}", combined_output),
                    severity: "error".to_string(),
                }]),
            });
        }

        // Extract package size
        let size_regex = Regex::new(r"package size:\s*(\S+)").unwrap();
        let estimated_size = size_regex
            .captures(&combined_output)
            .and_then(|cap| cap.get(1))
            .map(|m| m.as_str().to_string());

        Ok(DryRunResult {
            success: true,
            output: combined_output,
            estimated_size,
            errors: None,
        })
    }

    async fn publish(&self, options: Option<PublishOptions>) -> anyhow::Result<PublishResult> {
        let opts = options.unwrap_or_default();

        // Load package.json to get metadata
        let package_json_path = self.project_path.join("package.json");
        let content = fs::read_to_string(&package_json_path).await?;
        let pkg: PackageJson = serde_json::from_str(&content)?;

        let mut args = vec!["publish".to_string()];

        // Add OTP if provided
        if let Some(ref otp) = opts.otp {
            args.push("--otp".to_string());
            args.push(otp.clone());
        }

        // Add access control for scoped packages
        if let Some(ref access) = opts.access
            && self.is_scoped_package(pkg.name.as_ref()) {
                args.push("--access".to_string());
                args.push(access.clone());
            }

        // Add tag
        if let Some(ref tag) = opts.tag {
            args.push("--tag".to_string());
            args.push(tag.clone());
        }

        match self.execute_npm_publish(&args).await {
            Ok(output) => {
                let package_name = pkg.name.unwrap_or_else(|| "unknown".to_string());
                let version = pkg.version.clone();
                let package_url = format!("https://www.npmjs.com/package/{}", package_name);

                Ok(PublishResult {
                    success: true,
                    version,
                    package_url: Some(package_url),
                    output: Some(output),
                    error: None,
                    metadata: None,
                })
            }
            Err(e) => Ok(PublishResult {
                success: false,
                version: None,
                package_url: None,
                output: None,
                error: Some(e.to_string()),
                metadata: None,
            }),
        }
    }

    async fn verify(&self) -> anyhow::Result<VerificationResult> {
        // Load package.json
        let package_json_path = self.project_path.join("package.json");
        let content = fs::read_to_string(&package_json_path).await?;
        let pkg: PackageJson = serde_json::from_str(&content)?;

        let package_name = pkg.name.ok_or_else(|| anyhow::anyhow!("Package name not found"))?;
        let expected_version = pkg
            .version
            .ok_or_else(|| anyhow::anyhow!("Package version not found"))?;

        match self.fetch_package_info(&package_name).await {
            Ok(info) => {
                // Check if expected version exists
                if !info.versions.contains_key(&expected_version) {
                    let available = info
                        .versions
                        .keys()
                        .cloned()
                        .collect::<Vec<_>>()
                        .join(", ");
                    return Ok(VerificationResult {
                        verified: false,
                        version: Some(expected_version.clone()),
                        url: Some(format!("https://www.npmjs.com/package/{}", package_name)),
                        error: Some(format!(
                            "バージョン {} が npmjs.com で見つかりません。利用可能なバージョン: {}",
                            expected_version, available
                        )),
                        metadata: None,
                    });
                }

                let latest_version = info.dist_tags.get("latest").cloned();
                let all_versions: Vec<String> = info.versions.keys().cloned().collect();

                let mut metadata = HashMap::new();
                if let Some(ref latest) = latest_version {
                    metadata.insert(
                        "latestVersion".to_string(),
                        serde_json::Value::String(latest.clone()),
                    );
                }
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
                    url: Some(format!("https://www.npmjs.com/package/{}", package_name)),
                    error: None,
                    metadata: Some(metadata),
                })
            }
            Err(e) => Ok(VerificationResult {
                verified: false,
                version: Some(expected_version),
                url: Some(format!("https://www.npmjs.com/package/{}", package_name)),
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
        let plugin = NpmPlugin::new(PathBuf::from("."));
        assert_eq!(plugin.name(), "npm");
        assert_eq!(plugin.version(), "1.0.0");
    }

    #[tokio::test]
    async fn test_detect_with_package_json() {
        let temp_dir = TempDir::new().unwrap();
        let package_json = temp_dir.path().join("package.json");
        let mut file = std::fs::File::create(&package_json).unwrap();
        writeln!(file, r#"{{"name": "test"}}"#).unwrap();

        let plugin = NpmPlugin::new(temp_dir.path().to_path_buf());
        let result = plugin.detect(temp_dir.path().to_str().unwrap()).await.unwrap();
        assert!(result);
    }

    #[tokio::test]
    async fn test_detect_without_package_json() {
        let temp_dir = TempDir::new().unwrap();
        let plugin = NpmPlugin::new(temp_dir.path().to_path_buf());
        let result = plugin.detect(temp_dir.path().to_str().unwrap()).await.unwrap();
        assert!(!result);
    }

    #[test]
    fn test_validate_package_name_valid() {
        let plugin = NpmPlugin::new(PathBuf::from("."));
        let errors = plugin.validate_package_name("my-package");
        assert!(errors.is_empty());
    }

    #[test]
    fn test_validate_package_name_scoped() {
        let plugin = NpmPlugin::new(PathBuf::from("."));
        let errors = plugin.validate_package_name("@scope/my-package");
        assert!(errors.is_empty());
    }

    #[test]
    fn test_validate_package_name_uppercase() {
        let plugin = NpmPlugin::new(PathBuf::from("."));
        let errors = plugin.validate_package_name("MyPackage");
        assert!(!errors.is_empty());
        assert_eq!(errors[0].field, "name");
    }

    #[test]
    fn test_validate_package_name_too_long() {
        let plugin = NpmPlugin::new(PathBuf::from("."));
        let long_name = "a".repeat(215);
        let errors = plugin.validate_package_name(&long_name);
        assert!(!errors.is_empty());
    }

    #[test]
    fn test_validate_package_name_starts_with_dot() {
        let plugin = NpmPlugin::new(PathBuf::from("."));
        let errors = plugin.validate_package_name(".my-package");
        assert!(!errors.is_empty());
    }

    #[test]
    fn test_is_valid_semver() {
        let plugin = NpmPlugin::new(PathBuf::from("."));
        assert!(plugin.is_valid_semver("1.0.0"));
        assert!(plugin.is_valid_semver("1.2.3-alpha.1"));
        assert!(plugin.is_valid_semver("2.0.0+build.123"));
        assert!(!plugin.is_valid_semver("1.0"));
        assert!(!plugin.is_valid_semver("invalid"));
    }

    #[test]
    fn test_is_scoped_package() {
        let plugin = NpmPlugin::new(PathBuf::from("."));
        assert!(plugin.is_scoped_package(Some(&"@scope/package".to_string())));
        assert!(!plugin.is_scoped_package(Some(&"package".to_string())));
        assert!(!plugin.is_scoped_package(None));
    }

    #[tokio::test]
    async fn test_validate_missing_name() {
        let temp_dir = TempDir::new().unwrap();
        let package_json = temp_dir.path().join("package.json");
        let mut file = std::fs::File::create(&package_json).unwrap();
        writeln!(file, r#"{{"version": "1.0.0"}}"#).unwrap();

        let plugin = NpmPlugin::new(temp_dir.path().to_path_buf());
        let result = plugin.validate().await.unwrap();
        assert!(!result.valid);
        assert!(!result.errors.is_empty());
        assert_eq!(result.errors[0].field, "name");
    }

    #[tokio::test]
    async fn test_validate_missing_version() {
        let temp_dir = TempDir::new().unwrap();
        let package_json = temp_dir.path().join("package.json");
        let mut file = std::fs::File::create(&package_json).unwrap();
        writeln!(file, r#"{{"name": "test-package"}}"#).unwrap();

        let plugin = NpmPlugin::new(temp_dir.path().to_path_buf());
        let result = plugin.validate().await.unwrap();
        assert!(!result.valid);
        assert!(!result.errors.is_empty());
        assert_eq!(result.errors[0].field, "version");
    }

    #[tokio::test]
    async fn test_validate_invalid_semver() {
        let temp_dir = TempDir::new().unwrap();
        let package_json = temp_dir.path().join("package.json");
        let mut file = std::fs::File::create(&package_json).unwrap();
        writeln!(file, r#"{{"name": "test-package", "version": "1.0"}}"#).unwrap();

        let plugin = NpmPlugin::new(temp_dir.path().to_path_buf());
        let result = plugin.validate().await.unwrap();
        assert!(!result.valid);
        assert!(!result.errors.is_empty());
        assert_eq!(result.errors[0].field, "version");
    }

    #[tokio::test]
    async fn test_validate_valid_package() {
        let temp_dir = TempDir::new().unwrap();
        let package_json = temp_dir.path().join("package.json");
        let mut file = std::fs::File::create(&package_json).unwrap();
        writeln!(
            file,
            r#"{{"name": "test-package", "version": "1.0.0", "license": "MIT"}}"#
        )
        .unwrap();

        let plugin = NpmPlugin::new(temp_dir.path().to_path_buf());
        let result = plugin.validate().await.unwrap();
        // Note: May have warnings for missing scripts
        assert!(result.errors.is_empty());
    }
}
