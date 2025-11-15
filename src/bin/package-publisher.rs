//! Package Publisher CLI
//!
//! Multi-registry package publishing assistant

use anyhow::Result;
use clap::{Parser, Subcommand};
use package_publisher::{
    AnalyticsOptions, BatchPublishOptions, BatchPublisher, PackagePublisher, PluginLoader,
    PublishAnalytics, PublishOptions,
};
use std::path::PathBuf;
use std::process;

/// Multi-registry package publishing assistant
#[derive(Parser)]
#[command(name = "package-publisher")]
#[command(version = "0.1.0")]
#[command(about = "Multi-registry package publishing assistant", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Publish package to registry
    Publish {
        /// Project path (defaults to current directory)
        #[arg(value_name = "PROJECT_PATH")]
        project_path: Option<PathBuf>,

        /// Specify registry (npm, crates.io, pypi, homebrew)
        #[arg(short, long)]
        registry: Option<String>,

        /// Comma-separated list of registries for batch publishing
        #[arg(long)]
        registries: Option<String>,

        /// Publish to registries sequentially (batch mode)
        #[arg(long)]
        sequential: bool,

        /// Maximum concurrent publishes (batch mode)
        #[arg(long, default_value = "3")]
        max_concurrency: usize,

        /// Continue on error (batch mode)
        #[arg(long)]
        continue_on_error: bool,

        /// Only perform dry-run
        #[arg(long)]
        dry_run: bool,

        /// Non-interactive mode (CI/CD)
        #[arg(long)]
        non_interactive: bool,

        /// Resume from previous state
        #[arg(long)]
        resume: bool,

        /// 2FA one-time password (npm)
        #[arg(long)]
        otp: Option<String>,

        /// Publish with tag
        #[arg(long)]
        tag: Option<String>,

        /// Access level (public|restricted)
        #[arg(long)]
        access: Option<String>,

        /// Skip all hooks
        #[arg(long)]
        skip_hooks: bool,

        /// Execute hooks only
        #[arg(long)]
        hooks_only: bool,
    },

    /// Check if project is ready to publish
    Check {
        /// Project path (defaults to current directory)
        #[arg(value_name = "PROJECT_PATH")]
        project_path: Option<PathBuf>,

        /// Specify registry to check
        #[arg(short, long)]
        registry: Option<String>,
    },

    /// Display publishing statistics
    Stats {
        /// Project path (defaults to current directory)
        #[arg(value_name = "PROJECT_PATH")]
        project_path: Option<PathBuf>,

        /// Filter by registry
        #[arg(short, long)]
        registry: Option<String>,

        /// Filter by package name
        #[arg(short, long)]
        package: Option<String>,

        /// Show only successful publishes
        #[arg(long)]
        success_only: bool,

        /// Show only failed publishes
        #[arg(long)]
        failures_only: bool,

        /// Show statistics for last N days
        #[arg(long, default_value = "30")]
        days: usize,
    },

    /// Initialize package-publisher configuration
    Init {
        /// Project path (defaults to current directory)
        #[arg(value_name = "PROJECT_PATH")]
        project_path: Option<PathBuf>,

        /// Force overwrite existing configuration
        #[arg(short, long)]
        force: bool,
    },
}

#[tokio::main]
async fn main() {
    // Custom exit override behavior
    let result = run().await;

    match result {
        Ok(exit_code) => process::exit(exit_code),
        Err(e) => {
            eprintln!("\n❌ Error");
            eprintln!("{}", e);
            process::exit(1);
        }
    }
}

async fn run() -> Result<i32> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Publish {
            project_path,
            registry,
            registries,
            sequential,
            max_concurrency,
            continue_on_error,
            dry_run,
            non_interactive,
            resume,
            otp,
            tag,
            access,
            skip_hooks,
            hooks_only,
        } => {
            let path = project_path.unwrap_or_else(|| PathBuf::from("."));

            // Check if batch mode (multiple registries)
            if let Some(registries_str) = registries {
                let registries_vec: Vec<String> = registries_str
                    .split(',')
                    .map(|s| s.trim().to_string())
                    .collect();

                publish_batch_command(
                    path,
                    registries_vec,
                    sequential,
                    max_concurrency,
                    continue_on_error,
                    dry_run,
                    non_interactive,
                    resume,
                    otp,
                    tag,
                    access,
                    skip_hooks,
                    hooks_only,
                )
                .await
            } else {
                publish_command(
                    path,
                    registry,
                    dry_run,
                    non_interactive,
                    resume,
                    otp,
                    tag,
                    access,
                    skip_hooks,
                    hooks_only,
                )
                .await
            }
        }
        Commands::Check {
            project_path,
            registry,
        } => {
            let path = project_path.unwrap_or_else(|| PathBuf::from("."));
            check_command(path, registry).await
        }
        Commands::Stats {
            project_path,
            registry,
            package,
            success_only,
            failures_only,
            days,
        } => {
            let path = project_path.unwrap_or_else(|| PathBuf::from("."));
            stats_command(path, registry, package, success_only, failures_only, days).await
        }
        Commands::Init {
            project_path,
            force,
        } => {
            let path = project_path.unwrap_or_else(|| PathBuf::from("."));
            init_command(path, force).await
        }
    }
}

