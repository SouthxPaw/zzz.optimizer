# GitHub Pages Deployment Guide for ZZZ Optimizer

## Overview
This guide walks you through deploying your ZZZ Optimizer to GitHub Pages for free static hosting.

## Prerequisites
- A GitHub account
- Git installed on your computer
- Node.js and npm installed

## Step 1: Initialize Git Repository (if not already done)

Open a terminal in your project directory and run:

```bash
git init
git add .
git commit -m "Initial commit"
```

## Step 2: Create GitHub Repository

1. Go to https://github.com
2. Click the "+" icon in the top right corner
3. Select "New repository"
4. Name it: `zzz-optimizer` (must match the baseHref in angular.json)
5. **Important:** Do NOT check "Initialize this repository with a README"
6. Click "Create repository"

## Step 3: Connect Local Repository to GitHub

Replace `YOUR_USERNAME` with your actual GitHub username:

```bash
git remote add origin https://github.com/YOUR_USERNAME/zzz-optimizer.git
git branch -M main
git push -u origin main
```

## Step 4: Deploy to GitHub Pages

Simply run:

```bash
npm run deploy:ghpages
```

This command will:
- Build your project with the static configuration
- Automatically create and push to the `gh-pages` branch
- Deploy your site

The process takes about 10-20 seconds.

## Step 5: Enable GitHub Pages (if needed)

GitHub usually auto-enables Pages after the first deployment, but if it doesn't:

1. Go to your repository on GitHub
2. Click **Settings** (top navigation)
3. Click **Pages** (left sidebar under "Code and automation")
4. Under "Source", select `gh-pages` branch
5. Click **Save**

## Step 6: Access Your Site

Your site will be available at:
```
https://YOUR_USERNAME.github.io/zzz-optimizer/
```

Note: It may take 1-2 minutes after the first deployment for the site to become available.

## Future Updates

Whenever you make changes to your code:

1. Commit your changes locally:
```bash
git add .
git commit -m "Description of changes"
git push origin main
```

2. Redeploy to GitHub Pages:
```bash
npm run deploy:ghpages
```

That's it! The site will update within 1-2 minutes.

## Important Technical Details

### Configuration
- **Base URL**: `/zzz-optimizer/` (configured in angular.json)
- **Build Type**: Static (prerendered routes)
- **Output Directory**: `dist/zzz.optimizer/browser`
- **Target Branch**: `gh-pages`

### How It Works
- The app uses IndexedDB for all data storage (builds, discs, reference data)
- All data is stored locally in the user's browser
- No backend server is required
- Routes are prerendered for optimal performance

### Data Persistence
- User data (disc inventory, builds) persists in browser IndexedDB
- Clearing browser cache will delete user data
- Users can export/import their builds as backup (Data Manager page)

### Troubleshooting

**Problem: Site shows 404 error**
- Verify the repository name matches `zzz-optimizer`
- Check that GitHub Pages is enabled in repository settings
- Ensure the `gh-pages` branch exists

**Problem: Routing doesn't work (404 on refresh)**
- This is expected with GitHub Pages
- The app includes prerendered routes which should prevent this
- If issues persist, check that all routes in app.routes.ts are configured

**Problem: Assets not loading**
- Check that all asset paths use relative paths starting with `assets/`
- Verify the baseHref in angular.json is `/zzz-optimizer/`

**Problem: Build warnings about budget exceeded**
- These warnings are normal and won't prevent deployment
- The app is slightly larger than Angular's default budgets
- The site will still work perfectly fine

### Build Commands Reference

```bash
# Regular development build
npm start

# Production build (SSR enabled)
npm run build

# GitHub Pages build (static, no SSR)
npm run build:ghpages

# Deploy to GitHub Pages (build + deploy)
npm run deploy:ghpages
```

## Support

If you encounter issues:
1. Check the GitHub repository's Actions tab for deployment logs
2. Verify all files committed and pushed to main branch
3. Ensure Node.js version is compatible (check package.json)
4. Try deleting `node_modules` and running `npm install` again

## Additional Resources

- Angular GitHub Pages Deployment: https://angular.dev/tools/cli/deployment#deploy-to-github-pages
- angular-cli-ghpages Documentation: https://github.com/angular-schule/angular-cli-ghpages
- GitHub Pages Documentation: https://docs.github.com/en/pages

---

**Note:** This is configured for free GitHub Pages hosting. Your site URL will be:
`https://YOUR_USERNAME.github.io/zzz-optimizer/`

If you want a custom domain, you can configure it in GitHub repository settings.
