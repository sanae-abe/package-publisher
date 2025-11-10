import { RegistryPlugin, PublishOptions, PublishReport } from './interfaces'
import { PublishStateMachine } from './PublishStateMachine'
import { SecureTokenManager } from '../security/SecureTokenManager'
import { SecretsScanner } from '../security/SecretsScanner'
import { ErrorFactory } from './ErrorHandling'
import { ConfigLoader } from './ConfigLoader'
import { PublishConfig } from './PublishConfig'
import * as readline from 'readline'

/**
 * Main orchestrator for package publishing
 */
export class PackagePublisher {
  private plugins: Map<string, RegistryPlugin> = new Map()
  private stateMachine: PublishStateMachine
  private tokenManager: SecureTokenManager
  private secretsScanner: SecretsScanner
  private config: PublishConfig | null = null

  constructor(private projectPath: string) {
    this.stateMachine = new PublishStateMachine(projectPath)
    this.tokenManager = new SecureTokenManager()
    this.secretsScanner = new SecretsScanner()
  }

  /**
   * Load configuration from file
   */
  async loadConfig(cliArgs?: Partial<PublishConfig>): Promise<void> {
    this.config = await ConfigLoader.load({
      projectPath: this.projectPath,
      cliArgs
    })

    // Validate configuration
    const validation = ConfigLoader.validate(this.config)
    if (!validation.valid) {
      const formatted = ConfigLoader.formatValidationResult(validation)
      console.error(formatted)
      throw ErrorFactory.create(
        'VALIDATION_FAILED',
        'config',
        '設定ファイルの検証に失敗しました'
      )
    }

    // Show warnings if any
    if (validation.warnings.length > 0) {
      const formatted = ConfigLoader.formatValidationResult(validation)
      console.warn(formatted)
    }
  }

  /**
   * Register a plugin for a specific registry
   */
  registerPlugin(plugin: RegistryPlugin): void {
    this.plugins.set(plugin.name, plugin)
  }

  /**
   * Auto-detect applicable registries
   */
  async detectRegistries(): Promise<string[]> {
    const detected: string[] = []

    for (const [name, plugin] of this.plugins) {
      if (await plugin.detect(this.projectPath)) {
        detected.push(name)
      }
    }

    return detected
  }

