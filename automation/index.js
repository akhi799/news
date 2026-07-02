import fs from 'fs';
import path from 'path';
import Parser from 'rss-parser';
import axios from 'axios';
import * as cheerio from 'cheerio';
import admin from 'firebase-admin';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { FEEDS, CATEGORIES, CONFIG } from './config.js';

dotenv.config();

const parser = new Parser({
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
});

// Initialize Gemini API
const geminiApiKey = process.env.GEMINI_API_KEY;
let ai = null;
if (geminiApiKey) {
  ai = new GoogleGenAI({ apiKey: geminiApiKey });
} else {
  console.log("⚠️ GEMINI_API_KEY not found in environment. Gemini rewriting will be simulated.");
}

// Initialize Firebase Admin
let db = null;
let isDryRun = true;

// Attempt to load Firebase credentials
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
    isDryRun = false;
    console.log("🔥 Connected to Firebase Firestore successfully.");
  } else {
    console.log("⚠️ No Firebase credentials found. Running in DRY-RUN mode (saving to local file).");
  }
} catch (error) {
  console.error("❌ Error initializing Firebase, running in DRY-RUN mode:", error.message);
}

// Clean HTML text helper
function extractArticleText(html) {
  const $ = cheerio.load(html);
  
  // Remove scripts, styles, ads, navigation, etc.
  $('script, style, noscript, iframe, nav, footer, header, head, aside, .advertisement, .comments, .social-share, .related-posts').remove();
  
  // Try to find main article container
  let bodyText = "";
  const selectors = [
    'article',
    '.article-content',
    '.entry-content',
    '.post-content',
    '#article-body',
    '.article-body',
    '.story-content',
    'main'
  ];
  
  for (const selector of selectors) {
    const el = $(selector);
    if (el.length > 0) {
      // Extract paragraphs
      const paragraphs = el.find('p').map((i, el) => $(el).text().trim()).get();
      bodyText = paragraphs.filter(p => p.length > 20).join('\n\n');
      if (bodyText.length > 300) break;
    }
  }
  
  // Fallback if container selector didn't find enough text
  if (bodyText.length < 300) {
    const paragraphs = $('p').map((i, el) => $(el).text().trim()).get();
    bodyText = paragraphs.filter(p => p.length > 20).join('\n\n');
  }
  
  return bodyText.substring(0, 10000); // limit to 10k chars to stay safe on token usage
}

// Helper: Clean title for comparison
function cleanTitleForComparison(title) {
  if (!title) return [];
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 3);
}

// Helper: Check if titles have high word overlap (duplication check)
function hasHighWordOverlap(titleA, titleB) {
  const wordsA = cleanTitleForComparison(titleA);
  const wordsB = cleanTitleForComparison(titleB);
  if (wordsA.length === 0 || wordsB.length === 0) return false;

  const setB = new Set(wordsB);
  let matchCount = 0;
  for (const word of wordsA) {
    if (setB.has(word)) {
      matchCount++;
    }
  }
  const minWords = Math.min(wordsA.length, wordsB.length);
  const overlapRatio = matchCount / minWords;
  return matchCount >= 3 && overlapRatio > 0.4;
}

