module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: './tsconfig.json'
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking'
  ],
  env: {
    node: true,
    es2022: true
  },
  rules: {
    // TypeScript specific rules
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unsafe-assignment': 'off', // Allow for external API responses
    '@typescript-eslint/no-unsafe-member-access': 'off', // Allow for external API responses
    '@typescript-eslint/no-unsafe-argument': 'off', // Allow for external API responses
    '@typescript-eslint/no-unsafe-call': 'off', // Allow for dynamic calls
    '@typescript-eslint/require-await': 'warn',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-non-null-assertion': 'off', // Allow ! assertions (we use them safely)

    // General rules
    'no-console': 'off', // CLI tool needs console output
    'no-useless-escape': 'warn',
    'prefer-const': 'error',
    'no-var': 'error'
  },
  ignorePatterns: ['dist', 'node_modules', '*.js', 'jest.config.js', '.eslintrc.js']
}
