/**
 * package-publisher - Multi-registry package publishing assistant
 * @packageDocumentation
 */

// Core exports
export { PackagePublisher } from './core/PackagePublisher'
export { BatchPublisher } from './core/BatchPublisher'
export { PublishStateMachine } from './core/PublishStateMachine'
export { ErrorFactory, PublishError, ErrorCodes } from './core/ErrorHandling'
export { RetryManager } from './core/RetryManager'

// Plugins
export { NPMPlugin } from './plugins/NPMPlugin'
export { CratesIOPlugin } from './plugins/CratesIOPlugin'
export { PyPIPlugin } from './plugins/PyPIPlugin'
export { HomebrewPlugin } from './plugins/HomebrewPlugin'

// Security
export { SecureTokenManager } from './security/SecureTokenManager'
export { SecretsScanner } from './security/SecretsScanner'
export { SafeCommandExecutor } from './security/SafeCommandExecutor'

// Interfaces (type-only exports)
export type {
  RegistryPlugin,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  DryRunResult,
  PublishOptions,
  PublishResult,
  VerificationResult,
  RollbackResult,
  ScanReport,
  SecretFinding,
  SecretPattern,
  ExecResult,
  ExecOptions,
  PublishState,
  StateTransition,
  PublishStateData,
  RetryOptions,
  PublishReport,
  PackageMetadata,
  BatchPublishOptions,
  BatchPublishResult
} from './core/interfaces'
