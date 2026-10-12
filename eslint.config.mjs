import nextConfig from 'eslint-config-next'

const config = [
  ...nextConfig,
  {
    ignores: ['.next/**', '.next-staging/**', 'node_modules/**', '.tools/**'],
  },
  {
    rules: {
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
]

export default config
