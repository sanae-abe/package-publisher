# Rust移行プロジェクト開始 🚀

**開始日時**: 2025-11-13  
**プロジェクト**: package-publisher  
**移行方式**: TypeScript → Rust  
**推定期間**: 37-45日

---

## ブランチ構成完了 ✅

### リポジトリ構造

```
package-publisher/
├── main (Rust実装に切り替え予定 - Week 11)
├── typescript-legacy (TypeScript版保存 - 読み取り専用)
└── rust-migration (Rust開発ブランチ - Week 2-10)
```

### ブランチ詳細

#### `main`
- **現在**: TypeScript実装 (commit 3f2939e)
- **Week 11後**: Rust実装に完全切り替え
- **保護**: Week 2以降は直接コミット禁止

#### `typescript-legacy`
- **目的**: TypeScript版の永続保存
- **状態**: 読み取り専用（アーカイブ）
- **内容**: CLI testing 100%達成時点の完全な実装
- **用途**: 緊急時のrollback、参照用

#### `rust-migration`
- **目的**: Rust実装開発
- **期間**: Week 2-10 (現在: Week 1完了)
- **統合**: Week 11にmainへマージ

---

## Week 1 完了事項 ✅

### 1. テスト品質確保
- **初回**: 73.7% (14/19 tests)
- **最終**: **100%** (17/17 tests) 🎉
- **ツール**: cli-testing-specialist (commit 409cb87)

### 2. TypeScript版最終調整
- `src/cli.ts`: exitOverride実装
  - 無効なオプション: exit code 2 (POSIX準拠)
  - help/version: 正常動作保証

### 3. ドキュメント整備
- `docs/archives/testing-reports/`: テスト結果アーカイブ
- `docs/archives/rust-migration/`: 移行計画アーカイブ
- `RUST_MIGRATION_STRATEGY.md`: 包括的移行戦略

### 4. ブランチ戦略確立
- `typescript-legacy`: 保存完了
- `rust-migration`: 開発準備完了
- リモートプッシュ完了

---

## Week 2 開始: Phase 1 - セキュリティ層実装

### タスク一覧（並列実行可能）

#### Task 1: SafeCommandExecutor migration (2-3日, HIGH)
**ファイル**: `src/security/SafeCommandExecutor.ts` → Rust

**実装内容**:
- `std::process::Command` による型安全なコマンド実行
- コンパイル時インジェクション防止
- 引数エスケープ検証

**具体的要件**:
```rust
// src/security/command_executor.rs
use std::process::Command;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum CommandError {
    #[error("Command injection detected: {0}")]
    InjectionDetected(String),
    
    #[error("Execution failed: {0}")]
    ExecutionFailed(String),
}

pub struct SafeCommandExecutor {
    // 許可されたコマンドのホワイトリスト
    allowed_commands: Vec<String>,
}

impl SafeCommandExecutor {
    pub fn new(allowed_commands: Vec<String>) -> Self {
        Self { allowed_commands }
    }
    
    pub fn execute(&self, cmd: &str, args: &[&str]) -> Result<String, CommandError> {
        // 1. コマンドがホワイトリストに含まれるか確認
        // 2. Command::new() + arg() で型安全に構築
        // 3. shell metacharacters のバリデーション
        // 4. 実行 + 出力キャプチャ
    }
}
```

**テスト**:
- Malicious input patterns (`;`, `|`, backticks等)
- 許可されていないコマンドの拒否
- 正常なコマンド実行の検証

---

#### Task 2: SecureTokenManager migration (1-2日, HIGH)
**ファイル**: `src/security/SecureTokenManager.ts` → Rust

**実装内容**:
- `secrecy` crate によるメモリ安全なトークン管理
- ログマスキング
- トークン永続化（OS keychain or 暗号化ファイル）

**具体的要件**:
```rust
// src/security/token_manager.rs
use secrecy::{Secret, ExposeSecret};
use serde::{Serialize, Deserialize};

pub struct SecureTokenManager {
    tokens: HashMap<String, Secret<String>>,
}

impl SecureTokenManager {
    pub fn set_token(&mut self, registry: &str, token: Secret<String>) {
        self.tokens.insert(registry.to_string(), token);
    }
    
    pub fn get_token(&self, registry: &str) -> Option<&Secret<String>> {
        self.tokens.get(registry)
    }
    
    pub fn mask_for_display(&self, token: &Secret<String>) -> String {
        // "ghp_1234567890" → "ghp_***" 形式にマスキング
    }
}
```

