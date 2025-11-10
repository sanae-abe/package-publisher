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

interface FormulaMetadata {
  name?: string
  version?: string
  url?: string
  sha256?: string
  homepage?: string
  description?: string
  license?: string
}

export class HomebrewPlugin implements RegistryPlugin {
  readonly name = 'homebrew'
  readonly version = '1.0.0'

  private formulaPath?: string
  private formulaMetadata?: FormulaMetadata
  private executor: SafeCommandExecutor
  private retryManager: RetryManager

  constructor(
    private projectPath: string,
    executor?: SafeCommandExecutor
  ) {
    this.executor = executor || new SafeCommandExecutor()
    this.retryManager = new RetryManager()
  }

  async detect(projectPath: string): Promise<boolean> {
    try {
      // Look for Formula directory or .rb formula files
      const formulaDir = path.join(projectPath, 'Formula')
      const hasFormulaDir = await fs
        .access(formulaDir, fs.constants.R_OK)
        .then(() => true)
        .catch(() => false)

      if (hasFormulaDir) {
        return true
      }

      // Check for .rb files in the root directory
      const files = await fs.readdir(projectPath)
      const hasFormulaFiles = files.some((file) => file.endsWith('.rb'))

      return hasFormulaFiles
    } catch {
      return false
    }
  }

  async validate(): Promise<ValidationResult> {
    const errors: ValidationError[] = []
    const warnings: ValidationWarning[] = []

    try {
      // Find formula file
      await this.findFormulaFile()

      if (!this.formulaPath) {
        errors.push({
          field: 'formula',
          message: 'Formulaファイル（.rb）が見つかりません',
          severity: 'error'
        })
        return { valid: false, errors, warnings }
      }

      // Load formula metadata
      await this.loadFormulaMetadata()

      // Validate required fields
      if (!this.formulaMetadata?.name) {
        errors.push({
          field: 'name',
          message: 'Formula名が見つかりません',
          severity: 'error'
        })
      }

      if (!this.formulaMetadata?.url) {
        errors.push({
          field: 'url',
          message: 'ソースURLが見つかりません',
          severity: 'error'
        })
      }

      if (!this.formulaMetadata?.sha256) {
        warnings.push({
          field: 'sha256',
          message: 'SHA256ハッシュの指定を推奨します',
          severity: 'warning'
        })
      }

      if (!this.formulaMetadata?.description) {
        warnings.push({
          field: 'desc',
          message: '説明（desc）の指定を推奨します',
          severity: 'warning'
        })
      }

      if (!this.formulaMetadata?.homepage) {
        warnings.push({
          field: 'homepage',
          message: 'ホームページURLの指定を推奨します',
          severity: 'warning'
        })
      }

      if (!this.formulaMetadata?.license) {
        warnings.push({
          field: 'license',
          message: 'ライセンスの指定を推奨します',
          severity: 'warning'
        })
      }

      // Run brew audit if formula exists
      try {
        await this.executor.execSafe('brew', ['audit', '--strict', this.formulaPath], {
          cwd: this.projectPath
        })
      } catch (error) {
        errors.push({
          field: 'brew.audit',
          message: `brew auditに失敗: ${(error as Error).message}`,
          severity: 'error'
        })
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        metadata: {
          packageName: this.formulaMetadata?.name,
          version: this.formulaMetadata?.version
        }
      }
    } catch (error) {
      throw ErrorFactory.create(
        'VALIDATION_FAILED',
        this.name,
        `Formulaの検証に失敗: ${(error as Error).message}`
      )
    }
  }

