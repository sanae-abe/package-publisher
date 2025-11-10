# Phase 4: Advanced Features - 実装計画書

**ステータス**: 🚧 進行中
**開始日**: 2025-11-10
**Phase 4-1 完了日**: 2025-11-10

---

## 📊 Phase 4 概要

Phase 4では、package-publisherをエンタープライズレベルの機能を持つ本格的なパッケージ公開ツールに進化させます。

### 完了済み
- ✅ **Phase 4-1**: Configuration File Support (2025-11-10完了)

### 残りサブフェーズ（優先順位順）
1. **Phase 4-2**: Code Quality & Type Safety (品質改善)
2. **Phase 4-3**: Batch Publishing (バッチ公開)
3. **Phase 4-4**: Hooks System (フック機能)
4. **Phase 4-5**: Notifications (通知機能)
5. **Phase 4-6**: Plugin System (プラグインシステム)
6. **Phase 4-7**: CI/CD Integration Examples (CI/CD統合)
7. **Phase 4-8**: Analytics & Reporting (分析・レポート)

---

## ✅ Phase 4-1: Configuration File Support (完了)

### 実装内容
- [x] YAML設定ファイルサポート (.publish-config.yaml)
- [x] 設定優先度システム (CLI > Env > Project > Global > Default)
- [x] 環境変数展開（セキュリティ制限付き）
- [x] 設定バリデーション（詳細エラーメッセージ）
- [x] ConfigLoader.test.ts (25テスト)

### 成果物
- `src/core/ConfigLoader.ts` (587行)
- `src/core/PublishConfig.ts` (649行)
- `.publish-config.example.yaml` (209行)
- `.publish-config.minimal.yaml` (最小設定例)
- `tests/unit/ConfigLoader.test.ts` (25テスト)

### 既知の改善点
- ⚠️ ConfigLoader.ts に `any` 型が15箇所（Phase 4-2で対応）
- ⚠️ ESLintエラー6件（未使用引数警告4件、unsafe return 2件）

---

## 🔧 Phase 4-2: Code Quality & Type Safety

**優先度**: 🔴 高（Phase 4-1の品質改善）
**予想工数**: 2-3時間
**目標**: ESLintエラー0件、TypeScript strict mode完全準拠

### 実装タスク

#### 2-1. ESLintエラー修正（必須）
- [ ] ConfigLoader.ts の未使用引数を `_warnings` に変更（4箇所）
- [ ] unsafe return エラーの型アサーション追加（2箇所）
- [ ] PackagePublisher.ts の不要な型アサーション削除（1箇所）

#### 2-2. `any` 型の置き換え（推奨）
**対象**: ConfigLoader.ts (15箇所)

| 箇所 | 現在の型 | 改善後の型 | 優先度 |
|------|----------|-----------|--------|
| `deepMerge(target: any, source: any)` | `any` | `Record<string, unknown>` | 高 |
| `validateRegistries(registries: any, ...)` | `any` | `Partial<RegistryConfigs>` | 高 |
| `validateSecurity(security: any, ...)` | `any` | `Partial<SecurityConfig>` | 高 |
| `validateHooks(hooks: any, ...)` | `any` | `Partial<HooksConfig>` | 高 |
| `validatePublishOptions(publish: any, ...)` | `any` | `Partial<PublishOptionsConfig>` | 高 |
| `recursiveExpandEnvVars(obj: any, ...)` | `any` | `unknown` + type guards | 中 |
| `getFieldValue(obj: any, fieldPath: string)` | `any` | `Record<string, unknown>` | 中 |

#### 2-3. テストカバレッジ向上
- [ ] ConfigLoader.test.ts の残りケース追加
  - [ ] extends機能の詳細テスト
  - [ ] 環境変数展開のエッジケース
  - [ ] バリデーションエラーメッセージ検証

#### 2-4. 統合テスト追加
- [ ] PackagePublisher + ConfigLoader 統合テスト
- [ ] 実際のYAMLファイル読み込みテスト（fixture使用）

### 成功基準
- ✅ `npm run lint` エラー0件、警告0件
- ✅ `npm run test` 全テスト合格
- ✅ `npm run test:coverage` カバレッジ85%以上維持

---

## 📦 Phase 4-3: Batch Publishing

**優先度**: 🟡 中
**予想工数**: 4-6時間
**目標**: 複数レジストリへの一括公開

### 実装タスク

#### 3-1. BatchPublisher クラス設計
```typescript
export class BatchPublisher {
  async publishToMultiple(
    registries: string[],
    options: BatchPublishOptions
  ): Promise<BatchPublishResult>
}

export interface BatchPublishOptions {
  sequential?: boolean  // デフォルト: false (並列実行)
  continueOnError?: boolean  // デフォルト: false
  maxConcurrency?: number  // デフォルト: 3
}

export interface BatchPublishResult {
  succeeded: string[]  // 成功したレジストリ
  failed: Map<string, Error>  // 失敗したレジストリとエラー
  skipped: string[]  // スキップされたレジストリ
}
```

