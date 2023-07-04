#!/bin/bash -x
rm -rf dists posts
pnpm tiged zachleat/bench-framework-markdown/_markdown-samples/${1:-250} posts
time pnpm vite build
