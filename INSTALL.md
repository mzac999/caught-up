# Putting Caught-Up on your iPhone

Caught-Up is a static website. You host it for free once, open it in Safari on your
iPhone, and add it to your Home Screen. After the first visit it works offline.

Your timetable and attendance are stored **only on your phone** (nothing is uploaded
anywhere), so the hosted files contain no personal data.

---

## 1. Host it on GitHub Pages (free)

1. Go to **github.com** and create a free account (or sign in).
2. Click **+** (top right) → **New repository**.
   - Name: `caught-up` (any name works, it becomes part of the address)
   - Visibility: **Public** (free Pages needs a public repository)
   - Click **Create repository**.
3. On the new repository page, click **uploading an existing file**
   (or **Add file → Upload files**).
4. Open the `source` folder on your Mac, select **everything inside it**
   (`index.html`, `manifest.webmanifest`, `sw.js`, and the `css`, `js`, `icons`
   folders) and drag it all into the upload area. Chrome handles dragging folders
   most reliably.
   - Check that `index.html` sits at the top level of the repository, not inside a folder.
5. Click **Commit changes**.
6. Go to the repository's **Settings → Pages**.
   - Under **Build and deployment → Source**, choose **Deploy from a branch**.
   - Branch: **main**, folder: **/ (root)** → **Save**.
7. Wait a minute or two, then refresh that page. It shows your address, like
   `https://your-username.github.io/caught-up/`.

**Alternative:** Netlify (netlify.com) also hosts static sites for free: create an
account, choose to deploy manually, and drag the `source` folder onto the page.

## 2. Install on your iPhone

1. On your iPhone, open the address from step 1.7 in **Safari**.
2. Tap the **Share** button → **Add to Home Screen** → **Add**.
3. Open **Caught-Up from the Home Screen icon** from now on.

> **Do your setup inside the installed app, not in the Safari tab.**
> The Home Screen app keeps its own storage, separate from Safari. Anything you
> enter in the Safari tab will **not** appear in the installed app.

## 3. Keep your data safe

- Your data lives in the app's storage on the phone. Deleting the Home Screen icon
  deletes the data with it.
- Use **Settings → Export backup** now and then. On iPhone this opens the share sheet,
  where **Save to Files** keeps a copy in iCloud Drive.
- New phone: install the app (step 2), then on the welcome screen tap
  **Restore from a backup** (or **Settings → Import backup**) and pick the file.
- **Settings → Export attendance log** gives a spreadsheet (.csv) of every session so far.

## 4. Updating the app

When the code changes, upload the changed files to the same GitHub repository
(**Add file → Upload files**, same folder layout, **Commit changes**). The app shows
the cached version instantly and fetches the new files in the background, so the update
appears the **next time you open it** (close it fully and reopen if needed). Your data
is not affected by updates.

If you add a new file to the project, also add its path to the `FILES` list in `sw.js`
so it is available offline.

## Running it on your laptop

- Easiest: double-click `Caught-Up.html` (the whole app in one file).
- To work on the code in `source`, open Terminal and run
  `cd ~/Documents/Caught-Up/source && python3 -m http.server 8000`, then visit
  http://localhost:8000. (Opening `source/index.html` directly from disk shows a
  blank page, because browsers block the code files when loaded that way.)
