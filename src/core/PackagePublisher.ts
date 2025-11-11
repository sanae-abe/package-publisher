import { RegistryPlugin, PublishOptions, PublishReport, VerificationResult, HookContext } from './interfaces'
import { PublishStateMachine } from './PublishStateMachine'
import { SecureTokenManager } from '../security/SecureTokenManager'
import { SecretsScanner } from '../security/SecretsScanner'
import { ErrorFactory } from './ErrorHandling'
import { ConfigLoader } from './ConfigLoader'
import { PublishConfig } from './PublishConfig'
import { HookExecutor } from './HookExecutor'
import * as readline from 'readline'

/**
 * Main orchestrator for package publishing
 */
export class PackagePublisher {
  private plugins: Map<string, RegistryPlugin> = new Map()
  private stateMachine: PublishStateMachine
  private tokenManager: SecureTokenManager
  private secretsScanner: SecretsScanner
  private hookExecutor: HookExecutor
  private config: PublishConfig | null = null

  constructor(private projectPath: string) {
    this.stateMachine = new PublishStateMachine(projectPath)
    this.tokenManager = new SecureTokenManager()
    this.secretsScanner = new SecretsScanner()
    this.hookExecutor = new HookExecutor(projectPath)
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
   * Auto-detect applicable registries (parallel execution for performance)
   */
  async detectRegistries(): Promise<string[]> {
    // Parallel detection for better performance with multiple plugins
    const detectionPromises = Array.from(this.plugins.entries()).map(
      async ([name, plugin]) => {
        try {
          const isDetected = await plugin.detect(this.projectPath)
          return isDetected ? name : null
        } catch {
          // Ignore detection errors for individual plugins
          return null
        }
      }
    )

    const results = await Promise.all(detectionPromises)
    return results.filter((name): name is string => name !== null)
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

      // 3. Execute preBuild hooks (unless skipHooks is enabled)
      await this.executeHooksIfConfigured(
        'preBuild',
        {
          phase: 'preBuild',
          registry: registryName,
          version: 'unknown', // Version not yet determined
          packageName: 'unknown',
          environment: {}
        },
        !!effectiveOptions.skipHooks
      )

      // 4. Security scan (if enabled)
      const secretsScanningEnabled = this.config?.security?.secretsScanning?.enabled !== false
      if (secretsScanningEnabled) {
        // Configure custom ignore patterns from config
        this.secretsScanner.configure(this.config?.security?.secretsScanning)
        const scanReport = await this.secretsScanner.scanProject(
          this.projectPath,
          [],
          !effectiveOptions.nonInteractive
        )

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

      // 5. Validation
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
      const packageName = validationResult.metadata?.packageName

      // 6. Dry-run (if not skipped)
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
          packageName: String(packageName || 'unknown'),
          version: String(packageVersion || 'unknown'),
          errors,
          warnings,
          duration: Date.now() - startTime,
          state: 'DRY_RUN'
        }
      }

      // 7. Confirmation (interactive mode)
      const shouldConfirm = !effectiveOptions.nonInteractive && !options.resume && (this.config?.publish?.confirm !== false)
      if (shouldConfirm) {
        await this.stateMachine.transition('CONFIRMING')

        console.log('📋 公開前チェックリスト:')
        console.log(`  ✅ レジストリ: ${registryName}`)
        console.log(`  ✅ バージョン: ${String(packageVersion)}`)
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
            packageName: String(packageName || 'unknown'),
            version: String(packageVersion || 'unknown'),
            errors: ['User cancelled'],
            warnings,
            duration: Date.now() - startTime,
            state: 'FAILED'
          }
        }
      }

      // 8. Execute prePublish hooks (unless skipHooks is enabled)
      await this.executeHooksIfConfigured(
        'prePublish',
        {
          phase: 'prePublish',
          registry: registryName,
          version: String(packageVersion || 'unknown'),
          packageName: String(packageName || 'unknown'),
          environment: {}
        },
        !!effectiveOptions.skipHooks
      )

      // Return if hooks-only mode (skip actual publishing)
      if (effectiveOptions.hooksOnly) {
        console.log('🪝 フックのみ実行モード: 実際の公開はスキップします\n')
        return {
          success: true,
          registry: registryName,
          packageName: String(packageName || 'unknown'),
          version: String(packageVersion || 'unknown'),
          errors,
          warnings,
          duration: Date.now() - startTime,
          state: 'DRY_RUN'
        }
      }

      // 9. Publish
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

      // 10. Verify (if enabled)
      const shouldVerify = this.config?.publish?.verify !== false
      let verifyResult: VerificationResult | null = null
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

      // 11. Execute postPublish hooks (unless skipHooks is enabled)
      const postPublishResult = await this.executeHooksIfConfigured(
        'postPublish',
        {
          phase: 'postPublish',
          registry: registryName,
          version: String(packageVersion || 'unknown'),
          packageName: String(packageName || 'unknown'),
          environment: {
            VERIFICATION_URL: verifyResult?.url || ''
          }
        },
        !!effectiveOptions.skipHooks,
        false // Don't throw on failure
      )

      if (!postPublishResult.success && postPublishResult.failedHooks) {
        warnings.push(`postPublish フックが失敗: ${postPublishResult.failedHooks.join(', ')}`)
        console.warn('⚠️  postPublish フックが失敗しましたが、公開自体は成功しています')
      }

      // Success
      await this.stateMachine.transition('SUCCESS')

      return {
        success: true,
        registry: registryName,
        packageName: String(packageName || 'unknown'),
        version: String(packageVersion || 'unknown'),
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

      // Execute onError hooks (unless skipHooks is enabled)
      try {
        const onErrorResult = await this.executeHooksIfConfigured(
          'onError',
          {
            phase: 'onError',
            registry: options.registry || 'unknown',
            version: 'unknown',
            packageName: 'unknown',
            environment: {
              ERROR_MESSAGE: err.message
            }
          },
          !!options.skipHooks,
          false // Don't throw on failure
        )

        if (!onErrorResult.success) {
          console.warn('⚠️  onError フックも失敗しました')
        }
      } catch (hookError) {
        console.error('onError フック実行中にエラーが発生:', hookError)
      }

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

    // Track if any changes were made to avoid unnecessary object copy
    let hasChanges = false
    const merged: PublishOptions = {}

    // Determine dry-run behavior
    if (options.dryRun !== undefined) {
      merged.dryRun = options.dryRun
    } else if (config.publish?.dryRun) {
      merged.dryRun = config.publish.dryRun === 'always'
      hasChanges = true
    }

    // Determine interactive mode
    if (options.nonInteractive !== undefined) {
      merged.nonInteractive = options.nonInteractive
    } else if (config.publish?.interactive !== undefined) {
      merged.nonInteractive = !config.publish.interactive
      hasChanges = true
    }

    // Determine registry
    if (options.registry) {
      merged.registry = options.registry
    } else if (config.project?.defaultRegistry) {
      merged.registry = config.project.defaultRegistry
      hasChanges = true
    }

    // Only create new object if changes were made
    return hasChanges ? { ...options, ...merged } : options
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
   * Execute hooks if configured and not skipped
   * @param phase Hook phase to execute
   * @param context Hook execution context
   * @param skipHooks Whether to skip hooks
   * @param throwOnFailure Whether to throw error on hook failure (default: true)
   * @returns Hook execution result
   */
  private async executeHooksIfConfigured(
    phase: 'preBuild' | 'prePublish' | 'postPublish' | 'onError',
    context: HookContext,
    skipHooks: boolean,
    throwOnFailure: boolean = true
  ): Promise<{ success: boolean; failedHooks?: string[] }> {
    // Early return if hooks are skipped
    if (skipHooks) {
      return { success: true }
    }

    // Get hooks for this phase
    const hooks = this.config?.hooks?.[phase]
    if (!hooks || hooks.length === 0) {
      return { success: true }
    }

    // Execute hooks
    const result = await this.hookExecutor.executeHooks(hooks, context)

    // Handle failure based on throwOnFailure flag
    if (!result.success) {
      if (throwOnFailure) {
        throw ErrorFactory.create(
          'PUBLISH_FAILED',
          context.registry,
          `${phase} フックが失敗しました: ${result.failedHooks.join(', ')}`
        )
      }
      return result
    }

    return result
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
