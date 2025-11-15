//! Configuration file loader for package-publisher
//!
//! This module provides configuration loading, validation, and merging capabilities.

use super::config::*;
use crate::core::error::PublishError;
use regex::Regex;
use std::collections::HashMap;
use std::env;
use std::path::{Path, PathBuf};
use tokio::fs;

/// Configuration file name
const CONFIG_FILENAME: &str = ".publish-config.yaml";

/// Environment variable pattern (${VAR_NAME})
const ENV_VAR_PATTERN: &str = r"\$\{([A-Z_][A-Z0-9_]*)\}";

/// Configuration load options
#[derive(Debug, Clone)]
pub struct ConfigLoadOptions {
    /// Project path to load config from
    pub project_path: PathBuf,

    /// CLI arguments (highest priority)
    pub cli_args: Option<PublishConfig>,

    /// Environment variables
    pub env: HashMap<String, String>,
}

/// Configuration validation result
#[derive(Debug, Clone, PartialEq)]
pub struct ConfigValidationResult {
    /// Is configuration valid?
    pub valid: bool,

    /// Validation errors
    pub errors: Vec<ConfigValidationError>,

    /// Validation warnings
    pub warnings: Vec<ConfigValidationWarning>,
}

/// Configuration validation error
#[derive(Debug, Clone, PartialEq)]
pub struct ConfigValidationError {
    /// Field path (e.g., "registries.npm.tag")
    pub field: String,

    /// Error message
    pub message: String,

    /// Expected type/value
    pub expected: Option<String>,

    /// Actual type/value
    pub actual: Option<String>,
}

/// Configuration validation warning
#[derive(Debug, Clone, PartialEq)]
pub struct ConfigValidationWarning {
    /// Field path
    pub field: String,

    /// Warning message
    pub message: String,

    /// Suggestion
    pub suggestion: Option<String>,
}

/// Configuration file loader
pub struct ConfigLoader;

impl ConfigLoader {
    /// Load configuration from multiple sources with priority
    ///
    /// Priority (high to low):
    /// 1. CLI arguments
    /// 2. Environment variables
    /// 3. Project config (./.publish-config.yaml)
    /// 4. Global config (~/.publish-config.yaml)
    /// 5. Default values
    pub async fn load(options: ConfigLoadOptions) -> Result<PublishConfig, PublishError> {
        let mut configs: Vec<PublishConfig> = Vec::new();

        // 5. Default values (lowest priority)
        configs.push(PublishConfig::default());

        // 4. Global config
        if let Some(global_config) = Self::load_global_config().await? {
            configs.push(global_config);
        }

        // 3. Project config
        if let Some(project_config) = Self::load_project_config(&options.project_path).await? {
            configs.push(project_config);
        }

        // 2. Environment variables
        if let Some(env_config) = Self::load_env_config(&options.env) {
            configs.push(env_config);
        }

        // 1. CLI arguments (highest priority)
        if let Some(cli_config) = options.cli_args {
            configs.push(cli_config);
        }

        // Merge all configs
        let merged_config = Self::merge_configs(configs);

        // Expand environment variables
        let expanded_config = Self::expand_env_vars(merged_config, &options.env)?;

        Ok(expanded_config)
    }

    /// Load global configuration from ~/.publish-config.yaml
    async fn load_global_config() -> Result<Option<PublishConfig>, PublishError> {
        let home_dir = env::var("HOME").map_err(|_| {
            PublishError::ConfigError("HOME environment variable not set".to_string())
        })?;
        let global_config_path = PathBuf::from(home_dir).join(CONFIG_FILENAME);

        Self::load_config_file(&global_config_path).await
    }

    /// Load project configuration from ./.publish-config.yaml
    async fn load_project_config(
        project_path: &Path,
    ) -> Result<Option<PublishConfig>, PublishError> {
        let project_config_path = project_path.join(CONFIG_FILENAME);

        Self::load_config_file(&project_config_path).await
    }

    /// Load configuration from YAML file
    fn load_config_file(
        file_path: &Path,
    ) -> std::pin::Pin<
        Box<
            dyn std::future::Future<Output = Result<Option<PublishConfig>, PublishError>>
                + Send
                + '_,
        >,
    > {
        Box::pin(async move {
            // Check if file exists
            if !file_path.exists() {
                return Ok(None);
            }

            let content = fs::read_to_string(file_path).await.map_err(|e| {
                PublishError::ConfigError(format!("Failed to read config file: {}", e))
            })?;

            let config: PublishConfig = serde_yaml::from_str(&content).map_err(|e| {
                PublishError::ConfigError(format!("Failed to parse YAML config: {}", e))
            })?;

            // Handle extends if present
            if let Some(extends_path) = &config.extends {
                let base_path = file_path
                    .parent()
                    .ok_or_else(|| {
                        PublishError::ConfigError("Invalid config file path".to_string())
                    })?
                    .join(extends_path);

                if let Some(base_config) = Self::load_config_file(&base_path).await? {
                    return Ok(Some(Self::merge_configs(vec![base_config, config])));
                }
            }

            Ok(Some(config))
        })
    }

