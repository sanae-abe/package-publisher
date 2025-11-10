# 📦 package-publisher

> Multi-registry package publishing assistant for Homebrew, crates.io, npm, PyPI

**package-publisher** は、複数のパッケージレジストリへの公開作業を安全かつ効率的に支援するClaude Code agentです。

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

## 🚀 Quick Start

### Installation

```bash
cd ~/projects/package-publisher
npm install
npm run build
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
│   │   ├── ErrorHandling.ts       # Error factory
│   │   ├── RetryManager.ts        # Retry logic
│   │   └── PackagePublisher.ts    # Main orchestrator
│   ├── plugins/
│   │   ├── NPMPlugin.ts           # npm registry
│   │   ├── CratesIOPlugin.ts      # crates.io registry
│   │   ├── PyPIPlugin.ts          # PyPI registry (planned)
│   │   ├── HomebrewPlugin.ts      # Homebrew (planned)
│   │   └── MockRegistryPlugin.ts  # Testing mock
│   ├── security/
│   │   ├── SecureTokenManager.ts  # Token handling
│   │   ├── SecretsScanner.ts      # Secrets detection
│   │   └── SafeCommandExecutor.ts # Command injection prevention
│   └── cli.ts                      # CLI interface
├── tests/
│   └── unit/
│       ├── NPMPlugin.test.ts
│       ├── CratesIOPlugin.test.ts
│       └── PackagePublisher.test.ts
├── docs/
│   └── AGENT_INTEGRATION.md        # Claude Code integration guide
├── agent-definition.yaml           # Claude Code agent definition
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

- [Agent Integration Guide](./docs/AGENT_INTEGRATION.md)
- [Security Best Practices](./docs/SECURITY.md)
- [Plugin Development](./docs/PLUGIN_DEVELOPMENT.md)

## 🛣️ Roadmap

### Phase 1: MVP (Completed)

- [x] Core architecture (interfaces, state machine)
- [x] Security features (token manager, secrets scanner)
- [x] Error handling & retry logic
- [x] CratesIOPlugin
- [x] NPMPlugin
- [x] CLI implementation
- [x] Test suite

### Phase 2: Additional Registries (In Progress)

- [x] NPMPlugin implementation
- [ ] NPMPlugin test suite (In Progress)
- [ ] PyPIPlugin
- [ ] Configuration file support (.publish-config.yaml)
- [ ] CI/CD integration examples

### Phase 3: Advanced Features (Planned)

- [ ] HomebrewPlugin
- [ ] Batch publishing to multiple registries
- [ ] Pre-publish hooks
- [ ] Post-publish notifications (Slack, Discord)
- [ ] Analytics & reporting

## 🤝 Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for details.

## 📄 License

MIT License - see [LICENSE](./LICENSE) for details.

## 🔗 Links

- [GitHub Repository](#) (TBD)
- [npm Package](#) (TBD)
- [Documentation](#) (TBD)

## 🙏 Acknowledgments

Built with ❤️ as a Claude Code agent for safe and efficient package publishing.
