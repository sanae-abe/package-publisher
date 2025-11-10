import { exec } from 'child_process'
import { promisify } from 'util'
import * as path from 'path'
import { HookCommand } from './PublishConfig'
import { HookContext, HookExecutionResult, HookOutput } from './interfaces'

const execAsync = promisify(exec)

/**
 * Hook Executor - Executes pre/post publish hooks with security controls
 *
 * Features:
 * - Command whitelist validation (allowedCommands)
 * - Path traversal prevention (workingDirectory)
 * - Timeout enforcement
 * - Environment variable expansion (${VERSION}, ${PACKAGE_NAME}, etc.)
 */
export class HookExecutor {
  private projectPath: string

  constructor(projectPath: string) {
    this.projectPath = projectPath
  }

  /**
   * Execute a list of hooks for a specific phase
   *
   * @param hooks - Array of hook commands to execute
   * @param context - Execution context with registry, version, etc.
   * @returns Execution result with success status and outputs
   */
  async executeHooks(
    hooks: HookCommand[],
    context: HookContext
  ): Promise<HookExecutionResult> {
    const result: HookExecutionResult = {
      success: true,
      executedHooks: 0,
      failedHooks: [],
      outputs: []
    }

    if (!hooks || hooks.length === 0) {
      return result
    }

    console.log(`\n🪝 Executing ${context.phase} hooks (${hooks.length} hooks)...`)

    for (const hook of hooks) {
      try {
        const output = await this.executeHook(hook, context)
        result.outputs.push(output)
        result.executedHooks++

        if (output.exitCode !== 0) {
          result.success = false
          result.failedHooks.push(hook.command)
          console.error(`❌ Hook failed: ${hook.command} (exit code: ${output.exitCode})`)
        } else {
          console.log(`✅ Hook succeeded: ${hook.command}`)
        }
      } catch (error) {
        result.success = false
        result.failedHooks.push(hook.command)
        console.error(`❌ Hook error: ${hook.command}`, error)
      }
    }

    console.log(`🪝 Hooks completed: ${result.executedHooks} executed, ${result.failedHooks.length} failed\n`)

    return result
  }

  /**
   * Execute a single hook command
   */
  private async executeHook(
    hook: HookCommand,
    context: HookContext
  ): Promise<HookOutput> {
    const startTime = Date.now()

    // 1. Validate command against whitelist
    this.validateCommand(hook)

    // 2. Expand environment variables in command
    const expandedCommand = this.expandEnvVars(hook.command, context)

    // 3. Validate and resolve working directory
    const workingDir = this.resolveWorkingDirectory(hook.workingDirectory)

    // 4. Execute command with timeout
    const timeout = (hook.timeout || 300) * 1000 // Convert to ms

    try {
      const { stdout, stderr } = await execAsync(expandedCommand, {
        cwd: workingDir,
        env: { ...process.env, ...context.environment },
        timeout,
        maxBuffer: 10 * 1024 * 1024 // 10MB
      })

      return {
        command: expandedCommand,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: 0,
        duration: Date.now() - startTime
      }
    } catch (error: unknown) {
      const err = error as { stdout?: string; stderr?: string; code?: number; message?: string; killed?: boolean }

      if (err.killed) {
        throw new Error(`Hook timeout after ${timeout}ms: ${expandedCommand}`)
      }

      return {
        command: expandedCommand,
        stdout: err.stdout?.trim() || '',
        stderr: err.stderr?.trim() || err.message || '',
        exitCode: err.code || 1,
        duration: Date.now() - startTime
      }
    }
  }

  /**
   * Validate command against allowedCommands whitelist
   */
  private validateCommand(hook: HookCommand): void {
    if (!hook.allowedCommands || hook.allowedCommands.length === 0) {
      throw new Error('allowedCommands is required for hook security')
    }

    // Extract the first word (command name) from the command string
    const commandName = hook.command.trim().split(/\s+/)[0]

    // Check if command is in the allowed list
    const isAllowed = hook.allowedCommands.some(allowed => {
      return commandName === allowed || commandName.startsWith(allowed + ' ')
    })

    if (!isAllowed) {
      throw new Error(
        `Command "${commandName}" is not in allowedCommands: [${hook.allowedCommands.join(', ')}]`
      )
    }
  }

  /**
   * Expand environment variables in command string
   *
   * Supported variables:
   * - ${VERSION}: Package version
   * - ${PACKAGE_NAME}: Package name
   * - ${REGISTRY}: Target registry
   * - ${PHASE}: Hook phase
   */
  private expandEnvVars(command: string, context: HookContext): string {
    return command
      .replace(/\$\{VERSION\}/g, context.version)
      .replace(/\$\{PACKAGE_NAME\}/g, context.packageName)
      .replace(/\$\{REGISTRY\}/g, context.registry)
      .replace(/\$\{PHASE\}/g, context.phase)
  }

  /**
   * Resolve and validate working directory
   * Prevents path traversal attacks
   */
  private resolveWorkingDirectory(workingDirectory?: string): string {
    const baseDir = this.projectPath
    const targetDir = workingDirectory || './'

    // Resolve the target directory relative to project path
    const resolvedDir = path.resolve(baseDir, targetDir)

    // Security check: Ensure resolved directory is within project path
    if (!resolvedDir.startsWith(baseDir)) {
      throw new Error(
        `Path traversal detected: "${targetDir}" resolves outside project directory`
      )
    }

    return resolvedDir
  }
}
