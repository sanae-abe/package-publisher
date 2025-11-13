//! Secrets scanner for detecting hardcoded secrets in source code
//!
//! This module provides pattern-based scanning to detect potentially hardcoded
//! secrets such as API keys, tokens, passwords, and private keys in project files.

use regex::Regex;
use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

/// Severity level for detected secrets
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Severity {
    Critical,
    High,
    Medium,
    Low,
}

impl fmt::Display for Severity {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Severity::Critical => write!(f, "critical"),
            Severity::High => write!(f, "high"),
            Severity::Medium => write!(f, "medium"),
            Severity::Low => write!(f, "low"),
        }
    }
}

/// Pattern for detecting a specific type of secret
#[derive(Clone)]
pub struct SecretPattern {
    pub name: String,
    pub regex: Regex,
    pub severity: Severity,
}

/// A single finding from the secrets scan
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SecretFinding {
    pub file: PathBuf,
    pub line: usize,
    pub secret_type: String,
    pub severity: Severity,
    pub matched: String, // Masked version
}

/// Report from scanning a project for secrets
#[derive(Debug, Clone)]
pub struct ScanReport {
    pub has_secrets: bool,
    pub findings: Vec<SecretFinding>,
    pub scanned_files: usize,
    pub skipped_files: Vec<PathBuf>,
}

/// Scanner for detecting hardcoded secrets in source code
///
/// # Examples
///
/// ```no_run
/// use package_publisher::security::SecretsScanner;
/// use std::path::Path;
///
/// let scanner = SecretsScanner::new();
/// let report = scanner.scan_project(Path::new(".")).unwrap();
///
/// if report.has_secrets {
///     println!("Found {} secrets!", report.findings.len());
/// }
/// ```
pub struct SecretsScanner {
    patterns: Vec<SecretPattern>,
    default_ignore_patterns: Vec<Regex>,
    custom_ignore_patterns: Vec<Regex>,
}

impl Default for SecretsScanner {
    fn default() -> Self {
        Self::new()
    }
}

impl SecretsScanner {
    /// Creates a new SecretsScanner with default patterns
    ///
    /// # Examples
    ///
    /// ```
    /// use package_publisher::security::SecretsScanner;
    ///
    /// let scanner = SecretsScanner::new();
    /// ```
    pub fn new() -> Self {
        Self {
            patterns: Self::default_patterns(),
            default_ignore_patterns: Self::default_ignore_patterns(),
            custom_ignore_patterns: Vec::new(),
        }
    }

    /// Configures custom ignore patterns
    ///
    /// # Arguments
    ///
    /// * `patterns` - List of glob-style patterns to ignore
    ///
    /// # Examples
    ///
    /// ```
    /// use package_publisher::security::SecretsScanner;
    ///
    /// let mut scanner = SecretsScanner::new();
    /// scanner.configure(&["*.test.ts", "fixtures/*"]);
    /// ```
    pub fn configure(&mut self, patterns: &[&str]) {
        self.custom_ignore_patterns = patterns
            .iter()
            .filter_map(|p| Self::glob_to_regex(p))
            .collect();
    }

    /// Scans a project directory for secrets
    ///
    /// # Arguments
    ///
    /// * `project_path` - Path to the project directory
    ///
    /// # Examples
    ///
    /// ```no_run
    /// use package_publisher::security::SecretsScanner;
    /// use std::path::Path;
    ///
    /// let scanner = SecretsScanner::new();
    /// let report = scanner.scan_project(Path::new(".")).unwrap();
    /// ```
    pub fn scan_project(&self, project_path: &Path) -> anyhow::Result<ScanReport> {
        let mut findings = Vec::new();
        let mut scanned_files = 0;
        let mut skipped_files = Vec::new();

        for entry in WalkDir::new(project_path)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if !entry.file_type().is_file() {
                continue;
            }

            let path = entry.path();

            if self.should_ignore(path) {
                skipped_files.push(path.to_path_buf());
                continue;
            }

            if let Ok(content) = fs::read_to_string(path) {
                let file_findings = self.scan_content(&content, path);
                findings.extend(file_findings);
                scanned_files += 1;
            } else {
                skipped_files.push(path.to_path_buf());
            }
        }

