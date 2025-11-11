import { HomebrewPlugin } from '../../src/plugins/HomebrewPlugin'
import { SafeCommandExecutor } from '../../src/security/SafeCommandExecutor'
import * as fs from 'fs/promises'
import * as path from 'path'

jest.mock('../../src/security/SafeCommandExecutor')
jest.mock('fs/promises')

describe('HomebrewPlugin', () => {
  let plugin: HomebrewPlugin
  let mockExecutor: jest.Mocked<SafeCommandExecutor>
  const testProjectPath = '/test/project'

  beforeEach(() => {
    mockExecutor = new SafeCommandExecutor() as jest.Mocked<SafeCommandExecutor>
    plugin = new HomebrewPlugin(testProjectPath, mockExecutor)
    jest.clearAllMocks()
  })

  describe('detect', () => {
    it('Formulaディレクトリが存在する場合はtrueを返す', async () => {
      ;(fs.access as jest.Mock).mockResolvedValue(undefined)

      const result = await plugin.detect(testProjectPath)

      expect(result).toBe(true)
      expect(fs.access).toHaveBeenCalledWith(
        path.join(testProjectPath, 'Formula'),
        expect.any(Number)
      )
    })

    it('.rbファイルが存在する場合はtrueを返す', async () => {
      ;(fs.access as jest.Mock).mockRejectedValue(new Error('ENOENT'))
      ;(fs.readdir as jest.Mock).mockResolvedValue(['my-formula.rb', 'README.md'])

      const result = await plugin.detect(testProjectPath)

      expect(result).toBe(true)
    })

    it('Formula/.rbファイルが存在しない場合はfalseを返す', async () => {
      ;(fs.access as jest.Mock).mockRejectedValue(new Error('ENOENT'))
      ;(fs.readdir as jest.Mock).mockResolvedValue(['README.md', 'package.json'])

      const result = await plugin.detect(testProjectPath)

      expect(result).toBe(false)
    })
  })

  describe('validate', () => {
    const validFormula = `
class MyAwesomeTool < Formula
  desc "An awesome tool for developers"
  homepage "https://example.com"
  url "https://example.com/my-awesome-tool-1.0.0.tar.gz"
  sha256 "abc123def456..."
  license "MIT"
  version "1.0.0"

  def install
    bin.install "my-awesome-tool"
  end
end
`

    beforeEach(() => {
      ;(fs.access as jest.Mock).mockRejectedValue(new Error('ENOENT'))
      ;(fs.readdir as jest.Mock).mockResolvedValue(['my-awesome-tool.rb'])
      ;(fs.readFile as jest.Mock).mockResolvedValue(validFormula)
    })

    it('有効なFormulaの場合は検証成功', async () => {
      const result = await plugin.validate()

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
      // brew audit is skipped for local formulas
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          field: 'brew.audit',
          message: expect.stringContaining('スキップ')
        })
      )
    })

    describe('必須フィールド検証', () => {
      it('class名が無い場合はエラー', async () => {
        const invalidFormula = `
desc "An awesome tool"
url "https://example.com/tool.tar.gz"
`
        ;(fs.readFile as jest.Mock).mockResolvedValue(invalidFormula)

        const result = await plugin.validate()

        expect(result.valid).toBe(false)
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            field: 'name',
            message: expect.stringContaining('見つかりません')
          })
        )
      })

      it('urlが無い場合はエラー', async () => {
        const invalidFormula = `
class MyTool < Formula
  desc "A tool"
end
`
        ;(fs.readFile as jest.Mock).mockResolvedValue(invalidFormula)

        const result = await plugin.validate()

        expect(result.valid).toBe(false)
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            field: 'url',
            message: expect.stringContaining('見つかりません')
          })
        )
      })

      it('sha256が無い場合は警告', async () => {
        const formulaWithoutSha256 = `
class MyTool < Formula
  desc "A tool"
  homepage "https://example.com"
  url "https://example.com/tool.tar.gz"
  license "MIT"
end
`
        ;(fs.readFile as jest.Mock).mockResolvedValue(formulaWithoutSha256)

        mockExecutor.execSafe.mockResolvedValue({
          stdout: '',
          stderr: '',
          exitCode: 0
        })

        const result = await plugin.validate()

        expect(result.valid).toBe(true) // 警告のみなので有効
        expect(result.warnings).toContainEqual(
          expect.objectContaining({
            field: 'sha256',
            message: expect.stringContaining('推奨')
          })
        )
      })

      it('descriptionが無い場合は警告', async () => {
        const formulaWithoutDesc = `
class MyTool < Formula
  homepage "https://example.com"
  url "https://example.com/tool.tar.gz"
  sha256 "abc123"
  license "MIT"
end
`
        ;(fs.readFile as jest.Mock).mockResolvedValue(formulaWithoutDesc)

        mockExecutor.execSafe.mockResolvedValue({
          stdout: '',
          stderr: '',
          exitCode: 0
        })

        const result = await plugin.validate()

        expect(result.valid).toBe(true)
        expect(result.warnings).toContainEqual(
          expect.objectContaining({
            field: 'desc',
            message: expect.stringContaining('推奨')
          })
        )
      })

      it('homepageが無い場合は警告', async () => {
        const formulaWithoutHomepage = `
class MyTool < Formula
  desc "A tool"
  url "https://example.com/tool.tar.gz"
  sha256 "abc123"
  license "MIT"
end
`
        ;(fs.readFile as jest.Mock).mockResolvedValue(formulaWithoutHomepage)

        mockExecutor.execSafe.mockResolvedValue({
          stdout: '',
          stderr: '',
          exitCode: 0
        })

        const result = await plugin.validate()

        expect(result.valid).toBe(true)
        expect(result.warnings).toContainEqual(
          expect.objectContaining({
            field: 'homepage',
            message: expect.stringContaining('推奨')
          })
        )
      })

      it('licenseが無い場合は警告', async () => {
        const formulaWithoutLicense = `
class MyTool < Formula
  desc "A tool"
  homepage "https://example.com"
  url "https://example.com/tool.tar.gz"
  sha256 "abc123"
end
`
        ;(fs.readFile as jest.Mock).mockResolvedValue(formulaWithoutLicense)

        mockExecutor.execSafe.mockResolvedValue({
          stdout: '',
          stderr: '',
          exitCode: 0
        })

        const result = await plugin.validate()

        expect(result.valid).toBe(true)
        expect(result.warnings).toContainEqual(
          expect.objectContaining({
            field: 'license',
            message: expect.stringContaining('推奨')
          })
        )
      })
    })

    describe('Formula名変換', () => {
      it('CamelCaseをkebab-caseに変換', async () => {
        const formula = `
class MyAwesomeTool < Formula
  desc "A tool"
  homepage "https://example.com"
  url "https://example.com/tool.tar.gz"
  sha256 "abc123"
  license "MIT"
end
`
        ;(fs.readFile as jest.Mock).mockResolvedValue(formula)

        mockExecutor.execSafe.mockResolvedValue({
          stdout: '',
          stderr: '',
          exitCode: 0
        })

        const result = await plugin.validate()

        expect(result.valid).toBe(true)
        expect(result.metadata?.packageName).toBe('my-awesome-tool')
      })

      it('連続する大文字を正しく変換', async () => {
        const formula = `
class HTTPServer < Formula
  desc "A server"
  homepage "https://example.com"
  url "https://example.com/server.tar.gz"
  sha256 "abc123"
  license "MIT"
end
`
        ;(fs.readFile as jest.Mock).mockResolvedValue(formula)

        mockExecutor.execSafe.mockResolvedValue({
          stdout: '',
          stderr: '',
          exitCode: 0
        })

        const result = await plugin.validate()

        expect(result.valid).toBe(true)
        expect(result.metadata?.packageName).toBe('http-server')
      })
    })

    describe('brew audit', () => {
      it('brew auditはローカルFormulaでスキップされる', async () => {
        const result = await plugin.validate()

        // brew audit is skipped for local formulas, so no errors
        expect(result.valid).toBe(true)
        expect(result.warnings).toContainEqual(
          expect.objectContaining({
            field: 'brew.audit',
            message: expect.stringContaining('スキップ')
          })
        )
      })
    })

    describe('Formulaファイルが見つからない場合', () => {
      it('エラーを返す', async () => {
        ;(fs.readdir as jest.Mock).mockResolvedValue(['README.md'])

        const result = await plugin.validate()

        expect(result.valid).toBe(false)
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            field: 'formula',
            message: expect.stringContaining('見つかりません')
          })
        )
      })
    })
  })

  describe('dryRun', () => {
    const validFormula = `
class MyTool < Formula
  desc "A tool"
  homepage "https://example.com"
  url "https://example.com/tool.tar.gz"
  sha256 "abc123"
  license "MIT"
end
`

    beforeEach(() => {
      ;(fs.access as jest.Mock).mockRejectedValue(new Error('ENOENT'))
      ;(fs.readdir as jest.Mock).mockResolvedValue(['my-tool.rb'])
      ;(fs.readFile as jest.Mock).mockResolvedValue(validFormula)
    })

    it('brew auditとinstall testが成功した場合は結果を返す', async () => {
      const result = await plugin.dryRun()

      expect(result.success).toBe(true)
      expect(result.output).toContain('Formula検証完了')
      expect(result.output).toContain('my-tool')
      expect(result.output).toContain('https://example.com/tool.tar.gz')
      // brew audit and install tests are skipped for local formulas
      expect(mockExecutor.execSafe).not.toHaveBeenCalled()
    })

    it('ローカルFormulaの検証でスキップ警告を表示', async () => {
      const result = await plugin.dryRun()

      expect(result.success).toBe(true)
      expect(result.output).toContain('スキップ')
      expect(result.output).toContain('brew audit --strict')
    })

    it('Formulaファイルが見つからない場合はエラー', async () => {
      ;(fs.readdir as jest.Mock).mockResolvedValue(['README.md'])

      const result = await plugin.dryRun()

      expect(result.success).toBe(false)
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'formula',
          message: expect.stringContaining('見つかりません')
        })
      )
    })
  })

  describe('publish', () => {
    const validFormula = `
class MyTool < Formula
  desc "A tool"
  homepage "https://example.com"
  url "https://example.com/tool.tar.gz"
  sha256 "abc123"
  license "MIT"
  version "1.0.0"
end
`

    beforeEach(() => {
      ;(fs.access as jest.Mock).mockRejectedValue(new Error('ENOENT'))
      ;(fs.readdir as jest.Mock).mockResolvedValue(['my-tool.rb'])
      ;(fs.readFile as jest.Mock).mockResolvedValue(validFormula)
    })

    it('Gitワークフローでpublish成功', async () => {
      mockExecutor.execSafe
        .mockResolvedValueOnce({ stdout: '.git', stderr: '', exitCode: 0 }) // git rev-parse
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // git add
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // git commit
        .mockResolvedValueOnce({ stdout: 'Push successful', stderr: '', exitCode: 0 }) // git push

      const result = await plugin.publish()

      expect(result.success).toBe(true)
      expect(mockExecutor.execSafe).toHaveBeenCalledWith(
        'git',
        ['rev-parse', '--git-dir'],
        expect.any(Object)
      )
      expect(mockExecutor.execSafe).toHaveBeenCalledWith(
        'git',
        expect.arrayContaining(['add']),
        expect.any(Object)
      )
      expect(mockExecutor.execSafe).toHaveBeenCalledWith(
        'git',
        expect.arrayContaining(['commit', '-m', expect.stringContaining('my-tool')]),
        expect.any(Object)
      )
      expect(mockExecutor.execSafe).toHaveBeenCalledWith(
        'git',
        ['push'],
        expect.any(Object)
      )
    })

    it('カスタムTap名を指定できる', async () => {
      mockExecutor.execSafe
        .mockResolvedValueOnce({ stdout: '.git', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: 'Push successful', stderr: '', exitCode: 0 })

      const result = await plugin.publish({ tag: 'my-custom-tap' })

      expect(result.success).toBe(true)
      expect(result.packageUrl).toContain('my-custom-tap')
    })

    it('Gitリポジトリでない場合はエラー', async () => {
      mockExecutor.execSafe.mockRejectedValue(
        new Error('not a git repository')
      )

      const result = await plugin.publish()

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/Git/)
    })

    it('Git認証エラーの場合は適切なエラーを返す', async () => {
      mockExecutor.execSafe
        .mockResolvedValueOnce({ stdout: '.git', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
        .mockRejectedValueOnce(new Error('authentication failed'))

      const result = await plugin.publish()

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/authentication/i)
    })

    it('Formulaファイルが見つからない場合はエラー', async () => {
      ;(fs.readdir as jest.Mock).mockResolvedValue(['README.md'])

      const result = await plugin.publish()

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/見つかりません/)
    })

    it('metadataに公式登録の案内を含む', async () => {
      mockExecutor.execSafe
        .mockResolvedValueOnce({ stdout: '.git', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: 'Push successful', stderr: '', exitCode: 0 })

      const result = await plugin.publish()

      expect(result.success).toBe(true)
      expect(result.metadata?.message).toMatch(/homebrew\/homebrew-core/)
    })
  })

  describe('verify', () => {
    const validFormula = `
class MyTool < Formula
  desc "A tool"
  homepage "https://example.com"
  url "https://example.com/tool.tar.gz"
  sha256 "abc123"
  license "MIT"
  version "1.0.0"
end
`

    beforeEach(() => {
      ;(fs.access as jest.Mock).mockRejectedValue(new Error('ENOENT'))
      ;(fs.readdir as jest.Mock).mockResolvedValue(['my-tool.rb'])
      ;(fs.readFile as jest.Mock).mockResolvedValue(validFormula)
    })

    it('brew infoで検証成功', async () => {
      mockExecutor.execSafe.mockResolvedValue({
        stdout: 'my-tool: stable 1.0.0',
        stderr: '',
        exitCode: 0
      })

      const result = await plugin.verify()

      expect(result.verified).toBe(true)
      expect(result.version).toBe('1.0.0')
      expect(result.url).toBe('https://formulae.brew.sh/formula/my-tool')
      expect(mockExecutor.execSafe).toHaveBeenCalledWith(
        'brew',
        ['info', 'my-tool'],
        expect.any(Object)
      )
    })

    it('Formulaが見つからない場合は適切なメッセージを返す', async () => {
      mockExecutor.execSafe.mockRejectedValue(
        new Error('No available formula with the name "my-tool"')
      )

      const result = await plugin.verify()

      expect(result.verified).toBe(false)
      expect(result.error).toMatch(/見つかりません/)
      expect(result.error).toMatch(/カスタムTap/)
    })

    it('metadata情報を含む検証結果を返す', async () => {
      mockExecutor.execSafe.mockResolvedValue({
        stdout: 'my-tool: stable 1.0.0\nInstalled from: homebrew/core',
        stderr: '',
        exitCode: 0
      })

      const result = await plugin.verify()

      expect(result.verified).toBe(true)
      expect(result.metadata?.info).toContain('homebrew/core')
    })
  })

  describe('rollback', () => {
    beforeEach(() => {
      ;(fs.access as jest.Mock).mockRejectedValue(new Error('ENOENT'))
      ;(fs.readdir as jest.Mock).mockResolvedValue(['my-tool.rb'])
      ;(fs.readFile as jest.Mock).mockResolvedValue(`
class MyTool < Formula
  desc "A tool"
  url "https://example.com/tool.tar.gz"
  version "1.0.0"
end
`)
    })

    it('Homebrewはロールバックをサポートしていないためエラーを返す', async () => {
      const result = await plugin.rollback('1.0.0')

      expect(result.success).toBe(false)
      expect(result.message).toMatch(/ロールバックをサポートしていません/)
      expect(result.error).toMatch(/not supported/i)
    })
  })
})
