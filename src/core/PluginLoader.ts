/**
 * PluginLoader - Dynamic plugin loading and management
 */

import path from 'path'
import { pathToFileURL } from 'url'
import { access, stat } from 'fs/promises'
import type {
  PublishPlugin,
  PluginInitConfig,
  PluginMetadata,
} from './interfaces.js'
import type { PluginConfig } from './PublishConfig.js'

/**
 * Plugin loading error
 */
export class PluginLoadError extends Error {
  constructor(
    message: string,
    public pluginName: string,
    public cause?: Error
  ) {
    super(message)
    this.name = 'PluginLoadError'
  }
}

/**
 * PluginLoader manages dynamic loading and initialization of external plugins
 */
export class PluginLoader {
  private loadedPlugins: Map<string, PublishPlugin>
  private projectPath: string

  constructor(projectPath: string) {
    this.loadedPlugins = new Map()
    this.projectPath = projectPath
  }

  /**
   * Load plugins from configuration
   */
  async loadPlugins(configs: PluginConfig[]): Promise<PublishPlugin[]> {
    const plugins: PublishPlugin[] = []

    for (const config of configs) {
      try {
        const plugin = await this.loadPlugin(config)
        plugins.push(plugin)
      } catch (error) {
        // Continue loading other plugins even if one fails
        console.error(`Failed to load plugin "${config.name}":`, error)
      }
    }

    return plugins
  }

  /**
   * Load a single plugin from configuration
   */
  async loadPlugin(config: PluginConfig): Promise<PublishPlugin> {
    // Check if already loaded
    const cached = this.loadedPlugins.get(config.name)
    if (cached) {
      return cached
    }

    // Determine if it's a local path or npm package
    const isLocalPath = config.name.startsWith('.') || config.name.startsWith('/')
    const plugin = isLocalPath
      ? await this.loadFromPath(config.name)
      : await this.loadFromNpm(config.name, config.version)

    // Initialize the plugin
    await this.initializePlugin(plugin, {
      projectPath: this.projectPath,
      pluginConfig: config.config,
      logger: (message: string) => console.log(`[${plugin.name}] ${message}`),
    })

    // Cache the loaded plugin
    this.loadedPlugins.set(plugin.name, plugin)

    return plugin
  }

  /**
   * Load plugin from npm package
   */
  async loadFromNpm(
    packageName: string,
    version?: string
  ): Promise<PublishPlugin> {
    try {
      // Construct the module specifier
      // If version is specified, we assume it's already installed with that version
      const moduleSpecifier = packageName

      // Dynamic import of the npm package
      const module = (await import(moduleSpecifier)) as {
        default?: PublishPlugin
        plugin?: PublishPlugin
      }

      // Extract the plugin instance
      const plugin = module.default || module.plugin

      if (!plugin) {
        throw new Error(
          `Plugin module "${packageName}" does not export a default or "plugin" export`
        )
      }

      // Validate plugin interface
      this.validatePlugin(plugin, packageName)

      // Verify version if specified
      if (version && plugin.version !== version) {
        console.warn(
          `Warning: Plugin "${packageName}" version mismatch. Expected: ${version}, Got: ${plugin.version}`
        )
      }

      return plugin
    } catch (error) {
      throw new PluginLoadError(
        `Failed to load plugin from npm package "${packageName}"`,
        packageName,
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Load plugin from local file path
   */
  async loadFromPath(pluginPath: string): Promise<PublishPlugin> {
    try {
      // Resolve the path relative to project root
      const resolvedPath = path.isAbsolute(pluginPath)
        ? pluginPath
        : path.resolve(this.projectPath, pluginPath)

      // Validate that the file exists
      await this.validatePluginPath(resolvedPath)

      // Convert to file URL for dynamic import
      const fileUrl = pathToFileURL(resolvedPath).href

      // Dynamic import of the local module
      const module = (await import(fileUrl)) as {
        default?: PublishPlugin
        plugin?: PublishPlugin
      }

      // Extract the plugin instance
      const plugin = module.default || module.plugin

      if (!plugin) {
        throw new Error(
          `Plugin file "${pluginPath}" does not export a default or "plugin" export`
        )
      }

      // Validate plugin interface
      this.validatePlugin(plugin, pluginPath)

      return plugin
    } catch (error) {
      throw new PluginLoadError(
        `Failed to load plugin from path "${pluginPath}"`,
        pluginPath,
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Get a loaded plugin by name
   */
  getPlugin(name: string): PublishPlugin | undefined {
    return this.loadedPlugins.get(name)
  }

  /**
   * Get all loaded plugins
   */
  getAllPlugins(): PublishPlugin[] {
    return Array.from(this.loadedPlugins.values())
  }

  /**
   * Get plugin metadata
   */
  getPluginMetadata(plugin: PublishPlugin): PluginMetadata {
    return {
      name: plugin.name,
      version: plugin.version,
      registry: plugin.name, // Plugins typically map 1:1 with registries
    }
  }

  /**
   * Clear all loaded plugins
   */
  clear(): void {
    this.loadedPlugins.clear()
  }

  /**
   * Initialize a plugin with configuration
   */
  private async initializePlugin(
    plugin: PublishPlugin,
    config: PluginInitConfig
  ): Promise<void> {
    try {
      await plugin.initialize(config)
    } catch (error) {
      throw new PluginLoadError(
        `Failed to initialize plugin "${plugin.name}"`,
        plugin.name,
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Validate that a plugin implements the required interface
   */
  private validatePlugin(plugin: unknown, source: string): asserts plugin is PublishPlugin {
    if (!plugin || typeof plugin !== 'object') {
      throw new Error(`Invalid plugin from "${source}": not an object`)
    }

    const p = plugin as Partial<PublishPlugin>

    if (!p.name || typeof p.name !== 'string') {
      throw new Error(`Invalid plugin from "${source}": missing or invalid "name" property`)
    }

    if (!p.version || typeof p.version !== 'string') {
      throw new Error(
        `Invalid plugin from "${source}": missing or invalid "version" property`
      )
    }

    if (!p.initialize || typeof p.initialize !== 'function') {
      throw new Error(
        `Invalid plugin from "${source}": missing or invalid "initialize" method`
      )
    }

    if (!p.supports || typeof p.supports !== 'function') {
      throw new Error(
        `Invalid plugin from "${source}": missing or invalid "supports" method`
      )
    }

    if (!p.publish || typeof p.publish !== 'function') {
      throw new Error(`Invalid plugin from "${source}": missing or invalid "publish" method`)
    }

    // verify is optional
    if (p.verify && typeof p.verify !== 'function') {
      throw new Error(`Invalid plugin from "${source}": invalid "verify" method`)
    }
  }

  /**
   * Validate that a plugin path exists and is accessible
   */
  private async validatePluginPath(pluginPath: string): Promise<void> {
    try {
      await access(pluginPath)
      const stats = await stat(pluginPath)

      if (!stats.isFile()) {
        throw new Error(`Plugin path "${pluginPath}" is not a file`)
      }
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        throw new Error(`Plugin file not found: "${pluginPath}"`)
      }
      throw error
    }
  }
}