        Ok(ScanReport {
            has_secrets: !findings.is_empty(),
            findings,
            scanned_files,
            skipped_files,
        })
    }

    /// Scans file content for secrets
    ///
    /// # Arguments
    ///
    /// * `content` - File content to scan
    /// * `file_path` - Path to the file (for reporting)
    pub fn scan_content(&self, content: &str, file_path: &Path) -> Vec<SecretFinding> {
        let mut findings = Vec::new();
        let lines: Vec<&str> = content.lines().collect();

        for (line_idx, line) in lines.iter().enumerate() {
            for pattern in &self.patterns {
                for capture in pattern.regex.find_iter(line) {
                    findings.push(SecretFinding {
                        file: file_path.to_path_buf(),
                        line: line_idx + 1,
                        secret_type: pattern.name.clone(),
                        severity: pattern.severity,
                        matched: Self::mask_match(capture.as_str()),
                    });
                }
            }
        }

        findings
    }

    /// Masks a matched secret for safe display
    ///
    /// Shows first 5 and last 5 characters for identification.
    ///
    /// # Arguments
    ///
    /// * `matched` - The matched secret string
    ///
    /// # Examples
    ///
    /// ```
    /// use package_publisher::security::SecretsScanner;
    ///
    /// let scanner = SecretsScanner::new();
    /// assert_eq!(SecretsScanner::mask_match("short"), "****");
    /// assert_eq!(SecretsScanner::mask_match("very-long-secret-key-12345"), "very-...12345");
    /// ```
    pub fn mask_match(matched: &str) -> String {
        if matched.is_empty() || matched.len() <= 10 {
            return "****".to_string();
        }

        let prefix = &matched[..5];
        let suffix = &matched[matched.len() - 5..];
        format!("{}...{}", prefix, suffix)
    }

    /// Checks if a file path should be ignored
    ///
    /// # Arguments
    ///
    /// * `path` - Path to check
    pub fn should_ignore(&self, path: &Path) -> bool {
        let path_str = path.to_string_lossy();

        // Check default patterns
        if self
            .default_ignore_patterns
            .iter()
            .any(|pattern| pattern.is_match(&path_str))
        {
            return true;
        }

        // Check custom patterns
        if self
            .custom_ignore_patterns
            .iter()
            .any(|pattern| pattern.is_match(&path_str))
        {
            return true;
        }

        false
    }

    /// Returns default secret patterns
    fn default_patterns() -> Vec<SecretPattern> {
        vec![
            SecretPattern {
                name: "Generic API Key".to_string(),
                regex: Regex::new(r#"(?i)(?:api[_-]?key|apikey|api[_-]?secret)\s*[:=]\s*['"]([a-zA-Z0-9_\-]{20,})['"]"#).unwrap(),
                severity: Severity::Critical,
            },
            SecretPattern {
                name: "AWS Access Key".to_string(),
                regex: Regex::new(r"AKIA[0-9A-Z]{16}").unwrap(),
                severity: Severity::Critical,
            },
            SecretPattern {
                name: "GitHub Token".to_string(),
                regex: Regex::new(r"gh[ps]_[a-zA-Z0-9]{36,}").unwrap(),
                severity: Severity::Critical,
            },
            SecretPattern {
                name: "Generic Secret".to_string(),
                regex: Regex::new(r#"(?i)(?:secret|password|passwd|pwd)\s*[:=]\s*['"]([^'"]{8,})['"]"#).unwrap(),
                severity: Severity::High,
            },
            SecretPattern {
                name: "Private Key".to_string(),
                regex: Regex::new(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----").unwrap(),
                severity: Severity::Critical,
            },
            SecretPattern {
                name: "NPM Token".to_string(),
                regex: Regex::new(r"npm_[a-zA-Z0-9]{36}").unwrap(),
                severity: Severity::Critical,
            },
            SecretPattern {
                name: "PyPI Token".to_string(),
                regex: Regex::new(r"pypi-[a-zA-Z0-9_-]{20,}").unwrap(),
                severity: Severity::Critical,
            },
            SecretPattern {
                name: "Slack Token".to_string(),
                regex: Regex::new(r"xox[baprs]-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24,}").unwrap(),
                severity: Severity::High,
            },
            SecretPattern {
                name: "Generic Token".to_string(),
                regex: Regex::new(r#"(?i)(?:token|auth|bearer)\s*[:=]\s*['"]([a-zA-Z0-9_\-\.]{20,})['"]"#).unwrap(),
                severity: Severity::High,
            },
            SecretPattern {
                name: "Base64 Secret (Suspicious)".to_string(),
                regex: Regex::new(r#"(?i)(?:secret|password|key|token)\s*[:=]\s*['"]([A-Za-z0-9+/]{40,}={0,2})['"]"#).unwrap(),
                severity: Severity::Medium,
            },
        ]
    }

    /// Returns default ignore patterns
    fn default_ignore_patterns() -> Vec<Regex> {
        vec![
            Regex::new(r"node_modules").unwrap(),
            Regex::new(r"\.git").unwrap(),
            Regex::new(r"dist").unwrap(),
            Regex::new(r"build").unwrap(),
            Regex::new(r"coverage").unwrap(),
            Regex::new(r"\.min\.js$").unwrap(),
            Regex::new(r"\.map$").unwrap(),
            Regex::new(r"package-lock\.json$").unwrap(),
            Regex::new(r"yarn\.lock$").unwrap(),
            Regex::new(r"pnpm-lock\.yaml$").unwrap(),
            Regex::new(r"tests?/").unwrap(),
            Regex::new(r"__mocks__").unwrap(),
            Regex::new(r"__fixtures__").unwrap(),
            Regex::new(r"\.test\.").unwrap(),
            Regex::new(r"\.spec\.").unwrap(),
        ]
    }

    /// Converts glob pattern to regex
    ///
    /// # Arguments
    ///
    /// * `glob` - Glob-style pattern (e.g., "*.test.ts")
    fn glob_to_regex(glob: &str) -> Option<Regex> {
        let pattern = glob
            .replace('.', r"\.")
            .replace('*', ".*")
            .replace('?', ".");

        Regex::new(&pattern).ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Write;
    use tempfile::TempDir;

    #[test]
    fn test_new_scanner() {
        let scanner = SecretsScanner::new();
        assert!(scanner.patterns.len() > 0);
    }

    #[test]
    fn test_mask_match_short_string() {
        assert_eq!(SecretsScanner::mask_match("short"), "****");
        assert_eq!(SecretsScanner::mask_match(""), "****");
    }

    #[test]
    fn test_mask_match_long_string() {
        assert_eq!(
            SecretsScanner::mask_match("very-long-secret-key-12345"),
            "very-...12345"
        );
    }

    #[test]
    fn test_scan_content_no_secrets() {
        let scanner = SecretsScanner::new();
        let content = "const x = 123;\nconst y = 'hello';";
        let findings = scanner.scan_content(content, Path::new("test.ts"));
        assert_eq!(findings.len(), 0);
    }

    #[test]
    fn test_scan_content_api_key() {
        let scanner = SecretsScanner::new();
        let content = r#"const apiKey = "abcdefghijklmnopqrst1234";"#;
        let findings = scanner.scan_content(content, Path::new("test.ts"));
        assert!(findings.len() > 0);
        assert!(findings[0].matched.contains("..."));
    }

    #[test]
    fn test_scan_content_aws_key() {
        let scanner = SecretsScanner::new();
        let content = "AWS_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE";
        let findings = scanner.scan_content(content, Path::new("test.ts"));
        assert!(findings.len() > 0);
        assert_eq!(findings[0].severity, Severity::Critical);
    }

    #[test]
    fn test_scan_content_github_token() {
        let scanner = SecretsScanner::new();
        let content = "GITHUB_TOKEN=ghp_1234567890abcdefghijklmnopqrstuvwxyz";
        let findings = scanner.scan_content(content, Path::new("test.ts"));
        assert!(findings.len() > 0);
    }

    #[test]
    fn test_scan_content_private_key() {
        let scanner = SecretsScanner::new();
        let content = "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA";
        let findings = scanner.scan_content(content, Path::new("test.pem"));
        assert!(findings.len() > 0);
        assert_eq!(findings[0].severity, Severity::Critical);
    }

    #[test]
    fn test_scan_content_multiple_secrets() {
        let scanner = SecretsScanner::new();
        let content = r#"
            const apiKey = "abcdefghijklmnopqrst1234";
            const token = "ghp_1234567890abcdefghijklmnopqrstuvwxyz";
        "#;
        let findings = scanner.scan_content(content, Path::new("test.ts"));
        assert!(findings.len() >= 2);
    }

    #[test]
    fn test_should_ignore_node_modules() {
        let scanner = SecretsScanner::new();
        assert!(scanner.should_ignore(Path::new("node_modules/package/index.js")));
    }

    #[test]
    fn test_should_ignore_git_directory() {
        let scanner = SecretsScanner::new();
        assert!(scanner.should_ignore(Path::new(".git/config")));
    }

    #[test]
    fn test_should_ignore_test_files() {
        let scanner = SecretsScanner::new();
        assert!(scanner.should_ignore(Path::new("src/test.spec.ts")));
        assert!(scanner.should_ignore(Path::new("src/file.test.js")));
    }

    #[test]
    fn test_should_not_ignore_regular_files() {
        let scanner = SecretsScanner::new();
        assert!(!scanner.should_ignore(Path::new("src/index.ts")));
    }

    #[test]
    fn test_configure_custom_patterns() {
        let mut scanner = SecretsScanner::new();
        scanner.configure(&["*.fixture.ts", "mocks/*"]);
        assert!(scanner.should_ignore(Path::new("data.fixture.ts")));
        assert!(scanner.should_ignore(Path::new("mocks/api.ts")));
    }

    #[test]
    fn test_scan_project() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("secret.ts");
        let mut file = fs::File::create(&file_path).unwrap();
        writeln!(file, r#"const key = "AKIAIOSFODNN7EXAMPLE";"#).unwrap();

        let scanner = SecretsScanner::new();
        let report = scanner.scan_project(temp_dir.path()).unwrap();

        assert!(report.has_secrets);
        assert!(report.findings.len() > 0);
        assert!(report.scanned_files > 0);
    }

    #[test]
    fn test_scan_project_no_secrets() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("clean.ts");
        let mut file = fs::File::create(&file_path).unwrap();
        writeln!(file, "const x = 123;").unwrap();

        let scanner = SecretsScanner::new();
        let report = scanner.scan_project(temp_dir.path()).unwrap();

        assert!(!report.has_secrets);
        assert_eq!(report.findings.len(), 0);
    }

    #[test]
    fn test_glob_to_regex() {
        let regex = SecretsScanner::glob_to_regex("*.test.ts").unwrap();
        assert!(regex.is_match("file.test.ts"));
        assert!(!regex.is_match("file.ts"));
    }

    #[test]
    fn test_default_patterns_count() {
        let patterns = SecretsScanner::default_patterns();
        assert!(patterns.len() >= 8); // At least 8 patterns
    }
}
