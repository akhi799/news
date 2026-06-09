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

// Call Gemini to process and rewrite the article
async function processArticleWithAI(title, originalContent, defaultCategory) {
  if (!ai) {
    // Simulated AI response for testing when API key is missing
    console.log(`🤖 [Simulated AI] Rewriting: "${title}"`);
    return {
      title: `[Rewritten] ${title}`,
      summary: `A simulated summary of the article talking about "${title.substring(0, 40)}...".`,
      content: `This is simulated rewritten article content for "${title}".\n\nOriginal content summary length was ${originalContent.length} characters. This placeholder is generated because no GEMINI_API_KEY was provided in your environment. Setting up the Gemini API key will enable fully automated, highly detailed news rewrites.`,
      category: defaultCategory || "Other",
      sentiment: "neutral",
      readingTime: 2
    };
  }

  const prompt = `
    You are a professional, objective senior news editor for an online publishing company.
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

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
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
        }
      }
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error(`❌ Gemini API Error: ${error.message}`);
    throw error;
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
        
        newArticles.push({
          originalTitle: item.title,
          sourceUrl: item.link,
          sourceName: feed.name,
          defaultCategory: feed.category,
          pubDate: pubDate
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
  
  // Slice to max allowed articles per run to avoid spamming/limit API costs
  const articlesToProcess = newArticles.slice(0, CONFIG.maxArticlesPerRun);
  
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
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        },
        timeout: 10000
      });
      
      // 2. Extract core text
      const articleText = extractArticleText(response.data);
      if (articleText.length < 150) {
        console.log("⚠️ Extracted text is too short. Skipping article.");
        continue;
      }
      
      console.log(`   Fetched body (${articleText.length} characters). Rewriting with Gemini...`);
      
      // 3. Process with Gemini
      const processed = await processArticleWithAI(
        candidate.originalTitle,
        articleText,
        candidate.defaultCategory
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
        scrapedAt: new Date().toISOString(),
        publishedAtDate: candidate.pubDate.toISOString()
      };
      
      await saveArticle(articleObject);
      
      // Wait a bit to avoid hitting rate limits too quickly
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      console.error(`❌ Failed to process article "${candidate.originalTitle}": ${error.message}`);
    }
  }
  
  console.log("\n🏁 News monitoring job finished.");
  process.exit(0);
}

run().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
