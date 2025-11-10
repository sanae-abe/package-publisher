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
│   │   ├── ErrorHandling.ts       # Error factory & codes
│   │   ├── RetryManager.ts        # Retry logic with backoff
│   │   └── PackagePublisher.ts    # Main orchestrator
│   ├── plugins/
│   │   ├── NPMPlugin.ts           # ✅ npm/npmjs.com
│   │   ├── CratesIOPlugin.ts      # ✅ Rust/crates.io
│   │   ├── PyPIPlugin.ts          # ✅ Python/PyPI
│   │   └── HomebrewPlugin.ts      # ✅ Homebrew Formula
│   ├── security/
│   │   ├── SecureTokenManager.ts  # Token handling & masking
│   │   ├── SecretsScanner.ts      # 10 secret patterns
│   │   └── SafeCommandExecutor.ts # Command injection prevention
│   ├── cli.ts                     # CLI interface (Commander.js)
│   └── index.ts                   # Library exports
├── tests/
│   └── unit/
│       ├── NPMPlugin.test.ts          # 29 tests, 93% coverage
│       ├── CratesIOPlugin.test.ts     # 43 tests, Rust/crates.io
│       ├── PyPIPlugin.test.ts         # 56 tests, Python/PyPI
│       ├── HomebrewPlugin.test.ts     # 45 tests, Homebrew Formula
│       └── PackagePublisher.test.ts   # 16 tests, integration
├── docs/
│   ├── AGENT_INTEGRATION.md       # Claude Code integration
│   └── PLUGIN_DEVELOPMENT.md      # Custom plugin development
├── agent-definition.yaml          # Claude Code agent definition
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

- [Agent Integration Guide](./docs/AGENT_INTEGRATION.md) - Claude Code使用方法、トラブルシューティング
- [Plugin Development](./docs/PLUGIN_DEVELOPMENT.md) - カスタムプラグイン開発ガイド

## 🛣️ Roadmap

### Phase 1: Core MVP ✅ (Completed)

- [x] Core architecture (interfaces, state machine, error handling)
- [x] Security features (token manager, secrets scanner, safe executor)
- [x] NPMPlugin (600 lines, 93% test coverage)
- [x] CLI implementation (Commander.js)
- [x] Test infrastructure (Jest, 29 tests)

### Phase 1.5: Quality Improvements ✅ (Completed)

- [x] ESLint configuration (TypeScript strict mode)
- [x] Prettier configuration
- [x] Code formatting (consistent style)
- [x] Test coverage reporting

### Phase 2: Multi-Registry Support ✅ (Completed)

- [x] CratesIOPlugin (Rust/crates.io, 470 lines)
- [x] PyPIPlugin (Python/PyPI, 540 lines)
- [x] HomebrewPlugin (Homebrew Formula, 450 lines)
- [x] AUTHENTICATION_FAILED error code
- [x] PublishResult.metadata field

### Phase 3: Documentation & Testing ✅ (Completed)

- [x] AGENT_INTEGRATION.md
- [x] PLUGIN_DEVELOPMENT.md
- [x] PackagePublisher.test.ts (16 tests, integration tests)
- [x] CratesIOPlugin.test.ts (43 tests, Rust/crates.io)
- [x] PyPIPlugin.test.ts (56 tests, Python/PyPI)
- [x] HomebrewPlugin.test.ts (45 tests, Homebrew Formula)

### Phase 4: Advanced Features 📋 (Planned)

- [ ] Configuration file support (.publish-config.yaml)
- [ ] Batch publishing to multiple registries
- [ ] Pre-publish & post-publish hooks
- [ ] Notifications (Slack, Discord, Email)
- [ ] CI/CD integration examples (GitHub Actions, GitLab CI)
- [ ] Analytics & reporting dashboard

## 🤝 Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for details.

## 📄 License

MIT License - see [LICENSE](./LICENSE) for details.

## 🔗 Links

- [GitHub Repository](https://github.com/sanae-abe/package-publisher)
- [Issues](https://github.com/sanae-abe/package-publisher/issues)
- [Discussions](https://github.com/sanae-abe/package-publisher/discussions)

## 🙏 Acknowledgments

Built with ❤️ as a Claude Code agent for safe and efficient package publishing.
