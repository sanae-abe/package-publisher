//! Plugin Loader - Discovers and loads registry plugins
//!
//! This module provides plugin discovery and loading functionality for
//! different package registry integrations (NPM, Crates.io, Homebrew, etc).
//!
//! # Example
//!
//! ```no_run
//! use package_publisher::plugins::plugin_loader::PluginLoader;
//! use std::path::Path;
//!
//! # async fn example() -> anyhow::Result<()> {
//! let loader = PluginLoader::new();
//! let plugins = loader.detect_plugins(Path::new(".")).await?;
//!
//! println!("Detected {} registry plugins", plugins.len());
//! # Ok(())
//! # }
//! ```

use crate::core::traits::RegistryPlugin;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Arc;
use tokio::fs;

/// Registry type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RegistryType {
    Npm,
    Crates,
    PyPI,
    Homebrew,
}

impl RegistryType {
    /// Get string representation of registry type
    pub fn as_str(&self) -> &'static str {
        match self {
            RegistryType::Npm => "npm",
            RegistryType::Crates => "crates.io",
            RegistryType::PyPI => "pypi",
            RegistryType::Homebrew => "homebrew",
        }
    }
}

/// Plugin detection result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedPlugin {
    pub registry_type: RegistryType,
    pub manifest_path: String,
    pub confidence: f64,
}

/// Plugin loader for discovering and loading registry plugins
pub struct PluginLoader {
    /// Base directory for plugin search
    base_path: Option<String>,
}

impl Default for PluginLoader {
    fn default() -> Self {
        Self::new()
    }
}

impl PluginLoader {
    /// Create a new plugin loader
    ///
    /// # Examples
    ///
    /// ```
    /// use package_publisher::plugins::PluginLoader;
    ///
    /// let loader = PluginLoader::new();
    /// ```
    pub fn new() -> Self {
        Self { base_path: None }
    }

    /// Create a new plugin loader with a specific base path
    ///
    /// # Arguments
    ///
    /// * `base_path` - Base directory for plugin search
    pub fn with_base_path(base_path: String) -> Self {
        Self {
            base_path: Some(base_path),
        }
    }

    /// Detect available plugins in a project
    ///
    /// # Arguments
    ///
    /// * `project_path` - Path to the project directory
    ///
    /// # Returns
    ///
    /// List of detected plugins with their manifest paths
    ///
    /// # Examples
    ///
    /// ```no_run
    /// use package_publisher::plugins::plugin_loader::PluginLoader;
    /// use std::path::Path;
    ///
    /// # async fn example() -> anyhow::Result<()> {
    /// let loader = PluginLoader::new();
    /// let plugins = loader.detect_plugins(Path::new(".")).await?;
    /// # Ok(())
    /// # }
    /// ```
    pub async fn detect_plugins(&self, project_path: &Path) -> anyhow::Result<Vec<DetectedPlugin>> {
        let mut detected = Vec::new();

        // Detect NPM (package.json)
        if let Ok(npm_plugin) = self.detect_npm(project_path).await {
            detected.push(npm_plugin);
        }

        // Detect Crates.io (Cargo.toml)
        if let Ok(crates_plugin) = self.detect_crates(project_path).await {
            detected.push(crates_plugin);
        }

        // Detect PyPI (pyproject.toml or setup.py)
        if let Ok(pypi_plugin) = self.detect_pypi(project_path).await {
            detected.push(pypi_plugin);
        }

        // Detect Homebrew (*.rb formula)
        if let Ok(homebrew_plugin) = self.detect_homebrew(project_path).await {
            detected.push(homebrew_plugin);
        }

        Ok(detected)
    }

    /// Detect NPM plugin
    async fn detect_npm(&self, project_path: &Path) -> anyhow::Result<DetectedPlugin> {
        let manifest_path = project_path.join("package.json");

        if fs::metadata(&manifest_path).await.is_ok() {
            // Verify it's valid JSON
            let content = fs::read_to_string(&manifest_path).await?;
            let _: serde_json::Value = serde_json::from_str(&content)?;

            Ok(DetectedPlugin {
                registry_type: RegistryType::Npm,
                manifest_path: manifest_path.display().to_string(),
                confidence: 1.0,
            })
        } else {
            Err(anyhow::anyhow!("package.json not found"))
        }
    }

