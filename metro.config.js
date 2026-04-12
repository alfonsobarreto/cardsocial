const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Fix Windows: Metro encodes '/' as '%2F' in asset URLs, causing ENOENT.
config.server = {
  ...config.server,
  enhanceMiddleware: (middleware) => {
    return (req, res, next) => {
      if (req.url && req.url.includes('%2F')) {
        req.url = req.url.replace(/%2F/gi, '/');
      }
      return middleware(req, res, next);
    };
  },
};

module.exports = config;
