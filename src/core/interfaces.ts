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
  metadata?: Record<string, any>
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
  [key: string]: any // Plugin-specific options
}

export interface PublishResult {
  success: boolean
  version?: string
  packageUrl?: string
  output?: string
  error?: string
  metadata?: Record<string, any>
}

// ============================================================================
// Verification
// ============================================================================

export interface VerificationResult {
  verified: boolean
  version?: string
  url?: string
  error?: string
  metadata?: Record<string, any>
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
  metadata?: Record<string, any>
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
  [key: string]: any // Registry-specific fields
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
