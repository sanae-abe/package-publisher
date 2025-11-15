//! Homebrew Plugin - Homebrew tap publishing implementation
//!
//! This module provides comprehensive Homebrew tap integration including:
//! - Formula.rb detection and validation
//! - Formula metadata parsing
//! - Tap repository management
//! - Git-based publishing workflow
//! - Dry-run validation
//! - Formula verification via brew info

use crate::core::traits::{
    DryRunResult, PublishOptions, PublishResult, RegistryPlugin, ValidationError, ValidationResult,
    ValidationWarning, VerificationResult,
};
use async_trait::async_trait;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tokio::fs;
use tokio::process::Command;

/// Formula metadata structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FormulaMetadata {
    pub name: Option<String>,
    pub version: Option<String>,
    pub url: Option<String>,
    pub sha256: Option<String>,
    pub homepage: Option<String>,
    pub description: Option<String>,
    pub license: Option<String>,
}

/// Homebrew tap plugin
pub struct HomebrewPlugin {
    project_path: PathBuf,
    formula_path: Option<PathBuf>,
    formula_metadata: Option<FormulaMetadata>,
}

impl Default for HomebrewPlugin {
    fn default() -> Self {
        Self::new(PathBuf::from("."))
    }
}

impl HomebrewPlugin {
    /// Create a new Homebrew plugin instance
    pub fn new(project_path: PathBuf) -> Self {
        Self {
            project_path,
            formula_path: None,
            formula_metadata: None,
        }
    }

    /// Find formula file in project
    async fn find_formula_file(&mut self) -> anyhow::Result<()> {
        if self.formula_path.is_some() {
            return Ok(());
        }

        // Check Formula directory first
        let formula_dir = self.project_path.join("Formula");
        if fs::metadata(&formula_dir).await.is_ok() {
            let mut entries = fs::read_dir(&formula_dir).await?;
            while let Some(entry) = entries.next_entry().await? {
                let path = entry.path();
                if path.extension().map(|e| e == "rb").unwrap_or(false) {
                    self.formula_path = Some(path);
                    return Ok(());
                }
            }
        }

        // Check root directory
        let mut entries = fs::read_dir(&self.project_path).await?;
        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();
            if path.extension().map(|e| e == "rb").unwrap_or(false) {
                self.formula_path = Some(path);
                return Ok(());
            }
        }

