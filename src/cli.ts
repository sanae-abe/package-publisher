#!/usr/bin/env node

import { Command } from 'commander'
import { PackagePublisher } from './core/PackagePublisher'
import { BatchPublisher } from './core/BatchPublisher'
import { NPMPlugin } from './plugins/NPMPlugin'
import { CratesIOPlugin } from './plugins/CratesIOPlugin'
import { PyPIPlugin } from './plugins/PyPIPlugin'
import { HomebrewPlugin } from './plugins/HomebrewPlugin'
import chalk from 'chalk'

const program = new Command()

program
  .name('package-publisher')
  .description('Multi-registry package publishing assistant')
  .version('0.1.0')

program
  .command('publish')
  .description('Publish package to registry')
  .option('-r, --registry <name>', 'Specify registry (npm, crates.io, pypi, homebrew)')
  .option('--registries <list>', 'Comma-separated list of registries for batch publishing (e.g., npm,pypi,crates.io)')
  .option('--sequential', 'Publish to registries sequentially instead of in parallel (batch mode only)')
  .option('--max-concurrency <number>', 'Maximum concurrent publishes (default: 3, batch mode only)', '3')
  .option('--continue-on-error', 'Continue publishing even if one registry fails (batch mode only)')
  .option('--dry-run-only', 'Only perform dry-run without actual publishing')
  .option('--non-interactive', 'Run in non-interactive mode (CI/CD)')
  .option('--resume', 'Resume from previous state')
  .option('--otp <code>', '2FA one-time password (npm)')
  .option('--tag <name>', 'Publish with tag (default: latest)')
  .option('--access <level>', 'Access level for scoped packages (public|restricted)')
  .option('-c, --config <path>', 'Custom configuration file path')
  .action(async (options) => {
    const projectPath = process.cwd()

    try {
      console.log(chalk.bold('\n📦 package-publisher\n'))

      // Check for batch mode
      const isBatchMode = !!options.registries

      if (isBatchMode) {
        // Batch publishing mode
        const registries = options.registries.split(',').map((r: string) => r.trim())

        console.log(chalk.blue(`バッチ公開モード: ${registries.length}個のレジストリに公開します`))
        console.log(chalk.gray(`レジストリ: ${registries.join(', ')}\n`))

        const batchPublisher = new BatchPublisher(projectPath)

        const publishOptions = {
          dryRun: options.dryRunOnly,
          nonInteractive: options.nonInteractive,
          resume: options.resume,
          otp: options.otp,
          tag: options.tag,
          access: options.access
        }

        const batchOptions = {
          sequential: options.sequential,
          continueOnError: options.continueOnError,
          maxConcurrency: parseInt(options.maxConcurrency, 10),
          publishOptions
        }

        const result = await batchPublisher.publishToMultiple(registries, batchOptions)

        // Display results
        console.log()
        if (result.success) {
          console.log(chalk.green.bold('✅ すべて成功！'))
          console.log(chalk.green(`${result.succeeded.length}個のレジストリに公開しました\n`))
          process.exit(0)
        } else {
          console.log(chalk.red.bold('❌ 一部または全部が失敗しました'))
          console.log(chalk.yellow(`成功: ${result.succeeded.length}個`))
          console.log(chalk.red(`失敗: ${result.failed.size}個`))
          console.log(chalk.gray(`スキップ: ${result.skipped.length}個\n`))
          process.exit(1)
        }
      } else {
        // Single registry mode (backward compatible)
        const publisher = new PackagePublisher(projectPath)

        // Register all plugins
        publisher.registerPlugin(new NPMPlugin(projectPath))
        publisher.registerPlugin(new CratesIOPlugin(projectPath))
        publisher.registerPlugin(new PyPIPlugin(projectPath))
        publisher.registerPlugin(new HomebrewPlugin(projectPath))

        // Load configuration (CLI args take priority)
        const cliArgs: Record<string, unknown> = {}
        if (options.registry) {
          cliArgs.project = { defaultRegistry: options.registry }
        }
        if (options.dryRunOnly !== undefined) {
          cliArgs.publish = { dryRun: options.dryRunOnly ? 'always' : 'never' }
        }
        if (options.nonInteractive !== undefined) {
          cliArgs.publish = { ...cliArgs.publish as Record<string, unknown>, interactive: !options.nonInteractive }
        }

        await publisher.loadConfig(cliArgs)

        const publishOptions = {
          registry: options.registry,
          dryRun: options.dryRunOnly,
          nonInteractive: options.nonInteractive,
          resume: options.resume,
          otp: options.otp,
          tag: options.tag,
          access: options.access
        }

        const result = await publisher.publish(publishOptions)

        if (result.success) {
          console.log(chalk.green.bold('\n✅ 成功！'))
          console.log(
            chalk.green(`パッケージ ${result.packageName}@${result.version} を公開しました`)
          )
          if (result.verificationUrl) {
            console.log(chalk.blue(`URL: ${result.verificationUrl}`))
          }
          console.log(chalk.gray(`処理時間: ${(result.duration / 1000).toFixed(2)}秒\n`))

          if (result.warnings.length > 0) {
            console.log(chalk.yellow('⚠️  警告:'))
            for (const warning of result.warnings) {
              console.log(chalk.yellow(`  - ${warning}`))
            }
          }

          process.exit(0)
        } else {
          console.error(chalk.red.bold('\n❌ 失敗'))
          console.error(chalk.red(`パッケージの公開に失敗しました\n`))

          if (result.errors.length > 0) {
            console.error(chalk.red('エラー:'))
            for (const error of result.errors) {
              console.error(chalk.red(`  - ${error}`))
            }
          }

          console.log(chalk.gray(`\n処理時間: ${(result.duration / 1000).toFixed(2)}秒\n`))

          process.exit(1)
        }
      }
    } catch (error) {
      console.error(chalk.red.bold('\n❌ エラー'))
      console.error(chalk.red((error as Error).message))
      console.error(chalk.gray('\nスタックトレース:'))
      console.error(chalk.gray((error as Error).stack))
      process.exit(1)
    }
  })

