//! Dependency Checker - Analyzes package dependencies
//!
//! This module provides dependency analysis for package manifests,
//! including version range checking and basic vulnerability detection.
//!
//! # Example
//!
//! ```no_run
//! use package_publisher::validation::dependency_checker::{DependencyChecker, ManifestType};
//! use std::path::Path;
//!
//! # async fn example() -> anyhow::Result<()> {
//! let checker = DependencyChecker::new();
//! let result = checker.check_dependencies(Path::new("package.json"), ManifestType::Npm).await?;
//!
//! println!("Found {} dependencies", result.dependencies.len());
//! # Ok(())
//! # }
//! ```

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use tokio::fs;

/// Type of manifest file
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ManifestType {
    Npm,
    Cargo,
}

/// Information about a single dependency
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Dependency {
    pub name: String,
    pub version_requirement: String,
    pub dev: bool,
}

/// Severity of a dependency issue
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum IssueSeverity {
    Critical,
    High,
    Medium,
    Low,
}

/// Issue found in dependencies
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DependencyIssue {
    pub dependency: String,
    pub severity: IssueSeverity,
    pub description: String,
}

/// Result of dependency check
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DependencyCheckResult {
    pub dependencies: Vec<Dependency>,
    pub issues: Vec<DependencyIssue>,
    pub total_count: usize,
    pub dev_count: usize,
}

/// Checker for package dependencies
pub struct DependencyChecker;

impl Default for DependencyChecker {
    fn default() -> Self {
        Self::new()
    }
}

impl DependencyChecker {
    /// Create a new DependencyChecker
    ///
    /// # Examples
    ///
    /// ```
    /// use package_publisher::validation::DependencyChecker;
    ///
    /// let checker = DependencyChecker::new();
    /// ```
    pub fn new() -> Self {
        Self
    }

    /// Check dependencies in a manifest file
    ///
    /// # Arguments
    ///
    /// * `path` - Path to the manifest file
    /// * `manifest_type` - Type of manifest to check
    ///
    /// # Examples
    ///
    /// ```no_run
    /// use package_publisher::validation::dependency_checker::{DependencyChecker, ManifestType};
    /// use std::path::Path;
    ///
    /// # async fn example() -> anyhow::Result<()> {
    /// let checker = DependencyChecker::new();
    /// let result = checker.check_dependencies(Path::new("package.json"), ManifestType::Npm).await?;
    /// # Ok(())
    /// # }
    /// ```
    pub async fn check_dependencies(
        &self,
        path: &Path,
        manifest_type: ManifestType,
    ) -> anyhow::Result<DependencyCheckResult> {
        let content = fs::read_to_string(path).await?;

        match manifest_type {
            ManifestType::Npm => self.check_npm_dependencies(&content),
            ManifestType::Cargo => self.check_cargo_dependencies(&content),
        }
    }

    /// Check NPM dependencies
    fn check_npm_dependencies(&self, content: &str) -> anyhow::Result<DependencyCheckResult> {
        let parsed: serde_json::Value = serde_json::from_str(content)?;
        let mut dependencies = Vec::new();
        let mut issues = Vec::new();

        // Parse dependencies
        if let Some(deps) = parsed.get("dependencies").and_then(|v| v.as_object()) {
            for (name, version) in deps {
                let version_str = version.as_str().unwrap_or("*");
                dependencies.push(Dependency {
                    name: name.clone(),
                    version_requirement: version_str.to_string(),
                    dev: false,
                });

                // Check for wildcard versions
                if version_str == "*" || version_str.is_empty() {
                    issues.push(DependencyIssue {
                        dependency: name.clone(),
                        severity: IssueSeverity::Medium,
                        description: "Wildcard version (*) is not recommended".to_string(),
                    });
                }
            }
        }

        // Parse devDependencies
        if let Some(dev_deps) = parsed.get("devDependencies").and_then(|v| v.as_object()) {
            for (name, version) in dev_deps {
                let version_str = version.as_str().unwrap_or("*");
                dependencies.push(Dependency {
                    name: name.clone(),
                    version_requirement: version_str.to_string(),
                    dev: true,
                });

                if version_str == "*" || version_str.is_empty() {
                    issues.push(DependencyIssue {
                        dependency: name.clone(),
                        severity: IssueSeverity::Low,
                        description: "Wildcard version (*) in devDependency".to_string(),
                    });
                }
            }
        }

        let dev_count = dependencies.iter().filter(|d| d.dev).count();

        Ok(DependencyCheckResult {
            total_count: dependencies.len(),
            dev_count,
            dependencies,
            issues,
        })
    }

