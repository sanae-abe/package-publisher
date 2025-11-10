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

interface PyProjectToml {
  project?: {
    name?: string
    version?: string
    description?: string
    authors?: Array<{ name: string; email?: string }>
    license?: { text?: string; file?: string }
    readme?: string
    requires_python?: string
    dependencies?: string[]
    [key: string]: unknown
  }
  [key: string]: unknown
}

interface SetupPy {
  name?: string
  version?: string
  description?: string
  author?: string
  license?: string
  [key: string]: unknown
}

export class PyPIPlugin implements RegistryPlugin {
  readonly name = 'pypi'
  readonly version = '1.0.0'

  private projectPath: string
  private pyprojectTomlPath: string
  private setupPyPath: string
  private packageMetadata?: PyProjectToml | SetupPy
  private executor: SafeCommandExecutor
  private retryManager: RetryManager

  constructor(projectPath: string, executor?: SafeCommandExecutor) {
    this.projectPath = projectPath
    this.pyprojectTomlPath = path.join(projectPath, 'pyproject.toml')
    this.setupPyPath = path.join(projectPath, 'setup.py')
    this.executor = executor || new SafeCommandExecutor()
    this.retryManager = new RetryManager()
  }

  async detect(projectPath: string): Promise<boolean> {
    try {
      // Check for pyproject.toml (modern) or setup.py (legacy)
      const hasPyproject = await fs
        .access(path.join(projectPath, 'pyproject.toml'), fs.constants.R_OK)
        .then(() => true)
        .catch(() => false)

      const hasSetupPy = await fs
        .access(path.join(projectPath, 'setup.py'), fs.constants.R_OK)
        .then(() => true)
        .catch(() => false)

      return hasPyproject || hasSetupPy
    } catch {
      return false
    }
  }

  async validate(): Promise<ValidationResult> {
    const errors: ValidationError[] = []
    const warnings: ValidationWarning[] = []

    try {
      // Load package metadata
      await this.loadPackageMetadata()

      // Validate required fields
      const name = this.getFieldValue('name')
      const version = this.getFieldValue('version')

      if (!name) {
        errors.push({
          field: 'name',
          message: 'nameは必須フィールドです',
          severity: 'error'
        })
      }

      if (!version) {
        errors.push({
          field: 'version',
          message: 'versionは必須フィールドです',
          severity: 'error'
        })
      }

      // Validate package name (PyPI naming rules)
      if (name) {
        const nameErrors = this.validatePackageName(name)
        errors.push(...nameErrors)
      }

      // Validate version (PEP 440)
      if (version) {
        if (!this.isValidPEP440Version(version)) {
          errors.push({
            field: 'version',
            message: `無効なPEP 440バージョン形式: ${version}`,
            severity: 'error'
          })
        }
      }

      // Validate license
      const license = this.getFieldValue('license')
      if (!license) {
        warnings.push({
          field: 'license',
          message: 'ライセンスフィールドの指定を推奨します',
          severity: 'warning'
        })
      }

      // Validate description
      const description = this.getFieldValue('description')
      if (!description) {
        warnings.push({
          field: 'description',
          message: 'descriptionフィールドの指定を推奨します',
          severity: 'warning'
        })
      }

      // Check if build tools are installed
      try {
        await this.executor.execSafe('python', ['-m', 'build', '--version'], {
          cwd: this.projectPath,
          silent: true
        })
      } catch {
        warnings.push({
          field: 'build_tools',
          message: 'python -m build が利用できません。pip install build でインストールを推奨します',
          severity: 'warning'
        })
      }

      // Check if twine is installed
      try {
        await this.executor.execSafe('twine', ['--version'], {
          cwd: this.projectPath,
          silent: true
        })
      } catch {
        warnings.push({
          field: 'twine',
          message: 'twine が利用できません。pip install twine でインストールを推奨します',
          severity: 'warning'
        })
      }

      // Run tests if pytest is available
      try {
        await this.executor.execSafe('python', ['-m', 'pytest', '--version'], {
          cwd: this.projectPath,
          silent: true
        })

        // Run actual tests
        await this.executor.execSafe('python', ['-m', 'pytest'], {
          cwd: this.projectPath
        })
      } catch (error) {
        const errorMsg = (error as Error).message
        if (!errorMsg.includes('No module named pytest')) {
          errors.push({
            field: 'tests',
            message: `テストに失敗: ${errorMsg}`,
            severity: 'error'
          })
        }
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        metadata: {
          packageName: name,
          version
        }
      }
    } catch (error) {
      throw ErrorFactory.create(
        'VALIDATION_FAILED',
        this.name,
        `パッケージメタデータの検証に失敗: ${(error as Error).message}`
      )
    }
  }

