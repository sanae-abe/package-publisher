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
import fetch from 'node-fetch'

interface PackageJson {
  name?: string
  version?: string
  description?: string
  license?: string
  main?: string
  types?: string
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  [key: string]: any
}

export class NPMPlugin implements RegistryPlugin {
  readonly name = 'npm'
  readonly version = '1.0.0'

  private packageJsonPath: string
  private packageJson?: PackageJson
  private executor: SafeCommandExecutor
  private retryManager: RetryManager

  constructor(
    private projectPath: string,
    executor?: SafeCommandExecutor
  ) {
    this.packageJsonPath = path.join(projectPath, 'package.json')
    this.executor = executor || new SafeCommandExecutor()
    this.retryManager = new RetryManager()
  }

  async detect(projectPath: string): Promise<boolean> {
    try {
      await fs.access(path.join(projectPath, 'package.json'), fs.constants.R_OK)
      return true
    } catch {
      return false
    }
  }

  async validate(): Promise<ValidationResult> {
    const errors: ValidationError[] = []
    const warnings: ValidationWarning[] = []

    try {
      // Read package.json
      const content = await fs.readFile(this.packageJsonPath, 'utf-8')
      this.packageJson = JSON.parse(content)

      // Validate required fields
      const requiredFields: (keyof PackageJson)[] = ['name', 'version']
      for (const field of requiredFields) {
        if (!this.packageJson[field]) {
          errors.push({
            field,
            message: `${field}は必須フィールドです`,
            severity: 'error'
          })
        }
      }

      // Validate package name (npm naming rules)
      if (this.packageJson.name) {
        const nameErrors = this.validatePackageName(this.packageJson.name)
        errors.push(...nameErrors)
      }

      // Validate version (SemVer)
      if (this.packageJson.version) {
        if (!this.isValidSemVer(this.packageJson.version)) {
          errors.push({
            field: 'version',
            message: `無効なSemVer形式: ${this.packageJson.version}`,
            severity: 'error'
          })
        }
      }

      // Validate license
      if (!this.packageJson.license) {
        warnings.push({
          field: 'license',
          message: 'ライセンスフィールドの指定を推奨します',
          severity: 'warning'
        })
      }

      // Check for npm audit vulnerabilities
      try {
        const auditResult = await this.executor.execSafe('npm', ['audit', '--json'], {
          cwd: this.projectPath,
          silent: true
        })

        if (auditResult.exitCode !== 0) {
          const auditData = JSON.parse(auditResult.stdout)
          if (auditData.vulnerabilities) {
            const vulnCount = Object.keys(auditData.vulnerabilities).length
            if (vulnCount > 0) {
              warnings.push({
                field: 'dependencies',
                message: `${vulnCount}件の脆弱性が検出されました。npm audit fixで修正を推奨します`,
                severity: 'warning'
              })
            }
          }
        }
      } catch (error) {
        // npm audit failed, but not critical for validation
        warnings.push({
          field: 'dependencies',
          message: 'npm auditの実行に失敗しました',
          severity: 'warning'
        })
      }

      // Run build script if exists
      if (this.packageJson.scripts?.build) {
        try {
          await this.executor.execSafe('npm', ['run', 'build'], {
            cwd: this.projectPath
          })
        } catch (error) {
          errors.push({
            field: 'scripts.build',
            message: `ビルドスクリプトの実行に失敗: ${(error as Error).message}`,
            severity: 'error'
          })
        }
      }

      // Run test script if exists
      if (this.packageJson.scripts?.test) {
        try {
          await this.executor.execSafe('npm', ['test'], {
            cwd: this.projectPath
          })
        } catch (error) {
          errors.push({
            field: 'scripts.test',
            message: `テストの実行に失敗: ${(error as Error).message}`,
            severity: 'error'
          })
        }
      }

      // Run lint script if exists
      if (this.packageJson.scripts?.lint) {
        try {
          await this.executor.execSafe('npm', ['run', 'lint'], {
            cwd: this.projectPath
          })
        } catch (error) {
          warnings.push({
            field: 'scripts.lint',
            message: `Lintエラーが検出されました: ${(error as Error).message}`,
            severity: 'warning'
          })
        }
      } else {
        warnings.push({
          field: 'scripts.lint',
          message: 'lintスクリプトの設定を推奨します',
          severity: 'warning'
        })
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        metadata: {
          packageName: this.packageJson.name,
          version: this.packageJson.version
        }
      }
    } catch (error) {
      throw ErrorFactory.create(
        'VALIDATION_FAILED',
        this.name,
        `package.jsonの検証に失敗: ${(error as Error).message}`
      )
    }
  }

