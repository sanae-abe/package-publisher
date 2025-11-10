/**
 * Core interfaces for package-publisher
 */

// ============================================================================
// Registry Plugin Interface
// ============================================================================

export interface RegistryPlugin {
  readonly name: string
  readonly version: string

  /**
   * Detect if this registry is applicable for the given project
   */
  detect(projectPath: string): Promise<boolean>

  /**
   * Validate package metadata and readiness for publishing
   */
  validate(): Promise<ValidationResult>

  /**
   * Perform a dry-run of the publishing process
   */
  dryRun(): Promise<DryRunResult>

  /**
   * Publish the package to the registry
   */
  publish(options?: PublishOptions): Promise<PublishResult>

  /**
   * Verify that the package was published successfully
   */
  verify(): Promise<VerificationResult>

  /**
   * Rollback a published version (if supported)
   */
  rollback?(version: string): Promise<RollbackResult>
}

// ============================================================================
// Validation
// ============================================================================

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
  warnings: ValidationWarning[]
  metadata?: Record<string, unknown>
}

export interface ValidationError {
  field: string
  message: string
  severity: 'error'
}

export interface ValidationWarning {
  field: string
  message: string
  severity: 'warning'
}

// ============================================================================
// Dry Run
// ============================================================================

export interface DryRunResult {
  success: boolean
  output: string
  estimatedSize?: string
  errors?: ValidationError[]
}

// ============================================================================
// Publishing
// ============================================================================

export interface PublishOptions {
  dryRun?: boolean
  nonInteractive?: boolean
  otp?: string // 2FA one-time password
  tag?: string // npm: dist-tag, cargo: --tag
  access?: 'public' | 'restricted' // npm scoped packages
  resume?: boolean
  registry?: string
  skipHooks?: boolean // Skip all hook execution
  hooksOnly?: boolean // Execute hooks only (dry-run for hooks)
  [key: string]: boolean | string | undefined // Plugin-specific options
}

export interface PublishResult {
  success: boolean
  version?: string
  packageUrl?: string
  output?: string
  error?: string
  metadata?: Record<string, unknown>
}

// ============================================================================
// Verification
// ============================================================================

export interface VerificationResult {
  verified: boolean
  version?: string
  url?: string
  error?: string
  metadata?: Record<string, unknown>
}

// ============================================================================
// Rollback
// ============================================================================

export interface RollbackResult {
  success: boolean
  message: string
  error?: string
}

// ============================================================================
// Security
// ============================================================================

export interface ScanReport {
  hasSecrets: boolean
  findings: SecretFinding[]
  scannedFiles: number
  skippedFiles: string[]
}

export interface SecretFinding {
  file: string
  line: number
  type: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  matched: string // Masked version of the match
}

export interface SecretPattern {
  name: string
  regex: RegExp
  severity: 'critical' | 'high' | 'medium' | 'low'
}

// ============================================================================
// Command Execution
// ============================================================================

export interface ExecResult {
  stdout: string
  stderr: string
  exitCode: number
}

export interface ExecOptions {
  cwd?: string
  env?: Record<string, string>
  timeout?: number
  silent?: boolean
}

// ============================================================================
// State Management
// ============================================================================

export type PublishState =
  | 'INITIAL'
  | 'DETECTING'
  | 'VALIDATING'
  | 'DRY_RUN'
  | 'CONFIRMING'
  | 'PUBLISHING'
  | 'VERIFYING'
  | 'SUCCESS'
  | 'FAILED'
  | 'ROLLED_BACK'

export interface StateTransition {
  from: PublishState
  to: PublishState
  timestamp: Date
  metadata?: Record<string, unknown>
}

export interface PublishStateData {
  currentState: PublishState
  registry?: string
  version?: string
  transitions: StateTransition[]
  canResume: boolean
  error?: string
}

// ============================================================================
// Retry Logic
// ============================================================================

export interface RetryOptions {
  maxAttempts?: number
  initialDelay?: number
  maxDelay?: number
  backoffMultiplier?: number
  retryableErrors?: RegExp[]
  onRetry?: (attempt: number, error: Error) => Promise<void>
}

// ============================================================================
// Publishing Report
// ============================================================================

export interface PublishReport {
  success: boolean
  registry: string
  packageName: string
  version: string
  publishedAt?: Date
  verificationUrl?: string
  errors: string[]
  warnings: string[]
  duration: number
  state: PublishState
}

// ============================================================================
// Package Metadata (Registry-agnostic)
// ============================================================================

export interface PackageMetadata {
  name: string
  version: string
  description?: string
  license?: string
  authors?: string[]
  repository?: string
  homepage?: string
  keywords?: string[]
  [key: string]: unknown // Registry-specific fields
}

// ============================================================================
// Batch Publishing
// ============================================================================

export interface BatchPublishOptions {
  /** Execute publishes sequentially instead of in parallel (default: false) */
  sequential?: boolean

  /** Continue publishing to remaining registries even if one fails (default: false) */
  continueOnError?: boolean

  /** Maximum number of concurrent publishes (default: 3, only applies when sequential=false) */
  maxConcurrency?: number

  /** Individual publish options to apply to all registries */
  publishOptions?: PublishOptions
}

export interface BatchPublishResult {
  /** Registries that were successfully published to */
  succeeded: string[]

  /** Registries that failed to publish, with their errors */
  failed: Map<string, Error>

  /** Registries that were skipped due to earlier failures */
  skipped: string[]

  /** Overall success status (true if all succeeded) */
  success: boolean

  /** Detailed results for each registry */
  results: Map<string, PublishReport>
}

// ============================================================================
// Hooks System
// ============================================================================

export type HookPhase = 'preBuild' | 'prePublish' | 'postPublish' | 'onError'

