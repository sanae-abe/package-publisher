/**
 * PublishAnalytics - Track and analyze package publishing statistics
 */

import fs from 'fs/promises'
import path from 'path'
import {
  AnalyticsRecord,
  AnalyticsOptions,
  AnalyticsReport,
  PublishStatistics,
  RegistryStatistics,
  PublishReport,
} from './interfaces.js'

export class PublishAnalytics {
  private records: AnalyticsRecord[] = []
  private dataFilePath: string

  constructor(projectPath: string = process.cwd()) {
    const analyticsDir = path.join(projectPath, '.package-publisher')
    this.dataFilePath = path.join(analyticsDir, 'analytics.json')
  }

  /**
   * Initialize analytics by loading existing data
   */
  async initialize(): Promise<void> {
    try {
      await this.loadRecords()
    } catch (error) {
      // If file doesn't exist, start with empty records
      this.records = []
    }
  }

  /**
   * Record a publish attempt
   */
  async recordPublish(report: PublishReport): Promise<void> {
    const record: AnalyticsRecord = {
      id: this.generateId(),
      registry: report.registry,
      packageName: report.packageName,
      version: report.version,
      success: report.success,
      error: report.errors.length > 0 ? report.errors.join('; ') : undefined,
      duration: report.duration,
      timestamp: report.publishedAt || new Date(),
      metadata: {
        state: report.state,
        warnings: report.warnings,
        verificationUrl: report.verificationUrl,
      },
    }

    this.records.push(record)
    await this.saveRecords()
  }

  /**
   * Get filtered records
   */
  getRecords(options: AnalyticsOptions = {}): AnalyticsRecord[] {
    let filtered = [...this.records]

    if (options.registry) {
      filtered = filtered.filter((r) => r.registry === options.registry)
    }

    if (options.packageName) {
      filtered = filtered.filter((r) => r.packageName === options.packageName)
    }

    if (options.startDate) {
      filtered = filtered.filter((r) => r.timestamp >= options.startDate!)
    }

    if (options.endDate) {
      filtered = filtered.filter((r) => r.timestamp <= options.endDate!)
    }

    if (options.successOnly) {
      filtered = filtered.filter((r) => r.success)
    }

    if (options.failuresOnly) {
      filtered = filtered.filter((r) => !r.success)
    }

    // Sort by timestamp descending (most recent first)
    filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

    if (options.limit !== undefined && options.limit > 0) {
      filtered = filtered.slice(0, options.limit)
    }

    return filtered
  }

  /**
   * Calculate statistics from records
   */
  getStatistics(options: AnalyticsOptions = {}): PublishStatistics {
    const records = this.getRecords(options)

    if (records.length === 0) {
      return this.getEmptyStatistics()
    }

    const successCount = records.filter((r) => r.success).length
    const failureCount = records.length - successCount
    const totalDuration = records.reduce((sum, r) => sum + r.duration, 0)
    const averageDuration = totalDuration / records.length

    // Calculate registry-specific statistics
    const byRegistry = this.calculateRegistryStatistics(records)

    // Determine time range
    const timestamps = records.map((r) => r.timestamp.getTime())
    const start = new Date(Math.min(...timestamps))
    const end = new Date(Math.max(...timestamps))

    return {
      totalAttempts: records.length,
      successCount,
      failureCount,
      successRate: (successCount / records.length) * 100,
      averageDuration,
      byRegistry,
      timeRange: { start, end },
    }
  }

  /**
   * Generate a comprehensive report
   */
  async generateReport(options: AnalyticsOptions = {}): Promise<AnalyticsReport> {
    const statistics = this.getStatistics(options)
    const recentPublishes = this.getRecords({ ...options, limit: options.limit || 10 })

    const markdownSummary = this.generateMarkdownSummary(statistics, recentPublishes)
    const jsonData = this.generateJsonExport(statistics, recentPublishes)

    return {
      title: this.generateReportTitle(options),
      generatedAt: new Date(),
      statistics,
      recentPublishes,
      markdownSummary,
      jsonData,
    }
  }

