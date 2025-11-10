import { NPMPlugin } from '../../src/plugins/NPMPlugin'
import { SafeCommandExecutor } from '../../src/security/SafeCommandExecutor'
import * as fs from 'fs/promises'
import * as path from 'path'

jest.mock('../../src/security/SafeCommandExecutor')
jest.mock('fs/promises')

// Mock global fetch
global.fetch = jest.fn() as jest.Mock

describe('NPMPlugin', () => {
  let plugin: NPMPlugin
  let mockExecutor: jest.Mocked<SafeCommandExecutor>
  const testProjectPath = '/test/project'

  beforeEach(() => {
    mockExecutor = new SafeCommandExecutor() as jest.Mocked<SafeCommandExecutor>
    plugin = new NPMPlugin(testProjectPath, mockExecutor)
    jest.clearAllMocks()
  })

  describe('detect', () => {
    it('package.jsonが存在する場合はtrueを返す', async () => {
      ;(fs.access as jest.Mock).mockResolvedValue(undefined)

      const result = await plugin.detect(testProjectPath)

      expect(result).toBe(true)
      expect(fs.access).toHaveBeenCalledWith(
        path.join(testProjectPath, 'package.json'),
        expect.any(Number)
      )
    })

    it('package.jsonが存在しない場合はfalseを返す', async () => {
      ;(fs.access as jest.Mock).mockRejectedValue(new Error('ENOENT'))

      const result = await plugin.detect(testProjectPath)

      expect(result).toBe(false)
    })
  })

  describe('validate', () => {
    const validPackageJson = {
      name: 'my-package',
      version: '1.0.0',
      description: 'A test package',
      license: 'MIT',
      main: 'index.js',
      scripts: {
        test: 'jest',
        build: 'tsc',
        lint: 'eslint .'
      }
    }

    beforeEach(() => {
      ;(fs.readFile as jest.Mock).mockResolvedValue(
        JSON.stringify(validPackageJson)
      )
    })

    it('有効なpackage.jsonの場合は検証成功', async () => {
      mockExecutor.execSafe
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // npm audit
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // npm run build
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // npm test
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // npm run lint

      const result = await plugin.validate()

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
      expect(result.warnings).toHaveLength(0)
    })

    describe('必須フィールド検証', () => {
      it('nameが無い場合はエラー', async () => {
        const invalidPackageJson = { ...validPackageJson }
        delete (invalidPackageJson as any).name
        ;(fs.readFile as jest.Mock).mockResolvedValue(
          JSON.stringify(invalidPackageJson)
        )

        const result = await plugin.validate()

        expect(result.valid).toBe(false)
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            field: 'name',
            message: expect.stringContaining('必須')
          })
        )
      })

      it('versionが無い場合はエラー', async () => {
        const invalidPackageJson = { ...validPackageJson }
        delete (invalidPackageJson as any).version
        ;(fs.readFile as jest.Mock).mockResolvedValue(
          JSON.stringify(invalidPackageJson)
        )

        const result = await plugin.validate()

        expect(result.valid).toBe(false)
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            field: 'version',
            message: expect.stringContaining('必須')
          })
        )
      })

      it('licenseが無い場合は警告', async () => {
        const packageJsonWithoutLicense = { ...validPackageJson }
        delete (packageJsonWithoutLicense as any).license
        ;(fs.readFile as jest.Mock).mockResolvedValue(
          JSON.stringify(packageJsonWithoutLicense)
        )

        mockExecutor.execSafe
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })

        const result = await plugin.validate()

        expect(result.valid).toBe(true) // 警告のみなので有効
        expect(result.warnings).toContainEqual(
          expect.objectContaining({
            field: 'license',
            message: expect.stringContaining('推奨')
          })
        )
      })
    })

    describe('npm命名規則検証', () => {
      it('214文字を超える名前はエラー', async () => {
        const longName = 'a'.repeat(215)
        const invalidPackageJson = { ...validPackageJson, name: longName }
        ;(fs.readFile as jest.Mock).mockResolvedValue(
          JSON.stringify(invalidPackageJson)
        )

        const result = await plugin.validate()

        expect(result.valid).toBe(false)
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            field: 'name',
            message: expect.stringContaining('214文字以内')
          })
        )
      })

      it('大文字を含む名前はエラー', async () => {
        const invalidPackageJson = { ...validPackageJson, name: 'MyPackage' }
        ;(fs.readFile as jest.Mock).mockResolvedValue(
          JSON.stringify(invalidPackageJson)
        )

        const result = await plugin.validate()

        expect(result.valid).toBe(false)
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            field: 'name',
            message: expect.stringContaining('小文字')
          })
        )
      })

      it('URL安全でない文字を含む名前はエラー', async () => {
        const invalidPackageJson = { ...validPackageJson, name: 'my package!' }
        ;(fs.readFile as jest.Mock).mockResolvedValue(
          JSON.stringify(invalidPackageJson)
        )

        const result = await plugin.validate()

        expect(result.valid).toBe(false)
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            field: 'name',
            message: expect.stringContaining('URL安全')
          })
        )
      })

      it('スコープ付きパッケージ名は有効', async () => {
        const scopedPackageJson = { ...validPackageJson, name: '@myorg/my-package' }
        ;(fs.readFile as jest.Mock).mockResolvedValue(
          JSON.stringify(scopedPackageJson)
        )

        mockExecutor.execSafe
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })

        const result = await plugin.validate()

        expect(result.valid).toBe(true)
        expect(result.errors).toHaveLength(0)
      })
    })

    describe('SemVer検証', () => {
      it('無効なセマンティックバージョンはエラー', async () => {
        const invalidPackageJson = { ...validPackageJson, version: '1.0' }
        ;(fs.readFile as jest.Mock).mockResolvedValue(
          JSON.stringify(invalidPackageJson)
        )

        const result = await plugin.validate()

        expect(result.valid).toBe(false)
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            field: 'version',
            message: expect.stringContaining('SemVer')
          })
        )
      })

      it('プレリリース版は有効', async () => {
        const preReleasePackageJson = { ...validPackageJson, version: '1.0.0-beta.1' }
        ;(fs.readFile as jest.Mock).mockResolvedValue(
          JSON.stringify(preReleasePackageJson)
        )

        mockExecutor.execSafe
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })

        const result = await plugin.validate()

        expect(result.valid).toBe(true)
        expect(result.errors).toHaveLength(0)
      })
    })

    describe('npm auditチェック', () => {
      it('npm auditで脆弱性が見つかった場合は警告', async () => {
        mockExecutor.execSafe
          .mockResolvedValueOnce({
            stdout: JSON.stringify({
              vulnerabilities: { high: 2, moderate: 5 }
            }),
            stderr: '',
            exitCode: 1
          })
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })

        const result = await plugin.validate()

        expect(result.valid).toBe(true) // 警告のみ
        expect(result.warnings).toContainEqual(
          expect.objectContaining({
            field: 'dependencies',
            message: expect.stringContaining('脆弱性')
          })
        )
      })
    })

    describe('ビルド・テスト・Lint', () => {
      it('buildスクリプトが失敗した場合はエラー', async () => {
        mockExecutor.execSafe
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // npm audit
          .mockRejectedValueOnce(new Error('Build failed'))

        const result = await plugin.validate()

        expect(result.valid).toBe(false)
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            field: 'scripts.build',
            message: expect.stringContaining('失敗')
          })
        )
      })

      it('testスクリプトが失敗した場合はエラー', async () => {
        mockExecutor.execSafe
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // npm audit
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // build
          .mockRejectedValueOnce(new Error('Tests failed'))

        const result = await plugin.validate()

        expect(result.valid).toBe(false)
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            field: 'scripts.test',
            message: expect.stringContaining('失敗')
          })
        )
      })

      it('lintスクリプトが無い場合は警告', async () => {
        const packageJsonWithoutLint = { ...validPackageJson }
        delete (packageJsonWithoutLint as any).scripts.lint
        ;(fs.readFile as jest.Mock).mockResolvedValue(
          JSON.stringify(packageJsonWithoutLint)
        )

        mockExecutor.execSafe
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })

        const result = await plugin.validate()

        expect(result.valid).toBe(true)
        expect(result.warnings).toContainEqual(
          expect.objectContaining({
            field: 'scripts.lint',
            message: expect.stringContaining('推奨')
          })
        )
      })
    })
  })

  describe('dryRun', () => {
    beforeEach(() => {
      ;(fs.readFile as jest.Mock).mockResolvedValue(
        JSON.stringify({
          name: 'test-package',
          version: '1.0.0',
          license: 'MIT'
        })
      )
    })

    it('dry-runが成功した場合は結果を返す', async () => {
      const dryRunOutput = `
+ test-package@1.0.0
package size: 10.5 kB
unpacked size: 50 kB
total files: 25
`
      mockExecutor.execSafe.mockResolvedValue({
        stdout: dryRunOutput,
        stderr: '',
        exitCode: 0
      })

      const result = await plugin.dryRun()

      expect(result.success).toBe(true)
      expect(mockExecutor.execSafe).toHaveBeenCalledWith(
        'npm',
        ['publish', '--dry-run'],
        expect.any(Object)
      )
    })

    it('dry-runが失敗した場合はエラーを返す', async () => {
      mockExecutor.execSafe.mockRejectedValue(
        new Error('Dry-run failed: invalid package')
      )

      const result = await plugin.dryRun()

      expect(result.success).toBe(false)
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: expect.stringContaining('失敗')
        })
      )
    })
  })

  describe('publish', () => {
    beforeEach(() => {
      ;(fs.readFile as jest.Mock).mockResolvedValue(
        JSON.stringify({
          name: 'test-package',
          version: '1.0.0',
          license: 'MIT'
        })
      )
    })

    it('OTP無しの場合は通常のpublish', async () => {
      mockExecutor.execSafe.mockResolvedValue({
        stdout: '+ test-package@1.0.0',
        stderr: '',
        exitCode: 0
      })

      const result = await plugin.publish()

      expect(result.success).toBe(true)
      expect(mockExecutor.execSafe).toHaveBeenCalledWith(
        'npm',
        ['publish'],
        expect.any(Object)
      )
    })

    it('OTP指定時は--otpオプションを付与', async () => {
      mockExecutor.execSafe.mockResolvedValue({
        stdout: '+ test-package@1.0.0',
        stderr: '',
        exitCode: 0
      })

      const result = await plugin.publish({ otp: '123456' })

      expect(result.success).toBe(true)
      expect(mockExecutor.execSafe).toHaveBeenCalledWith(
        'npm',
        expect.arrayContaining(['publish', '--otp', '123456']),
        expect.any(Object)
      )
    })

    it('スコープ付きパッケージでpublicアクセス指定', async () => {
      ;(fs.readFile as jest.Mock).mockResolvedValue(
        JSON.stringify({
          name: '@myorg/test-package',
          version: '1.0.0',
          license: 'MIT'
        })
      )

      mockExecutor.execSafe.mockResolvedValue({
        stdout: '+ @myorg/test-package@1.0.0',
        stderr: '',
        exitCode: 0
      })

      const result = await plugin.publish({ access: 'public' })

      expect(result.success).toBe(true)
      expect(mockExecutor.execSafe).toHaveBeenCalledWith(
        'npm',
        expect.arrayContaining(['publish', '--access', 'public']),
        expect.any(Object)
      )
    })

    it('タグ指定時は--tagオプションを付与', async () => {
      mockExecutor.execSafe.mockResolvedValue({
        stdout: '+ test-package@1.0.0',
        stderr: '',
        exitCode: 0
      })

      const result = await plugin.publish({ tag: 'beta' })

      expect(result.success).toBe(true)
      expect(mockExecutor.execSafe).toHaveBeenCalledWith(
        'npm',
        expect.arrayContaining(['publish', '--tag', 'beta']),
        expect.any(Object)
      )
    })

    it('OTP要求エラーの場合は適切なエラーを返す', async () => {
      mockExecutor.execSafe.mockRejectedValue(
        new Error('This operation requires a one-time password')
      )

      const result = await plugin.publish()

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/one-time password/i)
    })
  })

  describe('verify', () => {
    beforeEach(() => {
      ;(fs.readFile as jest.Mock).mockResolvedValue(
        JSON.stringify({
          name: 'test-package',
          version: '1.0.0',
          license: 'MIT'
        })
      )
    })

    it('npmjs.comで公開確認できた場合は成功', async () => {
      const mockFetch = global.fetch as jest.Mock
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          name: 'test-package',
          version: '1.0.0',
          versions: { '1.0.0': {} }
        })
      })

      const result = await plugin.verify()

      expect(result.verified).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://registry.npmjs.org/test-package'
      )
    })

    it('パッケージが見つからない場合は失敗', async () => {
      const mockFetch = global.fetch as jest.Mock
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404
      })

      const result = await plugin.verify()

      expect(result.verified).toBe(false)
      expect(result.error).toMatch(/見つかりません/)
    })

    it('バージョンが一致しない場合は失敗', async () => {
      const mockFetch = global.fetch as jest.Mock
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          name: 'test-package',
          version: '0.9.0',
          versions: { '0.9.0': {} }
        })
      })

      const result = await plugin.verify()

      expect(result.verified).toBe(false)
      expect(result.error).toMatch(/見つかりません/)
    })
  })

  describe('rollback', () => {
    beforeEach(() => {
      ;(fs.readFile as jest.Mock).mockResolvedValue(
        JSON.stringify({
          name: 'test-package',
          version: '1.0.0',
          license: 'MIT'
        })
      )
    })

    it('72時間以内の場合はnpm unpublishを実行', async () => {
      const mockFetch = global.fetch as jest.Mock
      const publishTime = new Date(Date.now() - 24 * 60 * 60 * 1000) // 24時間前
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          time: {
            '1.0.0': publishTime.toISOString()
          }
        })
      })

      mockExecutor.execSafe.mockResolvedValue({
        stdout: '- test-package@1.0.0',
        stderr: '',
        exitCode: 0
      })

      const result = await plugin.rollback('1.0.0')

      expect(result.success).toBe(true)
      expect(mockExecutor.execSafe).toHaveBeenCalledWith(
        'npm',
        ['unpublish', 'test-package@1.0.0'],
        expect.any(Object)
      )
    })

    it('72時間経過後はnpm deprecateを実行', async () => {
      const mockFetch = global.fetch as jest.Mock
      const publishTime = new Date(Date.now() - 100 * 60 * 60 * 1000) // 100時間前
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          time: {
            '1.0.0': publishTime.toISOString()
          }
        })
      })

      mockExecutor.execSafe.mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0
      })

      const result = await plugin.rollback('1.0.0')

      expect(result.success).toBe(true)
      expect(mockExecutor.execSafe).toHaveBeenCalledWith(
        'npm',
        expect.arrayContaining(['deprecate', 'test-package@1.0.0']),
        expect.any(Object)
      )
      expect(result.message).toMatch(/非推奨/)
    })

    it('公開時刻が取得できない場合はdeprecateを実行', async () => {
      const mockFetch = global.fetch as jest.Mock
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          time: {}
        })
      })

      mockExecutor.execSafe.mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0
      })

      const result = await plugin.rollback('1.0.0')

      expect(result.success).toBe(true)
      expect(mockExecutor.execSafe).toHaveBeenCalledWith(
        'npm',
        expect.arrayContaining(['deprecate']),
        expect.any(Object)
      )
    })
  })
})
