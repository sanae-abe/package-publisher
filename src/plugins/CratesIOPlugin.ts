import {
  RegistryPlugin,
  ValidationResult,
  DryRunResult,
  PublishResult,
  VerificationResult,
  RollbackResult,
  ValidationError,
  ValidationWarning,
  PublishOptions
} from '../core/interfaces'
import { SafeCommandExecutor } from '../security/SafeCommandExecutor'
import { ErrorFactory } from '../core/ErrorHandling'
import { RetryManager } from '../core/RetryManager'
import * as fs from 'fs/promises'
import * as path from 'path'

// Use global fetch (available in Node.js 18+)
declare const fetch: typeof globalThis.fetch

interface CargoToml {
  package?: {
    name?: string
    version?: string
    authors?: string[]
    license?: string
    description?: string
    repository?: string
    homepage?: string
    keywords?: string[]
    categories?: string[]
    edition?: string
    [key: string]: unknown
  }
  dependencies?: Record<string, unknown>
  [key: string]: unknown
}

export class CratesIOPlugin implements RegistryPlugin {
  readonly name = 'crates.io'
  readonly version = '1.0.0'

  private cargoTomlPath: string
  private cargoToml?: CargoToml
  private executor: SafeCommandExecutor
  private retryManager: RetryManager

  constructor(
    private projectPath: string,
    executor?: SafeCommandExecutor
  ) {
    this.cargoTomlPath = path.join(projectPath, 'Cargo.toml')
    this.executor = executor || new SafeCommandExecutor()
    this.retryManager = new RetryManager()
  }

  async detect(projectPath: string): Promise<boolean> {
    try {
      await fs.access(path.join(projectPath, 'Cargo.toml'), fs.constants.R_OK)
      return true
    } catch {
      return false
    }
  }

  async validate(): Promise<ValidationResult> {
    const errors: ValidationError[] = []
    const warnings: ValidationWarning[] = []

    try {
      // Read Cargo.toml
      const content = await fs.readFile(this.cargoTomlPath, 'utf-8')
      this.cargoToml = this.parseToml(content)

      // Validate required fields
      const requiredFields: (keyof NonNullable<CargoToml['package']>)[] = ['name', 'version']
      for (const field of requiredFields) {
        if (!this.cargoToml?.package?.[field]) {
          errors.push({
            field: `package.${field as string}`,
            message: `${field}は必須フィールドです`,
            severity: 'error'
          })
        }
      }

      // Validate package name (crates.io naming rules)
      if (this.cargoToml?.package?.name) {
        const nameErrors = this.validatePackageName(this.cargoToml.package.name)
        errors.push(...nameErrors)
      }

      // Validate version (SemVer)
      if (this.cargoToml?.package?.version) {
        if (!this.isValidSemVer(this.cargoToml.package.version)) {
          errors.push({
            field: 'package.version',
            message: `無効なSemVer形式: ${this.cargoToml.package.version}`,
            severity: 'error'
          })
        }
      }

      // Validate license
      if (!this.cargoToml?.package?.license) {
        warnings.push({
          field: 'package.license',
          message: 'ライセンスフィールドの指定を推奨します',
          severity: 'warning'
        })
      }

      // Validate description
      if (!this.cargoToml?.package?.description) {
        warnings.push({
          field: 'package.description',
          message: 'descriptionフィールドの指定を推奨します',
          severity: 'warning'
        })
      }

      // Run cargo check
      try {
        await this.executor.execSafe('cargo', ['check'], {
          cwd: this.projectPath
        })
      } catch (error) {
        errors.push({
          field: 'cargo.check',
          message: `cargo checkに失敗: ${(error as Error).message}`,
          severity: 'error'
        })
      }

      // Note: cargo test can be time-consuming for large projects
      // For check command, we skip running tests and recommend manual testing
      warnings.push({
        field: 'cargo.test',
        message: 'テストは時間がかかるためスキップしました。手動で `cargo test` を実行してください。',
        severity: 'warning'
      })

      // Run cargo clippy if available
      try {
        await this.executor.execSafe('cargo', ['clippy', '--', '-D', 'warnings'], {
          cwd: this.projectPath
        })
      } catch (error) {
        warnings.push({
          field: 'cargo.clippy',
          message: `Clippy警告が検出されました: ${(error as Error).message}`,
          severity: 'warning'
        })
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        metadata: {
          packageName: this.cargoToml?.package?.name,
          version: this.cargoToml?.package?.version
        }
      }
    } catch (error) {
      throw ErrorFactory.create(
        'VALIDATION_FAILED',
        this.name,
        `Cargo.tomlの検証に失敗: ${(error as Error).message}`
      )
    }
  }

  async dryRun(): Promise<DryRunResult> {
    try {
      const result = await this.executor.execSafe(
        'cargo',
        ['publish', '--dry-run', '--allow-dirty'],
        { cwd: this.projectPath }
      )

      const output = result.stdout + result.stderr

      return {
        success: true,
        output
      }
    } catch (error) {
      return {
        success: false,
        output: (error as Error).message,
        errors: [
          {
            field: 'publish',
            message: `Dry-runに失敗: ${(error as Error).message}`,
            severity: 'error'
          }
        ]
      }
    }
  }

