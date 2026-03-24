import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const runtimeConfig = window.__COMMUNITY_CONFIG__ || {};
const supabaseUrl = runtimeConfig.supabaseUrl || "";
const supabaseKey = runtimeConfig.supabaseKey || runtimeConfig.supabaseAnonKey || "";

const state = {
  authMode: "signin",
  sort: "hot",
  search: "",
  client: null,
  session: null,
  profile: null,
  galleries: [],
  posts: [],
  comments: [],
  selectedGalleryId: null,
  selectedPostId: null,
  replyParentId: null,
  postVotes: new Map(),
  commentVotes: new Map(),
  savedPosts: new Set(),
};

const dom = {
  searchInput: document.querySelector("#searchInput"),
  refreshButton: document.querySelector("#refreshButton"),
  jumpThreadButton: document.querySelector("#jumpThreadButton"),
  signOutButton: document.querySelector("#signOutButton"),
  focusComposerButton: document.querySelector("#focusComposerButton"),
  focusAuthButton: document.querySelector("#focusAuthButton"),
  galleriesCount: document.querySelector("#galleriesCount"),
  postsCount: document.querySelector("#postsCount"),
  sessionState: document.querySelector("#sessionState"),
  sessionHint: document.querySelector("#sessionHint"),
  galleryHeading: document.querySelector("#galleryHeading"),
  clearGalleryButton: document.querySelector("#clearGalleryButton"),
  galleryForm: document.querySelector("#galleryForm"),
  galleryName: document.querySelector("#galleryName"),
  gallerySlug: document.querySelector("#gallerySlug"),
  galleryDescription: document.querySelector("#galleryDescription"),
  galleryVisibility: document.querySelector("#galleryVisibility"),
  galleryNsfw: document.querySelector("#galleryNsfw"),
  galleryList: document.querySelector("#galleryList"),
  composerState: document.querySelector("#composerState"),
  postForm: document.querySelector("#postForm"),
  postGallerySelect: document.querySelector("#postGallerySelect"),
  postType: document.querySelector("#postType"),
  postTitle: document.querySelector("#postTitle"),
  postUrl: document.querySelector("#postUrl"),
  postBody: document.querySelector("#postBody"),
  postNsfw: document.querySelector("#postNsfw"),
  feedHeading: document.querySelector("#feedHeading"),
  feedSummary: document.querySelector("#feedSummary"),
  postList: document.querySelector("#postList"),
  sortGroup: document.querySelector("#sortGroup"),
  authHeading: document.querySelector("#authHeading"),
  authStateBadge: document.querySelector("#authStateBadge"),
  profileCard: document.querySelector("#profileCard"),
  authModeTabs: document.querySelector("#authModeTabs"),
  authForm: document.querySelector("#authForm"),
  authEmail: document.querySelector("#authEmail"),
  authPassword: document.querySelector("#authPassword"),
  authDisplayName: document.querySelector("#authDisplayName"),
  authSubmitButton: document.querySelector("#authSubmitButton"),
  displayNameField: document.querySelector("#displayNameField"),
  profileForm: document.querySelector("#profileForm"),
  profileUsername: document.querySelector("#profileUsername"),
  profileDisplayName: document.querySelector("#profileDisplayName"),
  profileBio: document.querySelector("#profileBio"),
  threadPanel: document.querySelector("#threadPanel"),
  threadHeading: document.querySelector("#threadHeading"),
  threadState: document.querySelector("#threadState"),
  clearThreadButton: document.querySelector("#clearThreadButton"),
  commentList: document.querySelector("#commentList"),
  commentForm: document.querySelector("#commentForm"),
  commentBody: document.querySelector("#commentBody"),
  commentTargetLabel: document.querySelector("#commentTargetLabel"),
  cancelReplyButton: document.querySelector("#cancelReplyButton"),
  configBadge: document.querySelector("#configBadge"),
  statusMessage: document.querySelector("#statusMessage"),
};

init().catch((error) => {
  console.error(error);
  setStatus(error.message || "Failed to initialize community app.", "error");
});

function runTask(task, fallbackMessage = "Something went wrong.") {
  Promise.resolve()
    .then(task)
    .catch((error) => {
      console.error(error);
      setStatus(error?.message || fallbackMessage, "error");
    });
}

async function init() {
  bindEvents();
  applyConfigBadge();
  setAuthMode("signin");

  if (!supabaseUrl || !supabaseKey) {
    syncUiState();
    setStatus("Missing config.js values. Add SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.", "error");
    return;
  }

  state.client = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
    },
  });

  const { data, error } = await state.client.auth.getSession();

  if (error) {
    throw error;
  }

  await hydrateSession(data.session);
  await refreshApp();
  setStatus("Community frontend connected to Supabase.", "success");

  state.client.auth.onAuthStateChange((_event, session) => {
    queueMicrotask(() => {
      runTask(async () => {
        await hydrateSession(session);
        await refreshApp();
      }, "Failed to refresh session state.");
    });
  });
}