    /// Load configuration from environment variables
    fn load_env_config(env: &HashMap<String, String>) -> Option<PublishConfig> {
        let mut config = PublishConfig::default();
        let mut has_changes = false;

        // PUBLISH_REGISTRY -> defaultRegistry
        if let Some(registry) = env.get("PUBLISH_REGISTRY") {
            config.project = Some(ProjectConfig {
                name: None,
                default_registry: Some(registry.clone()),
            });
            has_changes = true;
        }

        // PUBLISH_DRY_RUN -> publish.dryRun
        if let Some(dry_run) = env.get("PUBLISH_DRY_RUN") {
            let mode = match dry_run.as_str() {
                "first" => Some(DryRunMode::First),
                "always" => Some(DryRunMode::Always),
                "never" => Some(DryRunMode::Never),
                _ => None,
            };

            if let Some(mode) = mode {
                config.publish = Some(PublishOptionsConfig {
                    dry_run: Some(mode),
                    ..Default::default()
                });
                has_changes = true;
            }
        }

        // PUBLISH_NON_INTERACTIVE -> publish.interactive
        if env.get("PUBLISH_NON_INTERACTIVE").map(|s| s.as_str()) == Some("true") {
            let mut publish_config = config.publish.unwrap_or_default();
            publish_config.interactive = Some(false);
            config.publish = Some(publish_config);
            has_changes = true;
        }

        if has_changes { Some(config) } else { None }
    }

    /// Merge multiple configurations with priority
    fn merge_configs(configs: Vec<PublishConfig>) -> PublishConfig {
        let mut result = PublishConfig::default();

        for config in configs {
            Self::merge_into(&mut result, config);
        }

        result
    }

    /// Merge source config into target
    fn merge_into(target: &mut PublishConfig, source: PublishConfig) {
        // Version
        if !source.version.is_empty() {
            target.version = source.version;
        }

        // Extends
        if source.extends.is_some() {
            target.extends = source.extends;
        }

        // Variables
        if let Some(source_vars) = source.variables {
            let target_vars = target.variables.get_or_insert_with(HashMap::new);
            target_vars.extend(source_vars);
        }

        // Project
        if let Some(source_project) = source.project {
            let target_project = target.project.get_or_insert(ProjectConfig {
                name: None,
                default_registry: None,
            });

            if source_project.name.is_some() {
                target_project.name = source_project.name;
            }
            if source_project.default_registry.is_some() {
                target_project.default_registry = source_project.default_registry;
            }
        }

        // Registries (simplified merge)
        if source.registries.npm.is_some() {
            target.registries.npm = source.registries.npm;
        }
        if source.registries.crates.is_some() {
            target.registries.crates = source.registries.crates;
        }
        if source.registries.pypi.is_some() {
            target.registries.pypi = source.registries.pypi;
        }
        if source.registries.homebrew.is_some() {
            target.registries.homebrew = source.registries.homebrew;
        }
        if source.registries.custom.is_some() {
            target.registries.custom = source.registries.custom;
        }

        // Security
        if source.security.is_some() {
            target.security = source.security;
        }

        // Hooks
        if source.hooks.is_some() {
            target.hooks = source.hooks;
        }

        // Publish options
        if source.publish.is_some() {
            target.publish = source.publish;
        }

        // Validation
        if source.validation.is_some() {
            target.validation = source.validation;
        }

        // Notifications
        if source.notifications.is_some() {
            target.notifications = source.notifications;
        }

        // Plugins
        if source.plugins.is_some() {
            target.plugins = source.plugins;
        }
    }