  /**
   * Publish a package
   */
  async publish(options: PublishOptions = {}): Promise<PublishReport> {
    const startTime = Date.now()
    const errors: string[] = []
    const warnings: string[] = []

    try {
      // Load config if not already loaded
      if (!this.config) {
        await this.loadConfig()
      }

      // Merge CLI options with config (CLI takes priority)
      const effectiveOptions = this.mergeOptionsWithConfig(options)

      // 1. Restore state if resume requested
      if (options.resume) {
        await this.stateMachine.transition('INITIAL')
        const restored = await this.stateMachine.restore()
        if (!restored) {
          throw ErrorFactory.create(
            'STATE_CORRUPTED',
            'system',
            '状態ファイルが見つからないか破損しています'
          )
        }
      } else {
        await this.stateMachine.clear()
        await this.stateMachine.transition('INITIAL')
      }

      // 2. Detect registries
      await this.stateMachine.transition('DETECTING')
      const detectedRegistries = await this.detectRegistries()

      if (detectedRegistries.length === 0) {
        throw ErrorFactory.create(
          'REGISTRY_NOT_DETECTED',
          'system',
          '対応するレジストリが検出されませんでした'
        )
      }

      // Use specified registry or first detected
      const registryName = effectiveOptions.registry || detectedRegistries[0]
      const plugin = this.plugins.get(registryName)

      if (!plugin) {
        throw ErrorFactory.create(
          'REGISTRY_NOT_DETECTED',
          registryName,
          `レジストリ ${registryName} のプラグインが見つかりません`
        )
      }

      console.log(`\n📦 レジストリ検出: ${registryName}`)
      console.log(`検出されたレジストリ: ${detectedRegistries.join(', ')}\n`)

      // 3. Security scan (if enabled)
      const secretsScanningEnabled = this.config?.security?.secretsScanning?.enabled !== false
      if (secretsScanningEnabled) {
        console.log('🔍 セキュリティスキャン実行中...')
        const scanReport = await this.secretsScanner.scanProject(this.projectPath)

        if (scanReport.hasSecrets) {
          const formatted = SecretsScanner.formatReport(scanReport)
          console.error(formatted)

          if (!effectiveOptions.nonInteractive) {
            const proceed = await this.confirm(
              '⚠️  潜在的なシークレットが検出されました。続行しますか？'
            )
            if (!proceed) {
              throw ErrorFactory.create(
                'SECRETS_DETECTED',
                registryName,
                'シークレットが検出されたため、公開を中止しました'
              )
            }
          }

          warnings.push(`${scanReport.findings.length}件の潜在的なシークレットを検出`)
        } else {
          console.log('✅ セキュリティスキャン完了: 問題なし\n')
        }
      }

      // 4. Validation
      await this.stateMachine.transition('VALIDATING', { registry: registryName })
      console.log('🔍 パッケージ検証中...')

      const validationResult = await plugin.validate()

      if (!validationResult.valid) {
        console.error('❌ 検証エラー:')
        for (const error of validationResult.errors) {
          console.error(`  - [${error.field}] ${error.message}`)
          errors.push(`${error.field}: ${error.message}`)
        }
        throw ErrorFactory.create('VALIDATION_FAILED', registryName, '検証に失敗しました')
      }

      if (validationResult.warnings.length > 0) {
        console.warn('⚠️  警告:')
        for (const warning of validationResult.warnings) {
          console.warn(`  - [${warning.field}] ${warning.message}`)
          warnings.push(`${warning.field}: ${warning.message}`)
        }
      }

      console.log('✅ 検証完了\n')

      const packageVersion = validationResult.metadata?.version

      // 5. Dry-run (if not skipped)
      const shouldSkipDryRun = effectiveOptions.dryRun || options.resume || this.config?.publish?.dryRun === 'never'
      if (!shouldSkipDryRun) {
        await this.stateMachine.transition('DRY_RUN')
        console.log('🧪 Dry-run 実行中...')

        const dryRunResult = await plugin.dryRun()

        if (!dryRunResult.success) {
          console.error('❌ Dry-run失敗:')
          if (dryRunResult.errors) {
            for (const error of dryRunResult.errors) {
              console.error(`  - ${error.message}`)
              errors.push(error.message)
            }
          }
          throw ErrorFactory.create('PUBLISH_FAILED', registryName, 'Dry-runに失敗しました')
        }

        console.log('✅ Dry-run完了')
        if (dryRunResult.estimatedSize) {
          console.log(`   パッケージサイズ: ${dryRunResult.estimatedSize}`)
        }
        console.log()
      }

      // Return if dry-run only
      if (effectiveOptions.dryRun) {
        return {
          success: true,
          registry: registryName,
          packageName: validationResult.metadata?.packageName || 'unknown',
          version: packageVersion || 'unknown',
          errors,
          warnings,
          duration: Date.now() - startTime,
          state: 'DRY_RUN'
        }
      }

      // 6. Confirmation (interactive mode)
      const shouldConfirm = !effectiveOptions.nonInteractive && !options.resume && (this.config?.publish?.confirm !== false)
      if (shouldConfirm) {
        await this.stateMachine.transition('CONFIRMING')

        console.log('📋 公開前チェックリスト:')
        console.log(`  ✅ レジストリ: ${registryName}`)
        console.log(`  ✅ バージョン: ${packageVersion}`)
        console.log(`  ✅ 検証: 成功`)
        console.log(`  ✅ Dry-run: 成功`)
        if (warnings.length > 0) {
          console.log(`  ⚠️  警告: ${warnings.length}件`)
        }
        console.log()

        const proceed = await this.confirm('公開を実行しますか？')
        if (!proceed) {
          console.log('公開を中止しました')
          await this.stateMachine.transition('FAILED', { error: 'User cancelled' })
          return {
            success: false,
            registry: registryName,
            packageName: validationResult.metadata?.packageName || 'unknown',
            version: packageVersion || 'unknown',
            errors: ['User cancelled'],
            warnings,
            duration: Date.now() - startTime,
            state: 'FAILED'
          }
        }
      }

      // 7. Publish
      await this.stateMachine.transition('PUBLISHING', { version: packageVersion })
      console.log('📤 公開中...')

      const publishResult = await plugin.publish(effectiveOptions)

      if (!publishResult.success) {
        throw ErrorFactory.create(
          'PUBLISH_FAILED',
          registryName,
          publishResult.error || '公開に失敗しました'
        )
      }

      console.log('✅ 公開完了\n')

      // 8. Verify (if enabled)
      const shouldVerify = this.config?.publish?.verify !== false
      let verifyResult: any = null
      if (shouldVerify) {
        await this.stateMachine.transition('VERIFYING')
        console.log('🔍 公開確認中...')

        verifyResult = await plugin.verify()

        if (!verifyResult.verified) {
          warnings.push(`検証に失敗: ${verifyResult.error}`)
          console.warn('⚠️  検証に失敗しました（公開自体は成功している可能性があります）')
          console.warn(`   ${verifyResult.error}`)
        } else {
          console.log('✅ 公開確認完了')
          console.log(`   URL: ${verifyResult.url}\n`)
        }
      }

      // Success
      await this.stateMachine.transition('SUCCESS')

      return {
        success: true,
        registry: registryName,
        packageName: validationResult.metadata?.packageName || 'unknown',
        version: packageVersion || 'unknown',
        publishedAt: new Date(),
        verificationUrl: verifyResult?.url,
        errors,
        warnings,
        duration: Date.now() - startTime,
        state: 'SUCCESS'
      }
    } catch (error) {
      await this.stateMachine.transition('FAILED', {
        error: (error as Error).message
      })

      const err = error as Error
      errors.push(err.message)

      return {
        success: false,
        registry: options.registry || 'unknown',
        packageName: 'unknown',
        version: 'unknown',
        errors,
        warnings,
        duration: Date.now() - startTime,
        state: 'FAILED'
      }
    }
  }

