import { SecureTokenManager } from '../../src/security/SecureTokenManager'

describe('SecureTokenManager', () => {
  let manager: SecureTokenManager

  beforeEach(() => {
    manager = new SecureTokenManager()
    // Clear all tokens before each test
    ;['npm', 'crates.io', 'pypi', 'homebrew'].forEach(registry => {
      manager.clearTokenForTesting(registry)
    })
  })

  afterEach(() => {
    // Clean up after tests
    ;['npm', 'crates.io', 'pypi', 'homebrew'].forEach(registry => {
      manager.clearTokenForTesting(registry)
    })
  })

  describe('getToken', () => {
    it('環境変数からNPMトークンを取得する', () => {
      const testToken = 'npm_test_token_12345'
      manager.setTokenForTesting('npm', testToken)

      const token = manager.getToken('npm')

      expect(token).toBe(testToken)
    })

    it('環境変数からCrates.ioトークンを取得する', () => {
      const testToken = 'crates_test_token_12345'
      manager.setTokenForTesting('crates.io', testToken)

      const token = manager.getToken('crates.io')

      expect(token).toBe(testToken)
    })

    it('環境変数からPyPIトークンを取得する', () => {
      const testToken = 'pypi_test_token_12345'
      manager.setTokenForTesting('pypi', testToken)

      const token = manager.getToken('pypi')

      expect(token).toBe(testToken)
    })

    it('環境変数からHomebrewトークンを取得する', () => {
      const testToken = 'ghp_test_token_12345'
      manager.setTokenForTesting('homebrew', testToken)

      const token = manager.getToken('homebrew')

      expect(token).toBe(testToken)
    })

    it('未知のレジストリの場合はundefinedを返す', () => {
      const token = manager.getToken('unknown-registry')

      expect(token).toBeUndefined()
    })

    it('トークンが設定されていない場合はundefinedを返す', () => {
      const token = manager.getToken('npm')

      expect(token).toBeUndefined()
    })
  })

  describe('hasToken', () => {
    it('トークンが設定されている場合はtrueを返す', () => {
      manager.setTokenForTesting('npm', 'test_token')

      expect(manager.hasToken('npm')).toBe(true)
    })

    it('トークンが設定されていない場合はfalseを返す', () => {
      expect(manager.hasToken('npm')).toBe(false)
    })

    it('未知のレジストリの場合はfalseを返す', () => {
      expect(manager.hasToken('unknown')).toBe(false)
    })
  })

  describe('maskToken', () => {
    it('長いトークンは先頭3文字と末尾3文字のみ表示する', () => {
      const token = 'abcdef123456'
      const masked = manager.maskToken(token)

      expect(masked).toBe('abc...456')
    })

    it('短いトークン（10文字未満）は完全にマスクする', () => {
      const token = 'short'
      const masked = manager.maskToken(token)

      expect(masked).toBe('****')
    })

    it('空文字列は完全にマスクする', () => {
      const masked = manager.maskToken('')

      expect(masked).toBe('****')
    })

    it('10文字のトークンは正しくマスクする', () => {
      const token = '0123456789'
      const masked = manager.maskToken(token)

      expect(masked).toBe('012...789')
    })

    it('非常に長いトークンでも正しくマスクする', () => {
      const token = 'a'.repeat(100)
      const masked = manager.maskToken(token)

      expect(masked).toBe('aaa...aaa')
    })
  })

  describe('maskTokensInString', () => {
    it('文字列内のトークンをマスクする', () => {
      const token = 'secret_token_12345'
      manager.setTokenForTesting('npm', token)

      const str = `NPM token is: ${token}`
      const masked = manager.maskTokensInString(str)

      expect(masked).toBe('NPM token is: sec...345')
      expect(masked).not.toContain(token)
    })

    it('複数のトークンをマスクする', () => {
      const npmToken = 'npm_secret_12345'
      const pypiToken = 'pypi_secret_67890'

      manager.setTokenForTesting('npm', npmToken)
      manager.setTokenForTesting('pypi', pypiToken)

      const str = `NPM: ${npmToken}, PyPI: ${pypiToken}`
      const masked = manager.maskTokensInString(str)

      expect(masked).toContain('npm...345')
      expect(masked).toContain('pyp...890')
      expect(masked).not.toContain(npmToken)
      expect(masked).not.toContain(pypiToken)
    })

    it('トークンが含まれていない文字列はそのまま返す', () => {
      const str = 'No tokens here'
      const masked = manager.maskTokensInString(str)

      expect(masked).toBe(str)
    })

    it('同じトークンが複数回出現する場合は全てマスクする', () => {
      const token = 'repeated_token_123'
      manager.setTokenForTesting('npm', token)

      const str = `Token1: ${token}, Token2: ${token}`
      const masked = manager.maskTokensInString(str)

      expect(masked).toBe('Token1: rep...123, Token2: rep...123')
    })

    it('正規表現の特殊文字を含むトークンを正しくマスクする', () => {
      const token = 'token.with$pecial^chars*'
      manager.setTokenForTesting('npm', token)

      const str = `Token: ${token}`
      const masked = manager.maskTokensInString(str)

      expect(masked).not.toContain(token)
      expect(masked).toContain('tok...rs*')
    })
  })

  describe('getTokenName', () => {
    it('NPMのトークン名を返す', () => {
      expect(manager.getTokenName('npm')).toBe('NPM_TOKEN')
    })

    it('Crates.ioのトークン名を返す', () => {
      expect(manager.getTokenName('crates.io')).toBe('CARGO_REGISTRY_TOKEN')
    })

    it('PyPIのトークン名を返す', () => {
      expect(manager.getTokenName('pypi')).toBe('PYPI_TOKEN')
    })

    it('Homebrewのトークン名を返す', () => {
      expect(manager.getTokenName('homebrew')).toBe('HOMEBREW_GITHUB_API_TOKEN')
    })

    it('未知のレジストリの場合はundefinedを返す', () => {
      expect(manager.getTokenName('unknown')).toBeUndefined()
    })
  })

  describe('getSupportedRegistries', () => {
    it('サポートされている全レジストリを返す', () => {
      const registries = manager.getSupportedRegistries()

      expect(registries).toEqual(['npm', 'crates.io', 'pypi', 'homebrew'])
    })

    it('返される配列は4要素を含む', () => {
      const registries = manager.getSupportedRegistries()

      expect(registries).toHaveLength(4)
    })
  })

  describe('setTokenForTesting', () => {
    it('テスト用にトークンを設定できる', () => {
      const token = 'test_token_123'
      manager.setTokenForTesting('npm', token)

      expect(manager.getToken('npm')).toBe(token)
    })

    it('未知のレジストリにはトークンを設定しない', () => {
      manager.setTokenForTesting('unknown', 'token')

      expect(manager.getToken('unknown')).toBeUndefined()
    })

    it('既存のトークンを上書きできる', () => {
      manager.setTokenForTesting('npm', 'old_token')
      manager.setTokenForTesting('npm', 'new_token')

      expect(manager.getToken('npm')).toBe('new_token')
    })
  })

  describe('clearTokenForTesting', () => {
    it('テスト用にトークンをクリアできる', () => {
      manager.setTokenForTesting('npm', 'test_token')
      manager.clearTokenForTesting('npm')

      expect(manager.getToken('npm')).toBeUndefined()
      expect(manager.hasToken('npm')).toBe(false)
    })

    it('未知のレジストリのクリアは何もしない', () => {
      // Should not throw
      expect(() => manager.clearTokenForTesting('unknown')).not.toThrow()
    })

    it('設定されていないトークンのクリアは何もしない', () => {
      expect(() => manager.clearTokenForTesting('npm')).not.toThrow()
    })
  })

  describe('統合テスト', () => {
    it('複数レジストリのトークンを同時に管理できる', () => {
      manager.setTokenForTesting('npm', 'npm_token_123')
      manager.setTokenForTesting('pypi', 'pypi_token_456')

      expect(manager.hasToken('npm')).toBe(true)
      expect(manager.hasToken('pypi')).toBe(true)
      expect(manager.hasToken('crates.io')).toBe(false)
    })

    it('トークンのライフサイクル（設定→取得→マスク→クリア）が正しく動作する', () => {
      const token = 'lifecycle_test_token_12345'

      // 設定
      manager.setTokenForTesting('npm', token)
      expect(manager.hasToken('npm')).toBe(true)

      // 取得
      expect(manager.getToken('npm')).toBe(token)

      // マスク
      const masked = manager.maskToken(token)
      expect(masked).not.toBe(token)
      expect(masked).toBe('lif...345')

      // クリア
      manager.clearTokenForTesting('npm')
      expect(manager.hasToken('npm')).toBe(false)
    })
  })
})
