# 0011: Use electron-vite, React and SVG

**Status:** accepted

## Decision

The app uses Electron, electron-vite, React, TypeScript and Zustand. The canvas is SVG with a viewBox in meters.

## Why

An SVG viewBox in meters means shapes are drawn directly in field coordinates, and the browser handles hit testing and scaling. The number of shapes is far too small for rendering speed to matter.

## Consequences

TypeScript stays on the newest version `typescript-eslint` supports, currently 6.x rather than 7.x.
