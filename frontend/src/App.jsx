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
  Check,
  Bookmark,
  Play,
  Pause,
  Square,
  Lightbulb,
  ThumbsUp
} from 'lucide-react';
import { collection, query, orderBy, limit, onSnapshot, doc, getDoc, setDoc, updateDoc, increment } from 'firebase/firestore';
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

  // Bookmarks State
  const [bookmarks, setBookmarks] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('bookmarks')) || [];
    } catch {
      return [];
    }
  });

  // Text-To-Speech States
  const [isPlayingSpeech, setIsPlayingSpeech] = useState(false);
  const [speechUtterance, setSpeechUtterance] = useState(null);

  // Scroll Progress inside Details Modal
  const [scrollPercent, setScrollPercent] = useState(0);

  // User IP Address State
  const [userIp, setUserIp] = useState('local-user');

  // Website analytics stats (Page Views & Unique Visitors)
  const [stats, setStats] = useState(() => {
    try {
      const cachedViews = parseInt(localStorage.getItem('cached_page_views'));
      const cachedVisitors = parseInt(localStorage.getItem('cached_unique_visitors'));
      if (!isNaN(cachedViews) && !isNaN(cachedVisitors)) {
        return { pageViews: cachedViews, uniqueVisitors: cachedVisitors };
      }
    } catch (e) {
      console.warn("Could not load cached stats:", e);
    }
    return { pageViews: 0, uniqueVisitors: 0 };
  });

  const [loadingStats, setLoadingStats] = useState(true);

  // Visitor Coordinates list for Leaflet Map
  const [visitorLocations, setVisitorLocations] = useState([]);

  // Category view counts (telemetry profiling)
  const [interests, setInterests] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('category_interests')) || {};
    } catch {
      return {};
    }
  });

  // Lazy Loading Pagination State
  const [visibleCount, setVisibleCount] = useState(5);

  // Auto-detected / Manual Language State
  const [selectedLanguage, setSelectedLanguage] = useState(() => {
    return localStorage.getItem('user_language_pref') || 'en';
  });

  // Article Comments States
  const [comments, setComments] = useState([]);
  const [newCommentText, setNewCommentText] = useState('');
  const [commenterName, setCommenterName] = useState(() => {
    return localStorage.getItem('commenter_name') || '';
  });

  // Community Suggestions States
  const [suggestions, setSuggestions] = useState([]);
  const [newSuggestionText, setNewSuggestionText] = useState('');
  const [likedSuggestions, setLikedSuggestions] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('liked_suggestions')) || [];
    } catch {
      return [];
    }
  });

  // Swipe gesture touch start state
  const [touchStart, setTouchStart] = useState(null);

  // Save Bookmarks to localStorage
  useEffect(() => {
    localStorage.setItem('bookmarks', JSON.stringify(bookmarks));
  }, [bookmarks]);

  // Save interests profiling to localStorage
  useEffect(() => {
    localStorage.setItem('category_interests', JSON.stringify(interests));
  }, [interests]);

  // Save liked suggestions to localStorage
  useEffect(() => {
    localStorage.setItem('liked_suggestions', JSON.stringify(likedSuggestions));
  }, [likedSuggestions]);

  // Swipe gesture listener to navigate sections/categories
  useEffect(() => {
    const handleTouchStart = (e) => {
      // Don't swipe if modal is open
      if (selectedArticle) return;
      
      // Don't swipe if touching form inputs, textareas, selects, or buttons
      const tagName = e.target.tagName.toLowerCase();
      if (tagName === 'input' || tagName === 'textarea' || tagName === 'select' || tagName === 'button') return;
      if (e.target.closest('button') || e.target.closest('a') || e.target.closest('.language-select') || e.target.closest('.search-bar')) return;
      
      // Don't swipe if touching leaflet map
      if (e.target.closest('#visitor-leaflet-map') || e.target.closest('.leaflet-container')) return;

      const touch = e.touches[0];
      setTouchStart({
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now()
      });
    };

    const handleTouchEnd = (e) => {
      if (!touchStart) return;

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchStart.x;
      const deltaY = touch.clientY - touchStart.y;
      const duration = Date.now() - touchStart.time;

      setTouchStart(null);

      // Check if it's a valid horizontal swipe (threshold 65px, fast enough, and horizontal-first)
      if (duration < 450 && Math.abs(deltaX) > 65 && Math.abs(deltaX) > Math.abs(deltaY) * 1.4) {
        const categoriesOrder = ['All', 'Recommended', ...CATEGORIES, 'Bookmarks', 'Suggestions'];
        const currentIndex = categoriesOrder.indexOf(selectedCategory);
        if (currentIndex === -1) return;

        if (deltaX < 0) {
          // Swipe left -> next category
          const nextIndex = (currentIndex + 1) % categoriesOrder.length;
          setSelectedCategory(categoriesOrder[nextIndex]);
        } else {
          // Swipe right -> prev category
          const prevIndex = (currentIndex - 1 + categoriesOrder.length) % categoriesOrder.length;
          setSelectedCategory(categoriesOrder[prevIndex]);
        }
      }
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [touchStart, selectedCategory, selectedArticle]);

  // Helper: Poll and trigger Google Translate when the dropdown element mounts in the DOM
  const triggerGoogleTranslate = (targetLang) => {
    if (targetLang === 'en') return;
    
    let retries = 0;
    const maxRetries = 40; // up to 20 seconds (40 * 500ms)
    
    const interval = setInterval(() => {
      const selectEl = document.querySelector('.goog-te-combo');
      if (selectEl) {
        selectEl.value = targetLang;
        selectEl.dispatchEvent(new Event('change'));
        clearInterval(interval);
        console.log(`🔔 Google Translate successfully triggered to: ${targetLang}`);
      } else {
        retries++;
        if (retries >= maxRetries) {
          clearInterval(interval);
          console.log("⚠️ Google Translate widget select element (.goog-te-combo) not found.");
        }
      }
    }, 500);
  };

  // Apply stored language preference on mount
  useEffect(() => {
    const savedLang = localStorage.getItem('user_language_pref') || 'en';
    if (savedLang !== 'en') {
      document.cookie = `googtrans=/en/${savedLang}; path=/;`;
      document.cookie = `googtrans=/en/${savedLang}; path=/; domain=${window.location.hostname};`;
      triggerGoogleTranslate(savedLang);
    }
  }, []);

  // 1. Initialize IP, Telemetry logging, and Page counters
  useEffect(() => {
    const initializeAnalytics = async () => {
      let clientIp = 'local-user';
      let geoData = null;

      try {
        const ipResponse = await fetch('https://ip-api.com/json/');
        if (ipResponse.ok) {
          const rawGeo = await ipResponse.json();
          if (rawGeo && rawGeo.status === 'success') {
            clientIp = rawGeo.query;
            setUserIp(clientIp);
            geoData = {
              ip: rawGeo.query,
              city: rawGeo.city,
              country_name: rawGeo.country,
              country: rawGeo.countryCode,
              latitude: rawGeo.lat,
              longitude: rawGeo.lon,
              region_code: rawGeo.region
            };
          }
        }
      } catch (error) {
        console.error("GeoIP lookup failed:", error);
      }

      // Auto-detect language based on IP if no preference is stored
      if (geoData && !localStorage.getItem('user_language_pref')) {
        let detectedLang = 'en';
        if (geoData.country === 'IN') {
          // Map Indian states/regions to native languages supported by our widget
          const region = geoData.region_code || '';
          switch (region.toUpperCase()) {
            case 'MH': detectedLang = 'mr'; break; // Maharashtra -> Marathi
            case 'WB': detectedLang = 'bn'; break; // West Bengal -> Bengali
            case 'TN': detectedLang = 'ta'; break; // Tamil Nadu -> Tamil
            case 'KA': detectedLang = 'kn'; break; // Karnataka -> Kannada
            case 'AP':
            case 'TS':
            case 'TG': detectedLang = 'te'; break; // Andhra Pradesh, Telangana -> Telugu
            case 'GJ': detectedLang = 'gu'; break; // Gujarat -> Gujarati
            case 'KL': detectedLang = 'ml'; break; // Kerala -> Malayalam
            case 'PB': detectedLang = 'pa'; break; // Punjab -> Punjabi
            default: detectedLang = 'hi'; break; // Other Indian states -> Hindi
          }
        }
        
        localStorage.setItem('user_language_pref', detectedLang);
        setSelectedLanguage(detectedLang);
        
        // Set cookies for Google Translate widget
        document.cookie = `googtrans=/en/${detectedLang}; path=/;`;
        document.cookie = `googtrans=/en/${detectedLang}; path=/; domain=${window.location.hostname};`;
        
        triggerGoogleTranslate(detectedLang);
      }

      if (isDemoMode) {
        try {
          const views = parseInt(localStorage.getItem('demo_views') || '1420');
          const visitors = parseInt(localStorage.getItem('demo_visitors') || '425');
          const isUnique = localStorage.getItem(`demo_visited_${clientIp}`) !== 'true';
          
          localStorage.setItem('demo_views', (views + 1).toString());
          if (isUnique) {
            localStorage.setItem('demo_visitors', (visitors + 1).toString());
            localStorage.setItem(`demo_visited_${clientIp}`, 'true');
          }
          
          const finalViews = views + 1;
          const finalVisitors = isUnique ? visitors + 1 : visitors;
          localStorage.setItem('cached_page_views', finalViews.toString());
          localStorage.setItem('cached_unique_visitors', finalVisitors.toString());
          setStats({ pageViews: finalViews, uniqueVisitors: finalVisitors });
          setLoadingStats(false);
        } catch {
          setLoadingStats(false);
        }
      } else {
        try {
          const statsRef = doc(db, 'stats', 'counters');
          const statsSnap = await getDoc(statsRef);
          
          if (!statsSnap.exists()) {
            await setDoc(statsRef, { total_page_views: 1, unique_visitors: 1 });
          } else {
            await updateDoc(statsRef, { total_page_views: increment(1) });
          }

          onSnapshot(statsRef, (docSnap) => {
            if (docSnap.exists()) {
              const data = docSnap.data();
              const pageViews = data.total_page_views || 0;
              const uniqueVisitors = data.unique_visitors || 0;
              
              localStorage.setItem('cached_page_views', pageViews.toString());
              localStorage.setItem('cached_unique_visitors', uniqueVisitors.toString());
              setStats({ pageViews, uniqueVisitors });
              setLoadingStats(false);
            } else {
              setLoadingStats(false);
            }
          }, (err) => {
            console.error("Firestore onSnapshot error:", err);
            setLoadingStats(false);
          });

          if (clientIp !== 'local-user') {
            const visitorRef = doc(db, 'visitor_locations', clientIp.replace(/\./g, '_'));
            const visitorSnap = await getDoc(visitorRef);
            
            if (!visitorSnap.exists() && geoData) {
              const locationPayload = {
                ip: clientIp,
                city: geoData.city || 'Unknown',
                country: geoData.country_name || 'Unknown',
                countryCode: geoData.country || 'Unknown',
                latitude: geoData.latitude || 20,
                longitude: geoData.longitude || 77,
                visits: 1,
                scrapedAt: new Date().toISOString()
              };
              
              await setDoc(visitorRef, locationPayload);
              await updateDoc(statsRef, { unique_visitors: increment(1) });
            } else if (visitorSnap.exists()) {
              // Increment visit tally for location
              await updateDoc(visitorRef, { visits: increment(1) });
            }
          }
        } catch (error) {
          console.error("Firestore telemetry error, falling back to local storage stats:", error);
          try {
            const views = parseInt(localStorage.getItem('demo_views') || '1420');
            const visitors = parseInt(localStorage.getItem('demo_visitors') || '425');
            const isUnique = localStorage.getItem(`demo_visited_${clientIp}`) !== 'true';
            
            localStorage.setItem('demo_views', (views + 1).toString());
            if (isUnique) {
              localStorage.setItem('demo_visitors', (visitors + 1).toString());
              localStorage.setItem(`demo_visited_${clientIp}`, 'true');
            }
            
            const finalViews = views + 1;
            const finalVisitors = isUnique ? visitors + 1 : visitors;
            localStorage.setItem('cached_page_views', finalViews.toString());
            localStorage.setItem('cached_unique_visitors', finalVisitors.toString());
            setStats({ pageViews: finalViews, uniqueVisitors: finalVisitors });
            setLoadingStats(false);
          } catch (err) {
            console.error("Failed to run local storage telemetry fallback:", err);
            setLoadingStats(false);
          }
        }
      }
    };

    initializeAnalytics();
  }, []);

  // 2. Fetch Visitor Map markers from Firestore (or load mock coordinates) on mount
  useEffect(() => {
    const fallbackLocations = [
      { city: 'Mumbai', country: 'India', latitude: 19.0760, longitude: 72.8777, visits: 35 },
      { city: 'New York', country: 'United States', latitude: 40.7128, longitude: -74.0060, visits: 18 },
      { city: 'London', country: 'United Kingdom', latitude: 51.5074, longitude: -0.1278, visits: 12 },
      { city: 'Tokyo', country: 'Japan', latitude: 35.6762, longitude: 139.6503, visits: 8 },
      { city: 'Sydney', country: 'Australia', latitude: -33.8688, longitude: 151.2093, visits: 4 },
      { city: 'Berlin', country: 'Germany', latitude: 52.5200, longitude: 13.4050, visits: 6 }
    ];

    if (isDemoMode) {
      setVisitorLocations(fallbackLocations);
    } else {
      try {
        const q = query(collection(db, 'visitor_locations'), limit(200));
        const unsubscribe = onSnapshot(q, (snapshot) => {
          const locs = [];
          snapshot.forEach(docSnap => {
            locs.push(docSnap.data());
          });
          
          if (locs.length === 0) {
            setVisitorLocations(fallbackLocations);
          } else {
            setVisitorLocations(locs);
          }
        }, (error) => {
          console.error("Firestore loading locations error, falling back to mock:", error);
          setVisitorLocations(fallbackLocations);
        });
        return () => unsubscribe();
      } catch (error) {
        console.error("Failed to load map coordinates, falling back to mock:", error);
        setVisitorLocations(fallbackLocations);
      }
    }
  }, []);

  // 2b. Fetch Suggestions on mount
  useEffect(() => {
    if (isDemoMode) {
      try {
        const localSuggestions = JSON.parse(localStorage.getItem('demo_suggestions')) || [
          {
            id: 'sugg-1',
            userName: 'Priya Sharma',
            suggestionText: 'It would be amazing to have dark mode persist across device reboots automatically.',
            likes: 12,
            createdAt: new Date(Date.now() - 3600000 * 24 * 3).toISOString()
          },
          {
            id: 'sugg-2',
            userName: 'Amit R.',
            suggestionText: 'Add an audio speed controller for the TTS reader (e.g. 1.25x, 1.5x speed).',
            likes: 8,
            createdAt: new Date(Date.now() - 3600000 * 12).toISOString()
          },
          {
            id: 'sugg-3',
            userName: 'Vikas Patel',
            suggestionText: 'Integrate financial bulletins or stock tickers at the top as well!',
            likes: 4,
            createdAt: new Date(Date.now() - 3600000 * 2).toISOString()
          }
        ];
        setSuggestions(localSuggestions);
      } catch {
        setSuggestions([]);
      }
    } else {
      try {
        const suggRef = collection(db, 'suggestions');
        const q = query(suggRef, orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
          const list = [];
          snapshot.forEach(docSnap => {
            list.push({ id: docSnap.id, ...docSnap.data() });
          });
          setSuggestions(list);
        }, (error) => {
          console.error("Firestore suggestions read error:", error);
          const localSuggestions = JSON.parse(localStorage.getItem('demo_suggestions')) || [];
          setSuggestions(localSuggestions);
        });
        return () => unsubscribe();
      } catch (err) {
        console.error("Failed to load suggestions from Firestore:", err);
      }
    }
  }, []);

  // 3. Render Leaflet Map dynamically inside footer map container
  useEffect(() => {
    let checkInterval = null;
    let mapTimer = null;

    const initializeMap = () => {
      const container = document.getElementById('visitor-leaflet-map');
      if (!container || typeof window.L === 'undefined') return;

      if (window.leafletMapInstance) {
        window.leafletMapInstance.remove();
      }

      const map = window.L.map('visitor-leaflet-map').setView([20, 0], 2);
      window.leafletMapInstance = map;

      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(map);

      if (visitorLocations.length === 0) return;

      const groups = {};
      visitorLocations.forEach(loc => {
        if (!loc.latitude || !loc.longitude) return;
        const key = `${parseFloat(loc.latitude).toFixed(2)},${parseFloat(loc.longitude).toFixed(2)}`;
        if (!groups[key]) {
          groups[key] = {
            city: loc.city,
            country: loc.country,
            latitude: parseFloat(loc.latitude),
            longitude: parseFloat(loc.longitude),
            count: loc.visits || 0
          };
        } else {
          groups[key].count += (loc.visits || 1);
        }
      });

      Object.values(groups).forEach(g => {
        const marker = window.L.marker([g.latitude, g.longitude]).addTo(map);
        marker.bindPopup(`
          <div style="font-family: sans-serif; font-size: 13px; color: #000;">
            <b>${g.city}, ${g.country}</b><br/>
            Visitor Hits: <b>${g.count}</b>
          </div>
        `);
      });
    };

    if (typeof window.L === 'undefined') {
      // Leaflet library has not loaded yet, poll for it
      checkInterval = setInterval(() => {
        if (typeof window.L !== 'undefined') {
          clearInterval(checkInterval);
          initializeMap();
        }
      }, 300);
    } else {
      mapTimer = setTimeout(initializeMap, 500);
    }

    return () => {
      if (checkInterval) clearInterval(checkInterval);
      if (mapTimer) clearTimeout(mapTimer);
    };
  }, [visitorLocations]);

  // Telemetry: track user category clicks
  const trackInterest = (category) => {
    if (!category || category === 'All' || category === 'Bookmarks' || category === 'Map' || category === 'Recommended') return;
    setInterests(prev => {
      const newCount = (prev[category] || 0) + 1;
      const updated = { ...prev, [category]: newCount };
      
      if (!isDemoMode && userIp !== 'local-user') {
        try {
          const profileRef = doc(db, 'user_telemetry', userIp.replace(/\./g, '_'));
          setDoc(profileRef, { 
            category_interests: updated,
            lastUpdatedAt: new Date().toISOString()
          }, { merge: true });
        } catch {}
      }
      
      return updated;
    });
  };

  const handleArticleClick = (article) => {
    trackInterest(article.category);
    setSelectedArticle(article);
  };

  // Handle modal changes (TTS cleanup, scroll reset, and load comments)
  useEffect(() => {
    window.speechSynthesis.cancel();
    setIsPlayingSpeech(false);
    setSpeechUtterance(null);
    setScrollPercent(0);
    setComments([]);
    setNewCommentText('');

    if (selectedArticle) {
      if (isDemoMode) {
        try {
          const localComments = JSON.parse(localStorage.getItem(`comments_${selectedArticle.id}`)) || [];
          setComments(localComments);
        } catch {
          setComments([]);
        }
      } else {
        try {
          const commentsRef = collection(db, 'articles', selectedArticle.id, 'comments');
          const q = query(commentsRef, orderBy('createdAt', 'desc'));
          const unsubscribe = onSnapshot(q, (snapshot) => {
            const list = [];
            snapshot.forEach(docSnap => {
              list.push({ id: docSnap.id, ...docSnap.data() });
            });
            setComments(list);
          });
          return () => unsubscribe();
        } catch (error) {
          console.error("Failed to load comments from Firestore:", error);
        }
      }
    }
  }, [selectedArticle]);

  // Submit new comment (optimistic update in Demo Mode, write to Firestore subcollection in Live Mode)
  const handleSubmitComment = async (e) => {
    if (e) e.preventDefault();
    if (!newCommentText.trim()) return;

    const author = commenterName.trim() || 'Anonymous Reader';
    
    // Cache commenter name in localStorage
    localStorage.setItem('commenter_name', author);

    const commentPayload = {
      userName: author,
      commentText: newCommentText.trim(),
      createdAt: new Date().toISOString()
    };

    if (isDemoMode) {
      const storageKey = `comments_${selectedArticle.id}`;
      try {
        const localComments = JSON.parse(localStorage.getItem(storageKey)) || [];
        const updatedComments = [
          { id: `demo-cmt-${Date.now()}`, ...commentPayload },
          ...localComments
        ];
        localStorage.setItem(storageKey, JSON.stringify(updatedComments));
        setComments(updatedComments);
        setNewCommentText('');
      } catch (err) {
        console.error("Failed to save comment locally:", err);
      }
    } else {
      try {
        const commentsCollection = collection(db, 'articles', selectedArticle.id, 'comments');
        const newCommentRef = doc(commentsCollection);
        await setDoc(newCommentRef, commentPayload);
        setNewCommentText('');
      } catch (err) {
        console.error("Failed to submit comment to Firestore:", err);
        alert("Failed to submit comment. Please check your internet connection.");
      }
    }
  };

  // Submit new suggestion
  const handleSubmitSuggestion = async (e) => {
    if (e) e.preventDefault();
    if (!newSuggestionText.trim()) return;

    const author = commenterName.trim() || 'Anonymous Reader';
    localStorage.setItem('commenter_name', author);

    const suggestionPayload = {
      userName: author,
      suggestionText: newSuggestionText.trim(),
      likes: 0,
      createdAt: new Date().toISOString()
    };

    if (isDemoMode) {
      try {
        const localSuggestions = JSON.parse(localStorage.getItem('demo_suggestions')) || [];
        const updated = [
          { id: `demo-sugg-${Date.now()}`, ...suggestionPayload },
          ...localSuggestions
        ];
        localStorage.setItem('demo_suggestions', JSON.stringify(updated));
        setSuggestions(updated);
        setNewSuggestionText('');
      } catch (err) {
        console.error("Failed to save suggestion locally:", err);
      }
    } else {
      try {
        const suggCollection = collection(db, 'suggestions');
        const newSuggRef = doc(suggCollection);
        await setDoc(newSuggRef, suggestionPayload);
        setNewSuggestionText('');
      } catch (err) {
        console.error("Failed to submit suggestion to Firestore:", err);
        alert("Failed to submit suggestion. Please check your internet connection.");
      }
    }
  };

  // Upvote/like a suggestion
  const handleLikeSuggestion = async (suggestionId, e) => {
    if (e) e.stopPropagation();
    if (likedSuggestions.includes(suggestionId)) return;

    setLikedSuggestions(prev => [...prev, suggestionId]);

    if (isDemoMode) {
      setSuggestions(prev => {
        const updated = prev.map(s => {
          if (s.id === suggestionId) {
            return { ...s, likes: (s.likes || 0) + 1 };
          }
          return s;
        });
        localStorage.setItem('demo_suggestions', JSON.stringify(updated));
        return updated;
      });
    } else {
      try {
        const suggRef = doc(db, 'suggestions', suggestionId);
        await updateDoc(suggRef, {
          likes: increment(1)
        });
      } catch (err) {
        console.error("Failed to upvote suggestion:", err);
      }
    }
  };

  // Apply Theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Hash Routing Listener (Deep Linking)
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash && hash.startsWith('#article-')) {
        const artId = hash.replace('#article-', '');
        const found = articles.find(a => a.id === artId);
        if (found) {
          setSelectedArticle(found);
        }
      } else {
        setSelectedArticle(null);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    
    if (articles.length > 0) {
      handleHashChange();
    }

    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [articles]);

  // SEO dynamic tag changes & deep-link sync
  useEffect(() => {
    if (selectedArticle) {
      if (window.location.hash !== `#article-${selectedArticle.id}`) {
        window.location.hash = `article-${selectedArticle.id}`;
      }

      document.title = `${selectedArticle.title} | PulseAI News`;
      
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) {
        metaDesc.setAttribute('content', selectedArticle.summary);
      }
      
      let ogTitle = document.querySelector('meta[property="og:title"]');
      if (!ogTitle) {
        ogTitle = document.createElement('meta');
        ogTitle.setAttribute('property', 'og:title');
        document.head.appendChild(ogTitle);
      }
      ogTitle.setAttribute('content', selectedArticle.title);

      let ogDesc = document.querySelector('meta[property="og:description"]');
      if (!ogDesc) {
        ogDesc = document.createElement('meta');
        ogDesc.setAttribute('property', 'og:description');
        document.head.appendChild(ogDesc);
      }
      ogDesc.setAttribute('content', selectedArticle.summary);

      if (selectedArticle.imageUrl) {
        let ogImg = document.querySelector('meta[property="og:image"]');
        if (!ogImg) {
          ogImg = document.createElement('meta');
          ogImg.setAttribute('property', 'og:image');
          document.head.appendChild(ogImg);
        }
        ogImg.setAttribute('content', selectedArticle.imageUrl);
      }
    } else {
      if (window.location.hash && window.location.hash.startsWith('#article-')) {
        window.location.hash = '';
      }

      document.title = "PulseAI | Hourly Independent News Hub";
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) {
        metaDesc.setAttribute('content', "An automated independent news website gathering stories hourly, summarized and rewritten using Google Gemini AI.");
      }
    }
  }, [selectedArticle]);

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
          limit(200)
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
    setSelectedLanguage(lang);
    localStorage.setItem('user_language_pref', lang);
    
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

  // Toggle Bookmarked state
  const toggleBookmark = (articleId, e) => {
    if (e) e.stopPropagation();
    setBookmarks(prev => {
      if (prev.includes(articleId)) {
        return prev.filter(id => id !== articleId);
      } else {
        return [...prev, articleId];
      }
    });
  };

  // Text-To-Speech Reader
  const handlePlaySpeech = () => {
    if (isPlayingSpeech) {
      window.speechSynthesis.pause();
      setIsPlayingSpeech(false);
    } else {
      if (window.speechSynthesis.paused && speechUtterance) {
        window.speechSynthesis.resume();
        setIsPlayingSpeech(true);
      } else {
        window.speechSynthesis.cancel();
        const textToRead = `${selectedArticle.title}. AI Synopsis: ${selectedArticle.summary}`;
        const utterance = new SpeechSynthesisUtterance(textToRead);
        
        utterance.onend = () => {
          setIsPlayingSpeech(false);
          setSpeechUtterance(null);
        };
        utterance.onerror = () => {
          setIsPlayingSpeech(false);
          setSpeechUtterance(null);
        };
        
        setSpeechUtterance(utterance);
        window.speechSynthesis.speak(utterance);
        setIsPlayingSpeech(true);
      }
    }
  };

  const handleStopSpeech = () => {
    window.speechSynthesis.cancel();
    setIsPlayingSpeech(false);
    setSpeechUtterance(null);
  };

  // Modal scroll handler
  const handleModalScroll = (e) => {
    const element = e.target;
    const scrollTop = element.scrollTop;
    const scrollHeight = element.scrollHeight - element.clientHeight;
    if (scrollHeight > 0) {
      const percent = (scrollTop / scrollHeight) * 100;
      setScrollPercent(percent);
    }
  };

  // Share Article Function
  const handleCopyLink = (article) => {
    navigator.clipboard.writeText(article.sourceUrl || window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Filter Logic (supports Bookmarks and Recommended tabs)
  const filteredArticles = articles.filter(article => {
    const matchesCategory = 
      (selectedCategory === 'All' || selectedCategory === 'Recommended') ? true : 
      selectedCategory === 'Bookmarks' ? bookmarks.includes(article.id) : 
      article.category === selectedCategory;
      
    const matchesSearch = 
      article.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      article.summary?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      article.content?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Sort by user interest scores if Recommended tab is selected
  const sortedArticles = [...filteredArticles].sort((a, b) => {
    if (selectedCategory === 'Recommended') {
      const scoreA = interests[a.category] || 0;
      const scoreB = interests[b.category] || 0;
      if (scoreA !== scoreB) {
        return scoreB - scoreA;
      }
    }
    return 0; // keep date sorting desc
  });

  // Progressive article loader progression (5 -> 10 -> 15 -> 20) on category or search query change
  useEffect(() => {
    setVisibleCount(5);
    
    let current = 5;
    const interval = setInterval(() => {
      current += 5;
      setVisibleCount(val => {
        if (val < 20) {
          return Math.min(val + 5, 20);
        } else {
          clearInterval(interval);
          return val;
        }
      });
      if (current >= 20) {
        clearInterval(interval);
      }
    }, 450);

    return () => clearInterval(interval);
  }, [selectedCategory, searchQuery]);

  // Infinite scroll: load 10 additional stories when scrolling near the bottom of the page
  useEffect(() => {
    const handleScroll = () => {
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 200) {
        setVisibleCount(prev => Math.min(prev + 10, sortedArticles.length));
      }
    };
    
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [sortedArticles.length]);

  // Hero Story Display Logic (show on main and recommended feeds)
  const showHero = (selectedCategory === 'All' || selectedCategory === 'Recommended') && searchQuery === '' && sortedArticles.length > 0;
  const heroArticle = showHero ? sortedArticles[0] : null;
  const gridArticles = showHero ? sortedArticles.slice(1, visibleCount) : sortedArticles.slice(0, visibleCount);

  // Headlines Ticker logic: prioritize trending news, limit to 12 items to prevent excessive width/speed
  const trendingList = articles.filter(art => art.isTrending);
  const tickerArticles = trendingList.length > 0 ? trendingList.slice(0, 12) : articles.slice(0, 12);

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
            <select className="language-select" onChange={handleLanguageChange} value={selectedLanguage} title="Translate Page">
              <option value="en">English</option>
              <option value="hi">हिन्दी (Hindi)</option>
              <option value="bn">বাংলা (Bengali)</option>
              <option value="te">తెలుగు (Telugu)</option>
              <option value="ta">தமிழ் (Tamil)</option>
              <option value="mr">मराठी (Marathi)</option>
              <option value="gu">ગુજરાતી (Gujarati)</option>
              <option value="kn">ಕನ್ನಡ (Kannada)</option>
              <option value="ml">മലയാളं (Malayalam)</option>
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
          <div className="ticker-flow">
            {tickerArticles.map((art, idx) => (
              <span key={`tick-${idx}`} className="ticker-item" onClick={() => handleArticleClick(art)}>
                • {art.title}
              </span>
            ))}
            {/* Duplicate for infinite effect */}
            {tickerArticles.map((art, idx) => (
              <span key={`tick-dup-${idx}`} className="ticker-item" onClick={() => handleArticleClick(art)}>
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
        <button 
          className={`category-tab ${selectedCategory === 'Recommended' ? 'active' : ''}`}
          onClick={() => setSelectedCategory('Recommended')}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          ✨ For You
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
        <button 
          className={`category-tab bookmark-tab ${selectedCategory === 'Bookmarks' ? 'active' : ''}`}
          onClick={() => setSelectedCategory('Bookmarks')}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <Bookmark size={14} style={{ fill: selectedCategory === 'Bookmarks' ? 'currentColor' : 'none' }} />
          Saved Stories
        </button>
        <button 
          className={`category-tab suggestions-tab ${selectedCategory === 'Suggestions' ? 'active' : ''}`}
          onClick={() => setSelectedCategory('Suggestions')}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <Lightbulb size={14} style={{ fill: selectedCategory === 'Suggestions' ? 'currentColor' : 'none' }} />
          Suggestions
        </button>
      </div>

      {/* 5. Main Content Section */}
      <main className="main-content">
        <div className="section-title-wrapper">
          <h1 className="section-title">
            {selectedCategory === 'All' ? 'Latest Bulletins' : 
             selectedCategory === 'Bookmarks' ? 'Your Saved Stories' : 
             selectedCategory === 'Recommended' ? 'Recommended for You' : 
             selectedCategory === 'Suggestions' ? 'Community Feedback & Ideas' :
             selectedCategory}
          </h1>
          <div className="update-indicator">
            {selectedCategory === 'Suggestions' ? (
              <>
                <Lightbulb size={12} style={{ color: 'var(--accent-secondary)' }} />
                <span>Help us improve</span>
              </>
            ) : (
              <>
                <RefreshCw size={12} className="spin-slow" />
                <span>Updated hourly via AI</span>
              </>
            )}
          </div>
        </div>

        {selectedCategory === 'Suggestions' ? (
          <div className="suggestions-container">
            <div className="suggestions-grid-layout">
              {/* Form Card */}
              <div className="suggestion-form-card">
                <h2 className="suggestions-sub-title">Share Your Suggestions</h2>
                <p className="suggestions-desc">
                  We are constantly improving PulseAI. Share your ideas, report bugs, or recommend new sources and features!
                </p>
                <form onSubmit={handleSubmitSuggestion} className="suggestion-form">
                  <div className="form-group">
                    <label className="form-label" htmlFor="suggestion-name">Your Name (Optional)</label>
                    <input 
                      type="text" 
                      id="suggestion-name"
                      placeholder="e.g. Priyanth"
                      className="suggestion-input"
                      value={commenterName}
                      onChange={(e) => setCommenterName(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="suggestion-text">Idea / Improvement Suggestion</label>
                    <textarea 
                      id="suggestion-text"
                      placeholder="Describe what features, feeds, or tweaks you'd love to see on PulseAI..."
                      className="suggestion-textarea"
                      value={newSuggestionText}
                      onChange={(e) => setNewSuggestionText(e.target.value)}
                      required
                    ></textarea>
                  </div>
                  <button type="submit" className="suggestion-submit-btn">
                    Submit Idea <ArrowRight size={16} />
                  </button>
                </form>
              </div>

              {/* Feed Card */}
              <div className="suggestions-feed-column">
                <h2 className="suggestions-sub-title">Community Suggestions ({suggestions.length})</h2>
                {suggestions.length === 0 ? (
                  <div className="suggestions-empty">
                    <Lightbulb size={36} className="empty-lightbulb" style={{ color: 'var(--text-muted)' }} />
                    <p>No suggestions yet. Be the first to share your thoughts!</p>
                  </div>
                ) : (
                  <div className="suggestions-list-scrollable">
                    {[...suggestions].sort((a, b) => (b.likes || 0) - (a.likes || 0)).map((sugg) => (
                      <div key={sugg.id} className="suggestion-card">
                        <div className="suggestion-card-header">
                          <div className="sugg-author-info">
                            <strong className="sugg-author">{sugg.userName}</strong>
                            <span className="sugg-date">{formatArticleDate(sugg.createdAt)}</span>
                          </div>
                          <button 
                            className={`sugg-like-btn ${likedSuggestions.includes(sugg.id) ? 'liked' : ''}`}
                            onClick={(e) => handleLikeSuggestion(sugg.id, e)}
                            disabled={likedSuggestions.includes(sugg.id)}
                            title={likedSuggestions.includes(sugg.id) ? "You liked this suggestion" : "Upvote this suggestion"}
                          >
                            <ThumbsUp size={14} style={{ fill: likedSuggestions.includes(sugg.id) ? 'currentColor' : 'none' }} />
                            <span>{sugg.likes || 0}</span>
                          </button>
                        </div>
                        <p className="suggestion-card-text">{sugg.suggestionText}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : loading ? (
          <div className="news-grid">
            {[...Array(6)].map((_, idx) => (
              <div key={`skeleton-${idx}`} className="news-card skeleton-card">
                <div className="skeleton-line skeleton-image"></div>
                <div className="skeleton-content-wrapper">
                  <div className="skeleton-line skeleton-header"></div>
                  <div className="skeleton-line skeleton-title-long"></div>
                  <div className="skeleton-line skeleton-title-short"></div>
                  <div className="skeleton-line skeleton-body-1"></div>
                  <div className="skeleton-line skeleton-body-2"></div>
                  <div className="skeleton-line skeleton-footer"></div>
                </div>
              </div>
            ))}
          </div>
        ) : filteredArticles.length === 0 ? (
          <div className="empty-state">
            <AlertTriangle className="empty-icon" size={48} />
            <h3 style={{ marginBottom: '8px', fontFamily: 'var(--font-editorial)', fontSize: '1.5rem' }}>
              {selectedCategory === 'Bookmarks' ? 'No saved stories yet' : 'No articles match your search'}
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
              {selectedCategory === 'Bookmarks' ? 'Bookmark articles by clicking the bookmark icon on any card to read them later.' : 'Try looking for a different keyword or selecting another category.'}
            </p>
          </div>
        ) : (
          <>
            {/* 5a. Featured Hero Card */}
            {showHero && heroArticle && (
              <div className="news-hero-card" onClick={() => handleArticleClick(heroArticle)}>
                {heroArticle.imageUrl && (
                  <div className="hero-image-wrapper">
                    <img src={heroArticle.imageUrl} alt={heroArticle.title} className="hero-image" />
                    <div className="hero-image-overlay"></div>
                  </div>
                )}
                <div className="hero-content">
                  <div className="card-header-info">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="card-category">{heroArticle.category}</span>
                      {heroArticle.isTrending && (
                        <span className="trending-badge">
                          🔥 Trending
                        </span>
                      )}
                      <span className={`card-sentiment-badge ${heroArticle.sentiment || 'neutral'}`}>
                        <span className="sentiment-dot" style={{ backgroundColor: getSentimentDotColor(heroArticle.sentiment) }}></span>
                        {heroArticle.sentiment || 'neutral'}
                      </span>
                    </div>
                    <button 
                      className={`bookmark-card-btn ${bookmarks.includes(heroArticle.id) ? 'bookmarked' : ''}`} 
                      onClick={(e) => toggleBookmark(heroArticle.id, e)}
                      title="Save story"
                    >
                      <Bookmark size={14} style={{ fill: bookmarks.includes(heroArticle.id) ? 'currentColor' : 'none' }} />
                    </button>
                  </div>
                  
                  <h1 className="hero-title">{heroArticle.title}</h1>
                  <p className="hero-summary">{heroArticle.summary}</p>
                  
                  <div className="hero-footer">
                    <div className="card-metadata">
                      <span className="card-meta-item">{heroArticle.sourceName}</span>
                      <span>•</span>
                      <span className="card-meta-item">{formatArticleDate(heroArticle.scrapedAt || heroArticle.publishedAt)}</span>
                    </div>
                    
                    <span className="read-more-link">
                      Featured Story <ArrowRight size={14} />
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* 5b. News Grid */}
            {gridArticles.length > 0 ? (
              <div className="news-grid">
                {gridArticles.map((article) => (
                   <article 
                     key={article.id} 
                     className="news-card"
                     onClick={() => handleArticleClick(article)}
                   >
                     {article.imageUrl && (
                       <div className="card-image-wrapper">
                         <img src={article.imageUrl} alt={article.title} className="card-image" />
                         <div className="card-image-overlay"></div>
                       </div>
                     )}
                     
                     <div className="card-content-wrapper">
                       <div className="card-header-info">
                         <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                           <span className="card-category">{article.category}</span>
                           {article.isTrending && (
                             <span className="trending-badge">
                               🔥
                             </span>
                           )}
                         </div>
                         <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                           <span className={`card-sentiment-badge ${article.sentiment || 'neutral'}`}>
                             <span className="sentiment-dot" style={{ backgroundColor: getSentimentDotColor(article.sentiment) }}></span>
                             {article.sentiment || 'neutral'}
                           </span>
                           <button 
                             className={`bookmark-card-btn ${bookmarks.includes(article.id) ? 'bookmarked' : ''}`} 
                             onClick={(e) => toggleBookmark(article.id, e)}
                             title="Save story"
                           >
                             <Bookmark size={12} style={{ fill: bookmarks.includes(article.id) ? 'currentColor' : 'none' }} />
                           </button>
                         </div>
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
            ) : (
              showHero && (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  No more stories to display.
                </div>
              )
            )}
          </>
        )}
      </main>

      {/* 6. Article Details Overlay Modal */}
      {selectedArticle && (
        <div className="modal-overlay" onClick={() => setSelectedArticle(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} onScroll={handleModalScroll}>
            {/* Scroll Progress Bar */}
            <div className="modal-scroll-progress" style={{ width: `${scrollPercent}%` }}></div>

            <button className="modal-close-btn" onClick={() => setSelectedArticle(null)}>
              <X size={20} />
            </button>
            
            {selectedArticle.imageUrl && (
              <div className="modal-image-wrapper">
                <img src={selectedArticle.imageUrl} alt={selectedArticle.title} className="modal-image" />
                <div className="modal-image-overlay"></div>
              </div>
            )}

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
            
            {/* Audio Reader Bar */}
            <div className="audio-reader-bar">
              <button className={`audio-reader-btn ${isPlayingSpeech ? 'playing' : ''}`} onClick={handlePlaySpeech} title={isPlayingSpeech ? "Pause Reader" : "Listen to Synopsis"}>
                {isPlayingSpeech ? <Pause size={14} /> : <Play size={14} />}
                <span>{isPlayingSpeech ? "Pause Synopsis" : "Listen to Story"}</span>
              </button>
              {isPlayingSpeech && (
                <button className="audio-reader-stop" onClick={handleStopSpeech} title="Stop Reader">
                  <Square size={12} />
                </button>
              )}
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
            
            {/* Video Integration */}
            {selectedArticle.video && selectedArticle.video.url && selectedArticle.video.platform !== 'none' && (
              <div className="modal-video-section">
                <h3 className="video-section-title">
                  📹 Related Video Coverage
                </h3>
                {selectedArticle.video.platform === 'youtube' && selectedArticle.video.embedUrl ? (
                  <div className="modal-video-wrapper">
                    <iframe 
                      src={selectedArticle.video.embedUrl} 
                      title="Related YouTube coverage" 
                      frameBorder="0" 
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                      allowFullScreen
                    ></iframe>
                  </div>
                ) : (
                  <div className="video-social-embed-card">
                    <p className="social-embed-text">
                      Video coverage of this event is hosted on <strong style={{ textTransform: 'capitalize' }}>{selectedArticle.video.platform}</strong>.
                    </p>
                    <a 
                      href={selectedArticle.video.url} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="watch-video-btn"
                    >
                      Watch video clip on {selectedArticle.video.platform} <ExternalLink size={14} />
                    </a>
                  </div>
                )}
              </div>
            )}
            
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
                <span>Save / Share</span>
                <button 
                  className={`share-btn ${bookmarks.includes(selectedArticle.id) ? 'bookmarked' : ''}`} 
                  onClick={() => toggleBookmark(selectedArticle.id)}
                  title="Bookmark story"
                >
                  <Bookmark size={16} style={{ fill: bookmarks.includes(selectedArticle.id) ? 'currentColor' : 'none' }} />
                </button>
                <button 
                  className="share-btn" 
                  onClick={() => handleCopyLink(selectedArticle)} 
                  title="Copy coverage link"
                >
                  {copied ? <Check size={16} style={{ color: 'var(--color-positive)' }} /> : <Copy size={16} />}
                </button>
              </div>
            </div>

            {/* 6b. Community Comments Section */}
            <div className="modal-comments-section" style={{ borderTop: '1px solid var(--card-border)', marginTop: '30px', paddingTop: '25px' }}>
              <h3 className="comments-section-title" style={{ fontFamily: 'var(--font-editorial)', fontSize: '1.4rem', fontWeight: 600, marginBottom: '16px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                💬 Community Discussion ({comments.length})
              </h3>

              {/* Comment submission form */}
              <form onSubmit={handleSubmitComment} style={{ marginBottom: '25px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <input 
                    type="text" 
                    placeholder="Your Name (Optional)" 
                    className="comment-name-input"
                    value={commenterName}
                    onChange={(e) => setCommenterName(e.target.value)}
                    style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--card-border)', background: 'var(--card-bg-subtle)', color: 'var(--text-primary)', width: '250px', fontSize: '0.9rem' }}
                  />
                </div>
                <textarea 
                  placeholder="Share your thoughts on this news bulletin..." 
                  className="comment-textarea"
                  value={newCommentText}
                  onChange={(e) => setNewCommentText(e.target.value)}
                  required
                  style={{ padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--card-border)', background: 'var(--card-bg-subtle)', color: 'var(--text-primary)', minHeight: '80px', fontFamily: 'inherit', fontSize: '0.92rem', resize: 'vertical' }}
                ></textarea>
                <button 
                  type="submit" 
                  className="submit-comment-btn"
                  style={{ alignSelf: 'flex-start', padding: '8px 16px', borderRadius: '6px', border: 'none', background: 'var(--accent-primary)', color: '#fff', fontWeight: 600, cursor: 'pointer', transition: 'var(--transition-smooth)', fontSize: '0.9rem' }}
                >
                  Post Comment
                </button>
              </form>

              {/* Comments list */}
              {comments.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.95rem', margin: '20px 0' }}>
                  No comments yet. Be the first to share your thoughts!
                </p>
              ) : (
                <div className="comments-list" style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '400px', overflowY: 'auto', paddingRight: '8px' }}>
                  {comments.map((comment) => (
                    <div key={comment.id} className="comment-card" style={{ padding: '12px 15px', borderRadius: '8px', background: 'var(--card-bg-subtle)', border: '1px solid var(--card-border)' }}>
                      <div className="comment-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', fontSize: '0.82rem' }}>
                        <strong style={{ color: 'var(--text-primary)' }}>{comment.userName}</strong>
                        <span style={{ color: 'var(--text-muted)' }}>{formatArticleDate(comment.createdAt)}</span>
                      </div>
                      <p className="comment-text" style={{ margin: 0, fontSize: '0.92rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                        {comment.commentText}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 7. Footer */}
      <footer className="app-footer">
        <div className="footer-grid-layout">
          {/* Left Column: Map Dashboard */}
          <div className="footer-map-column">
            <h3 className="footer-section-title">🌍 Live Visitor Distribution</h3>
            <div id="visitor-leaflet-map" style={{ height: '300px', width: '100%', borderRadius: '12px', border: '1px solid var(--card-border)', background: '#aad3df', zIndex: 10 }}></div>
          </div>
          
          {/* Right Column: Info & Counters */}
          <div className="footer-info-column">
            <div className="footer-logo">PulseAI</div>
            <p className="footer-text">
              Fully automated hourly news synthesis. Powered by Google Gemini & Firebase.
            </p>
            
            {/* Visitor Telemetry Counters */}
            <div className="footer-stats-container">
              <div className="footer-stat-box">
                <span className="stat-value">
                  {loadingStats && stats.uniqueVisitors === 0 ? "..." : stats.uniqueVisitors.toLocaleString()}
                </span>
                <span className="stat-label">Unique Visitors</span>
              </div>
              <div className="footer-stat-box-divider"></div>
              <div className="footer-stat-box">
                <span className="stat-value">
                  {loadingStats && stats.pageViews === 0 ? "..." : stats.pageViews.toLocaleString()}
                </span>
                <span className="stat-label">Total Page Hits</span>
              </div>
            </div>

            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '15px 0' }}>
              All articles are curated from RSS feeds and rewritten by artificial intelligence. Original coverage links are provided.
            </p>
            <div className="footer-links">
              <a href="#" className="footer-link" onClick={(e) => { e.preventDefault(); alert("PulseAI monitors RSS news feeds, extracts details, rewrites them using Google Gemini 1.5 Flash, and publishes them hourly to Firebase. Designed for 100% zero-cost operation."); }}>How it works</a>
              <span style={{ color: 'var(--card-border)' }}>|</span>
              <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer" className="footer-link">Google AI Studio</a>
              <span style={{ color: 'var(--card-border)' }}>|</span>
              <a href="https://firebase.google.com/" target="_blank" rel="noreferrer" className="footer-link">Firebase Console</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