function bindEvents() {
  dom.searchInput.addEventListener("input", (event) => {
    state.search = event.currentTarget.value.trim().toLowerCase();
    renderPosts();
  });

  dom.refreshButton.addEventListener("click", () => {
    runTask(async () => {
      await refreshApp();
      setStatus("Feed refreshed.", "success");
    }, "Failed to refresh feed.");
  });

  dom.jumpThreadButton.addEventListener("click", () => {
    dom.threadPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  dom.focusComposerButton.addEventListener("click", () => {
    dom.postForm.scrollIntoView({ behavior: "smooth", block: "start" });
    dom.postTitle.focus();
  });

  dom.focusAuthButton.addEventListener("click", () => {
    dom.authForm.scrollIntoView({ behavior: "smooth", block: "start" });
    dom.authEmail.focus();
  });

  dom.signOutButton.addEventListener("click", () => {
    runTask(async () => {
      if (!state.client) {
        return;
      }

      const { error } = await state.client.auth.signOut();

      if (error) {
        setStatus(error.message, "error");
        return;
      }

      state.replyParentId = null;
      setStatus("Signed out.", "success");
    }, "Failed to sign out.");
  });

  dom.authModeTabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-auth-mode]");

    if (button) {
      setAuthMode(button.dataset.authMode);
    }
  });

  dom.authForm.addEventListener("submit", (event) => {
    event.preventDefault();
    runTask(() => handleAuthSubmit(), "Failed to update authentication state.");
  });

  dom.profileForm.addEventListener("submit", (event) => {
    event.preventDefault();
    runTask(() => handleProfileSubmit(), "Failed to update profile.");
  });

  dom.galleryForm.addEventListener("submit", (event) => {
    event.preventDefault();
    runTask(() => handleGallerySubmit(), "Failed to create gallery.");
  });

  dom.clearGalleryButton.addEventListener("click", () => {
    runTask(async () => {
      state.selectedGalleryId = null;
      state.selectedPostId = null;
      state.replyParentId = null;
      await loadPosts();
      state.comments = [];
      state.commentVotes = new Map();
      renderAll();
    }, "Failed to clear the gallery filter.");
  });

  dom.postForm.addEventListener("submit", (event) => {
    event.preventDefault();
    runTask(() => handlePostSubmit(), "Failed to publish post.");
  });

  dom.sortGroup.addEventListener("click", (event) => {
    const button = event.target.closest("[data-sort]");

    if (button) {
      state.sort = button.dataset.sort;
      renderPosts();
    }
  });

  dom.galleryList.addEventListener("click", (event) => {
    const card = event.target.closest("[data-gallery-id]");

    if (!card) {
      return;
    }

    runTask(async () => {
      const nextGalleryId = card.dataset.galleryId;
      state.selectedGalleryId = nextGalleryId === state.selectedGalleryId ? null : nextGalleryId;
      state.selectedPostId = null;
      state.replyParentId = null;
      await loadPosts();
      state.comments = [];
      state.commentVotes = new Map();
      renderAll();
    }, "Failed to switch galleries.");
  });

  dom.postList.addEventListener("click", (event) => {
    const action = event.target.closest("[data-post-action]");
    const postCard = event.target.closest("[data-post-id]");

    runTask(async () => {
      if (action) {
        const { postId, postAction } = action.dataset;
        await handlePostAction(postId, postAction, action.dataset.vote);
        return;
      }

      if (postCard) {
        await selectPost(postCard.dataset.postId);
      }
    }, "Failed to update the post view.");
  });

  dom.clearThreadButton.addEventListener("click", () => {
    state.selectedPostId = null;
    state.replyParentId = null;
    state.comments = [];
    state.commentVotes = new Map();
    renderThread();
    renderPosts();
  });

  dom.commentList.addEventListener("click", (event) => {
    const action = event.target.closest("[data-comment-action]");

    if (!action) {
      return;
    }

    runTask(async () => {
      const { commentId, commentAction } = action.dataset;
      await handleCommentAction(commentId, commentAction, action.dataset.vote);
    }, "Failed to update the comment thread.");
  });

  dom.commentForm.addEventListener("submit", (event) => {
    event.preventDefault();
    runTask(() => handleCommentSubmit(), "Failed to publish comment.");
  });

  dom.cancelReplyButton.addEventListener("click", () => {
    state.replyParentId = null;
    renderThread();
  });

  dom.postType.addEventListener("change", () => {
    dom.postUrl.required = dom.postType.value === "link" || dom.postType.value === "image";
  });

  dom.galleryName.addEventListener("input", () => {
    if (!dom.gallerySlug.dataset.touched) {
      dom.gallerySlug.value = slugify(dom.galleryName.value);
    }
  });

  dom.gallerySlug.addEventListener("input", () => {
    dom.gallerySlug.dataset.touched = "true";
  });
}

