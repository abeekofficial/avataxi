// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "regagregator-bot",
      script: "index.js",
      instances: 1, // Bot uchun bitta instance (polling conflict bo'lmasin)
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env_development: {
        NODE_ENV: "development",
      },
      env_production: {
        NODE_ENV: "production",
      },
      error_file: "logs/pm2-error.log",
      out_file: "logs/pm2-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
