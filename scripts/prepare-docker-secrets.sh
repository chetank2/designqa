#!/bin/bash
# Helper script to prepare Docker secrets for secure builds
# This script creates secret files from environment variables or .env files

set -e

SECRETS_DIR="./secrets"
FRONTEND_ENV="./frontend/.env"

# Create secrets directory if it doesn't exist
mkdir -p "$SECRETS_DIR"

echo "Preparing Docker secrets for secure build..."

# Check if frontend/.env exists and extract values
if [ -f "$FRONTEND_ENV" ]; then
    echo "Reading values from $FRONTEND_ENV..."
    
    # Extract VITE_SUPABASE_URL
    if grep -q "VITE_SUPABASE_URL" "$FRONTEND_ENV"; then
        grep "VITE_SUPABASE_URL" "$FRONTEND_ENV" | cut -d '=' -f2- | tr -d '"' > "$SECRETS_DIR/vite_supabase_url.txt"
        echo "✓ Created $SECRETS_DIR/vite_supabase_url.txt"
    fi
    
    # Extract VITE_SUPABASE_ANON_KEY
    if grep -q "VITE_SUPABASE_ANON_KEY" "$FRONTEND_ENV"; then
        grep "VITE_SUPABASE_ANON_KEY" "$FRONTEND_ENV" | cut -d '=' -f2- | tr -d '"' > "$SECRETS_DIR/vite_supabase_anon_key.txt"
        echo "✓ Created $SECRETS_DIR/vite_supabase_anon_key.txt"
    fi
else
    echo "Warning: $FRONTEND_ENV not found."
    echo "Please create secret files manually or set environment variables:"
    echo ""
    echo "  echo 'your-supabase-url' > $SECRETS_DIR/vite_supabase_url.txt"
    echo "  echo 'your-anon-key' > $SECRETS_DIR/vite_supabase_anon_key.txt"
    echo ""
    exit 1
fi

echo ""
echo "Secrets prepared successfully!"
echo ""
echo "To build the Docker image securely, run:"
echo "  docker build --secret id=vite_supabase_url,src=$SECRETS_DIR/vite_supabase_url.txt \\"
echo "               --secret id=vite_supabase_anon_key,src=$SECRETS_DIR/vite_supabase_anon_key.txt \\"
echo "               -t designqa:latest ."
echo ""
echo "Note: Make sure to add '$SECRETS_DIR' to .gitignore to avoid committing secrets!"