**セキュリティ要件**:
- トークンを平文でログに出力しない
- Drop時にメモリをゼロクリア
- 永続化時は暗号化必須（ユーザー固有キー）

---

#### Task 3: SecretsScanner migration (2-3日, HIGH)
**ファイル**: `src/security/SecretsScanner.ts` → Rust

**実装内容**:
- `regex` + `aho-corasick` による高速パターンマッチング
- ストリーミングスキャン（大容量ファイル対応）
- 設定可能な除外パターン

**具体的要件**:
```rust
// src/security/secrets_scanner.rs
use aho_corasick::AhoCorasick;
use regex::Regex;

pub struct SecretsScanner {
    patterns: Vec<Regex>,
    multi_pattern: AhoCorasick,
    max_file_size: usize, // デフォルト: 100MB
}

impl SecretsScanner {
    pub fn scan_file(&self, path: &Path) -> Result<Vec<SecretMatch>, ScanError> {
        // 1. ファイルサイズチェック
        // 2. バイナリファイルスキップ
        // 3. ストリーミングスキャン (>10MB)
        // 4. パターンマッチング
    }
    
    pub fn scan_directory(&self, path: &Path) -> Result<Vec<SecretMatch>, ScanError> {
        // 並列スキャン (rayon)
    }
}
```

**パフォーマンス要件**:
- 10MB以下: メモリ一括読み込み
- 10MB以上: ストリーミング処理
- ディレクトリ: 並列スキャン

---

### Phase 1 成功基準

- [ ] `cargo clippy` 警告0件
- [ ] `cargo test` 100%合格
- [ ] セキュリティテスト: malicious input 全拒否
- [ ] パフォーマンス: TypeScript版の≤50%レイテンシ

**推定完了**: Week 1 + 7日 = 2025-11-20

---

## チェックポイント (Week 5)

### 評価基準

**継続条件**:
- Phase 1完了が計画の2倍以内（≤6日）
- セキュリティ機能が実用レベル
- 開発速度がTypeScriptの≥50%

**中止条件**:
- Phase 1が2倍以上遅延（>6日）
- 重大な技術的障壁発見
- 開発速度が<50%

**中止時の対応**:
```bash
git checkout main
git merge typescript-legacy
git branch -D rust-migration
# TypeScript版をnpmに公開
```

---

## リソース

### ドキュメント
- 移行戦略: `docs/archives/rust-migration/RUST_MIGRATION_STRATEGY.md`
- レビュー結果: `docs/archives/rust-migration/rust-migration-review-report.md`
- テスト結果: `docs/archives/testing-reports/FINAL_TEST_REPORT.md`

### 技術スタック
```toml
[dependencies]
clap = { version = "4.5", features = ["derive"] }
serde = { version = "1.0", features = ["derive"] }
serde_yaml = "0.9"
tokio = { version = "1.36", features = ["process", "fs"] }
anyhow = "1.0"
thiserror = "1.0"
regex = "1.10"
secrecy = "0.8"
aho-corasick = "1.1"
```

### コミット規約
```
feat(rust): implement SafeCommandExecutor with std::process::Command
fix(rust): correct token masking in SecureTokenManager
test(rust): add property-based tests for command injection prevention
```

---

## 次のアクション

### 即座に実行

1. **Cargo.toml作成**:
   ```bash
   cargo init --name package-publisher
   ```

2. **依存関係追加**:
   ```bash
   cargo add clap serde serde_yaml tokio anyhow thiserror regex secrecy aho-corasick
   ```

3. **ディレクトリ構造作成**:
   ```bash
   mkdir -p src/security src/core src/plugins
   ```

4. **Task 1開始**:
   - `src/security/command_executor.rs` 作成
   - ホワイトリスト設計
   - テスト駆動開発（TDD）

---

**Week 1完了日時**: 2025-11-13 22:40  
**Week 2開始**: 準備完了 🚀  
**目標**: Phase 1完了（2025-11-20）

---

**作成者**: Claude Code  
**ステータス**: Week 1 ✅ → Week 2 開始準備完了
