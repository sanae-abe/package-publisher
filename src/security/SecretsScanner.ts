import * as fs from 'fs/promises'
import * as path from 'path'
import { ScanReport, SecretFinding, SecretPattern } from '../core/interfaces'

/**
 * Scanner for detecting hardcoded secrets in source code
 */
export class SecretsScanner {
  private static readonly PATTERNS: SecretPattern[] = [
    {
      name: 'Generic API Key',
      regex: /(?:api[_-]?key|apikey|api[_-]?secret)\s*[:=]\s*['"]([a-zA-Z0-9_\-]{20,})['"]]/gi,
      severity: 'critical'
    },
    {
      name: 'AWS Access Key',
      regex: /AKIA[0-9A-Z]{16}/g,
      severity: 'critical'
    },
    {
      name: 'GitHub Token',
      regex: /gh[ps]_[a-zA-Z0-9]{36,}/g,
      severity: 'critical'
    },
    {
      name: 'Generic Secret',
      regex: /(?:secret|password|passwd|pwd)\s*[:=]\s*['"]([^'"]{8,})['"]]/gi,
      severity: 'high'
    },
    {
      name: 'Private Key',
      regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
      severity: 'critical'
    },
    {
      name: 'NPM Token',
      regex: /npm_[a-zA-Z0-9]{36}/g,
      severity: 'critical'
    },
    {
      name: 'PyPI Token',
      regex: /pypi-[a-zA-Z0-9_-]{20,}/g,
      severity: 'critical'
    },
    {
      name: 'Slack Token',
      regex: /xox[baprs]-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24,}/g,
      severity: 'high'
    },
    {
      name: 'Generic Token',
      regex: /(?:token|auth|bearer)\s*[:=]\s*['"]([a-zA-Z0-9_\-\.]{20,})['"]]/gi,
      severity: 'high'
    },
    {
      name: 'Base64 Secret (Suspicious)',
      regex: /(?:secret|password|key|token)\s*[:=]\s*['"]([A-Za-z0-9+/]{40,}={0,2})['"]]/gi,
      severity: 'medium'
    }
  ]

  private static readonly DEFAULT_IGNORE_PATTERNS = [
    /node_modules/,
    /\.git/,
    /dist/,
    /build/,
    /coverage/,
    /\.min\.js$/,
    /\.map$/,
    /package-lock\.json$/,
    /yarn\.lock$/,
    /pnpm-lock\.yaml$/
  ]

  /**
   * Scan a project for hardcoded secrets
   */
  async scanProject(
    projectPath: string,
    allowedFiles: string[] = []
  ): Promise<ScanReport> {
    const findings: SecretFinding[] = []
    let scannedFiles = 0
    const skippedFiles: string[] = []

    const files = await this.getFilesToScan(projectPath)

    for (const file of files) {
      // Skip ignored patterns
      if (this.shouldIgnore(file)) {
        skippedFiles.push(file)
        continue
      }

      try {
        const content = await fs.readFile(file, 'utf-8')
        const fileFindings = this.scanContent(content, file)
        findings.push(...fileFindings)
        scannedFiles++
      } catch (error) {
        // Skip files that can't be read as text
        skippedFiles.push(file)
      }
    }

    return {
      hasSecrets: findings.length > 0,
      findings,
      scannedFiles,
      skippedFiles
    }
  }

  /**
   * Scan content for secrets
   */
  private scanContent(content: string, filePath: string): SecretFinding[] {
    const findings: SecretFinding[] = []
    const lines = content.split('\n')

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex]

      for (const pattern of SecretsScanner.PATTERNS) {
        const matches = line.matchAll(pattern.regex)

        for (const match of matches) {
          findings.push({
            file: filePath,
            line: lineIndex + 1,
            type: pattern.name,
            severity: pattern.severity,
            matched: this.maskMatch(match[0])
          })
        }
      }
    }

    return findings
  }

  /**
   * Mask matched secret for safe display
   */
  private maskMatch(match: string): string {
    if (match.length <= 10) {
      return '****'
    }

    const prefix = match.slice(0, 5)
    const suffix = match.slice(-5)
    return `${prefix}...${suffix}`
  }

  /**
   * Get all files to scan in a project
   */
  private async getFilesToScan(projectPath: string): Promise<string[]> {
    const files: string[] = []

    async function traverse(dir: string): Promise<void> {
      const entries = await fs.readdir(dir, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)

        if (entry.isDirectory()) {
          await traverse(fullPath)
        } else if (entry.isFile()) {
          files.push(fullPath)
        }
      }
    }

    await traverse(projectPath)
    return files
  }

  /**
   * Check if file should be ignored
   */
  private shouldIgnore(filePath: string): boolean {
    return SecretsScanner.DEFAULT_IGNORE_PATTERNS.some((pattern) =>
      pattern.test(filePath)
    )
  }

  /**
   * Format scan report as human-readable string
   */
  static formatReport(report: ScanReport): string {
    if (!report.hasSecrets) {
      return `✅ シークレットスキャン完了: 問題なし（${report.scannedFiles}ファイルをスキャン）`
    }

    const lines: string[] = [
      `⚠️  ${report.findings.length}件の潜在的なシークレットを検出:`,
      ''
    ]

    // Group findings by severity
    const bySeverity: Record<string, SecretFinding[]> = {
      critical: [],
      high: [],
      medium: [],
      low: []
    }

    for (const finding of report.findings) {
      bySeverity[finding.severity].push(finding)
    }

    for (const severity of ['critical', 'high', 'medium', 'low']) {
      const findings = bySeverity[severity]
      if (findings.length === 0) continue

      const emoji = severity === 'critical' ? '🔴' : severity === 'high' ? '🟠' : '🟡'
      lines.push(`${emoji} ${severity.toUpperCase()} (${findings.length}件):`)

      for (const finding of findings) {
        lines.push(
          `  - ${finding.file}:${finding.line} [${finding.type}] ${finding.matched}`
        )
      }

      lines.push('')
    }

    lines.push(`スキャン済みファイル: ${report.scannedFiles}`)
    lines.push(`スキップファイル: ${report.skippedFiles.length}`)

    return lines.join('\n')
  }
}
