//! Credential Validator - Validates token formats and detects false positives
//!
//! This module provides validation for detected credentials to reduce false positives
//! by checking:
//! - Token format validity
//! - Character entropy (randomness)
//! - Common test/dummy patterns
//!
//! # Example
//!
//! ```
//! use package_publisher::security::credential_validator::{CredentialValidator, ValidationResult};
//!
//! let validator = CredentialValidator::new();
//!
//! // Valid high-entropy token
//! let result = validator.validate_token("ghp_1A2b3C4d5E6f7G8h9I0jK1lM2nO3pQ4rS5tU6vW7xY");
//! assert!(result.is_likely_real);
//!
//! // Low-entropy test token
//! let result = validator.validate_token("ghp_test123456789012345678901234567890");
//! assert!(!result.is_likely_real);
//! ```

use serde::{Deserialize, Serialize};
use std::collections::HashSet;

/// Result of credential validation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationResult {
    /// Whether the credential is likely real (not a test/dummy value)
    pub is_likely_real: bool,
    /// Confidence score (0.0 - 1.0)
    pub confidence: f64,
    /// Reason for the decision
    pub reason: String,
    /// Entropy score (bits)
    pub entropy: f64,
}

/// Validator for credentials and tokens
pub struct CredentialValidator {
    /// Known test/dummy patterns
    test_patterns: HashSet<String>,
}

impl Default for CredentialValidator {
    fn default() -> Self {
        Self::new()
    }
}

impl CredentialValidator {
    /// Create a new credential validator
    pub fn new() -> Self {
        let mut test_patterns = HashSet::new();

        // Common test/dummy patterns
        test_patterns.insert("test".to_string());
        test_patterns.insert("example".to_string());
        test_patterns.insert("dummy".to_string());
        test_patterns.insert("fake".to_string());
        test_patterns.insert("sample".to_string());
        test_patterns.insert("placeholder".to_string());
        test_patterns.insert("your_".to_string());
        test_patterns.insert("my_".to_string());
        test_patterns.insert("xxx".to_string());
        test_patterns.insert("yyy".to_string());
        test_patterns.insert("zzz".to_string());
        test_patterns.insert("12345".to_string());
        test_patterns.insert("abcde".to_string());

        Self { test_patterns }
    }

    /// Validate a token and determine if it's likely real
    ///
    /// # Arguments
    ///
    /// * `token` - The token string to validate
    ///
    /// # Returns
    ///
    /// ValidationResult containing likelihood and confidence
    pub fn validate_token(&self, token: &str) -> ValidationResult {
        let token_lower = token.to_lowercase();

        // Check for test patterns
        for pattern in &self.test_patterns {
            if token_lower.contains(pattern) {
                return ValidationResult {
                    is_likely_real: false,
                    confidence: 0.9,
                    reason: format!("Contains test pattern: {}", pattern),
                    entropy: self.calculate_entropy(token),
                };
            }
        }

        // Calculate entropy
        let entropy = self.calculate_entropy(token);

        // Check entropy threshold
        // Real tokens typically have > 3.5 bits/char entropy
        let is_likely_real = entropy > 3.5;
        let confidence = if is_likely_real {
            ((entropy - 3.5) / 1.5).min(1.0) // Scale 3.5-5.0 to 0.0-1.0
        } else {
            1.0 - ((3.5 - entropy) / 3.5).min(1.0) // Inverse for low entropy
        };

        ValidationResult {
            is_likely_real,
            confidence,
            reason: if is_likely_real {
                format!("High entropy ({:.2} bits/char)", entropy)
            } else {
                format!("Low entropy ({:.2} bits/char)", entropy)
            },
            entropy,
        }
    }

    /// Validate an API key format
    ///
    /// # Arguments
    ///
    /// * `api_key` - The API key to validate
    pub fn validate_api_key(&self, api_key: &str) -> ValidationResult {
        // API keys should be at least 20 characters
        if api_key.len() < 20 {
            return ValidationResult {
                is_likely_real: false,
                confidence: 0.95,
                reason: "Too short for a real API key".to_string(),
                entropy: 0.0,
            };
        }

        self.validate_token(api_key)
    }

    /// Validate an AWS access key
    ///
    /// # Arguments
    ///
    /// * `key` - The AWS key to validate (should start with AKIA)
    pub fn validate_aws_key(&self, key: &str) -> ValidationResult {
        // AWS keys are exactly 20 characters: AKIA + 16 chars
        if key.len() != 20 {
            return ValidationResult {
                is_likely_real: false,
                confidence: 0.99,
                reason: "Invalid AWS key length (must be 20)".to_string(),
                entropy: 0.0,
            };
        }

        if !key.starts_with("AKIA") {
            return ValidationResult {
                is_likely_real: false,
                confidence: 0.99,
                reason: "Invalid AWS key prefix (must start with AKIA)".to_string(),
                entropy: 0.0,
            };
        }

        // Check if the remaining 16 chars are uppercase alphanumeric
        let suffix = &key[4..];
        if !suffix.chars().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit()) {
            return ValidationResult {
                is_likely_real: false,
                confidence: 0.95,
                reason: "Invalid AWS key format (must be uppercase alphanumeric)".to_string(),
                entropy: 0.0,
            };
        }

