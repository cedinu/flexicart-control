#!/usr/bin/env bash
# Development mode startup for flexicart-control
# Sets environment to development, uses nodemon for live reload

# Load environment variables from config if needed
export NODE_ENV=development

# Ensure dependencies are installed
npm install

# Start the service with nodemon
npx nodemon --watch src --ext js,json --exec "node src/index.js"
