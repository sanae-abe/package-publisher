import { PackagePublisher } from './PackagePublisher'
import { BatchPublishOptions, BatchPublishResult, PublishReport, PublishOptions } from './interfaces'

/**
 * BatchPublisher - Manages publishing to multiple registries
 *
 * Features:
 * - Parallel or sequential publishing
 * - Error handling with continueOnError option
 * - Concurrency control
 * - Detailed reporting for each registry
 */
export class BatchPublisher {
  private projectPath: string

  constructor(projectPath: string) {
    this.projectPath = projectPath
  }

  /**
   * Publish to multiple registries
   *
   * @param registries - List of registry names to publish to
   * @param options - Batch publish options
   * @returns Batch publish result with success/failure details
   */
  async publishToMultiple(
    registries: string[],
    options: BatchPublishOptions = {}
  ): Promise<BatchPublishResult> {
    const {
      sequential = false,
      continueOnError = false,
      maxConcurrency = 3,
      publishOptions = {}
    } = options

    // Initialize result
    const result: BatchPublishResult = {
      succeeded: [],
      failed: new Map(),
      skipped: [],
      success: false,
      results: new Map()
    }

    // Validate input
    if (!registries || registries.length === 0) {
      throw new Error('At least one registry must be specified')
    }

    console.log(`\n📦 Batch Publishing to ${registries.length} registries: ${registries.join(', ')}`)
    console.log(`Mode: ${sequential ? 'Sequential' : `Parallel (max ${maxConcurrency} concurrent)`}`)
    console.log(`Continue on error: ${continueOnError ? 'Yes' : 'No'}\n`)

    if (sequential) {
      // Sequential publishing
      await this.publishSequentially(registries, publishOptions, continueOnError, result)
    } else {
      // Parallel publishing with concurrency control
      await this.publishInParallel(registries, publishOptions, maxConcurrency, continueOnError, result)
    }

    // Set overall success status
    result.success = result.failed.size === 0 && result.skipped.length === 0

    // Print summary
    this.printSummary(result)

    return result
  }

  /**
   * Publish to registries sequentially
   */
  private async publishSequentially(
    registries: string[],
    publishOptions: PublishOptions,
    continueOnError: boolean,
    result: BatchPublishResult
  ): Promise<void> {
    for (const registry of registries) {
      // Skip if we had a failure and continueOnError is false
      if (result.failed.size > 0 && !continueOnError) {
        console.log(`⏭️  Skipping ${registry} due to previous failure`)
        result.skipped.push(registry)
        continue
      }

      await this.publishToRegistry(registry, publishOptions, result)
    }
  }

  /**
   * Publish to registries in parallel with concurrency control
   */
  private async publishInParallel(
    registries: string[],
    publishOptions: PublishOptions,
    maxConcurrency: number,
    continueOnError: boolean,
    result: BatchPublishResult
  ): Promise<void> {
    const queue = [...registries]
    const activePromises: Promise<void>[] = []

    const executeNext = async (): Promise<void> => {
      if (queue.length === 0) return

      // Check if we should stop due to errors
      if (result.failed.size > 0 && !continueOnError) {
        result.skipped.push(...queue)
        queue.length = 0 // Clear queue
        return
      }

      const registry = queue.shift()!
      await this.publishToRegistry(registry, publishOptions, result)

      // After completion, check if we should continue
      return executeNext()
    }

    // Start initial batch up to maxConcurrency
    for (let i = 0; i < Math.min(maxConcurrency, registries.length); i++) {
      activePromises.push(executeNext())
    }

    // Wait for all active promises to complete
    await Promise.all(activePromises)
  }

  /**
   * Publish to a single registry
   */
  private async publishToRegistry(
    registry: string,
    publishOptions: PublishOptions,
    result: BatchPublishResult
  ): Promise<void> {
    const startTime = Date.now()

    console.log(`\n🚀 Publishing to ${registry}...`)

    try {
      // Create a new PackagePublisher instance for this registry
      const publisher = new PackagePublisher(this.projectPath)

      // Execute the publish
      const publishResult = await publisher.publish({
        ...publishOptions,
        nonInteractive: true // Force non-interactive for batch operations
      })

      const duration = Date.now() - startTime

      if (publishResult.success) {
        console.log(`✅ ${registry}: Published successfully in ${duration}ms`)
        result.succeeded.push(registry)

        // Store detailed result (publishResult is already a PublishReport)
        result.results.set(registry, publishResult)
      } else {
        throw new Error(publishResult.errors[0] || 'Unknown error')
      }
    } catch (error: unknown) {
      const duration = Date.now() - startTime
      const errorObj = error instanceof Error ? error : new Error(String(error))

      console.error(`❌ ${registry}: Failed - ${errorObj.message}`)
      result.failed.set(registry, errorObj)

      // Store detailed result
      const report: PublishReport = {
        success: false,
        registry,
        packageName: 'unknown',
        version: '0.0.0',
        errors: [errorObj.message],
        warnings: [],
        duration,
        state: 'FAILED'
      }
      result.results.set(registry, report)
    }
  }

  /**
   * Print batch publish summary
   */
  private printSummary(result: BatchPublishResult): void {
    console.log('\n' + '='.repeat(60))
    console.log('📊 Batch Publish Summary')
    console.log('='.repeat(60))

    console.log(`\n✅ Succeeded: ${result.succeeded.length}`)
    if (result.succeeded.length > 0) {
      result.succeeded.forEach(registry => {
        const report = result.results.get(registry)
        console.log(`   - ${registry} (${report?.duration}ms)`)
      })
    }

    console.log(`\n❌ Failed: ${result.failed.size}`)
    if (result.failed.size > 0) {
      result.failed.forEach((error, registry) => {
        const report = result.results.get(registry)
        console.log(`   - ${registry}: ${error.message} (${report?.duration}ms)`)
      })
    }

    if (result.skipped.length > 0) {
      console.log(`\n⏭️  Skipped: ${result.skipped.length}`)
      result.skipped.forEach(registry => {
        console.log(`   - ${registry}`)
      })
    }

    console.log('\n' + '='.repeat(60))
    console.log(`Overall Status: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`)
    console.log('='.repeat(60) + '\n')
  }
}
