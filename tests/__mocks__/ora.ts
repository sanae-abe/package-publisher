/**
 * Mock for ora spinner library
 */
export interface MockOra {
  start(): MockOra
  succeed(text?: string): MockOra
  fail(text?: string): MockOra
  warn(text?: string): MockOra
  info(text?: string): MockOra
  stop(): MockOra
  text: string
  color: string
}

const createMockSpinner = (): MockOra => ({
  start: jest.fn().mockReturnThis(),
  succeed: jest.fn().mockReturnThis(),
  fail: jest.fn().mockReturnThis(),
  warn: jest.fn().mockReturnThis(),
  info: jest.fn().mockReturnThis(),
  stop: jest.fn().mockReturnThis(),
  text: '',
  color: 'cyan'
})

const ora = jest.fn(() => createMockSpinner())

export default ora
export type Ora = MockOra
