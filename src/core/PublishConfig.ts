/**
 * Configuration file support for package-publisher
 *
 * @file PublishConfig.ts
 * @description Type definitions and utilities for .publish-config.yaml
 */

/**
 * Root configuration object
 */
export interface PublishConfig {
  /**
   * Schema version (required)
   */
  version: string

  /**
   * Extend from base configuration file (optional)
   */
  extends?: string

  /**
   * Variable definitions (optional)
   */
  variables?: Record<string, string>

  /**
   * Project basic information (optional, auto-detection available)
   */
  project?: ProjectConfig

  /**
   * Registry-specific configurations (required)
   */
  registries: RegistryConfigs

  /**
   * Security settings (optional)
   */
  security?: SecurityConfig

  /**
   * Pre/Post-publish hooks (optional)
   */
  hooks?: HooksConfig

  /**
   * Publish options (optional)
   */
  publish?: PublishOptionsConfig

  /**
   * Validation rules (optional)
   */
  validation?: ValidationConfig

  /**
   * Notification settings (optional, Phase 4-4)
   */
  notifications?: NotificationsConfig

  /**
   * Plugin configurations (optional, Phase 4-5)
   */
  plugins?: PluginConfig[]
}

/**
 * Project basic information
 */
export interface ProjectConfig {
  /**
   * Package name (optional, auto-detection from package.json/Cargo.toml etc.)
   */
  name?: string

  /**
   * Default registry to publish (optional, auto-detect if not specified)
   */
  defaultRegistry?: string
}

/**
 * Registry configurations
 */
export interface RegistryConfigs {
  /**
   * npm registry configuration
   */
  npm?: NPMRegistryConfig

  /**
   * crates.io registry configuration
   */
  crates?: CratesRegistryConfig

  /**
   * PyPI registry configuration
   */
  pypi?: PyPIRegistryConfig

  /**
   * Homebrew registry configuration
   */
  homebrew?: HomebrewRegistryConfig

  /**
   * Custom registries (generic schema)
   */
  custom?: Record<string, CustomRegistryConfig>
}

/**
 * Base registry configuration
 */
export interface BaseRegistryConfig {
  /**
   * Enable this registry (default: true if defined)
   */
  enabled?: boolean
}

/**
 * npm registry configuration
 */
export interface NPMRegistryConfig extends BaseRegistryConfig {
  /**
   * npm dist-tag (default: "latest")
   */
  tag?: string

  /**
   * Package access level (default: "public")
   */
  access?: 'public' | 'restricted'

  /**
   * One-time password (2FA) configuration
   */
  otp?: OTPConfig
}

/**
 * OTP (2FA) configuration
 */
export interface OTPConfig {
  /**
   * Is OTP required? (default: false)
   */
  required?: boolean

  /**
   * When to prompt for OTP (required if otp.required=true)
   */
  prompt?: 'runtime'
}

/**
 * crates.io registry configuration
 */
export interface CratesRegistryConfig extends BaseRegistryConfig {
  /**
   * Cargo features to enable
   */
  features?: string[]
}

/**
 * PyPI registry configuration
 */
export interface PyPIRegistryConfig extends BaseRegistryConfig {
  /**
   * Repository name (default: "pypi")
   */
  repository?: 'pypi' | 'testpypi'
}

/**
 * Homebrew registry configuration
 */
export interface HomebrewRegistryConfig extends BaseRegistryConfig {
  /**
   * Custom tap name (default: auto-detect)
   */
  tap?: string
}

/**
 * Custom registry configuration (generic schema)
 */
export interface CustomRegistryConfig extends BaseRegistryConfig {
  /**
   * Plugin type
   */
  type: string

  /**
   * Plugin-specific configuration
   */
  config: Record<string, any>

  /**
   * Publish command template (optional)
   */
  publishCommand?: string

  /**
   * Verify command template (optional)
   */
  verifyCommand?: string
}

/**
 * Security configuration
 */
export interface SecurityConfig {
  /**
   * Environment variable expansion settings
   */
  envVarExpansion?: EnvVarExpansionConfig

  /**
   * Secrets scanning settings
   */
  secretsScanning?: SecretsScanningConfig

  /**
   * Allowed commands settings
   */
  allowedCommands?: AllowedCommandsConfig
}

/**
 * Environment variable expansion configuration
 */
export interface EnvVarExpansionConfig {
  /**
   * Enable environment variable expansion (default: true)
   */
  enabled?: boolean

  /**
   * Allowed environment variable prefixes (default: all)
   */
  allowedPrefixes?: string[]

  /**
   * Forbidden patterns (regex) for environment variable names
   */
  forbiddenPatterns?: string[]
}

/**
 * Secrets scanning configuration
 */
export interface SecretsScanningConfig {
  /**
   * Enable secrets scanning (default: true)
   */
  enabled?: boolean

  /**
   * Patterns to ignore during scanning
   */
  ignorePatterns?: IgnorePattern[]

  /**
   * Reject path traversal attempts (default: true)
   */
  rejectTraversal?: boolean
}

/**
 * Ignore pattern for secrets scanning
 */
export interface IgnorePattern {
  /**
   * Pattern to match (glob pattern)
   */
  pattern: string

  /**
   * Path prefix to restrict (prevent path traversal)
   */
  pathPrefix: string
}

/**
 * Allowed commands configuration
 */
export interface AllowedCommandsConfig {
  /**
   * npm command configuration
   */
  npm?: AllowedCommandConfig

