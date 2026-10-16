# Ashraf CyberX — Target Board Free Study Portal

Static production build prepared for GitHub + Vercel deployment.

## Deploy
1. Extract this ZIP.
2. Upload all files and folders in this directory to the root of a GitHub repository (not the ZIP file itself).
3. In Vercel, import that repository.
4. Framework Preset: Other. Build Command: leave empty. Output Directory: `.`. Install Command: leave empty.
5. Deploy.

`index.html`, `css/`, `js/`, and `images/` must remain at the repository root.

## API note
The front-end references `https://studyapkmod.free.nf/tbapi/api.php` and TPStreams endpoints. Deployment does not guarantee those third-party APIs, tokens, CORS settings, or course data are currently available. Do not expose private access tokens in public client-side code.