  async dryRun(): Promise<DryRunResult> {
    try {
      const result = await this.executor.execSafe(
        'npm',
        ['publish', '--dry-run'],
        { cwd: this.projectPath }
      )

      // Parse output for package size estimation
      const output = result.stdout + result.stderr
      const sizeMatch = output.match(/package size:\s*(\S+)/)
      const estimatedSize = sizeMatch ? sizeMatch[1] : undefined

      return {
        success: true,
        output,
        estimatedSize
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
    const { otp, tag, access } = options

    try {
      await this.loadPackageJson()

      const args = ['publish']

      // OTP指定（2FA対応）
      if (otp) {
        args.push('--otp', otp)
      }

      // アクセス制御（スコープ付きパッケージの場合）
      if (access && this.isScopedPackage(this.packageJson?.name)) {
        args.push('--access', access)
      }

      // タグ指定（デフォルトはlatest）
      if (tag) {
        args.push('--tag', tag)
      }

      // Retry logic with OTP detection
      const result = await this.retryManager.retry(
        async () => {
          return await this.executor.execSafe('npm', args, {
            cwd: this.projectPath
          })
        },
        {
          maxAttempts: 3,
          onRetry: async (attempt, error) => {
            // OTP required detection
            if (
              error.message?.includes('OTP') ||
              error.message?.includes('two-factor')
            ) {
              throw ErrorFactory.create(
                'OTP_REQUIRED',
                this.name,
                '2要素認証が必要です。--otpオプションでワンタイムパスワードを指定してください'
              )
            }
          }
        }
      )

      const packageUrl = `https://www.npmjs.com/package/${this.packageJson?.name}`

      return {
        success: true,
        version: this.packageJson?.version,
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
      await this.loadPackageJson()

      const packageName = this.packageJson?.name
      const expectedVersion = this.packageJson?.version

      // Verify on npmjs.com
      const response = await fetch(`https://registry.npmjs.org/${packageName}`)

      if (!response.ok) {
        return {
          verified: false,
          error: `パッケージ ${packageName} が npmjs.com で見つかりません（HTTP ${response.status}）`
        }
      }

      const data: any = await response.json()

      // Check if the expected version exists
      if (!data.versions || !data.versions[expectedVersion!]) {
        return {
          verified: false,
          error: `バージョン ${expectedVersion} が npmjs.com で見つかりません。利用可能なバージョン: ${Object.keys(data.versions || {}).join(', ')}`
        }
      }

      // Check latest version
      const latestVersion = data['dist-tags']?.latest

      return {
        verified: true,
        version: expectedVersion,
        url: `https://www.npmjs.com/package/${packageName}`,
        metadata: {
          latestVersion,
          allVersions: Object.keys(data.versions || {})
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
      await this.loadPackageJson()

      const packageName = this.packageJson?.name
      const fullName = `${packageName}@${version}`

      // Check if version was published within 72 hours
      const publishTime = await this.getPublishTime(packageName!, version)

      if (publishTime) {
        const hoursSincePublish = (Date.now() - publishTime.getTime()) / (1000 * 60 * 60)

        if (hoursSincePublish <= 72) {
          // Within 72 hours: use npm unpublish
          await this.executor.execSafe('npm', ['unpublish', fullName], {
            cwd: this.projectPath
          })

          return {
            success: true,
            message: `${fullName} を unpublish しました（公開から${Math.floor(hoursSincePublish)}時間以内）`
          }
        }
      }

      // After 72 hours or if publish time unknown: use npm deprecate
      const deprecateMessage = `This version has been deprecated. Please use a newer version.`
      await this.executor.execSafe(
        'npm',
        ['deprecate', fullName, deprecateMessage],
        { cwd: this.projectPath }
      )

      return {
        success: true,
        message: `${fullName} を非推奨に設定しました（unpublish は72時間以内のみ可能）`
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

  private async loadPackageJson(): Promise<void> {
    if (!this.packageJson) {
      const content = await fs.readFile(this.packageJsonPath, 'utf-8')
      this.packageJson = JSON.parse(content)
    }
  }

  private validatePackageName(name: string): ValidationError[] {
    const errors: ValidationError[] = []

    // npm naming rules
    // https://docs.npmjs.com/cli/v9/configuring-npm/package-json#name

    // Length check (including scope)
    if (name.length > 214) {
      errors.push({
        field: 'name',
        message: 'パッケージ名は214文字以内である必要があります',
        severity: 'error'
      })
    }

    // URL-safe characters only (excluding scoped package prefix)
    const nameWithoutScope = name.startsWith('@') ? name.split('/')[1] : name
    if (!/^[a-z0-9._-]+$/.test(nameWithoutScope)) {
      errors.push({
        field: 'name',
        message: 'パッケージ名は小文字英数字とハイフン、アンダースコア、ドットのみ使用可能です',
        severity: 'error'
      })
    }

    // Cannot start with . or _
    if (nameWithoutScope.startsWith('.') || nameWithoutScope.startsWith('_')) {
      errors.push({
        field: 'name',
        message: 'パッケージ名はドットまたはアンダースコアで始めることはできません',
        severity: 'error'
      })
    }

    // No uppercase letters
    if (/[A-Z]/.test(name)) {
      errors.push({
        field: 'name',
        message: 'パッケージ名に大文字を含めることはできません',
        severity: 'error'
      })
    }

    // No non-URL-safe characters
    if (!/^[@a-z0-9._/-]+$/.test(name)) {
      errors.push({
        field: 'name',
        message: 'パッケージ名はURL安全な文字のみ使用可能です',
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

  private isScopedPackage(name?: string): boolean {
    return !!name && name.startsWith('@')
  }

  private async getPublishTime(packageName: string, version: string): Promise<Date | null> {
    try {
      const response = await fetch(`https://registry.npmjs.org/${packageName}`)
      if (!response.ok) {
        return null
      }

      const data: any = await response.json()
      const timeStr = data.time?.[version]

      return timeStr ? new Date(timeStr) : null
    } catch {
      return null
    }
  }
}
