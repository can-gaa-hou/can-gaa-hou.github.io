/**
 * Main JavaScript — Claude Code inspired personal site
 */

document.addEventListener('DOMContentLoaded', () => {
  initTaglineCycler();
  initChat();
  initScrollAnimations();
  initMobileNav();
  initSmoothScroll();
});

// --- Tagline cycler ---

function initTaglineCycler() {
  const el = document.getElementById('heroTaglineText');
  if (!el) return;

  const taglines = [
    'Exploring the frontier of <span class="text-accent">LLM inference</span>, building <span class="text-accent">high-performance systems</span>, and sharing what I learn along the way.',
    'Diving deep into <span class="text-accent">LLM internals</span>, from Attention to CUDA Graph capture.',
    'Optimizing <span class="text-accent">GPU kernels</span> and making every FLOP count at scale.',
  ];

  let current = 0;
  let charIndex = 0;
  let typing = true;
  let pauseTimer = null;

  function tick() {
    const text = taglines[current];

    if (typing) {
      charIndex++;
      el.innerHTML = text.slice(0, charIndex);
      if (charIndex >= text.length) {
        typing = false;
        pauseTimer = setTimeout(tick, 3000);
        return;
      }
    } else {
      charIndex--;
      el.innerHTML = text.slice(0, charIndex);
      if (charIndex <= 0) {
        typing = true;
        current = (current + 1) % taglines.length;
      }
    }

    const speed = typing ? 40 + Math.random() * 40 : 15 + Math.random() * 15;
    pauseTimer = setTimeout(tick, speed);
  }

  pauseTimer = setTimeout(tick, 600);
}

// --- Chat ---

function initChat() {
  const input = document.getElementById('chatInput');
  const sendBtn = document.getElementById('chatSend');
  const messagesEl = document.getElementById('chatMessages');
  if (!input) return;

  let streaming = false;

  async function sendMessage() {
    const text = input.value.trim();
    if (!text || streaming) return;
    input.value = '';
    streaming = true;

    // Add user message
    addMessage('user', text);

    // Add loading placeholder
    const loadingId = addLoading();

    try {
      const apiUrl = '/api/chat';

      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      // Remove loading, add assistant message
      removeLoading(loadingId);
      const msgId = addMessage('assistant', '');

      // Stream the response via SSE
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            if (parsed.text) {
              appendToMessage(msgId, parsed.text);
            }
            if (parsed.error) {
              appendToMessage(msgId, '\n\n⚠️ ' + parsed.error);
            }
          } catch {}
        }
      }
    } catch (err) {
      removeLoading(loadingId);
      addMessage('assistant', '⚠️ Unable to reach the server. Make sure the API is deployed.');
      console.error('Chat error:', err);
    }

    streaming = false;
  }

  function addMessage(role, content) {
    const id = 'msg-' + Date.now();
    const prefix = role === 'user' ? '>' : '';
    const html = `
      <div class="chat-msg chat-msg-${role}${role === 'assistant' && !content ? ' chat-msg-streaming' : ''}" id="${id}">
        <span class="chat-msg-prefix">${prefix}</span>
        <span class="chat-msg-content">${escapeHtml(content)}</span>
      </div>`;
    messagesEl.insertAdjacentHTML('beforeend', html);
    messagesEl.classList.add('has-content');
    scrollToBottom();
    return id;
  }

  function addLoading() {
    const id = 'loading-' + Date.now();
    const html = `
      <div class="chat-msg" id="${id}">
        <span class="chat-msg-prefix"></span>
        <span class="chat-msg-content">
          <div class="chat-loading"><span></span><span></span><span></span></div>
        </span>
      </div>`;
    messagesEl.insertAdjacentHTML('beforeend', html);
    messagesEl.classList.add('has-content');
    scrollToBottom();
    return id;
  }

  function removeLoading(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
  }

  function appendToMessage(id, text) {
    const el = document.getElementById(id);
    if (!el) return;
    const content = el.querySelector('.chat-msg-content');
    content.textContent += text;
    scrollToBottom();
  }

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Event listeners
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  sendBtn.addEventListener('click', sendMessage);
}

// --- Scroll Animations ---

function initScrollAnimations() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.1,
    rootMargin: '0px 0px -20px 0px'
  });

  document.querySelectorAll('.animate-in').forEach(el => {
    observer.observe(el);
  });
}

// --- Mobile Navigation ---

function initMobileNav() {
  const toggle = document.getElementById('navToggle');
  const links = document.getElementById('navLinks');

  if (!toggle || !links) return;

  toggle.addEventListener('click', () => {
    toggle.classList.toggle('active');
    links.classList.toggle('open');
  });

  // Close mobile nav on link click
  links.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      toggle.classList.remove('active');
      links.classList.remove('open');
    });
  });

  // Close mobile nav on outside click
  document.addEventListener('click', (e) => {
    if (!toggle.contains(e.target) && !links.contains(e.target)) {
      toggle.classList.remove('active');
      links.classList.remove('open');
    }
  });
}

// --- Smooth Scroll ---

function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        const navHeight = document.querySelector('.nav').offsetHeight;
        const top = target.getBoundingClientRect().top + window.scrollY - navHeight - 16;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
  });
}