async function refreshApp() {
  if (!state.client) {
    syncUiState();
    return;
  }

  await loadGalleries();
  await loadPosts();

  if (state.selectedPostId && state.posts.some((post) => post.id === state.selectedPostId)) {
    await loadComments();
  } else {
    state.selectedPostId = null;
    state.replyParentId = null;
    state.comments = [];
    state.commentVotes = new Map();
  }

  renderAll();
}

async function hydrateSession(session) {
  state.session = session;
  state.postVotes = new Map();
  state.commentVotes = new Map();
  state.savedPosts = new Set();

  if (session?.user) {
    state.profile = await ensureProfile(session.user);
  } else {
    state.profile = null;
    state.replyParentId = null;
  }

  syncUiState();
}

async function ensureProfile(user) {
  const selectResult = await state.client
    .from("profiles")
    .select("id, username, display_name, bio, avatar_url, role, reputation")
    .eq("id", user.id)
    .maybeSingle();

  if (selectResult.error) {
    throw selectResult.error;
  }

  if (selectResult.data) {
    return selectResult.data;
  }

  const fallbackDisplayName =
    user.user_metadata?.display_name ||
    user.user_metadata?.name ||
    user.email?.split("@")[0] ||
    "New user";

  const insertResult = await state.client
    .from("profiles")
    .insert({
      id: user.id,
      display_name: fallbackDisplayName,
      avatar_url: user.user_metadata?.avatar_url || null,
    })
    .select("id, username, display_name, bio, avatar_url, role, reputation")
    .single();

  if (insertResult.error) {
    throw insertResult.error;
  }

  return insertResult.data;
}

async function loadGalleries() {
  const result = await state.client
    .from("galleries")
    .select("id, slug, name, description, visibility, is_nsfw, member_count, post_count, created_at")
    .order("member_count", { ascending: false })
    .order("created_at", { ascending: false });

  if (result.error) {
    throw result.error;
  }

  state.galleries = result.data || [];

  if (state.selectedGalleryId && !state.galleries.some((gallery) => gallery.id === state.selectedGalleryId)) {
    state.selectedGalleryId = null;
  }
}

async function loadPosts() {
  let query = state.client
    .from("posts")
    .select(
      [
        "id",
        "gallery_id",
        "author_id",
        "type",
        "status",
        "title",
        "body",
        "url",
        "is_nsfw",
        "is_pinned",
        "is_locked",
        "upvote_count",
        "downvote_count",
        "score",
        "comment_count",
        "created_at",
        "gallery:galleries!posts_gallery_id_fkey(id, slug, name, visibility)",
        "author:profiles!posts_author_id_fkey(id, username, display_name, avatar_url)",
      ].join(", ")
    )
    .order("is_pinned", { ascending: false })
    .order("score", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(80);

  if (state.selectedGalleryId) {
    query = query.eq("gallery_id", state.selectedGalleryId);
  }

  const result = await query;

  if (result.error) {
    throw result.error;
  }

  state.posts = result.data || [];

  if (state.session?.user && state.posts.length > 0) {
    const postIds = state.posts.map((post) => post.id);
    const [votesResult, savedResult] = await Promise.all([
      state.client.from("post_votes").select("post_id, value").in("post_id", postIds),
      state.client.from("saved_posts").select("post_id").in("post_id", postIds),
    ]);

    if (votesResult.error) {
      throw votesResult.error;
    }

    if (savedResult.error) {
      throw savedResult.error;
    }

    state.postVotes = new Map((votesResult.data || []).map((vote) => [vote.post_id, vote.value]));
    state.savedPosts = new Set((savedResult.data || []).map((row) => row.post_id));
  } else {
    state.postVotes = new Map();
    state.savedPosts = new Set();
  }

  if (state.selectedPostId && !state.posts.some((post) => post.id === state.selectedPostId)) {
    state.selectedPostId = null;
  }
}

async function loadComments() {
  if (!state.selectedPostId) {
    state.comments = [];
    state.commentVotes = new Map();
    return;
  }

  const result = await state.client
    .from("comments")
    .select(
      [
        "id",
        "gallery_id",
        "post_id",
        "author_id",
        "parent_id",
        "body",
        "status",
        "depth",
        "upvote_count",
        "downvote_count",
        "score",
        "created_at",
        "author:profiles!comments_author_id_fkey(id, username, display_name, avatar_url)",
      ].join(", ")
    )
    .eq("post_id", state.selectedPostId)
    .order("created_at", { ascending: true });

  if (result.error) {
    throw result.error;
  }

  state.comments = result.data || [];

  if (state.session?.user && state.comments.length > 0) {
    const commentIds = state.comments.map((comment) => comment.id);
    const votesResult = await state.client
      .from("comment_votes")
      .select("comment_id, value")
      .in("comment_id", commentIds);

    if (votesResult.error) {
      throw votesResult.error;
    }

    state.commentVotes = new Map((votesResult.data || []).map((vote) => [vote.comment_id, vote.value]));
  } else {
    state.commentVotes = new Map();
  }
}

async function handleAuthSubmit() {
  if (!state.client) {
    return;
  }

  const email = dom.authEmail.value.trim();
  const password = dom.authPassword.value.trim();
  const displayName = dom.authDisplayName.value.trim();

  if (!email || !password) {
    setStatus("Email and password are required.", "error");
    return;
  }

  if (state.authMode === "signup") {
    const result = await state.client.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName || email.split("@")[0],
        },
      },
    });

    if (result.error) {
      setStatus(result.error.message, "error");
      return;
    }

    dom.authPassword.value = "";

    if (result.data.session) {
      setStatus("Account created and signed in.", "success");
    } else {
      setStatus("Account created. Check your email if confirmation is enabled.", "warning");
    }

    return;
  }

  const result = await state.client.auth.signInWithPassword({ email, password });

  if (result.error) {
    setStatus(result.error.message, "error");
    return;
  }

  dom.authPassword.value = "";
  setStatus("Signed in successfully.", "success");
}

