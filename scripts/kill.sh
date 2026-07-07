#!/bin/bash
echo "Killing dev processes..."
pkill -f "pnpm dev"
pkill -f "vite"
pkill -f "wrangler"
pkill -f "portless"
lsof -ti:5173 | xargs kill -9 2>/dev/null
lsof -ti:8787 | xargs kill -9 2>/dev/null
echo "Ports cleared."