// Helper: Extract images from RSS item fields
function extractImageFromRssItem(item) {
  if (item.enclosure && item.enclosure.url && item.enclosure.type && item.enclosure.type.startsWith('image/')) {
    return item.enclosure.url;
  }
  if (item.enclosure && item.enclosure.url && (item.enclosure.url.endsWith('.jpg') || item.enclosure.url.endsWith('.jpeg') || item.enclosure.url.endsWith('.png') || item.enclosure.url.endsWith('.webp'))) {
    return item.enclosure.url;
  }
  const mediaContent = item['media:content'] || item.mediaContent;
  if (mediaContent) {
    if (mediaContent.$ && mediaContent.$.url) return mediaContent.$.url;
    if (mediaContent.url) return mediaContent.url;
    if (Array.isArray(mediaContent) && mediaContent.length > 0) {
      const first = mediaContent[0];
      if (first.$ && first.$.url) return first.$.url;
      if (first.url) return first.url;
    }
  }
  const searchHtml = item.content || item.description || "";
  if (searchHtml) {
    const match = searchHtml.match(/<img[^>]+src="([^">]+)"/i);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

// Helper: Extract Open Graph image from article page HTML
function extractOgImage(html) {
  const $ = cheerio.load(html);
  const ogImage = $('meta[property="og:image"]').attr('content') ||
                  $('meta[name="twitter:image"]').attr('content') ||
                  $('meta[property="og:image:url"]').attr('content');
  if (ogImage && ogImage.startsWith('http')) {
    return ogImage;
  }
  return null;
}

// Helper: Fetch Google Daily Trends keywords
async function fetchGoogleTrends() {
  console.log("📡 Fetching Google Daily Trends RSS...");
  try {
    const feed = await parser.parseURL('https://trends.google.com/trending/rss?geo=IN');
    const keywords = [];
    feed.items.forEach(item => {
      if (item.title) {
        keywords.push(item.title.toLowerCase().trim());
      }
    });
    console.log(`🔥 Loaded ${keywords.length} trending keywords from Google Trends.`);
    return keywords;
  } catch (err) {
    console.error("❌ Failed to fetch Google Trends:", err.message);
    return [];
  }
}

// Helper: Check if article overlaps with trending keywords
function checkIsTrending(title, keywords) {
  return !!getMatchingKeyword(title, keywords);
}

// Helper: Extract matching keyword phrase
function getMatchingKeyword(title, keywords) {
  if (!keywords || keywords.length === 0 || !title) return null;
  const combinedText = title.toLowerCase();
  
  for (const keyword of keywords) {
    if (combinedText.includes(keyword)) return keyword;
    
    // Check if individual words of keyword (longer than 3 chars) all match
    const keywordWords = keyword.split(/\s+/).filter(w => w.length > 3);
    if (keywordWords.length > 0 && keywordWords.every(word => combinedText.includes(word))) {
      return keyword;
    }
  }
  return null;
}

// Helper: Cleanup Firestore documents older than 30 days
// Helper: Delete articles and their comments subcollections cascaded
async function deleteArticlesCascade(articlesSnapshot) {
  if (articlesSnapshot.empty) return;
  
  let batch = db.batch();
  let opCount = 0;
  
  for (const doc of articlesSnapshot.docs) {
    // Fetch and delete comments in subcollection
    const commentsSnapshot = await doc.ref.collection('comments').get();
    for (const commentDoc of commentsSnapshot.docs) {
      batch.delete(commentDoc.ref);
      opCount++;
      if (opCount >= 400) {
        await batch.commit();
        batch = db.batch();
        opCount = 0;
      }
    }
    
    // Delete the article document itself
    batch.delete(doc.ref);
    opCount++;
    if (opCount >= 400) {
      await batch.commit();
      batch = db.batch();
      opCount = 0;
    }
  }
  
  if (opCount > 0) {
    await batch.commit();
  }
}

// Helper: Cleanup Firestore documents older than 30 days
async function deleteOldArticles() {
  if (isDryRun) {
    console.log("🧹 [Dry Run] Skipping old articles pruning.");
    return;
  }
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    console.log(`🧹 Running cleanup: looking for articles older than ${thirtyDaysAgo.toISOString()}...`);
    const snapshot = await db.collection(CONFIG.firestoreCollection)
      .where('scrapedAt', '<', thirtyDaysAgo.toISOString())
      .get();
      
    if (!snapshot.empty) {
      console.log(`🧹 Found ${snapshot.size} articles older than 30 days. Deleting (with comments subcollections)...`);
      await deleteArticlesCascade(snapshot);
      console.log("🧹 30-day age articles pruning complete.");
    } else {
      console.log("🧹 No expired articles found by age.");
    }

    // Ceil check: enforce 1,000 documents limit to guarantee size is under 1 GB
    const countSnapshot = await db.collection(CONFIG.firestoreCollection).count().get();
    const totalCount = countSnapshot.data().count;
    console.log(`📊 Total articles in database: ${totalCount}`);
    
    if (totalCount > 1000) {
      const excessCount = totalCount - 1000;
      console.log(`🧹 Database exceeds 1000 ceiling. Deleting ${excessCount} oldest articles (with comments subcollections)...`);
      
      const excessSnapshot = await db.collection(CONFIG.firestoreCollection)
        .orderBy('scrapedAt', 'asc')
        .limit(excessCount)
        .get();
        
      await deleteArticlesCascade(excessSnapshot);
      console.log(`🧹 Successfully pruned ${excessCount} excess articles.`);
    }
  } catch (error) {
    console.error("❌ Pruning error:", error.message);
  }
}

