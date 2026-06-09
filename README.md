# PulseAI | Automated AI News Hub

PulseAI is a stunning, serverless, automated news website that crawls global news sources hourly, uses Google Gemini to summarize, rewrite, and categorize the articles, stores them in Firebase Firestore, and serves a modern, responsive interface hosted on Firebase Hosting.

It is designed to run entirely on **Google's and GitHub's free tiers**, meaning you can run your own hourly automated news agency at **zero financial cost**.

---

## ⚡ Architecture Overview

```
[RSS Feeds / Web Sources] 
         │
         ▼ (Every Hour)
[GitHub Actions Scraper Runner]  ◄─── [Gemini 1.5 Flash API] (Rewrites & Summarizes)
         │
         ▼ (Writes Articles)
[Google Firebase Firestore]
         │
         ▼ (Syncs Real-Time)
[Vite + React Frontend Web App] ───► Hosted on [Firebase Hosting]
```

---

## 🚀 Step-by-Step Setup

### Phase 1: Local Testing (No Firebase Setup Required)
We have designed PulseAI with a **Demo Mode** and **Dry Run** capabilities, allowing you to run the crawler and view the website locally before creating any Google Cloud accounts.

1. **Test the Scraper (Dry Run)**:
   Navigate to the `automation` folder and run the scraper. It will run in dry-run mode and save articles locally to `automation/articles_dry_run.json`.
   ```bash
   cd automation
   node index.js
   ```
   *Note: If you don't set a Gemini API key, it will use high-quality simulated AI rewrites.*

2. **Test the Frontend (Demo Mode)**:
   Navigate to the `frontend` folder and start the dev server. Since no Firebase keys are set yet, it will automatically load the simulated articles.
   ```bash
   cd frontend
   npm run dev
   ```
   Open `http://localhost:5173` to explore the premium web interface!

---

### Phase 2: Firebase Database & Hosting Setup (Using your Google Account)

To store live articles and host the website publicly, you will configure a Firebase project:

1. **Create Firebase Project**:
   * Open the [Firebase Console](https://console.firebase.google.com/) and log in with your Google account.
   * Click **Add Project** and name it (e.g., `pulse-ai-news`). Disable Google Analytics if not needed, then click **Create Project**.

2. **Initialize Firestore Database**:
   * In the Firebase left sidebar, click **Build** -> **Firestore Database**.
   * Click **Create database**.
   * Select **Start in production mode** (our pre-configured security rules will keep it locked) and choose a regional location near you, then click **Enable**.

3. **Get Frontend Web Credentials**:
   * Go to Project Overview (gear icon top-left) -> **Project settings**.
   * Under "Your apps", click the **Web icon (`</>`)**.
   * Register the app as `pulse-ai-web`.
   * Copy the `firebaseConfig` credentials object. It will look like this:
     ```javascript
     const firebaseConfig = {
       apiKey: "AIzaSy...",
       authDomain: "pulse-ai-news.firebaseapp.com",
       projectId: "pulse-ai-news",
       storageBucket: "pulse-ai-news.appspot.com",
       messagingSenderId: "...",
       appId: "..."
     };
     ```
   * Open `frontend/src/firebase.js` in your text editor and paste these values into the `firebaseConfig` placeholder. The web app will now fetch articles from your live database!

4. **Generate Admin Service Account Key (For the Scraper)**:
   * Still in **Project settings**, navigate to the **Service accounts** tab.
   * Click **Generate new private key** -> **Generate key**.
   * A `.json` file will download to your computer.
   * Rename this file to `service-account.json` and move it into the `automation/` folder of this project.
   * *⚠️ Safety Reminder: This file contains admin credentials. Do not upload it to GitHub. It is already added to `.gitignore`.*

---

### Phase 3: Gemini API Key Setup

1. **Obtain API Key**:
   * Open [Google AI Studio](https://aistudio.google.com/) and sign in with your Google account.
   * Click **Get API key** (top left).
   * Click **Create API key** and select your Firebase project or create a new key.
   * Copy the API key.

2. **Local Scraper Configuration**:
   * Create a file named `.env` in the `automation/` folder.
   * Add the following line:
     ```env
     GEMINI_API_KEY=your_copied_api_key
     ```
   * If you run `node index.js` now, the scraper will use the real Gemini API to scrape, write, and save live articles to your Firestore database!

---

### Phase 4: Setting Up Hourly Automation (GitHub Actions)

To run the scraper 24/7 in the cloud without leaving your computer on:

1. Create a GitHub repository and push this codebase to it.
2. In your GitHub Repository, navigate to **Settings** -> **Secrets and variables** -> **Actions**.
3. Click **New repository secret** and add:
   * **Name**: `GEMINI_API_KEY`
   * **Value**: *Your Gemini API key*
4. Click **New repository secret** again and add:
   * **Name**: `FIREBASE_SERVICE_ACCOUNT`
   * **Value**: *Paste the entire contents of the `service-account.json` file (the raw JSON string)*

GitHub Actions will now automatically run the scraper in the background at the start of every hour! You can also manually trigger it by going to the **Actions** tab in your repository, selecting the **Hourly News Scraper** workflow, and clicking **Run workflow**.

---

### Phase 5: Build and Deploy Frontend Website

To compile the React frontend and deploy it to Firebase Hosting:

1. Install the Firebase CLI globally if you haven't already:
   ```bash
   npm install -g firebase-tools
   ```
2. Log in using your Google account:
   ```bash
   firebase login
   ```
3. Initialize hosting links (in the project root):
   ```bash
   firebase use --add [your-firebase-project-id]
   ```
4. Build the web app and deploy:
   ```bash
   # Build React site
   cd frontend
   npm run build
   
   # Deploy site and security rules
   cd ..
   firebase deploy
   ```
Your website is now live at `https://[your-project-id].web.app`!

---

## 🛠️ Configuration & Source Customization

To add your own news websites or RSS feeds to monitor, open `automation/config.js` and edit the `FEEDS` array:

```javascript
export const FEEDS = [
  {
    name: "TechCrunch",
    url: "https://techcrunch.com/feed/",
    category: "Technology"
  },
  // Add your own below:
  {
    name: "BBC Technology",
    url: "http://feeds.bbci.co.uk/news/technology/rss.xml",
    category: "Technology"
  }
];
```

You can customize categories, execution limits (`maxArticlesPerRun`), and article expiration thresholds (`maxAgeHours`) in the same config file.
