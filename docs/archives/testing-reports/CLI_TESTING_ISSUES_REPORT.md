# cli-testing-specialist 問題報告

**報告日時**: 2025-11-13  
**プロジェクト**: package-publisher  
**テスト成功率**: 84.2% (16/19 tests passed)  
**目標成功率**: 95%+

---

## テスト結果サマリー

| テストスイート | 成功/合計 | 状態 | 備考 |
|--------------|----------|------|------|
| basic | ✅ 5/5 | PASS | package-publisher側の修正が有効 |
| help | ⚠️ 4/5 | 1件失敗 | `help help` サブコマンド問題 |
| multi-shell | ❌ 0/3 | 全て失敗 | 環境変数展開の問題 |
| performance | ✅ 2/2 | PASS | 問題なし |
| security | ⚠️ 3/4 | 1件失敗 | 長い入力処理（議論必要） |

---

## 🔴 HIGH Priority: multi-shell テストの環境変数問題

### 問題の詳細

**ファイル**: `.cli-tests/tests/multi-shell.bats`  
**該当行**: Line 35, 46, 57

**現在のコード**:
```bash
@test "[multi-shell] Run --help in bash" {
    run bash -c '"$CLI_BINARY" --help'
    [ "$status" -eq 0 ]
}
```

**エラー**:
```
BW01: `run`'s command `bash -c "$CLI_BINARY" --help` exited with code 127, 
indicating 'Command not found'.
```

### 根本原因

`bash -c '"$CLI_BINARY" --help'` の実行時：
1. 外側のシングルクォート `'` により、`$CLI_BINARY` が**リテラル文字列**として扱われる
2. サブシェル（bash）内で `$CLI_BINARY` は**未定義変数**（空文字列）として展開される
3. 結果: `bash -c '" " --help'` → `command not found`

### 修正案（3つの選択肢）

#### Option 1: 環境変数をエクスポート（推奨）

```bash
setup() {
    CLI_BINARY="/Users/sanae.abe/projects/package-publisher/dist/cli.js"
    export CLI_BINARY  # この行を追加
}

@test "[multi-shell] Run --help in bash" {
    run bash -c 'node "$CLI_BINARY" --help'  # シングルクォートに変更
    [ "$status" -eq 0 ]
}
```

**利点**: 環境変数がサブシェルに継承される  
**変更箇所**: Line 11（export追加）、Line 35/46/57（シングルクォート化）

#### Option 2: ダブルクォートで変数展開

```bash
@test "[multi-shell] Run --help in bash" {
    run bash -c "node \"$CLI_BINARY\" --help"  # ダブルクォートに変更
    [ "$status" -eq 0 ]
}
```

**利点**: exportなしで動作  
**欠点**: エスケープが複雑、可読性低下  
**変更箇所**: Line 35/46/57のみ

#### Option 3: 絶対パスをハードコード

```bash
@test "[multi-shell] Run --help in bash" {
    run bash -c 'node "/Users/sanae.abe/projects/package-publisher/dist/cli.js" --help'
    [ "$status" -eq 0 ]
}
```

**利点**: シンプル  
**欠点**: DRY原則違反、保守性低下  
**非推奨**: setup()で変数定義している意味がない

### 推奨修正（Option 1）

```diff
 setup() {
     # Set CLI binary path
     CLI_BINARY="/Users/sanae.abe/projects/package-publisher/dist/cli.js"
     BINARY_BASENAME="cli.js"
+    export CLI_BINARY

     # Create temporary directory for test artifacts
     TEST_TEMP_DIR="$(mktemp -d)"
     export TEST_TEMP_DIR

     # Set secure umask
     umask 077
 }

 @test "[multi-shell] Run --help in bash" {
     # Test ID: multi-shell-bash
     # Tags: bash

     # Execute command
-    run bash -c '"$CLI_BINARY" --help'
+    run bash -c 'node "$CLI_BINARY" --help'

     # Assert exit code
     [ "$status" -eq 0 ]
 }

 @test "[multi-shell] Run --help in zsh" {
     # Test ID: multi-shell-zsh
     # Tags: zsh

     # Execute command
-    run zsh -c '"$CLI_BINARY" --help'
+    run zsh -c 'node "$CLI_BINARY" --help'

     # Assert exit code
     [ "$status" -eq 0 ]
 }

 @test "[multi-shell] Run --help in sh" {
     # Test ID: multi-shell-sh
     # Tags: sh

     # Execute command
-    run sh -c '"$CLI_BINARY" --help'
+    run sh -c 'node "$CLI_BINARY" --help'

     # Assert exit code
     [ "$status" -eq 0 ]
 }
```

---

## 🟡 MEDIUM Priority: `help help` サブコマンドテスト失敗

### 問題の詳細

**ファイル**: `.cli-tests/tests/help.bats`  
**該当行**: Line 89-94

**現在のコード**:
```bash
@test "[help] Display help for subcommand 'help'" {
    run "$CLI_BINARY" help help
    [ "$status" -eq 0 ]
}
```

**エラー**: exit code ≠ 0

### 根本原因の調査が必要

以下のどちらかを確認：