    /// Expand environment variables in configuration
    ///
    /// Security features:
    /// - Only expands variables matching ${VAR_NAME} pattern
    /// - Respects allowedPrefixes if configured
    /// - Checks forbiddenPatterns if configured
    fn expand_env_vars(
        mut config: PublishConfig,
        env: &HashMap<String, String>,
    ) -> Result<PublishConfig, PublishError> {
        let enabled = config
            .security
            .as_ref()
            .and_then(|s| s.env_var_expansion.as_ref())
            .and_then(|e| e.enabled)
            .unwrap_or(true);

        if !enabled {
            return Ok(config);
        }

        let allowed_prefixes = config
            .security
            .as_ref()
            .and_then(|s| s.env_var_expansion.as_ref())
            .and_then(|e| e.allowed_prefixes.clone());

        let forbidden_patterns: Vec<Regex> = config
            .security
            .as_ref()
            .and_then(|s| s.env_var_expansion.as_ref())
            .and_then(|e| e.forbidden_patterns.clone())
            .unwrap_or_default()
            .iter()
            .filter_map(|p| Regex::new(p).ok())
            .collect();

        // Expand variables in registries.custom (most likely to contain env vars)
        if let Some(custom_registries) = &mut config.registries.custom {
            for (_, custom_config) in custom_registries.iter_mut() {
                if let Some(publish_cmd) = &custom_config.publish_command {
                    custom_config.publish_command = Some(Self::expand_string(
                        publish_cmd,
                        env,
                        &allowed_prefixes,
                        &forbidden_patterns,
                    )?);
                }
                if let Some(verify_cmd) = &custom_config.verify_command {
                    custom_config.verify_command = Some(Self::expand_string(
                        verify_cmd,
                        env,
                        &allowed_prefixes,
                        &forbidden_patterns,
                    )?);
                }
            }
        }

        // Expand variables in notifications
        if let Some(notifications) = &mut config.notifications
            && let Some(slack) = &mut notifications.slack
        {
            slack.webhook_url = Self::expand_string(
                &slack.webhook_url,
                env,
                &allowed_prefixes,
                &forbidden_patterns,
            )?;
        }

        Ok(config)
    }

    /// Expand environment variables in a single string
    fn expand_string(
        input: &str,
        env: &HashMap<String, String>,
        allowed_prefixes: &Option<Vec<String>>,
        forbidden_patterns: &[Regex],
    ) -> Result<String, PublishError> {
        let env_var_regex = Regex::new(ENV_VAR_PATTERN).unwrap();

        let mut result = input.to_string();
        for cap in env_var_regex.captures_iter(input) {
            let var_name = &cap[1];

            // Check forbidden patterns
            for pattern in forbidden_patterns {
                if pattern.is_match(var_name) {
                    eprintln!(
                        "⚠️  Environment variable {} matches forbidden pattern, skipping",
                        var_name
                    );
                    continue;
                }
            }

            // Check allowed prefixes
            if let Some(prefixes) = allowed_prefixes {
                let allowed = prefixes.iter().any(|prefix| var_name.starts_with(prefix));
                if !allowed {
                    eprintln!(
                        "⚠️  Environment variable {} not allowed by prefix whitelist, skipping",
                        var_name
                    );
                    continue;
                }
            }

            // Get value from environment
            if let Some(value) = env.get(var_name) {
                result = result.replace(&format!("${{{}}}", var_name), value);
            } else {
                eprintln!("⚠️  Environment variable {} not found", var_name);
            }
        }

        Ok(result)
    }

    /// Validate configuration
    pub fn validate(config: &PublishConfig) -> ConfigValidationResult {
        let mut errors = Vec::new();
        let mut warnings = Vec::new();

        // 1. Check version (required)
        if config.version.is_empty() {
            errors.push(ConfigValidationError {
                field: "version".to_string(),
                message: "Version is required".to_string(),
                expected: Some("string (e.g., \"1.0\")".to_string()),
                actual: Some("empty".to_string()),
            });
        } else if config.version != "1.0" {
            warnings.push(ConfigValidationWarning {
                field: "version".to_string(),
                message: format!("Unknown version: {}", config.version),
                suggestion: Some("Currently supported version is \"1.0\" only".to_string()),
            });
        }

        // 2. Validate registries
        Self::validate_registries(&config.registries, &mut errors, &mut warnings);

        // 3. Validate security settings
        if let Some(security) = &config.security {
            Self::validate_security(security, &mut errors, &mut warnings);
        }

        // 4. Validate hooks
        if let Some(hooks) = &config.hooks {
            Self::validate_hooks(hooks, &mut errors, &mut warnings);
        }

        // 5. Validate publish options
        if let Some(publish) = &config.publish {
            Self::validate_publish_options(publish, &mut errors, &mut warnings);
        }

        ConfigValidationResult {
            valid: errors.is_empty(),
            errors,
            warnings,
        }
    }