  /**
   * Merge CLI options with configuration (CLI takes priority)
   */
  private mergeOptionsWithConfig(options: PublishOptions): PublishOptions {
    const config = this.config

    // If no config loaded, return original options
    if (!config) {
      return options
    }

    // Determine dry-run behavior
    let shouldDryRun = options.dryRun
    if (shouldDryRun === undefined && config.publish?.dryRun) {
      shouldDryRun = config.publish.dryRun === 'always'
    }

    // Determine interactive mode
    let interactive = !options.nonInteractive
    if (options.nonInteractive === undefined && config.publish?.interactive !== undefined) {
      interactive = config.publish.interactive
    }

    // Determine registry
    const registry =
      options.registry ||
      config.project?.defaultRegistry

    return {
      ...options,
      dryRun: shouldDryRun,
      nonInteractive: !interactive,
      registry
    }
  }

  /**
   * Prompt user for confirmation
   */
  private confirm(message: string): Promise<boolean> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    })

    return new Promise((resolve) => {
      rl.question(`${message} (yes/no): `, (answer) => {
        rl.close()
        resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y')
      })
    })
  }

  /**
   * Get registered plugins
   */
  getPlugins(): Map<string, RegistryPlugin> {
    return this.plugins
  }

  /**
   * Get state machine
   */
  getStateMachine(): PublishStateMachine {
    return this.stateMachine
  }
}
