/* ════════════════════════════════════════════════════════════════
   EDIT YOUR CONTENT HERE — everything below feeds the page AND the
   particle laptop (screen text, stream of particles, etc.)
   ════════════════════════════════════════════════════════════════ */
const experiences = [
  {
    company: "Green Rider Technology",
    role: "Software Engineer — Full-Stack & Backend",
    period: "Feb 2024 — June 2025 · On-Site",
    description: "Built, tested, and debugged production features in Python, JavaScript, HTML and CSS to high standards for quality, security and documentation. Built and connected backend services and API workflows — function calling, parameter handling and data validation — and improved reliability through systematic testing, code reviews and sprint planning with engineers, QA and product.",
    technologies: ["Python", "JavaScript", "REST APIs", "SQL", "OpenAI APIs", "RAG", "PostgreSQL", "Node.js"]
  }
];

const skills = [
  { group: "LANGUAGES", items: ["Python", "TypeScript", "JavaScript", "SQL", "C++"] },
  { group: "FRONTEND", items: ["React", "Next.js", "Tailwind CSS", "Three.js", "Redux Toolkit", "Zustand", "React Query"] },
  { group: "BACKEND",  items: ["Python", "Node.js", "Express.js", "REST APIs", "JWT"] },
  { group: "DATABASE", items: ["PostgreSQL", "MySQL", "MongoDB", "Prisma"] },
  { group: "CLOUD",    items: ["AWS", "Docker", "Kubernetes"] },
  { group: "AI / ML",  items: ["LLMs", "RAG", "LangChain", "OpenAI SDK", "Ollama", "Scikit-learn", "PyTorch"] },
  { group: "TOOLS",    items: ["Git", "GitHub", "VS Code", "Jupyter"] }
];

// Shown on the laptop screen before any experience is selected
const profile = {
  role: "Software Engineer — Full-Stack & Backend",
  passion: "Building & testing production software across backend, frontend and data layers",
  stack: ["Python", "Node.js", "PostgreSQL"]
};

/* ───────── render (no need to edit below) ───────── */
window.PORTFOLIO = { experiences, skills, profile };
(function(){
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const tl = document.getElementById('tl');
  experiences.forEach((e,i)=>{
    const li = document.createElement('li');
    li.className = 'xp'; li.dataset.i = i; li.tabIndex = 0;
    li.innerHTML = `<span class="node"></span>
      <div class="hd"><span class="num">${String(i+1).padStart(2,'0')}</span><h3>${esc(e.company)}</h3></div>
      <p class="role"><span>${esc(e.role)}</span><time>${esc(e.period)}</time></p>
      <p class="desc">${esc(e.description)}</p>
      <p class="tech"><b>TECH:</b>${e.technologies.map(esc).join(' · ')}</p>`;
    tl.appendChild(li);
  });
  const skillsEl = document.getElementById('skills');
  if(skillsEl) skillsEl.innerHTML = skills.map(g =>
    `<div class="sk"><h4>${esc(g.group)}</h4><ul>${g.items.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`).join('');
})();
