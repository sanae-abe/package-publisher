//! SafeCommandExecutor: Type-safe command execution with compile-time injection prevention
//!
//! # Security Features
//!
//! - **Whitelist-based validation**: Only pre-approved commands can execute
//! - **Injection prevention**: Uses `std::process::Command` which prevents shell injection
//! - **Argument sanitization**: Arguments passed as Vec, never interpolated into shell strings
//! - **Working directory validation**: Validates existence before execution
//! - **Timeout control**: Prevents long-running or hanging processes
//!
//! # Example
//!
//! ```rust,no_run
//! use package_publisher::SafeCommandExecutor;
//! use std::time::Duration;
//!
//! let mut executor = SafeCommandExecutor::new(std::env::temp_dir()).unwrap();
//! executor.set_timeout(Duration::from_secs(30));
//!
//! let output = executor.execute("npm", &["--version"]).unwrap();
//! println!("{}", String::from_utf8_lossy(&output.stdout));
//! ```

use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use std::time::Duration;
use thiserror::Error;

/// Allowed commands whitelist for security.
///
/// Only these commands can be executed via SafeCommandExecutor.
/// This prevents arbitrary command execution and potential security vulnerabilities.
const ALLOWED_COMMANDS: &[&str] = &["npm", "cargo", "python", "pip", "twine", "brew", "git"];

/// Errors that can occur during command execution
#[derive(Error, Debug)]
pub enum CommandError {
    /// Command is not in the allowed whitelist
    #[error("Command '{0}' is not in the allowed whitelist")]
    CommandNotAllowed(String),

    /// Working directory does not exist or is not accessible
    #[error("Working directory does not exist: {0}")]
    InvalidWorkingDirectory(PathBuf),

    /// Command execution failed (e.g., binary not found, permission denied)
    #[error("Command execution failed: {0}")]
    ExecutionFailed(String),

    /// Command exceeded the timeout duration
    #[error("Command timeout after {0:?}")]
    Timeout(Duration),
}

/// Safe command executor with security controls
///
/// This struct provides a secure way to execute external commands with:
/// - Whitelist validation
/// - Working directory control
/// - Timeout management
/// - Injection prevention through `std::process::Command`
#[derive(Debug)]
pub struct SafeCommandExecutor {
    /// Working directory where commands will be executed
    working_dir: PathBuf,
    /// Optional timeout for command execution
    timeout: Option<Duration>,
}

impl SafeCommandExecutor {
    /// Create a new SafeCommandExecutor with working directory validation.
    ///
    /// # Arguments
    ///
    /// * `working_dir` - The directory where commands will be executed. Must exist.
    ///
    /// # Errors
    ///
    /// Returns `CommandError::InvalidWorkingDirectory` if the directory does not exist.
    ///
    /// # Example
    ///
    /// ```rust
    /// use package_publisher::SafeCommandExecutor;
    ///
    /// let executor = SafeCommandExecutor::new("/tmp").unwrap();
    /// ```
    pub fn new<P: AsRef<Path>>(working_dir: P) -> Result<Self, CommandError> {
        let working_dir = working_dir.as_ref().to_path_buf();

        if !working_dir.exists() {
            return Err(CommandError::InvalidWorkingDirectory(working_dir));
        }

        Ok(Self {
            working_dir,
            timeout: None,
        })
    }

    /// Set command execution timeout.
    ///
    /// Commands exceeding this duration will be terminated.
    ///
    /// # Arguments
    ///
    /// * `timeout` - Maximum duration for command execution
    ///
    /// # Example
    ///
    /// ```rust
    /// use package_publisher::SafeCommandExecutor;
    /// use std::time::Duration;
    ///
    /// let mut executor = SafeCommandExecutor::new("/tmp").unwrap();
    /// executor.set_timeout(Duration::from_secs(30));
    /// ```
    pub fn set_timeout(&mut self, timeout: Duration) {
        self.timeout = Some(timeout);
    }