  /**
   * Clear all analytics data
   */
  async clearData(): Promise<void> {
    this.records = []
    await this.saveRecords()
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  private async loadRecords(): Promise<void> {
    const data = await fs.readFile(this.dataFilePath, 'utf-8')
    const parsed = JSON.parse(data) as { records: AnalyticsRecord[] }

    // Convert timestamp strings back to Date objects
    this.records = parsed.records.map((r) => ({
      ...r,
      timestamp: new Date(r.timestamp),
    }))
  }

  private async saveRecords(): Promise<void> {
    const dir = path.dirname(this.dataFilePath)
    await fs.mkdir(dir, { recursive: true })

    const data = {
      version: '1.0',
      records: this.records,
      lastUpdated: new Date().toISOString(),
    }

    await fs.writeFile(this.dataFilePath, JSON.stringify(data, null, 2), 'utf-8')
  }

  private calculateRegistryStatistics(records: AnalyticsRecord[]): Map<string, RegistryStatistics> {
    const registryMap = new Map<string, RegistryStatistics>()

    // Group records by registry
    const grouped = new Map<string, AnalyticsRecord[]>()
    for (const record of records) {
      const existing = grouped.get(record.registry) || []
      existing.push(record)
      grouped.set(record.registry, existing)
    }

    // Calculate statistics for each registry
    for (const [registry, regRecords] of grouped.entries()) {
      const successes = regRecords.filter((r) => r.success).length
      const attempts = regRecords.length
      const totalDuration = regRecords.reduce((sum, r) => sum + r.duration, 0)

      // Find the most recent publish
      const sorted = [...regRecords].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      const mostRecent = sorted[0]

      registryMap.set(registry, {
        registry,
        attempts,
        successes,
        failures: attempts - successes,
        successRate: (successes / attempts) * 100,
        averageDuration: totalDuration / attempts,
        lastPublish: mostRecent.timestamp,
        lastVersion: mostRecent.version,
      })
    }

    return registryMap
  }

  private getEmptyStatistics(): PublishStatistics {
    return {
      totalAttempts: 0,
      successCount: 0,
      failureCount: 0,
      successRate: 0,
      averageDuration: 0,
      byRegistry: new Map(),
      timeRange: {
        start: new Date(),
        end: new Date(),
      },
    }
  }

  private generateReportTitle(options: AnalyticsOptions): string {
    const parts = ['Publishing Analytics Report']

    if (options.registry) {
      parts.push(`- ${options.registry}`)
    }

    if (options.packageName) {
      parts.push(`- ${options.packageName}`)
    }

    return parts.join(' ')
  }

  private generateMarkdownSummary(
    statistics: PublishStatistics,
    recentPublishes: AnalyticsRecord[]
  ): string {
    const lines: string[] = []

    lines.push('# Publishing Analytics Report')
    lines.push('')
    lines.push(`**Generated**: ${new Date().toISOString()}`)
    lines.push('')

    // Overall Statistics
    lines.push('## Overall Statistics')
    lines.push('')
    lines.push(`- **Total Attempts**: ${statistics.totalAttempts}`)
    lines.push(`- **Successful**: ${statistics.successCount}`)
    lines.push(`- **Failed**: ${statistics.failureCount}`)
    lines.push(`- **Success Rate**: ${statistics.successRate.toFixed(2)}%`)
    lines.push(`- **Average Duration**: ${(statistics.averageDuration / 1000).toFixed(2)}s`)
    lines.push('')

    // Time Range
    if (statistics.totalAttempts > 0) {
      lines.push('### Time Range')
      lines.push('')
      lines.push(`- **Start**: ${statistics.timeRange.start.toISOString()}`)
      lines.push(`- **End**: ${statistics.timeRange.end.toISOString()}`)
      lines.push('')
    }

    // Registry Statistics
    if (statistics.byRegistry.size > 0) {
      lines.push('## Registry Statistics')
      lines.push('')
      lines.push('| Registry | Attempts | Successes | Failures | Success Rate | Avg Duration |')
      lines.push('|----------|----------|-----------|----------|--------------|--------------|')

      for (const stats of statistics.byRegistry.values()) {
        lines.push(
          `| ${stats.registry} | ${stats.attempts} | ${stats.successes} | ${stats.failures} | ${stats.successRate.toFixed(1)}% | ${(stats.averageDuration / 1000).toFixed(2)}s |`
        )
      }
      lines.push('')
    }

    // Recent Publishes
    if (recentPublishes.length > 0) {
      lines.push('## Recent Publishes')
      lines.push('')
      lines.push('| Timestamp | Registry | Package | Version | Status | Duration |')
      lines.push('|-----------|----------|---------|---------|--------|----------|')

      for (const record of recentPublishes) {
        const status = record.success ? '✅ Success' : '❌ Failed'
        const timestamp = record.timestamp.toISOString().split('T')[0]
        const duration = `${(record.duration / 1000).toFixed(2)}s`

        lines.push(
          `| ${timestamp} | ${record.registry} | ${record.packageName} | ${record.version} | ${status} | ${duration} |`
        )
      }
      lines.push('')
    }

    return lines.join('\n')
  }

  private generateJsonExport(
    statistics: PublishStatistics,
    recentPublishes: AnalyticsRecord[]
  ): string {
    const data = {
      generatedAt: new Date().toISOString(),
      statistics: {
        ...statistics,
        byRegistry: Array.from(statistics.byRegistry.entries()).map(([, value]) => value),
      },
      recentPublishes,
    }

    return JSON.stringify(data, null, 2)
  }
}