  async publish(options: PublishOptions = {}): Promise<PublishResult> {
    const { tag } = options

    try {
      await this.loadCargoToml()

      const args = ['publish', '--allow-dirty']

      // Tag specification (features in Cargo)
      if (tag && tag !== 'latest') {
        args.push('--features', tag)
      }

      // Retry logic
      const result = await this.retryManager.retry(
        async () => {
          return await this.executor.execSafe('cargo', args, {
            cwd: this.projectPath
          })
        },
        {
          maxAttempts: 3,
          onRetry: async (attempt, error) => {
            // Token verification
            if (error.message?.includes('authentication') || error.message?.includes('token')) {
              throw ErrorFactory.create(
                'AUTHENTICATION_FAILED',
                this.name,
                'crates.ioの認証に失敗しました。CARGO_REGISTRY_TOKENを確認してください'
              )
            }
          }
        }
      )

      const packageUrl = `https://crates.io/crates/${this.cargoToml!.package!.name}`

      return {
        success: true,
        version: this.cargoToml!.package!.version,
        packageUrl,
        output: result.stdout
      }
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message
      }
    }
  }

  async verify(): Promise<VerificationResult> {
    try {
      await this.loadCargoToml()

      const packageName = this.cargoToml!.package!.name
      const expectedVersion = this.cargoToml!.package!.version

      // Verify on crates.io API
      const response = await fetch(`https://crates.io/api/v1/crates/${packageName}`)

      if (!response.ok) {
        return {
          verified: false,
          error: `パッケージ ${packageName} が crates.io で見つかりません（HTTP ${response.status}）`
        }
      }

      const data = await response.json() as { versions?: Array<{ num: string }>; crate?: { newest_version?: string } }

      // Check if the expected version exists
      const versions = data.versions || []
      const versionExists = versions.some(v => v.num === expectedVersion)

      if (!versionExists) {
        const availableVersions: string = versions
          .map(v => String(v.num))
          .join(', ')
        return {
          verified: false,
          error: `バージョン ${expectedVersion} が crates.io で見つかりません。利用可能なバージョン: ${availableVersions}`
        }
      }

      // Get newest version
      const newestVersion = data.crate?.newest_version

      const allVersions: string[] = versions.map(v => String(v.num))

      return {
        verified: true,
        version: expectedVersion,
        url: `https://crates.io/crates/${packageName}`,
        metadata: {
          newestVersion,
          allVersions
        }
      }
    } catch (error) {
      return {
        verified: false,
        error: `検証に失敗: ${(error as Error).message}`
      }
    }
  }

  async rollback(version: string): Promise<RollbackResult> {
    try {
      await this.loadCargoToml()

      const packageName = this.cargoToml!.package!.name!

      // Use cargo yank to retract a version
      await this.executor.execSafe('cargo', ['yank', '--vers', version], {
        cwd: this.projectPath
      })

      return {
        success: true,
        message: `${packageName}@${version} をyankしました（crates.ioから非推奨に設定）`
      }
    } catch (error) {
      return {
        success: false,
        message: 'ロールバックに失敗',
        error: (error as Error).message
      }
    }
  }

  // Private helper methods

  private async loadCargoToml(): Promise<void> {
    if (!this.cargoToml) {
      const content = await fs.readFile(this.cargoTomlPath, 'utf-8')
      this.cargoToml = this.parseToml(content)
    }
  }

  private parseToml(content: string): CargoToml {
    // Simple TOML parser for Cargo.toml
    // In production, use a proper TOML library like @iarna/toml
    const toml: CargoToml = {}
    let currentSection: string | null = null

    const lines = content.split('\n')
    for (const line of lines) {
      const trimmed = line.trim()

      // Skip comments and empty lines
      if (trimmed.startsWith('#') || trimmed === '') {
        continue
      }

      // Section header
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        currentSection = trimmed.slice(1, -1)
        const keys = currentSection.split('.')
        let obj: Record<string, unknown> = toml
        for (let i = 0; i < keys.length; i++) {
          const key = keys[i]
          if (i === keys.length - 1) {
            obj[key] = {}
          } else {
            obj[key] = obj[key] || {}
          }
          obj = obj[key] as Record<string, unknown>
        }
        continue
      }

      // Key-value pair
      const match = trimmed.match(/^([a-zA-Z0-9_-]+)\s*=\s*(.+)$/)
      if (match && currentSection) {
        const [, key, value] = match
        const keys = currentSection.split('.')
        let obj: Record<string, unknown> = toml
        for (const k of keys) {
          obj = obj[k] as Record<string, unknown>
        }

        // Parse value
        let parsedValue: string | boolean | number = value.trim()
        if (parsedValue.startsWith('"') && parsedValue.endsWith('"')) {
          parsedValue = parsedValue.slice(1, -1)
        } else if (parsedValue === 'true') {
          parsedValue = true
        } else if (parsedValue === 'false') {
          parsedValue = false
        } else if (/^\d+$/.test(parsedValue)) {
          parsedValue = parseInt(parsedValue, 10)
        }

        obj[key] = parsedValue
      }
    }

    return toml
  }

  private validatePackageName(name: string): ValidationError[] {
    const errors: ValidationError[] = []

    // crates.io naming rules
    // https://doc.rust-lang.org/cargo/reference/manifest.html#the-name-field

    // Must be alphanumeric with dashes and underscores
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      errors.push({
        field: 'package.name',
        message: 'パッケージ名は英数字、ハイフン、アンダースコアのみ使用可能です',
        severity: 'error'
      })
    }

    // Cannot be empty
    if (name.length === 0) {
      errors.push({
        field: 'package.name',
        message: 'パッケージ名は空にできません',
        severity: 'error'
      })
    }

    return errors
  }

  private isValidSemVer(version: string): boolean {
    // SemVer regex: https://semver.org/
    const semverRegex =
      /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/
    return semverRegex.test(version)
  }
}
