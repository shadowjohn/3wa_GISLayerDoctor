Build in a temporary copy of this directory: npm ci --ignore-scripts; npx esbuild entry.js --bundle --format=iife --global-name=GISFormats --platform=browser --minify --outfile=../gis-formats.js
Commit the generated bundle and keep dependency licenses. No build or npm install is needed to serve the site.
