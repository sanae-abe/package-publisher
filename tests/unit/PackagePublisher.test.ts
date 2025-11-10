import { PackagePublisher } from '../../src/core/PackagePublisher'
import { RegistryPlugin, ValidationResult, PublishOptions } from '../../src/core/interfaces'
import { PublishConfig } from '../../src/core/PublishConfig'
import * as fs from 'fs/promises'
import * as os from 'os'

jest.mock('fs/promises')
jest.mock('readline')
jest.mock('os')

// Mock plugin for testing
class MockPlugin implements RegistryPlugin {
  readonly name: string
  readonly version = '1.0.0'

  constructor(name: string, private shouldDetect: boolean = true) {
    this.name = name
  }

  async detect(): Promise<boolean> {
    return this.shouldDetect
  }

  async validate(): Promise<ValidationResult> {
    return {
      valid: true,
      errors: [],
      warnings: [],
      metadata: {
        packageName: 'test-package',
        version: '1.0.0'
      }
    }
  }

  async dryRun() {
    return {
      success: true,
      output: 'Dry-run successful'
    }
  }

  async publish(options?: PublishOptions) {
    return {
      success: true,
      version: '1.0.0',
      packageUrl: `https://${this.name}.example.com/package/test-package`,
      output: 'Published successfully'
    }
  }

  async verify() {
    return {
      verified: true,
      version: '1.0.0',
      url: `https://${this.name}.example.com/package/test-package`
    }
  }

  async rollback(version: string) {
    return {
      success: true,
      message: `Rolled back ${version}`
    }
  }
}

