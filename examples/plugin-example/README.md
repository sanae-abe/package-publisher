# Package Publisher - Example Plugin

This is a minimal example plugin demonstrating how to create custom registry support for `package-publisher`.

## Overview

This plugin implements support for a fictional "MyRegistry" package registry. It demonstrates:

- Plugin initialization with configuration
- Project detection logic
- Publishing workflow implementation
- Optional verification step

## Installation

### As a Local Plugin

```bash
# In your project using package-publisher
npm install --save-dev ./path/to/examples/plugin-example
```

### As an npm Package

```bash
npm install --save-dev package-publisher-plugin-example
```

## Configuration

Add the plugin to your `.publish-config.yaml`:

```yaml
plugins:
  - name: package-publisher-plugin-example  # or local path: ./examples/plugin-example
    version: "1.0.0"  # optional for npm packages
    config:
      apiUrl: "https://api.myregistry.com"
      apiKey: "${MYREGISTRY_API_KEY}"  # Use environment variable
      customSettings:
        timeout: 30000
        retries: 3
```

Or configure via CLI:

```bash
package-publisher publish --registry myregistry --plugin ./examples/plugin-example
```

## Usage

Once configured, the plugin will be automatically loaded and used when publishing to `myregistry`:

```bash
# Publish using the plugin
package-publisher publish --registry myregistry

# Or with explicit plugin path
package-publisher publish --registry myregistry --plugin ./examples/plugin-example
```

## Plugin Structure

```
plugin-example/
├── package.json          # Plugin metadata and dependencies
├── tsconfig.json         # TypeScript configuration
├── src/
│   └── index.ts          # Plugin implementation
├── dist/                 # Compiled output (after build)
│   ├── index.js
│   └── index.d.ts
└── README.md             # This file
```

## Development

### Building

```bash
npm run build
```

This compiles TypeScript to JavaScript in the `dist/` directory.

### Watch Mode

```bash
npm run watch
```

Automatically rebuilds when source files change.

## Plugin Interface

The plugin implements the `PublishPlugin` interface:

```typescript
interface PublishPlugin {
  readonly name: string
  readonly version: string

  initialize(config: PluginInitConfig): Promise<void>
  supports(projectPath: string): Promise<boolean>
  publish(options: PluginPublishOptions): Promise<PublishResult>
  verify?(options: PluginVerifyOptions): Promise<VerificationResult>
}
```

### Key Methods

- **`initialize()`**: Called once when the plugin is loaded. Initialize configuration, validate settings.
- **`supports()`**: Check if this plugin can handle the given project (e.g., check for specific files).
- **`publish()`**: Main publishing logic. Upload package to your registry.
- **`verify()`**: Optional. Verify the package was published successfully.

## Creating Your Own Plugin

1. **Copy this example** as a starting point
2. **Update `package.json`**: Change name, description, keywords
3. **Implement plugin logic** in `src/index.ts`:
   - Update `name` and `version` properties
   - Customize `initialize()` to validate your config
   - Implement `supports()` to detect your project type
   - Write `publish()` logic for your registry API
   - Optionally implement `verify()`
4. **Build**: Run `npm run build`
5. **Test**: Configure in `.publish-config.yaml` and test

## Real-World Examples

For real-world plugin implementations, see the built-in plugins:

- `NPMPlugin` - npm registry support
- `PyPIPlugin` - Python Package Index support
- `CratesIOPlugin` - Rust crates.io support

## API Reference

See the main `package-publisher` documentation:

- [Plugin Development Guide](../../docs/PLUGIN_DEVELOPMENT.md)
- [API Documentation](../../docs/API.md)

## License

MIT
