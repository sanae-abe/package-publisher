# 📦 package-publisher

[English](./README.md) | [日本語](./README.ja.md)

> Multi-registry package publishing assistant for Homebrew, crates.io, npm, PyPI

![Tests](https://img.shields.io/badge/tests-367%20passed-success)
![Coverage](https://img.shields.io/badge/coverage-89%25-success)
![TypeScript](https://img.shields.io/badge/typescript-strict-blue)
![Node](https://img.shields.io/badge/node-%3E%3D18-green)

**package-publisher** is a Claude Code agent that supports safe and efficient package publishing across multiple package registries.

## ✨ Features

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

**Quality Metrics**:
- ✅ **367 tests** (15 test suites, all passing)
- ✅ **89%+ test coverage**
- ✅ **TypeScript strict mode** fully compliant
- ✅ **ESLint** zero errors and warnings

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

**Development Setup**:
```bash
git clone https://github.com/sanae-abe/package-publisher
cd package-publisher
npm install
npm run build
```

**Global Installation** (after npm publication):
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

```
package-publisher/
├── src/
│   ├── core/
│   │   ├── interfaces.ts          # Core type definitions
│   │   ├── PublishStateMachine.ts # State management
│   │   ├── ErrorHandling.ts       # Error factory & codes
│   │   ├── RetryManager.ts        # Retry logic with backoff
│   │   ├── PackagePublisher.ts    # Main orchestrator
│   │   ├── ConfigLoader.ts        # YAML config loader
│   │   ├── PublishConfig.ts       # Config type definitions
│   │   ├── BatchPublisher.ts      # Multi-registry batch publishing
│   │   ├── HookExecutor.ts        # Pre/Post-publish hooks
│   │   ├── PublishAnalytics.ts    # Analytics & reporting
│   │   └── PluginLoader.ts        # Dynamic plugin loader
│   ├── plugins/
│   │   ├── NPMPlugin.ts           # npm/npmjs.com
│   │   ├── CratesIOPlugin.ts      # Rust/crates.io
│   │   ├── PyPIPlugin.ts          # Python/PyPI
│   │   └── HomebrewPlugin.ts      # Homebrew Formula
│   ├── notifications/             # Notification system
│   │   ├── NotificationManager.ts # Notification orchestrator
│   │   ├── SlackNotifier.ts       # Slack webhook integration
│   │   └── EmailNotifier.ts       # Email notification (SendGrid)
│   ├── security/
│   │   ├── SecureTokenManager.ts  # Token handling & masking
│   │   ├── SecretsScanner.ts      # 10 secret patterns detection
│   │   └── SafeCommandExecutor.ts # Command injection prevention
│   ├── cli.ts                     # CLI interface (Commander.js)
│   └── index.ts                   # Library exports
├── tests/unit/                    # 15 test suites, 367 tests, 89% coverage
│   ├── NPMPlugin.test.ts
│   ├── CratesIOPlugin.test.ts
│   ├── PyPIPlugin.test.ts
│   ├── HomebrewPlugin.test.ts
│   ├── PackagePublisher.test.ts
│   ├── ConfigLoader.test.ts       # 31 tests
│   ├── BatchPublisher.test.ts     # Batch publishing tests
│   ├── HookExecutor.test.ts       # 32 tests
│   ├── NotificationManager.test.ts # 11 tests
│   ├── SlackNotifier.test.ts      # 15 tests
│   ├── EmailNotifier.test.ts      # 18 tests
│   ├── PluginLoader.test.ts       # 25 tests
│   ├── PublishAnalytics.test.ts   # 25 tests
│   ├── SafeCommandExecutor.test.ts # 19 tests, 100% coverage
│   └── SecureTokenManager.test.ts  # 34 tests, 100% coverage
├── docs/
│   ├── AGENT_INTEGRATION.md       # Claude Code integration guide
│   ├── PLUGIN_DEVELOPMENT.md      # Custom plugin development guide
│   └── CI_CD_INTEGRATION.md       # CI/CD integration
├── .github/workflows/
│   ├── publish-npm.yml            # GitHub Actions (single registry)
│   └── publish-multiregistry.yml  # Multi-registry publishing
├── examples/
│   └── plugin-example/            # Sample plugin implementation
├── agent-definition.yaml          # Claude Code agent definition
├── .publish-config.example.yaml   # Configuration file example
├── PHASE4_PLAN.md                 # Implementation plan & status
├── .eslintrc.js                   # TypeScript strict mode ESLint
├── .prettierrc                    # Code formatting rules
└── package.json
```

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

### Common Issues and Solutions

#### Authentication Errors (AUTHENTICATION_FAILED)
**Symptoms**: `Authentication failed for registry` error

**Solutions**:
```bash
# Check token
echo $NPM_TOKEN  # for npm
echo $CARGO_REGISTRY_TOKEN  # for crates.io

# Reset token
export NPM_TOKEN="your-token-here"

# If 2FA/OTP is required
package-publisher publish --registry npm --otp 123456
```

#### Blocked by Secrets Scanner
**Symptoms**: `Secrets detected in package` error

**Solutions**:
```bash
# Add sensitive files to .gitignore
echo ".env" >> .gitignore
echo "credentials.json" >> .gitignore

# Remove sensitive information from commits
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch path/to/secret/file' \
  --prune-empty --tag-name-filter cat -- --all
```

#### Network Errors
**Symptoms**: Timeout or connection errors

**Solutions**:
```bash
# Increase retry count
package-publisher publish --max-retries 5

# Configure proxy (if needed)
export HTTP_PROXY=http://proxy.example.com:8080
export HTTPS_PROXY=http://proxy.example.com:8080
```

#### Test Failures
**Symptoms**: Pre-publish tests fail

**Solutions**:
```bash
# Run tests locally
npm test

# Skip tests (not recommended)
package-publisher publish --skip-verification
```

### Checking Logs

```bash
# Verbose logging
package-publisher publish --verbose

# Debug mode
DEBUG=* package-publisher publish
```

### Support

If the issue persists, please use:
- [GitHub Issues](https://github.com/sanae-abe/package-publisher/issues) - Bug reports and feature requests
- [GitHub Discussions](https://github.com/sanae-abe/package-publisher/discussions) - Questions and discussions

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