async function handleProfileSubmit() {
  if (!state.session?.user || !state.client) {
    setStatus("Sign in before updating your profile.", "warning");
    return;
  }

  const username = dom.profileUsername.value.trim().toLowerCase();
  const displayName = dom.profileDisplayName.value.trim();
  const bio = dom.profileBio.value.trim();

  if (username && !/^[a-z0-9_]{3,24}$/.test(username)) {
    setStatus("Username must use 3-24 lowercase letters, numbers, or underscores.", "error");
    return;
  }

  const result = await state.client
    .from("profiles")
    .update({
      username: username || null,
      display_name: displayName || state.profile?.display_name || "New user",
      bio,
    })
    .eq("id", state.session.user.id)
    .select("id, username, display_name, bio, avatar_url, role, reputation")
    .single();

  if (result.error) {
    setStatus(result.error.message, "error");
    return;
  }

  state.profile = result.data;
  renderAccount();
  renderPosts();
  renderThread();
  setStatus("Profile updated.", "success");
}

async function handleGallerySubmit() {
  if (!state.session?.user || !state.client) {
    setStatus("Sign in before creating a gallery.", "warning");
    return;
  }

  const slug = slugify(dom.gallerySlug.value || dom.galleryName.value);
  const name = dom.galleryName.value.trim();
  const description = dom.galleryDescription.value.trim();

  if (!name || !slug) {
    setStatus("Gallery name and slug are required.", "error");
    return;
  }

  const result = await state.client
    .from("galleries")
    .insert({
      slug,
      name,
      description,
      visibility: dom.galleryVisibility.value,
      is_nsfw: dom.galleryNsfw.checked,
      creator_id: state.session.user.id,
    })
    .select("id")
    .single();

  if (result.error) {
    setStatus(result.error.message, "error");
    return;
  }

  dom.galleryForm.reset();
  delete dom.gallerySlug.dataset.touched;
  state.selectedGalleryId = result.data.id;
  await refreshApp();
  setStatus("Gallery created.", "success");
}

async function handlePostSubmit() {
  if (!state.session?.user || !state.client) {
    setStatus("Sign in before publishing a post.", "warning");
    return;
  }

  const galleryId = dom.postGallerySelect.value;
  const type = dom.postType.value;
  const title = dom.postTitle.value.trim();
  const body = dom.postBody.value.trim();
  const url = dom.postUrl.value.trim();

  if (!galleryId || !title) {
    setStatus("Choose a gallery and enter a title.", "error");
    return;
  }

  if ((type === "link" || type === "image") && !url) {
    setStatus("Link and image posts need a URL.", "error");
    return;
  }

  const result = await state.client
    .from("posts")
    .insert({
      gallery_id: galleryId,
      author_id: state.session.user.id,
      type,
      title,
      body,
      url: url || null,
      is_nsfw: dom.postNsfw.checked,
    })
    .select("id")
    .single();

  if (result.error) {
    setStatus(result.error.message, "error");
    return;
  }

  dom.postForm.reset();
  dom.postUrl.required = false;
  state.selectedPostId = result.data.id;
  state.replyParentId = null;
  await refreshApp();
  setStatus("Post published.", "success");
}

