#!/usr/bin/env bash
# Deploy flexicart-control to production
# Usage: ./deploy.sh <server>

SERVER=${1:?"Usage: $0 <server>"}

# Build or package if needed
# rsync files to server
rsync -avz --exclude 'node_modules' . ${SERVER}:/opt/flexicart-control
# Install dependencies on server
ssh ${SERVER} "cd /opt/flexicart-control && npm install --production"
# Restart service
ssh ${SERVER} "systemctl restart flexicart-control.service"