program
  .command('check')
  .description('Check if project is ready to publish')
  .option('-r, --registry <name>', 'Specify registry to check')
  .action(async (options) => {
    const projectPath = process.cwd()

    try {
      console.log(chalk.bold('\n🔍 パッケージチェック\n'))

      const publisher = new PackagePublisher(projectPath)

      // Register all plugins
      publisher.registerPlugin(new NPMPlugin(projectPath))
      publisher.registerPlugin(new CratesIOPlugin(projectPath))
      publisher.registerPlugin(new PyPIPlugin(projectPath))
      publisher.registerPlugin(new HomebrewPlugin(projectPath))

      const detected = await publisher.detectRegistries()

      if (detected.length === 0) {
        console.log(chalk.yellow('⚠️  対応するレジストリが検出されませんでした'))
        process.exit(1)
      }

      console.log(chalk.green(`検出されたレジストリ: ${detected.join(', ')}\n`))

      // Check each detected registry
      for (const registryName of detected) {
        if (options.registry && registryName !== options.registry) {
          continue
        }

        console.log(chalk.bold(`\n📦 ${registryName}:`))

        const plugin = publisher.getPlugins().get(registryName)
        if (!plugin) continue

        try {
          const result = await plugin.validate()

          if (result.valid) {
            console.log(chalk.green('  ✅ 検証成功'))
          } else {
            console.log(chalk.red('  ❌ 検証失敗'))
            for (const error of result.errors) {
              console.log(chalk.red(`    - [${error.field}] ${error.message}`))
            }
          }

          if (result.warnings.length > 0) {
            console.log(chalk.yellow('  ⚠️  警告:'))
            for (const warning of result.warnings) {
              console.log(chalk.yellow(`    - [${warning.field}] ${warning.message}`))
            }
          }

          if (result.metadata) {
            console.log(chalk.gray(`  パッケージ名: ${result.metadata.packageName}`))
            console.log(chalk.gray(`  バージョン: ${result.metadata.version}`))
          }
        } catch (error) {
          console.error(chalk.red(`  ❌ エラー: ${(error as Error).message}`))
        }
      }

      console.log()
      process.exit(0)
    } catch (error) {
      console.error(chalk.red.bold('\n❌ エラー'))
      console.error(chalk.red((error as Error).message))
      process.exit(1)
    }
  })

program.parse()
