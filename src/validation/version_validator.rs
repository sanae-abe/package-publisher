//! Version Validator - Validates semantic versioning (semver)
//!
//! This module provides validation for version strings following
//! Semantic Versioning 2.0.0 specification.
//!
//! # Example
//!
//! ```
//! use package_publisher::validation::version_validator::VersionValidator;
//!
//! let validator = VersionValidator::new();
//! let result = validator.validate("1.2.3");
//!
//! assert!(result.is_valid);
//! assert_eq!(result.major, Some(1));
//! assert_eq!(result.minor, Some(2));
//! assert_eq!(result.patch, Some(3));
//! ```

use semver::Version;
use serde::{Deserialize, Serialize};

/// Result of version validation
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct VersionValidationResult {
    /// Whether the version is valid semver
    pub is_valid: bool,
    /// Validation error message (if any)
    pub error: Option<String>,
    /// Major version number
    pub major: Option<u64>,
    /// Minor version number
    pub minor: Option<u64>,
    /// Patch version number
    pub patch: Option<u64>,
    /// Pre-release version (e.g., "alpha.1")
    pub prerelease: Option<String>,
    /// Build metadata (e.g., "20130313144700")
    pub build: Option<String>,
}

/// Validator for semantic versioning
pub struct VersionValidator;

impl Default for VersionValidator {
    fn default() -> Self {
        Self::new()
    }
}

impl VersionValidator {
    /// Create a new VersionValidator
    ///
    /// # Examples
    ///
    /// ```
    /// use package_publisher::validation::VersionValidator;
    ///
    /// let validator = VersionValidator::new();
    /// ```
    pub fn new() -> Self {
        Self
    }

    /// Validate a version string
    ///
    /// # Arguments
    ///
    /// * `version_str` - Version string to validate (e.g., "1.2.3")
    ///
    /// # Examples
    ///
    /// ```
    /// use package_publisher::validation::version_validator::VersionValidator;
    ///
    /// let validator = VersionValidator::new();
    ///
    /// // Valid version
    /// let result = validator.validate("1.2.3");
    /// assert!(result.is_valid);
    ///
    /// // Invalid version
    /// let result = validator.validate("invalid");
    /// assert!(!result.is_valid);
    /// ```
    pub fn validate(&self, version_str: &str) -> VersionValidationResult {
        match Version::parse(version_str) {
            Ok(version) => VersionValidationResult {
                is_valid: true,
                error: None,
                major: Some(version.major),
                minor: Some(version.minor),
                patch: Some(version.patch),
                prerelease: if version.pre.is_empty() {
                    None
                } else {
                    Some(version.pre.to_string())
                },
                build: if version.build.is_empty() {
                    None
                } else {
                    Some(version.build.to_string())
                },
            },
            Err(e) => VersionValidationResult {
                is_valid: false,
                error: Some(e.to_string()),
                major: None,
                minor: None,
                patch: None,
                prerelease: None,
                build: None,
            },
        }
    }

    /// Check if version is a prerelease
    ///
    /// # Arguments
    ///
    /// * `version_str` - Version string to check
    ///
    /// # Examples
    ///
    /// ```
    /// use package_publisher::validation::version_validator::VersionValidator;
    ///
    /// let validator = VersionValidator::new();
    ///
    /// assert!(validator.is_prerelease("1.0.0-alpha.1"));
    /// assert!(!validator.is_prerelease("1.0.0"));
    /// ```
    pub fn is_prerelease(&self, version_str: &str) -> bool {
        if let Ok(version) = Version::parse(version_str) {
            !version.pre.is_empty()
        } else {
            false
        }
    }

    /// Compare two versions
    ///
    /// # Arguments
    ///
    /// * `v1` - First version string
    /// * `v2` - Second version string
    ///
    /// # Returns
    ///
    /// - `Some(Ordering::Less)` if v1 < v2
    /// - `Some(Ordering::Equal)` if v1 == v2
    /// - `Some(Ordering::Greater)` if v1 > v2
    /// - `None` if either version is invalid
    ///
    /// # Examples
    ///
    /// ```
    /// use package_publisher::validation::version_validator::VersionValidator;
    /// use std::cmp::Ordering;
    ///
    /// let validator = VersionValidator::new();
    ///
    /// assert_eq!(validator.compare("1.0.0", "2.0.0"), Some(Ordering::Less));
    /// assert_eq!(validator.compare("2.0.0", "1.0.0"), Some(Ordering::Greater));
    /// assert_eq!(validator.compare("1.0.0", "1.0.0"), Some(Ordering::Equal));
    /// ```
    pub fn compare(&self, v1: &str, v2: &str) -> Option<std::cmp::Ordering> {
        let version1 = Version::parse(v1).ok()?;
        let version2 = Version::parse(v2).ok()?;
        Some(version1.cmp(&version2))
    }