// Helper: Run weekly telemetry cleanup for visitor coordinates and user profiles
async function pruneTelemetryWeekly() {
  if (isDryRun) {
    console.log("🧹 [Dry Run] Skipping weekly telemetry pruning.");
    return;
  }
  
  try {
    const cleanupRef = db.collection('stats').doc('cleanup');
    const cleanupSnap = await cleanupRef.get();
    const now = new Date();
    
    let shouldRun = false;
    if (!cleanupSnap.exists) {
      shouldRun = true;
    } else {
      const lastRunStr = cleanupSnap.data().lastRunAt;
      if (lastRunStr) {
        const lastRun = new Date(lastRunStr);
        const diffDays = (now - lastRun) / (1000 * 60 * 60 * 24);
        if (diffDays >= 7) {
          shouldRun = true;
        }
      } else {
        shouldRun = true;
      }
    }
    
    if (!shouldRun) {
      console.log("🧹 Weekly telemetry pruning is up-to-date. Next check in a few days.");
      return;
    }
    
    console.log("🧹 Starting weekly telemetry database pruning...");
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString();
    
    // 1. Prune old visitor locations (limit to 400 per run to stay safe under 500 batch operations limit)
    const visitorSnap = await db.collection('visitor_locations')
      .where('scrapedAt', '<', thirtyDaysAgoStr)
      .limit(400)
      .get();
      
    if (!visitorSnap.empty) {
      console.log(`🧹 Found ${visitorSnap.size} visitor logs older than 30 days. Deleting...`);
      const batch = db.batch();
      visitorSnap.forEach(doc => {
        batch.delete(doc.ref);
      });
      await batch.commit();
      console.log(`🧹 Pruned ${visitorSnap.size} visitor logs.`);
    } else {
      console.log("🧹 No expired visitor logs found.");
    }
    
    // 2. Prune old user telemetry profiles
    const telemetrySnap = await db.collection('user_telemetry')
      .where('lastUpdatedAt', '<', thirtyDaysAgoStr)
      .limit(400)
      .get();
      
    if (!telemetrySnap.empty) {
      console.log(`🧹 Found ${telemetrySnap.size} user telemetry profiles older than 30 days. Deleting...`);
      const batch = db.batch();
      telemetrySnap.forEach(doc => {
        batch.delete(doc.ref);
      });
      await batch.commit();
      console.log(`🧹 Pruned ${telemetrySnap.size} user telemetry profiles.`);
    } else {
      console.log("🧹 No expired user telemetry profiles found.");
    }

    // 3. Prune old suggestions (older than 60 days)
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const sixtyDaysAgoStr = sixtyDaysAgo.toISOString();
    
    const suggestionsSnap = await db.collection('suggestions')
      .where('createdAt', '<', sixtyDaysAgoStr)
      .limit(400)
      .get();
      
    if (!suggestionsSnap.empty) {
      console.log(`🧹 Found ${suggestionsSnap.size} suggestions older than 60 days. Deleting...`);
      const batch = db.batch();
      suggestionsSnap.forEach(doc => {
        batch.delete(doc.ref);
      });
      await batch.commit();
      console.log(`🧹 Pruned ${suggestionsSnap.size} suggestions.`);
    } else {
      console.log("🧹 No expired suggestions found.");
    }

    // 4. Enforce suggestions ceiling of 300 suggestions max
    const suggCountSnap = await db.collection('suggestions').count().get();
    const suggCount = suggCountSnap.data().count;
    if (suggCount > 300) {
      const excessSugg = suggCount - 300;
      console.log(`🧹 Suggestions count (${suggCount}) exceeds 300 ceiling. Deleting ${excessSugg} oldest suggestions...`);
      const excessSuggSnap = await db.collection('suggestions')
        .orderBy('createdAt', 'asc')
        .limit(excessSugg)
        .get();
        
      const batch = db.batch();
      excessSuggSnap.forEach(doc => {
        batch.delete(doc.ref);
      });
      await batch.commit();
      console.log(`🧹 Pruned ${excessSugg} excess suggestions.`);
    }
    
    // Update cleanup metadata doc
    await cleanupRef.set({ lastRunAt: now.toISOString() }, { merge: true });
    console.log("🧹 Weekly telemetry pruning complete.");
    
  } catch (error) {
    console.error("❌ Telemetry pruning error:", error.message);
  }
}



