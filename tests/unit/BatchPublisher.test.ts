import { BatchPublisher } from '../../src/core/BatchPublisher'
import { PackagePublisher } from '../../src/core/PackagePublisher'
import { PublishReport } from '../../src/core/interfaces'

// Mock PackagePublisher
jest.mock('../../src/core/PackagePublisher')

const MockedPackagePublisher = PackagePublisher as jest.MockedClass<typeof PackagePublisher>

describe('BatchPublisher', () => {
  let batchPublisher: BatchPublisher
  const projectPath = '/test/project'

  // Helper function to create a successful PublishReport
  const createSuccessReport = (registry: string, overrides: Partial<PublishReport> = {}): PublishReport => ({
    success: true,
    registry,
    packageName: 'test-package',
    version: '1.0.0',
    verificationUrl: `https://${registry}.test/package`,
    errors: [],
    warnings: [],
    duration: 100,
    state: 'SUCCESS',
    ...overrides
  })

  // Helper function to create a failed PublishReport
  const createFailureReport = (registry: string, error: string, overrides: Partial<PublishReport> = {}): PublishReport => ({
    success: false,
    registry,
    packageName: 'unknown',
    version: '0.0.0',
    errors: [error],
    warnings: [],
    duration: 50,
    state: 'FAILED',
    ...overrides
  })

  beforeEach(() => {
    batchPublisher = new BatchPublisher(projectPath)
    jest.clearAllMocks()
    // Suppress console output during tests
    jest.spyOn(console, 'log').mockImplementation()
    jest.spyOn(console, 'error').mockImplementation()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('publishToMultiple - 基本機能', () => {
    it('レジストリが空の場合はエラーを投げる', async () => {
      await expect(batchPublisher.publishToMultiple([])).rejects.toThrow(
        'At least one registry must be specified'
      )
    })

    it('単一レジストリへの公開が成功する', async () => {
      const mockPublish = jest.fn().mockResolvedValue(createSuccessReport('npm'))

      MockedPackagePublisher.mockImplementation(() => ({
        publish: mockPublish
      } as any))

      const result = await batchPublisher.publishToMultiple(['npm'])

      expect(result.success).toBe(true)
      expect(result.succeeded).toEqual(['npm'])
      expect(result.failed.size).toBe(0)
      expect(result.skipped).toEqual([])
      expect(mockPublish).toHaveBeenCalledWith({ nonInteractive: true })
    })

    it('複数レジストリへの公開が成功する', async () => {
      let callCount = 0
      const registries = ['npm', 'pypi', 'crates.io']
      const mockPublish = jest.fn().mockImplementation(() => {
        const registry = registries[callCount++]
        return Promise.resolve(createSuccessReport(registry))
      })

      MockedPackagePublisher.mockImplementation(() => ({
        publish: mockPublish
      } as any))

      const result = await batchPublisher.publishToMultiple(registries)

      expect(result.success).toBe(true)
      expect(result.succeeded).toHaveLength(3)
      expect(result.succeeded).toEqual(registries)
      expect(mockPublish).toHaveBeenCalledTimes(3)
    })
  })

  describe('publishToMultiple - 並列公開', () => {
    it('デフォルトで並列公開を実行する', async () => {
      const publishTimes: number[] = []
      let callCount = 0
      const registries = ['npm', 'pypi', 'crates.io']
      const mockPublish = jest.fn().mockImplementation(() => {
        publishTimes.push(Date.now())
        const registry = registries[callCount++]
        return Promise.resolve(createSuccessReport(registry))
      })

      MockedPackagePublisher.mockImplementation(() => ({
        publish: mockPublish
      } as any))

      await batchPublisher.publishToMultiple(registries)

      // 並列実行では開始時刻が近いはず（100ms以内）
      const timeDiff = Math.max(...publishTimes) - Math.min(...publishTimes)
      expect(timeDiff).toBeLessThan(100)
    })

    it('maxConcurrency設定で並列実行数を制御できる', async () => {
      const activeCount = { current: 0, max: 0 }
      let callCount = 0
      const registries = ['npm', 'pypi', 'crates.io', 'homebrew', 'maven']

      const mockPublish = jest.fn().mockImplementation(async () => {
        activeCount.current++
        activeCount.max = Math.max(activeCount.max, activeCount.current)
        await new Promise(resolve => setTimeout(resolve, 50))
        const registry = registries[callCount++]
        activeCount.current--
        return createSuccessReport(registry)
      })

      MockedPackagePublisher.mockImplementation(() => ({
        publish: mockPublish
      } as any))

      await batchPublisher.publishToMultiple(registries, { maxConcurrency: 2 })

      expect(activeCount.max).toBeLessThanOrEqual(2)
    })
  })

  describe('publishToMultiple - 直列公開', () => {
    it('sequential=trueで直列公開を実行する', async () => {
      const publishOrder: string[] = []
      let callCount = 0
      const registries = ['npm', 'pypi', 'crates.io']

      const mockPublish = jest.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
        const registry = registries[callCount++]
        publishOrder.push(registry)
        return createSuccessReport(registry)
      })

      MockedPackagePublisher.mockImplementation(() => ({
        publish: mockPublish
      } as any))

      await batchPublisher.publishToMultiple(registries, { sequential: true })

      expect(publishOrder).toEqual(registries)
    })

    it('sequential公開では失敗時にcontinueOnError=falseで残りをスキップする', async () => {
      let callCount = 0
      const registries = ['npm', 'pypi', 'crates.io']

      const mockPublish = jest.fn().mockImplementation(async () => {
        const registry = registries[callCount++]
        if (registry === 'pypi') {
          return createFailureReport(registry, 'Publish failed')
        }
        return createSuccessReport(registry)
      })

      MockedPackagePublisher.mockImplementation(() => ({
        publish: mockPublish
      } as any))

      const result = await batchPublisher.publishToMultiple(registries, {
        sequential: true,
        continueOnError: false
      })

      expect(result.succeeded).toEqual(['npm'])
      expect(result.failed.size).toBe(1)
      expect(result.failed.has('pypi')).toBe(true)
      expect(result.skipped).toEqual(['crates.io'])
      expect(mockPublish).toHaveBeenCalledTimes(2) // npm, pypi のみ
    })

    it('sequential公開でcontinueOnError=trueで全て実行する', async () => {
      let callCount = 0
      const registries = ['npm', 'pypi', 'crates.io']

      const mockPublish = jest.fn().mockImplementation(async () => {
        const registry = registries[callCount++]
        if (registry === 'pypi') {
          return createFailureReport(registry, 'Publish failed')
        }
        return createSuccessReport(registry)
      })

      MockedPackagePublisher.mockImplementation(() => ({
        publish: mockPublish
      } as any))

      const result = await batchPublisher.publishToMultiple(registries, {
        sequential: true,
        continueOnError: true
      })

      expect(result.succeeded).toEqual(['npm', 'crates.io'])
      expect(result.failed.size).toBe(1)
      expect(result.skipped).toEqual([])
      expect(mockPublish).toHaveBeenCalledTimes(3)
    })
  })

  describe('publishToMultiple - エラーハンドリング', () => {
    it('公開失敗時のエラーを正しく記録する', async () => {
      const mockPublish = jest.fn()
        .mockResolvedValueOnce(createSuccessReport('npm'))
        .mockResolvedValueOnce(createFailureReport('pypi', 'Authentication failed'))

      MockedPackagePublisher.mockImplementation(() => ({
        publish: mockPublish
      } as any))

      const result = await batchPublisher.publishToMultiple(['npm', 'pypi'])

      expect(result.succeeded).toEqual(['npm'])
      expect(result.failed.size).toBe(1)
      expect(result.failed.get('pypi')?.message).toBe('Authentication failed')
    })

    it('例外をスローした場合もエラーとして記録する', async () => {
      const mockPublish = jest.fn()
        .mockResolvedValueOnce(createSuccessReport('npm'))
        .mockRejectedValueOnce(new Error('Network error'))

      MockedPackagePublisher.mockImplementation(() => ({
        publish: mockPublish
      } as any))

      const result = await batchPublisher.publishToMultiple(['npm', 'pypi'])

      expect(result.succeeded).toEqual(['npm'])
      expect(result.failed.size).toBe(1)
      expect(result.failed.get('pypi')?.message).toBe('Network error')
    })

    it('並列公開でcontinueOnError=trueの場合、全て実行する', async () => {
      let callCount = 0
      const registries = ['npm', 'pypi', 'crates.io', 'homebrew']

      const mockPublish = jest.fn().mockImplementation(async () => {
        const registry = registries[callCount++]
        if (callCount % 2 === 0) {
          return createFailureReport(registry, 'Failed')
        }
        return createSuccessReport(registry)
      })

      MockedPackagePublisher.mockImplementation(() => ({
        publish: mockPublish
      } as any))

      const result = await batchPublisher.publishToMultiple(registries, { continueOnError: true })

      expect(mockPublish).toHaveBeenCalledTimes(4)
      expect(result.succeeded.length + result.failed.size).toBe(4)
      expect(result.skipped).toEqual([])
    })
  })

  describe('publishToMultiple - 結果レポート', () => {
    it('成功したレジストリの詳細レポートを作成する', async () => {
      const mockPublish = jest.fn().mockResolvedValue(
        createSuccessReport('npm', {
          packageName: 'my-package',
          version: '2.0.0',
          verificationUrl: 'https://registry.test/my-package'
        })
      )

      MockedPackagePublisher.mockImplementation(() => ({
        publish: mockPublish
      } as any))

      const result = await batchPublisher.publishToMultiple(['npm'])

      const report = result.results.get('npm')
      expect(report).toBeDefined()
      expect(report?.success).toBe(true)
      expect(report?.registry).toBe('npm')
      expect(report?.packageName).toBe('my-package')
      expect(report?.version).toBe('2.0.0')
      expect(report?.verificationUrl).toBe('https://registry.test/my-package')
      expect(report?.state).toBe('SUCCESS')
      expect(report?.errors).toEqual([])
    })

    it('失敗したレジストリの詳細レポートを作成する', async () => {
      const mockPublish = jest.fn().mockResolvedValue(createFailureReport('npm', 'Permission denied'))

      MockedPackagePublisher.mockImplementation(() => ({
        publish: mockPublish
      } as any))

      const result = await batchPublisher.publishToMultiple(['npm'])

      const report = result.results.get('npm')
      expect(report).toBeDefined()
      expect(report?.success).toBe(false)
      expect(report?.registry).toBe('npm')
      expect(report?.state).toBe('FAILED')
      expect(report?.errors).toEqual(['Permission denied'])
    })

    it('全成功時はresult.successがtrueになる', async () => {
      let callCount = 0
      const registries = ['npm', 'pypi']
      const mockPublish = jest.fn().mockImplementation(() => {
        const registry = registries[callCount++]
        return Promise.resolve(createSuccessReport(registry))
      })

      MockedPackagePublisher.mockImplementation(() => ({
        publish: mockPublish
      } as any))

      const result = await batchPublisher.publishToMultiple(registries)

      expect(result.success).toBe(true)
    })

    it('失敗がある場合はresult.successがfalseになる', async () => {
      const mockPublish = jest.fn()
        .mockResolvedValueOnce(createSuccessReport('npm'))
        .mockResolvedValueOnce(createFailureReport('pypi', 'Failed'))

      MockedPackagePublisher.mockImplementation(() => ({
        publish: mockPublish
      } as any))

      const result = await batchPublisher.publishToMultiple(['npm', 'pypi'])

      expect(result.success).toBe(false)
    })

    it('スキップがある場合はresult.successがfalseになる', async () => {
      const mockPublish = jest.fn().mockResolvedValueOnce(createFailureReport('npm', 'Failed'))

      MockedPackagePublisher.mockImplementation(() => ({
        publish: mockPublish
      } as any))

      const result = await batchPublisher.publishToMultiple(['npm', 'pypi'], {
        sequential: true,
        continueOnError: false
      })

      expect(result.success).toBe(false)
      expect(result.skipped.length).toBeGreaterThan(0)
    })
  })

  describe('publishToMultiple - PublishOptions統合', () => {
    it('publishOptionsが各レジストリに渡される', async () => {
      const mockPublish = jest.fn().mockResolvedValue(createSuccessReport('npm'))

      MockedPackagePublisher.mockImplementation(() => ({
        publish: mockPublish
      } as any))

      await batchPublisher.publishToMultiple(['npm'], {
        publishOptions: {
          tag: 'beta',
          access: 'public',
          otp: '123456'
        }
      })

      expect(mockPublish).toHaveBeenCalledWith({
        tag: 'beta',
        access: 'public',
        otp: '123456',
        nonInteractive: true
      })
    })

    it('nonInteractiveは常にtrueで上書きされる', async () => {
      const mockPublish = jest.fn().mockResolvedValue(createSuccessReport('npm'))

      MockedPackagePublisher.mockImplementation(() => ({
        publish: mockPublish
      } as any))

      await batchPublisher.publishToMultiple(['npm'], {
        publishOptions: {
          nonInteractive: false // これは無視される
        }
      })

      expect(mockPublish).toHaveBeenCalledWith({
        nonInteractive: true
      })
    })
  })

  describe('publishToMultiple - 部分的成功', () => {
    it('一部成功、一部失敗のケースを正しく処理する', async () => {
      const mockPublish = jest.fn()
        .mockResolvedValueOnce(createSuccessReport('npm'))
        .mockResolvedValueOnce(createFailureReport('pypi', 'Auth failed'))
        .mockResolvedValueOnce(createSuccessReport('crates.io'))

      MockedPackagePublisher.mockImplementation(() => ({
        publish: mockPublish
      } as any))

      const result = await batchPublisher.publishToMultiple(['npm', 'pypi', 'crates.io'], {
        continueOnError: true
      })

      expect(result.succeeded).toHaveLength(2)
      expect(result.failed.size).toBe(1)
      expect(result.skipped).toHaveLength(0)
      expect(result.success).toBe(false)
    })
  })

  describe('printSummary - サマリー出力', () => {
    it('成功・失敗・スキップの統計が表示される', async () => {
      const consoleSpy = jest.spyOn(console, 'log')

      const mockPublish = jest.fn()
        .mockResolvedValueOnce(createSuccessReport('npm'))
        .mockResolvedValueOnce(createFailureReport('pypi', 'Failed'))

      MockedPackagePublisher.mockImplementation(() => ({
        publish: mockPublish
      } as any))

      await batchPublisher.publishToMultiple(['npm', 'pypi', 'crates.io'], {
        sequential: true,
        continueOnError: false
      })

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Batch Publish Summary'))
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Succeeded: 1'))
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed: 1'))
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Skipped: 1'))
    })
  })
})
