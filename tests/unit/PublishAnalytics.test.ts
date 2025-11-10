/**
 * Tests for PublishAnalytics
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { PublishAnalytics } from '../../src/core/PublishAnalytics'
import { PublishReport } from '../../src/core/interfaces'

describe('PublishAnalytics', () => {
  let analytics: PublishAnalytics
  let tempDir: string

  beforeEach(async () => {
    // Create temporary directory for testing
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'analytics-test-'))
    analytics = new PublishAnalytics(tempDir)
    await analytics.initialize()
  })

  afterEach(async () => {
    // Clean up temporary directory
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  // ============================================================================
  // Initialization Tests
  // ============================================================================

  describe('initialize', () => {
    it('should initialize with empty records', async () => {
      const records = analytics.getRecords()
      expect(records).toEqual([])
    })

    it('should load existing records from file', async () => {
      // Create test data
      const report = createMockReport('npm', 'test-package', '1.0.0', true)
      await analytics.recordPublish(report)

      // Create new analytics instance to test loading
      const analytics2 = new PublishAnalytics(tempDir)
      await analytics2.initialize()

      const records = analytics2.getRecords()
      expect(records.length).toBe(1)
      expect(records[0].packageName).toBe('test-package')
    })
  })

  // ============================================================================
  // Record Publishing Tests
  // ============================================================================

  describe('recordPublish', () => {
    it('should record a successful publish', async () => {
      const report = createMockReport('npm', 'test-package', '1.0.0', true)
      await analytics.recordPublish(report)

      const records = analytics.getRecords()
      expect(records.length).toBe(1)
      expect(records[0].success).toBe(true)
      expect(records[0].registry).toBe('npm')
      expect(records[0].packageName).toBe('test-package')
      expect(records[0].version).toBe('1.0.0')
    })

    it('should record a failed publish', async () => {
      const report = createMockReport('npm', 'test-package', '1.0.0', false, [
        'Authentication failed',
      ])
      await analytics.recordPublish(report)

      const records = analytics.getRecords()
      expect(records.length).toBe(1)
      expect(records[0].success).toBe(false)
      expect(records[0].error).toBe('Authentication failed')
    })

    it('should record multiple publishes', async () => {
      await analytics.recordPublish(createMockReport('npm', 'pkg1', '1.0.0', true))
      await analytics.recordPublish(createMockReport('pypi', 'pkg2', '2.0.0', true))
      await analytics.recordPublish(createMockReport('crates', 'pkg3', '3.0.0', false))

      const records = analytics.getRecords()
      expect(records.length).toBe(3)
    })

    it('should persist records to disk', async () => {
      await analytics.recordPublish(createMockReport('npm', 'test-package', '1.0.0', true))

      const analyticsFile = path.join(tempDir, '.package-publisher', 'analytics.json')
      const fileExists = await fs
        .access(analyticsFile)
        .then(() => true)
        .catch(() => false)

      expect(fileExists).toBe(true)
    })
  })

  // ============================================================================
  // Filtering Tests
  // ============================================================================

  describe('getRecords', () => {
    beforeEach(async () => {
      // Seed test data
      await analytics.recordPublish(createMockReport('npm', 'pkg1', '1.0.0', true))
      await analytics.recordPublish(createMockReport('npm', 'pkg2', '2.0.0', false))
      await analytics.recordPublish(createMockReport('pypi', 'pkg1', '1.0.0', true))
      await analytics.recordPublish(createMockReport('pypi', 'pkg3', '3.0.0', true))
      await analytics.recordPublish(createMockReport('crates', 'pkg1', '1.0.0', false))
    })

    it('should filter by registry', () => {
      const npmRecords = analytics.getRecords({ registry: 'npm' })
      expect(npmRecords.length).toBe(2)
      expect(npmRecords.every((r) => r.registry === 'npm')).toBe(true)
    })

    it('should filter by package name', () => {
      const pkg1Records = analytics.getRecords({ packageName: 'pkg1' })
      expect(pkg1Records.length).toBe(3)
      expect(pkg1Records.every((r) => r.packageName === 'pkg1')).toBe(true)
    })

    it('should filter by success status', () => {
      const successRecords = analytics.getRecords({ successOnly: true })
      expect(successRecords.length).toBe(3)
      expect(successRecords.every((r) => r.success)).toBe(true)
    })

    it('should filter by failure status', () => {
      const failureRecords = analytics.getRecords({ failuresOnly: true })
      expect(failureRecords.length).toBe(2)
      expect(failureRecords.every((r) => !r.success)).toBe(true)
    })

    it('should limit results', () => {
      const limited = analytics.getRecords({ limit: 2 })
      expect(limited.length).toBe(2)
    })

    it('should combine multiple filters', () => {
      const filtered = analytics.getRecords({
        registry: 'npm',
        successOnly: true,
      })
      expect(filtered.length).toBe(1)
      expect(filtered[0].registry).toBe('npm')
      expect(filtered[0].success).toBe(true)
    })

    it('should sort by timestamp descending', () => {
      const records = analytics.getRecords()
      for (let i = 1; i < records.length; i++) {
        expect(records[i - 1].timestamp.getTime()).toBeGreaterThanOrEqual(
          records[i].timestamp.getTime()
        )
      }
    })
  })

  // ============================================================================
  // Statistics Tests
  // ============================================================================

  describe('getStatistics', () => {
    beforeEach(async () => {
      await analytics.recordPublish(createMockReport('npm', 'pkg1', '1.0.0', true, [], 1000))
      await analytics.recordPublish(createMockReport('npm', 'pkg1', '1.0.1', true, [], 2000))
      await analytics.recordPublish(createMockReport('npm', 'pkg1', '1.0.2', false, [], 3000))
      await analytics.recordPublish(createMockReport('pypi', 'pkg1', '1.0.0', true, [], 4000))
    })

    it('should calculate overall statistics', () => {
      const stats = analytics.getStatistics()

      expect(stats.totalAttempts).toBe(4)
      expect(stats.successCount).toBe(3)
      expect(stats.failureCount).toBe(1)
      expect(stats.successRate).toBe(75)
      expect(stats.averageDuration).toBe(2500)
    })

    it('should calculate registry-specific statistics', () => {
      const stats = analytics.getStatistics()

      const npmStats = stats.byRegistry.get('npm')
      expect(npmStats).toBeDefined()
      expect(npmStats!.attempts).toBe(3)
      expect(npmStats!.successes).toBe(2)
      expect(npmStats!.failures).toBe(1)
      expect(npmStats!.successRate).toBeCloseTo(66.67, 1)
      expect(npmStats!.averageDuration).toBe(2000)

      const pypiStats = stats.byRegistry.get('pypi')
      expect(pypiStats).toBeDefined()
      expect(pypiStats!.attempts).toBe(1)
      expect(pypiStats!.successes).toBe(1)
      expect(pypiStats!.successRate).toBe(100)
    })

    it('should include last publish information', () => {
      const stats = analytics.getStatistics()
      const npmStats = stats.byRegistry.get('npm')

      expect(npmStats!.lastVersion).toBe('1.0.2')
      expect(npmStats!.lastPublish).toBeInstanceOf(Date)
    })

    it('should handle empty records', () => {
      const emptyAnalytics = new PublishAnalytics(tempDir)
      const stats = emptyAnalytics.getStatistics()

      expect(stats.totalAttempts).toBe(0)
      expect(stats.successCount).toBe(0)
      expect(stats.successRate).toBe(0)
    })

    it('should calculate time range', () => {
      const stats = analytics.getStatistics()

      expect(stats.timeRange.start).toBeInstanceOf(Date)
      expect(stats.timeRange.end).toBeInstanceOf(Date)
      expect(stats.timeRange.end.getTime()).toBeGreaterThanOrEqual(
        stats.timeRange.start.getTime()
      )
    })
  })

  // ============================================================================
  // Report Generation Tests
  // ============================================================================

  describe('generateReport', () => {
    beforeEach(async () => {
      await analytics.recordPublish(createMockReport('npm', 'test-pkg', '1.0.0', true))
      await analytics.recordPublish(createMockReport('npm', 'test-pkg', '1.0.1', false))
      await analytics.recordPublish(createMockReport('pypi', 'test-pkg', '1.0.0', true))
    })

    it('should generate a complete report', async () => {
      const report = await analytics.generateReport()

      expect(report.title).toContain('Analytics Report')
      expect(report.generatedAt).toBeInstanceOf(Date)
      expect(report.statistics).toBeDefined()
      expect(report.recentPublishes).toBeDefined()
      expect(report.markdownSummary).toBeTruthy()
      expect(report.jsonData).toBeTruthy()
    })

    it('should generate markdown summary', async () => {
      const report = await analytics.generateReport()

      expect(report.markdownSummary).toContain('# Publishing Analytics Report')
      expect(report.markdownSummary).toContain('## Overall Statistics')
      expect(report.markdownSummary).toContain('Total Attempts')
      expect(report.markdownSummary).toContain('Success Rate')
      expect(report.markdownSummary).toContain('## Registry Statistics')
      expect(report.markdownSummary).toContain('## Recent Publishes')
    })

    it('should generate JSON export', async () => {
      const report = await analytics.generateReport()
      const jsonData = JSON.parse(report.jsonData)

      expect(jsonData.generatedAt).toBeDefined()
      expect(jsonData.statistics).toBeDefined()
      expect(jsonData.recentPublishes).toBeDefined()
      expect(Array.isArray(jsonData.recentPublishes)).toBe(true)
    })

    it('should limit recent publishes', async () => {
      const report = await analytics.generateReport({ limit: 2 })

      expect(report.recentPublishes.length).toBe(2)
    })

    it('should filter report by registry', async () => {
      const report = await analytics.generateReport({ registry: 'npm' })

      expect(report.title).toContain('npm')
      expect(report.recentPublishes.every((r) => r.registry === 'npm')).toBe(true)
    })
  })

  // ============================================================================
  // Data Management Tests
  // ============================================================================

  describe('clearData', () => {
    it('should clear all analytics data', async () => {
      await analytics.recordPublish(createMockReport('npm', 'pkg1', '1.0.0', true))
      await analytics.recordPublish(createMockReport('pypi', 'pkg2', '2.0.0', true))

      expect(analytics.getRecords().length).toBe(2)

      await analytics.clearData()

      expect(analytics.getRecords().length).toBe(0)
    })

    it('should persist cleared state to disk', async () => {
      await analytics.recordPublish(createMockReport('npm', 'pkg1', '1.0.0', true))
      await analytics.clearData()

      // Reload from disk
      const analytics2 = new PublishAnalytics(tempDir)
      await analytics2.initialize()

      expect(analytics2.getRecords().length).toBe(0)
    })
  })
})

// ============================================================================
// Helper Functions
// ============================================================================

function createMockReport(
  registry: string,
  packageName: string,
  version: string,
  success: boolean,
  errors: string[] = [],
  duration: number = 1000
): PublishReport {
  return {
    success,
    registry,
    packageName,
    version,
    publishedAt: new Date(),
    verificationUrl: `https://${registry}.example.com/${packageName}/${version}`,
    errors,
    warnings: [],
    duration,
    state: success ? 'SUCCESS' : 'FAILED',
  }
}
