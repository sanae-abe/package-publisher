//! Manifest Validator - Validates package manifests (package.json, Cargo.toml, formula.rb)
//!
//! This module provides validation for package manifest files across multiple
//! package registries (NPM, Crates.io, Homebrew).
//!
//! # Example
//!
//! ```no_run
//! use package_publisher::validation::manifest_validator::{ManifestValidator, ManifestType};
//! use std::path::Path;
//!
//! # async fn example() -> anyhow::Result<()> {
//! let validator = ManifestValidator::new();
//! let result = validator.validate(Path::new("package.json"), ManifestType::Npm).await?;
//!
//! if result.is_valid {
//!     println!("Manifest is valid!");
//! }
//! # Ok(())
//! # }
//! ```

use serde::{Deserialize, Serialize};
use std::path::Path;
use tokio::fs;

/// Type of manifest file
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ManifestType {
    Npm,
    Cargo,
    Homebrew,
}

/// Result of manifest validation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationResult {
    /// Whether the manifest is valid
    pub is_valid: bool,
    /// List of validation errors
    pub errors: Vec<String>,
    /// List of validation warnings
    pub warnings: Vec<String>,
    /// Parsed manifest metadata
    pub metadata: Option<ManifestMetadata>,
}

/// Metadata extracted from manifest
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManifestMetadata {
    pub name: String,
    pub version: String,
    pub description: Option<String>,
    pub license: Option<String>,
}

/// Validator for package manifest files
pub struct ManifestValidator;

impl Default for ManifestValidator {
    fn default() -> Self {
        Self::new()
    }
}

impl ManifestValidator {
    /// Create a new ManifestValidator
    ///
    /// # Examples
    ///
    /// ```
    /// use package_publisher::validation::ManifestValidator;
    ///
    /// let validator = ManifestValidator::new();
    /// ```
    pub fn new() -> Self {
        Self
    }

    /// Validate a manifest file
    ///
    /// # Arguments
    ///
    /// * `path` - Path to the manifest file
    /// * `manifest_type` - Type of manifest to validate
    ///
    /// # Examples
    ///
    /// ```no_run
    /// use package_publisher::validation::manifest_validator::{ManifestValidator, ManifestType};
    /// use std::path::Path;
    ///
    /// # async fn example() -> anyhow::Result<()> {
    /// let validator = ManifestValidator::new();
    /// let result = validator.validate(Path::new("package.json"), ManifestType::Npm).await?;
    /// # Ok(())
    /// # }
    /// ```
    pub async fn validate(
        &self,
        path: &Path,
        manifest_type: ManifestType,
    ) -> anyhow::Result<ValidationResult> {
        // Read file
        let content = fs::read_to_string(path).await?;

        // Validate based on type
        match manifest_type {
            ManifestType::Npm => self.validate_npm(&content),
            ManifestType::Cargo => self.validate_cargo(&content),
            ManifestType::Homebrew => self.validate_homebrew(&content),
        }
    }

    /// Validate NPM package.json
    fn validate_npm(&self, content: &str) -> anyhow::Result<ValidationResult> {
        let mut errors = Vec::new();
        let mut warnings = Vec::new();

        // Parse JSON
        let parsed: serde_json::Value = match serde_json::from_str(content) {
            Ok(v) => v,
            Err(e) => {
                errors.push(format!("Invalid JSON: {}", e));
                return Ok(ValidationResult {
                    is_valid: false,
                    errors,
                    warnings,
                    metadata: None,
                });
            }
        };

        // Check required fields
        let name = parsed.get("name").and_then(|v| v.as_str());
        let version = parsed.get("version").and_then(|v| v.as_str());

        if name.is_none() {
            errors.push("Missing required field: name".to_string());
        }
        if version.is_none() {
            errors.push("Missing required field: version".to_string());
        }

        // Extract metadata
        let metadata = if let (Some(name), Some(version)) = (name, version) {
            Some(ManifestMetadata {
                name: name.to_string(),
                version: version.to_string(),
                description: parsed
                    .get("description")
                    .and_then(|v| v.as_str())
                    .map(String::from),
                license: parsed
                    .get("license")
                    .and_then(|v| v.as_str())
                    .map(String::from),
            })
        } else {
            None
        };

        // Warnings
        if parsed.get("description").is_none() {
            warnings.push("Missing recommended field: description".to_string());
        }
        if parsed.get("license").is_none() {
            warnings.push("Missing recommended field: license".to_string());
        }

        Ok(ValidationResult {
            is_valid: errors.is_empty(),
            errors,
            warnings,
            metadata,
        })
    }

