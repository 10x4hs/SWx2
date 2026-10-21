// 사용자 페이지(브리지)가 내 세션으로 부를 수 있는 앱 API 인지 — page-runner.js 가 써요. 막으면 그 까닭(글), 괜찮으면 null.
// 주소는 fetch 가 하듯 먼저 정리해 봐요: '/x/../auth' · '%2e%2e' 같은 점 조각으로 아래 검사를 비켜 가지 못하게 정리 전후가 같아야 해요.
export function pageApiBlock(method, path, readonly) {
  path = String(path || "");
  const bad = "이 주소는 페이지에서 못 써요.";
  if (!/^\/[\w\-./?=&%:,+@]*$/.test(path)) return bad;
  const u = new URL("/api" + path, "http://app.invalid");
  if (u.pathname + u.search !== "/api" + path) return bad;
  if (path.startsWith("/auth") || path.startsWith("/pages") || path.startsWith("/apikeys") || path.startsWith("/mcp")) return bad; // 페이지가 내 이름으로 키 · 토큰을 몰래 만들지 못하게
  // 일기: 친구 일기 · 일기 친구 초대(/diary/of · circle · invite · link)는 어떤 페이지에서도, 남이 공유한 페이지에선 내 일기도 못 써요
  //   (내 세션으로 남의 일기를 가져가거나, 몰래 초대를 수락시켜 내 일기를 열지 못하게)
  if (/^\/diary\/(?:of|circle|invite|link)\b/.test(path) || (readonly && path.startsWith("/diary"))) return "일기는 이 페이지에서 못 써요.";
  if (readonly && method !== "GET") return "남이 공유한 페이지는 읽기만 할 수 있어요.";
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) return "모르는 method";
  return null;
}