    /// Detect Crates.io plugin
    async fn detect_crates(&self, project_path: &Path) -> anyhow::Result<DetectedPlugin> {
        let manifest_path = project_path.join("Cargo.toml");

        if fs::metadata(&manifest_path).await.is_ok() {
            // Verify it's valid TOML
            let content = fs::read_to_string(&manifest_path).await?;
            let _: toml::Value = toml::from_str(&content)?;

            Ok(DetectedPlugin {
                registry_type: RegistryType::Crates,
                manifest_path: manifest_path.display().to_string(),
                confidence: 1.0,
            })
        } else {
            Err(anyhow::anyhow!("Cargo.toml not found"))
        }
    }

    /// Detect PyPI plugin
    async fn detect_pypi(&self, project_path: &Path) -> anyhow::Result<DetectedPlugin> {
        // Try pyproject.toml first (modern)
        let pyproject_path = project_path.join("pyproject.toml");
        if fs::metadata(&pyproject_path).await.is_ok() {
            return Ok(DetectedPlugin {
                registry_type: RegistryType::PyPI,
                manifest_path: pyproject_path.display().to_string(),
                confidence: 1.0,
            });
        }

        // Fallback to setup.py (legacy)
        let setup_path = project_path.join("setup.py");
        if fs::metadata(&setup_path).await.is_ok() {
            return Ok(DetectedPlugin {
                registry_type: RegistryType::PyPI,
                manifest_path: setup_path.display().to_string(),
                confidence: 0.9, // Lower confidence for legacy
            });
        }

        Err(anyhow::anyhow!("No PyPI manifest found"))
    }

    /// Detect Homebrew plugin
    async fn detect_homebrew(&self, project_path: &Path) -> anyhow::Result<DetectedPlugin> {
        // Look for formula files (*.rb)
        let formula_dir = project_path.join("Formula");

        if fs::metadata(&formula_dir).await.is_ok() {
            // Find first .rb file
            let mut entries = fs::read_dir(&formula_dir).await?;
            while let Some(entry) = entries.next_entry().await? {
                let path = entry.path();
                if path.extension().map(|e| e == "rb").unwrap_or(false) {
                    return Ok(DetectedPlugin {
                        registry_type: RegistryType::Homebrew,
                        manifest_path: path.display().to_string(),
                        confidence: 1.0,
                    });
                }
            }
        }

        Err(anyhow::anyhow!("No Homebrew formula found"))
    }

