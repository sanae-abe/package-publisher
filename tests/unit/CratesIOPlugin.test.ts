import { CratesIOPlugin } from '../../src/plugins/CratesIOPlugin'
import { SafeCommandExecutor } from '../../src/security/SafeCommandExecutor'
import * as fs from 'fs/promises'
import * as path from 'path'

jest.mock('../../src/security/SafeCommandExecutor')
jest.mock('fs/promises')

// Mock global fetch
global.fetch = jest.fn() as jest.Mock

describe('CratesIOPlugin', () => {
  let plugin: CratesIOPlugin
  let mockExecutor: jest.Mocked<SafeCommandExecutor>
  const testProjectPath = '/test/project'

  beforeEach(() => {
    mockExecutor = new SafeCommandExecutor() as jest.Mocked<SafeCommandExecutor>
    plugin = new CratesIOPlugin(testProjectPath, mockExecutor)
    jest.clearAllMocks()
  })

  describe('detect', () => {
    it('Cargo.tomlが存在する場合はtrueを返す', async () => {
      ;(fs.access as jest.Mock).mockResolvedValue(undefined)

      const result = await plugin.detect(testProjectPath)

      expect(result).toBe(true)
      expect(fs.access).toHaveBeenCalledWith(
        path.join(testProjectPath, 'Cargo.toml'),
        expect.any(Number)
      )
    })

    it('Cargo.tomlが存在しない場合はfalseを返す', async () => {
      ;(fs.access as jest.Mock).mockRejectedValue(new Error('ENOENT'))

      const result = await plugin.detect(testProjectPath)

      expect(result).toBe(false)
    })
  })

  describe('validate', () => {
    const validCargoToml = `
[package]
name = "my-crate"
version = "1.0.0"
authors = ["John Doe <john@example.com>"]
license = "MIT"
description = "A test crate"
edition = "2021"

[dependencies]
serde = "1.0"
`

    beforeEach(() => {
      ;(fs.readFile as jest.Mock).mockResolvedValue(validCargoToml)
    })

    it('有効なCargo.tomlの場合は検証成功', async () => {
      mockExecutor.execSafe
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // cargo check
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // cargo test
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // cargo clippy

      const result = await plugin.validate()

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
      expect(mockExecutor.execSafe).toHaveBeenCalledWith(
        'cargo',
        ['check'],
        expect.any(Object)
      )
    })

    describe('必須フィールド検証', () => {
      it('package.nameが無い場合はエラー', async () => {
        const invalidCargoToml = `
[package]
version = "1.0.0"
`
        ;(fs.readFile as jest.Mock).mockResolvedValue(invalidCargoToml)

        const result = await plugin.validate()

        expect(result.valid).toBe(false)
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            field: 'package.name',
            message: expect.stringContaining('必須')
          })
        )
      })

      it('package.versionが無い場合はエラー', async () => {
        const invalidCargoToml = `
[package]
name = "my-crate"
`
        ;(fs.readFile as jest.Mock).mockResolvedValue(invalidCargoToml)

        const result = await plugin.validate()

        expect(result.valid).toBe(false)
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            field: 'package.version',
            message: expect.stringContaining('必須')
          })
        )
      })

      it('package.licenseが無い場合は警告', async () => {
        const cargoTomlWithoutLicense = `
[package]
name = "my-crate"
version = "1.0.0"
`
        ;(fs.readFile as jest.Mock).mockResolvedValue(cargoTomlWithoutLicense)

        mockExecutor.execSafe
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })

        const result = await plugin.validate()

        expect(result.valid).toBe(true) // 警告のみなので有効
        expect(result.warnings).toContainEqual(
          expect.objectContaining({
            field: 'package.license',
            message: expect.stringContaining('推奨')
          })
        )
      })

      it('package.descriptionが無い場合は警告', async () => {
        const cargoTomlWithoutDescription = `
[package]
name = "my-crate"
version = "1.0.0"
license = "MIT"
`
        ;(fs.readFile as jest.Mock).mockResolvedValue(cargoTomlWithoutDescription)

        mockExecutor.execSafe
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })

        const result = await plugin.validate()

        expect(result.valid).toBe(true)
        expect(result.warnings).toContainEqual(
          expect.objectContaining({
            field: 'package.description',
            message: expect.stringContaining('推奨')
          })
        )
      })
    })

    describe('crates.io命名規則検証', () => {
      it('英数字とハイフン、アンダースコア以外を含む名前はエラー', async () => {
        const invalidCargoToml = `
[package]
name = "my-crate!"
version = "1.0.0"
`
        ;(fs.readFile as jest.Mock).mockResolvedValue(invalidCargoToml)

        const result = await plugin.validate()

        expect(result.valid).toBe(false)
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            field: 'package.name',
            message: expect.stringContaining('英数字、ハイフン、アンダースコア')
          })
        )
      })

      it('ハイフンとアンダースコアを含む名前は有効', async () => {
        const validCargoToml2 = `
[package]
name = "my_crate-name"
version = "1.0.0"
license = "MIT"
`
        ;(fs.readFile as jest.Mock).mockResolvedValue(validCargoToml2)

        mockExecutor.execSafe
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
        const invalidCargoToml = `
[package]
name = "my-crate"
version = "1.0"
`
        ;(fs.readFile as jest.Mock).mockResolvedValue(invalidCargoToml)

        const result = await plugin.validate()

        expect(result.valid).toBe(false)
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            field: 'package.version',
            message: expect.stringContaining('SemVer')
          })
        )
      })

      it('プレリリース版は有効', async () => {
        const preReleaseCargoToml = `
[package]
name = "my-crate"
version = "1.0.0-beta.1"
license = "MIT"
`
        ;(fs.readFile as jest.Mock).mockResolvedValue(preReleaseCargoToml)

        mockExecutor.execSafe
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })

        const result = await plugin.validate()

        expect(result.valid).toBe(true)
        expect(result.errors).toHaveLength(0)
      })

      it('ビルドメタデータ付きバージョンは有効', async () => {
        const buildMetadataCargoToml = `
[package]
name = "my-crate"
version = "1.0.0+20240101"
license = "MIT"
`
        ;(fs.readFile as jest.Mock).mockResolvedValue(buildMetadataCargoToml)

        mockExecutor.execSafe
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })

        const result = await plugin.validate()

        expect(result.valid).toBe(true)
        expect(result.errors).toHaveLength(0)
      })
    })

    describe('cargo check/test/clippy', () => {
      it('cargo checkが失敗した場合はエラー', async () => {
        mockExecutor.execSafe.mockRejectedValueOnce(new Error('Compilation failed'))

        const result = await plugin.validate()

        expect(result.valid).toBe(false)
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            field: 'cargo.check',
            message: expect.stringContaining('失敗')
          })
        )
      })

      it('cargo testはスキップされて警告のみ', async () => {
        mockExecutor.execSafe.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // cargo check

        const result = await plugin.validate()

        expect(result.valid).toBe(true)
        expect(result.warnings).toContainEqual(
          expect.objectContaining({
            field: 'cargo.test',
            message: expect.stringContaining('スキップ')
          })
        )
      })

      it('cargo clippyが失敗した場合は警告', async () => {
        mockExecutor.execSafe
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // cargo check
          .mockRejectedValueOnce(new Error('Clippy warnings detected')) // cargo clippy

        const result = await plugin.validate()

        expect(result.valid).toBe(true) // 警告のみ
        expect(result.warnings).toContainEqual(
          expect.objectContaining({
            field: 'cargo.clippy',
            message: expect.stringContaining('警告')
          })
        )
      })
    })
  })

  describe('dryRun', () => {
    beforeEach(() => {
      ;(fs.readFile as jest.Mock).mockResolvedValue(`
[package]
name = "test-crate"
version = "1.0.0"
license = "MIT"
`)
    })

    it('dry-runが成功した場合は結果を返す', async () => {
      const dryRunOutput = `
   Packaging test-crate v1.0.0
   Verifying test-crate v1.0.0
   Compiling test-crate v1.0.0
`
      mockExecutor.execSafe.mockResolvedValue({
        stdout: dryRunOutput,
        stderr: '',
        exitCode: 0
      })

      const result = await plugin.dryRun()

      expect(result.success).toBe(true)
      expect(mockExecutor.execSafe).toHaveBeenCalledWith(
        'cargo',
        ['publish', '--dry-run', '--allow-dirty'],
        expect.any(Object)
      )
    })

    it('dry-runが失敗した場合はエラーを返す', async () => {
      mockExecutor.execSafe.mockRejectedValue(
        new Error('Dry-run failed: dependency not found')
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
      ;(fs.readFile as jest.Mock).mockResolvedValue(`
[package]
name = "test-crate"
version = "1.0.0"
license = "MIT"
`)
    })

    it('通常のpublish', async () => {
      mockExecutor.execSafe.mockResolvedValue({
        stdout: 'Uploading test-crate v1.0.0',
        stderr: '',
        exitCode: 0
      })

      const result = await plugin.publish()

      expect(result.success).toBe(true)
      expect(mockExecutor.execSafe).toHaveBeenCalledWith(
        'cargo',
        ['publish', '--allow-dirty'],
        expect.any(Object)
      )
      expect(result.packageUrl).toBe('https://crates.io/crates/test-crate')
    })

    it('features指定時は--featuresオプションを付与', async () => {
      mockExecutor.execSafe.mockResolvedValue({
        stdout: 'Uploading test-crate v1.0.0',
        stderr: '',
        exitCode: 0
      })

      const result = await plugin.publish({ tag: 'experimental' })

      expect(result.success).toBe(true)
      expect(mockExecutor.execSafe).toHaveBeenCalledWith(
        'cargo',
        expect.arrayContaining(['publish', '--allow-dirty', '--features', 'experimental']),
        expect.any(Object)
      )
    })

    it('認証エラーの場合は適切なエラーを返す', async () => {
      mockExecutor.execSafe.mockRejectedValue(
        new Error('error: authentication required')
      )

      const result = await plugin.publish()

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/authentication/i)
    })

    it('トークンエラーの場合は適切なエラーを返す', async () => {
      mockExecutor.execSafe.mockRejectedValue(new Error('error: invalid token'))

      const result = await plugin.publish()

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/token/i)
    })
  })

  describe('verify', () => {
    beforeEach(() => {
      ;(fs.readFile as jest.Mock).mockResolvedValue(`
[package]
name = "test-crate"
version = "1.0.0"
license = "MIT"
`)
    })

    it('crates.ioで公開確認できた場合は成功', async () => {
      const mockFetch = global.fetch as jest.Mock
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          crate: {
            name: 'test-crate',
            newest_version: '1.0.0'
          },
          versions: [
            { num: '1.0.0', created_at: '2024-01-01T00:00:00Z' },
            { num: '0.9.0', created_at: '2023-12-01T00:00:00Z' }
          ]
        })
      })

      const result = await plugin.verify()

      expect(result.verified).toBe(true)
      expect(result.version).toBe('1.0.0')
      expect(result.url).toBe('https://crates.io/crates/test-crate')
      expect(mockFetch).toHaveBeenCalledWith(
        'https://crates.io/api/v1/crates/test-crate'
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
          crate: {
            name: 'test-crate',
            newest_version: '0.9.0'
          },
          versions: [{ num: '0.9.0', created_at: '2023-12-01T00:00:00Z' }]
        })
      })

      const result = await plugin.verify()

      expect(result.verified).toBe(false)
      expect(result.error).toMatch(/見つかりません/)
    })

    it('metadata情報を含む検証結果を返す', async () => {
      const mockFetch = global.fetch as jest.Mock
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          crate: {
            name: 'test-crate',
            newest_version: '1.2.0'
          },
          versions: [
            { num: '1.2.0', created_at: '2024-02-01T00:00:00Z' },
            { num: '1.0.0', created_at: '2024-01-01T00:00:00Z' }
          ]
        })
      })

      const result = await plugin.verify()

      expect(result.verified).toBe(true)
      expect(result.metadata).toEqual({
        newestVersion: '1.2.0',
        allVersions: ['1.2.0', '1.0.0']
      })
    })
  })

  describe('rollback', () => {
    beforeEach(() => {
      ;(fs.readFile as jest.Mock).mockResolvedValue(`
[package]
name = "test-crate"
version = "1.0.0"
license = "MIT"
`)
    })

    it('cargo yankでロールバック成功', async () => {
      mockExecutor.execSafe.mockResolvedValue({
        stdout: 'Yank successful',
        stderr: '',
        exitCode: 0
      })

      const result = await plugin.rollback('1.0.0')

      expect(result.success).toBe(true)
      expect(result.message).toMatch(/yank/)
      expect(mockExecutor.execSafe).toHaveBeenCalledWith(
        'cargo',
        ['yank', '--vers', '1.0.0'],
        expect.any(Object)
      )
    })

    it('cargo yankが失敗した場合はエラー', async () => {
      mockExecutor.execSafe.mockRejectedValue(new Error('Yank failed: version not found'))

      const result = await plugin.rollback('1.0.0')

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/version not found/i)
    })
  })
})
