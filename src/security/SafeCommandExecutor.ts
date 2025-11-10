import { exec } from 'child_process'
import { promisify } from 'util'
import { ExecResult, ExecOptions } from '../core/interfaces'

const execAsync = promisify(exec)

/**
 * Safe command executor with whitelist and injection prevention
 */
export class SafeCommandExecutor {
  private static readonly ALLOWED_COMMANDS = [
    'cargo',
    'npm',
    'pip',
    'twine',
    'python',
    'python3',
    'git',
    'gh',
    'glab',
    'brew'
  ]

  /**
   * Execute a command safely with whitelist validation
   */
  async execSafe(command: string, args: string[], options: ExecOptions = {}): Promise<ExecResult> {
    // Validate command is in whitelist
    if (!SafeCommandExecutor.ALLOWED_COMMANDS.includes(command)) {
      throw new Error(
        `Command "${command}" is not allowed. Allowed commands: ${SafeCommandExecutor.ALLOWED_COMMANDS.join(', ')}`
      )
    }

    // Sanitize arguments (prevent injection)
    const sanitizedArgs = args.map((arg) => this.sanitizeArg(arg))

    // Build command string
    const cmdString = `${command} ${sanitizedArgs.join(' ')}`

    try {
      const { stdout, stderr } = await execAsync(cmdString, {
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        timeout: options.timeout || 120000, // Default 2 minutes
        maxBuffer: 10 * 1024 * 1024 // 10MB
      })

      if (!options.silent) {
        if (stdout) console.log(stdout)
        if (stderr) console.error(stderr)
      }

      return {
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: 0
      }
    } catch (error: any) {
      // exec throws for non-zero exit codes
      return {
        stdout: error.stdout?.trim() || '',
        stderr: error.stderr?.trim() || error.message,
        exitCode: error.code || 1
      }
    }
  }

  /**
   * Sanitize command argument to prevent injection
   */
  private sanitizeArg(arg: string): string {
    // If argument contains spaces or special characters, quote it
    if (/[\s;&|<>()$`\\"\']/.test(arg)) {
      // Escape single quotes and wrap in single quotes
      return `'${arg.replace(/'/g, "'\\''")}'`
    }
    return arg
  }
}