// Check if article url is already in DB
async function isArticleProcessed(url) {
  if (isDryRun) {
    if (fs.existsSync('./articles_dry_run.json')) {
      const data = JSON.parse(fs.readFileSync('./articles_dry_run.json', 'utf8'));
      return data.some(art => art.sourceUrl === url);
    }
    return false;
  }
  
  try {
    const snapshot = await db.collection(CONFIG.firestoreCollection)
      .where('sourceUrl', '==', url)
      .limit(1)
      .get();
    return !snapshot.empty;
  } catch (error) {
    console.error(`Error checking URL in Firestore: ${error.message}`);
    return false;
  }
}

// Search the web for a news video report matching the rewritten headline
async function findVideoForArticle(title, modelName) {
  try {
    console.log(`   [AI Video Search] Searching for news coverage video using model: ${modelName}...`);
    const prompt = `
      Search the web for a relevant, publicly accessible news video report, broadcast, or social media post (from YouTube, Twitter/X, Instagram, or TikTok) that covers this news event: "${title}".
      
      You must respond with a JSON object. Do not output any other text or markdown codeblocks (like \`\`\`json). Just return a raw JSON string matching this structure exactly:
      {
        "url": "direct URL to the video, or empty string if none found",
        "platform": "youtube" | "twitter" | "instagram" | "tiktok" | "none",
        "embedUrl": "clean youtube embed URL (e.g. https://www.youtube.com/embed/VIDEO_ID) if platform is youtube, or empty string if not applicable"
      }
      
      If no relevant video report is found, set platform to "none", and url and embedUrl to empty strings.
    `;

    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        // We do NOT use responseMimeType: 'application/json' here to avoid 400 bad request conflicts with search grounding
        tools: [{ googleSearch: {} }]
      }
    });

    let text = response.text ? response.text.trim() : "";
    
    // Clean markdown blocks if the model wrapped it
    if (text.startsWith("```json")) {
      text = text.substring(7);
    } else if (text.startsWith("```")) {
      text = text.substring(3);
    }
    if (text.endsWith("```")) {
      text = text.substring(0, text.length - 3);
    }
    text = text.trim();

    try {
      const videoObj = JSON.parse(text);
      return {
        url: videoObj.url || "",
        platform: videoObj.platform || "none",
        embedUrl: videoObj.embedUrl || ""
      };
    } catch (parseErr) {
      console.warn(`   ⚠️ [AI Video Search] JSON parse failed on text: "${text}". Error: ${parseErr.message}`);
      return { url: "", platform: "none", embedUrl: "" };
    }
  } catch (err) {
    console.warn(`   ⚠️ [AI Video Search] Failed to find video report: ${err.message}`);
    return { url: "", platform: "none", embedUrl: "" };
  }
}

