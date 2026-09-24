/* ════════════════════════════════════════════════════════════════
   EDIT YOUR CONTACT INFO HERE.
   • Only social platforms with a real, non-empty url are shown —
     nothing is invented.
   • handleSubmit() below is the one place to wire up a real form
     backend (Formspree, an API route, EmailJS, etc). Until you do,
     submitting shows an honest inline message instead of a fake
     "sent" confirmation.
   ════════════════════════════════════════════════════════════════ */
const contactConfig = {
  name: "Sunidhi Vyas",
  email: "vyaskhushi14@gmail.com",
  socialLinks: [
    { name: "GitHub",    url: "https://github.com/SunidhiVyas" },
    { name: "LinkedIn",  url: "https://linkedin.com/in/sunidhi-vyas" },
    { name: "Instagram", url: "https://instagram.com/v.khushiii" }
  ]
};

// Wire this up to a real backend/email service. Return {ok:true} on success.
// Example (Formspree):
//   const r = await fetch('https://formspree.io/f/xxxxxx', {method:'POST', headers:{Accept:'application/json'}, body:new FormData(formEl)});
//   return { ok: r.ok };
async function handleSubmit(formEl, data){
  void formEl; void data;
  return { ok:false, reason:"No form backend is connected yet. Add one in handleSubmit() inside the Contact section." };
}

window.CONTACT = { contactConfig, handleSubmit };
