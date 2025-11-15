

//! Package Publisher - Main orchestrator for package publishing
//!
//! Manages the complete publishing workflow including:
//! - Registry detection and plugin loading
//! - Security scanning and validation
//! - Dry-run execution
//! - Hook execution (preBuild, prePublish, postPublish, onError)
//! - State management and error recovery
//! - Verification and analytics recording

use crate::core::config::PublishConfig;
use crate::core::config_loader::ConfigLoader;
use crate::core::state_machine::{PublishState, PublishStateMachine};
use crate::plugins::plugin_loader::{DetectedPlugin, PluginLoader};
use crate::security::credential_validator::CredentialValidator;
use crate::security::secrets_scanner::SecretsScanner;
use std::path::{Path, PathBuf};
use std::time::Instant;
use tokio::io::{self, AsyncBufReadExt, BufReader, AsyncWriteExt};

/// Publishing options passed from CLI or config
#[derive(Debug, Clone, Default)]
pub struct PublishOptions {
    /// Specific registry to publish to
    pub registry: Option<String>,

    /// Perform dry-run only without actual publishing
    pub dry_run: bool,

    /// Non-interactive mode (CI/CD)
    pub non_interactive: bool,

    /// Resume from previous state
    pub resume: bool,

    /// Skip all hooks
    pub skip_hooks: bool,

    /// Execute hooks only (skip actual publishing)
    pub hooks_only: bool,

    /// One-time password for 2FA (npm)
    pub otp: Option<String>,

    /// Publish with tag
    pub tag: Option<String>,

    /// Access level (public|restricted)
    pub access: Option<String>,
}

impl PublishOptions {
    /// Convert to core::traits::PublishOptions for plugin interface
    fn to_plugin_options(&self) -> crate::core::traits::PublishOptions {
        use std::collections::HashMap;

        crate::core::traits::PublishOptions {
            dry_run: Some(self.dry_run),
            non_interactive: Some(self.non_interactive),
            otp: self.otp.clone(),
            tag: self.tag.clone(),
            access: self.access.clone(),
            resume: Some(self.resume),
            registry: self.registry.clone(),
            skip_hooks: Some(self.skip_hooks),
            hooks_only: Some(self.hooks_only),
            extra: HashMap::new(),
        }
    }
}

/// Publishing report returned after publish operation
#[derive(Debug, Clone)]
pub struct PublishReport {
    pub success: bool,
    pub registry: String,
    pub package_name: String,
    pub version: String,
    pub published_at: Option<chrono::DateTime<chrono::Utc>>,
    pub verification_url: Option<String>,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
    pub duration: u64,
    pub state: String,
}

/// Main package publisher orchestrator
pub struct PackagePublisher {
    project_path: PathBuf,
    plugin_loader: PluginLoader,
    state_machine: PublishStateMachine,
    secrets_scanner: SecretsScanner,
    credential_validator: CredentialValidator,
    config: Option<PublishConfig>,
}

impl PackagePublisher {
    /// Create a new PackagePublisher
    ///
    /// # Arguments
    ///
    /// * `project_path` - Path to the project directory
    pub fn new<P: AsRef<Path>>(project_path: P) -> Self {
        let project_path = project_path.as_ref().to_path_buf();

        Self {
            plugin_loader: PluginLoader::new(),
            state_machine: PublishStateMachine::new(project_path.clone()),
            secrets_scanner: SecretsScanner::new(),
            credential_validator: CredentialValidator::new(),
            project_path,
            config: None,
        }
    }

    /// Load configuration from file and CLI arguments
    ///
    /// # Arguments
    ///
    /// * `cli_args` - Optional CLI arguments to override config file
    pub async fn load_config(&mut self, _cli_args: Option<PublishOptions>) -> Result<(), anyhow::Error> {
        // Load configuration
        use crate::core::config_loader::ConfigLoadOptions;
        use std::collections::HashMap;

        let options = ConfigLoadOptions {
            project_path: self.project_path.clone(),
            cli_args: None, // TODO: Convert PublishOptions to PublishConfig
            env: HashMap::new(),
        };

        self.config = Some(ConfigLoader::load(options).await.map_err(|e| anyhow::anyhow!("{}", e))?);

        Ok(())
    }

    /// Auto-detect applicable registries (parallel execution for performance)
    pub async fn detect_registries(&self) -> Result<Vec<DetectedPlugin>, anyhow::Error> {
        let detected = self.plugin_loader.detect_plugins(&self.project_path).await?;

        if detected.is_empty() {
            return Err(anyhow::anyhow!("No registries detected"));
        }

        Ok(detected)
    }