// Call Gemini to process and rewrite the article (uses model fallback & purpose-specific selection)
async function processArticleWithAI(title, originalContent, defaultCategory, isTrending = false, matchedKeyword = null) {
  if (!ai) {
    // Simulated AI response for testing when API key is missing
    console.log(`🤖 [Simulated AI] Rewriting: "${title}"`);
    return {
      title: `[Rewritten] ${title}`,
      summary: `A simulated summary of the article talking about "${title.substring(0, 40)}...".`,
      content: `This is simulated rewritten article content for "${title}".\n\nOriginal content summary length was ${originalContent.length} characters. This placeholder is generated because no GEMINI_API_KEY was provided in your environment. Setting up the Gemini API key will enable fully automated, highly detailed news rewrites.`,
      category: defaultCategory || "Other",
      sentiment: "neutral",
      readingTime: 2,
      video: {
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        platform: "youtube",
        embedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ"
      }
    };
  }

  let seoInstruction = "";
  if (matchedKeyword) {
    seoInstruction = `
    SEO KEYWORD OPTIMIZATION INSTRUCTION:
    This news event matches the trending search keyword/topic: "${matchedKeyword}".
    You MUST naturally integrate the exact phrase "${matchedKeyword}" (or highly relevant search query variants) into the rewritten headline (title), the summary description, and the body text.
    Ensure the keyword integration flows naturally in a high-quality journalistic format. This helps search crawlers identify this page as highly relevant to searchers querying "${matchedKeyword}".
    `;
  }

  const prompt = `
    You are an expert news editor. You are given a raw news article's title and its full body content.
    ${seoInstruction}
    
    Below is an article scraped from the web:
    Original Title: "${title}"
    Original Content:
    ---
    ${originalContent}
    ---

    Task:
    1. Create a catchy, original, and highly engaging news title (distinct from the original, do not plagiarize).
    2. Write a concise, 1-2 sentence punchy summary of the article.
    3. Rewrite the entire article body to be highly professional, informative, and cohesive. It must be written from scratch, in your own words, maintaining the factual accuracy of the source but presenting it in an editorial format. Structure it with paragraph breaks. Ensure it reads like high-quality news.
    4. Categorize this article into one of the following categories: ${CATEGORIES.join(', ')}.
    5. Analyze the overall sentiment of the article (positive, neutral, negative).
    6. Estimate the reading time in minutes (assuming 200 words per minute).
  `;

  // Schema for content rewriting (strict JSON model constraint, no tools)
  const responseSchema = {
    type: 'OBJECT',
    properties: {
      title: { type: 'STRING', description: 'Catchy, rewritten headline' },
      summary: { type: 'STRING', description: '1-2 sentence summary' },
      content: { type: 'STRING', description: 'Fully rewritten news article body' },
      category: { type: 'STRING', enum: CATEGORIES, description: 'Category matching one of the allowed categories' },
      sentiment: { type: 'STRING', enum: ['positive', 'neutral', 'negative'], description: 'Overall article sentiment' },
      readingTime: { type: 'INTEGER', description: 'Estimated read time in minutes' }
    },
    required: ['title', 'summary', 'content', 'category', 'sentiment', 'readingTime']
  };

  // Define models by priority and capacity
  // 2.5-flash and 3.5-flash are newer stable models. 1.5 versions are kept as fallbacks.
  const trendingModels = [
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-3.5-flash',
    'gemini-1.5-pro',
    'gemini-1.5-flash'
  ];
  const standardModels = [
    'gemini-2.5-flash',
    'gemini-3.5-flash',
    'gemini-2.5-pro',
    'gemini-1.5-flash',
    'gemini-1.5-pro'
  ];

  const modelsToTry = isTrending ? trendingModels : standardModels;
  let lastError = null;

  for (const modelName of modelsToTry) {
    try {
      console.log(`   [AI Model] Querying model: ${modelName} (Trending: ${isTrending})...`);
      
      // Step 1: Strict JSON Schema content rewrite (No search tool conflicts)
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: responseSchema
        }
      });
      
      const responseText = response.text;
      const parsedContent = JSON.parse(responseText);
      
      // Step 2: Grounded Google Search video lookups (using search tool, no schema conflicts)
      let videoObj = { url: "", platform: "none", embedUrl: "" };
      try {
        videoObj = await findVideoForArticle(parsedContent.title || title, modelName);
      } catch (videoErr) {
        console.warn(`   ⚠️ Video search failed on model ${modelName}:`, videoErr.message);
      }

      const mergedResult = {
        ...parsedContent,
        video: videoObj
      };

      lastError = null; // Reset error on success
      return mergedResult;
    } catch (err) {
      lastError = err;
      const errStr = err.message || "";
      const isQuotaError = errStr.includes('429') || errStr.toLowerCase().includes('quota') || errStr.includes('RESOURCE_EXHAUSTED');
      
      console.warn(`   ⚠️ Model ${modelName} failed to process: ${errStr}`);
      
      if (isQuotaError) {
        console.warn(`   ⚠️ Model ${modelName} hit quota limit. Retrying with next available model...`);
        // Wait a short bit before retrying
        await new Promise(resolve => setTimeout(resolve, 1500));
      } else {
        // Wait a small delay for other non-quota errors
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      continue;
    }
  }

  if (lastError) {
    console.error(`❌ All models failed to process article: ${lastError.message}`);
    throw lastError;
  }
}