    /// Load a plugin for a specific registry type
    ///
    /// # Arguments
    ///
    /// * `registry_type` - Type of registry to load plugin for
    ///
    /// # Returns
    ///
    /// Arc-wrapped plugin instance implementing RegistryPlugin trait
    pub fn load_plugin(
        &self,
        registry_type: RegistryType,
    ) -> anyhow::Result<Arc<dyn RegistryPlugin>> {
        match registry_type {
            RegistryType::Npm => {
                use crate::plugins::npm_plugin::NpmPlugin;
                Ok(Arc::new(NpmPlugin::new()))
            }
            RegistryType::Crates => {
                use crate::plugins::crates_io_plugin::CratesIoPlugin;
                Ok(Arc::new(CratesIoPlugin::new()))
            }
            RegistryType::PyPI => {
                use crate::plugins::pypi_plugin::PyPiPlugin;
                Ok(Arc::new(PyPiPlugin::new()))
            }
            RegistryType::Homebrew => {
                use crate::plugins::homebrew_plugin::HomebrewPlugin;
                Ok(Arc::new(HomebrewPlugin::new()))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::TempDir;

    #[test]
    fn test_new_loader() {
        let loader = PluginLoader::new();
        assert!(loader.base_path.is_none());
    }

    #[test]
    fn test_with_base_path() {
        let loader = PluginLoader::with_base_path("/test/path".to_string());
        assert_eq!(loader.base_path, Some("/test/path".to_string()));
    }

    #[tokio::test]
    async fn test_detect_npm() {
        let temp_dir = TempDir::new().unwrap();
        let package_json = temp_dir.path().join("package.json");
        let mut file = std::fs::File::create(&package_json).unwrap();
        writeln!(file, r#"{{"name": "test", "version": "1.0.0"}}"#).unwrap();

        let loader = PluginLoader::new();
        let result = loader.detect_npm(temp_dir.path()).await.unwrap();

        assert_eq!(result.registry_type, RegistryType::Npm);
        assert_eq!(result.confidence, 1.0);
    }

    #[tokio::test]
    async fn test_detect_npm_not_found() {
        let temp_dir = TempDir::new().unwrap();
        let loader = PluginLoader::new();
        let result = loader.detect_npm(temp_dir.path()).await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_detect_crates() {
        let temp_dir = TempDir::new().unwrap();
        let cargo_toml = temp_dir.path().join("Cargo.toml");
        let mut file = std::fs::File::create(&cargo_toml).unwrap();
        writeln!(file, "[package]\nname = \"test\"\nversion = \"0.1.0\"").unwrap();

        let loader = PluginLoader::new();
        let result = loader.detect_crates(temp_dir.path()).await.unwrap();

        assert_eq!(result.registry_type, RegistryType::Crates);
        assert_eq!(result.confidence, 1.0);
    }

    #[tokio::test]
    async fn test_detect_pypi_pyproject() {
        let temp_dir = TempDir::new().unwrap();
        let pyproject = temp_dir.path().join("pyproject.toml");
        let mut file = std::fs::File::create(&pyproject).unwrap();
        writeln!(file, "[project]\nname = \"test\"").unwrap();

        let loader = PluginLoader::new();
        let result = loader.detect_pypi(temp_dir.path()).await.unwrap();

        assert_eq!(result.registry_type, RegistryType::PyPI);
        assert_eq!(result.confidence, 1.0);
    }

    #[tokio::test]
    async fn test_detect_pypi_setup_py() {
        let temp_dir = TempDir::new().unwrap();
        let setup_py = temp_dir.path().join("setup.py");
        let mut file = std::fs::File::create(&setup_py).unwrap();
        writeln!(file, "# setup.py").unwrap();

        let loader = PluginLoader::new();
        let result = loader.detect_pypi(temp_dir.path()).await.unwrap();

        assert_eq!(result.registry_type, RegistryType::PyPI);
        assert_eq!(result.confidence, 0.9); // Lower confidence for legacy
    }

    #[tokio::test]
    async fn test_detect_homebrew() {
        let temp_dir = TempDir::new().unwrap();
        let formula_dir = temp_dir.path().join("Formula");
        std::fs::create_dir(&formula_dir).unwrap();
        let formula = formula_dir.join("test.rb");
        let mut file = std::fs::File::create(&formula).unwrap();
        writeln!(file, "class Test < Formula\nend").unwrap();

        let loader = PluginLoader::new();
        let result = loader.detect_homebrew(temp_dir.path()).await.unwrap();

        assert_eq!(result.registry_type, RegistryType::Homebrew);
        assert_eq!(result.confidence, 1.0);
    }

    #[tokio::test]
    async fn test_detect_plugins_multiple() {
        let temp_dir = TempDir::new().unwrap();

        // Create package.json
        let package_json = temp_dir.path().join("package.json");
        let mut file = std::fs::File::create(&package_json).unwrap();
        writeln!(file, r#"{{"name": "test", "version": "1.0.0"}}"#).unwrap();

        // Create Cargo.toml
        let cargo_toml = temp_dir.path().join("Cargo.toml");
        let mut file = std::fs::File::create(&cargo_toml).unwrap();
        writeln!(file, "[package]\nname = \"test\"\nversion = \"0.1.0\"").unwrap();

        let loader = PluginLoader::new();
        let plugins = loader.detect_plugins(temp_dir.path()).await.unwrap();

        assert_eq!(plugins.len(), 2);
        assert!(plugins.iter().any(|p| p.registry_type == RegistryType::Npm));
        assert!(plugins
            .iter()
            .any(|p| p.registry_type == RegistryType::Crates));
    }
}
