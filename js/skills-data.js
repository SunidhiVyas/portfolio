/* ════════════════════════════════════════════════════════════════
   EDIT YOUR SKILLS HERE — everything on the page + the 3D universe
   is generated from this one structure.

   ⚠ These are DEFAULT PLACEHOLDERS. Delete anything you don't
     actually know, add whatever you do. Nothing else is hard-coded.

   S(name, description, related, extra)
     related  → names of other skills to connect to when selected
     extra    → { level:90, years:3, since:2023, projects:["Name",…],
                  featured:true }   (all optional)
   • level / years / since / projects are NEVER invented: leave them
     out and those fields simply don't appear in the popup.
   • featured:true → shown as a permanent orbiting node (label always
     visible). Other skills still appear as dim nodes and light up on
     hover / search / category select.
   • "USED IN EXPERIENCE" is filled automatically from the
     `technologies` lists in your Experience data.
   ════════════════════════════════════════════════════════════════ */
const S = (name, description = "", related = [], extra = {}) =>
  ({ name, description, level: null, years: null, since: null, projects: [], related, featured: false, ...extra });

const skillCategories = [
  { name: "Programming Languages", icon: "code", description: "Core languages",
    skills: [
      S("Python", "General-purpose — async, service-oriented design", ["Node.js", "SQL", "LangChain"], { featured: true }),
      S("TypeScript", "Typed superset of JavaScript", ["JavaScript", "React", "Next.js"], { featured: true }),
      S("JavaScript", "The language of the web", ["TypeScript", "React", "Node.js"], { featured: true }),
      S("SQL", "Querying relational data", ["PostgreSQL", "MySQL", "Prisma"]),
      S("C++", "Systems programming", ["Python", "SQL"])
    ] },
  { name: "Frontend", icon: "monitor", description: "Interfaces & interaction",
    skills: [
      S("React", "Component-based UI library", ["Next.js", "JavaScript", "TypeScript", "Three.js"], { featured: true }),
      S("Next.js", "React framework — SSR, SSG, routing", ["React", "TypeScript", "Tailwind CSS", "Node.js"], { featured: true }),
      S("Tailwind CSS", "Utility-first CSS framework", ["CSS", "React", "Next.js"], { featured: true }),
      S("HTML", "Semantic structure for the web", ["CSS", "JavaScript"]),
      S("CSS", "Styling, layout and motion", ["HTML", "Tailwind CSS"]),
      S("Three.js", "3D graphics on the web", ["JavaScript", "React"], { featured: true }),
      S("Redux Toolkit", "State management for React", ["React", "Zustand", "React Query"]),
      S("Zustand", "Minimal state management", ["React", "Redux Toolkit"]),
      S("React Query", "Server-state & data fetching", ["React", "REST APIs"])
    ] },
  { name: "Backend & APIs", icon: "server", description: "Servers, APIs & logic",
    skills: [
      S("Node.js", "JavaScript runtime for servers", ["Express.js", "JavaScript", "REST APIs", "MongoDB"], { featured: true }),
      S("Express.js", "Minimal Node.js web framework", ["Node.js", "REST APIs", "JWT"]),
      S("REST APIs", "Resource-based HTTP interfaces", ["Node.js", "Express.js", "PostgreSQL"], { featured: true }),
      S("JWT", "Token-based authentication", ["REST APIs", "Node.js", "Express.js"])
    ] },
  { name: "Database", icon: "database", description: "Storing & querying data",
    skills: [
      S("PostgreSQL", "Relational — schema design, Prisma ORM", ["MySQL", "Prisma", "SQL"], { featured: true }),
      S("MySQL", "Relational — performance tuning", ["PostgreSQL", "SQL"]),
      S("MongoDB", "Document-oriented database", ["Node.js", "Express.js"]),
      S("Prisma", "Type-safe ORM for Postgres", ["PostgreSQL", "TypeScript", "Next.js"])
    ] },
  { name: "Cloud & Infrastructure", icon: "cloud", description: "Shipping & infrastructure",
    skills: [
      S("AWS", "Deployment & configuration, environment troubleshooting", ["Docker", "Kubernetes"], { featured: true }),
      S("Docker", "Containerised environments", ["AWS", "Kubernetes"], { featured: true }),
      S("Kubernetes", "Container orchestration (basic)", ["Docker", "AWS"]),
      S("Git", "Version control", ["GitHub"]),
      S("GitHub", "Code hosting & collaboration", ["Git", "Docker"], { featured: true })
    ] },
  { name: "AI / ML", icon: "cpu", description: "Intelligent features",
    skills: [
      S("LLMs", "Large language models", ["RAG", "Prompt Engineering", "LangChain"], { featured: true }),
      S("Prompt Engineering", "Designing effective prompts", ["LLMs", "RAG"]),
      S("RAG", "Retrieval-augmented generation", ["LLMs", "LangChain", "OpenAI SDK"], { featured: true }),
      S("LangChain", "LLM orchestration framework", ["LLMs", "RAG", "OpenAI SDK"]),
      S("OpenAI SDK", "OpenAI API integration", ["RAG", "LangChain", "LLMs"]),
      S("Ollama", "Local LLM runtime", ["LLMs", "Python"]),
      S("Scikit-learn", "Classical ML library", ["PyTorch", "Python"]),
      S("PyTorch", "Deep learning framework (basic)", ["Scikit-learn", "Python"])
    ] },
  { name: "Data & Tools", icon: "wrench", description: "Data, analytics & workflow",
    skills: [
      S("Power BI", "Business intelligence & dashboards", ["Excel"]),
      S("Excel", "Data visualization & analysis", ["Power BI"]),
      S("VS Code", "Code editor", ["Git", "GitHub"], { featured: true }),
      S("Jupyter Notebook", "Interactive Python notebooks", ["Python", "Scikit-learn"])
    ] }
];

const currentlyLearning = "Kubernetes & advanced RAG evaluation";

/* ───────── render (no need to edit below) ───────── */
window.SKILLS = { skillCategories, currentlyLearning };
(function(){
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const ICONS = {
    monitor:'<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/>',
    server:'<rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/><path d="M7 7h.01M7 17h.01"/>',
    database:'<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
    cloud:'<path d="M7 18a4 4 0 0 1-.5-7.97A6 6 0 0 1 18 9.5 4.25 4.25 0 0 1 17.5 18H7Z"/>',
    wrench:'<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4 2.6-2.6Z"/>',
    cpu:'<rect x="6" y="6" width="12" height="12" rx="1.5"/><rect x="9.5" y="9.5" width="5" height="5"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
    code:'<path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14"/>'
  };
  window.SKILLS.ICONS = ICONS;
  const _sl = document.getElementById('skLearning'); if(_sl) _sl.textContent = currentlyLearning;
  document.getElementById('skCats').innerHTML = skillCategories.map((c,ci)=>`
    <article class="skc skrv" data-c="${ci}" tabindex="0" aria-label="${esc(c.name)}">
      <header><span class="ico"><svg viewBox="0 0 24 24">${ICONS[c.icon]||ICONS.code}</svg></span><h3>${esc(c.name)}</h3><i class="arw">→</i></header>
      ${c.description?`<p class="cd">${esc(c.description)}</p>`:''}
      <ul class="chips">${c.skills.map(s=>`<li><button type="button" class="ski" data-c="${ci}" data-s="${esc(s.name)}">${esc(s.name)}</button></li>`).join('')}</ul>
    </article>`).join('');
})();