  async dryRun(): Promise<DryRunResult> {
    try {
      // Build the package
      const buildResult = await this.executor.execSafe('python', ['-m', 'build'], {
        cwd: this.projectPath
      })

      // Check with twine
      const checkResult = await this.executor.execSafe('twine', ['check', 'dist/*'], {
        cwd: this.projectPath
      })

      const output = buildResult.stdout + '\n' + checkResult.stdout

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
            field: 'build',
            message: `ビルドまたは検証に失敗: ${(error as Error).message}`,
            severity: 'error'
          }
        ]
      }
    }
  }

  async publish(options: PublishOptions = {}): Promise<PublishResult> {
    const { tag } = options

    try {
      await this.loadPackageMetadata()

      // Build the package first
      await this.executor.execSafe('python', ['-m', 'build'], {
        cwd: this.projectPath
      })

      const args = ['upload', 'dist/*']

      // Repository specification (test.pypi.org vs pypi.org)
      if (tag === 'test') {
        args.push('--repository-url', 'https://test.pypi.org/legacy/')
      }

      // Retry logic
      const result = await this.retryManager.retry(
        async () => {
          return await this.executor.execSafe('twine', args, {
            cwd: this.projectPath
          })
        },
        {
          maxAttempts: 3,
          onRetry: async (attempt, error) => {
            // Authentication detection
            if (
              error.message?.includes('authentication') ||
              error.message?.includes('credentials')
            ) {
              throw ErrorFactory.create(
                'AUTHENTICATION_FAILED',
                this.name,
                'PyPIの認証に失敗しました。~/.pypirc または環境変数 TWINE_USERNAME, TWINE_PASSWORD を確認してください'
              )
            }
          }
        }
      )

      const packageName = this.getFieldValue('name')!
      const version = this.getFieldValue('version')!
      const packageUrl =
        tag === 'test'
          ? `https://test.pypi.org/project/${packageName}`
          : `https://pypi.org/project/${packageName}`

      return {
        success: true,
        version,
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
      await this.loadPackageMetadata()

      const packageName = this.getFieldValue('name')!
      const expectedVersion = this.getFieldValue('version')!

      // Verify on PyPI JSON API
      const response = await fetch(`https://pypi.org/pypi/${packageName}/json`)

      if (!response.ok) {
        return {
          verified: false,
          error: `パッケージ ${packageName} が PyPI で見つかりません（HTTP ${response.status}）`
        }
      }

      const data = await response.json() as { releases?: Record<string, unknown>; info?: { version?: string } }

      // Check if the expected version exists
      const releases = data.releases || {}
      if (!releases[expectedVersion]) {
        const availableVersions = Object.keys(releases).join(', ')
        return {
          verified: false,
          error: `バージョン ${expectedVersion} が PyPI で見つかりません。利用可能なバージョン: ${availableVersions}`
        }
      }

      // Get latest version
      const latestVersion = data.info?.version

      return {
        verified: true,
        version: expectedVersion,
        url: `https://pypi.org/project/${packageName}`,
        metadata: {
          latestVersion,
          allVersions: Object.keys(releases)
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
    // PyPI does not support deleting published packages
    // Only option is to yank a release (make it unavailable for new installs)
    return {
      success: false,
      message:
        'PyPIはパッケージの削除をサポートしていません。PyPIウェブサイトから手動でyank（非推奨化）する必要があります',
      error: 'Rollback not supported for PyPI. Use the PyPI website to yank a release manually.'
    }
  }

  // Private helper methods

  private async loadPackageMetadata(): Promise<void> {
    if (this.packageMetadata) {
      return
    }

    // Try pyproject.toml first (modern)
    try {
      const content = await fs.readFile(this.pyprojectTomlPath, 'utf-8')
      this.packageMetadata = this.parseToml(content)
      return
    } catch {
      // Fall through to setup.py
    }

    // Try setup.py (legacy)
    try {
      const content = await fs.readFile(this.setupPyPath, 'utf-8')
      this.packageMetadata = this.parseSetupPy(content)
    } catch (error) {
      throw new Error('pyproject.toml または setup.py が見つかりません')
    }
  }

  private parseToml(content: string): PyProjectToml {
    // Simple TOML parser (same as CratesIOPlugin)
    // In production, use a proper TOML library like @iarna/toml
    const toml: PyProjectToml = {}
    let currentSection: string | null = null

    const lines = content.split('\n')
    for (const line of lines) {
      const trimmed = line.trim()

      if (trimmed.startsWith('#') || trimmed === '') {
        continue
      }

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

      const match = trimmed.match(/^([a-zA-Z0-9_-]+)\s*=\s*(.+)$/)
      if (match && currentSection) {
        const [, key, value] = match
        const keys = currentSection.split('.')
        let obj: Record<string, unknown> = toml
        for (const k of keys) {
          obj = obj[k] as Record<string, unknown>
        }

        let parsedValue: string = value.trim()
        if (parsedValue.startsWith('"') && parsedValue.endsWith('"')) {
          parsedValue = parsedValue.slice(1, -1)
        }

        obj[key] = parsedValue
      }
    }

    return toml
  }

  private parseSetupPy(content: string): SetupPy {
    // Very basic setup.py parser - extract common fields
    const setup: SetupPy = {}

    const nameMatch = content.match(/name\s*=\s*['"]([^'"]+)['"]/)
    if (nameMatch) {
      setup.name = nameMatch[1]
    }

    const versionMatch = content.match(/version\s*=\s*['"]([^'"]+)['"]/)
    if (versionMatch) {
      setup.version = versionMatch[1]
    }

    const descMatch = content.match(/description\s*=\s*['"]([^'"]+)['"]/)
    if (descMatch) {
      setup.description = descMatch[1]
    }

    const authorMatch = content.match(/author\s*=\s*['"]([^'"]+)['"]/)
    if (authorMatch) {
      setup.author = authorMatch[1]
    }

    const licenseMatch = content.match(/license\s*=\s*['"]([^'"]+)['"]/)
    if (licenseMatch) {
      setup.license = licenseMatch[1]
    }

    return setup
  }

  private getFieldValue(field: string): string | undefined {
    if (!this.packageMetadata) {
      return undefined
    }

    // Try pyproject.toml structure first
    if ('project' in this.packageMetadata && this.packageMetadata.project) {
      const project = this.packageMetadata.project as Record<string, unknown>
      const value = project[field]
      if (value) {
        return typeof value === 'string' ? value : String(value)
      }
    }

    // Try setup.py structure
    const metadata = this.packageMetadata as Record<string, unknown>
    const value = metadata[field]
    return value ? (typeof value === 'string' ? value : String(value)) : undefined
  }

  private validatePackageName(name: string): ValidationError[] {
    const errors: ValidationError[] = []

    // PyPI naming rules
    // https://peps.python.org/pep-0508/#names

    // Must consist of ASCII letters, numbers, periods, hyphens, underscores
    if (!/^[A-Za-z0-9._-]+$/.test(name)) {
      errors.push({
        field: 'name',
        message: 'パッケージ名はASCII英数字、ピリオド、ハイフン、アンダースコアのみ使用可能です',
        severity: 'error'
      })
    }

    // Cannot start or end with periods or hyphens
    if (/^[.-]|[.-]$/.test(name)) {
      errors.push({
        field: 'name',
        message: 'パッケージ名はピリオドまたはハイフンで始めたり終わったりできません',
        severity: 'error'
      })
    }

    return errors
  }

  private isValidPEP440Version(version: string): boolean {
    // PEP 440 version scheme
    // https://peps.python.org/pep-0440/
    const pep440Regex =
      /^([1-9][0-9]*!)?(0|[1-9][0-9]*)(\.(0|[1-9][0-9]*))*((a|b|rc)(0|[1-9][0-9]*))?(\.post(0|[1-9][0-9]*))?(\.dev(0|[1-9][0-9]*))?$/
    return pep440Regex.test(version)
  }
}
