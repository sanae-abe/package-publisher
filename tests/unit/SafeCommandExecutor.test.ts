import { SafeCommandExecutor } from '../../src/security/SafeCommandExecutor'
import { exec } from 'child_process'

// Mock child_process.exec
jest.mock('child_process')

const mockedExec = exec as jest.MockedFunction<typeof exec>

describe('SafeCommandExecutor', () => {
  let executor: SafeCommandExecutor

  beforeEach(() => {
    executor = new SafeCommandExecutor()
    jest.clearAllMocks()
  })

  describe('execSafe', () => {
    it('許可されたコマンドを実行できる', async () => {
      mockedExec.mockImplementation(((_cmd: any, _opts: any, callback: any) => {
        if (callback) {
          callback(null, { stdout: 'success output', stderr: '' } as any, '')
        }
        return {} as any
      }) as any)

      const result = await executor.execSafe('npm', ['--version'])

      expect(result.stdout).toBe('success output')
      expect(result.exitCode).toBe(0)
      expect(mockedExec).toHaveBeenCalled()
    })

    it('許可されていないコマンドはエラーを投げる', async () => {
      await expect(executor.execSafe('rm', ['-rf', '/'])).rejects.toThrow(
        'Command "rm" is not allowed'
      )

      expect(mockedExec).not.toHaveBeenCalled()
    })

    it('スペースを含む引数を正しくサニタイズする', async () => {
      mockedExec.mockImplementation(((_cmd: any, _opts: any, callback: any) => {
        if (callback) {
          callback(null, { stdout: 'output', stderr: '' } as any, '')
        }
        return {} as any
      }) as any)

      await executor.execSafe('git', ['commit', '-m', 'test message'])

      expect(mockedExec).toHaveBeenCalledWith(
        "git commit -m 'test message'",
        expect.any(Object),
        expect.any(Function)
      )
    })

    it('特殊文字を含む引数を正しくサニタイズする', async () => {
      mockedExec.mockImplementation(((_cmd: any, _opts: any, callback: any) => {
        if (callback) {
          callback(null, { stdout: 'output', stderr: '' } as any, '')
        }
        return {} as any
      }) as any)

      await executor.execSafe('npm', ['run', 'test;rm -rf /'])

      expect(mockedExec).toHaveBeenCalledWith(
        "npm run 'test;rm -rf /'",
        expect.any(Object),
        expect.any(Function)
      )
    })

    it('シングルクォートを含む引数を正しくエスケープする', async () => {
      mockedExec.mockImplementation(((_cmd: any, _opts: any, callback: any) => {
        if (callback) {
          callback(null, { stdout: 'output', stderr: '' } as any, '')
        }
        return {} as any
      }) as any)

      await executor.execSafe('git', ['commit', '-m', "It's a test"])

      expect(mockedExec).toHaveBeenCalledWith(
        "git commit -m 'It'\\''s a test'",
        expect.any(Object),
        expect.any(Function)
      )
    })

    it('通常の引数はサニタイズせずに渡す', async () => {
      mockedExec.mockImplementation(((_cmd: any, _opts: any, callback: any) => {
        if (callback) {
          callback(null, { stdout: 'output', stderr: '' } as any, '')
        }
        return {} as any
      }) as any)

      await executor.execSafe('cargo', ['build', '--release'])

      expect(mockedExec).toHaveBeenCalledWith(
        'cargo build --release',
        expect.any(Object),
        expect.any(Function)
      )
    })

    it('コマンド失敗時のエラーハンドリング', async () => {
      const execError: any = new Error('Command failed')
      execError.code = 1
      execError.stdout = 'partial output'
      execError.stderr = 'error message'

      mockedExec.mockImplementation(((_cmd: any, _opts: any, callback: any) => {
        if (callback) {
          callback(execError, { stdout: '', stderr: '' } as any, '')
        }
        return {} as any
      }) as any)

      const result = await executor.execSafe('npm', ['test'])

      expect(result.exitCode).toBe(1)
      expect(result.stdout).toBe('partial output')
      expect(result.stderr).toBe('error message')
    })

    it('エラーメッセージのみの失敗をハンドリング', async () => {
      const execError: any = new Error('ENOENT: command not found')
      execError.code = 127

      mockedExec.mockImplementation(((_cmd: any, _opts: any, callback: any) => {
        if (callback) {
          callback(execError, { stdout: '', stderr: '' } as any, '')
        }
        return {} as any
      }) as any)

      const result = await executor.execSafe('npm', ['install'])

      expect(result.exitCode).toBe(127)
      expect(result.stderr).toBe('ENOENT: command not found')
    })

    it('cwdオプションを正しく渡す', async () => {
      mockedExec.mockImplementation(((_cmd: any, opts: any, callback: any) => {
        expect(opts).toEqual(expect.objectContaining({ cwd: '/test/path' }))
        if (callback) {
          callback(null, { stdout: 'output', stderr: '' } as any, '')
        }
        return {} as any
      }) as any)

      await executor.execSafe('npm', ['install'], { cwd: '/test/path' })
    })

    it('環境変数オプションを正しく渡す', async () => {
      const customEnv = { NODE_ENV: 'test' }

      mockedExec.mockImplementation(((_cmd: any, opts: any, callback: any) => {
        expect(opts).toEqual(expect.objectContaining({
          env: expect.objectContaining(customEnv)
        }))
        if (callback) {
          callback(null, { stdout: 'output', stderr: '' } as any, '')
        }
        return {} as any
      }) as any)

      await executor.execSafe('npm', ['test'], { env: customEnv })
    })

    it('タイムアウトオプションを正しく設定する', async () => {
      mockedExec.mockImplementation(((_cmd: any, opts: any, callback: any) => {
        expect(opts).toEqual(expect.objectContaining({ timeout: 60000 }))
        if (callback) {
          callback(null, { stdout: 'output', stderr: '' } as any, '')
        }
        return {} as any
      }) as any)

      await executor.execSafe('npm', ['test'], { timeout: 60000 })
    })

    it('デフォルトのタイムアウトは120秒', async () => {
      mockedExec.mockImplementation(((_cmd: any, opts: any, callback: any) => {
        expect(opts).toEqual(expect.objectContaining({ timeout: 120000 }))
        if (callback) {
          callback(null, { stdout: 'output', stderr: '' } as any, '')
        }
        return {} as any
      }) as any)

      await executor.execSafe('npm', ['install'])
    })

    it('silentオプションでコンソール出力を抑制する', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

      mockedExec.mockImplementation(((_cmd: any, _opts: any, callback: any) => {
        if (callback) {
          callback(null, { stdout: 'output', stderr: 'warning' } as any, '')
        }
        return {} as any
      }) as any)

      await executor.execSafe('npm', ['test'], { silent: true })

      expect(consoleSpy).not.toHaveBeenCalled()
      expect(consoleErrorSpy).not.toHaveBeenCalled()

      consoleSpy.mockRestore()
      consoleErrorSpy.mockRestore()
    })

    it('silentオプションなしでコンソール出力する', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

      mockedExec.mockImplementation(((_cmd: any, _opts: any, callback: any) => {
        if (callback) {
          callback(null, { stdout: 'output', stderr: 'warning' } as any, '')
        }
        return {} as any
      }) as any)

      await executor.execSafe('npm', ['test'], { silent: false })

      expect(consoleSpy).toHaveBeenCalledWith('output')
      expect(consoleErrorSpy).toHaveBeenCalledWith('warning')

      consoleSpy.mockRestore()
      consoleErrorSpy.mockRestore()
    })

    it('stdoutとstderrをtrimして返す', async () => {
      mockedExec.mockImplementation(((_cmd: any, _opts: any, callback: any) => {
        if (callback) {
          callback(null, {
            stdout: '  output with spaces  \n',
            stderr: '  error with spaces  \n'
          } as any, '')
        }
        return {} as any
      }) as any)

      const result = await executor.execSafe('npm', ['test'], { silent: true })

      expect(result.stdout).toBe('output with spaces')
      expect(result.stderr).toBe('error with spaces')
    })

    it('複数の許可されたコマンドをサポート', async () => {
      mockedExec.mockImplementation(((_cmd: any, _opts: any, callback: any) => {
        if (callback) {
          callback(null, { stdout: '', stderr: '' } as any, '')
        }
        return {} as any
      }) as any)

      const allowedCommands = ['cargo', 'npm', 'pip', 'twine', 'python', 'python3', 'git', 'gh', 'glab', 'brew']

      for (const cmd of allowedCommands) {
        await expect(executor.execSafe(cmd, ['--version'])).resolves.toBeDefined()
      }

      expect(mockedExec).toHaveBeenCalledTimes(allowedCommands.length)
    })

    it('危険な文字（パイプ、リダイレクト等）を含む引数をサニタイズ', async () => {
      mockedExec.mockImplementation(((_cmd: any, _opts: any, callback: any) => {
        if (callback) {
          callback(null, { stdout: '', stderr: '' } as any, '')
        }
        return {} as any
      }) as any)

      await executor.execSafe('npm', ['run', 'test | cat /etc/passwd'])

      expect(mockedExec).toHaveBeenCalledWith(
        "npm run 'test | cat /etc/passwd'",
        expect.any(Object),
        expect.any(Function)
      )
    })

    it('バックティックを含む引数をサニタイズ', async () => {
      mockedExec.mockImplementation(((_cmd: any, _opts: any, callback: any) => {
        if (callback) {
          callback(null, { stdout: '', stderr: '' } as any, '')
        }
        return {} as any
      }) as any)

      await executor.execSafe('npm', ['run', 'test `whoami`'])

      expect(mockedExec).toHaveBeenCalledWith(
        "npm run 'test `whoami`'",
        expect.any(Object),
        expect.any(Function)
      )
    })

    it('ドルマーク（変数展開）を含む引数をサニタイズ', async () => {
      mockedExec.mockImplementation(((_cmd: any, _opts: any, callback: any) => {
        if (callback) {
          callback(null, { stdout: '', stderr: '' } as any, '')
        }
        return {} as any
      }) as any)

      await executor.execSafe('npm', ['run', 'test $HOME'])

      expect(mockedExec).toHaveBeenCalledWith(
        "npm run 'test $HOME'",
        expect.any(Object),
        expect.any(Function)
      )
    })
  })
})