    /// Validate registry configurations
    fn validate_registries(
        _registries: &RegistryConfigs,
        _errors: &mut Vec<ConfigValidationError>,
        _warnings: &mut Vec<ConfigValidationWarning>,
    ) {
        // Registry-specific validation can be added here
        // Currently all validation is handled by the type system
    }

    /// Validate security settings
    fn validate_security(
        security: &SecurityConfig,
        errors: &mut Vec<ConfigValidationError>,
        _warnings: &mut Vec<ConfigValidationWarning>,
    ) {
        // Validate allowedCommands
        if let Some(allowed_commands) = &security.allowed_commands {
            for (cmd, config) in allowed_commands {
                if config.executable.is_empty() {
                    errors.push(ConfigValidationError {
                        field: format!("security.allowedCommands.{}.executable", cmd),
                        message: "executable is required".to_string(),
                        expected: Some("string (full path)".to_string()),
                        actual: Some("empty".to_string()),
                    });
                }

                if config.allowed_args.is_empty() {
                    errors.push(ConfigValidationError {
                        field: format!("security.allowedCommands.{}.allowedArgs", cmd),
                        message: "allowedArgs is required".to_string(),
                        expected: Some("non-empty array".to_string()),
                        actual: Some("empty array".to_string()),
                    });
                }
            }
        }

        // Validate ignorePatterns
        if let Some(secrets_scanning) = &security.secrets_scanning
            && let Some(ignore_patterns) = &secrets_scanning.ignore_patterns
        {
            for (i, pattern) in ignore_patterns.iter().enumerate() {
                if pattern.path_prefix.is_empty() {
                    errors.push(ConfigValidationError {
                        field: format!("security.secretsScanning.ignorePatterns[{}].pathPrefix", i),
                        message: "pathPrefix is required (path traversal protection)".to_string(),
                        expected: Some("non-empty string".to_string()),
                        actual: Some("empty".to_string()),
                    });
                }
            }
        }
    }

    /// Validate hooks configuration
    fn validate_hooks(
        hooks: &HooksConfig,
        errors: &mut Vec<ConfigValidationError>,
        _warnings: &mut Vec<ConfigValidationWarning>,
    ) {
        let hook_types = [
            ("preBuild", &hooks.pre_build),
            ("prePublish", &hooks.pre_publish),
            ("postPublish", &hooks.post_publish),
            ("onError", &hooks.on_error),
        ];

        for (hook_type, hook_commands) in hook_types {
            if let Some(commands) = hook_commands {
                for (i, hook) in commands.iter().enumerate() {
                    if hook.command.is_empty() {
                        errors.push(ConfigValidationError {
                            field: format!("hooks.{}[{}].command", hook_type, i),
                            message: "command is required".to_string(),
                            expected: Some("non-empty string".to_string()),
                            actual: Some("empty".to_string()),
                        });
                    }

                    if hook.allowed_commands.is_empty() {
                        errors.push(ConfigValidationError {
                            field: format!("hooks.{}[{}].allowedCommands", hook_type, i),
                            message: "allowedCommands is required".to_string(),
                            expected: Some("non-empty array".to_string()),
                            actual: Some("empty array".to_string()),
                        });
                    }
                }
            }
        }
    }

    /// Validate publish options
    fn validate_publish_options(
        _publish: &PublishOptionsConfig,
        _errors: &mut Vec<ConfigValidationError>,
        _warnings: &mut Vec<ConfigValidationWarning>,
    ) {
        // All validation is handled by the type system (enums)
    }

