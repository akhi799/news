export const FEEDS = [
  {
    name: "The Wire",
    url: "https://thewire.in/feed/",
    category: "National"
  },
  {
    name: "Scroll.in",
    url: "https://feeds.feedburner.com/Scrollin",
    category: "National"
  },
  {
    name: "The Quint",
    url: "https://www.thequint.com/stories.rss",
    category: "National"
  },
  {
    name: "The Print",
    url: "https://theprint.in/category/india/feed/",
    category: "National"
  },
  {
    name: "SatyaHindi",
    url: "https://satyahindi.com/rss",
    category: "National"
  },
  {
    name: "The Chenab Times",
    url: "https://thechenabtimes.com/feed",
    category: "National"
  },
  {
    name: "Bar and Bench",
    url: "https://www.barandbench.com/feed",
    category: "Legal"
  },
  {
    name: "LiveLaw",
    url: "https://www.livelaw.in/google_feeds.xml",
    category: "Legal"
  },
  {
    name: "YourStory",
    url: "https://yourstory.com/feed",
    category: "Tech & Startups"
  },
  {
    name: "MediaNama",
    url: "https://www.medianama.com/feed/",
    category: "Tech & Startups"
  },
  {
    name: "Down To Earth",
    url: "https://www.downtoearth.org.in/feed",
    category: "Environment"
  },
  {
    name: "Mongabay India",
    url: "https://india.mongabay.com/feed/",
    category: "Environment"
  },
  {
    name: "The Mooknayak",
    url: "https://themooknayak.com/feed/",
    category: "Society & Rights"
  },
  {
    name: "Khabar Lahariya",
    url: "https://khabarlahariya.org/feed/",
    category: "Society & Rights"
  },
  {
    name: "Youth Ki Awaaz",
    url: "https://www.youthkiawaaz.com/feed/",
    category: "Society & Rights"
  },
  {
    name: "Better India",
    url: "https://www.thebetterindia.com/feed/",
    category: "Society & Rights"
  },
  {
    name: "Alt News",
    url: "https://www.altnews.in/feed/",
    category: "Fact Check"
  },
  {
    name: "Factly",
    url: "https://factly.in/feed/",
    category: "Fact Check"
  }
];

export const CATEGORIES = [
  "National",
  "Legal",
  "Tech & Startups",
  "Environment",
  "Society & Rights",
  "Fact Check",
  "Other"
];

// Configuration for Gemini and system
export const CONFIG = {
  maxArticlesPerRun: 15, // Process up to 15 articles per execution
  maxAgeHours: 24,       // Don't fetch articles older than 24 hours
  firestoreCollection: "articles"
};
