import { ConfigLoader } from '../../src/core/ConfigLoader'
import { PublishConfig } from '../../src/core/PublishConfig'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'

jest.mock('fs/promises')
jest.mock('os')

describe('ConfigLoader', () => {
  const mockProjectPath = '/test/project'
  const mockHomeDir = '/home/user'

  beforeEach(() => {
    jest.clearAllMocks()
    ;(os.homedir as jest.Mock).mockReturnValue(mockHomeDir)
  })

  describe('load', () => {
    it('デフォルト設定を返す（設定ファイルが無い場合）', async () => {
      ;(fs.access as jest.Mock).mockRejectedValue(new Error('File not found'))

      const config = await ConfigLoader.load({
        projectPath: mockProjectPath
      })

      expect(config.version).toBe('1.0')
      expect(config.publish?.dryRun).toBe('first')
      expect(config.publish?.interactive).toBe(true)
      expect(config.security?.secretsScanning?.enabled).toBe(true)
    })

    it('プロジェクト設定を読み込む', async () => {
      const projectConfig: Partial<PublishConfig> = {
        version: '1.0',
        project: {
          defaultRegistry: 'npm'
        },
        registries: {
          npm: {
            enabled: true,
            tag: 'beta'
          }
        }
      }

      ;(fs.access as jest.Mock).mockImplementation((filePath: string) => {
        if (filePath.includes(mockProjectPath)) {
          return Promise.resolve()
        }
        return Promise.reject(new Error('File not found'))
      })

      ;(fs.readFile as jest.Mock).mockResolvedValue(
        `version: "1.0"\nproject:\n  defaultRegistry: "npm"\nregistries:\n  npm:\n    enabled: true\n    tag: "beta"`
      )

      const config = await ConfigLoader.load({
        projectPath: mockProjectPath
      })

      expect(config.project?.defaultRegistry).toBe('npm')
      expect(config.registries?.npm?.tag).toBe('beta')
    })

    it('グローバル設定を読み込む', async () => {
      ;(fs.access as jest.Mock).mockImplementation((filePath: string) => {
        if (filePath.includes(mockHomeDir)) {
          return Promise.resolve()
        }
        return Promise.reject(new Error('File not found'))
      })

      ;(fs.readFile as jest.Mock).mockResolvedValue(
        `version: "1.0"\nregistries:\n  npm:\n    tag: "latest"`
      )

      const config = await ConfigLoader.load({
        projectPath: mockProjectPath
      })

      expect(config.registries?.npm?.tag).toBe('latest')
    })

    it('環境変数設定を読み込む', async () => {
      ;(fs.access as jest.Mock).mockRejectedValue(new Error('File not found'))

      const config = await ConfigLoader.load({
        projectPath: mockProjectPath,
        env: {
          PUBLISH_REGISTRY: 'pypi',
          PUBLISH_DRY_RUN: 'always',
          PUBLISH_NON_INTERACTIVE: 'true'
        }
      })

      expect(config.project?.defaultRegistry).toBe('pypi')
      expect(config.publish?.dryRun).toBe('always')
      expect(config.publish?.interactive).toBe(false)
    })

    it('CLI引数が最高優先度', async () => {
      ;(fs.access as jest.Mock).mockImplementation((filePath: string) => {
        if (filePath.includes(mockProjectPath)) {
          return Promise.resolve()
        }
        return Promise.reject(new Error('File not found'))
      })

      ;(fs.readFile as jest.Mock).mockResolvedValue(
        `version: "1.0"\nproject:\n  defaultRegistry: "npm"`
      )

      const cliArgs: Partial<PublishConfig> = {
        project: {
          defaultRegistry: 'crates'
        }
      }

      const config = await ConfigLoader.load({
        projectPath: mockProjectPath,
        cliArgs
      })

      expect(config.project?.defaultRegistry).toBe('crates')
    })
  })

  describe('extends機能', () => {
    it('extends で基底設定を継承する', async () => {
      const baseConfigPath = '/base/.publish-config.yaml'

      ;(fs.access as jest.Mock).mockImplementation((filePath: string) => {
        if (filePath.includes(mockProjectPath) || filePath === baseConfigPath) {
          return Promise.resolve()
        }
        return Promise.reject(new Error('File not found'))
      })

      ;(fs.readFile as jest.Mock).mockImplementation((filePath: string) => {
        if (filePath === baseConfigPath) {
          return Promise.resolve(
            `version: "1.0"\nregistries:\n  npm:\n    tag: "latest"\n    access: "public"`
          )
        }
        return Promise.resolve(
          `version: "1.0"\nextends: "${baseConfigPath}"\nregistries:\n  npm:\n    tag: "beta"`
        )
      })

      const config = await ConfigLoader.load({
        projectPath: mockProjectPath
      })

      // extends先のaccessは継承、tagは上書き
      expect(config.registries?.npm?.tag).toBe('beta')
      expect(config.registries?.npm?.access).toBe('public')
    })

    it('extends が存在しないファイルを指す場合は無視', async () => {
      ;(fs.access as jest.Mock).mockImplementation((filePath: string) => {
        if (filePath.includes(mockProjectPath)) {
          return Promise.resolve()
        }
        return Promise.reject(new Error('File not found'))
      })

      ;(fs.readFile as jest.Mock).mockImplementation(() => {
        return Promise.resolve(
          `version: "1.0"\nextends: "/nonexistent/.publish-config.yaml"\nregistries:\n  npm:\n    tag: "latest"`
        )
      })

      const config = await ConfigLoader.load({
        projectPath: mockProjectPath
      })

      // extends失敗しても読み込み自体は成功
      expect(config.registries?.npm?.tag).toBe('latest')
    })

    it('extends の深いマージが正しく動作', async () => {
      const baseConfigPath = '/base/.publish-config.yaml'

      ;(fs.access as jest.Mock).mockImplementation((filePath: string) => {
        if (filePath.includes(mockProjectPath) || filePath === baseConfigPath) {
          return Promise.resolve()
        }
        return Promise.reject(new Error('File not found'))
      })

      ;(fs.readFile as jest.Mock).mockImplementation((filePath: string) => {
        if (filePath === baseConfigPath) {
          return Promise.resolve(
            `version: "1.0"\nsecurity:\n  envVarExpansion:\n    enabled: true\n    allowedPrefixes:\n      - "NPM_"`
          )
        }
        return Promise.resolve(
          `version: "1.0"\nextends: "${baseConfigPath}"\nsecurity:\n  envVarExpansion:\n    allowedPrefixes:\n      - "PUBLISH_"`
        )
      })

      const config = await ConfigLoader.load({
        projectPath: mockProjectPath
      })

      // enabledは継承、allowedPrefixesは上書き
      expect(config.security?.envVarExpansion?.enabled).toBe(true)
      expect(config.security?.envVarExpansion?.allowedPrefixes).toEqual(['PUBLISH_'])
    })
  })

  describe('expandEnvVars', () => {
    it('環境変数を展開する', async () => {
      ;(fs.access as jest.Mock).mockImplementation((filePath: string) => {
        if (filePath.includes(mockProjectPath)) {
          return Promise.resolve()
        }
        return Promise.reject(new Error('File not found'))
      })

      ;(fs.readFile as jest.Mock).mockResolvedValue(
        `version: "1.0"\nvariables:\n  NPM_TOKEN: "\${NPM_TOKEN}"`
      )

      const config = await ConfigLoader.load({
        projectPath: mockProjectPath,
        env: {
          NPM_TOKEN: 'secret-token-123'
        }
      })

      expect(config.variables?.NPM_TOKEN).toBe('secret-token-123')
    })

    it('allowedPrefixes に一致しない環境変数はスキップ', async () => {
      ;(fs.access as jest.Mock).mockImplementation((filePath: string) => {
        if (filePath.includes(mockProjectPath)) {
          return Promise.resolve()
        }
        return Promise.reject(new Error('File not found'))
      })

      ;(fs.readFile as jest.Mock).mockResolvedValue(
        `version: "1.0"\nvariables:\n  TOKEN: "\${INVALID_TOKEN}"\nsecurity:\n  envVarExpansion:\n    allowedPrefixes:\n      - "NPM_"\n      - "PUBLISH_"`
      )

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()

      const config = await ConfigLoader.load({
        projectPath: mockProjectPath,
        env: {
          INVALID_TOKEN: 'should-be-skipped'
        }
      })

      // Should not expand
      expect(config.variables?.TOKEN).toBe('${INVALID_TOKEN}')
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('INVALID_TOKEN')
      )

      consoleSpy.mockRestore()
    })

    it('forbiddenPatterns に一致する環境変数はスキップ', async () => {
      ;(fs.access as jest.Mock).mockImplementation((filePath: string) => {
        if (filePath.includes(mockProjectPath)) {
          return Promise.resolve()
        }
        return Promise.reject(new Error('File not found'))
      })

      ;(fs.readFile as jest.Mock).mockResolvedValue(
        `version: "1.0"\nvariables:\n  TOKEN: "\${SECRET_TOKEN}"\nsecurity:\n  envVarExpansion:\n    forbiddenPatterns:\n      - ".*secret.*"`
      )

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()

      const config = await ConfigLoader.load({
        projectPath: mockProjectPath,
        env: {
          SECRET_TOKEN: 'forbidden-value'
        }
      })

      // Should not expand
      expect(config.variables?.TOKEN).toBe('${SECRET_TOKEN}')
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('SECRET_TOKEN')
      )

      consoleSpy.mockRestore()
    })

    it('未定義の環境変数はスキップ', async () => {
      ;(fs.access as jest.Mock).mockImplementation((filePath: string) => {
        if (filePath.includes(mockProjectPath)) {
          return Promise.resolve()
        }
        return Promise.reject(new Error('File not found'))
      })

      ;(fs.readFile as jest.Mock).mockResolvedValue(
        `version: "1.0"\nvariables:\n  TOKEN: "\${UNDEFINED_VAR}"`
      )

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()

      const config = await ConfigLoader.load({
        projectPath: mockProjectPath,
        env: {}
      })

      expect(config.variables?.TOKEN).toBe('${UNDEFINED_VAR}')
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('UNDEFINED_VAR')
      )

      consoleSpy.mockRestore()
    })

    it('配列内の環境変数を展開する', async () => {
      ;(fs.access as jest.Mock).mockImplementation((filePath: string) => {
        if (filePath.includes(mockProjectPath)) {
          return Promise.resolve()
        }
        return Promise.reject(new Error('File not found'))
      })

      ;(fs.readFile as jest.Mock).mockResolvedValue(
        `version: "1.0"\nvariables:\n  ALLOWED_PREFIXES:\n    - "\${NPM_PREFIX}"\n    - "\${PUBLISH_PREFIX}"\nsecurity:\n  envVarExpansion:\n    allowedPrefixes:\n      - "NPM_"\n      - "PUBLISH_"`
      )

      const config = await ConfigLoader.load({
        projectPath: mockProjectPath,
        env: {
          NPM_PREFIX: 'npm-',
          PUBLISH_PREFIX: 'publish-'
        }
      })

      expect(config.variables?.ALLOWED_PREFIXES).toEqual(['npm-', 'publish-'])
    })

    it('ネストされたオブジェクト内の環境変数を展開する', async () => {
      ;(fs.access as jest.Mock).mockImplementation((filePath: string) => {
        if (filePath.includes(mockProjectPath)) {
          return Promise.resolve()
        }
        return Promise.reject(new Error('File not found'))
      })

      ;(fs.readFile as jest.Mock).mockResolvedValue(
        `version: "1.0"\nsecurity:\n  allowedCommands:\n    npm:\n      executable: "\${NPM_PATH}"\n      allowedArgs:\n        - "publish"`
      )

      const config = await ConfigLoader.load({
        projectPath: mockProjectPath,
        env: {
          NPM_PATH: '/usr/local/bin/npm'
        }
      })

      expect(config.security?.allowedCommands?.npm?.executable).toBe('/usr/local/bin/npm')
    })

    it('環境変数展開が無効の場合はスキップ', async () => {
      ;(fs.access as jest.Mock).mockImplementation((filePath: string) => {
        if (filePath.includes(mockProjectPath)) {
          return Promise.resolve()
        }
        return Promise.reject(new Error('File not found'))
      })

      ;(fs.readFile as jest.Mock).mockResolvedValue(
        `version: "1.0"\nvariables:\n  TOKEN: "\${NPM_TOKEN}"\nsecurity:\n  envVarExpansion:\n    enabled: false`
      )

      const config = await ConfigLoader.load({
        projectPath: mockProjectPath,
        env: {
          NPM_TOKEN: 'should-not-expand'
        }
      })

      expect(config.variables?.TOKEN).toBe('${NPM_TOKEN}')
    })
  })

  describe('validate', () => {
    it('有効な設定は検証に合格', () => {
      const config: Partial<PublishConfig> = {
        version: '1.0',
        registries: {
          npm: {
            tag: 'latest',
            access: 'public'
          }
        }
      }

      const result = ConfigLoader.validate(config)

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('version が無い場合はエラー', () => {
      const config: Partial<PublishConfig> = {
        registries: {}
      }

      const result = ConfigLoader.validate(config)

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.field === 'version')).toBe(true)
    })

    it('未知の version は警告', () => {
      const config: Partial<PublishConfig> = {
        version: '2.0',
        registries: {}
      }

      const result = ConfigLoader.validate(config)

      expect(result.valid).toBe(true)
      expect(result.warnings.some((w) => w.field === 'version')).toBe(true)
    })

    it('npm.access が無効な値の場合はエラー', () => {
      const config: Partial<PublishConfig> = {
        version: '1.0',
        registries: {
          npm: {
            access: 'invalid' as any
          }
        }
      }

      const result = ConfigLoader.validate(config)

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.field === 'registries.npm.access')).toBe(true)
    })

    it('pypi.repository が無効な値の場合はエラー', () => {
      const config: Partial<PublishConfig> = {
        version: '1.0',
        registries: {
          pypi: {
            repository: 'invalid' as any
          }
        }
      }

      const result = ConfigLoader.validate(config)

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.field === 'registries.pypi.repository')).toBe(
        true
      )
    })

    it('allowedCommands の executable が無い場合はエラー', () => {
      const config: Partial<PublishConfig> = {
        version: '1.0',
        registries: {},
        security: {
          allowedCommands: {
            npm: {
              allowedArgs: ['publish']
            } as any
          }
        }
      }

      const result = ConfigLoader.validate(config)

      expect(result.valid).toBe(false)
      expect(
        result.errors.some((e) => e.field === 'security.allowedCommands.npm.executable')
      ).toBe(true)
    })

    it('allowedCommands の allowedArgs が無い場合はエラー', () => {
      const config: Partial<PublishConfig> = {
        version: '1.0',
        registries: {},
        security: {
          allowedCommands: {
            npm: {
              executable: '/usr/bin/npm'
            } as any
          }
        }
      }

      const result = ConfigLoader.validate(config)

      expect(result.valid).toBe(false)
      expect(
        result.errors.some((e) => e.field === 'security.allowedCommands.npm.allowedArgs')
      ).toBe(true)
    })

    it('ignorePatterns の pathPrefix が無い場合はエラー', () => {
      const config: Partial<PublishConfig> = {
        version: '1.0',
        registries: {},
        security: {
          secretsScanning: {
            ignorePatterns: [
              {
                pattern: '*.test.ts'
              } as any
            ]
          }
        }
      }

      const result = ConfigLoader.validate(config)

      expect(result.valid).toBe(false)
      expect(
        result.errors.some((e) =>
          e.field.includes('security.secretsScanning.ignorePatterns')
        )
      ).toBe(true)
    })

    it('hooks が配列でない場合はエラー', () => {
      const config: Partial<PublishConfig> = {
        version: '1.0',
        registries: {},
        hooks: {
          preBuild: 'invalid' as any
        }
      }

      const result = ConfigLoader.validate(config)

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.field === 'hooks.preBuild')).toBe(true)
    })

    it('hook の command が無い場合はエラー', () => {
      const config: Partial<PublishConfig> = {
        version: '1.0',
        registries: {},
        hooks: {
          preBuild: [
            {
              allowedCommands: ['npm']
            } as any
          ]
        }
      }

      const result = ConfigLoader.validate(config)

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.field === 'hooks.preBuild[0].command')).toBe(true)
    })

    it('publish.dryRun が無効な値の場合はエラー', () => {
      const config: Partial<PublishConfig> = {
        version: '1.0',
        registries: {},
        publish: {
          dryRun: 'invalid' as any
        }
      }

      const result = ConfigLoader.validate(config)

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.field === 'publish.dryRun')).toBe(true)
    })

    it('カスタム検証ルールでパターンマッチング（エラー）', () => {
      const config: Partial<PublishConfig> = {
        version: '1.0',
        registries: {},
        project: {
          name: 'invalid@name'
        },
        validation: {
          rules: [
            {
              name: 'validate-package-name',
              pattern: '^[a-z0-9-]+$',
              field: 'project.name',
              severity: 'error',
              errorMessage: 'パッケージ名は小文字英数字とハイフンのみ'
            }
          ]
        }
      }

      const result = ConfigLoader.validate(config)

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.field === 'project.name')).toBe(true)
    })

    it('カスタム検証ルールでパターンマッチング（警告）', () => {
      const config: Partial<PublishConfig> = {
        version: '1.0',
        registries: {},
        project: {
          name: 'test'
        },
        validation: {
          rules: [
            {
              name: 'recommend-package-name-length',
              pattern: '^.{5,}$',
              field: 'project.name',
              severity: 'warning',
              errorMessage: 'パッケージ名は5文字以上推奨'
            }
          ]
        }
      }

      const result = ConfigLoader.validate(config)

      expect(result.valid).toBe(true)
      expect(result.warnings.some((w) => w.field === 'project.name')).toBe(true)
    })
  })

  describe('formatValidationResult', () => {
    it('成功時のフォーマット', () => {
      const result = {
        valid: true,
        errors: [],
        warnings: []
      }

      const formatted = ConfigLoader.formatValidationResult(result)

      expect(formatted).toContain('✅')
      expect(formatted).toContain('成功')
    })

    it('エラー時のフォーマット', () => {
      const result = {
        valid: false,
        errors: [
          {
            field: 'version',
            message: 'バージョンは必須です',
            expected: 'string',
            actual: 'undefined'
          }
        ],
        warnings: []
      }

      const formatted = ConfigLoader.formatValidationResult(result)

      expect(formatted).toContain('❌')
      expect(formatted).toContain('エラー')
      expect(formatted).toContain('version')
      expect(formatted).toContain('期待される型')
    })

    it('警告時のフォーマット', () => {
      const result = {
        valid: true,
        errors: [],
        warnings: [
          {
            field: 'version',
            message: '未知のバージョン',
            suggestion: 'バージョン1.0を使用してください'
          }
        ]
      }

      const formatted = ConfigLoader.formatValidationResult(result)

      expect(formatted).toContain('🟡')
      expect(formatted).toContain('警告')
      expect(formatted).toContain('version')
      expect(formatted).toContain('提案')
    })
  })
})