    /// Check Cargo dependencies
    fn check_cargo_dependencies(&self, content: &str) -> anyhow::Result<DependencyCheckResult> {
        let parsed: toml::Value = toml::from_str(content)?;
        let mut dependencies = Vec::new();
        let mut issues = Vec::new();

        // Parse [dependencies]
        if let Some(deps) = parsed.get("dependencies").and_then(|v| v.as_table()) {
            for (name, value) in deps {
                let version = self.extract_cargo_version(value);
                dependencies.push(Dependency {
                    name: name.clone(),
                    version_requirement: version.clone(),
                    dev: false,
                });

                // Check for wildcard versions
                if version == "*" {
                    issues.push(DependencyIssue {
                        dependency: name.clone(),
                        severity: IssueSeverity::Medium,
                        description: "Wildcard version (*) is not recommended".to_string(),
                    });
                }
            }
        }

        // Parse [dev-dependencies]
        if let Some(dev_deps) = parsed.get("dev-dependencies").and_then(|v| v.as_table()) {
            for (name, value) in dev_deps {
                let version = self.extract_cargo_version(value);
                dependencies.push(Dependency {
                    name: name.clone(),
                    version_requirement: version,
                    dev: true,
                });
            }
        }

        let dev_count = dependencies.iter().filter(|d| d.dev).count();

        Ok(DependencyCheckResult {
            total_count: dependencies.len(),
            dev_count,
            dependencies,
            issues,
        })
    }

    /// Extract version string from Cargo.toml dependency value
    fn extract_cargo_version(&self, value: &toml::Value) -> String {
        match value {
            toml::Value::String(s) => s.clone(),
            toml::Value::Table(t) => t
                .get("version")
                .and_then(|v| v.as_str())
                .unwrap_or("*")
                .to_string(),
            _ => "*".to_string(),
        }
    }

    /// Check for known vulnerable patterns (basic implementation)
    ///
    /// # Arguments
    ///
    /// * `dependencies` - List of dependencies to check
    ///
    /// # Note
    ///
    /// This is a simplified implementation. Production use should integrate
    /// with vulnerability databases like npm audit, cargo audit, or OSV.
    pub fn check_vulnerabilities(&self, dependencies: &[Dependency]) -> Vec<DependencyIssue> {
        let mut issues = Vec::new();

        // Example: Check for known problematic packages (simplified)
        let known_issues: HashMap<&str, IssueSeverity> = HashMap::from([
            ("event-stream", IssueSeverity::Critical), // Historical npm issue
        ]);

        for dep in dependencies {
            if let Some(&severity) = known_issues.get(dep.name.as_str()) {
                issues.push(DependencyIssue {
                    dependency: dep.name.clone(),
                    severity,
                    description: "Known vulnerability detected".to_string(),
                });
            }
        }

        issues
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_checker() {
        let checker = DependencyChecker::new();
        assert!(std::ptr::addr_of!(checker) as usize != 0);
    }

    #[test]
    fn test_check_npm_dependencies_valid() {
        let checker = DependencyChecker::new();
        let content = r#"{
            "dependencies": {
                "express": "^4.17.1",
                "lodash": "~4.17.21"
            },
            "devDependencies": {
                "jest": "^27.0.0"
            }
        }"#;

        let result = checker.check_npm_dependencies(content).unwrap();
        assert_eq!(result.total_count, 3);
        assert_eq!(result.dev_count, 1);
        assert_eq!(result.dependencies.len(), 3);
    }