#### 3-2. CLI統合
- [ ] `--registries npm,pypi,crates` オプション追加
- [ ] `--sequential` フラグ追加（並列/直列選択）
- [ ] バッチ結果の視覚的な表示

#### 3-3. エラーハンドリング
- [ ] 部分的成功のハンドリング（一部成功、一部失敗）
- [ ] ロールバック戦略（全失敗時の処理）
- [ ] リトライロジックの調整（レジストリ別）

#### 3-4. テスト
- [ ] BatchPublisher.test.ts (20+テスト)
  - 並列公開テスト
  - 直列公開テスト
  - エラーハンドリングテスト
  - 部分的成功のテスト

### 成功基準
- ✅ 複数レジストリへの並列公開が動作
- ✅ エラー時の適切なロールバック
- ✅ テストカバレッジ85%以上

---

## 🔗 Phase 4-4: Hooks System

**優先度**: 🟡 中
**予想工数**: 5-7時間
**目標**: Pre/Post-publish フックの完全実装

### 実装タスク

#### 4-1. HookExecutor クラス実装
```typescript
export class HookExecutor {
  async executeHooks(
    hooks: HookCommand[],
    context: HookContext
  ): Promise<HookExecutionResult>
}

export interface HookContext {
  phase: 'preBuild' | 'prePublish' | 'postPublish' | 'onError'
  registry: string
  version: string
  packageName: string
  environment: Record<string, string>
}
```

#### 4-2. セキュリティ強化
- [ ] allowedCommands のホワイトリスト検証
- [ ] workingDirectory のパストラバーサル対策
- [ ] タイムアウト処理の実装
- [ ] 環境変数の安全な展開（${VERSION} 等）

#### 4-3. CLI統合
- [ ] `--skip-hooks` オプション追加
- [ ] `--hooks-only` オプション（フックのみ実行）
- [ ] フック実行結果の詳細表示

#### 4-4. テスト
- [ ] HookExecutor.test.ts (25+テスト)
  - 各フェーズのフック実行テスト
  - タイムアウトテスト
  - セキュリティ検証テスト
  - エラーハンドリングテスト

### Phase 4-1 設定ファイルとの統合
- ✅ PublishConfig.ts に型定義済み（HooksConfig, HookCommand）
- ✅ .publish-config.example.yaml に設定例記載
- [ ] ConfigLoader.ts のバリデーション実装済み

### 成功基準
- ✅ 全フックフェーズが動作
- ✅ セキュリティ検証が機能
- ✅ テストカバレッジ85%以上

---

## 📢 Phase 4-5: Notifications

**優先度**: 🟢 低
**予想工数**: 3-5時間
**目標**: Slack/Email通知機能

### 実装タスク

#### 5-1. NotificationManager クラス実装
```typescript
export class NotificationManager {
  async notify(event: PublishEvent): Promise<void>
}

export interface PublishEvent {
  type: 'success' | 'failure' | 'warning'
  registry: string
  packageName: string
  version: string
  message: string
  timestamp: Date
}
```

#### 5-2. 通知チャネル実装
- [ ] SlackNotifier (Webhook経由)
- [ ] EmailNotifier (SMTP/SendGrid)
- [ ] プラガブルな通知インターフェース

#### 5-3. テスト
- [ ] NotificationManager.test.ts (15+テスト)
- [ ] SlackNotifier.test.ts (モックWebhook)
- [ ] EmailNotifier.test.ts (モックSMTP)

### Phase 4-1 設定ファイルとの統合
- ✅ PublishConfig.ts に型定義済み（NotificationsConfig）
- ✅ .publish-config.example.yaml にコメントアウト例記載

### 成功基準
- ✅ Slack通知が動作
- ✅ Email通知が動作
- ✅ エラー時も通知が送信される

---

## 🔌 Phase 4-6: Plugin System

**優先度**: 🟢 低
**予想工数**: 8-10時間
**目標**: カスタムレジストリ対応のプラグインシステム

### 実装タスク

#### 6-1. Plugin インターフェース定義
```typescript
export interface PublishPlugin {
  name: string
  version: string

  initialize(config: PluginConfig): Promise<void>

  supports(projectPath: string): Promise<boolean>

  publish(options: PluginPublishOptions): Promise<PublishResult>

  verify?(options: PluginVerifyOptions): Promise<VerifyResult>
}
```

#### 6-2. PluginLoader 実装
- [ ] npm パッケージからのプラグイン読み込み
- [ ] ローカルファイルパスからの読み込み
- [ ] プラグインのバージョン管理

#### 6-3. サンプルプラグイン
- [ ] `package-publisher-plugin-example` 作成
- [ ] プラグイン開発ガイド更新（PLUGIN_DEVELOPMENT.md）

#### 6-4. テスト
- [ ] PluginLoader.test.ts (20+テスト)
- [ ] サンプルプラグインのテスト

### Phase 4-1 設定ファイルとの統合
- ✅ PublishConfig.ts に型定義済み（PluginConfig）
- ✅ .publish-config.example.yaml にコメントアウト例記載

### 成功基準
- ✅ プラグインの動的読み込みが動作
- ✅ サンプルプラグインが機能
- ✅ ドキュメント完備

