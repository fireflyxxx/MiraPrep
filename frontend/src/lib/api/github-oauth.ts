const STATE_KEY = "miraprep.github.oauth.state";

/** 空值即未配置：登录页不渲染 GitHub 按钮，后端也会拒绝这条路径。 */
export function githubClientId(): string | undefined {
  return process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID || undefined;
}

/** GitHub 授权后跳回的地址，必须和 GitHub OAuth App 里登记的 callback URL 完全一致。 */
export function githubRedirectUri(): string {
  return `${window.location.origin}/auth/callback/github`;
}

/**
 * 跳去 GitHub 授权页。state 是随机值，存 sessionStorage 供回调页比对——攻击者写不了
 * 受害者的 sessionStorage，所以这一步就能挡住「把受害者登进攻击者账号」的登录 CSRF。
 */
export function startGitHubLogin(): void {
  const clientId = githubClientId();
  if (!clientId) return;

  const state = crypto.randomUUID();
  window.sessionStorage.setItem(STATE_KEY, state);

  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", githubRedirectUri());
  url.searchParams.set("scope", "user:email");
  url.searchParams.set("state", state);
  window.location.href = url.toString();
}

/** 取出并一次性消费 state：同一个 state 不允许被第二次回调复用。 */
export function consumeGitHubState(): string | null {
  const state = window.sessionStorage.getItem(STATE_KEY);
  window.sessionStorage.removeItem(STATE_KEY);
  return state;
}