async function handleCommentSubmit() {
  if (!state.session?.user || !state.client) {
    setStatus("Sign in before commenting.", "warning");
    return;
  }

  const post = getSelectedPost();
  const body = dom.commentBody.value.trim();

  if (!post) {
    setStatus("Select a post before commenting.", "warning");
    return;
  }

  if (!body) {
    setStatus("Comment body cannot be empty.", "error");
    return;
  }

  const result = await state.client
    .from("comments")
    .insert({
      gallery_id: post.gallery_id,
      post_id: post.id,
      author_id: state.session.user.id,
      parent_id: state.replyParentId,
      body,
    })
    .select("id")
    .single();

  if (result.error) {
    setStatus(result.error.message, "error");
    return;
  }

  dom.commentForm.reset();
  state.replyParentId = null;
  await loadPosts();
  await loadComments();
  renderAll();
  setStatus("Comment published.", "success");
}

async function handlePostAction(postId, action, voteValue) {
  if (!state.client) {
    return;
  }

  if (action === "open") {
    await selectPost(postId);
    return;
  }

  if (!state.session?.user) {
    setStatus("Sign in to vote or save posts.", "warning");
    return;
  }

  if (action === "vote") {
    await toggleVote("post_votes", "post_id", postId, Number(voteValue), state.postVotes.get(postId));
    await loadPosts();

    if (state.selectedPostId === postId) {
      await loadComments();
    }

    renderAll();
    return;
  }

  if (action === "save") {
    await toggleSavedPost(postId);
    renderPosts();
  }
}

async function handleCommentAction(commentId, action, voteValue) {
  if (action === "reply") {
    if (!state.session?.user) {
      setStatus("Sign in to reply.", "warning");
      return;
    }

    state.replyParentId = commentId;
    renderThread();
    dom.commentBody.focus();
    return;
  }

  if (!state.session?.user) {
    setStatus("Sign in to vote on comments.", "warning");
    return;
  }

  if (action === "vote") {
    await toggleVote("comment_votes", "comment_id", commentId, Number(voteValue), state.commentVotes.get(commentId));
    await loadComments();
    await loadPosts();
    renderAll();
  }
}

async function toggleVote(table, keyColumn, rowId, nextValue, currentValue) {
  if (!state.session?.user) {
    return;
  }

  if (currentValue === nextValue) {
    const result = await state.client.from(table).delete().eq(keyColumn, rowId).eq("user_id", state.session.user.id);

    if (result.error) {
      setStatus(result.error.message, "error");
      return;
    }

    setStatus("Vote removed.", "success");
    return;
  }

  const result = await state.client.from(table).upsert({
    [keyColumn]: rowId,
    user_id: state.session.user.id,
    value: nextValue,
  });

  if (result.error) {
    setStatus(result.error.message, "error");
    return;
  }

  setStatus("Vote updated.", "success");
}

async function toggleSavedPost(postId) {
  if (state.savedPosts.has(postId)) {
    const result = await state.client
      .from("saved_posts")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", state.session.user.id);

    if (result.error) {
      setStatus(result.error.message, "error");
      return;
    }

    state.savedPosts.delete(postId);
    setStatus("Post removed from saved items.", "success");
    return;
  }

  const result = await state.client.from("saved_posts").insert({
    post_id: postId,
    user_id: state.session.user.id,
  });

  if (result.error) {
    setStatus(result.error.message, "error");
    return;
  }

  state.savedPosts.add(postId);
  setStatus("Post saved.", "success");
}

