/**
 * Post page — loads and renders markdown articles
 */

document.addEventListener('DOMContentLoaded', () => {
  loadAndRenderPost();
});

async function loadAndRenderPost() {
  const article = document.getElementById('article');
  const slug = new URLSearchParams(window.location.search).get('slug');

  if (!slug) {
    showError(article, 'No post specified.', 'Please select a post from the posts page.');
    return;
  }

  try {
    // Fetch manifest to get post metadata
    const manifestRes = await fetch('posts/manifest.json');
    const manifest = await manifestRes.json();
    const post = manifest.find(p => p.slug === slug);

    if (!post) {
      showError(article, 'Post not found.', `No post matching "${slug}".`);
      return;
    }

    // External posts redirect
    if (post.type === 'external' && post.url) {
      window.location.href = post.url;
      return;
    }

    // Fetch markdown content
    const mdRes = await fetch(`posts/${encodeURIComponent(post.file)}`);
    if (!mdRes.ok) throw new Error(`Failed to load post: ${mdRes.status}`);
    const markdown = await mdRes.text();

    // Render
    renderPost(article, post, markdown);

  } catch (err) {
    console.error('Failed to load post:', err);
    showError(article, 'Failed to load post.', err.message);
  }
}

function renderPost(container, post, markdown) {
  const date = new Date(post.date);
  const formattedDate = date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const tagsHtml = (post.tags || []).map(t =>
    `<span class="article-tag">${escapeHtml(t)}</span>`
  ).join('');

  // Parse markdown with marked
  let htmlContent;
  try {
    marked.setOptions({
      breaks: true,
      gfm: true,
    });
    htmlContent = marked.parse(markdown);
  } catch (err) {
    htmlContent = `<p>Failed to render content.</p>`;
  }

  container.innerHTML = `
    <header class="article-header">
      <a href="posts.html" class="article-back">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
        Back to Posts
      </a>
      <div class="article-meta-top">
        ${post.source ? `<span class="article-source">${escapeHtml(post.source)}</span>` : ''}
        <span class="article-date">${formattedDate}</span>
      </div>
      <h1 class="article-title">${escapeHtml(post.title)}</h1>
      <div class="article-tags">${tagsHtml}</div>
    </header>
    <div class="article-body">${htmlContent}</div>
    <footer class="article-footer">
      <div class="article-footer-nav">
        <a href="posts.html">← Back to Posts</a>
        <a href="index.html">Home</a>
      </div>
    </footer>
  `;

  // Update page title
  document.title = `${post.title} — Jiahao Chen`;

  // Inject Giscus
  const giscusWrap = document.getElementById('giscusContainer');
  if (giscusWrap) {
    const script = document.createElement('script');
    script.src = 'https://giscus.app/client.js';
    script.setAttribute('data-repo', 'can-gaa-hou/can-gaa-hou.github.io');
    script.setAttribute('data-repo-id', 'R_kgDOO4CxiQ');
    script.setAttribute('data-category', 'General');
    script.setAttribute('data-category-id', 'DIC_kwDOO4Cxic4DAmHS');
    script.setAttribute('data-mapping', 'pathname');
    script.setAttribute('data-strict', '0');
    script.setAttribute('data-reactions-enabled', '1');
    script.setAttribute('data-emit-metadata', '0');
    script.setAttribute('data-input-position', 'top');
    script.setAttribute('data-theme', 'dark_dimmed');
    script.setAttribute('data-lang', 'zh-CN');
    script.setAttribute('crossorigin', 'anonymous');
    script.async = true;
    giscusWrap.appendChild(script);
  }
}

function showError(container, title, message) {
  container.innerHTML = `
    <div class="article-error">
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(message)}</p>
      <a href="posts.html">← Back to Posts</a>
    </div>
  `;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
