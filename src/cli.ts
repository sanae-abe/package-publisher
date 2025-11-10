#!/usr/bin/env node

import { Command } from 'commander'
import { PackagePublisher } from './core/PackagePublisher'
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

      const publisher = new PackagePublisher(projectPath)

      // Register all plugins
      publisher.registerPlugin(new NPMPlugin(projectPath))
      publisher.registerPlugin(new CratesIOPlugin(projectPath))
      publisher.registerPlugin(new PyPIPlugin(projectPath))
      publisher.registerPlugin(new HomebrewPlugin(projectPath))

      // Load configuration (CLI args take priority)
      const cliArgs: any = {}
      if (options.registry) {
        cliArgs.project = { defaultRegistry: options.registry }
      }
      if (options.dryRunOnly !== undefined) {
        cliArgs.publish = { dryRun: options.dryRunOnly ? 'always' : 'never' }
      }
      if (options.nonInteractive !== undefined) {
        cliArgs.publish = { ...cliArgs.publish, interactive: !options.nonInteractive }
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
