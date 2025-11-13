#!/usr/bin/env node

import { Command } from 'commander'
import { PackagePublisher } from './core/PackagePublisher'
import { BatchPublisher } from './core/BatchPublisher'
import { PublishAnalytics } from './core/PublishAnalytics'
import { NPMPlugin } from './plugins/NPMPlugin'
import { CratesIOPlugin } from './plugins/CratesIOPlugin'
import { PyPIPlugin } from './plugins/PyPIPlugin'
import { HomebrewPlugin } from './plugins/HomebrewPlugin'
import chalk from 'chalk'
import fs from 'fs/promises'

const program = new Command()

program
  .name('package-publisher')
  .description('Multi-registry package publishing assistant')
  .version('0.1.0')
  .exitOverride((err) => {
    // Override commander's default exit behavior for better error handling
    if (err.code === 'commander.unknownOption') {
      // Exit with code 2 for invalid options (POSIX convention)
      process.stderr.write(err.message + '\n')
      process.exit(2)
    }
    // Allow normal help/version display
    if (err.code === 'commander.helpDisplayed' || err.code === 'commander.version') {
      process.exit(0)
    }
    // Re-throw other errors
    throw err
  })

program
  .command('publish [project-path]')
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
  .option('--skip-hooks', 'Skip all hook execution (preBuild, prePublish, postPublish, onError)')
  .option('--hooks-only', 'Execute hooks only without actual publishing (dry-run for hooks)')
  .action(async (projectPathArg, options) => {
    const projectPath = projectPathArg || process.cwd()

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
          access: options.access,
          skipHooks: options.skipHooks,
          hooksOnly: options.hooksOnly
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
          access: options.access,
          skipHooks: options.skipHooks,
          hooksOnly: options.hooksOnly
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
  .command('check [project-path]')
  .description('Check if project is ready to publish')
  .option('-r, --registry <name>', 'Specify registry to check')
  .action(async (projectPathArg, options) => {
    const projectPath = projectPathArg || process.cwd()

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
            console.log(chalk.gray(`  パッケージ名: ${String(result.metadata.packageName)}`))
            console.log(chalk.gray(`  バージョン: ${String(result.metadata.version)}`))
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

program
  .command('stats [project-path]')
  .description('Display publishing statistics')
  .option('-r, --registry <name>', 'Filter by registry (npm, pypi, crates.io)')
  .option('-p, --package <name>', 'Filter by package name')
  .option('--success-only', 'Show only successful publishes')
  .option('--failures-only', 'Show only failed publishes')
  .option('--days <number>', 'Show statistics for the last N days', '30')
  .action(async (projectPathArg, options) => {
    const projectPath = projectPathArg || process.cwd()

    try {
      console.log(chalk.bold('\n📊 Publishing Statistics\n'))

      const analytics = new PublishAnalytics(projectPath)
      await analytics.initialize()

      // Calculate date range
      const endDate = new Date()
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - parseInt(options.days, 10))

      const analyticsOptions = {
        registry: options.registry,
        packageName: options.package,
        successOnly: options.successOnly,
        failuresOnly: options.failuresOnly,
        startDate,
        endDate
      }

      const statistics = analytics.getStatistics(analyticsOptions)

      // Display overall statistics
      console.log(chalk.bold('Overall Statistics'))
      console.log(chalk.gray(`Time Range: ${statistics.timeRange.start.toLocaleDateString()} - ${statistics.timeRange.end.toLocaleDateString()}`))
      console.log()

      if (statistics.totalAttempts === 0) {
        console.log(chalk.yellow('No publishing records found.'))
        console.log(chalk.gray('\nPublish a package to start tracking statistics.\n'))
        process.exit(0)
      }

      console.log(`Total Attempts: ${chalk.bold(String(statistics.totalAttempts))}`)
      console.log(`Successful: ${chalk.green(String(statistics.successCount))}`)
      console.log(`Failed: ${chalk.red(String(statistics.failureCount))}`)
      console.log(`Success Rate: ${chalk.bold(statistics.successRate.toFixed(2) + '%')}`)
      console.log(`Average Duration: ${chalk.gray((statistics.averageDuration / 1000).toFixed(2) + 's')}`)
      console.log()

      // Display registry-specific statistics
      if (statistics.byRegistry.size > 0) {
        console.log(chalk.bold('Registry Statistics'))
        console.log()

        for (const stats of statistics.byRegistry.values()) {
          console.log(chalk.cyan(`${stats.registry}:`))
          console.log(`  Attempts: ${stats.attempts}`)
          console.log(`  Successes: ${chalk.green(String(stats.successes))}`)
          console.log(`  Failures: ${chalk.red(String(stats.failures))}`)
          console.log(`  Success Rate: ${stats.successRate.toFixed(2)}%`)
          console.log(`  Average Duration: ${(stats.averageDuration / 1000).toFixed(2)}s`)
          if (stats.lastPublish && stats.lastVersion) {
            console.log(`  Last Publish: ${stats.lastVersion} (${stats.lastPublish.toLocaleDateString()})`)
          }
          console.log()
        }
      }

      process.exit(0)
    } catch (error) {
      console.error(chalk.red.bold('\n❌ Error'))
      console.error(chalk.red((error as Error).message))
      process.exit(1)
    }
  })

program
  .command('report')
  .description('Generate publishing report')
  .option('-f, --format <type>', 'Report format (markdown|json)', 'markdown')
  .option('-o, --output <path>', 'Output file path (default: stdout)')
  .option('-r, --registry <name>', 'Filter by registry')
  .option('-p, --package <name>', 'Filter by package name')
  .option('-l, --limit <number>', 'Limit recent publishes (default: 10)', '10')
  .option('--days <number>', 'Show statistics for the last N days', '30')
  .action(async (options) => {
    const projectPath = process.cwd()

    try {
      console.log(chalk.bold('\n📝 Generating Report...\n'))

      const analytics = new PublishAnalytics(projectPath)
      await analytics.initialize()

      // Calculate date range
      const endDate = new Date()
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - parseInt(options.days, 10))

      const analyticsOptions = {
        registry: options.registry,
        packageName: options.package,
        limit: parseInt(options.limit, 10),
        startDate,
        endDate
      }

      const report = await analytics.generateReport(analyticsOptions)

      // Get report content based on format
      const content = options.format === 'json' ? report.jsonData : report.markdownSummary

      // Output to file or stdout
      if (options.output) {
        await fs.writeFile(options.output, content, 'utf-8')
        console.log(chalk.green(`✅ Report saved to: ${options.output}`))
      } else {
        console.log(content)
      }

      console.log()
      process.exit(0)
    } catch (error) {
      console.error(chalk.red.bold('\n❌ Error'))
      console.error(chalk.red((error as Error).message))
      process.exit(1)
    }
  })

program.parse()
