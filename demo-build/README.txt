TRT Australia — Care Operations demonstration
=============================================

Four files. Completely self-contained: no server, no backend, no database.
Open index.html locally and it works, or drop this folder on any static
host for a permanent URL.

PUBLISHING (pick one, all free)

  Netlify Drop — fastest, no account needed to start
    1. Go to  https://app.netlify.com/drop
    2. Drag this whole folder onto the page
    3. You get a permanent URL in about ten seconds

  Cloudflare Pages
    1. https://pages.cloudflare.com  →  Create a project
    2. Upload assets, drag this folder
    3. Permanent URL on pages.dev

  GitHub Pages
    Commit these files to a repo, enable Pages in Settings.

WHY THIS IS BETTER THAN THE TUNNEL

A trycloudflare.com link only lives while the laptop, WSL, the Python
server and cloudflared are all running, and the URL changes every restart.
These files depend on none of that.

NOTE ON CONTENT

Every client, message and date here is invented. The topbar carries a
"Demonstration data" marker. Do not put real client information into this
build — it is intended for a public link.
