/**
 * Configuration file loader for package-publisher
 *
 * @file ConfigLoader.ts
 * @description Load, validate, and merge configuration files
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import * as yaml from 'js-yaml'
import * as os from 'os'
import {
  PublishConfig,
  ConfigLoadOptions,
  ConfigValidationResult,
  ConfigValidationError,
  ConfigValidationWarning,
  DEFAULT_CONFIG
} from './PublishConfig'

/**
 * Configuration file loader
 */
export class ConfigLoader {
  private static readonly CONFIG_FILENAME = '.publish-config.yaml'
  private static readonly ENV_VAR_PATTERN = /\$\{([A-Z_][A-Z0-9_]*)\}/g

  /**
   * Load configuration from multiple sources with priority
   *
   * Priority (high to low):
   * 1. CLI arguments
   * 2. Environment variables
   * 3. Project config (./.publish-config.yaml)
   * 4. Global config (~/.publish-config.yaml)
   * 5. Default values
   */
  static async load(options: ConfigLoadOptions): Promise<PublishConfig> {
    const configs: Partial<PublishConfig>[] = []

    // 5. Default values (lowest priority)
    configs.push(DEFAULT_CONFIG)

    // 4. Global config
    const globalConfig = await this.loadGlobalConfig()
    if (globalConfig) {
      configs.push(globalConfig)
    }

    // 3. Project config
    const projectConfig = await this.loadProjectConfig(options.projectPath)
    if (projectConfig) {
      configs.push(projectConfig)
    }

    // 2. Environment variables
    const envConfig = this.loadEnvConfig(options.env || process.env)
    if (envConfig) {
      configs.push(envConfig)
    }

    // 1. CLI arguments (highest priority)
    if (options.cliArgs) {
      configs.push(options.cliArgs)
    }

    // Merge all configs
    const mergedConfig = this.mergeConfigs(configs)

    // Expand environment variables
    const expandedConfig = this.expandEnvVars(mergedConfig, options.env || process.env)

    return expandedConfig as PublishConfig
  }

  /**
   * Load global configuration from ~/.publish-config.yaml
   */
  private static async loadGlobalConfig(): Promise<Partial<PublishConfig> | null> {
    const homeDir = os.homedir()
    const globalConfigPath = path.join(homeDir, this.CONFIG_FILENAME)

    return this.loadConfigFile(globalConfigPath)
  }

  /**
   * Load project configuration from ./.publish-config.yaml
   */
  private static async loadProjectConfig(
    projectPath: string
  ): Promise<Partial<PublishConfig> | null> {
    const projectConfigPath = path.join(projectPath, this.CONFIG_FILENAME)

    return this.loadConfigFile(projectConfigPath)
  }

  /**
   * Load configuration from YAML file
   */
  private static async loadConfigFile(
    filePath: string
  ): Promise<Partial<PublishConfig> | null> {
    try {
      await fs.access(filePath)
      const content = await fs.readFile(filePath, 'utf-8')
      const config = yaml.load(content) as Partial<PublishConfig>

      // Handle extends if present
      if (config.extends) {
        const baseConfig = await this.loadConfigFile(config.extends)
        if (baseConfig) {
          return this.mergeConfigs([baseConfig, config])
        }
      }

      return config
    } catch (error) {
      // File not found or read error - return null
      return null
    }
  }

  /**
   * Load configuration from environment variables
   */
  private static loadEnvConfig(env: Record<string, string | undefined>): Partial<PublishConfig> | null {
    const config: Partial<PublishConfig> = {}

    // PUBLISH_REGISTRY -> defaultRegistry
    if (env.PUBLISH_REGISTRY) {
      config.project = {
        defaultRegistry: env.PUBLISH_REGISTRY
      }
    }

    // PUBLISH_DRY_RUN -> publish.dryRun
    if (env.PUBLISH_DRY_RUN) {
      config.publish = {
        dryRun: env.PUBLISH_DRY_RUN as 'first' | 'always' | 'never'
      }
    }

    // PUBLISH_NON_INTERACTIVE -> publish.interactive
    if (env.PUBLISH_NON_INTERACTIVE === 'true') {
      config.publish = {
        ...config.publish,
        interactive: false
      }
    }

    return Object.keys(config).length > 0 ? config : null
  }

