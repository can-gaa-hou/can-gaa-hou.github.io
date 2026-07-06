/**
 * Blog page — paginated post listing
 */

const PAGE_SIZE = 9;

document.addEventListener('DOMContentLoaded', async () => {
  await renderBlogPage();
  initMobileNav();
});

async function renderBlogPage() {
  const grid = document.getElementById('blogGrid');
  const empty = document.getElementById('blogEmpty');
  const pagination = document.getElementById('pagination');
  const countEl = document.getElementById('postCount');

  try {
    const res = await fetch('posts/manifest.json');
    const allPosts = await res.json();

    // Sort by date descending
    allPosts.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (allPosts.length === 0) {
      empty.style.display = 'block';
      return;
    }

    countEl.textContent = `${allPosts.length} post${allPosts.length > 1 ? 's' : ''}`;

    // Pagination
    const totalPages = Math.ceil(allPosts.length / PAGE_SIZE);
    const params = new URLSearchParams(window.location.search);
    const currentPage = Math.max(1, Math.min(parseInt(params.get('page')) || 1, totalPages));

    const start = (currentPage - 1) * PAGE_SIZE;
    const pagePosts = allPosts.slice(start, start + PAGE_SIZE);

    // Render cards
    grid.innerHTML = pagePosts.map(post => renderCard(post)).join('');

    // Render pagination
    if (totalPages > 1) {
      pagination.innerHTML = renderPagination(currentPage, totalPages);
      pagination.style.display = 'flex';
      pagination.querySelectorAll('.pagination-link').forEach(link => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          const page = parseInt(link.dataset.page);
          window.location.href = `posts.html?page=${page}`;
        });
      });
    } else {
      pagination.style.display = 'none';
    }

  } catch (err) {
    console.error('Failed to load posts:', err);
    empty.style.display = 'block';
    empty.querySelector('p').textContent = 'Failed to load posts. Please try again later.';
  }
}

function renderCard(post) {
  const date = new Date(post.date);
  const formattedDate = date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const tags = (post.tags || []).slice(0, 4).map(t =>
    `<span class="blog-card-tag">${escapeHtml(t)}</span>`
  ).join('');

  const href = post.type === 'local'
    ? `post.html?slug=${encodeURIComponent(post.slug)}`
    : post.url;
  const isExternal = post.type === 'external';

  return `
    <a href="${escapeHtml(href)}"
       ${isExternal ? 'target="_blank" rel="noopener"' : ''}
       class="blog-card">
      <div class="blog-card-header">
        <span class="blog-card-source">${escapeHtml(post.source || 'Blog')}</span>
      </div>
      <h3 class="blog-card-title">${escapeHtml(post.title)}</h3>
      ${post.description ? `<p class="blog-card-desc">${escapeHtml(post.description)}</p>` : ''}
      <div class="blog-card-meta">
        <span class="blog-card-date">${formattedDate}</span>
        <div class="blog-card-tags">${tags}</div>
      </div>
    </a>
  `;
}

function renderPagination(current, total) {
  let html = '';

  // Previous
  html += `<a href="?page=${current - 1}" class="pagination-link" data-page="${current - 1}" ${current === 1 ? 'disabled' : ''}>← Prev</a>`;

  // Page numbers
  const pages = getPageNumbers(current, total);
  for (const p of pages) {
    if (p === '…') {
      html += `<span class="pagination-ellipsis">…</span>`;
    } else {
      html += `<a href="?page=${p}" class="pagination-link${p === current ? ' active' : ''}" data-page="${p}">${p}</a>`;
    }
  }

  // Next
  html += `<a href="?page=${current + 1}" class="pagination-link" data-page="${current + 1}" ${current === total ? 'disabled' : ''}>Next →</a>`;

  return html;
}

function getPageNumbers(current, total) {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages = [];
  pages.push(1);

  if (current > 3) pages.push('…');

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (current < total - 2) pages.push('…');
  pages.push(total);

  return pages;
}

// --- Mobile nav (shared) ---

function initMobileNav() {
  const toggle = document.getElementById('navToggle');
  const links = document.getElementById('navLinks');
  if (!toggle || !links) return;

  toggle.addEventListener('click', () => {
    toggle.classList.toggle('active');
    links.classList.toggle('open');
  });

  links.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      toggle.classList.remove('active');
      links.classList.remove('open');
    });
  });

  document.addEventListener('click', (e) => {
    if (!toggle.contains(e.target) && !links.contains(e.target)) {
      toggle.classList.remove('active');
      links.classList.remove('open');
    }
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
