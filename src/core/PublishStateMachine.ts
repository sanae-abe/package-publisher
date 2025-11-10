import * as fs from 'fs/promises'
import * as path from 'path'
import {
  PublishState,
  StateTransition,
  PublishStateData
} from './interfaces'

/**
 * State machine for tracking publishing workflow with resume capability
 */
export class PublishStateMachine {
  private static readonly STATE_FILE = '.publish-state.json'

  private currentState: PublishState = 'INITIAL'
  private transitions: StateTransition[] = []
  private stateFilePath: string
  private registry?: string
  private version?: string
  private error?: string

  constructor(private projectPath: string) {
    this.stateFilePath = path.join(projectPath, PublishStateMachine.STATE_FILE)
  }

  /**
   * Transition to a new state
   */
  async transition(
    to: PublishState,
    metadata?: Record<string, any>
  ): Promise<void> {
    const transition: StateTransition = {
      from: this.currentState,
      to,
      timestamp: new Date(),
      metadata
    }

    this.transitions.push(transition)
    this.currentState = to

    // Update metadata if provided
    if (metadata) {
      if (metadata.registry) this.registry = metadata.registry
      if (metadata.version) this.version = metadata.version
      if (metadata.error) this.error = metadata.error
    }

    // Persist state
    await this.save()
  }

  /**
   * Get current state
   */
  getState(): PublishState {
    return this.currentState
  }

  /**
   * Get state data
   */
  getStateData(): PublishStateData {
    return {
      currentState: this.currentState,
      registry: this.registry,
      version: this.version,
      transitions: this.transitions,
      canResume: this.canResume(),
      error: this.error
    }
  }

  /**
   * Check if state can be resumed
   */
  canResume(): boolean {
    // Can resume if not in terminal states
    return !['SUCCESS', 'FAILED', 'INITIAL'].includes(this.currentState)
  }

  /**
   * Restore state from file
   */
  async restore(): Promise<boolean> {
    try {
      const content = await fs.readFile(this.stateFilePath, 'utf-8')
      const data: PublishStateData = JSON.parse(content)

      this.currentState = data.currentState
      this.registry = data.registry
      this.version = data.version
      this.error = data.error

      // Restore transitions with Date objects
      this.transitions = data.transitions.map((t) => ({
        ...t,
        timestamp: new Date(t.timestamp)
      }))

      return true
    } catch (error) {
      // State file doesn't exist or is corrupted
      return false
    }
  }

  /**
   * Save state to file
   */
  private async save(): Promise<void> {
    const data: PublishStateData = {
      currentState: this.currentState,
      registry: this.registry,
      version: this.version,
      transitions: this.transitions,
      canResume: this.canResume(),
      error: this.error
    }

    await fs.writeFile(
      this.stateFilePath,
      JSON.stringify(data, null, 2),
      'utf-8'
    )
  }

  /**
   * Clear state file
   */
  async clear(): Promise<void> {
    try {
      await fs.unlink(this.stateFilePath)
    } catch {
      // File doesn't exist, ignore
    }

    // Reset internal state
    this.currentState = 'INITIAL'
    this.transitions = []
    this.registry = undefined
    this.version = undefined
    this.error = undefined
  }

  /**
   * Get last error
   */
  getLastError(): string | undefined {
    return this.error
  }

  /**
   * Get elapsed time since start
   */
  getElapsedTime(): number {
    if (this.transitions.length === 0) {
      return 0
    }

    const firstTransition = this.transitions[0]
    const lastTransition = this.transitions[this.transitions.length - 1]

    return lastTransition.timestamp.getTime() - firstTransition.timestamp.getTime()
  }

  /**
   * Get transition history as human-readable string
   */
  getHistory(): string {
    return this.transitions
      .map((t) => {
        const time = t.timestamp.toISOString()
        const meta = t.metadata ? ` (${JSON.stringify(t.metadata)})` : ''
        return `${time}: ${t.from} → ${t.to}${meta}`
      })
      .join('\n')
  }
}