    /// Format validation result as human-readable string
    pub fn format_validation_result(result: &ConfigValidationResult) -> String {
        let mut lines = Vec::new();

        if result.valid {
            lines.push("✅ Configuration validation succeeded".to_string());
        } else {
            lines.push("❌ Configuration has errors".to_string());
        }

        if !result.errors.is_empty() {
            lines.push("\n🔴 Errors:".to_string());
            for error in &result.errors {
                lines.push(format!("  - [{}] {}", error.field, error.message));
                if let (Some(expected), Some(actual)) = (&error.expected, &error.actual) {
                    lines.push(format!("    Expected: {}", expected));
                    lines.push(format!("    Actual: {}", actual));
                }
            }
        }

        if !result.warnings.is_empty() {
            lines.push("\n🟡 Warnings:".to_string());
            for warning in &result.warnings {
                lines.push(format!("  - [{}] {}", warning.field, warning.message));
                if let Some(suggestion) = &warning.suggestion {
                    lines.push(format!("    Suggestion: {}", suggestion));
                }
            }
        }

        lines.join("\n")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_load_env_config() {
        let mut env = HashMap::new();
        env.insert("PUBLISH_REGISTRY".to_string(), "npm".to_string());
        env.insert("PUBLISH_DRY_RUN".to_string(), "always".to_string());
        env.insert("PUBLISH_NON_INTERACTIVE".to_string(), "true".to_string());

        let config = ConfigLoader::load_env_config(&env).unwrap();

        assert_eq!(
            config
                .project
                .as_ref()
                .unwrap()
                .default_registry
                .as_ref()
                .unwrap(),
            "npm"
        );
        assert_eq!(
            config.publish.as_ref().unwrap().dry_run,
            Some(DryRunMode::Always)
        );
        assert_eq!(config.publish.as_ref().unwrap().interactive, Some(false));
    }

    #[test]
    fn test_expand_string() {
        let mut env = HashMap::new();
        env.insert("NPM_TOKEN".to_string(), "secret123".to_string());

        let input = "https://registry.npmjs.org/:_authToken=${NPM_TOKEN}";
        let result = ConfigLoader::expand_string(input, &env, &None, &[]).unwrap();

        assert_eq!(result, "https://registry.npmjs.org/:_authToken=secret123");
    }

    #[test]
    fn test_expand_string_with_allowed_prefixes() {
        let mut env = HashMap::new();
        env.insert("NPM_TOKEN".to_string(), "secret123".to_string());
        env.insert("SECRET_KEY".to_string(), "forbidden".to_string());

        let allowed_prefixes = Some(vec!["NPM_".to_string()]);

        let input = "${NPM_TOKEN}-${SECRET_KEY}";
        let result = ConfigLoader::expand_string(input, &env, &allowed_prefixes, &[]).unwrap();

        // NPM_TOKEN should be expanded, SECRET_KEY should not
        assert_eq!(result, "secret123-${SECRET_KEY}");
    }

    #[test]
    fn test_validate_version_required() {
        let mut config = PublishConfig::default();
        config.version = "".to_string();

        let result = ConfigLoader::validate(&config);

        assert!(!result.valid);
        assert_eq!(result.errors.len(), 1);
        assert_eq!(result.errors[0].field, "version");
    }

    #[test]
    fn test_validate_unknown_version_warning() {
        let mut config = PublishConfig::default();
        config.version = "2.0".to_string();

        let result = ConfigLoader::validate(&config);

        assert!(result.valid);
        assert_eq!(result.warnings.len(), 1);
        assert_eq!(result.warnings[0].field, "version");
    }

    #[test]
    fn test_merge_configs() {
        let config1 = PublishConfig {
            version: "1.0".to_string(),
            registries: RegistryConfigs {
                npm: Some(NPMRegistryConfig {
                    enabled: Some(true),
                    tag: Some("latest".to_string()),
                    access: None,
                    otp: None,
                }),
                ..Default::default()
            },
            ..Default::default()
        };

        let config2 = PublishConfig {
            version: "1.0".to_string(),
            registries: RegistryConfigs {
                npm: Some(NPMRegistryConfig {
                    enabled: Some(true),
                    tag: Some("beta".to_string()), // Override
                    access: Some(NPMAccess::Public),
                    otp: None,
                }),
                ..Default::default()
            },
            ..Default::default()
        };

        let merged = ConfigLoader::merge_configs(vec![config1, config2]);

        assert_eq!(
            merged
                .registries
                .npm
                .as_ref()
                .unwrap()
                .tag
                .as_ref()
                .unwrap(),
            "beta"
        );
        assert_eq!(
            merged.registries.npm.as_ref().unwrap().access,
            Some(NPMAccess::Public)
        );
    }

    #[test]
    fn test_format_validation_result() {
        let result = ConfigValidationResult {
            valid: false,
            errors: vec![ConfigValidationError {
                field: "version".to_string(),
                message: "Version is required".to_string(),
                expected: Some("string".to_string()),
                actual: Some("empty".to_string()),
            }],
            warnings: vec![ConfigValidationWarning {
                field: "registries.npm".to_string(),
                message: "npm configuration is recommended".to_string(),
                suggestion: Some("Add npm registry config".to_string()),
            }],
        };

        let formatted = ConfigLoader::format_validation_result(&result);

        assert!(formatted.contains("❌ Configuration has errors"));
        assert!(formatted.contains("🔴 Errors:"));
        assert!(formatted.contains("[version]"));
        assert!(formatted.contains("🟡 Warnings:"));
        assert!(formatted.contains("[registries.npm]"));
    }
}