  async dryRun(): Promise<DryRunResult> {
    try {
      await this.findFormulaFile()

      if (!this.formulaPath) {
        return {
          success: false,
          output: 'Formulaファイルが見つかりません',
          errors: [
            {
              field: 'formula',
              message: 'Formulaファイル（.rb）が見つかりません',
              severity: 'error'
            }
          ]
        }
      }

      // Run brew audit (strict mode)
      const auditResult = await this.executor.execSafe(
        'brew',
        ['audit', '--strict', this.formulaPath],
        {
          cwd: this.projectPath
        }
      )

      // Try to install locally (test build)
      const installResult = await this.executor.execSafe(
        'brew',
        ['install', '--build-from-source', this.formulaPath],
        {
          cwd: this.projectPath
        }
      )

      const output = auditResult.stdout + '\n' + installResult.stdout

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
            field: 'install',
            message: `ローカルインストールテストに失敗: ${(error as Error).message}`,
            severity: 'error'
          }
        ]
      }
    }
  }

  async publish(options: PublishOptions = {}): Promise<PublishResult> {
    try {
      await this.findFormulaFile()
      await this.loadFormulaMetadata()

      if (!this.formulaPath) {
        return {
          success: false,
          error: 'Formulaファイルが見つかりません'
        }
      }

      // Homebrew publishing workflow:
      // 1. Commit formula to homebrew-<tap> repository
      // 2. Push to GitHub
      // 3. Create PR to homebrew/homebrew-core (for official taps)

      const tapName = options.tag || 'homebrew-tap'
      const formulaName = this.formulaMetadata?.name || 'unknown'

      // Check if we're in a Git repository
      try {
        await this.executor.execSafe('git', ['rev-parse', '--git-dir'], {
          cwd: this.projectPath
        })
      } catch {
        return {
          success: false,
          error: 'HomebrewのFormulaはGitリポジトリで管理する必要があります'
        }
      }

      // Git add and commit
      await this.executor.execSafe('git', ['add', this.formulaPath], {
        cwd: this.projectPath
      })

      await this.executor.execSafe('git', ['commit', '-m', `Add/Update ${formulaName} formula`], {
        cwd: this.projectPath
      })

      // Push to remote
      const pushResult = await this.retryManager.retry(
        async () => {
          return await this.executor.execSafe('git', ['push'], {
            cwd: this.projectPath
          })
        },
        {
          maxAttempts: 3,
          onRetry: async (attempt, error) => {
            if (error.message?.includes('authentication')) {
              throw ErrorFactory.create(
                'AUTHENTICATION_FAILED',
                this.name,
                'Gitリポジトリへの認証に失敗しました。GitHub認証情報を確認してください'
              )
            }
          }
        }
      )

      return {
        success: true,
        version: this.formulaMetadata?.version || 'unknown',
        packageUrl: `https://github.com/[owner]/${tapName}`,
        output: pushResult.stdout,
        metadata: {
          message:
            'FormulaをGitHubにpushしました。homebrew/homebrew-coreへの公式登録はPRを作成してください。'
        }
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
      await this.findFormulaFile()
      await this.loadFormulaMetadata()

      const formulaName = this.formulaMetadata?.name

      if (!formulaName) {
        return {
          verified: false,
          error: 'Formula名が見つかりません'
        }
      }

      // Try to find formula in Homebrew
      try {
        const result = await this.executor.execSafe('brew', ['info', formulaName], {
          cwd: this.projectPath,
          silent: true
        })

        return {
          verified: true,
          version: this.formulaMetadata?.version,
          url: `https://formulae.brew.sh/formula/${formulaName}`,
          metadata: {
            info: result.stdout
          }
        }
      } catch (error) {
        return {
          verified: false,
          error: `Formula ${formulaName} が Homebrew で見つかりません。カスタムTapの場合は正常です。`
        }
      }
    } catch (error) {
      return {
        verified: false,
        error: `検証に失敗: ${(error as Error).message}`
      }
    }
  }

  async rollback(_version: string): Promise<RollbackResult> {
    // Homebrew does not support rollback in the traditional sense
    // User must update the formula or remove it from the tap
    return {
      success: false,
      message:
        'HomebrewはFormulaのロールバックをサポートしていません。Formulaファイルを更新するか、Tapリポジトリから削除してください。',
      error: 'Rollback not supported for Homebrew. Update or remove the formula manually.'
    }
  }

  // Private helper methods

  private async findFormulaFile(): Promise<void> {
    if (this.formulaPath) {
      return
    }

    // Check Formula directory first
    const formulaDir = path.join(this.projectPath, 'Formula')
    const hasFormulaDir = await fs
      .access(formulaDir, fs.constants.R_OK)
      .then(() => true)
      .catch(() => false)

    if (hasFormulaDir) {
      const files = await fs.readdir(formulaDir)
      const rbFiles = files.filter((f) => f.endsWith('.rb'))
      if (rbFiles.length > 0) {
        this.formulaPath = path.join(formulaDir, rbFiles[0])
        return
      }
    }

    // Check root directory
    const files = await fs.readdir(this.projectPath)
    const rbFiles = files.filter((f) => f.endsWith('.rb'))
    if (rbFiles.length > 0) {
      this.formulaPath = path.join(this.projectPath, rbFiles[0])
    }
  }

  private async loadFormulaMetadata(): Promise<void> {
    if (this.formulaMetadata || !this.formulaPath) {
      return
    }

    const content = await fs.readFile(this.formulaPath, 'utf-8')
    this.formulaMetadata = this.parseFormula(content)
  }

  private parseFormula(content: string): FormulaMetadata {
    const metadata: FormulaMetadata = {}

    // Extract class name (formula name)
    const classMatch = content.match(/class\s+([A-Z][a-zA-Z0-9]*)\s+<\s+Formula/)
    if (classMatch) {
      metadata.name = this.classNameToFormulaName(classMatch[1])
    }

    // Extract version
    const versionMatch = content.match(/version\s+['"]([^'"]+)['"]/)
    if (versionMatch) {
      metadata.version = versionMatch[1]
    }

    // Extract URL
    const urlMatch = content.match(/url\s+['"]([^'"]+)['"]/)
    if (urlMatch) {
      metadata.url = urlMatch[1]
    }

    // Extract SHA256
    const sha256Match = content.match(/sha256\s+['"]([^'"]+)['"]/)
    if (sha256Match) {
      metadata.sha256 = sha256Match[1]
    }

    // Extract homepage
    const homepageMatch = content.match(/homepage\s+['"]([^'"]+)['"]/)
    if (homepageMatch) {
      metadata.homepage = homepageMatch[1]
    }

    // Extract description
    const descMatch = content.match(/desc\s+['"]([^'"]+)['"]/)
    if (descMatch) {
      metadata.description = descMatch[1]
    }

    // Extract license
    const licenseMatch = content.match(/license\s+['"]([^'"]+)['"]/)
    if (licenseMatch) {
      metadata.license = licenseMatch[1]
    }

    return metadata
  }

  private classNameToFormulaName(className: string): string {
    // Convert CamelCase to kebab-case
    // Example: MyAwesomeTool -> my-awesome-tool
    return className
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
      .toLowerCase()
  }
}