  /**
   * Merge multiple configurations with priority
   */
  private static mergeConfigs(configs: Partial<PublishConfig>[]): Partial<PublishConfig> {
    const merged: Partial<PublishConfig> = {}

    for (const config of configs) {
      this.deepMerge(merged, config)
    }

    return merged
  }

  /**
   * Deep merge two objects
   */
  private static deepMerge(target: any, source: any): void {
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        if (!target[key]) {
          target[key] = {}
        }
        this.deepMerge(target[key], source[key])
      } else {
        target[key] = source[key]
      }
    }
  }

  /**
   * Expand environment variables in configuration
   *
   * Security features:
   * - Only expands variables matching ${VAR_NAME} pattern
   * - Respects allowedPrefixes if configured
   * - Checks forbiddenPatterns if configured
   */
  private static expandEnvVars(
    config: Partial<PublishConfig>,
    env: Record<string, string | undefined>
  ): Partial<PublishConfig> {
    const allowedPrefixes = config.security?.envVarExpansion?.allowedPrefixes
    const forbiddenPatterns = config.security?.envVarExpansion?.forbiddenPatterns?.map(
      (pattern) => new RegExp(pattern, 'i')
    )
    const enabled = config.security?.envVarExpansion?.enabled !== false

    if (!enabled) {
      return config
    }

    return this.recursiveExpandEnvVars(config, env, allowedPrefixes, forbiddenPatterns) as Partial<PublishConfig>
  }

  /**
   * Recursively expand environment variables in object
   */
  private static recursiveExpandEnvVars(
    obj: any,
    env: Record<string, string | undefined>,
    allowedPrefixes?: string[],
    forbiddenPatterns?: RegExp[]
  ): unknown {
    if (typeof obj === 'string') {
      return obj.replace(this.ENV_VAR_PATTERN, (match, varName) => {
        // Check forbidden patterns
        if (forbiddenPatterns) {
          for (const pattern of forbiddenPatterns) {
            if (pattern.test(varName)) {
              console.warn(
                `⚠️  環境変数 ${varName} は禁止パターンに一致するためスキップされました`
              )
              return match
            }
          }
        }

        // Check allowed prefixes
        if (allowedPrefixes && allowedPrefixes.length > 0) {
          const allowed = allowedPrefixes.some((prefix) => varName.startsWith(prefix))
          if (!allowed) {
            console.warn(
              `⚠️  環境変数 ${varName} は許可されたプレフィックスに一致しないためスキップされました`
            )
            return match
          }
        }

        const value = env[varName]
        if (value === undefined) {
          console.warn(`⚠️  環境変数 ${varName} が見つかりませんでした`)
          return match
        }

        return value
      })
    }

    if (Array.isArray(obj)) {
      return obj.map((item) =>
        this.recursiveExpandEnvVars(item, env, allowedPrefixes, forbiddenPatterns)
      )
    }

    if (obj && typeof obj === 'object') {
      const result: any = {}
      for (const key in obj) {
        result[key] = this.recursiveExpandEnvVars(
          obj[key],
          env,
          allowedPrefixes,
          forbiddenPatterns
        )
      }
      return result
    }

    return obj
  }

  /**
   * Validate configuration
   */
  static validate(config: Partial<PublishConfig>): ConfigValidationResult {
    const errors: ConfigValidationError[] = []
    const warnings: ConfigValidationWarning[] = []

    // 1. Check version (required)
    if (!config.version) {
      errors.push({
        field: 'version',
        message: 'バージョンは必須です',
        expected: 'string (e.g., "1.0")',
        actual: 'undefined'
      })
    } else if (config.version !== '1.0') {
      warnings.push({
        field: 'version',
        message: `未知のバージョン: ${config.version}`,
        suggestion: '現在サポートされているバージョンは "1.0" のみです'
      })
    }

    // 2. Validate registries
    if (config.registries) {
      this.validateRegistries(config.registries, errors, warnings)
    }

    // 3. Validate security settings
    if (config.security) {
      this.validateSecurity(config.security, errors, warnings)
    }

    // 4. Validate hooks
    if (config.hooks) {
      this.validateHooks(config.hooks, errors, warnings)
    }

    // 5. Validate publish options
    if (config.publish) {
      this.validatePublishOptions(config.publish, errors, warnings)
    }

    // 6. Custom validation rules
    if (config.validation?.rules) {
      this.applyCustomValidationRules(config, errors, warnings)
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    }
  }

  /**
   * Validate registry configurations
   */
  private static validateRegistries(
    registries: any,
    errors: ConfigValidationError[],
    _warnings: ConfigValidationWarning[]
  ): void {
    // Validate npm config
    if (registries.npm) {
      if (registries.npm.tag && typeof registries.npm.tag !== 'string') {
        errors.push({
          field: 'registries.npm.tag',
          message: 'tagは文字列である必要があります',
          expected: 'string',
          actual: typeof registries.npm.tag
        })
      }

      if (
        registries.npm.access &&
        registries.npm.access !== 'public' &&
        registries.npm.access !== 'restricted'
      ) {
        errors.push({
          field: 'registries.npm.access',
          message: 'accessは "public" または "restricted" である必要があります',
          expected: '"public" | "restricted"',
          actual: registries.npm.access
        })
      }
    }

    // Validate PyPI config
    if (registries.pypi) {
      if (
        registries.pypi.repository &&
        registries.pypi.repository !== 'pypi' &&
        registries.pypi.repository !== 'testpypi'
      ) {
        errors.push({
          field: 'registries.pypi.repository',
          message: 'repositoryは "pypi" または "testpypi" である必要があります',
          expected: '"pypi" | "testpypi"',
          actual: registries.pypi.repository
        })
      }
    }
  }

  /**
   * Validate security settings
   */
  private static validateSecurity(
    security: any,
    errors: ConfigValidationError[],
    _warnings: ConfigValidationWarning[]
  ): void {
    // Validate allowedCommands
    if (security.allowedCommands) {
      for (const [cmd, config] of Object.entries(security.allowedCommands)) {
        if (typeof config !== 'object' || !config) continue

        const cmdConfig = config as any
        if (!cmdConfig.executable) {
          errors.push({
            field: `security.allowedCommands.${cmd}.executable`,
            message: 'executableは必須です',
            expected: 'string (full path)',
            actual: 'undefined'
          })
        }

        if (!cmdConfig.allowedArgs || !Array.isArray(cmdConfig.allowedArgs)) {
          errors.push({
            field: `security.allowedCommands.${cmd}.allowedArgs`,
            message: 'allowedArgsは必須で配列である必要があります',
            expected: 'string[]',
            actual: typeof cmdConfig.allowedArgs
          })
        }
      }
    }

    // Validate ignorePatterns
    if (security.secretsScanning?.ignorePatterns) {
      for (let i = 0; i < security.secretsScanning.ignorePatterns.length; i++) {
        const pattern = security.secretsScanning.ignorePatterns[i]
        if (!pattern.pathPrefix) {
          errors.push({
            field: `security.secretsScanning.ignorePatterns[${i}].pathPrefix`,
            message: 'pathPrefixは必須です（パストラバーサル対策）',
            expected: 'string',
            actual: 'undefined'
          })
        }
      }
    }
  }

  /**
   * Validate hooks configuration
   */
  private static validateHooks(
    hooks: any,
    errors: ConfigValidationError[],
    _warnings: ConfigValidationWarning[]
  ): void {
    const hookTypes = ['preBuild', 'prePublish', 'postPublish', 'onError']

    for (const hookType of hookTypes) {
      if (!hooks[hookType]) continue

      const hookCommands = hooks[hookType]
      if (!Array.isArray(hookCommands)) {
        errors.push({
          field: `hooks.${hookType}`,
          message: '配列である必要があります',
          expected: 'array',
          actual: typeof hookCommands
        })
        continue
      }

      for (let i = 0; i < hookCommands.length; i++) {
        const hook = hookCommands[i]
        if (!hook.command) {
          errors.push({
            field: `hooks.${hookType}[${i}].command`,
            message: 'commandは必須です',
            expected: 'string',
            actual: 'undefined'
          })
        }

        if (!hook.allowedCommands || !Array.isArray(hook.allowedCommands)) {
          errors.push({
            field: `hooks.${hookType}[${i}].allowedCommands`,
            message: 'allowedCommandsは必須で配列である必要があります',
            expected: 'string[]',
            actual: typeof hook.allowedCommands
          })
        }
      }
    }
  }

  /**
   * Validate publish options
   */
  private static validatePublishOptions(
    publish: any,
    errors: ConfigValidationError[],
    _warnings: ConfigValidationWarning[]
  ): void {
    if (publish.dryRun) {
      const validValues = ['first', 'always', 'never']
      if (!validValues.includes(publish.dryRun)) {
        errors.push({
          field: 'publish.dryRun',
          message: `dryRunは ${validValues.join(', ')} のいずれかである必要があります`,
          expected: validValues.join(' | '),
          actual: publish.dryRun
        })
      }
    }
  }

  /**
   * Apply custom validation rules
   */
  private static applyCustomValidationRules(
    config: any,
    errors: ConfigValidationError[],
    warnings: ConfigValidationWarning[]
  ): void {
    for (const rule of config.validation.rules) {
      const fieldValue = this.getFieldValue(config, rule.field)

      if (rule.pattern) {
        const regex = new RegExp(rule.pattern)
        if (!regex.test(String(fieldValue))) {
          const issue = {
            field: rule.field,
            message: rule.errorMessage,
            expected: rule.pattern,
            actual: String(fieldValue)
          }

          if (rule.severity === 'warning') {
            warnings.push(issue)
          } else {
            errors.push(issue)
          }
        }
      }

      if (rule.condition) {
        // Simple condition evaluation (for MVP)
        // TODO: Implement safe expression evaluation
        console.warn(`⚠️  条件式のバリデーションは未実装です: ${rule.condition}`)
      }
    }
  }

  /**
   * Get field value from nested object path
   */
  private static getFieldValue(obj: any, fieldPath: string): any {
    const parts = fieldPath.split('.')
    let value = obj

    for (const part of parts) {
      if (value && typeof value === 'object') {
        value = value[part]
      } else {
        return undefined
      }
    }

    return value
  }

  /**
   * Format validation result as human-readable string
   */
  static formatValidationResult(result: ConfigValidationResult): string {
    const lines: string[] = []

    if (result.valid) {
      lines.push('✅ 設定ファイルの検証に成功しました')
    } else {
      lines.push('❌ 設定ファイルにエラーがあります')
    }

    if (result.errors.length > 0) {
      lines.push('\n🔴 エラー:')
      for (const error of result.errors) {
        lines.push(`  - [${error.field}] ${error.message}`)
        if (error.expected && error.actual) {
          lines.push(`    期待される型: ${error.expected}`)
          lines.push(`    実際の型: ${error.actual}`)
        }
      }
    }

    if (result.warnings.length > 0) {
      lines.push('\n🟡 警告:')
      for (const warning of result.warnings) {
        lines.push(`  - [${warning.field}] ${warning.message}`)
        if (warning.suggestion) {
          lines.push(`    提案: ${warning.suggestion}`)
        }
      }
    }

    return lines.join('\n')
  }
}
