import fs from 'fs';
import path from 'path';
import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Firebase Admin
let db = null;
try {
  let serviceAccount = null;
  
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } else if (fs.existsSync('./service-account.json')) {
    serviceAccount = JSON.parse(fs.readFileSync('./service-account.json', 'utf8'));
  }

  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    db = admin.firestore();
    console.log("🔥 [Prerender] Connected to Firebase Firestore successfully.");
  } else {
    console.log("⚠️ [Prerender] No Firebase credentials found. Prerendering cannot connect to database.");
    process.exit(1);
  }
} catch (error) {
  console.error("❌ [Prerender] Error initializing Firebase:", error.message);
  process.exit(1);
}

async function runPrerender() {
  try {
    // 1. Fetch latest 50 articles from Firestore
    console.log("📡 Fetching latest 50 articles from Firestore...");
    const snapshot = await db.collection("articles")
      .orderBy("scrapedAt", "desc")
      .limit(50)
      .get();
      
    if (snapshot.empty) {
      console.log("⚠️ No articles found in database. Exiting.");
      process.exit(0);
    }
    
    console.log(`🔍 Found ${snapshot.size} articles to pre-render.`);
    
    // 2. Resolve public folders
    const publicDir = path.resolve('../frontend/public');
    const articleDir = path.join(publicDir, 'article');
    
    // Create folders if they do not exist
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    if (fs.existsSync(articleDir)) {
      // Clear out old files to keep directory fresh
      const files = fs.readdirSync(articleDir);
      for (const file of files) {
        fs.unlinkSync(path.join(articleDir, file));
      }
    } else {
      fs.mkdirSync(articleDir, { recursive: true });
    }
    
    const sitemapUrls = [];
    const nowStr = new Date().toISOString().substring(0, 10);
    
    // Add main homepage to sitemap
    sitemapUrls.push(`  <url>
    <loc>https://news-b5c94.web.app/</loc>
    <lastmod>${nowStr}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>1.0</priority>
  </url>`);
    
    // 3. Generate HTML page for each article
    snapshot.forEach(doc => {
      const articleId = doc.id;
      const article = doc.data();
      
      const cleanTitle = (article.title || '').replace(/"/g, '&quot;');
      const cleanSummary = (article.summary || '').replace(/"/g, '&quot;');
      
      const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>\${cleanTitle} | PulseAI News</title>
  <meta name="description" content="\${cleanSummary}">
  <link rel="canonical" href="https://news-b5c94.web.app/article/\${articleId}">
  
  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="article">
  <meta property="og:url" content="https://news-b5c94.web.app/article/${articleId}">
  <meta property="og:title" content="${cleanTitle}">
  <meta property="og:description" content="${cleanSummary}">
  <meta property="og:image" content="${article.imageUrl || 'https://news-b5c94.web.app/default-image.png'}">

  <!-- Twitter -->
  <meta property="twitter:card" content="summary_large_image">
  <meta property="twitter:url" content="https://news-b5c94.web.app/article/${articleId}">
  <meta property="twitter:title" content="${cleanTitle}">
  <meta property="twitter:description" content="${cleanSummary}">
  <meta property="twitter:image" content="${article.imageUrl || 'https://news-b5c94.web.app/default-image.png'}">

  <!-- Structured Data NewsArticle JSON-LD -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "headline": ${JSON.stringify(article.title || "")},
    "image": [
      ${JSON.stringify(article.imageUrl || "https://news-b5c94.web.app/default-image.png")}
    ],
    "datePublished": ${JSON.stringify(article.publishedAtDate || article.scrapedAt || "")},
    "dateModified": ${JSON.stringify(article.scrapedAt || "")},
    "author": [{
      "@type": "Person",
      "name": "Gemini AI News Editor",
      "url": "https://news-b5c94.web.app"
    }],
    "publisher": {
      "@type": "Organization",
      "name": "PulseAI",
      "logo": {
        "@type": "ImageObject",
        "url": "https://news-b5c94.web.app/logo.png"
      }
    },
    "description": ${JSON.stringify(article.summary || "")},
    "articleBody": ${JSON.stringify(article.content || "")}
  }
  </script>
  
  <script>
    // Redirect human readers to deep-link in SPA
    window.location.replace("/#article-${articleId}");
  </script>
</head>
<body style="font-family: system-ui, sans-serif; background: #0f172a; color: #f1f5f9; padding: 20px; max-width: 800px; margin: 0 auto; line-height: 1.6;">
  <header style="margin-bottom: 30px; border-bottom: 1px solid #334155; padding-bottom: 20px;">
    <a href="/" style="color: #3b82f6; text-decoration: none; font-weight: bold; font-size: 1.5rem;">PulseAI</a>
  </header>
  <main>
    <article>
      <header style="margin-bottom: 20px;">
        <span style="background: #1e293b; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; color: #94a3b8; text-transform: uppercase; font-weight: bold;">${article.category || "General"}</span>
        <h1 style="font-size: 2rem; margin-top: 15px; margin-bottom: 10px; font-family: Georgia, serif;">${article.title}</h1>
        <p style="color: #94a3b8; font-size: 0.9rem; margin: 0;">Source: <strong>${article.sourceName || "Independent"}</strong> | Published: ${article.publishedAtDate || article.scrapedAt}</p>
      </header>
      ${article.imageUrl ? `<img src="${article.imageUrl}" alt="${cleanTitle}" style="width: 100%; max-height: 400px; object-fit: cover; border-radius: 8px; margin: 20px 0; border: 1px solid #334155;" />` : ''}
      <section style="font-size: 1.1rem; margin-top: 20px;">
        <p style="font-style: italic; color: #cbd5e1; background: #1e293b; padding: 15px; border-radius: 6px; border-left: 4px solid #3b82f6;"><strong>AI Synopsis:</strong> ${article.summary}</p>
        <hr style="border: 0; border-top: 1px solid #334155; margin: 20px 0;" />
        ${(article.content || '').split('\n\n').map(p => `<p style="margin-bottom: 1.5em;">${p}</p>`).join('')}
      </section>
    </article>
  </main>
</body>
</html>`;

      // Save static HTML file
      fs.writeFileSync(path.join(articleDir, `${articleId}.html`), htmlContent);
      
      // Add article URL to sitemap
      const articleDate = (article.scrapedAt || nowStr).substring(0, 10);
      sitemapUrls.push(`  <url>
    <loc>https://news-b5c94.web.app/article/${articleId}</loc>
    <lastmod>${articleDate}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`);
    });
    
    // 4. Generate dynamic sitemap.xml
    const sitemapContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls.join('\n')}
</urlset>`;

    fs.writeFileSync(path.join(publicDir, 'sitemap.xml'), sitemapContent);
    console.log(`✅ [Prerender] Successfully pre-rendered ${snapshot.size} articles and generated sitemap.xml.`);
    process.exit(0);
  } catch (err) {
    console.error("❌ [Prerender] Fatal error during pre-render run:", err.message);
    process.exit(1);
  }
}

runPrerender();
