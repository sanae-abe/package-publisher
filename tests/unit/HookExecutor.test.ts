import { HookExecutor } from '../../src/core/HookExecutor'
import { HookCommand } from '../../src/core/PublishConfig'
import { HookContext } from '../../src/core/interfaces'
import { exec } from 'child_process'
import * as path from 'path'

// Mock child_process.exec
jest.mock('child_process')

const mockedExec = exec as unknown as jest.MockedFunction<typeof exec>

describe('HookExecutor', () => {
  let executor: HookExecutor
  const projectPath = '/test/project'
  const mockContext: HookContext = {
    phase: 'prePublish',
    registry: 'npm',
    version: '1.2.3',
    packageName: 'test-package',
    environment: { NODE_ENV: 'production' }
  }

  beforeEach(() => {
    executor = new HookExecutor(projectPath)
    jest.clearAllMocks()
    jest.spyOn(console, 'log').mockImplementation()
    jest.spyOn(console, 'error').mockImplementation()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('executeHooks', () => {
    it('空の配列の場合は即座に成功を返す', async () => {
      const result = await executor.executeHooks([], mockContext)

      expect(result.success).toBe(true)
      expect(result.executedHooks).toBe(0)
      expect(result.failedHooks).toEqual([])
      expect(result.outputs).toEqual([])
    })

    it('nullの場合は即座に成功を返す', async () => {
      const result = await executor.executeHooks(null as any, mockContext)

      expect(result.success).toBe(true)
      expect(result.executedHooks).toBe(0)
    })

    it('単一フックを正常に実行する', async () => {
      mockedExec.mockImplementation((cmd: any, opts: any, callback: any) => {
        callback(null, { stdout: 'hook output', stderr: '' })
        return {} as any
      })

      const hooks: HookCommand[] = [
        {
          command: 'npm run test',
          allowedCommands: ['npm']
        }
      ]

      const result = await executor.executeHooks(hooks, mockContext)

      expect(result.success).toBe(true)
      expect(result.executedHooks).toBe(1)
      expect(result.failedHooks).toEqual([])
      expect(result.outputs).toHaveLength(1)
      expect(result.outputs[0].exitCode).toBe(0)
      expect(result.outputs[0].stdout).toBe('hook output')
    })

    it('複数フックを順次実行する', async () => {
      mockedExec.mockImplementation((cmd: any, opts: any, callback: any) => {
        callback(null, { stdout: 'output', stderr: '' })
        return {} as any
      })

      const hooks: HookCommand[] = [
        { command: 'npm run lint', allowedCommands: ['npm'] },
        { command: 'npm run test', allowedCommands: ['npm'] },
        { command: 'git status', allowedCommands: ['git'] }
      ]

      const result = await executor.executeHooks(hooks, mockContext)

      expect(result.success).toBe(true)
      expect(result.executedHooks).toBe(3)
      expect(result.outputs).toHaveLength(3)
      expect(mockedExec).toHaveBeenCalledTimes(3)
    })

    it('exit code が0以外の場合は失敗とマークする', async () => {
      mockedExec.mockImplementation((cmd: any, opts: any, callback: any) => {
        const error: any = new Error('Command failed')
        error.code = 1
        error.stdout = 'some output'
        error.stderr = 'error message'
        callback(error)
        return {} as any
      })

      const hooks: HookCommand[] = [
        { command: 'npm run test', allowedCommands: ['npm'] }
      ]

      const result = await executor.executeHooks(hooks, mockContext)

      expect(result.success).toBe(false)
      expect(result.executedHooks).toBe(1)
      expect(result.failedHooks).toEqual(['npm run test'])
      expect(result.outputs[0].exitCode).toBe(1)
      expect(result.outputs[0].stderr).toBe('error message')
    })

    it('一部のフックが失敗しても残りを実行する', async () => {
      let callCount = 0
      mockedExec.mockImplementation((cmd: any, opts: any, callback: any) => {
        callCount++
        if (callCount === 2) {
          const error: any = new Error('Failed')
          error.code = 1
          error.stdout = ''
          error.stderr = 'hook 2 failed'
          callback(error)
        } else {
          callback(null, { stdout: `hook ${callCount} success`, stderr: '' })
        }
        return {} as any
      })

      const hooks: HookCommand[] = [
        { command: 'npm run lint', allowedCommands: ['npm'] },
        { command: 'npm run test', allowedCommands: ['npm'] },
        { command: 'npm run build', allowedCommands: ['npm'] }
      ]

      const result = await executor.executeHooks(hooks, mockContext)

      expect(result.success).toBe(false)
      expect(result.executedHooks).toBe(3)
      expect(result.failedHooks).toEqual(['npm run test'])
      expect(result.outputs).toHaveLength(3)
      expect(result.outputs[0].exitCode).toBe(0)
      expect(result.outputs[1].exitCode).toBe(1)
      expect(result.outputs[2].exitCode).toBe(0)
    })

    it('各フェーズのフックを実行できる', async () => {
      mockedExec.mockImplementation((cmd: any, opts: any, callback: any) => {
        callback(null, { stdout: 'success', stderr: '' })
        return {} as any
      })

      const hooks: HookCommand[] = [
        { command: 'npm run build', allowedCommands: ['npm'] }
      ]

      const phases: Array<HookContext['phase']> = ['preBuild', 'prePublish', 'postPublish', 'onError']

      for (const phase of phases) {
        const context = { ...mockContext, phase }
        const result = await executor.executeHooks(hooks, context)
        expect(result.success).toBe(true)
        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining(`${phase} hooks`)
        )
      }
    })
  })

  describe('executeHook - セキュリティ検証', () => {
    it('allowedCommandsが空の場合はエラーを投げる', async () => {
      const hooks: HookCommand[] = [
        { command: 'rm -rf /', allowedCommands: [] }
      ]

      const result = await executor.executeHooks(hooks, mockContext)

      expect(result.success).toBe(false)
      expect(result.failedHooks).toContain('rm -rf /')
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Hook error'),
        expect.any(Error)
      )
    })

    it('allowedCommandsが未定義の場合はエラーを投げる', async () => {
      const hooks: HookCommand[] = [
        { command: 'rm -rf /', allowedCommands: undefined as any }
      ]

      const result = await executor.executeHooks(hooks, mockContext)

      expect(result.success).toBe(false)
      expect(result.failedHooks).toContain('rm -rf /')
    })

    it('許可されていないコマンドはエラーを投げる', async () => {
      const hooks: HookCommand[] = [
        { command: 'rm -rf /', allowedCommands: ['npm', 'git'] }
      ]

      const result = await executor.executeHooks(hooks, mockContext)

      expect(result.success).toBe(false)
      expect(result.failedHooks).toContain('rm -rf /')
      expect(result.executedHooks).toBe(0) // Validation error prevents execution
    })

    it('許可されたコマンドのみ実行する', async () => {
      mockedExec.mockImplementation((cmd: any, opts: any, callback: any) => {
        callback(null, { stdout: 'ok', stderr: '' })
        return {} as any
      })

      const hooks: HookCommand[] = [
        { command: 'npm install', allowedCommands: ['npm'] },
        { command: 'git status', allowedCommands: ['git'] },
        { command: 'cargo build', allowedCommands: ['cargo'] }
      ]

      const result = await executor.executeHooks(hooks, mockContext)

      expect(result.success).toBe(true)
      expect(result.executedHooks).toBe(3)
    })

    it('コマンド名のみで許可チェックを行う', async () => {
      mockedExec.mockImplementation((cmd: any, opts: any, callback: any) => {
        callback(null, { stdout: 'ok', stderr: '' })
        return {} as any
      })

      const hooks: HookCommand[] = [
        { command: 'npm run test --coverage', allowedCommands: ['npm'] }
      ]

      const result = await executor.executeHooks(hooks, mockContext)

      expect(result.success).toBe(true)
    })

    it('パストラバーサル攻撃を防ぐ', async () => {
      const hooks: HookCommand[] = [
        {
          command: 'cat /etc/passwd',
          allowedCommands: ['cat'],
          workingDirectory: '../../../etc'
        }
      ]

      const result = await executor.executeHooks(hooks, mockContext)

      expect(result.success).toBe(false)
      expect(result.failedHooks).toContain('cat /etc/passwd')
    })

    it('プロジェクト内のworkingDirectoryは許可する', async () => {
      mockedExec.mockImplementation((cmd: any, opts: any, callback: any) => {
        expect(opts.cwd).toBe(path.resolve(projectPath, './src'))
        callback(null, { stdout: 'ok', stderr: '' })
        return {} as any
      })

      const hooks: HookCommand[] = [
        {
          command: 'npm run build',
          allowedCommands: ['npm'],
          workingDirectory: './src'
        }
      ]

      const result = await executor.executeHooks(hooks, mockContext)

      expect(result.success).toBe(true)
    })
  })

  describe('executeHook - 環境変数展開', () => {
    it('${VERSION}を展開する', async () => {
      mockedExec.mockImplementation((cmd: any, opts: any, callback: any) => {
        expect(cmd).toBe('git tag v1.2.3')
        callback(null, { stdout: 'ok', stderr: '' })
        return {} as any
      })

      const hooks: HookCommand[] = [
        { command: 'git tag v${VERSION}', allowedCommands: ['git'] }
      ]

      await executor.executeHooks(hooks, mockContext)
      expect(mockedExec).toHaveBeenCalled()
    })

    it('${PACKAGE_NAME}を展開する', async () => {
      mockedExec.mockImplementation((cmd: any, opts: any, callback: any) => {
        expect(cmd).toContain('test-package')
        callback(null, { stdout: 'ok', stderr: '' })
        return {} as any
      })

      const hooks: HookCommand[] = [
        { command: 'echo Publishing ${PACKAGE_NAME}', allowedCommands: ['echo'] }
      ]

      await executor.executeHooks(hooks, mockContext)
    })

    it('${REGISTRY}を展開する', async () => {
      mockedExec.mockImplementation((cmd: any, opts: any, callback: any) => {
        expect(cmd).toContain('npm')
        callback(null, { stdout: 'ok', stderr: '' })
        return {} as any
      })

      const hooks: HookCommand[] = [
        { command: 'echo Publishing to ${REGISTRY}', allowedCommands: ['echo'] }
      ]

      await executor.executeHooks(hooks, mockContext)
    })

    it('${PHASE}を展開する', async () => {
      mockedExec.mockImplementation((cmd: any, opts: any, callback: any) => {
        expect(cmd).toContain('prePublish')
        callback(null, { stdout: 'ok', stderr: '' })
        return {} as any
      })

      const hooks: HookCommand[] = [
        { command: 'echo Running ${PHASE} hook', allowedCommands: ['echo'] }
      ]

      await executor.executeHooks(hooks, mockContext)
    })

    it('複数の環境変数を同時に展開する', async () => {
      mockedExec.mockImplementation((cmd: any, opts: any, callback: any) => {
        expect(cmd).toBe('slack-notify "Publishing test-package@1.2.3 to npm"')
        callback(null, { stdout: 'ok', stderr: '' })
        return {} as any
      })

      const hooks: HookCommand[] = [
        {
          command: 'slack-notify "Publishing ${PACKAGE_NAME}@${VERSION} to ${REGISTRY}"',
          allowedCommands: ['slack-notify']
        }
      ]

      await executor.executeHooks(hooks, mockContext)
    })

    it('カスタム環境変数を渡す', async () => {
      mockedExec.mockImplementation((cmd: any, opts: any, callback: any) => {
        expect(opts.env).toMatchObject({
          NODE_ENV: 'production',
          ...process.env
        })
        callback(null, { stdout: 'ok', stderr: '' })
        return {} as any
      })

      const hooks: HookCommand[] = [
        { command: 'npm run build', allowedCommands: ['npm'] }
      ]

      await executor.executeHooks(hooks, mockContext)
    })
  })

  describe('executeHook - タイムアウト処理', () => {
    it('デフォルトタイムアウトは300秒', async () => {
      mockedExec.mockImplementation((cmd: any, opts: any, callback: any) => {
        expect(opts.timeout).toBe(300000) // 300s in ms
        callback(null, { stdout: 'ok', stderr: '' })
        return {} as any
      })

      const hooks: HookCommand[] = [
        { command: 'npm run test', allowedCommands: ['npm'] }
      ]

      await executor.executeHooks(hooks, mockContext)
    })

    it('カスタムタイムアウトを設定できる', async () => {
      mockedExec.mockImplementation((cmd: any, opts: any, callback: any) => {
        expect(opts.timeout).toBe(60000) // 60s in ms
        callback(null, { stdout: 'ok', stderr: '' })
        return {} as any
      })

      const hooks: HookCommand[] = [
        { command: 'npm run lint', allowedCommands: ['npm'], timeout: 60 }
      ]

      await executor.executeHooks(hooks, mockContext)
    })

    it('タイムアウト時はエラーを投げる', async () => {
      mockedExec.mockImplementation((cmd: any, opts: any, callback: any) => {
        const error: any = new Error('Timeout')
        error.killed = true
        callback(error)
        return {} as any
      })

      const hooks: HookCommand[] = [
        { command: 'npm run slow-test', allowedCommands: ['npm'], timeout: 10 }
      ]

      const result = await executor.executeHooks(hooks, mockContext)

      expect(result.success).toBe(false)
      expect(result.failedHooks).toContain('npm run slow-test')
    })
  })

  describe('executeHook - 出力とエラーハンドリング', () => {
    it('stdoutとstderrを正しく記録する', async () => {
      mockedExec.mockImplementation((cmd: any, opts: any, callback: any) => {
        callback(null, {
          stdout: '  test output  \n',
          stderr: '  warning message  \n'
        })
        return {} as any
      })

      const hooks: HookCommand[] = [
        { command: 'npm run test', allowedCommands: ['npm'] }
      ]

      const result = await executor.executeHooks(hooks, mockContext)

      expect(result.outputs[0].stdout).toBe('test output')
      expect(result.outputs[0].stderr).toBe('warning message')
    })

    it('実行時間を記録する', async () => {
      mockedExec.mockImplementation((cmd: any, opts: any, callback: any) => {
        setTimeout(() => {
          callback(null, { stdout: 'ok', stderr: '' })
        }, 50)
        return {} as any
      })

      const hooks: HookCommand[] = [
        { command: 'npm run test', allowedCommands: ['npm'] }
      ]

      const result = await executor.executeHooks(hooks, mockContext)

      expect(result.outputs[0].duration).toBeGreaterThanOrEqual(45)
      expect(result.outputs[0].duration).toBeLessThan(200)
    })

    it('エラー時のstdoutとstderrを記録する', async () => {
      mockedExec.mockImplementation((cmd: any, opts: any, callback: any) => {
        const error: any = new Error('Command failed')
        error.code = 127
        error.stdout = 'partial output'
        error.stderr = 'command not found'
        callback(error)
        return {} as any
      })

      const hooks: HookCommand[] = [
        { command: 'nonexistent-command', allowedCommands: ['nonexistent-command'] }
      ]

      const result = await executor.executeHooks(hooks, mockContext)

      expect(result.outputs[0].exitCode).toBe(127)
      expect(result.outputs[0].stdout).toBe('partial output')
      expect(result.outputs[0].stderr).toBe('command not found')
    })

    it('エラーメッセージのみの場合も記録する', async () => {
      mockedExec.mockImplementation((cmd: any, opts: any, callback: any) => {
        const error: any = new Error('Execution error')
        error.code = 1
        callback(error)
        return {} as any
      })

      const hooks: HookCommand[] = [
        { command: 'npm run test', allowedCommands: ['npm'] }
      ]

      const result = await executor.executeHooks(hooks, mockContext)

      expect(result.outputs[0].stderr).toBe('Execution error')
    })

    it('exit codeがundefinedの場合は1を返す', async () => {
      mockedExec.mockImplementation((cmd: any, opts: any, callback: any) => {
        const error: any = new Error('Unknown error')
        error.stdout = ''
        error.stderr = 'error'
        // error.code is undefined
        callback(error)
        return {} as any
      })

      const hooks: HookCommand[] = [
        { command: 'npm run test', allowedCommands: ['npm'] }
      ]

      const result = await executor.executeHooks(hooks, mockContext)

      expect(result.outputs[0].exitCode).toBe(1)
    })

    it('maxBufferを10MBに設定する', async () => {
      mockedExec.mockImplementation((cmd: any, opts: any, callback: any) => {
        expect(opts.maxBuffer).toBe(10 * 1024 * 1024)
        callback(null, { stdout: 'ok', stderr: '' })
        return {} as any
      })

      const hooks: HookCommand[] = [
        { command: 'npm run test', allowedCommands: ['npm'] }
      ]

      await executor.executeHooks(hooks, mockContext)
    })
  })

  describe('executeHook - workingDirectory', () => {
    it('workingDirectoryが未指定の場合はプロジェクトルートを使用', async () => {
      mockedExec.mockImplementation((cmd: any, opts: any, callback: any) => {
        expect(opts.cwd).toBe(path.resolve(projectPath, './'))
        callback(null, { stdout: 'ok', stderr: '' })
        return {} as any
      })

      const hooks: HookCommand[] = [
        { command: 'npm run test', allowedCommands: ['npm'] }
      ]

      await executor.executeHooks(hooks, mockContext)
    })

    it('相対パスを正しく解決する', async () => {
      mockedExec.mockImplementation((cmd: any, opts: any, callback: any) => {
        expect(opts.cwd).toBe(path.resolve(projectPath, './packages/core'))
        callback(null, { stdout: 'ok', stderr: '' })
        return {} as any
      })

      const hooks: HookCommand[] = [
        {
          command: 'npm run test',
          allowedCommands: ['npm'],
          workingDirectory: './packages/core'
        }
      ]

      await executor.executeHooks(hooks, mockContext)
    })

    it('絶対パスがプロジェクト内の場合は許可する', async () => {
      const absolutePath = path.join(projectPath, 'subdir')

      mockedExec.mockImplementation((cmd: any, opts: any, callback: any) => {
        expect(opts.cwd).toBe(absolutePath)
        callback(null, { stdout: 'ok', stderr: '' })
        return {} as any
      })

      const hooks: HookCommand[] = [
        {
          command: 'npm run test',
          allowedCommands: ['npm'],
          workingDirectory: absolutePath
        }
      ]

      await executor.executeHooks(hooks, mockContext)
    })
  })
})