    /// Check if a version satisfies a version requirement
    ///
    /// # Arguments
    ///
    /// * `version` - Version string to check
    /// * `requirement` - Version requirement (e.g., "^1.2.3", ">=1.0.0")
    ///
    /// # Examples
    ///
    /// ```
    /// use package_publisher::validation::version_validator::VersionValidator;
    ///
    /// let validator = VersionValidator::new();
    ///
    /// assert!(validator.satisfies("1.2.5", "^1.2.0"));
    /// assert!(!validator.satisfies("2.0.0", "^1.2.0"));
    /// ```
    pub fn satisfies(&self, version: &str, requirement: &str) -> bool {
        let Ok(version) = Version::parse(version) else {
            return false;
        };
        let Ok(req) = semver::VersionReq::parse(requirement) else {
            return false;
        };
        req.matches(&version)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cmp::Ordering;

    #[test]
    fn test_new_validator() {
        let validator = VersionValidator::new();
        assert!(std::ptr::addr_of!(validator) as usize != 0);
    }

    #[test]
    fn test_validate_valid_version() {
        let validator = VersionValidator::new();
        let result = validator.validate("1.2.3");

        assert!(result.is_valid);
        assert_eq!(result.major, Some(1));
        assert_eq!(result.minor, Some(2));
        assert_eq!(result.patch, Some(3));
        assert!(result.prerelease.is_none());
        assert!(result.build.is_none());
    }

    #[test]
    fn test_validate_prerelease_version() {
        let validator = VersionValidator::new();
        let result = validator.validate("1.0.0-alpha.1");

        assert!(result.is_valid);
        assert_eq!(result.major, Some(1));
        assert_eq!(result.minor, Some(0));
        assert_eq!(result.patch, Some(0));
        assert_eq!(result.prerelease, Some("alpha.1".to_string()));
    }

    #[test]
    fn test_validate_version_with_build() {
        let validator = VersionValidator::new();
        let result = validator.validate("1.0.0+20130313144700");

        assert!(result.is_valid);
        assert_eq!(result.build, Some("20130313144700".to_string()));
    }

    #[test]
    fn test_validate_invalid_version() {
        let validator = VersionValidator::new();
        let result = validator.validate("invalid");

        assert!(!result.is_valid);
        assert!(result.error.is_some());
        assert!(result.major.is_none());
    }

    #[test]
    fn test_is_prerelease_true() {
        let validator = VersionValidator::new();
        assert!(validator.is_prerelease("1.0.0-alpha.1"));
        assert!(validator.is_prerelease("2.0.0-beta"));
    }

    #[test]
    fn test_is_prerelease_false() {
        let validator = VersionValidator::new();
        assert!(!validator.is_prerelease("1.0.0"));
        assert!(!validator.is_prerelease("2.3.4"));
    }

    #[test]
    fn test_is_prerelease_invalid() {
        let validator = VersionValidator::new();
        assert!(!validator.is_prerelease("invalid"));
    }

    #[test]
    fn test_compare_less() {
        let validator = VersionValidator::new();
        assert_eq!(validator.compare("1.0.0", "2.0.0"), Some(Ordering::Less));
        assert_eq!(validator.compare("1.2.3", "1.2.4"), Some(Ordering::Less));
    }

    #[test]
    fn test_compare_greater() {
        let validator = VersionValidator::new();
        assert_eq!(validator.compare("2.0.0", "1.0.0"), Some(Ordering::Greater));
        assert_eq!(validator.compare("1.3.0", "1.2.9"), Some(Ordering::Greater));
    }

    #[test]
    fn test_compare_equal() {
        let validator = VersionValidator::new();
        assert_eq!(validator.compare("1.0.0", "1.0.0"), Some(Ordering::Equal));
    }

    #[test]
    fn test_compare_invalid() {
        let validator = VersionValidator::new();
        assert_eq!(validator.compare("invalid", "1.0.0"), None);
        assert_eq!(validator.compare("1.0.0", "invalid"), None);
    }

    #[test]
    fn test_satisfies_caret() {
        let validator = VersionValidator::new();
        assert!(validator.satisfies("1.2.5", "^1.2.0"));
        assert!(validator.satisfies("1.9.9", "^1.2.0"));
        assert!(!validator.satisfies("2.0.0", "^1.2.0"));
    }

    #[test]
    fn test_satisfies_tilde() {
        let validator = VersionValidator::new();
        assert!(validator.satisfies("1.2.5", "~1.2.0"));
        assert!(!validator.satisfies("1.3.0", "~1.2.0"));
    }

    #[test]
    fn test_satisfies_exact() {
        let validator = VersionValidator::new();
        assert!(validator.satisfies("1.2.3", "=1.2.3"));
        assert!(!validator.satisfies("1.2.4", "=1.2.3"));
    }

    #[test]
    fn test_satisfies_range() {
        let validator = VersionValidator::new();
        assert!(validator.satisfies("1.5.0", ">=1.0.0, <2.0.0"));
        assert!(!validator.satisfies("2.0.0", ">=1.0.0, <2.0.0"));
    }

    #[test]
    fn test_satisfies_invalid_version() {
        let validator = VersionValidator::new();
        assert!(!validator.satisfies("invalid", "^1.0.0"));
    }

    #[test]
    fn test_satisfies_invalid_requirement() {
        let validator = VersionValidator::new();
        assert!(!validator.satisfies("1.0.0", "invalid"));
    }
}