  /**
   * cargo command configuration
   */
  cargo?: AllowedCommandConfig

  /**
   * python command configuration
   */
  python?: AllowedCommandConfig

  /**
   * twine command configuration
   */
  twine?: AllowedCommandConfig

  /**
   * brew command configuration
   */
  brew?: AllowedCommandConfig

  /**
   * git command configuration
   */
  git?: AllowedCommandConfig

  /**
   * Custom commands
   */
  [key: string]: AllowedCommandConfig | undefined
}

/**
 * Allowed command configuration
 */
export interface AllowedCommandConfig {
  /**
   * Full path to executable (required)
   */
  executable: string

  /**
   * Allowed arguments (whitelist)
   */
  allowedArgs: string[]

  /**
   * Forbidden arguments (blacklist, optional)
   */
  forbiddenArgs?: string[]
}

/**
 * Hooks configuration
 */
export interface HooksConfig {
  /**
   * Pre-build hooks
   */
  preBuild?: HookCommand[]

  /**
   * Pre-publish hooks
   */
  prePublish?: HookCommand[]

  /**
   * Post-publish hooks
   */
  postPublish?: HookCommand[]

  /**
   * Error handling hooks
   */
  onError?: HookCommand[]
}

/**
 * Hook command configuration
 */
export interface HookCommand {
  /**
   * Command to execute
   */
  command: string

  /**
   * Allowed commands for this hook (required)
   */
  allowedCommands: string[]

  /**
   * Timeout in seconds (default: 300)
   */
  timeout?: number

  /**
   * Working directory (default: "./")
   */
  workingDirectory?: string
}

/**
 * Publish options configuration
 */
export interface PublishOptionsConfig {
  /**
   * Dry-run behavior (default: "first")
   */
  dryRun?: 'first' | 'always' | 'never'

  /**
   * Confirm before publish (default: true in interactive mode)
   */
  confirm?: boolean

  /**
   * Verify after publish (default: true)
   */
  verify?: boolean

  /**
   * Interactive mode (default: true)
   */
  interactive?: boolean
}

/**
 * Validation configuration
 */
export interface ValidationConfig {
  /**
   * Custom validation rules
   */
  rules?: ValidationRule[]
}

/**
 * Validation rule
 */
export interface ValidationRule {
  /**
   * Rule name
   */
  name: string

  /**
   * Pattern to match (regex)
   */
  pattern?: string

  /**
   * Condition expression
   */
  condition?: string

  /**
   * Field to validate
   */
  field: string

  /**
   * Severity level (default: "error")
   */
  severity?: 'error' | 'warning'

  /**
   * Error message to display
   */
  errorMessage: string
}

/**
 * Notifications configuration (Phase 4-4)
 */
export interface NotificationsConfig {
  /**
   * Enable notifications (default: false)
   */
  enabled?: boolean

  /**
   * Slack notification settings
   */
  slack?: SlackNotificationConfig

  /**
   * Email notification settings
   */
  email?: EmailNotificationConfig
}

/**
 * Slack notification configuration
 */
export interface SlackNotificationConfig {
  /**
   * Slack webhook URL (environment variable expansion supported)
   */
  webhookUrl: string
}

/**
 * Email notification configuration
 */
export interface EmailNotificationConfig {
  /**
   * Email recipients
   */
  recipients: string[]
}

/**
 * Plugin configuration (Phase 4-5)
 */
export interface PluginConfig {
  /**
   * Plugin name (npm package or local path)
   */
  name: string

  /**
   * Plugin version (npm package version)
   */
  version?: string

  /**
   * Plugin-specific configuration
   */
  config: Record<string, any>
}

/**
 * Configuration load options
 */
export interface ConfigLoadOptions {
  /**
   * Project path to load config from
   */
  projectPath: string

  /**
   * CLI arguments (highest priority)
   */
  cliArgs?: Partial<PublishConfig>

  /**
   * Environment variables
   */
  env?: Record<string, string>
}

/**
 * Configuration merge priority
 * 1. CLI arguments (highest)
 * 2. Environment variables
 * 3. Project config (./.publish-config.yaml)
 * 4. Global config (~/.publish-config.yaml)
 * 5. Default values (lowest)
 */
export type ConfigPriority =
  | 'cli'
  | 'env'
  | 'project'
  | 'global'
  | 'default'

/**
 * Configuration validation result
 */
export interface ConfigValidationResult {
  /**
   * Is configuration valid?
   */
  valid: boolean

  /**
   * Validation errors
   */
  errors: ConfigValidationError[]

  /**
   * Validation warnings
   */
  warnings: ConfigValidationWarning[]
}

/**
 * Configuration validation error
 */
export interface ConfigValidationError {
  /**
   * Field path (e.g., "registries.npm.tag")
   */
  field: string

  /**
   * Error message
   */
  message: string

  /**
   * Expected type/value
   */
  expected?: string

  /**
   * Actual type/value
   */
  actual?: string
}

/**
 * Configuration validation warning
 */
export interface ConfigValidationWarning {
  /**
   * Field path
   */
  field: string

  /**
   * Warning message
   */
  message: string

  /**
   * Suggestion
   */
  suggestion?: string
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Partial<PublishConfig> = {
  version: '1.0',
  publish: {
    dryRun: 'first',
    confirm: true,
    verify: true,
    interactive: true
  },
  security: {
    envVarExpansion: {
      enabled: true
    },
    secretsScanning: {
      enabled: true,
      rejectTraversal: true
    }
  }
}
