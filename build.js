#!/usr/bin/env node

// Build script to generate config.js from environment variables
const fs = require('fs');
const path = require('path');

const configContent = `window.ENV = {
  YOUTUBE_API_KEY: '${process.env.YOUTUBE_API_KEY || ''}'
};
`;

fs.writeFileSync(path.join(__dirname, 'config.js'), configContent);
console.log('config.js generated successfully');