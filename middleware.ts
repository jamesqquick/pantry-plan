import { auth } from "@/lib/auth";

const publicPaths = ["/", "/login", "/register"];

export default auth((req) => {
  const path = req.nextUrl.pathname;
  const isPublic = publicPaths.some((p) => path === p || path.startsWith(p + "/"));
  if (req.auth && isPublic) {
    return Response.redirect(new URL("/recipes", req.nextUrl.origin));
  }
  if (!req.auth && !isPublic) {
    const login = new URL("/login", req.nextUrl.origin);
    login.searchParams.set("callbackUrl", path);
    return Response.redirect(login);
  }
  return undefined;
});

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