        Ok(())
    }

    /// Load formula metadata from file
    async fn load_formula_metadata(&mut self) -> anyhow::Result<()> {
        if self.formula_metadata.is_some() || self.formula_path.is_none() {
            return Ok(());
        }

        let formula_path = self.formula_path.as_ref().unwrap();
        let content = fs::read_to_string(formula_path).await?;
        self.formula_metadata = Some(self.parse_formula(&content));

        Ok(())
    }

    /// Parse formula content and extract metadata
    fn parse_formula(&self, content: &str) -> FormulaMetadata {
        let mut metadata = FormulaMetadata {
            name: None,
            version: None,
            url: None,
            sha256: None,
            homepage: None,
            description: None,
            license: None,
        };

        // Extract class name (formula name)
        let class_regex = Regex::new(r"class\s+([A-Z][a-zA-Z0-9]*)\s+<\s+Formula").unwrap();
        if let Some(cap) = class_regex.captures(content) {
            metadata.name = Some(self.class_name_to_formula_name(&cap[1]));
        }

        // Extract version
        let version_regex = Regex::new(r#"version\s+['"]([^'"]+)['"]"#).unwrap();
        if let Some(cap) = version_regex.captures(content) {
            metadata.version = Some(cap[1].to_string());
        }

        // Extract URL
        let url_regex = Regex::new(r#"url\s+['"]([^'"]+)['"]"#).unwrap();
        if let Some(cap) = url_regex.captures(content) {
            metadata.url = Some(cap[1].to_string());
        }

        // Extract SHA256
        let sha256_regex = Regex::new(r#"sha256\s+['"]([^'"]+)['"]"#).unwrap();
        if let Some(cap) = sha256_regex.captures(content) {
            metadata.sha256 = Some(cap[1].to_string());
        }

        // Extract homepage
        let homepage_regex = Regex::new(r#"homepage\s+['"]([^'"]+)['"]"#).unwrap();
        if let Some(cap) = homepage_regex.captures(content) {
            metadata.homepage = Some(cap[1].to_string());
        }

        // Extract description
        let desc_regex = Regex::new(r#"desc\s+['"]([^'"]+)['"]"#).unwrap();
        if let Some(cap) = desc_regex.captures(content) {
            metadata.description = Some(cap[1].to_string());
        }

        // Extract license
        let license_regex = Regex::new(r#"license\s+['"]([^'"]+)['"]"#).unwrap();
        if let Some(cap) = license_regex.captures(content) {
            metadata.license = Some(cap[1].to_string());
        }

        metadata
    }

    /// Convert CamelCase class name to kebab-case formula name
    fn class_name_to_formula_name(&self, class_name: &str) -> String {
        // Convert CamelCase to kebab-case
        // Example: MyAwesomeTool -> my-awesome-tool
        let re1 = Regex::new(r"([a-z])([A-Z])").unwrap();
        let re2 = Regex::new(r"([A-Z])([A-Z][a-z])").unwrap();

        let step1 = re1.replace_all(class_name, "$1-$2");
        let step2 = re2.replace_all(&step1, "$1-$2");

        step2.to_lowercase()
    }

    /// Execute git command
    async fn run_git(&self, args: &[&str]) -> anyhow::Result<String> {
        let output = Command::new("git")
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

    /// Execute brew command
    async fn run_brew(&self, args: &[&str]) -> anyhow::Result<String> {
        let output = Command::new("brew")
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

        // Check Formula directory
        let formula_dir = path.join("Formula");
        if fs::metadata(&formula_dir).await.is_ok() {
            let mut entries = fs::read_dir(&formula_dir).await?;
            while let Some(entry) = entries.next_entry().await? {
                if entry.path().extension().map(|e| e == "rb").unwrap_or(false) {
                    return Ok(true);
                }
            }
        }

        // Check root directory for .rb files
        let mut entries = fs::read_dir(path).await?;
        while let Some(entry) = entries.next_entry().await? {
            if entry.path().extension().map(|e| e == "rb").unwrap_or(false) {
                return Ok(true);
            }
        }

        Ok(false)
    }

    async fn validate(&self) -> anyhow::Result<ValidationResult> {
        let mut errors = Vec::new();
        let mut warnings = Vec::new();
        let mut metadata = HashMap::new();

        // Find formula file
        let mut plugin = HomebrewPlugin::new(self.project_path.clone());
        plugin.find_formula_file().await?;

        if plugin.formula_path.is_none() {
            errors.push(ValidationError {
                field: "formula".to_string(),
                message: "Formulaファイル（.rb）が見つかりません".to_string(),
                severity: "error".to_string(),
            });
            return Ok(ValidationResult {
                valid: false,
                errors,
                warnings,
                metadata: None,
            });
        }

        // Load formula metadata
        plugin.load_formula_metadata().await?;

        let formula_meta = plugin.formula_metadata.as_ref().unwrap();

        // Validate required fields
        if formula_meta.name.is_none() {
            errors.push(ValidationError {
                field: "name".to_string(),
                message: "Formula名が見つかりません".to_string(),
                severity: "error".to_string(),
            });
        } else {
            metadata.insert(
                "packageName".to_string(),
                serde_json::Value::String(formula_meta.name.clone().unwrap()),
            );
        }

        if formula_meta.url.is_none() {
            errors.push(ValidationError {
                field: "url".to_string(),
                message: "ソースURLが見つかりません".to_string(),
                severity: "error".to_string(),
            });
        }

        // Recommended fields (warnings)
        if formula_meta.sha256.is_none() {
            warnings.push(ValidationWarning {
                field: "sha256".to_string(),
                message: "SHA256ハッシュの指定を推奨します".to_string(),
                severity: "warning".to_string(),
            });
        }

        if formula_meta.description.is_none() {
            warnings.push(ValidationWarning {
                field: "desc".to_string(),
                message: "説明（desc）の指定を推奨します".to_string(),
                severity: "warning".to_string(),
            });
        }

        if formula_meta.homepage.is_none() {
            warnings.push(ValidationWarning {
                field: "homepage".to_string(),
                message: "ホームページURLの指定を推奨します".to_string(),
                severity: "warning".to_string(),
            });
        }

        if formula_meta.license.is_none() {
            warnings.push(ValidationWarning {
                field: "license".to_string(),
                message: "ライセンスの指定を推奨します".to_string(),
                severity: "warning".to_string(),
            });
        }

        if let Some(ref version) = formula_meta.version {
            metadata.insert(
                "version".to_string(),
                serde_json::Value::String(version.clone()),
            );
        }

        // Note about brew audit
        warnings.push(ValidationWarning {
            field: "brew.audit".to_string(),
            message: "ローカルFormulaファイルのため、brew auditをスキップしました。Tapに追加後に手動で実行してください。".to_string(),
            severity: "warning".to_string(),
        });

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
        let mut plugin = HomebrewPlugin::new(self.project_path.clone());
        plugin.find_formula_file().await?;

        if plugin.formula_path.is_none() {
            return Ok(DryRunResult {
                success: false,
                output: "Formulaファイルが見つかりません".to_string(),
                estimated_size: None,
                errors: Some(vec![ValidationError {
                    field: "formula".to_string(),
                    message: "Formulaファイル（.rb）が見つかりません".to_string(),
                    severity: "error".to_string(),
                }]),
            });
        }

        // Load formula metadata
        plugin.load_formula_metadata().await?;
        let formula_meta = plugin.formula_metadata.as_ref().unwrap();

        let output = format!(
            "Formula検証完了:\n\
            - Formula名: {}\n\
            - バージョン: {}\n\
            - URL: {}\n\
            \n\
            ⚠️  注意: ローカルFormulaのため、brew auditとinstallテストをスキップしました\n\
            \n\
            Tapに追加後、以下のコマンドで詳細検証してください:\n\
              brew audit --strict {}\n\
              brew install --build-from-source {}",
            formula_meta.name.as_deref().unwrap_or("unknown"),
            formula_meta.version.as_deref().unwrap_or("unknown"),
            formula_meta.url.as_deref().unwrap_or("none"),
            formula_meta.name.as_deref().unwrap_or("unknown"),
            formula_meta.name.as_deref().unwrap_or("unknown")
        );

        Ok(DryRunResult {
            success: true,
            output,
            estimated_size: None,
            errors: None,
        })
    }

    async fn publish(&self, options: Option<PublishOptions>) -> anyhow::Result<PublishResult> {
        let opts = options.unwrap_or_default();

        let mut plugin = HomebrewPlugin::new(self.project_path.clone());
        plugin.find_formula_file().await?;
        plugin.load_formula_metadata().await?;

        if plugin.formula_path.is_none() {
            return Ok(PublishResult {
                success: false,
                version: None,
                package_url: None,
                output: None,
                error: Some("Formulaファイルが見つかりません".to_string()),
                metadata: None,
            });
        }

        let formula_meta = plugin.formula_metadata.as_ref().unwrap();
        let formula_name = formula_meta.name.as_deref().unwrap_or("unknown");
        let tap_name = opts.tag.as_deref().unwrap_or("homebrew-tap");

        // Check if we're in a Git repository
        if plugin.run_git(&["rev-parse", "--git-dir"]).await.is_err() {
            return Ok(PublishResult {
                success: false,
                version: None,
                package_url: None,
                output: None,
                error: Some("HomebrewのFormulaはGitリポジトリで管理する必要があります".to_string()),
                metadata: None,
            });
        }

        // Git add and commit
        let formula_path_str = plugin.formula_path.as_ref().unwrap().to_str().unwrap();
        match plugin.run_git(&["add", formula_path_str]).await {
            Ok(_) => {}
            Err(e) => {
                return Ok(PublishResult {
                    success: false,
                    version: None,
                    package_url: None,
                    output: None,
                    error: Some(format!("git add に失敗: {}", e)),
                    metadata: None,
                });
            }
        }

        let commit_message = format!("Add/Update {} formula", formula_name);
        match plugin.run_git(&["commit", "-m", &commit_message]).await {
            Ok(_) => {}
            Err(e) => {
                // Ignore "nothing to commit" errors
                if !e.to_string().contains("nothing to commit") {
                    return Ok(PublishResult {
                        success: false,
                        version: None,
                        package_url: None,
                        output: None,
                        error: Some(format!("git commit に失敗: {}", e)),
                        metadata: None,
                    });
                }
            }
        }

        // Push to remote
        match plugin.run_git(&["push"]).await {
            Ok(output) => {
                let package_url = format!("https://github.com/[owner]/{}", tap_name);

                Ok(PublishResult {
                    success: true,
                    version: formula_meta.version.clone(),
                    package_url: Some(package_url),
                    output: Some(output),
                    error: None,
                    metadata: Some(HashMap::from([(
                        "message".to_string(),
                        serde_json::Value::String(
                            "FormulaをGitHubにpushしました。homebrew/homebrew-coreへの公式登録はPRを作成してください。"
                                .to_string(),
                        ),
                    )])),
                })
            }
            Err(e) => {
                // Check for authentication errors
                let error_msg = e.to_string();
                if error_msg.contains("authentication") || error_msg.contains("Permission denied") {
                    return Ok(PublishResult {
                        success: false,
                        version: None,
                        package_url: None,
                        output: None,
                        error: Some(
                            "Gitリポジトリへの認証に失敗しました。GitHub認証情報を確認してください"
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
        let mut plugin = HomebrewPlugin::new(self.project_path.clone());
        plugin.find_formula_file().await?;
        plugin.load_formula_metadata().await?;

        let formula_meta = plugin
            .formula_metadata
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("Formula metadata not loaded"))?;

        let formula_name = formula_meta
            .name
            .as_deref()
            .ok_or_else(|| anyhow::anyhow!("Formula name not found"))?;

        // Try to find formula in Homebrew
        match plugin.run_brew(&["info", formula_name]).await {
            Ok(output) => {
                let mut metadata = HashMap::new();
                metadata.insert(
                    "info".to_string(),
                    serde_json::Value::String(output.clone()),
                );

                Ok(VerificationResult {
                    verified: true,
                    version: formula_meta.version.clone(),
                    url: Some(format!("https://formulae.brew.sh/formula/{}", formula_name)),
                    error: None,
                    metadata: Some(metadata),
                })
            }
            Err(_) => Ok(VerificationResult {
                verified: false,
                version: formula_meta.version.clone(),
                url: None,
                error: Some(format!(
                    "Formula {} が Homebrew で見つかりません。カスタムTapの場合は正常です。",
                    formula_name
                )),
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
        let plugin = HomebrewPlugin::new(PathBuf::from("."));
        assert_eq!(plugin.name(), "homebrew");
        assert_eq!(plugin.version(), "1.0.0");
    }

    #[tokio::test]
    async fn test_detect_with_formula_dir() {
        let temp_dir = TempDir::new().unwrap();
        let formula_dir = temp_dir.path().join("Formula");
        std::fs::create_dir(&formula_dir).unwrap();
        let formula = formula_dir.join("test.rb");
        let mut file = std::fs::File::create(&formula).unwrap();
        writeln!(file, "class Test < Formula\nend").unwrap();

        let plugin = HomebrewPlugin::new(temp_dir.path().to_path_buf());
        let result = plugin
            .detect(temp_dir.path().to_str().unwrap())
            .await
            .unwrap();
        assert!(result);
    }

    #[tokio::test]
    async fn test_detect_without_formula() {
        let temp_dir = TempDir::new().unwrap();
        let plugin = HomebrewPlugin::new(temp_dir.path().to_path_buf());
        let result = plugin
            .detect(temp_dir.path().to_str().unwrap())
            .await
            .unwrap();
        assert!(!result);
    }

    #[test]
    fn test_class_name_to_formula_name() {
        let plugin = HomebrewPlugin::new(PathBuf::from("."));
        assert_eq!(
            plugin.class_name_to_formula_name("MyAwesomeTool"),
            "my-awesome-tool"
        );
        assert_eq!(
            plugin.class_name_to_formula_name("HTTPServer"),
            "http-server"
        );
        assert_eq!(plugin.class_name_to_formula_name("Test"), "test");
    }

    #[test]
    fn test_parse_formula() {
        let plugin = HomebrewPlugin::new(PathBuf::from("."));
        let content = r#"
class MyAwesomeTool < Formula
  desc "An awesome tool"
  homepage "https://example.com"
  url "https://example.com/my-awesome-tool-1.0.0.tar.gz"
  sha256 "abc123"
  version "1.0.0"
  license "MIT"

  def install
    bin.install "my-awesome-tool"
  end
end
"#;

        let metadata = plugin.parse_formula(content);
        assert_eq!(metadata.name, Some("my-awesome-tool".to_string()));
        assert_eq!(metadata.version, Some("1.0.0".to_string()));
        assert_eq!(
            metadata.url,
            Some("https://example.com/my-awesome-tool-1.0.0.tar.gz".to_string())
        );
        assert_eq!(metadata.sha256, Some("abc123".to_string()));
        assert_eq!(metadata.homepage, Some("https://example.com".to_string()));
        assert_eq!(metadata.description, Some("An awesome tool".to_string()));
        assert_eq!(metadata.license, Some("MIT".to_string()));
    }

    #[tokio::test]
    async fn test_validate_missing_formula() {
        let temp_dir = TempDir::new().unwrap();
        let plugin = HomebrewPlugin::new(temp_dir.path().to_path_buf());
        let result = plugin.validate().await.unwrap();
        assert!(!result.valid);
        assert!(!result.errors.is_empty());
        assert_eq!(result.errors[0].field, "formula");
    }

    #[tokio::test]
    async fn test_validate_valid_formula() {
        let temp_dir = TempDir::new().unwrap();
        let formula_dir = temp_dir.path().join("Formula");
        std::fs::create_dir(&formula_dir).unwrap();
        let formula = formula_dir.join("test.rb");
        let mut file = std::fs::File::create(&formula).unwrap();
        writeln!(
            file,
            r#"
class Test < Formula
  desc "Test formula"
  homepage "https://example.com"
  url "https://example.com/test-1.0.0.tar.gz"
  sha256 "abc123"
  version "1.0.0"
  license "MIT"
end
"#
        )
        .unwrap();

        let plugin = HomebrewPlugin::new(temp_dir.path().to_path_buf());
        let result = plugin.validate().await.unwrap();
        assert!(result.valid);
        assert!(result.errors.is_empty());
    }
}