export interface HookContext {
  phase: HookPhase
  registry: string
  version: string
  packageName: string
  environment: Record<string, string>
}

export interface HookExecutionResult {
  success: boolean
  executedHooks: number
  failedHooks: string[]
  outputs: HookOutput[]
}

export interface HookOutput {
  command: string
  stdout: string
  stderr: string
  exitCode: number
  duration: number
}

// ============================================================================
// Analytics & Reporting
// ============================================================================

export interface PublishStatistics {
  /** Total number of publish attempts */
  totalAttempts: number

  /** Number of successful publishes */
  successCount: number

  /** Number of failed publishes */
  failureCount: number

  /** Success rate (0-100) */
  successRate: number

  /** Average publish duration in milliseconds */
  averageDuration: number

  /** Registry-specific statistics */
  byRegistry: Map<string, RegistryStatistics>

  /** Time range of the statistics */
  timeRange: {
    start: Date
    end: Date
  }
}

export interface RegistryStatistics {
  registry: string
  attempts: number
  successes: number
  failures: number
  successRate: number
  averageDuration: number
  lastPublish?: Date
  lastVersion?: string
}

export interface AnalyticsRecord {
  /** Unique identifier for this publish record */
  id: string

  /** Registry name */
  registry: string

  /** Package name */
  packageName: string

  /** Published version */
  version: string

  /** Whether the publish succeeded */
  success: boolean

  /** Error message if failed */
  error?: string

  /** Duration in milliseconds */
  duration: number

  /** Timestamp of the publish */
  timestamp: Date

  /** Additional metadata */
  metadata?: Record<string, unknown>
}

export interface AnalyticsOptions {
  /** Filter by registry */
  registry?: string

  /** Filter by package name */
  packageName?: string

  /** Start date for time range */
  startDate?: Date

  /** End date for time range */
  endDate?: Date

  /** Maximum number of records to retrieve */
  limit?: number

  /** Include only successful publishes */
  successOnly?: boolean

  /** Include only failed publishes */
  failuresOnly?: boolean
}

export interface AnalyticsReport {
  /** Generated report title */
  title: string

  /** Report generation timestamp */
  generatedAt: Date

  /** Overall statistics */
  statistics: PublishStatistics

  /** Recent publish records */
  recentPublishes: AnalyticsRecord[]

  /** Markdown-formatted summary */
  markdownSummary: string

  /** JSON export of all data */
  jsonData: string
}

// ============================================================================
// Notifications
// ============================================================================

export type NotificationEventType = 'success' | 'failure' | 'warning'

export interface PublishEvent {
  /** Event type */
  type: NotificationEventType

  /** Registry name */
  registry: string

  /** Package name */
  packageName: string

  /** Package version */
  version: string

  /** Event message */
  message: string

  /** Event timestamp */
  timestamp: Date

  /** Error details (if type is 'failure') */
  error?: string

  /** Additional metadata */
  metadata?: Record<string, unknown>
}

export interface NotificationResult {
  /** Whether the notification was sent successfully */
  success: boolean

  /** Notification channel (e.g., 'slack', 'email') */
  channel: string

  /** Error message if failed */
  error?: string

  /** Timestamp when notification was sent */
  sentAt: Date
}

export interface Notifier {
  /** Notifier name */
  readonly name: string

  /** Send a notification */
  notify(event: PublishEvent): Promise<NotificationResult>
}

// ============================================================================
// Plugin System
// ============================================================================

/**
 * External plugin interface for custom registry support
 * This is a simplified interface for dynamically loaded plugins
 */
export interface PublishPlugin {
  /** Plugin name */
  readonly name: string

  /** Plugin version (semver) */
  readonly version: string

  /**
   * Initialize the plugin with configuration
   * Called once when the plugin is loaded
   */
  initialize(config: PluginInitConfig): Promise<void>

  /**
   * Check if this plugin supports the given project
   * @param projectPath Path to the project directory
   */
  supports(projectPath: string): Promise<boolean>

  /**
   * Publish the package using this plugin
   * @param options Plugin-specific publish options
   */
  publish(options: PluginPublishOptions): Promise<PublishResult>

  /**
   * Verify that the package was published successfully (optional)
   * @param options Plugin-specific verify options
   */
  verify?(options: PluginVerifyOptions): Promise<VerificationResult>
}

/**
 * Plugin initialization configuration
 */
export interface PluginInitConfig {
  /** Project path */
  projectPath: string

  /** Plugin-specific configuration from config file */
  pluginConfig: Record<string, unknown>

  /** Logger function for plugin output */
  logger?: (message: string) => void
}

/**
 * Plugin-specific publish options
 */
export interface PluginPublishOptions {
  /** Project path */
  projectPath: string

  /** Package metadata */
  packageMetadata: PackageMetadata

  /** Standard publish options */
  publishOptions?: PublishOptions

  /** Plugin-specific options */
  pluginOptions?: Record<string, unknown>
}

/**
 * Plugin-specific verify options
 */
export interface PluginVerifyOptions {
  /** Project path */
  projectPath: string

  /** Package name to verify */
  packageName: string

  /** Version to verify */
  version: string

  /** Expected package URL */
  expectedUrl?: string

  /** Plugin-specific options */
  pluginOptions?: Record<string, unknown>
}

/**
 * Plugin metadata for discovery and management
 */
export interface PluginMetadata {
  /** Plugin name */
  name: string

  /** Plugin version */
  version: string

  /** Plugin description */
  description?: string

  /** Plugin author */
  author?: string

  /** Supported registry name */
  registry: string

  /** Plugin homepage/repository */
  homepage?: string

  /** Minimum package-publisher version required */
  requiresVersion?: string
}
