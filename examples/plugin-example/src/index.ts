/**
 * Example Plugin for Package Publisher
 *
 * This is a minimal example demonstrating how to create a custom registry plugin.
 * It implements the PublishPlugin interface for a fictional "MyRegistry" service.
 */

import type {
  PublishPlugin,
  PluginInitConfig,
  PluginPublishOptions,
  PluginVerifyOptions,
  PublishResult,
  VerificationResult,
} from 'package-publisher'

/**
 * Example plugin configuration
 */
interface MyRegistryConfig {
  /** API endpoint URL */
  apiUrl: string
  /** Registry API key */
  apiKey: string
  /** Custom settings */
  customSettings?: Record<string, unknown>
}

/**
 * MyRegistry Plugin
 *
 * A minimal example plugin that demonstrates:
 * - Plugin initialization
 * - Project detection
 * - Publishing workflow
 * - Verification (optional)
 */
class MyRegistryPlugin implements PublishPlugin {
  readonly name = 'myregistry'
  readonly version = '1.0.0'

  private config?: MyRegistryConfig
  private projectPath?: string
  private logger?: (message: string) => void

  /**
   * Initialize the plugin with configuration
   */
  async initialize(config: PluginInitConfig): Promise<void> {
    this.projectPath = config.projectPath
    this.logger = config.logger

    // Parse plugin-specific configuration
    this.config = config.pluginConfig as MyRegistryConfig

    // Validate required configuration
    if (!this.config.apiUrl) {
      throw new Error('MyRegistry plugin requires "apiUrl" in configuration')
    }
    if (!this.config.apiKey) {
      throw new Error('MyRegistry plugin requires "apiKey" in configuration')
    }

    this.log('Plugin initialized successfully')
  }

  /**
   * Check if this plugin supports the given project
   */
  async supports(projectPath: string): Promise<boolean> {
    // Example: Check for a marker file
    // In a real plugin, you would check for specific files like package.json,
    // Cargo.toml, setup.py, etc., depending on your registry's requirements

    try {
      const { access } = await import('fs/promises')
      await access(`${projectPath}/myregistry.json`)
      return true
    } catch {
      return false
    }
  }

  /**
   * Publish the package to MyRegistry
   */
  async publish(options: PluginPublishOptions): Promise<PublishResult> {
    this.log('Starting publish...')

    try {
      // Extract package information
      const { packageName, version } = options.packageMetadata

      // Simulate publishing (in a real plugin, make HTTP requests)
      this.log(`Publishing ${packageName}@${version} to ${this.config!.apiUrl}`)

      // Example: Make API request (simulated)
      const success = await this.simulatePublish(packageName, version)

      if (!success) {
        return {
          success: false,
          error: 'Publishing failed: API returned error',
        }
      }

      // Return success result
      return {
        success: true,
        version,
        packageUrl: `${this.config!.apiUrl}/packages/${packageName}/${version}`,
        output: `Successfully published ${packageName}@${version}`,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Verify that the package was published successfully (optional)
   */
  async verify(options: PluginVerifyOptions): Promise<VerificationResult> {
    this.log('Verifying publish...')

    try {
      const { packageName, version } = options

      // Simulate verification (in a real plugin, make HTTP requests)
      this.log(`Verifying ${packageName}@${version}`)

      const verified = await this.simulateVerify(packageName, version)

      if (!verified) {
        return {
          verified: false,
          error: 'Package not found on registry',
        }
      }

      return {
        verified: true,
        version,
        url: `${this.config!.apiUrl}/packages/${packageName}/${version}`,
      }
    } catch (error) {
      return {
        verified: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Simulate publishing to the registry
   */
  private async simulatePublish(packageName: string, version: string): Promise<boolean> {
    // In a real plugin, this would make HTTP requests to the registry API
    // For example:
    // const response = await fetch(`${this.config.apiUrl}/publish`, {
    //   method: 'POST',
    //   headers: {
    //     'Authorization': `Bearer ${this.config.apiKey}`,
    //     'Content-Type': 'application/json',
    //   },
    //   body: JSON.stringify({ packageName, version }),
    // })
    // return response.ok

    // Simulate async operation
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Simulate success
    return true
  }

  /**
   * Simulate verification
   */
  private async simulateVerify(packageName: string, version: string): Promise<boolean> {
    // In a real plugin, this would check if the package exists on the registry
    // For example:
    // const response = await fetch(`${this.config.apiUrl}/packages/${packageName}/${version}`)
    // return response.ok

    // Simulate async operation
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Simulate success
    return true
  }

  /**
   * Log a message using the plugin logger
   */
  private log(message: string): void {
    if (this.logger) {
      this.logger(message)
    }
  }
}

/**
 * Export the plugin instance as default export
 * This is the entry point that PluginLoader will import
 */
export default new MyRegistryPlugin()

/**
 * Also export as named export for convenience
 */
export const plugin = new MyRegistryPlugin()