    /// Validate Cargo.toml
    fn validate_cargo(&self, content: &str) -> anyhow::Result<ValidationResult> {
        let mut errors = Vec::new();
        let mut warnings = Vec::new();

        // Parse TOML
        let parsed: toml::Value = match toml::from_str(content) {
            Ok(v) => v,
            Err(e) => {
                errors.push(format!("Invalid TOML: {}", e));
                return Ok(ValidationResult {
                    is_valid: false,
                    errors,
                    warnings,
                    metadata: None,
                });
            }
        };

        // Check [package] section
        let package = parsed.get("package");
        if package.is_none() {
            errors.push("Missing [package] section".to_string());
            return Ok(ValidationResult {
                is_valid: false,
                errors,
                warnings,
                metadata: None,
            });
        }

        let package = package.unwrap();
        let name = package.get("name").and_then(|v| v.as_str());
        let version = package.get("version").and_then(|v| v.as_str());

        if name.is_none() {
            errors.push("Missing required field: package.name".to_string());
        }
        if version.is_none() {
            errors.push("Missing required field: package.version".to_string());
        }

        // Extract metadata
        let metadata = if let (Some(name), Some(version)) = (name, version) {
            Some(ManifestMetadata {
                name: name.to_string(),
                version: version.to_string(),
                description: package
                    .get("description")
                    .and_then(|v| v.as_str())
                    .map(String::from),
                license: package
                    .get("license")
                    .and_then(|v| v.as_str())
                    .map(String::from),
            })
        } else {
            None
        };

        // Warnings
        if package.get("description").is_none() {
            warnings.push("Missing recommended field: package.description".to_string());
        }
        if package.get("license").is_none() {
            warnings.push("Missing recommended field: package.license".to_string());
        }

        Ok(ValidationResult {
            is_valid: errors.is_empty(),
            errors,
            warnings,
            metadata,
        })
    }

