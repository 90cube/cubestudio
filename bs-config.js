const { createProxyMiddleware } = require('http-proxy-middleware');

const apiProxy = createProxyMiddleware('/api', {
  target: 'http://127.0.0.1:8080',
  changeOrigin: true,
});

const outputProxy = createProxyMiddleware('/output', {
  target: 'http://127.0.0.1:8080',
  changeOrigin: true,
});

module.exports = {
  port: 9000,
  files: [
    './index.html',
    './frontend/**/*'
  ],
  watchOptions: {
    ignored: [
      'output/**',
      'models/**',
      'cache/**',
      'logs/**',
      '__pycache__/**',
      '*.log',
      '*.tmp',
      '*.tmp.*',
      '*_test.*',
      'test_*',
      'debug_*',
      '*_debug.*',
      '*.pyc',
      '*.json.bak'
    ]
  },
  server: {
    baseDir: './',
    middleware: [apiProxy, outputProxy],
  },
};
