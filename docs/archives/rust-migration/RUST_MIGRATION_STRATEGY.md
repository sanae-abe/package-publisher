# Rust Migration Strategy for package-publisher

**Document Version**: 1.0  
**Created**: 2025-11-13  
**Status**: APPROVED  
**Decision**: Proceed with Rust migration

---

## Executive Summary

### Migration Decision

**Proceed with full Rust migration** after addressing critical security and architectural gaps identified in the review process.

**Justification**:
- **Security**: Memory safety, compile-time injection prevention, zero-copy operations
- **Performance**: Async I/O with tokio, elimination of Node.js runtime overhead
- **Distribution**: Single binary deployment (no Node.js dependency)
- **Foundation**: Strong TypeScript codebase (367 tests, 89% coverage) provides solid test migration base

**Timeline**: 37-45 days (revised estimate with review feedback incorporated)

---

## TypeScript Version Lifecycle

### Current Status (v0.1.0)

- **Implementation**: TypeScript (Node.js 18+)
- **Publication status**: Unpublished (local development only)
- **Test coverage**: 367 tests, 89% coverage
- **Production users**: 0 (pre-release)

### Deprecation Timeline

**Advantage**: No published version means clean migration without user disruption.

| Phase | Timeline | TypeScript Status | Rust Status | Actions |
|-------|----------|-------------------|-------------|---------|
| **Phase 0** | Week 1 | Active development | Planning | Create Task 0 (this document) |
| **Phase 1-3** | Weeks 2-5 | Maintenance only | Active development | Security/CLI/Plugins implementation |
| **Phase 4-5** | Weeks 6-8 | Bug fixes only | Active development | Core logic + Advanced features |
| **Phase 6** | Weeks 9-10 | Frozen | Testing + CI/CD | Test migration, cross-compilation |
| **Rust v0.1.0** | Week 11 | **Deprecated** | **Published** | First public release (Rust) |
| **Post-release** | Week 12+ | Archived | Active maintenance | TypeScript → docs/archives/ |

**TypeScript EOL**: Upon Rust v0.1.0 release (no extended support needed - no existing users)

---

## Branch Strategy

### Repository Structure

```
package-publisher/
├── main (Rust implementation after switchover)
├── typescript-legacy (preservation branch, read-only after Week 11)
└── rust-migration (development branch, Weeks 2-10)
```

### Branch Workflow

#### Week 1: Preparation
```bash
# Current state: main = TypeScript
git checkout main
# Create preservation branch
git checkout -b typescript-legacy
git push -u origin typescript-legacy

# Create migration development branch
git checkout main
git checkout -b rust-migration
git push -u origin rust-migration
```

#### Weeks 2-10: Development
- **All Rust development**: On `rust-migration` branch
- **TypeScript fixes** (if critical bugs found): Cherry-pick to `typescript-legacy`, merge to `rust-migration`
- **Branch protection**: `main` locked (no direct commits), `typescript-legacy` read-only after Week 2

#### Week 11: Switchover
```bash
# Merge Rust implementation to main
git checkout main
git merge --squash rust-migration
git commit -m "feat: Rust implementation (v0.1.0)"
git tag v0.1.0
git push origin main --tags

# Archive TypeScript
mkdir -p docs/archives/typescript-implementation
git archive typescript-legacy | tar -x -C docs/archives/typescript-implementation
```

### Commit Message Convention

Use conventional commits with Rust-specific scope:

```
feat(rust): implement SafeCommandExecutor with std::process::Command
fix(rust): correct token masking in SecureTokenManager
test(rust): add property-based tests for command injection prevention
docs(rust): update README for Rust installation
```

---

## User Migration Guide

### For New Users (Week 11+)

**Target audience**: First-time users after Rust v0.1.0 release

**No migration needed** - install Rust version directly:

```bash
# Recommended: Binary installation
curl -sSL https://github.com/sanae-abe/package-publisher/releases/latest/download/package-publisher-$(uname -s)-$(uname -m) -o ~/.local/bin/package-publisher
chmod +x ~/.local/bin/package-publisher

# Alternative: Cargo installation
cargo install package-publisher
```

### For Early Adopters (TypeScript v0.1.0-dev)

**Target audience**: Developers who cloned repository during Weeks 1-10

**Migration checklist**:

1. **Update local repository**:
   ```bash
   git fetch origin
   git checkout main
   git pull origin main
   ```

2. **Remove Node.js dependencies**:
   ```bash
   rm -rf node_modules package-lock.json
   ```