async function selectPost(postId) {
  state.selectedPostId = postId;
  state.replyParentId = null;
  await loadComments();
  renderAll();
  dom.threadPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderAll() {
  syncUiState();
  renderStats();
  renderGalleries();
  renderPostForm();
  renderPosts();
  renderAccount();
  renderThread();
}

function syncUiState() {
  const hasSession = Boolean(state.session?.user);
  const hasConfig = Boolean(state.client);
  const hasGalleryOptions = state.galleries.length > 0;
  const hasSelectedPost = Boolean(getSelectedPost());

  setFormDisabled(dom.galleryForm, !hasConfig || !hasSession);
  setFormDisabled(dom.postForm, !hasConfig || !hasSession || !hasGalleryOptions);
  setFormDisabled(dom.commentForm, !hasConfig || !hasSession || !hasSelectedPost);
  setFormDisabled(dom.profileForm, !hasConfig || !hasSession);
  setFormDisabled(dom.authForm, !hasConfig || hasSession);

  dom.signOutButton.hidden = !hasSession;
  dom.profileForm.hidden = !hasSession;
  dom.authForm.hidden = hasSession;
  dom.authModeTabs.hidden = hasSession;
  dom.displayNameField.hidden = state.authMode !== "signup";
  dom.refreshButton.disabled = !hasConfig;
  dom.jumpThreadButton.disabled = !hasSelectedPost;
  dom.focusComposerButton.disabled = !hasConfig || !hasSession || !hasGalleryOptions;
  dom.focusAuthButton.disabled = !hasConfig || hasSession;
  dom.clearGalleryButton.disabled = !hasConfig || !state.selectedGalleryId;
  dom.clearThreadButton.disabled = !hasSelectedPost;
}

function renderStats() {
  dom.galleriesCount.textContent = formatCount(state.galleries.length);
  dom.postsCount.textContent = formatCount(state.posts.length);

  if (state.session?.user) {
    dom.sessionState.textContent = "live";
    dom.sessionHint.textContent = state.profile?.display_name
      ? `signed in as ${state.profile.display_name}`
      : `signed in as ${state.session.user.email}`;
  } else {
    dom.sessionState.textContent = "guest";
    dom.sessionHint.textContent = "browse public galleries or sign in to write";
  }
}

function renderGalleries() {
  const selectedGallery = getSelectedGallery();
  dom.galleryHeading.textContent = selectedGallery ? selectedGallery.name : "All public feeds";

  if (state.galleries.length === 0) {
    dom.galleryList.innerHTML = '<article class="empty-card">No galleries yet. Sign in and create the first one.</article>';
    return;
  }

  dom.galleryList.innerHTML = state.galleries
    .map((gallery) => {
      const isActive = gallery.id === state.selectedGalleryId;
      const visibilityTone = gallery.visibility === "public" ? "badge-accent" : "badge-gold";

      return `
        <article class="gallery-card ${isActive ? "is-active" : ""}" data-gallery-id="${gallery.id}" tabindex="0">
          <div class="gallery-top">
            <div>
              <p class="feed-meta">g/${escapeHtml(gallery.slug)}</p>
              <h3>${escapeHtml(gallery.name)}</h3>
            </div>
            <div class="gallery-badges">
              <span class="post-badge ${visibilityTone}">${escapeHtml(gallery.visibility)}</span>
              ${gallery.is_nsfw ? '<span class="post-badge badge-danger">nsfw</span>' : ""}
            </div>
          </div>
          <p>${escapeHtml(gallery.description || "No description yet.")}</p>
          <div class="gallery-footer">
            <div class="meta-pills">
              <span class="post-badge">${formatCount(gallery.member_count)} members</span>
              <span class="post-badge">${formatCount(gallery.post_count)} posts</span>
            </div>
            <span class="muted-inline">${timeAgo(gallery.created_at)}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderPostForm() {
  const options = state.galleries
    .map((gallery, index) => {
      const shouldSelect =
        state.selectedGalleryId === gallery.id ||
        (!state.selectedGalleryId && index === 0);

      return `<option value="${gallery.id}" ${shouldSelect ? "selected" : ""}>g/${escapeHtml(gallery.slug)} - ${escapeHtml(
        gallery.name
      )}</option>`;
    })
    .join("");

  dom.postGallerySelect.innerHTML = options || '<option value="">No galleries available</option>';
  dom.composerState.textContent = state.session?.user ? "ready to publish" : "sign in required";
}

function renderPosts() {
  const selectedGallery = getSelectedGallery();
  dom.feedHeading.textContent = selectedGallery ? `${selectedGallery.name} feed` : "Live thread feed";

  const sortedPosts = getVisiblePosts();
  const galleryLabel = selectedGallery ? `g/${selectedGallery.slug}` : "all public galleries";
  dom.feedSummary.textContent = `${formatCount(sortedPosts.length)} posts shown from ${galleryLabel}. Sort: ${state.sort}.`;

  Array.from(dom.sortGroup.querySelectorAll("[data-sort]")).forEach((button) => {
    button.classList.toggle("is-active", button.dataset.sort === state.sort);
  });

  if (sortedPosts.length === 0) {
    dom.postList.innerHTML = '<article class="empty-card">No posts match this view yet.</article>';
    return;
  }

  dom.postList.innerHTML = sortedPosts
    .map((post) => {
      const imageMarkup = post.type === "image" && safeUrl(post.url) ? `<img alt="" src="${safeUrl(post.url)}">` : "";
      const currentVote = state.postVotes.get(post.id) || 0;
      const isSaved = state.savedPosts.has(post.id);
      const isActive = post.id === state.selectedPostId;

      return `
        <article class="post-card ${isActive ? "is-active" : ""}" data-post-id="${post.id}" tabindex="0">
          <div class="post-top">
            <div>
              <p class="feed-meta">g/${escapeHtml(post.gallery?.slug || "unknown")}</p>
              <h3 class="post-title">${escapeHtml(post.title)}</h3>
            </div>
            <div class="post-badges">
              ${post.is_pinned ? '<span class="post-badge badge-gold">pinned</span>' : ""}
              ${post.is_locked ? '<span class="post-badge badge-danger">locked</span>' : ""}
              ${post.is_nsfw ? '<span class="post-badge badge-danger">nsfw</span>' : ""}
              <span class="post-badge">${escapeHtml(post.type)}</span>
            </div>
          </div>
          ${imageMarkup}
          <p class="post-excerpt">${escapeHtml(trimText(post.body || "No body text.", 220))}</p>
          ${renderPostLink(post)}
          <div class="post-footer">
            <div class="meta-pills">
              <span class="post-badge">${formatSigned(post.score)} score</span>
              <span class="post-badge">${formatCount(post.comment_count)} comments</span>
              <span class="post-badge">${escapeHtml(displayName(post.author))}</span>
            </div>
            <span class="muted-inline">${timeAgo(post.created_at)}</span>
          </div>
          <div class="post-actions">
            <button class="vote-button ${currentVote === 1 ? "is-active" : ""}" data-post-action="vote" data-post-id="${post.id}" data-vote="1" type="button">Up</button>
            <button class="vote-button ${currentVote === -1 ? "is-active" : ""}" data-post-action="vote" data-post-id="${post.id}" data-vote="-1" type="button">Down</button>
            <button class="mini-button" data-post-action="open" data-post-id="${post.id}" type="button">Thread</button>
            <button class="save-button ${isSaved ? "is-active" : ""}" data-post-action="save" data-post-id="${post.id}" type="button">${isSaved ? "Saved" : "Save"}</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderAccount() {
  if (!state.session?.user) {
    dom.authHeading.textContent = "Guest mode";
    dom.authStateBadge.textContent = "disconnected";
    dom.profileCard.innerHTML = `
      <strong>No session</strong>
      <p>Public reads work without login. Sign in to create galleries, publish posts, vote, and leave comments.</p>
    `;
    return;
  }

  dom.authHeading.textContent = "Signed in";
  dom.authStateBadge.textContent = state.profile?.role || "user";
  dom.profileCard.innerHTML = `
    <div class="profile-top">
      <div>
        <p class="feed-meta">${escapeHtml(state.profile?.username ? `@${state.profile.username}` : state.session.user.email || "member")}</p>
        <div class="profile-name">${escapeHtml(state.profile?.display_name || state.session.user.email || "Member")}</div>
      </div>
      <span class="post-badge">${formatSigned(state.profile?.reputation || 0)} rep</span>
    </div>
    <p>${escapeHtml(state.profile?.bio || "Add a bio so your posts and comments feel anchored.")}</p>
  `;

  dom.profileUsername.value = state.profile?.username || "";
  dom.profileDisplayName.value = state.profile?.display_name || "";
  dom.profileBio.value = state.profile?.bio || "";
}

function renderThread() {
  const post = getSelectedPost();
  const replyToComment = state.comments.find((comment) => comment.id === state.replyParentId);

  dom.commentTargetLabel.textContent = replyToComment
    ? `Reply to ${displayName(replyToComment.author)}`
    : "Comment";

  if (!post) {
    dom.threadHeading.textContent = "Select a post";
    dom.threadState.innerHTML = "Open a feed card to inspect the full post body and comments.";
    dom.commentList.innerHTML = "";
    return;
  }

  dom.threadHeading.textContent = trimText(post.title, 44);
  dom.threadState.innerHTML = `
    <article class="thread-post">
      <div class="post-top">
        <div>
          <p class="feed-meta">g/${escapeHtml(post.gallery?.slug || "unknown")}</p>
          <h3 class="thread-title">${escapeHtml(post.title)}</h3>
        </div>
        <div class="post-badges">
          <span class="post-badge">${formatSigned(post.score)} score</span>
          <span class="post-badge">${formatCount(post.comment_count)} comments</span>
        </div>
      </div>
      <p class="post-excerpt">by ${escapeHtml(displayName(post.author))} | ${timeAgo(post.created_at)} | ${escapeHtml(post.type)}</p>
      ${post.type === "image" && safeUrl(post.url) ? `<img alt="" src="${safeUrl(post.url)}">` : ""}
      <p class="comment-body">${escapeHtml(post.body || "No body text.").replace(/\n/g, "<br>")}</p>
      ${renderPostLink(post)}
    </article>
  `;

  if (state.comments.length === 0) {
    dom.commentList.innerHTML = '<article class="empty-card">No comments yet. Start the thread.</article>';
    return;
  }

  dom.commentList.innerHTML = state.comments
    .map((comment) => {
      const currentVote = state.commentVotes.get(comment.id) || 0;

      return `
        <article class="comment-card" style="--depth:${comment.depth}">
          <div class="comment-top">
            <div class="comment-meta">
              <span class="comment-badge badge-accent">${escapeHtml(displayName(comment.author))}</span>
              <span class="comment-badge">${formatSigned(comment.score)} score</span>
              <span class="comment-badge">${timeAgo(comment.created_at)}</span>
            </div>
            ${comment.parent_id ? '<span class="comment-badge">reply</span>' : '<span class="comment-badge">root</span>'}
          </div>
          <p class="comment-body">${escapeHtml(comment.body).replace(/\n/g, "<br>")}</p>
          <div class="comment-actions">
            <button class="vote-button ${currentVote === 1 ? "is-active" : ""}" data-comment-action="vote" data-comment-id="${comment.id}" data-vote="1" type="button">Up</button>
            <button class="vote-button ${currentVote === -1 ? "is-active" : ""}" data-comment-action="vote" data-comment-id="${comment.id}" data-vote="-1" type="button">Down</button>
            <button class="mini-button" data-comment-action="reply" data-comment-id="${comment.id}" type="button">Reply</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function setAuthMode(mode) {
  state.authMode = mode;
  dom.authSubmitButton.textContent = mode === "signup" ? "Create account" : "Sign in";
  dom.authPassword.autocomplete = mode === "signup" ? "new-password" : "current-password";
  dom.displayNameField.hidden = mode !== "signup";

  Array.from(dom.authModeTabs.querySelectorAll("[data-auth-mode]")).forEach((button) => {
    button.classList.toggle("is-active", button.dataset.authMode === mode);
  });
}

function applyConfigBadge() {
  if (!supabaseUrl || !supabaseKey) {
    dom.configBadge.textContent = "config missing";
    return;
  }

  dom.configBadge.textContent = supabaseKey.startsWith("sb_publishable_") ? "publishable key" : "anon key";
}

function getVisiblePosts() {
  const query = state.search;

  return [...state.posts]
    .filter((post) => {
      if (!query) {
        return true;
      }

      const haystack = [
        post.title,
        post.body,
        post.gallery?.name,
        post.gallery?.slug,
        post.author?.display_name,
        post.author?.username,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    })
    .sort(comparePosts);
}

function comparePosts(left, right) {
  if (left.is_pinned !== right.is_pinned) {
    return left.is_pinned ? -1 : 1;
  }

  if (state.sort === "new") {
    return new Date(right.created_at) - new Date(left.created_at);
  }

  if (state.sort === "top") {
    return right.score - left.score || new Date(right.created_at) - new Date(left.created_at);
  }

  return hotScore(right) - hotScore(left);
}

function hotScore(post) {
  const ageHours = Math.max(1, (Date.now() - new Date(post.created_at).getTime()) / 3600000);
  return post.score * 8 + post.comment_count * 3 - ageHours;
}

function getSelectedGallery() {
  return state.galleries.find((gallery) => gallery.id === state.selectedGalleryId) || null;
}

function getSelectedPost() {
  return state.posts.find((post) => post.id === state.selectedPostId) || null;
}

function setStatus(message, tone = "warning") {
  dom.statusMessage.textContent = message;
  dom.statusMessage.classList.remove("is-error", "is-success", "is-warning");

  if (tone === "error") {
    dom.statusMessage.classList.add("is-error");
  }

  if (tone === "success") {
    dom.statusMessage.classList.add("is-success");
  }

  if (tone === "warning") {
    dom.statusMessage.classList.add("is-warning");
  }
}

function setFormDisabled(form, disabled) {
  form.classList.toggle("disabled-panel", disabled);

  Array.from(form.elements).forEach((element) => {
    if (element.id === "cancelReplyButton") {
      element.disabled = !getSelectedPost();
      return;
    }

    element.disabled = disabled;
  });
}

function displayName(author) {
  return author?.display_name || author?.username || "Unknown member";
}

function renderPostLink(post) {
  const url = safeUrl(post.url);

  if (!url) {
    return "";
  }

  return `<a class="link-out" href="${url}" rel="noreferrer" target="_blank">${escapeHtml(url)}</a>`;
}

function slugify(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_ -]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeUrl(value) {
  if (!value) {
    return "";
  }

  try {
    const url = new URL(value);

    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.toString();
    }
  } catch (_error) {
    return "";
  }

  return "";
}

function trimText(value, length) {
  if (!value) {
    return "";
  }

  return value.length > length ? `${value.slice(0, length - 1)}...` : value;
}

function formatCount(value) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value || 0);
}

function formatSigned(value) {
  const number = Number(value || 0);
  return number > 0 ? `+${number}` : `${number}`;
}

function timeAgo(value) {
  const then = new Date(value).getTime();
  const diffSeconds = Math.round((then - Date.now()) / 1000);
  const ranges = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];

  for (const [unit, seconds] of ranges) {
    if (Math.abs(diffSeconds) >= seconds) {
      return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(Math.round(diffSeconds / seconds), unit);
    }
  }

  return "just now";
}
