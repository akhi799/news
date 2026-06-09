import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Sun, 
  Moon, 
  Clock, 
  ExternalLink, 
  Share2, 
  X, 
  TrendingUp, 
  AlertTriangle, 
  Sparkles,
  ArrowRight,
  RefreshCw,
  Copy,
  Check
} from 'lucide-react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db, isDemoMode } from './firebase';
import { mockArticles } from './mockData';
import { CATEGORIES } from '../../automation/config';

function App() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  const [copied, setCopied] = useState(false);

  // Apply Theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Load Articles
  useEffect(() => {
    setLoading(true);

    if (isDemoMode) {
      // Load Mock Data
      setArticles(mockArticles);
      setLoading(false);
    } else {
      // Connect to Firestore
      try {
        const q = query(
          collection(db, 'articles'), 
          orderBy('scrapedAt', 'desc'), 
          limit(50)
        );
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
          const loadedArticles = [];
          snapshot.forEach((doc) => {
            loadedArticles.push({ id: doc.id, ...doc.data() });
          });
          setArticles(loadedArticles);
          setLoading(false);
        }, (error) => {
          console.error("Firestore loading error:", error);
          // Fallback to mock data if Firestore security rules or connection fails
          setArticles(mockArticles);
          setLoading(false);
        });

        return () => unsubscribe();
      } catch (error) {
        console.error("Firebase setup error:", error);
        setArticles(mockArticles);
        setLoading(false);
      }
    }
  }, []);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const handleLanguageChange = (e) => {
    const lang = e.target.value;
    
    // Set the Google Translate cookie
    document.cookie = `googtrans=/en/${lang}; path=/;`;
    document.cookie = `googtrans=/en/${lang}; path=/; domain=${window.location.hostname};`;
    
    const selectEl = document.querySelector('.goog-te-combo');
    if (selectEl) {
      selectEl.value = lang;
      selectEl.dispatchEvent(new Event('change'));
    } else {
      // Fallback: reload the page to let Google Translate read the cookie on initialization
      window.location.reload();
    }
  };

  // Helper: Format Dates
  const formatArticleDate = (dateVal) => {
    if (!dateVal) return 'Just now';
    
    // Firestore Timestamp check
    if (dateVal.seconds) {
      return new Date(dateVal.seconds * 1000).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
    
    // ISO String check
    return new Date(dateVal).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Helper: Sentiment Label
  const getSentimentDotColor = (sentiment) => {
    switch (sentiment?.toLowerCase()) {
      case 'positive': return 'var(--color-positive)';
      case 'negative': return 'var(--color-negative)';
      default: return 'var(--color-neutral)';
    }
  };

  // Share Article Function
  const handleCopyLink = (article) => {
    navigator.clipboard.writeText(article.sourceUrl || window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Filter Logic
  const filteredArticles = articles.filter(article => {
    const matchesCategory = selectedCategory === 'All' || article.category === selectedCategory;
    const matchesSearch = 
      article.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      article.summary?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      article.content?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="app-container">
      {/* 1. Demo Banner */}
      {isDemoMode && (
        <div className="demo-banner">
          <AlertTriangle size={16} />
          <span>Currently running in <strong>Demo Mode</strong> with mock articles. Connect your Firestore database in <code>src/firebase.js</code>.</span>
          <button className="demo-banner-btn" onClick={() => alert("Please open src/firebase.js and fill out your firebaseConfig config keys.")}>
            How to Connect
          </button>
        </div>
      )}

      {/* 2. Glassmorphic Navigation Header */}
      <header className="nav-header">
        <div className="logo-section" onClick={() => { setSelectedCategory('All'); setSearchQuery(''); }}>
          <div className="logo-pulse"></div>
          <span className="logo-text">PulseAI</span>
        </div>
        
        <div className="search-theme-container">
          <div className="language-selector-wrapper">
            <select className="language-select" onChange={handleLanguageChange} defaultValue="en" title="Translate Page">
              <option value="en">English</option>
              <option value="hi">हिन्दी (Hindi)</option>
              <option value="bn">বাংলা (Bengali)</option>
              <option value="te">తెలుగు (Telugu)</option>
              <option value="ta">தமிழ் (Tamil)</option>
              <option value="mr">मराठी (Marathi)</option>
              <option value="gu">ગુજરાતી (Gujarati)</option>
              <option value="kn">ಕನ್ನಡ (Kannada)</option>
              <option value="ml">മലയാളം (Malayalam)</option>
              <option value="pa">ਪੰਜਾਬੀ (Punjabi)</option>
            </select>
          </div>

          <div className="search-bar">
            <Search size={16} className="search-icon" style={{ color: 'var(--text-muted)' }} />
            <input 
              type="text" 
              placeholder="Search news..." 
              className="search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              id="news-search-input"
            />
          </div>

          <button className="theme-toggle-btn" onClick={toggleTheme} title="Toggle theme">
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>
      </header>

      {/* 3. News Ticker (Trending items scrolling) */}
      {articles.length > 0 && (
        <div className="ticker-container">
          <div className="ticker-title">
            <TrendingUp size={14} /> Trending
          </div>
          <div className="ticker-flow">
            {articles.map((art, idx) => (
              <span key={`tick-${idx}`} className="ticker-item" onClick={() => setSelectedArticle(art)}>
                • {art.title}
              </span>
            ))}
            {/* Duplicate for infinite effect */}
            {articles.map((art, idx) => (
              <span key={`tick-dup-${idx}`} className="ticker-item" onClick={() => setSelectedArticle(art)}>
                • {art.title}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 4. Category Tabs Menu */}
      <div className="category-menu">
        <button 
          className={`category-tab ${selectedCategory === 'All' ? 'active' : ''}`}
          onClick={() => setSelectedCategory('All')}
        >
          All Stories
        </button>
        {CATEGORIES.map((cat) => (
          <button 
            key={cat}
            className={`category-tab ${selectedCategory === cat ? 'active' : ''}`}
            onClick={() => setSelectedCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* 5. Main Content Section */}
      <main className="main-content">
        <div className="section-title-wrapper">
          <h1 className="section-title">
            {selectedCategory === 'All' ? 'Latest Bulletins' : selectedCategory}
          </h1>
          <div className="update-indicator">
            <RefreshCw size={12} className="spin-slow" />
            <span>Updated hourly via AI</span>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px' }}>
            <RefreshCw className="animate-spin" size={32} style={{ color: 'var(--accent-primary)', margin: '0 auto 16px' }} />
            <p style={{ color: 'var(--text-secondary)' }}>Gathering latest stories...</p>
          </div>
        ) : filteredArticles.length === 0 ? (
          <div className="empty-state">
            <AlertTriangle className="empty-icon" size={48} />
            <h3 style={{ marginBottom: '8px', fontFamily: 'var(--font-editorial)', fontSize: '1.5rem' }}>No articles match your search</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>Try looking for a different keyword or selecting another category.</p>
          </div>
        ) : (
          <div className="news-grid">
            {filteredArticles.map((article) => (
              <article 
                key={article.id} 
                className="news-card"
                onClick={() => setSelectedArticle(article)}
              >
                <div>
                  <div className="card-header-info">
                    <span className="card-category">{article.category}</span>
                    <span className={`card-sentiment-badge ${article.sentiment || 'neutral'}`}>
                      <span className="sentiment-dot" style={{ backgroundColor: getSentimentDotColor(article.sentiment) }}></span>
                      {article.sentiment || 'neutral'}
                    </span>
                  </div>
                  
                  <h2 className="card-title">{article.title}</h2>
                  <p className="card-summary">{article.summary}</p>
                </div>
                
                <div className="card-footer">
                  <div className="card-metadata">
                    <span className="card-meta-item">
                      {article.sourceName}
                    </span>
                    <span>•</span>
                    <span className="card-meta-item">
                      {formatArticleDate(article.scrapedAt || article.publishedAt)}
                    </span>
                  </div>
                  
                  <span className="read-more-link">
                    Read <ArrowRight size={14} />
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      {/* 6. Article Details Overlay Modal */}
      {selectedArticle && (
        <div className="modal-overlay" onClick={() => setSelectedArticle(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setSelectedArticle(null)}>
              <X size={20} />
            </button>
            
            <div className="modal-header">
              <div className="modal-tags">
                <span className="modal-category-badge">{selectedArticle.category}</span>
                <span className="modal-source-badge">
                  Source: <strong>{selectedArticle.sourceName}</strong>
                </span>
                <span style={{ color: 'var(--text-muted)' }}>•</span>
                <span style={{ color: 'var(--text-muted)' }}>{formatArticleDate(selectedArticle.scrapedAt || selectedArticle.publishedAt)}</span>
              </div>
              
              <h1 className="modal-title">{selectedArticle.title}</h1>
              
              <div className="modal-meta-info">
                <div className="modal-meta-item">
                  <Clock size={16} />
                  <span>{selectedArticle.readingTime || 3} min read</span>
                </div>
                <div className="modal-meta-item">
                  <span className="sentiment-dot" style={{ width: 8, height: 8, backgroundColor: getSentimentDotColor(selectedArticle.sentiment) }}></span>
                  <span style={{ textTransform: 'capitalize' }}>AI Sentiment: <strong>{selectedArticle.sentiment || 'neutral'}</strong></span>
                </div>
                {selectedArticle.originalTitle && (
                  <div className="modal-meta-item" style={{ width: '100%', fontStyle: 'italic', color: 'var(--text-muted)' }}>
                    Original story: "{selectedArticle.originalTitle}"
                  </div>
                )}
              </div>
            </div>
            
            {/* AI Summary Banner */}
            <div className="ai-summary-box">
              <div className="ai-summary-title">
                <Sparkles size={14} /> AI Synopsis
              </div>
              <p className="ai-summary-text">{selectedArticle.summary}</p>
            </div>
            
            {/* Main Content Body */}
            <div className="modal-article-body">
              {selectedArticle.content.split('\n\n').map((para, pIdx) => (
                <p key={pIdx}>{para}</p>
              ))}
            </div>
            
            {/* Modal Actions */}
            <div className="modal-actions">
              <a 
                href={selectedArticle.sourceUrl} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="original-source-btn"
              >
                Source Coverage <ExternalLink size={16} />
              </a>
              
              <div className="share-section">
                <span>Share Story</span>
                <button 
                  className="share-btn" 
                  onClick={() => handleCopyLink(selectedArticle)} 
                  title="Copy coverage link"
                >
                  {copied ? <Check size={16} style={{ color: 'var(--color-positive)' }} /> : <Copy size={16} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 7. Footer */}
      <footer className="app-footer">
        <div className="footer-logo">PulseAI</div>
        <p className="footer-text">
          Fully automated hourly news synthesis. Powered by Google Gemini & Firebase.
        </p>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          All articles are curated from RSS feeds and rewritten by artificial intelligence. Original coverage links are provided.
        </p>
        <div className="footer-links">
          <a href="#" className="footer-link" onClick={(e) => { e.preventDefault(); alert("PulseAI monitors RSS news feeds, extracts details, rewrites them using Google Gemini 1.5 Flash, and publishes them hourly to Firebase. Designed for 100% zero-cost operation."); }}>How it works</a>
          <span style={{ color: 'var(--card-border)' }}>|</span>
          <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer" className="footer-link">Google AI Studio</a>
          <span style={{ color: 'var(--card-border)' }}>|</span>
          <a href="https://firebase.google.com/" target="_blank" rel="noreferrer" className="footer-link">Firebase Console</a>
        </div>
      </footer>
    </div>
  );
}

export default App;
