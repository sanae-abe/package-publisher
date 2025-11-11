# 📦 package-publisher

[English](./README.md) | [日本語](./README.ja.md)

> Multi-registry package publishing assistant for Homebrew, crates.io, npm, PyPI

![Tests](https://img.shields.io/badge/tests-367%20passed-success)
![Coverage](https://img.shields.io/badge/coverage-89%25-success)
![TypeScript](https://img.shields.io/badge/typescript-strict-blue)
![Node](https://img.shields.io/badge/node-%3E%3D18-green)

**package-publisher** is a Claude Code agent that supports safe and efficient package publishing across multiple package registries.

## 📋 Table of Contents

- [Features](#-features)
- [Use Cases](#-use-cases)
- [Quick Start](#-quick-start)
  - [Installation](#installation)
  - [Usage as CLI](#usage-as-cli)
  - [Usage as Claude Code Agent](#usage-as-claude-code-agent)
- [Project Structure](#-project-structure)
- [Development](#-development)
- [Documentation](#-documentation)
- [Troubleshooting](#-troubleshooting)
- [Contributing](#-contributing)
- [License](#-license)
- [Links](#-links)

## ✨ Features

### Core Capabilities

- 🎯 **Multi-Registry Support** - npm, crates.io, PyPI, Homebrew with auto-detection
- 🔒 **Security-First Design** - Secrets scanner, token masking, injection prevention
- 🚀 **Automated Publishing** - 7-step workflow with validation, dry-run, and rollback
- 🔄 **Resilience & Error Handling** - State machine, retry logic, comprehensive error messages
- 🎛️ **Advanced Features** - YAML config, batch publishing, hooks, notifications, plugins, analytics

**Quality Metrics**: 367 tests (89%+ coverage), TypeScript strict mode, ESLint zero errors

<details>
<summary>📖 See detailed features</summary>

### 🎯 Multi-Registry Support

- **npm**: Node.js packages (2FA/OTP support, scoped packages)
- **crates.io**: Rust crates (Cargo.toml validation)
- **PyPI**: Python packages (TestPyPI support)
- **Homebrew**: macOS packages (Formula validation)

### 🔒 Security-First

- ✅ Secrets scanner (API keys, passwords, tokens detection)
- ✅ Token masking in logs
- ✅ Command injection prevention
- ✅ Safe environment variable handling

### 🚀 Publishing Workflow

1. **Auto-Detection**: Automatically detect applicable registries
2. **Validation**: Check metadata, run tests, lint
3. **Dry-Run**: Preview publishing without actual execution
4. **Confirmation**: Interactive confirmation (or `--non-interactive`)
5. **Publishing**: Execute with retry logic and error handling
6. **Verification**: Verify successful publication
7. **Rollback**: Support for unpublish/deprecate (registry-dependent)

### 🔄 Resilience

- ✅ State machine with resume capability
- ✅ Exponential backoff retry logic
- ✅ Network error handling
- ✅ Comprehensive error messages with suggested actions

### 🎛️ Advanced Features

- **Configuration System**: YAML configuration file (.publish-config.yaml)
  - Priority management (CLI > Env > Project > Global > Default)
  - Environment variable expansion (with security restrictions)
  - Detailed validation error messages

- **Batch Publishing**: Publish to multiple registries at once
  - Parallel or sequential execution options
  - Continue or stop on error
  - Concurrency limit control (default: 3)

- **Hooks System**: Customizable lifecycle hooks
  - 4 hook phases (preBuild, prePublish, postPublish, onError)
  - Environment variable expansion, command whitelist validation
  - Timeout control (default: 300 seconds)

- **Notifications**: Publishing result notifications
  - Slack Webhook integration (rich message support)
  - Email notifications (via SendGrid API)
  - Pluggable design for extensibility

- **Plugin System**: Custom registry support
  - PublishPlugin interface
  - Dynamic plugin loading (npm/local)
  - Sample plugins and comprehensive documentation

- **Analytics & Reporting**: Publishing statistics
  - Track success rates by registry
  - Markdown/JSON format reports
  - CLI integration (`stats`, `report` commands)

</details>

## 📚 Use Cases

### Multi-Package Publishing in Monorepos
- Publish to multiple registries (npm, PyPI, crates.io) in a single operation
- Ensure security with unified validation process
- Efficient releases with batch publishing capabilities

### Automated Publishing in CI/CD Pipelines
- Automatically publish to production on tag push
- Instant team-wide notification via Slack/Email
- Customize pre/post-publish processes with Hooks system

### Security-Focused Publishing Workflow
- Prevent secrets leakage with automated Secrets Scanner
- Account protection with 2FA/OTP support
- Ensure log safety with token masking

### Enterprise-Level Operations
- Unify team-wide configuration with YAML config files
- Track publishing success rates with Analytics
- Support custom registries with Plugin System

## 🚀 Quick Start

### Installation

**System Requirements**:
- Node.js 18.x or higher
- npm 9.x or higher

**Development Setup** (for contributors):
```bash
# Clone repository (available after initial publication)
git clone https://github.com/sanae-abe/package-publisher
cd package-publisher
npm install
npm run build
```

**Global Installation** (available after npm publication):
```bash
npm install -g package-publisher
```

**Using npx** (no installation required):
```bash
npx package-publisher publish
```

### Usage as CLI

```bash
# Publish to auto-detected registries
package-publisher publish

# Dry-run only
package-publisher publish --dry-run-only

# Specify registry
package-publisher publish --registry npm

# Non-interactive mode (CI/CD)
package-publisher publish --non-interactive

# With 2FA/OTP (npm)
package-publisher publish --registry npm --otp 123456

# Resume from previous state
package-publisher publish --resume

# Check project status
package-publisher check

# Use configuration file
package-publisher publish --config .publish-config.yaml

# Batch publish to multiple registries
package-publisher publish --registries npm,pypi,crates

# Sequential publishing (not parallel)
package-publisher publish --registries npm,pypi --sequential

# Skip hooks
package-publisher publish --skip-hooks

# View publishing statistics
package-publisher stats --days 30

# Generate report
package-publisher report --format markdown --output report.md
```

### Usage as Claude Code Agent

```bash
# Install as Claude Code agent
ln -s ~/projects/package-publisher/agent-definition.yaml \
      ~/.claude/agents/package-publisher.yaml

# Use in Claude Code
"Please help me publish this package to npm with all necessary checks"
```

## 📁 Project Structure

### Key Directories

- **`src/core/`** - Core publishing logic (state machine, error handling, config, batch, hooks, analytics, plugins)
- **`src/plugins/`** - Registry-specific implementations (npm, crates.io, PyPI, Homebrew)
- **`src/security/`** - Security features (secrets scanner, token manager, command executor)
- **`src/notifications/`** - Notification integrations (Slack, Email)
- **`tests/unit/`** - Comprehensive test suite (15 suites, 367 tests, 89% coverage)
- **`docs/`** - Additional documentation (Agent Integration, Plugin Development, CI/CD)
- **`.github/workflows/`** - GitHub Actions workflows (single/multi-registry publishing)
- **`examples/`** - Sample plugin implementations

<details>
<summary>📂 See full project structure</summary>

```
package-publisher/
├── src/
│   ├── core/              # Core publishing logic
│   ├── plugins/           # Registry plugins (npm, crates.io, PyPI, Homebrew)
│   ├── notifications/     # Notification system (Slack, Email)
│   ├── security/          # Security features
│   ├── cli.ts            # CLI interface
│   └── index.ts          # Library exports
├── tests/unit/           # 15 test suites, 367 tests, 89% coverage
├── docs/                 # Documentation
├── .github/workflows/    # CI/CD workflows
├── examples/             # Sample implementations
├── agent-definition.yaml # Claude Code agent definition
└── .publish-config.example.yaml # Configuration example
```

For detailed file listing, run: `tree -L 3 -I 'node_modules|dist'`

</details>

## 🔧 Development

### Setup

```bash
npm install
```

### Build

```bash
npm run build
```

### Test

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

### Lint & Format

```bash
npm run lint
npm run format
```

## 📖 Documentation

- [Agent Integration Guide](./docs/AGENT_INTEGRATION.md) - Claude Code usage and troubleshooting
- [Plugin Development Guide](./docs/PLUGIN_DEVELOPMENT.md) - Custom plugin development guide
- [CI/CD Integration Guide](./docs/CI_CD_INTEGRATION.md) - GitHub Actions, GitLab CI, CircleCI integration

## 🔧 Troubleshooting

### Quick Solutions

<details>
<summary>🔐 Authentication Errors</summary>

**Symptoms**: `Authentication failed for registry` error

```bash
# Check if token is set (without exposing value)
[ -n "$NPM_TOKEN" ] && echo "✅ Set" || echo "❌ Not set"

# Set token
export NPM_TOKEN="your-token-here"

# If 2FA/OTP is required
package-publisher publish --registry npm --otp 123456
```
</details>

<details>
<summary>🔍 Secrets Scanner Issues</summary>

**Symptoms**: `Secrets detected in package` error

**For false positives** (test files, examples):
```yaml
# .publisher.yml - Exclude test/doc files
security:
  secretsScanning:
    ignorePatterns:
      - pattern: "**/*test*.{rs,ts,js,py}"
      - pattern: "docs/**/*.md"
```

**For real secrets**: Add to `.gitignore` and use `git-filter-repo` to remove from history.

See [detailed guide](./docs/SECURITY_SCANNER.md) for more options.
</details>

<details>
<summary>🌐 Network Errors</summary>

```bash
# Increase retry count
package-publisher publish --max-retries 5

# Configure HTTPS proxy (recommended)
export HTTPS_PROXY=https://proxy.example.com:8443
```
</details>

<details>
<summary>❌ Test Failures</summary>

```bash
# Run tests locally first
npm test

# Skip verification (not recommended for production)
package-publisher publish --skip-verification
```
</details>

### Logging & Support

```bash
# Enable verbose logging
package-publisher publish --verbose

# Debug mode
DEBUG=* package-publisher publish
```

**Need help?**
- [GitHub Issues](https://github.com/sanae-abe/package-publisher/issues) - Bug reports
- [GitHub Discussions](https://github.com/sanae-abe/package-publisher/discussions) - Questions

## 🤝 Contributing

Contributions are welcome! If you're interested in contributing to this project, please use GitHub Issues or Pull Requests.

## 📄 License

MIT License - see [LICENSE](./LICENSE) for details.

## 🔗 Links

- [GitHub Repository](https://github.com/sanae-abe/package-publisher)
- [Issues](https://github.com/sanae-abe/package-publisher/issues)
- [Discussions](https://github.com/sanae-abe/package-publisher/discussions)

## 🙏 Acknowledgments

Built with ❤️ as a Claude Code agent for safe and efficient package publishing.
