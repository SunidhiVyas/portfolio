/* ════════════════════════════════════════════════════════════════
   12 projects, 6 per page (3 up / 3 down). Pagination arrows auto.
   image is name-based via dummyimage + text — replace with
   real screenshot "projects/your-shot.webp" when ready.
   ════════════════════════════════════════════════════════════════ */
const projects = [
  { id: 1, title: "FitMind AI Agent", category: "FULL STACK · AI",
    description: "Fitness coaching app — Node/Express live vitals & muscle-activation + Python/Ollama local-LLM coaching with live polling & offline mode.",
    image: "assets/projects/fitmind-ai-agent.webp", technologies: ["Node.js", "Express", "Python", "Ollama"],
    github: "https://github.com/SunidhiVyas/fitmind-ai-agent" },
  { id: 2, title: "AuraOS", category: "FULL STACK · UI",
    description: "Modern OS-inspired web workspace — window management, dock, and app launcher with clean, draggable UI and persistent state.",
    image: "assets/projects/auraos.webp", technologies: ["React", "Next.js", "TypeScript", "Tailwind"],
    github: "https://github.com/SunidhiVyas/auraos" },
  { id: 3, title: "PulseX", category: "HEALTH TECH",
    description: "Real-time vitals dashboard — heart, activity & scan history with live charts and coaching insights.",
    image: "assets/projects/pulsex.webp", technologies: ["React", "Node.js", "Python", "Charts"],
    github: "https://github.com/SunidhiVyas/PulseX" },
  { id: 4, title: "Chat App Microservices", category: "MICROSERVICES",
    description: "Scalable chat platform — microservices for auth, messaging & presence with WebSockets and Docker Compose.",
    image: "assets/projects/chat-app-microservices.webp", technologies: ["Node.js", "WebSockets", "Docker", "MongoDB"],
    github: "https://github.com/SunidhiVyas/chat-app-microservices" },
  { id: 5, title: "Foodverse AI", category: "FULL STACK · 3D",
    description: "Food-delivery platform with 4 role dashboards (customer/restaurant/driver/admin) — Next.js App Router + Three.js food particles & live map.",
    image: "assets/projects/foodverse-ai.webp", technologies: ["Next.js", "TypeScript", "Three.js", "Tailwind"],
    github: "https://github.com/SunidhiVyas/foodverse-ai" },
  { id: 6, title: "Music Streaming Microservices", category: "MICROSERVICES",
    description: "Streaming backend — auth, catalog, playback & playlists as independent services with load balancing.",
    image: "assets/projects/music-streaming-microservices.webp", technologies: ["Node.js", "Express", "MongoDB", "Docker"],
    github: "https://github.com/SunidhiVyas/music-streaming-microservices" },
  { id: 7, title: "Blog Microservice", category: "MICROSERVICES",
    description: "Headless blog platform — posts, comments & media microservices with Prisma & PostgreSQL, JWT auth.",
    image: "https://dummyimage.com/640x400/0a1430/6db0ff&text=Blog+Microservice", technologies: ["Node.js", "Prisma", "PostgreSQL", "JWT"],
    github: "https://github.com/SunidhiVyas/blog-microservice-project" },
  { id: 8, title: "Job Portal Microservice", category: "MICROSERVICES",
    description: "Job marketplace — job search, applications & recruiter panels split into services, with search & filters.",
    image: "https://dummyimage.com/640x400/0a1430/6db0ff&text=Job+Portal+Microservice", technologies: ["React", "Node.js", "MongoDB", "Docker"],
    github: "https://github.com/SunidhiVyas/microservice-job-portal" },
  { id: 9, title: "Tomato Food Delivery", category: "WEB APP",
    description: "Swiggy-like delivery frontend — menu, cart, checkout & order tracking with responsive UI.",
    image: "https://dummyimage.com/640x400/0a1430/6db0ff&text=Tomato+Food+Delivery", technologies: ["React", "JavaScript", "CSS", "REST APIs"],
    github: "https://github.com/SunidhiVyas/tomato-food-delivery" },
  { id: 10, title: "Butterfly Effect Dashboard", category: "DATA · DASHBOARD",
    description: "Economic dashboard visualizing butterfly-effect causality — interactive charts, filters & Power BI style insights.",
    image: "https://dummyimage.com/640x400/0a1430/6db0ff&text=Butterfly+Dashboard", technologies: ["Python", "Power BI", "Data Viz", "Excel"],
    github: "https://github.com/SunidhiVyas/Economic-Butterfly-Effect-Dashboard" },
  { id: 11, title: "Intelligent Abstention AI", category: "AI / ML",
    description: "Two-model system where second model learns first model's uncertainty to decide trust vs reject — classical vs deep learning.",
    image: "https://dummyimage.com/640x400/0a1430/6db0ff&text=Intelligent+Abstention+AI", technologies: ["Python", "Scikit-learn", "PyTorch"],
    github: "https://github.com/SunidhiVyas/intelligent-abstention-ai" },
  { id: 12, title: "Market Regime Shift AI", category: "AI / ML · FINANCE",
    description: "Market regime detector — identifies shifts between bull/bear/sideways using ML signals and evaluation.",
    image: "https://dummyimage.com/640x400/0a1430/6db0ff&text=Market+Regime+Shift+AI", technologies: ["Python", "Scikit-learn", "PyTorch", "RAG"],
    github: "https://github.com/SunidhiVyas/market-regime-shift-ai" }
];
const projectsPerPage = 6;

window.PJ = { projects, perPage: projectsPerPage };