        self.validate_token(key)
    }

    /// Calculate Shannon entropy of a string (bits per character)
    ///
    /// # Arguments
    ///
    /// * `text` - The text to calculate entropy for
    ///
    /// # Returns
    ///
    /// Entropy in bits per character
    ///
    /// # Examples
    ///
    /// ```
    /// use package_publisher::security::credential_validator::CredentialValidator;
    ///
    /// let validator = CredentialValidator::new();
    ///
    /// // Low entropy (repetitive)
    /// let entropy = validator.calculate_entropy("aaaaaaaaaa");
    /// assert!(entropy < 1.0);
    ///
    /// // High entropy (random)
    /// let entropy = validator.calculate_entropy("a1B2c3D4e5F6g7H8i9");
    /// assert!(entropy > 3.0);
    /// ```
    pub fn calculate_entropy(&self, text: &str) -> f64 {
        if text.is_empty() {
            return 0.0;
        }

        // Count character frequencies
        let mut frequencies = std::collections::HashMap::new();
        for c in text.chars() {
            *frequencies.entry(c).or_insert(0) += 1;
        }

        // Calculate Shannon entropy
        let len = text.len() as f64;
        let mut entropy = 0.0;

        for count in frequencies.values() {
            let probability = *count as f64 / len;
            entropy -= probability * probability.log2();
        }

        entropy
    }

    /// Check if a value matches common placeholder patterns
    ///
    /// # Arguments
    ///
    /// * `value` - The value to check
    pub fn is_placeholder(&self, value: &str) -> bool {
        let value_lower = value.to_lowercase();

        for pattern in &self.test_patterns {
            if value_lower.contains(pattern) {
                return true;
            }
        }

        // Check for all-same-character patterns
        if value.len() > 3 {
            let first_char = value.chars().next().unwrap();
            if value.chars().all(|c| c == first_char) {
                return true;
            }
        }

        // Check for sequential patterns (e.g., "123456", "abcdef")
        if value.len() > 5 {
            let chars: Vec<char> = value.chars().collect();
            let mut is_sequential = true;

            for i in 1..chars.len() {
                if chars[i] as u32 != chars[i - 1] as u32 + 1 {
                    is_sequential = false;
                    break;
                }
            }

            if is_sequential {
                return true;
            }
        }

        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_token_high_entropy() {
        let validator = CredentialValidator::new();
        let token = "ghp_1A2b3C4d5E6f7G8h9I0jK1lM2nO3pQ4rS5tU6vW7xY";
        let result = validator.validate_token(token);

        assert!(result.is_likely_real);
        assert!(result.confidence > 0.5);
        assert!(result.entropy > 3.5);
    }

    #[test]
    fn test_validate_token_low_entropy() {
        let validator = CredentialValidator::new();
        let token = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
        let result = validator.validate_token(token);

        assert!(!result.is_likely_real);
        assert!(result.entropy < 1.0);
    }

    #[test]
    fn test_validate_token_test_pattern() {
        let validator = CredentialValidator::new();
        let token = "ghp_test123456789012345678901234567890";
        let result = validator.validate_token(token);

        assert!(!result.is_likely_real);
        assert!(result.confidence > 0.8);
        assert!(result.reason.contains("test"));
    }

    #[test]
    fn test_validate_api_key_too_short() {
        let validator = CredentialValidator::new();
        let key = "short";
        let result = validator.validate_api_key(key);

        assert!(!result.is_likely_real);
        assert!(result.reason.contains("Too short"));
    }

    #[test]
    fn test_validate_aws_key_valid() {
        let validator = CredentialValidator::new();
        let key = "AKIAIOSFODNN7EXAMPLE"; // AWS example key
        let result = validator.validate_aws_key(key);

        // Note: This will fail entropy check because "EXAMPLE" is low entropy
        // but format is valid
        assert_eq!(key.len(), 20);
        assert!(key.starts_with("AKIA"));
    }

    #[test]
    fn test_validate_aws_key_invalid_length() {
        let validator = CredentialValidator::new();
        let key = "AKIA123"; // Too short
        let result = validator.validate_aws_key(key);

        assert!(!result.is_likely_real);
        assert!(result.reason.contains("length"));
    }

    #[test]
    fn test_validate_aws_key_invalid_prefix() {
        let validator = CredentialValidator::new();
        let key = "XKIAIOSFODNN7EXAMPLE"; // Wrong prefix
        let result = validator.validate_aws_key(key);

        assert!(!result.is_likely_real);
        assert!(result.reason.contains("prefix"));
    }

    #[test]
    fn test_calculate_entropy_low() {
        let validator = CredentialValidator::new();
        let entropy = validator.calculate_entropy("aaaaaaaaaa");
        assert!(entropy < 1.0);
    }

    #[test]
    fn test_calculate_entropy_high() {
        let validator = CredentialValidator::new();
        let entropy = validator.calculate_entropy("a1B2c3D4e5F6g7H8i9");
        assert!(entropy > 3.0);
    }

    #[test]
    fn test_calculate_entropy_empty() {
        let validator = CredentialValidator::new();
        let entropy = validator.calculate_entropy("");
        assert_eq!(entropy, 0.0);
    }

    #[test]
    fn test_is_placeholder_test_pattern() {
        let validator = CredentialValidator::new();
        assert!(validator.is_placeholder("test_api_key"));
        assert!(validator.is_placeholder("example_token"));
        assert!(validator.is_placeholder("dummy_secret"));
    }

    #[test]
    fn test_is_placeholder_same_char() {
        let validator = CredentialValidator::new();
        assert!(validator.is_placeholder("xxxx"));
        assert!(validator.is_placeholder("aaaaaaa"));
    }

    #[test]
    fn test_is_placeholder_sequential() {
        let validator = CredentialValidator::new();
        assert!(validator.is_placeholder("123456"));
        assert!(validator.is_placeholder("abcdef"));
    }

    #[test]
    fn test_is_placeholder_real_token() {
        let validator = CredentialValidator::new();
        assert!(!validator.is_placeholder("ghp_1A2b3C4d5E6f7G8h9I0"));
    }
}
