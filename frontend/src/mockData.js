export const mockArticles = [
  {
    id: "mock-1",
    title: "AI Revolutionizes Energy Grid Management: Efficiency Climbs 30%",
    summary: "A new neural-network-driven management framework deployed across several metropolitan power grids has demonstrated unprecedented gains in routing efficiency, reducing transmission loss by nearly a third.",
    content: "A major breakthrough in neural network-driven infrastructure management has been successfully deployed across three major metropolitan power grids. The system, developed by a consortium of energy research institutes and AI startups, dynamically routes electrical loads based on predictive demand models.\n\nOver a six-month trial period, transmission losses dropped by an average of 30%, saving millions of dollars and significantly reducing carbon emissions from fossil-fuel peaking plants. The AI operates by analyzing real-time data from millions of smart sensors, forecasting weather patterns, and managing local battery storage arrays to balance loads instantly.\n\nEngineers note that this represents the first large-scale, autonomous control of a safety-critical regional power grid. Future expansion plans include integrating residential solar feeds to further stabilize the grid during heatwaves.",
    category: "Science",
    sentiment: "positive",
    readingTime: 3,
    sourceName: "Wired",
    sourceUrl: "https://example.com/wired/ai-energy-grid",
    originalTitle: "AI power grid trial shows massive 30 percent reduction in transmission losses",
    scrapedAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
    publishedAtDate: new Date(Date.now() - 7200000).toISOString()
  },
  {
    id: "mock-2",
    title: "Global Tech Summit Highlights the Next Era of Web Decentralization",
    summary: "Industry leaders gather at the London Web Symposium to discuss federated social networks, privacy-first storage standards, and the phasing out of traditional tracking cookies.",
    content: "The annual London Web Symposium commenced yesterday, with this year's central theme focusing heavily on decentralization and user data autonomy. Developers and policymakers from major tech hubs shared drafts for new federated communication protocols designed to decouple user profiles from centralized server nodes.\n\nKey discussions revolved around replacing tracking cookies with localized, cryptographically secure verification methods. Several hardware manufacturers also announced new personal server units aimed at making home-hosting accessible to non-technical users.\n\nWhile critics argue that federated models struggle with content moderation, proponents highlight the massive surge in active users on platforms like Mastodon and Bluesky as evidence that consumer preference is shifting rapidly toward privacy-focused, community-owned spaces.",
    category: "Technology",
    sentiment: "neutral",
    readingTime: 4,
    sourceName: "TechCrunch",
    sourceUrl: "https://example.com/techcrunch/web-summit-decentralized",
    originalTitle: "Decentralized web takes center stage at London tech conference",
    scrapedAt: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
    publishedAtDate: new Date(Date.now() - 14400000).toISOString()
  },
  {
    id: "mock-3",
    title: "Biologists Map Deep-Sea Octopus Genome, Unlocking Bioluminescence Secret",
    summary: "In a groundbreaking marine study, researchers have sequenced the complete genome of the elusive Glass Octopus, uncovering the genetic pathways responsible for its unique bioluminescent cells.",
    content: "A team of international marine biologists has successfully sequenced the genome of *Vitreledonella richardi*, commonly known as the Glass Octopus. The transparent cephalopod, which inhabits the ocean's twilight zone, has long mystified researchers due to its ability to emit subtle, controlled light pulses from specialized organ clusters.\n\nThe sequenced genome reveals a unique family of genes responsible for synthesizing bioluminescent proteins, completely distinct from the enzymes found in fireflies or deep-sea anglerfish. This discovery suggests that bioluminescence evolved independently in deep-sea cephalopods much later than previously believed.\n\nUnderstanding these genetic pathways could have profound applications in medical imaging and bio-sensor design, where bioluminescent markers are used to track cellular development and targeted drug delivery.",
    category: "Science",
    sentiment: "positive",
    readingTime: 3,
    sourceName: "ScienceDaily",
    sourceUrl: "https://example.com/sciencedaily/glass-octopus-genome",
    originalTitle: "Deep-sea glass octopus genome sequenced, revealing novel bioluminescent pathway",
    scrapedAt: new Date(Date.now() - 10800000).toISOString(), // 3 hours ago
    publishedAtDate: new Date(Date.now() - 21600000).toISOString()
  },
  {
    id: "mock-4",
    title: "Market Readjustment: Stocks Slip Amid Interest Rate Speculation",
    summary: "Major stock indices dropped by 1.2% following comments from central bank officials hinting that high-interest rate policies may persist longer than initially forecasted.",
    content: "Financial markets experienced a minor downturn today as major indices fell by roughly 1.2%. The drop followed a panel discussion where central bank governors reiterated their commitment to bringing core inflation down to target levels, suggesting that rate cuts may not materialize until late next fiscal year.\n\nBond yields rose in response, with the 10-year treasury note ticking up to its highest level in three months. Tech and real estate equities bore the brunt of the selloff, while consumer staples and energy sectors remained relatively stable.\n\nAnalysts recommend caution, noting that while the labor market remains resilient, borrowing costs are continuing to squeeze corporate profit margins in high-leverage sectors.",
    category: "Business",
    sentiment: "negative",
    readingTime: 3,
    sourceName: "NYT Business",
    sourceUrl: "https://example.com/nyt/market-downturn-rates",
    originalTitle: "Stocks slide after Federal Reserve officials suggest rates will remain higher for longer",
    scrapedAt: new Date(Date.now() - 14400000).toISOString(), // 4 hours ago
    publishedAtDate: new Date(Date.now() - 28800000).toISOString()
  }
];