---

## 🚀 Phase 4-7: CI/CD Integration Examples

**優先度**: 🟢 低
**予想工数**: 2-3時間
**目標**: 主要CI/CDプラットフォームの設定例

### 実装タスク

#### 7-1. GitHub Actions ワークフロー例
- [ ] `.github/workflows/publish-npm.yml`
- [ ] `.github/workflows/publish-multiregistry.yml`
- [ ] Secrets管理のベストプラクティス

#### 7-2. GitLab CI 設定例
- [ ] `.gitlab-ci.yml` サンプル
- [ ] マルチレジストリ公開ジョブ

#### 7-3. その他CI/CDプラットフォーム
- [ ] CircleCI 設定例
- [ ] Travis CI 設定例（参考程度）

#### 7-4. ドキュメント
- [ ] `docs/CI_CD_INTEGRATION.md` 作成
- [ ] セキュリティのベストプラクティス記載

### 成功基準
- ✅ 主要3プラットフォームの設定例が動作
- ✅ ドキュメント完備

---

## 📊 Phase 4-8: Analytics & Reporting

**優先度**: 🔵 最低
**予想工数**: 6-8時間
**目標**: 公開統計とレポート生成

### 実装タスク

#### 8-1. PublishAnalytics クラス実装
- [ ] 公開成功率の追跡
- [ ] レジストリ別統計
- [ ] 時系列データの保存

#### 8-2. レポート生成
- [ ] JSON形式でのエクスポート
- [ ] Markdown形式でのサマリー
- [ ] グラフ生成（オプション）

#### 8-3. CLI統合
- [ ] `package-publisher stats` コマンド
- [ ] `package-publisher report` コマンド

#### 8-4. テスト
- [ ] PublishAnalytics.test.ts (15+テスト)

### 成功基準
- ✅ 統計情報の収集が動作
- ✅ レポート生成が機能

---

## 📅 実装スケジュール

### 優先順位に基づく推奨順序

1. **Phase 4-2** (必須): Code Quality & Type Safety
   - 工数: 2-3時間
   - 理由: Phase 4-1の品質改善、後続フェーズの基盤

2. **Phase 4-3** (推奨): Batch Publishing
   - 工数: 4-6時間
   - 理由: ユーザー価値が高い、MVPの延長線

3. **Phase 4-4** (推奨): Hooks System
   - 工数: 5-7時間
   - 理由: 型定義済み、実装のみで完成

4. **Phase 4-5** (オプション): Notifications
   - 工数: 3-5時間
   - 理由: エンタープライズ向け機能

5. **Phase 4-6** (オプション): Plugin System
   - 工数: 8-10時間
   - 理由: 拡張性向上、複雑度高い

6. **Phase 4-7** (オプション): CI/CD Examples
   - 工数: 2-3時間
   - 理由: ドキュメント中心、実装少ない

7. **Phase 4-8** (オプション): Analytics
   - 工数: 6-8時間
   - 理由: Nice-to-have機能

### マイルストーン

- **Milestone 1**: Phase 4-2 完了（品質改善）
- **Milestone 2**: Phase 4-3 完了（バッチ公開）
- **Milestone 3**: Phase 4-4 完了（フック機能）
- **Milestone 4**: Phase 5 準備（Phase 4完了）

---

## 🛡️ リスク評価

### セキュリティリスク 🔒
- **Phase 4-4 (Hooks)**: 🔴 高リスク
  - 任意コマンド実行のため、セキュリティ検証が最重要
  - 軽減策: allowedCommands ホワイトリスト、サンドボックス実行

- **Phase 4-6 (Plugins)**: 🟡 中リスク
  - 外部コードの動的読み込み
  - 軽減策: プラグイン署名検証、権限制限

### 技術的リスク ⚙️
- **Phase 4-3 (Batch)**: 🟡 中リスク
  - 並列実行の複雑性、エラーハンドリング
  - 軽減策: 段階的実装、豊富なテスト

- **Phase 4-6 (Plugins)**: 🟡 中リスク
  - プラグインAPI の後方互換性維持
  - 軽減策: セマンティックバージョニング、非推奨警告

### 開発効率リスク 📊
- **Phase 4-6 (Plugins)**: 🔴 高工数
  - 8-10時間の予想工数、複雑な設計
  - 軽減策: 段階的リリース、Phase 5 への繰り延べ検討

---

## 📖 関連ドキュメント

- [README.md](./README.md) - プロジェクト概要とRoadmap
- [docs/AGENT_INTEGRATION.md](./docs/AGENT_INTEGRATION.md) - Claude Code統合ガイド
- [docs/PLUGIN_DEVELOPMENT.md](./docs/PLUGIN_DEVELOPMENT.md) - プラグイン開発ガイド
- [.publish-config.example.yaml](./.publish-config.example.yaml) - 設定ファイル例

---

## 🔄 更新履歴

- **2025-11-10**: 初版作成（Phase 4-1完了時点）
- **2025-11-10**: Phase 4-2〜4-8 の詳細計画追加