    #[test]
    fn test_check_npm_dependencies_wildcard() {
        let checker = DependencyChecker::new();
        let content = r#"{
            "dependencies": {
                "express": "*"
            }
        }"#;

        let result = checker.check_npm_dependencies(content).unwrap();
        assert_eq!(result.issues.len(), 1);
        assert_eq!(result.issues[0].severity, IssueSeverity::Medium);
    }

    #[test]
    fn test_check_npm_dependencies_empty() {
        let checker = DependencyChecker::new();
        let content = r#"{}"#;

        let result = checker.check_npm_dependencies(content).unwrap();
        assert_eq!(result.total_count, 0);
        assert_eq!(result.dev_count, 0);
    }

    #[test]
    fn test_check_cargo_dependencies_valid() {
        let checker = DependencyChecker::new();
        let content = r#"
[dependencies]
serde = "1.0"
tokio = { version = "1.0", features = ["full"] }

[dev-dependencies]
tempfile = "3.0"
        "#;

        let result = checker.check_cargo_dependencies(content).unwrap();
        assert_eq!(result.total_count, 3);
        assert_eq!(result.dev_count, 1);
        assert!(
            result
                .dependencies
                .iter()
                .any(|d| d.name == "serde" && !d.dev)
        );
        assert!(
            result
                .dependencies
                .iter()
                .any(|d| d.name == "tempfile" && d.dev)
        );
    }

    #[test]
    fn test_check_cargo_dependencies_wildcard() {
        let checker = DependencyChecker::new();
        let content = r#"
[dependencies]
serde = "*"
        "#;

        let result = checker.check_cargo_dependencies(content).unwrap();
        assert_eq!(result.issues.len(), 1);
        assert_eq!(result.issues[0].severity, IssueSeverity::Medium);
    }

    #[test]
    fn test_extract_cargo_version_string() {
        let checker = DependencyChecker::new();
        let value = toml::Value::String("1.0.0".to_string());
        let version = checker.extract_cargo_version(&value);
        assert_eq!(version, "1.0.0");
    }

    #[test]
    fn test_extract_cargo_version_table() {
        let checker = DependencyChecker::new();
        let mut table = toml::map::Map::new();
        table.insert(
            "version".to_string(),
            toml::Value::String("1.0.0".to_string()),
        );
        let value = toml::Value::Table(table);
        let version = checker.extract_cargo_version(&value);
        assert_eq!(version, "1.0.0");
    }

    #[test]
    fn test_check_vulnerabilities_clean() {
        let checker = DependencyChecker::new();
        let dependencies = vec![Dependency {
            name: "express".to_string(),
            version_requirement: "^4.17.1".to_string(),
            dev: false,
        }];

        let issues = checker.check_vulnerabilities(&dependencies);
        assert_eq!(issues.len(), 0);
    }

    #[test]
    fn test_check_vulnerabilities_known_issue() {
        let checker = DependencyChecker::new();
        let dependencies = vec![Dependency {
            name: "event-stream".to_string(),
            version_requirement: "3.3.4".to_string(),
            dev: false,
        }];

        let issues = checker.check_vulnerabilities(&dependencies);
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].severity, IssueSeverity::Critical);
    }

    #[tokio::test]
    async fn test_check_dependencies_npm_file() {
        use std::io::Write;
        use tempfile::TempDir;

        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("package.json");
        let mut file = std::fs::File::create(&file_path).unwrap();
        writeln!(file, r#"{{"dependencies": {{"express": "^4.17.1"}}}}"#).unwrap();

        let checker = DependencyChecker::new();
        let result = checker
            .check_dependencies(&file_path, ManifestType::Npm)
            .await
            .unwrap();

        assert_eq!(result.total_count, 1);
        assert_eq!(result.dependencies[0].name, "express");
    }
}