    /// Validate Homebrew formula.rb
    fn validate_homebrew(&self, content: &str) -> anyhow::Result<ValidationResult> {
        let mut errors = Vec::new();
        let mut warnings = Vec::new();

        // Basic Ruby syntax check
        if !content.contains("class ") {
            errors.push("Missing class definition".to_string());
        }
        if !content.contains(" < Formula") {
            errors.push("Class must inherit from Formula".to_string());
        }

        // Check required methods
        if !content.contains("def install") {
            errors.push("Missing required method: install".to_string());
        }

        // Extract name from class definition
        let name = content
            .lines()
            .find(|line| line.trim().starts_with("class "))
            .and_then(|line| {
                line.split_whitespace()
                    .nth(1)
                    .map(|s| s.trim_end_matches(" < Formula").to_string())
            });

        // Extract version from url
        let version = content
            .lines()
            .find(|line| line.trim().starts_with("url "))
            .map(|_| "unknown".to_string()); // Simplified for now

        // Extract metadata
        let metadata = if let (Some(name), Some(version)) = (name, version) {
            Some(ManifestMetadata {
                name,
                version,
                description: None,
                license: None,
            })
        } else {
            None
        };

        // Warnings
        if !content.contains("desc ") {
            warnings.push("Missing recommended field: desc".to_string());
        }
        if !content.contains("homepage ") {
            warnings.push("Missing recommended field: homepage".to_string());
        }

        Ok(ValidationResult {
            is_valid: errors.is_empty(),
            errors,
            warnings,
            metadata,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_validator() {
        let validator = ManifestValidator::new();
        assert!(std::ptr::addr_of!(validator) as usize != 0);
    }

    #[test]
    fn test_validate_npm_valid() {
        let validator = ManifestValidator::new();
        let content = r#"{
            "name": "test-package",
            "version": "1.0.0",
            "description": "Test package",
            "license": "MIT"
        }"#;

        let result = validator.validate_npm(content).unwrap();
        assert!(result.is_valid);
        assert_eq!(result.errors.len(), 0);
        assert!(result.metadata.is_some());

        let metadata = result.metadata.unwrap();
        assert_eq!(metadata.name, "test-package");
        assert_eq!(metadata.version, "1.0.0");
    }

    #[test]
    fn test_validate_npm_missing_name() {
        let validator = ManifestValidator::new();
        let content = r#"{"version": "1.0.0"}"#;

        let result = validator.validate_npm(content).unwrap();
        assert!(!result.is_valid);
        assert!(result.errors.iter().any(|e| e.contains("name")));
    }

    #[test]
    fn test_validate_npm_invalid_json() {
        let validator = ManifestValidator::new();
        let content = "invalid json";

        let result = validator.validate_npm(content).unwrap();
        assert!(!result.is_valid);
        assert!(result.errors.iter().any(|e| e.contains("Invalid JSON")));
    }

    #[test]
    fn test_validate_cargo_valid() {
        let validator = ManifestValidator::new();
        let content = r#"
[package]
name = "test-crate"
version = "0.1.0"
description = "Test crate"
license = "MIT"
        "#;

        let result = validator.validate_cargo(content).unwrap();
        assert!(result.is_valid);
        assert_eq!(result.errors.len(), 0);
        assert!(result.metadata.is_some());

        let metadata = result.metadata.unwrap();
        assert_eq!(metadata.name, "test-crate");
        assert_eq!(metadata.version, "0.1.0");
    }

    #[test]
    fn test_validate_cargo_missing_package() {
        let validator = ManifestValidator::new();
        let content = r#"[dependencies]"#;

        let result = validator.validate_cargo(content).unwrap();
        assert!(!result.is_valid);
        assert!(result.errors.iter().any(|e| e.contains("[package]")));
    }

    #[test]
    fn test_validate_cargo_invalid_toml() {
        let validator = ManifestValidator::new();
        let content = "invalid toml [[[";

        let result = validator.validate_cargo(content).unwrap();
        assert!(!result.is_valid);
        assert!(result.errors.iter().any(|e| e.contains("Invalid TOML")));
    }

    #[test]
    fn test_validate_homebrew_valid() {
        let validator = ManifestValidator::new();
        let content = r#"
class TestFormula < Formula
  desc "Test formula"
  homepage "https://example.com"
  url "https://example.com/test-1.0.0.tar.gz"

  def install
    bin.install "test"
  end
end
        "#;

        let result = validator.validate_homebrew(content).unwrap();
        assert!(result.is_valid);
        assert_eq!(result.errors.len(), 0);
    }

    #[test]
    fn test_validate_homebrew_missing_class() {
        let validator = ManifestValidator::new();
        let content = "def install\nend";

        let result = validator.validate_homebrew(content).unwrap();
        assert!(!result.is_valid);
        assert!(result.errors.iter().any(|e| e.contains("class")));
    }

    #[test]
    fn test_validate_homebrew_missing_install() {
        let validator = ManifestValidator::new();
        let content = "class Test < Formula\nend";

        let result = validator.validate_homebrew(content).unwrap();
        assert!(!result.is_valid);
        assert!(result.errors.iter().any(|e| e.contains("install")));
    }

    #[tokio::test]
    async fn test_validate_npm_file() {
        use std::io::Write;
        use tempfile::TempDir;

        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("package.json");
        let mut file = std::fs::File::create(&file_path).unwrap();
        writeln!(file, r#"{{"name": "test", "version": "1.0.0"}}"#).unwrap();

        let validator = ManifestValidator::new();
        let result = validator
            .validate(&file_path, ManifestType::Npm)
            .await
            .unwrap();

        assert!(result.is_valid);
    }
}