    /// Publish a package
    ///
    /// # Arguments
    ///
    /// * `options` - Publishing options
    ///
    /// # Returns
    ///
    /// Publishing report with detailed results
    pub async fn publish(&mut self, options: PublishOptions) -> Result<PublishReport, anyhow::Error> {
        let start_time = Instant::now();
        let mut errors = Vec::new();
        let mut warnings = Vec::new();

        // Load config if not already loaded
        if self.config.is_none() {
            self.load_config(Some(options.clone())).await?;
        }

        // Merge CLI options with config (CLI takes priority)
        let effective_options = self.merge_options_with_config(options.clone());

        // 1. Restore state if resume requested
        if effective_options.resume {
            self.state_machine.transition(PublishState::Initial, None).await?;
            let restored = self.state_machine.restore().await?;
            if !restored {
                return Err(anyhow::anyhow!("State file not found or corrupted"));
            }
        } else {
            self.state_machine.clear().await?;
            self.state_machine.transition(PublishState::Initial, None).await?;
        }

        // 2. Detect registries
        self.state_machine.transition(PublishState::Detecting, None).await?;
        let detected_registries = self.detect_registries().await?;

        println!("\nDetected registries:");
        for plugin in &detected_registries {
            println!("  - {} (confidence: {:.0}%)",
                plugin.registry_type.as_str(),
                plugin.confidence * 100.0
            );
        }
        println!();

        // Use specified registry or first detected
        let registry_name = effective_options.registry.clone()
            .unwrap_or_else(|| detected_registries[0].registry_type.as_str().to_string());

        let plugin_info = detected_registries
            .iter()
            .find(|p| p.registry_type.as_str() == registry_name)
            .ok_or_else(|| anyhow::anyhow!("Registry not detected: {}", registry_name))?;

        let plugin = self.plugin_loader.load_plugin(plugin_info.registry_type, self.project_path.to_str().unwrap())?;

        println!("📦 Registry selected: {}\n", registry_name);

        // 3. Security scan (if enabled)
        let secrets_scanning_enabled = true; // TODO: Read from config

        if secrets_scanning_enabled {
            println!("🔒 Security scan...");

            let scan_result = self.secrets_scanner.scan_project(&self.project_path).await?;

            if !scan_result.findings.is_empty() {
                warnings.push(format!("{} potential secrets detected", scan_result.findings.len()));

                if !effective_options.non_interactive {
                    println!("⚠️  Potential secrets detected:");
                    for finding in &scan_result.findings {
                        println!("  - {} in {}", finding.secret_type, finding.file.display());
                    }

                    if !self.confirm("⚠️  Continue with publishing?").await? {
                        return Err(anyhow::anyhow!("{} secrets detected", scan_result.findings.len()));
                    }
                } else {
                    println!("  ⚠️  {} potential secrets detected (non-interactive mode, continuing...)",
                        scan_result.findings.len());
                }
            } else {
                println!("  ✅ No secrets detected\n");
            }
        }

        // 4. Validation
        self.state_machine.transition(PublishState::Validating, None).await?;
        println!("🔍 Validating package...");

        let validation_result = plugin.validate().await?;

        if !validation_result.valid {
            println!("  ❌ Validation failed:");
            for error in &validation_result.errors {
                println!("    - [{}] {}", error.field, error.message);
                errors.push(format!("{}: {}", error.field, error.message));
            }
            return Err(anyhow::anyhow!("Validation failed for {}", registry_name));
        }

        if !validation_result.warnings.is_empty() {
            println!("  ⚠️  Warnings:");
            for warning in &validation_result.warnings {
                println!("    - [{}] {}", warning.field, warning.message);
                warnings.push(format!("{}: {}", warning.field, warning.message));
            }
        }

        println!("  ✅ Validation successful\n");

        let package_version = validation_result.metadata
            .as_ref()
            .and_then(|m| m.get("version"))
            .map(|v| v.to_string())
            .unwrap_or_else(|| "unknown".to_string());
        let package_name = validation_result.metadata
            .as_ref()
            .and_then(|m| m.get("packageName").or_else(|| m.get("name")))
            .map(|n| n.to_string())
            .unwrap_or_else(|| "unknown".to_string());

        // 5. Dry-run (if not skipped)
        let should_skip_dry_run = effective_options.dry_run
            || effective_options.resume;

        if !should_skip_dry_run {
            self.state_machine.transition(PublishState::DryRun, None).await?;
            println!("🧪 Executing dry-run...");

            let dry_run_result = plugin.dry_run().await?;

            if !dry_run_result.success {
                println!("  ❌ Dry-run failed:");
                if let Some(ref dry_errors) = dry_run_result.errors {
                    for error in dry_errors {
                        println!("    - {}", error.message);
                        errors.push(error.message.clone());
                    }
                }
                return Err(anyhow::anyhow!("Dry-run failed for {}", registry_name));
            }

            println!("  ✅ Dry-run successful");
            if let Some(ref size) = dry_run_result.estimated_size {
                println!("    Package size: {}", size);
            }
            println!();
        }

        // Return if dry-run only
        if effective_options.dry_run {
            return Ok(PublishReport {
                success: true,
                registry: registry_name,
                package_name,
                version: package_version,
                published_at: None,
                verification_url: None,
                errors,
                warnings,
                duration: start_time.elapsed().as_millis() as u64,
                state: "DRY_RUN".to_string(),
            });
        }

        // 6. Confirmation (interactive mode)
        let should_confirm = !effective_options.non_interactive
            && !effective_options.resume
            && self.config.as_ref()
                .and_then(|c| c.publish.as_ref())
                .and_then(|p| p.confirm)
                .unwrap_or(true);

        if should_confirm {
            self.state_machine.transition(PublishState::Confirming, None).await?;

            println!("📋 Pre-publish checklist:");
            println!("  ✅ Registry: {}", registry_name);
            println!("  ✅ Version: {}", package_version);
            println!("  ✅ Validation: passed");
            println!("  ✅ Dry-run: passed");
            if !warnings.is_empty() {
                println!("  ⚠️  Warnings: {}", warnings.len());
            }
            println!();

            if !self.confirm("Proceed with publishing?").await? {
                println!("Publishing cancelled by user");
                self.state_machine.transition(PublishState::Failed, None).await?;
                return Ok(PublishReport {
                    success: false,
                    registry: registry_name,
                    package_name,
                    version: package_version,
                    published_at: None,
                    verification_url: None,
                    errors: vec!["User cancelled".to_string()],
                    warnings,
                    duration: start_time.elapsed().as_millis() as u64,
                    state: "FAILED".to_string(),
                });
            }
        }

        // Return if hooks-only mode
        if effective_options.hooks_only {
            println!("🪝 Hooks-only mode: skipping actual publishing\n");
            return Ok(PublishReport {
                success: true,
                registry: registry_name,
                package_name,
                version: package_version,
                published_at: None,
                verification_url: None,
                errors,
                warnings,
                duration: start_time.elapsed().as_millis() as u64,
                state: "DRY_RUN".to_string(),
            });
        }

        // 7. Publish
        self.state_machine.transition(PublishState::Publishing, None).await?;
        println!("📤 Publishing...");

        let publish_result = plugin.publish(Some(effective_options.to_plugin_options())).await?;

        if !publish_result.success {
            let error_msg = publish_result.error.unwrap_or_else(|| "Publishing failed".to_string());
            return Err(anyhow::anyhow!("Publishing failed for {}: {}", registry_name, error_msg));
        }

        println!("  ✅ Published successfully\n");

        // 8. Verify (if enabled)
        let should_verify = self.config.as_ref()
            .and_then(|c| c.publish.as_ref())
            .and_then(|p| p.verify)
            .unwrap_or(true);

        let mut verification_url = None;
        if should_verify {
            self.state_machine.transition(PublishState::Verifying, None).await?;
            println!("🔍 Verifying publication...");

            match plugin.verify().await {
                Ok(verify_result) => {
                    if verify_result.verified {
                        println!("  ✅ Verification successful");
                        if let Some(ref url) = verify_result.url {
                            println!("    URL: {}\n", url);
                            verification_url = Some(url.clone());
                        }
                    } else {
                        let error_msg = verify_result.error.unwrap_or_else(|| "Unknown error".to_string());
                        warnings.push(format!("Verification failed: {}", error_msg));
                        println!("  ⚠️  Verification failed (but publishing succeeded)");
                        println!("    {}", error_msg);
                    }
                }
                Err(e) => {
                    warnings.push(format!("Verification error: {}", e));
                    println!("  ⚠️  Verification error (but publishing succeeded)");
                }
            }
        }

        // Success
        self.state_machine.transition(PublishState::Success, None).await?;

        Ok(PublishReport {
            success: true,
            registry: registry_name,
            package_name,
            version: package_version,
            published_at: Some(chrono::Utc::now()),
            verification_url,
            errors,
            warnings,
            duration: start_time.elapsed().as_millis() as u64,
            state: "SUCCESS".to_string(),
        })
    }

    /// Merge CLI options with configuration (CLI takes priority)
    fn merge_options_with_config(&self, mut options: PublishOptions) -> PublishOptions {
        let Some(config) = &self.config else {
            return options;
        };

        // Merge registry from config
        if options.registry.is_none()
            && let Some(ref project_config) = config.project
                && let Some(ref default_reg) = project_config.default_registry {
                    options.registry = Some(default_reg.clone());
                }

        options
    }

    /// Prompt user for confirmation
    async fn confirm(&self, message: &str) -> Result<bool, anyhow::Error> {
        print!("{} (yes/no): ", message);
        io::stdout().flush().await?;

        let stdin = io::stdin();
        let mut reader = BufReader::new(stdin);
        let mut answer = String::new();

        reader.read_line(&mut answer).await?;

        let answer = answer.trim().to_lowercase();
        Ok(answer == "yes" || answer == "y")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_package_publisher() {
        let publisher = PackagePublisher::new(".");
        assert_eq!(publisher.project_path, PathBuf::from("."));
    }

    #[test]
    fn test_publish_options_default() {
        let options = PublishOptions::default();
        assert_eq!(options.registry, None);
        assert_eq!(options.dry_run, false);
        assert_eq!(options.non_interactive, false);
    }
}
