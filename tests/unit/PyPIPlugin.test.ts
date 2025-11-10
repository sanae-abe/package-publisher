import { PyPIPlugin } from '../../src/plugins/PyPIPlugin'
import { SafeCommandExecutor } from '../../src/security/SafeCommandExecutor'
import * as fs from 'fs/promises'
import * as path from 'path'

jest.mock('../../src/security/SafeCommandExecutor')
jest.mock('fs/promises')

// Mock global fetch
global.fetch = jest.fn() as jest.Mock

describe('PyPIPlugin', () => {
  let plugin: PyPIPlugin
  let mockExecutor: jest.Mocked<SafeCommandExecutor>
  const testProjectPath = '/test/project'

  beforeEach(() => {
    mockExecutor = new SafeCommandExecutor() as jest.Mocked<SafeCommandExecutor>
    plugin = new PyPIPlugin(testProjectPath, mockExecutor)
    jest.clearAllMocks()
  })

  describe('detect', () => {
    it('pyproject.tomlが存在する場合はtrueを返す', async () => {
      ;(fs.access as jest.Mock)
        .mockResolvedValueOnce(undefined) // pyproject.toml exists
        .mockRejectedValueOnce(new Error('ENOENT')) // setup.py doesn't exist

      const result = await plugin.detect(testProjectPath)

      expect(result).toBe(true)
      expect(fs.access).toHaveBeenCalledWith(
        path.join(testProjectPath, 'pyproject.toml'),
        expect.any(Number)
      )
    })

    it('setup.pyが存在する場合はtrueを返す', async () => {
      ;(fs.access as jest.Mock)
        .mockRejectedValueOnce(new Error('ENOENT')) // pyproject.toml doesn't exist
        .mockResolvedValueOnce(undefined) // setup.py exists

      const result = await plugin.detect(testProjectPath)

      expect(result).toBe(true)
    })

    it('両方存在しない場合はfalseを返す', async () => {
      ;(fs.access as jest.Mock)
        .mockRejectedValueOnce(new Error('ENOENT'))
        .mockRejectedValueOnce(new Error('ENOENT'))

      const result = await plugin.detect(testProjectPath)

      expect(result).toBe(false)
    })
  })

  describe('validate', () => {
    const validPyprojectToml = `
[project]
name = "my-package"
version = "1.0.0"
description = "A test package"
license = "MIT"
`

    beforeEach(() => {
      ;(fs.readFile as jest.Mock).mockResolvedValue(validPyprojectToml)
    })

    it('有効なpyproject.tomlの場合は検証成功', async () => {
      mockExecutor.execSafe
        .mockResolvedValueOnce({ stdout: 'build 0.10.0', stderr: '', exitCode: 0 }) // build --version
        .mockResolvedValueOnce({ stdout: 'twine 4.0.0', stderr: '', exitCode: 0 }) // twine --version
        .mockResolvedValueOnce({ stdout: 'pytest 7.0.0', stderr: '', exitCode: 0 }) // pytest --version
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // pytest

      const result = await plugin.validate()

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    describe('必須フィールド検証', () => {
      it('nameが無い場合はエラー', async () => {
        const invalidPyprojectToml = `
[project]
version = "1.0.0"
`
        ;(fs.readFile as jest.Mock).mockResolvedValue(invalidPyprojectToml)

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
        const invalidPyprojectToml = `
[project]
name = "my-package"
`
        ;(fs.readFile as jest.Mock).mockResolvedValue(invalidPyprojectToml)

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
        const pyprojectTomlWithoutLicense = `
[project]
name = "my-package"
version = "1.0.0"
`
        ;(fs.readFile as jest.Mock).mockResolvedValue(pyprojectTomlWithoutLicense)

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

      it('descriptionが無い場合は警告', async () => {
        const pyprojectTomlWithoutDescription = `
[project]
name = "my-package"
version = "1.0.0"
license = "MIT"
`
        ;(fs.readFile as jest.Mock).mockResolvedValue(pyprojectTomlWithoutDescription)

        mockExecutor.execSafe
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })

        const result = await plugin.validate()

        expect(result.valid).toBe(true)
        expect(result.warnings).toContainEqual(
          expect.objectContaining({
            field: 'description',
            message: expect.stringContaining('推奨')
          })
        )
      })
    })

    describe('PyPI命名規則検証', () => {
      it('ASCII以外の文字を含む名前はエラー', async () => {
        const invalidPyprojectToml = `
[project]
name = "my-パッケージ"
version = "1.0.0"
`
        ;(fs.readFile as jest.Mock).mockResolvedValue(invalidPyprojectToml)

        const result = await plugin.validate()

        expect(result.valid).toBe(false)
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            field: 'name',
            message: expect.stringContaining('ASCII')
          })
        )
      })

      it('ピリオドで始まる名前はエラー', async () => {
        const invalidPyprojectToml = `
[project]
name = ".my-package"
version = "1.0.0"
`
        ;(fs.readFile as jest.Mock).mockResolvedValue(invalidPyprojectToml)

        const result = await plugin.validate()

        expect(result.valid).toBe(false)
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            field: 'name',
            message: expect.stringContaining('ピリオドまたはハイフン')
          })
        )
      })

      it('ハイフンで終わる名前はエラー', async () => {
        const invalidPyprojectToml = `
[project]
name = "my-package-"
version = "1.0.0"
`
        ;(fs.readFile as jest.Mock).mockResolvedValue(invalidPyprojectToml)

        const result = await plugin.validate()

        expect(result.valid).toBe(false)
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            field: 'name',
            message: expect.stringContaining('ピリオドまたはハイフン')
          })
        )
      })

      it('アンダースコアを含む名前は有効', async () => {
        const validPyprojectToml2 = `
[project]
name = "my_package"
version = "1.0.0"
license = "MIT"
`
        ;(fs.readFile as jest.Mock).mockResolvedValue(validPyprojectToml2)

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

    describe('PEP 440バージョン検証', () => {
      it('無効なPEP 440バージョンはエラー', async () => {
        const invalidPyprojectToml = `
[project]
name = "my-package"
version = "v1.0.0"
`
        ;(fs.readFile as jest.Mock).mockResolvedValue(invalidPyprojectToml)

        const result = await plugin.validate()

        expect(result.valid).toBe(false)
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            field: 'version',
            message: expect.stringContaining('PEP 440')
          })
        )
      })

      it('プレリリース版は有効', async () => {
        const preReleasePyprojectToml = `
[project]
name = "my-package"
version = "1.0.0a1"
license = "MIT"
`
        ;(fs.readFile as jest.Mock).mockResolvedValue(preReleasePyprojectToml)

        mockExecutor.execSafe
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })

        const result = await plugin.validate()

        expect(result.valid).toBe(true)
        expect(result.errors).toHaveLength(0)
      })

      it('dev版は有効', async () => {
        const devPyprojectToml = `
[project]
name = "my-package"
version = "1.0.0.dev1"
license = "MIT"
`
        ;(fs.readFile as jest.Mock).mockResolvedValue(devPyprojectToml)

        mockExecutor.execSafe
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })

        const result = await plugin.validate()

        expect(result.valid).toBe(true)
        expect(result.errors).toHaveLength(0)
      })

      it('post版は有効', async () => {
        const postPyprojectToml = `
[project]
name = "my-package"
version = "1.0.0.post1"
license = "MIT"
`
        ;(fs.readFile as jest.Mock).mockResolvedValue(postPyprojectToml)

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

    describe('ツールの利用可能性チェック', () => {
      it('python -m buildが利用できない場合は警告', async () => {
        mockExecutor.execSafe
          .mockRejectedValueOnce(new Error('No module named build')) // build --version
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })

        const result = await plugin.validate()

        expect(result.valid).toBe(true) // 警告のみ
        expect(result.warnings).toContainEqual(
          expect.objectContaining({
            field: 'build_tools',
            message: expect.stringContaining('build')
          })
        )
      })

      it('twineが利用できない場合は警告', async () => {
        mockExecutor.execSafe
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // build --version
          .mockRejectedValueOnce(new Error('twine: command not found')) // twine --version
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })

        const result = await plugin.validate()

        expect(result.valid).toBe(true) // 警告のみ
        expect(result.warnings).toContainEqual(
          expect.objectContaining({
            field: 'twine',
            message: expect.stringContaining('twine')
          })
        )
      })
    })

    describe('pytest', () => {
      it('pytestが失敗した場合はエラー', async () => {
        mockExecutor.execSafe
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // build --version
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // twine --version
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // pytest --version
          .mockRejectedValueOnce(new Error('Tests failed')) // pytest

        const result = await plugin.validate()

        expect(result.valid).toBe(false)
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            field: 'tests',
            message: expect.stringContaining('失敗')
          })
        )
      })

      it('pytestがインストールされていない場合はスキップ', async () => {
        mockExecutor.execSafe
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
          .mockRejectedValueOnce(new Error('No module named pytest'))

        const result = await plugin.validate()

        expect(result.valid).toBe(true)
        expect(result.errors).toHaveLength(0)
      })
    })

    describe('setup.py対応', () => {
      it('setup.pyも正しく解析できる', async () => {
        const validSetupPy = `
from setuptools import setup

setup(
    name='my-package',
    version='1.0.0',
    description='A test package',
    author='John Doe',
    license='MIT'
)
`
        ;(fs.readFile as jest.Mock)
          .mockRejectedValueOnce(new Error('ENOENT')) // pyproject.toml doesn't exist
          .mockResolvedValueOnce(validSetupPy) // setup.py exists

        mockExecutor.execSafe
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })

        const result = await plugin.validate()

        expect(result.valid).toBe(true)
        expect(result.metadata?.packageName).toBe('my-package')
        expect(result.metadata?.version).toBe('1.0.0')
      })
    })
  })

  describe('dryRun', () => {
    beforeEach(() => {
      ;(fs.readFile as jest.Mock).mockResolvedValue(`
[project]
name = "test-package"
version = "1.0.0"
license = "MIT"
`)
    })

    it('ビルドとtwine checkが成功した場合は結果を返す', async () => {
      mockExecutor.execSafe
        .mockResolvedValueOnce({
          stdout: 'Successfully built test_package-1.0.0.tar.gz',
          stderr: '',
          exitCode: 0
        }) // python -m build
        .mockResolvedValueOnce({
          stdout: 'Checking dist/* PASSED',
          stderr: '',
          exitCode: 0
        }) // twine check

      const result = await plugin.dryRun()

      expect(result.success).toBe(true)
      expect(mockExecutor.execSafe).toHaveBeenCalledWith(
        'python',
        ['-m', 'build'],
        expect.any(Object)
      )
      expect(mockExecutor.execSafe).toHaveBeenCalledWith(
        'twine',
        ['check', 'dist/*'],
        expect.any(Object)
      )
    })

    it('ビルドが失敗した場合はエラーを返す', async () => {
      mockExecutor.execSafe.mockRejectedValue(new Error('Build failed: missing dependency'))

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
[project]
name = "test-package"
version = "1.0.0"
license = "MIT"
`)
    })

    it('通常のpublish (PyPI)', async () => {
      mockExecutor.execSafe
        .mockResolvedValueOnce({ stdout: 'Build successful', stderr: '', exitCode: 0 }) // build
        .mockResolvedValueOnce({ stdout: 'Uploading test_package-1.0.0', stderr: '', exitCode: 0 }) // twine upload

      const result = await plugin.publish()

      expect(result.success).toBe(true)
      expect(mockExecutor.execSafe).toHaveBeenCalledWith(
        'twine',
        ['upload', 'dist/*'],
        expect.any(Object)
      )
      expect(result.packageUrl).toBe('https://pypi.org/project/test-package')
    })

    it('test.pypi.orgへの公開', async () => {
      mockExecutor.execSafe
        .mockResolvedValueOnce({ stdout: 'Build successful', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: 'Uploading to test.pypi.org', stderr: '', exitCode: 0 })

      const result = await plugin.publish({ tag: 'test' })

      expect(result.success).toBe(true)
      expect(mockExecutor.execSafe).toHaveBeenCalledWith(
        'twine',
        expect.arrayContaining(['upload', 'dist/*', '--repository-url', 'https://test.pypi.org/legacy/']),
        expect.any(Object)
      )
      expect(result.packageUrl).toBe('https://test.pypi.org/project/test-package')
    })

    it('認証エラーの場合は適切なエラーを返す', async () => {
      mockExecutor.execSafe
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
        .mockRejectedValueOnce(new Error('403 Invalid or non-existent authentication'))

      const result = await plugin.publish()

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/authentication/i)
    })

    it('credentials エラーの場合は適切なエラーを返す', async () => {
      mockExecutor.execSafe
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
        .mockRejectedValueOnce(new Error('Invalid credentials'))

      const result = await plugin.publish()

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/credentials/i)
    })
  })

  describe('verify', () => {
    beforeEach(() => {
      ;(fs.readFile as jest.Mock).mockResolvedValue(`
[project]
name = "test-package"
version = "1.0.0"
license = "MIT"
`)
    })

    it('PyPIで公開確認できた場合は成功', async () => {
      const mockFetch = global.fetch as jest.Mock
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          info: {
            name: 'test-package',
            version: '1.0.0'
          },
          releases: {
            '1.0.0': [{ filename: 'test_package-1.0.0.tar.gz' }],
            '0.9.0': [{ filename: 'test_package-0.9.0.tar.gz' }]
          }
        })
      })

      const result = await plugin.verify()

      expect(result.verified).toBe(true)
      expect(result.version).toBe('1.0.0')
      expect(result.url).toBe('https://pypi.org/project/test-package')
      expect(mockFetch).toHaveBeenCalledWith('https://pypi.org/pypi/test-package/json')
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
          info: {
            name: 'test-package',
            version: '0.9.0'
          },
          releases: {
            '0.9.0': [{ filename: 'test_package-0.9.0.tar.gz' }]
          }
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
          info: {
            name: 'test-package',
            version: '1.2.0'
          },
          releases: {
            '1.2.0': [{}],
            '1.0.0': [{}],
            '0.9.0': [{}]
          }
        })
      })

      const result = await plugin.verify()

      expect(result.verified).toBe(true)
      expect(result.metadata).toEqual({
        latestVersion: '1.2.0',
        allVersions: ['1.2.0', '1.0.0', '0.9.0']
      })
    })
  })

  describe('rollback', () => {
    beforeEach(() => {
      ;(fs.readFile as jest.Mock).mockResolvedValue(`
[project]
name = "test-package"
version = "1.0.0"
license = "MIT"
`)
    })

    it('PyPIはロールバックをサポートしていないためエラーを返す', async () => {
      const result = await plugin.rollback('1.0.0')

      expect(result.success).toBe(false)
      expect(result.message).toMatch(/削除をサポートしていません/)
      expect(result.error).toMatch(/not supported/i)
    })
  })
})
