# ドキュメント

Package Publisher（Rust実装）の技術ドキュメントです。

## 📚 ドキュメント一覧

### 統合・連携ガイド

#### [AGENT_INTEGRATION.md](./AGENT_INTEGRATION.md)
AI Agent（Claude Code等）との統合ガイド

#### [CI_CD_INTEGRATION.md](./CI_CD_INTEGRATION.md)
CI/CDパイプライン統合ガイド（GitHub Actions、GitLab CI等）

#### [CLI-TESTING-GUIDE.md](./CLI-TESTING-GUIDE.md)
CLI Testing Specialist統合ガイド - 自動テスト生成と実行

#### [PLUGIN_DEVELOPMENT.md](./PLUGIN_DEVELOPMENT.md)
カスタムプラグイン開発ガイド（Rust実装）

## 🚀 クイックスタート

```bash
# Rustバイナリのビルド
cargo build --release

# CLIヘルプ表示
./target/release/package-publisher --help

# テスト実行
cargo test --lib

# プラグイン開発
詳細は PLUGIN_DEVELOPMENT.md を参照
```

## 🏗️ プロジェクト構成

```
package-publisher/
├── src/
│   ├── bin/           # CLI エントリーポイント
│   ├── core/          # コア機能（Config, State, Error）
│   ├── orchestration/ # オーケストレーション層
│   ├── plugins/       # レジストリプラグイン
│   ├── security/      # セキュリティ機能
│   └── validation/    # バリデーション機能
├── docs/              # ドキュメント（このディレクトリ）
├── examples/          # サンプルコード
└── .github/workflows/ # CI/CD設定
```

## 📊 CI/CD状況

- ✅ Rust CI: 全205テスト合格（Ubuntu/macOS/Windows）
- ✅ CLI Testing Specialist: 全17テスト合格（Ubuntu/macOS）
- ✅ Security Audit: 全検証パス

## 📖 その他のドキュメント

プロジェクトルートには以下のドキュメントもあります：

- **README.md**: プロジェクト概要、クイックスタート（英語）
- **README.ja.md**: プロジェクト概要、クイックスタート（日本語）
- **tasks.yml**: プロジェクトタスク管理
- **Cargo.toml**: Rust依存関係定義

## 🔗 関連リンク

- [GitHub Repository](https://github.com/sanae-abe/package-publisher)
- [Crates.io Package](https://crates.io/crates/package-publisher) (準備中)