// Save article to Firestore or dry-run file
async function saveArticle(article) {
  if (isDryRun) {
    let list = [];
    if (fs.existsSync('./articles_dry_run.json')) {
      list = JSON.parse(fs.readFileSync('./articles_dry_run.json', 'utf8'));
    }
    list.unshift(article); // Add new articles to the front
    fs.writeFileSync('./articles_dry_run.json', JSON.stringify(list, null, 2));
    console.log(`💾 Saved article (Dry Run): "${article.title}" to articles_dry_run.json`);
    return;
  }

  try {
    const docRef = await db.collection(CONFIG.firestoreCollection).add({
      ...article,
      publishedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`🔥 Uploaded article to Firestore: "${article.title}" (ID: ${docRef.id})`);
  } catch (error) {
    console.error(`❌ Firestore upload error: ${error.message}`);
  }
}

// Main job run
async function run() {
  console.log("⚡ Starting news monitoring job...");
  console.log(`📅 Current local time: ${new Date().toISOString()}`);
  
  // Query and log supported models from API key for easier remote debugging
  if (ai) {
    try {
      const modelsResponse = await ai.models.list();
      const modelList = Array.isArray(modelsResponse) ? modelsResponse : (modelsResponse.models || []);
      const modelNames = modelList.map(m => m.name.replace('models/', ''));
      console.log(`📡 Supported models from Gemini API Key: ${modelNames.join(', ')}`);
    } catch (err) {
      console.warn(`⚠️ Could not query supported models list: ${err.message}`);
    }
  }
  
  // Load recent articles for title similarity check (deduplication)
  const recentArticles = [];
  if (!isDryRun) {
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const snapshot = await db.collection(CONFIG.firestoreCollection)
        .where('publishedAtDate', '>=', oneDayAgo.toISOString())
        .get();
      snapshot.forEach(doc => {
        recentArticles.push(doc.data());
      });
      console.log(`Loaded ${recentArticles.length} recent articles from Firestore for deduplication.`);
    } catch (err) {
      console.error("Error loading recent articles:", err.message);
    }
  } else if (fs.existsSync('./articles_dry_run.json')) {
    try {
      const data = JSON.parse(fs.readFileSync('./articles_dry_run.json', 'utf8'));
      recentArticles.push(...data);
      console.log(`Loaded ${recentArticles.length} recent articles from articles_dry_run.json for deduplication.`);
    } catch (err) {}
  }

  // Load Google Daily Trends keywords
  const trendingKeywords = await fetchGoogleTrends();

  const newArticles = [];
  
  for (const feed of FEEDS) {
    console.log(`📡 Parsing feed: ${feed.name} (${feed.url})...`);
    try {
      const feedData = await parser.parseURL(feed.url);
      console.log(`Found ${feedData.items.length} items in feed.`);
      
      const now = new Date();
      
      for (const item of feedData.items) {
        // Validate URL
        if (!item.link) continue;
        
        // Age validation
        const pubDate = item.pubDate ? new Date(item.pubDate) : now;
        const ageHours = (now - pubDate) / (1000 * 60 * 60);
        if (ageHours > CONFIG.maxAgeHours) {
          continue; // skip old news
        }
        
        // Duplication validation
        const alreadyProcessed = await isArticleProcessed(item.link);
        if (alreadyProcessed) {
          continue; // skip already indexed
        }

        const matchedKeyword = getMatchingKeyword(item.title, trendingKeywords);
        const isTrending = !!matchedKeyword;
        if (isTrending) {
          console.log(`🔥 Article matched trending keyword "${matchedKeyword}": "${item.title}"`);
        }
        
        newArticles.push({
          originalTitle: item.title,
          sourceUrl: item.link,
          sourceName: feed.name,
          defaultCategory: feed.category,
          pubDate: pubDate,
          rawItem: item,
          isTrending: isTrending,
          matchedKeyword: matchedKeyword || null
        });
      }
    } catch (error) {
      console.error(`❌ Error reading feed ${feed.name}: ${error.message}`);
    }
  }
  
  console.log(`🔍 Found ${newArticles.length} new articles to process.`);
  
  // Shuffle the candidate articles array so that feeds at the beginning of the configuration
  // do not always crowd out and dominate feeds at the end. This guarantees a healthy mix of sources.
  for (let i = newArticles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArticles[i], newArticles[j]] = [newArticles[j], newArticles[i]];
  }

  // Deduplicate candidates against each other and against database
  const uniqueCandidates = [];
  for (const candidate of newArticles) {
    let isDuplicate = false;
    // Compare with database recent articles
    for (const recent of recentArticles) {
      if (hasHighWordOverlap(candidate.originalTitle, recent.originalTitle || recent.title)) {
        isDuplicate = true;
        console.log(`⚠️ Skipping duplicate title (vs database): "${candidate.originalTitle}" matches "${recent.originalTitle || recent.title}"`);
        break;
      }
    }
    if (isDuplicate) continue;

    // Compare with candidates we have already accepted in this run
    for (const accepted of uniqueCandidates) {
      if (hasHighWordOverlap(candidate.originalTitle, accepted.originalTitle)) {
        isDuplicate = true;
        console.log(`⚠️ Skipping duplicate title (vs accepted candidate): "${candidate.originalTitle}" matches "${accepted.originalTitle}"`);
        break;
      }
    }
    if (isDuplicate) continue;

    uniqueCandidates.push(candidate);
  }
  
  // Slice to max allowed articles per run to avoid spamming/limit API costs
  const articlesToProcess = uniqueCandidates.slice(0, CONFIG.maxArticlesPerRun);
  
  if (articlesToProcess.length === 0) {
    console.log("✅ No new articles to process. Job finished.");
    return;
  }
  
  console.log(`🚀 Processing top ${articlesToProcess.length} articles...`);
  
  for (const candidate of articlesToProcess) {
    console.log(`\n📄 Crawling: "${candidate.originalTitle}" (${candidate.sourceUrl})`);
    
    try {
      // 1. Fetch full page HTML
      const response = await axios.get(candidate.sourceUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"Windows"',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Upgrade-Insecure-Requests': '1'
        },
        timeout: 10000
      });
      
      // 2. Extract core text
      const articleText = extractArticleText(response.data);
      if (articleText.length < 150) {
        console.log("⚠️ Extracted text is too short. Skipping article.");
        continue;
      }
      
      // Extract image URL from RSS enclosure or OG tags
      const imageUrl = extractImageFromRssItem(candidate.rawItem) || extractOgImage(response.data);
      if (imageUrl) {
        console.log(`   Discovered article image URL: ${imageUrl}`);
      }
      
      console.log(`   Fetched body (${articleText.length} characters). Rewriting with Gemini...`);
      
      // 3. Process with Gemini
      const processed = await processArticleWithAI(
        candidate.originalTitle,
        articleText,
        candidate.defaultCategory,
        candidate.isTrending,
        candidate.matchedKeyword
      );
      
      // 4. Save to Firestore (or local file)
      const articleObject = {
        title: processed.title,
        summary: processed.summary,
        content: processed.content,
        category: processed.category,
        sentiment: processed.sentiment,
        readingTime: processed.readingTime,
        sourceName: candidate.sourceName,
        sourceUrl: candidate.sourceUrl,
        originalTitle: candidate.originalTitle,
        imageUrl: imageUrl || null,
        video: processed.video || null,
        isTrending: candidate.isTrending || false,
        scrapedAt: new Date().toISOString(),
        publishedAtDate: candidate.pubDate.toISOString()
      };
      
      await saveArticle(articleObject);
      
      // Wait a bit to avoid hitting rate limits too quickly (free tier limit: 5 requests per minute, so 12.5s delay)
      await new Promise(resolve => setTimeout(resolve, 12500));
      
    } catch (error) {
      console.error(`❌ Failed to process article "${candidate.originalTitle}": ${error.message}`);
    }
  }

  // Cleanup old articles older than 30 days and enforce hard cap
  await deleteOldArticles();

  // Run weekly telemetry cleanup
  await pruneTelemetryWeekly();
  
  console.log("\n🏁 News monitoring job finished.");
  process.exit(0);
}

run().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