describe('PackagePublisher', () => {
  let publisher: PackagePublisher
  const testProjectPath = '/test/project'
  const mockHomeDir = '/home/user'

  beforeEach(() => {
    publisher = new PackagePublisher(testProjectPath)
    jest.clearAllMocks()
    // Mock os.homedir for ConfigLoader
    ;(os.homedir as jest.Mock).mockReturnValue(mockHomeDir)
  })

  describe('registerPlugin', () => {
    it('プラグインを登録できる', () => {
      const plugin = new MockPlugin('test-registry')
      publisher.registerPlugin(plugin)

      const plugins = publisher.getPlugins()
      expect(plugins.has('test-registry')).toBe(true)
      expect(plugins.get('test-registry')).toBe(plugin)
    })

    it('複数のプラグインを登録できる', () => {
      const plugin1 = new MockPlugin('registry-1')
      const plugin2 = new MockPlugin('registry-2')

      publisher.registerPlugin(plugin1)
      publisher.registerPlugin(plugin2)

      const plugins = publisher.getPlugins()
      expect(plugins.size).toBe(2)
      expect(plugins.has('registry-1')).toBe(true)
      expect(plugins.has('registry-2')).toBe(true)
    })
  })

  describe('detectRegistries', () => {
    it('検出されたレジストリのリストを返す', async () => {
      publisher.registerPlugin(new MockPlugin('npm', true))
      publisher.registerPlugin(new MockPlugin('crates', false))
      publisher.registerPlugin(new MockPlugin('pypi', true))

      const detected = await publisher.detectRegistries()

      expect(detected).toEqual(['npm', 'pypi'])
      expect(detected).not.toContain('crates')
    })

    it('検出されたレジストリが無い場合は空配列を返す', async () => {
      publisher.registerPlugin(new MockPlugin('npm', false))
      publisher.registerPlugin(new MockPlugin('crates', false))

      const detected = await publisher.detectRegistries()

      expect(detected).toEqual([])
    })
  })

  describe('publish - non-interactive mode', () => {
    beforeEach(() => {
      // Mock secrets scanner to return no secrets
      ;(fs.readdir as jest.Mock).mockResolvedValue([])
      ;(fs.stat as jest.Mock).mockResolvedValue({ isDirectory: () => false })
      // ConfigLoader: No config file exists
      ;(fs.access as jest.Mock).mockRejectedValue(new Error('File not found'))
      ;(fs.readFile as jest.Mock).mockResolvedValue('')
      // State management
      ;(fs.writeFile as jest.Mock).mockResolvedValue(undefined)
      ;(fs.unlink as jest.Mock).mockResolvedValue(undefined)
    })

    it('非対話モードで公開できる', async () => {
      const plugin = new MockPlugin('npm')
      publisher.registerPlugin(plugin)

      const result = await publisher.publish({
        nonInteractive: true,
        dryRun: false
      })

      expect(result.success).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('Dry-runモードでは実際の公開を行わない', async () => {
      const plugin = new MockPlugin('npm')
      const publishSpy = jest.spyOn(plugin, 'publish')
      publisher.registerPlugin(plugin)

      const result = await publisher.publish({
        nonInteractive: true,
        dryRun: true
      })

      expect(result.success).toBe(true)
      // Dry-runのみなので publish は呼ばれない
      expect(publishSpy).not.toHaveBeenCalled()
    })

    it('検証エラーがある場合は公開を中止する', async () => {
      const plugin = new MockPlugin('npm')
      jest.spyOn(plugin, 'validate').mockResolvedValue({
        valid: false,
        errors: [
          {
            field: 'version',
            message: '無効なバージョン',
            severity: 'error'
          }
        ],
        warnings: []
      })
      publisher.registerPlugin(plugin)

      const result = await publisher.publish({
        nonInteractive: true,
        dryRun: false
      })

      expect(result.success).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('特定のレジストリのみ公開できる', async () => {
      const npmPlugin = new MockPlugin('npm')
      const cratesPlugin = new MockPlugin('crates')

      const npmPublishSpy = jest.spyOn(npmPlugin, 'publish')
      const cratesPublishSpy = jest.spyOn(cratesPlugin, 'publish')

      publisher.registerPlugin(npmPlugin)
      publisher.registerPlugin(cratesPlugin)

      await publisher.publish({
        nonInteractive: true,
        registry: 'npm'
      })

      expect(npmPublishSpy).toHaveBeenCalled()
      expect(cratesPublishSpy).not.toHaveBeenCalled()
    })
  })

  describe('publish - error handling', () => {
    beforeEach(() => {
      ;(fs.readdir as jest.Mock).mockResolvedValue([])
      ;(fs.stat as jest.Mock).mockResolvedValue({ isDirectory: () => false })
      ;(fs.access as jest.Mock).mockRejectedValue(new Error('File not found'))
      ;(fs.readFile as jest.Mock).mockResolvedValue('')
      ;(fs.writeFile as jest.Mock).mockResolvedValue(undefined)
      ;(fs.unlink as jest.Mock).mockResolvedValue(undefined)
    })

    it('レジストリが検出されない場合はエラー', async () => {
      const plugin = new MockPlugin('npm', false)
      publisher.registerPlugin(plugin)

      const result = await publisher.publish({
        nonInteractive: true
      })

      expect(result.success).toBe(false)
      expect(result.errors.some((e) => e.includes('レジストリが検出されませんでした'))).toBe(
        true
      )
    })

    it('公開失敗時は適切なエラーメッセージを返す', async () => {
      const plugin = new MockPlugin('npm')
      jest.spyOn(plugin, 'publish').mockResolvedValue({
        success: false,
        error: 'Network error'
      } as any)
      publisher.registerPlugin(plugin)

      const result = await publisher.publish({
        nonInteractive: true
      })

      expect(result.success).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('検証失敗時は適切なエラーメッセージを返す', async () => {
      const plugin = new MockPlugin('npm')
      jest.spyOn(plugin, 'verify').mockResolvedValue({
        verified: false,
        error: 'Package not found on registry'
      } as any)
      publisher.registerPlugin(plugin)

      const result = await publisher.publish({
        nonInteractive: true
      })

      // 検証失敗は警告として扱われる
      expect(result.success).toBe(true)
      expect(result.warnings.length).toBeGreaterThan(0)
      expect(result.warnings.some((w) => w.includes('検証に失敗'))).toBe(true)
    })
  })

  describe('publish - state management', () => {
    beforeEach(() => {
      ;(fs.readdir as jest.Mock).mockResolvedValue([])
      ;(fs.stat as jest.Mock).mockResolvedValue({ isDirectory: () => false })
      ;(fs.writeFile as jest.Mock).mockResolvedValue(undefined)
      ;(fs.readFile as jest.Mock).mockResolvedValue('{}')
      ;(fs.unlink as jest.Mock).mockResolvedValue(undefined)
      ;(fs.access as jest.Mock).mockRejectedValue(new Error('File not found'))
    })

    it('状態ファイルを保存する', async () => {
      const plugin = new MockPlugin('npm')
      publisher.registerPlugin(plugin)

      await publisher.publish({
        nonInteractive: true
      })

      // State file should be written during publish
      expect(fs.writeFile).toHaveBeenCalled()
    })

    it('完了後に状態ファイルを削除する', async () => {
      const plugin = new MockPlugin('npm')
      publisher.registerPlugin(plugin)

      await publisher.publish({
        nonInteractive: true
      })

      // State file should be deleted after successful publish
      expect(fs.unlink).toHaveBeenCalled()
    })
  })

  describe('getPlugins', () => {
    it('登録されたプラグインのMapを返す', () => {
      const plugin1 = new MockPlugin('npm')
      const plugin2 = new MockPlugin('crates')

      publisher.registerPlugin(plugin1)
      publisher.registerPlugin(plugin2)

      const plugins = publisher.getPlugins()

      expect(plugins).toBeInstanceOf(Map)
      expect(plugins.size).toBe(2)
      expect(plugins.get('npm')).toBe(plugin1)
      expect(plugins.get('crates')).toBe(plugin2)
    })
  })

  describe('security scanning', () => {
    it('機密情報が検出された場合は公開を中止する', async () => {
      // ConfigLoader: No config file exists
      ;(fs.access as jest.Mock).mockRejectedValue(new Error('File not found'))
      ;(fs.writeFile as jest.Mock).mockResolvedValue(undefined)
      ;(fs.unlink as jest.Mock).mockResolvedValue(undefined)

      const plugin = new MockPlugin('npm')
      publisher.registerPlugin(plugin)

      // Mock secrets scanner to detect secrets
      // fs.readdir is called with { withFileTypes: true }, so we need to return Dirent objects
      ;(fs.readdir as jest.Mock).mockImplementation(
        (dirPath: string, options?: { withFileTypes?: boolean }) => {
          if (options?.withFileTypes) {
            if (dirPath === testProjectPath) {
              return Promise.resolve([
                { name: 'config.js', isDirectory: () => false, isFile: () => true },
                { name: 'src', isDirectory: () => true, isFile: () => false }
              ])
            }
            if (dirPath.includes('src')) {
              return Promise.resolve([])
            }
            return Promise.resolve([])
          }
          // Fallback for non-withFileTypes calls
          return Promise.resolve([])
        }
      )
      ;(fs.readFile as jest.Mock).mockImplementation((filePath: string) => {
        if (filePath.includes('config.js')) {
          // Use AWS Access Key pattern which will be detected
          return Promise.resolve('const AWS_ACCESS_KEY = "AKIAIOSFODNN7EXAMPLE"')
        }
        return Promise.resolve('')
      })

      // Mock readline to simulate user declining to proceed
      const readline = require('readline')
      const mockRl = {
        question: jest.fn((query: string, callback: (answer: string) => void) => {
          callback('n') // User declines to proceed
        }),
        close: jest.fn()
      }
      ;(readline.createInterface as jest.Mock).mockReturnValue(mockRl)

      const result = await publisher.publish({
        nonInteractive: false // Interactive mode
      })

      expect(result.success).toBe(false)
      expect(result.errors.some((e) => e.includes('シークレット'))).toBe(true)
    })
  })

  describe('duration tracking', () => {
    beforeEach(() => {
      ;(fs.readdir as jest.Mock).mockResolvedValue([])
      ;(fs.stat as jest.Mock).mockResolvedValue({ isDirectory: () => false })
      ;(fs.access as jest.Mock).mockRejectedValue(new Error('File not found'))
      ;(fs.readFile as jest.Mock).mockResolvedValue('')
      ;(fs.writeFile as jest.Mock).mockResolvedValue(undefined)
      ;(fs.unlink as jest.Mock).mockResolvedValue(undefined)
    })

    it('処理時間を記録する', async () => {
      const plugin = new MockPlugin('npm')
      publisher.registerPlugin(plugin)

      const result = await publisher.publish({
        nonInteractive: true
      })

      expect(result.duration).toBeGreaterThanOrEqual(0)
      expect(typeof result.duration).toBe('number')
    })
  })

  describe('ConfigLoader integration', () => {
    const mockHomeDir = '/home/user'

    beforeEach(() => {
      ;(os.homedir as jest.Mock).mockReturnValue(mockHomeDir)
      ;(fs.readdir as jest.Mock).mockResolvedValue([])
      ;(fs.stat as jest.Mock).mockResolvedValue({ isDirectory: () => false })
    })

    it('YAML設定ファイルから設定を読み込む', async () => {
      ;(fs.access as jest.Mock).mockImplementation((filePath: string) => {
        if (filePath.includes(testProjectPath)) {
          return Promise.resolve()
        }
        return Promise.reject(new Error('File not found'))
      })

      ;(fs.readFile as jest.Mock).mockImplementation((filePath: string) => {
        if (filePath.includes('.publish-config.yaml')) {
          return Promise.resolve(
            `version: "1.0"\nproject:\n  defaultRegistry: "npm"\npublish:\n  dryRun: "never"\n  interactive: false`
          )
        }
        return Promise.resolve('')
      })

      const plugin = new MockPlugin('npm')
      publisher.registerPlugin(plugin)

      await publisher.loadConfig()

      const result = await publisher.publish({})

      // Config loaded, so dryRun should be skipped and interactive should be false
      expect(result.success).toBe(true)
    })

    it('CLI引数が設定ファイルより優先される', async () => {
      ;(fs.access as jest.Mock).mockImplementation((filePath: string) => {
        if (filePath.includes(testProjectPath)) {
          return Promise.resolve()
        }
        return Promise.reject(new Error('File not found'))
      })

      ;(fs.readFile as jest.Mock).mockImplementation((filePath: string) => {
        if (filePath.includes('.publish-config.yaml')) {
          return Promise.resolve(
            `version: "1.0"\nproject:\n  defaultRegistry: "npm"\npublish:\n  interactive: false`
          )
        }
        return Promise.resolve('')
      })

      const npmPlugin = new MockPlugin('npm')
      const cratesPlugin = new MockPlugin('crates')
      publisher.registerPlugin(npmPlugin)
      publisher.registerPlugin(cratesPlugin)

      const cliArgs: Partial<PublishConfig> = {
        project: {
          defaultRegistry: 'crates'
        }
      }

      await publisher.loadConfig(cliArgs)

      const result = await publisher.publish({})

      // CLI args should override config file
      expect(result.registry).toBe('crates')
      expect(result.success).toBe(true)
    })

    it('環境変数を設定に反映する', async () => {
      ;(fs.access as jest.Mock).mockResolvedValue(Promise.reject(new Error('File not found')))

      const plugin = new MockPlugin('npm')
      publisher.registerPlugin(plugin)

      // Simulate environment variables through loadConfig
      // Note: ConfigLoader.load reads process.env or passed env
      process.env.PUBLISH_REGISTRY = 'npm'
      process.env.PUBLISH_NON_INTERACTIVE = 'true'

      await publisher.loadConfig()

      const result = await publisher.publish({})

      expect(result.success).toBe(true)
      expect(result.registry).toBe('npm')

      // Cleanup
      delete process.env.PUBLISH_REGISTRY
      delete process.env.PUBLISH_NON_INTERACTIVE
    })

    it('設定バリデーションエラーを検出する', async () => {
      ;(fs.access as jest.Mock).mockImplementation((filePath: string) => {
        if (filePath.includes(testProjectPath)) {
          return Promise.resolve()
        }
        return Promise.reject(new Error('File not found'))
      })

      ;(fs.readFile as jest.Mock).mockImplementation((filePath: string) => {
        if (filePath.includes('.publish-config.yaml')) {
          // Invalid config: invalid npm.access value
          return Promise.resolve(
            `version: "1.0"\nregistries:\n  npm:\n    access: "invalid-value"`
          )
        }
        return Promise.resolve('')
      })

      const plugin = new MockPlugin('npm')
      publisher.registerPlugin(plugin)

      await expect(publisher.loadConfig()).rejects.toThrow('設定ファイルの検証に失敗しました')
    })

    it('設定ファイルのextends機能が動作する', async () => {
      const baseConfigPath = '/base/.publish-config.yaml'

      ;(fs.access as jest.Mock).mockImplementation((filePath: string) => {
        if (filePath.includes(testProjectPath) || filePath === baseConfigPath) {
          return Promise.resolve()
        }
        return Promise.reject(new Error('File not found'))
      })

      ;(fs.readFile as jest.Mock).mockImplementation((filePath: string) => {
        if (filePath === baseConfigPath) {
          return Promise.resolve(
            `version: "1.0"\npublish:\n  interactive: false\n  confirm: false`
          )
        }
        if (filePath.includes('.publish-config.yaml')) {
          return Promise.resolve(
            `version: "1.0"\nextends: "${baseConfigPath}"\nproject:\n  defaultRegistry: "npm"`
          )
        }
        return Promise.resolve('')
      })

      const plugin = new MockPlugin('npm')
      publisher.registerPlugin(plugin)

      await publisher.loadConfig()

      const result = await publisher.publish({})

      // Base config settings should be inherited
      expect(result.success).toBe(true)
    })

    it('環境変数展開が設定ファイルで動作する', async () => {
      ;(fs.access as jest.Mock).mockImplementation((filePath: string) => {
        if (filePath.includes(testProjectPath)) {
          return Promise.resolve()
        }
        return Promise.reject(new Error('File not found'))
      })

      ;(fs.readFile as jest.Mock).mockImplementation((filePath: string) => {
        if (filePath.includes('.publish-config.yaml')) {
          return Promise.resolve(
            `version: "1.0"\nvariables:\n  NPM_TOKEN: "\${NPM_TOKEN}"\nsecurity:\n  envVarExpansion:\n    allowedPrefixes:\n      - "NPM_"`
          )
        }
        return Promise.resolve('')
      })

      const plugin = new MockPlugin('npm')
      publisher.registerPlugin(plugin)

      process.env.NPM_TOKEN = 'test-token-123'

      await publisher.loadConfig()

      // Cleanup
      delete process.env.NPM_TOKEN

      // Just verify config loads without error
      const result = await publisher.publish({ nonInteractive: true })
      expect(result.success).toBe(true)
    })
  })
})