3. **Install Rust toolchain** (if not already installed):
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```

4. **Build Rust version**:
   ```bash
   cargo build --release
   sudo cp target/release/package-publisher /usr/local/bin/
   ```

5. **Verify installation**:
   ```bash
   package-publisher --version  # Should show v0.1.0 (Rust)
   ```

### Configuration Compatibility

**Breaking changes**: None expected (YAML configuration format preserved)

**Validated compatibility**:
- `.publish-config.yaml` schema unchanged
- Environment variable names unchanged (e.g., `NPM_TOKEN`, `PYPI_TOKEN`)
- CLI flags backward compatible (e.g., `--registry`, `--dry-run-only`)

**Migration script** (if needed, Week 11):
```bash
# Validate existing config files
package-publisher check --config .publish-config.yaml
```

---

## Abort Criteria and Rollback Strategy

### Abort Criteria (Decision Points)

#### Phase 1 Checkpoint (Week 5)

**Evaluate**: Security layer implementation progress

**Abort if**:
- Phase 1 duration >2x estimate (>6 days actual vs. 3 days planned)
- Critical security features prove impractical in Rust (e.g., OS keychain integration failures)
- Development velocity <50% of TypeScript baseline

**Action if aborted**:
```bash
# Restore TypeScript as primary implementation
git checkout main
git merge typescript-legacy
git branch -D rust-migration
```

#### Phase 4 Checkpoint (Week 8)

**Evaluate**: Core publishing logic feasibility

**Abort if**:
- Registry plugins incompatible with Rust ecosystem (e.g., Homebrew Formula parsing impossible)
- Test migration cost >2x estimate (>14 days actual vs. 7 days planned)
- Performance benchmarks show no improvement over TypeScript

**Action if aborted**: Same as Phase 1, plus publish TypeScript v0.1.0 to npm

### Rollback Strategy (Post-Release)

**Scenario**: Critical bug in Rust v0.1.0 within 2 weeks of release

**Rollback procedure**:
```bash
# 1. Publish TypeScript emergency patch
git checkout typescript-legacy
npm version patch  # v0.1.1
npm publish

# 2. Deprecate Rust release
cargo yank --version 0.1.0 package-publisher

# 3. Communicate to users
# Create GitHub issue explaining rollback
```

**Prevention**: Phase 6 must include comprehensive integration tests (see Task 20a-d)

---

## Risk Mitigation

### Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Rust learning curve slows development | Medium | High | Prototype Phase 1 first, evaluate at checkpoint |
| Plugin ecosystem incompatibility | Low | High | Research Phase 3 dependencies early (Week 2) |
| Cross-compilation complexity | Medium | Medium | Use `cross` crate, test early (Week 9) |
| Test migration underestimation | High | Medium | Split into parallel tasks (20a-d), add Task 19.5 |

### Organizational Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Contributor onboarding difficulty | Medium | Low | Comprehensive docs (Task 21.5), Docker dev env |
| Loss of TypeScript expertise | Low | Medium | Preserve typescript-legacy branch, detailed docs |

---

## Success Criteria

### Phase 1-6 Success Metrics

- **Code quality**: `cargo clippy` zero warnings, `cargo test` 100% pass rate
- **Performance**: Publish workflow ≤50% of TypeScript version latency
- **Security**: Zero findings in security audit (Task 22)
- **Test coverage**: ≥89% (preserve TypeScript parity)

### Release Success Metrics (Week 12-14)

- **Installation success rate**: >95% across Linux/macOS/Windows
- **User-reported bugs**: <5 critical bugs in first 2 weeks
- **Documentation completeness**: All TypeScript docs migrated (Task 21.5)

---

## Communication Plan

### Internal (Development Team)

- **Week 1**: Share this document, align on timeline
- **Week 5**: Phase 1 checkpoint meeting (abort decision)
- **Week 8**: Phase 4 checkpoint meeting (abort decision)
- **Week 10**: Pre-release review (security audit results)

### External (Users)

**Week 11** (upon Rust v0.1.0 release):

**GitHub Release Notes**:
```markdown
# v0.1.0 - Rust Implementation 🦀

## 🎉 First Public Release

This is the first published version of package-publisher, **implemented in Rust** for enhanced security and performance.

### ✨ Highlights
- Memory-safe command execution (no injection vulnerabilities)
- Single binary distribution (no Node.js required)
- 2-5x faster publishing workflow

### 📦 Installation
[Binary installation instructions]

### 🔄 Migration from TypeScript (for early adopters)
[Link to migration guide section of this document]
```

**README.md badge update**:
```markdown
![Rust](https://img.shields.io/badge/rust-1.75+-orange)
```

---

## Appendix: Task Dependency Updates

Based on review feedback, revised task dependencies:

### Original Dependencies (from plan.md)
```
Phase 1: task-1, task-2, task-3 (task-2 depends on task-1)
Phase 2: task-1 -> task-4 -> task-5 -> task-6
```

### Revised Dependencies (reduced coupling)
```
Phase 0: task-0 (this document)
Phase 1: [task-1, task-2, task-3] (all parallel, depends: task-0)
Phase 2: task-6 -> [task-4, task-5] (parallel)
```

**Rationale**:
- Task-2 (token manager) orthogonal to Task-1 (command executor)
- Task-4 (CLI) depends on config types (task-6), not execution layer (task-1)

**Impact**: Enables 2-3 developers to work in parallel during Phase 1-2

---

## Document Maintenance

**Owner**: Project Lead  
**Review cycle**: After each checkpoint (Weeks 5, 8, 10)  
**Update triggers**:
- Abort criteria triggered
- Timeline deviation >20%
- New critical risks identified

**Changelog**:
- 2025-11-13 v1.0: Initial version (Task 0 completion)

---

## Approval

- [ ] Project Lead: _____________________ Date: _____
- [ ] Security Reviewer: ________________ Date: _____
- [ ] Technical Architect: ______________ Date: _____

**Next Action**: Begin Phase 1 implementation (Task 1: SafeCommandExecutor migration)