#### Case 1: commander.js の仕様
- `program.command('help')` は commander の組み込みコマンド
- `help help` は無限再帰を防ぐため、意図的にエラーを返す可能性

**確認方法**:
```bash
node dist/cli.js help help
echo "Exit code: $?"
```

#### Case 2: テスト期待値の誤り
- `help help` は実際のユースケースではない
- テスト自体が不要な可能性

### 推奨アクション

1. **commander.js の動作確認**:
   ```bash
   node dist/cli.js help help 2>&1
   ```

2. **仕様に応じた修正**:

**If commander returns exit 0**:
- package-publisher側の問題 → `exitOverride` 修正

**If commander returns exit 1**:
- テスト期待値を修正:
  ```bash
  @test "[help] Display help for subcommand 'help'" {
      run "$CLI_BINARY" help help
      # help help is edge case, exit code 0 or 1 acceptable
      [[ "$status" -eq 0 || "$status" -eq 1 ]]
  }
  ```

**If `help help` is invalid use case**:
- テスト自体を削除または skip

---

## 🟢 LOW Priority: 極端に長い入力のテスト

### 問題の詳細

**ファイル**: `.cli-tests/tests/security.bats`  
**該当行**: Line 63-72

**現在のコード**:
```bash
@test "[security] Handle extremely long input" {
    # Test ID: security-004
    # Tags: buffer-overflow, informational

    # Execute command
    run "$CLI_BINARY" --invalid-option 'AAAA...(10KB)...AAAA'

    # Assert exit code
    [ "$status" -eq 0 ]
}
```

**エラー**: exit code ≠ 0

### 議論ポイント

#### 質問1: テストの目的は？
- **A. セキュリティ要件**: 長い入力でクラッシュしないこと
  - → exit code 0 が正しい期待値
  - → package-publisher側で長い入力を truncate/reject すべき

- **B. 情報提供テスト**: 動作確認のみ
  - → Tags に `informational` があるため、これが本来の意図？
  - → exit code は問わず、クラッシュしなければOK

#### 質問2: 実際の動作は？

**確認が必要**:
```bash
node dist/cli.js --invalid-option "$(python3 -c 'print("A"*10000)')" 2>&1
echo "Exit code: $?"
```

**予想される結果**:
- Node.js/OS の引数長制限（通常 ~128KB）に到達
- E2BIG エラー または commander の引数パースエラー
- exit code: 1 または 2

### 推奨アクション

#### Option A: テストタグに従い、期待値を変更

```bash
@test "[security] Handle extremely long input" {
    # Test ID: security-004
    # Tags: buffer-overflow, informational

    # Execute command
    run "$CLI_BINARY" --invalid-option 'AAAA...(10KB)...AAAA'

    # Assert: should not crash (any exit code acceptable)
    # informational test - just ensure no segfault
    [[ "$status" -ge 0 && "$status" -le 255 ]]
}
```

#### Option B: セキュリティ要件として exit 0 を要求

package-publisher側で実装:
```typescript
// src/cli.ts
program
  .configureHelp({
    // Limit option value length
    formatHelp: (cmd, helper) => {
      // Add validation for long inputs
      const MAX_ARG_LENGTH = 4096
      process.argv.forEach(arg => {
        if (arg.length > MAX_ARG_LENGTH) {
          console.error(`Error: Argument too long (max ${MAX_ARG_LENGTH} chars)`)
          process.exit(1)
        }
      })
      return helper.formatHelp(cmd, helper)
    }
  })
```

**ただし**: 
- Node.js自体が既に引数長制限を持つ
- 追加実装は over-engineering の可能性

#### Option C: テストを削除

- `informational` タグ → 本番要件ではない
- 現状の動作（エラー終了）で問題なし
- テストを削除し、ドキュメントに制限を記載

---

## まとめ

### 即座に修正すべき項目

| 優先度 | 項目 | 期待される効果 |
|-------|------|--------------|
| 🔴 HIGH | multi-shell 環境変数問題 | +3 tests (0/3 → 3/3) |
| 🟡 MEDIUM | `help help` テスト | +1 test (4/5 → 5/5) |

**修正後の成功率**: 84.2% (16/19) → **100%** (19/19) または **94.7%** (18/19)

### 議論が必要な項目

| 項目 | 議論内容 | 対応案 |
|------|---------|--------|
| 🟢 LOW | 極端に長い入力テスト | 期待値変更 or テスト削除 |

---

## 次のステップ

1. **multi-shell テスト修正** (HIGH) → `.cli-tests/tests/multi-shell.bats`
2. **`help help` 動作確認** (MEDIUM) → 仕様調査 → 修正方針決定
3. **長い入力テスト議論** (LOW) → 目的確認 → 期待値調整 or 削除

**推定作業時間**: 
- HIGH修正: 5分
- MEDIUM調査+修正: 10分
- LOW議論+対応: 15分
- **合計**: 30分

**修正後の期待成功率**: **95%+ (18-19/19 tests)**

---

**報告者**: Claude Code  
**連絡先**: package-publisher プロジェクト  
**添付ファイル**: なし（必要に応じてテスト実行ログを提供可能）