async fn publish_command(
    project_path: PathBuf,
    registry: Option<String>,
    dry_run: bool,
    non_interactive: bool,
    resume: bool,
    otp: Option<String>,
    tag: Option<String>,
    access: Option<String>,
    skip_hooks: bool,
    hooks_only: bool,
) -> Result<i32> {
    println!("\n📦 package-publisher\n");

    let mut publisher = PackagePublisher::new(&project_path);

    let options = PublishOptions {
        registry,
        dry_run,
        non_interactive,
        resume,
        skip_hooks,
        hooks_only,
        otp,
        tag,
        access,
    };

    match publisher.publish(options).await {
        Ok(report) => {
            // Record analytics
            let mut analytics = PublishAnalytics::new(&project_path);
            if let Err(e) = analytics.initialize().await {
                eprintln!("⚠️  Failed to initialize analytics: {}", e);
            }
            if let Err(e) = analytics.record_publish(&report).await {
                eprintln!("⚠️  Failed to record analytics: {}", e);
            }

            if report.success {
                println!("\n✅ Publishing completed successfully!");
                Ok(0)
            } else {
                println!("\n❌ Publishing failed");
                for error in &report.errors {
                    eprintln!("  - {}", error);
                }
                Ok(1)
            }
        }
        Err(e) => {
            eprintln!("\n❌ Publishing failed: {}", e);
            Ok(1)
        }
    }
}

async fn publish_batch_command(
    project_path: PathBuf,
    registries: Vec<String>,
    sequential: bool,
    max_concurrency: usize,
    continue_on_error: bool,
    dry_run: bool,
    non_interactive: bool,
    resume: bool,
    otp: Option<String>,
    tag: Option<String>,
    access: Option<String>,
    skip_hooks: bool,
    hooks_only: bool,
) -> Result<i32> {
    println!("\n📦 package-publisher (Batch Mode)\n");

    let batch_publisher = BatchPublisher::new(&project_path);

    let batch_options = BatchPublishOptions {
        sequential,
        continue_on_error,
        max_concurrency,
        publish_options: PublishOptions {
            registry: None, // Will be set per-registry
            dry_run,
            non_interactive,
            resume,
            skip_hooks,
            hooks_only,
            otp,
            tag,
            access,
        },
    };

    match batch_publisher
        .publish_to_multiple(registries, batch_options)
        .await
    {
        Ok(result) => {
            // Record analytics for each publish
            let mut analytics = PublishAnalytics::new(&project_path);
            if let Err(e) = analytics.initialize().await {
                eprintln!("⚠️  Failed to initialize analytics: {}", e);
            }

            for (_, report) in &result.results {
                if let Err(e) = analytics.record_publish(report).await {
                    eprintln!(
                        "⚠️  Failed to record analytics for {}: {}",
                        report.registry, e
                    );
                }
            }

            if result.success {
                println!("\n✅ Batch publishing completed successfully!");
                Ok(0)
            } else {
                println!("\n❌ Batch publishing completed with errors");
                Ok(1)
            }
        }
        Err(e) => {
            eprintln!("\n❌ Batch publishing failed: {}", e);
            Ok(1)
        }
    }
}

async fn check_command(project_path: PathBuf, registry_filter: Option<String>) -> Result<i32> {
    println!("\n🔍 Package Check\n");

    let loader = PluginLoader::new();

    // Detect registries
    let detected = loader.detect_plugins(project_path.as_path()).await?;

    if detected.is_empty() {
        println!("⚠️  No supported registries detected");
        return Ok(1);
    }

    println!(
        "Detected registries: {}\n",
        detected
            .iter()
            .map(|d| d.registry_type.as_str())
            .collect::<Vec<_>>()
            .join(", ")
    );

    // Validate each detected registry
    for plugin_info in detected {
        let registry_name = plugin_info.registry_type.as_str();

        // Apply filter if specified
        if let Some(ref filter) = registry_filter {
            if registry_name != filter {
                continue;
            }
        }

        println!("\n📦 {}:", registry_name);

        // Load and validate
        let plugin =
            loader.load_plugin(plugin_info.registry_type, project_path.to_str().unwrap())?;

        match plugin.validate().await {
            Ok(result) => {
                if result.valid {
                    println!("  ✅ Validation successful");
                } else {
                    println!("  ❌ Validation failed");
                    for error in &result.errors {
                        println!("    - [{}] {}", error.field, error.message);
                    }
                }

                if !result.warnings.is_empty() {
                    println!("  ⚠️  Warnings:");
                    for warning in &result.warnings {
                        println!("    - [{}] {}", warning.field, warning.message);
                    }
                }
            }
            Err(e) => {
                println!("  ❌ Error: {}", e);
            }
        }
    }

    println!();
    Ok(0)
}

async fn stats_command(
    project_path: PathBuf,
    registry: Option<String>,
    package: Option<String>,
    success_only: bool,
    failures_only: bool,
    days: usize,
) -> Result<i32> {
    println!("\n📊 Publishing Statistics\n");

    let mut analytics = PublishAnalytics::new(&project_path);
    analytics.initialize().await?;

    // Calculate start date from days
    let start_date = chrono::Utc::now() - chrono::Duration::days(days as i64);

    let options = AnalyticsOptions {
        registry,
        package_name: package,
        start_date: Some(start_date),
        end_date: None,
        success_only,
        failures_only,
        limit: None,
    };

    let report = analytics.generate_report(&options).await?;

    println!("{}", report.markdown_summary);

    Ok(0)
}

async fn init_command(_project_path: PathBuf, _force: bool) -> Result<i32> {
    println!("\n🎯 Initialize package-publisher\n");
    eprintln!("⚠️  Init command not yet fully implemented");
    eprintln!("This will create a default .package-publisher.yml configuration.\n");
    Ok(1)
}