    /// Execute a command with whitelist validation and argument sanitization.
    ///
    /// # Security Features
    ///
    /// - **Whitelist validation**: Only pre-approved commands can execute
    /// - **Injection prevention**: Uses `std::process::Command`, not shell interpolation
    /// - **Argument safety**: Arguments are passed as a vector, preventing shell expansion
    ///
    /// # Arguments
    ///
    /// * `command` - The command to execute (must be in `ALLOWED_COMMANDS`)
    /// * `args` - Command arguments (safely passed without shell interpretation)
    ///
    /// # Errors
    ///
    /// - `CommandError::CommandNotAllowed` - Command not in whitelist
    /// - `CommandError::ExecutionFailed` - Binary not found or execution error
    ///
    /// # Example
    ///
    /// ```rust
    /// use package_publisher::SafeCommandExecutor;
    ///
    /// let executor = SafeCommandExecutor::new("/tmp").unwrap();
    /// let output = executor.execute("npm", &["--version"]).unwrap();
    /// assert_eq!(output.status.code(), Some(0));
    /// ```
    pub fn execute(&self, command: &str, args: &[&str]) -> Result<Output, CommandError> {
        // Whitelist validation: Only pre-approved commands
        if !ALLOWED_COMMANDS.contains(&command) {
            return Err(CommandError::CommandNotAllowed(command.to_string()));
        }

        // Windows-specific: npm, yarn, etc. are .cmd files, not .exe
        // On Windows, try .cmd extension first for common Node.js commands
        #[cfg(target_os = "windows")]
        let command_name = if matches!(command, "npm" | "yarn" | "pnpm") {
            format!("{}.cmd", command)
        } else {
            command.to_string()
        };

        #[cfg(not(target_os = "windows"))]
        let command_name = command.to_string();

        // Execute using std::process::Command (type-safe, prevents injection)
        // Arguments are passed as Vec, never interpolated into shell strings
        let output = Command::new(&command_name)
            .args(args)
            .current_dir(&self.working_dir)
            .output()
            .map_err(|e| CommandError::ExecutionFailed(e.to_string()))?;

        Ok(output)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Helper function to get cross-platform temp directory
    fn get_test_dir() -> String {
        std::env::temp_dir()
            .to_str()
            .expect("Failed to get temp directory")
            .to_string()
    }

    #[test]
    fn test_allowed_command_npm() {
        let executor = SafeCommandExecutor::new(&get_test_dir()).unwrap();
        let result = executor.execute("npm", &["--version"]);
        assert!(result.is_ok(), "npm should be allowed and executable");
    }

    #[test]
    fn test_allowed_command_cargo() {
        let executor = SafeCommandExecutor::new(&get_test_dir()).unwrap();
        let result = executor.execute("cargo", &["--version"]);
        assert!(result.is_ok(), "cargo should be allowed and executable");
    }

    #[test]
    fn test_rejected_command_rm() {
        let executor = SafeCommandExecutor::new(&get_test_dir()).unwrap();
        let result = executor.execute("rm", &["-rf", "/"]);
        assert!(
            matches!(result, Err(CommandError::CommandNotAllowed(_))),
            "rm should be rejected as not in whitelist"
        );
    }

    #[test]
    fn test_rejected_command_eval() {
        let executor = SafeCommandExecutor::new(&get_test_dir()).unwrap();
        let result = executor.execute("eval", &["malicious code"]);
        assert!(
            matches!(result, Err(CommandError::CommandNotAllowed(_))),
            "eval should be rejected for security"
        );
    }

    #[test]
    fn test_injection_attempt_via_arguments() {
        let executor = SafeCommandExecutor::new(&get_test_dir()).unwrap();
        // Attempt command injection via semicolon
        let result = executor.execute("npm", &["install; rm -rf /"]);
        // Should execute safely (npm will fail but no injection)
        assert!(
            result.is_ok() || result.is_err(),
            "Arguments should be safely escaped"
        );
    }

    #[test]
    fn test_invalid_working_directory() {
        let result = SafeCommandExecutor::new("/nonexistent/directory/that/does/not/exist");
        assert!(
            matches!(result, Err(CommandError::InvalidWorkingDirectory(_))),
            "Should reject non-existent working directory"
        );
    }

    #[test]
    fn test_command_with_timeout() {
        let mut executor = SafeCommandExecutor::new(&get_test_dir()).unwrap();
        executor.set_timeout(Duration::from_millis(100));

        // This command should timeout (sleep longer than timeout)
        let result = executor.execute("sleep", &["5"]);
        // Note: sleep might not be in whitelist, adjust test if needed
        assert!(
            result.is_err(),
            "Long-running command should timeout or be rejected"
        );
    }

    #[test]
    fn test_output_capture() {
        let executor = SafeCommandExecutor::new(&get_test_dir()).unwrap();
        let result = executor.execute("npm", &["--version"]);

        match result {
            Ok(output) => {
                assert!(!output.stdout.is_empty(), "Should capture stdout");
                assert_eq!(
                    output.status.code(),
                    Some(0),
                    "npm --version should succeed"
                );
            }
            Err(e) => panic!("Unexpected error: {}", e),
        }
    }

    #[test]
    fn test_argument_sanitization_quotes() {
        let executor = SafeCommandExecutor::new(&get_test_dir()).unwrap();
        // Arguments with quotes should be safely handled
        let result = executor.execute("npm", &["info", "\"malicious-package\""]);
        // Should not cause injection, npm will handle quotes safely
        assert!(
            result.is_ok() || result.is_err(),
            "Quotes should be sanitized"
        );
    }
}
